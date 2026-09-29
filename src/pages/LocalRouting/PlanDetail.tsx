/**
 * Route & Dispatch (LOCAL) — `/local/routing/:planId`.
 *
 * OWNER OVERRIDE (2026-09-25, see index.tsx): replica of staging's
 * `/v2/post_route/99999/529/{id}/{id}/1` — the KPI strip (Assigned · Un-Assigned | Vehicles ·
 * SPR · Stops/Orders · SPORH · Vehicle Utilised · Distance · Time), the map with the right rail
 * (Geo-fences · Add Vehicle · kebab, one card per route), and the bottom drawer (Unplanned ·
 * Managed · Outsourced · Search Order · Fetch New Orders · expand; per-route rows that expand
 * to staging's stop columns) with the footer's RFD. The map is a schematic (no tiles, no
 * geocodes locally); pickup stops carry an extra Type cell. Page title: LocalHeader.
 */
import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ChevronDown, ChevronRight, Eye, FileText, Maximize2, MessageSquare, Minimize2, Package, PencilLine, Route as RouteIcon, Star,
} from 'lucide-react'
import { Button, MenuSelect, StatusPill } from '../../nueva/components'
import { LocalPage, SearchBox } from '../../local/chrome'
import { toast } from '../../nueva/toast'
import { useVehicleConfig } from '../../config/vehicleConfig'
import { useGrowOrders } from '../../growOrders/store'
import { displayStatus } from '../../growOrders/tabs'
import { usePlanning, type LocalTrip, type PlannedStop } from '../LocalPFP/planningStore'
import { downloadCsv, totalWeightKg } from '../LocalPFP/adapter'
import { AssignDriverModal } from '../LocalControlTower/tripBits'
import { RowMenu, ToolButton } from './stagingBits'
import { dispatchStatusOf, planCsv, routingPlanActions, tripsOfPlan, useRoutingPlans } from './routingPlans'

const ROUTE_COLOURS = ['var(--color-st-info)', 'var(--color-brand-500)', 'var(--color-st-success)', 'var(--color-st-warning)', 'var(--color-st-danger)']
const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7)

const STOP_COLS = ['Order No', 'Type', 'Tags', 'State', 'Planned ETA', 'Start Window', 'End Window', 'Travel Time | Distance', 'VAS',
  'Confirmed', 'Weight', 'Volume', 'SKUs', 'Service Time', 'Special Instructions', 'Distance from Hub', 'Customer Name',
  'Customer Contact Number', 'Address', 'Customer Pincode', 'Sort Code', 'Merchant', 'Geofence', 'Planned By']

function Kpi({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="min-w-[96px] flex-1 border-l border-line px-4 first:border-l-0">
      <p className="text-[12px] text-ink-3">{label}</p>
      <p className="text-[17px] font-bold text-ink tabular-nums">{value}</p>
    </div>
  )
}

