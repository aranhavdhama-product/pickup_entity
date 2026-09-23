/**
 * Geofence studio — per-branch fence management on staging's REAL store.
 *
 * Staging's Manage Geofence page runs on the LEGACY hub-fence store (captured
 * live 2026-08-27) — NOT the master `branchGeofence` entity:
 *   GET  /v1/app/rest/geoFencing_data_for_hub?hubId&cityId        — list
 *   POST /v1/app/rest/geoFencing_data_for_hub?hubId  (array)     — upsert
 *   POST /v1/app/rest/geoFencing_data_for_hub/delete?id=<id>     — delete
 * Field formats verified against the live validator: labels is a COMMA STRING
 * (arrays 400), startLocation is "lat,lng", stopThresholdConfig is STRINGIFIED
 * JSON, fenceType 1=Normal / 4=Exclusion / 5=Virtual.
 * Define-Area search runs on staging's own APIs too: zip suggestions +
 * postal-code boundary (/master/api/v1/geofence) and geoCoding_v2 addresses.
 *
 * Layout: Add Geofence (three modes: draw / KML / GeoJSON) + download sit
 * OUTSIDE the card, below the record tabs; the card holds the overview map
 * (all fences in their own colors, hub pin) above a standard DataTable whose
 * multiselect opens the consignment-style floating actions popup. Draw tools
 * (polygon/circle/undo/clear) live ON the map.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import {
  ChevronDown, Circle as CircleIcon, Download, FileJson, FileUp, Hexagon, MapPinned,
  Pencil, Plus, Power, Search, Trash2, Undo2, X,
} from 'lucide-react'
import {
  Button, DataTable, IconButton, Input, LoadingBox, MenuSelect, Modal, StatusPill, Toggle,
  type Column, type SelectionAction,
} from './components'
import { LocationField } from './MapPicker'
import { download } from './masterDataIO'
import {
  deleteHubGeofence, fetchCountries, fetchHubGeofences, fetchZipBoundary, fetchZipSuggestions,
  geocodeAddress, geoDataOf, ringOfFence, saveHubGeofences,
  type HubGeofence, type MasterRecord,
} from './settingsApi'
import { toast } from './toast'

type Ring = [number, number][]  // [lng, lat] — GeoJSON vertex order

const FENCE_COLORS = ['#3388ff', '#F26C2E', '#16a34a', '#9333ea', '#dc2626', '#0d9488']

/** staging's wizard dropdowns, read off the live UI + bundle */
const FENCE_TYPES = [
  { value: '1', label: 'Normal' },
  { value: '4', label: 'Exclusion' },
  { value: '5', label: 'Virtual' },
]
const THRESHOLD_PARAMS = [
  { value: 'weight', label: 'Weight' },
  { value: 'pallets', label: 'Pallets' },
  { value: 'tag', label: 'Tag' },
  { value: 'tagRegex', label: 'Tag Regex' },
]

/** approximate area of a lat/lng ring in km² (spherical shoelace) */
function areaKm2(ring: Ring): number {
  if (ring.length < 3) return 0
  const R = 6371
  let sum = 0
  for (let i = 0; i < ring.length; i++) {
    const [lng1, lat1] = ring[i]
    const [lng2, lat2] = ring[(i + 1) % ring.length]
    sum += ((lng2 - lng1) * Math.PI / 180) * (2 + Math.sin(lat1 * Math.PI / 180) + Math.sin(lat2 * Math.PI / 180))
  }
  return Math.abs(sum * R * R / 2)
}

const fmtArea = (km2: number) =>
  km2 <= 0 ? '—' : km2 >= 100 ? `${Math.round(km2).toLocaleString()} km²` : `${km2.toFixed(1)} km²`

const HUB_PIN = L.divIcon({
  className: '',
  html: '<div style="width:16px;height:16px;border-radius:50% 50% 50% 0;background:#1d4ed8;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.35);transform:rotate(-45deg);margin:-8px 0 0 -8px"></div>',
  iconSize: [0, 0],
})

const branchLatLng = (branch: MasterRecord): [number, number] | null => {
  const la = Number(branch.latitude), ln = Number(branch.longitude)
  return String(branch.latitude ?? '').trim() !== '' && String(branch.longitude ?? '').trim() !== '' && isFinite(la) && isFinite(ln)
    ? [la, ln] : null
}

/* ------------------------------------------------------------ count chip ---- */

