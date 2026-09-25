/**
 * Package & SKU — the merchant order form's packages, in the console Simplified tier's
 * Package & SKU grammar (owner, 2026-09-25: "SKU and package like this in Grow also, but in SKU
 * ask for HSN code and country of origin also"; AddOrderPage `packageSimplified`).
 *
 * Two levels (2026-09-25, so no cell is ever clipped): the package row — Package ID (generated,
 * read-only) · Package Type (Package master preset, or Custom) · Quantity · Tracking ID (blank =
 * generated) · delete — and under it, full width and indented under Package Type, the package's
 * SKU block with its own label row: SKU Code (an autocomplete on the SKU master, a removable chip
 * once picked) · SKU Name · HSN Code · Country of origin (prefilled from the master, editable) ·
 * ✕, then "Add more SKU" and, for Custom, one Weight (kg) · L × W × H (cm) line. A preset
 * carries the dimensions (and tare).
 * (cm). "Add package" below; a totals line closes the section. A row missing something carries
 * an "Incomplete" chip (no eager red). The model (weights, readiness) is `packageModel.ts`.
 */
import { Fragment, useState, type ReactNode } from 'react'
import { Trash2, X } from 'lucide-react'
import { Input, MenuSelect, StatusPill } from '../../nueva/components'
import { AddMoreButton } from '../../components/consignmentForm'
import type { PackageType, SkuItem } from '../../growOrders/masters'
import type { Parcel, ParcelItem } from '../../growOrders/draft'
import { chargeableKg } from '../../growOrders/rates'
import { CUSTOM_PACKAGE, CUSTOM_PACKAGE_NAME, blankItem, isBlankItem, newParcel, packageReady, reweigh } from './packageModel'
import { Autocomplete, NumInput } from './merchantFormBits'

export interface PackageEditorProps {
  parcels: Parcel[]
  setParcels: (f: (ps: Parcel[]) => Parcel[]) => void
  packageTypes: PackageType[]
  skus: SkuItem[]
  hid: (key: string) => boolean
  need: (key: string) => boolean
  lbl: (key: string) => string
  showErrors: boolean
  currency: string
  /** a fixed first package (an overage scan): not removable, its tracking id is the scan */
  lockFirst?: boolean
  /** rendered under the totals line */
  footer?: ReactNode
}

/* The package row: Package ID · Package Type · Quantity · Tracking ID · delete. Its SKU block
   spans the full width underneath, indented under Package Type, with its own 12px label row —
   SKU Code · SKU Name · HSN Code · Country of origin · ✕ — so no SKU cell is squeezed (owner,
   2026-09-25: "alignment and UI should not break"). */
const PKG_COLS = 'grid grid-cols-[132px_minmax(0,1.4fr)_96px_minmax(0,1fr)_32px] items-start gap-x-3'
const SKU_COLS = 'grid grid-cols-[minmax(184px,1.1fr)_minmax(0,1.7fr)_96px_minmax(112px,1fr)_28px] items-center gap-x-2'
const INDENT = 'pl-[144px]'
const HEADERS = ['Package ID', 'Package Type', 'Quantity', 'Tracking ID']
const SKU_HEADERS = ['SKU Code', 'SKU Name', 'HSN Code', 'Country of origin']

/** What a package still lacks — the Incomplete chip's tooltip. */
function packageGaps(p: Parcel, need: (k: string) => boolean): string[] {
  const lines = (p.items ?? []).filter((it) => !isBlankItem(it))
  return [
    ...(packageReady(p) ? [] : [p.packageTypeCode === CUSTOM_PACKAGE ? 'a weight or a size' : 'a quantity']),
    ...(need('pkgTracking') && !(p.trackingNumber ?? '').trim() ? ['a tracking ID'] : []),
    ...(lines.some((it) => !it.name.trim()) ? ['a SKU name'] : []),
    ...(need('skuHsn') && lines.some((it) => !(it.hsnCode ?? '').trim()) ? ['HSN codes'] : []),
  ]
}

function ReadBox({ value }: { value: string }) {
  return (
    <div className="flex h-8 items-center truncate rounded-md border border-warm-200 bg-warm-50 px-3 text-[13px] text-ink-2" title={value}>
      {value || '—'}
    </div>
  )
}

