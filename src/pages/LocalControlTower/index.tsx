/**
 * Control Tower → Trips (LOCAL).
 *
 * Staging's Control Tower Trips list is the FUNCTIONALITY reference (filters,
 * status chips with counts, Attention Required, per-trip progress / Debrief /
 * kebab, the stop timeline); the layout is this app's own list grammar —
 * PageHeader → Panel (tabs, filter row, chips) → DataTable. Trips come from
 * `LocalPFP/planningStore` (`LocalTrip`); a pickup request routed from PFP or
 * from the Pickup page's "Add to route" lands here as a pickup stop.
 *
 * Spec: docs/superpowers/specs/2026-09-23-first-mile-pickup-program-design.md §3.3.
 */
import { useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { AlertTriangle, ClipboardList, Route as RouteIcon } from 'lucide-react'
import {
  Button, DataTable, EmptyState, KebabMenu,
  PageSize, Pagination, Panel, StatusPill,
  type Column, type MenuItem,
} from '../../nueva/components'
import {
  Chip, ChipRow, ChipSpacer, ClearFilters, DateRange, FilterLine, FilterSelect, FunnelFilters, LocalPage, LocalTabs, SearchBox,
} from '../../local/chrome'
import { toast } from '../../nueva/toast'
import { useGrowOrders } from '../../growOrders/store'
import { daysFromNow } from '../../growOrders/tabs'
import { TRIP_STATUSES, planningActions, usePlanning, type LocalTrip, type LocalTripStatus } from '../LocalPFP/planningStore'
import { AssignDriverModal, StopTimeline } from './tripBits'
import {
  HUB_CODES, TRIP_TONE, TRIP_TYPES, carrierLabel, fmtDay, hubLabel, knownDrivers, progressPct, stopCounts, tripType,
} from './tripUtils'

const TOP_TABS = ['Consignment Order', 'Trips']
const TOP_ICONS = [ClipboardList, RouteIcon]
const DEFAULT_FROM = () => daysFromNow(-30)

export default function LocalControlTower() {
  const nav = useNavigate()
  const [, setParams] = useSearchParams()
  const plan = usePlanning()
  const db = useGrowOrders()

  const [from, setFrom] = useState(DEFAULT_FROM)
  const [to, setTo] = useState('')
  const [hub, setHub] = useState('')
  const [driver, setDriver] = useState('')
  const [more, setMore] = useState<Record<string, string[]>>({})
  const [q, setQ] = useState('')
  const [status, setStatus] = useState<LocalTripStatus | ''>('')
  const [attentionOnly, setAttentionOnly] = useState(false)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [assigning, setAssigning] = useState<LocalTrip | null>(null)

  /* `?tab=trips` is the only tab this page renders; Consignment Order is the consignments page */
  const onTopTab = (i: number) => {
    if (i === 0) nav('/local/consignments')
    else setParams({ tab: 'trips' }, { replace: true })
  }

  const trips = plan.trips
  const drivers = useMemo(() => knownDrivers(trips), [trips])
  const hubs = useMemo(() => [...new Set([...HUB_CODES, ...trips.map((t) => t.hubCode).filter(Boolean)])], [trips])
  const moreDefs = useMemo(() => [
    { key: 'Carrier', label: 'Carrier', options: [...new Set(trips.map(carrierLabel))].sort() },
    { key: 'Type', label: 'Type', options: TRIP_TYPES },
  ], [trips])

  /* everything but the status chips — the chips count within these filters */
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return trips.filter((t) => {
      if (from && t.date < from) return false
      if (to && t.date > to) return false
      if (hub && t.hubCode !== hub) return false
      if (driver && t.driverName !== driver) return false
      if (more.Carrier?.length && !more.Carrier.includes(carrierLabel(t))) return false
      if (more.Type?.length && !more.Type.includes(tripType(t))) return false
      if (needle) {
        const hay = `${t.id} ${t.name} ${t.driverName ?? ''} ${t.vehicle ?? ''} ${t.stops.map((s) => s.orderNumber).join(' ')}`.toLowerCase()
        if (!hay.includes(needle)) return false
      }
      return true
    })
  }, [trips, from, to, hub, driver, more, q])

  const counts = useMemo(() => {
    const c = Object.fromEntries(TRIP_STATUSES.map((s) => [s, 0])) as Record<LocalTripStatus, number>
    filtered.forEach((t) => { c[t.status]++ })
    return c
  }, [filtered])
  const attentionCount = filtered.filter((t) => t.attention).length

  const rows = useMemo(() => filtered
    .filter((t) => (!status || t.status === status) && (!attentionOnly || !!t.attention))
    .sort((a, b) => (a.date === b.date ? (a.id < b.id ? 1 : -1) : a.date < b.date ? 1 : -1)),
  [filtered, status, attentionOnly])

  const filtersOn = from !== DEFAULT_FROM() || !!to || !!hub || !!driver || !!q || Object.values(more).some((v) => v.length)
  const clearAll = () => { setFrom(DEFAULT_FROM()); setTo(''); setHub(''); setDriver(''); setQ(''); setMore({}); setPage(1) }

  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize))
  const safePage = Math.min(page, totalPages)
  const paged = rows.slice((safePage - 1) * pageSize, safePage * pageSize)

  /* ---------------------------------------------------------- actions ---- */

  const kebab = (t: LocalTrip): MenuItem[] => {
    const items: MenuItem[] = [{ label: 'View trip', onClick: () => nav(`/local/control-tower/trips/${t.id}`) }]
    if (t.status !== 'Completed') items.push({ label: t.driverName ? 'Change assignee' : 'Assign driver', onClick: () => setAssigning(t) })
    if (t.status === 'Yet to start') {
      items.push({ label: 'Start trip', onClick: () => {
        if (planningActions.startTrip(t.id)) toast.success(`${t.id} started — collections on it are Out For Pickup.`)
      } })
    }
    if (t.status === 'Un-assigned') items.push({ label: 'Start trip', onClick: () => toast.info('Assign a driver before starting the trip.') })
    if (t.status === 'In Transit' || t.status === 'Yet to debrief') {
      items.push({ label: 'End trip', onClick: () => { if (planningActions.endTrip(t.id)) toast.success(`${t.id} completed.`) } })
    }
    if (t.attention) items.push({ label: 'Clear attention', onClick: () => { planningActions.clearAttention(t.id); toast.success('Attention cleared.') } })
    if (t.status === 'Un-assigned' || t.status === 'Yet to start') {
      items.push({ label: 'Cancel trip', tone: 'danger', onClick: () => {
        if (planningActions.cancelTrip(t.id)) toast.success(`${t.id} cancelled — its collections are back to Requested.`)
      } })
    }
    return items
  }

  const columns: Column[] = [
    {
      key: 'name', label: 'Trip', width: 200,
      render: (r) => {
        const t = r as LocalTrip
        return (
          <span className="block min-w-0">
            <span className="block truncate font-bold text-ink">{t.name}</span>
            <Link to={`/local/control-tower/trips/${t.id}`} onClick={(e) => e.stopPropagation()}
              className="font-mono text-[12px] font-bold text-brand-500 hover:underline">{t.id}</Link>
            {t.vehicle && <span className="ml-1.5 text-[11.5px] text-ink-3">· {t.vehicle}</span>}
          </span>
        )
      },
    },
    { key: 'date', label: 'Date', width: 112, render: (r) => fmtDay((r as LocalTrip).date) },
    { key: 'hub', label: 'Hub', width: 150, render: (r) => <span className="block truncate">{hubLabel((r as LocalTrip).hubCode, db.stores)}</span> },
    {
      key: 'status', label: 'Status / Alerts', width: 170,
      render: (r) => {
        const t = r as LocalTrip
        return (
          <span className="flex flex-col items-start gap-1">
            <StatusPill label={t.status} tone={TRIP_TONE[t.status]} />
            {t.attention && (
              <span title={t.attention}><StatusPill label={`${t.attention.length > 26 ? `${t.attention.slice(0, 26)}…` : t.attention}`} tone="danger" /></span>
            )}
          </span>
        )
      },
    },
    {
      key: 'stops', label: 'Stops', width: 84, align: 'right',
      render: (r) => { const c = stopCounts(r as LocalTrip); return <span className="tabular-nums"><b className="text-ink">{c.closed}</b>/{c.total}</span> },
    },
    { key: 'timeline', label: 'Timeline', render: (r) => <StopTimeline trip={r as LocalTrip} /> },
    {
      key: 'actions', label: 'Actions', width: 190,
      render: (r) => {
        const t = r as LocalTrip
        const pct = progressPct(t)
        return (
          <span className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
            <span className="w-14 shrink-0">
              <span className="block text-[12px] font-bold text-ink tabular-nums">{pct}%</span>
              <span className="mt-0.5 block h-1 rounded-full bg-warm-100">
                <span className="block h-1 rounded-full bg-brand-500" style={{ width: `${pct}%` }} />
              </span>
            </span>
            {t.status === 'In Transit' && (
              <Button size="sm" variant="outline" onClick={() => {
                if (planningActions.debriefTrip(t.id)) toast.success(`${t.id} is back — Yet to debrief. Hub in-scans happen in Inbound.`)
              }}>Debrief</Button>
            )}
            <span className="ml-auto"><KebabMenu items={kebab(t)} /></span>
          </span>
        )
      },
    },
  ]

  return (
    <LocalPage>
      {/* the owner-finalised local chrome (spec §11): navigation tabs on the
          canvas, ONE filter line, the status chips as the chip row */}
      <LocalTabs
        tabs={TOP_TABS.map((t, i) => ({ id: String(i), label: t, icon: TOP_ICONS[i] }))}
        active="1" onChange={(id) => onTopTab(Number(id))} />

      <FilterLine
        right={<SearchBox value={q} onChange={(v) => { setQ(v); setPage(1) }} placeholder="Search trip, driver, PR" />}>
        <DateRange start={from} end={to} onStart={(v) => { setFrom(v); setPage(1) }} onEnd={(v) => { setTo(v); setPage(1) }} />
        <FilterSelect value={hub} placeholder="Hub" options={hubs} labels={(c) => hubLabel(c, db.stores)} width={170}
          onChange={(v) => { setHub(v); setPage(1) }} />
        <FilterSelect value={driver} placeholder="Driver" options={drivers} searchable width={160}
          onChange={(v) => { setDriver(v); setPage(1) }} />
        <FunnelFilters defs={moreDefs} values={more} onChange={(k, vals) => { setMore((m) => ({ ...m, [k]: vals })); setPage(1) }} />
        <ClearFilters active={filtersOn} onClick={clearAll} />
      </FilterLine>

      <ChipRow>
        <Chip count={filtered.length} active={!status && !attentionOnly}
          onClick={() => { setStatus(''); setAttentionOnly(false); setPage(1) }}>All</Chip>
        {TRIP_STATUSES.map((s) => (
          <Chip key={s} count={counts[s]} active={status === s}
            onClick={() => { setStatus(status === s ? '' : s); setPage(1) }}>{s}</Chip>
        ))}
        <ChipSpacer />
        <Chip count={attentionCount} active={attentionOnly} tone="danger"
          onClick={() => { setAttentionOnly((v) => !v); setPage(1) }}>Attention Required</Chip>
      </ChipRow>

      <div className="mt-4">
        {rows.length === 0 ? (
          <Panel>
            <EmptyState icon={<AlertTriangle size={28} />}
              title={filtersOn || status || attentionOnly ? 'No trips match these filters' : 'No trips yet'}
              hint={filtersOn || status || attentionOnly
                ? 'Clear the filters or pick another status chip.'
                : 'Plan pickups from Pending For Planning or use Add to route on a pickup request.'} />
          </Panel>
        ) : (
          <>
            <DataTable columns={columns} rows={paged} rowKey="id"
              onRowClick={(r) => nav(`/local/control-tower/trips/${(r as LocalTrip).id}`)} />
            <div className="flex items-center justify-between gap-3">
              <div className="flex-1">
                <Pagination page={safePage} total={totalPages} onChange={setPage}
                  range={`${(safePage - 1) * pageSize + 1}-${Math.min(safePage * pageSize, rows.length)} of ${rows.length}`} />
              </div>
              <div className="pt-3"><PageSize value={pageSize} onChange={(n) => { setPageSize(n); setPage(1) }} /></div>
            </div>
          </>
        )}
      </div>

      {assigning && (
        <AssignDriverModal trip={assigning} trips={trips} title={assigning.driverName ? 'Change assignee' : 'Assign driver'}
          onClose={() => setAssigning(null)} />
      )}
    </LocalPage>
  )
}
