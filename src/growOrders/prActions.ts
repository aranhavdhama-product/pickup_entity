/**
 * Pickup-request actions by status — the ONE matrix every pickup surface asks
 * (owner, 2026-09-25: "based on status pickup options should be enabled/disabled").
 * Research: docs/superpowers/research/2026-09-25-pickup-actions-by-status.md;
 * rules: the brief's "Changes before the driver leaves" + "Exceptions" tables.
 *
 * Pure: no React, no store, no page imports. Every disabled state carries the
 * `reason` a surface shows as the item's tooltip / muted second line.
 *
 * `prActionState` answers for ONE request; `prBulkState` for a selection — an
 * action is enabled only when it is enabled for EVERY selected request, plus the
 * set rules (one hub to route, one pickup point to merge, single-row actions).
 */
import type { PickupModuleConfig } from '../config/pickupModule'
import type { GrowPickupRequest, PickupRequestStatus } from './types'
import { NO_ORDERS_REASON } from './pickupReasons'
import {
  canAddOrdersTo, canReattempt, canSplitPr, isOpenPr, isPartiallyPicked, SPLITTABLE_PR_STATUSES, type PrLookup,
} from './tabs'

export type PrAction =
  | 'reschedule' | 'cancel'
  | 'assignCarrier' | 'switchToFleet'
  | 'addToRoute' | 'planCollection' | 'loadPlanning' | 'moveRoute' | 'removeFromRoute' | 'changeAssignee'
  | 'reattempt' | 'reattemptRemainder'
  | 'markPickedUp' | 'markFailed'
  | 'addConsignments' | 'removeConsignment' | 'split'
  | 'closeHandover'
  | 'printLabel' | 'printManifest' | 'carrierAccepted'
  | 'confirmSlot' | 'merge' | 'downloadCsv'

export type PrRole = 'ops' | 'merchant'

export interface PrActionCtx {
  cfg: Pick<PickupModuleConfig, 'allowAddToExistingUntil' | 'merchantCancelUntil'>
  /** default 'ops' (the carrier console) */
  role?: PrRole
  /** resolves `reattemptPrId` to a number for the reason line */
  byId?: PrLookup | ((id: string) => (Pick<GrowPickupRequest, 'status'> & Partial<Pick<GrowPickupRequest, 'number'>>) | undefined)
  /** the hub key the caller's routing dialog uses (default `routingHubOf`) */
  hubOf?: (p: PrFacts) => string
}

export interface PrActionState { enabled: boolean; reason?: string }

export type PrFacts = Pick<GrowPickupRequest,
  'id' | 'number' | 'status' | 'orderIds' | 'pickedOrderIds' | 'tripId' | 'carrierMode' | 'carrierName'
  | 'attempt' | 'maxAttempts' | 'reattemptPrId' | 'failureReason' | 'handover' | 'slotConfirmed'
  | 'shipmentType' | 'storeCode' | 'shipFrom' | 'destinationCode'>

/** What a merchant may do from Grow at all; everything else is the carrier console's. */
const MERCHANT_ACTIONS: PrAction[] = ['reschedule', 'cancel', 'addConsignments', 'removeConsignment', 'split', 'merge', 'printLabel', 'downloadCsv']

/** Actions that open a one-request dialog — in a selection they need exactly one row. */
export const SINGLE_ROW_ACTIONS: PrAction[] = ['addConsignments', 'removeConsignment', 'markPickedUp', 'closeHandover', 'moveRoute', 'reattemptRemainder']

/** a route runs out of ONE hub (load planning fans out per hub itself) */
const ONE_HUB: PrAction[] = ['addToRoute', 'planCollection']

/** The pickup-address picker's "Other address…" sentinel (`GrowOrders/utils.OTHER_ADDRESS`). */
const OTHER_ADDRESS_CODE = '__other__'

/**
 * THE pickup-point key (merge, auto-merge on create, Duplicate): a request at a
 * KNOWN location is keyed by its store code alone — a booked request carries no
 * `shipFrom`, a Reserved one at the same store does, and both are one point.
 * Only a typed "Other address…" point (no code, or the sentinel) adds the
 * normalised address line.
 */
export const pickupPointKey = (p: Pick<GrowPickupRequest, 'storeCode' | 'shipFrom'>): string =>
  (p.storeCode && p.storeCode !== OTHER_ADDRESS_CODE
    ? p.storeCode
    : `${p.storeCode ?? ''}|${(p.shipFrom?.line1 ?? '').trim().toLowerCase().replace(/\s+/g, ' ')}`)

/** The hub a request is routed from — the key `AddToRouteDialog` routes with. */
export const routingHubOf = (p: Pick<GrowPickupRequest, 'destinationCode' | 'storeCode'>) => p.destinationCode ?? p.storeCode

const ok: PrActionState = { enabled: true }
const no = (reason: string): PrActionState => ({ enabled: false, reason })
const OUT = 'Already out for pickup'

