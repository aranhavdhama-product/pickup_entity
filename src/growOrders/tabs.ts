/**
 * Orders-page vocabulary — the status tabs the merchant portal is folded into.
 *
 * The real portal splits an order across two pages (Order while unpaid/draft,
 * Tracking once paid, with pickup booking only on Tracking). Here it is ONE
 * page whose tabs are derived from the order itself, so nothing can fall
 * between the two surfaces.
 */
import type { GrowOrder, GrowPickupRequest, PickupRequestStatus } from './types'

/**
 * The order's FLOW BUCKET — where it stands in the merchant's lifecycle. No
 * longer a tab set: the Consignment Order page (`/grow/orders`) has no tabs,
 * like the console's Orders page. Kept because `tabOf` still answers "is this
 * order bookable" for the pickup dialogs and the console.
 */
export const ORDER_TABS = [
  'All Orders', 'Drafts', 'Ready for Pickup', 'Pickup Scheduled', 'In Transit', 'Delivered', 'Exceptions',
] as const
export type OrderTab = (typeof ORDER_TABS)[number]

/**
 * Which tab an order belongs to. Total by construction: every order lands on
 * exactly one tab, and the two trailing fallbacks catch legacy rows (e.g. a
 * 'Pickup Scheduled' status with no pickup request behind it).
 */
export function tabOf(o: GrowOrder): Exclude<OrderTab, 'All Orders'> {
  if (o.isDraft || o.paymentStatus === 'Unpaid') return 'Drafts'
  if (o.status === 'Undelivered' || o.status === 'Cancelled') return 'Exceptions'
  if (o.status === 'Delivered') return 'Delivered'
  if (o.status === 'In Transit' || o.status === 'Out for Delivery') return 'In Transit'
  if (o.pickupRequestId && (o.status === 'Pickup Scheduled' || o.status === 'Picked Up')) return 'Pickup Scheduled'
  if (o.status === 'Order Created' && !o.pickupRequestId) return 'Ready for Pickup'
  return o.status === 'Pickup Scheduled' || o.status === 'Picked Up' ? 'Pickup Scheduled' : 'Ready for Pickup'
}

/* ------------------------------------------------------- display statuses ---- */

/**
 * The ONE status vocabulary the merchant ever sees. The raw `OrderStatus` is a
 * platform field and says `Order Created` for two different situations — paid
 * and waiting for a courier, or already inside a booking — so a chip or a filter
 * built on it can never offer "Ready for Pickup". Everything user-facing (the
 * grid chip, the Status filter, the order header) uses this instead; the raw
 * status stays internal.
 */
export const DISPLAY_STATUSES = [
  'Draft', 'Ready for Pickup', 'Pickup Scheduled', 'Picked Up', 'In Transit',
  'Out for Delivery', 'Delivered', 'Undelivered', 'Cancelled',
] as const
export type DisplayStatus = (typeof DISPLAY_STATUSES)[number]

/** Total by construction — every order has exactly one display status. */
export function displayStatus(o: GrowOrder): DisplayStatus {
  if (o.isDraft || o.paymentStatus === 'Unpaid') return 'Draft'
  if (o.status === 'Order Created') return o.pickupRequestId ? 'Pickup Scheduled' : 'Ready for Pickup'
  return o.status as DisplayStatus
}

/** Per-display-status counts, always off the UNFILTERED list so options never vanish. */
export function displayStatusCounts(orders: GrowOrder[]): Record<DisplayStatus, number> {
  const c = Object.fromEntries(DISPLAY_STATUSES.map((s) => [s, 0])) as Record<DisplayStatus, number>
  orders.forEach((o) => { c[displayStatus(o)] += 1 })
  return c
}

/**
 * May the CONSOLE put this consignment on a pickup? Ready for Pickup and free of
 * a data-validation issue (`error`) — the console's Consignments page shows such
 * a row only under Data Validation Issues, so it is not yet a real consignment
 * (scenario 4). Fixing the error makes it eligible again: nothing is stored.
 * The merchant portal keeps `tabOf` (it flags the row, it does not hide it).
 */
export const isPickupEligible = (o: GrowOrder): boolean => tabOf(o) === 'Ready for Pickup' && !o.error

/** Pickup windows offered by the booking sheet (as on the portal's Book Pickup dialog).
 *  NB the separator is an EN DASH (U+2013) — parse slots with /[–-]/, never '-'. */
export const PICKUP_SLOTS = ['09:00–13:00', '13:00–17:00', '17:00–20:00']

/** YYYY-MM-DD, n days from today (negative = in the past). */
export const daysFromNow = (n: number): string => {
  const d = new Date(); d.setDate(d.getDate() + n)
  const p = (x: number) => String(x).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}
