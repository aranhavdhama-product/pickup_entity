/**
 * Add Order — the CONSOLE's Add Consignment (`/local/consignments/add[/vehicle]`), the
 * carrier's form. Since 2026-09-25 the Grow merchant portal has its own form
 * (`MerchantOrderForm.tsx`, spec docs/superpowers/specs/2026-09-25-grow-merchant-order-form-design.md);
 * this file no longer renders for Grow.
 *
 * OWNER OVERRIDE (2026-09-24): for this form, staging's current Add Order
 * form (staging.fareye.co/v2/ses/consignment → Add) IS the layout reference —
 * an explicit exception to CLAUDE.md's "staging screenshots are functionality,
 * never layout". Card order and wording, 4-column grids, label-above controls
 * with a red `*`, eager "Required field." under empty required fields, Add More
 * outline buttons top-right, the RTO radio cards, the Carriers well and the
 * sticky footer (Switch to Simplified | Go Back · Add Order) follow the capture
 * in docs/superpowers/research/2026-09-24-staging-add-order-form.md. Colours and
 * controls stay design.md tokens / Nueva primitives (components/consignmentForm
 * holds the staging-grammar pieces). No summary rail, progress bar or section nav.
 *
 *  Regular — Order · Ship From · Return To Origin (RTO) · Ship To · SKU · Piece
 *    (Vehicle Details instead of SKU/Piece on the FTL variant) · Value
 *    Added Services · Order Category (console only) · Carriers n.
 *  Simplified — Order (3 columns) · Ship From → Ship To (edited in modals) ·
 *    Package & SKU table (or Vehicle Details) · Carriers n.
 *
 * The FTL variant (Vehicle Details, FTL service types) opens only from /add/vehicle, ?type=FTL,
 * a saved FTL draft or an FTL pickup request. The Order grid has Service Type (every service), then
 * "Dedicated truck (FTL / FCL)" (consignment.dedicateTruck; no switch) — locked No for an LTL-only
 * service, locked Yes for an FTL-only one, the user's No/Yes for LTL & FTL (master Load type) —
 * then an OPTIONAL Vehicle Type (stored whenever picked); shipmentType stays 'Parcel'. Vehicle Types = masters.vehicleTypes (one
 * list for both variants: staging's Central Vehicle Config, sample catalogue as fallback).
 *
 * Console specifics (owner): Order Category card; Merchant is a select (it drives the same
 * merchant switch as the header ⇄); Add Order creates the consignment outright (no checkout,
 * no drafts). No auto-pickup block (owner, 2026-09-24): the Ship From
 * Pick Up Start / End Time pair is the only pickup window the form shows.
 *
 * Labels (incl. Form Builder relabels) and Form Builder hides come from the
 * console registry ConsignmentAdd/fieldConfig.ts (pure helpers only).
 * Deep links kept: `?draft=`, `?fromPickup=`, `?fromOverage=`, `?step=1|2`
 * (&type=FTL), `/add/vehicle`.
 */
import { useEffect, useMemo, useRef, useState, type ComponentProps, type KeyboardEvent, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowRight, CircleMinus, CircleUser, MapPin, Package, ScanBarcode, SquarePen, Trash2, Truck, X } from 'lucide-react'
import { blankParty, CURRENCY } from '../../growOrders/seed'
import { growOrderActions, orderById, pickupRequestById, useGrowOrders } from '../../growOrders/store'
import type { Party, StoreLocation } from '../../growOrders/types'
import {
  currentMerchant, ownPackageTypes, packageTypesForMerchant, setMerchantCode, useMasters, useMerchantCode,
  vehicleTypeOf, vehicleTypesFor, type PackageType, type SkuItem,
} from '../../growOrders/masters'
import { toast } from '../../nueva/toast'
import {
  Button, DateInput, IconButton, Input, MenuSelect, Modal, MultiSelect, MultiSelectDropdown, SearchInput,
} from '../../nueva/components'
import {
  AddMoreButton, PhoneInput, RadioCard, RowCard, SFld, SGrid, StagingCard, SwitchField, TimeBox, UnitBox,
} from '../../components/consignmentForm'
import { money, OTHER_ADDRESS, partyLine, partyOk, prWindow, storeOptionLabel } from './utils'
import { hubName, inboundHubFor, INBOUND_HUBS } from '../../growOrders/hubs'
import { usePickupLocations } from './pickupLocations'
import {
  ADDITIONAL_SERVICES, DEFAULT_FTL_SERVICE, FTL_SERVICE_CODES, PARCEL_SERVICES, SERVICE_TYPES, clearDraftKeys,
  loadTypeOf, ftlQuoteVehicles, ftlServiceType, totalLoadKg,
  vehiclesOf, type ConsignmentFields, type FtlVehicle, type OrderDraft, type Parcel, type ParcelItem, type VasLine,
} from '../../growOrders/draft'
/* the console's field registry — pure module, read-only here */
import { fieldHidden, fieldLabel, loadFieldConfig, loadFormBehavior } from '../ConsignmentAdd/fieldConfig'

type FormMode = 'simplified' | 'full'
/* the tier ops last used — Regular (staging's default) the first time */
const TIER_KEY = 'console-consignment-form-tier'
const lastTier = (): FormMode => {
  const fallback: FormMode = 'full'
  try { const v = localStorage.getItem(TIER_KEY); return v === 'full' || v === 'simplified' ? v : fallback } catch { return fallback }
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
const vasOk = (v: VasLine) => !!v.level && !!v.service && (v.level !== 'SKU' || !!v.skuCode)
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
      className={`flex w-full items-center gap-3 px-3 text-left transition-colors ${on ? 'bg-warm-50 hover:bg-warm-100' : 'hover:bg-warm-50'}`}>
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
  return <SFld label={label} required={required} error={error || undefined} helper={helper} className={className}>{control}</SFld>
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
  return <SFld label={label} required={required} error={!!p.error} helper={helper} className={className}><NumBox {...p} /></SFld>
}

/* ------------------------------------------------------------ address block ---- */

/** 'YYYY-MM-DD' + 'HH:mm' → 'YYYY-MM-DDTHH:mm' ('' when both are empty) */
const joinAt = (d: string, t: string, fallbackTime: string) => (d || t ? `${d || today()}T${t || fallbackTime}` : '')

/**
 * Staging's address grid, in its order, 4 columns:
 *   Location Code · Company Name · {Sender|Customer} Name* · Contact Number
 *   Email · Address Line 1* · Address Line 2 · Address Line 3
 *   Landmark · Country* · Postal Code · Suburb / County
 *   City* · State* · Latitude · Longitude
 *   {Pick Up|Delivery} Start Time (date · time) · End Time (date · time)
 *   Floor Number · Lift Available
 * `variant="rto"` = the RTO "Use Different Address" grid: the first 14 only,
 * Contact Number* and Postal Code* required.
 * `locked` = show the address read-only. Unused on the consignment form since 2026-09-25: a picked
 * Location Code only prefills, every field stays editable (owner).
 */
