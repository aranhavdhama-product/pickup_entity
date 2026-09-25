/**
 * Pickup Requests — the merchant's view of every booking, on the console's
 * `/local/pickup` grammar (spec §15; owner, 2026-09-25: "same pickup request
 * tabs, hide what is not relevant to the merchant"): `LocalPage` → the SAME
 * `LocalTabs` strip in the SAME order — Attention Required · Active · Closed ·
 * All · Eligible consignments (`?tab=` slugs from `tabs.ts`, membership via
 * `localPrTabOf` / `inLocalPrTab` with the `pickupRequestById` lookup, counts
 * off the unfiltered lists, default Attention Required) with Add on the strip's
 * right → `FilterLine` (Pickup window range · Status · funnel · Clear Filters ·
 * search · ⚙ columns · download) → Nueva `DataTable` with `selectionActions` →
 * `Pagination` / `PageSize`. Row click opens the request's own page.
 *
 *  - columns = the console's `PR_COLUMN_DEFS`, merchant subset
 *    (`pickupRequestColumns.tsx`: no Merchant / Source / Trip / Driver; Carrier = 3PL only);
 *  - bulk actions = the merchant's only — Reschedule · Cancel · Split · Merge ·
 *    Print label · Download CSV — each gated by `growOrders/prActions.ts` (role 'merchant');
 *  - Eligible consignments (the last tab; manual mode only) swaps in the shared
 *    shipments columns (`shipmentTable.tsx`) with its one-line caption and
 *    Schedule Pickup; `/grow/orders` Schedule Pickup books the same shipments.
 *
 * What it keeps over the real portal's page: PR-000123 references (the raw id on
 * the tooltip), weight / shipments summed from the linked orders, Overdue and
 * Duplicate flags, and a full detail page.
 */
