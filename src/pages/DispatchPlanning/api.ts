/**
 * Data layer for the Dispatch Planning prototype — v2, mapped against the REAL
 * response shapes observed live on the dms staging account (2026-08-24):
 *
 *  - GET  /app/rest/city_hub_list                 → [{ city:{...}, hubList:[{id,name,…}] }]
 *  - POST /app/rest/get_routing_history           → [ plan { id, routingDate, state, totalRoutes, … } ]
 *  - GET  /app/rest/get_route_by_id?routeNo=plan  → [ route { routeId, dock, fieldExecutiveId, helperIds,
 *                                                      routeMetadata{routeName,startTime,endTime,vehicleId},
 *                                                      routeJsonObject{ routeName, totalDistance, totalTime,
 *                                                        co2, zoneName, startLocation, jobLatLngs[],
 *                                                        orderDataList[{stopSequence,jobId,orderType,address,
 *                                                          weight,serviceTime,startTime,endTime,accuracy}] } } ]
 *  - GET  /app/rest/users/getAllFieldExecutiveList → [ { id, employeeCode, firstName, lastName, userTypeName,
 *                                                        isLoggedIn, activated } ]
 *
 * Everything goes through the Vite `/staging` proxy (cookie from .staging-session).
 */

/* ------------------------------------------------------------------ types -- */

export interface SessionInfo {
  hasCookie: boolean
  user: string | null
  userId: number | null
  companyId: number | null
  hubId: number | null
  hubCode: string | null
  timezone: string | null
  expiresAt: string | null
}

export interface HubOption {
  id: number
  name: string
  cityId: number | null
  cityName: string
}

export interface PlanEntry {
  id: number
  date: string
  state: string
  totalRoutes: number | null
  fence: string
  hubId: number | null
  raw: Record<string, unknown>
}

export interface StopRow {
  sequence: number
  jobId: string
  type: string
  address: string
  weightKg: number | null
  serviceTimeMin: number | null
  windowStartMin: number | null
  windowEndMin: number | null
  accuracy: string
}

export interface RouteCard {
  planId: number
  planDate: string
  key: string            // routeId, e.g. "619307535-0" — the assign-from-route `key`
  name: string
  dockName: string
  driverId: number | null
  helperIds: number[]
  vehicleId: string
  startHHMM: string
  endHHMM: string
  distanceKm: number | null
  totalTimeLabel: string
  co2: number | null
  zone: string
  trailer: string
  stateNum: number | null
  stops: StopRow[]
  latLngs: { lat: number; lng: number }[]
  startLocation: { lat: number; lng: number } | null
  raw: Record<string, unknown>
}

export interface TripStop {
  sequence: number
  label: string
  consignmentKeys: string[]
  state: string
  status: string
  etaUtc: string | null
  etcUtc: string | null
  windowStartUtc: string | null
  windowEndUtc: string | null
  weight: number | null
  weightUom: string
  address: string
  pickupCount: number
  deliveryCount: number
  returnCount: number
}

export interface TripCard {
  tripKey: string
  routeKey: string
  name: string
  state: string          // CREATED | ASSIGNED | …
  status: string         // ON_TIME | DELAYED | …
  driverCode: string
  driverId: number | null
  helpers: string[]
  vehicleNumber: string
  dispatchHub: string
  dispatchDateUtc: string | null
  expectedStartUtc: string | null
  expectedEndUtc: string | null
  isPreload: boolean
  attempts: { total: number; successful: number; failed: number; partial: number }
  stops: TripStop[]
  raw: Record<string, unknown>
}

export interface TripsResult {
  timezone: string
  totalRecords: number
  trips: TripCard[]
}

export interface DriverCard {
  id: number | null
  employeeCode: string
  fullName: string
  userType: string
  loggedIn: boolean
  raw: Record<string, unknown>
}

/* -------------------------------------------------------------- utilities -- */

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function call<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { accept: 'application/json, text/plain, */*', ...(init?.body ? { 'content-type': 'application/json' } : {}), ...init?.headers },
  })
  if (res.status === 401 || res.status === 403) {
    throw new ApiError(res.status, 'Staging session expired — paste a fresh Cookie header into .staging-session and retry.')
  }
  if (!res.ok) throw new ApiError(res.status, `${path} → HTTP ${res.status}`)
  const text = await res.text()
  try { return JSON.parse(text) as T } catch { throw new ApiError(res.status, `${path} returned non-JSON (check session)`) }
}

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)
const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}
const str = (v: unknown): string => (v === null || v === undefined ? '' : String(v))

