/**
 * Same/Next Day Routing — the PLAN layer (staging `get_routing_history` rows).
 *
 * A plan is one "Initiate Routing" run for a hub + dispatch date. Its ROUTES are
 * ordinary planningStore trips (`planForRouting`), so Control Tower, the driver app
 * and Pending for Planning see them unchanged; the plan only remembers which trips it
 * made, what it could not fit (Unplanned), what it planned for (FM / LM / Both), the
 * RFD flag and whether it was discarded. Nothing here re-implements trips.
 *
 * No routing engine: stops are sequenced deterministically (postcode, city, id) and
 * filled onto the chosen vehicles by weight — never Math.random.
 */
import { createLocalConfigStore, asRecord } from '../../config/localConfigStore'
import type { HubVehicle } from '../../config/vehicleConfig'
import type { GrowOrder, GrowOrdersDb, GrowPickupRequest } from '../../growOrders/types'
import { displayStatus, isOpenPr } from '../../growOrders/tabs'
import { readPickupModuleConfig } from '../../config/pickupModule'
import { growOrdersSnapshot } from '../../growOrders/store'
import { vehiclesForHub } from '../../config/vehicleConfig'
import { isPendingForPlanning, isPendingPickup, totalWeightKg } from '../LocalPFP/adapter'
import { planningActions, planningSnapshot, type LocalTrip, type PlanningDb } from '../LocalPFP/planningStore'

export type PlanFor = 'FM' | 'LM' | 'BOTH'
export const PLAN_FOR: PlanFor[] = ['FM', 'LM', 'BOTH']
export const PLAN_FOR_LABEL: Record<PlanFor, string> = { FM: 'First Mile', LM: 'Last Mile', BOTH: 'Both' }

export interface RoutingPlan {
  /** staging's Routing ID — numeric, 66100001 upward */
  id: string
  hubCode: string
  dispatchDate: string          // YYYY-MM-DD
  orderFrom: string
  orderTo: string
  planFor: PlanFor
  createdAt: string             // ISO
  tripIds: string[]
  /** stop labels that fit no vehicle — staging's "Unplanned" */
  unplanned: { id: string; kind: 'pickup' | 'delivery'; number: string; reason: string }[]
  vehicleNames: string[]
  /** ms the run took (staging's "Completed In") */
  runMs: number
  readyForDispatch: boolean
  discarded: boolean
  remark: string
}

const KEY = 'local-routing-plans-v1'
const PLAN_BASE = 66100001

function normalize(raw: unknown): { plans: RoutingPlan[] } {
  const r = asRecord(raw)
  return { plans: Array.isArray(r.plans) ? (r.plans as RoutingPlan[]).filter((p) => p && typeof p.id === 'string') : [] }
}
const store = createLocalConfigStore(KEY, { plans: [] as RoutingPlan[] }, normalize)
export const useRoutingPlans = (): RoutingPlan[] => store.use().plans
const plans = () => store.read().plans
export const readRoutingPlans = (): RoutingPlan[] => plans()
const save = (next: RoutingPlan[]) => store.write({ plans: next })

/* ------------------------------------------------------------ candidates ---- */

export interface Candidate {
  id: string                    // orderId (delivery) or prId (pickup)
  /** merchant store code (Create New Routes → Merchant Code) */
  merchant: string
  tags: string[]
  kind: 'pickup' | 'delivery'
  number: string
  address: string
  postcode: string
  city: string
  weightKg: number
}

const addr = (p: { line1?: string; city?: string } | undefined) => [p?.line1, p?.city].filter(Boolean).join(', ')

/** Open, unrouted pickup requests dropping at the hub whose window starts in [from, to]. */
export function pickupCandidates(db: GrowOrdersDb, hub: string, from: string, to: string): Candidate[] {
  return db.pickupRequests
    .filter((p: GrowPickupRequest) => isPendingPickup(p) && p.destinationCode === hub && !p.ftlServiceType
      && (!from || p.date >= from) && (!to || p.date <= to))
    .map((p) => {
      const party = db.stores.find((s) => s.code === p.storeCode)?.party
      const weight = p.orderIds.reduce((n, id) => {
        const o = db.orders.find((x) => x.id === id)
        return n + (o ? totalWeightKg(o) : 0)
      }, 0)
      return {
        id: p.id, kind: 'pickup' as const, number: p.number, merchant: p.storeCode, tags: [] as string[],
        address: addr(party) || (db.stores.find((s) => s.code === p.storeCode)?.name ?? p.storeCode),
        postcode: party?.postalCode ?? '', city: party?.city ?? '', weightKg: Math.round(weight * 10) / 10,
      }
    })
}

/**
 * Parcel consignments at the hub awaiting last mile: in the planning queue, created in
 * [from, to], and NOT still waiting on an open pickup request (a "Both" plan must not
 * collect and deliver the same parcel as two unrelated stops).
 */
