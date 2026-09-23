/**
 * Pickup Request (first-mile) domain model — demo only, no backend.
 *
 * The whole feature is driven by a single in-memory `PickupDb` that is persisted
 * to localStorage (see store.ts). Nothing here talks to staging; the Pickup demo
 * is deliberately self-contained so it can be replayed/reset in front of a room.
 *
 * All unions are plain string unions (no `enum`) — tsconfig runs with
 * `erasableSyntaxOnly`, which bans TS enums.
 */

/* ---------------- Carrier ---------------- */

/**
 * Who performs the pickup/delivery. A PR, trip or consignment may carry one.
 * `mode` distinguishes an own/captive fleet from an external 3PL carrier.
 * All references are OPTIONAL on the domain objects, so seeded/legacy/
 * localStorage data without a carrier still type-checks (renders "Unassigned").
 */
export interface Carrier {
  code: string
  name: string
  driver: string
  vehicle: string
  mode: 'FLEET' | 'CARRIER'
}

/* ---------------- Pickup Request ---------------- */

export interface PickupSlot {
  /** ISO date, `YYYY-MM-DD` */
  date: string
  /** `HH:mm` */
  start: string
  /** `HH:mm` */
  end: string
}

export type PRStatus =
  | 'OPEN'
  | 'PLANNED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'COMPLETED_SHORT'
  | 'FAILED'
  | 'CANCELLED'

/** Append-only audit line on a PR — rendered as the detail page timeline. */
export interface PREvent {
  /** ISO timestamp */
  at: string
  label: string
  detail?: string
  actor?: string
}

export type PRSource = 'GROW' | 'CFT' | 'API' | 'AUTO'

export interface PickupRequest {
  /** `PR-0001` */
  id: string
  merchantCode: string
  merchantName: string
  locationCode: string
  locationName: string
  address: string
  contactName: string
  contactPhone: string
  /** null = "any time today" / unscheduled */
  slot: PickupSlot | null
  /** blind = raised with no linked consignments; soft data follows later */
  blind: boolean
  /** what the merchant declared; null when derived from linked consignments */
  expectedPieces: number | null
  /** merchant-declared total weight (kg) for a blind pickup; null when unknown/derived */
  expectedWeightKg?: number | null
  /** count-based execution: what the driver actually counted (see `confirmCount`) */
  confirmedPieces?: number
  /** scan-based (true) vs count-based (false) execution on the driver app */
  scannable: boolean
  /** SKU-level picking instead of piece scanning */
  skuMode?: boolean
  consignmentIds: string[]
  source: PRSource
  createdAt: string
  createdBy: string
  status: PRStatus
  attempt: number
  maxAttempts: number
  failureReason?: string
  /** set on a re-attempt PR, points at the FAILED original */
  parentPrId?: string
  /** set on the FAILED original, points at its re-attempt */
  reattemptPrId?: string
  tripId?: string
  /** who will perform the pickup (see `Carrier`); undefined ⇒ "Unassigned" */
  carrierCode?: string
  carrierName?: string
  events: PREvent[]
}

/* ---------------- Consignments & pieces ---------------- */

export interface Piece {
  trackingNumber: string
  scanned?: boolean
  /** added by the driver at the doorstep (not on the soft data) */
  addedInField?: boolean
  dims?: { l: number; b: number; h: number; uom: string }
  weightKg?: number
  hazmat?: boolean
  vip?: boolean
  customsClearance?: boolean
  hsnCode?: string
  /** CFT (customer facing team) verified the field-captured attributes */
  verified?: boolean
}

export type ConsignmentState =
  | 'CREATED'
  | 'PICKUP_PLANNED'
  | 'PICKED_UP'
  | 'AT_FACILITY'
  | 'OUT_FOR_DELIVERY'
  | 'DELIVERED'
  | 'RTO'

export interface DemoSku {
  code: string
  name: string
  qty: number
  picked?: number
  missing?: number
  damaged?: number
}

export interface DemoConsignment {
  /** `C1` */
  id: string
  /** `O1` — several consignments can share an order */
  orderId: string
  merchantCode?: string
  merchantName?: string
  /** non-null ⇒ this consignment needs a first-mile pickup from that location */
  pickupLocationCode?: string | null
  deliveryName: string
  deliveryAddress: string
  deliveryCity: string
  pieces: Piece[]
  state: ConsignmentState
  leg: 'FIRST_MILE' | 'LAST_MILE'
  /** the PR that will collect it; null ⇒ back in the pending pool */
  linkedPrId?: string | null
  /** the trip its delivery leg is planned on */
  tripId?: string | null
  weightKg: number
  scannable: boolean
  skus?: DemoSku[]
  /** field-added pieces / mismatches awaiting CFT verification */
  amberException?: boolean
  createdVia?: string
  /** carrier handling this consignment (see `Carrier`); undefined ⇒ "Unassigned" */
  carrierCode?: string
  carrierName?: string
}

/* ---------------- Overage ---------------- */

/** A stray scan: something handed over that the system did not expect. */
export interface Overage {
  id: string
  scannedTrackingNumber: string
  /** did it match `config.trackingRegex`? */
  validTracking: boolean
  scannedBy: string
  scannedAt: string
  prId?: string
  tripId?: string
  locationCode?: string
  state: 'CREATED' | 'AT_FACILITY'
  reconciled: boolean
  reconciledConsignmentId?: string
  kind: 'UNKNOWN_SCAN' | 'UNLABELED' | 'UNLABELED_GROUP'
  note?: string
  /** shared by rows captured as one bundle (`UNLABELED_GROUP`) */
  groupId?: string
}

/* ---------------- Trips ---------------- */

export interface TripStop {
  seq: number
  kind: 'PICKUP' | 'DELIVERY'
  prId?: string
  consignmentId?: string
  /** `HH:mm` */
  eta: string
  status: 'PENDING' | 'ARRIVED' | 'DONE' | 'FAILED'
}

export interface Trip {
  id: string
  routeName: string
  driver: string
  vehicle: string
  /** ISO date, `YYYY-MM-DD` */
  date: string
  status: 'PLANNED' | 'IN_PROGRESS' | 'COMPLETED'
  /** carrier assigned to run this trip (see `Carrier`); undefined ⇒ "Unassigned" */
  carrierCode?: string
  carrierName?: string
  stops: TripStop[]
  loads: {
    /** PR ids collected on this trip */
    firstLeg: string[]
    /** consignment ids delivered on this trip */
    lastLeg: string[]
  }
}

/* ---------------- Config ---------------- */

export interface AutoCreateRule {
  id: string
  /** merchant code or `ALL` */
  merchantCode: string | 'ALL'
  locationCode: string
  enabled: boolean
}

export interface PickupConfig {
  /** how many live PRs a merchant location may hold */
  multiPrPolicy: 'ONE_OPEN' | 'ONE_PER_SLOT' | 'UNLIMITED'
  slots: { start: string; end: string }[]
  /** validates a scanned tracking number; drives Overage.validTracking */
  trackingRegex: string
  autoCreateRules: AutoCreateRule[]
}

/* ---------------- Root ---------------- */

export interface PickupDb {
  pickupRequests: PickupRequest[]
  consignments: DemoConsignment[]
  overages: Overage[]
  trips: Trip[]
  config: PickupConfig
  seededAt: string
}