export function GeofenceCount({ branch, onOpen }: { branch: MasterRecord; onOpen?: () => void }) {
  const [open, setOpen] = useState(false)
  const n = Number(branch.geofenceCount ?? 0)
  return (
    <>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onOpen ? onOpen() : setOpen(true) }}
        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[12px] font-bold transition-colors
          ${n > 0 ? 'bg-info-bg text-info-fg hover:opacity-80' : 'bg-warm-100 text-ink-3 hover:bg-warm-200'}`}>
        <MapPinned size={12} />{n}
      </button>
      {open && <GeofenceModal branch={branch} onClose={() => setOpen(false)} />}
    </>
  )
}

export default function GeofenceAction({ branch }: { branch: MasterRecord }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button variant="outline" icon={<MapPinned size={13} />} onClick={() => setOpen(true)}>
        Manage Geofences
      </Button>
      {open && <GeofenceModal branch={branch} onClose={() => setOpen(false)} />}
    </>
  )
}

export function GeofenceModal({ branch, onClose }: { branch: MasterRecord; onClose: () => void }) {
  return (
    <Modal title={`Geofences — ${String(branch.name ?? branch.code)}`} open onClose={onClose} wide
      footer={<Button variant="outline" onClick={onClose}>Close</Button>}>
      <GeofencePanel branch={branch} bare />
    </Modal>
  )
}

/* ---------------------------------------------------------- overview map ---- */

function OverviewMap({ branch, fences, focusId }: {
  branch: MasterRecord
  fences: HubGeofence[]
  focusId?: number | null
}) {
  const elRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const layerRef = useRef<L.LayerGroup | null>(null)

  useEffect(() => {
    const el = elRef.current
    if (!el || mapRef.current) return
    const map = L.map(el, { zoomControl: true, attributionControl: false })
    L.tileLayer('/osm/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map)
    const at = branchLatLng(branch)
    if (at) { map.setView(at, 10); L.marker(at, { icon: HUB_PIN }).addTo(map) }
    else map.setView([39.5, -84], 4)
    layerRef.current = L.layerGroup().addTo(map)
    mapRef.current = map
    return () => { map.remove(); mapRef.current = null; layerRef.current = null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const map = mapRef.current, layer = layerRef.current
    if (!map || !layer) return
    layer.clearLayers()
    const bounds = L.latLngBounds([])
    const at = branchLatLng(branch)
    if (at) bounds.extend(at)
    for (const f of fences) {
      const ring = ringOfFence(f)
      if (!ring) continue
      const latlngs = ring.map(([lng, lat]) => [lat, lng] as [number, number])
      const color = String(f.colorCode ?? '#3388ff')
      const focused = focusId != null && f.id === focusId
      const poly = L.polygon(latlngs, {
        color, weight: focused ? 3 : 2, fillColor: color,
        fillOpacity: f.enabled === false ? 0.05 : focused ? 0.28 : 0.15,
        dashArray: f.enabled === false ? '6 6' : undefined,
      }).addTo(layer)
      poly.bindTooltip(String(f.name ?? ''), { sticky: true })
      latlngs.forEach((ll) => bounds.extend(ll))
    }
    if (focusId != null) {
      const f = fences.find((x) => x.id === focusId)
      const ring = f && ringOfFence(f)
      if (ring) {
        map.fitBounds(L.latLngBounds(ring.map(([lng, lat]) => [lat, lng] as [number, number])).pad(0.35))
        return
      }
    }
    if (bounds.isValid()) map.fitBounds(bounds.pad(0.25))
  }, [fences, focusId, branch])

  return <div ref={elRef} style={{ height: 300 }} className="w-full overflow-hidden rounded-lg border border-line" />
}

/* ------------------------------------------------- header actions teleport ----
 * The record PageHeader exposes a `#detail-tab-actions` slot while a detail tab
 * is active (LiveMaster) — the panel's actions render THERE, exactly where the
 * Edit button sits on the Details tab. Falls back to an inline right-aligned
 * row when no slot exists (e.g. inside the Manage Geofences modal). */
export function DetailTabActions({ children }: { children: React.ReactNode }) {
  const [slot, setSlot] = useState<HTMLElement | null>(null)
  useEffect(() => { setSlot(document.getElementById('detail-tab-actions')) }, [])
  if (slot) return createPortal(children, slot)
  return <div className="mb-3 flex items-center justify-end gap-2">{children}</div>
}

/* --------------------------------------------------- Add Geofence dropdown ---- */

