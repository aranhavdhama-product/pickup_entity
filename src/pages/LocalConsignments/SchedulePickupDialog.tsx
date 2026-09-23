/**
 * Schedule pickup — the Consignments page's bulk action (spec 2026-09-23 §3.1, C3/C5).
 *
 * The selection is re-read from the LIVE store by id on every render, so the
 * eligibility line, the grouping and the "existing request" lists always reflect
 * the store as it is now — not the moment the rows were ticked.
 *
 *   eligible  = `tabOf(order) === 'Ready for Pickup'` and no validation issue
 *   grouping  = `groupForPickup` (one card per pickup point → inbound hub; FTL alone)
 *   per card  = New pickup request | Add to existing (open PRs at that point,
 *               `canAddOrdersTo(pr, allowAddToExistingUntil)`)
 *
 * Booking a pickup does NOT touch the routing schedule (`planningActions.schedule`
 * → Secondary State "Scheduled"): the two are different steps with different
 * statuses. A booked consignment reads "Pickup Scheduled" off its open request.
 *
 * The default per card mirrors the store's own multi-PR merge rule
 * (`createPickupRequest`), so a card that says "New" is never silently merged
 * without the dialog saying so first.
 */
import { useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, Truck } from 'lucide-react'
import { Button, Input, MenuSelect, Modal } from '../../nueva/components'
import { useGrowOrders, growOrderActions, pickupRequestById } from '../../growOrders/store'
import type { GrowOrder, GrowPickupRequest, StoreLocation } from '../../growOrders/types'
import { canAddOrdersTo, isOverduePr, isPickupEligible, rangesOverlap } from '../../growOrders/tabs'
import { earliestWindow, pickupPolicy, violatesCutoff, windowLabel, type PickupPolicy } from '../../growOrders/pickupSlots'
import { usePickupModuleConfig } from '../../config/pickupModule'
import { groupForPickup, storeAddress, storeName, type PickupGroup } from '../GrowOrders/utils'
import { consignmentStateOf, toConsignmentRow, totalWeightKg } from '../LocalPFP/adapter'
import { usePlanning } from '../LocalPFP/planningStore'

/** What one confirmed card produced — the page renders these as links. */
export interface ScheduleResult {
  prId: string
  number: string
  /** new = a fresh request; merged = the multi-PR policy folded it into one; added = the user chose it */
  kind: 'new' | 'merged' | 'added'
  count: number
}

