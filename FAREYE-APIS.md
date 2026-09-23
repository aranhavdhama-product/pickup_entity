# FarEye API catalog — everything we've touched, verified, or captured

Living reference for this project. Statuses: **[LIVE]** = verified working by us,
**[CAPTURED]** = seen in a real browser capture but not replayed, **[SPEC]** = from
official docs, **[BROKEN]** = exists but fails, **[GAP]** = doesn't exist / never found.

## Auth styles

| Style | Where | Notes |
|---|---|---|
| Session cookie (JSESSIONID JWT + XSRF-TOKEN header) | `staging.fareye.co` console APIs (`/app/rest/*`, `/sbs/*`) | ~1 h JWT, rotates via Set-Cookie while browsing; our Vite proxy harvests rotations automatically from `.staging-session` |
| `?api_key=` query param | `staging.fareye.co/ship/api/v3/*` | Stable, no expiry; per-company (we hold dms/20106) |
| `Authorization: Bearer` | `api-<region>.fareyeconnect.com/v2/*` (public Connect API) | Issued per account by FarEye |

## Authentication (console, cookie auth) — captured live 2026-08-26

| API | What it does |
|---|---|
| `POST /app/authentication` **[LIVE — verified 2026-08-26]** | Classic **Spring Security form login**, sent via **XHR**. `application/x-www-form-urlencoded`, fields: **`j_username`, `j_password`, `remember-me` (value `true`, omitted when unchecked), `submit` (`Login`)**. **CRUCIAL: `j_password` is `SHA-256(password)` hex-encoded (64 lowercase hex chars) — hashed client-side, NEVER plaintext.** Verified by matching the captured digest against the typed password (matched `sha256hex`, no salt, no username mixing). 200 sets the JSESSIONID JWT + XSRF-TOKEN via Set-Cookie. GOTCHAs that cost 3 wrong attempts: (1) returns a JSON error body on 401 so it *looks* like a JSON endpoint, but the request is form-urlencoded; (2) field names are `j_`-prefixed, not `username`/`password`; (3) the password is pre-hashed — sending plaintext 401s as "incorrect". CSRF is NOT enforced on this endpoint (cookieless POST reaches auth) |
| `GET /app/rest/account` **[LIVE]** | Signed-in user's full profile: `login, firstName, lastName, employeeCode, mobileNumber, userId, userTypeName, cityId, hubId, hubs[], roles[], company{id,name,code,timeZone,billingCurrencySymbol,enabledServiceList,…}, keycloakUserId`. The profile-section source |
| `GET /app/logout` **[LIVE]** | 200, clears the server session |
| `GET /staging-session-info` **[LIVE]** (dev server) | Decodes the JSESSIONID JWT locally → user/company/hub/tz/expiry |
| Token refresh | No explicit refresh endpoint — the JWT auto-rotates via Set-Cookie on every response; our proxy harvests rotations + pings a keepalive every 5 min. Cold login (empty session file) is bootstrapped from the auth response's Set-Cookie |

Note: `company.enabledServiceList.AUTHENTICATION_PLATFORM_KEYCLOAK` flags SSO accounts.
prod0003 (company 20773) = `false`, i.e. classic username/password form login despite
carrying a `keycloakUserId`.

## SES module family (`/v2/ses/*`, cookie auth) — from v2 bundle mining 2026-09-07

The v2 console groups first/mid-mile screens under an **SES** module set (module keys are UPPER_SNAKE, used for feature gating): `SHIPMENT_MANAGEMENT` (`/v2/mid-mile/shipment`), `CONSIGNMENT_MANAGEMENT` (`/v2/ses/consignment`), **`PENDING_FOR_PLANNING`** (`/v2/ses/pending-for-planning`), `LOAD_PLANNING` (`/v2/ses/load-planning`), `STATIC_SCHEDULE` (`/v2/ses/static-schedule`), `ROUTING`, `CARRIER_PORTAL` (`/v2/carrier-portal`), `CONTAINER_HAULAGE` (`/v2/ses/container-haulage`), `CUSTOM_ORDER` (`/v2/ses/custom-order`), plus `COMPLIANCE_MODULE`, `NEW_CONTROL_TOWER_MODULE`, `OPS_DASHBOARD`.

- **Pending for Planning is the queue that feeds ROUTING**, in two modes that correspond to the pickup deck's slide 1 vs slide 2: **routing WITHOUT load planning** (plan directly off the PFP page — routing reads `selectedConsignmentsFromPendingForPlanning` with `isConsignmentEnabled`; POS/CEP customers) vs **routing WITH load planning** (`isLoadPlanningEnabled` → planning moves to the Load Planning page; B2B LTL/FTL). Our `/local/pickup` demo mirrors this: primary "Plan Route" (direct) + "Send to Load Planning" branch.
- Pickup field vocabulary (verbatim from bundle): `pickupStartDateTime`, `pickupEndDateTime`, `pickupServiceTime`, `pickupLocation`, `pickupYardLocation`, `PICKUP_WINDOW`; container variant carries `PICKUP_EMPTY`/`PICKUP_LADEN`.
- Routing bootstrap fn `fetchInitialRoutingData(...)` consumes geofence labels, jobInfo/jobMaster maps, `carrierCodeConsignmentKeyMap` and the PFP selection — i.e. selecting on PFP then "Route" is one flow, not two pages.

## Planning (console, cookie auth)

| API | What it does |
|---|---|
| `POST /app/rest/get_routing_history?serviceProviderAssignment=false` **[LIVE]** | Routing PLANS for a date range + hub (body: `{date:[from,to], hubId, pageSize…}`). Plain array of plan entries. `serviceProviderAssignment=true` = carrier-assignment flavor of the same screen |
| `GET /app/rest/get_route_by_id?routeNo={planId}` **[LIVE]** | ALL routes of a plan. Each: `routeId` ("615563020-0"), dock, `fieldExecutiveId`, `routeMetadata{routeName,startTime,endTime,vehicleId}`, `routeJsonObject{totalDistance(km), totalTime, zoneName, trailerNumber, co2, startLocation, jobLatLngs[], orderDataList[]}`. **Quirk:** both nested blobs may arrive as JSON-encoded STRINGS. **Quirk:** `jobLatLngs` repeats the hub coordinate — unreliable for stop markers. With `serviceProviderAssignment=true` also carries `serviceProviderId`/`serviceProviderInfo` |
| `GET /app/rest/get_route_data_by_id?id={planId}&isRateBasedActive=false` **[LIVE]** | The routing REQUEST (jobs in), *not* the route result. `jobs[]`: `latitude/longitude`, `referenceNo`, `customerName`, `hazmat`, `vip`, `consignmentVO{consignmentNumber, fourPerson, dedicatedTruck…}`. Our source for per-consignment coords + tags. **400 without `isRateBasedActive`** |
| `GET /app/rest/city_hub_list` **[LIVE]** | Hubs NESTED per city: `[{city:{id,name}, hubList:[{id,name}]}]` — flatten for dropdowns |
| `GET /app/rest/users/getAllFieldExecutiveList?hubId=` **[LIVE]** | Drivers: id, employeeCode, first/lastName, userTypeName, isLoggedIn (string booleans) |
| `GET /app/rest/validate_earliest_start_time?dispatchDate=&earliestStartTime=` **[LIVE]** | Pre-assignment validation step (both driver and carrier flows call it) |
| `GET /app/rest/get_measurement_units` **[CAPTURED]** | Company units (km/kg) |

## Assignment writes (console, cookie auth)

| API | What it does |
|---|---|
| `POST /sbs/routing_consignment/validate_assignment` **[LIVE]** | Body `["{routeId}"]` — validates a route can be assigned |
| `POST /sbs/api/command/load/assign-from-route` **[LIVE]** | DRIVER assignment: `{user_id, company_id, key: routeId, routing_id: planId, assigned_user_id, driver_name, delivery_date, helper_ids…}`. From a trip, `routing_id: null` is UNVERIFIED |
| `POST /app/rest/update_route_users` **[CAPTURED — ceva UAT 2026-08-25]** | CARRIER + VEHICLE assignment: `[{routeId, transactionDate, routingId, hubId, twoStepAssignmentEnabled, carrierProviderInfo: "{\"serviceProviderCode\",\"minCost\",\"vehicleId\",\"vehicleName\"}"}]`. `carrierProviderInfo` is a JSON-string. Requires the plan id — trips alone can't drive it |

## Execution (console, cookie auth)

| API | What it does |
|---|---|
| `POST /sbs/app/trip/get_active_trips` **[LIVE]** | POST only (GET 405), body `{}`. All active trips for session hub: trip_key, route_key (== routeId — routes CONVERT into trips, 1-to-many), state/status, driver code/id, vehicle rego, expected times (UTC; envelope has hub tz), attempts counts, trip_stops[] (consignment_keys, eta/etc, windows, weights). **Misses:** coords, distance, plan ref, tags, dock. **Broken:** pagination params ignored — always first 50 |

## Ship service (api_key auth) — consignments

