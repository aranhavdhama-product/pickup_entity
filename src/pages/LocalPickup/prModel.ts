/**
 * Pickup Requests (LOCAL console) — the non-component readings of a request
 * that the list, the detail page and the dialogs all share. Everything here is
 * DERIVED from the growOrders store; nothing is stored. Kept out of the .tsx
 * files so fast refresh stays happy.
 *
 * Deliberately does NOT import `GrowOrders/utils.ts`: that module pulls in the
 * live masters layer, which talks to `/staging` — the LOCAL app never does.
 */
import type { GrowOrder, GrowOrdersDb, GrowPickupRequest, PickupRequestStatus, StoreLocation } from '../../growOrders/types'
import {
  atDate, atParts, canAddOrdersTo, canReattempt, hasDiscrepancy, isHandedOver, isInTransitToHub, isOpenPr,
  isOverduePr, isPartiallyPicked, PR_STATUSES, rangesOverlap, reattemptPending,
} from '../../growOrders/tabs'
import { hubName } from '../../growOrders/hubs'
import { cancelReasonLabel, failureReasonLabel } from '../../growOrders/pickupReasons'
import type { PickupModuleConfig } from '../../config/pickupModule'
import { earliestWindow, pickupPolicy, violatesCutoff, windowLabel } from '../../growOrders/pickupSlots'

export type Tone = 'success' | 'info' | 'warning' | 'danger' | 'neutral'

/* ------------------------------------------------------------ formatting --- */

const p2 = (n: number) => String(n).padStart(2, '0')
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** '2026-09-23' → '23 Sep 2026'. */
export const fmtDay = (d: string): string => {
  const [y, m, day] = d.split('-').map(Number)
  return y ? `${day} ${MON[(m || 1) - 1]} ${y}` : '—'
}

/** '23 Sep 09:00 – 12:00', or both ends dated when the window crosses a day. */
export function fmtWindow(p: { startAt: string; endAt: string }): string {
  const [sd, st] = atParts(p.startAt), [ed, et] = atParts(p.endAt)
  if (!sd) return '—'
  const short = (d: string) => fmtDay(d).split(' ').slice(0, 2).join(' ')
  return sd === ed ? `${short(sd)} ${st} – ${et}` : `${short(sd)} ${st} – ${short(ed)} ${et}`
}

/** An ISO timestamp → '23 Sep 2026, 14:05'. */
export function fmtStamp(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return String(iso)
  return `${d.getDate()} ${MON[d.getMonth()]} ${d.getFullYear()}, ${p2(d.getHours())}:${p2(d.getMinutes())}`
}

/** Multi-day windows get a tag, as on the Grow list. */
export function windowTag(p: { startAt: string; endAt: string }): string {
  const s = atDate(p.startAt), e = atDate(p.endAt)
  const days = Math.round((new Date(e.getFullYear(), e.getMonth(), e.getDate()).getTime()
    - new Date(s.getFullYear(), s.getMonth(), s.getDate()).getTime()) / 86_400_000)
  if (days <= 0) return ''
  return days === 1 ? 'overnight' : `${days + 1} days`
}

/** The 48 half-hours a time picker offers. */
export const TIME_OPTIONS: string[] = Array.from({ length: 48 }, (_, i) => `${p2(Math.floor(i / 2))}:${i % 2 ? '30' : '00'}`)

/* ---------------------------------------------------------------- places --- */

export const storeOf = (code: string, stores: StoreLocation[]) => stores.find((s) => s.code === code)

/** Whose booking this is — the store's business name, as `merchantsOf` groups them. */
export const merchantOfStore = (code: string, stores: StoreLocation[]): string =>
  storeOf(code, stores)?.party.businessName?.trim() || code

export const merchantOfPr = (p: GrowPickupRequest, stores: StoreLocation[]) => merchantOfStore(p.storeCode, stores)

