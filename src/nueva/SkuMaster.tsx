/**
 * SKU master — live replica of staging's Custom Settings → Masters → Service &
 * Order → SKU ("Manage SKUs with their categories, dimensions, weight and hub
 * mapping"). Unlike the frozen sample-data Masters pages, this one is hooked to
 * the real master service:
 *
 *   POST /master/api/v1/sku/fetch   (list — moduleSettings-style envelope)
 *   POST /master/api/v1/sku         (create, array body, code REQUIRED = skuCode)
 *   PUT  /master/api/v1/sku         (update, same body incl. id)
 *
 * Presentation follows the Masters design language: PageHeader → filter row →
 * DataTable, with Add/Edit as a FULL PAGE (like the other masters) and bulk
 * Download / Upload-via-Excel on the toolbar. The consignment Add/Modify forms
 * consume this same master for their SKU Code dropdown + dimension autofill.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Boxes, CircleCheck, CircleMinus, Download, Package, Pencil, RefreshCw } from 'lucide-react'
import {
  AddUpload, AdvancedFilters, Button, ClearFilters, DataTable, ErrorBox, IconButton,
  Input, LoadingBox, MenuSelect, MultiSelect, PageHeader, PageSize, Pagination,
  SearchInput, StatusPill, Toggle,
} from './components'
import { RecordCard } from './LiveMaster'
import { download, isBinaryXlsx, parseCsv, parseSpreadsheetML } from './masterDataIO'
import { fetchCountries, fetchHubCodes, fetchSkuMaster, saveSkuMaster, type SkuMasterRow } from './settingsApi'
import { ORIGIN_COUNTRIES } from '../data/originCountries'
import { toast } from './toast'

const emptyDraft = (): SkuMasterRow => ({
  enabled: true, skuCode: '', skuCategory: '', hub: [], description: '',
  length: null, breadth: null, height: null, weight: null,
  uomDimensions: 'CM', uomWeight: 'KG', stackable: false, hsnCode: '', originCountry: '',
})

const COLUMNS = [
  { key: 'skuCode', label: 'SKU Code', render: (r: SkuMasterRow) => <span className="font-bold text-brand-500">{r.skuCode}</span> },
  { key: 'skuCategory', label: 'SKU Category' },
  { key: 'hub', label: 'Hub', render: (r: SkuMasterRow) => r.hub?.length ? r.hub.join(', ') : '—' },
  { key: 'description', label: 'Description', render: (r: SkuMasterRow) => r.description || '—' },
  { key: 'hsnCode', label: 'HSN Code', render: (r: SkuMasterRow) => r.hsnCode || '—' },
  { key: 'originCountry', label: 'Origin Country', render: (r: SkuMasterRow) => r.originCountry || '—' },
  { key: 'dims', label: 'L × B × H', render: (r: SkuMasterRow) => (r.length || r.breadth || r.height) ? `${r.length ?? 0} × ${r.breadth ?? 0} × ${r.height ?? 0} ${r.uomDimensions || ''}` : '—' },
  { key: 'weight', label: 'Weight', render: (r: SkuMasterRow) => r.weight != null ? `${r.weight} ${r.uomWeight || ''}` : '—' },
  { key: 'stackable', label: 'Stackable', render: (r: SkuMasterRow) => <StatusPill label={r.stackable ? 'Yes' : 'No'} tone={r.stackable ? 'info' : 'neutral'} /> },
  { key: 'enabled', label: 'Status', render: (r: SkuMasterRow) => <StatusPill label={r.enabled ? 'Active' : 'Inactive'} tone={r.enabled ? 'success' : 'neutral'} /> },
]

/* ------------------------------------------------------- bulk sheet mapping ---- */

const SHEET_HEADERS = ['SKU Code', 'SKU Category', 'Hub', 'Description', 'HSN Code', 'Origin Country', 'Length', 'Breadth', 'Height', 'Dimensions UOM', 'Weight', 'Weight UOM', 'Stackable', 'Enabled']

const toCsvCell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)

