# `src/pickup` — Pickup Request demo foundation

Self-contained domain layer for the first-mile **Pickup Request (PR)** demo.
No backend, no staging calls. One `PickupDb` in memory, persisted to
`localStorage['fareye-pickup-demo-v1']`, exposed through `useSyncExternalStore`.

```
types.ts   the model (string unions only — tsconfig bans `enum`)
seed.ts    catalogs (MERCHANTS / LOCATIONS / CARRIERS / HUB) + the CTO slide-1 narrative
store.ts   usePickupDb() + pickupActions + pure selectors
```

Import direction is strictly `types → seed → store`. `seed.ts` must never import
from `store.ts`.

---

## Wiring rules (read before writing a page)

- `usePickupDb()` returns the **same object reference** until a mutation. Never
  build a fresh object inside a component's render from a selector that returns
  the db itself; the selectors here already return new arrays, which is fine
  because they run during render, not inside `getSnapshot`.
- Every action ends with `commit()`, which reassigns the root **and every
  collection array** → persist → notify. If you add an action, do the same or
  React will not re-render.
- Because of that, `useMemo(() => rows.filter(…), [db.consignments])` is safe.
  Individual PR / consignment / overage **objects are mutated in place**, so
  never `React.memo` a row on its object identity and never `useMemo` on a
  single row.
- Adding a **required** field to the model? Bump `STORAGE_KEY` to `-v2`.
  `isUsableDb` validates shape, not version — a stale `-v1` blob would pass and
  leave `undefined` where your page expects a value. The carrier fields
  (`carrierCode`/`carrierName` on PR/Trip/consignment) are all **optional**, so
  `STORAGE_KEY` deliberately stays `-v1`: a pre-carrier blob simply renders
  "Unassigned" until the demo is reset.
- **One owner per status transition.** `confirmCount` records a number;
  only `completePickup` decides `COMPLETED` vs `COMPLETED_SHORT`.
  Only `planTrip` sets `PLANNED`. Only `startTrip` sets `IN_PROGRESS`.
- `planTrip` sets `tripId` on consignments and **never touches their `state`** —
  C7/C8 are already `AT_FACILITY` and must stay that way.
- Tracking numbers are matched **piece-wise, case-insensitively**. Nothing
  matches on consignment id.
- `config.trackingRegex` defaults to `^TN-[A-Z0-9-]{4,}$`. Every seeded tracking
  number (`TN-C1-1`, `TN-STRAY-91`, …) passes it. Change one and you must change
  the other, or the scan flow starts calling everything invalid.

---

## Carriers

A **carrier** is who performs the pickup/delivery. `CARRIERS` (in `seed.ts`) is the
catalog; each entry is a `Carrier { code, name, driver, vehicle, mode }` where
`mode` is `'FLEET'` (own/captive) or `'CARRIER'` (external 3PL).

| Code | Name | Driver | Vehicle | Mode |
| --- | --- | --- | --- | --- |
| `CR-SUP` | Supercharged Deliveries *(matches staging)* | R. Sharma | MH-01-AB-1234 | CARRIER |
| `CR-OWN` | Captive Fleet | A. Dubois | QC-04-CF-8821 | FLEET |
| `CR-BLZ` | BlueDart Express | M. Chen | IL-77-BD-3390 | CARRIER |

A **PickupRequest, Trip and DemoConsignment** each carry an optional
`carrierCode` + `carrierName`. All three are optional — undefined ⇒ the UI shows
**"Unassigned"**. Set them from `CARRIERS[code]`; don't invent free-text names.

- **On a PR:** pass `carrierCode` to `createPickupRequest`, or set/reassign later
  with `assignCarrier(prId, carrierCode)` (logs a "Carrier assigned" PR event).
- **On a trip:** `planTrip` resolves the effective carrier as
  `input.carrierCode` → else the carrier of the **first selected PR**
  (`prById(db, prIds[0])`) → else undefined. When a carrier resolves, the trip's
  `driver`/`vehicle` come from it; otherwise the legacy `DRIVER`/`VEHICLE`
  fallback (`R. Sharma` / `MH-01-AB-1234`) is used.
- **On a consignment:** seeded per row so the Pending-for-Planning carrier column
  populates. `pushSoftData`-born `CX-*` rows inherit no carrier (Unassigned).

**Routing from anywhere.** There is one routing action — `planTrip`. Any surface
(the PR listing, Pending-for-Planning, a PFP screen) initiates routing by calling
it with the selected `prIds` / `consignmentIds` and an optional `carrierCode`.
There is no separate "route from X" entry point to build.

---

## State machines

