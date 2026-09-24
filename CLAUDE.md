# fareye-ui

React + TypeScript + Vite prototype of the FarEye delivery-operations console.

## Two apps, one build — `src/routes.tsx`

The URL surface is split, and `src/routes.tsx` is the only place that describes it:

- `/` — the app chooser. No provider, no request.
- `/local/*` — the LOCAL app (`src/local/LocalLayout`): **Pending For Planning**
  (`src/pages/LocalPFP`, `+/:id` detail overlay), the **Pickup** demo
  (`src/pages/LocalPickup`, on the untouched `src/pickup` store) and **Column
  configuration** (`/local/columns`). Mounted OUTSIDE the auth provider, so it
  mounts no session probe and issues no `/staging` request.
  **Invariant: nothing under `src/local`, `src/pages/LocalPFP` or
  `src/pages/LocalPickup` may import from `src/auth`.**
- `/console/*` — the staging-backed console, inside `routes/AuthShell.tsx` (which
  is `AuthProvider` as a layout route) and, below `/console/login`, inside
  `RequireAuth`. The prefix is `/console`, NOT `/staging`: the dev proxy forwards
  `/staging/*` upstream, so a document load there leaves the app.
- `/grow/*`, `/driver`, `/phone-demo` — standalone demo shells, unchanged.

Every pre-split URL still resolves in ONE hop via `routes/LegacyRedirect.tsx`
(exact paths before prefixes — `pending-planning` is a prefix of
`pending-planning-local` and the two now land in different apps).

## Design system — single source of truth

**All UI must follow [`design.md`](./design.md)** — the FarEye Nueva design system
(reverse-engineered from the *FarEye Nueva Design System* reference + the staging
console). Before building or restyling any page, read `design.md` and use its tokens
and component specs. Key points:

- **Font:** Lato (300/400/700/900; no 500/600 — medium/semibold → 700).
- **Accent:** a single brand orange (`--color-brand-500` `#F26C2E`); 50/100 for tints.
- **Neutrals:** warm gray ramp; warm off-white app background `#F7F6F3`.
- **Radii:** 6px (buttons/inputs/cards), 12px (overlays), pill (status chips).
- **Status:** soft-tinted pills (success/info/warning/danger/neutral) — never full-saturation in rows.

Design tokens live in `src/index.css` under `@theme` (Tailwind v4): `brand-*`, `warm-*`,
`canvas`, `surface`, `line`, `ink`/`ink-2`/`ink-3`, and `*-bg`/`*-fg` status pairs.

## FarEye Nueva module — `src/nueva/`

A 1:1 replica of the staging **Custom Settings** area, routed under `/console/settings`.
Beyond Masters, every sub-nav item is a live page hooked to real staging APIs
(via the `/staging` Vite proxy; endpoints in `FAREYE-APIS.md` + `FAREYE-SETTINGS-APIS.md`):

- `settingsApi.ts` — data layer (moduleSettings fetch/save, users, RBAC, account).
- `BaseModules.tsx` — Base Modules toggles (`/console/settings/base-modules`); static 7-module
  list mirroring the staging bundle, absent-row = off, POST-create/PUT-update.
- `ModuleDetail.tsx` — per-module settings pages (`/console/settings/base-modules/:code`):
  bespoke OPS Dashboard + Geo Coding, shared 4-tab columns/filters page, generic editor.
- `UsersManagement.tsx`, `RolesPermissions.tsx` — Platform pages (live users + RBAC).
- `ModuleSettingsGroup.tsx` — reusable page for moduleSettings-code groups
  (Pilot Driver/X-Dock, Notify, Engage, Return, Service Time) + `GROUP_PAGES` config.
- `settingsPages.tsx` — Incident Management, Data Validation, Number Generation,
  Label Template, Ship Common, Carrier Allocation, Control Tower, Integrations, Webhooks.
