/**
 * Create Consignment — the Grow merchant portal's add form.
 *
 * ONE merged form (no more Simplified/Regular tier toggle) — rendered from
 * THE SAME COMPONENTS as the console's Add Consignment page
 * (pages/ConsignmentAdd, spec §15): the SectionCard chrome, the labelled
 * 4-column field grid (Nueva Input / MenuSelect / DateInput / Toggle,
 * components/consignmentForm), the RepeatableList rows for Packages / VAS
 * (components/consignmentRows), the console vehicles table and the sticky
 * required-fields footer.
 *
 * Fields that are rarely a per-order decision (Reference Number, Consignment
 * Number, Ship By Date, Tags, Payment, Label Format) sit behind a "Show more"
 * disclosure in Consignment Details instead of a second page tier — Reference
 * Number mirrors Order Number by default and Ship By Date defaults to today,
 * so neither is a blocking ask. Handling toggles (incl. `Dedicate Truck`, the
 * FTL switch) stay in the open, since Dedicate Truck fundamentally changes
 * the form — on, Vehicle Details takes the Packages slot.
 *
 * Ship From leads with the pickup-location dropdown as a compact card + edit
 * pencil (was Simplified-only); Ship To keeps its multi-drop address-book
 * search (was Regular-only) — both now the ONE experience regardless of
 * order complexity. Packages is the ONE list: each package's SKU contents
 * are optional, nested enrichment (was a separate SKU section cross-
 * referenced into Piece specs) — a package with no SKU lines ships as-is.
 *
 * Labels (incl. Form Builder relabels) and Form Builder hides come from the
 * console registry ConsignmentAdd/fieldConfig.ts (pure helpers only). Merchant
 * is never a field — it is the signed-in merchant, carried silently.
 * Deep links kept: `?draft=`, `?fromPickup=`, `?fromOverage=`, `?step=1|2`
 * (&type=FTL), `/add/vehicle`.
 */
import { useEffect, useMemo, useRef, useState, type ComponentProps, type KeyboardEvent, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import {
  ChevronDown, ChevronRight, CircleDot, CircleMinus, ClipboardList, CreditCard, FileCheck,
  Package, Package as PackageIcon, Pencil, Plus, ScanBarcode, ScanLine, Truck, Undo2, User,
  Wallet as WalletIcon, Warehouse, X,
} from 'lucide-react'
import { blankParty, CURRENCY } from '../../growOrders/seed'
import { growOrderActions, orderById, pickupRequestById, useGrowOrders } from '../../growOrders/store'
import type { Party, StoreLocation } from '../../growOrders/types'
import {
  currentMerchant, ownPackageTypes, packageTypesForMerchant, useMasters, useMerchantCode,
  type PackageType, type SkuItem,
} from '../../growOrders/masters'
import { ORIGIN_COUNTRIES } from '../../data/originCountries'
import { toast } from '../../nueva/toast'
import {
  Button, Checkbox, DateInput, IconButton, Input, MenuSelect, MultiSelect, MultiSelectDropdown, PageHeader, Panel,
  SearchInput, StatusPill, Toggle,
} from '../../nueva/components'
import { DateTimeRangeInput } from '../../nueva/DateRangeFilter'
import { RepeatableList } from '../../components/consignmentRows'
import {
  ChipToggle, Fld, Grid, InlineToggle, SectionCard, Segmented, SubHead, UnitBox,
} from '../../components/consignmentForm'
import { money, OTHER_ADDRESS, partyLine, partyOk, prWindow, storeOptionLabel } from './utils'
import { useReceiverBook, usePickupLocations, type BookEntry } from './pickupLocations'
import {
  ADDITIONAL_SERVICES, DEFAULT_FTL_SERVICE, DRAFT_KEY, FTL_SERVICE_CODES, PARCEL_SERVICES, clearDraftKeys,
  coerceVehicleType, ftlQuoteVehicles, ftlServiceType, setDraftSidecar, totalLoadKg, vehicleSpec, vehiclesFor,
  vehiclesOf, volKg, type ConsignmentFields, type FtlVehicle, type OrderDraft, type Parcel, type ParcelItem,
  type ParcelService,
} from '../../growOrders/draft'
/* the console's field registry — pure module, read-only here */
import { fieldHidden, fieldLabel, loadFieldConfig, loadFormBehavior } from '../ConsignmentAdd/fieldConfig'

/* ---- option lists ---- */
const CONSIGNMENT_TYPES = ['Forward', 'Reverse', 'Exchange', 'Transfer', 'Service']
/** payment options for the Payment widget — a gateway pick determines the next step
 * (redirect to that gateway) rather than collecting an amount inline; Wallet checks
 * the merchant's pre-loaded balance against the order total instead. */
const PAYMENT_OPTIONS = [
  { code: 'COD', label: 'Cash on Delivery', sub: 'Collected by the driver on delivery' },
  { code: 'Card', label: 'Card', sub: "Charged to the customer's card" },
  { code: 'Wallet', label: 'Wallet', sub: 'Pay from your pre-loaded FarEye wallet balance' },
  { code: 'Payment Gateway (ANZ)', label: 'Payment Gateway', sub: 'ANZ — redirects to complete payment' },
]
/** sample pre-loaded balance — the portal has no wallet API yet (see Wallet in the nav) */
const WALLET_BALANCE = 1250
/** sample saved cards — the portal has no card-vault API; a merchant can also add a new one */
const SAVED_CARDS = [
  { id: 'card_1', brand: 'Visa', last4: '4242', expiry: '08/27' },
  { id: 'card_2', brand: 'Mastercard', last4: '5678', expiry: '11/26' },
]
/** sample purchase orders for a postpaid (po) merchant — no PO API exists yet */
const MERCHANT_PURCHASE_ORDERS = [
  { poNumber: 'PO-10234', totalAmount: 5000, remainingAmount: 1820 },
  { poNumber: 'PO-10251', totalAmount: 2000, remainingAmount: 2000 },
  { poNumber: 'PO-10267', totalAmount: 800, remainingAmount: 120 },
]
const RTO_MODES = ['Same As Ship From', 'Use Different Address']
/** common instruction presets — the merchant can also type a custom one */
const INSTRUCTION_OPTIONS = [
  'Leave at the door', 'Hand to recipient only', 'Call before delivery',
  'Ring the doorbell', 'Do not ring the doorbell', 'Leave with security / reception',
  'Fragile — handle with care', 'Signature required',
]
const DIAL_CODES = ['+63', '+27', '+264', '+267', '+1', '+44', '+91']
const DIM_UOMS = ['CM', 'IN', 'M']
const WEIGHT_UOMS = ['KG', 'LB', 'G']
/** rate-card price of a former FTL "Additional Service" — VAS itself is gone,
 * but an FTL booking still prices any of these named on the draft (legacy path). */
const vasPrice = (service: string) => ADDITIONAL_SERVICES.find((a) => a.code === service)?.price ?? 0

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
const ORIGIN_OPTS = ORIGIN_COUNTRIES.map((c) => ({ value: c }))
const opts = (xs: readonly string[]) => xs.map((value) => ({ value }))
const SERVICES = PARCEL_SERVICES

const today = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
/** staging mints the package id on insert */
const newPackageId = () => `PKG${Math.random().toString(36).slice(2, 8).toUpperCase()}`
const blankItem = (): ParcelItem => ({ skuCode: null, name: '', quantity: 1, weightKg: 0 })
/** Packages ship as-is by default — SKU contents are optional, added only when the merchant wants to record them. */
const newParcel = (): Parcel => ({
  packageId: newPackageId(),
  cargoType: CARGO_TYPES[0], packageTypeCode: CUSTOM_PACKAGE, packageTypeName: CUSTOM_PACKAGE_NAME,
  items: [], itemInfo: '', quantity: 1, weight: 1, l: 10, w: 10, h: 10, weightMode: 'auto',
  trackingNumber: '', palletSpace: '', description: '',
})
const kg = (n: number, d = 4) => `${Number(n.toFixed(d))} kg`
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
const clonePackage = (p: Parcel): Parcel => ({ ...p, packageId: newPackageId(), trackingNumber: '', items: (p.items ?? []).map((it) => ({ ...it })) })
const isBlankItem = (it: ParcelItem) => !it.skuCode && !it.name.trim()
const itemCount = (p: Parcel) => (p.items ?? []).filter((it) => !isBlankItem(it)).reduce((n, it) => n + it.quantity, 0)
const codeFor = (p: Party) => (p.businessName || p.name || p.city || 'store')
  .toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 14) || 'STORE'
const itemInfoOf = (p: Parcel) =>
  (p.items?.length ? p.items.map((it) => it.name.trim()).filter(Boolean).join(', ') : p.itemInfo)

/* ---- Services — one carrier runs parcel bookings, another runs dedicated trucks ---- */
const PARCEL_CARRIER = '2GO Express'
const FTL_CARRIER = '2GO Logistics'
/** same state = the fast local lane; anything else = the interisland lane — the
 * only distance signal this portal has, so it stands in for a real rate-by-lane API. */
type Lane = 'local' | 'regional'
const laneOf = (from: Party, to: Party): Lane => (from.state && to.state && from.state === to.state ? 'local' : 'regional')
const REGIONAL_SURCHARGE = 60
const REGIONAL_EXTRA_DAYS = 1
interface ServiceQuote { code: string; carrier: string; days: number; price: number }
/** a parcel service tier, priced and timed for the sender/receiver lane */
const quoteFor = (tier: ParcelService, lane: Lane): ServiceQuote => ({
  code: tier.code, carrier: PARCEL_CARRIER,
  days: tier.days + (lane === 'regional' ? REGIONAL_EXTRA_DAYS : 0),
  price: tier.price + (lane === 'regional' ? REGIONAL_SURCHARGE : 0),
})

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
      className={`flex w-full items-center gap-3 px-3 text-left transition-colors ${on ? 'bg-brand-50' : 'hover:bg-warm-50'}`}>
      {children}
    </button>
  )
}

/* ------------------------------------------------------------ form chrome ---- */

interface Opt { value: string; label?: string }
const TEXTAREA = `w-full rounded-md border border-warm-300 bg-surface px-3 py-2 text-[13px] text-ink
  placeholder:text-warm-400 transition-shadow focus:border-brand-500 focus:ring-[3px] focus:ring-brand-500/20
  disabled:bg-warm-50 disabled:text-ink-3`
