/**
 * Grow merchant portal — View Order, on the console's detail grammar (spec §15).
 *
 * PageHeader (back + order number + order type / status / payment pills, a
 * kebab of merchant actions) over Panels: Consignment details · Ship From /
 * Ship To · Packages & SKUs (or Vehicle Details) · Service Type on the left and
 * the tracking timeline on the right. Edit pencils are demo affordances; the
 * data comes from the local grow store.
 */
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useState, type ReactNode } from 'react'
import { CircleAlert, Pencil, Truck } from 'lucide-react'
import { useGrowOrders, growOrderActions } from '../../growOrders/store'
import { usePickupModuleConfig } from '../../config/pickupModule'
import type { GrowOrder, Party } from '../../growOrders/types'
import { displayStatus, isOpenPr } from '../../growOrders/tabs'
import { VOL_FACTOR, quoteForOrder, vehiclesOf } from '../../growOrders/draft'
import { toast } from '../../nueva/toast'
import { hubName } from '../../growOrders/hubs'
import {
  Button, EmptyState, KebabMenu, PageHeader, Panel, SimpleTable, StatusPill, type MenuItem,
} from '../../nueva/components'
import { BookPickupDialog } from './pickupDialog'
import { DISPLAY_TONE, PR_STATUS_TONE, money, pillTone, prWindow } from './utils'

/*
 * NO LOCAL RATE CONSTANTS. This page used to mirror the rate card with its own
 * copies, and the parcel price had silently drifted to 225 while checkout
 * charged 90 — the same parcel showed two prices depending on which screen you
 * were looking at. Prices now come from ONE place: the order's own frozen
 * `charges` when it was paid for, otherwise derived from the shared rate card.
 */
const ETA_DAYS = 2

/* ------------------------------------------------------------------ bits ---- */

/** A Panel whose title row carries an optional edit pencil (demo affordance). */
function Card({ title, onEdit, children }: { title: string; onEdit?: () => void; children: ReactNode }) {
  return (
    <Panel>
      <div className="flex items-center justify-between gap-3 px-5 pt-4 pb-1">
        <h2 className="text-[15px] font-bold text-ink">{title}</h2>
        {onEdit && (
          <button type="button" aria-label={`Edit ${title}`} onClick={onEdit}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-ink-3 hover:bg-warm-50 hover:text-ink">
            <Pencil size={14} />
          </button>
        )}
      </div>
      {children}
    </Panel>
  )
}

