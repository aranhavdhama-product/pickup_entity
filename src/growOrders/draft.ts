/** Create Order draft handed from the stepper to /checkout via sessionStorage. */
import type { Party, ShipmentType } from './types'

/**
 * One line of contents inside a package. `skuCode` is the SKU master's code, or
 * null when the merchant typed the item by hand — the row is then editable and
 * nothing tries to reconcile it with the master.
 */
export interface ParcelItem {
  skuCode: string | null; name: string; quantity: number; weightKg: number
  /** Customs classification, from the SKU master or typed on a custom line. Optional: older drafts have none. */
  hsnCode?: string
  /** Country of manufacture (display name), same provenance as `hsnCode`. */
  originCountry?: string
  /* Consignment-form SKU fields (console `skuDetails[]`) — optional, older drafts have none. */
  /** skuDetails[].category — from the SKU master on pick, else typed. */
  category?: string
  /** skuDetails[].description */
  description?: string
  /** skuDetails[].imageUrl */
  imageUrl?: string
  /** skuDetails[].unitCost, in the portal currency */
  unitCost?: number
  /** skuDetails[].length/breadth/height + uom — from the SKU master on pick */
  lengthCm?: number
  widthCm?: number
  heightCm?: number
  dimUom?: string
  /** skuDetails[].weightUom (weightKg holds the number) */
  weightUom?: string
}

/**
 * ONE package spec, shipped `quantity` times.
 *
 *  - `cargoType` is the cargo CLASSIFICATION (Parcel / Document / Fragile / …) —
 *    what the goods are, which is what decides `pkg.kind`.
 *  - `packageTypeCode` / `packageTypeName` are the Package master preset the
 *    dimensions and tare came from — what the goods are IN.
 *  - `quantity` is HOW MANY identical packages of this spec; `weight` is the
 *    weight of ONE of them. `ParcelItem.quantity` is units inside one package.
 *
 * The three new fields are OPTIONAL so a draft written before them loads
 * untouched and no localStorage key has to move.
 */
export interface Parcel {
  cargoType: string; itemInfo: string; quantity: number; weight: number; l: number; w: number; h: number
  /** Package master code the dimensions and tare came from; absent = legacy / custom. */
  packageTypeCode?: string
  /** The preset's NAME, carried so checkout and the order page need no masters lookup. */
  packageTypeName?: string
  /** SKU-master contents of ONE package; `itemInfo` stays the joined names. */
  items?: ParcelItem[]
  /**
   * `'auto'` = `weight` is DERIVED (preset tare + the items in one package) and
   * recomputed whenever either changes; `'manual'` = the merchant typed it and
   * nothing may overwrite it. Absent means manual, so a draft written before
   * this field keeps the weight it was saved with.
   */
  weightMode?: 'auto' | 'manual'
  /* Consignment-form package fields (console `packageDetails[]`) — optional. */
  /** packageDetails[].id — the form mints one per package */
  packageId?: string
  /** packageDetails[].trackingDetails — auto-generated downstream when blank; an overage scan's barcode. */
  trackingNumber?: string
  /** packageDetails[].palletSpace */
  palletSpace?: string
  /** packageDetails[].description */
  description?: string
  /** declared value of ONE package of this spec (merchant order form), in the order's currency */
  declaredValue?: number
}

/**
 * One Value Added Service line — the console's VAS row
 * (`consignmentDetails.vas[{vasCode, vasAddedLevel, targetIds, serviceTime, remarks}]`).
 */
export interface VasLine {
  level: 'SKU' | 'PACKAGE' | 'CONSIGNMENT'
  /** SKU level only — the SKU code (or typed name) of the line it applies to */
  skuCode: string
  service: string
  serviceTimeMin: number
  remark: string
}

/** A package as the consignment form recorded it — kept on the order for the view page. */
export interface ConsignmentPackage {
  packageId?: string
  packageType: string; quantity: number; trackingNumber: string; palletSpace: string; description: string
}

/**
 * Everything the Create Consignment form collects that the Grow order model had
 * no field for — the console's Add Consignment inventory (see
 * pages/ConsignmentAdd/fieldConfig.ts for tier / mandatory / API path). Every
 * key is optional and the whole object is optional on `OrderDraft` and
 * `GrowOrder`, so drafts and orders written before it load untouched.
 * Service Type is NOT here: it is `OrderDraft.service` (the rate card service);
 * Delivery Instructions is `OrderDraft.instructions`.
 */
