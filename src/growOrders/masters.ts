/**
 * Master data for the Grow merchant portal — the three FarEye masters the
 * Create Order form and the pickup booking read from:
 *
 *   Location Master  `businessUnitLocation`  → the merchant's PICKUP LOCATIONS
 *   Package Master   `packageType`           → packaging presets (dims + tare)
 *   SKU Master       `sku`                   → the items that go in a package
 *   Merchant master  `businessUnit`          → who the portal is "logged in" as
 *
 * LIVE-FIRST, SAMPLE-FALLBACK. In dev the Vite proxy injects the staging
 * cookie server-side on every `/staging/*` request, so this module can read the
 * real masters WITHOUT importing `src/auth` (the Grow shell has no session of
 * its own). When there is no session (401), the proxy is absent (the Vercel
 * build, `import.meta.env.PROD`) or the network fails, every consumer gets the
 * SAMPLE set below and `source === 'sample'` — the portal keeps working, it just
 * says so. A successful live read is cached in localStorage so the next load is
 * instant and a later 401 degrades to "stale live" rather than to samples.
 *
 * Contract (verified against FAREYE-APIS.md, 2026-08-27 captures):
 *   POST /staging/master/api/v1/<entity>/fetch  body {pageNumber:1, pageSize}
 *   → {totalElements, content:[row]}   (query filters 500 → filter client-side)
 *   businessUnitLocation rows are snake_case with an `address` object and
 *   ARRAY `business_unit_code` / `business_unit_name` (older rows: strings).
 *   sku rows: skuCode, description, skuCategory, hub[], length/breadth/height,
 *   weight, uomDimensions, uomWeight, stackable, enabled (+ hsnCode,
 *   originCountry, written by our SKU master form).
 *   packageType rows (VERIFIED live 2026-09-22, company 20106): code, name,
 *   unitOfMeasure, length, breadth, height, weight, weightUom, businessUnitCode.
 *   businessUnit rows: code, name (+ contact/address fields the portal ignores).
 *   Dimensions/weights are converted to cm/kg on read — a row may say M or LB.
 */
import { useSyncExternalStore } from 'react'
import type { Party, StoreLocation } from './types'
import { blankParty, STORES } from './seed'
import { FTL_SERVICE_TYPES, VEHICLE_SPECS } from './draft'
import { SAMPLE_SKU_CATALOGUE } from './sampleSkus'
import { operatingDaysFromHours, SAMPLE_LOCATION_OPERATING_DAYS, type OperatingDays } from './operatingCalendar'
import { savedPackageTypes } from './merchantSettings'
/* settingsApi imports nothing of its own (no `src/auth`), so the Grow shell can
   borrow its one fetch helper without dragging a session probe in with it. */
import { fetchMasterRows, type MasterRecord } from '../nueva/settingsApi'

/* ------------------------------------------------------------------ types --- */

export interface Merchant {
  code: string
  name: string
  /**
   * The merchant's REGISTERED address from the businessUnit row (contact
   * person, phone, address lines) — the pickup point every merchant has even
   * when the Location Master holds no rows for it. Null when the row carries
   * no address line at all.
   */
  party: Party | null
}

export type LocationType = 'MERCHANT_LOCATION' | 'CUSTOMER_LOCATION' | 'PUDO' | 'HUB' | 'PARCEL_LOCKER'

export interface MasterLocation {
  code: string
  name: string
  type: LocationType
  /** merchants this location serves — empty = shared / unassigned */
  merchantCodes: string[]
  enabled: boolean
  party: Party
  /** the Location Master's `operating_hours` = the merchant's pickup-day preference; undefined = none (→ hub calendar) */
  operatingDays?: OperatingDays
}

export interface PackageType {
  code: string
  name: string
  lengthCm: number
  widthCm: number
  heightCm: number
  /** tare (the packaging's own weight), kg */
  weightKg: number
  /** the merchant it belongs to, or null when it is a company-wide preset */
  merchantCode: string | null
  enabled: boolean
}

