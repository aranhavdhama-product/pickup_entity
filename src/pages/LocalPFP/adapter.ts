/**
 * Grow order → console consignment.
 *
 * A Grow *order* (the merchant portal's record, `src/growOrders`) and a console
 * *consignment* are the same parcel seen from two sides. This module is the one
 * place that translates, so the Pending For Planning replica reads ONE row shape
 * and nothing under `src/growOrders/` has to know the console exists.
 *
 * It extends `ConsignmentOrderRow` (`src/data/mockData.ts`) rather than inventing
 * a shape, so the same row can feed the Consignment Order page's view widgets.
 *
 * READ-ONLY on the Grow store: it imports `useGrowOrders`/`displayStatus`/hub
 * helpers and never writes. Console-only facts (secondary state, trips, schedule
 * overrides, exceptions, closures) live in `planningStore.ts`.
 */
import type { ConsignmentOrderRow, ConsignmentState, TimeWindow } from '../../data/mockData'
import type { GrowOrder, GrowOrdersDb, GrowPickupRequest, StoreLocation } from '../../growOrders/types'
import { displayStatus, isOpenPr, type DisplayStatus } from '../../growOrders/tabs'
import { hubName, inboundHubFor } from '../../growOrders/hubs'
import {
  PARTIALLY_PICKED, pickupPointAddress, pickupPointName, pickupSummary, prDisplayQty,
  prDisplayWeight, prOutcomeLabel, prOverdue, prReconciled, prSpan, prWindow,
} from '../GrowOrders/utils'

/* ------------------------------------------------------------------ flags --- */

/**
 * The staging "Categories" chips. Every one is derived from a REAL field on the
 * order, never from a hash of its id — a chip that filters nothing is a filter
 * dressed up as a feature.
 */
export const CATEGORY_FLAGS = ['VIP', 'Stackable', 'Hazmat', 'Fragile', 'Heavy Weight'] as const
export type CategoryFlag = (typeof CATEGORY_FLAGS)[number]

/** Above this a parcel is flagged Heavy Weight, as the console's own threshold. */
const HEAVY_KG = 25
/** Declared value above which the parcel is handled as Fragile / high-value. */
const FRAGILE_VALUE = 5000

function flagsOf(o: GrowOrder): CategoryFlag[] {
  const out: CategoryFlag[] = []
  const total = totalWeightKg(o)
  if (o.codAmount > 0) out.push('VIP')
  if (o.pkg.kind === 'Parcel') out.push('Stackable')
  if ((o.additionalServices ?? []).some((s) => /hazmat|dangerous|chemical/i.test(s))) out.push('Hazmat')
  if (o.pkg.declaredValue >= FRAGILE_VALUE) out.push('Fragile')
  if (total >= HEAVY_KG) out.push('Heavy Weight')
  return out
}

/* ------------------------------------------------------------- geometry ----- */

export const totalWeightKg = (o: GrowOrder): number =>
  Math.round(o.pkg.weightKg * Math.max(1, o.pkg.count) * 10) / 10

/** cm³ for the whole consignment. */
const volumeCm3 = (o: GrowOrder): number =>
  o.pkg.lengthCm * o.pkg.widthCm * o.pkg.heightCm * Math.max(1, o.pkg.count)

/**
 * mm³ — ONE unit across the listing, the stat strip and the CSV.
 *
 * Grow stores centimetres and the console's column is mm³, so the conversion is
 * ×1000 (1 cm³ = 1000 mm³). The previous expression, `round(cm³ * 1000) / 1000`,
 * only rounded to three decimals: it returned CENTIMETRES under a mm³ label.
 * Fixing the label instead of the number would have been the other honest
 * choice; the number is fixed here because the column header is the console's.
 */
export const volumeMm3 = (o: GrowOrder): number => Math.round(volumeCm3(o) * 1000)

/** A standard pallet footprint holds ~1.2 m³; every consignment occupies ≥ 1. */
export const palletSpacesOf = (o: GrowOrder): number =>
  Math.max(1, Math.ceil(volumeCm3(o) / 1_000_000 / 1.2))

/* ---------------------------------------------------------------- state ----- */

