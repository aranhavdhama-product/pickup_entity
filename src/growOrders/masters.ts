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
  stackable: boolean
  hubs: string[]
  enabled: boolean
}

export type MasterSource = 'live' | 'live-cached' | 'sample'

export interface Masters {
  merchants: Merchant[]
  locations: MasterLocation[]
  packageTypes: PackageType[]
  skus: SkuItem[]
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
}))

/** The old SIZE_CLASSES, now with the dimensions a package master would carry. */
export const SAMPLE_PACKAGE_TYPES: PackageType[] = [
  { code: 'ENVELOPE', name: 'Envelope', lengthCm: 35, widthCm: 25, heightCm: 1, weightKg: 0.05, merchantCode: null, enabled: true },
  { code: 'SMALL_BOX', name: 'Small box', lengthCm: 30, widthCm: 20, heightCm: 15, weightKg: 0.2, merchantCode: null, enabled: true },
  { code: 'MEDIUM_BOX', name: 'Medium box', lengthCm: 45, widthCm: 35, heightCm: 30, weightKg: 0.4, merchantCode: null, enabled: true },
  { code: 'LARGE_BOX', name: 'Large box', lengthCm: 60, widthCm: 45, heightCm: 40, weightKg: 0.7, merchantCode: null, enabled: true },
  { code: 'PALLET', name: 'Pallet', lengthCm: 120, widthCm: 100, heightCm: 150, weightKg: 25, merchantCode: null, enabled: true },
]

export const SAMPLE_SKUS: SkuItem[] = [
  { code: 'SKU-PHCASE', name: 'Phone case', category: 'Accessories', hsnCode: '392690', originCountry: 'China', lengthCm: 16, widthCm: 9, heightCm: 2, weightKg: 0.08, stackable: true, hubs: [], enabled: true },
  { code: 'SKU-SAMPLEKIT', name: 'Sample kit', category: 'Marketing', hsnCode: '491199', originCountry: 'Philippines', lengthCm: 30, widthCm: 20, heightCm: 15, weightKg: 2.4, stackable: true, hubs: [], enabled: true },
  { code: 'SKU-LAPTOP15', name: '15" laptop', category: 'Electronics', hsnCode: '847130', originCountry: 'Taiwan', lengthCm: 40, widthCm: 28, heightCm: 6, weightKg: 2.1, stackable: false, hubs: [], enabled: true },
  { code: 'SKU-TSHIRT', name: 'T-shirt (packed)', category: 'Apparel', hsnCode: '610910', originCountry: 'Vietnam', lengthCm: 25, widthCm: 20, heightCm: 3, weightKg: 0.25, stackable: true, hubs: [], enabled: true },
  { code: 'SKU-COFFEE1K', name: 'Coffee beans 1 kg', category: 'Grocery', hsnCode: '090121', originCountry: 'Philippines', lengthCm: 20, widthCm: 12, heightCm: 8, weightKg: 1.05, stackable: true, hubs: [], enabled: true },
  { code: 'SKU-MONITOR27', name: '27" monitor', category: 'Electronics', hsnCode: '852852', originCountry: 'South Korea', lengthCm: 70, widthCm: 20, heightCm: 50, weightKg: 6.5, stackable: false, hubs: [], enabled: true },
]

/* --------------------------------------------------------------- store ---- */

let state: Masters = {
  merchants: SAMPLE_MERCHANTS, locations: SAMPLE_LOCATIONS, packageTypes: SAMPLE_PACKAGE_TYPES, skus: SAMPLE_SKUS,
  source: 'sample', loading: false, error: null, loadedAt: null, sampleFallbacks: [],
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

/* v2: SkuItem gained hsnCode + originCountry — a v1 cache would hand the form rows without them */
const CACHE_KEY = 'grow-masters-cache-v2'

interface MastersCache {
  loadedAt: string
  merchants: Merchant[]
  locations: MasterLocation[]
  packageTypes: PackageType[]
  skus: SkuItem[]
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
    return ok ? c : null
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
          packageTypes: cache.packageTypes, skus: cache.skus,
          source: 'live-cached', loading: false, loadedAt: cache.loadedAt,
          error: `${why} — showing the last loaded masters`, sampleFallbacks: [],
        })
        adoptFirstMerchant(cache.merchants)
      } else {
        set({
          merchants: SAMPLE_MERCHANTS, locations: SAMPLE_LOCATIONS,
          packageTypes: SAMPLE_PACKAGE_TYPES, skus: SAMPLE_SKUS,
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
  return own.length ? own : types.filter((t) => t.enabled)
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