export interface SkuItem {
  code: string
  name: string
  category: string
  /** Harmonised System code — copied onto every order line that picks this SKU. */
  hsnCode: string
  /** Country of manufacture (display name) — copied onto the order line too. */
  originCountry: string
  lengthCm: number
  widthCm: number
  heightCm: number
  weightKg: number
  /** unit cost when the master carries one (sample rows do) */
  unitCost?: number
  stackable: boolean
  hubs: string[]
  enabled: boolean
}

/**
 * One Vehicle Type the form can book — the hub's vehicle configuration on staging
 * (Central Vehicle Config, `/v2/central-vehicle-config/...`). ONE list for both the
 * FTL variant's Vehicle Details and the parcel form's Dedicate Truck card.
 */
export interface VehicleTypeOption {
  code: string
  name: string
  /** max payload, kg (0 = unknown) */
  payloadKg: number
  /** one human line: payload · volume · dimensions */
  capacity: string
  /**
   * The FTL service types this vehicle is booked under. Only the SAMPLE list knows
   * (the owner's FTL_SERVICE_TYPES catalogue); a live row has none = every service.
   */
  serviceCodes?: string[]
  /**
   * The hub this vehicle is configured at — staging's Central Vehicle Config is keyed by
   * city + hub, so a booking only offers the Ship From hub's vehicles (owner, 2026-09-25).
   * The same vehicle type may be configured at several hubs (one row each).
   */
  hubCode?: string
}

export type MasterSource = 'live' | 'live-cached' | 'sample'

export interface Masters {
  merchants: Merchant[]
  locations: MasterLocation[]
  packageTypes: PackageType[]
  skus: SkuItem[]
  /** Vehicle Types (Central Vehicle Config) — live when the hub config answers, else the sample catalogue */
  vehicleTypes: VehicleTypeOption[]
  source: MasterSource
  loading: boolean
  /** why the live read failed, when it did — for the source hint, never a toast */
  error: string | null
  loadedAt: string | null
  /**
   * Masters that came back EMPTY on an otherwise successful live read and are
   * therefore showing samples (a company can have zero packageType rows). Not an
   * error — the source hint just says which list is made up.
   */
  sampleFallbacks: string[]
}

/* ------------------------------------------------------------- samples ---- */

export const SAMPLE_MERCHANTS: Merchant[] = [
  { code: '2GO_PH', name: '2GO Philippines', party: null },
]

export const SAMPLE_LOCATIONS: MasterLocation[] = STORES.map((s) => ({
  code: s.code, name: s.name, type: 'MERCHANT_LOCATION', merchantCodes: ['2GO_PH'], enabled: true, party: { ...s.party },
  ...(SAMPLE_LOCATION_OPERATING_DAYS[s.code] ? { operatingDays: SAMPLE_LOCATION_OPERATING_DAYS[s.code] } : {}),
}))

/** The old SIZE_CLASSES, now with the dimensions a package master would carry. */
export const SAMPLE_PACKAGE_TYPES: PackageType[] = [
  { code: 'ENVELOPE', name: 'Envelope', lengthCm: 35, widthCm: 25, heightCm: 1, weightKg: 0.05, merchantCode: null, enabled: true },
  { code: 'SMALL_BOX', name: 'Small box', lengthCm: 30, widthCm: 20, heightCm: 15, weightKg: 0.2, merchantCode: null, enabled: true },
  { code: 'MEDIUM_BOX', name: 'Medium box', lengthCm: 45, widthCm: 35, heightCm: 30, weightKg: 0.4, merchantCode: null, enabled: true },
  { code: 'LARGE_BOX', name: 'Large box', lengthCm: 60, widthCm: 45, heightCm: 40, weightKg: 0.7, merchantCode: null, enabled: true },
  { code: 'PALLET', name: 'Pallet', lengthCm: 120, widthCm: 100, heightCm: 150, weightKg: 25, merchantCode: null, enabled: true },
]

/* ONE catalogue with the local SKU master's seed rows (sampleSkus.ts) */
export const SAMPLE_SKUS: SkuItem[] = SAMPLE_SKU_CATALOGUE.map((x) => ({
  code: x.code, name: x.name, category: x.category, hsnCode: x.hsnCode, originCountry: x.originCountry,
  lengthCm: x.lengthCm, widthCm: x.widthCm, heightCm: x.heightCm, weightKg: x.weightKg, unitCost: x.unitCost,
  stackable: x.stackable, hubs: x.hubs, enabled: true,
}))

