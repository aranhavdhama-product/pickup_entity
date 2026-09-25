import { useState, useRef, useEffect, Fragment, useContext } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  MASTERS, SUB_ICONS, findCategory, findSub, toneFor,
  type SubMaster, type EntityTab, type FilterDef, type AddForm,
} from './mastersTree'
import {
  Button, ListCard, PageHeader, Tabs, StatusDot, KebabMenu, ConfirmDialog,
  PageSize, Checkbox, Modal, EmptyState, SearchInput, Toggle, Tooltip,
  UploadDataModal, MoreFilters, FilterDropdown, ClearFilters, AddUpload, Select, Field, Input,
} from './components'
import { MasterFormBody } from './MasterForm'
import { MastersEnvContext, type MasterRow } from './mastersEnv'
import { DATASTORES } from './masterDataIO'
import {
  Upload, Download, RefreshCw, MapPinned, ChevronDown, ChevronLeft, ChevronRight,
  ChevronsUpDown, Pencil, Trash2, X, Info, Plus, Clock,
} from 'lucide-react'

/* every master shows search + at least 2 common filters */
function ensureFilters(sub: SubMaster): string[] {
  const out = [...(sub.filters ?? [])]
  const candidates = [...(sub.columns ?? []).filter((c) => !c.status).map((c) => c.label), 'Status', 'Created On']
  for (const c of candidates) { if (out.length >= 2) break; if (!out.includes(c)) out.push(c) }
  return out
}

/* functional filter defs (label + row key + options) — explicit or derived from column values */
function getFilterDefs(sub: SubMaster): FilterDef[] {
  if (sub.filterDefs) return sub.filterDefs
  const cols = sub.columns ?? []
  const rows = sub.rows ?? []
  return ensureFilters(sub).map((label) => {
    const col = cols.find((c) => c.label === label)
    const key = col?.key ?? label
    const options = col ? Array.from(new Set(rows.map((r) => String(r[key] ?? '')).filter(Boolean))) : []
    return { label, key, options }
  })
}

/* ---------------- Masters landing ---------------- */
const MASTER_NAMES = DATASTORES.map((d) => d.name)

export function MastersLanding() {
  const { base } = useContext(MastersEnvContext)
  const nav = useNavigate()
  const [upload, setUpload] = useState<'bulk' | 'update' | null>(null)
  return (
    <div className="max-w-5xl">
      <div className="bg-surface border border-line rounded-lg px-5 py-4 flex items-center gap-4 mb-4">
        <div className="flex-1">
          <h3 className="text-[15px] font-bold text-ink">Bulk Upload &amp; Update Master Data</h3>
          <p className="text-[13px] text-ink-3">Add new records or update existing ones in one go. Download, fill in, and upload back.</p>
        </div>
        <div className="flex items-center gap-1">
          <Button icon={<Upload size={15} />} onClick={() => setUpload('bulk')}>Bulk Upload</Button>
          <KebabMenu items={[{ label: 'Bulk Update', onClick: () => setUpload('update') }]} />
        </div>
      </div>
      <div className="space-y-4">
        {MASTERS.map((c) => {
          const Icon = c.icon
          return <ListCard key={c.id} icon={<Icon size={20} />} title={c.name} desc={c.desc} onClick={() => nav(`${base}/${c.id}`)} />
        })}
      </div>
      <UploadDataModal open={!!upload} mode={upload === 'update' ? 'update' : undefined}
        onClose={() => setUpload(null)} masterOptions={MASTER_NAMES} />
    </div>
  )
}

/* ---------------- Category → sub-master CARDS (click opens a new page) ---------------- */
export function CategoryPage() {
  const nav = useNavigate()
  const env = useContext(MastersEnvContext)
  const params = useParams()
  const cat = findCategory(env.catId ?? params.catId)
  if (!cat) return <EmptyState title="Category not found" />
  return (
    <div className="max-w-5xl">
      <PageHeader title={cat.name} subtitle={cat.desc} onBack={() => nav(env.backTo ?? env.base)} />
      <div className="space-y-4">
        {cat.subs.map((s) => {
          const Icon = SUB_ICONS[s.id] ?? cat.icon
          return (
            <ListCard key={s.id} icon={<Icon size={20} />} title={s.name} badge={s.badge} desc={s.desc}
              onClick={() => nav(`${env.base}/${cat.id}/${s.id}`)} />
          )
        })}
      </div>
    </div>
  )
}

