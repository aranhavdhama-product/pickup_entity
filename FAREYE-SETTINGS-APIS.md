# FarEye Custom Settings — API catalog (mined from staging SPA chunks)

Source: 813 webpack chunks in `scratchpad/chunks/`. Key chunks:
- `18702-93686b5b.js` — **main app bundle** (11 MB): all Base Modules detail pages, Ship modules (Data Validation, Number Generation, Label Template, Carrier Allocation config), Incident Management, Roles & Permissions service, Webhooks/ERP Events, endpoint-constants table.
- `36324-534449ad.js` — **Custom Settings v2 shell** (1.4 MB): nav tree, Pilot Driver/X-Dock, Control Tower table config, Notify/Engage/Return, Integrations General Settings, Ship Common Settings, Geo Coding card.
- `93080-fa1169ab.js` — Users Management page.
- `83942-0413b48b.js` / `26883-910cd980.js` — Smart Service Time.

Confidence legend: **[M]** = method seen in code (axios `.get/.post/...`, `Builder(...).withRequestMethod("...")`, or `{url, method}` object). **[S]** = string found, method inferred/unknown.

Two HTTP conventions appear throughout:
1. Direct axios: `x.A.get("/app/rest/...")`.
2. Builder: `new Builder(url).withRequestMethod("GET").withRequestParam({...}).build()` → `axiosCall`.

### The universal moduleSettings pattern (known, listed for reference)
Most "new" (v2) settings pages persist everything as a **moduleSettings record**:
- `POST /master/api/v1/moduleSettings/fetch` — body `{pageNumber, pageSize, query:[{attribute:"code", condition:"equals"|"isAny", values:[CODE,...]}]}`
- `POST /master/api/v1/moduleSettings` — create; body is an **array**: `[{enabled, code, name, settingJson}]` (`settingJson` is a JSON string)
- `PUT /master/api/v1/moduleSettings` — update; same array shape (response has `successCount`/`failureCount`/`failureList`)

Below, "moduleSettings code `X`" means the page is entirely driven by this pattern with code `X`.

---

## 1. Users Management (chunk 93080-fa1169ab.js)

| Method | Endpoint | Purpose | Conf |
|---|---|---|---|
| GET | `/app/rest/users` | paged user list (params incl. page/filters) | [M] |
| POST | `/app/rest/users` | create/update user (multipart when photo `file` appended — `s.append("file",t)` Blob) | [M] |
| GET | `/app/rest/users/search_users` | search users | [M] |
| GET | `/app/rest/users/byCompanyAndType` | users filtered by company + user type | [M] |
| GET | `/app/rest/users/get_users_by_empCode_userName_firstName` | typeahead lookup | [M] |
| GET | `/app/rest/user_type_new` | user types for the page (dropdowns) | [M] |
| GET | `/app/rest/user_type` | user types (classic, known) | [M] |
| GET | `/app/rest/non_device_user_type` | non-device (web) user types | [M] |
| POST | `/app/rest/users/user_activation` | activate users | [M] |
| POST | `/app/rest/users/user_deactivation` | deactivate users | [M] |
| GET | `/app/rest/users/user_unlock` | unlock a locked account | [M] |
| POST | `/app/rest/users/upload_excel` | **bulk upload** users (multipart `file`) | [M] |
| GET (link) | `/app/rest/users/export_excel?entity=user` | bulk export — rendered as `<a href>` download | [M] |
| POST | `/app/rest/users/v2/password` | set/change password | [M] |
| POST | `/app/rest/account/reset_password` | trigger reset-password mail | [M] |
| POST | `/app/rest/account/verify_password` | verify current password | [M] |
| POST | `/app/rest/users/assign_hub` | assign hub(s) to user | [M] |
| POST | `/app/rest/users/multiple_hub` | multi-hub mapping | [M] |
| POST | `/app/rest/users/assign_job_type` | assign job types | [M] |
| GET | `/app/rest/users/get_user_job_type` | read job-type mapping | [M] |
| POST | `/app/rest/users/add_merchant` | merchant mapping | [M] |
| POST | `/app/rest/users/black_list_user` | blacklist user | [M] |
| POST | `/app/rest/users/clear_multiple_user_session` | kill sessions | [M] |
| POST | `/app/rest/users/force_logout_user_session` | force logout | [M] |
| GET | `/app/rest/users/get_device_IMEI` | device IMEI of user | [M] |
| POST | `/app/rest/users/get_user_details_by_id` | user detail (Builder) | [M] |
| GET | `/app/rest/get_user_by_ids?userIds=` | batch fetch by ids | [M] |
| GET | `/app/rest/get_all_users` | full user list (Builder GET) | [M] |
| GET/POST | `/app/rest/get_user_geofencing`, `/app/rest/add_user_geofencing` | user geofence read/save | [M] |
| GET | `/app/rest/company` | company info shown on page | [M] |
| GET | `/app/rest/get_job_activity_log` | user activity log | [M] |
| POST | `/app/rest/users/updateCurrentUserTimezone` | timezone | [M] |
| GET | `/app/rest/user/api_key` · POST `/app/rest/user/api_key` · POST `/app/rest/user/api_key_restriction_type` · GET `/app/rest/user/ip_restriction_info` · GET `/app/rest/user/expiry_notification` | API-key management (Builder) | [M] |

