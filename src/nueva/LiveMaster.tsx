/**
 * LiveMaster — the generic live-master engine. One config per master turns the
 * verified master-service contract (POST <entity>/fetch, POST/PUT <entity>,
 * array bodies, `code` required) into a full page with the exact SKU-master
 * design: consignment-style toolbar (filters left, search + icon actions right),
 * DataTable with row-click edit, FULL-PAGE add/edit form, and bulk CSV
 * download/upload (Add = create new codes, Update = existing codes).
 *
 * Masters whose backing service is different (business parameter, reasons,
 * network/location, lanes, merchant, assets) stay on the static replica until
 * their APIs are mapped — see FAREYE-SETTINGS-APIS.md.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CheckCircle2, CircleCheck, CircleMinus, Download, Pencil, RefreshCw } from 'lucide-react'
import {
  AddUpload, AdvancedFilters, Button, ClearFilters, DataTable, ErrorBox, IconButton,
  Input, LoadingBox, MenuSelect, MultiSelect, PageHeader, PageSize, Pagination,
  SearchInput, StatusPill, Tabs, Toggle, WizardSteps, type Column,
} from './components'
import { download, isBinaryXlsx, parseCsv, parseSpreadsheetML } from './masterDataIO'
import { fetchMasterRows, saveMasterRows, type MasterRecord } from './settingsApi'
import { toast } from './toast'

export type LiveField = {
  key: string
  label: string
  /** fields sharing a section render under one uppercase heading in the form/view */
  section?: string
  type: 'text' | 'number' | 'select' | 'toggle' | 'multi' | 'custom'
  /** custom only: full-width renderer (e.g. the Branch Location map picker) */
  renderCustom?: (row: MasterRecord, set: (patch: Record<string, unknown>) => void, readOnly: boolean) => React.ReactNode
  required?: boolean
  options?: string[]
  /** async option source (another master, the hub list, …) — resolved on mount */
  optionsFrom?: () => Promise<string[]>
  /** labeled async source — value is stored (code), label is shown (name) */
  optionsFromLabeled?: () => Promise<{ value: string; label: string }[]>
  /** static value→label map (e.g. branchType sc → "Sorting Center") */
  optionLabels?: Record<string, string>
  /** search box inside the dropdown (long lists: countries, cities, zipcodes) */
  searchable?: boolean
  /** typed values not in the list can be added (staging's "add new" pattern) */
  creatable?: boolean
  /** cascading select: refetch options whenever this sibling field changes */
  dependsOn?: string
  optionsFromDep?: (depValue: string) => Promise<{ value: string; label: string }[]>
  /** conditional field — hidden (and not required) unless this returns true */
  visible?: (row: MasterRecord) => boolean
  /** multi only: the server stores a comma-joined STRING, not an array */
  asString?: boolean
  placeholder?: string
  /** default value for a fresh row */
  init?: string | number | boolean | null
}

export type LiveMasterConfig = {
  /** /master/api/v1/<entity> */
  entity: string
  title: string
  subtitle: string
  /** back target — the owning category page */
  catPath: string
  /** noun for toasts + search placeholder, e.g. "service type" */
  noun: string
  columns: Column[]
  fields: LiveField[]
  /** row keys the client-side search matches against */
  searchKeys: string[]
  /** dropdown filters; options derive from the loaded rows' values */
  filterKeys?: { key: string; label: string }[]
  /** which field is the identity (server `code` mirrors it); disabled on edit */
  codeKey?: string
  /** post-fetch row massage (derive display keys, default required write fields) */
  normalize?: (r: MasterRecord) => MasterRecord
  /** extra action(s) on the read-only VIEW page header, beside Edit */
  viewActions?: (row: MasterRecord) => React.ReactNode
  /** master-specific modal reachable from the single-selection popup
      (e.g. Branch → Manage Geofences) */
  rowModal?: { label: string; icon?: React.ReactNode; render: (row: MasterRecord, close: () => void) => React.ReactNode }
  /** custom loader (joins, filtered entities) — defaults to fetchMasterRows(entity) */
  fetchRows?: () => Promise<MasterRecord[]>
  /** async massage before any save (derive server fields, e.g. branchCode → branchId) */
  beforeSave?: (row: MasterRecord) => Promise<MasterRecord>
  /** entity has no working update API — hide Edit everywhere, keep Add */
  disableEdit?: boolean
  /** best-effort follow-up after any successful save/toggle (e.g. Branch
      dual-writes the legacy hub store so staging's own UI sees the edit) */
  afterSave?: (row: MasterRecord) => Promise<void>
  /** full write override — replaces saveMasterRows (e.g. Branch writes the
      legacy /app/rest/hubs endpoint staging's own UI uses) */
  saveRows?: (rows: MasterRecord[], exists: boolean) => Promise<void>
  /** read-only surface (list APIs whose create contract is a separate wizard) */
  disableAdd?: boolean
  /** header title on view/edit pages reads this key (e.g. branch NAME) — codeKey otherwise */
  titleKey?: string
  /** extra tabs on the record pages (view/add/edit), e.g. Branch → Geofences.
      Rendered only once the record exists (add mode shows a save-first hint). */
  detailTabs?: { label: string; render: (row: MasterRecord) => React.ReactNode }[]
  /** caption + icon per section name — the Add Consignment card chrome */
  sectionMeta?: Record<string, { caption?: string; icon?: React.ReactNode }>
  /** columns that need page actions (e.g. a count chip opening a view tab) */
  columnsWith?: (api: { openView: (row: MasterRecord, tab?: number) => void }) => Column[]
  /** multi-step Add: step titles shown as a wizard header (the form is step 1;
      after a successful create, postAddFlow renders the remaining steps) */
  addSteps?: string[]
  /** rendered after a successful ADD when addSteps is set — receives the saved
      draft and a done() that returns to the list */
  postAddFlow?: (created: MasterRecord, done: () => void) => React.ReactNode
  /** row click opens the EDIT form directly (surfaces whose edit form IS the
      best viewer, e.g. serviceable areas' coverage cards) */
  rowClickEdits?: boolean
}