export default function RoutingPlanDetail() {
  const { planId = '' } = useParams()
  const nav = useNavigate()
  const plans = useRoutingPlans()
  const { trips } = usePlanning()
  const db = useGrowOrders()
  const fleet = useVehicleConfig().vehicles
  const [drawer, setDrawer] = useState<'unplanned' | 'managed' | 'outsourced'>('managed')
  const [expanded, setExpanded] = useState(false)
  const [open, setOpen] = useState<Set<string>>(new Set())
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  const [q, setQ] = useState('')
  const [assigning, setAssigning] = useState<LocalTrip | null>(null)

  const plan = plans.find((p) => p.id === planId)
  const routes = useMemo(() => (plan ? tripsOfPlan(plan, trips) : []), [plan, trips])
  const orderOf = (s: PlannedStop) => (s.orderId ? db.orders.find((o) => o.id === s.orderId) : undefined)
  const prOf = (s: PlannedStop) => (s.prId ? db.pickupRequests.find((p) => p.id === s.prId) : undefined)
  const stopKg = (s: PlannedStop) => {
    const o = orderOf(s)
    if (o) return totalWeightKg(o)
    return (prOf(s)?.orderIds ?? []).reduce((n, id) => { const x = db.orders.find((y) => y.id === id); return n + (x ? totalWeightKg(x) : 0) }, 0)
  }
  const capOf = (t: LocalTrip) => fleet.find((v) => v.name === t.vehicle && v.hubCode === t.hubCode)
  const utilOf = (t: LocalTrip) => { const c = capOf(t)?.weightCapacityKg; return c ? (t.stops.reduce((n, s) => n + stopKg(s), 0) / c) * 100 : 0 }

  if (!plan) {
    return <LocalPage><p className="py-24 text-center text-[13px] text-ink-3">Routing plan {planId} not found — it may have been cleared by Reset demo data.</p></LocalPage>
  }

  const stops = routes.flatMap((t) => t.stops)
  const orders = stops.reduce((n, s) => n + (s.kind === 'pickup' ? (prOf(s)?.orderIds.length ?? 0) : 1), 0)
  const assigned = routes.filter((t) => t.driverName).length
  const hours = routes.reduce((n, t) => n + t.stops.length, 0)          // the ETA ladder: one stop an hour
  const util = routes.length ? routes.reduce((n, t) => n + utilOf(t), 0) / routes.length : 0
  const status = dispatchStatusOf(plan, trips)
  const canRfd = !plan.discarded && !plan.readyForDispatch && status === 'Un-Assigned' && routes.length > 0

  const cell = (s: PlannedStop, col: string): string => {
    const o = orderOf(s); const pr = prOf(s)
    const party = o ? o.receiver : db.stores.find((x) => x.code === pr?.storeCode)?.party
    switch (col) {
      case 'Order No': return s.orderNumber
      case 'Type': return s.kind === 'pickup' ? 'Pickup' : 'Delivery'
      case 'Tags': return o?.tags?.join(', ') || '-'
      case 'State': return o ? displayStatus(o) : pr?.status ?? '-'
      case 'Planned ETA': return `${s.eta} ${plan.dispatchDate}`
      case 'Start Window': return pr ? pr.startAt.replace('T', ' ') : '-'
      case 'End Window': return pr ? pr.endAt.replace('T', ' ') : '-'
      case 'Confirmed': return 'YES'
      case 'Weight': return String(Math.round(stopKg(s) * 10) / 10)
      case 'SKUs': return o ? String(o.pkg.items?.length ?? 0) : '-'
      case 'Service Time': return '12'
      case 'Special Instructions': return o?.remarks || '-'
      case 'Customer Name': return party?.name || '-'
      case 'Customer Contact Number': return party?.contactNumber || '-'
      case 'Address': return s.address || '-'
      case 'Customer Pincode': return party?.postalCode || '-'
      case 'Merchant': return (o?.storeCode ?? pr?.storeCode) || '-'
      case 'Geofence': return plan.hubCode
      case 'Planned By': return 'Routing'
      default: return '-'
    }
  }
  const needle = q.trim().toLowerCase()
  const visibleStops = (t: LocalTrip) => t.stops.filter((s) => !needle || s.orderNumber.toLowerCase().includes(needle))

  /* schematic map: hub in the middle, every stop placed from a hash of its postcode/address */
  const pt = (s: PlannedStop) => { const h = hash(`${s.address}${s.orderNumber}`); return { x: 8 + (h % 84), y: 10 + ((h >>> 8) % 80) } }

  return (
    <LocalPage>
      <div className="-mt-1 flex flex-col" style={{ minHeight: 'calc(100vh - 110px)' }}>
        {/* KPI strip */}
        <div className="flex items-center rounded-t-lg border border-line bg-surface py-2.5">
          <span className="px-4 text-ink-2"><RouteIcon size={18} /></span>
          <Kpi label="Assigned" value={String(assigned).padStart(2, '0')} />
          <Kpi label="Un-Assigned" value={String(routes.length - assigned).padStart(2, '0')} />
          <span className="border-l border-line px-4 text-ink-2"><FileText size={18} /></span>
          <Kpi label="Vehicles" value={`${routes.length} / ${plan.vehicleNames.length}`} />
          <Kpi label="SPR" value={routes.length ? (stops.length / routes.length).toFixed(2) : '0.00'} />
          <Kpi label="Stops/Orders" value={`${stops.length}/${orders}`} />
          <Kpi label="SPORH" value={hours ? (stops.length / hours).toFixed(2) : '0.00'} />
          <Kpi label="Vehicle Utilised" value={`${util.toFixed(2)} %`} />
          <Kpi label="Distance" value="—" />
          <Kpi label="Time" value={`${String(Math.max(0, ...routes.map((t) => t.stops.length))).padStart(2, '0')}h 00m`} />
        </div>

        {/* map + right rail */}
        {!expanded && (
          <div className="flex min-h-[340px] flex-1 border-x border-line">
            <div className="relative flex-1 overflow-hidden bg-warm-100">
              <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
                {[20, 40, 60, 80].map((g) => <g key={g}><line x1={g} y1={0} x2={g} y2={100} stroke="var(--color-warm-200)" strokeWidth={0.2} /><line x1={0} y1={g} x2={100} y2={g} stroke="var(--color-warm-200)" strokeWidth={0.2} /></g>)}
                {routes.filter((t) => !hidden.has(t.id)).map((t, i) => (
                  <polyline key={t.id} fill="none" stroke={ROUTE_COLOURS[i % ROUTE_COLOURS.length]} strokeWidth={0.5}
                    points={['50,50', ...t.stops.map((s) => { const p = pt(s); return `${p.x},${p.y}` }), '50,50'].join(' ')} />
                ))}
              </svg>
              <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-line bg-surface p-1.5 text-ink shadow-ds-1" title={plan.hubCode}><Package size={16} /></span>
              {routes.filter((t) => !hidden.has(t.id)).flatMap((t, i) => t.stops.map((s) => {
                const p = pt(s)
                return (
                  <span key={`${t.id}-${s.seq}`} title={`${s.orderNumber} · ${s.kind}`} style={{ left: `${p.x}%`, top: `${p.y}%`, background: ROUTE_COLOURS[i % ROUTE_COLOURS.length] }}
                    className={`absolute flex h-5 min-w-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center px-1 text-[11px] font-bold text-white ${s.kind === 'pickup' ? 'rounded-sm' : 'rounded-full'}`}>
                    {s.seq}
                  </span>
                )
              }))}
            </div>
            <aside className="w-[430px] shrink-0 border-l border-line bg-surface">
              <div className="flex items-center gap-2 border-b border-line p-2.5">
                <div className="w-[150px]"><MenuSelect value="" placeholder="Geo-fences" options={[plan.hubCode]} onChange={() => undefined} /></div>
                <span className="ml-auto" />
                <ToolButton tone="brand-outline" icon={<Package size={14} />} onClick={() => toast.info('Add Vehicle: add it in Vehicle Config, then Copy Route to re-run the plan.')}>Add Vehicle</ToolButton>
                <RowMenu items={[
                  { label: 'Download', onClick: () => downloadCsv(`routing-${plan.id}.csv`, planCsv(plan, trips)) },
                  { label: 'Discard', onClick: () => {
                    if (routingPlanActions.discard(plan.id, trips)) { toast.success(`Routing ${plan.id} discarded.`); nav('/local/routing') }
                    else toast.error('A route of this plan has started — it can no longer be discarded.')
                  } },
                ]} />
              </div>
              {routes.map((t, i) => (
                <div key={t.id} className="border-b border-line py-3 pl-4 pr-3" style={{ borderLeft: `3px solid ${ROUTE_COLOURS[i % ROUTE_COLOURS.length]}` }}>
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full" style={{ background: ROUTE_COLOURS[i % ROUTE_COLOURS.length] }} />
                    <span className="text-[15px] font-bold text-ink">{(t.vehicle ?? t.name).toUpperCase()} ({t.hubCode})</span>
                    <span className="ml-auto" />
                    <button type="button" aria-label="Toggle route" className="text-ink-2" onClick={() => setHidden((h) => { const n = new Set(h); if (n.has(t.id)) n.delete(t.id); else n.add(t.id); return n })}><Eye size={16} /></button>
                    <RowMenu items={[
                      { label: t.driverName ? 'Change assignee' : 'Assign driver', onClick: () => setAssigning(t) },
                      { label: 'Open in Control Tower', onClick: () => nav(`/local/control-tower/trips/${t.id}`) },
                    ]} />
                  </div>
                  <p className="mt-1.5 text-[13px] text-ink-2">
                    {t.stops.length} stops · {t.stops.filter((s) => s.kind === 'pickup').length} pickups · {capOf(t)?.shiftStart ?? '09:00'} – {capOf(t)?.shiftEnd ?? '—'} · {t.driverName ?? 'Un-assigned'}
                  </p>
                  <p className="mt-1.5 flex items-center gap-2 text-[13px] text-ink-2">
                    <StatusPill label={`${utilOf(t).toFixed(1)}%`} tone="neutral" />
                    <Star size={15} className="text-warm-400" />
                    <span className="font-mono text-[12px]">{t.id}</span>
                  </p>
                </div>
              ))}
            </aside>
          </div>
        )}

        {/* bottom drawer */}
        <div className={`flex flex-col border border-line bg-surface ${expanded ? 'flex-1' : ''}`}>
          <div className="flex items-center gap-6 border-b border-line px-4">
            {([['unplanned', `Unplanned: ${plan.unplanned.length}`], ['managed', `Managed: ${stops.length} · ${orders}`], ['outsourced', 'Outsourced: 0']] as const).map(([k, label]) => (
              <button key={k} type="button" onClick={() => setDrawer(k)}
                className={`h-11 text-[14px] ${drawer === k ? 'border-b-2 border-brand-500 font-bold text-brand-500' : 'text-ink-2'}`}>{label}</button>
            ))}
            <span className="ml-auto" />
            <div className="w-[200px]"><SearchBox value={q} onChange={setQ} placeholder="Search Order" /></div>
            <ToolButton tone="brand-outline" icon={<Package size={14} />} onClick={() => toast.info('Fetch New Orders: use Copy Route on the list to route orders that arrived since.')}>Fetch New Orders</ToolButton>
            <ToolButton icon={expanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />} title={expanded ? 'Collapse' : 'Expand'} onClick={() => setExpanded((e) => !e)} />
          </div>
          <div className={`overflow-auto ${expanded ? 'flex-1' : 'max-h-[260px]'}`}>
            {drawer === 'managed' && routes.map((t) => (
              <div key={t.id} className="border-b border-line">
                <div className="flex h-11 items-center gap-3 px-4 text-[13px]">
                  <Eye size={15} className="text-ink-2" />
                  <button type="button" aria-label="Expand route" onClick={() => setOpen((o) => { const n = new Set(o); if (n.has(t.id)) n.delete(t.id); else n.add(t.id); return n })}>
                    {open.has(t.id) ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                  </button>
                  <span className="text-ink">{(t.vehicle ?? t.name).toUpperCase()} ({t.hubCode})</span>
                  <span className="ml-auto text-ink-2">{t.stops.length * 60} mins · {t.stops.length} stops · {Math.round(t.stops.reduce((n, s) => n + stopKg(s), 0))} kg</span>
                </div>
                {open.has(t.id) && (
                  <table className="border-collapse text-[13px]">
                    <thead><tr className="h-10 border-y border-line bg-warm-50 text-left">
                      <th className="w-10 px-3 font-bold text-ink">#</th>
                      {STOP_COLS.map((c) => <th key={c} className="whitespace-nowrap px-3 font-bold text-ink">{c}</th>)}
                    </tr></thead>
                    <tbody>
                      {visibleStops(t).map((s) => (
                        <tr key={`${s.kind}-${s.prId ?? s.orderId}`} className="h-10 border-b border-line hover:bg-warm-50">
                          <td className="px-3 text-ink-2">{s.seq}</td>
                          {STOP_COLS.map((c) => (
                            <td key={c} className="max-w-[260px] truncate whitespace-nowrap px-3 text-ink-2">
                              {c === 'Type' ? <StatusPill label={cell(s, c)} tone={s.kind === 'pickup' ? 'warning' : 'info'} /> : cell(s, c)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            ))}
            {drawer === 'unplanned' && (plan.unplanned.length ? (
              <table className="w-full border-collapse text-[13px]">
                <thead><tr className="h-10 border-b border-line bg-warm-50 text-left">{['Order No', 'Type', 'Reason'].map((c) => <th key={c} className="px-4 font-bold text-ink">{c}</th>)}</tr></thead>
                <tbody>{plan.unplanned.map((u) => (
                  <tr key={u.id} className="h-10 border-b border-line"><td className="px-4">{u.number}</td><td className="px-4">{u.kind === 'pickup' ? 'Pickup' : 'Delivery'}</td><td className="px-4">{u.reason}</td></tr>
                ))}</tbody>
              </table>
            ) : <p className="py-8 text-center text-[13px] text-ink-3">Every order was planned.</p>)}
            {drawer === 'outsourced' && <p className="py-8 text-center text-[13px] text-ink-3">No orders outsourced to a carrier.</p>}
          </div>
          <div className="flex items-center justify-end gap-2 border-t border-line px-4 py-2">
            <ToolButton icon={<MessageSquare size={15} />} title="Comments" onClick={() => toast.info('Comments are not part of the local demo.')} />
            <ToolButton icon={<PencilLine size={15} />} title="Edit routes" onClick={() => nav(`/local/control-tower/trips/${routes[0]?.id ?? ''}`)} />
            <Button disabled={!canRfd} onClick={() => { routingPlanActions.markReadyForDispatch(plan.id); toast.success(`Routing ${plan.id} is Ready for Dispatch.`) }}>RFD</Button>
          </div>
        </div>
      </div>

      {assigning && <AssignDriverModal trip={assigning} trips={trips} onClose={() => setAssigning(null)} />}
    </LocalPage>
  )
}
