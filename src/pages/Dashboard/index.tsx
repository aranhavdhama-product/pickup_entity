/**
 * Dashboard — replica of the staging OPS Dashboard: tab set comes from the
 * account's OPS_DASHBOARD module config (visibleTabs), and each tab loads from
 * its own ops-dashboard endpoint (see ./api.ts):
 *   Milestones   → POST /ops-dashboard (aggregations w/ counts) + /consignment-kpi
 *   Facility Mis → POST /ops-dashboard/list, grouped per facility
 *   Ageing       → POST /ops-dashboard/list, bucketed by age
 *   SLA          → POST /ops-dashboard/sla
 */
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Package, AlertTriangle, Clock, Calendar, ShieldX, MapPinOff, Crown,
  CalendarX2, Timer, Building2, CheckCircle2, XCircle, Percent, Boxes,
} from 'lucide-react'
import { LoadingBox, ErrorBox, Panel, StatusPill, Tabs } from '../../nueva/components'
import { fetchModuleSettings, parseSettingJson } from '../../nueva/settingsApi'
import { humanizeEnum } from '../ConsignmentOrder/api'
import { fetchKpis, fetchMilestones, fetchOpsList, fetchSla, type AggBucket } from './api'

/* tab keys → labels, exactly the staging OPS_DASHBOARD option set */
const TAB_LABELS: Record<string, string> = {
  consignmentDashboard: 'Milestones',
  consignmentFacilityMis: 'Facility Mis',
  consignmentAgeingDashboard: 'Ageing Dashboard',
  sla: 'SLA',
}
const DEFAULT_TABS = Object.keys(TAB_LABELS)

const STATE_TONE: Record<string, 'success' | 'info' | 'warning' | 'neutral'> = {
  CREATED: 'info', AT_FACILITY: 'info', PARTIAL_AT_FACILITY: 'info', PENDING: 'warning',
  DELIVERED: 'success', CANCELLED: 'neutral', EXCEPTION: 'warning',
}
const TONE_BAR: Record<string, string> = {
  success: 'bg-success-fg', info: 'bg-info-fg', warning: 'bg-warning-fg', neutral: 'bg-warm-400',
}

const RANGES = [{ label: 'Last 7 days', days: 7 }, { label: 'Last 30 days', days: 30 }, { label: 'Last 90 days', days: 90 }, { label: 'Last 180 days', days: 180 }]

function StatTile({ icon: Icon, label, value, tone = 'brand' }: {
  icon: any; label: string; value: number | string; tone?: 'brand' | 'warn' | 'ok'
}) {
  const tones = {
    brand: 'bg-brand-50 text-brand-500',
    warn: 'bg-warning-bg text-warning-fg',
    ok: 'bg-success-bg text-success-fg',
  }
  return (
    <div className="bg-surface border border-line rounded-xl shadow-ds-1 px-4 py-3.5 flex items-center gap-3 transition-all hover:border-warm-300 hover:shadow-ds-overlay">
      <span className={`h-10 w-10 shrink-0 rounded-lg inline-flex items-center justify-center ${tones[tone]}`}>
        <Icon size={19} />
      </span>
      <div className="min-w-0">
        <div className="text-[22px] font-black text-ink leading-none tabular-nums">{value}</div>
        <div className="text-[12px] text-ink-3 mt-1 truncate">{label}</div>
      </div>
    </div>
  )
}

function CountBars({ buckets, tones }: { buckets: AggBucket[]; tones?: boolean }) {
  if (!buckets.length) return <div className="px-5 pb-4 text-[13px] text-ink-3">No data in this range.</div>
  const total = buckets.reduce((s, b) => s + Number(b.count), 0)
  const max = Math.max(...buckets.map((b) => Number(b.count)))
  return (
    <div className="px-5 pb-4 space-y-2.5">
      {buckets.map((b) => {
        const n = Number(b.count)
        return (
          <div key={b.value} className="group" title={`${humanizeEnum(b.value)}: ${n} of ${total}`}>
            <div className="flex items-baseline justify-between text-[12.5px] mb-1">
              <span className="text-ink truncate pr-3">{humanizeEnum(b.prettyName || b.value)}</span>
              <span className="text-ink-2 tabular-nums shrink-0">{n} <span className="text-warm-400">· {total ? Math.round((n / total) * 100) : 0}%</span></span>
            </div>
            <div className="h-2 rounded-full bg-warm-100 overflow-hidden">
              <div className={`h-full rounded-full transition-all group-hover:opacity-80
                  ${tones ? TONE_BAR[STATE_TONE[b.value] ?? 'neutral'] : 'bg-brand-500'}`}
                style={{ width: `${Math.max(3, (n / max) * 100)}%` }} />
            </div>
          </div>
        )
      })}
    </div>
  )
}