/* ---------------- Sub-master page (new page) — single-level entity tabs ---------------- */
export function SubMasterPage() {
  const nav = useNavigate()
  const env = useContext(MastersEnvContext)
  const params = useParams()
  const catId = env.catId ?? params.catId
  const cat = findCategory(catId)
  const sub = findSub(catId, params.subId)
  /* `?tab=<slug of an entity tab title>` deep-links an inner tab (e.g. reason-master?tab=reason-policy) */
  const [search] = useSearchParams()
  const [tab, setTab] = useState(() => {
    const want = (search.get('tab') ?? '').toLowerCase()
    const i = want ? (sub?.entityTabs ?? []).findIndex((t) => t.title.toLowerCase().replace(/[^a-z0-9]+/g, '-') === want) : -1
    return i < 0 ? 0 : i
  })
  const [pageForm, setPageForm] = useState<OpenFormArgs | null>(null)
  if (!cat || !sub) return <EmptyState title="Master not found" />

  // Full-page Add/Edit form — single consistent header
  if (pageForm) {
    return (
      <div>
        <PageHeader title={pageForm.title} subtitle={pageForm.form.pageHelp} onBack={() => setPageForm(null)} />
        <div className="bg-surface border border-line rounded-xl p-6 md:p-8 shadow-ds-1">
          {pageForm.form.custom === 'businessParameter'
            ? <BusinessParameterForm onSubmit={() => setPageForm(null)} />
            : pageForm.form.custom === 'lineHaulLane'
            ? <LineHaulLaneForm onSubmit={() => setPageForm(null)} />
            : pageForm.form.custom === 'hubToHub'
            ? <HubToHubForm onSubmit={() => setPageForm(null)} />
            : <MasterFormBody key={pageForm.title} form={pageForm.form} initial={pageForm.initial} onCancel={() => setPageForm(null)}
                onSubmit={(values) => { pageForm.onSave?.(values); setPageForm(null) }} />}
        </div>
      </div>
    )
  }

  return (
    <div>
      <PageHeader title={sub.name} subtitle={sub.desc} onBack={() => nav(`${env.base}/${cat.id}`)} />
      {sub.entityTabs ? (
        <>
          <Tabs tabs={sub.entityTabs.map((t) => t.title)} active={tab} onChange={setTab} />
          <div className="mt-4">
            <EntityContent tab={sub.entityTabs[tab]} onOpenForm={setPageForm} />
          </div>
        </>
      ) : (
        <MasterTablePanel sub={sub} onOpenForm={setPageForm} />
      )}
    </div>
  )
}

export type OpenFormArgs = { form: AddForm; title: string; initial?: MasterRow; onSave?: (values: MasterRow) => void }
export type OpenForm = (v: OpenFormArgs) => void
export function EntityContent({ tab, onOpenForm }: { tab: EntityTab; onOpenForm: OpenForm }) {
  if (tab.kind === 'zone') return <ZoneMaster />
  return <MasterTablePanel key={tab.sub!.id} sub={tab.sub!} onOpenForm={onOpenForm} />
}

/* ---------------- Serviceable Area modal (opened from a row's "Add Area" action) ---------------- */
function ServiceableAreaModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [granular, setGranular] = useState(false)
  return (
    <Modal title="Add Serviceable Area" open={open} onClose={onClose} wide
      footer={<>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={onClose}>Update</Button>
      </>}>
      <div className="grid grid-cols-1 md:grid-cols-[1fr_300px] gap-6 py-1">
        <div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-4">
            <Field label="Branch" required>
              <Select value="" placeholder="Select branch" options={['Delhi Hub', 'Banglore Flipart Hub', 'Mumbai Hub']} onChange={() => {}} />
            </Field>
            <Field label="Country" required>
              <Select value="" placeholder="Select country" options={['India', 'US', 'UK', 'UAE']} onChange={() => {}} />
            </Field>
          </div>
          <div className="mt-6">
            <div className="flex items-center justify-between gap-3">
              <span className="inline-flex items-center gap-1.5 text-[14px] text-ink">
                Add Granular serviceable areas within the selected Countries
                <Info size={14} className="text-warm-400" />
              </span>
              <Toggle checked={granular} onChange={setGranular} />
            </div>
            <p className="text-[12px] text-ink-3 mt-1.5">Specify postal codes, suburbs, cities or states. Leave unchecked to add the entire country</p>
          </div>
        </div>
        <div className="rounded-xl border border-line bg-warm-50 p-4 text-[13px] text-ink-2 leading-relaxed">
          <div className="flex items-center gap-1.5 font-bold text-ink mb-3"><Info size={14} className="text-warm-400" />Helpful FAQs</div>
          <p className="font-bold text-ink mb-2">Serviceable Areas</p>
          <p className="font-bold text-ink mb-1">Select Area</p>
          <p className="mb-1">Choose the type (e.g., country, state, city) and its value to mark the entire area as serviceable.</p>
          <p className="mb-3">Example: Selecting "United States" and "California" makes all locations in California serviceable.</p>
          <p className="font-bold text-ink mb-1">Exclude Area</p>
          <p className="mb-1">Refine your selection by excluding specific cities, counties, towns, or zip codes.</p>
          <p className="mb-3">Example: Exclude "San Francisco" after selecting "California."</p>
          <p className="font-bold text-ink mb-1">Benefits</p>
          <p className="mb-1"><span className="font-bold text-ink">Save Time:</span> Define broad areas quickly and fine-tune by exclusions instead of selecting manually.</p>
          <p><span className="font-bold text-ink">Flexibility:</span> Manage serviceability down to specific zip codes with ease.</p>
        </div>
      </div>
    </Modal>
  )
}