export const tomorrow = (): string => daysFromNow(1)

/* ------------------------------------------------- pickup window (local) ---- */

/**
 * A pickup window is a pair of LOCAL date-times, `YYYY-MM-DDTHH:mm` — the value
 * an `<input type="datetime-local">` speaks — so a window may cross midnight.
 * `date` (= the start date) and `slot` stay on the record, DERIVED from the
 * pair, because every list, filter and label was written against them.
 */
export const localIso = (d: Date): string => {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

/** 'YYYY-MM-DDTHH:mm' → a LOCAL Date (never parsed as UTC). */
export const atDate = (at: string): Date => {
  const [d = '', t = '00:00'] = (at ?? '').split('T')
  const [y, m, day] = d.split('-').map(Number)
  const [hh, mm] = t.split(':').map(Number)
  return new Date(y || 1970, (m || 1) - 1, day || 1, hh || 0, mm || 0)
}

/** 'YYYY-MM-DDTHH:mm' → ['YYYY-MM-DD', 'HH:mm']. */
export const atParts = (at: string): [string, string] => {
  const [d = '', t = ''] = (at ?? '').split('T')
  return [d, t.slice(0, 5)]
}

/** Now, rounded UP to the next 30 minutes — the earliest a pickup can start. */
export const nextHalfHourAt = (now = new Date()): string => {
  const d = new Date(now)
  d.setSeconds(0, 0)
  d.setMinutes(Math.ceil((d.getMinutes() + 1) / 30) * 30)
  return localIso(d)
}

export const addHours = (at: string, h: number): string => {
  const d = atDate(at); d.setHours(d.getHours() + h); return localIso(d)
}

const ddmm = (d: string) => d.split('-').slice(1).reverse().join('/')

/**
 * The `slot` string a start/end pair derives: `HH:mm–HH:mm` within one day
 * (EN DASH, as every older row already uses), `DD/MM HH:mm–DD/MM HH:mm` when
 * the window crosses midnight.
 */
export const slotFrom = (startAt: string, endAt: string): string => {
  const [sd, st] = atParts(startAt), [ed, et] = atParts(endAt)
  return sd && ed && sd !== ed ? `${ddmm(sd)} ${st}–${ddmm(ed)} ${et}` : `${st}–${et}`
}

const timeOf = (s: string) => {
  const m = s.match(/(\d{1,2}):(\d{2})/)
  return m ? `${m[1].padStart(2, '0')}:${m[2]}` : ''
}

/** The pair a PRE-datetime row implies: `date` + `HH:mm–HH:mm`, end rolling to
 *  the next day when it is not after the start. Used to backfill old blobs. */
export function windowFromSlot(date: string, slot: string): { startAt: string; endAt: string } {
  const [a = '', b = ''] = (slot ?? '').split(/[–—-]/).map((x) => x.trim())
  const st = timeOf(a) || '09:00'
  const et = timeOf(b) || '13:00'
  const day = date || daysFromNow(0)
  const startAt = `${day}T${st}`
  let endAt = `${day}T${et}`
  if (atDate(endAt) <= atDate(startAt)) endAt = addHours(`${day}T${et}`, 24)
  return { startAt, endAt }
}

/** Do two pickup windows overlap? Half-open, so 09:00–13:00 and 13:00–17:00 do not. */
export const rangesOverlap = (aStart: string, aEnd: string, bStart: string, bEnd: string): boolean =>
  atDate(aStart) < atDate(bEnd) && atDate(bStart) < atDate(aEnd)

/* ------------------------------------------------- pickup request states ---- */

/** Chip-strip order on the Pickup Requests page. */
export const PR_STATUSES = [
  'Requested', 'Planned', 'Ready For Last Mile Dispatch',
  'Assigned', 'Out For Pickup', 'Completed', 'Pickup Failed', 'Cancelled',
] as const

/** The state every booking is born in — see the note on `PickupRequestStatus`. */
export const PR_ENTRY_STATUS: PickupRequestStatus = 'Requested'

/** The happy path a request walks; `Pickup Failed` / `Cancelled` are side exits. */
export const PR_FLOW: PickupRequestStatus[] = [
  'Requested', 'Planned', 'Ready For Last Mile Dispatch',
  'Assigned', 'Out For Pickup', 'Completed',
]

/** The next state "Simulate next step" moves to, or null at the end of the flow. */
export const nextPrStatus = (s: PickupRequestStatus): PickupRequestStatus | null => {
  const i = PR_FLOW.indexOf(s)
  return i === -1 || i === PR_FLOW.length - 1 ? null : PR_FLOW[i + 1]
}

/**
 * A request with NOTHING to hand over: no booked orders, nothing recorded as
 * picked, and no overage scans. A driver who arrives to nothing has a FAILED
 * pickup, not a completed one, so this is what refuses the Completed transition.
 */
export const prHasNothingToCollect = (
  p: Pick<GrowPickupRequest, 'orderIds' | 'pickedOrderIds' | 'overages'>,
): boolean => p.orderIds.length === 0 && p.pickedOrderIds.length === 0 && p.overages.length === 0

/** Open = still expected to happen; drives the Overdue badge and duplicate detection. */
export const isOpenPr = (s: PickupRequestStatus): boolean =>
  s !== 'Completed' && s !== 'Pickup Failed' && s !== 'Cancelled'

/* ------------------------------------------ console (LOCAL) pickup flags ---- */

/**
 * DERIVED pickup flags for the console's Pickup Requests page. None of these is
 * stored — `PickupRequestStatus` stays the eight platform states, and each flag
 * is a reading of the record, so it can never drift from the facts behind it.
 */
type PrFacts = Pick<GrowPickupRequest,
  'id' | 'status' | 'orderIds' | 'pickedOrderIds' | 'endAt' | 'attempt' | 'maxAttempts' | 'reattemptPrId' | 'handover'>

/** Completed, but something booked here was not collected here — the same rule
 *  as Grow's `prOutcomeLabel` (GrowOrders/utils.ts), restated because this
 *  module cannot import a page. */
export const isPartiallyPicked = (p: Pick<GrowPickupRequest, 'status' | 'orderIds' | 'pickedOrderIds'>): boolean => {
  if (p.status !== 'Completed') return false
  const picked = new Set(p.pickedOrderIds)
  return p.orderIds.some((id) => !picked.has(id))
}

/** Still expected to happen, but the window has already closed. */
export const isOverduePr = (p: Pick<GrowPickupRequest, 'status' | 'endAt'>, now = new Date()): boolean =>
  isOpenPr(p.status) && !!p.endAt && atDate(p.endAt) < now

const sameSet = (a: string[], b: string[]): boolean => {
  const A = new Set(a), B = new Set(b)
  return A.size === B.size && [...A].every((x) => B.has(x))
}

/**
 * The set every required scan must equal for the handover to reconcile.
 * Driver / both: what the driver reports collected (`pickedOrderIds`) — the
 * driver is the authority on what left the dock. Hub-only: nobody scans at the
 * door, so the hub must see everything BOOKED as well as anything picked; a
 * short delivery there is closed by hand (force), never by the first scan.
 */
export const handoverExpected = (p: Pick<GrowPickupRequest, 'orderIds' | 'pickedOrderIds' | 'handover'>): string[] =>
  p.handover.mode === 'hub' ? [...new Set([...p.orderIds, ...p.pickedOrderIds])] : [...new Set(p.pickedOrderIds)]

/** Do the scans the mode requires all agree with what was collected? */
export const handoverReconciled = (p: Pick<GrowPickupRequest, 'orderIds' | 'pickedOrderIds' | 'handover'>): boolean => {
  const want = handoverExpected(p)
  if (!want.length) return false
  const { mode, driverScanned, hubScanned } = p.handover
  if (mode === 'driver') return sameSet(driverScanned, want)
  if (mode === 'hub') return sameSet(hubScanned, want)
  return sameSet(driverScanned, want) && sameSet(hubScanned, want)
}

/** `Handed Over` — collected and the handover closed (reconciled or force-closed). */
export const isHandedOver = (p: Pick<GrowPickupRequest, 'status' | 'handover'>): boolean =>
  p.status === 'Completed' && p.handover.closedAt != null

/** `Discrepancy` — the truck is at the hub and the driver's and hub's scans
 *  disagree, either way round. Never before arrival: en route, the hub simply
 *  has not seen the parcels yet (that is `isInTransitToHub`). */
export const hasDiscrepancy = (p: Pick<GrowPickupRequest, 'status' | 'handover'>): boolean =>
  p.status === 'Completed' && p.handover.mode !== 'hub' && p.handover.closedAt == null
  && p.handover.arrivedAtHubAt != null
  && !sameSet(p.handover.driverScanned, p.handover.hubScanned)

/** `In transit to hub` — collected, a handover still to happen, truck not yet at the hub. */
export const isInTransitToHub = (p: Pick<GrowPickupRequest, 'status' | 'orderIds' | 'pickedOrderIds' | 'handover'>): boolean =>
  p.status === 'Completed' && p.handover.closedAt == null && p.handover.arrivedAtHubAt == null
  && handoverExpected(p).length > 0

/** Looks a request up by id — passed IN, because this module must not import the store. */
export type PrLookup = (id: string) => Pick<GrowPickupRequest, 'status'> | undefined

/** A failed request whose re-attempt is still open: ops must keep seeing it
 *  until the retry completes, fails or is cancelled. */
export const reattemptPending = (p: Pick<GrowPickupRequest, 'status' | 'reattemptPrId'>, byId: PrLookup): boolean => {
  if (p.status !== 'Pickup Failed' || !p.reattemptPrId) return false
  const clone = byId(p.reattemptPrId)
  /* a retry that itself FAILED is done too — it carries its own Exception (or
     Closed, on the last attempt); otherwise every attempt in a chain of three
     failures would sit in Exception forever */
  return !!clone && isOpenPr(clone.status)
}

/** `Re-attempt available` — failed, attempts left, and not already retried. */
export const canReattempt = (p: Pick<GrowPickupRequest, 'status' | 'attempt' | 'maxAttempts' | 'reattemptPrId'>): boolean =>
  p.status === 'Pickup Failed' && p.attempt < p.maxAttempts && !p.reattemptPrId

/**
 * May more orders still join this request? Open, and not past the config's
 * `allowAddToExistingUntil` state on the happy path (Ready For Last Mile
 * Dispatch sits between Planned and Assigned, so it is allowed only when the
 * limit is Assigned).
 */
export const canAddOrdersTo = (
  p: Pick<GrowPickupRequest, 'status'>, until: 'Requested' | 'Planned' | 'Assigned',
): boolean => {
  const i = PR_FLOW.indexOf(p.status)
  return i !== -1 && i <= PR_FLOW.indexOf(until)
}

/**
 * The console's Pickup Requests tabs. `Eligible for Pickup` is NOT a request
 * list — it is the consignments that could be booked (`tabOf(o) === 'Ready for
 * Pickup'`) — so no request ever lands on it and its count comes from the caller.
 */
export const LOCAL_PR_TABS = ['All', 'Eligible for Pickup', 'Active', 'Closed', 'Exception'] as const
export type LocalPrTab = (typeof LOCAL_PR_TABS)[number]
export type LocalPrBucket = Exclude<LocalPrTab, 'All' | 'Eligible for Pickup'>

export const LOCAL_PR_TAB_SLUG: Record<LocalPrTab, string> = {
  All: 'all', 'Eligible for Pickup': 'eligible', Active: 'active', Closed: 'closed', Exception: 'exception',
}
export const localPrTabFromSlug = (slug: string | null): LocalPrTab =>
  LOCAL_PR_TABS.find((t) => LOCAL_PR_TAB_SLUG[t] === slug) ?? 'All'

/**
 * Request → tab. Precedence, deliberately in this order:
 *  1. a CLOSED handover is Closed — ops has finished with it, even a partial pick;
 *  2. collected but still on the truck ("In transit to hub") is Active — nothing
 *     can be reconciled before arrival;
 *  3. anything needing ops attention is Exception — a re-attemptable failure, a
 *     failure whose retry is still open (`byId` given), a partial pick, a scan
 *     discrepancy, an overdue window;
 *  4. an open request is Active;
 *  5. the rest (completed, cancelled, failed with no attempts left or a
 *     resolved retry) is Closed.
 */
export function localPrTabOf(p: PrFacts, now = new Date(), byId?: PrLookup): LocalPrBucket {
  if (p.handover.closedAt != null) return 'Closed'
  if (isInTransitToHub(p)) return 'Active'
  if (canReattempt(p) || (byId && reattemptPending(p, byId)) || isPartiallyPicked(p) || hasDiscrepancy(p)
    || isOverduePr(p, now)) return 'Exception'
  if (isOpenPr(p.status)) return 'Active'
  return 'Closed'
}

export const inLocalPrTab = (p: PrFacts, tab: LocalPrTab, now = new Date(), byId?: PrLookup): boolean =>
  tab === 'All' || (tab !== 'Eligible for Pickup' && localPrTabOf(p, now, byId) === tab)

/** Tab counts off the UNFILTERED lists; `eligibleCount` = Ready-for-Pickup consignments. */
export function localPrTabCounts(prs: PrFacts[], eligibleCount: number, now = new Date()): Record<LocalPrTab, number> {
  const c: Record<LocalPrTab, number> = { All: prs.length, 'Eligible for Pickup': eligibleCount, Active: 0, Closed: 0, Exception: 0 }
  const byId = new Map(prs.map((p) => [p.id, p]))
  prs.forEach((p) => { c[localPrTabOf(p, now, (id) => byId.get(id))] += 1 })
  return c
}
