/**
 * Grow merchant portal — View Order (1:1 with grow-staging.fareye.co).
 *
 * Header (back arrow + "Order Number : <no>" + order-type pill) over a two-column
 * body: three stacked cards (Address Details / Parcel — or Vehicle — Details /
 * Service Type) and a sticky tracking timeline on the right. Edit pencils and
 * "Book Now" are demo affordances; the data comes from the local grow store.
 */
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useState, type ReactNode } from 'react'
import { ArrowLeft, Banknote, CircleAlert, House, Pencil, Truck } from 'lucide-react'
import { useGrowOrders, growOrderActions } from '../../growOrders/store'
import { usePickupModuleConfig } from '../../config/pickupModule'
import type { GrowOrder, Party } from '../../growOrders/types'
import { displayStatus, isOpenPr } from '../../growOrders/tabs'
import { VOL_FACTOR, quoteForOrder, vehiclesOf } from '../../growOrders/draft'
import { toast } from '../../nueva/toast'
import { hubName } from '../../growOrders/hubs'
import { Btn, Card, Chip, TABLE_TH } from './ui'
import { BookPickupDialog } from './pickupDialog'
import { DISPLAY_TONE, PR_STATUS_TONE, money, prWindow } from './utils'

/*
 * NO LOCAL RATE CONSTANTS. This page used to mirror the rate card with its own
 * copies, and the parcel price had silently drifted to 225 while checkout
 * charged 90 — the same parcel showed two prices depending on which screen you
 * were looking at. Prices now come from ONE place: the order's own frozen
 * `charges` when it was paid for, otherwise derived from the shared rate card.
 */
const ETA_DAYS = 2

/* ------------------------------------------------------------------ bits ---- */

function SectionCard({ title, onEdit, children, className = '' }: {
  title: string; onEdit?: () => void; children: ReactNode; className?: string
}) {
  return (
    <Card className={`!p-6 ${className}`}>
      <div className="flex items-start justify-between gap-4">
        <h2 className="text-[20px] font-semibold leading-snug text-grow-ink">{title}</h2>
        {onEdit && (
          <button type="button" aria-label={`Edit ${title}`} onClick={onEdit}
            className="-mr-1 -mt-1 flex h-9 w-9 items-center justify-center rounded-full text-grow-ink-2 transition-colors hover:bg-grow-accent-2/10 hover:text-grow-accent-2">
            <Pencil size={20} />
          </button>
        )}
      </div>
      {children}
    </Card>
  )
}

/** Stacked label / value pair; `right` mirrors it for the receiver column. */
function Pair({ label, value, right }: { label: string; value: string; right?: boolean }) {
  return (
    <div className={`py-[10px] ${right ? 'text-right' : ''}`}>
      <p className="text-[14px] leading-tight text-grow-ink-2">{label}</p>
      <p className="mt-1 text-[16px] leading-tight text-grow-ink">{value || '-'}</p>
    </div>
  )
}

/** Inline label → value, as used above the parcel table. */
function InlinePair({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap items-baseline gap-2">
      <span className="text-[14px] text-grow-ink-2">{label}</span>
      <span className="text-[16px] text-grow-ink">{value || '-'}</span>
    </div>
  )
}