### Pickup Request (`PRStatus`)

```
                      cancelPickupRequest
        ┌───────────────────────────────────────────► CANCELLED
        │
     OPEN ──planTrip──► PLANNED ──startTrip──► IN_PROGRESS
        ▲                                          │
        │                                          ├─ completePickup ─► COMPLETED
        │                                          │                    COMPLETED_SHORT
        │                                          └─ failPickup ─────► FAILED
        │                                                                 │
        └──────────────── reattemptPickupRequest ─────────────────────────┘
                          (new PR, attempt+1, parentPrId ↔ reattemptPrId)
```

- `COMPLETED_SHORT` = at least one expected piece was not collected, or the
  confirmed count came in under `expectedPieces`.
- `CANCELLED` releases linked consignments (`linkedPrId = null`).
  `FAILED` does **not** — the re-attempt inherits them.

### Consignment (`ConsignmentState`)

```
CREATED ──(PR raised: linkedPrId set, state unchanged)──► CREATED
   │
   ├─ completePickup, something collected ─► PICKED_UP ─ debrief ─► AT_FACILITY
   │
   └─ completePickup, nothing collected ──► CREATED, linkedPrId = null, tripId = null
                                            (back in the pending pool)
```

**Release semantics.** A first-mile consignment that was planned onto a trip also
carries a delivery stop. When nothing is collected for it, `completePickup`
releases it *fully* — clears `linkedPrId` **and** `tripId`, drops it from
`trip.loads.lastLeg`, and marks its delivery stop `FAILED`. Without the `tripId`
clear it would be invisible to `pendingForPlanning` forever. `failPickup` does the
same to the trip/`tripId` side but keeps `linkedPrId`, because
`reattemptPickupRequest` moves those consignments onto the new attempt.

`PICKUP_PLANNED`, `OUT_FOR_DELIVERY`, `DELIVERED`, `RTO` exist in the type for
downstream pages; the foundation actions do not set them.

`amberException` is orthogonal to `state`: it is raised by `addFieldPiece`,
`attachOverageToConsignment` and a short/damaged `skuPick`, and cleared by
`updatePieceCFT` once every `addedInField` piece is `verified`.

### Overage

```
scanPiece (unknown label)      ─┐
addUnlabeledOverage            ─┴► CREATED ── debrief ──► AT_FACILITY
                                       │
        pushSoftData (validTracking)   ├──► reconciled = true, reconciledConsignmentId = CX-n
        attachOverageToConsignment     └──► reconciled = true, reconciledConsignmentId = <existing>
```

`kind`: `UNKNOWN_SCAN` (a label we did not expect) · `UNLABELED` (goods with no
label, one row each) · `UNLABELED_GROUP` (same, captured as one bundle via
`groupId`).

### Trip

`PLANNED` → `startTrip` → `IN_PROGRESS` → `debrief` → `COMPLETED`.
Stops: `PENDING` → `arriveStop` → `ARRIVED` → `completePickup`/`failPickup` →
`DONE`/`FAILED`.

---

## Selectors

| Selector | Returns |
| --- | --- |
| `prById(db, id)` | one PR |
| `consignmentById(db, id)` | one consignment |
| `tripById(db, id)` / `overageById(db, id)` | one trip / overage |
| `consignmentsForPr(db, prId)` | the PR's consignments, resolved |
| `overagesForPr(db, prId)` / `overagesForTrip(db, tripId)` | overage rows |
| `openOverages(db)` | `!reconciled` — the CO Overages tab worklist |
| `amberConsignments(db)` | consignments awaiting CFT verification |
| `livePrsAt(db, merchant, location)` | OPEN/PLANNED PRs — duplicate-raise check |
| `unlinkedFirstMileAt(db, location, merchant?)` | pending pool at one location |
| `pickupProgress(db, prId)` | `{ expected, collected, overages }` |
| `pendingForPlanning(db)` | `{ prs, consignments }` — see below |

**`pendingForPlanning` contract** (PRs *replace* the consignments they carry):

- `prs` → `status === 'OPEN'`
- `consignments` → `tripId == null` **and**
  - `LAST_MILE`: `state` is `CREATED` **or** `AT_FACILITY`
  - `FIRST_MILE`: `state === 'CREATED'` **and** `linkedPrId == null`

So with the seed the page shows PR-0002 and PR-0005 (the two OPEN PRs), plus
consignments C4, C5, C7, C8. PR-0001 is IN_PROGRESS on the live trip T-0002 and
PR-0004 COMPLETED / PR-0003 FAILED — all excluded. C1/C2/C3 carry `tripId: T-0002`
(and C6 is linked to PR-0005), so they drop out of the consignment pool. C9 and
CX-1 are first-mile `AT_FACILITY` → excluded.

