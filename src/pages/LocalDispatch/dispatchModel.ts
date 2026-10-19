/**
 * Dispatch Planning (LOCAL mockup) — the data and the rules, no React.
 *
 * A DEMO FIXTURE, not a store: one hub (S127, Greater Noida) on today's date,
 * three departure waves, nine optimised routes with their consignment stops,
 * and the hub's crew — drivers, helpers, vehicles and loading docks. It
 * carries what production splits over two screens: Dispatch Planning's waves
 * and Dock / Driver / Helper / Asset slots, and Route & Dispatch's route
 * metrics (cost, distance, time, utilisation, SPR), map and stop list.
 *
 * Deterministic (a seeded generator, never `Math.random`), so a reload shows
 * the same plan. Assignments are page state — a reload starts over.
 */

/* ------------------------------------------------------------------ types -- */

export type ResourceKind = 'dock' | 'driver' | 'helper' | 'vehicle'
export const SLOT_KINDS: ResourceKind[] = ['dock', 'driver', 'helper', 'vehicle']
export const SLOT_LABEL: Record<ResourceKind, string> = { dock: 'Dock', driver: 'Driver', helper: 'Helper', vehicle: 'Vehicle' }

export type CrewStatus = 'available' | 'on-trip' | 'off'
export const CREW_STATUS_LABEL: Record<CrewStatus, string> = { available: 'Available', 'on-trip': 'On trip', off: 'Off' }

export interface Resource {
  id: string
  kind: ResourceKind
  /** what a slot prints: a driver code, a plate, a dock name */
  label: string
  /** the second line: a person's name, a vehicle's type */
  sub: string
  status: CrewStatus
  /** 'HH:mm' — on a trip until then (status on-trip) */
  busyUntil?: string
  /** 'HH:mm – HH:mm' — people only */
  shift?: string
  /** vehicles only */
  vehicleType?: string
  capacityKg?: number
}

export interface Stop {
  seq: number
  consignment: string
  kind: 'Delivery' | 'Pickup'
  customer: string
  locality: string
  tags: string[]
  state: string
  /** 'HH:mm' */
  eta: string
  windowStart: string
  windowEnd: string
  /** the ETA falls outside the customer's window */
  late: boolean
  lat: number
  lng: number
  weightKg: number
  /** road km from the previous stop (the hub for stop 1) */
  legKm: number
  /* ---- production's Route & Dispatch consignment columns ---- */
  /** drive minutes from the previous stop */
  legMin: number
  vas: string
  confirmed: boolean
  /** m³ */
  volumeM3: number
  skus: number
  serviceMin: number
  instructions: string
  /** road km from the hub */
  fromHubKm: number
  contact: string
  address: string
  pincode: string
  sortCode: string
  merchant: string
  geofence: string
  plannedBy: string
}

export interface DispatchRoute {
  id: string
  name: string
  wave: number
  /** the vehicle type the optimiser planned for */
  vehicleType: string
  capacityKg: number
  start: string
  end: string
  stops: Stop[]
  orders: number
  distanceKm: number
  durationMin: number
  cost: number
  loadKg: number
  /** m³ on board / the vehicle type's m³ */
  volumeM3: number
  volumeCapM3: number
  /** pallet spaces used / the vehicle type's spaces */
  pallets: number
  palletCap: number
  /** the crew's shift length — Route Duration is read against it */
  shiftMin: number
  /** every consignment tag on the route */
  tags: string[]
  /** a two-person drop on the route — a helper is required */
  needsHelper: boolean
  alerts: string[]
}

export interface Wave {
  n: number
  start: string
  end: string
  unplanned: number
}

export type Assignment = Partial<Record<ResourceKind, string>>

export interface Hub { code: string; name: string; lat: number; lng: number }

/* -------------------------------------------------------------- helpers -- */

export const toMin = (hm: string): number => {
  const [h, m] = hm.split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}
