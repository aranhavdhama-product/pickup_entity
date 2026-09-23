/**
 * Pure date-time helpers for the Grow merchant portal's DateTimePicker.
 *
 * Everything here speaks the same value the portal already stores and the
 * native `<input type="datetime-local">` speaks: a LOCAL wall-clock string
 * `YYYY-MM-DDTHH:mm` (see `tabs.ts`). Never a UTC instant, never a `Date` in a
 * prop. The merchant-facing spelling is `DD/MM/YYYY HH:mm`.
 *
 * Zero imports on purpose: these functions are the picker's whole brain, so
 * they can be exercised by a plain node script without pulling in React or the
 * order store. Nothing here touches the DOM or allocates state.
 */

/* ------------------------------------------------------------- constants ---- */

/** Calendar header, Monday first — the portal's locale (en-PH) starts weeks on Monday. */
export const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'] as const

export const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const

/** Half an hour — the pickup grid the network books against. */
export const DEFAULT_STEP_MINUTES = 30

/** The time a day gets when it is picked on a date that isn't today. */
export const DEFAULT_TIME = '09:00'

const MINUTES_PER_DAY = 24 * 60

const pad = (n: number) => String(n).padStart(2, '0')

/* ----------------------------------------------------------- parse/format ---- */

/** A local `Date` → `YYYY-MM-DDTHH:mm`. Seconds and the zone are dropped. */
export const localIso = (d: Date): string =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`

/** A local `Date` → `YYYY-MM-DD`. */
export const localDay = (d: Date): string =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

/** `YYYY-MM-DDTHH:mm` → `YYYY-MM-DD` (`''` when there is no value). */
export const datePart = (at: string): string => (at || '').slice(0, 10)

/** `YYYY-MM-DDTHH:mm` → `HH:mm` (`''` when there is no time). */
export const timePart = (at: string): string => (at || '').slice(11, 16)

/** `YYYY-MM-DD` + `HH:mm` → `YYYY-MM-DDTHH:mm`. */
export const joinAt = (day: string, time: string): string => (day ? `${day}T${time || '00:00'}` : '')

/**
 * Is this a well-formed local ISO value AND a real calendar date? Guards the
 * round-trip: `2026-02-30T09:00` is well-shaped but does not exist.
 */
export function isValidAt(at: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(at || '')) return false
  const [y, m, d] = at.slice(0, 10).split('-').map(Number)
  const hh = Number(at.slice(11, 13))
  const mm = Number(at.slice(14, 16))
  if (m < 1 || m > 12 || d < 1 || d > daysInMonth(y, m - 1)) return false
  return hh <= 23 && mm <= 59
}

/**
 * `YYYY-MM-DDTHH:mm` → a LOCAL `Date`, or `null` when the value is unusable.
 * Built component-wise: `new Date('2026-02-01')` would be parsed as UTC and
 * land on the previous day west of Greenwich.
 */
export function toDate(at: string): Date | null {
  if (!isValidAt(at)) return null
  const [y, m, d] = at.slice(0, 10).split('-').map(Number)
  return new Date(y, m - 1, d, Number(at.slice(11, 13)), Number(at.slice(14, 16)), 0, 0)
}

/** `YYYY-MM-DDTHH:mm` → `DD/MM/YYYY HH:mm`; anything unusable → `''`. */
export function formatDisplay(at: string): string {
  if (!isValidAt(at)) return ''
  return `${at.slice(8, 10)}/${at.slice(5, 7)}/${at.slice(0, 4)} ${at.slice(11, 16)}`
}

/** `YYYY-MM-DD` → `DD/MM/YYYY`; anything else → `''`. */
export const formatDay = (day: string): string =>
  /^\d{4}-\d{2}-\d{2}$/.test(day || '') ? `${day.slice(8, 10)}/${day.slice(5, 7)}/${day.slice(0, 4)}` : ''

/**
 * What the merchant typed → `YYYY-MM-DDTHH:mm`, or `null` when it isn't a real
 * date-time. Deliberately forgiving about separators and padding so that
 * `1/2/2026 9:05`, `01-02-2026 09:05` and `01.02.2026  09:05` all land, while
 * `31/02/2026` (no such day) and `01/02/2026 25:00` do not.
 */
export function parseDisplay(text: string): string | null {
  const m = /^(\d{1,2})[/\-. ](\d{1,2})[/\-. ](\d{4})(?:[ ,T]+(\d{1,2}):(\d{2}))?$/.exec((text || '').trim())
  if (!m) return null
  const [, d, mo, y, hh = '00', mm = '00'] = m
  const at = `${y}-${pad(Number(mo))}-${pad(Number(d))}T${pad(Number(hh))}:${mm}`
  return isValidAt(at) ? at : null
}

/* -------------------------------------------------------------- compare ---- */

/**
 * Chronological order of two local ISO values — as a STRING compare, which is
 * exact for this zero-padded format and immune to DST. `''` sorts before
 * everything, which is why callers must check for it before using the result.
 */
export const cmpAt = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)

/** `at` is inside `[min, max]`; an empty bound means "no bound". */
export const withinBounds = (at: string, min?: string, max?: string): boolean =>
  !at || ((!min || at >= min) && (!max || at <= max))

/** `at` pulled into `[min, max]`. Bounds are applied low-then-high. */
export function clampAt(at: string, min?: string, max?: string): string {
  if (!at) return at
  let v = at
  if (min && v < min) v = min
  if (max && v > max) v = max
  return v
}

/**
 * Is this whole CALENDAR DAY out of range? Compared on the date part only:
 * with `min = 2026-02-10T14:00`, Feb 10 is still selectable — it is the TIMES
 * before 14:00 on it that are disabled, which `timeDisabled` handles.
 */
export function dayDisabled(day: string, min?: string, max?: string): boolean {
  if (!day) return false
  if (min && day < datePart(min)) return true
  if (max && day > datePart(max)) return true
  return false
}

/** Is `HH:mm` on `day` out of range? The boundary-day companion to `dayDisabled`. */
export const timeDisabled = (day: string, time: string, min?: string, max?: string): boolean =>
  !withinBounds(joinAt(day, time), min, max)

/* --------------------------------------------------------------- rounding ---- */

/** Minutes since midnight for `HH:mm`; `-1` when it isn't a time. */
export function minutesOf(time: string): number {
  if (!/^\d{1,2}:\d{2}$/.test(time || '')) return -1
  const [h, m] = time.split(':').map(Number)
  return h > 23 || m > 59 ? -1 : h * 60 + m
}

/** Minutes since midnight → `HH:mm`, wrapping any day overflow away. */
export const timeOf = (mins: number): string => {
  const m = ((mins % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`
}

