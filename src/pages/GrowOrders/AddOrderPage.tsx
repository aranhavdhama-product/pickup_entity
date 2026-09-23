/**
 * Create Consignment — the Grow merchant portal's add form.
 *
 * THE SAME FORM as staging's Add form / the console's Add Consignment page
 * (pages/ConsignmentAdd), drawn in Grow's theme. Layout, section order,
 * labels, captions and required marks follow the live staging captures in
 * docs/superpowers/research/staging-add-form/ (01–02 Simplified, 10–14 Regular):
 * one white card per section (bold title + muted caption), a 4-column grid of
 * fields with the label ABOVE the input and the asterisk after it, 40px inputs
 * on a light fill, toggles inline with their labels, date + time as two
 * adjacent pills, and a sticky footer (tier switch left, Go Back / Create
 * Consignment right). The inputs are ui.tsx's; only the label wrapper is local.
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
import { useEffect, useMemo, useState, type ComponentProps, type KeyboardEvent, type ReactNode } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowRight, CheckCircle2, ChevronDown, CirclePlus, Copy, MapPin, Package, Pencil, ScanBarcode, Search, ShieldPlus, Trash2, Truck, User, X } from 'lucide-react'
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
  Btn, Checkbox, Chip, FOCUS_RING, IconBtn, Menu, MultiSelect, OutlinedField, RadioPill, Switch,
  TABLE_HEAD_ROW, TABLE_TH,
} from './ui'
import { money, OTHER_ADDRESS, partyLine, partyOk, prWindow, storeOptionLabel, useOutside } from './utils'
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

function useAutocomplete<T>(hits: T[], onPick: (x: T) => void) {
  const [open, setOpen] = useState(false)
  const [hi, setHi] = useState(0)
  const ref = useOutside(() => setOpen(false))
  const active = hits.length ? Math.min(hi, hits.length - 1) : 0
  const pick = (x: T) => { onPick(x); setOpen(false) }
  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key === 'Escape') { setOpen(false); return }
    if (!open) { if (e.key === 'ArrowDown') setOpen(true); return }
    if (e.key === 'ArrowDown') { e.preventDefault(); setHi(Math.min(hits.length - 1, active + 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHi(Math.max(0, active - 1)) }
    else if (e.key === 'Enter' && hits[active]) { e.preventDefault(); pick(hits[active]) }
  }
  return { open, setOpen, hi: active, setHi, ref, onKeyDown, pick }
}
const MENU_CLASS = 'max-h-[320px] overflow-y-auto'
function AcRow({ on, onPick, onHover, children }: { on: boolean; onPick: () => void; onHover: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onPick} onMouseEnter={onHover}
      className={`flex w-full items-center gap-3 px-3 text-left transition-colors ${FOCUS_RING}
        ${on ? 'bg-grow-accent-2/10' : 'hover:bg-grow-ink/[0.03]'}`}>
      {children}
    </button>
  )
}

/* ------------------------------------------------------------ form chrome ---- */

/**
 * The light input fill staging uses, applied to ui.tsx's 40px outlined box
 * (its first child — the bordered div of a text field, the button of a
 * select / multi-select). The box keeps its own coral focus border.
 */
const FILL = '[&>:first-child]:!bg-grow-canvas'
/** a multiline box grows with its rows instead of the fixed 40px */
const AUTO_H = '[&>:first-child]:!h-auto'

/** Staging's field anatomy: the label ABOVE the input, the coral asterisk after it. */
function Field({ label, required, className = '', children }: { label: ReactNode; required?: boolean; className?: string; children: ReactNode }) {
  return (
    <div className={`min-w-0 ${className}`}>
      <p className="mb-1.5 flex min-h-[18px] items-center gap-0.5 text-[13px] leading-tight text-grow-ink">
        <span className="truncate">{label}</span>{required && <span className="shrink-0 text-grow-accent-2">*</span>}
      </p>
      {children}
    </div>
  )
}

type OFProps = ComponentProps<typeof OutlinedField>
/** Field + a ui.tsx OutlinedField (text, select or date/time) at 40px on the fill — never a floating label. */
function F({ label, required, className = '', ...p }: OFProps) {
  return (
    <Field label={label ?? ''} required={required} className={className}>
      <OutlinedField size="sm" {...p} className={`${FILL} ${p.multiline ? AUTO_H : ''}`} />
    </Field>
  )
}

const SPINNERLESS = `[&_input]:[appearance:textfield] [&_input::-webkit-inner-spin-button]:appearance-none
  [&_input::-webkit-outer-spin-button]:appearance-none`

/** A number in the one field shape; the typed text is held locally so '0.' stays typeable. */
function NumBox({ value, onChange, unit, integer, min = 0, className = '', helper, variant, blankZero, error, disabled, placeholder }: {
  value: number; onChange: (n: number) => void; unit?: string
  integer?: boolean; min?: number; className?: string; helper?: string
  variant?: 'outlined' | 'ghost'; blankZero?: boolean; error?: string; disabled?: boolean; placeholder?: string
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
    <OutlinedField size="sm" type="number" value={text} onChange={commit} variant={variant} placeholder={placeholder}
      helper={helper} error={error} disabled={disabled}
      endAdornment={unit ? <span className="text-[13px]">{unit}</span> : undefined} className={`${SPINNERLESS} ${variant === 'ghost' ? '' : FILL} ${className}`} />
  )
}
function FNum({ label, required, className = '', ...p }: ComponentProps<typeof NumBox> & { label: string; required?: boolean }) {
  return <Field label={label} required={required} className={className}><NumBox {...p} /></Field>
}

/** Date + time as two adjacent pills under one label, over one 'YYYY-MM-DDTHH:mm' value. */
function DateTimePills({ label, required, value, onChange, error, className = '' }: {
  label: string; required?: boolean; value: string; onChange: (v: string) => void; error?: string; className?: string
}) {
  const d = dateOf(value), t = timeOf(value)
  return (
    <Field label={label} required={required} className={className}>
      <div className="grid grid-cols-2 gap-3">
        <OutlinedField size="sm" type="date" value={d} error={error} className={FILL}
          onChange={(v) => onChange(v ? `${v}T${t || '00:00'}` : '')} />
        <OutlinedField size="sm" type="time" value={t} className={FILL}
          onChange={(v) => onChange(v ? `${d || today()}T${v}` : d ? `${d}T00:00` : '')} />
      </div>
    </Field>
  )
}

/**
 * One white card per section, as staging draws them: bold title (+ count), a
 * green check once every required field is in, else the `Incomplete` chip,
 * the muted caption, and the card's own action top-right ("Add More"). NOT
 * `overflow-hidden` — listboxes and the SKU autocomplete pop out of it.
 */
function Section({ id, title, caption, done, count, action, children }: {
  id: string; title: ReactNode; caption?: string; done: boolean; count?: number; action?: ReactNode; children?: ReactNode
}) {
  return (
    <section id={id} className="scroll-mt-4 rounded-[6px] border border-grow-line bg-white px-6 py-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="flex flex-wrap items-center gap-2 text-[17px] font-semibold leading-[1.3] text-grow-ink">
            {title}
            {count !== undefined && <span className="text-[15px] font-normal text-grow-ink-2">{count}</span>}
            {done ? <CheckCircle2 size={17} className="text-grow-success" aria-label="Complete" /> : <Chip tone="warning">Incomplete</Chip>}
          </h2>
          {caption && <p className="mt-1 text-[13px] text-grow-ink-2">{caption}</p>}
        </div>
        {action}
      </div>
      {children && <div className="mt-5">{children}</div>}
    </section>
  )
}

/** "Add More" — the outlined action staging puts top-right of the SKU / Piece / VAS cards. */
function AddMore({ onClick, label = 'Add More' }: { onClick: () => void; label?: string }) {
  return <Btn variant="outlined" color="accent2" size="sm" startIcon={<CirclePlus size={15} />} onClick={onClick}>{label}</Btn>
}