/**
 * The SAMPLE per-hub vehicle config — a deterministic spread of the owner's FTL catalogue
 * (draft.ts VEHICLE_SPECS, ESTIMATED specs) over the demo hubs, 3–4 vehicles each, until a
 * live hub config or the local Vehicle Config page supplies the real fleet.
 */
export const SAMPLE_HUB_VEHICLES: Record<string, string[]> = {
  SANPABLO: ['Courier Van', '1 Ton Bakkie', '4 Ton Truck', '8 Ton Truck'],
  'MNL-01': ['1 Ton Bakkie', '8 Ton Truck', 'Refrigerated 8 Ton', '14 Ton Truck'],
  'CEB-01': ['Courier Van', '4 Ton Truck', '20 ft Container', '40 ft Container'],
  ORD: ['14 Ton Truck', 'Superlink (34 Ton)', 'Prime Mover + Skeletal Trailer'],
}
export const SAMPLE_VEHICLE_TYPES: VehicleTypeOption[] = Object.entries(SAMPLE_HUB_VEHICLES).flatMap(([hubCode, types]) =>
  types.map((type) => {
    const v = VEHICLE_SPECS.find((x) => x.type === type) ?? VEHICLE_SPECS[0]
    return {
      code: v.type, name: v.type, payloadKg: v.payloadKg, capacity: v.capacity, hubCode,
      serviceCodes: FTL_SERVICE_TYPES.filter((s) => s.vehicles.includes(v.type)).map((s) => s.code),
    }
  }))

/**
 * The vehicle types a booking may pick at `hubCode` (the Ship From hub): that hub's rows only —
 * no hub = none. With an FTL service type, the hub's vehicles booked under it (a row naming no
 * services fits every one); when none of the hub's vehicles fit, the hub's whole list.
 * De-duplicated by code.
 */
export function vehicleTypesFor(list: VehicleTypeOption[], hubCode: string | null, serviceCode?: string | null): VehicleTypeOption[] {
  if (!hubCode) return []
  const seen = new Set<string>()
  const atHub = list.filter((v) => v.hubCode === hubCode && (seen.has(v.code) ? false : (seen.add(v.code), true)))
  if (!serviceCode) return atHub
  const fit = atHub.filter((v) => !v.serviceCodes?.length || v.serviceCodes.includes(serviceCode))
  return fit.length ? fit : atHub
}
/** A vehicle type by code or name — null for a blank or unknown type. */
export const vehicleTypeOf = (list: VehicleTypeOption[], type: string): VehicleTypeOption | null =>
  (type ? list.find((v) => v.code === type || v.name === type) ?? null : null)

/* --------------------------------------------------------------- store ---- */

let state: Masters = {
  merchants: SAMPLE_MERCHANTS, locations: SAMPLE_LOCATIONS, packageTypes: SAMPLE_PACKAGE_TYPES, skus: SAMPLE_SKUS,
  vehicleTypes: SAMPLE_VEHICLE_TYPES, source: 'sample', loading: false, error: null, loadedAt: null, sampleFallbacks: [],
}
const subs = new Set<() => void>()
function set(patch: Partial<Masters>) {
  state = { ...state, ...patch }
  subs.forEach((f) => f())
}

/** The masters, live when a staging session exists, samples otherwise. Fetches once per app load. */
export function useMasters(): Masters {
  return useSyncExternalStore((cb) => { subs.add(cb); return () => subs.delete(cb) }, () => state)
}

/* ---------------------------------------------------------- normalizers --- */

const str = (v: unknown) => (v == null ? '' : String(v))
const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0 }
/** `business_unit_code` / `_name` are ARRAYS on businessUnitLocation; older rows hold a plain string. */
const arr = (v: unknown) => (Array.isArray(v) ? v.map(String).filter(Boolean) : v ? [String(v)] : [])

