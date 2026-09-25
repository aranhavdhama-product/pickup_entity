# Staging Holiday Master + location operating hours (2026-09-25)

Captured by click-navigation in the logged-in staging tab (SEKO tenant, company
99999 menu). No record was created or saved.

## Where it lives

- **Top-level left-nav item "Holiday Master"** (`/v2/holidaymaster`), directly above
  Settings — not under Custom Settings → Masters and not under Network/Location.
- A hub (Branch) points at one policy through `holidayMasterCode` (Branch form →
  Operational → "Holiday Master" select; `GET /app/rest/holidayMasters` 403s for this
  account, see `nueva/settingsApi.ts`). The page's own list call was not captured
  (the resource-timing buffer had rolled over).

## Page anatomy

Two panes, no data table:

- **Left — "Holiday Policy"**: an **Add Holiday Master** button, then one card per
  policy (name + Edit). The tenant has one policy, "Holiday".
  - *Add Holiday Master* modal: **Title\***, **Year\*** (number), **Code\*** → Cancel /
    Save Holiday Master.
- **Right — the selected policy** (title header + "Duplicate this Policy" link):
  1. **Working Hours** — Start Time / End Time (time inputs; the policy shows 09:00 AM –
     06:00 PM).
  2. **Weekly Offs** — seven checkboxes Monday … Sunday (none ticked on "Holiday").
  3. **Annual Holiday Calendar** — **Add New Holiday** + a table `# · HOLIDAY · DATE ·
     ACTION` (empty on this tenant). *Add Holiday* modal: **Holiday Name\*** (placeholder
     "e.g., New Year"), **Date\*** (date input) → Cancel / Save Holiday.
  4. **Company Default Holiday Policy** — "A company default Policy is automatically
     applied to all existing branches across the Company" + "Make this policy Company
     Default", then **Save**.

So a FarEye holiday policy = `{ title, code, year, workingHours {start,end},
weeklyOffs[], holidays [{name, date}], companyDefault }` — it carries the hub's
**operating days** (the complement of the weekly offs) and **hours**, not only dates.
No recurring flag and no per-holiday hub assignment were seen: one policy per year,
assignment is on the hub.

## Location Master operating hours (the merchant "preference")

`businessUnitLocation.operating_hours = [{ day: 'Monday', serviceable, open_time:
'HH:mm', close_time, is_primary }]` (FAREYE-APIS.md; editor in
`nueva/liveMasterConfigs.tsx` `OperatingHoursEditor`, the frozen replica grid in
`nueva/MasterForm.tsx` `OperatingHours`). A day can hold several windows; the primary
one is the day's window. Mapped into `MasterLocation.operatingDays`
(`{ days: 0–6[], hours: {day: {open, close}} }`) by `growOrders/masters.ts`; a row
with no `operating_hours` has no preference.

## What the local build does with it (departures noted)

- `growOrders/operatingCalendar.ts` models the policy as staging does. **Hub
  operating days are DERIVED from the hub's holiday policy** (weekly offs → days,
  working hours → hours) instead of a separate hub table; `HUB_OPERATING_DAYS` is
  exported as that derivation. A hub with no mapping uses the Company Default policy.
- Seed policies: `PH-2026` (off Sunday, 08:00–18:00; real 2026 PH regular + special
  non-working days, plus ONE row flagged *sample* on Sat 26 Sep so the demo shows a
  greyed holiday inside the booking horizon (3 days on this account) — no real PH/US national holiday falls
  26 Sep – 2 Oct 2026) for MNL-01 / CEB-01 / SANPABLO; `US-2026` (off Sat + Sun,
  08:00–17:00; US federal holidays 2026) for ORD / CHICAGO — so the Chicago hubs run
  Mon–Fri.
- Local page: Settings → Masters → Service & Order → **Holiday Master**
  (`/local/settings/masters/service_order/holiday-master`), two tabs like Reason
  Master — *Holiday Policies* (Title, Code, Year, Working hours, Weekly offs, Company
  default) and *Holidays* (Policy code, Holiday, Date). Our list/table grammar, not
  staging's two-pane layout (screenshots are functionality, not layout).
