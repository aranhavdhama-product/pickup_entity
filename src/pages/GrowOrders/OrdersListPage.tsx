/**
 * Consignment Order — the merchant portal's shipments list (`/grow/orders`).
 *
 * Built from the SAME components as the console's `/local/consignments`
 * (spec §15): `LocalPage` → `FilterLine` (Date range · State / Secondary State ·
 * Origin · funnel · Clear Filters · search · ⚙ columns · download) → the
 * console's six status tabs (`LocalTabs`, below the filter line via the shared
 * `.lc-page` order rule, `?tab=` in the URL, "Add ▾ | upload" on the strip's
 * right) → Nueva `DataTable` with `selectionActions` → `Pagination` /
 * `PageSize` → the console's View Consignment overlay (`?order=<id>`), merchant
 * reading (`GrowConsignmentView`).
 *
 * Tabs follow the console's rules exactly: a row carrying an error sits ONLY in
 * Data Validation Issues; Undelivered → Exception; reverse / RTO → Returns;
 * Delivered / Cancelled → Closed; the rest → Active; All = every row without an
 * error. The one Grow addition, DRAFTS (State `Draft`, Secondary State `Save for
 * later`), always belongs to Active (owner).
 *
 * Rows come from the SHARED adapter (`shipmentRows.ts` → `toConsignmentRow`),
 * so a shipment reads the same State / Secondary State / Exception here and on
 * the console. The column set is `shipmentTable.tsx`, shared with Pickup
 * Requests' Eligible view.
 */
import { useMasters } from '../../growOrders/masters'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  AlertTriangle, ChevronDown, Download, Handshake, Package, Pencil, Printer, RotateCcw,
  Route as RouteIcon, ShieldAlert, Truck, Undo2, Upload, X,
} from 'lucide-react'
import { useGrowOrders, growOrderActions } from '../../growOrders/store'
import { usePickupModuleConfig } from '../../config/pickupModule'
import { isOpenPr } from '../../growOrders/tabs'
import { datePart } from '../../growOrders/datetime'
import { planningActions, usePlanning } from '../LocalPFP/planningStore'
import { canSchedulePickup, downloadCsv } from '../LocalPFP/adapter'
import { PRIMARY_STATES, SECONDARY_STATES, matchesState, stateGroupOf } from '../LocalPFP/stateVocabulary'
import { Download as DownloadGlyph } from '../LocalPFP/icons'
import { toast } from '../../nueva/toast'
import {
  Button, DataTable, EmptyState, IconButton, PageSize, Pagination, Panel,
  type SelectionAction,
} from '../../nueva/components'
import {
  ClearFilters, DateRange, FilterLine, FilterMultiSelect, FilterSelect, FunnelFilters, IconBtn, LocalPage,
  LocalTabs, SearchBox,
} from '../../local/chrome'
import { BulkUploadDialog } from './bulkUploadDialog'
import { BookPickupDialog } from './pickupDialog'
import { CONTACT_SUPPORT, merchantMayChange, usePortalMerchant } from './pickupGate'
import { storeName } from './utils'
import { DRAFT_SECONDARY, DRAFT_STATE, shipmentCsv, shipmentRowsOf, type ShipmentRow } from './shipmentRows'
import { useShipmentColumns } from './shipmentTable'
import GrowConsignmentView from './GrowConsignmentView'

/* ------------------------------------------------------------------ tabs --- */

const hasValidationError = (r: ShipmentRow) => !r.draft && !!r.exception
const CLOSED_STATES = ['Delivered', 'Cancelled']

/** The console's six tabs (`LocalConsignments`), same rules; drafts are Active. */
const TABS: { slug: string; label: string; icon: typeof Package; test: (r: ShipmentRow) => boolean }[] = [
  { slug: 'data-validation-issues', label: 'Data Validation Issues', icon: ShieldAlert, test: hasValidationError },
  { slug: 'active', label: 'Active', icon: RouteIcon,
    test: (r) => r.draft || (!hasValidationError(r) && !CLOSED_STATES.includes(r.state)) },
  { slug: 'closed', label: 'Closed', icon: Handshake, test: (r) => !hasValidationError(r) && CLOSED_STATES.includes(r.state) },
  { slug: 'exception', label: 'Exception', icon: AlertTriangle, test: (r) => !hasValidationError(r) && r.state === 'Undelivered' },
  { slug: 'returns', label: 'Returns', icon: Undo2,
    test: (r) => !hasValidationError(r) && (r.orderTypeLabel === 'Reverse' || r.secondaryState.includes('RTO')) },
  { slug: 'all', label: 'All', icon: Package, test: (r) => !hasValidationError(r) },
]
/** Unknown / legacy slugs (`?tab=ready`, `?tab=drafts`…) land on Active. */
const tabIndexOf = (slug: string | null) => {
  const i = TABS.findIndex((t) => t.slug === slug)
  return i < 0 ? 1 : i
}

