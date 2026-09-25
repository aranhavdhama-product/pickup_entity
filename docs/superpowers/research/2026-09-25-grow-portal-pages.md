# Grow merchant portal — the pages we still lack (live capture 2026-09-25)

Source: the logged-in live portal `https://grow-staging.fareye.co` (tenant **2GO_PH**, merchant user
"Prashant"), click-navigated only. Nothing was saved, submitted, synced or deleted. Screenshots are in
[`2026-09-25-grow-portal-pages/`](./2026-09-25-grow-portal-pages/) (numbered `01-…jpg` to `24-…jpg`, cited below).

**Reminder (CLAUDE.md):** staging screenshots are a *functionality* reference. Take the data inventory,
the actions and the order of sections from here. Build everything with our shell (`src/local/shell.tsx`),
`src/local/chrome.tsx` list grammar, Nueva `components.tsx` primitives, `StatusPill` tones, design.md
tokens, with brand orange used only as an accent.

---

## 0. What our prototype has today

`src/routes.tsx` mounts only `/grow/orders` (list), `add`, `add/vehicle`, `checkout`, `pickups`,
`pickups/:id` and `:id` under `GrowOrdersLayout`. In `src/pages/GrowOrders/GrowOrdersLayout.tsx` every
other rail item has **no `path`** and the tooltip `title: 'Not part of this prototype'`. None of them has
a route, a page or a "coming soon" placeholder. They are dead rail entries:

| Our rail item | Status | Live counterpart |
|---|---|---|
| Dashboard | dead rail item | `/dashboards/analytics/` |
| Consignment Order | **built** | `/order/` ("Order") |
| Pickup Requests | **built** | `/pickuprequests/` |
| Tracking | dead | `/tracking/` |
| Get Quote | dead (a `RateCalculatorDialog` exists in `rateCalculator.tsx`) | `/rateseta/` (page title "Quotes") |
| Wallet | dead | `/transactions/` (page title "Payments") + `/receipt/` |
| Address Book | dead | `/address/`, `/address/add/`, view page |
| Reports | dead | `/reports/`, `/reports/subscribedReports/` |
| Billing | dead | **not in the live nav** |
| Disputes | dead | **not in the live nav** |
| Settings | dead | `/account-settings/` (5 tabs) |
| Help Center | dead | `/faq/` (not reached, see §11) |

**Live nav order:** Dashboard · Order · Tracking · Get Quote · Wallet · Address Book · Reports ·
Settings · Help Center · Pickup Requests (last, it is a bolt-on). The live portal has **no Billing and no
Disputes**, and **no item that we lack**. The only live-only chrome is in the header: a global
**"Track your consignment"** search at top-left, a person-with-eye icon (probably impersonate / switch
view, not opened), a **bell** (notifications, not opened) and the avatar. Our `ShellHeader` has only the
merchant switcher, so a header consignment search is the one small cross-page gap.

---

## 1. Dashboard — `/dashboards/analytics/` (screenshot 01)

**Purpose:** a one-glance health view of the merchant's shipments over a date range.

**Arrangement, top to bottom:**
1. Filter row: **Select date range** (outlined date-range input, default the last 30 days,
   `26/08/2026 - 25/09/2026`) · **Select store location** (select; options: `All` + the merchant's
   pickup stores. On staging only `All`).
2. **Three KPI tiles** in an equal 3-column row. Each tile has a small icon + label, a big number, and
   a `View >` link underneath:
   - **Pickup Failed** `0` (icon: circle-x)
   - **Schedule Pickup** `0` (calendar icon; meaning INFERRED, not captured: "orders awaiting a pickup booking")
   - **On Time Performance** `0%` (gauge icon + (i) tooltip)
3. **Three chart cards**, 3-column row, same height:
   - **Summary** (i): a bar chart of counts by stage, with the categories **Created · Ready For Pickup ·
     In-Transit**.
   - **Deliveries Completed**: a line chart per day, x = `dd/mm` ticks every 3 days.
   - **On Time Performance**: a line chart per day, same x-axis.
4. A full-width **Help Center** card: "Learn more about delivering better orders" on the left and a
   **See all articles** link (accent) on the right.

**Empty state:** zeros and flat lines. The charts still render their axes.

