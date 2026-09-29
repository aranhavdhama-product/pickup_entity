/**
 * Booking a group of consignments onto pickups — the ONE rule set behind the
 * three-way choice every booking dialog offers (owner, 2026-09-25):
 *   New pickup request · Add to existing · Split into separate requests.
 * Shared by the console Schedule pickup + Book consignments dialogs and the
 * Grow Book a Pickup dialog. Pure (store calls only); the control that asks
 * lives in `bookingCards.tsx`.
 */
import { growOrderActions, pickupRequestById } from '../../growOrders/store'
import { canAddOrdersTo, isOverduePr } from '../../growOrders/tabs'
import { pickupPointKey } from '../../growOrders/prActions'
import type { GrowPickupRequest, Party, PickupSource } from '../../growOrders/types'

/** `split` = one request PER consignment, never merged; a one-shipment split is a new request. */
export type BookingChoice = { mode: 'new' } | { mode: 'split' } | { mode: 'existing'; prId: string }

export interface BookingGroup {
  storeCode: string
  destinationCode: string | null
  orderIds: string[]
  vehicle?: { vehicleType: string; vehicleUnit: number; shipTo: Party | null; ftlServiceType?: string | null }
}

export interface BookingOutcome { pr: GrowPickupRequest; kind: 'new' | 'merged' | 'added'; count: number }

/** Open requests a group may JOIN: the same pickup point (`pickupPointKey` — booked AND reserved
 *  requests at the store; owner, 2026-09-25: "show eligible pickups in the dropdown"), LTL, still
 *  taking orders, not overdue, and dropping at this hub or at no fixed hub yet. */
export function joinCandidates(g: Pick<BookingGroup, 'storeCode' | 'destinationCode' | 'vehicle'>, prs: GrowPickupRequest[],
  until: Parameters<typeof canAddOrdersTo>[1], now = new Date()): GrowPickupRequest[] {
  if (g.vehicle) return []
  const key = pickupPointKey({ storeCode: g.storeCode, shipFrom: null })
  return prs
    .filter((p) => pickupPointKey(p) === key && p.shipmentType !== 'FTL'
      && canAddOrdersTo(p, until) && !isOverduePr(p, now)
      && (p.destinationCode == null || p.destinationCode === g.destinationCode))
    .sort((a, b) => a.startAt.localeCompare(b.startAt))
}

/** Run one group's choice. `failed` collects what refused. */
export function bookGroup(g: BookingGroup, choice: BookingChoice, common: {
  startAt: string; endAt: string; instructions?: string; source?: PickupSource; merchantCode?: string | null
}, failed: string[]): BookingOutcome[] {
  if (choice.mode === 'existing') {
    const { added } = growOrderActions.addOrdersToPickup(choice.prId, g.orderIds)
    const pr = pickupRequestById(choice.prId)
    if (!added.length || !pr) { failed.push(pr?.number ?? 'a pickup request'); return [] }
    return [{ pr, kind: 'added', count: added.length }]
  }
  const batches = choice.mode === 'split' ? g.orderIds.map((id) => [id]) : [g.orderIds]
  return batches.flatMap((ids) => {
    const pr = growOrderActions.createPickupRequest({
      storeCode: g.storeCode, destinationCode: g.destinationCode, orderIds: ids, vehicle: g.vehicle,
      split: choice.mode === 'split', ...common,
    })
    if (!pr) { failed.push('a new pickup (validation errors)'); return [] }
    return [{ pr, kind: pr.merged ? 'merged' as const : 'new' as const, count: ids.length - pr.skipped.length }]
  })
}

/** How many requests a set of choices touches (a split card = one per shipment). */
export const pickupCountOf = (cards: { choice: BookingChoice; shipments: number }[]) =>
  cards.reduce((n, c) => n + (c.choice.mode === 'split' ? c.shipments : 1), 0)
