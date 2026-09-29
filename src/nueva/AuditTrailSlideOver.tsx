/**
 * Audit trail slide-over (SED-8163) — the "Logs" action on a master record or
 * on a master's toolbar. Nueva `SlideOver` (the pickup-request / consignment
 * shell) with the list grammar inside: search · Action · User · From · To ·
 * Clear Filters, a count caption, the timeline (latest first, changed fields
 * only, Compare = the full before / after snapshot), PageSize + Pagination.
 * Read-only by design: the store exposes no edit or delete.
 */
import { useMemo, useState } from 'react'
import { Calendar, Download, History, User } from 'lucide-react'
import type { SubMaster } from './mastersTree'
import {
  Button, ClearFilters, DateInput, EmptyState, FilterDropdown, PageSize, Pagination, SearchInput, SlideOver, StatusPill,
} from './components'
import {
  AUDIT_ACTION_LABEL, AUDIT_ACTION_TONE, AUDIT_ACTIONS, AUDIT_SOURCE_LABEL, auditCsv, auditFor, fmtAuditStamp,
  useAuditEntries, type AuditEntry,
} from './auditTrail'

const ymdLocal = (iso: string) => {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const summaryOf = (e: AuditEntry) => {
  if (e.action === 'deleted') return 'Record deleted'
  if (e.action === 'created') return 'Record created'
  if (e.changes.length === 0) return e.note ?? 'No field changed'
  return `${e.changes.length} field${e.changes.length === 1 ? '' : 's'} changed`
}

export function AuditTrailSlideOver({ sub, recordId, recordLabel, onClose }: {
  sub: SubMaster
  /** null / undefined = the whole master */
  recordId?: string | null
  recordLabel?: string
  onClose: () => void
}) {
  const stored = useAuditEntries()
  const entries = useMemo(() => auditFor(sub, recordId, stored), [sub, recordId, stored])
  const [search, setSearch] = useState('')
  const [action, setAction] = useState('')
  const [user, setUser] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const users = useMemo(() => Array.from(new Set(entries.map((e) => e.user))).sort(), [entries])
  const hasFilters = !!(search || action || user || from || to)
  const clear = () => { setSearch(''); setAction(''); setUser(''); setFrom(''); setTo(''); setPage(1) }

  const filtered = useMemo(() => entries.filter((e) => {
    if (action && AUDIT_ACTION_LABEL[e.action] !== action) return false
    if (user && e.user !== user) return false
    const day = ymdLocal(e.at)
    if (from && day < from) return false
    if (to && day > to) return false
    if (search) {
      const q = search.toLowerCase()
      const hay = [e.user, e.recordLabel, e.note ?? '', AUDIT_ACTION_LABEL[e.action], ...e.changes.flatMap((c) => [c.field, c.from, c.to])]
      if (!hay.some((s) => s.toLowerCase().includes(q))) return false
    }
    return true
  }), [entries, action, user, from, to, search])

  const pages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const cur = Math.min(page, pages)
  const shown = filtered.slice((cur - 1) * pageSize, cur * pageSize)
  const range = filtered.length === 0 ? '0 entries' : `${(cur - 1) * pageSize + 1}-${Math.min(cur * pageSize, filtered.length)} of ${filtered.length}`

  const exportCsv = () => {
    const blob = new Blob([auditCsv(filtered)], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `${sub.name.replace(/\s+/g, '_')}_audit_trail.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <SlideOver title="Audit trail" subtitle={`${sub.name} · ${recordId ? recordLabel || recordId : 'all records'}`} onClose={onClose}
      actions={<Button variant="outline" icon={<Download size={14} />} onClick={exportCsv} disabled={filtered.length === 0}>Export CSV</Button>}>
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
        {/* filter line — the list grammar: search, two dropdowns, dates, clear */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-52 min-w-[140px]"><SearchInput placeholder="Search user, field or value" value={search} onChange={(v) => { setSearch(v); setPage(1) }} /></div>
          <FilterDropdown label="Action" options={AUDIT_ACTIONS.map((a) => AUDIT_ACTION_LABEL[a])} value={action} onChange={(v) => { setAction(v); setPage(1) }} />
          <FilterDropdown label="User" options={users} value={user} onChange={(v) => { setUser(v); setPage(1) }} />
          <div className="w-32"><DateInput value={from} onChange={(v) => { setFrom(v); setPage(1) }} placeholder="From" max={to || undefined} /></div>
          <div className="w-32"><DateInput value={to} onChange={(v) => { setTo(v); setPage(1) }} placeholder="To" min={from || undefined} /></div>
          <ClearFilters onClick={clear} active={hasFilters} />
        </div>
        <p className="text-[12px] text-ink-3">
          {filtered.length} of {entries.length} entr{entries.length === 1 ? 'y' : 'ies'} · latest first · entries are immutable and kept for the account's retention period
        </p>

        {/* timeline */}
        <div className="rounded-xl border border-line bg-surface shadow-ds-1">
          {shown.length === 0
            ? <EmptyState icon={<History size={40} />} title={hasFilters ? 'No entries match' : 'No activity yet'} hint={hasFilters ? 'Clear the filters to see every entry.' : 'Every create, edit, status change, delete and upload on this record lands here.'} />
            : (
              <ol className="relative px-5 py-4">
                <span className="absolute bottom-6 left-[27px] top-6 w-px border-l border-dashed border-warm-300" aria-hidden />
                {shown.map((e) => <Entry key={e.id} e={e} sub={sub} showRecord={!recordId} />)}
              </ol>
            )}
        </div>

        <div className="flex items-center gap-4">
          <PageSize value={pageSize} onChange={(n) => { setPageSize(n); setPage(1) }} />
          <div className="flex-1 [&>div]:mt-0"><Pagination page={cur} total={pages} range={range} onChange={setPage} /></div>
        </div>
      </div>
    </SlideOver>
  )
}

/* ---------------------------------------------------------------- entry -- */

function Entry({ e, sub, showRecord }: { e: AuditEntry; sub: SubMaster; showRecord: boolean }) {
  const [compare, setCompare] = useState(false)
  const canCompare = !!(e.before || e.after) && e.action !== 'bulk-import'
  return (
    <li className="relative mb-3 pl-6 last:mb-0">
      <span className={`absolute left-0 top-3.5 h-3 w-3 rounded-full border-2 bg-surface ${e.action === 'deleted' ? 'border-danger-fg' : e.action === 'status' ? 'border-warning-fg' : 'border-success-fg'}`} aria-hidden />
      <div className="rounded-lg bg-warm-50 px-3 py-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill label={AUDIT_ACTION_LABEL[e.action]} tone={AUDIT_ACTION_TONE[e.action]} />
          {showRecord && e.recordLabel && <span className="text-[13px] font-bold text-ink">{e.recordLabel}</span>}
          <span className="text-[12px] text-ink-2">{summaryOf(e)}</span>
          <span className="ml-auto inline-flex items-center gap-1 text-[12px] text-ink-2"><Calendar size={12} />{fmtAuditStamp(e.at)}</span>
        </div>
        <p className="mt-1 flex items-center gap-1 text-[12px] text-ink-2">
          <User size={12} />{e.user} · via {AUDIT_SOURCE_LABEL[e.source]}
          {e.note && e.changes.length > 0 && <span className="text-ink-3"> · {e.note}</span>}
          {canCompare && (
            <button type="button" onClick={() => setCompare((v) => !v)} className="ml-auto text-brand-500 hover:underline">
              {compare ? 'Changed fields only' : e.action === 'deleted' ? 'Last snapshot' : 'Compare all fields'}
            </button>
          )}
        </p>
        {compare ? <Snapshot e={e} sub={sub} /> : e.changes.length > 0 && <Changes changes={e.changes} />}
      </div>
    </li>
  )
}

function Changes({ changes }: { changes: AuditEntry['changes'] }) {
  return (
    <table className="mt-2 w-full table-fixed text-[12px]">
      <colgroup><col style={{ width: '40%' }} /><col style={{ width: '30%' }} /><col style={{ width: '30%' }} /></colgroup>
      <thead>
        <tr className="border-b border-line text-left text-ink-3">
          <th className="py-1 pr-3 font-bold">Field</th><th className="py-1 pr-3 font-bold">Before</th><th className="py-1 font-bold">After</th>
        </tr>
      </thead>
      <tbody>
        {changes.map((c) => (
          <tr key={c.field} className="border-b border-line last:border-0">
            <td className="py-1 pr-3 text-ink">{c.field}</td>
            <td className="py-1 pr-3 text-ink-3 line-through">{c.from || <span className="no-underline">—</span>}</td>
            <td className="py-1 font-bold text-ink">{c.to || '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/** The full before / after row, changed fields highlighted (the ticket's "compare old vs new"). */
function Snapshot({ e, sub }: { e: AuditEntry; sub: SubMaster }) {
  const cols = sub.columns ?? []
  const changed = new Set(e.changes.map((c) => c.field))
  const known = new Set(cols.map((c) => c.key))
  const extra = Array.from(new Set([...Object.keys(e.before ?? {}), ...Object.keys(e.after ?? {})]))
    .filter((k) => k !== 'id' && !known.has(k)).map((k) => ({ key: k, label: k.startsWith('f:') ? k.slice(2) : k === 'status' ? 'Status' : k }))
  const fields = [...cols.map((c) => ({ key: c.key, label: c.label })), ...extra]
  const str = (v: unknown) => (v == null || v === '' ? '—' : String(v))
  return (
    <table className="mt-2 w-full table-fixed text-[12px]">
      <colgroup><col style={{ width: '40%' }} /><col style={{ width: '30%' }} /><col style={{ width: '30%' }} /></colgroup>
      <thead>
        <tr className="border-b border-line text-left text-ink-3">
          <th className="py-1 pr-3 font-bold">Field</th><th className="py-1 pr-3 font-bold">Before</th><th className="py-1 font-bold">After</th>
        </tr>
      </thead>
      <tbody>
        {fields.map((f) => {
          const hot = changed.has(f.label)
          return (
            <tr key={f.key} className={`border-b border-line last:border-0 ${hot ? 'bg-surface font-bold text-ink' : 'text-ink-2'}`}>
              <td className="py-1 pr-3">{f.label}</td>
              <td className={`py-1 pr-3 ${hot ? 'text-ink-3 line-through' : ''}`}>{str(e.before?.[f.key])}</td>
              <td className="py-1">{str(e.after?.[f.key])}</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
