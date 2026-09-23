# Pending For Planning — pixel-diff log

> Recreated 2026-09-23. The original log (from the 2026-09-18 split session) lived
> in that session's scratchpad and could not be located — its entries (baselines
> for `default` and `quickfilter-on` only, 21/21 column widths and both row heights
> matched, 12 of 14 states unverified because staging logged out mid-run) are
> summarised from project memory, not copied. New entries go below.

## Deviations (owner-requested)

### owner-requested: tab strip Consignments|Pickups|All — 2026-09-23 (engineer Q)

- **What:** a tab strip **All · Consignments · Pickups** with counts, above the
  filter row (`?tab=all|consignments|pickups`, default All = the page as before).
  Staging has no such strip. Program spec §3.5.
- **Tokens reused (no new colour, no new px value):**
  - each tab is a `.pfp-chip` — the Carriers-card chip from `roles.chip` in
    `stagingTokens.json`: bg `color.canvas`, `1px solid color.line`, radius 20,
    padding `6px 12px`, gap 4, Lato 16px/20px, ink `rgb(31, 31, 31)`;
  - selected tab = the existing `.pfp-chip[aria-pressed='true']` rule: border
    `color.brand`, bg `color.brandTint`, text `color.brand`;
  - count = the existing `.pfp-chip-count` (700);
  - `.pfp-tabs` container: `gap: 12px` (the filter row's gap) and
    `margin-bottom: 16px` (the page's top padding / card-row gap).
- **Nearest-value substitutions:** a tab strip would normally be an underline
  tab; no underline-tab token exists on this route, so the chip is used as-is.
- **Geometry effect:** every band below the strip moves down by one chip height
  (33.5px per `roles.chip.height`) + 16px. The strip is **not rendered under
  `?fixture=staging`**, so the pfpdiff bands (from `stagingTokens.json`) still
  measure staging's own chrome unchanged.
- **Module disabled** (`usePickupModuleConfig().enabled === false`): the Pickups
  tab is hidden and pickup rows are excluded from All.

### Plan Collection For Routing popup — 2026-09-23 (engineer Q)

- New popup (`PlanCollectionModal`, modals.tsx), built in the existing
  `.pfp-modal` chrome (the Plan For Routing popup's shell + stop table,
  `.pfp-radio-row`, `.pfp-field`, `.pfp-input`). No staging reference exists —
  staging has no pickup routing on this page. Same for `FailPickupModal` and
  `CancelPickupModal` (Cancel Order popup chrome + a reason select).
- ViewPickup gains an **Execution** section (existing `Section` grammar).

### Strip hidden by default + labelled toggle + fit-to-width — 2026-09-23

- OWNER-REQUESTED deviation: the Carriers / Categories strip now starts HIDDEN
  when `pfp-strip-hidden` is unset (a stored '0'/'1' still wins), and the
  `.pfp-collapse` caret is a labelled "Hide cards" / "Show cards" button
  (Quick Filter's padding/gap/type). Staging always shows the strip.
- Fit rules (end of pfpChrome.css): measured widths stay the flex basis, the
  State/Merchant/Type selects, the two 576px cards and the 486px stat strip may
  shrink; Clear Filters / Quick Filter are nowrap. No change at staging's own
  width beyond the toggle label. pfpdiff not re-run (needs staging captures).
- Compact stats (owner request): each readout is one line ("Total Orders 83",
  13px label / 14px bold value), hint on one line with ellipsis + title; row 3
  is 36px instead of 43. Staging stacks label over value.

### One toolbar row, underline tabs, compact chip line — 2026-09-23 (owner override)

- OWNER-REQUESTED OVERRIDE of the replica rule for this page's chrome:
  - Tab strip is the app's nueva `Tabs` (lucide Layers / Package / Truck,
    "All (83)" labels) — the one place the route imports nueva + lucide.
  - Filters + list toolbar merged into ONE row: filters left, then search +
    Exceptions, then icon actions (cards toggle = `GridFour`, Quick Filter =
    `WarningCircle`, both icon-only with tooltips + pressed state; a
    `ListChecks` bulk indicator whose tooltip carries "Select orders for more
    action"; download; table settings). Selection panel opens below the row.
  - Stats moved to the footer beside "20 / Page" as one muted summary line.
  - Carriers / Categories: no cards/titles — one 28px chip line with
    "Carriers:" / "Categories:" labels and a divider, scrolling within itself.
- Staging keeps two rows, chip tabs absent, stacked stats and 107px cards; the
  pixel diff for the filter/strip/toolbar bands is no longer meaningful.

### Owner-finalised chrome shared across local pages — 2026-09-23 (owner, spec §11)

- The PFP tab strip + ONE filter line + chip row is now the chrome of EVERY
  /local page (Shipments, Pickup, Control Tower, Inbound as well as PFP). The
  rules moved out of `pfpChrome.css` into `src/local/chrome.css` (merged to their
  final values; still `pfp-*` class names, colours still the `--pfp-*` tokens
  from `stagingTokens.json`, now set once on the LocalLayout root) and the
  markup into `src/local/chrome.tsx` wrappers that PFP uses too.
- PFP deltas vs the previous entry: the tab strip is `LocalTabs` (brand
  underline in `--pfp-brand` instead of Nueva brand-500, hairline in
  `--pfp-line-table`); the Exceptions dropdown moved INTO the funnel panel as
  its first select, so the three row selects gained its width; the funnel tints
  when a panel filter is set. Tabs at y=81 and the filter row at y=135 are
  unchanged (measured in Chrome at 1440px).
- `?fixture=staging` layout also shifts (no Exceptions on the row). Controls
  stay 32px high — the owner's reference PNG is ~1.3x CSS px, not 44px pills.
- pfpdiff not re-run (needs staging captures).

### Second page: "Pending for Planning (replica)" — 2026-09-23 (engineer Q2, owner)

- **Route:** `/local/pending-for-planning-replica` (+ `/:id`, `/pickup/:prId`
  overlays), sidebar "Pending for Planning *replica*", header "Pending For
  Planning". Same component as the current page (`variant="replica"`, keyed so
  state never carries over); ViewConsignment / ViewPickup take the `basePath`.
  The CURRENT page is unchanged (fixture or not).
- **Chrome:** staging's, rebuilt from the surviving rules in pfpChrome.css —
  row 1 Date · State/Secondary State · Merchant · Type · funnel · Clear Filters ·
  Quick Filter (right); row 2 Carriers + Categories `.pfp-card`s (Quick Filter
  swaps in the exception cards); row 3 `.pfp-toolbar` search · Exceptions (back
  from the funnel; sized from `roles.exceptionsSelect.rect`) · four stacked
  `.pfp-stats` · `.pfp-hint` · download · settings. No lucide on this path.
- **Tabs (owner deviation):** Shipments · Pickups · All as `.pfp-chip` +
  `.pfp-chip-count` (the original strip's tokens) in a re-added `.pfp-tabs`,
  above the filter row; gap = `--pfp-filter-gap`, margin-bottom = `--pfp-pad-x`.
  Hidden under `?fixture=staging`.
- **New derived var:** `--pfp-filter-gap` = stateSelect.x − (dateRange.x +
  width) = 12, in `stagingTokens.ts`. Replica-scoped fit rules: cards
  `flex: 0 1 576px` (2x576+16 > 1152), stat strip may shrink.
- **Measured (Chrome, 1440, `-replica?fixture=staging`):** date 272,81 ✓; cards
  y=135 h=107 ✓ (w 568 vs 576, shrink rule); toolbar search x=272 y=269;
  stats x=665 ✓; hint x=1169 ✓; grid top 331 ✓ (331.8). Residuals: funnel at
  x=1115 (Merchant + Type added, staging 721); Quick Filter 148x31 at x=1276
  (staging 158.4x34 at 1266).
- **pfpdiff:** staging-chrome captures should now be taken on
  `/local/pending-for-planning-replica?fixture=staging` (the current route's
  fixture keeps the current chrome). Script unchanged; not re-run (needs staging).
- Screenshots: `scratchpad/split/pfp-replica.jpg`, `pfp-current.jpg`.

## Verification status

- `scripts/pfpdiff.py` not re-run on 2026-09-23: it needs staging captures in a
  shots dir, and staging needs a live, click-navigated session.
