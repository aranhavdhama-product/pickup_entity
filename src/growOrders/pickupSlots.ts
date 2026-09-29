/**
 * Pickup booking rules — which windows a booking may take, and why not.
 *
 * Pure date math over a POLICY: the pickup module config (optionally with one
 * merchant's overrides folded in) normalised into the few fields these rules
 * read. Every read tolerates a missing or malformed key and falls back to a
 * default that mirrors DEFAULT_PICKUP_MODULE_CONFIG — a booking dialog must
 * never crash on a stale or hand-edited config blob. `businessDays` is not a
 * config key (yet); it defaults to Mon–Sat, the couriers' working week.
 * `sameDayCutoff` is the booking cutoff these rules read — the older
 * `cutoffTime` setting is not consulted here.
 */
import { configForMerchant, readPickupModuleConfig, type AutoPickupConfig, type PickupModuleConfig } from '../config/pickupModule'
import { DEFAULT_AUTO_PICKUP_TRIGGER, triggerEventOf, triggerFired, type TriggerSubject } from './fareyeEvents'
import { pickupCalendarFor, type DayHours, type PickupCalendar, type PickupWhere } from './operatingCalendar'

export type { PickupWhere } from './operatingCalendar'

export type MultiPrPolicy = 'ONE_OPEN_PER_LOCATION' | 'ONE_PER_SLOT' | 'UNLIMITED'

export interface SlotDef { label: string; start: string; end: string }   // 'HH:mm'

export interface PickupPolicy {
  multiPrPolicy: MultiPrPolicy
  /** 'HH:mm' — a booking made before it may take a same-day slot. */
  sameDayCutoff: string
  slotDefinitions: SlotDef[]
  bookingLeadTimeMins: number
  maxAttempts: number
  autoRescheduleOnFail: boolean
  allowAddToExistingUntil: 'Requested' | 'Planned' | 'Assigned'
  /** 0 = Sunday … 6 = Saturday. */
  businessDays: number[]
  /** "Pickups can be booked up to" N days from today (1–30) — the furthest bookable date. */
  bookingHorizonDays: number
  /** Resolved operating calendar (pickupPolicy with a location/hub — operatingCalendar.ts):
   *  date → holiday name; a holiday is never a pickup day. */
  holidays?: Record<string, string>
  /** per-weekday open–close: a slot outside it is not offered */
  hours?: Partial<Record<number, DayHours>>
  /** where `businessDays` came from — the caption under the date */
  calendar?: Pick<PickupCalendar, 'source' | 'sourceLabel'>
}

export const DEFAULT_PICKUP_POLICY: PickupPolicy = {
  multiPrPolicy: 'ONE_PER_SLOT',
  sameDayCutoff: '12:00',
  /* mirrors DEFAULT_PICKUP_MODULE_CONFIG — used only when a key is missing or malformed */
  slotDefinitions: [
    { label: '09:00–12:00', start: '09:00', end: '12:00' },
    { label: '12:00–15:00', start: '12:00', end: '15:00' },
    { label: '15:00–18:00', start: '15:00', end: '18:00' },
  ],
  bookingLeadTimeMins: 120,
  maxAttempts: 3,
  autoRescheduleOnFail: true,
  allowAddToExistingUntil: 'Planned',
  businessDays: [1, 2, 3, 4, 5, 6],
  bookingHorizonDays: 7,
}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/
const hhmm = (v: unknown, d: string) => (typeof v === 'string' && HHMM.test(v) ? v : d)
const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d)

/** Accepts `{label?, start, end}`, `{startTime, endTime}` or `'HH:mm–HH:mm'` entries. */
function toSlots(v: unknown): SlotDef[] | null {
  if (!Array.isArray(v) || !v.length) return null
  const out = v.map((x): SlotDef | null => {
    if (typeof x === 'string') {
      const [a, b] = x.split(/[–—-]/).map((y) => y.trim())
      return HHMM.test(a ?? '') && HHMM.test(b ?? '') ? { label: `${a}–${b}`, start: a, end: b } : null
    }
    if (x && typeof x === 'object') {
      const o = x as Record<string, unknown>
      const start = hhmm(o.start ?? o.startTime ?? o.from, ''), end = hhmm(o.end ?? o.endTime ?? o.to, '')
      if (!start || !end) return null
      return { label: typeof o.label === 'string' && o.label ? o.label : `${start}–${end}`, start, end }
    }
    return null
  }).filter((x): x is SlotDef => x !== null)
  return out.length ? out : null
}

