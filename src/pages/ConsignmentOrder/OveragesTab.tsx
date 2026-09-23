/**
 * Overages + Pickup Exceptions — the two first-mile demo tabs on the Consignment
 * Order page (CTO slide 6: "a Tab in CO page to view Overages").
 *
 * EXPORT SURFACE
 *   <OveragesTab />          the dedicated Overage entity worklist: scanned TN,
 *                            valid-format flag, who scanned it and when, state,
 *                            reconciliation. Actions: attach an overage to an
 *                            existing order, or push soft data to auto-reconcile.
 *   <PickupExceptionsTab />  the AMBER queue: consignments carrying pieces added
 *                            in the field, awaiting CFT verification of
 *                            dims / weight / hazmat / VIP / customs / HSN.
 *   <DemoTabButton />        the tab-strip button that selects either view. It
 *                            lives here (not in components.tsx, which is shared
 *                            and frozen for this task) so the Consignment Order
 *                            page integration stays a handful of lines.
 *
 * Everything reads and writes the local `src/pickup` demo store — no staging
 * calls, no fetches. "Reset demo" belongs to the listing page, not here.
 */
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AlertTriangle, ArrowRight, Boxes, CheckCircle2, CloudDownload, PackageSearch, ShieldCheck,
} from 'lucide-react'
import {
  Button, ClearFilters, EmptyState, Field, Input, MenuSelect, Modal,
  SearchInput, SearchSelect, StatusPill, Toggle,
} from '../../nueva/components'
import { toast } from '../../nueva/toast'
import { amberConsignments, getPickupDb, pickupActions, usePickupDb } from '../../pickup/store'
import type { DemoConsignment, Overage, Piece } from '../../pickup/types'

/* ---------------- shared helpers ---------------- */

const KIND_LABEL: Record<Overage['kind'], string> = {
  UNKNOWN_SCAN: 'Unknown scan',
  UNLABELED: 'Unlabeled',
  UNLABELED_GROUP: 'Unlabeled group',
}

const STATE_LABEL: Record<Overage['state'], string> = {
  CREATED: 'Created',
  AT_FACILITY: 'At Facility',
}

/** Unlabeled goods never carried a label — they are not "invalid format". */
const hasLabel = (o: Overage) => o.kind === 'UNKNOWN_SCAN'

