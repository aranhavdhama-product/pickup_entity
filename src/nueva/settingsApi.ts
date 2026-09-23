/**
 * Custom Settings data layer — all calls go through the Vite `/staging` proxy
 * (cookie + XSRF injected server-side). Verified live against staging 2026-08-26:
 *
 *  - POST /master/api/v1/moduleSettings/fetch  → paged {totalElements, content:[ModuleSetting]}
 *      body {} for all, or {pageNumber, pageSize, query:[{attribute:'code',
 *      condition:'equals'|'isAny', values:[...]}]} to filter by code.
 *      `settingJson` is a JSON-encoded STRING.
 *  - PUT  /master/api/v1/moduleSettings  → update EXISTING rows. Body is an ARRAY
 *      [{enabled, code, name, settingJson}]. Response {successCount, successList:
 *      [{code}], failureCount, failureList}.
 *  - POST /master/api/v1/moduleSettings  → CREATE rows (same body/response).
 *      The Base Modules screen POSTs when a code has no row yet (absent = toggle
 *      off), PUTs afterwards — captured live from the real console.
 */

export interface ModuleSetting {
  id?: number
  companyId?: number
  code: string
  name: string
  enabled: boolean
  settingJson: string | null
  createdAt?: string
  lastUpdatedAt?: string
}

interface SaveResult {
  successCount: number
  successList: { code: string }[] | null
  failureCount: number
  failureList: unknown
}

const JSON_HEADERS = { 'Content-Type': 'application/json' }

/** Server validation reasons arrive as Go-validator internals
 * ("Key: 'BranchMaster.Longitude' Error:Field validation for 'Longitude'
 * failed on the 'min' tag") — never show that to a user. */
export function humanizeReason(reason: string): string {
  const m = reason.match(/Field validation for '(\w+)' failed on the '(\w+)' tag/)
  if (m) {
    const field = m[1].replace(/([a-z])([A-Z])/g, '$1 $2')
    if (m[2] === 'required') return `${field} is required.`
    if (m[2] === 'min' || m[2] === 'max') return `${field} is outside the allowed range.`
    return `${field} has an invalid value.`
  }
  if (/invalid request body/i.test(reason)) return 'Some fields have invalid values — please review the form.'
  if (/Invalid master type/i.test(reason)) return 'This record type does not support that operation.'
  return reason
}