/* ------------------------------------------------------------------ calls -- */

export const getSessionInfo = () => call<SessionInfo>('/staging-session-info')

export async function fetchHubs(): Promise<HubOption[]> {
  const payload = await call<unknown[]>('/staging/app/rest/city_hub_list')
  const out: HubOption[] = []
  for (const entry of Array.isArray(payload) ? payload : []) {
    if (!isObj(entry)) continue
    const city = isObj(entry.city) ? entry.city : {}
    const cityName = str(city.name ?? city.cityName)
    const cityId = num(city.id)
    for (const h of Array.isArray(entry.hubList) ? entry.hubList : []) {
      if (!isObj(h)) continue
      const id = num(h.id)
      if (id === null) continue
      out.push({ id, name: str(h.name) || `hub ${id}`, cityId, cityName })
    }
  }
  return out
}

export async function fetchPlans(dateFrom: string, dateTo: string, hubId?: number | null): Promise<PlanEntry[]> {
  const payload = await call<unknown[]>('/staging/app/rest/get_routing_history?serviceProviderAssignment=false', {
    method: 'POST',
    body: JSON.stringify({
      id: null, date: [dateFrom, dateTo], createdOn: null,
      hubId: hubId ?? '', cityId: '', dispatchStatusList: null,
      fetchLatest: true, pageSize: 50, pageNumber: 1,
      consignmentRoutingType: 1, triggerType: 1, vrpSolver: null,
    }),
  })
  return (Array.isArray(payload) ? payload : []).filter(isObj).flatMap((p) => {
    const id = num(p.id)
    if (id === null) return []
    return [{
      id,
      date: str(p.dispatchDate ?? p.routingDate ?? p.date).slice(0, 10),
      state: str(p.state ?? p.routingStatus),
      totalRoutes: num(p.totalRoutes),
      fence: str(p.fence),
      hubId: num(p.hubId),
      raw: p,
    }]
  })
}

/** Staging sometimes sends nested objects as JSON-encoded strings — accept both. */
function objOrParse(v: unknown): Obj {
  if (isObj(v)) return v
  if (typeof v === 'string' && v.trim().startsWith('{')) {
    try { const parsed: unknown = JSON.parse(v); if (isObj(parsed)) return parsed } catch { /* fall through */ }
  }
  return {}
}

export async function fetchRoutesForPlan(plan: PlanEntry): Promise<RouteCard[]> {
  const payload = await call<unknown[]>(`/staging/app/rest/get_route_by_id?routeNo=${plan.id}&serviceProviderAssignment=false`)
  return (Array.isArray(payload) ? payload : []).filter(isObj).map((r) => {
    let rj: Obj = objOrParse(r.routeJsonObject)
    if (!Object.keys(rj).length) rj = objOrParse(r.routeJson)
    const meta = objOrParse(r.routeMetadata)
    const stops: StopRow[] = (Array.isArray(rj.orderDataList) ? rj.orderDataList : []).filter(isObj).map((o) => ({
      sequence: num(o.stopSequence) ?? 0,
      jobId: str(o.jobId),
      type: str(o.orderType).toUpperCase(),
      address: str(o.address),
      weightKg: num(o.weight),
      serviceTimeMin: num(o.serviceTime),
      windowStartMin: num(o.startTime),
      windowEndMin: num(o.endTime),
      accuracy: str(o.accuracy),
    })).sort((a, b) => a.sequence - b.sequence)
    const latLngs = (Array.isArray(rj.jobLatLngs) ? rj.jobLatLngs : []).filter(isObj)
      .flatMap((p) => {
        const lat = num(p.lat); const lng = num(p.lng)
        return lat !== null && lng !== null ? [{ lat, lng }] : []
      })
    const startLoc = isObj(rj.startLocation) ? rj.startLocation : null
    const startLat = startLoc ? num(startLoc.lat) : null
    const startLng = startLoc ? num(startLoc.lng) : null
    return {
      planId: plan.id,
      planDate: plan.date,
      key: str(r.routeId),
      name: str(rj.routeName ?? meta.routeName ?? r.routeName) || str(r.routeName) || 'Route',
      dockName: str(r.dock),
      driverId: num(r.fieldExecutiveId),
      helperIds: (Array.isArray(r.helperIds) ? r.helperIds : []).map((h) => num(h)).filter((h): h is number => h !== null),
      vehicleId: str(meta.vehicleId ?? rj.vehicleId),
      startHHMM: str(meta.startTime),
      endHHMM: str(meta.endTime),
      distanceKm: num(rj.totalDistance),
      totalTimeLabel: str(rj.totalTime),
      co2: num(rj.co2),
      zone: str(rj.zoneName),
      trailer: str(rj.trailerNumber),
      stateNum: num(r.state),
      stops,
      latLngs,
      startLocation: startLat !== null && startLng !== null ? { lat: startLat, lng: startLng } : null,
      raw: r,
    }
  })
}

