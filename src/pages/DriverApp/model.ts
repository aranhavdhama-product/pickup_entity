/**
 * Selectors and the two compound writes of the Pilot prototype. Everything
 * reads the live Grow store + planningStore; nothing here keeps its own copy of
 * a trip, a stop or a request.
 */
import {
  growOrderActions, growOrdersSnapshot, newOrderId, newOrderNumber, ORDER_DEFAULTS, orderById, pickupRequestById,
} from '../../growOrders/store'
import { daysFromNow, isOpenPr } from '../../growOrders/tabs'
import { CARRIER_SIDE_REASON_CODES, PICKABLE_FAILURE_REASONS, type ReasonOption } from '../../growOrders/pickupReasons'
import type { GrowOrder, GrowPickupRequest, PickupOverage, PickupPod } from '../../growOrders/types'
import { planningActions, type LocalTrip, type PlannedStop, type PlanningDb } from '../LocalPFP/planningStore'
import { DEFAULT_DRIVER } from './session'

/* ------------------------------------------------------------ drivers ---- */

/** Every driver the seeded / planned trips name, plus the default login. */
export function driverRoster(trips: LocalTrip[]): string[] {
  const names = trips.map((t) => t.driverName).filter((n): n is string => !!n)
  return [DEFAULT_DRIVER, ...[...new Set(names)].filter((n) => n !== DEFAULT_DRIVER).sort()]
}

export const driverId = (name: string): string => {
  let h = 0
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return `DRV-${String(h % 100000).padStart(5, '0')}`
}