export interface ConsignmentFields {
  orderNumber?: string
  referenceNumber?: string
  consignmentNumber?: string
  exchangeOrderNumber?: string
  /** Forward · Reverse · Exchange · Transfer · Service */
  consignmentType?: string
  /** Delivery · Pickup · Pick & Del (Forward only) */
  task?: string
  /** YYYY-MM-DD */
  shipByDate?: string
  merchantCode?: string | null
  merchantName?: string
  tags?: string[]
  labelFormat?: string
  routingType?: string
  paymentMode?: string
  orderAmount?: number | null
  schedulingConfirmation?: boolean
  /**
   * "Dedicated truck (FTL / FCL)" — a whole vehicle for this consignment. On a parcel consignment
   * it follows the Service Type's master Load type (LTL only → false, FTL only → true, LTL & FTL →
   * the user's choice); `shipmentType` stays
   * 'Parcel'. The optional Vehicle Type is stored (`vehicles[]` / `vehicleType`) whatever this
   * says. Always on for the FTL variant.
   */
  dedicateTruck?: boolean
  totalLoadingTime?: number | null
  clearanceRequired?: boolean
  scannable?: boolean
  splittable?: boolean
  /** consignment category flags: 4 Person · Stackable · Fragile · VIP · Hazmat · Heavy Weight */
  category?: string[]
  fourPersonServiceTime?: number | null
  specialInstructions?: string
  /** Home Delivery · PUDO/Locker */
  deliveryMode?: string
  /** Same As Ship From · Use Different Address */
  rtoMode?: string
  /** returnTo — only when rtoMode is Use Different Address */
  rto?: Party | null
  vas?: VasLine[]
  carrier?: string
  packages?: ConsignmentPackage[]
}

export interface OrderDraft {
  /** set when the stepper was resumed from a saved draft — checkout then updates that order */
  orderId?: string
  storeCode: string; sender: Party; receiver: Party; drops: Party[]; shipmentType: ShipmentType; vehicleType: string
  vehicleUnit: number; actualLoad: number; additionalServices: string[]
  /**
   * FTL only. `ftlServiceType` is one of FTL_SERVICE_TYPES and decides which
   * vehicles can be picked; `vehicles` is the booking itself — one entry per
   * vehicle, each mapped to the delivery addresses it serves. The three legacy
   * fields above are DERIVED from `vehicles` (first type, count, total load) so
   * everything that predates the list keeps reading. Optional: a draft saved
   * before them loads as one vehicle covering every address (see `vehiclesOf`).
   */
  ftlServiceType?: string
  vehicles?: FtlVehicle[]
  parcels: Parcel[]; authority: string; instructions: string; secure: boolean; service: string; rate: number; etaDays: number
  /** The consignment-form fields with no older home — optional, see ConsignmentFields. */
  consignment?: ConsignmentFields
  /** Which form tier the draft was saved from, so Resume reopens it the same way. */
  formMode?: 'simplified' | 'full'
  /** The currency `rate` is quoted in (growOrders/rates: ₱, or $ on the Chicago network). Absent = ₱. */
  currency?: string
  /** Full-vehicle bookings from the merchant form: the packages the merchant listed (`parcels`
   *  carries the one synthetic FTL line every reader expects), so Resume gets them back. */
  sourceParcels?: Parcel[]
}
export const DRAFT_KEY = 'grow-order-draft'
/**
 * Two SIDECARS to DRAFT_KEY, for the things `OrderDraft` has no field for. They
 * are mutually exclusive — writing one clears the other, so checkout can never
 * take both exits at once.
 *  - `DRAFT_PICKUP_KEY` — the id of the RESERVED pickup this order is being
 *    created for (`?fromPickup=`); checkout attaches the paid order to it.
 *  - `DRAFT_OVERAGE_KEY` — `{prId, overageId}` of the overage scan this order is
 *    being created for (`?fromOverage=`); checkout resolves the scan.
 */
