# FarEye — system quirks & gotchas (staging)

The one-page memory of everything that bit us. Detail + payloads live in **FAREYE-APIS.md**;
this is the scannable "why did that fail" index. Verified live on staging (dms 20106, prod0003 20773).

## Auth & sessions
- **api_key is WRITE-ONLY — on `staging.fareye.co`.** There it creates/updates consignments (`POST/PUT /ship/api/v3/consignments`) but reads NOTHING. Reads = console cookie + GraphQL `/sbs/graphql`.
- **BUT on `qa.fareye.io` (company 808) the api_key DOES read the master service** (verified 2026-09-17): `POST /master/api/v1/<entity>/fetch?api_key=` returns the normal paged envelope for `hub`, `branch`, `consignmentType`, `serviceType`, `packageType`, `vas`, `sku`, `businessUnit`, `location`, `lane`, `hubToHub`, `tagMaster`, `slot`, `vehicle` and `moduleSettings`. So **probe the master service with the key before guessing codes on a new tenant** — it may just answer. Still cookie-only there: `/sbs/graphql` and `/v1/app/rest/*` (both 401), i.e. reading a *consignment* back. `carrier` is not a master entity (500).
- **Keys are environment-bound.** The qa.fareye.io key returns `401 {"message":"Invalid Api Key"}` against `staging.fareye.co`. A 401 on the create path means wrong HOST at least as often as wrong key — try the other env before assuming the key is dead.
- **Connect gateway is bearer-only.** `api-<region>.fareyeconnect.com/v2/*` (vehicles, assets, consignments) rejects the api_key in every form (401 `invalid_token`, leaks `/setu/fe/...`). Needs a token from FarEye's integration team.
- **prod0003 console sessions die in <60 seconds.** The JWT carries `sl:"f"` (single-login) — each new login kills the previous session, and copied cookies go stale almost immediately. A cookie 200s on one call then 403/401s on the next. **Fix: run cookie-authed writes from the user's own live browser** (DevTools same-origin `fetch`, reads XSRF from `document.cookie`) — copied-cookie automation loses the race.
- **XSRF required on master/app writes.** `/master/api/v1/*` and `/app/rest/*` POSTs need `X-XSRF-TOKEN` = the `XSRF-TOKEN` cookie, else `403 {"error":"Unauthorized Request."}`.
- Master service (`/master/api/v1`, `/sbs`) auths on `JSESSIONID`; the older `/app/rest/` (Rails-ish) service may also want `_session_id`/`_interslice_session`.