**Data we have:** all of it can be derived from `useGrowOrders()`: orders (status, `createdAt`,
delivered timestamps), pickup requests (`Pickup Failed` status, `tabs.ts` Overdue). "Schedule Pickup" =
paid orders with no open PR (the Eligible selector we already use). OTP = delivered on or before EDD,
over delivered. Stores for the location filter = `db.stores` / `usePickupLocations`.
**No new store.**

**Design cues:** white cards, thin border, generous padding. KPI tiles are label-over-number with a quiet
link and no coloured fills. Charts are single-series in the accent colour. Mirror this with our `Panel`
cards and `dataviz` rules (one series, brand accent, neutral grid).

---

## 2. Tracking — `/tracking/` (screenshots 02–04)

**Purpose:** "Effortlessly track customer deliveries from order to delivery. Share order details and
status, update pickup dates/times, raise queries, and manage orders." A post-booking shipment list.

**Arrangement:** page title "Tracking Page" + that subtitle → one card:
- **Toolbar (left to right):** Select store location (select, `All`) · **Filters** (funnel: a DataGrid
  panel with a row of *Columns* select (default `Shipment Number`), *Operator* (`equals`, …) and *Value*
  text) · **Date Filter** (a popover with presets **Today · Yesterday · This Week · Last Week · This
  Month · Last Month** on the left, a two-month range calendar, and **Reset** / **Submit**) · refresh
  icon · **Print Label** (disabled until rows are selected) · **Email** (disabled until selected) ·
  **Book Pickup (n)** (outlined accent pill, where n = the selected count) · download icon · search
  (right).
- **Grid:** a checkbox column, then **SHIPMENT NUMBER · CONSIGNMENT NUMBER · ORDER NUMBER · STATUS ·
  STATE · CREATED ON · EDD/ETA · DESTINATION ADDRESS · RATES**. The grid scrolls sideways.
- **Footer:** Rows per page `10` · `0–0 of 0` · prev/next.

**Empty state:** "No results found." centred in the grid (this merchant has no tracked shipments in the
default 30-day window).

**Data we have:** orders (all these columns exist on `GrowOrder` + `shipmentRows.ts`; RATES =
`charges.total` or `quoteForRecord`), pickup-request link for Book Pickup (`BookPickupDialog`), print
label (already a selection action on Consignment Order). **No new store.**
Note the overlap: our Consignment Order page already *is* this list. Build Tracking as the
**post-dispatch view** of the same rows: shipments past Ready To Ship, with the Tracking tab of the
drawer as the row click. Do not build a second grid engine. Reuse `useShipmentColumns` with a
different column set and its own persisted key.

---

## 3. Get Quote — `/rateseta/` (screenshots 05–07)

**Purpose:** "Check the price for the package and create order."

**Arrangement:** page title "Quotes" + subtitle → two columns:
- **Left (main, about 60%)**, stacked cards:
  1. **Where are you sending from?** Shows the default pickup address as an icon + name (`BDO`) + one
     line (`SANPABLO, Philippines, 4000`) + a **pencil** at the right. The pencil swaps the card into an
     inline form: an address picker (`BDO SANPABLO 4000`, clearable) → Name* · Contact Number* (validates
     "Please enter a valid Contact Number") · Email Id ("Used for communication") · Business Name ·
     Country (disabled, Philippines) · Address Line 1* · Address Line 2 · Postal Code* (select) ·
     ☑ **Use as default address** · CANCEL · **Update** (disabled until the form is valid).
  2. Same card, second heading **Whom are you sending to?**: Country* (Philippines) · Postal Code*
     (select; options on staging = 4000, 5000).
  3. **Package Details:** a **Package 1** block with Quantity (default 1) · Weight (kg) · Package
     dimensions* Length × Width × Height (cm) → **+ Add Item** (accent link, right) → footer line
     **Total Weight: 0 kg · Volumetric Weight: 0 kg · Total Quantity: 1**.
- **Right rail (about 40%, sticky card):** a vertical 4-step progress list **1 From** (fills with
  `4000,Philippines`) · **2 To** · **3 Weight and Volume** · **4 Delivery Options**, then the price
  block **Delivery ₱-- · Total ₱-- · ETA --**, then **Get Quote** (primary) and **Create order now**
  (disabled until a quote exists), then the (i) note "Quote is inclusive of freight and fuel charges
  only. GST and any other fees will be displayed at checkout."