import { useMasters } from '../../growOrders/masters'
import { useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import PickupRequestPage from './PickupRequestPage'
import {
  Ban, CalendarDays, CircleAlert, CircleCheck, Download, Layers, Merge, PackagePlus, Plus, Printer, Split, Truck, X, Zap,
} from 'lucide-react'
import { growOrderActions, pickupRequestById, useGrowOrders } from '../../growOrders/store'
import { prBulkState, type PrAction } from '../../growOrders/prActions'
import { blindPickupsAllowed, pickupPagesVisible, usePickupModuleConfig } from '../../config/pickupModule'
import { autoPickupSummary } from '../../growOrders/pickupSlots'
import type { GrowPickupRequest } from '../../growOrders/types'
import {
  ATTENTION_REQUIRED, CONSIGNMENTS_TO_BOOK, LOCAL_PR_TAB_SLUG, atParts, inLocalPrTab, isPartiallyPicked, localPrTabCounts, localPrTabFromSlug,
  type LocalPrTab,
} from '../../growOrders/tabs'
import { canSchedulePickup, downloadCsv } from '../LocalPFP/adapter'
import { TO_BOOK_CAPTION, TO_BOOK_EMPTY, duplicateIds, statusTags } from '../LocalPickup/prModel'
import { SplitPickupDialog } from '../LocalPickup/bookingCards'
import { datePart } from '../../growOrders/datetime'
import { usePlanning } from '../LocalPFP/planningStore'
import { toast } from '../../nueva/toast'
import {
  Button, DataTable, EmptyState, PageSize, Pagination, Panel, type SelectionAction,
} from '../../nueva/components'
import {
  ClearFilters, DateRange, FilterLine, FilterMultiSelect, FunnelFilters, IconBtn, LocalPage, LocalTabs, SearchBox,
} from '../../local/chrome'
import { BookPickupDialog, PickupDialog, ReschedulePickupDialog } from './pickupDialog'
import { CancelPickupDialog } from './PickupRequestPage'
import { usePortalMerchant } from './pickupGate'
import { merchantPrCsv, usePickupRequestColumns } from './pickupRequestColumns'
import { useShipmentColumns } from './shipmentTable'
import { shipmentRowsOf, type ShipmentRow } from './shipmentRows'
import {
  PR_LIST_STATUSES, pickupPointAddress, pickupPointName,
  prOrders, prStatusLabels, prWindow, storeName,
} from './utils'

type FilterDef = { key: string; label: string; options: string[] }

const uniq = (xs: string[]) => [...new Set(xs.filter(Boolean))].sort()
const plural = (n: number, w = 'request') => `${n} ${w}${n === 1 ? '' : 's'}`

/** The console's display order (`LocalPickup/index.tsx`): the queue that needs a hand first, All fourth, Eligible last. */
const TAB_ORDER: LocalPrTab[] = [ATTENTION_REQUIRED, 'Active', 'Closed', 'All', CONSIGNMENTS_TO_BOOK]
const ICON_OF: Record<LocalPrTab, typeof Layers> = {
  All: Layers, Active: Truck, Closed: CircleCheck, [ATTENTION_REQUIRED]: CircleAlert, [CONSIGNMENTS_TO_BOOK]: PackagePlus,
}
/** Pre-tab Grow slugs (they were filter presets) → the tab that holds them. */
const OLD_SLUG: Record<string, string> = {
  requested: 'active', scheduled: 'active', 'out-for-pickup': 'active', completed: 'closed', exceptions: 'attention',
}
/** The merchant's Attention Required flags (the console's minus Discrepancy, which is the carrier's). */
const MERCHANT_EXCEPTIONS = ['Overdue', 'Duplicate', 'Partially picked', 'Re-attempt', 'Re-attempt scheduled']

export default function PickupRequestsPage() {
  const db = useGrowOrders()
  const plan = usePlanning()
  /* store names resolve through the masters too (findStore) — subscribe so a
     pickup point named by a live location renders once the masters arrive */
  useMasters()
  const nav = useNavigate()
  const [params, setParams] = useSearchParams()
  /* `/grow/orders/pickups/:id` = the list with the request's slide-over on top (owner, 2026-09-25) */
  const { id: requestId } = useParams()

  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [status, setStatus] = useState<string[]>([])
  const [adv, setAdv] = useState<Record<string, string[]>>({})
  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  /** each dialog carries the table's own clear(), so the selection empties once it is done */
  const [rescheduling, setRescheduling] = useState<{ ids: string[]; clear: () => void } | null>(null)
  const [cancelling, setCancelling] = useState<{ ids: string[]; clear: () => void } | null>(null)
  const [scheduling, setScheduling] = useState<{ rows: ShipmentRow[]; clear: () => void } | null>(null)
  const [creating, setCreating] = useState(false)
  const [splitting, setSplitting] = useState<GrowPickupRequest | null>(null)
  const merchant = usePortalMerchant()
  const pickupCfg = usePickupModuleConfig()
  /* the page exists only in manual mode (owner, 2026-09-24) */
  const pickupOn = pickupPagesVisible(pickupCfg)
  /* owner, 2026-09-24: auto mode raises requests itself — no Add, no booking view */
  const manualPickup = pickupOn && pickupCfg.mode === 'manual'

  /* the tab lives in the URL (`?tab=` slug); Eligible consignments exists only in manual mode */
  const tabs = manualPickup ? TAB_ORDER : TAB_ORDER.filter((t) => t !== CONSIGNMENTS_TO_BOOK)
  const slug = params.get('tab')
  const wanted = localPrTabFromSlug(slug ? OLD_SLUG[slug] ?? slug : slug)
  const tab: LocalPrTab = tabs.includes(wanted) ? wanted : ATTENTION_REQUIRED
  const eligibleView = tab === CONSIGNMENTS_TO_BOOK
  /* switching tabs never carries a selection across (the table is re-keyed) nor a tab's funnel */
  const setTab = (t: LocalPrTab) => {
    setParams((p) => { const n = new URLSearchParams(p); n.set('tab', LOCAL_PR_TAB_SLUG[t]); return n }, { replace: true })
    setAdv({}); setStatus([]); setPage(1)
  }

  const reset = (fn: () => void) => { fn(); setPage(1) }

  const byId = useMemo(() => new Map(db.orders.map((o) => [o.id, o])), [db.orders])
  /* the merchant's flags = the console's own tags (the SAME derivation the Attention Required
     tab uses), minus Discrepancy — a hub-scan mismatch is the carrier's to reconcile. They
     drive the status chip and the Attention Required funnel filter. */
  const dupes = useMemo(() => duplicateIds(db.pickupRequests), [db.pickupRequests])
  const chipFlagsOf = useMemo(() => {
    const m = new Map(db.pickupRequests.map((p) => [p.id, statusTags(p, dupes, new Date(), pickupRequestById)
      .filter((t) => t.label !== 'Discrepancy')
      .map((t) => (t.label === 'Re-attempt available' ? { ...t, label: 'Re-attempt' } : t))]))
    return (p: GrowPickupRequest) => m.get(p.id) ?? []
  }, [db.pickupRequests, dupes])
  /* filter vocabulary: the flag without its request number ("Re-attempt scheduled · PR-000140" → "Re-attempt scheduled") */
  const flagsOf = useMemo(() => (p: GrowPickupRequest) => [
    ...chipFlagsOf(p).map((t) => t.label.split(' · ')[0]),
    /* the chip's own label already says Partially picked, so statusTags leaves it out */
    ...(isPartiallyPicked(p) ? ['Partially picked'] : []),
  ], [chipFlagsOf])
  const shipments = useMemo(() => shipmentRowsOf(db, plan), [db, plan])
  /* the shipments a request could still be booked for — the console's Eligible consignments rule */
  const eligible = useMemo(() => shipments.filter((r) => canSchedulePickup(r.order, db.pickupRequests)), [shipments, db.pickupRequests])
  /* a request's Tags column = the union of its shipments' tags */
  const tagsOf = useMemo(() => {
    const byOrder = new Map(shipments.map((r) => [r.orderId, r.tags]))
    return (p: GrowPickupRequest) => [...new Set(p.orderIds.flatMap((id) => byOrder.get(id) ?? []))]
  }, [shipments])

  const shipCols = useShipmentColumns('grow-eligible-columns-v2', eligible)
  const prCols = usePickupRequestColumns({ allRequests: db.pickupRequests, orders: db.orders, stores: db.stores, tagsOf, flagsOf: chipFlagsOf })
  /* tab counts off the UNFILTERED lists, like the console */
  const counts = localPrTabCounts(db.pickupRequests, eligible.length)
  const carrierOf = (p: GrowPickupRequest) => (p.carrierMode === 'CARRIER' && p.carrierName ? p.carrierName : '')

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
    { key: 'Attention Required', label: 'Attention Required', options: [...MERCHANT_EXCEPTIONS] },
    { key: 'Type', label: 'Type', options: ['LTL', 'FTL'] },
    { key: 'Carrier', label: 'Carrier', options: uniq(db.pickupRequests.map(carrierOf)) },
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
      if (!inLocalPrTab(p, tab, undefined, pickupRequestById)) return false
      if (status.length && !prStatusLabels(p).some((l) => status.includes(l))) return false
      if (point.length && !point.includes(pickupPointName(p, db.stores))) return false
      /* OVERLAP, not start-date: a window that opens before the range and closes
         inside it is exactly what the merchant is looking for */
      if (f && atParts(p.endAt)[0] < f) return false
      if (t && atParts(p.startAt)[0] > t) return false
      if (pick('Attention Required').length && !flagsOf(p).some((x) => pick('Attention Required').includes(x))) return false
      if (pick('Type').length && !pick('Type').includes(p.shipmentType === 'FTL' ? 'FTL' : 'LTL')) return false
      if (pick('Carrier').length && !pick('Carrier').includes(carrierOf(p))) return false
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
  }, [db.pickupRequests, db.stores, tab, status, point, from, to, adv, q, byId, flagsOf])

  /* Eligible consignments: the pickup address, the date range (created) and the search apply */
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

  /* the merchant's actions, gated by the ONE matrix (growOrders/prActions.ts, role
     'merchant'): enabled only when allowed for EVERY selected booking, else disabled
     with the reason (e.g. "You can cancel until Planned — contact support") */
  const prActions = (sel: GrowPickupRequest[], clear: () => void): SelectionAction[] => {
    const ctx = { cfg: merchant.config, role: 'merchant' as const, byId: pickupRequestById }
    const item = (action: PrAction, label: string, icon: React.ReactNode, run: () => void): SelectionAction => {
      const st = prBulkState(action, sel, ctx)
      return { label, icon, disabled: !st.enabled, reason: st.reason, onClick: st.enabled ? run : undefined }
    }
    const ids = sel.map((p) => p.id)
    return [
      item('reschedule', 'Reschedule', <CalendarDays size={14} />, () => setRescheduling({ ids, clear })),
      item('cancel', 'Cancel Pickup Request', <X size={14} />, () => setCancelling({ ids, clear })),
      /* one booking → choose what moves; several → one request per consignment each */
      item('split', 'Split pickup request', <Split size={14} />, sel.length === 1 ? () => { setSplitting(sel[0]); clear() } : () => {
        const r = growOrderActions.splitAllPickupRequests(ids)
        if (r.created.length) toast.success(`Split ${plural(r.split.length)} into ${r.split.length + r.created.length}.`)
        else toast.error('Nothing could be split.')
        clear()
      }),
      /* 2+ Requested / Planned LTL requests at one pickup point, before the merchant cut-off (prActions) */
      item('merge', 'Merge', <Merge size={14} />, () => {
        const r = growOrderActions.mergePickupRequests(ids)
        if (r.ok) { toast.success(`Merged ${r.merged.join(', ')} into ${r.pr.number}.`); clear() }
        else toast.error(r.reason)
      }),
      item('printLabel', 'Print Consolidated Label', <Printer size={14} />, () => { toast.info(`Print Consolidated Label — ${plural(sel.length)} (demo)`); clear() }),
      item('downloadCsv', 'Download CSV', <Download size={14} />, () => {
        downloadCsv('pickup-requests-selected.csv', merchantPrCsv(sel, db.orders, db.stores)); toast.success(`${plural(sel.length, 'row')} exported.`); clear()
      }),
    ]
  }

  const eligibleActions = (sel: ShipmentRow[], clear: () => void): SelectionAction[] => (manualPickup ? [
    { label: 'Schedule Pickup', icon: <Truck size={14} />, onClick: () => setScheduling({ rows: sel, clear }) },
  ] : [])

  /* owner, 2026-09-24: no listing page while the module is off — existing requests stay readable from their links */
  if (!pickupOn) {
    return (
      <LocalPage>
        <Panel>
          <EmptyState icon={<Ban size={40} />}
            title={pickupCfg.enabled ? 'Pickups are booked automatically for this account' : 'Pickup module is disabled for this account'}
            hint={pickupCfg.enabled
              ? `Your carrier raises the pickup request itself — ${autoPickupSummary(pickupCfg)}. There is nothing to book here.`
              : 'Pickup requests are not available. Your carrier switches the Pickup Request module on to enable booking.'} />
        </Panel>
        {/* a request stays readable from its link */}
        {requestId && <PickupRequestPage id={requestId} onClose={() => nav('/grow/orders/pickups')} />}
      </LocalPage>
    )
  }

  return (
    <LocalPage>
      {/* the console's tab strip, same order and counts; the page's Add on its right */}
      <LocalTabs
        tabs={tabs.map((t) => ({ id: t, label: t, count: counts[t], icon: ICON_OF[t] }))}
        active={tab} onChange={(id) => setTab(id as LocalPrTab)}
        right={<>
          {pickupCfg.mode === 'auto' && pickupOn
            ? <span className="inline-flex h-8 items-center gap-1.5 rounded-md border border-info-bg bg-info-bg px-2.5 text-[12px] text-ink" title="Pickup requests are raised automatically when a consignment is created — see Settings → Pickup Request.">
                <Zap size={13} className="text-brand-500" />{autoPickupSummary(pickupCfg)}
              </span>
            /* owner, 2026-09-25: "Add" is the Reserved (blind) booking — hidden when settings forbid it */
            : blindPickupsAllowed(pickupCfg) && <Button icon={<Plus size={15} />} disabled={!pickupOn} onClick={() => setCreating(true)}>Add</Button>}
        </>} />
      <FilterLine
        right={<>
          <SearchBox value={q} onChange={(v) => reset(() => setQ(v))} placeholder={eligibleView ? 'Search consignments' : 'Search pickups'} />
          {eligibleView ? shipCols.chooser : prCols.chooser}
          {!eligibleView && (
            <IconBtn title="Download filtered rows (CSV)"
              onClick={() => { downloadCsv('pickup-requests.csv', merchantPrCsv(rows, db.orders, db.stores)); toast.success(`${plural(rows.length, 'row')} exported.`) }}>
              <Download size={16} />
            </IconBtn>
          )}
        </>}>
        <DateRange start={from} end={to} onStart={(v) => reset(() => setFrom(v))} onEnd={(v) => reset(() => setTo(v))} />
        {!eligibleView && (
          <FilterMultiSelect values={status} placeholder="Status" width={170} options={[...PR_LIST_STATUSES]}
            onChange={(v) => reset(() => setStatus(v))} />
        )}
        {/* the booking view has only one funnel dimension that applies to shipments */}
        <FunnelFilters key={eligibleView ? 'eligible' : 'requests'} defs={eligibleView ? [addressDef] : advDefs} values={adv}
          onChange={(k, vals) => reset(() => setAdv((a) => ({ ...a, [k]: vals })))} />
        <ClearFilters active={filtersOn} onClick={clearAll} />
      </FilterLine>

      <div className="mt-4">
        {/* owner, 2026-09-25: the booking tab explains itself */}
        {eligibleView && <p className="mb-2 text-[13px] text-ink-3">{TO_BOOK_CAPTION}</p>}
        {total === 0 ? (
          <Panel>
            <EmptyState
              title={filtersOn ? 'Nothing matches these filters' : eligibleView ? TO_BOOK_EMPTY
                : tab === ATTENTION_REQUIRED ? 'Nothing needs attention' : `No pickup requests under ${tab}`}
              hint={filtersOn ? 'Clear the filters to see the whole list again.'
                : eligibleView || tab === ATTENTION_REQUIRED ? undefined : 'Open Eligible consignments and Schedule Pickup, or Add a pickup request.'} />
          </Panel>
        ) : (
          <>
            {eligibleView ? (
              <DataTable key="eligible" columns={shipCols.columns} rows={slice(eligibleRows)} rowKey="orderId" selectable
                selectionActions={(s, clear) => eligibleActions(s as ShipmentRow[], clear)}
                onRowClick={(r) => nav(`/grow/orders?order=${(r as ShipmentRow).orderId}`)} />
            ) : (
              <DataTable key={`prs-${tab}`} columns={prCols.columns} rows={slice(rows)} rowKey="id" selectable
                selectionActions={(s, clear) => prActions(s as GrowPickupRequest[], clear)}
                onRowClick={(r) => nav(`/grow/orders/pickups/${(r as GrowPickupRequest).id}?${params.toString()}`)} />
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
          onBooked={() => { scheduling.clear(); setScheduling(null); setTab('Active') }} />
      )}

      {creating && blindPickupsAllowed(pickupCfg) && (
        <PickupDialog stores={db.stores} onClose={() => setCreating(false)}
          onDone={(pr) => { setCreating(false); nav(`/grow/orders/pickups/${pr.id}`) }} />
      )}

      {splitting && (
        <SplitPickupDialog pr={splitting} merchantCode={merchant.code} onClose={() => setSplitting(null)}
          onDone={() => setSplitting(null)} />
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
      {requestId && <PickupRequestPage id={requestId} onClose={() => nav(`/grow/orders/pickups?${params.toString()}`)} />}
    </LocalPage>
  )
}