| API | What it does |
|---|---|
| `POST /ship/api/v3/consignments` **[LIVE]** | Create consignment (`application/camel+json`). **UPSERT by referenceNumber** — resend with same reference = UPDATE (docs say "create and update"; label-token id differs per call but ct/ot tracking links prove same record). consignmentNumber unique company-wide (409 on different-reference reuse); **failed creates still reserve the consignmentNumber**. Carriers without number generation need `packageDetails[].trackingDetails[].trackingNumber` supplied |
| `PUT /ship/api/v3/consignments` **[LIVE]** | Update by referenceNumber. **Cannot change delivery state** — unknown fields (status/state/…) return OK but are silently dropped |
| `GET /ship/api/v3/consignments…` **[BROKEN]** | Every read variant 404s or 500s with api_key. Reads go via GraphQL `POST /sbs/graphql` (browser session only) |
| `POST /sbs/graphql` — `getAllConsignmentDetails` **[LIVE — verified 2026-08-27]** | **The consignment LISTING read** (session cookie). Query: `{ getAllConsignmentDetails(query:{pageNo, recordsPerPage, sortControl:{sortOn:"createdAt", sortDirection:DESC}, dynamicQueryBuilder:[{filterKey, filterValue, condition}]}) { totalElements totalPages number content } }`. **`content` is a JSON scalar — subselection is rejected**; rows come back snake_case with `ship_to_address`/`package_details` nested. Powers our `/console/order-management/consignment-order` page |
| `POST /ship/api/v3/consignments` **with SESSION COOKIE [LIVE — verified 2026-08-27]** | The v3 create also works with console cookie auth (no api_key) — same `application/camel+json` body, **SINGLE object (array body → 400 "Cannot deserialize … from Array value")**. **prod0003 quirks (re-verified 2026-08-27 evening):** the account has NO number-generation config anymore (no `SHIP_NUMBER_GENERATION` moduleSettings row) — omitting consignmentNumber now fails 422 "Number Generation is not configured"; **staging's own form silently defaults consignmentNumber = referenceNumber**, which is the working pattern. Tracking numbers must match the template: start `PKG`, digits after (a letter mid-number → 422 "should start with PKG and end with"). Failed creates still reserve the reference and appear as state `PENDING` rows in the listing |
| `POST /ship/app/rest/v3/bulkupload/sync` **[LIVE — verified 2026-08-27]** | **Consignment bulk upload** — multipart field `file`, the 214-column xlsx. Response `{success_count, failed_count, errors:["Reference number: X: [field is Required, …]"], data:<batch-uuid>}` (HTTP 200 even when all rows fail). Template: `GET /ship/app/rest/bulk/sample`; failed report: `/ship/app/rest/bulk/failed_excel`. Sheet rules per fareye-consignment skill: xlsxwriter/shared-strings, strip `*` from headers; requires ship_to contact name+number and full ship_from + ship_to addresses even when facility codes are given |
| Mark Delivered **[GAP]** | No API found. Delivery state moves via driver-app attempts (console "Close Consignment" is the manual path — its API still uncaptured) or carrier tracking webhooks. Capture DevTools on the Close Consignment Confirm click to automate |

## Public Connect v2 (`api-<region>.fareyeconnect.com`, bearer) [SPEC]

Consignments: `POST/PUT /v2/consignments` (create/update), `GET /v2/consignments?referenceNumber=`,
`POST /v2/consignments-cancel`, `-dispatch`, `-dispatchbyduration` (carrier handover),
`-packages` (add packages). Planning: `POST /v2/routes` (vehicles bound at plan time via
`vehicles[]`), `GET /v2/routes` (by token), `POST /v2/group-orders`, `POST /v2/eta`,
`POST /v2/checkout` (rates/serviceability). Slots: `/v2/slots`, `/v2/reserve`,
`/v2/confirm-slot`. Pickups: `/v2/pickups`, `/v2/pickups-locations`. Masters: cities,
hubs, users, rosters, vehicles, assets (POST/PUT/GET each). Telemetry: `POST /v2/gps-pings`.
**No wave API, no dock anywhere, no carrier-listing endpoint, no status-update endpoint.**

**The gateway is bearer-ONLY — an `api_key` can never read here (verified 2026-09-01).**
`GET https://api-staging.fareyeconnect.com/v2/consignments?referenceNumber=…` returns 401 for
every api_key form tried: `?api_key=`, header `api-key`, header `X-API-KEY`, and
`Authorization: Bearer <api_key>` (that last one leaks the internal path `/setu/fe/v2/consignments`
and `{"error":"invalid_token"}`). Tokens are issued by FarEye's integration team. The same routes
are NOT served from `staging.fareye.co` — `/v2/consignments` there returns the SPA HTML,
`/connect/v2/…` and `/ship/v2/…` return 401 Access Denied, `/api/v2/…` 404.

**There is no api_key-authenticated READ of a consignment, anywhere.** On the ship service,
`GET /ship/api/v3/consignments` (the create path) returns a bodyless 500, and every other
guessed shape 404s: `/ship/api/v3/consignments/{ref|consignmentNumber}`, `/ship/api/v{1,2}/consignments`,
`/ship/api/v3/consignment/{ref}`, `…/search`, `…/details`, `…/track`, `/ship/api/v1/track`.
api_key writes; reading back needs either a console cookie (GraphQL `/sbs/graphql`) or a v2 bearer token.

**No `source` / channel field exists in the v2 contract** — `^\s*source:` matches nothing in the
whole 500 KB spec. The provenance the GET response DOES define is richer than the internal read
model, though: `createdAt`, `createdBy` (**integer user id**), `createdByName` (display name),
`modifiedAt`, `modifiedBy` (int), `modifiedByName`. Compare `getAllConsignmentDetails`, which exposes
only login *slugs* (`created_by: "async"` for the ingestion pipeline, `"g.s_dms"` for console actions)
with no id and no name. So "who" is answerable on both surfaces; **"from where" is answerable on neither**.

## App / dashboard bootstrap (console, cookie auth) — observed on dashboard load 2026-08-26

Every call fires with the session cookie right after login. **[OBSERVED]** = seen
in the network log (status noted), payloads not all captured.

| API | Purpose / status |
|---|---|
| `GET /app/rest/account` | Signed-in user's profile (see Auth section) — 200 |
| `GET /app/rest/user_type` | User-type list — 200 |
| `GET /app/rest/get_current_company_timezones` | Company timezones — 200 |
| `GET /app/rest/react/apps` | App-switcher config: `{appEnable, defaultUI, enableCacheGet, enableCacheSave}`. **`appEnable:false` (prod0003) = console hides the 9-dot apps grid** — our header mirrors this |
| `GET /app/rest/react/page_group_conf?calledFrom=setting` | Page-group config (nav/module grouping) — 200 |
| `GET /app/rest/react/landing_page_conf?currUser=true` | Landing-page config — 200 |
| `GET /app/rest/react/theme` | Theme/whitelabel — 200 |
| `GET /app/rest/react/detail_view?language=` | Detail-view config — 200 |
| `GET /app/rest/general_settings_list` | General settings — 200 |
| `GET /app/rest/v3/master_settings/get?lang=` | Master settings — 200 |
| `GET /app/rest/is_new_dashboard_activated` | Dashboard flag — 200 |
| `GET /app/rest/dashboard/custom_naming_config` | Dashboard naming — 200 |
| `GET /app/rest/notification/categories` | Notification categories — 200 |
| `GET /app/rest/manager_interaction_settings` | Manager interaction settings — 200 |
| `GET /app/rest/gdpr` | GDPR config — 200 |
| `GET /app/rest/rate_calculation/rate_master_config?partyId=0` | Rate master config — 200 |
| `GET /app/rest/archive/reports_and_search/global_search_configuration` | Global search config — 200 |
| `GET /app/rest/whitelabelling/whiteLabellingEnable/fnu?domain=` | Whitelabel flag — 200 |
| `GET /app/rest/asset/rbundle?origin=` | Resource bundle (i18n) — 200 |
| `POST /mid-mile/operational-dashboard/api/rest/v1/ops-dashboard…` **[LIVE — verified 2026-08-27]** | The staging Dashboard's own service. All calls: `Content-Type: application/camel+json` (plain json → "must not be null" on every field), body `{filterExpression:{booleanOperator:"AND", filterConditions:[{filterName,filterValue,comparisonOperator:GTE/LTE/EQ/IN}]}, indexName:"consignment_local_index", resourceType:"CONSIGNMENT", pageSize, pageNumber, aggregations:[{aggregationField}], sort?}`. **Per-tab endpoints** (our Dashboard mirrors this): **base ``** → aggregation buckets WITH counts `{docCount:[{count}], state:[{value,count,prettyName}…], …}` (Milestones tab); **`/sla`** → `{summary:{cards:[{key,value,prettyName}]}, stateOverview, lastMilestoneEventCodeOverview}`; **`/consignment-kpi`** → 11 numeric KPIs (pending/failed/dataValidationFailed/vip/hazmat/pastDeliveryDate…); **`/list`** → `{consignments[], paginationInfo}` (ops-index rows incl. currentFacilityCode, agingStartAt — Facility Mis + Ageing derive from it); **`/consignment/aggregations`** → distinct values only, NO counts; **`/hub-mis`, `/consignment-hub-mis`, `/milestone`** → 500 on prod0003 (no hub event data). Tab set itself = OPS_DASHBOARD settingJson `visibleTabs` |
| `GET /app/rest/react/disclaimer_settings` / `chart_settings` / `color_settings` | 204 (not configured) |
| `GET /app/rest/getAllVariables` / `landing_page_config` / `insights_configuration` / `notification/configuration?id=` | 404 (not present on this account) |
| `GET /app/rest/user/expiry_notification` | 400 on this account |

## Base-module / company config (console + platform, cookie auth) — from ceva UAT capture

The likely home of "base module" settings (payloads not yet captured — pull live):