/** Key / value grid — the console detail page's Pairs. */
function Pairs({ pairs, cols = 3 }: { pairs: [string, ReactNode][]; cols?: 2 | 3 }) {
  return (
    <dl className={`grid gap-x-6 gap-y-3 px-5 pb-5 pt-2 ${cols === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
      {pairs.map(([k, v]) => (
        <div key={k} className="min-w-0">
          <dt className="text-[12px] font-bold text-ink-3">{k}</dt>
          <dd className="mt-0.5 break-words text-[13px] text-ink">{v === '' || v == null ? '—' : v}</dd>
        </div>
      ))}
    </dl>
  )
}

const cityLine = (p: Party) => [p.city || p.line1, p.country, p.postalCode].filter(Boolean).join(', ') || '-'
const partyPairs = (p: Party, prefix: string): [string, ReactNode][] => [
  [`${prefix} Name`, p.name],
  ['Company Name', p.businessName],
  ['Contact Number', p.contactNumber],
  ['Email Id', p.email],
  /* what the Create Consignment form adds — shown only when it was typed */
  ...(p.locationCode ? [['Location Code', p.locationCode] as [string, ReactNode]] : []),
  ...((p.line1 || p.line2 || p.line3) ? [['Address', [p.line1, p.line2, p.line3, p.landmark, p.county].filter(Boolean).join(', ')] as [string, ReactNode]] : []),
  ...((p.latitude || p.longitude) ? [['Latitude, Longitude', [p.latitude, p.longitude].filter(Boolean).join(', ')] as [string, ReactNode]] : []),
  ...((p.windowStart || p.windowEnd) ? [['Window', [p.windowStart, p.windowEnd].map((x) => (x ? x.replace('T', ' ') : '…')).join(' → ')] as [string, ReactNode]] : []),
  ...((p.floorNumber || p.liftAvailable) ? [['Floor · Lift', `${p.floorNumber || '-'} · ${p.liftAvailable ? 'Lift available' : 'No lift'}`] as [string, ReactNode]] : []),
]

type Pkg = NonNullable<NonNullable<GrowOrder['consignment']>['packages']>[number]
type Vas = NonNullable<NonNullable<GrowOrder['consignment']>['vas']>[number]

/**
 * Consignment details — a compact read-only echo of every Create Consignment
 * field the older order model had no home for, so nothing typed is lost.
 */
function ConsignmentCard({ o }: { o: GrowOrder }) {
  const c = o.consignment
  if (!c) return null
  const flags = [
    c.scannable && 'Scannable', c.schedulingConfirmation && 'Scheduling Confirmation Required',
    c.dedicateTruck && 'Dedicate Truck', c.clearanceRequired && 'Clearance Required', c.splittable && 'Splittable',
  ].filter(Boolean).join(' · ')
  const rows: [string, string][] = [
    ['Order Number', o.orderNumber], ['Reference Number', c.referenceNumber ?? ''], ['Consignment Number', c.consignmentNumber ?? ''],
    ['Consignment Type', c.consignmentType ?? ''], ...(c.exchangeOrderNumber ? [['Exchange Order Number', c.exchangeOrderNumber] as [string, string]] : []),
    ['Ship By Date', c.shipByDate ?? ''], ['Merchant', [c.merchantCode, c.merchantName].filter(Boolean).join(' · ')],
    ['Tags', (c.tags ?? []).join(', ')], ['Service Type', o.serviceType], ['Label Format', c.labelFormat ?? ''],
    ['Payment Mode', c.paymentMode ?? ''], ['Order Amount', c.orderAmount != null ? money(c.orderAmount, o.currency) : ''],
    ['Carrier', o.carrier], ['Handling', flags], ['Total Loading Time', c.totalLoadingTime ? `${c.totalLoadingTime} min` : ''],
    ['Special Instructions', c.specialInstructions ?? ''],
    ['Return To Origin', c.rto ? [c.rto.name, c.rto.line1, c.rto.city].filter(Boolean).join(', ') : c.rtoMode ?? ''],
  ]
  const pkgs = c.packages ?? []
  return (
    <Card title="Consignment details">
      <Pairs pairs={rows} />
      {pkgs.some((p) => p.trackingNumber || p.palletSpace || p.description) && (
        <div className="border-t border-line">
          <SimpleTable<Pkg & { i: number }> rows={pkgs.map((p, i) => ({ ...p, i }))} rowKey={(p) => p.i}
            columns={[
              { label: 'Piece', render: (p) => p.packageId || p.i + 1 },
              { label: 'Package Type', render: (p) => p.packageType },
              { label: 'Quantity', render: (p) => p.quantity },
              { label: 'Tracking Number', render: (p) => p.trackingNumber || '-' },
              { label: 'Pallet Space', render: (p) => p.palletSpace || '-' },
              { label: 'Description', render: (p) => p.description || '-' },
            ]} />
        </div>
      )}
      {(c.vas ?? []).length > 0 && (
        <div className="border-t border-line">
          <SimpleTable<Vas & { i: number }> rows={(c.vas ?? []).map((v, i) => ({ ...v, i }))} rowKey={(v) => v.i}
            columns={[
              { label: 'VAS Added Level', render: (v) => v.level },
              { label: 'SKU Line Item No', render: (v) => v.skuCode || '-' },
              { label: 'Service', render: (v) => v.service },
              { label: 'Service Time (mins)', render: (v) => v.serviceTimeMin },
              { label: 'Remark', render: (v) => v.remark || '-' },
            ]} />
        </div>
      )}
    </Card>
  )
}

/* -------------------------------------------------------------- timeline ---- */

const TRACK = ['Order Created', 'Available For Pickup', 'In-Transit', 'At Destination Hub', 'Delivered']
const STEP_OF: Record<GrowOrder['status'], number> = {
  'Order Created': 0, 'Pickup Scheduled': 1, 'Picked Up': 2, 'In Transit': 2,
  'Out for Delivery': 3, Delivered: 4, Undelivered: 3, Cancelled: 0,
}

function Tracking({ o, onBook, canBook }: { o: GrowOrder; onBook: () => void; canBook: boolean }) {
  const pickupOn = usePickupModuleConfig().enabled
  const reached = STEP_OF[o.status]
  return (
    <ol className="flex flex-col px-5 pb-5 pt-2">
      {TRACK.map((label, i) => {
        const done = i <= reached
        return (
          <li key={label} className="relative border-l border-line pb-4 pl-4 last:pb-0">
            <span className={`absolute -left-[4.5px] top-1.5 h-2 w-2 rounded-full ${i === reached ? 'bg-brand-500' : done ? 'bg-success-fg' : 'bg-warm-300'}`} />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className={`text-[13px] ${done ? 'font-bold text-ink' : 'text-ink-3'}`}>{label}</span>
              {/* the ONE step a merchant can act on: an order that is paid and
                  has no courier booked yet */}
              {i === 1 && canBook && (
                <span title={pickupOn ? undefined : 'Pickup module is off for this account'}>
                  <Button size="sm" disabled={!pickupOn} icon={<Truck size={13} />} onClick={onBook}>Book Pickup</Button>
                </span>
              )}
            </div>
            {i === 3 && o.status === 'Undelivered' && (
              <p className="mt-1 flex items-start gap-1.5 text-[12.5px] text-danger-fg">
                <CircleAlert size={13} className="mt-[2px] shrink-0" />
                {o.error || 'Delivery attempt failed'}
              </p>
            )}
          </li>
        )
      })}
    </ol>
  )
}

/* ------------------------------------------------------------------ page ---- */

export default function OrderViewPage() {
  const { id = '' } = useParams()
  const nav = useNavigate()
  const db = useGrowOrders()
  const [book, setBook] = useState(false)
  const o = db.orders.find((x) => x.id === id)
  if (!o) {
    return (
      <div>
        <PageHeader title="Order" onBack={() => nav('/grow/orders')} />
        <Panel><EmptyState title="Order not found" hint="It may have been removed, or the link is from another browser's data." /></Panel>
      </div>
    )
  }

  const isFtl = o.shipmentType === 'FTL'
  /* a pre-list FTL record has no per-vehicle load — the package weight is the booking's total */
  const vehicles = isFtl ? vehiclesOf({ ...o, actualLoad: o.actualLoad ?? o.pkg.weightKg }) : []
  const units = isFtl ? vehicles.length : o.pkg.count
  /* what was actually charged if this order went through checkout; otherwise
     what the shared rate card says it would cost today */
  const quote = o.charges ?? quoteForOrder(o)
  const rate = quote.total
  const volumetric = (o.pkg.lengthCm * o.pkg.widthCm * o.pkg.heightCm) / VOL_FACTOR
  /** SKU-master contents, when the order was created through the stepper. */
  const items = o.pkg.items ?? []
  const receivers = [o.receiver, ...o.drops]
  const ds = displayStatus(o)
  const demo = () => toast.info('Edit — demo')
  const cancel = () => { growOrderActions.update(o.id, { status: 'Cancelled' }); toast.success('Order cancelled') }
  /* the Consignment Order list has no tabs — Back is always the list */
  const backTo = '/grow/orders'
  const pr = db.pickupRequests.find((p) => p.id === o.pickupRequestId)
  const cancelPickup = () => {
    if (!pr) return
    growOrderActions.cancelPickupRequest(pr.id, 'Cancelled from the order')
    toast.success(`${pr.number} cancelled`)
  }

  const kebab: MenuItem[] = [
    ...((o.isDraft || o.paymentStatus === 'Unpaid') ? [{ label: 'Edit draft', onClick: () => nav(`/grow/orders/add?draft=${o.id}`) }] : []),
    ...(pr && isOpenPr(pr.status) ? [{ label: 'Cancel Pickup', tone: 'danger' as const, onClick: cancelPickup }] : []),
    ...(o.status !== 'Cancelled' && o.status !== 'Delivered' ? [{ label: 'Cancel Order', tone: 'danger' as const, onClick: cancel }] : []),
  ]

  return (
    <div>
      <PageHeader title={`Order Number : ${o.orderNumber}`} onBack={() => nav(backTo)}
        subtitle={`${cityLine(o.sender)} → ${cityLine(o.receiver)}`}
        right={(
          <div className="flex items-center gap-2">
            <StatusPill label={o.orderType} tone="neutral" />
            {/* the SAME pill the grid and the Status filter show */}
            <StatusPill label={ds} tone={pillTone(DISPLAY_TONE[ds])} />
            <StatusPill label={o.paymentStatus} tone={o.paymentStatus === 'Paid' ? 'success' : 'neutral'} />
            {kebab.length > 0 && <KebabMenu items={kebab} />}
          </div>
        )} />

      {/* draft — nothing has been paid for yet, so the only next step is the stepper */}
      {(o.isDraft || o.paymentStatus === 'Unpaid') && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-md border border-line bg-warning-bg px-4 py-2.5">
          <CircleAlert size={15} className="shrink-0 text-warning-fg" />
          <span className="text-[13px] text-warning-fg">Draft — not paid. Finish checkout to book this order.</span>
          <span className="ml-auto"><Button size="sm" onClick={() => nav(`/grow/orders/add?draft=${o.id}`)}>Edit draft</Button></span>
        </div>
      )}

      {/* the pickup this order was booked into */}
      {pr && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-md border border-line bg-surface px-4 py-2.5 text-[13px]">
          <Truck size={15} className="shrink-0 text-ink-3" />
          <span className="text-ink-3">Pickup</span>
          <Link to={`/grow/orders/pickups/${pr.id}`} className="font-mono text-[12px] font-bold text-brand-500 hover:text-brand-600">{pr.number}</Link>
          <span className="text-ink">{prWindow(pr)}</span>
          {/* where the courier drops it — the inbound hub this order is routed through */}
          {pr.destinationCode && <span className="text-ink-3">→ {hubName(pr.destinationCode, db.stores)}</span>}
          <StatusPill label={pr.status} tone={pillTone(PR_STATUS_TONE[pr.status])} />
          {isOpenPr(pr.status) && (
            <span className="ml-auto"><Button size="sm" variant="outline" onClick={cancelPickup}>Cancel Pickup</Button></span>
          )}
        </div>
      )}

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-4">
          <ConsignmentCard o={o} />

          <Card title="Ship From / Ship To" onEdit={demo}>
            <div className="grid gap-x-6 sm:grid-cols-2">
              <div>
                <p className="px-5 pt-2 text-[11px] font-bold uppercase tracking-[0.08em] text-ink-3">Ship From · {cityLine(o.sender)}</p>
                <Pairs cols={2} pairs={partyPairs(o.sender, 'Sender')} />
              </div>
              <div className="border-l border-line">
                {receivers.map((r, i) => (
                  <div key={i} className={i > 0 ? 'border-t border-line' : ''}>
                    <p className="px-5 pt-2 text-[11px] font-bold uppercase tracking-[0.08em] text-ink-3">
                      {receivers.length > 1 ? `Ship To ${i + 1}` : 'Ship To'} · {cityLine(r)}
                    </p>
                    <Pairs cols={2} pairs={partyPairs(r, receivers.length > 1 ? `Receiver ${i + 1}` : 'Receiver')} />
                  </div>
                ))}
              </div>
            </div>
          </Card>

          {isFtl ? (
            <Card title="Vehicle Details" onEdit={demo}>
              <Pairs pairs={[
                ['Service Type', o.serviceType || '-'],
                ['Number of Vehicles', String(units)],
                ['Actual Load', `${(o.actualLoad ?? o.pkg.weightKg).toLocaleString()} kg`],
              ]} />
              {/* one row per vehicle, with the delivery addresses it serves */}
              <div className="border-t border-line">
                <SimpleTable<(typeof vehicles)[number] & { i: number }> rows={vehicles.map((v, i) => ({ ...v, i }))} rowKey={(v) => v.i}
                  columns={[
                    { label: '#', render: (v) => <span className="text-ink-3">{v.i + 1}</span> },
                    { label: 'Vehicle Type', render: (v) => v.vehicleType },
                    { label: 'Actual Load', align: 'right', render: (v) => `${v.actualLoadKg.toLocaleString()} kg` },
                    { label: 'Addresses', render: (v) => v.addressIdx.map((a) => {
                      const d = [o.receiver, ...o.drops][a]
                      return d ? `Address ${a + 1} · ${d.name}${d.city ? `, ${d.city}` : ''}` : `Address ${a + 1}`
                    }).join(' · ') || '-' },
                  ]} />
              </div>
            </Card>
          ) : (
            <Card title="Packages & SKUs" onEdit={demo}>
              <Pairs pairs={[
                ['Cargo type', o.pkg.cargoType || o.pkg.kind],
                ['Package type', o.pkg.packageType || '-'],
                ['Authority to leave', 'Leave at the door'],
                ['Delivery Instructions', o.remarks],
                ['Packages', String(o.pkg.count)],
                ['Chargeable weight', `${o.pkg.weightKg.toFixed(3)} kg`],
                ['Volumetric weight', `${volumetric.toFixed(3)} kg`],
              ]} />
              {/* the SKU-master contents, one row each. `Quantity` here is the
                  item count inside the packages — the package count is the
                  `Packages` pair above, so the two never read as one. */}
              <div className="border-t border-line">
                {items.length > 0 ? (
                  <SimpleTable<(typeof items)[number] & { i: number }> rows={items.map((it, i) => ({ ...it, i }))} rowKey={(it) => it.i}
                    columns={[
                      { label: 'SKU', render: (it) => (
                        <span>
                          {it.name || '-'}{it.skuCode && <span className="block text-[12px] text-ink-3">{it.skuCode}</span>}
                          {(it.category || it.description || it.unitCost || it.imageUrl) && (
                            <span className="block text-[12px] text-ink-3">
                              {[it.category, it.description, it.unitCost ? `Unit Cost ${money(it.unitCost, o.currency)}` : '', it.imageUrl].filter(Boolean).join(' · ')}
                            </span>
                          )}
                        </span>
                      ) },
                      { label: 'HSN Code', render: (it) => it.hsnCode || <span className="text-ink-3">-</span> },
                      { label: 'Origin Country', render: (it) => it.originCountry || <span className="text-ink-3">-</span> },
                      { label: 'Quantity', align: 'right', render: (it) => it.quantity },
                      { label: 'Weight', align: 'right', render: (it) => `${(it.weightKg * it.quantity).toFixed(3)} kg` },
                    ]} />
                ) : (
                  <SimpleTable<GrowOrder> rows={[o]} rowKey={(x) => x.id}
                    columns={[
                      { label: 'Description', render: (x) => x.pkg.description || '-' },
                      { label: 'Quantity', align: 'right', render: (x) => x.pkg.count },
                      { label: 'Weight', align: 'right', render: (x) => `${x.pkg.weightKg.toFixed(3)} kg` },
                      { label: 'Volumetric weight', align: 'right', render: () => `${volumetric.toFixed(3)} kg` },
                    ]} />
                )}
              </div>
            </Card>
          )}

          <Card title="Service Type" onEdit={demo}>
            <div className="mx-5 mb-5 mt-2 flex items-center gap-4 rounded-md border border-brand-500 bg-brand-50/60 px-5 py-3.5">
              <span className="flex-1">
                <span className="block text-[15px] font-bold text-ink">{o.serviceType || 'Standard Delivery'}</span>
                <span className="mt-0.5 flex items-center gap-1.5 text-[13px] text-ink-2">
                  <Truck size={14} className="text-brand-500" />
                  {isFtl ? `${units} × ${o.vehicleType} · ` : ''}Delivery by <b className="text-ink">{ETA_DAYS} DAY</b>
                </span>
              </span>
              <span className="text-[15px] font-bold text-ink">{money(rate, o.currency)}</span>
            </div>
          </Card>
        </div>

        <div className="lg:sticky lg:top-4 lg:self-start">
          <Panel title="Tracking">
            <Tracking o={o} canBook={ds === 'Ready for Pickup'} onBook={() => setBook(true)} />
          </Panel>
        </div>
      </div>

      {/* the same dialog the Orders page books from — one booking surface */}
      {book && (
        <BookPickupDialog orders={[o]} stores={db.stores} onClose={() => setBook(false)}
          onBooked={() => setBook(false)} />
      )}
    </div>
  )
}