function rowsToCsv(rows: SkuMasterRow[]): string {
  const lines = [SHEET_HEADERS.join(',')]
  for (const r of rows) {
    lines.push([
      r.skuCode, r.skuCategory, (r.hub ?? []).join('; '), r.description ?? '',
      r.hsnCode ?? '', r.originCountry ?? '',
      r.length ?? '', r.breadth ?? '', r.height ?? '', r.uomDimensions ?? '',
      r.weight ?? '', r.uomWeight ?? '', r.stackable ? 'Yes' : 'No', r.enabled ? 'Yes' : 'No',
    ].map((v) => toCsvCell(String(v))).join(','))
  }
  return lines.join('\n')
}

const truthy = (v: string) => ['yes', 'true', '1', 'y'].includes(v.trim().toLowerCase())
const numOrNull = (v: string) => (v.trim() === '' ? null : Number(v))

/** header-driven, case-insensitive — column order in the sheet does not matter */
function sheetToRows(headers: string[], rows: string[][]): SkuMasterRow[] {
  const idx = (label: string) => headers.findIndex((h) => h.trim().toLowerCase() === label.toLowerCase())
  const col = SHEET_HEADERS.map(idx)
  const cell = (r: string[], i: number) => (col[i] >= 0 ? (r[col[i]] ?? '').trim() : '')
  return rows
    .filter((r) => cell(r, 0))
    .map((r) => ({
      ...emptyDraft(),
      skuCode: cell(r, 0),
      skuCategory: cell(r, 1),
      hub: cell(r, 2).split(/[;,]/).map((h) => h.trim()).filter(Boolean),
      description: cell(r, 3),
      hsnCode: cell(r, 4),
      originCountry: cell(r, 5),
      length: numOrNull(cell(r, 6)),
      breadth: numOrNull(cell(r, 7)),
      height: numOrNull(cell(r, 8)),
      uomDimensions: cell(r, 9) || 'CM',
      weight: numOrNull(cell(r, 10)),
      uomWeight: cell(r, 11) || 'KG',
      stackable: truthy(cell(r, 12)),
      enabled: cell(r, 13) === '' ? true : truthy(cell(r, 13)),
    }))
}

/* ---------------------------------------------------------------------- page ---- */

