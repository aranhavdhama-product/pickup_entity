/**
 * Unified field registry — the one description of every column the Pending For
 * Planning (local) listing can show, for BOTH row kinds.
 *
 * Source of truth: `Consignment-Pickup-Unified-Listing-Analysis.xlsx`
 * (sheets "Column mapping", "New columns", "Recommended default listing").
 * The 67 console columns are listed in the product owner's order; the columns a
 * mixed list needs and the console lacks follow, marked `isNew`.
 *
 * TWO FLAGS, TWO MEANINGS — do not collapse them:
 *  - `consoleDefault` mirrors the sheet's "Default?" column: the 20 of 67 the
 *    console shows out of the box. It is a BADGE on the config page, nothing more.
 *  - `defaultVisible` mirrors "Unified default view?": what OUR unified listing
 *    renders on a first load. Only 7 data columns are visible, summing with the
 *    52px checkbox to exactly 1126px — the content width of a 1440px viewport
 *    with the 260px nav expanded, so the grid never scrolls sideways.
 *
 * COMPOSITES — the sheet marks 11 console columns "Unified default view? = Yes"
 * but the default view has 7 data columns, because six of the eleven are SECOND
 * LINES of another cell ("The remaining 11 console columns are carried by the 8
 * default columns above"). A field that is absorbed declares `carriedBy`, so the
 * config page can say "carried by State" instead of offering a toggle that would
 * either do nothing or render the value twice. Only a composite OWNER has a
 * `width` and a `header`.
 */

/* ------------------------------------------------------------- row types --- */

/**
 * The discriminator the whole flat model rests on (sheet "Row-type model", §A).
 * Four values, not a boolean: three of the pickup-default rules (Ship To, Total
 * Quantity, Destination Facility Code) branch on Reserved vs FTL vs plain, and a
 * boolean would force those branches into the cell renderers where they cannot
 * be filtered on.
 */
export const ROW_TYPES = ['Consignment', 'Pickup Request', 'Reserved Pickup', 'FTL Pickup'] as const
export type RowType = (typeof ROW_TYPES)[number]

export const PICKUP_ROW_TYPES: RowType[] = ['Pickup Request', 'Reserved Pickup', 'FTL Pickup']
export const isPickupType = (t: RowType): boolean => t !== 'Consignment'

/** Short pill labels — the full value rides on the cell tooltip. */
export const ROW_TYPE_SHORT: Record<RowType, string> = {
  Consignment: 'Shipment',
  'Pickup Request': 'Pickup',
  'Reserved Pickup': 'Reserved',
  'FTL Pickup': 'FTL',
}

/* ---------------------------------------------------------------- fields --- */

export const FIELD_GROUPS = [
  'Identifiers', 'Status', 'Windows', 'Ship From', 'Ship To',
  'Package', 'Service', 'Pickup', 'Flags',
] as const
export type FieldGroup = (typeof FIELD_GROUPS)[number]

/**
 * CAPABILITY — which row kinds actually carry this datum. Declared by the
 * registry from the workbook's "Can share the column?" / source columns; it is
 * NOT a user preference. The config page lets a user NARROW within a capability
 * of 'both' (to consignment-only or pickup-only); it can never widen one.
 */
export type AppliesTo = 'consignment' | 'pickup' | 'both'

/** The seven composite columns the default view actually renders. */
export type CompositeKey =
  | 'rowType' | 'orderNumber' | 'state' | 'window' | 'shipFromName' | 'shipToName' | 'totalWeight'

export interface FieldDef {
  key: string
  /** The console's own name for the column — what the config page lists. */
  label: string
  /** The rendered table header, when it differs (composite owners only). */
  header?: string
  group: FieldGroup
  capability: AppliesTo
  /** sheet "Default?" — one of the console's 20 out-of-the-box columns */
  consoleDefault?: boolean
  /** cannot be hidden or narrowed */
  mandatory?: boolean
  /** sheet "Unified default view?" — rendered on a first load */
  defaultVisible: boolean
  defaultSequence: number
  /** composite OWNERS only; px. Omitted on the flexible column. */
  width?: number
  /** the column absorbs the remaining width at any viewport */
  flexible?: boolean
  /** this field is a second line / badge of another column, not a column itself */
  carriedBy?: CompositeKey
  align?: 'left' | 'right'
  /** what a consignment-only column shows on a pickup row. '—' when omitted. */
  pickupDefault?: string
  /** the unified list needs it; the console does not have it */
  isNew?: boolean
  /** short note surfaced as the config row's tooltip */
  note?: string
}

