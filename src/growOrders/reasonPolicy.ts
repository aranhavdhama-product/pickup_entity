/**
 * Pickup Reason Policy — what a FAILED pickup does next, decided per failure
 * reason (owner, 2026-09-25: "pickup attempts → reason policy").
 *
 * The rules are the Reason Master → Reason Policy rows (`nueva/mastersTree.ts`
 * `reasonPolicy`, persisted by `LocalSettings/ServiceOrderMasters.tsx` under
 * `REASON_POLICY_STORAGE_KEY`). This module owns the pickup SEED rows (the
 * master spreads them in) and reads the stored table back — pure data, no
 * React, no fetch, no src/auth, and it never imports mastersTree.
 *
 * Semantics: only Active rows of category "Pickup" whose Failure Reason is the
 * reason's label (or code) count. "Before attempt N" (N entered on the rule,
 * staging-style) applies while attempt < N — the request's `maxAttempts` is only
 * the fallback N for a rule with no number; "Always" always applies; a
 * "Before attempt" row wins over an "Always" row. No applicable row → Hold for review.
 */
import { PICKUP_FAILURE_REASONS, NO_ORDERS_REASON, failureReasonLabel } from './pickupReasons'

export type PickupPolicyOutcome = 'reattempt' | 'hold' | 'cancel'

export const PICKUP_REASON_CATEGORY = 'Pickup'
export const PICKUP_WHEN_OPTIONS = ['Always', 'Before attempt'] as const
export const DEFAULT_REATTEMPT_BEFORE = 3
export const PICKUP_OUTCOME_OPTIONS = ['Re-attempt pickup', 'Hold for review', 'Cancel pickup'] as const
export const PICKUP_OUTCOME_LABEL: Record<PickupPolicyOutcome, string> = {
  reattempt: 'Re-attempt pickup', hold: 'Hold for review', cancel: 'Cancel pickup',
}

/** the reason-master sub-masters' persistence version (ServiceOrderMasters KEY_VERSION) —
 *  v3 = the pickup reasons + pickup policy rows were added to the seed;
 *  v4 = pickup rules carry their own cap ("Before attempt 3" + `attempt`) */
export const REASON_MASTER_KEY_VERSION = 4
export const REASON_POLICY_STORAGE_KEY = `local-masters-service_order-reason-policy-v${REASON_MASTER_KEY_VERSION}`

/** the reasons the policy speaks about — every failure reason except the system-set NO_ORDERS */
const POLICY_REASONS = PICKUP_FAILURE_REASONS.filter((r) => r.code !== NO_ORDERS_REASON)
export const PICKUP_REASON_LABELS: string[] = POLICY_REASONS.map((r) => r.label)
export const PICKUP_REASON_CODES: string[] = POLICY_REASONS.map((r) => r.code)

/** Reason Master → Reasons tab rows */
export const PICKUP_REASON_ROWS = POLICY_REASONS.map((r) => ({
  id: `RS-PU-${r.code}`, code: r.code, name: r.label, category: PICKUP_REASON_CATEGORY, status: 'Active',
}))

const SEED: [string, 'Always' | 'Before attempt 3', (typeof PICKUP_OUTCOME_OPTIONS)[number]][] = [
  ['SHIPMENT_NOT_READY', 'Before attempt 3', 'Re-attempt pickup'],
  ['PREMISES_CLOSED', 'Before attempt 3', 'Re-attempt pickup'],
  ['HANDOVER_DELAYED', 'Before attempt 3', 'Re-attempt pickup'],
  ['DRIVER_NO_SHOW', 'Before attempt 3', 'Re-attempt pickup'],
  ['DRIVER_UNAVAILABLE', 'Before attempt 3', 'Re-attempt pickup'],
  ['VEHICLE_BREAKDOWN', 'Before attempt 3', 'Re-attempt pickup'],
  ['VEHICLE_CAPACITY', 'Before attempt 3', 'Re-attempt pickup'],
  ['ACCIDENT', 'Before attempt 3', 'Re-attempt pickup'],
  ['INCORRECT_ADDRESS', 'Always', 'Hold for review'],
  ['LABEL_PACKAGING', 'Always', 'Hold for review'],
  ['OVERWEIGHT_DIMENSION', 'Always', 'Hold for review'],
  ['DAMAGED_REFUSED', 'Always', 'Hold for review'],
  ['MERCHANT_CANCELLED_AT_DOOR', 'Always', 'Cancel pickup'],
]
/** Reason Master → Reason Policy tab rows (pickup) */
export const PICKUP_POLICY_ROWS = SEED.map(([code, when, outcome]) => ({
  id: `RP-PU-${code}`, reason: failureReasonLabel(code), category: PICKUP_REASON_CATEGORY,
  merchant: 'All merchants', hub: 'All hubs', when, outcome, status: 'Active',
  ...(when === 'Always' ? {} : { attempt: String(DEFAULT_REATTEMPT_BEFORE) }),
}))

/** `Before attempt N` → N (from the text, else the row's `attempt`); null = no number on the rule */
export function beforeAttemptOf(row: Record<string, unknown>): number | null | undefined {
  const m = /^before\s*attempt\s*(\d+)?/i.exec(String(row.when ?? '').trim())
  if (!m) return /^before\s*max/i.test(String(row.when ?? '')) ? null : undefined   // v3 wording
  const n = Number(m[1] ?? row.attempt)
  return Number.isFinite(n) && n > 0 ? Math.min(5, Math.max(1, Math.round(n))) : null
}

type Row = Record<string, unknown>
const norm = (v: unknown) => String(v ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')

function storedRows(): Row[] | null {
  try {
    if (typeof localStorage === 'undefined') return null
    const raw = localStorage.getItem(REASON_POLICY_STORAGE_KEY)
    if (!raw) return null
    const rows = (JSON.parse(raw) as { rows?: unknown })?.rows
    return Array.isArray(rows) ? rows.filter((r): r is Row => !!r && typeof r === 'object') : null
  } catch {
    return null
  }
}

const outcomeOf = (v: unknown): PickupPolicyOutcome =>
  (/re-?attempt/i.test(String(v)) ? 'reattempt' : /cancel/i.test(String(v)) ? 'cancel' : 'hold')

/** What a failure with `reasonCode` on attempt `attempt` does next; `maxAttempts` = the
 *  fallback N for a "Before attempt" rule that carries no number. */
export function pickupOutcomeFor(reasonCode: string | null | undefined, attempt: number, maxAttempts = DEFAULT_REATTEMPT_BEFORE): PickupPolicyOutcome {
  if (!reasonCode) return 'hold'
  const keys = new Set([norm(reasonCode), norm(failureReasonLabel(reasonCode))])
  const rows = (storedRows() ?? PICKUP_POLICY_ROWS).filter((r) =>
    norm(r.category) === norm(PICKUP_REASON_CATEGORY)
    && !/(deactiv|disabl|inactive)/i.test(String(r.status ?? 'Active'))
    && keys.has(norm(r.reason)))
  const before = rows.find((r) => beforeAttemptOf(r) !== undefined)
  if (before && attempt < (beforeAttemptOf(before) ?? maxAttempts)) return outcomeOf(before.outcome)
  const always = rows.find((r) => norm(r.when) === 'always')
  return always ? outcomeOf(always.outcome) : 'hold'
}
