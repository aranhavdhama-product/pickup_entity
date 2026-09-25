/**
 * Consignment Order module (moduleSettings code `CONSIGNMENT_MANAGEMENT`) —
 * the vocabulary staging's Base Modules → Consignment Order page offers.
 * ONE source of truth for the console replica (`nueva/ModuleDetail.tsx`) and
 * the LOCAL app's settings page (`pages/LocalSettings/ConsignmentOrderSettings`).
 *
 * Lifted from the v2 bundle (column array `SF`, filter array `SH`) and the live
 * page on 2026-09-24 — see docs/superpowers/research/2026-09-24-staging-general-and-consignment-settings.md.
 *
 * Pure data: no React, no fetch, no src/auth — safe for every app.
 */

/** Table Configuration universe — staging's 67 keys, in the bundle's order. */
export const CONSIGNMENT_COLUMN_UNIVERSE = [
  'consignmentNumber', 'referenceNumber', 'state', 'secondaryState', 'exceptionState', 'exceptionReason',
  'totalWeight', 'totalVolume', 'palletQuantity', 'totalQuantity', 'sku', 'skuLineItemNo', 'skuCode',
  'shipByDate', 'shipToName', 'shipToAddress', 'shipToType', 'shipToCode', 'shipToPinCode', 'shipToCity',
  'shipToCounty', 'businessUnit', 'driverName', 'consignmentType', 'createdAt', 'ageing', 'carrier', 'tags',
  'vas', 'serviceTime', 'pickupServiceTime', 'deliveryServiceTime', 'orderNumber', 'dispatchDate',
  'routingPriority', 'specialInstructions', 'shipperCode', 'serviceType', 'pickupStartDateTime',
  'pickupEndDateTime', 'deliveryStartDateTime', 'deliveryEndDateTime', 'deliveryAttemptCount',
  'schedulingConfirmationRequired', 'schedulingConfirmed', 'paymentMode', 'shipFromName', 'shipFromAddress',
  'shipFromType', 'shipFromCode', 'shipFromPinCode', 'shipFromCity', 'shipFromCounty', 'originFacilityCode',
  'destinationFacilityCode', 'trackingNumber', 'codAmount', 'clearanceDone', 'clearanceRequired', 'address',
  'originalPickupStartTime', 'originalPickupEndTime', 'originalLastmileDeliveryStartTime',
  'originalLastmileDeliveryEndTime', 'cancellationRemarksReason', 'pickupWindow', 'deliveryWindow',
]

/** Column titles exactly as staging's bundle writes them. */
export const CONSIGNMENT_COLUMN_LABELS: Record<string, string> = {
  consignmentNumber: 'Consignment Number', referenceNumber: 'Reference Number', state: 'State',
  secondaryState: 'Secondary State', exceptionState: 'Exception State', exceptionReason: 'Exception Reason',
  totalWeight: 'Weight', totalVolume: 'Volume', palletQuantity: 'Pallet Quantity', totalQuantity: 'Total Quantity',
  sku: 'SKU', skuLineItemNo: 'SKU Line Item No', skuCode: 'SKU Code', shipByDate: 'Ship By Date',
  shipToName: 'Ship to Name', shipToAddress: 'Ship To Address', shipToType: 'Ship To Type', shipToCode: 'Ship To Code',
  shipToPinCode: 'Ship To Pin Code', shipToCity: 'Ship To City', shipToCounty: 'Ship To County',
  businessUnit: 'Merchant', driverName: 'Assigned To Driver', consignmentType: 'Consignment Type',
  createdAt: 'Created At', ageing: 'Ageing (days)', carrier: 'Carrier', tags: 'Tag', vas: 'VAS',
  serviceTime: 'Service Time (min)', pickupServiceTime: 'Pickup Service Time', deliveryServiceTime: 'Delivery Service Time',
  orderNumber: 'Order Number', dispatchDate: 'Dispatch Date', routingPriority: 'Routing Priority',
  specialInstructions: 'Special Instructions', shipperCode: 'Shipper Code', serviceType: 'Service Type',
  pickupStartDateTime: 'Pickup Start Time', pickupEndDateTime: 'Pickup End Time',
  deliveryStartDateTime: 'Delivery Start Time', deliveryEndDateTime: 'Delivery End Time',
  deliveryAttemptCount: 'Delivery Attempt Count', schedulingConfirmationRequired: 'Scheduling Confirmation Required',
  schedulingConfirmed: 'Scheduling Confirmed', paymentMode: 'Payment Mode', shipFromName: 'Ship From Name',
  shipFromAddress: 'Ship From Address', shipFromType: 'Ship From Type', shipFromCode: 'Ship From Code',
  shipFromPinCode: 'Ship From Pin Code', shipFromCity: 'Ship From City', shipFromCounty: 'Ship From County',
  originFacilityCode: 'Origin Facility Code', destinationFacilityCode: 'Destination Facility Code',
  trackingNumber: 'Tracking Number', codAmount: 'COD Amount', clearanceDone: 'Clearance Done',
  clearanceRequired: 'Clearance Required', address: 'Address', originalPickupStartTime: 'Original Pickup Start Time',
  originalPickupEndTime: 'Original Pickup End Time', originalLastmileDeliveryStartTime: 'Original Delivery Start Time',
  originalLastmileDeliveryEndTime: 'Original Delivery End Time', cancellationRemarksReason: 'Cancellation Remarks',
  pickupWindow: 'Pickup Window', deliveryWindow: 'Delivery Window',
}

