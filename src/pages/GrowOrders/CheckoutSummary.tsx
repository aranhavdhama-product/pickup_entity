/**
 * Checkout (Grow step 2 · Service & payment) — the ORDER SUMMARY: ONE compact read-only card of what the form
 * collected (owner, 2026-10-06: "in second screen not so many values"): order number · Ship From → Ship To ·
 * packages or vehicles · value-added services · what the order is for (a pickup request / an overage scan), and
 * the service only when the form hides Service Type (nothing to choose on this screen then). A value that is
 * empty is not shown. Edit goes back to step 1 (the form restores the session draft). Nothing here writes anything.
 *
 * `rail` (owner, 2026-10-07: "a richer order summary on the right"): the same card as one vertical list in the page's
 * right rail, above the Payment Summary — it also reads back the chosen service, the payment mode (+ COD amount) and
 * the remarks that step 1 collected.
 */
import type { ReactNode } from 'react'
import { Pencil } from 'lucide-react'
import { Button, Panel } from '../../nueva/components'
import { vehiclesOf, type OrderDraft } from '../../growOrders/draft'
import { chargeableKg } from '../../growOrders/rates'
import type { Party } from '../../growOrders/types'
import { stamp } from '../LocalPFP/overlayFormat'
import { MGrid } from './merchantFormBits'

/* ----------------------------------------------------------------- pieces --- */

function Card({ title, onEdit, children }: { title: string; onEdit: () => void; children: ReactNode }) {
  return (
    <Panel>
      <div className="flex items-center justify-between gap-3 px-5 pt-4">
        <h3 className="text-[15px] font-bold text-ink">{title}</h3>
        <Button variant="text" size="sm" icon={<Pencil size={12} />} onClick={onEdit}>Edit</Button>
      </div>
      <div className="px-5 pb-5 pt-3">{children}</div>
    </Panel>
  )
}

/** A label-above value, like the merchant order form read back. Renders nothing for an empty value. */
function Item({ label, children }: { label: string; children: ReactNode }) {
  if (children === undefined || children === null || children === false || children === '') return null
  return (
    <div className="min-w-0">
      <p className="mb-1 truncate text-[12px] font-bold text-ink-2" title={label}>{label}</p>
      <div className="break-words text-[13px] text-ink">{children}</div>
    </div>
  )
}

const windowText = (start?: string, end?: string) => (start || end ? `${start ? stamp(start) : '…'} → ${end ? stamp(end) : '…'}` : '')
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`
/** "Anuj Bhartia · San Pablo" — who and which city */
const who = (p: Party) => [p.name || p.businessName, p.city || p.state].filter(Boolean).join(' · ')

/** the page's three columns, or one vertical list in the right rail */
function Grid({ rail, children }: { rail: boolean; children: ReactNode }) {
  return rail ? <div className="grid gap-4">{children}</div> : <MGrid cols={3}>{children}</MGrid>
}

/* ------------------------------------------------------------------- card --- */

export function CheckoutSummary({ draft, onEdit, service, linked, rail = false, payment, remarks }: {
  draft: OrderDraft
  /** back to step 1 (the form) */
  onEdit: () => void
  /** the service — only when the form hides Service Type (nothing to choose on this screen) */
  service?: string
  /** what the order is for: "Pickup request PR-000104" · "Overage scan 2GO-OV-88213 · PR-000107" */
  linked?: string
  /** a vertical list for the right rail (default: three columns under the page header) */
  rail?: boolean
  /** "Prepaid" · "Cash on delivery · ₱ 500.00 collected" — what step 1 asked (rail only) */
  payment?: string
  /** the remarks typed on step 1 (rail only) */
  remarks?: string
}) {
  const cf = draft.consignment
  const ftl = draft.shipmentType === 'FTL'
  /* a full-vehicle booking keeps the packages the merchant listed in `sourceParcels` (`parcels` is one synthetic line) */
  const packages = ftl ? draft.sourceParcels ?? [] : draft.parcels
  const pieces = packages.reduce((n, p) => n + (p.quantity || 0), 0)
  const kg = chargeableKg(packages).chargeable
  const drops = [draft.receiver, ...draft.drops]
  const vs = ftl ? vehiclesOf(draft) : []
  const vehicleText = [...new Set(vs.map((v) => v.vehicleType))].map((t) => `${vs.filter((v) => v.vehicleType === t).length} × ${t}`).join(', ')
  const vas = [...new Set((cf?.vas ?? []).map((v) => v.service).filter(Boolean))]
  const pickup = windowText(draft.sender.windowStart, draft.sender.windowEnd)
  const goods = pieces ? `${plural(pieces, 'package')} · ${kg.toLocaleString()} kg` : ''

  return (
    <Card title="Order summary" onEdit={onEdit}>
      <Grid rail={rail}>
        <Item label="Order number">{cf?.orderNumber?.trim() || <span className="text-ink-3">Given when you place the order</span>}</Item>
        <Item label="Ship From">
          {who(draft.sender) || '—'}
          {pickup && <span className="block text-[12px] text-ink-3">Pickup {pickup}</span>}
        </Item>
        <Item label={drops.length > 1 ? `Ship To (${drops.length})` : 'Ship To'}>
          {who(draft.receiver) || '—'}
          {drops.length > 1 && <span className="text-ink-3"> + {drops.length - 1} more</span>}
        </Item>
        {ftl
          ? <Item label="Vehicles">{vehicleText && <>{vehicleText}{goods && <span className="block text-[12px] text-ink-3">{goods}</span>}</>}</Item>
          : <Item label="Packages">{goods}</Item>}
        <Item label="Service">{service}</Item>
        <Item label="Value-added services">{vas.join(', ')}</Item>
        {rail && <Item label="Payment mode">{payment}</Item>}
        {rail && <Item label="Remarks">{remarks}</Item>}
        <Item label="For">{linked}</Item>
      </Grid>
    </Card>
  )
}