/**
 * FarEye's OWN state vocabulary (staging's State / Secondary State list, captured
 * 2026-09-23) is the only one the console and the merchant portal show — owner
 * rule. Pickup progress is a SECONDARY state while the parcel is still with the
 * merchant, becomes the STATE once it is collected (`Pickedup` / `Partially
 * Pickedup`) and hands over to `At Facility` at the hub in-scan. Nothing here is
 * invented: every value below is in staging's 41-option list.
 */
export const FAREYE_STATES = [
  'Created', 'Ready To Ship', 'Pickedup', 'Partially Pickedup', 'At Facility', 'Intransit',
  'Driver Out', 'Delivered', 'Undelivered', 'Cancelled',
] as const
export const FAREYE_PICKUP_SECONDARY = [
  'Label Generated', 'Scheduled', 'Planned', 'Driver Assigned For Pickup', 'Out For Pickup',
  'At Pickup Location', 'Pickup Failed',
] as const
/** A pickup request may be scheduled ONLY from these states … */
export const SCHEDULE_PICKUP_STATES = ['Created', 'Ready To Ship'] as const
/** … and never while one of these pickup secondary states is on the row. */
export const SCHEDULE_PICKUP_BLOCKING_SECONDARY = [
  'Scheduled', 'Planned', 'Driver Assigned For Pickup', 'Out For Pickup', 'At Pickup Location',
] as const

const PR_SECONDARY: Record<string, string> = {
  Requested: 'Scheduled',
  Planned: 'Planned',
  'Ready For Last Mile Dispatch': 'Planned',
  Assigned: 'Driver Assigned For Pickup',
  'Out For Pickup': 'Out For Pickup',
}

/** State + pickup-derived secondary state of an order, in FarEye's words. */
export function fareyeStatesOf(
  o: GrowOrder,
  prs: Pick<GrowPickupRequest, 'id' | 'status' | 'orderIds' | 'pickedOrderIds'>[] = [],
): { state: string; secondary: string } {
  const ds = displayStatus(o)
  if (ds === 'Draft') return { state: 'Created', secondary: '' }
  if (ds === 'Cancelled') return { state: 'Cancelled', secondary: '' }
  if (ds === 'Delivered') return { state: 'Delivered', secondary: '' }
  if (ds === 'Undelivered') return { state: 'Undelivered', secondary: '' }
  if (ds === 'Out for Delivery') return { state: 'Driver Out', secondary: 'Out For Delivery' }
  if (ds === 'In Transit') return { state: 'At Facility', secondary: '' }
  if (ds === 'Picked Up') {
    const pr = prs.find((p) => p.id === o.pickedInRequestId) ?? prs.find((p) => p.id === o.pickupRequestId)
    const partial = pr ? pr.orderIds.some((id) => !pr.pickedOrderIds.includes(id)) : false
    return { state: partial ? 'Partially Pickedup' : 'Pickedup', secondary: '' }
  }
  /* still with the merchant: Ready for Pickup / Pickup Scheduled */
  const booked = prs.find((p) => p.id === o.pickupRequestId)
  if (booked && isOpenPr(booked.status)) {
    return { state: 'Ready To Ship', secondary: PR_SECONDARY[booked.status] ?? 'Scheduled' }
  }
  /* released by a failed attempt and not rebooked: FarEye shows the failure */
  const failed = prs.find((p) => p.status === 'Pickup Failed' && p.orderIds.includes(o.id))
  if (!o.pickupRequestId && failed) return { state: 'Ready To Ship', secondary: 'Pickup Failed' }
  return { state: 'Ready To Ship', secondary: 'Label Generated' }
}

/** May a pickup be scheduled for this row? The FarEye-state rule, used by every
 *  Schedule Pickup entry point (console and merchant portal). */
export function canSchedulePickup(o: GrowOrder, prs: Parameters<typeof fareyeStatesOf>[1] = []): boolean {
  if (o.isDraft || o.paymentStatus === 'Unpaid' || !!o.error) return false
  const { state, secondary } = fareyeStatesOf(o, prs)
  return (SCHEDULE_PICKUP_STATES as readonly string[]).includes(state)
    && !(SCHEDULE_PICKUP_BLOCKING_SECONDARY as readonly string[]).includes(secondary)
    && !o.pickupRequestId
}