type Choice = { mode: 'new' } | { mode: 'existing'; prId: string }

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`

/** The merchant as the consignment row names it — the key this page filters on. */
const merchantOf = (o: GrowOrder, stores: StoreLocation[]) =>
  stores.find((s) => s.code === o.storeCode)?.party.businessName || o.sender.businessName || o.storeCode

/** A PR at the SAME collection point as a store card: the store, no typed-in address. */
const atStorePoint = (p: GrowPickupRequest, storeCode: string) =>
  p.storeCode === storeCode && !(p.shipFrom?.line1 ?? '').trim()

/**
 * The request `createPickupRequest` would merge this group into, restated from
 * the store so the dialog can say it BEFORE confirming. Keep in step with
 * `growOrderActions.createPickupRequest`.
 */
function mergeTargetFor(
  g: PickupGroup, prs: GrowPickupRequest[], policy: PickupPolicy, startAt: string, endAt: string,
): GrowPickupRequest | undefined {
  if (g.vehicle || policy.multiPrPolicy === 'UNLIMITED') return undefined
  return prs
    .filter((p) => atStorePoint(p, g.storeCode) && p.shipmentType !== 'FTL'
      && canAddOrdersTo(p, policy.allowAddToExistingUntil)
      && (p.destinationCode ?? null) === g.destinationCode
      && (policy.multiPrPolicy === 'ONE_OPEN_PER_LOCATION' || rangesOverlap(startAt, endAt, p.startAt, p.endAt)))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0]
}

export function SchedulePickupDialog({ orderIds, onClose, onDone }: {
  orderIds: string[]
  onClose: () => void
  /** `failed` = numbers of existing requests that refused the consignments */
  onDone: (results: ScheduleResult[], failed: string[]) => void
}) {
  const db = useGrowOrders()
  const plan = usePlanning()
  const cfg = usePickupModuleConfig()

  /* ------------------------------------------------ eligibility (live) --- */
  const { eligible, skipped } = useMemo(() => {
    const ok: GrowOrder[] = []
    const skip: { label: string; reason: string }[] = []
    orderIds.forEach((id) => {
      const o = db.orders.find((x) => x.id === id)
      if (!o) { skip.push({ label: id, reason: 'no longer exists' }); return }
      const pr = o.pickupRequestId ? db.pickupRequests.find((p) => p.id === o.pickupRequestId) : undefined
      const exception = toConsignmentRow(o, db, { exception: plan.exceptions[o.id] }).exception
      let reason = ''
      /* reasons speak the CONSOLE's vocabulary (consignment state), never the
         merchant portal's payment status */
      if (o.status === 'Cancelled') reason = 'cancelled'
      else if (o.pickupRequestId) reason = `already in pickup ${pr?.number ?? 'request'}`
      else if (!isPickupEligible(o)) reason = `state ${consignmentStateOf(o)} — past first mile`
      else if (exception) reason = `data validation issue (${exception})`
      if (reason) skip.push({ label: o.orderNumber, reason })
      else ok.push(o)
    })
    return { eligible: ok, skipped: skip }
  }, [orderIds, db, plan.exceptions])

  const groups = useMemo(() => groupForPickup(eligible, db.stores), [eligible, db.stores])

  /* one policy for the shared window: the merchant's when the selection has
     one merchant, the account's otherwise */
  const merchants = useMemo(() => [...new Set(eligible.map((o) => merchantOf(o, db.stores)))], [eligible, db.stores])
  const windowMerchant = merchants.length === 1 ? merchants[0] : null
  /* read every render: cheap, and `usePickupModuleConfig` above re-renders on a config change */
  const policy = pickupPolicy(windowMerchant)

  const [initial] = useState(() => earliestWindow(new Date(), pickupPolicy(windowMerchant)))
  const [startAt, setStartAt] = useState(initial.startAt)
  const [endAt, setEndAt] = useState(initial.endAt)
  const [instructions, setInstructions] = useState('')
  const [choices, setChoices] = useState<Record<string, Choice>>({})
  const [open, setOpen] = useState<Record<string, boolean>>({})

  const now = new Date()
  const cutoffError = startAt ? violatesCutoff(startAt, now, policy) : 'Pick a start time'
  const orderError = !endAt ? 'Pick an end time' : endAt <= startAt ? 'The window must end after it starts' : null
  const windowError = cutoffError || orderError

  /* ------------------------------------------------------- per card ---- */
  const cards = groups.map((g) => {
    const merchant = merchantOf(g.orders[0], db.stores)
    const gPolicy = pickupPolicy(merchant)
    const candidates = g.vehicle ? [] : db.pickupRequests
      .filter((p) => atStorePoint(p, g.storeCode) && p.shipmentType !== 'FTL'
        && canAddOrdersTo(p, cfg.allowAddToExistingUntil)
        /* a request whose window has already closed is overdue — not a van to join */
        && !isOverduePr(p, now)
        && (p.destinationCode == null || p.destinationCode === g.destinationCode))
      .sort((a, b) => a.startAt.localeCompare(b.startAt))
    const target = mergeTargetFor(g, db.pickupRequests, gPolicy, startAt, endAt)
    const picked = choices[g.key]
    const choice: Choice = picked && (picked.mode === 'new' || candidates.some((p) => p.id === picked.prId))
      ? picked
      : target && candidates.some((p) => p.id === target.id) ? { mode: 'existing', prId: target.id } : { mode: 'new' }
    const weight = Math.round(g.orders.reduce((n, o) => n + totalWeightKg(o), 0) * 10) / 10
    return { g, merchant, candidates, target, choice, weight }
  })

  const needsWindow = cards.some((c) => c.choice.mode === 'new')
  const canConfirm = cards.length > 0 && !(needsWindow && windowError)

  const confirm = () => {
    const results: ScheduleResult[] = []
    const failed: string[] = []
    cards.forEach(({ g, merchant, choice }) => {
      const ids = g.orders.map((o) => o.id)
      if (choice.mode === 'existing') {
        const { added } = growOrderActions.addOrdersToPickup(choice.prId, ids)
        const pr = pickupRequestById(choice.prId)
        if (!added.length || !pr) { failed.push(pr?.number ?? 'a pickup request'); return }
        results.push({ prId: pr.id, number: pr.number, kind: 'added', count: added.length })
        return
      }
      const pr = growOrderActions.createPickupRequest({
        storeCode: g.storeCode, destinationCode: g.destinationCode, orderIds: ids,
        instructions: instructions.trim() || undefined, vehicle: g.vehicle,
        source: 'Console', merchantCode: merchant, startAt, endAt,
      })
      if (!pr) { failed.push('a new pickup (validation errors)'); return }
      results.push({ prId: pr.id, number: pr.number, kind: pr.merged ? 'merged' : 'new', count: ids.length - pr.skipped.length })
    })
    onDone(results, failed)
  }

  const total = eligible.length

  return (
    <Modal open title="Schedule pickup" onClose={onClose} wide
      footer={<>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button disabled={!canConfirm} icon={<Truck size={14} />} onClick={confirm}>
          {cards.length === 0 ? 'Schedule' : `Schedule ${plural(cards.length, 'pickup')}`}
        </Button>
      </>}>
      <div className="flex flex-col gap-4 pb-3">
        <p className="-mt-2 text-[12.5px] text-ink-3">Book a pickup for the selected shipments.</p>

        {skipped.length > 0 && (
          <p className="rounded-md border border-line bg-warm-50 px-3 py-2 text-[12.5px] text-ink-3">
            <span className="font-bold text-ink-2">Skipped {skipped.length}: </span>
            {skipped.map((s) => `${s.label} — ${s.reason}`).join(' · ')}
          </p>
        )}

        {cards.length === 0 ? (
          <p className="rounded-md border border-dashed border-line px-3 py-4 text-[13px] text-ink-3">
            None of the selected shipments needs a pickup. Schedule Pickup books the first-mile collection for shipments in state
            <span className="font-bold text-ink-2"> Created</span> that are not yet in a pickup request. To schedule shipments that are
            already booked or collected, use <span className="font-bold text-ink-2">Schedule Routing</span>.
          </p>
        ) : (
          <>
            <p className="text-[13px] text-ink">
              <span className="font-bold">{plural(cards.length, 'pickup')}</span>
              <span className="text-ink-3"> · {plural(total, 'shipment')} · one per pickup address and inbound hub{cards.some((c) => c.g.vehicle) ? ', FTL on its own' : ''}</span>
            </p>
            <div className="flex flex-col gap-2">
              {cards.map(({ g, candidates, target, choice, weight }) => {
                const expanded = !!open[g.key]
                const setChoice = (c: Choice) => setChoices((m) => ({ ...m, [g.key]: c }))
                return (
                  <div key={g.key} className="rounded-md border border-line bg-surface">
                    <div className="flex items-start gap-3 px-4 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-bold text-ink">
                          {storeName(g.storeCode, db.stores)} <span className="text-ink-3">→</span> {g.destinationLabel || 'To be confirmed'}
                          {g.vehicle && <span className="ml-2 text-[12px] font-bold text-ink-3">FTL · {g.vehicle.vehicleType || 'Vehicle'}</span>}
                        </p>
                        <p className="mt-0.5 truncate text-[12.5px] text-ink-3">{storeAddress(g.storeCode, db.stores)}</p>
                        <button type="button" onClick={() => setOpen((m) => ({ ...m, [g.key]: !expanded }))}
                          className="mt-1 inline-flex items-center gap-1 text-[12.5px] font-bold text-ink-2 hover:text-ink">
                          {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                          {plural(g.orders.length, 'shipment')} · {weight} kg
                        </button>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-2">
                        {/* segmented choice */}
                        <div className="inline-flex rounded-md border border-warm-300 p-0.5" role="radiogroup">
                          {([['new', 'New pickup request'], ['existing', 'Add to existing']] as const).map(([mode, label]) => {
                            const active = choice.mode === mode
                            const disabled = mode === 'existing' && candidates.length === 0
                            return (
                              <button key={mode} type="button" role="radio" aria-checked={active} disabled={disabled}
                                title={disabled ? (g.vehicle ? 'FTL bookings are always their own request' : 'No open pickup request at this address can take more shipments') : undefined}
                                onClick={() => setChoice(mode === 'new' ? { mode: 'new' }
                                  : { mode: 'existing', prId: (candidates.find((p) => p.id === target?.id) ?? candidates[0]).id })}
                                className={`h-7 rounded px-2.5 text-[12px] font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-50
                                  ${active ? 'bg-brand-50 text-brand-500' : 'text-ink-2 hover:bg-warm-50'}`}>
                                {label}
                              </button>
                            )
                          })}
                        </div>
                        {choice.mode === 'existing' && (
                          <div className="w-80">
                            <MenuSelect value={choice.prId} options={candidates.map((p) => p.id)}
                              labels={(id) => {
                                const p = candidates.find((x) => x.id === id)
                                return p ? `${p.number} · ${windowLabel(p)} · ${plural(p.orderIds.length, 'order')}` : id
                              }}
                              onChange={(id) => setChoice({ mode: 'existing', prId: id })} />
                          </div>
                        )}
                        {choice.mode === 'new' && target && (
                          <p className="max-w-80 text-right text-[12px] text-ink-3">
                            The pickup policy adds these to {target.number} (same {pickupPolicy(merchantOf(g.orders[0], db.stores)).multiPrPolicy === 'ONE_OPEN_PER_LOCATION' ? 'address' : 'slot'}).
                          </p>
                        )}
                      </div>
                    </div>
                    {expanded && (
                      <div className="border-t border-line px-4 py-2">
                        {g.orders.map((o) => (
                          <div key={o.id} className="flex items-center gap-3 py-1 text-[12.5px]">
                            <span className="w-40 shrink-0 font-mono font-bold text-ink">{o.orderNumber}</span>
                            <span className="min-w-0 flex-1 truncate text-ink-2">{o.receiver.name || '—'}</span>
                            <span className="shrink-0 text-ink-3">{totalWeightKg(o)} kg</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {/* the window applies to every NEW request; an existing one keeps its own */}
            <div className={needsWindow ? '' : 'opacity-60'}>
              <div className="grid grid-cols-2 gap-4">
                <label className="block">
                  <span className="mb-1 block text-[12px] font-bold text-ink-2">Window start <span className="text-brand-500">*</span></span>
                  <Input type="datetime-local" value={startAt} onChange={setStartAt} disabled={!needsWindow} />
                </label>
                <label className="block">
                  <span className="mb-1 block text-[12px] font-bold text-ink-2">Window end <span className="text-brand-500">*</span></span>
                  <Input type="datetime-local" value={endAt} onChange={setEndAt} disabled={!needsWindow} />
                </label>
              </div>
              {needsWindow && windowError && <p className="mt-1.5 text-[12.5px] font-bold text-danger-fg">{windowError}</p>}
              {/* the standing cutoff / earliest-window rule line was removed by the
                  owner; the cutoff ERROR above and the earliest-window prefill stay */}
              {!needsWindow && (
                <p className="mt-1.5 text-[12px] text-ink-3">Every card joins an existing request, which keeps its own window.</p>
              )}
            </div>

            <label className="block">
              <span className="mb-1 block text-[12px] font-bold text-ink-2">Instructions</span>
              <textarea value={instructions} onChange={(e) => setInstructions(e.target.value)} rows={3}
                placeholder="Gate code, dock number, contact on arrival…"
                className="w-full rounded-md border border-warm-300 bg-surface px-3 py-2 text-[13px] text-ink placeholder:text-warm-400
                           focus:border-brand-500 focus:outline-none focus:ring-[3px] focus:ring-brand-500/20 transition-shadow" />
            </label>
          </>
        )}
      </div>
    </Modal>
  )
}
