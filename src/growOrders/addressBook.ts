/**
 * The merchant's Address Book — saved RECEIVER addresses (`/grow/orders/address-book`),
 * the live portal's `/address/` (research 2026-09-25 §5). A row = a `Party` +
 * `storeName` + a validation `error` (the live "Errors" toggle shows those).
 *
 * `pickupLocations.ts receiverBook()` lists these FIRST (error rows excluded),
 * so a saved address is offered by the order form's receiver search.
 *
 * Seed: the distinct receivers of the seeded orders (first 14, by name), plus
 * one imported row with no postal code so the Errors view has something to show.
 */
import { blankParty } from './seed'
import { growOrdersSnapshot } from './store'
import type { Party } from './types'
import { createLocalStore, str } from './localStore'

export interface AddressEntry {
  id: string
  party: Party
  storeName: string
  /** non-empty = failed validation (shown under the Errors toggle) */
  error: string
  createdAt: string
  source: 'manual' | 'bulk' | 'seed'
}

const KEY = 'grow-address-book-v1'

/** The live form's required fields: Name, Address Line 1, Postal Code. */
export function addressError(p: Party): string {
  const miss = [!p.name.trim() && 'Name', !p.line1.trim() && 'Address Line 1', !p.postalCode.trim() && 'Postal Code'].filter(Boolean)
  return miss.length ? `${miss.join(', ')} ${miss.length === 1 ? 'is a' : 'are'} required field${miss.length === 1 ? '' : 's'}` : ''
}

function seedBook(): AddressEntry[] {
  const seen = new Set<string>()
  const parties: Party[] = []
  for (const o of [...growOrdersSnapshot().orders].sort((a, b) => (a.id < b.id ? -1 : 1))) {
    const k = `${o.receiver.name}|${o.receiver.line1}`.toLowerCase()
    if (!o.receiver.name || !o.receiver.line1 || seen.has(k)) continue
    seen.add(k)
    parties.push(o.receiver)
  }
  const picked = parties.sort((a, b) => a.name.localeCompare(b.name)).slice(0, 14)
  const rows: AddressEntry[] = picked.map((p, i) => ({
    id: `ab${String(i + 1).padStart(3, '0')}`, party: { ...p }, storeName: '', error: addressError(p),
    createdAt: new Date(Date.UTC(2026, 7, 1 + i)).toISOString(), source: 'seed',
  }))
  const bad: Party = { ...blankParty(), name: 'Liza Manalo', contactNumber: '9171234567', line1: '12 Mabini St', city: 'San Pablo', country: 'Philippines' }
  rows.push({ id: 'ab900', party: bad, storeName: '', error: addressError(bad), createdAt: new Date(Date.UTC(2026, 7, 20)).toISOString(), source: 'bulk' })
  return rows
}

function normalize(raw: unknown): AddressEntry[] | null {
  if (!Array.isArray(raw)) return null
  return raw.filter((r) => r && typeof r === 'object' && (r as { party?: unknown }).party).map((r: Record<string, unknown>) => {
    const party = { ...blankParty(), ...(r.party as Party) }
    return {
      id: str(r.id), party, storeName: str(r.storeName), error: addressError(party),
      createdAt: str(r.createdAt, new Date(0).toISOString()),
      source: r.source === 'bulk' || r.source === 'seed' ? r.source : 'manual',
    } as AddressEntry
  }).filter((e) => e.id)
}

const store = createLocalStore<AddressEntry[]>(KEY, seedBook, normalize)
export const useAddressBook = store.use
export const addressBookSnapshot = store.get
export const addressById = (id: string) => store.get().find((e) => e.id === id)

let seq = 0
const newId = () => `ab${Date.now().toString(36)}${(seq++).toString(36)}`

export const addressBookActions = {
  add(party: Party, storeName = '', source: AddressEntry['source'] = 'manual'): AddressEntry {
    const e: AddressEntry = { id: newId(), party, storeName, error: addressError(party), createdAt: new Date().toISOString(), source }
    store.set([e, ...store.get()])
    return e
  },
  addMany(parties: Party[]): number {
    const now = new Date().toISOString()
    const rows = parties.map((p) => ({ id: newId(), party: p, storeName: '', error: addressError(p), createdAt: now, source: 'bulk' as const }))
    store.set([...rows, ...store.get()])
    return rows.length
  },
  update(id: string, party: Party, storeName?: string) {
    store.set(store.get().map((e) => (e.id === id ? { ...e, party, storeName: storeName ?? e.storeName, error: addressError(party) } : e)))
  },
  remove(ids: string[]) {
    const s = new Set(ids)
    store.set(store.get().filter((e) => !s.has(e.id)))
  },
  reset: store.reset,
}
