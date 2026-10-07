/**
 * Pickup Schedules — the roster (milk run) master (Skynet First Mile, 2026-10-07).
 *
 * A SCHEDULE is a calendar rule: this merchant location is collected on these days, in these runs. A PICKUP REQUEST is the
 * task the rule produces on a given day. The two stay separate objects: the schedule never holds orders, the request
 * does. Everything a schedule needs lives here as plain data + pure functions (no React, no fetch, no src/auth):
 *
 *   · the stored shape and its store (`pickup-schedules-v1`, `createLocalStore`) + an audit log of every change;
 *   · `validateSchedule` — what the form refuses at save (location needs an address a driver can find, a day and a run,
 *     a run inside the location's operating hours and not on a holiday, overlapping runs only when their vehicle
 *     differs — FR-01.4 / 01.6 / 02.x / 04.2);
 *   · `scheduleKey` — schedule + run + date, the request's unique key (FR-03.3);
 *   · `pickRunPr` — which run's request a waybill / consignment joins at its location (FR-05.2 / 05.3);
 *   · `staleScheduleRequests` — requests nobody assigned by the end of their day (FR-08.4).
 *
 * `store.ts` imports THIS module (never the other way), so the order store can link a ready consignment to its run
 * without a cycle; the generator that creates the requests lives in `pickupSchedules.ts` (it needs the store).
 */
import { createLocalStore } from './localStore'
import { inboundHubFor } from './hubs'
import { pickupPolicy } from './pickupSlots'
import { STORES } from './seed'
import type { GrowPickupRequest, PickupScheduleRef, StoreLocation } from './types'

/* ------------------------------------------------------------------ shape ---- */

/** One time slot of a roster day — "09:00–12:00". Every selected day holds these same runs. */
export interface ScheduleRun {
  id: string
  /** 'HH:mm' — the pickup window */
  start: string
  end: string
  /** optional planning inputs (FR-02.4): minutes at the stop, the vehicle type the run needs */
  serviceTimeMin: number
  vehicleType: string
}

export type ScheduleStatus = 'Active' | 'Paused'

export interface PickupSchedule {
  id: string
  /** 'SCH-0001' */
  code: string
  /** the merchant location — the Location master's code; a schedule is per collection point (FR-01.1) */
  storeCode: string
  /** the servicing hub: where this location's parcels are dropped (default: the location's own inbound hub) */
  hubCode: string
  /** 0 = Sunday … 6 = Saturday */
  days: number[]
  runs: ScheduleRun[]
  /** 'YYYY-MM-DD' — effective from (required) and to (blank = open-ended) */
  effectiveFrom: string
  effectiveTo: string
  status: ScheduleStatus
  /** shown to the driver on every request this schedule makes (gate code, dock, whom to meet) */
  instructions: string
  updatedAt: string
}

/** One line of the change log (FR-02.6): who, when, what changed. */
export interface ScheduleAudit { at: string; by: string; scheduleCode: string; change: string }

/** What the last generator run did (FR-03.6) — shown to the hub manager on the Schedules tab. */
export interface GeneratorRun {
  at: string
  by: 'Daily job' | 'Generate now' | 'Schedule change'
  /** the dates it covered */
  from: string
  to: string
  created: number
  /** already there — a rerun never makes a second one (FR-03.3) */
  existing: number
  /** requests nobody assigned by the end of their day, closed (FR-08.4) */
  closed: number
  /** waybills linked to a run */
  linked: number
  status: 'Success' | 'Failed'
  message: string
}

export interface ScheduleState {
  schedules: PickupSchedule[]
  /** generate this many days ahead, today included (FR-03.2, configurable) */
  horizonDays: number
  lastRun: GeneratorRun | null
  /** 'YYYY-MM-DD' of the last DAILY run — the job runs once a day */
  lastDailyDate: string
  audit: ScheduleAudit[]
}

