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
 *   3 Package & SKU — each package with its SKUs; the builder may hide the SKUs (packages only) or the packages
 *     (SKU-based: SKU + quantity, master or typed NEW SKU — the packages are worked out); one derived list `goods`.
 *     Each package is entered in kg + cm or lb + in (its SKUs follow); the numbers are kept in kg + cm.
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
 * Grow: Service Type is chosen at checkout (step 2 · Service & payment); the builder previews it under "Next step".
 */
import { createContext, Fragment, isValidElement, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ComponentProps, type KeyboardEvent, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import {
  Check, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, CircleMinus, Info, Lock, MapPinned, Package, Pencil, Plus, RotateCcw,
  ArrowDown, ArrowUp, Asterisk, Barcode, Bookmark, Copy, Eye, EyeOff, GripVertical, ListChecks, ListCollapse, Regex, ScanBarcode, SlidersHorizontal, Trash2, Truck, X, Crown, Flame, GlassWater, Layers, Users, Weight, Monitor, Store,
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
  Button, DateInput, Input, MenuSelect, Modal, MultiSelectDropdown, Toggle, SearchInput, Tooltip, WizardSteps,
} from '../../nueva/components'
import {
  AddMoreButton, PhoneInput, SwitchBox, SwitchField, TimeBox, UnitBox,
} from '../../components/consignmentForm'
import { money, ORDER_STEPS, OTHER_ADDRESS, partyOk, prWindow, storeOptionLabel } from '../GrowOrders/utils'
import { hubName, inboundHubFor, INBOUND_HUBS } from '../../growOrders/hubs'
import { usePickupLocations, useReceiverBook } from '../GrowOrders/pickupLocations'
import {
  hasPickupLeg, legsOf, legsOfMovement, movementOfLegs, MOVEMENT_TYPES, type LegChoice, type LegKind, type MovementType, type RouteEnd,
} from './shipmentLegs'
import {
  ADDITIONAL_SERVICES, DEFAULT_FTL_SERVICE, DRAFT_KEY, FTL_SERVICE_CODES, FTL_SERVICE_TYPES, PARCEL_SERVICES, SERVICE_TYPES, VEHICLE_SPECS,
  clearDraftKeys, draftFromOrder, loadTypeOf, ftlQuoteVehicles, ftlServiceType, readOverageSidecar, setCheckoutSidecar, setDraftSidecar,
  totalLoadKg, vehiclesFor,
  vehiclesOf, type ConsignmentFields, type CustomFieldValue, type FtlVehicle, type OrderDraft, type Parcel, type ParcelItem, type UnitSystem, type VasLine, type WeightUnit, type DimUnit,
} from '../../growOrders/draft'
import {
  CUSTOM_FIELD_CARDS, CUSTOM_FIELD_KINDS, DEFAULT_LAYOUT, FIELD_WIDTHS, FORMAT_PRESETS, PKG_SECTION, SKU_SECTION, applyOrder, clearLegacyGoods, formatError, formatMessage, formatSummary,
  growRules, isCustomKey, loadCustomFields, loadLayout, loadOrder, loadRules, loadSummary, moveId, newCustomKey, patternError,
  saveCustomFields, saveLayout, saveOrder, saveRules, saveSummary, withoutKeys, DEFAULT_SUMMARY,
  type CustomFieldCard, type CustomFieldDef, type CustomFieldKind, type FieldFormat, type FieldRuleV2, type FieldWidth, type FormatPreset, type FormLayout,
  type FormRulesV2, type FormOrder, type FormSummary, type AddressArrangement, type AddressEntry, FORM_TIER_KEY,
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
import { CONSIGNMENT_FIELDS, fieldLabel, loadFieldConfig, loadFormBehavior, type FieldDef } from '../ConsignmentAdd/fieldConfig'


/* ---- option lists ---- */
const CONSIGNMENT_TYPES = ['Forward', 'Reverse', 'Exchange', 'Transfer', 'Service']
const PAYMENT_MODES = ['Prepaid', 'COD', 'To Pay']
const LABEL_FORMATS = ['PDF', 'ZPL']
/** sample Tag Master — the portal has no tag API */
const TAG_OPTIONS = ['Ambient', 'Priority', 'Gift', 'B2B', 'Weekend Delivery', 'Bulky']
const RTO_MODES = ['Same As Ship From', 'Use Different Address']
const DIAL_CODES = ['+63', '+27', '+264', '+267', '+1', '+44', '+91']
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
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`
/** the SKU list of the separate layout in its own order (each line's `lineNo`, else where it stands) — so a SKU a
    package picks keeps its number and its place in the list */
const sepSort = <T,>(rows: T[], itOf: (r: T) => ParcelItem): T[] => rows.map((r, idx) => ({ r, idx, no: itOf(r).lineNo ?? idx + 1 }))
  .sort((a, b) => a.no - b.no || a.idx - b.idx).map((x) => x.r)
/** packages listed before "Show all" (owner, 2026-10-05: "if I have 100 packages this form is too much scroll") */
const PKG_PAGE = 8
/** the package row's field widths (flex: grow shrink basis) — Quantity and Weight fixed and narrow (owner, 2026-10-06) */
const PKG_CELL: Record<string, string> = {
  /* a field that wraps alone onto the next line grows only so far (max-w) — never one box across the card */
  type: 'flex-[1.2_1_160px] max-w-[300px]', qty: 'flex-[0_0_88px]', dims: 'flex-[1.3_1_200px] max-w-[320px]', weight: 'flex-[0_0_112px]',
  other: 'flex-[1_1_140px] max-w-[280px]',
}
const newVas = (): VasLine => ({ level: 'SKU', skuCode: '', service: '', serviceTimeMin: 0, remark: '' })
/* owner, 2026-09-29: a service is added to a PACKAGE or a SKU (a full-vehicle booking: the whole booking) */
const vasOk = (v: VasLine) => !!v.level && !!v.service && (v.level !== 'SKU' || !!v.skuCode) && (v.level !== 'PACKAGE' || !!v.packageId)
const round2 = (n: number) => Number(n.toFixed(2))
const filled = (v: string | undefined) => !!(v ?? '').trim()

/* ---- package units (owner, 2026-10-06: "Package Unit selectable, the same unit flows to the SKU — both portals"): a
   package is entered in kg + cm or lb + in and its SKUs follow it. The numbers are always KEPT in kg + cm, so rates,
   checkout, the summary and the views read them as before; only what is shown and typed is converted. ---- */
const KG_PER_LB = 0.45359237
const KG_PER_OZ = 0.028349523125
const CM_PER_IN = 2.54
/** what decides a package's units: the two independent choices, else the older pair (`unitSystem`), else kg · cm */
type UnitSrc = Pick<Parcel, 'unitSystem' | 'weightUnit' | 'dimUnit'>
interface Units {
  /** the weight / length unit as shown */
  w: WeightUnit; d: DimUnit
  /** kg → shown · shown → kg; cm → shown · shown → cm */
  toW: (kg: number) => number; fromW: (v: number) => number
  toD: (cm: number) => number; fromD: (v: number) => number
  /** cm³ → the size unit cubed (a package's size) · cm³ → "0.012 m³" or "0.4 ft³" (a total) */
  toV: (cm3: number) => number; vol: (cm3: number) => string
  /** a shown value is rounded — NumBox keeps what was typed while it rounds to the same value */
  precision?: number
}
const WEIGHT_UNITS: WeightUnit[] = ['kg', 'g', 'lb', 'oz']
const DIM_UNITS: DimUnit[] = ['cm', 'in', 'mm', 'm']
const WEIGHT_PER_KG: Record<WeightUnit, number> = { kg: 1, g: 1000, lb: 1 / KG_PER_LB, oz: 1 / KG_PER_OZ }
const WEIGHT_DIGITS: Record<WeightUnit, number> = { kg: 3, g: 1, lb: 2, oz: 2 }
const CM_PER_UNIT: Record<DimUnit, number> = { cm: 1, in: CM_PER_IN, mm: 0.1, m: 100 }
const DIM_DIGITS: Record<DimUnit, number> = { cm: 3, in: 2, mm: 1, m: 4 }
const LEGACY_PAIR: Record<UnitSystem, [WeightUnit, DimUnit]> = { metric: ['kg', 'cm'], gram: ['g', 'cm'], imperial: ['lb', 'in'], ounce: ['oz', 'in'] }
/* rounded only to hide a converted value's float tail (4.5359237 kg typed as 10 lb) */
const rounded = (n: number, digits: number) => Number(n.toFixed(digits))
function unitsFor(w: WeightUnit, d: DimUnit): Units {
  const wf = WEIGHT_PER_KG[w], df = CM_PER_UNIT[d]
  return {
    w, d, precision: WEIGHT_DIGITS[w],
    toW: (kg) => rounded(kg * wf, WEIGHT_DIGITS[w]), fromW: (v) => v / wf,
    toD: (cm) => rounded(cm / df, DIM_DIGITS[d]), fromD: (v) => v * df,
    toV: (cm3) => cm3 / df ** 3,
    vol: (cm3) => (d === 'in' ? `${(cm3 / 28316.846592).toFixed(3)} ft³` : `${(cm3 / 1e6).toFixed(3)} m³`),
  }
}
const METRIC: Units = unitsFor('kg', 'cm')
const unitsOf = (s?: UnitSrc | null): Units => {
  const legacy = LEGACY_PAIR[s?.unitSystem ?? 'metric'] ?? LEGACY_PAIR.metric
  return unitsFor(s?.weightUnit ?? legacy[0], s?.dimUnit ?? legacy[1])
}
/** a SKU line saved with its own units (the retired per-SKU Weight / Dimension unit) — its numbers to kg + cm */
function canonItem(it: ParcelItem): ParcelItem {
  const w = (it.weightUom ?? 'KG').toUpperCase()
  const d = (it.dimUom ?? 'CM').toUpperCase()
  if (w === 'KG' && d === 'CM') return it
  const wf = w === 'LB' || w === 'LBS' ? KG_PER_LB : w === 'OZ' ? KG_PER_OZ : w === 'G' ? 0.001 : 1
  const df = d === 'IN' ? CM_PER_IN : d === 'M' ? 100 : 1
  const dim = (x: number | undefined) => (x == null ? x : x * df)
  return { ...it, weightKg: it.weightKg * wf, weightUom: 'KG', lengthCm: dim(it.lengthCm), widthCm: dim(it.widthCm), heightCm: dim(it.heightCm), dimUom: 'CM' }
}
/** …and its package then shows lb + in when its SKUs were typed that way */
function canonParcel(p: Parcel): Parcel {
  if (!(p.items ?? []).some((it) => (it.weightUom ?? 'KG').toUpperCase() !== 'KG' || (it.dimUom ?? 'CM').toUpperCase() !== 'CM')) return p
  const imperial = (p.items ?? []).some((it) => /^(LBS?|IN)$/i.test(it.weightUom ?? '') || /^IN$/i.test(it.dimUom ?? ''))
  return { ...p, items: p.items?.map(canonItem), ...(!p.unitSystem && imperial ? { unitSystem: 'imperial' as const } : {}) }
}
/** A package's units — TWO small dropdowns at input height, set independently (owner, 2026-10-07): the weight unit (kg · g · lb · oz)
    and the size unit (cm · in · mm · m). */
function UnitPick({ units, onChange, label = 'Units' }: { units: Pick<Units, 'w' | 'd'>; onChange: (patch: { weightUnit?: WeightUnit; dimUnit?: DimUnit }) => void; label?: string }) {
  return (
    <div className="flex shrink-0 items-center gap-1.5" role="group" aria-label={label} title={label}>
      <div className="w-[68px]" title="Weight unit">
        <MenuSelect value={units.w} options={WEIGHT_UNITS} onChange={(v) => onChange({ weightUnit: v as WeightUnit })} />
      </div>
      <span className="text-ink-3" aria-hidden>·</span>
      <div className="w-[68px]" title="Size unit">
        <MenuSelect value={units.d} options={DIM_UNITS} onChange={(v) => onChange({ dimUnit: v as DimUnit })} />
      </div>
    </div>
  )
}

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
  /** the list under (or over) the box — false when the box is off screen */
  const place = () => {
    const r = ref.current?.getBoundingClientRect()
    if (!r || r.bottom < 0 || r.top > window.innerHeight) return false
    const below = window.innerHeight - r.bottom
    const up = below < 220 && r.top > below
    /* wide enough for a SKU's full name, never past the screen's edge */
    const width = Math.max(r.width, Math.min(440, window.innerWidth - r.left - 16))
    setPos(up
      ? { bottom: window.innerHeight - r.top + 4, left: r.left, width, maxHeight: Math.min(320, r.top - 12) }
      : { top: r.bottom + 4, left: r.left, width, maxHeight: Math.min(320, below - 12) })
    return true
  }
  const setOpen = (v: boolean) => {
    if (v && !place()) return
    setOpenState(v)
  }
  useEffect(() => {
    if (!open) return
    const click = (e: MouseEvent) => {
      const t = e.target as Node
      if (!ref.current?.contains(t) && !popRef.current?.contains(t)) setOpenState(false)
    }
    /* the list follows its box when the page scrolls (focusing a new SKU line scrolls it into view — closing on that
       scroll left the box focused with no list, and a click on a focused box never re-opened it); it closes only once
       the box leaves the screen */
    const scroll = (e: Event) => { if (!popRef.current?.contains(e.target as Node) && !place()) setOpenState(false) }
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
/** A text box that hands its value over only once it is left (or on Enter) — for a value other things key on (a package's
    id: its card and the open package follow it, so a change per keystroke would rebuild the card under the cursor).
    Left empty = the value stays as it was. */
function CommitBox({ value, onCommit, placeholder }: { value: string; onCommit: (v: string) => void; placeholder?: string }) {
  const [text, setText] = useState<string | null>(null)
  const commit = () => {
    if (text === null) return
    const v = text.trim()
    setText(null)
    if (v && v !== value) onCommit(v)
  }
  return (
    <div onBlur={commit} onKeyDown={(e) => { if (e.key === 'Enter') commit() }}>
      <Input value={text ?? value} placeholder={placeholder} onChange={setText} />
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
function NumBox({ value, onChange, unit, integer, min = 0, blankZero, error, disabled, placeholder, precision }: {
  value: number; onChange: (n: number) => void; unit?: string
  integer?: boolean; min?: number; blankZero?: boolean; error?: string; disabled?: boolean; placeholder?: string
  /** `value` is shown rounded to this many decimals (a converted unit): what was typed stays while it rounds to it */
  precision?: number
}) {
  const [typed, setTyped] = useState<{ text: string; of: number } | null>(null)
  const same = (a: number, b: number) => a === b || (precision !== undefined && Math.abs(a - b) <= 0.5 * 10 ** -precision + 1e-9)
  const text = typed && same(typed.of, value) ? typed.text : (blankZero && value === 0 ? '' : String(value))
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
      onMouseDown={() => { if (!open) setOpen(true) }} onBlur={() => { window.setTimeout(commitTyped, 180) }}>
      <SearchInput value={q} onChange={(v) => { setQ(v); setHi(0); setOpen(true) }} placeholder={onCustom ? 'Search or type SKU' : 'Search SKU'} />
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
/** a load in words — kg below a tonne (never "0.00 tons"), tonnes with the kg above it */
const loadText = (kg: number) => (kg >= 1000 ? `${(kg / 1000).toFixed(1)} t (${kg.toLocaleString()} kg)` : `${kg.toLocaleString()} kg`)
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
  /* while editing, a field the builder knows is ONE click target \u2014 its settings open in a card beside it */
  const pickable = editing && !!fieldKey && b!.known(fieldKey)
  /* the builder's Width: the field's grid span (a drag cell takes it itself while the form is edited) */
  const cols = useContext(GridColsCtx)
  const span = fieldKey && b ? widthSpan(b.width(fieldKey), cols) : ''
  return (
    <div data-field={pickable ? fieldKey : undefined}
      className={`relative min-w-0 ${className} ${span} ${pickable ? `group/field ${pickFrame(b!.selected === fieldKey, !!b!.lock(fieldKey!))}` : ''}`}>
      {editing
        ? <BuilderLabel label={label} fieldKey={fieldKey} required={required} />
        : (
          <label className="mb-1.5 flex min-h-5 items-start gap-1 field-label" title={label}>
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
      {pickable && <PickHit k={fieldKey!} label={label ?? ''} />}
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
 * of three cards takes the account's own fields (**+ Add field**: Text · Number · Date · List · Yes / No).
 *
 * 2026-10-05 (v3, owner: "it has to be easy to use", then "no side bar"): the preview is click-to-select — click a field
 * and its settings open in a CARD BESIDE IT in plain words (name · Show · Required · Put under More · What can be typed ·
 * Remove); the form-level choices sit on the cards they change (each address, the goods, Grow's services) and the bar's
 * All fields lists every field in one searchable dialog. The labels only carry state tags. */
/** the form's own checks require these — locked like the system's mandatory fields */
/** grouped keys drive several controls — hide / require together, no single label to rename */
const GROUP_KEYS = new Set(['addrLines23', 'addrCoordinates', 'addrFloorLift', 'addrWindow'])
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
  /* owner, 2026-10-06: the Package & SKU card's two sections — hide one instead of choosing "How goods are entered" */
  { key: PKG_SECTION, defaultLabel: 'Packages', section: 'Package fields', form: 'full', apiPath: 'packageDetails[]' },
  { key: SKU_SECTION, defaultLabel: 'SKUs', section: 'SKU fields', form: 'full', apiPath: 'skuDetails[]' },
  /* owner, 2026-10-06: Package Id optional (Grow: under More by default); a SKU's Origin Country configurable like HSN */
  { key: 'pkgId', defaultLabel: 'Package Id', section: 'Package fields', form: 'full', apiPath: 'packageDetails[].id' },
  { key: 'skuOrigin', defaultLabel: 'Origin Country', section: 'SKU fields', form: 'full', apiPath: 'skuDetails[].originCountry' },
  /* owner, 2026-10-07 ("apart from Consignment Number and Order Number everything should be configured by the form
     builder"): the controls that had no builder key get one — a package's type and quantity, the address's core fields
     (renamed only: routing and the rate need them), its postal code, Grow's payment remarks and the Vehicle Details card */
  { key: 'pkgType', defaultLabel: 'Package Type', section: 'Package fields', form: 'full', apiPath: 'packageDetails[].packageType' },
  { key: 'pkgQty', defaultLabel: 'Quantity', section: 'Package fields', form: 'full', apiPath: 'packageDetails[].quantity' },
  { key: 'addrName', defaultLabel: 'Name', section: 'Address details', form: 'simplified', apiPath: 'shipFrom/shipTo.contact.name' },
  { key: 'addrLine1', defaultLabel: 'Address Line 1', section: 'Address details', form: 'simplified', apiPath: 'address.line1' },
  { key: 'addrCountry', defaultLabel: 'Country', section: 'Address details', form: 'simplified', apiPath: 'address.country' },
  { key: 'addrState', defaultLabel: 'State', section: 'Address details', form: 'simplified', apiPath: 'address.state' },
  { key: 'addrCity', defaultLabel: 'City', section: 'Address details', form: 'simplified', apiPath: 'address.city' },
  { key: 'addrPostal', defaultLabel: 'Postal Code', section: 'Address details', form: 'simplified', apiPath: 'address.pincode' },
  { key: 'remarks', defaultLabel: 'Add remarks if any', section: 'Payment', form: 'full', apiPath: 'consignmentDetails.remarks' },
  { key: 'vehicleDetails', defaultLabel: 'Vehicle Details', section: 'Handling & scheduling', form: 'full', apiPath: 'consignmentDetails.vehicles[]' },
]
const V2_KEYS = new Set(V2_FIELDS.map((f) => f.key))
/** the two goods sections: shown / hidden only — not renamed, not under More, not moved */
const GOODS_SECTIONS = new Set([PKG_SECTION, SKU_SECTION])
/** controls that are not a field in a grid cell — no Width */
const NO_WIDTH = new Set([PKG_SECTION, SKU_SECTION, 'vas', 'dedicateTruck', 'vehicleDetails', 'serviceType', 'scannable', 'schedulingConfirmation', 'clearanceRequired', 'splittable'])
const FIELD_DEF = new Map([...CONSIGNMENT_FIELDS, ...V2_FIELDS].map((f) => [f.key, f]))
/* 2026-10-05 (owner: "in Service Type I can't hide that field"): Service Type is no longer locked — hidden, every
   consignment gets the builder's DEFAULT service (its rule's `defaultValue`); a draft / Modify keeps its own */
/* 2026-10-07 (owner: "apart from Consignment Number and Order Number everything should be configured by the form
   builder, optional, in both Grow and the console"): the only SYSTEM lock left is the Order Number (the identifier every
   consignment is found by; Consignment Number keeps its own rules). Reference Number, Consignment Type, Ship By Date,
   Merchant, the package / SKU weight and size and the Contact Number can now be hidden or made optional on BOTH forms —
   each hidden one has a fallback: Reference = the Order Number, type = Forward, ship by = today, Merchant = the signed-in
   / first merchant, weight and size = not asked (the rate then works from what is given). Locked by THIS form: an
   address's Name · Line 1 · Country · State · City — the route and the rate are worked out from them (rename only). */
const SYSTEM_LOCKED = new Set(['orderNumber'])
const FORM_LOCKED = new Set(['addrName', 'addrLine1', 'addrCountry', 'addrState', 'addrCity'])
/** fields that start REQUIRED while shown (the form needed them before 2026-10-07) — the builder can make them optional */
const DEFAULT_REQUIRED = new Set(['referenceNumber', 'merchant', 'pkgWeight', 'skuWeight', 'skuDimensions', 'addrContact'])
/** a value that is always valid — can be hidden, never "required" */
const NOT_REQUIRABLE = new Set(['scannable', 'schedulingConfirmation', 'clearanceRequired', 'splittable', 'dedicateTruck', 'serviceType',
  'consignmentType', 'shipByDate', ...[...V2_KEYS].filter((k) => k !== 'skuOrigin' && k !== 'addrPostal' && k !== 'remarks')])
/** the typed-text fields a Format can check (2026-10-05) — the system's mandatory identifiers included; custom Text fields too */
const FORMATABLE = new Set(['orderNumber', 'referenceNumber', 'consignmentNumber', 'exchangeOrderNumber',
  'addrCompanyName', 'addrEmail', 'addrLandmark', 'addrSuburb', 'addrContact', 'specialInstructions', 'remarks',
  'skuDescription', 'skuHsn', 'skuImage', 'pkgTracking', 'pkgDescription', 'pkgPalletSpace'])
/** where an optional field starts: its section's "More information" fold (the builder can move it) */
const DEFAULT_MORE = new Set(['addrCompanyName', 'addrLines23', 'addrLandmark', 'addrSuburb', 'addrCoordinates', 'addrFloorLift',
  'pkgDescription', 'pkgPalletSpace'])
/** a SKU line's details — on the line's second row, or in its own fold (its "More": the chevron at the line's end) */
const SKU_ROW_KEYS = new Set(['skuCategory', 'skuDescription', 'skuHsn', 'skuOrigin', 'skuUnitCost', 'skuImage'])
/** owner, 2026-10-06 — Grow's own starting places: a SKU's HSN Code · Origin Country · Cost on the line (not folded), and
    Package Id under More (the console keeps it in the package row). The builder can still move them; Grow does not take
    the console's More for these. */
const GROW_SKU_FRONT = new Set(['skuHsn', 'skuOrigin', 'skuUnitCost'])
const GROW_MORE = new Set(['pkgId'])
/** where a field starts on a portal's form: its section's More fold, or up front */
const defaultMoreOf = (k: string, grow: boolean) => DEFAULT_MORE.has(k) || (grow && GROW_MORE.has(k))
  || (SKU_ROW_KEYS.has(k) && !(grow && GROW_SKU_FRONT.has(k)))
/** keys that can sit in a section's More fold (never a locked one); every custom field can */
const movable = (k: string) => isCustomKey(k) || (FIELD_DEF.has(k) && !SYSTEM_LOCKED.has(k) && !FORM_LOCKED.has(k) && !GOODS_SECTIONS.has(k)
  && k !== 'vas' && k !== 'serviceType' && k !== 'vehicleDetails' && !k.startsWith('cat:')
  && k !== 'consignmentType' && k !== 'shipByDate' && k !== 'merchant')

/** 'last' = one of the Package & SKU card's two sections, the only one still shown */
export type FieldLock = 'system' | 'form' | 'last' | null
const LOCK_TEXT: Record<Exclude<FieldLock, null>, string> = {
  system: 'Needed by the system — always shown and required',
  form: 'This form needs it — always shown',
  last: 'Packages or SKUs must show — show the other one to hide this',
}
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
  /** Format (2026-10-05): which keys take one, the rule, and its message for a value */
  formatable: (k: string) => boolean
  format: (k: string) => FieldFormat | undefined
  formatError: (k: string, v: string | undefined | null) => string | null
  /** the account's own field, if `k` is one — removable */
  custom: (k: string) => CustomFieldDef | undefined
  removeCustom: (k: string) => void
  /** Grow form: changed for Grow (differs from the console form) — and back to the console's setting */
  overridden: (k: string) => boolean
  revert: (k: string) => void
  /** the field whose settings card is open (click-to-select) */
  selected: string | null
  select: (k: string | null) => void
  /** it can wait under "More" (not locked, not row-level) */
  movable: (k: string) => boolean
  /** how much of its row it takes (S = the normal size) — and whether the builder offers the choice for it */
  width: (k: string) => FieldWidth | undefined
  widthable: (k: string) => boolean
  /** the eye on the field's frame — hides / shows it at once */
  hide: (k: string, hidden: boolean) => void
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

/* ---- the builder's preview (2026-10-05 v2): click-to-select. A field the builder knows is ONE click target; its
   settings open in a card beside it. Its label keeps only state tags, so nothing is cut short. ---- */
/** the dashed frame of a pickable field — brand when selected; a locked field only on hover */
const pickFrame = (selected: boolean, locked: boolean) => `rounded-md outline-offset-[5px] ${selected
  ? 'outline outline-2 outline-brand-500'
  : locked ? 'hover:outline-dashed hover:outline-1 hover:outline-warm-400' : 'outline-dashed outline-1 outline-warm-300 hover:outline-warm-500'}`
/** the invisible button over a field in the preview — a click (or Enter) opens its settings */
function PickHit({ k, label }: { k: string; label: string }) {
  const b = useContext(BuilderCtx)!
  return (
    <button type="button" aria-label={`Change ${label || b.label(k)}`} aria-pressed={b.selected === k}
      onClick={(e) => { e.stopPropagation(); b.select(k) }}
      className="absolute -inset-[5px] z-10 cursor-pointer rounded-md focus:outline-none focus-visible:ring-[3px] focus-visible:ring-brand-500/30" />
  )
}
const CHIP = 'inline-flex h-[18px] shrink-0 items-center rounded-full px-1.5 text-[11px] leading-none'
/** What is set on a field, in words — on its frame in the preview and on its row in All fields. */
function FieldChips({ k, className = '', hideHidden = false, overlay = false }: {
  k: string; className?: string
  /** All fields says "hidden" with its switch */
  hideHidden?: boolean
  /** in the preview: tags sitting on the field's frame (top right), so the label keeps its full width */
  overlay?: boolean
}) {
  const b = useContext(BuilderCtx)!
  const lock = b.lock(k)
  const f = b.format(k)
  if (overlay) return <FieldTools k={k} />
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 ${className}`}>
      {b.overridden(k) && <span className={`${CHIP} bg-brand-50 font-bold text-brand-600`}>Grow</span>}
      {b.isHidden(k) ? !hideHidden && <span className={`${CHIP} bg-warm-100 text-ink-3`}>Hidden</span>
        : b.inMore(k) && <span className={`${CHIP} bg-warm-100 text-ink-2`}>More</span>}
      {f && <Tip text={formatSummary(f)}><span className={`${CHIP} bg-warm-100 text-ink-2`}>Format</span></Tip>}
      {lock && <Tip text={LOCK_TEXT[lock]}>
        <span aria-label="Locked" className="inline-flex h-[18px] w-4 items-center justify-center text-warm-400"><Lock size={11} /></span>
      </Tip>}
    </span>
  )
}
/**
 * A field's quick tools on its frame (owner, 2026-10-05: "I love your popup to edit the fields, but bring the icons back
 * too"): ✱ Required · ☰ More · .* Format · eye · trash (own fields). What is SET stays lit, so the frame still says it at
 * a glance; every tool shows on hover or while the field is selected. A click acts at once — Format opens the field's
 * card, where the rule is written. A locked field shows only its lock.
 */
function FieldTools({ k }: { k: string }) {
  const b = useContext(BuilderCtx)!
  const lock = b.lock(k)
  const own = b.ownHidden(k)
  const parent = b.hiddenWith(k)
  const req = b.required(k)
  const more = b.inMore(k)
  const fmt = b.format(k)
  const open = b.selected === k
  const tool = (key: string, on: boolean, tip: string, icon: ReactNode, onClick: () => void, disabled = false) => (
    <span key={key} className={on || open ? 'inline-flex' : 'hidden group-hover/field:inline-flex'}>
      <Tip text={tip}>
        <button type="button" aria-label={tip} aria-pressed={on} disabled={disabled}
          onClick={(e) => { e.stopPropagation(); onClick() }}
          className={`inline-flex h-[22px] w-[22px] items-center justify-center rounded-full border shadow-ds-1 transition-colors disabled:cursor-not-allowed disabled:opacity-40
            ${on ? 'border-brand-200 bg-brand-50 text-brand-600' : 'border-line bg-surface text-ink-3 hover:text-ink'}`}>
          {icon}
        </button>
      </Tip>
    </span>
  )
  return (
    <span className="absolute -top-[15px] right-1 z-20 inline-flex items-center gap-1">
      {b.overridden(k) && (
        <Tip text="Changed for Grow — click to use the console setting again">
          <button type="button" onClick={(e) => { e.stopPropagation(); b.revert(k) }}
            className={`${CHIP} gap-1 border border-brand-100 bg-brand-50 font-bold text-brand-600 hover:border-brand-300`}>Grow<RotateCcw size={10} /></button>
        </Tip>
      )}
      {lock
        ? <Tip text={LOCK_TEXT[lock]}>
            <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-line bg-surface text-warm-400"><Lock size={10} /></span>
          </Tip>
        : <>
            {b.requirable(k) && tool('req', req, req ? 'Required — click to make it optional' : 'Make it required', <Asterisk size={12} />,
              () => b.set(k, { required: !req }), own || !!parent)}
            {b.movable(k) && tool('more', more, more ? 'Under “More” — click to show it up front' : 'Put it under “More”', <ListCollapse size={12} />,
              () => b.set(k, { more: !more }), own || !!parent || req)}
            {b.formatable(k) && tool('fmt', !!fmt, fmt ? `Format: ${formatSummary(fmt)} — click to change it` : 'Set what can be typed', <Regex size={12} />,
              () => b.select(k))}
            {tool('eye', own || !!parent, parent ? `Hidden because ${b.label(parent)} is hidden` : own ? 'Hidden — click to show it' : 'Hide this field',
              own || parent ? <EyeOff size={12} /> : <Eye size={12} />, () => b.hide(k, !own), !!parent)}
            {b.custom(k) && tool('del', false, 'Remove this field', <Trash2 size={11} />, () => b.removeCustom(k))}
          </>}
    </span>
  )
}
/** The edit-mode label row: the label as the form shows it, then its chips; a field the builder does not know says so. */
function BuilderLabel({ label, fieldKey, required }: { label?: string; fieldKey?: string; required?: boolean }) {
  const b = useContext(BuilderCtx)!
  const star = required && <span className="text-danger-fg">&nbsp;*</span>
  if (!fieldKey || !b.known(fieldKey)) {
    return (
      <div className="mb-1.5 flex min-h-5 items-center gap-1 field-label">
        <span className="min-w-0 truncate" title={label}>{label}{star}</span>
        <span className="ml-auto inline-flex shrink-0"><Tip text="Part of the form — always shown"><Lock size={11} className="text-warm-300" /></Tip></span>
      </div>
    )
  }
  return (
    <div className="mb-1.5 flex min-h-5 items-center field-label">
      <span className="min-w-0 truncate" title={label}>{label || b.label(fieldKey)}</span>{star}
      <FieldChips k={fieldKey} overlay />
    </div>
  )
}
/** Edit-mode frame for a non-field control (a switch, a chip, the VAS block): its chips above it, one click target. */
function Configurable({ fieldKey, children }: { fieldKey: string; children: ReactNode }) {
  const b = useContext(BuilderCtx)
  if (!b?.editing) return <>{children}</>
  return (
    <div data-field={fieldKey} className={`group/field relative ${pickFrame(b.selected === fieldKey, false)}`}>
      <FieldChips k={fieldKey} overlay />
      <div className={b.isHidden(fieldKey) ? 'pointer-events-none opacity-40' : ''}>{children}</div>
      <PickHit k={fieldKey} label={b.label(fieldKey)} />
    </div>
  )
}