/** A master row is "off" when `enabled` is false, or when a legacy `status` says so. */
function isEnabled(r: MasterRecord): boolean {
  if (r.enabled === false) return false
  const s = str(r.status).toLowerCase()
  return !(s === 'disabled' || s === 'inactive')
}

/* The form only ever speaks cm/kg, so every master is converted on the way in —
   a staging row may carry IN/MM/M and LB/G. A missing UOM means "already cm/kg",
   NOT zero. */
const DIM_TO_CM: Record<string, number> = { CM: 1, IN: 2.54, INCH: 2.54, INCHES: 2.54, MM: 0.1, M: 100, METER: 100, METERS: 100 }
const WT_TO_KG: Record<string, number> = { KG: 1, KGS: 1, KILOGRAM: 1, LB: 0.4536, LBS: 0.4536, POUND: 0.4536, G: 0.001, GM: 0.001, GRAM: 0.001 }
const toCm = (v: unknown, uom: unknown) => num(v) * (DIM_TO_CM[str(uom).trim().toUpperCase()] ?? 1)
const toKg = (v: unknown, uom: unknown) => num(v) * (WT_TO_KG[str(uom).trim().toUpperCase()] ?? 1)

const LOCATION_TYPES: LocationType[] = ['MERCHANT_LOCATION', 'CUSTOMER_LOCATION', 'PUDO', 'HUB', 'PARCEL_LOCKER']
/** Validate rather than cast — an unfamiliar staging type must not land in the pickup-location list. */
const locationType = (v: unknown): LocationType => {
  const t = str(v).trim().toUpperCase() as LocationType
  return LOCATION_TYPES.includes(t) ? t : 'CUSTOMER_LOCATION'
}

/**
 * A `businessUnitLocation` row → the Party the order store speaks. Empty strings
 * are dropped BEFORE the spread: `blankParty()` defaults `country: 'Philippines'`
 * and `{...blank, country: ''}` would destroy that default.
 */
function partyFromRow(r: MasterRecord): Party {
  const a = (r.address ?? {}) as Record<string, unknown>
  const buNames = arr(r.business_unit_name)
  const filled: Partial<Party> = {
    name: str(r.contact_person),
    contactNumber: str(r.contact_number),
    email: str(r.email_id),
    businessName: buNames[0] ?? str(r.name),
    country: str(a.country),
    line1: str(a.address_line1),
    line2: str(a.address_line2),
    landmark: str(a.address_line3),
    postalCode: str(a.postal_code),
    state: str(a.state),
    city: str(a.city),
  }
  for (const k of Object.keys(filled) as (keyof Party)[]) if (!filled[k]) delete filled[k]
  return partyFromLocation(filled)
}

function normalizeLocation(r: MasterRecord): MasterLocation {
  return {
    code: str(r.code), name: str(r.name) || str(r.code),
    type: locationType(r.type),
    /* the loader does NOT filter by type — `locationsForMerchant` owns that rule */
    merchantCodes: arr(r.business_unit_code),
    enabled: true,
    party: partyFromRow(r),
    /* staging `operating_hours [{day, serviceable, open_time, close_time, is_primary}]` */
    operatingDays: operatingDaysFromHours(r.operating_hours),
  }
}

/**
 * VERIFIED LIVE 2026-09-22 (company 20106): a packageType row is
 * `{id, companyId, enabled, code, name, unitOfMeasure:'CM'|'M', length, breadth,
 * height, weight, weightUom:'KG', businessUnitId, businessUnitCode, businessUnitName}`.
 * The verified names come FIRST; the alternates behind them are the static
 * replica's spellings, kept because they cost nothing and other tenants' rows
 * have not been seen.
 */
function normalizePackageType(r: MasterRecord): PackageType {
  const dimUom = r.unitOfMeasure ?? r.uom ?? r.uomDimensions ?? r.dimensionUom
  const wtUom = r.weightUom ?? r.weightUnit ?? r.uomWeight
  const merchant = arr(r.businessUnitCode ?? r.businessUnit ?? r.business_unit_code)[0] ?? null
  const code = str(r.code) || str(r.name)
  return {
    code, name: str(r.name) || code,
    lengthCm: toCm(r.length ?? r.lengthCm, dimUom),
    widthCm: toCm(r.breadth ?? r.width ?? r.widthCm, dimUom),
    heightCm: toCm(r.height ?? r.heightCm, dimUom),
    weightKg: toKg(r.weight ?? r.weightKg, wtUom),
    merchantCode: merchant,
    enabled: true,
  }
}

