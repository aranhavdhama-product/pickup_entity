# FarEye Grow — merchant portal reference (grow-staging.fareye.co)

Captured live 2026-09-17 (tenants 2GO_PH / NAMLOG) while building the `/grow/orders` replica
(`src/pages/GrowOrders`). Grow is a **Next.js + Material-UI (Materio template)** app, separate
from the console: its API lives under `/api/tenant/v1/*`, auth is the merchant login (Email +
Password + reCAPTCHA, `/login/`), and a hard URL navigation reloads the SPA (it survived, but
tabs reopened out-of-band came back as dead documents — click-navigate to be safe).

Design tokens are computed-style facts, not guesses: no CSS custom properties exist (MUI v5 +
Emotion compiles the theme to literals); canvas `#F4F5FA`; drawer 260px `#28243D`, nav rows
42px with `border-radius 0 100px 100px 0`, active = flat coral `#FF705E` gradient + shadow;
text `rgba(58,53,65,.87/.68/.38)`; cards white, `1px solid #E6E7EC`, radius 6, no shadow;
DataGrid header `#F9FAFC` 54px, titles 12px/600 uppercase 0.17px, rows 50px, cells 14px pad
16px, footer `1px solid #E7E6E8`; inputs 40px radius 6 outline `rgba(0,0,0,.23)`; status chip
11px/600 pill 24px; Lato loaded at 400 only (heavier weights are synthesised); text actions
(`Filters`) use a second, crimson accent `#C22E49`. Palette: success `#56CA00`, error `#FF4C51`,
warning `#FFB400`, info `#16B1FF`, Materio primary `#9155FD` (unused for chrome).

---

# Orders list (crawler inventory)

# Grow merchant portal — Orders list (`/order/`)

**Tenant captured:** `2GO_PH`. **Completeness:** PARTIAL — Filters panel contents, the order
VIEW page and the enabled state of the bulk actions were NOT reached (see bottom).

---

## 1. Page header

| Element | Verbatim |
|---|---|
| Title | `Orders` |
| Subtitle | `Effortlessly create and manage orders. Schedule pick-up, pay via multiple options & print labels` |
| Primary action (top-right) | split button `Add Order` + `▾` |

`▾` opens a menu with exactly two items: `Single Order`, `Bulk Upload`.

---

## 2. Toolbar

One white card holds the toolbar and the grid. The toolbar is **two rows**:

**Row 1 (left → right)**

| Control | Type | State observed | Enabled by |
|---|---|---|---|
| `Filters` | text button with a funnel icon; a small **badge showing `0`** sits above it (active-filter count) | enabled | always |
| `Select store location` | outlined **select**, notched label `Select store location`, value `All` | enabled | always — options not enumerated |
| `Errors` | label + **toggle switch**, off | enabled | always; filters the grid to rows flagged with the error icon |
| `Prepare for Pickup` | icon + text button | **disabled / greyed** | row selection (checkbox) |
| `Email` | icon + text button (paper-plane) | **disabled / greyed** | row selection |
| `View Rates` | icon + text button | **disabled / greyed** | row selection |
| `Delete` | icon + text button (trash) | **disabled / greyed** | row selection |
| refresh | coral circular-arrows **icon button** | enabled | always — re-fires `getShipments` |

**Row 2 (left → right)**

| Control | Type | Notes |
|---|---|---|
| download / export | tray-with-down-arrow **icon button** | left-aligned under `Filters` |
| `Search...` | outlined search input with leading magnifier and a trailing **✕** clear button | placeholder `Search...` |

> The four greyed actions are the classic "select rows first" pattern: the grid's first
> column is a checkbox column (`data-field="__check__"`), so ticking a row is what lights
> them up. **This was not verified** — the list had gone empty before the check could be made.

---

## 3. Grid (MUI X DataGrid)

12 columns, in DOM order, with the **real `data-field` names** and the rendered widths at a
1440px viewport (content area 1180px):

