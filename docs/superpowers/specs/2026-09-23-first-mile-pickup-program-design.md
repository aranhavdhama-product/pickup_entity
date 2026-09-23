# First-mile pickup program — design (2026-09-23)

Owner brief (verbatim intent): integrate first-mile pickup into the EXISTING console
workflows, mimicking staging's design — never as a separate module. Feedback items:
separate view for failed pickups; account-level pickup enable/disable; adding
consignments to a pickup (Eligible for Pickup); adding to an EXISTING pickup request;
execution-failed handling (cancel, failed, manual picked up, manual failed, add more,
reschedule, add to route new & existing, carrier map / 3PL assignment); handover to
managed / outsourced carrier via the Inbound module with three scan cases (driver, hub,
both); pickup tabs All / Active / Closed / Exception; `/local/pickup` redesigned to the
current pages' design; consignments page loses `+ Create Pickup` (moves to Pickups) and
gains Merchant → Pickup Address filtering + bulk **Schedule**; PFP gets Consignments |
Pickups | All tabs; the blind-pickup popup changes apply to Grow too; a clean UI when a
booking forms several OD (origin → destination) pairs.

Research: `docs/superpowers/research/2026-09-23-first-mile-pickup-research.md`.
Staging captures (signed-in tab, 2026-09-23): Base Modules list, Consignment Order module
page (General · Date Filter · Table Configuration · On Page Filters), Control Tower →
Trips (30-day filter), trip detail, Inbound (Incoming · Pending · Misroute · Overage ·
Damage · Completed + "Inbound" → Scanner "Scan to Inbound"), Pending For Planning.

## 1. Architecture decisions

1. **One store for the LOCAL app: `src/growOrders` (+ `LocalPFP/planningStore`).**
   `/local/consignments` and `/local/pending-for-planning` already run on it. `/local/pickup`
   is REBUILT on it. `src/pickup` (Store A) stays untouched for `/driver` and the console
   PickupRequest demo — nothing new imports it.
2. **Trips live in `planningStore` (`LocalTrip`), surfaced on a local Control Tower page**
   (`/local/control-tower`, Trips tab) that mirrors staging's Trips grammar. "Add to route"
   = add a pickup stop to an existing `LocalTrip` or create a new one.
3. **Handover lives in a local Inbound page** (`/local/inbound`) mirroring staging: bucket
   tabs + a Scanner. Hub in-scan of a picked-up consignment is the hub handover event.
   The scan mode (driver / hub / both) is account config.
4. **Account-level config = a Base Modules card in the console** (`/console/settings/
   base-modules`, replica of staging's 10 cards + a new **Pickup Request** card with its own
   module page). The LOCAL app cannot call `/staging`, so the module page MIRRORS its
   settingJson into localStorage (`src/config/pickupModule.ts`) and the local app reads
   that mirror with defaults.
5. **Design system:** every LOCAL surface uses `src/nueva/components.tsx` primitives + the
   consignments page's toolbar/table grammar. The PFP tab strip is the one styled from
   `pfpChrome.css` tokens (owner-requested deviation, logged in
   `scratchpad/split/pixel-diff-log.md`). Grow keeps its Materio `ui.tsx`.
6. **Invariant kept:** nothing under `src/local`, `src/pages/Local*` imports `src/auth` or
   calls `/staging`.

## 2. Data model (foundation — `src/growOrders`)

### 2.1 `GrowPickupRequest` additions (all optional in persisted blobs; `normalize` fills)
```ts
/* execution */
tripId: string | null          // LocalTrip id when added to a route
driverName: string | null      // from the trip, denormalised for the list
carrierCode: string | null     // 3PL / carrier allocation
carrierName: string | null
carrierMode: 'FLEET' | 'CARRIER' | null
attempt: number                // 1-based; re-attempt clones bump it
maxAttempts: number            // from config at creation (default 3)
failureReason: string | null   // PICKUP_FAILURE_REASONS code
manualOverride: 'Picked Up' | 'Failed' | null   // ops override marker
/* handover */
handover: {
  mode: 'driver' | 'hub' | 'both'      // snapshot of config at creation
  driverScanned: string[]              // orderIds scanned by the driver
  hubScanned: string[]                 // orderIds in-scanned at the hub
  manifestRef: string | null           // 3PL manifest / carrier pickup ref
  closedAt: string | null              // reconciliation complete
}
source: 'Merchant' | 'Console' | 'API' | 'Auto'
```
### 2.2 Status vocabulary — keep `PickupRequestStatus` as is
`Requested | Planned | Ready For Last Mile Dispatch | Assigned | Out For Pickup |
Completed | Pickup Failed | Cancelled`, plus the DERIVED outcomes already in `tabs.ts`
(`Partially picked`, overage badge) and new derived flags:
- `Handed Over` — `Completed` and `handover.closedAt != null`
- `Discrepancy` — `Completed`, mode `both`, and driverScanned ≠ hubScanned (set difference
  either way) and not closed
- `Overdue` — open status and `endAt` in the past (exists)
- `Re-attempt available` — `Pickup Failed` and `attempt < maxAttempts`

### 2.3 Tabs (`src/growOrders/tabs.ts`) — add `LOCAL_PR_TABS`
| Tab | Rule |
|---|---|
| All | everything |
| Eligible for Pickup | NOT a PR list: consignments with `tabOf(o) === 'Ready for Pickup'` (paid, Order Created, no PR) |
| Active | Requested, Planned, Ready For Last Mile Dispatch, Assigned, Out For Pickup |
| Closed | Completed (incl. Handed Over), Cancelled, Pickup Failed with `attempt >= maxAttempts` |
| Exception | Pickup Failed (re-attempt available), Partially picked, Discrepancy, Overdue |

