/**
 * Consignment Order — LOCAL MODE.
 *
 * The console's `/order-management/consignment-order` rebuilt with NO staging
 * session: the tab set, column set, toolbar and bulk actions are the ones
 * `src/pages/ConsignmentOrder/index.tsx` carries (itself built from staging),
 * and every row is a Grow merchant order translated by the SHARED
 * `LocalPFP/adapter.ts` — the same `toConsignmentRow` the Pending For Planning
 * page uses, so the two lists can never disagree about what a consignment is.
 *
 * NOT PIXEL-MEASURED. Pending For Planning is a measured replica of its staging
 * screen; this page is not — it is built from the console page's inventory in
 * this app's own Nueva primitives. When staging is reachable again the
 * measurement pass can tighten it, and until then nothing here should be read
 * as "this is what staging looks like".
 *
 * SCOPE vs Pending For Planning: that page shows only what is waiting to be
 * planned. This one shows EVERY consignment the merchant has (drafts excluded —
 * a draft is not yet a consignment), which is why it carries the status tabs.
 */
import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  AlertTriangle, BadgeCheck, CalendarClock, Download, Handshake, Package, PackageCheck, Pencil,
  PackageSearch, Printer, RotateCcw, Route as RouteIcon, ShieldAlert, Truck, Undo2, X,
} from 'lucide-react'
import {
  AddUpload, DataTable, EmptyState,
  PageSize, Pagination, Panel,
  type SelectionAction,
} from '../../nueva/components'
import {
  ClearFilters, DateRange, FilterLine, FilterMultiSelect, FilterSelect, FunnelFilters, IconBtn, LocalPage, LocalTabs, SearchBox,
} from '../../local/chrome'
import { Download as DownloadGlyph } from '../LocalPFP/icons'
import { STATE_OPTIONS, matchesState, stateGroupOf } from '../LocalPFP/stateVocabulary'
import { toast } from '../../nueva/toast'
import { useGrowOrders, growOrderActions } from '../../growOrders/store'
import { isOpenPr, isPickupEligible } from '../../growOrders/tabs'
import type { GrowOrder } from '../../growOrders/types'
import {
  csvOf, downloadCsv, executionOverlay, toConsignmentRow, type LocalConsignmentRow,
} from '../LocalPFP/adapter'
import { planningActions, usePlanning } from '../LocalPFP/planningStore'
import { merchantsOf } from '../LocalPFP/merchants'
import { usePickupModuleConfig } from '../../config/pickupModule'
import type { ConsignmentDateField } from '../../config/consignmentModuleUniverse'
import { consignmentModuleSaved, dateRangeWindow, readConsignmentModuleConfig } from '../../config/consignmentModule'
import { SchedulePickupDialog, type ScheduleResult } from './SchedulePickupDialog'
import { BookConsignmentsDialog } from '../LocalPickup/dialogs'
import { useConsignmentColumns } from './columns'
import { BulkUploadDialog } from '../GrowOrders/bulkUploadDialog'
import ConsignmentView from './ConsignmentView'

/* ------------------------------------------------------------------ tabs --- */

/**
 * The console's six status tabs. `Data Validation Issues` is exclusive: a row
 * carrying an error appears ONLY there, never in Active/Closed/All — staging
 * treats an unvalidated row as not yet a real consignment.
 */
const hasValidationError = (r: LocalConsignmentRow) => !!r.exception

/* `slug` = the `?tab=` value, the same six Grow's Shipments page uses (`OrdersListPage`), so a
   link lands on the same tab on both portals; no / unknown slug → Active */
const TABS: { slug: string; label: string; test: (r: LocalConsignmentRow) => boolean }[] = [
  { slug: 'data-validation-issues', label: 'Data Validation Issues', test: hasValidationError },
  { slug: 'active', label: 'Active', test: (r) => !hasValidationError(r) && r.state !== 'Delivered' && r.state !== 'Cancelled' },
  { slug: 'closed', label: 'Closed', test: (r) => !hasValidationError(r) && (r.state === 'Delivered' || r.state === 'Cancelled') },
  { slug: 'exception', label: 'Exception', test: (r) => !hasValidationError(r) && String(r.state) === 'Undelivered' },
  { slug: 'returns', label: 'Returns', test: (r) => !hasValidationError(r) && (r.orderTypeLabel === 'Reverse' || r.secondaryState.includes('RTO')) },
  { slug: 'all', label: 'All', test: (r) => !hasValidationError(r) },
]
const TAB_SLUG_ALIAS: Record<string, string> = { error: 'data-validation-issues', undelivered: 'exception' }
const tabIndexOf = (slug: string | null): number => {
  const s = slug ? TAB_SLUG_ALIAS[slug] ?? slug : ''
  const i = TABS.findIndex((t) => t.slug === s)
  return i === -1 ? 1 : i
}
const TAB_ICONS = [ShieldAlert, RouteIcon, Handshake, AlertTriangle, Undo2, Package]


