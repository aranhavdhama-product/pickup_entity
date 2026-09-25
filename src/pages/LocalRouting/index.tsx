/**
 * Same/Next Day Routing (LOCAL) — `/local/routing`.
 *
 * OWNER OVERRIDE (2026-09-25): this page is an EXACT replica of staging's Same/Next Day
 * Routing (`/v2/view/99999/529`) — an explicit exception to CLAUDE.md's "staging
 * screenshots are functionality, never layout". Toolbar order and wording (date range ·
 * City · Hub · Fence · Dispatch Status · Type | Roster · rider · Route Settings · Vehicle
 * Config · Create New Routes), the Generated Routes / Discarded tabs with the two
 * counters, search · Show All · copy · download, the 200px-column table with its sticky
 * View + kebab column (Copy Route · Download · E-mail), and the 50 / Page · pager ·
 * Refresh footer follow the capture in
 * docs/superpowers/research/2026-09-25-staging-same-next-day-routing.md. Colours stay
 * design.md tokens. THE ONE ADDITION: "Plan for: First Mile · Last Mile · Both" in
 * Create New Routes while the pickup module is on (the Type filter then offers the three
 * Plan-for values — staging's own Type options were not captured).
 *
 * A row is a routing PLAN (routingPlans.ts); its routes are planningStore trips.
 */
import { useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Copy, Download, Mail, RefreshCw, SlidersHorizontal, Truck, User, UserRound } from 'lucide-react'
import { Checkbox, ConfirmDialog, PageSize, Pagination, StatusPill, Toggle } from '../../nueva/components'
import { DateRange, FilterLine, FilterMultiSelect, FilterSelect, LocalPage, SearchBox } from '../../local/chrome'
import { toast } from '../../nueva/toast'
import './routing.css'
import { usePickupModuleConfig } from '../../config/pickupModule'
import { cityOfHub, HUB_CITIES } from '../../config/vehicleConfig'
import { daysFromNow } from '../../growOrders/tabs'
import { usePlanning } from '../LocalPFP/planningStore'
import { downloadCsv } from '../LocalPFP/adapter'
import CreateRoutesDialog from './CreateRoutesDialog'
import RouteSettingsDialog from './RouteSettingsDialog'
import VehiclesByHubDialog from './VehiclesByHubDialog'
import { RowMenu, ToolButton } from './stagingBits'
import {
  DISPATCH_STATUSES, DISPATCH_TONE, PLAN_FOR, PLAN_FOR_LABEL, copyPlan, dispatchStatusOf, fmtRun, fmtStamp, inProgress,
  planCsv, routingPlanActions, tripsOfPlan, useRoutingPlans, type RoutingPlan,
} from './routingPlans'

const HUBS = Object.keys(HUB_CITIES)
const CITIES = [...new Set(Object.values(HUB_CITIES))]
const COL = 200     // every staging column is 200px wide

