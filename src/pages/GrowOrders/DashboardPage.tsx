/**
 * Dashboard — `/grow/orders/dashboard`, the live portal's `/dashboards/analytics/`
 * (capture: docs/superpowers/research/2026-09-25-grow-portal-pages.md §1).
 *
 * Live arrangement, top to bottom, in our tokens: a filter row (date range,
 * default the last 30 days · store location) → three KPI tiles (Pickup Failed ·
 * Schedule Pickup · On Time Performance, each with a quiet "View ›") → three
 * chart cards (Summary by stage · Deliveries Completed per day · On Time
 * Performance per day) → a full-width Help Center card.
 *
 * Every number is DERIVED from the local stores — nothing is written:
 *  - Pickup Failed = pickup requests in that status, raised in the range;
 *  - Schedule Pickup = the SAME rule as Pickup Requests' "Eligible consignments"
 *    tab (`canSchedulePickup`), over every date, so the two counts agree;
 *  - Summary = the shared FarEye state vocabulary (`fareyeStatesOf`): Created ·
 *    Ready For Pickup (Ready To Ship + Pickup Requested) · In-Transit (Pickedup ·
 *    At Facility · Driver Out), over shipments created in the range;
 *  - Deliveries / OTP per day = the `Delivered` event of the drawer's own event
 *    log against the shipment's EDD (`trackingModel.ts`).
 * The store's orders carry no merchant field, so, exactly like Consignment
 * Order, the dashboard reads every order in the portal.
 *
 * Charts are plain SVG/divs (no chart library in package.json): one series in
 * the brand accent, recessive warm grid, a hover tooltip on every mark.
 */
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CalendarClock, ChevronRight, CircleX, Gauge, Info, LifeBuoy } from 'lucide-react'
import { useGrowOrders } from '../../growOrders/store'
import { useMasters } from '../../growOrders/masters'
import { pickupPagesVisible, usePickupModuleConfig } from '../../config/pickupModule'
import { usePlanning } from '../LocalPFP/planningStore'
import { canSchedulePickup } from '../LocalPFP/adapter'
import { KpiTile, Panel } from '../../nueva/components'
import { DateRange, FilterSelect } from '../../local/chrome'
import { shipmentRowsOf } from './shipmentRows'
import { storeName } from './utils'
import { daysBetween, inRange, isoDay, presetRange } from './dateRanges'
import { deliveredAtOf, eddOf } from './trackingModel'

const STAGES: { label: string; states: string[] }[] = [
  { label: 'Created', states: ['Created'] },
  { label: 'Ready For Pickup', states: ['Ready To Ship', 'Pickup Requested'] },
  { label: 'In-Transit', states: ['Pickedup', 'Partially Pickedup', 'At Facility', 'Driver Out'] },
]

