/**
 * Serviceable Area rule builder — the "Service Zones" custom field of the
 * Serviceable Areas form (My Network tab 2), on staging's real contract:
 * serviceableRule = [{key: state|city|suburb|postal_code,
 *                     value: [{value, alias}], exclusions: []}].
 *
 * The update API is APPEND-ONLY (verified live 2026-08-27): rule keys and
 * values can never be removed once saved — so on edit, saved areas render as
 * locked chips and only additions are possible. Area options come from the
 * same /master/api/v1/geofence/search cascade the branch form uses.
 */
import { useEffect, useRef, useState } from 'react'
import { Building2, MapPinned, Plus, X } from 'lucide-react'
import { Button, DataTable, LoadingBox, MenuSelect, StatusPill, Toggle, type Column } from './components'
import { DetailTabActions } from './BranchGeofence'
import { RecordCard } from './LiveMaster'
import {
  fetchCountries, fetchGeoSuggestions, fetchServiceableAreas, saveServiceableArea,
  type MasterRecord, type RuleExclusion, type ServiceableRule,
} from './settingsApi'
import { toast } from './toast'

export const GEO_TYPES = [
  { key: 'state', label: 'State', level: 'state' as const },
  { key: 'city', label: 'City', level: 'city' as const },
  { key: 'suburb', label: 'County/Suburb', level: 'suburb' as const },
  { key: 'postal_code', label: 'Postal Code', level: 'pinCode' as const },
]

export const geoTypeLabel = (key: string) =>
  GEO_TYPES.find((t) => t.key === key)?.label ?? key

const rulesOf = (row: MasterRecord): ServiceableRule[] =>
  Array.isArray(row.serviceableRule) ? row.serviceableRule as ServiceableRule[] : []

/** searchable area picker — options refetch when zone type or country change */
function AreaAdder({ typeKey, country, taken, onPick }: {
  typeKey: string
  country: string
  taken: Set<string>
  onPick: (v: string) => void
}) {
  const [opts, setOpts] = useState<string[]>([])
  useEffect(() => {
    let alive = true
    setOpts([])
    const t = GEO_TYPES.find((x) => x.key === typeKey)
    if (!t || !country) return
    fetchGeoSuggestions(t.level, country)
      .then((s) => { if (alive) setOpts(s.map((o) => o.value)) })
      .catch(() => {})
    return () => { alive = false }
  }, [typeKey, country])
  return (
    <div className="w-56">
      <MenuSelect value="" placeholder="Add an area" searchable
        options={opts.filter((o) => !taken.has(o))}
        onChange={(v) => { if (v) onPick(v) }} />
    </div>
  )
}

