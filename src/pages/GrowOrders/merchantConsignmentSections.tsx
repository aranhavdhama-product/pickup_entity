/**
 * The merchant's View Consignment body — the merchant ORDER FORM read back
 * (owner, 2026-09-25: "view consignment in Grow should be based on add
 * consignment form"). Same sections, same order, same field names as
 * `MerchantOrderForm`, read-only, built from the form's own pieces
 * (`MSection` cards, `MGrid` field grid, the `RateCard` service card), so the two screens read as one product:
 *
 *   Status (strip: state · master tracking number · carrier · pickup request)
 *   · Pickup from · Deliver to (+ Returns) · Order details · Packages
 *   · Value-added services · Service Type (card + charges; vehicles for FTL)
 *
 * A section, field or row with no data is not rendered at all — no "No …
 * available" placeholders. What the console shows beyond this (Load, attempts,
 * drivers, trips, hubs, routing times, carrier codes, category flags, notes,
 * customer feedback) is the carrier's business and has no home here.
 */
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Boxes, ClipboardList, FileText, Home, MapPin, Package, Truck, Wrench } from 'lucide-react'
import { SimpleTable, StatusPill } from '../../nueva/components'
import type { GrowOrder, Party } from '../../growOrders/types'
import { vehiclesOf, type Parcel } from '../../growOrders/draft'
import { deliveryDate, quoteService, vasPrice, volumetricKg, type RateCurrency } from '../../growOrders/rates'
import { stamp } from '../LocalPFP/overlayFormat'
import type { ReadSection } from '../LocalConsignments/ConsignmentView'
import { MGrid, MSection } from './merchantFormBits'
import { RateCard } from './serviceCards'
import { stateChipTone, type ShipmentRow } from './shipmentRows'
import { money } from './utils'

type Val = ReactNode | null | undefined | false
/** Keep only fields that carry a value. */
const has = (v: Val) => v !== null && v !== undefined && v !== false && v !== '' && v !== '—'

/*
 * Plain render helpers (not components) — this module exports a builder, so
 * react-refresh wants no component declarations beside it.
 */

/** A read-only field in the form's label-above grammar (12px bold ink-2 label, 13px value). */
const rField = (label: string, children: ReactNode, wide?: boolean) => (
    <div key={label} className={`min-w-0 ${wide ? 'sm:col-span-2' : ''}`}>
      <p className="mb-1 truncate text-[12px] font-bold text-ink-2" title={label}>{label}</p>
      <div className="break-words text-[13px] text-ink">{children}</div>
    </div>
)

/** A field grid of only the pairs that have a value; nothing at all when none does. */
function fields(pairs: [string, Val, boolean?][], cols: 2 | 3 | 4 = 4): ReactNode {
  const shown = pairs.filter(([, v]) => has(v))
  if (!shown.length) return null
  return <MGrid cols={cols}>{shown.map(([k, v, wide]) => rField(k, v, wide))}</MGrid>
}

const joinAddr = (p: Party) => [p.line1, p.line2, p.line3, p.landmark, p.city, p.county, p.state, p.postalCode, p.country].filter(Boolean).join(', ')
const windowText = (start?: string | null, end?: string | null) =>
  (start || end ? `${start ? stamp(start) : '…'} → ${end ? stamp(end) : '…'}` : '')
const yes = (b: boolean | undefined, label = 'Yes') => (b ? label : '')

/** A party as the form's address card reads it back: who, where, how to reach them. */
function partyBlock(p: Party, title?: string, key?: number): ReactNode {
  return (
    <div key={key} className="flex flex-col gap-4">
      {title && <p className="text-[13px] font-bold text-ink">{title}</p>}
      {fields([
        ['Name', p.name], ['Company Name', p.businessName],
        ['Contact Number', p.contactNumber], ['Email', p.email],
        ['Address', joinAddr(p), true],
        ['Floor', p.floorNumber], ['Lift Available', p.liftAvailable === undefined ? '' : p.liftAvailable ? 'Yes' : 'No'],
      ])}
    </div>
  )
}