/** Any config-shaped object → a complete policy. */
export function toPolicy(raw: unknown): PickupPolicy {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const d = DEFAULT_PICKUP_POLICY
  const until = o.allowAddToExistingUntil
  /* the shared top-level horizon; a pre-2026-09-25 blob carried it as autoPickup.maxDaysAhead */
  const ap = (o.autoPickup && typeof o.autoPickup === 'object' ? o.autoPickup : {}) as Record<string, unknown>
  const horizon = num(o.bookingHorizonDays, num(ap.maxDaysAhead, d.bookingHorizonDays))
  return {
    multiPrPolicy: o.multiPrPolicy === 'ONE_OPEN_PER_LOCATION' || o.multiPrPolicy === 'UNLIMITED' || o.multiPrPolicy === 'ONE_PER_SLOT'
      ? o.multiPrPolicy : d.multiPrPolicy,
    sameDayCutoff: hhmm(o.sameDayCutoff, d.sameDayCutoff),
    slotDefinitions: toSlots(o.slotDefinitions) ?? d.slotDefinitions,
    bookingLeadTimeMins: Math.max(0, num(o.bookingLeadTimeMins, d.bookingLeadTimeMins)),
    maxAttempts: Math.max(1, Math.round(num(o.maxAttempts, d.maxAttempts))),
    autoRescheduleOnFail: typeof o.autoRescheduleOnFail === 'boolean' ? o.autoRescheduleOnFail : d.autoRescheduleOnFail,
    allowAddToExistingUntil: until === 'Requested' || until === 'Planned' || until === 'Assigned' ? until : d.allowAddToExistingUntil,
    businessDays: Array.isArray(o.businessDays) && o.businessDays.every((x) => Number.isInteger(x) && x >= 0 && x <= 6)
      ? (o.businessDays as number[]) : d.businessDays,
    bookingHorizonDays: Math.min(30, Math.max(1, Math.round(horizon))),
    /* a resolved calendar passes through every re-normalisation (pol(cfg)) untouched */
    ...(o.holidays && typeof o.holidays === 'object' ? { holidays: o.holidays as Record<string, string> } : {}),
    ...(o.hours && typeof o.hours === 'object' ? { hours: o.hours as PickupPolicy['hours'] } : {}),
    ...(o.calendar && typeof o.calendar === 'object' ? { calendar: o.calendar as PickupPolicy['calendar'] } : {}),
  }
}

/**
 * The live policy, with the merchant's `merchantOverrides` folded in when a code
 * is given, and the OPERATING CALENDAR of (pickup location → drop hub) folded in
 * per `pickupDaysSource` (operatingCalendar.ts): `businessDays` = the resolved
 * days, plus its holidays and hours. With no `where` the Company Default hub
 * calendar applies.
 */
export function pickupPolicy(merchantCode?: string | null, where?: PickupWhere | null): PickupPolicy {
  try {
    const cfg = merchantCode ? configForMerchant(merchantCode) : readPickupModuleConfig()
    const cal = pickupCalendarFor({ merchantCode, ...where }, cfg)
    return { ...toPolicy(cfg), businessDays: cal.days, holidays: cal.holidays, hours: cal.hours,
      calendar: { source: cal.source, sourceLabel: cal.sourceLabel } }
  } catch {
    return DEFAULT_PICKUP_POLICY
  }
}

/** The holiday on `date` ('YYYY-MM-DD') under this policy, or undefined. */
export const holidayOn = (date: string, cfg?: PolicyInput): string | undefined => pol(cfg).holidays?.[date]

/* ------------------------------------------------------------ date math ---- */

type PolicyInput = Partial<PickupPolicy> | Partial<PickupModuleConfig> | Record<string, unknown> | undefined
const pol = (cfg: PolicyInput): PickupPolicy => toPolicy(cfg ?? {})

const pad = (n: number) => String(n).padStart(2, '0')
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const at = (date: string, t: string) => `${date}T${t}`
const toDate = (s: string): Date => {
  const [d = '', t = '00:00'] = s.split('T')
  const [y, m, day] = d.split('-').map(Number)
  const [hh, mm] = t.split(':').map(Number)
  return new Date(y || 1970, (m || 1) - 1, day || 1, hh || 0, mm || 0)
}
const minsOf = (t: string) => { const [h, m] = t.split(':').map(Number); return (h || 0) * 60 + (m || 0) }

