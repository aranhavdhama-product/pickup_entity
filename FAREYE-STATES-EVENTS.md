# FarEye — consignment states, sub-states and the event catalog

Supplied by the owner on 2026-09-24 (the platform's own lists). This is the vocabulary the
prototype must speak; `src/growOrders/fareyeEvents.ts` carries the machine-readable subset
the auto-pickup module reads. Detail on APIs lives in FAREYE-APIS.md; gotchas in FAREYE-QUIRKS.md.

## Primary states (lifecycle order)

| # | Primary state | Notes |
|---|---|---|
| 1 | PENDING | data-validation failed / awaiting population |
| 2 | CREATED | sub: LABEL_GENERATED |
| 3 | PICKUP_REQUESTED | a pickup request exists — comes BEFORE Ready To Ship in the lifecycle |
| 4 | READY_TO_SHIP | |
| 5 | INTRANSIT | sub: DISPATCHED |
| 6 | PARTIAL_AT_FACILITY | |
| 7 | AT_FACILITY | sub: STORED, MISSING, LOADED, READY_FOR_LAST_MILE_DISPATCH, STAGING_STARTED, SCHEDULED, UNPLANNED, REQUEST_FOR_RESCHEDULE, LOADED_ON_LASTMILE, PARTIALLY_LOADED_ON_LASTMILE, NOT_LOADED_ON_LASTMILE, STAGED |
| 8 | DRIVER_OUT | sub: OUT_FOR_DELIVERY, OUT_FOR_PICKUP, OUT_FOR_SERVICE, NEXT_IN_ROUTE |
| 9 | REACHED_LOCATION | sub: AT_PICKUP_LOCATION, AT_DELIVERY_LOCATION |
| 10 | PICKEDUP | sub: PARTIALLY_PICKEDUP |
| 11 | PICKUP_FAILED | |
| 12 | DELIVERED | sub: PARTIALLY_DELIVERED |
| 13 | UNDELIVERED | |
| 14 | SERVICE_COMPLETED | |
| 15 | SERVICE_FAILED | |
| 16 | RTO_INITIATED | sub: PERMANENT_DAMAGE |
| 17 | RTO_IN_PROGRESS | |
| 18 | RTO_DRIVER_OUT | sub: OUT_FOR_RTO |
| 19 | RTO_RECEIVED_FROM_CARRIER | |
| 20 | RTO_COMPLETED | |
| 21 | LOST | |
| 22 | CANCELLED | |

Sub-states with **no parent** (they ride on whatever primary state is current):
DRIVER_ASSIGNED_FOR_DELIVERY · DRIVER_ASSIGNED_FOR_PICKUP · DRIVER_ASSIGNED ·
DRIVER_ASSIGNED_FOR_SERVICE · DRIVER_ASSIGNED_FOR_RTO · PLANNED · SERVICE_PARTIALLY_COMPLETED.

The console shows primary states title-cased ("Ready To Ship", "Driver Out", "Pickedup") and
sub-states as the **Secondary State** column ("Label Generated", "Out For Delivery").

## Auto pickup — which events can raise the request

The pre-pickup lifecycle is CREATED (2) → PICKUP_REQUESTED (3) → READY_TO_SHIP (4): the
platform raises the pickup request off a **CREATED** consignment, so the trigger is one of the
events that fire between creation and readiness. The module setting *"Raise auto pickup on
event"* offers exactly these (all on the consignment/shipment entities; L1 = customer-visible,
L2 = ops-only), with the local condition the prototype evaluates for each:

| Event | Level | Meaning on the platform | Local condition |
|---|---|---|---|
| `consignment::created` | L1 | the consignment exists | live consignment (not draft, not cancelled) |
| `shipment::label-generated` | L2 | label printed — parcel physically ready **(default)** | paid |
| `consignment::geo-coordinate-updated` | L2 | address geocoded | paid, no validation error |
| `shipment::serviceability-validated` | L2 | pincode serviceable | paid, no validation error |
| `consignment::marked-ready-for-ship` | L2 | READY_TO_SHIP | paid, no validation error, `readyToShip` (console **Mark Ready To Ship**) |
| `consignment::marked-ready-for-plan` | L2 | ready for planning | paid, no validation error, `readyToShip` |
| `consignment::pickup-schedule-updated` | L1 | a pickup window was set on the consignment | paid, no error, pickup window present |
| `consignment::accepted-by-carrier` | L2 | the 3PL accepted it | paid, no error, carrier set |

Not triggers: `shipment::pickup-requested` / `shipment::pickup-scheduled` (they are the RESULT
of raising the request), `consignment::ready-for-dispatch` (mid-mile, after pickup), anything
at AT_FACILITY or later.

## Event catalog (entity :: event — level)

### audit
completed · created · item-added-to-audit · item-audited · item-list-added-to-audit ·
storage-location-scanned · updated

