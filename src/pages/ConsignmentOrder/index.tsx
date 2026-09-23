import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  Ban, CalendarClock, Download, PackageCheck,
  Pencil, Printer, RotateCcw, Truck, X, Boxes, RefreshCw, Settings as SettingsIcon,
  ShieldAlert, Route, Handshake, AlertTriangle, Undo2, Package, MapPinned,
  Weight, Box, Hash, Layers, MoreVertical, ChevronDown,
} from 'lucide-react'
import {
  AddUpload, AdvancedFilters, Button, Checkbox, ClearFilters, EmptyState, IconButton, PageSize,
  Pagination, SearchInput, SearchSelect, StatusPill, Tabs, Tooltip, LoadingBox, ErrorBox,
} from '../../nueva/components'
import { type ConsignmentOrderRow, type ConsignmentState, type TimeWindow } from '../../data/mockData'
import {
  addConsignmentNote, BULK_SAMPLE_URL, fetchConsignmentByKey, fetchConsignmentPageConfig, fetchConsignments, fetchNotes, fetchTrackingEvents, humanizeEnum,
  type ConsignmentNote, type ConsignmentPageConfig, type LiveConsignmentRow, type TrackingEvent,
} from './api'
import BulkUploadModal from './BulkUploadModal'
import { toast } from '../../nueva/toast'
import DateRangeFilter, { shiftIso, todayIso } from '../../nueva/DateRangeFilter'
import { fetchFormBehavior, loadFormBehavior, type FormBehavior } from '../ConsignmentAdd/fieldConfig'
import { buildBulkTemplate } from './bulkTemplate'

/* Base Modules "Add Form" hidden fields → the table columns / filter dims they
 * correspond to. A field switched off in settings disappears here too. */
const HIDDEN_FIELD_COLUMNS: Record<string, string[]> = {
  referenceNumber: ['referenceNumber'],
  merchant: ['businessUnit'],
  consignmentType: ['consignmentType'],
  serviceType: ['serviceType'],
  skuWeight: ['totalWeight'],
  skuDimensions: ['totalVolume'],
}
const HIDDEN_FIELD_FILTERS: Record<string, string[]> = {
  merchant: ['businessUnit'],
  consignmentType: ['consignmentType'],
  serviceType: ['serviceType'],
  schedulingConfirmation: ['scheduling'],
}
import CloseConsignmentModal, { type ClosurePayload } from './CloseConsignmentModal'
import ModifyConsignmentModal from './ModifyConsignmentModal'
import { blankDraft, type ConsignmentDraft } from './consignmentDraft'
import DocumentsTab from './DocumentsTab'
import AttemptTab from './AttemptTab'
/* first-mile demo tabs (local pickup store, not staging) — see OveragesTab.tsx */
import { DemoTabButton, OveragesTab, PickupExceptionsTab } from './OveragesTab'
import { amberConsignments, openOverages, usePickupDb } from '../../pickup/store'

const STATE_TONE: Record<ConsignmentState, 'success' | 'info' | 'warning' | 'neutral'> = {
  Created: 'info',
  'At Facility': 'info',
  'Partial At Facility': 'info',
  Delivered: 'success',
  Exception: 'warning',
  Cancelled: 'neutral',
}

const OPEN_STATES: ConsignmentState[] = ['At Facility', 'Partial At Facility', 'Created']

/* staging: rows carrying current_error_reason live ONLY under Data Validation
   Issues — every other tab (including All) counts valid consignments only */
const hasValidationError = (r: ConsignmentOrderRow) =>
  !!(r as any).errorReason || ((r as any).exceptionFlags?.length ?? 0) > 0 || r.secondaryState === 'Address Not Found'
const TABS: { label: string; test: (r: ConsignmentOrderRow) => boolean }[] = [
  { label: 'Data Validation Issues', test: hasValidationError },
  { label: 'Active', test: (r) => !hasValidationError(r) && r.state !== 'Delivered' && r.state !== 'Cancelled' },
  { label: 'Closed', test: (r) => !hasValidationError(r) && (r.state === 'Delivered' || r.state === 'Cancelled') },
  { label: 'Exception', test: (r) => !hasValidationError(r) && r.state === 'Exception' },
  { label: 'Returns', test: (r) => !hasValidationError(r) && r.secondaryState.includes('Return') },
  { label: 'All', test: () => true },
]
const TAB_ICONS = [ShieldAlert, Route, Handshake, AlertTriangle, Undo2, Package]

// View Consignment drawer: merged Details first, then SKU, Package, and the rest
const DRAWER_TABS = ['Details', 'SKU', 'Package', 'Tracking', 'VAS', 'Attempt', 'Customer Feedback', 'Notes', 'Documents', 'Events']

/* ------------------------------------------------------------------------
 * CONFIG-DRIVEN page: columns, filters and the default date filter all come
 * from Custom Settings → Base Modules → Consignment Order (the same
 * CONSIGNMENT_MANAGEMENT settingJson staging reads). The registries below map
 * each configurable key to a label, a cell renderer and a filter accessor.
 * ---------------------------------------------------------------------- */

const raw = (r: LiveConsignmentRow) => r.raw ?? {}
const pre = (r: LiveConsignmentRow) => {
  const p = raw(r).pre_routing_details
  if (typeof p === 'string') { try { return JSON.parse(p) } catch { return {} } }
  return p ?? {}
}
const dt = (v: unknown) => (typeof v === 'string' && v ? v.slice(0, 16).replace('T', ' ') : '—')
const yesNo = (v: unknown) => (v == null ? '—' : v ? 'Yes' : 'No')
const ageDays = (r: LiveConsignmentRow) => {
  const start = raw(r).aging_start_at ?? r.createdAt
  return start ? Math.max(0, Math.floor((Date.now() - new Date(start).getTime()) / 86_400_000)) : null
}

/* staging's 5 date-filter fields → where the value lives on the row */
const DATE_FIELDS: { code: string; label: string; get: (r: LiveConsignmentRow) => string | null }[] = [
  { code: 'created_at', label: 'Created Date', get: (r) => r.createdAt },
  { code: 'ship_to_delivery_date', label: 'Delivery/Pickup Date', get: (r) => raw(r).ship_to_delivery_date ?? null },
  { code: 'ship_by_date', label: 'Ship By Date', get: (r) => raw(r).ship_by_date ?? null },
  { code: 'last_updated_at', label: 'Updated At', get: (r) => raw(r).last_updated_at ?? null },
  { code: 'dispatch_date', label: 'Last Mile Dispatch Date', get: (r) => raw(r).dispatch_date ?? pre(r)?.dispatch_date ?? null },
]
/* configured range code (-30/-15/-7/0/7) → concrete from/to dates */
const rangeFromCode = (code: number): { from: string; to: string } => {
  if (code === 0) return { from: todayIso(), to: todayIso() }
  if (code > 0) return { from: todayIso(), to: shiftIso(code) }
  return { from: shiftIso(code), to: todayIso() }
}

type ColDef = { label: string; align?: 'right'; render: (r: LiveConsignmentRow, open: () => void) => React.ReactNode }
const mono = (v: unknown) => <span className="font-mono text-[12px] text-ink-2 whitespace-nowrap">{String(v ?? '—')}</span>

/* the identity pair renders as ONE column (consignment number bold, reference
 * beneath) — hiding either half in Base Modules removes just that line */
let IDENTITY_SHOW = { consignment: true, reference: true }
export function setIdentityColumnParts(p: { consignment: boolean; reference: boolean }) { IDENTITY_SHOW = p }

