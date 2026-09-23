/**
 * Inbound hubs — where a parcel order enters the 2GO network.
 *
 * A pickup request is raised per (pickup location, destination): the courier
 * collects at ONE address and drops at ONE inbound hub, so a selection of
 * orders spanning two hubs is two bookings, not one.
 *
 * A hub is NOT necessarily one of the merchant's own store locations, so the
 * names live here and only fall back to `db.stores` (and finally the raw code).
 */
import type { Party, StoreLocation } from './types'

export interface InboundHub { code: string; name: string }

/** The three inbound hubs the PH network exposes to this merchant. */
export const INBOUND_HUBS: InboundHub[] = [
  { code: 'MNL-01', name: 'Manila Inbound Hub' },
  { code: 'CEB-01', name: 'Cebu Inbound Hub' },
  { code: 'SANPABLO', name: 'San Pablo Inbound Hub' },
]

export const DEFAULT_INBOUND_HUB = 'SANPABLO'

/** States routed through Manila / Cebu; everything else consolidates at San Pablo. */
const MNL_STATES = ['metro manila', 'laguna', 'rizal']
const CEB_STATES = ['cebu']

/**
 * The inbound hub an order is destined for, derived from the receiver — the
 * merchant never types it, so a persisted record with no hub is normalised
 * through here rather than bumping every blob to a new storage key.
 */
export function inboundHubFor(receiver: Pick<Party, 'state' | 'city'>): string {
  const s = (receiver?.state ?? '').trim().toLowerCase()
  const c = (receiver?.city ?? '').trim().toLowerCase()
  if (MNL_STATES.includes(s) || MNL_STATES.some((x) => c.includes(x))) return 'MNL-01'
  if (CEB_STATES.includes(s) || CEB_STATES.some((x) => c.includes(x))) return 'CEB-01'
  return DEFAULT_INBOUND_HUB
}

/**
 * Display name for a destination code: the hub list wins over the store list,
 * because a code can be both (MNL-01 is a store AND the Manila inbound hub) and
 * the destination is always the hub.
 */
export const hubName = (code: string | null | undefined, stores: StoreLocation[] = []): string => {
  if (!code) return ''
  return INBOUND_HUBS.find((h) => h.code === code)?.name
    ?? stores.find((s) => s.code === code)?.name
    ?? code
}