## 2. Roles And Permissions (RBAC service in 18702)

Constants `Ar..Au`; all called via `{url, method}` helper `OL`:

| Method | Endpoint | Purpose | Conf |
|---|---|---|---|
| GET | `/master/api/v1/authz/user-groups` | list user groups — params `{page, page_size}` (page_size up to 1000) | [M] |
| POST | `/master/api/v1/authz/user-groups` | create group | [M] |
| PUT | `/master/api/v1/authz/user-groups/{id}` | update group | [M] |
| GET | `/master/api/v1/authz/user-roles` | list roles (params) | [M] |
| POST | `/master/api/v1/authz/user-roles` | create role | [M] |
| PUT | `/master/api/v1/authz/user-roles/{id}` | update role | [M] |
| GET | `/master/api/v1/authz/inventory/modules` | permission inventory (modules tree used to build the permission matrix) | [M] |
| GET | `/master/api/v1/authz/get_ui_config` | RBAC UI config (`__no_rbac__` fallback, enforceFilters/enforceColumns context) | [M] |
| GET | `/v1/app/rest/users/by_user_group` | users belonging to a group (params) | [M] |
| GET | `/app/rest/get_user_by_role_id?roleIdList=` | legacy: users by role id (Builder) | [M] |

## 3. Incident Management (18702; SPA route `/mid-mile/incident-management`)

Full fetch/create/update/delete quadruplets, same body conventions as moduleSettings (fetch body `{companyId, query:[], pageNumber, pageSize}` — seen with pageSize 500; create/update bodies are arrays of records incl. `companyId`; delete body is array of ids; responses use `successCount/failureCount/failureList[].reason`):

| Method | Endpoint | Purpose | Conf |
|---|---|---|---|
| POST | `/master/api/v1/incidentConfig/fetch` | list incident configurations | [M] |
| POST | `/master/api/v1/incidentConfig` | create | [M] |
| PUT | `/master/api/v1/incidentConfig` | update | [M] |
| DELETE | `/master/api/v1/incidentConfig` | delete (ids in body) | [M] |
| POST | `/master/api/v1/incidentEscalation/fetch` | list escalation matrix rules | [M] |
| POST | `/master/api/v1/incidentEscalation` | create escalation | [M] |
| PUT | `/master/api/v1/incidentEscalation` | update escalation | [M] |
| DELETE | `/master/api/v1/incidentEscalation` | delete escalation | [M] |
| POST | `/master/api/v1/incidentNotification/fetch` | list notification-channel rules | [M] |
| POST | `/master/api/v1/incidentNotification` | create | [M] |
| PUT | `/master/api/v1/incidentNotification` | update | [M] |
| DELETE | `/master/api/v1/incidentNotification` | delete | [M] |

Supporting lookups on these pages: GET `/app/rest/user_type` [M], GET `/app/rest/account` [M].

## 4. Carrier Allocation (Ship)

New config page (Component `TX`, moduleSettings code `SHIP_CARRIER_ALLOCATION` for the toggle) plus dedicated endpoints:

