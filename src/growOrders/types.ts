/**
 * Grow merchant portal — order model for the local demo store.
 * Mirrors the fields the real Add Order flow collects (receiver, sender/store,
 * package, payment) and what the Orders grid shows.
 */
import type { ConsignmentFields, FtlVehicle, OrderDraft, ParcelItem } from './draft'

export type OrderType = 'Forward Order' | 'Reverse Order'
export type PackageKind = 'Parcel' | 'Document' | 'FTL'
export type ShipmentType = 'Parcel' | 'FTL'
export type PaymentMode = 'Prepaid' | 'COD'
/** Has the merchant paid for the shipment yet? Unpaid orders live on the Drafts tab. */
export type PaymentStatus = 'Unpaid' | 'Paid'
/**
 * The eight pickup-request states the Pickup Requests page shows. The first six
 * form the happy path (`PR_FLOW` in tabs.ts); the last two are terminal side
 * exits.
 *
 * `Requested` is the ENTRY state: the portal's own flow opened with a `Created`
 * step that said nothing a merchant could act on differently — a booking that
 * exists has been requested — so the two were merged. A persisted `'Created'`
 * is migrated to `'Requested'` by `normalizePr`.
 */
export type PickupRequestStatus =
  | 'Requested' | 'Planned' | 'Ready For Last Mile Dispatch'
  | 'Assigned' | 'Out For Pickup' | 'Completed' | 'Pickup Failed' | 'Cancelled'

/**
 * A barcode the driver scanned at the handover that matched NO order in the
 * system — the physical counterpart of a missing record. It stays on the
 * request until someone creates the order it belongs to (`orderId`).
 */
export interface PickupOverage {
  id: string
  barcode: string
  scannedAt: string            // ISO
  weightKg: number | null
  note: string
  /** Set once an order was created for this scan. */
  orderId: string | null
}

/** One entry in a pickup request's audit trail — rendered as the detail timeline. */
export interface PickupStatusEvent {
  status: PickupRequestStatus
  at: string                   // ISO
  note?: string
}
export type OrderStatus =
  | 'Order Created' | 'Pickup Scheduled' | 'Picked Up' | 'In Transit'
  | 'Out for Delivery' | 'Delivered' | 'Undelivered' | 'Cancelled'

export interface Party {
  name: string
  contactNumber: string
  email: string
  businessName: string
  country: string
  line1: string
  line2: string
  landmark: string
  postalCode: string
  state: string
  city: string
  /* Consignment-form address fields — all optional so every stored party loads. */
  /** address.code — the client location code */
  locationCode?: string
  /** dialling prefix, e.g. +63 */
  countryCode?: string
  line3?: string
  /** Suburb / County */
  county?: string
  latitude?: string
  longitude?: string
  floorNumber?: string
  liftAvailable?: boolean
  /** Pickup / Delivery / Service window, local 'YYYY-MM-DDTHH:mm' */
  windowStart?: string
  windowEnd?: string
}

export interface StoreLocation {
  code: string
  name: string
  party: Party
}

export interface PackageInfo {
  kind: PackageKind
  count: number
  weightKg: number
  lengthCm: number
  widthCm: number
  heightCm: number
  description: string
  declaredValue: number
  /**
   * Display-only echoes of what the stepper collected, all OPTIONAL so every
   * record written before them (and `normalize`'s spread over `DEFAULTS.pkg`)
   * still loads: the cargo classification (`kind` only distinguishes
   * Parcel/Document/FTL), the Package master preset the dimensions came from,
   * and the SKU-master contents behind `description`.
   */
  cargoType?: string
  packageType?: string
  items?: ParcelItem[]
}