export const toHM = (min: number): string =>
  `${String(Math.floor(min / 60) % 24).padStart(2, '0')}:${String(Math.round(min) % 60).padStart(2, '0')}`
export const fmtDuration = (min: number): string => {
  const h = Math.floor(min / 60)
  const m = Math.round(min % 60)
  return h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`
}
export const fmtKm = (km: number): string => `${km.toFixed(1)} km`
export const fmtInr = (n: number, digits = 0): string =>
  `₹${n.toLocaleString('en-IN', { minimumFractionDigits: digits, maximumFractionDigits: digits })}`
export const fmtHhMm = (min: number): string =>
  `${String(Math.floor(min / 60)).padStart(2, '0')}h ${String(Math.round(min % 60)).padStart(2, '0')}m`

export interface UtilDim {
  key: 'weight' | 'volume' | 'pallets' | 'time'
  label: string
  /** "24.9/500.0 kg" — production's used/capacity reading */
  reading: string
  /** null when the vehicle has no such capacity (a bike carries no pallets) */
  pct: number | null
}

/**
 * Every way a route fills its vehicle and its crew's day — production's utilisation card: weight, volume, pallet
 * spaces, and route duration against the shift. The route's utilisation is the BINDING one (the fullest).
 */
export function utilisationOf(r: DispatchRoute): { dims: UtilDim[]; pct: number; binding: UtilDim } {
  const pct = (used: number, cap: number) => (cap > 0 ? Math.round((used / cap) * 100) : null)
  const dims: UtilDim[] = [
    { key: 'weight', label: 'Weight', reading: `${r.loadKg.toFixed(1)}/${r.capacityKg.toFixed(1)} kg`, pct: pct(r.loadKg, r.capacityKg) },
    { key: 'volume', label: 'Volume', reading: `${r.volumeM3.toFixed(1)}/${r.volumeCapM3.toFixed(1)} m³`, pct: pct(r.volumeM3, r.volumeCapM3) },
    { key: 'pallets', label: 'Pallet spaces', reading: r.palletCap ? `${r.pallets.toFixed(1)}/${r.palletCap.toFixed(1)}` : 'No pallet spaces', pct: pct(r.pallets, r.palletCap) },
    { key: 'time', label: 'Route duration', reading: `${fmtHhMm(r.durationMin)}/${fmtHhMm(r.shiftMin)}`, pct: pct(r.durationMin, r.shiftMin) },
  ]
  const binding = dims.reduce((a, d) => ((d.pct ?? -1) > (a.pct ?? -1) ? d : a), dims[0])
  return { dims, pct: binding.pct ?? 0, binding }
}

/** The route's utilisation — its binding dimension (see `utilisationOf`). */
export const utilPct = (r: DispatchRoute): number => utilisationOf(r).pct

/** A route's line colour, by its place in the wave — tokens only (brand last: orange is an accent). */
const ROUTE_COLOUR_TOKENS = ['--color-st-info', '--color-teal-700', '--color-st-warning', '--color-st-success', '--color-warm-700', '--color-brand-500']
export const routeColourToken = (i: number): string => ROUTE_COLOUR_TOKENS[i % ROUTE_COLOUR_TOKENS.length]

/** mulberry32 — the fixture's only source of variety */
function seeded(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const haversineKm = (a: { lat: number; lng: number }, b: { lat: number; lng: number }): number => {
  const rad = Math.PI / 180
  const dLat = (b.lat - a.lat) * rad
  const dLng = (b.lng - a.lng) * rad
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2
  return 2 * 6371 * Math.asin(Math.sqrt(h))
}

/* ---------------------------------------------------------------- fixture -- */

export const HUBS: Hub[] = [
  { code: 'S127', name: 'Greater Noida Hub', lat: 28.4744, lng: 77.5040 },
  { code: 'S131', name: 'Ghaziabad Hub', lat: 28.6692, lng: 77.4538 },
]
export const HUB = HUBS[0]

const LOCALITIES = [
  'Knowledge Park II', 'Alpha 1', 'Beta 2', 'Gamma 1', 'Delta 3', 'Pari Chowk', 'Sector 36', 'Kasna', 'Surajpur',
  'Dadri', 'Tusyana', 'Sector Omicron', 'Ecotech III', 'Kulesara', 'Bisrakh', 'Gaur City', 'Sector 150', 'Jhatta',
]
const CUSTOMERS = [
  'Aarav Sharma', 'Isha Verma', 'Kabir Mehta', 'Ananya Gupta', 'Rohan Iyer', 'Meera Nair', 'Vikram Rao', 'Diya Kapoor',
  'Arjun Singh', 'Sana Khan', 'Neha Joshi', 'Aditya Bose', 'Pooja Reddy', 'Karan Malhotra', 'Riya Das', 'Nikhil Jain',
]
const TAG_POOL = ['fareye', 'COD', 'Fragile', 'Heavy', 'Priority']

/** the routes the optimiser returned: [name, wave, start, vehicle type, capacity kg, stops, bearing°] */
const PLAN: [string, number, string, string, number, number, number][] = [
  ['RRR 1', 1, '07:19', 'Rigid', 1500, 2, 300],
  ['RRR 2', 1, '07:24', 'Tata Ace', 750, 5, 20],
  ['RRR 3', 1, '07:40', 'Rigid', 1500, 6, 140],
  ['RRR 4', 2, '08:30', 'Tata Ace', 750, 4, 80],
  ['RRR 5', 2, '08:35', 'Eicher 14 ft', 3500, 7, 200],
  ['RRR 6', 2, '08:42', 'Tata Ace', 750, 5, 250],
  ['RRR 7', 2, '08:55', 'Rigid', 1500, 6, 330],
  ['RRR 8', 3, '10:05', 'Bike', 25, 3, 110],
  ['RRR 9', 3, '10:20', 'Tata Ace', 750, 5, 170],
]

export const WAVES: Wave[] = [
  { n: 1, start: '07:15', end: '07:45', unplanned: 1 },
  { n: 2, start: '08:30', end: '09:00', unplanned: 0 },
  { n: 3, start: '10:00', end: '10:30', unplanned: 2 },
]

/** per vehicle type: m³ and pallet spaces (kg comes from the plan) — ESTIMATED catalogue values */
const VEHICLE_SPACE: Record<string, { m3: number; pallets: number }> = {
  Rigid: { m3: 12, pallets: 6 }, 'Tata Ace': { m3: 5, pallets: 2 }, 'Eicher 14 ft': { m3: 24, pallets: 10 }, Bike: { m3: 0.12, pallets: 0 },
}
const VAS = ['ROOM_OF_CHOICE', '-', 'WHITE_GLOVE', '-', 'INSTALLATION', 'UNPACK_AND_DEBRIS']
const INSTRUCTIONS = [
  'Handle with care and take sign and ID with customer', '-', 'Call 10 minutes before arrival', '-',
  'Leave with security if not home', 'Fragile — keep upright', 'Gate 3, tower B lift lobby',
]
const MERCHANTS = ['FAREYE', 'Croma', 'Nykaa', 'Pepperfry', 'FAREYE']
const PINCODES: Record<string, string> = {
  'Knowledge Park II': '201310', 'Alpha 1': '201308', 'Beta 2': '201308', 'Gamma 1': '201308', 'Delta 3': '201308',
  'Pari Chowk': '201310', 'Sector 36': '201310', Kasna: '201310', Surajpur: '201306', Dadri: '203207', Tusyana: '201310',
  'Sector Omicron': '201308', 'Ecotech III': '201306', Kulesara: '201306', Bisrakh: '201318', 'Gaur City': '201318',
  'Sector 150': '201310', Jhatta: '201305',
}
const SHIFT_MIN = 9 * 60
const ROAD_FACTOR = 1.32     // road km over straight-line km, Greater Noida grid
const KMH = 24               // planned urban speed
const SERVICE_MIN = 9        // per stop
const COST_FIXED = 180       // per route, ₹
const COST_PER_KM = 7.4

function buildRoute([name, wave, start, vehicleType, capacityKg, n, bearing]: (typeof PLAN)[number], i: number): DispatchRoute {
  const rnd = seeded(1270 + i * 97)
  let at = { lat: HUB.lat, lng: HUB.lng }
  let clock = toMin(start)
  let distance = 0
  const stops: Stop[] = []
  for (let s = 0; s < n; s++) {
    /* fan out along the route's bearing — a few km to the first drop, then 1–2.5 km hops, drifting a little each stop */
    const deg = (bearing + (rnd() - 0.5) * 80) * (Math.PI / 180)
    const hop = s === 0 ? 1.8 + rnd() * 2 : 0.8 + rnd() * 1.3
    const next = {
      lat: at.lat + (Math.cos(deg) * hop) / 111,
      lng: at.lng + (Math.sin(deg) * hop) / (111 * Math.cos(HUB.lat * Math.PI / 180)),
    }
    const legKm = Math.round(haversineKm(at, next) * ROAD_FACTOR * 10) / 10
    distance += legKm
    clock += (legKm / KMH) * 60
    const eta = toHM(clock)
    const winStart = Math.floor((clock - 30 - rnd() * 60) / 30) * 30
    const late = (i === 1 && s === 3) || (i === 4 && s === 5)
    const windowEnd = late ? toHM(clock - 10) : toHM(winStart + 180)
    const pickup = (i === 4 || i === 8) && s === 1
    const weightKg = vehicleType === 'Bike' ? 2 + Math.round(rnd() * 5) : Math.round(18 + rnd() * capacityKg / (n * 1.6))
    const tags = ['fareye', ...TAG_POOL.slice(1).filter(() => rnd() < 0.18)]
    /* the detail columns draw from their OWN generator, so the plan above (ETAs, loads, cost) never shifts */
    const rd = seeded(9000 + i * 131 + s * 17)
    const locality = LOCALITIES[(i * 4 + s * 7) % LOCALITIES.length]
    const pincode = PINCODES[locality] ?? '201310'
    const north = Math.cos((bearing * Math.PI) / 180) >= 0
    stops.push({
      seq: s + 1,
      consignment: `NOIDA-${pickup ? 'PICKUP' : 'DELIVERY'}${String(51714 + i * 731 + s * 4517).slice(-5)}`,
      kind: pickup ? 'Pickup' : 'Delivery',
      customer: CUSTOMERS[(i * 5 + s * 3) % CUSTOMERS.length],
      locality,
      tags,
      state: pickup ? 'Pickup Requested' : 'At Facility',
      eta,
      windowStart: toHM(winStart),
      windowEnd,
      late,
      lat: next.lat,
      lng: next.lng,
      weightKg,
      legKm,
      legMin: Math.round((legKm / KMH) * 60 * 100) / 100,
      vas: VAS[Math.floor(rd() * VAS.length)],
      confirmed: rd() < 0.75,
      volumeM3: Math.round(weightKg * 0.0042 * 100) / 100,
      skus: 1 + Math.floor(rd() * 8),
      serviceMin: SERVICE_MIN,
      instructions: INSTRUCTIONS[Math.floor(rd() * INSTRUCTIONS.length)],
      fromHubKm: Math.round(haversineKm(HUB, next) * ROAD_FACTOR * 10) / 10,
      contact: `98${String(10000000 + Math.floor(rd() * 89999999)).slice(0, 8)}`,
      address: `Plot ${1 + Math.floor(rd() * 180)}, ${locality}, Greater Noida, Uttar Pradesh ${pincode}`,
      pincode,
      sortCode: `GN-${north ? 'N' : 'S'}${String(1 + ((i + s) % 6)).padStart(2, '0')}`,
      merchant: MERCHANTS[Math.floor(rd() * MERCHANTS.length)],
      geofence: north ? 'GNoida North' : 'GNoida South',
      plannedBy: 'Routing',
    })
    clock += SERVICE_MIN
    at = next
  }
  const back = Math.round(haversineKm(at, HUB) * ROAD_FACTOR * 10) / 10
  distance += back
  clock += (back / KMH) * 60
  const loadKg = stops.reduce((t, s) => t + s.weightKg, 0)
  const needsHelper = stops.some((s) => s.tags.includes('Heavy')) || loadKg > 900
  const alerts = [
    ...stops.filter((s) => s.late).map((s) => `Stop ${s.seq} (${s.consignment}) arrives ${s.eta}, after its window closes at ${s.windowEnd}`),
    ...(loadKg / capacityKg > 0.9 ? [`Load ${loadKg} kg is ${Math.round((loadKg / capacityKg) * 100)}% of the ${vehicleType}'s ${capacityKg} kg`] : []),
  ]
  const space = VEHICLE_SPACE[vehicleType] ?? { m3: 10, pallets: 4 }
  const volumeM3 = Math.round(loadKg * (vehicleType === 'Bike' ? 0.003 : 0.0042) * 10) / 10
  return {
    id: `R${String(i + 1).padStart(2, '0')}`,
    volumeM3,
    volumeCapM3: space.m3,
    pallets: space.pallets ? Math.round((volumeM3 / 1.4) * 10) / 10 : 0,
    palletCap: space.pallets,
    shiftMin: SHIFT_MIN,
    tags: [...new Set(stops.flatMap((x) => x.tags))],
    name, wave, vehicleType, capacityKg, start,
    end: toHM(clock),
    stops,
    orders: stops.length + (i % 3 === 1 ? 1 : 0),
    distanceKm: Math.round(distance * 10) / 10,
    durationMin: Math.round(clock - toMin(start)),
    cost: Math.round((COST_FIXED + distance * COST_PER_KM) * 100) / 100,
    loadKg,
    needsHelper,
    alerts,
  }
}

