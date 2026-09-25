# Staging Masters → Service & Order — inventory (2026-09-24)

Target: `https://staging.fareye.co/v2/custom_settings/master-service/masters/service_order`
(SEKO / Delivery Management tenant).

**Captured live on 2026-09-24.** Reached by click only: Settings → Masters → Service & Order.
Every sub-master's list and Add form was opened, and nothing was saved. The differences
are folded into `src/nueva/mastersTree.ts` (category `service_order`). The console
and `/local/settings/masters/service_order` both read that file.

## Category page: 10 sub-masters, in order

| # | Card | Description |
|---|---|---|
| 1 | Service Type | Add various services offered by your carriers, this helps in setting up & managing serviceability |
| 2 | Package Type | (same text) |
| 3 | Consignment Type | (same text) |
| 4 | **Reason Master** | Define standardised reasons used to record field and hub exceptions |
| 5 | Value Added Service | (same text as 1) |
| 6 | SKU | Manage SKUs with their categories, dimensions, weight and hub mapping |
| 7 | Business Parameter | Add business parameters and their possible values |
| 8 | Sort Code | (same text as 1) |
| 9 | Slot Master | Define slots for package types and their dimensions |
| 10 | Pallet Space Conversion Master | Define conversion rules to calculate pallet space based on package type and quantity |

## Per sub-master (\* = required; filters = the visible toolbar dropdowns)

**Service Type.** Filters: Service Name · Code · Status. Columns: Service Name · Code ·
Consignment Types · Status · Action (edit + **Add Area**). 6 rows: Delivery & Installation,
Installation, Delivery, Standard, White Glove Delivery, Express. Each has code = name,
Consignment Types `-` and status Active. Add form ("Service type"): Service Type Name\* ·
Service Code\* · Consignment Types (multi-select "Select consignment types": Service /
Reverse / Forward) · "Enable this service type" checkbox, **unchecked** by default.