/* ---------------- Multi-tag value selector (Business Parameter values) ---------------- */
function MultiTagSelect({ values, options, onChange }: { values: string[]; options: string[]; onChange: (v: string[]) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [open])
  const toggle = (o: string) => onChange(values.includes(o) ? values.filter((x) => x !== o) : [...values, o])
  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen((o) => !o)}
        className="w-full min-h-8 flex items-center gap-1 flex-wrap rounded-md border border-warm-300 bg-warm-50 pl-2 pr-8 py-1 text-left">
        {values.length === 0
          ? <span className="text-[13px] text-warm-400">Values</span>
          : values.map((v) => <span key={v} className="inline-flex items-center rounded bg-warm-200 px-2 py-0.5 text-[12px] text-ink">{v}</span>)}
        <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-warm-400" />
      </button>
      {open && (
        <div className="absolute z-30 mt-1 left-0 w-full bg-surface border border-line rounded-lg shadow-ds-overlay py-1 max-h-56 overflow-y-auto">
          {options.map((o) => (
            <button type="button" key={o} onClick={() => toggle(o)}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-[13px] text-ink hover:bg-warm-50 text-left">
              <Checkbox checked={values.includes(o)} />{o}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/* ---------------- Business Parameter — bespoke multi-row builder ---------------- */
const PARAM_VALUE_OPTIONS = ['Tata', 'Mahindra', 'Ashok Leyland', 'Volvo', 'Eicher', 'BharatBenz']
function BusinessParameterForm({ onSubmit }: { onSubmit: () => void }) {
  const [rows, setRows] = useState<{ name: string; values: string[] }[]>([
    { name: 'Truck', values: ['Tata', 'Mahindra'] },
    { name: '', values: [] },
    { name: '', values: [] },
  ])
  const setName = (i: number, v: string) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, name: v } : r)))
  const setValues = (i: number, vals: string[]) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, values: vals } : r)))
  const addRow = () => setRows((rs) => [...rs, { name: '', values: [] }])
  const removeRow = (i: number) => setRows((rs) => (rs.length > 1 ? rs.filter((_, j) => j !== i) : rs))
  return (
    <div>
      <div className="grid grid-cols-[1fr_1fr_2.5rem] gap-x-6 items-start">
        <div className="text-[12px] font-bold uppercase tracking-wide text-ink-2 mb-1.5"><span className="text-brand-500">*</span> Parameter Name</div>
        <div className="text-[12px] font-bold uppercase tracking-wide text-ink-2 mb-1.5"><span className="text-brand-500">*</span> Parameter Values</div>
        <div />
        {rows.map((r, i) => (
          <Fragment key={i}>
            <div className="mb-4">
              <Input value={r.name} placeholder="Type name" onChange={(v) => setName(i, v)} />
              <p className="text-[12px] text-ink-3 mt-1.5">Code: {r.name.trim().toLowerCase()}</p>
            </div>
            <div className="mb-4">
              <MultiTagSelect values={r.values} options={PARAM_VALUE_OPTIONS} onChange={(vals) => setValues(i, vals)} />
            </div>
            <div className="mb-4 flex items-center h-8 justify-center">
              {i > 0 && (
                <button type="button" onClick={() => removeRow(i)} title="Remove" className="text-st-danger/80 hover:text-st-danger"><Trash2 size={16} /></button>
              )}
            </div>
          </Fragment>
        ))}
      </div>
      <button type="button" onClick={addRow} className="inline-flex items-center gap-1.5 text-[14px] font-medium text-brand-500 hover:text-brand-600 mt-1">
        <Plus size={16} />Add Row
      </button>
      <div className="flex justify-end mt-6">
        <Button onClick={onSubmit}>Save Parameters</Button>
      </div>
    </div>
  )
}

