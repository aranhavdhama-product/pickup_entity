/**
 * Zone Master — My Network tab 3, on staging's REAL zone endpoints (captured
 * live 2026-08-27, contracts in settingsApi.ts):
 *
 *   list    POST /master/api/v2/branch/zoneMaster/list
 *   areas   POST /master/api/v2/branch/zoneMaster/serviceableArea
 *   create  POST /master/api/v2/branch/zoneMaster
 *
 * A zone config picks a branch + geographic level (+ optional carriers and
 * service types); the branch's serviceable areas expand at that level and each
 * area gets an ETA/billing zone name and optional sort code. List → row click
 * opens the ZONE CONFIGURATION page (staging's inner page: filters + editable
 * per-area assignments); Add Zone is the same setup form from scratch. The
 * setup form is reused by the Add Branch stepper (step 3).
 */
import { useEffect, useMemo, useState } from 'react'
import { Plus, RefreshCw } from 'lucide-react'
import {
  Button, Checkbox, ClearFilters, DataTable, ErrorBox, IconButton, Input, LoadingBox,
  MenuSelect, MultiSelect, PageHeader, PageSize, Pagination, SearchInput, type Column,
} from './components'
import {
  createZoneMasters, fetchCarriers, fetchHubsPage, fetchMasterRows, fetchZoneAreas,
  fetchZoneBranches, fetchZoneMasters, ZONE_AVAILABILITY,
  type MasterRecord, type ZoneAssignment,
} from './settingsApi'
import { DetailTabActions } from './BranchGeofence'
import { RecordCard } from './LiveMaster'
import { MapPinned, SlidersHorizontal } from 'lucide-react'
import { toast } from './toast'

const ZONE_LEVELS = [
  { key: 'postal_code', label: 'Zipcode' },
  { key: 'suburb', label: 'County/Suburb' },
  { key: 'city', label: 'City' },
  { key: 'state', label: 'State' },
  { key: 'country', label: 'Country' },
]
const levelLabel = (k: string) => ZONE_LEVELS.find((l) => l.key === k)?.label ?? k

/** the level-specific value column of an area row (state / city / postal_code …) */
const areaValue = (row: MasterRecord, level: string) => String(row[level] ?? row.state ?? '')

const joinOrDash = (v: unknown) => {
  const arr = (Array.isArray(v) ? v : []).map(String).filter((s) => s.trim())
  return arr.length ? arr.join(', ') : '—'
}

const cleanArr = (v: unknown): string[] =>
  (Array.isArray(v) ? v : []).map(String).filter((s) => s.trim())

