/**
 * Pickup operating calendar — WHICH days (and hours) a pickup may be booked on
 * (owner, 2026-09-25: "next days come from hub operational days; merchant
 * location preference if available, else the hub's holiday master").
 *
 * Two FarEye sources, both modelled as staging stores them
 * (docs/superpowers/research/2026-09-25-staging-holiday-master.md):
 *  - the MERCHANT preference = the pickup address's Location Master
 *    `operating_hours` (`MasterLocation.operatingDays`, mapped in masters.ts);
 *  - the HUB calendar = the drop hub's Holiday Master policy (`holidayMasterCode`
 *    on the hub): weekly offs (→ operating days), working hours and the annual
 *    holiday list. A hub with no mapping takes the Company Default policy.
 *
 * `pickupDaysSource` (config/pickupModule.ts) picks between them; hub holidays
 * block in every source — the hub cannot receive on its holiday —
 * and a merchant preference is intersected with the hub's operating days.
 *
 * Pure: no React, no fetch, no src/auth. Reads the Holiday Master rows persisted
 * by LocalSettings/ServiceOrderMasters.tsx (by key string — it never imports
 * mastersTree) and the Grow masters cache, both cached by their raw string.
 * Imports only config + hubs, so masters.ts / pickupSlots.ts may import it.
 */
import type { PickupDaysSource, PickupModuleConfig } from '../config/pickupModule'
import { hubName, INBOUND_HUBS } from './hubs'

/* ------------------------------------------------------------- model ---- */

export interface DayHours { open: string; close: string }   // 'HH:mm'
export interface OperatingDays {
  /** 0 = Sunday … 6 = Saturday */
  days: number[]
  hours?: Partial<Record<number, DayHours>>
}
export interface Holiday { date: string /* YYYY-MM-DD */; name: string; sample?: boolean }
/** A Holiday Master policy, staging-shaped. */
export interface HolidayCalendar {
  code: string
  name: string
  year: number
  workingHours: DayHours
  /** weekly offs, 0–6 */
  weeklyOffs: number[]
  holidays: Holiday[]
  companyDefault?: boolean
}

export interface PickupCalendar {
  days: number[]
  hours?: Partial<Record<number, DayHours>>
  /** date → holiday name */
  holidays: Record<string, string>
  source: 'merchant' | 'hub'
  /** 'Pickup days follow the merchant location · Manila Pasay Hub (Mon–Fri)' */
  sourceLabel: string
}

export interface PickupWhere { merchantCode?: string | null; pickupLocationCode?: string | null; hubCode?: string | null }

export const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MODULE_DAYS = [1, 2, 3, 4, 5, 6]

/* -------------------------------------------------------------- seed ---- */

const PH = 'PH-2026', US = 'US-2026'

/** Seed Holiday Master policies. Real 2026 dates; the one `sample` row exists so the
 *  demo shows a greyed holiday inside the booking horizon (no real PH/US national
 *  holiday falls 26 Sep – 2 Oct 2026). */
export const SEED_HOLIDAY_CALENDARS: HolidayCalendar[] = [
  { code: PH, name: 'Philippines 2026', year: 2026, workingHours: { open: '08:00', close: '18:00' }, weeklyOffs: [0], companyDefault: true,
    holidays: [
      { date: '2026-01-01', name: "New Year's Day" },
      { date: '2026-04-02', name: 'Maundy Thursday' },
      { date: '2026-04-03', name: 'Good Friday' },
      { date: '2026-04-09', name: 'Araw ng Kagitingan' },
      { date: '2026-05-01', name: 'Labor Day' },
      { date: '2026-06-12', name: 'Independence Day' },
      { date: '2026-08-21', name: 'Ninoy Aquino Day' },
      { date: '2026-08-31', name: 'National Heroes Day' },
      { date: '2026-09-26', name: 'Regional holiday (sample)', sample: true },
      { date: '2026-11-01', name: "All Saints' Day" },
      { date: '2026-11-02', name: "All Souls' Day" },
      { date: '2026-11-30', name: 'Bonifacio Day' },
      { date: '2026-12-08', name: 'Feast of the Immaculate Conception' },
      { date: '2026-12-24', name: 'Christmas Eve' },
      { date: '2026-12-25', name: 'Christmas Day' },
      { date: '2026-12-30', name: 'Rizal Day' },
      { date: '2026-12-31', name: "New Year's Eve" },
    ] },
  { code: US, name: 'United States 2026', year: 2026, workingHours: { open: '08:00', close: '17:00' }, weeklyOffs: [0, 6],
    holidays: [
      { date: '2026-01-01', name: "New Year's Day" },
      { date: '2026-01-19', name: 'Martin Luther King Jr. Day' },
      { date: '2026-02-16', name: "Presidents' Day" },
      { date: '2026-05-25', name: 'Memorial Day' },
      { date: '2026-06-19', name: 'Juneteenth' },
      { date: '2026-07-03', name: 'Independence Day (observed)' },
      { date: '2026-09-07', name: 'Labor Day' },
      { date: '2026-10-12', name: 'Columbus Day' },
      { date: '2026-11-11', name: 'Veterans Day' },
      { date: '2026-11-26', name: 'Thanksgiving Day' },
      { date: '2026-12-25', name: 'Christmas Day' },
    ] },
]