export const DRAFT_PICKUP_KEY = 'grow-order-draft-pickup'
export const DRAFT_OVERAGE_KEY = 'grow-order-draft-overage'
export interface OverageSidecar { prId: string; overageId: string }

/** Write one sidecar and clear the other — the two exits are exclusive. */
export function setDraftSidecar(x: { pickupId?: string | null; overage?: OverageSidecar | null }) {
  if (x.pickupId) sessionStorage.setItem(DRAFT_PICKUP_KEY, x.pickupId)
  else sessionStorage.removeItem(DRAFT_PICKUP_KEY)
  if (x.overage) sessionStorage.setItem(DRAFT_OVERAGE_KEY, JSON.stringify(x.overage))
  else sessionStorage.removeItem(DRAFT_OVERAGE_KEY)
}

export function readOverageSidecar(): OverageSidecar | null {
  try {
    const v = JSON.parse(sessionStorage.getItem(DRAFT_OVERAGE_KEY) || 'null') as OverageSidecar | null
    return v && v.prId && v.overageId ? v : null
  } catch { return null }
}

/** Every exit that abandons the stepper clears the whole hand-off. */
export function clearDraftKeys() {
  sessionStorage.removeItem(DRAFT_KEY)
  sessionStorage.removeItem(DRAFT_PICKUP_KEY)
  sessionStorage.removeItem(DRAFT_OVERAGE_KEY)
}
export const VOL_FACTOR = 3500 // cm³ per kg — 10×10×10 → 0.2857 kg, as on the portal
export const volKg = (p: Parcel) => (p.l * p.w * p.h) / VOL_FACTOR

/* ------------------------------------------------------------------ FTL ---- */
/**
 * Book a vehicle (FTL) — step 2 "Vehicle Details".
 * Captured from the staging bundle (and the Citylink tenant's live step,
 * 2026-09-23 screenshots): the step asks for a SERVICE TYPE, then one or more
 * VEHICLES — `Vehicle Type*` (options = companySettings.orderDetails
 * .vehicleList[].vehicleType, filtered by the service type), `Actual Load*`
 * and `Select Addresses*` (which of the step-1 delivery addresses this vehicle
 * serves), plus "+ Add vehicle" to balance the load — then
 * `additionalServiceList`. The vehicle VALUES below are an estimate — staging
 * never let us open the live dropdowns; the service types are the owner's.
 */
export interface VehicleSpec { type: string; capacity: string; payloadKg: number; rate: number }