export const SCHEDULES_KEY = 'pickup-schedules-v1'
export const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const
/** the week as people read it: Monday first */
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0]

/* ----------------------------------------------------------------- helpers ---- */

const pad = (n: number) => String(n).padStart(2, '0')
export const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export const addDays = (date: string, n: number): string => {
  const [y, m, d] = date.split('-').map(Number)
  return ymd(new Date(y, (m || 1) - 1, (d || 1) + n))
}
const dayOf = (date: string): number => { const [y, m, d] = date.split('-').map(Number); return new Date(y, (m || 1) - 1, d || 1).getDay() }
const mins = (t: string) => { const [h, m] = t.split(':').map(Number); return (h || 0) * 60 + (m || 0) }
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/
const DATE = /^\d{4}-\d{2}-\d{2}$/
export const runLabel = (r: Pick<ScheduleRun, 'start' | 'end'>) => `${r.start}–${r.end}`
const newRunId = () => `r${Math.random().toString(36).slice(2, 7)}`
export const newRun = (start = '09:00', end = '12:00'): ScheduleRun => ({ id: newRunId(), start, end, serviceTimeMin: 0, vehicleType: '' })

/** "Mon–Fri", "Mon, Wed, Fri", "Every day" — a selection of days in words */
export function daysText(days: number[]): string {
  const set = new Set(days)
  if (set.size === 7) return 'Every day'
  const ordered = WEEK_ORDER.filter((d) => set.has(d))
  if (!ordered.length) return 'No days'
  const runs: number[][] = []
  for (const d of ordered) {
    const last = runs[runs.length - 1]
    if (last && WEEK_ORDER.indexOf(last[last.length - 1]) === WEEK_ORDER.indexOf(d) - 1) last.push(d); else runs.push([d])
  }
  return runs.map((r) => (r.length >= 3 ? `${DAY_NAMES[r[0]]}–${DAY_NAMES[r[r.length - 1]]}` : r.map((d) => DAY_NAMES[d]).join(', '))).join(', ')
}

/* -------------------------------------------------------------------- seed ---- */

const seedSchedule = (n: number, storeCode: string, runs: [string, string][], days: number[], instructions: string): PickupSchedule => ({
  id: `sch-${n}`, code: `SCH-${String(n).padStart(4, '0')}`, storeCode,
  hubCode: inboundHubFor(STORES.find((s) => s.code === storeCode)?.party ?? STORES[0].party),
  days, runs: runs.map(([a, b], i) => ({ id: `seed${n}${i}`, start: a, end: b, serviceTimeMin: 10, vehicleType: '' })),
  effectiveFrom: '2026-10-01', effectiveTo: '', status: 'Paused', instructions, updatedAt: '2026-10-01T08:00:00.000Z',
})
const seed = (): ScheduleState => ({
  /* two demo rosters, PAUSED so nothing in the seeded demo moves until someone resumes one: a two-run weekday milk run and a
     single Mon–Sat collection */
  schedules: [
    seedSchedule(1, 'MNL-01', [['09:00', '12:00'], ['15:00', '17:00']], [1, 2, 3, 4, 5], 'Dock 2 at the rear gate — ask for the warehouse lead.'),
    seedSchedule(2, 'CEB-01', [['10:00', '12:00']], [1, 2, 3, 4, 5, 6], ''),
  ],
  horizonDays: 2, lastRun: null, lastDailyDate: '', audit: [],
})

