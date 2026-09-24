/**
 * Pickup Requests — LOCAL console (`/local/pickup`), rebuilt on the growOrders
 * store (spec 2026-09-23 §3.2). Same grammar as `/local/consignments`: tabs with
 * counts, one filter row (date range · Status · Merchant · Advanced · Clear ·
 * search · icons), a selectable DataTable whose selection surfaces the bulk
 * actions, row click = the request's own page.
 *
 * `Eligible for Pickup` is not a request list: it shows CONSIGNMENTS that could
 * be booked (Ready for Pickup) with Add to new / existing pickup.
 */
import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  Ban, CalendarClock, CircleAlert, CircleCheck, Download, Merge, PackagePlus, PackageSearch, Plus,
  Route as RouteIcon, Settings, Truck, Layers, XCircle, Zap
} from 'lucide-react'
import {
  Button, DataTable, EmptyState, PageHeader,
  PageSize, Pagination, Panel, StatusPill, type Column, type SelectionAction,
} from '../../nueva/components'
import {
  ClearFilters, DateRange, FilterLine, FilterSelect, FunnelFilters, IconBtn, LocalPage, LocalTabs, SearchBox,
} from '../../local/chrome'
import { toast } from '../../nueva/toast'
import { growOrderActions, pickupRequestById, useGrowOrders } from '../../growOrders/store'
import type { GrowOrder, GrowPickupRequest } from '../../growOrders/types'
import {
  LOCAL_PR_TAB_SLUG, inLocalPrTab, localPrTabCounts, localPrTabFromSlug, isPickupEligible, type LocalPrTab,
} from '../../growOrders/tabs'
import { usePickupModuleConfig } from '../../config/pickupModule'
import { autoPickupSummary } from '../../growOrders/pickupSlots'
import { csvOf, downloadCsv, toConsignmentRow, type LocalConsignmentRow, executionOverlay } from '../LocalPFP/adapter'
import { usePlanning } from '../LocalPFP/planningStore'
import { useConsignmentColumns } from '../LocalConsignments/columns'
import {
  AssignCarrierDialog, BookConsignmentsDialog, CreatePickupDialog, ReasonDialog, RescheduleDialog,
} from './dialogs'
import { AddToRouteDialog } from '../LocalControlTower/addToRouteDialog'
import ViewPickup from '../LocalPFP/ViewPickup'
import {
  can, consignmentsLabel, dropLabel, duplicateIds, fmtWindow, matchesStatus, merchantOfPr,
  pickupPointName, pointKey, prCsv, reasonText, referenceChips, statusLabel, statusTags, STATUS_FILTER_OPTIONS,
  weightLabel, windowTag,
} from './prModel'

/**
 * Display order of the tabs. `Eligible for Pickup` lists CONSIGNMENTS, not
 * requests, so it sits at the END of the strip — after the request buckets —
 * rather than between them. Slugs and counts still come from tabs.ts.
 */