/** One-line store option: 'Manila Pasay Hub — 2GO Express Bldg, Pasay'. */
export const storeLabel = (s: StoreLocation): string => {
  const addr = [s.party.line1, s.party.city].map((x) => x?.trim()).filter(Boolean).join(', ')
  return addr ? `${s.name} — ${addr}` : s.name
}

/** The pickup POINT's name: a typed-in collection address, else the store. */
export const pickupPointName = (p: GrowPickupRequest, stores: StoreLocation[]): string =>
  (p.shipFrom ? p.shipFrom.name || p.shipFrom.line1 : storeOf(p.storeCode, stores)?.name) || p.storeCode

/** The address line a driver navigates to. */
export function pickupPointAddress(p: GrowPickupRequest, stores: StoreLocation[]): string {
  const party = p.shipFrom ?? storeOf(p.storeCode, stores)?.party
  if (!party) return p.storeCode
  return [party.line1, party.line2, party.city, party.state, party.postalCode].map((x) => x?.trim()).filter(Boolean).join(', ')
}

/** Where the collection drops: the inbound hub, an FTL's Ship To, or "hub to be confirmed". */
export function dropLabel(p: GrowPickupRequest, stores: StoreLocation[]): string {
  if (p.destinationCode) return hubName(p.destinationCode, stores)
  if (p.shipmentType === 'FTL' && p.shipTo) return p.shipTo.city || p.shipTo.name || 'Ship To'
  return 'Hub to be confirmed'
}

/** The grouping key a duplicate / merge check uses — same as the store's. */
export const pointKey = (p: Pick<GrowPickupRequest, 'storeCode' | 'shipFrom'>) =>
  `${p.storeCode}|${(p.shipFrom?.line1 ?? '').trim().toLowerCase()}`

/* ----------------------------------------------------------------- loads --- */

export const ordersOf = (p: GrowPickupRequest, byId: Map<string, GrowOrder>): GrowOrder[] =>
  p.orderIds.map((id) => byId.get(id)).filter((o): o is GrowOrder => !!o)

/** Weight shown on a row: the orders' sum, else the reserved booking's estimate (`~`). */
export function weightLabel(p: GrowPickupRequest, byId: Map<string, GrowOrder>): string {
  if (p.orderIds.length) {
    const kg = ordersOf(p, byId).reduce((n, o) => n + (o.pkg.weightKg || 0), 0)
    return `${kg.toFixed(1)} kg`
  }
  if (p.expectedWeightKg != null) return `~${p.expectedWeightKg} kg`
  return '—'
}

/** `1 / 12` for a reserved booking (attached / expected), else the count. */
export const consignmentsLabel = (p: GrowPickupRequest): string =>
  (p.blind && p.expectedPieces != null ? `${p.orderIds.length} / ${p.expectedPieces}` : String(p.orderIds.length))

/* ---------------------------------------------------------------- status --- */

export const PR_STATUS_TONE: Record<PickupRequestStatus, Tone> = {
  Requested: 'neutral', Planned: 'info', 'Ready For Last Mile Dispatch': 'info', Assigned: 'info',
  'Out For Pickup': 'warning', Completed: 'success', 'Pickup Failed': 'danger', Cancelled: 'neutral',
}

export const HANDED_OVER = 'Handed Over'
export const IN_TRANSIT_TO_HUB = 'In transit to hub'
export const PARTIALLY_PICKED = 'Partially picked'

/** Every label the Status filter offers: the eight states + the three outcome readings. */
export const STATUS_FILTER_OPTIONS: string[] = [...PR_STATUSES, PARTIALLY_PICKED, IN_TRANSIT_TO_HUB, HANDED_OVER]