function PartyFields({ party, set, nameLabel, windowLabel, requireContact, locked, locationCode, hid, variant = 'full', trailing }: {
  party: Party; set: (patch: Partial<Party>) => void
  nameLabel: string; windowLabel: string | null; requireContact?: boolean; locked?: boolean
  locationCode: ReactNode; hid: (k: string) => boolean; variant?: 'full' | 'rto'
  /** a grid cell between Floor Number and Lift Available (Ship From: Vehicle Type) */
  trailing?: ReactNode
}) {
  const rto = variant === 'rto'
  const miss = (v: string | undefined, req: boolean) => req && !locked && !filled(v)
  const text = (k: keyof Party, label: string, o: { required?: boolean; type?: string; placeholder?: string } = {}) => (
    <F label={label} required={o.required} type={o.type} placeholder={o.placeholder}
      value={String(party[k] ?? '')} disabled={locked} error={miss(String(party[k] ?? ''), !!o.required) ? 'Required field.' : undefined}
      onChange={(v) => set({ [k]: v } as Partial<Party>)} />
  )
  const sel = (k: 'country' | 'postalCode' | 'state', label: string, list: string[], required: boolean) => (
    <F label={label} required={required} value={party[k] ?? ''} disabled={locked} options={opts(list)}
      error={miss(party[k], required) ? 'Required field.' : undefined} onChange={(v) => set({ [k]: v })} />
  )
  const w0 = party.windowStart ?? ''
  const w1 = party.windowEnd ?? ''
  return (
    <SGrid>
      {locationCode}
      {!hid('addrCompanyName') && text('businessName', 'Company Name', { placeholder: 'eg, Random Company' })}
      {text('name', nameLabel, { required: true, placeholder: 'eg, John Doe' })}
      <SFld label="Contact Number" required={requireContact} error={miss(party.contactNumber, !!requireContact)}>
        <PhoneInput code={party.countryCode ?? ''} number={party.contactNumber} codes={DIAL_CODES} disabled={locked}
          invalid={miss(party.contactNumber, !!requireContact)}
          onCode={(v) => set({ countryCode: v })} onNumber={(v) => set({ contactNumber: v })} />
      </SFld>
      {!hid('addrEmail') && text('email', 'Email', { type: 'email', placeholder: 'eg, johndoe@xyz.com' })}
      {text('line1', 'Address Line 1', { required: true, placeholder: 'eg, Building No.' })}
      {!hid('addrLines23') && <>{text('line2', 'Address Line 2', { placeholder: 'eg, Street 1 A' })}{text('line3', 'Address Line 3', { placeholder: 'eg, Behind High School' })}</>}
      {!hid('addrLandmark') && text('landmark', 'Landmark', { placeholder: 'eg, Behind High School' })}
      {sel('country', 'Country', COUNTRIES, true)}
      {sel('postalCode', 'Postal Code', POSTCODES, rto)}
      {!hid('addrSuburb') && text('county', 'Suburb / County')}
      {text('city', 'City', { required: true })}
      {sel('state', 'State', STATES, true)}
      {!rto && !hid('addrCoordinates') && <>{text('latitude', 'Latitude', { type: 'number' })}{text('longitude', 'Longitude', { type: 'number' })}</>}
      {!rto && windowLabel && !hid('addrWindow') && (
        <div className="col-span-full grid grid-cols-2 gap-x-8 gap-y-10 lg:grid-cols-4">
          <SFld label={`${windowLabel} Start Time`}>
            <DateInput value={dateOf(w0)} placeholder="Select Date" onChange={(d) => set({ windowStart: d ? joinAt(d, timeOf(w0), '00:00') : '' })} />
          </SFld>
          <SFld>
            <TimeBox value={timeOf(w0)} onChange={(t) => set({ windowStart: joinAt(dateOf(w0), t, '00:00') })} />
          </SFld>
          <SFld label={`${windowLabel} End Time`}>
            <DateInput value={dateOf(w1)} placeholder="Select Date" onChange={(d) => set({ windowEnd: d ? joinAt(d, timeOf(w1), '23:59') : '' })} />
          </SFld>
          <SFld>
            <TimeBox value={timeOf(w1)} onChange={(t) => set({ windowEnd: joinAt(dateOf(w1), t, '23:59') })} />
          </SFld>
        </div>
      )}
      {/* owner, 2026-09-25: Floor Number · Vehicle Type (Ship From's `trailing`) · Lift Available */}
      {!rto && !hid('addrFloorLift') && text('floorNumber', 'Floor Number', { type: 'number' })}
      {trailing}
      {!rto && !hid('addrFloorLift') && (
        <div className="flex items-start pt-7">
          <SwitchField label="Lift Available" checked={!!party.liftAvailable} onChange={(v) => set({ liftAvailable: v })} />
        </div>
      )}
    </SGrid>
  )
}

/**
 * The Simplified tier's Ship From / Ship To modal, as staging draws it:
 * "Search" → Location Code, "Or Enter Manually" → name · email · contact /
 * address lines / country · postal · city · state; Go Back · Confirm & Proceed.
 */
function AddressModal({ open, title, party, set, nameLabel, requireContact, locationCode, hid, onCancel, onConfirm }: {
  open: boolean; title: string; party: Party; set: (patch: Partial<Party>) => void; nameLabel: string
  requireContact?: boolean; locationCode: ReactNode; hid: (k: string) => boolean
  onCancel: () => void; onConfirm: () => void
}) {
  const miss = (v: string | undefined, req = true) => req && !filled(v)
  const text = (k: keyof Party, label: string, o: { required?: boolean; type?: string; placeholder?: string } = {}) => (
    <F label={label} required={o.required} type={o.type} placeholder={o.placeholder} value={String(party[k] ?? '')}
      error={miss(String(party[k] ?? ''), !!o.required) ? 'Required field.' : undefined} onChange={(v) => set({ [k]: v } as Partial<Party>)} />
  )
  const rule = (label: string) => (
    <div className="mb-4 mt-2 flex items-center gap-3">
      <span className="text-[13px] font-bold text-ink">{label}</span><span className="h-px flex-1 bg-warm-200" />
    </div>
  )
  return (
    <Modal open={open} title={title} onClose={onCancel} wide
      footer={<><Button variant="outline" onClick={onCancel}>Go Back</Button><Button onClick={onConfirm}>Confirm &amp; Proceed</Button></>}>
      {rule('Search')}
      <div className="mb-6 w-60">{locationCode}</div>
      {rule('Or Enter Manually')}
      <div className="grid grid-cols-1 gap-x-8 gap-y-10 pb-4 sm:grid-cols-3">
        {text('name', nameLabel, { required: true, placeholder: 'eg, John Doe' })}
        {!hid('addrEmail') ? text('email', 'Email', { type: 'email', placeholder: 'eg, johndoe@xyz.com' }) : <span />}
        <SFld label="Contact Number" required={requireContact} error={miss(party.contactNumber, !!requireContact)}>
          <PhoneInput code={party.countryCode ?? ''} number={party.contactNumber} codes={DIAL_CODES}
            invalid={miss(party.contactNumber, !!requireContact)}
            onCode={(v) => set({ countryCode: v })} onNumber={(v) => set({ contactNumber: v })} />
        </SFld>
        {text('line1', 'Address Line 1', { required: true, placeholder: 'eg, Building No.' })}
        {!hid('addrLines23') && <>{text('line2', 'Address Line 2', { placeholder: 'eg, Street 1 A' })}{text('line3', 'Address Line 3', { placeholder: 'eg, Behind High School' })}</>}
      </div>
      <div className="grid grid-cols-2 gap-x-8 gap-y-10 pb-4 sm:grid-cols-4">
        <F label="Country" required value={party.country} options={opts(COUNTRIES)} error={miss(party.country) ? 'Required field.' : undefined} onChange={(v) => set({ country: v })} />
        <F label="Postal Code" value={party.postalCode} options={opts(POSTCODES)} onChange={(v) => set({ postalCode: v })} />
        {text('city', 'City', { required: true })}
        <F label="State" required value={party.state} options={opts(STATES)} error={miss(party.state) ? 'Required field.' : undefined} onChange={(v) => set({ state: v })} />
      </div>
    </Modal>
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

const jumpTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })

/* -------------------------------------------------------------------- page ---- */
/** Plain-language one-liners under the handling switches (owner copy, 2026-09-24). */
const SWITCH_HINTS = {
  scannable: 'The boxes carry barcodes and get scanned along the way.',
  schedulingConfirmation: 'Check the delivery time with the customer first.',
  dedicateTruck: 'One whole truck just for this consignment.',
  clearanceRequired: 'Needs customs or gate clearance before it can move.',
  splittable: 'Packages may travel on different trips and arrive separately.',
}

/** Order Category — the console's six switches, in staging's order. */
const ORDER_CATEGORIES = ['4 Person', 'Stackable', 'Fragile', 'VIP', 'Hazmat', 'Heavy Weight'] as const

/**
 * `portal` = whose shell the form is in. The CONSOLE variant (`/local/consignments/add`)
 * adds the Order Category card below VAS, creates the consignment outright (no
 * checkout, no drafts — payment is the merchant's gate, not ops') and returns to
 * the Consignment Order list; the Grow variant is unchanged.
 */