export const ROUTES: DispatchRoute[] = PLAN.map(buildRoute)

const person = (kind: 'driver' | 'helper', n: number, name: string, status: CrewStatus, shift: string, busyUntil?: string): Resource => ({
  id: `${kind === 'driver' ? 'dr' : 'hp'}${String(n).padStart(2, '0')}_s127`,
  kind, label: `${kind === 'driver' ? 'dr' : 'hp'}${String(n).padStart(2, '0')}_s127`, sub: name, status, shift, busyUntil,
})
const vehicle = (plate: string, vehicleType: string, capacityKg: number, status: CrewStatus = 'available', busyUntil?: string): Resource => ({
  id: plate, kind: 'vehicle', label: plate, sub: `${vehicleType} · ${capacityKg.toLocaleString('en-IN')} kg`,
  status, busyUntil, vehicleType, capacityKg,
})

export const RESOURCES: Resource[] = [
  person('driver', 1, 'Ravi Kumar', 'available', '07:00 – 16:00'),
  person('driver', 2, 'Sunil Yadav', 'available', '07:00 – 16:00'),
  person('driver', 3, 'Manoj Tiwari', 'on-trip', '06:00 – 15:00', '09:40'),
  person('driver', 4, 'Deepak Chauhan', 'available', '07:00 – 16:00'),
  person('driver', 5, 'Amit Pal', 'available', '07:30 – 16:30'),
  person('driver', 6, 'Rakesh Singh', 'available', '08:00 – 17:00'),
  person('driver', 7, 'Pradeep Sharma', 'off', '—'),
  person('driver', 8, 'Vijay Prajapati', 'available', '08:00 – 17:00'),
  person('driver', 9, 'Sanjay Gautam', 'on-trip', '06:30 – 15:30', '08:20'),
  person('driver', 10, 'Imran Ali', 'available', '09:00 – 18:00'),
  person('helper', 1, 'Raju Kumar', 'available', '07:00 – 16:00'),
  person('helper', 2, 'Sonu Verma', 'available', '07:00 – 16:00'),
  person('helper', 3, 'Ajay Kashyap', 'on-trip', '06:00 – 15:00', '09:10'),
  person('helper', 4, 'Mohit Saini', 'available', '08:00 – 17:00'),
  person('helper', 5, 'Golu Thakur', 'off', '—'),
  vehicle('UP16 DT 4410', 'Rigid', 1500),
  vehicle('UP16 FT 2208', 'Rigid', 1500),
  vehicle('UP16 KT 7731', 'Rigid', 1500, 'on-trip', '09:30'),
  vehicle('UP16 BT 1095', 'Tata Ace', 750),
  vehicle('UP16 CT 3384', 'Tata Ace', 750),
  vehicle('UP16 GT 5520', 'Tata Ace', 750),
  vehicle('UP16 HT 6617', 'Tata Ace', 750),
  vehicle('UP16 ET 9902', 'Eicher 14 ft', 3500),
  vehicle('UP16 BK 0423', 'Bike', 25),
  ...['D-01', 'D-02', 'D-03', 'D-04', 'D-05', 'D-06'].map((d, i): Resource => ({
    id: d, kind: 'dock', label: d, sub: i < 2 ? 'Large vehicles' : 'Any vehicle', status: d === 'D-06' ? 'off' : 'available',
  })),
]
export const resourceById = (id: string | undefined): Resource | undefined => (id ? RESOURCES.find((r) => r.id === id) : undefined)

