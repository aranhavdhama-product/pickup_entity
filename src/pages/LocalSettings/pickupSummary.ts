/**
 * Plain-English copy for `/local/settings/pickup` (owner, 2026-10-05, "simplify the pickups
 * setting"): the live summary sentences and the one-line hints that depend on a setting.
 * Pure — no React, no store — so the page just prints what these return. Every sentence says
 * what the app really does with the value (see growOrders/pickupSlots.ts, store.ts,
 * operatingCalendar.ts); a hint stays under 90 characters.
 */
import type { AutoPickupConfig, PickupDaysSource, PickupMode } from '../../config/pickupModule'
import { triggerEventTitle } from '../../growOrders/fareyeEvents'

/** What each auto-pickup trigger means HERE: `when` finishes "A pickup is booked …", `hint` is
 *  the local condition that stands in for the event (growOrders/fareyeEvents.ts `triggerFired`). */
const TRIGGER_COPY: Record<string, { when: string; hint: string }> = {
  'consignment::created': { when: 'as soon as a consignment is created',
    hint: 'As soon as the consignment exists (not a draft, not cancelled).' },
  'shipment::label-generated': { when: "when a consignment's label is generated",
    hint: 'Once the consignment is paid and its label is generated.' },
  'consignment::geo-coordinate-updated': { when: 'when a paid consignment has no validation errors',
    hint: 'Once the consignment is paid and has no validation errors.' },
  'shipment::serviceability-validated': { when: 'when a paid consignment has no validation errors',
    hint: 'Once the consignment is paid and has no validation errors.' },
  'consignment::marked-ready-for-ship': { when: 'when a consignment is marked Ready To Ship',
    hint: 'Once it is paid, has no errors and is marked Ready To Ship.' },
  'consignment::marked-ready-for-plan': { when: 'when a consignment is marked ready for planning',
    hint: 'Once it is paid, has no errors and is marked ready for planning.' },
  'consignment::pickup-schedule-updated': { when: 'when a consignment gets a pickup window',
    hint: 'Once it is paid, has no errors and has a pickup window.' },
  'consignment::accepted-by-carrier': { when: 'when the carrier accepts a consignment',
    hint: 'Once it is paid, has no errors and a carrier is set.' },
}
const FALLBACK_TRIGGER = 'shipment::label-generated'
const triggerCopy = (code: string) => TRIGGER_COPY[code] ?? TRIGGER_COPY[FALLBACK_TRIGGER]

/** The select's option text: the event's title, except the one that would not fit the 260px control. */
export const triggerOptionLabel = (code: string): string =>
  code === 'consignment::pickup-schedule-updated' ? 'Pickup window set' : triggerEventTitle(code)

/** The hint under "Book the pickup when". */
export const triggerHint = (code: string): string => triggerCopy(code).hint

export interface PickupSummaryInput {
  enabled: boolean
  mode: PickupMode
  triggerEvent: string
  userSelectsWindow: boolean
  slotConfirmation: boolean
  blindAllowed: boolean
  bookingHorizonDays: number
  /** 'HH:mm' */
  sameDayCutoff: string
  pickupDaysSource: PickupDaysSource
  /** the stored auto date rule — not editable on the page, but it decides the date */
  dateRule: AutoPickupConfig['dateRule']
  daysAfterOrder: number
  /** 'HH:mm-HH:mm' (the chosen slot, else the first configured one) */
  slot: string
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

/** "the next pickup day, 09:00–12:00" — the date and window an auto request takes when nobody chooses. */
export function autoDateText(i: Pick<PickupSummaryInput, 'dateRule' | 'daysAfterOrder' | 'sameDayCutoff' | 'slot'>): string {
  const day = i.dateRule === 'same-day' ? `today if created before ${i.sameDayCutoff}, else the next pickup day`
    : i.dateRule === 'days-after-order'
      ? (i.daysAfterOrder === 0 ? 'the day of creation' : `${plural(i.daysAfterOrder, 'day')} after creation`)
      : 'the next pickup day'
  return i.slot ? `${day}, ${i.slot.replace('-', '–')}` : day
}

/** The hint under "Shipper chooses the pickup time". */
export const askWindowHint = (i: PickupSummaryInput): string => i.userSelectsWindow
  ? 'The consignment form asks for a pickup window and checks it against the booking rules.'
  : `Off: set for ${autoDateText(i)}.`

/** The hint under "Pickup days", per choice. */
export const DAYS_SOURCE_HINT: Record<PickupDaysSource, string> = {
  'merchant-then-hub': "Days the pickup address is open and the hub works; the hub's days if it has none.",
  hub: "Only the hub's working days count, whatever the pickup address prefers.",
}

/** The short live summary — plain sentences built from the settings as they stand on the page. */
export function pickupSummary(i: PickupSummaryInput): string[] {
  if (!i.enabled) {
    return ['Pickups are off.',
      'The Pickup page and every Schedule Pickup button are hidden; existing requests can still be opened from their links.']
  }
  const ahead = `up to ${plural(i.bookingHorizonDays, 'day')} ahead`
  const days = i.pickupDaysSource === 'hub' ? ["Pickup days follow the hub's working days and holidays."] : []
  const failed = 'Failed pickups follow the Reason Policy.'
  if (i.mode === 'auto') {
    return [
      `Pickups are booked automatically ${triggerCopy(i.triggerEvent).when}.`,
      i.userSelectsWindow
        ? `The shipper picks the pickup time; if they skip it, it is set for ${autoDateText(i)}.`
        : `Each pickup is set for ${autoDateText(i)}.`,
      ...(i.slotConfirmation ? ['The shipper confirms the time before ops plan it.'] : []),
      `Pickup times can be set ${ahead}; same-day pickups close at ${i.sameDayCutoff}.`,
      ...days, failed,
    ]
  }
  return [
    `Merchants and ops book pickups themselves.${i.blindAllowed ? ' They can also book one without consignments, when it is not known what will be picked up.' : ''}`,
    `Pickups can be booked ${ahead}; same-day bookings close at ${i.sameDayCutoff}.`,
    ...days, failed,
  ]
}