| Method | Endpoint | Purpose | Conf |
|---|---|---|---|
| GET | `/app/rest/carrier_allocation/get_config` | read allocation config | [M] |
| POST | `/ship/app/rest/carrier_allocation/save_config` | save allocation config | [M] |
| GET | `/ship/app/rest/config` | ship-level config (shared with Common Settings) | [M] |
| POST | `/ship/app/rest/config/autoRunCarrierAllocation` | toggle auto-run — body `{autoRunCarrierAllocation: bool}` | [M] |
| GET | `/ship/app/rest/carrier_allocation/facility_list` | facilities | [M] |
| GET | `/ship/app/rest/carrier_master/carrier_allocation` | carriers for allocation | [M] |
| POST | `/ship/app/rest/carrier_master/filtered` | filtered carrier master list | [M] |
| GET | `/ship/app/rest/carrier_allocation/facility_list/search` · `/ship/app/rest/carrier_allocation/facility_list/mapped_unique_business_unit` | facility search / BU mapping | [S] |

Classic Carrier Allocation console (`/app/rest/carrier_allocation/*`) — all methods observed directly:

- GET: `carriers`, `subscribed/carriers`, `fulfilment_centers`, `fulfilment_center/{id}`, `get_carrier_config[?type=|?type=elimination_check]`, `get_config`, `get_mobi_config`, `fetch_all_slots`, `fetch_available_serving_carrier/{...}`, `get_serving_carrier/{...}`, `fetch_hard_rules_list`, `fetch_hard_rule_engine_page`, `fetch_hard_rule_page?fulfilmentCenterId=`, `filter_hard_rule_page?carrierIds=`, `filter_serviceability_list`, `get_serviceable_area?area=`, `priority/rule/list` [M]
- POST: `saveCarrier`, `updateCarrier`, `save_carrier_config`, `save_config`, `save_allocation_type`, `save_hard_rule`, `save_hard_rule_engine`, `save_serving_carrier`, `update_serving_carrier_rank`, `saveServiceableArea`, `update_serviceability`, `get_serviceability_list`, `get_serviceability_area_page`, `get_serviceable_area_with_eta_zone_page`, `toggle_fulfilment_carrier_status?fulfilmentCenterId=`, `toggle_serving_carrier_status?carrierId=`, `priority/rule`, `upload_excel?type=ADD_SERVICEABILITY&carrierCode=` / `?type=ADD_SERVICEABLE_AREA[_V2]` (multipart) [M]
- PUT: `priority/rule/{id}` [M] · DELETE: `priority/rule/{id}`, `delete_hard_rule?hardRulesId=` [M]
- GET (download): `download_excel?type=`, `download_sample_excel?type=ADD_SERVICEABLE_AREA[_V2]` [S]
- Dashboard KPIs: GET `/app/rest/carrier-allocation/v1/dashboard/{carrier-kpis, carrier-kpis/monthly, company-kpis, zone-carriers}` [M]

## 5. Data Validation (Ship) — Component `Tg`, toggle code `SHIP_DATA_VALIDATION`

New endpoints (constants `O2..O8` in 18702, base `/ship/app/rest`):

| Method | Endpoint | Purpose | Conf |
|---|---|---|---|
| GET | `/ship/app/rest/get_validation_fields` | fields available for validation — params `{type}` | [M] |
| POST | `/ship/app/rest/addOrUpdate/fieldValidation` | save field validation — body `{validations, attribute_id, attribute_valid...}` | [M] |
| GET | `/ship/app/rest/get_regex_guide` | regex helper guide — params `{type}` | [M] |
| GET | `/ship/app/rest/get_validation_rules` | list validation rules | [M] |
| POST | `/ship/app/rest/addOrUpdate_rules` | create/update rule | [M] |
| POST | `/ship/app/rest/delete/validation_rules?ruleId=` | delete rule | [M] |

Legacy equivalents (older console, all under `/app/rest/label_generation/`): GET `get_validation_fields`, GET `get_validation_rules`, GET `get_regex_guide`, POST `addOrUpdate/fieldValidation`, POST `addOrUpdate_rules`, POST `delete/validation_rules?ruleId=` [M]. Related runtime: POST `/app/rest/fetch/order/dv` (Builder) [M].

## 6. Number Generation Config (Ship) — Component `BB`, toggle code `SHIP_NUMBER_GENERATION`

Base `Nd = "/ship/app/rest"`:

| Method | Endpoint | Purpose | Conf |
|---|---|---|---|
| GET | `/ship/app/rest/default_shipment_conf` | default shipment-number template | [M] |
| POST | `/ship/app/rest/default_shipment_conf` | create default template | [M] |
| PUT | `/ship/app/rest/default_shipment_conf` | update default template | [M] |
| DELETE | `/ship/app/rest/default_shipment_conf/{id}` | delete template | [M] |
| POST | `/ship/app/rest/shipment_party_conf` | create party-specific number config | [M] |
| PUT | `/ship/app/rest/shipment_party_conf` | update party config | [M] |
| GET | `/ship/app/rest/search/shipment_party_list` | party list — params `{partyCodes, pageNumber, recordPerPage}` | [M] |
| POST | `/ship/app/rest/delete/awb_party_conf?shipmentPartyMasterId=` | delete party config | [M] |

