/**
 * Pending For Planning — the TABS and their per-tab COLUMN SETS (owner,
 * 2026-09-25). Staging has one list with one column set; the tabs and every
 * set but Last Mile's are owner additions, logged in
 * scratchpad/split/pixel-diff-log.md.
 *
 *  - Last Mile    the measured staging consignment grid.
 *  - First Mile   Group by "Pickup request" → one row per pickup request, on
 *                 the shared `/local/pickup` definitions (`PR_COLUMN_DEFS`).
 *                 Group by "None" → the first-mile consignments, on the Last
 *                 Mile set (staging's exact consignment grid).
 *  - All          pickup requests + the Last Mile consignments (no first-mile
 *                 consignment rows); only what BOTH row shapes carry; the ONLY tab with Active Leg
 *                 (owner, 2026-09-25: on First Mile / Last Mile the tab already
 *                 says the leg), and Type = the row kind only.
 *
 * NO NEW MEASUREMENT: every width below is either a measured staging column
 * (`stagingTokens.json`), the Active Leg column already on the page, or a
 * `PR_COLUMN_DEFS` width (those columns are not staging's, so staging has no
 * measurement for them).
 */
import { PR_COLUMN_DEFS, prTypeLabel, type PrColumnCtx } from '../LocalPickup/prModel'
import type { GrowPickupRequest } from '../../growOrders/types'
import { isPickupRow, type UnifiedRow } from './adapter'
import { COLUMNS, T, type StagingColumn } from './stagingTokens'

/* ------------------------------------------------------------- the tabs --- */

/** First Mile · Last Mile · All — All last (owner). */
export const TABS = [
  { key: 'first-mile', label: 'First Mile' },
  { key: 'last-mile', label: 'Last Mile' },
  { key: 'all', label: 'All' },
] as const
export type TabKey = typeof TABS[number]['key']

/** the pre-2026-09-25 slugs still resolve */
const TAB_ALIASES: Record<string, TabKey> = { pickups: 'first-mile', consignments: 'last-mile' }

/** `?tab=` → a tab; an unknown value reads as All */
export const parseTab = (raw: string | null): TabKey =>
  raw === 'first-mile' || raw === 'last-mile' ? raw : (raw && TAB_ALIASES[raw]) || 'all'

/** First Mile's Group by — "Pickup request" is the default (the old Pickups tab) */
export const GROUP_BY = [
  { key: 'none', label: 'None' },
  { key: 'pr', label: 'Pickup request' },
] as const
export type GroupBy = typeof GROUP_BY[number]['key']
export const parseGroup = (raw: string | null): GroupBy => (raw === 'none' ? 'none' : 'pr')

/** Which rows a tab lists. The consignment split follows the Active Leg column. */
export function inTab(tab: TabKey, group: GroupBy, r: UnifiedRow): boolean {
  const pickup = isPickupRow(r)
  /* owner, 2026-09-25: on All, the first mile IS the pickup request — a
     first-mile consignment never gets a row of its own there (it rides on its
     request); All = pickup requests + the Last Mile tab's consignments */
  if (tab === 'all') return pickup || r.activeLeg !== 'First Mile'
  if (tab === 'first-mile') return group === 'pr' ? pickup : !pickup && r.activeLeg === 'First Mile'
  return !pickup && r.activeLeg !== 'First Mile'
}

/** which column set the table renders */
export type ColumnView = 'consignment' | 'firstMileConsignment' | 'pickup' | 'common'

export function viewOf(tab: TabKey, group: GroupBy): ColumnView {
  if (tab === 'all') return 'common'
  if (tab === 'last-mile') return 'consignment'
  return group === 'pr' ? 'pickup' : 'firstMileConsignment'
}

/* -------------------------------------------------------- the Type filter --- */

/**
 * The Type filter's vocabulary (owner, 2026-09-25): a consignment is
 * "Consignment"; a pickup request reads exactly as the pickup grid's Type
 * column (`prModel.prTypeLabel`) — LTL · FTL · LTL blind · FTL blind.
 */
export const TYPE_OPTIONS = ['Consignment', 'LTL', 'FTL', 'LTL blind', 'FTL blind'] as const
export const typeKeyOf = (r: UnifiedRow): string =>
  (isPickupRow(r) ? prTypeLabel(r.request) : 'Consignment')

/* ------------------------------------------------------------ the columns --- */

const onPage = (key: string): StagingColumn => {
  const c = COLUMNS.find((x) => x.key === key)
  if (!c) throw new Error(`PFP column ${key} is not on the page`)
  return c
}
/** a measured staging width, including columns this page no longer shows (Order Type) */
const measured = (key: string): number =>
  T.table.columns.find((c) => c.key === key)?.width ?? onPage('state').width
const prWidth = (key: string): number => {
  const d = PR_COLUMN_DEFS.find((x) => x.key === key)
  if (!d) throw new Error(`PR column ${key} is not defined`)
  return d.width
}

const SELECT = onPage('_select')
const PAD = onPage('_pad')
const LEG = onPage('activeLeg')

