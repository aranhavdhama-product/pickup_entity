# First-mile pickup — domain research (2026-09-23)

Research notes compiled for the pickup workflow program. FarEye publishes no help
center, so FarEye-specific facts come from this repo's reverse-engineered notes
(`FAREYE-APIS.md`, `FAREYE-GROW-APIS.md`, `FAREYE-SETTINGS-APIS.md`) and FarEye blogs;
competitor facts come from their public docs. **[rec]** marks a design recommendation
rather than a documented fact.

## FarEye-specific findings

- **A pickup is a leg, not an order type.** An FM (first-mile) leg is generated when
  `shipFrom.address.code` is a merchant/DC code; FM → MM → LM comes from address and
  facility codes. `SKIP FM INBOUND` is a tenant setting that suppresses the FM leg.
- **Pickup field vocabulary** (bundle): `pickupStartDateTime`, `pickupEndDateTime`
  (flat `yyyy-MM-dd HH:mm:ss`), `pickupServiceTime`, `pickupLocation`,
  `pickupYardLocation`, `PICKUP_WINDOW`; container variant `PICKUP_EMPTY`/`PICKUP_LADEN`.
- **Endpoints:** `/v2/pickups`, `/v2/pickups-locations`, `/v2/consignments-dispatch` and
  `-dispatchbyduration` (carrier handover), `/v2/consignments-cancel`, `/v2/confirm-slot`.
  Grow: `shipments/bookPickup`, `bookPickupConsolidatedRates`, `bookPickupConsolidatedLabel`,
  `pickupRequests`, `getHandoverFileUrl` / `uploadHandoverFile` (handover manifest).
- **Pending For Planning feeds routing** two ways: direct (`isConsignmentEnabled`, parcel /
  CEP) or via Load Planning (`isLoadPlanningEnabled`, B2B LTL/FTL). Related settings:
  `PENDING_FOR_PLANNING`, `CARRIER_PORTAL`, `NEW_CONTROL_TOWER_MODULE`,
  `DRIVER_APP_HANDOVER_MODULE`, `DRIVER_APP_XDOCK_CONFIG`.
- **Staging Base Modules** (`/v2/custom_settings/master-service/modules`, captured live):
  General Settings, OPS Dashboard, Consignment Order, Pending For Planning, Load Planning,
  Carrier Portal, Geo Coding, Enable Routing, Put Away, Last Mile Loading. Each card =
  icon · title · subtitle · toggle · chevron. A module page (e.g. Consignment Order →
  "Orders") has tabs General (User Types checkboxes + Feature Settings rows with segmented
  choices, Reset / Save Settings) · Date Filter · Table Configuration · On Page Filters.
  Data: `POST /master/api/v1/moduleSettings/fetch`.
- **Control Tower** (`/v2/last-mile/control-tower`): tabs Consignment Order · Trips · Map
  Tracking · History Tracking; date range + City/Hub/Driver/Carrier filters; KPI cards
  (Order Status early/on-time/delayed, Attempts, Orders At Risk); state chips
  (At Facility / In Transit / Delivered / Delivery Failed); table with Actions column.
  **Trips already exist here — pickup routes must surface as trips, not a new page.**
- FarEye first-mile blog capabilities: pickup scheduling against origin and facility
  windows, volume forecasting by merchant/zone, barcode scanning, electronic proof of
  pickup (timestamp, signature, quantity/condition, images), geofenced arrival/departure,
  missed-pickup alerts, on-time hub arrival before cutoffs, inserting pickups into active
  routes.

## (a) Recommended state machine [rec]

| From | To | Trigger / who |
|---|---|---|
| — | **Requested** | Merchant (portal/API) or auto-create on consignment (config) |
| Requested | **Planned** | Ops adds the PR to a route/trip (PFP → routing, or Load Planning) |
| Requested / Planned | **Carrier Assigned** | Carrier allocation for outsourced pickups |
| Planned | **Assigned** | Driver/vehicle assigned (manual or auto) |
| Assigned | **Out for Pickup** | Driver starts the trip |
| Out for Pickup | **Arrived** (optional) | Geofence entry |
| Out for Pickup / Arrived | **Picked Up / Partially Picked / Pickup Failed** | Driver scans + proof; outcome derived from scanned vs expected |
| Picked / Partial | **Handed Over** | Hub in-scan or 3PL manifest acceptance |
| Handed Over | **Closed** | Reconciliation complete |
| Pickup Failed | **Requested** (re-attempt) | Auto next business day while `attempts < maxAttempts`, else Closed-Failed |
| Requested / Planned / Assigned | **Cancelled** | Merchant before cutoff; Ops any time before Out for Pickup |
| any pre-terminal | **Manual Picked / Manual Failed** | Ops override with reason + audit |

