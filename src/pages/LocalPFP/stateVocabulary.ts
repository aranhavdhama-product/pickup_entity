/**
 * The ONE `State/Secondary State` option list — Pending for Planning
 * (`/local/pending-for-planning`), the console Consignment Order list
 * (`/local/consignments`) and the Grow twin (`/grow/orders`) all read it.
 *
 * Source: the OFFICIAL list (owner, 2026-10-08) in `growOrders/fareyeStates.ts` — nothing else is offered.
 *
 * No value appears in both groups, so the list is one flat value space and a
 * row matches when its State OR its Secondary State is ticked (`matchesState`).
 * Import-safe: nothing from src/auth.
 */

import { OFFICIAL_PRIMARY, OFFICIAL_SECONDARY } from '../../growOrders/fareyeStates'

/** every primary state — the OFFICIAL list only (owner, 2026-10-08), alphabetical like the popover */
export const PRIMARY_STATES: readonly string[] =
  [...OFFICIAL_PRIMARY].sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }))

/** every secondary state — the OFFICIAL list only, alphabetical */
export const SECONDARY_STATES: readonly string[] =
  [...OFFICIAL_SECONDARY].sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }))

/** the popover's options: primary block, then secondary block */
export const STATE_OPTIONS: string[] = [...PRIMARY_STATES, ...SECONDARY_STATES]

const PRIMARY_SET = new Set<string>(PRIMARY_STATES)

/** heading for a value in a grouped popup */
export const stateGroupOf = (v: string): 'State' | 'Secondary State' =>
  (PRIMARY_SET.has(v) ? 'State' : 'Secondary State')

/** a row passes when nothing is ticked, or its State or Secondary State is ticked */
export const matchesState = (sel: readonly string[], state: string, secondary: string): boolean =>
  sel.length === 0 || sel.includes(state) || (!!secondary && sel.includes(secondary))

/* dev guard: the groups never overlap */
if (import.meta.env.DEV) {
  const both = SECONDARY_STATES.filter((s) => PRIMARY_SET.has(s))
  if (both.length) console.warn('stateVocabulary: value in both groups', both)
}