/** The packages as the form collected them: the draft's parcels, else one line from the record. */
function parcelsOf(o: GrowOrder): Parcel[] {
  const d = o.draft
  const fromDraft = o.shipmentType === 'FTL' ? d?.sourceParcels : d?.parcels
  if (fromDraft?.length) return fromDraft
  const n = Math.max(1, o.pkg.count)
  return [{
    cargoType: o.pkg.cargoType || o.pkg.kind, itemInfo: o.pkg.description, quantity: n,
    weight: Math.round((o.pkg.weightKg / n) * 100) / 100, l: o.pkg.lengthCm, w: o.pkg.widthCm, h: o.pkg.heightCm,
    packageTypeName: o.pkg.packageType, items: o.pkg.items, description: o.pkg.description,
  }]
}

export function merchantReadSections(row: ShipmentRow, o: GrowOrder): ReadSection[] {
  const c = o.consignment ?? {}
  const cur = (o.currency === '$' ? '$' : '₱') as RateCurrency
  const ftl = o.shipmentType === 'FTL'
  const out: ReadSection[] = []

  /* ---------------------------------------------------------- status ---- */
  out.push({
    id: 'status', label: 'Status', icon: FileText,
    node: (
      <MSection id="read-status" title={<span className="flex items-center gap-2">
        <StatusPill label={row.state} tone={stateChipTone(row.state)} />
        {row.secondaryState && <span className="text-[13px] font-normal text-ink-2">{row.secondaryState}</span>}
      </span>}>
        {fields([
          ['Master Tracking Number', o.trackingNumber && <span className="font-mono">{o.trackingNumber}</span>],
          ['Carrier', row.carrier],
          ['Pickup Request', o.pickupRequestId && row.pickupRequestNumber
            ? <Link to={`/grow/orders/pickups/${o.pickupRequestId}`} className="font-mono font-bold text-brand-500 hover:underline">{row.pickupRequestNumber}</Link>
            : ''],
          ['Created At', stamp(o.createdAt)],
        ])}
      </MSection>
    ),
  })

  /* ----------------------------------------------------- pickup from ---- */
  out.push({
    id: 'pickup', label: 'Pickup from', icon: MapPin,
    node: (
      <MSection id="read-pickup" title="Pickup from">
        <div className="flex flex-col gap-4">
          {partyBlock(o.sender)}
          {fields([['Pickup window', windowText(row.pickupWindow?.start ?? o.sender.windowStart, row.pickupWindow?.end ?? o.sender.windowEnd), true]])}
        </div>
      </MSection>
    ),
  })

  /* ------------------------------------------------------ deliver to ---- */
  const drops = [o.receiver, ...o.drops]
  const rto = c.rtoMode === 'Use Different Address' && c.rto ? c.rto : null
  out.push({
    id: 'deliver', label: 'Deliver to', icon: Home,
    node: (
      <MSection id="read-deliver" title="Deliver to">
        <div className="flex flex-col gap-5">
          {drops.map((d, i) => (
            partyBlock(d, drops.length > 1 ? `Delivery address ${i + 1}` : undefined, i)
          ))}
          {fields([['Delivery window', windowText(row.deliveryWindow?.start ?? o.receiver.windowStart, row.deliveryWindow?.end ?? o.receiver.windowEnd), true]])}
          {(rto || c.rtoMode) && (
            <div className="border-t border-line pt-4">
              {rto ? partyBlock(rto, 'Returns (RTO) · Different address')
                : fields([['Returns (RTO)', c.rtoMode === 'Same As Ship From' ? 'Same as pickup address' : c.rtoMode]])}
            </div>
          )}
        </div>
      </MSection>
    ),
  })

  /* --------------------------------------------------- order details ---- */
  const amount = c.orderAmount ?? (o.codAmount || null)
  const instructions = c.specialInstructions || o.remarks
  out.push({
    id: 'order', label: 'Order details', icon: ClipboardList,
    node: (
      <MSection id="read-order" title="Order details">
        {fields([
          ['Order Number', row.orderNumber], ['Reference Number', row.referenceNumber !== row.orderNumber ? row.referenceNumber : ''],
          ['Consignment Type', c.consignmentType || row.orderTypeLabel], ['Ship By Date', c.shipByDate || row.shipByDate],
          ['Payment Mode', c.paymentMode || o.paymentMode], ['Order Amount', amount != null ? money(amount, cur) : ''],
          ['Payment Status', o.paymentStatus], ['Label file type', c.labelFormat],
          ['Barcode labels on boxes', yes(c.scannable)], ['Can be delivered in parts', yes(c.splittable)],
          ['Scheduling Confirmation Required', yes(c.schedulingConfirmation)], ['Clearance Required', yes(c.clearanceRequired)],
          ['Special instructions', instructions, true],
        ])}
      </MSection>
    ),
  })

  /* -------------------------------------------------------- packages ---- */
  const parcels = parcelsOf(o)
  const tracking = row.shipments.map((s) => s.trackingNumber).filter(Boolean)
  if (parcels.length) {
    out.push({
      id: 'packages', label: 'Packages', icon: Package,
      node: (
        <MSection id="read-packages" title="Packages"
          caption={`${parcels.reduce((n, p) => n + p.quantity, 0)} package${parcels.reduce((n, p) => n + p.quantity, 0) === 1 ? '' : 's'} · ${row.weightKg} kg`}>
          <div className="flex flex-col gap-4">
            {parcels.map((p, i) => {
              const vol = volumetricKg(p)
              const items = (p.items ?? []).filter((it) => it.skuCode || it.name)
              return (
                <div key={i} className="rounded-md border border-line">
                  <div className="flex items-center gap-2 border-b border-line bg-warm-25 px-4 py-2.5">
                    <Package size={15} className="text-ink-3" />
                    <span className="text-[13px] font-bold text-ink">Package {i + 1}{p.packageTypeName ? ` · ${p.packageTypeName}` : ''}</span>
                    {p.quantity > 1 && <span className="text-[12px] text-ink-3">× {p.quantity}</span>}
                  </div>
                  <div className="flex flex-col gap-4 px-4 py-4">
                    {fields([
                      ['Cargo type', p.cargoType], ['Weight', p.weight ? `${p.weight} kg` : ''],
                      ['L × W × H', p.l && p.w && p.h ? `${p.l} × ${p.w} × ${p.h} cm` : ''],
                      ['Chargeable weight', p.weight || vol ? `${Math.max(p.weight, vol).toFixed(2)} kg` : ''],
                      ['Tracking Number', p.trackingNumber], ['Description', p.description || (items.length ? '' : p.itemInfo), true],
                    ])}
                    {items.length > 0 && (
                      <SimpleTable rows={items.map((it, k) => ({ ...it, k }))} rowKey={(it) => it.k} columns={[
                        { label: 'SKU', render: (it) => <span>{it.name || '—'}{it.skuCode && <span className="block font-mono text-[12px] text-ink-3">{it.skuCode}</span>}</span> },
                        { label: 'HSN Code', render: (it) => it.hsnCode || '—' },
                        { label: 'Origin Country', render: (it) => it.originCountry || '—' },
                        { label: 'Quantity', align: 'right', render: (it) => it.quantity },
                        { label: 'Weight', align: 'right', render: (it) => `${it.weightKg} kg` },
                        ...(items.some((it) => it.unitCost) ? [{ label: 'Unit Cost', align: 'right' as const, render: (it: (typeof items)[number]) => (it.unitCost ? money(it.unitCost, cur) : '—') }] : []),
                      ]} />
                    )}
                  </div>
                </div>
              )
            })}
            {tracking.length > 0 && fields([['Package tracking numbers', <span className="font-mono">{tracking.join(' · ')}</span>, true]])}
          </div>
        </MSection>
      ),
    })
  }

  /* ------------------------------------------------ value-added services ---- */
  const vas = [
    ...(c.vas ?? []).map((v) => ({ service: v.service, level: v.level, sku: v.level === 'SKU' ? v.skuCode : '', remark: v.remark })),
    ...(o.additionalServices ?? []).map((s) => ({ service: s, level: 'CONSIGNMENT' as const, sku: '', remark: '' })),
  ]
  if (vas.length) {
    out.push({
      id: 'vas', label: 'Value-added services', icon: Wrench,
      node: (
        <MSection id="read-vas" title="Value-added services">
          <SimpleTable rows={vas.map((v, k) => ({ ...v, k }))} rowKey={(v) => v.k} columns={[
            { label: 'Service', render: (v) => v.service },
            { label: 'Level', render: (v) => v.level.charAt(0) + v.level.slice(1).toLowerCase() },
            ...(vas.some((v) => v.sku) ? [{ label: 'SKU', render: (v: (typeof vas)[number] & { k: number }) => v.sku || '—' }] : []),
            ...(vas.some((v) => vasPrice(v.service, cur)) ? [{ label: 'Price', align: 'right' as const, render: (v: (typeof vas)[number] & { k: number }) => (vasPrice(v.service, cur) ? money(vasPrice(v.service, cur), cur) : '—') }] : []),
            ...(vas.some((v) => v.remark) ? [{ label: 'Remark', render: (v: (typeof vas)[number] & { k: number }) => v.remark || '—' }] : []),
          ]} />
        </MSection>
      ),
    })
  }

  /* --------------------------------------------------- service type ---- */
  const service = o.serviceType || o.charges?.service || (ftl ? 'Inland FTL' : 'Standard')
  const vehicles = ftl ? vehiclesOf({ ...o, actualLoad: o.actualLoad ?? o.pkg.weightKg }) : []
  /* the quote the form would show for this record — for its promised days and, when nothing was
     charged at checkout, the estimate; a paid order's frozen `charges` are the fact */
  const q = quoteService({ code: service, name: service }, {
    from: o.sender, to: o.receiver, drops: o.drops, parcels, mode: ftl ? 'ftl' : 'ltl',
    vehicles: ftl ? vehicles : undefined, vas: o.additionalServices ?? [], currency: cur, now: new Date(o.createdAt),
  })
  const shipping = o.charges?.shipping ?? q.net
  const tax = o.charges?.tax ?? q.tax
  const total = o.charges?.total ?? q.total
  const byDate = deliveryDate(new Date(o.createdAt), q.days)
  const dayName = new Date(`${byDate}T00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
  out.push({
    id: 'service', label: 'Service Type', icon: Truck,
    node: (
      <MSection id="read-service" title="Service Type" caption={o.charges ? undefined : 'Estimated rate — the carrier confirms the final charge.'}>
        <div className="flex max-w-[1060px] flex-col gap-4">
          {/* the form's Shared | Full vehicle choice, read back as the chosen option */}
          <p className="flex items-center gap-2 text-[13px] font-bold text-ink">
            {ftl ? <Truck size={16} className="text-ink-3" /> : <Boxes size={16} className="text-ink-3" />}
            {ftl ? 'Full vehicle (FTL)' : 'Shared vehicle (LTL)'}
            <span className="font-normal text-ink-3">· {ftl ? 'A whole vehicle just for this order' : 'Your packages travel with other shipments'}</span>
          </p>
          <RateCard selected title={service}
            left={<><Home size={16} className="shrink-0 text-brand-500" />Delivery by <b className="text-ink">{q.days} DAY</b><span className="text-ink-3">· {dayName}</span></>}
            right={money(shipping, cur)} />
          {vehicles.length > 0 && (
            <SimpleTable rows={vehicles.map((v, k) => ({ ...v, k }))} rowKey={(v) => v.k} columns={[
              { label: 'Vehicle', render: (v) => v.vehicleType },
              { label: 'Load', align: 'right', render: (v) => `${v.actualLoadKg.toLocaleString()} kg` },
              ...(drops.length > 1 ? [{ label: 'Delivers to', render: (v: (typeof vehicles)[number] & { k: number }) => v.addressIdx.map((a) => drops[a]?.name || `Address ${a + 1}`).join(' · ') }] : []),
            ]} />
          )}
          <div className="rounded-md border border-line">
            {([['Shipping', shipping], ['Tax', tax]] as const).map(([k, v]) => (
              <div key={k} className="flex items-center justify-between border-b border-line px-4 py-2.5 text-[13px] text-ink-2">
                <span>{k}</span><span>{money(v, cur)}</span>
              </div>
            ))}
            <div className="flex items-center justify-between px-4 py-2.5 text-[13px] font-bold text-ink">
              <span>Total</span><span>{money(total, cur)}</span>
            </div>
          </div>
        </div>
      </MSection>
    ),
  })

  return out
}
