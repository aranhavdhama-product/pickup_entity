/**
 * Lane rates — the ONE place a Grow booking is priced (spec
 * docs/superpowers/specs/2026-09-25-grow-merchant-order-form-design.md).
 *
 * `quoteLane` prices every service a merchant may book for an origin →
 * destination pair: shared-vehicle (LTL) services on the chargeable weight,
 * full-vehicle (FTL) services on the vehicles booked, both scaled by how far
 * the lane runs (same city · same region · national), plus extra drops and
 * priced value-added services. Two rate cards — ₱ for the Philippine network,
 * $ for the Chicago (ORD) network — chosen by the Ship From hub. All numbers
 * are ESTIMATED; nothing here is a tenant's real tariff.
 *
 * Readers: the merchant order form + its summary rail, the Rate Calculator
 * dialog and OrderViewPage (an unpaid order). Checkout never re-quotes — it
 * freezes the draft's `rate` into `charges`.
 *
 * Pure: no React, no fetch, no src/auth.
 */
import type { Party } from './types'
import {
  ADDITIONAL_SERVICES, FTL_SERVICE_TYPES, SERVICE_TYPES, VEHICLE_SPECS, VOL_FACTOR, defaultLoadType, loadTypeOf, parseLoadType,
  vehiclesOf, withTax, type FtlVehicle, type LoadType, type Parcel,
} from './draft'
import { inboundHubFor, INBOUND_HUBS } from './hubs'

/* --------------------------------------------------------------- currency ---- */

export type RateCurrency = '₱' | '$'
/** The Chicago network's pickup — its hub is ORD (the staging fixture's stores). */
const isChicago = (p: Pick<Party, 'city' | 'state'>) => /chicago|schiller|illinois|\bil\b/i.test(`${p.city} ${p.state}`)
/** The hub a pickup address belongs to: a hub-code location is its own hub, else by city / state. */
export function shipFromHubOf(storeCode: string | null | undefined, sender: Party): string | null {
  if (storeCode && INBOUND_HUBS.some((h) => h.code === storeCode)) return storeCode
  if (storeCode === 'ORD') return 'ORD'
  if (!(sender.city || '').trim() && !(sender.state || '').trim()) return null
  return isChicago(sender) ? 'ORD' : inboundHubFor(sender)
}
/** ₱ everywhere except the Chicago (ORD) network, which bills in $. */
export const currencyForHub = (hubCode: string | null | undefined, sender?: Pick<Party, 'country'>): RateCurrency =>
  (hubCode === 'ORD' || /united states|\busa?\b/i.test(sender?.country ?? '') ? '$' : '₱')

/* -------------------------------------------------------------- rate cards ---- */

/** A shared-vehicle tariff: `base` covers the first kg, `perKg` every kg after it. */
interface ParcelTariff { days: number; base: number; perKg: number }
interface RateCard {
  parcel: Record<string, ParcelTariff>
  /** a service with no row of its own */
  parcelDefault: ParcelTariff
  /** per vehicle, by vehicle type name */
  vehicle: Record<string, number>
  /** a vehicle type with no row: rate per payload tonne (min one tonne) */
  vehiclePerTonne: number
  extraDrop: number
  /** the priced value-added services (the former FTL extras) */
  vas: Record<string, number>
  /** transit days of a full-vehicle service with no FTL catalogue row */
  ftlDays: number
}

const PHP: RateCard = {
  parcel: {
    Standard: { days: 2, base: 90, perKg: 18 },
    Express: { days: 1, base: 160, perKg: 28 },
    'White Glove Delivery': { days: 3, base: 650, perKg: 22 },
    'Inland LTL': { days: 2, base: 450, perKg: 9 },
    'CEP Inland': { days: 1, base: 120, perKg: 20 },
    'Sea LCL': { days: 14, base: 1200, perKg: 6 },
    'Air Freight LCL': { days: 3, base: 800, perKg: 45 },
  },
  parcelDefault: { days: 3, base: 120, perKg: 20 },
  vehicle: Object.fromEntries(VEHICLE_SPECS.map((v) => [v.type, v.rate])),
  vehiclePerTonne: 600,
  extraDrop: 650,
  vas: Object.fromEntries(ADDITIONAL_SERVICES.map((a) => [a.code, a.price])),
  ftlDays: 1,
}

