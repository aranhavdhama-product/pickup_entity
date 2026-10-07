/**
 * Create pickup (owner, 2026-10-05: "there should be pickup request and blind pickup request popups — simplify
 * them"). ONE button on the Pickup page and on Pending For Planning, in manual mode, with two choices:
 *
 *  - **Pickup request** — for consignments already created and waiting for a pickup (`isPickupEligible`, no
 *    console exception). The popup asks three things, top to bottom: the pickup address, which of its waiting
 *    consignments (all ticked), and the date + time. Booking = `bookGroup` per (address → hub) group, so a
 *    selection that drops at two hubs (or holds an FTL) becomes one request per group — the same rule as
 *    Schedule Pickup, the store's merge policy included.
 *  - **Blind pickup request** — a collection booked before the consignments exist (`CreatePickupDialog`).
 *    Only while Settings allow it (`blindPickupsAllowed`); otherwise the button opens Pickup request directly.
 *
 * This replaces the console Pickup page's old "Eligible consignments" tab as the place ops book waiting
 * consignments (Consignment Order → Schedule Pickup still does the same from a selection).
 */
import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, Plus } from 'lucide-react'
import { Button, Checkbox, Field, Input, MenuSelect, Modal } from '../../nueva/components'
import { toast } from '../../nueva/toast'
import { useGrowOrders } from '../../growOrders/store'
import type { GrowOrder, GrowPickupRequest } from '../../growOrders/types'
import { isPickupEligible } from '../../growOrders/tabs'
import { earliestWindow, pickupPolicy, violatesCutoff } from '../../growOrders/pickupSlots'
import { blindPickupsAllowed, usePickupModuleConfig } from '../../config/pickupModule'
import { groupForPickup, storeName } from '../GrowOrders/utils'
import { usePlanning } from '../LocalPFP/planningStore'
import { SlotWindowFields } from './slotFields'
import { bookGroup, type BookingOutcome } from './bookingPlan'
import { CreatePickupDialog } from './dialogs'
import { merchantOfStore } from './prModel'

