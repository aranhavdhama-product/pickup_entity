/**
 * Vehicle Config (LOCAL) — `/local/routing/vehicles?city&hub`.
 *
 * OWNER OVERRIDE (2026-09-25, see index.tsx): replica of staging's Central Vehicle Config
 * (`/v2/central-vehicle-config/99999/529?cityId&hubId`): back · City · Hub · Modes · Tags ·
 * Clear Filters | Add New Vehicle; "Total Vehicles: n | Click vehicle name to preview & edit
 * details"; columns Name · Hub · Mode ⓘ · Shift Start Time ⓘ · Shift End Time ⓘ · Weight
 * Capacity ⓘ · Volume Capacity ⓘ · Pallet Spaces ⓘ · Tags ⓘ with the time / number / tag
 * cells editable in place (saved as you leave the cell); 100/Page · pager · Refresh.
 * The name opens the full-page editor (VehicleEditor.tsx). Rows: src/config/vehicleConfig.ts.
 */
import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft, RefreshCw } from 'lucide-react'
import { Checkbox, MultiSelect, PageSize, Pagination } from '../../nueva/components'
import { ClearFilters, FilterLine, FilterMultiSelect, FilterSelect, LocalPage } from '../../local/chrome'
import { toast } from '../../nueva/toast'
import './routing.css'
import {
  HUB_CITIES, VEHICLE_MODES, VEHICLE_MODE_LABEL, cityOfHub, useVehicleConfig, vehicleConfigActions, type HubVehicle,
} from '../../config/vehicleConfig'
import { InfoLabel, ToolButton } from './stagingBits'

const HUBS = Object.keys(HUB_CITIES)
const CELL = 'h-8 w-full rounded-md border border-line bg-warm-50 px-2.5 text-[13px] text-ink focus:border-brand-500 focus:outline-none'

function NumCell({ value, onCommit }: { value: number; onCommit: (n: number) => void }) {
  const [v, setV] = useState(String(value))
  return <input type="number" className={CELL} value={v} onChange={(e) => setV(e.target.value)}
    onBlur={() => { const n = Math.max(0, Number(v) || 0); if (n !== value) onCommit(n); setV(String(n)) }} />
}
function TimeCell({ value, onCommit }: { value: string; onCommit: (t: string) => void }) {
  return <input type="time" className={`${CELL} bg-surface`} defaultValue={value}
    onBlur={(e) => { if (e.target.value && e.target.value !== value) onCommit(e.target.value) }} />
}

