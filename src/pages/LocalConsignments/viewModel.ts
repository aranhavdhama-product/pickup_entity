/**
 * View Consignment — the derived data behind the console's detail overlay.
 *
 * Staging's view (captured 2026-09-24 on /v2/ses/consignment) shows ten
 * sections: Summary · Order · Piece · Tracking · SKU · VAS · Load · Attempt ·
 * Customer Feedback · Notes, plus an Event Logs side panel. The local record
 * has no event service, no load service and no attempt service, so every
 * list here is DERIVED from what the store does hold — the order, its pickup
 * requests, the trips that carry it and the notes typed on it — and says so
 * where a value is a stand-in. Pure functions: no React, no store access.
 */
import type { GrowOrder, GrowOrdersDb, GrowPickupRequest, Party } from '../../growOrders/types'
import type { ParcelItem, VasLine } from '../../growOrders/draft'
import type { LocalTrip, PlanningDb } from '../LocalPFP/planningStore'
import type { LocalConsignmentRow } from '../LocalPFP/adapter'

/* ------------------------------------------------------------ pieces ----- */

export interface PieceView {
  id: string
  trackingNumber: string
  state: string
  productName: string
  skuCode: string
  skuDescription: string
  skuQuantity: number
  volumeMm3: number
  weightKg: number
  palletSpaces: number
  dims: string
  type: string
  value: number
}

/** Staging's package state for the order's status — the piece follows the consignment. */
export function pieceStateOf(o: GrowOrder): string {
  switch (o.status) {
    case 'Order Created': return o.paymentStatus === 'Paid' ? 'Label Generated' : 'Created'
    case 'Pickup Scheduled': return 'Pickup Scheduled'
    case 'Picked Up': return 'Picked Up'
    case 'In Transit': return 'At Facility'
    case 'Out for Delivery': return 'Loaded On Lastmile'
    case 'Delivered': return 'Delivered'
    case 'Undelivered': return 'Undelivered'
    case 'Cancelled': return 'Cancelled'
    default: return String(o.status)
  }
}

export function skuLinesOf(o: GrowOrder): ParcelItem[] {
  const items = o.pkg.items ?? []
  if (items.length) return items
  /* a record with no SKU rows still carries ONE line — the package's own description */
  return [{ skuCode: `${o.orderNumber}-SKU1`, name: o.pkg.description || o.pkg.kind, quantity: o.pkg.count, weightKg: o.pkg.weightKg }]
}

export function piecesOf(row: LocalConsignmentRow, o: GrowOrder): PieceView[] {
  const items = skuLinesOf(o)
  const n = Math.max(1, row.shipments.length)
  const perPiece = row.volumeMm3 / n
  return row.shipments.map((s, i) => {
    const it = items[Math.min(i, items.length - 1)]
    return {
      id: s.id,
      trackingNumber: s.trackingNumber,
      state: pieceStateOf(o),
      productName: it?.name || o.pkg.description || '—',
      skuCode: it?.skuCode || '—',
      skuDescription: it?.description || o.pkg.description || '—',
      skuQuantity: it?.quantity ?? 1,
      volumeMm3: Math.round(perPiece),
      weightKg: Math.round((o.pkg.weightKg / n) * 100) / 100,
      palletSpaces: Math.max(1, Math.round((row.palletSpaces ?? 1) / n)),
      dims: `${o.pkg.lengthCm} * ${o.pkg.widthCm} * ${o.pkg.heightCm} CM`,
      type: (o.pkg.packageType || (o.pkg.kind === 'Document' ? 'DOCUMENT' : 'BOX')).toUpperCase(),
      value: Math.round((o.pkg.declaredValue / n) * 100) / 100,
    }
  })
}

/* --------------------------------------------------------------- VAS ----- */

export interface VasView { id: string; code: string; name: string; level: string; serviceTimeMin: number; remark: string; piece: string }

export function vasLinesOf(o: GrowOrder, pieces: PieceView[]): VasView[] {
  const lines: VasLine[] = o.consignment?.vas ?? []
  if (lines.length) {
    return lines.map((v, i) => ({
      id: v.level === 'SKU' && v.skuCode ? v.skuCode : pieces[0]?.id ?? `VAS-${i + 1}`,
      code: v.service, name: '', level: v.level, serviceTimeMin: v.serviceTimeMin, remark: v.remark,
      piece: v.level === 'PACKAGE' ? pieces[0]?.id ?? '' : '',
    }))
  }
  /* an FTL order keeps its extras in additionalServices */
  return (o.additionalServices ?? []).map((s, i) => ({
    id: `VAS-${i + 1}`, code: s, name: '', level: 'CONSIGNMENT', serviceTimeMin: 0, remark: '', piece: '',
  }))
}

/* ------------------------------------------------------------- loads ----- */

export interface LoadView { leg: 'First Mile' | 'Last Mile'; trip: LocalTrip | null; pr: GrowPickupRequest | null }