function normalize(raw: unknown): ScheduleState | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  if (!Array.isArray(r.schedules)) return null
  const schedules = r.schedules.flatMap((x): PickupSchedule[] => {
    if (!x || typeof x !== 'object') return []
    const s = x as Partial<PickupSchedule>
    if (!s.id || !s.code || !s.storeCode) return []
    const runs = (Array.isArray(s.runs) ? s.runs : []).filter((q): q is ScheduleRun => !!q && HHMM.test(q.start) && HHMM.test(q.end))
      .map((q) => ({ id: q.id || newRunId(), start: q.start, end: q.end, serviceTimeMin: Number(q.serviceTimeMin) || 0, vehicleType: q.vehicleType ?? '' }))
    return [{
      id: s.id, code: s.code, storeCode: s.storeCode, hubCode: s.hubCode ?? '',
      days: (Array.isArray(s.days) ? s.days : []).filter((d): d is number => Number.isInteger(d) && d >= 0 && d <= 6),
      runs, effectiveFrom: DATE.test(s.effectiveFrom ?? '') ? s.effectiveFrom! : '', effectiveTo: DATE.test(s.effectiveTo ?? '') ? s.effectiveTo! : '',
      status: s.status === 'Paused' ? 'Paused' : 'Active', instructions: s.instructions ?? '', updatedAt: s.updatedAt ?? new Date(0).toISOString(),
    }]
  })
  const last = r.lastRun && typeof r.lastRun === 'object' ? (r.lastRun as GeneratorRun) : null
  return {
    schedules, horizonDays: Math.min(14, Math.max(1, Math.round(Number(r.horizonDays) || 2))), lastRun: last,
    lastDailyDate: typeof r.lastDailyDate === 'string' ? r.lastDailyDate : '',
    audit: Array.isArray(r.audit) ? (r.audit as ScheduleAudit[]).slice(0, 200) : [],
  }
}

export const scheduleStore = createLocalStore<ScheduleState>(SCHEDULES_KEY, seed, normalize)
export const useSchedules = () => scheduleStore.use()

/* ------------------------------------------------------------- validation ---- */

/** Does the location have an address a driver can find? (stands in for "a geocode", FR-01.6) */
export const locatable = (s: StoreLocation | undefined): boolean => !!s && !!s.party.line1?.trim() && !!s.party.city?.trim() && !!s.party.postalCode?.trim()

/**
 * What the form refuses at save, in words a person can act on (empty = fine). `all` is the other schedules, so two
 * schedules of one location cannot collect it at the same time of day.
 */
export function validateSchedule(s: PickupSchedule, store: StoreLocation | undefined, all: PickupSchedule[]): string[] {
  const out: string[] = []
  if (!store) return ['Pick the merchant location.']
  if (!locatable(store)) out.push('This location has no complete address — add a street, city and postal code first.')
  if (!s.days.length) out.push('Pick at least one day.')
  if (!s.runs.length) out.push('Add at least one run.')
  if (!DATE.test(s.effectiveFrom)) out.push('Set the date it starts.')
  if (s.effectiveTo && DATE.test(s.effectiveFrom) && s.effectiveTo < s.effectiveFrom) out.push('It cannot end before it starts.')
  const bad = s.runs.some((r) => !HHMM.test(r.start) || !HHMM.test(r.end) || mins(r.end) <= mins(r.start))
  if (bad) out.push('Every run needs a start time before its end time.')
  /* the run sits inside the location's operating hours on every selected day (FR-01.4) */
  if (!bad && s.days.length) {
    const policy = pickupPolicy(null, { pickupLocationCode: s.storeCode, hubCode: s.hubCode || null })
    const closed: string[] = []
    const outside: string[] = []
    for (const d of s.days) {
      if (!policy.businessDays.includes(d)) { closed.push(DAY_NAMES[d]); continue }
      const h = policy.hours?.[d]
      if (h && s.runs.some((r) => mins(r.start) < mins(h.open) || mins(r.end) > mins(h.close))) outside.push(`${DAY_NAMES[d]} ${h.open}–${h.close}`)
    }
    if (closed.length) out.push(`The location or its hub is closed on ${closed.join(', ')}.`)
    if (outside.length) out.push(`A run is outside the opening hours (${outside.join('; ')}).`)
  }
  /* overlapping runs are allowed only when they need different vehicles (FR-04.2) */
  const runs = [...s.runs].filter((r) => HHMM.test(r.start) && HHMM.test(r.end)).sort((a, b) => mins(a.start) - mins(b.start))
  for (let i = 0; i < runs.length; i++) for (let j = i + 1; j < runs.length; j++) {
    const overlap = mins(runs[j].start) < mins(runs[i].end)
    if (overlap && (runs[i].vehicleType || '') === (runs[j].vehicleType || '')) {
      out.push(`Runs ${runLabel(runs[i])} and ${runLabel(runs[j])} overlap — give them different vehicle types, or move one.`)
    }
  }
  /* one active roster per location and day-time: another schedule of this location may not share a day with an overlapping run */
  for (const o of all) {
    if (o.id === s.id || o.storeCode !== s.storeCode || o.status !== 'Active' || s.status !== 'Active') continue
    const sameDay = o.days.some((d) => s.days.includes(d))
    const clash = o.runs.some((a) => s.runs.some((b) => mins(a.start) < mins(b.end) && mins(b.start) < mins(a.end) && (a.vehicleType || '') === (b.vehicleType || '')))
    if (sameDay && clash) out.push(`${o.code} already collects this location at an overlapping time on the same day.`)
  }
  return out
}

