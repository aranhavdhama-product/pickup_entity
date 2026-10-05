/**
 * Add Consignment v2 — `/local/consignments/new` (+ `/new/vehicle`), the console's logical Add Consignment
 * (owner, 2026-09-29). A COPY of `GrowOrders/AddOrderPage.tsx` (the staging replica at `/add`, untouched):
 * same OrderDraft shape, re-ordered by dependency for the least scroll. The list's Add ▾ offers it first.
 *
 *   1 Consignment details — Merchant first, Order / Reference / Consignment Number (no fallback to the
 *     Reference), Consignment Type (it drives the ends: Reverse swaps them, Transfer = hub → hub, RTO /
 *     payment only where they apply, Exchange requires its order no., Service = goods optional), ship-by, payment.
 *   2 Ship From → Ship To — each end = a saved-address picker (merchant addresses / address book / hubs by type)
 *     read back as a card; Add / Edit in a popup (Contact · Address, "Save this address" to the matching list;
 *     Cancel restores). The address order is how people write one: Name · Company · Contact · Email · Line 1-3 ·
 *     Landmark · Country · Postal Code · Suburb · City · State · coordinates · floor; optional ones wait behind
 *     "More address details" and appear IN PLACE. Windows on the card; Scheduling Confirmation beside the
 *     delivery window; RTO as a compact choice. Then SHIPMENT LEGS on one line (shipmentLegs.ts: the owner's
 *     14-case table → one of 8 movement types, shown in words; Edit legs switches the hub stops = skip FM
 *     inbound / skip LM; case 7's one-vehicle pick & deliver). A pickup request is booked only with a Pickup leg.
 *   3 Package & SKU — in the account's ONE way (builder: "How goods are entered"): SKU-based (SKU + quantity,
 *     master or typed NEW SKU) · SKUs, then packages · packages with their SKUs; one derived list `goods`.
 *   3½ Handling — its own card: Order Category chips · Barcode on every box · Delivered in parts · Clearance · Tags.
 *   4 Service & instructions — Service Type · Load type (free: every service allows both since 2026-09-29) ·
 *     Vehicle Type (Ship From hub) · Total Loading Time, then Special Instructions + value-added services (one row
 *     each, on a package or a SKU). (FTL: this card BEFORE Vehicle Details.) Label Format is in Consignment details,
 *     Clearance on the Handling row, RTO a single "same as Ship From" toggle.
 *   5 Carriers — last, names only.
 *
 * Footer: Switch to Simplified — the original quick tier, restyled, not customisable.
 * Form builder (Edit consignment form): the live form is its own preview — rename · Required · More · hide per
 * field, an eye to show / leave out hidden ones; locks for the system's mandatory fields and the fields this form
 * needs. Rules = a v2-ONLY key (`fe-consignment-form-v2-rules`) over the shared config — /add, Grow and the list
 * never change. Errors appear only after an Add Order attempt. Labels 13px ink (owner exception to the type scale).
 * Deep links: `?draft=`, `?fromPickup=`, `?fromOverage=`, `?step=1|2` (packages / carriers).
 */
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ComponentProps, type KeyboardEvent, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import {
  Check, ChevronDown, ChevronLeft, ChevronUp, CircleMinus, Eye, EyeOff, Info, Lock, MapPinned, Package, Pencil, Plus, RotateCcw,
  Bookmark, ScanBarcode, SlidersHorizontal, Trash2, Truck, X, Crown, Flame, GlassWater, Layers, Users, Weight, Monitor, Store, Asterisk, Regex, ListCollapse,
} from 'lucide-react'
import { blankParty, CURRENCY } from '../../growOrders/seed'
import { growOrderActions, orderById, pickupRequestById, useGrowOrders } from '../../growOrders/store'
import { addressBookActions } from '../../growOrders/addressBook'
import type { Party } from '../../growOrders/types'
import {
  currentMerchant, ownPackageTypes, packageTypesForMerchant, setMerchantCode, useMasters, useMerchantCode,
  vehicleTypeOf, vehicleTypesFor, loadMasters, type PackageType, type SkuItem,
} from '../../growOrders/masters'
import { toast } from '../../nueva/toast'
import {
  Button, DateInput, Input, MenuSelect, Modal, MultiSelectDropdown, Toggle, SearchInput, Tooltip,
} from '../../nueva/components'
import {
  AddMoreButton, PhoneInput, RadioCard, RowCard, SwitchField, TimeBox, UnitBox,
} from '../../components/consignmentForm'
import { money, OTHER_ADDRESS, partyOk, prWindow, storeOptionLabel } from '../GrowOrders/utils'
import { hubName, inboundHubFor, INBOUND_HUBS } from '../../growOrders/hubs'
import { usePickupLocations, useReceiverBook } from '../GrowOrders/pickupLocations'
import {
  hasPickupLeg, legsOf, legsOfMovement, movementOfLegs, MOVEMENT_TYPES, type LegChoice, type LegKind, type MovementType, type RouteEnd,
} from './shipmentLegs'
import {
  ADDITIONAL_SERVICES, DEFAULT_FTL_SERVICE, DRAFT_KEY, FTL_SERVICE_CODES, FTL_SERVICE_TYPES, PARCEL_SERVICES, SERVICE_TYPES, VEHICLE_SPECS,
  clearDraftKeys, draftFromOrder, loadTypeOf, ftlQuoteVehicles, ftlServiceType, setDraftSidecar, totalLoadKg, vehiclesFor,
  vehiclesOf, type ConsignmentFields, type CustomFieldValue, type FtlVehicle, type OrderDraft, type Parcel, type ParcelItem, type VasLine,
} from '../../growOrders/draft'
import {
  CUSTOM_FIELD_CARDS, CUSTOM_FIELD_KINDS, DEFAULT_GOODS_SETTING, FORMAT_PRESETS, formatError, formatMessage, formatSummary, growRules, isCustomKey,
  loadCustomFields, loadGoodsSetting, loadRules, newCustomKey, patternError, saveCustomFields, saveGoodsSetting, saveRules, withoutKeys,
  type CustomFieldCard, type CustomFieldDef, type CustomFieldKind, type FieldFormat, type FieldRuleV2, type FormatPreset, type FormRulesV2,
  type GoodsSetting,
} from './formSetup'
import { usePickupModuleConfig } from '../../config/pickupModule'
import { hubVehicleTypes } from '../../config/vehicleConfig'
import { autoPickupWindowFor, pickupPolicy, policyCheck, userWindowError } from '../../growOrders/pickupSlots'
import {
  bookableServices, chargeableKg, currencyForHub, laneReady, quoteLane, quoteService, shipFromHubOf, vasPrice as laneVasPrice,
  vehicleRate, zoneParties,
} from '../../growOrders/rates'
import { SlotWindowFields } from '../LocalPickup/slotFields'
import { packageReady } from '../GrowOrders/packageModel'
import { windowOk as slotWindowOk } from '../GrowOrders/utils'
import { ServiceTypeChooser, type BookingMode, type FleetVehicle } from '../GrowOrders/serviceCards'
/* the console's field registry — pure module, read-only here */
import { byKeyMandatory, CONSIGNMENT_FIELDS, fieldLabel, loadFieldConfig, loadFormBehavior, type FieldDef } from '../ConsignmentAdd/fieldConfig'


/* ---- option lists ---- */
const CONSIGNMENT_TYPES = ['Forward', 'Reverse', 'Exchange', 'Transfer', 'Service']
const PAYMENT_MODES = ['Prepaid', 'COD', 'To Pay']
const LABEL_FORMATS = ['PDF', 'ZPL']
/** sample Tag Master — the portal has no tag API */
const TAG_OPTIONS = ['Ambient', 'Priority', 'Gift', 'B2B', 'Weekend Delivery', 'Bulky']
const RTO_MODES = ['Same As Ship From', 'Use Different Address']
const DIAL_CODES = ['+63', '+27', '+264', '+267', '+1', '+44', '+91']
const DIM_UOMS = ['CM', 'IN', 'M']
const WEIGHT_UOMS = ['KG', 'LB', 'G']
const CARRIERS = [
  { code: '2GO Express', sub: 'Parcel network · LTL' },
  { code: '2GO Logistics', sub: 'Dedicated trucks · FTL' },
]
/** sample VAS master — the portal has no vas API */
const VAS_SERVICES = ['Installation', 'Assembly', 'Unboxing', 'Old Item Pickup', 'Gift Wrapping', 'Wall Mounting',
  /* the former FTL "Additional Services" — now ordinary VAS options, priced by the rate card */
  ...ADDITIONAL_SERVICES.map((a) => a.code)]
/** rate-card price of a VAS option (only the former Additional Services carry one) */
const vasPrice = (service: string) => ADDITIONAL_SERVICES.find((a) => a.code === service)?.price ?? 0
const VAS_OPTS = VAS_SERVICES.map((v) => ({ value: v, label: vasPrice(v) ? `${v} · ${money(vasPrice(v), CURRENCY)}` : v }))

/** One Vehicle Details row: a vehicle type booked `count` times, sharing `loadKg`, to `addressIdx`. */
interface VehicleRow { vehicleType: string; count: number; loadKg: number; addressIdx: number[] }
/** Consecutive identical vehicles (type + addresses) fold into one row with a count. */
function rowsOf(vs: FtlVehicle[]): VehicleRow[] {
  const rows: VehicleRow[] = []
  for (const v of vs) {
    const last = rows[rows.length - 1]
    if (last && last.vehicleType === v.vehicleType && last.addressIdx.join() === v.addressIdx.join()) { last.count += 1; last.loadKg += v.actualLoadKg }
    else rows.push({ vehicleType: v.vehicleType, count: 1, loadKg: v.actualLoadKg, addressIdx: [...v.addressIdx] })
  }
  return rows
}
/** …and expand back into one FtlVehicle per vehicle, the shape the draft and the rate card read. */
const vehiclesOfRows = (rows: VehicleRow[]): FtlVehicle[] => rows.flatMap((r) =>
  Array.from({ length: Math.max(1, r.count) }, () => ({ vehicleType: r.vehicleType, actualLoadKg: r.loadKg / Math.max(1, r.count), addressIdx: r.addressIdx })))
const POSTCODES = ['1000', '1105', '1300', '1600', '4000', '5000', '6000', '6014', '6015', '8000']
const STATES = ['Eastern Cape', 'Free State', 'Gauteng', 'KwaZulu-Natal', 'Limpopo', 'Mpumalanga', 'North West', 'Northern Cape', 'Western Cape', 'Metro Manila', 'Laguna', 'Cebu', 'Iloilo']
const COUNTRIES = ['Philippines', 'South Africa', 'Namibia', 'Botswana']
/** WHAT the goods are — decides `pkg.kind` (the Package Type is what they are IN). */
const CARGO_TYPES = ['Parcel', 'Document', 'Fragile', 'Perishable', 'Bulky']
const CUSTOM_PACKAGE = '__custom__'
const CUSTOM_PACKAGE_NAME = 'Custom'
const opts = (xs: readonly string[]) => xs.map((value) => ({ value }))
const SERVICES = PARCEL_SERVICES

const today = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
/** staging mints the package id on insert */
const newPackageId = () => `PKG${Math.random().toString(36).slice(2, 8).toUpperCase()}`
const blankItem = (): ParcelItem => ({ skuCode: null, name: '', quantity: 1, weightKg: 0 })
const newParcel = (): Parcel => ({
  packageId: newPackageId(),
  cargoType: CARGO_TYPES[0], packageTypeCode: CUSTOM_PACKAGE, packageTypeName: CUSTOM_PACKAGE_NAME,
  items: [], itemInfo: '', quantity: 1, weight: 1, l: 10, w: 10, h: 10, weightMode: 'auto',
  trackingNumber: '', palletSpace: '', description: '',
})
const newVas = (): VasLine => ({ level: 'SKU', skuCode: '', service: '', serviceTimeMin: 0, remark: '' })
/* owner, 2026-09-29: a service is added to a PACKAGE or a SKU (a full-vehicle booking: the whole booking) */
const vasOk = (v: VasLine) => !!v.level && !!v.service && (v.level !== 'SKU' || !!v.skuCode) && (v.level !== 'PACKAGE' || !!v.packageId)
const round2 = (n: number) => Number(n.toFixed(2))
const filled = (v: string | undefined) => !!(v ?? '').trim()

function packageValue(p: Parcel, types: PackageType[]): string {
  if (p.packageTypeCode && types.some((t) => t.code === p.packageTypeCode)) return p.packageTypeCode
  const name = (p.packageTypeName ?? '').trim().toLowerCase()
  return (name ? types.find((t) => t.name.toLowerCase() === name)?.code : undefined) ?? CUSTOM_PACKAGE
}
const itemsWeight = (items: ParcelItem[] = []) => items.reduce((n, it) => n + it.weightKg * it.quantity, 0)
const autoWeight = (p: Parcel, types: PackageType[]) =>
  (types.find((t) => t.code === p.packageTypeCode)?.weightKg ?? 0) + itemsWeight(p.items)
/** Re-derive a package's weight after its SKUs or packaging changed; a typed weight is never touched. */
function reweigh(p: Parcel, types: PackageType[]): Parcel {
  if (p.weightMode === 'manual') return p
  const w = autoWeight(p, types)
  return w > 0 ? { ...p, weight: round2(w), weightMode: 'auto' } : { ...p, weightMode: 'auto' }
}
const isBlankItem = (it: ParcelItem) => !it.skuCode && !it.name.trim()
const codeFor = (p: Party) => (p.businessName || p.name || p.city || 'store')
  .toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 14) || 'STORE'
const itemInfoOf = (p: Parcel) =>
  (p.items?.length ? p.items.map((it) => it.name.trim()).filter(Boolean).join(', ') : p.itemInfo)
/** 'YYYY-MM-DDTHH:mm' → its date / time halves */
const dateOf = (at?: string) => (at ? at.slice(0, 10) : '')
const timeOf = (at?: string) => (at && at.length >= 16 ? at.slice(11, 16) : '')

/* ----------------------------------------------------------- autocomplete ---- */

/**
 * Keyboard + portaled-popover state for the two autocompletes (SKU Code,
 * address book). The list is portaled to <body> — SectionCard and
 * RepeatableList rows are overflow-hidden — so "outside" means outside BOTH
 * the anchor and the popover, the way MenuSelect checks its popRef.
 */
function useAutocomplete<T>(hits: T[], onPick: (x: T) => void) {
  const [open, setOpenState] = useState(false)
  const [hi, setHi] = useState(0)
  const [pos, setPos] = useState<{ top?: number; bottom?: number; left: number; width: number; maxHeight: number } | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  const popRef = useRef<HTMLDivElement>(null)
  const setOpen = (v: boolean) => {
    if (v) {
      const r = ref.current?.getBoundingClientRect()
      if (!r) return
      const below = window.innerHeight - r.bottom
      const up = below < 220 && r.top > below
      setPos(up
        ? { bottom: window.innerHeight - r.top + 4, left: r.left, width: Math.max(r.width, 320), maxHeight: Math.min(320, r.top - 12) }
        : { top: r.bottom + 4, left: r.left, width: Math.max(r.width, 320), maxHeight: Math.min(320, below - 12) })
    }
    setOpenState(v)
  }
  useEffect(() => {
    if (!open) return
    const click = (e: MouseEvent) => {
      const t = e.target as Node
      if (!ref.current?.contains(t) && !popRef.current?.contains(t)) setOpenState(false)
    }
    const scroll = (e: Event) => { if (!popRef.current?.contains(e.target as Node)) setOpenState(false) }
    window.addEventListener('mousedown', click)
    window.addEventListener('scroll', scroll, true)
    window.addEventListener('resize', scroll)
    return () => {
      window.removeEventListener('mousedown', click)
      window.removeEventListener('scroll', scroll, true)
      window.removeEventListener('resize', scroll)
    }
  }, [open])
  const active = hits.length ? Math.min(hi, hits.length - 1) : 0
  const pick = (x: T) => { onPick(x); setOpenState(false) }
  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key === 'Escape') { setOpenState(false); return }
    if (!open) { if (e.key === 'ArrowDown') setOpen(true); return }
    if (e.key === 'ArrowDown') { e.preventDefault(); setHi(Math.min(hits.length - 1, active + 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHi(Math.max(0, active - 1)) }
    else if (e.key === 'Enter' && hits[active]) { e.preventDefault(); pick(hits[active]) }
  }
  return { open, setOpen, hi: active, setHi, ref, popRef, pos, onKeyDown, pick }
}

/** The portaled list shell — MenuSelect's popover anatomy. */
function AcPop({ pos, popRef, children }: {
  pos: { top?: number; bottom?: number; left: number; width: number; maxHeight: number } | null
  popRef: RefObject<HTMLDivElement | null>; children: ReactNode
}) {
  if (!pos) return null
  return createPortal(
    <div ref={popRef} role="listbox"
      style={{ top: pos.top, bottom: pos.bottom, left: pos.left, width: pos.width, maxHeight: pos.maxHeight }}
      className="fe-nueva fixed z-[95] overflow-auto rounded-md border border-line bg-surface py-1 shadow-ds-overlay">
      {children}
    </div>,
    document.body,
  )
}
function AcRow({ on, onPick, onHover, children }: { on: boolean; onPick: () => void; onHover: () => void; children: ReactNode }) {
  return (
    <button type="button" role="option" aria-selected={on} onClick={onPick} onMouseEnter={onHover}
      className={`flex w-full items-center gap-3 px-3 text-left transition-colors ${on ? 'bg-warm-50 hover:bg-warm-100' : 'hover:bg-warm-50'}`}>
      {children}
    </button>
  )
}

/* ------------------------------------------------------------ form chrome ---- */

/** An icon's tooltip (owner, 2026-10-05: "add tooltip on icons") — the Nueva Tooltip, floating so a table or card never clips it. */
function Tip({ text, children }: { text: string; children: ReactNode }) {
  return <Tooltip floating text={text}>{children}</Tooltip>
}

interface Opt { value: string; label?: string }
const TEXTAREA = `w-full rounded-md border border-warm-300 bg-surface px-3 py-2 text-[13px] text-ink
  placeholder:text-warm-400 transition-shadow focus:border-brand-500 focus:ring-[3px] focus:ring-brand-500/20
  disabled:bg-warm-50 disabled:text-ink-3`
/** a read-only value at input height (a locked Location Master field, a minted package id) */
function ReadBox({ value }: { value: string }) {
  return (
    <div className="flex h-8 items-center truncate rounded-md border border-warm-200 bg-warm-50 px-3 text-[13px] text-ink-2" title={value}>
      {value || '—'}
    </div>
  )
}

/**
 * One labelled field in the console grid (`Fld`) around the matching Nueva
 * control: `options` → MenuSelect, `date` → DateInput, `multiline` → textarea,
 * otherwise Input. `error` is set only after a submit attempt.
 */
function F({ label, required, className = '', type, value, options, onChange, placeholder, error, helper, disabled, multiline, rows = 3, searchable, fieldKey }: {
  label: string; required?: boolean; className?: string; type?: string; value: string; options?: Opt[]
  onChange: (v: string) => void; placeholder?: string; error?: string; helper?: ReactNode; disabled?: boolean
  multiline?: boolean; rows?: number; searchable?: boolean
  /** the registry key the form builder configures (hide / required / rename) */
  fieldKey?: string
}) {
  const ruleReq = useRuleRequired(fieldKey)
  /* a Format rule (builder): its message shows once the field is left, not only after an Add Order attempt */
  const fmtErr = useFormatError(fieldKey, value)
  const [left, setLeft] = useState(false)
  const err = error || (ruleReq && !filled(value) ? 'Required field.' : undefined) || fmtErr || undefined
  const optLabel = (v: string) => options?.find((o) => o.value === v)?.label ?? v
  const ph = placeholder?.trim() ? placeholder : undefined
  let control: ReactNode
  if (options) {
    control = disabled
      ? <ReadBox value={value ? optLabel(value) : ''} />
      : <MenuSelect value={value} placeholder={ph ?? 'Select'} options={options.map((o) => o.value)} labels={optLabel}
          searchable={searchable ?? options.length > 8} onChange={onChange} />
  } else if (type === 'date') {
    control = disabled ? <ReadBox value={value} /> : <DateInput value={value} onChange={onChange} />
  } else if (multiline) {
    control = <textarea rows={rows} value={value} placeholder={ph} disabled={disabled} onChange={(e) => onChange(e.target.value)} className={TEXTAREA} />
  } else {
    control = <Input type={type} value={value} placeholder={ph} disabled={disabled} onChange={onChange} />
  }
  return (
    <SFld label={label} required={required || ruleReq} error={err} errorNow={!!fmtErr && left && err === fmtErr} helper={helper} className={className} fieldKey={fieldKey}>
      <div onBlur={() => setLeft(true)}>{control}</div>
    </SFld>
  )
}

