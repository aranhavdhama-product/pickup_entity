/**
 * The three repeatable blocks — SKU, Package and VAS.
 *
 * Shared by the Add Consignment page and the Modify Consignment Details modal, which
 * present the same three lists.
 *
 * Field sets and behaviour were captured from staging on 2026-08-04 by clicking each
 * "Add More". The PRESENTATION differs from staging in three deliberate ways, because
 * staging's version does not scale past a couple of rows:
 *
 *   1. One add affordance per section — the "+ Add X" text action in the header band,
 *      the same place in every section.
 *   2. Rows are an accordion: exactly one row is expanded at a time. Adding a row
 *      expands it and collapses whatever was open, so the page height stays flat no
 *      matter how many rows exist.
 *   3. A collapsed row is a single line carrying its own identity — code, name,
 *      quantity, weight — so rows can be told apart without opening them, plus an
 *      "Incomplete" marker where required fields are still empty.
 *
 * Every row body sits on the same 4-column labeled grid as the address sections, and
 * required-ness is signalled by the asterisk + the per-row "Incomplete" chip + the
 * count line under the list — never by eager "Required field." text on a pristine form.
 *
 * On staging, Package's Add More went disabled once Package 1 existed and STAYED
 * disabled even after a second SKU was added, so the gate is not a row count and its
 * real trigger could not be established. Adding is left ungated here: blocking the add
 * is exactly what makes entering several rows painful. Incompleteness is reported per
 * row and totalled under the list instead, so nothing is concealed.
 */

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, CircleMinus, Copy, Package as PackageIcon, Plus } from 'lucide-react'
import { Input, MenuSelect, StatusPill } from '../nueva/components'
import { fmt, num, packageIncomplete, volumeOf, type PackageContent, type PackageRow, type SkuPackInfo, type SkuRow, type VasRow } from './consignmentRowsModel'
import type { MasterRecord, SkuMasterRow } from '../nueva/settingsApi'

/* ------------------------------------------------------------- shared chrome ---- */

/** Same label anatomy as the address sections' fields, so all sections read alike. */
function Fld({ label, required, children, className }: {
  label: string; required?: boolean; children: React.ReactNode; className?: string
}) {
  return (
    <div className={`min-w-0 ${className ?? ''}`}>
      <label className="mb-1.5 flex h-5 items-center gap-1 whitespace-nowrap text-[13px] font-bold text-ink" title={label}>
        <span className="truncate">{label}</span>
        {required && <span className="shrink-0 text-brand-500">*</span>}
      </label>
      {children}
    </div>
  )
}

/** Read-only derived value (e.g. volume from L×W×H) presented at input height. */
function DerivedBox({ value }: { value: string }) {
  return (
    <div className="flex h-8 items-center rounded-md border border-warm-200 bg-warm-100/70 px-3 text-[13px] text-ink-2">
      {value}
    </div>
  )
}

/** inline unit chooser that lives INSIDE a composite control ("10 x 10 x 10 [cm]").
 * The menu is PORTALED — accordion rows are overflow-hidden, which would clip
 * an absolutely-positioned dropdown into invisibility. */