/** "Cancelled requests cannot be rescheduled" — the closed-state wording. */
function closedReason(s: PickupRequestStatus, verb: string): string {
  if (s === 'Cancelled') return `Cancelled requests cannot be ${verb}`
  if (s === 'Completed') return `Completed requests cannot be ${verb}`
  return `Failed requests cannot be ${verb}`
}

/** Open and the driver has not left: the "before the driver leaves" gate. */
function beforeDispatch(p: PrFacts, verb: string, outReason = OUT): PrActionState | null {
  if (!isOpenPr(p.status)) return no(closedReason(p.status, verb))
  if (p.status === 'Out For Pickup') return no(outReason)
  return null
}

/** The merchant's cut-off (`merchantCancelUntil`, spec M1/M2). */
function merchantGate(p: PrFacts, until: PickupModuleConfig['merchantCancelUntil'], verb: string): PrActionState | null {
  return canAddOrdersTo(p, until) ? null : no(`You can ${verb} until ${until} — contact support`)
}

const STAGE_ORDER = ['Requested', 'Planned', 'Assigned'] as const
const earlier = (a: (typeof STAGE_ORDER)[number], b: (typeof STAGE_ORDER)[number]) =>
  (STAGE_ORDER.indexOf(a) <= STAGE_ORDER.indexOf(b) ? a : b)

export function prActionState(action: PrAction, p: PrFacts, ctx: PrActionCtx): PrActionState {
  const role = ctx.role ?? 'ops'
  if (role === 'merchant' && !MERCHANT_ACTIONS.includes(action)) return no('Done by the carrier console')
  const merchant = role === 'merchant'
  const blocked = (...gs: (PrActionState | null)[]) => gs.find((g) => g) ?? null

  switch (action) {
    case 'downloadCsv': return ok

    case 'reschedule':
      return blocked(beforeDispatch(p, 'rescheduled'), merchant ? merchantGate(p, ctx.cfg.merchantCancelUntil, 'reschedule') : null) ?? ok

    case 'cancel':
      return blocked(beforeDispatch(p, 'cancelled', merchant ? OUT : `${OUT} — mark it failed instead`),
        merchant ? merchantGate(p, ctx.cfg.merchantCancelUntil, 'cancel') : null) ?? ok

    case 'addConsignments': {
      const until = merchant ? earlier(ctx.cfg.allowAddToExistingUntil, ctx.cfg.merchantCancelUntil) : ctx.cfg.allowAddToExistingUntil
      return blocked(beforeDispatch(p, 'added to', `${OUT} — extra parcels become overages`))
        ?? (canAddOrdersTo(p, until) ? ok : no(`Consignments can be added until ${until}`))
    }

    case 'removeConsignment':
      return blocked(beforeDispatch(p, 'changed'), merchant ? merchantGate(p, ctx.cfg.merchantCancelUntil, 'remove consignments') : null)
        ?? (p.orderIds.length ? ok : no('No consignments on this request'))

    case 'split': {
      /* owner, 2026-09-25: LTL only */
      if (p.shipmentType === 'FTL') return no('Full-vehicle bookings are never split')
      const g = blocked(beforeDispatch(p, 'split'), merchant ? merchantGate(p, ctx.cfg.merchantCancelUntil, 'split') : null)
      if (g) return g
      if (!SPLITTABLE_PR_STATUSES.includes(p.status)) return no(`${p.status} requests cannot be split`)
      return canSplitPr(p) ? ok : no('one consignment — nothing to split')
    }

    case 'assignCarrier': {
      const g = beforeDispatch(p, 'assigned')
      if (g) return g
      if (p.tripId) return no(`On trip ${p.tripId} — remove it from the route first`)
      if (p.carrierMode === 'CARRIER' && p.status === 'Assigned') return no(`Already with ${p.carrierName ?? 'a carrier'} — switch to fleet first`)
      if (p.status === 'Requested' || p.status === 'Planned' || p.status === 'Ready For Last Mile Dispatch') return ok
      return no(`${p.status} — assign a carrier while Requested`)
    }

    case 'switchToFleet':
      if (p.carrierMode !== 'CARRIER') return no('Already on the own fleet')
      return beforeDispatch(p, 'switched') ?? ok

    case 'addToRoute': case 'planCollection': case 'loadPlanning': {
      const g = beforeDispatch(p, 'routed')
      if (g) return g
      if (p.carrierMode === 'CARRIER') return no('Assigned to a carrier')
      if (p.tripId) return no(`Already on a trip (${p.tripId})`)
      if (p.status !== 'Requested' && p.status !== 'Planned') return no(`${p.status} — only Requested or Planned requests can be routed`)
      if (p.slotConfirmed === false) return no('Awaiting slot confirmation from the shipper')
      return ok
    }

    case 'moveRoute': case 'removeFromRoute': case 'changeAssignee':
      if (!p.tripId) return no('Not on a trip')
      return beforeDispatch(p, 'moved') ?? ok

    case 'reattempt': {
      if (p.status !== 'Pickup Failed') return no('Only a failed pickup can be re-attempted')
      if (p.reattemptPrId) {
        const n = (ctx.byId?.(p.reattemptPrId) as { number?: string } | undefined)?.number
        return no(`Re-attempt already raised${n ? ` (${n})` : ''}`)
      }
      if (p.attempt >= p.maxAttempts) return no(`All ${p.maxAttempts} attempts used`)
      /* the Reason Policy's Hold is overridden by ops (brief) — only an empty pickup stays empty */
      if (p.failureReason === NO_ORDERS_REASON && p.orderIds.length === 0) return no('Nothing to collect — book the consignments again')
      return canReattempt(p) ? ok : no('This pickup cannot be re-attempted')
    }

    case 'reattemptRemainder':
      return isPartiallyPicked(p) ? ok : no('Only a partially picked request has a remainder')

    case 'markPickedUp': case 'markFailed': {
      const verb = action === 'markPickedUp' ? 'marked picked up' : 'marked failed'
      if (!isOpenPr(p.status)) return no(closedReason(p.status, verb))
      if (p.status !== 'Assigned' && p.status !== 'Out For Pickup') return no('Not dispatched yet — reschedule or cancel instead')
      if (action === 'markPickedUp' && p.orderIds.length === 0) return no('No consignments to mark picked up')
      return ok
    }

    case 'closeHandover':
      if (p.status !== 'Completed') return no('Only a completed pickup has a handover to close')
      return p.handover.closedAt ? no('Handover already closed') : ok

    case 'printLabel':
      return p.status === 'Cancelled' ? no('Cancelled requests have no label') : ok

    case 'printManifest':
      if (p.carrierMode !== 'CARRIER') return no('Manifests are for 3PL pickups')
      return p.status === 'Cancelled' ? no('Cancelled requests have no manifest') : ok

    case 'carrierAccepted':
      if (p.carrierMode !== 'CARRIER') return no('Only a 3PL pickup is accepted by a carrier')
      if (p.handover.closedAt) return no('Handover already closed')
      return p.status === 'Assigned' || p.status === 'Out For Pickup' || p.status === 'Completed'
        ? ok : no(`${p.status} — the carrier accepts once assigned`)

    case 'confirmSlot':
      if (!isOpenPr(p.status)) return no(closedReason(p.status, 'confirmed'))
      if (p.slotConfirmed === true) return no('Slot already confirmed')
      return p.slotConfirmed === false ? ok : no('No slot confirmation needed')

    case 'merge':
      if (p.shipmentType === 'FTL') return no('Full-vehicle bookings are never merged')
      if (p.status !== 'Requested' && p.status !== 'Planned') return no(`${p.status} — only Requested or Planned requests can merge`)
      /* owner, 2026-09-25: the merchant merges too, until its own cut-off */
      return (merchant ? merchantGate(p, ctx.cfg.merchantCancelUntil, 'merge') : null) ?? ok
  }
}