export const VEHICLE_SPECS: VehicleSpec[] = [
  /* road */
  { type: 'Courier Van', capacity: 'Payload 800 kg · 3 m³', payloadKg: 800, rate: 1200 },
  { type: '1 Ton Bakkie', capacity: 'Payload 1 000 kg · 4 m³', payloadKg: 1000, rate: 1800 },
  { type: '4 Ton Truck', capacity: 'Payload 4 000 kg · 18 m³', payloadKg: 4000, rate: 3200 },
  { type: '8 Ton Truck', capacity: 'Payload 8 000 kg · 34 m³', payloadKg: 8000, rate: 4900 },
  { type: '14 Ton Truck', capacity: 'Payload 14 000 kg · 55 m³', payloadKg: 14000, rate: 6800 },
  { type: 'Superlink (34 Ton)', capacity: 'Payload 34 000 kg · 90 m³', payloadKg: 34000, rate: 12500 },
  { type: 'Refrigerated 8 Ton', capacity: 'Payload 8 000 kg · 30 m³ · −18 °C', payloadKg: 8000, rate: 6200 },
  { type: 'Prime Mover + Skeletal Trailer', capacity: 'One 20/40 ft container · 28 000 kg', payloadKg: 28000, rate: 9800 },
  /* sea */
  { type: '20 ft Container (shared)', capacity: 'Per m³ slot in a groupage box', payloadKg: 5000, rate: 2400 },
  { type: '40 ft Container (shared)', capacity: 'Per m³ slot in a groupage box', payloadKg: 10000, rate: 4200 },
  { type: '20 ft Container', capacity: 'Payload 28 000 kg · 33 m³', payloadKg: 28000, rate: 14500 },
  { type: '40 ft Container', capacity: 'Payload 26 000 kg · 67 m³', payloadKg: 26000, rate: 22000 },
  { type: '40 ft High Cube', capacity: 'Payload 26 000 kg · 76 m³', payloadKg: 26000, rate: 24500 },
  { type: '20 ft Reefer', capacity: 'Payload 27 000 kg · 28 m³ · −25 °C', payloadKg: 27000, rate: 19800 },
  { type: '40 ft Reefer', capacity: 'Payload 29 000 kg · 59 m³ · −25 °C', payloadKg: 29000, rate: 29500 },
  /* roll-on / roll-off */
  { type: 'Car Carrier (8 units)', capacity: '8 passenger vehicles · 16 000 kg', payloadKg: 16000, rate: 15800 },
  { type: 'Car Carrier Slot', capacity: 'One passenger vehicle · 2 500 kg', payloadKg: 2500, rate: 2900 },
  { type: 'Low-bed Trailer', capacity: 'Payload 40 000 kg · plant & machinery', payloadKg: 40000, rate: 18500 },
  { type: 'Flatbed Trailer', capacity: 'Payload 30 000 kg · open deck', payloadKg: 30000, rate: 13200 },
  { type: 'Trailer Slot', capacity: 'One unit on a shared deck · 8 000 kg', payloadKg: 8000, rate: 6100 },
  { type: 'Self-propelled Unit', capacity: 'Driven aboard · 45 000 kg', payloadKg: 45000, rate: 21000 },
  { type: 'Towed Unit', capacity: 'Towed aboard · 30 000 kg', payloadKg: 30000, rate: 17400 },
  /* air */
  { type: 'LD3 Container', capacity: 'Payload 1 500 kg · 4.3 m³', payloadKg: 1500, rate: 9600 },
  { type: 'LD7 Container', capacity: 'Payload 4 600 kg · 9.9 m³', payloadKg: 4600, rate: 21500 },
  { type: 'PMC Pallet', capacity: 'Payload 6 800 kg · 11 m³', payloadKg: 6800, rate: 27800 },
]
export const VEHICLE_TYPES = VEHICLE_SPECS.map((v) => v.type)
export const VEHICLE_RATE: Record<string, number> = Object.fromEntries(VEHICLE_SPECS.map((v) => [v.type, v.rate]))
export const vehicleSpec = (type: string) => VEHICLE_SPECS.find((v) => v.type === type) ?? VEHICLE_SPECS[0]

/**
 * The service types' VEHICLE CATALOGUES (owner's FTL list 2026-09-23, cut to the demo's 10
 * services 2026-09-25) — the vehicles each one can be booked with. The vehicle dropdown is
 * filtered by this: a sea service offers containers, an air service ULDs, an inland one trucks.
 * `days` is the transit the summary step quotes. Only the FTL-load ones (Inland FTL · Sea FCL ·
 * RORO FTL) are offered for a dedicated vehicle — `FTL_SERVICE_CODES`.
 */
export interface FtlServiceType { code: string; days: number; vehicles: string[] }
export const FTL_SERVICE_TYPES: FtlServiceType[] = [
  { code: 'Inland LTL', days: 2, vehicles: ['1 Ton Bakkie', '4 Ton Truck', '8 Ton Truck'] },
  { code: 'Inland FTL', days: 1, vehicles: ['Courier Van', '1 Ton Bakkie', '4 Ton Truck', '8 Ton Truck', '14 Ton Truck', 'Superlink (34 Ton)', 'Refrigerated 8 Ton', 'Prime Mover + Skeletal Trailer'] },
  { code: 'Sea LCL', days: 14, vehicles: ['20 ft Container (shared)', '40 ft Container (shared)'] },
  { code: 'Sea FCL', days: 12, vehicles: ['20 ft Container', '40 ft Container', '40 ft High Cube', '20 ft Reefer', '40 ft Reefer'] },
  { code: 'RORO FTL', days: 10, vehicles: ['Car Carrier (8 units)', 'Low-bed Trailer', 'Flatbed Trailer'] },
  { code: 'Air Freight LCL', days: 3, vehicles: ['LD3 Container', 'LD7 Container', 'PMC Pallet'] },
  { code: 'CEP Inland', days: 1, vehicles: ['Courier Van', '1 Ton Bakkie'] },
]
/**
 * A retired demo service name (2026-09-25: the demo keeps exactly 10) → its nearest kept one.
 * The store's normalizer applies it on load, so an old blob never resurfaces a dropped name.
 * `Delivery` is NOT mapped — the staging-pulled consignments carry it as data.
 */