- `toast.tsx` — top-center toast system (`toast.success/error/info` + `<ToastHost/>`).
- `SkuMaster.tsx`, `LiveMaster.tsx` + `liveMasterConfigs.tsx` — LIVE masters on the
  real master service (`POST /master/api/v1/<entity>/fetch`, POST/PUT `<entity>`,
  array bodies, `code` required). Routes intercept `/console/settings/masters/...` ahead of
  the generic sample-data page (see App.tsx). Pattern for every master: consignment-
  style toolbar (filters left, search+icons right), row-click opens a FULL-PAGE
  add/edit form, bulk CSV download/upload. New live masters = add a config, not a page.
- `settingsSearch.ts` — deep search index behind the Settings sub-nav search.
  **Rule: every settings surface added to the app must be findable here** — Masters
  entries derive automatically from `mastersTree.ts`; anything else (module detail
  pages, new settings pages) must be registered explicitly.

**Do not restyle the Masters pages** (`pages.tsx`, `MasterForm.tsx`, `mastersTree.ts`)
— their UI is the reference handed to the FarEye developers.

### Masters replica (original scope):

- `components.tsx` — design-system primitives (Button, Input, Select, Toggle, Checkbox,
  StatusPill, DataTable, Modal, WizardSteps, FilterBar, Pagination, ListCard, Field, EmptyState).
- `mastersTree.ts` — full data-driven config: 5 categories, 19 sub-masters, columns,
  filters, sample rows, form schemas, and the 3-step My Network wizard.
- `CustomSettings.tsx` — app shell (FarEye left sidebar + Custom Settings sub-nav + header).
- `MasterForm.tsx` — renders Add/Edit forms (modal & full-page), mode toggles,
  address blocks, operating-hours grid.
- `pages.tsx` — Masters landing, category list, and the sub-master page (data table or wizard).

Routes: `/console/settings/masters`, `/console/settings/masters/:catId`, `/console/settings/masters/:catId/:subId`.

## Grow merchant portal — `src/pages/GrowOrders/` + `src/growOrders/`

The Grow *merchant* portal (tenant 2GO_PH, modelled on grow-staging.fareye.co) at `/grow/orders`,
`/grow/orders/add`, `/grow/orders/checkout`, `/grow/orders/:id`, `/grow/orders/pickups[/:id]`.
**Rule (owner, spec §15): ONE component set for both portals.** Grow is built from the SAME
components as the consignment portal so the two read as one product: shell =
`src/local/shell.tsx` (`ShellSidebar` + `ShellHeader`, the rail/title bar `LocalSidebar` /
`LocalHeader` also render — white 256px rail with the FarEye mark, canvas title bar, the
merchant switcher ⇄ on the right); list pages = `src/local/chrome.tsx` (`LocalPage`,
`FilterLine`, `DateRange`, `FilterSelect`, `FilterMultiSelect`, `FunnelFilters`,
`ClearFilters`, `SearchBox`, `IconBtn`, `ColumnChooser`, `LocalTabs`) + Nueva `DataTable` /
`Pagination` / `PageSize` / `StatusPill` (tones via `stateTone` / `prModel.PR_STATUS_TONE`);
forms = Nueva inputs in the console SectionCard grid; dialogs = Nueva `Modal`; toasts =
`nueva/toast`. Tokens = design.md (brand orange) — the `--color-grow-*` Materio tokens are
removed from `src/index.css` and `GrowOrders/ui.tsx` is RETIRED (nothing imports it; delete
it, never import it again). Grow keeps its routes, stores and behaviour; only rendering changed.
Non-component helpers live in `utils.ts` (window spans, overdue/duplicate selectors,
`groupForPickup`); data is the local `src/growOrders` store (types/seed/store/tabs/draft/hubs,
localStorage key `fareye-grow-orders-v16`, every persisted record is normalized on load — bump
the key when a required field is added). `hubs.ts` holds `INBOUND_HUBS` + `inboundHubFor()`:
every parcel order carries an `inboundHubCode` derived from its receiver. The seed is ~80 demo
orders / ~30 pickup requests, built from deterministic index math (never `Math.random`), PLUS
150 LIVE consignments pulled from staging (`src/growOrders/stagingConsignments.ts` — company
20106 Chicago network, generated 2026-09-24 through `POST /staging/sbs/graphql`; regenerate,
never hand-edit; their stores and the ORD/CHICAGO hubs ride along), so a reload shows the same
data. Runs with no session.

