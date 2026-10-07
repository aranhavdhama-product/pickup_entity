/**
 * Vehicle Config — the hub's ROUTING vehicles (staging's Central Vehicle Config,
 * `/v2/central-vehicle-config/99999/529?cityId&hubId`, `auto_assign_configurationV2`;
 * research: docs/superpowers/research/2026-09-24-staging-central-vehicle-config.md).
 *
 * One row per vehicle, keyed by `hubCode`. Written by /local/routing/vehicles, read by
 * Same/Next Day Routing (the plan's fleet) and — through `vehicleTypesFor(hubCode)` —
 * by the consignment form, which lists only its Ship From hub's vehicles.
 *
 * Seeded from the owner's FTL vehicle catalogue (`draft.ts` VEHICLE_SPECS — the same
 * source as masters.ts SAMPLE_VEHICLE_TYPES; imported from draft, NOT masters, so
 * masters may import this module without a cycle). Specs are ESTIMATED.
 *
 * No React components, no fetch, no src/auth — safe for every app.
 */
import { VEHICLE_SPECS } from '../growOrders/draft'
import type { VehicleTypeOption } from '../growOrders/masters'
import { asRecord, createLocalConfigStore } from './localConfigStore'

/** staging's `travelingMode` values, shown as the Mode column */
export const VEHICLE_MODES = ['driving', 'bicycling', 'walking', 'truck'] as const
export type VehicleMode = (typeof VEHICLE_MODES)[number]
/** as the list prints it (staging: "SMALL TRUCK"); the editor title-cases it */
export const VEHICLE_MODE_LABEL: Record<VehicleMode, string> = {
  driving: 'CAR', bicycling: 'BIKE', walking: 'WALK', truck: 'SMALL TRUCK',
}

/** City of each demo hub — staging scopes Vehicle Config and routing by City → Hub. */
export const HUB_CITIES: Record<string, string> = {
  'MNL-01': 'Manila', 'CEB-01': 'Cebu', SANPABLO: 'San Pablo', ORD: 'Chicago', CHICAGO: 'Chicago',
}
export const cityOfHub = (hubCode: string): string => HUB_CITIES[hubCode] ?? hubCode

export interface HubVehicle {
  id: string
  /** staging's `vehicleType` — the Name column, free text per hub */
  name: string
  hubCode: string
  mode: VehicleMode
  /** 'HH:mm' */
  shiftStart: string
  shiftEnd: string
  weightCapacityKg: number
  /** m³ */
  volumeCapacity: number
  palletSpaces: number
  tags: string[]
  carrierCode: string
  /** staging's primary-vehicle star */
  primary?: boolean
  /**
   * Dedicated fleet (Skynet FR-07, 2026-10-07, NEW — not in staging): merchant NAMES this vehicle is contracted to. Empty / absent =
   * shared. Set, it can carry ONLY these merchants' pickups — a hard block with the reason, in every assignment path
   * (`dedicationBlock`, read by planningStore).
   */
  dedicatedTo?: string[]
  /** every other field of staging's vehicle editor (Power Source, cut-offs, costs, …), by label */
  extra?: Record<string, string>
}

export interface VehicleConfig { vehicles: HubVehicle[] }

export const VEHICLE_CONFIG_KEY = 'fareye-local-vehicle-config-v1'

/* ------------------------------------------------------------------ seed ---- */

/** m³ out of a catalogue capacity line ("Payload 800 kg · 3 m³") — 0 when it names none. */
const m3Of = (capacity: string): number => {
  const m = /([\d.]+)\s*m³/.exec(capacity)
  return m ? Number(m[1]) : 0
}

/** The parcel-routing slice of the catalogue each demo hub runs, by name. */
const HUB_FLEETS: [string, string[]][] = [
  ['MNL-01', ['Courier Van', '1 Ton Bakkie', '4 Ton Truck', '8 Ton Truck']],
  ['CEB-01', ['Courier Van', '1 Ton Bakkie', '4 Ton Truck']],
  ['SANPABLO', ['Courier Van', '4 Ton Truck', '8 Ton Truck', 'Refrigerated 8 Ton']],
  ['ORD', ['Courier Van', '1 Ton Bakkie', '14 Ton Truck']],
]

function seedVehicles(): HubVehicle[] {
  const out: HubVehicle[] = []
  HUB_FLEETS.forEach(([hubCode, names]) => {
    names.forEach((type, i) => {
      const spec = VEHICLE_SPECS.find((v) => v.type === type)
      if (!spec) return
      const kg = spec.payloadKg
      out.push({
        id: `${hubCode}-${i + 1}`,
        name: `${type} ${hubCode}`,
        hubCode,
        mode: kg >= 4000 ? 'truck' : 'driving',
        shiftStart: i % 2 ? '08:00' : '07:00',
        shiftEnd: i % 2 ? '20:00' : '19:00',
        weightCapacityKg: kg,
        volumeCapacity: m3Of(spec.capacity),
        palletSpaces: Math.max(1, Math.round(kg / 800)),
        tags: type.startsWith('Refrigerated') ? ['Cold chain'] : kg <= 1000 ? ['Parcel'] : ['Parcel', 'Bulky'],
        carrierCode: 'OWN_FLEET',
      })
    })
  })
  return out
}

export const DEFAULT_VEHICLE_CONFIG: VehicleConfig = Object.freeze({ vehicles: seedVehicles() }) as VehicleConfig

/* ------------------------------------------------------------- normalize ---- */

const str = (v: unknown, d = ''): string => (typeof v === 'string' ? v : d)
const num = (v: unknown, d = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : d)

