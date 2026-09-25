/**
 * One pickup request — LOCAL console (`/local/pickup/:id`, spec §3.2).
 *
 * PageHeader (number + outcome-aware status + chips, back to the list) with a
 * kebab of status-aware actions, over Panels: Summary · Pickup outcome (Booked ·
 * Picked · Not picked · Overage scans, flat — a shipment has two parents) · Handover (the four reconciliation
 * buckets, Close handover, a dev-only driver-scan simulator) on the left; Trip ·
 * Related · Timeline on the right. Everything reads the live store, so an
 * action re-renders the page in place.
 *
 * With the module disabled the request stays READABLE (scenario 23) — only the
 * actions are withheld.
 */
import { useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Info, Plus, ScanBarcode, Trash2 } from 'lucide-react'
import {
  Button, EmptyState, KebabMenu, PageHeader, Panel, SimpleTable, StatusPill, type MenuItem,
} from '../../nueva/components'
import { toast } from '../../nueva/toast'
import { growOrderActions, useGrowOrders } from '../../growOrders/store'
import type { GrowOrder, GrowPickupRequest } from '../../growOrders/types'
import { handoverExpected, handoverReconciled, isPartiallyPicked, isPickupEligible } from '../../growOrders/tabs'
import { prActionState, type PrAction } from '../../growOrders/prActions'
import { usePickupModuleConfig } from '../../config/pickupModule'
import { PICKUP_OUTCOME_LABEL, pickupOutcomeFor } from '../../growOrders/reasonPolicy'
import { NO_ORDERS_REASON } from '../../growOrders/pickupReasons'
import { planningActions, usePlanning } from '../LocalPFP/planningStore'
import {
  AddConsignmentsDialog, AssignCarrierDialog, CloseHandoverDialog, ManualPickupDialog, ReasonDialog, RescheduleDialog,
} from './dialogs'
import { AddToRouteDialog } from '../LocalControlTower/addToRouteDialog'
import { SplitPickupDialog } from './bookingCards'
import {
  can, consignmentsLabel, dropLabel, duplicateIds, earliestFor, fmtStamp, fmtWindow, merchantOfPr, pickupPointAddress,
  pickupPointName, prTypeLabel, reasonText, referenceChips, statusLabel, statusTags, weightLabel, windowTag, type Tone,
} from './prModel'