export default function AddOrderPage() {
  const base = '/local/consignments'
  const prPath = (id: string) => `/local/pickup/${id}`
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
  /* customer-facing copy for a registry field, unless Form Builder relabelled it */
  const custom = (key: string, registryDefault: string, copy: string) => { const l = lbl(key); return l === registryDefault ? copy : l }
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
      carrier: qa ? (ftlFirst ? CARRIERS[1].code : CARRIERS[0].code) : '',
      /* the console records Order Category explicitly — an empty list is a choice */
      category: [],
      ...saved?.consignment,
      /* an older FTL draft kept its extras in additionalServices — they are VAS rows now */
      ...(saved && !saved.consignment?.vas?.length && saved.additionalServices?.length
        ? { vas: saved.additionalServices.map((sv) => ({ level: 'CONSIGNMENT' as const, skuCode: '', service: sv, serviceTimeMin: 0, remark: '' })) } : {}),
      ...(ftlFirst ? { dedicateTruck: true } : {}),
      ...(fromOverage ? { dedicateTruck: false } : {}),
    }
  })
  const setC = (patch: Partial<ConsignmentFields>) => setCState((x) => ({ ...x, ...patch }))
  /* staging's form has no Delivery Instructions field — a draft's value is carried through */
  const [instructions] = useState(saved?.instructions ?? '')

  /* ---- FTL variant: reached ONLY via /add/vehicle, ?type=FTL, a saved FTL draft or an FTL pickup
     request (owner, 2026-09-24); Dedicate Truck is on and locked there. On the parcel form
     the Service Type's Load type decides Dedicated truck. ---- */
  const isFtl = ftlFirst
  const [ftlService, setFtlService] = useState(saved?.ftlServiceType || pr?.ftlServiceType || DEFAULT_FTL_SERVICE)
  const [rows, setRows] = useState<VehicleRow[]>(() => {
    if (saved?.shipmentType === 'FTL') return rowsOf(vehiclesOf(saved))
    if (pr?.shipmentType === 'FTL') return rowsOf(vehiclesOf({ vehicleType: pr.vehicleType, vehicleUnit: pr.vehicleUnit, actualLoad: pr.expectedWeightKg, drops: [] }))
    return [{ vehicleType: '8 Ton Truck', count: 1, loadKg: 6400, addressIdx: [0] }]
  })
  /* the parcel form's Dedicate Truck: ONE vehicle, to the one Ship To — only its type is asked
     (owner, 2026-09-24); a dedicated-truck parcel draft reopens with the type it kept */
  const [dedicatedType, setDedicatedType] = useState(() => (saved && saved.shipmentType !== 'FTL' ? saved.vehicles?.[0]?.vehicleType ?? '' : ''))
  const vehicles = useMemo(() => vehiclesOfRows(rows), [rows])

  /* ---- packages (Package & SKU / SKU + Piece) ---- */
  const [parcels, setParcels] = useState<Parcel[]>(() => {
    if (saved?.parcels?.length && saved.shipmentType !== 'FTL') return saved.parcels.map((p) => ({ ...p, packageId: p.packageId || newPackageId() }))
    const p = newParcel()
    const w = fromOverage?.scan.weightKg
    /* the overage barcode IS this package's tracking number */
    return [fromOverage ? { ...p, weight: w ?? p.weight, weightMode: w ? 'manual' : 'auto', trackingNumber: fromOverage.scan.barcode } : p]
  })
  /* staging's form carries no declarations: a draft's Secure choice is kept, no-DG stays declared */
  const secure = saved?.secure ?? false
  const noDg = true
  const [service, setService] = useState(saved && saved.shipmentType !== 'FTL' ? saved.service : SERVICES[0].code)

  const fromList = !!senderStore && senderStore !== OTHER_ADDRESS
  const allDrops = [receiver, ...drops]

  /* Ship To's Location Code: the delivery-side Location Master rows for this merchant */
  const toLocations = useMemo(() => masters.locations.filter((l) => l.enabled
    && ['CUSTOMER_LOCATION', 'MERCHANT_LOCATION', 'PUDO', 'PARCEL_LOCKER'].includes(l.type)
    && (l.merchantCodes.length === 0 || (!!merchant && l.merchantCodes.includes(merchant.code)))), [masters.locations, merchant])
  const toLocationOpts = [{ value: '', label: '— None —' }, ...toLocations.map((l) => ({ value: l.code, label: `${l.name} (${l.code})` }))]

  const fromPr = pr && isFtl ? pr : undefined
  /* the parcel form's "Dedicated truck (FTL / FCL)" FOLLOWS the Service Type's master Load type:
     LTL only → No (locked), FTL only → Yes (locked), LTL & FTL → the user's No/Yes (owner, 2026-09-25) */
  const serviceLoad = useMemo(() => loadTypeOf(service), [service])
  const dedicatedLocked = serviceLoad !== 'both'
  const dedicated = !isFtl && (serviceLoad === 'ftl' || (serviceLoad === 'both' && !!c.dedicateTruck))
  /* what the dedicated truck carries: the packages' total weight */
  const parcelLoadKg = parcels.reduce((n, p) => n + (p.weight || 0) * (p.quantity || 0), 0)
  /* Vehicles are configured PER HUB (staging's Central Vehicle Config is keyed by city + hub): the
     list is the Ship From hub's — a hub-code location is its own hub, any other picked location or
     a typed address resolves through inboundHubFor; nothing chosen yet = no hub, no vehicles */
  const shipFromHub = useMemo(() => {
    /* the PH network's rule (inboundHubFor), plus the Chicago network's ORD hub for US pickups */
    const hubOf = (p: Party) => (/chicago|schiller|illinois|\bil\b/i.test(`${p.city} ${p.state}`) ? 'ORD' : inboundHubFor(p))
    if (senderStore && senderStore !== OTHER_ADDRESS) {
      return INBOUND_HUBS.some((h) => h.code === senderStore) ? senderStore : hubOf(sender)
    }
    return filled(sender.city) || filled(sender.state) ? hubOf(sender) : null
  }, [senderStore, sender])
  const hubVehicles = vehicleTypesFor(masters.vehicleTypes, shipFromHub)
  /* a vehicle not configured at the (new) Ship From hub is not a choice any more */
  const vehicleChoice = hubVehicles.some((v) => v.code === dedicatedType) ? dedicatedType : ''
  /* the FTL variant: the hub's vehicles, narrowed by the FTL service type */
  const vehicleOpts = vehicleTypesFor(masters.vehicleTypes, shipFromHub, isFtl ? ftlService : null)
  const payloadOf = (type: string) => vehicleTypeOf(masters.vehicleTypes, type)?.payloadKg ?? 0
  const units = vehicles.length
  const vehicleType = vehicles[0]?.vehicleType ?? ''
  const actualLoad = totalLoadKg(vehicles)
  /* the chosen VAS names — what `additionalServices` carries for compatibility; the rate card prices them */
  const addServices = (c.vas ?? []).map((v) => v.service).filter(Boolean)
  const vasTotal = addServices.reduce((n, sv) => n + vasPrice(sv), 0)
  /* a Service Type with no rate-card row keeps its own name; it prices / ETAs as the Standard service */
  const parcelSvc = SERVICES.find((s) => s.code === service) ?? { ...SERVICES[0], code: service || SERVICES[0].code }
  const svc = isFtl
    ? { code: ftlService, days: ftlServiceType(ftlService).days, price: ftlQuoteVehicles(vehicles, drops.length, addServices) }
    : { ...parcelSvc, price: parcelSvc.price + vasTotal }
  const addressOptions = allDrops.map((d, i) => ({ value: String(i), label: `Address ${i + 1}${d.name ? ` · ${d.name}` : ''}${d.city ? `, ${d.city}` : ''}` }))
  const uncovered = allDrops.map((_, i) => i).filter((i) => !vehicles.some((v) => v.addressIdx.includes(i)))
  const overloaded = vehicles.filter((v) => payloadOf(v.vehicleType) > 0 && v.actualLoadKg > payloadOf(v.vehicleType))
  const capacityKg = vehicles.reduce((n, v) => n + payloadOf(v.vehicleType), 0)
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
  const consignmentReq = [filled(effectiveOrder), filled(effectiveRef), !!c.consignmentType, filled(c.shipByDate), !!merchant,
    ...(full ? [] : [filled(timeOf(receiver.windowStart)), filled(timeOf(receiver.windowEnd))])]
  /* the fields stay editable after a Location Code pick, so a sparse master row is completed here —
     the same required set as a typed address (it matches the red lines the fields show) */
  const fromReq = [sender.name, sender.line1, sender.country, sender.city, sender.state].map(filled)
  const toReq = allDrops.flatMap((d) => [d.name, d.contactNumber, d.line1, d.country, d.city, d.state].map(filled))
  const rtoReq = !full || c.rtoMode === RTO_MODES[0] ? [true]
    : [rto.name, rto.contactNumber, rto.line1, rto.country, rto.postalCode, rto.city, rto.state].map(filled)
  const pieceReq = isFtl
    ? [!!ftlService, vehicles.length > 0, uncovered.length === 0,
      ...rows.map((r) => !!r.vehicleType && r.count >= 1 && r.loadKg > 0 && r.addressIdx.length > 0), noDg]
    : [...parcels.map((p) => p.quantity > 0 && (!full || p.weight > 0)), noDg]
  /* Regular: every SKU row is staging's — Code*, Name*, Quantity*, Weight*, L/W/H*. Simplified asks code/name only. */
  const skuLineOk = (it: ParcelItem) => (full
    ? !!it.skuCode && filled(it.name) && it.quantity >= 1 && it.weightKg > 0
      && (it.lengthCm ?? 0) > 0 && (it.widthCm ?? 0) > 0 && (it.heightCm ?? 0) > 0
    : isBlankItem(it) || filled(it.name))
  const skuReq = isFtl ? [] : skuLines.map(({ it }) => skuLineOk(it))
  /* VAS is a Regular-form card, and an FTL booking's card in both tiers */
  const showVas = full || isFtl
  const vasReq = showVas ? (c.vas ?? []).map(vasOk) : []
  const carrierReq = [!!c.carrier]
  /* a service that cannot take a dedicated truck blocks — unless the field is hidden, so it cannot be fixed */
  /* Vehicle Type is optional — required once Dedicated truck is Yes */
  const vehicleReq = dedicated ? [!!vehicleChoice] : []
  const allReq = [...consignmentReq, ...vehicleReq, ...fromReq, ...toReq, ...rtoReq, ...pieceReq, ...skuReq, ...vasReq, ...carrierReq]
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
  /* the form-level Service Type is the ONE source; the vehicle types follow it */
  const pickFtlService = (code: string) => {
    setFtlService(code)
    /* a type the new service does not offer becomes its first option */
    const allowed = vehicleTypesFor(masters.vehicleTypes, shipFromHub, code)
    setRows((rs) => rs.map((r) => ({ ...r, vehicleType: allowed.some((v) => v.code === r.vehicleType) ? r.vehicleType : allowed[0]?.code ?? '' })))
  }
  /* "Dedicated truck (FTL / FCL)" for an LTL & FTL service: the user's choice */
  const setDedicateTruck = (on: boolean) => setC({ dedicateTruck: on })
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
  /** line `k` of package `i`, created blank when the row edits a SKU that is not there yet */
  const padTo = (items: ParcelItem[], k: number) => (items.length > k ? items : [...items, ...Array.from({ length: k + 1 - items.length }, blankItem)])
  const [focusLine, setFocusLine] = useState<{ i: number; k: number } | null>(null)
  const addItem = (i: number) => {
    setFocusLine({ i, k: (parcels[i].items ?? []).length })
    setItems(i, (items) => [...items, blankItem()])
  }
  /** A SKU picked from the master fills name, category, HSN Code, Origin Country, weight and dimensions. */
  const pickSku = (i: number, k: number, s: SkuItem) =>
    setItems(i, (items) => padTo(items, k).map((it, m) => (m === k ? {
      ...it, skuCode: s.code, name: s.name, weightKg: s.weightKg, weightUom: 'KG', hsnCode: s.hsnCode, originCountry: s.originCountry,
      category: it.category || s.category, lengthCm: s.lengthCm, widthCm: s.widthCm, heightCm: s.heightCm, dimUom: 'CM',
      quantity: it.quantity || 1, ...(s.unitCost ? { unitCost: s.unitCost } : {}),
    } : it)))
  const setItem = (i: number, k: number, patch: Partial<ParcelItem>) =>
    setItems(i, (items) => padTo(items, k).map((it, m) => (m === k ? { ...it, ...patch } : it)))
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
    /* a dedicated-truck parcel consignment = ONE vehicle to Address 1, in the single-vehicle shape
       every reader already knows; shipmentType stays 'Parcel' */
    receiver, drops, shipmentType: isFtl ? 'FTL' : 'Parcel',
    ...(isFtl
      ? { vehicleType, vehicleUnit: units, actualLoad, ftlServiceType: ftlService, vehicles }
      : vehicleChoice
        ? { vehicleType: vehicleChoice, vehicleUnit: 1, actualLoad: parcelLoadKg, vehicles: [{ vehicleType: vehicleChoice, actualLoadKg: parcelLoadKg, addressIdx: [0] }] }
        : { vehicleType: '', vehicleUnit: 0, actualLoad: 0 }),
    additionalServices: addServices,
    parcels: isFtl
      ? [{ cargoType: 'FTL', itemInfo: [ftlService, ...vehicles.map((v) => v.vehicleType), ...addServices].join(' · '), quantity: units, weight: actualLoad / Math.max(1, units), l: 120, w: 100, h: 150 }]
      : parcels.map((p) => ({ ...p, items: (p.items ?? []).filter((it) => !isBlankItem(it)), itemInfo: itemInfoOf(p) })),
    authority: saved?.authority || 'Leave at the door', instructions, secure, service: svc.code, rate: svc.price, etaDays: svc.days,
    consignment: {
      ...c,
      /* the Dedicated truck answer, always recorded */
      dedicateTruck: isFtl || dedicated,
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

  const backTo = fromPr ? prPath(fromPr.id)
    : fromOverage ? prPath(fromOverage.pr.id)
    : base

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
  const pkgIds = isFtl ? ['sec-vehicle']
    : full ? ['sec-sku', 'sec-piece'] : ['sec-package']
  /* Order Category sits below VAS on the console's Regular tier only (owner, 2026-09-24; staging's Simplified has none) */
  const categoryIds = ['sec-category']
  const sections = full
    ? ['sec-consignment', 'sec-ship-from', 'sec-rto', 'sec-ship-to', ...pkgIds, 'sec-vas', ...categoryIds, 'sec-carriers']
    : ['sec-consignment', 'sec-ship', ...pkgIds, ...(isFtl ? ['sec-vas'] : []), 'sec-carriers']
  const doneOf: Record<string, boolean> = {
    'sec-consignment': done(consignmentReq), 'sec-ship': done(fromReq) && done(vehicleReq) && done(toReq),
    'sec-ship-from': done(fromReq) && done(vehicleReq), 'sec-ship-to': done(toReq), 'sec-rto': done(rtoReq),
    'sec-package': done(pieceReq) && done(skuReq), 'sec-sku': done(skuReq), 'sec-piece': done(pieceReq), 'sec-vehicle': done(pieceReq),
    'sec-vas': done(vasReq), 'sec-category': true, 'sec-carriers': done(carrierReq),
  }

  const proceed = () => {
    if (!canSubmit) {
      const first = sections.find((s) => !doneOf[s])
      if (first) setTimeout(() => jumpTo(first), 60)
      return
    }
    persistTypedSender()
    /* ops create the consignment outright — there is no payment gate on this side */
    const o = growOrderActions.saveDraft(buildDraft(), draftId ?? undefined)
    growOrderActions.markPaid(o.id)
    clearDraftKeys()
    if (fromPr && growOrderActions.attachOrdersToPickup(fromPr.id, [o.id]).length > 0) {
      toast.success(`Consignment ${o.orderNumber} created and added to ${fromPr.number}`)
      nav(prPath(fromPr.id))
      return
    }
    const auto = growOrderActions.autoBookOnConsignment(o.id, merchantCode)
    toast.success(auto ? `Consignment ${o.orderNumber} created · Pickup Request ${auto.number} scheduled` : `Consignment ${o.orderNumber} created`)
    nav(base)
  }

  /* ------------------------------------------------------------ sections */
  const err = (bad: boolean) => (bad ? 'Required field.' : undefined)
  /* Service Type lists every service (no narrowing); on the parcel form it decides the Dedicated
     truck field below. The FTL field lists the FTL service types — its choice drives the vehicles. */
  const serviceTypeField = !hid('serviceType') && (isFtl
    ? <F label={lbl('serviceType')} value={ftlService} options={opts(FTL_SERVICE_CODES)} placeholder="eg, Service" onChange={pickFtlService} />
    : <F label={lbl('serviceType')} value={service} options={opts(SERVICE_TYPES)} placeholder="eg, Service" searchable onChange={setService} />)
  const tagsField = !hid('tags') && (
    <SFld label={lbl('tags')} info>
      <MultiSelect value={c.tags ?? []} options={TAG_OPTIONS} placeholder="eg, Ambient" onChange={(v) => setC({ tags: v })} />
    </SFld>
  )
  /* Merchant — staging asks it on both tiers. The console picks it (the same switch the
     header ⇄ drives, so Ship From and the package presets follow); on Grow it is the
     signed-in merchant and is shown, never edited. */
  const merchantField = (
    <F label="Merchant" required value={merchant?.code ?? ''} placeholder="eg, ELEX" 
      options={masters.merchants.map((m) => ({ value: m.code, label: m.name }))} error={err(!merchant)}
      onChange={(v) => setMerchantCode(v || null)} />
  )
  const orderNumberField = (
    <F label={lbl('orderNumber')} required value={c.orderNumber ?? ''} placeholder="eg, ABC0001"
      error={err(!filled(effectiveOrder))} onChange={(v) => setC({ orderNumber: v })}
      helper={full && idPref === 'orderNumber' ? `${lbl('referenceNumber')} is copied from this.` : undefined} />
  )
  const consignmentTypeField = (
    <F label={lbl('consignmentType')} required value={c.consignmentType ?? 'Forward'} options={opts(CONSIGNMENT_TYPES)}
      onChange={(v) => setC({ consignmentType: v })} />
  )
  const shipByField = <F label={lbl('shipByDate')} required type="date" value={c.shipByDate ?? ''} error={err(!filled(c.shipByDate))} onChange={setShipByDate} />

  /* after Service Type: "Dedicated truck (FTL / FCL)" — locked to the service's Load type unless it
     is LTL & FTL (owner, 2026-09-25). The Vehicle Type it may require lives on the Ship From card. */
  const dedicatedFields = !isFtl && (
    /* customer-facing copy (owner, 2026-09-25): "Load type" — Shared vehicle (No) / Full vehicle (Yes) */
    <F label="Load type" value={dedicated ? 'Yes' : 'No'}
      options={[{ value: 'No', label: 'Shared vehicle (LTL / LCL)' }, { value: 'Yes', label: 'Full vehicle (FTL / FCL)' }]}
      onChange={(v) => setDedicateTruck(v === 'Yes')} disabled={dedicatedLocked || !!fromOverage}
      helper={dedicatedLocked ? `Set by the service — ${serviceLoad === 'ftl' ? 'full' : 'shared'} vehicle only` : undefined} />
  )

  /* Vehicle Type — asked on the Ship From card, AFTER the pickup location, from that hub's fleet;
     optional, required when Dedicated truck is Yes */
  const dedicatedSpec = vehicleTypeOf(hubVehicles, vehicleChoice)
  const shipFromHubName = shipFromHub ? hubName(shipFromHub, stores) : ''
  const vehicleField = !isFtl && (
    <SFld label="Vehicle Type" required={dedicated} error={dedicated && !!shipFromHub && !vehicleChoice}
      helper={dedicatedSpec?.capacity || (shipFromHub ? `Vehicles configured at ${shipFromHubName}` : undefined)}>
      {shipFromHub
        ? <MenuSelect value={vehicleChoice} placeholder={hubVehicles.length ? 'eg, 8 Ton Truck' : `No vehicles configured at ${shipFromHubName}`}
            options={['', ...hubVehicles.map((v) => v.code)]}
            labels={(v) => (v ? vehicleTypeOf(hubVehicles, v)?.name ?? v : '— None —')} searchable onChange={setDedicatedType} />
        : <Input value="" placeholder="Select a Ship From location first" disabled onChange={() => undefined} />}
    </SFld>
  )

  const orderSection = (
    <StagingCard id="sec-consignment" title="Order"
      caption="Provide the order details to ensure accurate processing, routing, and billing of the shipment.">
      {full ? (
        <>
          <SGrid>
            {idPref !== 'referenceNumber' && orderNumberField}
            {idPref !== 'orderNumber' && (
              <F label={lbl('referenceNumber')} required value={c.referenceNumber ?? ''} placeholder="eg, ABC0001"
                error={err(!filled(effectiveRef))} onChange={(v) => setC({ referenceNumber: v })}
                helper={idPref === 'referenceNumber' ? `${lbl('orderNumber')} is copied from this.` : undefined} />
            )}
            {!hid('consignmentNumber') && (
              <F label={lbl('consignmentNumber')} value={c.consignmentNumber ?? ''} placeholder="eg, 0001" onChange={(v) => setC({ consignmentNumber: v })} />
            )}
            {consignmentTypeField}
            {!hid('exchangeOrderNumber') && c.consignmentType === 'Exchange' && (
              <F label={lbl('exchangeOrderNumber')} value={c.exchangeOrderNumber ?? ''} placeholder="eg, ABC0000" onChange={(v) => setC({ exchangeOrderNumber: v })}
                helper="Original order being exchanged" />
            )}
            {shipByField}
            {merchantField}
            {tagsField}
            {!hid('paymentMode') && (
              <F label={lbl('paymentMode')} value={c.paymentMode ?? ''} placeholder="eg, Prepaid" options={opts(PAYMENT_MODES)} onChange={(v) => setC({ paymentMode: v })} />
            )}
            {!hid('orderAmount') && (
              <FNum label={lbl('orderAmount')} blankZero placeholder="eg, 100.22" value={c.orderAmount ?? 0} onChange={(n) => setC({ orderAmount: n || null })} />
            )}
            {serviceTypeField}
            {dedicatedFields}
            {!hid('labelFormat') && (
              <F label={lbl('labelFormat')} value={c.labelFormat ?? ''} placeholder="eg, PDF" options={opts(LABEL_FORMATS)} onChange={(v) => setC({ labelFormat: v })} />
            )}
            {/* owner, 2026-09-25: a normal grid field beside Label Format, not on the switch line */}
            {!hid('totalLoadingTime') && (
              <SFld label={lbl('totalLoadingTime')}>
                <NumBox blankZero integer placeholder="minutes" value={c.totalLoadingTime ?? 0} onChange={(n) => setC({ totalLoadingTime: n || null })} />
              </SFld>
            )}
          </SGrid>
          {/* the switch line — label left of each switch, a plain-language line under each label */}
          <div className="mt-6 flex flex-wrap items-start gap-x-8 gap-y-5 lg:pr-10">
            {!hid('scannable') && <SwitchField label={custom('scannable', 'Scannable', 'Barcode labels on boxes')} hint={SWITCH_HINTS.scannable} checked={!!c.scannable} onChange={(v) => setC({ scannable: v })} />}
            {!hid('schedulingConfirmation') && <SwitchField label={lbl('schedulingConfirmation')} hint={SWITCH_HINTS.schedulingConfirmation} checked={!!c.schedulingConfirmation} onChange={(v) => setC({ schedulingConfirmation: v })} />}
            {/* owner, 2026-09-25: no Dedicate Truck SWITCH on the consignment form — the
                "Dedicated truck (FTL / FCL)" dropdown before Service Type is the one control */}
            {!hid('clearanceRequired') && <SwitchField label={lbl('clearanceRequired')} hint={SWITCH_HINTS.clearanceRequired} checked={!!c.clearanceRequired} onChange={(v) => setC({ clearanceRequired: v })} />}
            {!hid('splittable') && <SwitchField label="Can be delivered in parts" hint={SWITCH_HINTS.splittable} checked={!!c.splittable} onChange={(v) => setC({ splittable: v })} />}
          </div>
          {!hid('specialInstructions') && (
            <div className="mt-6 lg:pr-10">
              <F label={lbl('specialInstructions')} multiline value={c.specialInstructions ?? ''} placeholder="eg, lorem ipsum"
                onChange={(v) => setC({ specialInstructions: v })} />
            </div>
          )}
        </>
      ) : (
        <SGrid cols={3}>
          {merchantField}
          {orderNumberField}
          {consignmentTypeField}
          {serviceTypeField}
          {dedicatedFields}
          {shipByField}
          {/* Start / End Time share one cell and ARE the delivery window on the Ship By Date */}
          <div className="grid grid-cols-2 gap-4">
            <SFld label="Start Time" required error={!filled(timeOf(receiver.windowStart))}>
              <TimeBox value={timeOf(receiver.windowStart)} placeholder="Start Time" onChange={(v) => setWindowTime('windowStart', v)} />
            </SFld>
            <SFld label="End Time" required error={!filled(timeOf(receiver.windowEnd))}>
              <TimeBox value={timeOf(receiver.windowEnd)} placeholder="End Time" onChange={(v) => setWindowTime('windowEnd', v)} />
            </SFld>
          </div>
          {tagsField}
        </SGrid>
      )}
    </StagingCard>
  )

  const fromLocationCode = (
    <F label="Location Code" value={senderStore} onChange={pickSender}
      options={senderOptions} placeholder="eg, Williamstown" />
  )
  const saveSenderToggle = senderStore === OTHER_ADDRESS
    ? <SwitchField label="Save address" checked={saveSender} onChange={setSaveSender} />
    : undefined
  const toLocationCode = (d: Party, set: (p: Partial<Party>) => void) => (
    <F label="Location Code" value={d.locationCode ?? ''} options={toLocationOpts} placeholder="eg, Williamstown" onChange={pickToLocation(set)} />
  )

  /* Simplified: Ship From summary → Ship To contact, one untitled card; both edit in a modal */
  const [modal, setModal] = useState<null | { which: 'from' | 'to'; party: Party; store: string }>(null)
  const openModal = (which: 'from' | 'to') => setModal({ which, party: which === 'from' ? sender : receiver, store: senderStore })
  const cancelModal = () => {
    if (modal?.which === 'from') { setSender(modal.party); setSenderStore(modal.store) }
    if (modal?.which === 'to') setReceiver(modal.party)
    setModal(null)
  }
  /* typing over a Location Master address in the modal makes it a typed one */
  /* owner, 2026-09-25: a picked Location Code only PREFILLS — every field stays editable, and an
     edit keeps the code shown; the edited values are what is saved */
  const setSenderManual = (p: Partial<Party>) => setSender((x) => ({ ...x, ...p }))
  const setReceiverP = (p: Partial<Party>) => setReceiver((x) => ({ ...x, ...p }))
  const shipSimplified = (
    <StagingCard id="sec-ship">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_40px_minmax(0,1fr)]">
        <div className="min-w-0">
          <p className="text-[13px] text-ink">Ship From</p>
          <div className="mt-5 flex items-start gap-8 pl-4">
            <div className="min-w-0 text-[13px] text-ink-2">
              <p className="truncate">{sender.city || sender.name || <span className="text-ink-3">No pickup location yet</span>}</p>
              <p className="mt-1 flex items-center gap-2 truncate"><CircleUser size={14} className="shrink-0" /> {sender.contactNumber || '—'}</p>
            </div>
            <IconButton icon={<SquarePen size={14} />} title="Edit Ship From" onClick={() => openModal('from')} />
          </div>
          {!done(fromReq) && <p className="mt-2 pl-4 text-[12px] text-danger-fg">Ship From is incomplete — edit it.</p>}
          {vehicleField && <div className="mt-5 max-w-xs pl-4">{vehicleField}</div>}
        </div>
        <div className="hidden items-start justify-center pt-12 text-ink-2 lg:flex"><ArrowRight size={16} /></div>
        <div className="min-w-0">
          <div className="flex items-start justify-between gap-3">
            <p className="text-[13px] text-ink">Ship To</p>
            <AddMoreButton label="Add Manually" icon={false} onClick={() => openModal('to')} />
          </div>
          <div className="mt-1 flex items-end gap-4">
            <div className="w-60">{toLocationCode(receiver, setReceiverP)}</div>
            <IconButton icon={<MapPin size={14} />} title="Enter the address" onClick={() => openModal('to')} />
          </div>
          <div className="mt-3 grid grid-cols-1 gap-x-4 gap-y-10 sm:grid-cols-3">
            <F label="Full Name" required value={receiver.name} placeholder="Enter Full Name" error={err(!filled(receiver.name))}
              onChange={(v) => setReceiverP({ name: v })} />
            {!hid('addrEmail') && <F label="Email" type="email" value={receiver.email} placeholder="Enter Email" onChange={(v) => setReceiverP({ email: v })} />}
            <SFld label="Phone" required error={!filled(receiver.contactNumber)}>
              <PhoneInput code={receiver.countryCode ?? ''} number={receiver.contactNumber} codes={DIAL_CODES} placeholder="Enter phone number"
                invalid={!filled(receiver.contactNumber)}
                onCode={(v) => setReceiverP({ countryCode: v })} onNumber={(v) => setReceiverP({ contactNumber: v })} />
            </SFld>
          </div>
          {receiver.line1 && <p className="mt-3 truncate text-[12px] text-ink-3">{partyLine(receiver)}</p>}
          {!addressOk(receiver) && <p className="mt-2 text-[12px] text-danger-fg">Pick a Location Code or Add Manually to enter the address.</p>}
          {drops.length > 0 && <p className="mt-2 text-[12px] text-ink-3">+ {drops.length} more delivery address{drops.length === 1 ? '' : 'es'} — see the Regular form</p>}
        </div>
      </div>
      <AddressModal open={modal?.which === 'from'} title="Ship From" party={sender} set={setSenderManual} nameLabel="Sender Name"
        locationCode={fromLocationCode} hid={hid} onCancel={cancelModal} onConfirm={() => setModal(null)} />
      <AddressModal open={modal?.which === 'to'} title="Ship To" party={receiver} set={setReceiverP} nameLabel="Customer Name" requireContact
        locationCode={toLocationCode(receiver, setReceiverP)} hid={hid} onCancel={cancelModal} onConfirm={() => setModal(null)} />
    </StagingCard>
  )

  const shipFromSection = (
    <StagingCard id="sec-ship-from" title="Ship From" caption="Provide the pickup address and contact details for this order."
      action={saveSenderToggle}>
      <PartyFields party={sender} set={(p) => setSender((x) => ({ ...x, ...p }))} nameLabel="Sender Name" windowLabel="Pick Up"
        locationCode={fromLocationCode} hid={hid} trailing={vehicleField || undefined} />
    </StagingCard>
  )

  const rtoSection = (
    <StagingCard id="sec-rto" title="Return To Origin (RTO)" caption="Provide the return-to-origin address and contact details for this order.">
      <div className="flex flex-wrap gap-3" role="radiogroup">
        {RTO_MODES.map((m) => (
          <RadioCard key={m} label={m} checked={(c.rtoMode ?? RTO_MODES[0]) === m} onClick={() => setC({ rtoMode: m })} />
        ))}
      </div>
      {c.rtoMode === RTO_MODES[1] && (
        <div className="mt-6">
          <PartyFields party={rto} set={(p) => setRto((x) => ({ ...x, ...p }))} nameLabel="Sender Name" windowLabel={null} hid={hid}
            requireContact variant="rto"
            locationCode={<F label="Location Code" value={rto.locationCode ?? ''} placeholder="eg, Williamstown"
              options={pickup.options.filter((o) => o.value !== OTHER_ADDRESS)}
              onChange={(code) => {
                const st = stores.find((s) => s.code === code)
                setRto(st ? { ...st.party, locationCode: code } : (x) => ({ ...x, locationCode: code }))
              }} />} />
        </div>
      )}
    </StagingCard>
  )

  const shipToSection = (
    <StagingCard id="sec-ship-to" title="Ship To"
      caption="Provide the delivery address and contact details to ensures accurate delivery and proper communication with the recipient.">
      {allDrops.map((d, i) => {
        const set = i === 0 ? setReceiverP : (p: Partial<Party>) => setDrop(i - 1, p)
        return (
          <div key={i} className={i > 0 ? 'mt-8 border-t border-warm-200 pt-6' : ''}>
            {allDrops.length > 1 && (
              <div className="mb-4 flex items-center justify-between lg:pr-10">
                <span className="text-[13px] font-bold text-ink">Address {i + 1}</span>
                {i > 0 && (
                  <button type="button" aria-label={`Remove address ${i + 1}`} onClick={() => removeDrop(i - 1)}
                    className="text-ink-3 transition-colors hover:text-brand-500"><CircleMinus size={16} /></button>
                )}
              </div>
            )}
            <PartyFields party={d} set={set} nameLabel="Customer Name" windowLabel="Delivery" requireContact hid={hid}
              locationCode={toLocationCode(d, set)} />
          </div>
        )
      })}
      {/* multi-drop is a dedicated-truck booking: every address needs a vehicle */}
      {isFtl && (
        <div className="mt-6"><AddMoreButton label="Add delivery address" onClick={() => setDrops((ds) => [...ds, blankParty()])} /></div>
      )}
    </StagingCard>
  )

  const packageTypeOpts = [...packageTypes.map((t) => ({ value: t.code, label: t.name })), { value: CUSTOM_PACKAGE, label: CUSTOM_PACKAGE_NAME }]
  const packageTypeTitle = packageTypes.length === 0 ? 'No presets in the Package master — enter dimensions'
    : !ownPresets ? `Showing all package types — none assigned to ${merchant?.name ?? 'this merchant'}` : undefined

  /* Simplified: Package & SKU — a table, a row per package, extra SKUs of a package below it */
  const PKG_COLS = 'grid grid-cols-[repeat(6,minmax(0,1fr))_minmax(150px,auto)] items-start gap-x-4'
  const packageSimplified = (
    <StagingCard id="sec-package" title="Package & SKU" caption="Provide the package and SKU details for this order.">
      <div className="overflow-x-auto">
        <div className="min-w-[860px]">
          <div className={`${PKG_COLS} border-b border-warm-200 pb-3 text-[13px] text-ink`}>
            {['Package ID', 'Package Type', 'Quantity', 'Tracking ID', 'SKU Code', 'SKU Name'].map((h) => (
              <span key={h} className="border-l border-warm-200 pl-4">{h}</span>
            ))}
            <span />
          </div>
          {parcels.map((p, i) => {
            const items = p.items?.length ? p.items : [undefined]
            return items.map((it, k) => (
              <div key={`${i}-${k}`} className={`${PKG_COLS} pt-5`}>
                {k === 0 ? <>
                  <ReadBox value={p.packageId ?? ''} />
                  <div title={packageTypeTitle}>
                    <MenuSelect value={packageValue(p, packageTypes)} options={packageTypeOpts.map((o) => o.value)}
                      labels={(v) => packageTypeOpts.find((o) => o.value === v)?.label ?? v} onChange={(v) => pickPackageType(i, v)} />
                  </div>
                  <div>
                    <NumBox value={p.quantity} min={1} integer blankZero placeholder="eg, 1" error={err(!(p.quantity > 0))} onChange={(n) => setParcel(i, { quantity: n })} />
                    {!(p.quantity > 0) && <p className="mt-1.5 pl-2 text-[12px] text-danger-fg">Required field.</p>}
                  </div>
                  <Input value={p.trackingNumber ?? ''} disabled={!!fromOverage && i === 0} onChange={(v) => setParcel(i, { trackingNumber: v })} />
                </> : <><span /><span /><span /><span /></>}
                <SkuCode item={it ?? blankItem()} skus={masters.skus} onPick={(s) => pickSku(i, k, s)}
                  onUnlink={() => setItem(i, k, { skuCode: null })} autoFocus={focusLine?.i === i && focusLine.k === k} />
                <Input value={it?.name ?? ''} placeholder="eg, Reserve" disabled={!!it?.skuCode} onChange={(v) => setItem(i, k, { name: v })} />
                <div className="flex items-center justify-end gap-2">
                  {k === 0 && <AddMoreButton label="Add more SKU" icon={false} onClick={() => addItem(i)} />}
                  <IconButton icon={<Trash2 size={14} />} title={k === 0 ? 'Remove package' : 'Remove SKU'}
                    onClick={() => (k === 0
                      ? setParcels((ps) => (ps.length > 1 ? ps.filter((_, j) => j !== i) : [newParcel()]))
                      : removeItem(i, k))} />
                </div>
              </div>
            ))
          })}
        </div>
      </div>
      <div className="mt-6">
        <AddMoreButton label="Add More Package" icon={false} onClick={() => { setFocusLine({ i: parcels.length, k: 0 }); setParcels((ps) => [...ps, newParcel()]) }} />
      </div>
    </StagingCard>
  )

  /* Regular: SKU — a row card per SKU line */
  const lineNo = (i: number, k: number) => skuLines.findIndex((l) => l.i === i && l.k === k) + 1
  const skuSection = (
    <StagingCard id="sec-sku" title="SKU"
      caption="Provide the SKU details for this order to ensures precise tracking, billing, and handling of items."
      action={<AddMoreButton onClick={() => addItem(parcels.length - 1)} />}>
      {skuLines.map(({ it, i, k }, n) => {
        const vol = (it.lengthCm ?? 0) * (it.widthCm ?? 0) * (it.heightCm ?? 0)
        return (
          <RowCard key={`${i}-${k}`} title={`SKU ${n + 1}`} onRemove={() => removeItem(i, k)}
            footer={<>
              <span>Total Weight ({(it.weightUom ?? 'KG').toLowerCase()}) <b className="ml-2 font-normal">{it.weightKg && it.quantity ? round2(it.weightKg * it.quantity) : '-'}</b></span>
              <span>Total Volume ({(it.dimUom ?? 'CM').toLowerCase()}³) <b className="ml-2 font-normal">{vol && it.quantity ? round2(vol * it.quantity) : '-'}</b></span>
              <span>Total Cost ({CURRENCY}) <b className="ml-2 font-normal">{it.unitCost && it.quantity ? money(it.unitCost * it.quantity, CURRENCY) : '-'}</b></span>
            </>}>
            <SGrid>
              {!hid('skuCategory') && <F label="SKU Category" value={it.category ?? ''} options={opts([...new Set([...masters.skus.map((s) => s.category).filter(Boolean), ...(it.category ? [it.category] : [])])])}
                onChange={(v) => setItem(i, k, { category: v })} />}
              <F label="Line Item no" required value={String(lineNo(i, k))} disabled onChange={() => undefined} />
              <SFld label="Code" required error={!it.skuCode}>
                <SkuCode item={it} skus={masters.skus} onPick={(s) => pickSku(i, k, s)} onUnlink={() => setItem(i, k, { skuCode: null })}
                  autoFocus={focusLine?.i === i && focusLine.k === k} />
              </SFld>
              <F label="Name" required value={it.name} placeholder="eg, Reserve" disabled={!!it.skuCode}
                error={err(!filled(it.name))} onChange={(v) => setItem(i, k, { name: v })} />
              {!hid('skuDescription') && <F label="Description" value={it.description ?? ''} placeholder="eg, Water Bottle" onChange={(v) => setItem(i, k, { description: v })} />}
              {/* owner, 2026-09-25: filled from the SKU master on pick, editable after; optional */}
              <F label="HSN Code" value={it.hsnCode ?? ''} placeholder="eg, 851713" onChange={(v) => setItem(i, k, { hsnCode: v })} />
              <F label="Origin Country" value={it.originCountry ?? ''} placeholder="eg, Philippines" searchable
                options={opts([...new Set([...COUNTRIES, ...(it.originCountry ? [it.originCountry] : [])])])}
                onChange={(v) => setItem(i, k, { originCountry: v })} />
              {!hid('skuImage') && <F label="Image Url" value={it.imageUrl ?? ''} onChange={(v) => setItem(i, k, { imageUrl: v })} />}
            </SGrid>
            <SGrid cols={7} className="mt-6">
              <F label="unit of measure" required value={it.dimUom ?? 'CM'} options={DIM_UOMS.map((u) => ({ value: u, label: u.toLowerCase() }))} onChange={(v) => setItem(i, k, { dimUom: v })} />
              <F label="Weight unit of measure" required value={it.weightUom ?? 'KG'} options={WEIGHT_UOMS.map((u) => ({ value: u, label: u.toLowerCase() }))} onChange={(v) => setItem(i, k, { weightUom: v })} />
              <FNum label="Quantity" required integer blankZero placeholder="eg, 1" value={it.quantity} error={err(it.quantity < 1)} onChange={(n) => setItem(i, k, { quantity: n })} />
              {!hid('skuUnitCost') && <FNum label="Unit Cost" blankZero placeholder="eg, 12.34" value={it.unitCost ?? 0} onChange={(n) => setItem(i, k, { unitCost: n })} />}
              <FNum label="Weight" required blankZero placeholder="eg, 10" value={it.weightKg} error={err(!(it.weightKg > 0))} onChange={(n) => setItem(i, k, { weightKg: n })} />
              <FNum label="Length" required blankZero placeholder="eg, 10" value={it.lengthCm ?? 0} error={err(!((it.lengthCm ?? 0) > 0))} onChange={(n) => setItem(i, k, { lengthCm: n })} />
              <FNum label="Width" required blankZero placeholder="eg, 10" value={it.widthCm ?? 0} error={err(!((it.widthCm ?? 0) > 0))} onChange={(n) => setItem(i, k, { widthCm: n })} />
              <FNum label="Height" required blankZero placeholder="eg, 10" value={it.heightCm ?? 0} error={err(!((it.heightCm ?? 0) > 0))} onChange={(n) => setItem(i, k, { heightCm: n })} />
              <SFld label="Volume"><ReadBox value={vol ? String(round2(vol)) : ''} /></SFld>
            </SGrid>
          </RowCard>
        )
      })}
    </StagingCard>
  )

  /* Regular: Piece — a row card per package */
  const pieceSection = (
    <StagingCard id="sec-piece" title="Package"
      caption="Provide the package details for this order to ensure precise tracking, billing, and handling of items."
      action={<AddMoreButton onClick={() => setParcels((ps) => [...ps, newParcel()])} />}>
      {parcels.map((p, i) => {
        const vol = p.l * p.w * p.h
        const first = skuLines.find((l) => l.i === i)
        return (
          <RowCard key={i} title={`Package ${i + 1}`} onRemove={parcels.length > 1 ? () => setParcels((ps) => ps.filter((_, j) => j !== i)) : undefined}
            footer={<>
              <span>Total Weight (kg) <b className="ml-2 font-normal">{p.weight ? round2(p.weight * p.quantity) : '-'}</b></span>
              <span>Total Volume (cm³) <b className="ml-2 font-normal">{vol ? round2(vol * p.quantity) : '-'}</b></span>
            </>}>
            <SGrid>
              {/* picking a SKU line moves that line into this piece */}
              <F label="Sku Line Item No" value={first ? `${first.i}:${first.k}` : ''}
                options={skuLines.map((l) => ({ value: `${l.i}:${l.k}`, label: `${lineNo(l.i, l.k)} · ${l.it.skuCode ?? (l.it.name || 'SKU')}` }))}
                onChange={(v) => { const [fi, fk] = v.split(':').map(Number); moveItem(fi, fk, i) }} />
              <F label="Package Id" value={p.packageId ?? ''} onChange={(v) => setParcel(i, { packageId: v })} />
              {!hid('pkgTracking') && (
                <F label="Tracking Number" value={p.trackingNumber ?? ''} disabled={!!fromOverage && i === 0}
                  helper={fromOverage && i === 0 ? 'The overage scan barcode' : undefined} onChange={(v) => setParcel(i, { trackingNumber: v })} />
              )}
              <div title={packageTypeTitle}>
                <F label="Type" required value={packageValue(p, packageTypes)} options={packageTypeOpts} onChange={(v) => pickPackageType(i, v)} />
              </div>
            </SGrid>
            <div className="mt-6 grid grid-cols-2 gap-x-8 gap-y-10 lg:grid-cols-[minmax(0,1.6fr)_repeat(4,minmax(0,1fr))] lg:pr-10">
              {!hid('pkgDescription') ? <F label="Description" value={p.description ?? ''} onChange={(v) => setParcel(i, { description: v })} /> : <span />}
              <FNum label="Quantity" required integer min={1} blankZero placeholder="eg, 1" value={p.quantity} error={err(!(p.quantity > 0))} onChange={(n) => setParcel(i, { quantity: n })} />
              {!hid('pkgWeight') && (
                <FNum label="Weight (kg)" required placeholder="eg, 10" blankZero value={p.weight} error={err(!(p.weight > 0))}
                  helper={p.weightMode === 'manual' ? undefined : 'Package tare + SKUs'}
                  onChange={(n) => setParcel(i, { weight: n, weightMode: 'manual' })} />
              )}
              <SFld label="Volume (cm³)"><ReadBox value={vol ? String(round2(vol)) : ''} /></SFld>
              {!hid('pkgPalletSpace') && <F label="Pallet Space" value={p.palletSpace ?? ''} placeholder="eg, 10" onChange={(v) => setParcel(i, { palletSpace: v })} />}
            </div>
          </RowCard>
        )
      })}
    </StagingCard>
  )

  const addressLabels = addressOptions.map((o) => o.label)
  const vehicleSection = (
    <StagingCard id="sec-vehicle" title="Vehicle Details"
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
              <button type="button" aria-label={`Remove vehicle row ${i + 1}`} disabled={rows.length === 1} onClick={() => removeVehicle(i)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-ink-3 hover:bg-warm-100 hover:text-ink disabled:cursor-not-allowed disabled:opacity-40">
                <X size={14} />
              </button>
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
        <span> · extras such as a tail-lift are Value Added Services</span>
      </p>
    </StagingCard>
  )

  const vasSection = (
    <StagingCard id="sec-vas" title="Value Added Services"
      caption="Provide the value-added services for this order to ensure that the job is assigned with the right capabilities and resources."
      action={<AddMoreButton onClick={() => setC({ vas: [...(c.vas ?? []), isFtl ? { ...newVas(), level: 'CONSIGNMENT' } : newVas()] })} />}>
      {(c.vas ?? []).map((v, i) => (
        <RowCard key={i} title="VAS" onRemove={() => setC({ vas: (c.vas ?? []).filter((_, j) => j !== i) })}>
          <SGrid cols={5}>
            <F label="VAS added level" required value={v.level} options={opts(VAS_LEVELS)}
              onChange={(x) => setVas(i, { level: x as VasLine['level'], ...(x === 'SKU' ? {} : { skuCode: '' }) })} />
            {v.level === 'SKU'
              ? <F label="Sku Line Item No" required value={v.skuCode} placeholder={skuLineOpts.length ? 'Select' : 'Add a SKU first'}
                  options={skuLineOpts} error={err(!v.skuCode)} onChange={(x) => setVas(i, { skuCode: x })} />
              : <SFld label="Sku Line Item No"><ReadBox value={v.level === 'PACKAGE' ? 'Every package' : 'This order'} /></SFld>}
            <F label="Service" required value={v.service} options={VAS_OPTS} error={err(!v.service)} onChange={(x) => setVas(i, { service: x })} />
            <FNum label="Service Time" required integer value={v.serviceTimeMin} onChange={(n) => setVas(i, { serviceTimeMin: n })} />
            <F label="Remark" value={v.remark} placeholder="eg, 10" onChange={(x) => setVas(i, { remark: x })} />
          </SGrid>
        </RowCard>
      ))}
    </StagingCard>
  )

  /* Order Category — console only: six switches on one line, as staging's card */
  const categories = c.category ?? []
  const toggleCategory = (name: string, on: boolean) =>
    setC({ category: on ? [...categories.filter((x) => x !== name), name] : categories.filter((x) => x !== name) })
  const categorySection = (
    <StagingCard id="sec-category" title="Order Category">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        {ORDER_CATEGORIES.map((name) => (
          <SwitchField key={name} label={name} checked={categories.includes(name)} onChange={(v) => toggleCategory(name, v)} />
        ))}
      </div>
    </StagingCard>
  )

  const carrierSection = (
    <StagingCard id="sec-carriers" title="Carriers" count={CARRIERS.length}>
      <div className="rounded-lg bg-warm-50 p-6 lg:mr-10">
        <div className="flex flex-wrap gap-4" role="radiogroup">
          {CARRIERS.map((k) => (
            <RadioCard key={k.code} label={k.code} sub={k.sub} filled={false} checked={c.carrier === k.code} onClick={() => setC({ carrier: k.code })} />
          ))}
        </div>
        {!c.carrier && <p className="mt-3 text-[12px] text-danger-fg">Required field.</p>}
      </div>
    </StagingCard>
  )

  const byId: Record<string, ReactNode> = {
    'sec-consignment': orderSection, 'sec-ship': shipSimplified, 'sec-ship-from': shipFromSection,
    'sec-rto': rtoSection, 'sec-ship-to': shipToSection, 'sec-package': packageSimplified, 'sec-sku': skuSection,
    'sec-piece': pieceSection, 'sec-vehicle': vehicleSection, 'sec-vas': vasSection, 'sec-category': categorySection, 'sec-carriers': carrierSection,
  }

  return (
    <div className="pb-2">
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

      {/* staging: a column of full-width cards — no summary rail, no progress bar, no section nav */}
      <div className="grid min-w-0 gap-7">
        {sections.map((id) => <div key={id} className="min-w-0">{byId[id]}</div>)}
      </div>

      {/* sticky footer — tier switch left; Go Back + Add Order right (disabled until every required field is filled) */}
      <div className="sticky bottom-0 z-30 mt-7 flex flex-wrap items-center gap-3 rounded-xl border border-warm-200 bg-surface px-6 py-3 shadow-ds-1">
        <Button variant="outline" onClick={() => setFormMode(full ? 'simplified' : 'full')}>
          {full ? 'Switch to Simplified' : 'Switch to Regular Add Form'}
        </Button>
        <span className="ml-auto" />
        {!canSubmit && (
          <span className="text-[12px] text-ink-3">{missingCount} required field{missingCount === 1 ? '' : 's'} remaining</span>
        )}
        <Button variant="ghost" onClick={() => { clearDraftKeys(); nav(backTo) }}>Go Back</Button>
        <Button onClick={proceed} disabled={!canSubmit}>Add Order</Button>
      </div>
    </div>
  )
}
