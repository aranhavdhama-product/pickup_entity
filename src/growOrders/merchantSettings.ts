/**
 * Merchant account settings (`/grow/orders/settings`) — the live portal's
 * `/account-settings/` Account + Saved Packages tabs (research 2026-09-25 §7).
 * Keyed by merchant code (the header ⇄ switcher's "signed-in merchant"):
 * personal fields + notification prefs + 2-step flag, business fields, the
 * DEFAULT pickup store code, and saved packages.
 *
 * Saved packages are merged into the order form's package presets by
 * `masters.ts packageTypesForMerchant` (code prefix `SAVED-`); the default
 * pickup store is listed first by `pickupLocations.ts usePickupLocations`.
 *
 * Imports only TYPES from masters.ts — masters.ts imports this module.
 */
import type { PackageType } from './masters'
import type { Party } from './types'
import { bool, createLocalStore, num, str } from './localStore'

export interface PersonalInfo {
  name: string; email: string; contact: string
  notifyEmail: boolean; notifyBrowser: boolean; twoFactor: boolean
}
export interface BusinessInfo {
  businessName: string; tradingName: string; abn: string; projectedVolume: string
  accountNumber: string; email: string; accountType: string; paymentType: 'Prepaid' | 'Postpaid'
  country: string; line1: string; line2: string; postalCode: string
}
export interface SavedPackage { id: string; name: string; weightKg: number; l: number; w: number; h: number }
export interface MerchantSettings {
  personal: PersonalInfo
  business: BusinessInfo
  /** '' = the first pickup address is the default */
  defaultStoreCode: string
  packages: SavedPackage[]
  /** the checkout's preselected payment method ('' = Wallet) */
  defaultPayMethod: string
}

export const PROJECTED_VOLUMES = ['0-100 Consignments', '101-250 Consignments', '251-500 Consignments', '500+ Consignments']
const KEY = 'grow-merchant-settings-v1'

/** A deterministic account number from the merchant code (never random). */
const accountNo = (code: string) => {
  let h = 7
  for (const c of code) h = (h * 31 + c.charCodeAt(0)) % 1_000_000_000
  return String(100_000_000 + (h % 900_000_000))
}

export function defaultSettings(code: string, name: string, party?: Party | null): MerchantSettings {
  return {
    personal: {
      name: party?.name || name, email: party?.email || '', contact: party?.contactNumber || '',
      notifyEmail: true, notifyBrowser: true, twoFactor: false,
    },
    business: {
      businessName: party?.businessName || name, tradingName: name, abn: '1234', projectedVolume: PROJECTED_VOLUMES[1],
      accountNumber: accountNo(code || name), email: party?.email || '', accountType: 'Individual', paymentType: 'Postpaid',
      country: party?.country || 'Philippines', line1: party?.line1 || '', line2: party?.line2 || '', postalCode: party?.postalCode || '',
    },
    defaultStoreCode: '',
    /* the live tab's own example row */
    packages: [{ id: 'flyer', name: 'Flyer', weightKg: 1, l: 10, w: 10, h: 10 }],
    defaultPayMethod: '',
  }
}

type Db = Record<string, MerchantSettings>

function normOne(r: Record<string, unknown>): MerchantSettings {
  const p = (r.personal ?? {}) as Record<string, unknown>
  const b = (r.business ?? {}) as Record<string, unknown>
  return {
    personal: {
      name: str(p.name), email: str(p.email), contact: str(p.contact),
      notifyEmail: bool(p.notifyEmail, true), notifyBrowser: bool(p.notifyBrowser, true), twoFactor: bool(p.twoFactor),
    },
    business: {
      businessName: str(b.businessName), tradingName: str(b.tradingName), abn: str(b.abn), projectedVolume: str(b.projectedVolume, PROJECTED_VOLUMES[1]),
      accountNumber: str(b.accountNumber), email: str(b.email), accountType: str(b.accountType, 'Individual'),
      paymentType: b.paymentType === 'Prepaid' ? 'Prepaid' : 'Postpaid',
      country: str(b.country, 'Philippines'), line1: str(b.line1), line2: str(b.line2), postalCode: str(b.postalCode),
    },
    defaultStoreCode: str(r.defaultStoreCode),
    defaultPayMethod: str(r.defaultPayMethod),
    packages: (Array.isArray(r.packages) ? r.packages : []).filter((x) => x && typeof x === 'object').map((x: Record<string, unknown>) => ({
      id: str(x.id), name: str(x.name), weightKg: num(x.weightKg), l: num(x.l), w: num(x.w), h: num(x.h),
    })).filter((x) => x.id && x.name),
  }
}

const store = createLocalStore<Db>(KEY, () => ({}), (raw) => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const out: Db = {}
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) if (v && typeof v === 'object') out[k] = normOne(v as Record<string, unknown>)
  return out
})

/** The merchant's settings — stored, else the defaults derived from the masters row. */
export function readMerchantSettings(code: string, name: string, party?: Party | null): MerchantSettings {
  return store.get()[code] ?? defaultSettings(code, name, party)
}
/** Subscribes; returns the same value as `readMerchantSettings`. */
export function useMerchantSettings(code: string, name: string, party?: Party | null): MerchantSettings {
  const db = store.use()
  return db[code] ?? defaultSettings(code, name, party)
}
/** Subscribe to every write (for memo deps in other modules' hooks). */
export const useMerchantSettingsDb = store.use

export function saveMerchantSettings(code: string, base: MerchantSettings, patch: Partial<MerchantSettings>): void {
  store.update((db) => ({ ...db, [code]: { ...base, ...patch } }))
}

let pkgSeq = 0
export const newSavedPackageId = () => `p${Date.now().toString(36)}${(pkgSeq++).toString(36)}`

/** Saved packages as order-form presets (`SAVED-<id>`), for `packageTypesForMerchant`. */
export function savedPackageTypes(merchantCode: string | null): PackageType[] {
  if (!merchantCode) return []
  const s = store.get()[merchantCode]
  const pkgs = s ? s.packages : defaultSettings(merchantCode, '').packages
  return pkgs.map((p) => ({
    code: `SAVED-${p.id}`, name: `${p.name} (saved)`, lengthCm: p.l, widthCm: p.w, heightCm: p.h, weightKg: p.weightKg,
    merchantCode, enabled: true,
  }))
}
export const defaultStoreCodeOf = (merchantCode: string | null): string =>
  (merchantCode ? store.get()[merchantCode]?.defaultStoreCode ?? '' : '')