### 2.4 Reason codes (`src/growOrders/pickupReasons.ts`)
`PICKUP_FAILURE_REASONS`: Shipment not ready · Premises closed · Incorrect address ·
Label missing / packaging improper · Handover delayed past slot · Merchant cancelled at
door · Overweight / dimension mismatch · Damaged goods refused · Driver no-show ·
Vehicle capacity insufficient · Other.
`CANCEL_REASONS`: Merchant request · Duplicate booking · Order cancelled · Other.

### 2.5 Trips (`src/pages/LocalPFP/planningStore.ts` → `LocalTrip`)
```ts
id: 'T10000330'-style; name: string (driver or vehicle label); driverName: string | null
vehicle: string | null; date: 'YYYY-MM-DD'; hubCode: string
status: 'Un-assigned' | 'Yet to start' | 'In Transit' | 'Yet to debrief' | 'Completed'
carrierCode/carrierName/carrierMode (as PR)
stops: PlannedStop[]  // kind 'pickup' (prId) | 'delivery' (orderId); seq; status Pending|Arrived|Done|Failed; plannedAt
```
Actions: `createTrip`, `addPickupToTrip(tripId, prId)`, `removeStopFromTrip`,
`assignDriver`, `startTrip` (→ In Transit; every pickup PR → Out For Pickup),
`arriveStop`, `completePickupStop(tripId, prId, scannedOrderIds)` (→ PR Completed /
Partially picked via `completePickupRequest`; driverScanned = scanned), `failPickupStop`
(→ PR Pickup Failed + reason), `debriefTrip` (→ Yet to debrief → Completed; hub scans go
through Inbound), `endTrip`.

### 2.6 Store actions to add (`growOrderActions`)
`assignCarrier(prId, {code,name,mode})` · `markManuallyPickedUp(prId, orderIds, note)`
(status Completed, manualOverride 'Picked Up') · `markManuallyFailed(prId, reason, note)`
· `reattemptPickupRequest(prId)` (clone → Requested, attempt+1, orders re-linked) ·
`addOrdersToPickup` (= existing `attachOrdersToPickup`, allowed while Requested | Planned
| Assigned per config `allowAddToExistingUntil`) · `driverScan(prId, orderId)` ·
`hubScan(orderId)` (finds the PR via `pickedInRequestId`; pushes hubScanned; order status
→ In Transit / secondary `At Facility`) · `closeHandover(prId)` (when buckets reconcile
or ops force-close with note) · `setPickupTrip(prId, tripId | null)`.
Existing: `createPickupRequest`, `createBlindPickup`, `cancelPickupRequest`,
`failPickupRequest`, `reschedulePickupRequest`, `completePickupRequest`, `resolveOverage`.

### 2.7 Config mirror (`src/config/pickupModule.ts`)
```ts
export interface PickupModuleConfig {
  enabled: boolean                       // default true
  autoCreateOnConsignment: 'off' | 'always'   // default 'off'
  scanMode: 'driver' | 'hub' | 'both'    // default 'both'
  maxAttempts: number                    // default 3
  allowAddToExistingUntil: 'Requested' | 'Planned' | 'Assigned'   // default 'Planned'
  rescheduleWindowDays: number           // default 7
  overagePolicy: 'hold' | 'auto-create' | 'reject'   // default 'hold'
  sendToCarrier: boolean                 // default false
  cutoffTime: string                     // 'HH:mm', default '16:00'
  bookingLeadTimeMins: number            // default 120
}
export const PICKUP_MODULE_KEY = 'fareye-pickup-module-config-v1'
export function readPickupModuleConfig(): PickupModuleConfig   // localStorage + defaults
export function writePickupModuleConfig(c: Partial<PickupModuleConfig>): void
export function usePickupModuleConfig(): PickupModuleConfig     // useSyncExternalStore
```
Console module page writes here AND to moduleSettings (code `PICKUP_REQUEST`).

### 2.8 Seed
Add trips (5: one per status) and PRs in every tab bucket incl. a Discrepancy and a
re-attemptable failure; a 3PL-assigned PR; keep counts deterministic (index math).
Bump `fareye-grow-orders` key to v12 and `pfp-local-planning` key.

## 3. Surfaces