/** Console state of an order (no pickup context) — kept for the many callers. */
export const consignmentStateOf = (o: GrowOrder): string => fareyeStatesOf(o).state

/** Soft-tint tone for a state pill — never full saturation in a row. */
export function stateTone(state: string): 'success' | 'info' | 'warning' | 'danger' | 'neutral' {
  if (state === 'Delivered') return 'success'
  if (state === 'Undelivered' || state === 'Cancelled') return 'danger'
  if (state === 'Created') return 'neutral'
  if (state === 'Driver Out' || state === 'Partially Pickedup') return 'warning'
  return 'info'
}

/* ------------------------------------------------------------ task type ---- */

/**
 * What a consignment asks the network to DO, which is a richer question than
 * forward-or-reverse:
 *
 *   Forward Delivery   — drop it at the consignee. Nothing is collected first.
 *   Pickup & Delivery  — collect from the merchant, THEN deliver. Two legs on
 *                        one consignment, which is what a first-mile booking
 *                        plus a last-mile drop really is.
 *   Reverse Pickup     — collect from the customer and take it back.
 *   Reverse            — a return with no collection booked yet.
 *
 * Derived from `pickupRequestId`, the field that actually records whether a
 * collection leg exists — not from a flag, because Grow has none. Consistent
 * with how the platform decides leg topology (it reads shipFrom, not a boolean).
 */
export const TASK_TYPES = ['Forward Delivery', 'Pickup & Delivery', 'Reverse Pickup', 'Reverse'] as const
export type TaskType = (typeof TASK_TYPES)[number]

/**
 * The LEG CHAIN — first mile, mid mile, last mile — applying the platform's own
 * topology matrix (FAREYE-APIS.md, the 12-row table) to local data:
 *
 *   rule 1  LM is always present; there is no zero-LM configuration.
 *   rule 2  MM appears iff the origin facility differs from the destination.
 *   rule 3  FM appears iff the non-hub party carries a MERCHANT code — here,
 *           iff a collection from the merchant is actually booked.
 *
 * The origin hub is derived by running the store's own address through the same
 * `inboundHubFor` the receiver uses, so "did this parcel change hub" is answered
 * from real geography rather than assumed.
 */
export const LEGS = ['FM', 'MM', 'LM'] as const
export type Leg = (typeof LEGS)[number]

export function legsOf(o: GrowOrder, stores: StoreLocation[]): Leg[] {
  const legs: Leg[] = []
  if (o.pickupRequestId) legs.push('FM')
  const store = stores.find((s) => s.code === o.storeCode)
  const originHub = store ? inboundHubFor(store.party) : ''
  if (originHub && originHub !== o.inboundHubCode) legs.push('MM')
  legs.push('LM')
  return legs
}

/** 'FM-MM-LM' — the compact form the Type column shows. */
export const legChainOf = (o: GrowOrder, stores: StoreLocation[]): string =>
  legsOf(o, stores).join('-')

/**
 * How a pickup is carried: a dedicated vehicle is FTL, a handover of boxes is
 * LTL (less than truckload). `blind` is orthogonal — a booking made before the
 * orders existed can be either — so it is reported alongside, not instead.
 */
export function pickupLoadOf(p: GrowPickupRequest): string {
  const load = p.shipmentType === 'FTL' ? 'FTL' : 'LTL'
  return p.blind ? `${load} · Reserved` : load
}

export function taskTypeOf(o: GrowOrder): TaskType {
  /* a booked collection is the one hard signal that a pickup leg exists */
  const collected = !!o.pickupRequestId
  if (o.orderType === 'Reverse Order') return collected ? 'Reverse Pickup' : 'Reverse'
  return collected ? 'Pickup & Delivery' : 'Forward Delivery'
}

/* ----------------------------------------------------------- the row shape -- */