/** A number in the console's composite shell (value + unit tag); the typed text is held locally so '0.' stays typeable. */
function NumBox({ value, onChange, unit, integer, min = 0, blankZero, error, disabled, placeholder }: {
  value: number; onChange: (n: number) => void; unit?: string
  integer?: boolean; min?: number; blankZero?: boolean; error?: string; disabled?: boolean; placeholder?: string
}) {
  const [typed, setTyped] = useState<{ text: string; of: number } | null>(null)
  const text = typed && typed.of === value ? typed.text : (blankZero && value === 0 ? '' : String(value))
  const commit = (v: string) => {
    const n = v.trim() === '' ? 0 : Number(v)
    const next = Number.isFinite(n) ? Math.max(min, integer ? Math.round(n) : n) : value
    setTyped({ text: v, of: next })
    if (next !== value) onChange(next)
  }
  /* the red border waits for an Add Order attempt, like every other error */
  const showErrors = useContext(ShowErrorsCtx)
  return (
    <div className={disabled ? 'pointer-events-none opacity-60' : ''}>
      <UnitBox unit={unit} invalid={showErrors && !!error}>
        <input type="number" value={text} placeholder={placeholder} disabled={disabled} onChange={(e) => commit(e.target.value)}
          className="h-full w-full min-w-0 flex-1 rounded-md bg-transparent px-3 text-[13px] tabular-nums text-ink placeholder:text-warm-400 focus:outline-none
                     [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none" />
      </UnitBox>
    </div>
  )
}
function FNum({ label, required, className = '', helper, fieldKey, ...p }: ComponentProps<typeof NumBox> & { label: string; required?: boolean; className?: string; helper?: ReactNode; fieldKey?: string }) {
  const ruleReq = useRuleRequired(fieldKey)
  const error = p.error || (ruleReq && !(p.value > 0) ? 'Required field.' : undefined)
  return <SFld label={label} required={required || ruleReq} error={!!error} helper={helper} className={className} fieldKey={fieldKey}><NumBox {...p} error={error} /></SFld>
}

/* ------------------------------------------------------------------ SKUs ---- */

/**
 * SKU Code — the SKU-master autocomplete. Picking binds the line: name,
 * category, HSN Code, Origin Country, weight and dimensions come with it.
 * A bound line shows its code with an unlink ×; typing a SKU Name instead
 * keeps the line a custom one.
 */
/** the list's last row when a typed code matches no master SKU — "Use it as a new SKU" */
const NEW_SKU = '\u0000new-sku'
function SkuCode({ item, skus, onPick, onUnlink, onCustom, autoFocus }: {
  item: ParcelItem; skus: SkuItem[]; onPick: (s: SkuItem) => void; onUnlink: () => void
  /** a SKU typed by hand — not in the SKU master (owner, 2026-09-29: "selected from the master or typed") */
  onCustom?: (code: string) => void
  autoFocus?: boolean
}) {
  const [q, setQ] = useState('')
  const all = useMemo(() => skus.filter((s) => s.enabled).slice().sort((a, b) => a.code.localeCompare(b.code)), [skus])
  const needle = q.trim().toLowerCase()
  const matches = useMemo(() => (needle ? all.filter((s) => `${s.code} ${s.name} ${s.category}`.toLowerCase().includes(needle)) : all), [all, needle])
  const typed = q.trim().toUpperCase()
  const offerNew = !!onCustom && !!typed && !all.some((s) => s.code.toUpperCase() === typed)
  const hits = useMemo(() => [...matches.slice(0, 8),
    ...(offerNew ? [{ code: NEW_SKU, name: typed, category: '', hsnCode: '', originCountry: '', lengthCm: 0, widthCm: 0, heightCm: 0, weightKg: 0, stackable: false, hubs: [], enabled: true } as SkuItem] : [])],
  [matches, offerNew, typed])
  const committed = useRef(false)
  const { open, setOpen, hi, setHi, ref, popRef, pos, onKeyDown, pick } = useAutocomplete<SkuItem>(hits, (s) => {
    committed.current = true
    if (s.code === NEW_SKU) onCustom?.(s.name); else onPick(s)
    setQ('')
  })
  /* owner, 2026-09-29: "what if I want to type the SKU every time" — a typed code is kept when the field is
     left (Tab / click away), exactly like a text box: a master code links to the master, any other code
     becomes a new SKU. A click on a list row wins (it lands before this runs). */
  const commitTyped = () => {
    if (committed.current || !typed || !onCustom) return
    const exact = all.find((s) => s.code.toUpperCase() === typed)
    committed.current = true
    if (exact) onPick(exact); else onCustom(typed)
    setQ('')
  }
  const more = Math.max(0, matches.length - 8)
  const inMaster = !!item.skuCode && skus.some((s) => s.code === item.skuCode)
  /* Nueva Input takes no ref — focus through the wrapper */
  useEffect(() => { if (autoFocus) ref.current?.querySelector('input')?.focus() }, [autoFocus, ref])
  if (item.skuCode) {
    return (
      <span className="flex h-8 items-center gap-1 rounded-md border border-warm-300 bg-warm-50 px-3 text-[13px] text-ink">
        <span className="min-w-0 flex-1 truncate">{item.skuCode}</span>
        {!inMaster && <Tip text="Typed — not in the SKU master"><span className="shrink-0 rounded-full bg-surface px-1.5 text-[11px] text-ink-2">New</span></Tip>}
        <Tip text={inMaster ? 'Unlink from the SKU master' : 'Clear this SKU code'}><button type="button" aria-label="Clear SKU" onClick={onUnlink}
          className="shrink-0 text-warm-400 hover:text-ink"><X size={13} /></button></Tip>
      </span>
    )
  }
  return (
    <div ref={ref} className="relative" onFocus={() => { committed.current = false; if (!open) setOpen(true) }} onKeyDown={onKeyDown}
      onBlur={() => { window.setTimeout(commitTyped, 180) }}>
      <SearchInput value={q} onChange={(v) => { setQ(v); setHi(0); setOpen(true) }} placeholder={onCustom ? 'SKU code — search or type' : 'Search SKU'} />
      {open && hits.length > 0 && (
        <AcPop pos={pos} popRef={popRef}>
          {hits.map((s, i) => s.code === NEW_SKU ? (
            <AcRow key={NEW_SKU} on={i === hi} onHover={() => setHi(i)} onPick={() => pick(s)}>
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-warm-100 text-ink-3"><Plus size={15} /></span>
              <span className="min-w-0 flex-1 py-1.5">
                <span className="block truncate text-[13px] font-bold text-ink">Use “{s.name}” as a new SKU</span>
                <span className="block truncate text-[12px] text-ink-3">Not in the SKU master — you type its name, size and weight</span>
              </span>
            </AcRow>
          ) : (
            <AcRow key={s.code} on={i === hi} onHover={() => setHi(i)} onPick={() => pick(s)}>
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-warm-100 text-ink-3"><Package size={15} /></span>
              <span className="min-w-0 flex-1 py-1.5">
                <span className="block truncate text-[13px] font-bold text-ink">{s.code} · {s.name}</span>
                <span className="block truncate text-[12px] text-ink-3">
                  {s.category || 'Uncategorised'}{s.hsnCode && <> · HSN {s.hsnCode}</>}{s.originCountry && <> · {s.originCountry}</>}
                </span>
              </span>
              <span className="shrink-0 text-[12px] tabular-nums text-ink-3">{s.weightKg} kg</span>
            </AcRow>
          ))}
          {more > 0 && <p className="px-3 pt-1 text-[12px] text-ink-3">{more} more — keep typing</p>}
        </AcPop>
      )}
    </div>
  )
}

/** The hub that serves an address — the PH network's rule (inboundHubFor), plus Chicago → ORD. */
const hubOf = (p: Pick<Party, 'city' | 'state'>) => (/chicago|schiller|illinois|\bil\b/i.test(`${p.city} ${p.state}`) ? 'ORD' : inboundHubFor(p))
const HUB_CODES = new Set(INBOUND_HUBS.map((h) => h.code))
/** What each consignment type moves between, and what it asks (owner, 2026-09-29: fields follow the type). */
const TYPE_RULES: Record<string, { from: 'merchant' | 'customers' | 'facilities'; to: 'merchant' | 'customers' | 'facilities'; rto: boolean; payment: boolean; goodsOptional: boolean }> = {
  Forward: { from: 'merchant', to: 'customers', rto: true, payment: true, goodsOptional: false },
  Reverse: { from: 'customers', to: 'merchant', rto: false, payment: true, goodsOptional: false },
  Exchange: { from: 'merchant', to: 'customers', rto: true, payment: true, goodsOptional: false },
  Transfer: { from: 'facilities', to: 'facilities', rto: false, payment: false, goodsOptional: false },
  Service: { from: 'merchant', to: 'customers', rto: false, payment: true, goodsOptional: true },
}

const jumpTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
/** what checkout's "Back" left in the session (Grow) */
const readSessionDraft = (): OrderDraft | null => {
  try { return JSON.parse(sessionStorage.getItem(DRAFT_KEY) || 'null') as OrderDraft | null } catch { return null }
}

/* -------------------------------------------------------------------- page ---- */
/** Plain-language one-liners under the handling switches (owner copy, 2026-09-24). */
const SWITCH_HINTS = {
  scannable: 'The boxes carry barcodes and get scanned along the way.',
  schedulingConfirmation: 'Check the delivery time with the customer first.',
  dedicateTruck: 'One whole truck just for this consignment.',
  clearanceRequired: 'Needs customs or gate clearance before it can move.',
  splittable: 'Packages may travel on different trips and arrive separately.',
}

/** Order Category (console) — the six flags, asked as Handling chips on the goods (VIP too, owner 2026-09-29).
    All six still land in the one `consignment.category` list. */
const GOODS_CATEGORIES = [
  { name: 'Fragile', icon: GlassWater }, { name: 'Stackable', icon: Layers }, { name: 'Hazmat', icon: Flame },
  { name: 'Heavy Weight', icon: Weight }, { name: '4 Person', icon: Users }, { name: 'VIP', icon: Crown },
] as const

/** 'YYYY-MM-DD' + 'HH:mm' → 'YYYY-MM-DDTHH:mm' ('' when both are empty) */
const joinAt = (d: string, t: string, fallbackTime: string) => (d || t ? `${d || today()}T${t || fallbackTime}` : '')

/* ------------------------------------------------------------ layout bits ---- */

/**
 * A labelled field — the shared SFld's anatomy with a READABLE label (owner, 2026-09-29: "font has to be
 * more readable"): 13px ink-2 instead of 12px ink-3. Control text stays the Nueva primitives' 13px so a
 * row of select · date · phone · number reads as one size. Helper / "Required field." keep the one-line
 * absolute slot, so row heights do not move.
 */
function SFld({ label, required, info, error, errorNow, helper, className = '', fieldKey, children }: {
  label?: string; required?: boolean; info?: boolean; error?: boolean | string
  /** show the error before an Add Order attempt (a Format mismatch in a field already left) */
  errorNow?: boolean
  helper?: ReactNode; className?: string
  /** the builder key — in edit mode the label row carries its controls */
  fieldKey?: string
  children: ReactNode
}) {
  const showErrors = useContext(ShowErrorsCtx)
  const b = useContext(BuilderCtx)
  const editing = !!b?.editing && !!label
  /* owner, 2026-09-29: no "Required field." up front — only after an Add Order attempt */
  const msg = (showErrors || errorNow) && error && !editing ? (typeof error === 'string' ? error : 'Required field.') : null
  const tip = msg ?? (typeof helper === 'string' ? helper : undefined)
  const faded = editing && !!fieldKey && b!.isHidden(fieldKey)
  const configurable = editing && !!fieldKey && !b!.lock(fieldKey)
  return (
    <div className={`min-w-0 ${className} ${configurable ? 'rounded-md outline-dashed outline-1 outline-offset-[5px] outline-warm-300' : ''}`}>
      {editing
        ? <BuilderLabel label={label} fieldKey={fieldKey} required={required} />
        : (
          <label className="mb-1.5 flex min-h-5 items-start gap-1 text-[13px] leading-5 text-ink" title={label}>
            <span className="min-w-0">{label || '\u00a0'}{required && <span className="text-danger-fg">&nbsp;*</span>}</span>
            {info && <Info size={13} className="mt-0.5 shrink-0 text-brand-500" />}
          </label>
        )}
      <div className={`relative ${faded ? 'pointer-events-none opacity-40' : ''}`}>
        {children}
        {(msg || helper) && (
          <p title={tip} className={`absolute left-0 right-0 top-full mt-1 truncate text-[12px] leading-4 ${msg ? 'pl-2 text-danger-fg' : 'text-ink-3'}`}>
            {msg ?? helper}
          </p>
        )}
      </div>
    </div>
  )
}

/* ================================================================ FORM BUILDER (owner, 2026-09-29) ====
 * "Edit consignment form" turns THIS form into its own live preview: every configurable field gets
 * rename · Required · Hide on its label; hidden fields stay on screen, faded, so they can come back.
 * Storage = a v2-ONLY rules key layered over the account's shared config (Form Builder hides +
 * Base Modules hides + relabels): saving here never changes /add, the Grow form, or the list's columns.
 * Locks: the registry's system-mandatory fields (api / account) and the fields THIS form's own checks
 * need (SKU + package weight and L × W × H) — never hideable, never optional. Required is offered only
 * on fields that hold a value (not switches, Load type or Service Type). Required ⇒ shown; hidden ⇒ not
 * required; a dependant hides with its parent (Order Amount ↔ Payment Mode, Loading Time ↔ Load type).
 *
 * 2026-10-05 — the builder edits ONE of two forms (`./formSetup`): the Console form, or the Grow portal form
 * (`?edit=grow`: the merchant form itself is the preview; Grow follows the console field by field until a field is
 * changed for Grow). Per field it adds **Format** (what may be typed — a preset or a regular expression), and each
 * of three cards takes the account's own fields (**+ Add field**: Text · Number · Date · List · Yes / No). */
/** the form's own checks require these — locked like the system's mandatory fields */
/** grouped keys drive several controls — hide / require together, no single label to rename */
const GROUP_KEYS = new Set(['addrLines23', 'addrCoordinates', 'addrFloorLift', 'addrWindow', 'skuDimensions', 'skuWeight', 'pkgDimensions'])
/** v2-only configurable keys (owner, 2026-09-29): Lift on its own, the whole VAS section, each Handling category */
const catKey = (name: string) => `cat:${name}`
const V2_FIELDS: FieldDef[] = [
  { key: 'addrLift', defaultLabel: 'Lift Available', section: 'Address details', form: 'full', apiPath: 'address.liftAvailable' },
  { key: 'vas', defaultLabel: 'Value Added Services', section: 'Instructions', form: 'full', apiPath: 'consignmentDetails.vas[]' },
  /* owner, 2026-09-29: optional and hideable */
  { key: 'vehicleType', defaultLabel: 'Vehicle Type', section: 'Order details', form: 'full', apiPath: 'consignmentDetails.vehicleType' },
  ...GOODS_CATEGORIES.map(({ name }): FieldDef => ({ key: catKey(name), defaultLabel: name, section: 'Handling & scheduling', form: 'full', apiPath: 'consignmentDetails.category[]' })),
  /* 2026-10-05: an address's Contact Number takes a Format (it stays as it is — Ship To needs it) */
  { key: 'addrContact', defaultLabel: 'Contact Number', section: 'Address details', form: 'simplified', apiPath: 'shipFrom/shipTo.contact.phone' },
]
const V2_KEYS = new Set(V2_FIELDS.map((f) => f.key))
const FIELD_DEF = new Map([...CONSIGNMENT_FIELDS, ...V2_FIELDS].map((f) => [f.key, f]))
/* owner, 2026-09-29: Service Type is mandatory too */
const FORM_LOCKED = new Set(['skuWeight', 'skuDimensions', 'pkgWeight', 'pkgDimensions', 'serviceType', 'addrContact'])
/** a value that is always valid — can be hidden, never "required" */
const NOT_REQUIRABLE = new Set(['scannable', 'schedulingConfirmation', 'clearanceRequired', 'splittable', 'dedicateTruck', 'serviceType', ...V2_KEYS])
/** the typed-text fields a Format can check (2026-10-05) — the system's mandatory identifiers included; custom Text fields too */
const FORMATABLE = new Set(['orderNumber', 'referenceNumber', 'consignmentNumber', 'exchangeOrderNumber',
  'addrCompanyName', 'addrEmail', 'addrLandmark', 'addrSuburb', 'addrContact', 'specialInstructions',
  'skuDescription', 'skuHsn', 'skuImage', 'pkgTracking', 'pkgDescription', 'pkgPalletSpace'])
/** where an optional field starts: its section's "More information" fold (the builder can move it) */
const DEFAULT_MORE = new Set(['addrCompanyName', 'addrLines23', 'addrLandmark', 'addrSuburb', 'addrCoordinates', 'addrFloorLift',
  'pkgDescription', 'pkgPalletSpace'])
/** the SKU line's fields live in the line's own fold — not movable section by section */
const SKU_ROW_KEYS = new Set(['skuCategory', 'skuDescription', 'skuHsn', 'skuImage', 'skuUnitCost'])
/** keys that can sit in a section's More fold (never a locked or a row-level one); every custom field can */
const movable = (k: string) => isCustomKey(k) || (FIELD_DEF.has(k) && !byKeyMandatory(k) && !FORM_LOCKED.has(k) && !SKU_ROW_KEYS.has(k)
  && k !== 'vas' && !k.startsWith('cat:'))

export type FieldLock = 'system' | 'form' | null
interface Builder {
  editing: boolean
  /** which form the builder edits */
  portal: 'console' | 'grow'
  /** a field the builder knows (the registry, the v2 keys, the account's own fields) */
  known: (k: string) => boolean
  lock: (k: string) => FieldLock
  requirable: (k: string) => boolean
  /** hidden by its own rule (not only through its parent) */
  ownHidden: (k: string) => boolean
  isHidden: (k: string) => boolean
  /** the parent that hides it, if any */
  hiddenWith: (k: string) => string | null
  required: (k: string) => boolean
  /** in its section's "More information" fold (a required field never is) */
  inMore: (k: string) => boolean
  label: (k: string) => string
  set: (k: string, patch: FieldRuleV2) => void
  /** Format (2026-10-05): which keys take one, the rule, its message for a value, and the editor */
  formatable: (k: string) => boolean
  format: (k: string) => FieldFormat | undefined
  formatError: (k: string, v: string | undefined | null) => string | null
  editFormat: (k: string) => void
  /** the account's own field, if `k` is one — removable */
  custom: (k: string) => CustomFieldDef | undefined
  removeCustom: (k: string) => void
  /** Grow form: changed for Grow (differs from the console form) — and back to the console's setting */
  overridden: (k: string) => boolean
  revert: (k: string) => void
}
const BuilderCtx = createContext<Builder | null>(null)
/** false until the first Add Order attempt — then every missing field says so */
const ShowErrorsCtx = createContext(false)
/** a builder "required" rule applies to this key (and the field is shown) */
function useRuleRequired(key?: string) {
  const b = useContext(BuilderCtx)
  return !!key && !!b?.required(key)
}
/** the Format message for this value, when the key has a Format and the value breaks it */
function useFormatError(key: string | undefined, value: string | undefined | null) {
  const b = useContext(BuilderCtx)
  return key && b ? b.formatError(key, value) : null
}
/** a red line that appears only after an Add Order attempt */
function ErrLine({ children, className = '' }: { children: ReactNode; className?: string }) {
  return useContext(ShowErrorsCtx) ? <p className={`text-[12px] text-danger-fg ${className}`}>{children}</p> : null
}

/** Required · Hide for one key (no label) — shared by BuilderLabel and Configurable. */
/* 2026-10-05: the field tools are compact icons (their words in the tooltip) so a label keeps its room */
const toolIcon = (on: boolean) => `inline-flex h-6 w-6 items-center justify-center rounded-md border transition-colors
  disabled:cursor-not-allowed disabled:opacity-40 ${on ? 'border-ink bg-warm-50 text-ink' : 'border-transparent text-ink-3 hover:bg-warm-100 hover:text-ink'}`
/** Format · (Grow form) the "Grow" marker — shared by locked and configurable fields */
function FormatAndGrowTools({ k, disabled }: { k: string; disabled?: boolean }) {
  const b = useContext(BuilderCtx)!
  const f = b.format(k)
  return (
    <>
      {b.overridden(k) && (
        <Tip text="Changed for Grow — click to use the console form's setting"><button type="button" onClick={() => b.revert(k)}
          className="inline-flex h-6 items-center gap-1 rounded-full bg-brand-50 px-1.5 text-[11px] font-bold text-brand-600 hover:bg-brand-100">
          Grow<RotateCcw size={10} />
        </button></Tip>
      )}
      {b.formatable(k) && (
        <Tip text={f ? `Format: ${formatSummary(f)}` : 'Format — check what is typed'}><button type="button" aria-pressed={!!f} onClick={() => b.editFormat(k)} disabled={disabled}
          aria-label="Format" className={toolIcon(!!f)}>
          <Regex size={14} />
        </button></Tip>
      )}
    </>
  )
}
function FieldTools({ k }: { k: string }) {
  const b = useContext(BuilderCtx)!
  const lock = b.lock(k)
  if (lock) {
    return (
      <span className="ml-auto inline-flex shrink-0 items-center gap-0.5">
        <FormatAndGrowTools k={k} />
        <Tip text={lock === 'system' ? 'Needed by the system — always shown and required' : 'This form needs it — always shown'}><span
          aria-label={lock === 'system' ? 'Required by the system' : 'Needed by this form'}
          className="inline-flex h-6 w-6 shrink-0 items-center justify-center text-ink-3"><Lock size={12} /></span></Tip>
      </span>
    )
  }
  const parent = b.hiddenWith(k)
  const own = b.ownHidden(k)
  const custom = b.custom(k)
  return (
    <span className="ml-auto inline-flex shrink-0 items-center gap-0.5">
      {parent && !own && <Tip text={`Hidden with ${b.label(parent)}`}><span className="mr-1 max-w-[96px] truncate text-[11px] text-ink-3">Hidden with {b.label(parent)}</span></Tip>}
      <FormatAndGrowTools k={k} disabled={own || !!parent} />
      {b.requirable(k) && (
        <Tip text={b.required(k) ? 'Required — click to make it optional' : 'Make required'}><button type="button" aria-pressed={b.required(k)} onClick={() => b.set(k, { required: !b.required(k) })}
          disabled={own || !!parent}
          aria-label="Required"
          className={toolIcon(b.required(k))}>
          <Asterisk size={14} />
        </button></Tip>
      )}
      {movable(k) && (
        <Tip text={b.required(k) ? 'A required field stays in the main form' : b.inMore(k) ? 'In More information — click to bring it back' : 'Move to More information'}><button type="button" aria-pressed={b.inMore(k)} onClick={() => b.set(k, { more: !b.inMore(k) })}
          disabled={own || !!parent || b.required(k)}
          aria-label="More information" className={toolIcon(b.inMore(k))}>
          <ListCollapse size={14} />
        </button></Tip>
      )}
      <Tip text={own ? `Show this field on the ${b.portal === 'grow' ? 'Grow portal' : 'console'} form` : `Hide this field on the ${b.portal === 'grow' ? 'Grow portal' : 'console'} form`}><button type="button" aria-pressed={own} onClick={() => b.set(k, { hidden: !own })}
        aria-label={own ? 'Show field' : 'Hide field'}
        className={`inline-flex h-6 w-6 items-center justify-center rounded-md hover:bg-warm-100 ${own ? 'text-warm-400' : 'text-ink-2'}`}>
        {own ? <EyeOff size={14} /> : <Eye size={14} />}
      </button></Tip>
      {custom && (
        <Tip text="Remove this field — saved consignments keep their answer"><button type="button" onClick={() => b.removeCustom(k)}
          aria-label={`Remove ${b.label(k)}`}
          className="inline-flex h-6 w-6 items-center justify-center rounded-md text-ink-3 hover:bg-warm-100 hover:text-brand-500">
          <Trash2 size={13} />
        </button></Tip>
      )}
    </span>
  )
}
/** The edit-mode label row: rename in place (single-key fields), then the tools; locked / fixed fields say so. */
function BuilderLabel({ label, fieldKey, required }: { label?: string; fieldKey?: string; required?: boolean }) {
  const b = useContext(BuilderCtx)!
  const star = required && <span className="text-danger-fg">&nbsp;*</span>
  if (!fieldKey || !b.known(fieldKey)) {
    return (
      <div className="mb-1.5 flex min-h-6 items-center gap-1 text-[13px] leading-5 text-ink">
        <span className="min-w-0 truncate" title={label}>{label}{star}</span>
        <span className="ml-auto inline-flex shrink-0"><Tip text="Part of the form — not configurable"><Lock size={11} className="text-warm-300" /></Tip></span>
      </div>
    )
  }
  const renamable = !GROUP_KEYS.has(fieldKey)
  return (
    <div className="mb-1.5 flex min-h-6 items-center gap-1.5 text-[13px] leading-5 text-ink">
      {renamable
        ? <input aria-label={`Rename ${label}`} value={b.label(fieldKey)} onChange={(e) => b.set(fieldKey, { label: e.target.value })}
            className="-mx-1 min-w-0 flex-1 rounded border border-transparent bg-transparent px-1 text-[13px] text-ink hover:border-warm-300 focus:border-brand-500 focus:outline-none" />
        : <span className="min-w-0 flex-1 truncate" title="Grouped with its neighbours — not renamable">{label}</span>}
      {star}
      <FieldTools k={fieldKey} />
    </div>
  )
}
/** Edit-mode frame for a non-field control (a switch): its tools above it. */
function Configurable({ fieldKey, children }: { fieldKey: string; children: ReactNode }) {
  const b = useContext(BuilderCtx)
  if (!b?.editing) return <>{children}</>
  return (
    <div className="rounded-md outline-dashed outline-1 outline-offset-[5px] outline-warm-300">
      <div className="mb-1.5 flex min-h-6 items-center"><FieldTools k={fieldKey} /></div>
      <div className={b.isHidden(fieldKey) ? 'pointer-events-none opacity-40' : ''}>{children}</div>
    </div>
  )
}

/**
 * "More information" — optional fields a section rarely needs stay HIDDEN IN PLACE; the toggle reveals
 * them where they belong in the section's order (owner, 2026-09-29: "Address Line 2 goes under Line 1,
 * not at the bottom"). Nothing moves; the builder only decides which fields wait behind the toggle.
 */
type RevealEntry = [string | null, ReactNode, boolean?] | false | null | undefined
function revealEntries(entries: RevealEntry[], inMore: (k: string) => boolean, open: boolean) {
  const nodes: ReactNode[] = []
  let waiting = 0
  let waitingFilled = 0
  for (const e of entries) {
    if (!e) continue
    const [k, node, isFilled] = e
    if (k && inMore(k)) {
      waiting += 1
      if (isFilled) waitingFilled += 1
      if (!open) continue
    }
    nodes.push(node)
  }
  return { nodes, waiting, waitingFilled }
}
/** The reveal toggle under a section's fields; hidden while editing (everything is shown then). */
function RevealToggle({ open, onToggle, waiting, waitingFilled = 0, label = 'information', className = '', iconOnly = false }: {
  open: boolean; onToggle: () => void; waiting: number; waitingFilled?: number; label?: string; className?: string
  /** a chevron only, the words in its tooltip (a package's details — owner, 2026-09-29) */
  iconOnly?: boolean
}) {
  const b = useContext(BuilderCtx)
  if (b?.editing || waiting === 0) return null
  const words = open ? `Less ${label}` : `More ${label} · ${waiting} field${waiting === 1 ? '' : 's'}${waitingFilled ? `, ${waitingFilled} filled` : ''}`
  if (iconOnly) return (
    <Tip text={words}><button type="button" onClick={onToggle} aria-expanded={open} aria-label={words}
      className={`inline-flex h-7 w-7 items-center justify-center rounded-md text-brand-500 hover:bg-warm-100 ${className}`}>
      {open ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
    </button></Tip>
  )
  return (
    <div className={className}>
      <button type="button" onClick={onToggle} aria-expanded={open}
        className="inline-flex items-center gap-1 text-[13px] text-brand-500 hover:text-brand-600">
        {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}{open ? `Less ${label}` : `More ${label}`}
        {!open && <span className="ml-1 text-[12px] text-ink-3">· {waiting} field{waiting === 1 ? '' : 's'}{waitingFilled ? `, ${waitingFilled} filled` : ''}</span>}
      </button>
    </div>
  )
}

/**
 * A card's explanation behind an ⓘ beside its title (owner, 2026-09-29: "move these heading texts into an info
 * icon and save scrolling space"). Opens on hover AND keyboard focus; left-aligned so it never clips the card.
 */
function InfoTip({ text }: { text: string }) {
  return (
    <span className="group/info relative inline-flex">
      <button type="button" aria-label={text} className="inline-flex h-5 w-5 items-center justify-center rounded-full text-ink-3 hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40">
        <Info size={14} />
      </button>
      <span role="tooltip" className="pointer-events-none absolute left-0 top-full z-40 mt-1.5 hidden w-max max-w-[420px] rounded-md bg-warm-900 px-2.5 py-1.5 text-[12px] font-normal leading-snug text-white shadow-ds-overlay group-hover/info:block group-focus-within/info:block">
        {text}
      </span>
    </span>
  )
}
/** A row-adder ("+ Add SKU") — a compact link, not a section button: it adds a line, so it takes a line's height. */
function AddRowLink({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      className="-ml-1.5 inline-flex h-7 items-center gap-1 rounded-md px-1.5 text-[13px] font-bold text-brand-500 hover:bg-warm-50 hover:text-brand-600">
      <Plus size={14} />{label}
    </button>
  )
}
/** This form's card — the shared StagingCard's look, the caption moved into an ⓘ (the header is one line). */
function FormCard({ id, title, caption, count, action, children }: {
  id?: string; title?: ReactNode; caption?: string; count?: number; action?: ReactNode; children?: ReactNode
}) {
  return (
    <section id={id} className="scroll-mt-20 rounded-xl bg-surface p-6">
      {(title || action) && (
        <div className="mb-5 flex min-h-6 items-center justify-between gap-4">
          {title && (
            <h2 className="flex items-center gap-2 text-[15px] font-bold text-ink">
              {title}
              {count !== undefined && <span className="font-normal">{count}</span>}
              {caption && <InfoTip text={caption} />}
            </h2>
          )}
          {action}
        </div>
      )}
      {children}
    </section>
  )
}

/* Field grids, tighter than the shared SGrid (owner, 2026-09-29: "less space between the fields", then
   "reduce the gap between lines"). The row gap is sized to the ONE thing that lives in it — SFld's
   absolute helper / "Required field." line (mt-1 + 16px = 20px) — plus 4px, so a message never touches
   the next row's label: 24px. */
const FIELD_GAPS = 'gap-x-6 gap-y-6'
/** the handling toggles' one row (console Handling card, Grow's Handling & extras) */
const HANDLING_ROW = 'flex flex-wrap items-center gap-x-8 gap-y-3'
/** The console field grid — `cols` equal columns (4 default), SGrid's API with this form's gaps. */
function SGrid({ children, cols = 4, className = '' }: { children: ReactNode; cols?: 3 | 4 | 5 | 7; className?: string }) {
  const c = { 3: 'lg:grid-cols-3', 4: 'lg:grid-cols-4', 5: 'lg:grid-cols-5', 7: 'lg:grid-cols-7' }[cols]
  return <div className={`grid grid-cols-1 ${FIELD_GAPS} sm:grid-cols-2 ${c} lg:pr-10 ${className}`}>{children}</div>
}
/** Two equal columns (a party's fields). */
function Grid2({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`grid grid-cols-1 ${FIELD_GAPS} sm:grid-cols-2 ${className}`}>{children}</div>
}
/** A small bold heading inside a card, with an optional control on its right. */
function SubTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-5 flex min-h-8 items-center justify-between gap-3">
      <span className="text-[14px] font-bold text-ink">{children}</span>
      {right}
    </div>
  )
}
/** Date + time in one field cell (a party's window start / end). */
function DateTimeCell({ label, at, onChange, fallbackTime }: { label: string; at: string; onChange: (v: string) => void; fallbackTime: string }) {
  const ruleReq = useRuleRequired('addrWindow')
  return (
    <SFld label={label} fieldKey="addrWindow" required={ruleReq} error={ruleReq && !filled(at)}>
      <div className="grid grid-cols-[minmax(0,1fr)_112px] gap-2">
        <DateInput value={dateOf(at)} placeholder="Select Date" onChange={(d) => onChange(d ? joinAt(d, timeOf(at), fallbackTime) : '')} />
        <TimeBox value={timeOf(at)} placeholder="Time" onChange={(t) => onChange(joinAt(dateOf(at), t, fallbackTime))} />
      </div>
    </SFld>
  )
}

/**
 * One address's fields (the Add / Edit address popup, and inline while editing the form). Required
 * first — Name* · Contact Number · Address Line 1* · Country* · State* · City* · Postal Code — then the
 * optional ones, each in the main grid or the "More information" fold by its placement (builder).
 * `variant="rto"` = the return address: Contact + Postal Code required, no coordinates / floor.
 */
function PartyBlock({ party, set, nameLabel, requireContact, hid, variant = 'full', grouped = false }: {
  party: Party; set: (patch: Partial<Party>) => void; nameLabel: string
  requireContact?: boolean; hid: (k: string) => boolean; variant?: 'full' | 'rto'
  /** the popup: the same order under two quiet headings, Contact then Address */
  grouped?: boolean
}) {
  const rto = variant === 'rto'
  const b = useContext(BuilderCtx)
  const showErrors = useContext(ShowErrorsCtx)
  const miss = (v: string | undefined, req: boolean) => req && !filled(v)
  const val = (k: keyof Party) => String(party[k] ?? '')
  const text = (k: keyof Party, label: string, o: { required?: boolean; type?: string; placeholder?: string; className?: string; fieldKey?: string } = {}) => (
    <F key={String(k)} label={label} required={o.required} type={o.type} placeholder={o.placeholder} className={o.className} fieldKey={o.fieldKey}
      value={val(k)} error={miss(val(k), !!o.required) ? 'Required field.' : undefined}
      onChange={(v) => set({ [k]: v } as Partial<Party>)} />
  )
  const sel = (k: 'country' | 'postalCode' | 'state', label: string, list: string[], required: boolean) => (
    <F label={label} required={required} value={party[k] ?? ''} options={opts(list)}
      error={miss(party[k], required) ? 'Required field.' : undefined} onChange={(v) => set({ [k]: v })} />
  )
  const L = (k: string, d: string) => b?.label(k) ?? d
  /* Contact Number's Format (builder) — said once the box is left, or after an Add Order attempt */
  const phoneFmt = b?.formatError('addrContact', party.contactNumber) ?? null
  const [phoneLeft, setPhoneLeft] = useState(false)
  const [open, setOpen] = useState(false)
  const reveal = open || !!b?.editing
  const inMore = (k: string) => !!b?.inMore(k)
  /* the order a person writes an address in — Country → Postal Code → Suburb → City → State (owner) */
  const contactEntries: RevealEntry[] = [
    [null, text('name', nameLabel, { required: true, placeholder: 'eg, John Doe' })],
    !hid('addrCompanyName') && ['addrCompanyName', text('businessName', L('addrCompanyName', 'Company Name'), { placeholder: 'eg, Random Company', fieldKey: 'addrCompanyName' }), filled(party.businessName)],
    [null, <SFld key="phone" label={L('addrContact', 'Contact Number')} fieldKey="addrContact" required={requireContact}
      error={miss(party.contactNumber, !!requireContact) || phoneFmt || false} errorNow={!!phoneFmt && phoneLeft}>
      <div onBlur={() => setPhoneLeft(true)}>
        <PhoneInput code={party.countryCode ?? ''} number={party.contactNumber} codes={DIAL_CODES}
          invalid={(showErrors && miss(party.contactNumber, !!requireContact)) || (!!phoneFmt && (showErrors || phoneLeft))}
          onCode={(v) => set({ countryCode: v })} onNumber={(v) => set({ contactNumber: v })} />
      </div>
    </SFld>],
    !hid('addrEmail') && ['addrEmail', text('email', L('addrEmail', 'Email'), { type: 'email', placeholder: 'eg, johndoe@xyz.com', fieldKey: 'addrEmail' }), filled(party.email)],
  ]
  const addressEntries: RevealEntry[] = [
    [null, text('line1', 'Address Line 1', { required: true, placeholder: 'eg, Building No., Street' })],
    !hid('addrLines23') && ['addrLines23', text('line2', 'Address Line 2', { placeholder: 'eg, Street 1 A', fieldKey: 'addrLines23' }), filled(party.line2)],
    !hid('addrLines23') && ['addrLines23', <F key="line3" label="Address Line 3" value={party.line3 ?? ''} placeholder="eg, Behind High School" onChange={(v) => set({ line3: v })} />, filled(party.line3)],
    !hid('addrLandmark') && ['addrLandmark', text('landmark', L('addrLandmark', 'Landmark'), { placeholder: 'eg, Behind High School', fieldKey: 'addrLandmark' }), filled(party.landmark)],
    [null, <div key="country" className="contents">{sel('country', 'Country', COUNTRIES, true)}</div>],
    [null, <div key="postal" className="contents">{sel('postalCode', 'Postal Code', POSTCODES, rto)}</div>],
    !hid('addrSuburb') && ['addrSuburb', text('county', L('addrSuburb', 'Suburb / County'), { fieldKey: 'addrSuburb' }), filled(party.county)],
    [null, text('city', 'City', { required: true })],
    [null, <div key="state" className="contents">{sel('state', 'State', STATES, true)}</div>],
    !rto && !hid('addrCoordinates') && ['addrCoordinates', text('latitude', 'Latitude', { type: 'number', fieldKey: 'addrCoordinates' }), filled(party.latitude)],
    !rto && !hid('addrCoordinates') && ['addrCoordinates', text('longitude', 'Longitude', { type: 'number' }), filled(party.longitude)],
    !rto && !hid('addrFloorLift') && ['addrFloorLift', text('floorNumber', 'Floor Number', { type: 'number', fieldKey: 'addrFloorLift' }), filled(party.floorNumber)],
    !rto && !hid('addrLift') && ['addrLift', <div key="lift" className="flex items-start pt-7"><Configurable fieldKey="addrLift">
      <SwitchField label={L('addrLift', 'Lift Available')} checked={!!party.liftAvailable} onChange={(v) => set({ liftAvailable: v })} />
    </Configurable></div>, !!party.liftAvailable],
  ]
  const who = revealEntries(contactEntries, inMore, reveal)
  const where = revealEntries(addressEntries, inMore, reveal)
  const waiting = who.waiting + where.waiting
  const waitingFilled = who.waitingFilled + where.waitingFilled
  const toggle = <RevealToggle open={open} onToggle={() => setOpen((v) => !v)} waiting={waiting} waitingFilled={waitingFilled} label="address details" className="mt-5" />
  if (grouped) {
    const head = (t: string) => (
      <div className="mb-4 flex items-center gap-3"><span className="text-[13px] font-bold text-ink-2">{t}</span><span className="h-px flex-1 bg-warm-200" /></div>
    )
    return (
      <div>
        {head('Contact')}
        <Grid2>{who.nodes}</Grid2>
        <div className="mt-8">{head('Address')}</div>
        <Grid2>{where.nodes}</Grid2>
        {toggle}
      </div>
    )
  }
  return (
    <div>
      {/* one flowing two-column order — no spans, so a revealed field never leaves a gap */}
      <Grid2>{who.nodes}{where.nodes}</Grid2>
      {toggle}
    </div>
  )
}

