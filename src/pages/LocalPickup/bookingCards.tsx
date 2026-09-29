/**
 * The three-way booking choice every booking card shows (owner, 2026-09-25):
 * New pickup request · Add to existing · Split into separate requests, plus
 * the existing-request select and the one-line consequence under it. The same
 * control on the console Schedule pickup / Book consignments dialogs and the
 * Grow Book a Pickup dialog. Rules: `bookingPlan.ts`.
 *
 * Split is never hidden or disabled: on a one-shipment card it is simply the
 * same as a new request, and the line under the control says so.
 */
import { useState, type ReactNode } from 'react'
import { Button, Checkbox, MenuSelect, Modal, Toggle } from '../../nueva/components'
import { toast } from '../../nueva/toast'
import { growOrderActions, useGrowOrders } from '../../growOrders/store'
import { earliestWindow, pickupPolicy, policyCheck, violatesCutoff } from '../../growOrders/pickupSlots'
import type { GrowOrder, GrowPickupRequest } from '../../growOrders/types'
import { SlotWindowFields } from './slotFields'
import type { BookingChoice } from './bookingPlan'

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`

export function BookingChoiceControl({ choice, onChange, candidates, shipments, ftl, labelOf, note }: {
  choice: BookingChoice
  onChange: (c: BookingChoice) => void
  /** Open requests this card may join (`joinCandidates` / `joinableFor`). */
  candidates: GrowPickupRequest[]
  /** How many consignments the card holds. */
  shipments: number
  ftl?: boolean
  /** How an existing request reads in the select. */
  labelOf: (p: GrowPickupRequest) => string
  /** Extra line under a New choice (e.g. the policy will merge it). */
  note?: ReactNode
}) {
  const options = [['new', 'New pickup request'], ['existing', 'Add to existing'], ['split', 'Split into separate requests']] as const
  return (
    <div className="flex shrink-0 flex-col items-end gap-2">
      <div className="inline-flex rounded-md border border-warm-300 p-0.5" role="radiogroup" aria-label="How to book these shipments">
        {options.map(([mode, label]) => {
          const active = choice.mode === mode
          const disabled = mode === 'existing' && candidates.length === 0
          const title = mode === 'existing'
            ? (disabled ? (ftl ? 'FTL bookings are always their own request' : 'No open pickup request at this address can take more shipments') : undefined)
            : mode === 'split' ? `One pickup request per shipment (${shipments})` : undefined
          return (
            <button key={mode} type="button" role="radio" aria-checked={active} disabled={disabled} title={title}
              onClick={() => onChange(mode === 'existing' ? { mode, prId: (candidates.find((p) => choice.mode === 'existing' && p.id === choice.prId) ?? candidates[0]).id } : { mode })}
              className={`h-7 rounded px-2.5 text-[12px] font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-50
                ${active ? 'bg-warm-50 text-ink' : 'text-ink-2 hover:bg-warm-50'}`}>
              {label}
            </button>
          )
        })}
      </div>
      {choice.mode === 'existing' && (
        <div className="w-80">
          <MenuSelect value={choice.prId} options={candidates.map((p) => p.id)}
            labels={(id) => { const p = candidates.find((x) => x.id === id); return p ? labelOf(p) : id }}
            onChange={(id) => onChange({ mode: 'existing', prId: id })} />
        </div>
      )}
      {choice.mode === 'split' && (
        <p className="max-w-80 text-right text-[12px] text-ink-3">
          {shipments > 1
            ? `${plural(shipments, 'pickup request')}, one per shipment — never merged.`
            : 'One shipment — split books it as its own new request.'}
        </p>
      )}
      {choice.mode === 'new' && note && <p className="max-w-80 text-right text-[12px] text-ink-3">{note}</p>}
    </div>
  )
}

/**
 * **Split pickup request** — move some of a request's consignments onto a NEW
 * request at the same pickup point and hub (`splitPickupRequest`). Same window
 * by default; "Different date / slot" offers the settings-derived fields. At
 * least one consignment must stay on the original. Shared by the console
 * detail page and the Grow request page.
 */
export function SplitPickupDialog({ pr, merchantCode, onClose, onDone }: {
  pr: GrowPickupRequest
  merchantCode?: string | null
  onClose: () => void
  onDone: (made: GrowPickupRequest) => void
}) {
  const db = useGrowOrders()
  const rows = pr.orderIds.map((id) => db.orders.find((o) => o.id === id)).filter((o): o is GrowOrder => !!o)
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [otherWindow, setOtherWindow] = useState(false)
  const policy = pickupPolicy(merchantCode, { pickupLocationCode: pr.storeCode, hubCode: pr.destinationCode })
  const [w, setW] = useState(() => earliestWindow(new Date(), policy))
  const ok = policyCheck(policy)
  const winErr = otherWindow ? violatesCutoff(w.startAt, new Date(), policy, w.endAt) : null
  const all = sel.size >= pr.orderIds.length
  const valid = sel.size > 0 && !all && !winErr
  const toggle = (id: string) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const submit = () => {
    const made = growOrderActions.splitPickupRequest(pr.id, [...sel], otherWindow ? w : undefined)
    if (!made) { toast.error(`${pr.number} can no longer be split.`); onClose(); return }
    toast.success(`${plural(sel.size, 'consignment')} split from ${pr.number} into ${made.number}.`)
    onDone(made)
  }
  return (
    <Modal open title="Split pickup request" subtitle={`${pr.number} · ${plural(pr.orderIds.length, 'consignment')} — move some onto a new request at the same pickup point.`}
      onClose={onClose}
      footer={<>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={submit} disabled={!valid}>{sel.size ? `Split ${plural(sel.size, 'consignment')} out` : 'Split'}</Button>
      </>}>
      <div className="flex flex-col gap-4 pb-3">
        <div className="rounded-md border border-line">
          {rows.map((o) => (
            <div key={o.id} className="flex items-center gap-3 border-b border-line px-3 py-2 text-[13px] last:border-0 hover:bg-warm-50">
              <Checkbox checked={sel.has(o.id)} onChange={() => toggle(o.id)} />
              <span className="w-40 shrink-0 font-mono text-[12px] font-bold text-ink">{o.orderNumber}</span>
              <span className="min-w-0 flex-1 truncate text-ink-2">{o.receiver.name || '—'}</span>
              <span className="shrink-0 text-ink-3">{o.pkg?.weightKg ?? 0} kg</span>
            </div>
          ))}
        </div>
        <p className={`text-[12.5px] ${all ? 'text-danger-fg' : 'text-ink-3'}`}>
          {all ? 'At least one consignment must stay on the original request.'
            : sel.size ? `${plural(sel.size, 'consignment')} move to a new request; ${plural(pr.orderIds.length - sel.size, 'consignment')} stay on ${pr.number}.`
              : 'Tick the consignments to move onto the new request.'}
          {pr.tripId ? ' The new request is not on a trip — it goes back to planning as Requested.' : ''}
        </p>
        <label className="inline-flex items-center gap-2 text-[13px] text-ink">
          <Toggle checked={otherWindow} onChange={setOtherWindow} /> Different date / slot for the new request
        </label>
        {otherWindow
          ? <SlotWindowFields startAt={w.startAt} endAt={w.endAt} onChange={setW} policy={policy} ok={ok} error={winErr} />
          : <p className="-mt-2 text-[12.5px] text-ink-3">Same window as {pr.number}.</p>}
      </div>
    </Modal>
  )
}
