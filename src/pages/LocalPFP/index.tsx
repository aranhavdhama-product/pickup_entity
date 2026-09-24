/**
 * Pending For Planning — LOCAL MODE, rebuilt as a PIXEL REPLICA of staging's
 * `/v2/ses/pending-for-planning`.
 *
 * THIS ROUTE IS THE ONE EXCEPTION to "layout is ours" (see CLAUDE.md). Its
 * arrangement, spacing, type scale, column order, column widths and glyphs are
 * staging's, reproduced from measurements — `stagingTokens.json` (extracted
 * computed styles + geometry), `icons.tsx` (extracted SVG) and `pfpChrome.css`
 * (rules that read only those tokens). Nothing here is eyeballed, and nothing
 * here is precedent for another page.
 *
 * The DATA is still entirely local: every row is a Grow merchant order
 * (`src/growOrders`, read-only) translated by `adapter.ts`, and every action
 * writes to `planningStore` — or, when the fact belongs to the merchant too
 * (cancelled, delivered, undelivered), through `growOrderActions`. No session,
 * no `/staging` request.
 *
 * `?fixture=staging` (dev only) swaps the rows for `stagingFixture.ts` — the 20
 * rows staging itself shows — so a screenshot diff measures chrome and geometry
 * instead of differing row text. It is a measurement aid, not sample data.
 *
 * The column set the user configures on `/local/columns` still applies: the
 * staging order in `stagingTokens.json` is the DEFAULT sequence, and a column
 * the user has hidden there is hidden here.
 */
import { useMemo, useState } from 'react'
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import './pfpChrome.css'
import { toast } from '../../nueva/toast'
/* owner-finalised chrome, shared by every local page (spec §11) — logged in
   scratchpad/split/pixel-diff-log.md */
import { ClearFilters, DateRange, FilterLine, LocalTabs, SearchBox } from '../../local/chrome'
import { Layers, Package as PackageIcon, Truck } from 'lucide-react'
import { useGrowOrders, growOrderActions, growOrdersSnapshot } from '../../growOrders/store'
import { daysFromNow } from '../../growOrders/tabs'
import { hubName, inboundHubFor } from '../../growOrders/hubs'
import { usePickupModuleConfig } from '../../config/pickupModule'
import {
  CATEGORY_FLAGS, csvOf, downloadCsv, isPendingForPlanning, isPendingPickup, isPickupRow,
  pickupLoadOf, toConsignmentRow, toPickupRow,
  type CategoryFlag, type LocalConsignmentRow, type LocalPickupRow, type UnifiedRow, executionOverlay,
} from './adapter'
import { hiddenStagingColumns } from './columnConfig'
import { ROW_TYPES, type RowType } from './fieldRegistry'
import { planningActions, usePlanning } from './planningStore'
import {
  CancelOrderModal, CancelPickupModal, CloseConsignmentModal, FailPickupModal, PlanCollectionModal,
  PlanRouteModal, RaiseExceptionModal, RtoConfirmModal, ScheduleModal, type PlanCollectionChoice,
} from './modals'
import ViewConsignment from './ViewConsignment'
import ViewPickup from './ViewPickup'
import {
  ArrowRight, Barbell, Biohazard, CaretDown, CaretDownSolid, CaretUpSolid, ChevronLeft,
  ChevronRight, Close, Clock, CalendarCheck, Download, Eye, Funnel, GridFour, ListChecks,
  ListGlyph, MagnifyingGlass, NotePencil, Refresh, RoutePath, Star, Stack,
  StepDown, StepUp, TableEdit, Trash, WarningCircle, WarningTriangle, WineGlass,
} from './icons'
import { COLUMNS, FUNNEL_FILTERS, ROLE, TABLE_SCROLL_WIDTH, cssVars } from './stagingTokens'
import {
  FIXTURE_CARRIERS, FIXTURE_CATEGORIES, FIXTURE_DATE_RANGE, FIXTURE_STATS,
  STAGING_FIXTURE_ROWS, fixtureRequested, type FixtureRow,
} from './stagingFixture'

/* ------------------------------------------------------------ vocabulary --- */

const FLAG_ICON: Record<CategoryFlag, (p: { size?: number }) => React.JSX.Element> = {
  VIP: (p) => <Star {...p} />,
  Stackable: (p) => <Stack {...p} />,
  Hazmat: (p) => <Biohazard {...p} />,
  Fragile: (p) => <WineGlass {...p} />,
  'Heavy Weight': (p) => <Barbell {...p} />,
}

/**
 * Staging's `State/Secondary State` popover, verbatim — 41 options over BOTH
 * vocabularies in one list (that is why the control is named for two things).
 * Most of them can never occur on local data; they are rendered anyway, because
 * the list's length is part of the chrome being replicated.
 */
const STATE_OPTIONS = [
  'At Facility', 'Created', 'Driver Out', 'Intransit', 'Lost', 'Partial At Facility', 'Pending',
  'Pickedup', 'Pickup Failed', 'Reached Location', 'Ready To Ship', 'RTO Initiated', 'Undelivered',
  'At Delivery Location', 'At Pickup Location', 'Damage', 'Dispatched', 'Driver Assigned',
  'Driver Assigned For Delivery', 'Driver Assigned For Pickup', 'Driver Assigned For Service',
  'Geo Lookup Not Found', 'Label Generated', 'Loaded', 'Loaded On Lastmile', 'Missing',
  'Out For Delivery', 'Out For Pickup', 'Out For Service', 'Partially Delivered',
  'Partially Loaded On Lastmile', 'Partially Pickedup', 'Permanent Damage', 'Planned',
  'Ready For Last Mile Dispatch', 'Request For Reschedule', 'Scheduled', 'Staged',
  'Staging Started', 'Stored', 'Unplanned',
]

/** staging's Exceptions dropdown */
const EXCEPTION_OPTIONS = ['Geo Lookup Not Found', 'Damaged', 'Misroute']

/** the Quick Filter strip — staging's four exception buckets, with local predicates */
const QUICK_FILTERS = [
  { key: 'failed', label: 'Failed', hint: 'Orders with failed attempts' },
  { key: 'inbound', label: 'Inbound Pending', hint: 'Orders awaiting arrival at hub' },
  { key: 'scheduling', label: 'Pending For Scheduling', hint: 'Orders pending for confirmation' },
  { key: 'past', label: 'Past Delivery Date', hint: 'Orders past their delivery date' },
] as const

type QuickKey = typeof QUICK_FILTERS[number]['key']

const quickTest = (key: QuickKey, r: UnifiedRow): boolean => {
  if (isPickupRow(r)) {
    if (key === 'failed') return !!r.exception
    if (key === 'inbound') return r.request.status !== 'Completed'
    if (key === 'scheduling') return r.request.status === 'Requested'
    return r.overdue
  }
  if (key === 'failed') return !!r.exception
  if (key === 'inbound') return r.state !== 'At Facility'
  if (key === 'scheduling') return !r.deliveryWindow
  return !!r.deliveryWindow && new Date(r.deliveryWindow.end).getTime() < Date.now()
}

const uniq = (xs: string[]) => [...new Set(xs.filter(Boolean))].sort()

/** the date a row sorts on — its window for a pickup, its ship-by for an order */
const sortKey = (r: UnifiedRow): string =>
  isPickupRow(r) ? r.pickupWindow.start.slice(0, 10) : r.shipByDate

/* -------------------------------------------------------------- the grid --- */

/**
 * What a table row renders as: staging's 20 columns, as strings, plus the flag
 * icons and the identity the actions address. Both sources — the live local
 * queue and the dev fixture — are mapped into this ONE shape, so the table's
 * rendering code never branches on where a row came from.
 */
interface DisplayRow {
  id: string
  /** '' for a fixture row — the fixture is inert by construction */
  orderId: string
  /**
   * Which kind of thing this row is. A mixed list is unreadable without it, so
   * it is surfaced by the Type column, moved to the front of the grid — see the
   * deviation note in `stagingTokens.ts`.
   */
  rowType: RowType
  /**
   * The Type column's SECOND line. The first says what kind of record this is;
   * this says which kind of that kind — LTL / FTL / Reserved for a booking, and
   * for a consignment its direction plus the legs it actually generates.
   */
  typeDetail: string
  flags: CategoryFlag[]
  flagsDash: boolean
  cells: Record<string, string>
  editable: boolean
}