function normalizeVehicle(raw: unknown, i: number): HubVehicle | null {
  const r = asRecord(raw)
  const name = str(r.name).trim()
  const hubCode = str(r.hubCode).trim()
  if (!name || !hubCode) return null
  return {
    id: str(r.id) || `V-${i + 1}`,
    name, hubCode,
    mode: (VEHICLE_MODES as readonly string[]).includes(str(r.mode)) ? (r.mode as VehicleMode) : 'driving',
    shiftStart: str(r.shiftStart, '07:00'),
    shiftEnd: str(r.shiftEnd, '19:00'),
    weightCapacityKg: Math.max(0, num(r.weightCapacityKg)),
    volumeCapacity: Math.max(0, num(r.volumeCapacity)),
    palletSpaces: Math.max(0, num(r.palletSpaces)),
    tags: Array.isArray(r.tags) ? r.tags.filter((t): t is string => typeof t === 'string' && !!t.trim()) : [],
    carrierCode: str(r.carrierCode),
    primary: r.primary === true,
    dedicatedTo: Array.isArray(r.dedicatedTo) ? r.dedicatedTo.filter((t): t is string => typeof t === 'string' && !!t.trim()) : [],
    extra: Object.fromEntries(Object.entries(asRecord(r.extra)).filter((e): e is [string, string] => typeof e[1] === 'string')),
  }
}

function normalize(raw: unknown): VehicleConfig {
  const r = asRecord(raw)
  if (!Array.isArray(r.vehicles)) return DEFAULT_VEHICLE_CONFIG
  return { vehicles: r.vehicles.map(normalizeVehicle).filter((v): v is HubVehicle => !!v) }
}

export const vehicleConfigStore = createLocalConfigStore<VehicleConfig>(VEHICLE_CONFIG_KEY, DEFAULT_VEHICLE_CONFIG, normalize)

/* ------------------------------------------------------------- selectors ---- */

export const useVehicleConfig = (): VehicleConfig => vehicleConfigStore.use()
export const allVehicles = (): HubVehicle[] => vehicleConfigStore.read().vehicles
export const vehiclesForHub = (hubCode: string | null | undefined, list: HubVehicle[] = allVehicles()): HubVehicle[] =>
  (hubCode ? list.filter((v) => v.hubCode === hubCode) : [])

export const vehicleCapacityLine = (v: HubVehicle): string => [
  v.weightCapacityKg ? `Payload ${v.weightCapacityKg.toLocaleString()} kg` : '',
  v.volumeCapacity ? `${v.volumeCapacity} m³` : '',
  v.palletSpaces ? `${v.palletSpaces} pallets` : '',
  VEHICLE_MODE_LABEL[v.mode],
].filter(Boolean).join(' · ')

/**
 * The hub's vehicles as the consignment form's Vehicle Type options (one per name).
 * NOTE: masters.ts has its own `vehicleTypesFor(list, serviceCode)` — import this one
 * aliased (or use `hubVehicleTypes`).
 */
export function vehicleTypesFor(hubCode: string | null | undefined): VehicleTypeOption[] {
  const seen = new Set<string>()
  return vehiclesForHub(hubCode).filter((v) => (seen.has(v.name) ? false : (seen.add(v.name), true)))
    .map((v) => ({ code: v.name, name: v.name, payloadKg: v.weightCapacityKg, capacity: vehicleCapacityLine(v) }))
}
export const hubVehicleTypes = vehicleTypesFor

/**
 * Dedicated fleet — may `merchant`'s work go on the vehicle a trip is labelled with, at `hubCode`? Returns the reason it may NOT
 * (hard block, no override), or null. The trip stores the vehicle as a label, so it is matched by name at the trip's hub; a
 * label that matches no configured vehicle, or a shared vehicle, never blocks.
 */
export function dedicationBlock(vehicleLabel: string | null | undefined, hubCode: string | null | undefined, merchant: string): string | null {
  const label = (vehicleLabel ?? '').trim().toLowerCase()
  if (!label || !merchant) return null
  const v = vehiclesForHub(hubCode).find((x) => x.name.trim().toLowerCase() === label)
    ?? allVehicles().find((x) => x.name.trim().toLowerCase() === label && (x.dedicatedTo?.length ?? 0) > 0)
  const owners = v?.dedicatedTo ?? []
  if (!v || !owners.length || owners.includes(merchant)) return null
  return `${v.name} is dedicated to ${owners.join(', ')} — it cannot carry ${merchant}'s pickup.`
}

/* --------------------------------------------------------------- actions ---- */

export const vehicleConfigActions = {
  /** add (no id / unknown id) or replace a vehicle — the whole array is rewritten */
  upsert(v: Omit<HubVehicle, 'id'> & { id?: string }): HubVehicle {
    const list = allVehicles()
    const id = v.id && list.some((x) => x.id === v.id) ? v.id : `V${Date.now().toString(36)}`
    const next: HubVehicle = { ...v, id }
    vehicleConfigStore.write({ vehicles: list.some((x) => x.id === id) ? list.map((x) => (x.id === id ? next : x)) : [...list, next] })
    return next
  },
  remove(id: string) {
    vehicleConfigStore.write({ vehicles: allVehicles().filter((x) => x.id !== id) })
  },
  reset() {
    try { localStorage.removeItem(VEHICLE_CONFIG_KEY) } catch { /* ignore */ }
    vehicleConfigStore.write({ vehicles: DEFAULT_VEHICLE_CONFIG.vehicles })
  },
}
