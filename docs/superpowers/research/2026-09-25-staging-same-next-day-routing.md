# Staging Same/Next Day Routing — inventory (2026-09-25)

Target: `https://staging.fareye.co/v2/view/99999/529` (SEKO / Delivery Management tenant, company
20106). Sidebar **Route → Same/Next Day Routing**. Captured live, click-navigate only, nothing
written (a Copy Route confirm opened by a mis-click was CANCELLED). Screenshots (local, transient):
`/var/folders/.../claude-chrome-screenshots-2odWKw/screenshot-1790302131682-154.jpg` (list),
`…-160.jpg` (Route & Dispatch map), `…-161.jpg` (Managed routes panel).

## 1. List page — `/v2/view/99999/529`

Title "Same/Next Day Routing", breadcrumb Route › Same/Next Day Routing.

**Toolbar (one row):** date range (Created Date | Dispatch Date switch inside the picker; Last 30
Days / Last 7 Days / Today presets; default today→today) · City · Hub · Fence · Dispatch Status ·
Type · right: **Roster** · (user icon) · **Route Settings** · **Vehicle Config** · **Create New
Routes** (primary).

**Tabs:** Generated Routes · Discarded, followed by counters `Routes In Progress: n` and
`Total Routes: n`. Right of the tabs: search "Search route id and request id" · **Show All**
toggle · copy icon · download icon. Footer: `50 / Page` · pager · **Refresh**.

**Columns:** checkbox · Routing ID · Dispatch Status · Created On · City > Branch · Fence ·
Unplanned · Assigned (`assigned/total` routes) · Completed In (routing run time, "1 min 46 sec") ·
Remark · Dispatch Date · **View** link · kebab.

First rows (dispatch 2026-09-15→25, Chicago > ORD, fence ORD):

| Routing ID | Dispatch Status | Created On | Unplanned | Assigned | Completed In |
|---|---|---|---|---|---|
| 66074697 | Ready for Dispatch | 2026-09-17 21:05:49 | 3 | 0/1 | 0 min 2 sec |
| 66073446 | Un-Assigned | 2026-09-17 20:35:11 | 8 | 0/1 | 1 min 46 sec |
| 65999504 | Assigned | 2026-09-16 14:12:45 | 0 | 1/1 | 0 min 3 sec |

Dispatch Status values seen: **Un-Assigned · Ready for Dispatch · Assigned**.
**Row kebab:** Copy Route (confirm: "copy the route after the cut-off time…", Cancel / Copy) ·
Download · E-mail. Row **View** → `/v2/post_route/99999/529/{routingId}/{routingId}/1`.

**Create New Routes** modal: City* · Hubs* (disabled until a city) · Merchant Code · Sort Code ·
Tags · "Select order from"* (start/end date) · credits line ("500k credits · Today's Credits") ·
Cancel · **Initiate Routing**. No first-mile/last-mile question — staging plans whatever orders
the hub holds (a staging route may still contain `orderType: "PICKUP"` jobs, see §2).

## 2. Route & Dispatch — `/v2/post_route/99999/529/{id}/{id}/1`

Title `Route & Dispatch | ORD | 17 Sep 2026`. KPI strip: Assigned · Un-Assigned | Vehicles (1/1) ·
SPR (stops per route) · Stops/Orders (2/1) · SPORH · Vehicle Utilised (28.50 %) · Distance (1.6 mi)
· Time (02h 00m). Map with route polylines + numbered stops; right rail: Geo-fences select ·
**Add Vehicle** · kebab; one card per route (`TRUCK 1 (ORD)`: stops · orders · SPR · distance ·
shift 07:00–09:00 · utilisation %, eye toggle, kebab). Bottom drawer: **Unplanned: 4** ·
**Managed: stops/orders** · **Outsourced: 0** · Search Order · **Fetch New Orders** · expand;
footer chat · edit · **RFD** (Ready For Dispatch).

Managed drawer, per route row (`TRUCK 1 (ORD)` · 43.52 mins · 5 mins · 1.6 mi · re-sequence icon)
expands to stop columns: Order No · Tags · State · Planned ETA · Start Window · End Window ·
Travel Time | Distance · VAS · Confirmed · Weight · Volume · SKUs · Service Time · Special
Instructions · Distance from Hub · Customer Name · Customer Contact Number · Address · Customer
Pincode · Sort Code · Merchant · Geofence · Planned By.

## 3. Vehicle Config — `/v2/central-vehicle-config/99999/529?cityId&hubId`

Already captured: `2026-09-24-staging-central-vehicle-config.md` (modal City*/Hubs* → list with
Name · Hub · Mode · Shift Start/End · Weight/Volume Capacity · Pallet Spaces · Tags; Add New
Vehicle). Not re-captured.

## 4. XHRs

List page: `GET /app/rest/city_hub_list`, `GET /app/rest/order/autoRoutingCreditInfo`,
`GET /app/rest/fetch_hub_and_fence_routing_config?hub_id=`, `GET /app/rest/consignment_roster_settings?routingType=1`,
`GET /app/rest/hub_configuration/list?routingType=1`, `/master/api/v1/sortCode/fetch`,
`/master/api/v1/tagMaster/fetch`, `/app/rest/master/businessUnit`, `/app/rest/get_merchant_master_config`,
and the list itself, POLLED: **`POST /app/rest/get_routing_history?serviceProviderAssignment=true`**.