function UnitPick({ value, options, onChange }: {
  value: string; options: string[]; onChange: (v: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  const popRef = useRef<HTMLDivElement>(null)
  const openMenu = () => {
    const r = ref.current?.getBoundingClientRect()
    if (!r) return
    setPos({ top: r.bottom + 4, left: Math.max(8, r.right - 64) })
    setOpen(true)
  }
  useEffect(() => {
    if (!open) return
    const h = (e: MouseEvent) => {
      const t = e.target as Node
      if (!ref.current?.contains(t) && !popRef.current?.contains(t)) setOpen(false)
    }
    const scroll = (e: Event) => { if (!popRef.current?.contains(e.target as Node)) setOpen(false) }
    window.addEventListener('mousedown', h)
    window.addEventListener('scroll', scroll, true)
    window.addEventListener('resize', scroll)
    return () => {
      window.removeEventListener('mousedown', h)
      window.removeEventListener('scroll', scroll, true)
      window.removeEventListener('resize', scroll)
    }
  }, [open])
  return (
    <div className="relative h-full shrink-0" ref={ref}>
      <button type="button" onClick={() => (open ? setOpen(false) : openMenu())}
        className="flex h-full items-center gap-0.5 rounded-r-[5px] border-l border-warm-200 bg-warm-50 px-1.5
                   text-[11px] font-bold uppercase text-ink-2 transition-colors hover:bg-warm-100 hover:text-ink">
        {value || '—'}
        <ChevronDown size={10} className="text-warm-400" />
      </button>
      {open && pos && createPortal(
        <div ref={popRef} style={{ top: pos.top, left: pos.left, width: 64 }}
          className="fe-nueva fixed z-[95] rounded-md border border-line bg-surface py-1 shadow-ds-overlay">
          {options.map((o) => (
            <button key={o} type="button" onClick={() => { onChange(o); setOpen(false) }}
              className={`w-full px-2.5 py-1.5 text-left text-[12px] font-bold uppercase transition-colors hover:bg-warm-50
                ${o === value ? 'bg-warm-50 font-bold text-ink' : 'text-ink-2'}`}>
              {o}
            </button>
          ))}
        </div>,
        document.body,
      )}
    </div>
  )
}

/** one small bordered box holding a single MiniNum — for side-by-side L | B | H */
function MiniBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-8 min-w-0 flex-1 items-center rounded-md border border-warm-300 bg-surface transition-shadow
                    focus-within:border-brand-500 focus-within:ring-[3px] focus-within:ring-brand-500/20">
      {children}
    </div>
  )
}

/** non-interactive unit tag — for composites whose unit is derived elsewhere */
function UnitTag({ value }: { value: string }) {
  return (
    <span className="flex h-full shrink-0 items-center rounded-r-[5px] border-l border-warm-200 bg-warm-50 px-1.5
                     text-[11px] font-bold uppercase text-ink-3">
      {value || '—'}
    </span>
  )
}

/** borderless number cell inside a composite control */
function MiniNum({ value, placeholder, onChange }: {
  value: string; placeholder: string; onChange: (v: string) => void
}) {
  return (
    <input
      type="number" value={value} placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className="h-full w-full min-w-0 flex-1 bg-transparent px-1 text-center text-[13px] tabular-nums text-ink
                 placeholder:text-warm-400 focus:outline-none
                 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
    />
  )
}

/** the composite shell — one input-height border, orange focus ring for whatever is inside */
function Composite({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-8 items-center rounded-md border border-warm-300 bg-surface transition-shadow
                    focus-within:border-brand-500 focus-within:ring-[3px] focus-within:ring-brand-500/20">
      {children}
    </div>
  )
}

function TotalsStrip({ items }: { items: [string, string][] }) {
  return (
    <div className="mt-4 flex flex-wrap items-center gap-x-8 gap-y-2 border-t border-line pt-3">
      {items.map(([label, value]) => (
        <span key={label} className="text-[13.5px] text-ink-2">
          {label} <span className="ml-1.5 font-bold text-ink">{value}</span>
        </span>
      ))}
    </div>
  )
}

/** A dim separator between summary facts, so a collapsed row reads as one line. */
function Facts({ items }: { items: (string | null | undefined)[] }) {
  const shown = items.filter(Boolean) as string[]
  if (!shown.length) return <span className="text-[13px] text-ink-3">Not filled in yet</span>
  return (
    <span className="flex min-w-0 flex-wrap items-center gap-x-2.5 text-[13px] text-ink-2">
      {shown.map((t, i) => (
        <span key={i} className="flex items-center gap-2.5">
          {i > 0 && <span className="text-warm-300">·</span>}
          <span className="truncate">{t}</span>
        </span>
      ))}
    </span>
  )
}

/* --------------------------------------------------------------- the list ------ */