export interface GrowOrder {
  id: string
  orderNumber: string
  orderType: OrderType
  createdAt: string            // ISO
  status: OrderStatus
  storeCode: string
  /** Inbound hub the parcel enters the network at — derived from the receiver
   *  (see growOrders/hubs.ts) and the second half of a pickup request's grouping key. */
  inboundHubCode: string
  sender: Party
  receiver: Party
  drops: Party[]               // additional delivery addresses (multi-drop)
  shipmentType: ShipmentType
  vehicleType: string          // FTL only — the FIRST vehicle's type (derived from `vehicles`)
  vehicleUnit?: number         // FTL only — how many vehicles (derived from `vehicles`)
  actualLoad?: number          // FTL only — total kg across the vehicles (derived)
  additionalServices?: string[] // FTL only
  /** FTL only — the booking, one entry per vehicle with the delivery addresses it
   *  serves. Optional: a pre-list record reads through `vehiclesOf()` in draft.ts.
   *  The FTL SERVICE TYPE (Inland FTL, Sea FCL, …) is the order's `serviceType`. */
  vehicles?: FtlVehicle[]
  pkg: PackageInfo
  paymentMode: PaymentMode
  codAmount: number
  currency: string
  carrier: string
  serviceType: string
  trackingNumber: string
  pickupDate: string           // YYYY-MM-DD or ''
  remarks: string
  /** Free-form shipper tags (e.g. 'Priority'); optional, so older records load unchanged. */
  tags?: string[]
  error: string                // non-empty = validation error (⚠ in grid)
  /* ---- payment / pickup lifecycle (one Orders page, status tabs) ---- */
  paymentStatus: PaymentStatus   // 'Unpaid' until checkout Proceed
  isDraft: boolean               // saved from the stepper, never checked out
  pickupRequestId: string | null // set once the order is in a pickup request
  /** The request the parcel was ACTUALLY collected under, when that is not the
   *  one it was booked into. Null = collected where it was booked (or not yet). */
  pickedInRequestId: string | null
  draft?: OrderDraft | null      // stepper state kept so a draft can be resumed
  /**
   * What the merchant was actually QUOTED and charged, frozen at checkout.
   *
   * Optional and null by default. A record with no charges — a seeded order, a
   * bulk upload, anything created outside the checkout flow — is priced by
   * DERIVING from the shared rate card instead, so nothing invents a number.
   * Once an order has been paid for, though, the amount must not move because a
   * rate card changed later: what was charged is a fact about that order.
   */
  charges?: OrderCharges | null
  /** What the Create Consignment form collected beyond the fields above. Optional. */
  consignment?: ConsignmentFields | null
}

export interface OrderCharges {
  shipping: number
  tax: number
  total: number
  /** the service the price was quoted against */
  service: string
}

/**
 * How big a PARCEL handover is, when the merchant books BEFORE the orders exist
 * and so cannot give real dimensions. A vehicle booking uses `vehicleType`.
 */
export const SIZE_CLASSES = ['Envelope', 'Small box', 'Medium box', 'Large box', 'Pallet'] as const
export type SizeClass = (typeof SIZE_CLASSES)[number]

/**
 * A merchant-raised pickup booking covering one or more paid orders — or, when
 * `blind` (shown as **Reserved**), a collection booked before any order exists:
 * the merchant declares roughly what will be handed over and attaches the
 * orders later.
 */
export interface GrowPickupRequest {
  id: string
  number: string               // PR-000123
  storeCode: string
  /** Where the collected parcels are dropped — the inbound hub code for a parcel
   *  booking; null for FTL (Ship To carries the destination) and for a reserved
   *  slot booked before anyone knows where the orders are going. */
  destinationCode: string | null
  /** The window, as two LOCAL date-times ('YYYY-MM-DDTHH:mm'); may cross midnight. */
  startAt: string
  endAt: string
  /** DERIVED from startAt/endAt on every write — kept because the lists, filters
   *  and labels were all written against them. */
  date: string                 // YYYY-MM-DD (the START date)
  slot: string                 // '09:00–13:00', or '18/09 21:00–19/09 02:00'
  orderIds: string[]
  /** RECONCILIATION — what the driver actually collected, filled in when the
   *  request completes. May contain ids that are NOT in `orderIds` (parcels
   *  booked under another request but handed over here); empty until then. */
  pickedOrderIds: string[]
  /** Scans the driver collected that matched no order in the system. */
  overages: PickupOverage[]
  status: PickupRequestStatus
  createdAt: string            // ISO
  /** Shared with the pickup driver. */
  instructions?: string
  statusHistory: PickupStatusEvent[]
  /* ---- reserved pickup ("blind"): booked before the orders exist ---- */
  blind: boolean
  /** Parcel = a handover of boxes; FTL = a dedicated vehicle. Always 'Parcel' for order-backed rows. */
  shipmentType: ShipmentType
  /** Parcel: how many orders will be handed over. FTL: estimated units/pallets. */
  expectedPieces: number | null
  expectedWeightKg: number | null
  /** Parcel only. */
  sizeClass: SizeClass | null
  /** FTL only — options: FTL_SERVICE_CODES in draft.ts; decides which vehicles can be picked. */
  ftlServiceType: string | null
  /** FTL only — options: vehiclesFor(ftlServiceType) in draft.ts. */
  vehicleType: string | null
  vehicleUnit: number | null
  /** A collection address that is NOT the store's own (null = the store party).
   *  Named for the platform contract's `shipFrom`, as the console uses it. */
  shipFrom: Party | null
  /** FTL only — where the vehicle delivers. Optional: a truck can be booked
   *  before the destination is known, so null means "to be confirmed". */
  shipTo: Party | null
  contactName: string
  contactNumber: string
  /** Internal — never shown to the driver (`instructions` is). */
  note: string
  /* ---- execution (console side: route, carrier, attempts) ---- */
  /** The LocalTrip (planningStore) this collection is a stop on; null = not routed. */
  tripId: string | null
  /** Denormalised from the trip so the list can show it without a second store. */
  driverName: string | null
  /** 3PL / carrier allocation — null while the pickup runs on our own fleet or is unallocated. */
  carrierCode: string | null
  carrierName: string | null
  carrierMode: CarrierMode | null
  /** The carrier's own booking reference once the request was SENT to it
   *  (`sendToCarrier`), e.g. `LBC-000125`; null until then. */
  carrierPickupRef: string | null
  /** 1-based; a re-attempt is a NEW request with attempt + 1. */
  attempt: number
  /** Snapshotted from the pickup module config at creation, so a later config
   *  change never re-opens (or closes) a request that already failed. */
  maxAttempts: number
  /** A `PICKUP_FAILURE_REASONS` code (pickupReasons.ts); null unless failed. */
  failureReason: string | null
  /** A `CANCEL_REASONS` code (or the free text an older caller passed); null unless cancelled. */
  cancelReason: string | null
  /** Set when ops overrode the driver's outcome by hand — the audit trail says why. */
  manualOverride: 'Picked Up' | 'Failed' | null
  /** The re-attempt chain. `parentPrId` = the failed request this one retries;
   *  `reattemptPrId` = the retry raised from this one. The second is what stops a
   *  failed request from being re-attempted twice and moves it to Closed. */
  parentPrId: string | null
  reattemptPrId: string | null
  /** orderId → the reason code the driver gave for NOT collecting it. */
  notPickedReasons: Record<string, string>
  /* ---- handover (driver scan → hub in-scan reconciliation) ---- */
  handover: PickupHandover
  source: PickupSource
}