| # | `data-field` | Header text in DOM | Rendered header | Width |
|---|---|---|---|---|
| 1 | `__check__` | — | selection checkbox | 58px |
| 2 | `invalid` | — | error/warning icon (sortable) | 60px |
| 3 | `orderNumber` | `Order Number` | `ORDER NUMBER` | 139px |
| 4 | `order_type` | `Order Type` | `ORDER TYPE` | 100px |
| 5 | `createdAt` | `Created On` | `CREATED ON` | 100px |
| 6 | `customerName` | `Name` | `NAME` | 139px |
| 7 | `customerContactNumber` | `Contact Number` | `CONTACT NUMBER` | 140px |
| 8 | `customerCompanyName` | `Business Name` | `BUSINESS NAME` | 139px |
| 9 | `shippingMethod` | `Type` | `TYPE` | 99px |
| 10 | `statusCategory` | `Status` | `STATUS` | 119px |
| 11 | `receiverAddress` | **`ADDRESS`** | `ADDRESS` | 149px |
| 12 | `shipmentCount` | **`NO. OF ITEMS`** | `NO. OF ITEMS` | 139px |

**Casing inconsistency worth replicating deliberately or fixing:** headers 3–10 are stored
in the DOM in Title Case and rendered uppercase by CSS `text-transform`, but headers 11 and
12 are **literally uppercase in the source string** (`ADDRESS`, `NO. OF ITEMS`). Visually
identical, but a developer copying the column config will inherit the inconsistency.

All data columns are `MuiDataGrid-columnHeader--sortable`; the checkbox column is
`--alignCenter`.

### Sample rows (verbatim, first 4 of 9)

| Order Number | Order Type | Created On | Name | Contact Number | Business Name | Type | Status | Address | No. of items | error icon |
|---|---|---|---|---|---|---|---|---|---|---|
| `7PP5ZK7PPG68` | Forward Order | 16/02/2026 | Pooja Chandra | 8208462191 | — | Parcel | Order Created | `5000, ILOILO, Philippines, 500…` | 1 | ● yes |
| `ZFH2Q8ZFGRTS` | Forward Order | 16/02/2026 | Pooja Chandra | 8208462191 | — | Parcel | Order Created | `5000, Diversion Rd, Mandurriao…` | 1 | ● yes |
| `OMXH4GOMY1LS` | Forward Order | 16/02/2026 | Pooja Chandra | 8208462191 | — | Parcel | Order Created | `5000, Diversion Rd, Mandurriao…` | 1 | ● yes |
| `25X7RK25XI0G` | Forward Order | 16/02/2026 | Pooja Chandra | 8879818300 | `Test1` | Parcel | Order Created | `5000, Diversion Rd, Mandurriao…` | 1 | ● yes |
| `SB9DLCSB9OO0` | Forward Order | 29/09/2025 | avi | 12345690 | — | Parcel | Order Created | `5000, ILOILO, Philippines` | 1 | no |

Remaining order numbers: `SHPLC0SHPUHC` (2 items), `1X2KQ81X2S5S`, `7ZSIY87ZT1LS`,
`N3A4A8N3A5TC`.

### Row-level affordances

- **Error icon** — column 2, a red/coral circled `!` shown only on rows whose payload failed
  validation (4 of 9 rows). Column is sortable, and the `Errors` toolbar toggle filters on it.
- **Order number is a coral text link** — the only linked cell; it opens the order view.
- Dates are `DD/MM/YYYY`.
- `Order Type` values seen: `Forward Order` only.
- `Type` (shippingMethod) values seen: `Parcel` only.
- `Address` is truncated with an ellipsis at the cell edge.

### Status chip

Only one label observed: **`Order Created`** — a pill with a soft green tint, green text,
rendered small-caps-ish at chip size inside the `statusCategory` cell. (Exact chip
background/colour tokens were not captured before the list route was lost — see
`design-tokens.json` gap list.)

---

## 4. Pagination footer

Bottom-right of the card, one line:

```
Rows per page:  [10 ▾]        1–9 of 9        ‹   ›
```

- `Rows per page:` label + a small borderless select showing `10`.
- Range text `1–9 of 9` (en-dash).
- Previous / next chevron icon buttons, **both disabled** in this capture (single page).

---

## 5. Empty state

When the merchant has no orders the whole grid is replaced (toolbar hidden too) by a
centred illustration (`/images/misc/noOrders.png` — a person with a clipboard and parcels)
above two centred lines of muted text:

