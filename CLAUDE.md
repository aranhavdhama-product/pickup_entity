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

- **Font:** Lato (300/400/700/900; no 600 — semibold → 700). **Field labels** (owner, 2026-10-05) = the `field-label`
  utility in `src/index.css`: Lato **500** · 14px / 20px · `ink-2` rgb(76, 87, 97) — every label above an input (nueva
  `Field`, both consignment forms, Grow form bits, the date picker, live-master forms). Google's Lato has no 500, so the
  official Lato 2.0 Medium is bundled at `public/fonts/lato-medium.woff2` (SIL OFL) — never drop that `@font-face`.
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

### Masters audit trail — SED-8163 (2026-09-25)

Every master row's Action cluster has a **Logs** (`History`) icon and every master's toolbar a
**Logs** icon beside Export; both open `nueva/AuditTrailSlideOver.tsx` (Nueva `SlideOver`: search ·
Action · User · From / To · Clear Filters, the timeline latest-first with changed fields only,
"Compare all fields" = the full before / after snapshot, PageSize + Pagination, Export CSV). Data =
`nueva/auditTrail.ts`, an APPEND-ONLY localStorage store (`local-masters-audit-v1`, no React, no
fetch, no `src/auth`): `recordAudit()` is the only write; seed history is DERIVED from a master's
sample rows (never stored); "Reset demo data" clears it. Recording lives in ONE place,
`pages.tsx` `MasterTablePanel` (add / edit through the persist → `diffRows`, delete, every status
change, bulk upload via `UploadDataModal`'s additive `onComplete`); the actor is
`MastersEnv.actor` (local app `dms_admin`, console default `console.user`). Additive to the frozen
Masters pages — the icons reuse the existing 28 px action-button style. `?logs=all` / `?logs=<rowId>` on a
master URL opens a trail on load (deep link; used for the Figma captures). Design note:
`docs/superpowers/research/2026-09-25-masters-audit-trail.md`; Figma (code-to-canvas captures of the three
states, 2026-09-25): https://www.figma.com/design/YASssnzV7Da9tBNaAciWQ1.

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
localStorage key `fareye-grow-orders-v17`, every persisted record is normalized on load — bump
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
  `grow-shipments-columns-v3`; empty columns hidden). Row click → `?order=<id>` and `/grow/orders/:id` BOTH
  render `GrowConsignmentView` = the console View Consignment overlay (`LocalConsignments/
  ConsignmentView`) with `audience="merchant"` + `readSections` (owner, 2026-09-25: "only what is
  relevant to them … based on the add consignment form"): staging's ten sections do NOT render;
  the body is the merchant order form read back (`merchantConsignmentSections.tsx`, one scroll,
  rail = anchors with scroll-spy) — Status (state chip · master tracking no. · carrier · pickup
  request link) · Consignment details · Ship From · Ship To (+ Return To Origin) · Packages (package cards
  with their SKUs — HSN, origin, qty) · Value-added services · Service Type (the form's
  `RateCard` + Shipping/Tax/Total; the checkout's frozen `charges`, else "Estimated"; FTL vehicle
  lines). Built from the form's `MSection`/`MGrid`; a field/section with no data is not rendered
  (no "No … available" placeholders); no Load, Attempt, Notes, Customer Feedback, driver, trip,
  hub, routing, carrier-code or category fields. View Events = the milestone-only log
  (`viewModel.merchantEventsOf`, no Ops/Customer toggle). Merchant actions in the header (Book
  Pickup · Resume · Print Label · Cancel Shipment / Discard Draft). `OrderViewPage` is a thin
  host (the list behind the overlay).
- **Pickup Requests page** (`/grow/orders/pickups`) — the console `/local/pickup` tabs (owner,
  2026-09-25): `LocalTabs` **Exception · Active · Closed · All · Eligible consignments**
  (same order, `?tab=` slugs from `tabs.ts`, membership `inLocalPrTab(…, pickupRequestById)`,
  counts `localPrTabCounts` off the unfiltered lists, default Exception; Eligible only in
  manual mode — Grow keeps it, the console Pickup page does not (2026-10-05); pre-tab slugs
  requested/scheduled/out-for-pickup → active, completed → closed, exceptions → exception) with **Add** (Create Pickup Request dialog) on the strip's right. Filter
  line: pickup-window range · Status `FilterMultiSelect` · funnel (Pickup Address, Attention
  Required, Type, Carrier, Reserved) · Clear Filters; right: search · ⚙ · download. Eligible
  consignments tab = the shipments columns (`grow-eligible-columns-v2`), one-line caption, Schedule
  Pickup. Bulk actions = merchant only, each gated by `prActions.prBulkState(…, role 'merchant')`:
  Reschedule · Cancel · Split (`LocalPickup/bookingCards.SplitPickupDialog`; one request, ≥ 2
  consignments) · Merge (`'merge'` is in `prActions.MERCHANT_ACTIONS`: 2+ Requested/Planned LTL at
  one pickup point, before `merchantCancelUntil`) · Print Consolidated Label · Download CSV (`merchantPrCsv`, merchant columns only). Merchant columns: Merchant,
  Source, Trip are neither shown nor in the ⚙ chooser; Driver / Carrier → **Carrier** (the 3PL's
  name only when `carrierMode === 'CARRIER'`); status chip flags = the console's `statusTags`
  minus Discrepancy. Columns = ONE definition for both pickup grids (2026-09-25: one value per cell,
  single-line, `table-fixed` + sideways scroll like Consignment Order): `LocalPickup/prModel.ts`
  `PR_COLUMN_DEFS` rendered by `LocalPickup/prColumns.tsx` `usePrGridColumns` — Reference ·
  Status · Type · Attempt · Pickup Window (start – end in ONE column, owner 2026-09-25) · Pickup Address · Destination
  Hub · Merchant · Shipments · Weight · Driver / Carrier · Trip · Source (Grow = the merchant subset
  above; NO Exception column — flags live on the Status chip and the detail page); persisted `grow-pickup-columns-v4` / `local-pickup-columns-v3`. `PrStatusChip`
  (`pickupRequestTable.tsx`) is Grow's one status rendering. Row click opens the request page. Also kept: `PR-000123` references, weight/qty
  summed from linked orders, Overdue + Duplicate markers, detail page with status history,
  Reschedule / Cancel / Print Consolidated Label, a dev
  "Simulate next step" through Requested → Planned → Ready For Last Mile Dispatch → Assigned → Out For Pickup → Completed (derived `Partially picked`; side exits Pickup Failed / Cancelled).
  Pickup windows are two datetimes and may run overnight or
  across days (≤ 7) — every booking / reschedule / split dialog (2026-09-25) asks From: Pickup date ·
  Start time → To: End date · End time (`LocalPickup/slotFields.tsx`; no Slot dropdown — slot
  definitions only give the default + the "earliest" rule; `violatesCutoff(start, now, policy, end)`:
  end after start, ≤ 12 h on one day / ≤ 7 days, lead time, same-day cut-off, operating days,
  holidays, hours; `slot` on the record is derived from the two times): multi-day rows render two lines + an `overnight` / `n days` tag, Overdue
  is measured on the window's END, and Duplicate = same pickup point + overlapping intervals.
  **`Create Pickup Request`** books a courier slot before the orders exist and shows a
  Type of **LTL blind** / **FTL blind** (the record's internal flag is still `blind`). Pickup Type vocabulary everywhere
  (grids, detail chips, Type rows) is ONLY LTL · FTL · LTL blind · FTL blind (owner, 2026-09-25) — never "Parcel" or "Reserved".
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
- **Create Order** (2026-09-25: the merchant form below — Shared | Full vehicle is a segment in its
  Service Type section; `/grow/orders/add/vehicle` = Full vehicle preselected). The FTL vocabulary
  (older wording, still the data model) follows the Citylink
  tenant's live step (2026-09-23): a required **Service Type** first (`FTL_SERVICE_TYPES` in
  `draft.ts` — the vehicle catalogues; the demo keeps EXACTLY 10 service types (owner,
  2026-09-25; `SERVICE_TYPES`): Standard · Express · White Glove Delivery · CEP Inland · Inland LTL ·
  Sea LCL · Air Freight LCL · Inland FTL · Sea FCL · RORO FTL (no LTL/FTL restriction since 2026-09-29); retired names
  map via `RETIRED_SERVICE_TYPES` on load), which decides the **Vehicle Type** catalogue;
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
- **Add Consignment: console = staging's Add Order form; Grow = the MERCHANT order form** (owner,
  2026-09-25 — overrides the 2026-09-24 "both portals" rule for Grow only). Console
  `/local/consignments/add[/vehicle]` = `AddOrderPage.tsx` (staging-exact, capture
  `docs/superpowers/research/2026-09-24-staging-add-order-form.md`; Order Category, Merchant select,
  Carriers, creates outright; primitives in `components/consignmentForm.tsx`). Grow
  `/grow/orders/add[/vehicle]` = **the v2 form in merchant mode** (owner, 2026-09-29: "make grow form like this,
  no carrier-specific feature"): `LocalConsignments/AddConsignmentV2.tsx` with `portal="merchant"` — the SAME cards,
  address cards + popup (Save this address), goods entry and fields, minus the carrier/ops ones (`MERCHANT_OFF`:
  Merchant = the header ⇄, Consignment Number, Total Loading Time, the console's Load type / Vehicle Type, lat/long,
  Pallet Space; no Carriers card, no Shipment legs, no form builder, no Simplified tier, no Transfer type, no hubs as
  addresses). Cards: Consignment details · Ship From → Ship To (pickup window under Ship From follows the pickup
  module: off · manual optional · auto-ask required · auto-rule shown) · Package & SKU · **Handling** (the console's:
  six category chips · toggles · Tags, + Grow's **Load type** Shared | Full vehicle, default Shared) · **Service &
  instructions** (Label Format · instructions · VAS in the lane's currency) · **Service Type LAST**
  (`serviceCards.ServiceTypeChooser hideMode`: the lane's rate cards show at once — two per row by default, the builder's
  Services choice — vehicle cards with count steppers for Full vehicle, which also allows extra drops). The console form's saved customisation (`fe-consignment-form-v2-rules`:
  hidden · labels · More · Required) applies to Grow too (owner, 2026-09-29), plus the Form Fields tab's Required —
  unless the Grow portal form changes that field for Grow (2026-10-05, "Form setup" under Add Consignment v2).
  Sticky footer = the estimate · Go Back · Save for later · Continue to checkout (DRAFT_KEY → `/grow/orders/checkout`,
  a session draft is restored on Back). Package card (both portals): a chevron-only "more package details" at the END of
  the package's field row (level with the inputs), Add SKU on its own line below; a SKU's details toggle is a chevron only (words in the tooltip). The old `MerchantOrderForm` / `packageEditor` / `orderSummaryRail` are gone. Selected card = 2px brand
  border, no fill; segments/choices neutral (border-ink + bg-warm-50). Pricing = ONE module
  `src/growOrders/rates.ts` (`quoteLane`/`quoteService`, ESTIMATED; ₱ card for PH, $ card for the
  Chicago/US network; zone same city · region · nationwide), also used by the Rate Calculator and
  OrderViewPage; checkout freezes `draft.rate` + `draft.currency`. Settings that drive it:
  `fe-consignment-form-behavior` (`hidden`, `identifier`, and `required` — written by the new
  **Form Fields** tab on `/local/settings/consignment-order`; hides reach both forms, Required is
  Grow-only), Form Builder relabels, the local Service Type master rows (Active),
  SKU/Package/Location masters, Vehicle Config, the pickup module's window rules.
  `Parcel.quantity` = packages of this spec, `ParcelItem.quantity` = units per package.
- **Add Consignment v2** (owner, 2026-09-29): `/local/consignments/new` (+ `/new/vehicle`) =
  `LocalConsignments/AddConsignmentV2.tsx`, a COPY of `AddOrderPage` (the staging replica at `/add` stays
  untouched); the list's **Add** opens it directly (owner, 2026-09-29; no menu, and no link to the old `/add` form — it stays reachable by URL only), and
  **Modify Shipment Details** opens `/new?draft=<id>`: a LIVE order prefills from `draft.draftFromOrder` when it has no
  stored form state and **Save changes** writes onto it through `growOrderActions.modifyOrder` (status, payment, pickup
  request, ready-to-ship kept — never saveDraft + markPaid). Header = PageHeader's back chevron + title + ONE subtitle
  "Provide the order details to ensure accurate processing, routing, and billing of the shipment." (both portals; no
  change count, no simplified-form note) + Edit consignment form. Same
  `OrderDraft`; one tier; ordered by dependency for the least scroll (the file's doc comment is the spec):
  Consignment details → Ship From → Ship To (saved-address pickers read back as cards, Add / Edit in a popup,
  "Save this address" to the store list or the address book) + **Shipment legs** — ONE simple line below the two
  addresses (owner, 2026-09-29): pills First Mile · Line Haul · Last Mile · or · **Pick & Del**, and on the right the
  hubs it passes in words ("Via San Pablo Inbound Hub → …", only KNOWN hubs; the saved value in its tooltip). The legs
  are a CHOICE (`shipmentLegs.legsOf` / `movementOfLegs` / `legsOfMovement`: the 7 leg combinations + Pick & Del = the
  8 movement types, stored as `consignment.movementType`); each leg FOLLOWS the chosen address until set by hand (FM /
  LM: an address = on, a hub = off; LH: the two ends' hubs differ). A leg set by hand narrows that end's picker (FM on
  = an address, off = a hub) and clears an end of the wrong kind; address cards carry a Merchant / Customer address ·
  Hub pill; a Transfer locks Line Haul only; soft hints for LH vs the hubs. A pickup request is booked only with First
  Mile. Grow never shows it → Package & SKU (Items = SKU + quantity,
  master or typed SKU — a typed code is kept on Enter / Tab / leaving the field; or Packages, Add Package at the
  bottom; Handling = two rows: Order Category chips, then Barcode on every box · Delivered in parts · Clearance ·
  Tags) → **Service & instructions** (one card: Service Type · Load type · Vehicle Type · Total Loading Time, then
  Special Instructions + VAS per package or SKU, `VasLine.packageId`) → **Carriers last** (names only). Label Format
  sits in Consignment details; RTO = one toggle "RTO address same as Ship From address".
  Consignment Type drives the ends (Reverse swaps them, Transfer = hub → hub, RTO / payment only where they
  apply, Exchange requires its order no., Service = goods optional). Consignment Number has no fallback.
  **How goods are entered** is ONE builder setting (`fe-consignment-form-v2-goods`, no per-order selector):
  SKU-based (default) · SKUs, then packages (SKU list with a Package column, then the boxes) · Packages with
  their SKUs; Add SKU sits under its SKUs, Add Package under all packages. **Handling** is its own card (Order
  Category chips — each hideable — · Barcode · In parts · Clearance · Tags) between Package & SKU and **Service &
  instructions**. Service Type always has a value (hideable since 2026-10-05 — see Builder v3); Vehicle Type is optional. The footer carries the tier switch
  (**Switch to Simplified**, `console-consignment-form-v2-tier`): the original Simplified tier restyled — 3-column
  Consignment (window on the Ship By Date) · address cards · one Package & SKU table · Carriers; not customisable.
  **Form builder** ("Edit consignment form"): the live form is the preview — rename · Required · More (waits
  behind "More information", revealed IN PLACE) · hide, an eye for the hidden ones; locks = registry mandatory +
  SKU / package weight + L × W × H (Service Type unlocked 2026-10-05); v2-only keys Lift, Vehicle Type (optional), the VAS section and
  each Handling category; a block / card whose fields are all hidden leaves no gap; card captions live behind an ⓘ
  (local `FormCard` + `InfoTip`); row-adders are compact `+ Add SKU` links;
  address fields are customised inside the address popup. Rules live in `fe-consignment-form-v2-rules` over the shared config —
  never changes `/add`, Grow or the list. Errors only after an Add Order attempt. OWNER EXCEPTION to the
  type-scale rule, this form only: a 24px row gap (its labels use the shared `field-label` since 2026-10-05).
  **Form setup — Console vs Grow, Format, own fields (2026-10-05)**, pure module `LocalConsignments/formSetup.ts`:
  the builder edits ONE of two forms, switched in its bar (**Console | Grow portal**): `?edit=console` /
  `?edit=grow` on `/local/consignments/new` (the Grow one mounts the merchant form itself as its preview; Save /
  Cancel return to the plain console form; unsaved changes → "Save and switch" dialog). Grow FOLLOWS the console
  form field by field: `fe-consignment-form-v2-rules-grow` holds only what differs (`growRules()` overlay; a "Grow ↺"
  chip on a changed field reverts it; **Match console form** clears them), so a console change still reaches Grow
  unless Grow set that field itself; MERCHANT_OFF fields never show on Grow, preview included. "How goods are
  entered" may differ too (`…-goods-grow`, kept only while it differs). Field tools are compact icons with
  tooltips (✱ Required · ☰ More · `.*` **Format** · eye · trash for own fields; lock = system). **Format** = what may
  be typed in a text field (`FORMATABLE` + own Text fields, locked identifiers included; Contact Number via key
  `addrContact`): preset (numbers / letters / letters+numbers / code / email / phone) or a custom regular
  expression, optional min / max length, own message, a "Try it" box; checked on both forms, its message shows once
  the field is left (not only after Add Order); the address card says "Check the format: …". **+ Add field** (in
  Consignment details, Handling, Service & instructions — Grow: its Service & instructions card) adds the account's
  own field: Text · Number · Date · List · Yes / No, Required, "Also show it on the other form" (on by default).
  Definitions = ONE list `fe-consignment-form-v2-custom` (`cf:<id>` keys, rules per portal); answers are stored on the
  consignment as a snapshot `consignment.customFields` (`{ key, label, value, kind }`; an answer the form no longer
  asks is kept on Modify) and shown as **Additional details** in the console view and in the Grow view's Consignment
  details (Grow shows only fields its form shows). Entry points: the form's "Edit consignment form", and
  Settings → Consignment Order → Form Fields → **Customise the forms**.
  **Builder v3 (2026-10-05, owner: "it has to be easy to use", then "I don't want the side bar — find another way — but
  I love the idea")** — click-to-select: the preview's fields are click targets (dashed frame, brand frame when selected;
  state as tags on the frame: Grow · Hidden · More · Format · lock) and a click opens that field's SETTINGS CARD right next
  to it (`AnchoredCard`: portaled, below the field or above it, follows the scroll; outside click / Esc / Done closes) —
  Name on the form · Show on the form · Required · Put under "More" · What can be typed (the Format editor, live, with Try
  it) · Remove field (own fields) · Use the console setting (Grow). NO side panel: the form-level choices sit on the cards
  they change — each address's **Entered as** Saved card | Fields on form (on Ship From, Ship To and the RTO address, each
  its own), **How goods are entered** (the Package & SKU card), Grow's **Show as** Grid | List (its Service Type card) —
  and the bar's **All fields** opens every field by card in one searchable dialog (a show / hide switch per field, the
  picked field's settings beside the list, + Add field — the dialog asks where; the address card's "Address fields" link
  opens it on Addresses). The Format dialog is gone (Format lives in the card; the icons came back 2026-10-05, see below). **Layout** =
  `formSetup.loadLayout/saveLayout` (`fe-consignment-form-v2-layout` = `{ shipFrom, shipTo, rto, services }`, a stored
  `address` from the first version applies to all three; Grow's differences in `…-layout-grow`): **Fields on form** = that
  address typed in the card under a search of the saved ones (name · number · address · company), CONTACT DETAILS /
  ADDRESS DETAILS in four columns, More address details, "Save this address" (kept when the consignment is submitted or
  saved for later); any address on the form → the two ends stack (Ship From above Ship To) — EXCEPT on Grow with the
  Summary card off (or all its lines hidden): then Ship From and Ship To sit side by side, each address in two columns
  (`halfAddresses`, `PartyBlock half`; owner, 2026-10-05); a hub end stays a picker + card.
  **Package list (owner, 2026-10-05: "100 packages = too much scroll; what if every field is shown")**: with more than
  one package ONE is open for editing (`openPkgId`; the builder preview always has the first open) and every other one
  is a single row — Package n · type · count × L × W × H · kg each · SKUs · #tracking, the total kg, Duplicate (a copy
  right below, new id, no tracking number) · Remove · open. The open card's header carries its totals (no footer row).
  Past `PKG_PAGE` (8) rows the list stops at **Show all N packages**; the SKU list of "SKUs, then packages" stops at
  10 lines the same way. An incomplete package (after an Add attempt) shows an "Incomplete" chip, always stays
  visible, and the first one opens itself. However many fields the builder shows, they live only in the open package.
  **Barcode on every box** (owner, 2026-10-05) is asked on each PACKAGE's heading where packages are typed (`Parcel.barcodeEach`;
  Handling keeps the switch only for SKU-based and vehicle forms; the consignment's `scannable` = any package has it): on =
  that line is ONE box — its Quantity is locked to 1, and a line of N boxes becomes N lines (≤ 100; above that Quantity → 1
  + "add the rest with Duplicate"). **SKUs, then packages = SKU INTO package** (owner, 2026-10-05: "reverse it"): the SKU
  list has no Package column; Package 1 "Holds every SKU not put in another package", every other package has **SKUs in this
  package** (multi-select; a SKU taken out goes back to Package 1; `packInto`), and `ParcelItem.lineNo` keeps the SKU list in
  its order while packages pick (`sepSort`). Add SKU adds to Package 1.
  **Builder, simpler (owner, 2026-10-05)**: "Show hidden fields" is OFF by default (hiding a field says where to bring it
  back); every field frame carries its icons again (`FieldTools`: ✱ Required · ☰ More · .* Format (opens the card) · eye ·
  trash for own fields · Grow ↺; set ones stay lit, the rest show on hover / when selected) next to the click-to-open card;
  **Move card** ↑ ↓ on each card's top edge reorders whole cards (zone `__sections` of the field order — saved, reset and,
  on Grow, inherited like the fields'; the Simplified tier keeps its order); a repeating block shows ONE **sample line** in
  the builder (a SKU line with its details, a VAS line) so its fields can be set without adding one — nothing is saved.
  Grow's **Grid** = the lane's services as compact radio cards two per row (name + carrier · rate + Est. N days,
  nothing preselected, nothing collapses), `serviceCards.ServiceTypeChooser layout`.
  **Field order + Summary (2026-10-05, owner: "drag and drop and resequence columns in the same sections" · "allow to show
  summary or not … their summary section can be different")** — while the form is edited every field is a drag cell
  (`SortCell`, native HTML5 drag: a grip on hover, a brand bar where it lands; the field's settings card also has
  **Earlier / Later**). A field moves only inside its ZONE: `consignment` · `contact` / `address` (one order for every
  address) · `package` · `sku-details` · `handling-chips` · `handling-switches` · `handling-fields` · `service` (the
  console's Service Type / Load type / Vehicle Type join it) · `instructions` · `summary`. Order =
  `formSetup.loadOrder/saveOrder` (`fe-consignment-form-v2-order`, `{ zone: [entry ids] }`; an entry's id = its element
  key; Grow follows the console zone by zone, its own zones in `…-order-grow`); `applyOrder` keeps a field the order does
  not know after its natural predecessor. **More** keeps its meaning: a More field waits in its NEW place and is revealed
  there. **Summary** = an optional card at the end of the form (`sec-summary`), the console's ops lines (Merchant · Type ·
  Route · Legs · Pieces & weight · Service Type · Load type · Carrier · Pickup / Delivery window) and Grow's merchant lines
  (Route · Pieces & weight · Load type · Service Type · Pickup · Value-added services · Estimated price); its on / off and
  hidden lines live per portal on their own (`formSetup.loadSummary/saveSummary`, `fe-consignment-form-v2-summary[-grow]`,
  default console OFF, Grow ON — Grow does NOT follow the console here); while editing the card shows a "Shown on this
  form" switch and a switch per line. Not on the Simplified tier.
  **Service Type is hideable (2026-10-05, owner: "in Service Type I can't hide that field")** — it left `FORM_LOCKED`, so the
  builder, the Form Fields tab (Shown | Hidden — no Required, it always has a value) and the older hides all reach the v2
  forms. Hidden = nobody chooses: every consignment gets the field's **default service** (its rule's `defaultValue`, picked in
  its settings card under "While it is hidden"; Grow follows the console unless it sets its own). Console: the default when it
  is a known service, else Standard; `/new/vehicle`: the default when it is a vehicle service, else Inland FTL (vehicle rows
  are fitted to its vehicles); a resumed draft / Modify / pickup request keeps its own service. Grow books from the Service
  Type master's Active rows (its own if still bookable → the default → the first); Shared = no Service Type card (the footer
  estimate names the service), Full vehicle = the card becomes **Vehicles** (`ServiceTypeChooser servicesHidden`: the count
  steppers only); the builder preview keeps it, faded. The console's Service & instructions card leaves when everything in it
  is hidden. The Simplified tier is not customisable — it still asks Service Type.
- **Service Type has no Load type** (owner, 2026-09-29): `draft.loadTypeOf` returns `'both'` for every
  service, so Shared / Full vehicle is the booking's free choice on every form (the old form's Load type is no
  longer locked; Grow's service cards list every service in both modes); the Load type column / filter / form
  field are gone from both Service Type masters.
`?step=1|2` (+`&type=FTL`) on Create Order prefills sample parties + a package and scrolls to
Packages (1) / Service Type (2) (QA shortcut). Never reintroduce a Grow-only look: new Grow UI uses the shared console components.
- **Money & account pages** (2026-09-25, research `docs/superpowers/research/2026-09-25-grow-portal-pages.md` §4–§9;
  localStorage stores via `src/growOrders/localStore.ts`, deterministic seeds, normalize-on-load; shared bits in
  `GrowOrders/accountBits.tsx`): **Wallet** `/grow/orders/wallet?tab=wallet|payments` (+ `/:id` receipt) = `WalletPage` /
  `ReceiptPage` on `growOrders/ledger.ts` (`grow-wallet-v2`; Wallet tab = the GROW-STAGING wallet: Recharge (demo
  credit row) · Balance/Credits/Debits tiles · running balance per currency from `walletOf()`; Payments tab = the
  2GO_PH list; seeded opening credit per currency; one payment = one DR entry (a checkout split over several methods
  writes one per method), seeded from paid orders,
  **payment flow** (2026-10-05) = a TWO-step checkout `GrowOrders/CheckoutPage` — **1 Payment** (Payment Mode, then "How you pay":
  `paymentSheet.tsx` `SplitPaymentSheet`, tick ONE OR MORE of Wallet balance + inline Recharge · Card demo, only the last 4
  digits kept · Pay later on a Postpaid account · COD for a COD order, each with its own amount that must add up to the payable
  amount; state = `splitPayment.ts` `useSplitPayment`; the method with the largest share is saved as
  `merchantSettings.defaultPayMethod`) → **2 Summary** (`CheckoutSummary.tsx`, read-only review, then Pay / Place order);
  `PaymentSheet` (one method) stays for `PayNowDialog` on Billing / Payments ⋮ for Pending (pay-later /
  COD) debits and `PayNowButton` for the order overlay; `debitsWallet()` = only Wallet/'Credit' debits move the balance,
  `recordSplitPayment(order, parts)` called by CheckoutPage (shipping / tax shared by amount, "Split payment · 1 of 2"),
  `recordPayment(order, method, last4)` = one part; both idempotent by order id; `chargesOf()` = frozen charges else rate card, flagged
  estimated). **Billing** `/grow/orders/billing` = `BillingPage` — invoices DERIVED per month × currency by
  `growOrders/invoices.ts` (never sum ₱ and $), status from Settings' Payment Type. **Disputes**
  `/grow/orders/disputes` (+ `/:id`) = `DisputesPage` on `growOrders/disputes.ts` (`grow-disputes-v3`): the live
  GROW-STAGING tenant's three kinds Wallet (Transaction) · Tracking (queries) · Invoice in the Consignment Order
  grammar — ONE list, tabs Open · Closed · All, kind = the "Type" filter (`?kind=` presets it), union of the live
  columns with empty ones hidden; raise via `?raise=<kind>:<subject>` — Wallet ⋮, Billing invoice dialog, and
  `RaiseDisputeButton` (for the consignment overlay). **Address Book** `/grow/orders/address-book` (+ `/add`,
  `/:id`, `/:id/edit`) on `growOrders/addressBook.ts` (`grow-address-book-v1`); `receiverBook()` lists saved rows
  FIRST. **Settings** `/grow/orders/settings?tab=account|packages|users|email|storefront` on
  `growOrders/merchantSettings.ts` (`grow-merchant-settings-v1`, per merchant code): saved packages join the form's
  presets through `packageTypesForMerchant` (`SAVED-` codes), the default pickup address is listed first by
  `usePickupLocations`; User Management / Email / Store Front are "not captured" empty states.

**Grow analytics & tools pages (2026-09-25, research `docs/superpowers/research/2026-09-25-grow-portal-pages.md`
§1–3, §6, §10; live arrangement, our components):** `/grow/orders/dashboard` (`DashboardPage.tsx` — date range +
store filter → `KpiTile`s Pickup Failed · Schedule Pickup (= the Eligible consignments rule) · On Time Performance →
Summary / Deliveries / OTP charts in plain SVG → Help Center card; all derived, no store) · `/grow/orders/tracking`
(`TrackingPage.tsx` — the live 9 columns over booked `shipmentRows`, date presets in `dateRanges.ts`, EDD /
delivered-at / rate in `trackingModel.ts`, row → `GrowConsignmentView`, columns `grow-tracking-columns-v1`) ·
`/grow/orders/quote` (`QuotePage.tsx` — from / to postal / packages → `quoteLane` as `RateCard`s; "Create order now"
writes the session draft `grow-order-draft`) · `/grow/orders/reports` (+ `/reports/subscriptions`; `ReportsPage.tsx` +
store `src/growOrders/reports.ts`, key `grow-reports-v1`: jobs, subscriptions, templates, the VERBATIM Order-report
column universe; Download = a local CSV) · `/grow/orders/help` (`HelpCenterPage.tsx` + `helpArticles.ts`, SAMPLE
content — the live `/faq/` was never captured). `GrowOrdersLayout` `PAGE_SLUGS` lists every literal page slug so
only a real order id gets the `/grow/orders/:id` order-view chrome — add a new page's slug there.

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
  `LOCAL_PR_TABS` = All · Active · Closed · **Exception** (owner, 2026-10-05 — "Exception" again after
  "Attention Required"; slug `exception`, old `attention` still lands; the constant is still named
  `ATTENTION_REQUIRED`) · **Eligible consignments** (slug `eligible`; Grow only since 2026-10-05). The
  console `/local/pickup` shows Exception · Active · Closed · All (an old `?tab=eligible` lands on
  Exception). **Create pickup ▾** (owner, 2026-10-05; `LocalPickup/createPickup.tsx`, on `/local/pickup`
  AND on `/local/pending-for-planning` in manual mode) = **Pickup request** (pickup address → its waiting
  consignments, all ticked → date + time; `bookGroup` per address → hub group, the merge policy applies)
  · **Blind pickup request** (`CreatePickupDialog`: LTL | FTL segment, merchant + pickup address, window,
  how many / weight, or service + vehicles; only while `blindPickupsAllowed`). Popups use one short
  subtitle at most — no explanation paragraphs. The same consignments can also be booked from
  `/local/consignments` (Schedule Pickup + Add to existing pickup) and Grow `/grow/orders` (Schedule
  Pickup) — always pass `pickupRequestById` as the lookup to `localPrTabOf` / `inLocalPrTab`.
- **A pickup request opens as a SLIDE-OVER over its list** (owner, 2026-09-25), never a page:
  `/local/pickup/:id` and `/grow/orders/pickups/:id` mount the LIST, which hosts
  `LocalPickup/PickupRequestDetail` / `GrowOrders/PickupRequestPage` in nueva `SlideOver` +
  `SlideOverSections` (the Consignment view's shell — `ConsignmentView` uses the same primitive;
  `side` prop flips it to the left in one line). Modals sit above it (z-70); Esc closes the top one.
- **Every pickup action is gated by `src/growOrders/prActions.ts`** (owner, 2026-09-25):
  `prActionState(action, pr, { cfg, role: 'ops' | 'merchant' })` / `prBulkState` (a selection =
  enabled only if EVERY row is, + one hub to route / one point to merge / single-row dialogs);
  disabled items stay reachable with the `reason` (`SelectionAction.reason`, `MenuItem.disabled/reason`).
  Selection menus (nueva `SelectionMenu` in every `DataTable`, and the PFP panel; owner, 2026-10-05) list
  what the selection CAN do first and fold the rest under **Not available (n)**, each with its reason
  on a line under it; the PFP panel list is no longer capped at seven items.
  `prModel.can.*` delegates to it. Never gate a pickup action inline in a page. Research:
  `docs/superpowers/research/2026-09-25-pickup-actions-by-status.md`. A request made by a split carries
  `splitFromPrId` and is never a Duplicate of its sibling. ONE pickup-point key: `prActions.pickupPointKey`
  (store code for a known location; + address line only for "Other address…"). Split / Merge are LTL only;
  a multi-select Split = `splitAllPickupRequests` (one request per consignment).
- Rules live in the store, not in pages: multi-PR policy (merge on create), same-day
  cutoff (`pickupSlots.ts`), auto re-attempt on failure, "no orders left" → Pickup Failed,
  unpicked released at completion, handover auto-closes when scans reconcile, a forwarded
  misroute may be in-scanned at its own hub. Reason codes: `pickupReasons.ts`.
- `GrowOrder.readyToShip`: a paid consignment with no open PR reads **Created / Label
  Generated** until `/local/consignments` bulk **Mark Ready To Ship** (`markReadyToShip`) sets
  it → **Ready To Ship**; the `marked-ready-for-ship` / `-plan` auto triggers require it (seed:
  even ids ready; staging fixture from its remarks state token).
- Account config = `src/config/pickupModule.ts` (localStorage mirror written by the console
  Base Modules → **Pickup Request** page and the Pilot Driver App → Pickup Module card; the
  local app never calls `/staging`). `enabled:false` hides only the pickup additions.
  **Booking rules (owner, 2026-09-25): ONE shared horizon `bookingHorizonDays` (1–30, default 7;
  `autoPickup.maxDaysAhead` is derived from it) + `sameDayCutoff`, enforced by `violatesCutoff()` (every
  manual dialog) and `userWindowError()`; `/local/settings/pickup` shows them once, in its shared
  "Booking rules" card (both modes).**
  **Pickup days (owner, 2026-09-25): `pickupDaysSource` = `merchant-then-hub` (default: the pickup
  address's Location Master `operating_hours` → `MasterLocation.operatingDays`, else the drop hub's
  Holiday Master) · `hub`. (A `module` "days only" choice was removed the same day — a stored value
  normalizes to the default.) Hub holidays ALWAYS block, and a merchant preference is intersected with the hub's operating days (merchant
  hours, hub holidays). `growOrders/operatingCalendar.ts` `pickupCalendarFor` resolves it and
  `pickupPolicy(merchant, { pickupLocationCode, hubCode })` folds days + holidays + hours into the policy
  (every dialog, re-attempt and auto window pass the where); hub operating days are DERIVED from the
  hub's Holiday Master policy (weekly offs + working hours, staging's shape — research
  `2026-09-25-staging-holiday-master.md`). Holiday Master page = `/local/settings/masters/service_order/holiday-master`
  (tabs Holiday Policies · Holidays, persisted by ServiceOrderMasters, read back by key); the "Pickup days"
  row sits under More options in the settings page's Booking rules card, with a "Hub holidays → Holiday master" row. Dialogs show one caption naming the source and
  grey holidays with a "Holiday · name" tooltip.**
  **`mode` (owner, 2026-09-24): `manual` (default) = merchants/ops book; `auto` = a request is
  raised the moment a consignment is created on the date `autoPickup` computes
  (`afterState` Created | Label Generated | Ready To Ship = the consignment state that raises it —
  `autoPickupEligible()`; a consignment reaching it LATER is booked from `update()`;
  `userSelectsWindow` + `bookingHorizonDays` = the consignment form offers a date + slot under the slot
  rules (`userWindowError()`), stored as the sender's window and honoured by
  `autoPickupWindowFor()` else the fallback rule; in auto mode the settings page asks ONLY
  auto-relevant options — add-to-existing, merchant-cancel and merchant rules are manual-only; `dateRule`
  same-day | next-business-day | days-after-order, `daysAfterOrder`, `slot`, `pickupDays`; `autoPickupWindow()` / `autoPickupSummary()` in `pickupSlots.ts`; the legacy
  `autoCreateOnConsignment` is derived from it). `/local/settings/pickup` (owner, 2026-10-05 "simplify the pickups
  setting"; before: five cards, 2026-09-25) reads in the order a person decides, in plain words, ONE row grammar
  (13px bold label + ONE 12px hint ≤ 90 chars saying what happens, no truncation, control in a fixed 260px column,
  rows `border-line` py-4, 24px between cards; copy + hints in the pure `LocalSettings/pickupSummary.ts`): the
  header switch **Pickups on / off** (off = the summary only) → a **Summary** card, 2–5 plain sentences built live
  from the draft (`pickupSummary()`; e.g. "Merchants and ops book pickups themselves. Pickups can be booked up to 7
  days ahead; same-day bookings close at 12:00. Failed pickups follow the Reason Policy."; auto says the event, the
  stored `dateRule` + slot, shipper choice / confirmation) → **Who books pickups** (two equal cards **Manual** |
  **Automatic**, border-ink + warm-50 + a check) → ONLY that mode's card: **Automatic pickups** = Book the pickup when
  (`triggerEvent`, titles only, hint = what "fired" means locally) · Shipper chooses the pickup time
  (`userSelectsWindow`; off-hint states the stored date rule) · More options: Shipper confirms the time
  (`slotConfirmation`); **Manual pickups** = Book a pickup before its consignments exist (`blindAllowed`, shows as LTL
  blind / FTL blind) → **Booking rules** (shared; caption differs by mode) = Book up to N days ahead
  (`bookingHorizonDays`) · Same-day cut-off (`sameDayCutoff`) · More options: Pickup days (`pickupDaysSource`: Pickup
  address and hub | Hub only) + Hub holidays → Holiday master → **When a pickup fails** (one header action → Reason
  Policy). Switches say On / Off. `MoreOptions` (`settingsRows.tsx`) opens by itself when one of its settings is not
  at its default, so a changed setting is never hidden. Sticky footer Cancel (revert to saved) · Save with an
  "Unsaved changes" caption — no "Restore defaults". Other keys (`dateRule`, `slot`, `pickupDays`, …) keep their
  stored values and stay editable on the console's Base Modules → Pickup Request twin. In auto mode every manual booking control is
  replaced by an "Auto pickup · rule" pill: Schedule Pickup (console + Grow), Book Pickup
  (Grow view), Create pickup (console Pickup page + Pending For Planning), Add + Eligible consignments (Grow Pickup Requests).
  **Manual card = "Manual pickups"**; its one option `manualPickup.blindAllowed` (default true) — `blindPickupsAllowed(cfg)` hides the console's Blind pickup request choice (Create pickup then opens Pickup request directly) + Grow Add and makes `createBlindPickup` return null (no write); existing blind requests stay readable.
  **Pickup attempts = Reason Policy (owner, 2026-09-25):** `/local/settings/pickup` shows ONE "When a pickup fails" card
  (both modes) whose **Reason Policy** button → `/local/settings/masters/service_order/reason-master?tab=reason-policy`
  (`SubMasterPage` reads `?tab=<slug>`); no attempts input — the cap lives on the rule, staging-style: When =
  Always | **Before attempt N** (form: `Attempt` 1–5, default 3, shown via FieldDef `showWhen`; the row stores
  `when: 'Before attempt 3'` + `attempt`). Pickup reasons + rules live in `src/growOrders/reasonPolicy.ts` (mastersTree
  spreads them in; key `local-masters-service_order-reason-policy-v4`, version shared with `ServiceOrderMasters`).
  `failPickupRequest` asks `pickupOutcomeFor(code, attempt, maxAttempts?)` (`maxAttempts` only = N for a rule with no
  number): Re-attempt pickup while attempt < N → the auto re-attempt, else held · Hold for review → stays Pickup Failed
  + note (and `isHeldForReview` keeps it in Attention Required) · Cancel pickup → Cancelled (`ORDER_CANCELLED`); no
  matching Active Pickup row → hold; NO_ORDERS and code-less failures bypass it. "Re-attempt now" overrides it. The
  console PR detail shows "Reason policy: …" beside the attempt count.
- Pages: `/local/consignments` (Merchant → Pickup Address filter, bulk **Schedule** →
  `SchedulePickupDialog` — per booking card New pickup request · Add to existing · **Split into separate
  requests** (one request per shipment, bypasses the merge rule via `createPickupRequest`'s `split` flag; disabled for a one-shipment card); no Create Pickup; **Add** → `/local/consignments/add[/vehicle]` = the
  SAME `AddOrderPage` with `portal="console"`: an Order Category card (4 Person · Stackable ·
  Fragile · VIP · Hazmat · Heavy Weight → `consignment.category`, which then drives the row's
  flags) below VAS, no checkout and no drafts — ops create outright; the Grow form never shows
  that card; **row click** → `/local/consignments/:id` = `ConsignmentView.tsx`, the staging
  View Consignment overlay: 62% right drawer, section rail Summary · Order · Piece · Tracking ·
  SKU · VAS · Load · Attempt · Customer Feedback · Notes, "View Events" widens it and docks an
  Event Logs timeline; every list is DERIVED in `viewModel.ts` from the order, its pickup
  requests, its trips and its notes, since no event/load/attempt service exists locally),
  `/local/pickup` (+ `/:id`, `LocalPickup/*`),
  `/local/pending-for-planning` (ALWAYS the new page, owner 2026-09-29: pickup module OFF = one All tab, consignments
  only; ON in manual OR auto mode = the tabs below with pickup requests — gate = `cfg.enabled`, not
  `pickupPagesVisible`; the staging look only on `-replica`) (tabs **All** (first + default) · First Mile · Last Mile, `?tab=first-mile|last-mile`,
  old `pickups`/`consignments` slugs alias; per-tab column sets in `LocalPFP/viewColumns.ts` —
  Last Mile = the measured consignment grid, First Mile = pickup requests ONLY (PR grid on
  `PR_COLUMN_DEFS`; no Group by since 2026-09-29, a stale `?group=none` is ignored),
  All = pickup requests + the Last Mile consignments (a first-mile consignment rides on its
  request, never its own row there), columns common to both row kinds — the ONLY tab with Active Leg, and its Type = row kind
  only; a pickup overlay's booked orders open their consignment overlay; pickup-request rows get the SAME 16-item menu as `/local/pickup` (`LocalPickup/prSelectionItems.ts` + `prSelectionActions.tsx` dialogs; "Plan pickup request for routing" routes onto trips); consignment rows on First Mile / Last Mile = staging's exact 19 columns + 13 actions (`viewColumns.CONSIGNMENT_TAB_COLUMNS`), a mixed All selection = Plan For Routing · Download CSV · Cancel; the filter line follows the tab's row kind (First Mile = the Pickup page's grammar: window date · Status · Merchant · funnel Type/Pickup Address/Destination Hub/Source; Last Mile = staging's consignment filters + chips; All = date · Merchant · Type · Destination; a tab switch keeps only Merchant + search); only rows that still need planning — PRs Requested with no trip / 3PL, consignments Created · Ready To Ship · Pickup Requested on no trip), `/local/control-tower` (+ `/trips/:id`; `AddToRouteDialog` is shared),
  `/local/inbound` (+ `/scanner`), `/driver` (FarEye Pilot look; login as a seeded driver).
- `/local/routing` — **Same/Next Day Routing**, an EXACT replica of staging `/v2/view/99999/529`
  (owner override 2026-09-25, like Add Consignment; research
  `docs/superpowers/research/2026-09-25-staging-same-next-day-routing.md`) + `/:planId` (Route &
  Dispatch) + `/vehicles` (Vehicle Config, `/vehicles/:vehicleId` editor). A plan =
  `src/pages/LocalRouting/routingPlans.ts` (key `local-routing-plans-v1`, reset with demo data)
  grouping planningStore trips made by `planForRouting`; vehicles = `src/config/vehicleConfig.ts`
  (per hub; `vehicleTypesFor(hubCode)` for the consignment form). The ONE addition: Create New
  Routes asks **Plan for: First Mile · Last Mile · Both** while the pickup module is enabled.
- Masters → Service & Order: `/local/settings/masters/service_order` (+ `/:subId`) =
  `LocalSettings/ServiceOrderMasters.tsx` re-mounting the frozen `nueva/pages.tsx` Category /
  SubMaster pages through `nueva/mastersEnv.ts` (base path, fixed category, `persist`) on
  mastersTree's sample rows; add/edit/delete/enable persist per sub-master in localStorage
  (`local-masters-service_order-<subId>-v1`); form fields map to columns by label or `rowKey`.
  Never the live `liveMasterConfigs` / `masters/serviceOrder` (they call `/staging`).
- Settings (staging Base Modules, captured in
  `docs/superpowers/research/2026-09-24-staging-general-and-consignment-settings.md`):
  `/local/settings/general` (`GeneralSettings.tsx` → `src/config/generalSettings.ts`, stored only)
  and `/local/settings/consignment-order` (`ConsignmentOrderSettings.tsx` →
  `src/config/consignmentModule.ts`; vocabulary in `consignmentModuleUniverse.ts`, shared with
  `nueva/ModuleDetail`). Once saved, its Table Configuration sets `/local/consignments`' default
  columns + sequence (a stored ⚙ choice wins) and its Date Filter the list's date preset/field;
  user types, modify-till and On Page Filters are stored only.
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
  13px, card titles 15px bold, table headers 13px bold `text-ink` (the DataTable header; SimpleTable
  matches it — audited 2026-09-25: no half-pixel sizes anywhere, captions 12px `text-ink-3`, chips 11px). Row hover =
  `hover:bg-warm-50`; card hover = border-warm-300 + shadow-ds-1. Element positioning,
  spacing and type scale must not change from page to page.

## Dev

- `npm run dev` — Vite dev server on **port 3000** (strict).
- Surfaces under `/console/settings` and the whole `/local` app use the `fe-nueva` class to apply the Lato font.
