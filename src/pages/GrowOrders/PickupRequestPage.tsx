/**
 * Grow merchant portal — View Pickup Request, the full-page twin of OrderViewPage.
 *
 * Header (back arrow + "Pickup Request : PR-000123" + Reserved / FTL / status chips)
 * over a two-column body: Pickup Details / Expected / Orders on the left, a
 * sticky status timeline plus the request's actions on the right. Everything
 * reads the live store snapshot, so Add order / Remove / Reschedule re-render here.
 *
 * ONE contained primary per surface: the action rail's `Print Consolidated Label`.
 * Everything else on the page — the overdue banner, the Orders card's Add order,
 * an overage scan's Create order — is outlined or text, so the eye always knows
 * where the page's main action lives.
 *
 * Once the handover has been ATTEMPTED (Completed / Pickup Failed) the page turns
 * into a reconciliation: summary chips under the title, and the plain Orders card
 * is replaced by **Pickup outcome** — three always-visible sections (Picked, Not
 * picked, Overage scans). An overage scan
 * is a barcode with no order behind it; `Create order` walks the Create Order
 * stepper with `?fromOverage=<prId>:<overageId>` and comes back resolved.
 */
import { useMasters } from '../../growOrders/masters'
import { useMemo, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, CalendarDays, CircleAlert, Info, Plus, Printer, ScanBarcode, Search, Truck, X } from 'lucide-react'
import { growOrderActions, pickupRequestById, useGrowOrders } from '../../growOrders/store'
import type { GrowOrder, GrowPickupRequest, PickupRequestStatus } from '../../growOrders/types'
import {
  LOCAL_PR_TAB_SLUG, PR_STATUSES, canAddOrdersTo, isHandedOver, isOpenPr, localPrTabOf, nextPrStatus,
  prHasNothingToCollect, tabOf,
} from '../../growOrders/tabs'
import { toast } from '../../nueva/toast'
import { hubName } from '../../growOrders/hubs'
import { Btn, Card, Checkbox, Chip, Dialog, OutlinedField, SearchBox, TABLE_TH } from './ui'
import { CANCEL_REASONS } from '../../growOrders/pickupReasons'
import {
  CONTACT_SUPPORT, collectorLine, isInTransitToHub, merchantMayChange,
  outcomeReasonLine, usePortalMerchant,
} from './pickupGate'
import { ReschedulePickupDialog } from './pickupDialog'
import {
  STATUS_TONE, fmtAt, fmtDate, fmtDateTime, partyLine, pickupOutcome, pickupPointAddress,
  pickupPointName, prExtraOrders, prOrders, prOutcomeWords, prOverdue, prReconciled, prWindow,
  prWindowStarted,
} from './utils'
import { PrStatusChip } from './pickupRequestTable'

/* ------------------------------------------------------------------ bits ---- */

function SectionCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card className="!p-6">
      <h2 className="text-[20px] font-semibold leading-snug text-grow-ink">{title}</h2>
      {children}
    </Card>
  )
}

function Pair({ label, value }: { label: string; value: string }) {
  return (
    <div className="py-[10px]">
      <p className="text-[14px] leading-tight text-grow-ink-2">{label}</p>
      <p className="mt-1 text-[16px] leading-tight text-grow-ink">{value || '-'}</p>
    </div>
  )
}

/* -------------------------------------------------------- reconciliation ---- */

/** One section of the Pickup outcome card: `Picked (3)` and its table, or `None`. */
function OutcomeSection({ title, count, children }: { title: string; count: number; children: ReactNode }) {
  return (
    <section className="mt-7 first:mt-5">
      <h3 className="text-[15px] font-semibold text-grow-ink">{title} ({count})</h3>
      {count === 0
        ? <p className="mt-2 text-[14px] text-grow-ink-3">None</p>
        : <div className="mt-3 overflow-x-auto">{children}</div>}
    </section>
  )
}