export async function fetchDrivers(hubId: number): Promise<DriverCard[]> {
  const payload = await call<unknown[]>(`/staging/app/rest/users/getAllFieldExecutiveList?hubId=${hubId}&serviceProviderAssignment=false`)
  return (Array.isArray(payload) ? payload : []).filter(isObj).map((d) => ({
    id: num(d.id),
    employeeCode: str(d.employeeCode),
    fullName: [str(d.firstName), str(d.lastName)].filter(Boolean).join(' ') || str(d.employeeCode),
    userType: str(d.userTypeName),
    loggedIn: String(d.isLoggedIn).toLowerCase() === 'true',
    raw: d,
  }))
}

/* ---------------------------------------------------- trips (execution) -- */

function mapTrip(t: Obj): TripCard {
  const att = isObj(t.trip_consignment_attempts_count) ? t.trip_consignment_attempts_count : {}
  const stops: TripStop[] = (Array.isArray(t.trip_stops) ? t.trip_stops : []).filter(isObj).map((s) => ({
    sequence: num(s.sequence) ?? 0,
    label: str(s.label),
    consignmentKeys: (Array.isArray(s.consignment_keys) ? s.consignment_keys : []).map((k) => str(k)),
    state: str(s.state),
    status: str(s.status),
    etaUtc: str(s.eta) || null,
    etcUtc: str(s.etc) || null,
    windowStartUtc: str(s.start_time) || null,
    windowEndUtc: str(s.end_time) || null,
    weight: num(s.weight),
    weightUom: str(s.weight_uom),
    address: str(s.address),
    pickupCount: num(s.consignment_pickup_count) ?? 0,
    deliveryCount: num(s.consignment_delivery_count) ?? 0,
    returnCount: num(s.consignment_return_count) ?? 0,
  })).sort((a, b) => a.sequence - b.sequence)
  return {
    tripKey: str(t.trip_key),
    routeKey: str(t.route_key),
    name: str(t.name) || str(t.trip_key),
    state: str(t.state).toUpperCase(),
    status: str(t.status).toUpperCase(),
    driverCode: str(t.assigned_user_code),
    driverId: num(t.assigned_user_id),
    helpers: (Array.isArray(t.helpers) ? t.helpers : []).map((h) => str(h)),
    vehicleNumber: str(t.vehicle_number),
    dispatchHub: str(t.dispatch_hub),
    dispatchDateUtc: str(t.dispatch_date) || null,
    expectedStartUtc: str(t.expected_start_time) || null,
    expectedEndUtc: str(t.expected_end_time) || null,
    isPreload: t.is_preload === true,
    attempts: {
      total: num(att.total) ?? 0,
      successful: num(att.successful) ?? 0,
      failed: num(att.failed) ?? 0,
      partial: num(att.partial) ?? 0,
    },
    stops,
    raw: t,
  }
}

/**
 * All active trips for the session hub. POST only (GET → 405), body `{}` works;
 * the response is paginated so we walk pages defensively — if the server
 * ignores our page param and repeats page 1, the seen-set stops the loop.
 */