/** Wave 1's first route went out already; the optimiser pre-filled a few vehicles. */
export const SEED_ASSIGNMENTS: Record<string, Assignment> = {
  R01: { dock: 'D-01', driver: 'dr02_s127', helper: 'hp01_s127', vehicle: 'UP16 DT 4410' },
  R02: { driver: 'dr01_s127', vehicle: 'UP16 BT 1095' },
  R03: { vehicle: 'UP16 FT 2208' },
  R05: { vehicle: 'UP16 ET 9902' },
  R08: { vehicle: 'UP16 BK 0423' },
}
export const SEED_COMMITTED = ['R01']

/* ----------------------------------------------------------------- rules -- */

const overlaps = (a: DispatchRoute, b: DispatchRoute): boolean =>
  toMin(a.start) < toMin(b.end) && toMin(b.start) < toMin(a.end)

/** The slots a route still needs before it can be assigned. */
export const missingSlots = (r: DispatchRoute, a: Assignment): ResourceKind[] =>
  SLOT_KINDS.filter((k) => !a[k] && (k !== 'helper' || r.needsHelper))

export const isReady = (r: DispatchRoute, a: Assignment): boolean => missingSlots(r, a).length === 0

export type AssignResult = { ok: true; movedFrom?: DispatchRoute } | { ok: false; reason: string }