const deliveryTripOf = (o: GrowOrder, trips: LocalTrip[]): LocalTrip | null =>
  trips.find((t) => t.stops.some((x) => x.kind === 'delivery' && x.orderId === o.id)) ?? null

const pickupTripOf = (pr: GrowPickupRequest | null, trips: LocalTrip[]): LocalTrip | null =>
  pr ? trips.find((t) => t.id === pr.tripId || t.stops.some((x) => x.kind === 'pickup' && x.prId === pr.id)) ?? null : null

export function loadsOf(o: GrowOrder, plan: Pick<PlanningDb, 'trips'>, db: Pick<GrowOrdersDb, 'pickupRequests'>): LoadView[] {
  const pr = db.pickupRequests.find((p) => p.id === o.pickupRequestId) ?? null
  const out: LoadView[] = []
  if (pr) out.push({ leg: 'First Mile', trip: pickupTripOf(pr, plan.trips), pr })
  out.push({ leg: 'Last Mile', trip: deliveryTripOf(o, plan.trips), pr: null })
  return out
}

/* ---------------------------------------------------------- attempts ----- */

export type AttemptOutcome = 'Success' | 'Failed' | 'Partial' | 'Discarded' | 'In progress'
export interface AttemptView {
  kind: 'Delivery' | 'Pickup' | 'Service'
  n: number
  at: string
  outcome: AttemptOutcome
  state: string
  driver: string
  helper: string
  hub: string
  tripId: string
  packages: string[]
  reason: string
}

export function attemptsOf(
  o: GrowOrder, row: LocalConsignmentRow,
  plan: Pick<PlanningDb, 'trips' | 'closures'>, db: Pick<GrowOrdersDb, 'pickupRequests'>,
): AttemptView[] {
  const packages = row.shipments.map((s) => s.id)
  const out: AttemptView[] = []

  /* delivery: one attempt per delivery stop the driver has worked (or is working) */
  let d = 0
  for (const t of plan.trips) {
    for (const x of t.stops) {
      if (x.kind !== 'delivery' || x.orderId !== o.id) continue
      if (x.status === 'Pending' && t.status !== 'In Transit') continue
      d += 1
      out.push({
        kind: 'Delivery', n: d, at: x.plannedAt || t.date,
        outcome: x.status === 'Done' ? 'Success' : x.status === 'Failed' ? 'Failed' : 'In progress',
        state: x.status === 'Done' ? 'Delivered' : x.status === 'Failed' ? 'Undelivered' : 'Out For Delivery',
        driver: t.driverName ?? '', helper: '', hub: t.hubCode, tripId: t.id, packages, reason: '',
      })
    }
  }
  if (d === 0 && (o.status === 'Delivered' || o.status === 'Undelivered' || o.status === 'Out for Delivery')) {
    const closure = plan.closures[o.id]
    out.push({
      kind: 'Delivery', n: 1, at: closure?.atc || o.createdAt,
      outcome: o.status === 'Delivered' ? 'Success' : o.status === 'Undelivered' ? 'Failed' : 'In progress',
      state: o.status === 'Out for Delivery' ? 'Out For Delivery' : o.status,
      driver: row.assignedDriver, helper: '', hub: o.inboundHubCode, tripId: '', packages,
      reason: closure?.failureReason ?? '',
    })
  }

  /* pickup: every request that went out for this order */
  let p = 0
  const prs = db.pickupRequests.filter((x) => x.orderIds.includes(o.id) || x.pickedOrderIds.includes(o.id))
  for (const pr of prs) {
    const worked = ['Out For Pickup', 'Completed', 'Pickup Failed'].includes(pr.status)
    if (!worked) continue
    p += 1
    const picked = pr.pickedOrderIds.includes(o.id)
    out.push({
      kind: 'Pickup', n: p, at: pr.startAt,
      outcome: pr.status === 'Out For Pickup' ? 'In progress' : picked ? 'Success' : 'Failed',
      state: pr.status === 'Out For Pickup' ? 'Out For Pickup' : picked ? 'Picked Up' : 'Pickup Failed',
      driver: pr.driverName ?? pr.carrierName ?? '', helper: '', hub: pr.destinationCode ?? '', tripId: pr.tripId ?? '',
      packages, reason: picked ? '' : pr.notPickedReasons[o.id] ?? pr.failureReason ?? '',
    })
  }
  return out
}

/* ------------------------------------------------------------ events ----- */

export interface EventView { name: string; at: string; user: string; detail?: string }
export interface EventGroup { state: string; at: string; events: EventView[] }

const SYSTEM = 'Delivery Management System'
const plus = (iso: string, seconds: number): string => {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  d.setSeconds(d.getSeconds() + seconds)
  return d.toISOString()
}

const hasGeo = (p: Party) => !!(p.latitude && p.longitude)

/**
 * The event log, grouped by the state the events belong to — staging's Ops
 * view. Everything is read off the record's own timestamps: creation, the
 * pickup request's status history, the trip that carries the parcel, and the
 * notes typed on the page.
 */