const cityLine = (p: Party) => [p.city || p.line1, p.country, p.postalCode].filter(Boolean).join(', ') || '-'
const partyPairs = (p: Party, prefix: string, right: boolean) => (
  <>
    <Pair right={right} label={`${prefix} Name`} value={p.name} />
    <Pair right={right} label="Company Name" value={p.businessName} />
    <Pair right={right} label="Contact Number" value={p.contactNumber} />
    <Pair right={right} label="Email Id" value={p.email} />
    {/* what the Create Consignment form adds — shown only when it was typed */}
    {p.locationCode && <Pair right={right} label="Location Code" value={p.locationCode} />}
    {(p.line1 || p.line2 || p.line3) && <Pair right={right} label="Address" value={[p.line1, p.line2, p.line3, p.landmark, p.county].filter(Boolean).join(', ')} />}
    {(p.latitude || p.longitude) && <Pair right={right} label="Latitude, Longitude" value={[p.latitude, p.longitude].filter(Boolean).join(', ')} />}
    {(p.windowStart || p.windowEnd) && <Pair right={right} label="Window" value={[p.windowStart, p.windowEnd].map((x) => (x ? x.replace('T', ' ') : '…')).join(' → ')} />}
    {(p.floorNumber || p.liftAvailable) && <Pair right={right} label="Floor · Lift" value={`${p.floorNumber || '-'} · ${p.liftAvailable ? 'Lift available' : 'No lift'}`} />}
  </>
)

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
  return (
    <SectionCard title="Consignment details">
      <div className="mt-3 grid gap-x-8 sm:grid-cols-3">
        {rows.map(([label, value]) => <Pair key={label} label={label} value={value} />)}
      </div>
      {(c.packages ?? []).some((p) => p.trackingNumber || p.palletSpace || p.description) && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[520px] border-collapse text-left">
            <thead><tr className="bg-grow-thead">
              {['Piece', 'Package Type', 'Quantity', 'Tracking Number', 'Pallet Space', 'Description'].map((h) => <th key={h} className={`h-[40px] ${TABLE_TH}`}>{h}</th>)}
            </tr></thead>
            <tbody>
              {(c.packages ?? []).map((p, i) => (
                <tr key={i} className="border-b border-grow-line last:border-0 text-[13px] text-grow-ink">
                  <td className="px-4 py-2">{p.packageId || i + 1}</td><td className="px-4 py-2">{p.packageType}</td><td className="px-4 py-2">{p.quantity}</td>
                  <td className="px-4 py-2">{p.trackingNumber || '-'}</td><td className="px-4 py-2">{p.palletSpace || '-'}</td><td className="px-4 py-2">{p.description || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {(c.vas ?? []).length > 0 && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[520px] border-collapse text-left">
            <thead><tr className="bg-grow-thead">
              {['VAS Added Level', 'SKU Line Item No', 'Service', 'Service Time (mins)', 'Remark'].map((h) => <th key={h} className={`h-[40px] ${TABLE_TH}`}>{h}</th>)}
            </tr></thead>
            <tbody>
              {(c.vas ?? []).map((v, i) => (
                <tr key={i} className="border-b border-grow-line last:border-0 text-[13px] text-grow-ink">
                  <td className="px-4 py-2">{v.level}</td><td className="px-4 py-2">{v.skuCode || '-'}</td><td className="px-4 py-2">{v.service}</td>
                  <td className="px-4 py-2">{v.serviceTimeMin}</td><td className="px-4 py-2">{v.remark || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </SectionCard>
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
    <ol>
      {TRACK.map((label, i) => {
        const done = i <= reached
        const lineDone = i < reached
        const last = i === TRACK.length - 1
        return (
          <li key={label} className="flex gap-4">
            <div className="flex flex-col items-center">
              <span className={`mt-1 h-[20px] w-[20px] shrink-0 rounded-full ${done ? 'bg-[#56CA00]' : 'bg-grow-ink-3'}`} />
              {!last && <span className={`w-[2px] flex-1 ${lineDone ? 'bg-[#56CA00]' : 'bg-grow-ink-3/50'}`} />}
            </div>
            <div className={`flex-1 ${last ? 'pb-0' : 'pb-7'}`}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className={`text-[17px] leading-tight ${done ? 'text-grow-ink' : 'text-grow-ink-2'}`}>{label}</span>
                {/* the ONE step a merchant can act on: an order that is paid and
                    has no courier booked yet */}
                {i === 1 && canBook && (
                  <span title={pickupOn ? undefined : 'Pickup module is off for this account'}>
                    <Btn color="accent2" size="sm" disabled={!pickupOn} startIcon={<Truck size={15} />} onClick={onBook}>Book Pickup</Btn>
                  </span>
                )}
              </div>
              {i === 3 && o.status === 'Undelivered' && (
                <p className="mt-1.5 flex items-start gap-1.5 text-[13px] leading-snug text-grow-error">
                  <CircleAlert size={15} className="mt-[1px] shrink-0" />
                  {o.error || 'Delivery attempt failed'}
                </p>
              )}
            </div>
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
    return <p className="text-grow-ink-2">Order not found. <Link className="text-grow-accent" to="/grow/orders">Back to Orders</Link></p>
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

  return (
    <div>
      {/* header */}
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <button type="button" aria-label="Back to Orders" onClick={() => nav(backTo)}
          className="-ml-2 flex h-9 w-9 items-center justify-center rounded-full text-grow-ink transition-colors hover:bg-grow-ink/5">
          <ArrowLeft size={22} />
        </button>
        <h1 className="text-[24px] font-medium leading-[1.33] text-grow-ink">Order Number : {o.orderNumber}</h1>
        <span className="inline-flex h-[28px] items-center rounded-full bg-grow-ink/[0.08] px-3 text-[14px] leading-none text-grow-ink-2">{o.orderType}</span>
        {/* the SAME chip the grid and the Status filter show — the header used to
            speak payment only, so a row and its own page disagreed */}
        <Chip tone={DISPLAY_TONE[ds]}>{ds}</Chip>
        <Chip tone={o.paymentStatus === 'Paid' ? 'success' : 'neutral'}>{o.paymentStatus}</Chip>
      </div>

      {/* draft — nothing has been paid for yet, so the only next step is the stepper */}
      {(o.isDraft || o.paymentStatus === 'Unpaid') && (
        <div className="mb-5 flex flex-wrap items-center gap-3 rounded-[6px] border border-grow-warning/40 bg-grow-warning/10 px-4 py-3">
          <CircleAlert size={18} className="shrink-0 text-[#B57F00]" />
          <span className="text-[14px] text-[#B57F00]">Draft — not paid. Finish checkout to book this order.</span>
          <Btn color="accent2" size="sm" className="ml-auto" onClick={() => nav(`/grow/orders/add?draft=${o.id}`)}>Edit draft</Btn>
        </div>
      )}

      {/* the pickup this order was booked into */}
      {pr && (
        <div className="mb-5 flex flex-wrap items-center gap-3 rounded-[6px] border border-grow-line bg-white px-4 py-3">
          <Truck size={18} className="shrink-0 text-grow-ink-2" />
          <span className="text-[14px] text-grow-ink-2">Pickup</span>
          <Link to={`/grow/orders/pickups/${pr.id}`} className="text-[14px] font-medium text-grow-accent-2 hover:underline">{pr.number}</Link>
          <span className="text-[14px] text-grow-ink">{prWindow(pr)}</span>
          {/* where the courier drops it — the inbound hub this order is routed through */}
          {pr.destinationCode && (
            <span className="text-[14px] text-grow-ink-2">→ {hubName(pr.destinationCode, db.stores)}</span>
          )}
          <Chip tone={PR_STATUS_TONE[pr.status]}>{pr.status}</Chip>
          {isOpenPr(pr.status) && (
            <Btn variant="outlined" color="error" size="sm" className="ml-auto" onClick={cancelPickup}>Cancel Pickup</Btn>
          )}
        </div>
      )}

      {/* `min-w-0` on the 1fr track: a grid item's min-width defaults to its
          min-content, so without it the cards' own minimums pushed the whole
          two-column body past the viewport and the page scrolled sideways. */}
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_420px]">
        <div className="min-w-0 space-y-6">
          <ConsignmentCard o={o} />
          {/* ---------------------------------------------- address details ---- */}
          <SectionCard title="Address Details" onEdit={demo}>
            <div className="mt-5 flex items-center gap-4">
              <div className="min-w-0 max-w-[40%]">
                <p className="text-[12px] font-medium uppercase tracking-[0.8px] text-grow-ink-2">Origin</p>
                <p className="mt-1.5 text-[15px] leading-snug text-grow-ink">{cityLine(o.sender)}</p>
              </div>
              <div className="relative flex min-w-[80px] flex-1 items-center justify-center">
                <span className="absolute inset-x-0 top-1/2 border-t-2 border-dashed border-grow-ink/25" />
                <Truck size={44} strokeWidth={1.5} className="relative bg-white px-1 text-grow-ink-2" />
              </div>
              <div className="min-w-0 max-w-[40%] text-right">
                <p className="text-[12px] font-medium uppercase tracking-[0.8px] text-grow-ink-2">Destination</p>
                <p className="mt-1.5 text-[15px] leading-snug text-grow-ink">{cityLine(o.receiver)}</p>
              </div>
            </div>

            <div className="my-5 border-t border-grow-line" />

            <div className="grid gap-x-8 sm:grid-cols-2">
              <div>{partyPairs(o.sender, 'Sender', false)}</div>
              <div>
                {receivers.map((r, i) => (
                  <div key={i} className={i > 0 ? 'mt-3 border-t border-grow-line pt-2' : ''}>
                    {partyPairs(r, receivers.length > 1 ? `Receiver ${i + 1}` : 'Receiver', true)}
                  </div>
                ))}
              </div>
            </div>
          </SectionCard>

          {/* ----------------------------------------------- parcel/vehicle ---- */}
          <SectionCard title={isFtl ? 'Vehicle Details' : 'Parcel Details'} onEdit={demo}>
            {isFtl ? (
              <>
                <div className="mt-4 grid gap-x-8 gap-y-1 sm:grid-cols-3">
                  <InlinePair label="Service Type" value={o.serviceType || '-'} />
                  <InlinePair label="Number of Vehicles" value={String(units)} />
                  <InlinePair label="Actual Load" value={`${(o.actualLoad ?? o.pkg.weightKg).toLocaleString()} kg`} />
                </div>
                {/* one row per vehicle, with the delivery addresses it serves */}
                <div className="mt-5 overflow-x-auto">
                  <table className="w-full min-w-[520px] border-collapse text-left">
                    <thead>
                      <tr className="bg-grow-thead">
                        {['#', 'Vehicle Type', 'Actual Load', 'Addresses'].map((h) => (
                          <th key={h} className={`h-[40px] ${TABLE_TH}`}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {vehicles.map((v, i) => (
                        <tr key={i} className="border-b border-grow-line last:border-0">
                          <td className="px-4 py-2.5 text-[15px] text-grow-ink-2">{i + 1}</td>
                          <td className="px-4 py-2.5 text-[15px] text-grow-ink">{v.vehicleType}</td>
                          <td className="px-4 py-2.5 text-[15px] text-grow-ink">{v.actualLoadKg.toLocaleString()} kg</td>
                          <td className="px-4 py-2.5 text-[15px] text-grow-ink">
                            {v.addressIdx.map((a) => {
                              const d = [o.receiver, ...o.drops][a]
                              return d ? `Address ${a + 1} · ${d.name}${d.city ? `, ${d.city}` : ''}` : `Address ${a + 1}`
                            }).join(' · ') || '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <>
                <div className="mt-4 flex flex-wrap gap-x-12 gap-y-2">
                  <InlinePair label="Cargo type" value={o.pkg.cargoType || o.pkg.kind} />
                  <InlinePair label="Package type" value={o.pkg.packageType || '-'} />
                  <InlinePair label="Authority to leave" value="Leave at the door" />
                  <InlinePair label="Delivery Instructions" value={o.remarks} />
                </div>
                {/* the SKU-master contents, one row each. `Quantity` here is the
                    item count inside the packages — the package count is the
                    `Packages` line under the table, so the two never read as one. */}
                <div className="mt-5 overflow-x-auto">
                  <table className="w-full min-w-[520px] border-collapse text-left">
                    <thead>
                      <tr className="bg-grow-thead">
                        {['SKU', 'HSN Code', 'Origin Country', 'Quantity', 'Weight', 'Volumetric weight'].map((h) => (
                          <th key={h} className={`h-[40px] ${TABLE_TH}`}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {items.length > 0 ? items.map((it, i) => (
                        <tr key={i} className="border-b border-grow-line last:border-0">
                          <td className="px-4 py-2.5 text-[15px] text-grow-ink">
                            {it.name || '-'}{it.skuCode && <span className="block text-[13px] text-grow-ink-2">{it.skuCode}</span>}
                            {(it.category || it.description || it.unitCost || it.imageUrl) && (
                              <span className="block text-[13px] text-grow-ink-2">
                                {[it.category, it.description, it.unitCost ? `Unit Cost ${money(it.unitCost, o.currency)}` : '', it.imageUrl].filter(Boolean).join(' · ')}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-2.5 text-[15px] text-grow-ink">{it.hsnCode || <span className="text-grow-ink-3">-</span>}</td>
                          <td className="px-4 py-2.5 text-[15px] text-grow-ink">{it.originCountry || <span className="text-grow-ink-3">-</span>}</td>
                          <td className="px-4 py-2.5 text-[15px] text-grow-ink">{it.quantity}</td>
                          <td className="px-4 py-2.5 text-[15px] text-grow-ink">{(it.weightKg * it.quantity).toFixed(3)} kg</td>
                          <td className="px-4 py-2.5 text-[15px] text-grow-ink-3">-</td>
                        </tr>
                      )) : (
                        <tr className="border-b border-grow-line last:border-0">
                          <td className="px-4 py-2.5 text-[15px] text-grow-ink">{o.pkg.description || '-'}</td>
                          <td className="px-4 py-2.5 text-[15px] text-grow-ink-3">-</td>
                          <td className="px-4 py-2.5 text-[15px] text-grow-ink-3">-</td>
                          <td className="px-4 py-2.5 text-[15px] text-grow-ink">{o.pkg.count}</td>
                          <td className="px-4 py-2.5 text-[15px] text-grow-ink">{o.pkg.weightKg.toFixed(3)} kg</td>
                          <td className="px-4 py-2.5 text-[15px] text-grow-ink">{volumetric.toFixed(3)} kg</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                {items.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-x-12 gap-y-2">
                    <InlinePair label="Packages" value={String(o.pkg.count)} />
                    <InlinePair label="Chargeable weight" value={`${o.pkg.weightKg.toFixed(3)} kg`} />
                    <InlinePair label="Volumetric weight" value={`${volumetric.toFixed(3)} kg`} />
                  </div>
                )}
              </>
            )}
          </SectionCard>

          {/* ------------------------------------------------- service type ---- */}
          <SectionCard title="Service Type" onEdit={demo}>
            <div className="mt-5 flex items-center gap-4 rounded-[12px] border-2 border-grow-accent-2 px-8 py-5">
              <span className="flex-1">
                <span className="block text-[20px] font-medium text-grow-ink">{o.serviceType || 'Standard Delivery'}</span>
                <span className="mt-1 flex items-center gap-2 text-[17px] text-grow-ink-2">
                  {isFtl
                    ? <Truck size={22} className="text-grow-accent-2" />
                    : <House size={22} className="fill-grow-accent-2 text-grow-accent-2" />}
                  {isFtl ? `${units} × ${o.vehicleType} · ` : ''}Delivery by <b className="text-grow-ink">{ETA_DAYS} DAY</b>
                </span>
              </span>
              <span className="flex items-center gap-2 text-[18px] font-medium text-grow-ink">
                <Banknote size={26} className="text-grow-ink-2" /> {money(rate, o.currency)}
              </span>
            </div>
          </SectionCard>
        </div>

        {/* ------------------------------------------------------ tracking ---- */}
        <div className="lg:sticky lg:top-4 lg:self-start">
          <Card className="!p-6">
            <Tracking o={o} canBook={ds === 'Ready for Pickup'} onBook={() => setBook(true)} />
          </Card>
          {o.status !== 'Cancelled' && o.status !== 'Delivered' && (
            <div className="mt-2 flex justify-end">
              <Btn variant="text" color="error" onClick={cancel}>Cancel Order</Btn>
            </div>
          )}
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