```
Easily create, manage, and schedule pick-ups with zero hassle, revolutionizing your order
management game.

Add an order now!
```

Screenshot evidence: see transcript; the illustration URL is confirmed from the network log.

---

## 6. NOT captured

| Item | Why |
|---|---|
| `Filters` panel — fields + options | never opened; browser session was taken over before the click |
| `Select store location` options | never opened |
| Order **VIEW** page (sections, fields, actions) | never opened |
| Enabled-state styling of the 4 bulk actions | row checkbox never ticked |
| Row hover background | state style, needs a stylesheet scan that was not reached |

Blocker detail: the assigned tab was hard-reloaded out-of-band into a dead document
(`#__next` empty, `__NEXT_DATA__` null) and the only live logged-in tab belonged to another
agent mid-order-creation, so it was not driven.

## Screenshots

- `screenshots/01-orders-list-2GO_PH.jpg` — full Orders list with 9 rows, toolbar and
  pagination.

---

## 7. Cross-page confirmation of the toolbar grammar

Read live from the sibling **Tracking** page (`/tracking/`), whose toolbar uses the identical
pattern — useful confirmation that this is the portal's shared list grammar, not a one-off:

`[0 Filters]  [Date Filter]  [icon]  [Print Label — disabled]  [Email — disabled]  [Book Pickup (0)]  …icon buttons…  [‹ disabled] [› disabled]`

So the convention is: a **count badge rendered on the Filters control**, one or two visible
filter controls, then bulk actions that stay **disabled until rows are selected**, then icon
actions, then the paginator. The count-in-parentheses form (`Book Pickup (0)`) is an
alternative to the badge.

Token for that badge chip: `background rgb(255,112,94)`, white label `13px / 700`,
`padding 0 8px`, `height 24px`.

---

# Create Order (crawler inventory — steps 2/3 were completed from the user's screenshots: Parcel Details = Authority to leave (Leave at the door / EPOD necessary), Delivery Instructions (150 chars), Package Details per package = Cargo Type*, Item Information, Quantity, Weight kg → Dead Weight, L×W×H cm → Volumetric Weight (factor 3500), + Add Item, totals line, Secure your package, Dangerous-goods declaration, Back / View Summary; Order Summary = rate card (Standard Delivery, Delivery by 2 DAY, ₱ 90.00) + rail From/To/Parcel Size/Delivery Option with Edit, Delivery/Total/ETA, Proceed, Save for Later → /order/checkout/)

# Grow merchant portal — Add Order / "Create Order"

**Route:** `/order/add/` (reached by clicking **Add Order → Single Order**; never by URL)
**Completeness:** PARTIAL — see "Coverage & why" at the bottom. Step 1 documented from live
captures; Step 3 documented from a live capture of a different merchant (NAMLOG); Step 2
(Parcel Details) NOT inspected.

---

## 1. Entry point — the "Add Order" split button

On the Orders list, top-right of the page header, there is a **split button**:

| part | behaviour |
|---|---|
| main label **`Add Order`** | primary coral button |
| trailing **▾ arrow** segment | opens an MUI Menu (popover) |

Menu options (verbatim, in order, captured live):

1. `Single Order` → navigates to `/order/add/`
2. `Bulk Upload`

Menu paper computed style: `background #fff`, `border-radius 5px`,
`box-shadow rgba(58,53,65,.2) 0 5px 5px -3px, rgba(58,53,65,.14) 0 8px 10px 1px, rgba(58,53,65,.12) 0 3px 14px 2px`,
`padding 0`. Menu item: `height 36px`, `padding 6px 16px`, `font-size 16px / weight 400`,
`color rgba(58,53,65,.87)`.

---

## 2. Page shell

- **Page title:** `Create Order`
- **Subtitle (verbatim):** `Create an order to be shipped`
- **Layout:** it is **NOT one page and NOT tabs — it is a 3-step horizontal MUI Stepper**
  rendered full width directly under the subtitle, with connector lines between steps.

### Stepper steps (verbatim, in order)

| # | Label | Step-icon state observed |
|---|---|---|
| 1 | `Sender & Receiver Address` | active = filled coral circle with `1`; completed = coral check circle |
| 2 | `Parcel Details` | inactive = grey circle with `2`; completed = coral check circle |
| 3 | `Order Summary` | inactive = grey circle with `3`; active = filled coral circle with `3` |