export function RepeatableList<T>({
  title, caption, cardLabel, rows, onAdd, onRemove, onDuplicate, incomplete, summary, body, totals,
  addNoun, bare, icon,
}: {
  title: string
  caption: string
  /** small brand-tinted icon shown before the section title */
  icon?: React.ReactNode
  cardLabel: (i: number) => string
  rows: T[]
  onAdd: () => void
  onRemove: (i: number) => void
  /** append a copy of row i (parent decides which fields reset, e.g. tracking number) */
  onDuplicate?: (i: number) => void
  incomplete: (r: T) => boolean
  summary: (r: T) => React.ReactNode
  body: (r: T, i: number) => React.ReactNode
  totals?: React.ReactNode
  addNoun: string
  /** drop the card chrome when the list already sits inside a panel (the modal tabs) */
  bare?: boolean
}) {
  // All rows stay expanded — adding never collapses what you were editing.
  // Rows can still be collapsed by hand (the summary line takes over).
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set())
  const pending = rows.filter(incomplete).length

  const isOpen = (i: number) => !collapsed.has(i)
  const toggleRow = (i: number) => setCollapsed((prev) => {
    const next = new Set(prev)
    if (next.has(i)) next.delete(i); else next.add(i)
    return next
  })
  const add = () => onAdd()          // the new row arrives expanded
  const duplicate = (i: number) => onDuplicate?.(i)
  const remove = (i: number) => {
    setCollapsed((prev) => new Set([...prev].filter((j) => j !== i).map((j) => (j > i ? j - 1 : j))))
    onRemove(i)
  }

  return (
    <section className={bare ? '' : 'rounded-xl border border-line bg-surface shadow-ds-1 overflow-hidden transition-all hover:border-warm-300'}>
      <div className={`flex items-start justify-between gap-4 ${bare ? '' : 'px-6 py-3.5 border-b border-line'}`}>
        <div>
          <div className="flex items-center gap-2">
            {icon}
            <h2 className="text-[14.5px] font-bold text-ink">{title}</h2>
            {rows.length > 0 && <span className="text-[13.5px] text-ink-3">{rows.length}</span>}
          </div>
          <p className="mt-0.5 max-w-[92ch] text-[12.5px] text-ink-3">{caption}</p>
        </div>
      </div>

      <div className={bare ? '' : 'px-6 py-5'}>
        {rows.length > 0 ? (
          <div className="grid gap-2">
            {rows.map((row, i) => {
              const rowOpen = isOpen(i)
              const bad = incomplete(row)
              return (
                <div key={i} className="overflow-hidden rounded-lg border border-line bg-surface">
                  {/* header doubles as the expand control — numbered badge + noun */}
                  <div className="flex items-center gap-3 bg-warm-25 px-4 py-2.5">
                    <button
                      type="button"
                      onClick={() => toggleRow(i)}
                      aria-expanded={rowOpen}
                      className="flex min-w-0 flex-1 items-center gap-2.5 text-left">
                      <ChevronDown
                        size={15}
                        className={`shrink-0 text-warm-400 transition-transform ${rowOpen ? '' : '-rotate-90'}`}
                      />
                      <span className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-md bg-warm-100 text-[11.5px] font-black text-ink-2">
                        {i + 1}
                      </span>
                      <span className="shrink-0 text-[13px] font-bold uppercase tracking-[0.04em] text-ink-2">
                        {cardLabel(i).replace(/\s*\d+$/, '')}
                      </span>
                      {!rowOpen && <span className="min-w-0 flex-1">{summary(row)}</span>}
                    </button>
                    {bad && (
                      <span className="shrink-0"><StatusPill label="Incomplete" tone="warning" /></span>
                    )}
                    {onDuplicate && (
                      <button
                        type="button" onClick={() => duplicate(i)} title={`Duplicate ${cardLabel(i)}`}
                        aria-label={`Duplicate ${cardLabel(i)}`}
                        className="shrink-0 text-warm-400 transition-colors hover:text-ink">
                        <Copy size={15} />
                      </button>
                    )}
                    <button
                      type="button" onClick={() => remove(i)} aria-label={`Remove ${cardLabel(i)}`}
                      className="shrink-0 text-warm-400 transition-colors hover:text-brand-500">
                      <CircleMinus size={17} />
                    </button>
                  </div>
                  {rowOpen && <div className="border-t border-line/70 px-4 pt-4 pb-4">{body(row, i)}</div>}
                </div>
              )
            })}
            {/* the add affordance always sits at the BOTTOM, where the next row lands */}
            <button
              type="button" onClick={add}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-warm-300 py-3
                         text-[13px] font-bold text-brand-500 transition-colors hover:border-brand-500 hover:bg-warm-50">
              <Plus size={14} /> Add {addNoun}
            </button>
          </div>
        ) : (
          /* empty list — the add action lives right where the rows will appear */
          <button
            type="button" onClick={add}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-warm-300 py-6
                       text-[13px] font-bold text-brand-500 transition-colors hover:border-brand-500 hover:bg-warm-50">
            <Plus size={14} /> Add {addNoun}
            <span className="font-normal text-ink-3">— none added yet</span>
          </button>
        )}

        {pending > 0 && (
          <p className="mt-3 text-[12px] text-ink-3">
            {pending} of {rows.length} {addNoun.toLowerCase()}
            {pending === 1 ? '' : 's'} still {pending === 1 ? 'needs' : 'need'} required fields.
          </p>
        )}

        {totals}
      </div>
    </section>
  )
}