/* ---------------- Milestones tab ---------------- */

const KPI_META: { key: string; label: string; icon: any; tone: 'brand' | 'warn' | 'ok' }[] = [
  { key: 'pendingConsignments', label: 'Pending', icon: Clock, tone: 'warn' },
  { key: 'failedConsignments', label: 'Failed', icon: AlertTriangle, tone: 'warn' },
  { key: 'dataValidationFailedConsignments', label: 'Data Validation Failed', icon: ShieldX, tone: 'warn' },
  { key: 'invalidLocationConsignments', label: 'Invalid Location', icon: MapPinOff, tone: 'warn' },
  { key: 'pastDeliveryDateConsignments', label: 'Past Delivery Date', icon: CalendarX2, tone: 'warn' },
  { key: 'pendingForSchedulingConsignments', label: 'Pending Scheduling', icon: Calendar, tone: 'brand' },
  { key: 'vipConsignments', label: 'VIP', icon: Crown, tone: 'brand' },
  { key: 'hazmatConsignments', label: 'Hazmat', icon: AlertTriangle, tone: 'brand' },
]

function MilestonesTab({ days }: { days: number }) {
  const [agg, setAgg] = useState<Awaited<ReturnType<typeof fetchMilestones>> | null>(null)
  const [kpis, setKpis] = useState<Record<string, number> | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = () => {
    setError(null)
    Promise.all([fetchMilestones(days), fetchKpis(days)])
      .then(([a, k]) => { setAgg(a); setKpis(k) })
      .catch((e) => setError(String(e)))
  }
  useEffect(load, [days])

  if (error) return <ErrorBox error={error} onRetry={load} />
  if (!agg || !kpis) return <LoadingBox label="Loading milestone data…" />

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile icon={Package} label="All Consignments" value={agg.total} />
        {KPI_META.filter((k) => (kpis[k.key] ?? 0) > 0 || ['pendingConsignments', 'failedConsignments', 'dataValidationFailedConsignments'].includes(k.key))
          .map((k) => <StatTile key={k.key} icon={k.icon} label={k.label} value={kpis[k.key] ?? 0} tone={k.tone} />)}
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Consignments by State"><CountBars buckets={agg.state} tones /></Panel>
        <Panel title="Last Milestone Event">
          <CountBars buckets={agg.lastMilestoneEventCode} />
        </Panel>
      </div>
    </div>
  )
}

/* ---------------- Facility Mis tab ---------------- */