/** A pickup day: an operating weekday that is not a holiday. */
const openOn = (d: Date, p: PickupPolicy): boolean => p.businessDays.includes(d.getDay()) && !p.holidays?.[ymd(d)]
export const isBusinessDay = (d: Date, cfg?: PolicyInput): boolean => openOn(d, pol(cfg))

/** The first business day strictly AFTER `d`'s date (midnight, local). */
export function nextBusinessDay(d: Date, cfg?: PolicyInput): Date {
  const p = pol(cfg)
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  for (let i = 0; i < 21; i++) {
    x.setDate(x.getDate() + 1)
    if (openOn(x, p)) return x
  }
  return x
}

/** The configured slots on one date ('YYYY-MM-DD'); a slot ending at or before its start ends next day. */
export function slotsFor(date: string, cfg?: PolicyInput): { label: string; startAt: string; endAt: string }[] {
  const p = pol(cfg)
  /* operating hours (merchant location / hub): only slots inside open–close */
  const h = p.hours?.[toDate(at(date, '00:00')).getDay()]
  const defs = h ? p.slotDefinitions.filter((s) => minsOf(s.start) >= minsOf(h.open) && minsOf(s.end) > minsOf(s.start) && minsOf(s.end) <= minsOf(h.close)) : p.slotDefinitions
  return defs.map((s) => {
    const startAt = at(date, s.start)
    let endAt = at(date, s.end)
    if (minsOf(s.end) <= minsOf(s.start)) {
      const n = toDate(at(date, s.end)); n.setDate(n.getDate() + 1); endAt = at(ymd(n), s.end)
    }
    return { label: s.label, startAt, endAt }
  })
}

/** Why `startAt` cannot be booked at `now` — or null when it can. */
function reasonAgainst(startAt: string, now: Date, p: PickupPolicy): 'lead' | 'cutoff' | 'closed' | 'holiday' | 'hours' | null {
  const start = toDate(startAt)
  if (!p.businessDays.includes(start.getDay())) return 'closed'
  if (p.holidays?.[ymd(start)]) return 'holiday'
  const h = p.hours?.[start.getDay()]
  const sm = start.getHours() * 60 + start.getMinutes()
  if (h && (sm < minsOf(h.open) || sm >= minsOf(h.close))) return 'hours'
  if (ymd(start) === ymd(now) && now.getHours() * 60 + now.getMinutes() >= minsOf(p.sameDayCutoff)) return 'cutoff'
  if (start.getTime() < now.getTime() + p.bookingLeadTimeMins * 60_000) return 'lead'
  return null
}

/** The first configured slot a booking made at `now` may take. */
export function earliestWindow(now: Date, cfg?: PolicyInput): { startAt: string; endAt: string } {
  const p = pol(cfg)
  const day = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  for (let i = 0; i < 21; i++) {
    const hit = slotsFor(ymd(day), p).find((s) => reasonAgainst(s.startAt, now, p) === null)
    if (hit) return { startAt: hit.startAt, endAt: hit.endAt }
    day.setDate(day.getDate() + 1)
  }
  /* no slot in three weeks means a broken config — offer tomorrow's first slot */
  const first = slotsFor(ymd(nextBusinessDay(now, p)), p)[0]
  return first ? { startAt: first.startAt, endAt: first.endAt } : { startAt: at(ymd(nextBusinessDay(now, p)), '09:00'), endAt: at(ymd(nextBusinessDay(now, p)), '13:00') }
}

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
/** `Tue 24 Sep 09:00–12:00` — how every booking dialog words a window. */
export function windowLabel(w: { startAt: string; endAt: string }): string {
  const s = toDate(w.startAt), e = toDate(w.endAt)
  const head = `${DOW[s.getDay()]} ${s.getDate()} ${MON[s.getMonth()]} ${pad(s.getHours())}:${pad(s.getMinutes())}`
  const sameDay = ymd(s) === ymd(e)
  return `${head}–${sameDay ? '' : `${DOW[e.getDay()]} ${e.getDate()} ${MON[e.getMonth()]} `}${pad(e.getHours())}:${pad(e.getMinutes())}`
}

/**
 * The human reason a window breaks the booking rules, or null. Always names
 * the earliest window that WOULD work, so the dialog can offer it.
 */
