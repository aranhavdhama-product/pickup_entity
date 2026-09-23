/**
 * Console-side planning state for the LOCAL Pending For Planning replica.
 *
 * It lives with the page, not in `src/growOrders/`, because none of it is part
 * of the merchant contract: a trip, a load plan, a console secondary state, a
 * reschedule reason, a raised exception and a closure record are facts the
 * console owns. Anything that DOES exist in the Grow vocabulary (an order being
 * Cancelled / Delivered / Undelivered) is written through `growOrderActions`
 * instead, so the merchant portal sees it too.
 *
 * Same shape as the Grow store: a module-level blob, `useSyncExternalStore`
 * subscribers, persisted to its own localStorage key.
 */
import { useSyncExternalStore } from 'react'
import {
  growOrderActions, growOrdersSnapshot, onPickupRequestDetached, orderById, pickupRequestById,
  type HubScanResult,
} from '../../growOrders/store'
import { SEED_TRIP_BASE, SEED_TRIPS, STORES } from '../../growOrders/seed'
import { daysFromNow, isOpenPr } from '../../growOrders/tabs'
import type { CarrierMode, GrowPickupRequest, PickupOverage, PickupPod } from '../../growOrders/types'

/* -v2: trips became Control Tower trips (status, hub, per-stop progress, the
   request / order each stop serves) and the store is SEEDED with one trip per
   status. The key bump is what makes an existing browser pick the seed up;
   normalizeTrip() still reads a v1 trip, so a copied blob loads. */
/* -v3: bumped with growOrders' v13 — the two seeds reference each other, so a
   browser must never hold one store's fresh seed against the other's stale one. */
/* -v4: bumped with growOrders' v14 (seed clean-up) for the same reason. */
const KEY = 'pfp-local-planning-v4'

export type LocalTripStatus = 'Un-assigned' | 'Yet to start' | 'In Transit' | 'Yet to debrief' | 'Completed'
export const TRIP_STATUSES: LocalTripStatus[] = ['Un-assigned', 'Yet to start', 'In Transit', 'Yet to debrief', 'Completed']
export type StopStatus = 'Pending' | 'Arrived' | 'Done' | 'Failed'

export interface PlannedStop {
  seq: number
  /**
   * What the driver does here. A pickup request is a routable stop too — it is
   * a collection rather than a drop — and a trip that did not record which is
   * which would send someone to an address without saying what for.
   */
  kind: 'delivery' | 'pickup'
  /** The request a pickup stop collects (null on a delivery). */
  prId: string | null
  /** The consignment a delivery stop drops (null on a pickup). */
  orderId: string | null
  status: StopStatus
  /** 'YYYY-MM-DDTHH:mm' local — the trip date plus `eta`. */
  plannedAt: string
  /** Display echoes, frozen when the stop was planned: PR number / order number and address. */
  orderNumber: string
  address: string
  eta: string
}

export interface LocalTrip {
  id: string                   // T10000330
  /** Driver or vehicle label — what the Control Tower row leads with. */
  name: string
  createdAt: string
  date: string                 // YYYY-MM-DD
  hubCode: string
  driverName: string | null
  vehicle: string | null
  status: LocalTripStatus
  carrierCode: string | null
  carrierName: string | null
  carrierMode: CarrierMode | null
  /** Something ops must look at (a stop's request was cancelled / rescheduled
   *  under it) — Control Tower shows Attention Required while non-null. */
  attention: string | null
  stops: PlannedStop[]
}

export interface LoadPlan {
  id: string
  createdAt: string
  orderIds: string[]
  weightKg: number
  palletSpaces: number
}

export interface ScheduleOverride {
  startAt: string
  endAt: string
  reason: string
  at: string
}

export interface RaisedException {
  type: string
  at: string
}

export interface ClosureRecord {
  outcome: 'Completed' | 'Failed' | 'Partial'
  atc: string
  atd: string
  failureReason: string
  attachments: number
  at: string
}

export interface PlanningDb {
  trips: LocalTrip[]
  loadPlans: LoadPlan[]
  /** orderId → console secondary state ('Planned', 'Staged', 'RTO Initiated', …) */
  secondaryState: Record<string, string>
  scheduleOverrides: Record<string, ScheduleOverride>
  exceptions: Record<string, RaisedException>
  closures: Record<string, ClosureRecord>
  cancelRemarks: Record<string, string>
  /** orderId → the notes typed on the View Consignment page's Notes tab. */
  notes: Record<string, { text: string; at: string }[]>
  /** orderIds that have LEFT the queue (planned, staged, closed or cancelled). */
  leftQueue: string[]
}