export default function SkuMasterPage() {
  const nav = useNavigate()
  const [rows, setRows] = useState<SkuMasterRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [fCategory, setFCategory] = useState('')
  const [fStatus, setFStatus] = useState('')
  // overflow filter dims (staging filters SKU Code / SKU Category / Hub / Status)
  const [moreValues, setMoreValues] = useState<Record<string, string[]>>({})
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [draft, setDraft] = useState<SkuMasterRow | null>(null)
  const [view, setView] = useState<SkuMasterRow | null>(null)
  const [saving, setSaving] = useState(false)
  const [hubs, setHubs] = useState<string[]>([])
  /* live country names merged over the static list — the form works either way */
  const [countries, setCountries] = useState<string[]>(ORIGIN_COUNTRIES)
  const uploadMode = useRef<'add' | 'update'>('add')
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => { fetchHubCodes().then(setHubs).catch(() => {}) }, [])
  useEffect(() => {
    fetchCountries()
      .then((live) => setCountries([...new Set([...ORIGIN_COUNTRIES, ...live.map((c) => c.label)])].sort()))
      .catch(() => {})
  }, [])

  const load = () => {
    setError(null)
    fetchSkuMaster()
      .then(setRows)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
  }
  useEffect(load, [])

  const categories = useMemo(() => [...new Set((rows ?? []).map((r) => r.skuCategory).filter(Boolean))], [rows])
  const hubOptions = useMemo(() => [...new Set((rows ?? []).flatMap((r) => r.hub ?? []))].sort(), [rows])
  const codeOptions = useMemo(() => (rows ?? []).map((r) => r.skuCode).filter(Boolean).sort(), [rows])
  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase()
    const codeVals = moreValues.skuCode ?? []
    const hubVals = moreValues.hub ?? []
    return (rows ?? []).filter((r) =>
      (!query || `${r.skuCode} ${r.skuCategory} ${r.description} ${r.hsnCode ?? ''} ${r.originCountry ?? ''}`.toLowerCase().includes(query)) &&
      (!fCategory || r.skuCategory === fCategory) &&
      (!codeVals.length || codeVals.includes(r.skuCode)) &&
      (!hubVals.length || (r.hub ?? []).some((h) => hubVals.includes(h))) &&
      (!fStatus || (fStatus === 'Active') === r.enabled))
  }, [rows, q, fCategory, fStatus, moreValues])

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const safePage = Math.min(page, totalPages)
  const paged = filtered.slice((safePage - 1) * pageSize, safePage * pageSize)
  const rangeLabel = filtered.length === 0
    ? '0 of 0'
    : `${(safePage - 1) * pageSize + 1}-${Math.min(safePage * pageSize, filtered.length)} of ${filtered.length}`

  const submit = async () => {
    if (!draft) return
    if (!draft.skuCode.trim() || !draft.skuCategory.trim()) {
      toast.error('SKU Code and SKU Category are required.')
      return
    }
    setSaving(true)
    try {
      await saveSkuMaster([draft], draft.id != null)
      toast.success(`SKU ${draft.skuCode} ${draft.id != null ? 'updated' : 'created'} successfully.`)
      setDraft(null)
      setView(null)
      load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save SKU.')
    } finally {
      setSaving(false)
    }
  }

  const bulkEnable = async (list: SkuMasterRow[], v: boolean) => {
    try {
      await saveSkuMaster(list.map((r) => ({ ...r, enabled: v })), true)
      toast.success(`${list.length} SKU${list.length === 1 ? '' : 's'} ${v ? 'enabled' : 'disabled'}.`)
      load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Status change failed.')
    }
  }

  /* -------- bulk download: current data with headers — doubles as the template */
  const downloadSheet = () => {
    download('sku-master.csv', 'text/csv;charset=utf-8', rowsToCsv(rows ?? []))
    toast.info(`Downloaded ${rows?.length ?? 0} SKU${(rows?.length ?? 0) === 1 ? '' : 's'} — the header row is the upload template.`)
  }

  /* -------- bulk upload: CSV or SpreadsheetML; Add = create new, Update = existing */
  const onFile = async (file: File) => {
    const head = new Uint8Array(await file.slice(0, 4).arrayBuffer())
    if (isBinaryXlsx(head, file.name)) {
      toast.error('Binary .xlsx is not supported here — save the sheet as CSV and retry.')
      return
    }
    const text = await file.text()
    let headers: string[], body: string[][]
    try {
      if (text.trimStart().startsWith('<?xml')) {
        const sheet = parseSpreadsheetML(text).sheets[0]
        if (!sheet) throw new Error('no sheet found')
        ;[headers, ...body] = sheet.rows
      } else {
        ({ headers, rows: body } = parseCsv(text))
      }
    } catch {
      toast.error('Could not parse the file — expected CSV or Excel XML.')
      return
    }
    const parsed = sheetToRows(headers, body)
    if (!parsed.length) {
      toast.error('No rows with an SKU Code found in the sheet.')
      return
    }
    const byCode = new Map((rows ?? []).map((r) => [r.skuCode, r]))
    const mode = uploadMode.current
    const targets = mode === 'add'
      ? parsed.filter((r) => !byCode.has(r.skuCode))
      : parsed.filter((r) => byCode.has(r.skuCode)).map((r) => ({ ...r, id: byCode.get(r.skuCode)!.id }))
    const skipped = parsed.length - targets.length
    if (!targets.length) {
      toast.error(mode === 'add' ? 'Every SKU in the sheet already exists — use Update Via Excel.' : 'No SKU in the sheet matches an existing code — use Add Via Excel.')
      return
    }
    try {
      await saveSkuMaster(targets, mode === 'update')
      toast.success(`${targets.length} SKU${targets.length === 1 ? '' : 's'} ${mode === 'add' ? 'created' : 'updated'}${skipped ? ` · ${skipped} skipped` : ''}.`)
      load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Bulk save failed.')
    }
  }

  /* ------------------------------------------------ full-page read-only view */
  if (view && !draft) {
    const V = ({ label, value }: { label: string; value: React.ReactNode }) => (
      <div className="min-w-0">
        <p className="text-[12px] font-bold text-ink-3">{label}</p>
        <p className="mt-0.5 text-[13.5px] text-ink break-words">{value}</p>
      </div>
    )
    return (
      <div>
        <PageHeader title={`SKU — ${view.skuCode}`}
          subtitle="Manage SKUs with their categories, dimensions, weight and hub mapping"
          onBack={() => setView(null)}
          right={<Button icon={<Pencil size={13} />} onClick={() => setDraft({ ...view })}>Edit</Button>} />
        <div className="grid gap-5">
          <RecordCard title="SKU Details" meta={{ icon: <Package size={15} className="text-brand-500" />, caption: 'Identity of this SKU, its category and the hubs that stock it.' }}>
            <div className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2 xl:grid-cols-4">
              <V label="SKU Code" value={view.skuCode} />
              <V label="SKU Category" value={view.skuCategory || '—'} />
              <V label="Hub" value={view.hub?.length ? view.hub.join(', ') : '—'} />
              <V label="Description" value={view.description || '—'} />
              <V label="HSN Code" value={view.hsnCode || '—'} />
              <V label="Origin Country" value={view.originCountry || '—'} />
              <div className="min-w-0">
                <p className="text-[12px] font-bold text-ink-3">Status</p>
                <p className="mt-1"><StatusPill label={view.enabled ? 'Active' : 'Inactive'} tone={view.enabled ? 'success' : 'neutral'} /></p>
              </div>
            </div>
          </RecordCard>
          <RecordCard title="Dimensions & Weight" meta={{ icon: <Boxes size={15} className="text-brand-500" />, caption: 'Physical size and weight — used for load planning and vehicle capacity.' }}>
            <div className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2 xl:grid-cols-4">
              <V label="L × B × H" value={(view.length || view.breadth || view.height) ? `${view.length ?? 0} × ${view.breadth ?? 0} × ${view.height ?? 0} ${view.uomDimensions}` : '—'} />
              <V label="Weight" value={view.weight != null ? `${view.weight} ${view.uomWeight}` : '—'} />
              <V label="Stackable" value={view.stackable ? 'Yes' : 'No'} />
            </div>
          </RecordCard>
        </div>
      </div>
    )
  }

  /* ------------------------------------------------ full-page Add / Edit form */
  if (draft) {
    const editing = draft.id != null
    return (
      <div>
        <PageHeader
          title={editing ? `Edit SKU — ${draft.skuCode}` : 'Add SKU'}
          subtitle="Manage SKUs with their categories, dimensions, weight and hub mapping"
          onBack={() => setDraft(null)} />
        <SkuForm draft={draft} onChange={setDraft} hubs={hubs} countries={countries} />
        {/* sticky footer — required progress + global enable + actions, the
            same anatomy as the LiveMaster record forms */}
        {(() => {
          const req = [draft.skuCode, draft.skuCategory]
          const done = req.filter((v) => v.trim() !== '').length
          const pct = Math.round((done / req.length) * 100)
          return (
            <div className="sticky bottom-0 z-10 mt-5 flex items-center gap-4 rounded-xl border border-line bg-surface px-5 py-3 shadow-ds-1">
              <span className="h-1.5 w-28 overflow-hidden rounded-full bg-warm-100">
                <span className="block h-full rounded-full bg-brand-500 transition-all" style={{ width: `${pct}%` }} />
              </span>
              <span className="text-[12.5px] text-ink-3">{done}/{req.length} required</span>
              <div className="ml-auto flex items-center gap-5">
                <label className="flex items-center gap-2.5 text-[13.5px] text-ink">
                  Enable this SKU
                  <Toggle checked={draft.enabled} onChange={(v) => setDraft({ ...draft, enabled: v })} />
                </label>
                <div className="flex items-center gap-2">
                  <Button variant="outline" onClick={() => setDraft(null)}>Cancel</Button>
                  <Button onClick={submit} disabled={saving}>{saving ? 'Saving…' : editing ? 'Save Changes' : 'Add SKU'}</Button>
                </div>
              </div>
            </div>
          )
        })()}
      </div>
    )
  }

  return (
    <div>
      <PageHeader title="SKU" subtitle="Manage SKUs with their categories, dimensions, weight and hub mapping"
        onBack={() => nav('/console/settings/masters/service_order')} />

      {/* toolbar mirrors the Consignment page: filters left, search + actions right,
          icon-only download — one layout, page by page */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="w-40"><MenuSelect value={fCategory} placeholder="SKU Category" options={categories} onChange={(v) => { setFCategory(v); setPage(1) }} /></div>
        <div className="w-32"><MenuSelect value={fStatus} placeholder="Status" options={['Active', 'Inactive']} onChange={(v) => { setFStatus(v); setPage(1) }} /></div>
        <AdvancedFilters
          defs={[
            { key: 'skuCode', label: 'SKU Code', options: codeOptions },
            { key: 'hub', label: 'Hub', options: hubOptions },
          ]}
          values={moreValues}
          onChange={(k, vals) => { setMoreValues((m) => ({ ...m, [k]: vals })); setPage(1) }} />
        <ClearFilters
          active={!!q || !!fCategory || !!fStatus || Object.values(moreValues).some((v) => v.length > 0)}
          onClick={() => { setQ(''); setFCategory(''); setFStatus(''); setMoreValues({}); setPage(1) }} />
        <div className="ml-auto flex items-center gap-2 shrink-0">
          <div className="w-52"><SearchInput value={q} onChange={(v) => { setQ(v); setPage(1) }} placeholder="Search SKUs" /></div>
          <IconButton icon={<RefreshCw size={15} />} title="Refresh" onClick={load} />
          <IconButton icon={<Download size={15} />} title="Download SKUs (CSV)" onClick={downloadSheet} />
          <AddUpload
            onAdd={() => setDraft(emptyDraft())}
            onUpload={(mode) => { uploadMode.current = mode; fileRef.current?.click() }} />
          <input
            ref={fileRef} type="file" accept=".csv,.xls,.xml" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = '' }} />
        </div>
      </div>

      {error ? <ErrorBox error={error} onRetry={load} />
        : rows === null ? <LoadingBox label="Loading SKU master…" />
          : <>
            <DataTable columns={COLUMNS} rows={paged} rowKey="skuCode" selectable
              selectionActions={(sel, clear) => {
                const disabled = (sel as SkuMasterRow[]).filter((r) => !r.enabled)
                const enabled = (sel as SkuMasterRow[]).filter((r) => r.enabled)
                return [
                ...(disabled.length ? [{ label: `Enable SKU${disabled.length === 1 ? '' : 's'}`, icon: <CircleCheck size={14} />, onClick: () => { bulkEnable(disabled, true); clear() } }] : []),
                ...(enabled.length ? [{ label: `Disable SKU${enabled.length === 1 ? '' : 's'}`, icon: <CircleMinus size={14} />, onClick: () => { bulkEnable(enabled, false); clear() } }] : []),
                ...(sel.length === 1 ? [
                  { label: 'Edit SKU', icon: <Pencil size={14} />, onClick: () => { clear(); setDraft({ ...(sel[0] as SkuMasterRow) }) } },
                ] : [
                  { label: 'Download CSV', icon: <Download size={14} />, onClick: () => download('sku-selected.csv', 'text/csv;charset=utf-8', rowsToCsv(sel as SkuMasterRow[])) },
                ]),
              ]}}
              onRowClick={(r) => setView(r as SkuMasterRow)} />
            <div className="flex items-center justify-between gap-3">
              <div className="flex-1"><Pagination page={safePage} total={totalPages} range={rangeLabel} onChange={setPage} /></div>
              <div className="pt-3"><PageSize value={pageSize} onChange={(n) => { setPageSize(n); setPage(1) }} /></div>
            </div>
          </>}
    </div>
  )
}