/**
 * Consignment rows on the First Mile (Group by None) and Last Mile tabs carry
 * EXACTLY staging's grid (owner, 2026-09-25, "need them only"): the measured
 * columns in the measured order, Order Type back in its measured place, VAS
 * after SKU, no Active Leg and no Pickup Request column. VAS is the one column
 * the capture did not include; it takes the measured width of its neighbour
 * class (Tag, 160) — logged in pixel-diff-log.md.
 */
export const CONSIGNMENT_TAB_KEYS = [
  'orderNumber', 'referenceNumber', 'shipByDate', 'state', 'carrier', 'secondaryState',
  'dispatchDate', 'weight', 'volume', 'palletSpaces', 'sku', 'vas', 'serviceTime', 'tag',
  'specialInstructions', 'merchant', 'orderType', 'ageing', 'address',
] as const
const VAS: StagingColumn = { key: 'vas', label: 'VAS', width: measured('tag') }
export const CONSIGNMENT_TAB_COLUMNS: StagingColumn[] = [
  SELECT,
  onPage('_flags'),
  ...CONSIGNMENT_TAB_KEYS.map((k): StagingColumn => {
    if (k === 'vas') return VAS
    const c = T.table.columns.find((x) => x.key === k)
    if (!c) throw new Error(`PFP measured column ${k} is missing`)
    return c
  }),
  PAD,
]

const prKey = (k: string) => `pr:${k}`
const PR_DEFS = PR_COLUMN_DEFS.filter((d) => d.defaultOn)

/** First Mile / Pickup request: the `/local/pickup` grid. No Active Leg — the
    tab already says the leg (owner, 2026-09-25; Active Leg is All-only). */
export const PR_VIEW_COLUMNS: StagingColumn[] = [
  SELECT,
  ...PR_DEFS.map((d) => ({ key: prKey(d.key), label: d.label, width: d.width })),
  PAD,
]

/** All: what a consignment row and a pickup-request row both carry */
export const COMMON_COLUMNS: StagingColumn[] = [
  SELECT,
  { key: 'c:ref', label: 'Reference', width: measured('referenceNumber') },
  { key: 'c:type', label: 'Type', width: measured('orderType') },
  LEG,
  onPage('state'),
  onPage('secondaryState'),
  onPage('merchant'),
  { key: 'c:weight', label: 'Weight', width: onPage('weight').width },
  { key: 'c:date', label: 'Ship By / Pickup Start', width: onPage('shipByDate').width },
  { key: 'c:dest', label: 'Destination', width: prWidth('hub') },
  { key: 'c:collector', label: 'Carrier / Driver', width: onPage('carrier').width },
  { key: 'c:trip', label: 'Trip', width: prWidth('trip') },
  onPage('ageing'),
  PAD,
]

/** the measured capture, every column — the reference the scroll width was measured on */
export const MEASURED_COLUMNS: StagingColumn[] = T.table.columns

export const widthOf = (cols: StagingColumn[]): number => cols.reduce((n, c) => n + c.width, 0)

/** the cell that opens the row, per column set */
export const LINK_COLUMNS = new Set(['orderNumber', prKey('reference'), 'c:ref'])
/** the cells drawn as the state pill */
export const PILL_COLUMNS = new Set(['state', prKey('status')])

/* -------------------------------------------------------------- the cells --- */

export interface ExtraCtx extends PrColumnCtx {
  prById: Map<string, GrowPickupRequest>
}

/**
 * The cells the non-staging column sets read, added to a row's staging cells.
 * `base` = those staging cells (the weight and date strings are reused so the
 * two views can never format a row differently).
 */
export function extraCells(r: UnifiedRow, base: Record<string, string>, ctx: ExtraCtx): {
  cells: Record<string, string>; titles: Record<string, string>
} {
  const cells: Record<string, string> = {
    'c:weight': base.weight, 'c:date': base.shipByDate,
  }
  const titles: Record<string, string> = {}
  if (isPickupRow(r)) {
    const p = r.request
    for (const d of PR_DEFS) {
      cells[prKey(d.key)] = d.value(p, ctx) || '-'
      const t = d.title?.(p, ctx)
      if (t) titles[prKey(d.key)] = t
    }
    cells['c:ref'] = r.reference
    cells['c:type'] = 'Pickup request'
    cells['c:dest'] = r.shipToName
    cells['c:collector'] = p.driverName || p.carrierName || '-'
    cells['c:trip'] = p.tripId || '-'
  } else {
    const pr = r.order.pickupRequestId ? ctx.prById.get(r.order.pickupRequestId) : undefined
    cells['c:ref'] = r.referenceNumber
    cells['c:type'] = 'Consignment'
    cells['c:dest'] = r.destination || '-'
    cells['c:collector'] = r.assignedDriver || r.carrier || '-'
    /* a queued consignment is never on a delivery trip (a routed one leaves the
       queue) — the trip it can be on is its pickup request's collection trip */
    cells['c:trip'] = pr?.tripId || '-'
    cells.vas = (r.order.additionalServices ?? []).join(', ') || '-'
  }
  return { cells, titles }
}