const EMPTY: PlanningDb = {
  trips: [], loadPlans: [], secondaryState: {}, scheduleOverrides: {},
  exceptions: {}, closures: {}, cancelRemarks: {}, notes: {}, leftQueue: [],
}

/* ------------------------------------------------------------ helpers ---- */

/** ETA ladder the plan preview promises and the trip record keeps — one stop an hour from 09:00. */
export const etaFor = (index: number): string => `${String((9 + index) % 24).padStart(2, '0')}:00`

const today = () => daysFromNow(0)
const oneOf = <T extends string>(v: unknown, all: readonly T[], d: T): T =>
  ((all as readonly string[]).includes(v as string) ? (v as T) : d)
const strOrNull = (v: unknown): string | null => (typeof v === 'string' && v ? v : null)

/** Where a collection happens: the typed-in pickup point, else the store's own address. */
function pickupAddress(pr: GrowPickupRequest): string {
  const party = pr.shipFrom
    ?? growOrdersSnapshot().stores.find((s) => s.code === pr.storeCode)?.party
    ?? STORES.find((s) => s.code === pr.storeCode)?.party
  return party ? [party.line1, party.city].filter(Boolean).join(', ') : pr.storeCode
}

function pickupStop(pr: GrowPickupRequest, seq: number, date: string): PlannedStop {
  const eta = etaFor(seq - 1)
  return { seq, kind: 'pickup', prId: pr.id, orderId: null, status: 'Pending', plannedAt: `${date}T${eta}`,
    orderNumber: pr.number, address: pickupAddress(pr), eta }
}

function deliveryStop(orderId: string, seq: number, date: string): PlannedStop {
  const o = orderById(orderId)
  const eta = etaFor(seq - 1)
  return { seq, kind: 'delivery', prId: null, orderId, status: 'Pending', plannedAt: `${date}T${eta}`,
    orderNumber: o?.orderNumber ?? orderId,
    address: o ? [o.receiver.line1, o.receiver.city].filter(Boolean).join(', ') : '', eta }
}

/** Renumber after a stop leaves, keeping each stop's own planned time. */
const resequence = (stops: PlannedStop[]): PlannedStop[] => stops.map((x, i) => ({ ...x, seq: i + 1 }))

/**
 * A trip read from ANY stored shape. v1 trips carried `driver` (not
 * `driverName`), no status or hub, and a parallel `orderIds` array whose i-th
 * entry was the i-th stop's order — or, for a pickup stop, its request id.
 */
function normalizeTrip(raw: unknown, i: number): LocalTrip {
  const t = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const legacy = Array.isArray(t.orderIds) ? (t.orderIds as unknown[]) : []
  const date = typeof t.date === 'string' && t.date ? t.date : today()
  const driverName = strOrNull(t.driverName) ?? strOrNull(t.driver)
  const stops = (Array.isArray(t.stops) ? (t.stops as Record<string, unknown>[]) : []).map((x, k): PlannedStop => {
    const kind = x.kind === 'pickup' ? 'pickup' : 'delivery'
    const eta = typeof x.eta === 'string' && x.eta ? x.eta : etaFor(k)
    const legacyId = typeof legacy[k] === 'string' ? (legacy[k] as string) : null
    return {
      seq: typeof x.seq === 'number' ? x.seq : k + 1,
      kind,
      prId: strOrNull(x.prId) ?? (kind === 'pickup' ? legacyId : null),
      orderId: strOrNull(x.orderId) ?? (kind === 'delivery' ? legacyId : null),
      status: oneOf(x.status, ['Pending', 'Arrived', 'Done', 'Failed'] as const, 'Pending'),
      plannedAt: typeof x.plannedAt === 'string' && x.plannedAt ? x.plannedAt : `${date}T${eta}`,
      orderNumber: typeof x.orderNumber === 'string' ? x.orderNumber : '',
      address: typeof x.address === 'string' ? x.address : '',
      eta,
    }
  })
  const vehicle = strOrNull(t.vehicle)
  return {
    id: strOrNull(t.id) ?? `T${SEED_TRIP_BASE - 1000 + i}`,
    name: strOrNull(t.name) ?? driverName ?? vehicle ?? 'Unassigned route',
    createdAt: strOrNull(t.createdAt) ?? new Date(0).toISOString(),
    date,
    hubCode: strOrNull(t.hubCode) ?? '',
    driverName,
    vehicle,
    status: oneOf(t.status, TRIP_STATUSES, driverName ? 'Yet to start' : 'Un-assigned'),
    carrierCode: strOrNull(t.carrierCode),
    carrierName: strOrNull(t.carrierName),
    carrierMode: t.carrierMode === 'FLEET' || t.carrierMode === 'CARRIER' ? t.carrierMode : null,
    attention: strOrNull(t.attention),
    stops,
  }
}