const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`

/* ------------------------------------------------------------ charts ---- */

function ChartCard({ title, info, children }: { title: string; info?: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col rounded-md border border-line bg-surface px-5 py-4">
      <p className="mb-3 flex items-center gap-1.5 text-[15px] font-bold text-ink">
        {title}
        {info && <span title={info} className="text-ink-3"><Info size={14} /></span>}
      </p>
      {children}
    </div>
  )
}

/** Nice axis max + 4 ticks. */
function ticks(max: number): number[] {
  const top = max <= 4 ? 4 : Math.ceil(max / 4) * 4
  return [0, top / 4, top / 2, (top * 3) / 4, top]
}

/** Vertical bars, one per stage; tooltip on hover. */
function StageBars({ data }: { data: { label: string; value: number }[] }) {
  const t = ticks(Math.max(0, ...data.map((d) => d.value)))
  const top = t[t.length - 1]
  const H = 180
  return (
    <div className="flex gap-2">
      <div className="relative w-7 shrink-0 text-right text-[11px] text-ink-3" style={{ height: H }}>
        {t.map((v) => <span key={v} className="absolute right-0 -translate-y-1/2" style={{ top: H - (v / top) * H }}>{v}</span>)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="relative flex items-end justify-around gap-2 border-b border-line" style={{ height: H }}>
          {t.slice(1).map((v) => <span key={v} className="absolute inset-x-0 border-t border-warm-100" style={{ top: H - (v / top) * H }} />)}
          {data.map((d) => (
            <div key={d.label} className="group relative flex h-full w-12 items-end justify-center">
              <div className="w-8 rounded-t bg-brand-500 transition-opacity group-hover:opacity-80"
                style={{ height: `${(d.value / top) * 100}%`, minHeight: d.value ? 2 : 0 }} />
              <span className="pointer-events-none absolute -top-1 left-1/2 z-10 hidden -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-md bg-warm-900 px-2 py-1 text-[12px] text-white shadow-ds-overlay group-hover:block">
                {d.label}: {d.value}
              </span>
            </div>
          ))}
        </div>
        <div className="mt-1.5 flex justify-around gap-2">
          {data.map((d) => <span key={d.label} className="w-20 text-center text-[12px] text-ink-2">{d.label}</span>)}
        </div>
      </div>
    </div>
  )
}

/** A per-day line, 2px, brand accent; crosshair + tooltip on hover. */
function DayLine({ days, values, format = (v) => String(v), fixedMax }: {
  days: string[]; values: (number | null)[]; format?: (v: number) => string; fixedMax?: number
}) {
  const [hover, setHover] = useState<number | null>(null)
  const W = 300, H = 180, PAD = 4
  const t = fixedMax ? [0, fixedMax / 4, fixedMax / 2, (fixedMax * 3) / 4, fixedMax] : ticks(Math.max(0, ...values.map((v) => v ?? 0)))
  const top = t[t.length - 1] || 1
  const x = (i: number) => PAD + (days.length <= 1 ? 0 : (i / (days.length - 1)) * (W - PAD * 2))
  const y = (v: number) => H - (v / top) * H
  /* a null day (nothing to measure) breaks the line instead of plotting a false 0 */
  const path = values.map((v, i) => (v === null ? '' : `${i === 0 || values[i - 1] === null ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`)).join(' ')
  const lone = values.map((v, i) => (v !== null && values[i - 1] == null && values[i + 1] == null ? i : -1)).filter((i) => i >= 0)
  const step = Math.max(1, Math.ceil(days.length / 8))
  return (
    <div className="flex gap-2">
      <div className="relative w-7 shrink-0 text-right text-[11px] text-ink-3" style={{ height: H }}>
        {t.map((v) => <span key={v} className="absolute right-0 -translate-y-1/2" style={{ top: y(v) }}>{format(v)}</span>)}
      </div>
      <div className="relative min-w-0 flex-1">
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="block w-full overflow-visible" style={{ height: H }}
          onMouseLeave={() => setHover(null)}
          onMouseMove={(e) => {
            const r = e.currentTarget.getBoundingClientRect()
            const i = Math.round(((e.clientX - r.left) / r.width) * (days.length - 1))
            setHover(Math.max(0, Math.min(days.length - 1, i)))
          }}>
          {t.map((v) => <line key={v} x1={0} x2={W} y1={y(v)} y2={y(v)} className="stroke-warm-100" strokeWidth={1} vectorEffect="non-scaling-stroke" />)}
          <path d={path} fill="none" className="stroke-brand-500" strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
          {hover !== null && (
            <line x1={x(hover)} x2={x(hover)} y1={0} y2={H} className="stroke-warm-300" strokeWidth={1} vectorEffect="non-scaling-stroke" />
          )}
        </svg>
        {lone.map((i) => (
          <span key={i} className="pointer-events-none absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand-500"
            style={{ left: `${(x(i) / W) * 100}%`, top: y(values[i] as number) }} />
        ))}
        {hover !== null && (
          <>
            <span className="pointer-events-none absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface bg-brand-500"
              style={{ left: `${(x(hover) / W) * 100}%`, top: y(values[hover] ?? 0), display: values[hover] === null ? 'none' : undefined }} />
            <span className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 whitespace-nowrap rounded-md bg-warm-900 px-2 py-1 text-[12px] text-white shadow-ds-overlay"
              style={{ left: `${Math.min(85, Math.max(15, (x(hover) / W) * 100))}%` }}>
              {ddmm(days[hover])}: {values[hover] === null ? 'no deliveries' : format(values[hover] as number)}
            </span>
          </>
        )}
        <div className="relative mt-1.5 h-4">
          {days.map((d, i) => ((i % step === 0 && days.length - 1 - i >= step * 0.75) || i === days.length - 1) && (
            <span key={d} className="absolute -translate-x-1/2 text-[11px] text-ink-3" style={{ left: `${(x(i) / W) * 100}%` }}>{ddmm(d)}</span>
          ))}
        </div>
      </div>
    </div>
  )
}

/* -------------------------------------------------------------- page ---- */

export default function GrowDashboardPage() {
  const db = useGrowOrders()
  const plan = usePlanning()
  useMasters()
  const nav = useNavigate()
  const pickupPages = pickupPagesVisible(usePickupModuleConfig())
  const initial = presetRange('Last 30 Days')
  const [from, setFrom] = useState(initial.from)
  const [to, setTo] = useState(initial.to)
  const [store, setStore] = useState('')

  const all = useMemo(() => shipmentRowsOf(db, plan).filter((r) => !r.draft), [db, plan])
  const stores = useMemo(() => [...new Set([...db.stores.map((s) => s.code), ...all.map((r) => r.shipFromCode ?? '')].filter(Boolean))].sort(), [db.stores, all])
  const atStore = useMemo(() => (store ? all.filter((r) => r.shipFromCode === store) : all), [all, store])
  const inWindow = useMemo(() => atStore.filter((r) => inRange(r.order.createdAt, from, to)), [atStore, from, to])

  const pickupFailed = useMemo(() => db.pickupRequests.filter((p) =>
    p.status === 'Pickup Failed' && (!store || p.storeCode === store) && inRange(p.createdAt, from, to)).length,
  [db.pickupRequests, store, from, to])
  /* Pickup Requests' Eligible consignments rule, every date (so the two numbers agree) */
  const toSchedule = useMemo(() => atStore.filter((r) => canSchedulePickup(r.order, db.pickupRequests)).length, [atStore, db.pickupRequests])

  const stages = useMemo(() => STAGES.map((s) => ({ label: s.label, value: inWindow.filter((r) => s.states.includes(r.state)).length })), [inWindow])

  /* deliveries in the range, by the day the event log says they landed */
  const days = useMemo(() => (from && to ? daysBetween(from, to) : daysBetween(initial.from, initial.to)), [from, to, initial.from, initial.to])
  const delivered = useMemo(() => atStore.flatMap((r) => {
    const at = deliveredAtOf(r.order, plan, db)
    if (!at) return []
    const day = isoDay(new Date(at))
    return day >= days[0] && day <= days[days.length - 1] ? [{ day, onTime: day <= eddOf(r) }] : []
  }), [atStore, plan, db, days])
  const perDay = days.map((d) => delivered.filter((x) => x.day === d).length)
  const otpPerDay = days.map((d) => {
    const on = delivered.filter((x) => x.day === d)
    return on.length ? Math.round((on.filter((x) => x.onTime).length / on.length) * 100) : null
  })
  const otp = delivered.length ? Math.round((delivered.filter((x) => x.onTime).length / delivered.length) * 100) : 0

  const view = (onClick: () => void, label = 'View') => (
    <button type="button" onClick={onClick} className="mt-1 inline-flex items-center gap-0.5 text-[12px] text-ink-3 hover:text-ink">
      {label}<ChevronRight size={13} />
    </button>
  )

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[13px] text-ink-3">A one-glance view of your shipments over the selected dates.</p>
      <div className="pfp-filters">
        <DateRange start={from} end={to} onStart={setFrom} onEnd={setTo} />
        <FilterSelect value={store} placeholder="All store locations" options={stores} width={200}
          labels={(c) => storeName(c, db.stores)} searchable={stores.length > 6} onChange={setStore} />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div>
          <KpiTile label="Pickup Failed" value={pickupFailed} icon={<CircleX size={18} />}
            hint={pickupPages ? view(() => nav('/grow/orders/pickups?tab=all')) : 'Pickup requests that failed in the range'} />
        </div>
        <div>
          <KpiTile label="Schedule Pickup" value={toSchedule} icon={<CalendarClock size={18} />}
            hint={pickupPages ? view(() => nav('/grow/orders/pickups?tab=eligible')) : 'Shipments awaiting a pickup booking'} />
        </div>
        <div>
          <KpiTile label="On Time Performance" value={`${otp}%`} icon={<Gauge size={18} />}
            hint={view(() => nav('/grow/orders/tracking'), `${delivered.length} delivered · View`)} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <ChartCard title="Summary" info="Shipments created in the range, by the stage they are in now">
          <StageBars data={stages} />
        </ChartCard>
        <ChartCard title="Deliveries Completed">
          <DayLine days={days} values={perDay} />
        </ChartCard>
        <ChartCard title="On Time Performance" info="Delivered on or before the EDD, as a share of that day's deliveries">
          <DayLine days={days} values={otpPerDay} fixedMax={100} format={(v) => `${v}%`} />
        </ChartCard>
      </div>

      <Panel>
        <div className="flex items-center justify-between gap-4 py-1">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-warm-100 text-ink-2"><LifeBuoy size={18} /></span>
            <div>
              <p className="text-[15px] font-bold text-ink">Help Center</p>
              <p className="text-[13px] text-ink-3">Learn more about delivering better orders</p>
            </div>
          </div>
          <button type="button" onClick={() => nav('/grow/orders/help')} className="text-[13px] font-bold text-brand-500 hover:underline">
            See all articles
          </button>
        </div>
      </Panel>
    </div>
  )
}
