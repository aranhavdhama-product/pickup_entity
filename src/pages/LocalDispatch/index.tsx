/**
 * Dispatch Planning (LOCAL mockup) — `/local/dispatch-planning`.
 *
 * Production splits a dispatcher's morning over two screens: Dispatch Planning
 * (waves, Dock / Driver / Helper / Asset per route, a Resources rail) and
 * Route & Dispatch (cost, SPR, distance, time, utilisation, the map, each
 * route's consignments). This page is the ONE screen for the job — give every
 * route of a wave its crew, then assign — in our shell:
 *
 *   filter line (date · hub · search · download)
 *   wave strip  (one card per departure wave, assigned x/y, alerts)
 *   wave panel  (KPI line · map of the wave · Pending | Assigned routes; each
 *                route = metrics line + its four slots, expands to its stops)
 *   Resources   (Drivers · Helpers · Vehicles · Docks; drag onto a route)
 *
 * Every assignment passes `canAssign` (off today, still on a trip, wrong or too
 * small a vehicle, dock busy in the wave) and says why when it refuses. Data =
 * `dispatchModel.ts` (a deterministic fixture); assignments are page state.
 */
import { useEffect, useRef, useState, type DragEvent, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import {
  AlertTriangle, ArrowRight, Banknote, Box, Check, PackageX, PieChart, UserCheck, UserX, CheckCircle2, ChevronRight, ChevronsLeft, ChevronsRight, CircleCheck, CircleDashed, Clock, Download, Gauge, Layers, Lock, MapPin, Package, Route as RouteIcon, Scale, Truck, UserRound,
  Users, Warehouse, X,
} from 'lucide-react'
import { Button, Checkbox, DateInput, EmptyState, KebabMenu, MenuSelect, StatusPill, Tabs, Tooltip } from '../../nueva/components'
import { toast } from '../../nueva/toast'
import { Chip, FilterLine, FilterSelect, IconBtn, LocalPage, SearchBox } from '../../local/chrome'
import { downloadCsv } from '../LocalPFP/adapter'
import WaveMap from './WaveMap'
import {
  CREW_STATUS_LABEL, HUB, HUBS, RESOURCES, ROUTES, SEED_ASSIGNMENTS, SEED_COMMITTED, SLOT_KINDS, SLOT_LABEL, WAVES,
  canAssign, dispatchCsv, fmtInr, fmtKm, isReady, missingSlots, resourceById, routeColourToken,
  fmtHhMm, toMin, totalsOf, usedOn, utilisationOf,
  type Assignment, type CrewStatus, type Stop, type UtilDim, type DispatchRoute, type Resource, type ResourceKind, type Wave,
} from './dispatchModel'

const isoToday = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const STATUS_TONE: Record<CrewStatus, 'success' | 'info' | 'neutral'> = { available: 'success', 'on-trip': 'info', off: 'neutral' }
const RES_TABS: { kind: ResourceKind; label: string }[] = [
  { kind: 'driver', label: 'Drivers' }, { kind: 'helper', label: 'Helpers' }, { kind: 'vehicle', label: 'Vehicles' }, { kind: 'dock', label: 'Docks' },
]
const DRAG_TYPE = 'application/x-fe-resource'
/* the route table's columns: select · route · dock · driver · helper · vehicle · actions */
const ROW_GRID = 'grid grid-cols-[48px_minmax(430px,2.4fr)_minmax(84px,0.6fr)_minmax(116px,1fr)_minmax(116px,1fr)_minmax(136px,1.1fr)_32px] items-center gap-x-2 px-3'
const NO_ROUTES: DispatchRoute[] = []

/* ===================================================================== page */

export default function LocalDispatchPlanning() {
  const nav = useNavigate()
  const today = isoToday()
  const [date, setDate] = useState(today)
  const [hub, setHub] = useState(HUB.code)
  const [q, setQ] = useState('')
  const [waveN, setWaveN] = useState<number | null>(null)
  const [tab, setTab] = useState<0 | 1 | null>(0)        // 0 Pending · 1 Assigned · null = no pill picked = every route
  const [asg, setAsg] = useState<Record<string, Assignment>>(SEED_ASSIGNMENTS)
  const [committed, setCommitted] = useState<Set<string>>(() => new Set(SEED_COMMITTED))
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [mapOpen, setMapOpen] = useState(false)            // the map opens on demand only
  const [wavesOpen, setWavesOpen] = useState(true)
  const [resOpen, setResOpen] = useState(true)
  const [dragKind, setDragKind] = useState<ResourceKind | null>(null)

  /* ---- what is on screen */
  const dayRoutes = hub === HUB.code && date === today ? ROUTES : NO_ROUTES
  const waves = WAVES.filter((w) => dayRoutes.some((r) => r.wave === w.n))
  const firstOpen = waves.find((w) => dayRoutes.some((r) => r.wave === w.n && !committed.has(r.id)))
  const wave = waves.find((w) => w.n === waveN) ?? firstOpen ?? waves[0] ?? null
  const waveNum = wave?.n ?? null
  const routesOn = dayRoutes === ROUTES
  const waveRoutes = (routesOn ? ROUTES : NO_ROUTES).filter((r) => r.wave === waveNum)
  const needle = q.trim().toLowerCase()
  const matches = (r: DispatchRoute) => !needle
    || r.name.toLowerCase().includes(needle)
    || r.stops.some((s) => s.consignment.toLowerCase().includes(needle) || s.customer.toLowerCase().includes(needle))
    || Object.values(asg[r.id] ?? {}).some((id) => {
      const res = resourceById(id)
      return !!res && (res.label.toLowerCase().includes(needle) || res.sub.toLowerCase().includes(needle))
    })
  const pending = waveRoutes.filter((r) => !committed.has(r.id))
  const assigned = waveRoutes.filter((r) => committed.has(r.id))
  const listed = (tab === null ? waveRoutes : tab === 0 ? pending : assigned).filter(matches)
  const selectable = listed.filter((r) => !committed.has(r.id))
  const selected = waveRoutes.find((r) => r.id === selectedId) ?? null
  const colourIndex = (id: string) => Math.max(0, waveRoutes.findIndex((r) => r.id === id))

  const pickWave = (w: Wave) => {
    setWaveN(w.n); setSelectedId(null); setChecked(new Set())
    /* a picked pill follows the wave (an all-assigned wave opens on Assigned); no pill stays no pill */
    setTab((cur) => (cur === null ? null : dayRoutes.some((r) => r.wave === w.n && !committed.has(r.id)) ? 0 : 1))
  }

  /* ---- assignment */
  const assignSlot = (route: DispatchRoute, kind: ResourceKind, resId: string) => {
    if (!resId) {
      setAsg((prev) => ({ ...prev, [route.id]: { ...prev[route.id], [kind]: undefined } }))
      return
    }
    const res = resourceById(resId)
    if (!res) return
    const verdict = canAssign(res, route, asg, committed)
    if (!verdict.ok) { toast.error(verdict.reason); return }
    setAsg((prev) => {
      const next = { ...prev }
      if (verdict.movedFrom) next[verdict.movedFrom.id] = { ...next[verdict.movedFrom.id], [kind]: undefined }
      next[route.id] = { ...next[route.id], [kind]: resId }
      return next
    })
    if (verdict.movedFrom) toast.info(`${res.label} moved from ${verdict.movedFrom.name} to ${route.name}.`)
  }

  const checkedPending = pending.filter((r) => checked.has(r.id))
  const targets = checkedPending.length ? checkedPending : pending
  const readyTargets = targets.filter((r) => isReady(r, asg[r.id] ?? {}))
  const commit = () => {
    if (!readyTargets.length) return
    const skipped = targets.filter((r) => !isReady(r, asg[r.id] ?? {}))
    setCommitted((prev) => new Set([...prev, ...readyTargets.map((r) => r.id)]))
    setChecked(new Set())
    toast.success(`${readyTargets.length} route${readyTargets.length === 1 ? '' : 's'} assigned — ${readyTargets.map((r) => r.name).join(', ')}. Drivers see the trip in the app.`)
    if (skipped.length) {
      toast.info(`Not assigned yet: ${skipped.map((r) => `${r.name} needs ${missingSlots(r, asg[r.id] ?? {}).map((k) => SLOT_LABEL[k].toLowerCase()).join(', ')}`).join(' · ')}`)
    }
  }
  const unassign = (r: DispatchRoute) => {
    setCommitted((prev) => { const n = new Set(prev); n.delete(r.id); return n })
    toast.info(`${r.name} is back in Pending — its crew stays filled in.`)
  }

  const toggle = (set: Set<string>, id: string) => { const n = new Set(set); if (n.has(id)) n.delete(id); else n.add(id); return n }
  const allChecked = selectable.length > 0 && selectable.every((r) => checked.has(r.id))

  /* ---- render */
  const nextOpen = wave ? waves.find((w) => w.n !== wave.n && dayRoutes.some((r) => r.wave === w.n && !committed.has(r.id))) : undefined
  const filterLine = (
    <FilterLine right={<>
      <SearchBox value={q} onChange={setQ} placeholder="Search routes & crew" />
      <IconBtn title="Download the day's routes (CSV)" onClick={() => downloadCsv(`dispatch-${hub}-${date}.csv`, dispatchCsv(dayRoutes, asg, committed))}>
        <Download size={16} />
      </IconBtn>
    </>}>
      <div className="w-[150px] shrink-0"><DateInput value={date} onChange={(v) => setDate(v || today)} clearable={false} /></div>
      <FilterSelect value={hub} placeholder="Hub" options={HUBS.map((h) => h.code)} width={240}
        labels={(c) => { const h = HUBS.find((x) => x.code === c); return h ? `${h.name} (${h.code})` : c }}
        onChange={(v) => { setHub(v); setWaveN(null); setSelectedId(null) }} />
      {wave && (
        <span className="flex shrink-0 items-center gap-1.5" role="tablist" aria-label="Route status">
          {([['Pending', pending.length, 0], ['Assigned', assigned.length, 1]] as const).map(([label, n, i]) => (
            <span key={label} title={tab === i ? 'Click again to show every route' : `Show ${label.toLowerCase()} routes only`}>
              <Chip count={n} active={tab === i} onClick={() => { setTab(tab === i ? null : i); setChecked(new Set()) }}>{label}</Chip>
            </span>
          ))}
          <span className="mx-1.5 h-6 w-px bg-line" />
          {pending.length > 0 && (
            <span className="whitespace-nowrap text-[14px] tabular-nums text-ink-3">
              <b className="text-ink">{readyTargets.length}</b> of {targets.length} {checkedPending.length ? 'selected ' : ''}ready
            </span>
          )}
          {pending.length > 0 || !nextOpen
            ? (
              <span className="[&_button]:text-[14px]" title={readyTargets.length ? undefined : pending.length ? 'Fill Dock, Driver, Vehicle (and Helper where a route needs one) first' : 'Every route of the day is assigned'}>
                <Button disabled={!readyTargets.length} onClick={commit}>
                  {readyTargets.length > 1 ? `Assign ${readyTargets.length} routes` : 'Assign'}
                </Button>
              </span>
            )
            : <span className="[&_button]:text-[14px]"><Button variant="outline" icon={<ArrowRight size={14} />} onClick={() => pickWave(nextOpen)}>Wave {nextOpen.n}</Button></span>}
        </span>
      )}
    </FilterLine>
  )

  if (!wave) {
    return (
      <LocalPage>
        {filterLine}
        <div className="rounded-md border border-line bg-surface">
          <EmptyState icon={<RouteIcon size={36} />} title="No routes to dispatch"
            hint={hub ? `Nothing is planned for ${hub} on ${date}. Plan routes in Same/Next Day Routing, then dispatch them here.` : 'Pick a hub to see its waves.'} />
          <div className="flex justify-center pb-10"><Button variant="outline" onClick={() => nav('/local/routing')}>Open Routing</Button></div>
        </div>
      </LocalPage>
    )
  }

  const t = totalsOf(waveRoutes, committed)
  const dayLabel = new Date(`${date}T00:00:00`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
  const fleetSize = RESOURCES.filter((x) => x.kind === 'vehicle' && x.status !== 'off').length

  return (
    <LocalPage>
      {filterLine}

      <KpiStrip label={`Wave ${wave.n} · ${wave.start} – ${wave.end}`} groups={[
        [
          ['Total Cost', fmtInr(t.cost, 2), <Banknote size={16} />],
          ['Assigned', pad2(t.assigned), <UserCheck size={16} />, 'success'],
          ['Un-Assigned', pad2(t.routes - t.assigned), <UserX size={18} />, t.routes - t.assigned ? 'warning' : undefined],
          ['Unplanned', pad2(wave.unplanned), <PackageX size={18} />, wave.unplanned ? 'warning' : undefined],
        ],
        [
          ['Vehicles', `${t.routes} / ${fleetSize}`, <Truck size={16} />],
          ['SPR', (t.stops / Math.max(1, t.routes)).toFixed(2), <MapPin size={16} />],
          ['Stops/Orders', `${t.stops}/${t.orders}`, <Package size={16} />],
          ['SPORH', (t.stops / Math.max(1, t.durationMin / 60)).toFixed(2), <Gauge size={16} />],
          ['Vehicle Utilised', `${t.util.toFixed(2)} %`, <PieChart size={16} />],
          ['Distance', fmtKm(t.distanceKm), <RouteIcon size={16} />],
          ['Time', fmtHhMm(t.durationMin), <Clock size={16} />],
        ],
      ]} />

      <div className="mt-3 grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-3 [&_svg]:shrink-0">
        <WaveRail waves={waves} routes={dayRoutes} committed={committed} active={wave.n} onPick={pickWave}
          open={wavesOpen} onToggle={() => setWavesOpen((o) => !o)} />

        {/* ------------------------------------------------------- wave panel */}
        <section className="min-w-0 overflow-hidden rounded-md border border-line bg-surface">


          {/* the route table scrolls sideways rather than squeezing its columns on a narrow screen */}
          <div className="overflow-x-auto">
          <div className="min-w-[1050px]">
          {/* one row per route: the route, its four slots, its actions — the header counts what is filled */}
          {listed.length > 0 && (
            <div className={`${ROW_GRID} min-h-10 border-b border-line bg-thead py-2 text-[14px] font-semibold leading-[22px] text-ink`}>
              {selectable.length > 0
                ? <span className="flex pl-7"><Checkbox checked={allChecked} indeterminate={!allChecked && selectable.some((r) => checked.has(r.id))}
                    onChange={() => setChecked(allChecked ? new Set() : new Set(selectable.map((r) => r.id)))} /></span>
                : <span />}
              <span>Route</span>
              {SLOT_KINDS.map((k) => {
                const need = listed.filter((r) => k !== 'helper' || r.needsHelper)
                const have = need.filter((r) => asg[r.id]?.[k]).length
                return (
                  <span key={k} className="flex items-center gap-1 whitespace-nowrap">
                    {SLOT_LABEL[k]}
                    <span className={`font-normal tabular-nums ${have < need.length ? 'text-warning-fg' : 'text-ink-3'}`}>
                      {need.length ? `${have}/${need.length}` : '—'}
                    </span>
                  </span>
                )
              })}
              <span />
            </div>
          )}

          {listed.map((r) => (
            <RouteRow key={r.id} route={r} day={dayLabel}
              assignment={asg[r.id] ?? {}} all={asg} committed={committed}
              isCommitted={committed.has(r.id)} checked={checked.has(r.id)} selected={selected?.id === r.id}
              expanded={expanded.has(r.id)} dragKind={dragKind}
              onCheck={() => setChecked((c) => toggle(c, r.id))}
              onSelect={() => setSelectedId(selected?.id === r.id ? null : r.id)}
              onExpand={() => setExpanded((e) => toggle(e, r.id))}
              onSlot={(kind, id) => assignSlot(r, kind, id)}
              onUnassign={() => unassign(r)}
              onClear={() => setAsg((prev) => ({ ...prev, [r.id]: {} }))}
              onShowMap={() => { setMapOpen(true); setSelectedId(r.id) }}
            />
          ))}

          </div>
          </div>

          {!listed.length && (
            <div className="flex flex-col items-center gap-1.5 px-4 py-12 text-center">
              {tab === 0 && !needle
                ? <><Check size={22} className="text-success-fg" /><p className="text-[14px] font-bold text-ink">Every route in Wave {wave.n} is assigned</p>
                    <p className="text-[14px] text-ink-3">Pick Assigned (or neither pill) to review the crews, or the next wave on the left.</p></>
                : <p className="text-[14px] text-ink-3">{needle ? `No route matches “${q}”.` : 'Nothing assigned in this wave yet.'}</p>}
            </div>
          )}
        </section>

        {mapOpen && (
          <MapDialog wave={wave} routes={waveRoutes} all={asg} committed={committed} colourIndex={colourIndex}
            selectedId={selected?.id ?? null} onSelect={(id) => setSelectedId(selected?.id === id ? null : id)} onClose={() => setMapOpen(false)} />
        )}

        {/* -------------------------------------------------------- resources */}
        <ResourcesPanel open={resOpen} onToggle={() => setResOpen((o) => !o)} all={asg} committed={committed} selected={selected && !committed.has(selected.id) ? selected : null}
          onDragKind={setDragKind} onQuickAssign={(res) => selected && assignSlot(selected, res.kind, res.id)}
          onOpenRoute={(r) => { pickWave(WAVES.find((w) => w.n === r.wave) ?? wave); setTab((cur) => (cur === null ? null : committed.has(r.id) ? 1 : 0)); setSelectedId(r.id) }} />
      </div>
    </LocalPage>
  )
}

/* =============================================================== map dialog */

/** The wave's routes on a map, as a popup over the planner — the list on the right picks a route. */
function MapDialog({ wave, routes, all, committed, colourIndex, selectedId, onSelect, onClose }: {
  wave: Wave; routes: DispatchRoute[]; all: Record<string, Assignment>; committed: Set<string>
  colourIndex: (id: string) => number; selectedId: string | null; onSelect: (id: string) => void; onClose: () => void
}) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])
  return (
    <div className="fe-nueva fixed inset-0 z-[70] flex items-center justify-center bg-warm-900/40 p-6" onClick={onClose}>
      <div role="dialog" aria-modal aria-label={`Wave ${wave.n} map`} onClick={(e) => e.stopPropagation()}
        className="flex h-[min(760px,88vh)] w-full max-w-6xl flex-col overflow-hidden rounded-xl bg-surface shadow-ds-overlay">
        <div className="flex items-center gap-3 border-b border-line px-5 py-3">
          <div className="min-w-0">
            <h3 className="flex items-center gap-1.5 text-[18px] font-bold tabular-nums text-ink">
              Wave {wave.n}<span className="font-normal text-ink-3">·</span>{wave.start}<ArrowRight size={15} className="text-ink-3" />{wave.end}
            </h3>
            <p className="text-[14px] text-ink-3">{routes.length} routes from {HUB.name} ({HUB.code}) · click a line or a route to focus it</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close map" className="ml-auto inline-flex h-8 w-8 items-center justify-center rounded-md text-ink-3 hover:bg-warm-100 hover:text-ink"><X size={18} /></button>
        </div>
        <div className="flex min-h-0 flex-1">
          <div className="min-w-0 flex-1">
            <WaveMap hub={HUB} routes={routes} colourIndex={colourIndex} selectedId={selectedId} onSelect={onSelect} />
          </div>
          <div className="w-[280px] shrink-0 overflow-y-auto border-l border-line">
            {routes.map((r) => {
              const a = all[r.id] ?? {}
              const on = r.id === selectedId
              const driver = resourceById(a.driver)
              return (
                <button key={r.id} type="button" onClick={() => onSelect(r.id)}
                  className={`block w-full border-b border-line px-4 py-3 text-left transition-colors ${on ? 'bg-warm-50' : 'hover:bg-warm-25'}`}
                  style={{ boxShadow: `inset 3px 0 0 var(${routeColourToken(colourIndex(r.id))})` }}>
                  <span className="flex items-center gap-1.5">
                    <span className={`text-[14px] ${on ? 'font-black' : 'font-bold'} text-ink`}>{r.name}</span>
                    <span className="rounded border border-line px-1.5 text-[14px] leading-[20px] text-ink-2">{r.vehicleType}</span>
                    <span className="ml-auto [&>span]:text-[14px]">{committed.has(r.id) ? <StatusPill label="Assigned" tone="success" /> : <StatusPill label="Pending" tone="warning" />}</span>
                  </span>
                  <span className="mt-1 block text-[14px] tabular-nums text-ink-2">{r.start}–{r.end} · {r.stops.length} stops · {fmtKm(r.distanceKm)}</span>
                  <span className="block text-[14px] text-ink-3">{driver ? `${driver.label} · ${driver.sub}` : 'No driver yet'}{a.dock ? ` · ${a.dock}` : ''}</span>
                  {r.alerts.length > 0 && <span className="mt-1 flex items-center gap-1 text-[14px] text-danger-fg"><AlertTriangle size={12} />{r.alerts.length} alert{r.alerts.length === 1 ? '' : 's'}</span>}
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

/* ================================================================ wave rail */

function WaveRail({ waves, routes, committed, active, onPick, open, onToggle }: {
  waves: Wave[]; routes: DispatchRoute[]; committed: Set<string>; active: number; onPick: (w: Wave) => void
  open: boolean; onToggle: () => void
}) {
  const now = new Date()
  const nowMin = now.getHours() * 60 + now.getMinutes()
  const stats = (w: Wave) => {
    const rs = routes.filter((r) => r.wave === w.n)
    const done = rs.filter((r) => committed.has(r.id)).length
    return { rs, done, complete: done === rs.length, alerts: rs.reduce((n, r) => n + r.alerts.length, 0) }
  }

  if (!open) {
    return (
      <aside className="sticky top-3 flex w-[52px] flex-col items-center gap-1.5 rounded-md border border-line bg-surface py-2">
        <button type="button" onClick={onToggle} title="Show waves" aria-label="Show waves"
          className="mb-1 inline-flex h-7 w-7 items-center justify-center rounded-md text-ink-2 hover:bg-warm-100"><ChevronsRight size={16} /></button>
        {waves.map((w) => {
          const { rs, done, complete } = stats(w)
          const on = w.n === active
          return (
            <button key={w.n} type="button" onClick={() => onPick(w)} title={`Wave ${w.n} · ${w.start} – ${w.end} · ${done}/${rs.length} assigned`}
              className={`flex w-10 flex-col items-center rounded-md border py-1 transition-colors ${on ? 'border-ink bg-warm-50' : 'border-transparent hover:bg-warm-50'}`}>
              <span className={`text-[14px] ${on ? 'font-black' : 'font-bold'} text-ink`}>W{w.n}</span>
              <span className={`text-[14px] tabular-nums ${complete ? 'text-success-fg' : 'text-ink-3'}`}>{complete ? <Check size={11} /> : `${done}/${rs.length}`}</span>
            </button>
          )
        })}
      </aside>
    )
  }

  return (
    <aside className="sticky top-3 flex max-h-[calc(100vh-96px)] w-[168px] flex-col overflow-hidden rounded-md border border-line bg-surface">
      <div className="flex items-start gap-1 border-b border-line px-3 py-2.5">
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-bold text-ink">Waves · {waves.length}</p>
          <p className="flex items-center gap-1 text-[14px] tabular-nums text-ink-3"><Clock size={11} />{waves[0]?.start} – {waves[waves.length - 1]?.end}</p>
        </div>
        <button type="button" onClick={onToggle} title="Hide waves" aria-label="Hide waves"
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-ink-2 hover:bg-warm-100"><ChevronsLeft size={16} /></button>
      </div>
      <div className="flex min-h-0 flex-col gap-1 overflow-y-auto p-1.5">
        {waves.map((w) => {
          const { rs, done, complete, alerts } = stats(w)
          const on = w.n === active
          const soon = !complete && toMin(w.start) - nowMin <= 30 && toMin(w.start) - nowMin >= 0
          return (
            <button key={w.n} type="button" onClick={() => onPick(w)}
              title={`${rs.length} routes · ${rs.reduce((n, r) => n + r.stops.length, 0)} stops · ${done}/${rs.length} assigned${alerts ? ` · ${alerts} alert${alerts === 1 ? '' : 's'}` : ''}`}
              className={`flex flex-col gap-1 rounded-md border px-2.5 py-1.5 text-left transition-colors
                ${on ? 'border-ink bg-warm-50' : 'border-line hover:border-warm-300 hover:bg-warm-50'}`}>
              <span className="flex items-center gap-1.5">
                <span className={`text-[14px] ${on ? 'font-black' : 'font-bold'} text-ink`}>Wave {w.n}</span>
                <span className="text-[14px] tabular-nums text-ink-3">{w.start}</span>
                <span className="ml-auto flex items-center">
                  {complete
                    ? <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-success-bg text-success-fg"><Check size={11} /></span>
                    : soon
                      ? <span className="inline-flex items-center text-warning-fg" title="Departs within 30 minutes"><Clock size={12} /></span>
                      : alerts > 0 && <span className="inline-flex items-center gap-0.5 text-[14px] text-danger-fg"><AlertTriangle size={12} />{alerts}</span>}
                </span>
              </span>
              <span className="flex items-center gap-2">
                <span className="h-1 flex-1 overflow-hidden rounded-full bg-warm-150">
                  <span className="block h-full rounded-full bg-st-success" style={{ width: `${(done / Math.max(1, rs.length)) * 100}%` }} />
                </span>
                <span className="text-[14px] tabular-nums text-ink-2"><b className="text-ink">{done}</b>/{rs.length}</span>
              </span>
            </button>
          )
        })}
      </div>
    </aside>
  )
}

/* ================================================================= kpi line */

type KpiTone = 'success' | 'warning' | undefined
const pad2 = (n: number) => String(n).padStart(2, '0')
const KPI_TIP: Record<string, string> = {
  'Total Cost': 'Estimated cost of every route in the wave', Assigned: 'Routes with their crew assigned',
  'Un-Assigned': 'Routes still waiting for crew', Unplanned: 'Orders the optimiser could not fit on a route',
  'Stops/Orders': 'Stops in the wave / orders they serve', Distance: 'Travel distance of every route, hub to hub',
  Time: 'Route duration, summed over the wave',
  SPR: 'Stops per route', SPORH: 'Stops per route-hour', Vehicles: 'Routes (vehicles used) / vehicles available at the hub',
  'Vehicle Utilised': 'Average utilisation of the routes — each route counts its fullest of weight, volume, pallets and time',
}

/** Production's Route & Dispatch KPI strip, for the selected wave — every KPI led by its own icon (the same icon the route
 *  row uses for that measure), label over value; a divider between the money / assignment group and the plan group. */
function KpiStrip({ label, groups }: { label: string; groups: [string, string, ReactNode, KpiTone?][][] }) {
  return (
    <div title={label} aria-label={`KPIs for ${label}`}
      className="flex items-stretch overflow-x-auto rounded-md border border-line bg-surface [&_svg]:shrink-0">
      {groups.map((items, gi) => (
        <div key={gi} className={`flex flex-auto items-stretch ${gi ? 'border-l-2 border-warm-150' : ''}`}>
          {items.map(([name, value, icon, tone]) => (
            <div key={name} title={KPI_TIP[name]}
              className="flex-auto whitespace-nowrap border-l border-line px-2 py-2 first:border-l-0">
              <span className="flex items-center gap-1 text-[14px] leading-[22px] text-ink-3">
                <span className={`inline-flex ${tone === 'warning' ? 'text-warning-fg' : tone === 'success' ? 'text-success-fg' : 'text-ink-2'}`}>{icon}</span>{name}
              </span>
              <span className={`block text-[16px] font-bold leading-[22px] tabular-nums ${tone === 'warning' ? 'text-warning-fg' : 'text-ink'}`}>{value}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

/* ================================================================ route row */

/** A 16px ring for a percentage — production's utilisation donut. Tokens only. */
function UtilRing({ pct }: { pct: number }) {
  const c = 2 * Math.PI * 6
  return (
    <svg width={16} height={16} viewBox="0 0 16 16" aria-hidden>
      <circle cx={8} cy={8} r={6} fill="none" stroke="var(--color-warm-200)" strokeWidth={2.5} />
      <circle cx={8} cy={8} r={6} fill="none" stroke={pct > 90 ? 'var(--color-st-danger)' : 'var(--color-st-info)'} strokeWidth={2.5}
        strokeDasharray={`${(Math.min(100, pct) / 100) * c} ${c}`} transform="rotate(-90 8 8)" strokeLinecap="round" />
    </svg>
  )
}

/** Production's route-card metrics, each value led by its icon and named by a tooltip —
 *  line 1 (beside the name) Route Duration; line 2 Stops | Orders | SPORH | Travel Distance | Cost | Utilisation. */
function RouteMetrics({ route: r, part }: { route: DispatchRoute; part: 'window' | 'figures' }) {
  const sporh = r.stops.length / Math.max(1, r.durationMin / 60)
  const cells: [ReactNode, string, string][] = [
    [<MapPin size={14} />, String(r.stops.length), 'Stops'],
    [<Package size={14} />, String(r.orders), 'Orders'],
    [<Gauge size={14} />, sporh.toFixed(2), 'SPORH · stops per route-hour'],
    [<RouteIcon size={14} />, fmtKm(r.distanceKm), 'Travel Distance'],
    [<Clock size={14} />, `${r.start} – ${r.end}`, `Route Duration · ${fmtHhMm(r.durationMin)}`],
    [<Banknote size={14} />, fmtInr(r.cost, 2), 'Cost (estimated)'],
  ]
  const line = (list: typeof cells) => (
    <span className="flex items-center whitespace-nowrap text-[14px] leading-[22px] tabular-nums text-ink-2">
      {list.map(([icon, value, tip], i) => (
        <span key={tip} className={i ? 'ml-2 border-l border-line pl-2' : ''}>
          <Tooltip text={tip} floating>
            <span tabIndex={0} className="inline-flex items-center gap-1 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40">
              <span className="inline-flex text-ink-3">{icon}</span>{value}
            </span>
          </Tooltip>
        </span>
      ))}
    </span>
  )
  /* the window rides on line 1 beside the name; line 2 carries everything else */
  if (part === 'window') return line([cells[4]])
  return (
    <span className="flex items-center whitespace-nowrap">
      {line([...cells.slice(0, 4), cells[5]])}
      <span className="ml-2 border-l border-line pl-2"><UtilButton route={r} /></span>
    </span>
  )
}

/** The utilisation ring + %: a click opens every utilisation type (weight · volume · pallets · duration). */
function UtilButton({ route: r }: { route: DispatchRoute }) {
  const u = utilisationOf(r)
  const ref = useRef<HTMLButtonElement>(null)
  const pop = useRef<HTMLDivElement>(null)
  const [at, setAt] = useState<{ left: number; top?: number; bottom?: number } | null>(null)
  useEffect(() => {
    if (!at) return
    const close = () => setAt(null)
    const down = (e: MouseEvent) => { if (!pop.current?.contains(e.target as Node) && !ref.current?.contains(e.target as Node)) close() }
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    window.addEventListener('mousedown', down)
    window.addEventListener('keydown', key)
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    return () => {
      window.removeEventListener('mousedown', down); window.removeEventListener('keydown', key)
      window.removeEventListener('scroll', close, true); window.removeEventListener('resize', close)
    }
  }, [at])
  const toggle = (e: ReactMouseEvent) => {
    e.stopPropagation()
    if (at) { setAt(null); return }
    const b = ref.current?.getBoundingClientRect()
    if (!b) return
    const left = Math.min(b.left, window.innerWidth - 320 - 8)
    setAt(window.innerHeight - b.bottom < 240 ? { left, bottom: window.innerHeight - b.top + 6 } : { left, top: b.bottom + 6 })
  }
  const tone = (p: number | null) => (p === null ? 'bg-warm-200' : p > 90 ? 'bg-st-danger' : p > 75 ? 'bg-st-warning' : 'bg-st-info')
  const icon: Record<UtilDim['key'], ReactNode> = {
    weight: <Scale size={16} />, volume: <Box size={16} />, pallets: <Layers size={16} />, time: <Clock size={16} />,
  }
  return (
    <>
      <Tooltip text={`Utilisation ${u.pct}% · ${u.binding.label} is the fullest — click for every type`} floating>
        <button ref={ref} type="button" onClick={toggle} aria-expanded={!!at} aria-haspopup="dialog"
          onMouseDown={(e) => e.preventDefault() /* no focus-scroll: the table must not jump sideways on click */}
          className={`inline-flex items-center gap-1 rounded px-1 -mx-1 hover:bg-warm-100 ${at ? 'bg-warm-100' : ''}`}>
          <span className="inline-flex"><UtilRing pct={u.pct} /></span>{u.pct}%
        </button>
      </Tooltip>
      {at && createPortal(
        <div ref={pop} role="dialog" aria-label={`${r.name} utilisation`} onClick={(e) => e.stopPropagation()}
          style={{ left: at.left, top: at.top, bottom: at.bottom }}
          className="fe-nueva fixed z-[95] w-[320px] rounded-md border border-line bg-surface p-4 text-[14px] leading-[22px] text-ink-2 shadow-ds-overlay">
          <p className="mb-2 flex items-center gap-2 font-semibold text-ink">
            {r.name} utilisation <span className="ml-auto font-normal text-ink-3">{r.vehicleType}</span>
          </p>
          <div className="flex flex-col gap-2.5">
            {u.dims.map((d) => (
              <div key={d.key}>
                <p className="flex items-center gap-2">
                  <span className="inline-flex text-ink-3">{icon[d.key]}</span>
                  <span className="text-ink">{d.label}</span>
                  {d.key === u.binding.key && <span className="rounded-full bg-warm-100 px-2 text-[14px] text-ink-2">fullest</span>}
                  <span className="ml-auto tabular-nums">{d.reading}</span>
                </p>
                <p className="mt-1 flex items-center gap-2 pl-6">
                  <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-warm-150">
                    <span className={`block h-full rounded-full ${tone(d.pct)}`} style={{ width: `${Math.min(100, d.pct ?? 0)}%` }} />
                  </span>
                  <span className="w-11 text-right font-semibold tabular-nums text-ink">{d.pct === null ? '—' : `${d.pct}%`}</span>
                </p>
              </div>
            ))}
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}

/** The route's consignment tags — production shows them on the route card; first one, then +n with the rest in a tooltip. */
function RouteTags({ tags }: { tags: string[] }) {
  if (!tags.length) return null
  const [first, ...rest] = tags
  return (
    <span className="inline-flex items-center gap-1">
      <span className="rounded-full bg-warm-100 px-2 text-[14px] leading-[22px] text-ink-2">{first}</span>
      {rest.length > 0 && (
        <Tooltip text={`Tags: ${tags.join(', ')}`} floating>
          <span tabIndex={0} className="rounded-full bg-warm-100 px-2 text-[14px] leading-[22px] text-ink-2">+{rest.length}</span>
        </Tooltip>
      )}
    </span>
  )
}

function RouteRow({
  route: r, day, assignment, all, committed, isCommitted, checked, selected, expanded, dragKind,
  onCheck, onSelect, onExpand, onSlot, onUnassign, onClear, onShowMap,
}: {
  route: DispatchRoute; day: string; assignment: Assignment; all: Record<string, Assignment>; committed: Set<string>
  isCommitted: boolean; checked: boolean; selected: boolean; expanded: boolean; dragKind: ResourceKind | null
  onCheck: () => void; onSelect: () => void; onExpand: () => void
  onSlot: (kind: ResourceKind, id: string) => void
  onUnassign: () => void; onClear: () => void; onShowMap: () => void
}) {
  const [over, setOver] = useState(false)
  const missing = missingSlots(r, assignment)
  const droppable = !isCommitted && dragKind !== null
  const state = isCommitted
    ? { icon: <CheckCircle2 size={16} />, tone: 'text-success-fg', tip: 'Assigned' }
    : missing.length
      ? { icon: <CircleDashed size={16} />, tone: 'text-warning-fg', tip: `Needs ${missing.map((k) => SLOT_LABEL[k].toLowerCase()).join(', ')}` }
      : { icon: <CircleCheck size={16} />, tone: 'text-info-fg', tip: 'Ready to assign' }

  const onDragOver = (e: DragEvent) => { if (!droppable) return; e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; setOver(true) }
  const onDrop = (e: DragEvent) => {
    setOver(false)
    if (!droppable) return
    e.preventDefault()
    const res = resourceById(e.dataTransfer.getData(DRAG_TYPE))
    if (res) onSlot(res.kind, res.id)
  }

  return (
    <div onDragOver={onDragOver} onDragLeave={() => setOver(false)} onDrop={onDrop}
      className={`border-b border-line transition-colors ${selected || over ? 'bg-warm-50' : 'bg-surface hover:bg-warm-25'}`}>
      <div onClick={onSelect} className={`${ROW_GRID} cursor-pointer py-2.5 text-[14px] leading-[22px] text-ink-2`}>
        <span onClick={(e) => e.stopPropagation()} className="flex items-center gap-1">
          <Tooltip text={expanded ? 'Hide consignments' : 'Show consignments'} floating>
            <button type="button" onClick={onExpand} aria-expanded={expanded} aria-label={expanded ? 'Hide consignments' : 'Show consignments'}
              className="inline-flex h-6 w-6 items-center justify-center rounded-md text-ink-2 hover:bg-warm-100">
              <ChevronRight size={16} className={`transition-transform ${expanded ? 'rotate-90' : ''}`} />
            </button>
          </Tooltip>
          {isCommitted ? <Tooltip text="Assigned — unassign from ⋮ to change" floating><span className="inline-flex text-ink-3"><Lock size={16} /></span></Tooltip> : <Checkbox checked={checked} onChange={onCheck} />}
        </span>

        {/* the route: name, vehicle type, state · its time and size */}
        <span className="flex min-w-0">
          <span className="min-w-0">
            <span className="flex items-center gap-1.5 whitespace-nowrap">
              <span className="text-[14px] font-bold text-ink">{r.name}</span>
              <span className="rounded border border-line px-1.5 text-[14px] leading-[20px] text-ink-2">{r.vehicleType}</span>
              <Tooltip text={state.tip} floating><span tabIndex={0} className={`inline-flex ${state.tone}`}>{state.icon}</span></Tooltip>
              {r.alerts.length > 0 && (
                <Tooltip text={r.alerts.join(' · ')} floating>
                  <span tabIndex={0} className="inline-flex items-center gap-0.5 text-[14px] font-bold text-danger-fg"><AlertTriangle size={14} />{r.alerts.length}</span>
                </Tooltip>
              )}
              <RouteTags tags={r.tags} />
              <span className="ml-1 border-l border-line pl-2"><RouteMetrics route={r} part="window" /></span>
            </span>
            <RouteMetrics route={r} part="figures" />
          </span>
        </span>

        {SLOT_KINDS.map((kind) => (
          <span key={kind} className="min-w-0" onClick={(e) => e.stopPropagation()}>
            <Slot kind={kind} route={r} value={assignment[kind]} all={all} committed={committed} readOnly={isCommitted}
              highlight={droppable && dragKind === kind} required={kind !== 'helper' || r.needsHelper}
              onChange={(id) => onSlot(kind, id)} />
          </span>
        ))}

        <span className="flex items-center justify-end" onClick={(e) => e.stopPropagation()}>
          <KebabMenu items={[
            { label: 'Show on map', onClick: onShowMap },
            isCommitted
              ? { label: 'Unassign', tone: 'danger', onClick: onUnassign }
              : { label: 'Clear crew', onClick: onClear, disabled: !Object.values(assignment).some(Boolean), reason: 'Nothing filled in yet' },
          ]} />
        </span>
      </div>

      {expanded && (
        <>
          <p className="mx-4 mb-2 text-[14px] leading-[22px] text-ink-3">
            {fmtInr(r.cost / Math.max(1, r.stops.length))} per stop{r.needsHelper && <span className="text-warning-fg"> · helper required (two-person drop)</span>}
          </p>
          <StopList route={r} dock={assignment.dock} day={day} />
        </>
      )}
    </div>
  )
}

const SLOT_ICON: Record<ResourceKind, ReactNode> = {
  dock: <Warehouse size={13} />, driver: <UserRound size={13} />, helper: <Users size={13} />, vehicle: <Truck size={13} />,
}

function Slot({ kind, route, value, all, committed, readOnly, highlight, required, onChange }: {
  kind: ResourceKind; route: DispatchRoute; value: string | undefined; all: Record<string, Assignment>; committed: Set<string>
  readOnly: boolean; highlight: boolean; required: boolean; onChange: (id: string) => void
}) {
  const res = resourceById(value)
  const options = RESOURCES.filter((x) => x.kind === kind)
    .sort((a, b) => Number(!canAssign(a, route, all, committed).ok) - Number(!canAssign(b, route, all, committed).ok))
    .map((x) => x.id)
  const label = SLOT_LABEL[kind]
  return (
    <div className="min-w-0">
      {readOnly
        ? (
          <div className="flex h-8 min-w-0 items-center gap-1.5 truncate px-1 text-[14px] text-ink-2" title={res ? `${label}: ${res.label} · ${res.sub}` : undefined}>
            {res ? <><span className="shrink-0 text-ink-3">{SLOT_ICON[kind]}</span><span className="truncate">{res.label}</span></> : <span className="text-ink-3">—</span>}
          </div>
        )
        : (
          <div className={`rounded-md [&>div>button]:gap-1 [&>div>button]:pl-2.5 [&>div>button]:pr-2 [&>div>button]:text-[14px] ${highlight ? 'outline-2 outline-offset-2 outline-dashed outline-brand-400' : ''}`}>
            <MenuSelect value={value ?? ''} placeholder={required ? 'Select' : 'Optional'} searchable={kind !== 'dock'} menuWidth={260}
              options={value ? ['', ...options] : options}
              labels={(id) => { if (!id) return `Clear ${label.toLowerCase()}`; const x = resourceById(id); return x ? `${x.label} ${x.sub}` : id }}
              renderValue={(id) => { const x = resourceById(id); return x ? <span title={`${x.label} · ${x.sub}`}>{x.label}</span> : id }}
              renderOption={(id) => {
                if (!id) return <span className="text-[14px] text-ink-3">Clear {label.toLowerCase()}</span>
                const x = resourceById(id)
                if (!x) return id
                const v = canAssign(x, route, all, committed)
                const on = usedOn(x.id, all).filter((o) => o.id !== route.id)
                return (
                  <span className={`block min-w-0 text-[14px] leading-[22px] ${v.ok ? '' : 'opacity-50'}`} title={v.ok ? undefined : v.reason}>
                    <span className="flex items-center gap-1.5">
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: `var(--color-st-${STATUS_TONE[x.status]})` }} />
                      <b className="truncate">{x.label}</b>
                      {on.length > 0 && <span className="ml-auto shrink-0 text-[14px] text-ink-3">on {on.map((o) => o.name).join(', ')}</span>}
                    </span>
                    <span className="block truncate pl-3 text-[14px] text-ink-3">{v.ok ? x.sub : v.reason}</span>
                  </span>
                )
              }}
              onChange={onChange} />
          </div>
        )}
    </div>
  )
}

/* ================================================================ stop list */

/** Production's Route & Dispatch consignment columns, in its order. # and Consignment Number stay pinned while the rest
 *  scroll sideways; the list opens on Route Start Time and closes on Route End Time, as production's does. */
const STOP_COLUMNS = [
  'Consignment Number', 'Tags', 'State', 'Planned ETA', 'Start Window', 'End Window', 'Travel Time | Distance', 'VAS',
  'Confirmed', 'Weight', 'Volume', 'SKUs', 'Service Time', 'Special Instructions', 'Distance from Hub', 'Customer Name',
  'Customer Contact Number', 'Address', 'Customer Pincode', 'Sort Code', 'Merchant', 'Geofence', 'Planned Start Time',
  'Planned End Time', 'Planned By',
] as const
type StopColumn = (typeof STOP_COLUMNS)[number]
const NUMERIC = new Set<StopColumn>(['Weight', 'Volume', 'SKUs', 'Service Time', 'Distance from Hub'])
const UNIT: Partial<Record<StopColumn, string>> = { Weight: 'kg', Volume: 'm³', 'Service Time': 'min' }
const LONG_TEXT = new Set<StopColumn>(['Special Instructions', 'Address'])

function StopList({ route: r, dock, day }: { route: DispatchRoute; dock: string | undefined; day: string }) {
  const stamp = (hm: string, late = false) => <span className={late ? 'text-danger-fg' : ''}><span className={late ? '' : 'text-ink'}>{hm}</span> {day}</span>
  const stacked = (hm: string, late = false) => (
    <span className={`block ${late ? 'text-danger-fg' : ''}`}><span className="block">{day}</span><span className="block">{hm}</span></span>
  )
  const text = (s: Stop, col: StopColumn): string => (col === 'Special Instructions' ? s.instructions : col === 'Address' ? s.address : '')
  const valueOf = (s: Stop, col: StopColumn): ReactNode => {
    switch (col) {
      case 'Consignment Number': return <span className="text-ink">{s.consignment}</span>
      case 'Tags': return s.tags.length ? <span className="flex gap-1">{s.tags.map((tag) => <span key={tag} className="rounded-full bg-warm-100 px-2">{tag}</span>)}</span> : '-'
      case 'State': return s.state.toUpperCase().replace(/ /g, '_')
      case 'Planned ETA': return stamp(s.eta, s.late)
      case 'Start Window': return stacked(s.windowStart)
      case 'End Window': return stacked(s.windowEnd, s.late)
      case 'Travel Time | Distance': return `${s.legMin.toFixed(2)} mins | ${s.legKm.toFixed(1)} km`
      case 'VAS': return s.vas
      case 'Confirmed': return s.confirmed ? 'Yes' : 'No'
      case 'Weight': return s.weightKg.toFixed(2)
      case 'Volume': return s.volumeM3.toFixed(2)
      case 'SKUs': return String(s.skus)
      case 'Service Time': return s.serviceMin.toFixed(2)
      case 'Special Instructions': return s.instructions
      case 'Distance from Hub': return `${s.fromHubKm.toFixed(1)} km`
      case 'Customer Name': return s.customer
      case 'Customer Contact Number': return s.contact
      case 'Address': return s.address
      case 'Customer Pincode': return s.pincode
      case 'Sort Code': return s.sortCode
      case 'Merchant': return s.merchant
      case 'Geofence': return s.geofence
      case 'Planned Start Time': return stamp(r.start)
      case 'Planned End Time': return stamp(r.end)
      case 'Planned By': return s.plannedBy
    }
  }
  const pinNo = 'sticky left-0 z-[1] w-[44px] min-w-[44px] bg-inherit'
  const pinId = 'sticky left-[44px] z-[1] bg-inherit shadow-[1px_0_0_var(--color-line)]'
  const bracket = (label: string, hm: string, rest: string) => (
    <tr className="bg-warm-25">
      <td colSpan={STOP_COLUMNS.length + 1} className="border-b border-line px-3 py-2">
        <span className="sticky left-3 inline-flex items-center gap-2 text-ink-2">
          <Warehouse size={16} className="text-ink-3" />{label} <b className="tabular-nums text-ink">{hm}</b><span className="text-ink-3">· {rest}</span>
        </span>
      </td>
    </tr>
  )
  return (
    <div className="mx-4 mb-3 overflow-hidden rounded-md border border-line bg-surface">
      {r.alerts.length > 0 && (
        <ul className="border-b border-line bg-danger-bg px-3 py-2 text-[14px] leading-[22px] text-danger-fg">
          {r.alerts.map((a) => <li key={a} className="flex items-start gap-1.5"><AlertTriangle size={14} className="mt-1 shrink-0" />{a}</li>)}
        </ul>
      )}
      <div className="overflow-x-auto">
        <table className="w-max min-w-full border-separate border-spacing-0 text-[14px] leading-[22px] text-ink-2">
          <thead>
            <tr className="bg-thead text-left">
              <th className={`${pinNo} border-b border-line px-3 py-2 font-semibold text-ink`}>#</th>
              {STOP_COLUMNS.map((h, i) => (
                <th key={h} className={`whitespace-nowrap border-b border-line px-3 py-2 font-semibold text-ink ${i === 0 ? pinId : ''} ${NUMERIC.has(h) ? 'text-right' : ''}`}>
                  {h}{UNIT[h] && <span className="font-normal text-ink-3"> ({UNIT[h]})</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {bracket('Route Start Time:', r.start, `${HUB.name} (${HUB.code})${dock ? ` · Dock ${dock}` : ''}`)}
            {r.stops.map((s) => (
              <tr key={s.seq} className="bg-surface align-top hover:bg-warm-25">
                <td className={`${pinNo} border-b border-line px-3 py-2 tabular-nums text-ink-3`}>{s.seq}</td>
                {STOP_COLUMNS.map((col, i) => (
                  <td key={col} title={LONG_TEXT.has(col) ? text(s, col) : undefined}
                    className={`border-b border-line px-3 py-2 tabular-nums ${i === 0 ? pinId : ''} ${NUMERIC.has(col) ? 'text-right' : ''} ${LONG_TEXT.has(col) ? 'max-w-[280px] truncate' : 'whitespace-nowrap'}`}>
                    {valueOf(s, col)}
                  </td>
                ))}
              </tr>
            ))}
            {bracket('Route End Time:', r.end, `back at ${HUB.code} · ${fmtKm(r.distanceKm)} in all`)}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/* =========================================================== resources panel */

function ResourcesPanel({ open, onToggle, all, committed, selected, onDragKind, onQuickAssign, onOpenRoute }: {
  open: boolean; onToggle: () => void
  all: Record<string, Assignment>; committed: Set<string>; selected: DispatchRoute | null
  onDragKind: (k: ResourceKind | null) => void
  onQuickAssign: (res: Resource) => void
  onOpenRoute: (r: DispatchRoute) => void
}) {
  const [kindIdx, setKindIdx] = useState(0)
  const [status, setStatus] = useState<CrewStatus | 'all'>('available')
  const [q, setQ] = useState('')
  const kind = RES_TABS[kindIdx].kind
  const ofKind = RESOURCES.filter((x) => x.kind === kind)
  const count = (s: CrewStatus) => ofKind.filter((x) => x.status === s).length
  const needle = q.trim().toLowerCase()
  const shown = ofKind
    .filter((x) => status === 'all' || x.status === status)
    .filter((x) => !needle || x.label.toLowerCase().includes(needle) || x.sub.toLowerCase().includes(needle))

  if (!open) {
    return (
      <aside className="sticky top-3 flex w-[52px] flex-col items-center gap-2 rounded-md border border-line bg-surface py-2">
        <button type="button" onClick={onToggle} title="Show resources" aria-label="Show resources"
          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-ink-2 hover:bg-warm-100"><ChevronsLeft size={16} /></button>
        {RES_TABS.map((x, i) => (
          <button key={x.kind} type="button" title={x.label} aria-label={x.label} onClick={() => { setKindIdx(i); onToggle() }}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-ink-2 hover:bg-warm-100">{SLOT_ICON[x.kind]}</button>
        ))}
      </aside>
    )
  }

  return (
    <aside className="sticky top-3 flex max-h-[calc(100vh-96px)] w-[272px] flex-col overflow-hidden rounded-md border border-line bg-surface">
      <div className="relative px-3 pb-1 pt-3">
        <button type="button" onClick={onToggle} title="Hide resources" aria-label="Hide resources"
          className="absolute right-2 top-2.5 inline-flex h-7 w-7 items-center justify-center rounded-md text-ink-2 hover:bg-warm-100"><ChevronsRight size={16} /></button>
        <p className="text-[15px] font-bold text-ink">Resources</p>
        <p className="text-[14px] text-ink-3">
          {selected ? <>Assign to <b className="text-ink-2">{selected.name}</b>, or drag onto any route</> : 'Drag onto a route to assign'}
        </p>
      </div>
      <div className="px-1 [&_button]:px-2 [&_button]:text-[14px]">
        <Tabs size="sm" tabs={RES_TABS.map((x) => x.label)} active={kindIdx} onChange={(i) => { setKindIdx(i); setQ('') }} />
      </div>
      <div className="flex flex-wrap gap-1 px-3 pt-2.5">
        {(['available', 'on-trip', 'off'] as const).map((s) => {
          const on = status === s
          return (
            <button key={s} type="button" onClick={() => setStatus(on ? 'all' : s)} title={on ? 'Show everyone' : undefined}
              className={`inline-flex h-7 items-center gap-1 rounded-full border px-1.5 text-[14px] transition-colors
                ${on ? 'border-ink bg-warm-50 font-bold text-ink' : 'border-line text-ink-2 hover:bg-warm-50'}`}>
              {CREW_STATUS_LABEL[s]} <span className="tabular-nums text-ink-3">{count(s)}</span>
            </button>
          )
        })}
      </div>
      <div className="px-3 py-2.5 [&_.pfp-search]:w-full [&_.pfp-search_input]:w-full"><SearchBox value={q} onChange={setQ} placeholder={`Search ${RES_TABS[kindIdx].label.toLowerCase()}`} /></div>
      <div className="min-h-0 flex-1 overflow-y-auto border-t border-line">
        {shown.map((x) => {
          const on = usedOn(x.id, all)
          const v = selected ? canAssign(x, selected, all, committed) : null
          const here = selected ? on.some((o) => o.id === selected.id) : false
          const draggable = x.status !== 'off'
          return (
            <div key={x.id} draggable={draggable}
              onDragStart={(e) => { e.dataTransfer.setData(DRAG_TYPE, x.id); e.dataTransfer.effectAllowed = 'copy'; onDragKind(x.kind) }}
              onDragEnd={() => onDragKind(null)}
              className={`group flex items-center gap-2.5 border-b border-line px-3 py-2 ${draggable ? 'cursor-grab hover:bg-warm-50 active:cursor-grabbing' : 'opacity-60'}`}>
              <Avatar res={x} />
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5">
                  <span className="truncate text-[14px] font-bold text-ink">{x.label}</span>
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full" title={CREW_STATUS_LABEL[x.status]} style={{ background: `var(--color-st-${STATUS_TONE[x.status]})` }} />
                </p>
                <p className="truncate text-[14px] text-ink-3">{x.sub}</p>
                <p className="truncate text-[14px] text-ink-2">
                  {x.status === 'off' ? 'Off today'
                    : x.status === 'on-trip' ? <>On a trip · back <b>{x.busyUntil}</b></>
                    : on.length
                      ? <>On {on.map((o, i) => (
                          <span key={o.id}>{i > 0 && ', '}
                            <button type="button" className="font-bold text-brand-500 hover:underline" onClick={() => onOpenRoute(o)}>{o.name}</button>
                          </span>))}</>
                      : x.shift ? <>Shift {x.shift}</> : 'Free all day'}
                </p>
              </div>
              {selected && !here && x.status !== 'off' && (
                <span className="opacity-0 transition-opacity group-hover:opacity-100 [&_button]:text-[14px]" title={v && !v.ok ? v.reason : undefined}>
                  <Button size="sm" variant="outline" disabled={!!v && !v.ok} onClick={() => onQuickAssign(x)}>Assign</Button>
                </span>
              )}
              {here && <span title={`On ${selected?.name}`} className="text-success-fg"><Check size={15} /></span>}
            </div>
          )
        })}
        {!shown.length && <p className="px-4 py-8 text-center text-[14px] text-ink-3">No {RES_TABS[kindIdx].label.toLowerCase()} {status === 'all' ? '' : CREW_STATUS_LABEL[status as CrewStatus].toLowerCase()}{needle ? ` matching “${q}”` : ''}.</p>}
      </div>
    </aside>
  )
}

function Avatar({ res }: { res: Resource }) {
  const icon = res.kind === 'vehicle' ? <Truck size={15} /> : res.kind === 'dock' ? <Warehouse size={15} /> : null
  const initials = res.sub.split(' ').map((w) => w[0]).slice(0, 2).join('')
  return (
    <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-warm-100 text-[14px] font-bold text-ink-2">
      {icon ?? initials}
    </span>
  )
}