const uniq = (xs: string[]) => [...new Set(xs.filter(Boolean))].sort()
const plural = (n: number, w = 'shipment') => `${n} ${w}${n === 1 ? '' : 's'}`

/* ------------------------------------------------------- the Add split ---- */

/** Add ▾ — the console's primary, with the LTL / FTL choice in the caret's menu. */
function AddSplit({ onAdd, onAddFtl }: { onAdd: () => void; onAddFtl?: () => void }) {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    if (!open) return
    const h = (e: MouseEvent) => { if (!(e.target as HTMLElement).closest('[data-addsplit]')) setOpen(false) }
    window.addEventListener('mousedown', h)
    return () => window.removeEventListener('mousedown', h)
  }, [open])
  const item = (label: string, go: () => void) => (
    <button type="button" onClick={() => { setOpen(false); go() }}
      className="w-full px-4 py-2 text-left text-[13px] text-ink hover:bg-warm-50">{label}</button>
  )
  return (
    <div className="relative inline-flex items-stretch rounded-md bg-brand-500" data-addsplit>
      <Button icon={<Package size={15} />} onClick={onAdd}>Add</Button>
      <span className="w-px self-stretch bg-white/30" />
      <button type="button" aria-label="More add options" aria-haspopup="menu" aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-8 w-8 items-center justify-center rounded-r-md text-white hover:bg-brand-600">
        <ChevronDown size={15} />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-full z-40 mt-1.5 min-w-[196px] rounded-lg border border-line bg-surface py-1.5 shadow-ds-overlay">
          {item('Add consignment', onAdd)}
          {onAddFtl && item('Add FTL consignment', onAddFtl)}
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------- the page ---- */

export default function OrdersListPage() {
  const db = useGrowOrders()
  const plan = usePlanning()
  /* store names resolve through the masters too (findStore) — subscribe so a
     pickup point named by a live location renders once the masters arrive */
  useMasters()
  const nav = useNavigate()
  const merchant = usePortalMerchant()
  /* module off = no NEW pickup bookings; existing requests stay readable */
  const pickupCfg = usePickupModuleConfig()
  const pickupOn = pickupCfg.enabled
  /* owner, 2026-09-24: in auto mode the request is raised at creation — no manual booking here */
  const manualPickup = pickupOn && pickupCfg.mode === 'manual'
  const [params, setParams] = useSearchParams()
  const tab = tabIndexOf(params.get('tab'))
  const drawerId = params.get('order')
  const patch = (fn: (n: URLSearchParams) => void) => setParams((p) => {
    const n = new URLSearchParams(p); fn(n); return n
  }, { replace: true })
  const setDrawer = (id: string | null) => patch((n) => { if (id) n.set('order', id); else n.delete('order') })
  const setTab = (i: number) => { patch((n) => n.set('tab', TABS[i].slug)); setPage(1) }

  const [bulkOpen, setBulkOpen] = useState(false)
  /** the Schedule Pickup dialog: the ticked orders and the table's own clear() */
  const [booking, setBooking] = useState<{ rows: ShipmentRow[]; clear: () => void } | null>(null)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [stateSel, setStateSel] = useState<string[]>([])
  const [origin, setOrigin] = useState('')
  const [adv, setAdv] = useState<Record<string, string[]>>({})
  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)

  const all = useMemo(() => shipmentRowsOf(db, plan), [db, plan])
  const inTab = useMemo(() => all.filter(TABS[tab].test), [all, tab])
  const tabCounts = useMemo(() => TABS.map((t) => all.filter(t.test).length), [all])
  const { columns, chooser } = useShipmentColumns('grow-shipments-columns-v3', all)

  /* the ONE State/Secondary State list (shared with Pending for Planning and the
     console Consignment Order page) — plus Draft / Save for later, the portal's
     one addition, appended to their groups so a draft row stays filterable */
  const stateOptions = useMemo(() => [...PRIMARY_STATES, DRAFT_STATE, ...SECONDARY_STATES, DRAFT_SECONDARY], [])
  const facilities = useMemo(() => uniq(all.map((r) => r.destination)), [all])
  /* the merchant's own pickup addresses: the store list, plus any origin a row carries */
  const origins = useMemo(() => uniq([...db.stores.map((s) => s.code), ...all.map((r) => r.shipFromCode ?? '')]), [db.stores, all])
  const advDefs = useMemo(() => [
    { key: 'Facility', label: 'Facility', options: facilities },
    { key: 'Type', label: 'Type', options: uniq(all.map((r) => r.taskType)) },
    { key: 'Carrier', label: 'Carrier', options: uniq(all.map((r) => r.carrier)) },
    { key: 'Service Type', label: 'Service Type', options: uniq(all.map((r) => r.serviceType)) },
    { key: 'Exception', label: 'Exception', options: uniq(all.map((r) => r.exception)) },
    { key: 'Tag', label: 'Tag', options: uniq(all.flatMap((r) => r.tags)) },
  ], [all, facilities])

  const filtersOn = !!(q || stateSel.length || origin || from || to || Object.values(adv).some((v) => v.length))
  const clearAll = () => { setQ(''); setStateSel([]); setOrigin(''); setFrom(''); setTo(''); setAdv({}); setPage(1) }

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const f = datePart(from), t = datePart(to)
    const has = (k: string, v: string) => !adv[k]?.length || adv[k].includes(v)
    return inTab.filter((r) => {
      if (!matchesState(stateSel, r.state, r.secondaryState)) return false
      if (origin && r.shipFromCode !== origin) return false
      const day = r.order.createdAt.slice(0, 10)
      if (f && day < f) return false
      if (t && day > t) return false
      if (!has('Type', r.taskType) || !has('Carrier', r.carrier) || !has('Service Type', r.serviceType)
        || !has('Exception', r.exception) || !has('Facility', r.destination)) return false
      if (adv.Tag?.length && !adv.Tag.some((x) => r.tags.includes(x))) return false
      if (!needle) return true
      return [r.consignmentNumber, r.orderNumber, r.referenceNumber, r.shipToName, r.address, r.order.receiver.contactNumber, r.pickupRequestNumber]
        .some((v) => (v ?? '').toLowerCase().includes(needle))
    })
  }, [inTab, stateSel, origin, from, to, adv, q])

  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize))
  const safePage = Math.min(page, totalPages)
  const paged = rows.slice((safePage - 1) * pageSize, safePage * pageSize)

  /* ----------------------------------------------------------- the actions -- */

  /** The merchant's subset of the console's bulk actions, in the console's order. */
  const selectionActions = (sel: ShipmentRow[], clear: () => void): SelectionAction[] => {
    const ids = sel.map((r) => r.orderId)
    const anyDraft = sel.some((r) => r.draft)
    const anyClosed = sel.some((r) => CLOSED_STATES.includes(r.state))
    /* Schedule Pickup: FarEye's rule — Created / Ready To Ship, no open pickup (spec §14) */
    const bookable = manualPickup && sel.length > 0 && sel.every((r) => canSchedulePickup(r.order, db.pickupRequests))
    const rtoable = sel.length > 0 && !anyDraft && !anyClosed && sel.every((r) => !r.secondaryState.includes('RTO'))
    /* a shipment inside a pickup the driver already owns is ops' call, not the merchant's */
    const lockedByPickup = sel.some((r) => {
      const pr = db.pickupRequests.find((p) => p.id === r.order.pickupRequestId)
      return !!pr && isOpenPr(pr.status) && !merchantMayChange(pr, merchant.config)
    })
    const cancellable = sel.length > 0 && !anyClosed && !lockedByPickup
    const done = (msg: string) => { clear(); toast.success(msg) }
    return [
      {
        label: 'Modify Shipment Details', icon: <Pencil size={14} />, disabled: sel.length !== 1,
        /* a draft resumes the stepper; a submitted shipment opens its own page */
        onClick: sel.length === 1
          ? () => nav(sel[0].draft ? `/grow/orders/add?draft=${sel[0].orderId}` : `/grow/orders/${sel[0].orderId}`)
          : undefined,
      },
      ...(manualPickup ? [{
        label: 'Schedule Pickup', icon: <Truck size={14} />, disabled: !bookable,
        onClick: bookable ? () => setBooking({ rows: sel, clear }) : undefined,
      }] : []),
      {
        label: 'Initiate Return to Origin', icon: <RotateCcw size={14} />, disabled: !rtoable,
        onClick: rtoable ? () => { planningActions.initiateRto(ids); done(`Return to origin initiated for ${plural(ids.length)}.`) } : undefined,
      },
      {
        label: 'Print Label', icon: <Printer size={14} />, disabled: anyDraft,
        onClick: anyDraft ? undefined : () => toast.info('Demo only — label generation is a platform service, not a local one.'),
      },
      {
        label: 'Download CSV', icon: <Download size={14} />,
        onClick: () => { downloadCsv('shipments-selected.csv', shipmentCsv(sel)); done(`${plural(sel.length)} exported.`) },
      },
      {
        label: 'Cancel Shipment', icon: <X size={14} />, disabled: !cancellable,
        onClick: !cancellable
          ? (lockedByPickup ? () => toast.info(CONTACT_SUPPORT) : undefined)
          : () => {
            /* an unpaid draft cannot be "cancelled" — it would still read Draft — so it is discarded */
            const drafts = sel.filter((r) => r.draft).map((r) => r.orderId)
            const live = sel.filter((r) => !r.draft).map((r) => r.orderId)
            live.forEach((id) => growOrderActions.cancelOrder(id))
            if (live.length) planningActions.cancel(live, 'Cancelled by the merchant')
            if (drafts.length) growOrderActions.remove(drafts)
            done([live.length && `${plural(live.length)} cancelled`, drafts.length && `${plural(drafts.length, 'draft')} discarded`]
              .filter(Boolean).join(' · ') + '.')
          },
      },
    ]
  }

  const reset = (fn: () => void) => { fn(); setPage(1) }

  return (
    <LocalPage>
      <FilterLine
        right={<>
          <SearchBox value={q} onChange={(v) => reset(() => setQ(v))} placeholder="Search shipments" />
          {chooser}
          <IconBtn title="Download all (CSV)"
            onClick={() => { downloadCsv('shipments.csv', shipmentCsv(rows)); toast.success(`${plural(rows.length, 'row')} exported.`) }}>
            <DownloadGlyph size={16} />
          </IconBtn>
        </>}>
        <DateRange start={from} end={to} onStart={(v) => reset(() => setFrom(v))} onEnd={(v) => reset(() => setTo(v))} />
        <FilterMultiSelect values={stateSel} placeholder="State/Secondary State" width={200} options={stateOptions}
          groupOf={(v) => (v === DRAFT_STATE ? 'State' : stateGroupOf(v))}
          onChange={(v) => reset(() => setStateSel(v))} />
        <FilterSelect value={origin} placeholder="Origin" options={origins} width={170}
          labels={(c) => storeName(c, db.stores)} searchable={origins.length > 6}
          onChange={(v) => reset(() => setOrigin(v))} />
        <FunnelFilters defs={advDefs} values={adv} onChange={(k, vals) => reset(() => setAdv((a) => ({ ...a, [k]: vals })))} />
        <ClearFilters active={filtersOn} onClick={clearAll} />
      </FilterLine>

      <LocalTabs
        tabs={TABS.map((t, i) => ({ id: String(i), label: t.label, count: tabCounts[i], icon: t.icon }))}
        active={String(tab)} onChange={(id) => setTab(Number(id))}
        right={<>
          {/* owner, 2026-09-25: one merchant form (load type is chosen inside it) — no FTL entry */}
          <AddSplit onAdd={() => nav('/grow/orders/add')} />
          <IconButton icon={<Upload size={15} />} title="Bulk upload shipments" onClick={() => setBulkOpen(true)} />
        </>} />

      <div className="mt-4">
        {rows.length === 0 ? (
          <Panel>
            <EmptyState
              title={filtersOn ? 'No shipments match these filters' : `Nothing under ${TABS[tab].label}`}
              hint={filtersOn ? 'Clear the filters to see the whole list again.' : 'Add a consignment to get started.'} />
          </Panel>
        ) : (
          <>
            <DataTable key={tab}
              columns={columns} rows={paged} rowKey="orderId" selectable
              selectionActions={(s, clear) => selectionActions(s as ShipmentRow[], clear)}
              onRowClick={(r) => setDrawer((r as ShipmentRow).orderId)} />
            <div className="flex items-center justify-between gap-3">
              <div className="flex-1">
                <Pagination page={safePage} total={totalPages} onChange={setPage}
                  range={`${(safePage - 1) * pageSize + 1}-${Math.min(safePage * pageSize, rows.length)} of ${rows.length.toLocaleString()}`} />
              </div>
              <div className="pt-3"><PageSize value={pageSize} onChange={(n) => { setPageSize(n); setPage(1) }} /></div>
            </div>
          </>
        )}
      </div>

      {/* mounted only while open, so its groups start from the current selection */}
      {booking && (
        <BookPickupDialog orders={booking.rows.map((r) => r.order)} stores={db.stores} onClose={() => setBooking(null)}
          onBooked={() => { booking.clear(); setBooking(null) }} />
      )}
      {bulkOpen && (
        <BulkUploadDialog stores={db.stores} onClose={() => setBulkOpen(false)}
          onCreated={() => setBulkOpen(false)} />
      )}
      {/* the console's View Consignment overlay, merchant reading — shared with /grow/orders/:id */}
      {drawerId && <GrowConsignmentView orderId={drawerId} onClose={() => setDrawer(null)} />}
    </LocalPage>
  )
}
