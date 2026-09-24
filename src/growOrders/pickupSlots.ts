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
  }
}

/** The live policy, with the merchant's `merchantOverrides` folded in when a code is given. */
export function pickupPolicy(merchantCode?: string | null): PickupPolicy {
  try {
    return toPolicy(merchantCode ? configForMerchant(merchantCode) : readPickupModuleConfig())
  } catch {
    return DEFAULT_PICKUP_POLICY
  }
}

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

export const isBusinessDay = (d: Date, cfg?: PolicyInput): boolean => pol(cfg).businessDays.includes(d.getDay())

/** The first business day strictly AFTER `d`'s date (midnight, local). */
export function nextBusinessDay(d: Date, cfg?: PolicyInput): Date {
  const p = pol(cfg)
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  for (let i = 0; i < 14; i++) {
    x.setDate(x.getDate() + 1)
    if (p.businessDays.includes(x.getDay())) return x
  }
  return x
}

/** The configured slots on one date ('YYYY-MM-DD'); a slot ending at or before its start ends next day. */
export function slotsFor(date: string, cfg?: PolicyInput): { label: string; startAt: string; endAt: string }[] {
  return pol(cfg).slotDefinitions.map((s) => {
    const startAt = at(date, s.start)
    let endAt = at(date, s.end)
    if (minsOf(s.end) <= minsOf(s.start)) {
      const n = toDate(at(date, s.end)); n.setDate(n.getDate() + 1); endAt = at(ymd(n), s.end)
    }
    return { label: s.label, startAt, endAt }
  })
}

/** Why `startAt` cannot be booked at `now` — or null when it can. */
function reasonAgainst(startAt: string, now: Date, p: PickupPolicy): 'lead' | 'cutoff' | 'closed' | null {
  const start = toDate(startAt)
  if (!p.businessDays.includes(start.getDay())) return 'closed'
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
export function violatesCutoff(startAt: string, now: Date, cfg?: PolicyInput): string | null {
  const p = pol(cfg)
  const why = reasonAgainst(startAt, now, p)
  if (!why) return null
  const earliest = windowLabel(earliestWindow(now, p))
  if (why === 'cutoff') return `Same-day pickup closes at ${p.sameDayCutoff} — earliest window ${earliest}`
  if (why === 'closed') {
    const s = toDate(startAt)
    return `${DOW[s.getDay()]} ${s.getDate()} ${MON[s.getMonth()]} is not a pickup day — earliest window ${earliest}`
  }
  return `Pickups need ${p.bookingLeadTimeMins} min notice — earliest window ${earliest}`
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
    afterState: auto?.afterState ?? 'Ready To Ship',
    dateRule: auto?.dateRule ?? 'next-business-day',
    daysAfterOrder: auto?.daysAfterOrder ?? 1,
    slot: auto?.slot ?? '',
    pickupDays: auto?.pickupDays?.length ? auto.pickupDays : [1, 2, 3, 4, 5, 6],
  }
  const onPickupDay = (d: Date): Date => {
    const x = new Date(d.getFullYear(), d.getMonth(), d.getDate())
    for (let i = 0; i < 14 && !a.pickupDays.includes(x.getDay()); i++) x.setDate(x.getDate() + 1)
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
 * Whether an AUTO request may be raised for this consignment now: it must be a
 * live, unbooked consignment that has reached the configured trigger state.
 */
export function autoPickupEligible(
  o: { isDraft: boolean; status: string; pickupRequestId: string | null; paymentStatus: string; error: string },
  afterState: AutoPickupConfig['afterState'],
): boolean {
  if (o.isDraft || o.pickupRequestId || o.status !== 'Order Created') return false
  if (afterState === 'Created') return true
  if (o.paymentStatus !== 'Paid') return false            // no label before payment
  return afterState === 'Label Generated' || !o.error     // Ready To Ship = validated too
}

/** 'Auto pickup · after Ready To Ship · next pickup day · 09:00–12:00 · Mon–Sat' — the pill the pages show in auto mode. */
export function autoPickupSummary(cfg: Pick<PickupModuleConfig, 'autoPickup' | 'sameDayCutoff' | 'slotDefinitions'>): string {
  const a = cfg.autoPickup
  const rule = a.dateRule === 'same-day' ? `same day before ${cfg.sameDayCutoff}`
    : a.dateRule === 'days-after-order' ? `${a.daysAfterOrder} day${a.daysAfterOrder === 1 ? '' : 's'} after creation`
    : 'next pickup day'
  const slot = a.slot || cfg.slotDefinitions[0] || ''
  return ['Auto pickup', `after ${a.afterState}`, rule, slot.replace('-', '–'), pickupDaysLabel(a.pickupDays)].filter(Boolean).join(' · ')
}