export const RETIRED_SERVICE_TYPES: Record<string, string> = {
  'Standard Delivery': 'Standard',
  'Delivery & Installation': 'White Glove Delivery',
  Installation: 'White Glove Delivery',
  'RORO LTL': 'Sea LCL',
  'Rolling Cargo': 'Inland FTL',
  Hustling: 'Inland FTL',
  'Inland Crossdocking': 'Inland FTL',
}
export const canonicalService = <T extends string | null | undefined>(code: T): T =>
  (code && RETIRED_SERVICE_TYPES[code] ? RETIRED_SERVICE_TYPES[code] : code) as T
export const FTL_SERVICE_CODES = ['Inland FTL', 'Sea FCL', 'RORO FTL']
export const DEFAULT_FTL_SERVICE = 'Inland FTL'
export const ftlServiceType = (code: string) =>
  FTL_SERVICE_TYPES.find((s) => s.code === canonicalService(code)) ?? FTL_SERVICE_TYPES.find((s) => s.code === DEFAULT_FTL_SERVICE)!
/** The vehicle specs a service type can be booked with, in catalogue order. */
export const vehiclesFor = (serviceCode: string): VehicleSpec[] =>
  ftlServiceType(serviceCode).vehicles.map(vehicleSpec)
/** A type from the previous service that the new one does not offer becomes the new one's first option. */
export const coerceVehicleType = (serviceCode: string, type: string): string => {
  const allowed = ftlServiceType(serviceCode).vehicles
  return allowed.includes(type) ? type : allowed[0]
}

/**
 * ONE vehicle of an FTL booking: what it is, what it carries, and which of
 * the order's delivery addresses it serves (`addressIdx` indexes
 * `[receiver, ...drops]`, so 0 is always Address 1). The live step calls the
 * last one `Select Addresses *`.
 */
export interface FtlVehicle { vehicleType: string; actualLoadKg: number; addressIdx: number[] }

/**
 * The vehicle list of any FTL-shaped record. A record written before the list
 * existed carried ONE type, a unit count and a total load — that reads as
 * `vehicleUnit` identical vehicles sharing the load, every one of them serving
 * every address, which is exactly what the old flow meant.
 */
export function vehiclesOf(o: {
  vehicles?: FtlVehicle[] | null; vehicleType?: string | null; vehicleUnit?: number | null
  actualLoad?: number | null; drops?: unknown[] | null
}): FtlVehicle[] {
  if (o.vehicles?.length) return o.vehicles
  const units = Math.max(1, o.vehicleUnit ?? 1)
  const addressIdx = Array.from({ length: 1 + (o.drops?.length ?? 0) }, (_, i) => i)
  const load = (o.actualLoad ?? 0) / units
  return Array.from({ length: units }, () => ({ vehicleType: o.vehicleType || VEHICLE_TYPES[0], actualLoadKg: load, addressIdx }))
}
export const totalLoadKg = (vs: FtlVehicle[]) => vs.reduce((n, v) => n + v.actualLoadKg, 0)

/** `Number of Vehicles*` — how many of the chosen vehicle the load needs. */
export const VEHICLE_UNITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10']

export interface AdditionalService { code: string; note: string; price: number }
export const ADDITIONAL_SERVICES: AdditionalService[] = [
  { code: 'Tailgate lift', note: 'Hydraulic tail-lift for ground-level loading', price: 450 },
  { code: 'Forklift at offload', note: 'Forklift supplied at the delivery address', price: 900 },
  { code: 'Helper / labour', note: 'Extra crew member for hand-loading', price: 350 },
  { code: 'Waiting time', note: 'Booked standing time, per hour', price: 250 },
  { code: 'Goods in transit insurance', note: 'Cover for the declared load value', price: 600 },
]

export const EXTRA_DROP_RATE = 650 // per delivery address after the first

/* --------------------------------------------------------------- parcel ---- */

