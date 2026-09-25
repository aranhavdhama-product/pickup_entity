/**
 * The merged Packages widget — replaces the old, separately-rendered SKU and
 * Package sections. A merchant thinks in terms of "what am I shipping and how
 * is it boxed", not "define every SKU first, then reconcile it into boxes" —
 * so Packages is the ONE list here, and SKU lines are optional, nested
 * enrichment scoped to their parent package (a package with zero SKU lines is
 * fully valid — "just work with packages").
 *
 * Riding the same RepeatableList/Fld/MiniBox/Composite grammar as
 * consignmentRows.tsx so this still reads as one form with the rest of the
 * page, just restructured around package-first containment instead of a
 * global SKU pool cross-referenced into boxes.
 */
import { useState } from 'react'
import { ChevronDown, ChevronRight, Package as PackageIcon, Plus, X } from 'lucide-react'
import { Input, MenuSelect } from '../../nueva/components'
import {
  Composite, DerivedBox, Facts, Fld as RowFld, MiniBox, MiniNum, RepeatableList, TotalsStrip, UnitPick, UnitTag,
} from '../../components/consignmentRows'
import { fmt, num, volumeOf } from '../../components/consignmentRowsModel'
import { pkgIncomplete, type PkgRow, type PkgSkuLine } from './packageSkuModel'
import type { MasterRecord, SkuMasterRow } from '../../nueva/settingsApi'

export function PackageSection({
  rows, skuMaster, packageTypes, caption,
  onAdd, onRemove, onDuplicate, onChange, onAddSku, onRemoveSku, onChangeSku,
}: {
  rows: PkgRow[]
  skuMaster: SkuMasterRow[]
  packageTypes: MasterRecord[]
  caption: string
  onAdd: () => void
  onRemove: (i: number) => void
  onDuplicate: (i: number) => void
  onChange: (i: number, patch: Partial<PkgRow>) => void
  onAddSku: (pkgIndex: number) => void
  onRemoveSku: (pkgIndex: number, skuIndex: number) => void
  onChangeSku: (pkgIndex: number, skuIndex: number, patch: Partial<PkgSkuLine>) => void
}) {
  const summary = (r: PkgRow) => (
    <Facts items={[
      r.type || null,
      r.quantity.trim() && `Qty ${r.quantity}`,
      (r.length.trim() || r.width.trim() || r.height.trim()) &&
        `${r.length || 0} × ${r.width || 0} × ${r.height || 0} ${(r.dimensionUom || 'cm').toLowerCase()}`,
      r.weight.trim() && `${r.weight} ${(r.weightUom || 'kg').toLowerCase()}`,
      r.skus.length ? `${r.skus.length} SKU${r.skus.length === 1 ? '' : 's'}` : null,
    ]} />
  )
  return (
    <RepeatableList
      title="Packages" addNoun="Package"
      icon={<PackageIcon size={15} className="text-brand-500" />}
      caption={caption}
      cardLabel={(i) => `Package ${i + 1}`}
      rows={rows} incomplete={pkgIncomplete} summary={summary}
      onAdd={onAdd} onRemove={onRemove} onDuplicate={onDuplicate}
      body={(row, i) => (
        <PkgBody
          row={row} skuMaster={skuMaster} packageTypes={packageTypes}
          onChange={(patch) => onChange(i, patch)}
          onAddSku={() => onAddSku(i)}
          onRemoveSku={(si) => onRemoveSku(i, si)}
          onChangeSku={(si, patch) => onChangeSku(i, si, patch)}
        />
      )}
      totals={rows.length > 0 ? <PackageTotals rows={rows} /> : undefined}
    />
  )
}

function PackageTotals({ rows }: { rows: PkgRow[] }) {
  const totalWeight = rows.reduce((a, r) => a + num(r.weight) * (num(r.quantity) || 1), 0)
  const totalSkus = rows.reduce((a, r) => a + r.skus.length, 0)
  const wUom = rows.find((r) => r.weightUom)?.weightUom || 'KG'
  return (
    <TotalsStrip items={[
      [`Total Weight (${wUom})`, fmt(totalWeight)],
      ['Packages', String(rows.length)],
      ['SKU lines', String(totalSkus)],
    ]} />
  )
}

function PackageBoxTypeField({ value, packageTypes, onPick }: {
  value: string; packageTypes: MasterRecord[]; onPick: (code: string, t?: MasterRecord) => void
}) {
  const typeRows = packageTypes.filter((t) => t.enabled)
  const fallback = !typeRows.length
  const typeOptions = typeRows.length ? typeRows.map((t) => String(t.code)) : ['Carton', 'Pallet', 'Box', 'Bag']
  const typeLabel = (v: string) => {
    const t = typeRows.find((x) => String(x.code) === v)
    return t ? `${String(t.name)} (${v})` : v
  }
  return (
    <RowFld label="Package Type" required>
      <MenuSelect value={value} placeholder="Pick a package type" searchable
        options={typeOptions} labels={typeLabel}
        onChange={(code) => onPick(code, typeRows.find((x) => String(x.code) === code))} />
      {fallback && <p className="mt-1 text-[11.5px] text-ink-3">No package presets configured — showing default types.</p>}
    </RowFld>
  )
}

