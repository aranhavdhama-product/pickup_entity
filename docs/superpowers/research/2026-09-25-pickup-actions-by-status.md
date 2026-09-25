# Pickup-request actions by status — research (2026-09-25)

Owner request: "based on status pickup options should be enabled/disabled — currently that is
not happening." Sources: CLAUDE.md (First-mile pickup program), the brief
(`specs/2026-09-24-pickup-brief.md` → Life of a pickup request, Changes before the driver
leaves, Exceptions), spec §6.2–6.5 / §9.

## 1. Surfaces and what gated them BEFORE this change

| Surface | Actions | Gate before |
|---|---|---|
| Console `/local/pickup` grid — selection panel (`LocalPickup/index.tsx`) | Add to route · Assign carrier · Reschedule · Cancel · Mark Pickup Failed · Merge · Download CSV | `sel.some(can.x)` — enabled if ANY selected row qualified, then the dialog acted on the whole selection (a Cancelled + a Requested row → Cancel enabled). No reason shown. No row kebab exists; row click opens the read-only `ViewPickup` drawer. No Plan collection, Re-attempt, Confirm slot, Close handover, Print from the grid. |
| Console detail `/local/pickup/:id` (`PickupRequestDetail.tsx`, LOCKED) | Add shipments · Reschedule · Split · Add/Move to route · Remove from route · Assign carrier · Switch to fleet · Mark Manually Picked Up · Re-attempt remainder · Re-attempt now · Print manifest · Carrier accepted · Mark Pickup Failed · Cancel pickup · Confirm slot (banner) · Close handover (dialog) | `prModel.can.*` — items HIDDEN when not allowed (no disabled state, no reason). Print manifest always shown. |
| Grow `/grow/orders/pickups` (`PickupRequestsPage.tsx`) | Print Consolidated Label (n) · Reschedule · Cancel Pickup Request (n) | acts on the qualifying SUBSET (`isOpenPr && merchantMayChange`); disabled only when nothing qualified; the "contact support" `lockedHint` was dead code (a disabled button never fires onClick). |
| Grow request page (`PickupRequestPage.tsx`, LOCKED) | Reschedule · Split · Cancel · Remove (per order) · Add order (Reserved) · Simulate carrier event | `mayChange` = open && `merchantMayChange`; hidden when not allowed. |
| PFP `/local/pending-for-planning` pickup rows (`LocalPFP/index.tsx` SelectionPanel; drawer `ViewPickup.tsx` is read-only) | Plan Collection For Routing · Send to Load Planning · Mark Pickup Failed · Cancel Pickup | the queue itself (`isPendingPickup` = open, no trip, not 3PL); every action enabled for every pickup row; slot-confirmation-pending requests could be routed. |
| Control Tower trip stops (`TripDetail.tsx`) | Arrive · Complete · Fail (pickup stops) | trip running + stop not done/failed. A pickup on a running trip is Out For Pickup, so this already agrees with the matrix. |
| Inbound (`LocalInbound/*`) | scan, forward misroute, resolve overage | acts on scans/overages, not on a request's status — out of scope. |

## 2. Store rules (the floor — `growOrders/store.ts`, `tabs.ts`)
- `cancelPickupRequest` — no status guard. `reschedulePickupRequest` — none. `assignCarrier` — none.
- `canAddOrdersTo(p, until)`, `canSplitPr` (Requested…Assigned, ≥ 2 orders), `canReattempt`
  (failed, attempts left, no retry yet), `mergePickupRequests` (Requested/Planned, one point, no FTL),
  `closeHandover` (Completed only), `markManuallyPickedUp` (not Cancelled/Completed, no retry),
  `markManuallyFailed` (open), `confirmPickupSlot` (`slotConfirmed === false`), `printManifest` (3PL).

## 3. Where the brief and the old helpers disagreed (the brief wins)
| Helper | Old | Brief / owner rule now |
|---|---|---|
| `can.cancel` (ops) | any open status incl. Out For Pickup | until Out For Pickup ("ops any time before the driver is out"). NOTE spec §6.4 E11 lets ops cancel while the driver is en route — the brief (later) is followed; Out For Pickup → "Already out for pickup — mark it failed instead". |
| `can.assignCarrier` | any status before dispatch, even on a trip | Requested, or Planned / Ready without a trip. On a trip → remove it from the route first. |
| `can.addToRoute` | before dispatch, fleet (on a trip = "move") | Add to route = Requested / Planned with NO trip, fleet, slot confirmed. Moving a routed one is its own action (`moveRoute`). |
| `can.manualPickup` / `can.markFailed` | any open (and Pickup Failed for manual pickup) | Assigned or Out For Pickup only — a request nobody was sent for is rescheduled or cancelled (P6). Consequence: PFP's Mark Pickup Failed (queue = unplanned fleet, always Requested) is now always disabled with that reason. |
| `can.switchToFleet` | any open 3PL | open 3PL, not Out For Pickup |
| Re-attempt vs Reason Policy | `canReattempt` only | brief: ops "Re-attempt now" overrides the policy's Hold; only a `NO_ORDERS` failure with no orders stays disabled (an empty retry is still empty). |
| Slot confirmation | not gated | `slotConfirmed === false` blocks Add to route / Plan collection / Load planning ("from here ops may plan it"). |
| Print label (Grow) | any non-cancelled | unchanged: Cancelled → disabled. |

## 4. Decision
One pure matrix `src/growOrders/prActions.ts` (`prActionState` per row, `prBulkState` for a
selection: enabled only when every row is, plus set rules — one hub, same point, single-row
actions). `prModel.can.*` and `pickupGate.merchantMayChange` delegate to it, so the (locked)
detail pages inherit the rules before they are rewired to show disabled items with reasons.