export async function fetchTrips(): Promise<TripsResult> {
  const seen = new Set<string>()
  const trips: TripCard[] = []
  let timezone = ''
  let total = 0
  for (let page = 1; page <= 10; page++) {
    const payload = await call<Obj>('/staging/sbs/app/trip/get_active_trips', {
      method: 'POST',
      body: JSON.stringify({ page, page_size: 50 }),
    })
    timezone = str(payload.timezone) || timezone
    total = num(payload.total_records) ?? total
    const batch = (Array.isArray(payload.trips) ? payload.trips : []).filter(isObj)
    let fresh = 0
    for (const t of batch) {
      const key = str(t.trip_key)
      if (!key || seen.has(key)) continue
      seen.add(key)
      trips.push(mapTrip(t))
      fresh++
    }
    if (!fresh || !batch.length || trips.length >= total) break
  }
  return { timezone, totalRecords: total || trips.length, trips }
}

/* --------------------------------------------- polite fetching utilities -- */

/** Staging 503s under parallel bursts — cap concurrent planning-API calls. */
function createLimiter(max: number) {
  let active = 0
  const queue: (() => void)[] = []
  return async function limit<T>(fn: () => Promise<T>): Promise<T> {
    if (active >= max) await new Promise<void>((resolve) => queue.push(resolve))
    active++
    try {
      return await fn()
    } finally {
      active--
      queue.shift()?.()
    }
  }
}
const planLimit = createLimiter(4)

/** Retry transient failures (503/429/5xx) with jittered backoff; auth errors surface immediately. */
async function withRetry<T>(fn: () => Promise<T>, tries = 3): Promise<T> {
  let lastErr: unknown
  for (let attempt = 0; attempt < tries; attempt++) {
    try {
      return await fn()
    } catch (e) {
      lastErr = e
      const status = e instanceof ApiError ? e.status : 0
      if (status === 401 || status === 403 || (status >= 400 && status < 500 && status !== 429)) throw e
      await new Promise((r) => setTimeout(r, 400 * (attempt + 1) * (1 + Math.random())))
    }
  }
  throw lastErr
}

/* ----------------------------------------------- route geometry (for map) -- */

export interface RouteGeo {
  route: RouteCard
  planId: number
}

const geoCache = new Map<string, RouteGeo | null>()

/**
 * Trips carry NO coordinates — the map needs the planning data. Find the
 * route (and its plan id) by scanning routing history ±3 days around the
 * trip's dispatch date for a route whose routeId equals the trip's route_key.
 * Result (or the miss) is cached per route key.
 */
const geoInflight = new Map<string, Promise<RouteGeo | null>>()

export function fetchRouteGeometry(routeKey: string, aroundYMD: string, hubId: number | null): Promise<RouteGeo | null> {
  if (geoCache.has(routeKey)) return Promise.resolve(geoCache.get(routeKey) ?? null)
  const inflight = geoInflight.get(routeKey)
  if (inflight) return inflight
  const p = (async () => {
    const base = aroundYMD ? new Date(`${aroundYMD}T00:00:00Z`) : new Date()
    const day = (offset: number) => new Date(base.getTime() + offset * 86400_000).toISOString().slice(0, 10)
    const plans = await withRetry(() => fetchPlans(day(-3), day(3), hubId))
    // concurrent scan, but capped + retried — staging 503s under raw bursts
    const results = await Promise.all(plans.map((plan) => planLimit(async () => {
      try {
        const routes = await withRetry(() => fetchRoutesForPlan(plan))
        const route = routes.find((r) => r.key === routeKey)
        return route ? { route, planId: plan.id } : null
      } catch {
        return null
      }
    })))
    const hit = results.find((r) => r !== null) ?? null
    geoCache.set(routeKey, hit)
    return hit
  })()
  geoInflight.set(routeKey, p)
  void p.finally(() => geoInflight.delete(routeKey))
  return p
}

/**
 * Bulk route lookup for a date range — one plans fetch + parallel route
 * fetches, returning routeKey → {route, planId}. Used to enrich trip rows
 * with planning-side data (distance, duration) and to pre-seed the geometry
 * cache so the map opens instantly.
 */
const indexCache = new Map<string, Promise<Map<string, RouteGeo>>>()