/* ---------------------------------------------------------------- the key ---- */

/** schedule + run + date — the unique key of a roster request (FR-03.3) */
export const scheduleKey = (id: string, runId: string, date: string) => `${id}|${runId}|${date}`
export const keyOfPr = (p: GrowPickupRequest) => (p.schedule ? scheduleKey(p.schedule.id, p.schedule.runId, p.schedule.date) : null)

/** The schedules in force for a location today (Active, inside their dates). */
export function activeSchedulesAt(state: ScheduleState, storeCode: string, date: string): PickupSchedule[] {
  return state.schedules.filter((s) => s.storeCode === storeCode && s.status === 'Active' && s.effectiveFrom <= date && (!s.effectiveTo || s.effectiveTo >= date))
}
/** Does this location have ANY active roster (so its waybills go to a run, not to a manual booking)? */
export const hasActiveSchedule = (storeCode: string, date = ymd(new Date())): boolean => activeSchedulesAt(scheduleStore.get(), storeCode, date).length > 0

export const refOf = (s: PickupSchedule, r: ScheduleRun, date: string): PickupScheduleRef => ({ id: s.id, code: s.code, runId: r.id, runLabel: runLabel(r), date })

/* ------------------------------------------------- which run a waybill joins ---- */

/** the states a roster request can still take a waybill in — before the driver is at the pickup (FR-05.3) */
const JOINABLE = new Set(['Requested', 'Planned', 'Ready For Last Mile Dispatch', 'Assigned'])

/**
 * The run a waybill / consignment ready at `readyAt` joins at its location (FR-05.2, FR-05.3):
 *  1. the run whose window holds the ready time;
 *  2. else the earliest run still ahead (not yet at the pickup);
 *  3. else — every run of that day has begun or ended — the next operating day's first run.
 * A request whose driver has already reached the pickup never takes a late waybill. null = no open run.
 */
export function pickRunPr(prs: GrowPickupRequest[], storeCode: string, readyAt: Date): GrowPickupRequest | null {
  const ready = `${ymd(readyAt)}T${pad(readyAt.getHours())}:${pad(readyAt.getMinutes())}`
  const open = prs.filter((p) => p.schedule && p.storeCode === storeCode && JOINABLE.has(p.status) && p.endAt > ready)
    .sort((a, b) => a.startAt.localeCompare(b.startAt))
  return open.find((p) => p.startAt <= ready && ready <= p.endAt) ?? open.find((p) => p.startAt > ready) ?? null
}

/** Roster requests of an EARLIER day that nobody assigned by its end — closed at 23:59 (FR-08.4). */
export const staleScheduleRequests = (prs: GrowPickupRequest[], today: string): GrowPickupRequest[] =>
  prs.filter((p) => p.schedule && p.date < today && p.status === 'Requested' && !p.tripId)

export { dayOf }
