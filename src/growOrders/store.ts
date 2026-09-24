/**
 * Grow orders demo store — same contract as src/pickup/store.ts:
 * reactive via useSyncExternalStore, persisted to localStorage, snapshot
 * identity only changes on a real mutation.
 */
import { useSyncExternalStore } from 'react'
import type {
  CarrierMode, GrowOrder, GrowOrdersDb, GrowPickupRequest, HandoverScan, HubOverage, Party, PickupHandover, PickupPod,
  PickupOverage, PickupRequestStatus, PickupSource, ShipmentType, SizeClass, StoreLocation,
} from './types'
import type { OrderDraft } from './draft'
import { blankParty, CURRENCY, seed, STORES } from './seed'
import { DEFAULT_INBOUND_HUB, inboundHubFor } from './hubs'
import {
  addHours, atDate, atParts, canAddOrdersTo, canReattempt, handoverReconciled, isOpenPr, localIso, nextPrStatus,
  PICKUP_SLOTS, PR_ENTRY_STATUS, PR_STATUSES, prHasNothingToCollect, rangesOverlap, slotFrom, tabOf, windowFromSlot,
} from './tabs'
import { blankHandover, PR_DEFAULTS, SIZE_CLASSES } from './types'
import { cancelReasonLabel, failureReasonLabel, NO_ORDERS_REASON } from './pickupReasons'
import { nextBusinessDay, pickupPolicy, autoPickupWindow } from './pickupSlots'
import { readPickupModuleConfig } from '../config/pickupModule'

/** -v9: `Created` and `Requested` MERGED into the single entry status `Requested`. The key bump is
 *  what re-seeds an existing browser so its rows are retagged; a hand-restored v8 blob still loads,
 *  because normalizePr() migrates a stored 'Created' (and the pre-v4 'Driver Assigned') on the way in.
 *  -v8 added pickup reconciliation: `pickedOrderIds` + `overages` on requests, `pickedInRequestId`
 *  on orders — all still back-filled in normalize()/normalizePr(). */
/**
 * v10 adds two seeded REVERSE orders. The key bump is what makes an existing
 * browser RESEED and pick them up — so the old key is deliberately NOT read as
 * a fallback: adopting it would preserve the stale blob and the new rows would
 * never appear, which is the opposite of what a version bump is for.
 *
 * `normalize` / `normalizePr` are unchanged and still parse a v9-shaped record
 * (v10 added no new required fields), so a v9 blob copied under this key loads
 * without error — only the automatic adoption is gone.
 */
/* v11: FTL seed rows carry `vehicles` + the service type is the order's serviceType */
/* v12: first-mile execution — requests carry trip / carrier / attempt / handover
   fields, and the seed gains trips, a discrepancy and a re-attemptable failure.
   normalizePr() back-fills every new field, so a v11 blob copied here still loads. */
/* v13: PR-000136's automatic re-attempt PR-000137 is seeded (the re-attempt chain);
   bumped TOGETHER with planningStore's key so both stores reseed as one. */
/* v14: seed clean-up (one inbound hub per parcel PR, FTL orders on their own
   PRs 138/139, PR-000129's auto re-attempt PR-000140, PR-000104 back to
   Requested) + `carrierPickupRef`; bumped TOGETHER with planningStore's v4. */
const KEY = 'fareye-grow-orders-v15'

/** Explicit field defaults — deliberately NOT derived from a seed row, so what a
 *  persisted blob inherits can never drift with the seed data. */
export const ORDER_DEFAULTS: GrowOrder = {
  id: '', orderNumber: '', orderType: 'Forward Order', createdAt: new Date(0).toISOString(),
  status: 'Order Created', storeCode: STORES[0].code, inboundHubCode: DEFAULT_INBOUND_HUB,
  sender: blankParty(), receiver: blankParty(),
  drops: [], shipmentType: 'Parcel', vehicleType: '',
  pkg: { kind: 'Parcel', count: 1, weightKg: 0, lengthCm: 0, widthCm: 0, heightCm: 0, description: '', declaredValue: 0 },
  paymentMode: 'Prepaid', codAmount: 0, currency: CURRENCY,
  carrier: '', serviceType: '', trackingNumber: '', pickupDate: '', remarks: '', error: '',
  paymentStatus: 'Paid', isDraft: false, pickupRequestId: null, pickedInRequestId: null, draft: null,
  /* no stored quote unless checkout froze one — everything else derives */
  charges: null,
}
const DEFAULTS = ORDER_DEFAULTS

export { PR_DEFAULTS, blankHandover }

/** The execution block of a request born NOW — this is where the config is snapshotted. */
function freshExecution(source: PickupSource, merchantCode?: string | null) {
  const cfg = readPickupModuleConfig()
  return { ...PR_DEFAULTS, source, maxAttempts: pickupPolicy(merchantCode).maxAttempts, handover: blankHandover(cfg.scanMode),
    notPickedReasons: {} as Record<string, string> }
}

/** Two requests are the same collection POINT when store and typed-in address agree. */
const pointKey = (p: Pick<GrowPickupRequest, 'storeCode' | 'shipFrom'>) =>
  `${p.storeCode}|${(p.shipFrom?.line1 ?? '').trim().toLowerCase()}`

/** Fill fields added after a record was persisted, so an old blob never crashes a page. */
function normalize(o: Partial<GrowOrder>): GrowOrder {
  /* merged first: the hub default is DERIVED from the receiver, and an object
     literal cannot read its own siblings */
  const receiver = { ...DEFAULTS.receiver, ...(o.receiver ?? {}) }
  return {
    ...DEFAULTS, ...o,
    inboundHubCode: o.inboundHubCode || inboundHubFor(receiver),
    drops: Array.isArray(o.drops) ? o.drops : [],
    shipmentType: o.shipmentType === 'FTL' ? 'FTL' : 'Parcel',
    vehicleType: o.vehicleType ?? '',
    ...(Array.isArray(o.vehicles) && o.vehicles.length ? { vehicles: o.vehicles } : {}),
    paymentStatus: o.paymentStatus === 'Unpaid' ? 'Unpaid' : 'Paid',
    isDraft: o.isDraft === true,
    pickupRequestId: o.pickupRequestId ?? null,
    pickedInRequestId: o.pickedInRequestId ?? null,
    draft: o.draft ?? null,
    pkg: { ...DEFAULTS.pkg, ...(o.pkg ?? {}) },
    sender: { ...DEFAULTS.sender, ...(o.sender ?? {}) },
    receiver,
  } as GrowOrder
}

/**
 * Older blobs must still load cleanly:
 *  - pre-v9 `'Created'` — the state merged into `Requested`.
 *  - pre-v4 `'Driver Assigned'` — renamed to `Assigned`.
 * Anything unrecognised falls back to the entry state rather than crashing a page.
 */
function toPrStatus(s: unknown): PickupRequestStatus {
  if (s === 'Driver Assigned') return 'Assigned'
  if (s === 'Created') return PR_ENTRY_STATUS
  return (PR_STATUSES as readonly string[]).includes(s as string) ? (s as PickupRequestStatus) : PR_ENTRY_STATUS
}

/**
 * One window shape from whatever a caller has: the datetime pair wins, and a
 * `{date, slot}` caller (or a pre-datetime blob) is lifted into one.
 */
export function pickupWindow(x: { startAt?: string; endAt?: string; date?: string; slot?: string }): {
  startAt: string; endAt: string; date: string; slot: string
} {
  const pair = x.startAt && x.endAt
    ? { startAt: x.startAt, endAt: x.endAt }
    : windowFromSlot(x.date ?? '', x.slot ?? PICKUP_SLOTS[0])
  return { ...pair, date: atParts(pair.startAt)[0], slot: slotFrom(pair.startAt, pair.endAt) }
}

/** Requests used to bypass normalisation entirely — they no longer do. */
function normalizePr(p: Partial<GrowPickupRequest>): GrowPickupRequest {
  const status = toPrStatus(p.status)
  const createdAt = p.createdAt ?? new Date(0).toISOString()
  /* pre-datetime blobs only carry date + slot — rebuild the pair from them */
  const w = pickupWindow(p)
  return {
    id: p.id ?? newPrId(),
    number: p.number ?? 'PR-000000',
    storeCode: p.storeCode ?? STORES[0].code,
    destinationCode: p.destinationCode ?? null,
    startAt: w.startAt,
    endAt: w.endAt,
    date: w.date,
    slot: w.slot,
    orderIds: Array.isArray(p.orderIds) ? p.orderIds : [],
    /* normalizePr is a WHITELIST, not a spread over defaults — a field that is not
       named here is dropped on the next reload */
    pickedOrderIds: Array.isArray(p.pickedOrderIds) ? p.pickedOrderIds : [],
    overages: Array.isArray(p.overages) ? p.overages : [],
    status,
    createdAt,
    instructions: p.instructions,
    statusHistory: Array.isArray(p.statusHistory) && p.statusHistory.length
      ? p.statusHistory
      : [{ status, at: createdAt }],
    /* a pre-v5 blob is an ordinary order-backed request by construction */
    blind: p.blind === true,
    shipmentType: p.shipmentType === 'FTL' ? 'FTL' : 'Parcel',
    vehicleUnit: num(p.vehicleUnit),
    /* pre-rename blobs carried pickupAddress / sendTo */
    shipFrom: p.shipFrom ?? (p as { pickupAddress?: Party | null }).pickupAddress ?? null,
    shipTo: p.shipTo ?? (p as { sendTo?: Party | null }).sendTo ?? null,
    expectedPieces: num(p.expectedPieces),
    expectedWeightKg: num(p.expectedWeightKg),
    sizeClass: (SIZE_CLASSES as readonly string[]).includes(p.sizeClass as string) ? (p.sizeClass as SizeClass) : null,
    vehicleType: p.vehicleType ?? null,
    ftlServiceType: p.ftlServiceType ?? null,
    contactName: p.contactName ?? '',
    contactNumber: p.contactNumber ?? '',
    note: p.note ?? '',
    /* first-mile execution (v12) — a pre-v12 row was never routed or retried */
    tripId: strOrNull(p.tripId),
    driverName: strOrNull(p.driverName),
    carrierCode: strOrNull(p.carrierCode),
    carrierName: strOrNull(p.carrierName),
    carrierMode: p.carrierMode === 'FLEET' || p.carrierMode === 'CARRIER' ? p.carrierMode : null,
    carrierPickupRef: strOrNull(p.carrierPickupRef),
    attempt: posInt(p.attempt, PR_DEFAULTS.attempt),
    maxAttempts: posInt(p.maxAttempts, PR_DEFAULTS.maxAttempts),
    failureReason: strOrNull(p.failureReason),
    cancelReason: strOrNull(p.cancelReason),
    manualOverride: p.manualOverride === 'Picked Up' || p.manualOverride === 'Failed' ? p.manualOverride : null,
    parentPrId: strOrNull(p.parentPrId),
    reattemptPrId: strOrNull(p.reattemptPrId),
    handover: normalizeHandover(p.handover),
    notPickedReasons: p.notPickedReasons && typeof p.notPickedReasons === 'object'
      ? Object.fromEntries(Object.entries(p.notPickedReasons).filter(([, v]) => typeof v === 'string'))
      : {},
    source: oneOf(p.source, ['Merchant', 'Console', 'API', 'Auto'] as const, PR_DEFAULTS.source),
  }
}