/** small "Show more" disclosure link — the merged form's stand-in for the old page-level tier switch */
function MoreToggle({ open, onToggle, label }: { open: boolean; onToggle: () => void; label: string }) {
  return (
    <button type="button" onClick={onToggle}
      className="mt-4 inline-flex items-center gap-1 text-[12.5px] font-bold text-brand-500 hover:text-brand-600">
      {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
      {label}
    </button>
  )
}

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
function F({ label, required, className = '', type, value, options, onChange, placeholder, error, helper, disabled, multiline, rows = 3, searchable }: {
  label: string; required?: boolean; className?: string; type?: string; value: string; options?: Opt[]
  onChange: (v: string) => void; placeholder?: string; error?: string; helper?: ReactNode; disabled?: boolean
  multiline?: boolean; rows?: number; searchable?: boolean
}) {
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
  return <Fld label={label} required={required} error={!!error} helper={helper} className={className}>{control}</Fld>
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
  return (
    <div className={disabled ? 'pointer-events-none opacity-60' : ''}>
      <UnitBox unit={unit} invalid={!!error}>
        <input type="number" value={text} placeholder={placeholder} disabled={disabled} onChange={(e) => commit(e.target.value)}
          className="h-full w-full min-w-0 flex-1 rounded-md bg-transparent px-3 text-[13px] tabular-nums text-ink placeholder:text-warm-400 focus:outline-none
                     [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none" />
      </UnitBox>
    </div>
  )
}
function FNum({ label, required, className = '', helper, ...p }: ComponentProps<typeof NumBox> & { label: string; required?: boolean; className?: string; helper?: ReactNode }) {
  return <Fld label={label} required={required} error={!!p.error} helper={helper} className={className}><NumBox {...p} /></Fld>
}

/** A party's window — ONE range control (the console address-window grammar) over 'YYYY-MM-DDTHH:mm' start / end. */
function WindowRange({ label, start, end, onChange }: {
  label: string; start: string; end: string; onChange: (w: { windowStart: string; windowEnd: string }) => void
}) {
  return (
    <>
      <SubHead label={label} />
      <div className="max-w-md">
        <DateTimeRangeInput
          startDate={dateOf(start)} startTime={timeOf(start)} endDate={dateOf(end)} endTime={timeOf(end)}
          placeholder={`Select ${label.toLowerCase()}`}
          onApply={(w) => onChange({
            windowStart: w.startDate ? `${w.startDate}T${w.startTime || '00:00'}` : '',
            windowEnd: w.endDate ? `${w.endDate}T${w.endTime || '23:59'}` : '',
          })} />
      </div>
    </>
  )
}

/** A declaration: the Nueva Checkbox, its label and an optional muted sub-line. */
function Tick({ checked, onChange, children, sub }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode; sub?: ReactNode }) {
  return (
    <div>
      <Checkbox checked={checked} onChange={onChange} label={<span className="text-ink">{children}</span>} />
      {sub && <p className="ml-[22px] text-[12px] text-ink-3">{sub}</p>}
    </div>
  )
}

/** Country Code + Contact Number side by side in one grid cell, as the console address block draws them. */
function PhoneField({ label, required, code, number, onCode, onNumber, disabled, error }: {
  label: string; required?: boolean; code: string; number: string
  onCode: (v: string) => void; onNumber: (v: string) => void; disabled?: boolean; error?: string
}) {
  return (
    <div className="flex min-w-0 gap-3">
      <div className="w-[84px] shrink-0">
        <Fld label="Country Code">
          {disabled ? <ReadBox value={code || '+63'} />
            : <MenuSelect value={code || '+63'} options={DIAL_CODES} onChange={onCode} />}
        </Fld>
      </div>
      <div className="min-w-0 flex-1">
        <Fld label={label} required={required} error={!!error}>
          <Input value={number} disabled={disabled} placeholder="eg, 1234567890" onChange={(v) => onNumber(v.replace(/[^\d ]/g, ''))} />
        </Fld>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------ address block ---- */

/**
 * Staging's Regular address block, in its order, split under the console's
 * Contact Details / Address Details sub-heads:
 *   Location Code · Company Name · {Sender|Customer} Name* · Contact Number
 *   Email · Address Line 1* · Address Line 2 · Address Line 3
 *   Landmark · Country* · Postal Code · Suburb / County
 *   City* · State* · Latitude · Longitude
 *   {Pick Up|Delivery} window · Floor Number · Lift Available
 * `locked` = a Location Master address picked from the list — shown, not retyped.
 */
function PartyFields({ party, set, nameLabel, windowLabel, requireContact, locked, locationCode, hid, showErrors, floorLift = true, advancedDefaultOpen }: {
  party: Party; set: (patch: Partial<Party>) => void
  nameLabel: string; windowLabel: string | null; requireContact?: boolean; locked?: boolean
  locationCode?: ReactNode; hid: (k: string) => boolean; showErrors: boolean; floorLift?: boolean
  /** whether the "Show more address details" disclosure starts open */
  advancedDefaultOpen?: boolean
}) {
  const [moreOpen, setMoreOpen] = useState(!!advancedDefaultOpen)
  const err = (v: string | undefined, req = true) => (showErrors && req && !locked && !filled(v) ? 'Required field.' : undefined)
  const text = (k: keyof Party, label: string, o: { required?: boolean; type?: string; placeholder?: string } = {}) => (
    <F label={label} required={o.required} type={o.type} placeholder={o.placeholder}
      value={String(party[k] ?? '')} disabled={locked} error={err(String(party[k] ?? ''), !!o.required)}
      onChange={(v) => set({ [k]: v } as Partial<Party>)} />
  )
  const showMore = !hid('addrCoordinates') || (floorLift && !hid('addrFloorLift')) || (!!windowLabel && !hid('addrWindow'))
  return (
    <>
      <SubHead label="Contact Details" first />
      <Grid>
        {locationCode}
        {!hid('addrCompanyName') && text('businessName', 'Company Name', { placeholder: 'eg, Random Company' })}
        {text('name', nameLabel, { required: true, placeholder: 'eg, John Doe' })}
        <PhoneField label="Contact Number" required={requireContact} code={party.countryCode ?? ''} number={party.contactNumber}
          disabled={locked} error={err(party.contactNumber, !!requireContact)}
          onCode={(v) => set({ countryCode: v })} onNumber={(v) => set({ contactNumber: v })} />
        {!hid('addrEmail') && text('email', 'Email', { type: 'email', placeholder: 'eg, johndoe@xyz.com' })}
      </Grid>
      <SubHead label="Address Details" />
      <Grid>
        {text('line1', 'Address Line 1', { required: true, placeholder: 'eg, Building No.' })}
        {!hid('addrLines23') && <>{text('line2', 'Address Line 2', { placeholder: 'eg, Street 1 A' })}{text('line3', 'Address Line 3', { placeholder: 'eg, Behind High School' })}</>}
        {!hid('addrLandmark') && text('landmark', 'Landmark', { placeholder: 'eg, Behind High School' })}
        <F label="Country" required value={party.country} disabled={locked} error={err(party.country)}
          options={opts(COUNTRIES)} placeholder="Select country" onChange={(v) => set({ country: v })} />
        <F label="Postal Code" value={party.postalCode} disabled={locked}
          options={opts(POSTCODES)} placeholder="eg, 1300" onChange={(v) => set({ postalCode: v })} />
        {!hid('addrSuburb') && text('county', 'Suburb / County')}
        {text('city', 'City', { required: true })}
        <F label="State" required value={party.state} disabled={locked} error={err(party.state)}
          options={opts(STATES)} placeholder="Select state" onChange={(v) => set({ state: v })} />
      </Grid>

      {showMore && (
        <>
          <MoreToggle open={moreOpen} onToggle={() => setMoreOpen((v) => !v)} label="Show more address details" />
          {moreOpen && (
            <div className="mt-4">
              <Grid>
                {!hid('addrCoordinates') && <>{text('latitude', 'Latitude', { type: 'number' })}{text('longitude', 'Longitude', { type: 'number' })}</>}
                {floorLift && !hid('addrFloorLift') && <>
                  {text('floorNumber', 'Floor Number')}
                  <InlineToggle label="Lift Available" checked={!!party.liftAvailable} onChange={(v) => set({ liftAvailable: v })} />
                </>}
              </Grid>
              {windowLabel && !hid('addrWindow') && (
                <WindowRange label={`${windowLabel} Window`} start={party.windowStart ?? ''} end={party.windowEnd ?? ''}
                  onChange={(w) => set(w)} />
              )}
            </div>
          )}
        </>
      )}
    </>
  )
}

/** Ship To's address book — Location Master delivery rows, then past recipients. */
function AddressBookSearch({ book, onPick }: { book: BookEntry[]; onPick: (p: Party) => void }) {
  const [q, setQ] = useState('')
  const hits = useMemo(() => book
    .filter((b) => !q || [b.party.name, b.party.contactNumber, b.party.businessName, partyLine(b.party)]
      .join(' ').toLowerCase().includes(q.toLowerCase()))
    .slice(0, 8), [book, q])
  const { open, setOpen, hi, setHi, ref, popRef, pos, onKeyDown, pick } = useAutocomplete<BookEntry>(hits, (b) => { onPick({ ...b.party }); setQ('') })
  return (
    <div ref={ref} className="relative" onFocus={() => { if (!open) setOpen(true) }} onKeyDown={onKeyDown} role="presentation">
      <SearchInput value={q} onChange={(v) => { setQ(v); setHi(0); setOpen(true) }}
        placeholder="Search from address book by name, number, address and company name..." />
      {open && (
        <AcPop pos={pos} popRef={popRef}>
          {hits.map((b, i) => (
            <AcRow key={i} on={i === hi} onHover={() => setHi(i)} onPick={() => pick(b)}>
              <span className="min-w-0 flex-1 py-1.5">
                <span className="flex items-center gap-2">
                  <span className="min-w-0 truncate text-[13px] font-bold text-ink">
                    {b.party.name}{b.party.businessName ? ` · ${b.party.businessName}` : ''}
                  </span>
                  {b.tag && <StatusPill label={b.tag} />}
                </span>
                <span className="block truncate text-[12px] text-ink-3">{partyLine(b.party)}</span>
              </span>
            </AcRow>
          ))}
          {hits.length === 0 && (
            <p className="px-3 py-2 text-[12.5px] text-ink-3">
              {q ? `No address matches “${q}”` : 'No saved addresses yet — fill in the fields below'}
            </p>
          )}
        </AcPop>
      )}
    </div>
  )
}

/** Ship From's pickup-address search — the merchant's saved pickup locations, searched by name (incl. "Other address…"). */
function PickupSearch({ options, onPick }: { options: Opt[]; onPick: (code: string) => void }) {
  const [q, setQ] = useState('')
  const hits = useMemo(() => options
    .filter((o) => !q || (o.label ?? o.value).toLowerCase().includes(q.toLowerCase()))
    .slice(0, 8), [options, q])
  const { open, setOpen, hi, setHi, ref, popRef, pos, onKeyDown, pick } = useAutocomplete<Opt>(hits, (o) => { onPick(o.value); setQ('') })
  return (
    <div ref={ref} className="relative" onFocus={() => { if (!open) setOpen(true) }} onKeyDown={onKeyDown} role="presentation">
      <SearchInput value={q} onChange={(v) => { setQ(v); setHi(0); setOpen(true) }}
        placeholder="Search your pickup addresses..." />
      {open && (
        <AcPop pos={pos} popRef={popRef}>
          {hits.map((o, i) => (
            <AcRow key={o.value} on={i === hi} onHover={() => setHi(i)} onPick={() => pick(o)}>
              <span className="min-w-0 flex-1 truncate py-1.5 text-[13px] text-ink">{o.label ?? o.value}</span>
            </AcRow>
          ))}
          {hits.length === 0 && <p className="px-3 py-2 text-[12.5px] text-ink-3">No address matches “{q}”</p>}
        </AcPop>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ SKUs ---- */

/**
 * SKU Code — the SKU-master autocomplete. Picking binds the line: name,
 * category, HSN Code, Origin Country, weight and dimensions come with it.
 * A bound line shows its code with an unlink ×; typing a SKU Name instead
 * keeps the line a custom one.
 */
function SkuCode({ item, skus, onPick, onUnlink, autoFocus }: {
  item: ParcelItem; skus: SkuItem[]; onPick: (s: SkuItem) => void; onUnlink: () => void; autoFocus?: boolean
}) {
  const [q, setQ] = useState('')
  const all = useMemo(() => skus.filter((s) => s.enabled).slice().sort((a, b) => a.code.localeCompare(b.code)), [skus])
  const needle = q.trim().toLowerCase()
  const matches = useMemo(() => (needle ? all.filter((s) => `${s.code} ${s.name} ${s.category}`.toLowerCase().includes(needle)) : all), [all, needle])
  const hits = useMemo(() => matches.slice(0, 8), [matches])
  const { open, setOpen, hi, setHi, ref, popRef, pos, onKeyDown, pick } = useAutocomplete<SkuItem>(hits, (s) => { onPick(s); setQ('') })
  const more = matches.length - hits.length
  /* Nueva Input takes no ref — focus through the wrapper */
  useEffect(() => { if (autoFocus) ref.current?.querySelector('input')?.focus() }, [autoFocus, ref])
  if (item.skuCode) {
    return (
      <span className="flex h-8 items-center gap-1 rounded-md border border-warm-300 bg-warm-50 px-3 text-[13px] text-ink">
        <span className="min-w-0 flex-1 truncate">{item.skuCode}</span>
        <button type="button" aria-label="Unlink SKU" title="Unlink from the SKU master" onClick={onUnlink}
          className="shrink-0 text-warm-400 hover:text-ink"><X size={13} /></button>
      </span>
    )
  }
  return (
    <div ref={ref} className="relative" onFocus={() => { if (!open) setOpen(true) }} onKeyDown={onKeyDown}>
      <SearchInput value={q} onChange={(v) => { setQ(v); setHi(0); setOpen(true) }} placeholder="Search SKU" />
      {open && hits.length > 0 && (
        <AcPop pos={pos} popRef={popRef}>
          {hits.map((s, i) => (
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

/** One-line identity of a collapsed repeatable row — the console's summary facts. */
function Facts({ items }: { items: (string | null | undefined | false)[] }) {
  const shown = items.filter(Boolean) as string[]
  if (!shown.length) return <span className="text-[13px] text-ink-3">Not filled in yet</span>
  return <span className="block truncate text-[13px] text-ink-2">{shown.join('  ·  ')}</span>
}

/* --------------------------------------------------------------- summary ---- */

function SummaryBlock({ title, children, onJump }: { title: string; children: ReactNode; onJump?: () => void }) {
  return (
    <div className="flex gap-3 border-t border-line py-3">
      <div className="min-w-0 flex-1">
        <p className="text-[12px] font-bold text-ink-3">{title}</p>
        <div className="mt-0.5 text-[13px] leading-[1.5] text-ink">{children}</div>
      </div>
      {onJump && <button type="button" onClick={onJump} className="self-start text-[12.5px] font-bold text-brand-500 hover:text-brand-600">Edit</button>}
    </div>
  )
}

const jumpTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
const ICON = 'text-brand-500'

/* -------------------------------------------------------------------- page ---- */
export default function AddOrderPage() {
  const nav = useNavigate()
  const db = useGrowOrders()
  const masters = useMasters()
  const merchant = currentMerchant(masters.merchants, useMerchantCode())
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
  const saved = draftId ? orderById(draftId)?.draft ?? null : null
  const pr = pickupRequestById(params.get('fromPickup'))
  const [ovPrId = '', ovId = ''] = (params.get('fromOverage') ?? '').split(':')
  const ovPr = pickupRequestById(ovPrId || null)
  const ovScan = ovPr?.overages.find((v) => v.id === ovId && !v.orderId)
  const fromOverage = ovPr && ovScan ? { pr: ovPr, scan: ovScan } : undefined
  const ftlFirst = !fromOverage
    && (params.get('type') === 'FTL' || pathname.endsWith('/vehicle') || pr?.shipmentType === 'FTL' || saved?.shipmentType === 'FTL')
  const overageStore = fromOverage ? stores.find((s) => s.code === fromOverage.pr.storeCode) : undefined

  /* ---- the console registry: relabels + Form Builder / Base Modules hides ---- */
  const [fieldCfg] = useState(loadFieldConfig)
  const [behavior] = useState(loadFormBehavior)
  const hid = (key: string) => fieldHidden(key, fieldCfg, behavior)
  const lbl = (key: string) => fieldLabel(key, fieldCfg)
  const advancedDefaultOpen = behavior.defaultMode === 'full'

  /* ---- Ship From ---- */
  const firstSender = (): Party => saved?.sender
    ?? overageStore?.party
    ?? (pr ? pr.shipFrom ?? stores.find((s) => s.code === pr.storeCode)?.party ?? blankParty()
      : stores[0]?.party ?? blankParty())
  const storeOf = (p: Party) => stores.find((s) => s.party.name === p.name && s.party.line1 === p.line1)
    ?? db.stores.find((s) => s.party.name === p.name && s.party.line1 === p.line1)
  const [sender, setSender] = useState<Party>(firstSender)
  const [senderStore, setSenderStore] = useState(() => {
    const p = firstSender()
    const st = storeOf(p)
    if (st) return st.code
    if (partyOk(p)) return OTHER_ADDRESS
    return stores.length ? stores[0].code : OTHER_ADDRESS
  })
  const [saveSender, setSaveSender] = useState(false)
  const [editFrom, setEditFrom] = useState(false)

  /* ---- Ship To (multi-drop) + RTO ---- */
  const [receiver, setReceiver] = useState<Party>(() => saved?.receiver
    ?? (pr ? pr.shipTo ?? blankParty() : jump ? { ...blankParty(), ...db.orders[2]?.receiver } : blankParty()))
  const [drops, setDrops] = useState<Party[]>(() => saved?.drops ?? [])
  const [rto, setRto] = useState<Party>(() => saved?.consignment?.rto ?? blankParty())

  /* ---- Consignment Details (+ handling, instructions, RTO mode, VAS, carrier) ---- */
  const [c, setCState] = useState<ConsignmentFields>(() => {
    const qa = jump && !saved ? `QA${Date.now().toString(36).toUpperCase().slice(-8)}` : ''
    return {
      orderNumber: qa, referenceNumber: qa, consignmentNumber: '', exchangeOrderNumber: '',
      consignmentType: 'Forward', task: 'Delivery', shipByDate: today(), tags: [], labelFormat: '',
      paymentMode: '', orderAmount: null,
      schedulingConfirmation: false, dedicateTruck: ftlFirst, totalLoadingTime: null,
      clearanceRequired: false, scannable: false, splittable: false,
      specialInstructions: '', rtoMode: RTO_MODES[0], vas: [],
      ...saved?.consignment,
      /* an older FTL draft kept its extras in additionalServices — they are VAS rows now */
      ...(saved && !saved.consignment?.vas?.length && saved.additionalServices?.length
        ? { vas: saved.additionalServices.map((sv) => ({ level: 'CONSIGNMENT' as const, skuCode: '', service: sv, serviceTimeMin: 0, remark: '' })) } : {}),
      ...(ftlFirst ? { dedicateTruck: true } : {}),
      ...(fromOverage ? { dedicateTruck: false } : {}),
    }
  })
  const setC = (patch: Partial<ConsignmentFields>) => setCState((x) => ({ ...x, ...patch }))
  const [instructions, setInstructions] = useState(saved?.instructions ?? '')
  /* One merged Instructions field feeds both underlying paths — ops-facing
     consignmentDetails.specialInstructions and driver-facing OrderDraft.instructions —
     since a merchant doesn't think in terms of that internal split. */
  const [instructionTags, setInstructionTags] = useState<string[]>(() => {
    const seed = saved?.instructions || saved?.consignment?.specialInstructions || ''
    return seed ? seed.split('; ').filter(Boolean) : []
  })
  const setInstructionTagsAndSync = (next: string[]) => {
    setInstructionTags(next)
    const joined = next.join('; ')
    setC({ specialInstructions: joined })
    setInstructions(joined.slice(0, 150))
  }

  /* ---- Payment: Card picks a saved card or a freshly-typed one; postpaid (po) links a PO ---- */
  const [selectedCard, setSelectedCard] = useState('')
  const [addingCard, setAddingCard] = useState(false)
  const [newCard, setNewCard] = useState({ number: '', name: '', expiry: '', cvv: '' })
  const cardOk = selectedCard !== '' || (addingCard && !!newCard.number.trim() && !!newCard.name.trim() && !!newCard.expiry.trim() && !!newCard.cvv.trim())
  const [selectedPo, setSelectedPo] = useState('')

  /* ---- FTL: Dedicate Truck on → Vehicle Details ---- */
  const isFtl = !fromOverage && !!c.dedicateTruck
  /* Ship To is optional on a dedicated-truck booking (the merchant may not know or
     want to disclose the drop yet) — collapsed by default, opened by choice or if
     a resumed draft already has one. */
  const [shipToOpen, setShipToOpen] = useState(() => !isFtl || partyOk(receiver) || drops.length > 0)
  const [ftlService, setFtlService] = useState(saved?.ftlServiceType || pr?.ftlServiceType || DEFAULT_FTL_SERVICE)
  const [rows, setRows] = useState<VehicleRow[]>(() => {
    if (saved?.shipmentType === 'FTL') return rowsOf(vehiclesOf(saved))
    if (pr?.shipmentType === 'FTL') return rowsOf(vehiclesOf({ vehicleType: pr.vehicleType, vehicleUnit: pr.vehicleUnit, actualLoad: pr.expectedWeightKg, drops: [] }))
    return [{ vehicleType: '8 Ton Truck', count: 1, loadKg: 6400, addressIdx: [0] }]
  })
  const vehicles = useMemo(() => vehiclesOfRows(rows), [rows])
  /** set when switching Dedicate Truck on moved the form's Service Type onto an FTL service */
  const [serviceNote, setServiceNote] = useState('')

  /* ---- packages (Package & SKU / SKU + Piece) ---- */
  const [parcels, setParcels] = useState<Parcel[]>(() => {
    if (saved?.parcels?.length && saved.shipmentType !== 'FTL') return saved.parcels.map((p) => ({ ...p, packageId: p.packageId || newPackageId() }))
    const p = newParcel()
    const w = fromOverage?.scan.weightKg
    /* the overage barcode IS this package's tracking number */
    return [fromOverage ? { ...p, weight: w ?? p.weight, weightMode: w ? 'manual' : 'auto', trackingNumber: fromOverage.scan.barcode } : p]
  })
  const [secure] = useState(saved?.secure ?? false)
  const [noDg, setNoDg] = useState(true)
  const [service, setService] = useState(saved && saved.shipmentType !== 'FTL' ? saved.service : '')
  const [showErrors, setShowErrors] = useState(false)

  const receiverBook = useReceiverBook(db.orders)
  const fromList = !!senderStore && senderStore !== OTHER_ADDRESS
  const allDrops = [receiver, ...drops]

  /* ---- derived booking numbers ---- */
  const totals = useMemo(() => ({
    qty: parcels.reduce((n, p) => n + p.quantity, 0),
    items: parcels.reduce((n, p) => n + p.quantity * itemCount(p), 0),
    dead: parcels.reduce((n, p) => n + p.weight * p.quantity, 0),
    vol: parcels.reduce((n, p) => n + volKg(p) * p.quantity, 0),
    chargeable: parcels.reduce((n, p) => n + Math.max(p.weight, volKg(p)) * p.quantity, 0),
  }), [parcels])
  const fromPr = pr && isFtl ? pr : undefined
  const units = vehicles.length
  const vehicleType = vehicles[0]?.vehicleType ?? ''
  const actualLoad = totalLoadKg(vehicles)
  /* the chosen VAS names — what `additionalServices` carries for compatibility; the rate card prices them */
  const addServices = (c.vas ?? []).map((v) => v.service).filter(Boolean)
  const vasTotal = addServices.reduce((n, sv) => n + vasPrice(sv), 0)
  const lane = laneOf(sender, receiver)
  const parcelQuotes = SERVICES.map((s) => quoteFor(s, lane))
  const parcelSvc = parcelQuotes.find((q) => q.code === service) ?? parcelQuotes[0]
  const svc = isFtl
    ? { code: ftlService, carrier: FTL_CARRIER, days: ftlServiceType(ftlService).days, price: ftlQuoteVehicles(vehicles, drops.length, addServices) }
    : { ...parcelSvc, price: parcelSvc.price + vasTotal }
  const addressOptions = allDrops.map((d, i) => ({ value: String(i), label: `Address ${i + 1}${d.name ? ` · ${d.name}` : ''}${d.city ? `, ${d.city}` : ''}` }))
  const uncovered = allDrops.map((_, i) => i).filter((i) => !vehicles.some((v) => v.addressIdx.includes(i)))
  const overloaded = vehicles.filter((v) => v.actualLoadKg > vehicleSpec(v.vehicleType).payloadKg)
  const capacityKg = vehicles.reduce((n, v) => n + vehicleSpec(v.vehicleType).payloadKg, 0)
  const skuLines = parcels.flatMap((p, i) => (p.items ?? []).map((it, k) => ({ it, i, k })))

  /* ---- identifiers: Order Number is the ONE merchant-facing identifier;
     Reference Number/Consignment Number are never shown, just mirrored for the API ---- */
  const effectiveOrder = c.orderNumber ?? ''
  const effectiveRef = effectiveOrder

  /* ------------------------------------------------ completion + validation */
  const consignmentReq = [filled(effectiveOrder), !!c.consignmentType]
  /* a Location Master row may be sparse and is not the merchant's to retype */
  const fromReq = fromList ? [filled(sender.name), filled(sender.line1)]
    : [sender.name, sender.line1, sender.country, sender.city, sender.state].map(filled)
  /* Dedicate Truck bookings assign drops to vehicles by capacity, not a precise
     address up front — Ship To stays available to enter, just never blocking. */
  const toReq = isFtl ? [] : allDrops.flatMap((d) => [d.name, d.contactNumber, d.line1, d.country, d.city, d.state].map(filled))
  const rtoReq = c.rtoMode === RTO_MODES[0] ? [true] : [rto.name, rto.line1, rto.country, rto.city, rto.state].map(filled)
  const pieceReq = isFtl
    ? [!!ftlService, vehicles.length > 0, uncovered.length === 0,
      ...rows.map((r) => !!r.vehicleType && r.count >= 1 && r.loadKg > 0 && r.addressIdx.length > 0), noDg]
    : [...parcels.map((p) => p.quantity > 0 && p.weight > 0 && p.l > 0 && p.w > 0 && p.h > 0), noDg]
  const skuReq = isFtl ? [] : skuLines.map(({ it }) => isBlankItem(it) || (filled(it.name) && it.quantity >= 1))
  /* the Services section only exists for LTL — Service Type (FTL) already picks the FTL rate */
  const carrierReq = isFtl ? [] : [!!service]
  const paymentReq = merchant?.postpaidTerms === 'none' ? []
    : merchant?.postpaidTerms === 'po' ? [!!selectedPo]
    : [!!c.paymentMode, c.paymentMode !== 'Card' || cardOk]
  const allReq = [...consignmentReq, ...fromReq, ...toReq, ...rtoReq, ...pieceReq, ...skuReq, ...carrierReq, ...paymentReq]
  const filledCount = allReq.filter(Boolean).length
  const canSubmit = filledCount === allReq.length
  const missingCount = allReq.length - filledCount
  const done = (xs: boolean[]) => xs.every(Boolean)
  const reqErr = (ok: boolean) => (showErrors && !ok ? 'Required field.' : undefined)

  /* ------------------------------------------------------------ mutations */
  const setParcel = (i: number, patch: Partial<Parcel>) => setParcels((ps) => ps.map((x, j) => (j === i ? { ...x, ...patch } : x)))
  const setRow = (i: number, patch: Partial<VehicleRow>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)))
  const addVehicle = () => setRows((rs) => [...rs, {
    vehicleType: rs[rs.length - 1]?.vehicleType ?? vehiclesFor(ftlService)[0].type, count: 1, loadKg: 0, addressIdx: uncovered,
  }])
  const removeVehicle = (i: number) => setRows((rs) => rs.filter((_, j) => j !== i))
  /* the form-level Service Type is the ONE source; the vehicle types follow it */
  const pickFtlService = (code: string) => {
    setFtlService(code)
    setServiceNote('')
    setRows((rs) => rs.map((r) => ({ ...r, vehicleType: coerceVehicleType(code, r.vehicleType) })))
  }
  const setDedicateTruck = (on: boolean) => {
    setC({ dedicateTruck: on, ...(on ? {} : { totalLoadingTime: null }) })
    /* the parcel service is not an FTL one: fall back to the default FTL service and say so */
    if (on && !FTL_SERVICE_CODES.includes(ftlService)) pickFtlService(DEFAULT_FTL_SERVICE)
    if (on) setServiceNote(`${lbl('serviceType')} set to ${FTL_SERVICE_CODES.includes(ftlService) ? ftlService : DEFAULT_FTL_SERVICE} — a dedicated-truck service. Change it in Consignment Details.`)
    else setServiceNote('')
  }
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
  /** A SKU picked from the master fills name, category, HSN Code, Origin Country, weight and dimensions. */
  const pickSku = (i: number, k: number, s: SkuItem) =>
    setItems(i, (items) => items.map((it, m) => (m === k ? {
      ...it, skuCode: s.code, name: s.name, weightKg: s.weightKg, weightUom: 'KG', hsnCode: s.hsnCode, originCountry: s.originCountry,
      category: it.category || s.category, lengthCm: s.lengthCm, widthCm: s.widthCm, heightCm: s.heightCm, dimUom: 'CM',
      quantity: it.quantity || 1,
    } : it)))
  const setItem = (i: number, k: number, patch: Partial<ParcelItem>) =>
    setItems(i, (items) => items.map((it, m) => (m === k ? { ...it, ...patch } : it)))
  const removeItem = (i: number, k: number) => setItems(i, (items) => items.filter((_, m) => m !== k))

  const pickSender = (code: string) => {
    if (code === OTHER_ADDRESS) {
      setSenderStore(OTHER_ADDRESS)
      setSender((s) => (storeOf(s) ? blankParty() : s))
      setEditFrom(true)
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

  /* the masters resolve after mount and the header can switch merchant: re-default
     the pickup address whenever the LIST changes, unless something dictated it */
  const listKey = useMemo(() => pickup.options.map((o) => o.value).join('|'), [pickup.options])
  const [autoKey, setAutoKey] = useState<string | null>(null)
  const dictated = !!(saved || pr || fromOverage)
  useEffect(() => {
    if (dictated || autoKey === listKey) return
    const next = stores[0]
    /* eslint-disable react-hooks/set-state-in-effect -- synchronising with the
       masters store, which is external and settles after this component mounts */
    setAutoKey(listKey)
    setSenderStore(next?.code ?? OTHER_ADDRESS)
    setSender(next ? { ...next.party, locationCode: next.code } : blankParty())
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [dictated, listKey, autoKey, stores])

  useEffect(() => { clearDraftKeys() }, [])
  const jumpTarget = jump === 1 ? (isFtl ? 'sec-vehicle' : 'sec-package') : jump === 2 ? 'sec-services' : null
  useEffect(() => {
    if (!jumpTarget) return
    const t = setTimeout(() => document.getElementById(jumpTarget)?.scrollIntoView({ block: 'start' }), 150)
    return () => clearTimeout(t)
  }, [jumpTarget])
  /* the QA shortcut also fills the Simplified tier's required window */
  useEffect(() => {
    if (!jump || saved) return
    /* eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot QA prefill on mount */
    setReceiver((r) => (r.windowStart ? r : { ...r, windowStart: `${today()}T09:00`, windowEnd: `${today()}T18:00` }))
  }, [jump, saved])

  const draftStoreCode = fromList ? senderStore : pr?.storeCode ?? saved?.storeCode ?? stores[0]?.code ?? codeFor(sender)

  const buildDraft = (): OrderDraft => ({
    orderId: draftId ?? undefined,
    storeCode: draftStoreCode,
    sender: fromList ? { ...sender, locationCode: senderStore } : sender,
    receiver, drops, shipmentType: isFtl ? 'FTL' : 'Parcel', vehicleType,
    vehicleUnit: units, actualLoad, additionalServices: addServices,
    ...(isFtl ? { ftlServiceType: ftlService, vehicles } : {}),
    parcels: isFtl
      ? [{ cargoType: 'FTL', itemInfo: [ftlService, ...vehicles.map((v) => v.vehicleType), ...addServices].join(' · '), quantity: units, weight: actualLoad / Math.max(1, units), l: 120, w: 100, h: 150 }]
      : parcels.map((p) => ({ ...p, items: (p.items ?? []).filter((it) => !isBlankItem(it)), itemInfo: itemInfoOf(p) })),
    authority: saved?.authority || 'Leave at the door', instructions, secure, service: svc.code, rate: svc.price, etaDays: svc.days,
    consignment: {
      ...c,
      orderNumber: effectiveOrder.trim(), referenceNumber: effectiveRef.trim(),
      consignmentNumber: c.consignmentNumber?.trim() || effectiveRef.trim(),
      /* Merchant is never a field — it is the signed-in merchant, recorded silently */
      merchantCode: merchant?.code ?? null, merchantName: merchant?.name ?? '',
      /* the carrier follows the chosen service — never a separate pick */
      carrier: svc.carrier,
      rto: c.rtoMode === RTO_MODES[1] ? rto : null,
      packages: isFtl ? [] : parcels.map((p) => ({
        packageId: p.packageId, packageType: p.packageTypeName || CUSTOM_PACKAGE_NAME, quantity: p.quantity,
        trackingNumber: p.trackingNumber ?? '', palletSpace: p.palletSpace ?? '', description: p.description ?? '',
      })),
    },
  })

  const backTo = fromPr ? `/grow/orders/pickups/${fromPr.id}`
    : fromOverage ? `/grow/orders/pickups/${fromOverage.pr.id}`
    : draftId ? '/grow/orders?tab=drafts'
    : '/grow/orders'

  const persistTypedSender = () => {
    if (senderStore === OTHER_ADDRESS && saveSender && partyOk(sender)) {
      const saveAs: StoreLocation = { code: codeFor(sender), name: sender.businessName || sender.name, party: { ...sender } }
      const stored = growOrderActions.addStore(saveAs)
      setSenderStore(stored.code)
      setSaveSender(false)
      toast.success(`${stored.name} saved to your pickup addresses`)
    }
  }

  /* ---- the sections, one order regardless of order complexity ---- */
  const sections = ['sec-consignment', 'sec-ship-from-rto', 'sec-ship-to',
    isFtl ? 'sec-vehicle' : 'sec-package', ...(isFtl ? [] : ['sec-services']),
    ...(merchant?.postpaidTerms === 'none' ? [] : ['sec-payment'])]
  const doneOf: Record<string, boolean> = {
    'sec-consignment': done(consignmentReq),
    'sec-ship-from-rto': done(fromReq) && done(rtoReq), 'sec-ship-to': done(toReq),
    'sec-package': done(pieceReq) && done(skuReq), 'sec-vehicle': done(pieceReq),
    'sec-services': done(carrierReq), 'sec-payment': done(paymentReq),
  }

  const proceed = () => {
    if (!canSubmit) {
      setShowErrors(true)
      if (!done(fromReq)) setEditFrom(true)
      const first = sections.find((s) => !doneOf[s])
      if (first) setTimeout(() => jumpTo(first), 60)
      return
    }
    persistTypedSender()
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify(buildDraft()))
    setDraftSidecar({
      pickupId: fromPr?.id ?? null,
      overage: fromOverage ? { prId: fromOverage.pr.id, overageId: fromOverage.scan.id } : null,
    })
    nav('/grow/orders/checkout')
  }
  const saveForLater = () => {
    persistTypedSender()
    const o = growOrderActions.saveDraft(buildDraft(), draftId ?? undefined)
    clearDraftKeys()
    toast.success(`Consignment ${o.orderNumber} saved to Drafts`)
    nav('/grow/orders?tab=drafts')
  }

  /* ------------------------------------------------------------ sections */
  /* Service Type here only classifies the FTL booking (drives the vehicle catalogue) —
     parcel service/carrier is chosen in the Services section, with its own TAT and rate. */
  const serviceTypeField = isFtl && !hid('serviceType') && (
    <F label={lbl('serviceType')} value={ftlService} options={opts(FTL_SERVICE_CODES)} onChange={pickFtlService} />
  )
  const dedicateToggle = (
    <ChipToggle icon={Truck} label={lbl('dedicateTruck')} checked={isFtl} onChange={setDedicateTruck} disabled={!!fromOverage} />
  )

  const consignmentSection = (
    <SectionCard id="sec-consignment" title="Consignment Details" done={doneOf['sec-consignment']}
      icon={<ClipboardList size={15} className={ICON} />}
      caption="Provide the consignment details to ensure accurate processing, routing, and billing of the shipment.">
      <Grid>
        <F label={lbl('orderNumber')} required value={c.orderNumber ?? ''} placeholder="eg, ABC0001"
          error={reqErr(filled(effectiveOrder))} onChange={(v) => setC({ orderNumber: v })} />
        <F label={lbl('consignmentType')} required value={c.consignmentType ?? 'Forward'} options={opts(CONSIGNMENT_TYPES)}
          onChange={(v) => setC({ consignmentType: v })} />
        {!hid('exchangeOrderNumber') && c.consignmentType === 'Exchange' && (
          <F label={lbl('exchangeOrderNumber')} value={c.exchangeOrderNumber ?? ''} placeholder="eg, ABC0000" onChange={(v) => setC({ exchangeOrderNumber: v })}
            helper="Original order being exchanged" />
        )}
        {/* declared value of the order, not the amount to collect — stays here regardless
            of the payment method chosen below */}
        <FNum label={lbl('orderAmount')} unit={CURRENCY} blankZero placeholder="eg, 100.22" value={c.orderAmount ?? 0} onChange={(n) => setC({ orderAmount: n || null })} />
      </Grid>

      {/* Handling (left) and Instructions (right), one merged block. Dedicate Truck is the
          FTL switch, not a minor setting, so it stays in the open; its own details
          (Service Type, Loading Time) render below it, once it's on — a field driven by a
          toggle should never appear above the toggle that triggers it. */}
      <SubHead label="Handling & Instructions" />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div>
          {!hid('dedicateTruck') && (
            <div className="flex flex-wrap items-center gap-3">{dedicateToggle}</div>
          )}
          {isFtl && (
            <div className="mt-4">
              <Grid>
                {serviceTypeField}
              </Grid>
            </div>
          )}
        </div>
        {(!hid('specialInstructions') || !hid('deliveryInstructions')) && (
          <Fld label="Instructions" info>
            <MultiSelect value={instructionTags} options={INSTRUCTION_OPTIONS} creatable
              placeholder="Pick common instructions or type your own" onChange={setInstructionTagsAndSync} />
          </Fld>
        )}
      </div>
    </SectionCard>
  )

  const saveSenderToggle = senderStore === OTHER_ADDRESS
    ? <span className="flex items-center gap-2 text-[12.5px] font-bold text-ink-2">Save address <Toggle checked={saveSender} onChange={setSaveSender} /></span>
    : undefined

  /* Ship From — a compact location card + edit pencil by default (was Simplified-only);
     the pencil reveals the full PartyFields form, same as it always did on edit. */
  const shipFromSection = (
    <SectionCard id="sec-ship-from" title="Ship From" done={done(fromReq)}
      icon={<Warehouse size={15} className={ICON} />}
      caption="Provide the pickup address and contact details for this consignment."
      action={editFrom ? saveSenderToggle : undefined}>
      {!editFrom ? (
        <>
          <div className="flex items-start gap-3 rounded-lg border border-line bg-warm-25 px-4 py-3">
            <Warehouse size={16} className="mt-0.5 shrink-0 text-warm-400" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-bold text-ink">{sender.city || sender.name || <span className="font-normal text-ink-3">No pickup location yet</span>}</p>
              <p className="mt-0.5 flex items-center gap-1.5 truncate text-[12.5px] text-ink-3"><User size={13} className="shrink-0" /> {sender.contactNumber || sender.name || '—'}</p>
            </div>
            <IconButton icon={<Pencil size={14} />} title="Edit Ship From" onClick={() => setEditFrom(true)} />
          </div>
          {showErrors && !done(fromReq) && <p className="mt-1 text-[12.5px] text-brand-500">Ship From is incomplete — edit it</p>}
        </>
      ) : (
        <>
          <div className="mb-4"><PickupSearch options={senderOptions} onPick={pickSender} /></div>
          <PartyFields party={sender} set={(p) => setSender((x) => ({ ...x, ...p }))} nameLabel="Sender Name" windowLabel="Pick Up"
            locked={fromList} hid={hid} showErrors={showErrors} advancedDefaultOpen={advancedDefaultOpen} />
        </>
      )}
    </SectionCard>
  )

  const rtoSection = (
    <SectionCard id="sec-rto" title="Return To Origin (RTO)" done={done(rtoReq)}
      icon={<Undo2 size={15} className={ICON} />}
      caption="Provide the return-to-origin address and contact details for this consignment.">
      <Segmented compact options={RTO_MODES} value={c.rtoMode ?? RTO_MODES[0]} onChange={(m) => setC({ rtoMode: m })} />
      {c.rtoMode === RTO_MODES[1] && (
        <div className="mt-5">
          <PartyFields party={rto} set={(p) => setRto((x) => ({ ...x, ...p }))} nameLabel="Name" windowLabel={null} hid={hid}
            showErrors={showErrors} floorLift={false} advancedDefaultOpen={advancedDefaultOpen}
            locationCode={<F label="Location Code" value={rto.locationCode ?? ''} placeholder="eg, Williamstown"
              options={pickup.options.filter((o) => o.value !== OTHER_ADDRESS)}
              onChange={(code) => {
                const st = stores.find((s) => s.code === code)
                setRto(st ? { ...st.party, locationCode: code } : (x) => ({ ...x, locationCode: code }))
              }} />} />
        </div>
      )}
    </SectionCard>
  )

  /* side by side while both are in their compact state (the common case) — cuts page
     height since a collapsed Ship From card and the RTO segmented control are both
     narrow. Either expanding to a full address form drops back to full-width stacking
     so the 4-column field grid isn't squeezed into a half-width column. */
  const shipFromRtoRow = (
    <div id="sec-ship-from-rto" className={`scroll-mt-20 grid gap-5 ${!editFrom && c.rtoMode !== RTO_MODES[1] ? 'lg:grid-cols-2 lg:items-stretch' : ''}`}>
      {shipFromSection}
      {rtoSection}
    </div>
  )

  /* collapsed by default on a dedicated-truck booking — see shipToOpen above */
  const shipToPlaceholder = (
    <div id="sec-ship-to" className="scroll-mt-20">
      <button type="button" onClick={() => setShipToOpen(true)}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-warm-300 py-4
                   text-[13px] font-bold text-brand-500 transition-colors hover:border-brand-500 hover:bg-brand-50/40">
        <Plus size={14} /> Add a delivery address (optional)
      </button>
    </div>
  )

  const shipToSection = (
    <SectionCard id="sec-ship-to" title="Ship To" done={doneOf['sec-ship-to']}
      icon={<User size={15} className={ICON} />}
      caption="Provide the delivery address and contact details to ensures accurate delivery and proper communication with the recipient.">
      {allDrops.map((d, i) => {
        const set = i === 0 ? (p: Partial<Party>) => setReceiver((x) => ({ ...x, ...p })) : (p: Partial<Party>) => setDrop(i - 1, p)
        return (
          <div key={i} className={i > 0 ? 'mt-6 border-t border-line pt-5' : ''}>
            <div className="mb-4 flex items-center gap-3">
              {allDrops.length > 1 && (
                <span className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-md bg-brand-50 text-[11.5px] font-black text-brand-600">{i + 1}</span>
              )}
              <div className="min-w-0 flex-1"><AddressBookSearch book={receiverBook} onPick={(p) => set(p)} /></div>
              {i > 0 && (
                <button type="button" aria-label={`Remove address ${i + 1}`} onClick={() => removeDrop(i - 1)}
                  className="shrink-0 text-warm-400 transition-colors hover:text-brand-500"><CircleMinus size={17} /></button>
              )}
            </div>
            <PartyFields party={d} set={set} nameLabel="Customer Name" windowLabel="Delivery" requireContact hid={hid} showErrors={showErrors}
              advancedDefaultOpen={advancedDefaultOpen} />
            {/* customs clearance only applies once this address crosses a border from Ship From — shown
                right by the country that triggers it, not as a blanket Handling toggle */}
            {!hid('clearanceRequired') && sender.country && d.country && d.country !== sender.country && (
              <div className="mt-3">
                <ChipToggle icon={FileCheck} label={lbl('clearanceRequired')} checked={!!c.clearanceRequired} onChange={(v) => setC({ clearanceRequired: v })} />
              </div>
            )}
          </div>
        )
      })}
      {/* multiple drops only make sense when a dedicated vehicle can route between them stop by
          stop — an LTL/parcel order ships as one consignment to one address */}
      {isFtl && (
        <button type="button" onClick={() => setDrops((ds) => [...ds, blankParty()])}
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-warm-300 py-3
                     text-[13px] font-bold text-brand-500 transition-colors hover:border-brand-500 hover:bg-brand-50/40">
          <Plus size={14} /> Add another delivery address
        </button>
      )}
    </SectionCard>
  )

  const declarations = (
    <div className="mt-4 space-y-2 border-t border-line pt-3">
      <Tick checked={noDg} onChange={setNoDg}>I declare that this shipment does not have Dangerous goods <span className="text-brand-500">*</span></Tick>
      {showErrors && !noDg && <p className="ml-[22px] text-[12.5px] text-brand-500">Required field.</p>}
    </div>
  )

  const packageTypeOpts = [...packageTypes.map((t) => ({ value: t.code, label: t.name })), { value: CUSTOM_PACKAGE, label: CUSTOM_PACKAGE_NAME }]
  const packageTypeTitle = packageTypes.length === 0 ? 'No presets in the Package master — enter dimensions'
    : !ownPresets ? `Showing all package types — none assigned to ${merchant?.name ?? 'this merchant'}` : undefined
  const pkgTypeName = (p: Parcel) => packageTypeOpts.find((o) => o.value === packageValue(p, packageTypes))?.label ?? CUSTOM_PACKAGE_NAME

  /* Packages is the ONE list — a package's SKU contents are optional, nested
     enrichment. A package with no SKU lines ships as-is. */
  const [itemMoreOpen, setItemMoreOpen] = useState<Set<string>>(new Set())
  const toggleItemMore = (key: string) => setItemMoreOpen((s) => {
    const n = new Set(s); if (n.has(key)) n.delete(key); else n.add(key); return n
  })
  const packageSection = (
    <div id="sec-package" className="scroll-mt-20">
      {!hid('scannable') && (
        <div className="mb-4">
          <ChipToggle icon={ScanLine} label="Do you want separate labels for each package? - Yes or no"
            checked={!!c.scannable} onChange={(v) => setC({ scannable: v })} />
        </div>
      )}
      <RepeatableList<Parcel>
        title="Packages" addNoun="Package" icon={<PackageIcon size={15} className={ICON} />}
        caption="Add the packages in this consignment. A package can ship as-is, or you can optionally list what's inside it."
        cardLabel={(i) => `Package ${i + 1}`}
        rows={parcels}
        incomplete={(p) => !(p.quantity > 0 && p.weight > 0 && p.l > 0 && p.w > 0 && p.h > 0)}
        summary={(p) => {
          const skuCount = (p.items ?? []).filter((it) => !isBlankItem(it)).length
          return <Facts items={[p.packageId, pkgTypeName(p), `×${p.quantity}`, `${round2(p.weight)} kg`,
            skuCount > 0 && `${skuCount} SKU${skuCount === 1 ? '' : 's'}`]} />
        }}
        onAdd={() => setParcels((ps) => [...ps, newParcel()])}
        onDuplicate={(i) => setParcels((ps) => [...ps.slice(0, i + 1), clonePackage(ps[i]), ...ps.slice(i + 1)])}
        onRemove={(i) => setParcels((ps) => (ps.length > 1 ? ps.filter((_, j) => j !== i) : [newParcel()]))}
        body={(p, i) => {
          const items = p.items ?? []
          return (
            <>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 lg:grid-cols-[1.4fr_0.8fr_1fr_1.8fr]">
                <div title={packageTypeTitle}>
                  <F label="Package Type" required value={packageValue(p, packageTypes)} options={packageTypeOpts} onChange={(v) => pickPackageType(i, v)} />
                </div>
                <FNum label="Quantity" required value={p.quantity} min={1} integer onChange={(n) => setParcel(i, { quantity: n })} />
                <FNum label="Weight" required value={p.weight} unit="kg" error={reqErr(p.weight > 0)}
                  helper={p.weightMode === 'manual' ? undefined : 'Package tare + SKUs'}
                  onChange={(n) => setParcel(i, { weight: n, weightMode: 'manual' })} />
                {!hid('pkgDimensions') && (
                  <Fld label="Dimensions (L × W × H)" required error={showErrors && !(p.l > 0 && p.w > 0 && p.h > 0)}>
                    <div className="grid grid-cols-3 gap-2">
                      <NumBox value={p.l} unit="cm" error={reqErr(p.l > 0)} onChange={(n) => setParcel(i, { l: n })} />
                      <NumBox value={p.w} unit="cm" error={reqErr(p.w > 0)} onChange={(n) => setParcel(i, { w: n })} />
                      <NumBox value={p.h} unit="cm" error={reqErr(p.h > 0)} onChange={(n) => setParcel(i, { h: n })} />
                    </div>
                  </Fld>
                )}
              </div>

              {/* contents — optional, nested SKU lines scoped to this package */}
              <div className="mt-5 border-t border-line pt-4">
                <span className="mb-2 block text-[11px] font-bold uppercase tracking-[0.08em] text-ink-3">Contents (optional)</span>
                {items.length === 0 ? (
                  <p className="text-[12.5px] text-ink-3">This package can ship as-is. Add SKU lines only if you want to record what's inside.</p>
                ) : (
                  <div className="grid gap-2">
                    {items.map((it, k) => {
                      const bound = !!it.skuCode
                      const key = `${i}-${k}`
                      const expanded = itemMoreOpen.has(key)
                      return (
                        <div key={k} className="rounded-md border border-line bg-warm-25/60 px-3 py-2.5">
                          <div className="flex items-center gap-3">
                            <button type="button" onClick={() => toggleItemMore(key)} className="shrink-0 text-warm-400 hover:text-ink">
                              {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                            </button>
                            <div className="w-40 shrink-0">
                              <SkuCode item={it} skus={masters.skus} onPick={(s) => pickSku(i, k, s)} onUnlink={() => setItem(i, k, { skuCode: null })}
                                autoFocus={focusLine?.i === i && focusLine.k === k} />
                            </div>
                            <div className="min-w-0 flex-1">
                              <Input value={it.name} placeholder="eg, Chair" disabled={bound} onChange={(v) => setItem(i, k, { name: v })} />
                            </div>
                            <div className="w-20 shrink-0">
                              <Input type="number" value={String(it.quantity)} onChange={(v) => setItem(i, k, { quantity: Number(v) || 0 })} />
                            </div>
                            <button type="button" onClick={() => removeItem(i, k)} aria-label="Remove SKU line"
                              className="shrink-0 text-warm-400 transition-colors hover:text-brand-500">
                              <X size={15} />
                            </button>
                          </div>
                          {expanded && (
                            <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-line/60 pt-3 sm:grid-cols-3 xl:grid-cols-6">
                              <Fld label="SKU Code"><ReadBox value={it.skuCode ?? ''} /></Fld>
                              {!hid('skuDescription') && <F label="Description" value={it.description ?? ''} onChange={(v) => setItem(i, k, { description: v })} />}
                              <F label="HSN Code" value={it.hsnCode ?? ''} disabled={bound} onChange={(v) => setItem(i, k, { hsnCode: v })} />
                              <F label="Origin Country" value={it.originCountry ?? ''} options={ORIGIN_OPTS} disabled={bound}
                                onChange={(v) => setItem(i, k, { originCountry: v })} />
                              {!hid('skuUnitCost') && <FNum label="Unit Cost" unit={CURRENCY} blankZero value={it.unitCost ?? 0} onChange={(n) => setItem(i, k, { unitCost: n })} />}
                              {!hid('skuDimensions') && (
                                <Fld label="Dimensions (L × B × H + UOM)" className="sm:col-span-2">
                                  <div className="grid grid-cols-4 gap-2">
                                    <NumBox blankZero value={it.lengthCm ?? 0} placeholder="L" onChange={(n) => setItem(i, k, { lengthCm: n })} />
                                    <NumBox blankZero value={it.widthCm ?? 0} placeholder="B" onChange={(n) => setItem(i, k, { widthCm: n })} />
                                    <NumBox blankZero value={it.heightCm ?? 0} placeholder="H" onChange={(n) => setItem(i, k, { heightCm: n })} />
                                    <MenuSelect value={it.dimUom ?? 'CM'} options={DIM_UOMS} onChange={(v) => setItem(i, k, { dimUom: v })} />
                                  </div>
                                </Fld>
                              )}
                              {!hid('skuWeight') && (
                                <Fld label="Weight (+ UOM)">
                                  <div className="grid grid-cols-[1fr_76px] gap-2">
                                    <NumBox blankZero value={it.weightKg} onChange={(n) => setItem(i, k, { weightKg: n })} />
                                    <MenuSelect value={it.weightUom ?? 'KG'} options={WEIGHT_UOMS} onChange={(v) => setItem(i, k, { weightUom: v })} />
                                  </div>
                                </Fld>
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
                <button type="button" onClick={() => addItem(i)}
                  className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-warm-300 py-2.5
                             text-[12.5px] font-bold text-brand-500 transition-colors hover:border-brand-500 hover:bg-brand-50/40">
                  <Plus size={13} /> Add SKU
                </button>
              </div>
            </>
          )
        }}
        totals={declarations}
      />
    </div>
  )

  const addressLabels = addressOptions.map((o) => o.label)
  const vehicleSection = (
    <SectionCard id="sec-vehicle" title="Vehicle Details" done={doneOf['sec-vehicle']} clip={false}
      icon={<Truck size={15} className={ICON} />}
      caption={`${lbl('dedicateTruck')} is on — book the vehicles that fit the load for ${ftlService}. Each one is dedicated to this consignment.`}>
      {serviceNote && <p className="mb-4 rounded-md border border-line bg-info-bg px-3 py-2 text-[13px] text-info-fg">{serviceNote}</p>}
      {/* the console dialog's vehicles table: one line per vehicle type */}
      <div className="rounded-md border border-line">
        <div className="grid grid-cols-[1.4fr_120px_150px_1.3fr_32px] gap-3 rounded-t-md border-b border-line bg-warm-50 px-3 py-2 text-[12px] font-bold text-ink-3">
          <span>Vehicle type<span className="text-brand-500">*</span></span><span>No. of vehicles<span className="text-brand-500">*</span></span>
          <span>Est. load<span className="text-brand-500">*</span></span><span>Deliver to<span className="text-brand-500">*</span></span><span />
        </div>
        {rows.map((r, i) => {
          const vSpec = vehicleSpec(r.vehicleType)
          const cap = vSpec.payloadKg * Math.max(1, r.count)
          const over = r.loadKg > cap
          return (
            <div key={i} className="grid grid-cols-[1.4fr_120px_150px_1.3fr_32px] items-start gap-3 border-b border-line px-3 py-2 last:border-0">
              <div className="min-w-0">
                <MenuSelect value={r.vehicleType} options={vehiclesFor(ftlService).map((x) => x.type)} searchable onChange={(t) => setRow(i, { vehicleType: t })} />
                <p className={`mt-1 text-[12px] ${over ? 'text-danger-fg' : 'text-ink-3'}`}>
                  {over ? `${r.loadKg.toLocaleString()} kg exceeds ${cap.toLocaleString()} kg` : `Up to ${vSpec.payloadKg.toLocaleString()} kg each`}
                </p>
              </div>
              <NumBox integer min={1} value={r.count} onChange={(n) => setRow(i, { count: Math.max(1, n) })} />
              <NumBox unit="kg" blankZero value={r.loadKg} error={reqErr(r.loadKg > 0)} onChange={(n) => setRow(i, { loadKg: n })} />
              <MultiSelectDropdown options={addressLabels} noun="addresses" placeholder="Ship To addresses"
                values={r.addressIdx.map((a) => addressLabels[a]).filter(Boolean)}
                onChange={(vals) => setRow(i, { addressIdx: vals.map((v) => addressLabels.indexOf(v)).filter((a) => a >= 0).sort((x, y) => x - y) })} />
              <button type="button" aria-label={`Remove vehicle row ${i + 1}`} disabled={rows.length === 1} onClick={() => removeVehicle(i)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-ink-3 hover:bg-warm-100 hover:text-ink disabled:cursor-not-allowed disabled:opacity-40">
                <X size={14} />
              </button>
            </div>
          )
        })}
      </div>
      <div className="mt-2">
        <Button size="sm" variant="text" icon={<Plus size={13} />} onClick={addVehicle}>Add vehicle</Button>
      </div>
      {!hid('totalLoadingTime') && (
        <div className="mt-4 max-w-[200px]">
          <Fld label={lbl('totalLoadingTime')}>
            <NumBox blankZero integer unit="min" value={c.totalLoadingTime ?? 0} onChange={(n) => setC({ totalLoadingTime: n || null })} />
          </Fld>
        </div>
      )}
      <p className="mt-2 text-[12px] text-ink-3">
        {units} vehicle{units === 1 ? '' : 's'} · load {(actualLoad / 1000).toFixed(2)} tons ({actualLoad.toLocaleString()} kg) of {capacityKg.toLocaleString()} kg capacity
        {overloaded.length > 0 && <span className="text-danger-fg"> · {overloaded.length} overloaded</span>}
        {uncovered.length > 0
          ? <span className="text-danger-fg"> · {uncovered.map((i) => `Address ${i + 1}`).join(', ')} not assigned to a vehicle</span>
          : <span> · every address has a vehicle</span>}
        <span> · extras such as a tail-lift are Value Added Services</span>
      </p>
      {declarations}
    </SectionCard>
  )

  /* LTL only — an FTL booking's rate/TAT already comes from the vehicles configured
     above and its Service Type is picked in Consignment Details, so this section
     doesn't apply and is left out of `sections` entirely when Dedicate Truck is on. */
  const servicesSection = (
    <SectionCard id="sec-services" title="Services" count={parcelQuotes.length} done={doneOf['sec-services']}
      icon={<Truck size={15} className={ICON} />}
      caption={`Estimated delivery time and rate for this pickup-to-delivery lane (${lane === 'local' ? 'same state' : 'interisland'}) — nothing is preselected.`}>
      <div className="rounded-lg border border-line p-5">
        <div className="grid gap-3 sm:grid-cols-2">
          {parcelQuotes.map((q) => {
            const on = service === q.code
            return (
              <button key={q.code} type="button" onClick={() => setService(q.code)} role="radio" aria-checked={on}
                className={`flex items-center gap-3 rounded-md border bg-surface px-4 py-3 text-left transition-colors
                  ${on ? 'border-brand-500 bg-brand-50/30' : 'border-line text-ink-2 hover:border-warm-300'}`}>
                {on
                  ? <CircleDot size={15} className="shrink-0 text-brand-500" />
                  : <span className="h-[15px] w-[15px] shrink-0 rounded-full border border-warm-300" />}
                <div className="min-w-0 flex-1">
                  <span className="block text-[14px] font-bold leading-tight text-ink">{q.code}</span>
                  <span className="block text-[12px] leading-tight text-ink-3">{q.carrier}</span>
                </div>
                <div className="shrink-0 text-right">
                  <span className="block text-[13px] font-bold text-ink">{money(q.price + vasTotal, CURRENCY)}</span>
                  <span className="block text-[11.5px] text-ink-3">Est. {q.days} day{q.days === 1 ? '' : 's'}</span>
                </div>
              </button>
            )
          })}
        </div>
        {showErrors && !service && <p className="mt-3 text-[12.5px] text-brand-500">Select a service to create the consignment.</p>}
      </div>
    </SectionCard>
  )

  /* Invoice-billed postpaid merchants skip the Payment section entirely (excluded from
     `sections` above) — nothing to collect at order time. PO-linked postpaid merchants get
     the PO picker instead of the COD/Card/Wallet/Gateway method picker everyone else sees;
     Payment Gateway's own "Continue" jumps straight to checkout instead of waiting on the
     sticky footer. */
  const paymentSection = (
    <SectionCard id="sec-payment" title="Payment" done={doneOf['sec-payment']}
      icon={<WalletIcon size={15} className={ICON} />}
      caption={merchant?.postpaidTerms === 'po'
        ? "Link this order to one of the merchant's purchase orders."
        : 'Select the payment method and continue.'}>
      {merchant?.postpaidTerms === 'po' ? (
        <div className="max-w-sm">
          <F label="Purchase Order" required searchable value={selectedPo} onChange={setSelectedPo}
            placeholder={`Search ${MERCHANT_PURCHASE_ORDERS.length} purchase orders…`}
            options={MERCHANT_PURCHASE_ORDERS.map((po) => ({
              value: po.poNumber,
              label: `${po.poNumber} — Remaining ${money(po.remainingAmount, CURRENCY)} of ${money(po.totalAmount, CURRENCY)}`
                + (po.remainingAmount < svc.price ? ' (Insufficient)' : ''),
            }))}
            error={showErrors && !selectedPo ? 'Select a purchase order to create the consignment.' : undefined} />
          {selectedPo && (() => {
            const po = MERCHANT_PURCHASE_ORDERS.find((p) => p.poNumber === selectedPo)!
            const sufficient = po.remainingAmount >= svc.price
            return (
              <div className="mt-3 rounded-md border border-line bg-warm-25 px-3.5 py-3">
                <div className="flex items-center justify-between text-[13px]">
                  <span className="text-ink-3">Remaining on {po.poNumber}</span>
                  <span className="font-bold text-ink">{money(po.remainingAmount, CURRENCY)} of {money(po.totalAmount, CURRENCY)}</span>
                </div>
                {sufficient ? (
                  <p className="mt-1.5 text-[12px] text-success-fg">Sufficient to cover this order ({money(svc.price, CURRENCY)}).</p>
                ) : (
                  <p className="mt-1.5 text-[12px] text-danger-fg">Insufficient — this order exceeds the remaining balance by {money(svc.price - po.remainingAmount, CURRENCY)}.</p>
                )}
              </div>
            )
          })()}
        </div>
      ) : (
        <>
          <div className="grid gap-2">
            {PAYMENT_OPTIONS.map((opt) => {
              const on = c.paymentMode === opt.code
              return (
                <button key={opt.code} type="button" onClick={() => setC({ paymentMode: opt.code })} role="radio" aria-checked={on}
                  className={`flex items-center gap-3 rounded-md border bg-surface px-3.5 py-2.5 text-left transition-colors
                    ${on ? 'border-brand-500 bg-brand-50/30' : 'border-line text-ink-2 hover:border-warm-300'}`}>
                  {on
                    ? <CircleDot size={15} className="shrink-0 text-brand-500" />
                    : <span className="h-[15px] w-[15px] shrink-0 rounded-full border border-warm-300" />}
                  <div className="min-w-0 flex-1">
                    <span className="block text-[13.5px] font-bold text-ink">{opt.label}</span>
                    <span className="block text-[12px] text-ink-3">{opt.sub}</span>
                  </div>
                </button>
              )
            })}
          </div>

          {c.paymentMode === 'Card' && (
            <div className="mt-4">
              <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.08em] text-ink-3">Saved cards</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {SAVED_CARDS.map((cd) => {
                  const on = selectedCard === cd.id
                  return (
                    <button key={cd.id} type="button"
                      onClick={() => { setSelectedCard(cd.id); setAddingCard(false) }} role="radio" aria-checked={on}
                      className={`flex items-center gap-3 rounded-md border bg-surface px-3.5 py-2.5 text-left transition-colors
                        ${on ? 'border-brand-500 bg-brand-50/30' : 'border-line text-ink-2 hover:border-warm-300'}`}>
                      {on
                        ? <CircleDot size={15} className="shrink-0 text-brand-500" />
                        : <span className="h-[15px] w-[15px] shrink-0 rounded-full border border-warm-300" />}
                      <CreditCard size={16} className="shrink-0 text-ink-3" />
                      <div className="min-w-0 flex-1">
                        <span className="block text-[13px] font-bold text-ink">{cd.brand} •••• {cd.last4}</span>
                        <span className="block text-[12px] text-ink-3">Expires {cd.expiry}</span>
                      </div>
                    </button>
                  )
                })}
                <button type="button" onClick={() => { setAddingCard(true); setSelectedCard('') }}
                  className={`flex items-center justify-center gap-2 rounded-md border border-dashed px-3.5 py-2.5 text-[13px] font-bold transition-colors
                    ${addingCard ? 'border-brand-500 bg-brand-50/30 text-brand-500' : 'border-warm-300 text-brand-500 hover:border-brand-500 hover:bg-brand-50/40'}`}>
                  <Plus size={14} /> Add new card
                </button>
              </div>
              {addingCard && (
                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <F label="Card Number" value={newCard.number} placeholder="1234 5678 9012 3456"
                    onChange={(v) => setNewCard((x) => ({ ...x, number: v }))} />
                  <F label="Name on Card" value={newCard.name} placeholder="John Doe"
                    onChange={(v) => setNewCard((x) => ({ ...x, name: v }))} />
                  <F label="Expiry" value={newCard.expiry} placeholder="MM/YY"
                    onChange={(v) => setNewCard((x) => ({ ...x, expiry: v }))} />
                  <F label="CVV" type="password" value={newCard.cvv} placeholder="123"
                    onChange={(v) => setNewCard((x) => ({ ...x, cvv: v }))} />
                </div>
              )}
              {showErrors && !cardOk && <p className="mt-2 text-[12.5px] text-brand-500">Pick a saved card or add new card details.</p>}
            </div>
          )}

          {c.paymentMode === 'Wallet' && (
            <div className="mt-4 rounded-md border border-line bg-warm-25 px-3.5 py-3">
              <div className="flex items-center justify-between text-[13px]">
                <span className="text-ink-3">Wallet balance</span>
                <span className="font-bold text-ink">{money(WALLET_BALANCE, CURRENCY)}</span>
              </div>
              {WALLET_BALANCE >= svc.price ? (
                <p className="mt-1.5 text-[12px] text-success-fg">Sufficient balance to cover this order ({money(svc.price, CURRENCY)}).</p>
              ) : (
                <p className="mt-1.5 text-[12px] text-danger-fg">Insufficient balance — top up {money(svc.price - WALLET_BALANCE, CURRENCY)} more to pay with wallet.</p>
              )}
            </div>
          )}

          {c.paymentMode === 'Payment Gateway (ANZ)' && (
            <div className="mt-4 rounded-md border border-line bg-warm-25 px-3.5 py-3">
              <p className="text-[12.5px] text-ink-3">You'll be redirected to the ANZ payment gateway to complete payment before the consignment is created.</p>
              <div className="mt-3">
                <Button variant="outline" size="sm" onClick={proceed}>Continue &amp; Capture Payment</Button>
              </div>
            </div>
          )}

          {showErrors && !c.paymentMode && <p className="mt-3 text-[12.5px] text-brand-500">Select a payment method to create the consignment.</p>}
        </>
      )}
    </SectionCard>
  )

  const byId: Record<string, ReactNode> = {
    'sec-consignment': consignmentSection, 'sec-ship-from-rto': shipFromRtoRow,
    'sec-ship-to': shipToOpen ? shipToSection : shipToPlaceholder, 'sec-package': packageSection,
    'sec-vehicle': vehicleSection, 'sec-services': servicesSection, 'sec-payment': paymentSection,
  }
  const pct = Math.round((filledCount / allReq.length) * 100)

  return (
    <div>
      <PageHeader title={isFtl ? 'Add FTL Consignment' : 'Add Consignment'} />
      {fromPr && (
        <div className="mb-4 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-line bg-info-bg px-4 py-2.5 text-[13px] text-ink">
          <Truck size={15} className="shrink-0 text-info-fg" />
          <span>Creating the FTL consignment for <b>{fromPr.number}</b>
            {fromPr.ftlServiceType ? ` · ${fromPr.ftlServiceType}` : ''}
            {fromPr.vehicleType ? ` · ${(fromPr.vehicleUnit ?? 1) > 1 ? `${fromPr.vehicleUnit} × ` : ''}${fromPr.vehicleType}` : ''} · window {prWindow(fromPr)}</span>
          <Link to={`/grow/orders/pickups/${fromPr.id}`} className="font-bold text-brand-500 hover:text-brand-600">View pickup request</Link>
        </div>
      )}
      {fromOverage && (
        <div className="mb-4 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-line bg-info-bg px-4 py-2.5 text-[13px] text-ink">
          <ScanBarcode size={15} className="shrink-0 text-info-fg" />
          <span>Creating the consignment for overage scan <b className="font-mono">{fromOverage.scan.barcode}</b> from <b>{fromOverage.pr.number}</b>
            {fromOverage.scan.weightKg != null ? ` · ${fromOverage.scan.weightKg} kg` : ''}</span>
          <Link to={`/grow/orders/pickups/${fromOverage.pr.id}`} className="font-bold text-brand-500 hover:text-brand-600">View pickup request</Link>
        </div>
      )}

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="grid min-w-0 gap-5">
          {sections.map((id) => <div key={id} className="min-w-0">{byId[id]}</div>)}
        </div>

        {/* Shipment Summary rail — what is being booked and what it costs */}
        <div className="xl:sticky xl:top-4">
          <Panel title="Shipment Summary">
            <div className="px-5 pb-4">
              <SummaryBlock title="Ship From" onJump={() => jumpTo('sec-ship-from')}>{sender.name || '—'}{sender.line1 ? `, ${partyLine(sender)}` : ''}</SummaryBlock>
              <SummaryBlock title={allDrops.length > 1 ? `Ship To (${allDrops.length} addresses)` : 'Ship To'} onJump={() => jumpTo('sec-ship-to')}>
                {allDrops.map((d, i) => <p key={i}>{allDrops.length > 1 ? `${i + 1}. ` : ''}{d.name || '—'}{d.line1 ? `, ${partyLine(d)}` : ''}</p>)}
              </SummaryBlock>
              {isFtl ? (
                <SummaryBlock title="FTL · Vehicle Details" onJump={() => jumpTo('sec-vehicle')}>
                  {ftlService} · {units} vehicle{units === 1 ? '' : 's'} · {(actualLoad / 1000).toFixed(2)} tons
                  {addServices.length > 0 && <p className="text-[12.5px] text-ink-3">+ {addServices.join(', ')}</p>}
                </SummaryBlock>
              ) : (
                <SummaryBlock title="LTL · Packages" onJump={() => jumpTo('sec-package')}>
                  {totals.qty} package{totals.qty === 1 ? '' : 's'} · {totals.items} SKU unit{totals.items === 1 ? '' : 's'}
                  <p className="text-[12.5px] text-ink-3">Dead {kg(totals.dead, 2)} · Vol {kg(totals.vol, 2)} · Chargeable {kg(totals.chargeable, 2)}</p>
                </SummaryBlock>
              )}
              <SummaryBlock title="Service" onJump={() => jumpTo('sec-services')}>
                {(isFtl || service) ? `${svc.code} · ${svc.carrier}` : <span className="text-ink-3">no service selected yet</span>}
              </SummaryBlock>
              <div className="grid grid-cols-[1fr_auto] items-baseline gap-x-6 gap-y-1 border-t border-line pt-3 text-[13px] text-ink-2">
                <span>Delivery</span><span className="text-right tabular-nums text-ink">{money(svc.price, CURRENCY)}</span>
                <span className="font-bold text-ink">Total</span><span className="text-right text-[15px] font-bold tabular-nums text-ink">{money(svc.price, CURRENCY)}</span>
                <span>ETA<span className="text-brand-500">*</span></span><span className="text-right text-ink">{svc.days} Day</span>
              </div>
            </div>
          </Panel>
        </div>
      </div>

      {/* sticky footer — the console's: required-fields progress left, actions right */}
      <div className="sticky bottom-0 z-30 mt-6 flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface px-5 py-3 shadow-ds-1">
        <div className="flex items-center gap-2.5" title={`${filledCount} of ${allReq.length} required fields filled`}>
          <span className="h-1.5 w-28 overflow-hidden rounded-full bg-warm-100">
            <span className="block h-full rounded-full bg-success-fg transition-all" style={{ width: `${pct}%` }} />
          </span>
          <span className="whitespace-nowrap text-[12px] tabular-nums text-ink-3">{filledCount}/{allReq.length} required</span>
        </div>
        <span className="ml-auto" />
        {showErrors && !canSubmit && (
          <span className="text-[13px] text-brand-500">{missingCount} required field{missingCount === 1 ? '' : 's'} remaining</span>
        )}
        <Button variant="ghost" onClick={saveForLater}>Save for Later</Button>
        <Button variant="outline" onClick={() => { clearDraftKeys(); nav(backTo) }}>Go Back</Button>
        <Button onClick={proceed}>Create Consignment</Button>
      </div>
    </div>
  )
}