export default function VehicleConfigPage() {
  const nav = useNavigate()
  const [params, setParams] = useSearchParams()
  const { vehicles } = useVehicleConfig()
  const city = params.get('city') ?? ''
  const hubs = (params.get('hub') ?? '').split(',').filter(Boolean)
  const setQuery = (c: string, h: string[]) => {
    const next: Record<string, string> = {}
    if (c) next.city = c
    if (h.length) next.hub = h.join(',')
    setParams(next, { replace: true })
  }
  const [modes, setModes] = useState<string[]>([])
  const [tags, setTags] = useState<string[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(100)

  const allTags = [...new Set(vehicles.flatMap((v) => v.tags))].sort()
  const rows = useMemo(() => vehicles.filter((v) => (!city || cityOfHub(v.hubCode) === city)
    && (!hubs.length || hubs.includes(v.hubCode))
    && (!modes.length || modes.includes(VEHICLE_MODE_LABEL[v.mode]))
    && (!tags.length || v.tags.some((t) => tags.includes(t)))), [vehicles, city, hubs, modes, tags])
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize))
  const safePage = Math.min(page, totalPages)
  const paged = rows.slice((safePage - 1) * pageSize, safePage * pageSize)
  const filtersOn = !!city || hubs.length > 0 || modes.length > 0 || tags.length > 0
  const save = (v: HubVehicle, patch: Partial<HubVehicle>) => { vehicleConfigActions.upsert({ ...v, ...patch }); toast.success(`${v.name} updated.`) }
  const allOn = paged.length > 0 && paged.every((v) => selected.has(v.id))

  const head = 'px-2 text-left text-[13px] font-bold text-ink'
  return (
    <LocalPage>
      <FilterLine right={<span className="lr-toolbar ml-auto flex items-center gap-2">
        <ToolButton tone="brand-outline" onClick={() => nav(`/local/routing/vehicles/new${hubs[0] ? `?hub=${hubs[0]}` : ''}`)}>Add New Vehicle</ToolButton>
      </span>}>
        <ToolButton icon={<ArrowLeft size={16} />} title="Back" onClick={() => nav('/local/routing')} />
        <FilterSelect value={city} placeholder="City" options={[...new Set(Object.values(HUB_CITIES))]} width={96}
          onChange={(c) => { setQuery(c, []); setPage(1) }} />
        <FilterMultiSelect values={hubs} placeholder="Hub" options={HUBS.filter((h) => !city || cityOfHub(h) === city)} width={96}
          onChange={(h) => { setQuery(city, h); setPage(1) }} />
        <FilterMultiSelect values={modes} placeholder="Modes" options={VEHICLE_MODES.map((m) => VEHICLE_MODE_LABEL[m])} width={104} onChange={setModes} />
        <FilterMultiSelect values={tags} placeholder="Tags" options={allTags} width={96} onChange={setTags} />
        <ClearFilters active={filtersOn} onClick={() => { setQuery('', []); setModes([]); setTags([]) }} />
      </FilterLine>

      <p className="mb-3 text-[12px] text-ink">
        Total Vehicles: {rows.length} <span className="mx-1 text-ink-3">|</span>
        <span className="text-ink-3">Click vehicle name to preview &amp; edit details</span>
      </p>

      <div className="overflow-x-auto rounded-lg border border-line bg-surface">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr className="h-[50px] border-b border-line">
              <th className="w-10 px-3"><Checkbox checked={allOn} onChange={() => setSelected(allOn ? new Set() : new Set(paged.map((v) => v.id)))} /></th>
              <th className={head}>Name</th>
              <th className={head}>Hub</th>
              <th className={head}><InfoLabel tip="Travelling mode">Mode</InfoLabel></th>
              <th className={head}><InfoLabel tip="Shift start (HH:mm)">Shift Start Time</InfoLabel></th>
              <th className={head}><InfoLabel tip="Shift end (HH:mm)">Shift End Time</InfoLabel></th>
              <th className={head}><InfoLabel tip="kg">Weight Capacity</InfoLabel></th>
              <th className={head}><InfoLabel tip="m³">Volume Capacity</InfoLabel></th>
              <th className={head}><InfoLabel tip="Pallets">Pallet Spaces</InfoLabel></th>
              <th className={head}><InfoLabel tip="Vehicle tags">Tags</InfoLabel></th>
            </tr>
          </thead>
          <tbody>
            {paged.map((v) => (
              <tr key={v.id} className="h-[62px] border-b border-line hover:bg-warm-50">
                <td className="px-3"><Checkbox checked={selected.has(v.id)} onChange={() => setSelected((s) => { const n = new Set(s); if (n.has(v.id)) n.delete(v.id); else n.add(v.id); return n })} /></td>
                <td className="px-2"><button type="button" className="text-left text-ink hover:text-brand-500 hover:underline" onClick={() => nav(`/local/routing/vehicles/${v.id}`)}>{v.name}</button></td>
                <td className="whitespace-nowrap px-2 text-ink">{v.hubCode}</td>
                <td className="whitespace-nowrap px-2 text-ink">{VEHICLE_MODE_LABEL[v.mode]}</td>
                <td className="w-[140px] px-2"><TimeCell value={v.shiftStart} onCommit={(shiftStart) => save(v, { shiftStart })} /></td>
                <td className="w-[140px] px-2"><TimeCell value={v.shiftEnd} onCommit={(shiftEnd) => save(v, { shiftEnd })} /></td>
                <td className="w-[140px] px-2"><NumCell value={v.weightCapacityKg} onCommit={(weightCapacityKg) => save(v, { weightCapacityKg })} /></td>
                <td className="w-[140px] px-2"><NumCell value={v.volumeCapacity} onCommit={(volumeCapacity) => save(v, { volumeCapacity })} /></td>
                <td className="w-[140px] px-2"><NumCell value={v.palletSpaces} onCommit={(palletSpaces) => save(v, { palletSpaces })} /></td>
                <td className="w-[170px] px-2"><MultiSelect value={v.tags} options={allTags} creatable placeholder="type here" onChange={(t) => save(v, { tags: t })} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <p className="py-16 text-center text-[13px] text-ink-3">No vehicles for this city / hub.</p>}
      </div>

      <div className="mt-3 flex items-center gap-3">
        <PageSize value={pageSize} onChange={(n) => { setPageSize(n); setPage(1) }} />
        <div className="flex-1"><Pagination page={safePage} total={totalPages} onChange={setPage} range={`${rows.length ? (safePage - 1) * pageSize + 1 : 0}-${Math.min(safePage * pageSize, rows.length)} of ${rows.length}`} /></div>
        <ToolButton icon={<RefreshCw size={14} />} onClick={() => toast.success('Vehicles refreshed.')}>Refresh</ToolButton>
      </div>
    </LocalPage>
  )
}