/**
 * "More information" — optional fields a section rarely needs stay HIDDEN IN PLACE; the toggle reveals
 * them where they belong in the section's order (owner, 2026-09-29: "Address Line 2 goes under Line 1,
 * not at the bottom"). Nothing moves; the builder only decides which fields wait behind the toggle.
 */
type RevealEntry = [string | null, ReactNode, boolean?] | false | null | undefined
function revealEntries(entries: RevealEntry[], inMore: (k: string) => boolean, open: boolean, wrap?: (node: ReactNode, id: string, key: string | null) => ReactNode) {
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
    nodes.push(wrap ? wrap(node, entryId(e), k) : node)
  }
  return { nodes, waiting, waitingFilled }
}

/* ================================================================ field order (2026-10-05, owner: "drag and drop and
 * resequence columns in the same sections … the More section functionality can also change due to this") — every zone
 * of fields (a section's grid, an address's contact / address details, a package's row, the handling chips …) follows
 * the saved order (`formSetup.loadOrder`, per portal). While the form is edited each field is a drag cell: grab it and
 * drop it before / after another one in the SAME zone. More keeps its meaning: a More field waits in its NEW place and
 * is revealed there. */
type LiveEntry = Exclude<RevealEntry, false | null | undefined>
/** an entry's identity in its zone: its element key (every entry node carries one), else its More key */
const entryId = (e: LiveEntry) => (isValidElement(e[1]) && e[1].key != null ? String(e[1].key) : String(e[0] ?? ''))
interface SortApi {
  order: (zone: string) => string[] | undefined
  /** the form is being edited — the cells are draggable */
  active: boolean
  drag: { zone: string; id: string } | null
  /** the cell being dragged, read at once (state lands a render later; drag events do not wait) */
  dragging: () => { zone: string; id: string } | null
  over: { zone: string; id: string; after: boolean } | null
  start: (zone: string, id: string) => void
  hover: (zone: string, id: string, after: boolean) => void
  end: () => void
  /** `ids` = the zone's cells as they stand; `moved` goes before / after `target` */
  move: (zone: string, ids: string[], moved: string, target: string, after: boolean) => void
}
const SortCtx = createContext<SortApi | null>(null)
/** the one field being dragged on the page — read at once by the drag events (React state lands a render later) */
let liveDragValue: { zone: string; id: string } | null = null
const liveDrag = { get: () => liveDragValue, set: (v: { zone: string; id: string } | null) => { liveDragValue = v } }
/** a zone's entries in the saved order, through the More fold; drag cells while the form is edited */
function arrange(sort: SortApi | null, zone: string, entries: RevealEntry[], inMore: (k: string) => boolean, open: boolean, gap?: 'chips' | 'rows',
  /** a field's own sizing in a flex row (the package row) — given to its drag cell too, so it keeps its width while edited */
  cellClass?: (id: string) => string) {
  const live = entries.filter((e): e is LiveEntry => !!e)
  return revealEntries(applyOrder(live, entryId, sort?.order(zone)), inMore, open,
    sort?.active ? (node, id, key) => <SortCell key={id} zone={zone} id={id} gap={gap} fieldKey={key ?? undefined} className={cellClass?.(id)}>{node}</SortCell> : undefined)
}
/** the cells of a zone, in the order they stand on screen (siblings of `cell`) */
const zoneIds = (cell: HTMLElement, zone: string) => [...(cell.parentElement?.children ?? [])]
  .filter((c): c is HTMLElement => c instanceof HTMLElement && c.dataset.sortZone === zone).map((c) => c.dataset.sortId!)
