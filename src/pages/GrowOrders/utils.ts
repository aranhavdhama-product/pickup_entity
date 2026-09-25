/** Non-component helpers for the Grow replica pages (kept out of ui.tsx for react-refresh). */
import { useEffect, useRef, useState, type MutableRefObject, type RefObject } from 'react'
import type {
  GrowOrder, GrowPickupRequest, OrderStatus, Party, PickupRequestStatus, StoreLocation,
} from '../../growOrders/types'
import {
  PR_STATUSES, atDate, atParts, canReattempt, hasDiscrepancy, isHandedOver, isInTransitToHub, isOpenPr,
  nextHalfHourAt, rangesOverlap, type DisplayStatus,
} from '../../growOrders/tabs'
import { hubName } from '../../growOrders/hubs'
import { pickupPointKey, splitSiblings } from '../../growOrders/prActions'
import { masterStoreLocations } from '../../growOrders/masters'
import { PR_STATUS_TONE as CONSOLE_PR_STATUS_TONE } from '../LocalPickup/prModel'

/** The status vocabulary's tone (kept for callers); render it with `pillTone` → Nueva StatusPill. */
export type ChipTone = 'success' | 'info' | 'warning' | 'error' | 'danger' | 'primary' | 'neutral'
export type PillTone = 'success' | 'info' | 'warning' | 'danger' | 'neutral'
export const pillTone = (t: ChipTone): PillTone =>
  t === 'error' ? 'danger' : t === 'primary' ? 'info' : t

/**
 * Escape belongs to the TOP layer only.
 *
 * Every overlay used to add its own `document` keydown listener, so one Escape
 * inside a calendar that sits in a dialog closed BOTH — and `stopPropagation`
 * cannot help, because two listeners on the same node are siblings, not a
 * chain. Layers register here instead, newest last, and only the newest reacts.
 */
const escapeStack: { current: () => void }[] = []

export function useEscapeKey(active: boolean, onEscape: () => void) {
  /* the callback is kept in a ref so a caller's inline arrow does not tear the
     layer down and rebuild it on every render — written in an effect, never in render */
  const cb = useRef(onEscape)
  useEffect(() => { cb.current = onEscape })
  useEffect(() => {
    if (!active) return
    const layer = { current: () => cb.current() }
    escapeStack.push(layer)
    const k = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (escapeStack[escapeStack.length - 1] !== layer) return
      e.stopPropagation()
      layer.current()
    }
    document.addEventListener('keydown', k)
    return () => {
      document.removeEventListener('keydown', k)
      const i = escapeStack.indexOf(layer)
      if (i >= 0) escapeStack.splice(i, 1)
    }
  }, [active])
}

export function useOutside(onOut: () => void) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onOut() }
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h)
  }, [onOut])
  return ref
}

/**
 * Where the floating selection popup should sit inside its card: level with the
 * FIRST selected row, clamped so it can never hang below the card. Re-measured
 * whenever the selection changes and on resize.
 */