/**
 * May `res` go into `route`'s slot? A dispatcher error is refused with its
 * reason: someone off today, a crew member or vehicle still out on an earlier
 * trip, the wrong vehicle type or too small a vehicle, a dock already loading
 * in the same wave. A resource on another route that is not assigned yet is
 * MOVED (the result names the route it left); one on an assigned route stays.
 */
export function canAssign(
  res: Resource, route: DispatchRoute, all: Record<string, Assignment>, committed: Set<string>,
): AssignResult {
  if (committed.has(route.id)) return { ok: false, reason: `${route.name} is already assigned — unassign it first.` }
  if (res.status === 'off') return { ok: false, reason: `${res.label} is off today.` }
  if (res.busyUntil && toMin(res.busyUntil) > toMin(route.start)) {
    return { ok: false, reason: `${res.label} is on a trip until ${res.busyUntil} — ${route.name} leaves at ${route.start}.` }
  }
  if (res.kind === 'vehicle') {
    if ((res.capacityKg ?? 0) < route.loadKg) {
      return { ok: false, reason: `${res.label} carries ${res.capacityKg} kg — ${route.name} loads ${route.loadKg} kg.` }
    }
    if (res.vehicleType !== route.vehicleType) {
      return { ok: false, reason: `${route.name} was planned for a ${route.vehicleType}; ${res.label} is a ${res.vehicleType}.` }
    }
  }
  const clash = ROUTES.find((o) => o.id !== route.id && all[o.id]?.[res.kind] === res.id
    && (res.kind === 'dock' ? o.wave === route.wave : overlaps(o, route)))
  if (clash && committed.has(clash.id)) {
    return { ok: false, reason: `${res.label} is on ${clash.name} (${clash.start} – ${clash.end}), which is already assigned.` }
  }
  return { ok: true, movedFrom: clash }
}