**Data we have:** `rates.ts` `quoteLane()` / `quoteService()` (every service with price + ETA),
`VOL_FACTOR`, the pickup-location list (`usePickupLocations`), `packageTypes` masters (presets), and
`RateCalculatorDialog` (the same logic in a dialog). "Create order now" = deep-link into
`/grow/orders/add` with the lane + parcels pre-filled (the `?step=` QA shortcut shows the pattern; add
a draft seed via `grow-order-draft`). **Optional tiny store:** recent quotes (`grow-quotes-v1`) if we
want a "recent" list. The live portal has none.

---

## 4. Wallet → "Payments" — `/transactions/` + `/receipt/` (screenshots 08–10)

**Purpose:** "Manage payments for quicker transactions." A ledger of what the merchant paid per
checkout.

**Arrangement:** page title "Payments" + subtitle → one card: search (right) → grid **REFERENCE ·
CONSIGNMENT NO. · DATE · AMOUNT · REMARKS · TRANSACTION STATUS · ACTIONS**.
- REFERENCE = `DR` + a timestamp id (`DR20251218055829480`), truncated.
- CONSIGNMENT NO. = the first consignment (`2GO00067`) + an accent count badge `3` with the tooltip
  "3 Consignments" when one payment covered several (one checkout = one transaction).
- DATE `dd/mm/yyyy HH:mm` · AMOUNT `₱100.00` · REMARKS `--` · STATUS pill **Success** (soft green).
- ACTIONS ⋮ → **View Receipt** (the only item).
- Row click selects the row ("1 row selected" in the footer). Rows per page 10.

**Receipt page `/receipt/`:** back arrow (left) + download icon (right) → a white receipt card: tenant
logo, `Add:` / `Ph:` lines. On the right: **Receipt Id · Date · ABN Number**. In the centre, a two-column
table **Particulars | Details**: Transaction Status · Reference Number · Transaction Type (`DR` = debit)
· Amount · Payment Mode (`Credit`). Footer line: "If you have any questions about this receipt, visit
the section".

**Live has NO balance, NO top-up and NO credit entries.** It is a payments list, despite the "Wallet"
name.

**Wallet variant — GROW-STAGING tenant (captured 2026-09-25, page text + DOM only, list empty):**
`/transactions/` is titled "Payments" / "Manage payments for quicker transactions" too, but it is a real
wallet: a primary **Recharge** button at the top right, a **Summary** block with **Credits · Debits ·
Balance** (₹0.00 each), search, then the grid **REFERENCE (sortable) · DATE (sortable) · BANK TXN DATE ·
TRANSACTION STATUS · TRANSACTION · DEBIT · CREDIT · BALANCE · REMARKS**, rows per page 10. **Recharge** opens
the modal **"Add Money to Wallet"** / "Enter amount to be added" with a single **₹ Amount** input and a
**Recharge** button that stays disabled until an amount is entered (not submitted; no payment-gateway step
was seen). The owner wants THIS wallet: our `/grow/orders/wallet` has a Wallet tab (balance tiles,
Recharge, the ledger with running balance) and keeps the 2GO_PH payments list as a second tab.

**Data we have:** orders with `paymentStatus: 'Paid'` + `charges` (shipping/tax/total), checkout
groups (orders paid together). **Needs a small local store** `src/growOrders/ledger.ts`
(`grow-wallet-v1`): `{ id: 'DR…', at, orderIds[], amount, currency, mode: 'Credit'|'Prepaid'|'COD',
type: 'DR'|'CR', status: 'Success'|'Failed'|'Pending', remarks }`. Write it from `CheckoutPage`
(`markPaid`) and seed it from paid seed orders. If we show a balance tile (our own addition), derive it
as the sum of CR minus DR. Keep it clearly optional, since live has none.

---

## 5. Address Book — `/address/`, `/address/add/`, view (screenshots 11–13)

**Purpose:** "Manage your delivery addresses here." Saved **receiver** addresses.

**List arrangement:** title "Address book" + subtitle, with **Sync addresses** (outline, sync icon) and
**Add Address ▾** (a split primary button: **Single Address** · **Bulk Upload**) at the right →
one card whose toolbar has, on the left, an **Errors** toggle (shows rows that failed validation), a
**Delete** (disabled until rows are selected) and refresh; on the right, download and search → grid
with a checkbox column, **NAME** (accent link) · **ADDRESS** (one line, truncated) · **EMAIL ID** ·
**CONTACT NUMBER** · **BUSINESS NAME** · **STORE NAME** (`—`) → Rows per page 10.