function whenLabel(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleString(undefined, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

/** '' / 'abc' → null, so a blank field never writes 0 or NaN over real data. */
function num(v: string): number | null {
  const t = v.trim()
  if (!t) return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

const fieldPieces = (c: DemoConsignment) => c.pieces.filter((p) => p.addedInField)

/* ---------------- tab-strip button (rendered by ConsignmentOrder/index.tsx) ---------------- */

export function DemoTabButton({ kind, count, active, onClick }: {
  kind: 'overages' | 'exceptions'
  count: number
  active: boolean
  onClick: () => void
}) {
  const overages = kind === 'overages'
  const Icon = overages ? Boxes : AlertTriangle
  const amber = !overages && count > 0
  return (
    <button type="button" onClick={onClick} title={overages
      ? 'Stray scans and unlabeled goods captured at pickup'
      : 'Field-added pieces awaiting CFT verification'}
      className={`relative inline-flex items-center gap-1.5 px-4 py-2.5 text-[14px] whitespace-nowrap transition-colors
        ${active ? 'text-ink font-bold' : 'text-ink-2 hover:text-ink'}`}>
      <Icon size={15} className={active ? 'text-brand-500' : amber ? 'text-warning-fg' : 'text-warm-400'} />
      {overages ? 'Overages' : 'Pickup Exceptions'}
      <span className={`rounded-full px-1.5 py-0.5 text-[11px] font-bold tabular-nums
        ${amber ? 'bg-warning-bg text-warning-fg' : 'bg-warm-100 text-ink-2'}`}>{count}</span>
      <span className="rounded-full border border-line px-1.5 py-px text-[9.5px] font-bold uppercase tracking-wide text-warm-400">
        Demo
      </span>
      {active && <span className="absolute left-0 right-0 bottom-0 h-0.5 bg-brand-500 rounded-full" />}
    </button>
  )
}

/* ======================================================================
 * A · OVERAGES — the dedicated Overage entity
 * ==================================================================== */

export function OveragesTab() {
  const db = usePickupDb()
  const navigate = useNavigate()
  const [stateFilter, setStateFilter] = useState('')
  const [recFilter, setRecFilter] = useState('')
  const [query, setQuery] = useState('')
  const [attaching, setAttaching] = useState<Overage | null>(null)
  /** Kairos transparency: what the last "Push soft data" actually created. */
  const [pushed, setPushed] = useState<{ tn: string; cid: string }[]>([])

  /* the full ledger, not just the open worklist — the Reconciled column and
     filter only mean something when reconciled rows are in the table too */
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return db.overages.filter((o) => {
      if (stateFilter && STATE_LABEL[o.state] !== stateFilter) return false
      if (recFilter === 'Reconciled' && !o.reconciled) return false
      if (recFilter === 'Not reconciled' && o.reconciled) return false
      if (!q) return true
      return [o.scannedTrackingNumber, o.id, o.prId, o.note, o.reconciledConsignmentId, o.scannedBy]
        .some((v) => (v ?? '').toLowerCase().includes(q))
    })
  }, [db.overages, stateFilter, recFilter, query])

  const filtersActive = !!stateFilter || !!recFilter || !!query
  const openCount = db.overages.filter((o) => !o.reconciled).length

  const push = () => {
    // pushSoftData returns a count only; hold the ROW REFS (the store mutates in
    // place) so the id it stamps on each one can be read back for the card
    const candidates = getPickupDb().overages.filter((o) => !o.reconciled && o.validTracking)
    const n = pickupActions.pushSoftData()
    if (!n) {
      setPushed([])
      toast.info('No open overage has a valid-format tracking number — soft data cannot reconcile these.')
      return
    }
    setPushed(candidates
      .filter((o) => o.reconciled && o.reconciledConsignmentId)
      .map((o) => ({ tn: o.scannedTrackingNumber, cid: o.reconciledConsignmentId as string })))
    toast.success(`${n} overage${n === 1 ? '' : 's'} reconciled — consignment${n === 1 ? '' : 's'} created`)
  }

  return (
    <div>
      <div className="flex flex-nowrap items-center gap-2 mb-3">
        <SearchSelect className="w-44 shrink-0" label="State" value={stateFilter}
          options={['Created', 'At Facility']} onChange={setStateFilter} />
        <SearchSelect className="w-44 shrink-0" label="Reconciliation" value={recFilter}
          options={['Reconciled', 'Not reconciled']} onChange={setRecFilter} />
        <ClearFilters active={filtersActive}
          onClick={() => { setStateFilter(''); setRecFilter(''); setQuery('') }} />
        <div className="ml-auto flex items-center gap-2 shrink-0">
          <div className="w-52">
            <SearchInput value={query} placeholder="Search tracking number" onChange={setQuery} />
          </div>
          <Button variant="outline" icon={<CloudDownload size={14} />} onClick={push}>Push soft data</Button>
        </div>
      </div>

      {pushed.length > 0 && (
        <div className="mb-3 flex items-start gap-2 rounded-md border border-success-fg/25 bg-success-bg px-4 py-3">
          <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-success-fg" />
          <div className="min-w-0">
            <div className="text-[13px] font-bold text-ink">
              Merchant soft data received — {pushed.length} overage{pushed.length === 1 ? '' : 's'} reconciled
            </div>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {pushed.map((m) => (
                <span key={`${m.tn}-${m.cid}`}
                  className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-2 py-0.5 text-[11.5px]">
                  <span className="font-mono font-bold text-ink">{m.tn}</span>
                  <ArrowRight size={11} className="text-warm-400" />
                  <span className="font-bold text-success-fg">{m.cid}</span>
                </span>
              ))}
            </div>
            <button type="button" onClick={() => setPushed([])}
              className="mt-2 text-[12px] font-bold text-ink-3 hover:text-ink">Dismiss</button>
          </div>
        </div>
      )}

      <div className="bg-surface border border-line rounded-md overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-line bg-thead">
                {['Scanned TN', 'Valid', 'Kind', 'Scanned by', 'Pickup request', 'State', 'Reconciled', ''].map((h, i) => (
                  <th key={h || `a${i}`} className="px-4 py-2.5 text-left font-bold text-ink whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((o) => (
                <tr key={o.id} className="border-b border-line last:border-0 transition-colors hover:bg-warm-50">
                  <td className="px-4 py-3">
                    {o.scannedTrackingNumber
                      ? <div className="font-mono text-[13px] font-bold text-ink">{o.scannedTrackingNumber}</div>
                      : <div className="text-[13px] text-ink-3">No label captured</div>}
                    <div className="mt-0.5 text-[11.5px] text-ink-3">
                      {o.id}{o.note ? ` · ${o.note}` : ''}
                    </div>
                    {hasLabel(o) && !o.validTracking && !o.reconciled && (
                      <div className="mt-0.5 text-[11.5px] text-danger-fg">
                        Invalid tracking format — soft data will not reconcile this one; attach it by hand.
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {!hasLabel(o)
                      ? <StatusPill label="No label" tone="neutral" />
                      : o.validTracking
                        ? <StatusPill label="Valid" tone="success" />
                        : <StatusPill label="Invalid format" tone="danger" />}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <StatusPill label={KIND_LABEL[o.kind]} tone="neutral" />
                      {o.kind === 'UNLABELED_GROUP' && o.groupId && (
                        // the raw groupId is GRP-<epoch ms> — show a short, stable bundle tag
                        <span title={o.groupId}
                          className="rounded-full border border-line px-1.5 py-0.5 text-[10.5px] font-bold text-ink-3">
                          Bundle ·{o.groupId.slice(-4)}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-ink">{o.scannedBy || '—'}</div>
                    <div className="text-[11.5px] text-ink-3">{whenLabel(o.scannedAt)}</div>
                  </td>
                  <td className="px-4 py-3">
                    {o.prId ? (
                      <button type="button" onClick={() => navigate(`/console/order-management/pickup-request/${o.prId}`)}
                        className="text-[13px] font-bold text-brand-500 hover:text-brand-600">{o.prId}</button>
                    ) : <span className="text-ink-3">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    <StatusPill label={STATE_LABEL[o.state]} tone={o.state === 'CREATED' ? 'info' : 'neutral'} />
                  </td>
                  <td className="px-4 py-3">
                    {o.reconciled
                      ? <StatusPill label={o.reconciledConsignmentId ?? 'Reconciled'} tone="success" />
                      : <span className="text-ink-3">—</span>}
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    {!o.reconciled && (
                      <button type="button" onClick={() => setAttaching(o)}
                        className="text-[12.5px] font-bold text-brand-500 hover:text-brand-600">Attach to order…</button>
                    )}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4">
                    <EmptyState
                      icon={<PackageSearch size={40} />}
                      title={filtersActive ? 'No overages match these filters' : 'No overages recorded'}
                      hint={filtersActive
                        ? 'Clear the filters to see the full overage ledger.'
                        : 'An overage is raised when a driver scans a label the pickup did not expect, or hands over unlabeled goods.'}
                    />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-2.5 text-[12px] text-ink-3">
        {/* ledger totals, not the filtered view — this is what the tab badge counts */}
        Overage ledger: {openCount} open · {db.overages.length - openCount} reconciled ·{' '}
        Reconciling creates a real consignment (soft data) or attaches the piece to one you already have.
      </div>

      {attaching && <AttachModal overage={attaching} onClose={() => setAttaching(null)} />}
    </div>
  )
}

/* ---------------- attach an overage to an existing order ---------------- */

function AttachModal({ overage, onClose }: { overage: Overage; onClose: () => void }) {
  const db = usePickupDb()
  const [query, setQuery] = useState('')
  const [picked, setPicked] = useState('')

  const list = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return db.consignments
    return db.consignments.filter((c) =>
      [c.id, c.orderId, c.merchantName, c.deliveryName, c.deliveryCity]
        .some((v) => (v ?? '').toLowerCase().includes(q)))
  }, [db.consignments, query])

  const label = overage.scannedTrackingNumber || overage.id

  const confirm = () => {
    if (!picked) return
    pickupActions.attachOverageToConsignment(overage.id, picked)
    toast.success(`${label} attached to ${picked} — now awaiting CFT verification`)
    onClose()
  }

  return (
    <Modal
      title="Attach overage to an order"
      open
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={confirm} disabled={!picked}>Attach as a piece</Button>
        </>
      }
    >
      <div className="mb-3 rounded-md border border-line bg-warm-50 px-4 py-2.5">
        <div className="text-[12px] font-bold uppercase tracking-wide text-ink-3">Overage</div>
        <div className="mt-0.5 flex items-center gap-2">
          <span className="font-mono text-[13px] font-bold text-ink">{label}</span>
          <StatusPill label={KIND_LABEL[overage.kind]} tone="neutral" />
          {hasLabel(overage) && !overage.validTracking && <StatusPill label="Invalid format" tone="danger" />}
        </div>
        <div className="mt-1 text-[12.5px] text-ink-3">
          It becomes a piece on the order you pick, and the order is flagged amber for CFT verification.
        </div>
      </div>

      <div className="mb-2 w-64">
        <SearchInput value={query} placeholder="Search order or consignment" onChange={setQuery} />
      </div>

      <div className="rounded-md border border-line overflow-hidden">
        {list.map((c) => {
          const on = picked === c.id
          return (
            <button key={c.id} type="button" onClick={() => setPicked(c.id)}
              className={`w-full flex items-center gap-3 border-b border-line px-4 py-2.5 text-left last:border-0 transition-colors
                ${on ? 'bg-brand-50' : 'hover:bg-warm-50'}`}>
              <span className={`h-3.5 w-3.5 shrink-0 rounded-full border flex items-center justify-center
                ${on ? 'border-brand-500' : 'border-warm-300'}`}>
                {on && <span className="h-2 w-2 rounded-full bg-brand-500" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[13px]">
                  <span className="font-mono font-bold text-ink">{c.id}</span>
                  <span className="ml-2 text-ink-3">Order {c.orderId}</span>
                </span>
                <span className="block text-[12px] text-ink-3 truncate">
                  {c.merchantName ?? '—'} · {c.deliveryName} · {c.deliveryCity || '—'}
                </span>
              </span>
              <span className="shrink-0 text-[11.5px] text-ink-3 tabular-nums">{c.pieces.length} pc</span>
              <StatusPill label={c.state.replace(/_/g, ' ')} tone="neutral" />
            </button>
          )
        })}
        {list.length === 0 && (
          <div className="px-4 py-8 text-center text-[13px] text-ink-3">No orders match “{query}”.</div>
        )}
      </div>
    </Modal>
  )
}

/* ======================================================================
 * B · PICKUP EXCEPTIONS — amber CFT verification queue
 * ==================================================================== */

export function PickupExceptionsTab() {
  const db = usePickupDb()
  const rows = useMemo(() => amberConsignments(db), [db.consignments]) // eslint-disable-line react-hooks/exhaustive-deps
  const [review, setReview] = useState<{ consignment: DemoConsignment; piece: Piece } | null>(null)

  if (rows.length === 0) {
    return (
      <div className="bg-surface border border-line rounded-md">
        <EmptyState
          icon={<ShieldCheck size={40} />}
          title="No pickup exceptions"
          hint="Rows land here when a driver adds a piece at the doorstep, when an overage is attached to an order, or when a SKU pick comes back short or damaged."
        />
      </div>
    )
  }

  return (
    <div>
      <div className="mb-3 flex items-center gap-2 rounded-md border border-warning-fg/25 bg-warning-bg px-4 py-2.5">
        <AlertTriangle size={15} className="shrink-0 text-warning-fg" />
        <div className="text-[12.5px] text-ink-2">
          Pieces captured in the field carry no verified dimensions, weight or compliance data. CFT must confirm
          each one before the consignment can be billed and moved.
        </div>
        <span className="ml-auto shrink-0 text-[12px] font-bold tabular-nums text-warning-fg">
          {rows.length} consignment{rows.length === 1 ? '' : 's'}
        </span>
      </div>

      <div className="space-y-3">
        {rows.map((c) => {
          const pieces = fieldPieces(c)
          const pending = pieces.filter((p) => !p.verified).length
          return (
            <div key={c.id} className="bg-surface border border-line rounded-md overflow-hidden">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line bg-warm-50 px-4 py-3">
                <span className="font-mono text-[13px] font-bold text-ink">{c.id}</span>
                <span className="text-[12.5px] text-ink-3">Order {c.orderId}</span>
                <span className="text-[12.5px] text-ink-2">{c.merchantName ?? '—'}</span>
                <span className="text-[12.5px] text-ink-3 truncate">{c.deliveryName} · {c.deliveryCity || '—'}</span>
                <span className="ml-auto flex items-center gap-2">
                  <StatusPill label={`${pieces.length} field-added piece${pieces.length === 1 ? '' : 's'}`} tone="neutral" />
                  {pending > 0
                    ? <StatusPill label={`${pending} unverified`} tone="warning" />
                    : <StatusPill label="All verified" tone="success" />}
                </span>
              </div>

              {pieces.length === 0 ? (
                <div className="px-4 py-3 text-[12.5px] text-ink-3">
                  SKU short/damage exception — no piece was added in the field, so there is nothing for CFT to
                  verify here. It clears from the SKU reconciliation flow, not from this tab.
                  {(c.skus ?? []).some((s) => (s.missing ?? 0) > 0 || (s.damaged ?? 0) > 0) && (
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {(c.skus ?? [])
                        .filter((s) => (s.missing ?? 0) > 0 || (s.damaged ?? 0) > 0)
                        .map((s) => (
                          <span key={s.code} className="rounded-full border border-line px-2 py-0.5 text-[11.5px] text-ink-2">
                            <span className="font-bold text-ink">{s.code}</span>
                            {(s.missing ?? 0) > 0 && <> · {s.missing} missing</>}
                            {(s.damaged ?? 0) > 0 && <> · {s.damaged} damaged</>}
                          </span>
                        ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-[13px]">
                    <thead>
                      <tr className="border-b border-line bg-thead">
                        {['Tracking number', 'Dimensions', 'Weight', 'Flags', 'HSN', 'Status', ''].map((h, i) => (
                          <th key={h || `a${i}`} className="px-4 py-2.5 text-left font-bold text-ink whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {pieces.map((p) => (
                        <tr key={p.trackingNumber} className="border-b border-line last:border-0 transition-colors hover:bg-warm-50">
                          <td className="px-4 py-3 font-mono text-[13px] font-bold text-ink">{p.trackingNumber}</td>
                          <td className="px-4 py-3 text-ink-2 tabular-nums">
                            {p.dims ? `${p.dims.l} × ${p.dims.b} × ${p.dims.h} ${p.dims.uom}` : <span className="text-ink-3">Not captured</span>}
                          </td>
                          <td className="px-4 py-3 text-ink-2 tabular-nums">
                            {p.weightKg != null ? `${p.weightKg} kg` : <span className="text-ink-3">Not captured</span>}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap items-center gap-1">
                              {p.hazmat && <StatusPill label="Hazmat" tone="danger" />}
                              {p.vip && <StatusPill label="VIP" tone="info" />}
                              {p.customsClearance && <StatusPill label="Customs" tone="warning" />}
                              {!p.hazmat && !p.vip && !p.customsClearance && <span className="text-ink-3">—</span>}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-ink-2">{p.hsnCode || <span className="text-ink-3">—</span>}</td>
                          <td className="px-4 py-3">
                            {p.verified
                              ? <StatusPill label="Verified" tone="success" />
                              : <StatusPill label="Unverified" tone="warning" />}
                          </td>
                          <td className="px-4 py-3 text-right whitespace-nowrap">
                            {!p.verified && (
                              <button type="button" onClick={() => setReview({ consignment: c, piece: p })}
                                className="text-[12.5px] font-bold text-brand-500 hover:text-brand-600">Review &amp; update</button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {review && (
        <ReviewPieceModal
          consignment={review.consignment}
          piece={review.piece}
          onClose={() => setReview(null)}
        />
      )}
    </div>
  )
}

/* ---------------- CFT verification form ---------------- */

const UOMS = ['CM', 'IN', 'M']

function ReviewPieceModal({ consignment, piece, onClose }: {
  consignment: DemoConsignment; piece: Piece; onClose: () => void
}) {
  const [l, setL] = useState(piece.dims ? String(piece.dims.l) : '')
  const [b, setB] = useState(piece.dims ? String(piece.dims.b) : '')
  const [h, setH] = useState(piece.dims ? String(piece.dims.h) : '')
  const [uom, setUom] = useState(piece.dims?.uom ?? 'CM')
  const [weight, setWeight] = useState(piece.weightKg != null ? String(piece.weightKg) : '')
  const [hazmat, setHazmat] = useState(!!piece.hazmat)
  const [vip, setVip] = useState(!!piece.vip)
  const [customs, setCustoms] = useState(!!piece.customsClearance)
  const [hsn, setHsn] = useState(piece.hsnCode ?? '')

  const nl = num(l), nb = num(b), nh = num(h), nw = num(weight)
  const dimsDone = nl != null && nb != null && nh != null
  const missing = (dimsDone ? 0 : 1) + (nw != null ? 0 : 1)

  const save = () => {
    // patch only what actually has a value — updatePieceCFT Object.assigns it,
    // so an undefined key would wipe data that is already on the piece
    const patch: Partial<Piece> = { hazmat, vip, customsClearance: customs }
    if (dimsDone) patch.dims = { l: nl as number, b: nb as number, h: nh as number, uom }
    if (nw != null) patch.weightKg = nw
    if (hsn.trim()) patch.hsnCode = hsn.trim()
    // the tracking number is the match key inside the store — never editable here
    pickupActions.updatePieceCFT(consignment.id, piece.trackingNumber, patch)
    toast.success(`${piece.trackingNumber} verified on ${consignment.id}`)
    onClose()
  }

  return (
    <Modal
      title="Review field-added piece"
      open
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={save}>Verify piece</Button>
        </>
      }
    >
      <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-line bg-warm-50 px-4 py-2.5">
        <span className="font-mono text-[13px] font-bold text-ink">{piece.trackingNumber}</span>
        <span className="text-[12.5px] text-ink-3">on</span>
        <span className="font-mono text-[13px] font-bold text-ink">{consignment.id}</span>
        <span className="text-[12.5px] text-ink-3 truncate">{consignment.merchantName ?? '—'}</span>
        <StatusPill label="Unverified" tone="warning" />
      </div>

      <div className="grid grid-cols-4 gap-4">
        <Field label="Length" required><Input value={l} onChange={setL} placeholder="0" /></Field>
        <Field label="Breadth" required><Input value={b} onChange={setB} placeholder="0" /></Field>
        <Field label="Height" required><Input value={h} onChange={setH} placeholder="0" /></Field>
        <Field label="Dimension UOM"><MenuSelect value={uom} options={UOMS} onChange={setUom} /></Field>
        <Field label="Weight (kg)" required><Input value={weight} onChange={setWeight} placeholder="0.00" /></Field>
        <Field label="HSN code"><Input value={hsn} onChange={setHsn} placeholder="e.g. 4421" /></Field>
      </div>

      <div className="mt-4 grid grid-cols-4 gap-4">
        {([
          ['Hazmat', hazmat, setHazmat],
          ['VIP', vip, setVip],
          ['Customs clearance', customs, setCustoms],
        ] as [string, boolean, (v: boolean) => void][]).map(([label, value, set]) => (
          <div key={label} className="flex items-center justify-between gap-2 rounded-md border border-line px-3 py-2.5">
            <span className="text-[13px] text-ink-2">{label}</span>
            <Toggle checked={value} onChange={set} />
          </div>
        ))}
      </div>

      <div className="mt-3 mb-1 text-[12px] text-ink-3">
        {missing > 0
          ? `${missing} recommended value${missing === 1 ? '' : 's'} still blank — verifying without them keeps the piece un-billable dimensionally.`
          : 'All CFT values captured. Verifying clears the amber exception once every field-added piece on this consignment is done.'}
      </div>
    </Modal>
  )
}