export function PackageEditor({ parcels, setParcels, packageTypes, skus, hid, need, showErrors, lockFirst, footer }: PackageEditorProps) {
  const set = (i: number, patch: Partial<Parcel>) => setParcels((ps) => ps.map((x, j) => (j === i ? { ...x, ...patch } : x)))
  const setItems = (i: number, f: (items: ParcelItem[]) => ParcelItem[]) =>
    setParcels((ps) => ps.map((x, j) => (j === i ? reweigh({ ...x, items: f(x.items ?? []) }, packageTypes) : x)))
  /** line `k` of package `i`, created blank when the row edits a line that is not there yet */
  const padTo = (items: ParcelItem[], k: number) => (items.length > k ? items : [...items, ...Array.from({ length: k + 1 - items.length }, blankItem)])
  const setItem = (i: number, k: number, patch: Partial<ParcelItem>) =>
    setItems(i, (items) => padTo(items, k).map((it, m) => (m === k ? { ...it, ...patch } : it)))
  const pickSku = (i: number, k: number, s: SkuItem) => setItem(i, k, {
    skuCode: s.code, name: s.name, weightKg: s.weightKg, weightUom: 'KG', hsnCode: s.hsnCode, originCountry: s.originCountry,
    category: s.category, lengthCm: s.lengthCm, widthCm: s.widthCm, heightCm: s.heightCm, dimUom: 'CM',
    ...(s.unitCost ? { unitCost: s.unitCost } : {}),
  })
  const pickType = (i: number, code: string) => {
    const t = packageTypes.find((x) => x.code === code)
    setParcels((ps) => ps.map((x, j) => (j === i ? reweigh(t
      ? { ...x, packageTypeCode: t.code, packageTypeName: t.name, l: t.lengthCm, w: t.widthCm, h: t.heightCm }
      : { ...x, packageTypeCode: CUSTOM_PACKAGE, packageTypeName: CUSTOM_PACKAGE_NAME }, packageTypes) : x)))
  }
  const typeOpts = [...packageTypes.map((t) => t.code), CUSTOM_PACKAGE]
  const typeLabel = (c: string) => packageTypes.find((x) => x.code === c)?.name ?? CUSTOM_PACKAGE_NAME
  const typeOf = (p: Parcel) => (p.packageTypeCode && typeOpts.includes(p.packageTypeCode) ? p.packageTypeCode : CUSTOM_PACKAGE)
  const showDims = !hid('pkgDimensions')
  const showWeight = !hid('pkgWeight')
  const showHsn = !hid('skuHsn')
  const w = chargeableKg(parcels)
  const pieces = parcels.reduce((n, p) => n + (p.quantity || 0), 0)

  const ghostNum = (v: number, on: (n: number) => void, o: { integer?: boolean; min?: number; placeholder?: string; unit?: string } = {}) => (
    <NumInput ghost value={v} blankZero={!o.integer} integer={o.integer} min={o.min ?? 0} placeholder={o.placeholder ?? '0'} unit={o.unit} onChange={on} />
  )
  return (
    <div>
      <div className="rounded-md border border-line">
        <div className={`${PKG_COLS} border-b border-line px-3 py-2.5 text-[12px] font-bold text-ink`}>
          {HEADERS.map((h) => <span key={h} className="whitespace-nowrap">{h}</span>)}
          <span />
        </div>
        {parcels.map((p, i) => {
          const items = p.items?.length ? p.items : [undefined]
          const gaps = packageGaps(p, need)
          const custom = typeOf(p) === CUSTOM_PACKAGE
          const removable = parcels.length > 1 && !(lockFirst && i === 0)
          return (
            <div key={p.packageId ?? i} className="border-b border-line px-3 py-3 last:border-b-0">
              <div className={PKG_COLS}>
                <div className="min-w-0">
                  <ReadBox value={p.packageId ?? ''} />
                  {gaps.length > 0 && (
                    <span title={`Needs ${gaps.join(', ')}`} className="mt-1 inline-block">
                      <StatusPill label="Incomplete" tone={showErrors ? 'danger' : 'warning'} />
                    </span>
                  )}
                </div>
                <div className="min-w-0"><MenuSelect value={typeOf(p)} options={typeOpts} labels={typeLabel} onChange={(c) => pickType(i, c)} /></div>
                <div className="min-w-0">{ghostNum(p.quantity, (n) => set(i, { quantity: Math.max(1, n) }), { integer: true, min: 1 })}</div>
                <div className="min-w-0">
                  <Input variant="ghost" value={p.trackingNumber ?? ''} placeholder="Auto" disabled={!!lockFirst && i === 0}
                    onChange={(v) => set(i, { trackingNumber: v })} />
                </div>
                <div className="flex h-8 items-center justify-end">
                  {removable && (
                    <button type="button" title="Remove package" onClick={() => setParcels((ps) => ps.filter((_, j) => j !== i))}
                      className="flex h-7 w-7 items-center justify-center rounded-md text-ink-3 hover:bg-warm-100 hover:text-ink"><Trash2 size={14} /></button>
                  )}
                </div>
              </div>

              {/* the package's SKUs — full width, their own labels */}
              <div className={`${INDENT} mt-3`}>
                <div className={`${SKU_COLS} pb-1 text-[12px] font-bold text-ink-3`}>
                  {SKU_HEADERS.map((h) => (h === 'HSN Code' && !showHsn ? <span key={h} /> : (
                    <span key={h} className="whitespace-nowrap">{h}{h === 'HSN Code' && need('skuHsn') && <span className="text-danger-fg">*</span>}</span>
                  )))}
                  <span />
                </div>
                {items.map((it, k) => (
                  <div key={k} className={`${SKU_COLS} py-0.5`}>
                    <div className="min-w-0"><SkuCode item={it ?? blankItem()} skus={skus} onPick={(sk) => pickSku(i, k, sk)} onUnlink={() => setItem(i, k, { skuCode: null })} /></div>
                    <div className="min-w-0" title={it?.name || undefined}><Input variant="ghost" value={it?.name ?? ''} placeholder="SKU name" onChange={(v) => setItem(i, k, { name: v })} /></div>
                    <div className="min-w-0">{showHsn && <Input variant="ghost" value={it?.hsnCode ?? ''} placeholder="HSN" onChange={(v) => setItem(i, k, { hsnCode: v })} />}</div>
                    <div className="min-w-0"><Input variant="ghost" value={it?.originCountry ?? ''} placeholder="Country" onChange={(v) => setItem(i, k, { originCountry: v })} /></div>
                    <div className="flex h-8 items-center justify-end">
                      {(k > 0 || !!it) && (
                        <button type="button" title="Remove SKU" onClick={() => setItems(i, (xs) => xs.filter((_, m) => m !== k))}
                          className="flex h-7 w-7 items-center justify-center rounded-md text-ink-3 hover:bg-warm-100 hover:text-ink"><X size={14} /></button>
                      )}
                    </div>
                  </div>
                ))}
                <div className="mt-2">
                  <button type="button" onClick={() => setItems(i, (xs) => [...padTo(xs, 0), blankItem()])}
                    className="inline-flex h-7 items-center whitespace-nowrap rounded-md border border-brand-500 bg-surface px-2 text-[12px] font-bold text-brand-500 hover:bg-warm-50">
                    Add more SKU
                  </button>
                </div>
                {custom && (showWeight || showDims) && (
                  <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line pt-3 text-[12px] text-ink-3">
                    <span className="whitespace-nowrap font-bold text-ink-2">Custom size</span>
                    {showWeight && (
                      <label className="flex items-center gap-1.5 whitespace-nowrap">Weight
                        <span className="w-28">{ghostNum(p.weight, (n) => set(i, { weight: n, weightMode: n > 0 ? 'manual' : 'auto' }), { unit: 'kg' })}</span>
                      </label>
                    )}
                    {showDims && (
                      <label className="flex items-center gap-1.5 whitespace-nowrap">L × W × H
                        <span className="grid w-64 grid-cols-3 gap-1">
                          {ghostNum(p.l, (n) => set(i, { l: n }), { placeholder: 'L' })}
                          {ghostNum(p.w, (n) => set(i, { w: n }), { placeholder: 'W' })}
                          {ghostNum(p.h, (n) => set(i, { h: n }), { placeholder: 'H', unit: 'cm' })}
                        </span>
                      </label>
                    )}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
      <div className="mt-3">
        <AddMoreButton label="Add package" icon={false} onClick={() => setParcels((ps) => [...ps, newParcel()])} />
      </div>
      <p className="mt-4 border-t border-line pt-3 text-[13px] text-ink-2">
        <b className="text-ink">{parcels.length}</b> package{parcels.length === 1 ? '' : 's'}
        {' · '}<b className="text-ink">{pieces}</b> piece{pieces === 1 ? '' : 's'}
        {' · '}dead <b className="text-ink">{w.dead.toLocaleString()} kg</b>
        {' · '}volumetric <b className="text-ink">{w.volumetric.toLocaleString()} kg</b>
        {' · '}billed on <b className="text-ink">{w.chargeable.toLocaleString()} kg</b>
      </p>
      {footer}
    </div>
  )
}

/** SKU Code — an autocomplete on the SKU master; a picked code shows as a removable chip. */
function SkuCode({ item, skus, onPick, onUnlink }: { item: ParcelItem; skus: SkuItem[]; onPick: (s: SkuItem) => void; onUnlink: () => void }) {
  const [q, setQ] = useState('')
  if (item.skuCode) {
    return (
      <span className="flex h-8 min-w-0 items-center gap-1 rounded-md border border-warm-300 bg-warm-50 px-3 text-[13px] text-ink" title={item.skuCode}>
        <span className="min-w-0 flex-1 truncate" title={item.skuCode}>{item.skuCode}</span>
        <button type="button" aria-label="Remove SKU code" title="Remove SKU code" onClick={onUnlink}
          className="shrink-0 text-warm-400 hover:text-ink"><X size={13} /></button>
      </span>
    )
  }
  const needle = q.trim().toLowerCase()
  const hits = skus.filter((s) => s.enabled && (!needle || `${s.code} ${s.name} ${s.category}`.toLowerCase().includes(needle))).slice(0, 8)
  return (
    <Autocomplete value={q} onChange={setQ} hits={hits} placeholder="Search SKU"
      onPick={(s) => { setQ(''); onPick(s) }}
      render={(s) => (
        <Fragment>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-bold text-ink">{s.code} · {s.name}</span>
            <span className="block truncate text-[12px] text-ink-3">
              {s.category || 'Uncategorised'}{s.hsnCode ? ` · HSN ${s.hsnCode}` : ''}{s.originCountry ? ` · ${s.originCountry}` : ''}
            </span>
          </span>
          <span className="shrink-0 text-[12px] tabular-nums text-ink-3">{s.weightKg} kg</span>
        </Fragment>
      )} />
  )
}
