/**
 * One trip (LOCAL) — `/local/control-tower/trips/:id`.
 *
 * Functionality from staging's trip page (Trip Summary / Map View / Trip Fields,
 * Refresh · Resequence · Change Assignee · End Trip, Trip Breakdown, a stops
 * table with Pending / Failed / Successful sub-tabs); layout is ours. The
 * pickup-stop actions are the console's stand-in for the driver app: Arrive,
 * Complete (tick what was scanned → `completePickupStop`) and Fail (reason →
 * `failPickupStop`).
 */
import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { AlertTriangle, Map as MapIcon, RefreshCw, Truck } from 'lucide-react'
import {
  Button, Checkbox, DataTable, EmptyState, Field, Input, MenuSelect, Modal, PageHeader, Panel,
  StatusPill, Tabs, type Column,
} from '../../nueva/components'
import { toast } from '../../nueva/toast'
import { growOrdersSnapshot, orderById, pickupRequestById, useGrowOrders } from '../../growOrders/store'
import { PICKABLE_FAILURE_REASONS } from '../../growOrders/pickupReasons'
import { planningActions, usePlanning, type LocalTrip, type PlannedStop } from '../LocalPFP/planningStore'
import { blankWork, completePickup, isReserved } from '../DriverApp/model'
import { AssignDriverModal, StopTimeline } from './tripBits'
import {
  STOP_TONE, TRIP_TONE, carrierLabel, compliance, effectiveStopStatus, fmtDay, hubLabel, progressPct, stopCounts, tripType,
  type Tone,
} from './tripUtils'

const VIEW_TABS = ['Trip Summary', 'Map View', 'Trip Fields']
const STOP_TABS = ['Pending', 'Failed', 'Successful'] as const

const prTone = (s: string): Tone =>
  s === 'Completed' ? 'success' : s === 'Pickup Failed' ? 'danger' : s === 'Cancelled' ? 'neutral'
    : s === 'Out For Pickup' ? 'warning' : 'info'
const orderTone = (s: string): Tone =>
  s === 'Delivered' ? 'success' : s === 'Undelivered' || s === 'Cancelled' ? 'danger' : s === 'Out for Delivery' || s === 'In Transit' ? 'warning' : 'info'

type StopRow = PlannedStop & { key: string; effective: PlannedStop['status'] }