type DialogKind = 'add' | 'split' | 'reschedule' | 'cancel' | 'fail' | 'manual' | 'route' | 'carrier' | 'close' | null

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`

/* ------------------------------------------------------------------ bits ---- */

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

const tick = (on: boolean) => (on ? <span className="font-bold text-success-fg">✓</span> : <span className="text-warm-400">—</span>)

/* ------------------------------------------------------------- the page ---- */

export default function PickupRequestDetail() {
  const { id } = useParams()
  const nav = useNavigate()
  const db = useGrowOrders()
  /* the record id is canonical; a PR number (`PR-000115`) resolves too, as a courtesy */
  const pr = db.pickupRequests.find((p) => p.id === id)
    ?? db.pickupRequests.find((p) => p.number.toLowerCase() === (id ?? '').toLowerCase())
  const back = () => nav('/local/pickup')

  if (!pr) {
    return (
      <div className="p-6">
        <PageHeader title="Pickup Request" onBack={back} />
        <Panel><EmptyState title="This pickup request does not exist" hint="It may have been removed, or the link is from another browser's data." /></Panel>
      </div>
    )
  }
  return <Detail key={pr.id} pr={pr} back={back} />
}

function Detail({ pr, back }: { pr: GrowPickupRequest; back: () => void }) {
  const nav = useNavigate()
  const db = useGrowOrders()
  const plan = usePlanning()
  const cfg = usePickupModuleConfig()
  const [dialog, setDialog] = useState<DialogKind>(null)
  const close = () => setDialog(null)

  const byId = new Map(db.orders.map((o) => [o.id, o]))
  const prById = new Map(db.pickupRequests.map((p) => [p.id, p]))
  const s = statusLabel(pr)
  const tags = statusTags(pr, duplicateIds(db.pickupRequests), new Date(), (i) => prById.get(i))
  const trip = pr.tripId ? plan.trips.find((t) => t.id === pr.tripId) : undefined
  const stop = trip?.stops.find((x) => x.kind === 'pickup' && x.prId === pr.id)
  const attempted = pr.status === 'Completed' || pr.status === 'Pickup Failed'
  const on = cfg.enabled

  /* scenario 13: a partial pickup released what it left behind — book exactly
     those (still waiting for a pickup) on a new request, at the earliest window */
  const remainder = isPartiallyPicked(pr)
    ? pr.orderIds.filter((i) => !pr.pickedOrderIds.includes(i)).filter((i) => { const o = byId.get(i); return !!o && isPickupEligible(o) })
    : []
  const reattemptRemainder = () => {
    const merchant = merchantOfPr(pr, db.stores)
    const w = earliestFor(merchant)
    const made = growOrderActions.createPickupRequest({
      storeCode: pr.storeCode, destinationCode: pr.destinationCode, orderIds: remainder, source: 'Console',
      merchantCode: merchant, instructions: `Remainder of ${pr.number}`, startAt: w.startAt, endAt: w.endAt,
    })
    if (!made) { toast.error('Nothing to re-attempt — the remaining shipments have validation errors.'); return }
    toast.success(made.merged
      ? `${plural(remainder.length, 'shipment')} added to ${made.number} (open request at this pickup point).`
      : `${plural(remainder.length, 'shipment')} booked on ${made.number} — ${fmtWindow(made)}.`)
    nav(`/local/pickup/${made.id}`)
  }

  /* ------------------------------------------------------------ actions -- */
  /* every action asks the ONE matrix (growOrders/prActions.ts) and shows DISABLED
     with its reason when the request's status does not allow it; only the items
     that do not apply to this kind of request at all (3PL-only, trip-only,
     partial-pick-only) are left out */
  const gate = (a: PrAction) => prActionState(a, pr, { cfg, role: 'ops', byId: (i: string) => prById.get(i) })
  const act = (a: PrAction, label: string, onClick: () => void, tone?: 'danger'): MenuItem => {
    const g = gate(a)
    return { label, onClick, tone, disabled: !g.enabled, reason: g.reason }
  }
  const threePl = pr.carrierMode === 'CARRIER'
  const maybe: (MenuItem | false | null | '')[] = !on ? [] : [
    act('addConsignments', 'Add shipments', () => setDialog('add')),
    act('reschedule', 'Reschedule', () => setDialog('reschedule')),
    act('split', 'Split pickup request', () => setDialog('split')),
    !threePl && (pr.tripId
      ? act('moveRoute', 'Move to another route', () => setDialog('route'))
      : act('addToRoute', 'Add to route', () => setDialog('route'))),
    !!pr.tripId && act('removeFromRoute', 'Remove from route', () => {
      planningActions.removeStopFromTrip(pr.tripId!, pr.id)
      toast.success(`${pr.number} removed from ${pr.tripId}.`)
    }),
    threePl
      ? act('switchToFleet', 'Switch to fleet', () => {
        growOrderActions.clearCarrier(pr.id)
        toast.info(`${pr.number} taken back from the carrier — add it to a route.`)
      })
      : act('assignCarrier', 'Assign carrier', () => setDialog('carrier')),
    act('markPickedUp', 'Mark Manually Picked Up', () => setDialog('manual')),
    remainder.length > 0 && act('reattemptRemainder', `Re-attempt remainder (${remainder.length})`, reattemptRemainder),
    act('reattempt', 'Re-attempt now', () => {
      const clone = growOrderActions.reattemptPickupRequest(pr.id)
      if (clone) { toast.success(`Re-attempt ${clone.attempt} of ${clone.maxAttempts} raised as ${clone.number}.`); nav(`/local/pickup/${clone.id}`) }
      else toast.error('This pickup cannot be re-attempted.')
    }),
    threePl && act('printManifest', 'Print manifest', () => {
      /* H4 — a 3PL collection's manifest carries a reference the carrier accepts against */
      const ref = growOrderActions.printManifest(pr.id)
      if (ref) toast.success(`Manifest ${ref} printed for ${pr.number} (${plural(pr.orderIds.length, 'shipment')}).`)
    }),
    act('printLabel', 'Print consolidated label', () => toast.info(`Print Consolidated Label — ${pr.number} (demo)`)),
    threePl && act('carrierAccepted', 'Carrier accepted', () => {
      if (growOrderActions.carrierAccepted(pr.id)) toast.success(`${pr.carrierName ?? 'Carrier'} accepted the manifest — ${pr.number} handed over.`)
      else toast.error(`${pr.number} has nothing to hand over — it fails as "No orders to collect".`)
    }),
    act('markFailed', 'Mark Pickup Failed', () => setDialog('fail'), 'danger'),
    act('cancel', 'Cancel pickup', () => setDialog('cancel'), 'danger'),
  ]
  const items = maybe.filter((x): x is MenuItem => !!x)

  /* ------------------------------------------------------- consignments -- */
  const booked = pr.orderIds.map((i) => byId.get(i)).filter((o): o is GrowOrder => !!o)
  const extras = db.orders.filter((o) => o.pickedInRequestId === pr.id && !pr.orderIds.includes(o.id))
  const picked = new Set(pr.pickedOrderIds)
  const rowState = (o: GrowOrder): { label: string; tone: Tone } => {
    if (picked.has(o.id)) return { label: pr.orderIds.includes(o.id) ? 'Picked' : 'Picked here (booked elsewhere)', tone: 'success' }
    if (o.pickedInRequestId && o.pickedInRequestId !== pr.id) {
      return { label: `Picked in ${prById.get(o.pickedInRequestId)?.number ?? 'another PR'}`, tone: 'info' }
    }
    if (pr.status === 'Cancelled') return { label: 'Released', tone: 'neutral' }
    if (attempted) return { label: 'Not picked', tone: 'warning' }
    return { label: 'To pick', tone: 'neutral' }
  }
  const pickedRows = [...booked.filter((o) => picked.has(o.id)), ...extras.filter((o) => picked.has(o.id))]
  const notPickedRows = attempted ? booked.filter((o) => !picked.has(o.id)) : []
  const numberOf = (id: string) => prById.get(id)?.number ?? id
  const { driverScanned, hubScanned } = pr.handover
  const dScan = new Set(driverScanned), hScan = new Set(hubScanned)
  const dev = import.meta.env.DEV
  const canScan = pr.status !== 'Cancelled' && pr.status !== 'Pickup Failed'

  /* the parent that is NOT this request, in words — "booked under" when it was
     booked elsewhere, "picked in →" when another request collected it */
  const markers = (o: GrowOrder): ReactNode[] => {
    const out: ReactNode[] = []
    if (o.pickupRequestId && o.pickupRequestId !== pr.id) out.push(<span key="b">booked under {numberOf(o.pickupRequestId)}</span>)
    if (o.pickedInRequestId && o.pickedInRequestId !== pr.id) {
      out.push(
        <Link key="p" to={`/local/pickup/${o.pickedInRequestId}`} onClick={(e) => e.stopPropagation()}
          className="font-bold text-brand-500 hover:text-brand-600">picked in {numberOf(o.pickedInRequestId)} →</Link>,
      )
    }
    return out
  }

  /* one table shape for Booked / Picked / Not picked */
  const outcomeTable = (rows: GrowOrder[]) => (
    <SimpleTable<GrowOrder> rows={rows} rowKey={(o) => o.id}
      onRowClick={(o) => nav(`/local/consignments/${o.id}`)}
      columns={[
        { label: 'Shipment', render: (o) => {
          const m = markers(o)
          return (
            <span className="flex flex-wrap items-baseline gap-x-2">
              <Link to={`/local/consignments/${o.id}`} onClick={(e) => e.stopPropagation()}
                className="font-mono text-[12px] font-bold text-brand-500 hover:text-brand-600">{o.orderNumber}</Link>
              {m.length > 0 && <span className="text-[12px] text-ink-3">{m.map((x, i) => <span key={i}>{i > 0 && ' · '}{x}</span>)}</span>}
            </span>
          )
        } },
        { label: 'Receiver', render: (o) => o.receiver.name || '—' },
        { label: 'Weight', align: 'right', render: (o) => `${(o.pkg.weightKg || 0).toFixed(1)} kg` },
        { label: 'Status', render: (o) => { const x = rowState(o); return <StatusPill label={x.label} tone={x.tone} /> } },
        { label: 'Scans', render: (o) => (
          <span className="inline-flex items-center gap-2 whitespace-nowrap text-[12px] text-ink-2">
            <span>driver {tick(dScan.has(o.id))}</span><span>hub {tick(hScan.has(o.id))}</span>
          </span>
        ) },
        { label: '', align: 'right', render: (o) => (
          <span className="inline-flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
            {dev && on && canScan && !dScan.has(o.id) && (
              <Button size="sm" variant="ghost" icon={<ScanBarcode size={13} />}
                onClick={() => { growOrderActions.driverScan(pr.id, o.id); toast.info(`Driver scan simulated for ${o.orderNumber}.`) }}>
                Simulate driver scan
              </Button>
            )}
            {on && gate('removeConsignment').enabled && pr.orderIds.includes(o.id) && !picked.has(o.id) && (
              <Button size="sm" variant="ghost" icon={<Trash2 size={13} />}
                onClick={() => { growOrderActions.detachOrderFromPickup(pr.id, o.id); toast.success(`${o.orderNumber} removed — it waits for a pickup again.`) }}>
                Remove
              </Button>
            )}
          </span>
        ) },
      ]} />
  )

  /* ----------------------------------------------------------- handover -- */
  const universe = [...new Set([...handoverExpected(pr), ...driverScanned, ...hubScanned])]
  const buckets: { key: string; label: string; hint: string; ids: string[]; tone: Tone }[] = [
    { key: 'matched', label: 'Matched', hint: 'driver and hub both scanned', ids: universe.filter((i) => dScan.has(i) && hScan.has(i)), tone: 'success' },
    { key: 'driver', label: 'Driver only', hint: 'left the dock, not seen at the hub', ids: universe.filter((i) => dScan.has(i) && !hScan.has(i)), tone: 'warning' },
    { key: 'hub', label: 'Hub only', hint: 'at the hub, no driver scan', ids: universe.filter((i) => !dScan.has(i) && hScan.has(i)), tone: 'info' },
    { key: 'never', label: 'Never scanned', hint: 'expected, no scan yet', ids: universe.filter((i) => !dScan.has(i) && !hScan.has(i)), tone: 'danger' },
  ]
  const reconciled = handoverReconciled(pr)
  const modeText = { driver: 'Driver scan', hub: 'Hub scan', both: 'Driver + hub scan' }[pr.handover.mode]

  const parent = pr.parentPrId ? prById.get(pr.parentPrId) : undefined
  const retry = pr.reattemptPrId ? prById.get(pr.reattemptPrId) : undefined
  /* a failed request: what the Reason Master → Reason Policy decides for its reason (growOrders/reasonPolicy) */
  const policyLine = pr.status === 'Pickup Failed' && pr.failureReason && pr.failureReason !== NO_ORDERS_REASON
    ? PICKUP_OUTCOME_LABEL[pickupOutcomeFor(pr.failureReason, pr.attempt, pr.maxAttempts)] : null
  const reason = reasonText(pr)

  return (
    <div className="p-6">
      <PageHeader title={`Pickup Request ${pr.number}`} onBack={back}
        subtitle={`${merchantOfPr(pr, db.stores)} · ${pickupPointName(pr, db.stores)} → ${dropLabel(pr, db.stores)}`}
        right={(
          <div className="flex items-center gap-2">
            {referenceChips(pr).map((c) => <StatusPill key={c} label={c} tone={c.endsWith(' blind') ? 'info' : 'neutral'} />)}
            <StatusPill label={s.label} tone={s.tone} />
            {tags.map((t) => <StatusPill key={t.label} label={t.label} tone={t.tone} />)}
            {items.length > 0 && <KebabMenu items={items} />}
          </div>
        )} />

      {!on && (
        <div className="mb-4 rounded-md border border-line bg-warm-25 px-4 py-2.5 text-[13px] text-ink-2">
          The Pickup module is disabled for this account — this request stays readable, actions are withheld.{' '}
          <Link to="/console/settings/base-modules" className="font-bold text-brand-500">Base Modules settings</Link>
        </div>
      )}

      {/* auto pickup with `slotConfirmation`: the shipper confirms the slot before ops plans it */}
      {pr.slotConfirmed !== null && (
        <div className="mb-4 flex items-center justify-between gap-4 rounded-md border border-line bg-warm-25 px-4 py-2.5 text-[13px] text-ink-2">
          <span className="flex items-center gap-1.5">
            <Info size={14} className="shrink-0 text-ink-3" />
            {pr.slotConfirmed
              ? <>Slot confirmed — {fmtWindow(pr)}</>
              : <>Slot confirmation pending — the shipper has not yet confirmed {fmtWindow(pr)}.</>}
          </span>
          {on && gate('confirmSlot').enabled && (
            <Button size="sm" variant="outline"
              onClick={() => { if (growOrderActions.confirmPickupSlot(pr.id)) toast.success(`Pickup slot confirmed for ${pr.number}.`) }}>
              Confirm slot
            </Button>
          )}
        </div>
      )}

      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2 flex flex-col gap-4">
          <Panel title="Summary">
            <Pairs pairs={[
              ['Pickup window', <>{fmtWindow(pr)}{windowTag(pr) && <span className="text-ink-3"> · {windowTag(pr)}</span>}</>],
              ['Pickup address', <>{pickupPointName(pr, db.stores)}<span className="block text-[12px] text-ink-3">{pickupPointAddress(pr, db.stores)}</span></>],
              ['Drops at', dropLabel(pr, db.stores)],
              ['Merchant', merchantOfPr(pr, db.stores)],
              ['Contact', [pr.contactName, pr.contactNumber].filter(Boolean).join(' · ')],
              ['Type', prTypeLabel(pr)],
              ...(pr.shipmentType === 'FTL'
                ? [['Service / vehicle', [pr.ftlServiceType, pr.vehicleType && `${pr.vehicleUnit ?? 1} × ${pr.vehicleType}`].filter(Boolean).join(' · ')] as [string, ReactNode]]
                : pr.blind ? [['Expected', `${pr.expectedPieces ?? '?'} shipments${pr.sizeClass ? ` · ${pr.sizeClass}` : ''}`] as [string, ReactNode]] : []),
              ['Shipments', consignmentsLabel(pr)],
              ['Weight', weightLabel(pr, byId)],
              ['Source', pr.source],
              ['Attempt', <>{pr.attempt} of {pr.maxAttempts}{policyLine && <span className="text-ink-3"> · Reason policy: <span className="font-bold text-ink-2">{policyLine}</span></span>}</>],
              ['Carrier', pr.carrierName ? `${pr.carrierName}${pr.carrierMode === 'CARRIER' ? ' (3PL)' : ' (own fleet)'}` : ''],
              ...(reason ? [[pr.status === 'Cancelled' ? 'Cancel reason' : 'Failure reason', reason] as [string, ReactNode]] : []),
              ...(pr.manualOverride ? [['Manual override', pr.manualOverride] as [string, ReactNode]] : []),
              ['Instructions', pr.instructions ?? ''],
              ['Created', fmtStamp(pr.createdAt)],
            ]} />
          </Panel>

          <Panel title="Pickup outcome">
            <p className="flex items-start gap-1.5 px-5 pb-1 pt-1 text-[12px] text-ink-3">
              <Info size={13} className="mt-[1px] shrink-0" />
              A shipment can have two parents — the request it was booked under and the request it was picked in — which is why this list is flat, not a tree.
            </p>

            <OutcomeSection title="Booked" count={booked.length}
              action={on && gate('addConsignments').enabled
                ? <Button size="sm" variant="outline" icon={<Plus size={13} />} onClick={() => setDialog('add')}>Add shipments</Button>
                : undefined}
              empty={pr.blind ? 'Reserved — no shipments attached yet. Attach them with Add shipments, or from Eligible consignments.' : 'None'}>
              {outcomeTable(booked)}
            </OutcomeSection>

            <OutcomeSection title="Picked" count={pickedRows.length}>
              {outcomeTable(pickedRows)}
            </OutcomeSection>

            <OutcomeSection title="Not picked" count={notPickedRows.length}
              empty={attempted ? 'None' : 'Nothing yet — known once the driver has attempted the pickup.'}>
              {outcomeTable(notPickedRows)}
            </OutcomeSection>

            <OutcomeSection title="Overage scans" count={pr.overages.length}>
              <SimpleTable<GrowPickupRequest['overages'][number]> rows={pr.overages} rowKey={(v) => v.id}
                columns={[
                  { label: 'Barcode', render: (v) => <span className="font-mono text-[12px] font-bold text-ink">{v.barcode}</span> },
                  { label: 'Scanned at', render: (v) => fmtStamp(v.scannedAt) },
                  { label: 'Weight', align: 'right', render: (v) => (v.weightKg != null ? `${v.weightKg.toFixed(1)} kg` : '—') },
                  { label: 'Note', render: (v) => v.note || '—' },
                  { label: 'Status', render: (v) => (v.orderId
                    ? <StatusPill label={`Resolved · ${byId.get(v.orderId)?.orderNumber ?? v.orderId}`} tone="success" />
                    : <StatusPill label="Unresolved" tone="warning" />) },
                ]} />
              <p className="px-5 pb-1 pt-2 text-[12px] text-ink-3">
                A barcode that matched no shipment. The merchant resolves it with Create order on their portal; a parcel that reached the hub is resolved from Inbound.
              </p>
            </OutcomeSection>
            <div className="h-3" />
          </Panel>

          <Panel title="Handover">
            <div className="flex flex-wrap items-center gap-2 px-5 pb-3 pt-1 text-[13px] text-ink-2">
              <span>Mode: <span className="font-bold text-ink">{modeText}</span></span>
              <span className="text-ink-3">·</span>
              <span>{pr.handover.closedAt
                ? <>Closed {fmtStamp(pr.handover.closedAt)}</>
                : pr.handover.arrivedAtHubAt ? <>At hub since {fmtStamp(pr.handover.arrivedAtHubAt)}</>
                : pr.status === 'Completed' ? 'In transit to hub' : 'Not collected yet'}</span>
              {pr.handover.manifestRef && <><span className="text-ink-3">·</span><span>Manifest <span className="font-mono">{pr.handover.manifestRef}</span></span></>}
              {pr.carrierPickupRef && <><span className="text-ink-3">·</span><span>Carrier ref <span className="font-mono">{pr.carrierPickupRef}</span></span></>}
              {on && gate('closeHandover').enabled && (
                <span className="ml-auto"><Button size="sm" onClick={() => setDialog('close')}>Close handover</Button></span>
              )}
            </div>
            {universe.length === 0 ? (
              <p className="px-5 pb-5 text-[13px] text-ink-3">Nothing to reconcile yet — scans appear here once the driver collects.</p>
            ) : (
              <div className="grid grid-cols-4 gap-3 px-5 pb-5">
                {buckets.map((b) => (
                  <div key={b.key} className="rounded-md border border-line p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[13px] font-bold text-ink">{b.label}</span>
                      <StatusPill label={String(b.ids.length)} tone={b.ids.length ? b.tone : 'neutral'} />
                    </div>
                    <p className="mt-0.5 text-[12px] text-ink-3">{b.hint}</p>
                    <div className="mt-2 flex flex-col gap-0.5">
                      {b.ids.map((i) => <span key={i} className="font-mono text-[12px] text-ink-2">{byId.get(i)?.orderNumber ?? i}</span>)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </div>

        <div className="flex flex-col gap-4">
          <Panel title="Trip">
            {trip ? (
              <Pairs pairs={[
                ['Trip', <Link to={`/local/control-tower/trips/${trip.id}`} className="font-mono font-bold text-brand-500 hover:text-brand-600">{trip.id}</Link>],
                ['Status', trip.status],
                ['Date', trip.date],
                ['Driver', pr.driverName ?? trip.driverName ?? 'Not assigned'],
                ['Vehicle', trip.vehicle ?? ''],
                ['Stop', stop ? `#${stop.seq} · ${stop.status} · ETA ${stop.eta}` : ''],
              ]} />
            ) : (
              <div className="px-5 pb-5 pt-1 text-[13px] text-ink-3">
                {pr.carrierMode === 'CARRIER'
                  ? `Run by ${pr.carrierName} (3PL) — no fleet trip.`
                  : pr.tripId ? `Trip ${pr.tripId} is not in this browser's planning data.` : 'Not on a route yet.'}
                {on && can.addToRoute(pr) && !pr.tripId && (
                  <div className="mt-3"><Button size="sm" variant="outline" onClick={() => setDialog('route')}>Add to route</Button></div>
                )}
              </div>
            )}
          </Panel>

          {(parent || retry) && (
            <Panel title="Related">
              <div className="flex flex-col gap-2 px-5 pb-5 pt-1 text-[13px]">
                {parent && <span>Re-attempt of <Link to={`/local/pickup/${parent.id}`} className="font-mono font-bold text-brand-500">{parent.number}</Link> <span className="text-ink-3">· {statusLabel(parent).label}</span></span>}
                {retry && <span>Re-attempted as <Link to={`/local/pickup/${retry.id}`} className="font-mono font-bold text-brand-500">{retry.number}</Link> <span className="text-ink-3">· {statusLabel(retry).label}</span></span>}
              </div>
            </Panel>
          )}

          <Panel title="Timeline">
            <ol className="flex flex-col px-5 pb-5 pt-1">
              {[...pr.statusHistory].reverse().map((e, i) => (
                <li key={`${e.at}-${i}`} className="relative border-l border-line pb-3 pl-4 last:pb-0">
                  <span className={`absolute -left-[4.5px] top-1.5 h-2 w-2 rounded-full ${i === 0 ? 'bg-brand-500' : 'bg-warm-300'}`} />
                  <p className="text-[13px] font-bold text-ink">{e.status}</p>
                  {e.note && <p className="text-[12px] text-ink-2">{e.note}</p>}
                  <p className="text-[12px] text-ink-3">{fmtStamp(e.at)}</p>
                </li>
              ))}
            </ol>
          </Panel>
        </div>
      </div>

      {dialog === 'add' && <AddConsignmentsDialog pr={pr} onClose={close} onDone={close} />}
      {dialog === 'reschedule' && <RescheduleDialog prs={[pr]} onClose={close} onDone={close} />}
      {dialog === 'split' && <SplitPickupDialog pr={pr} merchantCode={merchantOfPr(pr, db.stores)} onClose={close} onDone={close} />}
      {(dialog === 'cancel' || dialog === 'fail') && <ReasonDialog kind={dialog} prs={[pr]} onClose={close} onDone={close} />}
      {dialog === 'manual' && <ManualPickupDialog pr={pr} onClose={close} onDone={close} />}
      {dialog === 'route' && <AddToRouteDialog prIds={[pr.id]} onClose={close} onDone={close} />}
      {dialog === 'carrier' && <AssignCarrierDialog prs={[pr]} onClose={close} onDone={close} />}
      {dialog === 'close' && <CloseHandoverDialog pr={pr} reconciled={reconciled} onClose={close} onDone={close} />}
    </div>
  )
}