function PkgBody({ row, skuMaster, packageTypes, onChange, onAddSku, onRemoveSku, onChangeSku }: {
  row: PkgRow
  skuMaster: SkuMasterRow[]
  packageTypes: MasterRecord[]
  onChange: (patch: Partial<PkgRow>) => void
  onAddSku: () => void
  onRemoveSku: (skuIndex: number) => void
  onChangeSku: (skuIndex: number, patch: Partial<PkgSkuLine>) => void
}) {
  const [moreOpen, setMoreOpen] = useState(false)
  const vol = volumeOf(row)
  const dim = (row.dimensionUom || 'CM').toLowerCase()

  const pickType = (code: string, t?: MasterRecord) => {
    const patch: Partial<PkgRow> = { type: code }
    if (t) {
      if (t.length != null) patch.length = String(t.length)
      if (t.breadth != null) patch.width = String(t.breadth)
      if (t.height != null) patch.height = String(t.height)
      if (t.unitOfMeasure) patch.dimensionUom = String(t.unitOfMeasure)
      if (t.weightUom) patch.weightUom = String(t.weightUom)
      if (!row.weightManual && t.weight != null) patch.weight = String(t.weight)
    }
    onChange(patch)
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-x-5 gap-y-4 sm:grid-cols-3 xl:grid-cols-5">
        <PackageBoxTypeField value={row.type} packageTypes={packageTypes} onPick={pickType} />
        <RowFld label="Quantity" required>
          <Input type="number" value={row.quantity} placeholder="eg, 1" onChange={(v) => onChange({ quantity: v })} />
        </RowFld>
        <RowFld label="Dimensions — L × W × H" className="col-span-2">
          <div className="flex items-center gap-1.5">
            <MiniBox><MiniNum value={row.length} placeholder="L" onChange={(v) => onChange({ length: v })} /></MiniBox>
            <span className="shrink-0 text-[11px] text-warm-400">×</span>
            <MiniBox><MiniNum value={row.width} placeholder="W" onChange={(v) => onChange({ width: v })} /></MiniBox>
            <span className="shrink-0 text-[11px] text-warm-400">×</span>
            <MiniBox><MiniNum value={row.height} placeholder="H" onChange={(v) => onChange({ height: v })} /></MiniBox>
            <div className="flex h-8 shrink-0 items-center rounded-md border border-warm-300 bg-surface">
              <UnitTag value={dim} />
            </div>
          </div>
        </RowFld>
        <RowFld label="Weight" helper={!row.weightManual && row.skus.length > 0
          ? <span className="text-[11.5px] text-ink-3">Auto from SKU contents</span> : undefined}>
          <Composite>
            <MiniNum value={row.weight} placeholder="eg, 10"
              onChange={(v) => onChange({ weight: v, weightManual: true })} />
            <UnitPick value={row.weightUom || 'KG'} options={['KG', 'LBS', 'G']}
              onChange={(v) => onChange({ weightUom: v })} />
          </Composite>
        </RowFld>
      </div>

      <button type="button" onClick={() => setMoreOpen((v) => !v)}
        className="mt-3 inline-flex items-center gap-1 text-[12.5px] font-bold text-brand-500 hover:text-brand-600">
        {moreOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        More package details
      </button>
      {moreOpen && (
        <div className="mt-3 grid grid-cols-2 gap-x-5 gap-y-4 sm:grid-cols-3 xl:grid-cols-5">
          <RowFld label="Tracking Number">
            <Input value={row.trackingNumber} placeholder="auto if empty" onChange={(v) => onChange({ trackingNumber: v })} />
          </RowFld>
          <RowFld label="Pallet Space">
            <Input type="number" value={row.palletSpace} placeholder="eg, 1" onChange={(v) => onChange({ palletSpace: v })} />
          </RowFld>
          <RowFld label="Package Description">
            <Input value={row.description} placeholder="eg, Fragile glassware" onChange={(v) => onChange({ description: v })} />
          </RowFld>
          <RowFld label={`Volume (${dim}³)`}>
            <DerivedBox value={vol ? fmt(vol) : '—'} />
          </RowFld>
        </div>
      )}

      {/* -------------------------------------------------------- contents */}
      <div className="mt-5 border-t border-line/70 pt-4">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-ink-3">Contents (optional)</span>
        </div>
        {row.skus.length === 0 ? (
          <p className="text-[12.5px] text-ink-3">
            This package can ship as-is. Add SKU lines only if you want to record what's inside.
          </p>
        ) : (
          <div className="grid gap-2">
            {row.skus.map((sku, si) => (
              <SkuLine key={si} sku={sku} skuMaster={skuMaster}
                onChange={(patch) => onChangeSku(si, patch)}
                onRemove={() => onRemoveSku(si)}
              />
            ))}
          </div>
        )}
        <button type="button" onClick={onAddSku}
          className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-warm-300 py-2.5
                     text-[12.5px] font-bold text-brand-500 transition-colors hover:border-brand-500 hover:bg-brand-50/40">
          <Plus size={13} /> Add SKU
        </button>
      </div>
    </>
  )
}

function SkuLine({ sku, skuMaster, onChange, onRemove }: {
  sku: PkgSkuLine
  skuMaster: SkuMasterRow[]
  onChange: (patch: Partial<PkgSkuLine>) => void
  onRemove: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const codes = skuMaster.length ? skuMaster.filter((m) => m.enabled).map((m) => m.skuCode) : []
  const pick = (code: string) => {
    const patch: Partial<PkgSkuLine> = { code }
    const m = skuMaster.find((x) => x.skuCode === code)
    if (m) {
      if (m.skuCategory) patch.category = m.skuCategory
      if (m.uomDimensions) patch.uom = m.uomDimensions
      if (m.uomWeight) patch.weightUom = m.uomWeight
      if (!sku.description.trim() && m.description) patch.description = m.description
      if (!sku.weight.trim() && m.weight != null) patch.weight = String(m.weight)
      if (!sku.length.trim() && m.length != null) patch.length = String(m.length)
      if (!sku.width.trim() && m.breadth != null) patch.width = String(m.breadth)
      if (!sku.height.trim() && m.height != null) patch.height = String(m.height)
      if (!sku.name.trim() && m.skuCode) patch.name = m.skuCode
    }
    onChange(patch)
  }
  return (
    <div className="rounded-md border border-line bg-warm-25/60 px-3 py-2.5">
      <div className="flex items-center gap-3">
        <button type="button" onClick={() => setExpanded((v) => !v)} className="shrink-0 text-warm-400 hover:text-ink">
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>
        <div className="w-40 shrink-0">
          <MenuSelect value={sku.code} placeholder="SKU code" searchable creatable
            options={codes} onChange={pick} />
        </div>
        <div className="min-w-0 flex-1">
          <Input value={sku.name} placeholder="eg, Water Bottle" onChange={(v) => onChange({ name: v })} />
        </div>
        <div className="w-20 shrink-0">
          <Input type="number" value={sku.quantity} placeholder="Qty" onChange={(v) => onChange({ quantity: v })} />
        </div>
        <button type="button" onClick={onRemove} aria-label="Remove SKU line"
          className="shrink-0 text-warm-400 transition-colors hover:text-brand-500">
          <X size={15} />
        </button>
      </div>
      {expanded && (
        <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-line/60 pt-3 sm:grid-cols-3 xl:grid-cols-6">
          <RowFld label="Category">
            <Input value={sku.category} placeholder="eg, Bulky" onChange={(v) => onChange({ category: v })} />
          </RowFld>
          <RowFld label="HSN Code">
            <Input value={sku.hsnCode} placeholder="eg, 220429" onChange={(v) => onChange({ hsnCode: v })} />
          </RowFld>
          <RowFld label="Image Url">
            <Input value={sku.imageUrl} placeholder="eg, https://…" onChange={(v) => onChange({ imageUrl: v })} />
          </RowFld>
          <RowFld label="Unit Cost">
            <Input type="number" value={sku.unitCost} placeholder="eg, 12.34" onChange={(v) => onChange({ unitCost: v })} />
          </RowFld>
          <RowFld label="Weight">
            <Composite>
              <MiniNum value={sku.weight} placeholder="eg, 10" onChange={(v) => onChange({ weight: v })} />
              <UnitPick value={sku.weightUom} options={['KG', 'LBS', 'G']} onChange={(v) => onChange({ weightUom: v })} />
            </Composite>
          </RowFld>
          <RowFld label="Dimensions — L × B × H">
            <div className="flex items-center gap-1.5">
              <MiniBox><MiniNum value={sku.length} placeholder="L" onChange={(v) => onChange({ length: v })} /></MiniBox>
              <MiniBox><MiniNum value={sku.width} placeholder="B" onChange={(v) => onChange({ width: v })} /></MiniBox>
              <MiniBox><MiniNum value={sku.height} placeholder="H" onChange={(v) => onChange({ height: v })} /></MiniBox>
              <div className="flex h-8 shrink-0 items-center overflow-visible rounded-md border border-warm-300 bg-surface">
                <UnitPick value={sku.uom} options={['CM', 'IN', 'M']} onChange={(v) => onChange({ uom: v })} />
              </div>
            </div>
          </RowFld>
        </div>
      )}
    </div>
  )
}
