/**
 * Data model for the SKU / Package / VAS repeatable blocks — types, row
 * constructors, completeness checks and the SKU↔package packing reconciliation.
 * Kept separate from consignmentRows.tsx so that file only exports components
 * (react-refresh requirement).
 */

export interface SkuRow {
  /** sku_category — staging asks it on the SKU line */
  category: string
  lineItemNo: string; code: string; name: string; description: string; imageUrl: string
  hsnCode: string
  uom: string; weightUom: string; quantity: string; unitCost: string
  weight: string; length: string; width: string; height: string
}
/** One SKU line packed inside a package: which line, and how many units of it. */
export interface PackageContent { lineItemNo: string; qty: string }
export interface PackageRow {
  packageId: string; trackingNumber: string; type: string
  description: string; quantity: string
  weight: string; length: string; width: string; height: string; palletSpace: string
  /** filled from the packageType master on pick; fall back to the SKU units */
  dimensionUom: string; weightUom: string
  /** What's inside the box — mirrors the API's sku.packageIds link, with quantities
      (FarEye's own record keeps a package_quantity_map for exactly this). */
  contents: PackageContent[]
}
export interface VasRow {
  level: string; skuLineItemNo: string; service: string; serviceTime: string; remark: string
}

export const newSku = (): SkuRow => ({
  lineItemNo: '', code: '', name: '', description: '', imageUrl: '', hsnCode: '', category: '',
  uom: 'CM', weightUom: 'KG', quantity: '', unitCost: '',
  weight: '', length: '', width: '', height: '',
})

/** staging generates the id on insert; keep it editable */
export const newPackage = (): PackageRow => ({
  packageId: Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-6),
  trackingNumber: '', type: '', description: '', quantity: '',
  weight: '', length: '', width: '', height: '', palletSpace: '',
  dimensionUom: '', weightUom: '',
  contents: [],
})

export const newVas = (): VasRow => ({
  level: 'SKU', skuLineItemNo: '', service: '', serviceTime: '0', remark: '',
})

export const num = (s: string) => {
  const n = Number(s)
  return Number.isFinite(n) ? n : 0
}
export const fmt = (n: number) => (n ? n.toLocaleString(undefined, { maximumFractionDigits: 2 }) : '-')
export const volumeOf = (r: { length: string; width: string; height: string }) =>
  num(r.length) * num(r.width) * num(r.height)

export const skuIncomplete = (r: SkuRow) => !r.lineItemNo.trim() || !r.code || !r.name.trim()
  || !r.uom || !r.quantity.trim() || !r.weight.trim() || !r.length.trim()
  || !r.width.trim() || !r.height.trim()
export const packageIncomplete = (r: PackageRow) => !r.type || !r.quantity.trim()
  || r.contents.some((c) => !c.lineItemNo || !num(c.qty))
export const vasIncomplete = (r: VasRow) => !r.level || !r.skuLineItemNo || !r.service
  || !r.serviceTime.trim()

/* --------------------------------------------------- SKU ↔ package packing ----- */

/** Per-SKU reconciliation between what was ordered and what the packages hold. */
export interface SkuPackInfo {
  lineItemNo: string; label: string; ordered: number; packed: number
  /** extra identity for the pack table — empty string when not filled in yet */
  description: string; dims: string; weight: string
}

export function computePackInfo(skus: SkuRow[], packages: PackageRow[]): SkuPackInfo[] {
  return skus
    .filter((s) => s.lineItemNo.trim())
    .map((s) => {
      const no = s.lineItemNo.trim()
      // contents.qty is per physical box; a package row with quantity N is N identical boxes
      const packed = packages.reduce((acc, p) =>
        acc + (num(p.quantity) || 1) * p.contents.reduce(
          (a, c) => a + (c.lineItemNo === no ? num(c.qty) : 0), 0), 0)
      return {
        lineItemNo: no,
        label: s.name.trim() ? `#${no} ${s.name.trim()}` : `#${no}`,
        ordered: num(s.quantity),
        packed,
        description: s.description.trim(),
        dims: [s.length, s.width, s.height].every((v) => v.trim())
          ? `${s.length} × ${s.width} × ${s.height} ${s.uom.toLowerCase()}` : '',
        weight: s.weight.trim() ? `${s.weight} ${s.weightUom.toLowerCase()}` : '',
      }
    })
}