### 3.1 `/local/consignments`
- Remove `+ Create Pickup`. Keep `Add`/upload.
- Filter row: Date range · State · Merchant · **Pickup Address** (MenuSelect, options =
  the selected merchant's stores; disabled until a merchant is picked) · Advanced · Clear.
- Bulk action **Schedule** → `SchedulePickupDialog` (nueva `Modal`): grouping preview
  (one card per OD pair: pickup address → inbound hub · n consignments · weight; FTL
  orders one card each), window start/end, instructions, and per group a choice
  **New pickup request** / **Add to existing** (open PRs at that pickup address in a
  status allowed by config, showing window + count). Confirm creates one PR per group
  (`createPickupRequest`) or attaches (`attachOrdersToPickup`), sets secondary state via
  `planningActions.schedule`, toasts with PR numbers linking to `/local/pickup/:id`.
  Ineligible selections (not Ready for Pickup / already in a PR) are listed and skipped.
- Row drawer: Ship From section links the PR.
- Hidden when `enabled === false` (Schedule action absent, banner in dialog).

### 3.2 `/local/pickup` — Pickup Requests (rebuilt)
- `PageHeader` "Pickup Requests" · right: `+ Create Pickup` (reserved booking dialog,
  nueva-styled: LTL/FTL tabs; FTL = Service Type → Vehicle Type → Number of Vehicles),
  download.
- Tabs with counts: All · Eligible for Pickup · Active · Closed · Exception (`?tab=`).
- Filters: Date range · Status · Merchant · Advanced (Pickup address, Carrier, Driver,
  Type LTL/FTL, Source, Reserved) · Clear · Search · icons.
- Table: Reference (PR-000123 + Reserved / FTL / attempt n/N chips) · Status (outcome-aware
  pill + Overdue / Discrepancy tags) · Pickup window · Pickup address → hub · Merchant ·
  Consignments (count) · Weight · Driver / Carrier · Trip.
- Eligible tab: consignment rows (Ready for Pickup) with bulk **Add to new pickup** /
  **Add to existing pickup** (same dialog as 3.1).
- Bulk actions on PR rows: Add to route (new / existing trip), Assign carrier, Reschedule,
  Cancel, Mark Pickup Failed, Download CSV.
- Row click → `/local/pickup/:id` detail: header (number, status, chips) + kebab with
  status-aware actions: Add consignments · Reschedule · Cancel · Mark Pickup Failed
  (reason) · Mark Manually Picked Up · Re-attempt · Add to route (new/existing) · Assign
  carrier (3PL) · Print manifest (toast). Cards: Summary (window, address → hub, contact,
  service/vehicle) · Consignments (Expected vs Picked vs Overage) · Handover (mode; driver
  scanned / hub scanned buckets with the four reconciliation states; Close handover;
  dev "Simulate driver scan") · Trip (link) · Timeline (statusHistory).
- Module disabled → EmptyState "Pickup module is disabled for this account" + link to
  settings.

### 3.3 `/local/control-tower` — Trips (mirrors staging Control Tower → Trips)
- Tabs: Consignment Order (links to `/local/consignments`) · **Trips** (default).
- Filters: date range (default last 30 days) · Hub · Driver · Carrier · Type · Clear.
- Status chips with counts: Un-assigned · Yet to start · In Transit · Yet to debrief ·
  Completed; three coloured counters (early / on-time / delayed = placeholder from stops).
- Rows: name + trip id · date · hub · done/total · stop timeline (numbered stops on a
  time axis; pickup stops use a truck glyph tint) · Actions (progress % / Debrief / kebab:
  Assign driver, Start trip, End trip, Add pickup).
- Trip detail (`/local/control-tower/trips/:id`): Trip Summary tab (breakdown, stops table
  with Pending / Failed / Successful sub-tabs; per pickup stop: Arrive, Complete (scan
  list of expected consignments → driverScanned), Fail (reason)), actions Resequence
  (toast), Change Assignee, End Trip, Debrief (moves to Yet to debrief → Completed;
  reminds that hub in-scan happens in Inbound).
- "Add to route" dialog (shared, `src/pages/LocalControlTower/addToRouteDialog.tsx`):
  choose existing trip (Un-assigned / Yet to start at the PR's hub, same date) or New trip
  (name, date, driver optional). Sets PR → Planned (+ Assigned when a driver is set).

### 3.4 `/local/inbound` — Inbound (mirrors staging)
- Date range · tabs Incoming · Pending · Misroute · Overage · Damage · Completed ·
  `Inbound` button → `/local/inbound/scanner` ("Scan to Inbound": input + Enter,
  list of scanned items with outcome; View Summary).
- Buckets (derived from orders/PRs): Incoming = Picked Up not hub-scanned (trip In
  Transit / Yet to debrief); Pending = driver-scanned, hub scan missing after trip
  debrief (discrepancy); Misroute = hub-scanned at a hub ≠ inboundHubCode; Overage =
  PR overage scans unresolved; Damage = flagged via scanner outcome "Damaged";
  Completed = hub-scanned today.
- Scanner: a consignment number → `hubScan`; unknown → overage (per config policy);
  scanning a consignment whose PR mode is `hub` marks it Picked Up too.

### 3.5 `/local/pending-for-planning`
- Tab strip above the filter row: **All · Consignments · Pickups** (`?tab=`), counts.
  Pickups = pending pickups only (`isPendingPickup`). Styled from `pfpChrome.css` tokens;
  the deviation is logged in `scratchpad/split/pixel-diff-log.md`.
- Fix: "Plan Collection For Routing" → `addPickupToTrip`/new trip + PR → Planned, and
  planned pickups leave the queue.

### 3.6 Console settings
- `BaseModules.tsx`: 10 cards in staging order (add General Settings, Put Away, Last Mile
  Loading; Enable Routing = ROUTING) + **Pickup Request** ("Manage first-mile pickup
  settings", code `PICKUP_REQUEST`, slug `pickup_request`). Toggle = enabled.
- `ModuleDetail.tsx`: `PickupRequestDetail` with tabs General (User Types checkboxes +
  Feature Settings rows: Pickup module enabled · Auto-create pickup on consignment ·
  Handover scan mode driver/hub/both · Max attempts · Allow add-to-existing until ·
  Reschedule window days · Overage policy · Send pickup request to carriers · Cutoff time
  · Booking lead time) · Date Filter · Table Configuration · On Page Filters (shared
  `ColumnsFiltersDetail` tabs). Save = moduleSettings PUT + `writePickupModuleConfig`.
- Register in `settingsSearch.ts`.

### 3.7 Grow parity
- Blind pickup dialog: already Service Type → Vehicle (done 2026-09-23).
- `BookPickupDialog` group list → one card per OD pair (pickup point → hub, orders,
  weight, window), collapsible order rows, clear "n bookings will be created" line;
  FTL orders as their own cards. Shared grouping = `groupForPickup` (utils.ts).

## 4. Task list and ownership

Wave 1 (parallel):
- **F — Foundation** (`src/growOrders/*`, `planningStore.ts`, `src/routes.tsx`,
  `src/local/LocalSidebar.tsx`, stub pages): §2 in full, routes + nav for
  `/local/pickup`, `/local/pickup/:id`, `/local/control-tower`, `/local/control-tower/
  trips/:id`, `/local/inbound`, `/local/inbound/scanner` (stubs export a default
  component rendering a `PageHeader`), seed, key bumps.
- **S — Settings** (`src/nueva/BaseModules.tsx`, `ModuleDetail.tsx`, `settingsSearch.ts`,
  `src/config/pickupModule.ts`): §3.6 + §2.7.
- **G — Grow OD-pair UI** (`src/pages/GrowOrders/pickupDialog.tsx`): §3.7.

Wave 2 (parallel, after F):
- **C — Consignments** (`src/pages/LocalConsignments/*`, new `SchedulePickupDialog`).
- **P — Pickup page + detail** (`src/pages/LocalPickup/*` rewritten).
- **T — Control Tower + Inbound** (`src/pages/LocalControlTower/*`, `src/pages/LocalInbound/*`).
- **Q — PFP tabs + routing fix** (`src/pages/LocalPFP/*`).

Wave 3: integration review, browser walk-through of the three end-to-end flows
(schedule → route → execute → handover; failed → re-attempt; reserved → add
consignments), gap fixes, CLAUDE.md update.

## 5. Acceptance flows
1. Consignments: filter Merchant → Pickup Address, select 3 Ready-for-Pickup rows across
   two hubs, Schedule → preview shows 2 OD cards → creates 2 PRs → rows read Pickup
   Scheduled; PRs appear on `/local/pickup` Active and on PFP Pickups tab.
2. Pickup detail: Add to route → new trip → Control Tower shows the trip (Yet to start);
   Start trip → PR Out For Pickup; complete stop scanning 2 of 3 → Partially picked
   (Exception tab); Inbound scanner scans the 2 → Handed Over; the third → Eligible again.
3. Pickup Failed with reason → Exception tab → Re-attempt → new PR attempt 2 linked.
4. Reserved booking (`+ Create Pickup`) → Add consignments from Eligible tab → Active.
5. Settings: toggle Pickup Request off → `/local/pickup` shows the disabled state and
   Schedule disappears from consignments.

---

## 6. End-to-end case matrix (added 2026-09-23, evening — for the CTO walk-through)

Actors: **Merchant** (Grow portal) · **Ops** (carrier console: Consignments, Pickup, PFP,
Control Tower, Inbound) · **Driver** (FarEye Pilot app, managed fleet) · **Hub operator**
(Inbound scanner) · **3PL carrier** (outsourced; sees its work in Carrier Portal, events
arrive by integration). Every row names the actor, the surface, and the state effect.

### 6.1 Creation
| # | Case | Actor · surface | Effect |
|---|---|---|---|
| C1 | Book pickup for Ready orders | Merchant · Grow Orders → Book Pickup (one card per OD pair) | PR **Requested** (source Merchant), orders → Pickup Scheduled; PR visible on Pickup (Active), PFP (Pickups), Consignments rows show PR |
| C2 | Reserve a slot before orders exist | Merchant · Grow Create Pickup Request (LTL: estimates; FTL: service type → vehicle) | PR Requested, `blind` ("Reserved"); orders added later (C5) |
| C3 | Schedule from consignments | Ops · Consignments → filter Merchant → Pickup Address → select → **Schedule** | one PR per OD pair (source Console); option per group: new / add to existing |
| C4 | Reserved booking by ops | Ops · Pickup → `+ Create Pickup` | as C2, source Console |
| C5 | Add consignments to an existing PR | Merchant · Grow PR page → Add orders · Ops · Pickup → Eligible for Pickup → Add to existing | allowed while status ≤ `allowAddToExistingUntil` (default Planned); after that ops override with note; never once Out For Pickup (extras become overages) |
| C6 | Auto-create on consignment creation | System (config `autoCreateOnConsignment`) | one PR per pickup address per day, source Auto, window = next slot after cutoff |
| C7 | API / bulk upload | Integration · `/v2/pickups` | source API |

### 6.2 Change before execution
| # | Case | Actor · surface | Effect |
|---|---|---|---|
| M1 | Merchant cancels | Merchant · Grow PR page → Cancel (allowed while Requested / Planned; Assigned+ shows "contact support") | PR **Cancelled** (reason), orders → Ready for Pickup; if on a trip the stop is removed and the trip gets **Attention Required**; ops toast/notification |
| M2 | Merchant reschedules | Merchant · Grow → Reschedule (within `rescheduleWindowDays`, before cutoff) | window updated; if Planned on a trip for another date → stop removed, PR back to Requested, trip Attention Required |
| M3 | Ops cancels | Ops · Pickup detail / bulk → Cancel (reason) | as M1; merchant sees Cancelled + reason in Grow |
| M4 | Ops reschedules | Ops · Pickup detail / bulk → Reschedule | as M2 |
| M5 | Remove one consignment from a PR | Merchant · Grow · Ops · Pickup detail | consignment → Ready for Pickup; PR with nothing left cannot complete (turns Pickup Failed "No orders to collect") |
| M6 | Duplicate / overlapping window at same pickup point | System | Duplicate flag on both PRs; merge suggested (add to existing) |

### 6.3 Planning (carrier console)
| # | Case | Actor · surface | Effect |
|---|---|---|---|
| P1 | Route via routing engine | Ops · PFP → Pickups tab → select → Plan Collection For Routing | trip created/extended with a pickup stop; PR **Planned** (`tripId`), leaves PFP |
| P2 | Manual add to route | Ops · Pickup detail / bulk → Add to route → existing trip (same hub + date, Un-assigned / Yet to start) or new trip | PR Planned; trip visible on Control Tower → Trips |
| P3 | Assign driver | Ops · Control Tower → trip → Change Assignee | trip Yet to start; every pickup PR on it → **Assigned** (driver denormalised on the PR) |
| P4 | LTL/FTL via load planning | Ops · PFP → Send to Load Planning | PR Planned through the load plan (FTL = own trip, vehicle from the PR) |
| P5 | Outsource to a 3PL | Ops · Pickup detail / bulk → Assign carrier (or carrier-allocation rules) | PR **Assigned**, `carrierMode = CARRIER`, no fleet trip; `sendToCarrier` pushes the booking and stores `carrierPickupRef`; Carrier Portal lists it; carrier events drive Out For Pickup / Completed; ops can mark manually |
| P6 | Window passes unplanned | System | **Overdue** → Exception tab; ops reschedules (M4) or cancels (M3) |
| P7 | Switch fleet ↔ 3PL | Ops · Pickup detail | remove from trip / clear carrier, back to Requested, then P2 or P5 |

### 6.4 Execution (driver, managed fleet)
| # | Case | Actor · surface | Effect |
|---|---|---|---|
| E1 | Start trip | Driver · Pilot Home → Checklist → Loading → Start | trip In Transit; every pickup PR on it → **Out For Pickup**; merchant sees it in Grow |
| E2 | Arrive at pickup stop | Driver · Pilot stop card (geofence or Arrive) | stop Arrived; timeline event |
| E3 | Scan expected consignments | Driver · Pickup stop screen: expected list, camera scan / manual entry | each match → Picked (driverScanned); progress "n of m" |
| E4 | Not picked (per consignment) | Driver · item → Not picked → reason | released to Ready for Pickup at completion (short pickup) |
| E5 | Unknown barcode (overage) | Driver · scan → Overage sheet | per `overagePolicy`: hold (needs ops), auto-create consignment, reject |
| E6 | Reserved PR (no list) | Driver · count-confirm + optional scans | PR Completed with count; orders created later attach via `pickedInRequestId` |
| E7 | Proof of pickup | Driver · signature / photo / OTP per `podRequirements` | stored on the PR event |
| E8 | Complete stop | Driver · swipe "Complete pickup" | PR **Completed** or **Partially picked**; unpicked released |
| E9 | Pickup failed at door | Driver · "Unable to pick up" → reason (merchant-side / carrier-side codes) | PR **Pickup Failed**; if `attempt < maxAttempts` and `autoRescheduleOnFail` → clone Requested next business day (attempt n+1), else Closed-Failed; Exception tab; merchant notified with reason |
| E10 | Driver cancels / breakdown | Driver · trip kebab → Report issue | remaining pickup stops → Pickup Failed (carrier-side reason) → re-attempt; trip Attention Required; ops reassigns (P2/P3) |
| E11 | Merchant cancels while driver en route | Merchant · Grow (blocked ≥ Assigned) → support | ops cancels (M3); driver's stop disappears with a notice |

### 6.5 Handover
| # | Case | Actor · surface | Effect |
|---|---|---|---|
| H1 | Driver-scan mode | Driver scan (E3) is custody; trip Debrief closes handover | PR **Handed Over** at debrief; consignments At Facility |
| H2 | Hub-scan mode | Hub operator · Inbound → Scanner | hub in-scan is the pickup event (marks picked + handed over); driver completes stop by count |
| H3 | Both (default) | Driver scan + Inbound scan | reconciliation buckets: matched · driver-only (lost in transit → alert) · hub-only (unrecorded pickup / overage) · never scanned (short). Discrepancy → Exception until ops closes with a note or the parcel is found |
| H4 | 3PL handover | Ops prints manifest; carrier accepts | PR Handed Over with `manifestRef`; Control Tower tracks carrier events |
| H5 | Overage at hub | Hub operator · Inbound → Overage tab | attach to a consignment / create consignment (Grow overage flow) / reject |
| H6 | Misroute | Hub operator · scan at a hub ≠ inbound hub | Inbound → Misroute tab; forward to the right hub |

### 6.6 Closure
| # | Case | Effect |
|---|---|---|
| Z1 | Handover reconciled | PR **Closed**; consignment continues At Facility → In Transit → Out for Delivery |
| Z2 | Merchant view | Grow PR page shows Picked / Not picked / Overage and the reason history (exists) |
| Z3 | Billing hook | one pickup charge per PR (Grow wallet) — noted, not built |

### 6.7 Account-level switches (Base Modules → Pickup Request)
Enabled · Auto-create · Handover scan mode · Max attempts · Auto-reschedule on fail ·
Reschedule window · Merchant cancel until · Allow add-to-existing until · POD requirements ·
Overage policy · Send to carrier · Cutoff + lead time.

## 7. Driver app (FarEye Pilot look) — task D

Design reference captured from the Play Store / App Store listings (2026-09-23): light
grey canvas, white 12–16px cards, numbered stop cards with type chips (**Delivery**,
**Pick Up** — the real app already has both on one stop), contact row with call / chat,
address with navigate, time-window chip, flag icons (hazmat, tools), tabs
**Pending (n) / Completed (n)** on the Ongoing Trip, Home with "Today's Task 24",
"Upcoming Trips 2", "Trip starts in 00:30" + **Start Checklist** / **Start Loading**
(red-orange primary, soft-pink secondary), swipe-to-confirm CTAs, checklist groups with
green ticks, bottom nav Home · Chat · Performance · Notification, Profile with digital pass.

Screens (rebuild `/driver` on the Grow store + planningStore trips; retire Store A there):
1. **Home** — greeting + vehicle; Today's Task (deliveries + pickups); Upcoming Trips;
   "Trip starts in" card with Start Checklist / Start Loading.
2. **Upcoming Trips** — date-grouped trip cards (trip id, total tasks incl. pickups,
   start / end).
3. **Checklist** → **Loading** (scan deliveries) → **Ongoing Trip** (Pending / Completed
   tabs; stop cards with Delivery / Pick Up chips; pickup card shows merchant, pickup
   address, window, "n consignments expected" or "Reserved · count on arrival").
4. **Pickup stop** (new) — header PR number + merchant; progress "2 of 3 picked"; list
   with per-item chips To pick / Picked / Not picked; **Scan** (camera mock + manual
   entry); item tap → Not picked reason sheet; unknown scan → Overage sheet; Proof of
   pickup (signature / photo); swipe **Complete pickup**; **Unable to pick up** (reason).
5. **Trip issue** — Report issue (vehicle breakdown, etc.) → remaining pickups fail with a
   carrier-side reason.
6. **Debrief / Handover** — picked consignments grouped by PR, counts, hub hand-over
   status per item (mode both: ticks appear as the hub scans), sign-off.

## 8. Task list update
Wave 2 adds **D — Driver app** (`src/pages/DriverApp/*` rebuilt on the Grow store) and
**G2 — Grow parity**: merchant Cancel / Reschedule gated by status (≥ Assigned → "contact
support"), reason on cancel, Out For Pickup + driver name shown, Handed Over state.
Foundation adds: `cancelPickupRequest` / `reschedulePickupRequest` remove the PR's stop
from its trip and set `trip.attention` with a note; `LocalTrip.attention: string | null`.
Wave 3 adds the **CTO deck** (published Artifact) built from §6–§7 with prototype
screenshots.

## 9. Clarifications from the owner (2026-09-23, late)

- **Routes are trips.** In the current system a planned route with an assigned driver IS a
  trip and shows on the Pilot app; routes can be created directly and assigned. Our model:
  a `LocalTrip` with status Un-assigned = a planned route without a driver; Assign driver
  = it becomes a real trip the driver sees. "Add to route (new)" = create a route;
  "Add to route (existing)" = extend a route/trip that has not started. PFP "Plan
  Collection For Routing" feeds the same trips.
- **Many pickup requests a day from one merchant.** Policy `multiPrPolicy`:
  `ONE_OPEN_PER_LOCATION` (a second booking at the same pickup point while one is open is
  merged into it — "added to PR-x"), `ONE_PER_SLOT` (default: one open PR per pickup point
  per slot; same slot merges, different slot = a new PR), `UNLIMITED` (always new, Duplicate
  flag on overlaps). The Pickup page groups the day's PRs of one pickup point visually
  (Duplicate chip + "Merge" bulk action → `mergePickupRequests(prIds)` keeps the earliest,
  moves the consignments, cancels the rest with reason "Merged into PR-x").
- **Same-day cutoff.** `sameDayCutoff` (default 12:00): a booking made before it may pick a
  same-day slot; after it, the earliest slot is the next business day. `bookingLeadTimeMins`
  still applies to the chosen slot. Merchant-level overrides (`merchantOverrides`) let one
  merchant have its own cutoff, slots, policy and attempts. Every booking dialog (Grow,
  Consignments Schedule, Pickup + Create) shows the rule inline ("Same-day pickup closes at
  12:00 · earliest window Tue 09:00–12:00") and refuses a slot that breaks it.
- **Module disabled = current pages unchanged.** Disabling the Pickup Request module hides
  only the pickup additions: the Schedule bulk action and Pickup Address filter on
  Consignments, the Pickups tab on PFP, the Pickup nav page (shows a disabled state), the
  pickup stops' actions on Control Tower, the Pickup rows in Inbound buckets. Consignments,
  PFP, Control Tower trips for deliveries and Inbound keep working exactly as today.
- **Driver login.** Pilot is a phone app; the prototype's `/driver` opens with a Pilot-style
  Secure Login (pick a seeded driver, "Remember me") so the reviewer logs in as a driver
  before seeing trips.

### 9.1 Scenario audit list (each must have a defined outcome in the prototype)
1. Merchant books two PRs for the same point and slot → merged per policy; toast names the PR.
2. Merchant books after the same-day cutoff → dialog offers next-day slots only.
3. Consignment cancelled by the merchant while in a PR → removed from the PR; empty PR → Pickup Failed "No orders to collect".
4. Consignment with a data-validation error → not Eligible; fixing it makes it Eligible.
5. Pickup address edited on a booked consignment → blocked with "remove from PR-x first".
6. PR on a trip, merchant cancels → stop removed, trip Attention Required, ops notified.
7. PR reschedule to another day while Planned → back to Requested, stop removed.
8. Trip cancelled by ops before start → every pickup PR back to Requested (Planned lost).
9. Driver reassigned mid-trip → PRs keep Out For Pickup; driver name updates.
10. Driver arrives early / late vs window → stop compliance early/on-time/delayed counters.
11. Merchant not ready at the door → Pickup Failed (reason) → auto re-attempt attempt 2.
12. Third failure → Closed-Failed; merchant must rebook.
13. Partial pickup → Completed with Partially picked outcome; unpicked back to Ready; option "Re-attempt remainder" creates a new PR for them.
14. Overage at the driver → hold: appears on the PR as an overage scan; auto-create: a consignment is created for it; reject: recorded and left behind.
15. Overage at the hub → Inbound Overage tab → attach to consignment / create / reject.
16. Driver-scanned, never hub-scanned (mode both) → Discrepancy → ops closes with note or the parcel turns up (hub scan later resolves it).
17. Hub-scanned, never driver-scanned → unrecorded pickup: the hub scan marks it picked; the PR outcome is corrected.
18. Scan of a consignment belonging to another hub → Misroute tab, forward action.
19. Duplicate scan / scan after the PR is closed → "already scanned" / "closed" outcome, no state change.
20. Reserved PR completed with count, orders created later → each new order attaches via `pickedInRequestId` (Grow overage flow).
21. FTL PR with n vehicles → one trip per vehicle (stop = the PR, vehicle index in the stop).
22. 3PL PR: carrier fails the pickup → Pickup Failed via event; ops can switch to fleet (P7).
23. Module disabled with open PRs → they remain readable; no new bookings; execution continues.
24. PR window across midnight → Overdue measured on the end; trip date = window start date.
25. Merchant adds orders after Out For Pickup → new PR (dialog says so); the driver does not see them.

## 10. Decisions taken after the audit (2026-09-23, night)

| Topic | Decision |
|---|---|
| Hub-scan mode completion | Booked parcels count as picked-by-count and stay booked until the hub scan; nothing is released on the truck |
| 3PL failure re-attempt | Clone keeps the carrier and lands Assigned (re-booked); fleet clones are Requested with no trip |
| Scan after a force-closed handover | Logged with a note, no state change (`kind: 'closed'`) |
| Driver "Report issue" | Carrier-side codes: vehicle breakdown, accident, driver unavailable |
| Plan Collection / load planning | Never a hard-coded driver: no driver → Un-assigned trip, PR Planned; Send to Load Planning = a "Load plan" trip |
| Grow "Simulate next step" | Only for 3PL PRs ("Simulate carrier event"); fleet status comes from trips |
| Auto-create on consignment | Implemented for `always`: attach/create per policy at the earliest window, source Auto |
| Send to carrier / 3PL handover | `carrierPickupRef` on assign; Print manifest sets `manifestRef`; "Carrier accepted" closes the handover |
| Module off | Execution continues (Control Tower keeps stop actions); Grow booking buttons disabled with a tooltip |
| Eligibility | Enforced in the store: orders with a data-validation error are skipped |
| Reserved PR on Control Tower | Complete dialog takes a pieces-collected count |
| Demo resilience | "Reset demo data" in the local sidebar; `/local/settings/pickup` reachable from the Pickup page gear |

Still open (design, not built): one trip per vehicle for FTL with n vehicles (#21); an
"remove from PR first" guard when a booked consignment's pickup address is edited (#5); stop
compliance early/late from recorded arrival times (#10); an emptied PR at Assigned or later
stays open until completion fails it (#3, accepted).

For the CTO: default scan mode (both vs driver-only); merchant cancel gate (Planned vs
Assigned); re-attempt automatic vs ops-triggered; billing per request or per consignment;
Carrier Portal scope for 3PL pickups; FTL multi-vehicle trips.

## 11. Console chrome unification (owner, 2026-09-23 late night)

Pending for Planning (as it is now: underline tabs with icons + counts directly on the
canvas; ONE filter line = date range · selects · funnel · Clear Filters · search · icon
buttons; an optional chip row under it) is the reference chrome for EVERY local console
page. Rule: keep each page's own elements and their positions (which filters, which action
buttons, where they sit); change only the design of the tab strip and the filter line to
match PFP. Concretely:
- Lift PFP's tab/filter classes (`pfp-tabs`/tab, `pfp-filters`, `pfp-daterange`,
  `pfp-select`, `pfp-funnel`, `pfp-clear`, `pfp-search`, `pfp-iconbtn`, `pfp-chiprow`,
  `pfp-chip`) into a shared local stylesheet + thin React wrappers in `src/local/chrome.tsx`
  (`LocalTabs`, `LocalFilterLine`, `DateRange`, `FilterSelect`, `FunnelButton`, `ClearFilters`,
  `SearchBox`, `IconButton`, `ChipRow`) that PFP AND the other pages use — one source.
- Consignments, Pickup, Control Tower, Inbound: drop the white card around tabs + filters;
  tabs on the canvas; page actions (Add/upload, + Create Pickup, Inbound, download) stay on
  the tab row's right; filter line in PFP order with the page's own filters; the second
  filter line (Control Tower status chips, Inbound none) becomes a `ChipRow`.
- PFP: the Exceptions dropdown moves INSIDE the funnel panel (advanced filters) as its first
  section; the toolbar keeps search + icon buttons.
- Nueva `Tabs`/`MenuSelect`/`DateInput` remain for `/console`; the local console uses the
  shared chrome from now on. Record the deviation in `scratchpad/split/pixel-diff-log.md`.

## 12. Standard terms — the console vocabulary is the standard (owner, 2026-09-23)

| Use (everywhere, Grow included) | Not |
|---|---|
| Shipment(s) (nav, rows, counts); page title **Consignment Order** | Order(s) |
| Create Consignment / Modify Shipment Details | Create Order / Modify Order |
| Reference Number · Consignment Number · Order Number (three identifiers, console meaning) | "Order Number" as the only id |
| Ship From · Ship To · Return To Origin (RTO) | Sender / Receiver / Pickup address as section names |
| State (Created · Ready To Ship · At Facility · Intransit · Driver Out · Delivered · Undelivered · Cancelled) + Secondary State (Pickup Scheduled · Scheduled · Staged · Planned …) + Exception | Grow's display statuses (Ready for Pickup, In Transit, Out for Delivery, Exceptions) |
| Pickup Request (PR-000123) · Schedule Pickup · Reserved pickup | Book Pickup · Blind pickup |
| Data Validation Issues · Active · Closed · Exception · Returns · All | Grow's old tab names |
| Merchant · Carrier · Service Type · Consignment Type · Task | Store / Courier |
| LTL / FTL · Dedicate Truck · Vehicle Type · Service Type | Parcel / Vehicle |
| SKU · Package · HSN Code · Origin Country | Item |

## 13. Grow = consignment portal (owner, 2026-09-23 morning) — task list

Staging facts captured live (`docs/superpowers/research/staging-add-form/`):
- Orders list: filter line ABOVE the tab strip (Data Validation Issues · Active · Closed ·
  Exception · Returns · All, with counts); columns **Order Number** (direction glyph) ·
  **Reference Number** (separate column) · State · Secondary State · Weight · Volume ·
  Pallet Space · …; right side "+ Add | upload" split and a Search pill.
- Add form, Simplified: Order (Merchant* · Order Number* · Consignment Type* · Service Type ·
  Ship By Date* · Start/End Time* · Tags) · Ship From card → Ship To (Location Code + map +
  Add Manually; Full Name* · Email · Phone*) · Package & SKU table (Package ID · Package Type ·
  Quantity · Tracking ID · SKU Code · SKU Name; "Add More Package") · Carriers · footer
  "Switch to Regular Add Form".
- Add form, Regular: Order (Order Number* · Reference Number* · Consignment Number ·
  Consignment Type* · Ship By Date* · Merchant* · Tags · Payment Mode · Order Amount · Service
  Type · Label Format · Scannable · Scheduling Confirmation Required · Dedicate Truck ·
  Clearance Required · Total Loading Time · Special / Delivery Instructions) · Ship From (full
  address + Pick Up Start/End Time · Floor Number · Lift Available) · RTO (Same As Ship From |
  Use Different Address) · Ship To (full address + Delivery Start/End Time) · SKU · Piece ·
  Value Added Services (each "Add More") · Carriers.

Tasks:
- [ ] T1 Grow Create Consignment = the staging form, both tiers, no LTL/FTL tabs, no section-nav
      row, no Merchant field (silent, in notes), HSN Code + Origin Country on SKU rows, Package &
      SKU / SKU / Piece exactly as staging (agent O).
- [ ] T2 Grow Orders page = staging structure in Grow theme; owner wants NO tabs on Grow
      (Status as a filter); Order Number and Reference Number as separate columns (agent O2).
- [ ] T3 Grow Pickup Requests page = same grammar as T2, Status filter instead of tabs (O2).
- [x] T4 Console local pages: filter line above tabs; PFP tabs Shipments · Pickups · All.
- [x] T5 Console Shipments list: split "Shipment / Reference" into Order Number + Reference
      Number columns (staging order).
- [x] T6 Reserved pickup dialogs: one dynamic LTL/FTL form (Grow + console).
- [ ] T7 Terminology sweep (§12) across the rest of Grow (order view, checkout, PR pages).

## 14. State / Secondary State = FarEye's vocabulary (owner, 2026-09-23)

Only values from staging's 41-option State / Secondary State list are shown, on both portals
(`fareyeStatesOf` in `src/pages/LocalPFP/adapter.ts`):

| Order situation | State | Secondary State |
|---|---|---|
| draft / unpaid | Created | — |
| paid, no pickup request | Ready To Ship | Label Generated |
| pickup request Requested | Ready To Ship | Scheduled |
| pickup request Planned / Ready For Last Mile Dispatch | Ready To Ship | Planned |
| pickup request Assigned | Ready To Ship | Driver Assigned For Pickup |
| pickup request Out For Pickup | Ready To Ship | Out For Pickup |
| last attempt failed, not rebooked | Ready To Ship | Pickup Failed |
| collected (all / part of the request) | Pickedup / Partially Pickedup | — |
| hub in-scan | At Facility | (planning overlay: Scheduled / Staged / Planned) |
| out for delivery | Driver Out | Out For Delivery |
| delivered / undelivered / cancelled | Delivered / Undelivered / Cancelled | — |

**Schedule Pickup is enabled** (`canSchedulePickup`) only when State ∈ {Created (paid),
Ready To Ship}, Secondary State ∉ {Scheduled, Planned, Driver Assigned For Pickup, Out For
Pickup, At Pickup Location}, the row has no open pickup request and no data-validation error.
A `Pickup Failed` row is therefore schedulable again.

## 15. One component set for both portals (owner, 2026-09-23 afternoon)

Grow no longer has its own Materio primitives. Every Grow page is built from the SAME
components as the consignment portal: shell = the local shell look (`src/local/LocalLayout`
grammar: white sidebar with the FarEye mark, canvas-coloured title bar), list pages = the
shared local chrome (`src/local/chrome.tsx`: FilterLine, DateRange, FilterSelect,
FunnelFilters, ClearFilters, SearchBox, IconBtn, ChipRow) + Nueva `DataTable`, forms =
Nueva `Input / MenuSelect / DateInput / Toggle / Checkbox / MultiSelect` inside the console's
SectionCard grid, dialogs = Nueva `Modal`, detail pages = `PageHeader` + `Panel` + `KebabMenu`
+ `StatusPill`, toasts = `nueva/toast`. Tokens = design.md (brand orange), not coral.
`src/pages/GrowOrders/ui.tsx` is retired once nothing imports it. Grow keeps its routes,
stores and behaviour; only the rendering layer changes. Invariant: Grow still imports nothing
from `src/auth` and calls nothing under `/staging` directly.