export type CarrierMode = 'FLEET' | 'CARRIER'
export type PickupSource = 'Merchant' | 'Console' | 'API' | 'Auto'
export type HandoverMode = 'driver' | 'hub' | 'both'

/** One scan event behind the handover buckets — who scanned, when, and where.
 *  The buckets themselves (`driverScanned` / `hubScanned`) stay plain id lists;
 *  this log is what Inbound needs for "scanned today" and misroutes. */
export interface HandoverScan {
  orderId: string
  by: 'driver' | 'hub'
  at: string                   // ISO
  /** The hub that in-scanned it (hub scans only). */
  hubCode: string | null
  damaged: boolean
  /** A misrouted parcel sent on to `hubCode` — a forward, not an in-scan. */
  forwarded?: boolean
}

/**
 * A label the hub scanner read that matched NO consignment — the hub-side
 * twin of a driver's `PickupOverage`. Held until ops attaches it to an
 * existing order, creates one for it, or rejects it.
 */
export interface HubOverage {
  id: string
  code: string
  hubCode: string
  at: string                   // ISO
  damaged: boolean
  status: 'Held' | 'Attached' | 'Created' | 'Rejected'
  orderId: string | null
  note: string | null
}

export interface PickupHandover {
  /** Snapshot of the config's scan mode at creation — which scans must agree. */
  mode: HandoverMode
  /** orderIds the driver scanned at the collection. */
  driverScanned: string[]
  /** orderIds in-scanned at the hub. */
  hubScanned: string[]
  /** 3PL manifest / carrier pickup reference. */
  manifestRef: string | null
  /** Set when the buckets reconciled (or ops force-closed) — the request is Handed Over. */
  closedAt: string | null
  /** When the truck carrying the collection reached the hub (trip debrief, or
   *  the first hub scan). Until then the scans CANNOT agree yet — the request
   *  reads "In transit to hub", never Discrepancy. */
  arrivedAtHubAt: string | null
  /** Proof of pickup the driver captured at completion; null until then. */
  pod: PickupPod | null
  scanLog: HandoverScan[]
}

export interface PickupPod { signature: boolean; photo: boolean; otp: boolean; at: string }

export interface GrowOrdersDb {
  orders: GrowOrder[]
  stores: StoreLocation[]
  pickupRequests: GrowPickupRequest[]
  hubOverages: HubOverage[]
}

/**
 * What a request that predates first-mile execution reads as: never routed, no
 * carrier, first of three attempts, raised by the merchant. LITERALS, not the
 * pickup module config — a stored record's snapshot must not change because
 * someone edited the config later. Only the create actions read the config.
 */
export const PR_DEFAULTS = {
  tripId: null, driverName: null, carrierCode: null, carrierName: null, carrierMode: null, carrierPickupRef: null,
  attempt: 1, maxAttempts: 3, failureReason: null, cancelReason: null, manualOverride: null,
  parentPrId: null, reattemptPrId: null, source: 'Merchant',
} as const satisfies Partial<GrowPickupRequest>

export const blankHandover = (mode: HandoverMode = 'both'): PickupHandover => ({
  mode, driverScanned: [], hubScanned: [], manifestRef: null, closedAt: null, arrivedAtHubAt: null, pod: null, scanLog: [],
})

