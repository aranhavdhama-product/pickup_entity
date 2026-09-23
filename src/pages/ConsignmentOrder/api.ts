/**
 * Consignment Order data layer — live against staging (verified 2026-08-27):
 *
 *  LIST    POST /sbs/graphql  { getAllConsignmentDetails(query:{pageNo,
 *          recordsPerPage, sortControl:{sortOn, sortDirection}, dynamicQueryBuilder:[…]})
 *          { totalElements totalPages number content } } — `content` is a JSON
 *          scalar (no subselection) of snake_case consignment rows.
 *  CREATE  POST /ship/api/v3/consignments  (Content-Type: application/camel+json,
 *          session cookie via proxy). Account quirks (prod0003): consignmentNumber
 *          must match the number-gen template — OMIT it and the backend generates
 *          C<n>; tracking numbers must start with PKG (supply client-side, the
 *          server generator can exhaust retries).
 *  BULK    POST /ship/app/rest/v3/bulkupload/sync (multipart `file`) — 214-column
 *          template from GET /ship/app/rest/bulk/sample (strip trailing `*` from
 *          headers). Row-level errors come back in `errors[]`.
 */
import type {
  ConsignmentOrderRow, ConsignmentShipment, ConsignmentState, TimeWindow,
} from '../../data/mockData'
import { fetchModuleSettings, parseSettingJson } from '../../nueva/settingsApi'

export const BULK_SAMPLE_URL = '/staging/ship/api/v3/../app/rest/bulk/sample'.replace('/api/v3/..', '')

/* ---------------- page configuration (CONSIGNMENT_MANAGEMENT module) ----------------
 * The staging Consignment Order page is DRIVEN by Custom Settings → Base Modules →
 * Consignment Order: table columns (show/sequence), filter set (show/sequence) and
 * the default date field + range all come from its settingJson. We read the same
 * config, so changes made on /settings/base-modules/CONSIGNMENT_MANAGEMENT
 * reflect here immediately. */

export interface ConsignmentPageConfig {
  columns: string[]        // visible column keys, in configured sequence
  filters: string[]        // visible filter keys, in configured sequence
  dateAppliedOn: string    // created_at | ship_to_delivery_date | ship_by_date | last_updated_at | dispatch_date
  selectedDateRange: number // -30 | -15 | -7 | 0 | 7 (staging presets)
}

const DEFAULT_COLUMNS = ['consignmentNumber', 'referenceNumber', 'state', 'secondaryState', 'totalWeight', 'totalVolume', 'shipToName', 'businessUnit', 'consignmentType', 'createdAt']
const DEFAULT_FILTERS = ['state', 'origin', 'destination', 'consignmentType', 'businessUnit', 'carrier', 'serviceType']

export async function fetchConsignmentPageConfig(): Promise<ConsignmentPageConfig> {
  try {
    const [m] = await fetchModuleSettings(['CONSIGNMENT_MANAGEMENT'])
    const s = (parseSettingJson(m?.settingJson) ?? {}) as Record<string, any>
    const prc = s.pageRenderingConfig ?? {}
    const pick = (map: Record<string, { show?: boolean; sequence?: number }> | undefined, fallback: string[]) => {
      const entries = Object.entries(map ?? {}).filter(([, v]) => v?.show)
      if (!entries.length) return fallback
      return entries.sort((a, b) => (a[1].sequence ?? 0) - (b[1].sequence ?? 0)).map(([k]) => k)
    }
    return {
      columns: pick(prc.table?.columns, DEFAULT_COLUMNS),
      filters: pick(prc.filters, DEFAULT_FILTERS),
      dateAppliedOn: s.dateAppliedOn ?? 'created_at',
      selectedDateRange: typeof s.selectedDateRange === 'number' ? s.selectedDateRange : -7,
    }
  } catch {
    return { columns: DEFAULT_COLUMNS, filters: DEFAULT_FILTERS, dateAppliedOn: 'created_at', selectedDateRange: -7 }
  }
}

/* ---------------- humanization (match staging's "At Facility" pills) ---------------- */

const KNOWN_STATES: Record<string, ConsignmentState> = {
  CREATED: 'Created',
  AT_FACILITY: 'At Facility',
  PARTIAL_AT_FACILITY: 'Partial At Facility',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
  EXCEPTION: 'Exception',
}

export function humanizeEnum(v: string | null | undefined): string {
  if (!v) return ''
  return v.split('_').map((w) => w.charAt(0) + w.slice(1).toLowerCase()).join(' ')
}

function mapState(v: string | null | undefined): ConsignmentState {
  if (!v) return 'Created'
  return KNOWN_STATES[v] ?? (humanizeEnum(v) as ConsignmentState)
}

/* ---------------- listing ---------------- */