/* ---------------------------------------------------------------------- SKU ---- */

/** collapsed-row chip */
function SumChip({ children }: { children: React.ReactNode }) {
  return (
    <span className="shrink-0 whitespace-nowrap rounded-full bg-warm-100 px-2 py-0.5 text-[11.5px] font-bold tabular-nums text-ink-2">
      {children}
    </span>
  )
}

export const SkuSummary = (r: SkuRow) => {
  const dims = [r.length, r.width, r.height].every((v) => v.trim())
    ? `${r.length} × ${r.width} × ${r.height} ${r.uom.toLowerCase()}` : null
  const identity = r.name.trim() || r.code
  if (!identity && !r.quantity.trim() && !dims && !r.weight.trim()) {
    return <span className="text-[13px] text-ink-3">Not filled in yet</span>
  }
  return (
    <span className="flex min-w-0 items-center gap-2 text-[13px]">
      <span className="min-w-0 truncate">
        <span className="font-bold text-ink">{identity || '—'}</span>
        {r.code && r.name.trim() && <span className="ml-1.5 text-[12px] text-ink-3">{r.code}</span>}
        {r.description.trim() && <span className="ml-1.5 text-[12px] text-ink-3">— {r.description.trim()}</span>}
      </span>
      {r.quantity.trim() && <SumChip>Qty {r.quantity}</SumChip>}
      {dims && <SumChip>{dims}</SumChip>}
      {r.weight.trim() && <SumChip>{r.weight} {r.weightUom.toLowerCase()}</SumChip>}
      {r.unitCost.trim() && <SumChip>${r.unitCost}</SumChip>}
    </span>
  )
}

