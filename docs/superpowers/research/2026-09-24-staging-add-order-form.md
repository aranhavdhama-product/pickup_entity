# Staging Add Order form — capture (2026-09-24, staging.fareye.co/v2/ses/consignment → Add)

Captured on the SEKO tenant (company 20106), REGULAR tier, 1503×812 viewport. The page keeps
the console shell (title bar "Orders"); the form is a column of full-width white cards on the
grey canvas, and a sticky footer bar.

## Layout grammar
- Cards: white, radius ~8px, padding 24px, 24px gap between cards. Title 16px bold, then a
  14px grey description line, then the field grid.
- Field grid: **4 equal columns**, ~32px column gap, ~40px row gap. Label above the control
  (14px, dark), required = red `*` after the label. Controls are 40px tall, light-grey filled
  (`#F5F5F5`-ish), 6px radius, placeholder grey `eg, …`.
- Empty required fields show **"Required field."** in red 12px directly under the control,
  on a pristine form (staging does this eagerly).
- Selects show a chevron; the Consignment Type select shows an arrow icon before "Forward".
- Contact Number = country-code select (narrow) + tel input in one control.
- Date/time pairs (Pick Up Start Time…) = a date box ("Select Date", calendar icon) and a
  time box ("Select Time", clock icon) side by side, each ~half a column wider than a normal
  control; label spans them.
- Switches are Ant-style pills, label to the LEFT of the switch.
- "Add More" = outline brand button with a ⊕ icon at the card's top-right.
- Footer (sticky, white, full width of the content area): left **"Switch to Simplified"**
  (outline brand); right **"Go Back"** (grey) and **"Add Order"** (primary, disabled until
  the form is valid).
- No side summary panel, no progress bar, no section nav.

## Cards, in order (Regular tier)

### 1. Order
"Provide the order details to ensure accurate processing, routing, and billing of the shipment."
Row 1: Order Number* (eg, ABC0001) · Reference Number* (eg, ABC0001) · Consignment Number
(eg, 0001) · Consignment Type* (select, "→ Forward")
Row 2: Ship By Date* (date, defaults to today) · Merchant* (select, eg, ELEX) · Tags (eg,
Ambient, ⓘ after label) · Payment Mode (select, eg, Prepaid)
Row 3: Order Amount (number, eg, 100.22) · Service Type (select, eg, Service) · Label Format
(select, eg, PDF)
Switch row: Scannable ○ · Scheduling Confirmation Required ○ · Dedicate Truck ○ · Clearance
Required ○ · Total Loading Time (minutes) [number, ph "minutes"]
Special Instructions — full-width textarea (eg, lorem ipsum)

### 2. Ship From
"Provide the pickup address and contact details for this order."
Location Code (select, eg, Williamstown) · Company Name (eg, Random Company) · Sender Name*
(eg, John Doe) · Contact Number (code ▾ + eg, 1234567890)
Email (eg, johndoe@xyz.com) · Address Line 1* (eg, Building No.) · Address Line 2 (eg, Street
1 A) · Address Line 3 (eg, Behind High School)
Landmark (eg, Behind High School) · Country* · Postal Code · Suburb / County
City* · State* · Latitude · Longitude
Pick Up Start Time (date + time) · Pick Up End Time (date + time)
Floor Number · Lift Available ○

### 3. Return To Origin (RTO)
"Provide the return-to-origin address and contact details for this order."
Two radio cards: **Same As Ship From** (selected) · Use Different Address
(Use Different Address reveals the same address grid as Ship From.)

### 4. Ship To
"Provide the delivery address and contact details to ensures accurate delivery and proper
communication with the recipient."
Location Code (select) · Company Name · Customer Name* · Contact Number* (code ▾ + tel)
Email · Address Line 1* · Address Line 2 · Address Line 3
Landmark · Country* · Postal Code · Suburb / County
City* · State* · Latitude · Longitude
Delivery Start Time (date + time) · Delivery End Time (date + time)
Floor Number · Lift Available ○

### 5. SKU  [Add More]
"Provide the SKU details for this order to ensures precise tracking, billing, and handling of items."
Empty until Add More; each SKU line = the staging skuDetails fields (code, name, quantity,
unit price, weight + uom, dimensions + uom, HSN, origin country, category, description,
package link, service times). CAPTURE the row by clicking Add More.

### 6. Piece  [Add More]
"Provide the piece details for this order to ensure precise tracking, billing, and handling of items."
Empty until Add More; each piece = id, type, quantity, tracking number, description, value,
weight + uom, L×B×H + uom, pallet space, barcode. CAPTURE the row by clicking Add More.