/** The one small-table shell every outcome section uses. */
function MiniTable({ heads, children }: { heads: string[]; children: ReactNode }) {
  return (
    <table className="w-full min-w-[520px] border-collapse text-left">
      <thead>
        <tr className="bg-grow-thead">
          {heads.map((h, i) => (
            <th key={h || i} className={`h-[40px] ${TABLE_TH}`}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>{children}</tbody>
    </table>
  )
}

const TD = 'px-4 py-2.5 text-[15px] text-grow-ink'
const TR = 'border-b border-grow-line last:border-0'
const ORDER_HEADS = ['Order Number', 'Receiver', 'Weight', 'Status']

/**
 * One order row. `tag` is the muted note after the order number that names the
 * order's OTHER parent in words — `Booked under PR-000109` on an order collected
 * here but booked elsewhere, `Picked in PR-000112 →` on one this run left behind.
 */
function OrderRow({ o, tag }: { o: GrowOrder; tag?: ReactNode }) {
  return (
    <tr className={TR}>
      <td className="px-4 py-2.5">
        <Link to={`/grow/orders/${o.id}`} className="text-[15px] text-grow-accent-2 hover:underline">{o.orderNumber}</Link>
        {tag && <span className="ml-2 whitespace-nowrap text-[12px] text-grow-ink-2">{tag}</span>}
      </td>
      <td className={TD}>{o.receiver.name}</td>
      <td className={TD}>{o.pkg.weightKg} kg</td>
      <td className="px-4 py-2.5"><Chip tone={STATUS_TONE[o.status]}>{o.status}</Chip></td>
    </tr>
  )
}

/**
 * **Pickup outcome** — what came off the van, what did not, and what had no order
 * behind it. Replaces the plain Orders card once the request has been attempted;
 * an open request never shows it.
 */
function PickupOutcomeCard({ pr, rows, extras, byId, numberOf, onCreateOrder }: {
  pr: GrowPickupRequest; rows: GrowOrder[]; extras: GrowOrder[]
  byId: Map<string, GrowOrder>; numberOf: (id: string) => string
  onCreateOrder: (overageId: string) => void
}) {
  /* collected on THIS run: the orders booked here that came, plus the ones that
     belong to another request and were handed over anyway */
  const picked = rows.filter((o) => pickupOutcome(o, pr) === 'Picked')
  const missed = rows.filter((o) => pickupOutcome(o, pr) !== 'Picked')
  /* the parent that is NOT this request, in words: picked elsewhere wins (it is
     where the parcel physically went), else booked elsewhere */
  const otherParent = (o: GrowOrder): ReactNode => {
    if (o.pickedInRequestId && o.pickedInRequestId !== pr.id) {
      return (
        <Link to={`/grow/orders/pickups/${o.pickedInRequestId}`} className="text-grow-accent-2 hover:underline">
          Picked in {numberOf(o.pickedInRequestId)} →
        </Link>
      )
    }
    if (o.pickupRequestId && o.pickupRequestId !== pr.id) return `Booked under ${numberOf(o.pickupRequestId)}`
    return undefined
  }

  return (
    <SectionCard title="Pickup outcome">
      <p className="mt-2 flex items-start gap-1.5 text-[13px] text-grow-ink-2">
        <Info size={15} className="mt-[2px] shrink-0" />
        An order can have two parents — the request it was booked under and the request it was picked in — which is why this list is flat, not a tree.
      </p>
      <OutcomeSection title="Picked" count={picked.length + extras.length}>
        <MiniTable heads={ORDER_HEADS}>
          {picked.map((o) => <OrderRow key={o.id} o={o} tag={otherParent(o)} />)}
          {extras.map((o) => <OrderRow key={o.id} o={o} tag={otherParent(o)} />)}
        </MiniTable>
      </OutcomeSection>

      <OutcomeSection title="Not picked" count={missed.length}>
        <MiniTable heads={ORDER_HEADS}>
          {missed.map((o) => <OrderRow key={o.id} o={o} tag={otherParent(o)} />)}
        </MiniTable>
      </OutcomeSection>

      <OverageSection overages={pr.overages} byId={byId} onCreateOrder={onCreateOrder} />
    </SectionCard>
  )
}

/** Barcodes the driver collected that matched no order in the system. */
function OverageSection({ overages, byId, onCreateOrder }: {
  overages: GrowPickupRequest['overages']; byId: Map<string, GrowOrder>; onCreateOrder: (overageId: string) => void
}) {
  return (
    <OutcomeSection title="Overage scans" count={overages.length}>
      <MiniTable heads={['Barcode', 'Scanned at', 'Weight', 'Note', '']}>
        {overages.map((v) => {
          const resolved = v.orderId ? byId.get(v.orderId) : undefined
          return (
            <tr key={v.id} className={TR}>
              <td className="whitespace-nowrap px-4 py-2.5 font-mono text-[14px] text-grow-ink">{v.barcode}</td>
              <td className="whitespace-nowrap px-4 py-2.5 text-[15px] text-grow-ink-2">{fmtDateTime(v.scannedAt)}</td>
              <td className={TD}>{v.weightKg != null ? `${v.weightKg} kg` : '-'}</td>
              <td className="max-w-[280px] px-4 py-2.5 text-[15px] text-grow-ink-2">{v.note || '-'}</td>
              <td className="whitespace-nowrap px-4 py-2.5 text-right">
                {resolved
                  ? <Link to={`/grow/orders/${resolved.id}`} className="text-[15px] text-grow-accent-2 hover:underline">
                    Resolved → {resolved.orderNumber}
                  </Link>
                  : <Btn variant="outlined" color="accent2" size="sm" startIcon={<ScanBarcode size={16} />}
                    onClick={() => onCreateOrder(v.id)}>Create order</Btn>}
              </td>
            </tr>
          )
        })}
      </MiniTable>
    </OutcomeSection>
  )
}

/* -------------------------------------------------------------- timeline ---- */

/**
 * The full nine-state flow, green as far as the request has actually been. The
 * two side exits only appear once they happened — an ordinary request never
 * shows "Pickup Failed" as a pending step.
 */
function Timeline({ pr }: { pr: GrowPickupRequest }) {
  /* several events share ONE status — attaching, removing and rescheduling all
     stamp the state the request is already in — so a step keeps the FIRST time
     it was reached and every note written against it */
  const seen = new Map<PickupRequestStatus, { at: string; notes: string[] }>()
  pr.statusHistory.forEach((e) => {
    const row = seen.get(e.status)
    if (row) { if (e.note) row.notes.push(e.note) } else seen.set(e.status, { at: e.at, notes: e.note ? [e.note] : [] })
  })
  const isExit = (s: PickupRequestStatus) => s === 'Pickup Failed' || s === 'Cancelled'
  const steps = PR_STATUSES.filter((s) => !isExit(s) || seen.has(s))
  const reached = steps.reduce((n, s, i) => (seen.has(s) ? i : n), -1)
  return (
    <ol>
      {steps.map((label, i) => {
        const at = seen.get(label)
        const done = !!at
        const last = i === steps.length - 1
        return (
          <li key={label} className="flex gap-4">
            <div className="flex flex-col items-center">
              <span className={`mt-1 h-[20px] w-[20px] shrink-0 rounded-full ${done ? 'bg-[#56CA00]' : 'bg-grow-ink-3'}`} />
              {!last && <span className={`w-[2px] flex-1 ${i < reached ? 'bg-[#56CA00]' : 'bg-grow-ink-3/50'}`} />}
            </div>
            <div className={`flex-1 ${last ? 'pb-0' : 'pb-6'}`}>
              <span className={`text-[16px] leading-tight ${done ? 'text-grow-ink' : 'text-grow-ink-2'}`}>{label}</span>
              {at && <p className="mt-1 text-[13px] text-grow-ink-2">{fmtDateTime(at.at)}</p>}
              {at?.notes.map((n, k) => (
                <p key={k} className="mt-0.5 text-[13px] leading-snug text-grow-ink-3">{n}</p>
              ))}
            </div>
          </li>
        )
      })}
    </ol>
  )
}

/* ------------------------------------------------------------------ page ---- */

export default function PickupRequestPage() {
  const { id = '' } = useParams()
  const nav = useNavigate()
  const db = useGrowOrders()
  /* store names resolve through the masters too (findStore) — subscribe so a
     pickup point named by a live location renders once the masters arrive */
  useMasters()
  const [attach, setAttach] = useState(false)
  const [reschedule, setReschedule] = useState(false)
  /* the order whose removal would empty an ORDER-BACKED request — that cancels
     the booking, so it is confirmed rather than done silently */
  const [confirmLast, setConfirmLast] = useState<GrowOrder | null>(null)
  const [cancelOpen, setCancelOpen] = useState(false)
  const merchant = usePortalMerchant()

  const pr = db.pickupRequests.find((p) => p.id === id)
  const byId = useMemo(() => new Map(db.orders.map((o) => [o.id, o])), [db.orders])
  if (!pr) {
    return <p className="text-grow-ink-2">Pickup request not found. <Link className="text-grow-accent" to="/grow/orders/pickups">Back to Pickup Requests</Link></p>
  }

  const rows = prOrders(pr, byId)
  const open = isOpenPr(pr.status)
  /* reconciliation only exists once the handover was attempted — a request still
     in flight keeps exactly the page it had before */
  const reconciled = prReconciled(pr)
  const extras = reconciled ? prExtraOrders(pr, db.orders) : []
  const prNumberOf = (prId: string) => db.pickupRequests.find((x) => x.id === prId)?.number ?? prId
  const ftl = pr.shipmentType === 'FTL'
  const overdue = prOverdue(pr)
  const next = nextPrStatus(pr.status)
  /* a driver who arrives to an empty dock has a FAILED pickup — the store refuses
     the Completed transition, so the action says so before it is pressed */
  const nothingToCollect = prHasNothingToCollect(pr)
  const blockedComplete = next === 'Completed' && nothingToCollect
  const windowStarted = prWindowStarted(pr)
  const cancelled = pr.status === 'Cancelled'
  const backTo = `/grow/orders/pickups?tab=${LOCAL_PR_TAB_SLUG[localPrTabOf(pr, new Date(), pickupRequestById)]}`
  const origin = pickupPointAddress(pr, db.stores)
  /* a vehicle can be booked before anyone knows where it delivers; a parcel
     handover always lands at an inbound hub, derived when it was booked */
  const destination = ftl
    ? (pr.shipTo ? partyLine(pr.shipTo) : 'To be confirmed')
    : (pr.destinationCode ? hubName(pr.destinationCode, db.stores) : 'To be confirmed')

  const advance = () => {
    const s = growOrderActions.advancePickupRequest(pr.id)
    if (s === 'Pickup Failed' && next === 'Completed') toast.error(`${pr.number} marked Pickup Failed — no orders to collect`)
    else if (s) toast.success(`Moved to ${s}`)
    else toast.info('This request is already at the end of the flow.')
  }
  /* M1/M2: the merchant may cancel or move a request only up to the config's
     `merchantCancelUntil` state — past it a driver is already on it */
  const mayChange = open && merchantMayChange(pr, merchant.config)
  const lockedByDriver = open && !mayChange
  const collector = collectorLine(pr)
  const reasonLine = outcomeReasonLine(pr)
  const reattempt = pr.reattemptPrId ? db.pickupRequests.find((x) => x.id === pr.reattemptPrId) : undefined
  const parent = pr.parentPrId ? db.pickupRequests.find((x) => x.id === pr.parentPrId) : undefined
  /**
   * Removing an order always walks it ONE status back — Pickup Scheduled →
   * Order Created, i.e. straight back onto Ready for Pickup. Emptying an
   * ORDER-BACKED request also ends the booking, so that case is confirmed
   * first; a RESERVED request keeps its slot and simply shows 0 of n again.
   */
  const removeFromPickup = (o: GrowOrder) => {
    growOrderActions.detachOrderFromPickup(pr.id, o.id)
    toast.success(`${o.orderNumber} removed from ${pr.number} — back on Ready for Pickup`)
  }
  const removeOrder = (o: GrowOrder) => {
    if (!pr.blind && rows.length === 1) {
      /* emptying the request cancels it — the same gate as Cancel Pickup */
      if (!mayChange) { toast.error(CONTACT_SUPPORT); return }
      setConfirmLast(o); return
    }
    removeFromPickup(o)
  }
  const removeLast = () => {
    const o = confirmLast
    if (!o) return
    growOrderActions.detachOrderFromPickup(pr.id, o.id)
    growOrderActions.cancelPickupRequest(pr.id, `Last order removed (${o.orderNumber})`, 'Merchant')
    toast.success(`${pr.number} cancelled — ${o.orderNumber} is back on Ready for Pickup`)
    setConfirmLast(null)
  }

  return (
    <div>
      {/* header */}
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <button type="button" aria-label="Back to Pickup Requests" onClick={() => nav(backTo)}
          className="-ml-2 flex h-9 w-9 items-center justify-center rounded-full text-grow-ink transition-colors hover:bg-grow-ink/5">
          <ArrowLeft size={22} />
        </button>
        <h1 className="text-[24px] font-medium leading-[1.33] text-grow-ink">Pickup Request : {pr.number}</h1>
        {pr.blind && <span className="inline-flex h-[28px] items-center rounded-full bg-grow-ink/[0.08] px-3 text-[14px] leading-none text-grow-ink-2">Reserved</span>}
        {ftl && <span className="inline-flex h-[28px] items-center rounded-full bg-grow-ink/[0.08] px-3 text-[14px] leading-none text-grow-ink-2">FTL</span>}
        <PrStatusChip p={pr} />
        {isHandedOver(pr) && <Chip tone="success">Handed Over</Chip>}
        {isInTransitToHub(pr) && <Chip tone="info">In transit to hub</Chip>}
        {reconciled && prOutcomeWords(pr) && (
          <span className="text-[14px] text-grow-ink-2">{prOutcomeWords(pr)}</span>
        )}
        {overdue && <Chip tone="error">Overdue</Chip>}
      </div>

      {/* why it ended, who ended it, and the re-attempt chain either way round */}
      {(reasonLine || pr.parentPrId || pr.reattemptPrId) && (
        <div className="-mt-2 mb-5 flex flex-wrap items-center gap-x-5 gap-y-1 text-[14px] text-grow-ink-2">
          {reasonLine && <span className="text-grow-ink">{reasonLine}</span>}
          {pr.reattemptPrId && (
            <span>Re-attempt scheduled:{' '}
              <Link to={`/grow/orders/pickups/${pr.reattemptPrId}`} className="text-grow-accent-2 hover:underline">
                {reattempt?.number ?? pr.reattemptPrId}
              </Link>
            </span>
          )}
          {pr.parentPrId && (
            <span>Re-attempt of{' '}
              <Link to={`/grow/orders/pickups/${pr.parentPrId}`} className="text-grow-accent-2 hover:underline">
                {parent?.number ?? pr.parentPrId}
              </Link>
              {pr.attempt > 1 && <span className="text-grow-ink-3"> · attempt {pr.attempt} of {pr.maxAttempts}</span>}
            </span>
          )}
        </div>
      )}

      {open && nothingToCollect && windowStarted && (
        <div className="mb-5 flex flex-wrap items-center gap-3 rounded-[6px] border border-grow-warning/40 bg-grow-warning/10 px-4 py-3">
          <CircleAlert size={18} className="shrink-0 text-[#B57F00]" />
          <span className="text-[14px] text-[#B57F00]">
            No orders on this request yet — add orders before the pickup or it will be marked failed.
          </span>
        </div>
      )}

      {overdue && (
        <div className="mb-5 flex flex-wrap items-center gap-3 rounded-[6px] border border-grow-warning/40 bg-grow-warning/10 px-4 py-3">
          <CircleAlert size={18} className="shrink-0 text-[#B57F00]" />
          <span className="text-[14px] text-[#B57F00]">
            The pickup window closed on {prWindow(pr)} and this request is still open.
          </span>
          <Btn variant="outlined" color="accent2" size="sm" className="ml-auto" disabled={!mayChange} onClick={() => setReschedule(true)}>Reschedule</Btn>
        </div>
      )}

      {/* `min-w-0` on the 1fr track: a grid item's min-width defaults to its
          min-content, so without it the cards' own minimums pushed the whole
          two-column body past the viewport and the page scrolled sideways. */}
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_420px]">
        <div className="min-w-0 space-y-6">
          {/* --------------------------------------------- pickup details ---- */}
          <SectionCard title="Pickup Details">
            <div className="mt-5 flex items-center gap-4">
              <div className="min-w-0 max-w-[40%]">
                <p className="text-[12px] font-medium uppercase tracking-[0.8px] text-grow-ink-2">Origin · Pickup Address</p>
                <p className="mt-1.5 text-[15px] leading-snug text-grow-ink">{origin}</p>
              </div>
              <div className="relative flex min-w-[80px] flex-1 items-center justify-center">
                <span className="absolute inset-x-0 top-1/2 border-t-2 border-dashed border-grow-ink/25" />
                <Truck size={44} strokeWidth={1.5} className="relative bg-white px-1 text-grow-ink-2" />
              </div>
              <div className="min-w-0 max-w-[40%] text-right">
                <p className="text-[12px] font-medium uppercase tracking-[0.8px] text-grow-ink-2">Destination · Ship To</p>
                <p className="mt-1.5 text-[15px] leading-snug text-grow-ink">{destination}</p>
              </div>
            </div>

            <div className="my-5 border-t border-grow-line" />

            <div className="grid gap-x-8 sm:grid-cols-2">
              <Pair label="Pickup Start" value={fmtAt(pr.startAt)} />
              <Pair label="Pickup End" value={fmtAt(pr.endAt)} />
              <Pair label="Pickup Address" value={pickupPointName(pr, db.stores)} />
              {collector && (
                <Pair label={pr.carrierMode === 'CARRIER' ? 'Carrier' : 'Driver'} value={collector} />
              )}
              <Pair label="Contact Name" value={pr.contactName} />
              <Pair label="Contact Number" value={pr.contactNumber} />
              <Pair label="Instructions for driver" value={pr.instructions ?? ''} />
              <Pair label="Internal note" value={pr.note} />
            </div>
          </SectionCard>

          {/* --------------------------------------------------- expected ---- */}
          {pr.blind && (
            <SectionCard title="Expected">
              <div className="mt-2 grid gap-x-8 sm:grid-cols-3">
                {ftl ? (
                  <>
                    <Pair label="Service Type" value={pr.ftlServiceType ?? '-'} />
                    <Pair label="Vehicle Type" value={pr.vehicleType ?? '-'} />
                    <Pair label="Number of Vehicles" value={String(pr.vehicleUnit ?? 1)} />
                    <Pair label="Estimated Load" value={pr.expectedWeightKg != null ? `${pr.expectedWeightKg.toLocaleString()} kg` : '-'} />
                  </>
                ) : (
                  <>
                    <Pair label="Expected Orders" value={`${rows.length} of ${pr.expectedPieces ?? 0}`} />
                    <Pair label="Expected Weight" value={pr.expectedWeightKg != null ? `~${pr.expectedWeightKg} kg` : '-'} />
                    <Pair label="Size class" value={pr.sizeClass ?? '-'} />
                  </>
                )}
              </div>
            </SectionCard>
          )}

          {/* -------------------------------- orders / pickup outcome ---- */}
          {reconciled ? (
            <PickupOutcomeCard pr={pr} rows={rows} extras={extras} byId={byId} numberOf={prNumberOf}
              onCreateOrder={(ovId) => nav(`/grow/orders/add?fromOverage=${pr.id}:${ovId}`)} />
          ) : (
          <SectionCard title={`Orders (${rows.length})`}>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[560px] border-collapse text-left">
                <thead>
                  <tr className="bg-grow-thead">
                    {['Order Number', 'Receiver', 'Weight', 'Status', ''].map((h, i) => (
                      <th key={h || i} className={`h-[40px] ${TABLE_TH} ${h === '' ? 'w-[110px]' : ''}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 && (
                    <tr><td colSpan={5} className="px-4 py-6 text-[14px] text-grow-ink-2">
                      {pr.blind
                        ? 'No orders yet — the driver collects against the expected figures above.'
                        : 'No orders are linked to this request.'}
                    </td></tr>
                  )}
                  {rows.map((o) => (
                    <tr key={o.id} className={TR}>
                      <td className="px-4 py-2.5">
                        <Link to={`/grow/orders/${o.id}`} className="text-[15px] text-grow-accent-2 hover:underline">{o.orderNumber}</Link>
                      </td>
                      <td className={TD}>{o.receiver.name}</td>
                      <td className={TD}>{o.pkg.weightKg} kg</td>
                      <td className="px-4 py-2.5"><Chip tone={STATUS_TONE[o.status]}>{o.status}</Chip></td>
                      <td className="px-4 py-2.5 text-right">
                        {open && (
                          <Btn variant="text" color="error" size="sm" onClick={() => removeOrder(o)}>Remove</Btn>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* a reserved slot survives an empty order list — that is the point of it */}
            {pr.blind && open && rows.length === 0 && (
              <p className="mt-4 rounded-[4px] bg-grow-ink/[0.04] px-3 py-2 text-[13px] text-grow-ink-2">
                Reserved pickup keeps its slot — add orders before the window starts.
              </p>
            )}
            {/* C5 / scenario 25: orders join only while the request is at or before
                the account's add-until state — past it the driver is on the way and
                extras would be overages, so they are booked as a new pickup */}
            {pr.blind && open && !canAddOrdersTo(pr, merchant.config.allowAddToExistingUntil) && (
              <p className="mt-4 rounded-[4px] bg-grow-ink/[0.04] px-3 py-2 text-[13px] text-grow-ink-2">
                {pr.number} is already {pr.status} — new orders cannot join it. Book them as a new pickup; the driver on
                this collection will not collect them.
              </p>
            )}
            {pr.blind && open && canAddOrdersTo(pr, merchant.config.allowAddToExistingUntil) && (
              <div className="mt-5 flex justify-end">
                {ftl
                  ? <Btn variant="outlined" color="accent2" startIcon={<Truck size={17} />} onClick={() => nav(`/grow/orders/add/vehicle?fromPickup=${pr.id}`)}>Create FTL order</Btn>
                  : <Btn variant="outlined" color="accent2" startIcon={<Plus size={17} />} onClick={() => setAttach(true)}>Add order</Btn>}
              </div>
            )}
          </SectionCard>
          )}

          {/* an OPEN request has no reconciliation yet, but a scan can already
              have been recorded against it — show it on its own */}
          {!reconciled && pr.overages.length > 0 && (
            <SectionCard title="Scans">
              <OverageSection overages={pr.overages} byId={byId}
                onCreateOrder={(ovId) => nav(`/grow/orders/add?fromOverage=${pr.id}:${ovId}`)} />
            </SectionCard>
          )}
        </div>

        {/* ---------------------------------------------------- timeline ---- */}
        <div className="lg:sticky lg:top-4 lg:self-start">
          <Card className="!p-6">
            <Timeline pr={pr} />
          </Card>
          <div className="mt-4 flex flex-col gap-3">
            <span title={cancelled ? 'A cancelled pickup has no label to print' : undefined}>
              <Btn color="accent2" className="w-full" disabled={cancelled} startIcon={<Printer size={17} />}
                onClick={() => toast.info('Print Consolidated Label — demo')}>
                Print Consolidated Label
              </Btn>
            </span>
            <Btn variant="outlined" color="neutral" disabled={!mayChange} startIcon={<CalendarDays size={17} />} onClick={() => setReschedule(true)}>
              Reschedule
            </Btn>
            <Btn variant="outlined" color="error" disabled={!mayChange} startIcon={<X size={17} />} onClick={() => setCancelOpen(true)}>Cancel Pickup</Btn>
            {lockedByDriver && (
              <p className="-mt-1 text-[13px] leading-snug text-grow-ink-2">{CONTACT_SUPPORT}</p>
            )}
            {/* dev aid for 3PL requests ONLY — a carrier's events arrive by
                integration; an own-fleet request's status comes from its trip */}
            {pr.carrierMode === 'CARRIER' && (
              <span title={blockedComplete ? 'A pickup with no orders cannot be completed' : undefined}>
                <Btn variant="text" color="neutral" size="sm" className="w-full" disabled={!next || blockedComplete} onClick={advance}>
                  {next ? `Simulate carrier event — ${next}` : open ? 'Flow complete' : `${pr.status} — no further steps`}
                </Btn>
              </span>
            )}
          </div>
        </div>
      </div>

      {confirmLast && (
        <Dialog open title="Cancel this pickup request?"
          subtitle={`Removing the last order will cancel ${pr.number}. The order moves back to Ready for Pickup.`}
          width="w-[520px]" onClose={() => setConfirmLast(null)}
          footer={<>
            <Btn variant="outlined" color="neutral" onClick={() => setConfirmLast(null)}>Keep order</Btn>
            <Btn color="error" startIcon={<X size={17} />} onClick={removeLast}>Remove &amp; cancel pickup</Btn>
          </>}>
          <p className="text-[14px] text-grow-ink-2">
            {confirmLast.orderNumber} · {confirmLast.receiver.name} — {confirmLast.pkg.weightKg} kg
          </p>
        </Dialog>
      )}
      {cancelOpen && <CancelPickupDialog requests={[pr]} onClose={() => setCancelOpen(false)} onDone={() => setCancelOpen(false)} />}
      {attach && <AddOrdersDialog pr={pr} orders={db.orders} onClose={() => setAttach(false)} />}
      {reschedule && <ReschedulePickupDialog requests={[pr]} onClose={() => setReschedule(false)} onDone={() => setReschedule(false)} />}
    </div>
  )
}

/* ------------------------------------------------------------ cancelling ---- */

/**
 * **Cancel pickup** — asks WHY (CANCEL_REASONS, the portal's own listbox) before
 * cancelling, for one request (detail page) or a selection (list bulk action).
 * Only requests the merchant may still change are cancelled; the callers gate
 * the button, and this filters again so a stale selection cannot slip through.
 */
export function CancelPickupDialog({ requests, onClose, onDone }: {
  requests: GrowPickupRequest[]; onClose: () => void; onDone: (n: number) => void
}) {
  const merchant = usePortalMerchant()
  const [reason, setReason] = useState('')
  const targets = requests.filter((p) => isOpenPr(p.status) && merchantMayChange(p, merchant.config))
  const skipped = requests.length - targets.length
  const one = targets.length === 1 ? targets[0] : undefined
  const apply = () => {
    targets.forEach((p) => growOrderActions.cancelPickupRequest(p.id, reason, 'Merchant'))
    toast.success(one ? `${one.number} cancelled` : `${targets.length} pickup requests cancelled`)
    onDone(targets.length)
  }
  return (
    <Dialog open title="Cancel pickup" width="w-[520px]" onClose={onClose}
      subtitle={one ? `${one.number} · ${prWindow(one)}` : `${targets.length} pickup request${targets.length === 1 ? '' : 's'}`}
      footer={<>
        <Btn variant="outlined" color="neutral" onClick={onClose}>Keep pickup</Btn>
        <Btn color="error" disabled={!reason || targets.length === 0} startIcon={<X size={17} />} onClick={apply}>
          Cancel pickup{targets.length > 1 ? `s (${targets.length})` : ''}
        </Btn>
      </>}>
      {targets.length === 0 ? (
        <p className="text-[14px] text-grow-ink-2">{CONTACT_SUPPORT}.</p>
      ) : (
        /* tall enough for the reason listbox — the Dialog clips overflow */
        <div className="min-h-[260px] space-y-4 pt-1">
          <OutlinedField label="Reason" required value={reason} onChange={setReason}
            options={CANCEL_REASONS.map((r) => ({ value: r.code, label: r.label }))}
            helper="The orders go back to Ready for Pickup." />
          {skipped > 0 && (
            <p className="text-[13px] text-grow-ink-2">
              {skipped} selected request{skipped === 1 ? ' is' : 's are'} closed or already assigned to a driver and
              will not be cancelled — contact support for those.
            </p>
          )}
        </div>
      )}
    </Dialog>
  )
}

/* ------------------------------------------------------------- attaching ---- */

/**
 * **Add orders** — the same centred popup as Book a Pickup, so attaching orders
 * and booking a pickup never look like two different products.
 *
 * The paid orders that could still join this request — the store's own rule is
 * `tabOf(o) === 'Ready for Pickup'`, the exact predicate attachOrdersToPickup
 * enforces, so nothing that is listed here can be silently refused. A blind
 * reserved request declared how many pieces to expect, so the live counter warns as soon
 * as the selection runs past that number.
 */
function AddOrdersDialog({ pr, orders, onClose }: {
  pr: GrowPickupRequest; orders: GrowOrder[]; onClose: () => void
}) {
  const [q, setQ] = useState('')
  const [sel, setSel] = useState<Set<string>>(new Set())
  const candidates = useMemo(() => orders.filter((o) => tabOf(o) === 'Ready for Pickup'), [orders])
  const s = q.trim().toLowerCase()
  const shown = candidates.filter((o) => !s
    || [o.orderNumber, o.receiver.name, o.receiver.businessName].some((v) => v.toLowerCase().includes(s)))

  const allChecked = shown.length > 0 && shown.every((o) => sel.has(o.id))
  const someChecked = shown.some((o) => sel.has(o.id))
  const toggleAll = (v: boolean) => setSel((p) => {
    const n = new Set(p); shown.forEach((o) => (v ? n.add(o.id) : n.delete(o.id))); return n
  })
  const toggle = (id: string) => setSel((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n })

  /* only a reserved request declared an expectation — an order-backed one has none */
  const expected = pr.expectedPieces
  const onRequest = pr.orderIds.length + sel.size
  const over = expected !== null && onRequest > expected

  const apply = () => {
    const ok = growOrderActions.attachOrdersToPickup(pr.id, [...sel])
    if (ok.length) toast.success(`${ok.length} order${ok.length === 1 ? '' : 's'} added to ${pr.number}`)
    else toast.info('None of those orders could be added.')
    onClose()
  }

  return (
    <Dialog open title={`Add orders to ${pr.number}`} subtitle="Paid orders without a pickup request" onClose={onClose}
      footer={<>
        <Btn variant="outlined" color="neutral" onClick={onClose}>Cancel</Btn>
        <Btn color="accent2" disabled={sel.size === 0} startIcon={<Plus size={17} />} onClick={apply}>Add ({sel.size})</Btn>
      </>}>
      <div className="mb-3 flex items-center justify-between gap-3 pt-1">
        {expected !== null
          ? <Chip tone={over ? 'warning' : 'neutral'}>{onRequest} of {expected} expected</Chip>
          : <span className="text-[13px] text-grow-ink-2">{onRequest} order{onRequest === 1 ? '' : 's'} on this request</span>}
        <SearchBox value={q} onChange={setQ} icon={<Search />} width="w-[240px]" placeholder="Search order, receiver…" />
      </div>
      {over && (
        <p className="mb-3 rounded-[4px] bg-grow-warning/10 px-3 py-2 text-[13px] text-[#B57F00]">
          That is more than the {expected} piece{expected === 1 ? '' : 's'} declared when {pr.number} was booked — the driver
          may not have room. Reschedule or book a second pickup if the handover has grown.
        </p>
      )}
      <div className="max-h-[340px] overflow-auto rounded-[6px] border border-grow-line">
        {shown.length === 0 ? (
          <p className="px-3 py-5 text-[13px] text-grow-ink-3">
            No paid orders are waiting for a pickup — pay for an order first, then add it here.
          </p>
        ) : (
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="sticky top-0 bg-grow-thead text-left">
                <th className="w-[44px] pl-3">
                  <Checkbox checked={allChecked} indeterminate={!allChecked && someChecked} onChange={toggleAll} ariaLabel="Select all" />
                </th>
                {['Order Number', 'Receiver', 'Qty · Weight', 'Created'].map((h) => (
                  <th key={h} className="whitespace-nowrap px-3 py-2 text-[12px] font-semibold uppercase tracking-[0.17px] text-grow-ink">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((o) => (
                <tr key={o.id} onClick={() => toggle(o.id)}
                  className={`cursor-pointer border-b border-grow-line last:border-0 hover:bg-grow-ink/[0.04] ${sel.has(o.id) ? 'bg-grow-accent-2/[0.08]' : ''}`}>
                  <td className="pl-3" onClick={(e) => e.stopPropagation()}>
                    <Checkbox checked={sel.has(o.id)} onChange={() => toggle(o.id)} ariaLabel={`Select ${o.orderNumber}`} />
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 font-medium text-grow-accent-2">{o.orderNumber}</td>
                  <td className="max-w-[180px] truncate px-3 py-2 text-grow-ink">{o.receiver.name}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-grow-ink-2">{o.pkg.count} · {o.pkg.weightKg} kg</td>
                  <td className="whitespace-nowrap px-3 py-2 text-grow-ink-2">{fmtDate(o.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </Dialog>
  )
}