/** The one 4-column labelled field grid every section shares. */
function Grid({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`grid grid-cols-2 gap-x-6 gap-y-5 lg:grid-cols-4 ${className}`}>{children}</div>
}

/** A declaration: the kit's Checkbox plus a 15px label and an optional 13px sub-line. */
function Tick({ checked, onChange, children, sub }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode; sub?: ReactNode }) {
  return (
    <div className="flex items-start gap-1">
      <span className="-ml-2 shrink-0"><Checkbox checked={checked} onChange={onChange} ariaLabel={typeof children === 'string' ? children : undefined} /></span>
      <span className="pt-[9px]">
        <span className="block text-[15px] leading-snug text-grow-ink">{children}</span>
        {sub && <span className="mt-0.5 block text-[13px] leading-snug text-grow-ink-2">{sub}</span>}
      </span>
    </div>
  )
}

/** A staging toggle: the label, then the switch, on one line. */
function Flag({ label, checked, onChange, disabled }: { label: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <div className={`flex items-center justify-between gap-2 ${disabled ? 'pointer-events-none opacity-50' : ''}`}>
      <span className="text-[13px] leading-tight text-grow-ink">{label}</span>
      <Switch checked={checked} onChange={onChange} />
    </div>
  )
}

/** Contact Number: the dialling-code picker (a Menu, never a native select) then the number, in one box. */
function PhoneField({ label, required, code, number, onCode, onNumber, disabled, error }: {
  label: string; required?: boolean; code: string; number: string
  onCode: (v: string) => void; onNumber: (v: string) => void; disabled?: boolean; error?: string
}) {
  const [open, setOpen] = useState(false)
  const ref = useOutside(() => setOpen(false))
  return (
    <Field label={label} required={required}>
      <div ref={ref} className="relative">
        <OutlinedField size="sm" value={number} disabled={disabled} error={error} placeholder="eg, 1234567890" className={FILL}
          onChange={(v) => onNumber(v.replace(/[^\d ]/g, ''))}
          startAdornment={
            <button type="button" disabled={disabled} onClick={() => setOpen((v) => !v)} aria-label="Country Code"
              className={`-ml-1 flex items-center gap-0.5 border-r border-grow-line pr-2 text-[13px] text-grow-ink ${FOCUS_RING}`}>
              {code || '+63'}<ChevronDown size={14} className="!h-[14px] !w-[14px]" />
            </button>
          } />
        {open && (
          <Menu width="w-[120px]" onClose={() => setOpen(false)}>
            {DIAL_CODES.map((d) => (
              <button key={d} type="button" onClick={() => { onCode(d); setOpen(false) }}
                className={`flex h-[36px] w-full items-center px-4 text-left text-[15px] transition-colors hover:bg-grow-ink/5 ${d === (code || '+63') ? 'text-grow-accent-2' : 'text-grow-ink'}`}>{d}</button>
            ))}
          </Menu>
        )}
      </div>
    </Field>
  )
}

/* ------------------------------------------------------------ address block ---- */

