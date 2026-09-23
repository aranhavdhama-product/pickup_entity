/**
 * Pickup demo store — dependency-free, reactive, persisted to localStorage.
 *
 *   usePickupDb()   React hook (useSyncExternalStore) → the current PickupDb
 *   pickupActions   every mutation the demo needs, each one persists + notifies
 *   selectors       pure helpers (pendingForPlanning, openOverages, prById, …)
 *
 * Contract notes for page authors:
 *  - `getSnapshot` returns the SAME object reference until a real mutation, so
 *    every action ends with `commit()`, which reassigns `db = { ...db }`. Never
 *    build a new object inside a selector that a component renders directly.
 *  - Status transitions have exactly one owner each. Only `completePickup`
 *    decides COMPLETED vs COMPLETED_SHORT; `confirmCount` just records a count.
 *  - `planTrip` sets `tripId` on consignments and never touches their `state`.
 *
 * See ./README.md for the state machines and the CTO use-case mapping.
 */
import { useSyncExternalStore } from 'react'
import type {
  AutoCreateRule, Carrier, DemoConsignment, Overage, Piece, PickupConfig, PickupDb,
  PickupRequest, PickupSlot, PRSource, Trip, TripStop,
} from './types'
import { CARRIERS, LOCATIONS, MERCHANTS, HUB, isoDate, seed } from './seed'

const STORAGE_KEY = 'fareye-pickup-demo-v1'
const DRIVER = 'R. Sharma'
const VEHICLE = 'MH-01-AB-1234'

/* ---------------- persistence ---------------- */

function isUsableDb(v: unknown): v is PickupDb {
  if (!v || typeof v !== 'object') return false
  const d = v as Partial<PickupDb>
  return Array.isArray(d.pickupRequests) && Array.isArray(d.consignments)
    && Array.isArray(d.overages) && Array.isArray(d.trips)
    && !!d.config && Array.isArray(d.config.slots)
}

function load(): PickupDb {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      // a blob written by an older shape must never crash every page — reseed instead
      if (isUsableDb(parsed)) return parsed
    }
  } catch {
    /* corrupt/unavailable storage → fall through to a fresh seed */
  }
  return seed()
}

function persist() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(db)) } catch { /* quota / private mode */ }
}

/* ---------------- reactive core ---------------- */

let db: PickupDb = load()

const listeners = new Set<() => void>()

function subscribe(fn: () => void): () => void {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}

function getSnapshot(): PickupDb {
  return db
}

/**
 * Reassign the root reference (React bails out otherwise) AND every collection,
 * so `useMemo(..., [db.consignments])` in a page actually invalidates.
 * Individual rows are still mutated in place — see README "Wiring rules".
 */
function commit() {
  db = {
    ...db,
    pickupRequests: [...db.pickupRequests],
    consignments: [...db.consignments],
    overages: [...db.overages],
    trips: [...db.trips],
  }
  persist()
  listeners.forEach((fn) => fn())
}

// Cross-tab sync: the demo opens /grow and /driver in their own tabs, so a
// mutation (or Reset demo data) in one tab must reach the others. Re-hydrate
// `db` from the write the other tab just made and notify local subscribers.
// (`storage` only fires in OTHER tabs, never the one that wrote — so the acting
// tab, already updated by commit(), won't double-apply.)
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key !== null && e.key !== STORAGE_KEY) return
    db = load()
    listeners.forEach((fn) => fn())
  })
}