/** The outcome-aware label the Status pill shows. */
export function statusLabel(p: GrowPickupRequest): { label: string; tone: Tone } {
  if (p.status === 'Completed') {
    if (isHandedOver(p)) return { label: HANDED_OVER, tone: 'success' }
    if (isInTransitToHub(p)) return { label: IN_TRANSIT_TO_HUB, tone: 'info' }
    if (isPartiallyPicked(p)) return { label: PARTIALLY_PICKED, tone: 'warning' }
  }
  return { label: p.status, tone: PR_STATUS_TONE[p.status] }
}

/** Does this request answer to a Status-filter label? */
export const matchesStatus = (p: GrowPickupRequest, want: string): boolean =>
  p.status === want || statusLabel(p).label === want || (want === PARTIALLY_PICKED && isPartiallyPicked(p))

/** Ids of OPEN requests whose window overlaps another open one at the same point. */
export function duplicateIds(prs: GrowPickupRequest[]): Set<string> {
  const open = prs.filter((p) => isOpenPr(p.status))
  const dup = new Set<string>()
  open.forEach((a, i) => open.slice(i + 1).forEach((b) => {
    if (pointKey(a) === pointKey(b) && rangesOverlap(a.startAt, a.endAt, b.startAt, b.endAt)) { dup.add(a.id); dup.add(b.id) }
  }))
  return dup
}

/** The small tags beside the pill — each one a reading ops acts on. */
export function statusTags(p: GrowPickupRequest, dup: Set<string>, now = new Date(),
  byId?: (id: string) => GrowPickupRequest | undefined): { label: string; tone: Tone }[] {
  const out: { label: string; tone: Tone }[] = []
  if (isOverduePr(p, now)) out.push({ label: 'Overdue', tone: 'danger' })
  if (hasDiscrepancy(p)) out.push({ label: 'Discrepancy', tone: 'danger' })
  if (dup.has(p.id)) out.push({ label: 'Duplicate', tone: 'warning' })
  if (isPartiallyPicked(p) && statusLabel(p).label !== PARTIALLY_PICKED) out.push({ label: PARTIALLY_PICKED, tone: 'warning' })
  if (canReattempt(p)) out.push({ label: 'Re-attempt available', tone: 'info' })
  /* the automatic (or ops-raised) retry is still open — why this failure sits in Exception */
  if (byId && reattemptPending(p, byId)) out.push({ label: `Re-attempt scheduled · ${byId(p.reattemptPrId!)?.number ?? ''}`.trim(), tone: 'info' })
  return out
}

/** The chips beside the reference: Reserved / FTL / attempt n/N. */
export function referenceChips(p: GrowPickupRequest): string[] {
  const out: string[] = []
  if (p.blind) out.push('Reserved')
  if (p.shipmentType === 'FTL') out.push('FTL')
  if (p.attempt > 1 || p.status === 'Pickup Failed') out.push(`attempt ${p.attempt}/${p.maxAttempts}`)
  return out
}

export const reasonText = (p: GrowPickupRequest): string =>
  (p.status === 'Cancelled' ? cancelReasonLabel(p.cancelReason) : p.status === 'Pickup Failed' ? failureReasonLabel(p.failureReason) : '')

/* --------------------------------------------------------------- actions --- */

/** Before the driver has left, a request can still be planned, moved or re-allocated. */
export const beforeDispatch = (p: GrowPickupRequest): boolean => isOpenPr(p.status) && p.status !== 'Out For Pickup'

export const can = {
  addToRoute: (p: GrowPickupRequest) => beforeDispatch(p) && p.carrierMode !== 'CARRIER',
  assignCarrier: (p: GrowPickupRequest) => beforeDispatch(p),
  reschedule: (p: GrowPickupRequest) => beforeDispatch(p),
  cancel: (p: GrowPickupRequest) => isOpenPr(p.status),
  markFailed: (p: GrowPickupRequest) => isOpenPr(p.status),
  manualPickup: (p: GrowPickupRequest) => p.status !== 'Cancelled' && p.status !== 'Completed' && !p.reattemptPrId && p.orderIds.length > 0,
  reattempt: (p: GrowPickupRequest) => canReattempt(p),
  addConsignments: (p: GrowPickupRequest, cfg: PickupModuleConfig) => canAddOrdersTo(p, cfg.allowAddToExistingUntil),
  switchToFleet: (p: GrowPickupRequest) => isOpenPr(p.status) && p.carrierMode === 'CARRIER',
  merge: (p: GrowPickupRequest) => (p.status === 'Requested' || p.status === 'Planned') && p.shipmentType !== 'FTL',
  removeConsignment: (p: GrowPickupRequest) => beforeDispatch(p),
}