/**
 * Staging's Regular address block, in its order:
 *   Location Code · Company Name · {Sender|Customer} Name* · Contact Number
 *   Email · Address Line 1* · Address Line 2 · Address Line 3
 *   Landmark · Country* · Postal Code · Suburb / County
 *   City* · State* · Latitude · Longitude
 *   {Pick Up|Delivery} Start Time · End Time (date + time pills)
 *   Floor Number · Lift Available
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
    <Grid>
      {locationCode}
      {!hid('addrCompanyName') && text('businessName', 'Company Name', { placeholder: 'eg, Random Company' })}
      {text('name', nameLabel, { required: true, placeholder: 'eg, John Doe' })}
      <PhoneField label="Contact Number" required={requireContact} code={party.countryCode ?? ''} number={party.contactNumber}
        disabled={locked} error={err(party.contactNumber, !!requireContact)}
        onCode={(v) => set({ countryCode: v })} onNumber={(v) => set({ contactNumber: v })} />
      {!hid('addrEmail') && text('email', 'Email', { type: 'email', placeholder: 'eg, johndoe@xyz.com' })}
      {text('line1', 'Address Line 1', { required: true, placeholder: 'eg, Building No.' })}
      {!hid('addrLines23') && <>{text('line2', 'Address Line 2', { placeholder: 'eg, Street 1 A' })}{text('line3', 'Address Line 3', { placeholder: 'eg, Behind High School' })}</>}
      {!hid('addrLandmark') && text('landmark', 'Landmark', { placeholder: 'eg, Behind High School' })}
      <F label="Country" required value={party.country} disabled={locked} error={err(party.country)}
        options={opts(COUNTRIES)} placeholder=" " onChange={(v) => set({ country: v })} />
      <F label="Postal Code" value={party.postalCode} disabled={locked}
        options={opts(POSTCODES)} placeholder=" " onChange={(v) => set({ postalCode: v })} />
      {!hid('addrSuburb') && text('county', 'Suburb / County')}
      {text('city', 'City', { required: true })}
      <F label="State" required value={party.state} disabled={locked} error={err(party.state)}
        options={opts(STATES)} placeholder=" " onChange={(v) => set({ state: v })} />
      {!hid('addrCoordinates') && <>{text('latitude', 'Latitude', { type: 'number' })}{text('longitude', 'Longitude', { type: 'number' })}</>}
      {windowLabel && !hid('addrWindow') && <>
        <DateTimePills className="col-span-2" label={`${windowLabel} Start Time`} value={party.windowStart ?? ''} onChange={(v) => set({ windowStart: v })} />
        <DateTimePills className="col-span-2" label={`${windowLabel} End Time`} value={party.windowEnd ?? ''} onChange={(v) => set({ windowEnd: v })} />
      </>}
      {floorLift && !hid('addrFloorLift') && <>
        {text('floorNumber', 'Floor Number')}
        <div className="flex items-end pb-2"><Flag label="Lift Available" checked={!!party.liftAvailable} onChange={(v) => set({ liftAvailable: v })} /></div>
      </>}
    </Grid>
  )
}

/** Ship To's address book — Location Master delivery rows, then past recipients. */
function AddressBookSearch({ book, onPick }: { book: BookEntry[]; onPick: (p: Party) => void }) {
  const [q, setQ] = useState('')
  const hits = useMemo(() => book
    .filter((b) => !q || [b.party.name, b.party.contactNumber, b.party.businessName, partyLine(b.party)]
      .join(' ').toLowerCase().includes(q.toLowerCase()))
    .slice(0, 8), [book, q])
  const { open, setOpen, hi, setHi, ref, onKeyDown, pick } = useAutocomplete<BookEntry>(hits, (b) => { onPick({ ...b.party }); setQ('') })
  return (
    <div ref={ref} className="relative" onFocus={() => setOpen(true)} onKeyDown={onKeyDown} role="presentation">
      <OutlinedField size="sm" className={FILL} value={q} onChange={(v) => { setQ(v); setHi(0); setOpen(true) }}
        placeholder="Search from address book by name, number, address and company name..."
        startAdornment={<Search />} endAdornment={q ? <button type="button" onClick={() => setQ('')}><X /></button> : undefined} />
      {open && (
        <Menu width="w-full" className={MENU_CLASS} onClose={() => setOpen(false)}>
          {hits.map((b, i) => (
            <AcRow key={i} on={i === hi} onHover={() => setHi(i)} onPick={() => pick(b)}>
              <span className="min-w-0 flex-1 py-2">
                <span className="flex items-center gap-2">
                  <span className="min-w-0 truncate text-[15px] leading-tight text-grow-ink">
                    {b.party.name}{b.party.businessName ? ` · ${b.party.businessName}` : ''}
                  </span>
                  {b.tag && <Chip tone="neutral">{b.tag}</Chip>}
                </span>
                <span className="block truncate text-[12px] leading-tight text-grow-ink-2">{partyLine(b.party)}</span>
              </span>
            </AcRow>
          ))}
          {hits.length === 0 && (
            <p className="px-3 py-3 text-[13px] text-grow-ink-3">
              {q ? `No address matches “${q}”` : 'No saved addresses yet — fill in the fields below'}
            </p>
          )}
        </Menu>
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
function SkuCode({ item, skus, onPick, onUnlink, autoFocus, variant }: {
  item: ParcelItem; skus: SkuItem[]; onPick: (s: SkuItem) => void; onUnlink: () => void; autoFocus?: boolean; variant?: 'ghost'
}) {
  const [q, setQ] = useState('')
  const all = useMemo(() => skus.filter((s) => s.enabled).slice().sort((a, b) => a.code.localeCompare(b.code)), [skus])
  const needle = q.trim().toLowerCase()
  const matches = useMemo(() => (needle ? all.filter((s) => `${s.code} ${s.name} ${s.category}`.toLowerCase().includes(needle)) : all), [all, needle])
  const hits = useMemo(() => matches.slice(0, 8), [matches])
  const { open, setOpen, hi, setHi, ref, onKeyDown, pick } = useAutocomplete<SkuItem>(hits, (s) => { onPick(s); setQ('') })
  const more = matches.length - hits.length
  useEffect(() => { if (autoFocus) ref.current?.querySelector('input')?.focus() }, [autoFocus, ref])
  if (item.skuCode) {
    return (
      <span className={`flex h-[40px] items-center gap-1 rounded-[6px] px-[14px] text-[13px] text-grow-ink ${variant ? '' : 'border border-grow-outline bg-grow-canvas'}`}>
        <span className="min-w-0 flex-1 truncate">{item.skuCode}</span>
        <button type="button" aria-label="Unlink SKU" title="Unlink from the SKU master" onClick={onUnlink}
          className="shrink-0 text-grow-ink-3 hover:text-grow-ink"><X size={14} /></button>
      </span>
    )
  }
  return (
    <div ref={ref} className="relative" onFocus={() => setOpen(true)} onKeyDown={onKeyDown}>
      <OutlinedField size="sm" variant={variant} className={variant ? '' : FILL} value={q}
        onChange={(v) => { setQ(v); setHi(0); setOpen(true) }} placeholder="Search SKU" />
      {open && hits.length > 0 && (
        <Menu width="w-[460px]" className={MENU_CLASS} onClose={() => setOpen(false)}>
          {hits.map((s, i) => (
            <AcRow key={s.code} on={i === hi} onHover={() => setHi(i)} onPick={() => pick(s)}>
              <span className="flex h-[36px] w-[36px] shrink-0 items-center justify-center rounded-[6px] bg-grow-canvas text-grow-ink-2"><Package size={18} /></span>
              <span className="min-w-0 flex-1 py-2">
                <span className="block truncate text-[15px] leading-tight text-grow-ink">{s.code} · {s.name}</span>
                <span className="block truncate text-[12px] leading-tight text-grow-ink-2">
                  {s.category || 'Uncategorised'}{s.hsnCode && <> · HSN {s.hsnCode}</>}{s.originCountry && <> · {s.originCountry}</>}
                </span>
              </span>
              <span className="shrink-0 text-[13px] text-grow-ink-2">{s.weightKg} kg</span>
            </AcRow>
          ))}
          {more > 0 && <p className="px-3 pt-1 text-[12px] text-grow-ink-3">{more} more — keep typing</p>}
        </Menu>
      )}
    </div>
  )
}

function RemoveCell({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <td className="px-1 align-middle">
      <button type="button" aria-label={label} onClick={onClick}
        className={`flex h-7 w-7 items-center justify-center rounded-full text-grow-ink-2 opacity-60 transition-opacity hover:bg-grow-ink/5 hover:text-grow-error group-hover:opacity-100 ${FOCUS_RING}`}>
        <X size={16} />
      </button>
    </td>
  )
}

/** 12px uppercase column headers, required columns marked. */
function Head({ cols }: { cols: (string | [string, true])[] }) {
  return (
    <thead>
      <tr className={`${TABLE_HEAD_ROW} !h-[40px]`}>
        {cols.map((c, i) => {
          const [label, req] = Array.isArray(c) ? c : [c, false]
          return (
            <th key={i} className={`${TABLE_TH} !px-[14px] ${i === 0 ? 'rounded-l-[5px]' : ''} ${i === cols.length - 1 ? 'rounded-r-[5px]' : ''}`}>
              {label}{req && <span className="text-grow-accent-2"> *</span>}
            </th>
          )
        })}
      </tr>
    </thead>
  )
}

/* --------------------------------------------------------------- summary ---- */

function SummaryBlock({ title, children, onJump }: { title: string; children: ReactNode; onJump?: () => void }) {
  return (
    <div className="flex gap-3 border-b border-grow-line py-3">
      <div className="min-w-0 flex-1">
        <p className="text-[13px] text-grow-ink-2">{title}</p>
        <div className="text-[15px] leading-[1.5] text-grow-ink">{children}</div>
      </div>
      {onJump && <button type="button" onClick={onJump} className={`self-start text-[13px] text-grow-accent-2 hover:underline ${FOCUS_RING}`}>Edit</button>}
    </div>
  )
}

const jumpTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })

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
    <Field label={<>{lbl('tags')}</>}>
      <MultiSelect className={FILL} value={c.tags ?? []} options={opts(TAG_OPTIONS)} placeholder="eg, Ambient" onChange={(v) => setC({ tags: v })} />
    </Field>
  )

  const consignmentSection = (
    <Section id="sec-consignment" title="Consignment Details" done={doneOf['sec-consignment']}
      caption="Provide the consignment details to ensure accurate processing, routing, and billing of the shipment.">
      {full ? (
        <div className="space-y-5">
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
            <F label={lbl('consignmentType')} required value={c.consignmentType ?? 'Forward'} options={opts(CONSIGNMENT_TYPES)}
              onChange={(v) => setC({ consignmentType: v })} />
            <F label={lbl('shipByDate')} required type="date" value={c.shipByDate ?? ''} error={reqErr(filled(c.shipByDate))} onChange={setShipByDate} />
            {!hid('exchangeOrderNumber') && c.consignmentType === 'Exchange' && (
              <F label={lbl('exchangeOrderNumber')} value={c.exchangeOrderNumber ?? ''} placeholder="eg, ABC0000" onChange={(v) => setC({ exchangeOrderNumber: v })} />
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
              <F label={lbl('labelFormat')} value={c.labelFormat ?? ''} placeholder="eg, PDF" options={opts(LABEL_FORMATS)} onChange={(v) => setC({ labelFormat: v })} />
            )}
          </Grid>
          {/* the toggles, inline with their labels, then Total Loading Time — one row as staging */}
          <div className="grid grid-cols-2 items-end gap-x-6 gap-y-4 lg:grid-cols-5">
            {!hid('scannable') && <div className="pb-2"><Flag label={lbl('scannable')} checked={!!c.scannable} onChange={(v) => setC({ scannable: v })} /></div>}
            {!hid('schedulingConfirmation') && <div className="pb-2"><Flag label={lbl('schedulingConfirmation')} checked={!!c.schedulingConfirmation} onChange={(v) => setC({ schedulingConfirmation: v })} /></div>}
            {!hid('dedicateTruck') && <div className="pb-2"><Flag label={lbl('dedicateTruck')} checked={isFtl} onChange={setDedicateTruck} disabled={!!fromOverage} /></div>}
            {!hid('clearanceRequired') && <div className="pb-2"><Flag label={lbl('clearanceRequired')} checked={!!c.clearanceRequired} onChange={(v) => setC({ clearanceRequired: v })} /></div>}
            {!hid('totalLoadingTime') && (
              <FNum label={lbl('totalLoadingTime')} blankZero integer placeholder="minutes" value={c.totalLoadingTime ?? 0} disabled={!isFtl}
                onChange={(n) => setC({ totalLoadingTime: n || null })} />
            )}
          </div>
          {!hid('specialInstructions') && (
            <F label={lbl('specialInstructions')} multiline rows={3} value={c.specialInstructions ?? ''} onChange={(v) => setC({ specialInstructions: v })} />
          )}
          {!hid('deliveryInstructions') && (
            <F label={lbl('deliveryInstructions')} multiline rows={3} value={instructions}
              onChange={(v) => setInstructions(v.slice(0, 150))} helper={`Shared with the pickup and delivery driver · ${instructions.length}/150`} />
          )}
        </div>
      ) : (
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
          {/* Dedicate Truck in the Simplified tier too — FTL without switching tiers */}
          {!hid('dedicateTruck') && (
            <div className="flex items-end pb-2"><div className="w-full"><Flag label={lbl('dedicateTruck')} checked={isFtl} onChange={setDedicateTruck} disabled={!!fromOverage} /></div></div>
          )}
        </Grid>
      )}
    </Section>
  )

  const fromLocationCode = (
    <F label="Location Code" value={senderStore} onChange={pickSender}
      options={senderOptions} placeholder={senderStore ? undefined : 'eg, Williamstown'} />
  )

  /* Simplified: Ship From card → Ship To contact, one card, as staging draws it */
  const shipSimplified = (
    <Section id="sec-ship" title={<>Ship From <ArrowRight size={17} className="text-grow-ink-3" /> Ship To</>} done={doneOf['sec-ship']}
      caption="Where the consignment is collected from and where it is delivered.">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_32px_minmax(0,1.5fr)]">
        <div className="min-w-0">
          <p className="mb-1.5 text-[13px] text-grow-ink">Ship From</p>
          <div className="flex items-start gap-3 rounded-[6px] bg-grow-canvas px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] text-grow-ink">{sender.city || sender.name || <span className="text-grow-ink-3">No pickup location yet</span>}</p>
              <p className="mt-0.5 flex items-center gap-1.5 truncate text-[13px] text-grow-ink-2"><User size={14} className="shrink-0" /> {sender.contactNumber || sender.name || '—'}</p>
            </div>
            <IconBtn icon={<Pencil size={16} />} title="Edit Ship From" className="!h-8 !w-8 border border-grow-line bg-white [&>svg]:!h-4 [&>svg]:!w-4" onClick={() => setEditFrom((v) => !v)} />
          </div>
          {showErrors && !done(fromReq) && <p className="mx-[14px] mt-[3px] text-[12px] text-grow-error">Ship From is incomplete — edit it</p>}
        </div>
        <div className="hidden items-center justify-center pt-6 text-grow-ink-3 lg:flex"><ArrowRight size={20} /></div>
        <div className="min-w-0 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 flex-1 items-end gap-2">
              <F className="min-w-0 flex-1" label="Location Code" value={receiver.locationCode ?? ''} options={toLocationOpts}
                placeholder="eg, Williamstown" onChange={pickToLocation((p) => setReceiver((x) => ({ ...x, ...p })))} />
              <span className="flex h-[40px] w-[40px] shrink-0 items-center justify-center rounded-[6px] border border-grow-line text-grow-ink-2" title="Location from the Location Master"><MapPin size={17} /></span>
            </div>
            <Btn variant="outlined" color="accent2" size="sm" onClick={() => setManualTo((v) => !v)}>{manualTo ? 'Hide Address' : 'Add Manually'}</Btn>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-5 lg:grid-cols-3">
            <F label="Full Name" required value={receiver.name} placeholder="Enter Full Name" error={reqErr(filled(receiver.name))}
              onChange={(v) => setReceiver((x) => ({ ...x, name: v }))} />
            {!hid('addrEmail') && <F label="Email" type="email" value={receiver.email} placeholder="Enter Email" onChange={(v) => setReceiver((x) => ({ ...x, email: v }))} />}
            <PhoneField label="Phone" required code={receiver.countryCode ?? ''} number={receiver.contactNumber}
              error={reqErr(filled(receiver.contactNumber))}
              onCode={(v) => setReceiver((x) => ({ ...x, countryCode: v }))} onNumber={(v) => setReceiver((x) => ({ ...x, contactNumber: v }))} />
          </div>
          {!manualTo && receiver.line1 && <p className="truncate text-[13px] text-grow-ink-2">{partyLine(receiver)}</p>}
          {!manualTo && showErrors && !addressOk(receiver) && <p className="text-[12px] text-grow-error">Pick a Location Code or Add Manually</p>}
          {drops.length > 0 && <p className="text-[13px] text-grow-ink-2">+ {drops.length} more delivery address{drops.length === 1 ? '' : 'es'} — see the Regular form</p>}
        </div>
      </div>

      {editFrom && (
        <div className="mt-6 border-t border-grow-line pt-5">
          <div className="mb-4 flex items-center justify-between">
            <p className="text-[15px] font-semibold text-grow-ink">Ship From</p>
            {senderStore === OTHER_ADDRESS && <span className="flex items-center gap-1 text-[13px] text-grow-ink-2">Save: <Switch checked={saveSender} onChange={setSaveSender} /></span>}
          </div>
          <PartyFields party={sender} set={(p) => setSender((x) => ({ ...x, ...p }))} nameLabel="Sender Name" windowLabel={null}
            locked={fromList} locationCode={fromLocationCode}
            hid={(k) => hid(k) || ['addrCompanyName', 'addrLandmark', 'addrSuburb', 'addrCoordinates'].includes(k)}
            showErrors={showErrors} floorLift={false} />
        </div>
      )}
      {manualTo && (
        <div className="mt-6 space-y-5 border-t border-grow-line pt-5">
          <p className="text-[15px] font-semibold text-grow-ink">Ship To address</p>
          <AddressBookSearch book={receiverBook} onPick={(p) => setReceiver((x) => ({ ...x, ...p }))} />
          <Grid>
            <F label="Address Line 1" required value={receiver.line1} placeholder="eg, Building No." error={reqErr(filled(receiver.line1))}
              onChange={(v) => setReceiver((x) => ({ ...x, line1: v }))} />
            {!hid('addrLines23') && <>
              <F label="Address Line 2" value={receiver.line2} placeholder="eg, Street 1 A" onChange={(v) => setReceiver((x) => ({ ...x, line2: v }))} />
              <F label="Address Line 3" value={receiver.line3 ?? ''} placeholder="eg, Behind High School" onChange={(v) => setReceiver((x) => ({ ...x, line3: v }))} />
            </>}
            <F label="Country" required value={receiver.country} options={opts(COUNTRIES)} placeholder=" " error={reqErr(filled(receiver.country))}
              onChange={(v) => setReceiver((x) => ({ ...x, country: v }))} />
            <F label="Postal Code" value={receiver.postalCode} options={opts(POSTCODES)} placeholder=" "
              onChange={(v) => setReceiver((x) => ({ ...x, postalCode: v }))} />
            <F label="City" required value={receiver.city} error={reqErr(filled(receiver.city))}
              onChange={(v) => setReceiver((x) => ({ ...x, city: v }))} />
            <F label="State" required value={receiver.state} options={opts(STATES)} placeholder=" " error={reqErr(filled(receiver.state))}
              onChange={(v) => setReceiver((x) => ({ ...x, state: v }))} />
          </Grid>
        </div>
      )}
    </Section>
  )

  const shipFromSection = (
    <Section id="sec-ship-from" title="Ship From" done={doneOf['sec-ship-from']}
      caption="Provide the pickup address and contact details for this consignment."
      action={senderStore === OTHER_ADDRESS
        ? <span className="flex items-center gap-1 text-[13px] text-grow-ink-2">Save: <Switch checked={saveSender} onChange={setSaveSender} /></span>
        : undefined}>
      <PartyFields party={sender} set={(p) => setSender((x) => ({ ...x, ...p }))} nameLabel="Sender Name" windowLabel="Pick Up"
        locked={fromList} locationCode={fromLocationCode} hid={hid} showErrors={showErrors} />
    </Section>
  )

  const rtoSection = (
    <Section id="sec-rto" title="Return To Origin (RTO)" done={doneOf['sec-rto']}
      caption="Provide the return-to-origin address and contact details for this consignment.">
      <div className="flex flex-wrap gap-3">
        {RTO_MODES.map((m) => <RadioPill key={m} size="md" label={m} on={c.rtoMode === m} onClick={() => setC({ rtoMode: m })} />)}
      </div>
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
    </Section>
  )

  const shipToSection = (
    <Section id="sec-ship-to" title="Ship To" done={doneOf['sec-ship-to']}
      caption="Provide the delivery address and contact details to ensures accurate delivery and proper communication with the recipient.">
      {allDrops.map((d, i) => {
        const set = i === 0 ? (p: Partial<Party>) => setReceiver((x) => ({ ...x, ...p })) : (p: Partial<Party>) => setDrop(i - 1, p)
        return (
          <div key={i} className={i > 0 ? 'mt-6 border-t border-grow-line pt-5' : ''}>
            <div className="mb-5 flex items-center gap-3">
              {allDrops.length > 1 && <p className="shrink-0 text-[15px] font-semibold text-grow-ink">Address {i + 1}</p>}
              <div className="min-w-0 flex-1"><AddressBookSearch book={receiverBook} onPick={(p) => set(p)} /></div>
              {i > 0 && <IconBtn icon={<X size={18} />} title={`Remove address ${i + 1}`} onClick={() => removeDrop(i - 1)} />}
            </div>
            <PartyFields party={d} set={set} nameLabel="Customer Name" windowLabel="Delivery" requireContact hid={hid} showErrors={showErrors}
              locationCode={<F label="Location Code" value={d.locationCode ?? ''} options={toLocationOpts} placeholder="eg, Williamstown"
                onChange={pickToLocation(set)} />} />
          </div>
        )
      })}
      <div className="mt-5"><Btn variant="text" color="accent2" onClick={() => setDrops((ds) => [...ds, blankParty()])}>+ Add a delivery address</Btn></div>
    </Section>
  )

  const declarations = (
    <div className="mt-5 space-y-1 border-t border-grow-line pt-4">
      <Tick checked={secure} onChange={setSecure} sub="Insurance cover for the declared value of this shipment">
        <span className="inline-flex items-center gap-1.5">Secure your package <ShieldPlus size={16} className="fill-[#F2B84B] text-[#F2B84B]" /></span>
      </Tick>
      <Tick checked={noDg} onChange={setNoDg}>I declare that this shipment does not have Dangerous goods <span className="text-grow-accent-2">*</span></Tick>
      {showErrors && !noDg && <p className="ml-7 text-[12px] text-grow-error">Required field.</p>}
    </div>
  )

  const packageTypeOpts = [...packageTypes.map((t) => ({ value: t.code, label: t.name })), { value: CUSTOM_PACKAGE, label: CUSTOM_PACKAGE_NAME }]
  const packageTypeTitle = packageTypes.length === 0 ? 'No presets in the Package master — enter dimensions'
    : !ownPresets ? `Showing all package types — none assigned to ${merchant?.name ?? 'this merchant'}` : undefined

  /* Simplified: ONE Package & SKU table, a row per package carrying its SKU */
  const packageSimplified = (
    <Section id="sec-package" title="Package & SKU" done={doneOf['sec-package']}
      caption="Provide the package and SKU details for this consignment.">
      <table className="w-full table-fixed">
        <colgroup>
          <col className="w-[96px]" /><col className="w-[140px]" /><col className="w-[84px]" /><col className="w-[116px]" />
          <col className="w-[128px]" /><col /><col className="w-[92px]" /><col className="w-[124px]" /><col className="w-[36px]" />
        </colgroup>
        <Head cols={['Package ID', ['Package Type', true], ['Quantity', true], 'Tracking ID', 'SKU Code', 'SKU Name', 'HSN Code', 'Origin Country', '']} />
        <tbody>
          {parcels.map((p, i) => {
            const it = p.items?.[0]
            const bound = !!it?.skuCode
            return (
              <tr key={p.packageId ?? i} className="group h-[52px] border-t border-grow-line">
                <td className="truncate px-[14px] text-[13px] text-grow-ink-2" title={p.packageId}>{p.packageId}</td>
                <td className="px-1" title={packageTypeTitle}>
                  <OutlinedField size="sm" variant="ghost" label="Package Type" value={packageValue(p, packageTypes)} options={packageTypeOpts}
                    onChange={(v) => pickPackageType(i, v)} />
                </td>
                <td className="px-1"><NumBox variant="ghost" value={p.quantity} min={1} integer onChange={(n) => setParcel(i, { quantity: n })} /></td>
                <td className="px-1">
                  <OutlinedField size="sm" variant="ghost" label="Tracking ID" value={p.trackingNumber ?? ''} placeholder="Auto"
                    disabled={!!fromOverage && i === 0} onChange={(v) => setParcel(i, { trackingNumber: v })} />
                </td>
                {it ? <>
                  <td className="px-1"><SkuCode variant="ghost" item={it} skus={masters.skus} onPick={(s) => pickSku(i, 0, s)}
                    onUnlink={() => setItem(i, 0, { skuCode: null })} autoFocus={focusLine?.i === i && focusLine.k === 0} /></td>
                  <td className="px-1">{bound ? <span className="block truncate px-[14px] text-[13px] text-grow-ink">{it.name}</span>
                    : <OutlinedField size="sm" variant="ghost" label="SKU Name" value={it.name} placeholder="SKU Name" onChange={(v) => setItem(i, 0, { name: v })} />}</td>
                  <td className="px-1">{bound ? <span className="block truncate px-[14px] text-[13px] text-grow-ink-2">{it.hsnCode || '—'}</span>
                    : <OutlinedField size="sm" variant="ghost" label="HSN Code" value={it.hsnCode ?? ''} placeholder="HSN" onChange={(v) => setItem(i, 0, { hsnCode: v })} />}</td>
                  <td className="px-1">{bound ? <span className="block truncate px-[14px] text-[13px] text-grow-ink-2">{it.originCountry || '—'}</span>
                    : <OutlinedField size="sm" variant="ghost" label="Origin Country" value={it.originCountry ?? ''} options={ORIGIN_OPTS} placeholder="Origin" onChange={(v) => setItem(i, 0, { originCountry: v })} />}</td>
                </> : (
                  <td colSpan={4} className="px-[14px]"><button type="button" onClick={() => addItem(i)} className="text-[13px] text-grow-accent-2 hover:underline">+ Add SKU</button></td>
                )}
                <RemoveCell label={`Remove package ${i + 1}`} onClick={() => setParcels((ps) => (ps.length > 1 ? ps.filter((_, j) => j !== i) : [newParcel()]))} />
              </tr>
            )
          })}
        </tbody>
      </table>
      {parcels.some((p) => (p.items?.length ?? 0) > 1) && (
        <p className="mt-2 text-[12px] text-grow-ink-2">A package with more than one SKU shows its first here — the Regular form lists every SKU.</p>
      )}
      <div className="mt-4">
        <Btn variant="outlined" color="accent2" onClick={() => { setFocusLine({ i: parcels.length, k: 0 }); setParcels((ps) => [...ps, newParcel()]) }}>Add More Package</Btn>
      </div>
      {declarations}
    </Section>
  )

  /* Regular: SKU — one card per SKU line, the console's SKU fields in the 4-column grid */
  const skuSection = (
    <Section id="sec-sku" title="SKU" done={doneOf['sec-sku']}
      count={skuLines.filter(({ it }) => !isBlankItem(it)).length || undefined}
      caption="Provide the SKU details for this consignment to ensures precise tracking, billing, and handling of items."
      action={<AddMore onClick={() => addItem(parcels.length - 1)} />}>
      {skuLines.length > 0 && (
        <div className="space-y-4">
          {skuLines.map(({ it, i, k }, n) => (
            <div key={`${parcels[i].packageId}-${k}`} className="rounded-[6px] border border-grow-line">
              <div className="flex items-center gap-3 border-b border-grow-line px-4 py-2">
                <span className="text-[15px] font-semibold text-grow-ink">SKU {n + 1}</span>
                <span className="min-w-0 flex-1 truncate text-[13px] text-grow-ink-2">{it.skuCode ? `${it.skuCode} · ${it.name}` : it.name || 'Not linked to the SKU master'}</span>
                <IconBtn icon={<Trash2 size={16} />} title="Remove SKU" className="!h-8 !w-8 [&>svg]:!h-4 [&>svg]:!w-4 hover:text-grow-error" onClick={() => removeItem(i, k)} />
              </div>
              <div className="p-4">
                <Grid>
                  <Field label="SKU Code">
                    <SkuCode item={it} skus={masters.skus} onPick={(s) => pickSku(i, k, s)} onUnlink={() => setItem(i, k, { skuCode: null })}
                      autoFocus={focusLine?.i === i && focusLine.k === k} />
                  </Field>
                  <F label="SKU Name" required value={it.name} placeholder="eg, Chair" disabled={!!it.skuCode}
                    error={reqErr(isBlankItem(it) || filled(it.name))} onChange={(v) => setItem(i, k, { name: v })} />
                  {!hid('skuCategory') && <F label="Category" value={it.category ?? ''} onChange={(v) => setItem(i, k, { category: v })} />}
                  {!hid('skuDescription') && <F label="Description" value={it.description ?? ''} onChange={(v) => setItem(i, k, { description: v })} />}
                  {/* HSN Code then Origin Country — both tiers, from the SKU master on pick */}
                  <F label="HSN Code" value={it.hsnCode ?? ''} disabled={!!it.skuCode} onChange={(v) => setItem(i, k, { hsnCode: v })} />
                  <F label="Origin Country" value={it.originCountry ?? ''} options={ORIGIN_OPTS} placeholder=" " disabled={!!it.skuCode}
                    onChange={(v) => setItem(i, k, { originCountry: v })} />
                  {!hid('skuImage') && <F label="Image Url" value={it.imageUrl ?? ''} placeholder="https://" onChange={(v) => setItem(i, k, { imageUrl: v })} />}
                  {!hid('skuUnitCost') && <FNum label="Unit Cost" unit={CURRENCY} blankZero value={it.unitCost ?? 0} onChange={(n) => setItem(i, k, { unitCost: n })} />}
                  {!hid('skuDimensions') && (
                    <Field label="Dimensions (L × B × H + UOM)" className="col-span-2">
                      <div className="grid grid-cols-4 gap-2">
                        <NumBox blankZero value={it.lengthCm ?? 0} placeholder="L" onChange={(n) => setItem(i, k, { lengthCm: n })} />
                        <NumBox blankZero value={it.widthCm ?? 0} placeholder="B" onChange={(n) => setItem(i, k, { widthCm: n })} />
                        <NumBox blankZero value={it.heightCm ?? 0} placeholder="H" onChange={(n) => setItem(i, k, { heightCm: n })} />
                        <OutlinedField size="sm" className={FILL} value={it.dimUom ?? 'CM'} options={opts(DIM_UOMS)} onChange={(v) => setItem(i, k, { dimUom: v })} />
                      </div>
                    </Field>
                  )}
                  {!hid('skuWeight') && (
                    <Field label="Weight (+ UOM)">
                      <div className="grid grid-cols-[1fr_76px] gap-2">
                        <NumBox blankZero value={it.weightKg} onChange={(n) => setItem(i, k, { weightKg: n })} />
                        <OutlinedField size="sm" className={FILL} value={it.weightUom ?? 'KG'} options={opts(WEIGHT_UOMS)} onChange={(v) => setItem(i, k, { weightUom: v })} />
                      </div>
                    </Field>
                  )}
                  <FNum label="Quantity" required integer blankZero value={it.quantity}
                    error={showErrors && !isBlankItem(it) && it.quantity < 1 ? 'Required field.' : undefined} onChange={(n) => setItem(i, k, { quantity: n })} />
                  <F label="Piece" value={String(i)} options={parcels.map((_, j) => ({ value: String(j), label: `Piece ${j + 1} · ${parcels[j].packageId}` }))}
                    onChange={(v) => moveItem(i, k, Number(v))} />
                </Grid>
              </div>
            </div>
          ))}
        </div>
      )}
    </Section>
  )

  /* Regular: Piece — one card per package spec */
  const pieceSection = (
    <Section id="sec-piece" title="Piece" done={doneOf['sec-piece']} count={totals.qty}
      caption="Provide the piece details for this consignment to ensure precise tracking, billing, and handling of items."
      action={<AddMore onClick={() => setParcels((ps) => [...ps, { ...newParcel(), items: [] }])} />}>
      <div className="space-y-4">
        {parcels.map((p, i) => {
          const vol = volKg(p) * p.quantity
          const inside = (p.items ?? []).filter((it) => !isBlankItem(it))
          return (
            <div key={p.packageId ?? i} className="rounded-[6px] border border-grow-line">
              <div className="flex items-center gap-3 border-b border-grow-line px-4 py-2">
                <span className="text-[15px] font-semibold text-grow-ink">Piece {i + 1}</span>
                <span className="min-w-0 flex-1 truncate text-[13px] text-grow-ink-2">{p.packageId}</span>
                <IconBtn icon={<Copy size={16} />} title="Duplicate piece" className="!h-8 !w-8 [&>svg]:!h-4 [&>svg]:!w-4"
                  onClick={() => setParcels((ps) => [...ps.slice(0, i + 1), clonePackage(p), ...ps.slice(i + 1)])} />
                {parcels.length > 1 && (
                  <IconBtn icon={<Trash2 size={16} />} title="Remove piece" className="!h-8 !w-8 [&>svg]:!h-4 [&>svg]:!w-4 hover:text-grow-error"
                    onClick={() => setParcels((ps) => ps.filter((_, j) => j !== i))} />
                )}
              </div>
              <div className="p-4">
                <Grid>
                  {!hid('pkgTracking') && (
                    <F label="Tracking Number" value={p.trackingNumber ?? ''} placeholder="Auto-generated when empty" disabled={!!fromOverage && i === 0}
                      helper={fromOverage && i === 0 ? 'The overage scan barcode' : undefined} onChange={(v) => setParcel(i, { trackingNumber: v })} />
                  )}
                  {!hid('pkgPalletSpace') && <F label="Pallet Space" value={p.palletSpace ?? ''} onChange={(v) => setParcel(i, { palletSpace: v })} />}
                  {!hid('pkgDescription') && (
                    <F className="col-span-2" label="Package Description" value={p.description ?? ''} onChange={(v) => setParcel(i, { description: v })} />
                  )}
                  {!hid('pkgDimensions') && (
                    <Field label="Dimensions (L × W × H)" required className="col-span-2">
                      <div className="grid grid-cols-3 gap-2">
                        <NumBox value={p.l} unit="cm" error={reqErr(p.l > 0)} onChange={(n) => setParcel(i, { l: n })} />
                        <NumBox value={p.w} unit="cm" error={reqErr(p.w > 0)} onChange={(n) => setParcel(i, { w: n })} />
                        <NumBox value={p.h} unit="cm" error={reqErr(p.h > 0)} onChange={(n) => setParcel(i, { h: n })} />
                      </div>
                    </Field>
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
              </div>
              <div className="flex min-h-[36px] flex-wrap items-center gap-2 border-t border-grow-line px-4 py-1.5 text-[13px] text-grow-ink-2">
                <span>{p.quantity} × {round2(p.weight)} kg</span><span className="text-grow-ink-3">·</span>
                <span title="L × W × H ÷ 3500">Volumetric {round2(vol)} kg</span><span className="text-grow-ink-3">·</span>
                <span className="text-grow-ink">Chargeable {round2(Math.max(p.weight, volKg(p)) * p.quantity)} kg</span><span className="text-grow-ink-3">·</span>
                <span className="min-w-0 truncate">{inside.length ? `SKUs: ${inside.map((it) => `${it.skuCode ?? it.name} ×${it.quantity}`).join(', ')}` : 'No SKUs yet'}</span>
              </div>
            </div>
          )
        })}
      </div>
      {declarations}
    </Section>
  )

  const vehicleSection = (
    <Section id="sec-vehicle" title="Vehicle Details" done={doneOf['sec-vehicle']}
      caption={`${lbl('dedicateTruck')} is on — book the vehicles that fit the load for ${ftlService}. Each one is dedicated to this consignment.`}
      action={<AddMore label="Add vehicle" onClick={addVehicle} />}>
      {serviceNote && <p className="mb-4 rounded-[6px] bg-grow-info/10 px-4 py-2 text-[13px] text-grow-ink">{serviceNote}</p>}
      <table className="w-full table-fixed">
        <colgroup><col /><col className="w-[120px]" /><col className="w-[150px]" /><col className="w-[260px]" /><col className="w-[36px]" /></colgroup>
        <Head cols={[['Vehicle Type', true], ['No. of vehicles', true], ['Est. load', true], ['Deliver to', true], '']} />
        <tbody>
          {rows.map((r, i) => {
            const vSpec = vehicleSpec(r.vehicleType)
            const cap = vSpec.payloadKg * Math.max(1, r.count)
            const over = r.loadKg > cap
            return (
              <tr key={i} className="group border-t border-grow-line align-top">
                <td className="px-1 py-1.5">
                  <OutlinedField size="sm" variant="ghost" label="Vehicle Type" value={r.vehicleType} onChange={(t) => setRow(i, { vehicleType: t })}
                    options={vehiclesFor(ftlService).map((x) => ({ value: x.type }))} />
                  <p className={`px-[14px] text-[12px] ${over ? 'text-grow-error' : 'text-grow-ink-3'}`}>
                    {over ? `${r.loadKg.toLocaleString()} kg exceeds ${cap.toLocaleString()} kg` : `Up to ${vSpec.payloadKg.toLocaleString()} kg each`}
                  </p>
                </td>
                <td className="px-1 py-1.5"><NumBox variant="ghost" integer min={1} value={r.count} onChange={(n) => setRow(i, { count: Math.max(1, n) })} /></td>
                <td className="px-1 py-1.5"><NumBox variant="ghost" unit="kg" blankZero value={r.loadKg} error={reqErr(r.loadKg > 0)} onChange={(n) => setRow(i, { loadKg: n })} /></td>
                <td className="px-1 py-1.5">
                  <MultiSelect maxChips={2} value={r.addressIdx.map(String)} options={addressOptions} placeholder="Ship To addresses"
                    onChange={(vals) => setRow(i, { addressIdx: vals.map(Number).sort((x, y) => x - y) })} />
                </td>
                {rows.length > 1 ? <RemoveCell label={`Remove vehicle row ${i + 1}`} onClick={() => removeVehicle(i)} /> : <td />}
              </tr>
            )
          })}
        </tbody>
      </table>
      <p className="mt-3 text-[12px] text-grow-ink-2">
        {units} vehicle{units === 1 ? '' : 's'} · load {(actualLoad / 1000).toFixed(2)} tons ({actualLoad.toLocaleString()} kg) of {capacityKg.toLocaleString()} kg capacity
        {overloaded.length > 0 && <span className="text-grow-error"> · {overloaded.length} overloaded</span>}
        {uncovered.length > 0
          ? <span className="text-grow-error"> · {uncovered.map((i) => `Address ${i + 1}`).join(', ')} not assigned to a vehicle</span>
          : <span> · every address has a vehicle</span>}
        <span> · extras such as a tail-lift are Value Added Services</span>
      </p>
      {declarations}
    </Section>
  )

  const vasSection = (
    <Section id="sec-vas" title="Value Added Services" done={doneOf['sec-vas']} count={(c.vas ?? []).length || undefined}
      caption="Provide the value-added services for this consignment to ensure that the job is assigned with the right capabilities and resources."
      action={<AddMore onClick={() => setC({ vas: [...(c.vas ?? []), isFtl ? { ...newVas(), level: 'CONSIGNMENT' } : newVas()] })} />}>
      {(c.vas ?? []).length > 0 && (
        <table className="w-full table-fixed">
          <colgroup>
            <col className="w-[140px]" /><col className="w-[190px]" /><col /><col className="w-[124px]" /><col className="w-[170px]" /><col className="w-[36px]" />
          </colgroup>
          <Head cols={[['VAS Added Level', true], ['SKU Line Item No', true], ['Service', true], ['Service Time (mins)', true], 'Remark', '']} />
          <tbody>
            {(c.vas ?? []).map((v, i) => (
              <tr key={i} className="group h-[52px] border-t border-grow-line">
                <td className="px-1"><OutlinedField size="sm" variant="ghost" label="VAS Added Level" value={v.level} options={opts(VAS_LEVELS)}
                  onChange={(x) => setVas(i, { level: x as VasLine['level'], ...(x === 'SKU' ? {} : { skuCode: '' }) })} /></td>
                <td className="px-1">{v.level === 'SKU'
                  ? <OutlinedField size="sm" variant="ghost" label="SKU Line Item No" value={v.skuCode} placeholder={skuLineOpts.length ? 'Pick a SKU' : 'Add a SKU first'}
                    options={skuLineOpts} error={showErrors && !v.skuCode ? ' ' : undefined} onChange={(x) => setVas(i, { skuCode: x })} />
                  : <span className="px-[14px] text-[13px] text-grow-ink-3">{v.level === 'PACKAGE' ? 'Every piece' : 'This consignment'}</span>}</td>
                <td className="px-1"><OutlinedField size="sm" variant="ghost" label="Service" value={v.service} placeholder="Pick a service"
                  options={VAS_OPTS} error={showErrors && !v.service ? ' ' : undefined} onChange={(x) => setVas(i, { service: x })} /></td>
                <td className="px-1"><NumBox variant="ghost" integer value={v.serviceTimeMin} unit="min" onChange={(n) => setVas(i, { serviceTimeMin: n })} /></td>
                <td className="px-1"><OutlinedField size="sm" variant="ghost" label="Remark" value={v.remark} placeholder="—" onChange={(x) => setVas(i, { remark: x })} /></td>
                <RemoveCell label={`Remove service ${i + 1}`} onClick={() => setC({ vas: (c.vas ?? []).filter((_, j) => j !== i) })} />
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Section>
  )

  const carrierSection = (
    <Section id="sec-carriers" title="Carriers" count={CARRIERS.length} done={doneOf['sec-carriers']}>
      <div className="flex flex-wrap gap-4 rounded-[6px] bg-grow-canvas p-6">
        {CARRIERS.map((k) => {
          const on = c.carrier === k.code
          return (
            <button key={k.code} type="button" onClick={() => setC({ carrier: k.code })} role="radio" aria-checked={on}
              className={`flex items-center gap-3 rounded-[6px] border bg-white px-4 py-3 text-left transition-colors ${FOCUS_RING}
                ${on ? 'border-grow-accent-2' : 'border-transparent hover:border-grow-line'}`}>
              <span className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border-2 ${on ? 'border-grow-accent-2' : 'border-grow-ink-3'}`}>
                {on && <span className="h-[8px] w-[8px] rounded-full bg-grow-accent-2" />}
              </span>
              <span>
                <span className="block text-[15px] leading-tight text-grow-ink">{k.code}</span>
                <span className="block text-[12px] leading-tight text-grow-ink-2">{k.sub}</span>
              </span>
            </button>
          )
        })}
      </div>
      {showErrors && !c.carrier && <p className="mx-[14px] mt-2 text-[12px] text-grow-error">Select a carrier to create the consignment.</p>}
    </Section>
  )

  const byId: Record<string, ReactNode> = {
    'sec-consignment': consignmentSection, 'sec-ship': shipSimplified, 'sec-ship-from': shipFromSection,
    'sec-rto': rtoSection, 'sec-ship-to': shipToSection, 'sec-package': packageSimplified, 'sec-sku': skuSection,
    'sec-piece': pieceSection, 'sec-vehicle': vehicleSection, 'sec-vas': vasSection, 'sec-carriers': carrierSection,
  }

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-[24px] font-medium leading-[1.33] text-grow-ink">Create Consignment</h1>
        <p className="mt-0.5 text-[13px] text-grow-ink-2">{full ? 'Regular form' : 'Simplified form'}</p>
      </div>
      {fromPr && (
        <div className="mb-4 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-[6px] border border-grow-line bg-grow-info/10 px-4 py-2.5 text-[13px] text-grow-ink">
          <Truck size={16} className="shrink-0 text-grow-accent-2" />
          <span>Creating the FTL consignment for <b>{fromPr.number}</b>
            {fromPr.ftlServiceType ? ` · ${fromPr.ftlServiceType}` : ''}
            {fromPr.vehicleType ? ` · ${(fromPr.vehicleUnit ?? 1) > 1 ? `${fromPr.vehicleUnit} × ` : ''}${fromPr.vehicleType}` : ''} · window {prWindow(fromPr)}</span>
          <Link to={`/grow/orders/pickups/${fromPr.id}`} className="font-medium text-grow-accent-2 hover:underline">View pickup request</Link>
        </div>
      )}
      {fromOverage && (
        <div className="mb-4 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-[6px] border border-grow-line bg-grow-info/10 px-4 py-2.5 text-[13px] text-grow-ink">
          <ScanBarcode size={16} className="shrink-0 text-grow-accent-2" />
          <span>Creating the consignment for overage scan <b className="font-mono">{fromOverage.scan.barcode}</b> from <b>{fromOverage.pr.number}</b>
            {fromOverage.scan.weightKg != null ? ` · ${fromOverage.scan.weightKg} kg` : ''}</span>
          <Link to={`/grow/orders/pickups/${fromOverage.pr.id}`} className="font-medium text-grow-accent-2 hover:underline">View pickup request</Link>
        </div>
      )}

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0 space-y-5">
          {sections.map((id) => <div key={id}>{byId[id]}</div>)}
        </div>

        {/* Shipment Summary rail — what is being booked and what it costs */}
        <aside className="rounded-[6px] border border-grow-line bg-white p-5 xl:sticky xl:top-4">
          <h2 className="text-[17px] font-semibold leading-[1.3] text-grow-ink">Shipment Summary</h2>
          <div className="mt-3 flex items-center gap-2.5" title={`${filledCount} of ${allReq.length} required fields filled`}>
            <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-grow-ink/10">
              <span className="block h-full rounded-full bg-grow-success transition-all" style={{ width: `${Math.round((filledCount / allReq.length) * 100)}%` }} />
            </span>
            <span className="whitespace-nowrap text-[12px] tabular-nums text-grow-ink-2">{filledCount}/{allReq.length} required</span>
          </div>
          <SummaryBlock title="Ship From" onJump={() => jumpTo(full ? 'sec-ship-from' : 'sec-ship')}>{sender.name || '—'}{sender.line1 ? `, ${partyLine(sender)}` : ''}</SummaryBlock>
          <SummaryBlock title={allDrops.length > 1 ? `Ship To (${allDrops.length} addresses)` : 'Ship To'} onJump={() => jumpTo(full ? 'sec-ship-to' : 'sec-ship')}>
            {allDrops.map((d, i) => <p key={i}>{allDrops.length > 1 ? `${i + 1}. ` : ''}{d.name || '—'}{d.line1 ? `, ${partyLine(d)}` : ''}</p>)}
          </SummaryBlock>
          {isFtl ? (
            <SummaryBlock title="FTL · Vehicle Details" onJump={() => jumpTo('sec-vehicle')}>
              {ftlService} · {units} vehicle{units === 1 ? '' : 's'} · {(actualLoad / 1000).toFixed(2)} tons
              {addServices.length > 0 && <p className="text-[13px] text-grow-ink-2">+ {addServices.join(', ')}</p>}
            </SummaryBlock>
          ) : (
            <SummaryBlock title="LTL · Package & SKU" onJump={() => jumpTo(full ? 'sec-piece' : 'sec-package')}>
              {totals.qty} package{totals.qty === 1 ? '' : 's'} · {totals.items} SKU unit{totals.items === 1 ? '' : 's'}
              <p className="text-[13px] text-grow-ink-2">Dead {kg(totals.dead, 2)} · Vol {kg(totals.vol, 2)} · Chargeable {kg(totals.chargeable, 2)}</p>
            </SummaryBlock>
          )}
          <SummaryBlock title="Service Type · Carrier" onJump={() => jumpTo('sec-carriers')}>
            {svc.code} · {c.carrier || <span className="text-grow-ink-3">no carrier yet</span>}
          </SummaryBlock>
          <div className="mt-4 ml-auto grid w-fit grid-cols-[auto_auto] items-baseline gap-x-6 gap-y-1 text-[13px] text-grow-ink-2">
            <span>Delivery</span><span className="text-right text-[15px] text-grow-ink">{money(svc.price, CURRENCY)}</span>
            <span>Total</span><span className="text-right text-[17px] font-semibold text-grow-ink">{money(svc.price, CURRENCY)}</span>
            <span>ETA<span className="text-grow-accent-2">*</span></span><span className="text-right text-[15px] text-grow-ink">{svc.days} Day</span>
          </div>
        </aside>
      </div>

      {/* sticky footer, as staging: tier switch left; Go Back / Create Consignment right */}
      <div className="sticky bottom-0 z-30 -mx-6 mt-6 flex flex-wrap items-center gap-3 border-t border-grow-line bg-white px-6 py-3">
        <Btn variant="outlined" color="accent2" onClick={() => setFormMode(full ? 'simplified' : 'full')}>
          {full ? 'Switch to Simplified' : 'Switch to Regular Add Form'}
        </Btn>
        <span className="ml-auto" />
        {showErrors && !canSubmit && (
          <span className="text-[13px] text-grow-error">{missingCount} required field{missingCount === 1 ? '' : 's'} remaining</span>
        )}
        <Btn variant="text" color="accent2" onClick={saveForLater}>Save for Later</Btn>
        <Btn variant="outlined" color="neutral" onClick={() => { clearDraftKeys(); nav(backTo) }}>Go Back</Btn>
        <Btn color="accent2" onClick={proceed}>Create Consignment</Btn>
      </div>
    </div>
  )
}