export function deliveryCandidates(db: GrowOrdersDb, plan: PlanningDb, hub: string, from: string, to: string, atHubOnly = false): Candidate[] {
  const left = new Set(plan.leftQueue)
  return db.orders
    .filter((o: GrowOrder) => {
      if (o.inboundHubCode !== hub || o.shipmentType === 'FTL' || !isPendingForPlanning(o, left)) return false
      const day = o.createdAt.slice(0, 10)
      if ((from && day < from) || (to && day > to)) return false
      /* pickup module ON: a parcel still waiting at the merchant is first-mile work, not last */
      if (atHubOnly && displayStatus(o) === 'Ready for Pickup') return false
      const pr = o.pickupRequestId ? db.pickupRequests.find((x) => x.id === o.pickupRequestId) : null
      return !(pr && isOpenPr(pr.status))
    })
    .map((o) => ({
      id: o.id, kind: 'delivery' as const, number: o.orderNumber, merchant: o.storeCode, tags: o.tags ?? [], address: addr(o.receiver),
      postcode: o.receiver?.postalCode ?? '', city: o.receiver?.city ?? '', weightKg: totalWeightKg(o),
    }))
}

/** The deterministic "routing": postcode, then city, then number. */
export const sequence = (c: Candidate[]): Candidate[] => [...c].sort((a, b) =>
  a.postcode.localeCompare(b.postcode) || a.city.localeCompare(b.city) || a.number.localeCompare(b.number))

/* --------------------------------------------------------------- actions ---- */

export interface InitiateInput {
  hubCode: string
  dispatchDate: string
  orderFrom: string
  orderTo: string
  planFor: PlanFor
  vehicles: HubVehicle[]
  candidates: Candidate[]
}

function nextPlanId(): string {
  const max = plans().reduce((n, p) => Math.max(n, Number(p.id) || 0), PLAN_BASE - 1)
  return String(max + 1)
}

/**
 * Stops a vehicle's shift holds: trips keep planningStore's ETA ladder (one stop an
 * hour from 09:00 — `etaFor`), so a shift ending at 19:00 fits 10 stops.
 */
export const maxStopsOf = (v: HubVehicle): number => {
  const end = Number(v.shiftEnd.slice(0, 2)) || 19
  return Math.max(1, end - 9)
}

/** Fill the sequenced stops onto the vehicles by weight and shift; what fits nowhere is Unplanned. */
export function initiateRouting(x: InitiateInput): RoutingPlan {
  const t0 = performance.now()
  const loads = x.vehicles.map((v) => ({ v, kg: 0, stops: [] as Candidate[], max: maxStopsOf(v) }))
  const unplanned: RoutingPlan['unplanned'] = []
  for (const c of sequence(x.candidates)) {
    const slot = loads.find((l) => l.stops.length < l.max && (!l.v.weightCapacityKg || l.kg + c.weightKg <= l.v.weightCapacityKg))
    if (!slot) {
      const reason = !loads.length ? 'No vehicle configured'
        : loads.every((l) => l.stops.length >= l.max) ? 'Exceeds shift time' : 'Exceeds vehicle capacity'
      unplanned.push({ id: c.id, kind: c.kind, number: c.number, reason })
      continue
    }
    slot.kg += c.weightKg
    slot.stops.push(c)
  }
  const trips: LocalTrip[] = loads.filter((l) => l.stops.length).map((l) => planningActions.planForRouting(
    l.stops.map((c) => ({ orderId: c.id, orderNumber: c.number, address: c.address, kind: c.kind })),
    { vehicle: l.v.name, name: `${l.v.name}`, date: x.dispatchDate },
  ))
  const plan: RoutingPlan = {
    id: nextPlanId(), hubCode: x.hubCode, dispatchDate: x.dispatchDate, orderFrom: x.orderFrom, orderTo: x.orderTo,
    planFor: x.planFor, createdAt: new Date().toISOString(), tripIds: trips.map((t) => t.id), unplanned,
    vehicleNames: x.vehicles.map((v) => v.name), runMs: Math.round(performance.now() - t0),
    readyForDispatch: false, discarded: false, remark: '',
  }
  save([plan, ...plans()])
  return plan
}

export const routingPlanActions = {
  markReadyForDispatch(id: string) {
    save(plans().map((p) => (p.id === id ? { ...p, readyForDispatch: true } : p)))
  },
  /**
   * Discard: every route of the plan is cancelled (collections back to Requested,
   * deliveries back in the queue). Refused while any route has started.
   */
  discard(id: string, trips: LocalTrip[]): boolean {
    const p = plans().find((x) => x.id === id)
    if (!p) return false
    const mine = trips.filter((t) => p.tripIds.includes(t.id))
    if (mine.some((t) => t.status !== 'Un-assigned' && t.status !== 'Yet to start')) return false
    mine.forEach((t) => {
      const deliveries = t.stops.filter((s) => s.kind === 'delivery' && s.orderId).map((s) => s.orderId as string)
      planningActions.cancelTrip(t.id)
      planningActions.releaseOrders(deliveries)
    })
    /* trip ids are handed out again (max + 1), so a discarded plan keeps none */
    save(plans().map((x) => (x.id === id
      ? { ...x, discarded: true, tripIds: [], remark: `Discarded · ${mine.length} route${mine.length === 1 ? '' : 's'} cancelled` }
      : x)))
    return true
  },
  reset() {
    try { localStorage.removeItem(KEY) } catch { /* ignore */ }
    save([])
  },
}