const strOrNull = (v: unknown): string | null => (typeof v === 'string' && v ? v : null)
const idList = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])
const posInt = (v: unknown, d: number): number => (typeof v === 'number' && Number.isFinite(v) && v >= 1 ? Math.round(v) : d)
function oneOf<T extends string>(v: unknown, allowed: readonly T[], d: T): T {
  return (allowed as readonly string[]).includes(v as string) ? (v as T) : d
}

function normalizeHandover(h: unknown): PickupHandover {
  const x = (h && typeof h === 'object' ? h : {}) as Partial<PickupHandover>
  return {
    mode: oneOf(x.mode, ['driver', 'hub', 'both'] as const, 'both'),
    driverScanned: idList(x.driverScanned),
    hubScanned: idList(x.hubScanned),
    manifestRef: strOrNull(x.manifestRef),
    closedAt: strOrNull(x.closedAt),
    arrivedAtHubAt: strOrNull(x.arrivedAtHubAt),
    pod: x.pod && typeof x.pod === 'object'
      ? { signature: x.pod.signature === true, photo: x.pod.photo === true, otp: x.pod.otp === true,
        at: typeof x.pod.at === 'string' ? x.pod.at : new Date(0).toISOString() }
      : null,
    scanLog: Array.isArray(x.scanLog)
      ? (x.scanLog as Partial<HandoverScan>[])
        .filter((e) => e && typeof e.orderId === 'string')
        .map((e) => ({ orderId: e.orderId as string, by: e.by === 'driver' ? 'driver' as const : 'hub' as const,
          at: e.at ?? new Date(0).toISOString(), hubCode: strOrNull(e.hubCode), damaged: e.damaged === true,
          ...(e.forwarded === true ? { forwarded: true } : {}) }))
      : [],
  }
}

/** A stored number that survives a hand-edited blob — anything else becomes null. */
function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

/**
 * Stores used to be trusted verbatim — they no longer are. Half the module
 * indexes straight into `db.stores[0].party` (the Create Order stepper) or maps
 * `stores.map((s) => s.party)` into an address book, so ONE entry without a
 * party took a page down with a `TypeError` rather than a missing name.
 */
function normalizeStore(s: Partial<StoreLocation>, i: number): StoreLocation {
  return {
    code: s.code || `STORE-${i + 1}`,
    name: s.name || s.code || `Store ${i + 1}`,
    party: { ...blankParty(), ...(s.party ?? {}) },
  }
}

const HUB_OVERAGE_STATUSES = ['Held', 'Attached', 'Created', 'Rejected'] as const
function normalizeHubOverage(v: Partial<HubOverage>, i: number): HubOverage {
  return {
    id: v.id || `hov${i}`, code: v.code ?? '', hubCode: v.hubCode ?? '', at: v.at ?? new Date(0).toISOString(),
    damaged: v.damaged === true, status: oneOf(v.status, HUB_OVERAGE_STATUSES, 'Held'),
    orderId: strOrNull(v.orderId), note: strOrNull(v.note),
  }
}

function load(): GrowOrdersDb {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const p = JSON.parse(raw) as Partial<GrowOrdersDb>
      if (Array.isArray(p.orders) && Array.isArray(p.stores)) {
        const stores = (p.stores as Partial<StoreLocation>[]).map(normalizeStore)
        return {
          /* a blob whose store list was emptied would strand every page that
             opens on `stores[0]` — fall back to the seed's own locations */
          stores: stores.length ? stores : STORES,
          orders: (p.orders as Partial<GrowOrder>[]).map(normalize),
          pickupRequests: Array.isArray(p.pickupRequests)
            ? (p.pickupRequests as Partial<GrowPickupRequest>[]).map(normalizePr)
            : [],
          hubOverages: Array.isArray(p.hubOverages) ? (p.hubOverages as Partial<HubOverage>[]).map(normalizeHubOverage) : [],
        }
      }
    }
  } catch { /* fall through */ }
  return seed()
}

let db: GrowOrdersDb = load()
const subs = new Set<() => void>()
function commit() {
  db = { ...db }
  try { localStorage.setItem(KEY, JSON.stringify(db)) } catch { /* ignore */ }
  subs.forEach((f) => f())
}

export function useGrowOrders(): GrowOrdersDb {
  return useSyncExternalStore((cb) => { subs.add(cb); return () => subs.delete(cb) }, () => db)
}

/** Unique record id. A counter is folded in because a bulk upload creates many
 *  orders inside the SAME millisecond — `o${Date.now()}` alone collides. */
let idSeq = 0
export const newOrderId = (): string => `o${Date.now().toString(36)}${(idSeq++).toString(36)}`

/** Same reason as newOrderId: booking a multi-group selection creates several
 *  requests inside ONE millisecond, and `pr${Date.now()}` alone collides. */
let prSeq = 0
export const newPrId = (): string => `pr${Date.now().toString(36)}${(prSeq++).toString(36)}`

export function newOrderNumber(): string {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789'
  let s = ''
  for (let i = 0; i < 12; i++) s += A[Math.floor(Math.random() * A.length)]
  return s
}

/** PR-000101, PR-000102, … — one above the highest number already stored. */
function nextPrNumber(): string {
  const max = db.pickupRequests.reduce((n, p) => Math.max(n, Number(p.number.replace(/\D/g, '')) || 0), 100)
  return `PR-${String(max + 1).padStart(6, '0')}`
}

/** An order built from stepper state — used for both "Save for Later" and checkout. */
function orderFromDraft(d: OrderDraft, base?: GrowOrder): GrowOrder {
  const p0 = d.parcels[0]
  const isFtl = d.shipmentType === 'FTL'
  return {
    ...(base ?? DEFAULTS),
    id: base?.id ?? newOrderId(),
    orderNumber: base?.orderNumber || newOrderNumber(),
    createdAt: base?.createdAt ?? new Date().toISOString(),
    storeCode: d.storeCode, inboundHubCode: inboundHubFor(d.receiver),
    sender: d.sender, receiver: d.receiver, drops: d.drops,
    shipmentType: d.shipmentType, vehicleType: isFtl ? d.vehicleType : '',
    ...(isFtl ? { vehicleUnit: d.vehicleUnit, actualLoad: d.actualLoad, additionalServices: d.additionalServices,
      ...(d.vehicles?.length ? { vehicles: d.vehicles } : {}) } : {}),
    pkg: {
      kind: isFtl ? 'FTL' : p0?.cargoType === 'Document' ? 'Document' : 'Parcel',
      count: d.parcels.reduce((n, p) => n + p.quantity, 0),
      weightKg: d.parcels.reduce((n, p) => n + p.weight * p.quantity, 0),
      lengthCm: p0?.l ?? 0, widthCm: p0?.w ?? 0, heightCm: p0?.h ?? 0,
      description: d.parcels.map((p) => p.itemInfo).filter(Boolean).join('; '),
      declaredValue: base?.pkg.declaredValue ?? 0,
    },
    carrier: d.consignment?.carrier || (isFtl ? '2GO Logistics' : '2GO Express'), serviceType: d.service,
    /* the Create Consignment form's own identifiers and extras, when it sent them */
    ...(d.consignment?.orderNumber?.trim() ? { orderNumber: d.consignment.orderNumber.trim() } : {}),
    ...(d.consignment?.consignmentType === 'Reverse' ? { orderType: 'Reverse Order' as const } : {}),
    ...(p0?.trackingNumber?.trim() ? { trackingNumber: p0.trackingNumber.trim() } : {}),
    ...(d.consignment ? { consignment: d.consignment } : {}),
  }
}

/** Set a request's status and append the matching audit entry — one owner per transition. */
function stamp(p: GrowPickupRequest, status: PickupRequestStatus, note?: string): GrowPickupRequest {
  return { ...p, status, statusHistory: [...p.statusHistory, { status, at: new Date().toISOString(), note }] }
}

/** An audit entry that records WHY without changing the state. */
function noted(p: GrowPickupRequest, note: string): GrowPickupRequest {
  return { ...p, statusHistory: [...p.statusHistory, { status: p.status, at: new Date().toISOString(), note }] }
}

/** Replace one request through `fn`; the only way the execution actions write. */
function mapPr(id: string, fn: (p: GrowPickupRequest) => GrowPickupRequest) {
  db.pickupRequests = db.pickupRequests.map((p) => (p.id === id ? fn(p) : p))
}

