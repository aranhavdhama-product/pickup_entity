/**
 * The ONE pickup-address list the merchant portal offers.
 *
 * Create Order and Create Pickup Request used to read `db.stores` each on their
 * own, so the two surfaces could disagree about where this merchant ships from.
 * They now share this hook: the **Location Master** rows for the signed-in
 * merchant, merged with the addresses the merchant typed into the order form and
 * saved locally (`Other address… → Save`). Master wins on a code clash — the
 * master is the record, the local copy is a convenience.
 *
 * The hint is deliberately a quiet line under the select and never a toast: a
 * sample fallback is a fact about the data, not an error the merchant caused.
 */
import { useMemo } from 'react'
import { STORES } from '../../growOrders/seed'
import type { GrowOrder, Party, StoreLocation } from '../../growOrders/types'
import {
  currentMerchant, locationsForMerchant, registeredPickupLocation, toStoreLocation, useMasters, useMerchantCode,
  type MasterSource, type Masters,
} from '../../growOrders/masters'
import { OTHER_ADDRESS, storeOptionLabel } from './utils'
import { useAddressBook, type AddressEntry } from '../../growOrders/addressBook'
import { defaultStoreCodeOf, useMerchantSettingsDb } from '../../growOrders/merchantSettings'

export interface PickupLocations {
  /** Master rows first, then the addresses the merchant saved themselves. */
  stores: StoreLocation[]
  /** Ready for an `OutlinedField` — the merged list plus the `Other address...` escape hatch. */
  options: { value: string; label: string }[]
  /** How many of `stores` came from the Location Master. */
  masterCount: number
  source: MasterSource
  loading: boolean
  /** The merchant the list is scoped to. */
  merchantName: string
}

/** The demo hubs shipped with the store. They ARE the sample locations, so they
 *  belong to a sample read only — never under a live merchant. */
const SEED_CODES = new Set(STORES.map((s) => s.code))

export function usePickupLocations(localStores: StoreLocation[]): PickupLocations {
  const masters = useMasters()
  const code = useMerchantCode()
  const merchant = currentMerchant(masters.merchants, code)
  /* Settings → Pickup Address "Default" is listed first (re-render on a change) */
  const settingsDb = useMerchantSettingsDb()

  return useMemo(() => {
    /* a Location Master row often has no CONTACT name (staging's MC_0021), and a
       sender with no name is worse than one named after the location — fall back
       to the location's own name so the address is addressable either way */
    const named = (s: StoreLocation) => (s.party.name ? s : { ...s, party: { ...s.party, name: s.name } })
    const master = locationsForMerchant(masters.locations, merchant?.code ?? null).map(toStoreLocation).map(named)
    /* FIRST option: the merchant's own REGISTERED address. A merchant with no
       Location Master rows still has a real place to ship from, so the select is
       never reduced to `Other address…`. */
    const registered = registeredPickupLocation(merchant)
    /* under a LIVE read the seed hubs are not this merchant's addresses and must
       not be offered — only the master's own rows and what the merchant saved
       through the Save switch. A sample read is the one case where the seed
       stores ARE the locations. */
    const ordered = [...(registered ? [named(registered)] : []), ...master, ...localStores.filter((x) =>
      masters.source === 'sample' || !SEED_CODES.has(x.code))]
    const seen = new Set<string>()
    const deduped = ordered.filter((x) => (seen.has(x.code) ? false : (seen.add(x.code), true)))
    const def = defaultStoreCodeOf(merchant?.code ?? null)
    const stores = def && deduped.some((x) => x.code === def)
      ? [...deduped.filter((x) => x.code === def), ...deduped.filter((x) => x.code !== def)] : deduped
    return {
      stores,
      options: [
        ...stores.map((s) => ({ value: s.code, label: storeOptionLabel(s) })),
        { value: OTHER_ADDRESS, label: 'Other address…' },
      ],
      masterCount: master.length,
      source: masters.source,
      loading: masters.loading,
      merchantName: merchant?.name ?? '',
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- settingsDb: re-read the default store on a Settings write
  }, [masters.locations, masters.source, masters.loading, merchant, localStores, settingsDb])
}

/* --------------------------------------------------- receiver address book ---- */

/** The three Location Master types that are places an order is DELIVERED to. */
const DELIVERY_TYPES: Record<string, string> = {
  CUSTOMER_LOCATION: 'Customer', PUDO: 'PUDO', PARCEL_LOCKER: 'Parcel locker',
}

/** One entry in the receiver search: a party plus where it came from. */
export interface BookEntry {
  party: Party
  /** 'Customer' / 'PUDO' / 'Parcel locker' for a master row; null for a past receiver. */
  tag: string | null
}

/**
 * Who an order can be sent TO. The Location Master's delivery-side rows for this
 * merchant come FIRST — they are the addresses someone maintains — followed by
 * the receivers of past orders, most recently used first. Deduped on name +
 * line 1, so a customer who is both in the master and in the history appears
 * once, as the master row.
 *
 * Exported from here (rather than built inside the page) so the pickup dialog
 * can offer the same book.
 */
export function receiverBook(masters: Masters, merchantCode: string | null, orders: GrowOrder[], saved: AddressEntry[] = []): BookEntry[] {
  /* the merchant's own Address Book comes FIRST (rows failing validation are left out) */
  const fromBook = saved.filter((e) => !e.error).map((e) => ({ party: e.party, tag: 'Address book' }))
  const fromMaster = masters.locations
    .filter((l) => l.enabled && DELIVERY_TYPES[l.type]
      && (l.merchantCodes.length === 0 || (merchantCode != null && l.merchantCodes.includes(merchantCode))))
    .map((l) => ({ party: toStoreLocation(l).party, tag: DELIVERY_TYPES[l.type] }))
  /* most recently used first: the address someone needs again is usually the
     one they used last, not the one seeded first */
  const fromHistory = [...orders]
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .map((o) => ({ party: o.receiver, tag: null }))
  const seen = new Set<string>()
  const key = (p: Party) => `${p.name}|${p.line1}`.toLowerCase()
  return [...fromBook, ...fromMaster, ...fromHistory].filter((e) => {
    const k = key(e.party)
    if (!e.party.name && !e.party.line1) return false
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}

/** The same book, wired to the live masters and the signed-in merchant. */
export function useReceiverBook(orders: GrowOrder[]): BookEntry[] {
  const masters = useMasters()
  const code = useMerchantCode()
  const merchant = currentMerchant(masters.merchants, code)
  const saved = useAddressBook()
  return useMemo(() => receiverBook(masters, merchant?.code ?? null, orders, saved),
    [masters, merchant?.code, orders, saved])
}