export interface LocalConsignmentRow extends ConsignmentOrderRow {
  /** The flat model's discriminator — always 'Consignment' on this shape. */
  rowType: 'Consignment'
  /** The Grow order id — the key every mutation is addressed by. */
  orderId: string
  merchant: string
  /** Console secondary state, from the planning side-car ('' when none). */
  secondaryState: string
  orderTypeLabel: 'Forward' | 'Reverse'
  /**
   * The consignment's TASK COMPOSITION — which legs it actually carries, not
   * just which direction it runs. This is what the Type column shows.
   */
  taskType: TaskType
  /** 'FM-MM-LM' — which legs this consignment actually generates */
  legChain: string
  shipByDate: string
  dispatchDate: string
  volumeMm3: number
  pieces: number
  skuCount: number
  serviceTimeMin: number
  tag: string
  specialInstructions: string
  ageingDays: number
  address: string
  flags: CategoryFlag[]
  /** Non-empty when the order carries a validation error or a raised exception. */
  exception: string
  /** The booking this parcel was collected under ('—' when none). */
  pickupRequestNumber: string
  /**
   * Where it was ACTUALLY handed over, when that is not where it was booked.
   * This is the fact a parent/child tree cannot express — see the workbook's
   * Row-type model sheet: `pr.pickedOrderIds` may contain ids that are not in
   * `pr.orderIds`, so an order can have two parents. Flat rows show both.
   */
  pickedInNumber: string
  /** Everything the view page needs that the console row shape has no slot for. */
  order: GrowOrder
}

const p2 = (n: number) => String(n).padStart(2, '0')
const isoDay = (d: Date) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`
const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00`)
  d.setDate(d.getDate() + n)
  return isoDay(d)
}

export const daysSince = (iso: string): number => {
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return 0
  return Math.max(0, Math.floor((Date.now() - t) / 86_400_000))
}

const addressOf = (o: GrowOrder): string =>
  [o.receiver.line1, o.receiver.line2, o.receiver.landmark, o.receiver.city, o.receiver.postalCode, o.receiver.state, o.receiver.country]
    .filter(Boolean).join(', ')

/** The window a consignment is collected in — the booking's, else the order's date. */
function pickupWindowOf(o: GrowOrder, pr: GrowPickupRequest | undefined): TimeWindow | null {
  if (pr?.startAt && pr?.endAt) return { start: pr.startAt, end: pr.endAt }
  if (o.pickupDate) return { start: `${o.pickupDate}T09:00`, end: `${o.pickupDate}T18:00` }
  return null
}

/** Console-side per-order overrides the adapter folds in (from planningStore). */
export interface RowOverlay {
  secondaryState?: string
  schedule?: { startAt: string; endAt: string; reason: string }
  exception?: { type: string; at: string }
}

