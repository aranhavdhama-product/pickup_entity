/**
 * The pickup request's status pill and execution line — the ONE way a request's
 * state is drawn anywhere in the portal (the list grid in
 * `pickupRequestColumns.tsx`, and the request's own page).
 */
import { StatusPill } from '../../nueva/components'
import type { GrowPickupRequest, PickupRequestStatus } from '../../growOrders/types'
import { isHandedOver } from '../../growOrders/tabs'
import { PR_STATUS_TONE, type Tone } from '../LocalPickup/prModel'
import { PARTIALLY_PICKED, prOutcomeLabel, prOutcomeWords } from './utils'
import { isInTransitToHub } from './pickupGate'

/** The one status whose full name cannot fit a pill in a narrow column. */
const SHORT_STATUS: Partial<Record<PickupRequestStatus, string>> = {
  'Ready For Last Mile Dispatch': 'Ready For Dispatch',
}

/**
 * The ONE status pill a pickup request shows anywhere. It is outcome-aware:
 * a completed pickup that left orders behind reads **Partially picked** rather
 * than a green `Completed`, and any overage scans hang a small `+n` badge off
 * the pill. The full numbers are on the tooltip.
 */
export function PrStatusChip({ p, short = false, flags = [] }: {
  p: GrowPickupRequest
  short?: boolean
  /** extra pills after the status — the merchant's Overdue · Duplicate · Re-attempt (never Discrepancy) */
  flags?: { label: string; tone: Tone }[]
}) {
  const label = prOutcomeLabel(p)
  const partial = label === PARTIALLY_PICKED
  const tone: Tone = partial ? 'warning' : PR_STATUS_TONE[p.status]
  const text = partial ? label : (short && SHORT_STATUS[p.status]) || label
  const n = p.overages.length
  /* owner, 2026-09-25: ONE status chip per row — the flags (Overdue · Duplicate ·
     Re-attempt …) and an overage count live in the tooltip and on the request page */
  const extra = [...flags.map((f) => f.label), ...(n > 0 ? [`${n} overage scan${n === 1 ? '' : 's'}`] : [])]
  const title = [prOutcomeWords(p) || p.status, ...extra].join(' · ')
  return (
    <span className="inline-flex min-w-0 items-center" title={title}>
      <StatusPill label={text} tone={tone} />
    </span>
  )
}

/**
 * The execution fact under a status pill, when there is one: who is on the way
 * (Out For Pickup), or where the collected parcels are (Handed Over / In
 * transit to hub). One short line.
 */
export function PrExecutionLine({ p }: { p: GrowPickupRequest }) {
  if (isHandedOver(p)) return <span className="mt-0.5 flex"><StatusPill label="Handed Over" tone="success" /></span>
  if (isInTransitToHub(p)) return <span className="mt-0.5 block truncate text-[12px] text-ink-3">In transit to hub</span>
  /* the merchant sees a 3PL's name, never the fleet driver's */
  const who = p.status !== 'Out For Pickup' ? null
    : p.carrierMode === 'CARRIER' && p.carrierName ? `${p.carrierName} (carrier)` : 'Driver on the way'
  return who ? <span className="mt-0.5 block truncate text-[12px] text-ink-3" title={who}>{who}</span> : null
}