/** Hub → Holiday Master (the hub's `holidayMasterCode`) — every INBOUND_HUBS entry. */
export const HUB_HOLIDAY_MASTER: Record<string, string> = {
  'MNL-01': PH, 'CEB-01': PH, SANPABLO: PH, ORD: US, CHICAGO: US,
}

const weekdays = (open: string, close: string, days: number[]): OperatingDays =>
  ({ days, hours: Object.fromEntries(days.map((d) => [d, { open, close }])) })

/** Sample merchant-location preferences (the Location Master's operating-hours grid).
 *  CEB-01 / ORD / NYC have none → the hub calendar. */
export const SAMPLE_LOCATION_OPERATING_DAYS: Record<string, OperatingDays> = {
  'MNL-01': weekdays('09:00', '17:00', [1, 2, 3, 4, 5]),
  SANPABLO: weekdays('08:00', '18:00', [1, 2, 3, 4, 5, 6]),
  'SAPUTO-CHI': weekdays('07:00', '15:00', [1, 2, 3, 4, 5]),
}

/** names for the sample preferences when the masters cache has not been written yet */
const SAMPLE_LOCATION_NAMES: Record<string, string> = {
  'MNL-01': 'Manila Pasay Hub', SANPABLO: 'San Pablo Hub', 'SAPUTO-CHI': 'Saputo Cheese USA Inc.',
}

/* --------------------------------------------- persisted master rows ---- */

/** ServiceOrderMasters persistence (sub ids + version) — mastersTree's Holiday Master tabs. */
export const HOLIDAY_MASTER_KEY_VERSION = 2
export const HOLIDAY_POLICY_SUB = 'holiday-policies'
export const HOLIDAY_DATES_SUB = 'holiday-dates'
const POLICY_KEY = `local-masters-service_order-${HOLIDAY_POLICY_SUB}-v${HOLIDAY_MASTER_KEY_VERSION}`
const DATES_KEY = `local-masters-service_order-${HOLIDAY_DATES_SUB}-v${HOLIDAY_MASTER_KEY_VERSION}`

type Row = Record<string, unknown>
const s = (v: unknown) => String(v ?? '').trim()
const inactive = (r: Row) => /(deactiv|disabl|inactive)/i.test(s(r.status))

/** 'Saturday, Sunday' | 'Sat, Sun' | 'None' → [6, 0] */
export function parseWeeklyOffs(v: unknown): number[] {
  return [...new Set(s(v).split(/[,/·;]+/).map((x) => x.trim().slice(0, 3).toLowerCase())
    .map((x) => DOW.findIndex((d) => d.toLowerCase() === x)).filter((i) => i >= 0))].sort()
}
export const weeklyOffsLabel = (offs: number[]): string =>
  offs.length ? [...offs].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)).map((d) => DAY_NAMES[d]).join(', ') : 'None'

const HHMM = /^([01]?\d|2[0-3]):[0-5]\d$/
const pad = (n: number) => String(n).padStart(2, '0')
/** '9:00' / '09:00 AM' / '6:00 PM' → 'HH:mm', else '' */
function toHHMM(v: unknown): string {
  const m = /^(\d{1,2}):(\d{2})\s*(am|pm)?$/i.exec(s(v))
  if (!m) return ''
  let h = Number(m[1]); const ap = m[3]?.toLowerCase()
  if (ap === 'pm' && h < 12) h += 12
  if (ap === 'am' && h === 12) h = 0
  const t = `${pad(h)}:${m[2]}`
  return HHMM.test(t) ? t : ''
}
/** 'YYYY-MM-DD' | 'DD/MM/YYYY' | '12 Oct 2026' → 'YYYY-MM-DD', else '' */
export function toYmd(v: unknown): string {
  const t = s(v)
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t
  const dm = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(t)
  if (dm) return `${dm[3]}-${pad(Number(dm[2]))}-${pad(Number(dm[1]))}`
  const d = new Date(t)
  return t && !isNaN(d.getTime()) ? `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` : ''
}

