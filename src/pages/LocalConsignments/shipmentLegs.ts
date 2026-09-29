/**
 * Shipment legs — how a consignment moves, from its two ends (owner, 2026-09-29; reference
 * "Add Consignment – Shipment Legs" + the 14-case table in the design note).
 *
 * Each end is a CUSTOMER address or a FACILITY (hub), and every customer is served by a hub. The route
 * stops at the hub of a customer end — unless that hub IS the other end — and ops may switch a stop off:
 *   · the Ship From customer's hub = the first-mile inbound (off = "Skip FM inbound")
 *   · the Ship To customer's hub   = the last-mile hub      (off = "Skip LM")
 * Consecutive points become legs: different hubs → LINE HAUL; the same hub → PICKUP (customer → hub),
 * DELIVERY (hub → customer) or PICK & DELIVER (customer → customer). The chain of legs is ONE of the
 * eight movement types below. Case 7 of the table (customer → a facility of ANOTHER hub, picked and
 * delivered by one vehicle) is the one route the stops cannot express: `direct` asks for it.
 *
 * Pure — no React, no store.
 */

export type EndKind = 'customer' | 'facility'
export interface RouteEnd { kind: EndKind; hub: string | null }
export type LegKind = 'pickup' | 'linehaul' | 'delivery' | 'pickAndDeliver'

export const MOVEMENT_TYPES = [
  'PICKUP_LINEHAUL_DELIVERY', 'LINEHAUL_DELIVERY', 'LINEHAUL', 'PICKUP_LINEHAUL',
  'PICK_AND_DEL', 'PICKUP_HUB_DELIVERY', 'PICKUP', 'DELIVERY',
] as const
export type MovementType = (typeof MOVEMENT_TYPES)[number]

export const LEG_LABEL: Record<LegKind, string> = {
  pickup: 'Pickup', linehaul: 'Line Haul', delivery: 'Delivery', pickAndDeliver: 'Pick & Deliver',
}
export const MOVEMENT_LABEL: Record<MovementType, string> = {
  PICKUP_LINEHAUL_DELIVERY: 'Pickup · Line haul · Delivery',
  LINEHAUL_DELIVERY: 'Line haul · Local delivery',
  LINEHAUL: 'Line haul',
  PICKUP_LINEHAUL: 'Local pickup · Line haul',
  PICK_AND_DEL: 'Pick & deliver',
  PICKUP_HUB_DELIVERY: 'Local pickup · Local delivery',
  PICKUP: 'Local pickup',
  DELIVERY: 'Local delivery',
}

export interface RouteChoice {
  /** switch the Ship From customer's hub stop off (Skip FM inbound) */
  skipFirstMile?: boolean
  /** switch the Ship To customer's hub stop off (Skip LM) */
  skipLastMile?: boolean
  /** customer → a facility of another hub, one vehicle picks and delivers (case 7) */
  direct?: boolean
}

export interface RoutePoint { kind: EndKind; hub: string | null; role: 'from' | 'to' | 'stop' }
export interface Route {
  /** the hub stops that may be switched off, in order */
  stops: { key: 'from' | 'to'; hub: string }[]
  points: RoutePoint[]
  legs: LegKind[]
  movementType: MovementType | null
  /** customer → another hub's facility with no stop left: the case-7 choice applies */
  directApplies: boolean
  error: string | null
}

const CODE: Record<LegKind, string> = { pickup: 'FM', linehaul: 'LH', delivery: 'LM', pickAndDeliver: 'PD' }
const BY_CHAIN: Record<string, MovementType> = {
  'FM-LH-LM': 'PICKUP_LINEHAUL_DELIVERY', 'FM-LM': 'PICKUP_HUB_DELIVERY', 'FM-LH': 'PICKUP_LINEHAUL',
  'LH-LM': 'LINEHAUL_DELIVERY', PD: 'PICK_AND_DEL', FM: 'PICKUP', LM: 'DELIVERY', LH: 'LINEHAUL',
}

/** The stops, points, legs and movement type for two ends and the user's switches. */
export function routeOf(from: RouteEnd, to: RouteEnd, choice: RouteChoice = {}): Route {
  const empty = (error: string | null): Route => ({ stops: [], points: [], legs: [], movementType: null, directApplies: false, error })
  if (!from.hub || !to.hub) return empty(null)
  if (from.kind === 'facility' && to.kind === 'facility' && from.hub === to.hub) return empty('Ship From and Ship To are the same hub.')

  /* the hub of a customer end — unless that hub is already the other end */
  const stops: Route['stops'] = []
  if (from.kind === 'customer' && !(to.kind === 'facility' && to.hub === from.hub)) stops.push({ key: 'from', hub: from.hub })
  if (to.kind === 'customer' && from.hub !== to.hub) stops.push({ key: 'to', hub: to.hub })

  const points: RoutePoint[] = [{ ...from, role: 'from' }]
  for (const st of stops) {
    const off = st.key === 'from' ? choice.skipFirstMile : choice.skipLastMile
    if (!off) points.push({ kind: 'facility', hub: st.hub, role: 'stop' })
  }
  points.push({ ...to, role: 'to' })

  const legOf = (a: RoutePoint, b: RoutePoint): LegKind => {
    if (a.hub !== b.hub) return 'linehaul'
    if (a.kind === 'customer' && b.kind === 'facility') return 'pickup'
    if (a.kind === 'facility' && b.kind === 'customer') return 'delivery'
    return 'pickAndDeliver'
  }
  let legs = points.slice(1).map((p, i) => legOf(points[i], p))

  /* case 7: customer → another hub's facility, no stop left — one vehicle may pick and deliver */
  const directApplies = from.kind === 'customer' && to.kind === 'facility' && from.hub !== to.hub && points.length === 2
  if (directApplies && choice.direct) legs = ['pickAndDeliver']

  return { stops, points, legs, movementType: BY_CHAIN[legs.map((l) => CODE[l]).join('-')] ?? null, directApplies, error: null }
}

/** Does the route start with a first-mile pickup (a pickup request is booked only then)? */
export const hasPickupLeg = (m: MovementType | null | undefined) =>
  m === 'PICKUP_LINEHAUL_DELIVERY' || m === 'PICKUP_HUB_DELIVERY' || m === 'PICKUP_LINEHAUL' || m === 'PICKUP'
