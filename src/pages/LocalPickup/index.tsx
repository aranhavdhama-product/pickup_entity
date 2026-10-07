/**
 * Pickup Requests — LOCAL console (`/local/pickup`), rebuilt on the growOrders
 * store (spec 2026-09-23 §3.2). Same grammar as `/local/consignments`: tabs with
 * counts, one filter row (date range · Status · Merchant · Advanced · Clear ·
 * search · icons), a selectable DataTable whose selection surfaces the bulk
 * actions, row click = the request's own page.
 *
 * Tabs (owner, 2026-10-05): Exception · Active · Closed · All — no "Eligible consignments" tab any more.
 * Waiting consignments are booked from **Create pickup ▾ → Pickup request** (createPickup.tsx; the same
 * menu sits on Pending For Planning) or Consignment Order → Schedule Pickup.
 */
import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  Ban, CalendarClock, CircleAlert, CircleCheck, ClipboardCheck, Download, Merge, PackageCheck, PackagePlus,
  Printer, RotateCcw, Route as RouteIcon, Settings, Split, Truck, Layers, XCircle, Zap
} from 'lucide-react'
import {
  Button, DataTable, EmptyState, PageHeader,
  PageSize, Pagination, Panel, StatusPill, type SelectionAction,
} from '../../nueva/components'
import {
  ClearFilters, DateRange, FilterLine, FilterSelect, FunnelFilters, IconBtn, LocalPage, LocalTabs, SearchBox,
} from '../../local/chrome'
import { toast } from '../../nueva/toast'
import { pickupRequestById, useGrowOrders } from '../../growOrders/store'
import { useSchedules } from '../../growOrders/scheduleModel'
import type { GrowPickupRequest } from '../../growOrders/types'
import {
  ATTENTION_REQUIRED, CONSIGNMENTS_TO_BOOK, LOCAL_PR_TAB_SLUG, inLocalPrTab, localPrTabCounts,
  localPrTabFromSlug, type LocalPrTab,
} from '../../growOrders/tabs'
import { pickupPagesVisible, usePickupModuleConfig } from '../../config/pickupModule'
import { autoPickupSummary } from '../../growOrders/pickupSlots'
import { downloadCsv } from '../LocalPFP/adapter'
import { CreatePickupButton, CreatePickupDialogs, type CreatePickupKind } from './createPickup'
import type { PrAction } from '../../growOrders/prActions'
import { PrActionDialogs } from './prSelectionActions'
import { prSelectionItems, type PrDialog } from './prSelectionItems'
import ViewPickup from '../LocalPFP/ViewPickup'
import PickupRequestDetail from './PickupRequestDetail'
import {
  duplicateIds, matchesStatus, merchantOfPr, pickupPointName, prCsv, PR_DEFAULT_COLUMN_KEYS,
  statusLabel, statusTags, STATUS_FILTER_OPTIONS,
} from './prModel'
import { usePrGridColumns } from './prColumns'

/** Display order of the tabs (owner, 2026-09-25: the queue that needs a hand first, All fourth); slugs and counts
    come from tabs.ts. 2026-10-05 (owner): no Eligible consignments tab here — consignments are booked from Consignment
    Order (Schedule Pickup) and Pending For Planning; an old `?tab=eligible` link lands on Exception. */