Product changes layered on the replica (deliberate departures from the live portal):
- **Consignment Order page** (`/grow/orders`, nav "Shipments") — the `/local/consignments`
  page's grammar and vocabulary (spec §12): `FilterLine` (date range · State/Secondary State
  grouped `FilterMultiSelect` · Origin `FilterSelect` · funnel: Facility, Type, Carrier, Service
  Type, Exception, Tag · Clear Filters; right: search · ⚙ `ColumnChooser` · download) → the
  console's six `LocalTabs` below it with counts (`?tab=` slug; error → Data Validation Issues,
  Undelivered → Exception, reverse/RTO → Returns, Delivered/Cancelled → Closed, rest → Active,
  All = no error; DRAFTS always Active; unknown slugs → Active) with **Add ▾** (Add consignment /
  Add FTL consignment) + upload `IconButton` on the strip's right → `DataTable` with
  `selectionActions` (Modify Shipment Details · Schedule Pickup → `BookPickupDialog` · Initiate
  RTO · Print Label · Download CSV · Cancel Shipment) → Pagination/PageSize. Rows =
  `shipmentRows.ts` (`toConsignmentRow` + the console planning overlay; drafts = State `Draft` /
  Secondary `Save for later`); columns = `shipmentTable.tsx` `useShipmentColumns` (persisted
  `grow-shipments-columns-v2`; empty columns hidden). Row click → drawer `?order=<id>` in the
  console drawer's markup (Details · SKU / Package · Tracking · Notes; Resume for drafts).
- **Pickup Requests page** (`/grow/orders/pickups`) — same grammar, NO tabs; old `?tab=` slugs
  become filter presets. Filter line: pickup-window range · Status `FilterMultiSelect` · funnel
  (Pickup Address, Exception, Type, Carrier/Driver, Source, Reserved) · Clear Filters; right:
  search · "Eligible (n)" toggle (swaps in the shipments columns, `grow-eligible-columns-v2`,
  with Schedule Pickup) · ⚙ · **Add** (Create Pickup Request dialog). Columns
  (`pickupRequestColumns.tsx`, formatting from `LocalPickup/prModel.ts`, persisted
  `grow-pickup-columns-v1`) = the `/local/pickup` grid minus Merchant: Reference · Status ·
  Exception · Pickup window · Pickup address → hub · Shipments · Weight · Driver / Carrier ·
  Trip; `PrStatusChip` / `PrExecutionLine` (`pickupRequestTable.tsx`) are the one status
  rendering. Row click opens the request page. Also kept: `PR-000123` references, weight/qty
  summed from linked orders, Overdue + Duplicate markers, detail page with status history,
  Reschedule / Cancel / Print Consolidated Label, a dev
  "Simulate next step" through Requested → Planned → Ready For Last Mile Dispatch → Assigned → Out For Pickup → Completed (derived `Partially picked`; side exits Pickup Failed / Cancelled).
  Pickup windows are two datetimes and may run overnight or
  across days (≤ 7): multi-day rows render two lines + an `overnight` / `n days` tag, Overdue
  is measured on the window's END, and Duplicate = same pickup point + overlapping intervals.
  **`Create Pickup Request`** books a courier slot before the orders exist and shows a
  `Reserved` chip (the record's internal flag is still `blind`).
- **Pickup reconciliation** (`Completed` / `Pickup Failed` requests): `pickedOrderIds` +
  `overages` on the request and `pickedInRequestId` on the order record what the driver
  ACTUALLY collected. The detail page swaps its Orders card for **Pickup outcome**
  (Picked · Not picked · Overage scans), the grid's Status chip is outcome-aware
  (`Partially picked`, `+n` overage badge, also a Status-filter option), and an overage
  scan's `Create order` runs the stepper with `?fromOverage=<prId>:<overageId>` →
  checkout creates the order Picked Up on that request and resolves the scan.
  **A pickup request with no orders and no overage scans can never reach `Completed`** —
  `advancePickupRequest` / `completePickupRequest` turn that transition into
  `Pickup Failed` with the note `No orders to collect`.
- **Create Order** has a `Parcel (LTL) | Vehicle (FTL)` tab strip above the (unchanged) 3-step
  stepper; `/grow/orders/add/vehicle` = FTL. FTL step 2 (Vehicle Details) follows the Citylink
  tenant's live step (2026-09-23): a required **Service Type** first (`FTL_SERVICE_TYPES` in
  `draft.ts` — the owner's 11: Inland LTL/FTL/Crossdocking, Sea LCL/FCL, RORO FTL/LTL, Rolling
  Cargo, Air Freight LCL, CEP Inland, Hustling), which decides the **Vehicle Type** catalogue;
  then a LIST of vehicles (`FtlVehicle` — type, actual load, `addressIdx` = which of the step-1
  delivery addresses it serves; "+ Add vehicle" below the cards). Next is blocked until every
  vehicle has a type, a load and an address and every address has a vehicle. The chosen service
  type becomes the order's `serviceType`; `vehicleType/vehicleUnit/actualLoad` are DERIVED from
  the list and `vehiclesOf()` reads a pre-list record as one vehicle covering every address.
  The blind FTL pickup (`Create Pickup Request`) and the rate calculator ask for the service
  type the same way (`ftlServiceType` on the request). Vehicle specs and rates are ESTIMATED.
