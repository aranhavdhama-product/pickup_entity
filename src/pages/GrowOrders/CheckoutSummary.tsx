/**
 * Checkout, step 2 · Summary — a READ-ONLY review of the order the form collected and of how it is
 * paid, before "Place order". One white card per topic (15px bold title + an Edit text button):
 * Consignment · Ship From · Ship To (+ extra drops) · Vehicles / Packages (with their SKUs) · Service ·
 * Value-added services · Additional details · Remarks · Payment. A card with nothing to say is not shown.
 *
 * Edit on an ORDER card goes back to the consignment form (`onEditOrder`, the form restores the session
 * draft); Edit on Remarks / Payment goes back to step 1 (`onEditPayment`). Nothing here writes anything.
 */
import type { ReactNode } from 'react'
import { Pencil } from 'lucide-react'
import { Button, Panel, StatusPill } from '../../nueva/components'
import type { PaymentPart } from '../../growOrders/ledger'
import { vehiclesOf, type OrderDraft } from '../../growOrders/draft'
import type { Party } from '../../growOrders/types'
import { customFieldShown, customValueText } from '../LocalConsignments/formSetup'
import { stamp } from '../LocalPFP/overlayFormat'
import { MGrid } from './merchantFormBits'
import { partLabel } from './splitPayment'
import { money } from './utils'

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
function Item({ label, wide, children }: { label: string; wide?: boolean; children: ReactNode }) {
  if (children === undefined || children === null || children === false || children === '') return null
  return (
    <div className={`min-w-0 ${wide ? 'sm:col-span-2' : ''}`}>
      <p className="mb-1 truncate text-[12px] font-bold text-ink-2" title={label}>{label}</p>
      <div className="break-words text-[13px] text-ink">{children}</div>
    </div>
  )
}