Form/validation vocabulary: series types CARRIER/SHIPPER; fields like start/end position, start/end range, running number, leading-zero flag ("Start position must be less than shipment number length", etc.).

Legacy AWB endpoints (`/app/rest/label_generation/`): GET `get/default_awb_conf`, POST `addOrUpdate/default_awb_conf`, GET `get/awb_party_list`, GET `search/awb_party_list`, POST `addOrUpdate/awb_party_conf`, POST `delete/awb_party_conf?awbPartyMasterId=` [M].

## 7. Label Template (Ship) — Component `SP`, toggle code `SHIP_LABEL_TEMPLATE`

Base `Lp = "/ship/app/rest"`:

| Method | Endpoint | Purpose | Conf |
|---|---|---|---|
| GET | `/ship/app/rest/labelTemplate` | list label templates | [M] |
| POST | `/ship/app/rest/labelTemplate` | create/update template | [M] |
| POST | `/ship/app/rest/save/labelTemplate` | save template body/design | [M] |
| POST | `/ship/app/rest/activate/labelTemplate` | activate template | [M] |
| POST | `/ship/app/rest/delete/label_template` | delete template | [M] |
| GET | `/ship/app/rest/labelTemplate/fetch_available_party` | parties not yet mapped | [M] |
| POST | `/ship/app/rest/labelTemplate/party_mapping` | map template ↔ party | [M] |
| PUT | `/ship/app/rest/labelTemplate/update/default_manifest` | set default manifest template | [M] |
| GET | `/ship/app/rest/label_type_master` | label types | [M] |
| GET | `/ship/app/rest/shipper_master/label_generation` | shipper master for label gen | [M] |
| GET | `/ship/app/rest/masters/masters_service/all` | masters lookup bundle | [M] |

Legacy (`/app/rest/label_generation/`): GET `get/labelTemplate`, POST `addOrUpdate/labelTemplate`, POST `save/labelTemplate`, POST `activate/labelTemplate`, POST `delete/label_template?labelTemplateId=`, POST `save/mapping/labelTemplateParty?templateCode=`, GET `fetch/labelPartyMapping`, party/parcel-shop masters (`get_party_master`, `getAll_party_master`, `addOrUpdate/party_master`, `activate/party_master?partyMasterId=`, `partyMaster/upload_excel`, `partymaster/download_sample_excel`, same for `parcel_shop_master`), bulk-upload settings (`setting/lg_bulk_upload` POST, `setting/fetch_lg_bulk_upload_config?id=` GET) [M]. Label print: POST `/ship/app/rest/print`, POST `/ship/img/pdf/bulk/download_label`, `/ship/app/rest/generate/label` [S/M].

## 8. Ship Common Settings (36324, route `/master-service/ship/common-settings`)

| Method | Endpoint | Purpose | Conf |
|---|---|---|---|
| GET | `/ship/app/rest/config` | read all ship config flags | [M] |
| POST | `/app/rest/ship/config` | save ship config | [M] |
| PUT/POST | `/master/api/v1/moduleSettings` (+ `/fetch`) | module enable toggles | [M] |

## 9. Pilot Driver App / Pilot X-Dock App (Execute; in 36324)

Entirely **moduleSettings-driven** — one record per sub-module, fetched in a single `condition:"isAny"` query, saved as `[{enabled, code, name, settingJson}]` (e.g. `name:"Driver App XDock Config"`; POST when record absent (`isCreate`), PUT otherwise):

- Pilot Driver App codes: `DRIVER_APP_CONFIG`, `DRIVER_APP_BASIC_SETTING`, `DRIVER_APP_CHECKLIST_MODULE`, `DRIVER_APP_LOADING_MODULE`, `DRIVER_APP_FORM_STATE_FLOW_MODULE`, `DRIVER_APP_FORM_RULES_MODULE`, `DRIVER_APP_SERVICE_MODULE`, `DRIVER_APP_HANDOVER_MODULE`, `COMPLIANCE_MODULE` [M]
- Pilot X-Dock codes: `DRIVER_APP_XDOCK_CONFIG`, `DRIVER_APP_PRELOADING_MODULE`, `DRIVER_APP_FORM_RULES_MODULE`, `DRIVER_APP_BASIC_SETTING` [M]