/** Where a resource is used across the day — for the Resources list. */
export const usedOn = (resId: string, all: Record<string, Assignment>): DispatchRoute[] =>
  ROUTES.filter((r) => Object.values(all[r.id] ?? {}).includes(resId))

/** Fill every empty slot of the given routes with the first resource the rules allow. */
export function autoFill(routes: DispatchRoute[], all: Record<string, Assignment>, committed: Set<string>): {
  next: Record<string, Assignment>; filled: number
} {
  const next: Record<string, Assignment> = Object.fromEntries(Object.entries(all).map(([k, v]) => [k, { ...v }]))
  let filled = 0
  for (const r of routes) {
    if (committed.has(r.id)) continue
    for (const kind of SLOT_KINDS) {
      if (next[r.id]?.[kind] || (kind === 'helper' && !r.needsHelper)) continue
      const pick = RESOURCES.filter((x) => x.kind === kind).find((x) => {
        const res = canAssign(x, r, next, committed)
        return res.ok && !res.movedFrom
      })
      if (pick) { next[r.id] = { ...next[r.id], [kind]: pick.id }; filled++ }
    }
  }
  return { next, filled }
}

/* ------------------------------------------------------------------ totals -- */

export interface WaveTotals {
  routes: number
  assigned: number
  stops: number
  orders: number
  distanceKm: number
  durationMin: number
  cost: number
  util: number
  alerts: number
}