/* --------------------------------------------------------------- carriers --- */

export interface CarrierOption { code: string; name: string; mode: 'FLEET' | 'CARRIER' }

/** The fixed list the local app has no carrier master for. */
export const DEFAULT_CARRIERS: CarrierOption[] = [
  { code: 'OWN_FLEET', name: 'Own fleet', mode: 'FLEET' },
  { code: 'LBC', name: 'LBC Express', mode: 'CARRIER' },
  { code: 'ENTREGO', name: 'Entrego', mode: 'CARRIER' },
  { code: 'JNT', name: 'J&T Express', mode: 'CARRIER' },
]

/** Carriers already present on requests (the seed's 3PL allocations), then the defaults. */
export function carrierOptions(prs: GrowPickupRequest[]): CarrierOption[] {
  const seen = new Map<string, CarrierOption>()
  prs.forEach((p) => {
    if (p.carrierCode && p.carrierName && p.carrierMode) seen.set(p.carrierCode, { code: p.carrierCode, name: p.carrierName, mode: p.carrierMode })
  })
  DEFAULT_CARRIERS.forEach((c) => { if (!seen.has(c.code)) seen.set(c.code, c) })
  return [...seen.values()]
}

/* -------------------------------------------------------------- eligible --- */

export interface EligibleRow {
  id: string
  orderNumber: string
  merchant: string
  storeCode: string
  pickupName: string
  hub: string
  weightKg: number
  createdAt: string
  ftl: boolean
  order: GrowOrder
}

export function toEligibleRow(o: GrowOrder, stores: StoreLocation[]): EligibleRow {
  return {
    id: o.id, orderNumber: o.orderNumber, merchant: merchantOfStore(o.storeCode, stores), storeCode: o.storeCode,
    pickupName: storeOf(o.storeCode, stores)?.name ?? o.storeCode,
    hub: o.shipmentType === 'FTL' ? (o.receiver.city || 'Ship To') : hubName(o.inboundHubCode, stores),
    weightKg: (o.shipmentType === 'FTL' ? o.actualLoad ?? o.pkg.weightKg : o.pkg.weightKg) || 0,
    createdAt: o.createdAt, ftl: o.shipmentType === 'FTL', order: o,
  }
}

/** One booking-to-be: parcels at ONE point to ONE hub, or a single FTL order. */
export interface BookingGroup {
  key: string
  storeCode: string
  destinationCode: string | null
  orders: GrowOrder[]
  weightKg: number
  ftl: boolean
}

export function groupOrders(orders: GrowOrder[]): BookingGroup[] {
  const out = new Map<string, BookingGroup>()
  orders.forEach((o) => {
    const ftl = o.shipmentType === 'FTL'
    const key = ftl ? `ftl|${o.id}` : `${o.storeCode}|${o.inboundHubCode}`
    const g = out.get(key) ?? { key, storeCode: o.storeCode, destinationCode: ftl ? null : o.inboundHubCode, orders: [], weightKg: 0, ftl }
    g.orders.push(o)
    g.weightKg += (ftl ? o.actualLoad ?? o.pkg.weightKg : o.pkg.weightKg) || 0
    out.set(key, g)
  })
  return [...out.values()]
}

