# First-mile pickup — how it works, end to end (brief)

*For the CTO review on 24 Sep 2026. Short version of the design spec; the deck follows the
same order.*

## The one-line idea
A **pickup request** is the merchant asking us to collect parcels from one address in one
time window. It is not a new kind of order. It joins the pages that already exist: the
merchant books it in Grow, ops handle it in the console, a driver runs it in the Pilot app,
the hub receives it in Inbound. Managed fleet and outsourced 3PL follow the same request.

## Who does what, where
| Actor | Surface | Does |
|---|---|---|
| Merchant | Grow portal | creates orders, books or reserves a pickup, cancels/reschedules (while allowed), sees the outcome |
| Carrier ops | Console: Consignments · Pickup · Pending for Planning · Control Tower · Inbound | schedules, routes, assigns fleet or 3PL, fixes exceptions, closes handover |
| Driver | Pilot app | starts the trip, scans what is picked, marks what is not, hands over at the hub |
| Hub operator | Inbound scanner | in-scans, catches overage, misroute, damage |
| 3PL carrier | Carrier Portal + events | gets the booking and manifest, reports pickup and handover |

## Life of a pickup request
Requested → Planned (on a route) → Assigned (driver or carrier) → Out for Pickup →
Completed or Partially picked → Handed Over (hub) → Closed.
Side exits: **Cancelled** (merchant early, ops any time before the driver is out) and
**Pickup Failed** (at the door, with a reason; re-attempted automatically next business day
while attempts remain).
Flags, not states: Overdue (window passed, unplanned), Duplicate (same point, overlapping
window), Discrepancy (driver scan and hub scan disagree, checked once the truck reaches
the hub), Re-attempt available.

## How a request is born (seven ways, same result)
Merchant books for ready orders · merchant reserves a slot before orders exist · ops
schedule from the consignment list (Merchant → Pickup Address → select → Schedule) · ops
reserve from the Pickup page · auto-create on consignment (config, off by default) ·
API / bulk upload · add to an existing request. Every path: request Requested, consignments
Pickup Scheduled, visible on Pickup (Active), PFP (Pickups tab) and Grow.

**Several requests a day from one merchant:** policy per account (or per merchant):
one open request per pickup point, one per slot (default — same slot merges, another slot
is a new request), or unlimited with a Duplicate flag. Ops can Merge.
**Same-day cutoff:** book before 12:00 (configurable, per merchant too) for a same-day
slot; after that the earliest slot is the next business day. Every booking dialog says so.

## Changes before the driver leaves
| Change | Merchant | Ops | What happens |
|---|---|---|---|
| Cancel | until Planned (config) | until Out for Pickup | stop leaves the trip, trip shows Attention Required, consignments back to Ready to Ship, other side notified |
| Reschedule | same, inside the reschedule window | same | planned on another day → back to Requested |
| Add consignments | until Planned | until Assigned with a note | never once Out for Pickup — extras become overages |
| Remove one | yes | yes | an empty request fails as "No orders to collect" |
| Switch fleet ↔ 3PL | — | yes | back to Requested, plan again |

## Planning: two paths, one request
**Managed fleet:** PFP → Pickups → Plan Collection for Routing (routing engine) or
Pickup → Add to route (existing route/trip at that hub and date, or a new one) → Control
Tower → Change Assignee → the trip appears on the driver's phone. A route with no driver
is a trip in Un-assigned.
**3PL:** Pickup → Assign carrier (or allocation rules) → booking sent, carrier reference
stored → Carrier Portal lists it → carrier events move it; ops can override.
Unplanned past the window = Overdue in the Exception tab.

## Execution (driver)
Start trip → every pickup on it is Out for Pickup (merchant sees it). At the stop: the
expected list, scan or type each number, mark Not picked with a reason, unknown barcode =
overage (hold / auto-create / reject per config), reserved request = confirm a count,
proof of pickup as configured, swipe Complete → Completed or Partially picked (unpicked go
back to Ready to Ship). Unable to pick up → Pickup Failed with reason → automatic
re-attempt. Driver reports an issue → remaining pickups fail with a carrier-side reason,
trip gets Attention Required, ops reassign.

## Handover: three modes
- **Driver scan only** — custody at the merchant; trip debrief closes it.
- **Hub scan only** — the Inbound scan is the pickup event; driver completes by count.
- **Both (default)** — driver scan = origin custody, hub scan = network custody; the
  request closes only when matched · driver-only · hub-only · never-scanned are all
  resolved. 3PL: printed manifest + carrier acceptance = handed over.
Overage and misroute always surface in Inbound's tabs.

## Exceptions live in one queue
Exception tab = failed with attempts left (and until its re-attempt is done) · partially
picked · discrepancy · overdue. Ops overrides (reason + audit): manually picked up,
manually failed, reschedule, cancel, re-attempt now, add to route, reassign, switch to
3PL, close handover with a note.