export async function fetchModuleSettings(codes?: string[]): Promise<ModuleSetting[]> {
  const body = codes?.length
    ? { pageNumber: 1, pageSize: Math.max(codes.length, 50), query: [{ attribute: 'code', condition: 'isAny', values: codes }] }
    : {}
  const res = await fetch('/staging/master/api/v1/moduleSettings/fetch', {
    method: 'POST', headers: JSON_HEADERS, body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`moduleSettings/fetch ${res.status}`)
  const data = await res.json()
  return (data.content ?? []) as ModuleSetting[]
}

/** Create (POST, no row yet) or update (PUT, row exists) module settings rows. */
export async function saveModuleSettings(rows: ModuleSetting[], exists: boolean): Promise<SaveResult> {
  const res = await fetch('/staging/master/api/v1/moduleSettings', {
    method: exists ? 'PUT' : 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(rows.map(({ enabled, code, name, settingJson }) => ({ enabled, code, name, settingJson }))),
  })
  if (!res.ok) throw new Error(`moduleSettings save ${res.status}`)
  const data = (await res.json()) as SaveResult
  if (data.failureCount > 0) throw new Error(`moduleSettings save failed for ${data.failureCount} row(s)`)
  return data
}

/* ---------------- SKU master (/master/api/v1/sku*) ----------------
 * Verified live 2026-08-27 against staging (company 20773):
 *  - POST /master/api/v1/sku/fetch  → same paged envelope as moduleSettings
 *      {totalElements, totalPage, currentPage, pageSize, content:[SkuMasterRow]}.
 *      Body {pageNumber, pageSize}. (query filters 500 on this endpoint —
 *      filter client-side.)
 *  - POST /master/api/v1/sku  → CREATE, array body; `code` is REQUIRED and must
 *      mirror skuCode ("Field validation for 'Code' failed" without it).
 *  - PUT  /master/api/v1/sku  → UPDATE, same array body incl. id.
 *      Response for both: {successCount, successList:[{code}], failureCount, failureList[{reason}]}. */

export interface SkuMasterRow {
  id?: number
  companyId?: number
  enabled: boolean
  /** REQUIRED on create/update; always keep = skuCode */
  code?: string
  skuCode: string
  skuCategory: string
  hub: string[]
  description: string
  length: number | null
  breadth: number | null
  height: number | null
  weight: number | null
  uomDimensions: string
  uomWeight: string
  stackable: boolean
  /** Harmonised System code for customs / tax classification (e.g. 220429). */
  hsnCode?: string
  /** Country of manufacture, as a display name (e.g. "India"). */
  originCountry?: string
  createdAt?: string
  lastUpdatedAt?: string
}

export async function fetchSkuMaster(pageSize = 200): Promise<SkuMasterRow[]> {
  const res = await fetch('/staging/master/api/v1/sku/fetch', {
    method: 'POST', headers: JSON_HEADERS,
    body: JSON.stringify({ pageNumber: 1, pageSize }),
  })
  if (!res.ok) throw new Error(`sku/fetch ${res.status}`)
  const data = await res.json()
  return (data.content ?? []) as SkuMasterRow[]
}

/** Create (POST) or update (PUT) SKU master rows. `code` is forced = skuCode. */
export async function saveSkuMaster(rows: SkuMasterRow[], exists: boolean): Promise<SaveResult> {
  const res = await fetch('/staging/master/api/v1/sku', {
    method: exists ? 'PUT' : 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(rows.map((r) => ({ ...r, code: r.skuCode }))),
  })
  if (!res.ok) throw new Error(`sku save ${res.status}`)
  const data = (await res.json()) as SaveResult
  if (data.failureCount > 0) {
    const reason = (data.failureList as { reason?: string }[] | null)?.[0]?.reason
    console.error('[sku] save failure:', data.failureList)
    throw new Error(reason ? humanizeReason(reason) : `SKU save failed for ${data.failureCount} row(s)`)
  }
  return data
}

/* ---------------- Generic master-service entities ----------------
 * The master service exposes one uniform contract per entity (verified live
 * 2026-08-27): POST /master/api/v1/<entity>/fetch (paged envelope), POST
 * <entity> = create, PUT <entity> = update — array bodies, `code` required.
 * Live entities on prod0003: sku, serviceType, packageType, consignmentType,
 * vas, sortCode, slot, palletSpace, tagMaster. (businessParameter/reason use a
 * different service — their pages stay on the static replica.) */

export type MasterRecord = Record<string, unknown> & { id?: number; enabled: boolean; code?: string }

export async function fetchMasterRows(entity: string, pageSize = 200): Promise<MasterRecord[]> {
  const res = await fetch(`/staging/master/api/v1/${entity}/fetch`, {
    method: 'POST', headers: JSON_HEADERS,
    body: JSON.stringify({ pageNumber: 1, pageSize }),
  })
  if (!res.ok) throw new Error(`${entity}/fetch ${res.status}`)
  const data = await res.json()
  return (data.content ?? []) as MasterRecord[]
}

/** Create (POST) or update (PUT). `code` is forced from codeKey's value. */
export async function saveMasterRows(entity: string, rows: MasterRecord[], exists: boolean, codeKey = 'code'): Promise<SaveResult> {
  const res = await fetch(`/staging/master/api/v1/${entity}`, {
    method: exists ? 'PUT' : 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(rows.map((r) => ({ ...r, code: String(r[codeKey] ?? r.code ?? '') }))),
  })
  if (!res.ok) {
    if (res.status === 502 || res.status === 503 || res.status === 504) {
      throw new Error('The master service is temporarily unavailable — your changes were NOT saved. Please try again in a minute.')
    }
    throw new Error(`${entity} save ${res.status}`)
  }
  const data = (await res.json()) as SaveResult
  if (data.failureCount > 0) {
    const reason = (data.failureList as { reason?: string }[] | null)?.[0]?.reason
    console.error(`[${entity}] save failure:`, data.failureList)
    throw new Error(reason ? humanizeReason(reason) : `${entity} save failed for ${data.failureCount} row(s)`)
  }
  return data
}

/** Hub CODES from the master-service hub entity — hub dropdowns must offer
 * codes, not display names: the server validates hub references against the
 * hub master's `code` ("hub code not found" when sent a name). */
export async function fetchHubCodes(): Promise<string[]> {
  const rows = await fetchMasterRows('hub')
  return rows.map((r) => String(r.code ?? '')).filter(Boolean).sort()
}

/* ---------------- Branch form dropdown sources (same as staging) ----------------
 * Captured from staging's own Edit Branch form (2026-08-27):
 *  - Time Zone:  GET /v1/app/rest/get_current_company_and_time_zones → 200
 *      {timeZone, allowMultipleTimeZone, companyTimeZoneList[]} — the dropdown is
 *      companyTimeZoneList, falling back to the single company timeZone ("Default").
 *  - Holiday Master: GET /app/rest/holidayMasters → 403 FOR STAGING ITSELF on this
 *      account (no permission/data) — staging shows an empty dropdown; we fall back
 *      to a text input, which is strictly more usable.
 *  - Routing Configuration: GET /app/rest/routing_configuration → 404 on staging
 *      too (service absent on this account) — same fallback. */

export async function fetchCompanyTimeZones(): Promise<string[]> {
  return cached('timezones', 300_000, async () => {
    const res = await fetch('/staging/v1/app/rest/get_current_company_and_time_zones')
    if (!res.ok) throw new Error(`get_current_company_and_time_zones ${res.status}`)
    const d = await res.json() as { timeZone?: string; companyTimeZoneList?: string[] }
    return Array.isArray(d.companyTimeZoneList) && d.companyTimeZoneList.length > 0
      ? d.companyTimeZoneList
      : (d.timeZone ? [d.timeZone] : [])
  })
}

/* holidayMasters 403s and routing_configuration 404s on this account (even for
 * staging's own form) — resolve to [] and CACHE it so the console sees one
 * failed request per session, not one per render. */
export async function fetchHolidayMasters(): Promise<{ value: string; label: string }[]> {
  return cached('holidayMasters', 600_000, async () => {
    const res = await fetch('/staging/app/rest/holidayMasters')
    if (!res.ok) return []
    const d = await res.json() as { id?: unknown; code?: unknown; title?: unknown; name?: unknown }[]
    return (Array.isArray(d) ? d : []).map((h) => ({
      value: String(h.code ?? h.id ?? ''),
      label: String(h.title ?? h.name ?? h.code ?? h.id ?? ''),
    })).filter((h) => h.value)
  })
}

export async function fetchRoutingConfigs(): Promise<{ value: string; label: string }[]> {
  return cached('routingConfigs', 600_000, async () => {
    const res = await fetch('/staging/app/rest/routing_configuration')
    if (!res.ok) return []
    const d = await res.json() as { id?: unknown; name?: unknown; title?: unknown }[]
    return (Array.isArray(d) ? d : []).map((r) => ({
      value: String(r.id ?? ''),
      label: String(r.name ?? r.title ?? r.id ?? ''),
    })).filter((r) => r.value)
  })
}

/** Country list — same source as staging's branch form (GET /master/api/v1/
 * geofence/countries → {countries:[{code,name,count}]}). Value = ISO code
 * (what the cascade APIs key on), label = display name. */
export async function fetchCountries(): Promise<{ value: string; label: string }[]> {
  return cached('countries', 300_000, async () => {
    const res = await fetch('/staging/master/api/v1/geofence/countries')
    if (!res.ok) throw new Error(`geofence/countries ${res.status}`)
    const d = await res.json() as { countries?: { code?: string; name?: string }[] }
    return (d.countries ?? [])
      .filter((c) => c.code)
      .map((c) => ({ value: String(c.code), label: String(c.name ?? c.code) }))
  })
}

/** Geo suggestions — the branch form's address cascade, with the EXACT payload
 * captured from staging's own form (XHR body intercept, 2026-08-27):
 *   POST /master/api/v1/geofence/search
 *   {"query":"", "level":"state"|"pinCode"|"city"|"suburb", "countryCode":"US", "limit":30}
 * `level` is CASE-SENSITIVE lowercase — uppercase values are silently ignored
 * (that cost a day of "no state list exists" conclusions). */
export async function fetchGeoSuggestions(
  level: 'state' | 'pinCode' | 'city' | 'suburb',
  countryCode: string,
  query = '',
  limit = 500,
): Promise<{ value: string; label: string }[]> {
  if (!countryCode) return []
  const res = await fetch('/staging/master/api/v1/geofence/search', {
    method: 'POST', headers: JSON_HEADERS,
    body: JSON.stringify({ query, level, countryCode, limit }),
  })
  if (!res.ok) throw new Error(`geofence/search ${res.status}`)
  const d = await res.json() as { suggestions?: { value?: string; label?: string }[] }
  return (d.suggestions ?? [])
    .filter((x) => x.value)
    .map((x) => ({ value: String(x.value), label: String(x.label ?? x.value) }))
}

/** City master — same source as staging's branch City dropdown (GET /app/rest/
 * cities → [{id, name, enabled}]); branches link via cityId. */
export async function fetchCities(): Promise<{ value: string; label: string }[]> {
  return cached('cities', 300_000, async () => {
    const res = await fetch('/staging/app/rest/cities')
    if (!res.ok) throw new Error(`cities ${res.status}`)
    const d = await res.json() as { id?: number; name?: string; enabled?: boolean }[]
    return (Array.isArray(d) ? d : [])
      .filter((c) => c.id != null)
      .map((c) => ({ value: String(c.id), label: String(c.name ?? c.id) }))
  })
}

/** Dual-write: staging's Setup Branch UI runs on the LEGACY hub store
 * (POST /app/rest/hubs — the endpoint its own Re-activate flow uses), while
 * our form writes the master-service `branch` entity. The two do NOT sync on
 * this account (verified 2026-08-27: branch.enabled=true while legacy showed
 * the hub disabled), so every branch save/toggle also pushes the legacy row —
 * that is what makes edits appear in staging's UI and in the operational hub
 * lists. NOTE: legacy accepts negative longitudes (the master-service
 * validator does not), so it receives the REAL coordinates. */
export async function saveLegacyHub(row: MasterRecord): Promise<void> {
  const num = (v: unknown) => {
    const n = Number(v)
    return v == null || String(v).trim() === '' || isNaN(n) ? null : n
  }
  const str = (v: unknown) => (v == null ? '' : String(v).trim())
  const lat = num(row.latitude)
  const lng = num(row.longitude)
  const body: Record<string, unknown> = {
    ...(row.id != null ? { id: row.id } : {}),
    code: row.code,
    name: row.name,
    enabled: !!row.enabled,
    companyId: row.companyId ?? undefined,
    cityId: num(row.cityId),
    zipCode: str(row.zipcode) || null,
    // suburb lives in the hub row's top-level `region` column (verified: the
    // address-object `suburb` key is dropped by the legacy serializer)
    region: str(row.suburb) || null,
    // branch type persists as top-level hubType ('sc'/'cx')
    hubType: str(row.branchType) || null,
    timeZone: (typeof row.timeZone === 'string' && row.timeZone) || 'America/New_York',
    // the legacy address object is where staging's own form keeps these
    address: {
      contactPerson: str(row.contactPerson),
      contactNumber: str(row.contactPersonNumber),
      addressLine1: str(row.addressLine1),
      addressLine2: str(row.addressLine2),
      addressLine3: str(row.addressLine3),
      landmark: str(row.addressLine3),
      state: str(row.state),
      country: str(row.country),
      suburb: str(row.suburb),
    },
  }
  if (lat != null && lng != null) {
    body.latitude = lat
    body.longitude = lng
    body.hubLocation = `${lat},${lng}`
  }
  const res = await fetch('/staging/app/rest/hubs', {
    method: 'POST', headers: JSON_HEADERS, body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`hub save ${res.status}`)
}

/** kept as the afterSave alias — same primary legacy write */
export const syncLegacyHub = saveLegacyHub

/* ---------------- Network master — staging's EXACT endpoints ----------------
 * Captured from staging's Setup Branch wizard (XHR intercept, 2026-08-27):
 *  - Branch list:   GET  /v1/app/rest/hubs_page?pageNo&pageSize (Spring page;
 *      rows carry enabled/timeZone/hubType/cityId/zipCode + address OBJECT
 *      {contactPerson, contactNumber, addressLine1/2, state, country})
 *  - Branch write:  POST /app/rest/hubs (upsert; accepts the address object,
 *      top-level zipCode, negative longitudes)
 *  - Serviceable Areas list: POST /master/api/v2/branch/serviceableArea/list
 *  - Zone Master list:       POST /master/api/v2/branch/zoneMaster/list
 *      (both: {pageNumber,pageSize,query:[],sortControl,includeSubDetails,
 *       dynamicQuery} → moduleSettings-style envelope) */

/* PERFORMANCE — small in-memory TTL cache for slow, rarely-changing lookups
 * (hubs, cities, countries, time zones). These get refetched on every tab
 * switch and every form open; caching them makes My Network feel instant.
 * Pass force=true after a write that changes the underlying data. */
const _cache = new Map<string, { at: number; p: Promise<unknown> }>()
function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>, force = false): Promise<T> {
  const hit = _cache.get(key)
  if (!force && hit && Date.now() - hit.at < ttlMs) return hit.p as Promise<T>
  const p = fn().catch((e) => { _cache.delete(key); throw e })
  _cache.set(key, { at: Date.now(), p })
  return p
}

/** Routing configurations (staging's general_settings_list) — the Add form
 * shows only the routing types with an ENABLED configuration; entries carry
 * {enabled, routingType (option id)}. Cached; [] when the module is off. */
export async function fetchRoutingGeneralSettings(): Promise<{ enabled?: boolean; routingType?: number }[]> {
  return cached('routing_general_settings', 300_000, async () => {
    const res = await fetch('/staging/app/rest/general_settings_list')
    if (!res.ok) throw new Error(`general_settings_list ${res.status}`)
    const d = await res.json()
    return Array.isArray(d) ? d : []
  }).catch(() => [])
}

export async function fetchHubsPage(pageSize = 200, force = false): Promise<MasterRecord[]> {
  return cached(`hubs_page:${pageSize}`, 60_000, async () => {
    const res = await fetch(`/staging/v1/app/rest/hubs_page?pageNo=0&pageSize=${pageSize}`)
    if (!res.ok) throw new Error(`hubs_page ${res.status}`)
    const d = await res.json() as { content?: MasterRecord[] }
    return d.content ?? []
  }, force)
}

/** carriers (Setup Carrier Network store) — feeds the zone Carrier multiselect;
 * staging's exact body captured from its wizard bundle */
export async function fetchCarriers(): Promise<string[]> {
  return cached('carriers', 300_000, async () => {
    const res = await fetch('/staging/ship/app/rest/carrier_master/filtered', {
      method: 'POST', headers: JSON_HEADERS,
      body: JSON.stringify({
        conditions: [{ condition: 'EQUALS', filter_key: 'is_active', filter_values: [true] }],
        page: 0, size: 100, sort_by: 'code', sort_type: 'ASC',
      }),
    })
    if (!res.ok) return []
    const d = await res.json() as { data?: { carrier_master_list?: { code?: string; name?: string }[] } }
    return (d.data?.carrier_master_list ?? []).map((c) => String(c.code ?? c.name ?? '')).filter(Boolean)
  })
}

/* ---------------- Hub geofences — staging's EXACT endpoints ----------------
 * Geofences are ALSO dual-store (like branches). Staging's Manage Geofence
 * page runs on the LEGACY hub-fence store, captured live 2026-08-27:
 *  - List:    GET  /v1/app/rest/geoFencing_data_for_hub?hubId&cityId → array
 *  - Save:    POST /v1/app/rest/geoFencing_data_for_hub?hubId with an ARRAY
 *      of fence rows (UPSERT — id present = update, id absent = create;
 *      rows missing from the array are untouched)
 *  - Delete:  POST /v1/app/rest/geoFencing_data_for_hub/delete?id=<fenceId>
 *  - Counts:  GET  /app/rest/geoFencing_data_for_multiple_hub?hubIdList=<csv>
 *      &showSmartSuggestion=false → all fences across hubs in one call
 * geoData is a STRINGIFIED {geoJSON: Feature{properties:{color,fillColor},
 * geometry: Polygon}}. The master `branchGeofence` entity is a separate store
 * staging's page never reads — do not write fences there. */

export interface HubGeofence {
  id?: number
  name: string
  companyId?: number
  hubId: number
  geoData: string
  colorCode?: string | null
  priority?: number | null
  enabled?: boolean
  fenceType?: number
  travelingMode?: string
  labels?: unknown
  mergedZipCodes?: unknown
  [key: string]: unknown
}

/** parse the stringified geoData wrapper → polygon ring ([lng,lat][]) or null */
export function ringOfFence(f: HubGeofence): [number, number][] | null {
  try {
    const g = JSON.parse(String(f.geoData ?? '')) as {
      geoJSON?: { geometry?: { type?: string; coordinates?: [number, number][][] } }
    }
    const geom = g.geoJSON?.geometry
    if (geom?.type === 'Polygon' && geom.coordinates?.[0]?.length) return geom.coordinates[0]
  } catch { /* malformed geoData */ }
  return null
}

/** build the stringified geoData wrapper staging stores */
export function geoDataOf(ring: [number, number][], color = '#3388ff'): string {
  return JSON.stringify({
    geoJSON: {
      type: 'Feature',
      properties: { color, fillColor: color },
      geometry: { type: 'Polygon', coordinates: [ring] },
    },
  })
}

export async function fetchHubGeofences(hubId: number | string, cityId?: number | string | null): Promise<HubGeofence[]> {
  const city = cityId == null || String(cityId) === '' ? '' : `&cityId=${cityId}`
  const res = await fetch(`/staging/v1/app/rest/geoFencing_data_for_hub?hubId=${hubId}${city}`)
  if (!res.ok) throw new Error(`geofences ${res.status}`)
  return await res.json() as HubGeofence[]
}

export async function fetchGeofencesForHubs(hubIds: (number | string)[]): Promise<HubGeofence[]> {
  if (!hubIds.length) return []
  const res = await fetch(`/staging/app/rest/geoFencing_data_for_multiple_hub?hubIdList=${hubIds.join(',')}&showSmartSuggestion=false`)
  if (!res.ok) throw new Error(`geofences ${res.status}`)
  return await res.json() as HubGeofence[]
}

export async function saveHubGeofences(hubId: number | string, fences: HubGeofence[]): Promise<HubGeofence[]> {
  const res = await fetch(`/staging/v1/app/rest/geoFencing_data_for_hub?hubId=${hubId}`, {
    method: 'POST', headers: JSON_HEADERS, body: JSON.stringify(fences),
  })
  if (!res.ok) throw new Error(`geofence save ${res.status}`)
  return await res.json() as HubGeofence[]
}

export async function deleteHubGeofence(id: number | string): Promise<void> {
  const res = await fetch(`/staging/v1/app/rest/geoFencing_data_for_hub/delete?id=${id}`, {
    method: 'POST', headers: JSON_HEADERS, body: '{}',
  })
  if (!res.ok) throw new Error(`geofence delete ${res.status}`)
}

/* ---------------- Location Master address cascade ----------------
 * Staging's Location Master (entity `businessUnitLocation`) fills its address
 * with these three calls (captured from the bundle, verified live):
 *  - countries: GET /master/api/v1/branch/serviceableArea/serviceableCountry
 *  - postcodes: GET .../serviceablePostalcode?country=<NAME> (name, not code!)
 *  - area info: GET .../serviceableArea?country=<NAME>&postalCode=<code>
 *      → {serviceableArea:{county, city, state, …}} — county maps to suburb */

export async function fetchServiceableCountries(): Promise<{ value: string; label: string; code: string }[]> {
  return cached('svcCountries', 300_000, async () => {
    const res = await fetch('/staging/master/api/v1/branch/serviceableArea/serviceableCountry')
    if (!res.ok) return []
    const d = await res.json() as { country?: { code?: string; name?: string }[] }
    return (d.country ?? []).filter((c) => c.name)
      .map((c) => ({ value: String(c.name), label: String(c.name), code: String(c.code ?? '') }))
  })
}

export async function fetchServiceablePostcodes(countryName: string): Promise<{ value: string; label: string }[]> {
  if (!countryName) return []
  const res = await fetch(`/staging/master/api/v1/branch/serviceableArea/serviceablePostalcode?country=${encodeURIComponent(countryName)}`)
  if (!res.ok) return []
  const d = await res.json() as { postalCode?: string[] }
  return (d.postalCode ?? []).map((p) => ({ value: String(p), label: String(p) }))
}

export async function fetchServiceableAreaInfo(countryName: string, postalCode: string): Promise<{ suburb: string; city: string; state: string } | null> {
  const res = await fetch(`/staging/master/api/v1/branch/serviceableArea/serviceableArea?country=${encodeURIComponent(countryName)}&postalCode=${encodeURIComponent(postalCode)}`)
  if (!res.ok) return null
  const d = await res.json() as { serviceableArea?: { county?: string; city?: string; state?: string } }
  const a = d.serviceableArea
  return a ? { suburb: String(a.county ?? ''), city: String(a.city ?? ''), state: String(a.state ?? '') } : null
}

/* Define-Area location search — the same APIs staging's wizard uses:
 *  - zip suggestions: GET /master/api/v1/geofence/postalCode/suggestions
 *  - zip boundary:    GET /master/api/v1/geofence?postalCode&countryCode
 *      → {city, country, geom: STRINGIFIED GeoJSON Polygon|MultiPolygon}
 *  - address search:  GET /app/rest/geoCoding_v2?query → {latitude, longitude} */

export async function fetchZipSuggestions(countryCode: string, query: string): Promise<string[]> {
  const res = await fetch(`/staging/master/api/v1/geofence/postalCode/suggestions?postalCode=${encodeURIComponent(query)}&countryCode=${countryCode}`)
  if (!res.ok) return []
  const d = await res.json() as { suggestions?: string[] }
  return d.suggestions ?? []
}

export async function fetchZipBoundary(postalCode: string, countryCode: string): Promise<{ city: string; ring: [number, number][] } | null> {
  const res = await fetch(`/staging/master/api/v1/geofence?postalCode=${encodeURIComponent(postalCode)}&countryCode=${countryCode}`)
  if (!res.ok) return null
  const d = await res.json() as { city?: string; geom?: string }
  try {
    const geom = JSON.parse(String(d.geom ?? '')) as { type?: string; coordinates?: unknown }
    let ring: [number, number][] | null = null
    if (geom.type === 'Polygon') ring = (geom.coordinates as [number, number][][])[0]
    else if (geom.type === 'MultiPolygon') {
      // take the largest part so islands don't win over the mainland shape
      const polys = geom.coordinates as [number, number][][][]
      ring = polys.map((p) => p[0]).sort((a, b) => b.length - a.length)[0] ?? null
    }
    return ring && ring.length >= 3 ? { city: String(d.city ?? ''), ring } : null
  } catch { return null }
}

export async function geocodeAddress(query: string): Promise<{ lat: number; lng: number } | null> {
  const res = await fetch(`/staging/app/rest/geoCoding_v2?query=${encodeURIComponent(query)}`)
  if (!res.ok) return null
  const d = await res.json() as { latitude?: string | number; longitude?: string | number }
  const lat = Number(d.latitude), lng = Number(d.longitude)
  return isFinite(lat) && isFinite(lng) ? { lat, lng } : null
}

/* ---------------- Serviceable Areas — staging's EXACT endpoints ----------------
 * Captured live from the My Network wizard step 2 (2026-08-27):
 *  - List:    POST /master/api/v2/branch/serviceableArea/list
 *      (includeSubDetails: true → rows carry serviceableRule)
 *  - Create:  POST /master/api/v2/branch/serviceableArea → 201
 *      {branchId, branchName, enabled, country, source:"GLOBAL_GEOFENCES",
 *       serviceableRule:[{key: state|city|suburb|postal_code,
 *                         value:[{value, alias}], exclusions:[]}]}
 *  - Update:  PUT same path with the FULL row (id) — APPEND-ONLY: the server
 *      rejects removing rule keys ("removing rule keys is not allowed") AND
 *      removing values ("deleting existing values is not allowed"); flipping
 *      `enabled` and adding keys/values is fine. There is NO delete.
 *  - Filters: POST /master/api/v2/branch/serviceableArea/filters →
 *      {branch_name:[], country:[]}
 * Area options come from the same POST /master/api/v1/geofence/search cascade
 * (levels state / city / suburb / pinCode). */

/** exclusions carve areas OUT of a rule — value is a plain string array
 * (objects → 400). CREATE-ONLY: adding exclusions on update is rejected
 * ("adding exclusions is not allowed"), like every other rule change. */
export interface RuleExclusion {
  key: string
  value: string[]
}

export interface ServiceableRule {
  key: string
  value: { value: string; alias: string }[]
  exclusions: RuleExclusion[]
}

export async function fetchServiceableAreas(pageSize = 200): Promise<MasterRecord[]> {
  const res = await fetch('/staging/master/api/v2/branch/serviceableArea/list', {
    method: 'POST', headers: JSON_HEADERS,
    body: JSON.stringify({
      pageNumber: 1, pageSize, query: [],
      sortControl: { sortOn: '', sortDirection: '' },
      includeSubDetails: true, dynamicQuery: [],
    }),
  })
  if (!res.ok) throw new Error(`serviceableArea/list ${res.status}`)
  const d = await res.json() as { content?: MasterRecord[] }
  return d.content ?? []
}

export async function saveServiceableArea(row: MasterRecord, exists: boolean): Promise<void> {
  const res = await fetch('/staging/master/api/v2/branch/serviceableArea', {
    method: exists ? 'PUT' : 'POST', headers: JSON_HEADERS, body: JSON.stringify(row),
  })
  if (!res.ok) {
    let msg = `serviceable area save ${res.status}`
    try {
      const err = String(((await res.json()) as { error?: string }).error ?? '')
      // the append-only rules produce specific server messages — translate them
      if (/removing rule keys is not allowed|deleting existing values is not allowed/.test(err)) {
        msg = 'Serviceable areas can only grow — existing areas cannot be removed. Add new areas, or disable this coverage instead.'
      } else if (err) msg = err
    } catch { /* opaque body */ }
    throw new Error(msg)
  }
}

/* ---------------- Zone Master — staging's EXACT endpoints ----------------
 * Captured live from the My Network wizard step 3 (2026-08-27):
 *  - List:    POST /master/api/v2/branch/zoneMaster/list → rows {id, branch_id,
 *      carrier[], service_type[], level, source, stats:{total_serviceable_areas,
 *      eta_zone_configured, billing_zone_configured, sort_code_configured,
 *      availability_configured}}
 *  - Filters: POST /master/api/v2/branch/zoneMaster/filters → {branches}
 *  - Areas:   POST /master/api/v2/branch/zoneMaster/serviceableArea
 *      {…page…, branch_id:"<id>", level, is_edit_mode} → the branch's
 *      serviceable areas expanded at that level; with is_edit_mode:true mapped
 *      rows carry eta_zone_name / billing_zone_name / sort_code
 *  - Create:  POST /master/api/v2/branch/zoneMaster → 201 {branch_id, carrier:[],
 *      service_type:[], level, zone_masters:[{level_value, eta_zone_name,
 *      billing_zone_name, sort_code, availability}], excluded_areas:[]}
 * Levels are the serviceable-rule keys: state | city | suburb | postal_code |
 * country ("invalid level: zipcode" — the UI label Zipcode maps to postal_code). */

export async function fetchZoneMasters(pageSize = 200): Promise<MasterRecord[]> {
  const res = await fetch('/staging/master/api/v2/branch/zoneMaster/list', {
    method: 'POST', headers: JSON_HEADERS,
    body: JSON.stringify({
      pageNumber: 1, pageSize, query: [],
      sortControl: { sortOn: '', sortDirection: 'DESC' },
      includeSubDetails: false, dynamicQuery: [],
    }),
  })
  if (!res.ok) throw new Error(`zoneMaster/list ${res.status}`)
  const d = await res.json() as { content?: MasterRecord[] }
  return d.content ?? []
}

export async function fetchZoneBranches(): Promise<{ id: number; branchName: string }[]> {
  const res = await fetch('/staging/master/api/v2/branch/zoneMaster/filters', {
    method: 'POST', headers: JSON_HEADERS,
    body: JSON.stringify({
      pageNumber: 1, pageSize: 500, query: [],
      sortControl: { sortOn: '', sortDirection: '' },
      includeSubDetails: false, dynamicQuery: [],
    }),
  })
  if (!res.ok) return []
  const d = await res.json() as { branches?: { id: number; branchName: string }[] }
  return d.branches ?? []
}

export async function fetchZoneAreas(
  branchId: number | string, level: string, pageNumber = 1, pageSize = 10, editMode = false,
): Promise<{ total: number; rows: MasterRecord[] }> {
  const res = await fetch('/staging/master/api/v2/branch/zoneMaster/serviceableArea', {
    method: 'POST', headers: JSON_HEADERS,
    body: JSON.stringify({
      pageNumber, pageSize, query: [],
      sortControl: { sortOn: '', sortDirection: '' },
      includeSubDetails: false, dynamicQuery: [],
      branch_id: String(branchId), level, is_edit_mode: editMode,
    }),
  })
  if (!res.ok) throw new Error(`zone areas ${res.status}`)
  const d = await res.json() as { totalElements?: number; content?: MasterRecord[] }
  return { total: d.totalElements ?? 0, rows: d.content ?? [] }
}

export interface ZoneAssignment {
  level_value: string
  eta_zone_name: string
  billing_zone_name: string
  sort_code: string
  availability: string
  /** edit path: staging echoes the row's geo context (postal_code, city, …) */
  [key: string]: unknown
}

/** zone availability enum — read off staging's wizard bundle */
export const ZONE_AVAILABILITY = [
  { value: 'PICKUP_ONLY', label: 'Pickup Only' },
  { value: 'DELIVERY_ONLY', label: 'Delivery Only' },
  { value: 'BOTH', label: 'Both Pickup and Delivery' },
]

export async function createZoneMasters(
  branchId: number | string, level: string, zones: ZoneAssignment[],
  carrier: string[] = [], serviceType: string[] = [],
  /** existing config id → EDIT (staging sends id + zone_master_id on updates) */
  zoneMasterId?: number,
): Promise<void> {
  const res = await fetch('/staging/master/api/v2/branch/zoneMaster', {
    method: 'POST', headers: JSON_HEADERS,
    body: JSON.stringify({
      branch_id: Number(branchId), carrier, service_type: serviceType,
      level, zone_masters: zones, excluded_areas: [],
      ...(zoneMasterId != null ? { id: zoneMasterId, zone_master_id: zoneMasterId } : {}),
    }),
  })
  if (!res.ok) {
    let msg = `zone save ${res.status}`
    try { msg = String(((await res.json()) as { error?: string }).error ?? msg) } catch { /* opaque */ }
    throw new Error(msg)
  }
}

export async function fetchBranchV2List(entity: 'serviceableArea' | 'zoneMaster', pageSize = 200): Promise<MasterRecord[]> {
  const res = await fetch(`/staging/master/api/v2/branch/${entity}/list`, {
    method: 'POST', headers: JSON_HEADERS,
    body: JSON.stringify({
      pageNumber: 1, pageSize, query: [],
      sortControl: { sortOn: '', sortDirection: '' },
      includeSubDetails: false, dynamicQuery: [],
    }),
  })
  if (!res.ok) throw new Error(`${entity}/list ${res.status}`)
  const d = await res.json() as { content?: MasterRecord[] }
  return d.content ?? []
}

export function parseSettingJson(raw: string | null | undefined): unknown {
  if (!raw) return null
  try { return JSON.parse(raw) } catch { return raw }
}

/* ---------------- Users Management (/app/rest/users*) ----------------
 * GET /app/rest/users REQUIRES userTypeId (500 without it) — the console page
 * always lists per user type. Envelope = Spring page {content, totalElements,
 * totalPages, number, size, …}. Activate/deactivate: POST body = ARRAY of
 * logins + ?companyId=. Verified live 2026-08-26. */

export interface UserType { id: number; name: string }

export interface FarEyeUser {
  id: number
  login: string
  firstName: string
  lastName: string
  email: string
  employeeCode: string | null
  mobileNumber: string | null
  activated: boolean
  isLoggedIn: boolean | string
  locked: boolean
  lastLoginTime: string | null
  currentHub: { name?: string } | null
  hubId: number | null
  userType?: { id: number; name: string }
}

export async function fetchUserTypes(): Promise<UserType[]> {
  const res = await fetch('/staging/app/rest/user_type_new')
  if (!res.ok) throw new Error(`user_type_new ${res.status}`)
  return res.json()
}

export async function fetchUsers(opts: {
  userTypeId: number
  companyId: number
  pageNo?: number
  recordsPerPage?: number
  query?: string
  activatedUser?: boolean
}): Promise<{ content: FarEyeUser[]; totalElements: number; totalPages: number; number: number }> {
  const p = new URLSearchParams({
    activatedUser: String(opts.activatedUser ?? true),
    pageNo: String(opts.pageNo ?? 0),
    query: opts.query ?? '',
    recordsPerPage: String(opts.recordsPerPage ?? 10),
    sortOn: 'id', sortType: 'ASC',
    userTypeId: String(opts.userTypeId),
    companyId: String(opts.companyId),
  })
  const res = await fetch(`/staging/app/rest/users?${p}`)
  if (!res.ok) throw new Error(`users ${res.status}`)
  return res.json()
}

export async function setUsersActivation(logins: string[], companyId: number, activate: boolean): Promise<void> {
  const res = await fetch(
    `/staging/app/rest/users/user_${activate ? 'activation' : 'deactivation'}?companyId=${companyId}`,
    { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify(logins) },
  )
  if (!res.ok) throw new Error(`user ${activate ? '' : 'de'}activation ${res.status}`)
}

/* ---------------- Roles & Permissions (/master/api/v1/authz/*) ---------------- */

export interface AuthzRole {
  id: string
  name: string
  is_managed: boolean
  is_active?: boolean
  description?: string
  permissions?: Record<string, Record<string, { actions?: string[] }>>
}
export interface AuthzGroup {
  id: string
  code: string
  name: string
  is_managed: boolean
  is_active: boolean
  roles: AuthzRole[]
}

export async function fetchUserGroups(): Promise<AuthzGroup[]> {
  const res = await fetch('/staging/master/api/v1/authz/user-groups?page=1&page_size=1000')
  if (!res.ok) throw new Error(`user-groups ${res.status}`)
  return (await res.json()).items ?? []
}

export async function fetchUserRoles(): Promise<AuthzRole[]> {
  const res = await fetch('/staging/master/api/v1/authz/user-roles?page=1&page_size=1000')
  if (!res.ok) throw new Error(`user-roles ${res.status}`)
  return (await res.json()).items ?? []
}

/** Signed-in account (login, companyId, …) — used for companyId on user writes. */
export async function fetchAccount(): Promise<{ userId: number; login: string; company: { id: number; name: string } }> {
  const res = await fetch('/staging/app/rest/account')
  if (!res.ok) throw new Error(`account ${res.status}`)
  return res.json()
}