/** The five Control Tower trips, built from the seed list growOrders shares with its requests. */
function seedTrips(): LocalTrip[] {
  return SEED_TRIPS.map((t) => {
    const date = daysFromNow(t.day)
    const stops = t.stops.map((x, i): PlannedStop | null => {
      if (x.kind === 'delivery') return { ...deliveryStop(x.orderId, i + 1, date), status: x.status }
      const pr = pickupRequestById(x.prId)
      return pr ? { ...pickupStop(pr, i + 1, date), status: x.status } : null
    }).filter((x): x is PlannedStop => x !== null)
    const firstPr = t.stops.find((x) => x.kind === 'pickup')
    const hub = firstPr && firstPr.kind === 'pickup' ? pickupRequestById(firstPr.prId)?.destinationCode : null
    return {
      id: t.id, name: t.name, createdAt: `${daysFromNow(t.day - 1)}T18:00:00.000Z`, date,
      hubCode: hub ?? t.hubCode, driverName: t.driverName, vehicle: t.vehicle, status: t.status,
      carrierCode: null, carrierName: null, carrierMode: null, attention: null, stops,
    }
  })
}

function seeded(): PlanningDb {
  const trips = seedTrips()
  /* the seeded deliveries were routed, exactly as planForRouting would leave them */
  const routed = trips.flatMap((t) => t.stops.map((x) => x.orderId).filter((x): x is string => !!x))
  return { ...EMPTY, trips, leftQueue: routed }
}

/**
 * A pickup stop whose request no longer points back at this trip was detached
 * while nobody was listening (cancelled or rescheduled from a /grow tab). Drop
 * it and say so, rather than send a driver to a collection that is off.
 */
function healOrphanStops(trips: LocalTrip[]): LocalTrip[] {
  return trips.map((t) => {
    const orphans = t.stops.filter((x) => x.kind === 'pickup' && x.prId && (x.status === 'Pending' || x.status === 'Arrived')
      && pickupRequestById(x.prId) && pickupRequestById(x.prId)?.tripId !== t.id)
    if (!orphans.length) return t
    return {
      ...t,
      stops: resequence(t.stops.filter((x) => !orphans.includes(x))),
      attention: `${orphans.map((x) => x.orderNumber).join(', ')} no longer on this trip`,
    }
  })
}

function load(): PlanningDb {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const p = JSON.parse(raw) as Partial<PlanningDb>
      return {
        ...EMPTY,
        ...p,
        trips: healOrphanStops(Array.isArray(p.trips) ? (p.trips as unknown[]).map(normalizeTrip) : []),
        loadPlans: Array.isArray(p.loadPlans) ? p.loadPlans : [],
        leftQueue: Array.isArray(p.leftQueue) ? p.leftQueue : [],
      }
    }
  } catch { /* fall through to the seed */ }
  return seeded()
}

let db: PlanningDb = load()
const subs = new Set<() => void>()

function commit() {
  db = { ...db }
  try { localStorage.setItem(KEY, JSON.stringify(db)) } catch { /* ignore quota */ }
  subs.forEach((f) => f())
}

export function usePlanning(): PlanningDb {
  return useSyncExternalStore((cb) => { subs.add(cb); return () => subs.delete(cb) }, () => db)
}

let seq = 0
const newId = (p: string) => `${p}${Date.now().toString(36)}${(seq++).toString(36)}`

/** T10000335, T10000336, … — one above the highest trip id stored, never below the seed base. */
function newTripId(): string {
  const max = db.trips.reduce((n, t) => {
    const m = /^T(\d+)$/.exec(t.id)
    return m ? Math.max(n, Number(m[1])) : n
  }, SEED_TRIP_BASE - 1)
  return `T${max + 1}`
}

const leave = (ids: string[]) => {
  db.leftQueue = [...new Set([...db.leftQueue, ...ids])]
}

