/**
 * Context-aware party labels for consignment forms and detail views.
 *
 * Encodes the SED label matrix: the same shipFrom/shipTo system columns are
 * presented under different display names depending on consignment type +
 * task type (and RTO state on read-side views). Only labels change — the
 * underlying fields never move.
 */

export type LabelContext =
  | 'forward_delivery' // Forward + task DELIVERY
  | 'forward_pickup'   // Forward + task PICKUP
  | 'reverse'          // Reverse
  | 'service'          // Service
  | 'pick_and_del'     // Pick & Del
  | 'rto'              // Any RTO state (read-side)

export interface PartySideLabels {
  /** Display entity that prefixes every labelled field, e.g. "Origin Facility" */
  entity: string
  /** Label for the HUB field only — originFacilityCode / destinationFacilityCode /
   *  returnFacilityCode. NOT `address.code`: those are independent fields and the
   *  form renders them separately (address.code is labelled "Location Code"). */
  facilityCode: string
  /** Window row label ("Pickup Window" / "Delivery Window" / "Service Window") or null = hidden */
  window: string | null
}

export interface PartyLabels {
  shipFrom: PartySideLabels
  shipTo: PartySideLabels
}

/** Verbatim from the label matrix — one row per context. */
const MATRIX: Record<LabelContext, PartyLabels> = {
  forward_delivery: {
    shipFrom: { entity: 'Origin Facility', facilityCode: 'Origin Facility Code', window: null },
    shipTo: { entity: 'Customer', facilityCode: 'Delivery Location Code', window: 'Delivery Window' },
  },
  forward_pickup: {
    shipFrom: { entity: 'Customer', facilityCode: 'Pickup Location Code', window: 'Pickup Window' },
    shipTo: { entity: 'Destination Facility', facilityCode: 'Destination Facility Code', window: null },
  },
  reverse: {
    shipFrom: { entity: 'Customer', facilityCode: 'Pickup Location Code', window: 'Pickup Window' },
    shipTo: { entity: 'Return Facility', facilityCode: 'Return Facility Code', window: null },
  },
  service: {
    shipFrom: { entity: 'Origin Facility', facilityCode: 'Origin Facility Code', window: null },
    shipTo: { entity: 'Customer', facilityCode: 'Service Location Code', window: 'Service Window' },
  },
  pick_and_del: {
    shipFrom: { entity: 'Supplier', facilityCode: 'Supplier Location Code', window: 'Pickup Window' },
    shipTo: { entity: 'Customer', facilityCode: 'Delivery Location Code', window: 'Delivery Window' },
  },
  rto: {
    shipFrom: { entity: 'Customer', facilityCode: 'Origin Facility Code', window: null },
    shipTo: { entity: 'Origin Facility', facilityCode: 'Origin Facility Code', window: 'Delivery Window' },
  },
}

export function partyLabelsFor(context: LabelContext): PartyLabels {
  return MATRIX[context]
}

/** Resolve the label context from the form's type + task selections. */
export function resolveContext(consignmentType: string, taskType: string): LabelContext {
  if (consignmentType === 'Reverse') return 'reverse'
  if (consignmentType === 'Service') return 'service'
  if (taskType === 'Pickup') return 'forward_pickup'
  if (taskType === 'Pick & Del') return 'pick_and_del'
  return 'forward_delivery' // Forward/Exchange/Transfer + Delivery
}

/** Task choices only make sense for Forward-family consignments. */
export function taskSelectable(consignmentType: string): boolean {
  return consignmentType === 'Forward'
}

export const TASK_TYPES = ['Delivery', 'Pickup', 'Pick & Del'] as const