/** The secondary state of a consignment inside an open pickup request. */
const PICKUP_SCHEDULED = 'Pickup Scheduled'

const uniq = (xs: string[]) => [...new Set(xs.filter(Boolean))].sort()

/* ------------------------------------------------------------- the page ---- */

/**
 * The day the date filter reads, per Settings → Date Filter → Default Date Field.
 * Delivery/Pickup Date reads the row's ship-by day (its pickup/delivery day locally).
 * TODO(fareye-consignment-module-config-v1): no local `last_updated_at` — it falls back to Created Date.
 */
function dayOf(r: LocalConsignmentRow, field: ConsignmentDateField | undefined): string {
  switch (field) {
    case 'ship_by_date':
    case 'ship_to_delivery_date': return r.shipByDate.slice(0, 10)
    case 'dispatch_date': return r.dispatchDate.slice(0, 10)
    default: return r.order.createdAt.slice(0, 10)
  }
}

export default function LocalConsignments() {
  const nav = useNavigate()
  const { id: drawerId } = useParams()
  const db = useGrowOrders()
  const plan = usePlanning()
  /* module off = the page as it was: no Schedule action, no Pickup Address filter */
  const pickupCfg = usePickupModuleConfig()
  const pickupOn = pickupCfg.enabled
  /* owner, 2026-09-24: auto mode books at creation — ops schedule nothing by hand */
  const manualPickup = pickupOn && pickupCfg.mode === 'manual'

  const [params, setParams] = useSearchParams()
  const tab = tabIndexOf(params.get('tab'))
  const setTab = (i: number) => setParams((prev) => { const n = new URLSearchParams(prev); n.set('tab', TABS[i].slug); return n }, { replace: true })
  const [q, setQ] = useState('')
  const [stateSel, setStateSel] = useState<string[]>([])
  const [merchant, setMerchant] = useState('')
  /** a store code of the selected merchant ('' = every address) */
  const [pickupAddress, setPickupAddress] = useState('')
  /* Settings → Consignment Order → Date Filter, once saved there (fareye-consignment-module-config-v1) */
  const [dateCfg] = useState(() => (consignmentModuleSaved() ? readConsignmentModuleConfig() : null))
  const [from, setFrom] = useState(() => (dateCfg ? dateRangeWindow(dateCfg.selectedDateRange).from : ''))
  const [to, setTo] = useState(() => (dateCfg ? dateRangeWindow(dateCfg.selectedDateRange).to : ''))
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  /** the Schedule dialog: the ticked ids, and the table's own clear() */
  const [scheduling, setScheduling] = useState<{ ids: string[]; clear: () => void } | null>(null)
  /** Add to existing pickup (owner, 2026-09-25 — was the Pickup page's Eligible tab action) */
  const [joining, setJoining] = useState<{ orders: GrowOrder[]; clear: () => void } | null>(null)
  /** the last booking, as links — the toast is text-only */
  const [booked, setBooked] = useState<ScheduleResult[] | null>(null)
  const [uploading, setUploading] = useState(false)
  const [more, setMore] = useState<Record<string, string[]>>({})

  const openPrIds = useMemo(() => new Set(db.pickupRequests.filter((p) => isOpenPr(p.status)).map((p) => p.id)), [db.pickupRequests])
  /** EVERY consignment, not just the planning queue — a draft is not one yet. */
  const all = useMemo<LocalConsignmentRow[]>(() => db.orders
    .filter((o) => !o.isDraft)
    .map((o) => toConsignmentRow(o, db, {
      /* a console secondary state wins; otherwise an open first-mile booking
         reads "Pickup Scheduled" — distinct from routing's "Scheduled" */
      secondaryState: plan.secondaryState[o.id] ?? (openPrIds.has(o.pickupRequestId ?? '') ? PICKUP_SCHEDULED : undefined),
      schedule: plan.scheduleOverrides[o.id],
      exception: plan.exceptions[o.id],
      ...executionOverlay(o, plan.trips),
    }))
    .sort((a, b) => (a.order.createdAt < b.order.createdAt ? 1 : -1)), [db, plan, openPrIds])

  const inTab = useMemo(() => all.filter(TABS[tab].test), [all, tab])
  const tabCounts = useMemo(() => TABS.map((t) => all.filter(t.test).length), [all])
  const merchants = useMemo(() => uniq(all.map((r) => r.merchant)), [all])
  /* the selected merchant's stores: its locations in the store list, plus any
     origin its rows carry (a store with no business name is named by its code) */
  const merchantStores = useMemo(() => {
    if (!merchant) return [] as string[]
    const own = merchantsOf(db.stores).find((m) => m.name === merchant)?.stores.map((s) => s.code) ?? []
    return uniq([...own, ...all.filter((r) => r.merchant === merchant).map((r) => r.shipFromCode ?? '')])
  }, [merchant, db.stores, all])
  const storeLabel = (code: string) => {
    const s = db.stores.find((x) => x.code === code)
    return s?.name || code
  }
  /* a hidden filter never applies — the module can be switched off live */
  const addressFilter = pickupOn ? pickupAddress : ''
  const moreDefs = useMemo(() => [
    { key: 'Type', label: 'Type', options: uniq(all.map((r) => r.taskType)) },
    { key: 'Carrier', label: 'Carrier', options: uniq(all.map((r) => r.carrier)) },
    { key: 'Service Type', label: 'Service Type', options: uniq(all.map((r) => r.serviceType)) },
    { key: 'Destination', label: 'Destination', options: uniq(all.map((r) => r.destination)) },
    { key: 'Active Leg', label: 'Active Leg', options: uniq(all.map((r) => r.activeLeg)) },
    { key: 'Tag', label: 'Tag', options: uniq(all.flatMap((r) => r.tag.split(', '))) },
  ], [all])

  const filtersOn = !!(q || stateSel.length || merchant || addressFilter || from || to
    || Object.values(more).some((v) => v.length))

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return inTab.filter((r) => {
      if (!matchesState(stateSel, String(r.state), r.secondaryState)) return false
      if (merchant && r.merchant !== merchant) return false
      if (addressFilter && r.shipFromCode !== addressFilter) return false
      const day = dayOf(r, dateCfg?.dateAppliedOn)
      if (from && day < from) return false
      if (to && day > to) return false
      if (more.Type?.length && !more.Type.includes(r.taskType)) return false
      if (more.Carrier?.length && !more.Carrier.includes(r.carrier)) return false
      if (more['Service Type']?.length && !more['Service Type'].includes(r.serviceType)) return false
      if (more.Destination?.length && !more.Destination.includes(r.destination)) return false
      if (more['Active Leg']?.length && !more['Active Leg'].includes(r.activeLeg)) return false
      if (more.Tag?.length && !more.Tag.some((t) => r.tag.includes(t))) return false
      if (needle) {
        const hay = `${r.consignmentNumber} ${r.referenceNumber} ${r.shipToName} ${r.merchant} ${r.address}`.toLowerCase()
        if (!hay.includes(needle)) return false
      }
      return true
    })
  }, [inTab, q, stateSel, merchant, addressFilter, from, to, more, dateCfg])

  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize))
  const safePage = Math.min(page, totalPages)
  const paged = rows.slice((safePage - 1) * pageSize, safePage * pageSize)
  const clearAll = () => { setQ(''); setStateSel([]); setMerchant(''); setPickupAddress(''); setFrom(''); setTo(''); setMore({}); setPage(1) }

  /* ---------------------------------------------------------- the columns -- */

  /* staging's default 18 + the ⚙ chooser; persists per browser */
  const { columns, chooser } = useConsignmentColumns('local-consignments-columns-v2')

  /* ----------------------------------------------------------- the actions - */

  /**
   * The console's eight. Four are real local mutations; the rest are DEMO
   * TOASTS and say so, because the local store has no carrier master, no label
   * service and no print pipeline — a button that silently did nothing would be
   * worse than one that admits it.
   */
  const selectionActions = (sel: LocalConsignmentRow[], clear: () => void): SelectionAction[] => {
    const ids = sel.map((r) => r.orderId)
    const closable = sel.every((r) => ['Created', 'At Facility', 'Ready To Ship'].includes(String(r.state)))
    const done = (msg: string) => { clear(); toast.success(msg) }
    const markable = sel.length > 0 && sel.every((r) => String(r.state) === 'Created'
      && !r.order.isDraft && r.order.paymentStatus === 'Paid' && !r.order.error)
    return [
      {
        label: 'Modify Shipment Details',
        icon: <Pencil size={14} />,
        disabled: sel.length !== 1,
        onClick: sel.length === 1
          /* reopens the order in the merchant's own Add Order flow */
          ? () => nav(`/local/consignments/add?draft=${sel[0].orderId}`)
          : undefined,
      },
      /* TWO different schedules, two different statuses:
         - Schedule Pickup  = book the FIRST-MILE collection (a pickup request);
           the row reads Secondary State "Pickup Scheduled". Hidden with the
           Pickup Request module.
         - Schedule Routing = the console's own delivery schedule, as before;
           the row reads Secondary State "Scheduled". */
      /* FarEye `consignment::marked-ready-for-ship`: Created → Ready To Ship. With an
         auto-pickup trigger on that event, the store raises the request here too. */
      { label: 'Mark Ready To Ship', icon: <BadgeCheck size={14} />,
        disabled: !markable,
        onClick: markable ? () => {
          const marked = growOrderActions.markReadyToShip(ids)
          for (const id of marked) planningActions.addNote(id, 'Marked Ready To Ship')
          done(`${marked.length} consignment${marked.length === 1 ? '' : 's'} marked Ready To Ship.`)
        } : undefined },
      ...(manualPickup ? [{ label: 'Schedule Pickup', icon: <Truck size={14} />, onClick: () => setScheduling({ ids, clear }) }] : []),
      /* only shipments still waiting for a pickup can join an open request */
      ...(manualPickup ? (() => {
        const joinable = sel.map((r) => r.order).filter(isPickupEligible)
        return [{ label: 'Add to existing pickup request', icon: <PackageSearch size={14} />, disabled: joinable.length === 0,
          onClick: joinable.length ? () => setJoining({ orders: joinable, clear }) : undefined }]
      })() : []),
      { label: 'Schedule Routing', icon: <CalendarClock size={14} />, onClick: () => {
        const startAt = `${new Date().toISOString().slice(0, 10)}T09:00`
        planningActions.schedule(ids, { startAt, endAt: `${startAt.slice(0, 10)}T18:00`, reason: 'Scheduled from Consignment Order' })
        done(`${ids.length} scheduled for routing.`)
      } },
      { label: 'Initiate Return to Origin', icon: <RotateCcw size={14} />, onClick: () => {
        planningActions.initiateRto(ids)
        done(`Return to origin initiated for ${ids.length}.`)
      } },
      { label: 'Modify Carrier', icon: <Truck size={14} />, onClick: () => {
        toast.info('Demo only — the local store has no carrier master to reassign against.')
      } },
      { label: 'Print Label', icon: <Printer size={14} />, onClick: () => {
        toast.info('Demo only — label generation is a platform service, not a local one.')
      } },
      { label: 'Download CSV', icon: <Download size={14} />, onClick: () => {
        downloadCsv('consignments-selected.csv', csvOf(sel))
        done(`${sel.length} row${sel.length === 1 ? '' : 's'} exported.`)
      } },
      {
        label: 'Close Shipment',
        icon: <PackageCheck size={14} />,
        disabled: !closable,
        onClick: closable ? () => {
          ids.forEach((id) => growOrderActions.update(id, { status: 'Delivered' }))
          planningActions.close(ids, { outcome: 'Completed', atc: '', atd: '', failureReason: '', attachments: 0 })
          done(`${ids.length} closed.`)
        } : undefined,
      },
      { label: 'Cancel Shipment', icon: <X size={14} />, onClick: () => {
        ids.forEach((id) => growOrderActions.update(id, { status: 'Cancelled' }))
        planningActions.cancel(ids, 'Cancelled from Consignment Order')
        done(`${ids.length} cancelled.`)
      } },
    ]
  }

  const drawerRow = drawerId ? all.find((r) => r.orderId === drawerId) ?? null : null

  return (
    <LocalPage>
      {/* the owner-finalised local chrome (spec §11): tabs on the canvas with
          the two primary actions on the strip's right, then ONE filter line */}
      <LocalTabs
        tabs={TABS.map((t, i) => ({ id: String(i), label: t.label, count: tabCounts[i], icon: TAB_ICONS[i] }))}
        active={String(tab)} onChange={(id) => { setTab(Number(id)); setPage(1) }}
        right={<AddUpload onAdd={() => nav('/local/consignments/add')} onUpload={() => setUploading(true)} />} />

      <FilterLine
        right={<>
          <SearchBox value={q} onChange={(v) => { setQ(v); setPage(1) }} placeholder="Search shipments" />
          {chooser}
          <IconBtn title="Download all (CSV)"
            onClick={() => { downloadCsv('consignments.csv', csvOf(rows)); toast.success(`${rows.length} rows exported.`) }}>
            <DownloadGlyph size={16} />
          </IconBtn>
        </>}>
        <DateRange start={from} end={to} onStart={(v) => { setFrom(v); setPage(1) }} onEnd={(v) => { setTo(v); setPage(1) }} />
        {/* the ONE State/Secondary State popup — same list as Pending for Planning */}
        <FilterMultiSelect values={stateSel} placeholder="State/Secondary State" width={200}
          options={STATE_OPTIONS} groupOf={stateGroupOf}
          onChange={(v) => { setStateSel(v); setPage(1) }} />
        <FilterSelect value={merchant} placeholder="Merchant" options={merchants} width={170} onChange={(v) => { setMerchant(v); setPickupAddress(''); setPage(1) }} />
        {pickupOn && (
          /* inert until a merchant is picked, and says why */
          <FilterSelect value={pickupAddress} placeholder={merchant ? 'Pickup Address' : 'Select a merchant first'}
            options={merchantStores} labels={storeLabel} searchable={merchantStores.length > 6} width={200}
            disabled={!merchant} onChange={(v) => { setPickupAddress(v); setPage(1) }} />
        )}
        <FunnelFilters defs={moreDefs} values={more}
          onChange={(k, vals) => { setMore((m) => ({ ...m, [k]: vals })); setPage(1) }} />
        <ClearFilters active={filtersOn} onClick={clearAll} />
      </FilterLine>

      {booked && booked.length > 0 && (
        <div className="mt-4 flex items-center gap-2 rounded-md border border-line bg-success-bg px-4 py-2.5 text-[13px] text-ink">
          <span className="font-bold text-success-fg">Pickup scheduled:</span>
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {booked.map((b) => (
              <span key={`${b.prId}-${b.kind}`}>
                <Link to={`/local/pickup/${b.prId}`} className="font-mono font-bold text-brand-500 hover:underline">{b.number}</Link>
                <span className="text-ink-3"> · {b.count} {b.kind === 'new' ? 'booked' : b.kind === 'merged' ? 'merged in' : 'added'}</span>
              </span>
            ))}
          </span>
          <button onClick={() => setBooked(null)} className="ml-auto text-ink-3 hover:text-ink" aria-label="Dismiss"><X size={14} /></button>
        </div>
      )}

      <div className="mt-4">
        {rows.length === 0 ? (
          <Panel>
            <EmptyState
              title={filtersOn ? 'No shipments match these filters' : `Nothing under ${TABS[tab].label}`}
              hint={filtersOn ? 'Clear the filters to see the whole list again.' : 'Shipments appear here once a merchant order is paid.'} />
          </Panel>
        ) : (
          <>
            <DataTable
              columns={columns} rows={paged} rowKey="orderId" selectable
              selectionActions={(s, clear) => selectionActions(s as LocalConsignmentRow[], clear)}
              onRowClick={(r) => nav(`/local/consignments/${(r as LocalConsignmentRow).orderId}`)} />
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

      {scheduling && manualPickup && (
        <SchedulePickupDialog
          orderIds={scheduling.ids}
          onClose={() => setScheduling(null)}
          onDone={(results, failed) => {
            scheduling.clear()
            setScheduling(null)
            setBooked(results)
            if (results.length) {
              const n = results.reduce((k, r) => k + r.count, 0)
              toast.success(`${n} shipment${n === 1 ? '' : 's'} booked for pickup — ${results.map((r) =>
                `${r.number}${r.kind === 'merged' ? ' (merged)' : r.kind === 'added' ? ' (added)' : ''}`).join(', ')}`)
            }
            if (failed.length) toast.error(`${failed.join(', ')} can no longer take shipments — nothing added there.`)
          }} />
      )}

      {joining && manualPickup && (
        <BookConsignmentsDialog orders={joining.orders} prefer="existing" onClose={() => setJoining(null)}
          onDone={() => { joining.clear(); setJoining(null) }} />
      )}

      {uploading && (
        <BulkUploadDialog
          stores={db.stores}
          onClose={() => setUploading(false)}
          onCreated={(n: number) => { setUploading(false); toast.success(`${n} shipments created.`) }} />
      )}

      {drawerId && <ConsignmentView row={drawerRow} onClose={() => nav('/local/consignments')} />}
    </LocalPage>
  )
}

/* ----------------------------------------------------------- the drawer ---- */
