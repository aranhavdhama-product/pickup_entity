/**
 * Pickup request detail — the read-only view a CFT agent opens from the list.
 *
 * Four cards: pickup details, linked consignments (with per-piece scan state),
 * overages raised on this pickup, and the event timeline. Actions are status
 * driven: OPEN can be cancelled, FAILED can be re-attempted, and a re-attempt
 * links both ways to its original.
 *
 * Soft-data consignments (`CX-*`) are found by `linkedPrId`, NOT by
 * `pr.consignmentIds` — `pushSoftData` links the new consignment to the PR but
 * never appends it to the id list, so `consignmentsForPr` cannot see them.
 */
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  AlertTriangle, CalendarClock, PackageX, RotateCcw, Sparkles, Truck,
} from 'lucide-react'
import {
  Button, ConfirmDialog, EmptyState, PageHeader, Panel, SimpleTable, StatusPill, Tooltip,
  type SimpleCol,
} from '../../nueva/components'
import { toast } from '../../nueva/toast'
import {
  consignmentsForPr, overagesForPr, pickupActions, pickupProgress, prById, usePickupDb,
} from '../../pickup/store'
import { HUB } from '../../pickup/seed'
import type { DemoConsignment, Overage, PREvent, PRStatus } from '../../pickup/types'

const LIST = '/console/order-management/pickup-request'
const DETAIL = (id: string) => `${LIST}/${id}`

const STATUS_TONE: Record<PRStatus, 'success' | 'info' | 'warning' | 'danger' | 'neutral'> = {
  OPEN: 'info', PLANNED: 'neutral', IN_PROGRESS: 'warning', COMPLETED: 'success',
  COMPLETED_SHORT: 'warning', FAILED: 'danger', CANCELLED: 'neutral',
}
const STATUS_LABEL: Record<PRStatus, string> = {
  OPEN: 'Open', PLANNED: 'Planned', IN_PROGRESS: 'In Progress', COMPLETED: 'Completed',
  COMPLETED_SHORT: 'Completed Short', FAILED: 'Failed', CANCELLED: 'Cancelled',
}
const OVERAGE_KIND: Record<Overage['kind'], string> = {
  UNKNOWN_SCAN: 'Unknown scan',
  UNLABELED: 'Unlabeled item',
  UNLABELED_GROUP: 'Unlabeled bundle',
}
/** Pieces only carry meaningful scan state once the driver has been on site. */
const RAN: PRStatus[] = ['IN_PROGRESS', 'COMPLETED', 'COMPLETED_SHORT', 'FAILED']

