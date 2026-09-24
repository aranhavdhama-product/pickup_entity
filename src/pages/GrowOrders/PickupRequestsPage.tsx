/**
 * Pickup Requests — the merchant's view of every booking, built from the SAME
 * components as the console's `/local/pickup` (spec §15): `LocalPage` →
 * `FilterLine` (Pickup window range · Status · funnel · Clear Filters · search ·
 * Eligible toggle · ⚙ columns · Add) → Nueva `DataTable` with
 * `selectionActions` → `Pagination` / `PageSize`. Row click opens the
 * request's own page.
 *
 *  - NO tab strip (owner). Old `?tab=` links still land, as a filter PRESET:
 *    active → the open statuses, closed → Completed / Cancelled / Pickup Failed,
 *    exception → every Exception flag, eligible → the Eligible shipments view;
 *  - columns = the console's (`pickupRequestTable.tsx`, formatting from
 *    `LocalPickup/prModel.ts`);
 *  - the Eligible toggle swaps the grid for the shared shipments columns
 *    (`shipmentTable.tsx`) with Schedule Pickup as its bulk action.
 *
 * What it keeps over the real portal's page: PR-000123 references (the raw id on
 * the tooltip), weight / shipments summed from the linked orders, Overdue and
 * Duplicate flags, and a full detail page.
 */
import { useMasters } from '../../growOrders/masters'
import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { CalendarDays, PackageCheck, Plus, Printer, Truck, X, Zap } from 'lucide-react'
import { useGrowOrders } from '../../growOrders/store'
import { usePickupModuleConfig } from '../../config/pickupModule'
import { autoPickupSummary } from '../../growOrders/pickupSlots'
import type { GrowPickupRequest } from '../../growOrders/types'
import { PR_FLOW, atParts, isOpenPr } from '../../growOrders/tabs'
import { canSchedulePickup } from '../LocalPFP/adapter'
import { datePart } from '../../growOrders/datetime'
import { usePlanning } from '../LocalPFP/planningStore'
import { toast } from '../../nueva/toast'
import {
  Button, DataTable, EmptyState, PageSize, Pagination, Panel, type SelectionAction,
} from '../../nueva/components'
import {
  ClearFilters, DateRange, FilterLine, FilterMultiSelect, FunnelFilters, LocalPage, SearchBox,
} from '../../local/chrome'
import { BookPickupDialog, PickupDialog, ReschedulePickupDialog } from './pickupDialog'
import { CancelPickupDialog } from './PickupRequestPage'
import { CONTACT_SUPPORT, collectorLine, merchantMayChange, usePortalMerchant } from './pickupGate'
import { usePickupRequestColumns } from './pickupRequestColumns'
import { useShipmentColumns } from './shipmentTable'
import { shipmentRowsOf, type ShipmentRow } from './shipmentRows'
import {
  PR_EXCEPTIONS, PR_LIST_STATUSES, pickupPointAddress, pickupPointName, prDuplicateIds, prExceptionFlags,
  prOrders, prStatusLabels, prWindow, storeName,
} from './utils'

type FilterDef = { key: string; label: string; options: string[] }

const uniq = (xs: string[]) => [...new Set(xs.filter(Boolean))].sort()
const plural = (n: number, w = 'request') => `${n} ${w}${n === 1 ? '' : 's'}`

/** The open part of the flow, plus the collected-but-not-yet-at-the-hub outcome. */
const OPEN_STATUSES = [...PR_FLOW.filter((s) => s !== 'Completed'), 'In transit to hub']

/** What an old `?tab=` slug means now: a filter preset. Unknown slug = no preset. */
function presetOf(slug: string | null): { status: string[]; exception: string[]; eligible: boolean } {
  const none = { status: [], exception: [], eligible: false }
  switch (slug) {
    case 'active': case 'requested': case 'scheduled': case 'out-for-pickup':
      return { ...none, status: OPEN_STATUSES }
    case 'closed': case 'completed':
      return { ...none, status: ['Completed', 'Cancelled', 'Pickup Failed'] }
    case 'exception': case 'exceptions':
      return { ...none, exception: [...PR_EXCEPTIONS] }
    case 'eligible':
      return { ...none, eligible: true }
    default:
      return none
  }
}

