/**
 * The ONE `State/Secondary State` option list — Pending for Planning
 * (`/local/pending-for-planning`), the console Consignment Order list
 * (`/local/consignments`) and the Grow twin (`/grow/orders`) all read it.
 *
 * Source: staging's `State/Secondary State` popover, verbatim (41 options over
 * BOTH vocabularies, captured 2026-09-23) — 13 primary states, then 28
 * secondary states, each block alphabetical. Merged into the primary block are
 * the platform's official primary states the popover does not offer
 * (FAREYE-STATES-EVENTS.md, owner 2026-09-24), so a row's State can always be
 * filtered: Pickup Requested, Delivered, Cancelled, the service outcomes and
 * the RTO stages. Total 50.
 *
 * No value appears in both groups, so the list is one flat value space and a
 * row matches when its State OR its Secondary State is ticked (`matchesState`).
 * Import-safe: nothing from src/auth.
 */

/** staging's primary-state block (as captured) */
const STAGING_PRIMARY = [
  'At Facility', 'Created', 'Driver Out', 'Intransit', 'Lost', 'Partial At Facility', 'Pending',
  'Pickedup', 'Pickup Failed', 'Reached Location', 'Ready To Ship', 'RTO Initiated', 'Undelivered',
] as const

/** official primary states (FAREYE-STATES-EVENTS.md) missing from staging's popover */
const OFFICIAL_PRIMARY_ADDED = [
  'Pickup Requested', 'Delivered', 'Service Completed', 'Service Failed', 'RTO In Progress',
  'RTO Driver Out', 'RTO Received From Carrier', 'RTO Completed', 'Cancelled',
] as const

/** staging's secondary-state block (as captured) */
export const SECONDARY_STATES = [
  'At Delivery Location', 'At Pickup Location', 'Damage', 'Dispatched', 'Driver Assigned',
  'Driver Assigned For Delivery', 'Driver Assigned For Pickup', 'Driver Assigned For Service',
  'Geo Lookup Not Found', 'Label Generated', 'Loaded', 'Loaded On Lastmile', 'Missing',
  'Out For Delivery', 'Out For Pickup', 'Out For Service', 'Partially Delivered',
  'Partially Loaded On Lastmile', 'Partially Pickedup', 'Permanent Damage', 'Planned',
  'Ready For Last Mile Dispatch', 'Request For Reschedule', 'Scheduled', 'Staged',
  'Staging Started', 'Stored', 'Unplanned',
] as const

/** every primary state, staging's alphabetical order (case-insensitive) */
export const PRIMARY_STATES: readonly string[] =
  [...STAGING_PRIMARY, ...OFFICIAL_PRIMARY_ADDED].sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }))

/** the popover's options: primary block, then secondary block */
export const STATE_OPTIONS: string[] = [...PRIMARY_STATES, ...SECONDARY_STATES]

const PRIMARY_SET = new Set<string>(PRIMARY_STATES)

/** heading for a value in a grouped popup */
export const stateGroupOf = (v: string): 'State' | 'Secondary State' =>
  (PRIMARY_SET.has(v) ? 'State' : 'Secondary State')

/** a row passes when nothing is ticked, or its State or Secondary State is ticked */
export const matchesState = (sel: readonly string[], state: string, secondary: string): boolean =>
  sel.length === 0 || sel.includes(state) || (!!secondary && sel.includes(secondary))

/* dev guard: staging's own order survives the merge, and the groups never overlap */
if (import.meta.env.DEV) {
  const kept = PRIMARY_STATES.filter((s) => (STAGING_PRIMARY as readonly string[]).includes(s))
  if (kept.join('|') !== STAGING_PRIMARY.join('|')) console.warn('stateVocabulary: staging primary order changed', kept)
  const both = SECONDARY_STATES.filter((s) => PRIMARY_SET.has(s))
  if (both.length) console.warn('stateVocabulary: value in both groups', both)
}