The step number/label sits to the right of the circle; connectors are thin grey rules.
Completed steps show a filled circle with a white tick (coral `#FF705E` family).

---

## 3. Step 1 — Sender & Receiver Address

Step 1 is a single white card (`Panel`) holding **two stacked sections**. Fields are laid out
in a **2-column grid** (left column / right column), full-width rows for the address-book
search. All inputs are MUI **outlined** text fields with a floating/notched label; the label
sits inside the border when empty (as placeholder-style text) and rides up into the notch
when filled.

### 3a. Section: `Where are you sending from?`

Header row: section title on the left; on the right the text `Save:` followed by a **toggle
switch** (MUI Switch, off by default) — i.e. "save this pickup address to the address book".

**Empty / expanded state fields** (observed with an empty sender):

| # | Label (verbatim) | Type | Required marker | Notes |
|---|---|---|---|---|
| 1 | `Search from pickup addresses by name, number, address and company name...` | Autocomplete (full-width, with a clear **✕** at the right edge) | no | placeholder text = the label; typing fires the address search API |
| 2 | `Name*` | text | `*` in label | left column |
| 3 | `Contact Number` | text | none shown in sender block | right column |
| 4 | `Email Id` | text | no | left column; helper text under field: `Used for communication` |
| 5 | `Business Name` | text | no | right column |
| 6 | `Country` | text, **read-only/disabled look** (greyed value), notched label already floated | no | value pre-filled from tenant, e.g. `Philippines` (2GO_PH) / `South Africa` (NAMLOG) |
| 7 | `Address Line 1*` | text | `*` | left column |
| 8 | `Address Line 2` | text | no | right column |
| 9 | `Postal Code *` | **select / autocomplete** (has a ▾ caret) | `*` (note the space before `*`) | fed by `serviceableareas/search?key=postcode&country=<tenant country>` |

(Fields below `Postal Code *` were below the fold and are not confirmed; by symmetry with
the receiver block and the serviceable-area API they are expected to be City / State /
Suburb-style fields derived from the postal code, but this is **not verified**.)

**Filled / collapsed state:** once a sender is chosen the whole section collapses into a
one-line summary card inside a rounded outline box:

```
[paper-plane icon]  Pooja Chandra
                    SANPABLO, Philippines, 4000, Philippines, 4000, Philippines, 4000      [✎ pencil, coral, right-aligned]
```

i.e. bold name on line 1, comma-joined address on line 2 in muted text, and a coral pencil
**edit** icon at the far right of the row.

### 3b. Section: `Who are you sending it to? (Receiver's Address)`

Same grid and same control set as the sender block, with these differences:

| # | Label (verbatim) | Type | Required | Helper text |
|---|---|---|---|---|
| 1 | `Search from address book by name, number, address and company name...` | Autocomplete, full width | no | — |
| 2 | `Name*` | text | `*` | — |
| 3 | `Contact Number` | text | (no asterisk) | **`Required for delivery driver`** |
| 4 | `Email Id` | text | no | **`Used for communication`** |
| 5 | `Business Name` | text | no | — |
| 6 | `Country` | text, read-only/greyed | no | value from tenant (`South Africa` on NAMLOG) |
| 7 | `Address Line 1*` | text | `*` | — |
| 8 | `Address Line 2` | text | no | — |

Sample filled values seen: `Aranhav` / `940616088` / `aranhavsingh9@gmail.com`.

The receiver block also carries a `Save:` toggle in its header in the same position as the
sender block (same pattern), and the step is closed by a **`Next`** button (bottom right of
the card). No `Back` on step 1.

---

## 4. Step 2 — `Parcel Details`

**NOT INSPECTED.** What is known indirectly:

- Its output is summarised on step 3 as *"Parcel Size — 1 items [Dead Weight: 1.2500 kg,
  Vol: 0.1880 kg, Total Value: 0.00]"* and, expanded, *"Parcel 1: Box ,Quantity: 1 /
  Dead Weight: 1.25 kg / Volumetric Weight: 0.188 kg"*.
