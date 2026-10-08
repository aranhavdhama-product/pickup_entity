/**
 * The OFFICIAL consignment State / Secondary State vocabulary (owner, 2026-10-08: "these are the official states and
 * substates in the system — use them only"). Nothing else may be shown, filtered or produced for a CONSIGNMENT.
 *
 *   primary state      secondary state(s)
 *   PENDING · CREATED (also LABEL_GENERATED) · PICKUP_REQUESTED · READY_TO_SHIP        –
 *   CREATED            DRIVER_ASSIGNED_FOR_PICKUP
 *   PICKEDUP           – / PARTIALLY_PICKEDUP
 *   PICKUP_FAILED      –
 *   INTRANSIT          DISPATCHED
 *   PARTIAL_AT_FACILITY –
 *   AT_FACILITY        – / STORED · SCHEDULED · UNPLANNED · STAGING_STARTED · STAGED · DRIVER_ASSIGNED · DRIVER_ASSIGNED_FOR_DELIVERY ·
 *                      DRIVER_ASSIGNED_FOR_PICKUP · READY_FOR_LAST_MILE_DISPATCH · LOADED · LOADED_ON_LASTMILE ·
 *                      PARTIALLY_LOADED_ON_LASTMILE · REQUEST_FOR_RESCHEDULE · MISSING · PERMANENT_DAMAGE
 *   DRIVER_OUT         OUT_FOR_PICKUP · OUT_FOR_DELIVERY · NEXT_IN_ROUTE
 *   REACHED_LOCATION   AT_PICKUP_LOCATION · AT_DELIVERY_LOCATION
 *   DELIVERED          –
 *   UNDELIVERED        – / PARTIALLY_DELIVERED
 *   RTO_INITIATED · RTO_IN_PROGRESS (also DRIVER_ASSIGNED_FOR_RTO) · RTO_DRIVER_OUT (OUT_FOR_RTO)   –
 *   RTO_COMPLETED · CANCELLED · LOST   –
 *
 * (A PICKUP REQUEST has its own statuses — Requested · Planned · Assigned … — which are NOT consignment states.)
 * Pure module: nothing from src/auth, no React.
 */

/** every primary state, as the console prints it (Title Case; RTO stays upper) */
export const OFFICIAL_PRIMARY = [
  'Pending', 'Created', 'Pickup Requested', 'Ready To Ship', 'Pickedup', 'Pickup Failed', 'Intransit', 'Partial At Facility',
  'At Facility', 'Driver Out', 'Reached Location', 'Delivered', 'Undelivered', 'RTO Initiated', 'RTO In Progress',
  'RTO Driver Out', 'RTO Completed', 'Cancelled', 'Lost',
] as const

/** primary → the secondary states it may carry (a row may also carry none) */
export const OFFICIAL_PAIRS: Record<string, readonly string[]> = {
  'Pending': [], 'Created': ['Label Generated', 'Driver Assigned For Pickup'], 'Pickup Requested': [], 'Ready To Ship': [],
  'Pickedup': ['Partially Pickedup'], 'Pickup Failed': [], 'Intransit': ['Dispatched'], 'Partial At Facility': [],
  'At Facility': [
    'Stored', 'Scheduled', 'Unplanned', 'Staging Started', 'Staged', 'Driver Assigned', 'Driver Assigned For Delivery',
    'Driver Assigned For Pickup', 'Ready For Last Mile Dispatch', 'Loaded', 'Loaded On Lastmile', 'Partially Loaded On Lastmile',
    'Request For Reschedule', 'Missing', 'Permanent Damage',
  ],
  'Driver Out': ['Out For Pickup', 'Out For Delivery', 'Next In Route'],
  'Reached Location': ['At Pickup Location', 'At Delivery Location'],
  'Delivered': [], 'Undelivered': ['Partially Delivered'], 'RTO Initiated': [], 'RTO In Progress': ['Driver Assigned For RTO'],
  'RTO Driver Out': ['Out For RTO'], 'RTO Completed': [], 'Cancelled': [], 'Lost': [],
}

/** every secondary state, once */
export const OFFICIAL_SECONDARY: readonly string[] = [...new Set(Object.values(OFFICIAL_PAIRS).flat())]

const PRIMARY = new Set<string>(OFFICIAL_PRIMARY)
const SECONDARY = new Set<string>(OFFICIAL_SECONDARY)

/** a value the prototype (or staging's older list) used that has an official home */
const STATE_ALIAS: Record<string, [string, string]> = {
  'Partially Pickedup': ['Pickedup', 'Partially Pickedup'],
  'Service Completed': ['Delivered', ''], 'Service Failed': ['Undelivered', ''],
  'RTO Received From Carrier': ['RTO In Progress', ''],
}
const SECONDARY_ALIAS: Record<string, string> = {
  Planned: 'Ready For Last Mile Dispatch', Damaged: 'Permanent Damage', Damage: 'Permanent Damage',
}

/**
 * Whatever a producer says → an official (state, secondary) pair. A secondary that is really a PRIMARY state (the planning
 * overlay's RTO Initiated / Delivered / Undelivered / Cancelled) becomes the state; an alias is renamed; anything with no
 * official place is dropped to "–" rather than shown.
 */
export function officialState(state: string, secondary: string): { state: string; secondary: string } {
  let st = state, sec = secondary
  const a = STATE_ALIAS[st]
  if (a) { st = a[0]; sec = sec || a[1] }
  if (sec && SECONDARY_ALIAS[sec]) sec = SECONDARY_ALIAS[sec]
  if (sec && PRIMARY.has(sec) && !SECONDARY.has(sec)) { st = sec; sec = '' }
  if (!PRIMARY.has(st)) st = 'Created'
  if (sec && !SECONDARY.has(sec)) sec = ''
  return { state: st, secondary: sec }
}

export const isOfficialPrimary = (v: string): boolean => PRIMARY.has(v)
export const isOfficialSecondary = (v: string): boolean => SECONDARY.has(v)