## Consignment create/read (`POST /ship/api/v3/consignments`, `application/camel+json`)
- **Single object body**, upsert by `referenceNumber`; `PUT` also updates (returns same `ci_consignment_link`, no 409). Bulk is a different endpoint (below).
- **`consignmentNumber` is unique company-wide.** A *persistence-stage* 422 permanently reserves the number; a *pre-persistence* 400 (validation/enum parse) does NOT. Leave it blank where number-gen is configured.
- **Number Generation is PER-HUB, not per-tenant** — two hubs in the SAME account behave oppositely (verified prod0003 2026-09-10):
  - dms (no number-gen on some carriers e.g. SUPERCHARGED DELIVERIES) → you MUST supply `packageDetails[].trackingDetails[].trackingNumber`, else 422 "Number Generation is not configured".
  - prod0003 **california** hub → supply your own `consignmentNumber` freely; **OMIT** the tracking number (auto `PKG<n>`).
  - prod0003 **new york** hub → **OMIT `consignmentNumber`** (auto-generates `C<n>`; supplying your own → 422 "Consignment Number … should start with …"), and **SUPPLY** the tracking number starting with `PKG` because the package auto-generator is broken here (422 "Max retries exceeded. Unable to generate unique shipment numbers" when omitted). `orderNumber` is always mandatory (can't omit).
  - **PKG tracking format gotcha:** the digits after `PKG` **must not start with 0** — `PKG0910001` → 422 "can not be started with…", but `PKG990911`/`PKG710001` pass.
  - **qa.fareye.io `delhi` is a THIRD mode: silent no-op.** Omitting `trackingDetails` neither 422s (dms) nor auto-assigns (prod0003) — it returns **200 with a `tracking_details[]` entry that has no `tracking_number` and no label**, i.e. an untrackable package and no error to tell you. Supplying your own is accepted and echoed verbatim. So on a new tenant "it returned 200" is NOT proof the package is trackable — read `tracking_details[].tracking_number` out of the create response.
  - Lesson: don't assume a tenant's number-gen behaviour from one hub — probe each hub (omit vs supply) before a bulk run; a canary POST reveals it.
- **`packageDetails[].quantity` = number of physical PARCELS, not items — and each parcel needs its own tracking number.** A package with `quantity: N` requires N `trackingDetails[]` entries (verified prod0003 NY 2026-09-15). One tracking number for a `qty 100` package → 400 "Package X has quantity 100 but trackingDetails contains 1 entries. All quantity slots must have a trackingInfo entry" (pre-persistence, number not burned). Each of the N must obey the hub's tracking format (NY: start `PKG`, no leading zero after PKG). With N parcels the create response's `success_count` reports **N (the parcel/tracking-slot count), not 1** — still one consignment (`consignment_number` single, `C<n>`); `tracking_details[]` returns shuffled (match on `package_id`).
  - **To model "one package containing N items": `package.quantity = 1` (one parcel, one tracking number) + `skuDetails[].quantity = N`.** The item count belongs on the SKU line, NOT on `package.quantity`.
  - **`scannable` controls whether `package.quantity` demands per-unit tracking.** `scannable:true` + `package.quantity:N` → requires **N** tracking numbers (each unit individually scannable → reads as N labels). `scannable:false` + `package.quantity:N` → accepted with **ONE** tracking number (the package is a single handling unit). So to show **Quantity N on ONE package/label**, set `scannable:false` and `package.quantity:N` with 1 tracking; to keep per-unit barcodes, put the count on `sku.quantity` and leave `package.quantity:1`. (Verified prod0003 NY 2026-09-15: C114 = scannable:false, package.quantity 100, 1 tracking, sku.quantity 1; **re-confirmed on a third tenant qa.fareye.io 2026-09-17** — `PND1709B1` = scannable:false, package.quantity 100, 100 SKU lines, 1 tracking → 200, so the rule is the product's, not one tenant's config.) Note tracking auto-gen is still broken on NY — you must supply the 1 tracking number (`PKG…`, no leading zero); sending zero tracking → 422 "Max retries exceeded".
  - **Upsert MERGES tracking slots — it can't SHRINK a package's parcel count.** Re-PUTting the same `referenceNumber` with `package.quantity 1` after it was created with `qty 100` does NOT reduce it (the record still shows 100 parcels); the create response looks right (`tracking_details:1`) but the stored record keeps the old slots. api_key has no delete. **To fix a wrong package count, create a NEW consignment (fresh referenceNumber + package id), don't upsert.** (Verified 2026-09-15: C112 stayed at 100 after upsert; C113 created clean.)
- **Leg topology is driven by `shipFrom.address.code` + `consignmentType`, not a flag.** Merchant code on the non-hub side → FM leg; NULL / ==facility code → no FM. Origin≠destination facility → MM leg (but MM only materialises if **X-Dock** is configured). REVERSE flips the non-hub side to shipTo. Full 12-row matrix in FAREYE-APIS.md.
- **Only `shipFrom.address.code` is validated** (against the location master, case-insensitive, lowercased in the error). shipTo/returnTo address codes are never resolved.
- **`pickupWindow`/`deliveryWindow` objects are SILENTLY DROPPED.** Use flat `pickupStartDateTime`/`pickupEndDateTime`/`deliveryStartDateTime`/`deliveryEndDateTime`, format `yyyy-MM-dd HH:mm:ss`. (`deliveryInstruction` singular is also ignored — it's `deliveryInstructions`.)
- **VAS key is `consignmentDetails.vas`** (`vasDetails` dropped); SKU-level `targetIds` are `lineItemNo`s not codes; `remarks` reads back as the VAS master's description.
- **`consignmentType` input enum is UPPERCASE** — `FORWARD, REVERSE, EXCHANGE, TRANSFER, SERVICE`. Sending lowercase `forward` → 400 "must be one of: [FORWARD,…]" (a *pre-persistence* 400, so the number isn't burned). The **read model lowercases it back to `forward`** — so what you read is NOT what you send. Same trap as `source`.
- **The create endpoint throttles ~8 concurrent** — a burst of parallel POSTs draws a bare `429` (empty body). It's pre-persistence (number not reserved); just retry. Keep-alive + ≤8 workers is fine for ~100 orders with one or two retries.
- **`source` is a real validated enum** (Consignment Form / API Integration / SFTP Integration / …) but **write-only** — never returned by the read model. `?consignmentAddType=API` is a second enum (only `API` valid).
- **SKU→consignment flag roll-up is an OR and ASYNC (~90s).** Any SKU with a flag sets the consignment flag, but it lands after the `async` pipeline runs — an immediate read shows all-false and misleads. Don't verify flags with an immediate read-back.
- Server rewrites on ingest: `total_quantity` recomputed, `ship_by_date` gets `23:59:59` appended, `current_facility_code` server-set, `consignment_type` lowercased, `version` bumps per upsert.
- **`tracking_details[]` order is non-deterministic per call** (re-POSTing the same consignment returns a different order). Match on `package_id`.
- **Label token is cosmetic** — always embeds the FIRST package's id + `index:1` + `source:CUSTOM`; identify a label by `tracking_details[].package_id`, not by decoding the token. But the token IS a cookie-free read channel for what the label prints (name, phone, address).

- **Telling a real field from a silently-ignored one: send the wrong TYPE, not a wrong value.** The v3 DTO ignores
  unknown properties, so a bogus key returns the ordinary "must not be null" validation list and proves nothing. A
  *recognised* field with a mistyped value fails in Jackson first and names itself in the error. Sending
  `consignmentDetails.scannable: "banana"` → 400 ``Cannot deserialize value of type `java.lang.Boolean` from String
  "banana" … (through reference chain: com.fareye.ship.dto.v3.ConsignmentV3RequestDTO["consignmentDetails"]->…)``,
  while `consignmentDetails.bananaFieldXyz: "banana"` sails through to bean validation. That 400 is pre-persistence,
  so it costs no consignment number. This is the cheapest way to confirm a flag exists on a tenant you cannot read
  back — it confirmed `scannable` and `splittable` on qa.fareye.io.

## Phones
- **No validation at all** — formatted (`+1 (415) 555-0182`), or even alphabetic (`CALL-ME-ASAP`), all store verbatim. Only a **16-char cap**.
- **No country-code field** — embed the dial code inside the number string.
- Reads back under **`<side>_address.location_contact.contact_number`**, not the top-level field.
- **Secondary number (and the whole `location_contact`) is DROPPED when the ship-to address geocodes cleanly** (e.g. a valid US/CA address) — leading hypothesis; survives on addresses that fail geocode.

## UOM enums (validated; the API returns the allow-list on a bad value)
- **Weight:** `KG, LB, TO, WTO, DTO` (LB not LBS; no grams). **Dim:** `CM, IN, MM` (no M). **Volume:** 28 values — real `MM3 CM3 IN3 M3 L KL GAL` + 21 packaging codes.
- **EXACT code only** — no plurals/spelled-out/unicode/synonyms (`CBM`→use `M3`, `MT`/`TON`→`TO`).
- **The developer-portal spec UNDER-documents these** (says weight KG/LB only, volume 3–5). Trust the live 400 list.
- Our own Add-form UI offers invalid `LBS`/`G`/`M` — a real bug to fix.

## Bulk Excel uploads
- **Build the xlsx with `xlsxwriter` (or fill a real downloaded template) — NEVER hand-roll a minimal zip, NEVER openpyxl.** A hand-rolled sheet has a valid shared-string table yet the server reader extracts **0 rows** → `MismatchedInputException: No content to map` (misleading — means "your file parsed to nothing"). openpyxl's inline strings → "Mandatory headers missing".
- **DevTools "Copy as cURL" strips the file body** on uploads → empty file → same "No content to map". Use `-F 'file=@path'` / real multipart bytes.
- **Consignment bulk:** `POST /ship/app/rest/v3/bulkupload/sync`, single `file` part, 214 snake_case cols (in `bulkTemplate.ts`); has `carrier_code`/`carrier_name` cols. Success → `{success_count, data:<batch uuid>}`; failed rows via `/ship/app/rest/bulk/failed_excel?uuid=`.
- **The worksheet TAB NAME is validated by the importer**, per entity: `Location Master` for locations, `SampleExcel` for vehicle config. Wrong name → "sheet X does not exist".
- **Location Type: the Excel wants the LABEL, the JSON API wants the TOKEN** (`Merchant Location` vs `MERCHANT_LOCATION`). Different vocabularies for the same field.
- **Validation short-circuits one error at a time** — fix, re-upload, hit the next (city → carrier → fuel type → …).

## Masters
- **Location master = `businessUnitLocation`**, NOT the v1 `location` entity (v1 is invisible to staging). snake_case, array bodies, `code` required. `business_unit_code`/`_name` are **ARRAYS** (string silently dropped → "required for MERCHANT_LOCATION"). Address `country` by NAME not code. Multi-window operating hours work in UI/API but the bulk sheet can't express them, and bulk imports every day as `is_primary:false`.
- **Vehicles live in THREE non-syncing stores:**
  1. **Asset master** — `POST /master/api/v1/vehicle` (code, assetType, vehicleTypes[], weightCapacity…). Not the routing fleet.
  2. **Routing config** — `POST /app/rest/vehicle_configuration?...` (JSON, cityId+hubId+vehicleType) OR bulk **`POST /app/rest/order/upload_excel_vehicle?...`** (`.xls`, sheet `SampleExcel`). **This is the fleet routing uses.**
  3. **Connect** — `POST /v2/vehicles` (bearer only).
- Vehicle-config bulk gotchas (prod0003): leave **Fuel Type / Power Source / Engine Size BLANK** (account masters not set → "Couldn't find fuel type"); valid enums Mode `car|small_truck|truck|bicycle|foot`, Run Type `Single/Multi Run`, Vehicle Availability `Single/Multi Day`. Re-uploading the **same Vehicle Name upserts** (updates) the existing vehicle.

## Routing
- **⚠ "Error while creating routes" on CLEAN data = wrong VRP engine.** If a hub fails routing with an immediate `Error/Exception — Error while creating routes` (Routing Activities step 6, same second as "Route creation start") even though vehicles/orders/geofence are all fine, the hub is on the **jsprit** engine. **Switch the routing engine to ILS** (company/hub routing settings) and it runs. Read it in the request JSON: **`vrpSolver:1` = jsprit (errors), `vrpSolver:5` = ILS (works)**; `routingSettingsDTO` is null so the engine comes from settings, not the payload. Verified 2026-09-11 prod0003 — the working dms account was already on ILS. (Full story + the ruled-out red herrings in memory `fareye-routing-engine-jsprit-vs-ils`.)
  - **Ruled out by the dms success control:** null `co2Factor/powerSource/mileage` is FINE (dms routes with them null + emission enabled); a vehicle with **null start location** DOES crash build (delete junk vehicles), but a clean fleet still failed under jsprit → it was the engine.
- **Prerequisites: a hub needs GEOFENCE + VEHICLE data before routing can run.** Consignments alone aren't routable.
- **⚠ NO UNIT CONVERSION — routing compares RAW NUMBERS** for weight, volume, height, width, length, pallet, tags. A shipment whose `totalVolume`/package dims *number* exceeds the vehicle's capacity/dim *number* → "Route cannot be generated due to a mismatch of shipment & vehicle data" — even if the units (L vs m³, CM vs M) would actually fit. **The consignment's numbers and the vehicle's numbers must live in the same magnitude; unit labels are ignored.** (Bit us: consignment `totalVolume=1000` + package `40×30×20 cm` vs vehicles at volumetric `120` and dims `5×5×10` → over-capacity on volume + all 3 dims.)

## Account cheat-sheet
| | dms (20106) | prod0003 (20773) | qa808 (808) |
|---|---|---|---|
| Host | `staging.fareye.co` | `staging.fareye.co` | **`qa.fareye.io`** |
| Hubs | `ord`, `nyc` (serviceable `ord→nyc`, `ord→ord`) | `california`, `florida`, `texas`, `kentucky`, `new york` (lowercase; "new york" has a space) | India set: `delhi`, `noida`(cx), `mumbai`, `pune`(cx), `surat`, `ahemdabad`(cx), `jaipur1`, `ajmer`(cx), `jodhpur`(cx), `patna1`, `gaya`(cx), `chapra`, `fareye`, `test1`, `chicago`, `pacific` |
| Carrier | `SUPERCHARGED DELIVERIES` (supply tracking #) | `OWNFLEET` (number-gen ON → omit tracking #, get `PKG<n>`) | **no carrier master at all** (fetch 500s) — OMIT the `carrier` block, creates 200 fine |
| Business units | Best Buy, Walgreens, CVS, TSC, BDF… | JB Hi-Fi, SUNCO, NORTHPEAK, GREENLEAF | `DHL`, `amazon`, `nitin` |
| Package types | tenant enum, moves | tenant enum | `BOX`, `box2` only |
| Service type | Standard/Express | Express/Standard/WHITE_GLOVE | **both rows DISABLED** (`Standard`, `Test`) → omit `serviceType` |
| `address.code` values | location master | location master | only `110092_delhi`, `201301_noida`, `40005_mumbai` |
| City↔hub | Chicago/`ord` | **quirky:** california hub is under city **`Kentucky`**, texas hub under city `Florida`, new york→`New York`. Hub IDs: california 513369, texas 513368, florida 511781, kentucky 511780, new york 511772 |

See also the memory files: `fareye-qa808-account`, `fareye-apikey-write-only`, `fareye-consignment-leg-topology`,
`fareye-sku-flag-rollup`, `fareye-bulk-upload-rules`, `fareye-vehicle-master-api`.