export function fetchRouteIndex(fromYMD: string, toYMD: string, hubId: number | null): Promise<Map<string, RouteGeo>> {
  const cacheKey = `${fromYMD}|${toYMD}|${hubId ?? ''}`
  const hit = indexCache.get(cacheKey)
  if (hit) return hit
  const p = (async () => {
    const index = new Map<string, RouteGeo>()
    const plans = await withRetry(() => fetchPlans(fromYMD, toYMD, hubId))
    await Promise.all(plans.map((plan) => planLimit(async () => {
      try {
        const routes = await withRetry(() => fetchRoutesForPlan(plan))
        for (const r of routes) {
          if (!index.has(r.key)) index.set(r.key, { route: r, planId: plan.id })
        }
      } catch { /* skip unreadable plan */ }
    })))
    for (const [k, v] of index) {
      if (!geoCache.has(k)) geoCache.set(k, v)
    }
    return index
  })()
  indexCache.set(cacheKey, p)
  p.catch(() => indexCache.delete(cacheKey))
  return p
}

/**
 * Per-consignment coordinates from the routing REQUEST payload
 * (get_route_data_by_id): jobs[] carry latitude/longitude plus referenceNo /
 * consignmentVO.consignmentNumber — exactly what the trip's consignment_keys
 * match against. jobLatLngs on the route itself is unreliable (it repeats the
 * hub coordinate), so this is the primary source for the map.
 */
export interface JobInfo {
  lat: number
  lng: number
  name: string
  /** consignment-level flags surfaced as tags: Hazmat, VIP, 4-Person, Dedicated Truck */
  tags: string[]
}

const jobCache = new Map<number, Promise<Map<string, JobInfo>>>()

export function fetchJobCoords(planId: number): Promise<Map<string, JobInfo>> {
  const cached = jobCache.get(planId)
  if (cached) return cached
  const p = planLimit(() => withRetry(() => loadJobCoords(planId)))
  jobCache.set(planId, p)
  p.catch(() => jobCache.delete(planId))
  return p
}

async function loadJobCoords(planId: number): Promise<Map<string, JobInfo>> {
  const payload = await call<Obj>(`/staging/app/rest/get_route_data_by_id?id=${planId}&isRateBasedActive=false&serviceProviderAssignment=false`)
  const jobs = Array.isArray(payload.jobs) ? payload.jobs : []
  const out = new Map<string, JobInfo>()
  for (const j of jobs.filter(isObj)) {
    const lat = num(j.latitude)
    const lng = num(j.longitude)
    if (lat === null || lng === null) continue
    const cv = isObj(j.consignmentVO) ? j.consignmentVO : {}
    const tags: string[] = []
    if (j.hazmat === true) tags.push('Hazmat')
    if (j.vip === true) tags.push('VIP')
    if (cv.fourPerson === true) tags.push('4-Person')
    if (cv.dedicatedTruck === true) tags.push('Dedicated Truck')
    const entry = { lat, lng, name: str(j.customerName), tags }
    for (const key of [str(j.referenceNo), str(cv.consignmentNumber)]) {
      if (key) out.set(key, entry)
    }
  }
  return out
}

/* --------------------------------------------------- assignment (WRITES) -- */

export interface AssignArgs {
  session: SessionInfo
  /** routeId / trip route_key, e.g. "615563020-0" */
  key: string
  /** routing plan id — null when assigning straight from a trip (trips carry no plan reference) */
  routingId: number | null
  /** YYYY-MM-DD, hub-local */
  deliveryDate: string
  driver: DriverCard
  helperIds?: number[]
  helperNames?: string[]
}

/** The captured three-step sequence. Only runs when the write toggle is armed. */
export async function assignDriver({ session, key, routingId, deliveryDate, driver, helperIds = [], helperNames = [] }: AssignArgs) {
  await call('/staging/sbs/routing_consignment/validate_assignment', {
    method: 'POST',
    body: JSON.stringify([key]),
  })
  await call(`/staging/app/rest/validate_earliest_start_time?dispatchDate=${deliveryDate}&earliestStartTime=23:59`)
  return call('/staging/sbs/api/command/load/assign-from-route', {
    method: 'POST',
    body: JSON.stringify({
      user_id: session.userId,
      company_id: session.companyId,
      key,
      routing_id: routingId,
      assigned_user_id: driver.id,
      driver_name: driver.employeeCode,
      driver_full_name: driver.fullName,
      delivery_date: deliveryDate,
      helper_names: helperNames,
      helper_ids: helperIds,
    }),
  })
}