function FacilityTab({ days }: { days: number }) {
  const [rows, setRows] = useState<Record<string, any>[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const load = () => {
    setError(null)
    fetchOpsList(days).then(setRows).catch((e) => setError(String(e)))
  }
  useEffect(load, [days])

  const grouped = useMemo(() => {
    const m = new Map<string, { total: number; states: Map<string, number> }>()
    for (const r of rows ?? []) {
      const f = r.currentFacilityCode || r.originFacilityCode || '—'
      const g = m.get(f) ?? { total: 0, states: new Map() }
      g.total += 1
      g.states.set(r.state, (g.states.get(r.state) ?? 0) + 1)
      m.set(f, g)
    }
    return [...m.entries()].sort((a, b) => b[1].total - a[1].total)
  }, [rows])

  if (error) return <ErrorBox error={error} onRetry={load} />
  if (rows === null) return <LoadingBox label="Loading facility data…" />
  if (!grouped.length) return <Panel><div className="px-5 py-10 text-center text-[13px] text-ink-3">No facility activity in this range.</div></Panel>

  return (
    <Panel title="Consignments by Current Facility">
      <table className="w-full text-[13px]">
        <thead>
          <tr className="text-left text-[12px] text-ink-3 border-b border-line">
            <th className="px-5 py-2.5 font-bold">Facility</th>
            <th className="px-3 py-2.5 font-bold text-right">Total</th>
            <th className="px-3 py-2.5 font-bold">State Breakdown</th>
          </tr>
        </thead>
        <tbody>
          {grouped.map(([facility, g]) => (
            <tr key={facility} className="border-b border-line last:border-0 hover:bg-warm-50 transition-colors">
              <td className="px-5 py-3">
                <span className="inline-flex items-center gap-2 font-bold text-ink"><Building2 size={15} className="text-warm-400" />{facility}</span>
              </td>
              <td className="px-3 py-3 text-right tabular-nums text-ink">{g.total}</td>
              <td className="px-3 py-3">
                <div className="flex flex-wrap gap-1.5">
                  {[...g.states.entries()].map(([s, n]) => (
                    <StatusPill key={s} label={`${humanizeEnum(s)} · ${n}`} tone={STATE_TONE[s] ?? 'neutral'} />
                  ))}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  )
}

/* ---------------- Ageing tab ---------------- */

const AGE_BUCKETS = [
  { label: '0–2 days', min: 0, max: 2 }, { label: '3–7 days', min: 3, max: 7 },
  { label: '8–14 days', min: 8, max: 14 }, { label: '15–30 days', min: 15, max: 30 },
  { label: 'Over 30 days', min: 31, max: Infinity },
]

function AgeingTab({ days }: { days: number }) {
  const [rows, setRows] = useState<Record<string, any>[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const load = () => {
    setError(null)
    fetchOpsList(days).then(setRows).catch((e) => setError(String(e)))
  }
  useEffect(load, [days])

  const open = useMemo(() =>
    (rows ?? [])
      .filter((r) => !['DELIVERED', 'CANCELLED'].includes(r.state))
      .map((r): Record<string, any> => {
        const start = r.agingStartAt ?? r.aging_start_at ?? r.createdAt
        const age = Math.max(0, Math.floor((Date.now() - new Date(start).getTime()) / 86_400_000))
        return { ...r, age }
      })
      .sort((a, b) => b.age - a.age),
  [rows])

  if (error) return <ErrorBox error={error} onRetry={load} />
  if (rows === null) return <LoadingBox label="Loading ageing data…" />

  const max = Math.max(1, ...AGE_BUCKETS.map((b) => open.filter((r) => r.age >= b.min && r.age <= b.max).length))

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Panel title="Open Consignments by Age">
        <div className="px-5 pb-4 space-y-2.5">
          {AGE_BUCKETS.map((b) => {
            const n = open.filter((r) => r.age >= b.min && r.age <= b.max).length
            return (
              <div key={b.label} title={`${b.label}: ${n} open consignment${n === 1 ? '' : 's'}`}>
                <div className="flex items-baseline justify-between text-[12.5px] mb-1">
                  <span className="text-ink">{b.label}</span>
                  <span className="text-ink-2 tabular-nums">{n}</span>
                </div>
                <div className="h-2 rounded-full bg-warm-100 overflow-hidden">
                  <div className={`h-full rounded-full ${b.min >= 15 ? 'bg-warning-fg' : 'bg-brand-500'}`}
                    style={{ width: `${Math.max(3, (n / max) * 100)}%` }} />
                </div>
              </div>
            )
          })}
        </div>
      </Panel>
      <Panel title="Oldest Open Consignments">
        {open.length === 0 ? (
          <div className="px-5 py-10 text-center text-[13px] text-ink-3">Nothing open — all consignments are closed.</div>
        ) : (
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-left text-[12px] text-ink-3 border-b border-line">
                <th className="px-5 py-2.5 font-bold">Reference</th>
                <th className="px-3 py-2.5 font-bold">State</th>
                <th className="px-3 py-2.5 font-bold text-right">Age</th>
              </tr>
            </thead>
            <tbody>
              {open.slice(0, 8).map((r) => (
                <tr key={r.key} className="border-b border-line last:border-0 hover:bg-warm-50 transition-colors">
                  <td className="px-5 py-2.5 font-mono text-[12px] text-brand-500">{r.key}</td>
                  <td className="px-3 py-2.5"><StatusPill label={humanizeEnum(r.state)} tone={STATE_TONE[r.state] ?? 'neutral'} /></td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-ink-2">
                    <span className={`inline-flex items-center gap-1 ${r.age > 30 ? 'text-warning-fg font-bold' : ''}`}>
                      <Timer size={13} className="text-warm-400" />{r.age}d
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>
    </div>
  )
}

/* ---------------- SLA tab ---------------- */

const SLA_ICONS: Record<string, any> = { withinSLA: CheckCircle2, outsideSLA: XCircle, onTimeRate: Percent, total: Package }
const SLA_TONES: Record<string, 'brand' | 'warn' | 'ok'> = { withinSLA: 'ok', outsideSLA: 'warn', onTimeRate: 'brand', total: 'brand' }

function SlaTab({ days }: { days: number }) {
  const [data, setData] = useState<Awaited<ReturnType<typeof fetchSla>> | null>(null)
  const [error, setError] = useState<string | null>(null)
  const load = () => {
    setError(null)
    fetchSla(days).then(setData).catch((e) => setError(String(e)))
  }
  useEffect(load, [days])

  if (error) return <ErrorBox error={error} onRetry={load} />
  if (!data) return <LoadingBox label="Loading SLA data…" />

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {data.cards.map((c) => (
          <StatTile key={c.key} icon={SLA_ICONS[c.key] ?? Package} label={c.prettyName} value={c.value} tone={SLA_TONES[c.key] ?? 'brand'} />
        ))}
      </div>
      <Panel title="Delivered — State Overview">
        {data.stateOverview.length
          ? <CountBars buckets={data.stateOverview} tones />
          : <div className="px-5 py-8 text-center text-[13px] text-ink-3">
              No delivered consignments in this range yet — SLA metrics populate once deliveries complete.
            </div>}
      </Panel>
    </div>
  )
}

/* ---------------- page shell ---------------- */

export default function Dashboard() {
  useNavigate() // keep router context warm for future drill-downs
  const [visibleTabs, setVisibleTabs] = useState<string[]>(DEFAULT_TABS)
  const [tab, setTab] = useState(0)
  const [range, setRange] = useState(2) // Last 90 days

  /* tab set comes from the account's OPS_DASHBOARD module config, like staging */
  useEffect(() => {
    fetchModuleSettings(['OPS_DASHBOARD'])
      .then(([m]) => {
        const s = parseSettingJson(m?.settingJson) as { visibleTabs?: string[] } | null
        const tabs = (s?.visibleTabs ?? []).filter((t) => TAB_LABELS[t])
        if (tabs.length) setVisibleTabs(tabs)
      })
      .catch(() => {})
  }, [])

  const days = RANGES[range].days
  const active = visibleTabs[tab] ?? visibleTabs[0]

  return (
    <div className="fe-nueva bg-canvas min-h-full p-5">
      <div className="flex items-center gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <Tabs tabs={visibleTabs.map((t) => TAB_LABELS[t])} active={tab} onChange={setTab} />
        </div>
        <div className="flex rounded-md border border-line bg-surface p-0.5 shrink-0">
          {RANGES.map((r, i) => (
            <button key={r.label} onClick={() => setRange(i)}
              className={`rounded px-2.5 py-1.5 text-[12px] font-bold transition-colors
                ${range === i ? 'bg-brand-50 text-brand-500' : 'text-ink-3 hover:text-ink'}`}>
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {active === 'consignmentDashboard' && <MilestonesTab days={days} />}
      {active === 'consignmentFacilityMis' && <FacilityTab days={days} />}
      {active === 'consignmentAgeingDashboard' && <AgeingTab days={days} />}
      {active === 'sla' && <SlaTab days={days} />}
      {!TAB_LABELS[active] && <Panel><div className="px-5 py-10 text-center text-[13px] text-ink-3"><Boxes size={28} className="mx-auto mb-2 text-warm-300" />This dashboard is not configured.</div></Panel>}
    </div>
  )
}
