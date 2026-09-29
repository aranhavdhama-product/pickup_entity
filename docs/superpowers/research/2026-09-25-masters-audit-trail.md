# Masters audit trail — SED-8163 (2026-09-25)

Ticket: https://fareye.atlassian.net/browse/SED-8163 — "Add log option under each entry of the
master" (Yusen, Story, Blocked: "need to discuss", "will also need the design"). This note is the
design + the prototype built for the discussion.

## What the ticket asks for

Events: create · modify · delete (soft) · status change · bulk import/update · API updates ·
system updates. UI: an audit-trail view on every master record, latest first, changed fields
only, old-vs-new compare, search by user / date / action / field, CSV export, pagination.
Compliance: entries are immutable, carry an accurate timestamp + user identity, retained per policy.

## Staging today

Staging's masters have no per-record log. The only related endpoint is the account-wide
`GET /app/rest/get_job_activity_log` (user activity, FAREYE-SETTINGS-APIS.md §1). The session in
this browser and in the dev proxy had lapsed during this session, so nothing new was captured;
the design below is ours, on the Nueva design system, not a staging replica.

## Design (prototype: `/local/settings/masters/service_order/*`, also the console Masters)

- **Entry point — additive, no restyle of the frozen Masters pages.** Every row's Action cluster
  gets a **Logs** icon (`History`, the same 28 px ghost button as Edit) on both action variants,
  and the toolbar gets a **Logs** icon beside Export for the whole master (where bulk-import
  events live, since they are not one record's).
- **Surface = Nueva `SlideOver`** (right, 62 %) — the same shell as the pickup request and the
  consignment view. Title "Audit trail", subtitle `<Master> · <record>` or `<Master> · all records`;
  header action **Export CSV**.
- **Body = the list grammar**: search (user · field · value) · Action `FilterDropdown` · User
  `FilterDropdown` · From / To `DateInput` · Clear Filters; a 12 px caption with the count and the
  immutability note; then the timeline card; `PageSize` + `Pagination` below.
- **Timeline** (latest first): dashed spine + dot (the consignment Event Log vocabulary), one
  warm-50 card per entry: action `StatusPill` (Created success · Modified info · Status changed
  warning · Deleted danger · Bulk / API / System neutral) · record label · "n fields changed" ·
  timestamp right; a second line `user · via Console | Bulk upload | API | System`; then the
  **changed fields only** as a Field · Before · After table (before muted + struck, after bold).
  **Compare** on an entry toggles the full before / after snapshot with the changed rows
  highlighted; a Deleted entry shows the last snapshot.
- **Data** = `src/nueva/auditTrail.ts`, an append-only localStorage store (`local-masters-audit-v1`,
  `createLocalConfigStore`, no React, no fetch, no `src/auth`). `recordAudit()` is the only write;
  there is no update or delete. Deterministic seed entries (Created by System, a few Modified /
  Status / API entries, one Bulk import per master) are DERIVED from the sample rows and never
  stored, so a reset is just clearing the key. **Reset demo data** clears it.
- **Actor** = `MastersEnv.actor` (local app: `dms_admin`; the console default `console.user`).
- **Recording** happens in ONE place, `pages.tsx` `MasterTablePanel`: Add / Edit through the
  persist (before row vs re-loaded after row → `diffRows` by column label), Delete, Status change
  (row toggle, bulk toggle, Enable / Disable confirm), and Bulk upload (`UploadDataModal`'s new
  additive `onComplete`).

## Not built (needs the backend)

Real API / system events (the seed shows their shape), retention policy, server-side
immutability, cross-master reporting. The ticket's Product Area is still unset (CFT: Masters).
