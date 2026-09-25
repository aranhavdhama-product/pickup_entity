/**
 * Table settings for the LOCAL Pending for Planning listing — a copy of the
 * console's Base Modules → Consignment Order page
 * (`/console/settings/base-modules/consignment_order`, `nueva/ModuleDetail.tsx`
 * → `ColumnsFiltersDetail`), running with NO session.
 *
 * The chrome is that page's, verbatim: one card, a plain tab strip, the
 * `Select All │ n/N Selected … Sequence` header, checkbox + label + sequence-box
 * rows that tint brand-50 when selected, and a `Reset … Save Settings` footer.
 * Where the console persists to moduleSettings, this persists sparse overrides
 * to localStorage (see columnConfig.ts).
 *
 * THREE THINGS THE CONSOLE PAGE HAS NO NEED FOR, because it configures one row
 * type and 65 fields while this configures two row types and 78:
 *
 *  1. APPLIES TO — the control that configures consignment fields and
 *     pickup-request fields TOGETHER. A field's CAPABILITY (which row kinds
 *     carry that datum) is declared by the registry and is not a preference;
 *     what a user may do is NARROW within it. A capability of one renders as a
 *     static badge, never a selectable chip, so the control can never claim a
 *     column applies to a row type that has no such value.
 *  2. A drag handle. The console orders rows by typing sequence numbers; here
 *     the handle IS the input and the sequence is only the storage, renumbered
 *     1..n on every drop.
 *  3. Search + group headers, because 78 rows in one flat scroll is not a list
 *     a person can work.
 */
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
/* icons come from the tree's own extracted set — this route drops the lucide icon package */
import { GripVertical, Lock, Sparkles } from './icons'
import {
  Button, Checkbox, EmptyState, PageHeader, SearchInput, StatusPill, Tabs, Tooltip,
} from '../../nueva/components'
import { toast } from '../../nueva/toast'
import {
  APPLIES_LABEL, CONSOLE_DEFAULT_COUNT, CONSOLE_FIELDS, FIELD_BY_KEY, FIELD_GROUPS,
  PLACEMENT_LABEL, REACH_LABEL, isToggleable, narrowingOptions,
  type AppliesTo, type FieldGroup,
} from './fieldRegistry'
import {
  PRESETS, STAGING_TO_FIELD, activePreset, applyPreset, hasOverrides, loadStoredConfig, resetStoredConfig,
  resolveConfig, saveStoredConfig, toStoredConfig,
  type ColumnPreset, type ResolvedColumn, type ResolvedFilter,
} from './columnConfig'
import { pickupPagesVisible, usePickupModuleConfig } from '../../config/pickupModule'
import { CONSIGNMENT_TAB_KEYS } from './viewColumns'

/** the registry keys of the consignment tabs' 19 columns */
const TAB_FIELD_KEYS = new Set<string>(CONSIGNMENT_TAB_KEYS.map((k) => STAGING_TO_FIELD[k] ?? k))

/* the console's own tab names, minus the two with no local meaning
   (General = user types, Add Form = the console's add/edit form) */
const TABS = ['Date Filter', 'Table Configuration', 'On Page Filters']