const toDisplay = (r: UnifiedRow): DisplayRow => {
  if (isPickupRow(r)) {
    /* A Reserved booking's weight is the merchant's ESTIMATE, not a sum over
       real orders — it must say so. And an unknown weight is '-', never 0:
       zero is a measurement, and a non-blind booking with no orders attached
       genuinely does not know what it weighs yet. */
    const weight = r.weightKnown
      ? `${r.weightApprox ? '~ ' : ''}${r.weightKg.toFixed(1)}`
      : '-'
    return {
      id: r.id, orderId: '', rowType: r.rowType, typeDetail: pickupLoadOf(r.request),
      flags: [], flagsDash: true, editable: false,
      cells: {
        orderNumber: r.reference, referenceNumber: r.reference,
        shipByDate: r.pickupWindow.start.slice(0, 10), state: String(r.state),
        carrier: '-', secondaryState: r.secondaryState || '',
        dispatchDate: '-', weight, volume: '-',
        palletSpaces: '-', sku: '-', serviceTime: '-', tag: r.tags.join(', ') || '-',
        /* the exact sub-type, not a flat 'Pickup': Reserved and FTL behave
           differently enough that collapsing them hides the difference */
        specialInstructions: '-', merchant: r.merchant, orderType: 'Pickup Request',
        ageing: String(r.ageingDays), address: r.shipFromAddress,
      },
    }
  }
  return {
    id: r.id, orderId: r.orderId, rowType: 'Consignment',
    /* e.g. 'Forward · FM-MM-LM' — a reverse order collected from the customer
       reads 'Reverse · FM-LM', which is the case that was invisible before */
    typeDetail: `${r.orderTypeLabel} · ${r.legChain}`,
    flags: r.flags, flagsDash: r.flags.length === 0, editable: true,
    cells: {
      orderNumber: r.orderNumber, referenceNumber: r.referenceNumber,
      shipByDate: r.shipByDate, state: String(r.state),
      carrier: r.carrier, secondaryState: r.secondaryState,
      dispatchDate: r.dispatchDate || '-', weight: String(r.weightKg),
      volume: String(r.volumeMm3), palletSpaces: String(r.palletSpaces ?? 1),
      sku: String(r.skuCount), serviceTime: String(r.serviceTimeMin),
      tag: r.tag || '-', specialInstructions: r.specialInstructions || '-',
      merchant: r.merchant, orderType: 'Consignment',
      ageing: String(r.ageingDays), address: r.address,
    },
  }
}

const fixtureToDisplay = (f: FixtureRow, i: number): DisplayRow => ({
  id: `fixture-${i}`, orderId: '', rowType: 'Consignment', typeDetail: f.orderType,
  flags: f.flags, flagsDash: f.flagsDash, editable: true,
  cells: {
    orderNumber: f.orderNumber, referenceNumber: f.referenceNumber, shipByDate: f.shipByDate,
    state: f.state, carrier: f.carrier, secondaryState: f.secondaryState,
    dispatchDate: f.dispatchDate, weight: f.weight, volume: f.volume,
    palletSpaces: f.palletSpaces, sku: f.sku, serviceTime: f.serviceTime, tag: f.tag,
    specialInstructions: f.specialInstructions, merchant: f.merchant, orderType: f.orderType,
    ageing: f.ageing, address: f.address,
  },
})

/** the two columns staging gives a per-column search glyph */
const SEARCHABLE = new Set(['orderNumber', 'referenceNumber'])
/** the columns staging sorts */
const SORTABLE = new Set(['orderNumber', 'referenceNumber', 'shipByDate', 'palletSpaces'])

/* ------------------------------------------------------------ the tabs ---- */

/**
 * OWNER-REQUESTED DEVIATION (logged in scratchpad/split/pixel-diff-log.md):
 * staging has no tab strip on this page. `?tab=` narrows the queue to one row
 * kind before any other filter runs; All is the page as it was. The strip is
 * drawn with the Carriers-card chip tokens (`.pfp-chip`, `.pfp-chip-count`) —
 * no new colour or measurement.
 */
const TABS = [
  { key: 'consignments', label: 'Shipments' },
  { key: 'pickups', label: 'Pickups' },
  { key: 'all', label: 'All' },
] as const
type TabKey = typeof TABS[number]['key']
const TAB_ICON: Record<TabKey, typeof Layers> = { all: Layers, consignments: PackageIcon, pickups: Truck }

const inTab = (tab: TabKey, r: UnifiedRow): boolean =>
  tab === 'all' || (tab === 'pickups') === isPickupRow(r)

/* ------------------------------------------------------------- the page ---- */

type ModalKind = 'schedule' | 'rto' | 'plan' | 'close' | 'exception' | 'cancel'
  | 'planPickup' | 'failPickup' | 'cancelPickup' | null
type PopKind = 'state' | 'funnel' | 'settings' | 'pagesize' | null

/**
 * `variant`:
 *  - `current` (default, `/local/pending-for-planning`) — the owner-finalised
 *    local chrome: one filter line, underline tabs, chip line, totals in the footer.
 *  - `replica` (`/local/pending-for-planning-replica`) — staging's own chrome,
 *    measured: filter row (… · Quick Filter), the Carriers / Categories cards,
 *    the list toolbar (search · Exceptions · four totals · hint · icons) — plus
 *    the owner's Shipments / Pickups / All strip above the filter row.
 * The data, filters, table, selection panel, popups and overlays are shared.
 */
export type PfpVariant = 'current' | 'replica'

const PFP_BASE: Record<PfpVariant, string> = {
  current: '/local/pending-for-planning',
  replica: '/local/pending-for-planning-replica',
}