/** Enabled only when EVERY selected request allows it, plus the selection's own rules. */
export function prBulkState(action: PrAction, prs: PrFacts[], ctx: PrActionCtx): PrActionState {
  if (!prs.length) return no('Select a pickup request')
  if (action === 'downloadCsv') return ok
  if (prs.length > 1 && SINGLE_ROW_ACTIONS.includes(action)) return no('Select one request')
  if (action === 'merge' && prs.length < 2) return no('Select at least two requests to merge')
  const bad = prs.map((p) => ({ p, s: prActionState(action, p, ctx) })).filter((x) => !x.s.enabled)
  if (bad.length) {
    const [{ p, s }] = bad
    if (prs.length === 1) return s
    const same = bad.every((x) => x.s.reason === s.reason)
    return no(same && bad.length > 1 ? `${bad.length} of ${prs.length}: ${s.reason}` : `${p.number}: ${s.reason}${bad.length > 1 ? ` (+${bad.length - 1} more)` : ''}`)
  }
  if (ONE_HUB.includes(action) && new Set(prs.map(ctx.hubOf ?? routingHubOf)).size > 1) return no('Select requests from one hub')
  if (action === 'merge' && new Set(prs.map(pickupPointKey)).size > 1) return no('Select requests at one pickup point')
  return ok
}

/** Two requests from one SPLIT (one is the other's source, or they share one) —
 *  same point and window by design, so never a Duplicate pair. */
export const splitSiblings = (a: Pick<GrowPickupRequest, 'id' | 'splitFromPrId'>, b: Pick<GrowPickupRequest, 'id' | 'splitFromPrId'>): boolean =>
  a.splitFromPrId === b.id || b.splitFromPrId === a.id || (!!a.splitFromPrId && a.splitFromPrId === b.splitFromPrId)