### 7. Value Added Services  [Add More]
"Provide the value-added services for this order to ensure that the job is assigned with the
right capabilities and resources."
Each line = VAS Added Level · SKU Line Item No · Service · Service Time (mins) · Remark.

### 8. Order Category
No description. One line of label + switch pairs: 4 Person · Stackable · Fragile · VIP ·
Hazmat · Heavy Weight.

### 9. Carriers  3
A grey well containing radio cards: No Carrier · **DSP 1** (selected, brand outline) ·
DSP 2 · Supercharged Deliveries. The count after the title is the carrier count.

## Simplified tier
Reached with "Switch to Simplified" (footer, left; becomes "Switch to Regular"). Field
inventory per the bundle notes in FAREYE-APIS.md: Merchant, Order Number, Consignment Type,
Service Type, Ship By Date, pickup window Start/End in the order card; addresses of exactly
Location Code, Name, Email, Contact, Lines 1–3, Country, Postal, City, State; a combined
Package/SKU row (Package ID, Type, Quantity, Tracking, SKU Code/Name). CAPTURE it live.

## Live captures (2026-09-24, second pass — Add More rows, RTO, Simplified)

Each "Add More" row is a bordered sub-card with a grey header strip ("SKU 1", "Piece 1", "VAS")
and a ⊖ remove icon-button on the right; the fields sit in the white body below.

**SKU row** — row 1 (4 cols): SKU Category (select) · Line Item no* (text) · Code* (select,
SKU master) · Name* (eg, Reserve). Row 2: Description (eg, Water Bottle) · Image Url. Row 3
(7 narrow cols): unit of measure* (select, `cm`) · Weight unit of measure* (select, `kg`) ·
Quantity* (eg, 1) · Unit Cost (eg, 12.34) · Weight* (eg, 10) · Length* (eg, 10) · Width* (eg, 10);
row 4: Height* (eg, 10) · Volume (read-only, eg, 10). Footer line of the row: Total Weight (kg) - ·
Total Volume (cm³) - · Total Cost ($) -.

**Piece row** — Sku Line Item No (select) · Piece Id (prefilled random id) · Tracking Number ·
Type* (select) / Description · Quantity* (eg, 1) · Weight (-) · Volume (-) · Pallet Space
(narrow cols). Footer: Total Weight (-) - · Total Volume (-) -. No L/W/H on a piece. After one
piece was added the card's Add More button was no longer shown.

**VAS row** (5 cols) — VAS added level* (select, default SKU) · Sku Line Item No* (select) ·
Service* (select) · Service Time* (number, 0) · Remark (eg, 10).

**RTO → Use Different Address** — the two radio cards stay, the chosen one outlined brand; then
a 4-col grid of 14 fields: Location Code (eg, Williamstown) · Company Name · Sender Name* ·
Contact Number* (code + tel) / Email · Address Line 1* · Address Line 2 · Address Line 3 /
Landmark · Country* · Postal Code* · Suburb / County / City* · State*. No lat/long, window,
floor or lift.

**Date + time pairs** (Ship From / Ship To) — four equal narrow cells on one row: Start date
("Select Date", calendar icon) · Start time ("Select Time", clock) · End date · End time; the
label sits over the date cell only. Floor Number + "Lift Available ○" (label left of switch)
on the next row.

**Simplified tier** (footer button becomes "Switch to Regular Add Form"; switching tiers resets
the Add More rows):
1. Order — **3 columns**: Merchant* · Order Number* · Consignment Type* / Service Type · Ship By
   Date* · [Start Time* | End Time*] (split one cell) / Tags ⓘ.
2. (untitled card) — left "Ship From": the location (city + ☺ phone) with an edit icon button;
   → arrow; right "Ship To" with an "Add Manually" outline button top-right; Location Code
   select + map-pin icon button; Full Name* (Enter Full Name) · Email (Enter Email) · Phone*
   (code + "Enter phone number"). The edit icon / Add Manually open a modal titled "Ship From" /
   "Ship To": "Search" rule → Location Code select; "Or Enter Manually" rule → Sender|Customer
   Name* · Email · Contact Number(* on Ship To) / Address Line 1* · 2 · 3 / Country* · Postal
   Code · City* · State*; footer Go Back · Confirm & Proceed.
3. Package & SKU — "Provide the package and SKU details for this order." A table: Package ID ·
   Package Type* · Quantity* · Tracking ID · SKU Code · SKU Name, then "Add more SKU" outline +
   trash per row; "Add More Package" outline button below. Empty until Add More Package.
4. Carriers 3 — same well as Regular. No Order Category card in Simplified.