export function useSelectionAnchor(
  cardRef: RefObject<HTMLElement | null>,
  rowRefs: MutableRefObject<Record<string, HTMLElement | null>>,
  firstId: string | undefined,
  popupHeight = 220,
): number {
  const [top, setTop] = useState(56)
  useEffect(() => {
    const measure = () => {
      const card = cardRef.current
      const row = firstId ? rowRefs.current[firstId] : null
      if (!card || !row) { setTop(56); return }
      const offset = row.getBoundingClientRect().top - card.getBoundingClientRect().top
      const max = Math.max(56, card.offsetHeight - popupHeight - 12)
      setTop(Math.min(Math.max(56, offset), max))
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [cardRef, rowRefs, firstId, popupHeight])
  return top
}

/**
 * Tone for the ONE status vocabulary the merchant sees (`displayStatus`). Kept in
 * step with the console's `stateTone` (LocalPFP/adapter): Created neutral, in
 * flight info, Out for Delivery warning, Delivered success, Undelivered AND
 * Cancelled danger (owner, 2026-09-25: the same status reads the same tone). The
 * raw-status map below it is kept for the places that still render a platform
 * status, such as the pickup request's own order table.
 */
export const DISPLAY_TONE: Record<DisplayStatus, ChipTone> = {
  Draft: 'neutral', 'Ready for Pickup': 'info', 'Pickup Scheduled': 'info',
  'Picked Up': 'primary', 'In Transit': 'primary', 'Out for Delivery': 'warning',
  Delivered: 'success', Undelivered: 'error', Cancelled: 'error',
}

export const STATUS_TONE: Record<OrderStatus, ChipTone> = {
  'Order Created': 'neutral', 'Pickup Scheduled': 'info', 'Picked Up': 'info', 'In Transit': 'primary',
  'Out for Delivery': 'warning', Delivered: 'success', Undelivered: 'error', Cancelled: 'error',
}

/** The console's pickup-request tones (`LocalPickup/prModel`), the ONE source for both portals. */
export const PR_STATUS_TONE: Record<PickupRequestStatus, ChipTone> = CONSOLE_PR_STATUS_TONE

/** 'YYYY-MM-DD' → 'DD/MM/YYYY' (pickup dates are plain dates, not ISO timestamps). */
export const fmtDay = (d: string) => (d ? d.split('-').reverse().join('/') : '-')

export const fmtDate = (iso: string) => {
  const d = new Date(iso)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`
}
export const fmtDateTime = (iso: string) => {
  const d = new Date(iso)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${fmtDate(iso)} ${p(d.getHours())}:${p(d.getMinutes())}`
}
export const money = (n: number, cur = '₱') => `${cur} ${n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

/* ------------------------------------------------ pickup-request selectors ---- */

/**
 * '2026-03-18T11:00' + '2026-03-18T14:00' → '18/03/2026 11:00 - 14:00', and
 * '18/03/2026 21:00 - 19/03/2026 02:00' when the window crosses midnight.
 */
export const fmtWindow = (startAt: string, endAt: string) => {
  const [sd, st] = atParts(startAt), [ed, et] = atParts(endAt)
  return sd === ed ? `${fmtDay(sd)} ${st} - ${et}` : `${fmtDay(sd)} ${st} - ${fmtDay(ed)} ${et}`
}

/** '2026-03-18T11:00' → '18/03/2026 11:00' — ONE end of a window on its own. */
export const fmtAt = (at: string) => {
  const [d, t] = atParts(at)
  return d ? `${fmtDay(d)} ${t}` : '-'
}

/** The same label straight off a request. */
export const prWindow = (p: { startAt: string; endAt: string }) => fmtWindow(p.startAt, p.endAt)

/* -------------------------------------------------- multi-day pickup windows ---- */

/** 'YYYY-MM-DDTHH:mm' → midnight of its calendar day, so day spans ignore the clock. */
const dayStart = (at: string) => { const d = atDate(at); d.setHours(0, 0, 0, 0); return d.getTime() }

const HOUR = 3_600_000
const DAY = 24 * HOUR

export interface WindowSpan {
  /** Length of the window in milliseconds (0 when either end is missing). */
  ms: number
  /** Opens and closes on the same calendar day. */
  sameDay: boolean
  /** Calendar days the window touches: 1 = same day, 2 = ends tomorrow, … */
  calendarDays: number
  /** Crosses exactly one midnight and is no longer than a day. */
  overnight: boolean
  /** The muted tag under a multi-day window cell — null when it opens and closes the same day. */
  tag: string | null
  /** '2 days 8 h' · '4 h' · '45 min'. */
  duration: string
}

/** How long a pickup window runs, and how to label it. Pure — safe in render. */
export function windowSpan(startAt: string, endAt: string): WindowSpan {
  const empty: WindowSpan = { ms: 0, sameDay: true, calendarDays: 1, overnight: false, tag: null, duration: '' }
  if (!startAt || !endAt) return empty
  const ms = atDate(endAt).getTime() - atDate(startAt).getTime()
  if (ms <= 0) return empty
  const calendarDays = Math.round((dayStart(endAt) - dayStart(startAt)) / DAY) + 1
  const sameDay = calendarDays === 1
  const overnight = calendarDays === 2 && ms <= DAY
  return {
    ms,
    sameDay,
    calendarDays,
    overnight,
    tag: sameDay ? null : overnight ? 'overnight' : `${calendarDays} days`,
    duration: durationLabel(ms),
  }
}

/** '2 days 8 h' · '4 h' · '4 h 30 min' · '45 min'. */
export function durationLabel(ms: number): string {
  if (ms <= 0) return ''
  const mins = Math.round(ms / 60_000)
  const days = Math.floor(mins / (24 * 60))
  const hours = Math.floor((mins - days * 24 * 60) / 60)
  const rest = mins - days * 24 * 60 - hours * 60
  if (days > 0) return `${days} day${days === 1 ? '' : 's'}${hours ? ` ${hours} h` : ''}`
  if (hours > 0) return `${hours} h${rest ? ` ${rest} min` : ''}`
  return `${rest} min`
}

/** The same span straight off a request. */
export const prSpan = (p: { startAt: string; endAt: string }) => windowSpan(p.startAt, p.endAt)

/* ------------------------------------------------------- pickup windows ---- */

/** The longest collection window the network accepts. */
export const MAX_WINDOW_DAYS = 7

/** Why this window cannot be booked, per field. Empty object = valid. */
export function windowErrors(startAt: string, endAt: string, now = new Date()): { start?: string; end?: string } {
  const e: { start?: string; end?: string } = {}
  if (!startAt) e.start = 'Pick a pickup start.'
  if (!endAt) e.end = 'Pick a pickup end.'
  if (startAt && endAt && atDate(endAt) <= atDate(startAt)) e.end = 'The end must be after the start.'
  else if (startAt && endAt && atDate(endAt).getTime() - atDate(startAt).getTime() > MAX_WINDOW_DAYS * 24 * HOUR) {
    e.end = `Pickup window cannot exceed ${MAX_WINDOW_DAYS} days`
  }
  const min = nextHalfHourAt(now)
  if (startAt && atDate(startAt) < atDate(min)) e.start = `A pickup can only start from ${fmtWindow(min, min).split(' - ')[0]}.`
  return e
}

/** A window both fields have and that passes every rule. */
export const windowOk = (startAt: string, endAt: string): boolean => {
  const e = windowErrors(startAt, endAt)
  return !!startAt && !!endAt && !e.start && !e.end
}

/** Local Date for the END of a pickup window. */
export const windowEnd = (p: { endAt: string }): Date => atDate(p.endAt)

/**
 * A request nobody has acted on although its window has already CLOSED —
 * measured on the END of the window, not the start, so a two-day booking is
 * never late on its first morning. Only the ENTRY state means "nothing has
 * happened yet": Planned, Assigned or Out For Pickup is being worked, not
 * forgotten.
 */
export const prOverdue = (p: GrowPickupRequest, now = Date.now()) =>
  p.status === 'Requested' && windowEnd(p).getTime() < now

/** Has the collection window opened? Drives the "nothing attached yet" warning. */
export const prWindowStarted = (p: { startAt: string }, now = Date.now()) => atDate(p.startAt).getTime() <= now

/** Orders behind a request — read off `orderIds`, so a cancelled request keeps its totals. */
export const prOrders = (p: GrowPickupRequest, byId: Map<string, GrowOrder>) =>
  p.orderIds.map((id) => byId.get(id)).filter((o): o is GrowOrder => !!o)

export const prWeight = (p: GrowPickupRequest, byId: Map<string, GrowOrder>) =>
  prOrders(p, byId).reduce((n, o) => n + (o.pkg.weightKg || 0), 0)
export const prQty = (p: GrowPickupRequest, byId: Map<string, GrowOrder>) =>
  prOrders(p, byId).reduce((n, o) => n + (o.pkg.count || 0), 0)

/**
 * What a row should SHOW for weight / quantity. An order-backed request is the
 * sum of its orders; a blind one with nothing attached yet only has the
 * merchant's estimate, so the value is flagged approximate and the caller
 * prefixes it with `~`.
 */
export interface PrEstimate { value: number; approx: boolean; known: boolean }

export const prDisplayWeight = (p: GrowPickupRequest, byId: Map<string, GrowOrder>): PrEstimate => {
  if (p.orderIds.length > 0) return { value: prWeight(p, byId), approx: false, known: true }
  if (p.blind && p.expectedWeightKg != null) return { value: p.expectedWeightKg, approx: true, known: true }
  return { value: 0, approx: false, known: !p.blind }
}

export const prDisplayQty = (p: GrowPickupRequest, byId: Map<string, GrowOrder>): PrEstimate => {
  if (p.orderIds.length > 0) return { value: prQty(p, byId), approx: false, known: true }
  if (p.blind && p.expectedPieces != null) return { value: p.expectedPieces, approx: true, known: true }
  return { value: 0, approx: false, known: !p.blind }
}

/* ------------------------------------------------ pickup reconciliation ---- */

/**
 * What happened to ONE order at ONE completed handover:
 *  - `'Picked'`      — the driver collected it here.
 *  - `{ pickedIn }`  — booked here, but actually handed over at another request.
 *  - `'Not picked'`  — booked here and never collected; it keeps its booking.
 *
 * Derived, never stored: `pr.pickedOrderIds` is the one record of the handover,
 * so the outcome can never drift from it.
 */
export type PickupOutcome = 'Picked' | 'Not picked' | { pickedIn: string }

export function pickupOutcome(o: GrowOrder, p: GrowPickupRequest): PickupOutcome {
  if (p.pickedOrderIds.includes(o.id)) return 'Picked'
  if (o.pickedInRequestId && o.pickedInRequestId !== p.id) return { pickedIn: o.pickedInRequestId }
  return 'Not picked'
}

/**
 * The reconciliation line under a completed request's title.
 * `picked` counts only what was BOOKED here, so `booked - picked` is exactly the
 * Not-picked rows; `extra` is what was collected here but booked elsewhere —
 * the same set the "Also picked here" card lists.
 */
export interface PickupSummary { booked: number; picked: number; extra: number; overages: number }

export function pickupSummary(p: GrowPickupRequest): PickupSummary {
  const booked = new Set(p.orderIds)
  const picked = p.pickedOrderIds.filter((id) => booked.has(id)).length
  return { booked: booked.size, picked, extra: p.pickedOrderIds.length - picked, overages: p.overages.length }
}

/**
 * The label a reconciled request's Status chip actually shows. A completed pickup
 * that left orders behind is NOT simply "Completed" — the chip says so, so the
 * grid never hides a partial handover behind a green chip.
 */
export const PARTIALLY_PICKED = 'Partially picked'

/** The nine real states plus the one derived label the chips and filter speak. */
export const PR_FILTER_STATUSES = [...PR_STATUSES, PARTIALLY_PICKED] as const

export function prOutcomeLabel(p: GrowPickupRequest): string {
  if (p.status !== 'Completed') return p.status
  const s = pickupSummary(p)
  return s.booked - s.picked > 0 ? PARTIALLY_PICKED : 'Completed'
}

/** `3 of 5 picked · 2 not picked · 1 overage` — the chip's tooltip and the detail
 *  page's one-line summary. Empty for a request nobody has attempted yet. */
export function prOutcomeWords(p: GrowPickupRequest): string {
  if (!prReconciled(p)) return ''
  const s = pickupSummary(p)
  const missed = s.booked - s.picked
  const parts = [`${s.picked} of ${s.booked} picked`]
  if (missed > 0) parts.push(`${missed} not picked`)
  if (s.overages > 0) parts.push(`${s.overages} overage${s.overages === 1 ? '' : 's'}`)
  return parts.join(' · ')
}

/** Orders collected under `p` that were booked into a DIFFERENT request. */
export const prExtraOrders = (p: GrowPickupRequest, orders: GrowOrder[]) =>
  orders.filter((o) => o.pickedInRequestId === p.id && o.pickupRequestId !== p.id)

/** Reconciliation only exists once the handover has been attempted. */
export const prReconciled = (p: GrowPickupRequest) => p.status === 'Completed' || p.status === 'Pickup Failed'

/** The key two requests must share to be the same van turning up twice: the
 *  pickup POINT, which is the typed-in collection address when there is one. */
const pointKey = pickupPointKey

/** Ids of OPEN requests whose window OVERLAPS another open request at the same pickup point. */
export function prDuplicateIds(requests: GrowPickupRequest[]): Set<string> {
  const open = requests.filter((p) => isOpenPr(p.status))
  const dup = new Set<string>()
  open.forEach((a, i) => open.slice(i + 1).forEach((b) => {
    if (pointKey(a) !== pointKey(b) || splitSiblings(a, b)) return
    if (rangesOverlap(a.startAt, a.endAt, b.startAt, b.endAt)) { dup.add(a.id); dup.add(b.id) }
  }))
  return dup
}

/** The sentinel option that reveals a free-form address block in a store select. */
export const OTHER_ADDRESS = '__other__'

/**
 * 'San Pablo Hub — SANPABLO, San Pablo, 4000' — one line per pickup address.
 * A Location Master row can be SPARSE (no city, no postal code), so the dash is
 * dropped rather than left dangling when there is no address to put after it.
 */
export const storeOptionLabel = (s: StoreLocation) => {
  const addr = [s.party.line1, s.party.city, s.party.postalCode].map((x) => x?.trim()).filter(Boolean).join(', ')
  return addr ? `${s.name} — ${addr}` : s.name
}

/** One-line rendering of any party address. */
export const partyLine = (p: Party) =>
  [p.line1, p.line2, p.city, p.state, p.country, p.postalCode].filter((x) => x && x.trim()).join(', ')

/** The minimum a party needs before it can be shipped from or to. */
export const partyOk = (p: Party) => !!(p.name && p.line1 && p.postalCode)

/** A `storeCode` names a local store OR a master-backed pickup point (a
 *  merchant's registered address, a Location Master row) — a pickup raised
 *  against a live location must not print as a raw code. */
export const findStore = (code: string, stores: StoreLocation[]): StoreLocation | undefined =>
  stores.find((s) => s.code === code) ?? masterStoreLocations().find((s) => s.code === code)

export const storeName = (code: string, stores: StoreLocation[]) =>
  findStore(code, stores)?.name ?? code

/** The pickup point's NAME: a typed-in collection address when the booking has
 *  one, otherwise the store location it was raised against. */
export const pickupPointName = (p: GrowPickupRequest, stores: StoreLocation[]) =>
  (p.shipFrom ? (p.shipFrom.name || p.shipFrom.line1) : storeName(p.storeCode, stores)) || p.storeCode

/** The pickup point's ADDRESS line — what a driver actually navigates to. */
export const pickupPointAddress = (p: GrowPickupRequest, stores: StoreLocation[]) =>
  (p.shipFrom ? partyLine(p.shipFrom) : storeAddress(p.storeCode, stores))

/** The pickup address a driver would drive to = the store's own party address. */
export const storeAddress = (code: string, stores: StoreLocation[]) => {
  const p = findStore(code, stores)?.party
  if (!p) return '-'
  return [p.line1, p.line2, p.city, p.state, p.postalCode, p.country].filter((s) => s && s.trim()).join(', ')
}

/* ------------------------------------------------ book a pickup: grouping ---- */

/** One booking-to-be: a parcel handover collected at ONE point and dropped at ONE
 *  hub, or a single dedicated vehicle. */
export interface PickupGroup {
  key: string
  storeCode: string
  /** Parcel: the inbound hub. Vehicle: null — Ship To carries the destination. */
  destinationCode: string | null
  /** Set for a vehicle group; the booking is then an FTL request. */
  vehicle?: { vehicleType: string; vehicleUnit: number; shipTo: Party | null; ftlServiceType?: string | null }
  /** What the card's header says after the arrow. */
  destinationLabel: string
  orders: GrowOrder[]
  weightKg: number
}

/** 'Quezon City' / 'Metro Manila' / the receiver's name — the shortest honest label. */
const dropLabel = (p: Party) => p.city || p.state || p.name || 'destination'

/**
 * Split a selection into the bookings it actually implies.
 *
 *  - A **parcel or document** order is collected at one address and dropped at
 *    one inbound hub, so `(storeCode, inboundHubCode)` is the grouping key —
 *    NOT a merchant choice.
 *  - An **FTL** order is a whole vehicle: it can never share a booking, not
 *    even with parcels from the same store, so each one is its own group.
 *
 * Insertion-ordered, so removing an order never re-shuffles the cards above it.
 */
export function groupForPickup(orders: GrowOrder[], stores: StoreLocation[] = []): PickupGroup[] {
  const out = new Map<string, PickupGroup>()
  orders.forEach((o) => {
    const ftl = o.shipmentType === 'FTL'
    const key = ftl ? `ftl|${o.id}` : `${o.storeCode}|${o.inboundHubCode}`
    const g = out.get(key) ?? {
      key,
      storeCode: o.storeCode,
      destinationCode: ftl ? null : o.inboundHubCode,
      destinationLabel: ftl ? dropLabel(o.receiver) : hubName(o.inboundHubCode, stores),
      ...(ftl ? { vehicle: { vehicleType: o.vehicleType, vehicleUnit: o.vehicleUnit ?? 1, shipTo: o.receiver, ftlServiceType: o.serviceType || null } } : {}),
      orders: [],
      weightKg: 0,
    }
    g.orders.push(o)
    g.weightKg += (o.shipmentType === 'FTL' ? o.actualLoad ?? o.pkg.weightKg : o.pkg.weightKg) || 0
    out.set(key, g)
  })
  return [...out.values()]
}

/** '4 pickup requests will be created — 3 parcel pickups, 1 FTL'. */
export function bookingBanner(groups: PickupGroup[]): string {
  const n = groups.length
  if (n === 0) return 'Every order has been removed — nothing left to book.'
  const ftl = groups.filter((g) => g.vehicle).length
  const parcel = n - ftl
  const parts = [
    parcel > 0 ? `${parcel} parcel pickup${parcel === 1 ? '' : 's'}` : '',
    ftl > 0 ? `${ftl} FTL` : '',
  ].filter(Boolean)
  const tail = parts.length > 1 ? ` — ${parts.join(', ')}` : ' — one per pickup location and destination'
  return `${n} pickup request${n === 1 ? '' : 's'} will be created${tail}`
}

/** The one line above the booking cards: '3 pickup requests will be created'. */
export const bookingCountLine = (n: number) =>
  `${n} pickup request${n === 1 ? '' : 's'} will be created`

/**
 * What a booking card says on its right:
 * parcel `4 orders · 12.4 kg`, vehicle `FTL · 8 Ton Truck · Inland FTL · 6,400 kg`.
 */
export function groupLoadLabel(g: PickupGroup): string {
  if (!g.vehicle) return `${g.orders.length} order${g.orders.length === 1 ? '' : 's'} · ${g.weightKg.toFixed(1)} kg`
  const v = g.vehicle
  return [
    'FTL',
    `${v.vehicleUnit > 1 ? `${v.vehicleUnit} × ` : ''}${v.vehicleType || 'Truck'}`,
    v.ftlServiceType || '',
    `${Math.round(g.weightKg).toLocaleString()} kg`,
  ].filter(Boolean).join(' · ')
}

/* ------------------------------------------ pickup-request list vocabulary ---- */

/** The Pickup Requests page's Status listbox: the platform states + the derived outcomes. */
export const PR_LIST_STATUSES = [...PR_STATUSES, PARTIALLY_PICKED, 'In transit to hub', 'Handed Over'] as const

/** Every Status value a request answers to — its state, plus any derived outcome it shows. */
export function prStatusLabels(p: GrowPickupRequest): string[] {
  const out: string[] = [p.status]
  if (prOutcomeLabel(p) === PARTIALLY_PICKED) out.push(PARTIALLY_PICKED)
  if (isInTransitToHub(p)) out.push('In transit to hub')
  if (isHandedOver(p)) out.push('Handed Over')
  return out
}

/** The Attention Required filter's values (owner, 2026-09-25 — was "Exception"). */
export const PR_EXCEPTIONS = ['Overdue', 'Discrepancy', 'Duplicate', 'Re-attempt available'] as const

/** What needs the merchant's attention on a request (the Attention Required filter). */
export function prExceptionFlags(p: GrowPickupRequest, dupes: ReadonlySet<string>, now = Date.now()): string[] {
  const out: string[] = []
  if (prOverdue(p, now)) out.push('Overdue')
  if (hasDiscrepancy(p)) out.push('Discrepancy')
  if (dupes.has(p.id)) out.push('Duplicate')
  if (canReattempt(p)) out.push('Re-attempt available')
  return out
}

/* --------------------------------------------------------- column prefs ---- */

/**
 * The visible-column choice of a configurable grid, persisted per grid in
 * localStorage (a per-viewer convenience — it may come back empty). Unknown
 * keys in a stored list are dropped; an empty / unreadable store = `defaults`.
 */
export { useColumnPrefs } from '../../local/columnPrefs'