No other backend endpoints found for these pages.

## 10. Control Tower (Execute; settings in 36324 + DIY settings service)

| Method | Endpoint | Purpose | Conf |
|---|---|---|---|
| GET | `/app/rest/diy-settings/get` | params `{mainSettingType:"PARCEL_VISIBILITY", subSettingType:"CONTROL_TOWER"}` — CT enable + allowed user types | [M] |
| POST | `/app/rest/diy-settings/save` | body `{isEnabled, allowedUserTypes, mainSettingType, subSettingType, selectedSubSettingType}` | [M] |
| GET | `/app/rest/diy-settings/get-all-settings` | all DIY settings (Builder) | [M] |
| POST | `/master/api/v1/moduleSettings/fetch` | codes `NEW_CONTROL_TOWER_MODULE` (page config) and `NEW_CONTROL_TOWER_TABLE_CONFIGURATION` (table/column config) | [M] |
| PUT / POST | `/master/api/v1/moduleSettings` | save the above (POST first time) | [M] |

Same DIY pattern also used for `subSettingType: "EXCEPTION_MANAGEMENT"` and `"PERFORMANCE_MANAGEMENT"` [M]. (Runtime CT APIs — trips, long halts, etc. — live under `/sbs/app/trip/*`, `/tdis/track_data/*`; not settings.)

## 11. Service Time (Execute)

Smart Service Time analysis (chunks 83942/26883; Builder pattern):

| Method | Endpoint | Purpose | Conf |
|---|---|---|---|
| POST | `/app/rest/smartServiceTime/start-process` | start analysis (body = config) | [M] |
| POST | `/app/rest/smartServiceTime/stop-process/{id}` | stop analysis | [M] |
| POST | `/app/rest/smartServiceTime/getAnalysedData` | fetch analysed data (mean/std-dev table) | [M] |
| GET | `/app/rest/city_hub_list` | cities/hubs selector | [M] |

Service-time rules page: moduleSettings code `SERVICE_TIME_RULE_SET` — save payload `[{enabled, code:"SERVICE_TIME_RULE_SET", name, settingJSon: JSON.stringify({schemaVersion:"1.0", id:"svc-time-ruleset-<ts>", name, enabled, updatedAt, updatedBy, rules:[...]})}]`; rule attributes include floor/weight/volume/pallet (minutes) [M]. Related enum: `SMART_SERVICE_TIME_MODULE_USER` [S].

## 12. Notify / Engage / Return (Experience; mostly in 36324)

**Notify** — channel/provider/template settings are moduleSettings records: codes `SMS_ENDPOINT`, `SMS_TEMPLATE`, `WHATSAPP_PROVIDER`, `WHATSAPP_TEMPLATE`, `IVR_PROVIDER`, `IVR_TEMPLATE`, `NOTIFICATION_RULES` (+ SPA routes notification-rules, quiet-hours) [M]. After saving, legacy sync calls:
- POST `/app/rest/sms-endpoint-api/save?companyId={id}` [M]
- POST `/app/rest/sms-template-api/save?companyId={id}` [M]

Email: GET+POST `/app/rest/email-comm/config` [M]; email template studio `/app/rest/email-template-api/*` — GET `get`, `info`, `listing`, `label-list`, `download`; POST `save`, `action`, `create_default_template`, `send_test_mail`, `migrate_templates`, `save-template-label`, `upload`, `upload-template` [M]; logs GET `/app/rest/email-template-engine/emailLogs` [S].

**Engage** — pages `/engage/tracking`, `/engage/Universal_tracking`, `/engage/link_expiry`, `/engage/analytics` (SPA routes):
- moduleSettings codes: `UNIVERSAL_TRACKING_SETTINGS`, `CI_LINK_EXPIRY` (survey/link-expiry, fetch pageSize 50), `CUSTOMER_INTERACTION` [M]
- GET `/app/rest/generateUniversalLink` — universal tracking link [M]
- GET+POST `/app/rest/dashboard_tracking_conf` (tracking page config, Builder) [M]
- Customer-interaction (tracking page DIY) family, Builder: GET `get_ci_setting`, `get_ci_diy_setting_for_status`, `get_ci_diy_theme_setting`, `get_ci_message_template`, `get_initial_ci_diy_data`, `get_customer_interaction_{forms,status,theme}`; POST `save_ci_setting`, `save_ci_settings_diy_status_wise`, `save_ci_diy_theme_setting`, `save_ci_message_template`, `save_customer_interaction_page_setting`, `save_customer_interaction_theme`, `saveCustomerInteractionCustomForm`, `saveCustomerInteractionStatusSetting` [M]
- POST `/app/rest/clear_ci_settings_cache` — flush CI settings cache after save [M]
- POST `/app/rest/handleImageUpload` — asset upload for these pages [M]