export function violatesCutoff(startAt: string, now: Date, cfg?: PolicyInput, endAt?: string | null): string | null {
  const p = pol(cfg)
  if (!HAS_TIME.test(startAt)) return 'Pick a start time'
  const horizon = horizonError(startAt, now, p)
  if (horizon) return horizon
  const why = reasonAgainst(startAt, now, p)
  if (!why) return endAt ? endError(startAt, endAt, now, p) : null
  const earliest = windowLabel(earliestWindow(now, p))
  if (why === 'cutoff') return `Same-day pickup closes at ${p.sameDayCutoff} — earliest window ${earliest}`
  if (why === 'closed') {
    const s = toDate(startAt)
    return `${DOW[s.getDay()]} ${s.getDate()} ${MON[s.getMonth()]} is not a pickup day — earliest window ${earliest}`
  }
  if (why === 'holiday') {
    const s = toDate(startAt)
    return `${DOW[s.getDay()]} ${s.getDate()} ${MON[s.getMonth()]} is a holiday (${p.holidays?.[ymd(s)]}) — earliest window ${earliest}`
  }
  if (why === 'hours') {
    const h = p.hours?.[toDate(startAt).getDay()]
    return `Outside the pickup hours${h ? ` ${h.open}–${h.close}` : ''} — earliest window ${earliest}`
  }
  return `Pickups need ${p.bookingLeadTimeMins} min notice — earliest window ${earliest}`
}

/** The longest free-typed SAME-DAY window (owner, 2026-09-25: no slot-length cap in config → 12 h). */
export const MAX_TYPED_WINDOW_HOURS = 12
/** A window may run overnight / across days — at most this many days (the seed's multi-day windows). */
export const MAX_WINDOW_DAYS = 7

const HAS_TIME = /T\d{2}:\d{2}/
/**
 * The END side of a typed window (From date · time → To date · time, owner
 * 2026-09-25): after the start overall; same day → at most
 * MAX_TYPED_WINDOW_HOURS; another day → at most MAX_WINDOW_DAYS later, on a
 * pickup day (operating, not a holiday) inside the booking horizon; and — when
 * the calendar has hours — no later than that end day's close.
 */
function endError(startAt: string, endAt: string, now: Date, p: PickupPolicy): string | null {
  if (!HAS_TIME.test(endAt)) return 'Pick an end time'
  const s = toDate(startAt), e = toDate(endAt)
  if (ymd(e) < ymd(s)) return 'The end date cannot be before the start date'
  if (!(e.getTime() > s.getTime())) return 'The end must be after the start'
  const sameDay = ymd(e) === ymd(s)
  if (sameDay && e.getTime() - s.getTime() > MAX_TYPED_WINDOW_HOURS * 3_600_000) return `A same-day pickup window can be at most ${MAX_TYPED_WINDOW_HOURS} hours`
  if (!sameDay) {
    const sd = new Date(s.getFullYear(), s.getMonth(), s.getDate())
    if (new Date(e.getFullYear(), e.getMonth(), e.getDate()).getTime() - sd.getTime() > MAX_WINDOW_DAYS * 86_400_000) return `A pickup window can span at most ${MAX_WINDOW_DAYS} days`
    if (!p.businessDays.includes(e.getDay())) return `${DOW[e.getDay()]} ${e.getDate()} ${MON[e.getMonth()]} is not a pickup day`
    const hol = p.holidays?.[ymd(e)]
    if (hol) return `${DOW[e.getDay()]} ${e.getDate()} ${MON[e.getMonth()]} is a holiday (${hol})`
    const horizon = horizonError(endAt, now, p)
    if (horizon) return horizon
  }
  const h = p.hours?.[e.getDay()]
  if (h && e.getHours() * 60 + e.getMinutes() > minsOf(h.close)) return `Outside the pickup hours ${h.open}–${h.close}`
  return null
}

/**
 * "Pickups can be booked up to N days ahead" (owner, 2026-09-25): a start later
 * than today + N (end of that day) is rejected. Shared by every manual booking
 * dialog (through violatesCutoff) and the auto mode's user-picked window.
 */
function horizonError(startAt: string, now: Date, p: PickupPolicy): string | null {
  const max = p.bookingHorizonDays
  const limit = new Date(now.getFullYear(), now.getMonth(), now.getDate() + max, 23, 59)
  return toDate(startAt).getTime() > limit.getTime() ? `Pickups can be booked up to ${max} day${max === 1 ? '' : 's'} ahead` : null
}

/* ------------------------------------------------------- auto pickup ---- */