- **Masters, live** (`src/growOrders/masters.ts`): the form reads the FarEye Location
  (`businessUnitLocation`), Package (`packageType`), SKU (`sku`) and Merchant (`businessUnit`)
  masters through the `/staging` proxy — the proxy injects the cookie server-side, so `/grow`
  still imports nothing from `src/auth`. Live-first → `grow-masters-cache-v2` → samples; the
  header ⇄ switcher is the "signed-in merchant" (`grow-merchant`). Pickup dropdown =
  merchant's registered address → its Location Master rows → user-saved stores →
  `Other address…` (`pickupLocations.ts`); seed hubs only on sample data. Package presets fall
  back to the company list when the merchant owns none (on staging all belong to one merchant).
- **Create Order form language** (`AddOrderPage.tsx`): *form fields in forms, columns in
  tables*. Entry = 56px floating-label `OutlinedField` in aligned grids; lists = tables with
  12px uppercase headers whose cells are `variant="ghost"` fields. Every dropdown is the
  custom listbox in `ui.tsx` (no native `<select>`); focus colour is coral `grow-accent-2`.
  Type scale is exactly 12/13/15/17/24. A package = Cargo Type + Package Type + No. of
  packages + weight (derived from tare + items until typed over) + L/W/H + an items table
  where "+ Add item" appends a line whose name cell is the SKU autocomplete; "+ Add package"
  sits below the cards. `Parcel.quantity` = packages of this spec, `ParcelItem.quantity` =
  units per package.
`?step=1|2` (+`&type=FTL`) on Create Order deep-links into a step with sample parties (QA
shortcut). Never reintroduce a Grow-only look: new Grow UI uses the shared console components.

## First-mile pickup program — `/local/*` + `/driver` (2026-09-23)

Design spec: `docs/superpowers/specs/2026-09-23-first-mile-pickup-program-design.md`
(§6 = end-to-end case matrix, §9 = owner clarifications + 25-scenario audit list); plain
brief: `docs/superpowers/specs/2026-09-24-pickup-brief.md`; research:
`docs/superpowers/research/2026-09-23-first-mile-pickup-research.md`. Deck (Artifact):
https://claude.ai/artifact/2qL583jFXC9jmimuBnWDsT.

**One store for the local console + driver app: `src/growOrders` (orders, pickup requests,
hub overages) + `src/pages/LocalPFP/planningStore.ts` (trips = routes; key
`pfp-local-planning-v4`; the two keys are bumped together).** `src/pickup` (Store A) is legacy — only the console
`/console/order-management/pickup-request/*` demo still reads it; nothing new may import it.
Dependency is one-way: planningStore imports growOrders/store, never the reverse; cross-store
effects (a cancelled/rescheduled PR leaving its trip) flow through `onPickupRequestDetached`.