## Account switches (Settings → Base Modules → Pickup Request)
Module on/off (turning it off hides only the pickup additions; every current page keeps
working) · auto-create · handover scan mode · max attempts + auto re-attempt · reschedule
window · merchant cancel until · add-to-existing until · proof of pickup · overage policy ·
send to carriers · cutoffs, lead time, slots · multi-request policy · per-merchant rules.
Driver-side switches also appear under Pilot Driver App settings.

## What the prototype shows (routes)
- Grow: `/grow/orders` (Book Pickup with one card per pickup point → hub), `/grow/orders/pickups`
- Console: `/local/consignments` (Schedule), `/local/pickup` (+ `/:id`), `/local/pending-for-planning`
  (tabs), `/local/control-tower` (trips), `/local/inbound` (+ `/scanner`)
- Settings: `/console/settings/base-modules` → Pickup Request
- Driver: `/driver` (Pilot-style; sign in as a driver first)

## Decisions to take tomorrow
Default scan mode (both vs driver-only) · merchant cancel gate (Planned vs Assigned) ·
re-attempt automatic vs ops-triggered · billing per request or per consignment · Carrier
Portal scope for 3PL pickups.

## Demo script (10 minutes)
Start clean: LOCAL sidebar → Demos → **Reset demo data** (reseeds orders, requests and trips).
1. **Grow** `/grow/orders?tab=ready` → select 3 orders across two pickup points → Book
   Pickup → two booking cards → book. Open `/grow/orders/pickups`: a Requested one → Cancel
   asks a reason; an Assigned one → Cancel disabled ("contact support").
2. **Console** `/local/consignments` → Merchant 2GO Express → Pickup Address Cebu Mandaue Hub →
   select the two Created rows → Schedule → one card per destination hub → Schedule; rows read
   Pickup Scheduled with the new PR numbers.
3. `/local/pickup` → Eligible for Pickup → select SO642491M → Add to existing → PR-000122 →
   now 3 consignments. Open PR-000122 → Add to route → Manual → New trip, driver Jun Santos →
   PR Assigned on a new trip.
4. `/local/control-tower` → that trip → Start Trip → stop Complete, untick one (2 of 3) →
   Debrief.
5. `/local/inbound/scanner` → scan NL245500Q and SO251591Z → Received (PR-000122's handover
   reconciles and closes); UNKNOWN-0001 → held overage; a scan on a closed request (e.g.
   GR084982B, PR-000135) → "Already closed — logged". `/local/inbound` → Overage tab →
   Attach / Create / Reject.
6. `/local/pickup` Exception tab → PR-000136 / PR-000129 failed with "Re-attempt · PR-000137 /
   PR-000140"; PR-000134 Discrepancy → Close handover with a note → Handed Over.
7. `/driver` → sign in as a driver with a Yet-to-start trip → Checklist → Loading → Start →
   pickup stop → scan / Not picked / Unable to pick up → Debrief.
8. `/console/settings/base-modules` → Pickup Request → switches; toggle off and show
   `/local/pickup` disabled (link to `/local/settings/pickup`) while Consignments and Control
   Tower trips keep working.

## Not verified live
Steps 2–6 were walked in Chrome on 23 Sep after a fresh load; 1, 7 and 8 were not re-walked
after the hardening pass. Staging's moduleSettings may refuse our own codes
(`PICKUP_REQUEST`, `DRIVER_APP_PICKUP_MODULE`); the console then saves locally and says so.
The routing engine is simulated by trips (routes start Un-assigned, no driver is invented).
Carrier booking, manifest and acceptance are local actions, not a carrier integration.
Proof-of-pickup capture is mocked.

## What changed after you went to sleep (for the morning)
- All local pages (Shipments, Pickup, Control Tower, Inbound) now share the Pending for
  Planning chrome: canvas title bar, tabs on the canvas, one filter line, funnel panel as a
  list of selects. Nav item reads "Shipments"; the page title stays "Consignment Order".
- Create Pickup (FTL): Service type → Vehicle type; Ship to hidden behind "+ Add ship-to
  address"; per-vehicle "Deliver to" only when addresses exist. The cutoff hint line is gone
  (the error still blocks a bad window).
- Console PR detail = "Pickup outcome" (Booked · Picked · Not picked · Overage scans) with
  "+ Add shipments", per-row Remove, and the two-parent markers; Grow's card says the same.
- Grow pickups page tabs = All · Active · Closed · Exception · Eligible for Pickup.
- Audit + hardening: 14 gaps fixed by the audit, 16 decisions implemented (see spec §10).
- "Reset demo data" sits at the bottom of the local sidebar — use it on demo morning.
- I did not use the staging password anywhere (the signed-in tab was enough).