/* ------------------------------------------------------------- derived ---- */

export type DispatchStatus = 'Un-Assigned' | 'Ready for Dispatch' | 'Assigned' | 'Dispatched' | 'Completed' | 'Discarded'
export const DISPATCH_STATUSES: DispatchStatus[] = ['Un-Assigned', 'Ready for Dispatch', 'Assigned', 'Dispatched', 'Completed']
export const DISPATCH_TONE: Record<DispatchStatus, 'success' | 'info' | 'warning' | 'danger' | 'neutral'> = {
  'Un-Assigned': 'neutral', 'Ready for Dispatch': 'info', Assigned: 'info', Dispatched: 'info', Completed: 'success', Discarded: 'neutral',
}

/** The plan's routes that still exist (a demo reset or a Control Tower cancel removes trips). */
export const tripsOfPlan = (p: RoutingPlan, trips: LocalTrip[]): LocalTrip[] =>
  /* a trip id handed out again after a cancel is a DIFFERENT trip — this plan's were made before it was stamped */
  p.tripIds.map((id) => trips.find((t) => t.id === id && t.createdAt <= p.createdAt)).filter((t): t is LocalTrip => !!t)

export function dispatchStatusOf(p: RoutingPlan, trips: LocalTrip[]): DispatchStatus {
  if (p.discarded) return 'Discarded'
  const mine = tripsOfPlan(p, trips)
  if (mine.length && mine.every((t) => t.status === 'Completed')) return 'Completed'
  if (mine.some((t) => t.status === 'In Transit' || t.status === 'Yet to debrief' || t.status === 'Completed')) return 'Dispatched'
  if (mine.length && mine.every((t) => !!t.driverName)) return 'Assigned'
  return p.readyForDispatch ? 'Ready for Dispatch' : 'Un-Assigned'
}

export const inProgress = (s: DispatchStatus) => s !== 'Completed' && s !== 'Discarded'

export function planCsv(p: RoutingPlan, trips: LocalTrip[]): string {
  const rows = [['Routing ID', 'Route', 'Trip', 'Seq', 'Type', 'Order / Request', 'Address', 'ETA', 'Status']]
  tripsOfPlan(p, trips).forEach((t) => t.stops.forEach((s) => rows.push([
    p.id, t.name, t.id, String(s.seq), s.kind === 'pickup' ? 'Pickup' : 'Delivery', s.orderNumber, s.address, s.eta, s.status,
  ])))
  return rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
}

const pad = (n: number) => String(n).padStart(2, '0')
/** staging's "2026-09-17 21:05:49", local time */
export const fmtStamp = (iso: string): string => {
  const d = new Date(iso)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

/** Everything a Create New Routes run would route now for a hub / window / plan-for. */
export function candidatesFor(db: GrowOrdersDb, plan: PlanningDb, x: {
  hubCode: string; orderFrom: string; orderTo: string; planFor: PlanFor; merchant?: string; tags?: string[]
  /** pickup module on — Last Mile then means "already at the hub" */
  pickupOn?: boolean
}): Candidate[] {
  const all = [
    ...(x.planFor === 'LM' ? [] : pickupCandidates(db, x.hubCode, x.orderFrom, x.orderTo)),
    ...(x.planFor === 'FM' ? [] : deliveryCandidates(db, plan, x.hubCode, x.orderFrom, x.orderTo, !!x.pickupOn)),
  ]
  return all.filter((c) => (!x.merchant || c.merchant === x.merchant) && (!x.tags?.length || c.tags.some((t) => x.tags!.includes(t))))
}

/** Copy Route: run the plan's hub / window / plan-for again over what is routable now. */
export function copyPlan(p: RoutingPlan): RoutingPlan | null {
  const candidates = candidatesFor(growOrdersSnapshot(), planningSnapshot(), { ...p, pickupOn: readPickupModuleConfig().enabled })
  const vehicles = vehiclesForHub(p.hubCode)
  if (!candidates.length || !vehicles.length) return null
  return initiateRouting({ ...p, vehicles, candidates })
}

export const fmtRun = (ms: number): string => {
  const sec = Math.max(0, Math.round(ms / 1000))
  return `${Math.floor(sec / 60)} min ${sec % 60} sec`
}