export function toConsignmentRow(
  o: GrowOrder,
  db: Pick<GrowOrdersDb, 'stores' | 'pickupRequests'>,
  overlay: RowOverlay = {},
): LocalConsignmentRow {
  const store = db.stores.find((s) => s.code === o.storeCode)
  const pr = db.pickupRequests.find((p) => p.id === o.pickupRequestId)
  const pickup = pickupWindowOf(o, pr)
  const shipBy = pickup ? pickup.start.slice(0, 10) : isoDay(new Date(o.createdAt))
  const delivery: TimeWindow | null = overlay.schedule
    ? { start: overlay.schedule.startAt, end: overlay.schedule.endAt }
    : pickup
      ? { start: `${addDays(pickup.start.slice(0, 10), 1)}T${pickup.start.slice(11) || '09:00'}`,
        end: `${addDays(pickup.end.slice(0, 10), 1)}T${pickup.end.slice(11) || '18:00'}` }
      : null
  const pieces = Math.max(1, o.pkg.count)

  return {
    rowType: 'Consignment',
    id: o.id,
    orderId: o.id,
    /* all three number columns carry the order number, exactly as the console's
       own Pending For Planning does for orders it did not renumber */
    consignmentNumber: o.orderNumber,
    referenceNumber: o.orderNumber,
    orderNumber: o.orderNumber,
    state: fareyeStatesOf(o, db.pickupRequests).state as ConsignmentState,
    /* the pickup leg's secondary state wins while the parcel is with the merchant;
       the planning overlay (Scheduled / Staged / Planned for routing) applies after */
    secondaryState: fareyeStatesOf(o, db.pickupRequests).secondary || overlay.secondaryState || '',
    weightKg: totalWeightKg(o),
    volume: `${volumeMm3(o).toLocaleString()} mm³`,
    volumeMm3: volumeMm3(o),
    palletSpaces: palletSpacesOf(o),
    origin: store ? `${store.name} (${store.code})` : o.storeCode,
    destination: hubName(o.inboundHubCode, db.stores),
    carrier: o.carrier || 'No Carrier',
    serviceType: o.serviceType || 'Standard',
    shipToName: o.receiver.name,
    shipToCode: o.inboundHubCode,
    shipToPincode: o.receiver.postalCode,
    shipToCity: o.receiver.city,
    shipToCounty: o.receiver.state,
    shipFromCode: o.storeCode,
    pickupWindow: pickup,
    deliveryWindow: delivery,
    shipments: Array.from({ length: pieces }, (_, i) => ({
      id: `${o.orderNumber}-P${i + 1}`,
      trackingNumber: o.trackingNumber || `${o.orderNumber}-P${i + 1}`,
      outcome: null,
    })),
    attachments: [],
    merchant: store?.party.businessName || o.sender.businessName || o.storeCode,
    orderTypeLabel: o.orderType === 'Reverse Order' ? 'Reverse' : 'Forward',
    taskType: taskTypeOf(o),
    legChain: legChainOf(o, db.stores),
    shipByDate: shipBy,
    dispatchDate: pickup ? pickup.start : '',
    pieces,
    skuCount: pieces,
    /* the demo has no SKU service times — the platform default is 5 minutes */
    serviceTimeMin: 5,
    tag: (o.additionalServices ?? []).join(', '),
    specialInstructions: o.remarks || '',
    ageingDays: daysSince(o.createdAt),
    address: addressOf(o),
    flags: flagsOf(o),
    /* a raised exception wins; then the order's own validation error; then the
       one exception the data itself proves — no postcode means the console
       could not geo-locate the stop */
    exception: overlay.exception?.type || o.error
      || (o.receiver.postalCode.trim() ? '' : 'Geo Lookup Not Found'),
    pickupRequestNumber: pr?.number ?? '',
    pickedInNumber: o.pickedInRequestId
      ? (db.pickupRequests.find((p) => p.id === o.pickedInRequestId)?.number ?? '')
      : '',
    order: o,
  }
}

/* ------------------------------------------------- pickup requests as rows -- */

/**
 * A pickup request rendered as a peer row in the same flat list.
 *
 * It deliberately does NOT extend `ConsignmentOrderRow`: a pickup has no
 * `ConsignmentState`, no shipments and no attachments, and forcing it into that
 * shape would mean inventing three values that do not exist. The two shapes meet
 * as a discriminated union (`UnifiedRow`) keyed on `rowType`.
 *
 * Every derived value comes from `GrowOrders/utils` — the same helpers the Grow
 * pickup table already uses — so the two lists can never disagree about what a
 * booking weighs. `PickupRequestTable` itself is not reused: it renders in the
 * Grow token system, and this page is nueva.
 */
export interface LocalPickupRow {
  rowType: 'Pickup Request' | 'Reserved Pickup' | 'FTL Pickup'
  id: string
  /** the request id — the key a mutation is addressed by */
  prId: string
  /** PR-000123, the identity cell's first line */
  reference: string
  state: string
  secondaryState: string
  /** overage scans: physical parcels with no record behind them */
  overageCount: number
  overdue: boolean
  merchant: string
  createdAt: string
  ageingDays: number
  /** the collection window — a pickup row's Window cell */
  pickupWindow: TimeWindow
  windowLabel: string
  sameDayWindow: boolean
  shipFromName: string
  shipFromAddress: string
  /** the inbound hub for a parcel booking, the consignee for FTL */
  shipToName: string
  shipToAddress: string
  shipToIsHub: boolean
  weightKg: number
  weightKnown: boolean
  /** the number is the merchant's ESTIMATE, not a sum over real orders */
  weightApprox: boolean
  qty: number
  qtyKnown: boolean
  qtyApprox: boolean
  /** 'order' for a parcel booking, 'unit' for FTL — expectedPieces means both */
  qtyUnit: 'order' | 'unit'
  orderCount: number
  pickedVsBooked: string
  vehicleType: string
  vehicleUnit: number | null
  sizeClass: string
  instructions: string
  exception: string
  tags: string[]
  /** the request, for anything a cell renderer still needs */
  request: GrowPickupRequest
}

