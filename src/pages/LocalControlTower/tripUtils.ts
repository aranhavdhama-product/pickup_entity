/**
 * Control Tower helpers shared by the Trips list, the trip page and the
 * Add-to-route dialog. Non-component exports live here (not in tripBits.tsx)
 * so React Fast Refresh keeps working on the component file.
 */
import type { LocalTrip, LocalTripStatus, PlannedStop, StopStatus } from '../LocalPFP/planningStore'
import { INBOUND_HUBS, hubName } from '../../growOrders/hubs'
import { orderById } from '../../growOrders/store'
import type { StoreLocation } from '../../growOrders/types'

export type Tone = 'success' | 'info' | 'warning' | 'danger' | 'neutral'

export const TRIP_TONE: Record<LocalTripStatus, Tone> = {
  'Un-assigned': 'neutral',
  'Yet to start': 'info',
  'In Transit': 'warning',
  'Yet to debrief': 'info',
  Completed: 'success',
}

export const STOP_TONE: Record<StopStatus, Tone> = {
  Pending: 'neutral', Arrived: 'info', Done: 'success', Failed: 'danger',
}

export type TripType = 'Pickup' | 'Delivery' | 'Mixed'
export const TRIP_TYPES: TripType[] = ['Pickup', 'Delivery', 'Mixed']

export function tripType(t: LocalTrip): TripType {
  const kinds = new Set(t.stops.map((s) => s.kind))
  if (kinds.size === 1) return kinds.has('pickup') ? 'Pickup' : 'Delivery'
  return kinds.size === 0 ? 'Delivery' : 'Mixed'
}

/**
 * The trip page closes a delivery through `completeDeliveryStop`, which sets
 * the stop itself. A consignment closed ELSEWHERE (Consignments → Close, PFP)
 * leaves its stop Pending, so a delivery whose order already reads Delivered /
 * Undelivered is shown as Done / Failed here.
 */
export function effectiveStopStatus(s: PlannedStop): StopStatus {
  if (s.kind === 'delivery' && s.orderId && (s.status === 'Pending' || s.status === 'Arrived')) {
    const st = orderById(s.orderId)?.status
    if (st === 'Delivered') return 'Done'
    if (st === 'Undelivered') return 'Failed'
  }
  return s.status
}

export function stopCounts(t: LocalTrip) {
  const st = t.stops.map(effectiveStopStatus)
  const done = st.filter((x) => x === 'Done').length
  const failed = st.filter((x) => x === 'Failed').length
  return { total: st.length, done, failed, closed: done + failed, pending: st.length - done - failed }
}

export const progressPct = (t: LocalTrip): number => {
  const c = stopCounts(t)
  return c.total ? Math.round((c.closed / c.total) * 100) : 0
}

/**
 * Stop compliance — PLACEHOLDER. The local store records no actual arrival
 * time, so: a successful stop counts on-time, a failed stop or a pending stop
 * whose planned time has passed counts delayed, and early stays 0.
 */
export function compliance(t: LocalTrip, now = new Date()) {
  let onTime = 0; let delayed = 0
  for (const s of t.stops) {
    const st = effectiveStopStatus(s)
    if (st === 'Done') onTime++
    else if (st === 'Failed') delayed++
    else if (new Date(s.plannedAt) < now) delayed++
  }
  return { early: 0, onTime, delayed }
}

export const carrierLabel = (t: LocalTrip): string => t.carrierName ?? 'Own fleet'

export const HUB_CODES = INBOUND_HUBS.map((h) => h.code)
export const hubLabel = (code: string, stores: StoreLocation[] = []): string =>
  (code ? `${hubName(code, stores)} (${code})` : '—')

/** Drivers seen on any trip — the suggestions for Assign driver. */
export const knownDrivers = (trips: LocalTrip[]): string[] =>
  [...new Set(trips.map((t) => t.driverName).filter((x): x is string => !!x))].sort()

export const vehicleOf = (trips: LocalTrip[], driver: string): string =>
  trips.find((t) => t.driverName === driver && t.vehicle)?.vehicle ?? ''

export const fmtDay = (day: string): string => {
  const d = new Date(`${day}T00:00`)
  return Number.isNaN(d.getTime()) ? day : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}
