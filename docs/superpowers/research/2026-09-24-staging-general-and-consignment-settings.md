# Staging capture — General Settings + Consignment Order module settings (2026-09-24)

Captured from the signed-in staging tab (click-navigation only: Custom Settings →
Base Modules → card; nothing saved on staging). Sources: `innerText` dumps of the
live DOM, a read-only `POST /master/api/v1/moduleSettings/fetch`, and the loaded
v2 bundle (`50576-*.js`, component near offset 3.36M for General Settings,
3.41–3.42M for the Consignment Order page).

Screenshots (local, not in repo):
- General Settings — `/var/folders/wx/fg6mfcdn71l7thq5rqmsphtw0000gr/T/claude-chrome-screenshots-2odWKw/screenshot-1790237433254-84.jpg`
- Consignment Order → General tab — `/var/folders/wx/fg6mfcdn71l7thq5rqmsphtw0000gr/T/claude-chrome-screenshots-2odWKw/screenshot-1790237440133-85.jpg`

---

## A. General Settings — `/v2/custom_settings/master-service/modules/general_settings`

Header: **General Settings** — "Manage account wide defaults for order visibility,
order splitting and task types." (back arrow → Base Modules). One flat list, no
tabs/accordions; single **Save Settings** button (no Reset).

| # | Label | Hint (verbatim) | Control | Options / codes | Current (staging) | Bundle default (no row) |
|---|---|---|---|---|---|---|
| 1 | Order View | Enable to display Order Number instead of Consignment Number across the UI. | toggle | on/off → `viewOnOrder` | **on** | off |
| 2 | Splittable | Allow orders to be split into multiple sub-orders during planning. | toggle | → `add_form.splittable` | off | off |
| 3 | Scannable | Allow orders to be scanned at the time of planning. | toggle | → `add_form.scannable` (PUT_AWAY / LASTMILE_LOADING: top-level `scannable`) | off | off |
| 4 | Task Type | Allow orders to be Pickup / Delivery only or Pickup & Delivery. | 2 radio chips | `PICKUP_ONLY_DELIVERY_ONLY` "Pickup Only Delivery Only" · `PICKUP_AND_DELIVERY` "Pickup & Delivery" → `taskType` | Pickup Only Delivery Only | Pickup Only Delivery Only |
| 5 | Inbound | Select the stage where inbound is required. | 4 radio chips | `AT_ORIGIN` "At Origin" · `AT_DESTINATION` "At Destination" · `AT_MID_MILE` "At Mid Mile" · `NOT_REQUIRED` "Not Required" → `inbound` | Not Required | At Origin |

**Storage — there is no row of its own.** The page fetches moduleSettings for
`[GLOBAL_SETTINGS, CONSIGNMENT_MANAGEMENT, PENDING_FOR_PLANNING, PUT_AWAY, LASTMILE_LOADING]`
and on save writes the same values into each row's settingJson (PUT if the row
has an id, else POST), toast "Settings saved successfully" / "Failed to save settings":
- `GLOBAL_SETTINGS`, `CONSIGNMENT_MANAGEMENT`: `{viewOnOrder, taskType, inbound, add_form:{scannable, splittable}}`
- `PENDING_FOR_PLANNING`: `{viewOnOrder, inbound, taskType, add_form:{splittable}}`
- `PUT_AWAY`, `LASTMILE_LOADING`: `{viewOnOrder, taskType, scannable}`

Read precedence: GLOBAL_SETTINGS → CONSIGNMENT_MANAGEMENT → PENDING_FOR_PLANNING (first row that has the key).

## B. Consignment Order — `/v2/custom_settings/master-service/modules/consignment_order`

Header: **Orders** — "Control which columns and filters are displayed, their
sequence, and accessibility settings." Tabs: **General · Date Filter · Table
Configuration · On Page Filters**; footer **Reset / Save Settings** on every tab.
Row code `CONSIGNMENT_MANAGEMENT` (enabled = true; toggle lives on the Base Modules card:
"Consignment Order — Manage your consignment order settings").

Stored settingJson (current, minus pageRenderingConfig):
`{"enabled":true,"inbound":"NOT_REQUIRED","viewOnOrder":true,"taskType":"PICKUP_ONLY_DELIVERY_ONLY","add_form":{"splittable":false,"scannable":false},"userTypeList":[],"dateAppliedOn":"ship_to_delivery_date","selectedDateRange":0,"modifyConsignmentTill":"rfd"}`

### General tab
- **User Types** — checkbox chips from `GET /app/rest/user_type`: Helper · Floor supervisor ·
  Field Executive · Carrier · Admin · Manager. Current: none ticked (`userTypeList: []`).