const COLUMN_DEFS: Record<string, ColDef> = {
  consignmentNumber: {
    label: 'Consignment / Reference',
    render: (r, open) => (
      <button onClick={open} className="block text-left whitespace-nowrap">
        {IDENTITY_SHOW.consignment && (
          <span className="block font-mono text-[12px] font-bold text-brand-500 hover:underline">{r.consignmentNumber || '—'}</span>
        )}
        {IDENTITY_SHOW.reference && (
          <span className={`block font-mono text-[11.5px] ${IDENTITY_SHOW.consignment ? 'text-ink-3' : 'font-bold text-brand-500 hover:underline'}`}>{r.referenceNumber}</span>
        )}
      </button>
    ),
  },
  referenceNumber: {
    label: 'Reference Number',
    render: (r, open) => (
      <button onClick={open} className="font-mono text-[12px] text-brand-500 hover:underline whitespace-nowrap">{r.referenceNumber}</button>
    ),
  },
  state: { label: 'State', render: (r) => <StatusPill label={r.state} tone={STATE_TONE[r.state] ?? 'info'} /> },
  secondaryState: { label: 'Secondary State', render: (r) => <span className="text-ink-2 whitespace-nowrap">{r.secondaryState || '—'}</span> },
  exceptionState: { label: 'Exception State', render: (r) => (r.exceptionFlags.length ? r.exceptionFlags.join(' | ') : humanizeEnum(r.errorCode || raw(r).exception_state)) || '—' },
  exceptionReason: {
    label: 'Exception Reason',
    render: (r) => {
      const msg = r.errorReason || raw(r).exception_reason
      if (!msg) return '—'
      return (
        <span className="block max-w-64 truncate text-danger-fg" title={msg}>{msg}</span>
      )
    },
  },
  totalWeight: { label: 'Weight', align: 'right', render: (r) => <span className="tabular-nums whitespace-nowrap">{r.weightKg.toFixed(2)} {raw(r).total_weight_uom ?? 'kg'}</span> },
  totalVolume: { label: 'Volume', render: (r) => <span className="whitespace-nowrap">{r.volume}</span> },
  palletQuantity: { label: 'Pallet Quantity', align: 'right', render: (r) => r.palletSpaces ?? '—' },
  totalQuantity: { label: 'Total Quantity', align: 'right', render: (r) => raw(r).total_quantity ?? '—' },
  sku: { label: 'SKU', align: 'right', render: (r) => {
    const s = raw(r).sku_details
    const fj = raw(r).fixed_json
    const n = Array.isArray(s) && s.length ? s.length : Number((typeof fj === 'string' ? JSON.parse(fj || '{}') : fj)?.total_sku_quantity ?? 0)
    return n || '—'
  } },
  skuLineItemNo: { label: 'SKU Line Item No', render: (r) => { const s = raw(r).sku_details; return Array.isArray(s) && s.length ? s.map((x: any) => x.line_item_no).filter(Boolean).join(', ') || '—' : '—' } },
  skuCode: { label: 'SKU Code', render: (r) => { const s = raw(r).sku_details; return Array.isArray(s) && s.length ? s.map((x: any) => x.code).filter(Boolean).join(', ') || '—' : '—' } },
  shipByDate: { label: 'Ship By Date', render: (r) => dt(raw(r).ship_by_date).slice(0, 10) },
  shipToName: { label: 'Ship to Name', render: (r) => <span className="text-ink whitespace-nowrap">{r.shipToName || '—'}</span> },
  shipToAddress: {
    label: 'Ship To Address',
    render: (r) => {
      const a = raw(r).ship_to_address ?? {}
      const full = [[a.address_line1, a.address_line2].filter(Boolean).join(' '), a.city, a.pincode, a.state, a.country]
        .filter(Boolean).join(', ')
      return <span className="block max-w-64 truncate" title={full}>{full || '—'}</span>
    },
  },
  shipToType: { label: 'Ship To Type', render: (r) => (raw(r).ship_to_address ?? {}).type ?? '—' },
  shipToCode: { label: 'Ship To Code', render: (r) => mono(r.shipToCode || '—') },
  shipToPinCode: { label: 'Ship To Pin Code', render: (r) => <span className="tabular-nums">{r.shipToPincode || '—'}</span> },
  shipToCity: { label: 'Ship To City', render: (r) => <span className="whitespace-nowrap">{r.shipToCity || '—'}</span> },
  shipToCounty: { label: 'Ship To County', render: (r) => r.shipToCounty || '—' },
  businessUnit: { label: 'Merchant', render: (r) => <span className="whitespace-nowrap">{r.businessUnit || '—'}</span> },
  driverName: { label: 'Assigned To Driver', render: (r) => pre(r)?.driver_name ?? raw(r).lastmile_driver_name ?? '—' },
  consignmentType: { label: 'Consignment Type', render: (r) => r.consignmentType || '—' },
  createdAt: { label: 'Created At', render: (r) => <span className="text-ink-3 whitespace-nowrap">{dt(r.createdAt)}</span> },
  ageing: { label: 'Ageing (days)', align: 'right', render: (r) => { const a = ageDays(r); return a == null ? '—' : <span className={`tabular-nums ${a > 30 ? 'text-warning-fg font-bold' : ''}`}>{a}d</span> } },
  carrier: { label: 'Carrier', render: (r) => <span className="whitespace-nowrap">{r.carrier || '—'}</span> },
  tags: { label: 'Tag', render: (r) => { const t = raw(r).tags; return Array.isArray(t) && t.length ? t.join(', ') : '—' } },
  vas: { label: 'VAS', render: () => '—' },
  serviceTime: { label: 'Service Time (min)', align: 'right', render: (r) => pre(r)?.service_time ?? raw(r).service_time ?? '—' },
  orderNumber: { label: 'Order Number', render: (r) => mono(r.orderNumber) },
  dispatchDate: { label: 'Dispatch Date', render: (r) => dt(raw(r).dispatch_date ?? pre(r)?.dispatch_date).slice(0, 10) },
  routingPriority: { label: 'Routing Priority', align: 'right', render: (r) => raw(r).routing_priority ?? '—' },
  specialInstructions: { label: 'Special Instructions', render: (r) => raw(r).special_instructions ?? '—' },
  shipperCode: { label: 'Shipper Code', render: (r) => mono(raw(r).shipper_code ?? '—') },
  serviceType: { label: 'Service Type', render: (r) => r.serviceType || '—' },
  /* the four window timestamps render as ONE two-line cell — "PU start → end"
     over "DL start → end"; the separate end/pickup columns are suppressed */
  deliveryStartDateTime: { label: 'Pickup / Delivery Window', render: (r) => {
    const c = raw(r)
    const span = (a: unknown, b: unknown) => {
      if (!a && !b) return null
      const s = dt(a), e = dt(b)
      // same-day windows show the date once
      return s.slice(0, 10) === e.slice(0, 10) && e !== '—'
        ? `${s} → ${e.slice(11)}` : `${s} → ${e}`
    }
    const pu = span(c.pickup_start_date_time, c.pickup_end_date_time)
    const dl = span(c.lastmile_delivery_start_time, c.lastmile_delivery_end_time)
    if (!pu && !dl) return '—'
    return (
      <div className="whitespace-nowrap text-[12px] tabular-nums">
        {pu && <p><span className="mr-1 font-bold text-ink-3">PU</span>{pu}</p>}
        {dl && <p><span className="mr-1 font-bold text-ink-3">DL</span>{dl}</p>}
      </div>
    )
  } },
  deliveryEndDateTime: { label: 'Delivery End Time', render: (r) => dt(raw(r).lastmile_delivery_end_time) },
  deliveryAttemptCount: { label: 'Delivery Attempt Count', align: 'right', render: (r) => raw(r).lastmile_delivery_attempt_count ?? 0 },
  schedulingConfirmationRequired: { label: 'Scheduling Confirmation Required', render: (r) => yesNo(raw(r).scheduling_confirmation_required) },
  schedulingConfirmed: { label: 'Scheduling Confirmed', render: (r) => yesNo(raw(r).scheduling_confirmed) },
  originFacilityCode: { label: 'Origin Facility Code', render: (r) => mono(r.origin || '—') },
  destinationFacilityCode: { label: 'Destination Facility Code', render: (r) => mono(r.destination || '—') },
  trackingNumber: { label: 'Tracking Number', render: (r) => mono(r.shipments[0]?.trackingNumber || '—') },
}
const camelToSnake = (k: string) => k.replace(/([A-Z])/g, '_$1').toLowerCase()
const colDef = (key: string): ColDef =>
  COLUMN_DEFS[key] ?? {
    label: humanizeEnum(camelToSnake(key).toUpperCase()),
    render: (r: LiveConsignmentRow) => {
      const v = raw(r)[camelToSnake(key)]
      return v == null || v === '' ? '—' : typeof v === 'object' ? '…' : String(v)
    },
  }

/* configurable filter keys → label + row accessor (options derive from data) */
const FILTER_DIMS: Record<string, { label: string; get: (r: LiveConsignmentRow) => string }> = {
  state: { label: 'State', get: (r) => r.state },
  facility: { label: 'Facility', get: (r) => raw(r).current_facility_code ?? '' },
  origin: { label: 'Origin', get: (r) => r.origin },
  destination: { label: 'Destination', get: (r) => r.destination },
  consignmentType: { label: 'Consignment Type', get: (r) => r.consignmentType },
  businessUnit: { label: 'Merchant', get: (r) => r.businessUnit },
  routeName: { label: 'Route Name', get: (r) => pre(r)?.route_name ?? '' },
  driverName: { label: 'Driver Name', get: (r) => pre(r)?.driver_name ?? '' },
  sortCode: { label: 'Sort Code', get: (r) => raw(r).sort_code ?? '' },
  carrier: { label: 'Carrier', get: (r) => r.carrier },
  scheduling: { label: 'Scheduling', get: (r) => (raw(r).scheduling_confirmed ? 'Confirmed' : raw(r).scheduling_confirmation_required ? 'Required' : 'Not Required') },
  serviceType: { label: 'Service Type', get: (r) => r.serviceType },
}