export default function PickupRequestsPage() {
  const db = useGrowOrders()
  const plan = usePlanning()
  /* store names resolve through the masters too (findStore) — subscribe so a
     pickup point named by a live location renders once the masters arrive */
  useMasters()
  const nav = useNavigate()
  const [params] = useSearchParams()
  /* read ONCE, on mount — after that the filters are the page's own state */
  const [preset] = useState(() => presetOf(params.get('tab')))

  const [eligibleView, setEligibleView] = useState(preset.eligible)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [status, setStatus] = useState<string[]>(preset.status)
  const [adv, setAdv] = useState<Record<string, string[]>>(preset.exception.length ? { Exception: preset.exception } : {})
  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  /** each dialog carries the table's own clear(), so the selection empties once it is done */
  const [rescheduling, setRescheduling] = useState<{ ids: string[]; clear: () => void } | null>(null)
  const [cancelling, setCancelling] = useState<{ ids: string[]; clear: () => void } | null>(null)
  const [scheduling, setScheduling] = useState<{ rows: ShipmentRow[]; clear: () => void } | null>(null)
  const [creating, setCreating] = useState(false)
  const merchant = usePortalMerchant()
  const pickupCfg = usePickupModuleConfig()
  const pickupOn = pickupCfg.enabled
  /* owner, 2026-09-24: auto mode raises requests itself — no Add, no Eligible booking */
  const manualPickup = pickupOn && pickupCfg.mode === 'manual'

  /* swapping the grid never carries a selection across (the table is re-keyed) */
  const swapView = (v: boolean) => { setEligibleView(v); setPage(1) }
  const reset = (fn: () => void) => { fn(); setPage(1) }

  const byId = useMemo(() => new Map(db.orders.map((o) => [o.id, o])), [db.orders])
  const dupes = useMemo(() => prDuplicateIds(db.pickupRequests), [db.pickupRequests])
  const flagsOf = useMemo(() => {
    const m = new Map(db.pickupRequests.map((p) => [p.id, prExceptionFlags(p, dupes)]))
    return (p: GrowPickupRequest) => m.get(p.id) ?? []
  }, [db.pickupRequests, dupes])
  /* the shipments a request could still be booked for — the console's Eligible rule */
  const shipments = useMemo(() => shipmentRowsOf(db, plan), [db, plan])
  const eligible = useMemo(() => shipments.filter((r) => canSchedulePickup(r.order, db.pickupRequests)), [shipments, db.pickupRequests])
  /* a request's Tags column = the union of its shipments' tags */
  const tagsOf = useMemo(() => {
    const byOrder = new Map(shipments.map((r) => [r.orderId, r.tags]))
    return (p: GrowPickupRequest) => [...new Set(p.orderIds.flatMap((id) => byOrder.get(id) ?? []))]
  }, [shipments])

  const prCols = usePickupRequestColumns({ allRequests: db.pickupRequests, orders: db.orders, stores: db.stores, exceptionsOf: flagsOf, tagsOf })
  const shipCols = useShipmentColumns('grow-eligible-columns-v2', eligible)

  /* the pickup POINTS actually in use — a booking collected from a typed-in
     address must be filterable by the name its own row shows */
  const points = useMemo(() => {
    const seen = new Set<string>()
    db.pickupRequests.forEach((p) => seen.add(pickupPointName(p, db.stores)))
    db.stores.forEach((st) => seen.add(st.name))
    return [...seen].filter(Boolean).sort((a, b) => a.localeCompare(b))
  }, [db.pickupRequests, db.stores])
  const addressDef = useMemo<FilterDef>(() => ({ key: 'Pickup Address', label: 'Pickup Address', options: points }), [points])
  const advDefs = useMemo<FilterDef[]>(() => [
    addressDef,
    { key: 'Exception', label: 'Exception', options: [...PR_EXCEPTIONS] },
    { key: 'Type', label: 'Type', options: ['LTL', 'FTL'] },
    { key: 'Carrier / Driver', label: 'Carrier / Driver', options: uniq(db.pickupRequests.map((p) => collectorLine(p) ?? '')) },
    { key: 'Source', label: 'Source', options: uniq(db.pickupRequests.map((p) => p.source)) },
    { key: 'Reserved', label: 'Reserved', options: ['Reserved', 'Not reserved'] },
  ], [db.pickupRequests, addressDef])

  const filtersOn = !!(q || status.length || from || to || Object.values(adv).some((v) => v.length))
  const clearAll = () => { setQ(''); setStatus([]); setFrom(''); setTo(''); setAdv({}); setPage(1) }

  const point = useMemo(() => adv['Pickup Address']?.filter(Boolean) ?? [], [adv])

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase()
    const f = datePart(from), t = datePart(to)
    const pick = (k: string) => adv[k]?.filter(Boolean) ?? []
    return db.pickupRequests.filter((p) => {
      if (status.length && !prStatusLabels(p).some((l) => status.includes(l))) return false
      if (point.length && !point.includes(pickupPointName(p, db.stores))) return false
      /* OVERLAP, not start-date: a window that opens before the range and closes
         inside it is exactly what the merchant is looking for */
      if (f && atParts(p.endAt)[0] < f) return false
      if (t && atParts(p.startAt)[0] > t) return false
      if (pick('Exception').length && !flagsOf(p).some((x) => pick('Exception').includes(x))) return false
      if (pick('Type').length && !pick('Type').includes(p.shipmentType === 'FTL' ? 'FTL' : 'LTL')) return false
      if (pick('Carrier / Driver').length && !pick('Carrier / Driver').includes(collectorLine(p) ?? '')) return false
      if (pick('Source').length && !pick('Source').includes(p.source)) return false
      const res = pick('Reserved')
      if (res.length === 1 && (res[0] === 'Reserved') !== p.blind) return false
      if (!s) return true
      const orderNos = prOrders(p, byId).map((o) => o.orderNumber).join(' ')
      return [p.number, p.id, pickupPointName(p, db.stores), pickupPointAddress(p, db.stores),
        p.slot, p.date, prWindow(p), orderNos]
        .some((v) => v.toLowerCase().includes(s))
      /* newest window first; `id` breaks the tie so a multi-group booking made in
         one millisecond keeps a stable order between renders */
    }).sort((a, b) => b.startAt.localeCompare(a.startAt)
      || b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id))
  }, [db.pickupRequests, db.stores, status, point, from, to, adv, q, byId, flagsOf])

  /* Eligible shipments: the pickup address, the date range (created) and the search apply */
  const eligibleRows = useMemo(() => {
    if (!eligibleView) return []
    const s = q.trim().toLowerCase()
    const f = datePart(from), t = datePart(to)
    return eligible.filter((r) => {
      if (point.length && !point.includes(storeName(r.order.storeCode, db.stores))) return false
      const day = r.order.createdAt.slice(0, 10)
      if (f && day < f) return false
      if (t && day > t) return false
      if (!s) return true
      return [r.consignmentNumber, r.orderNumber, r.referenceNumber, r.shipToName, r.address, storeName(r.order.storeCode, db.stores)]
        .some((v) => (v ?? '').toLowerCase().includes(s))
    })
  }, [eligibleView, eligible, point, from, to, q, db.stores])

  const total = eligibleView ? eligibleRows.length : rows.length
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const safePage = Math.min(page, totalPages)
  const slice = <T,>(xs: T[]) => xs.slice((safePage - 1) * pageSize, safePage * pageSize)

  /* ----------------------------------------------------------- the actions -- */

  const prActions = (sel: GrowPickupRequest[], clear: () => void): SelectionAction[] => {
    /* a cancelled booking has no label to print — the same rule the detail page applies */
    const printable = sel.filter((p) => p.status !== 'Cancelled')
    /* rescheduling and cancelling only mean something while a booking is OPEN and
       not yet past the merchant's `merchantCancelUntil` state (M1/M2) */
    const open = sel.filter((p) => isOpenPr(p.status) && merchantMayChange(p, merchant.config)).map((p) => p.id)
    const locked = sel.some((p) => isOpenPr(p.status) && !merchantMayChange(p, merchant.config))
    const lockedHint = locked && open.length === 0 ? () => toast.info(CONTACT_SUPPORT) : undefined
    return [
      { label: `Print Consolidated Label (${printable.length})`, icon: <Printer size={14} />, disabled: printable.length === 0,
        onClick: printable.length ? () => { toast.info(`Print Consolidated Label — ${plural(printable.length)} (demo)`); clear() } : undefined },
      { label: 'Reschedule', icon: <CalendarDays size={14} />, disabled: open.length === 0,
        onClick: open.length ? () => setRescheduling({ ids: open, clear }) : lockedHint },
      { label: `Cancel Pickup Request${open.length && open.length !== sel.length ? ` (${open.length})` : ''}`,
        icon: <X size={14} />, disabled: open.length === 0,
        onClick: open.length ? () => setCancelling({ ids: open, clear }) : lockedHint },
    ]
  }

  const eligibleActions = (sel: ShipmentRow[], clear: () => void): SelectionAction[] => (manualPickup ? [
    { label: 'Schedule Pickup', icon: <Truck size={14} />, onClick: () => setScheduling({ rows: sel, clear }) },
  ] : [])

  return (
    <LocalPage>
      <FilterLine
        right={<>
          <SearchBox value={q} onChange={(v) => reset(() => setQ(v))} placeholder={eligibleView ? 'Search shipments' : 'Search pickups'} />
          {/* the eligible-for-pickup entry point: swaps the grid, independent of the funnel */}
          {manualPickup && (
            <Button variant={eligibleView ? 'outline' : 'ghost'} icon={<PackageCheck size={15} />} onClick={() => swapView(!eligibleView)}>
              Eligible ({eligible.length})
            </Button>
          )}
          {eligibleView ? shipCols.chooser : prCols.chooser}
          {pickupCfg.mode === 'auto' && pickupOn
            ? <span className="inline-flex h-8 items-center gap-1.5 rounded-md border border-info-bg bg-info-bg px-2.5 text-[12.5px] text-ink" title="Pickup requests are raised automatically when a consignment is created — see Settings → Pickup Request.">
                <Zap size={13} className="text-brand-500" />{autoPickupSummary(pickupCfg)}
              </span>
            : <Button icon={<Plus size={15} />} disabled={!pickupOn} onClick={() => setCreating(true)}>Add</Button>}
        </>}>
        <DateRange start={from} end={to} onStart={(v) => reset(() => setFrom(v))} onEnd={(v) => reset(() => setTo(v))} />
        {!eligibleView && (
          <FilterMultiSelect values={status} placeholder="Status" width={170} options={[...PR_LIST_STATUSES]}
            onChange={(v) => reset(() => setStatus(v))} />
        )}
        {/* the eligible view has only one funnel dimension that applies to shipments */}
        <FunnelFilters key={eligibleView ? 'eligible' : 'requests'} defs={eligibleView ? [addressDef] : advDefs} values={adv}
          onChange={(k, vals) => reset(() => setAdv((a) => ({ ...a, [k]: vals })))} />
        <ClearFilters active={filtersOn} onClick={clearAll} />
      </FilterLine>

      <div>
        {total === 0 ? (
          <Panel>
            <EmptyState
              title={filtersOn ? 'Nothing matches these filters'
                : eligibleView ? 'No shipments are eligible for pickup' : 'No pickup requests yet'}
              hint={filtersOn ? 'Clear the filters to see the whole list again.'
                : eligibleView ? 'Paid shipments appear here until a pickup is scheduled.' : 'Open Eligible and Schedule Pickup, or Add a pickup request.'} />
          </Panel>
        ) : (
          <>
            {eligibleView ? (
              <DataTable key="eligible" columns={shipCols.columns} rows={slice(eligibleRows)} rowKey="orderId" selectable
                selectionActions={(s, clear) => eligibleActions(s as ShipmentRow[], clear)}
                onRowClick={(r) => nav(`/grow/orders?order=${(r as ShipmentRow).orderId}`)} />
            ) : (
              <DataTable key="prs" columns={prCols.columns} rows={slice(rows)} rowKey="id" selectable
                selectionActions={(s, clear) => prActions(s as GrowPickupRequest[], clear)}
                onRowClick={(r) => nav(`/grow/orders/pickups/${(r as GrowPickupRequest).id}`)} />
            )}
            <div className="flex items-center justify-between gap-3">
              <div className="flex-1">
                <Pagination page={safePage} total={totalPages} onChange={setPage}
                  range={`${(safePage - 1) * pageSize + 1}-${Math.min(safePage * pageSize, total)} of ${total.toLocaleString()}`} />
              </div>
              <div className="pt-3"><PageSize value={pageSize} onChange={(n) => { setPageSize(n); setPage(1) }} /></div>
            </div>
          </>
        )}
      </div>

      {/* mounted only while open, so its groups start from the current selection */}
      {scheduling && (
        <BookPickupDialog orders={scheduling.rows.map((r) => r.order)} stores={db.stores} onClose={() => setScheduling(null)}
          onBooked={() => { scheduling.clear(); setScheduling(null); swapView(false) }} />
      )}

      {creating && (
        <PickupDialog stores={db.stores} onClose={() => setCreating(false)}
          onDone={(pr) => { setCreating(false); nav(`/grow/orders/pickups/${pr.id}`) }} />
      )}

      {cancelling && (
        <CancelPickupDialog requests={db.pickupRequests.filter((p) => cancelling.ids.includes(p.id))}
          onClose={() => setCancelling(null)}
          onDone={() => { cancelling.clear(); setCancelling(null) }} />
      )}

      {rescheduling && (
        <ReschedulePickupDialog requests={db.pickupRequests.filter((p) => rescheduling.ids.includes(p.id))}
          onClose={() => setRescheduling(null)}
          onDone={() => { rescheduling.clear(); setRescheduling(null) }} />
      )}
    </LocalPage>
  )
}