Re-issued (same-origin, XSRF header) with body
`{date:['2026-01-01','2026-09-25'], hubId:504300, pageSize:3, pageNumber:1}` → 200, array:
`{id:65937824, cityId:55913, hubId:504300, date, routingDate, routingStatus:"Completed",
routingMessage:"4", source:"Manual", fence:"ORD", fenceId, routingHistoryIds, requestId,
parentRouteId, totalRoutes:1, assignedRoutes:0, unassignedJobsInRoute:1, dispatchDate, remark,
totalElements:65, totalPages:22, triggerType:1, routingType:1, state:1}`.
**Quirk:** `pageNumber:0` → 500 "Page index must not be less than zero" — the page index is 1-based.

Detail: `GET /app/rest/get_route_by_id?routeNo=66073446` → 1 route: `routeMetadata`
`{routeName:"TRUCK 1", startTime:"07:00", endTime:"21:00", vehicleId:73989}`, `routeJsonObject`
`{totalDistance:2.582, totalTime:"5.47mins", zoneName:"ORD", co2, orderDataList[…]}`,
`utilizationInfo {shift 14.29, weight .29, volume 28.5, pallet .1, stopCapacity .2, *Formula
strings}`. An `orderDataList` job: `{jobId:-75429, orderType:"PICKUP", stopSequence:1, weight,
address, accuracy, serviceTime:12, startTime/endTime (minutes of day), pickUpStartTime/EndTime}`
— staging already models pickup jobs inside a route. Also: `users/getAllFieldExecutiveList`,
`auto_assign_configurationV2`, `co2_factor`, `get_service_provider_master`,
`carrier_master/filtered`, `get_tags_of_all_vehicle`.

## 5. Local mapping (`/local/routing`)

| Staging | Local |
|---|---|
| Routing ID row (`get_routing_history`) | a `RoutingPlan` (src/pages/LocalRouting/routingPlans.ts) grouping the trips it created |
| Route (`get_route_by_id` entry) | a `LocalTrip` in planningStore |
| Dispatch Status | derived from the plan's trips + its RFD flag |
| Create New Routes → Initiate Routing | Create New Routes dialog → deterministic sequencing (postcode, city) over the hub's vehicles |
| Plan for (none on staging) | **Plan for: First Mile · Last Mile · Both** when the pickup module is on |
| Route & Dispatch page | `/local/routing/:planId` (KPI strip, routes with stops, unplanned, RFD) |
| Vehicle Config | `/local/routing/vehicles` on `src/config/vehicleConfig.ts` |

## 6. Second capture (owner: exact replica) — geometry and the remaining pages

- List @1440 with staging's 69px rail: toolbar at y=81, every control 32px high — date range
  (≈205px) · City 81 · Hub 81 · Fence 90 · Dispatch Status 141 · Type 84 | Roster 95 · rider icon
  32 · Route Settings 144 · Vehicle Config 142 · Create New Routes 151. Tab strip y=141: tabs +
  counters (12px) | search 212px · Show All toggle · copy · download. Table header y=178, 47px;
  **every column 200px** (checkbox 32); rows 57px; th 14px/600 ink, td 14px ink-2, 8px padding;
  a sticky 200px right column holds View + kebab. Footer: `50 / Page` · pager · Refresh.
- **Route Settings** modal (≈800px): City · Hub · Route Goal (Balance/Utilise) · Multipart Order
  (Allow) · Type (Fixed/Adaptive) · Calculation (Incremental/Aggregate/Fixed) · Service Time
  (Smart/Order/Custom) · Return to Start Location (toggle + All Vehicles | Per Fence | Per Vehicle
  Type) · Break Type* (Time/Duration) · Break Time · Optimize Route Start Location · Fence-Wise
  Settings · Advanced Settings (Traffic Condition Fast/Slow · Stop Interval · Vehicle leave by
  time · Loading Time) · Cancel · Save Settings. Closed with ×, nothing saved.
- **Vehicle Config** gate modal "Vehicles by City and Hub" (City* · Hubs* · Cancel · Ok) →
  `/v2/central-vehicle-config/99999/529?cityId=55913&hubId=504300` (Chicago/ORD: 1 vehicle
  `Truck`, SMALL TRUCK, 06:00–21:00, 20000 / 2000000 / 2000). Columns @1440: checkbox 45 then
  9 × 142px, headers with ⓘ; Shift/Weight/Volume/Pallet/Tags cells are inline inputs; footer
  `100/Page` · pager · Refresh. Name click → full-page editor: back · delete | Primary Vehicle ·
  Update Settings; cards **Basic Details** (Mode* · Power Source · Name* · Tags · Max Range
  (miles) · User Type · Origin Location · Service Time Multiplier · City* · Hub* · Return To Hub ·
  Carrier Code* · Coload Allowed · Exclude vehicle from empty-tag orders), **Capacity Details**
  (Weight Capacity* +Buffer % · Order Weight Cut-off · Pallet Spaces +Buffer · Roundup Pallet per
  stop · Order Pallet Cut-off · Volume Capacity +Buffer · Min Stops · Order Height/Width/Length
  Cut-off · Stop Capacity +Buffer), **Shift And Cost Details** (Shift Start/End · Break Start/End ·
  Fixed Cost · Variable Distance Cost (per yard) · Waiting Cost per Time · Max Loading Time),
  **Carbon Emission** (Fuel Type · Engine Size · CO2 Emission Factor + the KG note).
- The page title stays "Same/Next Day Routing" on Vehicle Config and the editor.
- Not captured: the Type / Dispatch Status filter option lists (the popovers rendered empty),
  Roster, the rider-icon button, the route card kebab, E-mail.