**Return** — moduleSettings code `RETURN_SETTINGS` [M]; POST `/app/rest/clearReturnSettingsCache` after save [M]; POST `/app/rest/saveCompanyCode` (company code used in return URLs) [M].

## 13. Integrations — General Settings / Web-hooks / ERP Events (+ Logs)

**General Settings** (component `oc` in 36324):
- GET `/app/rest/is_integration_org_configured` (Builder) [M]
- POST `/app/rest/send_details_to_integration` (Builder) [M]

**Web-hooks** (18702; base `T2="/expand-cmr/webhook"`; helpers resolve to axios get/post/put/delete):
| Method | Endpoint | Purpose | Conf |
|---|---|---|---|
| GET | `/expand-cmr/webhook?page={0-based}&size=&sort=name,asc[&active=]` | list outbound webhooks | [M] |
| POST | `/expand-cmr/webhook` | create webhook (payload has `name`, `webhookUrl`, `sandbox`, trigger state) | [M] |
| PUT | `/expand-cmr/webhook/{id}` | update webhook | [M] |
| DELETE | `/expand-cmr/webhook/{id}` | delete webhook | [M] |
| GET | `/expand-cmr/webhook-logs?page=&size=[&status=&from=&to=&search=&erpEventType=&entityType=]` | execution logs (Logs → Web-hooks page; fields: responseStatusCode, attemptNumber, executionTimeMs, executionStatus) | [M] |
| POST | `/expand-cmr/webhook-repush` | repush selected log ids (bulk) | [M] |

**ERP Events** (component props in 36324): `visibilityBaseUrl: "/ship/app/rest/visibility"` with required headers `{"gateway-id":"1","gateway-permission":"DOMAINOBJECT_READ,ERP_READ,EVENT_READ,ERP_CREATE,EVENT_CREATE,ERP_UPDATE,EVENT_UPDATE,ERP_DELETE,EVENT_DELETE"}`; endpoints `/ship/app/rest/visibility/erp` and `/ship/app/rest/visibility/erp/event` (CRUD implied by the permission string) [M header/S methods].

**Carrier Subscription**: GET `/app/rest/carrier_allocation/subscribed/carriers` [M]; GET `/app/rest/carrier_integration/get` [S] + `saveIntegrationSettings(payload, "/app/rest/carrier_integration/save")` (POST) [M].

**SBS master config** (Load master data): GET `/sbs/app/rest/get-all-master-config`, POST `/sbs/app/rest/update-master-config` [M].

## 14. Base Modules — the 7 detail (chevron) pages

All defined in 18702 in the `Jy` config map — `{label, apiMasterSettingsCode, config:{url, Component}}`. The **enable toggle** on the listing card and the detail pages both persist through moduleSettings with these codes:

| Module | url slug | moduleSettings code |
|---|---|---|
| OPS Dashboard | `ops_dashboard` | `OPS_DASHBOARD` |
| Consignment Order | `consignment_order` | `CONSIGNMENT_MANAGEMENT` |
| Pending For Planning | `pending_for_planning` | `PENDING_FOR_PLANNING` |
| Load Planning | `load_planning` | `LOAD_PLANNING` |
| Carrier Portal | `carrier-portal` | `CARRIER_PORTAL` |
| Geo Coding | `geo_code` | `GEOCODING` |
| Routing | (toggle only) | `ROUTING` |

**Columns/filters config pages** (Pending For Planning, Load Planning, Carrier Portal; Consignment Order same by construction — identical description text, same component family):
- POST `/master/api/v1/moduleSettings/fetch` (their code) — read stored column/filter/accessibility JSON [M]
- PUT `/master/api/v1/moduleSettings` — save (settingJson holds columns `{show, sequence}` per tab) [M]
- GET `/app/rest/user_type` — for per-user-type accessibility settings [M]
- (Baseline column metadata comes from the known GET `/app/rest/v3/master_settings/get`.)

