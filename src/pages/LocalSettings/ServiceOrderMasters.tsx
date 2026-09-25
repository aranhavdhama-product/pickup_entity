/**
 * LOCAL app → Settings → Masters → Service & Order
 * (`/local/settings/masters/service_order` + `/:subId`).
 *
 * Re-mounts the frozen console Masters pages (`nueva/pages.tsx` CategoryPage /
 * SubMasterPage, one definition in `nueva/mastersTree.ts`) under the local base
 * with a localStorage-backed `persist`: the sample rows are the seed, and every
 * add / edit / delete / enable-disable is written per sub-master through
 * `config/localConfigStore`. Nothing here imports src/auth or reaches /staging
 * (the live `liveMasterConfigs` / `masters/serviceOrder` stay console-only).
 */
import { useMemo } from 'react'
import { CategoryPage, SubMasterPage } from '../../nueva/pages'
import { MastersEnvContext, type MastersEnv, type MasterRow } from '../../nueva/mastersEnv'
import type { FieldDef, SubMaster } from '../../nueva/mastersTree'
import { beforeAttemptOf, DEFAULT_REATTEMPT_BEFORE, REASON_MASTER_KEY_VERSION } from '../../growOrders/reasonPolicy'
import { createLocalConfigStore, asRecord, type LocalConfigStore } from '../../config/localConfigStore'
import { DAY_NAMES, HOLIDAY_DATES_SUB, HOLIDAY_MASTER_KEY_VERSION, HOLIDAY_POLICY_SUB, parseWeeklyOffs, toYmd, weeklyOffsLabel } from '../../growOrders/operatingCalendar'

export const SERVICE_ORDER_BASE = '/local/settings/masters'
const CAT_ID = 'service_order'

type Stored = { rows: MasterRow[] | null }   // null = not edited yet → the sample rows
/* per-sub persistence version (default v2) — bump one to reseed just that sub-master's rows.
   sku v3: the shared sample catalogue (growOrders/sampleSkus.ts) + Unit Cost;
   service-type v4: the demo's 10 service types (draft.ts + rates.ts read this key too);
   reason-master-reasons / reason-policy v3: the pickup reasons + pickup policy rules
   (growOrders/reasonPolicy.ts reads the reason-policy key back — one version constant) */
const KEY_VERSION: Record<string, number> = {
  sku: 3, 'service-type': 4,
  'reason-master-reasons': REASON_MASTER_KEY_VERSION, 'reason-policy': REASON_MASTER_KEY_VERSION,
  /* Holiday Master tabs — growOrders/operatingCalendar.ts reads both keys back */
  [HOLIDAY_POLICY_SUB]: HOLIDAY_MASTER_KEY_VERSION, [HOLIDAY_DATES_SUB]: HOLIDAY_MASTER_KEY_VERSION,
}
const stores = new Map<string, LocalConfigStore<Stored>>()
const storeFor = (subId: string) => {
  let s = stores.get(subId)
  if (!s) {
    s = createLocalConfigStore<Stored>(`local-masters-${CAT_ID}-${subId}-v${KEY_VERSION[subId] ?? 2}`, { rows: null }, (raw) => {
      const rows = asRecord(raw).rows
      return { rows: Array.isArray(rows) ? rows.filter((r) => r && typeof r === 'object' && 'id' in r) as MasterRow[] : null }
    })
    stores.set(subId, s)
  }
  return s
}

const norm = (v: string) => v.toLowerCase().replace(/[^a-z0-9]/g, '')
const fieldsOf = (sub: SubMaster): FieldDef[] => sub.addForm?.sections.flatMap((s) => s.fields) ?? []
/** the "Enable this …" / "… is Active" checkbox drives the row's status */
const isStatusField = (f: FieldDef) => f.type === 'checkbox' && /enable|active/i.test(f.label)
/** row key a field writes to: explicit rowKey → column with the same label → a private `f:<label>` slot */
const keyOf = (sub: SubMaster, f: FieldDef) => {
  if (f.rowKey) return f.rowKey
  if (isStatusField(f)) return 'status'
  const col = sub.columns?.find((c) => norm(c.label) === norm(f.label))
  return col?.key ?? `f:${f.label}`
}
const activeStatus = (v: unknown) => !/(deactiv|disabl|inactive)/i.test(String(v ?? 'Active'))