/* The order below is the product owner's console order (rows 1–20 are the
   console defaults), then the new columns. `defaultSequence` 1–7 is the
   rendered default view; everything else keeps a stable slot after it. */
let seq = 7

const f = (d: Omit<FieldDef, 'defaultSequence' | 'defaultVisible'> & {
  defaultVisible?: boolean; defaultSequence?: number
}): FieldDef => ({
  defaultVisible: false,
  defaultSequence: d.defaultSequence ?? ++seq,
  ...d,
})

export const FIELDS: FieldDef[] = [
  /* ---------- the seven rendered default columns (1126px with the checkbox) ---------- */
  f({
    key: 'rowType', label: 'Row Type', header: 'Row Type', group: 'Identifiers', capability: 'both',
    /* the sheet budgets 88px; 112 is what "Consignment" actually needs at 11px
       without truncating mid-word. Ship From is the flexible column, so it
       absorbs the 24px and the row still totals exactly 1126. */
    mandatory: true, defaultVisible: true, defaultSequence: 1, width: 112, isNew: true,
    note: 'The discriminator the flat model rests on — Consignment · Pickup · Reserved · FTL.',
  }),
  f({
    key: 'orderNumber', label: 'Order Number', header: 'Reference', group: 'Identifiers', capability: 'both',
    consoleDefault: true, defaultVisible: true, defaultSequence: 2, width: 150,
    note: 'One identity column, two number series: order number or PR number, as a link.',
  }),
  f({
    key: 'state', label: 'State', header: 'State', group: 'Status', capability: 'both',
    consoleDefault: true, defaultVisible: true, defaultSequence: 3, width: 168,
    note: 'Two vocabularies in one pill: displayStatus for a consignment, prOutcomeLabel for a pickup.',
  }),
  f({
    key: 'window', label: 'Window', header: 'Window', group: 'Windows', capability: 'both',
    defaultVisible: true, defaultSequence: 4, width: 172, isNew: true,
    note: 'Merged: the DELIVERY window on a consignment row, the PICKUP window on a pickup row. The caption says which.',
  }),
  f({
    key: 'shipFromName', label: 'Ship From Name', header: 'Ship From', group: 'Ship From', capability: 'both',
    defaultVisible: true, defaultSequence: 5, width: 184, flexible: true,
    note: 'The flexible column — absorbs the remainder at any viewport.',
  }),
  f({
    key: 'shipToName', label: 'Ship to Name', header: 'Ship To', group: 'Ship To', capability: 'both',
    consoleDefault: true, defaultVisible: true, defaultSequence: 6, width: 190,
    pickupDefault: 'To be confirmed',
    note: "A parcel pickup's destination is an INBOUND HUB, not a consumer.",
  }),
  f({
    key: 'totalWeight', label: 'Weight', header: 'Weight · Qty', group: 'Package', capability: 'both',
    consoleDefault: true, defaultVisible: true, defaultSequence: 7, width: 98, align: 'right',
    note: "A Reserved booking's weight is the merchant's estimate — rendered with a '~'.",
  }),

  /* ---------- absorbed into a composite (Unified default view? = Yes) ---------- */
  f({
    key: 'secondaryState', label: 'Secondary State', group: 'Status', capability: 'both',
    consoleDefault: true, carriedBy: 'state', pickupDefault: '—',
    note: "Muted second line under State. On staging this carried 'Ready For Last Mile Dispatch', which IS a pickup status.",
  }),
  f({
    key: 'shipToAddress', label: 'Ship To Address', group: 'Ship To', capability: 'both',
    consoleDefault: true, carriedBy: 'shipToName', pickupDefault: '—',
    note: 'Second line of Ship To. A parcel pickup drops at a hub, which has a name but no street address.',
  }),
  f({
    key: 'shipFromAddress', label: 'Ship From Address', group: 'Ship From', capability: 'both',
    carriedBy: 'shipFromName',
    note: 'Second line of Ship From. pr.shipFrom overrides the store address when the merchant typed one in.',
  }),
  f({
    key: 'totalQuantity', label: 'Total Quantity', group: 'Package', capability: 'both',
    carriedBy: 'totalWeight', pickupDefault: '—',
    note: 'Second line of Weight · Qty. The UNIT changes by shipment type: orders for a parcel booking, units/pallets for FTL.',
  }),
  f({
    key: 'pickupWindow', label: 'Pickup Window', group: 'Windows', capability: 'both',
    carriedBy: 'window',
    note: 'The one column where a pickup row is RICHER than a consignment row.',
  }),
  f({
    key: 'deliveryWindow', label: 'Delivery Window', group: 'Windows', capability: 'consignment',
    carriedBy: 'window', pickupDefault: '—',
  }),

  /* ---------- the remaining console columns — table settings, off by default ---------- */
  f({
    key: 'referenceNumber', label: 'Reference Number', group: 'Identifiers', capability: 'both',
    consoleDefault: true, pickupDefault: '—',
    note: 'Grow has no separate merchant reference — same value as Order Number today.',
  }),
  f({
    key: 'exceptionState', label: 'Exception State', group: 'Status', capability: 'both',
    consoleDefault: true, pickupDefault: '—',
    note: "Derived on both sides. 'Overage' is a NEW exception value the console does not have.",
  }),
  f({
    key: 'exceptionReason', label: 'Exception Reason', group: 'Status', capability: 'both',
    consoleDefault: true, pickupDefault: '—', note: 'Free text — a sentence. Never truncate it into the grid.',
  }),
  f({
    key: 'totalVolume', label: 'Volume', group: 'Package', capability: 'both',
    consoleDefault: true, align: 'right', pickupDefault: '—',
    note: 'mm³. A Reserved or FTL booking has no dimensions and never matches a volume band.',
  }),
  f({
    key: 'palletQuantity', label: 'Pallet Quantity', group: 'Package', capability: 'both',
    consoleDefault: true, align: 'right', pickupDefault: '—',
    note: "Staging calls it 'Pallet Spaces'. A pickup only has one when sizeClass is 'Pallet'.",
  }),
  f({
    key: 'sku', label: 'SKU', group: 'Package', capability: 'consignment',
    consoleDefault: true, align: 'right', pickupDefault: '—',
    note: "The console's SKU column is a COUNT, not a code.",
  }),
  f({
    key: 'serviceTime', label: 'Service Time (min)', group: 'Service', capability: 'consignment',
    consoleDefault: true, align: 'right', pickupDefault: '—',
    note: "A pickup's dwell is its window length, not a service time.",
  }),
  f({
    key: 'shipByDate', label: 'Ship By Date', group: 'Windows', capability: 'both',
    consoleDefault: true, pickupDefault: 'the window start date',
    note: "A consignment's Ship By Date is a PROMISE; a pickup's date is a BOOKING.",
  }),
  f({ key: 'merchant', label: 'Merchant', group: 'Identifiers', capability: 'both', consoleDefault: true }),
  f({
    key: 'driverName', label: 'Assigned To Driver', group: 'Service', capability: 'consignment',
    consoleDefault: true, pickupDefault: '—',
    note: 'Open question: a pickup has Assigned / Out For Pickup states but stores no driver.',
  }),
  f({
    key: 'orderType', label: 'Order Type', group: 'Identifiers', capability: 'both',
    consoleDefault: true, pickupDefault: 'Pickup Request',
    note: 'The Row Type column already carries this for pickups — keeping both means two cells saying the same thing.',
  }),
  f({
    key: 'activeLeg', label: 'Active Leg', group: 'Service', capability: 'both',
    consoleDefault: true, pickupDefault: 'First Mile',
    note: 'Owner addition (2026-09-24): the leg the consignment is on now — First Mile · Last Mile (no mid mile, owner 2026-09-25).',
  }),
  f({ key: 'createdAt', label: 'Created At', group: 'Windows', capability: 'both', consoleDefault: true }),
  f({ key: 'ageing', label: 'Ageing (days)', group: 'Windows', capability: 'both', consoleDefault: true, align: 'right' }),
  f({
    key: 'deliveryAttemptCount', label: 'Delivery Attempt Count', group: 'Service', capability: 'consignment',
    consoleDefault: true, align: 'right', pickupDefault: 'n/a',
    note: "Never render 0 — a pickup has PICKUP attempts, not delivery attempts; zero is a measurement.",
  }),
  f({
    key: 'codAmount', label: 'COD Amount', group: 'Package', capability: 'both', align: 'right',
    pickupDefault: '—', note: '0 would be a claim, not an absence. A Reserved booking cannot have a COD total.',
  }),
  f({ key: 'skuLineItemNo', label: 'SKU Line Item No', group: 'Package', capability: 'consignment', pickupDefault: '—' }),
  f({ key: 'skuCode', label: 'SKU Code', group: 'Package', capability: 'consignment', pickupDefault: '—' }),
  f({
    key: 'vas', label: 'VAS', group: 'Service', capability: 'consignment', pickupDefault: '—',
    note: "Grow's additional services are FTL commercial extras, not platform VAS codes.",
  }),
  f({ key: 'shipToType', label: 'Ship To Type', group: 'Ship To', capability: 'both', pickupDefault: 'FACILITY' }),
  f({ key: 'shipToCode', label: 'Ship To Code', group: 'Ship To', capability: 'pickup' }),
  f({ key: 'shipToPinCode', label: 'Ship To Pin Code', group: 'Ship To', capability: 'both', pickupDefault: '—' }),
  f({ key: 'shipToCity', label: 'Ship To City', group: 'Ship To', capability: 'both', pickupDefault: '—' }),
  f({ key: 'shipToCounty', label: 'Ship To County', group: 'Ship To', capability: 'both', pickupDefault: '—' }),
  f({
    key: 'carrier', label: 'Carrier', group: 'Service', capability: 'consignment', pickupDefault: 'No Carrier',
    note: 'A pickup is not carrier-allocated in Grow.',
  }),
  f({ key: 'dispatchDate', label: 'Dispatch Date', group: 'Windows', capability: 'consignment', pickupDefault: '—' }),
  f({ key: 'pickupServiceTime', label: 'Pickup Service Time', group: 'Service', capability: 'consignment', pickupDefault: '—' }),
  f({ key: 'deliveryServiceTime', label: 'Delivery Service Time', group: 'Service', capability: 'consignment', pickupDefault: '—' }),
  f({
    key: 'tags', label: 'Tag', group: 'Flags', capability: 'both', pickupDefault: 'the derived chips',
    note: 'The pickup side is richer — Reserved / FTL / Overdue chips already render today.',
  }),
  f({
    key: 'specialInstructions', label: 'Special Instructions', group: 'Identifiers', capability: 'both',
    pickupDefault: '—',
    note: 'HARD RULE: pr.note is INTERNAL and must never surface here — only pr.instructions, which the driver sees.',
  }),
  f({
    key: 'consignmentNumber', label: 'Consignment Number', group: 'Identifiers', capability: 'both',
    pickupDefault: '—',
    note: "The PO's list contains 'Order Number' twice; the second occurrence is relabelled here to de-duplicate it.",
  }),
  f({ key: 'routingPriority', label: 'Routing Priority', group: 'Service', capability: 'consignment', pickupDefault: '—' }),
  f({
    key: 'paymentMode', label: 'Payment Mode', group: 'Package', capability: 'both', pickupDefault: '—',
    note: "'Mixed' is a new value: a booking whose orders disagree.",
  }),
  f({ key: 'shipFromType', label: 'Ship From Type', group: 'Ship From', capability: 'both', pickupDefault: 'STORE' }),
  f({
    key: 'shipFromCode', label: 'Ship From Code', group: 'Ship From', capability: 'both',
    note: 'shipFrom.address.code — the ONE address code the platform master-validates.',
  }),
  f({ key: 'shipFromPinCode', label: 'Ship From Pin Code', group: 'Ship From', capability: 'both' }),
  f({ key: 'shipFromCity', label: 'Ship From City', group: 'Ship From', capability: 'both' }),
  f({ key: 'shipFromCounty', label: 'Ship From County', group: 'Ship From', capability: 'both' }),
  f({ key: 'shipperCode', label: 'Shipper Code', group: 'Identifiers', capability: 'both' }),
  f({ key: 'serviceType', label: 'Service Type', group: 'Service', capability: 'consignment', pickupDefault: '—' }),
  f({
    key: 'originFacilityCode', label: 'Origin Facility Code', group: 'Ship From', capability: 'consignment',
    pickupDefault: '—', note: 'storeCode is a MERCHANT code, not a facility code — the platform rejects one for the other.',
  }),
  f({
    key: 'destinationFacilityCode', label: 'Destination Facility Code', group: 'Ship To', capability: 'both',
    pickupDefault: 'To be confirmed',
    note: 'For an order-backed parcel pickup this must equal the inbound hub of every attached order.',
  }),
  f({ key: 'pickupStartDateTime', label: 'Pickup Start Time', group: 'Windows', capability: 'both' }),
  f({ key: 'pickupEndDateTime', label: 'Pickup End Time', group: 'Windows', capability: 'both' }),
  f({ key: 'deliveryStartDateTime', label: 'Delivery Start Time', group: 'Windows', capability: 'consignment', pickupDefault: '—' }),
  f({ key: 'deliveryEndDateTime', label: 'Delivery End Time', group: 'Windows', capability: 'consignment', pickupDefault: '—' }),
  f({ key: 'schedulingConfirmationRequired', label: 'Scheduling Confirmation Required', group: 'Service', capability: 'consignment', pickupDefault: 'No' }),
  f({
    key: 'schedulingConfirmed', label: 'Scheduling Confirmed', group: 'Service', capability: 'both', pickupDefault: 'No',
    note: "A 'Requested' booking is exactly an unconfirmed schedule.",
  }),
  f({ key: 'trackingNumber', label: 'Tracking Number', group: 'Identifiers', capability: 'consignment', pickupDefault: '—' }),
  f({ key: 'clearanceDone', label: 'Clearance Done', group: 'Service', capability: 'consignment', pickupDefault: '—' }),
  f({ key: 'clearanceRequired', label: 'Clearance Required', group: 'Service', capability: 'consignment', pickupDefault: '—' }),
  f({
    key: 'address', label: 'Address', group: 'Ship To', capability: 'both', pickupDefault: 'the pickup address',
    note: 'DANGEROUS: the same header means the DELIVERY address on a consignment and the PICKUP address on a pickup. The workbook recommends dropping it in favour of the explicit Ship From / Ship To pair.',
  }),
  f({ key: 'originalPickupStartTime', label: 'Original Pickup Start Time', group: 'Windows', capability: 'consignment', pickupDefault: '—' }),
  f({ key: 'originalPickupEndTime', label: 'Original Pickup End Time', group: 'Windows', capability: 'consignment', pickupDefault: '—' }),
  f({ key: 'originalDeliveryStartTime', label: 'Original Delivery Start Time', group: 'Windows', capability: 'consignment', pickupDefault: '—' }),
  f({ key: 'originalDeliveryEndTime', label: 'Original Delivery End Time', group: 'Windows', capability: 'consignment', pickupDefault: '—' }),
  f({
    key: 'cancellationRemarks', label: 'Cancellation Remarks', group: 'Status', capability: 'both', pickupDefault: '—',
    note: 'Only the pickup side records it today, on the Cancelled status event.',
  }),

  /* ---------- new columns the mixed list needs (sheet "New columns") ---------- */
  f({
    key: 'pickupRequestNumber', label: 'Pickup Request #', group: 'Pickup', capability: 'both', isNew: true,
    pickupDefault: '—',
    note: 'How flat rows get GROUPING without a tree: sort or filter by it and a booking sits with its orders.',
  }),
  f({
    key: 'pickedIn', label: 'Picked in', group: 'Pickup', capability: 'consignment', isNew: true, pickupDefault: '—',
    note: 'THE column a parent/child tree cannot express — where the parcel was actually collected, when that is not where it was booked.',
  }),
  f({
    key: 'pickedVsBooked', label: 'Picked vs Booked', group: 'Pickup', capability: 'pickup', isNew: true,
    note: "The number behind 'Partially picked'.",
  }),
  f({ key: 'overages', label: 'Overages', group: 'Pickup', capability: 'pickup', isNew: true, align: 'right', note: 'A scanned barcode matching no order in the system.' }),
  f({ key: 'orders', label: 'Orders', group: 'Pickup', capability: 'pickup', isNew: true, align: 'right', pickupDefault: '—' }),
  f({ key: 'vehicleType', label: 'Vehicle Type', group: 'Pickup', capability: 'both', isNew: true, pickupDefault: '—' }),
  f({
    key: 'vehicleUnit', label: 'Number of Vehicles', group: 'Pickup', capability: 'both', isNew: true, align: 'right',
    pickupDefault: '—', note: 'One FTL row can mean six trucks; without this the list understates the yard.',
  }),
  f({ key: 'sizeClass', label: 'Size class', group: 'Pickup', capability: 'pickup', isNew: true, note: 'The only shape information a Reserved booking has.' }),
  f({
    key: 'flags', label: 'Flags', group: 'Flags', capability: 'consignment', isNew: true, pickupDefault: '—',
    note: 'VIP / Hazmat / Fragile / Stackable / Heavy Weight. Present in the staging capture and absent from the PO\'s column list — off by default here so the seven default columns still sum to 1126px.',
  }),
]