function normalizeSku(r: MasterRecord): SkuItem {
  const code = str(r.skuCode) || str(r.code)
  return {
    code, name: str(r.description) || code,
    category: str(r.skuCategory),
    hsnCode: str(r.hsnCode) || str(r.hsnName),
    originCountry: str(r.originCountry) || str(r.countryOfOrigin),
    lengthCm: toCm(r.length, r.uomDimensions),
    widthCm: toCm(r.breadth, r.uomDimensions),
    heightCm: toCm(r.height, r.uomDimensions),
    weightKg: toKg(r.weight, r.uomWeight),
    stackable: r.stackable !== false,
    hubs: arr(r.hub),
    enabled: true,
  }
}

function normalizeMerchant(r: MasterRecord): Merchant {
  const code = str(r.code)
  const name = str(r.name) || code
  /* businessUnit rows are FLAT camelCase (addressLine1, postalCode, city …),
     unlike businessUnitLocation's nested snake_case address object */
  const line1 = str(r.addressLine1)
  const party: Party | null = line1 ? {
    ...blankParty(),
    name: str(r.contactPerson) || name,
    contactNumber: str(r.contactNumber),
    email: str(r.email),
    businessName: name,
    country: str(r.country) || blankParty().country,
    line1,
    line2: str(r.addressLine2),
    landmark: str(r.addressLine3),
    postalCode: str(r.postalCode),
    state: str(r.state),
    city: str(r.city),
  } : null
  return { code, name, party }
}

/* --------------------------------------------------------------- cache ---- */

/* v2: SkuItem gained hsnCode + originCountry — a v1 cache would hand the form rows without them
   v3: + vehicleTypes (Central Vehicle Config)
   v4: vehicleTypes carry hubCode (per-hub fleets) */
const CACHE_KEY = 'grow-masters-cache-v4'   // growOrders/operatingCalendar.ts reads this key too (location operatingDays) — bump both

interface MastersCache {
  loadedAt: string
  merchants: Merchant[]
  locations: MasterLocation[]
  packageTypes: PackageType[]
  skus: SkuItem[]
  vehicleTypes: VehicleTypeOption[]
}

/** A malformed cache falls through to samples rather than crashing the portal. */
function readCache(): MastersCache | null {
  try {
    const raw = window.localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const c = JSON.parse(raw) as MastersCache
    const ok = c && typeof c === 'object'
      && Array.isArray(c.merchants) && Array.isArray(c.locations)
      && Array.isArray(c.packageTypes) && Array.isArray(c.skus)
    return ok ? { ...c, vehicleTypes: Array.isArray(c.vehicleTypes) && c.vehicleTypes.length ? c.vehicleTypes : SAMPLE_VEHICLE_TYPES } : null
  } catch { return null }
}

function writeCache(c: MastersCache) {
  try { window.localStorage.setItem(CACHE_KEY, JSON.stringify(c)) } catch { /* quota / private mode — the portal still works */ }
}

/* ---------------------------------------------------------------- load ---- */

let loaded = false
/** Two mounts must not fire eight requests — the second awaits the first. */
let inflight: Promise<void> | null = null

/**
 * Read the four masters from staging in PARALLEL, once per app load.
 * Never throws and never toasts: every failure resolves onto the cache (stale
 * live) or the samples, and the source hint in the header says which.
 */
export async function loadMasters(): Promise<void> {
  return run(false)
}

/** Same read, forced — for a "reload masters" affordance. */
export async function refreshMasters(): Promise<void> {
  return run(true)
}