export interface LiveConsignmentRow extends ConsignmentOrderRow {
  createdAt: string
  businessUnit: string
  /** humanized secondary_state array — data-validation exception flags */
  exceptionFlags: string[]
  consignmentType: string
  /** validation/exception info (staging: current_error_code/current_error_reason) */
  errorCode: string
  errorReason: string
  raw: Record<string, any>
}

function windowFrom(start?: string | null, end?: string | null): TimeWindow | null {
  if (!start && !end) return null
  return { start: start ?? '', end: end ?? '' }
}

function parseMaybeJson(v: unknown): any {
  if (typeof v !== 'string') return v
  try { return JSON.parse(v) } catch { return v }
}

function mapRow(c: Record<string, any>): LiveConsignmentRow {
  const shipTo = parseMaybeJson(c.ship_to_address) ?? {}
  const packages: any[] = parseMaybeJson(c.package_details) ?? []
  const shipments: ConsignmentShipment[] = (Array.isArray(packages) ? packages : []).map((p, i) => ({
    id: p.id ?? p.package_id ?? `PKG${i + 1}`,
    trackingNumber: p.tracking_details?.[0]?.tracking_number ?? p.tracking_number ?? '',
    outcome: null,
  }))
  return {
    id: String(c.key ?? c.id ?? c.reference_number),
    consignmentNumber: c.consignment_number ?? '',
    referenceNumber: c.reference_number ?? c.key ?? '',
    state: mapState(c.state),
    secondaryState: humanizeEnum(c.secondary_state_new ?? (Array.isArray(c.secondary_state) ? c.secondary_state[0] : c.secondary_state)),
    // data-validation flags ride in the secondary_state ARRAY (e.g.
    // GEO_LOOKUP_NOT_FOUND) — staging shows them as Exception State and files
    // the row under Data Validation Issues
    exceptionFlags: Array.isArray(c.secondary_state) ? c.secondary_state.map((x: unknown) => humanizeEnum(String(x))) : [],
    weightKg: Number(c.total_weight ?? 0),
    volume: c.total_volume != null ? `${c.total_volume} ${c.total_volume_uom ?? ''}`.trim() : '—',
    palletSpaces: c.pallet_quantity != null ? Number(c.pallet_quantity) : null,
    origin: c.origin_facility_code ?? '',
    destination: c.destination_facility_code ?? '',
    carrier: c.carrier_code ?? '',
    orderNumber: c.order_number ?? '',
    serviceType: c.service_type ?? '',
    shipToName: shipTo.name ?? '',
    shipToCode: shipTo.code ?? '',
    shipToPincode: shipTo.pincode ?? '',
    shipToCity: shipTo.city ?? '',
    shipToCounty: shipTo.county ?? shipTo.state ?? '',
    shipFromCode: c.origin_facility_code ?? '',
    pickupWindow: null,
    deliveryWindow: windowFrom(c.lastmile_delivery_start_time, c.lastmile_delivery_end_time),
    shipments,
    attachments: [],
    createdAt: c.created_at ?? '',
    businessUnit: c.business_unit ?? '',
    consignmentType: humanizeEnum(c.consignment_type_name ?? c.consignment_type),
    errorCode: c.current_error_code ?? '',
    errorReason: c.current_error_reason ?? '',
    raw: c,
  }
}

export async function fetchConsignments(pageNo = 1, recordsPerPage = 500): Promise<{
  rows: LiveConsignmentRow[]; totalElements: number
}> {
  const query = `{ getAllConsignmentDetails(query:{ pageNo: ${pageNo} recordsPerPage: ${recordsPerPage}, sortControl: { sortOn: "createdAt", sortDirection: DESC }, dynamicQueryBuilder: [] }) { totalElements totalPages number content } }`
  const res = await fetch('/staging/sbs/graphql', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  })
  if (!res.ok) throw new Error(`graphql ${res.status}`)
  const data = await res.json()
  if (data.errors?.length) throw new Error(data.errors[0].message ?? 'GraphQL error')
  const g = data.data?.getAllConsignmentDetails
  return { rows: (g?.content ?? []).map(mapRow), totalElements: g?.totalElements ?? 0 }
}

/** Live single-consignment read (drawer refresh): filterKey `key` is the only
    identifier the FilterKey enum accepts — it matches the record's `key`
    (reference/aggregate key). Verified live 2026-08-27. */
export async function fetchConsignmentByKey(key: string): Promise<LiveConsignmentRow | null> {
  const query = `{ getAllConsignmentDetails(query:{ pageNo: 1 recordsPerPage: 1, dynamicQueryBuilder: [{filterKey:key,filterValue:${JSON.stringify(key)},condition:equals}] }) { content } }`
  const res = await fetch('/staging/sbs/graphql', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  })
  if (!res.ok) throw new Error(`graphql ${res.status}`)
  const data = await res.json()
  if (data.errors?.length) throw new Error(data.errors[0].message ?? 'GraphQL error')
  const c = data.data?.getAllConsignmentDetails?.content?.[0]
  return c ? mapRow(c) : null
}