export default function LocalRouting() {
  const nav = useNavigate()
  const plans = useRoutingPlans()
  const { trips } = usePlanning()
  const pickupOn = usePickupModuleConfig().enabled

  const [tab, setTab] = useState<'generated' | 'discarded'>('generated')
  const [from, setFrom] = useState(() => daysFromNow(0))
  const [to, setTo] = useState(() => daysFromNow(1))
  const [city, setCity] = useState('')
  const [hub, setHub] = useState('')
  const [fence, setFence] = useState('')
  const [status, setStatus] = useState<string[]>([])
  const [type, setType] = useState<string[]>([])
  const [q, setQ] = useState('')
  const [showAll, setShowAll] = useState(false)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(50)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [modal, setModal] = useState<'create' | 'settings' | 'vehicles' | null>(null)
  const [copying, setCopying] = useState<RoutingPlan | null>(null)

  const hubOptions = city ? HUBS.filter((h) => cityOfHub(h) === city) : HUBS
  const typeOptions = pickupOn ? PLAN_FOR.map((p) => PLAN_FOR_LABEL[p]) : ['Manual']

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return plans.filter((p) => {
      if ((tab === 'discarded') !== p.discarded) return false
      if (!showAll && ((from && p.dispatchDate < from) || (to && p.dispatchDate > to))) return false
      if (city && cityOfHub(p.hubCode) !== city) return false
      if (hub && p.hubCode !== hub) return false
      if (fence && p.hubCode !== fence) return false
      if (status.length && !status.includes(dispatchStatusOf(p, trips))) return false
      if (pickupOn && type.length && !type.includes(PLAN_FOR_LABEL[p.planFor])) return false
      if (needle && !`${p.id} ${p.tripIds.join(' ')}`.toLowerCase().includes(needle)) return false
      return true
    })
  }, [plans, trips, tab, from, to, showAll, city, hub, fence, status, type, q, pickupOn])

  const generated = plans.filter((p) => !p.discarded)
  const running = generated.filter((p) => inProgress(dispatchStatusOf(p, trips))).length
  const totalRoutes = rows.reduce((n, p) => n + (p.discarded ? 0 : tripsOfPlan(p, trips).length), 0)
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize))
  const safePage = Math.min(page, totalPages)
  const paged = rows.slice((safePage - 1) * pageSize, safePage * pageSize)

  const download = (list: RoutingPlan[]) => list.forEach((p) => downloadCsv(`routing-${p.id}.csv`, planCsv(p, trips)))
  const selRows = rows.filter((p) => selected.has(p.id))
  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const allOn = paged.length > 0 && paged.every((p) => selected.has(p.id))

  const discardSelected = () => {
    const ok = selRows.filter((p) => routingPlanActions.discard(p.id, trips))
    if (ok.length) toast.success(`${ok.length} routing plan${ok.length === 1 ? '' : 's'} discarded — their stops are back in Pending for Planning.`)
    if (ok.length < selRows.length) toast.error(`${selRows.length - ok.length} not discarded — a route has already started.`)
    setSelected(new Set())
  }

  const cols: { label: string; render: (p: RoutingPlan) => ReactNode; center?: boolean }[] = [
    { label: 'Routing ID', render: (p) => p.id },
    { label: 'Dispatch Status', center: true, render: (p) => { const s = dispatchStatusOf(p, trips); return <StatusPill label={s} tone={DISPATCH_TONE[s]} /> } },
    { label: 'Created On', render: (p) => fmtStamp(p.createdAt) },
    { label: 'City > Branch', render: (p) => `${cityOfHub(p.hubCode)} > ${p.hubCode}` },
    { label: 'Fence', render: (p) => p.hubCode },
    { label: 'Unplanned', render: (p) => p.unplanned.length },
    { label: 'Assigned', render: (p) => { const t = tripsOfPlan(p, trips); return `${t.filter((x) => x.driverName).length}/${t.length}` } },
    { label: 'Completed In', render: (p) => fmtRun(p.runMs) },
    { label: 'Remark', render: (p) => p.remark },
    { label: 'Dispatch Date', render: (p) => p.dispatchDate },
  ]

  return (
    <LocalPage>
      <FilterLine right={<span className="lr-toolbar ml-auto flex items-center gap-2">
        <ToolButton icon={<UserRound size={15} />} onClick={() => toast.info('Roster opens the hub roster — not part of the local demo.')}>Roster</ToolButton>
        <ToolButton icon={<User size={15} />} title="Rider assignment" onClick={() => nav('/local/control-tower?tab=trips')} />
        <ToolButton icon={<SlidersHorizontal size={15} />} onClick={() => setModal('settings')}>Route Settings</ToolButton>
        <ToolButton icon={<Truck size={15} />} onClick={() => setModal('vehicles')}>Vehicle Config</ToolButton>
        <ToolButton tone="primary" onClick={() => setModal('create')}>Create New Routes</ToolButton>
      </span>}>
        <DateRange start={from} end={to} onStart={(v) => { setFrom(v); setPage(1) }} onEnd={(v) => { setTo(v); setPage(1) }} />
        <FilterSelect value={city} placeholder="City" options={CITIES} width={96} onChange={(v) => { setCity(v); setHub(''); setPage(1) }} />
        <FilterSelect value={hub} placeholder="Hub" options={hubOptions} width={96} onChange={(v) => { setHub(v); setPage(1) }} />
        <FilterSelect value={fence} placeholder="Fence" options={hubOptions} width={96} onChange={(v) => { setFence(v); setPage(1) }} />
        <FilterMultiSelect values={status} placeholder="Dispatch Status" options={DISPATCH_STATUSES} width={150} onChange={(v) => { setStatus(v); setPage(1) }} />
        <FilterMultiSelect values={type} placeholder="Type" options={typeOptions} width={96} onChange={(v) => { setType(v); setPage(1) }} />
      </FilterLine>

      <div className="flex min-h-0 flex-col rounded-lg border border-line bg-surface">
        {/* tabs + counters | search · Show All · copy · download */}
        <div className="flex items-center gap-4 border-b border-line pr-4">
          {(['generated', 'discarded'] as const).map((t) => (
            <button key={t} type="button" onClick={() => { setTab(t); setPage(1); setSelected(new Set()) }}
              className={`h-12 px-4 text-[14px] ${tab === t ? 'border-b-2 border-brand-500 font-bold text-ink' : 'text-ink-2 hover:text-ink'}`}>
              {t === 'generated' ? 'Generated Routes' : 'Discarded'}
            </button>
          ))}
          <span className="text-[12px] text-ink-2">Routes In Progress: {running}</span>
          <span className="text-[12px] text-ink-2">Total Routes: {totalRoutes}</span>
          <span className="ml-auto" />
          {selRows.length > 0 && (
            <span className="flex items-center gap-2 text-[13px] text-ink-2">
              {selRows.length} selected
              {tab === 'generated' && <ToolButton onClick={discardSelected}>Discard</ToolButton>}
            </span>
          )}
          <div className="w-[230px]"><SearchBox value={q} onChange={(v) => { setQ(v); setPage(1) }} placeholder="Search route id and request id" /></div>
          <label className="flex items-center gap-1.5 text-[13px] text-ink"><Toggle checked={showAll} onChange={setShowAll} />Show All</label>
          <ToolButton icon={<Copy size={14} />} title="Copy routing ids" onClick={() => {
            const ids = (selRows.length ? selRows : rows).map((p) => p.id).join(', ')
            void navigator.clipboard?.writeText(ids).catch(() => undefined)
            toast.success('Routing ids copied.')
          }} />
          <ToolButton icon={<Download size={14} />} title="Download" onClick={() => download(selRows.length ? selRows : rows)} />
        </div>

        {rows.length === 0 ? (
          <div className="flex h-[420px] flex-col items-center justify-center">
            <p className="text-[16px] font-bold text-ink">0 routes created</p>
            <p className="mt-1 text-[13px] text-ink-3">Routes ready for dispatch appears here</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="border-collapse text-[13px]" style={{ minWidth: '100%' }}>
              <thead>
                <tr className="h-[47px] border-b border-line text-left">
                  <th className="sticky left-0 z-10 w-8 bg-surface px-2">
                    <Checkbox checked={allOn} onChange={() => setSelected(allOn ? new Set() : new Set(paged.map((p) => p.id)))} />
                  </th>
                  {cols.map((c) => (
                    <th key={c.label} className={`px-2 font-bold text-ink ${c.center ? 'text-center' : ''}`} style={{ width: COL, minWidth: COL }}>{c.label}</th>
                  ))}
                  <th className="sticky right-0 bg-surface shadow-[-6px_0_8px_-6px_rgba(0,0,0,0.12)]" style={{ width: COL, minWidth: COL }} />
                </tr>
              </thead>
              <tbody>
                {paged.map((p) => (
                  <tr key={p.id} onClick={() => nav(`/local/routing/${p.id}`)} className="group h-[57px] cursor-pointer border-b border-line hover:bg-warm-50">
                    <td className="sticky left-0 bg-surface px-2 group-hover:bg-warm-50" onClick={(e) => e.stopPropagation()}>
                      <Checkbox checked={selected.has(p.id)} onChange={() => toggle(p.id)} />
                    </td>
                    {cols.map((c) => (
                      <td key={c.label} className={`px-2 text-ink-2 ${c.center ? 'text-center' : ''}`}>{c.render(p)}</td>
                    ))}
                    <td className="sticky right-0 bg-surface pr-3 text-right shadow-[-6px_0_8px_-6px_rgba(0,0,0,0.12)] group-hover:bg-warm-50" onClick={(e) => e.stopPropagation()}>
                      <span className="inline-flex items-center gap-4">
                        <button type="button" className="text-[13px] text-st-info hover:underline" onClick={() => nav(`/local/routing/${p.id}`)}>View</button>
                        <RowMenu items={[
                          { label: 'Copy Route', icon: <Copy size={14} />, onClick: () => setCopying(p) },
                          { label: 'Download', icon: <Download size={14} />, onClick: () => download([p]) },
                          { label: 'E-mail', icon: <Mail size={14} />, onClick: () => toast.info('E-mailing route sheets is not part of the local demo — use Download.') },
                        ]} />
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="mt-3 flex items-center gap-3">
        <PageSize value={pageSize} onChange={(n) => { setPageSize(n); setPage(1) }} />
        <div className="flex-1"><Pagination page={safePage} total={totalPages} onChange={setPage}
          range={`${rows.length ? (safePage - 1) * pageSize + 1 : 0}-${Math.min(safePage * pageSize, rows.length)} of ${rows.length}`} /></div>
        <ToolButton icon={<RefreshCw size={14} />} onClick={() => toast.success('Routes refreshed.')}>Refresh</ToolButton>
      </div>

      {modal === 'create' && (
        <CreateRoutesDialog initialHub={hub} onClose={() => setModal(null)} onDone={(p) => {
          setModal(null)
          toast.success(`Routing ${p.id}: ${p.tripIds.length} route${p.tripIds.length === 1 ? '' : 's'} created${p.unplanned.length ? `, ${p.unplanned.length} unplanned` : ''}.`)
          nav(`/local/routing/${p.id}`)
        }} />
      )}
      {modal === 'settings' && <RouteSettingsDialog initialHub={hub} onClose={() => setModal(null)} />}
      {modal === 'vehicles' && <VehiclesByHubDialog initialHub={hub} onClose={() => setModal(null)} />}
      <ConfirmDialog open={!!copying} title="Copy Route" tone="brand" confirmLabel="Copy"
        message="Please copy the route after the cut-off time to keep changes intact. If not, new orders may be impacted."
        onClose={() => setCopying(null)}
        onConfirm={() => {
          const p = copying
          setCopying(null)
          if (!p) return
          const next = copyPlan(p)
          if (next) { toast.success(`Routing ${p.id} copied to ${next.id}.`); nav(`/local/routing/${next.id}`) }
          else toast.error('Nothing left to route for that hub and window.')
        }} />
    </LocalPage>
  )
}