export default function TableSettings() {
  const nav = useNavigate()
  const initial = useMemo(() => resolveConfig(), [])
  const pickupTabs = pickupPagesVisible(usePickupModuleConfig())

  const [tab, setTab] = useState(1)
  /* with the pickup tabs on, the 19 staging columns are ON unless the user
     hid one here — exactly what the grid does (hiddenStagingColumns) */
  const [all, setAll] = useState<ResolvedColumn[]>(() => (pickupTabs
    ? initial.all.map((c) => (TAB_FIELD_KEYS.has(c.key) && isToggleable(c)
      ? { ...c, show: loadStoredConfig().columns?.[c.key]?.show ?? true } : c))
    : initial.all))
  const [filters, setFilters] = useState<ResolvedFilter[]>(initial.filters)
  const [dateField, setDateField] = useState(initial.dateField)
  const [q, setQ] = useState('')
  const [drag, setDrag] = useState<string | null>(null)
  /* which named column set the draft currently matches, if any — the listing's
     shipped default is the console preset (columnConfig.PRESETS) */
  const [preset, setPreset] = useState<ColumnPreset['id'] | null>(() => activePreset())
  const [over, setOver] = useState<string | null>(null)
  const [saved, setSaved] = useState(() => JSON.stringify(loadStoredConfig()))

  const draft = useMemo(() => toStoredConfig(all, filters, dateField), [all, filters, dateField])
  const dirty = JSON.stringify(draft) !== saved
  const canReset = dirty || hasOverrides()

  /* ------------------------------------------------------------- editing --- */

  const patch = (key: string, o: Partial<ResolvedColumn>) =>
    setAll((list) => list.map((c) => (c.key === key ? { ...c, ...o } : c)))

  /** Drop `fromKey` onto `toKey`, then renumber the whole list 1..n. */
  const reorder = (fromKey: string, toKey: string) => {
    if (fromKey === toKey) return
    setAll((list) => {
      const from = list.findIndex((c) => c.key === fromKey)
      const to = list.findIndex((c) => c.key === toKey)
      if (from < 0 || to < 0) return list
      const next = [...list]
      next.splice(to, 0, next.splice(from, 1)[0])
      return next.map((c, i) => ({ ...c, sequence: i + 1 }))
    })
  }

  const setEvery = (show: boolean) =>
    setAll((list) => list.map((c) => (isToggleable(c) ? { ...c, show } : c)))

  const reset = () => {
    resetStoredConfig()
    const fresh = resolveConfig({})
    setAll(fresh.all)
    setFilters(fresh.filters)
    setDateField(fresh.dateField)
    setSaved(JSON.stringify({}))
    toast.info('Settings reset to their defaults.')
  }

  const save = () => {
    saveStoredConfig(draft)
    setSaved(JSON.stringify(draft))
    toast.success('Settings saved successfully.')
  }

  /* ---------------------------------------------------------- the lists ---- */

  const needle = q.trim().toLowerCase()
  const matches = (label: string, key: string) =>
    !needle || label.toLowerCase().includes(needle) || key.toLowerCase().includes(needle)

  const shown = all.filter((c) => c.show && !c.carriedBy)
  /* owner, 2026-09-25 ("need them only"): with the pickup tabs on, the
     consignment grid is EXACTLY staging's 19 columns, so this page offers only
     those (no Active Leg — it is on the All tab, whose set is fixed). The
     module-off page keeps the full list. */
  const offered = (c: ResolvedColumn) => !pickupTabs || TAB_FIELD_KEYS.has(c.key)
  const visibleRows = all.filter((c) => matches(c.label, c.key) && offered(c))
  const groups = FIELD_GROUPS.filter((g) => visibleRows.some((c) => c.group === g))
  const filterRows = filters.filter((f) => matches(f.label, f.key))
  const allShown = all.filter(isToggleable).every((c) => c.show)

  return (
    <div className="p-6">
      <PageHeader
        title="Pending for Planning"
        onBack={() => nav('/local/pending-for-planning')}
      />

      {/* ONE card, tab strip inside it — the console page's anatomy */}
      <div className="rounded-xl border border-line bg-surface shadow-ds-1">
        <div className="px-5"><Tabs tabs={TABS} active={tab} onChange={setTab} /></div>

        <div className="px-5 py-5">
          {/* ---------------------------------------------- Date Filter ---- */}
          {tab === 0 && (
            <div>
              <div className="mb-2.5 text-[13px] font-bold text-ink-2">Default Date Field</div>
              <p className="mb-2.5 text-[12.5px] text-ink-3">
                A pickup row's date is its collection window; a consignment's is when it was created.
                One choice, so the range means one thing at a time.
              </p>
              <div className="flex flex-wrap items-center gap-2.5">
                {([['window', 'Pickup / Delivery Window'], ['createdAt', 'Created Date']] as const).map(([v, label]) => {
                  const on = dateField === v
                  return (
                    <button key={v} onClick={() => setDateField(v)}
                      className={`inline-flex h-10 items-center gap-2 rounded-md border px-3.5 text-[13.5px] transition-colors
                        ${on ? 'border-brand-500 bg-brand-50 font-bold text-brand-600' : 'border-warm-300 bg-surface text-ink-2 hover:bg-warm-50'}`}>
                      <span className={`flex h-3.5 w-3.5 items-center justify-center rounded-full border ${on ? 'border-brand-500' : 'border-warm-300'}`}>
                        {on && <span className="h-2 w-2 rounded-full bg-brand-500" />}
                      </span>
                      {label}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* ------------------------------------- Table Configuration ---- */}
          {tab === 1 && (
            <div>
              <PresetPicker
                active={preset}
                onPick={(id) => {
                  const next = applyPreset(id, toStoredConfig(all, filters, dateField))
                  const r = resolveConfig(next)
                  setAll(r.all)
                  setFilters(r.filters)
                  setPreset(id)
                }}
              />
              <Toolbar q={q} setQ={setQ} placeholder="Search columns" />
              <HeaderStrip
                allSelected={allShown}
                onToggleAll={() => setEvery(!allShown)}
                left={`${all.filter((c) => offered(c) && (c.show || !!c.carriedBy)).length}/${all.filter(offered).length} Selected`}
                right={`${CONSOLE_DEFAULT_COUNT}/${CONSOLE_FIELDS.length} console defaults`}
              />

              {groups.length === 0 ? (
                <EmptyState title="No columns match that search" hint="Clear the search to see every field." />
              ) : groups.map((g) => (
                <Group key={g} label={g}>
                  {visibleRows.filter((c) => c.group === g).map((c) => (
                    <ColumnRow
                      key={c.key} col={c}
                      dragging={drag === c.key} isOver={over === c.key && drag !== c.key}
                      onDragStart={() => setDrag(c.key)}
                      onDragEnd={() => { setDrag(null); setOver(null) }}
                      onDragOver={() => setOver(c.key)}
                      onDrop={() => { if (drag) reorder(drag, c.key); setDrag(null); setOver(null) }}
                      onToggle={() => patch(c.key, { show: !c.show })}
                      onApplies={(v) => patch(c.key, { effectiveAppliesTo: v })}
                    />
                  ))}
                </Group>
              ))}

              <Preview columns={shown.filter(offered)} />
            </div>
          )}

          {/* ------------------------------------------ On Page Filters ---- */}
          {tab === 2 && (
            <div>
              <Toolbar q={q} setQ={setQ} placeholder="Search filters" />
              <HeaderStrip
                allSelected={filters.every((f) => f.show)}
                onToggleAll={() => {
                  const next = !filters.every((f) => f.show)
                  setFilters((list) => list.map((f) => ({ ...f, show: next })))
                }}
                left={`${filters.filter((f) => f.show).length}/${filters.length} Selected`}
                right="Applies to"
              />
              {filterRows.length === 0
                ? <EmptyState title="No filters match that search" hint="Clear the search to see every filter." />
                : (
                  <div className="space-y-2">
                    {filterRows.map((f) => (
                      <FilterRow key={f.key} f={f}
                        onToggle={() => setFilters((list) => list.map((x) => (x.key === f.key ? { ...x, show: !x.show } : x)))} />
                    ))}
                  </div>
                )}
            </div>
          )}

          {/* footer — the console's Reset … Save Settings bar */}
          <div className="mt-6 flex items-center justify-between border-t border-line pt-4">
            <Button variant="ghost" onClick={reset} disabled={!canReset}>Reset</Button>
            <Button onClick={save} disabled={!dirty}>Save Settings</Button>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ bits --- */

function Toolbar({ q, setQ, placeholder }: { q: string; setQ: (v: string) => void; placeholder: string }) {
  return (
    <div className="mb-3 flex justify-end">
      <div className="w-52"><SearchInput value={q} onChange={setQ} placeholder={placeholder} /></div>
    </div>
  )
}

/** `Select All │ n/N Selected … Sequence` — the console's strip, verbatim. */
function HeaderStrip({ allSelected, onToggleAll, left, right }: {
  allSelected: boolean; onToggleAll: () => void; left: string; right: string
}) {
  return (
    <div className="flex items-center justify-between px-1 pb-2.5">
      <div className="flex items-center gap-3 text-[13px]">
        <button onClick={onToggleAll} className="font-bold text-brand-500 hover:text-brand-600">
          {allSelected ? 'Clear All' : 'Select All'}
        </button>
        <span className="border-l border-line pl-3 text-ink-3">{left}</span>
        <span className="border-l border-line pl-3 text-ink-3">{right}</span>
      </div>
      <span className="pr-4 text-[13px] font-bold text-ink">Sequence</span>
    </div>
  )
}

function Group({ label, children }: { label: FieldGroup; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <div className="mb-2 flex items-center gap-3">
        <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-ink-3">{label}</span>
        <span className="h-px flex-1 bg-line" />
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  )
}

function ColumnRow({ col, dragging, isOver, onDragStart, onDragEnd, onDragOver, onDrop, onToggle, onApplies }: {
  col: ResolvedColumn
  dragging: boolean; isOver: boolean
  onDragStart: () => void; onDragEnd: () => void; onDragOver: () => void; onDrop: () => void
  onToggle: () => void; onApplies: (v: AppliesTo) => void
}) {
  const absorbed = !!col.carriedBy
  const owner = absorbed ? FIELD_BY_KEY.get(col.carriedBy!) : undefined
  const options = narrowingOptions(col.capability)
  const selected = col.show && !absorbed

  return (
    <div
      draggable={!absorbed}
      onDragStart={onDragStart} onDragEnd={onDragEnd}
      onDragOver={(e) => { e.preventDefault(); onDragOver() }}
      onDrop={(e) => { e.preventDefault(); onDrop() }}
      className={`flex items-center gap-3 rounded-md border px-3.5 py-2.5 transition-colors
        ${isOver ? 'border-brand-500 bg-brand-100' : selected ? 'border-brand-100 bg-brand-50' : 'border-line bg-surface'}
        ${dragging ? 'opacity-40' : ''}`}>

      {absorbed
        ? <span className="w-[15px] shrink-0" />
        : <GripVertical size={15} className="shrink-0 cursor-grab text-warm-400" />}

      {col.mandatory ? (
        <Tooltip text="Required — the mixed list is unreadable without it">
          <span className="flex h-4 w-4 shrink-0 items-center justify-center text-warm-400"><Lock size={13} /></span>
        </Tooltip>
      ) : absorbed ? (
        <Tooltip text={`Always shown inside ${owner?.header ?? owner?.label}`}>
          <span className="flex h-4 w-4 shrink-0 items-center justify-center text-warm-400">↳</span>
        </Tooltip>
      ) : (
        <Checkbox checked={col.show} onChange={onToggle} />
      )}

      <span className="flex min-w-0 flex-1 items-center gap-2">
        <Tooltip text={col.note ?? col.key}>
          <span className="truncate text-[13px] text-ink">{col.label}</span>
        </Tooltip>
        {col.header && col.header !== col.label && (
          <span className="shrink-0 text-[11.5px] text-ink-3">shown as &ldquo;{col.header}&rdquo;</span>
        )}
        {absorbed && (
          <span className="shrink-0 rounded bg-warm-100 px-1.5 py-0.5 text-[10.5px] font-bold text-ink-3">
            in {owner?.header ?? owner?.label}
          </span>
        )}
        {col.isNew && (
          <Tooltip text="Not a column the console has today">
            <span className="shrink-0 text-brand-500"><Sparkles size={12} /></span>
          </Tooltip>
        )}
        {col.consoleDefault && (
          <Tooltip text="One of the 20 columns the console shows out of the box">
            <span className="shrink-0 rounded bg-warm-100 px-1.5 py-0.5 text-[10.5px] font-bold text-ink-3">Default</span>
          </Tooltip>
        )}
      </span>

      {/* APPLIES TO — consignment fields and pickup fields, configured together */}
      <span className="flex shrink-0 items-center gap-1">
        {options.length === 1 ? (
          <Tooltip text={`Only a ${APPLIES_LABEL[options[0]].toLowerCase()} row carries this value`}>
            <span className="rounded-full border border-warm-300 bg-warm-50 px-2 py-0.5 text-[11px] font-bold text-ink-3">
              {APPLIES_LABEL[options[0]]}
            </span>
          </Tooltip>
        ) : options.map((o) => (
          <button key={o} onClick={() => onApplies(o)} disabled={col.mandatory}
            className={`rounded-full border px-2 py-0.5 text-[11px] font-bold transition-colors disabled:cursor-not-allowed
              ${col.effectiveAppliesTo === o
                ? 'border-brand-500 bg-brand-500 text-white'
                : 'border-warm-300 bg-surface text-ink-3 hover:border-warm-400'}`}>
            {APPLIES_LABEL[o]}
          </button>
        ))}
      </span>

      <span className={`inline-flex h-7 w-14 shrink-0 items-center justify-center rounded-md border text-[12.5px]
        ${selected ? 'border-warm-200 bg-warm-100 text-ink-2' : 'border-line bg-warm-50 text-warm-400'}`}>
        {selected ? col.sequence : '—'}
      </span>
    </div>
  )
}

function FilterRow({ f, onToggle }: { f: ResolvedFilter; onToggle: () => void }) {
  return (
    <div className={`flex items-center gap-3 rounded-md border px-3.5 py-2.5 transition-colors
      ${f.show ? 'border-brand-100 bg-brand-50' : 'border-line bg-surface'}`}>
      <Checkbox checked={f.show} onChange={onToggle} />
      <span className="flex min-w-0 flex-1 items-center gap-2">
        <Tooltip text={f.note ?? f.key}>
          <span className="truncate text-[13px] text-ink">{f.label}</span>
        </Tooltip>
        {f.isNew && (
          <Tooltip text="Not a filter the console has today">
            <span className="shrink-0 text-brand-500"><Sparkles size={12} /></span>
          </Tooltip>
        )}
        {/* setting this filter hides every pickup row — the control must say so */}
        {f.pickup === 'no' && (
          <Tooltip text="Setting this filter excludes every pickup row from the result">
            <span className="shrink-0 rounded-full border border-warning-fg/30 bg-warning-bg px-2 py-0.5 text-[11px] font-bold text-warning-fg">
              Excludes pickups
            </span>
          </Tooltip>
        )}
      </span>
      <span className="shrink-0 text-[11.5px] text-ink-3">
        Consignment {REACH_LABEL[f.consignment]} · Pickup {REACH_LABEL[f.pickup]}
      </span>
      <span className="w-[130px] shrink-0 text-right text-[11.5px] text-ink-3">{PLACEMENT_LABEL[f.placement]}</span>
    </div>
  )
}

/** The resulting header row, at the real type scale and the real widths. */
function Preview({ columns }: { columns: ResolvedColumn[] }) {
  const total = 52 + columns.reduce((n, c) => n + (c.width ?? 120), 0)
  return (
    <div className="mt-5">
      <div className="mb-1.5 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.08em] text-ink-3">
        Preview
        <span className="rounded bg-warm-100 px-1.5 py-0.5 normal-case tracking-normal text-ink-3">
          {total}px of 1126px content width
        </span>
        {total > 1126 && <StatusPill label="Will scroll sideways" tone="warning" />}
      </div>
      <div className="overflow-x-auto rounded-md border border-line bg-surface">
        <table className="w-full table-fixed text-[13px]">
          <colgroup>
            <col style={{ width: 52 }} />
            {columns.map((c) => <col key={c.key} style={c.flexible ? undefined : { width: c.width ?? 120 }} />)}
          </colgroup>
          <thead>
            <tr className="border-b border-line bg-warm-25">
              <th className="px-4 py-2.5" />
              {columns.map((c) => (
                <th key={c.key}
                  className={`overflow-hidden whitespace-nowrap px-4 py-2.5 font-bold text-ink ${c.align === 'right' ? 'text-right' : 'text-left'}`}>
                  {c.header ?? c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(['consignment', 'pickup'] as const).map((kind) => (
              <tr key={kind} className="border-b border-line last:border-0">
                <td className="px-4 py-2" />
                {columns.map((c, i) => (
                  <td key={c.key} className={`overflow-hidden whitespace-nowrap px-4 py-2 text-[12px] text-ink-3 ${c.align === 'right' ? 'text-right' : ''}`}>
                    {i === 0
                      ? <StatusPill label={kind === 'pickup' ? 'Pickup' : 'Consignment'} tone={kind === 'pickup' ? 'warning' : 'info'} />
                      : sample(c, kind)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-1.5 text-[12px] text-ink-3">
        One sample row of each kind, so a column a pickup row cannot fill shows its stand-in before you save.
      </p>
    </div>
  )
}

/** A plausible cell for the preview — never real data, never a promise. */
function sample(c: ResolvedColumn, kind: 'consignment' | 'pickup'): string {
  const covered = c.effectiveAppliesTo === 'both'
    || (kind === 'pickup' ? c.effectiveAppliesTo === 'pickup' : c.effectiveAppliesTo === 'consignment')
  if (!covered) return '—'
  if (kind === 'pickup' && c.capability === 'consignment') return c.pickupDefault ?? '—'
  const SAMPLES: Record<string, [string, string]> = {
    orderNumber: ['GRW-100482', 'PR-000123'],
    state: ['At Facility', 'Requested'],
    window: ['18/09 09:00–13:00', '18/09 09:00–13:00'],
    shipFromName: ['Makati Flagship Store', 'Makati Flagship Store'],
    shipToName: ['Maria Santos', 'San Pablo Hub'],
    totalWeight: ['12.4 kg', '~ 38.0 kg'],
  }
  const s = SAMPLES[c.key]
  return s ? s[kind === 'pickup' ? 1 : 0] : '…'
}


/**
 * The named column sets.
 *
 * The console preset is what `/local/pending-for-planning` ships with: the
 * console's own 20 columns, in the console's order, at the measured widths — the
 * listing is a replica of that screen and horizontal scroll is part of it,
 * exactly as in production. "Unified (compact)" is the analysis workbook's
 * seven-column view, offered here as a choice rather than imposed as a default.
 */
function PresetPicker({ active, onPick }: {
  active: ColumnPreset['id'] | null
  onPick: (id: ColumnPreset['id']) => void
}) {
  return (
    <div className="mb-4 flex flex-wrap gap-2.5">
      {PRESETS.map((p) => {
        const on = active === p.id
        return (
          <button key={p.id} type="button" onClick={() => onPick(p.id)}
            className={`min-w-[240px] flex-1 rounded-md border px-4 py-3 text-left transition-colors
              ${on ? 'border-brand-500 bg-brand-50' : 'border-warm-300 bg-surface hover:bg-warm-50'}`}>
            <span className="flex items-center gap-2 text-[13.5px] font-bold text-ink">
              <span className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border ${on ? 'border-brand-500' : 'border-warm-300'}`}>
                {on && <span className="h-2 w-2 rounded-full bg-brand-500" />}
              </span>
              {p.label}
              <span className="ml-auto text-[12px] font-normal text-ink-3">{p.keys.length} columns</span>
            </span>
            <span className="mt-1 block text-[12.5px] text-ink-3">{p.description}</span>
          </button>
        )
      })}
    </div>
  )
}