export type CreatePickupKind = 'request' | 'blind'

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`
/** the weight the pickup pages show for a consignment (the request's Weight sums the same) */
const kgOf = (o: GrowOrder) => Math.round(((o.shipmentType === 'FTL' ? o.actualLoad ?? o.pkg.weightKg : o.pkg.weightKg) || 0) * 10) / 10

/** The consignments a Pickup request can book right now: ready, no pickup yet, no open console exception. */
function useWaitingConsignments(): GrowOrder[] {
  const db = useGrowOrders()
  const plan = usePlanning()
  return useMemo(() => db.orders.filter((o) => isPickupEligible(o) && !plan.exceptions[o.id]), [db.orders, plan.exceptions])
}

/** "Create pickup ▾" — the two choices; a single button when blind pickups are switched off. */
export function CreatePickupButton({ onPick }: { onPick: (k: CreatePickupKind) => void }) {
  const cfg = usePickupModuleConfig()
  const waiting = useWaitingConsignments().length
  const [open, setOpen] = useState(false)
  const blind = blindPickupsAllowed(cfg)
  useEffect(() => {
    if (!open) return
    const h = (e: MouseEvent) => { if (!(e.target as HTMLElement).closest('[data-create-pickup]')) setOpen(false) }
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('click', h); window.addEventListener('keydown', k)
    return () => { window.removeEventListener('click', h); window.removeEventListener('keydown', k) }
  }, [open])
  if (!blind) return <Button icon={<Plus size={15} />} onClick={() => onPick('request')}>Create pickup</Button>
  /* Create pickup OPENS the Blind pickup request (owner, 2026-10-07: "when clicking on add pickup, blind pickup request should open");
     the small arrow beside it keeps the other way — a Pickup request for the consignments already waiting */
  return (
    <div className="relative inline-flex" data-create-pickup>
      <Button icon={<Plus size={15} />} onClick={() => onPick('blind')}>Create pickup</Button>
      <button type="button" aria-label="More ways to create a pickup" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)}
        className="ml-1 inline-flex h-8 w-8 items-center justify-center rounded-md border border-line bg-surface text-ink-2 hover:bg-warm-50 hover:text-ink">
        <ChevronDown size={14} />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-full z-40 mt-2 w-[300px] rounded-lg border border-line bg-surface py-1.5 shadow-ds-overlay">
          <button type="button" role="menuitem" onClick={() => { setOpen(false); onPick('request') }}
            className="flex w-full items-start gap-3 px-3.5 py-2.5 text-left hover:bg-warm-50">
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-bold text-ink">Pickup request for waiting consignments</span>
              <span className="block text-[12px] text-ink-3">Book the consignments that have no pickup yet</span>
            </span>
            <span className="mt-0.5 rounded-full bg-warm-100 px-2 text-[11px] font-bold leading-5 text-ink-2">{waiting}</span>
          </button>
        </div>
      )}
    </div>
  )
}

/** Mount once per page: renders the popup the button picked. `onCreated` gets every request made. */
export function CreatePickupDialogs({ kind, onClose, onCreated }: {
  kind: CreatePickupKind | null; onClose: () => void; onCreated: (prs: GrowPickupRequest[]) => void
}) {
  const cfg = usePickupModuleConfig()
  if (kind === 'request') return <NewPickupRequestDialog onClose={onClose} onDone={(prs) => { onClose(); onCreated(prs) }} />
  if (kind === 'blind' && blindPickupsAllowed(cfg)) return (
    <CreatePickupDialog onClose={onClose}
      onDone={(prs) => {
        onClose()
        toast.success(prs.length === 1 ? `Blind pickup ${prs[0].number} created` : `Blind pickups ${prs.map((p) => p.number).join(', ')} created`)
        onCreated(prs)
      }} />
  )
  return null
}

/**
 * Pickup request — address → consignments → date and time. Nothing else is asked: the hub comes from each
 * consignment, the merchant from the address, the rules (horizon, cut-off, pickup days) from Settings.
 */
export function NewPickupRequestDialog({ onClose, onDone }: { onClose: () => void; onDone: (prs: GrowPickupRequest[]) => void }) {
  const db = useGrowOrders()
  const waiting = useWaitingConsignments()
  /* frozen when the popup opens — rows must not vanish under the cursor */
  const [pool] = useState(waiting)
  const points = useMemo(() => {
    const m = new Map<string, GrowOrder[]>()
    pool.forEach((o) => m.set(o.storeCode, [...(m.get(o.storeCode) ?? []), o]))
    return [...m.entries()].sort((a, b) => b[1].length - a[1].length)
  }, [pool])
  const [point, setPoint] = useState(points[0]?.[0] ?? '')
  const rows = useMemo(() => points.find(([c]) => c === point)?.[1] ?? [], [points, point])
  const [picked, setPicked] = useState<Set<string>>(() => new Set(points[0]?.[1].map((o) => o.id) ?? []))
  const chosen = rows.filter((o) => picked.has(o.id))
  const groups = useMemo(() => groupForPickup(chosen, db.stores), [chosen, db.stores])
  const merchant = point ? merchantOfStore(point, db.stores) : null
  const policies = (groups.length ? groups : [{ storeCode: point, destinationCode: null }])
    .map((g) => pickupPolicy(merchant, { pickupLocationCode: g.storeCode, hubCode: g.destinationCode }))
  const [w, setW] = useState(() => earliestWindow(new Date(), pickupPolicy(merchant, { pickupLocationCode: point || null, hubCode: null })))
  const [note, setNote] = useState('')
  const now = new Date()
  const ruleError = (s: string, e: string) => policies.map((p) => violatesCutoff(s, now, p, e)).find(Boolean) ?? null
  const winError = !w.startAt || !w.endAt ? 'Pick a date, a start time and an end time'
    : w.endAt <= w.startAt ? 'The end time must be after the start time' : ruleError(w.startAt, w.endAt)

  const pickPoint = (code: string) => {
    setPoint(code)
    setPicked(new Set(points.find(([c]) => c === code)?.[1].map((o) => o.id) ?? []))
  }
  const toggle = (id: string) => setPicked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const allOn = rows.length > 0 && chosen.length === rows.length
  const toggleAll = () => setPicked(allOn ? new Set() : new Set(rows.map((o) => o.id)))

  const submit = () => {
    if (!chosen.length || winError) return
    const failed: string[] = []
    const made: BookingOutcome[] = []
    groups.forEach((g) => made.push(...bookGroup(
      { storeCode: g.storeCode, destinationCode: g.destinationCode, orderIds: g.orders.map((o) => o.id), vehicle: g.vehicle },
      { mode: 'new' },
      { startAt: w.startAt, endAt: w.endAt, instructions: note.trim() || undefined, source: 'Console', merchantCode: merchant },
      failed)))
    if (failed.length) toast.error(`Not booked: ${failed.join(', ')}`)
    if (made.length) toast.success(`${plural(made.reduce((n, r) => n + r.count, 0), 'consignment')} booked — ${made.map((r) =>
      `${r.pr.number}${r.kind === 'merged' ? ' (joined)' : ''}`).join(', ')}`)
    onDone(made.map((r) => r.pr))
  }

  const requests = groups.length
  return (
    <Modal open wide title="New pickup request" onClose={onClose}
      footer={<>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={submit} disabled={!chosen.length || !!winError}>
          {requests > 1 ? `Create ${requests} pickup requests` : 'Create pickup request'}
        </Button>
      </>}>
      {!points.length ? (
        <p className="pb-6 pt-2 text-[13px] text-ink-3">No consignment is waiting for a pickup right now.</p>
      ) : (
        <div className="flex flex-col gap-5 pb-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Pickup address" required>
              <MenuSelect value={point} options={points.map(([c]) => c)} searchable onChange={pickPoint}
                labels={(c) => `${storeName(c, db.stores)} · ${plural(points.find(([x]) => x === c)?.[1].length ?? 0, 'consignment')}`} />
            </Field>
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-[13px] font-bold text-ink">Consignments</span>
              <span className="text-[12px] text-ink-3">{chosen.length} of {rows.length} · {Math.round(chosen.reduce((n, o) => n + kgOf(o), 0) * 10) / 10} kg</span>
            </div>
            <div className="max-h-[232px] overflow-y-auto rounded-md border border-line">
              <div role="button" tabIndex={-1} onClick={toggleAll}
                className="flex cursor-pointer items-center gap-3 border-b border-line bg-warm-25 px-3 py-2 text-[12px] font-bold text-ink-2">
                <span onClick={(e) => e.stopPropagation()}>
                  <Checkbox checked={allOn} indeterminate={!allOn && chosen.length > 0} onChange={toggleAll} />
                </span>
                Select all
              </div>
              {rows.map((o) => (
                <div key={o.id} role="button" tabIndex={-1} onClick={() => toggle(o.id)}
                  className="flex cursor-pointer items-center gap-3 border-b border-line px-3 py-2 text-[13px] last:border-0 hover:bg-warm-50">
                  <span onClick={(e) => e.stopPropagation()}><Checkbox checked={picked.has(o.id)} onChange={() => toggle(o.id)} /></span>
                  <span className="w-36 shrink-0 font-mono text-[12px] font-bold text-ink">{o.orderNumber}</span>
                  <span className="min-w-0 flex-1 truncate text-ink-2">{o.receiver.name || '—'}{o.receiver.city ? `, ${o.receiver.city}` : ''}</span>
                  {o.shipmentType === 'FTL' && <span className="shrink-0 text-[11px] font-bold text-ink-3">FTL</span>}
                  <span className="w-16 shrink-0 text-right tabular-nums text-ink-3">{kgOf(o)} kg</span>
                </div>
              ))}
            </div>
            {requests > 1 && (
              <p className="mt-1.5 text-[12px] text-ink-3">These go to {plural(requests, 'drop')} ({groups.map((g) => g.destinationLabel).join(', ')}) — one request each.</p>
            )}
          </div>

          <SlotWindowFields timeFields={false} startAt={w.startAt} endAt={w.endAt} onChange={setW} policy={policies[0]} calendars={policies}
            ok={(x) => !ruleError(x.startAt, x.endAt) && x.endAt > x.startAt} error={chosen.length ? winError : null} />

          <Field label="Note for the driver"><Input value={note} onChange={setNote} placeholder="Optional — gate code, dock, contact" /></Field>
        </div>
      )}
    </Modal>
  )
}