- `GrowPickupRequest` carries execution (`tripId`, `driverName`, carrier fields, `attempt` /
  `maxAttempts`, `failureReason` / `cancelReason`, `parentPrId` / `reattemptPrId`,
  `manualOverride`, `source`) and `handover` (mode driver|hub|both, `driverScanned`,
  `hubScanned`, `scanLog`, `arrivedAtHubAt`, `closedAt`, `pod`). Statuses are unchanged;
  `tabs.ts` derives Handed Over / In transit to hub / Discrepancy / Overdue / Re-attempt.
  `LOCAL_PR_TABS` = All · Eligible for Pickup · Active · Closed · Exception — always pass
  `pickupRequestById` as the lookup to `localPrTabOf` / `inLocalPrTab`.
- Rules live in the store, not in pages: multi-PR policy (merge on create), same-day
  cutoff (`pickupSlots.ts`), auto re-attempt on failure, "no orders left" → Pickup Failed,
  unpicked released at completion, handover auto-closes when scans reconcile, a forwarded
  misroute may be in-scanned at its own hub. Reason codes: `pickupReasons.ts`.
- Account config = `src/config/pickupModule.ts` (localStorage mirror written by the console
  Base Modules → **Pickup Request** page and the Pilot Driver App → Pickup Module card; the
  local app never calls `/staging`). `enabled:false` hides only the pickup additions.
  **`mode` (owner, 2026-09-24): `manual` (default) = merchants/ops book; `auto` = a request is
  raised the moment a consignment is created on the date `autoPickup` computes
  (`afterState` Created | Label Generated | Ready To Ship = the consignment state that raises it —
  `autoPickupEligible()`; a consignment reaching it LATER is booked from `update()`;
  `userSelectsWindow` + `maxDaysAhead` = the consignment form offers a date + slot under the slot
  rules (`userWindowError()`), stored as the sender's window and honoured by
  `autoPickupWindowFor()` else the fallback rule; in auto mode the settings page asks ONLY
  auto-relevant options — add-to-existing, merchant-cancel and merchant rules are manual-only; `dateRule`
  same-day | next-business-day | days-after-order, `daysAfterOrder`, `slot`, `pickupDays`; `autoPickupWindow()` / `autoPickupSummary()` in `pickupSlots.ts`; the legacy
  `autoCreateOnConsignment` is derived from it). `/local/settings/pickup` shows the module
  toggle, then two selectable mode cards, and the card below switches with the mode (Auto:
  pickup dates; Manual: booking & slots). In auto mode every manual booking control is
  replaced by an "Auto pickup · rule" pill: Schedule Pickup (console + Grow), Book Pickup
  (Grow view), Create Pickup (console Pickup page), Add + Eligible (Grow Pickup Requests).
- Pages: `/local/consignments` (Merchant → Pickup Address filter, bulk **Schedule** →
  `SchedulePickupDialog`, no Create Pickup; **Add** → `/local/consignments/add[/vehicle]` = the
  SAME `AddOrderPage` with `portal="console"`: an Order Category card (4 Person · Stackable ·
  Fragile · VIP · Hazmat · Heavy Weight → `consignment.category`, which then drives the row's
  flags) below VAS, no checkout and no drafts — ops create outright; the Grow form never shows
  that card; **row click** → `/local/consignments/:id` = `ConsignmentView.tsx`, the staging
  View Consignment overlay: 62% right drawer, section rail Summary · Order · Piece · Tracking ·
  SKU · VAS · Load · Attempt · Customer Feedback · Notes, "View Events" widens it and docks an
  Event Logs timeline; every list is DERIVED in `viewModel.ts` from the order, its pickup
  requests, its trips and its notes, since no event/load/attempt service exists locally),
  `/local/pickup` (+ `/:id`, `LocalPickup/*`),
  `/local/pending-for-planning` (tabs All · Consignments · Pickups; Plan Collection routes
  onto trips), `/local/control-tower` (+ `/trips/:id`; `AddToRouteDialog` is shared),
  `/local/inbound` (+ `/scanner`), `/driver` (FarEye Pilot look; login as a seeded driver).
- Invariants: a `Planned`/fleet-`Assigned` PR always has a `tripId`; a PR on a 3PL carrier
  has none and leaves the PFP queue; a PR is never `Planned` without a trip in the seed.