const USD: RateCard = {
  parcel: {
    Standard: { days: 2, base: 9.5, perKg: 0.85 },
    Express: { days: 1, base: 18, perKg: 1.4 },
    'White Glove Delivery': { days: 3, base: 89, perKg: 1.2 },
    'Inland LTL': { days: 2, base: 65, perKg: 0.38 },
    'CEP Inland': { days: 1, base: 12, perKg: 0.95 },
    'Sea LCL': { days: 14, base: 180, perKg: 0.25 },
    'Air Freight LCL': { days: 3, base: 95, perKg: 2.9 },
  },
  parcelDefault: { days: 3, base: 12, perKg: 0.95 },
  vehicle: {
    'Courier Van': 180, '1 Ton Bakkie': 240, '4 Ton Truck': 420, '8 Ton Truck': 650, '14 Ton Truck': 890,
    'Superlink (34 Ton)': 1450, 'Refrigerated 8 Ton': 820, 'Prime Mover + Skeletal Trailer': 1150,
    '20 ft Container (shared)': 390, '40 ft Container (shared)': 690, '20 ft Container': 1850, '40 ft Container': 2750,
    '40 ft High Cube': 2990, '20 ft Reefer': 2450, '40 ft Reefer': 3600,
    'Car Carrier (8 units)': 1950, 'Car Carrier Slot': 360, 'Low-bed Trailer': 2300, 'Flatbed Trailer': 1650,
    'Trailer Slot': 760, 'Self-propelled Unit': 2600, 'Towed Unit': 2150,
    'LD3 Container': 1200, 'LD7 Container': 2700, 'PMC Pallet': 3450,
  },
  vehiclePerTonne: 55,
  extraDrop: 45,
  vas: { 'Tailgate lift': 75, 'Forklift at offload': 150, 'Helper / labour': 60, 'Waiting time': 45, 'Goods in transit insurance': 95 },
  ftlDays: 1,
}

const cardFor = (c: RateCurrency): RateCard => (c === '$' ? USD : PHP)
/** round to the currency's minor unit: whole pesos, cents for dollars */
const roundFor = (c: RateCurrency, n: number) => (c === '$' ? Math.round(n * 100) / 100 : Math.round(n))

/** The price of one value-added service on this rate card (0 = included / not priced). */
export const vasPrice = (service: string, currency: RateCurrency = '₱'): number => cardFor(currency).vas[service] ?? 0
export const extraDropRate = (currency: RateCurrency = '₱'): number => cardFor(currency).extraDrop

/* ---------------------------------------------------------------- the lane ---- */

export type LaneZone = 'local' | 'regional' | 'national'
export const ZONE_LABEL: Record<LaneZone, string> = { local: 'Same city', regional: 'Same region', national: 'Nationwide' }
const ZONE_FACTOR: Record<LaneZone, number> = { local: 1, regional: 1.25, national: 1.6 }
const ZONE_DAYS: Record<LaneZone, number> = { local: 0, regional: 1, national: 2 }
const norm = (s?: string) => (s ?? '').trim().toLowerCase()

/** How far a lane runs: same city · same state / region (the same inbound hub) · national. */
export function laneZone(from: Party, to: Party): LaneZone {
  if (norm(from.city) && norm(from.city) === norm(to.city)) return 'local'
  if (norm(from.state) && norm(from.state) === norm(to.state)) return 'regional'
  if (!isChicago(from) && !isChicago(to) && inboundHubFor(from) === inboundHubFor(to)) return 'regional'
  return 'national'
}
/** Two stand-in addresses that make a lane of `zone` — for a calculator with no real addresses. */
export function zoneParties(zone: LaneZone): { from: Party; to: Party } {
  const p = (city: string, state: string): Party => ({
    name: '', contactNumber: '', email: '', businessName: '', country: '', line1: city, line2: '', landmark: '', postalCode: '', state, city,
  })
  return zone === 'local' ? { from: p('Pasay', 'Metro Manila'), to: p('Pasay', 'Metro Manila') }
    : zone === 'regional' ? { from: p('Pasay', 'Metro Manila'), to: p('Quezon City', 'Metro Manila') }
    : { from: p('Pasay', 'Metro Manila'), to: p('Mandaue', 'Cebu') }
}
/** Is an address complete enough to price a lane against? */
export const laneReady = (p: Party) => !!(norm(p.city) || norm(p.state)) && !!norm(p.line1)

/* ------------------------------------------------------------------ weights ---- */