**OPS Dashboard detail** ("Selected Dashboards"): PUT `/master/api/v1/moduleSettings` only (dashboard selection stored in settingJson; page strips `createdBy`/`lastUpdatedBy` before save) [M]. Runtime APIs of the module (not settings): POST `/mid-mile/operational-dashboard/api/rest/v1/ops-dashboard/consignment/aggregations` (header `content-type: application/camel...json`), plus `/consignment/list`, `/consignment-kpi`, `/suggestions` under the same base [M/S].

**Geo Coding detail** ("Geo Coding Settings" page): fetch + save via moduleSettings code `GEOCODING` only [M]. Related standalone geo endpoints elsewhere (older console): GET+POST `/app/rest/geosmart_setting`, GET `/app/rest/geosmart_credits`, GET `/app/rest/geo_coordinate_account`, GET `/app/rest/geoCoding_v2[?query=]`, POST `/app/rest/geolookup_response`, GET `/geosmart/prompt-config` + POST `/geosmart/prompt-config` [M].

**Routing detail / routing config** (Route product, older console — the `ROUTING` toggle itself is moduleSettings):
- GET `/app/rest/general_settings` (`GET_GENERAL_SETTINGS`) and GET `/app/rest/general_settings?routingType=3` (single-day/multi-day config); `SAVE_GENERAL_SETTINGS` posts to the same path (Builder; save method inferred POST) [M/S]
- GET `/app/rest/general_settings_list` [S]
- GET `/app/rest/hub_routing_configuration` (Builder) [M]; GET `/app/rest/fetch_hub_and_fence_routing_config?hub_id=` [M]; POST `/app/rest/save_hub_and_fence_routing_config` [M]
- GET `/app/rest/routing_account` (Builder) [M]; GET `/app/rest/scheduled_routing`, GET `/app/rest/scheduled_routing_cron` [M]
- GET `/app/rest/export_routing_config?routingPageId=` / POST `/app/rest/export_routing_config` [M]
- GET `/app/rest/fetchDistanceMatrixConfig` (Builder GET) [M]
- POST `/app/rest/post_route_table_configuration` (`POST_ROUTE_TABLE_CONFIGURATION`; route-table column config) [S — name implies POST]
- GET `/app/rest/general_settings?routingType=3` also keyed `GET_SINGLE_DAY_MULTI_DAY_CONFIG` [S]

**Carrier Portal runtime** (for completeness): `CARRIER_PORTAL_APIs.ACCEPT_REJECT_CARRIER = POST /sbs/api/command-bulk/load/accept-reject-carrier` [S]. **Load Planning runtime**: `/sbs/app/load/planning/*` (fetch_orders, carrier_count, category_count), `/sbs/graphql`, `/sbs/app/load/fetch-items`, `/sbs/api/command/load/create-add-load`, GET `/master/api/v1/lane/fetch/hubCodes`, GET `/v1/app/rest/hubs_via_role/pageable?...` [S].

---

## Cross-cutting / shared

- **Unified excel for masters (new UI)**: POST `/master/api/v1/excel/unified/create` (multipart) [M], GET `/master/api/v1/excel/unified/sample` (blob) [M].
- **Custom geofences**: GET/POST/DELETE `/master/api/v2/customGeofences` (+`/list`, `/filters`, `/countries`, `/countryCodes`); POST `/master/api/v2/customGeofences/upload` (multipart), POST `/master/api/v2/customGeofences/export` (blob) [M].
- **Zone/serviceable area**: `/master/api/v1/branch/zoneMaster*`, `/master/api/v1/branch/serviceableArea*` (list/excelCreate/excelDownload), POST `/master/api/v2/branch/zoneMaster/serviceableArea/upload` (multipart) [M/S].
- Masters CRUD families with the same fetch/POST/PUT(+activate/deactivate) convention: `hubToHub`, `lane`, `loadType`, `tagMaster`, `consignmentType`, `serviceType`, `vas`, `localization`, `customBusinessParameter` (DELETE seen), `businessUnit*`, `location`, `printer`, `sortCode`, `dockMaster`, `failureReason`, `packageType`, `palletSpace`; excel via `/master/api/v1/readExcel/{create|update}/<entity>` and `/master/api/v1/sampleExcelDownload/<entity>` [M].