/* ---------------------------------------------------------------------- form ---- */

function Fld({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <label className="mb-1.5 flex h-5 items-center gap-1 whitespace-nowrap text-[13.5px] text-ink">
        {label}{required && <span className="text-brand-500">*</span>}
      </label>
      {children}
    </div>
  )
}

function SkuForm({ draft, onChange, hubs, countries }: { draft: SkuMasterRow; onChange: (d: SkuMasterRow) => void; hubs: string[]; countries: string[] }) {
  const set = (patch: Partial<SkuMasterRow>) => onChange({ ...draft, ...patch })
  const num = (v: string) => (v.trim() === '' ? null : Number(v))
  const detailsDone = draft.skuCode.trim() !== '' && draft.skuCategory.trim() !== ''
  return (
    <div className="grid gap-5">
      <RecordCard title="SKU Details" done={detailsDone}
        meta={{ icon: <Package size={15} className="text-brand-500" />, caption: 'Identity of this SKU, its category, the hubs that stock it and its customs classification.' }}>
        <div className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2 xl:grid-cols-4">
          <Fld label="SKU Code" required>
            <Input value={draft.skuCode} placeholder="eg, LPN04" onChange={(v) => set({ skuCode: v })} disabled={draft.id != null} />
          </Fld>
          <Fld label="SKU Category" required>
            <Input value={draft.skuCategory} placeholder="eg, Standard" onChange={(v) => set({ skuCategory: v })} />
          </Fld>
          <Fld label="Hub">
            {/* real hub master values (GET /app/rest/city_hub_list) — multi, like staging */}
            <MultiSelect value={draft.hub} options={hubs} placeholder="Select hubs"
              onChange={(v) => set({ hub: v })} />
          </Fld>
          <Fld label="Description">
            <Input value={draft.description} placeholder="eg, Standard carton SKU" onChange={(v) => set({ description: v })} />
          </Fld>
          <Fld label="HSN Code">
            {/* Harmonised System code — customs / GST classification of the goods */}
            <Input value={draft.hsnCode ?? ''} placeholder="eg, 220429" onChange={(v) => set({ hsnCode: v })} />
          </Fld>
          <Fld label="Origin Country">
            <MenuSelect value={draft.originCountry ?? ''} options={countries} placeholder="Select country" searchable creatable
              onChange={(v) => set({ originCountry: v })} />
          </Fld>
        </div>
      </RecordCard>
      <RecordCard title="Dimensions & Weight"
        meta={{ icon: <Boxes size={15} className="text-brand-500" />, caption: 'Physical size and weight — dimensions first, then their unit.' }}>
        <div className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2 xl:grid-cols-4">
          <Fld label="Length">
            <Input type="number" value={draft.length == null ? '' : String(draft.length)} placeholder="eg, 30" onChange={(v) => set({ length: num(v) })} />
          </Fld>
          <Fld label="Breadth">
            <Input type="number" value={draft.breadth == null ? '' : String(draft.breadth)} placeholder="eg, 20" onChange={(v) => set({ breadth: num(v) })} />
          </Fld>
          <Fld label="Height">
            <Input type="number" value={draft.height == null ? '' : String(draft.height)} placeholder="eg, 15" onChange={(v) => set({ height: num(v) })} />
          </Fld>
          <Fld label="Dimensions UOM">
            <MenuSelect value={draft.uomDimensions} options={['CM', 'IN', 'M']} onChange={(v) => set({ uomDimensions: v })} />
          </Fld>
          <Fld label="Weight">
            <Input type="number" value={draft.weight == null ? '' : String(draft.weight)} placeholder="eg, 5" onChange={(v) => set({ weight: num(v) })} />
          </Fld>
          <Fld label="Weight UOM">
            <MenuSelect value={draft.uomWeight} options={['KG', 'LBS', 'G']} onChange={(v) => set({ uomWeight: v })} />
          </Fld>
          <div className="flex items-center gap-3 pt-1">
            <span className="text-[13.5px] text-ink">Stackable</span>
            <Toggle checked={draft.stackable} onChange={(v) => set({ stackable: v })} />
          </div>
        </div>
      </RecordCard>
    </div>
  )
}