**Package Type.** Filters: Package Name · Code · Status. Columns: Package Name · Code ·
Length · Breadth · Height · UOM · Weight · Weight Unit · Business Unit · Status · Action.
5 rows: Crate 10/3/6 cm, Half Pallet 10/10/10 **m**, Full Pallet 10/10/10 cm, Flat-Pack
Carton 20/4/5 cm, Ship-Alone Carton 10/10/10 cm. All are kg, Comfy Furniture, Active.
Add form fields:
- Name\*, Code\*, Length\*, Breadth\*, Height\*.
- Unit of Measure\*: a **select** (cm - centimeters / in - inches / mm - millimeters / m - meters).
- Weight.
- Weight Unit: a **select** (kg - kilograms / lb - pounds / to - tonne / wto - wto maps to we (wet kilo) / net weight / dto - dry tonne).
- Business Unit: a select with 9 options (Walgreens, CVS Pharmacy, Bob's Discount Furniture, Bobs Discount Furniture, Tractor Supply Co., Best Buy, Comfy Furniture, Freshly Grocery, Smart Gadgets).
- Service Type: a select with the 6 service types.
- "Enable this package Type", unchecked.

**Consignment Type.** Filters: Consignment Name · Code · Status. Columns: Consignment
Name · Code · Status · Action. 3 rows: Service/service, Reverse/reverse,
Forward/forward. Add form: Consignment Name\* · Consignment Code\* (select "Please select":
Forward / Reverse / Exchange / Service / Transfer) · "Enable this consignment type",
unchecked.

**Reason Master** (new; not in the tree before). It has two inner tabs, **Reasons | Reason Policy**.
- *Reasons*
  - Filters: Reason Name · Code · Category · Status.
  - Columns: Reason Code · Reason Name · Category · Status · Action (edit + enable toggle).
  - 10 rows:

    | Reason code | Reason name | Category | Status |
    |---|---|---|---|
    | Customer_Unavailable | Customer Unavailable | PICKUP, UNDELIVERED | Active |
    | Inclement Weather | Inclement Weather | RESCHEDULE | Active |
    | Production Delay | Production Delay | RESCHEDULE | Active |
    | Invalid Allocation | Invalid Allocation | UNDELIVERED | Active |
    | Aged | Aged | UNDELIVERED | Active |
    | Damaged | Damaged | UNDELIVERED | Active |
    | Pikcup Test | Pikcup Test | RETURN | Inactive |
    | Test Cancel | Test Cancel | RETURN | Inactive |
    | Del | Delivery | DELIVERY | Inactive |
    | Test Reason | Test Reaosn | RETURN | Inactive |

  - Add form ("Reason", subtitle "Define a standardised reason used to record field and hub exceptions."):
    - Reason Code\*
    - Reason Name\*
    - Category\*, a multi-select: Pickup / Return / Delivery / Reattempt / Damage / Reschedule / Cancel / RTO Initiated / Complete RTO / Undelivered / Service Rework / Hold
    - "Enable this reason"
- *Reason Policy*
  - Filters: All reasons · Merchant · Hub · Status. Button: **Add rule**.
  - A banner explains the table: the most specific rule wins (merchant, then hub, then attempts). Anything with no matching rule falls back to Hold for review. A line below reads "Decision table · 3 rules · default: Hold for review".
  - Columns: Failure Reason · Category · Merchant · Hub · When · Outcome · Action (edit + toggle).
  - 3 rows:

    | Failure reason | Category | Merchant | Hub | When | Outcome |
    |---|---|---|---|---|---|
    | Pikcup Test | Rto Initiated | All merchants | All hubs | After attempt 3 | Reattempt delivery |
    | Test Cancel | Cancel | All merchants | All hubs | Always | Cancel |
    | Delivery | Delivery | All merchants | All hubs | After attempt 3 | Reattempt delivery |

  - Add form ("Reason Policy", subtitle "Define a rule mapping a failure reason to an RTO outcome."):
    - Category\*: Delivery / Damage / Cancel / RTO Initiated / Undelivered / Service Rework / Hold
    - Failure Reason\*: no options until a Category is chosen (seed lists the three policy reasons)
    - Merchant\*: multi-select, default All merchants, plus the 9 merchants
    - Hub\*: multi-select, default All hubs, plus EU (eu) / FRA (fra) / Australia Hub (au_001) / NYC (nyc) / ORD (ord)
    - When\*: Always / Before / After
    - Outcome\*: Hold for review / Reattempt delivery / Return to origin / Cancel
    - "Enable this rule"

**Value Added Service.** Filters: VAS Name · Code · Status. Columns: VAS Name · Code ·
Consignment Types · Description · Skill · Hierarchy · VAS Category · Execution Time ·
Service Time Default (minutes) · Additional Time Default (minutes) · Status · Action.
3 rows: Front-Door, Room of Choice, White Glove (code WhiteGlove). In each row the
description equals the name, the other fields are `-`, the times are 0, and the status is Active.
Add form fields:
- VAS Code\*, VAS Name\*, Description\*.
- Skill: a multi-select with no options on this tenant.
- Hierarchy: a multi-select (Front-Door / Room of Choice / White Glove).
- Consignment Types: a multi-select.
- VAS Category: Unloading / White glove / Removals / 4 person Assist.
- Execution Time: Pre activity / Post activity.
- Service Time Default (minutes)\*, Service Time Additional (minutes)\*. Placeholder "Enter time in minutes".
- "Enable this VAS".

**SKU.** Filters: SKU Code · SKU Category · Hub · Status. Columns: SKU Code · SKU Category ·
Hub · Description · Length · Breadth · Height · Dimensions UOM · Weight · Weight UOM ·
**Stackable** · Status · Action. 1 row: ELECTRONICS-003 · Electronics · "ord, nyc" ·
"Apple Iphone Blue Colour 6gb Ram 120gb Storage" · 11/3/4 cm · 1 kg · Yes · Active.
Add form (subtitle = card description):
- SKU Code\* (with an (i) icon), SKU Category\*.
- Hub: a multi-select tag input, "Type and press enter" (Australia Hub / FRA / EU / ORD / NYC).
- Description, Length, Breadth, Height.
- Dimensions UOM and Weight UOM: the same option lists as Package Type.
- "Stackable" checkbox.
- "Enable this SKU".
- There is **no HSN Code or Origin Country** field.

**Business Parameter.** There is **no list**. The card opens a single form page, "Business
Parameters", subtitle "Define all business paramters and its values". Each row is Parameter
Name\* (saved rows are read-only and show "Code: truck") plus Parameter Values\* (tags).
The page has **+ Add Row** and **Save Parameters**. Saved content: Truck → Tata, Mahindra.

**Sort Code.** Filters: Sort Code Name · Code · Status. Columns: Sort Code Name · Code ·
Status · Action. 1 row: 3PL / 3pl_ams_au / Active. Add form: Sort Code Name\* · Sort Code\* ·
"Enable this sort type", unchecked.

**Slot Master.** Filters: Slot Name · Slot Code · Status. Columns: Slot Name · Slot Code ·
Opening Time · Closing Time · **Capacity · Break Start Time · Break End Time** · Status ·
Action. 1 row: mg_slot / Morning _Slot / 05:00 / 19:00 / (blank ×3) / Active. Add form
(subtitle "Configure slots for different package types and their dimensions"):
- Slot Code\* ("Enter unique Slot code"), Slot Name\* ("Enter Slot Name").
- Slot Start Time\*, Slot End Time\*: time pickers.
- Slot Break Start Time, Slot Break End Time: time pickers.
- Capacity ("Enter Capacity").
- "Active Flag" (i) label above the "Slot is Active" checkbox, which is checked.

**Pallet Space Conversion Master.** The list page subtitle is "Configure how pallet spaces are
derived using package type and quantity combinations". The toolbar has **Download** and a split
**Add ▾** button (Add via form / Upload data file). Filters: only Package Type · Business
Unit (no search, no Status). Columns: Business Unit · Package Type · Package Type
Quantity · Pallet Space · Status · Round Up · Action. 1 row: Bob's Discount Furniture /
Half Pallet / 20 / 1 / Active / false. "Add via form" opens a **modal**, "Add Pallet Space
Conversion Master", with these fields:
- Business Unit\*: "Select business unit", 9 merchants.
- Package Type\*: "Select package type", the 5 package types.
- Package Type Quantity\*: "Enter quantity".
- Pallet Space\*: "Enter pallet space".
- Round Up\*: "Select Round up", true / false.
- "Enable this pallet space conversion master type", unchecked.

The modal has Cancel and Submit buttons.

## Changes folded into mastersTree (2026-09-24)

- **Added Reason Master** as the 4th card, with an icon (`MessageSquareWarning`). It has
  inner tabs: `reason-master-reasons` (10 rows, Add Reason form) and `reason-policy` (3 rules,
  Add rule form with the All merchants / All hubs / Always / Hold for review defaults).
- **Service Type:** added a Consignment Types column (rows `-`) and form field. The Enable
  checkbox is no longer checked by default.
- **Package Type:** Half Pallet UOM changed to `m`. Ship-Alone weight unit changed from `KG` to `kg`. Unit of Measure and
  Weight Unit are now selects with staging's options. Business Unit now has the 9 staging merchants.
- **Consignment Type:** the code placeholder is now "Please select". Enable is no longer checked by default.
- **Value Added Service:** added the Consignment Types, VAS Category and Execution Time columns.
  The form was rebuilt in staging's order: VAS Code\*, VAS Name\*, Description\* (newly required),
  Skill / Hierarchy / Consignment Types / VAS Category / Execution Time selects, both times
  required with the "Enter time in minutes" placeholder, and "Enable this VAS".
- **SKU:** removed the HSN Code and Origin Country columns and fields. Added Stackable
  (column and checkbox), the SKU Code (i) icon and staging's Hub / UOM option lists. Filters are now
  SKU Code · SKU Category · Hub · Status. The sample data is now staging's one row, ELECTRONICS-003.
  The console still routes SKU to the live `SkuMaster.tsx`.
- **Business Parameter:** the sample is now one row (Truck / truck / Tata, Mahindra). The form
  subtitle is now staging's text, typo included.
- **Sort Code:** Enable is no longer checked by default.
- **Slot Master:** the card description changed to staging's text. Added the Capacity, Break Start Time and
  Break End Time columns, plus 3 form fields for them with staging's placeholders. "Slot is Active" has the (i) icon.
- **Pallet Space:** `kind: 'modal'`. The Status filter was removed. Business Unit now has the 9 merchants. Placeholders are now
  staging's. The form subtitle is now the list subtitle. Enable is no longer checked by default.
- `pages.tsx` `EntityContent`: `MasterTablePanel` is now keyed by the tab's sub id. Without the key, both
  Reason Master tabs shared one row state, so Reason Policy showed the Reasons rows. The change is behaviour only and does not change how the page looks.
- Local store key bumped from `local-masters-service_order-<sub>-v1` to `-v2` because the row shapes changed.

## Not expressible without changing the frozen Masters pages (left as gaps)

- **Multi-selects.** `FieldDef` has only a single `select`. These fields render as single selects:
  Service Type / VAS Consignment Types, VAS Skill and Hierarchy, SKU Hub (tag input), Reason Category,
  and Policy Merchant and Hub.
- **Business Parameter** stays a list with a form behind Add. On staging it is the form alone.
- **Reason Policy:** the explanatory banner and the "Decision table · n rules" line are not shown. The
  attempt-number input implied by When = Before/After ("After attempt 3") was not captured and is not modelled.
- **Pallet Space:** the frozen pages open every form full-page, so the modal is not shown. The separate
  **Download** button and the list-page subtitle are also not shown (the card description is used).
- **Slot Master:** the separate "Active Flag" label above the checkbox is not shown.
- **Checkbox defaults not confirmed by screenshot.** VAS, Reason, Reason Policy and SKU "Enable" checked
  and Package / Consignment "Enable" unchecked were read from the DOM only. Slot (checked) and Service / Sort / Pallet (unchecked)
  were confirmed on screen.