/** `at` shifted by whole minutes, rolling the date over as needed. */
export function addMinutes(at: string, mins: number): string {
  const d = toDate(at)
  if (!d) return at
  d.setMinutes(d.getMinutes() + mins)
  return localIso(d)
}

/**
 * The three ways to snap a value onto a `step`-minute grid. All roll the DATE
 * over when they need to — `23:45` ceils to `00:00` the NEXT day, which naive
 * `HH:mm` arithmetic silently turns into midnight of the same day.
 *
 * - `floorToStep`  — the grid slot at or before `at`
 * - `ceilToStep`   — the grid slot at or after `at` (`10:30` stays `10:30`)
 * - `roundToStep`  — the nearest slot, ties going up
 */
const snap = (at: string, step: number, pick: (q: number) => number): string => {
  const d = toDate(at)
  if (!d || step <= 0) return at
  const base = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0)
  const mins = d.getHours() * 60 + d.getMinutes()
  base.setMinutes(pick(mins / step) * step)
  return localIso(base)
}

export const floorToStep = (at: string, step = DEFAULT_STEP_MINUTES): string => snap(at, step, Math.floor)
export const ceilToStep = (at: string, step = DEFAULT_STEP_MINUTES): string => snap(at, step, Math.ceil)
export const roundToStep = (at: string, step = DEFAULT_STEP_MINUTES): string => snap(at, step, Math.round)

