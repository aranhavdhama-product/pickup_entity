/**
 * Grow merchant portal — View Pickup Request, on the console PR detail's anatomy
 * (LocalPickup/PickupRequestDetail, spec §15).
 *
 * PageHeader (back + number + Reserved / FTL / outcome-aware status pills, the
 * one primary `Print Consolidated Label` and a kebab of the merchant actions
 * currently allowed) over Panels: Summary · Pickup outcome (Booked · Picked ·
 * Not picked · Overage scans, flat — an order can have two parents) on the
 * left; Trip · Timeline on the right. Everything reads the live store
 * snapshot, so Add order / Remove / Reschedule re-render in place.
 *
 * An overage scan is a barcode with no order behind it; `Create order` walks
 * the Create Order stepper with `?fromOverage=<prId>:<overageId>` and comes
 * back resolved.
 */
import { useMasters } from '../../growOrders/masters'
import { useMemo, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { CircleAlert, Info, Plus, Printer, ScanBarcode, Truck } from 'lucide-react'
import { growOrderActions, pickupRequestById, useGrowOrders } from '../../growOrders/store'
import type { GrowOrder, GrowPickupRequest, PickupRequestStatus } from '../../growOrders/types'
import {
  LOCAL_PR_TAB_SLUG, PR_STATUSES, canAddOrdersTo, isHandedOver, isOpenPr, localPrTabOf, nextPrStatus,
  prHasNothingToCollect, tabOf,
} from '../../growOrders/tabs'
import { toast } from '../../nueva/toast'
import {
  Button, Checkbox, EmptyState, Field, KebabMenu, MenuSelect, Modal, PageHeader, Panel, SearchInput,
  SimpleTable, StatusPill, type MenuItem,
} from '../../nueva/components'
import { hubName } from '../../growOrders/hubs'
import { CANCEL_REASONS } from '../../growOrders/pickupReasons'
import {
  CONTACT_SUPPORT, collectorLine, isInTransitToHub, merchantMayChange,
  outcomeReasonLine, usePortalMerchant,
} from './pickupGate'
import { ReschedulePickupDialog } from './pickupDialog'
import {
  PARTIALLY_PICKED, PR_STATUS_TONE, STATUS_TONE, fmtAt, fmtDate, fmtDateTime, partyLine, pickupOutcome,
  pickupPointAddress, pickupPointName, pillTone, prExtraOrders, prOrders, prOutcomeLabel, prOutcomeWords,
  prOverdue, prReconciled, prWindow, prWindowStarted,
} from './utils'

/* ------------------------------------------------------------------ bits ---- */

/** Key / value grid — the console PR detail's Pairs. */
function Pairs({ pairs }: { pairs: [string, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-3 gap-x-6 gap-y-3 px-5 pb-5 pt-2">
      {pairs.map(([k, v]) => (
        <div key={k} className="min-w-0">
          <dt className="text-[12px] font-bold text-ink-3">{k}</dt>
          <dd className="mt-0.5 break-words text-[13px] text-ink">{v === '' || v == null ? '—' : v}</dd>
        </div>
      ))}
    </dl>
  )
}

/** One section of the Pickup outcome panel: `Booked (3)` + an optional action, then its table or a muted line. */
function OutcomeSection({ title, count, action, empty = 'None', children }: {
  title: string; count: number; action?: ReactNode; empty?: string; children: ReactNode
}) {
  return (
    <section className="mt-3 border-t border-line pt-3 first-of-type:border-t-0">
      <div className="flex items-center gap-2 px-5 pb-2">
        <h3 className="text-[13px] font-bold text-ink">{title} ({count})</h3>
        {action && <span className="ml-auto">{action}</span>}
      </div>
      {count === 0 ? <p className="px-5 pb-1 text-[13px] text-ink-3">{empty}</p> : children}
    </section>
  )
}

/** A soft-tinted notice line above the panels (overdue, empty dock). */
function Notice({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-3 rounded-md border border-line bg-warning-bg px-4 py-2.5">
      <CircleAlert size={15} className="shrink-0 text-warning-fg" />
      <span className="text-[13px] text-warning-fg">{children}</span>
      {action && <span className="ml-auto">{action}</span>}
    </div>
  )
}

/** The outcome-aware status pill (`Partially picked`, `+n` overage badge) — the grid speaks the same words. */
function PrStatus({ pr }: { pr: GrowPickupRequest }) {
  const label = prOutcomeLabel(pr)
  const partial = label === PARTIALLY_PICKED
  const n = pr.overages.length
  return (
    <span className="inline-flex items-center gap-1" title={prOutcomeWords(pr) || pr.status}>
      <StatusPill label={label} tone={partial ? 'warning' : pillTone(PR_STATUS_TONE[pr.status])} />
      {n > 0 && <StatusPill label={`+${n}`} tone="danger" />}
    </span>
  )
}

const orderLink = (o: GrowOrder) => (
  <Link to={`/grow/orders/${o.id}`} onClick={(e) => e.stopPropagation()}
    className="font-mono text-[12px] font-bold text-brand-500 hover:text-brand-600">{o.orderNumber}</Link>
)

/** Barcodes the driver collected that matched no order in the system. */
function OverageTable({ overages, byId, onCreateOrder }: {
  overages: GrowPickupRequest['overages']; byId: Map<string, GrowOrder>; onCreateOrder: (overageId: string) => void
}) {
  return (
    <SimpleTable<GrowPickupRequest['overages'][number]> rows={overages} rowKey={(v) => v.id}
      columns={[
        { label: 'Barcode', render: (v) => <span className="font-mono text-[12px] font-bold text-ink">{v.barcode}</span> },
        { label: 'Scanned at', render: (v) => fmtDateTime(v.scannedAt) },
        { label: 'Weight', align: 'right', render: (v) => (v.weightKg != null ? `${v.weightKg} kg` : '—') },
        { label: 'Note', render: (v) => v.note || '—' },
        { label: 'Status', align: 'right', render: (v) => {
          const resolved = v.orderId ? byId.get(v.orderId) : undefined
          return resolved
            ? <Link to={`/grow/orders/${resolved.id}`} className="font-bold text-brand-500 hover:text-brand-600">Resolved → {resolved.orderNumber}</Link>
            : <Button size="sm" variant="outline" icon={<ScanBarcode size={13} />} onClick={() => onCreateOrder(v.id)}>Create order</Button>
        } },
      ]} />
  )
}

/* -------------------------------------------------------------- timeline ---- */

/**
 * The full flow, reached steps marked, as far as the request has actually been.
 * The two side exits only appear once they happened — an ordinary request never
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
    <ol className="flex flex-col px-5 pb-5 pt-1">
      {steps.map((label, i) => {
        const at = seen.get(label)
        return (
          <li key={label} className="relative border-l border-line pb-3 pl-4 last:pb-0">
            <span className={`absolute -left-[4.5px] top-1.5 h-2 w-2 rounded-full ${i === reached ? 'bg-brand-500' : at ? 'bg-success-fg' : 'bg-warm-300'}`} />
            <p className={`text-[13px] ${at ? 'font-bold text-ink' : 'text-ink-3'}`}>{label}</p>
            {at?.notes.map((n, k) => <p key={k} className="text-[12.5px] text-ink-2">{n}</p>)}
            {at && <p className="text-[11.5px] text-ink-3">{fmtDateTime(at.at)}</p>}
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
    return (
      <div>
        <PageHeader title="Pickup Request" onBack={() => nav('/grow/orders/pickups')} />
        <Panel><EmptyState title="This pickup request does not exist" hint="It may have been removed, or the link is from another browser's data." /></Panel>
      </div>
    )
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

  const createOrderFor = (ovId: string) => nav(`/grow/orders/add?fromOverage=${pr.id}:${ovId}`)
  /* Booked / Picked / Not picked — Picked and Not picked exist once the handover was attempted */
  const picked = reconciled ? [...rows.filter((o) => pickupOutcome(o, pr) === 'Picked'), ...extras] : []
  const missed = reconciled ? rows.filter((o) => pickupOutcome(o, pr) !== 'Picked') : []
  /* the parent that is NOT this request, in words: picked elsewhere wins (it is
     where the parcel physically went), else booked elsewhere */
  const otherParent = (o: GrowOrder): ReactNode => {
    if (o.pickedInRequestId && o.pickedInRequestId !== pr.id) {
      return (
        <Link to={`/grow/orders/pickups/${o.pickedInRequestId}`} onClick={(e) => e.stopPropagation()}
          className="font-bold text-brand-500 hover:text-brand-600">picked in {prNumberOf(o.pickedInRequestId)} →</Link>
      )
    }
    if (o.pickupRequestId && o.pickupRequestId !== pr.id) return `booked under ${prNumberOf(o.pickupRequestId)}`
    return undefined
  }
  const orderTable = (list: GrowOrder[], removable: boolean) => (
    <SimpleTable<GrowOrder> rows={list} rowKey={(o) => o.id} onRowClick={(o) => nav(`/grow/orders/${o.id}`)}
      columns={[
        { label: 'Order Number', render: (o) => {
          const tag = otherParent(o)
          return <span className="flex flex-wrap items-baseline gap-x-2">{orderLink(o)}{tag && <span className="text-[12px] text-ink-3">{tag}</span>}</span>
        } },
        { label: 'Receiver', render: (o) => o.receiver.name || '—' },
        { label: 'Weight', align: 'right', render: (o) => `${o.pkg.weightKg} kg` },
        { label: 'Status', render: (o) => <StatusPill label={o.status} tone={pillTone(STATUS_TONE[o.status])} /> },
        ...(removable ? [{ label: ' ', align: 'right' as const, render: (o: GrowOrder) => (
          <span onClick={(e) => e.stopPropagation()}>
            <Button size="sm" variant="ghost" onClick={() => removeOrder(o)}>Remove</Button>
          </span>
        ) }] : []),
      ]} />
  )
  const canAdd = pr.blind && open && canAddOrdersTo(pr, merchant.config.allowAddToExistingUntil)

  /* the merchant's actions — only those allowed right now (the kebab has no disabled state) */
  const items: MenuItem[] = [
    ...(mayChange ? [{ label: 'Reschedule', onClick: () => setReschedule(true) }] : []),
    /* dev aid for 3PL requests ONLY — a carrier's events arrive by
       integration; an own-fleet request's status comes from its trip */
    ...(pr.carrierMode === 'CARRIER' && next && !blockedComplete
      ? [{ label: `Simulate carrier event — ${next}`, onClick: advance }] : []),
    ...(mayChange ? [{ label: 'Cancel Pickup', tone: 'danger' as const, onClick: () => setCancelOpen(true) }] : []),
  ]

  return (
    <div>
      <PageHeader title={`Pickup Request ${pr.number}`} onBack={() => nav(backTo)}
        subtitle={`${pickupPointName(pr, db.stores)} → ${destination}`}
        right={(
          <div className="flex items-center gap-2">
            {pr.blind && <StatusPill label="Reserved" tone="info" />}
            {ftl && <StatusPill label="FTL" tone="neutral" />}
            <PrStatus pr={pr} />
            {isHandedOver(pr) && <StatusPill label="Handed Over" tone="success" />}
            {isInTransitToHub(pr) && <StatusPill label="In transit to hub" tone="info" />}
            {overdue && <StatusPill label="Overdue" tone="danger" />}
            <span title={cancelled ? 'A cancelled pickup has no label to print' : undefined}>
              <Button disabled={cancelled} icon={<Printer size={14} />}
                onClick={() => toast.info('Print Consolidated Label — demo')}>Print Consolidated Label</Button>
            </span>
            {items.length > 0 && <KebabMenu items={items} />}
          </div>
        )} />

      {/* why it ended, who ended it, the re-attempt chain either way round, and the driver lock */}
      {(reasonLine || pr.parentPrId || pr.reattemptPrId || lockedByDriver || (reconciled && prOutcomeWords(pr))) && (
        <div className="mb-4 flex flex-wrap items-center gap-x-5 gap-y-1 text-[13px] text-ink-2">
          {reconciled && prOutcomeWords(pr) && <span>{prOutcomeWords(pr)}</span>}
          {reasonLine && <span className="text-ink">{reasonLine}</span>}
          {pr.reattemptPrId && (
            <span>Re-attempt scheduled:{' '}
              <Link to={`/grow/orders/pickups/${pr.reattemptPrId}`} className="font-mono font-bold text-brand-500">{reattempt?.number ?? pr.reattemptPrId}</Link>
            </span>
          )}
          {pr.parentPrId && (
            <span>Re-attempt of{' '}
              <Link to={`/grow/orders/pickups/${pr.parentPrId}`} className="font-mono font-bold text-brand-500">{parent?.number ?? pr.parentPrId}</Link>
              {pr.attempt > 1 && <span className="text-ink-3"> · attempt {pr.attempt} of {pr.maxAttempts}</span>}
            </span>
          )}
          {lockedByDriver && <span className="text-ink-3">{CONTACT_SUPPORT}</span>}
        </div>
      )}

      {open && nothingToCollect && windowStarted && (
        <Notice>No orders on this request yet — add orders before the pickup or it will be marked failed.</Notice>
      )}
      {overdue && (
        <Notice action={<Button size="sm" variant="outline" disabled={!mayChange} onClick={() => setReschedule(true)}>Reschedule</Button>}>
          The pickup window closed on {prWindow(pr)} and this request is still open.
        </Notice>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="flex min-w-0 flex-col gap-4 lg:col-span-2">
          <Panel title="Summary">
            <Pairs pairs={[
              ['Pickup start', fmtAt(pr.startAt)],
              ['Pickup end', fmtAt(pr.endAt)],
              ['Type', ftl ? 'FTL' : 'LTL'],
              ['Pickup address', <>{pickupPointName(pr, db.stores)}<span className="block text-[12px] text-ink-3">{origin}</span></>],
              [ftl ? 'Ship To' : 'Drops at', destination],
              ['Contact', [pr.contactName, pr.contactNumber].filter(Boolean).join(' · ')],
              ...(pr.blind ? (ftl
                ? [
                  ['Service Type', pr.ftlServiceType ?? ''],
                  ['Vehicle', pr.vehicleType ? `${pr.vehicleUnit ?? 1} × ${pr.vehicleType}` : ''],
                  ['Estimated load', pr.expectedWeightKg != null ? `${pr.expectedWeightKg.toLocaleString()} kg` : ''],
                ] as [string, ReactNode][]
                : [
                  ['Expected orders', `${rows.length} of ${pr.expectedPieces ?? 0}`],
                  ['Expected weight', pr.expectedWeightKg != null ? `~${pr.expectedWeightKg} kg` : ''],
                  ['Size class', pr.sizeClass ?? ''],
                ] as [string, ReactNode][]) : []),
              ['Instructions for driver', pr.instructions ?? ''],
              ['Internal note', pr.note],
            ]} />
          </Panel>

          <Panel title="Pickup outcome">
            <p className="flex items-start gap-1.5 px-5 pb-1 pt-1 text-[12px] text-ink-3">
              <Info size={13} className="mt-[1px] shrink-0" />
              An order can have two parents — the request it was booked under and the request it was picked in — which is why this list is flat, not a tree.
            </p>

            <OutcomeSection title="Booked" count={rows.length}
              action={canAdd
                ? (ftl
                  ? <Button size="sm" variant="outline" icon={<Truck size={13} />} onClick={() => nav(`/grow/orders/add/vehicle?fromPickup=${pr.id}`)}>Create FTL order</Button>
                  : <Button size="sm" variant="outline" icon={<Plus size={13} />} onClick={() => setAttach(true)}>Add order</Button>)
                : undefined}
              empty={pr.blind
                ? (open ? 'Reserved pickup keeps its slot — add orders before the window starts.' : 'No orders yet — the driver collects against the expected figures.')
                : 'No orders are linked to this request.'}>
              {orderTable(rows, open)}
            </OutcomeSection>
            {/* C5 / scenario 25: orders join only while the request is at or before
                the account's add-until state — past it the driver is on the way */}
            {pr.blind && open && !canAddOrdersTo(pr, merchant.config.allowAddToExistingUntil) && (
              <p className="px-5 pt-2 text-[12px] text-ink-3">
                {pr.number} is already {pr.status} — new orders cannot join it. Book them as a new pickup; the driver on
                this collection will not collect them.
              </p>
            )}

            <OutcomeSection title="Picked" count={picked.length}
              empty={reconciled ? 'None' : 'Nothing yet — known once the driver has attempted the pickup.'}>
              {orderTable(picked, false)}
            </OutcomeSection>

            <OutcomeSection title="Not picked" count={missed.length}
              empty={reconciled ? 'None' : 'Nothing yet — known once the driver has attempted the pickup.'}>
              {orderTable(missed, false)}
            </OutcomeSection>

            <OutcomeSection title="Overage scans" count={pr.overages.length}>
              <OverageTable overages={pr.overages} byId={byId} onCreateOrder={createOrderFor} />
            </OutcomeSection>
            <div className="h-3" />
          </Panel>
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <Panel title="Trip">
            <dl className="grid grid-cols-1 gap-y-3 px-5 pb-5 pt-2">
              {([
                [pr.carrierMode === 'CARRIER' ? 'Carrier' : 'Driver', collector || 'Not assigned yet'],
                ['Collected by', pr.carrierMode === 'CARRIER' ? 'Carrier (3PL)' : 'Own fleet'],
                ['Handover', isHandedOver(pr) ? 'Handed over at the hub' : isInTransitToHub(pr) ? 'In transit to hub' : 'Not collected yet'],
              ] as [string, ReactNode][]).map(([k, v]) => (
                <div key={k} className="min-w-0">
                  <dt className="text-[12px] font-bold text-ink-3">{k}</dt>
                  <dd className="mt-0.5 break-words text-[13px] text-ink">{v}</dd>
                </div>
              ))}
            </dl>
          </Panel>

          <Panel title="Timeline">
            <Timeline pr={pr} />
          </Panel>
        </div>
      </div>

      {confirmLast && (
        <Modal open title="Cancel this pickup request?" onClose={() => setConfirmLast(null)}
          footer={<>
            <Button variant="outline" onClick={() => setConfirmLast(null)}>Keep order</Button>
            <Button onClick={removeLast}>Remove &amp; cancel pickup</Button>
          </>}>
          <div className="flex flex-col gap-2 pb-3 text-[13px]">
            <p className="text-ink-3">Removing the last order will cancel {pr.number}. The order moves back to Ready for Pickup.</p>
            <p className="text-ink-2">{confirmLast.orderNumber} · {confirmLast.receiver.name} — {confirmLast.pkg.weightKg} kg</p>
          </div>
        </Modal>
      )}
      {cancelOpen && <CancelPickupDialog requests={[pr]} onClose={() => setCancelOpen(false)} onDone={() => setCancelOpen(false)} />}
      {attach && <AddOrdersDialog pr={pr} orders={db.orders} onClose={() => setAttach(false)} />}
      {reschedule && <ReschedulePickupDialog requests={[pr]} onClose={() => setReschedule(false)} onDone={() => setReschedule(false)} />}
    </div>
  )
}

/* ------------------------------------------------------------ cancelling ---- */

/**
 * **Cancel pickup** — asks WHY (CANCEL_REASONS listbox) before cancelling, for
 * one request (detail page) or a selection (list bulk action). Only requests
 * the merchant may still change are cancelled; the callers gate the button,
 * and this filters again so a stale selection cannot slip through.
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
    <Modal open title="Cancel pickup" onClose={onClose}
      footer={<>
        <Button variant="outline" onClick={onClose}>Keep pickup</Button>
        <Button disabled={!reason || targets.length === 0} onClick={apply}>
          Cancel pickup{targets.length > 1 ? `s (${targets.length})` : ''}
        </Button>
      </>}>
      <div className="flex flex-col gap-4 pb-3">
        <p className="text-[12.5px] text-ink-3">
          {one ? `${one.number} · ${prWindow(one)}` : `${targets.length} pickup request${targets.length === 1 ? '' : 's'}`}
        </p>
        {targets.length === 0 ? (
          <p className="text-[13px] text-ink-2">{CONTACT_SUPPORT}.</p>
        ) : (
          <>
            <div className="max-w-sm">
              <Field label="Reason" required>
                <MenuSelect value={reason} placeholder="Select a reason" options={CANCEL_REASONS.map((r) => r.code)}
                  labels={(c) => CANCEL_REASONS.find((r) => r.code === c)?.label ?? c} onChange={setReason} />
              </Field>
              <p className="mt-1 text-[12px] text-ink-3">The orders go back to Ready for Pickup.</p>
            </div>
            {skipped > 0 && (
              <p className="text-[12.5px] text-ink-3">
                {skipped} selected request{skipped === 1 ? ' is' : 's are'} closed or already assigned to a driver and
                will not be cancelled — contact support for those.
              </p>
            )}
          </>
        )}
      </div>
    </Modal>
  )
}

/* ------------------------------------------------------------- attaching ---- */

/**
 * **Add orders** — the paid orders that could still join this request (the
 * store's own rule, `tabOf(o) === 'Ready for Pickup'`, the exact predicate
 * attachOrdersToPickup enforces, so nothing listed here is silently refused).
 * A reserved request declared how many pieces to expect, so the live counter
 * warns as soon as the selection runs past that number.
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
    <Modal open title={`Add orders to ${pr.number}`} onClose={onClose}
      footer={<>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button disabled={sel.size === 0} icon={<Plus size={13} />} onClick={apply}>Add ({sel.size})</Button>
      </>}>
      <div className="flex flex-col gap-3 pb-3">
        <p className="text-[12.5px] text-ink-3">Paid orders without a pickup request</p>
        <div className="flex items-center justify-between gap-3">
          {expected !== null
            ? <StatusPill label={`${onRequest} of ${expected} expected`} tone={over ? 'warning' : 'neutral'} />
            : <span className="text-[13px] text-ink-2">{onRequest} order{onRequest === 1 ? '' : 's'} on this request</span>}
          <div className="w-52"><SearchInput value={q} onChange={setQ} placeholder="Search order, receiver…" /></div>
        </div>
        {over && (
          <p className="rounded-md bg-warning-bg px-3 py-2 text-[12.5px] text-warning-fg">
            That is more than the {expected} piece{expected === 1 ? '' : 's'} declared when {pr.number} was booked — the driver
            may not have room. Reschedule or book a second pickup if the handover has grown.
          </p>
        )}
        <div className="max-h-[340px] overflow-auto rounded-md border border-line">
          {shown.length === 0 ? (
            <p className="px-3 py-5 text-[13px] text-ink-3">
              No paid orders are waiting for a pickup — pay for an order first, then add it here.
            </p>
          ) : (
            <table className="w-full text-[13px]">
              <thead>
                <tr className="sticky top-0 border-b border-line bg-warm-50 text-left text-[12px] text-ink-3">
                  <th className="w-[40px] py-2.5 pl-3">
                    <Checkbox checked={allChecked} indeterminate={!allChecked && someChecked} onChange={toggleAll} />
                  </th>
                  {['Order Number', 'Receiver', 'Qty · Weight', 'Created'].map((h) => (
                    <th key={h} className="whitespace-nowrap px-3 py-2.5 font-bold">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {shown.map((o) => (
                  <tr key={o.id} onClick={() => toggle(o.id)}
                    className={`cursor-pointer border-b border-line last:border-0 transition-colors hover:bg-warm-50 ${sel.has(o.id) ? 'bg-brand-50/60' : ''}`}>
                    <td className="py-2.5 pl-3" onClick={(e) => e.stopPropagation()}>
                      <Checkbox checked={sel.has(o.id)} onChange={() => toggle(o.id)} />
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 font-mono text-[12px] font-bold text-brand-500">{o.orderNumber}</td>
                    <td className="max-w-[180px] truncate px-3 py-2.5 text-ink">{o.receiver.name}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-ink-2">{o.pkg.count} · {o.pkg.weightKg} kg</td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-ink-2">{fmtDate(o.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </Modal>
  )
}