const str = (v: unknown) => (v == null ? '' : String(v))
const truthy = (v: string) => ['yes', 'true', '1', 'y'].includes(v.trim().toLowerCase())
const plural = (w: string) => /(s|x|z|ch|sh)$/i.test(w) ? `${w}es` : `${w}s`
const toArr = (v: unknown): string[] =>
  Array.isArray(v) ? v.map(String) : String(v ?? '').split(/[;,]/).map((t) => t.trim()).filter(Boolean)

/** cascading dropdown — refetches its options when the field it depends on
 * changes (e.g. Zipcode ← Country). Module-level for a stable component type. */
function DepSelect({ value, depValue, fetchOptions, placeholder, searchable, creatable, onChange }: {
  value: string
  depValue: string
  fetchOptions: (dep: string) => Promise<{ value: string; label: string }[]>
  placeholder?: string
  searchable?: boolean
  creatable?: boolean
  onChange: (v: string) => void
}) {
  const [opts, setOpts] = useState<{ value: string; label: string }[]>([])
  useEffect(() => {
    let alive = true
    setOpts([])
    if (depValue) {
      fetchOptions(depValue)
        .then((o) => { if (alive) setOpts(o) })
        .catch(() => {})
    }
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [depValue])
  const labels = new Map(opts.map((o) => [o.value, o.label]))
  return (
    <MenuSelect value={value} options={opts.map((o) => o.value)} placeholder={placeholder ?? 'Select'}
      searchable={searchable} creatable={creatable} labels={(v) => labels.get(v) ?? v} onChange={onChange} />
  )
}

/** section card — the same chrome as the Add Consignment form's SectionCard.
 * MODULE-level on purpose: defining it inside the page component recreates the
 * component type every render, remounting the subtree and dropping input focus
 * after every keystroke. */
export function RecordCard({ title, meta, done, children }: {
  title: string
  meta?: { caption?: string; icon?: React.ReactNode }
  done?: boolean
  children: React.ReactNode
}) {
  return (
    <section className="rounded-xl border border-line bg-surface shadow-ds-1 overflow-hidden transition-all hover:border-warm-300">
      <div className="px-6 py-3.5 border-b border-line">
        <h2 className="flex items-center gap-2 text-[14.5px] font-bold text-ink">
          {meta?.icon}
          {title}
          {done && <CheckCircle2 size={15} className="text-success-fg" />}
        </h2>
        {meta?.caption && <p className="mt-0.5 max-w-[92ch] text-[12.5px] text-ink-3">{meta.caption}</p>}
      </div>
      <div className="px-6 py-5">{children}</div>
    </section>
  )
}

export default function LiveMaster({ cfg, embedded, onModeChange }: {
  cfg: LiveMasterConfig
  embedded?: boolean
  /** notifies the host page when a sub-page (view / add / edit) is open, so it
      can hide its own chrome (e.g. My Network's tabs) */
  onModeChange?: (inSubpage: boolean) => void
}) {
  const nav = useNavigate()
  const codeKey = cfg.codeKey ?? 'code'
  const titleKey = cfg.titleKey ?? cfg.codeKey ?? 'code'
  const [rows, setRows] = useState<MasterRecord[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [filters, setFilters] = useState<Record<string, string>>({})
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  // overflow filters (3rd onwards) live in the Consignment-style two-pane panel — multi-select
  const [moreValues, setMoreValues] = useState<Record<string, string[]>>({})
  const [draft, setDraft] = useState<MasterRecord | null>(null)
  // row click opens the read-only VIEW page (consignment convention); edit is its own page
  const [view, setView] = useState<MasterRecord | null>(null)
  // row targeted by the config's modal (opened from the single-selection popup)
  const [modalRow, setModalRow] = useState<MasterRecord | null>(null)
  // active tab on the record pages (Details is 0; cfg.detailTabs follow)
  const [detailTab, setDetailTab] = useState(0)
  const [saving, setSaving] = useState(false)
  const [dynOpts, setDynOpts] = useState<Record<string, string[]>>({})
  const [dynLabels, setDynLabels] = useState<Record<string, Record<string, string>>>({})
  const uploadMode = useRef<'add' | 'update'>('add')
  const fileRef = useRef<HTMLInputElement>(null)

  // set after a successful ADD when the config declares follow-up steps
  const [postAdd, setPostAdd] = useState<MasterRecord | null>(null)
  useEffect(() => { onModeChange?.(draft != null || view != null || postAdd != null) }, [draft, view, postAdd, onModeChange])
  useEffect(() => { if (draft == null && view == null) setDetailTab(0) }, [draft, view])

  const openView = (row: MasterRecord, tab = 0) => { setView(row); setDetailTab(tab) }

  /* dropdowns with an async source resolve in parallel with the list load */
  useEffect(() => {
    for (const f of cfg.fields) {
      if (f.optionsFrom) {
        f.optionsFrom()
          .then((opts) => setDynOpts((m) => ({ ...m, [f.key]: opts })))
          .catch(() => {})
      }
      if (f.optionsFromLabeled) {
        f.optionsFromLabeled()
          .then((pairs) => {
            setDynOpts((m) => ({ ...m, [f.key]: pairs.map((p) => p.value) }))
            setDynLabels((m) => ({ ...m, [f.key]: Object.fromEntries(pairs.map((p) => [p.value, p.label])) }))
          })
          .catch(() => {})
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const optionsFor = (f: LiveField) => f.options ?? dynOpts[f.key] ?? []
  const labelFor = (f: LiveField, v: string) => f.optionLabels?.[v] ?? dynLabels[f.key]?.[v] ?? v

  /** fields grouped by section, in order of first appearance */
  const sections = cfg.fields.reduce<{ name?: string; fields: LiveField[] }[]>((acc, f) => {
    const last = acc[acc.length - 1]
    if (last && last.name === f.section) last.fields.push(f)
    else acc.push({ name: f.section, fields: [f] })
    return acc
  }, [])

  const recordTabs = (mode: 'view' | 'edit' | 'add') => cfg.detailTabs?.length ? (
    <div className="mb-4">
      <Tabs
        tabs={[`${cfg.title} Details`, ...cfg.detailTabs.map((t) => t.label)]}
        active={detailTab} onChange={setDetailTab} />
      {mode === 'add' && detailTab > 0 && null}
    </div>
  ) : null

  /** editing copy: multi fields become arrays regardless of server storage */
  const openDraft = (rec: MasterRecord) => {
    const d: MasterRecord = { ...rec }
    for (const f of cfg.fields) if (f.type === 'multi') d[f.key] = toArr(d[f.key])
    setDraft(d)
  }

  /** wire copy: multi fields go back to the shape the server stores */
  const pack = (rec: MasterRecord): MasterRecord => {
    const d: MasterRecord = { ...rec }
    for (const f of cfg.fields) {
      // custom fields: drop only SYNTHETIC keys (e.g. branchLocation — its data
      // lives in latitude/longitude); a custom field editing a REAL row key
      // (e.g. serviceableRule) must reach the wire untouched
      if (f.type === 'custom') { if (d[f.key] === undefined) delete d[f.key]; continue }
      if (f.type !== 'multi') continue
      const arr = toArr(d[f.key])
      d[f.key] = f.asString ? arr.join(',') : arr
    }
    return d
  }

  const emptyDraft = (): MasterRecord => {
    const d: MasterRecord = { enabled: true }
    for (const f of cfg.fields) {
      if (f.type === 'custom') continue
      d[f.key] = f.init ?? (f.type === 'toggle' ? false : f.type === 'number' ? null : f.type === 'multi' ? [] : '')
    }
    d.enabled = true
    return d
  }

  const load = () => {
    setError(null)
    ;(cfg.fetchRows ? cfg.fetchRows() : fetchMasterRows(cfg.entity))
      .then((rs) => setRows(cfg.normalize ? rs.map(cfg.normalize) : rs))
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
  }
  useEffect(load, [])

  const matchOne = (r: MasterRecord, k: string, v: string) =>
    k === 'enabled' ? ((v === 'Active') === !!r.enabled) : str(r[k]) === v

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase()
    return (rows ?? []).filter((r) =>
      (!query || cfg.searchKeys.some((k) => str(r[k]).toLowerCase().includes(query))) &&
      Object.entries(filters).every(([k, v]) => !v || matchOne(r, k, v)) &&
      Object.entries(moreValues).every(([k, vals]) => !vals.length || vals.some((v) => matchOne(r, k, v))))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, q, filters, moreValues])

  // client-side paging (the service's query filters 500, so lists load whole)
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const safePage = Math.min(page, totalPages)
  const paged = filtered.slice((safePage - 1) * pageSize, safePage * pageSize)
  const rangeLabel = filtered.length === 0
    ? '0 of 0'
    : `${(safePage - 1) * pageSize + 1}-${Math.min(safePage * pageSize, filtered.length)} of ${filtered.length}`

  const filterOptions = (key: string) =>
    key === 'enabled' ? ['Active', 'Inactive'] : [...new Set((rows ?? []).map((r) => str(r[key])).filter(Boolean))]

  const submit = async () => {
    if (!draft) return
    const missing = cfg.fields.filter((f) => f.type !== 'custom' && (f.visible?.(draft) ?? true) && f.required && !str(draft[f.key]).trim())
    if (missing.length) {
      toast.error(`${missing.map((f) => f.label).join(', ')} ${missing.length === 1 ? 'is' : 'are'} required.`)
      return
    }
    setSaving(true)
    try {
      const wire = cfg.beforeSave ? await cfg.beforeSave(pack(draft)) : pack(draft)
      if (cfg.saveRows) await cfg.saveRows([wire], draft.id != null)
      else await saveMasterRows(cfg.entity, [wire], draft.id != null, codeKey)
      if (cfg.afterSave) {
        try { await cfg.afterSave(pack(draft)) } catch (e) {
          console.error('afterSave sync failed:', e)
          toast.error('Saved here, but syncing to the operational store failed.')
        }
      }
      toast.success(`${cfg.title} ${str(draft[codeKey])} ${draft.id != null ? 'updated' : 'created'} successfully.`)
      // fresh create with follow-up steps → hand off to the post-add flow
      if (draft.id == null && cfg.postAddFlow) setPostAdd(pack(draft))
      setDraft(null)
      setView(null)
      load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : `Failed to save ${cfg.noun}.`)
    } finally {
      setSaving(false)
    }
  }


  const downloadSheet = () => {
    download(`${cfg.entity}-master.csv`, 'text/csv;charset=utf-8', csvOf(rows ?? []))
    toast.info(`Downloaded ${rows?.length ?? 0} record(s) — the header row is the upload template.`)
  }

  const onFile = async (file: File) => {
    const head = new Uint8Array(await file.slice(0, 4).arrayBuffer())
    if (isBinaryXlsx(head, file.name)) {
      toast.error('Binary .xlsx is not supported here — save the sheet as CSV and retry.')
      return
    }
    const text = await file.text()
    let sheetHeaders: string[], body: string[][]
    try {
      if (text.trimStart().startsWith('<?xml')) {
        const sheet = parseSpreadsheetML(text).sheets[0]
        if (!sheet) throw new Error('no sheet')
        ;[sheetHeaders, ...body] = sheet.rows
      } else {
        ({ headers: sheetHeaders, rows: body } = parseCsv(text))
      }
    } catch {
      toast.error('Could not parse the file — expected CSV or Excel XML.')
      return
    }
    const idx = (label: string) => sheetHeaders.findIndex((h) => h.trim().toLowerCase() === label.toLowerCase())
    const statusCol = idx('Status')
    const cols = csvFields.map((f) => idx(f.label))
    const parsed: MasterRecord[] = body
      .map((r) => {
        const rec = emptyDraft()
        csvFields.forEach((f, i) => {
          const raw = cols[i] >= 0 ? (r[cols[i]] ?? '').trim() : ''
          rec[f.key] = f.type === 'toggle' ? truthy(raw)
            : f.type === 'number' ? (raw === '' ? null : Number(raw))
              : f.type === 'multi' ? toArr(raw)
                : raw
        })
        if (statusCol >= 0) rec.enabled = (r[statusCol] ?? '').trim() === '' ? true : (r[statusCol].trim().toLowerCase() !== 'inactive')
        return rec
      })
      .filter((rec) => str(rec[codeKey]).trim())
    if (!parsed.length) {
      toast.error(`No rows with a ${cfg.fields.find((f) => f.key === codeKey)?.label ?? 'code'} found in the sheet.`)
      return
    }
    const byCode = new Map((rows ?? []).map((r) => [str(r[codeKey]), r]))
    const mode = uploadMode.current
    const targets = mode === 'add'
      ? parsed.filter((r) => !byCode.has(str(r[codeKey])))
      : parsed.filter((r) => byCode.has(str(r[codeKey]))).map((r) => ({ ...r, id: byCode.get(str(r[codeKey]))!.id }))
    const skipped = parsed.length - targets.length
    if (!targets.length) {
      toast.error(mode === 'add' ? 'Every record in the sheet already exists — use Update Via Excel.' : 'No record in the sheet matches an existing code — use Add Via Excel.')
      return
    }
    try {
      const packed = targets.map(pack)
      const wired = cfg.beforeSave ? await Promise.all(packed.map(cfg.beforeSave)) : packed
      if (cfg.saveRows) await cfg.saveRows(wired, mode === 'update')
      else await saveMasterRows(cfg.entity, wired, mode === 'update', codeKey)
      toast.success(`${targets.length} record(s) ${mode === 'add' ? 'created' : 'updated'}${skipped ? ` · ${skipped} skipped` : ''}.`)
      load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Bulk save failed.')
    }
  }

  /* -------------------------------------- post-add steps (e.g. branch setup) */
  if (postAdd && cfg.postAddFlow) {
    return <div>{cfg.postAddFlow(postAdd, () => { setPostAdd(null); load() })}</div>
  }

  /* ------------------------------------------------ full-page read-only view */
  if (view && !draft) {
    const fieldValue = (f: LiveField) => {
      const v = view[f.key]
      if (f.type === 'toggle') return v ? 'Yes' : 'No'
      if (f.type === 'multi') return toArr(v).map((x) => labelFor(f, x)).join(', ') || '—'
      return str(v) ? labelFor(f, str(v)) : (f.optionLabels?.[''] ?? '—')
    }
    return (
      <div>
        <PageHeader
          title={`${cfg.title} — ${str(view[titleKey]) || str(view[codeKey])}`}
          subtitle={embedded ? undefined : cfg.subtitle}
          onBack={() => setView(null)}
          right={
            // Edit belongs to the Details tab; detail tabs (e.g. Geofences)
            // portal their own actions into this slot (see DetailTabActions)
            detailTab === 0 ? (
              <div className="flex items-center gap-2">
                {cfg.viewActions?.(view)}
                {!cfg.disableEdit && <Button icon={<Pencil size={13} />} onClick={() => openDraft(view)}>Edit</Button>}
              </div>
            ) : <div id="detail-tab-actions" className="flex items-center gap-2" />
          } />
        {recordTabs('view')}
        {detailTab > 0 && cfg.detailTabs ? (
          // detail tabs own their chrome (toolbar outside the card, card inside)
          <div>{cfg.detailTabs[detailTab - 1].render(view)}</div>
        ) : (
        <div className="grid gap-5">
          {sections.map((sec, i) => (
            <RecordCard key={sec.name ?? i} title={sec.name ?? `${cfg.title} Details`} meta={cfg.sectionMeta?.[sec.name ?? '']}>
              <div className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2 xl:grid-cols-4">
                {sec.fields.filter((f) => f.visible?.(view) ?? true).map((f) => (
                  f.type === 'custom' ? (
                    <div key={f.key} className="col-span-full min-w-0">
                      {f.label && <p className="mb-1.5 text-[12px] font-bold text-ink-3">{f.label}</p>}
                      {f.renderCustom?.(view, () => {}, true)}
                    </div>
                  ) : (
                  <div key={f.key} className="min-w-0">
                    <p className="text-[12px] font-bold text-ink-3">{f.label}</p>
                    <p className="mt-0.5 text-[13.5px] text-ink break-words">{fieldValue(f)}</p>
                  </div>
                  )
                ))}
                {i === 0 && (
                  <div className="min-w-0">
                    <p className="text-[12px] font-bold text-ink-3">Status</p>
                    <p className="mt-1"><StatusPill label={view.enabled ? 'Active' : 'Inactive'} tone={view.enabled ? 'success' : 'neutral'} /></p>
                  </div>
                )}
              </div>
            </RecordCard>
          ))}
        </div>
        )}
      </div>
    )
  }

  /* -------------------------------------------------- full-page Add/Edit form */
  if (draft) {
    const editing = draft.id != null
    return (
      <div>
        <PageHeader
          title={editing ? `Edit ${cfg.title} — ${str(draft[titleKey]) || str(draft[codeKey])}` : `Add ${cfg.title}`}
          subtitle={embedded ? undefined : cfg.subtitle} onBack={() => setDraft(null)} />
        {/* multi-step add: wizard header instead of detail tabs (follow-up
            surfaces come as their own steps, never as tabs on the add form).
            EDIT shows only the record form — related surfaces (coverage,
            zones, geofences) are edited from their own view tabs. */}
        {!editing && cfg.addSteps
          ? <WizardSteps steps={cfg.addSteps} active={0} />
          : editing && cfg.detailTabs ? null
          : recordTabs(editing ? 'edit' : 'add')}
        {detailTab > 0 && cfg.detailTabs ? (
          draft.id != null
            ? <div>{cfg.detailTabs[detailTab - 1].render(draft)}</div>
            : <div className="bg-surface border border-line rounded-xl p-6 shadow-ds-1">
                <p className="py-6 text-[13px] text-ink-3">
                  Save the {cfg.noun} first — {cfg.detailTabs[detailTab - 1].label.toLowerCase()} attach to an existing {cfg.noun}.
                </p>
              </div>
        ) : (
        <>
        <div className="grid gap-5">
          {sections.map((sec, si) => {
            const req = sec.fields.filter((f) => f.type !== 'custom' && (f.visible?.(draft) ?? true) && f.required)
            const done = req.length > 0 && req.every((f) => str(draft[f.key]).trim() !== '')
            return (
            <RecordCard key={sec.name ?? si} title={sec.name ?? `${cfg.title} Details`} done={done} meta={cfg.sectionMeta?.[sec.name ?? '']}>
            <div className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2 xl:grid-cols-4">
            {sec.fields.filter((f) => f.visible?.(draft) ?? true).map((f) => (
              f.type === 'custom' ? (
                <div key={f.key} className="col-span-full min-w-0">
                  {f.label && <label className="mb-1.5 flex h-5 items-center text-[13.5px] text-ink">{f.label}</label>}
                  {f.renderCustom?.(draft, (patch) => setDraft({ ...draft, ...patch }), false)}
                </div>
              ) : f.type === 'toggle' ? (
                <div key={f.key} className="flex items-center gap-3 pt-1">
                  <span className="text-[13.5px] text-ink">{f.label}</span>
                  <Toggle checked={!!draft[f.key]} onChange={(v) => setDraft({ ...draft, [f.key]: v })} />
                </div>
              ) : (
                <div key={f.key} className="min-w-0">
                  <label className="mb-1.5 flex h-5 items-center gap-1 whitespace-nowrap text-[13.5px] text-ink">
                    {f.label}{f.required && <span className="text-brand-500">*</span>}
                  </label>
                  {f.type === 'multi' ? (
                    <MultiSelect value={toArr(draft[f.key])} options={optionsFor(f)}
                      placeholder={f.placeholder ?? 'Select'} labels={(v) => labelFor(f, v)}
                      onChange={(v) => setDraft({ ...draft, [f.key]: v })} />
                  ) : f.type === 'select' && f.dependsOn && f.optionsFromDep ? (
                    <DepSelect value={str(draft[f.key])} depValue={str(draft[f.dependsOn])}
                      fetchOptions={f.optionsFromDep} placeholder={f.placeholder}
                      searchable={f.searchable} creatable={f.creatable}
                      onChange={(v) => setDraft({ ...draft, [f.key]: v })} />
                  ) : f.type === 'select' ? (
                    /* always a dropdown — staging renders empty selects (e.g.
                       "Select Holiday Master") when the source has no rows */
                    <MenuSelect value={str(draft[f.key])} options={optionsFor(f)}
                      placeholder={f.placeholder ?? 'Select'} searchable={f.searchable}
                      creatable={f.creatable} labels={(v) => labelFor(f, v)}
                      onChange={(v) => setDraft({ ...draft, [f.key]: v })} />
                  ) : (
                    <Input
                      type={f.type === 'number' ? 'number' : 'text'}
                      value={f.type === 'number' ? (draft[f.key] == null ? '' : str(draft[f.key])) : str(draft[f.key])}
                      placeholder={f.placeholder}
                      disabled={f.key === codeKey && editing}
                      onChange={(v) => setDraft({
                        ...draft,
                        [f.key]: f.type === 'number' ? (v.trim() === '' ? null : Number(v)) : v,
                      })} />
                  )}
                </div>
              )
            ))}
            </div>
            </RecordCard>
            )
          })}
        </div>

        {/* sticky footer — required-fields progress + global enable + actions,
            same anatomy as the Add Consignment footer */}
        {(() => {
          const req = cfg.fields.filter((f) => f.type !== 'custom' && (f.visible?.(draft) ?? true) && f.required)
          const done = req.filter((f) => str(draft[f.key]).trim() !== '').length
          const pct = req.length ? Math.round((done / req.length) * 100) : 100
          return (
            <div className="sticky bottom-0 z-10 mt-5 flex items-center gap-4 rounded-xl border border-line bg-surface px-5 py-3 shadow-ds-1">
              <span className="h-1.5 w-28 overflow-hidden rounded-full bg-warm-100">
                <span className="block h-full rounded-full bg-brand-500 transition-all" style={{ width: `${pct}%` }} />
              </span>
              <span className="text-[12.5px] text-ink-3">{done}/{req.length} required</span>
              <div className="ml-auto flex items-center gap-5">
                <label className="flex items-center gap-2.5 text-[13.5px] text-ink">
                  Enable this {cfg.noun}
                  <Toggle checked={!!draft.enabled} onChange={(v) => setDraft({ ...draft, enabled: v })} />
                </label>
                <div className="flex items-center gap-2">
                  <Button variant="outline" onClick={() => setDraft(null)}>Cancel</Button>
                  <Button onClick={submit} disabled={saving}>{saving ? 'Saving…' : editing ? 'Save Changes' : `Add ${cfg.title}`}</Button>
                </div>
              </div>
            </div>
          )
        })()}
        </>
        )}
      </div>
    )
  }

  // configs may place their own Status column; only append the default when absent
  const baseColumns = cfg.columnsWith ? cfg.columnsWith({ openView }) : cfg.columns
  const allColumns: Column[] = baseColumns.some((c) => c.key === 'enabled') ? baseColumns : [
    ...baseColumns,
    { key: 'enabled', label: 'Status', render: (r: MasterRecord) => <StatusPill label={r.enabled ? 'Active' : 'Inactive'} tone={r.enabled ? 'success' : 'neutral'} /> },
  ]

  /* enable/disable — PUTs FULL rows (the service validates required fields
     like TimeZone on every update, so partial bodies are rejected) */
  const csvFields = cfg.fields.filter((f) => f.type !== 'custom')
  const headers = ['Status', ...csvFields.map((f) => f.label)]
  const toCsvCell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)

  const csvOf = (list: MasterRecord[]) => {
    const lines = [headers.join(',')]
    for (const r of list) {
      lines.push([
        r.enabled ? 'Active' : 'Inactive',
        ...csvFields.map((f) => f.type === 'toggle' ? (r[f.key] ? 'Yes' : 'No') : f.type === 'multi' ? toArr(r[f.key]).join('; ') : str(r[f.key])),
      ].map(toCsvCell).join(','))
    }
    return lines.join('\n')
  }

  const setEnabled = async (list: MasterRecord[], v: boolean) => {
    try {
      const wires = list.map((r) => pack({ ...r, enabled: v }))
      if (cfg.saveRows) await cfg.saveRows(wires, true)
      else await saveMasterRows(cfg.entity, wires, true, codeKey)
      if (cfg.afterSave) {
        for (const r of list) {
          try { await cfg.afterSave(pack({ ...r, enabled: v })) } catch (e) { console.error('afterSave sync failed:', e) }
        }
      }
      toast.success(list.length === 1
        ? `${cfg.title} ${str(list[0][codeKey])} ${v ? 'enabled' : 'disabled'}.`
        : `${list.length} ${cfg.noun}s ${v ? 'enabled' : 'disabled'}.`)
      load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Status change failed.')
    }
  }


  return (
    <div>
      {!embedded && <PageHeader title={cfg.title} subtitle={cfg.subtitle} onBack={() => nav(cfg.catPath)} />}

      {/* toolbar mirrors the Consignment page: first 2 filters visible, the rest
          folded into More Filters, shared Clear Filters — filters left, search +
          actions right. One convention on every page. */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {(cfg.filterKeys ?? []).slice(0, 2).map((f) => (
          <div key={f.key} className="w-40">
            <MenuSelect value={filters[f.key] ?? ''} placeholder={f.label} options={filterOptions(f.key)}
              onChange={(v) => { setFilters((m) => ({ ...m, [f.key]: v })); setPage(1) }} />
          </div>
        ))}
        {(cfg.filterKeys ?? []).length > 2 && (
          <AdvancedFilters
            defs={(cfg.filterKeys ?? []).slice(2).map((f) => ({ key: f.key, label: f.label, options: filterOptions(f.key) }))}
            values={moreValues}
            onChange={(k, vals) => { setMoreValues((m) => ({ ...m, [k]: vals })); setPage(1) }} />
        )}
        <ClearFilters
          active={!!q || Object.values(filters).some(Boolean) || Object.values(moreValues).some((v) => v.length > 0)}
          onClick={() => { setQ(''); setFilters({}); setMoreValues({}); setPage(1) }} />
        <div className="ml-auto flex items-center gap-2 shrink-0">
          <div className="w-52"><SearchInput value={q} onChange={(v) => { setQ(v); setPage(1) }} placeholder={`Search ${cfg.noun}s`} /></div>
          <IconButton icon={<RefreshCw size={15} />} title="Refresh" onClick={load} />
          <IconButton icon={<Download size={15} />} title={`Download ${cfg.noun}s (CSV)`} onClick={downloadSheet} />
          {!cfg.disableAdd && <AddUpload
            onAdd={() => openDraft(emptyDraft())}
            onUpload={(mode) => { uploadMode.current = mode; fileRef.current?.click() }} />}
          <input
            ref={fileRef} type="file" accept=".csv,.xls,.xml" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = '' }} />
        </div>
      </div>

      {modalRow && cfg.rowModal?.render(modalRow, () => setModalRow(null))}

      {error ? <ErrorBox error={error} onRetry={load} />
        : rows === null ? <LoadingBox label={`Loading ${cfg.noun} master…`} />
          : <>
            <DataTable columns={allColumns} rows={paged} rowKey="id" selectable
              selectionActions={(sel, clear) => {
                // context-aware: only offer the state change that applies to the
                // selection — disabled rows get Enable, enabled rows get Disable
                // (a mixed multi-selection gets both). Single selection adds the
                // row-level actions; multi keeps state changes + export only.
                const single = sel.length === 1 ? (sel[0] as MasterRecord) : null
                const disabled = (sel as MasterRecord[]).filter((r) => !r.enabled)
                const enabled = (sel as MasterRecord[]).filter((r) => !!r.enabled)
                return [
                  ...(disabled.length ? [{ label: `Enable ${disabled.length === 1 ? cfg.title : plural(cfg.title)}`, icon: <CircleCheck size={14} />, onClick: () => { setEnabled(disabled, true); clear() } }] : []),
                  ...(enabled.length ? [{ label: `Disable ${enabled.length === 1 ? cfg.title : plural(cfg.title)}`, icon: <CircleMinus size={14} />, onClick: () => { setEnabled(enabled, false); clear() } }] : []),
                  ...(single ? [
                    ...(!cfg.disableEdit ? [{ label: `Edit ${cfg.title}`, icon: <Pencil size={14} />, onClick: () => { clear(); openDraft(single) } }] : []),
                    ...(cfg.rowModal ? [{ label: cfg.rowModal.label, icon: cfg.rowModal.icon, onClick: () => setModalRow(single) }] : []),
                  ] : [
                    { label: 'Download CSV', icon: <Download size={14} />, onClick: () => download(`${cfg.entity}-selected.csv`, 'text/csv;charset=utf-8', csvOf(sel as MasterRecord[])) },
                  ]),
                ]
              }}
              onRowClick={(r) => cfg.rowClickEdits && !cfg.disableEdit ? openDraft(r as MasterRecord) : openView(r as MasterRecord)} />
            <div className="flex items-center justify-between gap-3">
              <div className="flex-1"><Pagination page={safePage} total={totalPages} range={rangeLabel} onChange={setPage} /></div>
              <div className="pt-3"><PageSize value={pageSize} onChange={(n) => { setPageSize(n); setPage(1) }} /></div>
            </div>
          </>}
    </div>
  )
}
