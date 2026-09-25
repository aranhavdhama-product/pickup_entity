/**
 * Merchant-side pickup rules for the Grow portal (spec 2026-09-23 §6.2 M1/M2,
 * §6.4 E9, §9 same-day cutoff) — what the signed-in merchant may still change
 * on a pickup request, and how the request's execution state reads to them.
 *
 * Pure readings of the store record + the pickup module config; nothing here
 * writes. The console applies its own (wider) ops rules and never imports this.
 */
import { useMasters, useMerchantCode, currentMerchant } from '../../growOrders/masters'
import { configForMerchant, readPickupModuleConfig, usePickupModuleConfig, type PickupModuleConfig } from '../../config/pickupModule'
import { canAddOrdersTo, localIso } from '../../growOrders/tabs'
import { cancelReasonLabel, failureReasonLabel, NO_ORDERS_REASON } from '../../growOrders/pickupReasons'
import { pickupPolicy, violatesCutoff, type PickupPolicy } from '../../growOrders/pickupSlots'
import type { GrowPickupRequest } from '../../growOrders/types'

/** The helper under a disabled Cancel / Reschedule (spec wording). */
export const CONTACT_SUPPORT = 'Contact support to cancel a pickup that is already assigned to a driver'

/** The signed-in merchant's code (header switcher), defaulting to the first known merchant. */
export function usePortalMerchant(): { code: string | null; config: PickupModuleConfig; policy: PickupPolicy } {
  const masters = useMasters()
  const picked = useMerchantCode()
  usePickupModuleConfig()   // re-render when Base Modules → Pickup Request is saved
  const code = currentMerchant(masters.merchants, picked)?.code ?? null
  return { code, config: code ? configForMerchant(code) : readPickupModuleConfig(), policy: pickupPolicy(code) }
}

/** May the merchant still cancel / reschedule? At or before `merchantCancelUntil` on the happy path. */
export const merchantMayChange = (p: Pick<GrowPickupRequest, 'status'>, cfg: PickupModuleConfig): boolean =>
  canAddOrdersTo(p, cfg.merchantCancelUntil)

/** The same-day rule line every booking dialog shows under the window. */
export const cutoffRuleLine = (policy: PickupPolicy) => `Same-day pickup closes at ${policy.sameDayCutoff}`

/**
 * Why a RESCHEDULE window is refused: the booking cutoff / lead time first,
 * then the `rescheduleWindowDays` horizon (measured on the start date).
 */
export function rescheduleError(startAt: string, now: Date, policy: PickupPolicy, cfg: PickupModuleConfig, endAt?: string): string | null {
  if (!startAt) return null
  const cut = violatesCutoff(startAt, now, policy, endAt)
  if (cut) return cut
  const limit = new Date(now.getFullYear(), now.getMonth(), now.getDate() + cfg.rescheduleWindowDays)
  const lastDay = localIso(limit).slice(0, 10)
  if (startAt.slice(0, 10) > lastDay) {
    return `A pickup can be moved at most ${cfg.rescheduleWindowDays} day${cfg.rescheduleWindowDays === 1 ? '' : 's'} ahead (until ${lastDay})`
  }
  return null
}

/** Collected, handover still to happen — the foundation's helper, so Grow and
 *  the console's Pickup page always agree. */
export { isInTransitToHub } from '../../growOrders/tabs'

/** Who is doing the collection, as the merchant sees it. */
export function collectorLine(p: GrowPickupRequest): string | null {
  if (p.carrierMode === 'CARRIER' && p.carrierName) return `${p.carrierName} (carrier)`
  if (p.driverName) return p.driverName
  if (p.carrierName) return `${p.carrierName} (carrier)`
  return null
}

/**
 * "Cancelled by merchant · Duplicate booking" / "Pickup failed · reported by
 * driver · Premises closed" — or null when the request did neither.
 */
export function outcomeReasonLine(p: GrowPickupRequest): string | null {
  if (p.status === 'Cancelled') {
    const ev = [...p.statusHistory].reverse().find((e) => e.status === 'Cancelled')
    const actor = ev?.note?.match(/^Cancelled by (merchant|ops)\b/i)?.[1]?.toLowerCase()
    const reason = cancelReasonLabel(p.cancelReason)
    if (actor) return `Cancelled by ${actor}${reason ? ` · ${reason}` : ''}`
    /* legacy rows carry prose ("Cancelled by the merchant") — show it as is */
    return reason || ev?.note || 'Cancelled'
  }
  if (p.status === 'Pickup Failed') {
    const by = p.failureReason === NO_ORDERS_REASON ? 'system'
      : p.manualOverride === 'Failed' ? 'ops'
      : p.carrierMode === 'CARRIER' ? 'carrier' : 'driver'
    const ev = [...p.statusHistory].reverse().find((e) => e.status === 'Pickup Failed')
    const reason = failureReasonLabel(p.failureReason) || ev?.note || ''
    return `Pickup failed · reported by ${by}${reason ? ` · ${reason}` : ''}`
  }
  return null
}