export default function ZoneMasterTab({ onModeChange }: {
  embedded?: boolean
  onModeChange?: (inSubpage: boolean) => void
}) {
  const [rows, setRows] = useState<MasterRecord[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [branchNames, setBranchNames] = useState<Map<number, string>>(new Map())
  const [q, setQ] = useState('')
  const [branchFilter, setBranchFilter] = useState('')
  const [levelFilter, setLevelFilter] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [mode, setMode] = useState<{ kind: 'list' } | { kind: 'view'; row: MasterRecord } | { kind: 'add' }>({ kind: 'list' })

  useEffect(() => { onModeChange?.(mode.kind !== 'list') }, [mode, onModeChange])

  const load = () => {
    setError(null)
    Promise.all([fetchZoneMasters(), fetchZoneBranches()])
      .then(([rs, branches]) => {
        setBranchNames(new Map(branches.map((b) => [b.id, b.branchName])))
        setRows(rs)
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
  }
  useEffect(load, [])

  const named = useMemo(() => (rows ?? []).map((r) => ({
    ...r,
    branchName: branchNames.get(Number(r.branch_id)) ?? String(r.branch_id ?? ''),
    levelLabel: levelLabel(String(r.level ?? '')),
  })), [rows, branchNames])

  const filtered = useMemo(() => named.filter((r) =>
    (!q || String(r.branchName).toLowerCase().includes(q.toLowerCase())) &&
    (!branchFilter || String(r.branchName) === branchFilter) &&
    (!levelFilter || String(r.levelLabel) === levelFilter),
  ), [named, q, branchFilter, levelFilter])

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const safePage = Math.min(page, totalPages)
  const paged = filtered.slice((safePage - 1) * pageSize, safePage * pageSize)

  if (mode.kind === 'add') {
    return (
      <div>
        <PageHeader title="Add Zone Configuration" onBack={() => setMode({ kind: 'list' })} />
        <ZoneSetupForm onDone={(saved) => { setMode({ kind: 'list' }); if (saved) load() }} />
      </div>
    )
  }
  if (mode.kind === 'view') {
    return <ZoneConfigPage row={mode.row} onBack={() => { setMode({ kind: 'list' }); load() }} />
  }

  const stats = (r: MasterRecord, key: string) => {
    const s = (r.stats ?? {}) as Record<string, number>
    return `${s[key] ?? 0}/${s.total_serviceable_areas ?? 0}`
  }
  const columns: Column[] = [
    { key: 'branchName', label: 'Branch', render: (r: MasterRecord) => (
      <span className="font-bold text-brand-500">{String(r.branchName)}</span>
    ) },
    { key: 'levelLabel', label: 'Zone Level' },
    { key: 'carrier', label: 'Carrier', render: (r: MasterRecord) => joinOrDash(r.carrier) },
    { key: 'service_type', label: 'Service Type', render: (r: MasterRecord) => joinOrDash(r.service_type) },
    { key: 'eta', label: 'ETA Zones', render: (r: MasterRecord) => stats(r, 'eta_zone_configured') },
    { key: 'billing', label: 'Billing Zones', render: (r: MasterRecord) => stats(r, 'billing_zone_configured') },
    { key: 'sort', label: 'Sort Codes', render: (r: MasterRecord) => stats(r, 'sort_code_configured') },
    { key: 'source', label: 'Source', render: (r: MasterRecord) => (
      <span className="rounded-full bg-warm-100 px-2.5 py-0.5 text-[12px] font-bold text-ink-2">
        {r.source === 'GLOBAL_GEOFENCES' ? 'Global' : String(r.source ?? '') || '—'}
      </span>
    ) },
  ]

  return (
    <div>
      {/* standard toolbar — 2 filters + clear left, search + actions right */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="w-40">
          <MenuSelect value={branchFilter} placeholder="Branch"
            options={[...new Set(named.map((r) => String(r.branchName)))]}
            onChange={(v) => { setBranchFilter(v); setPage(1) }} />
        </div>
        <div className="w-40">
          <MenuSelect value={levelFilter} placeholder="Zone Level"
            options={[...new Set(named.map((r) => String(r.levelLabel)))]}
            onChange={(v) => { setLevelFilter(v); setPage(1) }} />
        </div>
        <ClearFilters active={!!q || !!branchFilter || !!levelFilter}
          onClick={() => { setQ(''); setBranchFilter(''); setLevelFilter(''); setPage(1) }} />
        <div className="ml-auto flex items-center gap-2 shrink-0">
          <div className="w-52"><SearchInput value={q} onChange={(v) => { setQ(v); setPage(1) }} placeholder="Search zones" /></div>
          <IconButton icon={<RefreshCw size={15} />} title="Refresh" onClick={load} />
          <Button icon={<Plus size={13} />} onClick={() => setMode({ kind: 'add' })}>Add Zone</Button>
        </div>
      </div>

      {error ? <ErrorBox error={error} onRetry={load} />
        : rows === null ? <LoadingBox label="Loading zone configurations…" />
          : filtered.length === 0 ? (
            <button type="button" onClick={() => setMode({ kind: 'add' })}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-warm-300 py-8
                         text-[13px] font-bold text-brand-500 transition-colors hover:border-brand-500 hover:bg-brand-50/40">
              <Plus size={14} /> Set up the first zone configuration
              <span className="font-normal text-ink-3">— assign ETA and billing zones to serviceable areas</span>
            </button>
          ) : (
            <>
              <DataTable columns={columns} rows={paged} rowKey="id"
                onRowClick={(r) => setMode({ kind: 'view', row: r as MasterRecord })} />
              <div className="flex items-center justify-between gap-3">
                <div className="flex-1">
                  <Pagination page={safePage} total={totalPages}
                    range={`${(safePage - 1) * pageSize + 1}-${Math.min(safePage * pageSize, filtered.length)} of ${filtered.length}`}
                    onChange={setPage} />
                </div>
                <div className="pt-3"><PageSize value={pageSize} onChange={(n) => { setPageSize(n); setPage(1) }} /></div>
              </div>
            </>
          )}
    </div>
  )
}

/* ---------------------------------------------- Zone Configuration page ----
 * Staging's inner zone page: config header (branch, carrier, service type,
 * level) + searchable per-area assignments with editable zone names, sort
 * codes and availability. Edits re-POST through the same create endpoint. */

type RowEdit = { eta: string; billing: string; sort: string; avail: string }

export function ZoneConfigPage({ row, onBack, embedded }: {
  row: MasterRecord
  onBack: () => void
  /** inside the branch view's Zones tab: no second PageHeader — the actions
      render in the record header slot instead (one header, one back) */
  embedded?: boolean
}) {
  const level = String(row.level ?? 'state')
  const [areas, setAreas] = useState<MasterRecord[] | null>(null)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [q, setQ] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [separate, setSeparate] = useState(false)
  const [edits, setEdits] = useState<Record<string, RowEdit>>({})
  const [sortCodes, setSortCodes] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const pageSize = 10

  useEffect(() => {
    fetchMasterRows('sortCode').then((rs) => setSortCodes(rs.map((r) => String(r.code ?? '')).filter(Boolean))).catch(() => {})
  }, [])

  const loadAreas = () => {
    setAreas(null)
    fetchZoneAreas(String(row.branch_id), level, page, pageSize, true)
      .then((d) => { setAreas(d.rows); setTotal(d.total) })
      .catch(() => setAreas([]))
  }
  useEffect(loadAreas, [row, level, page])

  const s = (row.stats ?? {}) as Record<string, number>
  const statTile = (label: string, val: number) => (
    <div className="rounded-lg border border-line px-4 py-3">
      <p className="text-[12px] font-bold text-ink-3">{label}</p>
      <p className="mt-0.5 text-[18px] font-bold text-ink">{val ?? 0}</p>
    </div>
  )

  const editOf = (r: MasterRecord): RowEdit => {
    const key = areaValue(r, level)
    return edits[key] ?? {
      eta: String(r.eta_zone_name ?? ''),
      billing: String(r.billing_zone_name ?? ''),
      sort: String(r.sort_code ?? ''),
      avail: String(r.availability ?? ''),
    }
  }
  const setEdit = (r: MasterRecord, patch: Partial<RowEdit>) => {
    const key = areaValue(r, level)
    setEdits((m) => ({ ...m, [key]: { ...editOf(r), ...patch } }))
  }

  // client-side refinement of the loaded page (search + config status)
  const visible = (areas ?? []).filter((r) => {
    const matchQ = !q || Object.values(r).some((v) => typeof v === 'string' && v.toLowerCase().includes(q.toLowerCase()))
    const matchS = !statusFilter || (statusFilter === 'Mapped' ? !!r.is_mapped : !r.is_mapped)
    return matchQ && matchS
  })

  const geoColumns: Column[] = [
    ...(level === 'postal_code' ? [{ key: 'postal_code', label: 'Zipcode', render: (r: MasterRecord) => (
      <span className="font-bold text-ink">{String(r.postal_code ?? '—')}</span>
    ) }] : []),
    ...(['postal_code', 'suburb'].includes(level) ? [{ key: 'suburb', label: 'Suburb/County', render: (r: MasterRecord) => String(r.suburb ?? '') || '—' }] : []),
    ...(['postal_code', 'suburb', 'city'].includes(level) ? [{ key: 'city', label: 'City', render: (r: MasterRecord) => String(r.city ?? '') || '—' }] : []),
    ...(level !== 'country' ? [{ key: 'state', label: 'State', render: (r: MasterRecord) => String(r.state ?? '') || '—' }] : []),
    { key: 'country', label: 'Country', render: (r: MasterRecord) => String(r.country ?? '') || '—' },
  ]

  const columns: Column[] = [
    ...geoColumns,
    { key: 'zone', label: separate ? 'ETA Zone' : 'Zone Name', render: (r: MasterRecord) => (
      <div className="max-w-52" onClick={(e) => e.stopPropagation()}>
        <Input value={editOf(r).eta} placeholder="Enter zone name"
          onChange={(v) => setEdit(r, separate ? { eta: v } : { eta: v, billing: v })} />
      </div>
    ) },
    ...(separate ? [{ key: 'billing', label: 'Billing Zone', render: (r: MasterRecord) => (
      <div className="max-w-52" onClick={(e) => e.stopPropagation()}>
        <Input value={editOf(r).billing} placeholder="Enter billing zone"
          onChange={(v) => setEdit(r, { billing: v })} />
      </div>
    ) }] : []),
    { key: 'sort', label: 'Sort Code', render: (r: MasterRecord) => (
      <div className="w-36" onClick={(e) => e.stopPropagation()}>
        <MenuSelect value={editOf(r).sort} placeholder="Select sort code" options={sortCodes}
          onChange={(v) => setEdit(r, { sort: v })} />
      </div>
    ) },
    { key: 'avail', label: 'Availability', render: (r: MasterRecord) => (
      <div className="w-44" onClick={(e) => e.stopPropagation()}>
        <MenuSelect value={editOf(r).avail} placeholder="Select availability"
          options={ZONE_AVAILABILITY.map((a) => a.value)}
          labels={(v) => ZONE_AVAILABILITY.find((a) => a.value === v)?.label ?? v}
          onChange={(v) => setEdit(r, { avail: v })} />
      </div>
    ) },
    { key: 'alias', label: 'Alias', render: (r: MasterRecord) => String(r.alias ?? '') || '—' },
    { key: 'is_mapped', label: 'Status', render: (r: MasterRecord) => (
      <span className={`rounded-full px-2.5 py-0.5 text-[12px] font-bold ${r.is_mapped ? 'bg-success-bg text-success-fg' : 'bg-warm-100 text-ink-3'}`}>
        {r.is_mapped ? 'Mapped' : 'Unmapped'}
      </span>
    ) },
  ]
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  const save = async () => {
    // staging's edit payload carries the row's geo context alongside the names
    const byValue = new Map((areas ?? []).map((r) => [areaValue(r, level), r]))
    const zones: ZoneAssignment[] = Object.entries(edits)
      .filter(([, e]) => e.eta.trim() || e.billing.trim())
      .map(([value, e]) => {
        const src = byValue.get(value)
        return {
          level_value: value,
          eta_zone_name: e.eta.trim(),
          billing_zone_name: (separate ? e.billing : e.eta).trim() || e.eta.trim(),
          sort_code: e.sort.trim(),
          availability: e.avail.trim(),
          ...(src ? {
            postal_code: String(src.postal_code ?? ''), county: String(src.suburb ?? src.county ?? ''),
            city: String(src.city ?? ''), state: String(src.state ?? ''),
          } : {}),
        }
      })
    if (!zones.length) { toast.error('Nothing changed — edit a zone name first.'); return }
    setSaving(true)
    try {
      await createZoneMasters(String(row.branch_id), level, zones,
        cleanArr(row.carrier), cleanArr(row.service_type), Number(row.id))
      toast.success(`${zones.length} zone assignment${zones.length === 1 ? '' : 's'} saved.`)
      setEdits({})
      loadAreas()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save zones.')
    } finally { setSaving(false) }
  }

  return (
    <div>
      {/* embedded (branch view tab): the branch header + tabs stay — no second
          header; actions live in the sticky footer like every other form */}
      {!embedded && (
        <PageHeader title={`Zone Configuration — ${String(row.branchName ?? row.branch_id)}`} onBack={onBack} />
      )}

      {/* same anatomy as every record form: section cards + sticky footer */}
      <div className="grid gap-5">
        <RecordCard title="Zone Setup" done
          meta={{ icon: <SlidersHorizontal size={15} className="text-brand-500" />, caption: 'The branch, carriers, service types and geographic level this configuration applies to.' }}>
          <div className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
            {[['Branch', String(row.branchName ?? '')], ['Carrier', joinOrDash(row.carrier)],
              ['Service Type', joinOrDash(row.service_type)], ['Zone Level', levelLabel(level)]].map(([l, v]) => (
              <div key={l}>
                <p className="text-[12px] font-bold text-ink-3">{l}</p>
                <p className="mt-0.5 text-[13.5px] text-ink">{v}</p>
              </div>
            ))}
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
            {statTile('Serviceable Areas', s.total_serviceable_areas)}
            {statTile('ETA Zones', s.eta_zone_configured)}
            {statTile('Billing Zones', s.billing_zone_configured)}
            {statTile('Sort Codes', s.sort_code_configured)}
            {statTile('Availability', s.availability_configured)}
          </div>
        </RecordCard>

        <RecordCard title="Zone Assignments"
          meta={{ icon: <MapPinned size={15} className="text-brand-500" />, caption: 'Assign billing zone, ETA zone, and sort code to each listed service area.' }}>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <div className="w-40">
              <MenuSelect value={statusFilter} placeholder="Config Status" options={['Mapped', 'Unmapped']}
                onChange={setStatusFilter} />
            </div>
            <ClearFilters active={!!q || !!statusFilter} onClick={() => { setQ(''); setStatusFilter('') }} />
            <label className="ml-2 flex cursor-pointer items-center gap-2 text-[13px] text-ink">
              <Checkbox checked={separate} onChange={setSeparate} /> Add Separate ETA and Billing Zone
            </label>
            <div className="ml-auto flex items-center gap-2 shrink-0">
              <div className="w-64"><SearchInput value={q} onChange={setQ} placeholder="Search this page of areas" /></div>
            </div>
          </div>
          {areas === null ? <LoadingBox label="Loading zone assignments…" /> : (
            <>
              <DataTable columns={columns} rows={visible} rowKey="id" />
              <div className="flex items-center justify-between gap-3">
                <div className="flex-1">
                  <Pagination page={page} total={totalPages}
                    range={`${(page - 1) * pageSize + 1}-${Math.min(page * pageSize, total)} of ${total}`}
                    onChange={setPage} />
                </div>
              </div>
            </>
          )}
        </RecordCard>
      </div>

      <div className="sticky bottom-0 z-10 mt-5 flex items-center gap-4 rounded-xl border border-line bg-surface px-5 py-3 shadow-ds-1">
        <span className="text-[12.5px] text-ink-3">
          {Object.keys(edits).length} assignment{Object.keys(edits).length === 1 ? '' : 's'} edited
        </span>
        <div className="ml-auto flex items-center gap-2">
          <Button variant="outline" onClick={onBack}>{embedded ? 'Back to Zones' : 'Cancel'}</Button>
          <Button onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save Changes'}</Button>
        </div>
      </div>
    </div>
  )
}

/* --------------------------------------------------------- setup form ----
 * Branch (lockable) + level + carrier/service-type multiselects + per-area
 * zone naming. Used by Add Zone AND by the Add Branch stepper (step 3). */

export function ZoneSetupForm({ fixedBranch, defaultLevel, skippable, onDone }: {
  /** lock the branch (the Add Branch stepper passes the just-created branch) */
  fixedBranch?: { id: number; name: string }
  /** pre-select the zone level (stepper: the coverage type saved in step 2) */
  defaultLevel?: string
  /** render Skip instead of Cancel (stepper mode) */
  skippable?: boolean
  onDone: (saved: boolean) => void
}) {
  const [hubs, setHubs] = useState<{ id: number; name: string }[]>([])
  const [branch, setBranch] = useState(fixedBranch?.name ?? '')
  const [level, setLevel] = useState(defaultLevel ?? '')
  const [carriers, setCarriers] = useState<string[]>([])
  const [serviceTypes, setServiceTypes] = useState<string[]>([])
  const [sortCodes, setSortCodes] = useState<string[]>([])
  const [carrierSel, setCarrierSel] = useState<string[]>([])
  const [serviceSel, setServiceSel] = useState<string[]>([])
  const [separate, setSeparate] = useState(false)
  const [areas, setAreas] = useState<MasterRecord[] | null>(null)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [names, setNames] = useState<Record<string, RowEdit>>({})
  const [saving, setSaving] = useState(false)
  const pageSize = 10

  useEffect(() => {
    if (!fixedBranch) fetchHubsPage().then((hs) => setHubs(hs.map((h) => ({ id: Number(h.id), name: String(h.name) })))).catch(() => {})
    fetchCarriers().then(setCarriers).catch(() => {})
    fetchMasterRows('serviceType').then((rs) => setServiceTypes(rs.map((r) => String(r.code ?? '')).filter(Boolean))).catch(() => {})
    fetchMasterRows('sortCode').then((rs) => setSortCodes(rs.map((r) => String(r.code ?? '')).filter(Boolean))).catch(() => {})
  }, [fixedBranch])

  const hub = fixedBranch ?? hubs.find((h) => h.name === branch)

  useEffect(() => {
    if (!hub || !level) { setAreas(null); return }
    setAreas(null)
    fetchZoneAreas(hub.id, level, page, pageSize, false)
      .then((d) => { setAreas(d.rows); setTotal(d.total) })
      .catch((e) => { setAreas([]); toast.error(e instanceof Error ? e.message : 'Failed to load areas.') })
  }, [hub?.id, level, page])  // eslint-disable-line react-hooks/exhaustive-deps

  const editOf = (key: string): RowEdit => names[key] ?? { eta: '', billing: '', sort: '', avail: '' }
  const pending = Object.entries(names).filter(([, v]) => v.eta.trim() || v.billing.trim())

  const save = async () => {
    if (!hub) { toast.error('Select a branch first.'); return }
    if (!level) { toast.error('Select a zone level — the serviceable areas load from it.'); return }
    if (pending.length === 0) {
      toast.error('Name at least one zone in the table below (or Skip this step).')
      return
    }
    setSaving(true)
    try {
      const zones: ZoneAssignment[] = pending.map(([value, v]) => ({
        level_value: value,
        eta_zone_name: v.eta.trim(),
        billing_zone_name: (separate ? v.billing : v.eta).trim() || v.eta.trim(),
        sort_code: v.sort.trim(),
        availability: v.avail.trim(),
      }))
      await createZoneMasters(hub.id, level, zones, carrierSel, serviceSel)
      toast.success(`${zones.length} zone assignment${zones.length === 1 ? '' : 's'} saved for ${hub.name}.`)
      onDone(true)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save zones.')
      setSaving(false)
    }
  }

  const columns: Column[] = [
    { key: 'value', label: level ? levelLabel(level) : 'Area', render: (r: MasterRecord) => (
      <span className="font-bold text-ink">{areaValue(r, level)}</span>
    ) },
    { key: 'country', label: 'Country', render: (r: MasterRecord) => String(r.country ?? '') || '—' },
    { key: 'zone', label: separate ? 'ETA Zone' : 'Zone Name (ETA + Billing)', render: (r: MasterRecord) => {
      const key = areaValue(r, level)
      if (r.is_mapped) return <span className="text-[12.5px] text-ink-3">Already mapped</span>
      return (
        <div className="max-w-52" onClick={(e) => e.stopPropagation()}>
          <Input value={editOf(key).eta} placeholder="Enter zone name"
            onChange={(v) => setNames((m) => ({ ...m, [key]: { ...editOf(key), eta: v, ...(separate ? {} : { billing: v }) } }))} />
        </div>
      )
    } },
    ...(separate ? [{ key: 'billing', label: 'Billing Zone', render: (r: MasterRecord) => {
      const key = areaValue(r, level)
      if (r.is_mapped) return '—'
      return (
        <div className="max-w-52" onClick={(e: React.MouseEvent) => e.stopPropagation()}>
          <Input value={editOf(key).billing} placeholder="Enter billing zone"
            onChange={(v) => setNames((m) => ({ ...m, [key]: { ...editOf(key), billing: v } }))} />
        </div>
      )
    } }] : []),
    { key: 'sort', label: 'Sort Code', render: (r: MasterRecord) => {
      const key = areaValue(r, level)
      return r.is_mapped ? '—' : (
        <div className="w-36" onClick={(e) => e.stopPropagation()}>
          <MenuSelect value={editOf(key).sort} placeholder="Select sort code" options={sortCodes}
            onChange={(v) => setNames((m) => ({ ...m, [key]: { ...editOf(key), sort: v } }))} />
        </div>
      )
    } },
    { key: 'avail', label: 'Availability', render: (r: MasterRecord) => {
      const key = areaValue(r, level)
      return r.is_mapped ? '—' : (
        <div className="w-44" onClick={(e) => e.stopPropagation()}>
          <MenuSelect value={editOf(key).avail} placeholder="Select availability"
            options={ZONE_AVAILABILITY.map((a) => a.value)}
            labels={(v) => ZONE_AVAILABILITY.find((a) => a.value === v)?.label ?? v}
            onChange={(v) => setNames((m) => ({ ...m, [key]: { ...editOf(key), avail: v } }))} />
        </div>
      )
    } },
  ]
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  // same anatomy as every record form: section cards + sticky progress footer
  const reqDone = (hub ? 1 : 0) + (level ? 1 : 0)

  return (
    <div>
      <div className="grid gap-5">
        <RecordCard title="Zone Setup" done={reqDone === 2}
          meta={{ icon: <SlidersHorizontal size={15} className="text-brand-500" />, caption: 'Pick the branch, geographic level and optional carriers / service types this configuration applies to.' }}>
          <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
            <div className="min-w-0">
              <label className="mb-1.5 flex h-5 items-center gap-1 text-[13.5px] text-ink">Branch<span className="text-brand-500">*</span></label>
              {fixedBranch ? (
                <div className="flex h-8 items-center rounded-md border border-warm-300 bg-warm-50 px-3 text-[13px] text-ink-2">
                  {fixedBranch.name}
                </div>
              ) : (
                <MenuSelect value={branch} placeholder="Select branch" options={hubs.map((h) => h.name)}
                  onChange={(v) => { setBranch(v); setPage(1); setNames({}) }} />
              )}
            </div>
            <div className="min-w-0">
              <label className="mb-1.5 flex h-5 items-center gap-1 text-[13.5px] text-ink">Zone Level<span className="text-brand-500">*</span></label>
              <MenuSelect value={level} placeholder="Select zone level" options={ZONE_LEVELS.map((l) => l.key)}
                labels={levelLabel} onChange={(v) => { setLevel(v); setPage(1); setNames({}) }} />
            </div>
            <div className="min-w-0">
              <label className="mb-1.5 flex h-5 items-center text-[13.5px] text-ink">Carrier</label>
              <MultiSelect value={carrierSel} options={carriers} onChange={setCarrierSel} placeholder="Select carriers" />
            </div>
            <div className="min-w-0">
              <label className="mb-1.5 flex h-5 items-center text-[13.5px] text-ink">Service Type</label>
              <MultiSelect value={serviceSel} options={serviceTypes} onChange={setServiceSel} placeholder="Select service types" />
            </div>
          </div>
        </RecordCard>

        {hub && level && (
          <RecordCard title="Zone Assignments" done={pending.length > 0}
            meta={{ icon: <MapPinned size={15} className="text-brand-500" />, caption: "The branch's serviceable areas at this level — name a zone to assign it." }}>
            <div className="mb-3 flex justify-end">
              <label className="flex cursor-pointer items-center gap-2 text-[13px] text-ink">
                <Checkbox checked={separate} onChange={setSeparate} /> Add Separate ETA and Billing Zone
              </label>
            </div>
            {areas === null ? <LoadingBox label="Loading serviceable areas…" /> : areas.length === 0 ? (
              <p className="py-6 text-center text-[13px] text-ink-3">
                No serviceable areas at this level — add coverage on the Serviceable Areas tab first.
              </p>
            ) : (
              <>
                <DataTable columns={columns} rows={areas} rowKey="id" />
                <div className="flex items-center justify-between gap-3">
                  <div className="flex-1">
                    <Pagination page={page} total={totalPages}
                      range={`${(page - 1) * pageSize + 1}-${Math.min(page * pageSize, total)} of ${total}`}
                      onChange={setPage} />
                  </div>
                </div>
              </>
            )}
          </RecordCard>
        )}
      </div>

      <div className="sticky bottom-0 z-10 mt-5 flex items-center gap-4 rounded-xl border border-line bg-surface px-5 py-3 shadow-ds-1">
        <span className="h-1.5 w-28 overflow-hidden rounded-full bg-warm-100">
          <span className="block h-full rounded-full bg-brand-500 transition-all" style={{ width: `${(reqDone / 2) * 100}%` }} />
        </span>
        <span className="text-[12.5px] text-ink-3">
          {pending.length} zone assignment{pending.length === 1 ? '' : 's'} ready
        </span>
        <div className="ml-auto flex items-center gap-2">
          <Button variant="outline" onClick={() => onDone(false)}>{skippable ? 'Skip' : 'Cancel'}</Button>
          <Button onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save Zones'}</Button>
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------- branch view: zones tab ----
 * Zone configurations linked to one branch, shown on the branch view page. */

export function BranchZones({ branch }: { branch: MasterRecord }) {
  const [rows, setRows] = useState<MasterRecord[] | null>(null)
  const [mode, setMode] = useState<{ kind: 'list' } | { kind: 'add' } | { kind: 'config'; row: MasterRecord }>({ kind: 'list' })

  const load = () => {
    fetchZoneMasters()
      .then((rs) => setRows(rs.filter((r) => Number(r.branch_id) === Number(branch.id))
        .map((r) => ({ ...r, branchName: String(branch.name ?? '') }))))
      .catch(() => setRows([]))
  }
  useEffect(load, [branch.id, branch.name])

  if (mode.kind === 'add') {
    return (
      <ZoneSetupForm fixedBranch={{ id: Number(branch.id), name: String(branch.name ?? '') }}
        onDone={(saved) => { setMode({ kind: 'list' }); if (saved) load() }} />
    )
  }
  if (mode.kind === 'config') {
    return <ZoneConfigPage row={mode.row} embedded onBack={() => { setMode({ kind: 'list' }); load() }} />
  }

  // mirrors the Serviceable Areas tab's grammar: plain first columns, chips
  // for the data-rich cell, a pill for source — the two tabs read as siblings
  const columns: Column[] = [
    { key: 'level', label: 'Zone Level', render: (r: MasterRecord) => (
      <span className="font-bold text-ink">{levelLabel(String(r.level ?? ''))}</span>
    ) },
    { key: 'carrier', label: 'Carrier', render: (r: MasterRecord) => joinOrDash(r.carrier) },
    { key: 'service_type', label: 'Service Type', render: (r: MasterRecord) => joinOrDash(r.service_type) },
    { key: 'configured', label: 'Zones Configured', render: (r: MasterRecord) => {
      const s = (r.stats ?? {}) as Record<string, number>
      const total = s.total_serviceable_areas ?? 0
      const chip = (label: string, n: number) => (
        <span key={label} className="rounded-full bg-warm-100 px-2 py-0.5 text-[12px] font-bold text-ink-2">
          {label} {n ?? 0}/{total}
        </span>
      )
      return (
        <span className="inline-flex flex-wrap items-center gap-1">
          {chip('ETA', s.eta_zone_configured)}
          {chip('Billing', s.billing_zone_configured)}
          {chip('Sort', s.sort_code_configured)}
        </span>
      )
    } },
    { key: 'source', label: 'Source', render: (r: MasterRecord) => (
      <span className="rounded-full bg-warm-100 px-2.5 py-0.5 text-[12px] font-bold text-ink-2">
        {r.source === 'GLOBAL_GEOFENCES' ? 'Global' : String(r.source ?? '') || '—'}
      </span>
    ) },
  ]

  return (
    <div>
      <DetailTabActions>
        <Button icon={<Plus size={13} />} onClick={() => setMode({ kind: 'add' })}>Add Zone</Button>
      </DetailTabActions>
      <div className="rounded-xl border border-line bg-surface p-6 shadow-ds-1">
        {rows === null ? <LoadingBox label="Loading zones…" /> : rows.length === 0 ? (
          <p className="py-6 text-center text-[13px] text-ink-3">
            No zone configurations for this branch yet — use Add Zone to assign ETA and billing zones.
          </p>
        ) : (
          <>
            <p className="mb-3 text-[12.5px] text-ink-3">
              Zone configurations linked to this branch — click one to review and edit its assignments.
            </p>
            <DataTable columns={columns} rows={rows} rowKey="id"
              onRowClick={(r) => setMode({ kind: 'config', row: r as MasterRecord })} />
          </>
        )}
      </div>
    </div>
  )
}