async function run(force: boolean): Promise<void> {
  if (inflight) return inflight
  if (loaded && !force) return
  /* The Vercel build has no `/staging` proxy, so there is nothing to call there.
     Samples are the STATE in prod, not a failure — no error string. */
  if (import.meta.env.PROD) {
    loaded = true
    set({ source: 'sample', loading: false, error: null, sampleFallbacks: [] })
    return
  }
  inflight = (async () => {
    set({ loading: true })
    /* the vehicle config is NOT a /master/api/v1 entity — its own call, its own failure: a 404
       there must not demote the four masters to samples, so it never joins the Promise.all */
    const vehiclesP = fetchVehicleTypes().catch(() => [] as VehicleTypeOption[])
    try {
      const [merchantRows, locationRows, packageRows, skuRows] = await Promise.all([
        fetchMasterRows('businessUnit', 500),
        fetchMasterRows('businessUnitLocation', 500),
        fetchMasterRows('packageType', 500),
        fetchMasterRows('sku', 500),
      ])
      const on = (rows: MasterRecord[]) => rows.filter(isEnabled)
      const merchants = on(merchantRows).map(normalizeMerchant).filter((m) => m.code)
      const locations = on(locationRows).map(normalizeLocation).filter((l) => l.code)
      /* `packageType.businessUnitCode` is free text and may name a merchant that
         no longer has a businessUnit row ("Comfy Furniture"). An unresolvable
         owner means company-wide, NOT hidden — otherwise a real preset would be
         invisible to every merchant. Codes carry spaces and apostrophes: compare
         them EXACTLY, never slugified. */
      const known = new Set(merchants.map((m) => m.code))
      const packageTypes = on(packageRows).map(normalizePackageType).filter((p) => p.code)
        .map((p) => (p.merchantCode && known.has(p.merchantCode) ? p : { ...p, merchantCode: null }))
      const skus = on(skuRows).map(normalizeSku).filter((s) => s.code)
      /* Every list empty is not a company with no data — it is a response that
         was not the masters (a soft 200 login page, a changed envelope). Treat it
         as a failed read so the portal degrades to cache/samples HONESTLY rather
         than labelling five invented rows "live". */
      if (!merchants.length && !locations.length && !packageTypes.length && !skus.length) {
        throw new Error('masters/fetch returned no rows')
      }

      /* An empty master is a real answer from a real session (this company just
         has no packageType rows) — keep the live read and sample that ONE list. */
      const sampleFallbacks: string[] = []
      const keep = <T,>(live: T[], sample: T[], label: string) => {
        if (live.length) return live
        sampleFallbacks.push(label)
        return sample
      }
      const loadedAt = new Date().toISOString()
      const next: MastersCache = {
        loadedAt,
        merchants: keep(merchants, SAMPLE_MERCHANTS, 'merchants'),
        /* the sample locations are tagged '2GO_PH', which matches no LIVE merchant —
           blank the tag so `locationsForMerchant`'s "unassigned = shared" rule keeps
           them visible instead of silently yielding an empty pickup dropdown */
        locations: keep(locations, SAMPLE_LOCATIONS.map((l) => ({ ...l, merchantCodes: [] })), 'locations'),
        packageTypes: keep(packageTypes, SAMPLE_PACKAGE_TYPES, 'package types'),
        skus: keep(skus, SAMPLE_SKUS, 'SKUs'),
        /* live rows are ONE staging hub's fleet; the demo hubs keep their sample fleets beside them */
        vehicleTypes: [...(await vehiclesP), ...SAMPLE_VEHICLE_TYPES],
      }
      writeCache(next)
      loaded = true
      set({ ...next, source: 'live', loading: false, error: null, sampleFallbacks })
      adoptFirstMerchant(next.merchants)
    } catch (e) {
      /* 401 (no session), a network failure or a non-JSON body all land here. */
      const status = String((e as Error)?.message ?? '')
      const why = /\b401\b|\b403\b/.test(status)
        ? 'No staging session'
        : 'Could not reach staging'
      const cache = readCache()
      loaded = true
      if (cache) {
        set({
          merchants: cache.merchants, locations: cache.locations,
          packageTypes: cache.packageTypes, skus: cache.skus, vehicleTypes: cache.vehicleTypes,
          source: 'live-cached', loading: false, loadedAt: cache.loadedAt,
          error: `${why} — showing the last loaded masters`, sampleFallbacks: [],
        })
        adoptFirstMerchant(cache.merchants)
      } else {
        set({
          merchants: SAMPLE_MERCHANTS, locations: SAMPLE_LOCATIONS,
          packageTypes: SAMPLE_PACKAGE_TYPES, skus: SAMPLE_SKUS, vehicleTypes: SAMPLE_VEHICLE_TYPES,
          source: 'sample', loading: false, loadedAt: null,
          error: `${why} — showing sample data`, sampleFallbacks: [],
        })
      }
    } finally {
      inflight = null
    }
  })()
  return inflight
}

