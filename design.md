# FarEye Nueva — Design System

> The visual language of FarEye's delivery operations console. A clean, warm,
> orange-accented operations UI: dense surfaces, hairline borders, a single
> orange accent, and quiet status tints. Tokens below are reverse-engineered
> from the *FarEye Nueva Design System* reference + the staging console
> (`staging.fareye.co`). Neutral hexes are approximations — treat the design
> intent (warm grays, one orange accent) as the source of truth.

This is the single source of truth for all UI in this project. Every new page,
component, and form must use these tokens and patterns.

---

## 1. Color

> **Sampled from the live console** (`staging.fareye.co`) via computed styles —
> these are the source of truth. The palette is a **cool slate** scheme with a
> single **red-orange** accent. (Earlier warm values were superseded.)

### Brand orange (primary accent) — `#EE5239`
The one accent color: primary text/links, active tab underline, active page,
focus. Note FarEye uses orange sparingly — most buttons are neutral white.

| Token | Hex | Use |
|-------|-----|-----|
| brand-50  | `#FFF3F1` | NOT a highlight fill (owner, 2026-09-25) — legacy hover on outline buttons only; selected rows / cards / pills / nav rows use `warm-50` |
| brand-100 | `#FDE3DE` | — (no background washes) |
| brand-200 | `#FAC3B9` | borders on tinted elements |
| brand-300 | `#F69C8C` | — |
| brand-400 | `#F27462` | — |
| brand-500 | `#EE5239` | **Brand.** Primary button, links, active tab/page, destructive menu item |
| brand-600 | `#D43B22` | hover |
| brand-700 | `#AE2E1A` | pressed |

### Neutrals — cool slate ramp
**900 = primary text, 600 = secondary, 500 = muted (table headers/placeholders).**

| Token | Hex | Use |
|-------|-----|-----|
| warm-0   | `#FFFFFF` | cards, panels, buttons |
| warm-25  | `#F9FAFC` | **table-header background** |
| warm-50  | `#F0F2F5` | **app background** (cool gray), row hover |
| warm-100 | `#F0F0F0` | **hairline borders / dividers** |
| warm-200 | `#E6E8EB` | subtle fills |
| warm-300 | `#D4D8DD` | input borders |
| warm-400 | `#A6B0BD` | disabled icons |
| warm-500 | `#8094AB` | **muted text, table headers, placeholders** |
| warm-600 | `#4C5761` | **secondary text**, inactive tab/nav |
| warm-900 | `#202C39` | **primary text** (slate navy) |

### Accent — teal (active nav only)
The active **sub-nav** item (e.g. Masters) uses a teal tint, *not* orange.
`teal-50 = #D7F4F6` background + `warm-600 #4C5761` text, radius 8px.

### Status — colored dot + text (data rows)
In tables, status is a **small colored dot + slate label** (not a filled pill).

| Status | Dot | Examples |
|--------|-----|----------|
| Success / Active   | `#21A366` | Active, Created, Delivered |
| Danger / Inactive  | `#EE5239` | Inactive, Failed |
| Warning            | `#E6A100` | Exception, Pending |
| Info               | `#2F80ED` | In Transit, At Facility |
| Neutral            | `#8094AB` | Closed, Draft |

Soft-tint **pill** variants remain available for non-table contexts
(bg/fg pairs in tokens), but data tables use the dot+text form.

---

## 2. Typography — Lato

A humanist sans with warm terminals. Restrained sizes — body sits at 13–14px,
page titles at 18px. Weights run **300 / 400 / 700 / 900**. Lato ships no 500 or
600, so any medium/semibold resolves to **700**.

| Role | Size / Weight |
|------|---------------|
| H1   | 28px / 700 |
| H2   | 20px / 700 |
| H3   | 18px / 700 (page titles) |
| H4   | 16px / 700 |
| Body | 14px / 400 |
| Small| 13px / 400 |
| Mono | 12px (IDs, codes — e.g. `CON-2026-04-18-005`) |