/** One field as a drag cell (edit mode only): a grip on hover, a brand bar where it would land, faded while dragged. */
function SortCell({ zone, id, gap, className = '', fieldKey, children }: { zone: string; id: string; gap?: 'chips' | 'rows'; className?: string; fieldKey?: string; children: ReactNode }) {
  const s = useContext(SortCtx)!
  const b = useContext(BuilderCtx)
  const cols = useContext(GridColsCtx)
  /* the builder's Width: this cell IS the grid item while the form is edited */
  const span = fieldKey && b ? widthSpan(b.width(fieldKey), cols) : ''
  const dragging = s.drag?.zone === zone && s.drag.id === id
  const over = s.over && s.over.zone === zone && s.over.id === id ? s.over : null
  /* a vertical list (the Summary's lines) is split top / bottom; a grid or a chip row left / right */
  const rows = gap === 'rows'
  const side = (e: { clientX: number; clientY: number; currentTarget: HTMLElement }) => {
    const r = e.currentTarget.getBoundingClientRect()
    return rows ? e.clientY > r.top + r.height / 2 : e.clientX > r.left + r.width / 2
  }
  /* the bar sits in the middle of the gap: 24px between grid fields, 8px between chips, on the line between rows */
  const bar = rows ? (over?.after ? '-bottom-[2px]' : '-top-[2px]')
    : gap === 'chips' ? (over?.after ? '-right-[6px]' : '-left-[6px]') : (over?.after ? '-right-[14px]' : '-left-[14px]')
  return (
    <div data-sort-zone={zone} data-sort-id={id} draggable
      onDragStart={(e) => { e.stopPropagation(); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', id); s.start(zone, id) }}
      onDragEnd={(e) => { e.stopPropagation(); s.end() }}
      onDragOver={(e) => {
        const d = s.dragging()
        if (!d || d.zone !== zone) return
        e.preventDefault(); e.stopPropagation()
        if (d.id !== id) s.hover(zone, id, side(e))
      }}
      onDrop={(e) => {
        const d = s.dragging()
        if (!d || d.zone !== zone) return
        e.preventDefault(); e.stopPropagation()
        s.move(zone, zoneIds(e.currentTarget, zone), d.id, id, side(e))
        s.end()
      }}
      className={`group/sort relative min-w-0 cursor-grab active:cursor-grabbing ${dragging ? 'opacity-40' : ''} ${span} ${className}`}>
      {over && !dragging && (rows
        ? <span aria-hidden className={`pointer-events-none absolute left-0 right-0 z-30 h-[3px] rounded-full bg-brand-500 ${bar}`} />
        : <span aria-hidden className={`pointer-events-none absolute -bottom-1 -top-1 z-30 w-[3px] rounded-full bg-brand-500 ${bar}`} />)}
      {gap !== 'chips' && (
        <span aria-hidden className={`pointer-events-none absolute z-20 hidden text-warm-400 group-hover/sort:block ${rows ? '-left-[17px] top-3.5' : '-left-[19px] top-0.5'}`}><GripVertical size={14} /></span>
      )}
      {children}
    </div>
  )
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
      className={`inline-flex h-7 w-7 items-center justify-center rounded-md border border-warm-200 text-ink-3 hover:bg-warm-50 hover:text-ink ${className}`}>
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
/** the field-order zone that holds the CARDS' order (owner, 2026-10-05: "move sections up and down") */
const SECTION_ZONE = '__sections'
const SECTION_TITLES: Record<string, string> = {
  'sec-consignment': 'Consignment details', 'sec-parties': 'Ship From → Ship To', 'sec-packages': 'Package & SKU',
  'sec-vehicle': 'Vehicle Details', 'sec-handling': 'Handling', 'sec-extras': 'Service & instructions', 'sec-service': 'Service',
  'sec-carrier': 'Carriers', 'sec-summary': 'Summary', 'sec-payment': 'Payment',
}
/** While the form is edited: a small pill on a card's top edge — move the whole card one place up or down. */
function SectionMover({ title, first, last, onMove }: { title: string; first: boolean; last: boolean; onMove: (dir: -1 | 1) => void }) {
  const btn = (dir: -1 | 1, disabled: boolean) => (
    <Tip text={disabled ? (dir < 0 ? 'Already the first card' : 'Already the last card') : `Move ${title} ${dir < 0 ? 'up' : 'down'}`}>
      <button type="button" disabled={disabled} aria-label={`Move ${title} ${dir < 0 ? 'up' : 'down'}`} onClick={() => onMove(dir)}
        className="inline-flex h-6 w-6 items-center justify-center rounded-full text-ink-2 hover:bg-warm-100 hover:text-ink disabled:cursor-not-allowed disabled:opacity-30">
        {dir < 0 ? <ArrowUp size={13} /> : <ArrowDown size={13} />}
      </button>
    </Tip>
  )
  return (
    <div className="absolute -top-3.5 right-6 z-20 inline-flex items-center gap-0.5 rounded-full border border-line bg-surface py-0.5 pl-2.5 pr-0.5 shadow-ds-1">
      <span className="mr-1 text-[11px] text-ink-3">Move card</span>
      {btn(-1, first)}{btn(1, last)}
    </div>
  )
}
/** This form's card — the shared StagingCard's look, the caption moved into an ⓘ (the header is one line). */
function FormCard({ id, title, caption, count, action, children }: {
  id?: string; title?: ReactNode; caption?: string; count?: number; action?: ReactNode; children?: ReactNode
}) {
  return (
    <section id={id} className="scroll-mt-20 rounded-xl bg-surface p-6">
      {(title || action) && (
        <div className="mb-6 flex min-h-6 items-center justify-between gap-4">
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
/** how many columns the field grid around a field has on a wide screen — read by a field to size itself (builder Width) */
const GridColsCtx = createContext(4)
const LG_SPAN: Record<number, string> = { 2: 'lg:col-span-2', 3: 'lg:col-span-3', 4: 'lg:col-span-4', 6: 'lg:col-span-6' }
/** the grid classes of a field's Width (owner, 2026-10-07): S = natural · M = half the row · L = three quarters · Full = all.
    A 2-column grid (an address half) has only natural and full: M = S, L = Full. */
function widthSpan(w: FieldWidth | undefined, cols: number): string {
  if (!w || w === 's') return ''
  if (w === 'full') return 'col-span-full'
  if (cols <= 2) return w === 'l' ? 'col-span-full' : ''
  const n = w === 'm' ? Math.ceil(cols / 2) : cols - 1
  if (n >= cols) return 'col-span-full'
  return `sm:col-span-2 ${LG_SPAN[n] ?? 'col-span-full'}`
}
/** The console field grid — `cols` equal columns (4 default), SGrid's API with this form's gaps. */
function SGrid({ children, cols = 4, className = '' }: { children: ReactNode; cols?: 3 | 4 | 5 | 7; className?: string }) {
  const c = { 3: 'lg:grid-cols-3', 4: 'lg:grid-cols-4', 5: 'lg:grid-cols-5', 7: 'lg:grid-cols-7' }[cols]
  return <GridColsCtx.Provider value={cols}><div className={`grid grid-cols-1 ${FIELD_GAPS} sm:grid-cols-2 ${c} ${className}`}>{children}</div></GridColsCtx.Provider>
}
/** Two equal columns (a party's fields). */
function Grid2({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <GridColsCtx.Provider value={2}><div className={`grid grid-cols-1 ${FIELD_GAPS} sm:grid-cols-2 ${className}`}>{children}</div></GridColsCtx.Provider>
}
/** An address on the form has HALF the card (Ship From | Ship To): two columns while the half is wide enough for a
    phone code + number, one below that (a container query — the half narrows beside the Summary or a pinned rail). */
function HalfGrid({ children }: { children: ReactNode }) {
  return <GridColsCtx.Provider value={2}><div className="@container"><div className={`grid grid-cols-1 ${FIELD_GAPS} @min-[380px]:grid-cols-2`}>{children}</div></div></GridColsCtx.Provider>
}
/** "One under the other" (owner, 2026-10-06): an address on the form has the card's full width — 2 columns from 380px, 4 from 880px */
function QuadGrid({ children }: { children: ReactNode }) {
  return <div className="@container"><div className={`grid grid-cols-1 ${FIELD_GAPS} @min-[380px]:grid-cols-2 @min-[880px]:grid-cols-4`}>{children}</div></div>
}
/** A small bold heading inside a card, with an optional control on its right. */
function SubTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-4 flex min-h-8 items-center justify-between gap-3">
      <span className="shrink-0 whitespace-nowrap text-[14px] font-bold text-ink">{children}</span>
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
function PartyBlock({ party, set, nameLabel, requireContact, hid, variant = 'full', grouped = false, wide = false, half = false }: {
  party: Party; set: (patch: Partial<Party>) => void; nameLabel: string
  requireContact?: boolean; hid: (k: string) => boolean; variant?: 'full' | 'rto'
  /** the popup: the same order under two quiet headings, Contact then Address */
  grouped?: boolean
  /** on the form itself (the builder's "Fields on the form"): the headings as CONTACT DETAILS / ADDRESS DETAILS, in
      its half of the card (Ship From | Ship To side by side, owner 2026-10-06), "More address details" below */
  wide?: boolean
  /** with wide: Ship From | Ship To side by side — two columns at most (else the card's full width, four columns) */
  half?: boolean
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
  const sel = (k: 'country' | 'postalCode' | 'state', label: string, list: string[], required: boolean, fieldKey?: string) => (
    <F label={label} required={required} value={party[k] ?? ''} options={opts(list)} fieldKey={fieldKey}
      error={miss(party[k], required) ? 'Required field.' : undefined} onChange={(v) => set({ [k]: v })} />
  )
  const L = (k: string, d: string) => b?.label(k) ?? d
  /** a renamed field's name, else the form's own wording (the Name says Sender / Customer by role) */
  const Lr = (k: string, d: string) => { const l = b?.label(k); return l && l !== FIELD_DEF.get(k)?.defaultLabel ? l : d }
  /* Contact Number's Format (builder) — said once the box is left, or after an Add Order attempt */
  const phoneFmt = b?.formatError('addrContact', party.contactNumber) ?? null
  const [phoneLeft, setPhoneLeft] = useState(false)
  const [open, setOpen] = useState(false)
  const reveal = open || !!b?.editing
  const inMore = (k: string) => !!b?.inMore(k)
  /* the order a person writes an address in — Country → Postal Code → Suburb → City → State (owner) */
  const contactEntries: RevealEntry[] = [
    [null, text('name', Lr('addrName', nameLabel), { required: true, placeholder: 'eg, John Doe', fieldKey: 'addrName' })],
    !hid('addrCompanyName') && ['addrCompanyName', text('businessName', L('addrCompanyName', 'Company Name'), { placeholder: 'eg, Random Company', fieldKey: 'addrCompanyName' }), filled(party.businessName)],
    !hid('addrContact') && ['addrContact', <SFld key="phone" label={L('addrContact', 'Contact Number')} fieldKey="addrContact" required={requireContact}
      error={miss(party.contactNumber, !!requireContact) || phoneFmt || false} errorNow={!!phoneFmt && phoneLeft}>
      <div onBlur={() => setPhoneLeft(true)}>
        <PhoneInput code={party.countryCode ?? ''} number={party.contactNumber} codes={DIAL_CODES}
          invalid={(showErrors && miss(party.contactNumber, !!requireContact)) || (!!phoneFmt && (showErrors || phoneLeft))}
          onCode={(v) => set({ countryCode: v })} onNumber={(v) => set({ contactNumber: v })} />
      </div>
    </SFld>, filled(party.contactNumber)],
    !hid('addrEmail') && ['addrEmail', text('email', L('addrEmail', 'Email'), { type: 'email', placeholder: 'eg, johndoe@xyz.com', fieldKey: 'addrEmail' }), filled(party.email)],
  ]
  const addressEntries: RevealEntry[] = [
    [null, text('line1', L('addrLine1', 'Address Line 1'), { required: true, placeholder: 'eg, Building No., Street', fieldKey: 'addrLine1' })],
    !hid('addrLines23') && ['addrLines23', text('line2', 'Address Line 2', { placeholder: 'eg, Street 1 A', fieldKey: 'addrLines23' }), filled(party.line2)],
    !hid('addrLines23') && ['addrLines23', <F key="line3" label="Address Line 3" value={party.line3 ?? ''} placeholder="eg, Behind High School" onChange={(v) => set({ line3: v })} />, filled(party.line3)],
    !hid('addrLandmark') && ['addrLandmark', text('landmark', L('addrLandmark', 'Landmark'), { placeholder: 'eg, Behind High School', fieldKey: 'addrLandmark' }), filled(party.landmark)],
    [null, <div key="country" className="contents">{sel('country', L('addrCountry', 'Country'), COUNTRIES, true, 'addrCountry')}</div>],
    !hid('addrPostal') && ['addrPostal', <div key="postal" className="contents">{sel('postalCode', L('addrPostal', 'Postal Code'), POSTCODES, rto, 'addrPostal')}</div>, filled(party.postalCode)],
    !hid('addrSuburb') && ['addrSuburb', text('county', L('addrSuburb', 'Suburb / County'), { fieldKey: 'addrSuburb' }), filled(party.county)],
    [null, text('city', L('addrCity', 'City'), { required: true, fieldKey: 'addrCity' })],
    [null, <div key="state" className="contents">{sel('state', L('addrState', 'State'), STATES, true, 'addrState')}</div>],
    !rto && !hid('addrCoordinates') && ['addrCoordinates', text('latitude', 'Latitude', { type: 'number', fieldKey: 'addrCoordinates' }), filled(party.latitude)],
    !rto && !hid('addrCoordinates') && ['addrCoordinates', text('longitude', 'Longitude', { type: 'number' }), filled(party.longitude)],
    !rto && !hid('addrFloorLift') && ['addrFloorLift', text('floorNumber', 'Floor Number', { type: 'number', fieldKey: 'addrFloorLift' }), filled(party.floorNumber)],
    !rto && !hid('addrLift') && ['addrLift', <div key="lift" className="flex items-start pt-7"><Configurable fieldKey="addrLift">
      <SwitchField label={L('addrLift', 'Lift Available')} checked={!!party.liftAvailable} onChange={(v) => set({ liftAvailable: v })} />
    </Configurable></div>, !!party.liftAvailable],
  ]
  /* the order of an address's fields — one order for every address (Ship From, Ship To, RTO), contact and address apart */
  const sort = useContext(SortCtx)
  const who = arrange(sort, 'contact', contactEntries, inMore, reveal)
  const where = arrange(sort, 'address', addressEntries, inMore, reveal)
  const waiting = who.waiting + where.waiting
  const waitingFilled = who.waitingFilled + where.waitingFilled
  const toggle = <RevealToggle open={open} onToggle={() => setOpen((v) => !v)} waiting={waiting} waitingFilled={waitingFilled} label="address details" className="mt-5" />
  if (wide) {
    const head = (t: string) => (
      <div className="mb-4 flex items-center gap-3">
        <span className="text-[12px] font-bold uppercase tracking-wide text-ink-3">{t}</span><span className="h-px flex-1 bg-warm-200" />
      </div>
    )
    const G = half ? HalfGrid : QuadGrid
    return (
      <div>
        {head('Contact details')}
        <G>{who.nodes}</G>
        <div className="mt-8">{head('Address details')}</div>
        <G>{where.nodes}</G>
        {toggle}
      </div>
    )
  }
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
function AddressCard({ party, missing, invalid = [], onEdit, tag, editTip = 'Edit this address', hubOnly = false }: {
  party: Party; missing: string[]; tag?: string
  /** the pencil — while the form is edited: opens the pop-up to set up the address fields */
  onEdit?: () => void
  /** the pencil's tooltip */
  editTip?: string
  /** typed in the wrong format (the builder's Format rules) */
  invalid?: string[]
  /** an end that can only be a hub (its picker is Facility) — the empty card asks for a hub */
  hubOnly?: boolean
}) {
  const showErrors = useContext(ShowErrorsCtx)
  const empty = !filled(party.name) && !filled(party.line1)
  const place = [party.city, party.state, party.postalCode, party.country].filter((x) => filled(x)).join(', ')
  const contact = [party.contactNumber ? `${party.countryCode ?? ''} ${party.contactNumber}`.trim() : '', party.email].filter(Boolean).join(' · ')
  const bad = (showErrors && missing.length > 0) || invalid.length > 0
  return (
    <div className={`rounded-lg border bg-surface p-4 ${bad ? 'border-danger-fg' : 'border-warm-200'}`}>
      {empty
        ? <p className="text-[13px] text-ink-3">{hubOnly ? 'No hub yet — pick one.' : 'No address yet — pick a saved one or add a new address.'}</p>
        : (
          <div className="flex items-start gap-3">
            <MapPinned size={16} className="mt-0.5 shrink-0 text-ink-3" />
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-2 text-[14px] font-bold text-ink">
                {party.name || <span className="font-normal text-ink-3">No name</span>}
                {party.businessName && party.businessName !== party.name && <span className="text-[13px] font-normal text-ink-2">· {party.businessName}</span>}
                {tag && <span className="rounded-full bg-warm-50 px-2 py-0.5 text-[11px] font-normal text-ink-2">{tag}</span>}
              </p>
              {contact && <p className="mt-1 text-[13px] text-ink-2">{contact}</p>}
              <p className="mt-1 text-[13px] text-ink">{[party.line1, party.line2, party.line3, party.landmark].filter((x) => filled(x)).join(', ')}</p>
              {place && <p className="text-[13px] text-ink-2">{place}</p>}
            </div>
            {onEdit && <Tip text={editTip}><button type="button" onClick={onEdit} aria-label={editTip}
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-warm-200 text-ink-2 hover:bg-warm-50 hover:text-ink">
              <Pencil size={14} />
            </button></Tip>}
          </div>
        )}
      {missing.length > 0 && (showErrors
        ? <p className="mt-3 text-[12px] text-danger-fg">Missing: {missing.join(', ')}</p>
        : !empty && <p className="mt-3"><span className="rounded-full bg-warm-50 px-2 py-0.5 text-[11px] text-ink-2">Incomplete — {missing.length} to add</span></p>)}
      {invalid.length > 0 && <p className="mt-2 text-[12px] text-danger-fg">Check the format: {invalid.join(', ')}</p>}
    </div>
  )
}

/** One saved address the search can offer (a merchant address, an address-book entry, a hub). */
interface AddrHit { value: string; party: Party; tag: string }
const addrHay = (p: Party) => [p.name, p.businessName, p.contactNumber, p.email, p.line1, p.line2, p.landmark, p.city, p.state, p.postalCode]
  .filter(Boolean).join(' ').toLowerCase()
/**
 * The search above an address typed on the form (the builder's "Fields on the form", owner 2026-10-05): "Search
 * from address book by name, number, address and company name". Picking one fills the fields below.
 */
function AddressSearch({ hits, onPick, placeholder }: { hits: AddrHit[]; onPick: (h: AddrHit) => void; placeholder: string }) {
  const [q, setQ] = useState('')
  const needle = q.trim().toLowerCase()
  const matches = useMemo(() => (needle ? hits.filter((h) => addrHay(h.party).includes(needle)) : hits), [hits, needle])
  const shown = matches.slice(0, 8)
  const { open, setOpen, hi, setHi, ref, popRef, pos, onKeyDown, pick } = useAutocomplete<AddrHit>(shown, (h) => { onPick(h); setQ('') })
  return (
    <div ref={ref} onFocus={() => { if (!open) setOpen(true) }} onMouseDown={() => { if (!open) setOpen(true) }} onKeyDown={onKeyDown}>
      <SearchInput value={q} onChange={(v) => { setQ(v); setHi(0); setOpen(true) }} placeholder={placeholder} />
      {open && (
        <AcPop pos={pos} popRef={popRef}>
          {shown.length === 0
            ? <p className="px-3 py-2 text-[13px] text-ink-3">{needle ? `No saved address matches “${q.trim()}” — type it below.` : 'No saved addresses yet — type the address below.'}</p>
            : shown.map((h, i) => {
              const p = h.party
              return (
                <AcRow key={h.value} on={i === hi} onHover={() => setHi(i)} onPick={() => pick(h)}>
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-warm-100 text-ink-3"><MapPinned size={15} /></span>
                  <span className="min-w-0 flex-1 py-1.5">
                    <span className="block truncate text-[13px] font-bold text-ink">
                      {p.name || p.businessName || 'Unnamed'}{p.businessName && p.name && p.businessName !== p.name ? <span className="font-normal text-ink-2"> · {p.businessName}</span> : null}
                    </span>
                    <span className="block truncate text-[12px] text-ink-3">
                      {[p.contactNumber, [p.line1, p.city, p.state].filter(Boolean).join(', ')].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                  <span className="shrink-0 rounded-full bg-warm-50 px-2 py-0.5 text-[11px] text-ink-2">{h.tag}</span>
                </AcRow>
              )
            })}
          {matches.length > shown.length && <p className="px-3 pt-1 text-[12px] text-ink-3">{matches.length - shown.length} more — keep typing</p>}
        </AcPop>
      )}
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

/** L × W × H in one cell — three number boxes, one unit. The values are in cm; `units` shows and takes them in its unit. */
function DimsBox({ l, w, h, onChange, error, units = METRIC }: {
  l: number; w: number; h: number; onChange: (patch: { l?: number; w?: number; h?: number }) => void; error?: boolean; units?: Units
}) {
  const box = (k: 'l' | 'w' | 'h', v: number) => (
    <NumBox blankZero placeholder={k.toUpperCase()} value={units.toD(v)} precision={units.precision} error={error && !(v > 0) ? 'x' : undefined}
      onChange={(n) => onChange({ [k]: units.fromD(n) })} />
  )
  return (
    <div className="grid grid-cols-3 gap-1.5" title={`Length × Width × Height (${units.d})`}>
      {box('l', l)}{box('w', w)}{box('h', h)}
    </div>
  )
}

/* -------------------------------------------------------------------- page ---- */

/** An Items-mode line (the Packages section hidden — SKU-based): one SKU and how many units (each unit ships as its own
    piece; the packages are worked out). */
interface ItemLine { id: string; item: ParcelItem }
const FORM_TIER_V2_KEY = FORM_TIER_KEY
/** The Summary card's blocks (2026-10-05; 2026-10-06, owner: "make the Grow summary look like this [the second branch's
    Shipment Summary], and the console the same view with the details that matter to it"). Blocks stack — a grey label,
    Edit (jumps to its card), the value, a grey line; `foot` rows sit under them (the totals). Each one can be switched
    off per portal in the builder; the blocks drag to reorder, the foot stays at the foot. */
interface SummaryLine { key: string; label: string; foot?: boolean }
const SUMMARY_LINES: Record<'console' | 'grow', SummaryLine[]> = {
  console: [
    { key: 'consignment', label: 'Consignment' }, { key: 'shipFrom', label: 'Ship From' }, { key: 'shipTo', label: 'Ship To' },
    { key: 'legs', label: 'Shipment legs' }, { key: 'goods', label: 'Packages' }, { key: 'service', label: 'Service' },
    { key: 'carrier', label: 'Carrier' },
    { key: 'totals', label: 'Pieces & weight', foot: true }, { key: 'eta', label: 'ETA', foot: true },
  ],
  grow: [
    { key: 'shipFrom', label: 'Ship From' }, { key: 'shipTo', label: 'Ship To' }, { key: 'goods', label: 'Packages' },
    { key: 'service', label: 'Service' }, { key: 'payment', label: 'Payment' },
    { key: 'totals', label: 'Price', foot: true }, { key: 'eta', label: 'ETA', foot: true },
  ],
}
const summaryLinesOf = (p: 'console' | 'grow') => SUMMARY_LINES[p]
/** the builder's All fields groups, in card order (their fields are listed in the form) */
const FIELD_GROUP_IDS = ['sec-consignment', 'addresses', 'sec-packages', 'sec-handling', 'sec-service', 'sec-payment']
/** the Ship From → Ship To card's choices while the form is edited — one segmented control each (owner, 2026-10-06 / 10-07) */
const ARRANGE_OPTIONS: { value: AddressArrangement; label: string; sub: string }[] = [
  { value: 'side', label: 'Side by side', sub: 'Ship From left, Ship To right' },
  { value: 'stack', label: 'One under the other', sub: 'Ship To under Ship From, more room' },
]
const ENTRY_OPTIONS: { value: AddressEntry; label: string; sub: string }[] = [
  { value: 'cards', label: 'Saved card', sub: 'Pick a saved address, change it in a pop-up' },
  { value: 'inline', label: 'Fields on form', sub: 'Type the address here, or search saved ones' },
]
const ADDRESS_LAYOUT_ROWS: { key: 'addresses' | 'shipFrom' | 'shipTo' | 'rto'; label: string; options: { value: string; label: string; sub: string }[] }[] = [
  { key: 'addresses', label: 'Layout', options: ARRANGE_OPTIONS },
  { key: 'shipFrom', label: 'Ship From', options: ENTRY_OPTIONS },
  { key: 'shipTo', label: 'Ship To', options: ENTRY_OPTIONS },
  { key: 'rto', label: 'RTO address', options: ENTRY_OPTIONS },
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
const MERCHANT_OFF = new Set(['merchant', 'consignmentNumber', 'totalLoadingTime', 'vehicleType',
  'addrCoordinates', 'pkgPalletSpace'])
/** the console form never has these (Grow's own Payment card asks them) */
const CONSOLE_OFF = new Set(['remarks'])
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
  return edit === 'grow'
    ? <AddConsignmentV2 key="grow-setup" portal="merchant" setup />
    : <AddConsignmentV2 key={portal} portal={portal} setup={edit === 'console'} />
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
  const { pathname, search } = useLocation()
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
    /* what step 2's Back left in the session — only for THIS order (the same draft id; the same overage scan) */
    const session = merchantMode ? readSessionDraft() : null
    const ovParam = params.get('fromOverage')
    const ovSide = readOverageSidecar()
    const sessionHere = session
      && (!ovParam || (!!ovSide && `${ovSide.prId}:${ovSide.overageId}` === ovParam))
      && (!draftId || session.orderId === draftId) ? session : null
    const o = draftId ? orderById(draftId) : null
    if (o) return sessionHere ?? o.draft ?? (!merchantMode && !o.isDraft ? draftFromOrder(o) : null)
    return sessionHere
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
    /* Grow starts some fields in its own place (GROW_SKU_FRONT, GROW_MORE) — the console's More does not move them */
    for (const k of [...GROW_SKU_FRONT, ...GROW_MORE]) {
      if (out[k]?.more === undefined) continue
      const rest: FieldRuleV2 = { ...out[k] }
      delete rest.more
      if (Object.keys(rest).length) out[k] = rest; else delete out[k]
    }
    return out
  }, [savedRules, behavior])
  const growChanges = growSetup && editing ? draftRules : savedGrow
  const merchantRules = useMemo<FormRulesV2>(() => growRules(growBase, growChanges), [growBase, growChanges])
  const rules = merchantMode ? merchantRules : editing ? draftRules : savedRules
  /* the Package & SKU card's two sections (owner, 2026-10-06): both shown = each package with its SKUs; SKUs hidden =
     packages only; Packages hidden = SKU-based. Never both — if Grow's own hide meets the console's other one, Grow's wins
     (else the SKUs show); the one still shown is locked ('last'). */
  const rawOff = (k: string) => !!rules[k]?.hidden
  const pkgOff = rawOff(PKG_SECTION) && !(rawOff(SKU_SECTION) && merchantMode && !!growChanges[SKU_SECTION]?.hidden)
  const skuOff = rawOff(SKU_SECTION) && !pkgOff
  const lockOf = (k: string): FieldLock => (SYSTEM_LOCKED.has(k) ? 'system' : FORM_LOCKED.has(k) ? 'form'
    : (k === PKG_SECTION && skuOff) || (k === SKU_SECTION && pkgOff) ? 'last' : null)
  const baseHidden = (k: string) => !!fieldCfg[k]?.hidden || behavior.hidden.includes(k)
  const ownHidden = (k: string) => (merchantMode ? MERCHANT_OFF : CONSOLE_OFF).has(k) || (!lockOf(k) && (rules[k]?.hidden ?? baseHidden(k)))
  const hiddenWith = (k: string): string | null => {
    const parent = FIELD_DEF.get(k)?.dependsOn
    return parent && (ownHidden(parent) || hiddenWith(parent)) ? parent : null
  }
  const isHidden = (k: string) => ownHidden(k) || !!hiddenWith(k)
  const known = (k: string) => FIELD_DEF.has(k) || !!customOf(k)
  /* a Yes / No field always holds a value — never "required", like the switches */
  const requirable = (k: string) => known(k) && !lockOf(k) && !NOT_REQUIRABLE.has(k) && customOf(k)?.kind !== 'yesno'
  const need = (k: string) => !simple && requirable(k) && !isHidden(k) && (rules[k]?.required ?? DEFAULT_REQUIRED.has(k))
  const inMore = (k: string) => movable(k) && !need(k) && (rules[k]?.more ?? defaultMoreOf(k, merchantMode))
  /* a field that sits in a grid cell or a package line can be made wider; chips, switches and whole sections have no width */
  const widthable = (k: string) => known(k) && !lockOf(k) && !k.startsWith('cat:') && !NO_WIDTH.has(k) && customOf(k)?.kind !== 'yesno'
  /* Format (2026-10-05): the typed-text fields; 'any' = no check (how the Grow form drops a console Format) */
  const formatable = (k: string) => FORMATABLE.has(k) || customOf(k)?.kind === 'text'
  const fmtOf = (k: string) => { const f = formatable(k) ? rules[k]?.format : undefined; return f && f.preset !== 'any' ? f : undefined }
  /* a hidden field is never checked; the Simplified form is not customisable */
  const fmtErr = (k: string, v: string | undefined | null) => (simple || isHidden(k) ? null : formatError(fmtOf(k), v))
  const fmtOk = (k: string, v: string | undefined | null) => !fmtErr(k, v)
  /* editing = the live preview: every field renders (hidden ones faded) so it can be brought back */
  /* the builder's eye (icon only): hidden fields shown faded (default) or left out while editing */
  /* owner, 2026-10-05: off by default — the preview reads as the real form; turn it on (or use All fields) to bring one back */
  const [showHidden, setShowHidden] = useState(false)
  /* a field the Grow portal never has (MERCHANT_OFF) stays out of its preview too — nothing to switch on */
  const hid = (key: string) => (merchantMode ? MERCHANT_OFF : CONSOLE_OFF).has(key) || (editing ? !showHidden && isHidden(key) : isHidden(key))
  const lbl = (key: string) => rules[key]?.label?.trim() || customOf(key)?.label
    || (V2_KEYS.has(key) ? FIELD_DEF.get(key)!.defaultLabel : fieldLabel(key, fieldCfg))
  /** a rule with its defaults filled in — the Grow form keeps only what really differs from the console form */
  const norm = (k: string, r?: FieldRuleV2) => ({
    hidden: r?.hidden ?? baseHidden(k), required: r?.required ?? DEFAULT_REQUIRED.has(k), label: r?.label?.trim() ?? '',
    more: r?.more ?? defaultMoreOf(k, merchantMode), width: r?.width ?? '', format: JSON.stringify(r?.format && r.format.preset !== 'any' ? r.format : null),
    value: r?.defaultValue?.trim() ?? '',
  })
  const setRule = (k: string, patch: FieldRuleV2) => setDraftRules((r) => {
    const cur: FieldRuleV2 = growSetup ? { ...growBase[k], ...r[k], ...patch } : { ...r[k], ...patch }
    if (patch.hidden) cur.required = false
    if (patch.required) cur.hidden = false
    /* a field that starts required (DEFAULT_REQUIRED) comes back required when it is shown again */
    if (patch.hidden === false && DEFAULT_REQUIRED.has(k) && cur.required === false) delete cur.required
    if (!growSetup) return { ...r, [k]: cur }
    const base = norm(k, growBase[k])
    const next = norm(k, cur)
    const diff: FieldRuleV2 = {
      ...(next.hidden !== base.hidden ? { hidden: next.hidden } : {}),
      ...(next.required !== base.required ? { required: next.required } : {}),
      ...(next.label !== base.label && next.label ? { label: next.label } : {}),
      ...(next.more !== base.more ? { more: next.more } : {}),
      ...(next.width !== base.width ? { width: cur.width ?? ('s' as const) } : {}),
      ...(next.format !== base.format ? { format: cur.format && cur.format.preset !== 'any' ? cur.format : { preset: 'any' as const } } : {}),
      ...(next.value !== base.value && next.value ? { defaultValue: next.value } : {}),
    }
    const out = { ...r }
    if (Object.keys(diff).length) out[k] = diff
    else delete out[k]
    return out
  })
  /* the Add field dialog — opened from a card (that card) or from All fields (null: the dialog asks where) */
  const [addCard, setAddCard] = useState<CustomFieldCard | null | false>(false)
  /* the builder's selection (click-to-select in the preview) and its All fields dialog */
  const [selKey, setSelKey] = useState<string | null>(null)
  const [allOpen, setAllOpen] = useState(false)
  const [allQuery, setAllQuery] = useState('')
  const [allKey, setAllKey] = useState<string | null>(null)
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set())
  /** "All fields", opened on one group (an address card's "Address fields" link) or on every group */
  const showFieldGroup = (id: string | null) => {
    setSelKey(null); setAllQuery(''); setAllKey(null)
    setOpenGroups(new Set(id ? [id] : FIELD_GROUP_IDS))
    setAllOpen(true)
  }
  const removeCustom = (k: string) => {
    setDraftCustom((ds) => ds.filter((d) => d.key !== k))
    setDraftRules((r) => withoutKeys(r, [k]))
    setOtherHidden((xs) => xs.filter((x) => x !== k))
  }
  const builder: Builder = {
    editing, portal: formPortal, known, lock: lockOf, requirable, ownHidden, isHidden, hiddenWith, required: need, inMore, label: lbl, set: setRule,
    width: (k) => rules[k]?.width, widthable,
    formatable, format: fmtOf, formatError: fmtErr,
    custom: customOf, removeCustom,
    overridden: (k) => growSetup && editing && !!draftRules[k], revert: (k) => setDraftRules((r) => withoutKeys(r, [k])),
    selected: editing ? selKey : null, select: setSelKey,
    movable: (k) => movable(k),
    hide: (k, on) => {
      setRule(k, { hidden: on })
      /* a goods section's switch stays on its card — say what the form asks now */
      if (on && GOODS_SECTIONS.has(k)) toast.info(k === SKU_SECTION ? 'SKUs hidden — the form asks for packages only' : 'Packages hidden — the form asks for SKUs and how many')
      else if (on && !showHidden) toast.info(`${lbl(k)} is hidden — All fields or “Show hidden fields” brings it back`)
    },
  }
  /* how the form looks — addresses as cards or fields on the form; Grow's services as a grid or a list (./formSetup) */
  const [savedLayout, setSavedLayout] = useState<FormLayout>(() => loadLayout(formPortal))
  const [draftLayout, setDraftLayout] = useState<FormLayout>(() => loadLayout(formPortal))
  const layout = editing ? draftLayout : savedLayout
  /* "Fields on the form", per address (owner, 2026-10-05: "individually configured, RTO also"): that address is typed
     in the card under a search of the saved ones (the Simplified form keeps cards) */
  const ADDR_ROLE = { from: 'shipFrom', to: 'shipTo', rto: 'rto' } as const
  const inlineOf = (role: 'from' | 'to' | 'rto') => !simple && layout[ADDR_ROLE[role]] === 'inline'
  /* the fields' order inside each section, and the Summary card (2026-10-05) — edited and saved with the rest */
  const [savedOrder, setSavedOrder] = useState<FormOrder>(() => loadOrder(formPortal))
  const [draftOrder, setDraftOrder] = useState<FormOrder>(() => loadOrder(formPortal))
  const fieldOrder = editing ? draftOrder : savedOrder
  const [savedSummary, setSavedSummary] = useState<FormSummary>(() => loadSummary(formPortal))
  const [draftSummary, setDraftSummary] = useState<FormSummary>(() => loadSummary(formPortal))
  const summaryCfg = editing ? draftSummary : savedSummary
  const [drag, setDrag] = useState<SortApi['drag']>(null)
  const [over, setOver] = useState<SortApi['over']>(null)
  const sortApi: SortApi = {
    order: (zone) => fieldOrder[zone], active: editing, drag, over,
    dragging: liveDrag.get,
    start: (zone, id) => { liveDrag.set({ zone, id }); setDrag({ zone, id }) },
    hover: (zone, id, after) => setOver((o) => (o && o.zone === zone && o.id === id && o.after === after ? o : { zone, id, after })),
    end: () => { liveDrag.set(null); setDrag(null); setOver(null) },
    move: (zone, ids, moved, target, after) => setDraftOrder((o) => ({ ...o, [zone]: moveId(ids, moved, target, after) })),
  }
  const startEditing = () => {
    setDraftRules(savedRules); setDraftCustom(savedCustom); setOtherHidden([]); setDraftLayout(savedLayout)
    setDraftOrder(savedOrder); setDraftSummary(savedSummary)
    setSelKey(null); setShowErrors(false); setEditing(true)
  }
  /* the builder opened by URL (`?edit=`) hands back to the plain console form when it is done */
  const leaveSetup = () => {
    if (!setup && !params.get('edit')) return
    const next = new URLSearchParams(params)
    next.delete('edit')
    const q = next.toString()
    nav({ pathname, search: q ? `?${q}` : '' }, { replace: true })
  }
  const cancelEditing = () => { setSelKey(null); setEditing(false); leaveSetup() }
  const sameRules = (a: FormRulesV2, b: FormRulesV2) =>
    [...new Set([...Object.keys(a), ...Object.keys(b)])].every((k) => JSON.stringify(norm(k, a[k])) === JSON.stringify(norm(k, b[k])))
  /* Grow compares what its form SHOWS — a Grow change that shows a field the console hides is `hidden: false`, which
     reads like no change on its own */
  const dirty = editing && (!(growSetup ? sameRules(growRules(growBase, draftRules), growRules(growBase, savedGrow)) : sameRules(draftRules, savedRules))
    || JSON.stringify(draftCustom) !== JSON.stringify(savedCustom)
    || JSON.stringify(draftLayout) !== JSON.stringify(savedLayout)
    || JSON.stringify(draftOrder) !== JSON.stringify(savedOrder) || JSON.stringify(draftSummary) !== JSON.stringify(savedSummary))
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
    /* both portals' rules now hold the retired "How goods are entered" as the section hides */
    clearLegacyGoods()
    saveLayout(formPortal, draftLayout)
    saveOrder(formPortal, draftOrder)
    saveSummary(formPortal, draftSummary)
    setSavedRules(loadRules('console')); setSavedGrow(loadRules('grow')); setSavedCustom(loadCustomFields())
    setSavedLayout(loadLayout(formPortal)); setSavedOrder(loadOrder(formPortal)); setSavedSummary(loadSummary(formPortal))
    setSelKey(null); setEditing(false)
    /* formSync sends the saved setup to the server, so every device and user gets it (owner, 2026-10-06) */
    toast.success(growSetup ? 'Grow portal form saved — merchants see it on Create Order, on every device' : 'Console form saved — every device shows it')
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
  /** the builder's own name for a field, else the form's wording (a field whose label carries its units) */
  const ownLbl = (key: string, d: string) => rules[key]?.label?.trim() || d

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
    if (savedParcels?.length) return savedParcels.map((p) => canonParcel({ ...p, packageId: p.packageId || newPackageId() }))
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
    return asItem ? ps.map((p) => ({ id: p.packageId || newPackageId(), item: canonItem({ ...p.items![0], quantity: p.quantity }) })) : null
  }
  /* the builder's sections decide (Packages hidden = SKU-based) — except an overage scan / the QA shortcut (a package:
     its barcode is the tracking number) and a reopened draft (the shape it was saved in) */
  const [draftShape] = useState<'items' | 'packages' | null>(() => (savedParcels?.length ? (itemsFromDraft() ? 'items' : 'packages') : null))
  const [lines, setLines] = useState<ItemLine[]>(() => itemsFromDraft() ?? [{ id: newPackageId(), item: blankItem() }])
  const useItems = !simple && !isFtl && !fromOverage && !jump && (draftShape ? draftShape === 'items' : pkgOff)
  /* SKUs are asked: the SKU-based list, or each package's SKUs (not when the builder hid them — packages only) */
  const skusAsked = useItems || !skuOff
  /* the builder's "SKU list" (owner, 2026-10-07): the SKUs listed first, then the packages — each package picks the SKUs
     packed in it. Only while both sections are shown; the SKUs still live in their package (Package 1 holds the ones no
     other package picked), so switching the choice never loses one. */
  const separateLayout = layout.skuList === 'separate' && !useItems && !simple && !isFtl && !pkgOff && !skuOff
  /* the SKU-based list's units (owner, 2026-10-06: kg + cm or lb + in) — every line's worked-out package carries them */
  const [itemUnit, setItemUnit] = useState<UnitSrc>(() => {
    const f = savedParcels?.[0] ? canonParcel(savedParcels[0]) : undefined
    return { unitSystem: f?.unitSystem, weightUnit: f?.weightUnit, dimUnit: f?.dimUnit }
  })
  /* owner, 2026-10-05: with several packages ONE is open for editing and the rest fold to one-line rows; past
     PKG_PAGE rows the list stops at "Show all" — 100 packages no longer means 100 cards to scroll past */
  const [openPkgId, setOpenPkgId] = useState<string | null>(null)
  const [allPkgs, setAllPkgs] = useState(false)
  const [allSkus, setAllSkus] = useState(false)
  /* "10 × fridge" = ONE package spec: quantity 10, the SKU's L × W × H, weight = the SKU's (Custom, no
     tare — what reweigh() gives), one SKU unit inside. Parcel.quantity = packages, ParcelItem.quantity = units each. */
  const itemParcels = useMemo<Parcel[]>(() => lines.filter((l) => !isBlankItem(l.item)).map((l) => ({
    ...newParcel(), packageId: l.id, packageTypeCode: CUSTOM_PACKAGE, packageTypeName: CUSTOM_PACKAGE_NAME,
    quantity: l.item.quantity, weight: round2(l.item.weightKg), weightMode: 'auto',
    l: l.item.lengthCm ?? 0, w: l.item.widthCm ?? 0, h: l.item.heightCm ?? 0,
    items: [{ ...l.item, quantity: 1 }], itemInfo: l.item.name,
    ...(itemUnit.unitSystem ? { unitSystem: itemUnit.unitSystem } : {}),
    ...(itemUnit.weightUnit ? { weightUnit: itemUnit.weightUnit } : {}),
    ...(itemUnit.dimUnit ? { dimUnit: itemUnit.dimUnit } : {}),
  })), [lines, itemUnit])
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
  /* Dedicate Truck + Vehicle Details are builder fields on both forms (2026-10-07). Dedicate Truck hidden = nobody is asked:
     every consignment gets the builder's default (shared, unless "Dedicated truck" is picked under "While it is hidden").
     Vehicle Details hidden = the carrier picks the vehicle (one of the hub's vehicles carries the whole load). */
  const truckHidden = !simple && isHidden('dedicateTruck')
  const truckDefault = rules.dedicateTruck?.defaultValue === 'on'
  const vehicleCard = !hid('vehicleDetails')
  const vehiclesAuto = !simple && !editing && isHidden('vehicleDetails')
  const lm: BookingMode = mode ?? 'ltl'
  const laneHub = useMemo(() => shipFromHubOf(fromList ? senderStore : null, sender), [fromList, senderStore, sender])
  const currency = merchantMode ? currencyForHub(laneHub, sender) : CURRENCY
  const weights = chargeableKg(goods)
  const vasNames = (c.vas ?? []).map((v) => v.service).filter(Boolean)
  const services = useMemo(() => bookableServices(), [])
  /* Service Type hidden (2026-10-05): the form asks nothing and books the builder's DEFAULT service; a resumed draft, a
     Modify or a pickup request keeps its own. The Simplified tier is not customisable — it always asks. */
  const serviceHidden = !simple && isHidden('serviceType')
  const ruleDefault = rules.serviceType?.defaultValue?.trim() ?? ''
  /** console parcel default: the builder's choice when it is a known service, else Standard */
  const defaultService = SERVICE_TYPES.includes(ruleDefault) ? ruleDefault : SERVICES[0].code
  /** console full vehicle (/new/vehicle): the builder's choice when it is a vehicle service, else Inland FTL */
  const defaultFtl = FTL_SERVICE_CODES.includes(ruleDefault) ? ruleDefault : DEFAULT_FTL_SERVICE
  const ownService = saved && saved.shipmentType !== 'FTL' ? saved.service : ''
  const ownFtl = saved?.ftlServiceType || pr?.ftlServiceType || ''
  /** what the console form books (the field's value, or — hidden — its own / the default) */
  const consoleService = serviceHidden ? ownService || defaultService : service
  const consoleFtl = serviceHidden ? ownFtl || defaultFtl : ftlService
  /** Grow, hidden: its own service if still bookable, else the default, else the first bookable one */
  const ownGrow = (saved ? (saved.shipmentType === 'FTL' ? saved.ftlServiceType || saved.service : saved.service) : '') || pr?.ftlServiceType || ''
  const growDefault = [ownGrow, ruleDefault].find((code) => !!code && services.some((x) => x.code === code)) ?? services[0]?.code ?? ''
  const growService = serviceHidden ? growDefault : service
  const offered = serviceHidden ? services.filter((x) => x.code === growDefault) : services
  /* Grow's Service Type is chosen at checkout (step 2 · Service & payment, owner 2026-10-06) — its card shows only in
     the builder's preview, under "Next step" (hidden: only with "Show hidden fields", faded, so it can be brought back) */
  const growServiceCard = editing && (!serviceHidden || showHidden)
  const laneOk = laneReady(sender) && allDrops.every(laneReady)
  /* the rate needs a weight or a size — unless the builder made the weight optional / hid it (then any package counts) */
  const weightOk = goods.length > 0 && goods.every((p) => packageReady(p) || (p.quantity > 0 && !need('pkgWeight')))
  const ready = laneOk && weightOk
  /* plain (no useMemo): it reads the hidden-service default, which the compiler cannot memoise around */
  const fleet: FleetVehicle[] = (() => {
    if (!merchantMode || !laneHub) return []
    const svcCode = serviceHidden ? growDefault : service
    const ftlCat = FTL_SERVICE_TYPES.find((t) => t.code === svcCode)
    const fits = (name: string) => !ftlCat || ftlCat.vehicles.some((v) => name.startsWith(v))
    let list = hubVehicleTypes(laneHub).filter((v) => fits(v.name))
    if (!list.length) list = vehicleTypesFor(masters.vehicleTypes, laneHub, svcCode || null).filter((v) => fits(v.name))
    if (!list.length && ftlCat) list = vehiclesFor(ftlCat.code).map((v) => ({ code: v.type, name: v.type, payloadKg: v.payloadKg, capacity: v.capacity }))
    const one = (code: string) => (laneReady(sender) && laneReady(receiver) && svcCode
      ? quoteService({ code: svcCode, name: svcCode }, { from: sender, to: receiver, parcels: [], mode: 'ftl', currency, vehicles: [{ vehicleType: code, actualLoadKg: 0, addressIdx: [0] }] }).net
      : vehicleRate(code, currency))
    /* the booking stores the CATALOGUE type ("8 Ton Truck"); the card shows the hub's own name */
    const catalogue = (name: string) => VEHICLE_SPECS.map((x) => x.type).filter((t) => name.startsWith(t)).sort((a, b) => b.length - a.length)[0] ?? name
    const seen = new Set<string>()
    return list.map((v) => ({ ...v, code: catalogue(v.name) })).filter((v) => (seen.has(v.code) ? false : (seen.add(v.code), true)))
      .map((v) => ({ code: v.code, name: v.name, payloadKg: v.payloadKg, capacity: v.capacity, rate: one(v.code) }))
  })()
  const fleetNote = laneHub ? `Vehicles configured at ${hubName(laneHub, stores) || laneHub}. Rates per vehicle for this route.` : ''
  /* owner, 2026-10-06 ("see the other branch's vehicle selection"): a full vehicle is booked in a Vehicle Details card —
     the second branch's table (vehicle type · how many · est. load · deliver to) with the Ship From hub's fleet as the
     types; the console's rows model, so a resumed draft / an FTL pickup request reopens its own vehicles */
  /* plain (no useMemo): the fleet is rebuilt every render */
  const mVehicles: FtlVehicle[] = mode !== 'ftl' ? []
    : vehiclesAuto ? (fleet[0] ? [{ vehicleType: fleet[0].code, actualLoadKg: Math.round(weights.chargeable) || 0, addressIdx: allDrops.map((_, i) => i) }] : [])
    : vehicles.filter((v) => !!v.vehicleType)
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
  const selected = !ready ? '' : quotes.some((q) => q.code === growService) ? growService : quotes.length === 1 ? quotes[0].code : ''
  const quote = quotes.find((q) => q.code === selected) ?? null
  const ftlOk = mode !== 'ftl' || vehiclesAuto || (mVehicles.length > 0 && rows.every((r) => !!r.vehicleType && r.count >= 1 && r.loadKg > 0 && r.addressIdx.length > 0)
    && allDrops.every((_, i) => mVehicles.some((v) => v.addressIdx.includes(i))))
  /* Grow step 1: the service is picked at checkout — until then the form shows the lowest rate for this route */
  const cheapest = merchantMode && ready && ftlOk && quotes.length ? Math.min(...quotes.map((q) => q.net)) : null
  /* a new load type keeps the chosen service — every service is offered in both modes (2026-09-29), and `selected`
     drops one the new list does not offer; switching a full vehicle on starts its Vehicle Details with the hub's first
     vehicle carrying the whole load to every Ship To address */
  const changeMode = (m: BookingMode) => {
    if (merchantMode && m === 'ftl' && mode !== 'ftl') {
      setRows([{ vehicleType: fleet[0]?.code ?? '', count: 1, loadKg: Math.round(weights.chargeable) || 0, addressIdx: allDrops.map((_, i) => i) }])
    }
    setMode(m); setC({ dedicateTruck: m === 'ftl' })
  }
  /* Grow, Dedicate Truck hidden: the builder's default load type — unless the order is a full vehicle by where it came
     from (an FTL pickup request, a draft, /add/vehicle) or it answers an overage scan */
  const forcedMode: BookingMode | null = merchantMode && truckHidden && !fromOverage && !ftlFirst ? (truckDefault ? 'ftl' : 'ltl') : null
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- following the builder's rule (a hidden field's default)
    if (forcedMode && mode !== forcedMode) changeMode(forcedMode)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- changeMode reads the fleet at that moment
  }, [forcedMode, mode])

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
  const dedicated = !isFtl && (serviceLoad === 'ftl' || (serviceLoad === 'both' && (truckHidden ? truckDefault : !!c.dedicateTruck)))
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
  /** Grow's payment (2026-10-07: asked on step 1, in its own Payment card): Prepaid unless COD is chosen */
  const growPayMode: 'Prepaid' | 'COD' = typeRule.payment && c.paymentMode === 'COD' ? 'COD' : 'Prepaid'
  const codAsked = merchantMode && growPayMode === 'COD' && !isHidden('paymentMode') && !isHidden('orderAmount')
  /* any address typed on the form (the card's caption says so) */
  const anyInline = inlineOf('from') || inlineOf('to') || (typeRule.rto && c.rtoMode === RTO_MODES[1] && inlineOf('rto'))
  /* owner, 2026-10-06: Ship From | Ship To side by side (default — Saved card or Fields on form, both portals; they stack
     only when the card itself is narrow) or one under the other (the builder's Layout). The Simplified tier keeps its own. */
  const stackAddr = !simple && layout.addresses === 'stack'
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
  const vehicleOpts = vehicleTypesFor(masters.vehicleTypes, shipFromHub, isFtl ? consoleFtl : null)
  /* a hidden Service Type never runs pickFtlService — fit the vehicle rows to the default service's vehicles here */
  useEffect(() => {
    if (!isFtl || !serviceHidden || !vehicleOpts.length) return
    const ok = (t: string) => vehicleOpts.some((v) => v.code === t)
    /* eslint-disable-next-line react-hooks/set-state-in-effect -- synchronising with the masters + the builder's default */
    setRows((rs) => (rs.every((r) => ok(r.vehicleType)) ? rs : rs.map((r) => (ok(r.vehicleType) ? r : { ...r, vehicleType: vehicleOpts[0].code }))))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- vehicleOpts is derived from these
  }, [isFtl, serviceHidden, consoleFtl, masters.vehicleTypes, shipFromHub])
  const payloadOf = (type: string) => vehicleTypeOf(masters.vehicleTypes, type)?.payloadKg ?? 0
  const units = vehicles.length
  const vehicleType = vehicles[0]?.vehicleType ?? ''
  const actualLoad = totalLoadKg(vehicles)
  const addServices = (c.vas ?? []).map((v) => v.service).filter(Boolean)
  const vasTotal = addServices.reduce((n, sv) => n + vasPrice(sv), 0)
  const parcelSvc = SERVICES.find((s) => s.code === consoleService) ?? { ...SERVICES[0], code: consoleService || SERVICES[0].code }
  const svc = isFtl
    ? { code: consoleFtl, days: ftlServiceType(consoleFtl).days, price: ftlQuoteVehicles(vehicles, drops.length, addServices) }
    : { ...parcelSvc, price: parcelSvc.price + vasTotal }
  const addressOptions = allDrops.map((d, i) => ({ value: String(i), label: `Address ${i + 1}${d.name ? ` · ${d.name}` : ''}${d.city ? `, ${d.city}` : ''}` }))
  const uncovered = allDrops.map((_, i) => i).filter((i) => !vehicles.some((v) => v.addressIdx.includes(i)))
  const skuLines = goods.flatMap((p, i) => (p.items ?? []).map((it, k) => ({ it, i, k })))
  const skuLineOpts = useMemo(() => {
    const seen = new Set<string>()
    return goods.flatMap((p) => p.items ?? []).filter((it) => !isBlankItem(it))
      .map((it) => ({ value: it.skuCode ?? it.name.trim(), label: it.skuCode ? `${it.skuCode} · ${it.name}` : it.name.trim() }))
      .filter((o) => (seen.has(o.value) ? false : (seen.add(o.value), true)))
  }, [goods])

  /* ---- identifiers: the account's identifier setting (Order / Reference / both) ---- */
  /* the Simplified form asks one number; the reference copies it (the original's rule) */
  /* 2026-10-07: Reference Number can be hidden (it then copies the Order Number) or optional (blank = the Order Number) */
  const refHidden = !simple && isHidden('referenceNumber')
  const idPref = simple || refHidden ? 'orderNumber' : behavior.identifier
  const effectiveOrder = (idPref === 'referenceNumber' ? c.referenceNumber : c.orderNumber) ?? ''
  const effectiveRef = (idPref === 'orderNumber' ? c.orderNumber : filled(c.referenceNumber) ? c.referenceNumber : c.orderNumber) ?? ''
  /* the Reference Number must be typed: required by the builder, or the only identifier shown */
  const refRequired = idPref === 'referenceNumber' || need('referenceNumber')

  /* ------------------------------------------------ completion + validation
     = AddOrderPage's Regular required set + the builder's "required" rules (only for shown fields) */
  const needOk = (k: string, ok: boolean) => (need(k) ? [ok] : [])
  /* a package's weight (required while shown — the default) and, when the builder asks for it, a Custom package's size */
  const needW = need('pkgWeight')
  const dimsOkOf = (p: Parcel) => !need('pkgDimensions') || packageValue(p, packageTypes) !== CUSTOM_PACKAGE || (p.l > 0 && p.w > 0 && p.h > 0)
  const str = (v: unknown) => (v == null ? '' : String(v))
  /* the account's own fields in a card (2026-10-05): Required + Format */
  const customReq = (card: CustomFieldCard) => customDefs.filter((d) => d.card === card)
    .flatMap((d) => [...needOk(d.key, filled(cfv[d.key])), fmtOk(d.key, cfv[d.key])])
  /* a hidden Ship By Date (Grow) is today — never a check the merchant cannot see */
  const consignmentReq = [filled(effectiveOrder), filled(effectiveRef), ...(refRequired && idPref === 'both' ? [filled(c.referenceNumber)] : []),
    !!c.consignmentType, filled(c.shipByDate) || isHidden('shipByDate'),
    /* Merchant hidden / optional: the signed-in (first) merchant is recorded */
    ...(merchantMode || !need('merchant') ? [] : [!!merchant]),
    ...needOk('consignmentNumber', filled(c.consignmentNumber)),
    /* an Exchange names the order it exchanges (owner, 2026-09-29: fields follow the type) */
    ...(!simple && ctype === 'Exchange' && !hid('exchangeOrderNumber') ? [filled(c.exchangeOrderNumber)] : []),
    /* Simplified: the delivery Start / End time on the Ship By Date are required (the original's rule) */
    ...(simple ? [filled(timeOf(receiver.windowStart)), filled(timeOf(receiver.windowEnd))] : []),
    ...(typeRule.payment && !merchantMode ? [...needOk('paymentMode', !!c.paymentMode), ...needOk('orderAmount', (c.orderAmount ?? 0) > 0)] : []),
    /* Format rules on the numbers as typed (a copied identifier is checked where it is typed) */
    ...(idPref !== 'referenceNumber' ? [fmtOk('orderNumber', c.orderNumber)] : []),
    ...(idPref !== 'orderNumber' ? [fmtOk('referenceNumber', c.referenceNumber)] : []),
    fmtOk('consignmentNumber', c.consignmentNumber),
    ...(ctype === 'Exchange' ? [fmtOk('exchangeOrderNumber', c.exchangeOrderNumber)] : []),
    ...customReq('sec-consignment'),
  ]
  /** what an address still misses, in words (the card says it) — base required + the builder's rules */
  /* the Ship To / return address's Contact Number: required while shown (the default); the builder can hide it or make it optional */
  const contactReq = simple || need('addrContact')
  const missingOf = (p: Party, role: 'from' | 'to' | 'rto'): string[] => {
    if (role !== 'rto' && (role === 'from' ? fromEnd.kind === 'facility' : HUB_CODES.has(p.locationCode ?? ''))) return []
    const out: string[] = []
    const add = (ok: boolean, label: string) => { if (!ok) out.push(label) }
    add(filled(p.name), role === 'to' ? 'Customer Name' : 'Sender Name')
    if (role !== 'from' && contactReq) add(filled(p.contactNumber), lbl('addrContact'))
    add(filled(p.line1), lbl('addrLine1')); add(filled(p.country), lbl('addrCountry')); add(filled(p.state), lbl('addrState')); add(filled(p.city), lbl('addrCity'))
    if ((role === 'rto' && !isHidden('addrPostal')) || need('addrPostal')) add(filled(p.postalCode), lbl('addrPostal'))
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
    ? [!!consoleFtl, vehicles.length > 0, uncovered.length === 0,
      ...rows.map((r) => !!r.vehicleType && r.count >= 1 && r.loadKg > 0 && r.addressIdx.length > 0), noDg]
    : [...goods.map((p) => p.quantity > 0 && (simple || !needW || p.weight > 0)), noDg,
      /* package-level rules apply where packages are typed (Items mode derives them) */
      ...(useItems ? [] : parcels.flatMap((p) => [...needOk('pkgTracking', filled(p.trackingNumber)), dimsOkOf(p),
        ...needOk('pkgPalletSpace', filled(p.palletSpace)), ...needOk('pkgDescription', filled(p.description)),
        fmtOk('pkgTracking', p.trackingNumber), fmtOk('pkgPalletSpace', p.palletSpace), fmtOk('pkgDescription', p.description)]))]
  /* 2026-10-07: a SKU's weight and size are required while shown (the default) — the builder can hide them or make them optional */
  const skuLineOk = (it: ParcelItem) => !!it.skuCode && filled(it.name) && it.quantity >= 1 && (!need('skuWeight') || it.weightKg > 0)
    && (!need('skuDimensions') || ((it.lengthCm ?? 0) > 0 && (it.widthCm ?? 0) > 0 && (it.heightCm ?? 0) > 0))
  const skuRuleOk = (it: ParcelItem) => [...needOk('skuCategory', filled(it.category)), ...needOk('skuDescription', filled(it.description)),
    ...needOk('skuHsn', filled(it.hsnCode)), ...needOk('skuOrigin', filled(it.originCountry)), ...needOk('skuImage', filled(it.imageUrl)), ...needOk('skuUnitCost', (it.unitCost ?? 0) > 0),
    fmtOk('skuDescription', it.description), fmtOk('skuHsn', it.hsnCode), fmtOk('skuImage', it.imageUrl)].every(Boolean)
  /* Simplified asks a SKU's code / name only; with the SKUs hidden (packages only) a draft's SKUs are kept, not checked */
  const skuReq = isFtl || (!simple && !skusAsked) ? [] : skuLines.map(({ it }) => (simple ? isBlankItem(it) || filled(it.name) : skuLineOk(it) && skuRuleOk(it)))
  /** one package is complete — its own fields and its SKU lines. A folded package row says "Incomplete" after an Add
      attempt, and the first incomplete one opens. */
  const pkgOk = (p: Parcel) => p.quantity > 0 && (!needW || p.weight > 0) && dimsOkOf(p)
    && [...needOk('pkgTracking', filled(p.trackingNumber)), ...needOk('pkgPalletSpace', filled(p.palletSpace)), ...needOk('pkgDescription', filled(p.description)),
      fmtOk('pkgTracking', p.trackingNumber), fmtOk('pkgPalletSpace', p.palletSpace), fmtOk('pkgDescription', p.description)].every(Boolean)
    && (!skusAsked || (p.items ?? []).every((it) => skuLineOk(it) && skuRuleOk(it)))
  const vasReq = simple || isHidden('vas') ? [] : (c.vas ?? []).map(vasOk)
  /* Items mode needs at least one SKU picked (a blank line is ignored) */
  const goodsReq = useItems && !typeRule.goodsOptional ? [itemParcels.length > 0] : []
  const carrierReq = merchantMode ? [] : [!!c.carrier]
  /* owner, 2026-09-29: Vehicle Type is optional; Service Type is required */
  const vehicleReq: boolean[] = []
  const serviceReq = merchantMode
    /* Grow step 1: a load type, a priced route (addresses + weights), at least one bookable service and (full vehicle)
       the vehicles — the service itself is chosen at checkout */
    ? [!!mode, ready, quotes.length > 0, ftlOk]
    : [...vehicleReq, !!(isFtl ? consoleFtl : consoleService), ...needOk('labelFormat', !!c.labelFormat),
      ...needOk('totalLoadingTime', (c.totalLoadingTime ?? 0) > 0)]
  const handlingReq = [...needOk('tags', (c.tags ?? []).length > 0), ...customReq('sec-handling')]
  /* Grow's Payment card: a COD order says how much to collect (unless the builder hides the amount) */
  const paymentReq = merchantMode ? [...needOk('paymentMode', true), ...(codAsked ? [(c.orderAmount ?? 0) > 0] : []),
    ...needOk('remarks', filled(c.remarks)), fmtOk('remarks', c.remarks)] : []
  const extrasReq = [...vasReq, ...needOk('specialInstructions', filled(c.specialInstructions)), fmtOk('specialInstructions', c.specialInstructions),
    /* Grow asks Label Format in its Service & instructions card */
    ...(merchantMode ? needOk('labelFormat', !!c.labelFormat) : []),
    ...customReq('sec-service')]
  const allReq = [...consignmentReq, ...serviceReq, ...fromReq, ...toReq, ...rtoReq, ...routeReq, ...goodsReq, ...pieceReq, ...skuReq,
    ...handlingReq, ...extrasReq, ...carrierReq, ...paymentReq]
  const filledCount = allReq.filter(Boolean).length
  const canSubmit = filledCount === allReq.length
  const missingCount = allReq.length - filledCount
  const done = (xs: boolean[]) => xs.every(Boolean)

  /* ------------------------------------------------------------ mutations */
  const setParcel = (i: number, patch: Partial<Parcel>) => setParcels((ps) => ps.map((x, j) => (j === i ? { ...x, ...patch } : x)))
  const setRow = (i: number, patch: Partial<VehicleRow>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)))
  const addVehicle = () => setRows((rs) => [...rs, {
    vehicleType: rs[rs.length - 1]?.vehicleType || (merchantMode ? fleet[0]?.code : vehicleOpts[0]?.code) || '', count: 1, loadKg: 0, addressIdx: uncovered,
  }])
  const removeVehicle = (i: number) => setRows((rs) => rs.filter((_, j) => j !== i))
  const pickFtlService = (code: string) => {
    setFtlService(code)
    const allowed = vehicleTypesFor(masters.vehicleTypes, shipFromHub, code)
    setRows((rs) => rs.map((r) => ({ ...r, vehicleType: allowed.some((v) => v.code === r.vehicleType) ? r.vehicleType : allowed[0]?.code ?? '' })))
  }
  /* a vehicle is chosen only for a dedicated truck — switching it off drops the choice (owner, 2026-10-06) */
  const setDedicateTruck = (on: boolean) => { setC({ dedicateTruck: on }); if (!on) setDedicatedType('') }
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
    /* separate list: a new line takes the next number in the SKU list */
    const top = parcels.flatMap((p) => p.items ?? []).reduce((n, it, idx) => Math.max(n, it.lineNo ?? idx + 1), 0)
    setItems(i, (items) => [...items, separateLayout ? { ...blankItem(), lineNo: top + 1 } : blankItem()])
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
  /** "SKUs in this package" (separate list — the PACKAGE picks its SKUs): package `j` holds exactly `want`; a SKU taken
      out of it goes back to the first package, which holds every SKU not put in another one. Every line keeps its number
      in the SKU list. */
  const packInto = (j: number, want: ParcelItem[]) => setParcels((ps) => {
    const num = new Map(sepSort(ps.flatMap((p) => p.items ?? []), (it) => it).map((it, n) => [it, n + 1]))
    const wantSet = new Set(want)
    const mine = ps[j]?.items ?? []
    const items = ps.map((p, idx) => (p.items ?? []).filter((it) => (idx === j ? wantSet.has(it) || isBlankItem(it) : !wantSet.has(it))))
    items[j] = [...items[j], ...want.filter((it) => !mine.includes(it))]
    if (j !== 0) items[0] = [...items[0], ...mine.filter((it) => !isBlankItem(it) && !wantSet.has(it))]
    return ps.map((p, idx) => reweigh({ ...p, items: items[idx].map((it) => ({ ...it, lineNo: num.get(it) })) }, packageTypes))
  })
  /** "Barcode on every box" — ONE question at the top of Package & SKU (owner, 2026-10-06: "in the section top, not on
      every package — ask this, and based on it…"): on = every package line is ONE box with its own barcode (its quantity
      stays 1; a line of N boxes becomes N lines, one per box); off = boxes of a spec are counted again */
  const setBarcodeAll = (on: boolean) => {
    setC({ scannable: on })
    if (useItems || isFtl) return
    if (!on) { setParcels((ps) => ps.map((p) => ({ ...p, barcodeEach: false }))); return }
    const boxes = parcels.reduce((n, p) => n + Math.max(1, p.quantity || 1), 0)
    if (boxes === parcels.length) { setParcels((ps) => ps.map((p) => ({ ...p, barcodeEach: true, quantity: 1 }))); return }
    if (boxes > 200) {
      setParcels((ps) => ps.map((p) => ({ ...p, barcodeEach: true, quantity: 1 })))
      toast.info(`Every package set to one box — add the other ${boxes - parcels.length} with Duplicate`)
      return
    }
    setParcels(parcels.flatMap((p) => {
      const one: Parcel = { ...p, barcodeEach: true, quantity: 1 }
      return [one, ...Array.from({ length: Math.max(1, p.quantity || 1) - 1 }, (): Parcel => ({ ...one, packageId: newPackageId(), trackingNumber: '',
        items: separateLayout ? [] : (p.items ?? []).map((it) => ({ ...it })) }))]
    }))
    setOpenPkgId(null)
    toast.success(`${boxes} boxes, one line each — every box gets its own barcode`)
  }
  /** remove a package — with the SKUs packed in it; in the separate list they stay (they move to the first package) */
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
  const jumpTarget = jump === 1 ? (isFtl ? 'sec-vehicle' : 'sec-packages') : jump === 2
    ? (merchantMode ? (growServiceCard ? 'sec-service' : 'sec-handling') : 'sec-carrier') : null
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
      ? { vehicleType, vehicleUnit: units, actualLoad, ftlServiceType: consoleFtl, vehicles }
      : dedicated && vehicleChoice
        ? { vehicleType: vehicleChoice, vehicleUnit: 1, actualLoad: parcelLoadKg, vehicles: [{ vehicleType: vehicleChoice, actualLoadKg: parcelLoadKg, addressIdx: [0] }] }
        : { vehicleType: '', vehicleUnit: 0, actualLoad: 0 }),
    additionalServices: addServices,
    parcels: isFtl
      ? [{ cargoType: 'FTL', itemInfo: [consoleFtl, ...vehicles.map((v) => v.vehicleType), ...addServices].join(' · '), quantity: units, weight: actualLoad / Math.max(1, units), l: 120, w: 100, h: 150 }]
      : goods.map((p) => ({ ...p, items: (p.items ?? []).filter((it) => !isBlankItem(it)), itemInfo: itemInfoOf(p) })),
    authority: saved?.authority || 'Leave at the door', instructions, secure, service: svc.code, rate: svc.price, etaDays: svc.days,
    consignment: {
      ...c,
      /* owner, 2026-10-06: "Barcode on every box" is ONE switch (Package & SKU's header; Handling on a vehicle form) */
      scannable: !!c.scannable,
      dedicateTruck: isFtl || dedicated,
      /* hidden (2026-10-07): Forward and today, unless the consignment already had its own */
      consignmentType: c.consignmentType || 'Forward', shipByDate: c.shipByDate || today(),
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
    const svcCode = selected || growService
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
        /* hidden on Grow (owner, 2026-10-06): Forward and today, unless the order already had its own */
        consignmentType: c.consignmentType || 'Forward', shipByDate: c.shipByDate || today(),
        scannable: !!c.scannable,
        dedicateTruck: ftl, carrier: '', category: [], tags: [], totalLoadingTime: null,
        orderNumber: effectiveOrder.trim(), referenceNumber: effectiveRef.trim(),
        consignmentNumber: c.consignmentNumber?.trim() || effectiveRef.trim(),
        merchantCode: merchant?.code ?? null, merchantName: merchant?.name ?? '',
        rto: typeRule.rto && c.rtoMode === RTO_MODES[1] ? rto : null,
        ...(typeRule.rto ? {} : { rtoMode: RTO_MODES[0] }),
        /* Grow's Payment card (2026-10-07): Prepaid or COD (hidden = Prepaid); the COD amount only for COD; the remarks */
        paymentMode: growPayMode, orderAmount: growPayMode === 'COD' && !isHidden('orderAmount') ? c.orderAmount ?? null : null,
        remarks: isHidden('remarks') ? c.remarks ?? '' : (c.remarks ?? '').trim(),
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
  /* owner, 2026-10-06: "Barcode on every box" is ONE switch, back in the Handling card (it was briefly in the Package & SKU
     header) — on, every package line is one box with its own barcode (`barcodeEach`, quantity 1) */
  const barcodeEach = !isFtl && !useItems && !!c.scannable
  const handlingTogglesVisible = !hid('scannable') || !hid('splittable') || !hid('clearanceRequired') || !hid('tags')
  /* the switches row — on Grow Tags moves to the line below, beside the load type */
  const switchesRow = merchantMode ? (!hid('scannable') || !hid('splittable') || !hid('clearanceRequired')) : handlingTogglesVisible
  const handlingCustom = arrange(sortApi, 'handling-fields', customEntries('sec-handling'), inMore, secOpen('sec-handling'))
  /* while editing the card always shows — its "+ Add field" lives in it */
  const handlingVisible = handlingChipsVisible || handlingTogglesVisible || handlingCustom.nodes.length > 0 || handlingCustom.waiting > 0 || editing
  /* the console's Service & instructions card leaves no gap when every field in it is hidden (Service Type included) */
  const consoleServiceCard = editing || !hid('serviceType') || (!isFtl && (!hid('dedicateTruck') || !hid('vehicleType')))
    || !hid('labelFormat') || !hid('totalLoadingTime') || !hid('specialInstructions') || !hid('vas')
    || customDefs.some((d) => d.card === 'sec-service' && !hid(d.key))
  const svcSec = consoleServiceCard ? ['sec-service'] : []
  /* the Summary card shows while it is on and has a line to show. While the form is edited it follows "Show hidden
     fields" like every field (owner, 2026-10-06: switched off, it stayed in the preview and the switch did nothing):
     off → it leaves the preview, as it leaves the live form; Show hidden fields → back, faded, to switch it on */
  const summaryShown = !simple && ((summaryCfg.enabled && summaryLinesOf(formPortal).some((l) => !summaryCfg.hidden.includes(l.key))) || (editing && showHidden))
  /* owner, 2026-10-06 ("summary should be a vertical card, not a horizontal one"): the Summary is no longer a card in
     the flow — it is the vertical card beside the form (see the layout at the bottom), so it takes no place here */
  const sumSec: string[] = []
  /* Grow: no Service Type card on step 1 — it is chosen at checkout; the builder previews it after the cards, unmovable */
  const sections = merchantMode ? ['sec-consignment', 'sec-parties', 'sec-packages', 'sec-handling', ...(mode === 'ftl' && vehicleCard ? ['sec-vehicle'] : []),
    'sec-extras', 'sec-payment', ...sumSec]
    : simple ? ['sec-consignment', 'sec-parties', isFtl ? 'sec-vehicle' : 'sec-packages', 'sec-carrier'] : isFtl
    ? ['sec-consignment', 'sec-parties', ...svcSec, ...(vehicleCard ? ['sec-vehicle'] : []), ...(handlingVisible ? ['sec-handling'] : []), 'sec-carrier', ...sumSec]
    : ['sec-consignment', 'sec-parties', 'sec-packages', ...(handlingVisible ? ['sec-handling'] : []), ...svcSec, 'sec-carrier', ...sumSec]
  /* owner, 2026-10-05 ("allow the user to move sections up and down"): the cards follow the saved order (zone
     SECTION_ZONE of the field order, so it is edited, saved, reset and — on Grow — inherited like the fields'); a card
     the order does not know sits after its natural predecessor. The Simplified tier keeps its own order. */
  const orderedSections = simple ? sections : applyOrder(sections, (x) => x, fieldOrder[SECTION_ZONE])
  const doneOf: Record<string, boolean> = {
    'sec-consignment': done(consignmentReq),
    'sec-parties': done(fromReq) && done(toReq) && done(rtoReq) && done(routeReq),
    'sec-packages': done(goodsReq) && done(pieceReq) && done(skuReq),
    'sec-vehicle': done(pieceReq),
    'sec-handling': done(handlingReq),
    /* owner, 2026-09-29: Service and Instructions & services are ONE card */
    'sec-service': done(serviceReq) && done(extrasReq),
    'sec-carrier': done(carrierReq),
    'sec-summary': true,
    ...(merchantMode ? { 'sec-extras': done(extrasReq), 'sec-service': done(serviceReq), 'sec-vehicle': ftlOk, 'sec-payment': done(paymentReq) } : {}),
  }

  const proceed = () => {
    if (editing) return
    if (!canSubmit) {
      /* the first attempt turns the errors on; the page jumps to the first incomplete section */
      setShowErrors(true)
      /* a folded package hides its errors — open the first incomplete one */
      const badPkg = !useItems && !isFtl ? parcels.find((p) => !pkgOk(p)) : undefined
      if (badPkg?.packageId) setOpenPkgId(badPkg.packageId)
      const first = orderedSections.find((s) => !doneOf[s])
      if (first) setTimeout(() => jumpTo(first), 60)
      return
    }
    /* addresses typed on the form with "Save this address" on are kept now that the consignment is */
    if (anyInline) keepTypedAddresses()
    if (merchantMode) {
      /* Grow: step 2 (checkout) picks the service and takes the payment, then creates the order */
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify(buildMerchantDraft()))
      setDraftSidecar({ pickupId: pr?.id ?? null, overage: fromOverage ? { prId: fromOverage.pr.id, overageId: fromOverage.scan.id } : null })
      setCheckoutSidecar({
        services: offered.map((s) => s.code), locked: serviceHidden, layout: layout.services,
        label: lbl('serviceType'), back: `${pathname}${search}`,
      })
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
    if (anyInline) keepTypedAddresses()
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
        const r = arrange(sortApi, 'consignment', [
          /* Merchant first: it decides the Ship From addresses and the package presets below */
          !merchantMode && !hid('merchant') && [null, <F key="me" fieldKey="merchant" label={lbl('merchant')} required={need('merchant')} value={merchant?.code ?? ''} placeholder="eg, ELEX"
            options={masters.merchants.map((m) => ({ value: m.code, label: m.name }))} error={err(need('merchant') && !merchant)}
            onChange={(v) => setMerchantCode(v || null)} />],
          idPref !== 'referenceNumber' && [null, <F key="on" fieldKey="orderNumber" label={lbl('orderNumber')} required value={c.orderNumber ?? ''} placeholder="eg, ABC0001"
            error={err(!filled(effectiveOrder))} onChange={(v) => setC({ orderNumber: v })}
            helper={idPref === 'orderNumber' ? `${lbl('referenceNumber')} is copied from this.` : undefined} />],
          (idPref !== 'orderNumber' || (editing && refHidden && !hid('referenceNumber'))) && ['referenceNumber', <F key="rn" fieldKey="referenceNumber" label={lbl('referenceNumber')} required={refRequired} value={c.referenceNumber ?? ''} placeholder="eg, ABC0001"
            error={err(refRequired && !filled(c.referenceNumber))} onChange={(v) => setC({ referenceNumber: v })}
            helper={idPref === 'referenceNumber' ? `${lbl('orderNumber')} is copied from this.` : !refRequired ? `Blank = the ${lbl('orderNumber')}` : undefined} />, filled(c.referenceNumber)],
          !hid('consignmentNumber') && ['consignmentNumber', <F key="cn" fieldKey="consignmentNumber" label={lbl('consignmentNumber')} value={c.consignmentNumber ?? ''} placeholder="eg, 0001"
            onChange={(v) => setC({ consignmentNumber: v })} />, filled(c.consignmentNumber)],
          !hid('consignmentType') && [null, <F key="ct" fieldKey="consignmentType" label={lbl('consignmentType')} required value={ctype}
            options={opts(merchantMode ? CONSIGNMENT_TYPES.filter((t) => t !== 'Transfer') : CONSIGNMENT_TYPES)} onChange={changeType} />],
          !hid('shipByDate') && [null, <F key="sb" fieldKey="shipByDate" label={lbl('shipByDate')} required type="date" value={c.shipByDate ?? ''} error={err(!filled(c.shipByDate))} onChange={(d) => setC({ shipByDate: d })} />],
          !hid('exchangeOrderNumber') && (ctype === 'Exchange' || editing) && ['exchangeOrderNumber',
            <F key="ex" fieldKey="exchangeOrderNumber" label={lbl('exchangeOrderNumber')} required={ctype === 'Exchange'} value={c.exchangeOrderNumber ?? ''} placeholder="eg, ABC0000"
              error={ctype === 'Exchange' && !filled(c.exchangeOrderNumber) ? 'Required field.' : undefined}
              onChange={(v) => setC({ exchangeOrderNumber: v })} helper={editing ? 'Shown for an Exchange' : 'The order being exchanged'} />, filled(c.exchangeOrderNumber)],
          !merchantMode && !hid('paymentMode') && (typeRule.payment || editing) && ['paymentMode', <F key="pm" fieldKey="paymentMode" label={lbl('paymentMode')} value={c.paymentMode ?? ''} placeholder="eg, Prepaid"
            options={opts(PAYMENT_MODES)} onChange={(v) => setC({ paymentMode: v })} />, !!c.paymentMode],
          !merchantMode && !hid('orderAmount') && (typeRule.payment || editing) && ['orderAmount', <FNum key="oa" fieldKey="orderAmount" label={c.paymentMode === 'COD' ? 'Amount to collect (COD)' : lbl('orderAmount')} blankZero
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
  const [addr, setAddr] = useState<null | { role: Role; idx: number; snapshot: Party; store: string; isNew: boolean; setup?: boolean }>(null)
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
  /** while the form is edited: the same pop-up, to set up the address fields (owner, 2026-10-06: "in the popup I can't edit
      the fields") — closing it puts the address back as it was */
  const openAddressSetup = (role: Role, idx: number) => {
    setSelKey(null)
    setAddr({ role, idx, snapshot: partyOf(role, idx), store: senderStore, isNew: false, setup: true })
  }
  /** "Save this address": to the address book (a customer's) or to your addresses (the store list) */
  const keepAddress = (role: Role, idx: number) => {
    const p = partyOf(role, idx)
    const toBook = role === 'to' ? sourcesOf('to')[0] === 'customers' : role === 'from' ? sourcesOf('from')[0] === 'customers' : false
    /* a name and a street are enough — the address book flags a missing postal code on the row itself */
    if (!filled(p.name) || !filled(p.line1)) { toast.error('Add a name and the address before saving it'); return }
    if (toBook) { addressBookActions.add({ ...p, windowStart: '', windowEnd: '' }); toast.success(`${p.name} saved to the address book`); return }
    const stored = growOrderActions.addStore({ code: codeFor(p), name: p.businessName || p.name, party: { ...p, windowStart: '', windowEnd: '' } })
    if (role === 'from') setSenderStore(stored.code)
    else if (role === 'rto') setRto((x) => ({ ...x, locationCode: stored.code }))
    else replaceParty('to', idx, { ...p, locationCode: stored.code })
    toast.success(`${stored.name} saved to your addresses`)
  }
  const confirmAddress = () => {
    if (addr && saveAddr) keepAddress(addr.role, addr.idx)
    setAddr(null)
  }
  /* an address typed on the form (Fields on the form) is saved when the consignment is — if its switch is on */
  const [saveTyped, setSaveTyped] = useState<Set<string>>(new Set())
  const slotId = (role: Role, idx: number) => `${role}:${idx}`
  const keepTypedAddresses = () => {
    for (const id of saveTyped) {
      const [role, i] = id.split(':') as [Role, string]
      const idx = Number(i)
      if (role === 'to' && idx >= allDrops.length) continue
      if (role === 'rto' && !(typeRule.rto && c.rtoMode === RTO_MODES[1])) continue
      if (typedHere(role, idx)) keepAddress(role, idx)
    }
    setSaveTyped(new Set())
  }
  const cancelAddress = () => {
    if (addr) { replaceParty(addr.role, addr.idx, addr.snapshot); if (addr.role === 'from') setSenderStore(addr.store) }
    setAddr(null)
  }
  const closeSetup = () => { setSelKey(null); cancelAddress() }
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
      onChange={(v) => applyPick(role, idx, v)} />
  }
  /** a saved address (or a hub) picked for one end — the picker's and the on-form search's choice */
  const applyPick = (role: Role, idx: number, v: string) => {
    const p = partyOf(role, idx)
    if (role === 'rto') { const st = stores.find((x) => x.code === v); if (st) setRto({ ...st.party, locationCode: v }); return }
    const next = partyFromPick(v)
    if (!next) return
    const keep = { windowStart: p.windowStart, windowEnd: p.windowEnd }
    if (role === 'from') {
      if (v.startsWith('store:')) { pickSender(v.slice(6)); return }
      setSenderStore(v.startsWith('hub:') ? v.slice(4) : OTHER_ADDRESS)
      setSender({ ...next, ...keep })
    } else replaceParty('to', idx, { ...next, ...keep })
  }
  /** the address came from a saved list (a store, the address book, a hub) */
  const pickedHere = (role: Role, idx: number) => {
    const p = partyOf(role, idx)
    return role === 'rto' ? !!p.locationCode && stores.some((x) => x.code === p.locationCode) : valueOf(role, p) !== ''
  }
  /** an address typed here, not picked from a saved list (it can be saved) */
  const typedHere = (role: Role, idx: number) => {
    const p = partyOf(role, idx)
    return !pickedHere(role, idx) && (filled(p.name) || filled(p.line1))
  }
  /** what the on-form search offers for one end: its saved addresses, by name, number, address or company */
  const hitsFor = (role: Role): AddrHit[] => {
    if (role === 'rto') return stores.map((st) => ({ value: st.code, party: st.party, tag: 'Your address' }))
    return sourcesOf(role).flatMap(optionsOf).flatMap((o) => {
      const party = partyFromPick(o.value)
      if (!party) return []
      const tag = o.value.startsWith('hub:') ? 'Hub' : o.value.startsWith('book:') ? book[Number(o.value.slice(5))]?.tag ?? 'Address book' : 'Your address'
      return [{ value: o.value, party, tag }]
    })
  }
  /** "Clear" on an address typed on the form — back to an empty address (the window stays) */
  const clearParty = (role: Role, idx: number) => {
    const p = partyOf(role, idx)
    replaceParty(role, idx, { ...blankParty(), windowStart: p.windowStart, windowEnd: p.windowEnd })
    if (role === 'from') setSenderStore(OTHER_ADDRESS)
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
    const cells = <>
      <DateTimeCell label={`${w} Start Time`} at={p.windowStart ?? ''} fallbackTime="00:00" onChange={(v) => patchParty(role, idx)({ windowStart: v })} />
      <DateTimeCell label={`${w} End Time`} at={p.windowEnd ?? ''} fallbackTime="23:59" onChange={(v) => patchParty(role, idx)({ windowEnd: v })} />
    </>
    /* the two cells sit side by side only where each gets room for its date AND time (a container query — the column
       is narrower beside the vertical Summary) */
    return (
      <div className="@container mt-6">
        <div className={`grid grid-cols-1 ${FIELD_GAPS} @min-[500px]:grid-cols-2`}>{cells}</div>
      </div>
    )
  }
  /* picker | its card in two columns while an end has the card's full width (owner, 2026-10-06): always in "One under the
     other"; in "Side by side" only while the card is too narrow for the two ends (< 720px). Container queries on the parties card. */
  const split = simple ? null : stackAddr
    ? { grid: '@min-[600px]:grid-cols-2', pad: '@min-[600px]:pt-[26px]' }
    : { grid: '@min-[600px]:@max-[720px]:grid-cols-2', pad: '@min-[600px]:@max-[720px]:pt-[26px]' }
  const addressSlot = (role: Role, idx: number, title: ReactNode, right?: ReactNode) => {
    const p = partyOf(role, idx)
    const at = role === 'rto' ? -1 : bookIdx(p)
    const src = role === 'rto' ? 'merchant' : sourcesOf(role)[0]
    const facility = role !== 'rto' && (role === 'from' ? fromEnd.kind === 'facility' : HUB_CODES.has(p.locationCode ?? ''))
    return (
      <div>
        <SubTitle right={<span className="flex flex-wrap items-center justify-end gap-3">
          {!merchantMode && role !== 'rto' && (
            <span className="rounded-full bg-warm-100 px-2.5 py-0.5 text-[12px] text-ink-2">
              {src === 'facilities' || facility ? 'Hub' : src === 'customers' ? 'Customer address' : 'Merchant address'}
            </span>
          )}
          {right}
        </span>}>{title}</SubTitle>
        {/* Grow has no hubs as addresses — a hub-coded pickup location is one of the merchant's own */}
        {inlineOf(role) && src !== 'facilities' && (merchantMode || !facility)
          ? inlineAddress(role, idx)
          : <>
        <div className={`grid gap-x-6 gap-y-4 ${split?.grid ?? ''}`}>
          <div className={`grid min-w-0 items-end gap-3 self-start ${src === 'facilities' || editing ? '' : 'grid-cols-[minmax(0,1fr)_auto]'}`}>
            {pickerFor(role, idx)}
            {src !== 'facilities' && !editing && <button type="button" onClick={() => openAddress(role, idx, true)}
              className="inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-md border border-brand-500 bg-surface px-3 text-[13px] text-brand-500 hover:bg-warm-50">
              <Plus size={14} />New address
            </button>}
          </div>
          <div className={`min-w-0 ${split?.pad ?? ''}`}>
            {/* owner, 2026-10-06: while the form is edited the pencil (and the link) open the pop-up to set up its fields —
                a hub picked as Ship From included; only a hub-only end has no address fields */}
            <AddressCard party={p} missing={missingOf(p, role)} invalid={invalidOf(p, role)}
              onEdit={editing ? (src !== 'facilities' ? () => openAddressSetup(role, idx) : undefined) : () => openAddress(role, idx, false)}
              editTip={editing ? 'Set up the address fields' : undefined} hubOnly={src === 'facilities'}
              tag={facility ? 'Saved' : at >= 0 ? book[at].tag ?? 'Saved' : role === 'from' && fromList ? 'Saved' : filled(p.name) ? 'New' : undefined} />
            {editing && src !== 'facilities' && (
              <button type="button" onClick={() => openAddressSetup(role, idx)}
                className="mt-2 inline-flex items-center gap-1 text-[12px] font-bold text-brand-500 hover:text-brand-600">
                <SlidersHorizontal size={12} />Set up the address fields
              </button>
            )}
            {((role === 'from' && fromKindBad) || (role === 'to' && idx === 0 && toKindBad)) && (
              <ErrLine className="mt-2">{src === 'facilities' ? 'Pick a hub — this end has no pickup / delivery leg.' : 'Pick an address — this end has a pickup / delivery leg.'}</ErrLine>
            )}
          </div>
        </div>
          </>}
      </div>
    )
  }
  /** "Fields on the form" (owner, 2026-10-05, the live Grow portal's Ship To): a search of the saved addresses, then
      CONTACT DETAILS and ADDRESS DETAILS in the card itself, "More address details", and Save this address. */
  const inlineAddress = (role: Role, idx: number) => {
    const p = partyOf(role, idx)
    const id = slotId(role, idx)
    const typed = typedHere(role, idx)
    const srcs = role === 'rto' ? (['merchant'] as Source[]) : sourcesOf(role)
    const what = srcs[0] === 'customers' ? 'address book' : 'your addresses'
    const kindBad = (role === 'from' && fromKindBad) || (role === 'to' && idx === 0 && toKindBad)
    const invalid = invalidOf(p, role)
    /* "Fields on the form" STAYS fields (owner, 2026-10-07: "when Ship To is selected with inline edit it should not convert into a
       card"): picking a saved address fills the inputs below the search and leaves them editable — it never folds into a read-back
       card (that is the OTHER choice, "Saved card"). */
    return (
      <div>
        <div className={`grid gap-x-6 gap-y-4 ${split?.grid ?? ''}`}>
        <div className="flex min-w-0 items-center gap-3 self-start">
          <div className="min-w-0 flex-1">
            <AddressSearch hits={hitsFor(role)} onPick={(h) => applyPick(role, idx, h.value)}
              placeholder={`Search ${what}${srcs.includes('facilities') ? ' or hubs' : ''}`} />
          </div>
          {(filled(p.name) || filled(p.line1)) && !editing && (
            <button type="button" onClick={() => clearParty(role, idx)}
              className="inline-flex h-8 shrink-0 items-center gap-1 rounded-md px-2 text-[13px] text-ink-2 hover:bg-warm-50 hover:text-ink">
              <X size={14} />Clear
            </button>
          )}
        </div>
        </div>
        {/* side by side: two columns in its half · one under the other: four across the card */}
        <div className="mt-6">
          <PartyBlock wide half={!stackAddr} party={p} set={patchParty(role, idx)} nameLabel={role === 'to' ? 'Customer Name' : 'Sender Name'}
            requireContact={role !== 'from' && contactReq} hid={hid} variant={role === 'rto' ? 'rto' : 'full'} />
        </div>
        {typed && !editing && (
          <div className="mt-6 inline-flex">
            <InlineSwitch label="Save this address" title={`It is listed in ${what} next time — saved when the consignment is`}
              checked={saveTyped.has(id)} onChange={(on) => setSaveTyped((xs) => { const n = new Set(xs); if (on) n.add(id); else n.delete(id); return n })} />
          </div>
        )}
        {invalid.length > 0 && <p className="mt-3 text-[12px] text-danger-fg">Check the format: {invalid.join(', ')}</p>}
        {kindBad && <ErrLine className="mt-2">Pick an address — this end has a pickup / delivery leg.</ErrLine>}
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
    <div className="mt-6 border-t border-warm-200 pt-4">
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
      {/* while the form is edited (setup) the pop-up is the address fields' preview: a click on a field opens its card above
          the dialog; Esc closes that card first, then the pop-up; closing puts the address back as it was */}
      <Modal open={!!addr && (!addr.setup || editing)} wide
        title={addr?.setup ? (addr.role === 'rto' ? 'Return address fields' : 'Address fields')
          : addr ? `${addr.isNew ? 'New' : 'Edit'} ${roleTitle[addr.role]}${addr.role === 'to' && allDrops.length > 1 ? ` · Address ${addr.idx + 1}` : ''}` : ''}
        subtitle={addr?.setup ? 'Click a field to change it. All addresses use these fields.'
          : addr?.role === 'from' ? 'Where the carrier collects the consignment.' : addr?.role === 'to' ? 'Who receives it, and where.' : 'Where it comes back if it cannot be delivered.'}
        onClose={addr?.setup ? () => (selKey ? setSelKey(null) : closeSetup()) : cancelAddress}
        footer={addr?.setup
          ? <>
              <span className="mr-auto"><InlineSwitch label="Show hidden fields" checked={showHidden} onChange={setShowHidden} /></span>
              <Button onClick={closeSetup}>Done</Button>
            </>
          : <><Button variant="outline" onClick={cancelAddress}>Cancel</Button><Button onClick={confirmAddress}>Use this address</Button></>}>
        {addr && (
          <div className="pb-4 pt-2">
            <PartyBlock grouped party={partyOf(addr.role, addr.idx)} set={patchParty(addr.role, addr.idx)}
              nameLabel={addr.role === 'to' ? 'Customer Name' : 'Sender Name'} requireContact={addr.role !== 'from' && contactReq} hid={hid}
              variant={addr.role === 'rto' ? 'rto' : 'full'} />
            {/* any address typed here can be kept — Ship From and Ship To alike */}
            {!addr.setup && (addr.isNew || valueOf(addr.role === 'rto' ? 'from' : addr.role, partyOf(addr.role, addr.idx)) === '') && (
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
    <p className="mt-6 flex flex-wrap items-center gap-x-1.5 rounded-lg bg-warm-50 px-4 py-3 text-[13px] text-ink-2">
      <b className="text-ink">Pickup is booked automatically</b>
      <span>· {fmtWin(autoWin)} ({autoRuleText})</span>
      {pickupCfg.autoPickup.slotConfirmation && <span>· you will be asked to confirm the slot</span>}
    </p>
  )) : pickupState === 'auto-ask' || (pickupState === 'manual' && !hid('addrWindow')) ? (
    <div className="mt-6">
      {/* the group's title carries required / optional once — its three fields carry no star of their own */}
      <div className="mb-2 flex items-center gap-3">
        <span className="text-[14px] font-bold text-ink">
          Pickup window{askWindow || need('addrWindow')
            ? <span className="text-danger-fg">&nbsp;*</span>
            : <span className="ml-1.5 text-[13px] font-normal text-ink-3" title="Leave it empty to book the pickup later from Shipments">· Optional</span>}
        </span>
        {pickupState === 'manual' && hasWindow && !need('addrWindow') && (
          <button type="button" onClick={() => setSender((x) => ({ ...x, windowStart: '', windowEnd: '' }))}
            className="text-[12px] font-bold text-brand-500 hover:text-brand-600">Clear</button>
        )}
      </div>
      <SlotWindowFields required={false} startAt={sender.windowStart ?? ''} endAt={sender.windowEnd ?? ''} policy={pickupPol} ok={slotOk}
        onChange={(w) => setSender((x) => ({ ...x, windowStart: w.startAt, windowEnd: w.endAt }))}
        error={windowErr || (showErrors && (askWindow || need('addrWindow')) && !hasWindow ? 'Choose a pickup date and time.' : null)} />
      {askWindow && (
        <p className="mt-1 text-[12px] text-ink-3">
          {`Booked automatically in this window · up to ${pickupCfg.bookingHorizonDays} days ahead · same-day cut-off ${pickupCfg.sameDayCutoff}`}
        </p>
      )}
    </div>
  ) : null
  const fromSide = <>
    {addressSlot('from', 0, 'Ship From')}
    {/* Grow's pickup window keeps to the left half when the ends are one under the other */}
    <div className={merchantMode && stackAddr ? '@min-[600px]:w-1/2 @min-[600px]:pr-3' : ''}>{merchantMode ? merchantPickupWindow : windowCells('from', 0)}</div>
    {typeRule.rto && (
      <div className="mt-6">
        <InlineSwitch label="RTO address same as Ship From address" title="If it can't be delivered, it comes back to the Ship From address"
          checked={(c.rtoMode ?? RTO_MODES[0]) === RTO_MODES[0]} onChange={(same) => setC({ rtoMode: same ? RTO_MODES[0] : RTO_MODES[1] })} />
      </div>
    )}
    {typeRule.rto && c.rtoMode === RTO_MODES[1] && <div className="mt-7">{addressSlot('rto', 0, 'Return To Origin (RTO) address')}</div>}
  </>
  const toSide = <>
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
      <div className="mt-6"><Configurable fieldKey="schedulingConfirmation">
        <InlineSwitch label={lbl('schedulingConfirmation')} title={SWITCH_HINTS.schedulingConfirmation} checked={!!c.schedulingConfirmation} onChange={(v) => setC({ schedulingConfirmation: v })} />
      </Configurable></div>
    )}
    {/* multi-drop is a dedicated-truck booking: every address needs a vehicle */}
    {(isFtl || (merchantMode && mode === 'ftl')) && <div className="mt-6"><AddMoreButton label="Add delivery address" onClick={() => setDrops((ds) => [...ds, blankParty()])} /></div>}
  </>
  /* while the form is edited: how the addresses are shown — card choices (owner, 2026-10-06) */
  const consoleLayout = growSetup && editing ? loadLayout('console') : null
  const addressLayoutPanel = editing && (
    <div className="mb-6 rounded-lg border border-dashed border-warm-300 p-4">
      <p className="mb-3 text-[13px] font-bold text-ink">How addresses are shown <span className="font-normal text-ink-3">— the same on every consignment</span></p>
      <div className="grid gap-3">
        {ADDRESS_LAYOUT_ROWS.map((row) => (
          <div key={row.key} className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <span className="flex w-28 shrink-0 items-center gap-1.5 text-[13px] text-ink-2">
              {row.label}
              {consoleLayout && draftLayout[row.key] !== consoleLayout[row.key] && (
                <Tip text="Changed for Grow — the console form differs"><span className={`${CHIP} bg-brand-50 font-bold text-brand-600`}>Grow</span></Tip>
              )}
            </span>
            <LayoutSeg label="" value={draftLayout[row.key]}
              onChange={(v) => setDraftLayout((l) => ({ ...l, [row.key]: v }) as FormLayout)}
              options={row.options.map((o) => ({ value: o.value, label: o.label, tip: o.sub }))} />
          </div>
        ))}
      </div>
    </div>
  )
  const partiesSection = (
    <FormCard id="sec-parties" title="Ship From → Ship To"
      caption={ctype === 'Transfer' ? 'Stock moving between two facilities — pick a hub at each end.'
        : anyInline ? 'Search a saved address, or type the address here.'
        : merchantMode ? 'Pick a saved address or add a new one.' : 'Pick a saved address or add a new one — Shipment legs decide whether each end is an address or a hub.'}>
      {addressLayoutPanel}
      {/* owner, 2026-10-06: Ship From | Ship To, one beside the other, however the addresses are entered (the second
          branch's combined card) — a container query, so they stack only when the CARD is narrow (the Summary beside the
          form, a pinned rail), never because of the viewport alone; or, by the builder's Layout, one under the other */}
      <div className="@container">
        {stackAddr
          ? (
            <div>
              <div className="min-w-0">{fromSide}</div>
              <div className="mt-10 min-w-0 border-t border-warm-200 pt-8">{toSide}</div>
            </div>
          )
          : (
            <div className="grid gap-y-10 @min-[720px]:grid-cols-2">
              <div className="min-w-0 @min-[720px]:pr-8">{fromSide}</div>
              <div className="min-w-0 border-t border-warm-200 pt-8 @min-[720px]:border-l @min-[720px]:border-t-0 @min-[720px]:pl-8 @min-[720px]:pt-0">{toSide}</div>
            </div>
          )}
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
    <div role="group" aria-label="Handling">
      {/* row 1 — what the goods are like: six pill chips */}
      {handlingChipsVisible && <div className="flex flex-wrap items-center gap-2">
        {arrange(sortApi, 'handling-chips', GOODS_CATEGORIES.filter(({ name }) => !hid(catKey(name))).map(({ name, icon: Icon }): RevealEntry => {
          const on = hasCat(name)
          return [null, (
            <Configurable key={name} fieldKey={catKey(name)}>
            <button type="button" aria-pressed={on} onClick={() => toggleCategory(name, !on)}
              className={`inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[13px] transition-colors
                ${on ? 'border-ink bg-warm-50 font-bold text-ink' : 'border-line bg-surface text-ink-2 hover:border-warm-300 hover:text-ink'}`}>
              <Icon size={14} className={on ? 'text-brand-500' : 'text-warm-400'} />{lbl(catKey(name))}
            </button>
            </Configurable>
          )]
        }), () => false, true, 'chips').nodes}
      </div>}
      {/* row 2 — how the boxes travel, and their tags; every control on one baseline */}
      {switchesRow && <div className={`${handlingChipsVisible ? 'mt-6' : ''} ${HANDLING_ROW}`}>
        {arrange(sortApi, 'handling-switches', [
          !hid('scannable') && [null, (
            <Configurable key="scannable" fieldKey="scannable">
              <InlineSwitch label={custom('scannable', 'Scannable', 'Barcode on every box')}
                title={barcodeEach || (!isFtl && !useItems) ? `${SWITCH_HINTS.scannable} On = every package line is one box; its quantity stays 1.` : SWITCH_HINTS.scannable}
                checked={!!c.scannable} onChange={setBarcodeAll} />
            </Configurable>
          )],
          !hid('splittable') && [null, (
            <Configurable key="splittable" fieldKey="splittable">
              <InlineSwitch label="Can be delivered in parts" title={SWITCH_HINTS.splittable}
                checked={!!c.splittable} onChange={(v) => setC({ splittable: v })} />
            </Configurable>
          )],
          !hid('clearanceRequired') && [null, (
            <Configurable key="clearanceRequired" fieldKey="clearanceRequired">
              <InlineSwitch label={lbl('clearanceRequired')} title={SWITCH_HINTS.clearanceRequired}
                checked={!!c.clearanceRequired} onChange={(v) => setC({ clearanceRequired: v })} />
            </Configurable>
          )],
          !hid('tags') && !merchantMode && [null, (
            <Configurable key="tags" fieldKey="tags">
              <div className="flex items-center gap-2.5">
                <span className="text-[13px] text-ink">{lbl('tags')}{need('tags') && <span className="text-danger-fg">&nbsp;*</span>}</span>
                <div className="w-56">
                  <MultiSelectDropdown size="sm" options={TAG_OPTIONS} values={c.tags ?? []} noun="tags" placeholder="Add tags" onChange={(v) => setC({ tags: v })} />
                </div>
              </div>
            </Configurable>
          )],
        ], () => false, true).nodes}
      </div>}
      {/* Grow (owner, 2026-10-06: "Tags and Dedicate Truck in one line"): the two as fields side by side, labels on top,
          the field grid's widths — Load type = the Dedicate Truck switch (on = a full vehicle, picked in Vehicle Details) */}
      {merchantMode && (!hid('tags') || !hid('dedicateTruck')) && (
        <div className={`${handlingChipsVisible || switchesRow ? 'mt-6' : ''} grid grid-cols-1 ${FIELD_GAPS} sm:grid-cols-[repeat(auto-fill,minmax(220px,1fr))]`}>
          {!hid('tags') && (
            <SFld fieldKey="tags" label={lbl('tags')} required={need('tags')}>
              <MultiSelectDropdown size="sm" options={TAG_OPTIONS} values={c.tags ?? []} noun="tags" placeholder="Add tags" onChange={(v) => setC({ tags: v })} />
            </SFld>
          )}
          {/* 2026-10-07: a builder field on Grow too — hidden, every order books the builder's default (shared unless set) */}
          {!hid('dedicateTruck') && (
            <SFld fieldKey="dedicateTruck" label={custom('dedicateTruck', 'Dedicate Truck', 'Load type')}>
              <SwitchBox icon={Truck} label="Dedicate Truck" checked={mode === 'ftl'} disabled={!!fromOverage || pr?.shipmentType === 'FTL' || truckHidden}
                onChange={(on) => changeMode(on ? 'ftl' : 'ltl')}
                title={mode === 'ftl' ? 'Full vehicle (FTL / FCL) — its vehicles are picked in Vehicle Details' : 'Shared vehicle (LTL / LCL) — switch on for a whole vehicle'} />
            </SFld>
          )}
        </div>
      )}
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
  /* a SKU line's columns — Unit Weight and Dimensions leave when the builder hides them (2026-10-07) */
  const skuWHid = hid('skuWeight')
  const skuDHid = hid('skuDimensions')
  /* a SKU line is ONE line (owner, 2026-10-07: "in SKU it should be in one line, in both Grow and the console"): every detail
     the builder shows and does NOT put under "More" (Grow: HSN Code · Origin Country · Unit Cost; any the console moves out
     of More) is a column of the line itself, headed like Unit Weight; the rest wait behind the chevron */
  const SKU_INLINE_ORDER = ['skuCategory', 'skuDescription', 'skuHsn', 'skuOrigin', 'skuUnitCost', 'skuImage'] as const
  const SKU_INLINE_W: Record<string, string> = { skuCategory: 'minmax(0,1fr)', skuDescription: 'minmax(0,1.2fr)', skuHsn: '112px', skuOrigin: 'minmax(0,1.1fr)', skuUnitCost: '112px', skuImage: 'minmax(0,1fr)' }
  const skuInline: string[] = SKU_INLINE_ORDER.filter((k) => !hid(k) && !inMore(k))
  const skuInlineLabel = (k: string) => (k === 'skuUnitCost' ? `${lbl(k)} (${currency})` : lbl(k))
  const SKU_COLS = 'grid items-start gap-x-3'
  const skuColsStyle = { gridTemplateColumns: ['28px', 'minmax(0,1.3fr)', 'minmax(0,1.4fr)', '84px', ...(skuWHid ? [] : ['104px']),
    ...(skuDHid ? [] : ['minmax(0,1.5fr)']), ...skuInline.map((k) => SKU_INLINE_W[k]), '80px', '96px'].join(' ') }
  const skuMinWidth = 860 + skuInline.length * 130
  /** picked from the SKU master (its name / size / weight came with it) vs typed by hand */
  const isMasterSku = (it: ParcelItem) => !!it.skuCode && masters.skus.some((sk) => sk.code === it.skuCode)
  /** a SKU line's details (owner, 2026-10-06: "Grow — HSN Code, Origin Country and Cost in the default view"): the ones not
      under "More" sit on the line's second row (Grow: HSN · Origin · Cost; the console: none); the rest wait behind the
      chevron at the line's end and open IN PLACE. `open` = the chevron is open (or the form is edited). */
  const skuDetails = (it: ParcelItem, patch: (p: Partial<ParcelItem>) => void, open: boolean, skipInline = false) => {
    const off = (k: string) => hid(k) || (skipInline && skuInline.includes(k))
    const r = arrange(sortApi, 'sku-details', [
      !off('skuCategory') && ['skuCategory', <F key="category" fieldKey="skuCategory" label={lbl('skuCategory')} value={it.category ?? ''}
        options={opts([...new Set([...masters.skus.map((sk) => sk.category).filter(Boolean), ...(it.category ? [it.category] : [])])])}
        onChange={(v) => patch({ category: v })} />, filled(it.category)],
      !off('skuDescription') && ['skuDescription', <F key="description" fieldKey="skuDescription" label={lbl('skuDescription')} value={it.description ?? ''}
        placeholder="eg, Water Bottle" onChange={(v) => patch({ description: v })} />, filled(it.description)],
      !off('skuHsn') && ['skuHsn', <F key="hsn" fieldKey="skuHsn" label={lbl('skuHsn')} value={it.hsnCode ?? ''} placeholder="eg, 851713"
        onChange={(v) => patch({ hsnCode: v })} />, filled(it.hsnCode)],
      !off('skuOrigin') && ['skuOrigin', <F key="origin" fieldKey="skuOrigin" label={lbl('skuOrigin')} value={it.originCountry ?? ''} placeholder="eg, Philippines" searchable
        options={opts([...new Set([...COUNTRIES, ...(it.originCountry ? [it.originCountry] : [])])])} onChange={(v) => patch({ originCountry: v })} />, filled(it.originCountry)],
      !off('skuUnitCost') && ['skuUnitCost', <FNum key="cost" fieldKey="skuUnitCost" label={`${lbl('skuUnitCost')} (${currency})`} blankZero placeholder="eg, 12.34"
        value={it.unitCost ?? 0} onChange={(n) => patch({ unitCost: n })} />, (it.unitCost ?? 0) > 0],
      !off('skuImage') && ['skuImage', <F key="image" fieldKey="skuImage" label={lbl('skuImage')} value={it.imageUrl ?? ''}
        onChange={(v) => patch({ imageUrl: v })} />, filled(it.imageUrl)],
    ], inMore, open)
    return { node: r.nodes.length ? <SGrid className="mt-5 pl-10">{r.nodes}</SGrid> : null, waiting: r.waiting, waitingFilled: r.waitingFilled }
  }
  /** one inline detail as a bare control (its header names it) — same inputs as the details grid */
  const skuInlineCell = (k: string, it: ParcelItem, patch: (p: Partial<ParcelItem>) => void): ReactNode => {
    switch (k) {
      case 'skuCategory': {
        const list = [...new Set([...masters.skus.map((sk) => sk.category).filter(Boolean), ...(it.category ? [it.category] : [])])]
        return <MenuSelect value={it.category ?? ''} placeholder="Select" options={list} onChange={(v) => patch({ category: v })} />
      }
      case 'skuDescription': return <Input value={it.description ?? ''} placeholder="eg, Water Bottle" onChange={(v) => patch({ description: v })} />
      case 'skuHsn': return <Input value={it.hsnCode ?? ''} placeholder="eg, 851713" onChange={(v) => patch({ hsnCode: v })} />
      case 'skuOrigin': return <MenuSelect value={it.originCountry ?? ''} placeholder="eg, Philippines" searchable
        options={[...new Set([...COUNTRIES, ...(it.originCountry ? [it.originCountry] : [])])]} onChange={(v) => patch({ originCountry: v })} />
      case 'skuUnitCost': return <NumBox blankZero placeholder="eg, 12.34" value={it.unitCost ?? 0} onChange={(n) => patch({ unitCost: n })} />
      default: return <Input value={it.imageUrl ?? ''} placeholder="https://" onChange={(v) => patch({ imageUrl: v })} />
    }
  }
  /** the chevron at a SKU line's end — what waits under its "More" */
  const skuMoreButton = (open: boolean, waiting: number, waitingFilled: number, label: string, onClick: () => void) => {
    const words = open ? 'Hide SKU details' : `More SKU details · ${plural(waiting, 'field')}${waitingFilled ? `, ${waitingFilled} filled` : ''}`
    return (
      <Tip text={words}><button type="button" aria-label={`${label} details`} aria-expanded={open} onClick={onClick}
        className="inline-flex h-8 w-7 items-center justify-center rounded-md border border-warm-200 text-ink-3 hover:bg-warm-50 hover:text-ink">
        {/* owner, 2026-09-29: a chevron only — the words are in the tooltip */}
        {open ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
      </button></Tip>
    )
  }
  const [itemMore, setItemMore] = useState<Set<string>>(new Set())

  /* Items (the Packages section hidden — SKU-based): one line per SKU — search, how many, done. Size and weight come from
     the SKU master and are asked only when the master has none; shown and typed in the list's units. */
  const iu = unitsOf(itemUnit)
  const ITEM_COLS = 'grid items-start gap-x-4'
  const itemColsStyle = { gridTemplateColumns: ['28px', 'minmax(0,2.2fr)', '112px', 'minmax(0,1.9fr)', ...skuInline.map((k) => SKU_INLINE_W[k]), '96px', '104px'].join(' ') }
  const itemTotals = itemParcels.reduce((t, p) => ({
    pieces: t.pieces + p.quantity, kg: t.kg + p.weight * p.quantity, cm3: t.cm3 + p.l * p.w * p.h * p.quantity,
  }), { pieces: 0, kg: 0, cm3: 0 })
  const itemsBlock = (
    <div>
      <div className="overflow-x-auto">
        <div style={{ minWidth: 760 + skuInline.length * 130 }}>
          <div className={`${ITEM_COLS} border-b border-warm-200 pb-2 text-[13px] text-ink-2`} style={itemColsStyle}>
            <span>#</span>
            <span>SKU<span className="text-danger-fg"> *</span></span>
            <span>Quantity<span className="text-danger-fg"> *</span></span>
            <span>Each unit</span>
            {skuInline.map((k) => <Configurable key={k} fieldKey={k}><span className="block truncate" title={skuInlineLabel(k)}>{skuInlineLabel(k)}</span></Configurable>)}
            <span className="text-right">Total</span>
            <span />
          </div>
          {lines.map((l, n) => {
            const it = l.item
            const picked = !!it.skuCode
            const dimsOk = (it.lengthCm ?? 0) > 0 && (it.widthCm ?? 0) > 0 && (it.heightCm ?? 0) > 0
            const weightOk = it.weightKg > 0
            /* only what the builder still asks (2026-10-07: a SKU's weight / size can be hidden or optional) */
            const askW = !skuWHid && !weightOk
            const askD = !skuDHid && !dimsOk
            /* a typed SKU has nothing from the master — its details start open */
            const open = itemMore.has(l.id) !== (picked && !isMasterSku(it))
            const det = picked ? skuDetails(it, (patch) => setLine(l.id, patch), open || editing, true) : null
            return (
              <div key={l.id} className="border-b border-warm-200 py-3 last:border-0">
              <div className={ITEM_COLS} style={itemColsStyle}>
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
                    : !askW && !askD
                      ? <span className="flex h-8 items-center text-[13px] text-ink-2">
                          {[weightOk && `${round2(iu.toW(it.weightKg))} ${iu.w}`, dimsOk && `${iu.toD(it.lengthCm ?? 0)} × ${iu.toD(it.widthCm ?? 0)} × ${iu.toD(it.heightCm ?? 0)} ${iu.d}`]
                            .filter(Boolean).join(' · ') || '—'}
                        </span>
                      : (
                        /* the SKU master has no size / weight for this SKU — ask only what is missing */
                        <div className={`grid gap-2 ${askW && askD ? 'grid-cols-[88px_minmax(0,1fr)]' : 'grid-cols-1'}`}>
                          {askW && <NumBox unit={iu.w} blankZero placeholder={iu.w} value={iu.toW(it.weightKg)} precision={iu.precision} error={err(need('skuWeight') && !weightOk)}
                            onChange={(w) => setLine(l.id, { weightKg: iu.fromW(w) })} />}
                          {askD && <DimsBox error={need('skuDimensions')} units={iu} l={it.lengthCm ?? 0} w={it.widthCm ?? 0} h={it.heightCm ?? 0}
                            onChange={(d) => setLine(l.id, { ...(d.l !== undefined ? { lengthCm: d.l } : {}), ...(d.w !== undefined ? { widthCm: d.w } : {}), ...(d.h !== undefined ? { heightCm: d.h } : {}) })} />}
                          <p className={`${askW && askD ? 'col-span-2' : ''} text-[12px] text-ink-3`}>Not in the SKU master — enter {askW && askD ? 'the weight and size' : askW ? 'the weight' : 'the size'} of one unit.</p>
                        </div>
                      )}
                </div>
                {skuInline.map((k) => <div key={k} className="min-w-0">{picked ? skuInlineCell(k, it, (patch) => setLine(l.id, patch)) : null}</div>)}
                <span className="flex h-8 items-center justify-end text-[13px] tabular-nums text-ink">
                  {picked && weightOk && it.quantity ? `${round2(iu.toW(it.weightKg * it.quantity))} ${iu.w}` : '-'}
                </span>
                <span className="flex items-center justify-end gap-1">
                  {det && det.waiting > 0 && !editing && skuMoreButton(open, det.waiting, det.waitingFilled, `SKU line ${n + 1}`, () => setItemMore((st) => flip(st, l.id)))}
                  <Tip text="Remove SKU"><button type="button" aria-label={`Remove SKU line ${n + 1}`} onClick={() => removeLine(l.id)}
                    className="inline-flex h-8 w-7 items-center justify-center rounded-md text-ink-3 hover:bg-warm-100 hover:text-brand-500">
                    <Trash2 size={14} />
                  </button></Tip>
                </span>
              </div>
              {det?.node}
              </div>
            )
          })}
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <AddRowLink label="Add SKU" onClick={addLine} />
        <span className="text-[13px] text-ink-2">
          {itemTotals.pieces
            ? <>{plural(itemTotals.pieces, 'piece')} · {round2(iu.toW(itemTotals.kg))} {iu.w} · {iu.vol(itemTotals.cm3)} — each unit ships as its own piece</>
            : 'Search the SKU master, or type any code — a new SKU asks for its name, size and weight'}
        </span>
      </div>
      {itemParcels.length === 0 && <ErrLine className="mt-2">Pick at least one SKU.</ErrLine>}
    </div>
  )
  /* ---- Package & SKU (owner, 2026-09-29; 2026-10-06: no "How goods are entered" — the builder hides the SKUs or the
     packages instead): each package with its SKUs, and every Add button BELOW what it adds to — Add SKU under its SKUs,
     Add Package under all the packages. A package's units (kg + cm or lb + in) sit in its header; its SKUs follow. */
  const skuTable = (rows: ReactNode, u: Units) => (
    <div className="overflow-x-auto">
      <div style={{ minWidth: skuMinWidth }}>
        <div className={`${SKU_COLS} border-b border-warm-200 pb-2 text-[13px] text-ink-2`} style={skuColsStyle}>
          <span>#</span>
          <span>SKU Code<span className="text-danger-fg"> *</span></span>
          <span>Name<span className="text-danger-fg"> *</span></span>
          <span>Quantity<span className="text-danger-fg"> *</span></span>
          {!skuWHid && <Configurable fieldKey="skuWeight"><span>{ownLbl('skuWeight', 'Unit Weight')}{need('skuWeight') && <span className="text-danger-fg"> *</span>}</span></Configurable>}
          {!skuDHid && <Configurable fieldKey="skuDimensions"><span>{ownLbl('skuDimensions', 'Dimensions')} ({u.d}){need('skuDimensions') && <span className="text-danger-fg"> *</span>}</span></Configurable>}
          {skuInline.map((k) => <Configurable key={k} fieldKey={k}><span className="block truncate" title={skuInlineLabel(k)}>{skuInlineLabel(k)}</span></Configurable>)}
          <span className="text-right">Total</span>
          <span />
        </div>
        {rows}
      </div>
    </div>
  )
  /** one SKU line — code (master or typed) · name · quantity · unit weight · L × W × H · total · details, in its package's
      units. `preview` = the builder's SAMPLE line (owner, 2026-10-05: "one should be shown, otherwise I have to click Add
      before I can configure them"): every column and the details show, and nothing is written. */
  const skuRow = (it: ParcelItem, i: number, k: number, n: number, preview = false) => {
    const key = preview ? `sample:${i}` : `${i}:${k}`
    const u = unitsOf(parcels[i])
    const upd = (patch: Partial<ParcelItem>) => { if (!preview) setItem(i, k, patch) }
    const open = skuMore.has(key) !== (!!it.skuCode && !isMasterSku(it))
    const det = skuDetails(it, upd, open || editing, true)
    const missing = [!it.skuCode && 'SKU code', !filled(it.name) && 'name', !(it.quantity >= 1) && 'quantity',
      need('skuWeight') && !(it.weightKg > 0) && 'weight',
      need('skuDimensions') && !((it.lengthCm ?? 0) > 0 && (it.widthCm ?? 0) > 0 && (it.heightCm ?? 0) > 0) && 'dimensions']
      .filter(Boolean) as string[]
    const vol = (it.lengthCm ?? 0) * (it.widthCm ?? 0) * (it.heightCm ?? 0)
    return (
      <div key={key} className={`relative border-b border-warm-200 py-3 last:border-0 ${preview ? 'rounded-md bg-warm-25' : ''}`}>
        {preview && (
          <span className="pointer-events-none absolute -top-2 left-9 z-10 rounded-full border border-line bg-surface px-1.5 text-[11px] leading-4 text-ink-3">
            Sample line — how a SKU is entered (not saved)
          </span>
        )}
        <div className={SKU_COLS} style={skuColsStyle}>
          <span className="flex h-8 items-center text-[13px] text-ink-3">{n + 1}</span>
          <SkuCode item={it} skus={masters.skus} onPick={(sk) => { if (!preview) pickSku(i, k, sk) }} onUnlink={() => upd({ skuCode: null })}
            onCustom={(code) => upd({ skuCode: code })} autoFocus={!preview && focusLine?.i === i && focusLine.k === k} />
          {/* a master SKU's name comes with it; a typed one is yours to name */}
          <Input value={it.name} placeholder="eg, Refrigerator 300 L" disabled={isMasterSku(it)} onChange={(v) => upd({ name: v })} />
          <NumBox integer min={1} blankZero placeholder="1" value={it.quantity} error={err(it.quantity < 1)} onChange={(q) => upd({ quantity: q })} />
          {!skuWHid && <NumBox unit={u.w} blankZero placeholder="0" value={u.toW(it.weightKg)} precision={u.precision} error={err(need('skuWeight') && !(it.weightKg > 0))}
            onChange={(w) => upd({ weightKg: u.fromW(w) })} />}
          {!skuDHid && <DimsBox units={u} l={it.lengthCm ?? 0} w={it.widthCm ?? 0} h={it.heightCm ?? 0} error={need('skuDimensions')}
            onChange={(d) => upd({ ...(d.l !== undefined ? { lengthCm: d.l } : {}), ...(d.w !== undefined ? { widthCm: d.w } : {}), ...(d.h !== undefined ? { heightCm: d.h } : {}) })} />}
          {skuInline.map((k) => <div key={k} className="min-w-0">{skuInlineCell(k, it, upd)}</div>)}
          <span className="flex min-h-8 flex-col items-end justify-center text-[13px] tabular-nums text-ink-2">
            <span>{it.weightKg && it.quantity ? `${round2(u.toW(it.weightKg * it.quantity))} ${u.w}` : '-'}</span>
            {vol * it.quantity > 0 && <span className="text-[12px] text-ink-3">{u.vol(vol * it.quantity)}</span>}
          </span>
          <span className="flex items-center justify-end gap-1">
            {det.waiting > 0 && !editing && skuMoreButton(open, det.waiting, det.waitingFilled, `SKU ${n + 1}`, () => setSkuMore((st) => flip(st, key)))}
            <Tip text="Remove SKU"><button type="button" aria-label={`Remove SKU ${n + 1}`} onClick={() => { if (!preview) removeItem(i, k) }}
              className="inline-flex h-8 w-7 items-center justify-center rounded-md text-ink-3 hover:bg-warm-100 hover:text-brand-500">
              <Trash2 size={14} />
            </button></Tip>
          </span>
        </div>
        {missing.length > 0 && !preview && <ErrLine className="mt-1.5 pl-10">Required: {missing.join(', ')}</ErrLine>}
        {det.node}
      </div>
    )
  }
  /** a new Package Id, kept once the box is left — the open package and its card follow it; never blank, never another's */
  const renamePackage = (i: number, id: string) => {
    const old = parcels[i]?.packageId
    if (!old || id === old) return
    if (parcels.some((x, j) => j !== i && x.packageId === id)) { toast.error(`Package Id ${id} is already used by another package`); return }
    setParcel(i, { packageId: id })
    if (openPkgId === old) setOpenPkgId(id)
  }
  /** a package's own fields — type · quantity · L × W × H · weight (+ tracking / Package Id / description / pallet in place),
      in the package's units */
  const packageFields = (p: Parcel, i: number, below?: ReactNode, adder?: ReactNode) => {
    const isCustom = packageValue(p, packageTypes) === CUSTOM_PACKAGE
    const u = unitsOf(p)
    /* owner, 2026-10-06 ("reduce quantity and weight width; Package Id in the line without expanding"): one wrapping row,
       each field its own width — Quantity and Weight narrow */
    const PKG_KEY: Record<string, string> = { type: 'pkgType', qty: 'pkgQty', dims: 'pkgDimensions', weight: 'pkgWeight' }
    /* the builder's Width in the package's line: S = the field's own size · M / L = wider · Full = the whole line */
    const PKG_WIDE = { m: 'flex-[1_1_200px] max-w-[320px]', l: 'flex-[1.6_1_280px] max-w-[460px]', full: 'flex-[1_1_100%] max-w-none' }
    const cell = (id: string) => {
      const w = rules[PKG_KEY[id] ?? id]?.width
      return `max-sm:basis-full ${w && w !== 's' ? PKG_WIDE[w] : PKG_CELL[id] ?? PKG_CELL.other}`
    }
    const r = arrange(sortApi, 'package', [
      /* 2026-10-07: every package field is a builder field — Package Type hidden = a Custom package (its size typed),
         Quantity hidden = one box per line, weight / size hidden = not asked */
      !hid('pkgType') && ['pkgType', <div key="type" className={cell('type')} title={packageTypeTitle}>
        <F fieldKey="pkgType" label={lbl('pkgType')} required value={packageValue(p, packageTypes)} options={packageTypeOpts} onChange={(v) => pickPackageType(i, v)} />
      </div>, true],
      /* "Barcode on every box" on (the Handling switch): a line is ONE box — its quantity stays 1 */
      !hid('pkgQty') && ['pkgQty', <div key="qty" className={cell('qty')} title={barcodeEach ? 'One box with its own barcode — Barcode on every box is on' : undefined}>
        <FNum fieldKey="pkgQty" label={lbl('pkgQty')} required integer min={1} blankZero placeholder="eg, 1" value={p.quantity}
          error={err(!(p.quantity > 0))} disabled={barcodeEach && p.quantity <= 1} onChange={(q) => setParcel(i, { quantity: q })} />
      </div>, true],
      /* a preset's size IS its master row — typed only for a Custom package */
      !hid('pkgDimensions') && ['pkgDimensions', <div key="dims" className={cell('dims')}>
        <SFld fieldKey="pkgDimensions" label={`${ownLbl('pkgDimensions', 'Dimensions')} (${u.d})`} required={isCustom && need('pkgDimensions')}
          error={isCustom && need('pkgDimensions') && !(p.l > 0 && p.w > 0 && p.h > 0)} helper={isCustom ? undefined : 'From the package type'}>
          {isCustom ? <DimsBox units={u} l={p.l} w={p.w} h={p.h} error={need('pkgDimensions')} onChange={(d) => setParcel(i, d)} />
            : <ReadBox value={`${u.toD(p.l)} × ${u.toD(p.w)} × ${u.toD(p.h)}`} />}
        </SFld>
      </div>, p.l > 0],
      !hid('pkgWeight') && ['pkgWeight', <div key="weight" className={cell('weight')}>
        <FNum fieldKey="pkgWeight" label={`${ownLbl('pkgWeight', 'Weight')} (${u.w})`} required={need('pkgWeight')} placeholder="eg, 10" blankZero value={u.toW(p.weight)} precision={u.precision}
          error={err(need('pkgWeight') && !(p.weight > 0))} onChange={(w) => setParcel(i, { weight: u.fromW(w), weightMode: 'manual' })} />
      </div>, p.weight > 0],
      !hid('pkgTracking') && ['pkgTracking', <div key="tr" className={cell('tr')}>
        <F fieldKey="pkgTracking" label={lbl('pkgTracking')} value={p.trackingNumber ?? ''} disabled={!!fromOverage && i === 0}
          helper={fromOverage && i === 0 ? 'The overage scan barcode' : undefined} onChange={(v) => setParcel(i, { trackingNumber: v })} />
      </div>, filled(p.trackingNumber)],
      /* owner, 2026-10-06: optional (one is minted for every package); Grow keeps it under "More package details" */
      !hid('pkgId') && ['pkgId', <div key="pid" className={cell('pid')}>
        <SFld fieldKey="pkgId" label={lbl('pkgId')}>
          <CommitBox key={p.packageId} value={p.packageId ?? ''} onCommit={(v) => renamePackage(i, v)} />
        </SFld>
      </div>],
      !hid('pkgDescription') && ['pkgDescription', <div key="de" className={cell('de')}>
        <F fieldKey="pkgDescription" label={lbl('pkgDescription')} value={p.description ?? ''} onChange={(v) => setParcel(i, { description: v })} />
      </div>, filled(p.description)],
      !hid('pkgPalletSpace') && ['pkgPalletSpace', <div key="ps" className={cell('ps')}>
        <F fieldKey="pkgPalletSpace" label={lbl('pkgPalletSpace')} value={p.palletSpace ?? ''} placeholder="eg, 10" onChange={(v) => setParcel(i, { palletSpace: v })} />
      </div>, filled(p.palletSpace)],
    ], inMore, secOpen(`pkg:${i}`), undefined, cell)
    return (
      <>
        {/* owner, 2026-09-29: the package's details chevron sits IN its field row (at the end, level with the
            inputs: label 20 + 6px gap, then centred on the 32px control) — like a SKU row's chevron */}
        <div className="relative">
        <div className={`flex flex-wrap items-start ${FIELD_GAPS} pr-10`}>{r.nodes}</div>
        <RevealToggle open={secOpen(`pkg:${i}`)} onToggle={() => toggleSec(`pkg:${i}`)} waiting={r.waiting} waitingFilled={r.waitingFilled}
          label="package details" iconOnly className="absolute right-1 top-7" />
        </div>
        {below}
        {adder && <div className="mt-4">{adder}</div>}
      </>
    )
  }
  /* ---- the package list (owner, 2026-10-05: "show package and SKU info in less space — 100 packages is too much
     scroll; and what if every field is shown"): ONE package is open for editing; every other one is a single
     row — its type · count × size · weight · SKUs, the total on the right, "Incomplete" after an Add attempt.
     Click a row to open it (the open one folds). The open card carries its totals and its units in its header (no
     footer row), Duplicate (a copy right below — the quick way to many similar boxes) and Remove. Past PKG_PAGE rows the
     list stops at "Show all". However many fields the builder shows, they live only in the open package. */
  const firstPkgId = parcels[0]?.packageId ?? '0'
  /* the builder's preview always has a package open (its fields are what gets clicked) */
  const openId = parcels.length === 1 ? firstPkgId : openPkgId ?? (editing ? firstPkgId : null)
  const pkgIdOf = (p: Parcel, i: number) => p.packageId ?? String(i)
  const skusOf = (p: Parcel) => (p.items ?? []).filter((it) => !isBlankItem(it))
  /* a new package takes the last one's units */
  const addParcel = () => {
    const np: Parcel = { ...newParcel(), barcodeEach, ...(() => { const l = parcels[parcels.length - 1]; return l ? { unitSystem: l.unitSystem, weightUnit: l.weightUnit, dimUnit: l.dimUnit } : {} })() }
    setFocusLine(null); setParcels((ps) => [...ps, np]); setOpenPkgId(np.packageId ?? null)
  }
  /** a copy right below — new id, no tracking number (it is per box); its SKUs and units too */
  const duplicateParcel = (i: number) => {
    const src = parcels[i]
    if (!src) return
    const copy: Parcel = { ...src, packageId: newPackageId(), trackingNumber: '', items: separateLayout ? [] : (src.items ?? []).map((it) => ({ ...it })) }
    setParcels((ps) => [...ps.slice(0, i + 1), copy, ...ps.slice(i + 1)])
    setOpenPkgId(copy.packageId ?? null)
  }
  const pkgLine = (p: Parcel) => {
    const u = unitsOf(p)
    const items = skusOf(p)
    const type = packageValue(p, packageTypes) === CUSTOM_PACKAGE ? 'Custom' : p.packageTypeName
    return [type, `${p.quantity || 0} × ${u.toD(p.l)} × ${u.toD(p.w)} × ${u.toD(p.h)} ${u.d}`, p.weight ? `${round2(u.toW(p.weight))} ${u.w} each` : 'no weight',
      skusAsked && items.length ? `${plural(items.length, 'SKU')}: ${items.map((it) => it.skuCode || it.name).join(', ')}` : '',
      filled(p.trackingNumber) ? `#${p.trackingNumber}` : ''].filter(Boolean).join(' · ')
  }
  const packageCard = (p: Parcel, i: number, body: ReactNode) => {
    const id = pkgIdOf(p, i)
    const open = id === openId
    const many = parcels.length > 1
    const bad = showErrors && !pkgOk(p)
    const u = unitsOf(p)
    const total = p.weight ? `${round2(u.toW(p.weight * p.quantity))} ${u.w}` : '-'
    const actions = (
      <span className="flex shrink-0 items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
        {/* owner, 2026-10-06: the package's units — its weight, its size and its SKUs follow */}
        {open && !separateLayout && <span className="mr-2"><UnitPick units={u} label={`Package ${i + 1} units`} onChange={(patch) => setParcel(i, patch)} /></span>}
        {!editing && <Tip text="Duplicate — a copy right below"><button type="button" aria-label={`Duplicate package ${i + 1}`} onClick={() => duplicateParcel(i)}
          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-ink-3 hover:bg-warm-100 hover:text-ink">
          <Copy size={14} />
        </button></Tip>}
        {many && <Tip text={separateLayout ? 'Remove package — its SKUs move to the first package' : 'Remove package'}><button type="button"
          aria-label={`Remove package ${i + 1}`} onClick={() => removeParcel(i)}
          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-ink-3 hover:bg-warm-100 hover:text-brand-500">
          <CircleMinus size={14} />
        </button></Tip>}
        {many && <button type="button" aria-label={open ? `Fold package ${i + 1}` : `Open package ${i + 1}`} aria-expanded={open}
          onClick={() => setOpenPkgId(open ? null : id)}
          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-ink-2 hover:bg-warm-100 hover:text-ink">
          {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>}
      </span>
    )
    if (!open) return (
      <div key={id} role="button" tabIndex={0} aria-label={`Package ${i + 1} — open`} onClick={() => setOpenPkgId(id)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpenPkgId(id) } }}
        className={`mt-1.5 flex cursor-pointer items-center gap-4 rounded-lg border bg-surface py-1 pl-4 pr-2 transition-colors first:mt-0 hover:border-warm-400
          focus:outline-none focus-visible:ring-[3px] focus-visible:ring-brand-500/20 ${bad ? 'border-danger-fg/50' : 'border-warm-200'}`}>
        <span className="w-[84px] shrink-0 text-[13px] font-bold text-ink">Package {i + 1}</span>
        <span className="min-w-0 flex-1 truncate text-[13px] text-ink-2" title={pkgLine(p)}>{pkgLine(p)}</span>
        {bad && <span className="shrink-0 rounded-full bg-danger-bg px-2 text-[11px] font-bold leading-5 text-danger-fg">Incomplete</span>}
        <span className="w-20 shrink-0 text-right text-[13px] tabular-nums text-ink">{total}</span>
        {actions}
      </div>
    )
    const vol = p.l * p.w * p.h
    const n = skusOf(p).length
    return (
      <div key={id} className="mt-2 overflow-hidden rounded-lg border border-warm-200 first:mt-0">
        <div className={`flex items-center gap-4 bg-warm-50 py-1.5 pl-4 pr-2 ${many ? 'cursor-pointer' : ''}`}
          onClick={many ? () => setOpenPkgId(null) : undefined}>
          <span className="shrink-0 text-[13px] font-bold text-ink">Package {i + 1}</span>
          <span className="min-w-0 flex-1 truncate text-[12px] text-ink-3">
            {['Total ' + total, vol ? `${round2(u.toV(vol * p.quantity)).toLocaleString()} ${u.d}³` : '', skusAsked ? plural(n, 'SKU') : ''].filter(Boolean).join(' · ')}
          </span>
          {actions}
        </div>
        <div className="px-4 py-5">{body}</div>
      </div>
    )
  }
  /** the package rows on screen: the first PKG_PAGE, plus the open one and any incomplete one, until "Show all" */
  const pkgShown = (p: Parcel, i: number) => allPkgs || parcels.length <= PKG_PAGE + 1 || i < PKG_PAGE
    || pkgIdOf(p, i) === openId || (showErrors && !pkgOk(p))
  const hiddenPkgs = parcels.filter((p, i) => !pkgShown(p, i)).length
  const packageList = (body: (p: Parcel, i: number) => ReactNode) => (
    <div>
      {parcels.map((p, i) => (pkgShown(p, i) ? packageCard(p, i, body(p, i)) : null))}
      {(hiddenPkgs > 0 || (allPkgs && parcels.length > PKG_PAGE + 1)) && (
        <button type="button" onClick={() => setAllPkgs((v) => !v)}
          className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-warm-300 py-2 text-[13px] font-bold text-ink-2 hover:border-warm-400 hover:text-ink">
          {hiddenPkgs > 0 ? <>Show all {parcels.length} packages <span className="font-normal text-ink-3">({hiddenPkgs} more)</span><ChevronDown size={14} /></>
            : <>Show fewer<ChevronUp size={14} /></>}
        </button>
      )}
    </div>
  )
  const pieces = parcels.reduce((n, p) => n + (p.quantity || 0), 0)
  /* the total in lb when every package is in lb, else kg */
  /* the total in the packages' unit when they all share one, else kg */
  const barU = parcels.length && parcels.every((p) => unitsOf(p).w === unitsOf(parcels[0]).w) ? unitsOf(parcels[0]) : METRIC
  const addPackageBar = (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
      <AddMoreButton label="Add Package" onClick={addParcel} />
      {/* one package: its header already carries the totals */}
      {parcels.length > 1 && (
        <span className="text-[13px] text-ink-2">
          {plural(pieces, 'piece')} · {round2(barU.toW(parcels.reduce((n, p) => n + (p.weight || 0) * (p.quantity || 0), 0)))} {barU.w} in {plural(parcels.length, 'package')}
        </span>
      )}
    </div>
  )
  /* the separate list stops at PKG_PAGE + 2 lines until "Show all" — an incomplete line (after an Add attempt) and the
     line just added always show */
  const skuShown = (it: ParcelItem, i: number, k: number, n: number) => allSkus || skuLines.length <= PKG_PAGE + 3 || n < PKG_PAGE + 2
    || (focusLine?.i === i && focusLine.k === k) || (showErrors && !(skuLineOk(it) && skuRuleOk(it)))
  /* the SKU list in its own order (a SKU a package picks keeps its place) */
  const sepLines = sepSort(skuLines, (l) => l.it)
  const hiddenSkus = sepLines.filter(({ it, i, k }, n) => !skuShown(it, i, k, n)).length
  /* "SKUs in this package": Package 1 holds every SKU not put in another package; any other package ticks the SKUs packed in it */
  const packable = sepLines.filter(({ it }) => !isBlankItem(it))
  const packLabel = (it: ParcelItem) => {
    const n = sepLines.findIndex((l) => l.it === it)
    return `${n + 1} · ${it.skuCode || it.name || 'SKU'}${it.skuCode && filled(it.name) ? ` — ${it.name}` : ''} × ${it.quantity || 0}`
  }
  const packPicker = (p: Parcel, i: number) => {
    const mine = skusOf(p)
    const names = mine.map((it) => it.skuCode || it.name).join(', ')
    if (parcels.length === 1 || i === 0) return (
      <p className="mt-4 text-[13px] text-ink-2">
        <span className="font-bold text-ink">{parcels.length === 1 ? 'Holds every SKU' : 'Holds every SKU not put in another package'}</span>
        {names ? ` — ${names}` : packable.length ? '' : ' — list the SKUs above'}
      </p>
    )
    return (
      <div className="mt-5 lg:w-1/2">
        <p className="mb-1.5 field-label">SKUs in this package</p>
        <MultiSelectDropdown options={packable.map(({ it }) => packLabel(it))} values={mine.map(packLabel)} noun="SKUs" searchPlaceholder="Search the SKUs above"
          placeholder={packable.length ? 'Pick the SKUs packed in it' : 'List the SKUs above first'}
          onChange={(vals) => packInto(i, vals.map((v) => packable.find(({ it }) => packLabel(it) === v)?.it).filter((x): x is ParcelItem => !!x))} />
        <p className="mt-1 text-[12px] text-ink-3">A SKU you take out goes back to Package 1.</p>
      </div>
    )
  }
  /* the separate list's one unit: every package shares it (the SKU list sits above all of them) */
  const sepUnits = unitsOf(parcels[0])
  const setAllUnits = (patch: { weightUnit?: WeightUnit; dimUnit?: DimUnit }) => setParcels((ps) => ps.map((x) => ({ ...x, ...patch })))
  /* SKUs, then packages: the SKU list, then the boxes — each box picks what is packed in it */
  const separateBlock = (
    <div>
      <SubTitle>SKUs</SubTitle>
      {sepLines.length > 0
        ? skuTable(sepLines.map(({ it, i, k }, n) => (skuShown(it, i, k, n) ? skuRow(it, i, k, n) : null)), sepUnits)
        : editing ? skuTable(skuRow(blankItem(), 0, 0, 0, true), sepUnits) : null}
      <div className="mt-2 flex flex-wrap items-center gap-x-6 gap-y-2">
        <AddRowLink label="Add SKU" onClick={() => addItem(0)} />
        {(hiddenSkus > 0 || (allSkus && skuLines.length > PKG_PAGE + 2)) && (
          <button type="button" onClick={() => setAllSkus((v) => !v)}
            className="inline-flex items-center gap-1 text-[13px] font-bold text-ink-2 hover:text-ink">
            {hiddenSkus > 0 ? <>Show all {skuLines.length} SKUs <span className="font-normal text-ink-3">({hiddenSkus} more)</span><ChevronDown size={14} /></>
              : <>Show fewer SKUs<ChevronUp size={14} /></>}
          </button>
        )}
      </div>
      <div className="mt-8"><SubTitle>Packages</SubTitle></div>
      {packageList((p, i) => <>
        {packageFields(p, i)}
        {packPicker(p, i)}
      </>)}
      {addPackageBar}
    </div>
  )
  /* each package: its fields, then (unless the builder hid the SKUs) its SKUs and Add SKU under them */
  const packagesBlock = (
    <div>
      {packageList((p, i) => packageFields(p, i,
        !skusAsked ? null
          : (p.items ?? []).length > 0 ? <div className="mt-6">{skuTable((p.items ?? []).map((it, k) => skuRow(it, i, k, k)), unitsOf(p))}</div>
          /* the builder shows a sample SKU line, so its fields can be set without adding one */
          : editing ? <div className="mt-6">{skuTable(skuRow(blankItem(), i, 0, 0, true), unitsOf(p))}</div> : null,
        skusAsked ? <AddRowLink label="Add SKU" onClick={() => addItem(i)} /> : undefined))}
      {addPackageBar}
    </div>
  )
  /* while the form is edited: the card's two sections, each with its eye (owner, 2026-10-06: "in the form builder we can
     hide the SKU section or the package section") — they stay here when hidden, so they can come back */
  const sectionChip = (k: string, icon: ReactNode) => (
    <Configurable key={k} fieldKey={k}>
      <span className="inline-flex h-8 items-center gap-1.5 rounded-md border border-warm-300 bg-surface px-3 text-[13px] text-ink">{icon}{lbl(k)}</span>
    </Configurable>
  )
  const packagesSection = (
    <FormCard id="sec-packages" title="Package & SKU"
      caption={typeRule.goodsOptional ? 'Parts or goods to carry for the visit — optional for a Service.'
        : useItems ? 'Pick the SKUs and how many — sizes and weights come from the SKU master, or type a new SKU.'
        : !skusAsked ? 'Each package — its type, size and weight.'
        : separateLayout ? 'List the SKUs, then the packages — each package picks the SKUs packed in it.'
        : "Each package, and the SKUs packed in it. A package's weight adds up from its type and SKUs unless you type one."}
      action={useItems && !editing ? <UnitPick units={iu} onChange={(patch) => setItemUnit((x) => ({ ...x, ...patch }))} label="Units of the SKUs" />
        : separateLayout && !editing ? <UnitPick units={sepUnits} onChange={setAllUnits} label="Units of the SKUs and packages" /> : undefined}>
      {editing && !isFtl && (
        <div className="mb-6 flex flex-wrap items-center gap-x-5 gap-y-3 rounded-lg border border-dashed border-warm-300 px-4 pb-3 pt-4">
          <span className="text-[13px] font-bold text-ink">Sections</span>
          {sectionChip(PKG_SECTION, <Package size={14} className="text-ink-3" />)}
          {sectionChip(SKU_SECTION, <Barcode size={14} className="text-ink-3" />)}
          {!pkgOff && !skuOff && (
            <LayoutSeg label="SKU list" value={layout.skuList} onChange={(v) => setDraftLayout((l) => ({ ...l, skuList: v }))} options={[
              { value: 'under', label: 'Under each package', tip: 'Each package, with its SKUs right under it' },
              { value: 'separate', label: 'Separate list', tip: 'The SKU list first, then the packages — each package picks its SKUs' },
            ]} />
          )}
          <span className="text-[12px] text-ink-3">
            {pkgOff ? 'SKUs and how many — the packages are worked out' : skuOff ? 'Packages only — no SKUs'
              : layout.skuList === 'separate' ? 'The SKU list first, then the packages' : 'Each package with its SKUs'}
          </span>
        </div>
      )}
      {useItems ? itemsBlock : separateLayout ? separateBlock : packagesBlock}
    </FormCard>
  )

  /* ------------------------------------------------------------ 3b · Vehicle Details — the second branch's vehicle
     selection (owner, 2026-10-06), shared by the console's full-truck form and Grow's Dedicate Truck: one line per vehicle
     type — how many, the estimated load, the Ship To addresses it serves; the console reads the vehicle master, Grow the
     Ship From hub's fleet (with its rate per vehicle) */
  const addressLabels = addressOptions.map((o) => o.label)
  type VehicleChoice = { code: string; name: string; capacity?: string; rate?: number }
  const vehicleTable = (types: VehicleChoice[], payload: (code: string) => number) => {
    const typeOf = (code: string) => types.find((t) => t.code === code)
    const vs = vehicles.filter((v) => !!v.vehicleType)
    const load = totalLoadKg(vs)
    const cap = vs.reduce((n, v) => n + payload(v.vehicleType), 0)
    const over = vs.filter((v) => payload(v.vehicleType) > 0 && v.actualLoadKg > payload(v.vehicleType))
    const notServed = allDrops.map((_, i) => i).filter((i) => !vs.some((v) => v.addressIdx.includes(i)))
    return (
      <>
        <div className="rounded-lg border border-warm-200">
          <div className="grid grid-cols-[1.4fr_120px_150px_1.3fr_32px] gap-3 rounded-t-lg bg-warm-50 px-4 py-3 text-[13px] text-ink">
            <span>Vehicle Type<span className="text-danger-fg"> *</span></span><span>No. of Vehicles<span className="text-danger-fg"> *</span></span>
            <span>Est. Load<span className="text-danger-fg"> *</span></span><span>Deliver To<span className="text-danger-fg"> *</span></span><span />
          </div>
          {rows.map((r, i) => {
            const each = payload(r.vehicleType)
            const rowCap = each * Math.max(1, r.count)
            const heavy = rowCap > 0 && r.loadKg > rowCap
            const t = typeOf(r.vehicleType)
            const note = [each ? `Up to ${each.toLocaleString()} kg each` : t?.capacity || 'Capacity not configured',
              t?.rate ? `${money(t.rate, currency)} / vehicle` : ''].filter(Boolean).join(' · ')
            return (
              <div key={i} className="grid grid-cols-[1.4fr_120px_150px_1.3fr_32px] items-start gap-3 border-t border-warm-200 px-4 py-3">
                <div className="min-w-0">
                  <MenuSelect value={r.vehicleType} placeholder={types.length ? 'eg, 8 Ton Truck' : 'Enter Ship From first'} options={types.map((x) => x.code)}
                    labels={(v) => typeOf(v)?.name ?? v} searchable onChange={(v) => setRow(i, { vehicleType: v })} />
                  {/* "Required field." only after an Add Order / Continue attempt, like every other field */}
                  {!r.vehicleType
                    ? (showErrors ? <p className="mt-1.5 pl-2 text-[12px] text-danger-fg">Required field.</p> : null)
                    : <p className={`mt-1 text-[12px] ${heavy ? 'text-danger-fg' : 'text-ink-3'}`}>
                        {heavy ? `${r.loadKg.toLocaleString()} kg exceeds ${rowCap.toLocaleString()} kg` : note}
                      </p>}
                </div>
                <NumBox integer min={1} value={r.count} onChange={(n) => setRow(i, { count: Math.max(1, n) })} />
                <div>
                  <NumBox unit="kg" blankZero value={r.loadKg} error={err(!(r.loadKg > 0))} onChange={(n) => setRow(i, { loadKg: n })} />
                  {showErrors && !(r.loadKg > 0) && <p className="mt-1.5 pl-2 text-[12px] text-danger-fg">Required field.</p>}
                </div>
                {/* one Ship To address: nothing to choose — it is the one */}
                {addressLabels.length === 1 && r.addressIdx.includes(0)
                  ? <ReadBox value={addressLabels[0]} />
                  : <MultiSelectDropdown size="sm" options={addressLabels} noun="addresses" placeholder="Ship To addresses"
                      values={r.addressIdx.map((a) => addressLabels[a]).filter(Boolean)}
                      onChange={(vals) => setRow(i, { addressIdx: vals.map((v) => addressLabels.indexOf(v)).filter((a) => a >= 0).sort((x, y) => x - y) })} />}
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
          {plural(vs.length, 'vehicle')} · {loadText(load)} of {cap.toLocaleString()} kg
          {over.length > 0 && <span className="text-danger-fg"> · {over.length} overloaded</span>}
          {notServed.length > 0
            ? <span className="text-danger-fg"> · {notServed.map((i) => `Address ${i + 1}`).join(', ')} not assigned to a vehicle</span>
            : <span> · every address has a vehicle</span>}
        </p>
      </>
    )
  }
  /* 2026-10-07: the card is a builder field (`vehicleDetails`) — rename it, or hide it: the carrier then picks the vehicle
     (one of the Ship From hub's vehicles carries the whole load to every Ship To address) */
  const vehicleSection = (
    <FormCard id="sec-vehicle" title={lbl('vehicleDetails')}
      caption={`A full-truck booking — book the vehicles that fit the load for ${consoleFtl}. Each one is dedicated to this order.`}>
      <Configurable fieldKey="vehicleDetails">
        {vehicleTable(vehicleOpts.map((x) => ({ code: x.code, name: vehicleTypeOf(masters.vehicleTypes, x.code)?.name ?? x.code,
          capacity: vehicleTypeOf(masters.vehicleTypes, x.code)?.capacity })), payloadOf)}
      </Configurable>
    </FormCard>
  )
  /* Grow, Dedicate Truck on: the same table on the Ship From hub's fleet */
  const growVehicleSection = (
    <FormCard id="sec-vehicle" title={lbl('vehicleDetails')}
      caption={`A full vehicle just for this order — book the vehicles that fit the load, and the Ship To addresses each one serves.${fleetNote ? ` ${fleetNote}` : ''}`}>
      <Configurable fieldKey="vehicleDetails">
        {vehicleTable(fleet, (code) => fleet.find((v) => v.code === code)?.payloadKg ?? 0)}
      </Configurable>
    </FormCard>
  )

  /* ------------------------------------------------------------ 5 · Instructions & services
     Only what is left once every handling question sits where it belongs (owner, 2026-09-29): a note for
     the carrier, and any service on top of the delivery. */
  const extrasReveal = arrange(sortApi, 'instructions', [
    !hid('specialInstructions') && ['specialInstructions', <F key="si" fieldKey="specialInstructions" label={lbl('specialInstructions')} multiline rows={2}
      value={c.specialInstructions ?? ''} placeholder="eg, Call the customer 30 minutes before arriving"
      onChange={(v) => setC({ specialInstructions: v })} />, filled(c.specialInstructions)],
  ], inMore, secOpen('sec-service'))
  const vasOpts = merchantMode
    ? VAS_SERVICES.map((v) => ({ value: v, label: laneVasPrice(v, currency) ? `${v} · ${money(laneVasPrice(v, currency), currency)}` : v }))
    : VAS_OPTS
  const VAS_COLS = 'grid grid-cols-[120px_minmax(0,1.6fr)_minmax(0,1.6fr)_112px_minmax(0,1.2fr)_32px] items-start gap-x-3'
  /* the builder shows one sample service line (owner, 2026-10-05) — the real list otherwise */
  const vasShown: VasLine[] = (c.vas ?? []).length || !editing ? (c.vas ?? []) : [{ ...newVas(), level: isFtl ? 'CONSIGNMENT' : 'SKU' }]
  /* owner, 2026-09-29: a block whose fields are all hidden leaves no divider and no space */
  const extrasVisible = extrasReveal.nodes.length > 0 || extrasReveal.waiting > 0 || !hid('vas')
  /* `below` = something sits above it in the card (the service fields, or + Add field while editing): only then the
     divider. Owner, 2026-10-06: with VAS alone on Grow, the card showed an empty band and a rule above it. */
  const addVasButton = <AddMoreButton label="Add service" onClick={() => setC({ vas: [...(c.vas ?? []),
    isFtl ? { ...newVas(), level: 'CONSIGNMENT' } : { ...newVas(), level: skuLineOpts.length ? 'SKU' : 'PACKAGE', packageId: goods.length === 1 ? goods[0].packageId : undefined }] })} />
  /* `alone` = VAS is all the card holds: the CARD is titled Value Added Services with Add service in its header, so the
     block drops its own heading (no two headings in a row) */
  const extrasSection = (below: boolean, alone = false) => !extrasVisible ? null : (
    <div className={below ? 'mt-8 border-t border-warm-200 pt-8' : ''}>
      {extrasReveal.nodes}
      <RevealToggle open={secOpen('sec-service')} onToggle={() => toggleSec('sec-service')} waiting={extrasReveal.waiting} waitingFilled={extrasReveal.waitingFilled} className="mt-4" />
      {!hid('vas') && (
        <Configurable fieldKey="vas">
      <div className={extrasReveal.nodes.length ? 'mt-8' : ''}>
        {!alone && <SubTitle right={addVasButton}>{lbl('vas')}</SubTitle>}
        {vasShown.length === 0
          ? (alone ? <p className="text-[13px] text-ink-3">No services added.</p> : null)
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
                {editing && !(c.vas ?? []).length && <p className="pt-2 text-[11px] text-ink-3">Sample line — how a service is added (not saved)</p>}
                {vasShown.map((v, i) => {
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
  /* one zone for the card's fields — the console's Service Type, Load type and Vehicle Type join the label / loading
     time / own fields (Grow asks its service in its own card, so only the latter are on Grow) */
  const svcReveal = arrange(sortApi, 'service', [
    !merchantMode && !hid('serviceType') && [null, isFtl
      ? <F key="serviceType" fieldKey="serviceType" label={lbl('serviceType')} required value={ftlService} options={opts(FTL_SERVICE_CODES)} placeholder="eg, Service" onChange={pickFtlService} />
      : <F key="serviceType" fieldKey="serviceType" label={lbl('serviceType')} required value={service} options={opts(SERVICE_TYPES)} placeholder="eg, Service" searchable onChange={setService} />],
    /* owner, 2026-10-06: the load type is a toggle (the second branch's Dedicate Truck), as wide as the fields beside it —
       off = a shared vehicle, on = a full one; no hint line (only when the service decides it) */
    !merchantMode && !isFtl && !hid('dedicateTruck') && [null, <SFld key="loadType" fieldKey="dedicateTruck" label={custom('dedicateTruck', 'Dedicate Truck', 'Load type')}
      helper={dedicatedLocked ? `Set by the service — ${serviceLoad === 'ftl' ? 'full' : 'shared'} vehicle only` : undefined}>
      <SwitchBox icon={Truck} label="Dedicate Truck" checked={dedicated} disabled={dedicatedLocked || !!fromOverage} onChange={setDedicateTruck}
        title={dedicated ? 'Full vehicle (FTL / FCL) — a whole vehicle just for this consignment' : 'Shared vehicle (LTL / LCL) — switch on for a whole vehicle'} />
    </SFld>],
    /* Vehicle Type applies to a dedicated truck only — disabled (and empty) until Dedicate Truck is on */
    !merchantMode && !isFtl && !hid('vehicleType') && [null, <SFld key="vehicleType" fieldKey="vehicleType" label={lbl('vehicleType')}
      helper={dedicated ? dedicatedSpec?.capacity || undefined : undefined}>
      {shipFromHub
        ? <MenuSelect value={dedicated ? vehicleChoice : ''} disabled={!dedicated}
            placeholder={!dedicated ? 'Turn on Dedicate Truck' : hubVehicles.length ? 'eg, 8 Ton Truck' : `No vehicles configured at ${shipFromHubName}`}
            options={['', ...hubVehicles.map((v) => v.code)]}
            labels={(v) => (v ? vehicleTypeOf(hubVehicles, v)?.name ?? v : '— None —')} searchable onChange={setDedicatedType} />
        : <Input value="" placeholder="Enter Ship From first" disabled onChange={() => undefined} />}
    </SFld>],
    !hid('labelFormat') && ['labelFormat', <F key="lf" fieldKey="labelFormat" label={lbl('labelFormat')} value={c.labelFormat ?? ''} placeholder="eg, PDF"
      options={opts(LABEL_FORMATS)} onChange={(v) => setC({ labelFormat: v })} />, !!c.labelFormat],
    !hid('totalLoadingTime') && ['totalLoadingTime', <FNum key="lt" fieldKey="totalLoadingTime" label={custom('totalLoadingTime', 'Total Loading Time (minutes)', 'Total Loading Time')}
      blankZero integer unit="min" placeholder="minutes" value={c.totalLoadingTime ?? 0} onChange={(n) => setC({ totalLoadingTime: n || null })} />, (c.totalLoadingTime ?? 0) > 0],
    ...customEntries('sec-service'),
  ], inMore, secOpen('sec-service'))
  /* only the services are left in the card (every other field hidden, the form not being edited) */
  const svcAbove = svcReveal.nodes.length > 0 || svcReveal.waiting > 0 || editing
  const vasAlone = !svcAbove && extrasReveal.nodes.length === 0 && extrasReveal.waiting === 0 && !hid('vas')
  const serviceSection = (
    <FormCard id="sec-service" title={vasAlone ? lbl('vas') : 'Service & instructions'} action={vasAlone ? addVasButton : undefined}
      caption={vasAlone ? 'Any service on top of the delivery — installation, assembly, a tail-lift…'
        : 'How it moves, anything the carrier should know, and any service on top of the delivery.'}>
      {svcReveal.nodes.length > 0 && <SGrid>{svcReveal.nodes}</SGrid>}
      <RevealToggle open={secOpen('sec-service')} onToggle={() => toggleSec('sec-service')} waiting={svcReveal.waiting} waitingFilled={svcReveal.waitingFilled} className="mt-6" />
      {addFieldLink('sec-service')}
      {extrasSection(svcAbove, vasAlone)}
    </FormCard>
  )

  /* ------------------------------------------------------------ 6 · Carriers — LAST (owner, 2026-09-29):
     the carrier is chosen once everything it has to carry is known */
  const carrierSection = (
    <FormCard id="sec-carrier" title="Carriers" count={CARRIERS.length}
      caption="Who carries this consignment — pick one.">
      {/* pills on the card — the Handling chips' look (the chosen one: ink border, warm-50, bold, a check) */}
      <div>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Carriers">
          {CARRIERS.map((k) => {
            const on = c.carrier === k.code
            return (
              <button key={k.code} type="button" role="radio" aria-checked={on} onClick={() => setC({ carrier: k.code })}
                className={`inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[13px] transition-colors
                  ${on ? 'border-ink bg-warm-50 font-bold text-ink' : 'border-line bg-surface text-ink-2 hover:border-warm-300 hover:text-ink'}`}>
                {on && <Check size={13} strokeWidth={3} className="text-brand-500" />}{k.code}
              </button>
            )
          })}
        </div>
        {!c.carrier && <ErrLine className="mt-3">Pick a carrier.</ErrLine>}
      </div>
    </FormCard>
  )

  /* ============================================================ Grow (merchant): the console's Handling card with the
     load type asked in it · Service & instructions (label, note, VAS) · Service Type (the lane's cards, LAST) */
  const merchantHandlingSection = (
    <FormCard id="sec-handling" title="Handling" caption="How the goods must be handled on the way, and how they travel.">
      {/* the console's Handling content; its switches row always shows on Grow — the load type is on it */}
      {handlingSection.props.children}
    </FormCard>
  )
  const merchantExtrasSection = !(svcReveal.nodes.length > 0 || svcReveal.waiting > 0 || extrasVisible || editing) ? null : (
    <FormCard id="sec-extras" title={vasAlone ? lbl('vas') : 'Service & instructions'} action={vasAlone ? addVasButton : undefined}
      caption={vasAlone ? 'Any service on top of the delivery — installation, assembly, a tail-lift…'
        : 'The label, anything the carrier should know, and any service on top of the delivery.'}>
      {(svcReveal.nodes.length > 0 || svcReveal.waiting > 0) && (
        <>
          <SGrid>{svcReveal.nodes}</SGrid>
          <RevealToggle open={secOpen('sec-service')} onToggle={() => toggleSec('sec-service')} waiting={svcReveal.waiting} waitingFilled={svcReveal.waitingFilled} className="mt-4" />
        </>
      )}
      {addFieldLink('sec-service', svcReveal.nodes.length > 0 ? 'mt-6' : '')}
      {extrasSection(svcAbove, vasAlone)}
    </FormCard>
  )
  /* Grow · Payment (owner, 2026-10-07: "Payment Mode, COD, COD Amount, remarks — asked in the same flow as the form"):
     its own card on step 1, configured like every field (hide · Required · rename · order, zone `payment`). Checkout
     only asks HOW the merchant pays. COD Amount shows for a COD order; hidden Payment Mode = Prepaid. */
  const payReveal = arrange(sortApi, 'payment', [
    !hid('paymentMode') && typeRule.payment && ['paymentMode', <F key="pm" fieldKey="paymentMode" label={lbl('paymentMode')} value={growPayMode}
      options={opts(['Prepaid', 'COD'])} onChange={(v) => setC({ paymentMode: v, ...(v === 'COD' ? {} : { orderAmount: null }) })}
      helper={growPayMode === 'COD' ? 'Cash is collected from the receiver at delivery' : undefined} />, true],
    !hid('orderAmount') && typeRule.payment && (growPayMode === 'COD' || editing) && ['orderAmount',
      <FNum key="oa" fieldKey="orderAmount" label={`${custom('orderAmount', 'Order Amount', 'COD Amount')} (${currency})`} required={codAsked} blankZero
        placeholder="eg, 1500" value={c.orderAmount ?? 0} error={err(codAsked && !((c.orderAmount ?? 0) > 0))}
        helper={editing && growPayMode !== 'COD' ? 'Shown for a COD order' : undefined}
        onChange={(n) => setC({ orderAmount: n || null })} />, (c.orderAmount ?? 0) > 0],
    !hid('remarks') && ['remarks', <F key="rm" fieldKey="remarks" label={lbl('remarks')} multiline rows={2} value={c.remarks ?? ''}
      placeholder="Remarks for the driver or the receiver" className="sm:col-span-2" onChange={(v) => setC({ remarks: v })} />, filled(c.remarks)],
  ], inMore, secOpen('sec-payment'))
  const paymentSection = !(payReveal.nodes.length > 0 || payReveal.waiting > 0) ? null : (
    <FormCard id="sec-payment" title="Payment" caption="Prepaid or cash on delivery, and a note for the driver or the receiver.">
      <SGrid>{payReveal.nodes}</SGrid>
      <RevealToggle open={secOpen('sec-payment')} onToggle={() => toggleSec('sec-payment')} waiting={payReveal.waiting} waitingFilled={payReveal.waitingFilled} className="mt-6" />
    </FormCard>
  )
  /* Grow, Service Type hidden: the merchant books the default service without choosing (the card leaves the form; a full
     vehicle's vehicles are in Vehicle Details); the builder's preview keeps the whole card, faded, so it can be selected */
  const serviceChooser = (
    <ServiceTypeChooser hideMode vehiclesElsewhere ready={ready} mode={mode} onMode={changeMode} modeLocked={!!fromOverage || pr?.shipmentType === 'FTL'}
      quotes={quotes} selected={selected} onSelect={setService} currency={currency} fleet={fleet} counts={{}} onCount={() => undefined}
      fleetNote={fleetNote} showErrors={showErrors} serviceLocked={serviceHidden}
      layout={layout.services} carrier={mode === 'ftl' ? '2GO Logistics' : '2GO Express'} />
  )
  const merchantServiceSection = (
    <FormCard id="sec-service" title={lbl('serviceType')}
      count={layout.services === 'grid' && quotes.length > 1 ? quotes.length : undefined}
      action={editing ? (
        <LayoutSeg label="Show as" value={layout.services} onChange={(v) => setDraftLayout((l) => ({ ...l, services: v }))} options={[
          { value: 'menu', label: 'Dropdown', tip: 'One compact dropdown — the shortest step' },
          { value: 'grid', label: 'Grid', tip: 'Two services per row — less scrolling' },
          { value: 'list', label: 'List', tip: 'One full-width card per service' },
        ]} />
      ) : undefined}
      caption={`Merchants pick it on the next step (Service & payment), with the estimated rate for this route. ${layout.services === 'menu' ? 'One dropdown.' : layout.services === 'grid' ? 'Two per row.' : 'One per row.'} Dedicate Truck is in Handling.`}>
      {editing ? <Configurable fieldKey="serviceType">{serviceChooser}</Configurable> : serviceChooser}
      {showErrors && !ready && (
        <ErrLine className="mt-3">Add {[!laneReady(sender) && 'a Ship From address', !allDrops.every(laneReady) && 'a Ship To address',
          !weightOk && 'a weight or size for every package'].filter(Boolean).join(', ')} to see the services.</ErrLine>
      )}
    </FormCard>
  )

  /* ============================================================ Summary (2026-10-05, owner: "allow to show summary or not … for
     both consignment and Grow portal — their summary section can be different"): a card at the end that adds the
     consignment up while it is filled. The console's lines are the ops view, Grow's the merchant view; the builder
     switches the card on / off and picks its lines for each portal on its own, and the lines take the field order
     (zone `summary`, drag to reorder). */
  const whenText = (a?: string, b?: string) => {
    if (!filled(a)) return ''
    const d = new Date(`${dateOf(a)}T00:00`)
    const day = isNaN(d.getTime()) ? dateOf(a) : d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
    return `${day} · ${timeOf(a)}${filled(b) ? `–${timeOf(b)}` : ''}`
  }
  const goodsPieces = goods.reduce((n, p) => n + (p.quantity || 0), 0)
  const pickupText = merchantMode
    ? (pickupState === 'auto-rule' ? (autoWin ? `Booked automatically · ${fmtWin(autoWin)}` : 'Booked automatically')
      : hasWindow ? whenText(sender.windowStart, sender.windowEnd) : pickupState === 'off' ? '' : 'Schedule later')
    : whenText(sender.windowStart, sender.windowEnd)
  /* ---- the blocks' content ---- */
  /* an address reads back only once it has a name or a line (the default country alone is not an address) */
  const partyText = (p: Party) => (filled(p.name) || filled(p.line1)
    ? [p.name, p.line1, p.line2, p.city, p.state, p.postalCode, p.country].filter((x) => filled(x)).join(', ') : '')
  const skuUnits = goods.reduce((n, p) => n + (p.quantity || 0) * (p.items ?? []).filter((it) => !isBlankItem(it)).reduce((m, it) => m + (it.quantity || 0), 0), 0)
  const fullVehicle = merchantMode ? mode === 'ftl' : isFtl || dedicated
  const growCarrier = mode === 'ftl' ? '2GO Logistics' : '2GO Express'
  const vasAmount = quote ? quote.lines.filter((l) => vasNames.includes(l.label)).reduce((n, l) => n + l.amount, 0) : 0
  const etaDays = merchantMode ? quote?.days ?? null : svc.days
  const muted = (t: string) => <span className="text-ink-3">{t}</span>
  const kgText = (n: number) => `${round2(n).toLocaleString()} kg`
  /* breaks only between its parts — never "2.57 / kg" */
  const weightLine = [`Dead ${kgText(weights.dead)}`, `Vol ${kgText(weights.volumetric)}`, `Chargeable ${kgText(weights.chargeable)}`]
    .map((t, i) => <Fragment key={i}>{i > 0 && ' · '}<span className="whitespace-nowrap">{t}</span></Fragment>)
  type SumBlock = { title: string; value: ReactNode; sub?: ReactNode; jump?: string | null }
  const sumBlocks: Record<string, SumBlock> = {
    consignment: {
      title: 'Consignment', jump: 'sec-consignment',
      value: <>{merchant?.name ?? muted('No merchant yet')} · {ctype}</>,
      sub: [filled(effectiveOrder) && `Order ${effectiveOrder.trim()}`, filled(effectiveRef) && effectiveRef.trim() !== effectiveOrder.trim() && `Ref ${effectiveRef.trim()}`]
        .filter(Boolean).join(' · '),
    },
    shipFrom: {
      title: 'Ship From', jump: 'sec-parties',
      value: partyText(sender) || '—',
      sub: merchantMode ? (pickupText ? `Pickup: ${pickupText}` : '') : (pickupText ? `Pick up ${pickupText}` : ''),
    },
    shipTo: {
      title: allDrops.length > 1 ? `Ship To (${allDrops.length} addresses)` : 'Ship To', jump: 'sec-parties',
      value: allDrops.length > 1
        ? <>{allDrops.map((d, i) => <span key={i} className="block">{i + 1}. {partyText(d) || '—'}</span>)}</>
        : partyText(receiver) || '—',
      sub: !merchantMode && filled(receiver.windowStart) ? `Deliver ${whenText(receiver.windowStart, receiver.windowEnd)}` : '',
    },
    legs: {
      title: 'Shipment legs', jump: 'sec-parties',
      value: legsDirect ? 'Pick & Del' : legList.length ? legList.map((l) => LEG_INFO[l].name).join(' → ') : muted('No legs yet'),
      sub: !legsDirect && legList.length && viaHubs.length ? `Via ${viaHubs.join(' → ')}` : '',
    },
    goods: isFtl ? {
      title: 'FTL · Vehicle Details', jump: 'sec-vehicle',
      value: `${consoleFtl} · ${plural(vehicles.length, 'vehicle')} · ${loadText(actualLoad)}`,
    } : {
      /* Grow speaks the merchant's words (the Handling switch), the console the ops' */
      title: merchantMode ? (fullVehicle ? 'Dedicate Truck · Packages' : 'Packages') : `${fullVehicle ? 'FTL' : 'LTL'} · Packages`, jump: 'sec-packages',
      value: goodsPieces ? `${plural(goodsPieces, 'package')}${skuUnits ? ` · ${plural(skuUnits, 'SKU unit')}` : ''}` : muted('No packages yet'),
      sub: <>{goodsPieces > 0 && <span className="block">{weightLine}</span>}
        {merchantMode && mode === 'ftl' && vehicleLine && <span className="block">Vehicles: {vehicleLine}</span>}</>,
    },
    service: merchantMode ? {
      title: 'Service', jump: growServiceCard ? 'sec-service' : null,
      value: quote ? `${quote.name} · ${growCarrier}` : muted('Chosen in the next step'),
      sub: vasNames.length ? `+ ${vasNames.join(', ')}` : '',
    } : {
      title: 'Service', jump: consoleServiceCard ? 'sec-service' : null,
      value: <>{isFtl ? consoleFtl : consoleService} · {isFtl || dedicated ? `Full vehicle${!isFtl && vehicleChoice ? ` · ${vehicleChoice}` : ''}` : 'Shared vehicle'}</>,
      sub: vasNames.length ? `+ ${vasNames.join(', ')}` : '',
    },
    carrier: {
      title: 'Carrier', jump: 'sec-carrier',
      value: c.carrier || muted('Not chosen yet'),
    },
    /* Grow (2026-10-07): the Payment card read back */
    payment: {
      title: 'Payment', jump: paymentSection ? 'sec-payment' : null,
      value: growPayMode === 'COD' ? `Cash on delivery${codAsked && (c.orderAmount ?? 0) > 0 ? ` · ${money(c.orderAmount ?? 0, currency)}` : ''}` : 'Prepaid',
      sub: filled(c.remarks) && !isHidden('remarks') ? `Remarks: ${c.remarks!.trim()}` : '',
    },
  }
  const toggleLine = (key: string, on: boolean) => {
    setDraftSummary((x) => ({ ...x, hidden: on ? x.hidden.filter((k) => k !== key) : [...x.hidden, key] }))
    if (!on && !showHidden) toast.info('Hidden — “Show hidden fields” brings it back')
  }
  const setSummaryOn = (on: boolean) => {
    setDraftSummary((x) => ({ ...x, enabled: on }))
    if (!on && !showHidden) toast.info('Summary hidden — “Show hidden fields” brings it back')
  }
  const sumLines = summaryLinesOf(formPortal).filter((l) => (editing && showHidden) || !summaryCfg.hidden.includes(l.key))
  /** while editing: the switch that shows / hides one block or foot row */
  const lineSwitch = (key: string) => {
    const off = summaryCfg.hidden.includes(key)
    return (
      <Tip text={off ? 'Hidden — switch on to show it' : 'Shown — switch off to hide it'}>
        <span className="inline-flex shrink-0"><Toggle checked={!off} onChange={(on) => toggleLine(key, on)} /></span>
      </Tip>
    )
  }
  /* the foot (the totals): Grow = what it costs, the console = how much it is; ETA under both */
  const footRows = (key: string): [ReactNode, ReactNode, boolean?][] => key === 'eta'
    ? [[<span title="Estimated — the carrier confirms the delivery date">ETA <span className="font-normal text-ink-3">(est.)</span></span>,
        etaDays != null ? plural(etaDays, 'day') : '—']]
    : merchantMode
      ? quote ? [
        ['Delivery', money(quote.net - vasAmount, currency)],
        ...(vasAmount > 0 ? [['Value-added services', money(vasAmount, currency)] as [ReactNode, ReactNode]] : []),
        [<span title="Estimated, before tax — checkout shows the tax">Total</span>, money(quote.net, currency), true],
      ]
        /* step 1 without a service: the lowest rate for this route (the service is picked on the next step) */
        : [[<span title="Estimated, before tax — you pick the service on the next step">Estimated from</span>, cheapest != null ? money(cheapest, currency) : '—', true]]
      : [
        [isFtl ? 'Vehicles' : 'Pieces', isFtl ? String(vehicles.length) : String(goodsPieces)],
        [isFtl ? 'Load' : 'Chargeable weight', kgText(isFtl ? actualLoad : weights.chargeable), true],
      ]
  const summaryTitle = merchantMode ? 'Shipment Summary' : 'Consignment Summary'
  /* owner, 2026-10-06: the second branch's Shipment Summary — a vertical card beside the form (sticky) when the page is wide
     enough, under it otherwise */
  const summarySection = (
    <section id="sec-summary" aria-label={summaryTitle} className="rounded-xl bg-surface px-5 pb-4 pt-4">
      <h2 className="pb-3 text-[15px] font-bold text-ink">{summaryTitle}</h2>
      {editing && (
        <div className="mb-3 rounded-lg bg-warm-50 px-3 py-2">
          <Tip text={`Show the summary on the ${formPortal === 'grow' ? 'Grow portal' : 'console'} form`}>
            <InlineSwitch label={summaryCfg.enabled ? 'Shown on this form' : 'Not shown'} checked={summaryCfg.enabled} onChange={setSummaryOn} />
          </Tip>
        </div>
      )}
      <div className={editing && !summaryCfg.enabled ? 'opacity-50' : ''}>
        {arrange(sortApi, 'summary', sumLines.filter((l) => !l.foot && sumBlocks[l.key]).map((l): RevealEntry => {
          const bk = sumBlocks[l.key]
          const off = summaryCfg.hidden.includes(l.key)
          return [null, (
            <div key={l.key} className={`flex gap-3 border-t border-line py-3 ${off ? 'opacity-40' : ''}`}>
              <div className="min-w-0 flex-1">
                <p className="text-[12px] font-bold text-ink-3">{bk.title}</p>
                <div className="mt-0.5 break-words text-[13px] leading-5 text-ink">{bk.value}</div>
                {bk.sub && <div className="mt-0.5 break-words text-[12px] leading-[18px] text-ink-3">{bk.sub}</div>}
              </div>
              {/* owner, 2026-10-06: an Edit BUTTON (not a text link) — jumps to its card */}
              {editing ? lineSwitch(l.key) : bk.jump && (
                <Tip text={`Edit ${bk.title}`}>
                  <button type="button" onClick={() => jumpTo(bk.jump!)} aria-label={`Edit ${bk.title}`}
                    className="inline-flex h-7 shrink-0 items-center gap-1 self-start rounded-md border border-warm-300 bg-surface px-2 text-[12px] font-bold text-ink-2 transition-colors hover:border-warm-400 hover:bg-warm-50 hover:text-ink">
                    <Pencil size={12} />Edit
                  </button>
                </Tip>
              )}
            </div>
          )]
        }), () => false, true, 'rows').nodes}
        {sumLines.some((l) => l.foot) && (
          <div className="border-t border-line pt-3">
            {sumLines.filter((l) => l.foot).map((l) => (
              <div key={l.key} className={`flex items-start gap-3 ${summaryCfg.hidden.includes(l.key) ? 'opacity-40' : ''}`}>
                <div className="grid min-w-0 flex-1 grid-cols-[1fr_auto] items-baseline gap-x-6 gap-y-1 py-0.5 text-[13px] text-ink-2">
                  {footRows(l.key).map(([k, v, strong], i) => (
                    <Fragment key={i}>
                      <span className={strong ? 'font-bold text-ink' : ''}>{k}</span>
                      <span className={`text-right tabular-nums text-ink ${strong ? 'text-[15px] font-bold' : ''}`}>{v}</span>
                    </Fragment>
                  ))}
                </div>
                {editing && lineSwitch(l.key)}
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
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
          <SFld label="Load type">
            <SwitchBox icon={Truck} label="Dedicate Truck" checked={dedicated} disabled={!!fromOverage} onChange={setDedicateTruck}
              title={dedicated ? 'Full vehicle (FTL / FCL)' : 'Shared vehicle (LTL / LCL)'} />
          </SFld>
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
          <MultiSelectDropdown size="sm" options={TAG_OPTIONS} values={c.tags ?? []} noun="tags" placeholder="Add tags" onChange={(v) => setC({ tags: v })} />
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
      <div className="overflow-x-auto">
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
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <AddMoreButton label="Add Package" onClick={() => { setFocusLine({ i: parcels.length, k: 0 }); setParcels((ps) => [...ps, newParcel()]) }} />
        <span className="text-[13px] text-ink-2">{pieces} piece{pieces === 1 ? '' : 's'} in {parcels.length} package{parcels.length === 1 ? '' : 's'}</span>
      </div>
    </FormCard>
  )

  const byId: Record<string, ReactNode> = merchantMode ? {
    'sec-consignment': consignmentSection, 'sec-parties': partiesSection, 'sec-packages': packagesSection,
    'sec-handling': merchantHandlingSection, 'sec-vehicle': growVehicleSection, 'sec-extras': merchantExtrasSection, 'sec-service': merchantServiceSection,
    'sec-payment': paymentSection,
    'sec-summary': summarySection,
  } : simple ? {
    'sec-consignment': simpleConsignment, 'sec-parties': simpleParties, 'sec-packages': simplePackages,
    'sec-vehicle': vehicleSection, 'sec-carrier': carrierSection,
  } : {
    'sec-consignment': consignmentSection, 'sec-parties': partiesSection, 'sec-packages': packagesSection, 'sec-handling': handlingSection,
    'sec-vehicle': vehicleSection, 'sec-service': serviceSection, 'sec-carrier': carrierSection, 'sec-summary': summarySection,
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
    <>
      <div className="mb-4 flex items-start gap-3">
        {backBtn}
        <div className="min-w-0">
          <h1 className="text-[18px] font-bold leading-8 text-ink">Create Order</h1>
          <p className="text-[13px] text-ink-2">{SUBTITLE}</p>
        </div>
      </div>
      {/* owner, 2026-10-06: two steps — this form, then the service + the payment at checkout (step 2 = Continue) */}
      <WizardSteps steps={ORDER_STEPS} active={0} onSelect={(i) => { if (i === 1) proceed() }} />
    </>
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
              <InfoTip text="Click a field to open its settings, or use the small icons on it: ✱ required · ☰ under More · .* what can be typed · eye show / hide. A lit icon = set; a lock = needed by the system. Move card moves a whole card up or down; drag a field to move it inside its card. All fields lists everything, hidden ones too." />
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
          <Button variant="outline" size="sm" icon={<ListChecks size={14} />} onClick={() => showFieldGroup(null)}>All fields</Button>
          <Tip text="Hidden fields stay in this preview, faded, so you can bring them back">
            <InlineSwitch label="Show hidden fields" checked={showHidden} onChange={setShowHidden} />
          </Tip>
          {growSetup
            ? <Button variant="ghost" size="sm" icon={<RotateCcw size={13} />}
                disabled={changedForGrow === 0 && JSON.stringify(draftLayout) === JSON.stringify(loadLayout('console'))
                  && JSON.stringify(draftOrder) === JSON.stringify(loadOrder('console'))}
                onClick={() => { setDraftRules({}); setDraftLayout(loadLayout('console')); setDraftOrder(loadOrder('console')) }}>Match console form</Button>
            : <Button variant="ghost" size="sm" icon={<RotateCcw size={13} />}
                onClick={() => { setDraftRules({}); setDraftLayout(DEFAULT_LAYOUT); setDraftOrder({}); setDraftSummary(DEFAULT_SUMMARY.console) }}>Reset to default</Button>}
        </div>
      </div>
    </div>
  ) : (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
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
      {!simple && (
        <div className="flex items-center gap-2">
          <Button variant="outline" icon={<SlidersHorizontal size={14} />} onClick={startEditing}>Edit consignment form</Button>
        </div>
      )}
    </div>
  )

  /* ============================================================ the builder's field settings (2026-10-05 v3, owner: "I don't
     want the side bar — find another way — but I love the idea"): click a field in the preview and its settings open in
     a CARD RIGHT NEXT TO IT, in plain words; the form-level choices sit on the cards they change (each address, the
     goods, Grow's services); "All fields" (the editing bar) lists every field in one searchable dialog — for hidden
     ones and for an address's own fields while the address is a card. */
  /* Esc closes a field's card (a dialog on top handles its own Esc) */
  useEffect(() => {
    if (!editing) return
    const esc = (e: globalThis.KeyboardEvent) => { if (e.key === 'Escape' && !document.querySelector('[data-modal-open]')) setSelKey(null) }
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [editing])
  const customKeys = (card: CustomFieldCard) => customDefs.filter((d) => d.card === card).map((d) => d.key)
  /* every field the builder can change, by the card it sits in (a field this form never has is left out) */
  const fieldGroups = [
    { id: 'sec-consignment', title: 'Consignment details', keys: ['merchant', 'orderNumber', 'referenceNumber', 'consignmentNumber', 'consignmentType',
      'shipByDate', 'exchangeOrderNumber', ...(merchantMode ? [] : ['paymentMode', 'orderAmount']), ...customKeys('sec-consignment')] },
    { id: 'addresses', title: 'Addresses', keys: ['addrName', 'addrCompanyName', 'addrContact', 'addrEmail', 'addrLine1', 'addrLines23', 'addrLandmark',
      'addrCountry', 'addrPostal', 'addrSuburb', 'addrCity', 'addrState', 'addrCoordinates', 'addrFloorLift', 'addrLift', 'addrWindow', 'schedulingConfirmation'] },
    { id: 'sec-packages', title: 'Package & SKU', keys: [PKG_SECTION, SKU_SECTION, 'pkgType', 'pkgQty', 'pkgWeight', 'pkgDimensions', 'pkgTracking', 'pkgId', 'pkgDescription',
      'pkgPalletSpace', 'skuWeight', 'skuDimensions', 'skuCategory', 'skuDescription', 'skuHsn', 'skuOrigin', 'skuUnitCost', 'skuImage'] },
    { id: 'sec-handling', title: 'Handling', keys: [...GOODS_CATEGORIES.map(({ name }) => catKey(name)), 'scannable', 'splittable', 'clearanceRequired',
      'tags', ...(merchantMode ? ['dedicateTruck', 'vehicleDetails'] : []), ...customKeys('sec-handling')] },
    { id: 'sec-service', title: 'Service & instructions', keys: ['serviceType', ...(merchantMode ? [] : ['dedicateTruck', 'vehicleType', 'vehicleDetails']),
      'labelFormat', 'totalLoadingTime', 'specialInstructions', 'vas', ...customKeys('sec-service')] },
    ...(merchantMode ? [{ id: 'sec-payment', title: 'Payment', keys: ['paymentMode', 'orderAmount', 'remarks'] }] : []),
  ].map((g) => ({ ...g, keys: g.keys.filter((k) => known(k) && !(merchantMode ? MERCHANT_OFF : CONSOLE_OFF).has(k)) }))
  /** a field's name as the form shows it */
  const fieldName = (k: string) => (k === 'dedicateTruck' ? custom('dedicateTruck', 'Dedicate Truck', 'Load type')
    : k === 'scannable' ? custom('scannable', 'Scannable', 'Barcode on every box')
    : k === 'splittable' ? 'Can be delivered in parts' : lbl(k))
  const groupOf = (k: string) => fieldGroups.find((g) => g.keys.includes(k))?.title ?? ''
  /** the system's own name for a field (what an empty rename falls back to) */
  const defaultName = (k: string) => customOf(k)?.label ?? (V2_KEYS.has(k) ? FIELD_DEF.get(k)!.defaultLabel : fieldLabel(k, fieldCfg))
  const pickField = (k: string) => {
    setSelKey(k)
    window.setTimeout(() => fieldEl(k)?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 30)
  }
  const toggleGroup = (id: string) => setOpenGroups((st) => { const n = new Set(st); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const needle = allQuery.trim().toLowerCase()
  const verb = merchantMode || growSetup ? 'the order can go to checkout' : 'the consignment can be added'
  /** settings only one field has (Service Type: the service used while it is hidden) */
  const fieldExtra = (k: string): ReactNode => {
    /* Dedicate Truck (2026-10-07): what a hidden switch gives every consignment */
    if (k === 'dedicateTruck') return (
      <div>
        <PanelHeading>While it is hidden</PanelHeading>
        <SFld label="Every consignment books">
          <MenuSelect value={truckDefault ? 'on' : 'off'} options={['off', 'on']}
            labels={(v) => (v === 'on' ? 'A dedicated truck (full vehicle)' : 'A shared vehicle')}
            onChange={(v) => setRule('dedicateTruck', { defaultValue: v })} />
        </SFld>
        <p className="mt-2 text-[12px] text-ink-3">A full-vehicle order or pickup request keeps its own.</p>
      </div>
    )
    if (k !== 'serviceType') return null
    /* the console offers the static list; the Grow form books from the Service Type master's Active rows */
    const list = growSetup || merchantMode ? services.map((x) => x.code) : SERVICE_TYPES
    const name = (code: string) => services.find((x) => x.code === code)?.name ?? code
    const cur = list.includes(ruleDefault) ? ruleDefault : growSetup || merchantMode ? (services[0]?.code ?? '') : defaultService
    return (
      <div>
        <PanelHeading>While it is hidden</PanelHeading>
        <SFld label="Service every consignment gets">
          <MenuSelect value={cur} options={list} labels={name} searchable={list.length > 8}
            onChange={(v) => setRule('serviceType', { defaultValue: v })} />
        </SFld>
        <p className="mt-2 text-[12px] text-ink-3">
          {growSetup || merchantMode
            ? 'Merchants are not asked — the order is priced with this service. A full vehicle still picks its vehicles.'
            : `Nobody is asked. A full-vehicle consignment uses ${FTL_SERVICE_CODES.includes(cur) ? cur : DEFAULT_FTL_SERVICE} unless this is a vehicle service. A saved draft keeps its own service.`}
        </p>
      </div>
    )
  }
  /** move a field one place earlier / later in its zone (the keyboard way to do what dragging does) — read off the
      screen, so it moves among the fields as they stand */
  const nudge = (k: string, dir: -1 | 1) => {
    const cell = fieldEl(k)?.closest<HTMLElement>('[data-sort-id]')
    const zone = cell?.dataset.sortZone
    if (!cell || !zone) return
    const ids = zoneIds(cell, zone)
    const i = ids.indexOf(cell.dataset.sortId!)
    const j = i + dir
    if (i < 0 || j < 0 || j >= ids.length) return
    setDraftOrder((o) => ({ ...o, [zone]: moveId(ids, ids[i], ids[j], dir > 0) }))
    window.setTimeout(() => fieldEl(k)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 30)
  }
  /** one field's settings — the same body in the card beside the field and in All fields */
  const fieldSettings = (k: string, close: () => void) => {
    const lock = lockOf(k)
    const parent = hiddenWith(k)
    const own = ownHidden(k)
    const cdef = customOf(k)
    const renamable = !GROUP_KEYS.has(k) && !GOODS_SECTIONS.has(k) && k !== 'splittable' && k !== 'vas'
    return (
      <BuilderCtx.Provider value={null}>
      <div className="grid gap-8">
        {lock && (
          <p className="flex items-start gap-2 rounded-lg bg-warm-50 px-3 py-2.5 text-[12px] text-ink-2">
            <Lock size={13} className="mt-0.5 shrink-0 text-ink-3" />
            {lock === 'system' ? 'The system needs this field — it is always shown and always required.' : lock === 'last'
              ? 'Packages or SKUs must show — show the other one first to hide this.' : 'This form needs this field — it is always shown.'}
          </p>
        )}
        {renamable && (
          <SFld label="Name on the form" helper={`Empty = “${defaultName(k)}”`}>
            <Input value={rules[k]?.label ?? fieldName(k)} placeholder={defaultName(k)} onChange={(v) => setRule(k, { label: v })} />
          </SFld>
        )}
        {!lock && (
          <div className="divide-y divide-line rounded-lg border border-line">
            <SettingRow title="Show on the form" checked={!own && !parent} disabled={!!parent} onChange={(on) => setRule(k, { hidden: !on })}
              hint={parent ? `Hidden because ${fieldName(parent)} is hidden.` : own
                ? (k === 'serviceType' ? 'Hidden — every consignment gets the service below.'
                  : k === 'dedicateTruck' ? 'Hidden — every consignment gets the load type below.'
                  : k === 'vehicleDetails' ? 'Hidden — the carrier picks the vehicle for a dedicated truck.'
                  : k === 'referenceNumber' ? `Hidden — it copies the ${lbl('orderNumber')}.`
                  : k === 'consignmentType' ? 'Hidden — every consignment is Forward.'
                  : k === 'shipByDate' ? 'Hidden — every consignment ships by the day it is created.'
                  : k === 'paymentMode' ? 'Hidden — every order is Prepaid.'
                  : k === 'merchant' ? 'Hidden — the signed-in merchant is recorded.'
                  : k === PKG_SECTION ? 'Hidden — people enter SKUs and how many; the packages are worked out.'
                  : k === SKU_SECTION ? 'Hidden — people enter packages only.'
                  : 'Hidden — people do not see it. Saved consignments keep their answer.')
                : 'People see it on this form.'} />
            {requirable(k) && (
              <SettingRow title="Required" checked={need(k)} disabled={own || !!parent} onChange={(on) => setRule(k, { required: on })}
                hint={`It must be filled before ${verb}.`} />
            )}
            {movable(k) && (
              <SettingRow title="Put under “More”" checked={inMore(k)} disabled={own || !!parent || need(k)} onChange={(on) => setRule(k, { more: on })}
                hint={need(k) ? 'A required field always stays in the main form.'
                  : SKU_ROW_KEYS.has(k) ? 'It shows only when someone opens a SKU line’s details (the chevron at its end).'
                  : 'It shows only when someone clicks More in this section.'} />
            )}
          </div>
        )}
        {fieldExtra(k)}
        {(widthable(k) || !GOODS_SECTIONS.has(k)) && (
          <div className="divide-y divide-line rounded-lg border border-line">
            {widthable(k) && (
              <SettingRow title="Width" hint="How much of its row it takes."
                control={<LayoutSeg label="" value={rules[k]?.width ?? 's'} onChange={(v) => setRule(k, { width: v })} options={FIELD_WIDTHS} />} />
            )}
            {!GOODS_SECTIONS.has(k) && (
              <SettingRow title="Position" hint="Drag it in the form, or move it one place."
                control={(
                  <span className="inline-flex gap-2">
                    <Button variant="outline" size="sm" icon={<ChevronLeft size={14} />} onClick={() => nudge(k, -1)}>Earlier</Button>
                    <Button variant="outline" size="sm" icon={<ChevronRight size={14} />} onClick={() => nudge(k, 1)}>Later</Button>
                  </span>
                )} />
            )}
          </div>
        )}
        {formatable(k) && (
          <div>
            <PanelHeading>What can be typed</PanelHeading>
            <FormatEditor key={k} value={fmtOf(k)} onChange={(f) => setRule(k, { format: f })} />
          </div>
        )}
        {growSetup && !!draftRules[k] && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-brand-50 px-3 py-2.5">
            <span className="text-[12px] font-bold text-brand-600">Changed for Grow</span>
            <Button variant="ghost" size="sm" icon={<RotateCcw size={13} />} onClick={() => setDraftRules((r) => withoutKeys(r, [k]))}>Use the console setting</Button>
          </div>
        )}
        {cdef && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line px-4 py-3">
            <span className="text-[12px] text-ink-3">
              {CUSTOM_FIELD_KINDS.find((x) => x.value === cdef.kind)?.label}{cdef.kind === 'list' ? ` · ${(cdef.options ?? []).join(', ')}` : ''}
            </span>
            <Button variant="ghost" size="sm" icon={<Trash2 size={13} />} onClick={() => { removeCustom(k); close() }}>Remove field</Button>
          </div>
        )}
      </div>
      </BuilderCtx.Provider>
    )
  }
  const fieldHead = (k: string, close: () => void) => (
    <div className="flex items-start gap-3">
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-bold text-ink">{fieldName(k)}</p>
        <p className="mt-0.5 text-[12px] text-ink-3">{[groupOf(k), customOf(k) ? 'your own field' : ''].filter(Boolean).join(' · ')}</p>
      </div>
      <Tip text="Close"><button type="button" aria-label="Close" onClick={close}
        className="-mr-1.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-ink-3 hover:bg-warm-100 hover:text-ink">
        <X size={15} />
      </button></Tip>
    </div>
  )
  /* the card beside the selected field */
  const fieldCard = editing && selKey ? (
    <AnchoredCard anchorKey={selKey} onClose={() => setSelKey(null)}>
      <div className="border-b border-line px-5 py-4">{fieldHead(selKey, () => setSelKey(null))}</div>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">{fieldSettings(selKey, () => setSelKey(null))}</div>
      <div className="flex justify-end border-t border-line px-5 py-3">
        <Button variant="outline" size="sm" onClick={() => setSelKey(null)}>Done</Button>
      </div>
    </AnchoredCard>
  ) : null
  /* All fields — every field by card, a show / hide switch on each, the picked one's settings beside the list */
  const allFieldsDialog = (
    <Modal open={editing && allOpen} wide title="All fields"
      subtitle={`Every field on the ${growSetup ? 'Grow portal' : 'console'} form. Switch one off to hide it, or click its name to change more.`}
      onClose={() => setAllOpen(false)}
      footer={<>
        <span className="mr-auto"><AddRowLink label="Add field" onClick={() => setAddCard(null)} /></span>
        <Button onClick={() => setAllOpen(false)}>Done</Button>
      </>}>
      <div className="grid gap-6 pb-4 pt-1 md:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0">
          <SearchInput value={allQuery} onChange={setAllQuery} placeholder="Find a field" />
          <div className="mt-3 flex flex-col">
            {fieldGroups.map((g) => {
              const keys = needle ? g.keys.filter((k) => fieldName(k).toLowerCase().includes(needle)) : g.keys
              if (!keys.length) return null
              const open = !!needle || openGroups.has(g.id)
              const hiddenN = g.keys.filter((k) => isHidden(k)).length
              const reqN = g.keys.filter((k) => need(k) || lockOf(k) === 'system').length
              return (
                <div key={g.id} className="border-b border-line last:border-b-0">
                  <button type="button" aria-expanded={open} onClick={() => toggleGroup(g.id)}
                    className="flex w-full items-center gap-2 py-2.5 text-left">
                    {open ? <ChevronDown size={14} className="shrink-0 text-ink-3" /> : <ChevronRight size={14} className="shrink-0 text-ink-3" />}
                    <span className="text-[13px] font-bold text-ink">{g.title}</span>
                    <span className="text-[12px] text-ink-3">{keys.length}</span>
                    <span className="ml-auto truncate text-[12px] text-ink-3">
                      {[reqN ? `${reqN} required` : '', hiddenN ? `${hiddenN} hidden` : ''].filter(Boolean).join(' · ')}
                    </span>
                  </button>
                  {open && (
                    <ul className="pb-2">
                      {keys.map((k) => (
                        <li key={k} className={`flex items-center gap-2 rounded-md py-1 pl-6 pr-1 ${allKey === k ? 'bg-warm-50' : 'hover:bg-warm-50'}`}>
                          <button type="button" aria-pressed={allKey === k} onClick={() => setAllKey(k)}
                            className="flex min-w-0 flex-1 items-center gap-1.5 py-0.5 text-left text-[13px] text-ink">
                            <span className={`min-w-0 truncate ${isHidden(k) ? 'text-ink-3' : ''} ${allKey === k ? 'font-bold' : ''}`}>{fieldName(k)}</span>
                            {(need(k) || lockOf(k) === 'system') && <span className="shrink-0 text-danger-fg">*</span>}
                          </button>
                          <FieldChips k={k} hideHidden />
                          {lockOf(k) ? <span className="w-9 shrink-0" />
                            : <Tip text={ownHidden(k) ? 'Hidden — switch on to show it' : 'Shown — switch off to hide it'}>
                                <span className="inline-flex shrink-0"><Toggle checked={!ownHidden(k)} onChange={(on) => setRule(k, { hidden: !on })} /></span>
                              </Tip>}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )
            })}
            {needle && fieldGroups.every((g) => !g.keys.some((k) => fieldName(k).toLowerCase().includes(needle))) && (
              <p className="py-3 text-[13px] text-ink-3">No field is called “{allQuery.trim()}”.</p>
            )}
          </div>
        </div>
        <div className="min-w-0 self-start rounded-lg border border-line md:sticky md:top-0">
          {allKey
            ? <>
                <div className="border-b border-line px-4 py-3">{fieldHead(allKey, () => setAllKey(null))}</div>
                <div className="px-4 py-5">{fieldSettings(allKey, () => setAllKey(null))}</div>
              </>
            : <p className="px-4 py-6 text-[13px] text-ink-3">Click a field’s name to change it — its name, whether it is required, what can be typed.</p>}
        </div>
      </div>
    </Modal>
  )

  return (
    <BuilderCtx.Provider value={builder}>
    <SortCtx.Provider value={sortApi}>
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

      {/* owner, 2026-10-06: the Summary is a vertical card — beside the form while the form area is at least 1000px wide
          (container query, so a collapsed sidebar counts), else under the cards. One element, placed by the grid. */}
      <div className="@container">
      <div className={summaryShown ? 'grid items-start gap-6 @min-[1000px]:grid-cols-[minmax(0,1fr)_300px]' : ''}>
      <div className="grid min-w-0 gap-6">
        {orderedSections.filter((id) => byId[id]).map((id, n, list) => (
          <div key={id} className="relative min-w-0">
            {editing && !simple && list.length > 1 && (
              <SectionMover title={SECTION_TITLES[id] ?? 'this card'} first={n === 0} last={n === list.length - 1}
                onMove={(dir) => {
                  const next = [...list]
                  const j = n + dir
                  ;[next[n], next[j]] = [next[j], next[n]]
                  setDraftOrder((o) => ({ ...o, [SECTION_ZONE]: next }))
                }} />
            )}
            {byId[id]}
          </div>
        ))}
        {/* Grow: Service Type is asked on step 2 (checkout) — previewed here, after the step-1 cards, so the field can
            be renamed, hidden with a default service, or shown as Grid | List; it is not a movable card */}
        {merchantMode && editing && growServiceCard && (
          <>
            <p className="flex items-center gap-3 text-[12px] font-bold uppercase tracking-wide text-ink-3">
              <span className="h-px flex-1 bg-warm-200" />Next step · Service &amp; payment<span className="h-px flex-1 bg-warm-200" />
            </p>
            {merchantServiceSection}
          </>
        )}
      </div>
      {summaryShown && (
        <aside className="min-w-0 @min-[1000px]:sticky @min-[1000px]:top-4 @min-[1000px]:max-h-[calc(100vh-2rem)] @min-[1000px]:overflow-y-auto">
          {summarySection}
        </aside>
      )}
      </div>
      </div>
      {fieldCard}
      {allFieldsDialog}

      {/* sticky footer — the form switch (owner, 2026-09-29: where the section strip was), then Go Back + Add Order */}
      <div data-form-footer className="sticky bottom-0 z-30 mt-6 flex items-center gap-x-4 rounded-xl border border-warm-200 bg-surface px-6 py-3 shadow-ds-1">
        {merchantMode ? (
          /* Grow step 1: the lowest rate for what is on screen (the service is picked at checkout), or the carried
             service's estimate */
          <div className="min-w-0 text-[13px]">
            {!mode ? <p className="truncate text-ink-3">Choose a load type in Handling to see rates</p>
              : !ready ? <p className="truncate text-ink-3">Rates appear once the addresses and packages are in</p>
              : !ftlOk ? <p className="truncate text-ink-3">Add a vehicle</p>
              : !quotes.length ? <p className="truncate text-ink-3">No service can be booked on this route — please contact support</p>
              : quote ? <p className="truncate text-ink"><b>{money(quote.net, currency)}</b><span className="text-ink-2"> estimated · {quote.name}{vehicleLine ? ` · ${vehicleLine}` : ''}</span></p>
              : <p className="truncate text-ink"><span className="text-ink-2">From </span><b>{money(cheapest ?? 0, currency)}</b><span className="text-ink-2"> · choose the service next</span></p>}
          </div>
        ) : (
          /* a view switch, not an action — quieter than Add Order */
          <Button variant="ghost" disabled={editing} onClick={() => setTier(simple ? 'full' : 'simplified')}>
            {simple ? 'Switch to Regular form' : 'Switch to Simplified'}
          </Button>
        )}
        {/* the actions never wrap away from each other — the strip gives way first */}
        <div className="ml-auto flex shrink-0 items-center gap-3">
          {editing
            ? <span className="text-[13px] text-ink-2">Save or cancel the form changes first</span>
            : showErrors && !canSubmit && (
              /* a way back to the gaps once the page has scrolled away from them */
              <button type="button" onClick={() => { const first = orderedSections.find((s) => !doneOf[s]); if (first) jumpTo(first) }}
                className="text-[13px] font-bold text-danger-fg hover:underline">
                {missingCount} field{missingCount === 1 ? '' : 's'} to fill or fix
              </button>
            )}
          {!editing && <Button variant="ghost" onClick={goBack}>Go Back</Button>}
          {/* enabled: a click with gaps shows them (errors appear only after this attempt) */}
          {merchantMode && <Button variant="outline" onClick={saveForLater} disabled={editing}>Save for later</Button>}
          <Button onClick={proceed} disabled={editing}>{merchantMode ? 'Continue' : liveEdit ? 'Save changes' : 'Add Order'}</Button>
        </div>
      </div>

      {/* the builder's dialogs (2026-10-05) — plain fields, outside the builder's label tools */}
      <BuilderCtx.Provider value={null}>
      {addCard !== false && (
        <AddFieldDialog card={addCard} portal={formPortal} taken={customDefs.map((d) => d.label.toLowerCase())}
          onClose={() => setAddCard(false)}
          onAdd={(def, required, alsoOther) => {
            setDraftCustom((ds) => [...ds, def])
            if (required) setRule(def.key, { required: true })
            if (!alsoOther) setOtherHidden((xs) => [...xs, def.key])
            setAddCard(false)
            /* the new field opens, ready to be set up — in All fields when it was added from there */
            if (allOpen) setAllKey(def.key); else pickField(def.key)
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
    </SortCtx.Provider>
    </BuilderCtx.Provider>
  )
}

/* ================================================================ the builder's field settings (2026-10-05 v3) ==== */

/** One switch in a field's settings: what it does in words, the switch on the right (greyed when it cannot change). */
function SettingRow({ title, hint, checked = false, onChange, disabled, control }: {
  title: string; hint: string; checked?: boolean; onChange?: (v: boolean) => void; disabled?: boolean
  /** a choice instead of the switch (Width, Position) — the same row */
  control?: ReactNode
}) {
  return (
    <div className={`flex items-start gap-4 px-4 py-3 ${disabled ? 'opacity-50' : ''}`}>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-bold text-ink">{title}</p>
        <p className="mt-0.5 text-[12px] text-ink-3">{hint}</p>
      </div>
      {control ? <span className="shrink-0">{control}</span>
        : <span className={`mt-0.5 shrink-0 ${disabled ? 'pointer-events-none' : ''}`}><Toggle checked={checked} onChange={onChange ?? (() => undefined)} /></span>}
    </div>
  )
}
/** A heading inside a field's settings. */
function PanelHeading({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-3 flex min-h-6 items-center justify-between gap-3">
      <p className="text-[12px] font-bold uppercase tracking-wide text-ink-3">{children}</p>
      {right}
    </div>
  )
}

/**
 * The builder's settings card for one field, anchored to the field in the preview (2026-10-05 v3, owner: "no side bar") —
 * portaled to <body> (cards are overflow-clipped), below the field when there is room, else above it, kept inside the
 * screen and following the field as the page scrolls. A click outside closes it; a click on another field moves it there;
 * a menu's list or a dialog opened from it does not count as outside.
 */
/** a field's element in the preview — the one in an open dialog first (the address pop-up while the form is edited), never the
    same field behind it */
const fieldEl = (k: string) => {
  const sel = `[data-field="${CSS.escape(k)}"]`
  return document.querySelector(`[data-modal-open] ${sel}`) ?? document.querySelector(sel)
}
const CARD_W = 380
function AnchoredCard({ anchorKey, onClose, children }: { anchorKey: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  /* the field sits in a dialog (the address pop-up): the card goes above it, and the rest of that dialog is "outside" */
  const inModal = useRef(false)
  const [pos, setPos] = useState<{ top?: number; bottom?: number; left: number; maxHeight: number; modal: boolean } | null>(null)
  useLayoutEffect(() => {
    const place = () => {
      const vw = window.innerWidth, vh = window.innerHeight
      const el = fieldEl(anchorKey)
      const modal = el ? !!el.closest('[data-modal-open]') : !!document.querySelector('[data-modal-open]')
      inModal.current = modal
      /* the field left the preview (hidden while "Show hidden fields" is off): the card waits in the middle */
      if (!el) { setPos({ top: 120, left: Math.max(16, (vw - CARD_W) / 2), maxHeight: vh - 160, modal }); return }
      const r = el.getBoundingClientRect()
      const gap = 14
      /* the form's sticky footer covers the bottom of the screen — the card stays above it (a pop-up sits over the footer) */
      const foot = modal ? 0 : (document.querySelector('[data-form-footer]') as HTMLElement | null)?.getBoundingClientRect().height ?? 0
      const below = vh - r.bottom - gap - 16 - foot
      const above = r.top - gap - 16
      const left = Math.min(Math.max(16, r.left - 6), vw - CARD_W - 16)
      setPos(below >= 420 || below >= above
        ? { top: r.bottom + gap, left, maxHeight: Math.max(240, below), modal }
        : { bottom: vh - r.top + gap, left, maxHeight: Math.max(240, above), modal })
    }
    place()
    window.addEventListener('scroll', place, true)
    window.addEventListener('resize', place)
    return () => { window.removeEventListener('scroll', place, true); window.removeEventListener('resize', place) }
  }, [anchorKey])
  useEffect(() => {
    const down = (e: MouseEvent) => {
      const t = e.target as Element | null
      if (!t || ref.current?.contains(t)) return
      if (t.closest?.('[role="listbox"], [data-field]')) return
      /* a dialog opened from the card is not outside — the dialog the FIELD sits in is */
      if (!inModal.current && t.closest?.('[data-modal-open]')) return
      onClose()
    }
    window.addEventListener('mousedown', down)
    return () => window.removeEventListener('mousedown', down)
  }, [onClose])
  if (!pos) return null
  const { modal, ...box } = pos
  return createPortal(
    /* above the nueva Modal (z-70) when its field is in one; menus (z-95) and tooltips (z-100) stay above it */
    <div ref={ref} role="dialog" aria-label="Field settings" style={{ ...box, width: CARD_W }}
      className={`fe-nueva fixed ${modal ? 'z-[80]' : 'z-[60]'} flex flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-ds-overlay`}>
      {children}
    </div>,
    document.body,
  )
}
/** An in-place choice on a card while the form is edited — how an address, the goods or the services are shown. */
function LayoutSeg<T extends string>({ label, value, options, onChange }: {
  label: string; value: T; options: { value: T; label: string; tip: string }[]; onChange: (v: T) => void
}) {
  /* ONE look for every builder choice (owner, 2026-10-07: "make sure the controls look consistent"): a segmented control at
     input height, the chosen one border-ink + warm-50 — the same everywhere (addresses, services, SKU list, field width) */
  return (
    <span className="inline-flex items-center gap-3">
      {label && <span className="text-[13px] text-ink-2">{label}</span>}
      <span role="radiogroup" aria-label={label || undefined} className="inline-flex h-8 shrink-0 gap-0.5 rounded-md border border-line bg-surface p-0.5">
        {options.map((o) => (
          <Tip key={o.value} text={o.tip}>
            <button type="button" role="radio" aria-checked={value === o.value} onClick={() => onChange(o.value)}
              className={`inline-flex h-full items-center whitespace-nowrap rounded border px-2.5 text-[12px] transition-colors
                ${value === o.value ? 'border-ink bg-warm-50 font-bold text-ink' : 'border-transparent text-ink-2 hover:bg-warm-50 hover:text-ink'}`}>
              {o.label}
            </button>
          </Tip>
        ))}
      </span>
    </span>
  )
}

/**
 * What may be typed in one field — edited live in the field's settings card: Any text (no check), a preset (numbers only, an
 * email, a phone number…) or the account's own regular expression, an optional length, the message people see, and
 * a "Try it" box.
 */
function FormatEditor({ value, onChange }: { value: FieldFormat | undefined; onChange: (f: FieldFormat | undefined) => void }) {
  const f: FieldFormat = value ?? { preset: 'any' }
  const [sample, setSample] = useState('')
  const set = (patch: Partial<FieldFormat>) => {
    const next = { ...f, ...patch }
    onChange(next.preset === 'any' ? undefined : next)
  }
  const preset = FORMAT_PRESETS.find((p) => p.value === f.preset) ?? FORMAT_PRESETS[0]
  const bad = patternError(f)
  const lenBad = !!f.minLength && !!f.maxLength && f.minLength > f.maxLength
  const tried = sample.trim() && f.preset !== 'any' ? formatError(f, sample) : null
  const num = (v: string) => { const n = Math.round(Number(v)); return v.trim() && Number.isFinite(n) && n > 0 ? n : undefined }
  return (
    <div className="grid gap-y-6">
      <SFld label="Allowed">
        <MenuSelect value={f.preset} options={FORMAT_PRESETS.map((p) => p.value)}
          labels={(v) => FORMAT_PRESETS.find((p) => p.value === v)?.label ?? v}
          onChange={(v) => set({ preset: v as FormatPreset })} />
      </SFld>
      {f.preset === 'custom' && (
        <SFld label="Pattern (regular expression)" error={bad && f.pattern ? bad : undefined} errorNow
          helper={bad ? undefined : 'eg, ^ORD[0-9]{6}$ = ORD + 6 digits'}>
          <Input value={f.pattern ?? ''} placeholder="^ORD[0-9]{6}$" onChange={(v) => set({ pattern: v })} />
        </SFld>
      )}
      {f.preset !== 'any' && <>
        <div className="grid grid-cols-2 gap-x-3">
          <SFld label="Shortest" error={lenBad ? 'Longer than the longest' : undefined} errorNow>
            <Input type="number" value={f.minLength ? String(f.minLength) : ''} placeholder="Any" onChange={(v) => set({ minLength: num(v) })} />
          </SFld>
          <SFld label="Longest">
            <Input type="number" value={f.maxLength ? String(f.maxLength) : ''} placeholder="Any" onChange={(v) => set({ maxLength: num(v) })} />
          </SFld>
        </div>
        <SFld label="Message when it does not match">
          <Input value={f.message ?? ''} placeholder={formatMessage({ ...f, message: '' }) || 'Does not match the required format'}
            onChange={(v) => set({ message: v })} />
        </SFld>
        <div className="rounded-lg bg-warm-50 p-3">
          <p className="mb-2 text-[13px] font-bold text-ink">Try it</p>
          <Input value={sample} placeholder={preset.example ? `eg, ${preset.example}` : 'Type a sample value'} onChange={setSample} />
          <p className={`mt-2 flex items-center gap-1.5 text-[12px] ${!sample.trim() || bad ? 'text-ink-3' : tried ? 'text-danger-fg' : 'text-success-fg'}`}>
            {!sample.trim() || bad ? 'Type a value to see if it passes.'
              : tried ? <><X size={13} />{tried}</> : <><Check size={13} />Looks good — this value passes.</>}
          </p>
        </div>
      </>}
    </div>
  )
}

/**
 * Add field — the account's own field in a card: its name, what kind of answer it takes, and whether it is required.
 * One choice only for the other form: show it there too (on by default).
 */
function AddFieldDialog({ card, portal, taken, onAdd, onClose }: {
  /** the card it was opened from; null = from All fields, the dialog asks where it goes */
  card: CustomFieldCard | null; portal: 'console' | 'grow'; taken: string[]
  onAdd: (def: CustomFieldDef, required: boolean, alsoOther: boolean) => void; onClose: () => void
}) {
  const [where, setWhere] = useState<CustomFieldCard>(card ?? 'sec-consignment')
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
      key: newCustomKey(), label: label.trim(), kind, card: where,
      ...(kind === 'list' ? { options } : {}),
      ...(placeholder.trim() && kind !== 'yesno' && kind !== 'date' ? { placeholder: placeholder.trim() } : {}),
    }, required && kind !== 'yesno', alsoOther)
  }
  return (
    <Modal open title="Add a field" subtitle={card ? `It appears in ${CUSTOM_FIELD_CARDS[card]}. You can rename it, move it, make it required or check what is typed later.`
      : 'Your own field, beside the system fields. You can rename it, move it, make it required or check what is typed later.'}
      onClose={onClose}
      footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={add}>Add field</Button></>}>
      <div className="grid gap-7 pb-4 pt-1">
        <SFld label="Field name" required error={tried && nameErr ? nameErr : undefined} errorNow>
          <Input value={label} placeholder="eg, PO Number" onChange={setLabel} />
        </SFld>
        {!card && (
          <SFld label="Where it shows">
            <MenuSelect value={where} options={Object.keys(CUSTOM_FIELD_CARDS)} labels={(v) => CUSTOM_FIELD_CARDS[v as CustomFieldCard]}
              onChange={(v) => setWhere(v as CustomFieldCard)} />
          </SFld>
        )}
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