/**
 * staging's Central Vehicle Config (`/v2/central-vehicle-config/99999/529?cityId=58097&hubId=513521`,
 * reached from Same/Next Day Routing → Vehicle Config → City EU · Hub EU) reads the hub's ROUTING
 * vehicle store — the VRP fleet, not the asset master (`/master/api/v1/vehicle`):
 *
 *   GET /app/rest/order/auto_assign_configurationV2?cityId=&hubIdList=&oneRoutePerRoster=false
 *   → a BARE ARRAY, one row per configured vehicle: vehicleType (the "Name" column — free text,
 *     e.g. HFDN_ANT-140), hubId, cityId, travelingMode, weightCapacity, volumetricCapacity,
 *     length/width/height, cutOffPallet, noOfVehicles, carrierCode, startTime/endTime, tag, …
 *
 * Cookie auth through the `/staging` proxy (already proxied; it injects cookie + XSRF). The ids
 * are the EU city/hub the owner pointed at; another hub = change these two.
 * docs/superpowers/research/2026-09-24-staging-central-vehicle-config.md
 */
const VEHICLE_CONFIG_CITY_ID = '58097'
const VEHICLE_CONFIG_HUB_ID = '513521'
/** the hub those rows belong to, in the portal's hub-code terms (staging's hub name) */
const VEHICLE_CONFIG_HUB_CODE = 'EU'

/** Resolves [] when the hub has no vehicles (the caller samples that one list); throws on a failed read. */
async function fetchVehicleTypes(): Promise<VehicleTypeOption[]> {
  const q = new URLSearchParams({ cityId: VEHICLE_CONFIG_CITY_ID, hubIdList: VEHICLE_CONFIG_HUB_ID, oneRoutePerRoster: 'false' })
  const res = await fetch(`/staging/app/rest/order/auto_assign_configurationV2?${q}`, { headers: { accept: 'application/json' } })
  if (!res.ok) throw new Error(`vehicle config ${res.status}`)
  const rows = (await res.json()) as unknown
  if (!Array.isArray(rows)) throw new Error('vehicle config: not an array')
  const seen = new Set<string>()
  const out: VehicleTypeOption[] = []
  for (const r of rows as MasterRecord[]) {
    const code = str(r.vehicleType).trim()
    if (!code || seen.has(code)) continue
    seen.add(code)
    const kg = num(r.weightCapacity)
    const vol = num(r.volumetricCapacity)
    const dims = [r.length, r.width, r.height].map(num)
    const parts = [
      kg ? `Payload ${kg.toLocaleString()} kg` : '',
      vol ? `${vol} volume` : '',
      dims.some(Boolean) ? `${dims.join(' × ')}` : '',
      str(r.travelingMode),
    ].filter(Boolean)
    out.push({ code, name: code, payloadKg: kg, capacity: parts.join(' · '), hubCode: VEHICLE_CONFIG_HUB_CODE })
  }
  return out
}

/**
 * Make the signed-in merchant stable across reloads: the FIRST load with nothing
 * persisted adopts the first merchant. A stored code is never overwritten, even
 * when it is missing from the list — `currentMerchant` already falls back.
 */
function adoptFirstMerchant(merchants: Merchant[]) {
  if (merchantCode == null && merchants[0]) setMerchantCode(merchants[0].code)
}

/* ----------------------------------------------------------- selectors ---- */