export function totalsOf(routes: DispatchRoute[], committed: Set<string>): WaveTotals {
  const sum = (f: (r: DispatchRoute) => number) => routes.reduce((t, r) => t + f(r), 0)
  return {
    routes: routes.length,
    assigned: routes.filter((r) => committed.has(r.id)).length,
    stops: sum((r) => r.stops.length),
    orders: sum((r) => r.orders),
    distanceKm: sum((r) => r.distanceKm),
    durationMin: sum((r) => r.durationMin),
    cost: sum((r) => r.cost),
    util: routes.length ? Math.round(sum(utilPct) / routes.length) : 0,
    alerts: sum((r) => r.alerts.length),
  }
}

export function dispatchCsv(routes: DispatchRoute[], all: Record<string, Assignment>, committed: Set<string>): string {
  const head = ['Wave', 'Route', 'Status', 'Start', 'End', 'Vehicle Type', 'Stops', 'Orders', 'Distance km', 'Duration min', 'Cost INR', 'Load kg', 'Dock', 'Driver', 'Helper', 'Vehicle']
  const rows = routes.map((r) => {
    const a = all[r.id] ?? {}
    return [r.wave, r.name, committed.has(r.id) ? 'Assigned' : 'Pending', r.start, r.end, r.vehicleType, r.stops.length, r.orders,
      r.distanceKm, r.durationMin, r.cost, r.loadKg, a.dock ?? '', a.driver ?? '', a.helper ?? '', a.vehicle ?? '']
  })
  return [head, ...rows].map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
}
