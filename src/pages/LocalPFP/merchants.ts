/**
 * Who the console can book a pickup FOR.
 *
 * The merchant portal never needs this: it is already inside one merchant. The
 * console is not, so `PickupDialog` takes these as an optional prop and renders
 * a Merchant field as the form's first field — ONE form, with an extra field,
 * rather than a wizard in front of it.
 */
import type { StoreLocation } from '../../growOrders/types'

/** A merchant, as the store list actually describes one. */
export interface Merchant {
  name: string
  stores: StoreLocation[]
}

/**
 * Merchants present in the data, derived from the stores' own business names —
 * not a hard-coded list, so a location added later appears without a code
 * change. A store with no business name falls back to its code rather than
 * disappearing into an unnamed group.
 */
export function merchantsOf(stores: StoreLocation[]): Merchant[] {
  const byName = new Map<string, StoreLocation[]>()
  for (const s of stores) {
    const name = s.party.businessName?.trim() || s.code
    byName.set(name, [...(byName.get(name) ?? []), s])
  }
  return [...byName.entries()].map(([name, list]) => ({ name, stores: list }))
}