### bag
added-to-bag · auto-deconsolidated · bag-inscanned-at-facility · bag-loaded-to-connection ·
bag-removed-from-connection · cancelled · created · deconsolidated-from-bag ·
deconsolidation-completed · delinked-from-bag · inscanned-at-facility · item-added ·
item-deconsolidated · item-delinked · item-marked-damage · item-removed-to-cancel-bag ·
item-revoked-damage · item-status-marked-short · items-fetched-for-bag-seal ·
items-fetched-for-connection-async · items-fetched-for-parent-bag-removed-from-connection ·
items-fetched-for-run-arrive · items-fetched-for-run-dispatch · items-fetched-for-run-seal ·
loaded-to-connection · marked-damage · parent-sealed · removed-from-bag ·
removed-from-connection · revoked-damage · run-arrived · run-dispatched · run-sealed · sealed ·
short · updated · updated-from-bpm

### consignment
accepted-by-carrier L2 · accessorial-updated L2 · added-to-load · added-to-trip L2 ·
address-updated L1 · asset-assigned L2 · assign-carrier-inititated L2 · assigned L2 ·
at-location L2 · attempt-created · cancelled L1 · carrier-allocation-failed L2 ·
carrier-assigned L2 · category-and-dimension-updated L2 · ci-address-updated L2 ·
ci-url-updated L2 · consignment-location-updated L2 · consignment-populate-fields L1 ·
contact-info-updated L2 · created L1 · deliver-slot-cancelled L2 · delivered L2 ·
delivery-schedule-updated L1 · editable-matrix-updated L2 · geo-coordinate-notfound L2 ·
geo-coordinate-updated L2 · geocode-requested L2 · handover-completed L2 ·
last-mile-feedback-updated L2 · leg-details-updated L2 · loaded-on-lastmile L2 ·
marked-clearance L2 · marked-damage L2 · marked-ready-for-plan L2 · marked-ready-for-ship L2 ·
next-in-route L2 · not-loaded-to-trip L2 · note-added L2 · notification-sent L2 ·
pickup-schedule-updated L1 · pickup-slot-cancelled L2 · pod-uploaded L1 ·
post-routing-consignment-data-updated L2 · rate-updated L2 · re-attempted L1 ·
ready-for-dispatch L1 · ready-for-dispatch-marked L2 · rejected-by-carrier L2 ·
removed-from-load · removed-from-trip L2 · reschedule-requested L1 · resequenced L2 ·
reverse-pickup-state-updated · revoked-clearance L2 · revoked-damage L2 ·
route-create-and-assign L2 · route-details-discarded L2 · route-details-updated L2 ·
routing-consignment-data-updated L2 · routing-data-reset L2 · rto-completed L2 ·
rto-initiated L2 · scheduled L2 · secondary-state-updated L2 · service-completed L2 ·
service-failed L2 · service-partially-completed L2 · service-time-updated L2 ·
shipment-delivered L1 · shipment-details-updated L2 · shipment-inscanned L1 ·
shipment-partial-delivered L1 · shipment-partial-picked-up L1 · shipment-picked-up L1 ·
shipment-pickup-failed L1 · shipment-storage-location-updated L2 · shipment-undelivered L1 ·
slot-booking-data-updated L2 · slot-booking-requested L2 · split-failed L2 ·
split-initiated L2 · splitted L2 · staging-started L2 · state-updated L2 ·
tracking-details-updated L2 · trip-ended L2 · trip-started L2 · unassigned L2 ·
undelivered L2 · unplanned L2 · updated L2 · updated-from-bpm L2

### load
assigned · cancelled · carrier_accepted · carrier_assigned · carrier_rejected ·
consignment_added · created · created_and_assigned · dispatched · item_exception_marked ·
item_removed · lane_assigned · load_added · marked_rfd · revoked_rfd · route_discarded ·
route_staging_started · unassigned · updated · updated-from-bpm

### note
created

### pickup
assigned L2 · created · created-with-items · geo-coordinate-notfound L2 ·
geo-coordinate-updated L2 · geocode-requested L2 · picked-up L2 · pickup-failed L2 ·
pickup-location-updated L2 · route-details-updated L2 · updated · updated-from-bpm

### route
asset-assigned · consignment-list-updated · created · created_and_assigned · discarded ·
loading-finished · loading-started · lpn-updated · route-assigned · route-unassigned ·
shipment-loaded · shipment-remarks-updated · shipment-removed · staging-started · updated

### runconnection
advanced-to-state · arrived · cancelled · created · dispatched · item-loaded ·
item-marked-damage · item-removed · item-revoked-damage · item-state-marked-short ·
item-unloaded · sealed · unloading-completed · updated-from-bpm