export const volumetricKg = (p: Pick<Parcel, 'l' | 'w' | 'h'>) => (p.l * p.w * p.h) / VOL_FACTOR
/** Billable weight of the whole booking: each package at the greater of dead and volumetric weight. */
export function chargeableKg(parcels: Parcel[]): { dead: number; volumetric: number; chargeable: number } {
  let dead = 0, volumetric = 0, chargeable = 0
  for (const p of parcels) {
    const n = Math.max(0, p.quantity || 0)
    const d = Math.max(0, p.weight || 0)
    const v = volumetricKg(p)
    dead += d * n; volumetric += v * n; chargeable += Math.max(d, v) * n
  }
  const r = (x: number) => Math.round(x * 100) / 100
  return { dead: r(dead), volumetric: r(volumetric), chargeable: r(chargeable) }
}

/* ---------------------------------------------------------------- services ---- */

export interface ServiceOption { code: string; name: string; loadType: LoadType }
/* keep in step with ServiceOrderMasters' key (service-type: v3) and draft.ts */
const SERVICE_MASTER_KEY = 'local-masters-service_order-service-type-v4'

/**
 * The services a merchant may book — the local Service Type master's ACTIVE rows, in master
 * order (their Load type decides Shared / Full vehicle); before the master was ever edited
 * (`rows: null`) or when nothing is saved, the portal's `SERVICE_TYPES` with the name-rule
 * load types.
 */
export function bookableServices(): ServiceOption[] {
  try {
    const rows = (JSON.parse(localStorage.getItem(SERVICE_MASTER_KEY) ?? 'null') as { rows?: unknown } | null)?.rows
    if (Array.isArray(rows) && rows.length) {
      const seen = new Set<string>()
      const out: ServiceOption[] = []
      for (const r of rows as Record<string, unknown>[]) {
        if (!r || typeof r !== 'object') continue
        if (/(deactiv|disabl|inactive)/i.test(String(r.status ?? 'Active'))) continue
        const code = String(r.code ?? r.name ?? '').trim()
        if (!code || seen.has(code)) continue
        seen.add(code)
        const name = String(r.name ?? code).trim() || code
        out.push({ code, name, loadType: parseLoadType(r.loadType) ?? defaultLoadType(name) })
      }
      return out
    }
  } catch { /* private mode / malformed — the portal list */ }
  return SERVICE_TYPES.map((code) => ({ code, name: code, loadType: loadTypeOf(code) }))
}
/** Does a service offer this booking mode? */
export const offers = (s: Pick<ServiceOption, 'loadType'>, mode: 'ltl' | 'ftl') => s.loadType === 'both' || s.loadType === mode

/* ------------------------------------------------------------------ quotes ---- */

export interface QuoteLine { label: string; amount: number }
export interface ServiceQuote {
  code: string
  name: string
  mode: 'ltl' | 'ftl'
  days: number
  /** YYYY-MM-DD — the promised delivery date (Sundays skipped) */
  deliveryBy: string
  currency: RateCurrency
  /** freight + drops + VAS, before tax — what the draft's `rate` carries */
  net: number
  tax: number
  total: number
  lines: QuoteLine[]
}

export interface LaneInput {
  from: Party
  to: Party
  /** delivery addresses after the first */
  drops?: Party[]
  parcels: Parcel[]
  mode: 'ltl' | 'ftl'
  /** full vehicle: the vehicles booked */
  vehicles?: FtlVehicle[]
  /** value-added service names */
  vas?: string[]
  currency: RateCurrency
  now?: Date
}

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
/** `days` working days (Mon–Sat) after `now`. */
export function deliveryDate(now: Date, days: number): string {
  const d = new Date(now)
  let left = Math.max(1, days)
  while (left > 0) { d.setDate(d.getDate() + 1); if (d.getDay() !== 0) left -= 1 }
  return iso(d)
}

/** full vehicle: a service's premium (or discount) over the plain vehicle hire */
const FTL_SERVICE_FACTOR: Record<string, number> = {
  Express: 1.3, 'White Glove Delivery': 1.45, 'Sea FCL': 1.15, 'RORO FTL': 1.2, 'CEP Inland': 0.95,
}

const payloadTonnes = (type: string) => Math.max(1, (VEHICLE_SPECS.find((v) => v.type === type)?.payloadKg ?? 1000) / 1000)
/** One vehicle's rate on a card — by name, else by payload. */
export const vehicleRate = (type: string, currency: RateCurrency = '₱', payloadKg?: number): number => {
  const card = cardFor(currency)
  if (card.vehicle[type] != null) return card.vehicle[type]
  /* a hub's Vehicle Config names its rows after the catalogue type ("8 Ton Truck MNL-01") */
  const base = Object.keys(card.vehicle).filter((k) => type.startsWith(k)).sort((a, b) => b.length - a.length)[0]
  return base ? card.vehicle[base] : roundFor(currency, card.vehiclePerTonne * (payloadKg ? Math.max(1, payloadKg / 1000) : payloadTonnes(type)))
}