const TAB_ORDER: LocalPrTab[] = [ATTENTION_REQUIRED, 'Active', 'Closed', 'All']
const ICON_OF: Record<LocalPrTab, typeof Layers> = {
  All: Layers, Active: Truck, Closed: CircleCheck, [ATTENTION_REQUIRED]: CircleAlert, [CONSIGNMENTS_TO_BOOK]: PackagePlus,
}
const TAB_ICONS = TAB_ORDER.map((t) => ICON_OF[t])
const uniq = (xs: (string | null | undefined)[]) => [...new Set(xs.filter((x): x is string => !!x))].sort()
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`

type Dialog =
  | { kind: 'create'; what: CreatePickupKind }
  | PrDialog
  | null

/** the Pickup page's glyph per pickup-request action (the menu itself is shared) */
const PR_ACTION_ICON: Partial<Record<PrAction, React.ReactNode>> = {
  planCollection: <RouteIcon size={14} />, addToRoute: <RouteIcon size={14} />, assignCarrier: <Truck size={14} />,
  switchToFleet: <Truck size={14} />, reschedule: <CalendarClock size={14} />, addConsignments: <PackagePlus size={14} />,
  split: <Split size={14} />, confirmSlot: <CircleCheck size={14} />, reattempt: <RotateCcw size={14} />,
  markPickedUp: <PackageCheck size={14} />, markFailed: <CircleAlert size={14} />, closeHandover: <ClipboardCheck size={14} />,
  merge: <Merge size={14} />, printLabel: <Printer size={14} />, cancel: <XCircle size={14} />, downloadCsv: <Download size={14} />,
}

/** The module-disabled state keeps the header, so the page still says where you are. */
function Disabled({ auto = false }: { auto?: boolean }) {
  return (
    <div className="p-6">
      <PageHeader title="Pickup Requests" />
      <Panel>
        <EmptyState icon={<Ban size={40} />}
          title={auto ? 'Pickups are raised automatically' : 'Pickup module is disabled for this account'}
          hint={auto
            ? 'In auto mode the module raises every pickup request itself; there is no pickup page. Switch to manual pickup requests to book and manage them here.'
            : 'Existing pickup requests stay readable from their links. Turn the Pickup Request module on to book and manage pickups.'} />
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
  /* owner, 2026-09-24: the page exists only in MANUAL mode */
  const { id } = useParams()
  const nav = useNavigate()
  /* a request stays READABLE from its link with the page hidden (scenario 23) */
  if (!pickupPagesVisible(cfg)) return <>
    <Disabled auto={cfg.enabled} />
    {id && <PickupRequestDetail id={id} onClose={() => nav('/local/pickup')} />}
  </>
  return <PickupRequestsList />
}

function PickupRequestsList() {
  const nav = useNavigate()
  const db = useGrowOrders()
  const schedules = useSchedules()
  const cfg = usePickupModuleConfig()
  const [params, setParams] = useSearchParams()
  /* `/local/pickup/view/:prId` = the list with the request's drawer over it —
     the same drawer Pending For Planning's Pickups tab opens */
  const { prId: drawerPrId, id: requestId } = useParams()
  const wantedTab: LocalPrTab = localPrTabFromSlug(params.get('tab'))
  const tab: LocalPrTab = TAB_ORDER.includes(wantedTab) ? wantedTab : ATTENTION_REQUIRED

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
  const counts = localPrTabCounts(db.pickupRequests, 0, now)
  const dup = useMemo(() => duplicateIds(db.pickupRequests), [db.pickupRequests])
  /* what needs attention on a request — the same derivation the Exception tab uses */
  const exceptionsOf = (p: GrowPickupRequest) => statusTags(p, dup, now, pickupRequestById)
  const allPrs = useMemo(() => [...db.pickupRequests].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)), [db.pickupRequests])

  /* ---------------------------------------------------------- filter defs -- */
  const merchants = useMemo(() => uniq(db.pickupRequests.map((p) => merchantOfPr(p, db.stores))),
    [db.pickupRequests, db.stores])
  const moreDefs = useMemo(() => [
      { key: 'Pickup address', label: 'Pickup address', options: uniq(allPrs.map((p) => pickupPointName(p, db.stores))) },
      { key: 'Carrier', label: 'Carrier', options: uniq(allPrs.map((p) => p.carrierName)) },
      { key: 'Driver', label: 'Driver', options: uniq(allPrs.map((p) => p.driverName)) },
      { key: 'Attention', label: 'Exception', options: ['None', 'Overdue', 'Discrepancy', 'Duplicate', 'Partially picked', 'Re-attempt available', 'Re-attempt scheduled'] },
      { key: 'Type', label: 'Type', options: ['LTL', 'FTL'] },
      { key: 'Source', label: 'Source', options: uniq(allPrs.map((p) => p.source)) },
      { key: 'Reserved', label: 'Reserved', options: ['Reserved', 'Not reserved'] },
    ], [allPrs, db.stores])

  const filtersOn = !!(q || status || merchant || from || to || Object.values(more).some((v) => v.length))
  const clearAll = () => { setQ(''); setStatus(''); setMerchant(''); setFrom(''); setTo(''); setMore({}); setPage(1) }
  const setTab = (i: number) => {
    const next = new URLSearchParams(params); next.set('tab', LOCAL_PR_TAB_SLUG[TAB_ORDER[i]])
    setParams(next, { replace: true }); setMore({}); setStatus(''); setPage(1)
  }
  const has = (k: string, v: string) => !more[k]?.length || more[k].includes(v)

  const prRows = (() => {
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
      if (more.Attention?.length) {
        const tags = exceptionsOf(p).map((t) => (t.label.startsWith('Re-attempt scheduled') ? 'Re-attempt scheduled' : t.label))
        if (!more.Attention.some((x) => (x === 'None' ? tags.length === 0 : tags.includes(x)))) return false
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

  const total = prRows.length
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const safePage = Math.min(page, totalPages)
  const slice = <T,>(xs: T[]) => xs.slice((safePage - 1) * pageSize, safePage * pageSize)

  const exportAll = () => {
    downloadCsv('pickup-requests.csv', prCsv(prRows, db))
    toast.success(`${plural(total, 'row')} exported.`)
  }

  /* -------------------------------------------------------------- columns -- */

  /* owner, 2026-09-25: one value per cell, single-line rows — the shared
     pickup grid (prModel.PR_COLUMN_DEFS), same as Grow's Pickup Requests */
  const prGrid = usePrGridColumns({
    storageKey: 'local-pickup-columns-v3', defaults: PR_DEFAULT_COLUMN_KEYS,
    ctx: { stores: db.stores, byId },
    cells: {
      status: (p) => { const s = statusLabel(p); return <StatusPill label={s.label} tone={s.tone} /> },
      trip: (p) => (p.tripId
        ? <Link to={`/local/control-tower/trips/${p.tripId}`} onClick={(e) => e.stopPropagation()} className="font-mono text-[12px] font-bold text-ink hover:underline">{p.tripId}</Link>
        : <span className="text-ink-3">—</span>),
    },
  })

  /* -------------------------------------------------------------- actions -- */

  /* the ONE pickup-request selection menu (prSelectionActions.tsx), shared
     with Pending for Planning; every item gated by growOrders/prActions.ts */
  const prActions = (sel: GrowPickupRequest[], clear: () => void): SelectionAction[] =>
    prSelectionItems(sel, { cfg, db, openDialog: setDialog, clear }).map((it) => ({
      label: it.label, icon: PR_ACTION_ICON[it.id], disabled: it.disabled, reason: it.reason, onClick: it.onClick,
    }))

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
          <Button variant="outline" icon={<CalendarClock size={14} />} onClick={() => nav('/local/pickup/schedules')}>Schedules ({schedules.schedules.length})</Button>
          <IconBtn title="Pickup settings" onClick={() => nav('/local/settings/pickup')}><Settings size={16} /></IconBtn>
          {cfg.mode === 'auto'
            ? <span className="inline-flex h-8 items-center gap-1.5 rounded-md border border-info-bg bg-info-bg px-2.5 text-[12px] text-ink" title="Pickup requests are raised automatically when a consignment is created — Settings → Pickup Request.">
                <Zap size={13} className="text-brand-500" />{autoPickupSummary(cfg)}
              </span>
            /* owner, 2026-10-05: Create pickup ▾ = Pickup request (waiting consignments) · Blind pickup request */
            : <CreatePickupButton onPick={(what) => setDialog({ kind: 'create', what })} />}
        </>} />
      <FilterLine
        right={<>
          <SearchBox value={q} onChange={(v) => { setQ(v); setPage(1) }} placeholder="Search pickups" />
          {prGrid.chooser}
          <IconBtn title="Download filtered rows (CSV)" onClick={exportAll}><Download size={16} /></IconBtn>
        </>}>
        <DateRange start={from} end={to} onStart={(v) => { setFrom(v); setPage(1) }} onEnd={(v) => { setTo(v); setPage(1) }} />
        <FilterSelect value={status} placeholder="Status" options={STATUS_FILTER_OPTIONS} width={170} onChange={(v) => { setStatus(v); setPage(1) }} />
        <FilterSelect value={merchant} placeholder="Merchant" options={merchants} width={170} onChange={(v) => { setMerchant(v); setPage(1) }} />
        <FunnelFilters defs={moreDefs} values={more} onChange={(k, vals) => { setMore((m) => ({ ...m, [k]: vals })); setPage(1) }} />
        <ClearFilters active={filtersOn} onClick={clearAll} />
      </FilterLine>

      <div className="mt-4">
        {total === 0 ? (
          <Panel>
            <EmptyState
              title={filtersOn ? 'Nothing matches these filters' : tab === ATTENTION_REQUIRED ? 'No exceptions' : `No pickup requests under ${tab}`}
              hint={filtersOn ? 'Clear the filters to see the whole list again.' : tab === ATTENTION_REQUIRED ? undefined : 'Use Create pickup to book one.'} />
          </Panel>
        ) : (
          <>
            <DataTable key={`prs-${tab}`} columns={prGrid.columns} rows={slice(prRows)} rowKey="id" selectable
              selectionActions={(s, clear) => prActions(s as GrowPickupRequest[], clear)}
              onRowClick={(r) => nav(`/local/pickup/${(r as GrowPickupRequest).id}?${params.toString()}`)} />
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
      {/* owner, 2026-09-25: the request opens as a slide-over over the list, URL `/local/pickup/:id` */}
      {requestId && <PickupRequestDetail id={requestId} onClose={() => nav(`/local/pickup?${params.toString()}`)} />}

      <CreatePickupDialogs kind={dialog?.kind === 'create' ? dialog.what : null} onClose={close}
        onCreated={(prs) => { if (prs.length === 1) nav(`/local/pickup/${prs[0].id}`) }} />
      <PrActionDialogs dialog={dialog && dialog.kind !== 'create' ? dialog : null} db={db} onClose={close} />
    </LocalPage>
  )
}
