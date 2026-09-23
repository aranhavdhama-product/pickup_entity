/**
 * Reason codes for the pickup outcomes ops has to explain. Stored as the CODE
 * (`GrowPickupRequest.failureReason`), shown as the label — so a label can be
 * reworded without orphaning every request that already carries it.
 */
export interface ReasonOption { code: string; label: string }

export const PICKUP_FAILURE_REASONS: readonly ReasonOption[] = [
  { code: 'SHIPMENT_NOT_READY', label: 'Shipment not ready' },
  { code: 'PREMISES_CLOSED', label: 'Premises closed' },
  { code: 'INCORRECT_ADDRESS', label: 'Incorrect address' },
  { code: 'LABEL_PACKAGING', label: 'Label missing / packaging improper' },
  { code: 'HANDOVER_DELAYED', label: 'Handover delayed past slot' },
  { code: 'MERCHANT_CANCELLED_AT_DOOR', label: 'Merchant cancelled at door' },
  { code: 'OVERWEIGHT_DIMENSION', label: 'Overweight / dimension mismatch' },
  { code: 'DAMAGED_REFUSED', label: 'Damaged goods refused' },
  /* ---- carrier side (CARRIER_SIDE_REASON_CODES): the driver / fleet could not do it ---- */
  { code: 'DRIVER_NO_SHOW', label: 'Driver no-show' },
  { code: 'VEHICLE_CAPACITY', label: 'Vehicle capacity insufficient' },
  { code: 'VEHICLE_BREAKDOWN', label: 'Vehicle breakdown' },
  { code: 'ACCIDENT', label: 'Accident' },
  { code: 'DRIVER_UNAVAILABLE', label: 'Driver unavailable' },
  /* system-set, never offered in a picker — see NO_ORDERS below */
  { code: 'NO_ORDERS', label: 'No orders to collect' },
  { code: 'OTHER', label: 'Other' },
]

/** The code the store sets when a request is left with nothing to collect.
 *  Pickers should offer `PICKUP_FAILURE_REASONS` minus this one. */
export const NO_ORDERS_REASON = 'NO_ORDERS'
/** The carrier-side group — every other pickable code is the merchant's side. */
export const CARRIER_SIDE_REASON_CODES: ReadonlySet<string> = new Set([
  'DRIVER_NO_SHOW', 'VEHICLE_CAPACITY', 'VEHICLE_BREAKDOWN', 'ACCIDENT', 'DRIVER_UNAVAILABLE',
])
export const PICKABLE_FAILURE_REASONS = PICKUP_FAILURE_REASONS.filter((r) => r.code !== NO_ORDERS_REASON)

export const CANCEL_REASONS: readonly ReasonOption[] = [
  { code: 'MERCHANT_REQUEST', label: 'Merchant request' },
  { code: 'DUPLICATE_BOOKING', label: 'Duplicate booking' },
  { code: 'ORDER_CANCELLED', label: 'Order cancelled' },
  { code: 'OTHER', label: 'Other' },
]

/** Code → label; an unknown code (hand-edited blob, retired reason) reads as itself. */
export const reasonLabel = (list: readonly ReasonOption[], code: string | null | undefined): string =>
  (code ? list.find((r) => r.code === code)?.label ?? code : '')

export const failureReasonLabel = (code: string | null | undefined) => reasonLabel(PICKUP_FAILURE_REASONS, code)
export const cancelReasonLabel = (code: string | null | undefined) => reasonLabel(CANCEL_REASONS, code)