function Chip({ children, tone = 'neutral' }: { children: React.ReactNode; tone?: 'neutral' | 'brand' | 'warning' }) {
  const tint = tone === 'brand' ? 'bg-brand-50 text-brand-600'
    : tone === 'warning' ? 'bg-warning-bg text-warning-fg'
    : 'bg-warm-100 text-ink-2'
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-bold ${tint}`}>
      {children}
    </span>
  )
}

function Kv({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-ink-3">{label}</p>
      <div className="mt-0.5 text-[13px] text-ink">{value ?? '—'}</div>
    </div>
  )
}

function fmtTime(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  return d.toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export default function PickupRequestDetail() {
  const { id = '' } = useParams()
  const db = usePickupDb()
  const navigate = useNavigate()
  const [confirming, setConfirming] = useState(false)

  const pr = prById(db, id)
  if (!pr) {
    return (
      <div className="fe-nueva bg-canvas min-h-full p-5">
        <PageHeader title="Pickup Request" subtitle={id} onBack={() => navigate(LIST)} />
        <Panel>
          <EmptyState icon={<PackageX size={40} />} title="Pickup request not found"
            hint={`No request with id ${id} exists in the demo store.`} />
        </Panel>
      </div>
    )
  }

  const linked = consignmentsForPr(db, pr.id)
  // born from soft data after the fact — linked to the PR, absent from its id list
  const softData = db.consignments.filter(
    (c) => c.linkedPrId === pr.id && !pr.consignmentIds.includes(c.id))
  const overages = overagesForPr(db, pr.id)
  const prog = pickupProgress(db, pr.id)
  const ran = RAN.includes(pr.status)
  const events = [...pr.events].reverse()

  const cancel = () => {
    pickupActions.cancelPickupRequest(pr.id, 'Cancelled by CFT')
    setConfirming(false)
    toast.success(`${pr.id} cancelled — its consignments are back in the pending pool.`)
  }

  const reattempt = () => {
    const next = pickupActions.reattemptPickupRequest(pr.id)
    if (!next) { toast.error(`Could not re-attempt ${pr.id}.`); return }
    toast.success(`${next.id} raised — attempt ${next.attempt} of ${next.maxAttempts}.`)
    navigate(DETAIL(next.id))
  }

  const typeChips = [
    pr.blind ? 'Blind' : 'Against consignments',
    pr.scannable ? 'Scan-based' : 'Count-based',
    ...(pr.skuMode ? ['SKU picking'] : []),
  ]

  return (
    <div className="fe-nueva bg-canvas min-h-full p-5">
      {/* the app header already carries "PR-0001" at 20px — this row names the
          merchant instead of repeating the id under it */}
      <PageHeader
        title={pr.merchantName}
        subtitle={`${pr.locationName} · ${pr.address}`}
        onBack={() => navigate(LIST)}
        right={
          <div className="flex items-center gap-2">
            <StatusPill label={STATUS_LABEL[pr.status]} tone={STATUS_TONE[pr.status]} />
            <Chip>{pr.source}</Chip>
            {(pr.attempt > 1 || pr.status === 'FAILED') && (
              <Chip>Attempt {pr.attempt}/{pr.maxAttempts}</Chip>
            )}
            {pr.status === 'OPEN' && (
              <>
                {/* there is no slot-edit action in the domain layer — the demo
                    raises a new request rather than mutating a live one */}
                <Tooltip text="Slot changes are not editable in this demo — cancel and raise a new request" side="bottom">
                  <Button size="sm" variant="outline" disabled>Edit slot</Button>
                </Tooltip>
                <Button size="sm" variant="ghost" onClick={() => setConfirming(true)}>Cancel request</Button>
              </>
            )}
            {pr.status === 'FAILED' && !pr.reattemptPrId && (
              <Button size="sm" icon={<RotateCcw size={13} />} onClick={reattempt}>Re-attempt</Button>
            )}
          </div>
        }
      />

      {/* lineage — a re-attempt and its original always point at each other */}
      {(pr.parentPrId || pr.reattemptPrId) && (
        <div className="mb-3 flex flex-wrap items-center gap-4 rounded-md border border-line bg-surface px-5 py-2.5 text-[12.5px]">
          {pr.parentPrId && (
            <span className="text-ink-3">
              Re-attempt of{' '}
              <button onClick={() => navigate(DETAIL(pr.parentPrId!))}
                className="font-mono font-bold text-brand-500 hover:underline">{pr.parentPrId}</button>
            </span>
          )}
          {pr.reattemptPrId && (
            <span className="text-ink-3">
              Re-attempted as{' '}
              <button onClick={() => navigate(DETAIL(pr.reattemptPrId!))}
                className="font-mono font-bold text-brand-500 hover:underline">{pr.reattemptPrId}</button>
            </span>
          )}
        </div>
      )}

      {pr.failureReason && (
        <div className="mb-3 flex items-start gap-2.5 rounded-md border border-danger-fg/25 bg-danger-bg px-4 py-3">
          <AlertTriangle size={15} className="mt-0.5 shrink-0 text-danger-fg" />
          <p className="text-[13px] text-danger-fg">
            <span className="font-bold">{pr.status === 'CANCELLED' ? 'Cancelled' : 'Pickup failed'}:</span> {pr.failureReason}
          </p>
        </div>
      )}

      <div className="grid gap-4">
        {/* ------------------------------------------------ pickup details */}
        <Panel title="Pickup Details">
          <div className="grid grid-cols-1 gap-x-6 gap-y-4 px-5 pb-5 pt-3 sm:grid-cols-2 xl:grid-cols-4">
            <Kv label="Merchant" value={<>{pr.merchantName}<span className="ml-1.5 font-mono text-[11.5px] text-ink-3">{pr.merchantCode}</span></>} />
            <Kv label="Pickup location" value={<>{pr.locationName}<span className="ml-1.5 font-mono text-[11.5px] text-ink-3">{pr.locationCode}</span></>} />
            <Kv label="Address" value={pr.address || '—'} />
            <Kv label="Contact" value={<>{pr.contactName || '—'}<span className="block text-[12px] text-ink-3">{pr.contactPhone}</span></>} />
            <Kv label="Slot" value={pr.slot
              ? <span className="tabular-nums">{pr.slot.date} · {pr.slot.start}–{pr.slot.end}</span>
              : <span className="text-ink-3">No slot — any time</span>} />
            <Kv label="Type" value={
              <span className="flex flex-wrap gap-1">{typeChips.map((c) => <Chip key={c}>{c}</Chip>)}</span>
            } />
            <Kv label="Expected pieces" value={
              <span className="tabular-nums">
                {prog.expected}
                {ran && <span className="text-ink-3"> · {prog.collected} collected</span>}
                {ran && prog.overages > 0 && <span className="text-warning-fg"> · {prog.overages} overage(s)</span>}
              </span>
            } />
            <Kv label="Raised" value={<>{fmtTime(pr.createdAt)}<span className="block text-[12px] text-ink-3">{pr.createdBy}</span></>} />
            {pr.tripId && (
              <Kv label="Trip" value={
                <span className="inline-flex items-center gap-1.5">
                  <Truck size={13} className="text-ink-3" /><span className="font-mono text-[12.5px]">{pr.tripId}</span>
                </span>
              } />
            )}
            {pr.confirmedPieces !== undefined && (
              <Kv label="Confirmed count" value={<span className="tabular-nums">{pr.confirmedPieces}</span>} />
            )}
          </div>
        </Panel>

        {/* ------------------------------------------- linked consignments */}
        <Panel title={`Linked Consignments (${linked.length})`}>
          {linked.length === 0 ? (
            <div className="px-5 pb-6 pt-2">
              {pr.blind ? (
                <div className="flex items-start gap-3 rounded-md border border-line bg-warm-25 px-4 py-3">
                  <Sparkles size={15} className="mt-0.5 shrink-0 text-brand-500" />
                  <div className="text-[12.5px] text-ink-2">
                    <p className="font-bold text-ink">Blind pickup — no consignment data yet</p>
                    <p className="mt-0.5 text-ink-3">
                      {pr.expectedPieces ?? '?'} piece(s) were declared. Everything the driver hands over is
                      captured as an overage and reconciled into real consignments once the merchant's
                      soft data lands.
                    </p>
                  </div>
                </div>
              ) : (
                <p className="text-[13px] text-ink-3">No consignments are linked to this request.</p>
              )}
            </div>
          ) : (
            <div className="pb-1">
              <ConsignmentTable rows={linked} showScans={ran} />
            </div>
          )}

          {softData.length > 0 && (
            <div className="border-t border-line px-5 py-4">
              <p className="mb-2 flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-[0.06em] text-ink-3">
                <Sparkles size={13} className="text-brand-500" />
                Created from soft data ({softData.length})
              </p>
              <div className="-mx-5">
                <ConsignmentTable rows={softData} showScans />
              </div>
            </div>
          )}
        </Panel>

        {/* ------------------------------------------------------ overages */}
        <Panel title={`Overages (${overages.length})`}>
          {overages.length === 0 ? (
            <p className="px-5 pb-6 pt-2 text-[13px] text-ink-3">
              Nothing unexpected was handed over on this pickup.
            </p>
          ) : (
            <SimpleTable
              rows={overages}
              rowKey={(o) => o.id}
              columns={OVERAGE_COLS}
            />
          )}
        </Panel>

        {/* ------------------------------------------------------ timeline */}
        <Panel title="Timeline">
          <div className="px-5 pb-5 pt-3">
            {events.length === 0 ? (
              <EmptyState icon={<CalendarClock size={36} />} title="No events yet"
                hint="Events appear as the request is planned, executed and closed." />
            ) : (
              <div className="relative pl-1">
                {events.map((e: PREvent, i) => (
                  <div key={`${e.at}-${i}`} className="relative pb-5 pl-6 last:pb-0">
                    {i < events.length - 1 && <span className="absolute left-[7px] top-4 bottom-0 w-px bg-line" />}
                    <span className="absolute left-0 top-1 inline-flex h-4 w-4 items-center justify-center rounded-full border-2 border-brand-500 bg-surface">
                      <span className="h-1.5 w-1.5 rounded-full bg-brand-500" />
                    </span>
                    <p className="text-[13.5px] font-bold text-ink">{e.label}</p>
                    <p className="mt-0.5 text-[12px] text-ink-3">
                      {fmtTime(e.at)}{e.actor && <span> · {e.actor}</span>}
                    </p>
                    {e.detail && <p className="mt-0.5 text-[12.5px] text-ink-2">{e.detail}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </Panel>

        <p className="pb-2 text-[12px] text-ink-3">
          Collected pieces are handed over at {HUB} during trip debrief.
        </p>
      </div>

      <ConfirmDialog
        open={confirming}
        title={`Cancel ${pr.id}?`}
        message="The pickup request is closed and its consignments return to the pending pool, ready to be planned onto another request."
        confirmLabel="Cancel request"
        cancelLabel="Keep it"
        onConfirm={cancel}
        onClose={() => setConfirming(false)}
      />
    </div>
  )
}

/* ------------------------------------------------------------------- pieces ---- */

const OVERAGE_COLS: SimpleCol<Overage>[] = [
  {
    label: 'Tracking number',
    render: (o) => (
      <span className="font-mono text-[12px] font-bold text-ink">
        {o.scannedTrackingNumber || <span className="font-sans font-normal text-ink-3">No label</span>}
      </span>
    ),
  },
  {
    label: 'Valid',
    render: (o) => (o.validTracking
      ? <Chip tone="neutral">Valid format</Chip>
      : <Chip tone="warning">Not a tracking number</Chip>),
  },
  { label: 'Kind', render: (o) => <span className="text-ink-2">{OVERAGE_KIND[o.kind]}</span> },
  { label: 'State', render: (o) => <span className="text-ink-2">{o.state === 'AT_FACILITY' ? 'At facility' : 'Created'}</span> },
  { label: 'Scanned', render: (o) => <span className="whitespace-nowrap text-[12px] text-ink-3">{fmtTime(o.scannedAt)} · {o.scannedBy}</span> },
  {
    label: 'Reconciled',
    render: (o) => (o.reconciled
      ? <span className="text-[12.5px] text-ink-2">→ <span className="font-mono font-bold text-brand-500">{o.reconciledConsignmentId}</span></span>
      : <Chip tone="warning">Open</Chip>),
  },
]

/** Linked-consignment table — amber rows carry a field exception awaiting CFT. */
function ConsignmentTable({ rows, showScans }: { rows: DemoConsignment[]; showScans: boolean }) {
  return (
    <table className="w-full text-[13px]">
      <thead>
        <tr className="border-b border-line text-left text-[12px] font-bold text-ink-3">
          <th className="px-5 py-2.5">Consignment</th>
          <th className="px-3 py-2.5">Delivery</th>
          <th className="px-3 py-2.5">Pieces</th>
          <th className="px-3 py-2.5 text-right">Weight</th>
          <th className="px-3 py-2.5">State</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((c) => (
          <tr key={c.id}
            className={`border-b border-line last:border-0 transition-colors ${c.amberException ? 'bg-warning-bg/50' : 'hover:bg-warm-50'}`}>
            <td className="px-5 py-3">
              <span className="font-mono text-[12px] font-bold text-brand-500">{c.id}</span>
              <span className="ml-1.5 font-mono text-[11.5px] text-ink-3">{c.orderId}</span>
              {c.createdVia === 'SOFT_DATA' && <span className="ml-1.5"><Chip tone="brand">Soft data</Chip></span>}
              {c.amberException && <span className="ml-1.5"><Chip tone="warning">Extra piece</Chip></span>}
            </td>
            <td className="px-3 py-3">
              <span className="block text-ink">{c.deliveryName}</span>
              <span className="block text-[12px] text-ink-3">{c.deliveryCity || '—'}</span>
            </td>
            <td className="px-3 py-3">
              {c.pieces.length === 0 && (c.skus?.length ?? 0) > 0 ? (
                <span className="text-[12.5px] text-ink-3">
                  {c.skus!.map((s) => `${s.code} ×${s.qty}`).join(' · ')}
                </span>
              ) : c.pieces.length === 0 ? (
                <span className="text-ink-3">—</span>
              ) : (
                <span className="flex flex-wrap items-center gap-1.5">
                  {c.pieces.map((p) => {
                    const tint = !showScans ? 'bg-warm-100 text-ink-2'
                      : p.addedInField ? 'bg-warning-bg text-warning-fg'
                      : p.scanned ? 'bg-success-bg text-success-fg'
                      : 'bg-warm-100 text-ink-3'
                    const state = !showScans ? 'not started'
                      : p.addedInField ? 'added in field'
                      : p.scanned ? 'scanned' : 'not scanned'
                    return (
                      <span key={p.trackingNumber} title={`${p.trackingNumber} — ${state}`}
                        className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 font-mono text-[11px] ${tint}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${
                          !showScans ? 'bg-warm-400'
                            : p.addedInField ? 'bg-warning-fg'
                            : p.scanned ? 'bg-success-fg' : 'bg-warm-400'}`} />
                        {p.trackingNumber}
                      </span>
                    )
                  })}
                </span>
              )}
            </td>
            <td className="px-3 py-3 text-right tabular-nums text-ink-2">{c.weightKg} kg</td>
            <td className="px-3 py-3 text-ink-2">{c.state.replace(/_/g, ' ').toLowerCase()}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