/** Consignments and pickup requests are peer rows; `rowType` tells them apart. */
export type UnifiedRow = LocalConsignmentRow | LocalPickupRow

export const isPickupRow = (r: UnifiedRow): r is LocalPickupRow => r.rowType !== 'Consignment'

/**
 * Grow's pickup chip tones are the Grow palette ('error'); the nueva StatusPill
 * speaks 'danger'. One map, here, rather than a cast at every call site.
 */
export function pickupStateTone(p: GrowPickupRequest): 'success' | 'info' | 'warning' | 'danger' | 'neutral' {
  if (prOutcomeLabel(p) === PARTIALLY_PICKED) return 'warning'
  if (p.status === 'Pickup Failed') return 'danger'
  if (p.status === 'Cancelled') return 'neutral'
  if (p.status === 'Completed') return 'success'
  if (p.status === 'Requested') return 'neutral'
  return 'info'
}

/** Which of the three pickup sub-types this booking is (workbook, Row-type model §A). */
export function pickupRowType(p: GrowPickupRequest): LocalPickupRow['rowType'] {
  if (p.shipmentType === 'FTL') return 'FTL Pickup'
  if (p.blind) return 'Reserved Pickup'
  return 'Pickup Request'
}

export function toPickupRow(
  p: GrowPickupRequest,
  db: Pick<GrowOrdersDb, 'orders' | 'stores'>,
): LocalPickupRow {
  const byId = new Map(db.orders.map((o) => [o.id, o]))
  const type = pickupRowType(p)
  const ftl = type === 'FTL Pickup'
  const weight = prDisplayWeight(p, byId)
  const qty = prDisplayQty(p, byId)
  const summary = pickupSummary(p)
  const span = prSpan(p)
  const outcome = prOutcomeLabel(p)
  const overdue = prOverdue(p)

  /* Ship To: a parcel booking drops at an INBOUND HUB; FTL carries a real
     consignee that may not be known yet; a reserved slot may know neither. */
  const hub = !ftl && p.destinationCode ? hubName(p.destinationCode, db.stores) : ''
  const shipToName = ftl ? (p.shipTo?.name || 'To be confirmed') : (hub || 'To be confirmed')
  const shipToAddress = ftl && p.shipTo
    ? [p.shipTo.line1, p.shipTo.city, p.shipTo.postalCode].filter(Boolean).join(', ')
    : ''

  const tags: string[] = []
  if (p.blind) tags.push('Reserved')
  if (ftl) tags.push('FTL')
  if (overdue) tags.push('Overdue')

  return {
    rowType: type,
    id: p.id,
    prId: p.id,
    reference: p.number,
    state: outcome,
    /* the raw status is worth showing only when the outcome renamed it */
    secondaryState: outcome === p.status ? '' : p.status,
    overageCount: p.overages.length,
    overdue,
    merchant: db.stores.find((s) => s.code === p.storeCode)?.party.businessName || p.storeCode,
    createdAt: p.createdAt,
    ageingDays: daysSince(p.createdAt),
    pickupWindow: { start: p.startAt, end: p.endAt },
    windowLabel: prWindow(p),
    sameDayWindow: span.sameDay,
    shipFromName: pickupPointName(p, db.stores),
    shipFromAddress: pickupPointAddress(p, db.stores),
    shipToName,
    shipToAddress,
    shipToIsHub: !ftl && !!hub,
    weightKg: Math.round(weight.value * 10) / 10,
    weightKnown: weight.known,
    weightApprox: weight.approx,
    qty: qty.value,
    qtyKnown: qty.known,
    qtyApprox: qty.approx,
    qtyUnit: ftl ? 'unit' : 'order',
    orderCount: p.orderIds.length,
    /* the number behind 'Partially picked' — blank until the handover happened */
    pickedVsBooked: prReconciled(p) ? `${summary.picked} of ${summary.booked}` : '',
    vehicleType: p.vehicleType ?? '',
    vehicleUnit: p.vehicleUnit,
    sizeClass: p.sizeClass ?? '',
    instructions: p.instructions ?? '',
    /* the console's exception vocabulary, extended with the two pickup-side
       values the workbook's New filters sheet adds */
    exception: p.status === 'Pickup Failed' ? 'Pickup Failed' : p.overages.length > 0 ? 'Overage' : '',
    tags,
    request: p,
  }
}