/** The chosen address, read back as a card: who · how to reach them · where. */
function AddressCard({ party, missing, invalid = [], onEdit, tag }: {
  party: Party; missing: string[]; onEdit: () => void; tag?: string
  /** typed in the wrong format (the builder's Format rules) */
  invalid?: string[]
}) {
  const showErrors = useContext(ShowErrorsCtx)
  const empty = !filled(party.name) && !filled(party.line1)
  const place = [party.city, party.state, party.postalCode, party.country].filter((x) => filled(x)).join(', ')
  const contact = [party.contactNumber ? `${party.countryCode ?? ''} ${party.contactNumber}`.trim() : '', party.email].filter(Boolean).join(' · ')
  const bad = (showErrors && missing.length > 0) || invalid.length > 0
  return (
    <div className={`rounded-lg border bg-surface p-4 ${bad ? 'border-danger-fg' : 'border-warm-200'}`}>
      {empty
        ? <p className="text-[13px] text-ink-3">No address yet — pick a saved one above or add a new address.</p>
        : (
          <div className="flex items-start gap-3">
            <MapPinned size={16} className="mt-0.5 shrink-0 text-ink-3" />
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-2 text-[14px] font-bold text-ink">
                {party.name || <span className="font-normal text-ink-3">No name</span>}
                {party.businessName && <span className="text-[13px] font-normal text-ink-2">· {party.businessName}</span>}
                {tag && <span className="rounded-full bg-warm-50 px-2 py-0.5 text-[11px] font-normal text-ink-2">{tag}</span>}
              </p>
              {contact && <p className="mt-1 text-[13px] text-ink-2">{contact}</p>}
              <p className="mt-1 text-[13px] text-ink">{[party.line1, party.line2, party.line3, party.landmark].filter((x) => filled(x)).join(', ')}</p>
              {place && <p className="text-[13px] text-ink-2">{place}</p>}
            </div>
            <Tip text="Edit this address"><button type="button" onClick={onEdit} aria-label="Edit this address"
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-warm-200 text-ink-2 hover:bg-warm-50 hover:text-ink">
              <Pencil size={14} />
            </button></Tip>
          </div>
        )}
      {missing.length > 0 && (showErrors
        ? <p className="mt-3 text-[12px] text-danger-fg">Missing: {missing.join(', ')}</p>
        : !empty && <p className="mt-3"><span className="rounded-full bg-warm-50 px-2 py-0.5 text-[11px] text-ink-2">Incomplete — {missing.length} to add</span></p>)}
      {invalid.length > 0 && <p className="mt-2 text-[12px] text-danger-fg">Check the format: {invalid.join(', ')}</p>}
    </div>
  )
}

/** A compact switch — label beside the toggle, its explanation only in the tooltip (the one-line rows). */
function InlineSwitch({ label, title, checked, onChange }: { label: string; title?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label title={title} className="inline-flex cursor-pointer items-center gap-2.5 text-[13px] text-ink">
      <Toggle checked={checked} onChange={onChange} />{label}
    </label>
  )
}

/** L × W × H in one cell — three number boxes, one unit. */
function DimsBox({ l, w, h, onChange, error, unit = 'cm' }: {
  l: number; w: number; h: number; onChange: (patch: { l?: number; w?: number; h?: number }) => void; error?: boolean; unit?: string
}) {
  return (
    <div className="grid grid-cols-3 gap-1.5" title={`Length × Width × Height (${unit})`}>
      <NumBox blankZero placeholder="L" value={l} error={error && !(l > 0) ? 'x' : undefined} onChange={(n) => onChange({ l: n })} />
      <NumBox blankZero placeholder="W" value={w} error={error && !(w > 0) ? 'x' : undefined} onChange={(n) => onChange({ w: n })} />
      <NumBox blankZero placeholder="H" value={h} error={error && !(h > 0) ? 'x' : undefined} onChange={(n) => onChange({ h: n })} />
    </div>
  )
}

/* -------------------------------------------------------------------- page ---- */

/** An Items-mode line: one SKU and how many units (each unit ships as its own piece). */
interface ItemLine { id: string; item: ParcelItem }
/**
 * How goods are entered — ONE way for the account, set in the form builder (owner, 2026-09-29: "then we will
 * not ask for the selector every time"):
 *   sku       — SKU-based: a SKU and how many; the packages are worked out (each unit = one piece)
 *   separate  — SKUs, then packages: the SKU list first, then the boxes; each SKU says which box it is in
 *   combined  — packages with their SKUs: each box, and what is packed in it
 */
const FORM_TIER_V2_KEY = 'console-consignment-form-v2-tier'
const GOODS_OPTIONS: { value: GoodsSetting; label: string; sub: string }[] = [
  { value: 'sku', label: 'SKU-based', sub: 'A SKU and how many — the packages are worked out' },
  /* owner, 2026-10-05: the default */
  { value: 'separate', label: 'SKUs, then packages', sub: 'Default · list the SKUs, then the boxes they go in' },
  { value: 'combined', label: 'Packages with their SKUs', sub: 'Each box, and what is packed in it' },
]

/**
 * `/local/consignments/new` (+ `/new/vehicle`) — the console's Add Consignment, arranged by
 * dependency (owner, 2026-09-29): what the consignment is → where it moves → what is in it →
 * how it moves → extras. Same fields, validation and `OrderDraft` as AddOrderPage (which stays
 * the staging replica at /add), one tier only.
 */
/** Grow (merchant portal): the carrier's / ops' fields never render — the merchant is the header ⇄, the carrier
    allocates the carrier, ops set the loading time, vehicle, coordinates and pallet space. (The load type is Grow's
    own Handling question; owner 2026-09-29: the Handling categories and tags show on Grow too.) */
const MERCHANT_OFF = new Set(['merchant', 'consignmentNumber', 'totalLoadingTime', 'dedicateTruck', 'vehicleType',
  'addrCoordinates', 'pkgPalletSpace'])
/**
 * The route element. On the console, `?edit=console` opens the form builder on the Console form and `?edit=grow`
 * on the Grow portal form — the Grow merchant form itself, mounted here as its own preview (2026-10-05). The `key`
 * remounts the form when the builder switches between the two.
 */
export default function AddConsignmentV2Page({ portal = 'console' }: {
  /** 'merchant' = the Grow Create Order (`/grow/orders/add`): the same form minus the carrier's and ops' features,
      plus the lane's services with ESTIMATED rates, the pickup module's window and checkout / Save for later */
  portal?: 'console' | 'merchant'
} = {}) {
  const [params] = useSearchParams()
  const edit = portal === 'console' ? params.get('edit') : null
  if (edit === 'grow') return <AddConsignmentV2 key="grow-setup" portal="merchant" setup />
  return <AddConsignmentV2 key={portal} portal={portal} setup={edit === 'console'} />
}