export default function LocalPendingForPlanning({ variant = 'current' }: { variant?: PfpVariant } = {}) {
  const replica = variant === 'replica'
  const basePath = PFP_BASE[variant]
  const nav = useNavigate()
  const { search } = useLocation()
  const { id: overlayId, prId: pickupOverlayId } = useParams()
  const db = useGrowOrders()
  const plan = usePlanning()
  /* Module off = the page as it was before pickups joined it: no Pickups tab,
     and no pickup rows anywhere in the queue (so no pickup actions either). */
  const pickupsOn = usePickupModuleConfig().enabled
  const [params, setParams] = useSearchParams()

  const fixture = fixtureRequested(search)

  const [from, setFrom] = useState(fixture ? FIXTURE_DATE_RANGE.from : '')
  const [to, setTo] = useState(fixture ? FIXTURE_DATE_RANGE.to : '')
  const [stateSel, setStateSel] = useState<string[]>([])
  const [stateDraft, setStateDraft] = useState<string[]>([])
  const [funnel, setFunnel] = useState<Record<string, string>>({})
  const [q, setQ] = useState('')
  const [exception, setException] = useState('')
  const [carrier, setCarrier] = useState('')
  const [flag, setFlag] = useState<CategoryFlag | ''>('')
  const [quick, setQuick] = useState<QuickKey | ''>('')
  const [quickOpen, setQuickOpen] = useState(false)
  const [typeSel, setTypeSel] = useState('')
  /* whether the Carriers / Categories strip is shown, remembered per browser —
     an operator who hides it wants it hidden tomorrow too. OWNER-REQUESTED
     deviation: with no stored preference the strip starts HIDDEN, so the list
     gets the height (staging always shows it; logged in pixel-diff-log.md).
     '0' = the operator chose to show it, '1' = chose to hide it. */
  const [stripOpen, setStripOpen] = useState(() => {
    try { return localStorage.getItem('pfp-strip-hidden') === '0' } catch { return false }
  })
  const toggleStrip = () => setStripOpen((v) => {
    try { localStorage.setItem('pfp-strip-hidden', v ? '1' : '0') } catch { /* private mode */ }
    return !v
  })
  const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' } | null>(null)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [pop, setPop] = useState<PopKind>(null)
  const [density, setDensity] = useState('Default')
  const [wrapping, setWrapping] = useState('Default')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [modal, setModal] = useState<ModalKind>(null)

  /* The saved column configuration still governs which of staging's 20 columns
     this listing shows — `/local/columns` is the page that edits it, and its
     shipped default is the console's own 20 (see `columnConfig.PRESETS`). Read
     once per mount: the setting changes only on that page, which navigates back
     here and remounts this one. */
  const hidden = useMemo(() => hiddenStagingColumns(), [])

  /* ------------------------------------------------------------- the data -- */

  const all = useMemo<UnifiedRow[]>(() => {
    const left = new Set(plan.leftQueue)
    const consignments = db.orders
      .filter((o) => isPendingForPlanning(o, left))
      .map((o) => toConsignmentRow(o, db, {
        secondaryState: plan.secondaryState[o.id],
        schedule: plan.scheduleOverrides[o.id],
        exception: plan.exceptions[o.id],
        ...executionOverlay(o, plan.trips),
      }))
    const pickups = pickupsOn ? db.pickupRequests.filter(isPendingPickup).map((p) => toPickupRow(p, db)) : []
    return [...consignments, ...pickups].sort((a, b) => (sortKey(a) < sortKey(b) ? 1 : -1))
  }, [db, plan, pickupsOn])

  /* ---- the tab: narrows the queue before any filter runs ---- */
  const tabs = TABS.filter((t) => pickupsOn || t.key !== 'pickups')
  const rawTab = params.get('tab')
  /* an unknown value — or Pickups while the module is off — reads as All */
  const tab: TabKey = rawTab === 'consignments' ? 'consignments'
    : rawTab === 'pickups' && pickupsOn ? 'pickups' : 'all'
  const tabCounts = useMemo(() => {
    const pickups = all.filter(isPickupRow).length
    return { all: all.length, consignments: all.length - pickups, pickups }
  }, [all])
  const tabRows = useMemo(() => all.filter((r) => inTab(tab, r)), [all, tab])

  const consignmentRows = useMemo(
    () => all.filter((r): r is LocalConsignmentRow => !isPickupRow(r)), [all])

  const carriers = useMemo(
    () => (fixture ? FIXTURE_CARRIERS : uniq(consignmentRows.map((r) => r.carrier))),
    [fixture, consignmentRows])

  const categories = useMemo(() => (fixture
    ? FIXTURE_CATEGORIES
    : CATEGORY_FLAGS.map((f) => ({ label: f, count: consignmentRows.filter((r) => r.flags.includes(f)).length }))
  ), [fixture, consignmentRows])

  /** the options behind each of the funnel's 14 single-selects */
  const funnelOptions = useMemo<Record<string, string[]>>(() => ({
    Facility: uniq(consignmentRows.map((r) => r.origin)),
    Destination: uniq(all.map((r) => (isPickupRow(r) ? r.shipToName : r.destination))),
    'Order Type': uniq(consignmentRows.map((r) => `${r.orderTypeLabel} · ${r.legChain}`)),
    Merchant: uniq(all.map((r) => r.merchant)),
    'Sort Code': uniq(consignmentRows.map((r) => r.shipToPincode)),
    Scheduling: ['Scheduled', 'Not scheduled'],
    'Service Type': uniq(consignmentRows.map((r) => r.serviceType)),
    /* staging offers these four over data this queue has no equivalent for; the
       control is rendered in full (its presence is part of the chrome) and is
       inert until a local row can answer it */
    'Attempt Count': ['0', '1', '2', '3'],
    Clearance: ['Required', 'Done', 'Not required'],
    Tags: uniq(all.flatMap((r) => (isPickupRow(r) ? r.tags : r.tag.split(', ')))),
    'Cod Amount': ['0', '1 - 100', '101 - 500', '500+'],
    'Total Weight': ['0 - 10', '10 - 50', '50 - 200', '200+'],
    'Total Volume': ['0 - 1,000', '1,000 - 100,000', '100,000+'],
    'Ageing (days)': uniq(all.map((r) => String(r.ageingDays))),
  }), [all, consignmentRows])

  /* the four row kinds actually present, in the order the discriminator declares */
  const typeOptions = useMemo(
    () => ROW_TYPES.filter((t) => tabRows.some((r) => r.rowType === t)), [tabRows])

  const filtersOn = !!(from || to || stateSel.length || q || exception || carrier || flag || quick
    || typeSel || Object.values(funnel).some(Boolean))

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return tabRows.filter((r) => {
      const pickup = isPickupRow(r)
      const day = sortKey(r)
      if (from && day < from) return false
      if (to && day > to) return false
      if (stateSel.length && !stateSel.includes(String(r.state)) && !stateSel.includes(r.secondaryState)) return false
      if (typeSel && r.rowType !== typeSel) return false
      if (exception && r.exception !== exception) return false
      if (quick && !quickTest(quick, r)) return false
      if (flag && (pickup || !r.flags.includes(flag))) return false
      if (carrier && (pickup || r.carrier !== carrier)) return false

      for (const [dim, value] of Object.entries(funnel)) {
        if (!value) continue
        if (dim === 'Merchant' && r.merchant !== value) return false
        if (dim === 'Ageing (days)' && String(r.ageingDays) !== value) return false
        if (pickup) {
          if (dim === 'Destination' && r.shipToName !== value) return false
          if (dim === 'Tags' && !r.tags.includes(value)) return false
          if (dim === 'Facility' || dim === 'Order Type' || dim === 'Service Type' || dim === 'Sort Code') return false
        } else {
          if (dim === 'Facility' && r.origin !== value) return false
          if (dim === 'Destination' && r.destination !== value) return false
          if (dim === 'Order Type' && `${r.orderTypeLabel} · ${r.legChain}` !== value) return false
          if (dim === 'Service Type' && r.serviceType !== value) return false
          if (dim === 'Sort Code' && r.shipToPincode !== value) return false
          if (dim === 'Tags' && !r.tag.includes(value)) return false
          if (dim === 'Scheduling' && (r.deliveryWindow ? 'Scheduled' : 'Not scheduled') !== value) return false
        }
      }

      if (needle) {
        const hay = pickup
          ? `${r.reference} ${r.merchant} ${r.shipFromName} ${r.shipFromAddress}`.toLowerCase()
          : `${r.orderNumber} ${r.referenceNumber} ${r.merchant} ${r.address}`.toLowerCase()
        if (!hay.includes(needle)) return false
      }
      return true
    })
  }, [tabRows, from, to, stateSel, exception, quick, flag, carrier, funnel, q, typeSel])

  /** what the table actually renders — the fixture short-circuits every filter */
  const display = useMemo<DisplayRow[]>(() => {
    if (fixture) return STAGING_FIXTURE_ROWS.map(fixtureToDisplay)
    const rows = filtered.map(toDisplay)
    if (!sort) return rows
    const { key, dir } = sort
    return [...rows].sort((a, b) => {
      const x = a.cells[key] ?? '', y = b.cells[key] ?? ''
      const n = Number(x), m = Number(y)
      const cmp = Number.isFinite(n) && Number.isFinite(m) && x !== '' && y !== ''
        ? n - m : x.localeCompare(y)
      return dir === 'asc' ? cmp : -cmp
    })
  }, [fixture, filtered, sort])

  /* The fixture is ONE page of staging's 101 rows, so its pager must be
     staging's — five numbered buttons and an enabled next arrow. Deriving the
     count from the 20 rows on screen would show a single page and leave the
     footer band permanently unmatched. */
  const totalRows = fixture ? Number(FIXTURE_STATS.totalOrders) : display.length
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize))
  const safePage = Math.min(page, totalPages)
  const paged = fixture ? display : display.slice((safePage - 1) * pageSize, safePage * pageSize)

  /* Staging's four readouts. Consignments only: a pickup request and the orders
     it covers are the same parcels seen twice, so summing both double-counts. */
  const stats = useMemo(() => {
    if (fixture) return FIXTURE_STATS
    const cons = filtered.filter((r): r is LocalConsignmentRow => !isPickupRow(r))
    const weight = Math.round(cons.reduce((n, r) => n + r.weightKg, 0) * 100) / 100
    const volume = Math.round(cons.reduce((n, r) => n + r.volumeMm3, 0) * 10) / 10
    return {
      totalOrders: String(filtered.length),
      weight: `${weight.toLocaleString()} kg`,
      volume: `${volume.toLocaleString()} mm³`,
      palletSpaces: String(cons.reduce((n, r) => n + (r.palletSpaces ?? 1), 0)),
    }
  }, [fixture, filtered])

  /* ------------------------------------------------------------ selection -- */

  /** every selected row, BOTH kinds — what the panel describes */
  const selectedAll = useMemo(() => all.filter((r) => selected.has(r.id)), [all, selected])

  /** the pickup half — what the pickup-side actions address */
  const selectedPickups = useMemo(() => selectedAll.filter(isPickupRow), [selectedAll])

  /** the consignment half — what the consignment-semantic actions address */
  const selectedRows = useMemo(
    () => consignmentRows.filter((r) => selected.has(r.id)), [consignmentRows, selected])

  /**
   * WHAT IS IN THE SELECTION, by type. Every bulk action here addresses an order
   * id, so a selection holding pickup requests cannot simply be handed to them —
   * and silently acting on the consignment half would be a partial action nobody
   * asked for. The panel reads this to say what it will act on and to grey out
   * what it cannot, rather than dropping rows without a word.
   */
  const profile = useMemo(() => {
    const picks = selectedAll.filter(isPickupRow)
    return {
      total: selectedAll.length,
      consignments: selectedRows.length,
      pickups: picks.length,
      /* Return to Origin only means something on a FORWARD order — a reverse
         consignment is already travelling back to where it came from. */
      forward: selectedRows.filter((r) => r.orderTypeLabel === 'Forward').length,
      reverse: selectedRows.filter((r) => r.orderTypeLabel === 'Reverse').length,
      reserved: picks.filter((p) => p.rowType === 'Reserved Pickup').length,
      ftl: picks.filter((p) => p.rowType === 'FTL Pickup').length,
      mixed: selectedRows.length > 0 && picks.length > 0,
    }
  }, [selectedAll, selectedRows])

  const selMetrics = useMemo(() => ({
    weight: Math.round(selectedRows.reduce((n, r) => n + r.weightKg, 0) * 10) / 10,
    volume: Math.round(selectedRows.reduce((n, r) => n + r.volumeMm3, 0) * 10) / 10,
    pallets: selectedRows.reduce((n, r) => n + (r.palletSpaces ?? 1), 0),
  }), [selectedRows])

  /** what a pickup selection actually measures: bookings, orders covered, weight */
  const pickupMetrics = useMemo(() => {
    const known = selectedPickups.filter((r) => r.weightKnown)
    return {
      orders: selectedPickups.reduce((n, r) => n + r.orderCount, 0),
      weight: Math.round(known.reduce((n, r) => n + r.weightKg, 0) * 10) / 10,
      known: known.length > 0,
      /* if ANY contributing booking was an estimate, the total is an estimate */
      approx: known.some((r) => r.weightApprox),
    }
  }, [selectedPickups])

  /**
   * Staging disables `Plan For Routing` and shows `(0)` unless the selection is
   * actually eligible for direct routing: a consignment must be AT the facility
   * and carry a delivery window. The counter is that subset, not the selection.
   */
  const routable = useMemo(
    () => selectedRows.filter((r) => r.state === 'At Facility' && !!r.deliveryWindow),
    [selectedRows])

  const selIds = selectedRows.map((r) => r.orderId)
  const clearSelection = () => setSelected(new Set())

  const done = (msg: string) => {
    clearSelection()
    setModal(null)
    toast.success(msg)
  }

  const toggleRow = (id: string) => setSelected((s) => {
    const next = new Set(s)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  })

  const pageIds = paged.map((r) => r.id)
  const allOnPage = pageIds.length > 0 && pageIds.every((id) => selected.has(id))

  /* A tab change clears the selection: rows picked on another tab would stay
     selected out of sight, and the panel would act on rows nobody can see. */
  const switchTab = (next: TabKey) => {
    setParams((p) => {
      const n = new URLSearchParams(p)
      if (next === 'all') n.delete('tab'); else n.set('tab', next)
      return n
    }, { replace: true })
    clearSelection()
    setPage(1)
    if (typeSel && !all.some((r) => inTab(next, r) && r.rowType === typeSel)) setTypeSel('')
  }

  /* ---- Plan Collection For Routing: one hub per route ---- */
  /* the hub a collection is carried to: its booked inbound hub, else (a Reserved
     or FTL booking that names none) the hub its pickup point falls under */
  const hubOf = (r: LocalPickupRow): string => {
    if (r.request.destinationCode) return r.request.destinationCode
    const party = r.request.shipFrom ?? db.stores.find((x) => x.code === r.request.storeCode)?.party
    return party ? inboundHubFor(party) : ''
  }
  const pickupHubs = [...new Set(selectedPickups.map(hubOf))]
  const planHub = pickupHubs.length === 1 ? pickupHubs[0] : null
  const drivers = useMemo(
    () => uniq(plan.trips.map((t) => t.driverName ?? '')), [plan.trips])
  const planDate = useMemo(() => {
    const today = daysFromNow(0)
    const first = selectedPickups.map((r) => r.pickupWindow.start.slice(0, 10)).filter(Boolean).sort()[0]
    return first && first > today ? first : today
  }, [selectedPickups])

  /** routed pickups leave the queue; any consignments stay selected for Plan For Routing */
  const planCollections = (rows: LocalPickupRow[], c: PlanCollectionChoice) => {
    const trip = c.mode === 'existing'
      ? plan.trips.find((t) => t.id === c.tripId)
      : planningActions.createTrip({ hubCode: planHub ?? '', name: c.name, date: c.date, driverName: c.driverName })
    if (!trip) { toast.error('That route is no longer available.'); return }
    const ok = rows.filter((r) => planningActions.addPickupToTrip(trip.id, r.prId)).length
    const leftover = profile.consignments
    setSelected((s) => {
      const next = new Set(s)
      rows.forEach((r) => next.delete(r.id))
      return next
    })
    setModal(null)
    const state = trip.driverName ? `Assigned to ${trip.driverName}` : 'Planned'
    if (ok === 0) { toast.error(`No pickup could be added to ${trip.id}.`); return }
    toast.success(`${ok} pickup${ok === 1 ? '' : 's'} added to ${trip.id} — ${state}.`
      + (ok < rows.length ? ` ${rows.length - ok} could not be routed.` : ''))
    if (leftover > 0) {
      toast.info(`${leftover} shipment${leftover === 1 ? ' is' : 's are'} still selected — use Plan For Routing for ${leftover === 1 ? 'it' : 'them'}.`)
    }
  }

  const clearAll = () => {
    setFrom(''); setTo(''); setStateSel([]); setFunnel({}); setQ(''); setTypeSel('')
    setException(''); setCarrier(''); setFlag(''); setQuick(''); setPage(1)
  }

  /* ---------------------------------------------------------------- view --- */

  const columns = COLUMNS.filter((c) => c.key === '_select' || c.key === '_flags' || c.key === '_pad' || !hidden.has(c.key))

  /* ---- the controls, built once and placed per variant ---- */

  const stateControl = (
    <div style={{ position: 'relative' }} onClick={(e) => e.stopPropagation()}>
      <div className="pfp-select" style={{ width: ROLE.stateSelect.width }} data-placeholder={stateSel.length === 0}
        role="button" tabIndex={0}
        onClick={() => { setStateDraft(stateSel); setPop(pop === 'state' ? null : 'state') }}>
        <span>{stateSel.length ? `${stateSel.length} selected` : 'State/Secondary State'}</span>
        <span className="pfp-select-caret"><CaretDown size={16} /></span>
      </div>
      {pop === 'state' && (
        <div className="pfp-pop" style={{ top: 36, left: 0, width: 240 }}>
          <div className="pfp-pop-scroll">
            {STATE_OPTIONS.map((o) => (
              <button key={o} type="button" className="pfp-pop-option"
                onClick={() => setStateDraft((d) => d.includes(o) ? d.filter((x) => x !== o) : [...d, o])}>
                <input type="checkbox" readOnly checked={stateDraft.includes(o)} />{o}
              </button>
            ))}
          </div>
          <div className="pfp-pop-foot">
            <button type="button" data-kind="clear" onClick={() => setStateDraft([])}>Clear</button>
            <button type="button" data-kind="apply"
              onClick={() => { setStateSel(stateDraft); setPage(1); setPop(null) }}>Apply</button>
          </div>
        </div>
      )}
    </div>
  )

  /* Merchant is promoted out of the funnel onto the row: on a console that
     books for several merchants it is the dimension you reach for first. It
     stays bound to the SAME `funnel` state, so the filter predicate is
     unchanged and it is not offered twice. */
  const merchantControl = (
    <select className="pfp-select" style={{ width: 200 }} aria-label="Merchant"
      value={funnel.Merchant ?? ''}
      data-placeholder={!funnel.Merchant}
      onChange={(e) => { setFunnel((f) => ({ ...f, Merchant: e.target.value })); setPage(1) }}>
      <option value="">Merchant</option>
      {(funnelOptions.Merchant ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  )

  /* Type — the row-kind discriminator. On a mixed list it is the most used
     control there is, so it sits on the row, not in the funnel. */
  const typeControl = (
    <select className="pfp-select" style={{ width: 170 }} aria-label="Type"
      value={typeSel} data-placeholder={!typeSel}
      onChange={(e) => { setTypeSel(e.target.value); setPage(1) }}>
      <option value="">Type</option>
      {typeOptions.map((o) => <option key={o} value={o}>{o === 'Consignment' ? 'Shipment' : o}</option>)}
    </select>
  )

  const exceptionsControl = (
    <select className="pfp-select" aria-label="Exceptions" value={exception}
      data-placeholder={!exception}
      /* the replica sizes it from staging's measured rect (175 x 36) */
      style={replica ? { width: ROLE.exceptionsSelect.rect[2], height: ROLE.exceptionsSelect.rect[3] } : undefined}
      onChange={(e) => { setException(e.target.value); setPage(1) }}>
      <option value="">Exceptions</option>
      {EXCEPTION_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  )

  const funnelControl = (
    <div style={{ position: 'relative' }} onClick={(e) => e.stopPropagation()}>
      <button type="button" className="pfp-funnel" aria-label="More filters"
        data-active={!!((!replica && exception) || FUNNEL_FILTERS.some((d) => d !== 'Merchant' && funnel[d])) || undefined}
        onClick={() => setPop(pop === 'funnel' ? null : 'funnel')}>
        <Funnel size={16} />
      </button>
      {pop === 'funnel' && (
        <div className="pfp-pop pfp-funnel-pop" style={{ top: 36, left: 0 }}>
          <div className="pfp-pop-scroll">
            {/* current page: Exceptions moved off the toolbar into the funnel
                as its FIRST section (owner, spec §11). The replica keeps it on
                the list toolbar, where staging has it. */}
            {!replica && exceptionsControl}
            {FUNNEL_FILTERS.filter((dim) => dim !== 'Merchant').map((dim) => (
              <select key={dim} className="pfp-select" value={funnel[dim] ?? ''}
                onChange={(e) => { setFunnel((f) => ({ ...f, [dim]: e.target.value })); setPage(1) }}>
                <option value="">{dim}</option>
                {(funnelOptions[dim] ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            ))}
          </div>
        </div>
      )}
    </div>
  )

  const dateControl = (
    <DateRange mode="text" start={from} end={to}
      onStart={(v) => { setFrom(v); setPage(1) }} onEnd={(v) => { setTo(v); setPage(1) }} />
  )

  const searchControl = (
    <SearchBox value={q} placeholder="Search orders" onChange={(v) => { setQ(v); setPage(1) }} />
  )

  const downloadControl = (
    <button type="button" className="pfp-iconbtn" title="Download CSV"
      onClick={() => {
        const cons = filtered.filter((r): r is LocalConsignmentRow => !isPickupRow(r))
        downloadCsv('pending-for-planning.csv', csvOf(cons))
        toast.success(`${cons.length} shipment rows exported.`)
      }}>
      <Download size={16} />
    </button>
  )

  const settingsControl = (
    <div style={{ position: 'relative' }} onClick={(e) => e.stopPropagation()}>
      <button type="button" className="pfp-iconbtn" title="Table settings"
        onClick={() => setPop(pop === 'settings' ? null : 'settings')}>
        <TableEdit size={16} />
      </button>
      {pop === 'settings' && (
        <div className="pfp-pop" style={{ top: 36, right: 0, width: 260 }}>
          <button type="button" className="pfp-pop-option"
            onClick={() => setDensity(density === 'Default' ? 'Compact' : 'Default')}>
            <span className="pfp-menu-row" style={{ width: '100%' }}>
              Table Density <span data-value>{density}</span>
            </span>
          </button>
          <button type="button" className="pfp-pop-option"
            onClick={() => setWrapping(wrapping === 'Default' ? 'Wrap' : 'Default')}>
            <span className="pfp-menu-row" style={{ width: '100%' }}>
              Table Wrapping <span data-value>{wrapping}</span>
            </span>
          </button>
          <button type="button" className="pfp-pop-option"
            onClick={() => { setDensity('Default'); setWrapping('Default'); setSort(null); setPop(null) }}>
            Reset To Default
          </button>
          <button type="button" className="pfp-pop-option" onClick={() => nav('/local/columns')}>
            Resequence Columns
          </button>
        </div>
      )}
    </div>
  )

  /* the floating selection panel hangs from the row that carries the icons */
  const selectionPanel = selected.size > 0 && (
    <SelectionPanel
      count={selected.size}
      metrics={selMetrics}
      routable={routable.length}
      profile={profile}
      pickupMetrics={pickupMetrics}
      onClose={clearSelection}
      onAction={(kind) => {
        /* ---- pickup-side actions: each opens its popup ---- */
        if (kind === 'planPickup' && !planHub && pickupHubs.length > 1) {
          /* a route runs out of ONE hub — never put a pickup on another hub's trip */
          toast.error(`These pickups go to ${pickupHubs.length} different hubs — plan one hub at a time.`)
          return
        }
        if (kind === 'loadPlanPickup') {
          /* P4 — each hub's collections join today's "Load plan <hub> <date>" trip */
          const r = planningActions.sendPickupsToLoadPlanning(selectedPickups.map((x) => x.prId))
          if (!r.added.length) { toast.error('None of the selected pickups could be sent to load planning.'); return }
          done(`${r.added.length} pickup${r.added.length === 1 ? '' : 's'} sent to load planning on ${r.trips.map((t) => t.id).join(', ')} — Planned.`
            + (r.skipped.length ? ` ${r.skipped.length} skipped (closed or on a 3PL carrier).` : ''))
          return
        }
        if (kind === 'ready') {
          planningActions.markReadyForPlanning(selIds)
          done(`${selIds.length} marked ready for planning.`)
          return
        }
        if (kind === 'csv') {
          downloadCsv('pending-for-planning-selected.csv', csvOf(selectedRows))
          toast.success(`${selectedRows.length} row${selectedRows.length === 1 ? '' : 's'} exported.`)
          return
        }
        setModal(kind)
      }} />
  )

  const quickStrip = (
    <div>
      <div className="pfp-strip" data-quick="true">
        {QUICK_FILTERS.map((f) => (
          <button key={f.key} type="button" className="pfp-exception-card"
            aria-pressed={quick === f.key}
            onClick={() => { setQuick(quick === f.key ? '' : f.key); setPage(1) }}>
            <h4>{f.label}</h4>
            <p>{f.hint}</p>
          </button>
        ))}
      </div>
      <p className="pfp-exception-note">Selecting any exception type will update the order list accordingly.</p>
    </div>
  )

  const carrierChip = (c: string, size?: 'sm') => (
    <button key={c} type="button" className="pfp-chip" data-size={size} aria-pressed={carrier === c}
      onClick={() => { setCarrier(carrier === c ? '' : c); setPage(1) }}>{c}</button>
  )

  const categoryChip = ({ label, count }: { label: CategoryFlag; count: number }, size?: 'sm') => {
    const Icon = FLAG_ICON[label]
    return (
      <button key={label} type="button" className="pfp-chip" data-size={size} aria-pressed={flag === label}
        onClick={() => { setFlag(flag === label ? '' : label); setPage(1) }}>
        <Icon size={16} />{label}<span className="pfp-chip-count">{count}</span>
      </button>
    )
  }

  const statList: [string, string][] = [
    ['Total Orders', stats.totalOrders], ['Weight', stats.weight],
    ['Volume', stats.volume], ['Pallet Spaces', stats.palletSpaces],
  ]

  return (
    <div className="pfp" data-variant={variant} style={cssVars} onClick={() => pop && setPop(null)}>
      {replica ? (
        <>
          {/* ------------------------------------------ row 0: the tab strip —
              OWNER-REQUESTED on the replica (staging has none): the Carriers-
              card chips (`.pfp-chip` / `.pfp-chip-count`), no new colour. Not
              rendered under ?fixture=staging, so pfpdiff measures staging's own
              chrome on this route. Logged in pixel-diff-log.md. */}
          {!fixture && (
            <div className="pfp-tabs" role="tablist">
              {tabs.map((t) => (
                <button key={t.key} type="button" role="tab" className="pfp-chip"
                  aria-selected={tab === t.key} aria-pressed={tab === t.key}
                  onClick={() => switchTab(t.key)}>
                  {t.label}<span className="pfp-chip-count">{tabCounts[t.key]}</span>
                </button>
              ))}
            </div>
          )}

          {/* -------------------------------------------- row 1: filters —
              staging's order, plus Merchant and Type after State */}
          <FilterLine>
            {dateControl}
            {stateControl}
            {merchantControl}
            {typeControl}
            {funnelControl}
            <ClearFilters active={filtersOn} onClick={clearAll} />
            <button type="button" className="pfp-quick" aria-pressed={quickOpen}
              onClick={() => setQuickOpen((v) => !v)}>
              <WarningCircle size={18} style={{ color: 'rgb(199, 40, 32)' }} />
              Quick Filter
              <CaretDown size={16} />
            </button>
          </FilterLine>

          {/* ------------------------------ row 2: Carriers / Categories cards */}
          {quickOpen ? quickStrip : (
            <div className="pfp-strip">
              <section className="pfp-card">
                <h3 className="pfp-card-title">Carriers</h3>
                <div className="pfp-chiprow">{carriers.map((c) => carrierChip(c))}</div>
              </section>
              <section className="pfp-card">
                <h3 className="pfp-card-title">Categories</h3>
                <div className="pfp-chiprow" data-tight="true">{categories.map((c) => categoryChip(c))}</div>
              </section>
            </div>
          )}

          {/* ------------------------------------------- row 3: list toolbar */}
          <div className="pfp-toolbar">
            {searchControl}
            {exceptionsControl}
            <div className="pfp-stats">
              {statList.map(([label, value]) => (
                <div key={label}>
                  <div className="pfp-stat-label">{label}</div>
                  <div className="pfp-stat-value">{value}</div>
                </div>
              ))}
            </div>
            <span className="pfp-hint">
              {selected.size ? `${selected.size} selected` : 'Select orders for more action'}
            </span>
            {downloadControl}
            {settingsControl}
            {selectionPanel}
          </div>
        </>
      ) : (
        <>
          {/* ---------------------------------------------------- row 1: filters */}
          <FilterLine>
            {dateControl}
            {stateControl}
            {merchantControl}
            {typeControl}
            {funnelControl}
            <ClearFilters active={filtersOn} onClick={clearAll} />

            {/* ONE toolbar row (owner request): filters left, then search and
                the icon actions on the right */}
            {searchControl}

            {/* Show / Hide cards and Quick Filter — icon-only (owner request),
                the label moves to the tooltip; pressed = the section is open */}
            <button type="button" className="pfp-iconbtn pfp-toggle" onClick={toggleStrip}
              aria-pressed={stripOpen}
              aria-label={stripOpen ? 'Hide the Carriers and Categories chips' : 'Show the Carriers and Categories chips'}
              title={stripOpen ? 'Hide carriers & categories' : 'Show carriers & categories'}>
              <GridFour size={16} />
            </button>

            <button type="button" className="pfp-iconbtn pfp-toggle" onClick={() => setQuickOpen((v) => !v)}
              aria-pressed={quickOpen} aria-label="Quick Filter" title="Quick Filter">
              <WarningCircle size={18} style={{ color: 'rgb(199, 40, 32)' }} />
            </button>

            {/* the bulk-actions affordance: disabled until rows are picked — the
                old "Select orders for more action" hint is now its tooltip */}
            <span className="pfp-iconbtn pfp-bulk" role="img" data-disabled={!selected.size || undefined}
              aria-label={selected.size ? `${selected.size} selected` : 'Select orders for more action'}
              title={selected.size ? `${selected.size} selected — actions in the panel` : 'Select orders for more action'}>
              <ListChecks size={16} />
              {selected.size > 0 && <span className="pfp-bulk-count">{selected.size}</span>}
            </span>

            {downloadControl}
            {settingsControl}
            {selectionPanel}
          </FilterLine>

          {/* ------------------------------------------ row 0: the tab strip —
              owner-requested, not on staging: the app's own underline `Tabs`
              (icons + "Label (n)"), same as /local/pickup and /local/consignments
              — an explicit owner override of the replica rule, logged in
              pixel-diff-log.md. Hidden under ?fixture=staging. */}
          {!fixture && (
            <LocalTabs
              tabs={tabs.map((t) => ({ id: t.key, label: t.label, count: tabCounts[t.key], icon: TAB_ICON[t.key] }))}
              active={tab} onChange={(id) => switchTab(id as TabKey)} />
          )}

          {/* ----------------------------------------------- row 2: the strip */}
          {quickOpen ? quickStrip : stripOpen ? (
            /* Carriers / Categories as ONE compact chip line (owner request) —
               same chips, same filters, no card boxes; scrolls within itself */
            <div className="pfp-chipbar">
              <span className="pfp-chipbar-label">Carriers:</span>
              {carriers.map((c) => carrierChip(c, 'sm'))}
              <span className="pfp-chipbar-sep" aria-hidden />
              <span className="pfp-chipbar-label">Categories:</span>
              {categories.map((c) => categoryChip(c, 'sm'))}
            </div>
          ) : null}
        </>
      )}

      {/* --------------------------------------------------------- the table */}
      <div className="pfp-tablewrap">
        <table className="pfp-table" style={{ width: TABLE_SCROLL_WIDTH }}>
          <colgroup>
            {columns.map((c) => <col key={c.key} style={{ width: c.width }} />)}
          </colgroup>
          <thead>
            <tr>
              {columns.map((c) => {
                if (c.key === '_select') {
                  return (
                    <th key={c.key}>
                      <input type="checkbox" checked={allOnPage}
                        onChange={() => setSelected((s) => {
                          const next = new Set(s)
                          if (allOnPage) pageIds.forEach((id) => next.delete(id))
                          else pageIds.forEach((id) => next.add(id))
                          return next
                        })} />
                    </th>
                  )
                }
                if (c.key === '_flags') return <th key={c.key}><ListGlyph size={20} /></th>
                if (c.key === '_pad') return <th key={c.key} />
                return (
                  <th key={c.key}>
                    <span className="pfp-th-inner">
                      {c.label}
                      {SORTABLE.has(c.key) && (
                        <span className="pfp-sort" onClick={() => setSort((s) =>
                          s?.key === c.key && s.dir === 'asc'
                            ? { key: c.key, dir: 'desc' }
                            : { key: c.key, dir: 'asc' })}>
                          <CaretUpSolid size={10} data-active={sort?.key === c.key && sort.dir === 'asc'} />
                          <CaretDownSolid size={10} data-active={sort?.key === c.key && sort.dir === 'desc'} />
                        </span>
                      )}
                      {SEARCHABLE.has(c.key) && (
                        <span className="pfp-colsearch" title={`Search ${c.label}`}>
                          <MagnifyingGlass size={16} />
                        </span>
                      )}
                    </span>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {paged.map((r) => (
              <tr key={r.id} data-selected={selected.has(r.id)}>
                {columns.map((c) => (
                  <Cell key={c.key} col={c.key} row={r}
                    selected={selected.has(r.id)}
                    onToggle={() => toggleRow(r.id)}
                    /* routed by ROW KIND — a pickup has no order id, and
                       sending its click to the consignment view gave a dead page */
                    onOpen={() => {
                      if (r.rowType !== 'Consignment') nav(`${basePath}/pickup/${r.id}${search}`)
                      else if (r.orderId) nav(`${basePath}/${r.orderId}${search}`)
                    }} />
                ))}
              </tr>
            ))}
            {paged.length === 0 && (
              <tr>
                <td colSpan={columns.length} style={{ textAlign: 'center', color: 'var(--pfp-ink-hint)' }}>
                  No orders match these filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ------------------------------------------------------------ footer */}
      <div className="pfp-footer">
        <div className="pfp-footer-left" style={{ position: 'relative' }} onClick={(e) => e.stopPropagation()}>
          <button type="button" className="pfp-pagesize" onClick={() => setPop(pop === 'pagesize' ? null : 'pagesize')}>
            {pageSize} / Page <CaretDown size={12} />
          </button>
          {pop === 'pagesize' && (
            <div className="pfp-pop" style={{ bottom: 34, left: 0, width: 120 }}>
              {[10, 20, 50, 100].map((n) => (
                <button key={n} type="button" className="pfp-pop-option"
                  onClick={() => { setPageSize(n); setPage(1); setPop(null) }}>{n} / Page</button>
              ))}
            </div>
          )}
          {/* the queue totals, moved off the toolbar into the footer (owner
              request) so they no longer cost a row — the replica keeps them
              on its toolbar, where staging has them */}
          {!replica && (
            <span className="pfp-summary"
              title={`Total Orders ${stats.totalOrders} · Weight ${stats.weight} · Volume ${stats.volume} · Pallet Spaces ${stats.palletSpaces}`}>
              {stats.totalOrders} orders · {stats.weight} · {stats.volume} · {stats.palletSpaces} pallets
            </span>
          )}
        </div>

        <nav className="pfp-pager" aria-label="Pagination">
          <button type="button" disabled={safePage === 1} onClick={() => setPage(safePage - 1)} aria-label="Previous page">
            <ChevronLeft size={20} />
          </button>
          {Array.from({ length: Math.min(5, totalPages) }, (_, i) => i + 1).map((n) => (
            <button key={n} type="button" aria-current={n === safePage ? 'page' : undefined}
              onClick={() => setPage(n)}>{n}</button>
          ))}
          <button type="button" disabled={safePage >= totalPages} onClick={() => setPage(safePage + 1)} aria-label="Next page">
            <ChevronRight size={20} />
          </button>
        </nav>

        <button type="button" className="pfp-refresh" onClick={() => { setPage(1); toast.info('Queue refreshed.') }}>
          <Refresh size={22} /> Refresh
        </button>
      </div>

      {/* ------------------------------------------------------------ popups */}
      {modal === 'schedule' && (
        <ScheduleModal rows={selectedRows} onClose={() => setModal(null)}
          onApply={(v) => { planningActions.schedule(selIds, v); done(`Delivery slot updated for ${selIds.length}.`) }} />
      )}
      {modal === 'rto' && (
        <RtoConfirmModal count={selIds.length} onClose={() => setModal(null)}
          onConfirm={() => { planningActions.initiateRto(selIds); done(`Return to origin initiated for ${selIds.length}.`) }} />
      )}
      {modal === 'plan' && (
        <PlanRouteModal rows={routable} onClose={() => setModal(null)} onApply={() => {
          const trip = planningActions.planForRouting(
            routable.map((r) => ({ orderId: r.orderId, orderNumber: r.orderNumber, address: r.address })))
          done(`${trip.stops.length} shipments planned on ${trip.id} (Un-assigned) — assign a driver in Control Tower.`)
        }} />
      )}
      {modal === 'close' && (
        <CloseConsignmentModal count={selIds.length} onClose={() => setModal(null)} onConfirm={(p) => {
          selIds.forEach((id) => growOrderActions.update(id, { status: p.mode === 'failed' ? 'Undelivered' : 'Delivered' }))
          planningActions.close(selIds, {
            outcome: p.mode === 'completed' ? 'Completed' : p.mode === 'failed' ? 'Failed' : 'Partial',
            atc: p.atc, atd: '', failureReason: '', attachments: p.attachments,
          })
          done(`${selIds.length} shipment${selIds.length === 1 ? '' : 's'} closed.`)
        }} />
      )}
      {modal === 'exception' && (
        <RaiseExceptionModal rows={selectedRows} onClose={() => setModal(null)}
          onApply={(type) => { planningActions.raiseException(selIds, type); done(`${type} exception raised on ${selIds.length}.`) }} />
      )}
      {modal === 'cancel' && (
        <CancelOrderModal rows={selectedRows} onClose={() => setModal(null)} onApply={(remarks) => {
          selIds.forEach((id) => growOrderActions.update(id, { status: 'Cancelled' }))
          planningActions.cancel(selIds, remarks)
          done(`${selIds.length} order${selIds.length === 1 ? '' : 's'} cancelled.`)
        }} />
      )}

      {modal === 'planPickup' && planHub !== null && (
        <PlanCollectionModal rows={selectedPickups} hubCode={planHub}
          hubLabel={planHub ? hubName(planHub, db.stores) : 'No inbound hub'}
          trips={plan.trips} drivers={drivers} defaultDate={planDate}
          onClose={() => setModal(null)}
          onApply={(c) => planCollections(selectedPickups, c)} />
      )}
      {modal === 'failPickup' && (
        <FailPickupModal count={selectedPickups.length} onClose={() => setModal(null)} onApply={({ code, note }) => {
          const ids = new Set(selectedPickups.map((r) => r.prId))
          selectedPickups.forEach((r) => growOrderActions.failPickupRequest(r.prId, note, code))
          /* a failure with attempts left may raise its retry at once — a new
             Requested row (attempt n+1) takes the failed one's place */
          const retries = growOrdersSnapshot().pickupRequests.filter((p) => p.parentPrId && ids.has(p.parentPrId)).length
          const n = ids.size
          done(`${n} pickup${n === 1 ? '' : 's'} marked failed.`
            + (retries ? ` ${retries} re-attempt${retries === 1 ? '' : 's'} raised and back in the queue.` : ''))
        }} />
      )}
      {modal === 'cancelPickup' && (
        <CancelPickupModal count={selectedPickups.length} onClose={() => setModal(null)} onApply={(code) => {
          selectedPickups.forEach((r) => growOrderActions.cancelPickupRequest(r.prId, code, 'Ops'))
          done(`${selectedPickups.length} pickup${selectedPickups.length === 1 ? '' : 's'} cancelled.`)
        }} />
      )}

      {/* the detail is an OVERLAY over this list, exactly as staging renders it */}
      {overlayId && <ViewConsignment basePath={basePath} />}
      {pickupOverlayId && <ViewPickup basePath={basePath} />}

    </div>
  )
}

/* ---------------------------------------------------------------- bits ----- */


/**
 * One grid cell. Every column staging renders specially — the checkbox, the flag
 * cluster, the arrow-prefixed order link, the state pill, the two inline number
 * editors, the Service Time spinner and the SKU eye — is rendered here, so the
 * table body above stays a straight map over the measured column list.
 *
 * `cells.tsx` (the configurable-column renderer) is deliberately NOT used here:
 * it renders this app's own cell grammar, and this route replicates staging's.
 */
function Cell({ col, row, selected, onToggle, onOpen }: {
  col: string; row: DisplayRow; selected: boolean; onToggle: () => void; onOpen: () => void
}) {
  if (col === '_select') {
    return <td><input type="checkbox" checked={selected} onChange={onToggle} /></td>
  }
  if (col === '_pad') return <td />
  if (col === '_flags') {
    /* Category flags only. The row KIND is the Type column's job — saying it
       twice in one row is noise, not emphasis.
     *
     * AT MOST THREE discs, with the remainder as a `+n` whose tooltip names
     * them. There are five category flags, and five 28px discs plus their gaps
     * need 188px — wider than the 160px this column was measured at, so the
     * original would have clipped a fully-flagged row silently. Capping makes
     * the cell's width independent of how many flags a row happens to carry,
     * which is what lets the column be narrow AND never lose a flag. */
    const MAX = 3
    const shown = row.flags.length > MAX ? row.flags.slice(0, MAX - 1) : row.flags
    const rest = row.flags.slice(shown.length)
    return (
      <td>
        {row.flagsDash ? '-' : (
          <span className="pfp-flags">
            {shown.map((f) => {
              const Icon = FLAG_ICON[f]
              return <span key={f} className="pfp-flag" title={f}><Icon size={18} /></span>
            })}
            {rest.length > 0 && (
              <span className="pfp-flag-more" title={rest.join(', ')}>+{rest.length}</span>
            )}
          </span>
        )}
      </td>
    )
  }

  const value = row.cells[col] ?? '-'

  if (col === 'orderNumber') {
    return (
      <td>
        <button type="button" className="pfp-order" onClick={onOpen}>
          <ArrowRight size={16} />{value}
        </button>
      </td>
    )
  }
  /* TYPE — the row-kind discriminator, first thing after the flags column.
     Tinted for a pickup so a mixed list separates at a glance; a consignment
     keeps the plain neutral tag so the ordinary case stays quiet. */
  if (col === 'orderType') {
    return (
      <td>
        <span className="pfp-typecell" title={`${row.rowType} — ${row.typeDetail}`}>
          <span className="pfp-typekind" data-kind={row.rowType === 'Consignment' ? 'consignment' : 'pickup'}>
            {/* UI copy: a consignment reads "Shipment" (owner rename) */}
            {value === 'Consignment' ? 'Shipment' : value}
          </span>
          {row.typeDetail && (
            /* the leg chain reads as a journey, so it is drawn as one */
            <span className="pfp-typedetail">{row.typeDetail.replace(/-/g, ' → ')}</span>
          )}
        </span>
      </td>
    )
  }
  if (col === 'state') return <td><span className="pfp-pill">{value}</span></td>
  if (col === 'weight' || col === 'volume') {
    return (
      <td>
        <span className="pfp-numcell">
          <input className="pfp-numinput" defaultValue={value} readOnly={!row.editable}
            style={{ width: col === 'weight' ? 122 : 106 }} />
          <NotePencil size={14} />
        </span>
      </td>
    )
  }
  if (col === 'serviceTime') {
    return (
      <td>
        <span className="pfp-numcell">
          <input className="pfp-numinput" defaultValue={value} readOnly={!row.editable} style={{ width: 108 }} />
          <span className="pfp-spinner">
            <button type="button" aria-label="Increase"><StepUp size={7} /></button>
            <button type="button" aria-label="Decrease"><StepDown size={7} /></button>
          </span>
        </span>
      </td>
    )
  }
  if (col === 'sku') {
    return (
      <td>
        <span className="pfp-numcell">{value}<Eye size={16} /></span>
      </td>
    )
  }
  return <td title={value}>{value || '-'}</td>
}

/**
 * The floating panel a selection raises, anchored top-right of the table.
 *
 * EXACTLY EIGHT CONSIGNMENT ACTIONS — staging's own list. The pickup actions
 * below them are local additions; "Send to Load Planning" is one of them for
 * PICKUP rows only (spec P4, PM decision 2026-09-24) — consignments still have
 * no such action here, as on staging.
 */
function SelectionPanel({ count, metrics, routable, profile, pickupMetrics, onClose, onAction }: {
  count: number
  metrics: { weight: number; volume: number; pallets: number }
  routable: number
  profile: {
    total: number; consignments: number; pickups: number
    forward: number; reverse: number; reserved: number; ftl: number; mixed: boolean
  }
  pickupMetrics: { orders: number; weight: number; known: boolean; approx: boolean }
  onClose: () => void
  onAction: (kind: 'schedule' | 'rto' | 'plan' | 'ready' | 'close' | 'csv' | 'exception' | 'cancel'
    | 'planPickup' | 'loadPlanPickup' | 'failPickup' | 'cancelPickup') => void
}) {
  /**
   * Each action declares HOW MANY of the selected rows it can actually act on,
   * and why the rest are out of scope. An action with nothing to act on is
   * disabled and says so on hover — the alternative, running it against the
   * eligible subset without a word, is a silent partial action.
   */
  const c = profile.consignments
  const p = profile.pickups
  const ALL: {
    key: Parameters<typeof onAction>[0]
    label: string
    icon: React.JSX.Element
    eligible: number
    /** which row kinds this action exists for at all */
    kind: 'consignment' | 'pickup' | 'both'
    scope?: string
    danger?: boolean
  }[] = [
    /* ---- consignment actions ---- */
    { key: 'schedule', label: 'Schedule', icon: <Clock size={16} />, eligible: c, kind: 'consignment',
      scope: 'A pickup is scheduled by its collection window instead.' },
    { key: 'rto', label: 'Initiate Return to Origin', icon: <RoutePath size={16} />, eligible: profile.forward,
      kind: 'consignment', scope: 'Forward consignments only — a reverse order is already returning.' },
    { key: 'ready', label: 'Mark Ready for Planning', icon: <CalendarCheck size={16} />, eligible: c, kind: 'consignment' },
    { key: 'close', label: 'Close Shipment', icon: <ListChecks size={16} />, eligible: c, kind: 'consignment' },
    { key: 'exception', label: 'Raise Exception', icon: <WarningTriangle size={16} />, eligible: c, kind: 'consignment' },
    { key: 'cancel', label: 'Cancel Order', icon: <Trash size={16} />, eligible: c, kind: 'consignment', danger: true },

    /* ---- pickup actions: a collection is a routable stop, and a booking can
            be called off or reported as failed ---- */
    { key: 'planPickup', label: 'Plan Collection For Routing', icon: <RoutePath size={16} />, eligible: p, kind: 'pickup',
      scope: 'Adds the collection as a stop on a route / trip at its hub. A routed pickup is Planned and leaves this queue.' },
    { key: 'loadPlanPickup', label: 'Send to Load Planning', icon: <Stack size={16} />, eligible: p, kind: 'pickup',
      scope: 'Puts the collection on today\'s load-plan route for its hub (Un-assigned). A 3PL pickup is skipped.' },
    { key: 'failPickup', label: 'Mark Pickup Failed', icon: <WarningTriangle size={16} />, eligible: p, kind: 'pickup',
      scope: 'Nobody turned up, or there was nothing to collect. The orders return to Ready for Pickup.' },
    { key: 'cancelPickup', label: 'Cancel Pickup', icon: <Trash size={16} />, eligible: p, kind: 'pickup', danger: true,
      scope: 'Calls the booking off. Its orders drop back to Ready for Pickup.' },

    /* ---- valid for either ---- */
    { key: 'plan', label: 'Plan For Routing', icon: <RoutePath size={16} />, eligible: routable, kind: 'consignment',
      scope: 'Shipments that are at the facility and have a delivery window.' },
    { key: 'csv', label: 'Download CSV', icon: <Download size={16} />, eligible: c, kind: 'both',
      scope: 'Exports the shipment rows — the columns are the shipment shape.' },
  ]

  /**
   * SHOW WHAT THIS SELECTION CAN DO, not everything greyed out.
   *
   * A panel whose actions are mostly disabled makes the reader work out why;
   * a panel that lists only what applies answers the question before it is
   * asked. So the list is filtered by the kinds actually selected — and only
   * when the selection is MIXED does anything stay visible-but-disabled, since
   * there the reader genuinely needs to know an action exists and why it is
   * unavailable right now.
   */
  const actions = ALL.filter((a) => {
    if (a.kind === 'both') return true
    if (profile.mixed) return true
    return a.kind === 'consignment' ? c > 0 : p > 0
  })

  return (
    <div className="pfp-panel" onClick={(e) => e.stopPropagation()}>
      <div className="pfp-panel-head">
        <span>{count} Selected</span>
        <button type="button" className="pfp-iconbtn" aria-label="Clear selection" onClick={onClose}>
          <Close size={16} />
        </button>
      </div>
      {/* what is actually selected, by type — the answer to "what am I acting on" */}
      {profile.mixed && (
        <p className="pfp-panel-breakdown">
          {profile.consignments} consignment{profile.consignments === 1 ? '' : 's'}
          {profile.reverse > 0 && ` (${profile.forward} fwd · ${profile.reverse} rev)`}
          {' · '}
          {profile.pickups} pickup{profile.pickups === 1 ? '' : 's'}
          {(profile.reserved > 0 || profile.ftl > 0)
            && ` (${[profile.reserved && `${profile.reserved} reserved`, profile.ftl && `${profile.ftl} FTL`].filter(Boolean).join(' · ')})`}
        </p>
      )}
      {/* A pickups-only selection has no consignment weight, volume or pallet
          count — that is not zero, it is not applicable, and three zeros would
          read as "this weighs nothing". Show what a booking actually measures. */}
      {profile.consignments === 0 && profile.pickups > 0 ? (
        <dl className="pfp-panel-metrics">
          <div className="pfp-panel-metric"><dt>Pickups</dt><dd>{profile.pickups}</dd></div>
          <div className="pfp-panel-metric"><dt>Orders covered</dt><dd>{pickupMetrics.orders}</dd></div>
          <div className="pfp-panel-metric">
            <dt>Weight (Kg)</dt>
            <dd>{pickupMetrics.known ? `${pickupMetrics.approx ? '~ ' : ''}${pickupMetrics.weight}` : '—'}</dd>
          </div>
        </dl>
      ) : (
        <dl className="pfp-panel-metrics">
          <div className="pfp-panel-metric"><dt>Weight (Kg)</dt><dd>{metrics.weight}</dd></div>
          <div className="pfp-panel-metric"><dt>Volume mm³</dt><dd>{metrics.volume.toLocaleString()}</dd></div>
          <div className="pfp-panel-metric"><dt>Pallet Space</dt><dd>{metrics.pallets}</dd></div>
        </dl>
      )}
      {/* totals are consignment-only by design; say so rather than let them read as the whole selection */}
      {profile.mixed && (
        <p className="pfp-panel-breakdown" data-muted="true">
          Totals cover the consignment rows only — a pickup and the orders it covers are the same
          parcels counted twice.
        </p>
      )}
      <div className="pfp-panel-actions">
        {actions.map((a) => {
          const partial = a.eligible > 0 && a.eligible < profile.total
          return (
            <button key={a.key} type="button" className="pfp-panel-action"
              data-danger={a.danger} disabled={a.eligible === 0}
              title={a.eligible === 0 ? `Nothing in this selection can be ${a.label.toLowerCase()}d. ${a.scope ?? ''}`.trim() : a.scope}
              onClick={() => onAction(a.key)}>
              {a.icon}{a.label}
              {(partial || a.key === 'plan') && <span className="pfp-panel-count">{a.eligible}</span>}
            </button>
          )
        })}
      </div>
    </div>
  )
}