- Seed: exactly one intended Duplicate pair (PR-000112/113); one trip per status; every parcel PR
  drops at ONE inbound hub; vehicle (FTL) orders only on their own FTL PRs; every failure with
  attempts left carries its auto re-attempt (129→140, 136→137). LOCAL sidebar → Demos →
  **Reset demo data** reseeds both stores.

## Engineering rules

**Performance** (why staging felt faster than us on the same APIs):
- All proxied upstreams use a **keep-alive HTTPS agent** in `vite.config.ts`. Without it,
  node opens a fresh TLS connection per request and every API call pays a ~300-500ms
  handshake to staging. Never remove `agent: keepAliveAgent` from a proxy entry.
- In pages: fire independent fetches in **parallel** (`Promise.all`), never in waterfalls;
  fetch once per mount; keep payloads paged (don't pull 1000 rows to show 10).

**The one documented exception — `/local/pending-for-planning`.**
That route (its `:id` detail overlay and its eight popups included) is a PIXEL
REPLICA of staging's `/v2/ses/pending-for-planning`, by the owner's decision. On
this route ONLY, and on no other:
- staging screenshots ARE a layout reference, and its arrangement, spacing, type
  scale, column order and column widths override "layout is ours";
- inline and arbitrary styling is allowed, because the values are measurements;
- every value comes from `src/pages/LocalPFP/stagingTokens.json` (extracted
  `getComputedStyle` + `getBoundingClientRect`), `icons.tsx` (SVG lifted verbatim
  out of the staging DOM) and `pfpChrome.css` (rules that read only those two).
  To change one, RE-EXTRACT — never hand-edit a token, and never add a colour or
  a px literal that is not in the JSON.
- the tree imports no external icon package; `scripts/pfpdiff.py` is the check,
  and `scratchpad/split/pixel-diff-log.md` records what matched, what did not,
  and why.
This is NOT precedent. Every other surface still follows the rule below, and
shared primitives in `nueva/components.tsx` stay additive — the replica may not
bend one to its own shape.

**Design consistency** (one system, no per-page drift):
- **Staging screenshots are a functionality reference, NEVER a layout reference.**
  When a staging screen is shared, extract the data inventory, actions and APIs from
  it — then build the surface with OUR shell, toolbar, tabs and table patterns.
  Copying staging's chrome (wizard headers, banners, filter arrangements, column
  order) is a regression, not fidelity.
- Build UI **only** from the primitives in `src/nueva/components.tsx` (Button, Input,
  Select, MenuSelect, SearchInput, Toggle, Checkbox, StatusPill, Tabs, Accordion,
  MultiSelect, Panel, SimpleTable, LoadingBox, ErrorBox, EmptyState, PageHeader,
  ListCard) plus `nueva/toast.tsx`. If a pattern repeats twice, extract it into
  components.tsx first.
- Dropdowns on forms use **MenuSelect** (custom design-system popover); the plain
  native `Select` stays only where Masters already uses it (Masters UI is frozen).
- Forms show required-ness via asterisk + per-row "Incomplete" chips + a count line —
  never eager "Required field." text on a pristine form. All form sections share the
  SectionCard/RepeatableList chrome and the same 4-column labeled field grid.
- List pages share ONE toolbar/table grammar (see LiveMaster): max 2 filter
  dropdowns visible, every other dimension inside AdvancedFilters (two-pane
  multi-select), the shared ClearFilters control, search (w-52) + icon actions +
  AddUpload on the right; rows have multiselect checkboxes whose selection
  surfaces the bulk actions; row click opens a read-only VIEW page and Edit is
  its own page.
- Page shell is always: `PageHeader` → `Panel`/cards. Card padding `px-5`, body text
  13px, card titles 15px bold, table headers 12px bold `text-ink-3`. Row hover =
  `hover:bg-warm-50`; card hover = border-warm-300 + shadow-ds-1. Element positioning,
  spacing and type scale must not change from page to page.

## Dev

- `npm run dev` — Vite dev server on **port 3000** (strict).
- Surfaces under `/console/settings` and the whole `/local` app use the `fe-nueva` class to apply the Lato font.
