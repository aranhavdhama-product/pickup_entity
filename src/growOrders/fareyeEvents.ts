/**
 * FarEye event catalog — the subset the auto-pickup module can be triggered by
 * (owner's list, 2026-09-24; the full catalog and the state lifecycle are in
 * FAREYE-STATES-EVENTS.md at the repo root).
 *
 * The platform raises a pickup request off a CREATED consignment
 * (PICKUP_REQUESTED comes BEFORE READY_TO_SHIP in the lifecycle), so the
 * trigger is one of the events that fire between creation and readiness. The
 * local store emits no events; each entry carries the LOCAL condition that
 * stands in for the event having fired.
 */
export interface AutoPickupTriggerEvent {
  code: string
  /** the platform's own name */
  label: string
  /** the human name shown in the settings list and the summary pill */
  title: string
  level: 'L1' | 'L2'
  /** what the event means on the platform */
  meaning: string
  /** the local condition that stands in for it */
  local: string
}

export const AUTO_PICKUP_TRIGGER_EVENTS: AutoPickupTriggerEvent[] = [
  { code: 'consignment::created', label: 'consignment::created', title: 'Consignment created', level: 'L1',
    meaning: 'the consignment exists', local: 'a live consignment (not a draft, not cancelled)' },
  { code: 'shipment::label-generated', label: 'shipment::label-generated', title: 'Label generated', level: 'L2',
    meaning: 'label printed — the parcel is physically ready', local: 'paid' },
  { code: 'consignment::geo-coordinate-updated', label: 'consignment::geo-coordinate-updated', title: 'Address geocoded', level: 'L2',
    meaning: 'the address geocoded', local: 'paid, no validation error' },
  { code: 'shipment::serviceability-validated', label: 'shipment::serviceability-validated', title: 'Serviceability validated', level: 'L2',
    meaning: 'the pincode is serviceable', local: 'paid, no validation error' },
  { code: 'consignment::marked-ready-for-ship', label: 'consignment::marked-ready-for-ship', title: 'Marked Ready To Ship', level: 'L2',
    meaning: 'READY_TO_SHIP', local: 'paid, no validation error' },
  { code: 'consignment::marked-ready-for-plan', label: 'consignment::marked-ready-for-plan', title: 'Marked ready for planning', level: 'L2',
    meaning: 'ready for planning', local: 'paid, no validation error' },
  { code: 'consignment::pickup-schedule-updated', label: 'consignment::pickup-schedule-updated', title: 'Pickup window set on the consignment', level: 'L1',
    meaning: 'a pickup window was set on the consignment', local: 'paid, no error, a pickup window is present' },
  { code: 'consignment::accepted-by-carrier', label: 'consignment::accepted-by-carrier', title: 'Accepted by the carrier', level: 'L2',
    meaning: 'the 3PL accepted it', local: 'paid, no error, a carrier is set' },
]
export const AUTO_PICKUP_TRIGGER_CODES = AUTO_PICKUP_TRIGGER_EVENTS.map((e) => e.code)
export const DEFAULT_AUTO_PICKUP_TRIGGER = 'shipment::label-generated'

export const triggerEventOf = (code: string): AutoPickupTriggerEvent =>
  AUTO_PICKUP_TRIGGER_EVENTS.find((e) => e.code === code) ?? AUTO_PICKUP_TRIGGER_EVENTS[1]

/** The human title — what a select shows; the `entity::event` code never is. */
export const triggerEventTitle = (code: string): string => triggerEventOf(code).title

/** The consignment shape the trigger conditions read. */
export interface TriggerSubject {
  isDraft: boolean
  status: string
  pickupRequestId: string | null
  paymentStatus: string
  error: string
  readyToShip?: boolean
  carrier?: string
  sender?: { windowStart?: string; windowEnd?: string } | null
}

/** Has this event "fired" for the consignment, in local terms? */
export function triggerFired(code: string, o: TriggerSubject): boolean {
  if (o.isDraft || o.pickupRequestId || o.status !== 'Order Created') return false
  switch (code) {
    case 'consignment::created': return true
    case 'shipment::label-generated': return o.paymentStatus === 'Paid'
    case 'consignment::pickup-schedule-updated':
      return o.paymentStatus === 'Paid' && !o.error && !!o.sender?.windowStart && !!o.sender?.windowEnd
    case 'consignment::accepted-by-carrier':
      return o.paymentStatus === 'Paid' && !o.error && !!(o.carrier && o.carrier.trim())
    /* REAL now: only a consignment marked ready (Mark Ready To Ship) has fired these */
    case 'consignment::marked-ready-for-ship':
    case 'consignment::marked-ready-for-plan':
      return o.paymentStatus === 'Paid' && !o.error && o.readyToShip === true
    default: /* geo-coordinate-updated · serviceability-validated */
      return o.paymentStatus === 'Paid' && !o.error
  }
}

/** Legacy `afterState` values → the event that means the same. */
export const LEGACY_AFTER_STATE_EVENT: Record<string, string> = {
  'Created': 'consignment::created',
  'Label Generated': 'shipment::label-generated',
  'Ready To Ship': 'consignment::marked-ready-for-ship',
}
/** The state a trigger event lands the consignment in — the legacy key derived back. */
export const EVENT_AFTER_STATE: Record<string, 'Created' | 'Label Generated' | 'Ready To Ship'> = {
  'consignment::created': 'Created',
  'shipment::label-generated': 'Label Generated',
}