Consignment states in parallel: Ready to Ship → Pickup Scheduled → Out for Pickup →
Picked Up → Inscanned at Hub. Cancelling a PR reverts consignments to Ready to Ship
(Delhivery). Evidence: Delhivery 4 PR states; Shiprocket 5 incl. Partial Pickup and
Pickup Exception + retryable Pickup Error; Bringg separates carrier-side cancellation.

## (b) Eligibility rules

1. Status gate: only "Ready to Ship" consignments join a PR; one active PR per consignment.
2. Same pickup point: one PR = one pickup address. [rec] allow several PRs per location
   but flag overlapping windows as duplicates.
3. Grouping key [rec]: (pickup location, service type, window) + destination hub for direct
   linehaul; FTL = one PR per order.
4. Cutoff: per-postcode cutoff + lead time (FedEx `cutoffTime`, Amazon ≥ 2h before slot).
5. Serviceability + capacity (weight/dims limits, vehicle capacity on allocation).
6. Add to EXISTING PR: while Requested or Planned and before cutoff; Assigned needs an ops
   override + re-sequencing ("insert into active route"); Out for Pickup = nothing added,
   extras become overages.

## (c) Exceptions and manual overrides

Reason codes — merchant-side: not ready / packing incomplete; premises closed; wrong
address; label missing / packaging improper; handover delayed past slot; cancelled at door;
overweight / dims mismatch; damaged refused. Carrier-side: rider no-show; capacity
insufficient; wrong time/location; false attempt. System: Pickup Error (retryable).
Retry: max attempts (Shiprocket 2/day, auto next business day; Amazon same slot next day).
[rec] `maxAttempts` default 3, reschedule window ≤ 7 days.
Manual overrides (ops, reason + audit): Manual Picked Up, Manual Failed, Reassign
driver/carrier, Reschedule, Cancel, Force-close with discrepancy.
Partial: short pickup → unpicked back to Ready for Pickup or a new PR; overage scans held
until converted to a consignment or rejected.

## (d) Handover scan model (3 cases)

1. **Driver scan only** — origin custody at the merchant with proof of pickup
   (signature/photo/OTP configurable, Onfleet-style required/enabled/off).
2. **Hub scan only** — hub in-scan is the pickup event (drop-off, bulk).
3. **Both + reconciliation (default)** — buckets: matched; driver-scanned not hub-scanned
   (lost in transit → alert); hub-scanned not driver-scanned (overage); expected never
   scanned (short). PR closes only when every bucket is resolved. Outsourced 3PL: carrier
   allocation assigns carrier + AWB, manifest = proof of handover (`uploadHandoverFile`),
   carrier returns a confirmation ref (`carrierPickupRef`), Control Tower monitors SLA.

## (e) Account-level config keys [rec]

`pickupModule.enabled` · `autoCreatePickupOnConsignment` · `groupingKey` ·
`ftlOnePickupPerOrder` · `cutoffTime` + `bookingLeadTimeMins` · `slotDefinitions` ·
`maxWindowDays` · `maxAttempts` · `autoRescheduleOnFail` · `rescheduleWindowDays` ·
`merchantCancelUntil` · `allowAddToExistingUntil` (Requested | Planned | Assigned) ·
`podRequirements` {signature, photo, otp, notes} · `scanMode` (driver | hub | both) ·
`geofenceAutoArrive` + radius · `overagePolicy` (hold | auto-create | reject) ·
`pickupSlaMins` · `sendToCarrier` · `skipFmInbound`.

## (f) UI taxonomy

Tabs with counts: All · Active (Requested/Planned/Assigned/Out for Pickup) · Closed
(Picked Up, Handed Over, Closed, Cancelled) · Exception (Failed, Error, Overdue,
Discrepancy, Partial). Bulk "Schedule Pickup (n)" from the consignment list grouped by
the grouping key with a preview of groups (location → hub, count, weight). Derived flags:
Overdue (window end), Duplicate, Reserved, Attempt n of N. Detail page: PR ref + carrier
ref header, event timeline (who/when/proof), expected vs picked vs overage tables, actions.

## (g) Sources

FarEye blogs (first-mile-delivery-logistics, first-mile-tracking, carrier-allocation),
Delhivery help (pickup-request), Shiprocket support (pickup ID statuses, manifest, pickup
exception), Shadowfax (pickup exception), Shipsy (first-mile pickup, geofence auto-swipe),
FedEx Pickup API, UPS Pickup.yaml, DHL MyDHL API, EasyPost pickups, Amazon SP-API Easy Ship,
Onfleet completion requirements, Bringg delivery-hub statuses.
