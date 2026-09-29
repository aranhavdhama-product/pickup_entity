/**
 * Masters audit trail (SED-8163) — the append-only history behind the "Logs"
 * action on every master record and on every master's toolbar.
 *
 * ONE write, `recordAudit()`; no update, no delete — entries are immutable by
 * construction. Stored in localStorage through `createLocalConfigStore`
 * (`local-masters-audit-v1`); `resetAudit()` exists only for "Reset demo data".
 * Seed entries (Created by System, a few edits, one bulk import per master) are
 * DERIVED from a master's sample rows and never stored, so the demo has history
 * on first open and a reset simply drops what the user did.
 *
 * No React components, no fetch, no src/auth — safe for the local app and the console.
 */
import { asRecord, createLocalConfigStore } from '../config/localConfigStore'
import type { ColumnDef, SubMaster } from './mastersTree'
import type { MasterRow } from './mastersEnv'

export type AuditAction = 'created' | 'modified' | 'deleted' | 'status' | 'bulk-import' | 'bulk-update' | 'api' | 'system'
export type AuditSource = 'ui' | 'bulk' | 'api' | 'system'

export interface AuditChange { field: string; from: string; to: string }

export interface AuditEntry {
  id: string
  /** ISO timestamp */
  at: string
  masterId: string
  masterName: string
  /** null = a master-level event (bulk import) that is not one record's */
  recordId: string | null
  recordLabel: string
  action: AuditAction
  source: AuditSource
  user: string
  changes: AuditChange[]
  before: MasterRow | null
  after: MasterRow | null
  note?: string
}

export const AUDIT_ACTION_LABEL: Record<AuditAction, string> = {
  created: 'Created', modified: 'Modified', deleted: 'Deleted', status: 'Status changed',
  'bulk-import': 'Bulk import', 'bulk-update': 'Bulk update', api: 'API update', system: 'System update',
}
export const AUDIT_ACTIONS = Object.keys(AUDIT_ACTION_LABEL) as AuditAction[]
export const AUDIT_SOURCE_LABEL: Record<AuditSource, string> = { ui: 'Console', bulk: 'Bulk upload', api: 'API', system: 'System' }
export const AUDIT_ACTION_TONE: Record<AuditAction, 'success' | 'info' | 'warning' | 'danger' | 'neutral'> = {
  created: 'success', modified: 'info', status: 'warning', deleted: 'danger',
  'bulk-import': 'neutral', 'bulk-update': 'neutral', api: 'neutral', system: 'neutral',
}

/* ---------------------------------------------------------------- store -- */

type Stored = { entries: AuditEntry[] }
const ACTIONS = new Set<string>(AUDIT_ACTIONS)
const SOURCES = new Set<string>(['ui', 'bulk', 'api', 'system'])
const str = (v: unknown) => (v == null ? '' : String(v))

function normalizeEntry(raw: unknown): AuditEntry | null {
  const o = asRecord(raw)
  if (typeof o.id !== 'string' || typeof o.at !== 'string' || typeof o.masterId !== 'string') return null
  const changes = Array.isArray(o.changes)
    ? o.changes.map((c) => { const x = asRecord(c); return { field: str(x.field), from: str(x.from), to: str(x.to) } }).filter((c) => c.field)
    : []
  return {
    id: o.id, at: o.at, masterId: o.masterId, masterName: str(o.masterName),
    recordId: typeof o.recordId === 'string' ? o.recordId : null, recordLabel: str(o.recordLabel),
    action: ACTIONS.has(str(o.action)) ? (o.action as AuditAction) : 'modified',
    source: SOURCES.has(str(o.source)) ? (o.source as AuditSource) : 'ui',
    user: str(o.user) || 'unknown', changes,
    before: o.before && typeof o.before === 'object' ? (o.before as MasterRow) : null,
    after: o.after && typeof o.after === 'object' ? (o.after as MasterRow) : null,
    note: typeof o.note === 'string' && o.note ? o.note : undefined,
  }
}

const store = createLocalConfigStore<Stored>('local-masters-audit-v1', { entries: [] }, (raw) => {
  const list = asRecord(raw).entries
  return { entries: Array.isArray(list) ? list.map(normalizeEntry).filter((e): e is AuditEntry => !!e) : [] }
})

let seq = 0
const newId = () => `A-${Date.now().toString(36)}-${(seq++).toString(36)}`

export type AuditInput = Omit<AuditEntry, 'id' | 'at'> & { at?: string }

/** The one write. Appends; nothing here can edit or remove what was written. */
export function recordAudit(input: AuditInput): AuditEntry {
  const entry: AuditEntry = { ...input, id: newId(), at: input.at ?? new Date().toISOString() }
  store.write({ entries: [...store.read().entries, entry] })
  return entry
}

/** Demo only — the LOCAL sidebar's "Reset demo data". */
export function resetAudit() { store.write({ entries: [] }) }

/** Every stored entry (unsorted). Reactive: re-renders when an entry lands. */
export const useAuditEntries = (): AuditEntry[] => store.use().entries

/* ----------------------------------------------------------------- diff -- */

const labelOf = (cols: ColumnDef[], key: string) =>
  cols.find((c) => c.key === key)?.label ?? (key.startsWith('f:') ? key.slice(2) : key === 'status' ? 'Status' : key)

/** Changed fields between two rows, labelled by the master's columns. `id` never counts. */
export function diffRows(before: MasterRow | null, after: MasterRow | null, cols: ColumnDef[]): AuditChange[] {
  const keys = new Set<string>([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])
  keys.delete('id')
  const out: AuditChange[] = []
  for (const k of keys) {
    const a = str(before?.[k]), b = str(after?.[k])
    if (a !== b) out.push({ field: labelOf(cols, k), from: a, to: b })
  }
  return out
}