function AddGeofenceMenu({ onDraw, onImport }: {
  onDraw: () => void
  onImport: (kind: 'kml' | 'geojson') => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  const item = (label: string, icon: React.ReactNode, onClick: () => void) => (
    <button type="button" onClick={() => { setOpen(false); onClick() }}
      className="flex w-full items-center gap-2.5 px-4 py-2 text-left text-[13px] text-ink hover:bg-warm-50">
      <span className="text-ink-3">{icon}</span>{label}
    </button>
  )

  return (
    <div ref={ref} className="relative">
      <Button icon={<Plus size={13} />} onClick={() => setOpen((o) => !o)}>
        Add Geofence<ChevronDown size={13} className="ml-1" />
      </Button>
      {open && (
        <div className="absolute right-0 top-9 z-[1100] w-52 overflow-hidden rounded-xl border border-line bg-surface py-1.5 shadow-ds-overlay">
          {item('Draw on Map', <Hexagon size={14} />, onDraw)}
          {item('Import KML', <FileUp size={14} />, () => onImport('kml'))}
          {item('Import GeoJSON', <FileJson size={14} />, () => onImport('geojson'))}
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------ the studio ---- */

export function GeofencePanel({ branch, bare }: { branch: MasterRecord; bare?: boolean }) {
  const [rows, setRows] = useState<HubGeofence[] | null>(null)
  const [editing, setEditing] = useState<{ fence?: HubGeofence; ring?: Ring; name?: string } | null>(null)
  const [focusId, setFocusId] = useState<number | null>(null)
  const kmlRef = useRef<HTMLInputElement>(null)
  const geojsonRef = useRef<HTMLInputElement>(null)

  const load = () => {
    fetchHubGeofences(String(branch.id), branch.cityId as number | undefined)
      .then(setRows).catch(() => setRows([]))
  }
  useEffect(load, [])

  const removeMany = async (fences: HubGeofence[]) => {
    try {
      for (const g of fences) await deleteHubGeofence(g.id!)
      toast.success(fences.length === 1
        ? `Geofence "${fences[0].name}" deleted.` : `${fences.length} geofences deleted.`)
      setFocusId(null)
      load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Delete failed.')
      load()
    }
  }

  /* real update — re-POST the same rows (ids kept) with enabled flipped */
  const setEnabledMany = async (fences: HubGeofence[], v: boolean) => {
    setRows((rs) => rs?.map((r) => fences.some((f) => f.id === r.id) ? { ...r, enabled: v } : r) ?? rs)
    try {
      await saveHubGeofences(String(branch.id), fences.map((g) => ({ ...g, enabled: v })))
      toast.success(fences.length === 1
        ? `Geofence "${fences[0].name}" ${v ? 'enabled' : 'disabled'}.`
        : `${fences.length} geofences ${v ? 'enabled' : 'disabled'}.`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Status change failed.')
      load()
    }
  }

  const downloadFences = (fences: HubGeofence[]) => {
    const features = fences.map((g) => {
      const ring = ringOfFence(g)
      return ring && {
        type: 'Feature',
        properties: { name: g.name, priority: g.priority, enabled: g.enabled, color: g.colorCode },
        geometry: { type: 'Polygon', coordinates: [ring] },
      }
    }).filter(Boolean)
    download(`geofences-${String(branch.code ?? branch.id)}.geojson`, 'application/geo+json',
      JSON.stringify({ type: 'FeatureCollection', features }, null, 2))
    toast.info(`Downloaded ${features.length} geofence${features.length === 1 ? '' : 's'} as GeoJSON.`)
  }

  /* -------- import: KML or GeoJSON → prefilled editor for review + save */
  const onFile = async (file: File) => {
    const text = await file.text()
    let ring: Ring | null = null
    try {
      if (/\.kml$/i.test(file.name) || text.includes('<kml')) {
        const doc = new DOMParser().parseFromString(text, 'text/xml')
        const coords = doc.getElementsByTagName('coordinates')[0]?.textContent ?? ''
        ring = coords.trim().split(/\s+/)
          .map((t) => t.split(',').map(Number))
          .filter((p) => p.length >= 2 && p.every((n) => !isNaN(n)))
          .map((p) => [p[0], p[1]] as [number, number])
      } else {
        const g = JSON.parse(text) as Record<string, unknown>
        const geom = (g.type === 'FeatureCollection'
          ? ((g.features as { geometry?: unknown }[])?.[0]?.geometry)
          : g.type === 'Feature' ? g.geometry : g) as { type?: string; coordinates?: unknown }
        if (geom?.type === 'Polygon') ring = (geom.coordinates as Ring[])[0]
      }
    } catch { /* handled below */ }
    if (!ring || ring.length < 3) {
      toast.error('No polygon found in that file — expected KML or GeoJSON with a Polygon.')
      return
    }
    setEditing({ ring, name: file.name.replace(/\.(kml|geojson|json)$/i, '') })
  }

  // staging's column set (Boundary Name / Label / Merged Zip Codes / No. of
  // stops per hour / Fence Priority / Status) + our computed Area
  const columns: Column[] = [
    { key: 'name', label: 'Boundary Name', render: (g: HubGeofence) => (
      <span className="inline-flex items-center gap-2 font-bold text-ink">
        <span className="h-3 w-3 shrink-0 rounded-[3px] border border-black/10"
          style={{ background: String(g.colorCode ?? '#3388ff') }} />
        {String(g.name ?? '')}
      </span>
    ) },
    { key: 'fenceType', label: 'Zone Type', render: (g: HubGeofence) =>
      FENCE_TYPES.find((t) => t.value === String(g.fenceType ?? 1))?.label ?? 'Normal' },
    { key: 'masterDeliveryVelocity', label: 'No. of stops per hour', render: (g: HubGeofence) =>
      String(Number(g.masterDeliveryVelocity ?? 0)) },
    { key: 'priority', label: 'Fence Priority', render: (g: HubGeofence) =>
      g.priority == null ? '—' : String(g.priority) },
    { key: 'area', label: 'Area', render: (g: HubGeofence) => {
      const ring = ringOfFence(g)
      return ring ? fmtArea(areaKm2(ring)) : '—'
    } },
    { key: 'enabled', label: 'Status', render: (g: HubGeofence) => (
      <StatusPill label={g.enabled !== false ? 'Active' : 'Inactive'} tone={g.enabled !== false ? 'success' : 'neutral'} />
    ) },
  ]

  // consignment-style selection popup — context-aware, like every other list
  const selectionActions = (sel: HubGeofence[], clear: () => void): SelectionAction[] => {
    const enabled = sel.filter((g) => g.enabled !== false)
    const disabled = sel.filter((g) => g.enabled === false)
    const acts: SelectionAction[] = []
    if (sel.length === 1) {
      acts.push({ label: 'Edit Geofence', icon: <Pencil size={14} />, onClick: () => { clear(); setEditing({ fence: sel[0] }) } })
    }
    if (disabled.length) acts.push({
      label: sel.length === 1 ? 'Enable Geofence' : `Enable (${disabled.length})`,
      icon: <Power size={14} />, onClick: () => { clear(); setEnabledMany(disabled, true) },
    })
    if (enabled.length) acts.push({
      label: sel.length === 1 ? 'Disable Geofence' : `Disable (${enabled.length})`,
      icon: <Power size={14} />, onClick: () => { clear(); setEnabledMany(enabled, false) },
    })
    if (sel.length > 1) acts.push({
      label: `Download GeoJSON (${sel.length})`, icon: <Download size={14} />, onClick: () => { clear(); downloadFences(sel) },
    })
    acts.push({
      label: sel.length === 1 ? 'Delete Geofence' : `Delete (${sel.length})`,
      icon: <Trash2 size={14} />, onClick: () => { clear(); removeMany(sel) },
    })
    return acts
  }

  const card = (body: React.ReactNode) =>
    bare ? <>{body}</> : <div className="rounded-xl border border-line bg-surface p-6 shadow-ds-1">{body}</div>

  if (editing) {
    return card(
      <FenceEditor
        branch={branch}
        fence={editing.fence}
        siblings={rows ?? []}
        initialRing={editing.ring}
        initialName={editing.name}
        onDone={(saved) => { setEditing(null); if (saved) load() }}
      />,
    )
  }

  return (
    <div>
      {/* actions render in the record header — same spot as Edit on Details */}
      <DetailTabActions>
        <IconButton icon={<Download size={15} />} title="Download as GeoJSON" onClick={() => downloadFences(rows ?? [])} />
        <AddGeofenceMenu
          onDraw={() => setEditing({})}
          onImport={(kind) => (kind === 'kml' ? kmlRef : geojsonRef).current?.click()}
        />
        <input ref={kmlRef} type="file" accept=".kml" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = '' }} />
        <input ref={geojsonRef} type="file" accept=".geojson,.json" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = '' }} />
      </DetailTabActions>

      {card(
        rows === null ? <LoadingBox label="Loading geofences…" /> : rows.length === 0 ? (
          <button
            type="button" onClick={() => setEditing({})}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-warm-300 py-8
                       text-[13px] font-bold text-brand-500 transition-colors hover:border-brand-500 hover:bg-brand-50/40">
            <Plus size={14} /> Draw the first geofence
            <span className="font-normal text-ink-3">— none mapped to this branch yet</span>
          </button>
        ) : (
          <>
            <p className="mb-3 text-[12.5px] text-ink-3">
              {rows.length} geofence{rows.length === 1 ? '' : 's'} on this branch — click a row to zoom it on the map.
            </p>
            <OverviewMap branch={branch} fences={rows} focusId={focusId} />
            <div className="mt-3">
              <DataTable
                columns={columns}
                rows={rows}
                selectable
                rowKey="id"
                onRowClick={(g: HubGeofence) => setFocusId((cur) => cur === g.id ? null : g.id ?? null)}
                selectionActions={selectionActions}
              />
            </div>
          </>
        ),
      )}
    </div>
  )
}

/* ------------------------------------------------------------ the editor ---- */

const VERTEX = L.divIcon({
  className: '',
  html: '<div style="width:10px;height:10px;border-radius:50%;background:#F26C2E;border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.4);margin:-5px 0 0 -5px"></div>',
  iconSize: [0, 0],
})

/** circle → 32-vertex GeoJSON ring around a center */
function circleRing(center: [number, number], edge: [number, number]): Ring {
  const [clng, clat] = center
  const [elng, elat] = edge
  const dLat = elat - clat
  const dLng = (elng - clng) * Math.cos((clat * Math.PI) / 180)
  const r = Math.sqrt(dLat * dLat + dLng * dLng)
  const ring: Ring = []
  for (let i = 0; i < 32; i++) {
    const a = (i / 32) * 2 * Math.PI
    ring.push([
      Number((clng + (r * Math.sin(a)) / Math.cos((clat * Math.PI) / 180)).toFixed(6)),
      Number((clat + r * Math.cos(a)).toFixed(6)),
    ])
  }
  return ring
}

function FenceEditor({ branch, fence, siblings, initialRing, initialName, onDone }: {
  branch: MasterRecord
  fence?: HubGeofence
  /** the branch's other fences — drawn as faint context so new areas don't overlap blind */
  siblings: HubGeofence[]
  initialRing?: Ring
  initialName?: string
  onDone: (saved: boolean) => void
}) {
  const startRing: Ring = initialRing ?? (fence ? ringOfFence(fence) ?? [] : [])
  // drop the GeoJSON closing vertex for editing
  const openRing = startRing.length > 1 &&
    startRing[0][0] === startRing[startRing.length - 1][0] &&
    startRing[0][1] === startRing[startRing.length - 1][1]
    ? startRing.slice(0, -1) : startRing

  const [points, setPoints] = useState<Ring>(openRing)
  const [mode, setMode] = useState<'polygon' | 'circle'>('polygon')
  const [circleCenter, setCircleCenter] = useState<[number, number] | null>(null)
  const [name, setName] = useState(String(fence?.name ?? initialName ?? ''))
  const [fenceType, setFenceType] = useState(String(fence?.fenceType ?? 1))
  const [priority, setPriority] = useState(fence?.priority == null ? '' : String(fence.priority))
  const [labels, setLabels] = useState<string[]>(
    String(fence?.labels ?? '').split(',').map((s) => s.trim()).filter(Boolean))
  const [labelDraft, setLabelDraft] = useState('')
  const [startLoc, setStartLoc] = useState(String(fence?.startLocation ?? ''))
  const [stopsPerHour, setStopsPerHour] = useState(
    fence?.masterDeliveryVelocity == null || Number(fence.masterDeliveryVelocity) === 0
      ? '' : String(fence.masterDeliveryVelocity))
  const [minStops, setMinStops] = useState(
    fence?.minStopsForClustering == null ? '' : String(fence.minStopsForClustering))
  const existingThreshold = useMemo(() => {
    try { return JSON.parse(String(fence?.stopThresholdConfig ?? '')) as Record<string, unknown> } catch { return {} }
  }, [fence])
  const [thresholdParam, setThresholdParam] = useState(String(existingThreshold.parameter ?? ''))
  const [thresholdValue, setThresholdValue] = useState(
    existingThreshold.parameter ? String(existingThreshold[String(existingThreshold.parameter)] ?? '') : '')
  const [color, setColor] = useState(String(fence?.colorCode ?? '#3388ff'))
  const [enabled, setEnabled] = useState(fence ? fence.enabled !== false : true)
  const [saving, setSaving] = useState(false)
  const [zips, setZips] = useState<string[]>(
    String(fence?.mergedZipCodes ?? '').split(',').map((s) => s.trim()).filter(Boolean))

  const elRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const layerRef = useRef<L.LayerGroup | null>(null)
  const stateRef = useRef({ points, mode, circleCenter })
  stateRef.current = { points, mode, circleCenter }

  const context = useMemo(() => siblings.filter((s) => s.id !== fence?.id), [siblings, fence])
  const labelSuggestions = useMemo(() => {
    const all = new Set<string>()
    for (const s of siblings) for (const l of String(s.labels ?? '').split(',')) {
      const v = l.trim()
      if (v && !labels.includes(v)) all.add(v)
    }
    return [...all]
  }, [siblings, labels])

  const [startLat, startLng] = useMemo(() => {
    const [la, ln] = startLoc.split(',').map((s) => s.trim())
    return [la ?? '', ln ?? '']
  }, [startLoc])

  useEffect(() => {
    const el = elRef.current
    if (!el || mapRef.current) return
    const map = L.map(el, { zoomControl: true, attributionControl: false })
    L.tileLayer('/osm/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map)

    // center priority: the ring being edited → branch pin + sibling fences → wide
    const at = branchLatLng(branch)
    if (openRing.length) {
      map.fitBounds(L.latLngBounds(openRing.map(([lng, lat]) => [lat, lng] as [number, number])).pad(0.3))
    } else {
      const bounds = L.latLngBounds([])
      if (at) bounds.extend(at)
      for (const s of context) {
        const ring = ringOfFence(s)
        ring?.forEach(([lng, lat]) => bounds.extend([lat, lng]))
      }
      if (bounds.isValid()) map.fitBounds(bounds.pad(0.3))
      else map.setView([39.5, -84], 4)
      if (at && map.getZoom() > 13) map.setZoom(12)
    }
    if (at) L.marker(at, { icon: HUB_PIN }).addTo(map)

    // sibling fences as faint outlines — context, not editable
    for (const s of context) {
      const ring = ringOfFence(s)
      if (!ring) continue
      L.polygon(ring.map(([lng, lat]) => [lat, lng] as [number, number]), {
        color: String(s.colorCode ?? '#3388ff'), weight: 1.5, fillOpacity: 0.05, dashArray: '4 5',
      }).addTo(map).bindTooltip(String(s.name ?? ''), { sticky: true })
    }

    layerRef.current = L.layerGroup().addTo(map)
    map.on('click', (e: L.LeafletMouseEvent) => {
      const pt: [number, number] = [Number(e.latlng.lng.toFixed(6)), Number(e.latlng.lat.toFixed(6))]
      const cur = stateRef.current
      if (cur.mode === 'circle') {
        if (!cur.circleCenter) {
          setCircleCenter(pt)
          setPoints([])
        } else {
          setPoints(circleRing(cur.circleCenter, pt))
          setCircleCenter(null)
        }
      } else {
        setPoints([...cur.points, pt])
      }
    })
    mapRef.current = map
    return () => { map.remove(); mapRef.current = null; layerRef.current = null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // redraw vertices + polygon on every change
  useEffect(() => {
    const layer = layerRef.current
    if (!layer) return
    layer.clearLayers()
    const latlngs = points.map(([lng, lat]) => [lat, lng] as [number, number])
    if (mode === 'polygon') for (const ll of latlngs) L.marker(ll, { icon: VERTEX }).addTo(layer)
    if (latlngs.length >= 2) {
      L.polygon(latlngs, { color, weight: 2, fillColor: color, fillOpacity: 0.15 }).addTo(layer)
    }
    if (circleCenter) L.marker([circleCenter[1], circleCenter[0]], { icon: VERTEX }).addTo(layer)
  }, [points, circleCenter, mode, color])

  /* a zip boundary replaces the current drawing (staging's Define Area flow) */
  const loadZipBoundary = (ring: Ring, zip: string, city: string) => {
    const open = ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1]
      ? ring.slice(0, -1) : ring
    setPoints(open)
    setCircleCenter(null)
    setZips([zip])
    if (!name.trim() && city) setName(`${city} ${zip}`)
    const map = mapRef.current
    if (map) map.fitBounds(L.latLngBounds(open.map(([lng, lat]) => [lat, lng] as [number, number])).pad(0.3))
  }

  const recenter = (lat: number, lng: number) => {
    mapRef.current?.setView([lat, lng], 13)
  }

  const addLabel = (raw: string) => {
    const v = raw.trim().replace(/,+$/, '')
    if (v && !labels.includes(v)) setLabels([...labels, v])
    setLabelDraft('')
  }

  const save = async () => {
    if (!name.trim()) {
      toast.error('Fence Name is required.')
      return
    }
    if (points.length < 3) {
      toast.error('Draw at least 3 points on the map to form an area.')
      return
    }
    setSaving(true)
    try {
      const ring: Ring = [...points, points[0]]  // close the GeoJSON ring
      // threshold config is a STRINGIFIED object; keep unknown keys from the row
      let stopThresholdConfig: string | null = (fence?.stopThresholdConfig as string | null) ?? null
      if (thresholdParam) {
        const num = Number(thresholdValue)
        stopThresholdConfig = JSON.stringify({
          ...existingThreshold,
          parameter: thresholdParam,
          [thresholdParam]: thresholdValue.trim() === '' ? null
            : (thresholdParam === 'weight' || thresholdParam === 'pallets') && isFinite(num) ? num : thresholdValue.trim(),
        })
      }
      // UPSERT on staging's own endpoint — id kept = real update, no id = create.
      // Spread the existing row first so unknown fields round-trip untouched.
      await saveHubGeofences(String(branch.id), [{
        ...(fence ?? { travelingMode: 'driving' }),
        name: name.trim(),
        companyId: (fence?.companyId ?? branch.companyId) as number | undefined,
        hubId: Number(branch.id),
        fenceType: Number(fenceType) || 1,
        priority: priority.trim() === '' ? null : Number(priority),
        labels: labels.length ? labels.join(',') : null,
        startLocation: startLoc.trim() || null,
        masterDeliveryVelocity: stopsPerHour.trim() === '' ? 0 : Number(stopsPerHour),
        minStopsForClustering: minStops.trim() === '' ? null : Number(minStops),
        stopThresholdConfig,
        mergedZipCodes: zips.length ? zips.join(',') : (fence?.mergedZipCodes ?? null),
        colorCode: color,
        enabled,
        geoData: geoDataOf(ring, color),
      }])
      toast.success(`Geofence "${name.trim()}" ${fence ? 'updated' : 'created'}.`)
      onDone(true)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save geofence.')
      setSaving(false)
    }
  }

  /* on-map control button */
  const mapBtn = (active: boolean, onClick: () => void, title: string, icon: React.ReactNode) => (
    <button
      type="button" title={title} onClick={onClick}
      className={`flex h-8 w-8 items-center justify-center rounded-md border shadow-ds-1 transition-colors
        ${active ? 'border-brand-500 bg-brand-500 text-white' : 'border-line bg-surface text-ink-2 hover:text-ink'}`}>
      {icon}
    </button>
  )

  const field = (label: string, node: React.ReactNode, required = false) => (
    <div className="min-w-0">
      <label className="mb-1.5 flex h-5 items-center gap-1 text-[13.5px] text-ink">
        {label}{required && <span className="text-brand-500">*</span>}
      </label>
      {node}
    </div>
  )

  return (
    <div className="pb-2">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <p className="text-[13.5px] font-bold text-ink">{fence ? `Edit ${fence.name}` : 'New geofence'}</p>
        <p className="text-[12.5px] text-ink-3">
          {mode === 'circle'
            ? (circleCenter ? '— now click the edge to size the circle.' : '— click the map to set the circle center.')
            : '— click the map to add points; the area closes automatically.'}
        </p>
      </div>

      <LocationSearch onBoundary={loadZipBoundary} onCenter={recenter} />

      {/* the map, with the draw tools ON it (staging's Define Area anatomy) */}
      <div className="relative">
        <div ref={elRef} style={{ height: 380 }} className="w-full overflow-hidden rounded-lg border border-line" />
        <div className="absolute left-3 top-24 z-[1000] flex flex-col gap-1.5">
          {mapBtn(mode === 'polygon', () => { setMode('polygon'); setCircleCenter(null) }, 'Draw polygon', <Hexagon size={15} />)}
          {mapBtn(mode === 'circle', () => { setMode('circle'); setCircleCenter(null) }, 'Draw circle', <CircleIcon size={15} />)}
        </div>
        <div className="absolute right-3 top-3 z-[1000] flex gap-1.5">
          {mapBtn(false, () => setPoints(points.slice(0, -1)), 'Undo last point', <Undo2 size={15} />)}
          {mapBtn(false, () => { setPoints([]); setCircleCenter(null); setZips([]) }, 'Clear drawing', <X size={15} />)}
        </div>
      </div>

      {/* ------------- Basic Details (staging's Configure step, our chrome) */}
      <p className="mt-5 text-[13px] font-bold text-ink">Basic Details</p>
      <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
        {field('Fence Type', (
          <MenuSelect value={fenceType} options={FENCE_TYPES.map((t) => t.value)}
            labels={(v) => FENCE_TYPES.find((t) => t.value === v)?.label ?? v}
            onChange={setFenceType} />
        ), true)}
        {field('Fence Name', <Input value={name} placeholder="eg, Downtown Zone" onChange={setName} />, true)}
        {field('Fence Priority', <Input type="number" value={priority} placeholder="eg, 1" onChange={setPriority} />)}
        {field('Fence Color', (
          <div className="flex h-8 items-center gap-1.5">
            {FENCE_COLORS.map((c) => (
              <button key={c} type="button" onClick={() => setColor(c)}
                className={`h-6 w-6 rounded-md border-2 transition-transform ${color === c ? 'scale-110 border-ink' : 'border-transparent hover:scale-105'}`}
                style={{ background: c }} aria-label={c} />
            ))}
          </div>
        ))}
        {field('Labels', (
          <div>
            <Input value={labelDraft} placeholder="Type a label and press Enter" onChange={(v) => {
              if (v.endsWith(',')) addLabel(v)
              else setLabelDraft(v)
            }} onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); addLabel(labelDraft) }
            }} />
            {(labels.length > 0 || labelSuggestions.length > 0) && (
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                {labels.map((l) => (
                  <span key={l} className="inline-flex items-center gap-1 rounded-full bg-warm-100 px-2.5 py-0.5 text-[12px] font-bold text-ink-2">
                    {l}
                    <button type="button" onClick={() => setLabels(labels.filter((x) => x !== l))}
                      className="text-ink-3 hover:text-ink"><X size={11} /></button>
                  </span>
                ))}
                {labelSuggestions.slice(0, 4).map((l) => (
                  <button key={l} type="button" onClick={() => setLabels([...labels, l])}
                    className="rounded-full border border-line px-2 py-0.5 text-[11.5px] text-ink-3 hover:border-brand-500 hover:text-brand-500">
                    + {l}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
        {field('Start Location', (
          <LocationField lat={startLat} lng={startLng}
            defaultQuery={String(branch.addressLine1 ?? '')}
            onPick={(la, ln) => setStartLoc(`${la},${ln}`)} />
        ))}
        {field('Enabled', (
          <div className="flex h-8 items-center">
            <Toggle checked={enabled} onChange={setEnabled} />
          </div>
        ))}
      </div>

      {/* ------------- Stops Details */}
      <p className="mt-6 border-t border-line pt-4 text-[13px] font-bold text-ink">Stops Details</p>
      <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
        {field('No. of Stops per Hour', (
          <Input type="number" value={stopsPerHour} placeholder="eg, 4" onChange={setStopsPerHour} />
        ))}
        {field('Minimum Stop Limit for Clustering', (
          <Input type="number" value={minStops} placeholder="Enter minimum stop limit" onChange={setMinStops} />
        ))}
        {field('Stop Threshold Parameter', (
          <MenuSelect value={thresholdParam} placeholder="Select"
            options={THRESHOLD_PARAMS.map((t) => t.value)}
            labels={(v) => THRESHOLD_PARAMS.find((t) => t.value === v)?.label ?? v}
            onChange={(v) => { setThresholdParam(v); setThresholdValue('') }} />
        ))}
        {thresholdParam && field(
          thresholdParam === 'weight' ? 'Weight Threshold'
            : thresholdParam === 'pallets' ? 'Pallets Threshold'
            : thresholdParam === 'tag' ? 'Tag' : 'Tag Regex',
          <Input
            type={thresholdParam === 'weight' || thresholdParam === 'pallets' ? 'number' : 'text'}
            value={thresholdValue} placeholder="Enter value" onChange={setThresholdValue} />,
        )}
      </div>

      <div className="mt-5 flex items-center justify-between gap-3 border-t border-line pt-3">
        <p className="text-[12.5px] text-ink-3">
          {points.length} point{points.length === 1 ? '' : 's'} drawn
          {points.length >= 3 ? ` — ${fmtArea(areaKm2(points))}` : points.length > 0 ? ` — add ${3 - points.length} more` : ''}
          {zips.length ? ` — zip ${zips.join(', ')}` : ''}
        </p>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => onDone(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving ? 'Saving…' : fence ? 'Save Changes' : 'Add Geofence'}</Button>
        </div>
      </div>
    </div>
  )
}

/* ---------------------------------------------- Define-Area location search ----
 * Staging's step-1 "Add Location" panel, in our chrome: search by Zip Code
 * (country + postal-code suggestions → boundary loaded as the fence area) or
 * by Address (geoCoding_v2 → recenter the map). Same APIs staging calls. */

function LocationSearch({ onBoundary, onCenter }: {
  onBoundary: (ring: Ring, zip: string, city: string) => void
  onCenter: (lat: number, lng: number) => void
}) {
  const [by, setBy] = useState<'zip' | 'address'>('zip')
  const [countries, setCountries] = useState<{ value: string; label: string }[]>([])
  const [country, setCountry] = useState('US')
  const [q, setQ] = useState('')
  const [sugs, setSugs] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)
  const pickedRef = useRef('')  // suppresses the suggestion refetch after a pick

  useEffect(() => { fetchCountries().then(setCountries).catch(() => {}) }, [])

  // debounced zip suggestions while typing
  useEffect(() => {
    if (by !== 'zip' || q.trim().length < 2 || q === pickedRef.current) { setSugs([]); return }
    const t = setTimeout(() => {
      fetchZipSuggestions(country, q.trim()).then((s) => setSugs(s.slice(0, 8))).catch(() => setSugs([]))
    }, 250)
    return () => clearTimeout(t)
  }, [q, country, by])

  // close the suggestion list on outside click
  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setSugs([])
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  const pickZip = async (zip: string) => {
    pickedRef.current = zip
    setSugs([])
    setQ(zip)
    setBusy(true)
    try {
      const b = await fetchZipBoundary(zip, country)
      if (!b) { toast.error(`No boundary found for ${zip}.`); return }
      onBoundary(b.ring, zip, b.city)
      toast.success(`Loaded the ${zip} boundary${b.city ? ` (${b.city})` : ''} — adjust or save as is.`)
    } finally { setBusy(false) }
  }

  const searchAddress = async () => {
    const query = q.trim()
    if (!query) return
    setBusy(true)
    try {
      const hit = await geocodeAddress(query)
      if (!hit) { toast.error('No location found for that address.'); return }
      onCenter(hit.lat, hit.lng)
    } finally { setBusy(false) }
  }

  const byBtn = (v: 'zip' | 'address', label: string) => (
    <button type="button" onClick={() => { setBy(v); setQ(''); setSugs([]) }}
      className={`h-8 rounded-md border px-3 text-[12.5px] font-bold transition-colors
        ${by === v ? 'border-brand-500 bg-brand-50/60 text-brand-500' : 'border-line bg-surface text-ink-2 hover:text-ink'}`}>
      {label}
    </button>
  )

  return (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <span className="text-[12.5px] text-ink-3">Search by</span>
      {byBtn('zip', 'Zip Code')}
      {byBtn('address', 'Address')}
      {by === 'zip' && (
        <div className="w-44">
          <MenuSelect value={country} options={countries.map((c) => c.value)}
            labels={(v) => countries.find((c) => c.value === v)?.label ?? v}
            onChange={setCountry} searchable placeholder="Country" />
        </div>
      )}
      <div ref={boxRef} className="relative w-56">
        <Input value={q} placeholder={by === 'zip' ? 'Type a zip code' : 'Search an address'} onChange={setQ} />
        {by === 'zip' && sugs.length > 0 && (
          <div className="absolute left-0 top-9 z-[1100] w-full overflow-hidden rounded-md border border-line bg-surface shadow-ds-overlay">
            {sugs.map((s) => (
              <button key={s} type="button" onClick={() => pickZip(s)}
                className="block w-full px-3 py-1.5 text-left text-[13px] text-ink hover:bg-warm-50">
                {s}
              </button>
            ))}
          </div>
        )}
      </div>
      {by === 'address' && (
        <Button variant="outline" icon={<Search size={13} />} onClick={searchAddress} disabled={busy}>
          {busy ? 'Searching…' : 'Search'}
        </Button>
      )}
      {by === 'zip' && busy && <span className="text-[12.5px] text-ink-3">Loading boundary…</span>}
    </div>
  )
}