/**
 * The first grid slot STRICTLY after `now` — the earliest time a merchant may
 * pick when "now" itself is already taken. Mirrors `nextHalfHourAt` in tabs.ts,
 * so `10:30` advances to `11:00` rather than standing still.
 */
export function nextStepAt(now: Date = new Date(), step = DEFAULT_STEP_MINUTES): string {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes(), 0, 0)
  d.setMinutes(Math.floor(d.getMinutes() / step) * step + step)
  return localIso(d)
}

/**
 * The time a freshly-picked day should default to, before any clamping:
 * the next free slot when the day is today, otherwise 09:00. A "today" whose
 * next slot has already rolled into tomorrow falls back to 09:00 too, rather
 * than handing back a midnight that is in the past.
 */
export function defaultTimeFor(day: string, now: Date = new Date(), step = DEFAULT_STEP_MINUTES): string {
  if (day !== localDay(now)) return DEFAULT_TIME
  const next = nextStepAt(now, step)
  return datePart(next) === day ? timePart(next) : DEFAULT_TIME
}

/** Every hour label the time column offers. */
export const hourOptions = (): string[] => Array.from({ length: 24 }, (_, h) => pad(h))

/** Every minute label at this step: 30 → `['00','30']`, 15 → `['00','15','30','45']`. */
export const minuteOptions = (step = DEFAULT_STEP_MINUTES): string[] => {
  const s = step > 0 && step < 60 ? step : 60
  return Array.from({ length: Math.ceil(60 / s) }, (_, i) => pad(i * s))
}

/* ----------------------------------------------------------- month grid ---- */

/** Days in a month. `month` is 0-based, as on `Date`. */
export const daysInMonth = (year: number, month: number): number => new Date(year, month + 1, 0).getDate()

/** `Date#getDay` (0 = Sunday) → a Monday-first column index (0 = Monday, 6 = Sunday). */
export const mondayIndex = (d: Date): number => (d.getDay() + 6) % 7

export interface MonthGrid {
  year: number
  /** 0-based, as on `Date`. */
  month: number
  /** 'February 2026'. */
  label: string
  /** Column (0 = Monday) the 1st falls in — also the count of leading blanks. */
  offset: number
  /** Whole weeks: `YYYY-MM-DD` for a day in this month, `null` for padding. */
  cells: (string | null)[]
}

/**
 * The calendar page for one month, padded with nulls to whole Monday-first
 * weeks. February 2026 starts on a Sunday, so it is the worst case: 6 leading
 * blanks + 28 days = 34, padded to 35 — five rows, not a tidy four.
 */
export function monthGrid(year: number, month: number): MonthGrid {
  const first = new Date(year, month, 1)
  const offset = mondayIndex(first)
  const total = daysInMonth(year, month)
  const cells: (string | null)[] = Array.from({ length: offset }, () => null)
  for (let d = 1; d <= total; d += 1) cells.push(`${year}-${pad(month + 1)}-${pad(d)}`)
  while (cells.length % 7 !== 0) cells.push(null)
  return { year, month, label: `${MONTHS[month]} ${year}`, offset, cells }
}

/** The month `delta` months away — normalised across the year boundary. */
export function shiftMonth(year: number, month: number, delta: number): { year: number; month: number } {
  const d = new Date(year, month + delta, 1)
  return { year: d.getFullYear(), month: d.getMonth() }
}

/** `YYYY-MM-DD` shifted by whole days (the calendar's arrow keys). */
export function addDays(day: string, n: number): string {
  const [y, m, d] = (day || '').split('-').map(Number)
  if (!y || !m || !d) return day
  return localDay(new Date(y, m - 1, d + n))
}

/** Is the whole month before `min` / after `max`? Greys out the prev/next arrows. */
export const monthDisabled = (year: number, month: number, min?: string, max?: string): boolean => {
  const last = `${year}-${pad(month + 1)}-${pad(daysInMonth(year, month))}`
  const first = `${year}-${pad(month + 1)}-01`
  return !!((min && last < datePart(min)) || (max && first > datePart(max)))
}