const setSecondary = (ids: string[], state: string) => {
  const next = { ...db.secondaryState }
  ids.forEach((id) => { next[id] = state })
  db.secondaryState = next
}

const tripById = (id: string) => db.trips.find((t) => t.id === id)
function mapTrip(id: string, fn: (t: LocalTrip) => LocalTrip) {
  db.trips = db.trips.map((t) => (t.id === id ? fn(t) : t))
}

/* A request cancelled / rescheduled under a trip leaves it. growOrders has
   already reset the request's tripId, so this only edits the trip — calling
   back into growOrderActions here would stamp the request twice. */
onPickupRequestDetached((e) => {
  if (!tripById(e.tripId)) return
  mapTrip(e.tripId, (t) => ({
    ...t,
    stops: resequence(t.stops.filter((x) => !(x.kind === 'pickup' && x.prId === e.prId))),
    attention: e.note,
  }))
  commit()
})

/** The truck is back at the hub — every collection it carried has arrived. */
const arrived = (trip: LocalTrip) =>
  trip.stops.forEach((x) => { if (x.prId) growOrderActions.markArrivedAtHub(x.prId) })

export const tripOf = (prId: string): LocalTrip | undefined =>
  db.trips.find((t) => t.stops.some((x) => x.kind === 'pickup' && x.prId === prId))