/** Seed → the Holiday Policies tab rows. */
export const HOLIDAY_POLICY_ROWS = SEED_HOLIDAY_CALENDARS.map((c) => ({
  id: `HM-${c.code}`, title: c.name, code: c.code, year: String(c.year),
  startTime: c.workingHours.open, endTime: c.workingHours.close,
  weeklyOffs: weeklyOffsLabel(c.weeklyOffs), companyDefault: c.companyDefault ? 'Yes' : 'No',
  hubs: Object.entries(HUB_HOLIDAY_MASTER).filter(([, v]) => v === c.code).map(([h]) => h).join(', '),
  status: 'Active',
}))
/** Seed → the Holidays tab rows. */
export const HOLIDAY_DATE_ROWS = SEED_HOLIDAY_CALENDARS.flatMap((c) => c.holidays.map((h, i) => ({
  id: `HD-${c.code}-${i + 1}`, policy: c.code, name: h.name, date: h.date, status: 'Active',
})))

const memo = new Map<string, { raw: string | null; value: unknown }>()
function readRows(key: string): Row[] | null {
  let raw: string | null = null
  try { raw = typeof localStorage === 'undefined' ? null : localStorage.getItem(key) } catch { raw = null }
  const hit = memo.get(key)
  if (hit && hit.raw === raw) return hit.value as Row[] | null
  let value: Row[] | null = null
  try {
    const rows = raw ? (JSON.parse(raw) as { rows?: unknown })?.rows : null
    value = Array.isArray(rows) ? rows.filter((r): r is Row => !!r && typeof r === 'object') : null
  } catch { value = null }
  memo.set(key, { raw, value })
  return value
}

let calMemo: { p: Row[] | null; d: Row[] | null; value: HolidayCalendar[] } | null = null
/** The Holiday Master as stored (the local page's edits), else the seed. */
export function holidayCalendars(): HolidayCalendar[] {
  const p = readRows(POLICY_KEY), d = readRows(DATES_KEY)
  if (calMemo && calMemo.p === p && calMemo.d === d) return calMemo.value
  const policies = (p ?? HOLIDAY_POLICY_ROWS as Row[]).filter((r) => !inactive(r) && s(r.code))
  const dates = (d ?? HOLIDAY_DATE_ROWS as Row[]).filter((r) => !inactive(r))
  const value = policies.map((r): HolidayCalendar => {
    const code = s(r.code)
    return {
      code, name: s(r.title) || code, year: Number(r.year) || 2026,
      workingHours: { open: toHHMM(r.startTime) || '08:00', close: toHHMM(r.endTime) || '18:00' },
      weeklyOffs: parseWeeklyOffs(r.weeklyOffs),
      companyDefault: /^(yes|true)$/i.test(s(r.companyDefault)),
      holidays: dates.filter((h) => s(h.policy).toLowerCase() === code.toLowerCase())
        .map((h) => ({ date: toYmd(h.date), name: s(h.name) || 'Holiday' })).filter((h) => h.date),
    }
  })
  calMemo = { p, d, value }
  return value
}

/** The hub's policy: its `holidayMasterCode`, else the Company Default, else the first. */
export function hubHolidayCalendar(hubCode?: string | null): HolidayCalendar | null {
  const all = holidayCalendars()
  const code = hubCode ? HUB_HOLIDAY_MASTER[hubCode] : undefined
  return all.find((c) => c.code === code) ?? all.find((c) => c.companyDefault) ?? all[0] ?? null
}

/** A hub's operating days, DERIVED from its holiday policy (the complement of its weekly offs). */
export function hubOperatingDays(hubCode?: string | null): OperatingDays {
  const cal = hubHolidayCalendar(hubCode)
  if (!cal) return { days: MODULE_DAYS }
  const days = [0, 1, 2, 3, 4, 5, 6].filter((d) => !cal.weeklyOffs.includes(d))
  return { days, hours: Object.fromEntries(days.map((d) => [d, cal.workingHours])) }
}
/** Every inbound hub's operating days (derived — see hubOperatingDays). */
export const HUB_OPERATING_DAYS = (): Record<string, OperatingDays> =>
  Object.fromEntries(INBOUND_HUBS.map((h) => [h.code, hubOperatingDays(h.code)]))

/* ------------------------------------------ merchant location preference ---- */

