# Grow merchant order form — design (2026-09-25)

Research: `docs/superpowers/research/2026-09-25-grow-merchant-form-research.md`.

**Rule change.** Console Add Consignment (`/local/consignments/add`, `AddOrderPage`) stays
staging-exact. Grow `/grow/orders/add[/vehicle]` = `MerchantOrderForm` — the same fields minus
Merchant / Carrier / Order Category, the same draft → checkout → store writes, its own layout.

## Page

`PageHeader` "Create Order" → two columns: sections (left, ≤ 1060px) + sticky **Order summary**
rail (right, 320px). One page, sections in this order — Service Type is LAST because it is
derived from everything above it:

1. **Pickup from** — pickup-address picker (registered address → Location Master rows → saved
   stores → Other address…) shown as a summary card with Edit; Other address / Edit opens the
   field grid (+ "Save to my pickup addresses"). Pickup window start / end.
2. **Deliver to** — address-book search (delivery-side Location Master rows + past receivers),
   then the address grid; "+ Add another delivery address" below; delivery window.
   Returns (RTO): Same as pickup address | Different address (radio cards, neutral selected).
3. **Order details** — Order Number* / Reference Number* (per identifier setting), Consignment
   Type, Ship By Date*, Payment Mode, Order Amount, Label file type.
4. **Packages** — one card per package: package type preset, cargo type, count, weight (auto
   from preset + SKUs unless typed), L × W × H, volumetric + chargeable weight line, tracking,
   description; items table (12px headers, cells are fields) with SKU
   autocomplete (code / name → HSN, origin, weight, unit cost). "+ Add package" below.
5. **Handling & extras** — plain switches with one-line hints (Barcode labels on boxes ·
   Can be delivered in parts · Scheduling Confirmation Required · Clearance Required), Special
   instructions, Value-added services (service + level + SKU, priced options show their price).
6. **Service Type** — owner's screenshot grammar: white card, 15px title, pencil top-right.
   Top: segmented **Shared vehicle (LTL) | Full vehicle (FTL)** (neutral selected style).
   Until the OD pair + a package weight exist: one muted line "Enter the pickup and delivery
   addresses and your packages to see services and rates." Then one full-width card per
   service allowed for that load type: name (17 bold), house icon + "Delivery by **N DAY**",
   banknote icon + rate (15 bold). Selected = 2px brand outline, no fill. Once chosen the list
   collapses to that card; the pencil reopens it; one eligible service = preselected.
   Full vehicle: after the service, vehicle cards (vehicle type · capacity / payload · rate per
   vehicle · count stepper) from the Ship From hub's fleet. Caption: "Estimated rates".

Rail: Pickup → Delivery, packages (count, chargeable kg), service + promised date, the rate
breakdown (freight · extra drops · VAS · tax · total) or what is still missing; primary
"Continue to checkout", text "Save for later". Errors appear only after a Continue attempt
(danger-fg line + scroll to the first incomplete section).

## Pricing — `src/growOrders/rates.ts` (ESTIMATED)

`quoteLane({ from, to, drops, parcels, loadType, vehicles, vas, currency }) → ServiceQuote[]`.
Chargeable kg = Σ max(dead, L·W·H / 3500) × count. Lane zone from the two addresses: same
city ×1.00 · same state/region ×1.25 · national ×1.60 (+0 / +1 / +2 days). Shared: base +
per-kg over the first kg, per service; Full: Σ per-vehicle rate × zone. + extra drops +
priced VAS. Two rate cards: ₱ (PH network) and $ (the Chicago ORD network) — the Ship From
hub decides. Tax 15 % (unchanged). Checkout keeps freezing `draft.rate` (never re-quotes);
`OrderViewPage` (unpaid) and the Rate Calculator quote through the same module.

## Settings → Grow

| Setting | Grow effect |
|---|---|
| `fe-consignment-form-behavior.hidden` (+ Form Builder hides / relabels) | field hidden / relabelled |
| `…identifier` | one identifier asked |
| `…required` (new Form Fields tab on `/local/settings/consignment-order`) | optional field becomes required (Grow only) |
| Service Type master rows (Active, Load type) | service cards + which segment lists them; `serviceType` hidden → the default service only |
| SKU / Package / Location masters | autocomplete, presets, address lists |
| Vehicle Config (per hub) | vehicle cards |
| Pickup module | pickup window validation in auto + user-selects mode; auto booking at checkout |

## Kept

Draft autosave shape (`OrderDraft` — parcel and FTL branches as `AddOrderPage.buildDraft`),
Save for later, checkout + `markPaid`/create, `?draft=`, `?fromPickup=`, `?fromOverage=`,
`?step=1|2` (sample parties, scroll to Packages / Service Type), `&type=FTL` and
`/add/vehicle` (= Full vehicle preselected). `OrderDraft` gains optional `currency` and
`sourceParcels` (an FTL booking keeps the merchant's packages for resume).

## Not asked on Grow (owner pass, 2026-09-25: "would a merchant know / need this?")

| Field | Why hidden | Stored as |
|---|---|---|
| Merchant | the signed-in merchant (header ⇄) | `consignment.merchantCode/Name` |
| Carrier(s) | the carrier allocates | checkout's `2GO Express` / `2GO Logistics` fallback |
| Order Category (4 Person · Stackable · Fragile · VIP · Hazmat · Heavy Weight) | ops classification | — |
| Location Code (Ship From / Ship To / RTO) | internal codes; the picked location / address-book row resolves it | `sender.locationCode`, `storeCode` as before |
| Consignment Number | the carrier's number; defaults to the Reference Number | `consignmentNumber = referenceNumber` |
| Tags | routing tags (`routingTags[]`), ops-set | `[]` |
| Pallet Space | vehicle planning | `''` |
| Total Loading Time | dock planning | `null` |
| Task, Routing Type | UI / planning only | `task: 'Delivery'` |
| Latitude / Longitude | geocoded by the carrier | — |

Kept (customer-facing): Order / Reference Number, Order type, Ship By Date, Payment Mode + Order
Amount (COD / value), Label file type (optional — merchants print labels), the four handling
switches (incl. Clearance Required), Special Instructions, VAS, RTO, pickup / delivery windows.
Stepper: the accepted dialect had one; replaced by one page because the owner put Service Type
LAST, derived live from everything above it — the summary rail carries the old step-3 rail.
