/**
 * Data model for the merged Packages widget — types, row constructors and
 * completeness/derivation helpers. Kept separate from packageSku.tsx so that
 * file only exports components (react-refresh requirement), same split as
 * consignmentRowsModel.ts / consignmentRows.tsx.
 */
import { num } from '../../components/consignmentRowsModel'

export interface PkgSkuLine {
  lineItemNo: string
  code: string; name: string; category: string; description: string
  hsnCode: string; imageUrl: string; unitCost: string
  quantity: string
  weight: string; weightUom: string
  length: string; width: string; height: string; uom: string
}

export interface PkgRow {
  packageId: string
  trackingNumber: string; type: string; description: string; quantity: string
  weight: string; weightUom: string
  length: string; width: string; height: string; dimensionUom: string
  palletSpace: string
  /** true once the merchant has typed a weight directly — stops auto-deriving from SKU contents */
  weightManual: boolean
  skus: PkgSkuLine[]
}

export const newPkgSkuLine = (): PkgSkuLine => ({
  lineItemNo: '', code: '', name: '', category: '', description: '',
  hsnCode: '', imageUrl: '', unitCost: '', quantity: '1',
  weight: '', weightUom: 'KG', length: '', width: '', height: '', uom: 'CM',
})

export const newPkgRow = (): PkgRow => ({
  packageId: Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-6),
  trackingNumber: '', type: '', description: '', quantity: '1',
  weight: '', weightUom: 'KG', length: '', width: '', height: '', dimensionUom: 'CM',
  palletSpace: '', weightManual: false, skus: [],
})

export const skuLineIncomplete = (s: PkgSkuLine) => !s.name.trim() || !s.quantity.trim()
export const pkgIncomplete = (r: PkgRow) => !r.type || !r.quantity.trim() || r.skus.some(skuLineIncomplete)

/** globally unique line item numbers across every package, so the API payload
 * and any VAS targeting can address a specific SKU line unambiguously */
export const nextLineItemNo = (pkgs: PkgRow[]) =>
  String(pkgs.reduce((n, p) => n + p.skus.length, 0) + 1)

/** sum of (weight × quantity) across a package's SKU lines, '' if none priced yet */
const derivedWeight = (skus: PkgSkuLine[]): string => {
  if (!skus.length) return ''
  const total = skus.reduce((a, s) => a + num(s.weight) * (num(s.quantity) || 1), 0)
  return total ? String(Math.round(total * 100) / 100) : ''
}

/** re-derive a package's weight from its SKU contents, unless the merchant already typed one in directly */
export function withDerivedWeight(pkg: PkgRow): PkgRow {
  if (pkg.weightManual) return pkg
  const derived = derivedWeight(pkg.skus)
  return derived ? { ...pkg, weight: derived } : pkg
}