/** Price ONE service on a lane. */
export function quoteService(s: Pick<ServiceOption, 'code' | 'name'>, x: LaneInput): ServiceQuote {
  const card = cardFor(x.currency)
  const zone = laneZone(x.from, x.to)
  const f = ZONE_FACTOR[zone]
  const lines: QuoteLine[] = []
  let days: number
  if (x.mode === 'ftl') {
    const vs = x.vehicles?.length ? x.vehicles : []
    const ftl = FTL_SERVICE_TYPES.find((t) => t.code === s.code)
    /* a service with no FTL catalogue row: a dedicated vehicle runs a day faster than its shared tariff */
    const shared = card.parcel[s.code] ?? card.parcel[s.name]
    days = (ftl?.days ?? (shared ? Math.max(card.ftlDays, shared.days - 1) : card.ftlDays)) + ZONE_DAYS[zone]
    const byType = new Map<string, number>()
    for (const v of vs) byType.set(v.vehicleType, (byType.get(v.vehicleType) ?? 0) + 1)
    const sf = FTL_SERVICE_FACTOR[s.code] ?? FTL_SERVICE_FACTOR[s.name] ?? 1
    for (const [type, n] of byType) {
      lines.push({ label: `${n} × ${type}`, amount: roundFor(x.currency, vehicleRate(type, x.currency) * n * f * sf) })
    }
  } else {
    const t = card.parcel[s.code] ?? card.parcel[s.name] ?? card.parcelDefault
    days = t.days + ZONE_DAYS[zone]
    const kg = chargeableKg(x.parcels).chargeable
    lines.push({ label: `Freight · ${kg.toLocaleString()} kg · ${ZONE_LABEL[zone].toLowerCase()}`, amount: roundFor(x.currency, (t.base + t.perKg * Math.max(0, kg - 1)) * f) })
  }
  const drops = x.drops?.length ?? 0
  if (drops > 0) lines.push({ label: `${drops} extra drop${drops === 1 ? '' : 's'}`, amount: roundFor(x.currency, drops * card.extraDrop) })
  for (const v of x.vas ?? []) {
    const p = card.vas[v]
    if (p) lines.push({ label: v, amount: p })
  }
  const net = roundFor(x.currency, lines.reduce((n, l) => n + l.amount, 0))
  const total = x.currency === '$' ? roundFor('$', net * 1.15) : withTax(net)
  return {
    code: s.code, name: s.name, mode: x.mode, days, deliveryBy: deliveryDate(x.now ?? new Date(), days),
    currency: x.currency, net, tax: roundFor(x.currency, total - net), total, lines,
  }
}

/** Every bookable service for the lane in this mode, priced. */
export function quoteLane(x: LaneInput, services: ServiceOption[] = bookableServices()): ServiceQuote[] {
  return services.filter((s) => offers(s, x.mode)).map((s) => quoteService(s, x))
}

/**
 * An order-shaped record → its quote (OrderViewPage, an unpaid order with no frozen charges).
 * Same math as the form, from what the record carries.
 */
export function quoteForRecord(o: {
  shipmentType: string; sender: Party; receiver: Party; drops?: Party[]; serviceType?: string; currency?: string
  vehicleType?: string; vehicleUnit?: number; actualLoad?: number; vehicles?: FtlVehicle[]; additionalServices?: string[]
  pkg?: { count: number; weightKg: number; lengthCm: number; widthCm: number; heightCm: number }
}): { shipping: number; tax: number; total: number; service: string } {
  const currency: RateCurrency = o.currency === '$' ? '$' : '₱'
  const ftl = o.shipmentType === 'FTL'
  const parcels: Parcel[] = o.pkg ? [{
    cargoType: 'Parcel', itemInfo: '', quantity: 1, weight: o.pkg.weightKg,
    l: o.pkg.lengthCm, w: o.pkg.widthCm, h: o.pkg.heightCm,
  }] : []
  const service = o.serviceType || (ftl ? 'Inland FTL' : 'Standard')
  const q = quoteService({ code: service, name: service }, {
    from: o.sender, to: o.receiver, drops: o.drops ?? [], parcels, mode: ftl ? 'ftl' : 'ltl',
    vehicles: ftl ? vehiclesOf(o) : undefined, vas: o.additionalServices ?? [], currency,
  })
  return { shipping: q.net, tax: q.tax, total: q.total, service }
}