/** Open requests a group may JOIN: same pickup store, parcel, same hub (or TBC), and within the config's add-until state. */
export function joinableFor(g: BookingGroup, db: Pick<GrowOrdersDb, 'pickupRequests'>, cfg: PickupModuleConfig): GrowPickupRequest[] {
  if (g.ftl) return []
  return db.pickupRequests.filter((p) => p.storeCode === g.storeCode && p.shipmentType !== 'FTL'
    && canAddOrdersTo(p, cfg.allowAddToExistingUntil)
    && (p.destinationCode == null || p.destinationCode === g.destinationCode))
}

/* -------------------------------------------------------------------- csv --- */

const cell = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`

export function prCsv(prs: GrowPickupRequest[], db: GrowOrdersDb): string {
  const byId = new Map(db.orders.map((o) => [o.id, o]))
  const head = ['Reference', 'Status', 'Window start', 'Window end', 'Pickup point', 'Pickup address', 'Drops at', 'Merchant',
    'Consignments', 'Weight', 'Type', 'Reserved', 'Source', 'Driver', 'Carrier', 'Trip', 'Attempt', 'Reason']
  const rows = prs.map((p) => [
    p.number, statusLabel(p).label, p.startAt, p.endAt, pickupPointName(p, db.stores), pickupPointAddress(p, db.stores),
    dropLabel(p, db.stores), merchantOfPr(p, db.stores), consignmentsLabel(p), weightLabel(p, byId),
    p.shipmentType === 'FTL' ? 'FTL' : 'LTL', p.blind ? 'Yes' : 'No', p.source, p.driverName ?? '', p.carrierName ?? '',
    p.tripId ?? '', `${p.attempt}/${p.maxAttempts}`, reasonText(p),
  ])
  return [head, ...rows].map((r) => r.map(cell).join(',')).join('\n')
}

export function eligibleCsv(rows: EligibleRow[]): string {
  const head = ['Consignment', 'Merchant', 'Pickup point', 'Drops at', 'Weight (kg)', 'Type', 'Created']
  return [head, ...rows.map((r) => [r.orderNumber, r.merchant, r.pickupName, r.hub, r.weightKg, r.ftl ? 'FTL' : 'LTL', r.createdAt])]
    .map((r) => r.map(cell).join(',')).join('\n')
}

/* ------------------------------------------------------------ window rule --- */

/** The earliest window a booking made now may take, for this merchant's policy. */
export const earliestFor = (merchantCode?: string | null, now = new Date()) => earliestWindow(now, pickupPolicy(merchantCode))

/** The inline rule every booking dialog shows: 'Same-day pickup closes at 12:00 · earliest window Tue 24 Sep 09:00–12:00'. */
export function ruleLine(merchantCode?: string | null, now = new Date()): string {
  const pol = pickupPolicy(merchantCode)
  return `Same-day pickup closes at ${pol.sameDayCutoff} · earliest window ${windowLabel(earliestWindow(now, pol))}`
}

const MAX_WINDOW_MS = 7 * 86_400_000

/** Why a window cannot be booked, or null. `maxDaysAhead` = the reschedule horizon. */
export function windowError(startAt: string, endAt: string, merchantCode?: string | null,
  opts: { maxDaysAhead?: number; now?: Date } = {}): string | null {
  const now = opts.now ?? new Date()
  if (!startAt || !endAt || !atParts(startAt)[1] || !atParts(endAt)[1]) return 'Pick a start and an end for the window'
  const s = atDate(startAt), e = atDate(endAt)
  if (e <= s) return 'The window must end after it starts'
  if (e.getTime() - s.getTime() > MAX_WINDOW_MS) return 'A pickup window can span at most 7 days'
  if (opts.maxDaysAhead != null && s.getTime() > now.getTime() + (opts.maxDaysAhead + 1) * 86_400_000) {
    return `Reschedules are allowed up to ${opts.maxDaysAhead} days ahead`
  }
  return violatesCutoff(startAt, now, pickupPolicy(merchantCode))
}