/**
 * The parcel rate card — moved here from `AddOrderPage` so the Add Order flow,
 * checkout and the rate calculator all quote from ONE place.
 *
 * KNOWN DIVERGENCE: `OrderViewPage` displays a parcel at 225 from its own local
 * constant, while this — what the merchant is actually charged at checkout — is
 * 90. The two have drifted. This is the billing path, so it is the one the
 * calculator quotes from; the display constant should be reconciled to it.
 */
export interface ParcelService { code: string; days: number; price: number }
export const PARCEL_SERVICES: ParcelService[] = [
  { code: 'Standard', days: 2, price: 90 },
  { code: 'Express', days: 1, price: 160 },
  { code: 'White Glove Delivery', days: 3, price: 650 },
  { code: 'CEP Inland', days: 1, price: 120 },
]

/**
 * The demo's Service Types — EXACTLY these 10, one canonical name each (owner, 2026-09-25:
 * "keep max 10 service types only in our demo"). LTL only: Standard · Express · White Glove
 * Delivery · CEP Inland · Inland LTL · Sea LCL · Air Freight LCL; FTL only: Inland FTL · Sea FCL ·
 * RORO FTL. A code with no rate-card row prices at the Standard rate (`parcelQuote` falls back).
 */
export const SERVICE_TYPES: string[] = [
  'Standard', 'Express', 'White Glove Delivery', 'CEP Inland',
  'Inland LTL', 'Inland FTL', 'Sea LCL', 'Sea FCL', 'Air Freight LCL', 'RORO FTL',
]

/**
 * Per-service LOAD TYPE, keyed by the SERVICE_TYPES entry — the Service Type master's
 * "Load type" field: 'ltl' = LTL only, 'ftl' = FTL only, 'both' = LTL & FTL. Defaults follow the
 * SERVICE NAME — `defaultLoadType`, also used for any service with no entry (a live master row):
 * "LTL"/"LCL" and the demo's parcel services (Standard, Express, White Glove Delivery, CEP Inland)
 * → LTL only; "FTL"/"FCL" → FTL only; anything else (a live row such as "Delivery") → LTL & FTL.
 * staging's serviceType rows carry no such field — the local Service & Order master
 * (`/local/settings/masters/service_order/service-type`) may override a row, and that override
 * wins at read time.
 */
export type LoadType = 'ltl' | 'ftl' | 'both'
export const LOAD_TYPE_LABELS: Record<LoadType, string> = { ltl: 'LTL only', ftl: 'FTL only', both: 'LTL & FTL' }
export interface ServiceTypeMeta { loadType: LoadType }
const PARCEL_ONLY_SERVICES = ['standard', 'express', 'white glove delivery', 'cep inland']
export function defaultLoadType(name: string): LoadType {
  const n = name.toLowerCase().trim()
  if (/\b(ltl|lcl)\b/.test(n) || PARCEL_ONLY_SERVICES.includes(n)) return 'ltl'
  if (/\b(ftl|fcl)\b/.test(n)) return 'ftl'
  return 'both'
}
export const SERVICE_TYPE_META: Record<string, ServiceTypeMeta> = Object.fromEntries(
  SERVICE_TYPES.map((code) => [code, { loadType: defaultLoadType(code) }]))

/** "LTL only" / "ftl" / … → a LoadType, or null for anything else */
export function parseLoadType(v: unknown): LoadType | null {
  const t = String(v ?? '').trim().toLowerCase()
  if (t === 'ltl' || t === 'ltl only') return 'ltl'
  if (t === 'ftl' || t === 'ftl only') return 'ftl'
  if (t === 'both' || t === 'ltl & ftl' || t === 'ltl and ftl') return 'both'
  return null
}

/** the local Service & Order master's Service Type rows (ServiceOrderMasters' store key) */
/* keep in step with ServiceOrderMasters' key (service-type: v4) */
const LOCAL_SERVICE_TYPE_MASTER_KEY = 'local-masters-service_order-service-type-v4'
/**
 * Load-type overrides saved on the local Service Type master, by code AND name. A row saved
 * before the field existed has no `loadType` and falls through to SERVICE_TYPE_META.
 */
