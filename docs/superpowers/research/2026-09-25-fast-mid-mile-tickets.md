# Fast Logistics mid-mile stories — Line Haul vs Load Planning, what exists, what to discuss (2026-09-25)

Tickets: SED-11779 (Load Planning ↔ Line Haul sync), SED-11782 (mid-mile driver app + hub-based
inbound restriction), SED-11785 (leg in Inbound + Pending/Incoming counts for FM/LM). All three:
Story, Backlog, team CFT, customer Fast Logistics, raised by CS 2026-09-08, no Product Area, one
comment each (owner asked the account team for a meeting, 2026-09-11).

Sources: Nalanda KB (xdock-hub-operations, consignment-data-model, shipment-entity-* codebase docs,
synthesis-consignment-control-tower, roadmap-2026-2027 — all reviewed Aug 2026, none STALE), the SED
index (~80 tickets read), and this repo. **Customer Pulse refused access to the FAST account**, so
there is no email/meeting signal here. The KB has NO standalone doc for Line Haul, Load Planning or
Inbound; no staging screen of the Line Haul Run, Load Planning or Inbound leg display was ever
captured in this repo.

## 1. What the two modules handle

**Line Haul = mid-mile EXECUTION, scan-based (X-Dock product, "Long Haul Dispatch" / Line Haul Run).**
- Master data: **Lane** (`POST /master/api/v1/lane/fetch`; ordered stops with STA/STD, docking and
  travel hours, mode Road/Air/Sea/RoRo, max weight/volume, preferred transporter) and **Hub To Hub**
  (origin → destination → next facility; the next-hop table). A mid-mile leg is created only when a
  hub-to-hub lane exists (SED-7372, SED-10440); "skip mid-mile" = don't configure one (SED-9844).
- Runtime: **Run** (a scheduled journey over ≥ 1 facilities) made of **Connections** (one hop);
  states CREATED → LOADING → SEALED → IN_TRANSIT/DISPATCHED → AT_FACILITY → UNLOADING → UNLOADED →
  COMPLETED. Bags, seals (destination must enter the matching seal), containers, manifests, trailer +
  carrier selection (SED-7627/7628), per-role tabs Incoming / Loading / In transit / Completed
  (SED-7678). Dispatch pushes IN_TRANSIT to connections, bags and shipments; unloading at the
  destination sets AT_FACILITY (SED-10818). A shipment on Hold is refused into a bag (SED-10290).
- Milestones are **hub-operator actions** (create run, dispatch, arrive, unload) on web or the
  floor-supervisor / driver app (active "Mid Mile" mobile stream: create bag, create run, inbound
  scanner — SED-12786, 12600, 12471). A driver-side "driver assigned" event was rejected (SED-7066).
  After handover to a 3PL, FarEye only receives statuses.

**Load Planning = mid-mile (and FM/LM) PLANNING and tendering (SES module `LOAD_PLANNING`,
`/v2/ses/load-planning`; roadmap "in build — most active item", CFT + Route).**
- Groups consignments into **Loads per leg** (FM / MM / LM tag per order, mixed loads FM+MM etc.
  SED-6870/6350), tenders a load to a carrier (Carrier Portal accept/reject), assigns trailers and
  prime movers (SED-7900), emits carrier/asset and per-leg dispatch events (SED-9118, SED-8587), copies
  route details for ETA (SED-8497). Assignment raises an exception if an earlier leg (e.g. inbound) is
  incomplete (SED-8492). Legs themselves come from the same Hub-to-Hub master.
- The ONLY double-planner guard today is between Load Planning and Routing: "Plan for Routing" /
  "Add to Best Route" are hidden on mid-mile legs (SED-9339, SED-10336). **Nothing links a Load to a
  Run or a bag** — no ticket, no doc, no event.
- "Count-based vs scan-based" is not a documented module distinction. Count-based INBOUND exists via
  `scannable=false`; FAST asked for count-based inbound twice and both were closed as already
  supported (SED-10283, SED-11778).

**Inbound today.** `UniversalInscan` rejects only a duplicate scan at the same facility and
CANCELLED/DELIVERED; anything else can be in-scanned to AT_FACILITY. Cross-hub inbound is ALLOWED by
design and flagged "misroute" (SED-11084 rejected a notification). Ad-hoc inbound (without inbounding
the run from Incoming) skips the seal check (SED-12129). The Incoming "pending to unload" count
(`next_facility_pending_count`) is mid-mile only (SED-7685/8734; SED-7155 count bug in the Wk 39
sprint). First mile: a consignment appears in Inbound Pending only once picked up, else Incoming
(SED-1528; SED-3063 "restrict inbound until pickup" rejected as already done). Hub restriction by the
user's hub was pushed back as infeasible for admins (SED-10391). Legs are inferred from skip-inbound
attributes (SED-7493). Base Modules → General Settings has `inbound` = AT_ORIGIN / AT_DESTINATION /
AT_MID_MILE / NOT_REQUIRED.

**Leg rule (staging, FAREYE-APIS.md §leg matrix):** FM iff `shipFrom.address.code` is a merchant code
and SKIP FM INBOUND = NO; MM iff ship-from facility ≠ ship-to facility AND X-Dock is configured; LM
always. Consignment legs are records with a sequence (SED-9032/9248); per-leg visibility on CO / PFP
is in development (SED-11447).