export function SkuBody({ row, onChange, master, hidden = () => false }: {
  row: SkuRow; onChange: (k: keyof SkuRow, v: string) => void
  /** live SKU master rows — drive the Code options and dimension autofill */
  master?: SkuMasterRow[]
  /** Base Modules field visibility (registry keys: skuDescription, skuDimensions, …) */
  hidden?: (key: string) => boolean
}) {
  const codes = master?.length
    ? master.filter((m) => m.enabled).map((m) => m.skuCode)
    : ['LPN04', 'LPN13', 'LPNHAZ01']   // fallback until the master loads / when it is empty
  const catOptions = [...new Set((master ?? []).map((x) => x.skuCategory).filter(Boolean))]
  const pick = (code: string) => {
    onChange('code', code)
    const m = master?.find((x) => x.skuCode === code)
    if (!m) return
    if (m.skuCategory) onChange('category', m.skuCategory)
    // master record fills what the user has not typed yet; UOMs follow the master
    if (m.uomDimensions) onChange('uom', m.uomDimensions)
    if (m.uomWeight) onChange('weightUom', m.uomWeight)
    if (!row.description.trim() && m.description) onChange('description', m.description)
    if (!row.weight.trim() && m.weight != null) onChange('weight', String(m.weight))
    if (!row.length.trim() && m.length != null) onChange('length', String(m.length))
    if (!row.width.trim() && m.breadth != null) onChange('width', String(m.breadth))
    if (!row.height.trim() && m.height != null) onChange('height', String(m.height))
  }
  return (
    <div className="grid grid-cols-2 gap-x-5 gap-y-4 sm:grid-cols-3 xl:grid-cols-7">
      {/* line 1 — identity */}
      <Fld label="Line Item No" required>
        <Input value={row.lineItemNo} placeholder="eg, 1" onChange={(v) => onChange('lineItemNo', v)} />
      </Fld>
      <Fld label="Code" required>
        <MenuSelect
          value={row.code} placeholder=" " options={codes}
          onChange={pick}
        />
      </Fld>
      <Fld label="Name" required>
        <Input value={row.name} placeholder="eg, Reserve" onChange={(v) => onChange('name', v)} />
      </Fld>
      {!hidden('skuCategory') && <Fld label="Category">
        <MenuSelect
          value={row.category} placeholder="eg, Bulky" searchable creatable
          options={catOptions}
          onChange={(v) => onChange('category', v)}
        />
      </Fld>}
      {!hidden('skuDescription') && <Fld label="Description">
        <Input
          value={row.description} placeholder="eg, Water Bottle"
          onChange={(v) => onChange('description', v)}
        />
      </Fld>}
      {!hidden('skuHsn') && <Fld label="HSN Code">
        {/* taxation identifier — hsnName in the create API */}
        <Input value={row.hsnCode} placeholder="eg, 220429" onChange={(v) => onChange('hsnCode', v)} />
      </Fld>}
      {!hidden('skuImage') && <Fld label="Image Url">
        <Input value={row.imageUrl} placeholder="eg, https://…" onChange={(v) => onChange('imageUrl', v)} />
      </Fld>}

      {/* line 2 — measures: dimensions and weight carry their unit INSIDE the
          control, so the whole SKU fits two rows. Breadth's state key stays
          `width` (the create API's field name — do not rename). */}
      {!hidden('skuDimensions') && <Fld label="Dimensions — L × B × H" required className="col-span-2">
        <div className="flex items-center gap-1.5">
          <MiniBox><MiniNum value={row.length} placeholder="L" onChange={(v) => onChange('length', v)} /></MiniBox>
          <span className="shrink-0 text-[11px] text-warm-400">×</span>
          <MiniBox><MiniNum value={row.width} placeholder="B" onChange={(v) => onChange('width', v)} /></MiniBox>
          <span className="shrink-0 text-[11px] text-warm-400">×</span>
          <MiniBox><MiniNum value={row.height} placeholder="H" onChange={(v) => onChange('height', v)} /></MiniBox>
          <div className="flex h-8 shrink-0 items-center overflow-visible rounded-md border border-warm-300 bg-surface">
            <UnitPick value={row.uom} options={['CM', 'IN', 'M']} onChange={(v) => onChange('uom', v)} />
          </div>
        </div>
      </Fld>}
      {!hidden('skuWeight') && <Fld label="Weight" required>
        <Composite>
          <MiniNum value={row.weight} placeholder="eg, 10" onChange={(v) => onChange('weight', v)} />
          <UnitPick value={row.weightUom} options={['KG', 'LBS', 'G']} onChange={(v) => onChange('weightUom', v)} />
        </Composite>
      </Fld>}
      <Fld label="Quantity" required>
        <Input type="number" value={row.quantity} placeholder="eg, 1" onChange={(v) => onChange('quantity', v)} />
      </Fld>
      {!hidden('skuUnitCost') && <Fld label="Unit Cost">
        <Input type="number" value={row.unitCost} placeholder="eg, 12.34" onChange={(v) => onChange('unitCost', v)} />
      </Fld>}
      {!hidden('skuDimensions') && <Fld label="Volume">
        {/* derived from L x B x H, read-only as on staging */}
        <DerivedBox value={volumeOf(row) ? fmt(volumeOf(row)) : '—'} />
      </Fld>}
    </div>
  )
}

export function SkuTotals({ rows }: { rows: SkuRow[] }) {
  const wUom = rows[0]?.weightUom || '-'
  const vUom = rows[0]?.uom ? `${rows[0].uom}³` : '-'
  const weight = rows.reduce((a, r) => a + num(r.weight) * (num(r.quantity) || 1), 0)
  const volume = rows.reduce((a, r) => a + volumeOf(r) * (num(r.quantity) || 1), 0)
  const cost = rows.reduce((a, r) => a + num(r.unitCost) * (num(r.quantity) || 1), 0)
  return (
    <TotalsStrip items={[
      [`Total Weight (${wUom})`, fmt(weight)],
      [`Total Volume (${vUom})`, fmt(volume)],
      ['Total Cost ($)', fmt(cost)],
    ]} />
  )
}

/* ------------------------------------------------------------------ Package ---- */

/**
 * The Package section rides the same RepeatableList as SKU and VAS — identical header
 * band, accordion rows, add affordance and totals strip — so the form reads as one
 * design. What is package-specific lives inside the row body: the labeled field grid
 * plus the contents table saying which SKU lines are packed in the box.
 */