function loadTypeOverrides(): Map<string, LoadType> {
  const out = new Map<string, LoadType>()
  try {
    const rows = (JSON.parse(localStorage.getItem(LOCAL_SERVICE_TYPE_MASTER_KEY) ?? 'null') as { rows?: unknown } | null)?.rows
    if (!Array.isArray(rows)) return out
    for (const r of rows as Record<string, unknown>[]) {
      const lt = r && typeof r === 'object' ? parseLoadType(r.loadType) : null
      if (!lt) continue
      for (const k of [r.code, r.name]) if (k) out.set(String(k), lt)
    }
  } catch { /* private mode / malformed — defaults */ }
  return out
}
/** The load type of one service code — the master's override, else the name-rule default. */
export function loadTypeOf(code: string, overrides = loadTypeOverrides()): LoadType {
  return overrides.get(code) ?? SERVICE_TYPE_META[code]?.loadType ?? defaultLoadType(code)
}
/** Does this load type allow a dedicated truck (FTL) / a shared parcel booking (LTL)? */
export const loadTypeAllows = (lt: LoadType, dedicated: boolean) => lt === 'both' || lt === (dedicated ? 'ftl' : 'ltl')
/** The subset of `codes` a booking may pick — dedicated truck: FTL only + both; else LTL only + both. */
export function servicesForLoad(codes: readonly string[], dedicated: boolean): string[] {
  const o = loadTypeOverrides()
  return codes.filter((c) => loadTypeAllows(loadTypeOf(c, o), dedicated))
}

/** Checkout adds this on top of every quote. */
export const TAX_RATE = 0.15
export const withTax = (net: number): number => net + Math.round(net * TAX_RATE)

/** Rate card price for one parcel booking, before tax. */
export function parcelQuote(serviceCode: string): number {
  return (PARCEL_SERVICES.find((s) => s.code === serviceCode) ?? PARCEL_SERVICES[0]).price
}

/* ---------------------------------------------------------------- quote ---- */

export interface Quote { shipping: number; tax: number; total: number; service: string }

/** Split a net price into the three numbers every price display needs. */
export function quoteOf(shipping: number, service: string): Quote {
  const total = withTax(shipping)
  return { shipping, tax: total - shipping, total, service }
}

/**
 * THE one place a price is worked out for an order-shaped thing.
 *
 * Callers pass what they have; anything paid through checkout passes its frozen
 * `charges` instead and never calls this. Keeping the derivation here is what
 * stopped the Add Order flow and the order page quoting two different parcel
 * prices at each other.
 */
export function quoteForOrder(o: {
  shipmentType: string
  vehicleType?: string
  vehicleUnit?: number
  actualLoad?: number
  vehicles?: FtlVehicle[]
  additionalServices?: string[]
  drops?: unknown[]
  serviceType?: string
}): Quote {
  if (o.shipmentType === 'FTL') {
    const net = ftlQuoteVehicles(vehiclesOf(o), Math.max(0, o.drops?.length ?? 0), o.additionalServices ?? [])
    return quoteOf(net, o.serviceType || DEFAULT_FTL_SERVICE)
  }
  const service = o.serviceType || PARCEL_SERVICES[0].code
  return quoteOf(parcelQuote(service), service)
}

/** Rate card price for one dedicated-truck booking of `units` identical vehicles. */
export function ftlQuote(vehicleType: string, units: number, extraDrops: number, services: string[]): number {
  return ftlQuoteVehicles(Array.from({ length: Math.max(1, units) }, () => ({ vehicleType, actualLoadKg: 0, addressIdx: [] })), extraDrops, services)
}

/** Rate card price for a vehicle LIST: each vehicle at its own rate, plus drops and extras. */
export function ftlQuoteVehicles(vehicles: FtlVehicle[], extraDrops: number, services: string[]): number {
  const base = (vehicles.length ? vehicles : [{ vehicleType: VEHICLE_TYPES[0] }]).reduce((n, v) => n + vehicleSpec(v.vehicleType).rate, 0)
  const drops = Math.max(0, extraDrops) * EXTRA_DROP_RATE
  const extras = ADDITIONAL_SERVICES.filter((s) => services.includes(s.code)).reduce((n, s) => n + s.price, 0)
  return base + drops + extras
}