- **Feature Settings** — one row: **Modify consignment Action till** — segmented
  `rfd` "Ready for Dispatch" · `ofd` "Out for Delivery" → `modifyConsignmentTill`.
  Current: Ready for Dispatch. Default: `rfd`.

### Date Filter tab
- **Default Date Field** (radio chips) → `dateAppliedOn`: Created Date `created_at` ·
  Delivery/Pickup Date `ship_to_delivery_date` · Ship By Date `ship_by_date` ·
  Updated At `last_updated_at` · Last Mile Dispatch Date `dispatch_date`.
  Current: Delivery/Pickup Date. Default: `created_at`.
- **Default Date range** → `selectedDateRange` (day offset): Last 30 days `-30` ·
  Last 15 Days `-15` · Last 7 Days `-7` · today `0` · Next 7 Days `7`.
  Current: today (0). Default: -7 (per the console replica; bundle not re-checked).

### Table Configuration tab
"Select All | 21/67 Selected", a Sequence list (checkbox + drag order). Save writes
only SHOWN keys, renumbered 1..n: `pageRenderingConfig.table.columns = {key:{show:true,sequence}}`.
When Order View is on, `consignmentNumber` is titled "Order Number" and
`consignmentType` "Order Type" (so two rows read "Order Number" — `orderNumber` too).

Universe (bundle array `SF`, 67; `*` = shown by default = the account's current 21):
consignmentNumber Consignment Number* · referenceNumber Reference Number* · state State* ·
secondaryState Secondary State* · exceptionState Exception State* · exceptionReason Exception Reason* ·
totalWeight Weight* · totalVolume Volume* · palletQuantity Pallet Quantity* · totalQuantity Total Quantity ·
sku SKU* · skuLineItemNo SKU Line Item No · skuCode SKU Code · shipByDate Ship By Date* ·
shipToName Ship to Name* · shipToAddress Ship To Address* · shipToType Ship To Type(*current) ·
shipToCode · shipToPinCode · shipToCity · shipToCounty · businessUnit Merchant* ·
driverName Assigned To Driver* · consignmentType Consignment Type* · createdAt Created At* ·
ageing Ageing (days)* · carrier Carrier · tags Tag · vas VAS · serviceTime Service Time (min)* ·
pickupServiceTime · deliveryServiceTime · orderNumber Order Number · dispatchDate Dispatch Date ·
routingPriority · specialInstructions · shipperCode · serviceType · pickupStartDateTime Pickup Start Time ·
pickupEndDateTime Pickup End Time · deliveryStartDateTime Delivery Start Time ·
deliveryEndDateTime Delivery End Time · deliveryAttemptCount Delivery Attempt Count* ·
schedulingConfirmationRequired · schedulingConfirmed · paymentMode · shipFromName · shipFromAddress ·
shipFromType · shipFromCode · shipFromPinCode · shipFromCity · shipFromCounty · originFacilityCode ·
destinationFacilityCode · trackingNumber · codAmount COD Amount · clearanceDone · clearanceRequired ·
address · originalPickupStartTime · originalPickupEndTime · originalLastmileDeliveryStartTime
Original Delivery Start Time · originalLastmileDeliveryEndTime Original Delivery End Time ·
cancellationRemarksReason Cancellation Remarks · **pickupWindow Pickup Window** · **deliveryWindow Delivery Window**
(the last two were missing from the console replica's 65-key universe).

Current shown order: consignmentNumber, referenceNumber, state, secondaryState, exceptionState,
exceptionReason, totalWeight, totalVolume, palletQuantity, sku, serviceTime, shipByDate, shipToName,
shipToAddress, businessUnit, driverName, consignmentType, createdAt, ageing, deliveryAttemptCount, shipToType.

### On Page Filters tab
"Select All | 12/20 Selected" + sequence list → `pageRenderingConfig.filters`.
Universe (bundle array `SH`, 20; `*` = default on = current):
state State* · facility Facility* · origin Origin* · destination Destination* ·
consignmentType Consignment Type* (Order Type under Order View) · businessUnit Merchant* ·
routeName Route Name* · driverName Driver Name* · sortCode Sort Code* · carrier Carrier* ·
scheduling Scheduling* · serviceType Service Type* · tags Tags · clearance Clearance ·
consignment_categories Category · cod_amount COD Amount · total_weight Total Weight ·
total_volume Total Volume · ageing Ageing · customerBusinessUnit Business Unit.

Save body: whole row, `settingJson = {...stored, userTypeList, pageRenderingConfig:{table:{columns}, filters}, dateAppliedOn, selectedDateRange, modifyConsignmentTill}`; toasts "Settings saved successfully" / "Failed to save settings".