/** `PR-000125` → `000125` — the digits carrier / manifest references are built from. */
const prDigits = (number: string) => number.replace(/\D/g, '')

/** Scenario 4 / item 12: an order with a data-validation error is not a real
 *  consignment yet, so no booking path may take it. */
const hasError = (id: string) => !!db.orders.find((o) => o.id === id)?.error

const orderLabel = (id: string) => db.orders.find((o) => o.id === id)?.orderNumber ?? id
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`

/** Close a completed request's handover. Nothing is released here — orders
 *  left behind were already released when the pickup completed (spec E8). */
function closeNow(id: string, note: string) {
  mapPr(id, (p) => noted({ ...p, handover: { ...p.handover, closedAt: new Date().toISOString() } }, note))
}

/** Scans just changed (or the truck reached the hub) — close the handover the
 *  moment every required scan agrees AND the collection is at the hub. Without
 *  the arrival condition a driver-scan-only handover closed at the door, not at
 *  the trip debrief (spec H1); a hub scan always stamps the arrival itself. */
function closeIfReconciled(id: string) {
  const p = db.pickupRequests.find((x) => x.id === id)
  if (p && p.status === 'Completed' && !p.handover.closedAt && p.handover.arrivedAtHubAt && handoverReconciled(p)) {
    closeNow(id, `Handover reconciled — ${plural(p.pickedOrderIds.length, 'consignment')}`)
  }
}

/**
 * A request just LEFT the trip it was a stop on, because it was cancelled or
 * rescheduled. Trips live in planningStore, which imports this store — never
 * the other way round — so the trip side listens here instead of being called:
 * planningStore subscribes at module init, drops the stop and raises the trip's
 * attention note. With nobody listening (a /grow tab), the request is still
 * reset correctly and planningStore heals the orphaned stop when it next loads.
 */
export interface PickupDetachedEvent {
  prId: string
  number: string
  tripId: string
  cause: 'cancelled' | 'rescheduled' | 'reallocated'
  /** Ready-made attention note for the trip, e.g. `PR-000123 cancelled by merchant`. */
  note: string
}
const detachSubs = new Set<(e: PickupDetachedEvent) => void>()
export function onPickupRequestDetached(cb: (e: PickupDetachedEvent) => void): () => void {
  detachSubs.add(cb)
  return () => { detachSubs.delete(cb) }
}
const emitDetached = (e: PickupDetachedEvent) => detachSubs.forEach((f) => f(e))

/** What the Inbound scanner shows for one scan. */
export type HubScanResult = {
  /** `closed` — the request's handover was already closed: the scan is LOGGED
   *  ("Scanned after close") and nothing else changes (scenario 19). */
  kind: 'ok' | 'unknown' | 'already' | 'not-picked' | 'closed'
  prId?: string
  orderId?: string
  /** `unknown` only — the Held hub overage the scan recorded (or matched). */
  hubOverageId?: string
}

let hovSeq = 0
const newHubOverageId = () => `hov${Date.now().toString(36)}${(hovSeq++).toString(36)}`

/** Release a closed request's orders so they return to Ready for Pickup. */
function releaseOrders(prId: string) {
  db.orders = db.orders.map((o) => (o.pickupRequestId === prId
    ? { ...o, pickupRequestId: null, status: 'Order Created', pickupDate: '' }
    : o))
}

export const growOrderActions = {
  create(o: GrowOrder) { db.orders = [o, ...db.orders]; commit(); return o },
  /** One commit for a whole batch — a bulk upload of 200 rows must not write
   *  localStorage 200 times or wake every subscriber 200 times. */
  createMany(orders: GrowOrder[]) {
    if (!orders.length) return []
    db.orders = [...orders, ...db.orders]
    commit()
    return orders
  },
  /**
   * Patch an order. CANCELLING one that sits in an open pickup request also
   * takes it off that request — a courier must not come for a parcel that no
   * longer ships — and an order-backed request left with nothing (no orders,
   * no overage scans) while still Requested / Planned fails as `NO_ORDERS`.
   * A reserved booking keeps its slot: it was born empty.
   */
  update(id: string, patch: Partial<GrowOrder>) {
    const before = db.orders.find((o) => o.id === id)
    const prId = patch.status === 'Cancelled' && before?.status !== 'Cancelled' ? before?.pickupRequestId ?? null : null
    const pr = prId ? db.pickupRequests.find((p) => p.id === prId) : undefined
    const detach = !!pr && isOpenPr(pr.status)
    db.orders = db.orders.map((o) => (o.id === id ? { ...o, ...patch, ...(detach ? { pickupRequestId: null } : {}) } : o))
    let emptied = false
    if (pr && detach) {
      mapPr(pr.id, (p) => {
        const next = noted({ ...p, orderIds: p.orderIds.filter((i) => i !== id) },
          `Order ${before?.orderNumber ?? id} cancelled — removed`)
        emptied = !next.blind && next.orderIds.length === 0 && next.overages.length === 0
          && (next.status === 'Requested' || next.status === 'Planned')
        return emptied
          ? { ...stamp(next, 'Pickup Failed', 'No orders left'), failureReason: NO_ORDERS_REASON, tripId: null, driverName: null }
          : next
      })
    }
    commit()
    /* an emptied request that was routed leaves its trip, like a cancel */
    if (pr && emptied && pr.tripId) {
      emitDetached({ prId: pr.id, number: pr.number, tripId: pr.tripId, cause: 'cancelled', note: `${pr.number} has no orders left` })
    }
  },

  /** Cancel a consignment — `update` does the pickup-side consequences. */
  cancelOrder(id: string) {
    growOrderActions.update(id, { status: 'Cancelled' })
  },
  /**
   * Delete orders. A booking they were part of is never deleted with them:
   *  - a RESERVED request owns its slot and simply drops back to 0 attached;
   *  - an ORDER-BACKED request whose LAST order is gone has nothing left to
   *    collect, so it is CANCELLED — the same outcome as removing that order
   *    from the request's own page, and the audit trail survives either way.
   */
  remove(ids: string[]) {
    const s = new Set(ids)
    db.orders = db.orders.filter((o) => !s.has(o.id))
    db.pickupRequests = db.pickupRequests.map((p) => {
      const orderIds = p.orderIds.filter((i) => !s.has(i))
      if (orderIds.length === p.orderIds.length) return p
      const next: GrowPickupRequest = {
        ...p,
        orderIds,
        pickedOrderIds: p.pickedOrderIds.filter((i) => !s.has(i)),
        /* an overage resolved by an order that no longer exists is unresolved again */
        overages: p.overages.map((v) => (v.orderId && s.has(v.orderId) ? { ...v, orderId: null } : v)),
      }
      return orderIds.length === 0 && !p.blind && isOpenPr(p.status)
        ? stamp(next, 'Cancelled', 'Last order deleted')
        : next
    })
    commit()
  },

  /** "Save for Later" — an Unpaid draft order that keeps the stepper state. */
  saveDraft(draft: OrderDraft, existingId?: string): GrowOrder {
    const base = existingId ? db.orders.find((o) => o.id === existingId) : undefined
    const o: GrowOrder = { ...orderFromDraft(draft, base), paymentStatus: 'Unpaid', isDraft: true, draft }
    if (base) db.orders = db.orders.map((x) => (x.id === o.id ? o : x))
    else db.orders = [o, ...db.orders]
    commit()
    return o
  },

  /** Checkout Proceed — the order becomes paid and lands on Ready for Pickup. */
  markPaid(id: string, patch: Partial<GrowOrder> = {}) {
    growOrderActions.update(id, { paymentStatus: 'Paid', isDraft: false, draft: null, status: 'Order Created', ...patch })
  },

  /**
   * Book a collection for orders that already exist. One call = ONE request, so
   * a selection spanning several (pickup location → destination) pairs — or
   * carrying a dedicated vehicle — is several calls, one per group.
   */
  createPickupRequest({ storeCode, destinationCode = null, orderIds, instructions, vehicle, source = 'Merchant', merchantCode, ...win }: {
    storeCode: string; destinationCode?: string | null; orderIds: string[]; instructions?: string
    /** Who raised it — the merchant portal by default; the console passes 'Console'. */
    source?: PickupSource
    /** Whose `merchantOverrides` apply (multi-PR policy, attempts). */
    merchantCode?: string | null
    /** Present only for an FTL booking — the vehicle the order asked for. */
    vehicle?: { vehicleType: string; vehicleUnit: number; shipTo: Party | null; ftlServiceType?: string | null }
    startAt?: string; endAt?: string; date?: string; slot?: string
  }): (GrowPickupRequest & { merged: boolean; skipped: string[] }) | null {
    const createdAt = new Date().toISOString()
    const { startAt, endAt, date, slot } = pickupWindow(win)
    /* an order with a validation error never joins a booking; it is reported
       back in `skipped`, and a selection with nothing left books nothing */
    const skipped = orderIds.filter(hasError)
    if (skipped.length) orderIds = orderIds.filter((i) => !hasError(i))
    if (skipped.length && !orderIds.length) return null
    /* multiPrPolicy: a second parcel booking at a point that already has an open
       one JOINS it (per location, or per overlapping slot) instead of sending a
       second van. Only into a request that can still take orders, and only on
       the same destination hub — a request drops at ONE hub. A vehicle booking
       is always its own request. `merged: true` tells the caller which happened. */
    const policy = pickupPolicy(merchantCode).multiPrPolicy
    if (!vehicle && policy !== 'UNLIMITED') {
      const key = pointKey({ storeCode, shipFrom: null })
      const until = pickupPolicy(merchantCode).allowAddToExistingUntil
      const target = db.pickupRequests
        .filter((p) => pointKey(p) === key && p.shipmentType !== 'FTL' && canAddOrdersTo(p, until)
          && (p.destinationCode ?? null) === destinationCode
          && (policy === 'ONE_OPEN_PER_LOCATION' || rangesOverlap(startAt, endAt, p.startAt, p.endAt)))
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0]
      if (target) {
        const s = new Set(orderIds.filter((i) => !target.orderIds.includes(i)))
        mapPr(target.id, (p) => noted({ ...p, orderIds: [...p.orderIds, ...s] },
          `${plural(s.size, 'order')} added — booking merged (${policy === 'ONE_OPEN_PER_LOCATION' ? 'one open request per location' : 'same slot'})`))
        db.orders = db.orders.map((o) => (s.has(o.id)
          ? { ...o, pickupRequestId: target.id, status: 'Pickup Scheduled', pickupDate: target.date }
          : o))
        commit()
        return { ...db.pickupRequests.find((p) => p.id === target.id)!, merged: true, skipped }
      }
    }
    const pr: GrowPickupRequest = {
      id: newPrId(), number: nextPrNumber(), storeCode, destinationCode, startAt, endAt, date, slot,
      orderIds: [...orderIds], status: PR_ENTRY_STATUS, createdAt, instructions,
      statusHistory: [{ status: PR_ENTRY_STATUS, at: createdAt, note: vehicle
        ? `Vehicle booked — ${vehicle.vehicleUnit} × ${vehicle.vehicleType}`
        : `${orderIds.length} order${orderIds.length === 1 ? '' : 's'} booked` }],
      ...NOT_BLIND,
      ...freshExecution(source, merchantCode),
      ...(vehicle ? {
        shipmentType: 'FTL' as const,
        vehicleType: vehicle.vehicleType,
        vehicleUnit: vehicle.vehicleUnit,
        ftlServiceType: vehicle.ftlServiceType ?? null,
        shipTo: vehicle.shipTo,
      } : {}),
    }
    const s = new Set(orderIds)
    db.pickupRequests = [pr, ...db.pickupRequests]
    db.orders = db.orders.map((o) => (s.has(o.id)
      ? { ...o, pickupRequestId: pr.id, status: 'Pickup Scheduled', pickupDate: date }
      : o))
    commit()
    return { ...pr, merged: false, skipped }
  },

  /**
   * RESERVE a collection BEFORE any order exists (internally `blind`). The
   * merchant declares roughly what will be handed over; `orderIds` stays empty
   * until orders are attached.
   */
  createBlindPickup({ storeCode, destinationCode = null, shipmentType = 'Parcel', expectedPieces, expectedWeightKg,
    sizeClass, vehicleType, vehicleUnit, ftlServiceType, shipFrom, shipTo,
    contactName, contactNumber, note, instructions, source = 'Merchant', ...win }: {
    storeCode: string; destinationCode?: string | null; source?: PickupSource
    startAt?: string; endAt?: string; date?: string; slot?: string
    shipmentType?: ShipmentType
    expectedPieces: number | null; expectedWeightKg: number | null
    sizeClass?: SizeClass | null; vehicleType?: string | null; vehicleUnit?: number | null; ftlServiceType?: string | null
    shipFrom?: Party | null; shipTo?: Party | null
    contactName?: string; contactNumber?: string; note?: string; instructions?: string
  }): GrowPickupRequest {
    const createdAt = new Date().toISOString()
    const ftl = shipmentType === 'FTL'
    const { startAt, endAt, date, slot } = pickupWindow(win)
    const pr: GrowPickupRequest = {
      id: newPrId(), number: nextPrNumber(), storeCode, destinationCode, startAt, endAt, date, slot,
      orderIds: [], pickedOrderIds: [], overages: [], status: PR_ENTRY_STATUS, createdAt, instructions,
      statusHistory: [{ status: PR_ENTRY_STATUS, at: createdAt, note: ftl
        ? `Reserved vehicle booking — ${vehicleUnit ?? 1} × ${vehicleType ?? 'vehicle'}, ~${expectedWeightKg ?? 0} kg`
        : `Reserved pickup — ${expectedPieces ?? 0} order${expectedPieces === 1 ? '' : 's'} expected` }],
      blind: true, shipmentType, expectedPieces, expectedWeightKg,
      /* each branch only keeps the fields its own form collected */
      sizeClass: ftl ? null : sizeClass ?? null,
      vehicleType: ftl ? vehicleType ?? null : null,
      vehicleUnit: ftl ? vehicleUnit ?? 1 : null,
      ftlServiceType: ftl ? ftlServiceType ?? null : null,
      /* a typed-in collection address is kept on BOTH branches — a parcel
         handover from somewhere other than the store is just as real as an FTL one */
      shipFrom: shipFrom ?? null,
      shipTo: ftl ? shipTo ?? null : null,
      contactName: contactName ?? '', contactNumber: contactNumber ?? '', note: note ?? '',
      ...freshExecution(source),
    }
    db.pickupRequests = [pr, ...db.pickupRequests]
    commit()
    return pr
  },

  /**
   * Attach paid orders to an existing request. Only orders that are actually
   * bookable (Ready for Pickup — paid, not a draft, no request yet) can move,
   * so the same rule guards the sheet and the store.
   */
  attachOrdersToPickup(prId: string, orderIds: string[]): string[] {
    const pr = db.pickupRequests.find((p) => p.id === prId)
    if (!pr) return []
    const want = new Set(orderIds)
    const ok = db.orders.filter((o) => want.has(o.id) && tabOf(o) === 'Ready for Pickup').map((o) => o.id)
    if (!ok.length) return []
    const s = new Set(ok)
    db.pickupRequests = db.pickupRequests.map((p) => (p.id === prId
      ? { ...p, orderIds: [...p.orderIds, ...ok],
        statusHistory: [...p.statusHistory, { status: p.status, at: new Date().toISOString(), note: `${ok.length} order${ok.length === 1 ? '' : 's'} added` }] }
      : p))
    db.orders = db.orders.map((o) => (s.has(o.id)
      ? { ...o, pickupRequestId: prId, status: 'Pickup Scheduled', pickupDate: pr.date }
      : o))
    commit()
    return ok
  },

  /** Remove one order from a request — it returns to Ready for Pickup. */
  detachOrderFromPickup(prId: string, orderId: string) {
    db.pickupRequests = db.pickupRequests.map((p) => (p.id === prId
      ? { ...p, orderIds: p.orderIds.filter((i) => i !== orderId),
        statusHistory: [...p.statusHistory, { status: p.status, at: new Date().toISOString(), note: 'Order removed' }] }
      : p))
    db.orders = db.orders.map((o) => (o.id === orderId && o.pickupRequestId === prId
      ? { ...o, pickupRequestId: null, status: 'Order Created', pickupDate: '' }
      : o))
    commit()
  },

  /** Cancel a booking — its orders drop back to Ready for Pickup.
   *  `orderIds` is deliberately kept, so the cancelled row still shows its totals.
   *  `reason` is a CANCEL_REASONS code or free text (older callers pass prose);
   *  `by` names who cancelled in the audit note. A routed request also leaves
   *  its trip — see `onPickupRequestDetached`. */
  cancelPickupRequest(id: string, reason?: string, by?: 'Merchant' | 'Ops') {
    const cur = db.pickupRequests.find((p) => p.id === id)
    if (!cur) return
    const label = reason ? cancelReasonLabel(reason) : ''
    const note = by ? `Cancelled by ${by === 'Ops' ? 'ops' : 'merchant'}${label ? ` — ${label}` : ''}` : label || undefined
    mapPr(id, (p) => ({ ...stamp(p, 'Cancelled', note), cancelReason: reason ?? null, tripId: null, driverName: null }))
    releaseOrders(id)
    commit()
    if (cur.tripId) {
      emitDetached({ prId: id, number: cur.number, tripId: cur.tripId, cause: 'cancelled',
        note: `${cur.number} cancelled${by ? ` by ${by === 'Ops' ? 'ops' : 'merchant'}` : ''}` })
    }
  },

  /** Pickup attempted and failed — same release as a cancel, different state.
   *  `reason` is free text (existing callers pass prose); `reasonCode` is a
   *  PICKUP_FAILURE_REASONS code and becomes the note when no text is given. */
  /*  With `autoRescheduleOnFail` on and attempts left, the retry is raised at
   *  once (see reattemptPickupRequest) — except for NO_ORDERS: an empty request
   *  retried is still empty. */
  failPickupRequest(id: string, reason?: string, reasonCode?: string) {
    db.pickupRequests = db.pickupRequests.map((p) => (p.id === id
      ? { ...stamp(p, 'Pickup Failed', reason ?? (reasonCode ? failureReasonLabel(reasonCode) : undefined)),
        failureReason: reasonCode ?? p.failureReason }
      : p))
    releaseOrders(id)
    commit()
    const failed = db.pickupRequests.find((p) => p.id === id)
    if (failed && reasonCode !== NO_ORDERS_REASON && canReattempt(failed) && pickupPolicy().autoRescheduleOnFail) {
      growOrderActions.reattemptPickupRequest(id)
    }
  },

  /** "Simulate next step" — walks PR_FLOW one state forward. */
  advancePickupRequest(id: string): PickupRequestStatus | null {
    const cur = db.pickupRequests.find((p) => p.id === id)
    const next = cur ? nextPrStatus(cur.status) : null
    if (!cur || !next) return null
    /* a pickup with nothing to hand over cannot COMPLETE — the driver arrived to
       an empty dock, which is a failed pickup */
    if (next === 'Completed' && prHasNothingToCollect(cur)) {
      growOrderActions.failPickupRequest(id, EMPTY_PICKUP_NOTE, NO_ORDERS_REASON)
      return 'Pickup Failed'
    }
    db.pickupRequests = db.pickupRequests.map((p) => {
      if (p.id !== id) return p
      const moved = stamp(p, next)
      /* a simulated completion means "the driver collected everything that was
         booked" — without this the reconciliation line would read `4 booked · 0 picked` */
      return next === 'Completed' && moved.pickedOrderIds.length === 0
        ? { ...moved, pickedOrderIds: [...moved.orderIds] }
        : moved
    })
    if (next === 'Completed') {
      const s = new Set(cur.orderIds)
      db.orders = db.orders.map((o) => (s.has(o.id) && o.pickupRequestId === id ? { ...o, status: 'Picked Up' } : o))
    }
    commit()
    return next
  },

  /** Move an open request to a new date/slot — status is untouched, history records it. */
  /* A ROUTED request is different: the trip it was on no longer fits the new
     window, so it leaves the trip and — if it was Planned / Assigned there —
     goes back to Requested to be planned again. */
  reschedulePickupRequest(id: string, win: { startAt?: string; endAt?: string; date?: string; slot?: string }) {
    const cur = db.pickupRequests.find((p) => p.id === id)
    if (!cur) return
    const { startAt, endAt, date, slot } = pickupWindow(win)
    const note = `Rescheduled to ${date} ${slot}`
    mapPr(id, (p) => {
      const moved = { ...p, startAt, endAt, date, slot }
      if (!p.tripId) return noted(moved, note)
      const off = { ...moved, tripId: null, driverName: null }
      return p.status === 'Planned' || p.status === 'Ready For Last Mile Dispatch' || p.status === 'Assigned'
        ? stamp(off, 'Requested', `${note} — removed from trip ${p.tripId}`)
        : noted(off, `${note} — removed from trip ${p.tripId}`)
    })
    db.orders = db.orders.map((o) => (o.pickupRequestId === id ? { ...o, pickupDate: date } : o))
    commit()
    if (cur.tripId) {
      emitDetached({ prId: id, number: cur.number, tripId: cur.tripId, cause: 'rescheduled',
        note: `${cur.number} rescheduled to ${date} ${slot}` })
    }
  },

  /**
   * RECONCILE a handover and close the request. Three outcomes land in one call,
   * because they are one physical event:
   *  - `pickedOrderIds` — booked here and actually collected. Anything booked
   *    here and NOT listed (nor collected under another request) is RELEASED
   *    back to Ready for Pickup at once (spec E8) — nobody is coming back for
   *    it on this request. `orderIds` keeps it, so the request still reads
   *    `Not picked` for it; `notPickedReasons` says why.
   *  - `extraOrderIds` — booked under ANOTHER request but handed over here;
   *    they gain `pickedInRequestId` so both requests can tell the story.
   *  - `overages` — barcodes that matched no order at all.
   */
  completePickupRequest(id: string, x: {
    pickedOrderIds?: string[]; extraOrderIds?: string[]; overages?: PickupOverage[]
    /** orderId → reason code, for booked orders the driver did not collect */
    notPickedReasons?: Record<string, string>
    /** proof of pickup captured at the door */
    pod?: PickupPod | null
  } = {}) {
    const cur = db.pickupRequests.find((p) => p.id === id)
    if (!cur) return
    const scansIn = x.overages ?? []
    /* HUB-SCAN mode (H2): nobody scans at the door, so a completion that brings
       no NEW driver scans (only what the hub already recorded, no extras) is a
       completion BY COUNT — every booked order counts as picked and stays
       booked, nothing is released, and the hub in-scan is what confirms it. */
    const fresh = (x.pickedOrderIds ?? []).filter((i) => !cur.pickedOrderIds.includes(i))
    const byCount = cur.handover.mode === 'hub' && fresh.length === 0 && !(x.extraOrderIds ?? []).length && cur.orderIds.length > 0
    if (byCount) x = { ...x, pickedOrderIds: [...new Set([...cur.orderIds, ...cur.pickedOrderIds])] }
    /* same rule as advancePickupRequest: nothing collected and nothing scanned
       means a FAILED pickup, never a completed one */
    if (prHasNothingToCollect({ ...cur, pickedOrderIds: [...cur.pickedOrderIds, ...(x.pickedOrderIds ?? []), ...(x.extraOrderIds ?? [])], overages: [...cur.overages, ...scansIn] })) {
      growOrderActions.failPickupRequest(id, EMPTY_PICKUP_NOTE, NO_ORDERS_REASON)
      return
    }
    const booked = new Set(cur.orderIds)
    const extra = new Set((x.extraOrderIds ?? []).filter((i) => !booked.has(i)))
    const picked = [...new Set([...(x.pickedOrderIds ?? []).filter((i) => booked.has(i)), ...extra])]
    const scans = scansIn
    db.pickupRequests = db.pickupRequests.map((p) => (p.id === id
      ? { ...stamp(p, 'Completed', byCount
        ? `${picked.length} of ${cur.orderIds.length} counted — the hub scan confirms`
        : `${picked.length} of ${cur.orderIds.length} collected${scans.length ? ` · ${scans.length} overage scan${scans.length === 1 ? '' : 's'}` : ''}`),
        pickedOrderIds: picked, overages: [...p.overages, ...scans],
        notPickedReasons: { ...p.notPickedReasons, ...(x.notPickedReasons ?? {}) },
        handover: x.pod ? { ...p.handover, pod: x.pod } : p.handover }
      : p))
    const got = new Set(picked)
    db.orders = db.orders.map((o) => {
      if (got.has(o.id)) return { ...o, status: 'Picked Up' as const, pickedInRequestId: extra.has(o.id) ? id : o.pickedInRequestId }
      /* left behind: released now — unless another request collected it */
      if (booked.has(o.id) && o.pickupRequestId === id && !o.pickedInRequestId && o.status === 'Pickup Scheduled') {
        return { ...o, pickupRequestId: null, status: 'Order Created' as const, pickupDate: '' }
      }
      return o
    })
    commit()
  },

  /** An overage scan finally has an order behind it. The parcel was physically
   *  collected on this request — the driver scanned its label — so the new order
   *  also joins what was picked here (and the driver's half of the handover).
   *  Without that, the hub in-scan of the very parcel read "not picked" and the
   *  order could never be handed over (scenarios 14 auto-create, 20). */
  resolveOverage(prId: string, overageId: string, orderId: string) {
    const cur = db.pickupRequests.find((p) => p.id === prId)
    const scanned = !!cur?.overages.some((v) => v.id === overageId)
    db.pickupRequests = db.pickupRequests.map((p) => {
      if (p.id !== prId) return p
      const next = { ...p, overages: p.overages.map((v) => (v.id === overageId ? { ...v, orderId } : v)) }
      if (!scanned || p.status !== 'Completed' || p.pickedOrderIds.includes(orderId)) return next
      return { ...next, pickedOrderIds: [...p.pickedOrderIds, orderId],
        handover: p.handover.mode === 'hub' ? p.handover
          : { ...p.handover, driverScanned: [...new Set([...p.handover.driverScanned, orderId])] } }
    })
    closeIfReconciled(prId)
    commit()
  },

  /**
   * Save a typed-in collection address as a pickup address the merchant can pick
   * again. Deduped on the ADDRESS, and the code is made unique, so saving the
   * same place twice can never fork the store list.
   */
  addStore(store: StoreLocation): StoreLocation {
    const same = db.stores.find((s) => s.party.line1.trim().toLowerCase() === store.party.line1.trim().toLowerCase()
      && s.party.postalCode === store.party.postalCode)
    if (same) return same
    const base = store.code || 'STORE'
    let code = base
    for (let n = 2; db.stores.some((s) => s.code === code); n++) code = `${base}-${n}`
    const next: StoreLocation = { ...store, code }
    db.stores = [...db.stores, next]
    commit()
    return next
  },

  /* ------------------------------------------ first-mile execution (console) ---- */

  /**
   * Put a request on a trip (or take it off one). Routing is what PLANS a
   * request, and a driver on the trip is what ASSIGNS it, so both transitions
   * happen here. Taken off a trip, a request our own fleet was going to run
   * drops back to Requested; one a carrier holds stays with the carrier.
   */
  setPickupTrip(prId: string, tripId: string | null, driverName: string | null = null) {
    mapPr(prId, (p) => {
      /* already on this trip: only the driver changed (a reassignment, mid-trip
         or not) — the status stays where it is */
      if (tripId && p.tripId === tripId) {
        if (p.driverName === driverName) return p
        const moved = { ...p, driverName }
        return driverName && (p.status === 'Planned' || p.status === 'Ready For Last Mile Dispatch')
          ? stamp(moved, 'Assigned', `Driver ${driverName} assigned on ${tripId}`)
          : noted(moved, driverName ? `Driver changed to ${driverName}` : 'Driver unassigned')
      }
      if (tripId) {
        let next: GrowPickupRequest = { ...p, tripId, driverName }
        if (next.status === 'Requested') next = stamp(next, 'Planned', `Added to trip ${tripId}`)
        else next = noted(next, `Added to trip ${tripId}`)
        if (driverName && (next.status === 'Planned' || next.status === 'Ready For Last Mile Dispatch')) {
          next = stamp(next, 'Assigned', `Driver ${driverName} assigned on ${tripId}`)
        }
        return next
      }
      const next: GrowPickupRequest = { ...p, tripId: null, driverName: null }
      const note = p.tripId ? `Removed from trip ${p.tripId}` : 'Removed from trip'
      return !p.carrierCode && (p.status === 'Planned' || p.status === 'Ready For Last Mile Dispatch' || p.status === 'Assigned')
        ? stamp(next, 'Requested', note)
        : noted(next, note)
    })
    commit()
  },

  /** Allocate the collection to a carrier (3PL) or back to our own fleet.
   *  A 3PL runs the collection itself: it is Assigned the moment it is allocated
   *  and leaves any fleet trip it was on (invariant: a 3PL request has no trip).
   *  Our own fleet assigns only through a driver on a trip, so an own-fleet
   *  allocation records the choice and leaves the status alone (invariant: a
   *  fleet-Assigned request always has a trip). */
  /*  With the config's `sendToCarrier` on (or `opts.sendToCarrier`), a 3PL
   *  allocation also PUSHES the booking: the carrier's reference is stored as
   *  `carrierPickupRef` = `<CODE>-<PR digits>` (spec P5). */
  assignCarrier(prId: string, c: { code: string; name: string; mode: CarrierMode }, opts: { sendToCarrier?: boolean } = {}) {
    const cur = db.pickupRequests.find((p) => p.id === prId)
    if (!cur) return
    const offTrip = c.mode === 'CARRIER' ? cur.tripId : null
    const send = c.mode === 'CARRIER' && (opts.sendToCarrier ?? readPickupModuleConfig().sendToCarrier)
    const ref = send ? `${c.code}-${prDigits(cur.number)}` : null
    mapPr(prId, (p) => {
      const next = { ...p, carrierCode: c.code, carrierName: c.name, carrierMode: c.mode,
        /* a reference belongs to ONE carrier — re-allocating drops it */
        carrierPickupRef: ref ?? (c.mode === 'CARRIER' && p.carrierCode === c.code ? p.carrierPickupRef : null),
        ...(offTrip ? { tripId: null, driverName: null } : {}) }
      const note = `Allocated to ${c.name}${c.mode === 'CARRIER' ? ' (3PL)' : ' (own fleet)'}${offTrip ? ` — removed from trip ${offTrip}` : ''}`
      const moved = c.mode === 'CARRIER' && (p.status === 'Requested' || p.status === 'Planned' || p.status === 'Ready For Last Mile Dispatch')
        ? stamp(next, 'Assigned', note) : noted(next, note)
      return ref ? noted(moved, `Booking sent to ${c.name} · ref ${ref}`) : moved
    })
    commit()
    if (offTrip) {
      emitDetached({ prId, number: cur.number, tripId: offTrip, cause: 'reallocated',
        note: `${cur.number} allocated to ${c.name} (3PL)` })
    }
  },

  /** Ops takes a collection back from a 3PL: carrier cleared; an Assigned request
   *  that is not on a fleet trip returns to Requested so it can be planned again (P7). */
  clearCarrier(prId: string) {
    mapPr(prId, (p) => {
      if (!p.carrierCode) return p
      const next = { ...p, carrierCode: null, carrierName: null, carrierMode: null, carrierPickupRef: null }
      const note = `Taken back from ${p.carrierName ?? 'carrier'} — own fleet`
      return p.status === 'Assigned' && !p.tripId ? stamp(next, 'Requested', note) : noted(next, note)
    })
    commit()
  },

  /**
   * Ops records a collection the driver never closed in the app. The listed
   * orders stand in for the driver's scan (so a both-scan handover still waits
   * for the hub). A failed request can be overridden too — its released orders
   * are re-linked first, because completion only picks what is BOOKED here.
   */
  markManuallyPickedUp(prId: string, orderIds: string[], note?: string) {
    const cur = db.pickupRequests.find((p) => p.id === prId)
    if (!cur || cur.status === 'Cancelled' || cur.status === 'Completed' || cur.reattemptPrId) return
    const want = new Set(orderIds.filter((i) => cur.orderIds.includes(i)))
    db.orders = db.orders.map((o) => (want.has(o.id) && o.pickupRequestId == null
      ? { ...o, pickupRequestId: prId } : o))
    growOrderActions.completePickupRequest(prId, { pickedOrderIds: [...new Set([...cur.pickedOrderIds, ...want])] })
    const after = db.pickupRequests.find((p) => p.id === prId)
    if (!after) return
    if (after.status === 'Completed') {
      mapPr(prId, (p) => {
        const h = p.statusHistory.slice()
        const last = h[h.length - 1]
        h[h.length - 1] = { ...last, note: `Manually marked picked up — ${last.note ?? ''}${note ? ` · ${note}` : ''}` }
        const scanned = p.handover.mode === 'hub' ? p.handover.driverScanned
          : [...new Set([...p.handover.driverScanned, ...p.pickedOrderIds])]
        return { ...p, statusHistory: h, manualOverride: 'Picked Up', handover: { ...p.handover, driverScanned: scanned } }
      })
      closeIfReconciled(prId)
    }
    commit()
  },

  /** Ops records a failed collection by hand, with a reason code. */
  markManuallyFailed(prId: string, reasonCode: string, note?: string) {
    const cur = db.pickupRequests.find((p) => p.id === prId)
    if (!cur || !isOpenPr(cur.status)) return
    growOrderActions.failPickupRequest(prId,
      `Manually marked failed — ${failureReasonLabel(reasonCode)}${note ? ` · ${note}` : ''}`, reasonCode)
    mapPr(prId, (p) => ({ ...p, manualOverride: 'Failed' }))
    commit()
  },

  /**
   * Retry a failed collection as a NEW request (attempt + 1), so each attempt
   * keeps its own history and outcome. The window moves to the next business
   * day at the same time — counted from today when that would still be in the
   * past, since a retry born overdue helps nobody. Only orders still waiting for a booking
   * follow it; one booked elsewhere since stays where it is.
   */
  reattemptPickupRequest(prId: string): GrowPickupRequest | null {
    const cur = db.pickupRequests.find((p) => p.id === prId)
    if (!cur || !canReattempt(cur)) return null
    const durH = Math.max(1, Math.round((atDate(cur.endAt).getTime() - atDate(cur.startAt).getTime()) / 3_600_000))
    /* the NEXT BUSINESS DAY after the failed window, same time of day (spec E9);
       from today when that is already past */
    const time = atParts(cur.startAt)[1] || '09:00'
    const policy = pickupPolicy()
    const nextDay = (from: Date) => localIso(nextBusinessDay(from, policy)).slice(0, 10)
    let startAt = `${nextDay(atDate(cur.startAt))}T${time}`
    if (atDate(startAt) < new Date()) startAt = `${nextDay(new Date())}T${time}`
    const win = pickupWindow({ startAt, endAt: addHours(startAt, durH) })
    const createdAt = new Date().toISOString()
    const attempt = cur.attempt + 1
    const ready = new Set(db.orders.filter((o) => cur.orderIds.includes(o.id) && tabOf(o) === 'Ready for Pickup').map((o) => o.id))
    /* a 3PL failure (scenario 22) is RE-BOOKED with the same carrier — the clone
       keeps the carrier and lands Assigned; our own fleet's retry waits in
       Requested, with no trip, to be planned again */
    const carrier = cur.carrierMode === 'CARRIER' && !!cur.carrierCode
    const number = nextPrNumber()
    const clone: GrowPickupRequest = {
      ...cur, ...win,
      id: newPrId(), number, status: carrier ? 'Assigned' : PR_ENTRY_STATUS, createdAt,
      orderIds: cur.orderIds.filter((i) => ready.has(i)), pickedOrderIds: [], overages: [],
      carrierPickupRef: carrier && cur.carrierPickupRef ? `${cur.carrierCode}-${prDigits(number)}` : null,
      statusHistory: [
        { status: PR_ENTRY_STATUS, at: createdAt, note: `Re-attempt ${attempt} of ${cur.maxAttempts} of ${cur.number}` },
        ...(carrier ? [{ status: 'Assigned' as const, at: createdAt, note: `Re-booked with ${cur.carrierName ?? cur.carrierCode} (3PL)` }] : []),
      ],
      tripId: null, driverName: null, failureReason: null, cancelReason: null, manualOverride: null,
      attempt, parentPrId: cur.id, reattemptPrId: null, handover: blankHandover(cur.handover.mode), notPickedReasons: {},
    }
    db.pickupRequests = [clone, ...db.pickupRequests.map((p) => (p.id === prId
      ? noted({ ...p, reattemptPrId: clone.id }, `Re-attempted as ${clone.number} (attempt ${attempt} of ${cur.maxAttempts})`)
      : p))]
    db.orders = db.orders.map((o) => (ready.has(o.id)
      ? { ...o, pickupRequestId: clone.id, status: 'Pickup Scheduled', pickupDate: win.date }
      : o))
    commit()
    return clone
  },

  /**
   * Merge several bookings for ONE collection into the earliest-created. Only
   * Requested / Planned requests at the same pickup point qualify — past that a
   * driver may already be on the way. Destinations may differ (ops chose to
   * send one van); the survivor then reads "hub to be confirmed" (null) rather
   * than claim one hub for parcels bound for several. The others are
   * cancelled with `Merged into PR-x` and hand their orders (and reserved
   * expectations) to the survivor; a merged-away request leaves any trip it
   * was on, exactly like a cancel.
   */
  mergePickupRequests(prIds: string[]):
  { ok: true; pr: GrowPickupRequest; merged: string[] } | { ok: false; reason: string } {
    const prs = [...new Set(prIds)].map((i) => db.pickupRequests.find((p) => p.id === i))
    if (prs.some((p) => !p)) return { ok: false, reason: 'Some pickup requests no longer exist' }
    const list = prs as GrowPickupRequest[]
    if (list.length < 2) return { ok: false, reason: 'Select at least two pickup requests to merge' }
    const late = list.find((p) => p.status !== 'Requested' && p.status !== 'Planned')
    if (late) return { ok: false, reason: `${late.number} is ${late.status} — only Requested or Planned requests can merge` }
    if (new Set(list.map(pointKey)).size > 1) return { ok: false, reason: 'Pickup requests are at different pickup points' }
    const hubs = [...new Set(list.map((p) => p.destinationCode ?? ''))]
    if (list.some((p) => p.shipmentType === 'FTL')) return { ok: false, reason: 'FTL bookings are never merged' }
    const [keep, ...rest] = [...list].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    const moved = new Set(rest.flatMap((p) => p.orderIds).filter((i) => !keep.orderIds.includes(i)))
    const sum = (f: (p: GrowPickupRequest) => number | null) =>
      (list.some((p) => f(p) != null) ? list.reduce((n, p) => n + (f(p) ?? 0), 0) : null)
    const note = `Merged into ${keep.number}`
    const restIds = new Set(rest.map((p) => p.id))
    db.pickupRequests = db.pickupRequests.map((p) => {
      if (p.id === keep.id) {
        return noted({ ...p, orderIds: [...p.orderIds, ...moved],
          destinationCode: hubs.length > 1 ? null : p.destinationCode,
          ...(p.blind ? { expectedPieces: sum((x) => x.expectedPieces), expectedWeightKg: sum((x) => x.expectedWeightKg) } : {}) },
        `Merged ${rest.map((x) => x.number).join(', ')} — ${plural(moved.size, 'order')} moved here${hubs.length > 1 ? ` · drops at ${hubs.filter(Boolean).join(', ')}` : ''}`)
      }
      if (!restIds.has(p.id)) return p
      return { ...stamp({ ...p, orderIds: [] }, 'Cancelled', `${note} — ${plural(p.orderIds.length, 'order')} moved`),
        cancelReason: note, tripId: null, driverName: null }
    })
    db.orders = db.orders.map((o) => (moved.has(o.id)
      ? { ...o, pickupRequestId: keep.id, status: 'Pickup Scheduled', pickupDate: keep.date }
      : o))
    commit()
    rest.forEach((p) => {
      if (p.tripId) emitDetached({ prId: p.id, number: p.number, tripId: p.tripId, cause: 'cancelled', note: `${p.number} merged into ${keep.number}` })
    })
    return { ok: true, pr: db.pickupRequests.find((p) => p.id === keep.id)!, merged: rest.map((p) => p.number) }
  },

  /** Add consignments to an EXISTING request — the console's gate on
   *  `attachOrdersToPickup`, limited by the config's `allowAddToExistingUntil`. */
  /*  Orders with a validation error are never added — they come back in `skipped`. */
  addOrdersToPickup(prId: string, orderIds: string[]): { added: string[]; skipped: string[] } {
    const skipped = orderIds.filter(hasError)
    const pr = db.pickupRequests.find((p) => p.id === prId)
    if (!pr || !canAddOrdersTo(pr, readPickupModuleConfig().allowAddToExistingUntil)) return { added: [], skipped }
    return { added: growOrderActions.attachOrdersToPickup(prId, orderIds.filter((i) => !hasError(i))), skipped }
  },

  /** An audit entry on a request from outside the store (planningStore's load plan). */
  notePickupRequest(prId: string, note: string) {
    if (!db.pickupRequests.some((p) => p.id === prId)) return
    mapPr(prId, (p) => noted(p, note))
    commit()
  },

  /**
   * C6 — `autoCreateOnConsignment: 'always'`: an order that just became paid and
   * Ready for Pickup is booked at once, at the earliest window the policy allows.
   * `createPickupRequest`'s multi-PR policy decides whether it JOINS the open
   * request at its store or raises a new one (source `Auto`). A vehicle order is
   * always its own request. Off (the default), or module off, does nothing.
   */
  autoBookOnConsignment(orderId: string, merchantCode?: string | null): (GrowPickupRequest & { merged: boolean }) | null {
    const cfg = readPickupModuleConfig()
    if (!cfg.enabled || cfg.mode !== 'auto') return null
    const o = db.orders.find((x) => x.id === orderId)
    if (!o || o.error || tabOf(o) !== 'Ready for Pickup') return null
    /* the date rule is the account's (owner, 2026-09-24); slots and cutoff may be the merchant's */
    const w = autoPickupWindow(new Date(), pickupPolicy(merchantCode), cfg.autoPickup)
    const ftl = o.shipmentType === 'FTL'
    return growOrderActions.createPickupRequest({
      storeCode: o.storeCode, destinationCode: ftl ? null : o.inboundHubCode, orderIds: [o.id], source: 'Auto',
      merchantCode, startAt: w.startAt, endAt: w.endAt,
      ...(ftl ? { vehicle: { vehicleType: o.vehicleType, vehicleUnit: o.vehicleUnit ?? 1, shipTo: o.receiver, ftlServiceType: o.serviceType || null } } : {}),
    })
  },

  /** H4 — ops prints the 3PL manifest: `manifestRef` = `MNF-<PR digits>` (kept if one exists). */
  printManifest(prId: string): string | null {
    const cur = db.pickupRequests.find((p) => p.id === prId)
    if (!cur || cur.carrierMode !== 'CARRIER') return null
    const ref = cur.handover.manifestRef ?? `MNF-${prDigits(cur.number)}`
    mapPr(prId, (p) => noted({ ...p, handover: { ...p.handover, manifestRef: ref } },
      `${cur.handover.manifestRef ? 'Manifest reprinted' : 'Manifest printed'} · ${ref}`))
    commit()
    return ref
  },

  /**
   * H4 — the 3PL carrier accepted the manifest: that IS the handover. A request
   * still Assigned / Out For Pickup completes with everything booked (the carrier
   * took the lot), then the handover closes. False when nothing could complete
   * (a reserved slot with no orders fails as "No orders to collect").
   */
  carrierAccepted(prId: string): boolean {
    const cur = db.pickupRequests.find((p) => p.id === prId)
    if (!cur || cur.carrierMode !== 'CARRIER') return false
    if (cur.status === 'Assigned' || cur.status === 'Out For Pickup') {
      growOrderActions.completePickupRequest(prId, { pickedOrderIds: [...cur.orderIds] })
    }
    const after = db.pickupRequests.find((p) => p.id === prId)
    if (!after || after.status !== 'Completed') return false
    if (!after.handover.closedAt) {
      const at = new Date().toISOString()
      mapPr(prId, (p) => noted({ ...p, handover: { ...p.handover, closedAt: at, arrivedAtHubAt: p.handover.arrivedAtHubAt ?? at } },
        'Carrier accepted the manifest'))
      commit()
    }
    return true
  },

  /** The driver scanned parcels at the collection point. Takes one id or a
   *  whole stop's worth — a 20-parcel pickup is ONE audit entry, not twenty. */
  driverScan(prId: string, orderId: string | string[]) {
    const cur = db.pickupRequests.find((p) => p.id === prId)
    if (!cur) return
    const fresh = [...new Set(Array.isArray(orderId) ? orderId : [orderId])]
      .filter((i) => !cur.handover.driverScanned.includes(i))
    if (!fresh.length) return
    const at = new Date().toISOString()
    const scans: HandoverScan[] = fresh.map((i) => ({ orderId: i, by: 'driver', at, hubCode: null, damaged: false }))
    mapPr(prId, (p) => noted({ ...p, handover: { ...p.handover,
      driverScanned: [...p.handover.driverScanned, ...fresh], scanLog: [...p.handover.scanLog, ...scans] } },
    fresh.length === 1 ? `Driver scanned ${orderLabel(fresh[0])}` : `Driver scanned ${plural(fresh.length, 'consignment')}`))
    closeIfReconciled(prId)
    commit()
  },

  /** The truck carrying this collection reached the hub (trip debrief / end).
   *  From here a missing hub scan is a Discrepancy, not a parcel still en route. */
  markArrivedAtHub(prId: string) {
    const cur = db.pickupRequests.find((p) => p.id === prId)
    if (!cur || cur.handover.arrivedAtHubAt) return
    mapPr(prId, (p) => noted({ ...p, handover: { ...p.handover, arrivedAtHubAt: new Date().toISOString() } }, 'Arrived at hub'))
    closeIfReconciled(prId)
    commit()
  },

  /** The trip carrying this collection has started — the driver is on the way. */
  markOutForPickup(prId: string, note?: string) {
    const cur = db.pickupRequests.find((p) => p.id === prId)
    if (!cur || !isOpenPr(cur.status) || cur.status === 'Out For Pickup') return
    mapPr(prId, (p) => stamp(p, 'Out For Pickup', note))
    commit()
  },

  /**
   * A hub in-scan — the hub side of the handover. `code` may be the order id,
   * its number or its tracking number (the scanner reads a label). The request
   * is the one the parcel was ACTUALLY collected under. In hub-only mode nobody
   * scanned at the door, so a booked parcel that is not yet picked becomes picked
   * here, and the request completes once every booked parcel has arrived.
   */
  hubScan(code: string, opts: { hubCode?: string | null; damaged?: boolean } = {}): HubScanResult {
    const key = code.trim().toLowerCase()
    if (!key) return { kind: 'unknown' }
    const o = db.orders.find((x) => x.id === code.trim() || x.orderNumber.toLowerCase() === key
      || (!!x.trackingNumber && x.trackingNumber.toLowerCase() === key))
    if (!o) {
      /* a label nobody booked: HOLD it as a hub overage — once per code and hub
         while it is still Held, so a re-scan does not fork the queue */
      const hubCode = opts.hubCode ?? ''
      const held = db.hubOverages.find((v) => v.status === 'Held' && v.hubCode === hubCode && v.code.toLowerCase() === key)
      if (held) return { kind: 'unknown', hubOverageId: held.id }
      const v: HubOverage = { id: newHubOverageId(), code: code.trim(), hubCode, at: new Date().toISOString(),
        damaged: opts.damaged === true, status: 'Held', orderId: null, note: null }
      db.hubOverages = [v, ...db.hubOverages]
      commit()
      return { kind: 'unknown', hubOverageId: v.id }
    }
    /* a parcel left behind was RELEASED at completion (E8), so its link is gone —
       the completed request that expected it (still unclosed) is the one to correct */
    const prId = o.pickedInRequestId ?? o.pickupRequestId
      ?? [...db.pickupRequests].reverse().find((p) => p.status === 'Completed' && !p.handover.closedAt && p.orderIds.includes(o.id))?.id
    const cur = prId ? db.pickupRequests.find((p) => p.id === prId) : undefined
    if (!cur) return { kind: 'not-picked', orderId: o.id }
    /* scenario 19 — the handover is already closed (reconciled or force-closed):
       the scan is recorded for the audit trail and changes nothing else */
    if (cur.handover.closedAt) {
      const late: HandoverScan = { orderId: o.id, by: 'hub', at: new Date().toISOString(),
        hubCode: opts.hubCode ?? null, damaged: opts.damaged === true }
      mapPr(cur.id, (p) => noted({ ...p, handover: { ...p.handover, scanLog: [...p.handover.scanLog, late] } },
        `Scanned after close — ${o.orderNumber}${opts.hubCode ? ` at ${opts.hubCode}` : ''}`))
      commit()
      return { kind: 'closed', prId: cur.id, orderId: o.id }
    }
    if (cur.handover.hubScanned.includes(o.id)) {
      /* a parcel that was in-scanned at the WRONG hub and forwarded is expected
         again at its own hub: that arrival is a real scan, not a repeat */
      const mine = cur.handover.scanLog.filter((x) => x.orderId === o.id && x.by === 'hub')
      const last = mine[mine.length - 1]
      const arrivedHome = !!opts.hubCode && opts.hubCode === o.inboundHubCode
        && !!last && (last.forwarded === true || (!!last.hubCode && last.hubCode !== o.inboundHubCode))
      if (!arrivedHome) return { kind: 'already', prId: cur.id, orderId: o.id }
      const scan: HandoverScan = { orderId: o.id, by: 'hub', at: new Date().toISOString(),
        hubCode: opts.hubCode ?? null, damaged: opts.damaged === true }
      mapPr(cur.id, (p) => noted({ ...p, handover: { ...p.handover, scanLog: [...p.handover.scanLog, scan] } },
        `Hub in-scan ${o.orderNumber} at ${opts.hubCode} (arrived after misroute)`))
      commit()
      return { kind: 'ok', prId: cur.id, orderId: o.id }
    }
    const picked = cur.pickedOrderIds.includes(o.id)
    /* the hub holds a parcel booked here that nobody recorded as picked: in
       hub-only mode that IS the pickup; otherwise the driver missed the scan on
       a completed run, so the outcome is corrected (driverScanned stays as the
       driver left it, and a both-scan handover reads Discrepancy until closed) */
    const hubPicks = !picked && cur.orderIds.includes(o.id)
      && (cur.handover.mode === 'hub'
        ? cur.status !== 'Cancelled' && cur.status !== 'Pickup Failed'
        : cur.status === 'Completed')
    if (!picked && !hubPicks) return { kind: 'not-picked', prId: cur.id, orderId: o.id }

    const scan: HandoverScan = { orderId: o.id, by: 'hub', at: new Date().toISOString(),
      hubCode: opts.hubCode ?? null, damaged: opts.damaged === true }
    mapPr(cur.id, (p) => {
      let next = noted({ ...p,
        pickedOrderIds: hubPicks ? [...p.pickedOrderIds, o.id] : p.pickedOrderIds,
        handover: { ...p.handover, hubScanned: [...p.handover.hubScanned, o.id], scanLog: [...p.handover.scanLog, scan],
          /* a parcel in the hub's hands means the truck has arrived */
          arrivedAtHubAt: p.handover.arrivedAtHubAt ?? scan.at } },
      `Hub in-scan ${o.orderNumber}${opts.hubCode ? ` at ${opts.hubCode}` : ''}${opts.damaged ? ' — damaged' : ''}`)
      if (hubPicks && isOpenPr(next.status) && next.orderIds.every((i) => next.pickedOrderIds.includes(i))) {
        next = stamp(next, 'Completed', `${next.orderIds.length} of ${next.orderIds.length} collected (hub in-scan)`)
      }
      return next
    })
    db.orders = db.orders.map((x) => (x.id === o.id
      ? { ...x, status: 'In Transit', ...(hubPicks && !x.pickupRequestId && !x.pickedInRequestId ? { pickupRequestId: cur.id } : {}) }
      : x))
    closeIfReconciled(cur.id)
    commit()
    return { kind: 'ok', prId: cur.id, orderId: o.id }
  },

  /**
   * Settle a Held hub overage. `attach` — the label belongs to an existing
   * order: it becomes that order's tracking number and the order is in-scanned.
   * `create` — a minimal parcel order is raised for it, already at this hub.
   * `reject` — recorded and left out of the network.
   */
  resolveHubOverage(id: string, r: { action: 'attach'; orderId: string } | { action: 'create' } | { action: 'reject'; note?: string }):
  HubOverage | null {
    const v = db.hubOverages.find((x) => x.id === id)
    if (!v || v.status !== 'Held') return null
    const set = (patch: Partial<HubOverage>) => {
      db.hubOverages = db.hubOverages.map((x) => (x.id === id ? { ...x, ...patch } : x))
    }
    if (r.action === 'reject') {
      set({ status: 'Rejected', note: r.note ?? null })
      commit()
    } else {
      let orderId: string
      if (r.action === 'attach') {
        if (!db.orders.some((o) => o.id === r.orderId)) return null
        orderId = r.orderId
        db.orders = db.orders.map((o) => (o.id === orderId ? { ...o, trackingNumber: v.code } : o))
      } else {
        const o: GrowOrder = { ...DEFAULTS, id: newOrderId(), orderNumber: v.code, trackingNumber: v.code,
          createdAt: new Date().toISOString(), status: 'In Transit', inboundHubCode: v.hubCode || DEFAULTS.inboundHubCode,
          remarks: 'Created from hub overage' }
        db.orders = [o, ...db.orders]
        orderId = o.id
      }
      set({ status: r.action === 'attach' ? 'Attached' : 'Created', orderId,
        note: r.action === 'create' ? 'Created from hub overage' : null })
      commit()
      /* the parcel is physically in this hub — in-scan it; with no request to
         reconcile against, the order still moves to In Transit */
      const res = growOrderActions.hubScan(orderId, { hubCode: v.hubCode || null, damaged: v.damaged })
      if (res.kind !== 'ok' && res.kind !== 'already' && res.kind !== 'closed') {
        db.orders = db.orders.map((o) => (o.id === orderId ? { ...o, status: 'In Transit' } : o))
        commit()
      }
    }
    return db.hubOverages.find((x) => x.id === id) ?? null
  },

  /** Send a misrouted parcel on to the hub it should have entered at. The
   *  order's `inboundHubCode` is left alone — the forward is RECORDED on the
   *  request's scan log and history. False when there is no request to record it on. */
  forwardMisroute(orderId: string, toHubCode: string, note?: string): boolean {
    const o = db.orders.find((x) => x.id === orderId)
    const prId = o ? o.pickedInRequestId ?? o.pickupRequestId : null
    if (!o || !prId || !db.pickupRequests.some((p) => p.id === prId)) return false
    const scan: HandoverScan = { orderId, by: 'hub', at: new Date().toISOString(), hubCode: toHubCode, damaged: false, forwarded: true }
    mapPr(prId, (p) => noted({ ...p, handover: { ...p.handover, scanLog: [...p.handover.scanLog, scan] } },
      `Misroute ${o.orderNumber} forwarded to ${toHubCode}${note ? ` — ${note}` : ''}`))
    commit()
    return true
  },

  /** Close a completed request's handover: when the buckets reconcile, or when
   *  ops FORCES it (a short delivery accepted as final) — the note says why. */
  closeHandover(prId: string, force = false, note?: string): boolean {
    const p = db.pickupRequests.find((x) => x.id === prId)
    if (!p || p.status !== 'Completed') return false
    if (p.handover.closedAt) return true
    const ok = handoverReconciled(p)
    if (!ok && !force) return false
    closeNow(prId, ok
      ? `Handover reconciled — ${plural(p.pickedOrderIds.length, 'consignment')}`
      : `Handover force-closed${note ? ` — ${note}` : ''}`)
    commit()
    return true
  },

  reset() { db = seed(); commit() },
}

/** Why an empty pickup ends as failed rather than completed. */
export const EMPTY_PICKUP_NOTE = 'No orders to collect'

/** The reserved-pickup block of an ordinary, order-backed request. */
const NOT_BLIND = {
  pickedOrderIds: [] as string[], overages: [] as PickupOverage[],
  blind: false, shipmentType: 'Parcel', expectedPieces: null, expectedWeightKg: null, sizeClass: null,
  vehicleType: null, vehicleUnit: null, ftlServiceType: null, shipFrom: null, shipTo: null,
  contactName: '', contactNumber: '', note: '',
} as const satisfies Partial<GrowPickupRequest>

/**
 * The open request a new booking would duplicate: the same collection point on
 * the same day with an OVERLAPPING time window (not merely an identical slot
 * string — 09:00–13:00 and 11:00–14:00 are the same van turning up twice).
 * Reads the live snapshot, so a caller that renders off `useGrowOrders()`
 * re-evaluates it on every mutation. `exceptId` skips the row being edited.
 */
export function findOpenPickupConflict(
  storeCode: string, startAt: string, endAt: string, shipFromLine1 = '', exceptId?: string,
): GrowPickupRequest | undefined {
  if (!storeCode || !startAt || !endAt) return undefined
  const key = shipFromLine1.trim().toLowerCase()
  return db.pickupRequests.find((p) => isOpenPr(p.status) && p.id !== exceptId
    && p.storeCode === storeCode
    && (p.shipFrom?.line1 ?? '').trim().toLowerCase() === key
    && rangesOverlap(startAt, endAt, p.startAt, p.endAt))
}

/** The live snapshot, for stores (planningStore) that read it outside React. */
export const growOrdersSnapshot = (): GrowOrdersDb => db
export const hubOverages = (): HubOverage[] => db.hubOverages

export const orderById = (id: string) => db.orders.find((o) => o.id === id)
export const pickupRequestById = (id: string | null) =>
  (id ? db.pickupRequests.find((p) => p.id === id) : undefined)
