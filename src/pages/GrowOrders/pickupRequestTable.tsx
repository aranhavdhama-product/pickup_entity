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
import { collectorLine, isInTransitToHub } from './pickupGate'

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
export function PrStatusChip({ p, short = false }: { p: GrowPickupRequest; short?: boolean }) {
  const label = prOutcomeLabel(p)
  const partial = label === PARTIALLY_PICKED
  const tone: Tone = partial ? 'warning' : PR_STATUS_TONE[p.status]
  const text = partial ? label : (short && SHORT_STATUS[p.status]) || label
  const n = p.overages.length
  return (
    <span className="inline-flex min-w-0 items-center gap-1" title={prOutcomeWords(p) || p.status}>
      <StatusPill label={text} tone={tone} />
      {n > 0 && <StatusPill label={`+${n}`} tone="danger" />}
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
  const who = p.status === 'Out For Pickup' ? collectorLine(p) : null
  return who ? <span className="mt-0.5 block truncate text-[12px] text-ink-3" title={who}>{who}</span> : null
}

