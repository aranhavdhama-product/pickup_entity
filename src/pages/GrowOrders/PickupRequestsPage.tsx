/**
 * Pickup Requests — the merchant's view of every booking, in the SAME structure
 * as the Consignment Order page (the console's Orders-page grammar), in Grow's
 * Materio look:
 *  - NO tab strip. Old `?tab=` links still land, as a filter PRESET:
 *    active → the open statuses, closed → Completed / Cancelled / Pickup Failed,
 *    exception → every Exception flag, eligible → the Eligible shipments view;
 *  - ONE filter line: Pickup window range · Status (the platform states + the
 *    derived outcomes Partially picked / In transit to hub / Handed Over) ·
 *    funnel (Pickup Address, Exception, Type, Carrier / Driver, Source,
 *    Reserved) · Clear Filters; on the right the "Eligible (n)"
 *    toggle, "Create Pickup Request" and a Search pill;
 *  - the console's columns (`pickupRequestTable.tsx`); row click opens the
 *    request's own page;
 *  - the Eligible shipments view swaps the grid for the shared shipments grid
 *    (`shipmentTable.tsx`) with Schedule Pickup as its bulk action;
 *  - footer (under the card) = page size · pagination · Refresh.
 *
 * What it keeps over the real portal's page: PR-000123 references (the raw id on
 * the tooltip), weight / shipments summed from the linked orders, Overdue and
 * Duplicate flags, and a full detail page.
 */
