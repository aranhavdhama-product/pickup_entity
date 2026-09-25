/**
 * Typed access to `stagingTokens.json` — the EXTRACTED staging measurements.
 *
 * Nothing in this module invents a value. If a number here looks wrong, the fix
 * is to re-run the extraction against staging and replace the JSON, never to
 * edit a literal (see the CLAUDE.md exception paragraph for this route).
 */
import tokens from './stagingTokens.json'

export interface StagingColumn {
  key: string
  label: string
  width: number
}

export const T = tokens

export const COLOR = tokens.color
export const LAYOUT = tokens.layout
export const ROLE = tokens.roles
/**
 * DELIBERATE DEVIATION from the measured capture (history): the `orderType`
 * column was first relabelled **Type** and moved forward to sit after Reference
 * Number; on 2026-09-24 the owner removed it from the page entirely (see COLUMNS).
 *
 * Staging's list holds one kind of thing, so "Order Type" (Forward / Reverse)
 * sitting at column 17 was enough. This list holds four — consignments plus
 * three kinds of pickup request — and the first question a reader has about any
 * row is which kind it is. A column that answers that at position 17, past the
 * right edge of an 1152px viewport, does not answer it at all.
 *
 * Only the position and the label change. The width (160px) and every other
 * column are untouched, so the grid's total width and horizontal rhythm are
 * exactly what was measured. The raw capture in `stagingTokens.json` is left
 * pristine — it is the pixel-diff reference and must keep saying what staging
 * actually does.
 */
/**
 * SECOND DELIBERATE DEVIATION: the `_flags` icon column is narrowed from its
 * measured 160px to 112px.
 *
 * 160px was never enough anyway — five 28px discs and their gaps need 188px, so
 * a fully-flagged row clipped silently. The cell now shows at most three items
 * (two discs and a `+n` when there are more), which makes its width independent
 * of the flag count: 3 x 28 + 2 x 4 gaps + 16 padding = 108, inside 112. So the
 * column both loses 48px and stops dropping flags.
 *
 * 48px matters here because this viewport is 1152px wide and the grid already
 * scrolls; every pixel this column does not need is one the columns that carry
 * text get back.
 */
const FLAGS_WIDTH = 112

const MEASURED: StagingColumn[] = tokens.table.columns.map((c) =>
  (c.key === '_flags' ? { ...c, width: FLAGS_WIDTH } : c))

/* Owner, 2026-09-24: the Type column is REMOVED from the page altogether (the
   row kind is already told by the tinted pickup row and the Consignments /
   Pickups tabs). The measured `orderType` column therefore never renders on
   either look — a second deliberate deviation, logged in pixel-diff-log.md. */
export const COLUMNS: StagingColumn[] = (() => {
  const base = MEASURED.filter((c) => c.key !== 'orderType')
  /* owner, 2026-09-24: ACTIVE LEG (First Mile · Last Mile) is a column
     of this page too — an addition to the measured capture, placed right after
     Secondary State like the Consignment Order grid; logged in pixel-diff-log.md */
  const at = base.findIndex((c) => c.key === 'secondaryState')
  const leg: StagingColumn = { key: 'activeLeg', label: 'Active Leg', width: 120 }
  return at < 0 ? [...base, leg] : [...base.slice(0, at + 1), leg, ...base.slice(at + 1)]
})()
export const FUNNEL_FILTERS: string[] = tokens.funnelFilters

/** the 20 data columns — i.e. everything but the checkbox and the 8px tail */
export const DATA_COLUMNS: StagingColumn[] = COLUMNS.filter(
  (c) => c.key !== '_select' && c.key !== '_pad')

/** total scroll width of the grid, straight from the measurement */
export const TABLE_SCROLL_WIDTH = tokens.table.scrollWidth
export const HEADER_ROW_HEIGHT = tokens.table.headerRowHeight
export const BODY_ROW_HEIGHT = tokens.table.bodyRowHeight

/**
 * The extracted palette and metrics as CSS custom properties, applied once on
 * the page root. Every rule in `pfpChrome.css` reads these — so a re-extraction
 * changes the JSON and nothing else.
 */
export const cssVars: React.CSSProperties = {
  '--pfp-canvas': COLOR.canvas,
  '--pfp-surface': COLOR.surface,
  '--pfp-ink': COLOR.ink,
  '--pfp-ink-body': COLOR.inkBody,
  '--pfp-ink-muted': COLOR.inkMuted,
  '--pfp-ink-hint': COLOR.inkHint,
  '--pfp-brand': COLOR.brand,
  '--pfp-brand-tint': COLOR.brandTint,
  '--pfp-line': COLOR.line,
  '--pfp-line-table': COLOR.lineTable,
  '--pfp-line-picker': COLOR.linePicker,
  '--pfp-icon-muted': COLOR.iconMuted,
  '--pfp-pill-info-bg': COLOR.pillInfoBg,
  '--pfp-pill-info-border': COLOR.pillInfoBorder,
  '--pfp-row-h': `${BODY_ROW_HEIGHT}px`,
  '--pfp-head-h': `${HEADER_ROW_HEIGHT}px`,
  '--pfp-pad-x': `${LAYOUT.pagePaddingX}px`,
  '--pfp-pad-y': `${LAYOUT.pagePaddingY}px`,
  /* staging's filter-row gap, DERIVED from two measured rects (the state
     select starts 12px after the date range ends) — used by the replica */
  '--pfp-filter-gap': `${ROLE.stateSelect.rect[0] - (ROLE.dateRange.rect[0] + ROLE.dateRange.width)}px`,
} as React.CSSProperties