/* ----------------------------------------------------------- derived maps --- */

export const FIELD_BY_KEY: ReadonlyMap<string, FieldDef> = new Map(FIELDS.map((d) => [d.key, d]))

/** Console columns only — the 67 the product owner's list contains. */
export const CONSOLE_FIELDS = FIELDS.filter((d) => !d.isNew)
/** The 20 the console shows out of the box. */
export const CONSOLE_DEFAULT_COUNT = FIELDS.filter((d) => d.consoleDefault).length

/** A field can be toggled only when it is a column in its own right. */
export const isToggleable = (d: FieldDef): boolean => !d.carriedBy && !d.mandatory

/** Does this field have a value on this row type? */
export function coversRowType(applies: AppliesTo, type: RowType): boolean {
  if (applies === 'both') return true
  return applies === 'pickup' ? isPickupType(type) : type === 'Consignment'
}

/** The narrowing a user may choose, given a capability. A capability of one is fixed. */
export function narrowingOptions(capability: AppliesTo): AppliesTo[] {
  return capability === 'both' ? ['both', 'consignment', 'pickup'] : [capability]
}

export const APPLIES_LABEL: Record<AppliesTo, string> = {
  both: 'Both',
  consignment: 'Consignment',
  pickup: 'Pickup',
}

/* ---------------------------------------------------------------- filters --- */