export default function TripDetail() {
  const { id } = useParams()
  const nav = useNavigate()
  const plan = usePlanning()
  const db = useGrowOrders()
  const trip = plan.trips.find((t) => t.id === id)

  const [view, setView] = useState(0)
  const [stopTab, setStopTab] = useState(0)
  const [assigning, setAssigning] = useState(false)
  const [completing, setCompleting] = useState<PlannedStop | null>(null)
  const [failing, setFailing] = useState<PlannedStop | null>(null)

  const rows = useMemo<StopRow[]>(() => (trip?.stops ?? []).map((s, i) => ({ ...s, key: `${s.seq}-${s.prId ?? s.orderId ?? i}`, effective: effectiveStopStatus(s) })),
    // db: a delivery's effective status reads the order
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [trip, db])

  if (!trip) {
    return (
      <div className="p-6">
        <PageHeader title="Trip" onBack={() => nav('/local/control-tower?tab=trips')} />
        <Panel><EmptyState title={`Trip ${id ?? ''} not found`} hint="It may have been cancelled. Go back to the Trips list." /></Panel>
      </div>
    )
  }

  const c = stopCounts(trip)
  const comp = compliance(trip)
  const running = trip.status === 'In Transit'
  const bucket = (r: StopRow) => (r.effective === 'Failed' ? 1 : r.effective === 'Done' ? 2 : 0)
  const tabCounts = [0, 1, 2].map((b) => rows.filter((r) => bucket(r) === b).length)
  const shown = rows.filter((r) => bucket(r) === stopTab)

  /* ------------------------------------------------------- header actions -- */

  const debrief = () => {
    if (planningActions.debriefTrip(trip.id)) toast.success('Back at the hub — Yet to debrief. Hub in-scans happen in Inbound.')
  }
  const end = () => { if (planningActions.endTrip(trip.id)) toast.success(`${trip.id} completed.`) }
  const start = () => {
    if (planningActions.startTrip(trip.id)) toast.success(`${trip.id} started — collections on it are Out For Pickup.`)
  }

  const stopActions = (r: StopRow) => {
    if (r.effective === 'Done' || r.effective === 'Failed') return null
    if (!running) return <span className="text-[12px] text-ink-3">{trip.status === 'Completed' || trip.status === 'Yet to debrief' ? '—' : 'Start the trip first'}</span>
    const stopId = r.prId ?? r.orderId ?? ''
    if (r.kind === 'pickup') {
      /* module off (scenario 23): no new bookings, but execution continues —
         a collection already on a trip can still be run to its outcome */
      return (
        <div className="flex items-center gap-1.5">
          {r.status === 'Pending' && <Button size="sm" variant="ghost" onClick={() => { planningActions.arriveStop(trip.id, stopId); toast.info(`Arrived at ${r.orderNumber}.`) }}>Arrive</Button>}
          <Button size="sm" variant="outline" onClick={() => setCompleting(r)}>Complete</Button>
          <Button size="sm" variant="ghost" onClick={() => setFailing(r)}>Fail</Button>
        </div>
      )
    }
    return (
      <div className="flex items-center gap-1.5">
        {r.status === 'Pending' && <Button size="sm" variant="ghost" onClick={() => planningActions.arriveStop(trip.id, stopId)}>Arrive</Button>}
        <Button size="sm" variant="outline" onClick={() => {
          if (!r.orderId) return
          planningActions.completeDeliveryStop(trip.id, r.orderId, 'Delivered')
          toast.success(`${r.orderNumber} delivered.`)
        }}>Done</Button>
        <Button size="sm" variant="ghost" onClick={() => {
          if (!r.orderId) return
          planningActions.completeDeliveryStop(trip.id, r.orderId, 'Failed')
          toast.info(`${r.orderNumber} — delivery failed.`)
        }}>Fail</Button>
      </div>
    )
  }

  const columns: Column[] = [
    { key: 'seq', label: 'Stop Seq', width: 84, render: (r) => <span className="font-bold text-ink tabular-nums">{(r as StopRow).seq}</span> },
    {
      key: 'kind', label: 'Type', width: 104,
      render: (r) => (r as StopRow).kind === 'pickup'
        ? <span className="inline-flex items-center gap-1"><Truck size={13} className="text-ink-3" /><StatusPill label="Pick Up" tone="neutral" /></span>
        : <StatusPill label="Delivery" tone="info" />,
    },
    {
      key: 'addr', label: 'Customer / Address',
      render: (r) => {
        const s = r as StopRow
        const pr = s.prId ? pickupRequestById(s.prId) : undefined
        const o = s.orderId ? orderById(s.orderId) : undefined
        const who = pr ? db.stores.find((x) => x.code === pr.storeCode)?.name ?? pr.storeCode : o?.receiver.name ?? ''
        return (
          <span className="block min-w-0">
            <span className="block truncate font-bold text-ink">{who || '—'}</span>
            <span className="block truncate text-[12px] text-ink-3">{s.address || '—'} · ETA {s.eta}</span>
          </span>
        )
      },
    },
    {
      key: 'ref', label: 'Reference', width: 150,
      render: (r) => {
        const s = r as StopRow
        return s.prId
          ? <Link to={`/local/pickup/${s.prId}`} className="font-mono text-[12px] font-bold text-brand-500 hover:underline">{s.orderNumber}</Link>
          : <Link to={`/local/consignments/${s.orderId}`} className="font-mono text-[12px] font-bold text-ink hover:underline">{s.orderNumber}</Link>
      },
    },
    {
      key: 'state', label: 'State', width: 150,
      render: (r) => {
        const s = r as StopRow
        const st = s.prId ? pickupRequestById(s.prId)?.status : s.orderId ? orderById(s.orderId)?.status : undefined
        if (!st) return '—'
        return <StatusPill label={st} tone={s.prId ? prTone(st) : orderTone(st)} />
      },
    },
    { key: 'status', label: 'Status', width: 100, render: (r) => <StatusPill label={(r as StopRow).effective} tone={STOP_TONE[(r as StopRow).effective]} /> },
    { key: 'actions', label: 'Actions', width: 230, render: (r) => <span onClick={(e) => e.stopPropagation()}>{stopActions(r as StopRow)}</span> },
  ]

  const breakdown: [string, number | string][] = [
    ['Total stops', c.total],
    ['Pickups', trip.stops.filter((s) => s.kind === 'pickup').length],
    ['Deliveries', trip.stops.filter((s) => s.kind === 'delivery').length],
    ['Successful', c.done],
    ['Failed', c.failed],
    ['Pending', c.pending],
    ['Progress', `${progressPct(trip)}%`],
  ]

  return (
    <div className="p-6">
      <PageHeader
        title={`${trip.name} · ${trip.id}`}
        subtitle={`${fmtDay(trip.date)} · ${hubLabel(trip.hubCode, db.stores)} · ${trip.driverName ?? 'No driver'}${trip.vehicle ? ` · ${trip.vehicle}` : ''}`}
        onBack={() => nav('/local/control-tower?tab=trips')}
        right={(
          <div className="flex items-center gap-2">
            <StatusPill label={trip.status} tone={TRIP_TONE[trip.status]} />
            <Button variant="ghost" icon={<RefreshCw size={14} />} onClick={() => toast.info('Trip refreshed.')}>Refresh</Button>
            {trip.status !== 'Completed' && <Button variant="outline" onClick={() => toast.info('Demo only — resequencing needs the routing engine.')}>Resequence</Button>}
            {trip.status !== 'Completed' && <Button variant="outline" onClick={() => setAssigning(true)}>{trip.driverName ? 'Change Assignee' : 'Assign Driver'}</Button>}
            {trip.status === 'Yet to start' && <Button onClick={start}>Start Trip</Button>}
            {running && <Button variant="outline" onClick={debrief}>Debrief</Button>}
            {(running || trip.status === 'Yet to debrief') && <Button onClick={end}>End Trip</Button>}
          </div>
        )} />

      {trip.attention && (
        <div className="mb-4 flex items-center gap-3 rounded-md border border-danger-fg/30 bg-danger-bg px-5 py-3 text-[13px] text-danger-fg">
          <AlertTriangle size={16} className="shrink-0" />
          <span><b>Attention required:</b> {trip.attention}</span>
          <span className="ml-auto"><Button size="sm" variant="outline" onClick={() => { planningActions.clearAttention(trip.id); toast.success('Attention cleared.') }}>Clear</Button></span>
        </div>
      )}
      {trip.status === 'Yet to debrief' && (
        <div className="mb-4 rounded-md border border-line bg-warm-50 px-5 py-3 text-[13px] text-ink-2">
          The trip is back at the hub. Hub in-scan the collected consignments in <Link to="/local/inbound/scanner" className="font-bold text-brand-500 hover:underline">Inbound → Scan to Inbound</Link>, then End Trip.
        </div>
      )}

      <Panel>
        <div className="px-5 pt-3"><Tabs tabs={VIEW_TABS} active={view} onChange={setView} /></div>

        {view === 0 && (
          <div className="px-5 py-4">
            <div className="grid grid-cols-[1fr_auto] gap-5">
              <div>
                <p className="text-[15px] font-bold text-ink">Trip Breakdown</p>
                <div className="mt-3 grid grid-cols-7 gap-3">
                  {breakdown.map(([k, v]) => (
                    <div key={k} className="rounded-md border border-line px-3 py-2">
                      <p className="text-[12px] text-ink-3">{k}</p>
                      <p className="text-[17px] font-bold text-ink tabular-nums">{v}</p>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-[15px] font-bold text-ink">Stop compliance</p>
                <div className="mt-3 flex gap-2">
                  <Counter label="Early" n={comp.early} tone="info" />
                  <Counter label="On-time" n={comp.onTime} tone="success" />
                  <Counter label="Delayed" n={comp.delayed} tone="danger" />
                </div>
                <p className="mt-1.5 text-[12px] text-ink-3">Placeholder — no actual arrival times are recorded locally.</p>
              </div>
            </div>
            <div className="mt-4 rounded-md border border-line px-3 pt-2"><StopTimeline trip={trip} /></div>
          </div>
        )}
        {view === 1 && (
          <EmptyState icon={<MapIcon size={28} />} title="Map not available in local mode"
            hint="The LOCAL app has no map tiles or live GPS. The stop order and ETAs are on Trip Summary." />
        )}
        {view === 2 && <TripFields trip={trip} />}
      </Panel>

      {view === 0 && (
        <div className="mt-4">
          <Panel>
            <div className="px-5 pt-3">
              <Tabs size="sm" tabs={STOP_TABS.map((t, i) => `${t} (${tabCounts[i]})`)} active={stopTab} onChange={setStopTab} />
            </div>
            <div className="p-4">
              {shown.length === 0
                ? <EmptyState title={`No ${STOP_TABS[stopTab].toLowerCase()} stops`} />
                : <DataTable columns={columns} rows={shown} rowKey="key" />}
            </div>
          </Panel>
        </div>
      )}

      {assigning && (
        <AssignDriverModal trip={trip} trips={plan.trips} title={trip.driverName ? 'Change assignee' : 'Assign driver'}
          onClose={() => setAssigning(false)} />
      )}
      {completing && <CompleteStopModal trip={trip} stop={completing} onClose={() => setCompleting(null)} />}
      {failing && <FailStopModal trip={trip} stop={failing} onClose={() => setFailing(null)} />}
    </div>
  )
}

function Counter({ label, n, tone }: { label: string; n: number; tone: Tone }) {
  const cls = tone === 'success' ? 'bg-success-bg text-success-fg' : tone === 'danger' ? 'bg-danger-bg text-danger-fg' : 'bg-info-bg text-info-fg'
  return (
    <div className={`w-20 rounded-md px-3 py-2 ${cls}`}>
      <p className="text-[12px] font-bold">{label}</p>
      <p className="text-[17px] font-bold tabular-nums">{n}</p>
    </div>
  )
}

function TripFields({ trip }: { trip: LocalTrip }) {
  const pairs: [string, string][] = [
    ['Trip ID', trip.id], ['Name', trip.name], ['Status', trip.status], ['Date', fmtDay(trip.date)],
    ['Hub', trip.hubCode || '—'], ['Driver', trip.driverName ?? '—'], ['Vehicle', trip.vehicle ?? '—'],
    ['Carrier', carrierLabel(trip)], ['Type', tripType(trip)], ['Created', new Date(trip.createdAt).toLocaleString()],
  ]
  return (
    <dl className="grid grid-cols-4 gap-x-6 gap-y-4 px-5 py-4 text-[13px]">
      {pairs.map(([k, v]) => (
        <div key={k}><dt className="text-[12px] font-bold text-ink-3">{k}</dt><dd className="mt-0.5 text-ink">{v}</dd></div>
      ))}
    </dl>
  )
}

/* ------------------------------------------------ complete a pickup stop -- */

function CompleteStopModal({ trip, stop, onClose }: { trip: LocalTrip; stop: PlannedStop; onClose: () => void }) {
  const pr = stop.prId ? pickupRequestById(stop.prId) : undefined
  const expected = pr?.orderIds ?? []
  const [picked, setPicked] = useState<Set<string>>(() => new Set(expected))
  const [extra, setExtra] = useState('')
  const [extras, setExtras] = useState<string[]>([])
  const [pieces, setPieces] = useState(() => String(pr?.expectedPieces ?? 0))
  if (!pr) return null
  /* a Reserved booking has no expected list — the driver confirms a COUNT, and
     the uncounted pieces become overages exactly as the driver app records them */
  const reserved = isReserved(pr)

  const addExtra = () => {
    const key = extra.trim().toLowerCase()
    if (!key) return
    const o = findOrderByLabel(key)
    if (!o) { toast.error(`${extra.trim()} matches no consignment — record it as an overage in Inbound.`); return }
    if (expected.includes(o.id)) setPicked((s) => new Set(s).add(o.id))
    else setExtras((x) => [...new Set([...x, o.id])])
    setExtra('')
  }

  const confirm = () => {
    const scanned = [...picked, ...extras]
    if (reserved) {
      const n = Math.max(0, Math.round(Number(pieces) || 0))
      completePickup(trip.id, pr.id, { ...blankWork(n), scanned }, null)
    } else {
      planningActions.completePickupStop(trip.id, pr.id, scanned)
    }
    const after = pickupRequestById(pr.id)
    if (after?.status === 'Completed') {
      const n = after.pickedOrderIds.filter((i) => pr.orderIds.includes(i)).length
      toast.success(`${pr.number} completed — ${n} of ${pr.orderIds.length} collected${extras.length ? ` + ${extras.length} extra` : ''}.`)
    } else {
      toast.error(`${pr.number} — nothing collected, the stop failed.`)
    }
    onClose()
  }

  const allOn = expected.length > 0 && expected.every((i) => picked.has(i))
  return (
    <Modal open title={`Complete pickup — ${pr.number}`} onClose={onClose}
      footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={confirm}>Complete pickup</Button></>}>
      <p className="pb-3 text-[13px] text-ink-2">
        Tick what the driver scanned. Unticked consignments are released back to Ready for Pickup.
        {reserved && ' This is a Reserved booking with no expected list — enter the pieces the driver counted (and any scans below); completing with none fails the stop.'}
      </p>
      {reserved && (
        <div className="w-40 pb-3">
          <Field label="Pieces collected">
            <Input type="number" value={pieces} onChange={setPieces} />
          </Field>
        </div>
      )}
      {expected.length > 0 && (
        <div className="rounded-md border border-line">
          <div className="flex items-center gap-3 border-b border-line bg-warm-25 px-4 py-2 text-[12px] font-bold text-ink-3">
            <Checkbox checked={allOn} indeterminate={!allOn && picked.size > 0}
              onChange={() => setPicked(allOn ? new Set() : new Set(expected))} />
            <span>Expected consignments ({picked.size} of {expected.length} scanned)</span>
          </div>
          {expected.map((oid) => {
            const o = orderById(oid)
            return (
              <div key={oid} className="flex items-center gap-3 border-b border-line px-4 py-2 last:border-0 text-[13px]">
                <Checkbox checked={picked.has(oid)} onChange={() => setPicked((s) => { const n = new Set(s); if (n.has(oid)) n.delete(oid); else n.add(oid); return n })} />
                <span className="font-mono font-bold text-ink">{o?.orderNumber ?? oid}</span>
                <span className="truncate text-ink-3">{o?.receiver.name} · {o?.receiver.city}</span>
              </div>
            )
          })}
        </div>
      )}
      <div className="mt-4 grid grid-cols-[1fr_auto] items-end gap-2 pb-4">
        <Field label="Scanned, not on this booking">
          <Input value={extra} onChange={setExtra} placeholder="Consignment number"
            onKeyDown={(e) => { if (e.key === 'Enter') addExtra() }} />
        </Field>
        <Button variant="outline" onClick={addExtra}>Add scan</Button>
        {extras.length > 0 && (
          <p className="col-span-2 text-[12px] text-ink-3">Extra: {extras.map((i) => orderById(i)?.orderNumber ?? i).join(', ')}</p>
        )}
      </div>
    </Modal>
  )
}

/** A label read: order id, number or tracking number — the same keys hubScan accepts. */
function findOrderByLabel(key: string) {
  return growOrdersSnapshot().orders.find((o) => o.id.toLowerCase() === key || o.orderNumber.toLowerCase() === key
    || (!!o.trackingNumber && o.trackingNumber.toLowerCase() === key))
}

/* ---------------------------------------------------- fail a pickup stop -- */

function FailStopModal({ trip, stop, onClose }: { trip: LocalTrip; stop: PlannedStop; onClose: () => void }) {
  const [reason, setReason] = useState('')
  const [note, setNote] = useState('')
  const labels = (c: string) => PICKABLE_FAILURE_REASONS.find((r) => r.code === c)?.label ?? c
  const confirm = () => {
    if (!stop.prId || !reason) return
    planningActions.failPickupStop(trip.id, stop.prId, reason, note.trim() || undefined)
    toast.success(`${stop.orderNumber} — pickup failed (${labels(reason)}).`)
    onClose()
  }
  return (
    <Modal open title={`Unable to pick up — ${stop.orderNumber}`} onClose={onClose}
      footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button disabled={!reason} onClick={confirm}>Mark failed</Button></>}>
      <div className="grid grid-cols-2 gap-4 pb-4">
        <Field label="Reason" required>
          <MenuSelect value={reason} placeholder="Select a reason" options={PICKABLE_FAILURE_REASONS.map((r) => r.code)} labels={labels} onChange={setReason} />
        </Field>
        <Field label="Note">
          <Input value={note} onChange={setNote} placeholder="Optional" />
        </Field>
      </div>
      <p className="pb-4 text-[13px] text-ink-3">The request moves to Pickup Failed; a re-attempt is raised if attempts remain.</p>
    </Modal>
  )
}
