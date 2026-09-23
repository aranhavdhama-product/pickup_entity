/**
 * Dispatch Planning — LIVE staging trips grouped into waves.
 *
 * Single view, fed by POST /sbs/app/trip/get_active_trips through the Vite
 * `/staging` proxy: the trips a dispatcher must act on (UNASSIGNED by default,
 * switchable to all), bucketed into configurable time waves by their hub-local
 * expected start time. Rows use the planning design — identity + window +
 * assignment controls on line one, metrics on line two, stops on expand.
 *
 * No plans / get_routing_history here anymore: trips ARE converted routes
 * (trip.route_key == routeId), so assignment reuses the captured three-step
 * sequence keyed on route_key (routing_id is null — trips carry no plan ref).
 * Writes stay behind the settings-menu "Enable writes" toggle + confirm.
 */

import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import {
  AlertTriangle, CheckCheck, ChevronDown, Loader2, Map as MapIcon, MapPin, RefreshCw, Route, Settings, Truck, Users, Weight, X,
} from 'lucide-react'
import { AdvancedFilters, SearchInput, SearchSelect, StatusPill, Toggle } from '../../nueva/components'
import DateRangeFilter from '../../nueva/DateRangeFilter'
import {
  fetchHubs,
  ApiError, assignDriver, fetchDrivers, fetchJobCoords, fetchRouteGeometry, fetchRouteIndex, fetchTrips, getSessionInfo,
  type DriverCard, type JobInfo, type RouteCard, type RouteGeo, type SessionInfo, type TripCard, type TripStop,
} from './api'
import { DetailDrawer } from '../ConsignmentOrder'
import { consignmentOrders, type ConsignmentOrderRow } from '../../data/mockData'

/* --------------------------------------------------------------- helpers -- */