/**
 * The merged filter set (workbook sheet "Filters mapping" + "New filters"):
 * every console filter crossed with every filter the two Grow lists ship.
 *
 * `pickup: 'no'` is the one that needs saying out loud in the UI — setting such
 * a filter EXCLUDES every pickup row from the result, and silently halving the
 * list is the failure mode the sheet names.
 */
export type FilterReach = 'yes' | 'partial' | 'no'
export type FilterPlacement = 'visible' | 'advanced' | 'toolbar' | 'quick'

export interface FilterDef {
  key: string
  label: string
  consignment: FilterReach
  pickup: FilterReach
  placement: FilterPlacement
  defaultVisible: boolean
  isNew?: boolean
  note?: string
}

export const FILTERS: FilterDef[] = [
  { key: 'dateRange', label: 'Date range', consignment: 'yes', pickup: 'yes', placement: 'visible', defaultVisible: true, note: "Filters the row's primary date — the window on a pickup, created/ship-by on a consignment." },
  { key: 'pickupAddress', label: 'Pickup Address / Origin', consignment: 'yes', pickup: 'yes', placement: 'visible', defaultVisible: true, note: 'The dimension both existing lists already lead with.' },
  { key: 'state', label: 'State / Secondary State', consignment: 'yes', pickup: 'yes', placement: 'visible', defaultVisible: true, note: "Set difference, not two lists bolted together: only 'Requested' and 'Cancelled' are new values." },
  { key: 'rowType', label: 'Row Type', consignment: 'yes', pickup: 'yes', placement: 'advanced', defaultVisible: true, isNew: true, note: 'The most-used control on a mixed list, and the escape hatch back to a consignments-only view.' },
  { key: 'destination', label: 'Destination', consignment: 'yes', pickup: 'yes', placement: 'advanced', defaultVisible: true },
  { key: 'orderType', label: 'Order Type', consignment: 'yes', pickup: 'partial', placement: 'advanced', defaultVisible: true },
  { key: 'activeLeg', label: 'Active Leg', consignment: 'yes', pickup: 'yes', placement: 'visible', defaultVisible: true, isNew: true, note: 'The leg the row is on now; a pickup request is always First Mile.' },
  { key: 'merchant', label: 'Merchant', consignment: 'yes', pickup: 'yes', placement: 'advanced', defaultVisible: true },
  { key: 'facility', label: 'Facility', consignment: 'yes', pickup: 'partial', placement: 'advanced', defaultVisible: true },
  { key: 'sortCode', label: 'Sort Code', consignment: 'yes', pickup: 'no', placement: 'advanced', defaultVisible: true },
  { key: 'scheduling', label: 'Scheduling', consignment: 'yes', pickup: 'partial', placement: 'advanced', defaultVisible: true },
  { key: 'serviceType', label: 'Service Type', consignment: 'yes', pickup: 'no', placement: 'advanced', defaultVisible: true },
  { key: 'attemptCount', label: 'Attempt Count', consignment: 'yes', pickup: 'no', placement: 'advanced', defaultVisible: false },
  { key: 'clearance', label: 'Clearance', consignment: 'yes', pickup: 'no', placement: 'advanced', defaultVisible: false },
  { key: 'tags', label: 'Tags', consignment: 'yes', pickup: 'yes', placement: 'advanced', defaultVisible: true },
  { key: 'payment', label: 'Payment', consignment: 'yes', pickup: 'partial', placement: 'advanced', defaultVisible: false },
  { key: 'packageKind', label: 'Package kind', consignment: 'yes', pickup: 'yes', placement: 'advanced', defaultVisible: false },
  { key: 'businessName', label: 'Business Name', consignment: 'yes', pickup: 'no', placement: 'advanced', defaultVisible: false },
  { key: 'codAmount', label: 'COD Amount', consignment: 'yes', pickup: 'partial', placement: 'advanced', defaultVisible: false },
  { key: 'totalWeight', label: 'Total Weight', consignment: 'yes', pickup: 'yes', placement: 'advanced', defaultVisible: false },
  { key: 'totalVolume', label: 'Total Volume', consignment: 'yes', pickup: 'partial', placement: 'advanced', defaultVisible: false },
  { key: 'ageing', label: 'Ageing (days)', consignment: 'yes', pickup: 'yes', placement: 'advanced', defaultVisible: true },
  { key: 'vehicleType', label: 'Vehicle type', consignment: 'partial', pickup: 'partial', placement: 'advanced', defaultVisible: false, isNew: true, note: "The one way to answer 'what is on the yard tomorrow'." },
  { key: 'hasOrders', label: 'Has orders', consignment: 'no', pickup: 'yes', placement: 'advanced', defaultVisible: true, isNew: true, note: 'A booking with nothing attached whose window is closing.' },
  { key: 'overdue', label: 'Overdue', consignment: 'no', pickup: 'yes', placement: 'advanced', defaultVisible: true, isNew: true, note: 'A booking nobody turned up for — invisible in every other dimension.' },
  { key: 'duplicate', label: 'Duplicate', consignment: 'no', pickup: 'yes', placement: 'advanced', defaultVisible: false, isNew: true, note: 'Two vans to one door.' },
  { key: 'hasOverages', label: 'Has overages', consignment: 'no', pickup: 'yes', placement: 'advanced', defaultVisible: false, isNew: true, note: 'Physical parcels with no record behind them.' },
  { key: 'exceptions', label: 'Exceptions', consignment: 'yes', pickup: 'yes', placement: 'toolbar', defaultVisible: true, note: "Console values plus the two pickup-side ones: Overage and Pickup Failed." },
  { key: 'search', label: 'Search', consignment: 'yes', pickup: 'yes', placement: 'toolbar', defaultVisible: true },
  { key: 'quickFilters', label: 'Quick Filter cards', consignment: 'yes', pickup: 'partial', placement: 'quick', defaultVisible: true },
  { key: 'carrierCategory', label: 'Carriers / Categories cards', consignment: 'yes', pickup: 'partial', placement: 'quick', defaultVisible: true, note: 'Every pickup row falls under the No Carrier chip.' },
]

export const FILTER_BY_KEY: ReadonlyMap<string, FilterDef> = new Map(FILTERS.map((d) => [d.key, d]))

export const PLACEMENT_LABEL: Record<FilterPlacement, string> = {
  visible: 'Always visible',
  advanced: 'Advanced Filters',
  toolbar: 'Toolbar',
  quick: 'Quick Filter strip',
}

export const REACH_LABEL: Record<FilterReach, string> = {
  yes: 'Yes', partial: 'Partial', no: 'Excluded',
}