- So it collects, per parcel: **packaging type** (e.g. `Box`, fed by
  `GET /api/tenant/v1/packages`), **quantity**, **dead weight (kg)**, **dimensions** (from
  which *volumetric weight* is derived — there **is an inline calculator**: the app calls
  `GET /api/tenant/v1/shipments/getVolumetricFactor` and shows both Dead Weight and
  Volumetric Weight), **item count** and **total value**. Parcels are repeatable
  (`Parcel 1: …`).

---

## 5. Step 3 — `Order Summary`

Two-column layout inside the step:

### Left column — rate selection, heading `How do you want to send your parcel?`

A selectable **rate card** (radio-style, coral border + coral radio when selected):

```
( • ) Standard
      ⚡ Delivery by September 17 2026                    [📷 icon]  ZAR 0.00
      ┌────────────────────────────────────────────────────────────┐
      │ ⓘ  Book the order by 8:00 PM today.                        │  (light blue info strip)
      └────────────────────────────────────────────────────────────┘
```

- Service name (bold), an ETA line with a lightning glyph (`Delivery by <date>`), the price
  right-aligned in tenant currency (`ZAR 0.00`), and a full-width pale-blue info strip with
  a cut-off/booking deadline message.
- Rates come from `rates` / `rates/calculate` / `rates/eta`.

### Right column — heading `Order Summary` (a sticky rail)

Stacked summary blocks, each with a green ✓ check bullet, a bold caption, the value text,
and a coral **`Edit`** link right-aligned:

| Block | Content shown |
|---|---|
| `From` | `NamlogMP, 54 Road No 5, Brentwood Park, Benoni, Gauteng, 1501 Johannesburg, South Africa, Brentwood Park, JOHANNESBURG, Gauteng, South Africa, 2000` — `Edit` |
| `To` | `Vikash Mishra, 86 Bonneville Rd 1509 , Norton Estates, Benoni, , South Africa, Bonneville, JOHANNESBURG, Gauteng, South Africa, 1509` — `Edit` |
| `Parcel Size` | `1 items [Dead Weight: 1.2500 kg, Vol: 0.1880 kg, Total Value: 0.00]` + an expand ▾ caret revealing `Parcel 1: Box ,Quantity: 1 / Dead Weight: 1.25 kg / Volumetric Weight: 0.188 kg` — `Edit` |

Below the fold this rail continues into the payable amount / place-order action.
**The flow then leaves `/order/add/` for a separate route `/order/checkout/`** — i.e. the
terminal create/pay action lives on the checkout page, not on the wizard.

---

## 6. Buttons

| Label | Where | Notes |
|---|---|---|
| `Next` | bottom-right of each step card | advances the stepper; safe (creates nothing) |
| `Back` | bottom-left from step 2 onward (expected) | not directly observed |
| `Edit` | per summary block on step 3 | coral text link, jumps back to that step |
| final create/pay action | on `/order/checkout/` | **NOT clicked, NOT documented** |

---

## 7. Validation

**No validation messages were captured.** Required-ness is expressed purely by a literal
asterisk appended to the label text (`Name*`, `Address Line 1*`, `Postal Code *`) — note the
inconsistent spacing before the asterisk. Helper texts (`Used for communication`,
`Required for delivery driver`) sit under the field in the MUI `FormHelperText` slot in the
normal (non-error) colour. Clicking the primary action with an empty form was deliberately
not attempted because the primary action on this flow leads to order creation.

---

## Coverage & why

| Item | Status |
|---|---|
| Split-button dropdown options | ✅ captured live |
| Stepper + step names | ✅ captured live |
| Step 1 sender fields (empty state) | ✅ captured live (2GO_PH) |
| Step 1 sender collapsed card | ✅ captured live |
| Step 1 receiver fields | ✅ captured live (NAMLOG) |
| Step 1 fields below `Postal Code *` | ❌ below fold, not scrolled |
| Select/autocomplete option lists | ❌ not opened |
| Step 2 Parcel Details | ❌ not inspected |
| Step 3 rate card + summary rail | ✅ captured live (NAMLOG) |
| Validation messages | ❌ not triggered (unsafe) |
| Checkout page | ❌ deliberately not entered |