Consequence, decided deliberately: the consignments `pushSoftData` creates
(`CX-*`, first-mile + `AT_FACILITY`) are **terminal in this demo** — the reconcile
story ends at "a real consignment now exists"; planning their last leg is out of
scope. Relax the `FIRST_MILE` branch to accept `AT_FACILITY` if a later page
needs it, and update the seed inventory below when you do.

---

## Actions — `pickupActions`

| Action | Signature | Call it from |
| --- | --- | --- |
| `createPickupRequest` | `(input: CreatePrInput) => { pr?, conflict? }` | Add PR page, Grow portal, API/CFT simulators. `input.carrierCode?` sets the PR's carrier (resolved from `CARRIERS`; omit ⇒ Unassigned). Returns `{ conflict }` and creates nothing when `config.multiPrPolicy` forbids it — re-call with `force: true` to override. |
| `mergeIntoPickupRequest` | `(prId, consignmentIds[]) => PickupRequest?` | "Add to existing PR" on the pending pool. For a non-blind PR it recomputes **both** `expectedPieces` **and** `expectedWeightKg` from the linked consignments. |
| `assignCarrier` | `(prId, carrierCode) => PickupRequest?` | Set/reassign a PR's carrier from `CARRIERS`; logs a "Carrier assigned" event. No-op safe (returns `undefined`) if the PR or code is unknown. |
| `cancelPickupRequest` | `(prId, reason) => void` | PR detail kebab. |
| `reattemptPickupRequest` | `(prId) => PickupRequest?` | PR detail on a FAILED PR. |
| `planTrip` | `({ prIds, consignmentIds, carrierCode? }) => Trip` | Pending-for-Planning / PR listing / PFP "Plan trip" — the single routing action. `carrierCode?` overrides; otherwise the first selected PR's carrier drives the trip's driver/vehicle. |
| `startTrip` | `(tripId) => void` | Driver app "Start trip". |
| `arriveStop` | `(tripId, seq) => void` | Driver app stop card. |
| `scanPiece` | `(prId, tn) => ScanResult` | Driver app scanner. |
| `addFieldPiece` | `(prId, consignmentId, Partial<Piece>) => Piece?` | Driver app "Add piece". |
| `addUnlabeledOverage` | `(prId, count, note, together) => string[]` | Driver app "Unlabeled goods". |
| `confirmCount` | `(prId, count) => { short }` | Driver app count-based pickup. |
| `skuPick` | `(prId, consignmentId, skuCode, { picked, missing, damaged }) => void` | Driver app SKU screen (C6). |
| `completePickup` | `(prId) => { status, collected, expected }` | Driver app "Complete pickup". |
| `failPickup` | `(prId, reason) => void` | Driver app "Cannot pick up". |
| `debrief` | `(tripId, confirmedCount) => void` | Facility handover screen. |
| `pushSoftData` | `() => number` (rows reconciled) | Demo button "Merchant sends soft data". |
| `attachOverageToConsignment` | `(overageId, consignmentId) => void` | Overages tab, manual match. |
| `updatePieceCFT` | `(consignmentId, tn, Partial<Piece>) => void` | CFT verification of a field piece. |
| `setConfig` | `(Partial<PickupConfig>) => void` | Pickup settings. |
| `upsertAutoRule` | `(AutoCreateRule) => void` | Pickup settings → auto-create rules. |
| `autoCreateFromRules` | `() => PickupRequest[]` | Demo button / scheduler simulation. |
| `resetDemo` | `() => void` | "Reset demo" control. |

`ScanResult.hit`:

| value | meaning | UI |
| --- | --- | --- |
| `PIECE` | expected piece captured | green tick, progress++ |
| `DUPLICATE` | already scanned on this PR | soft warning, no state change |
| `OTHER_CONSIGNMENT` | the label belongs to a consignment not on this PR | offer "merge that consignment into this PR" |
| `OVERAGE` | unknown label — an Overage row was created | amber banner, keep going |

---

## CTO's 7 mobile use cases → actions