/**
 * The pickup locations the merchant may ship FROM: their own MERCHANT_LOCATION
 * rows plus the merchant-less ones (staging's own `buildLocationList` rule —
 * an unassigned location is shared by every merchant).
 */
export function locationsForMerchant(locations: MasterLocation[], merchantCode: string | null): MasterLocation[] {
  return locations.filter((l) => l.enabled && l.type === 'MERCHANT_LOCATION'
    && (l.merchantCodes.length === 0 || (merchantCode != null && l.merchantCodes.includes(merchantCode))))
}

/**
 * Packaging presets = the merchant's own plus the company-wide ones — and when
 * that comes to NOTHING, every enabled preset. On staging all five packageType
 * rows belong to one merchant, so a strict filter left eight of nine merchants
 * with a select that offered only "Custom": a preset the merchant may reuse is
 * more useful than an empty list. `ownPackageTypes` says whether the fallback
 * kicked in, so the form can say "showing all package types".
 */
export function packageTypesForMerchant(types: PackageType[], merchantCode: string | null): PackageType[] {
  const own = types.filter((t) => t.enabled && (t.merchantCode == null || t.merchantCode === merchantCode))
  /* the merchant's Settings → Saved Packages come first (merged AFTER the fallback,
     so a merchant with no master presets still gets the company-wide list) */
  return [...savedPackageTypes(merchantCode), ...(own.length ? own : types.filter((t) => t.enabled))]
}

/** True when the merchant has presets of its own (or company-wide ones) — false means the list above is the company fallback. */
export function ownPackageTypes(types: PackageType[], merchantCode: string | null): boolean {
  return types.some((t) => t.enabled && (t.merchantCode == null || t.merchantCode === merchantCode))
}

/**
 * The merchant's registered address as a pickup location — listed FIRST in the
 * pickup dropdown, so a merchant with no Location Master rows still has a real
 * address to ship from instead of an empty select. Code = the merchant code.
 */
export function registeredPickupLocation(m: Merchant | null): StoreLocation | null {
  return m?.party ? { code: m.code, name: `${m.name} — registered address`, party: { ...m.party } } : null
}

/**
 * Every master-backed pickup point as a StoreLocation — each merchant's
 * registered address plus every Location Master row — for resolving a
 * `storeCode` that names one of them. Reads the current snapshot (a plain
 * helper, not a hook); components that must re-render when the masters
 * arrive subscribe with `useMasters()` alongside.
 */
export function masterStoreLocations(): StoreLocation[] {
  const regs = state.merchants.map(registeredPickupLocation).filter((x): x is StoreLocation => !!x)
  return [...regs, ...state.locations.map(toStoreLocation)]
}

/** A master location in the shape the order store already speaks. */
export const toStoreLocation = (l: MasterLocation): StoreLocation => ({ code: l.code, name: l.name, party: { ...l.party } })

/** A blank party with the fields a master location can fill. */
export const partyFromLocation = (x: Partial<Party>): Party => ({ ...blankParty(), ...x })

/* ------------------------------------------------------------ merchant ---- */

const MERCHANT_KEY = 'grow-merchant'

function readMerchant(): string | null {
  try { return window.localStorage.getItem(MERCHANT_KEY) } catch { return null }
}
let merchantCode: string | null = readMerchant()
const merchantSubs = new Set<() => void>()

/** Who the portal is signed in as. Persisted; falls back to the first merchant in the list. */
export function useMerchantCode(): string | null {
  return useSyncExternalStore((cb) => { merchantSubs.add(cb); return () => merchantSubs.delete(cb) }, () => merchantCode)
}

export function setMerchantCode(code: string | null) {
  merchantCode = code
  try {
    if (code) window.localStorage.setItem(MERCHANT_KEY, code)
    else window.localStorage.removeItem(MERCHANT_KEY)
  } catch { /* ignore */ }
  merchantSubs.forEach((f) => f())
}

/** The merchant record for the current selection, defaulting to the first known merchant. */
export function currentMerchant(merchants: Merchant[], code: string | null): Merchant | null {
  return merchants.find((m) => m.code === code) ?? merchants[0] ?? null
}