export function RuleBuilder({ row, set, readOnly }: {
  row: MasterRecord
  set: (patch: Record<string, unknown>) => void
  readOnly: boolean
}) {
  const rules = rulesOf(row)
  const country = String(row.country ?? '')

  // what the server already holds — locked forever (append-only API)
  const baseline = useRef<Map<string, Set<string>> | null>(null)
  if (baseline.current === null) {
    baseline.current = new Map(rulesOf(row).map((r) => [r.key, new Set(r.value.map((v) => v.value))]))
  }
  const locked = (key: string, value: string) => baseline.current?.get(key)?.has(value) ?? false
  const lockedKey = (key: string) => baseline.current?.has(key) ?? false

  const update = (next: ServiceableRule[]) => set({ serviceableRule: next })

  if (readOnly) {
    // same Included / Excluded area tables as the editor — one look everywhere
    const includedRO = rules.flatMap((r) => r.value.map((v) => ({ key: r.key, value: v.value })))
    const excludedRO = rules.flatMap((r) => (Array.isArray(r.exclusions) ? r.exclusions as RuleExclusion[] : [])
      .flatMap((e) => e.value.map((v) => ({ key: e.key, value: v }))))
    const roTable = (title: string, rowsT: { key: string; value: string }[], danger = false) => (
      <div className="min-w-0 flex-1">
        <p className="mb-1.5 text-[12px] font-bold text-ink-3">{title}</p>
        <div className="max-h-64 overflow-y-auto rounded-md border border-line">
          <table className="w-full text-[13px]">
            <thead className="sticky top-0 bg-warm-25">
              <tr className="border-b border-line text-left">
                <th className="px-3 py-2 text-[12px] font-bold text-ink-3">Area</th>
                <th className="px-3 py-2 text-[12px] font-bold text-ink-3">Type</th>
              </tr>
            </thead>
            <tbody>
              {rowsT.map((r) => (
                <tr key={`${r.key}:${r.value}`} className="border-b border-line/60 last:border-0">
                  <td className={`px-3 py-1.5 font-bold ${danger ? 'text-danger-fg' : 'text-ink'}`}>{r.value}</td>
                  <td className="px-3 py-1.5 text-ink-2">{geoTypeLabel(r.key)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    )
    return includedRO.length === 0 ? <p className="text-[13px] text-ink-3">No service zones defined.</p> : (
      <div className="flex flex-wrap gap-5">
        {roTable('Included Areas', includedRO)}
        {excludedRO.length > 0 && roTable('Excluded Areas', excludedRO, true)}
      </div>
    )
  }

  /* flat editor — two FIXED picker rows (include / exclude), and the chosen
   * areas render in TWO TABLES below (one included, one excluded). Inputs
   * never move as areas are added. */
  const addIncluded = (key: string, v: string) => {
    const hit = rules.find((r) => r.key === key)
    update(hit
      ? rules.map((r) => r.key === key ? { ...r, value: [...r.value, { value: v, alias: '' }] } : r)
      : [...rules, { key, value: [{ value: v, alias: '' }], exclusions: [] }])
  }
  const removeIncluded = (key: string, v: string) => {
    update(rules
      .map((r) => r.key === key ? { ...r, value: r.value.filter((x) => x.value !== v) } : r)
      .filter((r) => r.value.length > 0 || lockedKey(r.key)))
  }
  // exclusions are CREATE-ONLY: they can only ride on a rule that isn't saved
  // yet — attach to the first unlocked rule
  const exHost = rules.find((r) => !lockedKey(r.key))
  const addExcluded = (key: string, v: string) => {
    if (!exHost) return
    update(rules.map((r) => {
      if (r !== exHost) return r
      const ex = Array.isArray(r.exclusions) ? r.exclusions as RuleExclusion[] : []
      const hit = ex.find((e) => e.key === key)
      return { ...r, exclusions: hit
        ? ex.map((e) => e.key === key ? { ...e, value: [...e.value, v] } : e)
        : [...ex, { key, value: [v] }] }
    }))
  }
  const removeExcluded = (key: string, v: string) => {
    update(rules.map((r) => lockedKey(r.key) ? r : {
      ...r,
      exclusions: (Array.isArray(r.exclusions) ? r.exclusions as RuleExclusion[] : [])
        .map((e) => e.key === key ? { ...e, value: e.value.filter((x) => x !== v) } : e)
        .filter((e) => e.value.length > 0),
    }))
  }

  const included = rules.flatMap((r) => r.value.map((v) => ({ key: r.key, value: v.value, locked: locked(r.key, v.value) })))
  const excluded = rules.flatMap((r) => (Array.isArray(r.exclusions) ? r.exclusions as RuleExclusion[] : [])
    .flatMap((e) => e.value.map((v) => ({ key: e.key, value: v, locked: lockedKey(r.key) }))))

  const areaTable = (title: string, rowsT: { key: string; value: string; locked: boolean }[],
    onRemove: (key: string, v: string) => void, emptyHint: string, danger = false) => (
    <div className="min-w-0 flex-1">
      <p className="mb-1.5 text-[12px] font-bold text-ink-3">{title}</p>
      {rowsT.length === 0 ? (
        <p className="rounded-md border border-dashed border-warm-300 px-3 py-3 text-[12.5px] text-ink-3">{emptyHint}</p>
      ) : (
        <div className="max-h-64 overflow-y-auto rounded-md border border-line">
          <table className="w-full text-[13px]">
            <thead className="sticky top-0 bg-warm-25">
              <tr className="border-b border-line text-left">
                <th className="px-3 py-2 text-[12px] font-bold text-ink-3">Area</th>
                <th className="px-3 py-2 text-[12px] font-bold text-ink-3">Type</th>
                <th className="w-10 px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {rowsT.map((r) => (
                <tr key={`${r.key}:${r.value}`} className="border-b border-line/60 last:border-0">
                  <td className={`px-3 py-1.5 font-bold ${danger ? 'text-danger-fg' : 'text-ink'}`}>{r.value}</td>
                  <td className="px-3 py-1.5 text-ink-2">{geoTypeLabel(r.key)}</td>
                  <td className="px-3 py-1.5">
                    {!r.locked && (
                      <button type="button" onClick={() => onRemove(r.key, r.value)}
                        className="text-ink-3 hover:text-danger-fg"><X size={13} /></button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )

  return (
    <div className="grid gap-4">
      {!country && <p className="text-[12.5px] text-ink-3">Select a country first — service zones are defined within it.</p>}
      {baseline.current.size > 0 && (
        <p className="text-[12.5px] text-ink-3">
          Saved areas are permanent on this platform — coverage can grow but never shrink.
          To stop serving an area, disable this coverage instead.
        </p>
      )}

      {/* fixed picker rows — these never move as areas accumulate */}
      <IncludePicker label="Include" country={country}
        taken={new Set(included.map((r) => `${r.key}:${r.value}`))}
        onPick={addIncluded} />
      {exHost ? (
        <IncludePicker label="Exclude" country={country} danger
          taken={new Set(excluded.map((r) => `${r.key}:${r.value}`))}
          onPick={addExcluded} />
      ) : baseline.current.size > 0 ? (
        <p className="text-[12px] text-ink-3">
          Exclusions are permanent and can only be set while creating a coverage zone.
        </p>
      ) : null}

      {/* one table for included areas, one for excluded — side by side */}
      <div className="flex flex-wrap gap-5">
        {areaTable('Included Areas', included, removeIncluded, 'No areas yet — pick a type and add areas above.')}
        {(excluded.length > 0 || exHost) &&
          areaTable('Excluded Areas', excluded, removeExcluded, 'No exclusions — optional carve-outs inside the coverage.', true)}
      </div>
    </div>
  )
}

/** one fixed picker row: geographic type + searchable area adder */
function IncludePicker({ label, country, taken, onPick, danger }: {
  label: string
  country: string
  taken: Set<string>
  onPick: (key: string, v: string) => void
  danger?: boolean
}) {
  const [type, setType] = useState('')
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className={`w-14 text-[12.5px] font-bold ${danger ? 'text-danger-fg' : 'text-ink-3'}`}>{label}</span>
      <div className="w-44">
        <MenuSelect value={type} placeholder="Geographical type"
          options={GEO_TYPES.map((t) => t.key)} labels={geoTypeLabel} onChange={setType} />
      </div>
      {type && (
        <AreaAdder typeKey={type} country={country}
          taken={new Set([...taken].filter((t) => t.startsWith(`${type}:`)).map((t) => t.slice(type.length + 1)))}
          onPick={(v) => onPick(type, v)} />
      )}
    </div>
  )
}

/* ------------------------------------------- branch view: coverage tab ----
 * Serviceable areas always belong to a branch — the branch view page shows
 * ONLY that branch's coverage here (full management stays on the Serviceable
 * Areas tab of My Network). */

export function BranchServiceableAreas({ branch }: { branch: MasterRecord }) {
  const [rows, setRows] = useState<MasterRecord[] | null>(null)
  const [editing, setEditing] = useState<MasterRecord | null>(null)

  const load = () => {
    fetchServiceableAreas()
      .then((rs) => setRows(rs.filter((r) => Number(r.branchId) === Number(branch.id))))
      .catch(() => setRows([]))
  }
  useEffect(load, [branch.id])

  if (editing) {
    return (
      <CoverageEditor branch={branch} row={editing.id != null ? editing : undefined}
        onDone={(saved) => { setEditing(null); if (saved) load() }} />
    )
  }

  const columns: Column[] = [
    { key: 'country', label: 'Country' },
    { key: 'type', label: 'Type', render: (r: MasterRecord) => {
      const rules = Array.isArray(r.serviceableRule) ? r.serviceableRule as ServiceableRule[] : []
      return rules.map((ru) => geoTypeLabel(ru.key)).join(', ') || '—'
    } },
    { key: 'areas', label: 'Serviceable Areas', render: (r: MasterRecord) => {
      const rules = Array.isArray(r.serviceableRule) ? r.serviceableRule as ServiceableRule[] : []
      const vals = rules.flatMap((ru) => ru.value.map((v) => v.value))
      if (!vals.length) return '—'
      return (
        <span className="inline-flex flex-wrap items-center gap-1">
          {vals.slice(0, 4).map((v) => (
            <span key={v} className="rounded-full bg-warm-100 px-2 py-0.5 text-[12px] font-bold text-ink-2">{v}</span>
          ))}
          {vals.length > 4 && <span className="text-[12px] text-ink-3">+{vals.length - 4}</span>}
        </span>
      )
    } },
    { key: 'exclusions', label: 'Exclusions', render: (r: MasterRecord) => {
      const rules = Array.isArray(r.serviceableRule) ? r.serviceableRule as ServiceableRule[] : []
      const ex = rules.flatMap((ru) => (Array.isArray(ru.exclusions) ? ru.exclusions as RuleExclusion[] : []).flatMap((e) => e.value))
      return ex.length ? ex.join(', ') : '—'
    } },
    { key: 'enabled', label: 'Status', render: (r: MasterRecord) => (
      <StatusPill label={r.enabled !== false ? 'Active' : 'Inactive'} tone={r.enabled !== false ? 'success' : 'neutral'} />
    ) },
  ]

  return (
    <div>
      <DetailTabActions>
        {rows !== null && (
          <Button icon={<Plus size={13} />} onClick={() => setEditing(rows[0] ?? { enabled: true })}>
            {rows.length ? 'Edit Coverage' : 'Add Coverage'}
          </Button>
        )}
      </DetailTabActions>
      <div className="rounded-xl border border-line bg-surface p-6 shadow-ds-1">
        {rows === null ? <LoadingBox label="Loading serviceable areas…" /> : rows.length === 0 ? (
          <p className="py-6 text-center text-[13px] text-ink-3">
            No serviceable areas for this branch yet — use Add Coverage to define where it delivers.
          </p>
        ) : (
          <>
            <p className="mb-3 text-[12.5px] text-ink-3">
              Delivery coverage this branch serves — click a row or use Edit Coverage to extend it.
            </p>
            <DataTable columns={columns} rows={rows} rowKey="id"
              onRowClick={(r) => setEditing(r as MasterRecord)} />
          </>
        )}
      </div>
    </div>
  )
}

/** inline coverage editor for the branch view — create when the branch has no
 * coverage yet, append-only edit otherwise (same PUT/POST as the main tab) */
function CoverageEditor({ branch, row, skippable, onDone }: {
  branch: MasterRecord
  row?: MasterRecord
  /** stepper mode: the cancel action reads Skip */
  skippable?: boolean
  onDone: (saved: boolean) => void
}) {
  const [countries, setCountries] = useState<{ value: string; label: string }[]>([])
  const [draft, setDraft] = useState<MasterRecord>(row ?? { country: '', serviceableRule: [], enabled: true })
  const [enabled, setEnabled] = useState(row ? row.enabled !== false : true)
  const [saving, setSaving] = useState(false)

  useEffect(() => { fetchCountries().then(setCountries).catch(() => {}) }, [])

  const save = async () => {
    const rules = rulesOf(draft).filter((r) => r.key && r.value.length > 0)
    if (!String(draft.country ?? '').trim() || rules.length === 0) {
      toast.error('Pick a country and add at least one service zone.')
      return
    }
    setSaving(true)
    try {
      await saveServiceableArea({
        ...draft, enabled,
        branchId: Number(branch.id), branchName: String(branch.name ?? ''),
        source: draft.source ?? 'GLOBAL_GEOFENCES', serviceableRule: rules,
      }, row != null)
      toast.success(`Coverage ${row ? 'updated' : 'created'} for ${String(branch.name ?? '')}.`)
      onDone(true)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save coverage.')
      setSaving(false)
    }
  }

  // same anatomy as the direct Serviceable Areas form: two section cards +
  // the sticky progress footer — one look wherever coverage is edited
  const hasZone = rulesOf(draft).some((r) => r.key && r.value.length > 0)
  const reqDone = (String(draft.country ?? '').trim() ? 1 : 0) + (hasZone ? 1 : 0)

  return (
    <div>
      <div className="grid gap-5">
        <RecordCard title="Coverage Setup" done={reqDone > 0}
          meta={{ icon: <Building2 size={15} className="text-brand-500" />, caption: 'Which branch this coverage belongs to, and the country it operates in.' }}>
          <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
            <div className="min-w-0">
              <label className="mb-1.5 flex h-5 items-center text-[13.5px] text-ink">Branch</label>
              <div className="flex h-8 items-center rounded-md border border-warm-300 bg-warm-50 px-3 text-[13px] text-ink-2">
                {String(branch.name ?? '')}
              </div>
            </div>
            <div className="min-w-0">
              <label className="mb-1.5 flex h-5 items-center gap-1 text-[13.5px] text-ink">Country{!row && <span className="text-brand-500">*</span>}</label>
              {row ? (
                <div className="flex h-8 items-center rounded-md border border-warm-300 bg-warm-50 px-3 text-[13px] text-ink-2">
                  {countries.find((c) => c.value === String(draft.country))?.label ?? String(draft.country ?? '')}
                </div>
              ) : (
                <MenuSelect value={String(draft.country ?? '')} placeholder="Select country" searchable
                  options={countries.map((c) => c.value)}
                  labels={(v) => countries.find((c) => c.value === v)?.label ?? v}
                  onChange={(v) => setDraft((d) => ({ ...d, country: v }))} />
              )}
            </div>
          </div>
        </RecordCard>
        <RecordCard title="Service Zones" done={hasZone}
          meta={{ icon: <MapPinned size={15} className="text-brand-500" />, caption: 'Mark states, cities, suburbs or postal codes as serviceable.' }}>
          <RuleBuilder row={draft} set={(patch) => setDraft((d) => ({ ...d, ...patch }))} readOnly={false} />
        </RecordCard>
      </div>
      <div className="sticky bottom-0 z-10 mt-5 flex items-center gap-4 rounded-xl border border-line bg-surface px-5 py-3 shadow-ds-1">
        <span className="h-1.5 w-28 overflow-hidden rounded-full bg-warm-100">
          <span className="block h-full rounded-full bg-brand-500 transition-all" style={{ width: `${(reqDone / 2) * 100}%` }} />
        </span>
        <span className="text-[12.5px] text-ink-3">{reqDone}/2 required</span>
        <div className="ml-auto flex items-center gap-5">
          <label className="flex items-center gap-2.5 text-[13.5px] text-ink">
            Enable this serviceable area
            <Toggle checked={enabled} onChange={setEnabled} />
          </label>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => onDone(false)}>{skippable ? 'Skip' : 'Cancel'}</Button>
            <Button onClick={save} disabled={saving}>{saving ? 'Saving…' : row ? 'Save Changes' : 'Add Coverage'}</Button>
          </div>
        </div>
      </div>
    </div>
  )
}