export function PackageBoxes({ rows, skuInfo, units, caption, onAdd, onDuplicate, onRemove, onChange, onContents, bare, packageTypes, hidden }: {
  rows: PackageRow[]
  skuInfo: SkuPackInfo[]
  units: { weight: string; length: string }
  /** live packageType master rows — drive the Type options and dimension autofill */
  packageTypes?: MasterRecord[]
  /** Base Modules field visibility (registry keys: pkgTracking, pkgDimensions, …) */
  hidden?: (key: string) => boolean
  caption: string
  onAdd: () => void
  onDuplicate: (i: number) => void
  onRemove: (i: number) => void
  onChange: (i: number, k: Exclude<keyof PackageRow, 'contents'>, v: string) => void
  onContents: (i: number, contents: PackageContent[]) => void
  bare?: boolean
}) {
  const dim = units.length.toLowerCase()
  const summary = (r: PackageRow) => (
    <Facts items={[
      r.type || null,
      r.quantity.trim() && `Qty ${r.quantity}`,
      (r.length.trim() || r.width.trim() || r.height.trim()) &&
        `${r.length || 0} × ${r.width || 0} × ${r.height || 0} ${dim}`,
      r.weight.trim() && `${r.weight} ${units.weight}`,
      r.trackingNumber.trim() || null,
    ]} />
  )
  return (
    <RepeatableList
      bare={bare} title="Package" addNoun="Package"
      icon={<PackageIcon size={15} className="text-brand-500" />}
      caption={caption}
      cardLabel={(i) => `Package ${i + 1}`}
      rows={rows} incomplete={packageIncomplete} summary={summary}
      onAdd={onAdd} onRemove={onRemove} onDuplicate={onDuplicate}
      body={(row, i) => (
        <PackageBody
          row={row} skuInfo={skuInfo} units={units} packageTypes={packageTypes} hidden={hidden}
          onChange={(k, v) => onChange(i, k, v)}
          onContents={(c) => onContents(i, c)}
        />
      )}
      totals={rows.length > 0 ? <PackageTotals rows={rows} skuInfo={skuInfo} units={units} /> : undefined}
    />
  )
}