| # | Use case | Actions |
| --- | --- | --- |
| 1 | Scan-based pickup, everything present | `arriveStop` → `scanPiece` × n → `completePickup` (→ `COMPLETED`) |
| 2 | Short pickup — expected but not handed over | `scanPiece` for what's there → `completePickup` (→ `COMPLETED_SHORT`; untouched first-mile consignments return to the pending pool) |
| 3 | Overage — scanned but not expected | `scanPiece` returns `hit: 'OVERAGE'`; resolve later via `pushSoftData` or `attachOverageToConsignment` |
| 4 | Blind pickup — no soft data at all (PR-0002) | `confirmCount` or repeated `scanPiece` (every label becomes an overage) → `completePickup`; `pushSoftData` turns the overages into consignments |
| 5 | Count-based / non-scannable (C6, carried by **PR-0005**) | `skuPick` per SKU, or `confirmCount` for a pure piece count → `completePickup` |
| 6 | Unlabeled or extra goods at the doorstep | `addFieldPiece` (belongs to a known consignment) or `addUnlabeledOverage` (does not) — both raise `amberException` / an overage for CFT |
| 7 | Failed pickup + re-attempt (PR-0003) | `failPickup(reason)` → `reattemptPickupRequest` (attempt+1, `parentPrId` ↔ `reattemptPrId`) |

Facility close-out for all of the above: `debrief(tripId, confirmedCount)`.

**Count-based / SKU screens are now reachable.** `PR-0005` (OPEN, non-scannable,
`skuMode: true`) carries `C6`, so the driver app's count-counter and SKU-picking
screens have a live PR to run against — before this seed, `C6` was unlinked and
those screens were dead. Caveat: `C6` has `pieces: []` and `PR-0005.expectedPieces`
is `null`, so `pickupProgress(db, 'PR-0005')` reports `expected: 0`. That means the
count-based flow on this PR can **never** go `COMPLETED_SHORT` (`confirmCount`'s
short test is `expected > 0 && count < expected`). Drive short-count against a
piece-based PR; drive SKU picking (with missing/damaged → amber) against PR-0005.

---

## Seed inventory

| Entity | Rows |
| --- | --- |
| Merchants | `M-EBW` Ebenisterie L'Art et le Bois (`LOC-LAVAL`), `M-TSC` Tractor Supply Co. (`LOC-CHI`) |
| Carriers | `CR-SUP` Supercharged Deliveries (CARRIER) · `CR-OWN` Captive Fleet (FLEET) · `CR-BLZ` BlueDart Express (CARRIER) |
| Hub | `ORD Sorting Center` |
| Consignments | `C1 C2 C3` (O1, first-mile Laval, PR-0001, **on live trip `T-0002`**, `CR-SUP`) · `C4 C5` (O2, first-mile Chicago, **unlinked pending pool**, `CR-OWN`) · `C6` (O2, non-scannable/2 SKUs, now linked to **PR-0005**, `CR-OWN`) · `C7` (last-mile `AT_FACILITY`, `CR-SUP`) · `C8` (last-mile `AT_FACILITY`, `CR-BLZ`) · `C9` (first-mile, picked up under PR-0004, `tripId: T-0001`, `CR-SUP`) · `CX-1` (born from soft data, `CR-SUP`) |
| Pickup Requests | `PR-0001` **IN_PROGRESS** scan-based on live trip `T-0002` (driver arrived), today 10:00-12:00, `CR-SUP` · `PR-0002` OPEN **blind**, 5 pieces, today 14:00-16:00, `CR-OWN` · `PR-0003` **FAILED** blind, 3 pieces, yesterday 08:00-10:00 ("Location closed"), `CR-SUP` · `PR-0004` COMPLETED yesterday (trip `T-0001`) with a 9-line timeline, `CR-SUP` · `PR-0005` OPEN **count-based + SKU** (non-scannable), carries C6, today 16:00-18:00, `CR-OWN` |
| Overages | `OVG-0001` reconciled → `CX-1` · `OVG-0002` `TN-STRAY-91`, `AT_FACILITY`, **open** (both reference trip `T-0001`, now a real trip) |
| Trips | `T-0001` — yesterday's **COMPLETED** history (`CR-SUP`, PICKUP PR-0004 + DELIVERY C9, both DONE). `T-0002` — today's **IN_PROGRESS** live trip (`CR-SUP`, PICKUP PR-0001 `ARRIVED` + DELIVERY C1/C2/C3 `PENDING`), so `/driver` opens directly into an active scan-based pickup. With `T-0001` + `T-0002` present, `nextTripId()` returns **`T-0003`** for the user's first live-planned trip (no collision). |
| Config | `multiPrPolicy: 'ONE_PER_SLOT'`, five 2-hour slots 08:00→18:00, `trackingRegex`, one **disabled** auto-create rule (`M-EBW` @ `LOC-LAVAL`) |

All dates are computed from `new Date()` (`isoDate`, `isoAt` in `seed.ts`), so the
demo never goes stale.