| API | Purpose |
|---|---|
| `POST /master/api/v1/moduleSettings/fetch` **[LIVE — verified 2026-08-26]** | **Module settings read** — powers Custom Settings → Base Modules toggle state. **POST-only** (GET 405s). Body `{}` for all rows, or `{pageNumber, pageSize, query:[{attribute:"code", condition:"equals"\|"isAny", values:[…]}]}` to filter by code. Paged envelope `{totalElements, totalPage, currentPage, pageSize, content[]}`; each entry `{id, companyId, code, name, enabled, settingJson, createdAt/By, lastUpdatedAt/By}`. **`settingJson` is a JSON-encoded STRING** (parse it). Module set varies per account (prod0003 11 rows, dms 28) |
| `PUT /master/api/v1/moduleSettings` **[LIVE — verified 2026-08-26]** | **Module settings UPDATE** (the Base Modules toggle + every module config save). Body is an **ARRAY**: `[{enabled, code, name, settingJson}]`. Response `{successCount, successList:[{code}], failureCount, failureList}`. Captured live from the real console toggle |
| `POST /master/api/v1/moduleSettings` **[LIVE — captured 2026-08-26]** | **Module settings CREATE** — same array body/response as PUT. The console POSTs when a code has **no row yet**, PUTs afterwards (staging code even falls back POST→PUT on error). **Key semantic: a code with NO row renders as toggle-off** — e.g. CARRIER_PORTAL/LOAD_PLANNING on fresh accounts; first enable creates the row |
| Base Modules LISTING | **There is no listing API.** The 7-entry list (OPS Dashboard, Consignment Order, Pending For Planning, Load Planning, Carrier Portal, Geo Coding, Enable Routing) is **static config inside the SPA bundle** (labels/descriptions/icons/codes, `apiMasterSettingsCode`: OPS_DASHBOARD, CONSIGNMENT_MANAGEMENT, PENDING_FOR_PLANNING, LOAD_PLANNING, CARRIER_PORTAL, GEOCODING, ROUTING). This is why "Carrier Portal" appears with no backing row. Mirrored statically in our `src/nueva/BaseModules.tsx` |

### Base-module `settingJson` shapes (drive the detail pages; save = PUT whole row)

