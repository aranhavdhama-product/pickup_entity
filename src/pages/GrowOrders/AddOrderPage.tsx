/**
 * Create Consignment — the Grow merchant portal's add form.
 *
 * THE SAME FORM as staging's Add form, rendered from THE SAME COMPONENTS as
 * the console's Add Consignment page (pages/ConsignmentAdd, spec §15): the
 * SectionCard chrome, the labelled 4-column field grid (Nueva Input /
 * MenuSelect / DateInput / Toggle, components/consignmentForm), the
 * RepeatableList rows for Package & SKU / SKU / Piece / VAS
 * (components/consignmentRows), the console vehicles table, the header tier
 * switch and the sticky required-fields footer. Section order, labels,
 * captions and required marks follow the staging captures in
 * docs/superpowers/research/staging-add-form/ (01–02 Simplified, 10–14 Regular).
 *
 *  Simplified — Consignment Details (Order Number* · Consignment Type* ·
 *    Service Type · Ship By Date* · Start Time* · End Time* · Tags) · Ship From
 *    (location card + edit pencil) → Ship To (Location Code · Add Manually ·
 *    Full Name* · Email · Phone*) · Package & SKU (Package ID · Package Type ·
 *    Quantity · Tracking ID · SKU Code · SKU Name · HSN Code · Origin Country,
 *    Add More Package) · Carriers.
 *  Regular — Consignment Details (Order Number* · Reference Number* ·
 *    Consignment Number · Consignment Type* / Ship By Date* · Tags · Payment
 *    Mode / Order Amount · Service Type · Label Format / Scannable · Scheduling
 *    Confirmation Required · Dedicate Truck · Clearance Required · Total Loading
 *    Time / Special Instructions / Delivery Instructions) · Ship From · Return
 *    To Origin (RTO) · Ship To · SKU · Piece · Value Added Services · Carriers.
 *
 * Labels (incl. Form Builder relabels) and Form Builder hides come from the
 * console registry ConsignmentAdd/fieldConfig.ts (pure helpers only). Merchant
 * is never a field — it is the signed-in merchant, carried silently.
 * FTL = `Dedicate Truck`: on, Vehicle Details takes the SKU / Piece slot.
 * Deep links kept: `?draft=`, `?fromPickup=`, `?fromOverage=`, `?step=1|2`
 * (&type=FTL), `/add/vehicle`.
 */