function AddConsignmentV2({ portal = 'console', setup = false }: {
  portal?: 'console' | 'merchant'
  /** opened straight into the form builder (`?edit=`); with portal 'merchant' = the Grow portal form's preview */
  setup?: boolean
}) {
  const merchantMode = portal === 'merchant'
  /* the Grow portal form, edited from the console: the merchant form as its own live preview */
  const growSetup = setup && merchantMode
  useEffect(() => { void loadMasters() }, [])
  const base = merchantMode ? '/grow/orders' : '/local/consignments'
  const prPath = (id: string) => (merchantMode ? `/grow/orders/pickups/${id}` : `/local/pickup/${id}`)
  const nav = useNavigate()
  const db = useGrowOrders()
  const masters = useMasters()
  const merchantCode = useMerchantCode()
  const merchant = currentMerchant(masters.merchants, merchantCode)
  const pickup = usePickupLocations(db.stores)
  const stores = pickup.stores
  const packageTypes = useMemo(
    () => packageTypesForMerchant(masters.packageTypes, merchant?.code ?? null),
    [masters.packageTypes, merchant?.code])
  const ownPresets = ownPackageTypes(masters.packageTypes, merchant?.code ?? null)
  const { pathname } = useLocation()
  const [params] = useSearchParams()
  /* ?step=1|2 — QA shortcut: sample parties + identifiers + carrier prefilled, scrolled to the packages (1) / carriers (2) */
  const jump = Math.min(2, Math.max(0, Number(params.get('step')) || 0))
  const draftId = params.get('draft')
  /* a saved draft; on Grow also what checkout's "Back" left in the session (this form clears it on mount) */
  /* console Modify Shipment Details on a LIVE consignment: prefilled from the order when it has no stored form
     state, saved back onto it (status / payment / pickup kept) — never a new draft */
  const [liveEdit] = useState(() => { const o = draftId ? orderById(draftId) : null; return !merchantMode && !!o && !o.isDraft })
  const [saved] = useState<OrderDraft | null>(() => {
    /* the Grow portal form's preview starts empty — never a merchant's session draft */
    if (growSetup) return null
    const o = draftId ? orderById(draftId) : null
    if (o) return o.draft ?? (!merchantMode && !o.isDraft ? draftFromOrder(o) : null)
    return merchantMode && !params.get('fromOverage') ? readSessionDraft() : null
  })
  const resumeId = draftId ?? saved?.orderId ?? null
  const pr = pickupRequestById(params.get('fromPickup'))
  const [ovPrId = '', ovId = ''] = (params.get('fromOverage') ?? '').split(':')
  const ovPr = pickupRequestById(ovPrId || null)
  const ovScan = ovPr?.overages.find((v) => v.id === ovId && !v.orderId)
  const fromOverage = ovPr && ovScan ? { pr: ovPr, scan: ovScan } : undefined
  const ftlFirst = !fromOverage
    && (params.get('type') === 'FTL' || pathname.endsWith('/vehicle') || pr?.shipmentType === 'FTL' || saved?.shipmentType === 'FTL')
  const overageStore = fromOverage ? stores.find((s) => s.code === fromOverage.pr.storeCode) : undefined

  /* ---- the console registry: relabels + Form Builder hides (the Regular tier's membership) ---- */
  /* the account's shared config (read only) + this form's own rules on top (the builder writes these) */
  const [fieldCfg] = useState(loadFieldConfig)
  const [behavior] = useState(loadFormBehavior)
  /* the console form's rules, Grow's own changes on top of them, and the account's own fields (./formSetup) */
  const [savedRules, setSavedRules] = useState<FormRulesV2>(() => loadRules('console'))
  const [savedGrow, setSavedGrow] = useState<FormRulesV2>(() => loadRules('grow'))
  const [savedCustom, setSavedCustom] = useState<CustomFieldDef[]>(loadCustomFields)
  /* the builder's working copy — of the console rules, or (Grow form) of Grow's own changes */
  const [draftRules, setDraftRules] = useState<FormRulesV2>(() => (setup ? loadRules(growSetup ? 'grow' : 'console') : {}))
  const [draftCustom, setDraftCustom] = useState<CustomFieldDef[]>(() => (setup ? loadCustomFields() : []))
  /* a field added here but kept OFF the other form — that form's hide, written on Save */
  const [otherHidden, setOtherHidden] = useState<string[]>([])
  const [editing, setEditing] = useState(setup)
  const formPortal = merchantMode ? 'grow' as const : 'console' as const
  const customDefs = editing ? draftCustom : savedCustom
  const customOf = (k: string) => (isCustomKey(k) ? customDefs.find((d) => d.key === k) : undefined)
  /* the account's own fields' answers, by key */
  const [cfv, setCfv] = useState<Record<string, string>>(() =>
    Object.fromEntries((saved?.consignment?.customFields ?? []).map((f) => [f.key, f.value])))
  /* the Simplified form (owner, 2026-09-29): the original form's quick tier, moved across as it was and restyled;
     not customisable — the builder's rules apply to the regular form only */
  const [tier, setTierState] = useState<'full' | 'simplified'>(() => {
    try { return localStorage.getItem(FORM_TIER_V2_KEY) === 'simplified' ? 'simplified' : 'full' } catch { return 'full' }
  })
  const simple = !merchantMode && tier === 'simplified' && !editing
  const setTier = (t: 'full' | 'simplified') => {
    setTierState(t)
    try { localStorage.setItem(FORM_TIER_V2_KEY, t) } catch { /* private mode */ }
    setShowErrors(false)
  }
  /* owner, 2026-09-29: a field customised on the console form (hidden · renamed · More · Required) is the same on
     Grow — the saved builder rules, plus the Form Fields tab's Grow-only Required. 2026-10-05: the Grow portal form's
     own changes go on top (`formSetup.growRules`), field by field. */
  const growBase = useMemo<FormRulesV2>(() => {
    const out: FormRulesV2 = { ...savedRules }
    for (const k of behavior.required ?? []) if (!out[k]?.hidden) out[k] = { ...out[k], required: true }
    return out
  }, [savedRules, behavior])
  const growChanges = growSetup && editing ? draftRules : savedGrow
  const merchantRules = useMemo<FormRulesV2>(() => growRules(growBase, growChanges), [growBase, growChanges])
  const rules = merchantMode ? merchantRules : editing ? draftRules : savedRules
  const lockOf = (k: string): FieldLock => (byKeyMandatory(k) ? 'system' : FORM_LOCKED.has(k) ? 'form' : null)
  const baseHidden = (k: string) => !!fieldCfg[k]?.hidden || behavior.hidden.includes(k)
  const ownHidden = (k: string) => (merchantMode && MERCHANT_OFF.has(k)) || (!lockOf(k) && (rules[k]?.hidden ?? baseHidden(k)))
  const hiddenWith = (k: string): string | null => {
    const parent = FIELD_DEF.get(k)?.dependsOn
    return parent && (ownHidden(parent) || hiddenWith(parent)) ? parent : null
  }
  const isHidden = (k: string) => ownHidden(k) || !!hiddenWith(k)
  const known = (k: string) => FIELD_DEF.has(k) || !!customOf(k)
  /* a Yes / No field always holds a value — never "required", like the switches */
  const requirable = (k: string) => known(k) && !lockOf(k) && !NOT_REQUIRABLE.has(k) && customOf(k)?.kind !== 'yesno'
  const need = (k: string) => !simple && requirable(k) && !isHidden(k) && !!rules[k]?.required
  const inMore = (k: string) => movable(k) && !need(k) && (rules[k]?.more ?? DEFAULT_MORE.has(k))
  /* Format (2026-10-05): the typed-text fields; 'any' = no check (how the Grow form drops a console Format) */
  const formatable = (k: string) => FORMATABLE.has(k) || customOf(k)?.kind === 'text'
  const fmtOf = (k: string) => { const f = formatable(k) ? rules[k]?.format : undefined; return f && f.preset !== 'any' ? f : undefined }
  /* a hidden field is never checked; the Simplified form is not customisable */
  const fmtErr = (k: string, v: string | undefined | null) => (simple || isHidden(k) ? null : formatError(fmtOf(k), v))
  const fmtOk = (k: string, v: string | undefined | null) => !fmtErr(k, v)
  /* editing = the live preview: every field renders (hidden ones faded) so it can be brought back */
  /* the builder's eye (icon only): hidden fields shown faded (default) or left out while editing */
  const [showHidden, setShowHidden] = useState(true)
  /* a field the Grow portal never has (MERCHANT_OFF) stays out of its preview too — nothing to switch on */
  const hid = (key: string) => (merchantMode && MERCHANT_OFF.has(key)) || (editing ? !showHidden && isHidden(key) : isHidden(key))
  const lbl = (key: string) => rules[key]?.label?.trim() || customOf(key)?.label
    || (V2_KEYS.has(key) ? FIELD_DEF.get(key)!.defaultLabel : fieldLabel(key, fieldCfg))
  /** a rule with its defaults filled in — the Grow form keeps only what really differs from the console form */
  const norm = (k: string, r?: FieldRuleV2) => ({
    hidden: r?.hidden ?? baseHidden(k), required: !!r?.required, label: r?.label?.trim() ?? '',
    more: r?.more ?? DEFAULT_MORE.has(k), format: JSON.stringify(r?.format && r.format.preset !== 'any' ? r.format : null),
  })
  const setRule = (k: string, patch: FieldRuleV2) => setDraftRules((r) => {
    const cur: FieldRuleV2 = growSetup ? { ...growBase[k], ...r[k], ...patch } : { ...r[k], ...patch }
    if (patch.hidden) cur.required = false
    if (patch.required) cur.hidden = false
    if (!growSetup) return { ...r, [k]: cur }
    const base = norm(k, growBase[k])
    const next = norm(k, cur)
    const diff: FieldRuleV2 = {
      ...(next.hidden !== base.hidden ? { hidden: next.hidden } : {}),
      ...(next.required !== base.required ? { required: next.required } : {}),
      ...(next.label !== base.label && next.label ? { label: next.label } : {}),
      ...(next.more !== base.more ? { more: next.more } : {}),
      ...(next.format !== base.format ? { format: cur.format && cur.format.preset !== 'any' ? cur.format : { preset: 'any' as const } } : {}),
    }
    const out = { ...r }
    if (Object.keys(diff).length) out[k] = diff
    else delete out[k]
    return out
  })
  /* the Format dialog and the Add field dialog (the builder opens them) */
  const [fmtKey, setFmtKey] = useState<string | null>(null)
  const [addCard, setAddCard] = useState<CustomFieldCard | null>(null)
  const removeCustom = (k: string) => {
    setDraftCustom((ds) => ds.filter((d) => d.key !== k))
    setDraftRules((r) => withoutKeys(r, [k]))
    setOtherHidden((xs) => xs.filter((x) => x !== k))
  }
  const builder: Builder = {
    editing, portal: formPortal, known, lock: lockOf, requirable, ownHidden, isHidden, hiddenWith, required: need, inMore, label: lbl, set: setRule,
    formatable, format: fmtOf, formatError: fmtErr, editFormat: setFmtKey,
    custom: customOf, removeCustom,
    overridden: (k) => growSetup && editing && !!draftRules[k], revert: (k) => setDraftRules((r) => withoutKeys(r, [k])),
  }
  /* how goods are entered — edited with the rest of the form, saved with it (Grow may differ from the console) */
  const [savedGoods, setSavedGoods] = useState<GoodsSetting>(() => loadGoodsSetting(formPortal))
  const [draftGoods, setDraftGoods] = useState<GoodsSetting>(() => loadGoodsSetting(formPortal))
  const goodsSetting = editing ? draftGoods : savedGoods
  const startEditing = () => {
    setDraftRules(savedRules); setDraftCustom(savedCustom); setOtherHidden([]); setDraftGoods(savedGoods)
    setShowErrors(false); setEditing(true)
  }
  /* the builder opened by URL (`?edit=`) hands back to the plain console form when it is done */
  const leaveSetup = () => {
    if (!setup && !params.get('edit')) return
    const next = new URLSearchParams(params)
    next.delete('edit')
    const q = next.toString()
    nav({ pathname, search: q ? `?${q}` : '' }, { replace: true })
  }
  const cancelEditing = () => { setEditing(false); leaveSetup() }
  const sameRules = (a: FormRulesV2, b: FormRulesV2) =>
    [...new Set([...Object.keys(a), ...Object.keys(b)])].every((k) => JSON.stringify(norm(k, a[k])) === JSON.stringify(norm(k, b[k])))
  const dirty = editing && (!sameRules(draftRules, growSetup ? savedGrow : savedRules)
    || JSON.stringify(draftCustom) !== JSON.stringify(savedCustom) || draftGoods !== savedGoods)
  const saveEditing = (then?: () => void) => {
    const removed = savedCustom.filter((d) => !draftCustom.some((x) => x.key === d.key)).map((d) => d.key)
    const added = new Set(draftCustom.filter((d) => !savedCustom.some((x) => x.key === d.key)).map((d) => d.key))
    const keepOff = otherHidden.filter((k) => added.has(k))
    const mine = withoutKeys(draftRules, removed)
    const other = withoutKeys(loadRules(growSetup ? 'console' : 'grow'), removed)
    for (const k of keepOff) other[k] = { ...other[k], hidden: true }
    /* a field added on Grow and kept off the console: Grow shows it in its own right */
    if (growSetup) for (const k of keepOff) if (mine[k]?.hidden === undefined) mine[k] = { ...mine[k], hidden: false }
    saveRules(formPortal, mine)
    saveRules(growSetup ? 'console' : 'grow', other)
    saveCustomFields(draftCustom)
    saveGoodsSetting(formPortal, draftGoods)
    setSavedRules(loadRules('console')); setSavedGrow(loadRules('grow')); setSavedCustom(loadCustomFields()); setSavedGoods(loadGoodsSetting(formPortal))
    setEditing(false)
    toast.success(growSetup ? 'Grow portal form saved — merchants see it on Create Order' : 'Console form saved')
    if (then) then(); else leaveSetup()
  }
  /* the builder's Console | Grow portal switch — unsaved changes are saved or dropped first */
  const [switchTo, setSwitchTo] = useState<null | 'console' | 'grow'>(null)
  const goPortal = (p: 'console' | 'grow') => {
    const next = new URLSearchParams(params)
    next.set('edit', p)
    nav({ pathname, search: `?${next}` }, { replace: true })
  }
  const switchPortal = (p: 'console' | 'grow') => {
    if (p === formPortal) return
    if (dirty) setSwitchTo(p)
    else goPortal(p)
  }
  /* "More information" per section (and per package): open ones reveal their waiting fields in place */
  const [openSecs, setOpenSecs] = useState<Set<string>>(new Set())
  const secOpen = (id: string) => editing || openSecs.has(id)
  const toggleSec = (id: string) => setOpenSecs((st) => { const n = new Set(st); if (n.has(id)) n.delete(id); else n.add(id); return n })
  /* owner, 2026-09-29: errors only after someone tries to add the order */
  const [showErrors, setShowErrors] = useState(false)
  const custom = (key: string, registryDefault: string, copy: string) => { const l = lbl(key); return l === registryDefault ? copy : l }

  /* ---- Ship From ---- */
  const firstSender = (): Party => saved?.sender
    ?? overageStore?.party
    ?? (pr ? pr.shipFrom ?? stores.find((s) => s.code === pr.storeCode)?.party ?? blankParty()
      : stores[0]?.party ?? blankParty())
  const storeOf = (p: Party) => stores.find((s) => s.party.name === p.name && s.party.line1 === p.line1)
    ?? db.stores.find((s) => s.party.name === p.name && s.party.line1 === p.line1)
  const [sender, setSender] = useState<Party>(() => {
    const p = firstSender()
    return merchantMode && pr && !saved && !p.windowStart ? { ...p, windowStart: pr.startAt, windowEnd: pr.endAt } : p
  })
  const [senderStore, setSenderStore] = useState(() => {
    const p = firstSender()
    const st = storeOf(p)
    if (st) return st.code
    if (partyOk(p)) return OTHER_ADDRESS
    return stores.length ? stores[0].code : OTHER_ADDRESS
  })

  /* ---- Ship To (multi-drop) + RTO ---- */
  const [receiver, setReceiver] = useState<Party>(() => saved?.receiver
    ?? (pr ? pr.shipTo ?? blankParty() : jump ? { ...blankParty(), ...db.orders[2]?.receiver } : blankParty()))
  const [drops, setDrops] = useState<Party[]>(() => saved?.drops ?? [])
  const [rto, setRto] = useState<Party>(() => saved?.consignment?.rto ?? blankParty())

  /* ---- consignment fields (+ handling, instructions, RTO mode, VAS, carrier) ---- */
  const [c, setCState] = useState<ConsignmentFields>(() => {
    const qa = jump && !saved ? `QA${Date.now().toString(36).toUpperCase().slice(-8)}` : ''
    return {
      orderNumber: qa, referenceNumber: qa, consignmentNumber: '', exchangeOrderNumber: '',
      consignmentType: 'Forward', task: 'Delivery', shipByDate: today(), tags: [], labelFormat: '',
      paymentMode: '', orderAmount: null,
      schedulingConfirmation: false, dedicateTruck: ftlFirst, totalLoadingTime: null,
      clearanceRequired: false, scannable: false, splittable: false,
      specialInstructions: '', rtoMode: RTO_MODES[0], vas: [],
      carrier: qa && !merchantMode ? (ftlFirst ? CARRIERS[1].code : CARRIERS[0].code) : '',
      category: [],
      ...saved?.consignment,
      ...(saved && !saved.consignment?.vas?.length && saved.additionalServices?.length
        ? { vas: saved.additionalServices.map((sv) => ({ level: 'CONSIGNMENT' as const, skuCode: '', service: sv, serviceTimeMin: 0, remark: '' })) } : {}),
      ...(ftlFirst ? { dedicateTruck: true } : {}),
      ...(fromOverage ? { dedicateTruck: false } : {}),
    }
  })
  const setC = (patch: Partial<ConsignmentFields>) => setCState((x) => ({ ...x, ...patch }))
  const [instructions] = useState(saved?.instructions ?? '')

  /* ---- FTL variant (as AddOrderPage) ---- */
  /* Grow books a full vehicle in its Service Type card (Shared | Full vehicle) — the goods are still entered */
  const isFtl = ftlFirst && !merchantMode
  const [ftlService, setFtlService] = useState(saved?.ftlServiceType || pr?.ftlServiceType || DEFAULT_FTL_SERVICE)
  const [rows, setRows] = useState<VehicleRow[]>(() => {
    if (saved?.shipmentType === 'FTL') return rowsOf(vehiclesOf(saved))
    if (pr?.shipmentType === 'FTL') return rowsOf(vehiclesOf({ vehicleType: pr.vehicleType, vehicleUnit: pr.vehicleUnit, actualLoad: pr.expectedWeightKg, drops: [] }))
    return [{ vehicleType: '8 Ton Truck', count: 1, loadKg: 6400, addressIdx: [0] }]
  })
  const [dedicatedType, setDedicatedType] = useState(() => (saved && saved.shipmentType !== 'FTL' ? saved.vehicles?.[0]?.vehicleType ?? '' : ''))
  const vehicles = useMemo(() => vehiclesOfRows(rows), [rows])

  /* ---- packages ---- */
  const savedParcels = !saved ? null : saved.shipmentType === 'FTL' ? (merchantMode ? saved.sourceParcels ?? null : null) : saved.parcels ?? null
  const [parcels, setParcels] = useState<Parcel[]>(() => {
    if (savedParcels?.length) return savedParcels.map((p) => ({ ...p, packageId: p.packageId || newPackageId() }))
    const p = newParcel()
    if (merchantMode && jump && !fromOverage) return [{ ...p, weight: 2.5, l: 30, w: 20, h: 15, weightMode: 'manual' }]
    const w = fromOverage?.scan.weightKg
    return [fromOverage ? { ...p, weight: w ?? p.weight, weightMode: w ? 'manual' : 'auto', trackingNumber: fromOverage.scan.barcode } : p]
  })
  /* ---- goods: ITEMS = SKU-based ("Electrolux: ship 10 fridges") — pick SKUs + quantities, the
     SKU master supplies size and weight, the packages are DERIVED; PACKAGES = describe each box.
     A reopened draft is Items when every package is one SKU unit packed as itself. ---- */
  const itemsFromDraft = (): ItemLine[] | null => {
    const ps = savedParcels ?? []
    if (!ps.length) return null
    const asItem = ps.every((p) => {
      const it = p.items?.length === 1 ? p.items[0] : null
      return !!it && !!it.skuCode && it.quantity === 1 && packageValue(p, []) === CUSTOM_PACKAGE
        && p.l === (it.lengthCm ?? 0) && p.w === (it.widthCm ?? 0) && p.h === (it.heightCm ?? 0)
    })
    return asItem ? ps.map((p) => ({ id: p.packageId || newPackageId(), item: { ...p.items![0], quantity: p.quantity } })) : null
  }
  /* the account's setting decides — except an overage scan / the QA shortcut (a package: its barcode is the
     tracking number) and a reopened draft (the shape it was saved in) */
  const [draftShape] = useState<'items' | 'packages' | null>(() => (savedParcels?.length ? (itemsFromDraft() ? 'items' : 'packages') : null))
  const [lines, setLines] = useState<ItemLine[]>(() => itemsFromDraft() ?? [{ id: newPackageId(), item: blankItem() }])
  const useItems = !simple && !isFtl && !fromOverage && !jump && (draftShape ? draftShape === 'items' : goodsSetting === 'sku')
  /* packages entered as two lists (SKUs, then boxes) or as boxes with their SKUs */
  const separateLayout = goodsSetting === 'separate'
  /* "10 × fridge" = ONE package spec: quantity 10, the SKU's L × W × H, weight = the SKU's (Custom, no
     tare — what reweigh() gives), one SKU unit inside. Parcel.quantity = packages, ParcelItem.quantity = units each. */
  const itemParcels = useMemo<Parcel[]>(() => lines.filter((l) => !isBlankItem(l.item)).map((l) => ({
    ...newParcel(), packageId: l.id, packageTypeCode: CUSTOM_PACKAGE, packageTypeName: CUSTOM_PACKAGE_NAME,
    quantity: l.item.quantity, weight: round2(l.item.weightKg), weightMode: 'auto',
    l: l.item.lengthCm ?? 0, w: l.item.widthCm ?? 0, h: l.item.heightCm ?? 0,
    items: [{ ...l.item, quantity: 1 }], itemInfo: l.item.name,
  })), [lines])
  /* THE packages every reader uses — only the mode on screen is validated and saved */
  const goods = useItems ? itemParcels : parcels
  const secure = saved?.secure ?? false
  const noDg = true
  const [service, setService] = useState(() => (merchantMode
    /* Grow: no service until the lane's cards are shown (one eligible card is preselected) */
    ? (saved?.shipmentType === 'FTL' ? saved.ftlServiceType || saved.service : saved?.service ?? pr?.ftlServiceType ?? '')
    : saved && saved.shipmentType !== 'FTL' ? saved.service : SERVICES[0].code))

  const fromList = !!senderStore && senderStore !== OTHER_ADDRESS
  const allDrops = [receiver, ...drops]

  /* ---- Grow: the load type, the lane's services + ESTIMATED rates (growOrders/rates), the Ship From hub's fleet ---- */
  /* owner, 2026-09-29: Shared unless it is a full-vehicle booking — the service cards show at once */
  const [mode, setMode] = useState<BookingMode | null>(ftlFirst ? 'ftl' : 'ltl')
  const lm: BookingMode = mode ?? 'ltl'
  const [counts, setCounts] = useState<Record<string, number>>(() => {
    const vs = saved?.shipmentType === 'FTL' ? vehiclesOf(saved)
      : pr?.shipmentType === 'FTL' ? vehiclesOf({ vehicleType: pr.vehicleType, vehicleUnit: pr.vehicleUnit, actualLoad: pr.expectedWeightKg, drops: [] }) : []
    const out: Record<string, number> = {}
    for (const v of vs) if (v.vehicleType) out[v.vehicleType] = (out[v.vehicleType] ?? 0) + 1
    return out
  })
  const laneHub = useMemo(() => shipFromHubOf(fromList ? senderStore : null, sender), [fromList, senderStore, sender])
  const currency = merchantMode ? currencyForHub(laneHub, sender) : CURRENCY
  const weights = chargeableKg(goods)
  const vasNames = (c.vas ?? []).map((v) => v.service).filter(Boolean)
  const services = useMemo(() => bookableServices(), [])
  const serviceHidden = isHidden('serviceType')
  const offered = serviceHidden ? services.filter((s) => s.loadType === 'both' || s.loadType === lm).slice(0, 1) : services
  const laneOk = laneReady(sender) && allDrops.every(laneReady)
  const weightOk = goods.length > 0 && goods.every(packageReady)
  const ready = laneOk && weightOk
  const fleet: FleetVehicle[] = useMemo(() => {
    if (!merchantMode || !laneHub) return []
    const ftlCat = FTL_SERVICE_TYPES.find((t) => t.code === service)
    const fits = (name: string) => !ftlCat || ftlCat.vehicles.some((v) => name.startsWith(v))
    let list = hubVehicleTypes(laneHub).filter((v) => fits(v.name))
    if (!list.length) list = vehicleTypesFor(masters.vehicleTypes, laneHub, service || null).filter((v) => fits(v.name))
    if (!list.length && ftlCat) list = vehiclesFor(ftlCat.code).map((v) => ({ code: v.type, name: v.type, payloadKg: v.payloadKg, capacity: v.capacity }))
    const one = (code: string) => (laneReady(sender) && laneReady(receiver) && service
      ? quoteService({ code: service, name: service }, { from: sender, to: receiver, parcels: [], mode: 'ftl', currency, vehicles: [{ vehicleType: code, actualLoadKg: 0, addressIdx: [0] }] }).net
      : vehicleRate(code, currency))
    /* the booking stores the CATALOGUE type ("8 Ton Truck"); the card shows the hub's own name */
    const catalogue = (name: string) => VEHICLE_SPECS.map((x) => x.type).filter((t) => name.startsWith(t)).sort((a, b) => b.length - a.length)[0] ?? name
    const seen = new Set<string>()
    return list.map((v) => ({ ...v, code: catalogue(v.name) })).filter((v) => (seen.has(v.code) ? false : (seen.add(v.code), true)))
      .map((v) => ({ code: v.code, name: v.name, payloadKg: v.payloadKg, capacity: v.capacity, rate: one(v.code) }))
  }, [merchantMode, laneHub, service, masters.vehicleTypes, currency, sender, receiver])
  const fleetNote = laneHub ? `Vehicles configured at ${hubName(laneHub, stores) || laneHub}. Rates per vehicle for this route.` : ''
  const mVehicles: FtlVehicle[] = useMemo(() => {
    const chosen = fleet.flatMap((v) => Array.from({ length: counts[v.code] ?? 0 }, () => v.code))
    const per = chosen.length ? weights.chargeable / chosen.length : 0
    const addressIdx = allDrops.map((_, i) => i)
    return chosen.map((vehicleType) => ({ vehicleType, actualLoadKg: Math.round(per * 100) / 100, addressIdx }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fleet, counts, weights.chargeable, allDrops.length])
  const vehicleLine = [...new Set(mVehicles.map((v) => v.vehicleType))]
    .map((t) => `${mVehicles.filter((v) => v.vehicleType === t).length} × ${t}`).join(', ')
  const quotes = !merchantMode || !mode ? [] : !ready
    /* not priced yet: the cards still show, with the service's own transit days and no rate */
    ? quoteLane({ ...zoneParties('local'), parcels: [], mode: lm, currency }, offered)
    : quoteLane({
      from: sender, to: receiver, drops, parcels: goods, mode: lm, currency, vas: vasNames,
      vehicles: mode === 'ftl' ? (mVehicles.length ? mVehicles : fleet.slice(0, 1).map((v) => ({ vehicleType: v.code, actualLoadKg: weights.chargeable, addressIdx: [0] }))) : undefined,
    }, offered)
  /* one eligible service = preselected; a service the lane / mode no longer offers is dropped */
  const selected = !ready ? '' : quotes.some((q) => q.code === service) ? service : quotes.length === 1 ? quotes[0].code : ''
  const quote = quotes.find((q) => q.code === selected) ?? null
  const ftlOk = mode !== 'ftl' || mVehicles.length > 0
  /* a new load type swaps the card list and drops the chosen service */
  const changeMode = (m: BookingMode) => { if (m !== mode) setService(''); setMode(m); setC({ dedicateTruck: m === 'ftl' }) }
  const setCount = (code: string, n: number) => setCounts((cs) => ({ ...cs, [code]: n }))

  /* ---- Grow: the pickup module decides the pickup window (owner, 2026-09-25): off → none · manual → optional
     ("schedule later") · auto + ask the shipper → required · auto without asking → the computed booking is shown ---- */
  const pickupCfg = usePickupModuleConfig()
  const pickupState: 'off' | 'manual' | 'auto-ask' | 'auto-rule' = !merchantMode || !pickupCfg.enabled ? 'off'
    : pickupCfg.mode !== 'auto' ? 'manual' : pickupCfg.autoPickup.userSelectsWindow ? 'auto-ask' : 'auto-rule'
  const askWindow = pickupState === 'auto-ask'
  const pickupPol = useMemo(() => pickupPolicy(merchantCode, {
    pickupLocationCode: fromList ? senderStore : null, hubCode: laneReady(receiver) ? inboundHubFor(receiver) : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps -- pickupCfg: re-read when the module settings change
  }), [merchantCode, fromList, senderStore, receiver.city, receiver.state, pickupCfg])
  const slotOk = useMemo(() => {
    const check = policyCheck(pickupPol)
    const now = new Date()
    return (w: { startAt: string; endAt: string }) => slotWindowOk(w.startAt, w.endAt) && check(w)
      && (!askWindow || !userWindowError(w.startAt, now, pickupPol, pickupCfg.autoPickup))
  }, [pickupPol, askWindow, pickupCfg.autoPickup])
  const windowErr = askWindow && sender.windowStart ? userWindowError(sender.windowStart, new Date(), pickupPol, pickupCfg.autoPickup) : null
  const hasWindow = filled(sender.windowStart) && filled(sender.windowEnd)
  const autoWin = useMemo(() => (pickupState === 'auto-rule'
    ? autoPickupWindowFor(new Date(), pickupPol, pickupCfg.autoPickup, null) : null), [pickupState, pickupPol, pickupCfg.autoPickup])
  const autoRuleText = pickupCfg.autoPickup.dateRule === 'same-day' ? `same day, before ${pickupCfg.sameDayCutoff}`
    : pickupCfg.autoPickup.dateRule === 'days-after-order'
      ? `${pickupCfg.autoPickup.daysAfterOrder} day${pickupCfg.autoPickup.daysAfterOrder === 1 ? '' : 's'} after the order is created`
      : 'next business day'


  const fromPr = pr && isFtl ? pr : undefined
  const serviceLoad = useMemo(() => loadTypeOf(service), [service])
  const dedicatedLocked = serviceLoad !== 'both'
  const dedicated = !isFtl && (serviceLoad === 'ftl' || (serviceLoad === 'both' && !!c.dedicateTruck))
  const parcelLoadKg = goods.reduce((n, p) => n + (p.weight || 0) * (p.quantity || 0), 0)
  const shipFromHub = useMemo(() => {
    if (senderStore && senderStore !== OTHER_ADDRESS) {
      return INBOUND_HUBS.some((h) => h.code === senderStore) ? senderStore : hubOf(sender)
    }
    return filled(sender.city) || filled(sender.state) ? hubOf(sender) : null
  }, [senderStore, sender])
  /* ---- the route: each end is a customer address or a facility (a hub code), every customer is served by
     a hub (hubOf) — shipmentLegs.routeOf turns the two ends + the stop switches into legs + a movement type.
     The switches belong to one pair of ends: a new pair starts with every stop on. ---- */
  const ctype = TYPE_RULES[c.consignmentType ?? 'Forward'] ? (c.consignmentType ?? 'Forward') : 'Forward'
  const typeRule = TYPE_RULES[ctype]
  const endOf = (p: Party, code?: string): RouteEnd => {
    const lc = code ?? p.locationCode ?? ''
    if (HUB_CODES.has(lc)) return { kind: 'facility', hub: lc }
    return { kind: 'customer', hub: filled(p.city) || filled(p.state) ? hubOf(p) : null }
  }
  const fromEnd = endOf(sender, fromList ? senderStore : undefined)
  const toEnd = endOf(receiver)
  /* ---- Shipment legs = the user's CHOICE (owner, 2026-09-29: the "Legs to be created" design): Via hub + First
     Mile · Line Haul · Last Mile, or Pick & Del (one trip, no hub) — the eight movement types. The legs decide what each end
     is: First Mile on = Ship From is an address (merchant / customer), off = a hub; Last Mile likewise for Ship To.
     Line Haul follows the two ends' hubs until someone sets it. A Transfer is Line Haul only. ---- */
  /* null = follows the chosen address (FM / LM: an address = on, a hub = off; LH: the two hubs differ) until someone sets it */
  const [legChoice, setLegChoice] = useState<{ mode: LegChoice['mode']; fm: boolean | null; lm: boolean | null; lh: boolean | null }>(() => {
    const m = saved?.consignment?.movementType
    if (m && (MOVEMENT_TYPES as readonly string[]).includes(m)) { const l = legsOfMovement(m as MovementType); return { ...l, lh: l.mode === 'hub' ? l.lh : null } }
    return { mode: 'hub', fm: null, lm: null, lh: null }
  })
  const isTransfer = ctype === 'Transfer'
  const legsDirect = !isTransfer && legChoice.mode === 'direct'
  const legFm = !isTransfer && !legsDirect && (legChoice.fm ?? fromEnd.kind !== 'facility')
  const legLm = !isTransfer && !legsDirect && (legChoice.lm ?? toEnd.kind !== 'facility')
  const originHub = fromEnd.hub
  const destHub = toEnd.hub
  const hubsDiffer = !!originHub && !!destHub && originHub !== destHub
  /* auto: hub → hub always hauls; otherwise only when the two ends are served by different hubs */
  const lhAuto = !(legFm || legLm) || hubsDiffer
  const legLh = !legsDirect && (isTransfer || (legChoice.lh ?? lhAuto))
  const legs: LegChoice = { mode: legsDirect ? 'direct' : 'hub', fm: legFm, lh: legLh, lm: legLm }
  const legList = legsOf(legs)
  const movementType = movementOfLegs(legs)
  /* what each end must be under these legs */
  const fromIsAddress = legsDirect || legFm
  const toIsAddress = legsDirect || legLm
  const hasAddr = (p: Party) => filled(p.name) || filled(p.line1) || filled(p.city)
  /* a leg SET by hand (or Direct) narrows its end's picker to the matching kind; a following leg leaves both kinds open */
  const fromRestricted = legsDirect || legChoice.fm !== null
  const toRestricted = legsDirect || legChoice.lm !== null
  const fromKindBad = !merchantMode && !isTransfer && fromRestricted && hasAddr(sender) && (fromEnd.kind === 'facility') === fromIsAddress
  const toKindBad = !merchantMode && !isTransfer && toRestricted && hasAddr(receiver) && (toEnd.kind === 'facility') === toIsAddress
  const sameHubBothEnds = !legFm && !legLm && !legsDirect && fromEnd.kind === 'facility' && toEnd.kind === 'facility' && fromEnd.hub === toEnd.hub && !!fromEnd.hub
  /* a Transfer moves between two facilities */
  const transferOk = ctype !== 'Transfer' || (fromEnd.kind === 'facility' && toEnd.kind === 'facility')
  const hubVehicles = vehicleTypesFor(masters.vehicleTypes, shipFromHub)
  const vehicleChoice = hubVehicles.some((v) => v.code === dedicatedType) ? dedicatedType : ''
  const vehicleOpts = vehicleTypesFor(masters.vehicleTypes, shipFromHub, isFtl ? ftlService : null)
  const payloadOf = (type: string) => vehicleTypeOf(masters.vehicleTypes, type)?.payloadKg ?? 0
  const units = vehicles.length
  const vehicleType = vehicles[0]?.vehicleType ?? ''
  const actualLoad = totalLoadKg(vehicles)
  const addServices = (c.vas ?? []).map((v) => v.service).filter(Boolean)
  const vasTotal = addServices.reduce((n, sv) => n + vasPrice(sv), 0)
  const parcelSvc = SERVICES.find((s) => s.code === service) ?? { ...SERVICES[0], code: service || SERVICES[0].code }
  const svc = isFtl
    ? { code: ftlService, days: ftlServiceType(ftlService).days, price: ftlQuoteVehicles(vehicles, drops.length, addServices) }
    : { ...parcelSvc, price: parcelSvc.price + vasTotal }
  const addressOptions = allDrops.map((d, i) => ({ value: String(i), label: `Address ${i + 1}${d.name ? ` · ${d.name}` : ''}${d.city ? `, ${d.city}` : ''}` }))
  const uncovered = allDrops.map((_, i) => i).filter((i) => !vehicles.some((v) => v.addressIdx.includes(i)))
  const overloaded = vehicles.filter((v) => payloadOf(v.vehicleType) > 0 && v.actualLoadKg > payloadOf(v.vehicleType))
  const capacityKg = vehicles.reduce((n, v) => n + payloadOf(v.vehicleType), 0)
  const skuLines = goods.flatMap((p, i) => (p.items ?? []).map((it, k) => ({ it, i, k })))
  const skuLineOpts = useMemo(() => {
    const seen = new Set<string>()
    return goods.flatMap((p) => p.items ?? []).filter((it) => !isBlankItem(it))
      .map((it) => ({ value: it.skuCode ?? it.name.trim(), label: it.skuCode ? `${it.skuCode} · ${it.name}` : it.name.trim() }))
      .filter((o) => (seen.has(o.value) ? false : (seen.add(o.value), true)))
  }, [goods])

  /* ---- identifiers: the account's identifier setting (Order / Reference / both) ---- */
  /* the Simplified form asks one number; the reference copies it (the original's rule) */
  const idPref = simple ? 'orderNumber' : behavior.identifier
  const effectiveOrder = (idPref === 'referenceNumber' ? c.referenceNumber : c.orderNumber) ?? ''
  const effectiveRef = (idPref === 'orderNumber' ? c.orderNumber : c.referenceNumber) ?? ''

  /* ------------------------------------------------ completion + validation
     = AddOrderPage's Regular required set + the builder's "required" rules (only for shown fields) */
  const needOk = (k: string, ok: boolean) => (need(k) ? [ok] : [])
  const str = (v: unknown) => (v == null ? '' : String(v))
  /* the account's own fields in a card (2026-10-05): Required + Format */
  const customReq = (card: CustomFieldCard) => customDefs.filter((d) => d.card === card)
    .flatMap((d) => [...needOk(d.key, filled(cfv[d.key])), fmtOk(d.key, cfv[d.key])])
  const consignmentReq = [filled(effectiveOrder), filled(effectiveRef), !!c.consignmentType, filled(c.shipByDate), ...(merchantMode ? [] : [!!merchant]),
    ...needOk('consignmentNumber', filled(c.consignmentNumber)),
    /* an Exchange names the order it exchanges (owner, 2026-09-29: fields follow the type) */
    ...(!simple && ctype === 'Exchange' && !hid('exchangeOrderNumber') ? [filled(c.exchangeOrderNumber)] : []),
    /* Simplified: the delivery Start / End time on the Ship By Date are required (the original's rule) */
    ...(simple ? [filled(timeOf(receiver.windowStart)), filled(timeOf(receiver.windowEnd))] : []),
    ...(typeRule.payment ? [...needOk('paymentMode', !!c.paymentMode), ...needOk('orderAmount', (c.orderAmount ?? 0) > 0)] : []),
    /* Format rules on the numbers as typed (a copied identifier is checked where it is typed) */
    ...(idPref !== 'referenceNumber' ? [fmtOk('orderNumber', c.orderNumber)] : []),
    ...(idPref !== 'orderNumber' ? [fmtOk('referenceNumber', c.referenceNumber)] : []),
    fmtOk('consignmentNumber', c.consignmentNumber),
    ...(ctype === 'Exchange' ? [fmtOk('exchangeOrderNumber', c.exchangeOrderNumber)] : []),
    ...customReq('sec-consignment'),
  ]
  /** what an address still misses, in words (the card says it) — base required + the builder's rules */
  const missingOf = (p: Party, role: 'from' | 'to' | 'rto'): string[] => {
    if (role !== 'rto' && (role === 'from' ? fromEnd.kind === 'facility' : HUB_CODES.has(p.locationCode ?? ''))) return []
    const out: string[] = []
    const add = (ok: boolean, label: string) => { if (!ok) out.push(label) }
    add(filled(p.name), role === 'to' ? 'Customer Name' : 'Sender Name')
    if (role !== 'from') add(filled(p.contactNumber), 'Contact Number')
    add(filled(p.line1), 'Address Line 1'); add(filled(p.country), 'Country'); add(filled(p.state), 'State'); add(filled(p.city), 'City')
    if (role === 'rto') add(filled(p.postalCode), 'Postal Code')
    if (need('addrEmail')) add(filled(p.email), lbl('addrEmail'))
    if (need('addrCompanyName')) add(filled(p.businessName), lbl('addrCompanyName'))
    if (need('addrLines23')) add(filled(p.line2), 'Address Line 2')
    if (need('addrLandmark')) add(filled(p.landmark), lbl('addrLandmark'))
    if (need('addrSuburb')) add(filled(p.county), lbl('addrSuburb'))
    if (role !== 'rto' && need('addrCoordinates')) add(filled(str(p.latitude)) && filled(str(p.longitude)), 'Latitude & Longitude')
    if (role !== 'rto' && need('addrFloorLift')) add(filled(str(p.floorNumber)), 'Floor Number')
    return out
  }
  /** what an address has typed in the wrong format (the builder's Format rules) — the card says it */
  const invalidOf = (p: Party, role: 'from' | 'to' | 'rto'): string[] => {
    if (role !== 'rto' && (role === 'from' ? fromEnd.kind === 'facility' : HUB_CODES.has(p.locationCode ?? ''))) return []
    const typed: [string, string | undefined][] = [['addrCompanyName', p.businessName], ['addrEmail', p.email],
      ['addrLandmark', p.landmark], ['addrSuburb', p.county], ['addrContact', p.contactNumber]]
    return typed.filter(([k, v]) => !fmtOk(k, v)).map(([k]) => lbl(k))
  }
  /* the pickup / delivery window lives on the card, not in the address */
  const windowOk = (p: Party) => !need('addrWindow') || (filled(p.windowStart) && filled(p.windowEnd))
  const fromReq = [missingOf(sender, 'from').length === 0, invalidOf(sender, 'from').length === 0,
    /* Grow: the pickup window follows the pickup module (asked only when manual, required when auto asks) */
    ...(!merchantMode || pickupState === 'manual' ? [windowOk(sender)] : []), ...(askWindow ? [hasWindow, !windowErr] : [])]
  const toReq = allDrops.flatMap((d) => [missingOf(d, 'to').length === 0, invalidOf(d, 'to').length === 0, windowOk(d)])
  const rtoReq = simple || !typeRule.rto || c.rtoMode === RTO_MODES[0] ? [true] : [missingOf(rto, 'rto').length === 0, invalidOf(rto, 'rto').length === 0]
  /* the two ends must make a route (not the same hub twice; a Transfer = two facilities) */
  const routeReq = merchantMode ? [] : [legList.length > 0, transferOk, !sameHubBothEnds, !fromKindBad, !toKindBad]
  const pieceReq = isFtl
    ? [!!ftlService, vehicles.length > 0, uncovered.length === 0,
      ...rows.map((r) => !!r.vehicleType && r.count >= 1 && r.loadKg > 0 && r.addressIdx.length > 0), noDg]
    : [...goods.map((p) => p.quantity > 0 && (simple || p.weight > 0)), noDg,
      /* package-level rules apply where packages are typed (Items mode derives them) */
      ...(useItems ? [] : parcels.flatMap((p) => [...needOk('pkgTracking', filled(p.trackingNumber)),
        ...needOk('pkgPalletSpace', filled(p.palletSpace)), ...needOk('pkgDescription', filled(p.description)),
        fmtOk('pkgTracking', p.trackingNumber), fmtOk('pkgPalletSpace', p.palletSpace), fmtOk('pkgDescription', p.description)]))]
  const skuLineOk = (it: ParcelItem) => !!it.skuCode && filled(it.name) && it.quantity >= 1 && it.weightKg > 0
    && (it.lengthCm ?? 0) > 0 && (it.widthCm ?? 0) > 0 && (it.heightCm ?? 0) > 0
  const skuRuleOk = (it: ParcelItem) => [...needOk('skuCategory', filled(it.category)), ...needOk('skuDescription', filled(it.description)),
    ...needOk('skuHsn', filled(it.hsnCode)), ...needOk('skuImage', filled(it.imageUrl)), ...needOk('skuUnitCost', (it.unitCost ?? 0) > 0),
    fmtOk('skuDescription', it.description), fmtOk('skuHsn', it.hsnCode), fmtOk('skuImage', it.imageUrl)].every(Boolean)
  /* Simplified asks a SKU's code / name only */
  const skuReq = isFtl ? [] : skuLines.map(({ it }) => (simple ? isBlankItem(it) || filled(it.name) : skuLineOk(it) && skuRuleOk(it)))
  const vasReq = simple || isHidden('vas') ? [] : (c.vas ?? []).map(vasOk)
  /* Items mode needs at least one SKU picked (a blank line is ignored) */
  const goodsReq = useItems && !typeRule.goodsOptional ? [itemParcels.length > 0] : []
  const carrierReq = merchantMode ? [] : [!!c.carrier]
  /* owner, 2026-09-29: Vehicle Type is optional; Service Type is required */
  const vehicleReq: boolean[] = []
  const serviceReq = merchantMode
    /* Grow: a load type, a priced service card and (full vehicle) at least one vehicle */
    ? [!!mode, !!quote, ftlOk, ...needOk('labelFormat', !!c.labelFormat)]
    : [...vehicleReq, !!(isFtl ? ftlService : service), ...needOk('labelFormat', !!c.labelFormat),
      ...needOk('totalLoadingTime', (c.totalLoadingTime ?? 0) > 0)]
  const handlingReq = [...needOk('tags', (c.tags ?? []).length > 0), ...customReq('sec-handling')]
  const extrasReq = [...vasReq, ...needOk('specialInstructions', filled(c.specialInstructions)), fmtOk('specialInstructions', c.specialInstructions),
    ...customReq('sec-service')]
  const allReq = [...consignmentReq, ...serviceReq, ...fromReq, ...toReq, ...rtoReq, ...routeReq, ...goodsReq, ...pieceReq, ...skuReq,
    ...handlingReq, ...extrasReq, ...carrierReq]
  const filledCount = allReq.filter(Boolean).length
  const canSubmit = filledCount === allReq.length
  const missingCount = allReq.length - filledCount
  const done = (xs: boolean[]) => xs.every(Boolean)

  /* ------------------------------------------------------------ mutations */
  const setParcel = (i: number, patch: Partial<Parcel>) => setParcels((ps) => ps.map((x, j) => (j === i ? { ...x, ...patch } : x)))
  const setRow = (i: number, patch: Partial<VehicleRow>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)))
  const addVehicle = () => setRows((rs) => [...rs, {
    vehicleType: rs[rs.length - 1]?.vehicleType || vehicleOpts[0]?.code || '', count: 1, loadKg: 0, addressIdx: uncovered,
  }])
  const removeVehicle = (i: number) => setRows((rs) => rs.filter((_, j) => j !== i))
  const pickFtlService = (code: string) => {
    setFtlService(code)
    const allowed = vehicleTypesFor(masters.vehicleTypes, shipFromHub, code)
    setRows((rs) => rs.map((r) => ({ ...r, vehicleType: allowed.some((v) => v.code === r.vehicleType) ? r.vehicleType : allowed[0]?.code ?? '' })))
  }
  const setDedicateTruck = (on: boolean) => setC({ dedicateTruck: on })
  const setDrop = (i: number, patch: Partial<Party>) => setDrops((ds) => ds.map((x, j) => (j === i ? { ...x, ...patch } : x)))
  const removeDrop = (i: number) => {
    const idx = i + 1
    setDrops((ds) => ds.filter((_, j) => j !== i))
    setRows((rs) => rs.map((r) => ({ ...r, addressIdx: r.addressIdx.filter((a) => a !== idx).map((a) => (a > idx ? a - 1 : a)) })))
  }
  const pickPackageType = (i: number, code: string) => {
    const t = packageTypes.find((x) => x.code === code)
    setParcels((ps) => ps.map((x, j) => (j === i ? reweigh(t
      ? { ...x, packageTypeCode: t.code, packageTypeName: t.name, l: t.lengthCm, w: t.widthCm, h: t.heightCm }
      : { ...x, packageTypeCode: CUSTOM_PACKAGE, packageTypeName: CUSTOM_PACKAGE_NAME }, packageTypes) : x)))
  }
  const setItems = (i: number, f: (items: ParcelItem[]) => ParcelItem[]) =>
    setParcels((ps) => ps.map((x, j) => (j === i ? reweigh({ ...x, items: f(x.items ?? []) }, packageTypes) : x)))
  const [focusLine, setFocusLine] = useState<{ i: number; k: number } | null>(null)
  const addItem = (i: number) => {
    setFocusLine({ i, k: (parcels[i].items ?? []).length })
    setItems(i, (items) => [...items, blankItem()])
  }
  /** line `k` of package `i`, created blank when a row edits a SKU that is not there yet (the Simplified table) */
  const padTo = (items: ParcelItem[], k: number) => (items.length > k ? items : [...items, ...Array.from({ length: k + 1 - items.length }, blankItem)])
  const pickSku = (i: number, k: number, s: SkuItem) =>
    setItems(i, (items) => padTo(items, k).map((it, m) => (m === k ? {
      ...it, skuCode: s.code, name: s.name, weightKg: s.weightKg, weightUom: 'KG', hsnCode: s.hsnCode, originCountry: s.originCountry,
      category: it.category || s.category, lengthCm: s.lengthCm, widthCm: s.widthCm, heightCm: s.heightCm, dimUom: 'CM',
      quantity: it.quantity || 1, ...(s.unitCost ? { unitCost: s.unitCost } : {}),
    } : it)))
  const setItem = (i: number, k: number, patch: Partial<ParcelItem>) =>
    setItems(i, (items) => padTo(items, k).map((it, m) => (m === k ? { ...it, ...patch } : it)))
  const removeItem = (i: number, k: number) => setItems(i, (items) => items.filter((_, m) => m !== k))
  /** a SKU line to another package (the two-list layout's Package column) */
  const moveItem = (from: number, k: number, to: number) => {
    const it = parcels[from]?.items?.[k]
    if (to === from || !it) return
    setParcels((ps) => ps.map((x, j) => (j === from ? reweigh({ ...x, items: (x.items ?? []).filter((_, m) => m !== k) }, packageTypes)
      : j === to ? reweigh({ ...x, items: [...(x.items ?? []), it] }, packageTypes) : x)))
  }
  /** remove a package; in the two-list layout its SKUs stay (they move to the first package) */
  const removeParcel = (i: number) => setParcels((ps) => {
    if (ps.length <= 1) return ps
    const orphans = (ps[i].items ?? []).filter((it) => !isBlankItem(it))
    const rest = ps.filter((_, j) => j !== i)
    if (separateLayout && orphans.length) rest[0] = reweigh({ ...rest[0], items: [...(rest[0].items ?? []), ...orphans] }, packageTypes)
    return rest
  })
  const setLine = (id: string, patch: Partial<ParcelItem>) =>
    setLines((ls) => ls.map((l) => (l.id === id ? { ...l, item: { ...l.item, ...patch } } : l)))
  const pickLineSku = (id: string, s: SkuItem) => setLine(id, {
    skuCode: s.code, name: s.name, weightKg: s.weightKg, weightUom: 'KG', hsnCode: s.hsnCode, originCountry: s.originCountry,
    category: s.category, lengthCm: s.lengthCm, widthCm: s.widthCm, heightCm: s.heightCm, dimUom: 'CM',
    ...(s.unitCost ? { unitCost: s.unitCost } : {}),
  })
  const [focusItem, setFocusItem] = useState<string | null>(null)
  const addLine = () => { const id = newPackageId(); setFocusItem(id); setLines((ls) => [...ls, { id, item: blankItem() }]) }
  const removeLine = (id: string) => setLines((ls) => (ls.length > 1 ? ls.filter((l) => l.id !== id) : [{ id: newPackageId(), item: blankItem() }]))
  const setVas = (i: number, patch: Partial<VasLine>) => setC({ vas: (c.vas ?? []).map((v, j) => (j === i ? { ...v, ...patch } : v)) })

  const pickSender = (code: string) => {
    if (code === OTHER_ADDRESS) {
      setSenderStore(OTHER_ADDRESS)
      setSender((s) => (storeOf(s) ? blankParty() : s))
      return
    }
    const st = stores.find((s) => s.code === code) ?? db.stores.find((s) => s.code === code)
    if (!st) return
    setSenderStore(code)
    setSender({ ...st.party, locationCode: code })
  }
  const senderOptions = useMemo(() => {
    if (!senderStore || senderStore === OTHER_ADDRESS
      || pickup.options.some((o) => o.value === senderStore)) return pickup.options
    const st = db.stores.find((x) => x.code === senderStore)
    return [{ value: senderStore, label: st ? storeOptionLabel(st) : senderStore }, ...pickup.options]
  }, [pickup.options, senderStore, db.stores])

  /* the masters resolve after mount and Merchant can change: re-default Ship From when the LIST changes */
  const listKey = useMemo(() => pickup.options.map((o) => o.value).join('|'), [pickup.options])
  const [autoKey, setAutoKey] = useState<string | null>(null)
  const dictated = !!(saved || pr || fromOverage)
  useEffect(() => {
    if (dictated || autoKey === listKey) return
    const next = stores[0]
    /* eslint-disable react-hooks/set-state-in-effect -- synchronising with the external masters store */
    setAutoKey(listKey)
    setSenderStore(next?.code ?? OTHER_ADDRESS)
    setSender(next ? { ...next.party, locationCode: next.code } : blankParty())
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [dictated, listKey, autoKey, stores])

  /* the Grow form's preview leaves a merchant's session draft alone */
  useEffect(() => { if (!growSetup) clearDraftKeys() }, [growSetup])
  const jumpTarget = jump === 1 ? (isFtl ? 'sec-vehicle' : 'sec-packages') : jump === 2 ? (merchantMode ? 'sec-service' : 'sec-carrier') : null
  useEffect(() => {
    if (!jumpTarget) return
    const t = setTimeout(() => document.getElementById(jumpTarget)?.scrollIntoView({ block: 'start' }), 150)
    return () => clearTimeout(t)
  }, [jumpTarget])

  /* a Reverse collects from the customer — its pickup point is that address, never a merchant store */
  const draftStoreCode = fromList ? senderStore : ctype === 'Reverse' ? codeFor(sender)
    : pr?.storeCode ?? saved?.storeCode ?? stores[0]?.code ?? codeFor(sender)

  /* the account's own fields, as asked on this form — a snapshot with their labels (the views read it) */
  const customAnswers = (): CustomFieldValue[] => {
    const asked = customDefs.filter((d) => !isHidden(d.key))
    /* an answer this form does not ask (the field was hidden or removed since) is kept as it was saved */
    const kept = (saved?.consignment?.customFields ?? []).filter((f) => !asked.some((d) => d.key === f.key))
    return [...asked.filter((d) => filled(cfv[d.key])).map((d) => ({ key: d.key, label: lbl(d.key), value: cfv[d.key].trim(), kind: d.kind })), ...kept]
  }

  /* the SAME OrderDraft AddOrderPage's Regular tier builds */
  const buildDraft = (): OrderDraft => ({
    orderId: draftId ?? undefined,
    storeCode: draftStoreCode,
    sender: fromList ? { ...sender, locationCode: senderStore } : sender,
    receiver, drops, shipmentType: isFtl ? 'FTL' : 'Parcel',
    ...(isFtl
      ? { vehicleType, vehicleUnit: units, actualLoad, ftlServiceType: ftlService, vehicles }
      : vehicleChoice
        ? { vehicleType: vehicleChoice, vehicleUnit: 1, actualLoad: parcelLoadKg, vehicles: [{ vehicleType: vehicleChoice, actualLoadKg: parcelLoadKg, addressIdx: [0] }] }
        : { vehicleType: '', vehicleUnit: 0, actualLoad: 0 }),
    additionalServices: addServices,
    parcels: isFtl
      ? [{ cargoType: 'FTL', itemInfo: [ftlService, ...vehicles.map((v) => v.vehicleType), ...addServices].join(' · '), quantity: units, weight: actualLoad / Math.max(1, units), l: 120, w: 100, h: 150 }]
      : goods.map((p) => ({ ...p, items: (p.items ?? []).filter((it) => !isBlankItem(it)), itemInfo: itemInfoOf(p) })),
    authority: saved?.authority || 'Leave at the door', instructions, secure, service: svc.code, rate: svc.price, etaDays: svc.days,
    consignment: {
      ...c,
      dedicateTruck: isFtl || dedicated,
      orderNumber: effectiveOrder.trim(), referenceNumber: effectiveRef.trim(),
      /* owner, 2026-09-29: no fallback — a blank Consignment Number stays blank */
      consignmentNumber: c.consignmentNumber?.trim() ?? '',
      merchantCode: merchant?.code ?? null, merchantName: merchant?.name ?? '',
      rto: typeRule.rto && c.rtoMode === RTO_MODES[1] ? rto : null,
      /* a value a type does not ask is not kept (a COD amount left behind by a switch to Transfer) */
      ...(typeRule.rto ? {} : { rtoMode: RTO_MODES[0] }),
      ...(typeRule.payment ? {} : { paymentMode: '', orderAmount: null }),
      ...(ctype === 'Exchange' ? {} : { exchangeOrderNumber: '' }),
      /* how it moves (shipmentLegs) */
      ...(movementType ? { movementType } : {}),
      /* the legs are chosen outright now — the old stop switches are never set */
      skipFirstMileInbound: false, skipLastMile: false, directPickAndDeliver: legsDirect,
      packages: isFtl ? [] : goods.map((p) => ({
        packageId: p.packageId, packageType: p.packageTypeName || CUSTOM_PACKAGE_NAME, quantity: p.quantity,
        trackingNumber: p.trackingNumber ?? '', palletSpace: p.palletSpace ?? '', description: p.description ?? '',
      })),
      customFields: simple ? saved?.consignment?.customFields ?? [] : customAnswers(),
    },
    formMode: simple ? 'simplified' : 'full',
  })

  /* Grow's OrderDraft: the lane's service + ESTIMATED rate + currency, the full-vehicle shape with its packages as
     sourceParcels, the signed-in merchant recorded silently; the window only where the pickup module asks for one */
  const buildMerchantDraft = (): OrderDraft => {
    const ftl = mode === 'ftl'
    const units = mVehicles.length
    const load = mVehicles.reduce((n, v) => n + v.actualLoadKg, 0)
    const svcCode = selected || service
    const cleanParcels = goods.map((p) => ({ ...p, items: (p.items ?? []).filter((it) => !isBlankItem(it)), itemInfo: itemInfoOf(p) }))
    const from = fromList ? { ...sender, locationCode: senderStore } : sender
    return {
      orderId: resumeId ?? undefined,
      storeCode: draftStoreCode,
      sender: (pickupState === 'manual' || askWindow) && hasWindow ? from : { ...from, windowStart: '', windowEnd: '' },
      receiver, drops, shipmentType: ftl ? 'FTL' : 'Parcel',
      ...(ftl
        ? { vehicleType: mVehicles[0]?.vehicleType ?? '', vehicleUnit: units, actualLoad: load, ftlServiceType: svcCode, vehicles: mVehicles, sourceParcels: cleanParcels }
        : { vehicleType: '', vehicleUnit: 0, actualLoad: 0 }),
      additionalServices: vasNames,
      /* a full vehicle keeps the one synthetic FTL line every reader expects */
      parcels: ftl
        ? [{ cargoType: 'FTL', itemInfo: [svcCode, ...mVehicles.map((v) => v.vehicleType), ...vasNames].join(' · '), quantity: Math.max(1, units), weight: load / Math.max(1, units), l: 120, w: 100, h: 150 }]
        : cleanParcels,
      authority: saved?.authority || 'Leave at the door', instructions, secure,
      service: svcCode, rate: quote?.net ?? 0, etaDays: quote?.days ?? 0, currency,
      consignment: {
        ...c,
        dedicateTruck: ftl, carrier: '', category: [], tags: [], totalLoadingTime: null,
        orderNumber: effectiveOrder.trim(), referenceNumber: effectiveRef.trim(),
        consignmentNumber: c.consignmentNumber?.trim() || effectiveRef.trim(),
        merchantCode: merchant?.code ?? null, merchantName: merchant?.name ?? '',
        rto: typeRule.rto && c.rtoMode === RTO_MODES[1] ? rto : null,
        ...(typeRule.rto ? {} : { rtoMode: RTO_MODES[0] }),
        ...(typeRule.payment ? {} : { paymentMode: '', orderAmount: null }),
        ...(ctype === 'Exchange' ? {} : { exchangeOrderNumber: '' }),
        packages: ftl ? [] : goods.map((p) => ({
          packageId: p.packageId, packageType: p.packageTypeName || CUSTOM_PACKAGE_NAME, quantity: p.quantity,
          trackingNumber: p.trackingNumber ?? '', palletSpace: '', description: p.description ?? '',
        })),
        customFields: customAnswers(),
      },
      formMode: 'full',
    }
  }

  const backTo = merchantMode
    ? (pr ? prPath(pr.id) : fromOverage ? prPath(fromOverage.pr.id) : draftId ? '/grow/orders?tab=drafts' : '/grow/orders')
    : fromPr ? prPath(fromPr.id) : fromOverage ? prPath(fromOverage.pr.id) : base


  /* ------------------------------------------------------------ the account's own fields (2026-10-05)
     Rendered in their card's grid and configured like any other field (rename · Required · More · Format · hide). */
  const customNode = (d: CustomFieldDef): ReactNode => {
    const v = cfv[d.key] ?? ''
    const set = (x: string) => setCfv((m) => ({ ...m, [d.key]: x }))
    if (d.kind === 'yesno') return (
      <SFld key={d.key} label={lbl(d.key)} fieldKey={d.key}>
        <label className="flex h-8 cursor-pointer items-center gap-2.5 text-[13px] text-ink">
          <Toggle checked={v === 'true'} onChange={(on) => set(on ? 'true' : 'false')} />{v === 'true' ? 'Yes' : 'No'}
        </label>
      </SFld>
    )
    return <F key={d.key} fieldKey={d.key} label={lbl(d.key)} value={v} placeholder={d.placeholder}
      type={d.kind === 'number' ? 'number' : d.kind === 'date' ? 'date' : undefined}
      options={d.kind === 'list' ? opts(d.options ?? []) : undefined} onChange={set} />
  }
  const customEntries = (card: CustomFieldCard): RevealEntry[] => customDefs
    .filter((d) => d.card === card && !hid(d.key))
    .map((d): RevealEntry => [d.key, customNode(d), filled(cfv[d.key])])
  /** while editing: a card's "+ Add field" */
  const addFieldLink = (card: CustomFieldCard, className = 'mt-6') => (editing ? (
    <div className={className}><AddRowLink label="Add field" onClick={() => setAddCard(card)} /></div>
  ) : null)

  /* ---- the sections, in dependency order. Parcel: the packages come before Service (Load type and
     the dedicated truck read their weight); FTL: the Service Type comes before the vehicles (it
     narrows the vehicle types). ---- */
  /* Handling shows only when something in it is visible (see the card) */
  const handlingChipsVisible = GOODS_CATEGORIES.some(({ name }) => !hid(catKey(name)))
  const handlingTogglesVisible = !hid('scannable') || !hid('splittable') || !hid('clearanceRequired') || !hid('tags')
  const handlingCustom = revealEntries(customEntries('sec-handling'), inMore, secOpen('sec-handling'))
  /* while editing the card always shows — its "+ Add field" lives in it */
  const handlingVisible = handlingChipsVisible || handlingTogglesVisible || handlingCustom.nodes.length > 0 || handlingCustom.waiting > 0 || editing
  const sections = merchantMode ? ['sec-consignment', 'sec-parties', 'sec-packages', 'sec-handling', 'sec-extras', 'sec-service'] : simple ? ['sec-consignment', 'sec-parties', isFtl ? 'sec-vehicle' : 'sec-packages', 'sec-carrier'] : isFtl
    ? ['sec-consignment', 'sec-parties', 'sec-service', 'sec-vehicle', ...(handlingVisible ? ['sec-handling'] : []), 'sec-carrier']
    : ['sec-consignment', 'sec-parties', 'sec-packages', ...(handlingVisible ? ['sec-handling'] : []), 'sec-service', 'sec-carrier']
  const doneOf: Record<string, boolean> = {
    'sec-consignment': done(consignmentReq),
    'sec-parties': done(fromReq) && done(toReq) && done(rtoReq) && done(routeReq),
    'sec-packages': done(goodsReq) && done(pieceReq) && done(skuReq),
    'sec-vehicle': done(pieceReq),
    'sec-handling': done(handlingReq),
    /* owner, 2026-09-29: Service and Instructions & services are ONE card */
    'sec-service': done(serviceReq) && done(extrasReq),
    'sec-carrier': done(carrierReq),
    ...(merchantMode ? { 'sec-extras': done(extrasReq), 'sec-service': done(serviceReq) } : {}),
  }

  const proceed = () => {
    if (editing) return
    if (!canSubmit) {
      /* the first attempt turns the errors on; the page jumps to the first incomplete section */
      setShowErrors(true)
      const first = sections.find((s) => !doneOf[s])
      if (first) setTimeout(() => jumpTo(first), 60)
      return
    }
    if (merchantMode) {
      /* Grow: the booking goes to checkout (payment), which creates the order */
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify(buildMerchantDraft()))
      setDraftSidecar({ pickupId: pr?.id ?? null, overage: fromOverage ? { prId: fromOverage.pr.id, overageId: fromOverage.scan.id } : null })
      nav('/grow/orders/checkout')
      return
    }
    if (liveEdit && draftId) {
      const m = growOrderActions.modifyOrder(draftId, buildDraft())
      clearDraftKeys()
      if (m) toast.success(`Consignment ${m.orderNumber} updated`)
      nav(base)
      return
    }
    const o = growOrderActions.saveDraft(buildDraft(), draftId ?? undefined)
    growOrderActions.markPaid(o.id)
    clearDraftKeys()
    if (fromPr && growOrderActions.attachOrdersToPickup(fromPr.id, [o.id]).length > 0) {
      toast.success(`Consignment ${o.orderNumber} created and added to ${fromPr.number}`)
      nav(prPath(fromPr.id))
      return
    }
    /* a first-mile pickup request only when the route starts with a Pickup leg (FM exists only then) */
    const auto = hasPickupLeg(movementType) ? growOrderActions.autoBookOnConsignment(o.id, merchantCode) : null
    toast.success(auto ? `Consignment ${o.orderNumber} created · Pickup Request ${auto.number} scheduled` : `Consignment ${o.orderNumber} created`)
    nav(base)
  }

  const saveForLater = () => {
    const o = growOrderActions.saveDraft(buildMerchantDraft(), resumeId ?? undefined)
    clearDraftKeys()
    toast.success(`Order ${o.orderNumber} saved to Drafts`)
    nav('/grow/orders?tab=drafts')
  }

  /* ------------------------------------------------------------ 1 · Consignment details */
  const err = (bad: boolean) => (bad ? 'Required field.' : undefined)
  const categories = c.category ?? []
  const hasCat = (name: string) => categories.includes(name)
  const toggleCategory = (name: string, on: boolean) =>
    setC({ category: on ? [...categories.filter((x) => x !== name), name] : categories.filter((x) => x !== name) })
  const consignmentSection = (
    <FormCard id="sec-consignment" title="Consignment details"
      caption={merchantMode ? 'How it is identified, its type, when it ships and how it is paid.' : 'Who it is for, how it is identified, its type, when it ships and how it is paid.'}>
      {(() => {
        const r = revealEntries([
          /* Merchant first: it decides the Ship From addresses and the package presets below */
          !merchantMode && [null, <F key="me" fieldKey="merchant" label="Merchant" required value={merchant?.code ?? ''} placeholder="eg, ELEX"
            options={masters.merchants.map((m) => ({ value: m.code, label: m.name }))} error={err(!merchant)}
            onChange={(v) => setMerchantCode(v || null)} />],
          idPref !== 'referenceNumber' && [null, <F key="on" fieldKey="orderNumber" label={lbl('orderNumber')} required value={c.orderNumber ?? ''} placeholder="eg, ABC0001"
            error={err(!filled(effectiveOrder))} onChange={(v) => setC({ orderNumber: v })}
            helper={idPref === 'orderNumber' ? `${lbl('referenceNumber')} is copied from this.` : undefined} />],
          idPref !== 'orderNumber' && [null, <F key="rn" fieldKey="referenceNumber" label={lbl('referenceNumber')} required value={c.referenceNumber ?? ''} placeholder="eg, ABC0001"
            error={err(!filled(effectiveRef))} onChange={(v) => setC({ referenceNumber: v })}
            helper={idPref === 'referenceNumber' ? `${lbl('orderNumber')} is copied from this.` : undefined} />],
          !hid('consignmentNumber') && ['consignmentNumber', <F key="cn" fieldKey="consignmentNumber" label={lbl('consignmentNumber')} value={c.consignmentNumber ?? ''} placeholder="eg, 0001"
            onChange={(v) => setC({ consignmentNumber: v })} />, filled(c.consignmentNumber)],
          [null, <F key="ct" fieldKey="consignmentType" label={lbl('consignmentType')} required value={ctype}
            options={opts(merchantMode ? CONSIGNMENT_TYPES.filter((t) => t !== 'Transfer') : CONSIGNMENT_TYPES)} onChange={changeType} />],
          [null, <F key="sb" fieldKey="shipByDate" label={lbl('shipByDate')} required type="date" value={c.shipByDate ?? ''} error={err(!filled(c.shipByDate))} onChange={(d) => setC({ shipByDate: d })} />],
          !hid('exchangeOrderNumber') && (ctype === 'Exchange' || editing) && ['exchangeOrderNumber',
            <F key="ex" fieldKey="exchangeOrderNumber" label={lbl('exchangeOrderNumber')} required={ctype === 'Exchange'} value={c.exchangeOrderNumber ?? ''} placeholder="eg, ABC0000"
              error={ctype === 'Exchange' && !filled(c.exchangeOrderNumber) ? 'Required field.' : undefined}
              onChange={(v) => setC({ exchangeOrderNumber: v })} helper={editing ? 'Shown for an Exchange' : 'The order being exchanged'} />, filled(c.exchangeOrderNumber)],
          !hid('paymentMode') && (typeRule.payment || editing) && ['paymentMode', <F key="pm" fieldKey="paymentMode" label={lbl('paymentMode')} value={c.paymentMode ?? ''} placeholder="eg, Prepaid"
            options={opts(PAYMENT_MODES)} onChange={(v) => setC({ paymentMode: v })} />, !!c.paymentMode],
          !hid('orderAmount') && (typeRule.payment || editing) && ['orderAmount', <FNum key="oa" fieldKey="orderAmount" label={c.paymentMode === 'COD' ? 'Amount to collect (COD)' : lbl('orderAmount')} blankZero
            placeholder="eg, 100.22" unit={merchantMode ? currency : undefined} value={c.orderAmount ?? 0} onChange={(n) => setC({ orderAmount: n || null })} />, (c.orderAmount ?? 0) > 0],
          ...customEntries('sec-consignment'),
        ], inMore, secOpen('sec-consignment'))
        return <>
          <SGrid>{r.nodes}</SGrid>
          <RevealToggle open={secOpen('sec-consignment')} onToggle={() => toggleSec('sec-consignment')} waiting={r.waiting} waitingFilled={r.waitingFilled} className="mt-6" />
          {addFieldLink('sec-consignment')}
        </>
      })()}
    </FormCard>
  )

  /* ------------------------------------------------------------ 2 · Ship From → Ship To (+ RTO)
     Each address = a saved-address dropdown + "New address", read back as a card; Add / Edit opens a
     popup with its fields (Cancel restores what was there). While editing the FORM, the fields show
     inline instead so the builder can configure them. */
  const setSenderP = (p: Partial<Party>) => setSender((x) => ({ ...x, ...p }))
  const setReceiverP = (p: Partial<Party>) => setReceiver((x) => ({ ...x, ...p }))
  type Role = 'from' | 'to' | 'rto'
  const partyOf = (role: Role, idx: number): Party => (role === 'from' ? sender : role === 'rto' ? rto : allDrops[idx] ?? blankParty())
  const patchParty = (role: Role, idx: number) => (patch: Partial<Party>) => {
    if (role === 'from') setSenderP(patch)
    else if (role === 'rto') setRto((x) => ({ ...x, ...patch }))
    else if (idx === 0) setReceiverP(patch)
    else setDrop(idx - 1, patch)
  }
  const replaceParty = (role: Role, idx: number, p: Party) => {
    if (role === 'from') setSender(p)
    else if (role === 'rto') setRto(p)
    else if (idx === 0) setReceiver(p)
    else setDrops((ds) => ds.map((x, j) => (j === idx - 1 ? p : x)))
  }
  const [addr, setAddr] = useState<null | { role: Role; idx: number; snapshot: Party; store: string; isNew: boolean }>(null)
  /* "Save this address": a Ship From / merchant-side address joins your addresses (the store list), a
     customer address joins the address book — each is offered under Saved address next time */
  const [saveAddr, setSaveAddr] = useState(false)
  const openAddress = (role: Role, idx: number, isNew: boolean) => {
    setSaveAddr(false)
    const cur = partyOf(role, idx)
    setAddr({ role, idx, snapshot: cur, store: senderStore, isNew })
    if (isNew) {
      replaceParty(role, idx, { ...blankParty(), windowStart: cur.windowStart, windowEnd: cur.windowEnd })
      if (role === 'from') setSenderStore(OTHER_ADDRESS)
    }
  }
  const confirmAddress = () => {
    if (addr && saveAddr) {
      const p = partyOf(addr.role, addr.idx)
      const toBook = addr.role === 'to' ? sourcesOf('to')[0] === 'customers' : addr.role === 'from' ? sourcesOf('from')[0] === 'customers' : false
      if (!partyOk(p)) toast.error('Add a name and the address before saving it')
      else if (toBook) { addressBookActions.add({ ...p, windowStart: '', windowEnd: '' }); toast.success(`${p.name} saved to the address book`) }
      else {
        const stored = growOrderActions.addStore({ code: codeFor(p), name: p.businessName || p.name, party: { ...p, windowStart: '', windowEnd: '' } })
        if (addr.role === 'from') setSenderStore(stored.code)
        else if (addr.role === 'rto') setRto((x) => ({ ...x, locationCode: stored.code }))
        else replaceParty('to', addr.idx, { ...p, locationCode: stored.code })
        toast.success(`${stored.name} saved to your addresses`)
      }
    }
    setAddr(null)
  }
  const cancelAddress = () => {
    if (addr) { replaceParty(addr.role, addr.idx, addr.snapshot); if (addr.role === 'from') setSenderStore(addr.store) }
    setAddr(null)
  }
  const book = useReceiverBook(db.orders)
  const bookIdx = (p: Party) => book.findIndex((e) => e.party.name === p.name && e.party.line1 === p.line1)
  const roleTitle: Record<Role, string> = { from: 'Ship From address', to: 'Ship To address', rto: 'return address' }
  /* a hub as an address: its store row when the hub is one, else its name */
  const hubParty = (code: string): Party => {
    const st = db.stores.find((x) => x.code === code) ?? stores.find((x) => x.code === code)
    const name = INBOUND_HUBS.find((h) => h.code === code)?.name ?? code
    return st ? { ...st.party, name: st.party.name || st.name, locationCode: code }
      : { ...blankParty(), name, businessName: name, line1: name, locationCode: code }
  }
  type Source = 'merchant' | 'customers' | 'facilities'
  const optionsOf = (src: Source): Opt[] => (src === 'facilities'
    ? INBOUND_HUBS.map((h) => ({ value: `hub:${h.code}`, label: `Hub · ${hubName(h.code, stores)}` }))
    : src === 'customers'
      ? book.map((e, i) => ({ value: `book:${i}`, label: `${e.party.name || e.party.businessName || 'Unnamed'} — ${[e.party.city, e.party.state].filter(Boolean).join(', ')}${e.tag ? ` · ${e.tag}` : ''}` }))
      /* Grow lists no hubs of its own — a hub-coded pickup location (sample data) is one of the merchant's addresses */
      : senderOptions.filter((o) => o.value !== OTHER_ADDRESS && (merchantMode || !HUB_CODES.has(o.value))).map((o) => ({ value: `store:${o.value}`, label: o.label ?? o.value })))
  /* the type decides each end's list; facilities are always offered (hub → customer, customer → hub) */
  const sourcesOf = (role: 'from' | 'to'): Source[] => {
    const main = role === 'from' ? typeRule.from : typeRule.to
    if (merchantMode) return [main === 'facilities' ? 'merchant' : main]
    /* the legs decide it (a Transfer's ends are hubs by type) */
    if (main === 'facilities') return ['facilities']
    if (!(role === 'from' ? fromRestricted : toRestricted)) return [main, 'facilities']
    return (role === 'from' ? fromIsAddress : toIsAddress) ? [main] : ['facilities']
  }
  const partyFromPick = (v: string): Party | null => {
    const [kind, ref] = [v.slice(0, v.indexOf(':')), v.slice(v.indexOf(':') + 1)]
    if (kind === 'hub') return hubParty(ref)
    if (kind === 'book') return book[Number(ref)]?.party ?? null
    if (kind === 'store') { const st = stores.find((x) => x.code === ref) ?? db.stores.find((x) => x.code === ref); return st ? { ...st.party, locationCode: ref } : null }
    return null
  }
  const valueOf = (role: 'from' | 'to', p: Party): string => {
    const code = role === 'from' ? (fromList ? senderStore : '') : p.locationCode ?? ''
    if (code && HUB_CODES.has(code)) return merchantMode ? `store:${code}` : `hub:${code}`
    if (code && (stores.some((x) => x.code === code) || db.stores.some((x) => x.code === code))) return `store:${code}`
    const at = bookIdx(p)
    return at >= 0 ? `book:${at}` : ''
  }
  const pickerFor = (role: Role, idx: number) => {
    const p = partyOf(role, idx)
    if (role === 'rto') {
      return <F label="Saved address" value={rto.locationCode ?? ''} placeholder="Search pickup addresses" searchable
        options={pickup.options.filter((o) => o.value !== OTHER_ADDRESS)}
        onChange={(code) => { const st = stores.find((x) => x.code === code); if (st) setRto({ ...st.party, locationCode: code }) }} />
    }
    const srcs = sourcesOf(role)
    const onlyFacilities = srcs.length === 1 && srcs[0] === 'facilities'
    return <F label={onlyFacilities ? 'Facility' : 'Saved address'} value={valueOf(role, p)} searchable
      placeholder={onlyFacilities ? 'Pick a hub' : `${srcs[0] === 'customers' ? 'Search customers or locations' : 'Search your addresses'}${srcs.includes('facilities') ? ' or hubs' : ''}`}
      options={srcs.flatMap(optionsOf)}
      onChange={(v) => {
        const next = partyFromPick(v)
        if (!next) return
        const keep = { windowStart: p.windowStart, windowEnd: p.windowEnd }
        if (role === 'from') {
          if (v.startsWith('store:')) { pickSender(v.slice(6)); return }
          setSenderStore(v.startsWith('hub:') ? v.slice(4) : OTHER_ADDRESS)
          setSender({ ...next, ...keep })
        } else replaceParty('to', idx, { ...next, ...keep })
      }} />
  }
  /** Consignment Type: a switch into / out of Reverse swaps the two ends (a return is collected FROM the customer). */
  function changeType(next: string) {
    const wasReverse = ctype === 'Reverse'
    setC({ consignmentType: next })
    if (wasReverse === (next === 'Reverse')) return
    const oldFrom: Party = { ...sender, locationCode: fromList ? senderStore : sender.locationCode }
    const code = receiver.locationCode ?? ''
    setSender({ ...receiver, windowStart: sender.windowStart, windowEnd: sender.windowEnd })
    setSenderStore(code && (HUB_CODES.has(code) || stores.some((x) => x.code === code) || db.stores.some((x) => x.code === code)) ? code : OTHER_ADDRESS)
    setReceiver({ ...oldFrom, windowStart: receiver.windowStart, windowEnd: receiver.windowEnd })
  }
  const windowCells = (role: 'from' | 'to', idx: number) => {
    if (hid('addrWindow')) return null
    const p = partyOf(role, idx)
    const w = role === 'from' ? 'Pick Up' : 'Delivery'
    return (
      <Grid2 className="mt-5">
        <DateTimeCell label={`${w} Start Time`} at={p.windowStart ?? ''} fallbackTime="00:00" onChange={(v) => patchParty(role, idx)({ windowStart: v })} />
        <DateTimeCell label={`${w} End Time`} at={p.windowEnd ?? ''} fallbackTime="23:59" onChange={(v) => patchParty(role, idx)({ windowEnd: v })} />
      </Grid2>
    )
  }
  const addressSlot = (role: Role, idx: number, title: ReactNode, right?: ReactNode) => {
    const p = partyOf(role, idx)
    const at = role === 'rto' ? -1 : bookIdx(p)
    const src = role === 'rto' ? 'merchant' : sourcesOf(role)[0]
    const facility = role !== 'rto' && (role === 'from' ? fromEnd.kind === 'facility' : HUB_CODES.has(p.locationCode ?? ''))
    return (
      <div>
        <SubTitle right={<span className="flex items-center gap-3">
          {!merchantMode && role !== 'rto' && (
            <span className="rounded-full bg-warm-100 px-2.5 py-0.5 text-[12px] text-ink-2">
              {src === 'facilities' ? 'Hub' : src === 'customers' ? 'Customer address' : 'Merchant address'}
            </span>
          )}
          {right}
        </span>}>{title}</SubTitle>
        <div className={`grid items-end gap-3 ${src === 'facilities' ? '' : 'grid-cols-[minmax(0,1fr)_auto]'}`}>
          {pickerFor(role, idx)}
          {src !== 'facilities' && <button type="button" onClick={() => openAddress(role, idx, true)}
            className="inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-md border border-brand-500 bg-surface px-3 text-[13px] text-brand-500 hover:bg-warm-50">
            <Plus size={14} />New address
          </button>}
        </div>
        <div className="mt-4">
          {/* owner, 2026-09-29: address fields are customised in the popup — the card stays a card while editing */}
          {<AddressCard party={p} missing={missingOf(p, role)} invalid={invalidOf(p, role)} onEdit={() => openAddress(role, idx, false)}
                tag={facility ? 'Hub' : at >= 0 ? book[at].tag ?? 'Saved' : role === 'from' && fromList ? 'Saved' : filled(p.name) ? 'New' : undefined} />}
          {editing && <p className="mt-2 text-[12px] text-ink-3">Open the address (✎ or New address) to customise its fields.</p>}
          {((role === 'from' && fromKindBad) || (role === 'to' && idx === 0 && toKindBad)) && (
            <ErrLine className="mt-2">{src === 'facilities' ? 'Pick a hub — this end has no pickup / delivery leg.' : 'Pick an address — this end has a pickup / delivery leg.'}</ErrLine>
          )}
        </div>
      </div>
    )
  }
  /* ------------------------------------------------------------ Shipment legs (owner, 2026-09-29) */
  const hubLabel = (code: string | null | undefined) => (code ? hubName(code, stores) : 'Hub (from the address)')
  const fromWho = typeRule.from === 'customers' ? 'the customer' : 'the merchant'
  const toWho = typeRule.to === 'merchant' ? 'the merchant' : 'the customer'
  const LEG_INFO: Record<LegKind, { name: string; hint: string; rail: string }> = {
    pickup: { name: 'First Mile', hint: `Pick up from ${fromWho} and bring to hub`, rail: 'Pickup to hub' },
    linehaul: { name: 'Line Haul', hint: 'Long trip between hubs or cities', rail: 'Long trip between hubs or cities' },
    delivery: { name: 'Last Mile', hint: `Deliver from hub to ${toWho}`, rail: 'Hub to delivery' },
    pickAndDeliver: { name: 'Pick & Del', hint: 'Same rider picks and delivers', rail: 'One trip, no hub' },
  }
  /** a leg switched off / on turns its end into a hub / an address: an end of the wrong kind is cleared */
  const fitEnds = (nextFromAddress: boolean, nextToAddress: boolean) => {
    if (hasAddr(sender) && (fromEnd.kind === 'facility') === nextFromAddress) {
      setSender({ ...blankParty(), windowStart: sender.windowStart, windowEnd: sender.windowEnd }); setSenderStore(OTHER_ADDRESS)
    }
    if (hasAddr(receiver) && (toEnd.kind === 'facility') === nextToAddress) {
      setReceiver({ ...blankParty(), windowStart: receiver.windowStart, windowEnd: receiver.windowEnd })
    }
  }
  const setLegs = (patch: Partial<typeof legChoice>) => {
    const next = { ...legChoice, ...patch }
    const direct = next.mode === 'direct'
    /* only a leg that is SET (or Direct) decides an end's kind; a following one keeps whatever is picked */
    fitEnds(direct || next.fm === null ? (direct || fromEnd.kind !== 'facility') : next.fm,
      direct || next.lm === null ? (direct || toEnd.kind !== 'facility') : next.lm)
    setLegChoice(next)
  }
  /* the hubs it passes, in order (an end that is a hub, the stop between two legs) — shown as plain words */
  const viaHubs: string[] = []
  if (!legsDirect) {
    /* only a KNOWN hub is named (owner, 2026-09-29: no "Hub (from the address)" placeholder) */
    const add = (code: string | null | undefined) => { if (!code) return; const n = hubName(code, stores); if (viaHubs[viaHubs.length - 1] !== n) viaHubs.push(n) }
    if (!fromIsAddress) add(fromEnd.hub)
    if (legFm && (legLh || legLm)) add(originHub)
    if (legLh && legLm) add(destHub)
    if (!toIsAddress) add(toEnd.hub)
  }
  const viaText = legsDirect ? 'One trip, no hub' : legList.length === 0 ? 'No legs yet' : viaHubs.length ? `Via ${viaHubs.join(' → ')}` : ''
  const pill = (on: boolean, disabled = false) => `inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[13px] transition-colors
    ${disabled ? 'cursor-not-allowed opacity-50' : ''} ${on ? 'border-ink bg-warm-50 font-bold text-ink' : 'border-line bg-surface text-ink-2 hover:border-warm-300 hover:text-ink'}`
  const legHints = [
    isTransfer && { tone: 'text-ink-3', text: 'A Transfer moves hub to hub — Line Haul only.' },
    legList.length === 0 && showErrors && { tone: 'text-danger-fg', text: 'Tick at least one leg.' },
    sameHubBothEnds && { tone: 'text-danger-fg', text: 'Ship From and Ship To are the same hub.' },
    !legLh && hubsDiffer && { tone: 'text-warning-fg', text: `The ends are served by different hubs (${hubLabel(originHub)} → ${hubLabel(destHub)}) — add Line Haul?` },
    !isTransfer && legLh && !hubsDiffer && !!originHub && (legFm || legLm) && { tone: 'text-ink-3', text: `Both ends are served by ${hubLabel(originHub)} — Line Haul may not be needed.` },
  ].filter(Boolean) as { tone: string; text: string }[]
  /* owner, 2026-09-29: Shipment legs as ONE simple line below the two addresses — four pills (the three legs, or
     Direct) and, on the right, the hubs it goes through in words */
  const legsLine = (
    <div className="mt-6 border-t border-warm-200 pt-4 lg:pr-10">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
        <span className="mr-2 flex items-center gap-2 text-[13px] font-bold text-ink">
          Shipment legs<InfoTip text="How it moves. First Mile = pick up and bring to a hub (off: Ship From is a hub). Line Haul = hub to hub. Last Mile = hub to delivery (off: Ship To is a hub). Pick & Del = one trip, no hub." />
        </span>
        {(['pickup', 'linehaul', 'delivery'] as const).map((k) => {
          const on = k === 'pickup' ? legFm : k === 'linehaul' ? legLh : legLm
          const toggle = () => (legsDirect ? setLegs({ mode: 'hub', ...(k === 'pickup' ? { fm: true } : k === 'delivery' ? { lm: true } : { lh: true }) })
            : k === 'pickup' ? setLegs({ fm: !legFm }) : k === 'delivery' ? setLegs({ lm: !legLm }) : setLegChoice((x) => ({ ...x, lh: !legLh })))
          return (
            <button key={k} type="button" role="checkbox" aria-checked={on} disabled={isTransfer} title={LEG_INFO[k].hint} onClick={toggle} className={pill(on, isTransfer)}>
              {on && <Check size={13} strokeWidth={3} className="text-brand-500" />}{LEG_INFO[k].name}
            </button>
          )
        })}
        <span className="px-1 text-[12px] text-ink-3">or</span>
        <button type="button" role="checkbox" aria-checked={legsDirect} disabled={isTransfer} title="Pick & Del — one trip, no hub; the same rider picks and delivers"
          onClick={() => setLegs({ mode: legsDirect ? 'hub' : 'direct' })} className={pill(legsDirect, isTransfer)}>
          {legsDirect && <Check size={13} strokeWidth={3} className="text-brand-500" />}Pick &amp; Del
        </button>
        {viaText && (
          <span className="text-[12px] text-ink-3 lg:ml-auto" aria-label="Legs to be created"
            title={movementType ? `Saved as ${movementType}${hasPickupLeg(movementType) ? ' — a first-mile pickup request is booked' : ''}` : undefined}>
            {viaText}
          </span>
        )}
      </div>
      {legHints.length > 0 && (
        <p className="mt-2 flex flex-wrap gap-x-4 text-[12px]">{legHints.map((h, i) => <span key={i} className={h.tone}>{h.text}</span>)}</p>
      )}
    </div>
  )
  const addressModal = (
    <>
      <Modal open={!!addr} wide title={addr ? `${addr.isNew ? 'New' : 'Edit'} ${roleTitle[addr.role]}${addr.role === 'to' && allDrops.length > 1 ? ` · Address ${addr.idx + 1}` : ''}` : ''}
        subtitle={addr?.role === 'from' ? 'Where the carrier collects the consignment.' : addr?.role === 'to' ? 'Who receives it, and where.' : 'Where it comes back if it cannot be delivered.'}
        onClose={cancelAddress}
        footer={<><Button variant="outline" onClick={cancelAddress}>Cancel</Button><Button onClick={confirmAddress}>Use this address</Button></>}>
        {addr && (
          <div className="pb-4 pt-2">
            <PartyBlock grouped party={partyOf(addr.role, addr.idx)} set={patchParty(addr.role, addr.idx)}
              nameLabel={addr.role === 'to' ? 'Customer Name' : 'Sender Name'} requireContact={addr.role !== 'from'} hid={hid}
              variant={addr.role === 'rto' ? 'rto' : 'full'} />
            {/* any address typed here can be kept — Ship From and Ship To alike */}
            {(addr.isNew || valueOf(addr.role === 'rto' ? 'from' : addr.role, partyOf(addr.role, addr.idx)) === '') && (
              <div className="mt-7 flex items-center gap-3 rounded-lg bg-warm-50 px-4 py-3">
                <Bookmark size={16} className="shrink-0 text-ink-3" />
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-bold text-ink">Save this address</p>
                  <p className="text-[12px] text-ink-3">It is listed under Saved address next time.</p>
                </div>
                <Toggle checked={saveAddr} onChange={setSaveAddr} />
              </div>
            )}
          </div>
        )}
      </Modal>
    </>
  )
  const fmtWin = (w: { startAt: string; endAt: string }) => {
    const d = new Date(`${w.startAt.slice(0, 10)}T00:00`)
    return `${d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })} · ${w.startAt.slice(11, 16)}–${w.endAt.slice(11, 16)}`
  }
  /* Grow: the pickup window under Ship From, as the pickup module says */
  const merchantPickupWindow = pickupState === 'auto-rule' ? (autoWin && (
    <p className="mt-5 flex flex-wrap items-center gap-x-1.5 rounded-lg bg-warm-50 px-4 py-3 text-[13px] text-ink-2">
      <b className="text-ink">Pickup is booked automatically</b>
      <span>· {fmtWin(autoWin)} ({autoRuleText})</span>
      {pickupCfg.autoPickup.slotConfirmation && <span>· you will be asked to confirm the slot</span>}
    </p>
  )) : pickupState === 'auto-ask' || (pickupState === 'manual' && !hid('addrWindow')) ? (
    <div className="mt-5">
      <div className="mb-2 flex items-center gap-3">
        <span className="text-[13px] text-ink">
          {askWindow || need('addrWindow') ? <>Pickup window<span className="text-danger-fg">&nbsp;*</span></> : 'Pickup window (optional)'}
        </span>
        {pickupState === 'manual' && hasWindow && !need('addrWindow') && (
          <button type="button" onClick={() => setSender((x) => ({ ...x, windowStart: '', windowEnd: '' }))}
            className="text-[12px] font-bold text-brand-500 hover:text-brand-600">Clear</button>
        )}
      </div>
      <SlotWindowFields startAt={sender.windowStart ?? ''} endAt={sender.windowEnd ?? ''} policy={pickupPol} ok={slotOk}
        onChange={(w) => setSender((x) => ({ ...x, windowStart: w.startAt, windowEnd: w.endAt }))}
        error={windowErr || (showErrors && (askWindow || need('addrWindow')) && !hasWindow ? 'Choose a pickup date and time.' : null)} />
      <p className="mt-1 text-[12px] text-ink-3">{askWindow
        ? `Booked automatically in this window · up to ${pickupCfg.bookingHorizonDays} days ahead · same-day cut-off ${pickupCfg.sameDayCutoff}`
        : 'Leave empty to schedule the pickup later from Shipments'}</p>
    </div>
  ) : null
  const partiesSection = (
    <FormCard id="sec-parties" title="Ship From → Ship To"
      caption={ctype === 'Transfer' ? 'Stock moving between two facilities — pick a hub at each end.'
        : merchantMode ? 'Pick a saved address or add a new one.' : 'Pick a saved address or add a new one — Shipment legs decide whether each end is an address or a hub.'}>
      <div className="grid gap-y-10 lg:grid-cols-2">
        <div className="min-w-0 lg:pr-8">
          {addressSlot('from', 0, 'Ship From')}
          {merchantMode ? merchantPickupWindow : windowCells('from', 0)}
          {typeRule.rto && (
            <div className="mt-5">
              <InlineSwitch label="RTO address same as Ship From address" title="If it can't be delivered, it comes back to the Ship From address"
                checked={(c.rtoMode ?? RTO_MODES[0]) === RTO_MODES[0]} onChange={(same) => setC({ rtoMode: same ? RTO_MODES[0] : RTO_MODES[1] })} />
            </div>
          )}
          {typeRule.rto && c.rtoMode === RTO_MODES[1] && <div className="mt-7">{addressSlot('rto', 0, 'Return To Origin (RTO) address')}</div>}
        </div>
        <div className="min-w-0 border-t border-warm-200 pt-8 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0">
          {allDrops.map((_, i) => (
            <div key={i} className={i > 0 ? 'mt-8 border-t border-warm-200 pt-6' : ''}>
              {addressSlot('to', i, allDrops.length > 1 ? `Ship To · Address ${i + 1}` : 'Ship To', i > 0 ? (
                <Tip text="Remove this address"><button type="button" aria-label={`Remove address ${i + 1}`} onClick={() => removeDrop(i - 1)}
                  className="text-ink-3 transition-colors hover:text-brand-500"><CircleMinus size={16} /></button></Tip>
              ) : undefined)}
              {windowCells('to', i)}
            </div>
          ))}
          {/* scheduling is about the DELIVERY — asked beside its window */}
          {!hid('schedulingConfirmation') && (
            <div className="mt-5"><Configurable fieldKey="schedulingConfirmation">
              <InlineSwitch label={lbl('schedulingConfirmation')} title={SWITCH_HINTS.schedulingConfirmation} checked={!!c.schedulingConfirmation} onChange={(v) => setC({ schedulingConfirmation: v })} />
            </Configurable></div>
          )}
          {/* multi-drop is a dedicated-truck booking: every address needs a vehicle */}
          {(isFtl || (merchantMode && mode === 'ftl')) && <div className="mt-6"><AddMoreButton label="Add delivery address" onClick={() => setDrops((ds) => [...ds, blankParty()])} /></div>}
        </div>
      </div>
      {!merchantMode && legsLine}
      {addressModal}
    </FormCard>
  )

  /* ------------------------------------------------------------ handling — asked on the GOODS (owner,
     2026-09-29: "barcode labels should be asked at package level"): what the goods are like, whether every
     box is labelled, whether the pieces may travel apart, and their tags. Consignment-level fields, as
     before — the package editor / vehicle card just asks them. */
  /* one line (owner, 2026-09-29: "can this section be merged … least scroll"): the six flags as chips,
     then the two box questions as compact toggles (their explanation in the tooltip), then Tags */
  /* owner, 2026-09-29: Handling is its OWN card (between the goods and the service) — and only when something in it
     is shown (every category and toggle hidden = no card, no gap) */
  const handlingSection = (
    <FormCard id="sec-handling" title="Handling" caption="How the goods must be handled on the way.">
    <>
    <div className="lg:pr-10" role="group" aria-label="Handling">
      {/* row 1 — what the goods are like: six pill chips */}
      {handlingChipsVisible && <div className="flex flex-wrap items-center gap-2">
        {GOODS_CATEGORIES.filter(({ name }) => !hid(catKey(name))).map(({ name, icon: Icon }) => {
          const on = hasCat(name)
          return (
            <Configurable key={name} fieldKey={catKey(name)}>
            <button type="button" aria-pressed={on} onClick={() => toggleCategory(name, !on)}
              className={`inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[13px] transition-colors
                ${on ? 'border-ink bg-warm-50 font-bold text-ink' : 'border-line bg-surface text-ink-2 hover:border-warm-300 hover:text-ink'}`}>
              <Icon size={14} className={on ? 'text-brand-500' : 'text-warm-400'} />{lbl(catKey(name))}
            </button>
            </Configurable>
          )
        })}
      </div>}
      {/* row 2 — how the boxes travel, and their tags; every control on one baseline */}
      {handlingTogglesVisible && <div className={`${handlingChipsVisible ? 'mt-5' : ''} ${HANDLING_ROW}`}>
        {!hid('scannable') && (
          <Configurable fieldKey="scannable">
            <InlineSwitch label={custom('scannable', 'Scannable', 'Barcode on every box')} title={SWITCH_HINTS.scannable}
              checked={!!c.scannable} onChange={(v) => setC({ scannable: v })} />
          </Configurable>
        )}
        {!hid('splittable') && (
          <Configurable fieldKey="splittable">
            <InlineSwitch label="Can be delivered in parts" title={SWITCH_HINTS.splittable}
              checked={!!c.splittable} onChange={(v) => setC({ splittable: v })} />
          </Configurable>
        )}
        {!hid('clearanceRequired') && (
          <Configurable fieldKey="clearanceRequired">
            <InlineSwitch label={lbl('clearanceRequired')} title={SWITCH_HINTS.clearanceRequired}
              checked={!!c.clearanceRequired} onChange={(v) => setC({ clearanceRequired: v })} />
          </Configurable>
        )}
        {!hid('tags') && (
          <Configurable fieldKey="tags">
            <div className="flex items-center gap-2.5">
              <span className="text-[13px] text-ink">{lbl('tags')}{need('tags') && <span className="text-danger-fg">&nbsp;*</span>}</span>
              <div className="w-56">
                <MultiSelectDropdown options={TAG_OPTIONS} values={c.tags ?? []} noun="tags" placeholder="Add tags" onChange={(v) => setC({ tags: v })} />
              </div>
            </div>
          </Configurable>
        )}
      </div>}
      {need('tags') && !(c.tags ?? []).length && <ErrLine className="mt-2">Add at least one tag.</ErrLine>}
    </div>
    {handlingCustom.nodes.length > 0 && <SGrid className={handlingChipsVisible || handlingTogglesVisible ? 'mt-6' : ''}>{handlingCustom.nodes}</SGrid>}
    <RevealToggle open={secOpen('sec-handling')} onToggle={() => toggleSec('sec-handling')} waiting={handlingCustom.waiting} waitingFilled={handlingCustom.waitingFilled} className="mt-6" />
    {addFieldLink('sec-handling')}
    </>
    </FormCard>
  )

  /* ------------------------------------------------------------ 3 · Package & SKU (parcel) */
  const packageTypeOpts = [...packageTypes.map((t) => ({ value: t.code, label: t.name })), { value: CUSTOM_PACKAGE, label: CUSTOM_PACKAGE_NAME }]
  const packageTypeTitle = packageTypes.length === 0 ? 'No presets in the Package master — enter dimensions'
    : !ownPresets ? `Showing all package types — none assigned to ${merchant?.name ?? 'this merchant'}` : undefined
  const [skuMore, setSkuMore] = useState<Set<string>>(new Set())
  const flip = <T,>(s: Set<T>, k: T) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n }
  const SKU_COLS = 'grid grid-cols-[28px_minmax(0,1.3fr)_minmax(0,1.4fr)_84px_104px_minmax(0,1.5fr)_80px_96px] items-start gap-x-3'
  /* a SKU line's own fold — category, description, HSN, origin, cost, image, units (rarely typed: the
     SKU master fills most). Open while editing the form, or when the builder made one of them required. */
  const skuDetailRequired = [...SKU_ROW_KEYS].some(need)
  /** picked from the SKU master (its name / size / weight came with it) vs typed by hand */
  const isMasterSku = (it: ParcelItem) => !!it.skuCode && masters.skus.some((sk) => sk.code === it.skuCode)
  const skuDetailsGrid = (it: ParcelItem, patch: (p: Partial<ParcelItem>) => void) => (
    <SGrid className="mt-5 pl-10">
      {!hid('skuCategory') && <F fieldKey="skuCategory" label={lbl('skuCategory')} value={it.category ?? ''}
        options={opts([...new Set([...masters.skus.map((sk) => sk.category).filter(Boolean), ...(it.category ? [it.category] : [])])])}
        onChange={(v) => patch({ category: v })} />}
      {!hid('skuDescription') && <F fieldKey="skuDescription" label={lbl('skuDescription')} value={it.description ?? ''} placeholder="eg, Water Bottle" onChange={(v) => patch({ description: v })} />}
      {!hid('skuHsn') && <F fieldKey="skuHsn" label={lbl('skuHsn')} value={it.hsnCode ?? ''} placeholder="eg, 851713" onChange={(v) => patch({ hsnCode: v })} />}
      <F label="Origin Country" value={it.originCountry ?? ''} placeholder="eg, Philippines" searchable
        options={opts([...new Set([...COUNTRIES, ...(it.originCountry ? [it.originCountry] : [])])])} onChange={(v) => patch({ originCountry: v })} />
      {!hid('skuUnitCost') && <FNum fieldKey="skuUnitCost" label={`${lbl('skuUnitCost')} (${CURRENCY})`} blankZero placeholder="eg, 12.34" value={it.unitCost ?? 0} onChange={(n) => patch({ unitCost: n })} />}
      {!hid('skuImage') && <F fieldKey="skuImage" label={lbl('skuImage')} value={it.imageUrl ?? ''} onChange={(v) => patch({ imageUrl: v })} />}
      <F label="Dimension unit" value={it.dimUom ?? 'CM'} options={DIM_UOMS.map((u) => ({ value: u, label: u.toLowerCase() }))} onChange={(v) => patch({ dimUom: v })} />
      <F label="Weight unit" value={it.weightUom ?? 'KG'} options={WEIGHT_UOMS.map((u) => ({ value: u, label: u.toLowerCase() }))} onChange={(v) => patch({ weightUom: v })} />
      <SFld label={`Volume (${(it.dimUom ?? 'CM').toLowerCase()}³ each)`}>
        <ReadBox value={(it.lengthCm ?? 0) * (it.widthCm ?? 0) * (it.heightCm ?? 0) ? String(round2((it.lengthCm ?? 0) * (it.widthCm ?? 0) * (it.heightCm ?? 0))) : ''} />
      </SFld>
    </SGrid>
  )
  const [itemMore, setItemMore] = useState<Set<string>>(new Set())

  /* Items: one line per SKU — search, how many, done. Size and weight come from the SKU master and are
     asked only when the master has none. */
  const ITEM_COLS = 'grid grid-cols-[28px_minmax(0,2.2fr)_112px_minmax(0,1.9fr)_96px_104px] items-start gap-x-4'
  const itemTotals = itemParcels.reduce((t, p) => ({
    pieces: t.pieces + p.quantity, kg: t.kg + p.weight * p.quantity, m3: t.m3 + (p.l * p.w * p.h * p.quantity) / 1e6,
  }), { pieces: 0, kg: 0, m3: 0 })
  const itemsBlock = (
    <div className="lg:pr-10">
      <div className="overflow-x-auto">
        <div className="min-w-[760px]">
          <div className={`${ITEM_COLS} border-b border-warm-200 pb-2 text-[13px] text-ink-2`}>
            <span>#</span>
            <span>SKU<span className="text-danger-fg"> *</span></span>
            <span>Quantity<span className="text-danger-fg"> *</span></span>
            <span>Each unit</span>
            <span className="text-right">Total</span>
            <span />
          </div>
          {lines.map((l, n) => {
            const it = l.item
            const picked = !!it.skuCode
            const dimsOk = (it.lengthCm ?? 0) > 0 && (it.widthCm ?? 0) > 0 && (it.heightCm ?? 0) > 0
            const weightOk = it.weightKg > 0
            /* a typed SKU has nothing from the master — its details start open */
            const open = itemMore.has(l.id) !== (picked && !isMasterSku(it)) || editing || (picked && skuDetailRequired)
            return (
              <div key={l.id} className="border-b border-warm-200 py-3 last:border-0">
              <div className={ITEM_COLS}>
                <span className="flex h-8 items-center text-[13px] text-ink-3">{n + 1}</span>
                <div className="min-w-0">
                  <SkuCode item={it} skus={masters.skus} onPick={(sk) => pickLineSku(l.id, sk)} autoFocus={focusItem === l.id}
                    onCustom={(code) => setLine(l.id, { ...blankItem(), skuCode: code, quantity: it.quantity })}
                    onUnlink={() => setLine(l.id, { ...blankItem(), quantity: it.quantity })} />
                  {picked && (isMasterSku(it)
                    ? <p className="mt-1 truncate text-[13px] text-ink" title={it.name}>{it.name}</p>
                    : <div className="mt-2"><Input value={it.name} placeholder="SKU name, eg, Refrigerator 300 L" onChange={(v) => setLine(l.id, { name: v })} /></div>)}
                </div>
                <NumBox integer min={1} blankZero placeholder="1" value={it.quantity} error={err(it.quantity < 1)}
                  onChange={(q) => setLine(l.id, { quantity: q })} />
                <div className="min-w-0">
                  {!picked ? <span className="flex h-8 items-center text-[13px] text-ink-3">Pick a SKU</span>
                    : weightOk && dimsOk
                      ? <span className="flex h-8 items-center text-[13px] text-ink-2">
                          {round2(it.weightKg)} kg · {it.lengthCm} × {it.widthCm} × {it.heightCm} cm
                        </span>
                      : (
                        /* the SKU master has no size / weight for this SKU — ask only what is missing */
                        <div className="grid grid-cols-[88px_minmax(0,1fr)] gap-2">
                          <NumBox unit="kg" blankZero placeholder="kg" value={it.weightKg} error={err(!weightOk)} onChange={(w) => setLine(l.id, { weightKg: w })} />
                          <DimsBox error l={it.lengthCm ?? 0} w={it.widthCm ?? 0} h={it.heightCm ?? 0}
                            onChange={(d) => setLine(l.id, { ...(d.l !== undefined ? { lengthCm: d.l } : {}), ...(d.w !== undefined ? { widthCm: d.w } : {}), ...(d.h !== undefined ? { heightCm: d.h } : {}) })} />
                          <p className="col-span-2 text-[12px] text-ink-3">Not in the SKU master — enter the weight and size of one unit.</p>
                        </div>
                      )}
                </div>
                <span className="flex h-8 items-center justify-end text-[13px] tabular-nums text-ink">
                  {picked && weightOk && it.quantity ? `${round2(it.weightKg * it.quantity)} kg` : '-'}
                </span>
                <span className="flex items-center justify-end gap-1">
                  <Tip text={open && picked ? 'Hide SKU details' : picked ? 'SKU details — category, HSN, origin, cost' : 'Pick a SKU first'}><button type="button" disabled={!picked}
                    aria-label={`SKU line ${n + 1} details`} aria-expanded={open && picked} onClick={() => setItemMore((st) => flip(st, l.id))}
                    className="inline-flex h-8 items-center gap-0.5 rounded-md px-1 text-[12px] text-brand-500 hover:bg-warm-100 disabled:text-warm-400">
                    Details{open && picked ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                  </button></Tip>
                  <Tip text="Remove SKU"><button type="button" aria-label={`Remove SKU line ${n + 1}`} onClick={() => removeLine(l.id)}
                    className="inline-flex h-8 w-7 items-center justify-center rounded-md text-ink-3 hover:bg-warm-100 hover:text-brand-500">
                    <Trash2 size={14} />
                  </button></Tip>
                </span>
              </div>
              {picked && open && skuDetailsGrid(it, (patch) => setLine(l.id, patch))}
              </div>
            )
          })}
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <AddRowLink label="Add SKU" onClick={addLine} />
        <span className="text-[13px] text-ink-2">
          {itemTotals.pieces
            ? <>{itemTotals.pieces} piece{itemTotals.pieces === 1 ? '' : 's'} · {round2(itemTotals.kg)} kg · {itemTotals.m3.toFixed(2)} m³ — each unit ships as its own piece</>
            : 'Search the SKU master, or type any code — a new SKU asks for its name, size and weight'}
        </span>
      </div>
      {itemParcels.length === 0 && <ErrLine className="mt-2">Pick at least one SKU.</ErrLine>}
    </div>
  )
  /* ---- Package & SKU, rebuilt (owner, 2026-09-29): one entry style per account (the builder's "How goods
     are entered"), and every Add button BELOW what it adds to — Add SKU under its SKUs, Add Package under
     all the packages. */
  const SKU_COLS_SEP = 'grid grid-cols-[28px_minmax(0,1.2fr)_minmax(0,1.3fr)_minmax(0,1fr)_84px_104px_minmax(0,1.5fr)_80px_96px] items-start gap-x-3'
  const pkgLabel = (j: number) => {
    const g = parcels[j]
    return g ? `Package ${j + 1} · ${packageValue(g, packageTypes) === CUSTOM_PACKAGE ? 'Custom' : g.packageTypeName}` : `Package ${j + 1}`
  }
  const skuTable = (withPkg: boolean, rows: ReactNode) => (
    <div className="overflow-x-auto">
      <div className={withPkg ? 'min-w-[980px]' : 'min-w-[860px]'}>
        <div className={`${withPkg ? SKU_COLS_SEP : SKU_COLS} border-b border-warm-200 pb-2 text-[13px] text-ink-2`}>
          <span>#</span>
          <span>SKU Code<span className="text-danger-fg"> *</span></span>
          <span>Name<span className="text-danger-fg"> *</span></span>
          {withPkg && <span>Package<span className="text-danger-fg"> *</span></span>}
          <span>Quantity<span className="text-danger-fg"> *</span></span>
          <span>Unit Weight<span className="text-danger-fg"> *</span></span>
          <span>Dimensions (cm)<span className="text-danger-fg"> *</span></span>
          <span className="text-right">Total</span>
          <span />
        </div>
        {rows}
      </div>
    </div>
  )
  /** one SKU line — code (master or typed) · name · [package] · quantity · unit weight · L × W × H · total · details */
  const skuRow = (it: ParcelItem, i: number, k: number, n: number, withPkg: boolean) => {
    const key = `${i}:${k}`
    const open = skuMore.has(key) !== (!!it.skuCode && !isMasterSku(it))
    const missing = [!it.skuCode && 'SKU code', !filled(it.name) && 'name', !(it.quantity >= 1) && 'quantity',
      !(it.weightKg > 0) && 'weight', !((it.lengthCm ?? 0) > 0 && (it.widthCm ?? 0) > 0 && (it.heightCm ?? 0) > 0) && 'dimensions']
      .filter(Boolean) as string[]
    const vol = (it.lengthCm ?? 0) * (it.widthCm ?? 0) * (it.heightCm ?? 0)
    return (
      <div key={key} className="border-b border-warm-200 py-3 last:border-0">
        <div className={withPkg ? SKU_COLS_SEP : SKU_COLS}>
          <span className="flex h-8 items-center text-[13px] text-ink-3">{n + 1}</span>
          <SkuCode item={it} skus={masters.skus} onPick={(sk) => pickSku(i, k, sk)} onUnlink={() => setItem(i, k, { skuCode: null })}
            onCustom={(code) => setItem(i, k, { skuCode: code })} autoFocus={focusLine?.i === i && focusLine.k === k} />
          {/* a master SKU's name comes with it; a typed one is yours to name */}
          <Input value={it.name} placeholder="eg, Refrigerator 300 L" disabled={isMasterSku(it)} onChange={(v) => setItem(i, k, { name: v })} />
          {withPkg && (
            <MenuSelect value={String(i)} options={parcels.map((_, j) => String(j))} labels={(v) => pkgLabel(Number(v))}
              onChange={(v) => moveItem(i, k, Number(v))} />
          )}
          <NumBox integer min={1} blankZero placeholder="1" value={it.quantity} error={err(it.quantity < 1)} onChange={(q) => setItem(i, k, { quantity: q })} />
          <NumBox unit={(it.weightUom ?? 'KG').toLowerCase()} blankZero placeholder="0" value={it.weightKg} error={err(!(it.weightKg > 0))}
            onChange={(w) => setItem(i, k, { weightKg: w })} />
          <DimsBox l={it.lengthCm ?? 0} w={it.widthCm ?? 0} h={it.heightCm ?? 0} error
            onChange={(d) => setItem(i, k, { ...(d.l !== undefined ? { lengthCm: d.l } : {}), ...(d.w !== undefined ? { widthCm: d.w } : {}), ...(d.h !== undefined ? { heightCm: d.h } : {}) })} />
          <span className="flex min-h-8 flex-col items-end justify-center text-[13px] tabular-nums text-ink-2">
            <span>{it.weightKg && it.quantity ? `${round2(it.weightKg * it.quantity)} kg` : '-'}</span>
            {vol * it.quantity > 0 && <span className="text-[12px] text-ink-3">{(vol * it.quantity / 1e6).toFixed(3)} m³</span>}
          </span>
          <span className="flex items-center justify-end gap-1">
            <Tip text={open ? 'Hide SKU details' : 'SKU details — category, HSN, origin, cost'}><button type="button"
              aria-label={`SKU ${n + 1} details`} aria-expanded={open} onClick={() => setSkuMore((st) => flip(st, key))}
              className="inline-flex h-8 w-7 items-center justify-center rounded-md text-brand-500 hover:bg-warm-100">
              {/* owner, 2026-09-29: a chevron only — the words are in the tooltip */}
              {open ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
            </button></Tip>
            <Tip text="Remove SKU"><button type="button" aria-label={`Remove SKU ${n + 1}`} onClick={() => removeItem(i, k)}
              className="inline-flex h-8 w-7 items-center justify-center rounded-md text-ink-3 hover:bg-warm-100 hover:text-brand-500">
              <Trash2 size={14} />
            </button></Tip>
          </span>
        </div>
        {missing.length > 0 && <ErrLine className="mt-1.5 pl-10">Required: {missing.join(', ')}</ErrLine>}
        {(open || editing || skuDetailRequired) && skuDetailsGrid(it, (patch) => setItem(i, k, patch))}
      </div>
    )
  }
  /** a package's own fields — type · quantity · L × W × H · weight (+ tracking / description / pallet / id in place) */
  const packageFields = (p: Parcel, i: number, below?: ReactNode, adder?: ReactNode) => {
    const isCustom = packageValue(p, packageTypes) === CUSTOM_PACKAGE
    const r = revealEntries([
      !hid('pkgTracking') && ['pkgTracking', <F key="tr" fieldKey="pkgTracking" label={lbl('pkgTracking')} value={p.trackingNumber ?? ''} disabled={!!fromOverage && i === 0}
        helper={fromOverage && i === 0 ? 'The overage scan barcode' : undefined} onChange={(v) => setParcel(i, { trackingNumber: v })} />, filled(p.trackingNumber)],
      !hid('pkgDescription') && ['pkgDescription', <F key="de" fieldKey="pkgDescription" label={lbl('pkgDescription')} value={p.description ?? ''} onChange={(v) => setParcel(i, { description: v })} />, filled(p.description)],
      !hid('pkgPalletSpace') && ['pkgPalletSpace', <F key="ps" fieldKey="pkgPalletSpace" label={lbl('pkgPalletSpace')} value={p.palletSpace ?? ''} placeholder="eg, 10" onChange={(v) => setParcel(i, { palletSpace: v })} />, filled(p.palletSpace)],
      ['__pkgId', <F key="pid" label="Package Id" value={p.packageId ?? ''} onChange={(v) => setParcel(i, { packageId: v })} />, false],
    ], (k) => k === '__pkgId' || inMore(k), secOpen(`pkg:${i}`))
    return (
      <>
        {/* owner, 2026-09-29: the package's details chevron sits IN its field row (at the end, level with the
            inputs: label 20 + 6px gap, then centred on the 32px control) — like a SKU row's chevron */}
        <div className="relative">
        <SGrid cols={5} className="pr-10">
          <div title={packageTypeTitle}>
            <F label="Package Type" required value={packageValue(p, packageTypes)} options={packageTypeOpts} onChange={(v) => pickPackageType(i, v)} />
          </div>
          <FNum label="Quantity" required integer min={1} blankZero placeholder="eg, 1" value={p.quantity} error={err(!(p.quantity > 0))}
            onChange={(q) => setParcel(i, { quantity: q })} />
          {/* a preset's size IS its master row — typed only for a Custom package */}
          <SFld fieldKey="pkgDimensions" label="Dimensions (cm)" helper={isCustom ? undefined : 'From the package type'}>
            {isCustom ? <DimsBox l={p.l} w={p.w} h={p.h} onChange={(d) => setParcel(i, d)} /> : <ReadBox value={`${p.l} × ${p.w} × ${p.h}`} />}
          </SFld>
          <FNum fieldKey="pkgWeight" label="Weight (kg)" required placeholder="eg, 10" blankZero value={p.weight} error={err(!(p.weight > 0))}
            onChange={(w) => setParcel(i, { weight: w, weightMode: 'manual' })} />
          {r.nodes}
        </SGrid>
        <RevealToggle open={secOpen(`pkg:${i}`)} onToggle={() => toggleSec(`pkg:${i}`)} waiting={r.waiting} waitingFilled={r.waitingFilled}
          label="package details" iconOnly className="absolute right-1 top-7" />
        </div>
        {below}
        {adder && <div className="mt-4">{adder}</div>}
      </>
    )
  }
  const packageCard = (p: Parcel, i: number, body: ReactNode) => {
    const vol = p.l * p.w * p.h
    return (
      <RowCard key={p.packageId ?? i} title={`Package ${i + 1}`} onRemove={parcels.length > 1 ? () => removeParcel(i) : undefined}
        removeTip={separateLayout ? 'Remove package — its SKUs move to the first package' : 'Remove package'}
        footer={<>
          <span>Total Weight (kg) <b className="ml-2 font-normal">{p.weight ? round2(p.weight * p.quantity) : '-'}</b></span>
          <span>Total Volume (cm³) <b className="ml-2 font-normal">{vol ? round2(vol * p.quantity) : '-'}</b></span>
          <span>SKUs <b className="ml-2 font-normal">{(p.items ?? []).filter((it) => !isBlankItem(it)).length}</b></span>
        </>}>
        {body}
      </RowCard>
    )
  }
  const pieces = parcels.reduce((n, p) => n + (p.quantity || 0), 0)
  const addPackageBar = (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 lg:pr-10">
      <AddMoreButton label="Add Package" onClick={() => { setFocusLine(null); setParcels((ps) => [...ps, newParcel()]) }} />
      <span className="text-[13px] text-ink-2">
        {pieces} piece{pieces === 1 ? '' : 's'} · {round2(parcels.reduce((n, p) => n + (p.weight || 0) * (p.quantity || 0), 0))} kg in {parcels.length} package{parcels.length === 1 ? '' : 's'}
      </span>
    </div>
  )
  /* SKUs, then packages: the SKU list (each line picks its package), then the boxes */
  const separateBlock = (
    <div>
      <SubTitle>SKUs</SubTitle>
      {skuLines.length > 0 && skuTable(true, skuLines.map(({ it, i, k }, n) => skuRow(it, i, k, n, true)))}
      <div className="mt-2 lg:pr-10"><AddRowLink label="Add SKU" onClick={() => addItem(parcels.length - 1)} /></div>
      <div className="mt-8"><SubTitle>Packages</SubTitle></div>
      {parcels.map((p, i) => packageCard(p, i, <>
        {packageFields(p, i)}
        <p className="mt-4 text-[12px] text-ink-3">
          {(p.items ?? []).filter((it) => !isBlankItem(it)).length
            ? `Holds ${(p.items ?? []).filter((it) => !isBlankItem(it)).map((it) => it.skuCode || it.name).join(', ')}`
            : 'No SKUs in it yet — pick this package on a SKU above'}
        </p>
      </>))}
      {addPackageBar}
    </div>
  )
  /* packages with their SKUs: each box, its fields, its SKUs, and Add SKU under them */
  const combinedBlock = (
    <div>
      {parcels.map((p, i) => packageCard(p, i, packageFields(p, i,
        (p.items ?? []).length > 0 ? <div className="mt-6 lg:pr-10">{skuTable(false, (p.items ?? []).map((it, k) => skuRow(it, i, k, k, false)))}</div> : null,
        <AddRowLink label="Add SKU" onClick={() => addItem(i)} />)))}
      {addPackageBar}
    </div>
  )
  const packagesSection = (
    <FormCard id="sec-packages" title="Package & SKU"
      caption={typeRule.goodsOptional ? 'Parts or goods to carry for the visit — optional for a Service.'
        : useItems ? 'Pick the SKUs and how many — sizes and weights come from the SKU master, or type a new SKU.'
        : separateLayout ? 'List the SKUs, then the packages they go in.'
        : "Each package, and the SKUs packed in it. A package's weight adds up from its type and SKUs unless you type one."}>
      {/* the account's one way of entering goods — asked here only while editing the form */}
      {editing && !isFtl && (
        <div className="mb-6 rounded-lg border border-dashed border-warm-300 p-4">
          <p className="mb-3 text-[13px] font-bold text-ink">How goods are entered <span className="font-normal text-ink-3">— one way for every consignment</span></p>
          <div className="flex flex-wrap gap-3" role="radiogroup" aria-label="How goods are entered">
            {GOODS_OPTIONS.map((o) => (
              <RadioCard key={o.value} label={o.label} sub={o.sub} checked={draftGoods === o.value} onClick={() => setDraftGoods(o.value)} />
            ))}
          </div>
        </div>
      )}
      {useItems ? itemsBlock : separateLayout ? separateBlock : combinedBlock}
    </FormCard>
  )

  /* ------------------------------------------------------------ 3b · Vehicle Details (FTL, unchanged) */
  const addressLabels = addressOptions.map((o) => o.label)
  const vehicleSection = (
    <FormCard id="sec-vehicle" title="Vehicle Details"
      caption={`A full-truck booking — book the vehicles that fit the load for ${ftlService}. Each one is dedicated to this order.`}>
      <div className="rounded-lg border border-warm-200">
        <div className="grid grid-cols-[1.4fr_120px_150px_1.3fr_32px] gap-3 rounded-t-lg bg-warm-50 px-4 py-3 text-[13px] text-ink">
          <span>Vehicle Type<span className="text-danger-fg"> *</span></span><span>No. of Vehicles<span className="text-danger-fg"> *</span></span>
          <span>Est. Load<span className="text-danger-fg"> *</span></span><span>Deliver To<span className="text-danger-fg"> *</span></span><span />
        </div>
        {rows.map((r, i) => {
          const each = payloadOf(r.vehicleType)
          const cap = each * Math.max(1, r.count)
          const over = cap > 0 && r.loadKg > cap
          const spec = vehicleTypeOf(masters.vehicleTypes, r.vehicleType)
          return (
            <div key={i} className="grid grid-cols-[1.4fr_120px_150px_1.3fr_32px] items-start gap-3 border-t border-warm-200 px-4 py-3">
              <div className="min-w-0">
                <MenuSelect value={r.vehicleType} placeholder="eg, 8 Ton Truck" options={vehicleOpts.map((x) => x.code)}
                  labels={(v) => vehicleTypeOf(masters.vehicleTypes, v)?.name ?? v} searchable onChange={(t) => setRow(i, { vehicleType: t })} />
                {!r.vehicleType
                  ? <p className="mt-1.5 pl-2 text-[12px] text-danger-fg">Required field.</p>
                  : <p className={`mt-1 text-[12px] ${over ? 'text-danger-fg' : 'text-ink-3'}`}>
                      {over ? `${r.loadKg.toLocaleString()} kg exceeds ${cap.toLocaleString()} kg`
                        : each ? `Up to ${each.toLocaleString()} kg each` : spec?.capacity || 'Capacity not configured'}
                    </p>}
              </div>
              <NumBox integer min={1} value={r.count} onChange={(n) => setRow(i, { count: Math.max(1, n) })} />
              <div>
                <NumBox unit="kg" blankZero value={r.loadKg} error={err(!(r.loadKg > 0))} onChange={(n) => setRow(i, { loadKg: n })} />
                {!(r.loadKg > 0) && <p className="mt-1.5 pl-2 text-[12px] text-danger-fg">Required field.</p>}
              </div>
              <MultiSelectDropdown options={addressLabels} noun="addresses" placeholder="Ship To addresses"
                values={r.addressIdx.map((a) => addressLabels[a]).filter(Boolean)}
                onChange={(vals) => setRow(i, { addressIdx: vals.map((v) => addressLabels.indexOf(v)).filter((a) => a >= 0).sort((x, y) => x - y) })} />
              <Tip text="Remove vehicle"><button type="button" aria-label={`Remove vehicle row ${i + 1}`} disabled={rows.length === 1} onClick={() => removeVehicle(i)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-ink-3 hover:bg-warm-100 hover:text-ink disabled:cursor-not-allowed disabled:opacity-40">
                <X size={14} />
              </button></Tip>
            </div>
          )
        })}
      </div>
      <div className="mt-4"><AddMoreButton label="Add vehicle" onClick={addVehicle} /></div>
      <p className="mt-3 text-[12px] text-ink-3">
        {units} vehicle{units === 1 ? '' : 's'} · load {(actualLoad / 1000).toFixed(2)} tons ({actualLoad.toLocaleString()} kg) of {capacityKg.toLocaleString()} kg capacity
        {overloaded.length > 0 && <span className="text-danger-fg"> · {overloaded.length} overloaded</span>}
        {uncovered.length > 0
          ? <span className="text-danger-fg"> · {uncovered.map((i) => `Address ${i + 1}`).join(', ')} not assigned to a vehicle</span>
          : <span> · every address has a vehicle</span>}
      </p>
    </FormCard>
  )

  /* ------------------------------------------------------------ 5 · Instructions & services
     Only what is left once every handling question sits where it belongs (owner, 2026-09-29): a note for
     the carrier, and any service on top of the delivery. */
  const extrasReveal = revealEntries([
    !hid('specialInstructions') && ['specialInstructions', <F key="si" fieldKey="specialInstructions" label={lbl('specialInstructions')} multiline rows={2}
      className="lg:pr-10" value={c.specialInstructions ?? ''} placeholder="eg, Call the customer 30 minutes before arriving"
      onChange={(v) => setC({ specialInstructions: v })} />, filled(c.specialInstructions)],
  ], inMore, secOpen('sec-service'))
  const vasOpts = merchantMode
    ? VAS_SERVICES.map((v) => ({ value: v, label: laneVasPrice(v, currency) ? `${v} · ${money(laneVasPrice(v, currency), currency)}` : v }))
    : VAS_OPTS
  const VAS_COLS = 'grid grid-cols-[120px_minmax(0,1.6fr)_minmax(0,1.6fr)_112px_minmax(0,1.2fr)_32px] items-start gap-x-3'
  /* owner, 2026-09-29: a block whose fields are all hidden leaves no divider and no space */
  const extrasVisible = extrasReveal.nodes.length > 0 || extrasReveal.waiting > 0 || !hid('vas')
  const extrasSection = !extrasVisible ? null : (
    <div className="mt-8 border-t border-warm-200 pt-6">
      {extrasReveal.nodes}
      <RevealToggle open={secOpen('sec-service')} onToggle={() => toggleSec('sec-service')} waiting={extrasReveal.waiting} waitingFilled={extrasReveal.waitingFilled} className="mt-4" />
      {!hid('vas') && (
        <Configurable fieldKey="vas">
      <div className={extrasReveal.nodes.length ? 'mt-8' : ''}>
        <SubTitle right={<AddMoreButton label="Add service" onClick={() => setC({ vas: [...(c.vas ?? []),
          isFtl ? { ...newVas(), level: 'CONSIGNMENT' } : { ...newVas(), level: skuLineOpts.length ? 'SKU' : 'PACKAGE', packageId: goods.length === 1 ? goods[0].packageId : undefined }] })} />}>
          Value Added Services
        </SubTitle>
        {(c.vas ?? []).length === 0
          ? <p className="text-[13px] text-ink-3">Add a service to a package or a SKU — installation, assembly, a tail-lift…</p>
          : (
            <div className="overflow-x-auto">
              <div className="min-w-[760px]">
                <div className={`${VAS_COLS} border-b border-warm-200 pb-2 text-[13px] text-ink-2`}>
                  <span>Added to<span className="text-danger-fg"> *</span></span>
                  <span>{isFtl ? 'Booking' : 'Package / SKU'}<span className="text-danger-fg"> *</span></span>
                  <span>Service<span className="text-danger-fg"> *</span></span>
                  <span>Time (min)</span>
                  <span>Remark</span>
                  <span />
                </div>
                {(c.vas ?? []).map((v, i) => {
                  const missing = [!v.service && 'service', v.level === 'SKU' && !v.skuCode && 'SKU', v.level === 'PACKAGE' && !v.packageId && 'package'].filter(Boolean) as string[]
                  return (
                    <div key={i} className="border-b border-warm-200 py-2.5 last:border-0">
                      <div className={VAS_COLS}>
                        {isFtl
                          ? <ReadBox value="Whole booking" />
                          : <MenuSelect value={v.level} options={['PACKAGE', 'SKU']} labels={(x) => (x === 'SKU' ? 'SKU' : 'Package')}
                              onChange={(x) => setVas(i, { level: x as VasLine['level'], skuCode: '', packageId: x === 'PACKAGE' && goods.length === 1 ? goods[0].packageId : undefined })} />}
                        {isFtl ? <ReadBox value="Every vehicle" />
                          : v.level === 'SKU'
                            ? <MenuSelect value={v.skuCode} placeholder={skuLineOpts.length ? 'Pick a SKU' : 'Add a SKU first'} searchable={skuLineOpts.length > 8}
                                options={skuLineOpts.map((o) => o.value)} labels={(x) => skuLineOpts.find((o) => o.value === x)?.label ?? x} onChange={(x) => setVas(i, { skuCode: x })} />
                            : <MenuSelect value={v.packageId ?? ''} placeholder="Pick a package"
                                options={goods.map((g) => g.packageId ?? '').filter(Boolean)}
                                labels={(x) => { const n = goods.findIndex((g) => g.packageId === x); const g = goods[n]; return g ? `Package ${n + 1} · ${g.packageTypeName === CUSTOM_PACKAGE_NAME ? (g.items?.[0]?.name || 'Custom') : g.packageTypeName} × ${g.quantity}` : x }}
                                onChange={(x) => setVas(i, { packageId: x })} />}
                        <MenuSelect value={v.service} placeholder="Pick a service" searchable options={vasOpts.map((o) => o.value)}
                          labels={(x) => vasOpts.find((o) => o.value === x)?.label ?? x} onChange={(x) => setVas(i, { service: x })} />
                        <NumBox integer blankZero placeholder="0" unit="min" value={v.serviceTimeMin} onChange={(n) => setVas(i, { serviceTimeMin: n })} />
                        <Input value={v.remark} placeholder="eg, Second floor" onChange={(x) => setVas(i, { remark: x })} />
                        <Tip text="Remove service"><button type="button" aria-label={`Remove service ${i + 1}`} onClick={() => setC({ vas: (c.vas ?? []).filter((_, j) => j !== i) })}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-ink-3 hover:bg-warm-100 hover:text-brand-500">
                          <Trash2 size={14} />
                        </button></Tip>
                      </div>
                      {missing.length > 0 && <ErrLine className="mt-1.5">Required: {missing.join(', ')}</ErrLine>}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
      </div>
        </Configurable>
      )}
    </div>
  )

  /* ------------------------------------------------------------ 4 · Service
     How it moves: the service, the load type, the vehicle — and the two questions about the MOVE itself:
     clearance on the way, and the loading time a full vehicle needs. */
  const dedicatedSpec = vehicleTypeOf(hubVehicles, vehicleChoice)
  const shipFromHubName = shipFromHub ? hubName(shipFromHub, stores) : ''
  const svcReveal = revealEntries([
    !hid('labelFormat') && ['labelFormat', <F key="lf" fieldKey="labelFormat" label={lbl('labelFormat')} value={c.labelFormat ?? ''} placeholder="eg, PDF"
      options={opts(LABEL_FORMATS)} onChange={(v) => setC({ labelFormat: v })} />, !!c.labelFormat],
    !hid('totalLoadingTime') && ['totalLoadingTime', <FNum key="lt" fieldKey="totalLoadingTime" label={lbl('totalLoadingTime')}
      blankZero integer unit="min" placeholder="minutes" value={c.totalLoadingTime ?? 0} onChange={(n) => setC({ totalLoadingTime: n || null })} />, (c.totalLoadingTime ?? 0) > 0],
    ...customEntries('sec-service'),
  ], inMore, secOpen('sec-service'))
  const serviceSection = (
    <FormCard id="sec-service" title="Service & instructions"
      caption="How it moves, anything the carrier should know, and any service on top of the delivery.">
      <SGrid>
        {!hid('serviceType') && (isFtl
          ? <F fieldKey="serviceType" label={lbl('serviceType')} required value={ftlService} options={opts(FTL_SERVICE_CODES)} placeholder="eg, Service" onChange={pickFtlService} />
          : <F fieldKey="serviceType" label={lbl('serviceType')} required value={service} options={opts(SERVICE_TYPES)} placeholder="eg, Service" searchable onChange={setService} />)}
        {!isFtl && !hid('dedicateTruck') && (
          <F fieldKey="dedicateTruck" label={custom('dedicateTruck', 'Dedicate Truck', 'Load type')} value={dedicated ? 'Yes' : 'No'}
            options={[{ value: 'No', label: 'Shared vehicle (LTL / LCL)' }, { value: 'Yes', label: 'Full vehicle (FTL / FCL)' }]}
            onChange={(v) => setDedicateTruck(v === 'Yes')} disabled={dedicatedLocked || !!fromOverage}
            helper={dedicatedLocked ? `Set by the service — ${serviceLoad === 'ftl' ? 'full' : 'shared'} vehicle only` : undefined} />
        )}
        {!isFtl && !hid('vehicleType') && (
          <SFld fieldKey="vehicleType" label={lbl('vehicleType')}
            helper={dedicatedSpec?.capacity || undefined}>
            {shipFromHub
              ? <MenuSelect value={vehicleChoice} placeholder={hubVehicles.length ? 'eg, 8 Ton Truck' : `No vehicles configured at ${shipFromHubName}`}
                  options={['', ...hubVehicles.map((v) => v.code)]}
                  labels={(v) => (v ? vehicleTypeOf(hubVehicles, v)?.name ?? v : '— None —')} searchable onChange={setDedicatedType} />
              : <Input value="" placeholder="Enter Ship From first" disabled onChange={() => undefined} />}
          </SFld>
        )}
        {svcReveal.nodes}
      </SGrid>
      <RevealToggle open={secOpen('sec-service')} onToggle={() => toggleSec('sec-service')} waiting={svcReveal.waiting} waitingFilled={svcReveal.waitingFilled} className="mt-6" />
      {addFieldLink('sec-service')}
      {extrasSection}
    </FormCard>
  )

  /* ------------------------------------------------------------ 6 · Carriers — LAST (owner, 2026-09-29):
     the carrier is chosen once everything it has to carry is known */
  const carrierSection = (
    <FormCard id="sec-carrier" title="Carriers" count={CARRIERS.length}
      caption="Who carries this consignment — pick one.">
      <div className="rounded-lg bg-warm-50 p-4 lg:mr-10">
        <div className="flex flex-wrap gap-4" role="radiogroup">
          {CARRIERS.map((k) => (
            <RadioCard key={k.code} label={k.code} filled={false} checked={c.carrier === k.code} onClick={() => setC({ carrier: k.code })} />
          ))}
        </div>
        {!c.carrier && <ErrLine className="mt-3">Pick a carrier.</ErrLine>}
      </div>
    </FormCard>
  )

  /* ============================================================ Grow (merchant): the console's Handling card with the
     load type asked in it · Service & instructions (label, note, VAS) · Service Type (the lane's cards, LAST) */
  const loadTypeField = (
    <div className="grid grid-cols-1 gap-x-6 sm:grid-cols-2 lg:grid-cols-4 lg:pr-10">
      <F label="Load type" required value={mode === 'ftl' ? 'ftl' : 'ltl'}
        options={[{ value: 'ltl', label: 'Shared vehicle (LTL / LCL)' }, { value: 'ftl', label: 'Full vehicle (FTL / FCL)' }]}
        disabled={!!fromOverage || pr?.shipmentType === 'FTL'}
        helper={mode === 'ftl' ? 'A whole vehicle just for this order' : 'Travels with other shipments'}
        onChange={(v) => changeMode(v === 'ftl' ? 'ftl' : 'ltl')} />
    </div>
  )
  const merchantHandlingSection = (
    <FormCard id="sec-handling" title="Handling" caption="How the goods must be handled on the way, and how they travel.">
      {handlingVisible && handlingSection.props.children}
      <div className={handlingVisible ? 'mt-6' : ''}>{loadTypeField}</div>
    </FormCard>
  )
  const merchantExtrasSection = !(svcReveal.nodes.length > 0 || svcReveal.waiting > 0 || extrasVisible || editing) ? null : (
    <FormCard id="sec-extras" title="Service & instructions" caption="The label, anything the carrier should know, and any service on top of the delivery.">
      {(svcReveal.nodes.length > 0 || svcReveal.waiting > 0) && (
        <>
          <SGrid>{svcReveal.nodes}</SGrid>
          <RevealToggle open={secOpen('sec-service')} onToggle={() => toggleSec('sec-service')} waiting={svcReveal.waiting} waitingFilled={svcReveal.waitingFilled} className="mt-4" />
        </>
      )}
      {addFieldLink('sec-service', svcReveal.nodes.length > 0 ? 'mt-6' : '')}
      {extrasSection}
    </FormCard>
  )
  const merchantServiceSection = (
    <FormCard id="sec-service" title="Service Type"
      caption={`${mode === 'ftl' ? 'Full vehicle' : 'Shared vehicle'} services and estimated rates for this route — pick one. The load type is asked in Handling.`}>
      <ServiceTypeChooser hideMode ready={ready} mode={mode} onMode={changeMode} modeLocked={!!fromOverage || pr?.shipmentType === 'FTL'}
        quotes={quotes} selected={selected} onSelect={setService} currency={currency} fleet={fleet} counts={counts} onCount={setCount}
        fleetNote={fleetNote} showErrors={showErrors} serviceLocked={serviceHidden} />
      {showErrors && !ready && (
        <ErrLine className="mt-3">Add {[!laneReady(sender) && 'a Ship From address', !allDrops.every(laneReady) && 'a Ship To address',
          !weightOk && 'a weight or size for every package'].filter(Boolean).join(', ')} to see the services.</ErrLine>
      )}
    </FormCard>
  )

  /* ============================================================ the Simplified form — as it was, restyled:
     Consignment (3 columns, the window on the Ship By Date) · Ship From → Ship To (the address cards + popup) ·
     Package & SKU (one table) · Carriers. No builder rules, no Handling / VAS / legs panel. */
  const setWindowTime = (which: 'windowStart' | 'windowEnd', t: string) =>
    setReceiver((r) => ({ ...r, [which]: t ? `${c.shipByDate || today()}T${t}` : '' }))
  const setSimpleShipBy = (d: string) => {
    setC({ shipByDate: d })
    if (d) setReceiver((r) => ({
      ...r, ...(r.windowStart ? { windowStart: `${d}T${timeOf(r.windowStart)}` } : {}), ...(r.windowEnd ? { windowEnd: `${d}T${timeOf(r.windowEnd)}` } : {}),
    }))
  }
  const simpleConsignment = (
    <FormCard id="sec-consignment" title="Consignment details">
      <SGrid cols={3}>
        <F label="Merchant" required value={merchant?.code ?? ''} placeholder="eg, ELEX"
          options={masters.merchants.map((m) => ({ value: m.code, label: m.name }))} error={err(!merchant)} onChange={(v) => setMerchantCode(v || null)} />
        {/* the Reference Number still copies this — silently (owner, 2026-09-29: no hint line) */}
        <F label={lbl('orderNumber')} required value={c.orderNumber ?? ''} placeholder="eg, ABC0001" error={err(!filled(c.orderNumber))}
          onChange={(v) => setC({ orderNumber: v })} />
        <F label={lbl('consignmentType')} required value={ctype} options={opts(CONSIGNMENT_TYPES)} onChange={changeType} />
        {isFtl
          ? <F label={lbl('serviceType')} required value={ftlService} options={opts(FTL_SERVICE_CODES)} onChange={pickFtlService} />
          : <F label={lbl('serviceType')} required value={service} options={opts(SERVICE_TYPES)} searchable onChange={setService} />}
        {!isFtl && (
          <F label="Load type" value={dedicated ? 'Yes' : 'No'}
            options={[{ value: 'No', label: 'Shared vehicle (LTL / LCL)' }, { value: 'Yes', label: 'Full vehicle (FTL / FCL)' }]}
            onChange={(v) => setDedicateTruck(v === 'Yes')} disabled={!!fromOverage} />
        )}
        <F label={lbl('shipByDate')} required type="date" value={c.shipByDate ?? ''} error={err(!filled(c.shipByDate))} onChange={setSimpleShipBy} />
        {/* Start / End Time share one cell and ARE the delivery window on the Ship By Date */}
        <div className="grid grid-cols-2 gap-3">
          <SFld label="Start Time" required error={!filled(timeOf(receiver.windowStart))}>
            <TimeBox value={timeOf(receiver.windowStart)} placeholder="Start" onChange={(v) => setWindowTime('windowStart', v)} />
          </SFld>
          <SFld label="End Time" required error={!filled(timeOf(receiver.windowEnd))}>
            <TimeBox value={timeOf(receiver.windowEnd)} placeholder="End" onChange={(v) => setWindowTime('windowEnd', v)} />
          </SFld>
        </div>
        <SFld label={lbl('tags')}>
          <MultiSelectDropdown options={TAG_OPTIONS} values={c.tags ?? []} noun="tags" placeholder="Add tags" onChange={(v) => setC({ tags: v })} />
        </SFld>
      </SGrid>
    </FormCard>
  )
  const simpleParties = (
    <FormCard id="sec-parties" title="Ship From → Ship To">
      <div className="grid gap-y-8 lg:grid-cols-2">
        <div className="min-w-0 lg:pr-8">{addressSlot('from', 0, 'Ship From')}</div>
        <div className="min-w-0 border-t border-warm-200 pt-8 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0">{addressSlot('to', 0, 'Ship To')}</div>
      </div>
      {addressModal}
    </FormCard>
  )
  const SIMPLE_COLS = 'grid grid-cols-[minmax(0,0.9fr)_minmax(0,1fr)_88px_minmax(0,1fr)_minmax(0,1.3fr)_minmax(0,1.3fr)_minmax(128px,auto)] items-start gap-x-3'
  const simplePackages = (
    <FormCard id="sec-packages" title="Package & SKU">
      <div className="overflow-x-auto lg:pr-10">
        <div className="min-w-[900px]">
          <div className={`${SIMPLE_COLS} border-b border-warm-200 pb-2 text-[13px] text-ink-2`}>
            <span>Package ID</span><span>Package Type</span><span>Quantity<span className="text-danger-fg"> *</span></span>
            <span>Tracking ID</span><span>SKU Code</span><span>SKU Name</span><span />
          </div>
          {parcels.map((p, i) => {
            const items: (ParcelItem | undefined)[] = p.items?.length ? p.items : [undefined]
            return items.map((it, k) => (
              <div key={`${p.packageId ?? i}-${k}`} className={`${SIMPLE_COLS} ${k === items.length - 1 ? 'border-b border-warm-200' : ''} py-2.5`}>
                {k === 0 ? <>
                  <ReadBox value={p.packageId ?? ''} />
                  <MenuSelect value={packageValue(p, packageTypes)} options={packageTypeOpts.map((o) => o.value)}
                    labels={(v) => packageTypeOpts.find((o) => o.value === v)?.label ?? v} onChange={(v) => pickPackageType(i, v)} />
                  <NumBox value={p.quantity} min={1} integer blankZero placeholder="1" error={err(!(p.quantity > 0))} onChange={(q) => setParcel(i, { quantity: q })} />
                  <Input value={p.trackingNumber ?? ''} placeholder="Optional" disabled={!!fromOverage && i === 0} onChange={(v) => setParcel(i, { trackingNumber: v })} />
                </> : <><span /><span /><span /><span /></>}
                <SkuCode item={it ?? blankItem()} skus={masters.skus} onPick={(sk) => pickSku(i, k, sk)} onUnlink={() => setItem(i, k, { skuCode: null })}
                  onCustom={(code) => setItem(i, k, { skuCode: code })} autoFocus={focusLine?.i === i && focusLine.k === k} />
                <Input value={it?.name ?? ''} placeholder="eg, Refrigerator 300 L" disabled={!!it && isMasterSku(it)} onChange={(v) => setItem(i, k, { name: v })} />
                <span className="flex items-center justify-end gap-1">
                  {k === 0 && (
                    <button type="button" onClick={() => addItem(i)} className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-[13px] text-brand-500 hover:bg-warm-50">
                      <Plus size={13} />SKU
                    </button>
                  )}
                  <Tip text={k === 0 ? 'Remove package' : 'Remove SKU'}><button type="button" aria-label={k === 0 ? `Remove package ${i + 1}` : `Remove SKU ${k + 1}`}
                    onClick={() => (k === 0 ? (parcels.length > 1 ? removeParcel(i) : setParcels([newParcel()])) : removeItem(i, k))}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md text-ink-3 hover:bg-warm-100 hover:text-brand-500">
                    <Trash2 size={14} />
                  </button></Tip>
                </span>
              </div>
            ))
          })}
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 lg:pr-10">
        <AddMoreButton label="Add Package" onClick={() => { setFocusLine({ i: parcels.length, k: 0 }); setParcels((ps) => [...ps, newParcel()]) }} />
        <span className="text-[13px] text-ink-2">{pieces} piece{pieces === 1 ? '' : 's'} in {parcels.length} package{parcels.length === 1 ? '' : 's'}</span>
      </div>
    </FormCard>
  )

  const byId: Record<string, ReactNode> = merchantMode ? {
    'sec-consignment': consignmentSection, 'sec-parties': partiesSection, 'sec-packages': packagesSection,
    'sec-handling': merchantHandlingSection, 'sec-extras': merchantExtrasSection, 'sec-service': merchantServiceSection,
  } : simple ? {
    'sec-consignment': simpleConsignment, 'sec-parties': simpleParties, 'sec-packages': simplePackages,
    'sec-vehicle': vehicleSection, 'sec-carrier': carrierSection,
  } : {
    'sec-consignment': consignmentSection, 'sec-parties': partiesSection, 'sec-packages': packagesSection, 'sec-handling': handlingSection,
    'sec-vehicle': vehicleSection, 'sec-service': serviceSection, 'sec-carrier': carrierSection,
  }

  /* owner, 2026-09-29: a back chevron beside the title (PageHeader's back button) + the one-line subtitle */
  const goBack = () => { clearDraftKeys(); nav(backTo) }
  const backBtn = (
    <Tip text="Go back"><button type="button" onClick={goBack} aria-label="Go back"
      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-line bg-surface text-ink-2 shadow-ds-1 transition-colors hover:bg-warm-100">
      <ChevronLeft size={16} />
    </button></Tip>
  )
  const SUBTITLE = 'Provide the order details to ensure accurate processing, routing, and billing of the shipment.'
  /* the builder's two forms — the console's, and the Grow portal's (the merchant form, previewed here) */
  const changedForGrow = growSetup ? Object.keys(draftRules).length : 0
  /* a segment (CLAUDE.md: border-ink + bg-warm-50 for the chosen one), the explanation in a tooltip */
  const portalSwitch = (
    <div role="radiogroup" aria-label="Which form" className="inline-flex shrink-0 gap-1 rounded-lg border border-line bg-surface p-1">
      {([
        ['console', 'Console form', Monitor, 'What ops see on Add Consignment'],
        ['grow', 'Grow portal form', Store, 'What merchants see on Create Order'],
      ] as const).map(([p, label, Icon, hint]) => (
        <Tip key={p} text={hint}>
          <button type="button" role="radio" aria-checked={formPortal === p} onClick={() => switchPortal(p)}
            className={`inline-flex h-8 items-center gap-1.5 rounded-md border px-3.5 text-[13px] transition-colors
              ${formPortal === p ? 'border-ink bg-warm-50 font-bold text-ink' : 'border-transparent text-ink-2 hover:bg-warm-50'}`}>
            <Icon size={14} />{label}
          </button>
        </Tip>
      ))}
    </div>
  )
  const builderBar = merchantMode && !editing ? (
    <div className="mb-5 flex items-start gap-3">
      {backBtn}
      <div className="min-w-0">
        <h1 className="text-[18px] font-bold leading-8 text-ink">Create Order</h1>
        <p className="text-[13px] text-ink-2">{SUBTITLE}</p>
      </div>
    </div>
  ) : editing ? (
    /* the editing bar (owner, 2026-10-05: "needs a better UI") — two rows in one card: what is being edited and how to
       finish it (Cancel / Save) above; which form, and the tools for the whole form, below. Row 2 rounds its own bottom
       corners instead of the card clipping (overflow-hidden would cut off the ⓘ legend that opens over the card's edge). */
    <div className="sticky top-0 z-40 mb-6 rounded-xl border border-line bg-surface shadow-ds-1">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 px-5 py-4">
        <div className="flex min-w-0 flex-[1_1_360px] items-center gap-3">
          <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-500">
            <SlidersHorizontal size={18} />
          </span>
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-[15px] font-bold text-ink">
              {growSetup ? 'Editing the Grow portal form' : 'Editing the console form'}
              <InfoTip text="Type over a label to rename it. ✱ Required · ☰ More information · .* Format checks what is typed · 👁 hide. + Add field adds your own field. A lock = needed by the system." />
            </p>
            <p className="text-[13px] text-ink-2">
              {growSetup
                ? 'What merchants see on Create Order. It follows the console form — changes here are for Grow only.'
                : 'What ops see on Add Consignment. Grow follows it, unless Grow has its own setting.'}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {dirty && <span className="text-[12px] text-ink-3">Unsaved changes</span>}
          <Button variant="outline" onClick={cancelEditing}>Cancel</Button>
          <Button disabled={!dirty} onClick={() => saveEditing()}>Save changes</Button>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-b-xl border-t border-line bg-warm-50 px-5 py-2.5">
        {portalSwitch}
        {growSetup && changedForGrow > 0 && (
          <span className="rounded-full bg-brand-50 px-2.5 py-0.5 text-[12px] font-bold text-brand-600">{changedForGrow} changed for Grow</span>
        )}
        <div className="ml-auto flex flex-wrap items-center gap-x-4 gap-y-2">
          <Tip text="Hidden fields stay in this preview, faded, so you can bring them back">
            <InlineSwitch label="Show hidden fields" checked={showHidden} onChange={setShowHidden} />
          </Tip>
          {growSetup
            ? <Button variant="ghost" size="sm" icon={<RotateCcw size={13} />} disabled={changedForGrow === 0 && draftGoods === loadGoodsSetting('console')}
                onClick={() => { setDraftRules({}); setDraftGoods(loadGoodsSetting('console')) }}>Match console form</Button>
            : <Button variant="ghost" size="sm" icon={<RotateCcw size={13} />} onClick={() => { setDraftRules({}); setDraftGoods(DEFAULT_GOODS_SETTING) }}>Reset to default</Button>}
        </div>
      </div>
    </div>
  ) : (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="flex min-w-0 items-start gap-3">
      {backBtn}
      <div className="min-w-0">
        <h1 className="text-[18px] font-bold leading-8 text-ink">{liveEdit ? 'Modify Consignment' : 'Add Consignment'}{simple && <span className="ml-2 text-[13px] font-normal text-ink-3">· Simplified</span>}</h1>
        <p className="text-[13px] text-ink-2">
          {SUBTITLE}
        </p>
      </div>
      </div>
      {/* owner, 2026-09-29: no old-form link, no change count, no simplified-form note — just the builder entry */}
      {!simple && <Button variant="outline" icon={<SlidersHorizontal size={14} />} onClick={startEditing}>Edit consignment form</Button>}
    </div>
  )

  return (
    <BuilderCtx.Provider value={builder}>
    <ShowErrorsCtx.Provider value={showErrors}>
    <div className={merchantMode && !growSetup ? 'pb-6' : 'px-6 pb-10 pt-2'}>
      {builderBar}
      {merchantMode && pr && (
        <div className="mb-4 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg bg-info-bg px-4 py-2.5 text-[13px] text-ink">
          <Truck size={15} className="shrink-0 text-info-fg" />
          <span>Creating an order for <b>{pr.number}</b>{pr.ftlServiceType ? ` · ${pr.ftlServiceType}` : ''} · window {prWindow(pr)}</span>
          <Link to={prPath(pr.id)} className="font-bold text-brand-500 hover:text-brand-600">View pickup request</Link>
        </div>
      )}
      {fromPr && (
        <div className="mb-4 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg bg-info-bg px-4 py-2.5 text-[13px] text-ink">
          <Truck size={15} className="shrink-0 text-info-fg" />
          <span>Creating the FTL order for <b>{fromPr.number}</b>
            {fromPr.ftlServiceType ? ` · ${fromPr.ftlServiceType}` : ''}
            {fromPr.vehicleType ? ` · ${(fromPr.vehicleUnit ?? 1) > 1 ? `${fromPr.vehicleUnit} × ` : ''}${fromPr.vehicleType}` : ''} · window {prWindow(fromPr)}</span>
          <Link to={prPath(fromPr.id)} className="font-bold text-brand-500 hover:text-brand-600">View pickup request</Link>
        </div>
      )}
      {fromOverage && (
        <div className="mb-4 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg bg-info-bg px-4 py-2.5 text-[13px] text-ink">
          <ScanBarcode size={15} className="shrink-0 text-info-fg" />
          <span>Creating the order for overage scan <b className="font-mono">{fromOverage.scan.barcode}</b> from <b>{fromOverage.pr.number}</b>
            {fromOverage.scan.weightKg != null ? ` · ${fromOverage.scan.weightKg} kg` : ''}</span>
          <Link to={prPath(fromOverage.pr.id)} className="font-bold text-brand-500 hover:text-brand-600">View pickup request</Link>
        </div>
      )}

      <div className="grid min-w-0 gap-5">
        {sections.map((id) => <div key={id} className="min-w-0">{byId[id]}</div>)}
      </div>

      {/* sticky footer — the form switch (owner, 2026-09-29: where the section strip was), then Go Back + Add Order */}
      <div className="sticky bottom-0 z-30 mt-5 flex items-center gap-x-4 rounded-xl border border-warm-200 bg-surface px-5 py-3 shadow-ds-1">
        {merchantMode ? (
          /* Grow: the estimate for what is on screen (checkout confirms it) */
          <div className="min-w-0 text-[13px]">
            {quote && ftlOk
              ? <p className="truncate text-ink"><b>{money(quote.net, currency)}</b><span className="text-ink-2"> estimated · {quote.name} · delivery by {quote.days} day{quote.days === 1 ? '' : 's'}{vehicleLine ? ` · ${vehicleLine}` : ''}</span></p>
              : <p className="truncate text-ink-3">{!mode ? 'Choose a load type in Service Type to see rates' : !ready ? 'Rates appear once the addresses and packages are in' : !quote ? 'Choose a service' : 'Add a vehicle'}</p>}
          </div>
        ) : (
          <Button variant="outline" disabled={editing} onClick={() => setTier(simple ? 'full' : 'simplified')}>
            {simple ? 'Switch to Regular form' : 'Switch to Simplified'}
          </Button>
        )}
        {/* the actions never wrap away from each other — the strip gives way first */}
        <div className="ml-auto flex shrink-0 items-center gap-3">
          {editing
            ? <span className="text-[13px] text-ink-2">Save or cancel the form changes first</span>
            : showErrors && !canSubmit && <span className="text-[13px] text-danger-fg">{missingCount} field{missingCount === 1 ? '' : 's'} to fill or fix</span>}
          {!editing && <Button variant="ghost" onClick={goBack}>Go Back</Button>}
          {/* enabled: a click with gaps shows them (errors appear only after this attempt) */}
          {merchantMode && <Button variant="outline" onClick={saveForLater} disabled={editing}>Save for later</Button>}
          <Button onClick={proceed} disabled={editing}>{merchantMode ? 'Continue to checkout' : liveEdit ? 'Save changes' : 'Add Order'}</Button>
        </div>
      </div>

      {/* the builder's dialogs (2026-10-05) — plain fields, outside the builder's label tools */}
      <BuilderCtx.Provider value={null}>
      {fmtKey && (
        <FormatDialog fieldLabel={lbl(fmtKey)} value={fmtOf(fmtKey)} portal={formPortal}
          onClose={() => setFmtKey(null)}
          onApply={(f) => { setRule(fmtKey, { format: f }); setFmtKey(null) }} />
      )}
      {addCard && (
        <AddFieldDialog card={addCard} portal={formPortal} taken={customDefs.map((d) => d.label.toLowerCase())}
          onClose={() => setAddCard(null)}
          onAdd={(def, required, alsoOther) => {
            setDraftCustom((ds) => [...ds, def])
            if (required) setRule(def.key, { required: true })
            if (!alsoOther) setOtherHidden((xs) => [...xs, def.key])
            setAddCard(null)
            toast.success(`${def.label} added to ${CUSTOM_FIELD_CARDS[def.card]} — Save changes to keep it`)
          }} />
      )}
      </BuilderCtx.Provider>
      <Modal open={!!switchTo} title={`Save your changes to the ${growSetup ? 'Grow portal' : 'console'} form?`}
        subtitle={`You are switching to the ${switchTo === 'grow' ? 'Grow portal' : 'console'} form.`}
        onClose={() => setSwitchTo(null)}
        footer={<>
          <Button variant="ghost" onClick={() => setSwitchTo(null)}>Keep editing</Button>
          <Button variant="outline" onClick={() => { const p = switchTo; setSwitchTo(null); if (p) goPortal(p) }}>Discard changes</Button>
          <Button onClick={() => { const p = switchTo; setSwitchTo(null); saveEditing(() => { if (p) goPortal(p) }) }}>Save and switch</Button>
        </>}>
        <p className="pb-4 text-[13px] text-ink-2">Changes you have not saved are lost when you switch, unless you save them first.</p>
      </Modal>
    </div>
    </ShowErrorsCtx.Provider>
    </BuilderCtx.Provider>
  )
}

/* ================================================================ builder dialogs (2026-10-05) ==== */

/**
 * Format — what may be typed in one field: a preset (numbers only, an email, a phone number…) or the account's own
 * regular expression, an optional length, and the message people see. "Try it" checks a sample as you type.
 */
function FormatDialog({ fieldLabel, value, portal, onApply, onClose }: {
  fieldLabel: string; value: FieldFormat | undefined; portal: 'console' | 'grow'
  onApply: (f: FieldFormat | undefined) => void; onClose: () => void
}) {
  const [f, setF] = useState<FieldFormat>(value ?? { preset: 'digits' })
  const [sample, setSample] = useState('')
  const preset = FORMAT_PRESETS.find((p) => p.value === f.preset) ?? FORMAT_PRESETS[0]
  const bad = patternError(f)
  const lenBad = !!f.minLength && !!f.maxLength && f.minLength > f.maxLength
  const tried = sample.trim() ? formatError(f, sample) : null
  const num = (v: string) => { const n = Math.round(Number(v)); return v.trim() && Number.isFinite(n) && n > 0 ? n : undefined }
  return (
    <Modal open title={`Format · ${fieldLabel}`} onClose={onClose}
      subtitle={`Checks what is typed in this field on the ${portal === 'grow' ? 'Grow portal' : 'console'} form. An empty field is left to Required.`}
      footer={<>
        {value && <span className="mr-auto"><Button variant="ghost" icon={<Trash2 size={14} />} onClick={() => onApply(undefined)}>Remove format</Button></span>}
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button disabled={!!bad || lenBad || f.preset === 'any'} onClick={() => onApply(f)}>Apply</Button>
      </>}>
      <div className="grid gap-x-5 gap-y-7 pb-4 pt-1 sm:grid-cols-2">
        <SFld label="Allowed" className="sm:col-span-2">
          <MenuSelect value={f.preset} options={FORMAT_PRESETS.filter((p) => p.value !== 'any').map((p) => p.value)}
            labels={(v) => FORMAT_PRESETS.find((p) => p.value === v)?.label ?? v}
            onChange={(v) => setF((x) => ({ ...x, preset: v as FormatPreset }))} />
        </SFld>
        {f.preset === 'custom' && (
          <SFld label="Pattern (regular expression)" className="sm:col-span-2" error={bad && f.pattern ? bad : undefined} errorNow
            helper={bad ? undefined : 'eg, ^ORD[0-9]{6}$ = ORD followed by 6 digits'}>
            <Input value={f.pattern ?? ''} placeholder="^ORD[0-9]{6}$" onChange={(v) => setF((x) => ({ ...x, pattern: v }))} />
          </SFld>
        )}
        <SFld label="Shortest (characters)" error={lenBad ? 'Longer than the longest' : undefined} errorNow>
          <Input type="number" value={f.minLength ? String(f.minLength) : ''} placeholder="Any" onChange={(v) => setF((x) => ({ ...x, minLength: num(v) }))} />
        </SFld>
        <SFld label="Longest (characters)">
          <Input type="number" value={f.maxLength ? String(f.maxLength) : ''} placeholder="Any" onChange={(v) => setF((x) => ({ ...x, maxLength: num(v) }))} />
        </SFld>
        <SFld label="Message when it does not match" className="sm:col-span-2">
          <Input value={f.message ?? ''} placeholder={formatMessage({ ...f, message: '' }) || 'Does not match the required format'}
            onChange={(v) => setF((x) => ({ ...x, message: v }))} />
        </SFld>
        <div className="rounded-lg bg-warm-50 p-4 sm:col-span-2">
          <p className="mb-2 text-[13px] font-bold text-ink">Try it</p>
          <Input value={sample} placeholder={preset.example ? `eg, ${preset.example}` : 'Type a sample value'} onChange={setSample} />
          <p className={`mt-2 flex items-center gap-1.5 text-[12px] ${!sample.trim() || bad ? 'text-ink-3' : tried ? 'text-danger-fg' : 'text-success-fg'}`}>
            {!sample.trim() || bad ? 'Type a value to see if it passes.'
              : tried ? <><X size={13} />{tried}</> : <><Check size={13} />Looks good — this value passes.</>}
          </p>
        </div>
      </div>
    </Modal>
  )
}

/**
 * Add field — the account's own field in a card: its name, what kind of answer it takes, and whether it is required.
 * One choice only for the other form: show it there too (on by default).
 */
function AddFieldDialog({ card, portal, taken, onAdd, onClose }: {
  card: CustomFieldCard; portal: 'console' | 'grow'; taken: string[]
  onAdd: (def: CustomFieldDef, required: boolean, alsoOther: boolean) => void; onClose: () => void
}) {
  const [label, setLabel] = useState('')
  const [kind, setKind] = useState<CustomFieldKind>('text')
  const [choices, setChoices] = useState('')
  const [placeholder, setPlaceholder] = useState('')
  const [required, setRequired] = useState(false)
  const [alsoOther, setAlsoOther] = useState(true)
  const [tried, setTried] = useState(false)
  const options = [...new Set(choices.split(/[\n,]/).map((x) => x.trim()).filter(Boolean))]
  const nameErr = !label.trim() ? 'Give the field a name' : taken.includes(label.trim().toLowerCase()) ? 'A field with this name already exists' : null
  const listErr = kind === 'list' && options.length < 2 ? 'Add at least two choices' : null
  const other = portal === 'grow' ? 'console' : 'Grow portal'
  const add = () => {
    setTried(true)
    if (nameErr || listErr) return
    onAdd({
      key: newCustomKey(), label: label.trim(), kind, card,
      ...(kind === 'list' ? { options } : {}),
      ...(placeholder.trim() && kind !== 'yesno' && kind !== 'date' ? { placeholder: placeholder.trim() } : {}),
    }, required && kind !== 'yesno', alsoOther)
  }
  return (
    <Modal open title="Add a field" subtitle={`It appears in ${CUSTOM_FIELD_CARDS[card]}. You can rename it, move it, make it required or give it a Format later.`}
      onClose={onClose}
      footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={add}>Add field</Button></>}>
      <div className="grid gap-7 pb-4 pt-1">
        <SFld label="Field name" required error={tried && nameErr ? nameErr : undefined} errorNow>
          <Input value={label} placeholder="eg, PO Number" onChange={setLabel} />
        </SFld>
        <div>
          <p className="mb-1.5 text-[13px] text-ink">Answer type</p>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Answer type">
            {CUSTOM_FIELD_KINDS.map((k) => (
              <button key={k.value} type="button" role="radio" aria-checked={kind === k.value} onClick={() => setKind(k.value)}
                className={`inline-flex h-8 items-center rounded-full border px-3 text-[13px] transition-colors
                  ${kind === k.value ? 'border-ink bg-warm-50 font-bold text-ink' : 'border-line bg-surface text-ink-2 hover:border-warm-300 hover:text-ink'}`}>
                {k.label}
              </button>
            ))}
          </div>
        </div>
        {kind === 'list' && (
          <SFld label="Choices" required error={tried && listErr ? listErr : undefined} errorNow helper={tried && listErr ? undefined : 'One per line, or separated by commas'}>
            <textarea rows={3} value={choices} placeholder={'eg, Morning\nAfternoon\nEvening'} onChange={(e) => setChoices(e.target.value)} className={TEXTAREA} />
          </SFld>
        )}
        {(kind === 'text' || kind === 'number' || kind === 'list') && (
          <SFld label="Hint inside the box (optional)">
            <Input value={placeholder} placeholder={kind === 'list' ? 'eg, Select a slot' : 'eg, PO-12345'} onChange={setPlaceholder} />
          </SFld>
        )}
        <div className="grid gap-3">
          {kind !== 'yesno' && <InlineSwitch label="Required" title="It must be filled before the consignment can be added" checked={required} onChange={setRequired} />}
          <InlineSwitch label={`Also show it on the ${other} form`} title={`Off: only on the ${portal === 'grow' ? 'Grow portal' : 'console'} form`}
            checked={alsoOther} onChange={setAlsoOther} />
        </div>
      </div>
    </Modal>
  )
}