/** minutes-from-midnight → "HH:mm" (wave boundaries) */
const minHHMM = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`

/** Trip timestamps arrive as UTC without a Z suffix ("2026-03-24T23:09"). */
const utcDate = (ts: string | null): Date | null => {
  if (!ts) return null
  const d = new Date(ts.endsWith('Z') ? ts : `${ts}Z`)
  return Number.isNaN(+d) ? null : d
}
const localHM = (ts: string | null, tz: string): string => {
  const d = utcDate(ts)
  if (!d) return '—'
  return new Intl.DateTimeFormat('en-GB', { timeZone: tz || 'UTC', hour: '2-digit', minute: '2-digit', hour12: false }).format(d)
}
/** hub-local calendar date, "2026-03-25" */
const localYMD = (ts: string | null, tz: string): string => {
  const d = utcDate(ts)
  if (!d) return ''
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz || 'UTC', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
}
/** hub-local minutes from midnight, for wave bucketing */
const localMinutes = (ts: string | null, tz: string): number | null => {
  const hm = localHM(ts, tz)
  if (hm === '—') return null
  const [h, m] = hm.split(':').map(Number)
  return h * 60 + m
}
const parseHM = (s: string): number => {
  const [h, m] = s.split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

/** straight-line km between two points — leg distances are estimates (no leg field in any API) */
const haversineKm = (a: { lat: number; lng: number }, b: { lat: number; lng: number }): number => {
  const rad = Math.PI / 180
  const dLat = (b.lat - a.lat) * rad
  const dLng = (b.lng - a.lng) * rad
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2
  return 2 * 6371 * Math.asin(Math.sqrt(h))
}
/** minutes between two UTC-ish timestamps */
const minutesBetween = (fromTs: string | null, toTs: string | null): number | null => {
  const a = utcDate(fromTs); const b = utcDate(toTs)
  if (!a || !b) return null
  return Math.round((b.getTime() - a.getTime()) / 60000)
}

interface WaveSettings {
  sizeMin: number   // wave length in minutes
  dayStart: string  // "06:00" — first wave starts here
  dayEnd: string    // "20:00" — waves stop here
}

/* ------------------------------------------------------------------ page -- */

export default function DispatchPlanning() {
  const [session, setSession] = useState<SessionInfo | null>(null)
  const [sessionDead, setSessionDead] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const [trips, setTrips] = useState<TripCard[]>([])
  const [tz, setTz] = useState('')
  const [drivers, setDrivers] = useState<DriverCard[]>([])

  const todayIso = new Date().toISOString().slice(0, 10)
  const [scope, setScope] = useState<'unassigned' | 'all'>('unassigned')
  const [dateFrom, setDateFrom] = useState(todayIso)
  const [dateTo, setDateTo] = useState(todayIso)
  const [hubFilter, setHubFilter] = useState('')
  const [query, setQuery] = useState('')
  const [waveCfg, setWaveCfg] = useState<WaveSettings>({ sizeMin: 30, dayStart: '06:00', dayEnd: '20:00' })
  const [showEmpty, setShowEmpty] = useState(false)
  const [selectedWave, setSelectedWave] = useState<string | null>(null)

  const [expandedTrip, setExpandedTrip] = useState<string | null>(null)
  const [rawTrip, setRawTrip] = useState<TripCard | null>(null)
  const [mapTrip, setMapTrip] = useState<TripCard | null>(null)
  const [routeIndex, setRouteIndex] = useState<Map<string, RouteGeo>>(new Map())
  const [jobIndex, setJobIndex] = useState<Map<string, JobInfo>>(new Map())
  const [viewRow, setViewRow] = useState<ConsignmentOrderRow | null>(null)
  const [viewTab, setViewTab] = useState(0)
  const [writeEnabled, setWriteEnabled] = useState(false)
  const [showResources, setShowResourcesRaw] = useState(() => localStorage.getItem('dp.showResources') !== '0')
  const setShowResources = (v: boolean | ((p: boolean) => boolean)) =>
    setShowResourcesRaw((prev) => {
      const next = typeof v === 'function' ? v(prev) : v
      localStorage.setItem('dp.showResources', next ? '1' : '0')
      return next
    })
  const [allHubs, setAllHubs] = useState<string[]>([])
  const [statusVals, setStatusVals] = useState<string[]>([])
  useEffect(() => {
    fetchHubs().then((hs) => setAllHubs(hs.map((h) => h.name).filter(Boolean))).catch(() => {})
  }, [])
  const [assigning, setAssigning] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  const reload = () => setReloadKey((k) => k + 1)
  const say = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 5000) }

  /* load session → trips + drivers */
  useEffect(() => {
    let cancelled = false
    const run = async () => {
      setLoading(true); setError(null); setSessionDead(false)
      try {
        const info = await getSessionInfo()
        if (cancelled) return
        setSession(info)
        if (!info.hasCookie) { setSessionDead(true); return }

        const res = await fetchTrips()
        if (cancelled) return
        setTrips(res.trips)
        setTz(res.timezone)

        if (info.hubId) {
          fetchDrivers(info.hubId).then((d) => { if (!cancelled) setDrivers(d) }).catch(() => setDrivers([]))
        }
      } catch (e) {
        if (cancelled) return
        if (e instanceof ApiError && (e.status === 401 || e.status === 403)) setSessionDead(true)
        else setError(e instanceof Error ? e.message : String(e))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void run()
    return () => { cancelled = true }
  }, [reloadKey])

  /* enrich trips with planning-route data (distance/duration) for the range */
  useEffect(() => {
    if (!trips.length || !session?.hubId) return
    let cancelled = false
    const pad = (ymd: string, days: number) => {
      const d = new Date(`${ymd}T00:00:00Z`)
      return Number.isNaN(+d) ? ymd : new Date(d.getTime() + days * 86400_000).toISOString().slice(0, 10)
    }
    const lo = dateFrom <= dateTo ? dateFrom : dateTo
    const hi = dateFrom <= dateTo ? dateTo : dateFrom
    const run = async () => {
      try {
        const idx = await fetchRouteIndex(pad(lo, -1), pad(hi, 1), session.hubId)
        if (cancelled) return
        setRouteIndex(idx)
        // job payloads (coords + tags) for every plan in the range, in parallel
        const planIds = [...new Set([...idx.values()].map((v) => v.planId))]
        const maps = await Promise.all(planIds.map((id) => fetchJobCoords(id).catch(() => new Map<string, JobInfo>())))
        if (cancelled) return
        const merged = new Map<string, JobInfo>()
        for (const m of maps) for (const [k, v] of m) if (!merged.has(k)) merged.set(k, v)
        setJobIndex(merged)
      } catch { /* planning data unavailable — rows just show — */ }
    }
    // debounce — calendar keystrokes fire per change; don't burst staging
    const timer = window.setTimeout(() => { void run() }, 400)
    return () => { cancelled = true; window.clearTimeout(timer) }
  }, [trips, session, dateFrom, dateTo])

  const tzUse = tz || session?.timezone || 'UTC'
  const tripDate = (t: TripCard) => localYMD(t.expectedStartUtc ?? t.dispatchDateUtc, tzUse)
  const dates = [...new Set(trips.map(tripDate).filter(Boolean))].sort().reverse()
  const fmtDay = (ymd: string) => {
    const d = new Date(`${ymd}T00:00:00`)
    if (Number.isNaN(+d)) return ymd
    return new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }).format(d)
  }

  /* day selection — from/to calendars; same day = single-day view (default today),
     a wider range = one date section per day, newest first */
  const from = dateFrom <= dateTo ? dateFrom : dateTo
  const to = dateFrom <= dateTo ? dateTo : dateFrom
  const multiday = from !== to
  const dayList = multiday ? dates.filter((d) => d >= from && d <= to) : [from]

  /* hub options: the account's hub master (city_hub_list) merged with any hub
     seen on loaded trips — so the filter is never empty just because the current
     date range has no trips */
  const hubs = [...new Set([...allHubs, ...trips.map((t) => t.dispatchHub).filter(Boolean)])].sort()
  const needle = query.trim().toLowerCase()
  /* range + hub first, then search — the scope-toggle counts reflect exactly this set */
  const inRange = trips
    .filter((t) => dayList.includes(tripDate(t)))
    .filter((t) => !hubFilter || t.dispatchHub === hubFilter)
    .filter((t) => !statusVals.length
      || (statusVals.includes('Delayed') && t.status === 'DELAYED')
      || (statusVals.includes('On time') && t.status !== 'DELAYED'))
    .filter((t) => !needle
      || t.name.toLowerCase().includes(needle)
      || t.tripKey.toLowerCase().includes(needle)
      || t.routeKey.toLowerCase().includes(needle)
      || t.vehicleNumber.toLowerCase().includes(needle))
  const selTrips = inRange.filter((t) => scope === 'all' || t.driverId === null)

  /* wave bucketing (per day) by hub-local expected start time */
  const startMin = parseHM(waveCfg.dayStart)
  const endMin = parseHM(waveCfg.dayEnd)
  const size = Math.max(5, waveCfg.sizeMin)
  const byStart = (a: TripCard, b: TripCard) =>
    (localMinutes(a.expectedStartUtc, tzUse) ?? 0) - (localMinutes(b.expectedStartUtc, tzUse) ?? 0)
  const bucketize = (list: TripCard[]) => {
    const waveCount = endMin > startMin ? Math.ceil((endMin - startMin) / size) : 0
    const waves = Array.from({ length: waveCount }, (_, i) => {
      const s = startMin + i * size
      return { n: i + 1, start: s, end: Math.min(s + size, endMin), trips: [] as TripCard[] }
    })
    const before: TripCard[] = []
    const after: TripCard[] = []
    const untimed: TripCard[] = []
    for (const t of list) {
      const m = localMinutes(t.expectedStartUtc, tzUse)
      if (m === null) untimed.push(t)
      else if (m < startMin) before.push(t)
      else if (m >= endMin) after.push(t)
      else waves[Math.floor((m - startMin) / size)].trips.push(t)
    }
    waves.forEach((w) => w.trips.sort(byStart))
    before.sort(byStart); after.sort(byStart)
    return { waves, before, after, untimed }
  }

  const unassignedTotal = inRange.filter((t) => t.driverId === null).length
  const delayedShown = selTrips.filter((t) => t.status === 'DELAYED').length

  const doAssign = async (trip: TripCard, driver: DriverCard) => {
    if (!writeEnabled) { say('Read-only mode — arm "Enable writes" in the settings menu to assign on staging.'); return }
    if (!session) return
    if (!window.confirm(`Assign ${driver.fullName} (${driver.employeeCode}) to ${trip.name} on STAGING?`)) return
    setAssigning(trip.tripKey)
    try {
      await assignDriver({
        session,
        key: trip.routeKey,
        routingId: null,
        deliveryDate: localYMD(trip.dispatchDateUtc ?? trip.expectedStartUtc, tzUse) || new Date().toISOString().slice(0, 10),
        driver,
      })
      say(`Assigned ${driver.fullName} to ${trip.name}.`)
      reload()
    } catch (e) {
      say(e instanceof Error ? e.message : String(e))
    } finally {
      setAssigning(null)
    }
  }

  const openConsignment = (key: string, stop: TripStop, trip: TripCard) => {
    const mock = consignmentOrders.find((r) =>
      r.consignmentNumber === key || r.referenceNumber === key || r.orderNumber === key || r.id === key)
    if (mock) { setViewRow(mock); setViewTab(0); return }
    // staging key with no mock twin — synthesize a row from what the trip knows
    setViewRow({
      id: key,
      consignmentNumber: key,
      referenceNumber: key,
      state: 'At Facility',
      secondaryState: stop.status === 'ON_TIME' ? 'On Time' : stop.status || trip.status || '—',
      weightKg: stop.weight ?? 0,
      volume: '—',
      palletSpaces: null,
      origin: trip.dispatchHub,
      destination: stop.address || stop.label,
      carrier: 'FarEye Fleet',
      orderNumber: key,
      serviceType: 'Standard',
      shipToName: stop.label || '—',
      shipToCode: stop.label ? stop.label.slice(0, 12) : '—',
      shipToPincode: '—',
      shipToCity: '—',
      shipToCounty: '—',
      shipFromCode: trip.dispatchHub,
      pickupWindow: null,
      deliveryWindow: stop.windowStartUtc && stop.windowEndUtc
        ? { start: `${localYMD(stop.windowStartUtc, tzUse)} ${localHM(stop.windowStartUtc, tzUse)}`, end: `${localYMD(stop.windowEndUtc, tzUse)} ${localHM(stop.windowEndUtc, tzUse)}` }
        : null,
      shipments: [],
      attachments: [],
    })
    setViewTab(0)
  }

  const groupProps = {
    tz: tzUse, drivers, assigning, expandedTrip,
    onToggle: setExpandedTrip, onRaw: setRawTrip, onMap: setMapTrip, onAssign: doAssign,
    onConsignment: openConsignment,
    routeOf: (key: string) => routeIndex.get(key)?.route ?? null,
    jobInfoOf: (key: string) => jobIndex.get(key) ?? null,
  }

  /* wave rail — one card per bucket per day; selecting a card shows its trips */
  const entries: { key: string; day: string; title: string; sub: string; trips: TripCard[] }[] = []
  for (const day of dayList) {
    const dayTrips = selTrips.filter((t) => tripDate(t) === day)
    if (multiday && !dayTrips.length) continue
    const b = bucketize(dayTrips)
    if (b.before.length) entries.push({ key: `${day}:before`, day, title: `Before ${waveCfg.dayStart}`, sub: 'outside wave window', trips: b.before })
    for (const w of b.waves) {
      if (w.trips.length || showEmpty) entries.push({ key: `${day}:w${w.n}`, day, title: `Wave ${w.n}`, sub: `${minHHMM(w.start)} – ${minHHMM(w.end)}`, trips: w.trips })
    }
    if (b.after.length) entries.push({ key: `${day}:after`, day, title: `After ${waveCfg.dayEnd}`, sub: 'outside wave window', trips: b.after })
    if (b.untimed.length) entries.push({ key: `${day}:untimed`, day, title: 'No start time', sub: 'no expected start', trips: b.untimed })
  }
  const active = entries.find((e) => e.key === selectedWave)
    ?? entries.find((e) => e.trips.length > 0)
    ?? entries[0]
    ?? null

  return (
    <div className="fe-nueva bg-canvas min-h-full p-5">
      {/* ------------------------------------------------ toolbar (one line) */}
      <div className="mb-3 flex flex-nowrap items-center gap-2">
        <DateRangeFilter
          value={{ field: 'date', from: dateFrom, to: dateTo }}
          fields={[{ code: 'date', label: 'Trip Date' }]}
          meta={tzUse}
          onApply={(v) => { setDateFrom(v.from); setDateTo(v.to) }}
        />
        <SearchSelect className="w-36 shrink-0" label="Hubs" value={hubFilter} options={hubs} onChange={setHubFilter} />
        {/* everything else: two-pane panel like the consignment page */}
        <AdvancedFilters
          defs={[
            { label: 'Trips', key: 'scope', options: [`Unassigned only (${unassignedTotal})`] },
            { label: 'Status', key: 'status', options: ['Delayed', 'On time'] },
          ]}
          values={{ scope: scope === 'unassigned' ? [`Unassigned only (${unassignedTotal})`] : [], status: statusVals }}
          onChange={(k, vals) => {
            if (k === 'scope') setScope(vals.length ? 'unassigned' : 'all')
            else if (k === 'status') setStatusVals(vals)
          }}
        />

        <div className="ml-auto flex shrink-0 items-center gap-2">
          {delayedShown > 0 && <span className="whitespace-nowrap rounded-full bg-danger-bg px-2.5 py-0.5 text-[12px] text-danger-fg">Delayed <b>{delayedShown}</b></span>}
          <div className="w-52">
            <SearchInput value={query} onChange={setQuery} placeholder="Search trip / route / vehicle" />
          </div>
          {writeEnabled && <span className="rounded-full bg-danger-bg px-2 py-0.5 text-[11px] font-bold text-danger-fg">LIVE</span>}
          {/* Resources panel toggle — surfaced for one-click access */}
          <button onClick={() => setShowResources((v: boolean) => !v)} title="Show / hide the Resources panel"
            className={`inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-[12.5px] font-bold transition-colors
              ${showResources ? 'border-brand-500 bg-brand-50 text-brand-500' : 'border-warm-300 bg-surface text-ink-3 hover:text-ink'}`}>
            <Users size={13} />Resources
          </button>
          <SettingsMenu
            writeEnabled={writeEnabled} onWriteEnabled={setWriteEnabled}
            showEmpty={showEmpty} onShowEmpty={setShowEmpty}
            waveCfg={waveCfg} onWaveCfg={setWaveCfg}
          />
          <IconBtn title="Refresh" onClick={reload}>
            {loading ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
          </IconBtn>
        </div>
      </div>

      {sessionDead && (
        <div className="mb-3 flex items-center gap-3 rounded-md border border-danger-fg/30 bg-danger-bg px-4 py-3 text-[13px] text-danger-fg">
          <AlertTriangle size={16} className="shrink-0" />
          <span>
            Staging session missing or expired. Copy the <b>Cookie</b> header from a logged-in staging tab (DevTools → Network)
            into <code className="font-mono">.staging-session</code>, then hit Refresh.
          </span>
        </div>
      )}
      {error && !sessionDead && (
        <div className="mb-3 rounded-md border border-warning-fg/30 bg-warning-bg px-4 py-3 text-[13px] text-warning-fg">{error}</div>
      )}

      {/* ------------------------------------------------- waves + resources */}
      <div className="flex items-start gap-4">
        {/* waves rail */}
        <aside className="w-[210px] shrink-0 rounded-xl border border-line bg-surface shadow-ds-1">
          <div className="border-b border-line px-4 py-3">
            <p className="text-[14px] font-bold text-ink">Waves: {entries.filter((e) => e.trips.length > 0).length}</p>
            <p className="text-[12px] text-ink-3">{selTrips.length} trip{selTrips.length === 1 ? '' : 's'} in range</p>
          </div>
          <div className="max-h-[70vh] overflow-y-auto">
            {dayList.map((day) => {
              const dayEntries = entries.filter((e) => e.day === day)
              if (!dayEntries.length) return null
              return (
                <div key={day}>
                  {multiday && (
                    <p className="sticky top-0 z-10 border-b border-line/60 bg-warm-25 px-4 py-1.5 text-[11px] font-bold uppercase tracking-wide text-ink-3">{fmtDay(day)}</p>
                  )}
                  {dayEntries.map((e) => {
                    const on = active?.key === e.key
                    const unas = e.trips.filter((t) => t.driverId === null).length
                    const done = e.trips.length - unas
                    const late = e.trips.filter((t) => t.status === 'DELAYED').length
                    return (
                      <button key={e.key} onClick={() => setSelectedWave(e.key)}
                        className={`block w-full border-b border-line/60 px-4 py-2.5 text-left transition-colors ${on ? 'bg-brand-50' : 'hover:bg-warm-50'} ${e.trips.length ? '' : 'opacity-50'}`}>
                        <div className="flex items-baseline justify-between gap-2">
                          <p className={`text-[13px] font-bold ${on ? 'text-brand-500' : 'text-ink'}`}>{e.title}</p>
                          <p className="shrink-0 text-[11.5px] font-bold tabular-nums text-ink-2">{e.sub}</p>
                        </div>
                        {e.trips.length > 0 && (
                          <div className="mt-1.5 flex items-center gap-2" title={`${done} of ${e.trips.length} trips have a driver assigned`}>
                            <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-warm-100">
                              <span className="block h-full rounded-full bg-success-fg transition-all"
                                style={{ width: `${Math.round((done / e.trips.length) * 100)}%` }} />
                            </span>
                            <span className="shrink-0 text-[10.5px] font-bold tabular-nums text-ink-3">{done}/{e.trips.length}</span>
                          </div>
                        )}
                        <p className="mt-1 text-[11px] text-ink-2">
                          {e.trips.length} trip{e.trips.length === 1 ? '' : 's'}
                          {unas > 0 && <> · {unas} unassigned</>}
                          {late > 0 && <span className="text-danger-fg"> · {late} delayed</span>}
                        </p>
                      </button>
                    )
                  })}
                </div>
              )
            })}
            {!entries.length && !loading && <p className="px-4 py-6 text-[12px] text-ink-3">No waves in this range.</p>}
          </div>
        </aside>

        {/* trips of the selected wave */}
        <main className="min-w-0 flex-1 rounded-xl border border-line bg-surface shadow-ds-1">
          <div className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3">
            {active ? (
              <>
                <p className="text-[14px] font-bold text-ink">{active.title}</p>
                <span className="text-[12.5px] tabular-nums text-ink-2">{active.sub}</span>
                {multiday && <span className="rounded-full bg-warm-50 px-2 py-0.5 text-[11px] text-ink-3">{fmtDay(active.day)}</span>}
                <span className="rounded-full bg-warm-50 px-2.5 py-0.5 text-[12px] text-ink-2">Unassigned <b>{active.trips.filter((t) => t.driverId === null).length}</b></span>
                <span className="rounded-full bg-success-bg px-2.5 py-0.5 text-[12px] text-success-fg">Assigned <b>{active.trips.filter((t) => t.driverId !== null).length}</b></span>
                <span className="ml-auto flex items-center gap-1.5 text-[12px] text-ink-3"><Truck size={14} /> {active.trips.length}</span>
              </>
            ) : (
              <p className="text-[14px] font-bold text-ink">Trips</p>
            )}
          </div>
          <div className="max-h-[70vh] overflow-y-auto">
            {loading && !trips.length && (
              <p className="flex items-center gap-2 px-4 py-10 text-[13px] text-ink-3"><Loader2 size={15} className="animate-spin" /> Loading active trips…</p>
            )}
            {active?.trips.map((t) => <TripRow key={t.tripKey} t={t} {...groupProps} />)}
            {!loading && active && !active.trips.length && (
              <p className="px-4 py-10 text-[13px] text-ink-3">No trips start in this wave.</p>
            )}
            {!loading && !active && (
              <div className="flex flex-col items-center gap-2 px-4 py-14 text-center">
                <Truck size={22} className="text-warm-300" />
                <p className="text-[13.5px] font-bold text-ink">
                  {scope === 'unassigned' ? 'No unassigned trips in this range' : 'No trips in this range'}
                </p>
                <p className="text-[12.5px] text-ink-3">
                  {multiday
                    ? 'Widen the date range, or switch scope — staging trips may sit on other days.'
                    : `Nothing for ${fmtDay(from)}. Staging trips may be from earlier days — widen the range with the two calendars${dates[0] ? ` (latest data: ${fmtDay(dates[0])})` : ''}.`}
                </p>
              </div>
            )}
          </div>
        </main>

        {/* resources */}
        {showResources && <aside className="w-[230px] shrink-0 rounded-xl border border-line bg-surface shadow-ds-1">
          <div className="border-b border-line px-4 py-3">
            <p className="flex items-center gap-1.5 text-[14px] font-bold text-ink"><Users size={14} /> Resources</p>
            <p className="text-[11px] text-ink-3">{drivers.length} drivers · pick one on a trip to assign</p>
          </div>
          <div className="max-h-[70vh] overflow-y-auto">
            {drivers.map((d) => (
              <div key={`${d.id}-${d.employeeCode}`} className="flex items-center gap-2 border-b border-line/60 px-4 py-2.5">
                <span className={`h-2 w-2 shrink-0 rounded-full ${d.loggedIn ? 'bg-success-fg' : 'bg-warm-300'}`} title={d.loggedIn ? 'logged in' : 'offline'} />
                <div className="min-w-0">
                  <p className="truncate text-[13px] text-ink">{d.fullName}</p>
                  <p className="truncate text-[11px] text-ink-3">{d.employeeCode}</p>
                </div>
              </div>
            ))}
            {!drivers.length && <p className="px-4 py-6 text-[12px] text-ink-3">No drivers returned for this hub.</p>}
          </div>
        </aside>}
      </div>


      {rawTrip && <RawModal title={`Raw trip payload — ${rawTrip.tripKey}`} data={rawTrip.raw} onClose={() => setRawTrip(null)} />}
      {mapTrip && <TripMapModal trip={mapTrip} tz={tzUse} hubId={session?.hubId ?? null} onClose={() => setMapTrip(null)} />}
      {viewRow && <DetailDrawer row={viewRow} tab={viewTab} onTab={setViewTab} onClose={() => setViewRow(null)} />}

      {toast && (
        <div className="fixed bottom-5 left-1/2 z-[80] -translate-x-1/2 rounded-md bg-warm-900 px-4 py-2.5 text-[13px] text-white shadow-ds-overlay">
          {toast}
        </div>
      )}
    </div>
  )
}

/* ----------------------------------------------------------- toolbar bits -- */

function IconBtn({ title, onClick, children }: {
  title: string; onClick: () => void; children: React.ReactNode
}) {
  return (
    <button type="button" title={title} aria-label={title} onClick={onClick}
      className="flex h-8 w-8 items-center justify-center rounded-md border border-warm-300 bg-surface text-ink-2 transition-colors hover:bg-warm-50 hover:text-ink">
      {children}
    </button>
  )
}

/** Gear menu holding the page-level switches: Resources panel, empty waves, write arming. */
function SettingsMenu({ writeEnabled, onWriteEnabled, showEmpty, onShowEmpty, waveCfg, onWaveCfg }: {
  writeEnabled: boolean; onWriteEnabled: (v: boolean) => void
  showEmpty: boolean; onShowEmpty: (v: boolean) => void
  waveCfg: WaveSettings; onWaveCfg: (s: WaveSettings) => void
}) {
  const [open, setOpen] = useState(false)
  const invalid = parseHM(waveCfg.dayEnd) <= parseHM(waveCfg.dayStart)
  return (
    <div className="relative">
      <IconBtn title="Settings" onClick={() => setOpen((o) => !o)}><Settings size={15} /></IconBtn>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-9 z-50 w-80 rounded-xl border border-line bg-surface py-2 shadow-ds-overlay">
            {/* wave settings — two-column layout, applied live */}
            <p className="px-4 pb-1.5 pt-1 text-[11.5px] font-black uppercase tracking-[0.08em] text-ink-3">Wave settings</p>
            <div className="grid grid-cols-2 gap-3 px-4 pb-3">
              <label className="block">
                <span className="mb-1 block text-[12px] font-bold text-ink-2">Wave length</span>
                <select value={String(waveCfg.sizeMin)} onChange={(e) => onWaveCfg({ ...waveCfg, sizeMin: Number(e.target.value) })}
                  className="h-8 w-full rounded-md border border-warm-300 bg-surface px-2 text-[13px] text-ink">
                  {[15, 30, 45, 60, 90, 120].map((m) => <option key={m} value={m}>{m} minutes</option>)}
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-[12px] font-bold text-ink-2">Waves start</span>
                <input type="time" value={waveCfg.dayStart} onChange={(e) => onWaveCfg({ ...waveCfg, dayStart: e.target.value })}
                  className="h-8 w-full rounded-md border border-warm-300 bg-surface px-2 text-[13px] text-ink" />
              </label>
              <label className="block">
                <span className="mb-1 block text-[12px] font-bold text-ink-2">Waves end</span>
                <input type="time" value={waveCfg.dayEnd} onChange={(e) => onWaveCfg({ ...waveCfg, dayEnd: e.target.value })}
                  className="h-8 w-full rounded-md border border-warm-300 bg-surface px-2 text-[13px] text-ink" />
              </label>
              <div className="flex items-end pb-1">
                {invalid
                  ? <span className="text-[11.5px] text-danger-fg">End must be after start.</span>
                  : <span className="text-[11.5px] text-ink-3">{waveCfg.sizeMin}m waves, {waveCfg.dayStart}–{waveCfg.dayEnd}</span>}
              </div>
            </div>
            <div className="mx-4 h-px bg-line/70" />
            <div className="flex items-center justify-between gap-3 px-4 py-2.5">
              <span className="text-[13px] text-ink">Show empty waves</span>
              <Toggle checked={showEmpty} onChange={onShowEmpty} />
            </div>
            <div className="mx-4 h-px bg-line/70" />
            <div className="flex items-center justify-between gap-3 px-4 py-2.5">
              <span className="flex items-center gap-2 text-[13px] text-ink">
                Enable writes
                {writeEnabled && <span className="rounded-full bg-danger-bg px-1.5 py-px text-[10px] font-bold text-danger-fg">LIVE</span>}
              </span>
              <Toggle checked={writeEnabled} onChange={onWriteEnabled} />
            </div>
            <p className="px-4 pb-1 pt-0.5 text-[11px] leading-snug text-ink-3">
              Writes run the real driver-assignment sequence on staging.
            </p>
          </div>
        </>
      )}
    </div>
  )
}

/* -------------------------------------------------------------- wave group -- */

interface GroupProps {
  tz: string
  drivers: DriverCard[]
  assigning: string | null
  expandedTrip: string | null
  onToggle: (k: string | null) => void
  onRaw: (t: TripCard) => void
  onMap: (t: TripCard) => void
  onAssign: (t: TripCard, d: DriverCard) => void
  onConsignment: (key: string, stop: TripStop, trip: TripCard) => void
  routeOf: (routeKey: string) => RouteCard | null
  jobInfoOf: (consignmentKey: string) => JobInfo | null
}

/* --------------------------------------------------------------- trip row -- */

function TripRow({ t, tz, drivers, assigning, expandedTrip, onToggle, onRaw, onMap, onAssign, onConsignment, routeOf, jobInfoOf }: { t: TripCard } & GroupProps) {
  const expanded = expandedTrip === t.tripKey
  const totalWeight = t.stops.reduce((a, s) => a + (s.weight ?? 0), 0)
  const assigned = t.driverId !== null
  const planned = routeOf(t.routeKey)
  const tripTags = [...new Set(t.stops.flatMap((stop) => stop.consignmentKeys.flatMap((k) => jobInfoOf(k)?.tags ?? [])))]
  return (
    <div className="border-b border-line/70 last:border-b-0">
      {/* one dense line per trip — fixed-width numeric columns keep rows scannable */}
      <div className="flex items-center gap-x-3 px-3 py-2">
        <button onClick={() => onToggle(expanded ? null : t.tripKey)}
          className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
          title={`Trip ${t.tripKey} · Route ${t.routeKey} — click to show stops`}>
          <ChevronDown size={13} className={`shrink-0 text-warm-400 transition-transform ${expanded ? '' : '-rotate-90'}`} />
          <span className="truncate text-[13.5px] font-bold text-ink">{t.name}</span>
          {t.isPreload && <span className="shrink-0 rounded-full bg-warm-50 px-1.5 py-0.5 text-[11px] font-bold text-ink-2" title="Preload trip — vehicle is loaded before dispatch">P</span>}
        </button>
        <span className="shrink-0 text-[12.5px] font-bold tabular-nums text-ink-2" title="Expected start – end (hub local time)">{localHM(t.expectedStartUtc, tz)}–{localHM(t.expectedEndUtc, tz)}</span>
        <span className="flex w-12 shrink-0 items-center justify-end gap-1 text-[12.5px] font-bold tabular-nums text-ink-2"
          title={`${t.stops.length} delivery stop${t.stops.length === 1 ? '' : 's'} on this route — expand the row to see them`}>
          <MapPin size={13} className="shrink-0 text-ink-3" />{t.stops.length}
        </span>
        <span className="flex w-[70px] shrink-0 items-center justify-end gap-1 text-[12.5px] font-bold tabular-nums text-ink-2" title={`Total load weight: ${totalWeight.toFixed(1)} kg`}>
          <Weight size={13} className="shrink-0 text-ink-3" />{totalWeight.toFixed(0)}kg
        </span>
        <span className="flex w-[86px] shrink-0 items-center justify-end gap-1 text-[12.5px] font-bold tabular-nums text-ink-2"
          title={planned?.distanceKm != null
            ? `Planned route distance: ${planned.distanceKm.toFixed(1)} km${planned.totalTimeLabel ? ` · drive time ${planned.totalTimeLabel}` : ''}`
            : 'Distance comes from the planning route — still loading or not found'}>
          <Route size={13} className="shrink-0 text-ink-3" />{planned?.distanceKm != null ? `${planned.distanceKm.toFixed(1)}km` : '—'}
        </span>
        <span className="flex w-14 shrink-0 items-center justify-end gap-1 text-[12.5px] font-bold tabular-nums text-ink-2" title={`Delivery attempts: ${t.attempts.successful} successful of ${t.attempts.total} total${t.attempts.failed ? ` · ${t.attempts.failed} failed` : ''}`}>
          <CheckCheck size={13} className="shrink-0 text-ink-3" />{t.attempts.successful}/{t.attempts.total}
        </span>
        <span title={assigned ? `Driver assigned: ${t.driverCode}` : 'No driver assigned yet — pick one in the Driver box'}
          className={`w-[82px] shrink-0 rounded-full px-1.5 py-0.5 text-center text-[11px] font-bold ${assigned ? 'bg-success-bg text-success-fg' : 'bg-warning-bg text-warning-fg'}`}>
          {assigned ? 'Assigned' : 'Unassigned'}
        </span>
        <span title={`Execution status: ${t.status === 'DELAYED' ? 'running late vs plan' : t.status === 'ON_TIME' ? 'on time' : t.status || 'unknown'}`}
          className={`w-[66px] shrink-0 rounded-full px-1.5 py-0.5 text-center text-[11px] font-bold
          ${t.status === 'DELAYED' ? 'bg-danger-bg text-danger-fg' : t.status === 'ON_TIME' ? 'bg-success-bg text-success-fg' : 'bg-neutral-bg text-neutral-fg'}`}>
          {t.status === 'DELAYED' ? 'Delayed' : t.status === 'ON_TIME' ? 'On time' : t.status || '—'}
        </span>
        {tripTags.length > 0 && (
          <span className="flex shrink-0 items-center gap-1" title={`Consignment tags on this route: ${tripTags.join(', ')}`}>
            {tripTags.slice(0, 2).map((tag) => (
              <span key={tag} className="rounded-full bg-info-bg px-1.5 py-0.5 text-[10.5px] font-bold text-info-fg">{tag}</span>
            ))}
            {tripTags.length > 2 && <span className="text-[10.5px] font-bold text-ink-3">+{tripTags.length - 2}</span>}
          </span>
        )}
        <span className="w-24 shrink-0 truncate text-right text-[12.5px] font-bold text-ink-2" title={t.vehicleNumber ? `Vehicle registration: ${t.vehicleNumber}` : 'No vehicle recorded on this trip'}>
          {t.vehicleNumber || 'Veh —'}
        </span>
        <DriverSelect drivers={drivers} current={t.driverCode} busy={assigning === t.tripKey} onPick={(d) => onAssign(t, d)} />
        <button onClick={() => onMap(t)} title="Route map — plots the planning route's coordinates" className="shrink-0 text-ink-3 hover:text-ink"><MapIcon size={15} /></button>
        <button onClick={() => onRaw(t)} title="Show the raw trip JSON exactly as the API returned it" className="shrink-0 font-mono text-[12px] font-bold text-ink-3 hover:text-ink">{'{}'}</button>
      </div>
      {expanded && (
        <div className="pb-1">
          <p className="px-9 pb-1.5 font-mono text-[11px] text-ink-3">{t.tripKey} · {t.routeKey} · {t.dispatchHub}</p>
          <TripStopTable stops={t.stops} tz={tz} onConsignment={(k, stop) => onConsignment(k, stop, t)}
            jobInfoOf={jobInfoOf} start={planned?.startLocation ?? null} tripStartUtc={t.expectedStartUtc} />
        </div>
      )}
    </div>
  )
}

/** Position an anchored dropdown with `position: fixed` so scroll containers can't clip it. */
function anchoredStyle(anchor: DOMRect | null, width: number): React.CSSProperties | undefined {
  if (!anchor) return undefined
  const left = Math.max(8, Math.min(anchor.right - width, window.innerWidth - width - 8))
  const spaceBelow = window.innerHeight - anchor.bottom
  if (spaceBelow < 280 && anchor.top > spaceBelow) {
    return { position: 'fixed', left, bottom: window.innerHeight - anchor.top + 4, width }
  }
  return { position: 'fixed', left, top: anchor.bottom + 4, width }
}

/** Searchable driver combobox — search by name or employee code, arrow keys + Enter to pick. */
function DriverSelect({ drivers, current, busy, onPick }: {
  drivers: DriverCard[]; current: string; busy: boolean; onPick: (d: DriverCard) => void
}) {
  const [anchor, setAnchor] = useState<DOMRect | null>(null)
  const [q, setQ] = useState('')
  const [hi, setHi] = useState(0)
  const open = anchor !== null
  const needle = q.trim().toLowerCase()
  const filtered = drivers.filter((d) =>
    !needle || d.fullName.toLowerCase().includes(needle) || d.employeeCode.toLowerCase().includes(needle))
  const close = () => setAnchor(null)
  const pick = (d: DriverCard) => { close(); setQ(''); onPick(d) }

  return (
    <div className="inline-flex shrink-0 items-center">
      {busy && <Loader2 size={13} className="mr-1 animate-spin text-brand-500" />}
      <button type="button"
        onClick={(e) => {
          if (open) { close(); return }
          setQ(''); setHi(0)
          setAnchor(e.currentTarget.getBoundingClientRect())
        }}
        title={current ? `Assigned driver: ${current} — click to change` : 'Assign a driver — searchable list'}
        className="flex h-7 w-40 items-center justify-between gap-1 rounded-md border border-warm-300 bg-surface px-2 text-[12.5px] text-ink-2 transition-colors hover:border-warm-400">
        <span className="truncate">{current || 'Driver…'}</span>
        <ChevronDown size={12} className={`shrink-0 text-warm-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={close} />
          <div style={anchoredStyle(anchor, 256)} className="z-50 overflow-hidden rounded-md border border-line bg-surface shadow-ds-overlay">
            <div className="border-b border-line p-2">
              <input
                autoFocus value={q} placeholder="Search name or code…"
                onChange={(e) => { setQ(e.target.value); setHi(0) }}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') close()
                  else if (e.key === 'ArrowDown') { e.preventDefault(); setHi((h) => Math.min(h + 1, filtered.length - 1)) }
                  else if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)) }
                  else if (e.key === 'Enter' && filtered[hi]) pick(filtered[hi])
                }}
                className="h-7 w-full rounded border border-warm-300 bg-surface px-2 text-[12px] text-ink placeholder:text-warm-400 focus:border-brand-500"
              />
            </div>
            <div className="max-h-56 overflow-y-auto py-1">
              {filtered.map((d, i) => (
                <button key={`${d.id}-${d.employeeCode}`} type="button"
                  onClick={() => pick(d)} onMouseEnter={() => setHi(i)}
                  className={`flex w-full items-center gap-2.5 px-2.5 py-1.5 text-left transition-colors ${i === hi ? 'bg-brand-50' : ''}`}>
                  <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${d.loggedIn ? 'bg-success-fg' : 'bg-warm-300'}`}
                    title={d.loggedIn ? 'logged in' : 'offline'} />
                  <span className="min-w-0">
                    <span className="block truncate text-[12.5px] text-ink">{d.fullName}</span>
                    <span className="block truncate text-[10.5px] text-ink-3">{d.employeeCode}{d.userType ? ` · ${d.userType}` : ''}</span>
                  </span>
                </button>
              ))}
              {!filtered.length && <p className="px-3 py-3 text-[12px] text-ink-3">No drivers match “{q}”.</p>}
            </div>
          </div>
        </>
      )}
    </div>
  )
}



/* -------------------------------------------------------------- stop table -- */

function TripStopTable({ stops, tz, onConsignment, jobInfoOf, start, tripStartUtc }: {
  stops: TripStop[]; tz: string
  onConsignment: (key: string, stop: TripStop) => void
  jobInfoOf: (key: string) => JobInfo | null
  start: { lat: number; lng: number } | null
  tripStartUtc: string | null
}) {
  if (!stops.length) return <p className="px-10 pb-4 text-[12px] text-ink-3">No stop data on this trip.</p>

  /* legs: distance = straight-line between consecutive stop coordinates (no leg
     field exists in any payload); time = ETA diff vs previous stop's ETC/ETA */
  const coordOf = (stop: TripStop) => {
    for (const k of stop.consignmentKeys) {
      const c = jobInfoOf(k)
      if (c) return { lat: c.lat, lng: c.lng }
    }
    return null
  }
  const legs = stops.map((stop, i) => {
    const here = coordOf(stop)
    const prevPt = i === 0 ? start : coordOf(stops[i - 1])
    const km = here && prevPt ? haversineKm(prevPt, here) : null
    const prevTime = i === 0 ? tripStartUtc : (stops[i - 1].etcUtc ?? stops[i - 1].etaUtc)
    const mins = minutesBetween(prevTime, stop.etaUtc)
    return { km, mins }
  })

  return (
    <div className="mx-4 mb-3 overflow-x-auto rounded-md border border-line">
      <table className="w-full text-[12px]">
        <thead>
          <tr className="border-b border-line bg-thead text-left">
            <th className="px-3 py-2 font-bold text-ink">#</th>
            <th className="px-3 py-2 font-bold text-ink">Stop</th>
            <th className="px-3 py-2 font-bold text-ink">Consignments</th>
            <th className="px-3 py-2 font-bold text-ink">Tags</th>
            <th className="px-3 py-2 font-bold text-ink">ETA</th>
            <th className="px-3 py-2 font-bold text-ink" title="Distance (straight-line estimate) and drive time from the previous stop">From prev</th>
            <th className="px-3 py-2 font-bold text-ink">Window</th>
            <th className="px-3 py-2 font-bold text-ink text-right">Weight</th>
            <th className="px-3 py-2 font-bold text-ink text-right">P / D / R</th>
            <th className="px-3 py-2 font-bold text-ink">State</th>
            <th className="px-3 py-2 font-bold text-ink">Status</th>
          </tr>
        </thead>
        <tbody>
          {stops.map((s, i) => {
            const tags = [...new Set(s.consignmentKeys.flatMap((k) => jobInfoOf(k)?.tags ?? []))]
            const leg = legs[i]
            return (
              <tr key={`${s.sequence}-${s.label}`} className="border-b border-line/60 last:border-0">
                <td className="px-3 py-1.5 tabular-nums text-ink-3">{s.sequence}</td>
                <td className="max-w-[200px] truncate px-3 py-1.5 text-ink" title={s.address}>{s.label || s.address}</td>
                <td className="max-w-[200px] truncate px-3 py-1.5 font-mono text-[11px]" title={s.consignmentKeys.join(', ')}>
                  {s.consignmentKeys.length
                    ? s.consignmentKeys.map((k, j) => (
                      <span key={k}>
                        {j > 0 && ', '}
                        <button type="button" onClick={() => onConsignment(k, s)}
                          title="View consignment"
                          className="text-brand-500 hover:underline">{k}</button>
                      </span>
                    ))
                    : '—'}
                </td>
                <td className="px-3 py-1.5">
                  {tags.length
                    ? <span className="flex flex-wrap gap-1">{tags.map((tag) => (
                        <span key={tag} className="rounded-full bg-info-bg px-1.5 py-px text-[10px] font-bold text-info-fg">{tag}</span>
                      ))}</span>
                    : <span className="text-ink-3">—</span>}
                </td>
                <td className="px-3 py-1.5 tabular-nums text-ink-2">{localHM(s.etaUtc, tz)}</td>
                <td className="whitespace-nowrap px-3 py-1.5 tabular-nums text-ink-2"
                  title={i === 0 ? 'From the hub (start of trip)' : `From stop ${i}`}>
                  {leg.km !== null ? `~${leg.km.toFixed(1)} km` : '—'}
                  {leg.mins !== null && leg.mins >= 0 && <span className="text-ink-3"> · {leg.mins}m</span>}
                </td>
                <td className="px-3 py-1.5 tabular-nums text-ink-2">{localHM(s.windowStartUtc, tz)}–{localHM(s.windowEndUtc, tz)}</td>
                <td className="px-3 py-1.5 text-right tabular-nums text-ink-2">{s.weight !== null ? `${s.weight}${s.weightUom ? ` ${s.weightUom.toLowerCase()}` : ''}` : '—'}</td>
                <td className="px-3 py-1.5 text-right tabular-nums text-ink-2">{s.pickupCount} / {s.deliveryCount} / {s.returnCount}</td>
                <td className="px-3 py-1.5 text-ink-2">{s.state || '—'}</td>
                <td className="px-3 py-1.5">
                  <StatusPill label={s.status === 'ON_TIME' ? 'On time' : s.status === 'DELAYED' ? 'Delayed' : s.status || '—'}
                    tone={s.status === 'DELAYED' ? 'danger' : s.status === 'ON_TIME' ? 'success' : 'neutral'} />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

/* ------------------------------------------------------------------ modals -- */


/** Route map for a trip — OpenStreetMap tiles + OSRM street-level routing.
 * Markers are ONLY this trip's consignments: coordinates come from the plan's
 * routing-request jobs matched by consignment key. The route's own jobLatLngs
 * is the fallback, cleaned of the repeated hub coordinate it ships with. */
const streetCache = new Map<string, [number, number][] | null>()

async function fetchStreetPath(key: string, pts: { lat: number; lng: number }[]): Promise<[number, number][] | null> {
  if (streetCache.has(key)) return streetCache.get(key) ?? null
  try {
    const coords = pts.map((p) => `${p.lng},${p.lat}`).join(';')
    const res = await fetch(`/osrm/route/v1/driving/${coords}?overview=full&geometries=geojson`)
    if (!res.ok) throw new Error(`OSRM ${res.status}`)
    const data = await res.json() as { routes?: { geometry?: { coordinates?: [number, number][] } }[] }
    const line = data.routes?.[0]?.geometry?.coordinates
    const path = Array.isArray(line) ? line.map(([lng, lat]) => [lat, lng] as [number, number]) : null
    streetCache.set(key, path)
    return path
  } catch {
    streetCache.set(key, null)
    return null
  }
}

interface MapPoint { lat: number; lng: number; label: string; key?: string }

function TripMapModal({ trip, tz, hubId, onClose }: {
  trip: TripCard; tz: string; hubId: number | null; onClose: () => void
}) {
  const [geo, setGeo] = useState<RouteGeo | null>(null)
  const [points, setPoints] = useState<MapPoint[]>([])
  const [loading, setLoading] = useState(true)
  const [streetMiss, setStreetMiss] = useState(false)
  const mapEl = useRef<HTMLDivElement | null>(null)

  /* 1 — locate the planning route, then resolve THIS trip's consignment coords */
  useEffect(() => {
    let cancelled = false
    const run = async () => {
      setLoading(true)
      try {
        const day = localYMD(trip.dispatchDateUtc ?? trip.expectedStartUtc, tz)
        const g = await fetchRouteGeometry(trip.routeKey, day, hubId)
        if (cancelled) return
        setGeo(g)
        if (!g) { setPoints([]); return }

        let pts: MapPoint[] = []
        try {
          const coords = await fetchJobCoords(g.planId)
          for (const stop of trip.stops) {
            for (const key of stop.consignmentKeys) {
              const c = coords.get(key)
              if (c) { pts.push({ lat: c.lat, lng: c.lng, label: stop.label || c.name || key, key }); break }
            }
          }
        } catch { /* request payload unavailable — fall back below */ }

        if (!pts.length) {
          // fallback: route jobLatLngs, minus the hub coordinate it repeats
          const sl = g.route.startLocation
          const near = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) =>
            Math.abs(a.lat - b.lat) < 1e-6 && Math.abs(a.lng - b.lng) < 1e-6
          pts = g.route.latLngs
            .filter((p) => !sl || !near(p, sl))
            .filter((p, i, arr) => i === 0 || !near(p, arr[i - 1]))
            .map((p, i) => ({ lat: p.lat, lng: p.lng, label: trip.stops[i]?.label || `Stop ${i + 1}` }))
        }
        if (!cancelled) setPoints(pts)
      } catch {
        if (!cancelled) { setGeo(null); setPoints([]) }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void run()
    return () => { cancelled = true }
  }, [trip, tz, hubId])

  /* 2 — draw the Leaflet map once coordinates exist */
  useEffect(() => {
    const el = mapEl.current
    if (!el || !points.length) return

    const map = L.map(el, { zoomControl: true, attributionControl: true })
    L.tileLayer('/osm/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map)

    const stopIcon = (n: number) => L.divIcon({
      className: '',
      html: `<div style="width:22px;height:22px;border-radius:50%;background:#7C3AED;color:#fff;font:bold 11px Lato,sans-serif;display:flex;align-items:center;justify-content:center;box-shadow:0 1px 3px rgba(0,0,0,.35)">${n}</div>`,
      iconSize: [22, 22], iconAnchor: [11, 11],
    })
    const hubIcon = L.divIcon({
      className: '',
      html: '<div style="width:24px;height:24px;border-radius:6px;background:#1F2937;color:#fff;font-size:13px;display:flex;align-items:center;justify-content:center;box-shadow:0 1px 3px rgba(0,0,0,.4)">⌂</div>',
      iconSize: [24, 24], iconAnchor: [12, 12],
    })

    points.forEach((pt, i) => {
      L.marker([pt.lat, pt.lng], { icon: stopIcon(i + 1) }).addTo(map)
        .bindPopup(`<b>Stop ${i + 1} — ${pt.label}</b>${pt.key ? `<br><span style="font-family:monospace;font-size:11px">${pt.key}</span>` : ''}`)
    })
    const start = geo?.route.startLocation ?? null
    if (start) {
      L.marker([start.lat, start.lng], { icon: hubIcon }).addTo(map).bindPopup('<b>Hub</b>')
    }

    const bounds = L.latLngBounds([
      ...points.map((p) => [p.lat, p.lng] as [number, number]),
      ...(start ? [[start.lat, start.lng] as [number, number]] : []),
    ])
    map.fitBounds(bounds, { padding: [30, 30], maxZoom: 15 })
    // Leaflet measures the container at init — inside a just-mounted modal that
    // can be 0px, leaving grey tiles. Re-measure on the next frame.
    const fix = window.setTimeout(() => { map.invalidateSize(); map.fitBounds(bounds, { padding: [30, 30], maxZoom: 15 }) }, 60)

    const roundTrip = start ? [start, ...points, start] : points
    let alive = true
    void fetchStreetPath(trip.routeKey, roundTrip).then((path) => {
      if (!alive) return
      if (path) {
        L.polyline(path, { color: '#7C3AED', weight: 4, opacity: 0.75 }).addTo(map)
        setStreetMiss(false)
      } else {
        L.polyline(roundTrip.map((p) => [p.lat, p.lng] as [number, number]),
          { color: '#7C3AED', weight: 2.5, opacity: 0.6, dashArray: '6 6' }).addTo(map)
        setStreetMiss(true)
      }
    })

    return () => { alive = false; window.clearTimeout(fix); map.remove() }
  }, [geo, points, trip.routeKey])

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-warm-900/50 p-8" onClick={onClose}>
      <div className="max-h-full w-full max-w-4xl overflow-y-auto rounded-xl bg-surface p-5 shadow-ds-overlay" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-start justify-between">
          <div>
            <p className="text-[15px] font-bold text-ink">{trip.name}</p>
            <p className="text-[12px] text-ink-3">
              {trip.tripKey} · {trip.routeKey} · {points.length || trip.stops.length} consignment stop{(points.length || trip.stops.length) === 1 ? '' : 's'} · {localHM(trip.expectedStartUtc, tz)}–{localHM(trip.expectedEndUtc, tz)}
              {streetMiss && <span className="ml-2 text-warning-fg">street routing unavailable — showing straight lines</span>}
            </p>
          </div>
          <button onClick={onClose} className="text-ink-3 hover:text-ink"><X size={16} /></button>
        </div>
        {loading && (
          <p className="flex items-center gap-2 py-10 text-[13px] text-ink-3">
            <Loader2 size={15} className="animate-spin" /> Scanning routing plans (±3 days) for {trip.routeKey}…
          </p>
        )}
        {!loading && points.length > 0 && <div ref={mapEl} className="h-[480px] w-full rounded-md border border-line" />}
        {!loading && !points.length && (
          <p className="py-10 text-center text-[13px] text-ink-3">
            No coordinates found — the trips API carries no lat/lng, and no planning data matching{' '}
            <span className="font-mono">{trip.routeKey}</span> was found in routing history (±3 days around dispatch).
          </p>
        )}
      </div>
    </div>
  )
}

function RawModal({ title, data, onClose }: { title: string; data: unknown; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-warm-900/50 p-8" onClick={onClose}>
      <div className="max-h-full w-full max-w-3xl overflow-hidden rounded-xl bg-surface shadow-ds-overlay" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
          <p className="text-[13px] font-bold text-ink">{title}</p>
          <button onClick={onClose} className="text-ink-3 hover:text-ink"><X size={16} /></button>
        </div>
        <pre className="max-h-[70vh] overflow-auto p-4 font-mono text-[11px] leading-relaxed text-ink-2">
          {JSON.stringify(data, null, 2)}
        </pre>
      </div>
    </div>
  )
}

/* ---------------------------------------------------------- session badge -- */