/* ---------------- create ---------------- */

export interface CreateResult {
  success: boolean
  consignmentNumber?: string
  referenceNumber?: string
  labelUrl?: string
  errors: string[]
}

export async function createConsignmentV3(payload: Record<string, any>): Promise<CreateResult> {
  const res = await fetch('/staging/ship/api/v3/consignments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/camel+json' },
    body: JSON.stringify(payload),
  })
  const body = await res.json().catch(() => ({}))
  if (res.ok && body.success_count > 0) {
    return {
      success: true,
      consignmentNumber: body.data?.consignment_number,
      referenceNumber: body.data?.reference_number,
      labelUrl: body.data?.tracking_details?.[0]?.label,
      errors: [],
    }
  }
  const errors: string[] = (body.errors ?? []).flatMap((e: any) =>
    Array.isArray(e?.details) ? e.details : [typeof e === 'string' ? e : JSON.stringify(e)])
  return { success: false, errors: errors.length ? errors : [body.message ?? `HTTP ${res.status}`] }
}

/* ---------------- tracking events (View Events in the drawer) ----------------
 * POST /mid-mile/operational-dashboard/api/rest/v1/ops-dashboard/tracking-events
 * (camel+json) — returns milestone groups, each with nested trackingEvents[].
 * Verified live 2026-08-27. */

export interface TrackingEvent {
  milestoneStatus?: string
  eventName?: string
  eventTime?: string
  locationCity?: string
  carrierName?: string
  carrierCode?: string
  level?: string
  trackingEvents?: TrackingEvent[]
}

export async function fetchTrackingEvents(aggregateKey: string): Promise<TrackingEvent[]> {
  const res = await fetch('/staging/mid-mile/operational-dashboard/api/rest/v1/ops-dashboard/tracking-events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/camel+json', Accept: 'application/camel+json' },
    body: JSON.stringify({
      filterExpression: {
        booleanOperator: 'AND',
        filterConditions: [{ comparisonOperator: 'EQ', filterValue: aggregateKey, filterName: 'aggregateKey' }],
      },
      pageSize: 100, pageNumber: 1, resourceType: 'consignment',
      sort: { sortBy: 'eventAt', sortDir: 'desc' },
    }),
  })
  if (!res.ok) throw new Error(`tracking-events ${res.status}`)
  const d = await res.json()
  return Array.isArray(d) ? d : d?.content ?? []
}

/* ---------------- notes (drawer Notes tab) ----------------
 * READ  POST /sbs/graphql getNotes — filterKey `consignment_key` equals <key>
 * WRITE POST /sbs/api/command/note/create — {company_id, user_id,
 *       consignment_key, parent_type:"CONSIGNMENT", type:"WEB", note}
 * Verified live 2026-08-27 (note N10000003). */

export interface ConsignmentNote {
  key: string
  note: string
  created_at: string
  created_by: string
  type?: string
}

export async function fetchNotes(consignmentKey: string): Promise<ConsignmentNote[]> {
  const query = `{ getNotes(query:{ pageNo: 1 recordsPerPage: 100, sortControl: { sortOn: "createdAt", sortDirection: DESC }, dynamicQueryBuilder: [{filterKey:consignment_key,filterValue:${JSON.stringify(consignmentKey)},condition:equals}] }) { totalElements content } }`
  const res = await fetch('/staging/sbs/graphql', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  })
  if (!res.ok) throw new Error(`getNotes ${res.status}`)
  const d = await res.json()
  if (d.errors?.length) throw new Error(d.errors[0].message ?? 'GraphQL error')
  return d.data?.getNotes?.content ?? []
}

export async function addConsignmentNote(consignmentKey: string, note: string): Promise<void> {
  const acc = await import('../../nueva/settingsApi').then((m) => m.fetchAccount())
  const res = await fetch('/staging/sbs/api/command/note/create', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      company_id: acc.company.id, user_id: acc.userId,
      consignment_key: consignmentKey, parent_type: 'CONSIGNMENT', type: 'WEB', note,
    }),
  })
  if (!res.ok) throw new Error(`note/create ${res.status}`)
}

/* ---------------- bulk upload ---------------- */

export interface BulkResult {
  successCount: number
  failedCount: number
  errors: string[]
}

export async function bulkUploadConsignments(file: File): Promise<BulkResult> {
  const fd = new FormData()
  fd.append('file', file)
  const res = await fetch('/staging/ship/app/rest/v3/bulkupload/sync', { method: 'POST', body: fd })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.message ?? `bulk upload HTTP ${res.status}`)
  return {
    successCount: body.success_count ?? 0,
    failedCount: body.failed_count ?? 0,
    errors: body.errors ?? [],
  }
}