const TAB_ORDER: LocalPrTab[] = ['All', 'Active', 'Closed', 'Exception', 'Eligible for Pickup']
const ICON_OF: Record<LocalPrTab, typeof Layers> = {
  All: Layers, Active: Truck, Closed: CircleCheck, Exception: CircleAlert, 'Eligible for Pickup': PackagePlus,
}
const TAB_ICONS = TAB_ORDER.map((t) => ICON_OF[t])
const uniq = (xs: (string | null | undefined)[]) => [...new Set(xs.filter((x): x is string => !!x))].sort()
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`

type Dialog =
  | { kind: 'create' }
  | { kind: 'book'; orders: GrowOrder[]; prefer: 'new' | 'existing' }
  | { kind: 'route' | 'carrier' | 'reschedule' | 'cancel' | 'fail'; prs: GrowPickupRequest[] }
  | null

/** The module-disabled state keeps the header, so the page still says where you are. */
function Disabled() {
  return (
    <div className="p-6">
      <PageHeader title="Pickup Requests" />
      <Panel>
        <EmptyState icon={<Ban size={40} />} title="Pickup module is disabled for this account"
          hint="Existing pickup requests stay readable from their links. Turn the Pickup Request module on to book and manage pickups." />
        <div className="-mt-12 pb-10 text-center">
          <Link to="/local/settings/pickup" className="text-[13px] font-bold text-brand-500 hover:text-brand-600">
            Open Pickup settings →
          </Link>
        </div>
      </Panel>
    </div>
  )
}

export default function LocalPickup() {
  const cfg = usePickupModuleConfig()
  if (!cfg.enabled) return <Disabled />
  return <PickupRequestsList />
}

function PickupRequestsList() {
  const nav = useNavigate()
  const db = useGrowOrders()
  const cfg = usePickupModuleConfig()
  const plan = usePlanning()
  const [params, setParams] = useSearchParams()
  /* `/local/pickup/view/:prId` = the list with the request's drawer over it —
     the same drawer Pending For Planning's Pickups tab opens */
  const { prId: drawerPrId } = useParams()
  const tab: LocalPrTab = localPrTabFromSlug(params.get('tab'))
  const eligibleTab = tab === 'Eligible for Pickup'

  const [q, setQ] = useState('')
  const [status, setStatus] = useState('')
  const [merchant, setMerchant] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [more, setMore] = useState<Record<string, string[]>>({})
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [dialog, setDialog] = useState<Dialog>(null)

  /* read the clock on every render — Overdue and the tab buckets move with it */
  const now = new Date()
  const byId = useMemo(() => new Map(db.orders.map((o) => [o.id, o])), [db.orders])
  const eligibleOrders = useMemo(() => db.orders.filter(isPickupEligible), [db.orders])
  /* the Consignment Order row shape — the same adapter and columns as /local/consignments */
  const eligibleRows = useMemo<LocalConsignmentRow[]>(() => eligibleOrders.map((o) => toConsignmentRow(o, db, {
    secondaryState: plan.secondaryState[o.id],
    schedule: plan.scheduleOverrides[o.id],
    exception: plan.exceptions[o.id],
    ...executionOverlay(o, plan.trips),
  })).sort((a, b) => (a.order.createdAt < b.order.createdAt ? 1 : -1)), [eligibleOrders, db, plan])
  const eligibleGrid = useConsignmentColumns('local-eligible-columns-v1')
  const storeNameOf = useMemo(() => {
    const names = new Map(db.stores.map((x) => [x.code, x.name]))
    return (code: string | undefined) => (code && names.get(code)) || code || ''
  }, [db.stores])
  const counts = localPrTabCounts(db.pickupRequests, eligibleOrders.length, now)
  const dup = useMemo(() => duplicateIds(db.pickupRequests), [db.pickupRequests])
  /* the Exception column's flags — the same derivation the Exception tab uses */
  const exceptionsOf = (p: GrowPickupRequest) => statusTags(p, dup, now, pickupRequestById)
  const allPrs = useMemo(() => [...db.pickupRequests].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)), [db.pickupRequests])

  /* ---------------------------------------------------------- filter defs -- */
  const merchants = useMemo(() => uniq([...db.pickupRequests.map((p) => merchantOfPr(p, db.stores)), ...eligibleRows.map((r) => r.merchant)]),
    [db.pickupRequests, db.stores, eligibleRows])
  const moreDefs = useMemo(() => eligibleTab
    ? [
      { key: 'Pickup address', label: 'Pickup address', options: uniq(eligibleRows.map((r) => storeNameOf(r.shipFromCode))) },
      { key: 'Type', label: 'Type', options: ['LTL', 'FTL'] },
    ]
    : [
      { key: 'Pickup address', label: 'Pickup address', options: uniq(allPrs.map((p) => pickupPointName(p, db.stores))) },
      { key: 'Carrier', label: 'Carrier', options: uniq(allPrs.map((p) => p.carrierName)) },
      { key: 'Driver', label: 'Driver', options: uniq(allPrs.map((p) => p.driverName)) },
      { key: 'Exception', label: 'Exception', options: ['None', 'Overdue', 'Discrepancy', 'Duplicate', 'Partially picked', 'Re-attempt available', 'Re-attempt scheduled'] },
      { key: 'Type', label: 'Type', options: ['LTL', 'FTL'] },
      { key: 'Source', label: 'Source', options: uniq(allPrs.map((p) => p.source)) },
      { key: 'Reserved', label: 'Reserved', options: ['Reserved', 'Not reserved'] },
    ], [eligibleTab, eligibleRows, allPrs, db.stores, storeNameOf])

  const filtersOn = !!(q || status || merchant || from || to || Object.values(more).some((v) => v.length))
  const clearAll = () => { setQ(''); setStatus(''); setMerchant(''); setFrom(''); setTo(''); setMore({}); setPage(1) }
  const setTab = (i: number) => {
    const next = new URLSearchParams(params); next.set('tab', LOCAL_PR_TAB_SLUG[TAB_ORDER[i]])
    setParams(next, { replace: true }); setMore({}); setStatus(''); setPage(1)
  }
  const has = (k: string, v: string) => !more[k]?.length || more[k].includes(v)

  const prRows = (() => {
    if (eligibleTab) return []
    const needle = q.trim().toLowerCase()
    return allPrs.filter((p) => {
      if (!inLocalPrTab(p, tab, now, pickupRequestById)) return false
      if (status && !matchesStatus(p, status)) return false
      if (merchant && merchantOfPr(p, db.stores) !== merchant) return false
      if (from && p.date < from) return false
      if (to && p.date > to) return false
      if (!has('Pickup address', pickupPointName(p, db.stores))) return false
      if (!has('Carrier', p.carrierName ?? '')) return false
      if (!has('Driver', p.driverName ?? '')) return false
      if (!has('Type', p.shipmentType === 'FTL' ? 'FTL' : 'LTL')) return false
      if (!has('Source', p.source)) return false
      if (more.Exception?.length) {
        const tags = exceptionsOf(p).map((t) => (t.label.startsWith('Re-attempt scheduled') ? 'Re-attempt scheduled' : t.label))
        if (!more.Exception.some((x) => (x === 'None' ? tags.length === 0 : tags.includes(x)))) return false
      }
      if (!has('Reserved', p.blind ? 'Reserved' : 'Not reserved')) return false
      if (needle) {
        const nums = p.orderIds.map((id) => byId.get(id)?.orderNumber ?? '').join(' ')
        const hay = `${p.number} ${pickupPointName(p, db.stores)} ${merchantOfPr(p, db.stores)} ${p.driverName ?? ''} ${p.carrierName ?? ''} ${p.tripId ?? ''} ${nums}`.toLowerCase()
        if (!hay.includes(needle)) return false
      }
      return true
    })
  })()

  const eRows = (() => {
    if (!eligibleTab) return []
    const needle = q.trim().toLowerCase()
    return eligibleRows.filter((r) => {
      if (merchant && r.merchant !== merchant) return false
      const day = r.order.createdAt.slice(0, 10)
      if (from && day < from) return false
      if (to && day > to) return false
      if (!has('Pickup address', storeNameOf(r.shipFromCode))) return false
      if (!has('Type', r.order.shipmentType === 'FTL' ? 'FTL' : 'LTL')) return false
      if (needle && !`${r.consignmentNumber} ${r.referenceNumber} ${r.shipToName} ${r.merchant} ${r.origin} ${r.destination}`.toLowerCase().includes(needle)) return false
      return true
    })
  })()

  const total = eligibleTab ? eRows.length : prRows.length
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const safePage = Math.min(page, totalPages)
  const slice = <T,>(xs: T[]) => xs.slice((safePage - 1) * pageSize, safePage * pageSize)

  const exportAll = () => {
    if (eligibleTab) downloadCsv('eligible-for-pickup.csv', csvOf(eRows))
    else downloadCsv('pickup-requests.csv', prCsv(prRows, db))
    toast.success(`${plural(total, 'row')} exported.`)
  }

  /* -------------------------------------------------------------- columns -- */

  const prColumns: Column[] = [
    { key: 'ref', label: 'Reference', width: 130, render: (r) => {
      const p = r as GrowPickupRequest
      return (
        <span className="block">
          <span className="block font-mono text-[12px] font-bold text-brand-500">{p.number}</span>
          <span className="mt-0.5 flex flex-wrap gap-1">{referenceChips(p).map((c) => <StatusPill key={c} label={c} tone={c === 'Reserved' ? 'info' : 'neutral'} />)}</span>
        </span>
      )
    } },
    /* Status = where the request is in its flow; Exception = what is wrong
       with it. Two questions, two columns — never mixed in one cell. */
    { key: 'status', label: 'Status', width: 120, render: (r) => {
      const s = statusLabel(r as GrowPickupRequest)
      return <StatusPill label={s.label} tone={s.tone} />
    } },
    { key: 'exception', label: 'Exception', width: 140, render: (r) => {
      const p = r as GrowPickupRequest
      const tags = exceptionsOf(p)
      const reason = reasonText(p)
      if (!tags.length && !reason) return <span className="text-ink-3">—</span>
      return (
        <span className="block min-w-0">
          {tags.length > 0 && (
            <span className="flex flex-wrap gap-1">{tags.map((t) => (
              /* 'Re-attempt scheduled · PR-x' reads as 'Re-attempt · PR-x' in the cell; full text on hover */
              <span key={t.label} title={t.label} className="max-w-full truncate">
                <StatusPill label={t.label.replace('Re-attempt scheduled ·', 'Re-attempt ·')} tone={t.tone} />
              </span>
            ))}</span>
          )}
          {reason && <span className="mt-0.5 block truncate text-[12px] text-ink-3" title={reason}>{reason}</span>}
        </span>
      )
    } },
    { key: 'window', label: 'Pickup window', width: 115, render: (r) => {
      const p = r as GrowPickupRequest
      const tag = windowTag(p)
      return <span className="block text-[12.5px]">{fmtWindow(p)}{tag && <span className="block text-[11.5px] text-ink-3">{tag}</span>}</span>
    } },
    { key: 'address', label: 'Pickup address → hub', render: (r) => {
      const p = r as GrowPickupRequest
      return (
        <span className="block min-w-0">
          <span className="block truncate text-ink">{pickupPointName(p, db.stores)}</span>
          <span className="block truncate text-[12px] text-ink-3">→ {dropLabel(p, db.stores)}</span>
        </span>
      )
    } },
    { key: 'merchant', label: 'Merchant', width: 90, render: (r) => <span className="block truncate">{merchantOfPr(r as GrowPickupRequest, db.stores)}</span> },
    { key: 'count', label: 'Shipments', width: 100, align: 'right', render: (r) => consignmentsLabel(r as GrowPickupRequest) },
    { key: 'weight', label: 'Weight', width: 80, align: 'right', render: (r) => weightLabel(r as GrowPickupRequest, byId) },
    { key: 'who', label: 'Driver / Carrier', width: 110, render: (r) => {
      const p = r as GrowPickupRequest
      if (!p.driverName && !p.carrierName) return <span className="text-ink-3">—</span>
      return (
        <span className="block min-w-0">
          {p.driverName && <span className="block truncate">{p.driverName}</span>}
          {p.carrierName && <span className="block truncate text-[12px] text-ink-3">{p.carrierName}{p.carrierMode === 'CARRIER' ? ' · 3PL' : ''}</span>}
        </span>
      )
    } },
    { key: 'trip', label: 'Trip', width: 85, render: (r) => {
      const p = r as GrowPickupRequest
      return p.tripId
        ? <Link to={`/local/control-tower/trips/${p.tripId}`} onClick={(e) => e.stopPropagation()} className="font-mono text-[12px] font-bold text-brand-500 hover:text-brand-600">{p.tripId}</Link>
        : <span className="text-ink-3">—</span>
    } },
  ]


  /* -------------------------------------------------------------- actions -- */

  const prActions = (sel: GrowPickupRequest[], clear: () => void): SelectionAction[] => {
    const open = (kind: 'route' | 'carrier' | 'reschedule' | 'cancel' | 'fail') => () => { setDialog({ kind, prs: sel }); clear() }
    const samePoint = sel.length >= 2 && new Set(sel.map(pointKey)).size === 1 && sel.every(can.merge)
    return [
      { label: 'Add to route', icon: <RouteIcon size={14} />, disabled: !sel.some(can.addToRoute), onClick: open('route') },
      { label: 'Assign carrier', icon: <Truck size={14} />, disabled: !sel.some(can.assignCarrier), onClick: open('carrier') },
      { label: 'Reschedule', icon: <CalendarClock size={14} />, disabled: !sel.some(can.reschedule), onClick: open('reschedule') },
      { label: 'Cancel', icon: <XCircle size={14} />, disabled: !sel.some(can.cancel), onClick: open('cancel') },
      { label: 'Mark Pickup Failed', icon: <CircleAlert size={14} />, disabled: !sel.some(can.markFailed), onClick: open('fail') },
      { label: 'Merge', icon: <Merge size={14} />, disabled: !samePoint, onClick: () => {
        const r = growOrderActions.mergePickupRequests(sel.map((p) => p.id))
        if (r.ok) { toast.success(`Merged ${r.merged.join(', ')} into ${r.pr.number}.`); clear() }
        else toast.error(r.reason)
      } },
      { label: 'Download CSV', icon: <Download size={14} />, onClick: () => {
        downloadCsv('pickup-requests-selected.csv', prCsv(sel, db)); toast.success(`${plural(sel.length, 'row')} exported.`); clear()
      } },
    ]
  }

  const eligibleActions = (sel: LocalConsignmentRow[], clear: () => void): SelectionAction[] => [
    { label: 'Add to new pickup', icon: <Plus size={14} />, onClick: () => { setDialog({ kind: 'book', orders: sel.map((r) => r.order), prefer: 'new' }); clear() } },
    { label: 'Add to existing pickup', icon: <PackageSearch size={14} />, onClick: () => { setDialog({ kind: 'book', orders: sel.map((r) => r.order), prefer: 'existing' }); clear() } },
    { label: 'Download CSV', icon: <Download size={14} />, onClick: () => { downloadCsv('eligible-selected.csv', csvOf(sel)); clear() } },
  ]

  const close = () => setDialog(null)

  return (
    <LocalPage>
      {/* no page header: the app bar already names the page. The owner-
          finalised local chrome (spec §11): tabs on the canvas, the page's
          actions on the strip's right, then ONE filter line */}
      <LocalTabs
        tabs={TAB_ORDER.map((t, i) => ({ id: t, label: t, count: counts[t], icon: TAB_ICONS[i] }))}
        active={tab} onChange={(id) => setTab(TAB_ORDER.indexOf(id as LocalPrTab))}
        right={<>
          <IconBtn title="Pickup settings" onClick={() => nav('/local/settings/pickup')}><Settings size={16} /></IconBtn>
          {cfg.mode === 'auto'
            ? <span className="inline-flex h-8 items-center gap-1.5 rounded-md border border-info-bg bg-info-bg px-2.5 text-[12.5px] text-ink" title="Pickup requests are raised automatically when a consignment is created — Settings → Pickup Request.">
                <Zap size={13} className="text-brand-500" />{autoPickupSummary(cfg)}
              </span>
            : <Button icon={<Plus size={15} />} onClick={() => setDialog({ kind: 'create' })}>Create Pickup</Button>}
        </>} />
      <FilterLine
        right={<>
          <SearchBox value={q} onChange={(v) => { setQ(v); setPage(1) }} placeholder={eligibleTab ? 'Search shipments' : 'Search pickups'} />
          {eligibleTab && eligibleGrid.chooser}
          <IconBtn title="Download filtered rows (CSV)" onClick={exportAll}><Download size={16} /></IconBtn>
        </>}>
        <DateRange start={from} end={to} onStart={(v) => { setFrom(v); setPage(1) }} onEnd={(v) => { setTo(v); setPage(1) }} />
        {!eligibleTab && (
          <FilterSelect value={status} placeholder="Status" options={STATUS_FILTER_OPTIONS} width={170} onChange={(v) => { setStatus(v); setPage(1) }} />
        )}
        <FilterSelect value={merchant} placeholder="Merchant" options={merchants} width={170} onChange={(v) => { setMerchant(v); setPage(1) }} />
        <FunnelFilters defs={moreDefs} values={more} onChange={(k, vals) => { setMore((m) => ({ ...m, [k]: vals })); setPage(1) }} />
        <ClearFilters active={filtersOn} onClick={clearAll} />
      </FilterLine>

      <div className="mt-4">
        {total === 0 ? (
          <Panel>
            <EmptyState
              title={filtersOn ? 'Nothing matches these filters' : eligibleTab ? 'No shipments waiting for a pickup' : `No pickup requests under ${tab}`}
              hint={filtersOn ? 'Clear the filters to see the whole list again.' : eligibleTab ? 'Paid shipments with no pickup appear here.' : 'Create a pickup, or book shipments from Eligible for Pickup.'} />
          </Panel>
        ) : (
          <>
            {eligibleTab ? (
              <DataTable key="eligible" columns={eligibleGrid.columns} rows={slice(eRows)} rowKey="orderId" selectable
                selectionActions={(s, clear) => eligibleActions(s as LocalConsignmentRow[], clear)}
                onRowClick={(r) => nav(`/local/consignments/${(r as LocalConsignmentRow).orderId}`)} />
            ) : (
              <DataTable key={`prs-${tab}`} columns={prColumns} rows={slice(prRows)} rowKey="id" selectable
                selectionActions={(s, clear) => prActions(s as GrowPickupRequest[], clear)}
                onRowClick={(r) => nav(`/local/pickup/view/${(r as GrowPickupRequest).id}?${params.toString()}`)} />
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

      {drawerPrId && <ViewPickup basePath="/local/pickup" />}

      {dialog?.kind === 'create' && (
        <CreatePickupDialog onClose={close}
          onDone={(prs) => {
            close()
            toast.success(prs.length === 1
              ? `Pickup Request ${prs[0].number} created`
              : `Pickup Requests ${prs.map((p) => p.number).join(', ')} created`)
            if (prs.length === 1) nav(`/local/pickup/${prs[0].id}`)
          }} />
      )}
      {dialog?.kind === 'book' && <BookConsignmentsDialog orders={dialog.orders} prefer={dialog.prefer} onClose={close} onDone={close} />}
      {dialog?.kind === 'route' && <AddToRouteDialog prIds={dialog.prs.map((p) => p.id)} onClose={close} onDone={close} />}
      {dialog?.kind === 'carrier' && <AssignCarrierDialog prs={dialog.prs} onClose={close} onDone={close} />}
      {dialog?.kind === 'reschedule' && <RescheduleDialog prs={dialog.prs} onClose={close} onDone={close} />}
      {(dialog?.kind === 'cancel' || dialog?.kind === 'fail') && (
        <ReasonDialog kind={dialog.kind} prs={dialog.prs} onClose={close} onDone={close} />
      )}
    </LocalPage>
  )
}