## Extraction artifacts (for re-mining)
- `scratchpad/all-endpoints.txt` — 1000 unique endpoint strings (`/app|/master|/sbs|/ship|/mid-mile|...` prefixes)
- `scratchpad/builder-calls.txt` — 306 `Builder(url).withRequestMethod(METHOD)` pairs
- `scratchpad/direct-calls-clean.txt` — 366 direct axios `method url` pairs

---

## Base Modules (staging, 2026-09-23)

Re-captured live at `/v2/custom_settings/master-service/modules` (signed-in tab). The card
list is static SPA config; toggle state = `POST /master/api/v1/moduleSettings/fetch`
(absent row = off; toggle → PUT if the row exists, POST to create).

**10 cards, in staging order** (card = icon · title · subtitle · toggle · chevron):

| # | Title | Subtitle | code (ours) | Card behaviour |
|---|---|---|---|---|
| 1 | General Settings | Manage your global settings | `GENERAL_SETTINGS` (no row) | no toggle; navigates (our replica: "Coming soon" toast — no global page yet) |
| 2 | OPS Dashboard | Manage your ops dashboard settings | `OPS_DASHBOARD` | toggle + module page |
| 3 | Consignment Order | Manage your consignment order settings | `CONSIGNMENT_MANAGEMENT` | toggle + module page ("Orders") |
| 4 | Pending For Planning | Manage your Pending for planning order settings | `PENDING_FOR_PLANNING` | toggle + module page |
| 5 | Load Planning | Manage your Load planning settings | `LOAD_PLANNING` | toggle + module page |
| 6 | Carrier Portal | Manage your carrier portal settings | `CARRIER_PORTAL` | toggle + module page |
| 7 | Geo Coding | Manage geo codes for your service locations | `GEOCODING` | toggle + module page |
| 8 | Enable Routing | Enable or disable routing for this account | `ROUTING` | toggle only, no chevron |
| 9 | Put Away | Put away settings | `PUT_AWAY` | toggle + module page (our replica: generic editor) |
| 10 | Last Mile Loading | Last Mile Loading settings | `LASTMILE_LOADING` | toggle + module page (our replica: generic editor) |

**Module page anatomy** (Consignment Order → "Orders"): back arrow + title + subtitle, tabs
**General** (User Types checkbox row + Feature Settings rows: label left, segmented choice /
toggle right) · **Date Filter** (default date field + default range) · **Table
Configuration** · **On Page Filters** (checkbox + sequence lists), footer **Reset / Save
Settings**. All of it lives in the module's `settingJson`; save = PUT
`/master/api/v1/moduleSettings` with the whole row.

**`PICKUP_REQUEST` — our own code, not a staging module.** The replica inserts a
**Pickup Request** card ("Manage first-mile pickup settings", slug `pickup_request`) right
after Pending For Planning. Staging has no row for it: the first toggle POSTs
`[{enabled, code:'PICKUP_REQUEST', name:'Pickup Request', settingJson}]` (moduleSettings
accepts arbitrary codes — unverified against staging at time of writing), later saves PUT.
settingJson shape:
`{ userTypes: string[], featureSettings: { enabled, autoCreateOnConsignment, scanMode,
maxAttempts, allowAddToExistingUntil, rescheduleWindowDays, overagePolicy, sendToCarrier,
cutoffTime, bookingLeadTimeMins, multiPrPolicy, sameDayCutoff, slotDefinitions,
podRequirements: {signature, photo, otp}, merchantCancelUntil, autoRescheduleOnFail,
merchantOverrides: {<merchantCode>: {sameDayCutoff?, slotDefinitions?, multiPrPolicy?, maxAttempts?}} },
dateAppliedOn?, selectedDateRange?,
pageRenderingConfig: { table: { columns: {<key>:{show,sequence}} }, filters: {<key>:{show,sequence}} } }`.
Every save is mirrored into localStorage `fareye-pickup-module-config-v1`
(`src/config/pickupModule.ts`) because the LOCAL app cannot call `/staging`.
The mirror is written BEFORE the staging call, so the switch and the page keep working
without a staging session (the save then toasts "Saved locally"). With no row, the card
shows the mirror's `enabled` (default true), not off.

**Pilot Driver App → Pickup Module** (our card, code `DRIVER_APP_PICKUP_MODULE`, same
moduleSettings PUT/POST as the rest of the group): rows Handover scan mode · Proof of
pickup (signature / photo / OTP) · Overage policy read and write the SAME mirror keys
(`scanMode`, `podRequirements`, `overagePolicy`); its settingJson carries a copy of those
three keys.