/** Staging's default shown columns = the account's current 21, in its order. */
export const CONSIGNMENT_DEFAULT_COLUMNS = [
  'consignmentNumber', 'referenceNumber', 'state', 'secondaryState', 'exceptionState', 'exceptionReason',
  'totalWeight', 'totalVolume', 'palletQuantity', 'sku', 'serviceTime', 'shipByDate', 'shipToName',
  'shipToAddress', 'businessUnit', 'driverName', 'consignmentType', 'createdAt', 'ageing',
  'deliveryAttemptCount', 'shipToType',
]

/** On Page Filters universe — staging's 20 keys (bundle `SH`), in order. */
export const CONSIGNMENT_FILTER_UNIVERSE = [
  'state', 'facility', 'origin', 'destination', 'consignmentType', 'businessUnit', 'routeName', 'driverName',
  'sortCode', 'carrier', 'scheduling', 'serviceType', 'tags', 'clearance', 'consignment_categories',
  'cod_amount', 'total_weight', 'total_volume', 'ageing', 'customerBusinessUnit',
]
/** Filter titles differ from column titles (`driverName` = "Driver Name" here). */
export const CONSIGNMENT_FILTER_LABELS: Record<string, string> = {
  state: 'State', facility: 'Facility', origin: 'Origin', destination: 'Destination',
  consignmentType: 'Consignment Type', businessUnit: 'Merchant', routeName: 'Route Name', driverName: 'Driver Name',
  sortCode: 'Sort Code', carrier: 'Carrier', scheduling: 'Scheduling', serviceType: 'Service Type', tags: 'Tags',
  clearance: 'Clearance', consignment_categories: 'Category', cod_amount: 'COD Amount',
  total_weight: 'Total Weight', total_volume: 'Total Volume', ageing: 'Ageing', customerBusinessUnit: 'Business Unit',
}
/** The first 12 are on by default (and on the staging account today). */
export const CONSIGNMENT_DEFAULT_FILTERS = CONSIGNMENT_FILTER_UNIVERSE.slice(0, 12)

/**
 * Order View (General Settings `viewOnOrder`) retitles two keys, exactly as
 * staging does: consignmentNumber → "Order Number", consignmentType → "Order Type".
 */
export function orderViewTitle(key: string, title: string, viewOnOrder: boolean): string {
  if (!viewOnOrder) return title
  if (key === 'consignmentNumber') return 'Order Number'
  if (key === 'consignmentType') return 'Order Type'
  return title
}

/** Date Filter tab → `dateAppliedOn` (stored top-level in settingJson). */
export const CONSIGNMENT_DATE_FIELDS = [
  { name: 'Created Date', code: 'created_at' },
  { name: 'Delivery/Pickup Date', code: 'ship_to_delivery_date' },
  { name: 'Ship By Date', code: 'ship_by_date' },
  { name: 'Updated At', code: 'last_updated_at' },
  { name: 'Last Mile Dispatch Date', code: 'dispatch_date' },
] as const
export type ConsignmentDateField = (typeof CONSIGNMENT_DATE_FIELDS)[number]['code']

/** Date Filter tab → `selectedDateRange`, a day offset from today. */
export const CONSIGNMENT_DATE_RANGES = [
  { name: 'Last 30 days', code: -30 },
  { name: 'Last 15 Days', code: -15 },
  { name: 'Last 7 Days', code: -7 },
  { name: 'Today', code: 0 },
  { name: 'Next 7 Days', code: 7 },
] as const
export type ConsignmentDateRange = (typeof CONSIGNMENT_DATE_RANGES)[number]['code']

/** User Types offered on the General tab (staging reads them from GET /app/rest/user_type). */
export const CONSIGNMENT_USER_TYPES = ['Helper', 'Floor supervisor', 'Field Executive', 'Carrier', 'Admin', 'Manager']

/** General tab → Feature Settings → "Modify consignment Action till" (`modifyConsignmentTill`). */
export const MODIFY_CONSIGNMENT_TILL_OPTIONS = [
  { name: 'Ready for Dispatch', code: 'rfd' },
  { name: 'Out for Delivery', code: 'ofd' },
] as const
export type ModifyConsignmentTill = (typeof MODIFY_CONSIGNMENT_TILL_OPTIONS)[number]['code']