const DOW_LONG = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** The days chips read: 'Mon–Sat', 'Mon–Fri', or the list. */
export function pickupDaysLabel(days: number[]): string {
  const d = [...new Set(days)].sort()
  if (!d.length) return '—'
  const contiguous = d.every((x, i) => i === 0 || x === d[i - 1] + 1)
  return contiguous && d.length > 2 ? `${DOW_LONG[d[0]]}–${DOW_LONG[d[d.length - 1]]}` : d.map((x) => DOW_LONG[x]).join(', ')
}

/**
 * The window an AUTO-raised request takes for a consignment created at `now`
 * (owner, 2026-09-24): the date comes from `autoPickup.dateRule`, rolled
 * forward onto the next configured pickup day; the window is the chosen slot
 * (else the first configured one). A same-day date is only kept when the
 * consignment arrives before the same-day cutoff and the lead time still fits.
 */
export function autoPickupWindow(now: Date, cfg?: PolicyInput, auto?: Partial<AutoPickupConfig>): { startAt: string; endAt: string } {
  const p = pol(cfg)
  const a: AutoPickupConfig = {
    triggerEvent: auto?.triggerEvent ?? DEFAULT_AUTO_PICKUP_TRIGGER,
    afterState: auto?.afterState ?? 'Label Generated',
    userSelectsWindow: auto?.userSelectsWindow ?? false,
    slotConfirmation: auto?.slotConfirmation ?? false,
    maxDaysAhead: auto?.maxDaysAhead ?? p.bookingHorizonDays,
    dateRule: auto?.dateRule ?? 'next-business-day',
    daysAfterOrder: auto?.daysAfterOrder ?? 1,
    slot: auto?.slot ?? '',
    pickupDays: auto?.pickupDays?.length ? auto.pickupDays : [1, 2, 3, 4, 5, 6],
  }
  /* a resolved calendar (pickupPolicy with a location / hub) decides the days + holidays;
     a bare config keeps the module's own pickup days */
  const isPickupDay = (x: Date) => p.calendar ? openOn(x, p) : a.pickupDays.includes(x.getDay())
  const onPickupDay = (d: Date): Date => {
    const x = new Date(d.getFullYear(), d.getMonth(), d.getDate())
    for (let i = 0; i < 21 && !isPickupDay(x); i++) x.setDate(x.getDate() + 1)
    return x
  }
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  let day: Date
  if (a.dateRule === 'days-after-order') {
    day = new Date(today); day.setDate(day.getDate() + a.daysAfterOrder)
  } else if (a.dateRule === 'same-day' && now.getHours() * 60 + now.getMinutes() < minsOf(p.sameDayCutoff)) {
    day = today
  } else {
    day = new Date(today); day.setDate(day.getDate() + 1)
  }
  day = onPickupDay(day)
  const pick = (date: string) => {
    const all = slotsFor(date, p)
    return all.find((s) => s.label.replace('–', '-') === a.slot.replace('–', '-')) ?? all[0]
  }
  let w = pick(ymd(day))
  /* a same-day window the lead time no longer allows moves to the next pickup day */
  if (w && ymd(day) === ymd(today) && toDate(w.startAt).getTime() < now.getTime() + p.bookingLeadTimeMins * 60_000) {
    const later = slotsFor(ymd(day), p).find((s) => toDate(s.startAt).getTime() >= now.getTime() + p.bookingLeadTimeMins * 60_000)
    if (later) w = later
    else { const n = new Date(day); n.setDate(n.getDate() + 1); w = pick(ymd(onPickupDay(n))) }
  }
  if (!w) return earliestWindow(now, p)
  return { startAt: w.startAt, endAt: w.endAt }
}

/**
 * Whether an AUTO request may be raised for this consignment now: the
 * configured trigger EVENT has "fired" for it, in local terms (see
 * growOrders/fareyeEvents.ts), and it is a live, unbooked consignment.
 */
export function autoPickupEligible(o: TriggerSubject, triggerEvent: string): boolean {
  return triggerFired(triggerEvent, o)
}

/** The trigger's platform name, for the pill and the form note. */
export const autoPickupTriggerLabel = (cfg: Pick<PickupModuleConfig, 'autoPickup'>): string =>
  triggerEventOf(cfg.autoPickup.triggerEvent).title

/**
 * Why a window the USER picked breaks the slot rules — or null when it is
 * bookable. Read only when `userSelectsWindow` is on: the shared horizon
 * (`bookingHorizonDays`), then the same cutoff / lead-time / pickup-day rules
 * as a manual booking.
 */