/* ---------------- Line Haul Lane — bespoke run + connection builder ---------------- */
function UncontrolledSelect({ placeholder, options }: { placeholder: string; options: string[] }) {
  const [v, setV] = useState('')
  return <Select value={v} placeholder={placeholder} options={options} onChange={setV} />
}
function LhlTimeCell() {
  return (
    <div className="flex items-center gap-1">
      <div className="relative flex-1 min-w-0">
        <input placeholder="Select" className="h-8 w-full rounded-md border border-warm-300 bg-surface pl-2 pr-7 text-[13px] text-ink placeholder:text-warm-400 focus:border-brand-500 focus:outline-none" />
        <Clock size={13} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-warm-400" />
      </div>
      <span className="text-[12px] text-ink-3 whitespace-nowrap">(+0)</span>
    </div>
  )
}
const LHL_STOPS = ['nyc', 'ord', 'lax', 'dfw', 'atl']
const LHL_GRID = 'grid grid-cols-[60px_120px_1.3fr_84px_1.3fr_96px_84px_36px] gap-x-3 items-center'
function LhlStopCells({ full }: { full: boolean }) {
  const text = (ph: string) => <input placeholder={ph} className="h-8 w-full rounded-md border border-warm-300 bg-surface px-2 text-[13px] text-ink placeholder:text-warm-400 focus:border-brand-500 focus:outline-none" />
  return (
    <>
      <div><UncontrolledSelect placeholder="Select" options={LHL_STOPS} /></div>
      <LhlTimeCell />
      <div>{full ? text('E…') : null}</div>
      <div>{full ? <LhlTimeCell /> : null}</div>
      <div>{full ? text('En…') : null}</div>
      <div>{full ? text('En…') : null}</div>
    </>
  )
}
function LineHaulLaneForm({ onSubmit }: { onSubmit: () => void }) {
  const [mids, setMids] = useState<number[]>([0])
  const [seq, setSeq] = useState(1)
  const addStop = () => { setMids((m) => [...m, seq]); setSeq((s) => s + 1) }
  const removeStop = (id: number) => setMids((m) => m.filter((x) => x !== id))
  return (
    <div>
      <h3 className="text-[16px] font-bold text-ink">Add Run Details</h3>
      <div className="h-px bg-line mt-3 mb-5" />
      <div className="grid grid-cols-2 gap-x-10 gap-y-5">
        <Field label="Code" required plain><Input placeholder="Enter" /></Field>
        <Field label="Mode" required plain><UncontrolledSelect placeholder="Select" options={['ROAD', 'AIR', 'RAIL', 'SEA']} /></Field>
        <Field label="Preferred Transporter" plain><Input placeholder="Enter" /></Field>
        <Field label="Service Type" plain><UncontrolledSelect placeholder="Select" options={['EXPRESS', 'STANDARD', 'ECONOMY']} /></Field>
        <Field label="Max Weight" plain><Input placeholder="Enter" /></Field>
        <Field label="Max Volume" plain><Input placeholder="Enter" /></Field>
        <Field label="Item Value Limit" plain><Input placeholder="Enter" /></Field>
      </div>

      <h3 className="text-[16px] font-bold text-ink mt-8">Add Connection Details</h3>
      <div className="mt-4 rounded-lg border border-line overflow-x-auto">
        <div className={`${LHL_GRID} px-4 py-3 bg-thead text-[12px] font-bold text-ink-3 min-w-[760px]`}>
          <div />
          <div>Stops <span className="text-brand-500">*</span></div>
          <div>STA</div>
          <div>Docking Time (in hrs)</div>
          <div>STD</div>
          <div>Travel Duration (in hrs)</div>
          <div>Distance (KM)</div>
          <div />
        </div>
        <div className="px-4 py-4 space-y-4 min-w-[760px]">
          <div className={LHL_GRID}>
            <div className="text-[13px] font-medium text-ink-2">Origin</div>
            <LhlStopCells full />
            <div />
          </div>
          {mids.map((id, i) => (
            <div key={id} className={LHL_GRID}>
              <div className="flex items-center justify-center"><span className="h-6 w-6 inline-flex items-center justify-center rounded-full border border-warm-300 text-[12px] text-ink-2">{i + 1}</span></div>
              <LhlStopCells full />
              <button type="button" onClick={() => removeStop(id)} title="Remove stop" className="text-st-danger/80 hover:text-st-danger justify-self-center"><Trash2 size={15} /></button>
            </div>
          ))}
          <div className={LHL_GRID}>
            <div className="text-[13px] font-medium text-ink-2">Dest</div>
            <LhlStopCells full={false} />
            <div />
          </div>
          <button type="button" onClick={addStop} className="inline-flex items-center gap-1.5 text-[13px] font-medium text-brand-500 hover:text-brand-600"><Plus size={15} />Add Stop</button>
        </div>
      </div>

      <div className="flex justify-end mt-6">
        <Button onClick={onSubmit}>Save</Button>
      </div>
    </div>
  )
}