const MASTERS_CACHE_KEY = 'grow-masters-cache-v4'
let locMemo: { raw: string | null; map: Map<string, { name: string; op?: OperatingDays }> } | null = null
function cachedLocations(): Map<string, { name: string; op?: OperatingDays }> {
  let raw: string | null = null
  try { raw = typeof localStorage === 'undefined' ? null : localStorage.getItem(MASTERS_CACHE_KEY) } catch { raw = null }
  if (locMemo && locMemo.raw === raw) return locMemo.map
  const map = new Map<string, { name: string; op?: OperatingDays }>()
  try {
    const locs = raw ? (JSON.parse(raw) as { locations?: unknown })?.locations : null
    if (Array.isArray(locs)) for (const l of locs as Row[]) {
      const op = l.operatingDays as OperatingDays | undefined
      map.set(s(l.code), { name: s(l.name), op: op && Array.isArray(op.days) && op.days.length ? op : undefined })
    }
  } catch { /* a malformed cache = no live preferences */ }
  locMemo = { raw, map }
  return map
}

/** The pickup address's Location Master operating days, or null (no preference). */
export function locationOperatingDays(code?: string | null): OperatingDays | null {
  if (!code) return null
  return cachedLocations().get(code)?.op ?? SAMPLE_LOCATION_OPERATING_DAYS[code] ?? null
}

/** `business_unit_location.operating_hours` → OperatingDays (primary window per serviceable day). */
export function operatingDaysFromHours(v: unknown): OperatingDays | undefined {
  if (!Array.isArray(v) || !v.length) return undefined
  const hours: Partial<Record<number, DayHours>> = {}
  const days = new Set<number>()
  for (const e of v as Row[]) {
    const d = DAY_NAMES.findIndex((n) => n.toLowerCase() === s(e.day).toLowerCase())
    if (d < 0 || e.serviceable === false) continue
    const open = toHHMM(e.open_time), close = toHHMM(e.close_time)
    days.add(d)
    if (open && close && (e.is_primary !== false || !hours[d])) hours[d] = { open, close }
  }
  return days.size ? { days: [...days].sort(), hours } : undefined
}

/* ------------------------------------------------------------ resolve ---- */

/** 'Mon–Sat', 'Mon–Fri', or the list. */
export function daysLabel(days: number[]): string {
  const d = [...new Set(days)].sort()
  if (!d.length) return 'no days'
  const contiguous = d.every((x, i) => i === 0 || x === d[i - 1] + 1)
  return contiguous && d.length > 2 ? `${DOW[d[0]]}–${DOW[d[d.length - 1]]}` : d.map((x) => DOW[x]).join(', ')
}
const hoursLabel = (h?: Partial<Record<number, DayHours>>): string => {
  const w = Object.values(h ?? {}).filter(Boolean) as DayHours[]
  return w.length && w.every((x) => x.open === w[0].open && x.close === w[0].close) ? ` ${w[0].open}–${w[0].close}` : ''
}
const holidayTag = (cal: HolidayCalendar | null) =>
  cal ? `, ${cal.code.replace(/-\d{4}$/, '')} holidays` : ''

/**
 * The calendar a booking at (pickup location → drop hub) follows, per the
 * module's `pickupDaysSource`.
 */
export function pickupCalendarFor(where: PickupWhere, cfg: Pick<PickupModuleConfig, 'pickupDaysSource' | 'autoPickup'>): PickupCalendar {
  const source: PickupDaysSource = cfg.pickupDaysSource ?? 'merchant-then-hub'
  const cal = hubHolidayCalendar(where.hubCode)
  const holidays: Record<string, string> = Object.fromEntries((cal?.holidays ?? []).map((h) => [h.date, h.name]))
  const pref = source === 'merchant-then-hub' ? locationOperatingDays(where.pickupLocationCode) : null
  if (pref) {
    const code = where.pickupLocationCode ?? ''
    const name = cachedLocations().get(code)?.name || SAMPLE_LOCATION_NAMES[code] || code || 'the pickup address'
    /* the hub cannot receive on its weekly off either: merchant days ∩ hub operating days;
       hours from the merchant preference, holidays from the hub */
    const hubDays = hubOperatingDays(where.hubCode).days
    const days = pref.days.filter((d) => hubDays.includes(d))
    const hours = pref.hours ? Object.fromEntries(Object.entries(pref.hours).filter(([d]) => days.includes(Number(d)))) : undefined
    return { days, hours, holidays, source: 'merchant',
      sourceLabel: `Pickup days follow the merchant location · ${name} (${daysLabel(days)}${hoursLabel(hours)}, hub holidays)` }
  }
  const op = hubOperatingDays(where.hubCode)
  const hub = where.hubCode ? hubName(where.hubCode) : (cal?.name ?? 'the company default')
  return { days: op.days, hours: op.hours, holidays, source: 'hub',
    sourceLabel: `Pickup days follow the hub calendar · ${hub} (${daysLabel(op.days)}${holidayTag(cal)})` }
}