/** The row's display name: its first column, else its code, else its id. */
export const recordLabelOf = (sub: SubMaster, row: MasterRow | null | undefined): string => {
  if (!row) return ''
  const first = sub.columns?.[0]?.key
  return str((first && row[first]) || row.code || row.name || row.id)
}

/* ----------------------------------------------------------------- seed -- */

/** Deterministic demo history for a master's SAMPLE rows — derived, never stored. */
const SEED_BASE = Date.UTC(2026, 7, 3, 9, 15)        // 3 Aug 2026 09:15 UTC
const DAY = 86_400_000
const seedAt = (days: number, minutes = 0) => new Date(SEED_BASE + days * DAY + minutes * 60_000).toISOString()
const SEED_USERS = ['saroj.m', 'ops.planner', 'yusen.admin']
/** a sample cell that holds a value (the list's '-' / '—' placeholders are empty) */
const has = (v: unknown) => { const t = str(v).trim(); return t !== '' && t !== '-' && t !== '—' }

export function seedAuditFor(sub: SubMaster): AuditEntry[] {
  const rows = sub.rows ?? []
  const cols = sub.columns ?? []
  if (rows.length === 0) return []
  const out: AuditEntry[] = []
  const base = { masterId: sub.id, masterName: sub.name, before: null as MasterRow | null, after: null as MasterRow | null, changes: [] as AuditChange[] }
  out.push({
    ...base, id: `S-${sub.id}-bulk`, at: seedAt(0), recordId: null, recordLabel: '',
    action: 'bulk-import', source: 'bulk', user: 'dms_admin',
    note: `Bulk upload · ${rows.length} row${rows.length === 1 ? '' : 's'} created from ${sub.name.replace(/\s+/g, '_')}.xlsx`,
  })
  rows.forEach((row, i) => {
    const label = recordLabelOf(sub, row)
    out.push({ ...base, id: `S-${sub.id}-${row.id}-c`, at: seedAt(0, i + 1), recordId: row.id, recordLabel: label,
      action: 'created', source: 'bulk', user: 'dms_admin', after: row, changes: cols.filter((c) => has(row[c.key])).map((c) => ({ field: c.label, from: '', to: str(row[c.key]) })) })
    /* a text column that is not the name / code / status — the one an edit would plausibly touch */
    const editable = cols.find((c, ci) => ci > 1 && !c.status && !c.image && has(row[c.key]) && !/code|name/i.test(c.label))
    if (i % 3 === 0 && editable) {
      const prev = { ...row, [editable.key]: '' }
      out.push({ ...base, id: `S-${sub.id}-${row.id}-m`, at: seedAt(6 + (i % 5), 30 + i), recordId: row.id, recordLabel: label,
        action: 'modified', source: 'ui', user: SEED_USERS[i % SEED_USERS.length], before: prev, after: row,
        changes: [{ field: editable.label, from: '', to: str(row[editable.key]) }] })
    }
    if (i % 4 === 1 && 'status' in row) {
      const cur = str(row.status), prevStatus = /inactive|disabled/i.test(cur) ? 'Active' : 'Inactive'
      out.push({ ...base, id: `S-${sub.id}-${row.id}-s`, at: seedAt(12 + (i % 7), i), recordId: row.id, recordLabel: label,
        action: 'status', source: 'ui', user: SEED_USERS[(i + 1) % SEED_USERS.length],
        before: { ...row, status: prevStatus }, after: row, changes: [{ field: 'Status', from: prevStatus, to: cur }] })
    }
    if (i % 5 === 2) {
      out.push({ ...base, id: `S-${sub.id}-${row.id}-a`, at: seedAt(20 + (i % 3), 5 * i), recordId: row.id, recordLabel: label,
        action: 'api', source: 'api', user: 'api:erp-sync', before: row, after: row,
        note: 'PUT /master/api/v1 — no field differed from the payload' })
    }
  })
  return out
}

/* ---------------------------------------------------------------- query -- */

export interface AuditScope { masterId: string; recordId?: string | null }

/** Stored + seed entries for a master (or one record of it), latest first. */
export function auditFor(sub: SubMaster, recordId: string | null | undefined, stored: AuditEntry[]): AuditEntry[] {
  const all = [...seedAuditFor(sub), ...stored.filter((e) => e.masterId === sub.id)]
  const list = recordId ? all.filter((e) => e.recordId === recordId) : all
  return list.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))
}

/* ------------------------------------------------------------------ csv -- */

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const p2 = (n: number) => String(n).padStart(2, '0')
/** ISO → '23 Sep 2026, 14:05' (the pickup grid's stamp). */
export function fmtAuditStamp(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return `${d.getDate()} ${MON[d.getMonth()]} ${d.getFullYear()}, ${p2(d.getHours())}:${p2(d.getMinutes())}`
}

const cell = (v: string) => `"${v.replace(/"/g, '""')}"`
/** One CSV line per changed field (one per entry when nothing changed). */
export function auditCsv(entries: AuditEntry[]): string {
  const head = ['Timestamp', 'Master', 'Record', 'Action', 'Source', 'User', 'Field', 'Before', 'After', 'Note']
  const lines = [head.join(',')]
  for (const e of entries) {
    const fixed = [e.at, e.masterName, e.recordLabel, AUDIT_ACTION_LABEL[e.action], AUDIT_SOURCE_LABEL[e.source], e.user]
    if (e.changes.length === 0) lines.push([...fixed, '', '', '', e.note ?? ''].map(cell).join(','))
    for (const c of e.changes) lines.push([...fixed, c.field, c.from, c.to, e.note ?? ''].map(cell).join(','))
  }
  return lines.join('\n')
}