- **OPS_DASHBOARD**: `{visibleTabs[], defaultActiveTab, tableColumns:[{key,sequence}], filters:[{key,sequence}], userTypeList[], enabled, <perDashboard>{…}}`. Dashboard options (bundle): consignmentDashboard=Milestones, consignmentFacilityMis=Facility Mis, consignmentAgeingDashboard=Ageing Dashboard, sla=SLA, **slot=Slot Utilization**. Column universe = 24 keys (bundle `zJ`, exact titles incl. `key`=Aggregate Key, `businessUnit`=Merchant, `lastmileDriverName`=Assigned To Driver)
- **CONSIGNMENT_MANAGEMENT / PENDING_FOR_PLANNING** (and Load Planning/Carrier Portal when configured): `{enabled, userTypeList[], pageRenderingConfig:{filters:{key:{show,sequence}}, table:{columns:{key:{show,sequence}}}}, dateAppliedOn, selectedDateRange}`. The `{key:{show,sequence}}` maps ARE the universe (hidden keys stay with show:false). Date field codes: `created_at, ship_to_delivery_date, ship_by_date, last_updated_at, dispatch_date`; range codes: `-30, -15, -7, 0, 7`
- **GEOCODING**: `{name, code, enabled, mapProvider:{"1":{provider,isPartialLookupAllowed},"2":…}, addressTypes:[shipFromAddress|shipToAddress|returnToAddress]}`. Provider ids: `google, googleRetry, hereMaps`
- **ROUTING**: `{enabled}` only — the toggle is the whole module
| `GET /master/api/v1/authz/get_ui_config` | Role/UI feature config |
| `POST /master/api/v1/<entity>/fetch` **[LIVE — verified 2026-08-27]** | **Generic master-service read** — same paged envelope as moduleSettings (`{totalElements,totalPage,currentPage,pageSize,content[]}`), body `{pageNumber,pageSize}` (query filters 500 — filter client-side). Live entities on prod0003: `sku`, `serviceType`, `packageType`, `consignmentType`, `vas`, `sortCode`, `slot`, `palletSpace`, `tagMaster`, `hub` (My Network — real rows), `location`, `dockMaster`, `lane`, `hubToHub`, `loadType`, `businessUnit` (Merchant — real row), `vehicle`, `storageLocation`. Also live: `branch` (My Network Setup Branch — SUPERSET of `hub`: includes rows hub filters out, e.g. the active new york; schema adds branchType, businessUnitCode, address JSON string w/ country, contact, cutoff times, lat/long, geofences) and `branchGeofence` (rows: fenceType is a NUMBER — a string is "invalid request body"; branch link = `branchId`; PUT unsupported → "Invalid master type", so create-only via API). Branch UPDATE validates required fields on the FULL row (TimeZone mandatory) — always PUT the whole fetched record with fields changed, never a partial body (omitted fields are ZERO-FILLED and overwrite: a minimal PUT wipes branchType/cityId/contact/address). Branch lat/long: strict numeric unmarshal (strings = "invalid request body") AND a min-0 validator REJECTS negative values — western-hemisphere coordinates cannot be stored top-level; our form keeps real coordinates inside the address JSON and only sends top-level lat/long when ≥ 0. **Network master — staging's EXACT endpoints (all captured via XHR intercept and wired into our My Network page)**: Branch list `GET /v1/app/rest/hubs_page?pageNo&pageSize` (Spring page; rows carry enabled/timeZone/hubType/cityId/zipCode + address OBJECT {contactPerson, contactNumber, addressLine1/2, state, country}); Branch write `POST /app/rest/hubs` (upsert, accepts the address object + top-level zipCode + negative longitudes — enable/disable is this same POST with `enabled` flipped); branch filters `GET /v1/app/rest/hub_filters?...requiredFields=`; Serviceable Areas list `POST /master/api/v2/branch/serviceableArea/list` and Zone Master list `POST /master/api/v2/branch/zoneMaster/list` (both `{pageNumber,pageSize,query:[],sortControl,includeSubDetails,dynamicQuery}` → standard envelope; creation runs through staging's multi-step wizard — separate contract); zone-step dropdowns: `/v1/app/rest/hubs_via_role/pageable`, `/ship/app/rest/carrier_master/filtered`, serviceType/sortCode fetch; custom geofences `GET /master/api/v2/customGeofences/countries`. **TWO BRANCH STORES that do NOT sync on this account**: staging's Setup Branch UI (list + Re-activate) runs on the LEGACY hub store (`POST /app/rest/hubs` upsert — body `{id, code, name, enabled, companyId, cityId, timeZone, latitude, longitude, hubLocation:"lat,lng"}`; legacy ACCEPTS negative longitudes, unlike the master-service validator), while the master-service `branch` entity is a parallel new store. A write to one is invisible in the other — our Branch page therefore DUAL-WRITES (master `branch` PUT + legacy `/app/rest/hubs`) so edits appear everywhere; `city_hub_list` reflects legacy immediately. The master `hub` entity is a lagging partial mirror of legacy — not authoritative. Address dropdown sources: countries GET /master/api/v1/geofence/countries; cities GET /app/rest/cities (branch links via cityId); states/zips/suburbs POST /master/api/v1/geofence/search with the EXACT captured payload `{"query":"","level":"state"|"pinCode"|"city"|"suburb","countryCode":"US","limit":30}` — `level` is CASE-SENSITIVE lowercase; uppercase/wrong names are silently ignored and fall back to pinCode results (looked like "no state list exists" until the real body was captured via XHR intercept in the staging tab). NOT here (500 on every guess): businessParameter, reason, dock, merchant, asset, zone, serviceableArea, city — different service or different name |
| `POST/PUT /master/api/v1/<entity>` **[LIVE — verified 2026-08-27]** | **Generic master create/update** — array body, `code` REQUIRED on every row (`SKUMaster.BaseModel.Code … required` without it; keep `code` = the entity's own code field). POST=create, PUT=update (incl. `id`). Response `{successCount, successList:[{code}], failureCount, failureList:[{reason}]}`. SKU row shape: `{code, skuCode, skuCategory, hub[], description, length, breadth, height, weight, uomDimensions, uomWeight, stackable, enabled}` |
| `GET /v1/app/rest/geoFencing_data_for_hub?hubId&cityId` **[LIVE — captured 2026-08-27]** | **Hub geofences — staging's Manage Geofence page store.** Geofences are DUAL-STORE like branches: this legacy store is what staging's page reads/writes; the master `branchGeofence` entity is a separate parallel store staging never shows (a fence created there is invisible on staging's page — that's why our list showed "Florida Zone 1" while staging showed "United States"). Returns a plain ARRAY of fences: `{id, name, companyId, hubId, geoData, colorCode, priority, enabled, fenceType:1, travelingMode:"driving", labels, mergedZipCodes, minStopsForClustering, stopThresholdConfig, …}`. `geoData` is a STRINGIFIED `{"geoJSON":{"type":"Feature","properties":{"color","fillColor"},"geometry":{"type":"Polygon","coordinates":[ring]}}}`. **Save** = `POST /v1/app/rest/geoFencing_data_for_hub?hubId=<id>` with an ARRAY of fence rows — UPSERT: id present = real update (id preserved), id absent = create; rows missing from the array are untouched (staging's enable/disable is this POST with the full row + `enabled` flipped). **Delete** = `POST /v1/app/rest/geoFencing_data_for_hub/delete?id=<fenceId>` body `{}`. **All-hub counts** = `GET /app/rest/geoFencing_data_for_multiple_hub?hubIdList=<csv>&showSmartSuggestion=false` (one call, all fences across hubs). Import/export on staging: `POST /v1/app/rest/upload_hub_geofence_json_configuration/<hubId>`, `GET /app/rest/download_hub_geofence_json_configuration?hubId=` (our UI parses/builds GeoJSON client-side through the same save POST instead). **Field formats (verified against the live validator 2026-08-27)**: `labels` = COMMA STRING (JSON array → 400 "Inappropriate JSON"), `startLocation` = `"lat,lng"` string, `stopThresholdConfig` = STRINGIFIED JSON object (raw object → 400), `mergedZipCodes` = comma string, `minStopsForClustering` = number, `masterDeliveryVelocity` = the "No. of stops per hour" column, `fenceType` = 1 Normal / 4 Exclusion / 5 Virtual (wizard dropdown values; enum also defines PARENT:2, CHILDREN:3), stop-threshold parameters = weight / pallets / tag / tagRegex. **Define-Area search APIs**: zip suggestions `GET /master/api/v1/geofence/postalCode/suggestions?postalCode=&countryCode=` → `{suggestions:[]}`; zip boundary `GET /master/api/v1/geofence?postalCode=&countryCode=` → `{city, country, geom:"<stringified GeoJSON Polygon|MultiPolygon>"}` (ZCTA import); address geocoder `GET /app/rest/geoCoding_v2?query=` → `{latitude, longitude, address}` (Google-backed). `GET /app/rest/geoFencing_data_for_multiple_hub?hubIdList=` returns ENABLED fences only — counts derived from it are active-fence counts |
| `POST /master/api/v2/branch/serviceableArea` **[LIVE — captured 2026-08-27]** | **Serviceable Areas — staging's wizard step 2 store.** List `POST …/serviceableArea/list` (`includeSubDetails:true` → rows carry `serviceableRule`); filters `POST …/serviceableArea/filters` → `{branch_name[], country[]}`; **create** `POST …/serviceableArea` → 201 with `{branchId, branchName, enabled, country, source:"GLOBAL_GEOFENCES", serviceableRule:[{key: state\|city\|suburb\|postal_code, value:[{value, alias}], exclusions:[]}]}`; **update/toggle** `PUT` same path with the FULL row (id) — **APPEND-ONLY**: the server rejects removing rule keys ("removing rule keys is not allowed") AND removing values ("deleting existing values is not allowed"); flipping `enabled` and adding keys/values is fine; there is NO delete. Area options come from the geofence/search cascade (levels state/city/suburb/pinCode). Our Serviceable Areas tab (LiveMaster cfg + RuleBuilder) locks saved areas in the edit form accordingly. **More constraints (verified 2026-08-27)**: ONE serviceable-area row per branch — a second create 500s with "This branch already has serviceable areas"; rule `exclusions` = `[{key, value: ["<name>", …]}]` (value is a plain STRING ARRAY — `[{value,alias}]` objects or a bare string both 400) and exclusions are **CREATE-ONLY** — adding them on update 500s with "adding exclusions is not allowed". `GET /app/rest/geoFencing_data_for_multiple_hub` counts ENABLED fences only — branch-list geofence counts use per-hub `geoFencing_data_for_hub` reads for true totals |
| `POST /master/api/v2/branch/zoneMaster` **[LIVE — captured 2026-08-27]** | **Zone Master — staging's wizard step 3.** List `POST …/zoneMaster/list` → rows `{id, branch_id, carrier[], service_type[], level, source, stats:{total_serviceable_areas, eta_zone_configured, billing_zone_configured, sort_code_configured, availability_configured}}`; filters `POST …/zoneMaster/filters` → `{branches:[{id, branchName}]}`; **areas at a level** `POST …/zoneMaster/serviceableArea` `{…page…, branch_id:"<id>", level, is_edit_mode}` → the branch's serviceable areas expanded at that level (with `is_edit_mode:true` mapped rows carry `eta_zone_name`/`billing_zone_name`/`sort_code`); **create** `POST …/zoneMaster` → 201 `{branch_id, carrier:[], service_type:[], level, zone_masters:[{level_value, eta_zone_name, billing_zone_name, sort_code, availability}], excluded_areas:[]}` → `{mapped_zone_master_ids}`. Levels = serviceable-rule keys: state \| city \| suburb \| postal_code \| country (UI label "Zipcode" maps to `postal_code`; literal "zipcode" → 500 "invalid level"). Our Zone Master tab (src/nueva/ZoneMaster.tsx) runs list/view/add on these |
| `GET /master/api/v1/tagMaster/fetch` | Tag master |
| `GET /master/api/v1/sortCode/fetch` | Sort-code master |
| `GET /app/rest/account` → `company.enabledServiceList` | Flat map of enabled platform services (KEYCLOAK, notification platforms, deviceSyncV3, geoLookUpV3, MFA_SETTINGS, …) |
| `GET /app/rest/hub_configuration/list?routingType=1` | Hub configuration |
| `GET /app/rest/master/businessUnit` | Business-unit master (= "Merchant" field) |
| `GET /app/rest/get_merchant_master_config` | Merchant master config |
| `GET /app/rest/fetchDistanceMatrixConfig` | Distance-matrix config |
| `GET /app/rest/consignment_roster_settings?routingType=1` | Roster settings |
| `GET /app/rest/get_routing_exception?skipInbound=true` | Routing exceptions |
| `GET /app/rest/fetch_hub_and_fence_routing_config?hub_id=` | Hub + fence routing config |
| `GET /app/rest/order/autoRoutingCreditInfo` | Auto-routing credit info |
| `GET /app/rest/get_measurement_units` | Measurement units (km/kg) |
| `GET /app/rest/label` | Label config |
| `GET /app/rest/users/report_customization?dumpName=ROUTING_DUMP_REACT` | Report column customization |
| `GET /app/rest/post_hook_master?type=export_routing_for_route_cost` | Export hook config |

Not FarEye APIs (ignore in captures): `*.clarity.ms/collect` (Microsoft Clarity
session-replay), `analytics.google.com` / `www.google-analytics.com/g/collect` (GA4).

## Custom Settings pages — see FAREYE-SETTINGS-APIS.md

Full per-area catalog (14 areas, mined from the staging SPA bundles) lives in
**[FAREYE-SETTINGS-APIS.md](./FAREYE-SETTINGS-APIS.md)**. Live-verified deltas (2026-08-26, prod0003):

| API | Verified behavior |
|---|---|
| `GET /app/rest/users` **[LIVE]** | **500 without `userTypeId`** — the console always lists per user type. Full params: `activatedUser, pageNo, query, recordsPerPage, sortOn, sortType, userTypeId, cityId, hubId, isLoggedIn, companyId`. Spring page envelope `{content, totalElements, totalPages, number, …}` |
| `POST /app/rest/users/user_activation\|user_deactivation?companyId=` **[LIVE]** | Body = **array of logins** |
| `GET /master/api/v1/authz/user-groups\|user-roles?page=1&page_size=…` **[LIVE]** | `{items:[…]}`; roles embed the full `permissions` tree `{module:{page:{actions[]}}}` |
| `POST /master/api/v1/incident{Config,Escalation,Notification}/fetch` **[LIVE]** | moduleSettings-style envelope; empty on prod0003. DELETE base path takes an array of ids |
| `GET /ship/app/rest/get_validation_fields?type=` **[LIVE]** | `type` enum: `SHIP_FROM, SHIP_TO, BILL_TO, RETURN_TO, CARRIER, SHIPMENT_DETAILS, ADDITIONAL_FREE_INFO` (400 otherwise). Returns per-section field defs with `json_key` |
| `GET /ship/app/rest/default_shipment_conf` **[LIVE]** | Array of number templates (CONSIGNMENT/PACKAGE config_type, start_with/ranges/running_number) |
| `GET /ship/app/rest/labelTemplate` **[LIVE]** | Requires `pageNumber` (+`recordPerPage`); snake_case paged `data` envelope |
| `GET /ship/app/rest/config` **[LIVE]** | Ship flags (`isShipmentManagementEnable, isCarrierMasterEnable, allowedUserTypesForCM/SM, dispatchModule, printVai*`); save = `POST /app/rest/ship/config` |
| `GET /app/rest/carrier_allocation/fulfilment_centers` **[LIVE]** | `{fulfilmentCenterList:[…]}` real data; `get_config` **500s** and `carriers` 204 on prod0003 |
| `GET /app/rest/diy-settings/get?mainSettingType=PARCEL_VISIBILITY&subSettingType=CONTROL_TOWER` **[LIVE]** | **404 "No configuration found" = defaults**, not an error |
| `GET /expand-cmr/webhook` **[BROKEN on prod0003]** | 500 `relation "webhook_config" does not exist` — service not provisioned for this account |
| `GET /app/rest/is_integration_org_configured` **[LIVE]** | Bare boolean body (`false` on prod0003) |
| Notify/Engage/Return/CT/ST moduleSettings codes | All absent on prod0003 except `DRIVER_APP_CONFIG` — absent = unconfigured, first save POST-creates |

## Location Master — `businessUnitLocation` (verified 2026-08-27)

Staging's Location Master page (`/v2/custom_settings/master-service/masters/network_location`)
runs on the generic master engine with entity **`businessUnitLocation`** — NOT the v1
`location` entity (which staging never reads; anything written there is invisible).

- Generic contract: `POST /master/api/v1/businessUnitLocation/fetch`, POST create / PUT
  update with ARRAY bodies, `PUT /activate|/deactivate`, excel oracle at
  `GET /master/api/v1/sampleExcelDownload/businessUnitLocation`.
- Payload is **snake_case**: `code, name, branch_id (int, legacy hub id), type,
  contact_person, contact_number, email_id, distance, distance_uom, dock_count,
  lift_gate_required, fork_lift_available, avg_service_time, max_vehicle_count,
  address {address_line1..3, city, suburb, state, postal_code, country, country_code,
  latitude (float), longitude}, operating_hours [{day:"Monday", serviceable,
  open_time:"HH:mm", close_time, is_primary}], capacity {...}, fallback_address {...},
  plus arrays: language, facility, payment_mode, service_type, consignment_type,
  vehicle_type, communication_preference`.
- **`business_unit_code` and `business_unit_name` are ARRAYS of strings** (a location
  can serve several merchants; staging's list shows first + "+n"). Sending a plain
  string silently drops the field → create fails with
  `business_unit_code is required for MERCHANT_LOCATION`. Older rows may still hold
  strings on read — normalize both ways. Merchant is REQUIRED only for
  `MERCHANT_LOCATION`.
- `type` enum: `MERCHANT_LOCATION | CUSTOMER_LOCATION | PUDO | HUB | PARCEL_LOCKER`.
- Address cascade (used by staging's form): `GET /master/api/v1/branch/serviceableArea/
  serviceableCountry`, `…/serviceablePostalcode?country=<NAME>`, `…/serviceableArea?
  country=&postalCode=` → `{county→suburb, city, state}` (country by NAME, not code).
- Excel required columns: Location Code, Location Name, Merchant Code, Location Type,
  Address Line 1, Postal code.
- **Official bulk template = EXACTLY 25 columns** (pulled live 2026-09-03 from
  `GET /master/api/v1/sampleExcelDownload/businessUnitLocation`), in this order:
  `Location Code/Id *`, `Location Name *`, `Branch`, `Merchant Code`, `Location Type *`,
  `Contact Person`, `Contact Number`, `Email ID`, `Address Line 1 *`, `Address Line 2`,
  `Address Line 3`, `City`, `Suburb`, `State`, `Postal Code`, `Country *`, `Latitude`,
  `Longitude`, then **`Operating Hours Mon` … `Operating Hours Sun` — ONE column per day**,
  cell format `"09:00 - 18:00"`. Starred headers are mandatory.
- **Bulk-uploaded operating hours come in with `is_primary: false` on EVERY day** (verified
  2026-09-03 on `MC_003`, created through the importer). The UI/API path sets one primary per
  serviceable day; the Excel path has no primary column and nominates nothing. A location
  created by bulk upload therefore has **no primary window at all** until someone edits it in
  the console — worth checking if anything downstream keys off `is_primary`.
- **The bulk sheet CANNOT express multiple operating-hour slots per day, but the API/UI can.**
  Live `MC_001` stores two Monday windows
  (`[{day:Monday,09:00-17:00,is_primary:true},{day:Monday,18:00-20:00,is_primary:false}, …]`)
  and the console renders both — but the template has a single Mon column and no
  `is_primary` column anywhere, so a bulk upload can only ever set one window per day and
  the first serviceable window becomes primary. Adding a duplicate `Operating Hours Mon`
  column does NOT work. Workaround: bulk-upload one window per day, then add extra slots in
  the UI. A template extension would need either a delimiter inside the cell
  (`"09:00 - 17:00 | 18:00 - 20:00"`, first = primary) or explicit `… Slot 2` + primary columns.
- **`Location Type *` in the EXCEL takes the human LABEL — the JSON API takes the ENUM TOKEN.
  They are different vocabularies for the same field** (proven live 2026-09-03; an earlier
  note here claiming the sheet wants the token was wrong):

  | Excel cell (bulk upload) | JSON `type` (API) |
  |---|---|
  | `Merchant Location` | `MERCHANT_LOCATION` |
  | `Customer Location` | `CUSTOMER_LOCATION` |
  | `PUDO` | `PUDO` |
  | `Hub` | `HUB` |
  | `Parcel Locker` | `PARCEL_LOCKER` |

  Sending the token in the sheet fails with `Invalid Location Type: 'MERCHANT_LOCATION'.
  Allowed values: Merchant Location, PUDO, Hub, Parcel Locker, Customer Location` — and note
  the API returns a bare 500 for a bad token, so the **bulk importer is the only surface that
  will actually tell you the legal values**. Use a deliberately-invalid cell to enumerate any
  master's Excel enum. Blank → `"Location Type is required"`. The template's own sample value
  `Warehouse` is placeholder junk and is in neither vocabulary.
  `Merchant Code` is mandatory whenever the type is Merchant Location.
- **The WORKSHEET must be named exactly `Location Master`** — not `Sheet1`. A correctly
  shaped sheet with the wrong tab name fails with
  `{"error":"Failed to read excel file","message":"sheet Location Master does not exist"}`.
  The importer looks the sheet up **by name, not by index**, so this is per-entity: always
  reuse the tab name from that entity's `sampleExcelDownload` output. Combined with the
  shared-strings requirement, a hand-built file must match on THREE axes — tab name,
  shared-string table, and the exact 25 headers.
- **Bulk upload endpoint**: `POST /master/api/v1/excelUpload` (multipart, cookie auth) —
  NOT `/excelUpload/<entity>`, which 404s. It takes the entity as a **parameter whose exact
  token is still unknown**: `?masterType=`/`?type=`/`?entity=`/form-field all return
  `400 {"error":"Invalid master type"}` for every casing of `businessUnitLocation`,
  `network_location`, `business_unit_location`. Grab the real token from the staging
  console's network tab when doing a manual upload.
- The master service returns a bare **`500 {"error":"internal server error"}` for an invalid
  `type`** rather than a validation message, so the invalid-value-probe trick that works on
  the ship API does not enumerate enums here.

## Package master — `packageType` + merchant master — `businessUnit` (verified live 2026-09-22)

Both follow the uniform master-service contract: `POST /master/api/v1/<entity>/fetch`,
body `{pageNumber, pageSize}` → `{totalElements, totalPage, currentPage, pageSize,
content:[row]}`. Probed through the dev proxy as `dms_admin` (company **20106**).
Read by the Grow merchant portal (`src/growOrders/masters.ts`) alongside
`businessUnitLocation` and `sku`.

### `packageType` row — 5 rows on this company

```json
{ "id": 5, "companyId": 20106, "enabled": true,
  "code": "Crate", "name": "Crate",
  "unitOfMeasure": "CM",           // dimension UOM — seen: "CM", "M"
  "length": 10, "breadth": 3, "height": 6,
  "weight": 10, "weightUom": "KG", // weight UOM
  "businessUnitId": 3, "businessUnitCode": "Comfy Furniture",
  "businessUnitName": "Comfy Furniture",
  "createdAt": "...", "createdBy": "", "lastUpdatedAt": "...", "lastUpdatedBy": "" }
```

- The dimension UOM key is **`unitOfMeasure`**, NOT `uom`/`uomDimensions` — the SKU
  master's spelling (`uomDimensions`/`uomWeight`) is *not* reused here. The weight UOM
  is `weightUom` (no `s`).
- Width is **`breadth`**, as everywhere else in the master service.
- `businessUnitCode` is a plain STRING (one merchant per package type), unlike
  `businessUnitLocation.business_unit_code`, which is an ARRAY.
- There is no `status` field — `enabled` is the only on/off flag. (The static replica
  in `nueva/mastersTree.ts` shows a `status` column; that is the UI's rendering of
  `enabled`, not a row field.)
- Real data is messy: `Half Pallet` is `10 × 10 × 10` with `unitOfMeasure: "M"`, i.e.
  1000 cm a side. Convert, don't assume cm.

### `businessUnit` row — 9 rows on this company

```json
{ "id": 9, "companyId": 20106, "enabled": true,
  "code": "Walgreens", "name": "Walgreens", "isDefault": false,
  "contactPerson": "Walgreens", "contactNumber": "", "email": "walgreens@gmail.com",
  "logo": "", "numberOfReattempts": 0,
  "addressLine1": "108 Wilmot Road", "addressLine2": "Deerfield",
  "addressLine3": "IL 60015, USA", "postalCode": "60015",
  "suburb": "", "state": "", "country": "US", "city": "",
  "websiteUrl": "", "policyUrl": "", "contactFormUrl": "",
  "generateReturnLabel": false }
```

- Address fields are **FLAT camelCase** (`addressLine1`, `postalCode`) — there is no
  nested `address` object, unlike `businessUnitLocation`.
- `code` is human text, not a slug (`"Bob's Discount Furniture"` — apostrophe and all),
  so never build a URL segment out of it unencoded.
- `businessUnitLocation.business_unit_code[]` and `packageType.businessUnitCode` both
  join on this `code` — and the join can MISS: `packageType` rows on this company point
  at `"Comfy Furniture"`, which has no `businessUnit` row. Treat an unresolvable owner
  as company-wide rather than hiding the record.

### `businessUnitLocation` on this company (2026-09-22)

All **5** rows are `type: "MERCHANT_LOCATION"` and all 5 carry
`business_unit_code: ["Walgreens"]`. So of the 9 merchants, only Walgreens has
pickup locations; the other 8 legitimately resolve to an EMPTY location list. Any
UI that offers a pickup-location dropdown must render that empty state — it is
real data, not a load failure.

### Unit normalization used by the portal

`length/breadth/height` → cm (`IN` ×2.54, `MM` ÷10, `M` ×100) and `weight` → kg
(`LB` ×0.4536, `G` ÷1000). A **missing UOM means "already cm/kg"**, not zero.

### 401 behaviour

With no session the proxy returns a **real HTTP 401** with body
`{"status":401,"error":"Unauthorized","message":"Access Denied","redirectUri":"https://staging.fareye.co"}`
— `res.ok` is false, so `fetchMasterRows` throws and callers can branch on the status.
It is not a soft 200 with an error body.

## Consignment v3 payload contract — hard-won details (verified live 2026-08-27)

All probed with cookie auth against `POST /ship/api/v3/consignments` until 200s, then read back via `getAllConsignmentDetails`.

- **`totalWeight` + `totalWeightUom` are REQUIRED** (422 "must not be null"). Derive from SKU lines × qty, fall back to package weights.
- **UOM fields are validated ENUMS — the API returns the full allow-list on a bad value** (probed live 2026-09-10; a garbage UOM → 400 `"<field> must be one of: [...]"`). Same enum at all three levels (consignment totals, `packageDetails[]`, `skuDetails[]`):
  - **Weight UOM** (`totalWeightUom` / `weightUom`): **`KG, LB, TO, WTO, DTO`**. Note `LB` not `LBS`; grams (`G`) NOT accepted.
  - **Dimension UOM** (`dimensionUom`): **`CM, IN, MM`**. Metre (`M`) NOT accepted.
  - **Volume UOM** (`totalVolumeUom` / `volumeUom`): 28 values — real: `MM3, CM3, IN3, M3, L, KL, GAL`; plus packaging/count units `BAG, BTL, CAN, CAR, BOX, CRT, CYL, DRM, DTO, EA, FT, IBC, PAC, PAL, PLS, PLY, ROL, SHT, PC, ZPC, CBY` (the total- and package-level error messages list the same set in different order).
  - **⚠ Our Add form UI is WRONG**: it offers weight `LBS`/`G` and dimension `M` (`src/components/consignmentRows.tsx`), all rejected by the API. Should be `KG`/`LB` and `CM`/`IN`/`MM`.
  - **Strict EXACT-CODE match — no synonyms, plurals, spellings or unicode** (battery-tested 2026-09-10): rejected are `LBS, KGS, G, GRAM, MG, OZ, TON, TONNE, MT, T, POUND, KILOGRAM` (weight); `M, METER, INCH, FT, KM, YD, DM, CMS, MTR` (dim); `CBM, CFT, ML, LITRE, LITER, CC, GALLON, PINT, FLOZ, DL, HL, CUFT, M³` (volume). So there is **no grams / millilitres / ounces / cubic-metre-as-CBM / cubic-feet**; use `M3` (not CBM), `TO` (not MT/TON). Grams and ML simply don't exist in the enum.
  - **Spec UNDER-documents it**: the developer-portal yaml enums say weight = `KG,LB` only and volume = 3–5 values, but live validation accepts weight `KG,LB,TO,WTO,DTO` and volume 28. Trust the live 400-error list, not the spec.
  - **End-to-end verified at CREATE**: a single consignment with 28 packages spanning every accepted value → `success_count 28` (`UOMFULL0910`, 2026-09-10). Stored-value read-back (getShipmentPackageDetails) still pending a console session, but these are validated enum *code* fields so they store as-sent.
- **Facility codes are typed**: `destinationFacilityCode` (and `address.type: FACILITY`) only accept real facility codes — sending a `businessUnitLocation` code (customer/PUDO) → 422 "Ship to destination facility code is not valid". Only parties that ARE facilities per the consignment type may carry them. **Caveat:** this is not a reason to drop `destinationFacilityCode` on a home-delivery leg — per FarEye's topology matrix it still carries the *last-mile hub*. The customer's own location code belongs in `address.code`, which is a different field (see below) — that split is what makes all 5 topology patterns expressible.
- **Alternate/secondary mobile IS supported: `<party>.contact.secondaryContactNumber`** (verified live 2026-09-07). Formally in the v2 spec — *"Alternate phone number for communication"*, `type: string`, **`maxLength: 16`** — and available on every contact block (`shipFrom`, `shipTo`, `billTo`, `shipper`, `returnTo`). It reads back **nested**, as `<side>_address.location_contact.secondary_contact_number`; the top-level `<side>_address.secondary_contact_number` is always `null`, so don't look for it there. Confirmed stored on both sides of `SEC0907A`.
- **The label PDF is a COOKIE-FREE read channel** — `data.tracking_details[].label` is a public `ship/public/download_label` URL. When the console session is dead (they last ~20 min) you can still prove what was stored for anything the label prints: fetch the PDF, `zlib.decompress` its streams, and pull the `(...)` text strings. Verified 2026-09-07 to confirm contact name, phone and address on `TKT0907C`. It prints DELIVER-TO name, address line 1, state, pincode, phone, weight, consignment + tracking number and sender — but **not** company name, email, city, `customerNumber`, or the secondary phone, so absence from the label is NOT evidence of non-storage.
- **Phone numbers are stored VERBATIM — no normalisation, no format validation.** `(563)-345-676` (Canada style, with parentheses and dashes) round-trips unchanged in both `contactNumber` and `secondaryContactNumber` (`SEC0907B`). Only the 16-char cap applies.
- **⚠ `location_contact` (and with it the secondary number) is DROPPED when the ship-to address geocodes successfully** — leading hypothesis from a controlled 2×2 (2026-09-07). Holding the phone format constant and varying only the country: `country: "US"` (Chicago/60607) → geocode FAILS, `secondary_state: ["GEO_LOOKUP_NOT_FOUND"]`, `location_contact` **populated**; `country: "CA"` (Toronto/M5H2N2) → geocode SUCCEEDS (lat/long present, no exception), `location_contact` **null**, with name/email/company/contact_number flattened onto the address top level and **no `secondary_contact_number` field anywhere on it**. Both phone formats behaved identically, so this is not a formatting issue. Practical consequence: on a cleanly-geocoded address the alternate number appears to be lost. **Not fully confirmed** — the decisive test (`SEC0907G` US vs `SEC0907H` CA, with *distinct* primary `(563)-345-676` and secondary `(999)-111-222` so the two can be told apart) was created but the session expired before read-back. Re-read those two and grep the record for `(999)-111-222` to settle it.
- **VAS**: the key is `consignmentDetails.vas` — `vasDetails` is **silently dropped**. Shape: `[{vasCode, vasAddedLevel: "SKU"|"PACKAGE"|…, targetIds: [...], serviceTime, remarks}]`. SKU-level `targetIds` must be the **SKU `lineItemNo`s** (SKU codes → 422 "Sku codes inside vas not mapped with any sku details"); level consistency is validated ("SKU level requires SKU details"). Reads back as row `vas: [{name, vas_added_level, id: [target], service_time, remarks}]` — note **`remarks` comes back as the VAS master's description**, not what was sent.
- **`skuDetails` persist and read back** on the listing row (`sku_details`, snake_case, incl. `package_ids` and `category`) — earlier "SKUs never readable" impressions were rows created without SKUs. There is **no separate SKU read endpoint**: staging's drawer fires only `getAllConsignmentDetails` (by `key`), `getShipmentPackageDetails` (filter `consignment_key`), `getConsignmentAttemptList`.
- **`reference_number` is often NULL on listing rows** — the reference rides in `key`. Map `reference_number ?? key`.
- **Validation flags live in the `secondary_state` ARRAY** (e.g. `GEO_LOOKUP_NOT_FOUND`); `secondary_state_new` is the pipeline state (LABEL_GENERATED). Staging's Exception State column and its Data-Validation-Issues tab both key off the array.
- **Consignment listing tabs (staging)**: `GET /sbs/app/consignment-listing/tab-wise-config` (state lists per tab — VALIDATION_ISSUE = state PENDING; flagged CREATED rows are added on top), `POST …/tab-count`, `POST …/fetch` (payload shape uncaptured — 400 "Required values are not present" on guesses).
- **Routing Type** options catalog is fixed (`sameday_nextday` "Same/Next Day", `ltl_ftl` "LTL/FTL", `scheduled` "Scheduled", `hyperlocal` "Hyperlocal" — ids 1/2/3/5) and staging filters it to ids having an **enabled** config from `GET /app/rest/general_settings_list`; the field renders only when options remain. Related: `GET /app/rest/fetch_hub_and_fence_routing_config?hub_id=`.
- **Add-form field inventory (bundle-mined)**: staging's Simplified tier = Merchant, Order Number, Consignment Type, Service Type, Ship By Date, window Start/End (in the consignment section) + addresses of exactly Location Code, Name, Email, Contact, Lines 1–3, Country, Postal, City, State + a combined Package/SKU row (Package ID, Type, **Quantity**, Tracking, SKU Code/Name). No Total Quantity form field anywhere (listing column only). Ship-to location dropdown = merchant's locations + merchant-less locations **+ facilities** (`buildLocationList`).
- **Multi-SKU / multi-package works in one call** (verified 2026-08-31 on dms-staging, company 20106): `M3S5P0831` = 3 SKUs across 5 packages, `success_count: 5` — the count is **shipments (= packages), not consignments**. Link SKUs to boxes with `skuDetails[].packageIds: [...]` (a SKU may list several packages); every package needs its own `id` + `trackingDetails[].trackingNumber` (≤10 chars). Totals are NOT derived — set `totalQuantity` (Σ SKU qty), `totalWeight`, `totalVolume` yourself.
- **`data.tracking_details[]` comes back in NON-DETERMINISTIC order** (observed A, D, E, B, C for packages A–E). Match entries by `package_id`; never index positionally.
- **The label URL's base64 `query` token is cosmetic on two fields**: it always embeds `package_id` of the FIRST package and `index: 1`, whatever package the label belongs to. The served PDF is nonetheless CORRECT per package (keyed by the token's `id` UUID — verified by decompressing two labels: P0831A prints T0831A/12.5 kg, P0831E prints T0831E/3.2 kg). Identify a label from `tracking_details[].package_id`, never by decoding the token. The token also has a `||||<orgId>` suffix after the JSON, so `raw_decode` it rather than `json.loads`.
- **Leg topology is driven entirely by `shipFrom.address.code`, not by any flag** (spec §"Facility Code vs Address Code" + matrix, exercised 2026-09-01). `address.code` = a *merchant/DC* code → an **FM (pickup) leg is generated**; `address.code` NULL, or equal to the origin facility code → **no FM leg**. Origin ≠ destination facility → an **MM** leg. So "hub-to-hub, no pickup" = omit `shipFrom.address.code`, set `originFacilityCode`/`destinationFacilityCode` to the two hubs → **MM → LM**. **The MM leg is enabled/configured via X-DOCK** — origin ≠ destination is necessary but NOT sufficient; the mid-mile hop is realised through cross-dock configuration (moduleSettings `DRIVER_APP_XDOCK_CONFIG`, our page `/settings/pilot-xdock`; hub master `businessType` `cx` = Cross Dock, which hangs off a parent sorting centre). On a tenant without X-Dock set up the same payload yields no MM leg — check that config and the hub parent wiring before suspecting the payload. When both are supplied, **facility code wins** over address code. "SKIP FM INBOUND" in the topology matrix is a **tenant/module setting, not a payload field** — it appears nowhere in the v2 spec; with it ON, even a merchant address code stops producing an FM leg.
- **LEG MODEL — the COMPANY topology matrix, verbatim (authoritative, supplied 2026-09-03).** This is FarEye's own logic; everything below it is derived from or checked against it.

  | ShipFrom Address Code | ShipFrom Facility Code | ShipTo Address Code | ShipTo Facility Code | SKIP FM INBOUND | LEGS |
  |---|---|---|---|---|---|
  | NULL | DELHI | NULL | DELHI | NO | LM |
  | NULL | DELHI | NULL | MUMBAI | NO | MM - LM |
  | MERCHANT CODE | DELHI | NULL | DELHI | NO | FM - LM |
  | MERCHANT CODE | DELHI | NULL | MUMBAI | NO | FM - MM - LM |
  | DELHI (Facility Code) | DELHI | NULL | DELHI | NO | LM |
  | DELHI (Facility Code) | DELHI | NULL | MUMBAI | NO | MM - LM |
  | NULL | DELHI | NULL | DELHI | YES | LM |
  | NULL | DELHI | NULL | MUMBAI | YES | MM - LM |
  | MERCHANT CODE | DELHI | NULL | DELHI | YES | LM |
  | MERCHANT CODE | DELHI | NULL | MUMBAI | YES | MM - LM |
  | DELHI (Facility Code) | DELHI | NULL | DELHI | YES | LM |
  | DELHI (Facility Code) | DELHI | NULL | MUMBAI | YES | MM - LM |

  **Four rules fall straight out of it:**
  1. **LM is always present** — every one of the 12 rows ends in LM. There is no zero-LM configuration.
  2. **MM appears iff ShipFrom Facility ≠ ShipTo Facility** (DELHI vs MUMBAI). Independent of address codes and of SKIP FM.
  3. **FM appears iff ShipFrom Address Code is a MERCHANT code AND SKIP FM INBOUND = NO.** `NULL` and *"DELHI (Facility Code)"* behave **identically** — an address code equal to the facility code is treated as no merchant origin.
  4. **SKIP FM INBOUND changes only rows 3→9 and 4→10.** It is a pure FM suppressor; the other eight rows are unaffected because they had no FM to begin with. Effectively: "ignore the merchant address code."

  **What we verified independently (all consistent):** row 2 = the `H2H0902xx` series (NULL address code, `ord → nyc`) → MM-LM. Row 5 = `LML2026-027` and `DLV090301` (address code == facility code, same hub) → LM. Rows 3/4's FM-from-merchant-code matches the spec's *"Facility Code vs Address Code"* section, which also states **facility code wins when both are sent**.

  **Three gaps this matrix does NOT cover — do not extrapolate:**
  - **ShipTo Address Code is NULL in all 12 rows.** The matrix therefore says nothing about a merchant code on the destination side, and nothing about **REVERSE**, where the non-hub code rides on shipTo (spec's *"Returns from Consumer to Store"*; live `LML2026-027`, a `reverse`, stores `ship_to_address.code = "ord"`). The matrix is **FORWARD-only**.
  - **ShipFrom/ShipTo Facility Code is never NULL.** Both facility codes appear mandatory; the matrix gives no legal "no hub" row. This is why dropping `destinationFacilityCode` on a home-delivery leg was wrong.
  - **X-Dock is assumed configured.** The matrix shows MM appearing automatically when hubs differ, but the MM leg is enabled via X-Dock config — on a tenant without it, rows 2/4/6/8/10/12 will not produce MM.

- **LEG MODEL — which field produces which leg (consolidated 2026-09-03).** Four fields decide the leg chain. `address.code` and the facility codes are **independent**; when both are sent, **facility code wins**.

  | Field | Meaning | Effect |
  |---|---|---|
  | `address.code` on the **non-hub** party | client-defined merchant / DC / customer site | present → **FM (pickup) leg**; absent → none |
  | `shipFrom.originFacilityCode` | registered hub | start of the trunk |
  | `shipTo.destinationFacilityCode` | registered hub | end of trunk; ≠ origin → **MM leg**. Still required on home delivery (it is the *last-mile hub*) |
  | `consignmentType` | FORWARD / REVERSE | **flips which side is the non-hub party** |

  Resulting chains (FORWARD): `addr.code` NULL + origin==dest → **LM** · NULL + origin≠dest → **MM-LM** · merchant code + origin==dest → **FM-LM** · merchant code + origin≠dest → **FM-MM-LM** · `addr.code` == facility code → **LM** (no FM — this is LML2026-027's shape).

  **REVERSE inverts the lever.** The non-hub code rides on **shipTo**, not shipFrom — the spec's *"Returns from Consumer to Store"* sets `ShipTo.Address.Code` = hub code, and live `LML2026-027` (a `reverse`) stores `ship_to_address.code = "ord"`. Branch any leg derivation on `consignmentType`.

  Two overrides sit outside the payload: **X-Dock config** enables the MM leg at all (see above), and **SKIP FM INBOUND** is a tenant setting that suppresses the FM leg even when a merchant `address.code` is present. Neither is settable per-consignment.

- **`pickupWindow` / `deliveryWindow` OBJECTS ARE SILENTLY DROPPED** (probed 2026-09-03). The real fields are FLAT and space-separated: `shipFrom.pickupStartDateTime` / `pickupEndDateTime`, `shipTo.deliveryStartDateTime` / `deliveryEndDateTime`, format **`yyyy-MM-dd HH:mm:ss`**. Proof without a read-back: a garbage value inside `pickupWindow{start,end}` still returns **200**, while a garbage `pickupStartDateTime` returns **400 "must be in format: yyyy-MM-dd HH:mm:ss"**. Our Add form had been sending the object form with `T`-separated values, so **every pickup/delivery window it submitted was lost**. Fixed. (Same trick — send a deliberately invalid value — is the general way to tell a recognised field from an ignored one on this API.)
- **`deliveryInstructions` is plural** — the form sent `deliveryInstruction`, which is not a recognised key. Fixed. (Unknown keys are silently ignored, so this cannot be detected by status code.)
- **SKU→consignment flag roll-up is an OR, and it is ASYNCHRONOUS (2026-09-03).** The five handling flags (`stackable`, `fragile`, `vip`, `hazmat`, `heavyWeight`) exist at BOTH `skuDetails[]` and consignment level. Sending **nothing** at consignment level, the consignment ends up with a flag set if **ANY** SKU carries it. Proven with `DLV090303`, whose coverage was deliberately uneven: fragile 3/3, heavyWeight 3/3, vip 2/3, **hazmat 1/3**, stackable 0/3 → console showed **Hazmat, Heavy Weight, Fragile, Vip** and *not* Stackable. The 1-of-3 hazmat rolling up rules out AND; stackable staying off is the control proving the roll-up isn't blanket-setting everything. Note the write field is camelCase `heavyWeight`, the read field snake_case `heavy_weight`.
  **The trap:** the roll-up lands *after* the create returns (the record is post-processed by the `async` pipeline — `last_updated_at` runs ~90s past `created_at` and `version` climbs). Reading back within a minute or two shows the consignment flags still all `false`, which looks exactly like "the roll-up is broken". `DLV090301` was misread this way. **Do not conclude anything about consignment-level flags from an immediate read-back** — wait, or check the console.
- **The create response carries NO flag information at all** — verified by structural diff of two responses whose only difference was SKU flags: identical top-level keys, `data` keys, `tracking_details` keys, `carrier_details` keys, `info: {}`, `success_count`. Searching both responses for any of the five flag names returns zero matches. Flags are observable only in the stored record / UI.
- **`tracking_details[]` order is non-deterministic PER CALL, not per consignment** — re-POSTing the *same* consignment returned `PA, PC, PB, PD, PE` on one call and `PA, PC, PB, PE, PD` on the next. Always match on `package_id`.
- **`consignmentDetails.source` IS a real, server-validated ENUM (discovered 2026-09-03)** — this corrects the earlier "no source field anywhere" conclusion, which was only true of the *read* model. Sending a free string 400s with the full allow-list: **`Consignment Form`, `Consignment Excel Upload`, `API Integration`, `SFTP Integration`, `Grow Order Form`, `Grow Bulk Upload`, `Webstore Plugin`, `PSC`** (exact casing and spaces). All accepted live. So creation channel IS expressible — you just can't invent your own value.
- **`?consignmentAddType=` is a SECOND, separate enum** (`com.fareye.ship.enumerator.ConsignmentAddType`). Brute-forced the constants: **`API` is the only valid one** of `API, FORM, EXCEL, MANUAL, BULK, SFTP, WEBSTORE, PSC, API_INTEGRATION, CONSIGNMENT_FORM`. Composes fine with `source`.
- **HTTP headers cannot carry a source.** `X-Source:` and `source:` are silently ignored — no error, and no observable effect (verified against a baseline). Source must go in the body enum or the query param.
- **Not every failed create burns its consignmentNumber** — refines the earlier blanket rule. A **pre-persistence 400** (enum parse failure, "Validation failure") does NOT reserve the number: `SRC0903D` and `SRC0903E` both 400'd and then created successfully on retry. The reservation happens at the later persistence stage (the 422s that produced the original DUPTEST finding).
- **The label token's `"source":"CUSTOM"` is LABEL-TEMPLATE metadata, not the consignment source** — it stayed `CUSTOM` across creates sending `API Integration`, `Consignment Form` and `SFTP Integration`. Don't read consignment provenance out of the token. Its `from_v2_api: false` and `user_id` are genuine, though.
- **Retrieval of `source` is still UNCONFIRMED** — no api_key read exists and the console session was expired at time of writing. Sentinels planted for the moment a session is available: `SRC0903D` = *API Integration*, `SRC0903H` = *Consignment Form*, `SRC0903I` = *SFTP Integration*, `SRC0903J` = *API Integration* + `consignmentAddType=API`. Check whether `getAllConsignmentDetails` exposes a `source`/`add_type` key on those four; the earlier 300-row null-inclusive scan found none, but every one of those rows was created WITHOUT an explicit source.
- **`consignmentDetails.scannable` is ORTHOGONAL to labels and number generation** (controlled A/B, 2026-09-02). With `scannable: false`, 5 consignments / 14 packages were created normally and **every package still returned a label URL and its tracking number** — it does not suppress label generation. And it does **not** relax the tracking-number requirement: with `trackingDetails` omitted, `scannable: false` (`H2H090222`) and `scannable: true` (`H2H090223`) both 422 with the *identical* `"Number Generation is not configured"`. So on a carrier without number generation you must always supply `trackingDetails[].trackingNumber`, whatever `scannable` says. (Both probe refs are now permanently burned — failed creates reserve their consignmentNumber.)
- **Hub-to-hub batch recipe (re-verified 2026-09-02, 10 consignments `H2H090201`–`H2H090210`, 33 packages, 33 SKU lines, zero failures).** Shapes 2–5 packages × 2–5 SKU lines all accepted in a single call each; `success_count` again equals the **package count**, not 1. Per-package `trackingDetails[].trackingNumber` is mandatory on carriers without number generation and is **stored verbatim** (33/33 echoed back unchanged, all distinct). A SKU may list several `packageIds` (line 001 deliberately spanned two boxes in every consignment) and it is accepted. Totals are never derived — send `totalQuantity` (Σ SKU qty), `totalWeight`, `totalVolume`. Keep tracking numbers ≤10 chars for scannability (`{ref}{A..E}` works well); package `id`s are not scanned so length there is free.
- **dms-staging lane `ord → nyc` IS serviceable** (verified 2026-09-01, 10 consignments `H2H090101`–`H2H090110`). Earlier "use same-hub ord→ord" guidance was over-cautious — cross-hub works; `DELHI`/`MUMBAI` fail only because they aren't hubs in this tenant.
- **The label token embeds provenance the read model doesn't**: besides `"source":"CUSTOM"` it carries `"user_id": 1832565` (the api_key's service user) and `"from_v2_api": false` (i.e. this came via `/ship/api/v3`, not the Connect v2 gateway). Still label-generation metadata rather than a consignment field, but it is the only place a creation *channel* is recorded anywhere in the surface.
- **`PUT /ship/api/v3/consignments` works and is the update verb — with api_key, no bearer needed** (verified 2026-09-01). Re-sending the same `referenceNumber` via **either POST or PUT** returns 200 `success_count: 1` and the **same `ci_consignment_link`**, proving it updates the existing record rather than creating a second one — no 409, despite `consignmentNumber` being unique company-wide (that 409 fires only when a *different* reference claims a taken number). So a full-document upsert is the update model; there is no PATCH and no field-level update. Quirk: the PUT response stamps `timestamp` as `"2026-09-01 10:15:40 GMT+0000"` while POST uses ISO-8601 — don't parse it with one format.
- **`address.code` is a SEPARATE, master-validated field from the facility codes — and only `shipFrom`'s is checked** (verified 2026-09-01 by A/B: fixing only `shipFrom.address.code` while leaving `shipTo`/`returnTo` at a bogus `HDC001` produced the *identical* next error, so those two are never resolved). A bad one → 422 `"Ship From address code not found: hdc001"` — note the value is **lowercased** in the message, so lookup is case-insensitive. This is why a payload can carry a valid `originFacilityCode` and still fail: the two are validated independently.
- **VAS `level` is accepted as an alias for `vasAddedLevel`** (2026-09-01). `targetIds` must match the level: PACKAGE → package `id`s (`"… Package ids inside vas not mapped with any package details"`), SKU → `lineItemNo`s. `vasCode` must be a **`code` from the VAS master, verbatim** — `POST /master/api/v1/vas/fetch` (cookie auth; `valueAddedService` and `serviceMaster` both 500). dms-staging has exactly `Front-Door`, `Room of Choice`, `WhiteGlove` — the SCREAMING_SNAKE form in FarEye's own doc sample (`ROOM_OF_CHOICE`) 422s with `"… Vas Code is not present."`
- **Validation short-circuits one layer at a time**, so a bad payload takes N round-trips, not one. Observed order (2026-09-01, dms): VAS↔package mapping → facility codes (both reported together) → `shipFrom.address.code` → `businessUnit` + carrier (together) → `vasCode`. Budget for the chain; fix everything you can see at each step.
- **Package-type enum is tenant config and MOVES** — `Carton` was rejected on dms 2026-08-12 but accepted again 2026-09-01. Don't hard-code it; read the allowed list out of the 422 message when it fails.
- **FarEye's own published doc sample is not directly runnable**: its `vas` block targets SKU ids at PACKAGE level, and its `vasCode` casing doesn't match the master. Treat the spec sample as shape reference, not a working payload.
- **`GET /ship/app/rest/bulk/sample`** — 214 ordered headers (captured in `src/pages/ConsignmentOrder/bulkTemplate.ts`); starred headers are upload-mandatory.

## Branch / master-service quirks (2026-08-27)

- **`branch` master rejects negative top-level `latitude`/`longitude`** (Go `min`-tag validation) — US longitudes can't be stored there. Coordinates live ONLY in the opaque `address` JSON string (all 5 branches now seeded with real coords; florida had NYC values before).
- The server blanks `dockMaster.branchCode` on read — the branch survives only as the code prefix (`florida-DOCK-FL-01`).
- Staging sessions expired repeatedly during 2026-08-27 (hours apart); the Vite proxy deletes `.staging-session` on the first 401 and the app bounces to `/login` — re-login is the only fix.

## Known gaps / never found

- **Wave API** — waves are a UI concept only (we derive them client-side from trip start times)
- **Dock assignment** — no API anywhere (console field exists, empty on test data)
- **Carrier LISTING** — no dedicated endpoint; provider options ride inside route payloads in `serviceProviderAssignment=true` mode (responses never captured — need a HAR)
- **Custom Settings module config** (field show/hide/relabel persistence) — SPA at `/v2/custom_settings/master-service/modules/consignment_order`; backing API 404s on all guessed paths, likely a separate platform service (JWT has `int-org-id`)
- **RFD (ready-for-dispatch) command** — never captured
- **Trips pagination** — real console paging parameter unknown

## QA environment — `qa.fareye.io` (company 808), api_key auth — verified live 2026-09-17

A third tenant, and it breaks three rules the staging tenants taught us. Registered in the
`fareye-shipments` skill as account **`qa808`**.

| endpoint | notes |
|---|---|
| `POST https://qa.fareye.io/ship/api/v3/consignments?api_key=` **[LIVE]** | Create. `Content-Type: application/camel+json`, single object body, same v3 contract as staging. Returns `{status:OK, success_count, data:{consignment_number, reference_number, ci_consignment_link, ci_order_link, tracking_details[]}}` |
| `POST https://qa.fareye.io/master/api/v1/<entity>/fetch?api_key=` **[LIVE — this is the surprise]** | **Master reads authenticate with the api_key here**, unlike staging where api_key is write-only. Body `{"pageNumber":0,"pageSize":200}`. Confirmed: `hub`, `branch`, `consignmentType`, `serviceType`, `packageType`, `vas`, `sku`, `businessUnit`, `location`, `lane`, `hubToHub`, `tagMaster`, `sortCode`, `loadType`, `vehicle`, `slot`, `moduleSettings`. `carrier` → 500 (not an entity) |
| `POST /sbs/graphql?api_key=`, `GET /v1/app/rest/*?api_key=` | **401 Access Denied** — consignment read-back still needs a console cookie, exactly as on staging |
| `GET /ship/api/v3/consignments/{ref}?api_key=` | 404 (and the collection form 500s) — there is still no REST read |

**Tenant config** (all read from the master service above, not guessed):

- **Hubs (18, India):** `delhi`, `noida` (`cx`, parent `delhi`), `mumbai`, `pune` (`cx`), `surat`,
  `ahemdabad` (`cx`), `jaipur1`, `ajmer` (`cx`), `jodhpur` (`cx`), `patna1`, `gaya` (`cx`), `chapra`,
  `fareye`, `test1`, `chicago`, `pacific`; `patna` and `jaipur` disabled.
- **`location` master** (the only thing `shipFrom.address.code` is validated against):
  `110092_delhi`, `201301_noida`, `40005_mumbai`.
- **`packageType`:** `BOX`, `box2`. **`businessUnit`:** `DHL`, `amazon`, `nitin`.
- **`serviceType`: both rows disabled** (`Standard`, `Test`) → omit `serviceType` entirely.
- **No `carrier` master** → omit the `carrier` block; FarEye allocates and the create still 200s.
- **`consignmentType` master: `forward` / `reverse` / `service` only.**

**There is no "pickup and delivery" consignment type** — not in this tenant's master and not in the
v3 enum (`FORWARD|REVERSE|EXCHANGE|TRANSFER|SERVICE`). A pickup-and-delivery order is built the way
the topology matrix says: `FORWARD` + an **FM pickup leg**, which comes from `shipFrom.address.code`
set to a location code that differs from `originFacilityCode`, plus explicit flat
`shipFrom.pickupStartDateTime` / `pickupEndDateTime` and `shipTo.deliveryStartDateTime` /
`deliveryEndDateTime` (`yyyy-MM-dd HH:mm:ss`). See the topology section above.

**Number generation is a third mode: silent no-op.** Omitting `packageDetails[].trackingDetails`
neither 422s (dms) nor auto-assigns (prod0003) — it returns **200 with a `tracking_details[]` entry
carrying no `tracking_number` and no label**. Supplying your own is accepted and echoed verbatim.
A 200 is therefore not proof the package is trackable; read the tracking number back out of the
response.

**Reference orders created here** (2026-09-17, both 200): `PND1709A1` — pickup+delivery,
`scannable:false`, 1 line; `PND1709B1` — pickup+delivery, `scannable:false`, **100 SKU lines**,
one package of `quantity:100` with a single tracking number. The latter re-confirms on a third
tenant that `scannable:false` is what lets `package.quantity:N` ride on one tracking number.

## External services used by the prototype

- OSRM `router.project-osrm.org/route/v1/driving/…` — street-level route geometry (proxied at `/osrm`)
- OSM `tile.openstreetmap.org` — map tiles (proxied at `/osm`)