Blocker: the assigned tab (`200073904` → renumbered `200073920`/`200073927`) became a dead
document (`#__next` empty, `__NEXT_DATA__` null) after an out-of-band hard reload, and the
only live logged-in tab (`200073832`) was being actively driven by another agent and was
sitting on `/order/checkout/`. Driving it would have risked creating a real order, so it was
only read passively (screenshots + read-only JS).

## Screenshots

- `screenshots/04-create-order-step1-receiver.jpg` — Create Order, step 1, collapsed sender
  card + full receiver block.
- In-transcript only (not saved): step 1 empty sender block (2GO_PH, Philippines) and
  step 3 Order Summary (NAMLOG, ZAR).

---

# Network (crawler inventory)

# Grow merchant portal — network inventory

Base: `https://grow-staging.fareye.co`. Every application call is same-origin under
**`/api/tenant/v1/…`** and is cookie-authenticated (no bearer/api_key in the query string).
Front end is Next.js pages-router, build id `_kxC9hvWqkKcFDSCwkzYR`.

---

## A. Observed live (XHR/fetch, captured with `read_network_requests`)

Captured across one client-side navigation `/order/add/` → `/order/` (tenant 2GO_PH):

| # | Method | Path | Status | Feeds |
|---|---|---|---|---|
| 1 | GET | `/api/tenant/v1/packages` | 403 | packaging-type options (Box / Bag / …) for **Parcel Details** |
| 2 | GET | `/api/tenant/v1/addresses/search?isSender=true&val=&page=0&size=10` | 403 | **"Search from pickup addresses…" autocomplete** (sender). `val` = typed text, paged 10 |
| 3 | POST | `/api/tenant/v1/addresses/getAddresses` | 403 | address-book list used by the **receiver** "Search from address book…" autocomplete |
| 4 | GET | `/api/tenant/v1/serviceableareas/search?key=postcode&val=&isSender=true&isPudo=false&isBilling=false&country=Philippines&onlyCheckForCountry=false&page=0&limit=10` | 200 | **`Postal Code *` select** on the sender address block |
| 5 | GET | `/api/tenant/v1/serviceableareas/search?key=&val=&isSender=true&isPudo=false&isBilling=true&country=Philippines&onlyCheckForCountry=true&page=0&limit=50` | 200 | billing-country / serviceability pre-check for the tenant country (limit 50) |
| 6 | POST | `/api/tenant/v1/shipments/getShipments` | 200 | **the Orders list grid** (rows + total for `1–9 of 9`) |
| 7 | GET | `/images/misc/noOrders.png` | 200 | empty-state illustration |

Also seen (not API): `_next/static/chunks/7822-*.js`, `5779-*.js`,
`pages/order/add-*.js` (route code-split), plus `blob:` URLs (PDF/label object URLs
created client-side).

> **The 403s are not stable behaviour.** They were observed while a second agent was
> switching tenant/merchant in the same browser session, which invalidates the merchant
> context mid-flight. Treat 1–3 as "endpoint confirmed, status unreliable".

**Not captured per phase** (Filters open / Add Order open / each dropdown open) — the
browser session was taken over before those clicks could be made.

---

## B. Full API surface extracted from the JS bundle (no requests sent)

All 134 `api/tenant/v1/*` literals live in one chunk,
`_next/static/chunks/pages/_app-858335a36f559dec.js`. HTTP verbs are **not** recoverable
from the minified constant map, so verbs below are inferred from naming/observation and
marked where uncertain.

### Order / shipment (the ones that matter for the Order pages)

