# Grow merchant order form — research (2026-09-25)

Owner request: the Grow portal is the MERCHANT's side, the consignment form is the CARRIER's.
Grow must not ask Merchant or Carrier, must show services **with a rate** once the OD pair is
known, needs a better LTL / FTL choice, and must follow the console's consignment settings.
Same fields, same behaviour, its own design. Staging Grow was not reachable (no session) —
everything below is from the repo, its git history and the earlier session transcripts.

## 1. The form today (`AddOrderPage.tsx`, 1 522 lines, shared via `portal`)

One component renders both portals. `portal="console"` adds the Order Category card, turns
Merchant into a select and creates the consignment outright; Grow shows Merchant read-only
and goes to checkout (+ Save for Later). Layout = staging's Add Order form (owner override
2026-09-24): Simplified / Regular tiers, 4-column grids, eager "Required field.", Carriers well.

### Field inventory — who owns it

| Field / card | Console | Grow merchant |
|---|---|---|
| Merchant* | select | **carrier-only** — the signed-in merchant (header ⇄) is recorded silently |
| Carriers (radio well)* | yes | **carrier-only** — the carrier allocates; checkout keeps its `2GO Express` / `2GO Logistics` fallback (PFP / 3PL invariants key off `carrier`) |
| Order Category (4 Person · Stackable · Fragile · VIP · Hazmat · Heavy Weight) | Regular tier | **carrier-only** (never on Grow already) |
| Task, Routing Type | registry only | ops-only, not asked |
| Latitude / Longitude | address grid | ops-only (geocoded by the carrier), not asked |
| Total Loading Time | Regular | dock-planning field; asked only with a full vehicle |
| Order Number*, Reference Number*, Consignment Number, Exchange Order Number, Consignment Type*, Ship By Date*, Tags, Payment Mode, Order Amount, Label Format | yes | merchant |
| Scannable ("Barcode labels on boxes"), Scheduling Confirmation Required, Clearance Required, Splittable ("Can be delivered in parts"), Special Instructions | yes | merchant (plain switches with the owner's one-line hints) |
| Ship From — Location Code (registered address → Location Master rows → saved stores → Other address…), contact, address, Pick Up Start/End | yes | merchant |
| Ship To (+ extra drops) — Location Code / address book, Customer Name*, Contact*, Email, Company, Lines 1–3, Landmark, Country*, Postal Code, Suburb, City*, State*, Delivery Start/End, Floor / Lift | yes | merchant |
| RTO (Same As Ship From / Use Different Address) | Regular | merchant |
| Packages — Package Type (Package master presets / Custom), Cargo Type, Quantity, Weight (auto from preset tare + SKUs unless typed), L/W/H, Tracking Number, Pallet Space, Description | yes | merchant |
| SKU lines — SKU Code (autocomplete on the SKU master: fills name, category, HSN, origin, weight, dims, unit cost), Name, Qty, Weight, Dims, Unit Cost | yes | merchant |
| Value Added Services (level · SKU · service · time · remark; incl. the former FTL extras, priced) | yes | merchant |
| Service Type (one plain dropdown, `SERVICE_TYPES`) + "Load type" (Shared LTL / Full FTL, locked by the service's master Load type) + Vehicle Type (Ship From hub's fleet) | yes | merchant — **but priced nowhere visible** |
| FTL variant (`/add/vehicle`): FTL service type + vehicle rows (type × count, load, addresses) | yes | merchant |

### Pricing today — the "services with a rate" gap

* `draft.ts` `PARCEL_SERVICES = [{ Standard Delivery, 2 days, 90 }]` — ONE flat parcel price.
  Every other Service Type "prices / ETAs as Standard". Weight, volume and lane are ignored.
* `VEHICLE_SPECS` carry a per-vehicle `rate`; `ftlQuoteVehicles` = Σ vehicle rates +
  `EXTRA_DROP_RATE` 650 per extra drop + `ADDITIONAL_SERVICES` prices. No lane factor.
* `quoteForOrder` (OrderViewPage, unpaid orders) and `rateCalculator.tsx` read the same flat
  card; checkout freezes `draft.rate` into `charges` (+15 % tax).
* `CURRENCY = '₱'` is global — the 150 Chicago (ORD) staging consignments carry `currency: '$'`,
  but a new order from the ORD store would be priced and stored in ₱.
* The form shows the rate nowhere: the merchant picks a Service Type from a dropdown and sees
  the price for the first time at checkout.

## 2. History — the accepted 2026-09-22 dialect

Git history starts at 2026-09-23 (`c26881a`), already on the staging-shaped layout, so the
2026-09-22 version is not recoverable from git. The session transcript
(`818a2e62…jsonl`) and `FAREYE-GROW-APIS.md` §2–5 record it:

* live Grow = a **3-step stepper**: *Sender & Receiver Address* → *Parcel Details* →
  *Order Summary*; step 3 = left "How do you want to send your parcel?" with **selectable
  rate cards** (service name, "Delivery by <date>", price right-aligned in tenant currency,
  booking cut-off strip) + right **sticky "Order Summary" rail** (From / To / Parcel Size with
  Edit links, Delivery / Total / ETA, **Proceed**, **Save for Later** → `/order/checkout/`).
* Parcel Details per package: Cargo Type*, item information, quantity, dead weight, L×W×H →
  volumetric weight (factor 3500), + Add Item, totals line.
* Owner-accepted dialect (memory): form fields in forms, columns in tables; aligned field
  grids; lists as tables with 12px headers whose cells are ghost fields; custom listbox
  dropdowns; no badges; add buttons BELOW the cards; type scale 12/13/15/17/24; a package =
  cargo type + package type + count + weight + L/W/H + items table with SKU autocomplete.
* What replaced it (2026-09-23/24): the one-component-set rule, then the staging-exact form —
  the rate cards and the summary rail were dropped ("no side summary").

**Kept for the new form:** rate cards *after* the addresses and packages, the sticky summary
rail with Save for Later + continue to checkout, the package anatomy (preset + count + weight +
L/W/H + items table with SKU autocomplete, volumetric weight shown), add buttons below lists,
the 12/13/15/17 scale. **Not kept:** the stepper — the owner's 2026-09-25 instruction makes
Service Type the LAST section of the form, derived live from the OD pair and packages entered
above; a single page lets the merchant watch the cards appear and re-price as they edit.

## 3. Console settings that must drive Grow

| Setting (where) | Store | Grow behaviour |
|---|---|---|
| Base Modules → Consignment Order field hides (console `ModuleDetail`), Form Builder hides/relabels (console Add page) | `fe-consignment-form-behavior` `.hidden`, `fe-consignment-field-config` | a hidden field is hidden on Grow too (`fieldHidden(key, cfg, 'full', behavior)`); relabels apply |
| Identifier (both / Order Number / Reference Number) | `fe-consignment-form-behavior.identifier` | one identifier asked, the other copied |
| **NEW:** `/local/settings/consignment-order` → **Form Fields** tab (Shown · Required · Hidden per optional field) | same `fe-consignment-form-behavior` (+ `required[]`) | the local app had no field-level setting at all; Required is honoured on Grow (the console form stays staging-exact and keeps its own required set; hides reach both) |
| Consignment Order `enabled` / user types / modify-till / columns / filters | `fareye-consignment-module-config-v1` | list-side only; `enabled` is stored only (no reader anywhere) — unchanged |
| General → Scannable / Splittable | `fareye-general-settings-v1` | stored only today; the form switches keep their Form Builder hides — unchanged |
| Service & Order masters → Service Type rows (name, code, Load type, status) | `local-masters-service_order-service-type-v3` (`rows:null` = sample rows) | the service CARDS: Active rows only, in master order; Load type decides Shared / Full; no saved rows → `SERVICE_TYPES` |
| Service & Order masters → SKU | `masters.skus` (live / sample; same catalogue as the local SKU master) | SKU autocomplete, HSN / origin / weight / dims fill |
| Package Type master | `masters.packageTypes` (merchant's own, else company) | package presets |
| Location Master / merchant registered address | `masters.locations`, `usePickupLocations` | Ship From list; delivery-side rows + past receivers = Ship To address book |
| Vehicle Config (`/local/routing/vehicles`) | `fareye-local-vehicle-config-v1` (`hubVehicleTypes`) | Full-vehicle cards = the Ship From hub's fleet; masters' hub list → the FTL service catalogue as fallbacks |
| Pickup module (`/local/settings/pickup`) | `fareye-pickup-module-config-v1` | unchanged: the Ship From Pick Up window is the sender's window; in auto mode with "Ask the shipper for a pickup window" it is validated by `userWindowError`; `autoBookOnConsignment` reads it at checkout |

## 4. Seed facts checked

* Sample merchant 2GO_PH has three pickup locations (SANPABLO, MNL-01, CEB-01) plus, on a
  sample read, the staging ORD store (Chicago) — ≥ 2 locations, no seed change needed.
* Currency: PH network → ₱, the Chicago ORD network → $ (staging consignments' `currency`).
