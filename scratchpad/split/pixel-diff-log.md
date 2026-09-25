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

## 2026-09-24 — Type column removed (owner)

The measured `orderType` column no longer renders on either look of Pending for Planning: the owner removed it from the page. The row kind is told by the tinted pickup rows and the Consignments · Pickups · All tabs. `stagingTokens.COLUMNS` filters it out; the measured capture is unchanged.

## 2026-09-24 — Active Leg column added (owner)

An `activeLeg` column (First Mile · Mid Mile · Last Mile) now renders right after Secondary State on both looks of Pending for Planning. It is an ADDITION to the measured capture (`stagingTokens.COLUMNS` inserts it); a pickup request row reads First Mile.

## 2026-09-25 — Tabs renamed; per-tab column sets (owner)

Tabs are now **First Mile · Last Mile · All** (`?tab=first-mile|last-mile`, All = no param; the old
`pickups` / `consignments` slugs still resolve). Rows: First Mile = pickup requests (Group by
Pickup request, default) or the consignments whose Active Leg is First Mile (Group by None,
`?group=none`); Last Mile = consignments whose Active Leg is not First Mile; All = everything.
Module off = no tabs, every consignment, the measured grid (unchanged).

Column sets (`src/pages/LocalPFP/viewColumns.ts`), all ADDITIONS except Last Mile's:
- **Active Leg is All-only** (owner correction, same day): the First Mile / Last Mile tabs already
  say the leg. It stays on the module-off page (no tabs).
- **Last Mile** — the measured staging set minus Active Leg; scroll width = 3352 − 120.
- **First Mile / Pickup request** — the `/local/pickup` grid (`PR_COLUMN_DEFS` default set). Widths
  are the PR defs' own: these are not staging columns, so staging has no measurement for them.
  Table width = the sum of the columns.
- **First Mile / None** — the Last Mile set + a Pickup Request column after Secondary State
  (width = the measured 160 of Secondary State); scroll width = 3352 − 120 + 160.
- **All** — Reference · Type · Active Leg · State · Secondary State · Merchant · Weight · Ship By /
  Pickup Start · Destination · Carrier / Driver · Trip · Ageing (days). Widths are measured
  staging widths (Reference Number, Order Type, State, …) or PR-def widths (Destination Hub, Trip).
  **Type = the row kind only** (Consignment / Pickup Request) — no `Forward · FM → MM → LM` line;
  the funnel's Order Type is Forward / Reverse only. The leg is Active Leg's job.
- Cells keep the PFP styling: single line, `.pfp-order` link on the identity cell, `.pfp-pill` on
  State / Status. No new colour, px or icon.
- **Group by** select (`.pfp-select`, width = measured `roles.stateSelect.width`): on the replica's
  filter row; on the current look it sits on the right of the tab strip (`LocalTabs` `right`
  slot) because that filter line is already full and a 200px select there pushed the icons off.

## 2026-09-25 — Pickup overlay: booked orders open their consignment (owner)