```
shipments                                  <- bare collection; almost certainly the CREATE endpoint (POST)
shipments/update
shipments/cancel
shipments/details
shipments/getShipment
shipments/getShipments                     (POST, confirmed — Orders list)
shipments/getOrdersList
shipments/getParcelsList
shipments/getConsignmentsList
shipments/getStatusFilters                 <- almost certainly the Filters panel's status options
shipments/getDeliveryStores
shipments/getAllDeliveryStores             <- candidates for the "Select store location" toolbar select
shipments/getCarriers
shipments/getOrderParcelDetails
shipments/getOrderParcelItemDetails
shipments/getParcelDetails
shipments/getParcelItemDetails
shipments/getConsignmentParcelDetails
shipments/getConsignmentParcelEvents
shipments/getConsignmentSuggestions
shipments/getVolumetricFactor              <- inline volumetric-weight calculator on Parcel Details
shipments/getPayableAmount                 <- checkout
shipments/checkoutDetails                  <- checkout
shipments/validateOrderNumber
shipments/validateShipmentNumber
shipments/bookPickup
shipments/bookPickupConsolidatedRates
shipments/bookPickupConsolidatedLabel      <- "Prepare for Pickup" toolbar action
shipments/createShipmentLabels
shipments/retryLabelGeneration
shipments/mergePdfLinks
shipments/consignment/dispatch
shipments/consignment/cancel
shipments/consignment/labelPrintOptions
shipments/consignment/reprintLabel
shipments/orderMail                        <- "Email" toolbar action
shipments/getHandoverFileUrl
shipments/uploadHandoverFile
shipments/getParcelEPOD
shipments/getSurveyDetails
shipments/parcel/event/create
shipments/pickupRequests
shipments/ports
shipments/sendOTP
shipments/verifyOTP
shipments/stats/category
shipments/stats/order
shipments/stats/orderAnalytics
shipments/stats/generateWatToken
```

### Rates / serviceability (step 3)

```
rates
rates/calculate
rates/eta
quoteserviceability
serviceableareas
packages
collectionPoints
```

### Addresses

```
addresses
addresses/multiple
addresses/getAddresses
addresses/exportAddresses
addresses/billing-pickup-address
```

### Everything else on the surface (for context)

```
anzWorldline | creditLimit | email
communication/email-config | communication/email-template-configs | communication/email-template-list
cyberSource/capture-context | cyberSource/processPayment | cyberSource/fetch-save-cards
cyberSource/fetch-saved-cardIds | cyberSource/update-save-cards | cyberSource/delete-save-cards
westpac/decryptPaymentInformation | payphi
dashboards/company/merchant/ | dashboards/company/merchants
dashboards/company/metrics/kpis | dashboards/company/metrics/revenue | dashboards/company/metrics/shipments
env/
integrations | integrations/active | integrations/config | integrations/connect
integrations/connections | integrations/providers | integrations/sync
invoices | invoices/external | invoices/external-report | invoiceDisputes | orderDisputes
walletdisputes | weightDisputes | weightDisputes/ | walletTopUpRequests | wallets/
ledgers | ledgers/getAllLedgers | ledgers/ledgerDetails | ledgers/ledgerDetails/
merchants | merchants/export | merchants/verifyBusinessAccount
notification/getAllNotifications | notification/getNotificationCounts | notification/unread
notification/update | notification/refreshTokens
referrals/ | report | report/export | reportscheduler
report-templates/columns | report-templates/templates | report-templates/templates/recent
roles | users | users/getUsers | users/logout
settings | settings/upsertSettings | settings/setOtpForAccountDeactivation
settings/verifyOtpForAccountDeactivation
shopify-app/connection | shopify-app/oauth-init | shopify-app/verify-oauth
shopify-app/sync-customers | shopify-app/sync-orders | shopify-app/sync-pickup-address
shopify/iframe-url
woocommerce-app/connection | woocommerce-app/oauth-init
```

---

## C. The create endpoint — MOST LIKELY, UNCONFIRMED

**Candidate:** `POST /api/tenant/v1/shipments`. This is an inference from a bare collection
path inside a 134-entry constant map with **no recoverable HTTP verb**. Do not wire it
without verifying against a real submission or a backend contract.

Evidence: (a) the bare collection path `api/tenant/v1/shipments` exists in the bundle
alongside `shipments/update`, `shipments/cancel`, `shipments/details` — a REST collection +
sub-resource shape; (b) the route-level chunk `pages/order/add-*.js` contains no API string
literals of its own but does contain the state keys `singleShipment`, `shipmentDetails`,
`addedShipment`, `invalidShipments`; (c) the wizard hands off to a **separate `/order/checkout/`
route**, and the checkout-specific calls are `shipments/checkoutDetails`,
`shipments/getPayableAmount` and `cyberSource/processPayment` — so the money step is
separate from the order-create step.

**Verb not confirmed** — confirming it would require submitting, which was out of scope.