const addressOf = (p: Party) => [p.line1, p.line2, p.line3, p.landmark, p.city, p.county, p.state, p.postalCode, p.country].filter(Boolean).join(', ')
const phoneOf = (p: Party) => (p.contactNumber ? `${p.countryCode ?? ''} ${p.contactNumber}`.trim() : '')
const windowText = (start?: string, end?: string) => (start || end ? `${start ? stamp(start) : '…'} → ${end ? stamp(end) : '…'}` : '')
const dayText = (v?: string) => {
  if (!v) return ''
  const d = new Date(`${v.slice(0, 10)}T00:00`)
  return Number.isNaN(d.getTime()) ? v : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`

/** Who and where: name · phone · address (+ company and email when given). */
function PartyFields({ p, title, window: win, windowLabel }: { p: Party; title?: string; window?: string; windowLabel?: string }) {
  return (
    <div className="flex flex-col gap-4">
      {title && <p className="text-[13px] font-bold text-ink">{title}</p>}
      <MGrid cols={2}>
        <Item label="Name">{p.name}</Item>
        <Item label="Company">{p.businessName}</Item>
        <Item label="Phone">{phoneOf(p)}</Item>
        <Item label="Email">{p.email}</Item>
        <Item label="Address" wide>{addressOf(p)}</Item>
        {windowLabel && <Item label={windowLabel} wide>{win}</Item>}
      </MGrid>
    </div>
  )
}

/* ------------------------------------------------------------------- cards -- */

export function CheckoutSummary({ draft, currency, remarks, paymentMode, codAmount, parts, payable, onEditOrder, onEditPayment }: {
  draft: OrderDraft; currency: string
  /** the remarks typed on step 1 */
  remarks: string
  paymentMode: string; codAmount: string
  parts: PaymentPart[]; payable: number
  onEditOrder: () => void; onEditPayment: () => void
}) {
  const cf = draft.consignment
  const ftl = draft.shipmentType === 'FTL'
  /* a whole vehicle for this consignment (the form's Load type) — a shared parcel may still carry an optional vehicle type */
  const fullVehicle = ftl || !!cf?.dedicateTruck
  const showVehicles = fullVehicle || !!draft.vehicles?.length
  /* a full-vehicle booking keeps the packages the merchant listed in `sourceParcels` (`parcels` is one synthetic line) */
  const packages = ftl ? draft.sourceParcels ?? [] : draft.parcels
  const drops = [draft.receiver, ...draft.drops]
  const rto = cf?.rtoMode === 'Use Different Address' && cf.rto ? cf.rto : null
  const vas = [...new Set((cf?.vas ?? []).map((v) => v.service).filter(Boolean))]
  const extra = (cf?.customFields ?? []).filter((f) => f.value !== '' && customFieldShown(f.key, 'grow'))
  const service = ftl ? draft.ftlServiceType || draft.service : draft.service
  const instructions = draft.instructions || cf?.specialInstructions

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <Card title="Consignment" onEdit={onEditOrder}>
        <MGrid cols={3}>
          <Item label="Order number">{cf?.orderNumber?.trim() || <span className="text-ink-3">Given when you place the order</span>}</Item>
          <Item label="Reference number">{cf?.referenceNumber?.trim()}</Item>
          <Item label="Type">{cf?.consignmentType || 'Forward'}</Item>
          <Item label="Ship-by date">{dayText(cf?.shipByDate)}</Item>
          <Item label="Load">{fullVehicle ? 'Full vehicle' : 'Shared'}</Item>
        </MGrid>
      </Card>

      {/* the two ends side by side — one glance, half the scroll */}
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Card title="Ship From" onEdit={onEditOrder}>
          <PartyFields p={draft.sender} windowLabel="Pickup window" window={windowText(draft.sender.windowStart, draft.sender.windowEnd)} />
        </Card>

        <Card title="Ship To" onEdit={onEditOrder}>
          <div className="flex flex-col gap-5">
            {drops.map((d, i) => (
              <PartyFields key={i} p={d} title={drops.length > 1 ? `Delivery address ${i + 1}` : undefined}
                windowLabel="Delivery window" window={windowText(d.windowStart, d.windowEnd)} />
            ))}
            {rto && <div className="border-t border-line pt-4"><PartyFields p={rto} title="Return to origin" /></div>}
          </div>
        </Card>
      </div>

      {showVehicles && (
        <Card title="Vehicles" onEdit={onEditOrder}>
          <div className="flex flex-col">
            {vehiclesOf(draft).map((v, i) => (
              <div key={i} className="flex flex-wrap items-baseline justify-between gap-x-4 border-t border-line py-2.5 first:border-t-0 first:pt-0 last:pb-0">
                <span className="text-[13px] font-bold text-ink">Vehicle {i + 1} · {v.vehicleType}</span>
                <span className="text-[13px] text-ink-2">
                  {v.actualLoadKg.toLocaleString()} kg
                  <span className="text-ink-3"> · {v.addressIdx.map((a) => `Address ${a + 1}`).join(', ')}</span>
                </span>
              </div>
            ))}
            {draft.additionalServices.length > 0 && (
              <p className="mt-3 text-[12px] text-ink-3">Extras: <span className="text-ink-2">{draft.additionalServices.join(', ')}</span></p>
            )}
          </div>
        </Card>
      )}

      {packages.length > 0 && (
        <Card title="Packages" onEdit={onEditOrder}>
          <div className="flex flex-col">
            {packages.map((p, i) => {
              const items = (p.items ?? []).filter((it) => it.name || it.skuCode)
              return (
                <div key={i} className="border-t border-line py-3 first:border-t-0 first:pt-0 last:pb-0">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4">
                    <span className="text-[13px] font-bold text-ink">
                      {p.packageTypeName || p.cargoType || 'Package'}
                      <span className="font-normal text-ink-3"> × {p.quantity}</span>
                    </span>
                    <span className="text-[12px] text-ink-3">
                      {[p.weight ? `${p.weight} kg each` : '', p.l && p.w && p.h ? `${p.l} × ${p.w} × ${p.h} cm` : ''].filter(Boolean).join(' · ')}
                    </span>
                  </div>
                  {items.length > 0 && (
                    <ul className="mt-2 flex flex-col gap-1">
                      {items.map((it, j) => (
                        <li key={j} className="flex items-baseline justify-between gap-4 text-[13px]">
                          <span className="min-w-0 truncate text-ink-2" title={it.name}>{it.name || it.skuCode}{it.skuCode && it.name && <span className="text-ink-3"> · {it.skuCode}</span>}</span>
                          <span className="shrink-0 tabular-nums text-ink-3">× {it.quantity}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )
            })}
          </div>
        </Card>
      )}

      <Card title="Service" onEdit={onEditOrder}>
        <MGrid cols={2}>
          <Item label="Service" wide>
            {service}
            {draft.etaDays > 0 && <span className="text-ink-3"> · Delivery by {plural(draft.etaDays, 'day')}</span>}
          </Item>
          <Item label="Delivery instructions" wide>{instructions}</Item>
        </MGrid>
      </Card>

      {vas.length > 0 && (
        <Card title="Value-added services" onEdit={onEditOrder}>
          <div className="flex flex-wrap gap-2">{vas.map((v) => <StatusPill key={v} label={v} />)}</div>
        </Card>
      )}

      {extra.length > 0 && (
        <Card title="Additional details" onEdit={onEditOrder}>
          <MGrid cols={2}>
            {extra.map((f) => <Item key={f.key} label={f.label}>{customValueText(f.kind, f.value)}</Item>)}
          </MGrid>
        </Card>
      )}

      {remarks.trim() && (
        <Card title="Remarks" onEdit={onEditPayment}>
          <p className="whitespace-pre-wrap break-words text-[13px] text-ink">{remarks.trim()}</p>
        </Card>
      )}

      <Card title="Payment" onEdit={onEditPayment}>
        <MGrid cols={2}>
          <Item label="Payment mode">{paymentMode}</Item>
          <Item label="COD amount">{paymentMode === 'COD' && Number(codAmount) > 0 ? money(Number(codAmount), currency) : ''}</Item>
        </MGrid>
        <div className="mt-4 flex flex-col text-[13px]">
          {parts.map((p) => (
            <div key={p.method} className="flex items-baseline justify-between gap-4 border-t border-line py-2.5">
              <span className="text-ink">
                {partLabel(p)}
                <span className="text-ink-3"> · {p.method === 'Pay later' ? 'billed later' : p.method === 'COD' ? 'paid on delivery' : 'paid now'}</span>
              </span>
              <span className="tabular-nums text-ink">{money(p.amount, currency)}</span>
            </div>
          ))}
          <div className="flex items-baseline justify-between gap-4 border-t border-line pt-3 text-[15px] font-bold text-ink">
            <span>Total</span><span className="tabular-nums">{money(payable, currency)}</span>
          </div>
        </div>
      </Card>
    </div>
  )
}