const rowsOf = (sub: SubMaster): MasterRow[] => storeFor(sub.id).read().rows ?? sub.rows ?? []

function toValues(sub: SubMaster, row: MasterRow): MasterRow {
  const out: MasterRow = {}
  for (const f of fieldsOf(sub)) {
    const v = row[keyOf(sub, f)]
    if (v === undefined) continue
    out[f.label] = isStatusField(f) ? activeStatus(v) : f.type === 'checkbox' ? v === true || v === 'true' : v
  }
  /* Reason Policy: the row reads "Before attempt 3"; the form edits When = "Before attempt" + Attempt = 3 */
  if (sub.id === 'reason-policy' && typeof out.When === 'string' && /^before\s*attempt/i.test(out.When)) {
    out.Attempt = String(beforeAttemptOf(row) ?? DEFAULT_REATTEMPT_BEFORE)
    out.When = 'Before attempt'
  }
  /* Holiday policy: the row's "Saturday, Sunday" → the seven Weekly Offs checkboxes */
  if (sub.id === HOLIDAY_POLICY_SUB) {
    const offs = parseWeeklyOffs(row.weeklyOffs)
    DAY_NAMES.forEach((d, i) => { out[d] = offs.includes(i) })
  }
  return out
}

function upsert(sub: SubMaster, values: MasterRow, rowId?: string) {
  const patch: MasterRow = {}
  for (const f of fieldsOf(sub)) {
    if (!(f.label in values)) continue
    const v = values[f.label]
    patch[keyOf(sub, f)] = isStatusField(f) ? (v ? 'Active' : 'Inactive') : f.type === 'checkbox' ? String(!!v) : v
  }
  /* Reason Policy: When = "Before attempt" + Attempt N → the row's "Before attempt N" (N clamped 1–5) */
  if (sub.id === 'reason-policy') {
    if (patch.when === 'Before attempt') {
      const n = Number(patch.attempt)
      const cap = Number.isFinite(n) && String(patch.attempt ?? '').trim() !== '' ? Math.min(5, Math.max(1, Math.round(n))) : DEFAULT_REATTEMPT_BEFORE
      patch.attempt = String(cap)
      patch.when = `Before attempt ${cap}`
    } else if ('when' in patch) {
      patch.attempt = undefined   // a rule that is no longer "Before attempt" drops its N
    }
  }
  /* Holiday policy: the seven Weekly Offs checkboxes → one "Saturday, Sunday" column */
  if (sub.id === HOLIDAY_POLICY_SUB) {
    patch.weeklyOffs = weeklyOffsLabel(DAY_NAMES.map((d, i) => (values[d] ? i : -1)).filter((i) => i >= 0))
    DAY_NAMES.forEach((d) => { delete patch[`f:${d}`] })
    if (typeof patch.code === 'string') patch.code = patch.code.trim()
  }
  /* Holiday: a typed date is stored as YYYY-MM-DD when it parses */
  if (sub.id === HOLIDAY_DATES_SUB && patch.date !== undefined) patch.date = toYmd(patch.date) || patch.date
  const rows = rowsOf(sub)
  const next = rowId
    ? rows.map((r) => (r.id === rowId ? { ...r, ...patch } : r))
    : [{ status: 'Active', ...patch, id: `L-${Date.now().toString(36)}` }, ...rows]
  storeFor(sub.id).write({ rows: next })
}

export default function ServiceOrderMasters({ page }: { page: 'category' | 'sub' }) {
  const env = useMemo<MastersEnv>(() => ({
    base: SERVICE_ORDER_BASE,
    backTo: '/local/settings',
    catId: CAT_ID,
    persist: {
      load: (subId) => storeFor(subId).read().rows,
      save: (subId, rows) => storeFor(subId).write({ rows }),
      toValues,
      upsert,
    },
  }), [])
  return (
    <MastersEnvContext.Provider value={env}>
      <div className="p-6">{page === 'category' ? <CategoryPage /> : <SubMasterPage />}</div>
    </MastersEnvContext.Provider>
  )
}