import { useMasters } from '../../growOrders/masters'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { CalendarDays, PackageCheck, Printer, Search, Truck, X } from 'lucide-react'
import { useGrowOrders } from '../../growOrders/store'
import { usePickupModuleConfig } from '../../config/pickupModule'
import type { GrowPickupRequest } from '../../growOrders/types'
import { PR_FLOW, atParts, isOpenPr } from '../../growOrders/tabs'
import { canSchedulePickup } from '../LocalPFP/adapter'
import { datePart } from '../../growOrders/datetime'
import { usePlanning } from '../LocalPFP/planningStore'
import { toast } from '../../nueva/toast'
import {
  AddUploadSplit, AdvancedFilters, Card, ClearFilters, DateRangeFilter, ListFooter, MultiSelect, PageTitle,
  SearchBox, SelectionPopup, FOCUS_RING, type FilterDef, type SelectionAction,
} from './ui'
import { BookPickupDialog, PickupDialog, ReschedulePickupDialog } from './pickupDialog'
import { CancelPickupDialog } from './PickupRequestPage'
import { CONTACT_SUPPORT, collectorLine, merchantMayChange, usePortalMerchant } from './pickupGate'
import { PickupRequestTable } from './pickupRequestTable'
import { ShipmentTable } from './shipmentTable'
import { shipmentRowsOf } from './shipmentRows'
import {
  PR_EXCEPTIONS, PR_LIST_STATUSES, pickupPointAddress, pickupPointName, prDuplicateIds, prExceptionFlags,
  prOrders, prStatusLabels, prWindow, storeName, useSelectionAnchor,
} from './utils'

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
  const [range, setRange] = useState({ from: '', to: '' })
  const [status, setStatus] = useState<string[]>(preset.status)
  const [adv, setAdv] = useState<Record<string, string[]>>(preset.exception.length ? { Exception: preset.exception } : {})
  const [q, setQ] = useState('')
  const [dq, setDq] = useState('')
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(20)
  const [rescheduleIds, setRescheduleIds] = useState<string[] | null>(null)
  const [booking, setBooking] = useState(false)
  const [bookOpen, setBookOpen] = useState(false)
  const [cancelIds, setCancelIds] = useState<string[] | null>(null)
  const merchant = usePortalMerchant()
  const pickupOn = usePickupModuleConfig().enabled

  /* type-ahead with a 200ms debounce, as on the console's list pages */
  useEffect(() => { const t = setTimeout(() => { setDq(q); setPage(0) }, 200); return () => clearTimeout(t) }, [q])
  /* swapping the grid never carries a selection across */
  const swapView = (v: boolean) => { setEligibleView(v); setSel(new Set()); setPage(0) }

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

  /* the pickup POINTS actually in use — a booking collected from a typed-in
     address must be filterable by the name its own row shows */
  const points = useMemo(() => {
    const seen = new Map<string, number>()
    db.pickupRequests.forEach((p) => {
      const name = pickupPointName(p, db.stores)
      seen.set(name, (seen.get(name) ?? 0) + 1)
    })
    db.stores.forEach((s) => { if (!seen.has(s.name)) seen.set(s.name, 0) })
    return [...seen.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [db.pickupRequests, db.stores])
  const statusCounts = useMemo(() => {
    const c: Record<string, number> = {}
    db.pickupRequests.forEach((p) => prStatusLabels(p).forEach((l) => { c[l] = (c[l] ?? 0) + 1 }))
    return c
  }, [db.pickupRequests])
  const addressDef = useMemo<FilterDef>(() => ({ key: 'Pickup Address', label: 'Pickup Address', options: points.map(([n]) => n) }), [points])
  const advDefs = useMemo<FilterDef[]>(() => [
    addressDef,
    { key: 'Exception', label: 'Exception', options: [...PR_EXCEPTIONS] },
    { key: 'Type', label: 'Type', options: ['LTL', 'FTL'] },
    { key: 'Carrier / Driver', label: 'Carrier / Driver', options: uniq(db.pickupRequests.map((p) => collectorLine(p) ?? '')) },
    { key: 'Source', label: 'Source', options: uniq(db.pickupRequests.map((p) => p.source)) },
    { key: 'Reserved', label: 'Reserved', options: ['Reserved', 'Not reserved'] },
  ], [db.pickupRequests, addressDef])

  const filtersOn = !!(q || status.length || range.from || range.to
    || Object.values(adv).some((v) => v.length))
  const clearAll = () => { setQ(''); setStatus([]); setRange({ from: '', to: '' }); setAdv({}); setPage(0) }

  /* Pickup Address rides in the funnel (the line must fit 1440px with the nav open) */
  const point = useMemo(() => adv['Pickup Address']?.filter(Boolean) ?? [], [adv])

  const rows = useMemo(() => {
    const s = dq.trim().toLowerCase()
    const from = datePart(range.from), to = datePart(range.to)
    const pick = (k: string) => adv[k]?.filter(Boolean) ?? []
    return db.pickupRequests.filter((p) => {
      if (status.length && !prStatusLabels(p).some((l) => status.includes(l))) return false
      if (point.length && !point.includes(pickupPointName(p, db.stores))) return false
      /* OVERLAP, not start-date: a window that opens before the range and closes
         inside it is exactly what the merchant is looking for */
      if (from && atParts(p.endAt)[0] < from) return false
      if (to && atParts(p.startAt)[0] > to) return false
      if (pick('Exception').length && !flagsOf(p).some((f) => pick('Exception').includes(f))) return false
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
  }, [db.pickupRequests, db.stores, status, point, range, adv, dq, byId, flagsOf])

  /* Eligible shipments: the pickup address, the date range (created) and the search apply */
  const eligibleRows = useMemo(() => {
    if (!eligibleView) return []
    const s = dq.trim().toLowerCase()
    const from = datePart(range.from), to = datePart(range.to)
    return eligible.filter((r) => {
      if (point.length && !point.includes(storeName(r.order.storeCode, db.stores))) return false
      const day = r.order.createdAt.slice(0, 10)
      if (from && day < from) return false
      if (to && day > to) return false
      if (!s) return true
      return [r.consignmentNumber, r.referenceNumber, r.shipToName, r.address, storeName(r.order.storeCode, db.stores)]
        .some((v) => (v ?? '').toLowerCase().includes(s))
    })
  }, [eligibleView, eligible, point, range, dq, db.stores])
  const total = eligibleView ? eligibleRows.length : rows.length

  /* cancelling the last rows of a filtered page would otherwise leave the grid
     empty under a footer reading '21-20 of 20' — clamped during render */
  const lastPage = Math.max(0, Math.ceil(total / pageSize) - 1)
  if (page > lastPage) setPage(lastPage)
  const visible = rows.slice(page * pageSize, (page + 1) * pageSize)
  const visibleShipments = eligibleRows.slice(page * pageSize, (page + 1) * pageSize)
  /* the bulk panel lines up with the FIRST selected row, not the card's corner */
  const cardRef = useRef<HTMLDivElement>(null)
  const rowRefs = useRef<Record<string, HTMLElement | null>>({})
  const visibleIds = eligibleView ? visibleShipments.map((r) => r.orderId) : visible.map((r) => r.id)
  const anchorTop = useSelectionAnchor(cardRef, rowRefs, visibleIds.find((id) => sel.has(id)))
  const toggle = (id: string, v: boolean) => setSel((p) => { const n = new Set(p); if (v) n.add(id); else n.delete(id); return n })
  const toggleAll = (v: boolean) => setSel((p) => { const n = new Set(p); visibleIds.forEach((id) => (v ? n.add(id) : n.delete(id))); return n })
  const rowRef = (id: string, el: HTMLTableRowElement | null) => { rowRefs.current[id] = el }
  const selectedOrders = useMemo(() => eligible.filter((r) => sel.has(r.orderId)).map((r) => r.order), [eligible, sel])

  const printable = useMemo(() => [...sel].filter((id) => db.pickupRequests.find((p) => p.id === id)?.status !== 'Cancelled'),
    [sel, db.pickupRequests])
  /* rescheduling and cancelling only mean something while a booking is OPEN and
     not yet past the merchant's `merchantCancelUntil` state (M1/M2) */
  const openSel = useMemo(() => [...sel].filter((id) => {
    const p = db.pickupRequests.find((x) => x.id === id)
    return !!p && isOpenPr(p.status) && merchantMayChange(p, merchant.config)
  }), [sel, db.pickupRequests, merchant.config])
  const lockedSel = useMemo(() => [...sel].some((id) => {
    const p = db.pickupRequests.find((x) => x.id === id)
    return !!p && isOpenPr(p.status) && !merchantMayChange(p, merchant.config)
  }), [sel, db.pickupRequests, merchant.config])

  const actions: SelectionAction[] = eligibleView ? [
    { label: `Schedule Pickup (${selectedOrders.length})`, icon: <Truck size={15} />, primary: true,
      disabled: selectedOrders.length === 0 || !pickupOn,
      tooltip: pickupOn ? 'Only Created / Ready To Ship shipments without an open pickup can be scheduled' : 'Pickup module is off for this account',
      onClick: () => setBookOpen(true) },
  ] : [
    /* a cancelled booking has no label to print — the same rule the detail page applies */
    { label: `Print Consolidated Label (${printable.length})`, icon: <Printer size={15} />, primary: true,
      disabled: printable.length === 0, tooltip: 'A cancelled pickup request has no label to print',
      onClick: () => toast.info(`Print Consolidated Label — ${plural(printable.length)} (demo)`) },
    { label: 'Reschedule', icon: <CalendarDays size={15} />, disabled: openSel.length === 0,
      tooltip: lockedSel ? CONTACT_SUPPORT : 'Only an open pickup request can be rescheduled',
      onClick: () => setRescheduleIds(openSel) },
    { label: `Cancel Pickup Request${openSel.length && openSel.length !== sel.size ? ` (${openSel.length})` : ''}`,
      icon: <X size={15} />, danger: true, disabled: openSel.length === 0,
      tooltip: lockedSel ? CONTACT_SUPPORT : 'Those pickup requests are already closed',
      onClick: () => setCancelIds(openSel) },
  ]

  return (
    <div>
      <PageTitle title="Pickup Requests" subtitle="Track and manage every pickup request" />

      {/* ONE filter line, on the canvas — the Consignment Order page's grammar */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <DateRangeFilter width="w-[216px]" label={eligibleView ? 'Created' : 'Pickup'} from={range.from} to={range.to}
          onChange={(v) => { setRange(v); setPage(0) }} />
        {!eligibleView && (
          <MultiSelect value={status} onChange={(v) => { setStatus(v); setPage(0) }}
            placeholder="Status" className="w-[150px]"
            options={PR_LIST_STATUSES.map((st) => ({ value: st, count: statusCounts[st] ?? 0 }))} />
        )}
        {/* the eligible view has only one funnel dimension that applies to shipments */}
        <AdvancedFilters compact key={eligibleView ? 'eligible' : 'requests'} defs={eligibleView ? [addressDef] : advDefs} values={adv}
          onChange={(k, v) => { setAdv((a) => ({ ...a, [k]: v })); setPage(0) }}
          onClearAll={() => { setAdv({}); setPage(0) }} />
        <ClearFilters active={filtersOn} onClick={clearAll} />
        <div className="ml-auto flex items-center gap-2">
          {/* the eligible-for-pickup entry point: swaps the grid, independent of the funnel */}
          <button type="button" aria-pressed={eligibleView} title="Shipments eligible for pickup" onClick={() => swapView(!eligibleView)}
            className={`inline-flex h-[38px] shrink-0 items-center gap-1.5 rounded-[6px] border px-3 text-[14px] font-medium transition-colors ${FOCUS_RING}
              ${eligibleView ? 'border-grow-accent-2 bg-grow-accent-2/[0.08] text-grow-accent-2' : 'border-grow-outline bg-white text-grow-ink-2 hover:border-grow-ink hover:text-grow-ink'}`}>
            <PackageCheck size={17} />Eligible ({eligible.length})
          </button>
          <AddUploadSplit label="Create Pickup Request" icon={<Truck size={17} />} onAdd={() => setBooking(true)}
            disabled={!pickupOn} disabledTitle="Pickup module is off for this account" />
          <SearchBox pill value={q} onChange={setQ} icon={<Search />} width="w-[170px]" placeholder="Search" />
        </div>
      </div>

      <Card padded={false} className="relative" cardRef={cardRef}>
        <SelectionPopup count={sel.size} anchorTop={anchorTop} onClear={() => setSel(new Set())} actions={actions} />
        {eligibleView ? (
          <ShipmentTable rows={visibleShipments} dataRows={eligible} storageKey="grow-eligible-columns-v1" selected={sel} onToggle={toggle} onToggleAll={toggleAll}
            onRowClick={(r) => nav(`/grow/orders?order=${r.orderId}`)} rowRef={rowRef}
            empty={eligible.length === 0
              ? 'No shipments are eligible for pickup — paid shipments appear here until a pickup is scheduled.'
              : 'No shipments match these filters.'} />
        ) : (
          <PickupRequestTable requests={visible} allRequests={db.pickupRequests} orders={db.orders} stores={db.stores}
            exceptionsOf={flagsOf} tagsOf={tagsOf}
            selected={sel} onToggle={toggle} onToggleAll={toggleAll}
            onRowClick={(p) => nav(`/grow/orders/pickups/${p.id}`)} rowRef={rowRef}
            emptyText={db.pickupRequests.length === 0
              ? 'No pickup requests yet — open Eligible shipments and Schedule Pickup.'
              : 'No pickup requests match these filters.'} />
        )}
      </Card>
      <ListFooter page={page} pageSize={pageSize} total={total} onPage={setPage}
        onPageSize={(n) => { setPageSize(n); setPage(0) }} onRefresh={() => toast.info('Refreshed')} />

      {/* mounted only while open, so its groups start from the current selection */}
      {bookOpen && (
        <BookPickupDialog orders={selectedOrders} stores={db.stores} onClose={() => setBookOpen(false)}
          onBooked={() => { setBookOpen(false); swapView(false) }} />
      )}

      {booking && (
        <PickupDialog stores={db.stores} onClose={() => setBooking(false)}
          onDone={(pr) => { setBooking(false); nav(`/grow/orders/pickups/${pr.id}`) }} />
      )}

      {cancelIds && cancelIds.length > 0 && (
        <CancelPickupDialog requests={db.pickupRequests.filter((p) => cancelIds.includes(p.id))}
          onClose={() => setCancelIds(null)}
          onDone={() => { setCancelIds(null); setSel(new Set()) }} />
      )}

      {rescheduleIds && rescheduleIds.length > 0 && (
        <ReschedulePickupDialog requests={db.pickupRequests.filter((p) => rescheduleIds.includes(p.id))}
          onClose={() => setRescheduleIds(null)}
          onDone={() => { setRescheduleIds(null); setSel(new Set()) }} />
      )}
    </div>
  )
}
