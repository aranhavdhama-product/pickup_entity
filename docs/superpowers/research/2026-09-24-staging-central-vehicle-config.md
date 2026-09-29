# Staging Central Vehicle Config — inventory (2026-09-24)

Target: `https://staging.fareye.co/v2/central-vehicle-config/99999/529?cityId=58097&hubId=513521`
(SEKO / Delivery Management tenant). Captured live 2026-09-24/25, click-navigate only, nothing saved.

## How to reach it

Sidebar **Route → Same/Next Day Routing** (`/v2/view/99999/529` — `99999/529` is that view's
module/page id, not a company or config id) → toolbar **Vehicle Config** → modal
**"Vehicles by City and Hub"** (City* single select, Hubs* multi select) → **Ok**. The page then
opens with `cityId` / `hubId` in the query. City options seen: Chicago 55913, EU 58097,
France 58032, New York 55914, Sydney 57818. City EU has one hub: EU 513521.

## What the page lists

Toolbar: back · City · Hub · Modes · Tags filters · Clear Filters · **Add New Vehicle**.
"Total Vehicles: 29 | Click vehicle name to preview & edit details", 100/page, Refresh.

Columns: checkbox · **Name** · Hub · Mode · Shift Start Time · Shift End Time · Weight Capacity ·
Volume Capacity · Pallet Spaces · Tags (inline-editable cells).

EU hub rows (29): `HFDN_ANT-140`, `HFDN_ANT-220`, `HFDN_BRU-140/220`, `HFDN_DIE-140/220`,
`HFDN_DUI-140/220`, `HFDN_ETL-140/220`, `HFDN_GEN-80/140/220`, `HFDN_GRO-140/220`,
`HFDN_HOU-140/220`, `HFDN_KLU-140/220`, `HFDN_MAA-210`, `HFDN_MET-999`, `HFDN_NAM-180/999`,
`HFDN_NIE-140/220`, `HFDN_RUI-200/999`, `HFDN_SCH-140/220` — every one Mode CAR (`driving`),
05:15–23:59, weight 1000, volume 1, pallet 1000, L/W/H 1, carrier `DSP 1`, 1 vehicle each. These
are HelloFresh-Benelux routing test vehicles, not a vehicle-type catalogue: the "type" is a
free-text per-hub vehicle NAME.

## The XHR

Page load (resource timing, same origin):

- `GET /app/rest/city_hub_list` — the modal's city/hub options
- **`GET /app/rest/order/auto_assign_configurationV2?cityId=58097&hubIdList=513521&oneRoutePerRoster=false`**
  — THE list. Bare JSON array, one object per vehicle row. Fields include `id, companyId, cityId,
  hubId, vehicleType` (= the Name column), `weightCapacity, volumetricCapacity, length, width,
  height, cutOffPallet, noOfVehicles, travelingMode, startTime, endTime, breakStart, breakEnd,
  carrierCode, tag, userTags, serviceTime, drivingSpeed, returnToDepot, maxDistance, variableCost,
  waitingTimeCost, fuelType, engineSize, co2Factor, runType, primaryVehicle, userName, fenceId,
  hubStartTime/hubEndTime, reloadStartTime/EndTime, coloadAllowed, routeStartDate …` (~100 keys).
  Re-issued with `fetch` from the page (cookie) → 200, 29 rows.
- `GET /app/rest/order/co2_factor?cityId&hubId`, `GET /app/rest/get_service_provider_master`,
  `GET /app/rest/user_type`, `GET /ship/app/rest/carrier_master/filtered`,
  `GET /app/rest/hub_configuration/list?routingType=1`, `GET /app/rest/get_tags_of_all_vehicle`.

This is the ROUTING vehicle store (the one `/app/rest/vehicle_configuration` writes — see memory
`fareye-vehicle-master-api`), not the asset master `/master/api/v1/vehicle`.

## Wired

`src/growOrders/masters.ts` → `fetchVehicleTypes()` calls
`/staging/app/rest/order/auto_assign_configurationV2?cityId=58097&hubIdList=513521&oneRoutePerRoster=false`
through the existing `/staging` proxy (no vite change; keep-alive agent already on it). Rows →
`VehicleTypeOption {code/name = vehicleType, payloadKg = weightCapacity, capacity line}`,
de-duplicated. Its own `.catch` — a failure never demotes the other masters. Empty or failed →
`SAMPLE_VEHICLE_TYPES` (the owner's FTL catalogue, draft.ts, ESTIMATED specs). Cached in
`grow-masters-cache-v3`.

At verification time the proxy's `.staging-session` cookie was expired (401), so the form showed
the SAMPLE list; with a fresh session it will list the 29 HFDN vehicles.