function PackageBody({ row, skuInfo, units, packageTypes, onChange, onContents, hidden = () => false }: {
  row: PackageRow
  skuInfo: SkuPackInfo[]
  units: { weight: string; length: string }
  packageTypes?: MasterRecord[]
  onChange: (k: Exclude<keyof PackageRow, 'contents'>, v: string) => void
  onContents: (contents: PackageContent[]) => void
  hidden?: (key: string) => boolean
}) {
  const vol = volumeOf(row)
  const dim = (row.dimensionUom || units.length).toLowerCase()
  const wUom = row.weightUom || units.weight
  const typeRows = packageTypes?.filter((t) => t.enabled) ?? []
  const typeOptions = typeRows.length ? typeRows.map((t) => String(t.code)) : ['Carton', 'Pallet', 'Box', 'Bag']
  const typeLabel = (v: string) => {
    const t = typeRows.find((x) => String(x.code) === v)
    return t ? `${String(t.name)} (${v})` : v
  }
  // picking a standard package fills every measurement the master knows
  const pickType = (code: string) => {
    onChange('type', code)
    const t = typeRows.find((x) => String(x.code) === code)
    if (!t) return
    if (t.length != null) onChange('length', String(t.length))
    if (t.breadth != null) onChange('width', String(t.breadth))
    if (t.height != null) onChange('height', String(t.height))
    if (t.weight != null) onChange('weight', String(t.weight))
    if (t.unitOfMeasure) onChange('dimensionUom', String(t.unitOfMeasure))
    if (t.weightUom) onChange('weightUom', String(t.weightUom))
  }
  // units typed against a SKU line -> the contents array (0/empty removes the line)
  const unitsFor = (lineItemNo: string) =>
    row.contents.find((c) => c.lineItemNo === lineItemNo)?.qty ?? ''
  const setUnits = (lineItemNo: string, qty: string) => {
    const rest = row.contents.filter((c) => c.lineItemNo !== lineItemNo)
    onContents(qty.trim() && Number(qty) > 0 ? [...rest, { lineItemNo, qty }] : rest)
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-x-5 gap-y-4 sm:grid-cols-3 xl:grid-cols-6">
        {/* line 1 — identity */}
        <Fld label="Package Id">
          <Input value={row.packageId} placeholder="eg, PKGA1B2C3" onChange={(v) => onChange('packageId', v)} />
        </Fld>
        {!hidden('pkgTracking') && <Fld label="Tracking Number">
          <Input value={row.trackingNumber} placeholder="auto if empty" onChange={(v) => onChange('trackingNumber', v)} />
        </Fld>}
        <Fld label="Type" required>
          <MenuSelect value={row.type} placeholder="Pick a standard package" searchable
            options={typeOptions} labels={typeLabel} onChange={pickType} />
        </Fld>
        <Fld label="Quantity" required>
          <Input type="number" value={row.quantity} placeholder="eg, 1" onChange={(v) => onChange('quantity', v)} />
        </Fld>
        {!hidden('pkgPalletSpace') && <Fld label="Pallet Space">
          <Input type="number" value={row.palletSpace} placeholder="eg, 1" onChange={(v) => onChange('palletSpace', v)} />
        </Fld>}
        {!hidden('pkgDescription') && <Fld label="Description">
          <Input value={row.description} placeholder="eg, Fragile glassware" onChange={(v) => onChange('description', v)} />
        </Fld>}

        {/* line 2 — measures, units riding inside the controls (from the SKU rows) */}
        {!hidden('pkgDimensions') && <Fld label="Dimensions — L × W × H" className="col-span-2">
          <div className="flex items-center gap-1.5">
            <MiniBox><MiniNum value={row.length} placeholder="L" onChange={(v) => onChange('length', v)} /></MiniBox>
            <span className="shrink-0 text-[11px] text-warm-400">×</span>
            <MiniBox><MiniNum value={row.width} placeholder="W" onChange={(v) => onChange('width', v)} /></MiniBox>
            <span className="shrink-0 text-[11px] text-warm-400">×</span>
            <MiniBox><MiniNum value={row.height} placeholder="H" onChange={(v) => onChange('height', v)} /></MiniBox>
            <div className="flex h-8 shrink-0 items-center rounded-md border border-warm-300 bg-surface">
              <UnitTag value={dim === '-' ? '' : dim} />
            </div>
          </div>
        </Fld>}
        {!hidden('pkgWeight') && <Fld label="Weight">
          <Composite>
            <MiniNum value={row.weight} placeholder="eg, 10" onChange={(v) => onChange('weight', v)} />
            <UnitTag value={wUom === '-' ? '' : wUom} />
          </Composite>
        </Fld>}
        {!hidden('pkgDimensions') && <Fld label={`Volume (${dim}³)`}>
          {/* derived from L x W x H, read-only — same treatment as the SKU volume */}
          <DerivedBox value={vol ? fmt(vol) : '—'} />
        </Fld>}
      </div>

      {/* what's packed — EVERY SKU line is listed; type the units that go in
          this box (clearing removes the line). No add/remove ceremony. */}
      <div className="mt-4 overflow-hidden rounded-md border border-line bg-surface">
        {skuInfo.length === 0 ? (
          <p className="px-4 py-3 text-[13px] text-ink-3">
            Add SKU lines above first — a package holds units of the order's SKUs.
          </p>
        ) : (
          <>
            <div className="flex items-center justify-between border-b border-line/70 bg-warm-25 px-4 py-2">
              <span className="text-[11px] font-bold uppercase tracking-wide text-ink-3">Pack SKUs into this box</span>
              <span className="text-[11px] font-bold uppercase tracking-wide text-ink-3">Units in this box<span className="text-brand-500">*</span></span>
            </div>
            {skuInfo.map((info) => {
              const val = unitsFor(info.lineItemNo)
              const over = info.packed > info.ordered
              return (
                <div key={info.lineItemNo}
                  className={`flex items-center gap-3 border-b border-line/50 px-4 py-2 last:border-b-0 transition-colors ${val ? 'bg-warm-50' : ''}`}>
                  <span className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-md bg-warm-100 text-[11.5px] font-black text-ink-2">
                    {info.lineItemNo}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] text-ink">
                      {info.label.replace(`#${info.lineItemNo} `, '') || <span className="text-ink-3">SKU line {info.lineItemNo}</span>}
                    </span>
                    {(info.description || info.dims || info.weight) && (
                      <span className="block truncate text-[12px] tabular-nums text-ink-3">
                        {[info.description, info.dims, info.weight].filter(Boolean).join(' · ')}
                      </span>
                    )}
                  </span>
                  <span className={`shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 text-[11.5px] font-bold tabular-nums
                    ${over ? 'bg-danger-bg text-danger-fg' : info.packed === info.ordered && info.ordered > 0 ? 'bg-success-bg text-success-fg' : 'bg-warm-100 text-ink-3'}`}>
                    {fmt(info.packed)} / {fmt(info.ordered)} packed{over ? ' — over' : ''}
                  </span>
                  <div className="w-24 shrink-0">
                    <Input type="number" value={val} placeholder="0"
                      onChange={(v) => setUnits(info.lineItemNo, v)} />
                  </div>
                </div>
              )
            })}
          </>
        )}
      </div>
    </>
  )
}