/**
 * Which pickup requests belong in the planning queue: an OPEN booking (not yet
 * Completed, Cancelled or Failed) that is not on a trip yet. A request with a
 * `tripId` has been routed — it is Planned (or Assigned, once the trip has a
 * driver) — so it leaves this queue, exactly as a routed consignment does.
 * Taken off its trip again (trip cancelled, stop removed) it drops back to
 * Requested with no tripId and reappears here.
 */
/* A pickup leaves the planning queue once it is on a trip OR handed to a 3PL carrier —
   a carrier-run collection is never routed on our fleet. */
export const isPendingPickup = (p: GrowPickupRequest): boolean =>
  isOpenPr(p.status) && !p.tripId && p.carrierMode !== 'CARRIER'

/* ------------------------------------------------------------ the queue ----- */

/** The merchant statuses that are waiting to be planned — paid, collected or
 *  about to be, and not yet on a route. */
const QUEUE_STATUSES: DisplayStatus[] = ['Ready for Pickup', 'Pickup Scheduled', 'Picked Up']

/**
 * Is this order in the Pending For Planning queue?
 * Paid, not a draft, in one of the pre-route statuses and not already planned,
 * staged, cancelled or closed by the console — planned rows leave the queue,
 * exactly as they do on staging.
 */
export function isPendingForPlanning(o: GrowOrder, left: ReadonlySet<string>): boolean {
  if (o.isDraft || o.paymentStatus !== 'Paid') return false
  if (left.has(o.id)) return false
  return QUEUE_STATUSES.includes(displayStatus(o))
}

/* ------------------------------------------------------------------ csv ----- */

export const CSV_COLUMNS: { label: string; value: (r: LocalConsignmentRow) => string | number }[] = [
  { label: 'Order Number', value: (r) => r.orderNumber },
  { label: 'Reference Number', value: (r) => r.referenceNumber },
  { label: 'Ship By Date', value: (r) => r.shipByDate },
  { label: 'State', value: (r) => r.state },
  { label: 'Carrier', value: (r) => r.carrier },
  { label: 'Secondary State', value: (r) => r.secondaryState },
  { label: 'Dispatch Date', value: (r) => r.dispatchDate },
  { label: 'Weight', value: (r) => r.weightKg },
  { label: 'Volume', value: (r) => r.volumeMm3 },
  { label: 'Pallet Spaces', value: (r) => r.palletSpaces ?? 1 },
  { label: 'SKU', value: (r) => r.skuCount },
  { label: 'Service Time (min)', value: (r) => r.serviceTimeMin },
  { label: 'Tag', value: (r) => r.tag },
  { label: 'Special Instructions', value: (r) => r.specialInstructions },
  { label: 'Merchant', value: (r) => r.merchant },
  { label: 'Type', value: (r) => r.taskType },
  { label: 'Ageing (days)', value: (r) => r.ageingDays },
  { label: 'Address', value: (r) => r.address },
]

const cell = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`

export function csvOf(rows: LocalConsignmentRow[]): string {
  return [
    CSV_COLUMNS.map((c) => cell(c.label)).join(','),
    ...rows.map((r) => CSV_COLUMNS.map((c) => cell(c.value(r))).join(',')),
  ].join('\n')
}

export function downloadCsv(filename: string, body: string) {
  const url = URL.createObjectURL(new Blob([body], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