On `/local/pending-for-planning/pickup/:prId` → Orders, each booked (and "collected here only")
order number is a `.pfp-order` button (ArrowRight + number, the order-number column's glyph) that
pushes `/local/pending-for-planning/:id` with `state.fromPickup`, so browser Back and the
consignment overlay's Close both return to the request. One new rule in pfpChrome.css:
`.pfp-orderlist .pfp-order:hover { color: var(--pfp-brand) }` — token only.

## 2026-09-25 — All tab rows (owner)

All = pickup-request rows (the first mile) + the Last Mile tab's consignments; first-mile
consignments no longer get their own row there (they are listed only under First Mile → Group
by None). All's count, Type filter options, chips and funnel options derive from that row set.


## 2026-09-25 — Tab strip → table gap with the chip strip hidden

The Carriers / Categories strip already unmounts when hidden, but the tab strip kept its 12px
bottom margin, so tab → table read 12 + 24 = 36px. `.pfp > .lc-tabs:has(+ .pfp-tablewrap)` drops
that margin: hidden = tabs 167 → table 191 (24, the measured table margin-top); shown = tabs →
strip 24, strip → table 24 (unchanged). No new value.

## 2026-09-25 — Consignment rows: staging's exact grid + selection bar (owner, "need them only")

- **Columns** (First Mile / Group by None and Last Mile): `viewColumns.CONSIGNMENT_TAB_COLUMNS` =
  the measured capture in measured order (Order Type back at its measured place; it reads
  Forward / Reverse again) + **VAS** after SKU. VAS was not in the capture: width = the measured
  Tag width (160). No Active Leg, no Pickup Request column. Scroll width = 3352 − 48 (flags) + 160
  (VAS) = 3464. `/local/columns` offers only these 19 while the pickup tabs are on (all default on).
  The All tab's Type column moved to its own key (`c:type`) so it no longer collides.
- **Selection bar** (consignment-only selection): n Selected · Weight (Kg) · Volume mm³ · Pallet
  Space, then Modify Order Details · Schedule · Initiate Return to Origin · Modify Carrier · Modify
  Storage Location · Assign To Driver · Add To Best Route (n) · Plan For Routing (n) · Mark Ready for
  Planning · Close Consignment · Download CSV · Raise Exception · Cancel Order. Modify Order
  Details / Modify Carrier / Modify Storage Location / Assign To Driver / Add To Best Route have no
  local implementation → "Not available in the prototype." toast. Icons are all from `icons.tsx`.
- **Mixed selection** (All tab): only Plan For Routing (n) · Download CSV · Cancel (Cancel = cancel
  the consignments + call off the pickups, one reason code).

## 2026-09-25 — Pickup-request menu shared with /local/pickup; queue = needs-planning only (owner)

- A pickups-only selection shows the Pickup page's 16 items (`LocalPickup/prSelectionItems.ts`,
  gated by `prBulkState`; the reason is printed under a disabled item) in the replica's
  `.pfp-panel-action` rows with glyphs from `icons.tsx`; the list scrolls in the measured panel.
  The four replica pickup actions (and Send to Load Planning, which is not in that menu) are gone;
  the dialogs are the Pickup page's (`prSelectionActions.tsx`). "Plan collection for routing" is
  now **Plan pickup request for routing** everywhere (Pickup grid, PFP, AddToRouteDialog tab).
- Rows: pickup requests only while Requested with no trip and no 3PL carrier (`isPendingPickup`);
  consignments only while Created · Ready To Ship · Pickup Requested with neither their request on
  a trip nor a delivery stop on one. Lists stay flat (no new grouping dimension).

## 2026-09-25 — Filter line per tab row kind (owner, pickup module manual)

- **First Mile (pickup-request rows):** date range on the pickup WINDOW (overlap) · Status
  (`prModel.STATUS_FILTER_OPTIONS`, multi, the State popover's grammar) · Merchant · funnel: Type
  (LTL · FTL · LTL blind · FTL blind), Pickup Address, Destination Hub, Source. Search = PR number /
  pickup address. No chips strip, no Quick Filter. Group by None → the consignment line.
- **Last Mile (consignment rows):** date on Ship By · State/Secondary State · Merchant · Order Type
  (Forward / Reverse, moved out of the funnel) · funnel (staging's dims) · chips + Quick Filter.
- **All:** date (Ship By / Pickup Start) · Merchant · Type (Consignment · LTL · FTL · LTL blind ·
  FTL blind) · funnel: Destination · search. No chips strip.
- Switching to a tab of another row kind resets every filter but Merchant + search. Tab counts:
  the open tab = its filtered rows; the others = their rows under Merchant + search.
- Controls reuse `.pfp-select` / the State popover at `roles.stateSelect.width`; no new value.
  Module off = unchanged (consignment line).
