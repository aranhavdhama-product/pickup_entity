/**
 * The merchant order form's package model — presets, blank rows, weight derivation
 * (a package's weight follows its preset tare + items until the merchant types one).
 */
import type { PackageType } from '../../growOrders/masters'
import type { Parcel, ParcelItem } from '../../growOrders/draft'
import { volumetricKg } from '../../growOrders/rates'

export const CARGO_TYPES = ['Parcel', 'Document', 'Fragile', 'Perishable', 'Bulky']
export const CUSTOM_PACKAGE = '__custom__'
export const CUSTOM_PACKAGE_NAME = 'Custom'

export const round2 = (n: number) => Number(n.toFixed(2))
export const newPackageId = () => `PKG${Math.random().toString(36).slice(2, 8).toUpperCase()}`
export const blankItem = (): ParcelItem => ({ skuCode: null, name: '', quantity: 1, weightKg: 0 })
export const isBlankItem = (it: ParcelItem) => !it.skuCode && !it.name.trim()
export const newParcel = (): Parcel => ({
  packageId: newPackageId(), cargoType: CARGO_TYPES[0], packageTypeCode: CUSTOM_PACKAGE, packageTypeName: CUSTOM_PACKAGE_NAME,
  items: [], itemInfo: '', quantity: 1, weight: 0, l: 0, w: 0, h: 0, weightMode: 'auto',
  trackingNumber: '', palletSpace: '', description: '',
})
const itemsWeight = (items: ParcelItem[] = []) => items.reduce((n, it) => n + it.weightKg * it.quantity, 0)
/** Re-derive a package's weight after its items or packaging changed; a typed weight is never touched. */
export function reweigh(p: Parcel, types: PackageType[]): Parcel {
  if (p.weightMode === 'manual') return p
  const w = (types.find((t) => t.code === p.packageTypeCode)?.weightKg ?? 0) + itemsWeight(p.items)
  return w > 0 ? { ...p, weight: round2(w), weightMode: 'auto' } : { ...p, weightMode: 'auto' }
}
export const itemInfoOf = (p: Parcel) =>
  (p.items?.length ? p.items.map((it) => it.name.trim()).filter(Boolean).join(', ') : p.itemInfo)
/** Is a package complete enough to price (and to book)? */
export const packageReady = (p: Parcel) => p.quantity > 0 && Math.max(p.weight, volumetricKg(p)) > 0