export function usePickupDb(): PickupDb {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

/** Non-React read (event handlers, one-off checks). */
export function getPickupDb(): PickupDb {
  return db
}

/* ---------------- small helpers ---------------- */

function pad(n: number, width = 4): string {
  return String(n).padStart(width, '0')
}

function nextNum(ids: string[], prefix: string): number {
  let max = 0
  for (const id of ids) {
    if (!id.startsWith(prefix)) continue
    const n = parseInt(id.slice(prefix.length), 10)
    if (Number.isFinite(n) && n > max) max = n
  }
  return max + 1
}

function nextPrId(): string { return 'PR-' + pad(nextNum(db.pickupRequests.map((p) => p.id), 'PR-')) }
function nextTripId(): string { return 'T-' + pad(nextNum(db.trips.map((t) => t.id), 'T-')) }
function nextOverageId(): string { return 'OVG-' + pad(nextNum(db.overages.map((o) => o.id), 'OVG-')) }

function now(): string { return new Date().toISOString() }

function logEvent(pr: PickupRequest, label: string, detail?: string, actor?: string) {
  pr.events.push({ at: now(), label, detail, actor })
}

function trackingOk(tn: string): boolean {
  try { return new RegExp(db.config.trackingRegex).test(tn) } catch { return false }
}

function hhmm(hoursFromNine: number): string {
  const h = (9 + hoursFromNine) % 24
  return `${pad(h, 2)}:00`
}

/* ---------------- selectors (pure) ---------------- */

export function prById(d: PickupDb, id: string): PickupRequest | undefined {
  return d.pickupRequests.find((p) => p.id === id)
}

export function consignmentById(d: PickupDb, id: string): DemoConsignment | undefined {
  return d.consignments.find((c) => c.id === id)
}

export function tripById(d: PickupDb, id: string): Trip | undefined {
  return d.trips.find((t) => t.id === id)
}

export function overageById(d: PickupDb, id: string): Overage | undefined {
  return d.overages.find((o) => o.id === id)
}

export function consignmentsForPr(d: PickupDb, prId: string): DemoConsignment[] {
  const pr = prById(d, prId)
  if (!pr) return []
  return pr.consignmentIds
    .map((id) => consignmentById(d, id))
    .filter((c): c is DemoConsignment => !!c)
}

export function overagesForPr(d: PickupDb, prId: string): Overage[] {
  return d.overages.filter((o) => o.prId === prId)
}

export function overagesForTrip(d: PickupDb, tripId: string): Overage[] {
  return d.overages.filter((o) => o.tripId === tripId)
}

/** Anything still needing a facility action: stray scans not yet matched to a consignment. */
export function openOverages(d: PickupDb): Overage[] {
  return d.overages.filter((o) => !o.reconciled)
}

/** Consignments carrying a field-captured piece that CFT has not verified yet. */
export function amberConsignments(d: PickupDb): DemoConsignment[] {
  return d.consignments.filter((c) => c.amberException)
}

/** PRs a merchant location currently has in flight (blocks a duplicate raise). */
export function livePrsAt(d: PickupDb, merchantCode: string, locationCode: string): PickupRequest[] {
  return d.pickupRequests.filter((p) =>
    p.merchantCode === merchantCode && p.locationCode === locationCode &&
    (p.status === 'OPEN' || p.status === 'PLANNED'))
}

/**
 * The Pending-for-Planning pool. PRs REPLACE the consignments they carry, so a
 * first-mile consignment only appears on its own while it has no PR.
 *
 *   PR           → status OPEN
 *   FIRST_MILE   → state CREATED and linkedPrId == null   (not carried by a PR)
 *   LAST_MILE    → state CREATED or AT_FACILITY           (ready to go out)
 *   both         → tripId == null                          (not already planned)
 */
export function pendingForPlanning(d: PickupDb): { prs: PickupRequest[]; consignments: DemoConsignment[] } {
  const prs = d.pickupRequests.filter((p) => p.status === 'OPEN')
  const consignments = d.consignments.filter((c) => {
    if (c.tripId) return false
    if (c.leg === 'LAST_MILE') return c.state === 'CREATED' || c.state === 'AT_FACILITY'
    return c.state === 'CREATED' && !c.linkedPrId
  })
  return { prs, consignments }
}

/** First-mile consignments waiting at a location with no PR against them. */
export function unlinkedFirstMileAt(d: PickupDb, locationCode: string, merchantCode?: string): DemoConsignment[] {
  return d.consignments.filter((c) =>
    c.leg === 'FIRST_MILE' && c.state === 'CREATED' && !c.linkedPrId && !c.tripId &&
    c.pickupLocationCode === locationCode &&
    (!merchantCode || merchantCode === 'ALL' || c.merchantCode === merchantCode))
}

/** Expected vs collected for a PR — the number pair every pickup screen shows. */
export function pickupProgress(d: PickupDb, prId: string): { expected: number; collected: number; overages: number } {
  const pr = prById(d, prId)
  if (!pr) return { expected: 0, collected: 0, overages: 0 }
  const pieces = consignmentsForPr(d, prId).flatMap((c) => c.pieces)
  const overages = overagesForPr(d, prId).length
  const scanned = pieces.filter((p) => p.scanned).length
  const expected = pr.expectedPieces ?? pieces.length
  const collected = pr.confirmedPieces ?? (scanned + (pr.blind ? overages : 0))
  return { expected, collected, overages }
}

/* ---------------- actions ---------------- */

export interface CreatePrInput {
  merchantCode: string
  locationCode: string
  slot: PickupSlot | null
  blind: boolean
  expectedPieces?: number | null
  expectedWeightKg?: number | null
  scannable?: boolean
  skuMode?: boolean
  consignmentIds?: string[]
  source: PRSource
  createdBy: string
  /** carrier that will perform the pickup (see `CARRIERS`); omit ⇒ Unassigned */
  carrierCode?: string
  /** raise anyway, ignoring `config.multiPrPolicy` */
  force?: boolean
}

export interface ScanResult {
  /** PIECE = expected piece captured · DUPLICATE = already scanned ·
   *  OTHER_CONSIGNMENT = belongs to a consignment not on this PR · OVERAGE = unknown */
  hit: 'PIECE' | 'DUPLICATE' | 'OTHER_CONSIGNMENT' | 'OVERAGE'
  consignmentId?: string
  overageId?: string
  trackingNumber: string
}

export const pickupActions = {
  /* -------- raise / amend -------- */

  /**
   * Raise a PR. Returns `{ conflict }` (and creates nothing) when
   * `config.multiPrPolicy` forbids it — pass `force: true` to override.
   */
  createPickupRequest(input: CreatePrInput): { pr?: PickupRequest; conflict?: PickupRequest } {
    const policy = db.config.multiPrPolicy
    if (!input.force && policy !== 'UNLIMITED') {
      const live = livePrsAt(db, input.merchantCode, input.locationCode)
      const conflict = policy === 'ONE_OPEN'
        ? live[0]
        : live.find((p) => !!p.slot && !!input.slot &&
            p.slot.date === input.slot.date && p.slot.start === input.slot.start)
      if (conflict) return { conflict }
    }

    const loc = LOCATIONS[input.locationCode]
    const merch = MERCHANTS[input.merchantCode]
    const ids = input.consignmentIds ?? []
    const linked = ids
      .map((id) => consignmentById(db, id))
      .filter((c): c is DemoConsignment => !!c)

    const declared = input.expectedPieces ?? null
    const derived = linked.reduce((n, c) => n + (c.pieces.length || 0), 0)
    const carrier = input.carrierCode ? CARRIERS[input.carrierCode] : undefined

    const pr: PickupRequest = {
      id: nextPrId(),
      merchantCode: input.merchantCode,
      merchantName: merch?.name ?? input.merchantCode,
      locationCode: input.locationCode,
      locationName: loc?.name ?? input.locationCode,
      address: loc?.address ?? '',
      contactName: loc?.contactName ?? '',
      contactPhone: loc?.contactPhone ?? '',
      slot: input.slot,
      blind: input.blind,
      expectedPieces: declared ?? (ids.length ? derived : null),
      expectedWeightKg: input.expectedWeightKg ?? (ids.length ? linked.reduce((n, c) => n + (c.weightKg || 0), 0) : null),
      scannable: input.scannable ?? true,
      skuMode: input.skuMode,
      consignmentIds: ids,
      source: input.source,
      createdAt: now(),
      createdBy: input.createdBy,
      carrierCode: carrier?.code,
      carrierName: carrier?.name,
      status: 'OPEN',
      attempt: 1,
      maxAttempts: 3,
      events: [],
    }
    logEvent(pr, input.blind ? 'Blind pickup request raised' : 'Pickup request raised',
      input.blind
        ? `${pr.expectedPieces ?? '?'} pieces declared — soft data to follow`
        : `${ids.length} consignment(s) · ${pr.expectedPieces ?? 0} piece(s)`,
      input.source)

    // linked consignments stay CREATED — a PR reserves them, it does not move them
    linked.forEach((c) => { c.linkedPrId = pr.id })
    db.pickupRequests.push(pr)
    commit()
    return { pr }
  },

  /** Fold more pending consignments into an existing OPEN/PLANNED PR. */
  mergeIntoPickupRequest(prId: string, consignmentIds: string[]): PickupRequest | undefined {
    const pr = prById(db, prId)
    if (!pr) return undefined
    const added: string[] = []
    consignmentIds.forEach((id) => {
      const c = consignmentById(db, id)
      if (!c || pr.consignmentIds.includes(id)) return
      c.linkedPrId = pr.id
      pr.consignmentIds.push(id)
      added.push(id)
    })
    if (!added.length) return pr
    if (!pr.blind) {
      pr.expectedPieces = consignmentsForPr(db, pr.id).reduce((n, c) => n + c.pieces.length, 0)
      pr.expectedWeightKg = consignmentsForPr(db, pr.id).reduce((n, c) => n + (c.weightKg || 0), 0)
    }
    logEvent(pr, 'Consignments merged', added.join(', '), 'Dispatch')
    commit()
    return pr
  },

  /** Assign (or reassign) the carrier that will perform a PR's pickup. No-op safe. */
  assignCarrier(prId: string, carrierCode: string): PickupRequest | undefined {
    const pr = prById(db, prId)
    const carrier = CARRIERS[carrierCode]
    if (!pr || !carrier) return undefined
    pr.carrierCode = carrier.code
    pr.carrierName = carrier.name
    logEvent(pr, 'Carrier assigned', carrier.name, 'Dispatch')
    commit()
    return pr
  },

  cancelPickupRequest(prId: string, reason: string): void {
    const pr = prById(db, prId)
    if (!pr) return
    pr.status = 'CANCELLED'
    pr.failureReason = reason
    // cancelling releases the consignments back into the pending pool
    consignmentsForPr(db, prId).forEach((c) => { if (c.state === 'CREATED') c.linkedPrId = null })
    logEvent(pr, 'Pickup request cancelled', reason, 'Dispatch')
    commit()
  },

  /** Clone a FAILED PR as a fresh OPEN attempt (today's slot), linked both ways. */
  reattemptPickupRequest(prId: string): PickupRequest | undefined {
    const src = prById(db, prId)
    if (!src) return undefined
    const clone: PickupRequest = {
      ...src,
      id: nextPrId(),
      slot: src.slot ? { ...src.slot, date: isoDate(0) } : null,
      status: 'OPEN',
      attempt: src.attempt + 1,
      failureReason: undefined,
      parentPrId: src.id,
      reattemptPrId: undefined,
      tripId: undefined,
      confirmedPieces: undefined,
      createdAt: now(),
      consignmentIds: [...src.consignmentIds],
      events: [],
    }
    logEvent(clone, `Re-attempt raised (attempt ${clone.attempt} of ${clone.maxAttempts})`,
      `Original ${src.id} failed: ${src.failureReason ?? 'unknown'}`, 'Dispatch')
    src.reattemptPrId = clone.id
    logEvent(src, 'Re-attempt created', clone.id, 'Dispatch')
    consignmentsForPr(db, src.id).forEach((c) => { c.linkedPrId = clone.id })
    db.pickupRequests.push(clone)
    commit()
    return clone
  },

  /* -------- planning -------- */

  /**
   * Build one trip out of selected PRs + last-mile consignments.
   * Stops = every pickup first (hourly ETAs from 09:00), then every delivery.
   * The delivery leg of each first-mile consignment carried by the PRs is added
   * automatically — that is the whole point of the merged first/last-mile plan.
   */
  planTrip(input: { prIds: string[]; consignmentIds: string[]; carrierCode?: string }): Trip {
    const id = nextTripId()
    const seq = { n: 0 }
    const stops: TripStop[] = []

    input.prIds.forEach((prId) => {
      seq.n += 1
      stops.push({ seq: seq.n, kind: 'PICKUP', prId, eta: hhmm(seq.n - 1), status: 'PENDING' })
    })

    const deliveryIds = [...input.consignmentIds]
    input.prIds.forEach((prId) => {
      consignmentsForPr(db, prId).forEach((c) => {
        if (c.leg === 'FIRST_MILE' && !deliveryIds.includes(c.id)) deliveryIds.push(c.id)
      })
    })

    deliveryIds.forEach((cid) => {
      seq.n += 1
      stops.push({ seq: seq.n, kind: 'DELIVERY', consignmentId: cid, eta: hhmm(seq.n - 1), status: 'PENDING' })
    })

    // effective carrier: explicit input → else the first selected PR's carrier → else none
    let carrier: Carrier | undefined
    if (input.carrierCode) carrier = CARRIERS[input.carrierCode]
    if (!carrier) {
      const firstPr = prById(db, input.prIds[0])
      if (firstPr?.carrierCode) carrier = CARRIERS[firstPr.carrierCode]
    }
    const driver = carrier?.driver ?? DRIVER
    const vehicle = carrier?.vehicle ?? VEHICLE

    const trip: Trip = {
      id,
      routeName: `Route ${nextNum(db.trips.map((t) => t.id), 'T-')}`,
      driver,
      vehicle,
      carrierCode: carrier?.code,
      carrierName: carrier?.name,
      date: isoDate(0),
      status: 'PLANNED',
      stops,
      loads: { firstLeg: [...input.prIds], lastLeg: deliveryIds },
    }

    input.prIds.forEach((prId) => {
      const pr = prById(db, prId)
      if (!pr) return
      pr.status = 'PLANNED'
      pr.tripId = id
      logEvent(pr, `Planned on trip ${id}`, `${trip.routeName} · ${driver} · ${vehicle}`, 'Dispatch')
    })
    // consignments only get a tripId — their state is owned by execution, not planning
    deliveryIds.forEach((cid) => {
      const c = consignmentById(db, cid)
      if (c) c.tripId = id
    })

    db.trips.push(trip)
    commit()
    return trip
  },

  startTrip(tripId: string): void {
    const trip = tripById(db, tripId)
    if (!trip) return
    trip.status = 'IN_PROGRESS'
    trip.loads.firstLeg.forEach((prId) => {
      const pr = prById(db, prId)
      if (!pr) return
      pr.status = 'IN_PROGRESS'
      logEvent(pr, 'Trip started', `${trip.routeName} · ${trip.driver}`, trip.driver)
    })
    commit()
  },

  arriveStop(tripId: string, seq: number): void {
    const trip = tripById(db, tripId)
    const stop = trip?.stops.find((s) => s.seq === seq)
    if (!trip || !stop) return
    stop.status = 'ARRIVED'
    if (stop.prId) {
      const pr = prById(db, stop.prId)
      if (pr) logEvent(pr, 'Driver arrived', pr.address, trip.driver)
    }
    commit()
  },

  /* -------- execution (driver app) -------- */

  /**
   * Scan a label at the doorstep. Matching is on PIECE tracking numbers, never
   * on consignment ids: an unknown label becomes an Overage row on the spot.
   */
  scanPiece(prId: string, trackingNumber: string): ScanResult {
    const tn = trackingNumber.trim().toUpperCase()
    const pr = prById(db, prId)
    const mine = consignmentsForPr(db, prId)

    for (const c of mine) {
      const p = c.pieces.find((x) => x.trackingNumber.toUpperCase() === tn)
      if (!p) continue
      if (p.scanned) return { hit: 'DUPLICATE', consignmentId: c.id, trackingNumber: tn }
      p.scanned = true
      if (pr) logEvent(pr, 'Piece scanned', tn, DRIVER)
      commit()
      return { hit: 'PIECE', consignmentId: c.id, trackingNumber: tn }
    }

    const elsewhere = db.consignments.find((c) =>
      !mine.some((m) => m.id === c.id) &&
      c.pieces.some((x) => x.trackingNumber.toUpperCase() === tn))
    if (elsewhere) return { hit: 'OTHER_CONSIGNMENT', consignmentId: elsewhere.id, trackingNumber: tn }

    const ov: Overage = {
      id: nextOverageId(),
      scannedTrackingNumber: tn,
      validTracking: trackingOk(tn),
      scannedBy: DRIVER,
      scannedAt: now(),
      prId,
      tripId: pr?.tripId,
      locationCode: pr?.locationCode,
      state: 'CREATED',
      reconciled: false,
      kind: 'UNKNOWN_SCAN',
    }
    db.overages.push(ov)
    if (pr) logEvent(pr, 'Overage recorded', `${tn} — not expected on this pickup`, DRIVER)
    commit()
    return { hit: 'OVERAGE', overageId: ov.id, trackingNumber: tn }
  },

  /** Driver adds a piece the soft data never mentioned — flags the consignment amber for CFT. */
  addFieldPiece(prId: string, consignmentId: string, piece: Partial<Piece>): Piece | undefined {
    const c = consignmentById(db, consignmentId)
    if (!c) return undefined
    const fieldCount = db.consignments.reduce(
      (n, x) => n + x.pieces.filter((p) => p.trackingNumber.startsWith('FLD-')).length, 0)
    const added: Piece = {
      ...piece,
      trackingNumber: piece.trackingNumber || `FLD-${fieldCount + 1}`,
      addedInField: true,
      scanned: true,
      verified: false,
    }
    c.pieces.push(added)
    c.amberException = true
    const pr = prById(db, prId)
    if (pr) logEvent(pr, 'Piece added in field', `${added.trackingNumber} → ${c.id}`, DRIVER)
    commit()
    return added
  },

  /** Unlabeled goods handed over — `together` records them as one bundle. */
  addUnlabeledOverage(prId: string, count: number, note: string, together: boolean): string[] {
    const pr = prById(db, prId)
    const groupId = together ? `GRP-${Date.now()}` : undefined
    const ids: string[] = []
    for (let i = 0; i < Math.max(0, count); i++) {
      const ov: Overage = {
        id: nextOverageId(),
        scannedTrackingNumber: '',
        validTracking: false,
        scannedBy: DRIVER,
        scannedAt: now(),
        prId,
        tripId: pr?.tripId,
        locationCode: pr?.locationCode,
        state: 'CREATED',
        reconciled: false,
        kind: together ? 'UNLABELED_GROUP' : 'UNLABELED',
        note,
        groupId,
      }
      db.overages.push(ov)
      ids.push(ov.id)
    }
    if (pr && ids.length) {
      logEvent(pr, 'Unlabeled goods recorded',
        `${ids.length} item(s)${together ? ' (one bundle)' : ''}${note ? ` — ${note}` : ''}`, DRIVER)
    }
    commit()
    return ids
  },

  /**
   * Count-based pickup: record what the driver actually counted.
   * Does NOT change the PR status — `completePickup` owns that.
   */
  confirmCount(prId: string, count: number): { short: boolean } {
    const pr = prById(db, prId)
    if (!pr) return { short: false }
    pr.confirmedPieces = count
    const expected = pr.expectedPieces ?? 0
    const short = expected > 0 && count < expected
    logEvent(pr, 'Count confirmed', `${count} of ${expected || '?'} expected${short ? ' — short' : ''}`, DRIVER)
    commit()
    return { short }
  },

  /** SKU picking for non-scannable consignments. */
  skuPick(prId: string, consignmentId: string, skuCode: string,
    result: { picked?: number; missing?: number; damaged?: number }): void {
    const c = consignmentById(db, consignmentId)
    const sku = c?.skus?.find((s) => s.code === skuCode)
    if (!c || !sku) return
    if (result.picked !== undefined) sku.picked = result.picked
    if (result.missing !== undefined) sku.missing = result.missing
    if (result.damaged !== undefined) sku.damaged = result.damaged
    if ((sku.missing ?? 0) > 0 || (sku.damaged ?? 0) > 0) c.amberException = true
    const pr = prById(db, prId)
    if (pr) {
      logEvent(pr, 'SKU picked', `${c.id} · ${sku.code}: ${sku.picked ?? 0} picked`
        + ((sku.missing ?? 0) ? `, ${sku.missing} missing` : '')
        + ((sku.damaged ?? 0) ? `, ${sku.damaged} damaged` : ''), DRIVER)
    }
    commit()
  },

  /**
   * Close the pickup. Consignments with anything collected go PICKED_UP;
   * anything untouched is released back into the pending pool (its id stays on
   * the PR for audit, only `linkedPrId` is cleared).
   */
  completePickup(prId: string): { status: 'COMPLETED' | 'COMPLETED_SHORT'; collected: number; expected: number } {
    const pr = prById(db, prId)
    if (!pr) return { status: 'COMPLETED', collected: 0, expected: 0 }
    const cons = consignmentsForPr(db, prId)
    const pieces = cons.flatMap((c) => c.pieces)
    const scanned = pieces.filter((p) => p.scanned).length
    const overages = overagesForPr(db, prId).length
    const expected = pr.expectedPieces ?? pieces.length
    const collected = pr.confirmedPieces ?? (scanned + (pr.blind ? overages : 0))

    const trip = pr.tripId ? tripById(db, pr.tripId) : undefined
    cons.forEach((c) => {
      const gotPieces = c.pieces.some((p) => p.scanned)
      const gotSkus = (c.skus ?? []).some((s) => (s.picked ?? 0) > 0)
      if (gotPieces || gotSkus) {
        c.state = 'PICKED_UP'
        return
      }
      if (c.leg !== 'FIRST_MILE') return
      // nothing collected → release it fully: unlink from the PR AND drop its
      // delivery leg off this trip, or it can never be re-planned.
      c.linkedPrId = null
      if (trip && c.tripId === trip.id) {
        c.tripId = null
        trip.loads.lastLeg = trip.loads.lastLeg.filter((id) => id !== c.id)
        const del = trip.stops.find((s) => s.kind === 'DELIVERY' && s.consignmentId === c.id)
        if (del) del.status = 'FAILED'
      }
    })

    const missingPieces = pieces.some((p) => !p.scanned && !p.addedInField)
    const status = (missingPieces || collected < expected) ? 'COMPLETED_SHORT' : 'COMPLETED'
    pr.status = status
    logEvent(pr, status === 'COMPLETED' ? 'Pickup completed' : 'Pickup completed short',
      `${collected} of ${expected} expected piece(s)` + (overages ? ` · ${overages} overage(s)` : ''), DRIVER)

    const pickupStop = trip?.stops.find((s) => s.prId === pr.id)
    if (pickupStop) pickupStop.status = 'DONE'
    commit()
    return { status, collected, expected }
  },

  failPickup(prId: string, reason: string): void {
    const pr = prById(db, prId)
    if (!pr) return
    pr.status = 'FAILED'
    pr.failureReason = reason
    logEvent(pr, 'Pickup failed', reason, DRIVER)
    const trip = pr.tripId ? tripById(db, pr.tripId) : undefined
    if (trip) {
      const stop = trip.stops.find((s) => s.prId === pr.id)
      if (stop) stop.status = 'FAILED'
      // nothing was collected, so the delivery legs planned off this pickup are
      // void — free them so the re-attempt can be planned onto a new trip.
      consignmentsForPr(db, prId).forEach((c) => {
        if (c.leg !== 'FIRST_MILE' || c.tripId !== trip.id) return
        c.tripId = null
        trip.loads.lastLeg = trip.loads.lastLeg.filter((id) => id !== c.id)
        const del = trip.stops.find((s) => s.kind === 'DELIVERY' && s.consignmentId === c.id)
        if (del) del.status = 'FAILED'
      })
    }
    commit()
  },

  /* -------- facility -------- */

  /** Handover/debrief at the hub: everything collected on the trip lands AT_FACILITY. */
  debrief(tripId: string, confirmedCount: number): void {
    const trip = tripById(db, tripId)
    if (!trip) return
    trip.loads.firstLeg.forEach((prId) => {
      consignmentsForPr(db, prId).forEach((c) => {
        if (c.state === 'PICKED_UP') c.state = 'AT_FACILITY'
      })
      const pr = prById(db, prId)
      if (pr) logEvent(pr, 'Handover at facility', `${HUB} · ${confirmedCount} piece(s) confirmed`, 'Debrief desk')
    })
    overagesForTrip(db, tripId).forEach((o) => { o.state = 'AT_FACILITY' })
    trip.status = 'COMPLETED'
    commit()
  },

  /**
   * Simulate the merchant's soft data landing after the fact: every unreconciled
   * overage with a valid tracking number becomes a real consignment.
   */
  pushSoftData(): number {
    let n = nextNum(db.consignments.map((c) => c.id), 'CX-')
    let count = 0
    db.overages.forEach((o) => {
      if (o.reconciled || !o.validTracking) return
      const pr = o.prId ? prById(db, o.prId) : undefined
      const created: DemoConsignment = {
        id: `CX-${n}`,
        orderId: `OX-${n}`,
        merchantCode: pr?.merchantCode,
        merchantName: pr?.merchantName,
        pickupLocationCode: o.locationCode ?? pr?.locationCode ?? null,
        deliveryName: 'Soft data — consignee pending',
        deliveryAddress: '',
        deliveryCity: '',
        pieces: [{ trackingNumber: o.scannedTrackingNumber, scanned: true }],
        state: 'AT_FACILITY',
        leg: 'FIRST_MILE',
        linkedPrId: o.prId ?? null,
        tripId: null,
        weightKg: 0,
        scannable: true,
        createdVia: 'SOFT_DATA',
      }
      db.consignments.push(created)
      o.reconciled = true
      o.reconciledConsignmentId = created.id
      if (pr) logEvent(pr, 'Overage reconciled', `${o.scannedTrackingNumber} → ${created.id} (soft data received)`, 'System')
      n += 1
      count += 1
    })
    if (count) commit()
    return count
  },

  /** CFT resolves an overage by hand: the label belongs to a consignment we already have. */
  attachOverageToConsignment(overageId: string, consignmentId: string): void {
    const o = overageById(db, overageId)
    const c = consignmentById(db, consignmentId)
    if (!o || !c) return
    if (!c.pieces.some((p) => p.trackingNumber === o.scannedTrackingNumber)) {
      c.pieces.push({
        trackingNumber: o.scannedTrackingNumber || `FLD-${o.id}`,
        scanned: true,
        addedInField: true,
        verified: false,
      })
    }
    c.amberException = true
    o.reconciled = true
    o.reconciledConsignmentId = c.id
    if (o.prId) {
      const pr = prById(db, o.prId)
      if (pr) logEvent(pr, 'Overage attached', `${o.scannedTrackingNumber || o.id} → ${c.id}`, 'CFT')
    }
    commit()
  },

  /** CFT verification of a field-captured piece; clears amber once nothing is pending. */
  updatePieceCFT(consignmentId: string, trackingNumber: string, patch: Partial<Piece>): void {
    const c = consignmentById(db, consignmentId)
    const p = c?.pieces.find((x) => x.trackingNumber === trackingNumber)
    if (!c || !p) return
    Object.assign(p, patch, { verified: true })
    const pending = c.pieces.filter((x) => x.addedInField && !x.verified)
    if (!pending.length) c.amberException = false
    commit()
  },

  /* -------- config -------- */

  setConfig(patch: Partial<PickupConfig>): void {
    db.config = { ...db.config, ...patch }
    commit()
  },

  upsertAutoRule(rule: AutoCreateRule): void {
    const i = db.config.autoCreateRules.findIndex((r) => r.id === rule.id)
    if (i >= 0) db.config.autoCreateRules[i] = rule
    else db.config.autoCreateRules.push(rule)
    db.config = { ...db.config, autoCreateRules: [...db.config.autoCreateRules] }
    commit()
  },

  /**
   * Run the auto-create rules: any location holding unlinked first-mile
   * consignments with no live PR gets one raised for it (source AUTO).
   */
  autoCreateFromRules(): PickupRequest[] {
    const made: PickupRequest[] = []
    db.config.autoCreateRules.filter((r) => r.enabled).forEach((rule) => {
      const pool = unlinkedFirstMileAt(db, rule.locationCode, rule.merchantCode)
      const byMerchant = new Map<string, string[]>()
      pool.forEach((c) => {
        const key = c.merchantCode ?? rule.merchantCode
        byMerchant.set(key, [...(byMerchant.get(key) ?? []), c.id])
      })
      byMerchant.forEach((ids, merchantCode) => {
        if (livePrsAt(db, merchantCode, rule.locationCode).length) return
        const slotDef = db.config.slots[0]
        const res = pickupActions.createPickupRequest({
          merchantCode,
          locationCode: rule.locationCode,
          slot: slotDef ? { date: isoDate(0), start: slotDef.start, end: slotDef.end } : null,
          blind: false,
          consignmentIds: ids,
          source: 'AUTO',
          createdBy: `auto-rule ${rule.id}`,
        })
        if (res.pr) made.push(res.pr)
      })
    })
    return made
  },

  /* -------- demo control -------- */

  resetDemo(): void {
    try { localStorage.removeItem(STORAGE_KEY) } catch { /* ignore */ }
    db = seed()
    commit()
  },
}