export default function ConsignmentOrder() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  // deep link support (?q=): dispatch planning links consignment keys here —
  // pre-fill the search and, on an exact match, open the view drawer directly
  const initialQ = searchParams.get('q') ?? ''
  const [rows, setRows] = useState<LiveConsignmentRow[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [tab, setTab] = useState(1)
  /* the two demo tabs live beside the status tabs; null = the live table is shown */
  const [demoTab, setDemoTab] = useState<'overages' | 'exceptions' | null>(null)
  const pickupDb = usePickupDb()
  const overageCount = openOverages(pickupDb).length
  const amberCount = amberConsignments(pickupDb).length
  const [query, setQuery] = useState(initialQ)
  const [stateFilter, setStateFilter] = useState('')
  const [pageCfg, setPageCfg] = useState<ConsignmentPageConfig | null>(null)
  const [formBehavior, setFormBehavior] = useState<FormBehavior>(loadFormBehavior)
  useEffect(() => { fetchFormBehavior().then(setFormBehavior).catch(() => {}) }, [])
  /* page config minus whatever the Add Form settings switched off */
  const visibleCols = useMemo(() => {
    const hiddenSet = new Set(formBehavior.hidden)
    setIdentityColumnParts({
      consignment: !hiddenSet.has('consignmentNumber'),
      reference: !hiddenSet.has('referenceNumber'),
    })
    const dropped = new Set(formBehavior.hidden.flatMap((k) => HIDDEN_FIELD_COLUMNS[k] ?? []))
    const cols = (pageCfg?.columns ?? []).filter((c) => !dropped.has(c))
    // reference rides inside the identity column — no second column for it
    let out = cols.includes('consignmentNumber') ? cols.filter((c) => c !== 'referenceNumber') : cols
    // the window pair columns merge into deliveryStartDateTime's two-line cell
    if (out.includes('deliveryStartDateTime')) {
      out = out.filter((c) => !['deliveryEndDateTime', 'pickupStartDateTime', 'pickupEndDateTime'].includes(c))
    }
    return out
  }, [pageCfg, formBehavior])
  const droppedFilters = useMemo(
    () => new Set(formBehavior.hidden.flatMap((k) => HIDDEN_FIELD_FILTERS[k] ?? [])),
    [formBehavior])
  const [dateField, setDateField] = useState('created_at')
  const [dateFrom, setDateFrom] = useState(shiftIso(-7))
  const [dateTo, setDateTo] = useState(todayIso())
  const [moreValues, setMoreValues] = useState<Record<string, string[]>>({})
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [pageSize, setPageSize] = useState(10)
  const [page, setPage] = useState(1)
  const [drawerId, setDrawerId] = useState<string | null>(null)
  const [drawerTab, setDrawerTab] = useState(0)
  const [closing, setClosing] = useState(false)
  const [modifying, setModifying] = useState(false)
  const [uploading, setUploading] = useState(false)
  /* switching to a demo tab must also drop any open drawer / row selection —
     the drawer and the close/modify modals render outside the live-table guard */
  const openDemoTab = (t: 'overages' | 'exceptions') => {
    setDemoTab(t); setDrawerId(null); setSelected(new Set())
  }

  const [deepLinkFrom, setDeepLinkFrom] = useState('')

  const load = () => {
    setLoading(true)
    setLoadError(null)
    fetchConsignments()
      .then(({ rows: live }) => {
        setRows(live)
        // deep link: open the drawer when ?q= matches exactly one live row —
        // and widen the date window so the row is visible in the table too
        if (initialQ) {
          const m = live.find((r) =>
            r.consignmentNumber === initialQ || r.referenceNumber === initialQ || r.orderNumber === initialQ || r.id === initialQ)
          if (m) {
            setDrawerId(m.id)
            const created = m.createdAt?.slice(0, 10)
            if (created) setDeepLinkFrom(created)
          }
        }
      })
      .catch((e) => setLoadError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false))
  }
  useEffect(load, [])

  /* keep the widened window even if the config default lands afterwards */
  useEffect(() => {
    if (deepLinkFrom) setDateFrom((f) => (f && deepLinkFrom < f ? deepLinkFrom : f))
  }, [deepLinkFrom, pageCfg])

  /* the drawer always shows LIVE data: refetch the single record on open */
  const [liveRow, setLiveRow] = useState<LiveConsignmentRow | null>(null)
  useEffect(() => {
    setLiveRow(null)
    if (!drawerId) return
    const base = rows.find((r) => r.id === drawerId)
    const key = base?.raw?.key ?? base?.referenceNumber
    if (!key) return
    fetchConsignmentByKey(key).then((fresh) => { if (fresh) setLiveRow(fresh) }).catch(() => {})
  }, [drawerId])  // eslint-disable-line react-hooks/exhaustive-deps

  /* page config (columns/filters/date defaults) — same settingJson staging reads */
  useEffect(() => {
    fetchConsignmentPageConfig().then((cfg) => {
      setPageCfg(cfg)
      setDateField(cfg.dateAppliedOn)
      const r = rangeFromCode(cfg.selectedDateRange)
      setDateFrom(r.from); setDateTo(r.to)
    })
  }, [])

  const stateOptions = useMemo(() => {
    const states = new Set<string>()
    rows.forEach((r) => { if (r.state) states.add(r.state); if (r.secondaryState) states.add(r.secondaryState) })
    return Array.from(states)
  }, [rows])

  /* configured filter set (minus state, which has its own control), in config order */
  const cfgFilterKeys = useMemo(
    () => (pageCfg?.filters ?? []).filter((k) => k !== 'state' && FILTER_DIMS[k] && !droppedFilters.has(k)),
    [pageCfg, droppedFilters])
  const moreFilterDefs = useMemo(() =>
    cfgFilterKeys.map((k) => ({
      label: FILTER_DIMS[k].label, key: k,
      options: Array.from(new Set(rows.map((r) => FILTER_DIMS[k].get(r)).filter(Boolean))),
    })),
  [cfgFilterKeys, rows])

  /* the configured date filter, applied to whichever field is selected */
  const dateFiltered = useMemo(() => {
    const field = DATE_FIELDS.find((f) => f.code === dateField) ?? DATE_FIELDS[0]
    if (!dateFrom && !dateTo) return rows
    return rows.filter((r) => {
      const v = field.get(r)?.slice(0, 10) ?? ''
      if (!v) return false
      if (dateFrom && v < dateFrom) return false
      if (dateTo && v > dateTo) return false
      return true
    })
  }, [rows, dateField, dateFrom, dateTo])

  const counts = useMemo(() => TABS.map((t) => dateFiltered.filter(t.test).length), [dateFiltered])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return dateFiltered.filter(TABS[tab].test).filter((r) => {
      if (stateFilter && r.state !== stateFilter && r.secondaryState !== stateFilter) return false
      for (const k of cfgFilterKeys) {
        const want = moreValues[k]
        if (want?.length && !want.includes(FILTER_DIMS[k].get(r))) return false
      }
      if (!q) return true
      return [r.consignmentNumber, r.referenceNumber, r.orderNumber, r.carrier, r.destination, r.shipToName, r.shipToCity]
        .some((v) => (v ?? '').toLowerCase().includes(q))
    })
  }, [dateFiltered, tab, stateFilter, moreValues, query, cfgFilterKeys])

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const safePage = Math.min(page, totalPages)
  const visible = filtered.slice((safePage - 1) * pageSize, safePage * pageSize)
  const rangeLabel = filtered.length === 0
    ? '0 of 0'
    : `${(safePage - 1) * pageSize + 1}-${Math.min(safePage * pageSize, filtered.length)} of ${filtered.length}`

  const filtersActive = !!stateFilter || !!query || Object.values(moreValues).some((v) => v.length > 0)
  const selectedRows = rows.filter((r) => selected.has(r.id))
  const canClose = selectedRows.length > 0 && selectedRows.every((r) => OPEN_STATES.includes(r.state))
  const drawerRow = drawerId ? rows.find((r) => r.id === drawerId) ?? null : null

  const allVisibleChecked = visible.length > 0 && visible.every((r) => selected.has(r.id))
  const toggleAll = () => setSelected((s) => {
    const next = new Set(s)
    if (allVisibleChecked) visible.forEach((r) => next.delete(r.id))
    else visible.forEach((r) => next.add(r.id))
    return next
  })
  const toggleRow = (id: string) => setSelected((s) => {
    const next = new Set(s)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })

  const clearFilters = () => {
    setStateFilter(''); setQuery(''); setMoreValues({}); setPage(1)
    // date resets to the CONFIGURED default (staging never goes date-less)
    if (pageCfg) {
      setDateField(pageCfg.dateAppliedOn)
      const r = rangeFromCode(pageCfg.selectedDateRange)
      setDateFrom(r.from); setDateTo(r.to)
    }
  }

  const applyClosure = (payload: ClosurePayload) => {
    const ids = new Set(selected)
    setRows((prev) => prev.map((r) => {
      if (!ids.has(r.id)) return r
      const state: ConsignmentState = payload.mode === 'failed' ? 'Exception' : 'Delivered'
      const secondaryState = payload.mode === 'failed'
        ? 'Delivery Failed'
        : payload.mode === 'partial' ? 'Completed Partially' : 'Closed'
      return {
        ...r,
        state,
        secondaryState,
        shipments: r.shipments.map((s) => {
          const outcome = payload.shipmentOutcomes?.[s.id]
          if (outcome) return { ...s, outcome }
          if (payload.mode === 'completed') return { ...s, outcome: 'Completed' as const }
          if (payload.mode === 'failed') return { ...s, outcome: 'Failed' as const }
          return s
        }),
        attachments: [...r.attachments, ...payload.attachments],
        closure: {
          outcome: payload.mode === 'completed' ? 'Completed' as const : payload.mode === 'failed' ? 'Failed' as const : 'Partial' as const,
          atc: payload.atc,
          atd: payload.atd,
          failureReason: payload.failureReason,
        },
      }
    }))
    const first = selectedRows[0]
    setClosing(false)
    setSelected(new Set())
    if (first) { setDrawerId(first.id); setDrawerTab(DRAWER_TABS.indexOf('Documents')) }
  }

  return (
    <div className="fe-nueva bg-canvas min-h-full p-5">
      {/* tab row first — the filters sit one level UNDER the tabs */}
      <div className="mb-3 flex items-end gap-3">
        <div className="flex-1 min-w-0 flex items-stretch overflow-x-auto">
          <div className="min-w-0">
            <Tabs
              tabs={TABS.map((t, i) => `${t.label}: ${counts[i]}`)}
              icons={TAB_ICONS}
              active={demoTab ? -1 : tab}
              onChange={(i) => { setDemoTab(null); setTab(i); setPage(1) }}
            />
          </div>
          {/* demo tabs, appended after the status tabs — same underline strip */}
          <div className="flex grow shrink-0 items-center gap-1 border-b border-line">
            <DemoTabButton kind="overages" count={overageCount}
              active={demoTab === 'overages'} onClick={() => openDemoTab('overages')} />
            <DemoTabButton kind="exceptions" count={amberCount}
              active={demoTab === 'exceptions'} onClick={() => openDemoTab('exceptions')} />
          </div>
        </div>
        <div className="flex items-center gap-1.5 pb-1 shrink-0">
          <IconButton icon={<RefreshCw size={15} />} title="Refresh" onClick={load} />
          <IconButton icon={<Download size={15} />} title="Download bulk template"
            onClick={() => {
              const a = document.createElement('a')
              if (formBehavior.hidden.length) {
                // fields switched off in Base Modules leave the template too
                a.href = URL.createObjectURL(buildBulkTemplate(formBehavior.hidden))
              } else {
                a.href = BULK_SAMPLE_URL
              }
              a.download = 'consignment_bulk_template.xlsx'
              document.body.appendChild(a); a.click(); a.remove()
            }} />
          <IconButton icon={<SettingsIcon size={15} />} title="Consignment Order settings"
            onClick={() => navigate('/console/settings/base-modules/consignment_order')} />
        </div>
      </div>

      {demoTab === 'overages' && <OveragesTab />}
      {demoTab === 'exceptions' && <PickupExceptionsTab />}

      {!demoTab && (<>
      {/* single-line toolbar, Masters-style: filters left, actions right.
          NOTE: no overflow-x-auto here — it would clip the date-range popover */}
      <div className="flex flex-nowrap items-center gap-2 mb-3">
        {/* staging's date filter: range control → popover with the 5 date-field
            buttons, dual-month range calendar and preset chips */}
        <DateRangeFilter
          value={{ field: dateField, from: dateFrom, to: dateTo }}
          fields={DATE_FIELDS.map(({ code, label }) => ({ code, label }))}
          onApply={(v) => { setDateField(v.field); setDateFrom(v.from); setDateTo(v.to); setPage(1) }}
        />
        <SearchSelect className="w-48 shrink-0" label="State/Secondary State" value={stateFilter}
          options={stateOptions} onChange={(v) => { setStateFilter(v); setPage(1) }} />
        {/* every other configured filter: two-pane panel — dimensions left,
            searchable multi-select values right */}
        <AdvancedFilters defs={moreFilterDefs} values={moreValues}
          onChange={(k, vals) => { setMoreValues((m) => ({ ...m, [k]: vals })); setPage(1) }} />
        <ClearFilters active={filtersActive} onClick={clearFilters} />
        <div className="ml-auto flex items-center gap-2 shrink-0">
          <div className="w-52">
            <SearchInput value={query} placeholder="Search consignments"
              onChange={(v) => { setQuery(v); setPage(1) }} />
          </div>
          {/* Masters-style split button: Add + upload segment (Add/Update via Excel) */}
          <AddUpload
            onAdd={() => navigate('/console/order-management/consignment-order/add')}
            onUpload={() => setUploading(true)}
          />
        </div>
      </div>

      {loading ? <LoadingBox label="Loading consignments…" /> : loadError ? (
        <ErrorBox error={loadError} onRetry={load} hint="The consignment read rides the staging session — sign in again if it expired." />
      ) : (
      <div className="relative">
        <div className="bg-surface border border-line rounded-md overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              {/* Columns are DRIVEN by Custom Settings → Base Modules → Consignment
                  Order → Table Configuration: show/hide + sequence come from the
                  CONSIGNMENT_MANAGEMENT settingJson, exactly like staging. */}
              <thead>
                <tr className="border-b border-line bg-thead">
                  <th className="w-10 px-4 py-2.5 text-left"><Checkbox checked={allVisibleChecked} onChange={toggleAll} /></th>
                  {visibleCols.map((key) => {
                    const def = colDef(key)
                    return (
                      <th key={key} className={`px-4 py-2.5 font-bold text-ink whitespace-nowrap ${def.align === 'right' ? 'text-right' : 'text-left'}`}>
                        {def.label}
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody>
                {visible.map((r) => {
                  const isSel = selected.has(r.id)
                  const open = () => { setDrawerId(r.id); setDrawerTab(0) }
                  return (
                    <tr key={r.id} className={`border-b border-line last:border-0 transition-colors ${isSel ? 'bg-brand-50' : 'hover:bg-warm-50'}`}>
                      <td className="px-4 py-3"><Checkbox checked={isSel} onChange={() => toggleRow(r.id)} /></td>
                      {visibleCols.map((key) => {
                        const def = colDef(key)
                        return (
                          <td key={key} className={`px-4 py-3 text-ink-2 ${def.align === 'right' ? 'text-right' : ''}`}>
                            {def.render(r, open)}
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
                {visible.length === 0 && (
                  <tr><td colSpan={visibleCols.length + 1} className="px-4 py-16 text-center text-ink-3">No records found</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {selected.size > 0 && (
          <SelectionPanel
            count={selected.size}
            canClose={canClose}
            onClear={() => setSelected(new Set())}
            onCloseConsignment={() => setClosing(true)}
            onModify={() => setModifying(true)}
          />
        )}
      </div>
      )}

      {uploading && (
        <BulkUploadModal onClose={() => setUploading(false)} onUploaded={load} />
      )}

      <div className="flex items-center justify-between gap-3">
        <div className="flex-1"><Pagination page={safePage} total={totalPages} range={rangeLabel} onChange={setPage} /></div>
        <div className="pt-3"><PageSize value={pageSize} onChange={(n) => { setPageSize(n); setPage(1) }} /></div>
      </div>
      </>)}

      {modifying && selectedRows.length > 0 && (
        <ModifyConsignmentModal
          count={selectedRows.length}
          initial={draftFromRow(selectedRows[0])}
          onClose={() => setModifying(false)}
          onConfirm={() => setModifying(false)}
        />
      )}

      {closing && (
        <CloseConsignmentModal
          shipments={selectedRows.flatMap((r) => r.shipments)}
          onClose={() => setClosing(false)}
          onConfirm={applyClosure}
        />
      )}

      {drawerRow && (
        <DetailDrawer row={liveRow ?? drawerRow} tab={drawerTab} onTab={setDrawerTab} onClose={() => setDrawerId(null)}
          onAction={(a) => {
            const r = liveRow ?? drawerRow
            if (a === 'modify') { setSelected(new Set([drawerRow.id])); setModifying(true) }
            else if (a === 'close') { setSelected(new Set([drawerRow.id])); setClosing(true) }
            else if (a === 'print') {
              const pkgs: any[] = (r as any).raw?.package_details ?? []
              const url = pkgs.map((p) => p.label_url ?? p.tracking_details?.[0]?.label).find(Boolean)
              if (url) window.open(url, '_blank')
              else toast.error('No label available for this consignment yet.')
            } else if (a === 'csv') {
              const cols = visibleCols
              const head = cols.map((k) => colDef(k).label).join(',')
              const vals = cols.map((k) => JSON.stringify(String((r as any).raw?.[camelToSnake(k)] ?? ''))).join(',')
              const blob = new Blob([head + '\n' + vals + '\n'], { type: 'text/csv' })
              const aEl = document.createElement('a')
              aEl.href = URL.createObjectURL(blob)
              aEl.download = `${r.referenceNumber}.csv`
              document.body.appendChild(aEl); aEl.click(); aEl.remove()
            } else {
              toast.info('This action is not wired to staging yet.')
            }
          }} />
      )}
    </div>
  )
}

/* Merges staging's four time columns (Pickup Start/End Time, Delivery Start/End
   Time) into one compact two-line cell: "PU 28 Jul · 08:00–11:00" over
   "DL 29 Jul · 12:00–16:00". Same-day windows show the date once; cross-day
   windows show both ends in full; a missing window renders an em dash. The
   original four raw timestamps stay available in the cell tooltip. */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function fmtWindow(w: TimeWindow): string {
  const [ds, ts] = w.start.split(' ')
  const [de, te] = w.end.split(' ')
  const day = (iso: string) => {
    const [, m, d] = iso.split('-')
    return `${Number(d)} ${MONTHS[Number(m) - 1]}`
  }
  return ds === de ? `${day(ds)} · ${ts}–${te}` : `${day(ds)} ${ts} → ${day(de)} ${te}`
}

export function WindowCell({ pickup, delivery }: { pickup: TimeWindow | null; delivery: TimeWindow | null }) {
  const tooltip = [
    `Pickup: ${pickup ? `${pickup.start} – ${pickup.end}` : 'not scheduled'}`,
    `Delivery: ${delivery ? `${delivery.start} – ${delivery.end}` : 'not scheduled'}`,
  ].join('\n')
  const line = (word: string, dot: string, w: TimeWindow | null) => (
    <div className="flex items-center gap-1.5 whitespace-nowrap leading-tight">
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${w ? dot : 'bg-warm-300'}`} />
      <span className="w-[52px] shrink-0 text-[11px] text-ink-3">{word}</span>
      <span className={`text-[12px] tabular-nums ${w ? 'text-ink-2' : 'text-warm-400'}`}>
        {w ? fmtWindow(w) : 'Not scheduled'}
      </span>
    </div>
  )
  return (
    <div className="space-y-1" title={tooltip}>
      {line('Pickup', 'bg-info-fg', pickup)}
      {line('Delivery', 'bg-success-fg', delivery)}
    </div>
  )
}

/** Seed the modal from a list row; unknown fields stay blank rather than being invented. */
/* Modify opens PRE-FILLED: everything the list read knows about the row lands
 * in the draft (the earlier version only carried the two identifiers). */
function draftFromRow(r: ConsignmentOrderRow): ConsignmentDraft {
  const d = blankDraft()
  const c = (r as LiveConsignmentRow).raw ?? {}
  const s = (v: unknown) => (v == null ? '' : String(v))
  d.referenceNumber = r.referenceNumber
  d.consignmentNumber = r.consignmentNumber
  d.consignmentType = humanizeEnum(s(c.consignment_type_name ?? c.consignment_type)) || d.consignmentType
  d.shipByDate = s(c.ship_by_date).slice(0, 10)
  d.labelFormat = s(c.label_format) || d.labelFormat
  d.serviceType = humanizeEnum(s(c.service_type)) || d.serviceType
  d.tags = Array.isArray(c.tags) ? (c.tags as unknown[]).join(', ') : s(c.tags)
  d.schedulingConfirmationRequired = !!c.scheduling_confirmation_required
  d.dedicateTruck = !!(c.dedicated_truck ?? c.dedicate_truck)
  d.clearanceRequired = !!c.clearance_required
  d.totalLoadingTime = c.total_loading_time != null ? s(c.total_loading_time) : ''
  d.specialInstructions = s(c.special_instructions)
  d.category = {
    fourPerson: !!c.four_person, stackable: !!c.stackable, fragile: !!c.fragile,
    vip: !!c.vip, hazmat: !!c.hazmat, heavyWeight: !!c.heavy_weight,
  }
  const addr = (a: Record<string, unknown> | undefined | null) => ({
    name: s(a?.name), companyName: s(a?.company_name), email: s(a?.email),
    countryCode: '', contactNumber: s(a?.contact_number),
    line1: s(a?.line_1 ?? a?.line1 ?? a?.address_line1),
    line2: s(a?.line_2 ?? a?.line2 ?? a?.address_line2),
    line3: s(a?.line_3 ?? a?.line3 ?? a?.address_line3),
    landmark: s(a?.landmark), county: s(a?.county), city: s(a?.city),
    state: s(a?.state), postalCode: s(a?.pincode ?? a?.postal_code),
    country: s(a?.country), floorNumber: s(a?.floor_number), liftAvailable: !!a?.lift_available,
  })
  d.shipTo = addr(c.ship_to_address as Record<string, unknown>)
  d.shipFrom = addr(c.ship_from_address as Record<string, unknown>)
  const skus = Array.isArray(c.sku_details) ? c.sku_details as Record<string, unknown>[] : []
  d.skus = skus.map((k) => ({
    lineItemNo: s(k.line_item_no ?? k.lineItemNo), code: s(k.code), name: s(k.name),
    description: s(k.description), imageUrl: s(k.image_url), hsnCode: s(k.hsn_name ?? k.hsn_code),
    category: s(k.category), uom: s(k.uom) || 'CM', weightUom: s(k.weight_uom) || 'KG',
    quantity: s(k.quantity), unitCost: s(k.unit_cost ?? k.unit_price),
    weight: s(k.weight), length: s(k.length), width: s(k.breadth ?? k.width), height: s(k.height),
  }))
  const vasRows = Array.isArray(c.vas) ? c.vas as Record<string, unknown>[] : []
  d.vas = vasRows.map((v) => ({
    level: s(v.vas_added_level) || 'SKU',
    skuLineItemNo: Array.isArray(v.id) ? s((v.id as unknown[])[0]) : '',
    service: s(v.name ?? v.vas_code),
    serviceTime: v.service_time != null ? s(v.service_time) : '0',
    remark: s(v.remarks),
  }))
  const pkgs = Array.isArray(c.package_details) ? c.package_details as Record<string, unknown>[] : []
  d.packages = pkgs.map((p) => {
    const dim = (p.dimension ?? {}) as Record<string, unknown>
    return {
      packageId: s(p.id), trackingNumber: s(p.tracking_number), type: s(p.type),
      description: s(p.description), quantity: s(p.quantity ?? 1),
      weight: s(dim.weight ?? p.weight), length: s(dim.length ?? p.length),
      width: s(dim.width ?? dim.breadth ?? p.width), height: s(dim.height ?? p.height),
      palletSpace: s(p.pallet_space), dimensionUom: s(dim.uom ?? p.dimension_uom),
      weightUom: s(dim.weight_uom ?? p.weight_uom), contents: [],
    }
  })
  return d
}

function SelectionPanel({ count, canClose, onClear, onCloseConsignment, onModify }: {
  count: number; canClose: boolean; onClear: () => void; onCloseConsignment: () => void
  onModify: () => void
}) {
  const actions = [
    { label: 'Modify Consignment Details', icon: <Pencil size={14} /> },
    { label: 'Schedule', icon: <CalendarClock size={14} /> },
    { label: 'Initiate Return to Origin', icon: <RotateCcw size={14} /> },
    { label: 'Modify Carrier', icon: <Truck size={14} /> },
    { label: 'Print Label', icon: <Printer size={14} /> },
    { label: 'Download CSV', icon: <Download size={14} /> },
  ]
  return (
    <div className="absolute right-4 top-14 z-20 w-[248px] bg-surface border border-line rounded-xl shadow-ds-overlay overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-line">
        <span className="text-[13px] font-bold text-ink">{count} Selected</span>
        <button onClick={onClear} className="text-ink-3 hover:text-ink"><X size={14} /></button>
      </div>
      <div className="flex flex-col py-1.5">
        {actions.slice(0, 5).map((a) => (
          <button
            key={a.label}
            onClick={a.label === 'Modify Consignment Details' ? onModify : undefined}
            className="flex items-center gap-2.5 px-4 py-2 text-left text-[13px] text-ink hover:bg-warm-50">
            <span className="text-ink-3">{a.icon}</span>{a.label}
          </button>
        ))}
        {canClose ? (
          <button onClick={onCloseConsignment} className="flex items-center gap-2.5 px-4 py-2 text-left text-[13px] text-ink hover:bg-warm-50">
            <span className="text-ink-3"><PackageCheck size={14} /></span>Close Consignment
          </button>
        ) : (
          <Tooltip text="Only consignments at facility or created can be closed" side="bottom">
            <button disabled className="w-full flex items-center gap-2.5 px-4 py-2 text-left text-[13px] text-warm-400 cursor-not-allowed">
              <span><PackageCheck size={14} /></span>Close Consignment
            </button>
          </Tooltip>
        )}
        {actions.slice(5).map((a) => (
          <button key={a.label} className="flex items-center gap-2.5 px-4 py-2 text-left text-[13px] text-ink hover:bg-warm-50">
            <span className="text-ink-3">{a.icon}</span>{a.label}
          </button>
        ))}
        <button className="flex items-center gap-2.5 px-4 py-2 text-left text-[13px] text-brand-500 hover:bg-warm-50">
          <span><Ban size={14} /></span>Cancel Consignment
        </button>
      </div>
    </div>
  )
}

export type DrawerAction = 'modify' | 'schedule' | 'rto' | 'carrier' | 'print' | 'csv' | 'close'

export function DetailDrawer({ row, tab, onTab, onClose, onAction }: {
  row: ConsignmentOrderRow; tab: number; onTab: (i: number) => void; onClose: () => void
  onAction?: (a: DrawerAction) => void
}) {
  return (
    <div className="fixed inset-0 z-40 fe-nueva">
      <div className="absolute inset-0 bg-warm-900/30" onClick={onClose} />
      <aside className="absolute right-0 top-0 h-full w-[65%] bg-surface shadow-ds-overlay flex flex-col">
        <DrawerHeader row={row} onClose={onClose} onAction={onAction} />
        <div className="px-6 pt-1">
          <Tabs
            tabs={DRAWER_TABS.map((t) => t === 'Documents' && row.attachments.length ? `Documents (${row.attachments.length})` : t)}
            active={tab} onChange={onTab} size="sm"
          />
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5 bg-warm-25/40">
          {DRAWER_TABS[tab] === 'Details' && <DetailsTab row={row} />}
          {DRAWER_TABS[tab] === 'Package' && <RawPackagesTab row={row} mode="package" />}
          {DRAWER_TABS[tab] === 'Tracking' && <TrackingInfoTab row={row} />}
          {DRAWER_TABS[tab] === 'Events' && <EventsTab row={row} />}
          {DRAWER_TABS[tab] === 'SKU' && <RawSkuTab row={row} />}
          {DRAWER_TABS[tab] === 'Attempt' && <AttemptTab row={row} />}
          {DRAWER_TABS[tab] === 'Documents' && <DocumentsTab attachments={row.attachments} />}
          {DRAWER_TABS[tab] === 'Notes' && <NotesTab row={row} />}
          {DRAWER_TABS[tab] === 'VAS' && <VasTab row={row} />}
          {DRAWER_TABS[tab] === 'Customer Feedback' && (
            <EmptyState
              icon={<Boxes size={40} />}
              title="No Customer Feedback Details"
              hint="This section is populated once the carrier starts reporting events for the consignment."
            />
          )}
        </div>
      </aside>
    </div>
  )
}

/* ---- real-data drawer tabs (driven by the raw GraphQL consignment record) ---- */

const rawOf = (row: ConsignmentOrderRow): Record<string, any> => (row as any).raw ?? {}
const parseJson = (v: unknown) => { if (typeof v !== 'string') return v; try { return JSON.parse(v) } catch { return v } }
const KEY_LABELS: Record<string, string> = {
  business_unit: 'Merchant', consignment_type_name: 'Consignment Type', shipper_code: 'Shipper Code',
}
const prettyKey = (k: string) => KEY_LABELS[k] ?? k.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())

function KV({ items }: { items: [string, any][] }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-3">
      {items.map(([k, v]) => (
        <div key={k}>
          <div className="text-[12.5px] font-bold text-ink">{prettyKey(k)}</div>
          <div className="text-[13px] text-ink mt-0.5 break-words">
            {v === null || v === undefined || v === '' ? '—'
              : typeof v === 'boolean' ? (v ? 'Yes' : 'No')
              : String(v)}
          </div>
        </div>
      ))}
    </div>
  )
}

const FLAG_KEYS = ['hazmat', 'fragile', 'vip', 'stackable', 'four_person', 'heavy_weight', 'scannable', 'splittable', 'dedicated_truck', 'is_hyperlocal'] as const

function DrawerSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border border-line rounded-lg overflow-hidden">
      <div className="px-4 py-2 bg-warm-50 border-b border-line text-[12px] font-bold uppercase tracking-wide text-ink-2">{title}</div>
      <div className="px-4 py-3.5">{children}</div>
    </div>
  )
}

/* ---- drawer header: identity line + shipment/type/tag chips ---- */

function DrawerHeader({ row, onClose, onAction }: {
  row: ConsignmentOrderRow; onClose: () => void; onAction?: (a: DrawerAction) => void
}) {
  const navigate = useNavigate()
  const [menu, setMenu] = useState(false)
  const c = rawOf(row)
  const canClose = OPEN_STATES.includes(row.state)
  const act = (a: DrawerAction) => { setMenu(false); onAction?.(a) }
  /* identical option set to the table's selection panel */
  const MENU: { a: DrawerAction; label: string; icon: React.ReactNode; disabled?: boolean }[] = [
    { a: 'modify', label: 'Modify Consignment Details', icon: <Pencil size={14} /> },
    { a: 'schedule', label: 'Schedule', icon: <CalendarClock size={14} /> },
    { a: 'rto', label: 'Initiate Return to Origin', icon: <RotateCcw size={14} /> },
    { a: 'carrier', label: 'Modify Carrier', icon: <Truck size={14} /> },
    { a: 'print', label: 'Print Label', icon: <Printer size={14} /> },
    { a: 'csv', label: 'Download CSV', icon: <Download size={14} /> },
    { a: 'close', label: 'Close Consignment', icon: <PackageCheck size={14} />, disabled: !canClose },
  ]
  const flags = FLAG_KEYS.filter((k) => !!c[k])
  const tags: string[] = Array.isArray(parseJson(c.tags)) ? parseJson(c.tags) : []
  const typeName = humanizeEnum(c.consignment_type_name ?? c.consignment_type)
  return (
    <div className="px-6 pt-5 pb-3.5 border-b border-line">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5 flex-wrap">
            <h3 className="font-mono text-[17px] font-bold text-ink">{row.consignmentNumber || row.referenceNumber}</h3>
            <StatusPill label={row.state} tone={STATE_TONE[row.state] ?? 'info'} />
            {row.secondaryState && <span className="text-[12.5px] text-ink-3">{row.secondaryState}</span>}
          </div>
          <p className="text-[12.5px] text-ink-3 mt-1 font-mono">
            Ref {row.referenceNumber}{row.orderNumber && row.orderNumber !== row.referenceNumber ? ` · Order ${row.orderNumber}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={() => navigate(`/console/order-management/consignment-order/${encodeURIComponent(row.referenceNumber)}/edit`)}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-warm-300 text-[12.5px] font-bold text-ink-2 hover:bg-warm-50 hover:text-ink transition-colors">
            <Pencil size={12} />Edit
          </button>
          {c.ci_url && (
            <a href={c.ci_url} target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-brand-500 text-[12.5px] font-bold text-brand-500 hover:bg-brand-50 transition-colors">
              <MapPinned size={13} />Track
            </a>
          )}
          {/* 3-dot menu: the same actions the table's multi-select offers */}
          <div className="relative">
            <button onClick={() => setMenu((v) => !v)} aria-label="Consignment actions"
              className={`h-8 w-8 inline-flex items-center justify-center rounded-md border transition-colors
                ${menu ? 'border-brand-500 text-brand-500 bg-brand-50' : 'border-warm-300 text-ink-2 hover:bg-warm-50'}`}>
              <MoreVertical size={15} />
            </button>
            {menu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setMenu(false)} />
                <div className="absolute right-0 top-9 z-50 w-60 bg-surface border border-line rounded-xl shadow-ds-overlay py-1.5">
                  {MENU.map((m) => (
                    <button key={m.a} disabled={m.disabled} onClick={() => act(m.a)}
                      className={`w-full flex items-center gap-2.5 px-4 py-2 text-left text-[13px] transition-colors
                        ${m.disabled ? 'text-warm-400 cursor-not-allowed' : 'text-ink hover:bg-warm-50'}`}>
                      <span className={m.disabled ? 'text-warm-300' : 'text-ink-3'}>{m.icon}</span>{m.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
          <button onClick={onClose} className="h-8 w-8 inline-flex items-center justify-center rounded-md text-ink-3 hover:text-ink hover:bg-warm-100 transition-colors"><X size={17} /></button>
        </div>
      </div>
      {/* shipment chips: type · service · merchant, then attribute flags + tags */}
      <div className="mt-2.5 flex items-center gap-1.5 flex-wrap">
        {typeName && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 border border-brand-200 px-2.5 py-0.5 text-[11.5px] font-bold text-brand-600">
            <Route size={11} />{typeName}
          </span>
        )}
        {c.service_type && (
          <span className="rounded-full bg-warm-100 border border-warm-200 px-2.5 py-0.5 text-[11.5px] text-ink-2">{c.service_type}</span>
        )}
        {c.business_unit && (
          <span className="rounded-full bg-warm-100 border border-warm-200 px-2.5 py-0.5 text-[11.5px] text-ink-2">{c.business_unit}</span>
        )}
        {flags.map((f) => (
          <StatusPill key={f} label={prettyKey(f)} tone={f === 'hazmat' ? 'warning' : 'info'} />
        ))}
        {tags.map((t) => (
          <span key={t} className="inline-flex items-center gap-1 rounded-full border border-dashed border-warm-300 px-2.5 py-0.5 text-[11.5px] text-ink-3">
            #{t}
          </span>
        ))}
      </div>
    </div>
  )
}

/* ---- merged Details tab: at-a-glance summary + full record, one place ---- */

function AddressCard({ eyebrow, a, accent, party, tz, planned }: {
  eyebrow: string; a: Record<string, any>; accent?: boolean
  party: 'from' | 'to'; tz?: string; planned?: string
}) {
  const [expanded, setExpanded] = useState(false)
  const line = [a.address_line1, a.address_line2, a.address_line3].filter(Boolean).join(' ')
  const cityLine = [a.city, a.state, a.pincode].filter(Boolean).join(', ')
  /* the fields NOT already visible in the collapsed card */
  const extra: [string, any][] = [
    ['Address Type', a.type],
    ['Email', a.email],
    ['Secondary Contact', a.secondary_contact_number],
    ['Landmark', a.landmark],
    ['Suburb / County', a.county],
    [party === 'from' ? 'Planned Pickup' : 'Planned Delivery', planned ? String(planned).slice(0, 16).replace('T', ' ') : null],
    ['Timezone', tz],
    ['Lat, Long', a.latitude || a.longitude ? `${a.latitude}, ${a.longitude}` : null],
    ['Floor Number', a.floor_number],
    ['Lift Available', a.lift_available],
  ]
  return (
    <div className={`flex-1 min-w-0 rounded-lg border p-4 ${accent ? 'border-brand-200 bg-brand-50/40' : 'border-line bg-surface'}`}>
      <div className="text-[10.5px] font-black uppercase tracking-[0.08em] text-ink-3 mb-1.5">{eyebrow}</div>
      <div className="text-[14px] font-bold text-ink truncate">{a.name || a.company_name || '—'}</div>
      {a.company_name && a.name && <div className="text-[12px] text-ink-3 truncate">{a.company_name}</div>}
      <div className="text-[12.5px] text-ink-2 mt-1.5 leading-relaxed">
        {line && <div className="truncate" title={line}>{line}</div>}
        {cityLine && <div>{cityLine}{a.country ? `, ${a.country}` : ''}</div>}
      </div>
      {(a.contact_number || a.code) && (
        <div className="mt-2 flex items-center gap-2 flex-wrap text-[11.5px]">
          {a.code && <span className="rounded-full bg-warm-100 border border-warm-200 px-2 py-0.5 font-mono text-ink-2">{a.code}</span>}
          {a.contact_number && <span className="text-ink-3">{a.contact_number}</span>}
        </div>
      )}
      {/* the rest of the inventory lives behind the expander */}
      {expanded && (
        <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2.5 border-t border-line/70 pt-3 animate-[accordion-in_.15s_ease-out]">
          {extra.map(([label, v]) => (
            <div key={label}>
              <div className="text-[12.5px] font-bold text-ink">{label}</div>
              <div className="text-[12.5px] text-ink mt-0.5 break-words">
                {v === null || v === undefined || v === '' ? '—' : typeof v === 'boolean' ? (v ? 'Yes' : 'No') : String(v)}
              </div>
            </div>
          ))}
        </div>
      )}
      <button onClick={() => setExpanded((v) => !v)}
        className="mt-2.5 text-[11.5px] font-bold text-brand-500 hover:text-brand-600 transition-colors">
        {expanded ? 'Hide details ⌃' : 'Expand details ⌄'}
      </button>
    </div>
  )
}

function Metric({ label, value, icon: Icon }: { label: string; value: React.ReactNode; icon: any }) {
  return (
    <div className="flex-1 min-w-[104px] rounded-lg border border-line bg-surface px-3 py-2.5 flex items-center gap-2.5">
      <span className="h-8 w-8 shrink-0 rounded-md bg-brand-50 text-brand-500 inline-flex items-center justify-center"><Icon size={15} /></span>
      <div className="min-w-0 text-left">
        <div className="text-[15px] font-black text-ink tabular-nums leading-tight">{value}</div>
        <div className="text-[10.5px] text-ink-3 mt-0.5 truncate">{label}</div>
      </div>
    </div>
  )
}


function DetailsTab({ row }: { row: ConsignmentOrderRow }) {
  const c = rawOf(row)
  const pick = (keys: string[]): [string, any][] => keys.filter((k) => k in c && c[k] !== null && c[k] !== '').map((k) => [k, c[k]])
  const flags = FLAG_KEYS.filter((k) => !!c[k])
  const err = c.current_error_reason
  const from = parseJson(c.ship_from_address) ?? {}
  const to = parseJson(c.ship_to_address) ?? {}
  const pkgs = parseJson(c.package_details)
  const skus = parseJson(c.sku_details)
  const nPkgs = Array.isArray(pkgs) ? pkgs.length : 0
  const nSkus = Array.isArray(skus) ? skus.length : 0
  return (
    <div className="space-y-4">
      {err && (
        <div className="rounded-lg border border-danger-fg/25 bg-danger-bg px-4 py-3">
          <div className="text-[12.5px] font-bold text-danger-fg mb-0.5">
            Validation failed{c.current_error_code ? ` (${c.current_error_code})` : ''}
          </div>
          <div className="text-[13px] text-danger-fg/90">{err}</div>
        </div>
      )}

      {/* journey: ship from → carrier → ship to */}
      <div className="rounded-xl border border-line bg-surface p-4 shadow-ds-1">
        <div className="flex items-stretch gap-3">
          <AddressCard eyebrow="Ship From" a={from} party="from"
            tz={c.ship_from_timezone} planned={c.pickup_start_date_time ?? c.planned_pickup_date_time} />
          <div className="flex flex-col items-center justify-center gap-1.5 px-1 shrink-0">
            <span className="h-8 w-8 rounded-full bg-brand-50 text-brand-500 inline-flex items-center justify-center">
              <Truck size={15} />
            </span>
            <span className="text-[11px] font-bold text-ink-2 whitespace-nowrap">{c.carrier_code || '—'}</span>
            {c.service_type && <span className="text-[10.5px] text-ink-3 whitespace-nowrap">{c.service_type}</span>}
          </div>
          <AddressCard eyebrow="Ship To" a={to} accent party="to"
            tz={c.ship_to_timezone} planned={c.ship_to_delivery_date} />
        </div>
      </div>

      {/* key metrics at a glance */}
      <div className="flex gap-2.5 flex-wrap">
        <Metric icon={Weight} label={`Weight (${c.total_weight_uom ?? 'KG'})`} value={c.total_weight ?? '—'} />
        <Metric icon={Box} label={`Volume (${c.total_volume_uom ?? ''})`} value={c.total_volume ?? '—'} />
        <Metric icon={Hash} label="Quantity" value={c.total_quantity ?? '—'} />
        <Metric icon={Layers} label="Pallets" value={c.pallet_quantity ?? '—'} />
        <Metric icon={Package} label={`Package${nPkgs === 1 ? '' : 's'}`} value={nPkgs} />
        <Metric icon={Boxes} label={`SKU${nSkus === 1 ? '' : 's'}`} value={nSkus} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <DrawerSection title="Identifiers">
          <KV items={(() => {
            const items = pick(['consignment_number', 'reference_number', 'order_number', 'consignment_type_name', 'business_unit', 'shipper_code'])
            // this read often nulls reference_number (the value rides in `key`)
            return items.some(([k]) => k === 'reference_number') || !row.referenceNumber
              ? items
              : [items[0], ['reference_number', row.referenceNumber] as [string, unknown], ...items.slice(1)]
          })()} />
        </DrawerSection>
        <DrawerSection title="Route & Facilities">
          <KV items={pick(['carrier_code', 'origin_facility_code', 'destination_facility_code', 'current_facility_code', 'routing_priority'])} />
        </DrawerSection>
        <DrawerSection title="Dates">
          <KV items={pick(['ship_by_date', 'ship_to_delivery_date', 'created_at', 'last_updated_at'])} />
        </DrawerSection>
        <DrawerSection title={flags.length ? 'Attributes & Audit' : 'Audit'}>
          {flags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-3">
              {flags.map((f) => <StatusPill key={f} label={prettyKey(f)} tone="info" />)}
            </div>
          )}
          <KV items={pick(['created_by', 'last_updated_by', 'label_format', 'scannable'])} />
        </DrawerSection>
      </div>

      {/* pre-routing details — last section, when the record carries them */}
      {(() => {
        const prd = parseJson(c.pre_routing_details)
        if (!prd || typeof prd !== 'object' || !Object.keys(prd).length) return null
        return (
          <DrawerSection title="Pre-Routing Details">
            <KV items={Object.entries(prd).filter(([, v]) => typeof v !== 'object')} />
          </DrawerSection>
        )
      })()}
    </div>
  )
}

/* ---- shared bits for the item tabs ---- */

const shipmentStateOf = (row: ConsignmentOrderRow, trackingNumber: string) => {
  const sd = parseJson(rawOf(row).shipment_details)
  return Array.isArray(sd) ? sd.find((s: any) => s.key === trackingNumber) : undefined
}
const pkgTracking = (p: any): string => p.tracking_number ?? p.tracking_details?.[0]?.tracking_number ?? ''
const pkgLabel = (p: any): string => p.label_url ?? p.tracking_details?.[0]?.label ?? ''
const pkgDim = (p: any) => {
  const d = p.dimension ?? p
  const uom = d.dimension_unit_of_measure ?? p.dimension_uom ?? ''
  const parts = [d.length, d.breadth ?? d.width, d.height].filter((v: any) => v != null)
  return {
    dims: parts.length ? `${parts.join(' × ')} ${uom}`.trim() : '—',
    weight: d.weight != null ? `${d.weight} ${d.weight_unit_of_measure ?? p.weight_uom ?? ''}`.trim() : '—',
    volume: d.volume != null ? `${d.volume} ${d.volume_unit_of_measure ?? p.volume_uom ?? ''}`.trim() : '—',
  }
}

function ItemField({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-[12.5px] font-bold text-ink">{label}</div>
      <div className="text-[13px] text-ink mt-0.5">{value ?? '—'}</div>
    </div>
  )
}

const SKU_FLAGS = ['hazmat', 'fragile', 'vip', 'stackable', 'heavy_weight', 'four_person'] as const

function RawSkuTab({ row }: { row: ConsignmentOrderRow }) {
  const skus: any[] = parseJson(rawOf(row).sku_details) ?? []
  if (!Array.isArray(skus) || skus.length === 0) {
    return <EmptyState icon={<Boxes size={40} />} title="No SKU Details" />
  }
  return (
    <div className="space-y-3.5">
      {skus.map((s: any, i: number) => {
        const flags = SKU_FLAGS.filter((f) => !!s[f])
        return (
          <div key={s.code ?? i} className="rounded-xl border border-line bg-surface shadow-ds-1 overflow-hidden">
            <div className="flex items-center gap-3 px-4 py-3 border-b border-line bg-warm-50/60">
              <span className="h-9 w-9 shrink-0 rounded-lg bg-brand-50 text-brand-500 inline-flex items-center justify-center"><Boxes size={17} /></span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[13px] font-bold text-ink">{s.code ?? '—'}</span>
                  {s.name && <span className="text-[13px] text-ink-2 truncate">{s.name}</span>}
                </div>
                {s.description && <div className="text-[12px] text-ink-3 truncate">{s.description}</div>}
              </div>
              <div className="text-right shrink-0">
                <div className="text-[15px] font-black text-ink tabular-nums">×{s.quantity ?? 1}</div>
                {s.unit_price != null && <div className="text-[11.5px] text-ink-3 tabular-nums">@ {s.unit_price}</div>}
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-x-5 gap-y-3 px-4 py-3.5">
              <ItemField label="Line Item" value={s.line_item_no} />
              <ItemField label="Weight" value={s.weight != null ? `${s.weight} ${s.weight_uom ?? ''}` : '—'} />
              <ItemField label="Volume" value={s.volume != null ? `${s.volume} ${s.volume_uom ?? ''}` : '—'} />
              <ItemField label="Dimensions" value={[s.length, s.width, s.height].some((v: any) => v != null)
                ? `${[s.length, s.width, s.height].filter((v: any) => v != null).join(' × ')} ${s.dimension_uom ?? ''}` : '—'} />
              <ItemField label="Declared Value" value={s.value} />
              <ItemField label="HSN Code" value={s.hsn_code} />
              <ItemField label="UOM" value={s.uom} />
              <ItemField label="Packed In" value={
                Array.isArray(s.package_ids) && s.package_ids.length
                  ? <span className="flex flex-wrap gap-1">{s.package_ids.map((id: string) => (
                      <span key={id} className="rounded-full bg-warm-100 border border-warm-200 px-2 py-0.5 font-mono text-[11px] text-ink-2">{id}</span>))}</span>
                  : '—'} />
            </div>
            {flags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 px-4 pb-3.5">
                {flags.map((f) => <StatusPill key={f} label={prettyKey(f)} tone={f === 'hazmat' ? 'warning' : 'info'} />)}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

/* ---- Notes tab: real notes (getNotes) + add-note composer ---- */

function NotesTab({ row }: { row: ConsignmentOrderRow }) {
  const key = rawOf(row).key ?? row.referenceNumber
  const [notes, setNotes] = useState<ConsignmentNote[] | null>(null)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)

  const load = () => fetchNotes(key).then(setNotes).catch(() => setNotes([]))
  useEffect(() => { setNotes(null); load() }, [key])  // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async () => {
    const text = draft.trim()
    if (!text) return
    setBusy(true)
    try {
      await addConsignmentNote(key, text)
      setDraft('')
      toast.success('Note added.')
      load()
    } catch (e) {
      toast.error('Failed to add note.')
      console.error(e)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {notes === null ? (
        <div className="py-8 text-center text-[13px] text-ink-3 animate-pulse">Loading notes…</div>
      ) : notes.length === 0 ? (
        <div className="py-8 text-center text-[13px] text-ink-3">No notes yet — add the first one below.</div>
      ) : (
        <div className="space-y-3">
          {notes.map((n) => (
            <div key={n.key} className="rounded-xl border border-line bg-surface shadow-ds-1 px-4 py-3">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="h-6 w-6 rounded-full bg-brand-50 text-brand-500 inline-flex items-center justify-center text-[10px] font-bold">
                  {(n.created_by ?? '?').slice(0, 2).toUpperCase()}
                </span>
                <span className="text-[12.5px] font-bold text-ink">{n.created_by ?? 'Unknown'}</span>
                <span className="text-[11.5px] text-ink-3">· {String(n.created_at ?? '').slice(0, 16)}</span>
                {n.type && <span className="ml-auto rounded-full bg-warm-100 border border-warm-200 px-2 py-0.5 text-[10.5px] text-ink-3">{n.type}</span>}
              </div>
              <p className="text-[13px] text-ink leading-relaxed whitespace-pre-wrap">{n.note}</p>
            </div>
          ))}
        </div>
      )}
      {/* composer */}
      <div className="rounded-xl border border-line bg-surface shadow-ds-1 p-3">
        <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={3} placeholder="Enter notes"
          className="w-full resize-none rounded-md border border-warm-300 bg-surface px-3 py-2 text-[13px] text-ink placeholder:text-warm-400
                     focus:border-brand-500 focus:ring-[3px] focus:ring-brand-500/15 outline-none" />
        <div className="flex justify-end mt-2">
          <Button disabled={!draft.trim() || busy} onClick={submit}>{busy ? 'Adding…' : 'Add Note'}</Button>
        </div>
      </div>
    </div>
  )
}

/* ---- Tracking tab: staging's consignment-level sections + per-package cards ---- */

function TrackingInfoTab({ row }: { row: ConsignmentOrderRow }) {
  const c = rawOf(row)
  const ci = parseJson(c.carrier_info) ?? {}
  const fmt = (v: any) => (v == null || v === '' ? '—' : String(v).slice(0, 16).replace('T', ' '))
  const pricing: [string, any][] = ([
    ['Payment Mode', c.payment_mode], ['Amount', c.amount], ['Currency', c.currency],
    ['COD Amount', c.cod_amount], ['Freight Charge', c.freight_charge], ['Total Charge', c.total_charge],
  ] as [string, any][]).filter(([, v]) => v != null && v !== '')
  return (
    <div className="space-y-4">
      <DrawerSection title="Carrier & Tracking Information">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-3">
          {([
            ['Carrier Code', c.carrier_code],
            ['Carrier Name', ci.name],
            ['Service Type', c.service_type],
            ['Current Status', humanizeEnum(c.state)],
            ['Current Facility', c.current_facility_code],
            ['Origin Depot', c.origin_facility_code],
            ['Destination Depot', c.destination_facility_code],
            ['Type', ci.is_managed_carrier != null ? (ci.is_managed_carrier ? 'Managed' : 'Unmanaged') : null],
            ['Master Tracking Number', c.master_tracking_number],
            ['Manifest Number', c.manifest_number],
            ['Manifest Label', c.manifest_label],
            ['TAT Value', c.tat_value],
            ['Rank', c.rank],
            ['Rate Calculation Level', c.rate_calculation_level],
          ] as [string, any][]).map(([label, v]) => (
            <div key={label}>
              <div className="text-[12.5px] font-bold text-ink">{label}</div>
              <div className="text-[13px] text-ink mt-0.5">{v == null || v === '' ? '—' : String(v)}</div>
            </div>
          ))}
          <div>
            <div className="text-[12.5px] font-bold text-ink">Tracking Url</div>
            <div className="text-[13px] mt-0.5">
              {c.ci_url
                ? <a href={c.ci_url} target="_blank" rel="noreferrer" className="text-brand-500 font-bold hover:underline">Track Consignment Order</a>
                : '—'}
            </div>
          </div>
        </div>
      </DrawerSection>

      <DrawerSection title="Schedule">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-3">
          {([
            ['Ship By Date', fmt(c.ship_by_date)],
            ['Dispatch Date', fmt(c.dispatch_date)],
            ['Pickup Start Time', fmt(c.pickup_start_date_time)],
            ['Pickup End Time', fmt(c.pickup_end_date_time)],
            ['Pickup Timezone', c.ship_from_timezone ?? '—'],
            ['Delivery Start Time', fmt(c.lastmile_delivery_start_time)],
            ['Delivery End Time', fmt(c.lastmile_delivery_end_time)],
            ['Delivery Timezone', c.ship_to_timezone ?? '—'],
            ['Original Pickup Start Time', fmt(c.original_pickup_start_time)],
            ['Original Pickup End Time', fmt(c.original_pickup_end_time)],
            ['Original Delivery Start Time', fmt(c.original_lastmile_delivery_start_time)],
            ['Original Delivery End Time', fmt(c.original_lastmile_delivery_end_time)],
          ] as [string, string][]).map(([label, v]) => (
            <div key={label}>
              <div className="text-[12.5px] font-bold text-ink">{label}</div>
              <div className="text-[13px] text-ink mt-0.5">{v}</div>
            </div>
          ))}
        </div>
      </DrawerSection>

      <DrawerSection title="Charges & Pricing">
        {pricing.length
          ? <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-3">
              {pricing.map(([label, v]) => (
                <div key={label}>
                  <div className="text-[12.5px] font-bold text-ink">{label}</div>
                  <div className="text-[13px] text-ink mt-0.5 tabular-nums">{String(v)}</div>
                </div>
              ))}
            </div>
          : <div className="py-4 text-center text-[13px] text-ink-3">No pricing information available</div>}
      </DrawerSection>

      <div>
        <div className="flex items-center gap-2 mb-2.5">
          <span className="text-[11.5px] font-black uppercase tracking-[0.08em] text-ink-3">Tracking Numbers</span>
          <span className="flex-1 h-px bg-line/70" />
        </div>
        <RawPackagesTab row={row} mode="tracking" />
      </div>
    </div>
  )
}

/* package fields, grouped: identification / status / physical — dashes kept,
   the label download lives ONLY in the card header */
function PackageFieldGroups({ p, d, ship, trk }: {
  p: any; d: { dims: string; weight: string; volume: string }; ship: any; trk: string
}) {
  const dim = (v: any) => v != null ? `${v} ${p.dimension?.dimension_unit_of_measure ?? p.dimension_uom ?? ''}`.trim() : '—'
  const groups: [string, [string, React.ReactNode][]][] = [
    ['Identification', [
      ['Tracking Number', trk || '—'],
      ['Barcode', p.barcode],
      ['Type', p.type],
      ['Description', p.description],
      ['SKU Code', p.sku_code],
      ['Declared Value', p.value],
    ]],
    ['Status & Location', [
      ['State', humanizeEnum(ship?.state ?? p.state ?? p.package_status) || '—'],
      ['Exception State', humanizeEnum(p.exception_state) || '—'],
      ['Current Facility', ship?.current_facility_code ?? p.current_facility_code],
      ['Storage Location', p.storage_location],
      ['Proof of Damage', p.proof_of_damage],
      ['Last Update', ship?.updated_at ? String(ship.updated_at).slice(0, 16) : '—'],
    ]],
    ['Physical', [
      ['Weight', d.weight],
      ['Volume', d.volume],
      ['Created Weight', p.created_weight != null ? `${p.created_weight} ${p.created_weight_uom ?? ''}` : d.weight],
      ['Created Volume', p.created_volume != null ? `${p.created_volume} ${p.created_volume_uom ?? ''}` : d.volume],
      ['Length', dim(p.dimension?.length ?? p.length)],
      ['Width', dim(p.dimension?.breadth ?? p.width)],
      ['Height', dim(p.dimension?.height ?? p.height)],
      ['Quantity', p.quantity ?? 1],
      ['SKU Quantity', p.sku_quantity],
      ['Pallet Space', p.pallet_space],
    ]],
  ]
  return (
    <div className="col-span-full space-y-4">
      {groups.map(([title, fields]) => (
        <div key={title}>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[10.5px] font-black uppercase tracking-[0.08em] text-ink-3">{title}</span>
            <span className="flex-1 h-px bg-line/70" />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-x-5 gap-y-3">
            {fields.map(([label, v]) => <ItemField key={label} label={label} value={v == null || v === '' ? '—' : v} />)}
          </div>
        </div>
      ))}
      {Array.isArray(p.tags) && p.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {p.tags.map((t: string) => (
            <span key={t} className="rounded-full bg-warm-100 border border-warm-200 px-2 py-0.5 text-[11px] text-ink-2">{t}</span>))}
        </div>
      )}
    </div>
  )
}

/* VAS on the record — consignmentDetails.vas persists and reads back as
 * raw.vas [{name, vas_added_level, id:[target], service_time, remarks}] */
function VasTab({ row }: { row: ConsignmentOrderRow }) {
  const items: any[] = parseJson(rawOf(row).vas) ?? []
  if (!Array.isArray(items) || items.length === 0) {
    return <EmptyState icon={<Boxes size={40} />} title="No VAS Details"
      hint="Value-added services attached at creation appear here." />
  }
  return (
    <div className="space-y-3">
      {items.map((v: any, i: number) => (
        <div key={i} className="rounded-xl border border-line bg-surface shadow-ds-1 px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex h-[22px] w-[22px] items-center justify-center rounded-md bg-brand-50 text-[11.5px] font-black text-brand-600">{i + 1}</span>
            <span className="text-[13.5px] font-bold text-ink">{humanizeEnum(String(v.name ?? v.vas_code ?? '—'))}</span>
            {v.vas_added_level && <StatusPill label={String(v.vas_added_level)} tone="info" />}
            {v.service_time != null && (
              <span className="rounded-full bg-warm-100 px-2 py-0.5 text-[11.5px] font-bold tabular-nums text-ink-2">{v.service_time} min</span>
            )}
            {Array.isArray(v.id) && v.id.length > 0 && (
              <span className="text-[12px] text-ink-3">on {String(v.vas_added_level ?? 'SKU').toLowerCase()} {v.id.join(', ')}</span>
            )}
          </div>
          {v.remarks && <p className="mt-1.5 text-[12.5px] text-ink-2">{String(v.remarks)}</p>}
        </div>
      ))}
    </div>
  )
}

function RawPackagesTab({ row, mode }: { row: ConsignmentOrderRow; mode: 'package' | 'tracking' }) {
  const pkgs: any[] = parseJson(rawOf(row).package_details) ?? []
  // packages start expanded; the header row collapses each card to one line
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set())
  const toggle = (i: number) => setCollapsed((prev) => {
    const next = new Set(prev)
    if (next.has(i)) next.delete(i); else next.add(i)
    return next
  })
  const allSkus: any[] = parseJson(rawOf(row).sku_details) ?? []
  /* SKUs linked to a package via package_ids; when the record has SKUs but no
     linkage and only one package, everything is in that box */
  const skusIn = (p: any): any[] => {
    if (!Array.isArray(allSkus) || !allSkus.length) return []
    const linked = allSkus.filter((k) => {
      const ids = k.package_ids ?? k.packageIds ?? (k.sku_package_id ? [k.sku_package_id] : [])
      return Array.isArray(ids) && ids.includes(p.id)
    })
    if (linked.length) return linked
    return pkgs.length === 1 ? allSkus : []
  }
  if (!Array.isArray(pkgs) || pkgs.length === 0) {
    return <EmptyState icon={<Boxes size={40} />} title={mode === 'package' ? 'No Package Details' : 'No Tracking Details'} />
  }
  return (
    <div className="space-y-3.5">
      {pkgs.map((p: any, i: number) => {
        const trk = pkgTracking(p)
        const label = pkgLabel(p)
        const ship = trk ? shipmentStateOf(row, trk) : undefined
        const d = pkgDim(p)
        const carrier = p.tracking_details?.[0]?.carrier_details?.code ?? rawOf(row).carrier_code
        return (
          <div key={p.id ?? i} className="rounded-xl border border-line bg-surface shadow-ds-1 overflow-hidden">
            <div className={`flex items-center gap-3 px-4 py-3 bg-warm-50/60 cursor-pointer select-none ${collapsed.has(i) ? '' : 'border-b border-line'}`}
              onClick={() => toggle(i)}>
              <ChevronDown size={15}
                className={`shrink-0 text-warm-400 transition-transform ${collapsed.has(i) ? '-rotate-90' : ''}`} />
              <span className="h-9 w-9 shrink-0 rounded-lg bg-brand-50 text-brand-500 inline-flex items-center justify-center">
                {mode === 'package' ? <Package size={16} /> : <MapPinned size={16} />}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-[13.5px] font-bold text-ink">{mode === 'tracking' ? (trk || '—') : (p.id ?? '—')}</span>
                  {p.type && <span className="rounded-full bg-warm-100 border border-warm-200 px-2 py-0.5 text-[11px] text-ink-2">{p.type}</span>}
                  {ship?.state && <StatusPill label={humanizeEnum(ship.state)} tone="info" />}
                  {!ship && p.package_status && <StatusPill label={humanizeEnum(String(p.package_status))} tone="neutral" />}
                </div>
                <div className="text-[11.5px] text-ink-3 mt-0.5">
                  {mode === 'tracking' ? <>Package <span className="font-mono">{p.id}</span></> : trk && <>Tracking <span className="font-mono">{trk}</span></>}
                  {ship?.current_facility_code && <> · at {ship.current_facility_code}</>}
                  {ship?.updated_at && <> · updated {String(ship.updated_at).slice(0, 16)}</>}
                </div>
              </div>
              {label && (
                <a href={label} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}
                  className="shrink-0 inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-brand-500 text-[12px] font-bold text-brand-500 hover:bg-brand-50 transition-colors">
                  <Download size={12} />Label
                </a>
              )}
            </div>
            {!collapsed.has(i) && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-x-5 gap-y-3 px-4 py-3.5">
              {mode === 'tracking' ? (
                <>
                  <ItemField label="Carrier" value={carrier} />
                  <ItemField label="State" value={ship?.state ? humanizeEnum(ship.state) : '—'} />
                  <ItemField label="Current Facility" value={ship?.current_facility_code} />
                  <ItemField label="Last Update" value={ship?.updated_at ? String(ship.updated_at).slice(0, 16) : '—'} />
                </>
              ) : (
                /* full inventory, grouped intelligently (label lives in the header only) */
                <PackageFieldGroups p={p} d={d} ship={ship} trk={trk} />
              )}
            </div>
            )}
            {!collapsed.has(i) && mode === 'package' && skusIn(p).length > 0 && (
              <div className="border-t border-line/70">
                <div className="px-4 pt-2.5 pb-1 text-[11px] font-bold uppercase tracking-wide text-ink-3">
                  SKUs in this package
                </div>
                {skusIn(p).map((k: any, j: number) => (
                  <div key={j} className="flex items-center gap-3 px-4 py-2 border-t border-line/50 first:border-t-0">
                    <span className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-md bg-warm-100 text-[11.5px] font-black text-ink-2">
                      {k.line_item_no ?? k.lineItemNo ?? j + 1}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-bold text-ink">{k.name || k.code || '—'}</span>
                      <span className="block truncate text-[11.5px] text-ink-3">
                        {[k.code, k.category, k.description].filter(Boolean).join(' · ') || '—'}
                      </span>
                    </span>
                    <span className="shrink-0 whitespace-nowrap rounded-full bg-warm-100 px-2 py-0.5 text-[11.5px] font-bold tabular-nums text-ink-2">
                      Qty {k.quantity ?? '—'}{k.weight ? ` · ${k.weight} ${String(k.weight_uom ?? 'kg').toLowerCase()}` : ''}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}



/* ---- Events tab: the consignment's real tracking-event timeline ---- */

function fmtEventTime(t?: string) {
  if (!t) return '—'
  const [d, time] = t.slice(0, 16).split('T')
  return `${time ?? ''} · ${d}`
}

function EventsTab({ row }: { row: ConsignmentOrderRow }) {
  const key = (row as any).raw?.key ?? row.referenceNumber
  const [events, setEvents] = useState<TrackingEvent[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    setEvents(null)
    setError(null)
    fetchTrackingEvents(key)
      .then((evs) => setEvents([...evs].sort((a, b) => (b.eventTime ?? '').localeCompare(a.eventTime ?? ''))))
      .catch((e) => setError(String(e)))
  }, [key])

  if (error) return <EmptyState icon={<Boxes size={40} />} title="Couldn't load events" hint={error} />
  if (events === null) return <div className="py-10 text-center text-[13px] text-ink-3 animate-pulse">Loading events…</div>
  if (!events.length) return <EmptyState icon={<CalendarClock size={40} />} title="No events yet" hint="Events appear as the consignment moves through its lifecycle." />

  return (
    <div className="relative pl-1">
      {events.map((group, gi) => {
        const subs = [...(group.trackingEvents ?? [])].sort((a, b) => (b.eventTime ?? '').localeCompare(a.eventTime ?? ''))
        return (
          <div key={gi} className="relative pb-5 pl-6 last:pb-0">
            {/* timeline spine */}
            {gi < events.length - 1 && <span className="absolute left-[7px] top-4 bottom-0 w-px bg-line" />}
            <span className="absolute left-0 top-1 h-4 w-4 rounded-full border-2 border-brand-500 bg-surface inline-flex items-center justify-center">
              <span className="h-1.5 w-1.5 rounded-full bg-brand-500" />
            </span>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[13.5px] font-bold text-ink">{humanizeEnum(group.eventName)}</span>
              {group.milestoneStatus && <StatusPill label={humanizeEnum(group.milestoneStatus)} tone="info" />}
            </div>
            <div className="text-[12px] text-ink-3 mt-0.5">
              {fmtEventTime(group.eventTime)}
              {group.locationCity && <span> · {group.locationCity}</span>}
              {group.carrierName && <span> · {group.carrierName}</span>}
            </div>
            {subs.length > 0 && (
              <div className="mt-2.5 space-y-2 border-l border-line pl-4">
                {subs.map((e, i) => (
                  <div key={i} className="relative">
                    <span className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-warm-300" />
                    <div className="text-[12.5px] text-ink">{humanizeEnum(e.eventName)}</div>
                    <div className="text-[11.5px] text-ink-3">
                      {fmtEventTime(e.eventTime)}
                      {e.locationCity && <span> · {e.locationCity}</span>}
                      {e.carrierName && <span> · {e.carrierName}</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