export function userWindowError(startAt: string, now: Date, cfg?: PolicyInput, auto?: Partial<AutoPickupConfig>): string | null {
  if (!startAt) return null
  const horizon = horizonError(startAt, now, pol(cfg))
  if (horizon) return horizon
  const s = toDate(startAt)
  const p = pol(cfg)
  /* the resolved calendar (violatesCutoff below checks its days + holidays); else the module days */
  const days = p.calendar ? p.businessDays : auto?.pickupDays?.length ? auto.pickupDays : [1, 2, 3, 4, 5, 6]
  if (!days.includes(s.getDay())) return `${DOW[s.getDay()]} ${s.getDate()} ${MON[s.getMonth()]} is not a pickup day`
  return violatesCutoff(startAt, now, cfg)
}

/**
 * The window an auto-raised request takes when the user MAY choose: their
 * choice when it passes the slot rules, else the rule's own window.
 */
export function autoPickupWindowFor(
  now: Date, cfg: PolicyInput, auto: Partial<AutoPickupConfig> | undefined,
  chosen: { startAt?: string | null; endAt?: string | null } | null | undefined,
): { startAt: string; endAt: string; chosen: boolean } {
  if (auto?.userSelectsWindow && chosen?.startAt && chosen?.endAt && !userWindowError(chosen.startAt, now, cfg, auto)) {
    return { startAt: chosen.startAt, endAt: chosen.endAt, chosen: true }
  }
  return { ...autoPickupWindow(now, cfg, auto), chosen: false }
}

/** 'Auto pickup · after Ready To Ship · next pickup day · 09:00–12:00 · Mon–Sat' — the pill the pages show in auto mode. */
export function autoPickupSummary(cfg: Pick<PickupModuleConfig, 'autoPickup' | 'sameDayCutoff' | 'slotDefinitions'> & Partial<Pick<PickupModuleConfig, 'bookingHorizonDays' | 'pickupDaysSource'>>): string {
  const a = cfg.autoPickup
  const rule = a.dateRule === 'same-day' ? `same day before ${cfg.sameDayCutoff}`
    : a.dateRule === 'days-after-order' ? `${a.daysAfterOrder} day${a.daysAfterOrder === 1 ? '' : 's'} after creation`
    : 'next pickup day'
  const slot = a.slot || cfg.slotDefinitions[0] || ''
  return ['Auto pickup', `on ${triggerEventOf(a.triggerEvent).title}`, a.userSelectsWindow ? `user picks (≤ ${cfg.bookingHorizonDays ?? a.maxDaysAhead} d)` : '', rule, slot.replace('-', '–'), daysSourceTag(cfg.pickupDaysSource), a.slotConfirmation ? 'slot confirmation' : ''].filter(Boolean).join(' · ')
}

/** The pill's days part: which calendar decides them. */
function daysSourceTag(src: PickupModuleConfig['pickupDaysSource'] | undefined): string {
  if (src === 'hub') return 'hub calendar days'
  return 'merchant / hub calendar days'
}

/* --------------------------------------------- settings-derived choices ---- */

export type SlotWindow = { label: string; startAt: string; endAt: string }
/** A dialog's own gate: true when that window may be booked (the same check its Confirm runs). */
export type SlotCheck = (w: { startAt: string; endAt: string }) => boolean

/** The policy's default gate — the booking rules (`violatesCutoff`) at `now`. */
export const policyCheck = (cfg?: PolicyInput, now = new Date()): SlotCheck => {
  const p = pol(cfg)
  return (w) => violatesCutoff(w.startAt, now, p, w.endAt) === null
}

/** The configured slots on `date` that pass `ok` — what the slot dropdown offers. */
export function bookableSlotsOn(date: string, cfg: PolicyInput, ok: SlotCheck): SlotWindow[] {
  return date ? slotsFor(date, cfg).filter((s) => ok(s)) : []
}

/**
 * Every day the date picker offers, oldest first: from today up to 31 days out
 * (the horizon is capped at 30), each day that has at least one slot passing
 * `ok`. With `ok` = the booking rules that is exactly: a pickup day (policy
 * `businessDays`), within today + `bookingHorizonDays`, and — today only —
 * before `sameDayCutoff` with a slot still `bookingLeadTimeMins` away.
 */
export function bookableDays(now: Date, cfg: PolicyInput, ok: SlotCheck): string[] {
  const p = pol(cfg)
  const out: string[] = []
  for (let i = 0; i <= 31; i++) {
    const d = ymd(new Date(now.getFullYear(), now.getMonth(), now.getDate() + i))
    if (bookableSlotsOn(d, p, ok).length) out.push(d)
  }
  return out
}