function PackageTotals({ rows, skuInfo, units }: {
  rows: PackageRow[]; skuInfo: SkuPackInfo[]; units: { weight: string; length: string }
}) {
  const totalWeight = rows.reduce((a, r) => a + num(r.weight) * (num(r.quantity) || 1), 0)
  const totalVolume = rows.reduce((a, r) => a + volumeOf(r) * (num(r.quantity) || 1), 0)
  const tone = (s: SkuPackInfo) =>
    s.packed === 0 ? 'bg-warm-100 text-ink-3'
      : s.packed < s.ordered ? 'bg-warning-bg text-warning-fg'
        : s.packed === s.ordered ? 'bg-success-bg text-success-fg'
          : 'bg-danger-bg text-danger-fg'
  return (
    <>
      <TotalsStrip items={[
        [`Total Weight (${units.weight})`, fmt(totalWeight)],
        [`Total Volume (${units.length}³)`, fmt(totalVolume)],
      ]} />
      {skuInfo.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-[12px] text-ink-3">Packing status</span>
          {skuInfo.map((s) => (
            <span key={s.lineItemNo}
              title={`${s.label}: ${fmt(s.packed)} of ${fmt(s.ordered)} ordered units packed`}
              className={`rounded-full px-2.5 py-0.5 text-[11.5px] font-bold ${tone(s)}`}>
              {s.label} · {fmt(s.packed)}/{fmt(s.ordered)}
            </span>
          ))}
        </div>
      )}
    </>
  )
}

/* ---------------------------------------------------------------------- VAS ---- */

export const VasSummary = (r: VasRow) => (
  <Facts items={[
    r.service || null,
    r.level || null,
    r.skuLineItemNo && `#${r.skuLineItemNo}`,
    r.serviceTime.trim() && `${r.serviceTime} min`,
    r.remark.trim() || null,
  ]} />
)

export function VasBody({ row, skuOptions, services, onChange }: {
  row: VasRow; skuOptions: string[]
  /** live vas master rows — drive the Service options and default-time autofill */
  services?: MasterRecord[]
  onChange: (k: keyof VasRow, v: string) => void
}) {
  const svcRows = services?.filter((v) => v.enabled) ?? []
  const svcOptions = svcRows.length
    ? svcRows.map((v) => String(v.code))
    : ['ROOM_OF_CHOICE', 'INSTALL', 'ASSEMBLE', 'HAUL_AWAY']
  const svcLabel = (v: string) => String(svcRows.find((x) => String(x.code) === v)?.name ?? v)
  const pickService = (code: string) => {
    onChange('service', code)
    const m = svcRows.find((x) => String(x.code) === code)
    if (m?.serviceTimeDefault != null && !Number(row.serviceTime)) onChange('serviceTime', String(m.serviceTimeDefault))
  }
  return (
    <div className="grid grid-cols-2 gap-x-5 gap-y-4 sm:grid-cols-3 xl:grid-cols-6">
      <Fld label="VAS Added Level" required>
        <MenuSelect
          value={row.level} options={['SKU', 'PACKAGE', 'CONSIGNMENT']}
          onChange={(v) => onChange('level', v)}
        />
      </Fld>
      <Fld label="SKU Line Item No" required>
        <MenuSelect
          value={row.skuLineItemNo} placeholder=" " options={skuOptions}
          onChange={(v) => onChange('skuLineItemNo', v)}
        />
      </Fld>
      <Fld label="Service" required>
        <MenuSelect
          value={row.service} placeholder=" " searchable
          options={svcOptions} labels={svcLabel}
          onChange={pickService}
        />
      </Fld>
      <Fld label="Service Time (mins)" required>
        <Input type="number" value={row.serviceTime} placeholder="eg, 10" onChange={(v) => onChange('serviceTime', v)} />
      </Fld>
      <Fld label="Remark" className="col-span-2">
        <Input value={row.remark} placeholder="eg, Call before install" onChange={(v) => onChange('remark', v)} />
      </Fld>
    </div>
  )
}