export function eventsOf(
  o: GrowOrder,
  plan: Pick<PlanningDb, 'trips' | 'notes' | 'closures'>,
  db: Pick<GrowOrdersDb, 'pickupRequests'>,
): EventGroup[] {
  const groups: EventGroup[] = []

  const created: EventView[] = [
    { name: 'Created', at: o.createdAt, user: SYSTEM },
    { name: 'Shipment Details Updated', at: plus(o.createdAt, 1), user: SYSTEM, detail: `Tracking Number: ${o.trackingNumber || o.orderNumber}` },
    { name: 'Leg Details Updated', at: plus(o.createdAt, 1), user: SYSTEM },
    { name: 'Geocode Requested', at: plus(o.createdAt, 2), user: SYSTEM },
  ]
  if (hasGeo(o.receiver)) created.push({ name: 'Geo Coordinate Updated', at: plus(o.createdAt, 3), user: SYSTEM })
  if (o.paymentStatus === 'Paid' && !o.isDraft) created.push({ name: 'Label Generated', at: plus(o.createdAt, 4), user: SYSTEM })
  if (o.error) created.push({ name: 'Data Validation Failed', at: plus(o.createdAt, 2), user: SYSTEM, detail: o.error })
  groups.push({ state: 'Created', at: o.createdAt, events: created })

  for (const pr of db.pickupRequests.filter((x) => x.orderIds.includes(o.id) || x.pickedOrderIds.includes(o.id))) {
    const events: EventView[] = pr.statusHistory.map((h) => ({
      name: `Pickup ${h.status}`, at: h.at, user: pr.driverName ?? pr.carrierName ?? SYSTEM,
      detail: [pr.number, h.note].filter(Boolean).join(' · '),
    }))
    if (events.length) groups.push({ state: `Pickup · ${pr.number}`, at: events[events.length - 1].at, events })
  }

  if (o.status === 'In Transit' || o.status === 'Out for Delivery' || o.status === 'Delivered' || o.status === 'Undelivered') {
    const at = plus(o.createdAt, 3600)
    groups.push({ state: 'At Facility', at, events: [
      { name: 'In Scanned', at, user: SYSTEM, detail: `Facility: ${o.inboundHubCode}` },
      { name: 'Current Facility Updated', at: plus(at, 1), user: SYSTEM },
    ] })
  }

  const trip = deliveryTripOf(o, plan.trips)
  const stop = trip?.stops.find((x) => x.kind === 'delivery' && x.orderId === o.id)
  if (trip && stop) {
    const events: EventView[] = [
      { name: 'Driver Assigned For Delivery', at: trip.createdAt, user: trip.driverName ?? SYSTEM, detail: `Trip ${trip.id}` },
    ]
    if (trip.status !== 'Un-assigned' && trip.status !== 'Yet to start') events.push({ name: 'Out For Delivery', at: stop.plannedAt, user: trip.driverName ?? SYSTEM })
    groups.push({ state: 'Driver Out', at: events[events.length - 1].at, events })
    if (stop.status === 'Done' || stop.status === 'Failed') {
      const done = stop.status === 'Done'
      groups.push({ state: done ? 'Delivered' : 'Undelivered', at: stop.plannedAt, events: [
        { name: done ? 'Delivered' : 'Delivery Failed', at: stop.plannedAt, user: trip.driverName ?? SYSTEM, detail: plan.closures[o.id]?.failureReason },
      ] })
    }
  } else if (o.status === 'Out for Delivery' || o.status === 'Delivered' || o.status === 'Undelivered') {
    const at = plus(o.createdAt, 7200)
    groups.push({ state: 'Driver Out', at, events: [{ name: 'Out For Delivery', at, user: SYSTEM }] })
    if (o.status !== 'Out for Delivery') {
      const done = o.status === 'Delivered'
      groups.push({ state: done ? 'Delivered' : 'Undelivered', at: plus(at, 3600), events: [
        { name: done ? 'Delivered' : 'Delivery Failed', at: plus(at, 3600), user: SYSTEM, detail: plan.closures[o.id]?.failureReason },
      ] })
    }
  }

  if (o.status === 'Cancelled') {
    const at = plus(o.createdAt, 600)
    groups.push({ state: 'Cancelled', at, events: [{ name: 'Cancelled', at, user: 'Ops' }] })
  }

  const notes = plan.notes[o.id] ?? []
  if (notes.length) {
    groups.push({ state: 'Notes', at: notes[notes.length - 1].at, events: notes.map((n) => ({ name: 'Note Added', at: n.at, user: 'Ops', detail: n.text })) })
  }

  /* timestamps come in two shapes (local 'T' strings and ISO Z) — compare as instants */
  const t = (s: string) => new Date(s).getTime() || 0
  return groups.sort((a, b) => t(a.at) - t(b.at))
}