### shipment
accepted L2 · added-to-bag L2 · added-to-trip L2 · address-updated L2 · attempt-updated L2 ·
attempt-updated-after-split L2 · audited L2 · bag-inscanned-at-facility L2 ·
bag-loaded-to-connection L2 · bag-removed-from-connection L2 · cancelled L1 ·
carrier-allocated L2 · ci-url-updated L2 · contact-info-updated L2 · created L1 ·
created-from-bpm L1 · damaged · delayed L2 · delinked-from-bag L2 · delivered L1 ·
delivered-at-dropoff L1 · delivery-failed L1 · delivery-rescheduled L2 ·
delivery-schedule-updated L2 · delivery-scheduled L2 · destroyed · details-updated L2 ·
dispatched L1 · dispatched-from-facility L1 · driver-assigned-for-delivery L1 ·
driver-assigned-for-pickup L1 · found · group-key-updated L1 · held ·
inscanned-at-destination L1 · inscanned-at-facility L1 · label-generated L2 ·
lastmile-customer-feedback-updated L2 · left-for-delivery L1 · left-for-pickup L1 ·
left-for-return · loaded-on-lastmile L2 · loaded-to-connection L2 · loaded-to-trip L2 · lost ·
marked-damage · marked-missing · marked-permanent-damage · misrouted · next-in-route L2 ·
not-loaded-on-lastmile · not-loaded-to-trip L2 · note-added L2 · parent-sealed L2 ·
partially-delivered L2 · partially-picked-up L1 · picked-up L1 · pickup-failed L1 ·
pickup-requested L2 · pickup-rescheduled L2 · pickup-schedule-updated L2 ·
pickup-scheduled L2 · pod-received L1 · rate-calculation-requested L2 · rate-updated L2 ·
reached-at-location L2 · rejected · removed-from-bag L2 · removed-from-connection L2 ·
reschedule-requested L1 · revoked-damage L2 · revoked-missing L2 · route-assigned L2 ·
route-details-updated L2 · rto-completed L2 · rto-initiated L1 · rto-undelivered L2 ·
run-arrived L2 · run-dispatched L1 · run-sealed L2 · scheduled L2 ·
serviceability-validated L2 · shelved · shipment-dimension-updated L1 ·
shipment-location-updated L2 · shipment-populate-fields L1 ·
shipment-ready-for-plan-data-updated L2 · shipment-route-data-updated L2 ·
shipment-state-updated · short · staging-started L2 · storage-location-updated L1 ·
tracking-details-updated L2 · unassigned L2 · undelivered L1 · unmapped L2 · updated-from-bpm L2

### trip
assigned · attempt-additional-info-updated · attempt-at-location · attempt-delivered ·
attempt-delivery-failed · attempt-delivery-not-attempted · attempt-field-data-updated ·
attempt-handover-completed · attempt-in-scanned-at-facility ·
attempt-intermediate-status-updated · attempt-loaded · attempt-not-loaded ·
attempt-partially-delivered · attempt-partially-picked-up · attempt-pickup-failed ·
attempt-pickup-success · attempt-service-completed · attempt-service-failed ·
attempt-unassigned · attempt-unloaded-at-destination · attempt-vas-added ·
attempt-vas-code-updated · attempt-you-are-next · checklist · completed · consignment-added ·
consignment-note-added · create-user-compliance · created · discarded · ended · extended ·
helper-updated · insights-saved · loading · mark-trip-compliance · ready-to-start ·
reverse-pickup-shipment-create · started · stop-count-updated · trip-consignment-assigned ·
trip-consignment-at-location · trip-consignment-attempt-added L2 ·
trip-consignment-attempt-split-updated · trip-consignment-delivered ·
trip-consignment-delivery-field-data · trip-consignment-delivery-not-attempted ·
trip-consignment-field-data-pdf-url-updated · trip-consignment-handover-completed ·
trip-consignment-loaded · trip-consignment-not-loaded · trip-consignment-partially-delivered ·
trip-consignment-partially-loaded · trip-consignment-partially-picked-up ·
trip-consignment-picked-up · trip-consignment-pickup-failed · trip-consignment-pta-updated ·
trip-consignment-resequenced · trip-consignment-service-completed ·
trip-consignment-service-failed · trip-consignment-service-partially-completed ·
trip-consignment-unassigned · trip-consignment-undelivered · trip-consignment-you-are-next ·
trip-shipment-attempt-added · trip-shipment-attempt-sku-split-updated ·
trip-shipment-attempt-split-updated · trip-stop-added L2 · trip-stop-alert ·
trip-stop-at-location · trip-stop-consignment-assigned · trip-stop-failed ·
trip-stop-not-attempted · trip-stop-partial · trip-stop-pta-updated · trip-stop-resequenced ·
trip-stop-split-updated · trip-stop-successful · trip-stop-updated · trip-stop-you-are-next ·
trip-user-compliance-discarded · unassigned · update-compliance-digital-pass ·
update-compliance-location · update-user-compliance