export const planningActions = {
  /** Route the selection directly — the PFP → ROUTING hand-off. Pickup stops
   *  carry the REQUEST id in `orderId`, as PFP has always passed them.
   *  No driver is ever invented: without one the route is an `Un-assigned`
   *  trip and its collections are Planned; with one it is `Yet to start` and
   *  they are Assigned. */
  planForRouting(
    stops: { orderId: string; orderNumber: string; address: string; kind?: 'delivery' | 'pickup' }[],
    crew: { driverName?: string | null; vehicle?: string | null } = {},
  ): LocalTrip {
    const driverName = crew.driverName?.trim() || null
    const vehicle = crew.vehicle?.trim() || null
    const ids = stops.map((s) => s.orderId)
    const first = stops[0]
    /* a collection runs on its window's START date (scenario 24) — a request for
       Friday routed on Wednesday is a Friday trip; deliveries run today */
    const firstPickup = stops.find((s) => s.kind === 'pickup')
    const date = (firstPickup && pickupRequestById(firstPickup.orderId)?.date) || today()
    const hub = first
      ? (first.kind === 'pickup' ? pickupRequestById(first.orderId)?.destinationCode : orderById(first.orderId)?.inboundHubCode)
      : null
    const trip: LocalTrip = {
      id: newTripId(),
      name: driverName ?? vehicle ?? 'Unassigned route',
      createdAt: new Date().toISOString(),
      date,
      hubCode: hub ?? '',
      driverName,
      vehicle,
      status: driverName ? 'Yet to start' : 'Un-assigned',
      carrierCode: null, carrierName: null, carrierMode: null, attention: null,
      stops: stops.map((s, i) => {
        const kind = s.kind ?? 'delivery'
        return {
          seq: i + 1, kind, prId: kind === 'pickup' ? s.orderId : null, orderId: kind === 'delivery' ? s.orderId : null,
          status: 'Pending' as const, plannedAt: `${date}T${etaFor(i)}`,
          orderNumber: s.orderNumber, address: s.address, eta: etaFor(i),
        }
      }),
    }
    db.trips = [trip, ...db.trips]
    setSecondary(ids, 'Planned')
    leave(ids)
    commit()
    /* a routed collection is Planned — and Assigned only when the route has a driver */
    trip.stops.forEach((x) => { if (x.prId) growOrderActions.setPickupTrip(x.prId, trip.id, trip.driverName) })
    return trip
  },

  /* ------------------------------------------------- Control Tower trips ---- */

  /** A new trip; with a driver it is ready to start, without one it waits for assignment. */
  createTrip(x: {
    hubCode: string; name?: string; date?: string; driverName?: string | null; vehicle?: string | null
    carrier?: { code: string; name: string; mode: CarrierMode } | null
  }): LocalTrip {
    const driverName = x.driverName || null
    const vehicle = x.vehicle || null
    const trip: LocalTrip = {
      id: newTripId(),
      name: x.name?.trim() || driverName || vehicle || 'Unassigned route',
      createdAt: new Date().toISOString(),
      date: x.date || today(),
      hubCode: x.hubCode,
      driverName, vehicle,
      status: driverName ? 'Yet to start' : 'Un-assigned',
      carrierCode: x.carrier?.code ?? null, carrierName: x.carrier?.name ?? null, carrierMode: x.carrier?.mode ?? null,
      attention: null,
      stops: [],
    }
    db.trips = [trip, ...db.trips]
    commit()
    return trip
  },

  /** "Add to route": a collection joins a trip (leaving any other trip it was on). */
  addPickupToTrip(tripId: string, prId: string): boolean {
    const trip = tripById(tripId)
    const pr = pickupRequestById(prId)
    if (!trip || !pr || !isOpenPr(pr.status) || trip.status === 'Completed' || trip.status === 'Yet to debrief') return false
    /* a 3PL runs its own collection — take it back from the carrier first (P7) */
    if (pr.carrierMode === 'CARRIER') return false
    const prev = tripOf(prId)
    if (prev?.id === tripId) return true
    if (prev) mapTrip(prev.id, (t) => ({ ...t, stops: resequence(t.stops.filter((x) => x.prId !== prId)) }))
    mapTrip(tripId, (t) => ({ ...t, stops: [...t.stops, pickupStop(pr, t.stops.length + 1, t.date)] }))
    setSecondary(pr.orderIds, 'Planned')
    commit()
    growOrderActions.setPickupTrip(prId, tripId, trip.driverName)
    /* a trip already on the road takes the new collection with it */
    if (trip.status === 'In Transit') growOrderActions.markOutForPickup(prId, `Added to ${tripId} en route`)
    return true
  },

  /** Take a stop off a trip. `stopId` is the stop's prId (pickup) or orderId (delivery). */
  removeStopFromTrip(tripId: string, stopId: string) {
    const trip = tripById(tripId)
    const stop = trip?.stops.find((x) => x.prId === stopId || x.orderId === stopId)
    if (!trip || !stop) return
    mapTrip(tripId, (t) => ({ ...t, stops: resequence(t.stops.filter((x) => x !== stop)) }))
    commit()
    if (stop.prId && pickupRequestById(stop.prId)?.tripId === tripId) growOrderActions.setPickupTrip(stop.prId, null)
  },

  /** A driver takes the trip — every collection on it becomes Assigned. */
  assignDriver(tripId: string, driverName: string, vehicle?: string | null) {
    const trip = tripById(tripId)
    if (!trip || !driverName) return
    mapTrip(tripId, (t) => ({
      ...t, driverName, vehicle: vehicle ?? t.vehicle,
      /* a trip named after its driver follows the driver; a custom name stays */
      name: t.name === t.driverName || (!t.driverName && t.name.startsWith('Unassigned')) ? driverName : t.name,
      status: t.status === 'Un-assigned' ? 'Yet to start' : t.status,
    }))
    commit()
    /* only collections still ahead — a Done / Failed stop's request keeps the
       driver who actually ran it */
    trip.stops.forEach((x) => {
      if (x.prId && (x.status === 'Pending' || x.status === 'Arrived')) growOrderActions.setPickupTrip(x.prId, tripId, driverName)
    })
  },

  /** Ops cancels a trip before it starts — every collection on it goes back to
   *  Requested to be planned again (its Planned / Assigned state is lost). */
  cancelTrip(tripId: string): boolean {
    const trip = tripById(tripId)
    if (!trip || (trip.status !== 'Un-assigned' && trip.status !== 'Yet to start')) return false
    db.trips = db.trips.filter((t) => t.id !== tripId)
    commit()
    trip.stops.forEach((x) => { if (x.prId) growOrderActions.setPickupTrip(x.prId, null) })
    return true
  },

  /** The driver leaves the hub — every collection still ahead is Out For Pickup. */
  startTrip(tripId: string): boolean {
    const trip = tripById(tripId)
    if (!trip || trip.status !== 'Yet to start') return false
    mapTrip(tripId, (t) => ({ ...t, status: 'In Transit' }))
    commit()
    trip.stops.forEach((x) => {
      if (x.prId && x.status !== 'Done' && x.status !== 'Failed') {
        growOrderActions.markOutForPickup(x.prId, `Trip ${tripId} started${trip.driverName ? ` — ${trip.driverName}` : ''}`)
      }
    })
    return true
  },

  arriveStop(tripId: string, stopId: string) {
    mapTrip(tripId, (t) => ({ ...t, stops: t.stops.map((x) => ((x.prId === stopId || x.orderId === stopId) && x.status === 'Pending'
      ? { ...x, status: 'Arrived' } : x)) }))
    commit()
  },

  /**
   * The driver closes a collection with what they scanned. Scans of parcels
   * booked here become the pickedOrderIds (merged with any the hub already
   * recorded in hub-only mode — completion REPLACES the list); scans of
   * parcels booked elsewhere are extras. The same scans are the driver's half
   * of the handover. Nothing collected and nothing booked = a failed stop.
   */
  completePickupStop(tripId: string, prId: string, scannedOrderIds: string[], extra: {
    notPickedReasons?: Record<string, string>; pod?: PickupPod | null; overages?: PickupOverage[]
  } = {}) {
    const pr = pickupRequestById(prId)
    if (!pr) return
    const booked = new Set(pr.orderIds)
    const scanned = [...new Set(scannedOrderIds)]
    /* hub-only mode may already have completed it from the hub side */
    if (isOpenPr(pr.status)) {
      growOrderActions.completePickupRequest(prId, {
        pickedOrderIds: [...new Set([...pr.pickedOrderIds, ...scanned.filter((i) => booked.has(i))])],
        extraOrderIds: scanned.filter((i) => !booked.has(i)),
        notPickedReasons: extra.notPickedReasons, pod: extra.pod, overages: extra.overages,
      })
    }
    if (scanned.length && pickupRequestById(prId)?.status === 'Completed') growOrderActions.driverScan(prId, scanned)
    const ok = pickupRequestById(prId)?.status === 'Completed'
    mapTrip(tripId, (t) => ({ ...t, stops: t.stops.map((x) => (x.prId === prId ? { ...x, status: ok ? 'Done' : 'Failed' } : x)) }))
    commit()
  },

  /** A drop on the trip closed by the driver. `stopId` = the stop's orderId.
   *  The order's own status follows (Delivered / Undelivered) so the merchant sees it. */
  completeDeliveryStop(tripId: string, stopId: string, outcome: 'Delivered' | 'Failed', note?: string) {
    const stop = tripById(tripId)?.stops.find((x) => x.kind === 'delivery' && x.orderId === stopId)
    if (!stop || !stop.orderId) return
    mapTrip(tripId, (t) => ({ ...t, stops: t.stops.map((x) => (x === stop ? { ...x, status: outcome === 'Delivered' ? 'Done' : 'Failed' } : x)) }))
    const text = `${outcome === 'Delivered' ? 'Delivered' : 'Delivery failed'} on ${tripId}${note ? ` — ${note}` : ''}`
    planningActions.addNote(stop.orderId, text)
    growOrderActions.update(stop.orderId, { status: outcome === 'Delivered' ? 'Delivered' : 'Undelivered' })
  },

  /** The driver could not collect — the request fails with a reason code. */
  failPickupStop(tripId: string, prId: string, reasonCode: string, note?: string) {
    growOrderActions.failPickupRequest(prId, note, reasonCode)
    mapTrip(tripId, (t) => ({ ...t, stops: t.stops.map((x) => (x.prId === prId ? { ...x, status: 'Failed' } : x)) }))
    commit()
  },

  /** Back at the hub — the trip waits for debrief. Hub in-scans happen in Inbound, not here. */
  debriefTrip(tripId: string): boolean {
    const trip = tripById(tripId)
    if (!trip || trip.status !== 'In Transit') return false
    mapTrip(tripId, (t) => ({ ...t, status: 'Yet to debrief' }))
    commit()
    arrived(trip)
    return true
  },

  /** Debrief done — the trip is closed. Ending straight from In Transit is allowed too. */
  endTrip(tripId: string): boolean {
    const trip = tripById(tripId)
    if (!trip || (trip.status !== 'Yet to debrief' && trip.status !== 'In Transit')) return false
    mapTrip(tripId, (t) => ({ ...t, status: 'Completed' }))
    commit()
    /* ending straight from In Transit skips debrief — the truck is back either way */
    arrived(trip)
    return true
  },

  /** Flag the trip for ops (the driver app's Report issue). */
  setTripAttention(tripId: string, note: string) {
    mapTrip(tripId, (t) => ({ ...t, attention: note }))
    commit()
  },

  clearAttention(tripId: string) {
    mapTrip(tripId, (t) => ({ ...t, attention: null }))
    commit()
  },

  /** Inbound's scanner: the hub in-scan, plus the console secondary state the
   *  Grow store has no word for. */
  hubInScan(code: string, opts: { hubCode?: string | null; damaged?: boolean } = {}): HubScanResult {
    const r = growOrderActions.hubScan(code, opts)
    if (r.kind === 'ok' && r.orderId) {
      setSecondary([r.orderId], opts.damaged ? 'Damaged' : 'At Facility')
      commit()
    }
    return r
  },

  /**
   * P4 — pickups sent to LOAD PLANNING. A load plan is a route too: each
   * collection joins today's "Load plan <hub> <date>" trip for its hub (reused
   * while it has not started, created Un-assigned otherwise), so it is Planned
   * with a trip like any routed request. A 3PL request never rides our trips
   * and is skipped. Returns the trips used and what could not be added.
   */
  sendPickupsToLoadPlanning(prIds: string[]): { trips: LocalTrip[]; added: string[]; skipped: string[] } {
    const date = today()
    const used = new Map<string, LocalTrip>()
    const added: string[] = []
    const skipped: string[] = []
    prIds.forEach((prId) => {
      const pr = pickupRequestById(prId)
      if (!pr || !isOpenPr(pr.status) || pr.carrierMode === 'CARRIER') { skipped.push(prId); return }
      const hub = pr.destinationCode ?? ''
      const name = `Load plan ${hub || 'TBC'} ${date}`
      const trip = used.get(hub)
        ?? db.trips.find((t) => t.name === name && t.hubCode === hub && (t.status === 'Un-assigned' || t.status === 'Yet to start'))
        ?? planningActions.createTrip({ hubCode: hub, name, date })
      used.set(hub, trip)
      if (!planningActions.addPickupToTrip(trip.id, prId)) { skipped.push(prId); return }
      growOrderActions.notePickupRequest(prId, `Sent to load planning — ${trip.id}`)
      added.push(prId)
    })
    return { trips: [...used.values()].map((t) => tripById(t.id) ?? t), added, skipped }
  },

  /** The other branch: planning moves to the Load Planning page. */
  sendToLoadPlanning(ids: string[], weightKg: number, palletSpaces: number): LoadPlan {
    const plan: LoadPlan = { id: newId('LP-'), createdAt: new Date().toISOString(), orderIds: ids, weightKg, palletSpaces }
    db.loadPlans = [plan, ...db.loadPlans]
    setSecondary(ids, 'Staged')
    leave(ids)
    commit()
    return plan
  },

  schedule(ids: string[], v: Omit<ScheduleOverride, 'at'>) {
    const next = { ...db.scheduleOverrides }
    ids.forEach((id) => { next[id] = { ...v, at: new Date().toISOString() } })
    db.scheduleOverrides = next
    setSecondary(ids, 'Scheduled')
    commit()
  },

  markReadyForPlanning(ids: string[]) {
    setSecondary(ids, 'Ready For Last Mile Dispatch')
    commit()
  },

  initiateRto(ids: string[]) {
    setSecondary(ids, 'RTO Initiated')
    leave(ids)
    commit()
  },

  raiseException(ids: string[], type: string) {
    const next = { ...db.exceptions }
    ids.forEach((id) => { next[id] = { type, at: new Date().toISOString() } })
    db.exceptions = next
    commit()
  },

  close(ids: string[], rec: Omit<ClosureRecord, 'at'>) {
    const next = { ...db.closures }
    ids.forEach((id) => { next[id] = { ...rec, at: new Date().toISOString() } })
    db.closures = next
    setSecondary(ids, rec.outcome === 'Failed' ? 'Undelivered' : 'Delivered')
    leave(ids)
    commit()
  },

  cancel(ids: string[], remarks: string) {
    const next = { ...db.cancelRemarks }
    ids.forEach((id) => { next[id] = remarks })
    db.cancelRemarks = next
    setSecondary(ids, 'Cancelled')
    leave(ids)
    commit()
  },

  addNote(orderId: string, text: string) {
    const list = db.notes[orderId] ?? []
    db.notes = { ...db.notes, [orderId]: [...list, { text, at: new Date().toISOString() }] }
    commit()
  },

  /** Demo escape hatch — puts everything back in the queue and the seeded
   *  trips back on Control Tower (an empty trip list would blank that page). */
  reset() {
    db = seeded()
    commit()
  },
}