export const initials = (name: string) => name.split(/\s+/).map((w) => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()

/* -------------------------------------------------------------- trips ---- */

export const today = () => daysFromNow(0)

const ORDER: Record<string, number> = { 'In Transit': 0, 'Yet to debrief': 1, 'Yet to start': 2, 'Un-assigned': 3, Completed: 4 }

/** The driver's trips that are not finished, soonest first (a running trip leads). */
export function openTripsOf(trips: LocalTrip[], driver: string): LocalTrip[] {
  return trips
    .filter((t) => t.driverName === driver && t.status !== 'Completed' && t.status !== 'Un-assigned')
    .sort((a, b) => a.date.localeCompare(b.date) || ORDER[a.status] - ORDER[b.status] || a.id.localeCompare(b.id))
}

/** The trip Home is about: running → waiting for debrief → next to start today. */
/*  With nothing today, the NEXT Yet-to-start trip on any later date — the
    prototype's clock is a demo clock, so it can be started now. */
export function currentTrip(trips: LocalTrip[], driver: string): LocalTrip | undefined {
  const open = openTripsOf(trips, driver)
  const mine = open.filter((t) => t.date <= today())
  return mine.find((t) => t.status === 'In Transit') ?? mine.find((t) => t.status === 'Yet to debrief') ?? mine[0]
    ?? open.find((t) => t.status === 'Yet to start')
}

export const stopKey = (x: PlannedStop): string => (x.kind === 'pickup' ? x.prId : x.orderId) ?? `${x.seq}`

/** Done from the driver's point of view. A delivery has no stop-status action,
 *  so its console closure record is what marks it done. */
export function isStopDone(x: PlannedStop, planning: PlanningDb): boolean {
  if (x.status === 'Done' || x.status === 'Failed') return true
  if (x.kind === 'delivery') return !!(x.orderId && planning.closures[x.orderId])
  const pr = pickupRequestById(x.prId)
  return !!pr && !isOpenPr(pr.status)
}

export type StopOutcome = 'Pending' | 'Arrived' | 'Delivered' | 'Not delivered' | 'Picked' | 'Partially picked' | 'Pickup failed'

export function stopOutcome(x: PlannedStop, planning: PlanningDb): StopOutcome {
  if (x.kind === 'delivery') {
    const c = x.orderId ? planning.closures[x.orderId] : undefined
    if (c) return c.outcome === 'Failed' ? 'Not delivered' : 'Delivered'
    if (x.status === 'Done') return 'Delivered'
    if (x.status === 'Failed') return 'Not delivered'
    return x.status === 'Arrived' ? 'Arrived' : 'Pending'
  }
  const pr = pickupRequestById(x.prId)
  if (pr?.status === 'Completed') return pr.orderIds.some((i) => !pr.pickedOrderIds.includes(i)) ? 'Partially picked' : 'Picked'
  if (pr?.status === 'Pickup Failed' || pr?.status === 'Cancelled' || x.status === 'Failed') return 'Pickup failed'
  return x.status === 'Arrived' ? 'Arrived' : 'Pending'
}

export function tripCounts(t: LocalTrip) {
  const pickups = t.stops.filter((x) => x.kind === 'pickup').length
  return { total: t.stops.length, pickups, deliveries: t.stops.length - pickups }
}

/** Trip window: first stop's planned time → last stop's + 1h. */
export function tripWindow(t: LocalTrip): { start: string; end: string } {
  if (!t.stops.length) return { start: '—', end: '—' }
  const first = t.stops[0].eta
  const last = t.stops[t.stops.length - 1].eta
  const [h, m] = last.split(':').map(Number)
  return { start: first, end: `${String((h + 1) % 24).padStart(2, '0')}:${String(m || 0).padStart(2, '0')}` }
}

/** "00:30" until the reporting time (30 min before the first stop); null once it has passed. */
export function startsIn(t: LocalTrip, now = new Date()): string | null {
  const first = t.stops[0]
  if (!first) return null
  const at = new Date(first.plannedAt)
  if (Number.isNaN(at.getTime())) return null
  const mins = Math.round((at.getTime() - 30 * 60_000 - now.getTime()) / 60_000)
  if (mins <= 0) return null
  return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`
}

export function dateLabel(d: string): string {
  if (d === today()) return 'Today'
  if (d === daysFromNow(1)) return 'Tomorrow'
  const dt = new Date(`${d}T00:00`)
  return Number.isNaN(dt.getTime()) ? d : dt.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short' })
}

/* ----------------------------------------------------------- requests ---- */

export function storeOf(pr: GrowPickupRequest) {
  return growOrdersSnapshot().stores.find((s) => s.code === pr.storeCode)
}

/** Who the driver meets: the typed-in pickup party, else the store's own. */
export function pickupParty(pr: GrowPickupRequest) {
  const party = pr.shipFrom ?? storeOf(pr)?.party
  return {
    merchant: party?.businessName || storeOf(pr)?.name || pr.storeCode,
    place: storeOf(pr)?.name ?? pr.storeCode,
    contact: pr.contactName || party?.name || '',
    phone: pr.contactNumber || party?.contactNumber || '',
    address: party ? [party.line1, party.line2, party.city].filter(Boolean).join(', ') : pr.storeCode,
  }
}

export const isReserved = (pr: GrowPickupRequest) => pr.blind && pr.orderIds.length === 0

/** A label / manual entry → an order: id, order number or tracking number. */
export function findOrderByCode(code: string): GrowOrder | undefined {
  const key = code.trim().toLowerCase()
  if (!key) return undefined
  return growOrdersSnapshot().orders.find((o) => o.id.toLowerCase() === key || o.orderNumber.toLowerCase() === key
    || (!!o.trackingNumber && o.trackingNumber.toLowerCase() === key))
}

/** Carrier-side codes: the driver / fleet could not do it. Everything else is the merchant's side. */
export const CARRIER_SIDE = CARRIER_SIDE_REASON_CODES
export const MERCHANT_SIDE_REASONS: ReasonOption[] = PICKABLE_FAILURE_REASONS.filter((r) => !CARRIER_SIDE.has(r.code))

/* ---------------------------------------------- pickup stop work (local) ---- */

export interface DriverOverage {
  id: string
  barcode: string
  weightKg: number | null
  note: string
  /** hold = on the PR for ops; create = consignment created at completion; reject = left behind */
  action: 'hold' | 'create' | 'reject'
}

/** What the driver has done at a stop before swiping Complete. */
export interface PickupWork {
  scanned: string[]                       // orderIds (booked here, or extras booked elsewhere)
  notPicked: Record<string, string>       // orderId → reason code
  overages: DriverOverage[]
  pieces: number                          // reserved PR: counted at the door
  signed: boolean
  photo: boolean
  otp: string
}

export const blankWork = (pieces = 0): PickupWork =>
  ({ scanned: [], notPicked: {}, overages: [], pieces, signed: false, photo: false, otp: '' })

let ovSeq = 0
export const newOverageId = () => `dov${Date.now().toString(36)}${(ovSeq++).toString(36)}`

/**
 * Close a collection: everything the driver captured (scans, per-item Not
 * picked reasons, POD, overages incl. the uncounted pieces of a reserved
 * pickup) goes to `completePickupStop` in ONE call. Auto-create then follows
 * Grow's overage flow: the order is created Picked Up on this request and the
 * scan is resolved to it.
 */
export function completePickup(tripId: string, prId: string, work: PickupWork, pod: PickupPod | null): void {
  const pr = pickupRequestById(prId)
  if (!pr) return
  const scanned = [...new Set(work.scanned)]
  const now = new Date().toISOString()
  const kept = work.overages.filter((v) => v.action !== 'reject')
  const overages: PickupOverage[] = kept.map((v) => ({
    id: v.id, barcode: v.barcode, scannedAt: now, weightKg: v.weightKg,
    note: v.note || (v.action === 'create' ? 'Driver scan — consignment auto-created' : 'Driver scan — not on this pickup'),
    orderId: null,
  }))
  if (isReserved(pr)) {
    const uncounted = Math.max(0, work.pieces - scanned.length - kept.length)
    for (let i = 0; i < uncounted; i++) {
      overages.push({ id: newOverageId(), barcode: `${pr.number}-PC${String(i + 1).padStart(2, '0')}`, scannedAt: now,
        weightKg: null, note: 'Counted at the door (reserved pickup) — create the order for it', orderId: null })
    }
  }
  const notPickedReasons = Object.fromEntries(Object.entries(work.notPicked).filter(([id]) => !scanned.includes(id)))
  planningActions.completePickupStop(tripId, prId, scanned, { notPickedReasons, pod, overages })
  if (pickupRequestById(prId)?.status !== 'Completed') return
  const store = storeOf(pr)
  kept.filter((v) => v.action === 'create').forEach((v) => {
    const o: GrowOrder = {
      ...ORDER_DEFAULTS,
      id: newOrderId(), orderNumber: newOrderNumber(), createdAt: now,
      storeCode: pr.storeCode, inboundHubCode: pr.destinationCode ?? ORDER_DEFAULTS.inboundHubCode,
      sender: pr.shipFrom ?? store?.party ?? ORDER_DEFAULTS.sender,
      pkg: { ...ORDER_DEFAULTS.pkg, weightKg: v.weightKg ?? 0, description: v.note },
      trackingNumber: v.barcode, status: 'Picked Up',
      pickupRequestId: pr.id, pickedInRequestId: pr.id, pickupDate: pr.date,
      remarks: 'Created from a driver overage scan (Pilot)',
    }
    growOrderActions.create(o)
    growOrderActions.resolveOverage(prId, v.id, o.id)
  })
}

/** Order label for lists. */
export const orderLabel = (id: string) => orderById(id)?.orderNumber ?? id