## 2. What this prototype has

First mile + last mile only. Mid-mile appears as (a) the console's LIVE Lane / Hub To Hub / Load Type
masters (`src/nueva/masters/laneMovement.tsx`), (b) an `MM` leg label that the PFP folds into Last
Mile (`LocalPFP/adapter.ts` `legsOf` / `activeLegOf`), (c) unused `LoadPlan` store code
(`planningStore.ts`). `/local/inbound` lists pickup handovers only (Incoming · Pending · Misroute ·
Overage · Damage · Completed), has no leg column, the scanner's hub is a free dropdown, the only gate
is "not picked", and the scan itself is the proof of arrival. Trips have no hub-to-hub stop; the driver
app is pickup/delivery only; `generalSettings.inbound` is stored and read by nothing.

## 3. Per ticket — what exists, what is new, what to settle

### SED-11779 — Load Planning ↔ Line Haul sync (genuinely new)
Exists: legs from Hub-to-Hub; LP↔Routing guard (SED-9339/10336) as the pattern; events
`consignment::added-to-load / removed-from-load`, `bag::added-to-bag`, `runconnection::*`.
Settle: (1) which object is the system of record for a mid-mile leg plan — Load or Run/Connection;
(2) what "planning initiated in Line Haul" means — added to bag, bag loaded to connection, or run
created; (3) the rule direction — LH first blocks LP (the ask), and does LP first block a bag scan
too; (4) how FAST decides scan-based vs count-based per lane/hub/consignment type, and whether
"count-based mid-mile" just means Load Planning on `scannable=false` orders; (5) rollback — removed
from bag / load → eligible again; (6) UI — a "Planned via Line Haul" state and exclusion in the LP
eligible list, mirroring the routing guard. Link: SED-7372, SED-2289 (load board with Outbound /
Inbound Line Haul tabs), SED-9339/10336, SED-6350, SED-8492.

### SED-11782 — two asks in one story; split them
**(a) Mid-mile driver app (Departed / In Transit / Arrived).** Nothing driver-facing exists; run
milestones are hub-operator actions. Settle: whose driver (own fleet vs 3PL — for 3PL FarEye only
ingests statuses); is this moving Dispatch / Arrive to the driver's phone, or a new line-haul trip in
Pilot; which of the existing run/connection events the taps map to (`runconnection::dispatched`,
`::arrived`); Driver App team owns it, not CFT. Link: SED-7066 (rejected), SED-6959 (rejected),
SED-7678 (run stages), Pilot X-Dock module codes.
**(b) Hub- and milestone-based inbound restriction.** Reverses two deliberate decisions: misroute
inbound allowed (SED-11084) and ad-hoc inbound (SED-12129). Settle: block vs warn vs override-with-
reason; scope — only consignments on a run (gate = the connection's `arrived` at this facility), and
what happens to ad-hoc, first-mile and misroute scans; hub binding vs admin roles (SED-10391);
source of "physically arrived" — driver tap, seal entry, or telematics; whether `AT_MID_MILE` in
General Settings is the switch. Link: SED-1528/3063 (the first-mile twin rule), SED-11084, SED-12129,
SED-10391.

### SED-11785 — leg in Inbound + FM/LM counts (new, builds on existing work)
Exists: the leg matrix; mid-mile Incoming pending count (SED-7685/8734, bug SED-7155); FM
Incoming-vs-Pending rule (SED-1528); legs via skip-inbound flags (SED-7493); per-leg visibility in
flight (SED-11447 — reuse it). Settle: (1) "leg being inbounded" for a multi-leg consignment = the leg
whose next facility is this hub — confirm; (2) definitions — Incoming (dispatched towards this hub,
not yet scanned) vs Pending (arrived / debriefed, not scanned) per leg, and for LM what counts as
"dispatched to me"; (3) surfaces — Inbound web only, or also the mobile inbound scanner and the ops
dashboard Pendency cards (Pending Inbound / Pending Mid-Mile Dispatch); (4) scannable=false rows.

## 4. Cross-cutting
- All three have no Product Area (CFT choices: Inbound, Load Planning, Mid mile x-dock). Not set —
  the owner decides.
- FAST's Grow "[FL]" batch (SED-11904…11917, 11710, 11711) was closed 2026-09-22 "to create a new
  story breakdown based on the finalised solution for Fast Logistics"; SED-11037 (multi-leg from
  Grow), SED-10848 (blind pickup + FTL), SED-8236/8237 are still "solution not finalised". These
  three belong to that same solution design, not three isolated meetings.
- Ownership spans CFT (shipment-entity, PFP, LP APIs), Route (planning engine), Final Mile CT
  (shipment-ui) and Driver App (mobile) — the meeting needs all four or the split stories will stall.
- Count-based inbound has been declined twice for FAST as already supported; if the discussion drifts
  there again, that is a re-open, not a new ask.
- Missing evidence to close before the meeting: a staging capture of the Line Haul Run page, the Load
  Planning page and the Inbound page (needs a login), and FAST's Pulse signal (needs Pulse access).