import { useEffect, useMemo, useRef, useState, type ComponentProps, type KeyboardEvent, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import {
  ArrowRight, Barcode, CalendarCheck, CircleDot, CircleMinus, ClipboardList, FileCheck, MapPin, Package,
  Package as PackageIcon, Pencil, Plus, ScanBarcode, ScanLine, ShieldPlus, Truck, Undo2, User, Warehouse, Wrench, X,
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
  ChipToggle, Fld, Grid, InlineToggle, SectionCard, Segmented, SubHead, TierSwitch, UnitBox,
} from '../../components/consignmentForm'
import { money, OTHER_ADDRESS, partyLine, partyOk, prWindow, storeOptionLabel } from './utils'
import { useReceiverBook, usePickupLocations, type BookEntry } from './pickupLocations'
import {
  ADDITIONAL_SERVICES, DEFAULT_FTL_SERVICE, DRAFT_KEY, FTL_SERVICE_CODES, PARCEL_SERVICES, clearDraftKeys,
  coerceVehicleType, ftlQuoteVehicles, ftlServiceType, setDraftSidecar, totalLoadKg, vehicleSpec, vehiclesFor,
  vehiclesOf, volKg, type ConsignmentFields, type FtlVehicle, type OrderDraft, type Parcel, type ParcelItem, type VasLine,
} from '../../growOrders/draft'
/* the console's field registry — pure module, read-only here */
import { fieldHidden, fieldLabel, loadFieldConfig, loadFormBehavior } from '../ConsignmentAdd/fieldConfig'

type FormMode = 'simplified' | 'full'
const TIER_KEY = 'grow-consignment-form-tier'
const lastTier = (): FormMode => {
  try { return localStorage.getItem(TIER_KEY) === 'full' ? 'full' : 'simplified' } catch { return 'simplified' }
}

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
const VAS_LEVELS: VasLine['level'][] = ['SKU', 'PACKAGE', 'CONSIGNMENT']
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
const newParcel = (): Parcel => ({
  packageId: newPackageId(),
  cargoType: CARGO_TYPES[0], packageTypeCode: CUSTOM_PACKAGE, packageTypeName: CUSTOM_PACKAGE_NAME,
  items: [blankItem()], itemInfo: '', quantity: 1, weight: 1, l: 10, w: 10, h: 10, weightMode: 'auto',
  trackingNumber: '', palletSpace: '', description: '',
})
const newVas = (): VasLine => ({ level: 'SKU', skuCode: '', service: '', serviceTimeMin: 0, remark: '' })
const vasOk = (v: VasLine) => !!v.level && !!v.service && (v.level !== 'SKU' || !!v.skuCode)
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
const addressOk = (p: Party) => [p.line1, p.country, p.city, p.state].every(filled)
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
function PartyFields({ party, set, nameLabel, windowLabel, requireContact, locked, locationCode, hid, showErrors, floorLift = true }: {
  party: Party; set: (patch: Partial<Party>) => void
  nameLabel: string; windowLabel: string | null; requireContact?: boolean; locked?: boolean
  locationCode: ReactNode; hid: (k: string) => boolean; showErrors: boolean; floorLift?: boolean
}) {
  const err = (v: string | undefined, req = true) => (showErrors && req && !locked && !filled(v) ? 'Required field.' : undefined)
  const text = (k: keyof Party, label: string, o: { required?: boolean; type?: string; placeholder?: string } = {}) => (
    <F label={label} required={o.required} type={o.type} placeholder={o.placeholder}
      value={String(party[k] ?? '')} disabled={locked} error={err(String(party[k] ?? ''), !!o.required)}
      onChange={(v) => set({ [k]: v } as Partial<Party>)} />
  )
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

  /* ---- the console registry: relabels + Form Builder hides (tier membership follows staging) ---- */
  const [fieldCfg] = useState(loadFieldConfig)
  const [behavior] = useState(loadFormBehavior)
  const hid = (key: string) => fieldHidden(key, fieldCfg, 'full', behavior)
  const lbl = (key: string) => fieldLabel(key, fieldCfg)
  /* the tier the merchant last used (Simplified the first time); Dedicate Truck lives in both */
  const [formMode, setFormModeState] = useState<FormMode>(() => saved?.formMode ?? lastTier())
  const setFormMode = (m: FormMode) => { setFormModeState(m); try { localStorage.setItem(TIER_KEY, m) } catch { /* private mode */ } }
  const full = formMode === 'full'

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
  const [manualTo, setManualTo] = useState(() => !!saved || !!pr || !!jump)

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
      carrier: qa ? (ftlFirst ? CARRIERS[1].code : CARRIERS[0].code) : '',
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

  /* ---- FTL: Dedicate Truck on → Vehicle Details ---- */
  const isFtl = !fromOverage && !!c.dedicateTruck
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
  const [secure, setSecure] = useState(saved?.secure ?? false)
  const [noDg, setNoDg] = useState(true)
  const [service, setService] = useState(saved && saved.shipmentType !== 'FTL' ? saved.service : SERVICES[0].code)
  const [showErrors, setShowErrors] = useState(false)

  const receiverBook = useReceiverBook(db.orders)
  const fromList = !!senderStore && senderStore !== OTHER_ADDRESS
  const allDrops = [receiver, ...drops]

  /* Ship To's Location Code: the delivery-side Location Master rows for this merchant */
  const toLocations = useMemo(() => masters.locations.filter((l) => l.enabled
    && ['CUSTOMER_LOCATION', 'MERCHANT_LOCATION', 'PUDO', 'PARCEL_LOCKER'].includes(l.type)
    && (l.merchantCodes.length === 0 || (!!merchant && l.merchantCodes.includes(merchant.code)))), [masters.locations, merchant])
  const toLocationOpts = [{ value: '', label: '— None —' }, ...toLocations.map((l) => ({ value: l.code, label: `${l.name} (${l.code})` }))]

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
  const parcelSvc = SERVICES.find((s) => s.code === service) ?? SERVICES[0]
  const svc = isFtl
    ? { code: ftlService, days: ftlServiceType(ftlService).days, price: ftlQuoteVehicles(vehicles, drops.length, addServices) }
    : { ...parcelSvc, price: parcelSvc.price + vasTotal }
  const addressOptions = allDrops.map((d, i) => ({ value: String(i), label: `Address ${i + 1}${d.name ? ` · ${d.name}` : ''}${d.city ? `, ${d.city}` : ''}` }))
  const uncovered = allDrops.map((_, i) => i).filter((i) => !vehicles.some((v) => v.addressIdx.includes(i)))
  const overloaded = vehicles.filter((v) => v.actualLoadKg > vehicleSpec(v.vehicleType).payloadKg)
  const capacityKg = vehicles.reduce((n, v) => n + vehicleSpec(v.vehicleType).payloadKg, 0)
  const skuLines = parcels.flatMap((p, i) => (p.items ?? []).map((it, k) => ({ it, i, k })))
  const skuLineOpts = useMemo(() => {
    const seen = new Set<string>()
    return parcels.flatMap((p) => p.items ?? []).filter((it) => !isBlankItem(it))
      .map((it) => ({ value: it.skuCode ?? it.name.trim(), label: it.skuCode ? `${it.skuCode} · ${it.name}` : it.name.trim() }))
      .filter((o) => (seen.has(o.value) ? false : (seen.add(o.value), true)))
  }, [parcels])

  /* ---- identifiers: Simplified asks one number (the reference copies it), as staging does ---- */
  const idPref = full ? behavior.identifier : 'orderNumber'
  const effectiveOrder = (idPref === 'referenceNumber' ? c.referenceNumber : c.orderNumber) ?? ''
  const effectiveRef = (idPref === 'orderNumber' ? c.orderNumber : c.referenceNumber) ?? ''
  /* Simplified: Start / End Time sit on the Ship By Date and ARE the delivery window */
  const setWindowTime = (which: 'windowStart' | 'windowEnd', t: string) =>
    setReceiver((r) => ({ ...r, [which]: t ? `${c.shipByDate || today()}T${t}` : '' }))
  const setShipByDate = (d: string) => {
    setC({ shipByDate: d })
    if (!full && d) setReceiver((r) => ({
      ...r,
      ...(r.windowStart ? { windowStart: `${d}T${timeOf(r.windowStart)}` } : {}),
      ...(r.windowEnd ? { windowEnd: `${d}T${timeOf(r.windowEnd)}` } : {}),
    }))
  }

  /* ------------------------------------------------ completion + validation */
  const consignmentReq = [filled(effectiveOrder), filled(effectiveRef), !!c.consignmentType, filled(c.shipByDate),
    ...(full ? [] : [filled(timeOf(receiver.windowStart)), filled(timeOf(receiver.windowEnd))])]
  /* a Location Master row may be sparse and is not the merchant's to retype */
  const fromReq = fromList ? [filled(sender.name), filled(sender.line1)]
    : [sender.name, sender.line1, sender.country, sender.city, sender.state].map(filled)
  const toReq = allDrops.flatMap((d) => [d.name, d.contactNumber, d.line1, d.country, d.city, d.state].map(filled))
  const rtoReq = !full || c.rtoMode === RTO_MODES[0] ? [true] : [rto.name, rto.line1, rto.country, rto.city, rto.state].map(filled)
  const pieceReq = isFtl
    ? [!!ftlService, vehicles.length > 0, uncovered.length === 0,
      ...rows.map((r) => !!r.vehicleType && r.count >= 1 && r.loadKg > 0 && r.addressIdx.length > 0), noDg]
    : [...parcels.map((p) => p.quantity > 0 && p.weight > 0 && p.l > 0 && p.w > 0 && p.h > 0), noDg]
  const skuReq = isFtl ? [] : skuLines.map(({ it }) => isBlankItem(it) || (filled(it.name) && it.quantity >= 1))
  /* VAS is a Regular-form card, and an FTL booking's card in both tiers */
  const showVas = full || isFtl
  const vasReq = showVas ? (c.vas ?? []).map(vasOk) : []
  const carrierReq = [!!c.carrier]
  const allReq = [...consignmentReq, ...fromReq, ...toReq, ...rtoReq, ...pieceReq, ...skuReq, ...vasReq, ...carrierReq]
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
  const pickToLocation = (setParty: (p: Partial<Party>) => void) => (code: string) => {
    const l = toLocations.find((x) => x.code === code)
    setParty(l ? { ...l.party, locationCode: l.code } : { locationCode: '' })
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
  const moveItem = (i: number, k: number, to: number) => {
    if (to === i) return
    const it = parcels[i].items?.[k]
    if (!it) return
    setParcels((ps) => ps.map((x, j) => {
      if (j === i) return reweigh({ ...x, items: (x.items ?? []).filter((_, m) => m !== k) }, packageTypes)
      if (j === to) return reweigh({ ...x, items: [...(x.items ?? []), it] }, packageTypes)
      return x
    }))
  }
  const setVas = (i: number, patch: Partial<VasLine>) => setC({ vas: (c.vas ?? []).map((v, j) => (j === i ? { ...v, ...patch } : v)) })

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
  const jumpTarget = jump === 1 ? (isFtl ? 'sec-vehicle' : full ? 'sec-sku' : 'sec-package') : jump === 2 ? 'sec-carriers' : null
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
      rto: c.rtoMode === RTO_MODES[1] ? rto : null,
      packages: isFtl ? [] : parcels.map((p) => ({
        packageId: p.packageId, packageType: p.packageTypeName || CUSTOM_PACKAGE_NAME, quantity: p.quantity,
        trackingNumber: p.trackingNumber ?? '', palletSpace: p.palletSpace ?? '', description: p.description ?? '',
      })),
    },
    formMode,
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

  /* ---- the sections, in each tier's staging order ---- */
  const pkgIds = isFtl ? ['sec-vehicle'] : full ? ['sec-sku', 'sec-piece'] : ['sec-package']
  const sections = full
    ? ['sec-consignment', 'sec-ship-from', 'sec-rto', 'sec-ship-to', ...pkgIds, 'sec-vas', 'sec-carriers']
    : ['sec-consignment', 'sec-ship', ...pkgIds, ...(isFtl ? ['sec-vas'] : []), 'sec-carriers']
  const doneOf: Record<string, boolean> = {
    'sec-consignment': done(consignmentReq), 'sec-ship': done(fromReq) && done(toReq),
    'sec-ship-from': done(fromReq), 'sec-ship-to': done(toReq), 'sec-rto': done(rtoReq),
    'sec-package': done(pieceReq) && done(skuReq), 'sec-sku': done(skuReq), 'sec-piece': done(pieceReq), 'sec-vehicle': done(pieceReq),
    'sec-vas': done(vasReq), 'sec-carriers': done(carrierReq),
  }

  const proceed = () => {
    if (!canSubmit) {
      setShowErrors(true)
      if (!full && !done(toReq)) setManualTo(true)
      if (!full && !done(fromReq)) setEditFrom(true)
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
  const serviceTypeField = !hid('serviceType') && (isFtl
    ? <F label={lbl('serviceType')} value={ftlService} options={opts(FTL_SERVICE_CODES)} onChange={pickFtlService} />
    : <F label={lbl('serviceType')} value={service} options={SERVICES.map((s) => ({ value: s.code }))} onChange={setService} />)
  const tagsField = !hid('tags') && (
    <Fld label={lbl('tags')} info>
      <MultiSelect value={c.tags ?? []} options={TAG_OPTIONS} placeholder="eg, Ambient" onChange={(v) => setC({ tags: v })} />
    </Fld>
  )
  const dedicateToggle = (
    <ChipToggle icon={Truck} label={lbl('dedicateTruck')} checked={isFtl} onChange={setDedicateTruck} disabled={!!fromOverage} />
  )

  const consignmentSection = (
    <SectionCard id="sec-consignment" title="Consignment Details" done={doneOf['sec-consignment']}
      icon={<ClipboardList size={15} className={ICON} />}
      caption="Provide the consignment details to ensure accurate processing, routing, and billing of the shipment.">
      {full ? (
        <>
          <SubHead label="Identifiers" first />
          <Grid>
            {idPref !== 'referenceNumber' && (
              <F label={lbl('orderNumber')} required value={c.orderNumber ?? ''} placeholder="eg, ABC0001"
                error={reqErr(filled(effectiveOrder))} onChange={(v) => setC({ orderNumber: v })}
                helper={idPref === 'orderNumber' ? `${lbl('referenceNumber')} is copied from this.` : undefined} />
            )}
            {idPref !== 'orderNumber' && (
              <F label={lbl('referenceNumber')} required value={c.referenceNumber ?? ''} placeholder="eg, ABC0001"
                error={reqErr(filled(effectiveRef))} onChange={(v) => setC({ referenceNumber: v })}
                helper={idPref === 'referenceNumber' ? `${lbl('orderNumber')} is copied from this.` : undefined} />
            )}
            {!hid('consignmentNumber') && (
              <F label={lbl('consignmentNumber')} value={c.consignmentNumber ?? ''} placeholder="eg, 0001" onChange={(v) => setC({ consignmentNumber: v })} />
            )}
          </Grid>
          <SubHead label="Order" />
          <Grid>
            <F label={lbl('consignmentType')} required value={c.consignmentType ?? 'Forward'} options={opts(CONSIGNMENT_TYPES)}
              onChange={(v) => setC({ consignmentType: v })} />
            <F label={lbl('shipByDate')} required type="date" value={c.shipByDate ?? ''} error={reqErr(filled(c.shipByDate))} onChange={setShipByDate} />
            {!hid('exchangeOrderNumber') && c.consignmentType === 'Exchange' && (
              <F label={lbl('exchangeOrderNumber')} value={c.exchangeOrderNumber ?? ''} placeholder="eg, ABC0000" onChange={(v) => setC({ exchangeOrderNumber: v })}
                helper="Original order being exchanged" />
            )}
            {tagsField}
            {!hid('paymentMode') && (
              <F label={lbl('paymentMode')} value={c.paymentMode ?? ''} placeholder="eg, Prepaid" options={opts(PAYMENT_MODES)} onChange={(v) => setC({ paymentMode: v })} />
            )}
            {!hid('orderAmount') && (
              <FNum label={lbl('orderAmount')} blankZero placeholder="eg, 100.22" value={c.orderAmount ?? 0} onChange={(n) => setC({ orderAmount: n || null })} />
            )}
            {serviceTypeField}
            {!hid('labelFormat') && (
              <Fld label={lbl('labelFormat')}>
                <div className="inline-flex h-8 items-center overflow-hidden rounded-md border border-warm-300">
                  {LABEL_FORMATS.map((f) => {
                    const on = c.labelFormat === f
                    return (
                      <button key={f} type="button" onClick={() => setC({ labelFormat: f })}
                        className={`h-full whitespace-nowrap border-r border-warm-300 px-4 text-[13px] transition-colors last:border-r-0
                          ${on ? 'bg-brand-50 font-bold text-brand-500' : 'bg-surface text-ink-2 hover:bg-warm-50'}`}>
                        {f}
                      </button>
                    )
                  })}
                </div>
              </Fld>
            )}
          </Grid>
          {/* handling toggles — the console's chip row; Total Loading Time rides with Dedicate Truck */}
          <SubHead label="Handling" />
          <div className="flex flex-wrap items-center gap-3">
            {!hid('scannable') && <ChipToggle icon={ScanLine} label={lbl('scannable')} checked={!!c.scannable} onChange={(v) => setC({ scannable: v })} />}
            {!hid('schedulingConfirmation') && <ChipToggle icon={CalendarCheck} label={lbl('schedulingConfirmation')} checked={!!c.schedulingConfirmation} onChange={(v) => setC({ schedulingConfirmation: v })} />}
            {!hid('dedicateTruck') && dedicateToggle}
            {!hid('clearanceRequired') && <ChipToggle icon={FileCheck} label={lbl('clearanceRequired')} checked={!!c.clearanceRequired} onChange={(v) => setC({ clearanceRequired: v })} />}
            {!hid('totalLoadingTime') && isFtl && (
              <span className="flex items-center gap-1.5 text-[12.5px] text-ink-3">
                {lbl('totalLoadingTime').toLowerCase()}
                <span className="w-24"><NumBox blankZero integer unit="min" value={c.totalLoadingTime ?? 0} onChange={(n) => setC({ totalLoadingTime: n || null })} /></span>
              </span>
            )}
          </div>
          {(!hid('specialInstructions') || !hid('deliveryInstructions')) && (
            <>
              <SubHead label="Instructions" />
              <div className="grid grid-cols-1 gap-x-6 gap-y-4 md:grid-cols-2">
                {!hid('specialInstructions') && (
                  <F label={lbl('specialInstructions')} multiline value={c.specialInstructions ?? ''} placeholder="Handling notes visible to operations"
                    onChange={(v) => setC({ specialInstructions: v })} />
                )}
                {!hid('deliveryInstructions') && (
                  <F label={lbl('deliveryInstructions')} multiline value={instructions} placeholder="Instructions for the driver at the door"
                    onChange={(v) => setInstructions(v.slice(0, 150))} helper={`Shared with the pickup and delivery driver · ${instructions.length}/150`} />
                )}
              </div>
            </>
          )}
        </>
      ) : (
        <>
          <Grid>
            <F label={lbl('orderNumber')} required value={c.orderNumber ?? ''} placeholder="eg, ABC0001"
              error={reqErr(filled(effectiveOrder))} onChange={(v) => setC({ orderNumber: v })} />
            <F label={lbl('consignmentType')} required value={c.consignmentType ?? 'Forward'} options={opts(CONSIGNMENT_TYPES)}
              onChange={(v) => setC({ consignmentType: v })} />
            {serviceTypeField}
            <F label={lbl('shipByDate')} required type="date" value={c.shipByDate ?? ''} error={reqErr(filled(c.shipByDate))} onChange={setShipByDate} />
            <F label="Start Time" required type="time" value={timeOf(receiver.windowStart)}
              error={reqErr(filled(timeOf(receiver.windowStart)))} onChange={(v) => setWindowTime('windowStart', v)} />
            <F label="End Time" required type="time" value={timeOf(receiver.windowEnd)}
              error={reqErr(filled(timeOf(receiver.windowEnd)))} onChange={(v) => setWindowTime('windowEnd', v)} />
            {tagsField}
          </Grid>
          {/* Dedicate Truck in the Simplified tier too — FTL without switching tiers */}
          {!hid('dedicateTruck') && (
            <>
              <SubHead label="Handling" />
              <div className="flex flex-wrap items-center gap-3">{dedicateToggle}</div>
            </>
          )}
        </>
      )}
    </SectionCard>
  )

  const fromLocationCode = (
    <F label="Location Code" value={senderStore} onChange={pickSender}
      options={senderOptions} placeholder="eg, Williamstown" />
  )
  const saveSenderToggle = senderStore === OTHER_ADDRESS
    ? <span className="flex items-center gap-2 text-[12.5px] font-bold text-ink-2">Save address <Toggle checked={saveSender} onChange={setSaveSender} /></span>
    : undefined

  /* Simplified: Ship From card → Ship To contact, one card, as staging draws it */
  const shipSimplified = (
    <SectionCard id="sec-ship" done={doneOf['sec-ship']}
      icon={<MapPin size={15} className={ICON} />}
      title={<>Ship From <ArrowRight size={15} className="text-warm-400" /> Ship To</>}
      caption="Where the consignment is collected from and where it is delivered.">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_24px_minmax(0,1.5fr)]">
        <div className="min-w-0">
          <SubHead label="Ship From" first />
          <div className="flex items-start gap-3 rounded-lg border border-line bg-warm-25 px-4 py-3">
            <Warehouse size={16} className="mt-0.5 shrink-0 text-warm-400" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-bold text-ink">{sender.city || sender.name || <span className="font-normal text-ink-3">No pickup location yet</span>}</p>
              <p className="mt-0.5 flex items-center gap-1.5 truncate text-[12.5px] text-ink-3"><User size={13} className="shrink-0" /> {sender.contactNumber || sender.name || '—'}</p>
            </div>
            <IconButton icon={<Pencil size={14} />} title="Edit Ship From" onClick={() => setEditFrom((v) => !v)} />
          </div>
          {showErrors && !done(fromReq) && <p className="mt-1 text-[12.5px] text-brand-500">Ship From is incomplete — edit it</p>}
        </div>
        <div className="hidden items-center justify-center pt-8 text-warm-400 lg:flex"><ArrowRight size={18} /></div>
        <div className="min-w-0">
          <SubHead label="Ship To" first />
          <div className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
            <F label="Location Code" value={receiver.locationCode ?? ''} options={toLocationOpts}
              placeholder="eg, Williamstown" onChange={pickToLocation((p) => setReceiver((x) => ({ ...x, ...p })))} />
            <div className="flex items-end">
              <Button variant="outline" onClick={() => setManualTo((v) => !v)}>{manualTo ? 'Hide Address' : 'Add Manually'}</Button>
            </div>
            <F label="Full Name" required value={receiver.name} placeholder="Enter Full Name" error={reqErr(filled(receiver.name))}
              onChange={(v) => setReceiver((x) => ({ ...x, name: v }))} />
            {!hid('addrEmail') && <F label="Email" type="email" value={receiver.email} placeholder="Enter Email" onChange={(v) => setReceiver((x) => ({ ...x, email: v }))} />}
            <PhoneField label="Phone" required code={receiver.countryCode ?? ''} number={receiver.contactNumber}
              error={reqErr(filled(receiver.contactNumber))}
              onCode={(v) => setReceiver((x) => ({ ...x, countryCode: v }))} onNumber={(v) => setReceiver((x) => ({ ...x, contactNumber: v }))} />
          </div>
          {!manualTo && receiver.line1 && <p className="mt-3 truncate text-[12.5px] text-ink-3">{partyLine(receiver)}</p>}
          {!manualTo && showErrors && !addressOk(receiver) && <p className="mt-2 text-[12.5px] text-brand-500">Pick a Location Code or Add Manually</p>}
          {drops.length > 0 && <p className="mt-2 text-[12.5px] text-ink-3">+ {drops.length} more delivery address{drops.length === 1 ? '' : 'es'} — see the Regular form</p>}
        </div>
      </div>

      {editFrom && (
        <div className="mt-6 border-t border-line pt-5">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-[13px] font-bold text-ink">Edit Ship From</p>
            {saveSenderToggle}
          </div>
          <PartyFields party={sender} set={(p) => setSender((x) => ({ ...x, ...p }))} nameLabel="Sender Name" windowLabel={null}
            locked={fromList} locationCode={fromLocationCode}
            hid={(k) => hid(k) || ['addrCompanyName', 'addrLandmark', 'addrSuburb', 'addrCoordinates'].includes(k)}
            showErrors={showErrors} floorLift={false} />
        </div>
      )}
      {manualTo && (
        <div className="mt-6 border-t border-line pt-5">
          <SubHead label="Ship To address" first />
          <div className="mb-4"><AddressBookSearch book={receiverBook} onPick={(p) => setReceiver((x) => ({ ...x, ...p }))} /></div>
          <Grid>
            <F label="Address Line 1" required value={receiver.line1} placeholder="eg, Building No." error={reqErr(filled(receiver.line1))}
              onChange={(v) => setReceiver((x) => ({ ...x, line1: v }))} />
            {!hid('addrLines23') && <>
              <F label="Address Line 2" value={receiver.line2} placeholder="eg, Street 1 A" onChange={(v) => setReceiver((x) => ({ ...x, line2: v }))} />
              <F label="Address Line 3" value={receiver.line3 ?? ''} placeholder="eg, Behind High School" onChange={(v) => setReceiver((x) => ({ ...x, line3: v }))} />
            </>}
            <F label="Country" required value={receiver.country} options={opts(COUNTRIES)} placeholder="Select country" error={reqErr(filled(receiver.country))}
              onChange={(v) => setReceiver((x) => ({ ...x, country: v }))} />
            <F label="Postal Code" value={receiver.postalCode} options={opts(POSTCODES)} placeholder="eg, 1300"
              onChange={(v) => setReceiver((x) => ({ ...x, postalCode: v }))} />
            <F label="City" required value={receiver.city} error={reqErr(filled(receiver.city))}
              onChange={(v) => setReceiver((x) => ({ ...x, city: v }))} />
            <F label="State" required value={receiver.state} options={opts(STATES)} placeholder="Select state" error={reqErr(filled(receiver.state))}
              onChange={(v) => setReceiver((x) => ({ ...x, state: v }))} />
          </Grid>
        </div>
      )}
    </SectionCard>
  )

  const shipFromSection = (
    <SectionCard id="sec-ship-from" title="Ship From" done={doneOf['sec-ship-from']}
      icon={<Warehouse size={15} className={ICON} />}
      caption="Provide the pickup address and contact details for this consignment."
      action={saveSenderToggle}>
      <PartyFields party={sender} set={(p) => setSender((x) => ({ ...x, ...p }))} nameLabel="Sender Name" windowLabel="Pick Up"
        locked={fromList} locationCode={fromLocationCode} hid={hid} showErrors={showErrors} />
    </SectionCard>
  )

  const rtoSection = (
    <SectionCard id="sec-rto" title="Return To Origin (RTO)" done={doneOf['sec-rto']}
      icon={<Undo2 size={15} className={ICON} />}
      caption="Provide the return-to-origin address and contact details for this consignment.">
      <Segmented options={RTO_MODES} value={c.rtoMode ?? RTO_MODES[0]} onChange={(m) => setC({ rtoMode: m })} />
      {c.rtoMode === RTO_MODES[1] && (
        <div className="mt-5">
          <PartyFields party={rto} set={(p) => setRto((x) => ({ ...x, ...p }))} nameLabel="Name" windowLabel={null} hid={hid}
            showErrors={showErrors} floorLift={false}
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
              locationCode={<F label="Location Code" value={d.locationCode ?? ''} options={toLocationOpts} placeholder="eg, Williamstown"
                onChange={pickToLocation(set)} />} />
          </div>
        )
      })}
      <button type="button" onClick={() => setDrops((ds) => [...ds, blankParty()])}
        className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-warm-300 py-3
                   text-[13px] font-bold text-brand-500 transition-colors hover:border-brand-500 hover:bg-brand-50/40">
        <Plus size={14} /> Add a delivery address
      </button>
    </SectionCard>
  )

  const declarations = (
    <div className="mt-4 space-y-2 border-t border-line pt-3">
      <Tick checked={secure} onChange={setSecure} sub="Insurance cover for the declared value of this shipment">
        <span className="inline-flex items-center gap-1.5">Secure your package <ShieldPlus size={14} className="text-brand-500" /></span>
      </Tick>
      <Tick checked={noDg} onChange={setNoDg}>I declare that this shipment does not have Dangerous goods <span className="text-brand-500">*</span></Tick>
      {showErrors && !noDg && <p className="ml-[22px] text-[12.5px] text-brand-500">Required field.</p>}
    </div>
  )

  const packageTypeOpts = [...packageTypes.map((t) => ({ value: t.code, label: t.name })), { value: CUSTOM_PACKAGE, label: CUSTOM_PACKAGE_NAME }]
  const packageTypeTitle = packageTypes.length === 0 ? 'No presets in the Package master — enter dimensions'
    : !ownPresets ? `Showing all package types — none assigned to ${merchant?.name ?? 'this merchant'}` : undefined
  const pkgTypeName = (p: Parcel) => packageTypeOpts.find((o) => o.value === packageValue(p, packageTypes))?.label ?? CUSTOM_PACKAGE_NAME

  /* Simplified: ONE Package & SKU list, a row per package carrying its SKU */
  const packageSimplified = (
    <div id="sec-package" className="scroll-mt-20">
      <RepeatableList<Parcel>
        title="Package & SKU" addNoun="Package" icon={<PackageIcon size={15} className={ICON} />}
        caption="Provide the package and SKU details for this consignment."
        cardLabel={(i) => `Package ${i + 1}`}
        rows={parcels}
        incomplete={(p) => !(p.quantity > 0)}
        summary={(p) => <Facts items={[p.packageId, pkgTypeName(p), `×${p.quantity}`, p.items?.[0] && (p.items[0].skuCode ?? p.items[0].name)]} />}
        onAdd={() => { setFocusLine({ i: parcels.length, k: 0 }); setParcels((ps) => [...ps, newParcel()]) }}
        onRemove={(i) => setParcels((ps) => (ps.length > 1 ? ps.filter((_, j) => j !== i) : [newParcel()]))}
        body={(p, i) => {
          const it = p.items?.[0]
          const bound = !!it?.skuCode
          return (
            <Grid>
              <Fld label="Package ID"><ReadBox value={p.packageId ?? ''} /></Fld>
              <div title={packageTypeTitle}>
                <F label="Package Type" required value={packageValue(p, packageTypes)} options={packageTypeOpts} onChange={(v) => pickPackageType(i, v)} />
              </div>
              <FNum label="Quantity" required value={p.quantity} min={1} integer onChange={(n) => setParcel(i, { quantity: n })} />
              <F label="Tracking ID" value={p.trackingNumber ?? ''} placeholder="Auto"
                disabled={!!fromOverage && i === 0} onChange={(v) => setParcel(i, { trackingNumber: v })} />
              {it ? <>
                <Fld label="SKU Code">
                  <SkuCode item={it} skus={masters.skus} onPick={(s) => pickSku(i, 0, s)}
                    onUnlink={() => setItem(i, 0, { skuCode: null })} autoFocus={focusLine?.i === i && focusLine.k === 0} />
                </Fld>
                <F label="SKU Name" value={it.name} placeholder="SKU Name" disabled={bound} onChange={(v) => setItem(i, 0, { name: v })} />
                <F label="HSN Code" value={it.hsnCode ?? ''} placeholder="HSN" disabled={bound} onChange={(v) => setItem(i, 0, { hsnCode: v })} />
                <F label="Origin Country" value={it.originCountry ?? ''} options={ORIGIN_OPTS} placeholder="Origin" disabled={bound}
                  onChange={(v) => setItem(i, 0, { originCountry: v })} />
              </> : (
                <div className="flex items-end">
                  <Button variant="text" icon={<Plus size={13} />} onClick={() => addItem(i)}>Add SKU</Button>
                </div>
              )}
            </Grid>
          )
        }}
        totals={<>
          {parcels.some((p) => (p.items?.length ?? 0) > 1) && (
            <p className="mt-3 text-[12px] text-ink-3">A package with more than one SKU shows its first here — the Regular form lists every SKU.</p>
          )}
          {declarations}
        </>}
      />
    </div>
  )

  /* Regular: SKU — one row per SKU line, the console's SKU fields in the 4-column grid */
  type SkuLine = (typeof skuLines)[number]
  const skuSection = (
    <div id="sec-sku" className="scroll-mt-20">
      <RepeatableList<SkuLine>
        title="SKU" addNoun="SKU" icon={<Barcode size={15} className={ICON} />}
        caption="Provide the SKU details for this consignment to ensures precise tracking, billing, and handling of items."
        cardLabel={(n) => `SKU ${n + 1}`}
        rows={skuLines}
        incomplete={({ it }) => !(isBlankItem(it) || (filled(it.name) && it.quantity >= 1))}
        summary={({ it, i }) => <Facts items={[it.skuCode, it.name.trim() || (!it.skuCode && 'Not linked to the SKU master'), `×${it.quantity}`, `Piece ${i + 1}`]} />}
        onAdd={() => addItem(parcels.length - 1)}
        onRemove={(n) => { const l = skuLines[n]; if (l) removeItem(l.i, l.k) }}
        body={({ it, i, k }) => (
          <Grid>
            <Fld label="SKU Code">
              <SkuCode item={it} skus={masters.skus} onPick={(s) => pickSku(i, k, s)} onUnlink={() => setItem(i, k, { skuCode: null })}
                autoFocus={focusLine?.i === i && focusLine.k === k} />
            </Fld>
            <F label="SKU Name" required value={it.name} placeholder="eg, Chair" disabled={!!it.skuCode}
              error={reqErr(isBlankItem(it) || filled(it.name))} onChange={(v) => setItem(i, k, { name: v })} />
            {!hid('skuCategory') && <F label="Category" value={it.category ?? ''} onChange={(v) => setItem(i, k, { category: v })} />}
            {!hid('skuDescription') && <F label="Description" value={it.description ?? ''} onChange={(v) => setItem(i, k, { description: v })} />}
            {/* HSN Code then Origin Country — both tiers, from the SKU master on pick */}
            <F label="HSN Code" value={it.hsnCode ?? ''} disabled={!!it.skuCode} onChange={(v) => setItem(i, k, { hsnCode: v })} />
            <F label="Origin Country" value={it.originCountry ?? ''} options={ORIGIN_OPTS} placeholder="Select country" disabled={!!it.skuCode}
              onChange={(v) => setItem(i, k, { originCountry: v })} />
            {!hid('skuImage') && <F label="Image Url" value={it.imageUrl ?? ''} placeholder="https://" onChange={(v) => setItem(i, k, { imageUrl: v })} />}
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
            <FNum label="Quantity" required integer blankZero value={it.quantity}
              error={showErrors && !isBlankItem(it) && it.quantity < 1 ? 'Required field.' : undefined} onChange={(n) => setItem(i, k, { quantity: n })} />
            <F label="Piece" value={String(i)} options={parcels.map((_, j) => ({ value: String(j), label: `Piece ${j + 1} · ${parcels[j].packageId}` }))}
              onChange={(v) => moveItem(i, k, Number(v))} />
          </Grid>
        )}
      />
    </div>
  )

  /* Regular: Piece — one row per package spec */
  const pieceSection = (
    <div id="sec-piece" className="scroll-mt-20">
      <RepeatableList<Parcel>
        title="Piece" addNoun="Piece" icon={<PackageIcon size={15} className={ICON} />}
        caption="Provide the piece details for this consignment to ensure precise tracking, billing, and handling of items."
        cardLabel={(i) => `Piece ${i + 1}`}
        rows={parcels}
        incomplete={(p) => !(p.quantity > 0 && p.weight > 0 && p.l > 0 && p.w > 0 && p.h > 0)}
        summary={(p) => <Facts items={[p.packageId, pkgTypeName(p), `×${p.quantity}`, `${round2(p.weight)} kg`, `${p.l}×${p.w}×${p.h} cm`]} />}
        onAdd={() => setParcels((ps) => [...ps, { ...newParcel(), items: [] }])}
        onDuplicate={(i) => setParcels((ps) => [...ps.slice(0, i + 1), clonePackage(ps[i]), ...ps.slice(i + 1)])}
        onRemove={(i) => setParcels((ps) => (ps.length > 1 ? ps.filter((_, j) => j !== i) : ps))}
        body={(p, i) => {
          const vol = volKg(p) * p.quantity
          const inside = (p.items ?? []).filter((it) => !isBlankItem(it))
          return (
            <>
              <Grid>
                {!hid('pkgTracking') && (
                  <F label="Tracking Number" value={p.trackingNumber ?? ''} placeholder="Auto-generated when empty" disabled={!!fromOverage && i === 0}
                    helper={fromOverage && i === 0 ? 'The overage scan barcode' : undefined} onChange={(v) => setParcel(i, { trackingNumber: v })} />
                )}
                {!hid('pkgPalletSpace') && <F label="Pallet Space" value={p.palletSpace ?? ''} onChange={(v) => setParcel(i, { palletSpace: v })} />}
                {!hid('pkgDescription') && (
                  <F className="sm:col-span-2" label="Package Description" value={p.description ?? ''} onChange={(v) => setParcel(i, { description: v })} />
                )}
                {!hid('pkgDimensions') && (
                  <Fld label="Dimensions (L × W × H)" required error={showErrors && !(p.l > 0 && p.w > 0 && p.h > 0)} className="sm:col-span-2">
                    <div className="grid grid-cols-3 gap-2">
                      <NumBox value={p.l} unit="cm" error={reqErr(p.l > 0)} onChange={(n) => setParcel(i, { l: n })} />
                      <NumBox value={p.w} unit="cm" error={reqErr(p.w > 0)} onChange={(n) => setParcel(i, { w: n })} />
                      <NumBox value={p.h} unit="cm" error={reqErr(p.h > 0)} onChange={(n) => setParcel(i, { h: n })} />
                    </div>
                  </Fld>
                )}
                {!hid('pkgWeight') && (
                  <FNum label="Weight" required value={p.weight} unit="kg" error={reqErr(p.weight > 0)}
                    helper={p.weightMode === 'manual' ? undefined : 'Package tare + SKUs'}
                    onChange={(n) => setParcel(i, { weight: n, weightMode: 'manual' })} />
                )}
                <div title={packageTypeTitle}>
                  <F label="Package Type" required value={packageValue(p, packageTypes)} options={packageTypeOpts} onChange={(v) => pickPackageType(i, v)} />
                </div>
                <FNum label="Quantity" required value={p.quantity} min={1} integer onChange={(n) => setParcel(i, { quantity: n })} />
                <F label="Cargo Type" required value={p.cargoType} options={opts(CARGO_TYPES)} onChange={(v) => setParcel(i, { cargoType: v })} />
              </Grid>
              <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-1 border-t border-line pt-3 text-[12.5px] text-ink-2">
                <span>{p.quantity} × <b className="text-ink">{round2(p.weight)} kg</b></span>
                <span title="L × W × H ÷ 3500">Volumetric <b className="text-ink">{round2(vol)} kg</b></span>
                <span>Chargeable <b className="text-ink">{round2(Math.max(p.weight, volKg(p)) * p.quantity)} kg</b></span>
                <span className="min-w-0 truncate">{inside.length ? `SKUs: ${inside.map((it) => `${it.skuCode ?? it.name} ×${it.quantity}`).join(', ')}` : 'No SKUs yet'}</span>
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

  const vasSection = (
    <div id="sec-vas" className="scroll-mt-20">
      <RepeatableList<VasLine>
        title="Value Added Services" addNoun="Service" icon={<Wrench size={15} className={ICON} />}
        caption="Provide the value-added services for this consignment to ensure that the job is assigned with the right capabilities and resources."
        cardLabel={(i) => `VAS ${i + 1}`}
        rows={c.vas ?? []}
        incomplete={(v) => !vasOk(v)}
        summary={(v) => <Facts items={[v.service, v.level, v.level === 'SKU' && v.skuCode, v.serviceTimeMin ? `${v.serviceTimeMin} min` : null]} />}
        onAdd={() => setC({ vas: [...(c.vas ?? []), isFtl ? { ...newVas(), level: 'CONSIGNMENT' } : newVas()] })}
        onRemove={(i) => setC({ vas: (c.vas ?? []).filter((_, j) => j !== i) })}
        body={(v, i) => (
          <Grid>
            <F label="VAS Added Level" required value={v.level} options={opts(VAS_LEVELS)}
              onChange={(x) => setVas(i, { level: x as VasLine['level'], ...(x === 'SKU' ? {} : { skuCode: '' }) })} />
            {v.level === 'SKU'
              ? <F label="SKU Line Item No" required value={v.skuCode} placeholder={skuLineOpts.length ? 'Pick a SKU' : 'Add a SKU first'}
                  options={skuLineOpts} error={showErrors && !v.skuCode ? ' ' : undefined} onChange={(x) => setVas(i, { skuCode: x })} />
              : <Fld label="SKU Line Item No"><ReadBox value={v.level === 'PACKAGE' ? 'Every piece' : 'This consignment'} /></Fld>}
            <F label="Service" required value={v.service} placeholder="Pick a service"
              options={VAS_OPTS} error={showErrors && !v.service ? ' ' : undefined} onChange={(x) => setVas(i, { service: x })} />
            <FNum label="Service Time (mins)" required integer value={v.serviceTimeMin} unit="min" onChange={(n) => setVas(i, { serviceTimeMin: n })} />
            <F label="Remark" className="sm:col-span-2" value={v.remark} placeholder="Optional" onChange={(x) => setVas(i, { remark: x })} />
          </Grid>
        )}
      />
    </div>
  )

  const carrierSection = (
    <SectionCard id="sec-carriers" title="Carriers" count={CARRIERS.length} done={doneOf['sec-carriers']}
      icon={<Truck size={15} className={ICON} />}
      caption="Pick the carrier that will run this consignment — nothing is preselected.">
      <div className="rounded-lg border border-line p-5">
        <div className="flex flex-wrap gap-4">
          {CARRIERS.map((k) => {
            const on = c.carrier === k.code
            return (
              <button key={k.code} type="button" onClick={() => setC({ carrier: k.code })} role="radio" aria-checked={on}
                className={`flex items-center gap-2.5 rounded-md border bg-surface px-4 py-3 text-left transition-colors
                  ${on ? 'border-brand-500 text-ink' : 'border-line text-ink-2 hover:border-warm-300'}`}>
                {on
                  ? <CircleDot size={15} className="shrink-0 text-brand-500" />
                  : <span className="h-[15px] w-[15px] shrink-0 rounded-full border border-warm-300" />}
                <span>
                  <span className="block text-[14px] leading-tight">{k.code}</span>
                  <span className="block text-[12px] leading-tight text-ink-3">{k.sub}</span>
                </span>
              </button>
            )
          })}
        </div>
        {showErrors && !c.carrier && <p className="mt-3 text-[12.5px] text-brand-500">Select a carrier to create the consignment.</p>}
      </div>
    </SectionCard>
  )

  const byId: Record<string, ReactNode> = {
    'sec-consignment': consignmentSection, 'sec-ship': shipSimplified, 'sec-ship-from': shipFromSection,
    'sec-rto': rtoSection, 'sec-ship-to': shipToSection, 'sec-package': packageSimplified, 'sec-sku': skuSection,
    'sec-piece': pieceSection, 'sec-vehicle': vehicleSection, 'sec-vas': vasSection, 'sec-carriers': carrierSection,
  }
  const pct = Math.round((filledCount / allReq.length) * 100)

  return (
    <div>
      <PageHeader title={isFtl ? 'Add FTL Consignment' : 'Add Consignment'} subtitle={full ? 'Regular form' : 'Simplified form'}
        right={<TierSwitch<FormMode> value={formMode} onChange={setFormMode}
          options={[{ value: 'simplified', label: 'Simplified' }, { value: 'full', label: 'Regular Add Form' }]} />} />
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
              <SummaryBlock title="Ship From" onJump={() => jumpTo(full ? 'sec-ship-from' : 'sec-ship')}>{sender.name || '—'}{sender.line1 ? `, ${partyLine(sender)}` : ''}</SummaryBlock>
              <SummaryBlock title={allDrops.length > 1 ? `Ship To (${allDrops.length} addresses)` : 'Ship To'} onJump={() => jumpTo(full ? 'sec-ship-to' : 'sec-ship')}>
                {allDrops.map((d, i) => <p key={i}>{allDrops.length > 1 ? `${i + 1}. ` : ''}{d.name || '—'}{d.line1 ? `, ${partyLine(d)}` : ''}</p>)}
              </SummaryBlock>
              {isFtl ? (
                <SummaryBlock title="FTL · Vehicle Details" onJump={() => jumpTo('sec-vehicle')}>
                  {ftlService} · {units} vehicle{units === 1 ? '' : 's'} · {(actualLoad / 1000).toFixed(2)} tons
                  {addServices.length > 0 && <p className="text-[12.5px] text-ink-3">+ {addServices.join(', ')}</p>}
                </SummaryBlock>
              ) : (
                <SummaryBlock title="LTL · Package & SKU" onJump={() => jumpTo(full ? 'sec-piece' : 'sec-package')}>
                  {totals.qty} package{totals.qty === 1 ? '' : 's'} · {totals.items} SKU unit{totals.items === 1 ? '' : 's'}
                  <p className="text-[12.5px] text-ink-3">Dead {kg(totals.dead, 2)} · Vol {kg(totals.vol, 2)} · Chargeable {kg(totals.chargeable, 2)}</p>
                </SummaryBlock>
              )}
              <SummaryBlock title="Service Type · Carrier" onJump={() => jumpTo('sec-carriers')}>
                {svc.code} · {c.carrier || <span className="text-ink-3">no carrier yet</span>}
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