/* ---------------- Hub To Hub — simple facility-mapping page form ---------------- */
function HubToHubForm({ onSubmit }: { onSubmit: () => void }) {
  return (
    <div>
      <div className="grid grid-cols-2 gap-x-10 gap-y-5">
        <Field label="Origin Facility" required plain><UncontrolledSelect placeholder="Select Origin" options={['NYC', 'ORD', 'LAX', 'DFW', 'ATL']} /></Field>
        <Field label="Destination Facility" required plain><UncontrolledSelect placeholder="Select Destination" options={['ORD', 'NYC', 'LAX', 'DFW', 'ATL']} /></Field>
        <Field label="Next Facility" plain><UncontrolledSelect placeholder="Select Next Facility" options={['ORD', 'NYC', 'LAX', 'DFW', 'ATL']} /></Field>
        <Field label="Lane" plain><UncontrolledSelect placeholder="Select Lane" options={['nyc-ord', 'ord-lax', 'lax-dfw']} /></Field>
      </div>
      <div className="flex justify-end mt-6"><Button onClick={onSubmit}>Save</Button></div>
    </div>
  )
}

/* ---------------- Standardized table panel ---------------- */
function MasterTablePanel({ sub, onOpenForm }: { sub: SubMaster; onOpenForm: OpenForm }) {
  const { persist } = useContext(MastersEnvContext)
  const [rows, setRows] = useState<MasterRow[]>(() => persist?.load(sub.id) ?? sub.rows ?? [])
  // write-through when mounted with a persist (local app); the first render is the loaded state
  const loadedRows = useRef(rows)
  useEffect(() => { if (persist && rows !== loadedRows.current) persist.save(sub.id, rows) }, [persist, rows, sub.id])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [confirm, setConfirm] = useState<{ rows: any[]; label: string } | null>(null)
  const [statusConfirm, setStatusConfirm] = useState<{ rows: any[]; toEnable: boolean } | null>(null)
  const [upload, setUpload] = useState<'add' | 'update' | null>(null)
  const [areaOpen, setAreaOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState<Record<string, string>>({})
  const cols = sub.columns ?? []
  const form = sub.addForm
  const filterDefs = getFilterDefs(sub)
  const setFilter = (k: string, v: string) => setFilters((s) => ({ ...s, [k]: v }))
  const hasActiveFilters = !!search || Object.values(filters).some(Boolean)
  const clearFilters = () => { setSearch(''); setFilters({}) }

  const viewRows = rows.filter((r) => {
    if (search) { const q = search.toLowerCase(); if (!cols.some((c) => String(r[c.key] ?? '').toLowerCase().includes(q))) return false }
    for (const [k, v] of Object.entries(filters)) { if (v && String(r[k] ?? '') !== v) return false }
    return true
  })

  const allChecked = viewRows.length > 0 && viewRows.every((r) => selected.has(r.id))
  const someChecked = selected.size > 0 && !allChecked
  const toggleAll = () => setSelected(allChecked ? new Set() : new Set(viewRows.map((r) => r.id)))
  const toggle = (k: string) => setSelected((s) => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n })

  // Every master opens its Add/Edit as a FULL PAGE (modal-kind forms are
  // coerced to page — same pattern as the live SKU master).
  const openForm = (mode: 'Add' | 'Edit', row?: MasterRow) => {
    if (!form) return
    onOpenForm({
      form: form.kind === 'page' ? form : { ...form, kind: 'page' }, title: `${mode} ${form.pageTitle ?? sub.name}`,
      initial: row && persist ? persist.toValues(sub, row) : undefined,
      onSave: persist ? (values) => persist.upsert(sub, values, row?.id) : undefined,
    })
  }
  const openAdd = () => openForm('Add')
  const openEdit = (row: MasterRow) => openForm('Edit', row)
  const activated = (r: any) => !/(deactiv|disabl|inactive)/i.test(String(r.status ?? 'Enabled'))
  const isActive = activated

  const deleteRows = (list: any[]) => {
    const ids = new Set(list.map((r) => r.id))
    setRows((rs) => rs.filter((r) => !ids.has(r.id)))
    setSelected(new Set()); setConfirm(null)
  }
  const toggleStatus = (list: any[]) => {
    const ids = new Set(list.map((r) => r.id))
    setRows((rs) => rs.map((r) => ids.has(r.id) ? { ...r, status: isActive(r) ? 'Inactive' : 'Active' } : r))
    setSelected(new Set())
  }
  const setStatusValue = (list: any[], value: string) => {
    const ids = new Set(list.map((r) => r.id))
    setRows((rs) => rs.map((r) => ids.has(r.id) ? { ...r, status: value } : r))
    setSelected(new Set())
  }
  const requestStatusChange = (list: any[], toEnable: boolean) => setStatusConfirm({ rows: list, toEnable })
  const exportRows = (list: any[]) => {
    const data = list.length ? list : rows
    const header = cols.map((c) => c.label).join(',')
    const body = data.map((r) => cols.map((c) => `"${String(r[c.key] ?? '').replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([header + '\n' + body], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `${sub.name.replace(/\s+/g, '_')}.csv`; a.click()
    URL.revokeObjectURL(url)
  }
  const selectedRows = () => rows.filter((r) => selected.has(r.id))

  return (
    <div>
      {/* Filter + actions toolbar — always one line: search shrinks, everything else fixed */}
      <div className="flex items-center gap-2 mb-4 flex-nowrap">
        <div className="relative w-60 min-w-[120px]"><SearchInput placeholder={`Search ${sub.name}`} value={search} onChange={setSearch} /></div>
        {filterDefs.slice(0, 2).map((d) => (
          <FilterDropdown key={d.key} label={d.label} options={d.options} value={filters[d.key]} onChange={(v) => setFilter(d.key, v)} />
        ))}
        <MoreFilters defs={filterDefs.slice(2)} values={filters} onChange={setFilter} />
        <ClearFilters onClick={clearFilters} active={hasActiveFilters} />
        <div className="ml-auto flex items-center gap-3 shrink-0">
          {sub.activateOnly && (
            <button
              disabled={selected.size === 0}
              onClick={() => requestStatusChange(selectedRows(), selectedRows().some((r) => !activated(r)))}
              className={`shrink-0 whitespace-nowrap inline-flex items-center gap-1.5 px-1 text-[14px] font-bold transition-colors
                ${selected.size === 0 ? 'text-warm-400 cursor-not-allowed' : 'text-brand-500 hover:text-brand-600'}`}>
              <RefreshCw size={15} />Enable / Disable
            </button>
          )}
          <Tooltip text="Export" side="bottom">
            <button onClick={() => exportRows([])}
              className="shrink-0 h-8 w-9 inline-flex items-center justify-center rounded-[10px] border border-warm-100 bg-surface text-ink hover:bg-warm-50">
              <Download size={16} />
            </button>
          </Tooltip>
          <AddUpload onAdd={openAdd} onUpload={(m) => setUpload(m)} />
        </div>
      </div>

      {/* Multiselect bulk-action bar (standard masters only — activate-only masters use the toolbar Enable/Disable button) */}
      {selected.size > 0 && !sub.activateOnly && (
        <div className="flex items-center gap-1 h-11 px-3 mb-3 bg-warm-50 border border-warm-200 rounded-lg text-[13px]">
          <span className="inline-flex items-center justify-center h-6 min-w-6 px-1.5 rounded-full bg-brand-500 text-white text-[12px] font-bold">{selected.size}</span>
          <span className="font-bold text-ink ml-1.5">selected</span>
          <span className="h-5 w-px bg-warm-200 mx-2.5" />
          <button onClick={() => exportRows(selectedRows())} className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md text-ink-2 hover:bg-surface"><Download size={14} />Export</button>
          <button onClick={() => toggleStatus(selectedRows())} className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md text-ink-2 hover:bg-surface"><RefreshCw size={14} />Activate / Deactivate</button>
          <button onClick={() => setConfirm({ rows: selectedRows(), label: `${selected.size} ${sub.name} record(s)` })}
            className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md text-st-danger hover:bg-surface"><Trash2 size={14} />Delete</button>
          <button onClick={() => setSelected(new Set())} className="ml-auto inline-flex items-center gap-1 h-7 px-2 rounded-md text-ink-3 hover:text-ink hover:bg-surface"><X size={14} />Clear</button>
        </div>
      )}

      {/* Table */}
      <div className="bg-surface border border-line rounded-xl overflow-hidden shadow-ds-1">
        <div className="overflow-x-auto">
          <table className="w-full text-[14px]">
            <thead>
              <tr className="bg-thead border-b border-line">
                <th className="w-10 px-4 py-3 text-left"><Checkbox checked={allChecked} indeterminate={someChecked} onChange={toggleAll} /></th>
                {cols.map((c) => (
                  <th key={c.key} style={c.minWidth ? { minWidth: c.minWidth } : undefined} className={`px-4 py-3 font-bold text-ink-3 whitespace-nowrap ${c.align === 'right' ? 'text-right' : 'text-left'}`}>
                    <span className="inline-flex items-center gap-1">{c.label}{c.sortable && <ChevronsUpDown size={12} className="text-warm-400" />}</span>
                  </th>
                ))}
                <th className="sticky right-0 z-20 bg-thead border-l border-line px-4 py-3 text-left font-bold text-ink-3 shadow-[-7px_0_9px_-3px_rgba(32,44,57,0.16)]">Action</th>
              </tr>
            </thead>
            <tbody>
              {viewRows.map((row) => {
                const sel = selected.has(row.id)
                return (
                  <tr key={row.id} onClick={form ? () => openEdit(row) : undefined}
                    className={`group border-b border-line last:border-0 align-top transition-colors ${form ? 'cursor-pointer' : ''} ${sel ? 'bg-warm-100' : 'hover:bg-warm-50'}`}>
                    <td className="px-4 py-3.5" onClick={(e) => e.stopPropagation()}><Checkbox checked={sel} onChange={() => toggle(row.id)} /></td>
                    {cols.map((c, ci) => {
                      const empty = row[c.key] === '' || row[c.key] == null
                      const isLink = ci === 0 && sub.linkFirstColumn !== false
                      return (
                        <td key={c.key} style={c.minWidth ? { minWidth: c.minWidth } : undefined} className={`px-4 py-3.5 ${c.align === 'right' ? 'text-right tabular-nums text-ink-2' : 'text-ink-2'}`}>
                          {c.image
                            ? (empty
                                ? <span className="text-warm-400">—</span>
                                : <img src={row[c.key]} alt="" loading="lazy" className="h-9 w-9 rounded-md object-cover border border-line bg-warm-50" />)
                            : c.status
                            ? <StatusDot label={row[c.key]} tone={toneFor(row[c.key]) as any} />
                            : isLink
                              ? <button className="text-brand-500 hover:underline text-left font-medium">{row[c.key]}</button>
                              : ci === 0
                                ? <span className="text-ink font-medium">{row[c.key]}</span>
                                : (empty ? <span className="text-warm-400">—</span> : row[c.key])}
                        </td>
                      )
                    })}
                    <td onClick={(e) => e.stopPropagation()} className={`sticky right-0 z-10 border-l border-line px-4 py-2.5 shadow-[-7px_0_9px_-3px_rgba(32,44,57,0.16)] ${sel ? 'bg-warm-100' : 'bg-surface group-hover:bg-warm-50'}`}>
                      {sub.activateOnly ? (
                        <div className="flex items-center gap-2">
                          <Tooltip text={activated(row) ? 'Disable' : 'Enable'}>
                            <Toggle checked={activated(row)} onChange={() => requestStatusChange([row], !activated(row))} />
                          </Tooltip>
                          {sub.addAreaAction && (
                            <button onClick={() => setAreaOpen(true)}
                              className="h-7 px-1.5 inline-flex items-center text-[13px] font-medium text-brand-500 hover:text-brand-600 hover:underline whitespace-nowrap">Add Area</button>
                          )}
                          <button onClick={() => openEdit(row)} title="Edit"
                            className="h-7 w-7 inline-flex items-center justify-center rounded-md text-ink-3 hover:bg-warm-100 hover:text-ink"><Pencil size={14} /></button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-0.5">
                          <button onClick={() => openEdit(row)} title="Edit"
                            className="h-7 w-7 inline-flex items-center justify-center rounded-md text-ink-3 hover:bg-warm-100 hover:text-ink"><Pencil size={14} /></button>
                          <button onClick={() => setConfirm({ rows: [row], label: `"${row[cols[0]?.key]}"` })} title="Delete"
                            className="h-7 w-7 inline-flex items-center justify-center rounded-md text-ink-3 hover:bg-danger-bg hover:text-st-danger"><Trash2 size={14} /></button>
                          {!sub.editDeleteOnly && <KebabMenu items={[
                            ...(sub.id === 'branch' ? [{ label: 'Manage Geofences' }] : []),
                            { label: isActive(row) ? 'Deactivate' : 'Re-activate', onClick: () => toggleStatus([row]) },
                            { label: 'View Details' },
                          ]} />}
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })}
              {viewRows.length === 0 && (
                <tr><td colSpan={cols.length + 2} className="px-4 py-16 text-center text-ink-3">No records found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between mt-4">
        <PageSize value={10} />
        <div className="flex items-center gap-1">
          <button className="h-7 w-7 inline-flex items-center justify-center rounded-md text-ink-3 hover:bg-warm-50"><ChevronLeft size={15} /></button>
          <button className="h-7 min-w-7 px-2 inline-flex items-center justify-center rounded-md text-[13px] font-bold text-brand-500 border border-brand-500 bg-brand-50">1</button>
          <button className="h-7 w-7 inline-flex items-center justify-center rounded-md text-ink-3 hover:bg-warm-50"><ChevronRight size={15} /></button>
        </div>
        <button className="h-8 inline-flex items-center gap-1.5 rounded-[10px] border border-warm-100 bg-surface px-3 text-[14px] text-ink hover:bg-warm-50">
          <RefreshCw size={14} />Refresh
        </button>
      </div>


      {/* Add Area → Serviceable Area modal */}
      {sub.addAreaAction && <ServiceableAreaModal open={areaOpen} onClose={() => setAreaOpen(false)} />}

      {/* Delete confirm (single or bulk) */}
      <ConfirmDialog
        open={!!confirm}
        title="Delete record?"
        message={`Are you sure you want to delete ${confirm?.label}? This action cannot be undone.`}
        confirmLabel="Delete"
        onConfirm={() => confirm && deleteRows(confirm.rows)}
        onClose={() => setConfirm(null)}
      />

      {/* Enable / Disable confirm */}
      {statusConfirm && (() => {
        const { rows: scRows, toEnable } = statusConfirm
        const noun = sub.recordNoun ?? sub.name
        const isBulk = scRows.length > 1
        const verb = toEnable ? 'enable' : 'disable'
        const Verb = toEnable ? 'Enable' : 'Disable'
        const target = isBulk
          ? `the selected ${noun.toLowerCase()}s`
          : `${noun} ${scRows[0]?.[cols[0]?.key]}`
        return (
          <ConfirmDialog
            open
            title={`${Verb} ${isBulk ? `${noun}s` : noun}?`}
            message={`Are you sure you want to ${verb} ${target}`}
            note={toEnable ? sub.enableNote : sub.disableNote}
            confirmLabel={`Yes, ${Verb}`}
            cancelLabel="Back"
            tone="brand"
            onConfirm={() => { setStatusValue(scRows, toEnable ? 'Enabled' : 'Disabled'); setStatusConfirm(null) }}
            onClose={() => setStatusConfirm(null)}
          />
        )
      })()}

      {/* Upload via Excel (Add / Update) */}
      <UploadDataModal open={!!upload} mode={upload ?? undefined} onClose={() => setUpload(null)} masterName={sub.name} />
    </div>
  )
}

/* ---------------- Zone Master tab ---------------- */
function ZoneMaster() {
  return (
    <div>
      <div className="bg-surface border border-line rounded-lg p-4 mb-4">
        <h4 className="text-[14px] font-bold text-ink mb-3">Filter Zone Data</h4>
        <div className="flex flex-wrap items-end gap-3">
          {[['Branch', true], ['Carrier', false], ['Service Type', false], ['Zone level', true]].map(([l, req]) => (
            <div key={l as string} className="w-44">
              <label className="block text-[12px] font-bold text-ink-2 mb-1.5">{l as string}{req && <span className="text-brand-500"> *</span>}</label>
              <div className="h-8 rounded-md border border-warm-300 bg-surface px-3 flex items-center justify-between text-[13px] text-warm-400">
                Select {l as string}<ChevronDown size={14} />
              </div>
            </div>
          ))}
          <Button>Apply</Button>
          <Button variant="ghost">Reset</Button>
        </div>
      </div>
      <div className="bg-surface border border-line rounded-lg p-4">
        <h4 className="text-[14px] font-bold text-ink">Zone Assignments</h4>
        <p className="text-[13px] text-ink-3">Assign billing zone, ETA zone, and sort code to each listed service area.</p>
        <EmptyState icon={<MapPinned size={56} />} title="No Zone Configurations" hint="Please set zone Configuration given above to start selecting." />
      </div>
    </div>
  )
}