**Add Address (`/address/add/`, subtitle "Receiver Addresses"):** a full page with a 2-column form:
Name* · Contact Number ("Required for delivery driver") · Email Id ("Used for communication") ·
Business Name · Country (disabled, Philippines) · Address Line 1* · Address Line 2 · Postal Code*
(select: 4000, 5000; error "Postal Code is a required field") · CANCEL · **Save**.

**View Address:** "← View Address" header, **Edit Details** (pencil) at the top right, the same fields
read-only.

**Data we have:** `receiverBook()` / `useReceiverBook()` in `pickupLocations.ts` (the Location Master's
delivery rows + past receivers, deduped), `Party` type. **Needs a small local store**
`src/growOrders/addressBook.ts` (`grow-address-book-v1`): saved `Party` rows + `id`, `storeName?`,
`error?`. `receiverBook` should read it first so the form picks saved addresses. Bulk Upload can reuse
the `bulkCsv.ts` + `bulkUploadDialog.tsx` pattern. Sync = re-read the masters (`loadMasters()`).

---

## 6. Reports — `/reports/`, `/reports/subscribedReports/` (screenshots 14–19)

**Purpose:** "Get summarised information." Asynchronous report jobs plus subscriptions.

**Arrangement:** title "Reports" + subtitle, with **Manage Subscribe Reports** (outline) and
**Generate Report** (primary) at the right. Generate is hidden on the Tracking tab → a tab strip
**Order Report · Transaction Report · Tracking Report** (tab tooltips: "View details of all
transactions", "View details of all tracking reports") with a refresh icon at the right → grid
**REQUESTED BY · CREATED AT · START DATE · END DATE · ACTIONS** (`Download` small primary button) →
Rows per page 100.

**Generate Report dialog (18, 19):** title "Generate Report" / "You can generate and subscribe the
reports", close ⊗. There are two panes:
- **Report Settings (left):** Report Type (`Order` | `Transaction`) · Start Date & Time · End Date &
  Time · toggle **I want to subscribe this report**. When ON, the dates become Start Date + Start Time,
  and it adds **Report Name** · **Frequency** chips (Daily · Weekly · Monthly) · **Ends** radio (Never
  · After · On Specific Date) · **Send To** (recipient emails).
- **Columns (right):** "Choose a template or select columns manually for your Order report" → **Choose
  Template** search · `Recently used` sort · ★ Favorites → **Build manually** card ("Select columns
  without using a template") → empty "No templates yet. Build your first template by selecting columns
  and saving." → a two-list picker **Available Columns** (search, Select all, grouped + collapsible
  with per-group `All`) | **Selected Columns (0)** ("Select columns from the left panel").
- Footer: Cancel · **Generate** (it becomes **Subscribe** when the toggle is on).

**Order-report column universe (verbatim groups):**
- *Order info:* Consignment Number, Order Number, Tracking Number, Store ID, Created At, Updated At,
  Status, Product, Order Type, Shipment Type, Shipping Method, Carrier Code, Shipper Code, Additional
  Services, Payment Mode, COD Amount, Order Amount, Oversized Consignment, Oversize Charges, Insurance,
  Authority To Leave, POD Collection, Special Instructions, Declared Currency
- *Parcel Dimensions:* Package ID, Quantity, Length, Breadth, Height, Weight, Volume, Volumetric Factor
- *SKU:* SKU Code, SKU Name, SKU Quantity, SKU HSN Name, SKU Unit Price, SKU Origin Country
- *Sender:* Sender Address Type, Name, Company Name, Contact Number, Email, Address Line 1/2, Landmark,
  Locality, City, State, Pincode, Country, Latitude, Longitude, Port, Port Name, Port Contact Person,
  Port Contact Number, Port Address, Sender Hub, Sender ID, Sender Address ID, Pickup PUDO Store Number
- *Customer:* the same set prefixed "Customer" (+ Contact, Customer Hub, Address ID)
- *Return Address:* Type, Full Name, Phone, Address Line 1/2, Landmark, City, State, Suburb, Email,
  Country, Postcode, Company Name, PUDO Store Number, Latitude, Longitude, Port
- *Merchant:* Merchant Name, Merchant Account Number, Created By Email, Created By Name, GST Number

**Subscribed Reports page:** "← Subscribed Reports" / "Here you can manage and update reports" → grid
**REPORT NAME · CREATED BY · CREATED ON · FOR · FREQUENCY**. Empty = "No results found."

**Data we have:** orders + PRs + ledger give every row. Download = a client-side CSV via the existing
`bulkCsv.ts` helpers. **Needs a small local store** `src/growOrders/reports.ts` (`grow-reports-v1`):
`jobs[] { id, type: 'Order'|'Transaction'|'Tracking', requestedBy, createdAt, start, end, columns[] }`,
`subscriptions[] { id, name, type, frequency, ends, sendTo[], columns[], createdBy, createdOn }`,
`templates[]`. A job is "ready" at once, since we generate it locally.

---

## 7. Settings — `/account-settings/` (screenshots 20–24)

**Purpose:** "Seamlessly configure your account for better experience."

**Tabs:** **Account · Saved Packages · User Management · Email · Store Front Integration**. The last
three were **not captured** (§11).

**Account tab (20), in a 2-column layout:**
- Left column, stacked cards, each with a ⋮ menu:
  - **Personal Information** (⋮ → Edit · Disable Account (disabled)): Name · Email · Contact No ·
    Notifications Preference (☑ Email ☑ Browser) · 2-Step Authentication (Disabled). *Edit* replaces
    the tab body with "← Update your personal details here": Name · Email (read-only) · Contact
    Number (validates "Phone number is not valid for country Philippines") · Notifications Preference
    checkboxes · 2-Step Authentication toggle · **Update** (21).
  - **Business Information** (⋮ → Edit): Business Name · Trading Name · ABN Number · Projected Volume
    per Week (`101-250 Consignments`) · Merchant Account Number · Email · Account Type (`Individual`) ·
    Payment Type (`Postpaid`) · Billing address · Country. *Edit* ("← Update your Business details
    here"): Business Name · Trading Name · ABN Number · Email Id · Country (disabled) · Address Line 1*
    · Address Line 2 · Postal Code* · Update (22).
- Right column, one card **Pickup Address** with **Sync pickup address** (outline) + search in its
  header, and a card grid: a dashed **+ Add New Address** tile, then one card per pickup address (name
  + soft-green **Default** chip + ⋮, the address line, a divider, then bullet email / phone). The
  default card has a green border.

**Saved Packages tab (23, 24):** "Create and manage your standard packages here" / "Use the 'Save
Package' feature to store commonly used package details." → search + **Add New Package** (right) →
grid **NAME · PACKAGE WEIGHT · PACKAGE DIMENSIONS · ACTIONS** (⋮ → Edit · Remove); for example
`Flyer · 1 kg · 10cm X 10cm X 10cm`. **Add Saved Package:** "← Add Saved Package" / "Enter the details
to be used as your package." → **Package Details:** `1.` Item Information → Weight (kg) · Package
dimensions* L × W × H (cm) → Total Weight / Volumetric Weight / Total Quantity line → **Add**
(disabled until valid).

**Data we have:** merchant identity = `useMasters().merchants` + `currentMerchant()` (name, code);
pickup addresses = `db.stores` + `usePickupLocations` + `growOrderActions.addStore()` (there is **no
update/remove/setDefault** yet); package presets = `masters.packageTypes`. **Needs a small local store**
`src/growOrders/merchantSettings.ts` (`grow-merchant-settings-v1`, keyed by merchant code): personal
fields, notification prefs, 2FA flag, business fields, default store code, and saved packages (merged
into the form's package presets). Do NOT write stores into `store.ts` from this batch. Keep the default
pickup code here, and let `pickupLocations.ts` read it later.

---

## 8. Billing — no live page on 2GO_PH (GROW-STAGING has `/invoice/`, see §9)

Neither the live nav nor any link has Billing. **Our own addition**, so keep it small and derived:
monthly **invoices** (one per calendar month per merchant) from paid orders' `charges` (shipping, tax,
total), a status (Paid for prepaid, Due for postpaid, since Settings shows `Payment Type: Postpaid`),
and a detail page listing the orders. Data = orders + ledger. There is no store beyond the ledger, and
invoices are derived.

## 9. Disputes — LIVE on the GROW-STAGING tenant (captured 2026-09-25, second pass)

Correction: the 2GO_PH merchant has no Disputes, but the owner's session on the **GROW-STAGING** tenant
(same host, different tenant) has a **Disputes** rail group with three sub-pages, and also a live
**Billing → Invoices** page and a wallet-style Payments page. Captured by click-navigation and page text
only (screenshot `25-disputes-invoice.jpg`; further screenshots of the owner's tab were refused by the
permission classifier, so the rest is text). Every list was EMPTY for this merchant, so no dispute
detail, no thread and no raise form could be opened.

**Rail:** Disputes ▾ → **Transaction Dispute** (`/disputes/transactionDispute/`) · **Tracking Dispute**
(`/disputes/trackingDispute/`) · **Invoices Dispute** (`/disputes/invoicedispute/`).

| Page | Title / subtitle | Tabs | Toolbar | Columns |
|---|---|---|---|---|
| Transaction Dispute | "Wallet Dispute" / "Raise Wallet Transaction Disputes" | Open · Closed | search | DISPUTE REFERENCE NUMBER · TRANSACTION REFERENCE NUMBER · CONSIGNMENT NUMBER · DISPUTE RAISED DATE · CURRENT STATUS (rows/page 10) |
| Tracking Dispute | "Manage Queries" / "Check status of queries raised and responses from customer service team" | Open · Closed | Filters (funnel, count) · Date Filter · **Validate Address** · **Close Disputes** | ORDER QUERY NUMBER · SHIPMENT NUMBER · ORDER NUMBER · QUERY RAISED DATE · CATEGORY · CURRENT STATUS · PRIORITY · UPDATED AT (rows/page 100) |
| Invoices Dispute | "Invoice Dispute" / "Raise Invoice Disputes" | Open · Closed | search | DISPUTE REFERENCE NUMBER · INVOICE NUMBER · AMOUNT · DISPUTE AMOUNT · DISPUTE RAISED DATE · CURRENT STATUS (rows/page 100) |

**Where disputes are RAISED (inferred from the entry points, forms not reachable with no data):**
- Invoice dispute: Billing → **Invoices** (`/invoice/`, "View details of all invoices"): Filters · Date Filter
  (default last 90 days) · **Download Invoice** · **Raise a query** (does nothing with no row selected);
  columns INVOICE NUMBER · INVOICE DATE · TRANSACTION NUMBER · CONSIGNMENT NUMBER · AMOUNT · MERCHANT BUSINESS
  NAME · **DISPUTE RAISED** · **STATUS OF DISPUTE**.
- Tracking dispute ("query"): the Tracking page's subtitle — "raise queries" — so from a tracked shipment.
- Wallet dispute: from a Payments transaction. On this tenant Payments is a real wallet: **Recharge**, a
  Summary (Credits · Debits · Balance) and columns REFERENCE · DATE · BANK TXN DATE · TRANSACTION STATUS ·
  TRANSACTION · DEBIT · CREDIT · BALANCE · REMARKS.

**Not captured:** the raise forms' fields, the category / priority vocabularies, status values beyond the
Open/Closed split, the detail/thread view, Validate Address and Close Disputes dialogs.

**Built as (ours):** `/grow/orders/disputes` with a three-way kind switch (Transaction · Tracking · Invoice)
+ Open/Closed tabs, each kind with its live column set; raise from a payment (Wallet row ⋮), a consignment
(the drawer's `RaiseDisputeButton`) or an invoice (Billing detail); category/priority/status vocabularies and
the detail timeline are OURS until captured. Store `growOrders/disputes.ts`.

## 10. Help Center — `/faq/`

Not reached (§11). The Dashboard links it as "Learn more about delivering better orders · See all
articles". Build it as a static FAQ: category chips, an accordion of Q&A (Nueva `Accordion`) and a
search. The content is local constants, with no store.

## 11. Could not reach

Partway through Settings, the extension lost access to the live tab. Chrome reported "blocked the
extension from accessing this page", and the tab id changed from 200077712 to 200077867, still on
`/account-settings/`. So these were **not captured**: Settings → **User Management**, **Email**,
**Store Front Integration**; **Help Center** (`/faq/`); the pickup-address card ⋮ menu and the
**+ Add New Address** form; Address Book **Bulk Upload**; the header **bell** and **person-eye**
icons; the **Order** page (already built, so it was skipped deliberately). The Tracking and Dashboard
grids were empty for this merchant, so no Tracking record was opened. The tab could not be returned to
Pickup Requests.

---

## 12. Design cues to mirror (arrangement only, in our tokens)

- Page head = title + one-line grey subtitle, with primary/outline actions at the right. That is our
  `PageHeader` with actions.
- Content = white cards on a light canvas, one card per concern. A list page is **one card holding
  toolbar + grid + footer pagination**, which is our `LocalPage` + `FilterLine` + `DataTable` +
  `Pagination`.
- KPI tiles: label with a small icon, big number, quiet `View >` link, no colour fills.
- Status = soft-tinted pill (Success green, Default green) → `StatusPill` success/neutral.
- Counts as a small round accent badge next to a value ("3 Consignments") → reuse the `+n` badge
  styling we already use for PR overages.
- Split button `Add Address ▾` → our Add ▾ menu pattern on Consignment Order.
- Forms: a 2-column label-above grid with helper text under fields. On our side, use the SectionCard
  4-column grid, asterisks and no eager errors (CLAUDE.md form rule; staging shows eager errors, we
  don't).
- Edit is its own view with a "←" back header. That matches our "row click = view, Edit = own page"
  rule.
- Row actions = ⋮ menu (View Receipt / Edit / Remove).

---

## 13. Build plan

Every page mounts inside `GrowOrdersLayout` under `/grow/orders/*`. The wiring (rail `path`s, `TITLES`,
`LIST_PAGES`, the `routes.tsx` entries) is done **once by the orchestrator** before or after the
batches, so neither batch touches `GrowOrdersLayout.tsx` or `src/routes.tsx`. Each batch exports page
components under the agreed names below. Proposed routes use a `/grow/orders/<page>` prefix; reserve
each literal ahead of `:id` exactly as `pickups` is today.

### Batch A: read-mostly analytics & tools

- **Dashboard** `/grow/orders/dashboard` → `GrowDashboardPage` (`pages/GrowOrders/DashboardPage.tsx`).
  Filter row (DateRange + store `FilterSelect`) → 3 KPI tiles (Pickup Failed, Schedule Pickup =
  eligible count, OTP %) whose View links go to the filtered PR list / Eligible / Tracking → 3 chart
  cards (stage bar, deliveries/day line, OTP/day line) → Help Center card. Data: `useGrowOrders()`
  selectors. There are no writes.
- **Tracking** `/grow/orders/tracking` → `GrowTrackingPage` (`TrackingPage.tsx`). The FilterLine (store
  · date presets · funnel) plus search, ⚙ and download → the DataTable with the 9 live columns, from
  `shipmentRows` + a new column set (`grow-tracking-columns-v1`); selection actions Print Label · Email
  (toast) · Book Pickup (n) → `BookPickupDialog`. Row click → the existing drawer, opened on its
  Tracking section.
- **Get Quote** `/grow/orders/quote` → `GrowQuotePage` (`QuotePage.tsx`). Left: From card (default
  store + change) → To card (country, postal/city) → Package Details (repeatable parcels, totals line);
  right sticky rail: 4-step progress, the service list from `quoteLane()` with price + ETA, **Get
  Quote**, then **Create order now** → `/grow/orders/add` pre-filled via `grow-order-draft`. Reuse
  `rateCalculator.tsx` internals and do not fork `rates.ts`.
- **Reports** `/grow/orders/reports` (+ `/reports/subscriptions`) → `GrowReportsPage`,
  `GrowSubscribedReportsPage`. `LocalTabs` Order · Transaction · Tracking → a jobs grid with Download
  (a CSV of the chosen columns) → the Generate Report `Modal` (settings pane + two-list column picker;
  subscribe toggle → name/frequency/ends/send-to). New store `src/growOrders/reports.ts`. Transaction
  rows read orders' `charges` only (not the ledger), so this batch does not depend on Batch B.
- **Help Center** `/grow/orders/help` → `GrowHelpPage` (`HelpCenterPage.tsx` + `helpArticles.ts`).
  Search + category chips + `Accordion` FAQ.

New files only: `DashboardPage.tsx`, `TrackingPage.tsx`, `QuotePage.tsx`, `ReportsPage.tsx`,
`HelpCenterPage.tsx`, `helpArticles.ts`, `src/growOrders/reports.ts`.

### Batch B: money & account

- **Wallet / Payments** `/grow/orders/wallet` (+ `/wallet/:id` receipt) → `GrowWalletPage`,
  `GrowReceiptPage`. Search + grid (Reference, Consignment No. + `n` badge, Date, Amount, Remarks,
  Status pill, ⋮ View Receipt); the receipt card has Download (window.print). New store
  `src/growOrders/ledger.ts`, seeded from paid orders. *Hook-up of the CheckoutPage write
  (`ledger.record(...)`) is the orchestrator's one-line follow-up, so `CheckoutPage.tsx` stays
  untouched here.*
- **Billing** `/grow/orders/billing` (+ `/billing/:month`) → `GrowBillingPage`. KPI tiles (Due · Paid
  this month · Last invoice) → an invoice grid by month (period, orders, shipping, tax, total, status) →
  a detail page listing the orders. Derived from orders + ledger.
- **Disputes** `/grow/orders/disputes` (+ `/disputes/:id`, `/disputes/new?order=`) →
  `GrowDisputesPage`. FilterLine (status, type) → grid (ID, consignment, type, claimed, status,
  raised) → view page with a timeline + an ops-reply placeholder; the raise form = SectionCard. New
  store `src/growOrders/disputes.ts`.
- **Address Book** `/grow/orders/address-book` (+ `/add`, `/:id`, `/:id/edit`) →
  `GrowAddressBookPage`, `GrowAddressFormPage`, `GrowAddressViewPage`. Toolbar (Errors toggle, Delete
  on selection, search, download, Sync = `loadMasters()`, Add ▾ Single / Bulk Upload) → a grid of the
  6 live columns; the list shows saved rows + `receiverBook` rows (tagged by source). New store
  `src/growOrders/addressBook.ts`.
- **Settings** `/grow/orders/settings?tab=account|packages|users|email|storefront` →
  `GrowSettingsPage`. Account: Personal + Business cards (view/Edit sub-views) + the Pickup Address
  card grid (add = `growOrderActions.addStore`; default = a settings value). Saved Packages: grid +
  add/edit/remove page. Users / Email / Storefront: a minimal placeholder `EmptyState` until captured.
  New store `src/growOrders/merchantSettings.ts`.

New files only: `WalletPage.tsx`, `ReceiptPage.tsx`, `BillingPage.tsx`, `DisputesPage.tsx`,
`AddressBookPage.tsx`, `SettingsPage.tsx` (+ sub-files), `src/growOrders/ledger.ts`, `disputes.ts`,
`addressBook.ts`, `merchantSettings.ts`.

**Orchestrator PRE-STEP (before both batches):** add a `KpiTile` primitive (icon + label, big value,
optional `View >` link) to `src/nueva/components.tsx`. Dashboard (A) and Billing (B) both use it, and
CLAUDE.md requires a repeated pattern to be extracted first. Without this step both batches would edit
`components.tsx` at the same time. Neither batch edits `components.tsx`.

**Batch A owns `src/pages/GrowOrders/GrowConsignmentView.tsx`** if Tracking's "open the drawer on its
Tracking section" needs a new `initialSection` prop. Batch B never touches that file.

**Shared-file follow-ups, done by the orchestrator after both batches:** rail paths + `TITLES` +
`LIST_PAGES` in `GrowOrdersLayout.tsx`, **and the `orderView` regex there**. Today it treats ANY single
segment under `/grow/orders/` other than add/checkout/pickups as an order id. So `dashboard`,
`tracking`, `quote`, `wallet`, `billing`, `disputes`, `address-book`, `settings` and `help` would get
the order-view chrome, and `routeOf` would fall back to the "Consignment Order" title. The regex must
exclude every new literal. the routes in `src/routes.tsx` (literals before `:id`); the
ledger write in `CheckoutPage.tsx`; `receiverBook` reading `addressBook.ts`; saved packages merged
into the form presets; a Dispute entry on the consignment drawer; optionally a header "Track your
consignment" search in `ShellHeader`'s `right` slot; the CLAUDE.md Grow section update.