Available weights: Light 300, Regular 400, Bold 700, Black 900.

---

## 3. Spacing, radii & elevation

**Spacing — 4px grid:** `4 · 8 · 12 · 16 · 24 · 32 · 48 · 64`

**Corner radius:**
| Token | Radius | Use |
|-------|--------|-----|
| xs   | 4px   | checkbox |
| sm   | 6px   | **buttons, inputs, cards** |
| lg   | 12px  | overlays |
| pill | 999px | status chips, active pagination dot |

**Elevation:**
| Token | Use |
|-------|-----|
| shadow-0 | cards — flat, hairline border only |
| shadow-1 | subtle lift |
| overlay  | menus, popovers, sheets |

---

## 4. Components

### Buttons
32px tall, 6px radius, **700 labels in Title Case**.
- **Primary** — solid orange-500 fill, white text (`+ Add`).
- **Outline** — white bg, orange border + orange text (`Clear Filters`).
- **Ghost** — transparent, neutral text + icon (`↻ Refresh`).
- **Text** — bare label, neutral (`Cancel`).
- **Icon** — bordered square with a single icon (filter).
- Small size variant exists (shorter height, smaller padding).

### Inputs & fields
Hairline border (neutral-300), 6px radius, 32px tall. Focus draws a **3px orange
ring at low opacity** and an orange border. Dropdowns and date fields share the
same shell (chevron/calendar on the right). States: default · focused · disabled (muted).

### Status pills
Full-round (pill), soft tint, ~11.5px text. The vocabulary of shipment state:
Created · Label Generated · At Facility · Driver Assigned For Delivery ·
Exception · Failed · Closed · Delivered. Tint by semantic group above.
Colourful, but ONLY through Nueva `StatusPill` tones (success · info · warning · danger · neutral);
no hand-rolled chip colours, and the same status reads the same tone on every page —
`stateTone` (consignment state) and `prModel.PR_STATUS_TONE` (pickup request) are the sources.

### Orange is an accent, never a wash (owner, 2026-09-25)
Brand orange marks: the primary button, link text, the active tab underline, the
active nav item's TEXT + 3px bar, focus rings, checkbox/radio accents, count badges.
It is NOT a background: a selected row → `warm-50` (hover `warm-100`); a selected
card / pill / segment → `border-ink` + `warm-50` + bold ink text (optionally a check);
an info banner → the info pair. Every colour is a token — no Tailwind palette
classes (`gray-*`, `slate-*`, `emerald-*` …) and no hex in TSX.

### Checkbox
14px box, 3px radius, **orange-500 when checked** (white check). Unchecked = hairline border.

### Tabs & pagination
- **Tabs:** active tab is an **orange underline** with an inline count
  (e.g. `Active : 1411   Closed : 33   All : 1446`). Inactive = neutral text.
- **Pagination:** current page = **warm-50 box, warm-400 border, bold ink text**; `‹ 1 2 3 … 73 ›`.

### Sidebar nav
Active item: **warm-50 fill, orange text, 3px orange accent bar** on the left (no orange fill).
Icon + label rows; inactive rows are neutral-600 text. Section group headers in
small muted uppercase (e.g. *Platform · Ship · Execute · Experience*).

### KPI cards
Flat white cards, hairline border. Small muted label on top, large tabular figure,
and a **signed delta** below tinted success-green (▲) or danger-red (▼).

### Data table
The heart of the console:
- **Sticky 700-weight headers**, neutral text.
- **Hairline row separators** (neutral-200), no vertical grid lines.
- **Monospace IDs**; right-aligned tabular numbers for quantities/weights.
- Faint **warm tint on hover**; **warm-50 on selected rows** (hover warm-100) — the brand checkbox marks the selection, never an orange row wash.
- Leading **checkbox column** for multi-select.
- Status rendered as a pill in its own column.

### Cards / list rows (Masters pattern)
Settings surfaces use full-width white cards with a leading rounded-square icon,
a 700 title, a muted one-line description, and a right chevron — stacked with
16px gaps on the warm background.
