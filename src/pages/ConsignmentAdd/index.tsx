/**
 * Add Consignment — originally a 1:1 replica of the staging page; now carries the
 * SED context-label matrix and a set of deliberate UX improvements on top of the
 * same field inventory:
 *
 * - Party labels react to Consignment Type + Task (partyLabels.ts): the Ship From
 *   section presents AS its entity — "Origin Facility", "Customer" or "Supplier" —
 *   with the system name (Ship From / Ship To) kept as a small eyebrow, and the
 *   pickup/delivery/service window row shown or hidden per context, exactly as
 *   the label matrix specifies.
 * - Required-field errors appear on blur or on a submit attempt instead of
 *   screaming on first paint (staging's eager errors were replicated before;
 *   dropped deliberately as part of the UI improvement pass).
 * - Section headers show a completion check once their required fields are
 *   filled; the sticky footer carries an overall required-fields progress bar.
 * - The RTO "Use Different Address" block is wired to real state (it previously
 *   rendered dead inputs that discarded keystrokes).
 * - The field grid collapses 4 → 2 → 1 columns on narrower viewports.
 */

import { useEffect, useRef, useState } from 'react'
import { useNavigate, useOutletContext } from 'react-router-dom'
import {
  AlertCircle, Barcode, Biohazard, CalendarCheck, CheckCircle2, CircleDot, ClipboardList,
  Factory, FileCheck, Info, Layers, ScanLine, Split, Star, Truck, Undo2, User, Users,
  Warehouse, Weight, Wine, Wrench,
} from 'lucide-react'
import { Button, DateInput, Input, MenuSelect, MultiSelect, Toggle } from '../../nueva/components'
import { DateTimeRangeInput } from '../../nueva/DateRangeFilter'
import { toast } from '../../nueva/toast'
import { HeaderActions } from '../../components/layout/Header'
import { createConsignmentV3, fetchConsignments } from '../ConsignmentOrder/api'
import { fetchCities, fetchCountries, fetchHubsPage, fetchMasterRows, fetchRoutingGeneralSettings, fetchSkuMaster, type MasterRecord, type SkuMasterRow } from '../../nueva/settingsApi'
import {
  fieldHidden, fieldLabel, fetchFormBehavior, loadFieldConfig, loadFormBehavior,
  saveFieldConfig, resetFieldConfig,
  type FieldConfig, type FormBehavior,
} from './fieldConfig'
import { FormBuilderDrawer } from './FormBuilderDrawer'
import { useAuth } from '../../auth/AuthContext'
import { SlidersHorizontal } from 'lucide-react'
import type { LayoutOutletContext } from '../../components/layout/Layout'
import {
  PackageBoxes, RepeatableList,
  SkuBody, SkuSummary, SkuTotals, VasBody, VasSummary,
} from '../../components/consignmentRows'
import {
  computePackInfo, newPackage, newSku, newVas,
  skuIncomplete, vasIncomplete,
  type PackageRow, type SkuRow, type VasRow,
} from '../../components/consignmentRowsModel'
import {
  partyLabelsFor, resolveContext, type PartySideLabels,
} from './partyLabels'

/* -------------------------------------------------------------------- model ---- */

interface AddressForm {
  /** address.code — a CLIENT-defined location (merchant / DC / customer site).
   *  On the non-hub side this is what generates the first-mile pickup leg;
   *  leave it blank for "no pickup". Independent of facilityCode. */
  locationCode: string
  /** originFacilityCode / destinationFacilityCode / returnFacilityCode — a
   *  REGISTERED hub code. Drives the mid-mile + last-mile legs. Independent of
   *  locationCode: a party may carry both, either, or neither. */
  facilityCode: string
  companyName: string
  name: string
  countryCode: string
  contactNumber: string
  email: string
  line1: string
  line2: string
  line3: string
  landmark: string
  country: string
  postalCode: string
  county: string
  city: string
  state: string
  latitude: string
  longitude: string
  startDate: string
  startTime: string
  endDate: string
  endTime: string
  floorNumber: string
  liftAvailable: boolean
}

const emptyAddress = (): AddressForm => ({
  locationCode: '', facilityCode: '', companyName: '', name: '', countryCode: '', contactNumber: '', email: '',
  line1: '', line2: '', line3: '', landmark: '', country: '', postalCode: '', county: '',
  city: '', state: '', latitude: '', longitude: '',
  startDate: '', startTime: '', endDate: '', endTime: '',
  floorNumber: '', liftAvailable: false,
})

const CATEGORY = ['4 Person', 'Stackable', 'Fragile', 'VIP', 'Hazmat', 'Heavy Weight'] as const

const CATEGORY_ICON: Record<(typeof CATEGORY)[number], React.ComponentType<{ size?: number | string; className?: string }>> = {
  '4 Person': Users,
  Stackable: Layers,
  Fragile: Wine,
  VIP: Star,
  Hazmat: Biohazard,
  'Heavy Weight': Weight,
}
/* fallback until the live carrier list loads (unique carrier codes from the account) */
const CARRIERS = ['OWNFLEET'] as const

/* PKG-prefixed, 7 digits, never zero-leading — satisfies the account's tracking
   number template while avoiding the server generator's retry exhaustion */
const genTrackingNumber = () => `PKG${(Date.now() % 9_000_000) + 1_000_000}`

const today = () => new Date().toISOString().slice(0, 10)


const ENTITY_ICON: Record<string, React.ComponentType<{ size?: number | string; className?: string }>> = {
  'Origin Facility': Warehouse,
  'Destination Facility': Warehouse,
  'Return Facility': Undo2,
  Customer: User,
  Supplier: Factory,
}

const FROM_CAPTION: Record<string, string> = {
  'Origin Facility': 'The dispatching facility this consignment starts from — its address and contact details.',
  Customer: 'The customer location the driver collects from — address, contact details and pickup window.',
  Supplier: 'The supplier location the goods are collected from — address, contact details and pickup window.',
}

const TO_CAPTION: Record<string, string> = {
  Customer: 'Where the consignment is fulfilled — recipient address, contact details and the time window.',
  'Destination Facility': 'The receiving facility this pickup consignment is brought to.',
  'Return Facility': 'The facility this return is sent back to.',
  'Origin Facility': 'The originating facility the consignment is returned to.',
}

/* --------------------------------------------------------------------- page ---- */

export default function ConsignmentAdd() {
  const navigate = useNavigate()

  const [orderNumber, setOrderNumber] = useState('')
  const [referenceNumber, setReferenceNumber] = useState('')
  const [consignmentNumber, setConsignmentNumber] = useState('')
  const [consignmentType, setConsignmentType] = useState('Forward')
  // staging's main form carries no Task control — fixed to Delivery; partyLabels
  // still derive the Ship From/To presentation from (type, task)
  const [taskType] = useState<string>('Delivery')
  const [shipByDate, setShipByDate] = useState(today())
  const [merchant, setMerchant] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [paymentMode, setPaymentMode] = useState('')
  const [orderAmount, setOrderAmount] = useState('')
  const [serviceType, setServiceType] = useState('')
  const [routingType, setRoutingType] = useState('')
  /* staging's routingTypeOptions catalog; only ids with an ENABLED routing
     configuration are offered (the field hides when none are available) */
  const [routingTypeOptions, setRoutingTypeOptions] = useState<{ code: string; name: string }[]>([])
  const [labelFormat, setLabelFormat] = useState('')
  const [schedulingConfirmation, setSchedulingConfirmation] = useState(false)
  const [dedicateTruck, setDedicateTruck] = useState(false)
  const [clearanceRequired, setClearanceRequired] = useState(false)
  const [totalLoadingTime, setTotalLoadingTime] = useState('')
  const [specialInstructions, setSpecialInstructions] = useState('')
  const [deliveryInstructions, setDeliveryInstructions] = useState('')
  const [exchangeOrderNumber, setExchangeOrderNumber] = useState('')
  const [scannable, setScannable] = useState(false)
  const [splittable, setSplittable] = useState(false)
  const [fourPersonServiceTime, setFourPersonServiceTime] = useState('')

  const [shipFrom, setShipFrom] = useState<AddressForm>(emptyAddress)
  const [shipTo, setShipTo] = useState<AddressForm>(emptyAddress)
  const [rtoAddress, setRtoAddress] = useState<AddressForm>(emptyAddress)
  const [rtoMode, setRtoMode] = useState('Same As Ship From')
  const [deliveryMode, setDeliveryMode] = useState('Home Delivery')
  const [category, setCategory] = useState<Record<string, boolean>>({})
  // deliberately NO default — the vendor must consciously pick a carrier
  const [carrier, setCarrier] = useState<string>('')
  const [carrierOptions, setCarrierOptions] = useState<string[]>([...CARRIERS])
  const [skus, setSkus] = useState<SkuRow[]>([])
  const [skuMaster, setSkuMaster] = useState<SkuMasterRow[]>([])
  // real merchant master (businessUnit) — value stored is the CODE, label shown is the NAME
  const [merchants, setMerchants] = useState<MasterRecord[]>([])
  // tag suggestions come from the tag master; new ones can be typed on the fly
  const [tagOptions, setTagOptions] = useState<string[]>([])
  // packageType + vas masters — drive the Package Type / Service dropdowns + autofill
  const [packageTypes, setPackageTypes] = useState<MasterRecord[]>([])
  const [vasServices, setVasServices] = useState<MasterRecord[]>([])
  // real location sources for the address cards (staging behavior): facilities
  // for Ship From / RTO, the merchant's customer/PUDO locations for Ship To
  const [hubs, setHubs] = useState<MasterRecord[]>([])
  /** hub code -> coordinates, parsed from the master branch address JSON —
   * the legacy hub list carries no coordinates, and consignments without them
   * land in Data Validation Issues with GEO_LOOKUP_NOT_FOUND */
  const [hubCoords, setHubCoords] = useState<Map<string, { lat: string; lng: string }>>(new Map())
  const [locations, setLocations] = useState<MasterRecord[]>([])
  const [countries, setCountries] = useState<{ value: string; label: string }[]>([])
  const [cityNames, setCityNames] = useState<Map<string, string>>(new Map())
  const [packages, setPackages] = useState<PackageRow[]>([])
  const [vas, setVas] = useState<VasRow[]>([])

  const [touched, setTouched] = useState<Record<string, boolean>>({})
  const [showErrors, setShowErrors] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [apiErrors, setApiErrors] = useState<string[]>([])


  /* carrier options + SKU master, in parallel (never waterfall — see CLAUDE.md) */
  useEffect(() => {
    fetchConsignments(1, 200)
      .then(({ rows }) => {
        const live = Array.from(new Set(rows.map((r) => r.carrier).filter(Boolean)))
        if (live.length) { setCarrierOptions(live); setCarrier((c) => (c && !live.includes(c) ? '' : c)) }
      })
      .catch(() => {})
    fetchSkuMaster().then(setSkuMaster).catch(() => {})
    fetchMasterRows('businessUnit').then(setMerchants).catch(() => {})
    fetchMasterRows('tagMaster')
      .then((rs) => setTagOptions(rs.filter((r) => r.enabled).map((r) => String(r.code ?? '')).filter(Boolean)))
      .catch(() => {})
    fetchHubsPage().then(setHubs).catch(() => {})
    fetchRoutingGeneralSettings().then((configs) => {
      const CATALOG = [
        { id: 1, code: 'sameday_nextday', name: 'Same/Next Day' },
        { id: 2, code: 'ltl_ftl', name: 'LTL/FTL' },
        { id: 3, code: 'scheduled', name: 'Scheduled' },
        { id: 5, code: 'hyperlocal', name: 'Hyperlocal' },
      ]
      const enabled = new Set(configs.filter((c) => c.enabled).map((c) => c.routingType))
      setRoutingTypeOptions(CATALOG.filter((o) => enabled.has(o.id)))
    }).catch(() => {})
    fetchMasterRows('branch').then((rows) => {
      const m = new Map<string, { lat: string; lng: string }>()
      for (const r of rows) {
        try {
          const a = JSON.parse(String(r.address ?? '{}')) as { latitude?: unknown; longitude?: unknown }
          if (a.latitude != null && a.longitude != null && a.latitude !== '') {
            m.set(String(r.code), { lat: String(a.latitude), lng: String(a.longitude) })
          }
        } catch { /* opaque address */ }
      }
      setHubCoords(m)
    }).catch(() => {})
    fetchMasterRows('packageType').then(setPackageTypes).catch(() => {})
    fetchMasterRows('vas').then(setVasServices).catch(() => {})
    fetchMasterRows('businessUnitLocation').then(setLocations).catch(() => {})
    fetchCountries().then(setCountries).catch(() => {})
    fetchCities()
      .then((cs) => setCityNames(new Map(cs.map((c) => [c.value, c.label]))))
      .catch(() => {})
  }, [])

  /* field configuration (show/hide + relabel, persisted) + form tier; the
     Base Modules "Add Form" settings drive default tier, the identifier pair
     and which fields exist at all */
  const [fieldCfg, setFieldCfg] = useState<FieldConfig>(loadFieldConfig)
  const [behavior, setBehavior] = useState<FormBehavior>(loadFormBehavior)
  const [formMode, setFormMode] = useState<'simplified' | 'full'>(() => loadFormBehavior().defaultMode)
  useEffect(() => { fetchFormBehavior().then(setBehavior).catch(() => {}) }, [])
  /* admin-only on-form Form Builder (drag-drop reorder / show-hide / relabel / reset) */
  const { account } = useAuth()
  const isAdmin = account?.userTypeName === 'Admin'
  const [builderOpen, setBuilderOpen] = useState(false)
  const applyFieldCfg = (next: FieldConfig) => { setFieldCfg(next); saveFieldConfig(next) }
  /* opening the builder collapses the app nav for a focused split-view; closing
     restores whatever the nav was before */
  const layout = useOutletContext<LayoutOutletContext | undefined>()
  const priorCollapsed = useRef(false)
  const openBuilder = () => { if (layout) { priorCollapsed.current = layout.collapsed; layout.setCollapsed(true) } setBuilderOpen(true) }
  const closeBuilder = () => { layout?.setCollapsed(priorCollapsed.current); setBuilderOpen(false) }
  useEffect(() => () => { if (builderOpen) layout?.setCollapsed(priorCollapsed.current) }, [builderOpen, layout])
  const [sameAsOrder, setSameAsOrder] = useState(false)
  const show = (key: string) => !fieldHidden(key, fieldCfg, formMode, behavior)
  const lbl = (key: string) => fieldLabel(key, fieldCfg)
  /* identifier pair — when reduced to one field, the other silently copies */
  const idPref = behavior.identifier
  const handlingShown = ['schedulingConfirmation', 'clearanceRequired', 'scannable', 'splittable', 'dedicateTruck']
    .some((k) => show(k))

  /* "only one number" — Reference Number can mirror Order Number; the Base
     Modules identifier preference can reduce the pair to a single field */
  const effectiveOrder = idPref === 'referenceNumber' ? referenceNumber : orderNumber
  const effectiveReference = idPref === 'orderNumber' ? orderNumber : (sameAsOrder ? orderNumber : referenceNumber)

  const context = resolveContext(consignmentType, taskType)
  const L = partyLabelsFor(context)

  // Package labels take their units from the SKU rows; "-" until a SKU exists,
  // which is how staging renders "Weight (-)" on a fresh package.
  const units = {
    weight: skus[0]?.weightUom || '-',
    length: skus[0]?.uom || '-',
  }
  const skuOptions = skus.map((s) => s.lineItemNo.trim()).filter(Boolean)
  const packInfo = computePackInfo(skus, packages)

  const setFrom = (k: keyof AddressForm, v: string | boolean) =>
    setShipFrom((p) => ({ ...p, [k]: v }))
  const setTo = (k: keyof AddressForm, v: string | boolean) =>
    setShipTo((p) => ({ ...p, [k]: v }))
  const setRto = (k: keyof AddressForm, v: string | boolean) =>
    setRtoAddress((p) => ({ ...p, [k]: v }))

  /* ---------------- location dropdowns + auto-fill (staging behavior) ---------
   * Ship From / RTO offer facilities; Ship To offers the businessUnitLocation
   * rows that match the delivery mode (customer/merchant vs PUDO/locker) and
   * the chosen merchant (merchant-less locations always qualify). Picking one
   * fills the card from the master record. */
  const asArr = (v: unknown) => (Array.isArray(v) ? v.map(String).filter(Boolean) : v ? [String(v)] : [])
  const hubCodes = hubs.map((h) => String(h.code ?? '')).filter(Boolean)
  const hubLabel = (v: string) => {
    const h = hubs.find((x) => String(x.code) === v)
    return h ? `${String(h.name)} (${v})` : v
  }
  /* staging's buildLocationList merges the merchant's locations, merchant-less
     locations AND the facilities — the dropdown is deliberately wide. The
     PUDO/Locker mode narrows to pickup-point types. */
  const toTypes = deliveryMode === 'PUDO/Locker'
    ? ['PUDO', 'PARCEL_LOCKER']
    : ['CUSTOMER_LOCATION', 'MERCHANT_LOCATION', 'PUDO', 'HUB']
  const toLocations = locations
    .filter((l) => toTypes.includes(String(l.type)))
    .filter((l) => {
      if (!merchant) return true
      const codes = asArr(l.business_unit_code)
      return codes.length === 0 || codes.includes(merchant)
    })
  const toCodes = [
    ...toLocations.map((l) => String(l.code ?? '')).filter(Boolean),
    ...(deliveryMode === 'PUDO/Locker' ? [] : hubCodes),
  ]
  const toLabel = (v: string) => {
    const l = locations.find((x) => String(x.code) === v)
    if (l) return `${String(l.name)} (${v})`
    const h = hubs.find((x) => String(x.code) === v)
    return h ? `${String(h.name)} (${v}) — facility` : v
  }
  const pickShipTo = (code: string) => {
    if (hubs.some((h) => String(h.code) === code)) fillFromHub(setShipTo)(code)
    else fillShipTo(code)
  }
  const countryCodeOf = (name: string) =>
    countries.find((c) => c.label.toLowerCase() === name.toLowerCase() || c.value === name)?.value ?? name
  const splitPhone = (raw: string): { cc: string; rest: string } => {
    for (const cc of ['+1', '+44', '+61', '+91', '+31']) {
      if (raw.startsWith(cc)) return { cc, rest: raw.slice(cc.length) }
    }
    return { cc: '', rest: raw.replace(/\D/g, '') }
  }
  const fillFromHub = (setter: React.Dispatch<React.SetStateAction<AddressForm>>) => (code: string) => {
    const h = hubs.find((x) => String(x.code) === code)
    if (!h) { setter((p) => ({ ...p, locationCode: code })); return }
    const a = (h.address ?? {}) as Record<string, unknown>
    const str = (v: unknown) => (v == null ? '' : String(v))
    const phone = splitPhone(str(a.contactNumber))
    setter((p) => ({
      ...p,
      // a hub IS a facility: seed both codes (address.code == facility code =
      // the "no pickup leg" pattern). Clear the location code to drop the FM leg.
      locationCode: code,
      facilityCode: code,
      companyName: str(h.name),
      name: str(a.contactPerson) || p.name,
      countryCode: phone.cc || p.countryCode,
      contactNumber: phone.rest || p.contactNumber,
      line1: str(a.addressLine1), line2: str(a.addressLine2), line3: str(a.addressLine3),
      country: a.country ? countryCodeOf(str(a.country)) : p.country,
      state: str(a.state) || p.state,
      county: str(h.region ?? a.suburb) || p.county,
      city: cityNames.get(String(h.cityId ?? '')) ?? p.city,
      postalCode: str(h.zipCode) || p.postalCode,
      latitude: hubCoords.get(code)?.lat ?? p.latitude,
      longitude: hubCoords.get(code)?.lng ?? p.longitude,
    }))
  }
  const fillShipTo = (code: string) => {
    const l = locations.find((x) => String(x.code) === code)
    if (!l) { setShipTo((p) => ({ ...p, locationCode: code })); return }
    const a = (l.address ?? {}) as Record<string, unknown>
    const str = (v: unknown) => (v == null ? '' : String(v))
    const phone = splitPhone(str(l.contact_number))
    setShipTo((p) => ({
      ...p,
      locationCode: code,
      companyName: asArr(l.business_unit_name)[0] ?? '',
      name: str(l.contact_person) || p.name,
      countryCode: phone.cc || p.countryCode,
      contactNumber: phone.rest || p.contactNumber,
      email: str(l.email_id) || p.email,
      line1: str(a.address_line1), line2: str(a.address_line2), line3: str(a.address_line3),
      country: a.country ? countryCodeOf(str(a.country)) : p.country,
      postalCode: str(a.postal_code) || p.postalCode,
      county: str(a.suburb) || p.county,
      city: str(a.city) || p.city,
      state: str(a.state) || p.state,
      latitude: a.latitude != null ? String(a.latitude) : p.latitude,
      longitude: a.longitude != null ? String(a.longitude) : p.longitude,
    }))
  }

  const markTouched = (key: string) => setTouched((t) => (t[key] ? t : { ...t, [key]: true }))
  const fieldError = (key: string, invalid: boolean) => invalid && (showErrors || !!touched[key])

  /* ------------------------------------------------ completion + validation */

  const consignmentReq = [!!effectiveOrder.trim(), !!effectiveReference.trim(), !!merchant]
  const fromReq = [shipFrom.name, shipFrom.line1, shipFrom.country, shipFrom.city, shipFrom.state]
    .map((v) => !!v.trim())
  const toReq = [shipTo.name, shipTo.contactNumber, shipTo.line1, shipTo.country, shipTo.city, shipTo.state]
    .map((v) => !!v.trim())
  const rtoReq = rtoMode === 'Same As Ship From'
    ? [true]
    : [rtoAddress.name, rtoAddress.line1, rtoAddress.country, rtoAddress.city, rtoAddress.state]
      .map((v) => !!v.trim())

  const carrierReq = [!!carrier]
  const allReq = [...consignmentReq, ...fromReq, ...toReq, ...rtoReq, ...carrierReq]
  const canSubmit = allReq.every(Boolean)
  const missingCount = allReq.filter((ok) => !ok).length

  const incompleteSections: { id: string; done: boolean }[] = [
    { id: 'sec-consignment', done: consignmentReq.every(Boolean) },
    { id: 'sec-ship-from', done: fromReq.every(Boolean) },
    { id: 'sec-rto', done: rtoReq.every(Boolean) },
    { id: 'sec-ship-to', done: toReq.every(Boolean) },
    { id: 'sec-carriers', done: !!carrier },
  ]


  /* Build the real v3 payload (shape verified live — see ConsignmentOrder/api.ts) */
  const buildPayload = () => {
    const num = (s: string) => { const n = Number(s); return Number.isFinite(n) && s.trim() !== '' ? n : undefined }
    // v3 takes FLAT, space-separated datetimes — `pickupWindow`/`deliveryWindow`
    // objects are SILENTLY DROPPED (probed 2026-09-03: a garbage value inside
    // them still returns 200, while a garbage `pickupStartDateTime` 400s with
    // "must be in format: yyyy-MM-dd HH:mm:ss")
    const dt = (d: string, t: string, fallback: string) => `${d} ${t || fallback}:00`
    const winStart = (a: AddressForm) => (a.startDate ? dt(a.startDate, a.startTime, '00:00') : null)
    const winEnd = (a: AddressForm) => (a.endDate ? dt(a.endDate, a.endTime, '23:59') : null)

    // address.code and the facility codes are INDEPENDENT fields (spec:
    // "Facility Code vs Address Code"; facility code wins when both are sent):
    //   address.code            = client-defined merchant/DC/customer location
    //   origin/destinationFacilityCode = registered hub
    // Which SIDE carries the non-hub code flips with consignment type — on a
    // FORWARD it is shipFrom, on a REVERSE it is shipTo (spec's "Returns from
    // Consumer to Store" puts the hub code on ShipTo.Address.Code). The party
    // label matrix already encodes that, so read facility-ness from it.
    const fromIsFacility = L.shipFrom.entity.includes('Facility')
    const toIsFacility = L.shipTo.entity.includes('Facility')
    // explicit facility code wins; fall back to the location code only when the
    // party IS a facility, so existing hub-picked drafts keep working
    const facilityOf = (a: AddressForm, isFacility: boolean) =>
      a.facilityCode.trim() || (isFacility ? a.locationCode.trim() : '')
    const addr = (a: AddressForm, kind: 'from' | 'to' | 'rto', isFacility = false) => ({
      contact: {
        name: a.name || undefined,
        contactNumber: `${a.countryCode}${a.contactNumber}` || undefined,
        email: a.email || undefined,
        companyName: a.companyName || undefined,
      },
      address: {
        // FACILITY when the address code IS the hub code (verified shape of
        // LML2026-027), otherwise typed by the party's role
        type: a.locationCode && (isFacility || a.locationCode.trim() === a.facilityCode.trim())
          ? 'FACILITY'
          : kind === 'to' ? 'RESIDENTIAL' : 'COMMERCIAL',
        code: a.locationCode || undefined,
        line1: a.line1, line2: a.line2 || undefined, line3: a.line3 || undefined,
        landmark: a.landmark || undefined,
        city: a.city, state: a.state, pincode: a.postalCode || undefined,
        country: a.country, county: a.county || undefined,
        latitude: num(a.latitude), longitude: num(a.longitude),
        ...(a.floorNumber ? { floorNumber: a.floorNumber } : {}),
        ...(a.liftAvailable ? { liftAvailable: true } : {}),
      },
    })

    const pkgRows = packages.length ? packages : null
    const packageDetails = (pkgRows ?? [{
      packageId: `PKGA${Date.now().toString(36).slice(-5).toUpperCase()}`,
      trackingNumber: '', type: 'crate', quantity: '1',
      weight: '1', length: '10', width: '10', height: '10', palletSpace: '', description: '',
      dimensionUom: '', weightUom: '', contents: [],
    }]).map((p, i) => ({
      id: p.packageId,
      type: p.type || 'crate',
      quantity: num(p.quantity) ?? 1,
      length: num(p.length) ?? 10, width: num(p.width) ?? 10, height: num(p.height) ?? 10,
      dimensionUom: p.dimensionUom || 'CM',
      weight: num(p.weight) ?? 1, weightUom: p.weightUom || 'KG',
      packageStatus: 'AVAILABLE',
      trackingDetails: [{ trackingNumber: p.trackingNumber || `${genTrackingNumber().slice(0, -1)}${i}` }],
    }))

    // the API rejects null totals — derive from SKU lines (× qty), else packages
    const totalWeight = skus.reduce((a, s) => a + (num(s.weight) ?? 0) * (num(s.quantity) ?? 1), 0)
      || packages.reduce((a, p) => a + (num(p.weight) ?? 0) * (num(p.quantity) ?? 1), 0)
      || 1
    const totalWeightUom = skus[0]?.weightUom || packages[0]?.weightUom || 'KG'

    // verified live 2026-08-27: consignmentDetails.vas[{vasCode, vasAddedLevel,
    // targetIds (SKU line numbers / package ids), serviceTime, remarks}]
    const vasDetails = vas.filter((v) => v.service).map((v) => ({
      vasCode: v.service,
      vasAddedLevel: v.level || 'SKU',
      targetIds: v.level === 'PACKAGE'
        ? packages.map((p) => p.packageId)
        : v.level === 'CONSIGNMENT' ? [effectiveReference] : [v.skuLineItemNo].filter(Boolean),
      serviceTime: num(v.serviceTime) ?? 0,
      ...(v.remark.trim() ? { remarks: v.remark.trim() } : {}),
    }))

    const skuDetails = skus.filter((s) => s.lineItemNo.trim()).map((s) => ({
      lineItemNo: s.lineItemNo, code: s.code || s.lineItemNo, name: s.name || undefined,
      quantity: num(s.quantity) ?? 1, uom: s.uom || 'BOX',
      ...(s.category ? { category: s.category } : {}),
      weight: num(s.weight), weightUom: s.weightUom || 'KG',
      packageIds: packages
        .filter((p) => p.contents.some((c) => c.lineItemNo === s.lineItemNo))
        .map((p) => p.packageId),
      hazmat: !!category.Hazmat,
    }))

    return {
      consignmentDetails: {
        referenceNumber: effectiveReference,
        orderNumber: effectiveOrder,
        // staging's OWN form defaults a blank consignment number to the
        // reference (verified live 2026-08-27: without it the API demands a
        // number-generation config this account doesn't have)
        consignmentNumber: consignmentNumber.trim() || effectiveReference,
        ...(exchangeOrderNumber.trim() ? { exchangeOrderNumber: exchangeOrderNumber.trim() } : {}),
        consignmentType: consignmentType.toUpperCase(),
        ...(serviceType ? { serviceType } : {}),
        ...(routingType ? { routingType } : {}),
        businessUnit: merchant,
        shipByDate,
        ...(tags.length ? { tags } : {}),
        ...(paymentMode ? { paymentMode } : {}),
        ...(num(orderAmount) != null ? { amount: num(orderAmount) } : {}),
        labelFormat: labelFormat || 'PDF',
        totalWeight, totalWeightUom,
        ...(vasDetails.length ? { vas: vasDetails } : {}),
        scannable, splittable,
        schedulingConfirmationRequired: schedulingConfirmation,
        clearanceRequired,
        dedicatedTruck: dedicateTruck,
        fourPerson: !!category['4 Person'],
        stackable: !!category.Stackable,
        fragile: !!category.Fragile,
        vip: !!category.VIP,
        hazmat: !!category.Hazmat,
        heavyWeight: !!category['Heavy Weight'],
        ...(specialInstructions.trim() ? { specialInstructions } : {}),
        // plural — matches the v3 doc sample and `specialInstructions`
        ...(deliveryInstructions.trim() ? { deliveryInstructions } : {}),
        packageDetails,
        ...(skuDetails.length ? { skuDetails } : {}),
      },
      carrier: { code: carrier },
      shipFrom: { ...addr(shipFrom, 'from', fromIsFacility),
        ...(facilityOf(shipFrom, fromIsFacility) ? { originFacilityCode: facilityOf(shipFrom, fromIsFacility) } : {}),
        ...(winStart(shipFrom) ? { pickupStartDateTime: winStart(shipFrom) } : {}),
        ...(winEnd(shipFrom) ? { pickupEndDateTime: winEnd(shipFrom) } : {}) },
      shipTo: { ...addr(shipTo, 'to', toIsFacility),
        ...(facilityOf(shipTo, toIsFacility) ? { destinationFacilityCode: facilityOf(shipTo, toIsFacility) } : {}),
        ...(winStart(shipTo) ? { deliveryStartDateTime: winStart(shipTo) } : {}),
        ...(winEnd(shipTo) ? { deliveryEndDateTime: winEnd(shipTo) } : {}) },
      ...(rtoMode !== 'Same As Ship From'
        ? { returnTo: { ...addr(rtoAddress, 'rto', true),
            ...(facilityOf(rtoAddress, true) ? { returnFacilityCode: facilityOf(rtoAddress, true) } : {}) } }
        : {}),
    }
  }

  const submit = async () => {
    if (!canSubmit) {
      setShowErrors(true)
      const first = incompleteSections.find((s) => !s.done)
      if (first) {
        // single-page form — just scroll the first incomplete section into view
        setTimeout(() => document.getElementById(first.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60)
      }
      return
    }
    setSubmitting(true)
    setApiErrors([])
    try {
      const result = await createConsignmentV3(buildPayload())
      if (result.success) {
        toast.success(`Consignment ${result.consignmentNumber ?? result.referenceNumber} created successfully.`)
        navigate('/console/order-management/consignment-order')
      } else {
        // the toast carries the REAL error text; the banner keeps the full list
        setApiErrors(result.errors)
        toast.error(result.errors.slice(0, 2).join(' • ') + (result.errors.length > 2 ? ` (+${result.errors.length - 2} more)` : ''))
        window.scrollTo({ top: 0, behavior: 'smooth' })
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setApiErrors([msg])
      toast.error(msg)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fe-nueva">
      {/* back chevron lives in the app header beside the title; the mode toggle
          rides the header's page-actions slot so the form starts at its content */}
      <HeaderActions>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <button type="button" onClick={() => (builderOpen ? closeBuilder() : openBuilder())}
              title="Configure which fields appear and in what order"
              className="inline-flex items-center gap-1.5 rounded-md border border-warm-300 bg-surface px-3 py-1.5 text-[12.5px] font-bold text-ink-2 hover:bg-warm-50">
              <SlidersHorizontal size={14} /> Form Builder
            </button>
          )}
          <div className="flex rounded-md border border-line bg-surface p-0.5">
            {(['simplified', 'full'] as const).map((m) => (
              <button key={m} type="button" onClick={() => setFormMode(m)}
                className={`rounded px-3 py-1.5 text-[12.5px] font-bold transition-colors
                  ${formMode === m ? 'bg-brand-50 text-brand-500' : 'text-ink-3 hover:text-ink'}`}>
                {m === 'simplified' ? 'Simplified' : 'Full Form'}
              </button>
            ))}
          </div>
        </div>
      </HeaderActions>

      <div className="flex items-start">
        {isAdmin && builderOpen && (
          <aside className="sticky top-0 self-start h-[calc(100vh-64px)] w-[360px] shrink-0 overflow-hidden border-r border-line bg-surface">
            <FormBuilderDrawer open onClose={closeBuilder} cfg={fieldCfg} onChange={applyFieldCfg}
              onReset={() => setFieldCfg(resetFieldConfig())} behavior={behavior} />
          </aside>
        )}
        <div className={`min-w-0 flex-1 pb-24 ${builderOpen ? 'px-5' : ''}`}>

      {/* error/success surface at the TOP — rejection banner sits above the
          stepper; success/error toasts are already top-center */}
      {apiErrors.length > 0 && (
        <div className="mb-4 rounded-lg border border-danger-fg/30 bg-danger-bg px-4 py-3">
          <div className="mb-1 flex items-center gap-2 text-[13px] font-bold text-danger-fg">
            <AlertCircle size={15} />The consignment API rejected this submission
          </div>
          <ul className="max-h-28 space-y-0.5 overflow-auto text-[12.5px] text-danger-fg/90">
            {apiErrors.map((e, i) => <li key={i}>• {e}</li>)}
          </ul>
        </div>
      )}
      <div className={`grid min-w-0 gap-5 ${formMode === 'simplified' ? 'mx-auto max-w-[1100px]' : ''}`}>
          {<>
          {/* ------------------------------------------------------ consignment */}
          <SectionCard
            id="sec-consignment"
            title="Consignment Details"
            icon={<ClipboardList size={15} className="text-brand-500" />}
            done={consignmentReq.every(Boolean)}
            caption="Provide the consignment details to ensure accurate processing, routing, and billing of the shipment.">
            <SubHead label="Identifiers" first />
            <Grid>
              {idPref !== 'referenceNumber' && (
              <Fld label={lbl('orderNumber')} required
                error={fieldError('orderNumber', !effectiveOrder.trim())}
                onTouch={() => markTouched('orderNumber')}
                helper={idPref === 'orderNumber'
                  ? <p className="text-[12px] text-ink-3">{lbl('referenceNumber')} is copied from this.</p>
                  : undefined}>
                <Input value={orderNumber} placeholder="eg, ABC0001" onChange={setOrderNumber} />
              </Fld>
              )}
              {idPref !== 'orderNumber' && (
              <Fld label={lbl('referenceNumber')} required
                error={fieldError('referenceNumber', !effectiveReference.trim())}
                onTouch={() => markTouched('referenceNumber')}
                helper={idPref === 'both' ? (
                  <label className="flex cursor-pointer items-center gap-1.5 text-[12px] text-ink-3">
                    <input type="checkbox" checked={sameAsOrder} onChange={(e) => setSameAsOrder(e.target.checked)} />
                    Same as {lbl('orderNumber')}
                  </label>
                ) : <p className="text-[12px] text-ink-3">{lbl('orderNumber')} is copied from this.</p>}>
                <Input value={idPref === 'both' ? effectiveReference : referenceNumber} placeholder="eg, ABC0001" onChange={setReferenceNumber}
                  disabled={idPref === 'both' && sameAsOrder} />
              </Fld>
              )}
              {show('consignmentNumber') && (
                <Fld label={lbl('consignmentNumber')}>
                  <Input value={consignmentNumber} placeholder="eg, 0001" onChange={setConsignmentNumber} />
                </Fld>
              )}
              {show('exchangeOrderNumber') && consignmentType === 'Exchange' && (
                <Fld label={lbl('exchangeOrderNumber')}
                  helper={<p className="text-[12px] text-ink-3">Original order being exchanged</p>}>
                  <Input value={exchangeOrderNumber} placeholder="eg, ABC0000" onChange={setExchangeOrderNumber} />
                </Fld>
              )}
            </Grid>

            <SubHead label="Order" />
            <Grid>
              <Fld label={lbl('consignmentType')} required>
                <MenuSelect
                  value={consignmentType}
                  options={['Forward', 'Reverse', 'Exchange', 'Transfer', 'Service']}
                  onChange={setConsignmentType}
                />
              </Fld>

              {show('serviceType') && <Fld label={lbl('serviceType')}>
                <MenuSelect
                  value={serviceType} placeholder="eg, Service"
                  options={['Standard', 'Express', 'Service']} onChange={setServiceType}
                />
              </Fld>}
              {show('routingType') && routingTypeOptions.length > 0 && <Fld label={lbl('routingType')}>
                <MenuSelect
                  value={routingType} placeholder="Select Routing Type"
                  options={routingTypeOptions.map((o) => o.code)}
                  labels={(v) => routingTypeOptions.find((o) => o.code === v)?.name ?? v}
                  onChange={setRoutingType}
                />
              </Fld>}

              <Fld label={lbl('shipByDate')} required>
                <DateInput value={shipByDate} onChange={setShipByDate} />
              </Fld>
              {formMode === 'simplified' && show('addrWindow') && (
                <Fld label="Delivery Window">
                  <DateTimeRangeInput
                    startDate={shipTo.startDate} startTime={shipTo.startTime}
                    endDate={shipTo.endDate} endTime={shipTo.endTime}
                    placeholder="Select delivery window"
                    onApply={(w) => {
                      setTo('startDate', w.startDate); setTo('startTime', w.startTime)
                      setTo('endDate', w.endDate); setTo('endTime', w.endTime)
                    }}
                  />
                </Fld>
              )}
              <Fld label={lbl('merchant')} required
                error={fieldError('merchant', !merchant)}
                onTouch={() => markTouched('merchant')}>
                <MenuSelect
                  value={merchant} placeholder="Select merchant"
                  options={merchants.length
                    ? merchants.map((m) => String(m.code))
                    : ['Comfy Furniture', 'Best Buy', 'Freshly Grocery', 'Smart Gadgets', 'ELEX']}
                  labels={(v) => String(merchants.find((m) => String(m.code) === v)?.name ?? v)}
                  onChange={setMerchant}
                />
              </Fld>
              {show('tags') && <Fld label={lbl('tags')} info>
                <MultiSelect value={tags} options={tagOptions} creatable
                  placeholder="Pick from Tag Master or type your own" onChange={setTags} />
              </Fld>}
              {show('labelFormat') && <Fld label={lbl('labelFormat')}>
                <div className="inline-flex h-8 items-center overflow-hidden rounded-md border border-warm-300">
                  {(['PDF', 'ZPL'] as const).map((f) => {
                    const on = labelFormat === f
                    return (
                      <button
                        key={f} type="button" onClick={() => setLabelFormat(f)}
                        className={`h-full whitespace-nowrap border-r border-warm-300 px-4 text-[13px] transition-colors last:border-r-0
                          ${on ? 'bg-brand-50 font-bold text-brand-500' : 'bg-surface text-ink-2 hover:bg-warm-50'}`}>
                        {f}
                      </button>
                    )
                  })}
                </div>
              </Fld>}
            </Grid>

            {(show('paymentMode') || show('orderAmount')) && (
              <>
                <SubHead label="Payment" />
                <Grid>
                  {show('paymentMode') && <Fld label={lbl('paymentMode')}>
                    <MenuSelect
                      value={paymentMode} placeholder="eg, Prepaid"
                      options={['Prepaid', 'COD', 'To Pay']} onChange={setPaymentMode}
                    />
                  </Fld>}
                  {show('orderAmount') && <Fld label={lbl('orderAmount')}
                    helper={paymentMode ? undefined : <p className="text-[12px] text-ink-3">Collected per {lbl('paymentMode')}</p>}>
                    <Input type="number" value={orderAmount} placeholder="eg, 100.22" onChange={setOrderAmount} />
                  </Fld>}
                </Grid>
              </>
            )}

            {/* handling toggles + consignment category — ONE section, but the two
                chip families keep their own labeled rows so they never blur */}
            <SubHead label="Handling & category" />
            <div className="grid gap-3">
              {handlingShown && (
              <div className="flex items-start gap-4">
                <span className="w-20 shrink-0 pt-2 text-[11px] font-bold uppercase tracking-[0.06em] text-ink-3">Handling</span>
                <div className="flex flex-wrap items-center gap-3">
                  {show('schedulingConfirmation') && <ChipToggle icon={CalendarCheck} label={lbl('schedulingConfirmation')} checked={schedulingConfirmation} onChange={setSchedulingConfirmation} />}
                  {show('clearanceRequired') && <ChipToggle icon={FileCheck} label={lbl('clearanceRequired')} checked={clearanceRequired} onChange={setClearanceRequired} />}
                  {show('scannable') && <ChipToggle icon={ScanLine} label={lbl('scannable')} checked={scannable} onChange={setScannable} />}
                  {show('splittable') && <ChipToggle icon={Split} label={lbl('splittable')} checked={splittable} onChange={setSplittable} />}
                  {show('dedicateTruck') && <ChipToggle icon={Truck} label={lbl('dedicateTruck')} checked={dedicateTruck} onChange={setDedicateTruck} />}
                  {show('totalLoadingTime') && dedicateTruck && (
                    <span className="flex items-center gap-1.5 text-[12.5px] text-ink-3">
                      loading time
                      <input
                        type="number" value={totalLoadingTime} placeholder="min"
                        onChange={(e) => setTotalLoadingTime(e.target.value)}
                        className="h-8 w-20 rounded-md border border-warm-300 bg-surface px-2 text-[12.5px] text-ink"
                      />
                    </span>
                  )}
                </div>
              </div>
              )}
              <div className={`flex items-start gap-4 ${handlingShown ? 'border-t border-line/70 pt-3' : ''}`}>
                <span className="w-20 shrink-0 pt-2 text-[11px] font-bold uppercase tracking-[0.06em] text-ink-3">Category</span>
                <div className="flex flex-wrap items-center gap-3">
                  {CATEGORY.map((c) => {
                    const on = !!category[c]
                    const Icon = CATEGORY_ICON[c]
                    return (
                      <div key={c} className="flex items-center gap-2.5">
                        <ChipToggle icon={Icon} label={c} checked={on}
                          onChange={(v) => setCategory((p) => ({ ...p, [c]: v }))} />
                        {c === '4 Person' && on && (
                          <span className="flex items-center gap-1.5 text-[12.5px] text-ink-3">
                            service time
                            <input
                              type="number" value={fourPersonServiceTime} placeholder="min"
                              onChange={(e) => setFourPersonServiceTime(e.target.value)}
                              className="h-8 w-16 rounded-md border border-warm-300 bg-surface px-2 text-[12.5px] text-ink"
                            />
                          </span>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>

            {(show('specialInstructions') || show('deliveryInstructions')) && (
              <>
                <SubHead label="Instructions" />
                <div className="grid grid-cols-1 gap-x-6 gap-y-4 md:grid-cols-2">
                  {show('specialInstructions') && <Fld label={lbl('specialInstructions')}>
                    <textarea
                      rows={3} value={specialInstructions} placeholder="Handling notes visible to operations"
                      onChange={(e) => setSpecialInstructions(e.target.value)}
                      className="w-full rounded-md border border-warm-300 bg-surface px-3 py-2 text-[13px] text-ink
                                 placeholder:text-warm-400 transition-shadow focus:border-brand-500 focus:ring-[3px] focus:ring-brand-500/20"
                    />
                  </Fld>}
                  {show('deliveryInstructions') && <Fld label={lbl('deliveryInstructions')}>
                    <textarea
                      rows={3} value={deliveryInstructions} placeholder="Instructions for the driver at the door"
                      onChange={(e) => setDeliveryInstructions(e.target.value)}
                      className="w-full rounded-md border border-warm-300 bg-surface px-3 py-2 text-[13px] text-ink
                                 placeholder:text-warm-400 transition-shadow focus:border-brand-500 focus:ring-[3px] focus:ring-brand-500/20"
                    />
                  </Fld>}
                </div>
              </>
            )}
          </SectionCard>

          </>}

          {(
          /* ship from / RTO / ship to — simplified pairs From & To side by side
              like a courier quick-ship form; full form keeps the stacked order */
          <div className={formMode === 'simplified' ? 'grid min-w-0 items-start gap-5 lg:grid-cols-2' : 'contents'}>
          <SectionCard
            id="sec-ship-from"
            className={formMode === 'simplified' ? 'lg:order-1' : ''}
            eyebrow="Ship From"
            title={L.shipFrom.entity}
            entity={L.shipFrom.entity}
            done={fromReq.every(Boolean)}
            caption={FROM_CAPTION[L.shipFrom.entity]}>
            <AddressFields
              value={shipFrom} onChange={setFrom} labels={L.shipFrom}
              fieldError={fieldError} markTouched={markTouched} prefix="from"
              requiredContact={false} extras compact={formMode === 'simplified'}
              codeOptions={hubCodes} codeLabel={hubLabel}
              onPickCode={fillFromHub(setShipFrom)} countries={countries} visible={show}
            />
          </SectionCard>

          {/* --------------------------------------------------------------- RTO */}
          <SectionCard
            id="sec-rto"
            className={formMode === 'simplified' ? 'lg:order-3 lg:col-span-2' : ''}
            title="Return To Origin (RTO)"
            icon={<Undo2 size={15} className="text-brand-500" />}
            done={rtoReq.every(Boolean)}
            caption="Provide the return-to-origin address and contact details for this consignment.">
            <Segmented
              options={['Same As Ship From', 'Use Different Address']}
              value={rtoMode} onChange={setRtoMode}
            />
            {rtoMode === 'Use Different Address' && (
              <div className="mt-5">
                <AddressFields
                  value={rtoAddress} onChange={setRto}
                  fieldError={fieldError} markTouched={markTouched} prefix="rto"
                  requiredContact={false} compact={formMode === 'simplified'}
                  codeOptions={hubCodes} codeLabel={hubLabel}
                  onPickCode={fillFromHub(setRtoAddress)} countries={countries} visible={show}
                />
              </div>
            )}
          </SectionCard>

          {/* ----------------------------------------------------------- ship to */}
          <SectionCard
            id="sec-ship-to"
            className={formMode === 'simplified' ? 'lg:order-2' : ''}
            eyebrow="Ship To"
            title={L.shipTo.entity}
            entity={L.shipTo.entity}
            done={toReq.every(Boolean)}
            caption={TO_CAPTION[L.shipTo.entity]}>
            <Segmented
              options={['Home Delivery', 'PUDO/Locker']}
              value={deliveryMode} onChange={setDeliveryMode}
            />
            <div className="mt-5">
              <AddressFields
                value={shipTo} onChange={setTo} labels={L.shipTo}
                fieldError={fieldError} markTouched={markTouched} prefix="to"
                requiredContact extras compact={formMode === 'simplified'}
                codeOptions={toCodes} codeLabel={toLabel}
                onPickCode={pickShipTo} countries={countries} visible={show}
              />
            </div>
          </SectionCard>
          </div>
          )}

          {<>
          {/* --------------- repeatable lists (SKU + Package live in BOTH forms) */}
          <div id="sec-sku" className="scroll-mt-20">
            <RepeatableList
              title="SKU" addNoun="SKU"
              icon={<Barcode size={15} className="text-brand-500" />}
              caption="Provide the SKU details for this consignment to ensures precise tracking, billing, and handling of items."
              cardLabel={(i) => `SKU ${i + 1}`}
              rows={skus} incomplete={skuIncomplete} summary={SkuSummary}
              onAdd={() => setSkus((p) => [...p, newSku()])}
              onRemove={(i) => setSkus((p) => p.filter((_, j) => j !== i))}
              body={(row, i) => (
                <SkuBody
                  row={row} master={skuMaster} hidden={(k) => !show(k)}
                  onChange={(k, v) => setSkus((p) => p.map((r, j) => (j === i ? { ...r, [k]: v } : r)))}
                />
              )}
              totals={skus.length > 0 ? <SkuTotals rows={skus} /> : undefined}
            />
          </div>

          <div id="sec-package" className="scroll-mt-20">
            <PackageBoxes
              rows={packages} skuInfo={packInfo} units={units} packageTypes={packageTypes}
              hidden={(k) => !show(k)}
              caption="Provide the package details for this consignment to ensure precise tracking, billing, and handling of items."
              onAdd={() => setPackages((p) => [...p, newPackage()])}
              onRemove={(i) => setPackages((p) => p.filter((_, j) => j !== i))}
              onDuplicate={(i) => setPackages((p) => [...p, {
                ...p[i],
                packageId: newPackage().packageId,
                trackingNumber: '',
                contents: p[i].contents.map((c) => ({ ...c })),
              }])}
              onChange={(i, k, v) => setPackages((p) => p.map((r, j) => (j === i ? { ...r, [k]: v } : r)))}
              onContents={(i, contents) => setPackages((p) => p.map((r, j) => (j === i ? { ...r, contents } : r)))}
            />
          </div>

          {formMode === 'full' && (
          <div id="sec-vas" className="scroll-mt-20">
            <RepeatableList
              title="Value Added Services" addNoun="Service"
              icon={<Wrench size={15} className="text-brand-500" />}
              caption="Provide the value-added services for this consignment to ensure that the job is assigned with the right capabilities and resources."
              cardLabel={(i) => `VAS ${i + 1}`}
              rows={vas} incomplete={vasIncomplete} summary={VasSummary}
              onAdd={() => setVas((p) => [...p, newVas()])}
              onRemove={(i) => setVas((p) => p.filter((_, j) => j !== i))}
              body={(row, i) => (
                <VasBody
                  row={row} skuOptions={skuOptions} services={vasServices}
                  onChange={(k, v) => setVas((p) => p.map((r, j) => (j === i ? { ...r, [k]: v } : r)))}
                />
              )}
            />
          </div>
          )}
          {/* --------------------------------------------- carrier (required) */}
          <SectionCard id="sec-carriers" title="Carriers" count={carrierOptions.length}
            icon={<Truck size={15} className="text-brand-500" />}
            done={!!carrier}
            caption="Pick the carrier that will run this consignment — nothing is preselected.">
            <div className="rounded-lg border border-line p-5">
              <div className="flex flex-wrap gap-4">
                {carrierOptions.map((c) => {
                  const on = carrier === c
                  return (
                    <button
                      key={c} type="button" onClick={() => setCarrier(c)}
                      className={`flex items-center gap-2.5 rounded-md border bg-surface px-4 py-3 text-[14px] transition-colors
                        ${on ? 'border-brand-500 text-ink' : 'border-line text-ink-2 hover:border-warm-300'}`}>
                      {on
                        ? <CircleDot size={15} className="text-brand-500" />
                        : <span className="h-[15px] w-[15px] rounded-full border border-warm-300" />}
                      {c}
                    </button>
                  )
                })}
              </div>
              {showErrors && !carrier && (
                <p className="mt-3 text-[12.5px] text-brand-500">Select a carrier to create the consignment.</p>
              )}
            </div>
          </SectionCard>
          </>}
      </div>
        </div>
      </div>


      {/* ---------------------------------------------------------- footer bar */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface">
        <div className={`flex items-center justify-between gap-3 px-6 py-3.5 ${builderOpen ? 'md:pl-[416px]' : 'md:pl-[268px]'}`}>
          <div className="flex items-center gap-4">
            <div className="hidden items-center gap-2.5 sm:flex" title={`${allReq.filter(Boolean).length} of ${allReq.length} required fields filled`}>
              <span className="h-1.5 w-28 overflow-hidden rounded-full bg-warm-100">
                <span
                  className="block h-full rounded-full bg-success-fg transition-all"
                  style={{ width: `${Math.round((allReq.filter(Boolean).length / allReq.length) * 100)}%` }}
                />
              </span>
              <span className="whitespace-nowrap text-[12px] tabular-nums text-ink-3">
                {allReq.filter(Boolean).length}/{allReq.length} required
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            {showErrors && !canSubmit && (
              <span className="text-[13px] text-brand-500">
                {missingCount} required field{missingCount === 1 ? '' : 's'} remaining
              </span>
            )}
            <Button onClick={submit} disabled={submitting}>{submitting ? 'Creating…' : 'Add Consignment'}</Button>
          </div>
        </div>
      </div>

    </div>
  )
}

/* ------------------------------------------------------------------- pieces ---- */

function SectionCard({ id, eyebrow, title, entity, icon, done, caption, count, action, className = '', children }: {
  id?: string; eyebrow?: string; title: string; entity?: string; done?: boolean
  caption?: string; count?: number; className?: string
  /** small brand-tinted icon shown before the title (entity, when set, wins) */
  icon?: React.ReactNode
  action?: React.ReactNode; children?: React.ReactNode
}) {
  const EntityIcon = entity ? ENTITY_ICON[entity] : undefined
  return (
    <section id={id} className={`scroll-mt-20 rounded-xl border border-line bg-surface shadow-ds-1 overflow-hidden transition-all hover:border-warm-300 ${className}`}>
      <div className="flex items-start justify-between gap-4 px-6 py-3.5 border-b border-line">
        <div>
          {eyebrow && (
            <p className="mb-0.5 text-[10.5px] font-black uppercase tracking-[0.08em] text-ink-3">{eyebrow}</p>
          )}
          <h2 className="flex items-center gap-2 text-[14.5px] font-bold text-ink">
            {EntityIcon ? <EntityIcon size={15} className="text-brand-500" /> : icon}
            {title}
            {count !== undefined && <span className="text-[13.5px] font-normal text-ink-3">{count}</span>}
            {done && <CheckCircle2 size={15} className="text-success-fg" />}
          </h2>
          {caption && <p className="mt-0.5 max-w-[92ch] text-[12.5px] text-ink-3">{caption}</p>}
        </div>
        {action}
      </div>
      {children && <div className="px-6 py-5">{children}</div>}
    </section>
  )
}

function Grid({ children, compact }: { children: React.ReactNode; compact?: boolean }) {
  return (
    <div className={`grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2 ${compact ? '' : 'xl:grid-cols-4'}`}>
      {children}
    </div>
  )
}

/**
 * Uniform field anatomy so every control in a grid row sits on the same line:
 * fixed-height single-line label (truncates, full text on hover) → control →
 * helper/error underneath, never pushing neighbours out of alignment.
 */
function Fld({ label, required, info, error, helper, onTouch, children }: {
  label: string; required?: boolean; info?: boolean; error?: boolean
  helper?: React.ReactNode; onTouch?: () => void; children: React.ReactNode
}) {
  return (
    <div className="min-w-0" onBlurCapture={onTouch}>
      <label className="mb-1.5 flex h-5 items-center gap-1 whitespace-nowrap text-[13px] font-bold text-ink" title={label}>
        <span className="truncate">{label}</span>
        {required && <span className="shrink-0 text-brand-500">*</span>}
        {info && <Info size={12} className="shrink-0 text-brand-500" />}
      </label>
      {children}
      {helper && <div className="mt-1">{helper}</div>}
      {required && error && (
        <p className="mt-1 text-[12.5px] text-brand-500">Required field.</p>
      )}
    </div>
  )
}

/** Icon chip that toggles on click — the selected state is the highlight. */
function ChipToggle({ icon: Icon, label, checked, onChange }: {
  icon: React.ComponentType<{ size?: number | string; className?: string }>
  label: string; checked: boolean; onChange: (v: boolean) => void
}) {
  return (
    <button
      type="button" aria-pressed={checked} onClick={() => onChange(!checked)}
      className={`flex items-center gap-2 rounded-md border px-3.5 py-2 text-[13px] transition-colors
        ${checked
          ? 'border-brand-500 bg-brand-50/60 font-bold text-brand-500'
          : 'border-line bg-surface text-ink-2 hover:border-warm-300 hover:text-ink'}`}>
      <Icon size={15} className={checked ? 'text-brand-500' : 'text-warm-400'} />
      {label}
    </button>
  )
}

/** Toggle with the same label-over-control anatomy as Fld — keeps rows level. */
function InlineToggle({ label, checked, onChange }: {
  label: string; checked: boolean; onChange: (v: boolean) => void
}) {
  return (
    <div className="min-w-0">
      <span className="mb-1.5 flex h-5 items-center whitespace-nowrap text-[13px] font-bold text-ink" title={label}>
        <span className="truncate">{label}</span>
      </span>
      <div className="flex h-8 items-center">
        <Toggle checked={checked} onChange={onChange} />
      </div>
    </div>
  )
}

/** Thin uppercase group divider inside a section card. */
function SubHead({ label, first }: { label: string; first?: boolean }) {
  return (
    <div className={`${first ? '' : 'mt-6'} mb-3 flex items-center gap-3`}>
      <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-ink-3">{label}</span>
      <span className="h-px flex-1 bg-line" />
    </div>
  )
}

function Segmented({ options, value, onChange }: {
  options: string[]; value: string; onChange: (v: string) => void
}) {
  return (
    <div className="flex flex-wrap gap-3">
      {options.map((o) => {
        const on = o === value
        return (
          <button
            key={o} type="button" onClick={() => onChange(o)}
            className={`flex items-center gap-2.5 rounded-md border px-4 py-2.5 text-[14px] transition-colors
              ${on
                ? 'border-brand-500 bg-brand-50/60 text-ink'
                : 'border-line bg-surface text-ink-2 hover:text-ink'}`}>
            {on
              ? <CircleDot size={15} className="text-brand-500" />
              : <CircleDot size={15} className="text-warm-400" />}
            {o}
          </button>
        )
      })}
    </div>
  )
}

/**
 * Shared address block for Ship From / RTO / Ship To.
 *
 * When `labels` is provided, field names follow the context matrix
 * ("Origin Facility Name", "Customer Pincode", …) and the window row is shown
 * or hidden per context. Without `labels` (the RTO block) the neutral names
 * from the original replica are used.
 */
function AddressFields({ value, onChange, labels, fieldError, markTouched, prefix, requiredContact, extras, compact, codeOptions = [], codeLabel, onPickCode, countries = [], visible = () => true }: {
  value: AddressForm
  onChange: (k: keyof AddressForm, v: string | boolean) => void
  labels?: PartySideLabels
  fieldError: (key: string, invalid: boolean) => boolean
  markTouched: (key: string) => void
  prefix: string
  requiredContact?: boolean
  extras?: boolean
  /** 2-column grid — for the simplified form's side-by-side From/To cards */
  compact?: boolean
  /** live location/facility codes for this side (staging: facilities for Ship
   * From/RTO, the merchant's customer/PUDO locations for Ship To) */
  codeOptions?: string[]
  codeLabel?: (v: string) => string
  /** picking a code auto-fills the card from the location's master record */
  onPickCode?: (v: string) => void
  countries?: { value: string; label: string }[]
  /** Base Modules field visibility (registry keys, addr* group keys) */
  visible?: (key: string) => boolean
}) {
  const e = labels?.entity
  const lbl = (contextual: string, neutral: string) => (e ? `${e} ${contextual}` : neutral)
  const k = (name: string) => `${prefix}.${name}`
  const windowLabel = (labels ? labels.window : 'Window') ?? (prefix === 'from' ? 'Pickup Window' : null)

  return (
    <>
      <SubHead label="Contact Details" first />
      <Grid compact={compact}>
        {/* address.code — the CLIENT location. On the non-hub side this is what
            generates the first-mile pickup leg; clearing it drops that leg. */}
        <Fld label="Location Code" helper="address.code — blank = no pickup leg">
          <MenuSelect
            value={value.locationCode} placeholder="Pick a location" searchable
            options={['', ...codeOptions]}
            labels={(v) => (v === '' ? '— None (no pickup leg) —' : codeLabel ? codeLabel(v) : v)}
            onChange={(v) => (v === '' ? onChange('locationCode', '') : onPickCode ? onPickCode(v) : onChange('locationCode', v))}
          />
        </Fld>
        {/* originFacilityCode / destinationFacilityCode / returnFacilityCode —
            the registered HUB. Independent of the location code above. */}
        <Fld label={labels ? labels.facilityCode : 'Facility / Hub Code'} helper="registered hub — drives mid-mile & last-mile">
          <MenuSelect
            value={value.facilityCode} placeholder="Pick a hub" searchable creatable
            options={['', ...codeOptions]}
            labels={(v) => (v === '' ? '— None —' : codeLabel ? codeLabel(v) : v)}
            onChange={(v) => onChange('facilityCode', v)}
          />
        </Fld>
        {!compact && visible('addrCompanyName') && <Fld label={lbl('Company Name', 'Company Name')}>
          <Input
            value={value.companyName} placeholder="eg, Random Company"
            onChange={(v) => onChange('companyName', v)}
          />
        </Fld>}
        <Fld label={lbl('Name', 'Name')} required
          error={fieldError(k('name'), !value.name.trim())}
          onTouch={() => markTouched(k('name'))}>
          <Input value={value.name} placeholder="eg, John Doe" onChange={(v) => onChange('name', v)} />
        </Fld>
        <div className="flex min-w-0 gap-3">
          <div className="w-[84px] shrink-0">
            <Fld label="Country Code">
              <MenuSelect
                value={value.countryCode} placeholder=" "
                options={['+1', '+44', '+61', '+91', '+31']}
                onChange={(v) => onChange('countryCode', v)}
              />
            </Fld>
          </div>
          <div className="min-w-0 flex-1">
            <Fld
              label={lbl('Contact Number', 'Contact Number')} required={requiredContact}
              error={!!requiredContact && fieldError(k('contactNumber'), !value.contactNumber.trim())}
              onTouch={() => markTouched(k('contactNumber'))}>
              <Input
                type="number" value={value.contactNumber} placeholder="eg, 1234567890"
                onChange={(v) => onChange('contactNumber', v)}
              />
            </Fld>
          </div>
        </div>

        {visible('addrEmail') && <Fld label="Email">
          <Input
            value={value.email} placeholder="eg, johndoe@xyz.com"
            onChange={(v) => onChange('email', v)}
          />
        </Fld>}
      </Grid>

      <SubHead label="Address Details" />
      <Grid compact={compact}>
        <Fld label={lbl('Address Line 1', 'Address Line 1')} required
          error={fieldError(k('line1'), !value.line1.trim())}
          onTouch={() => markTouched(k('line1'))}>
          <Input value={value.line1} placeholder="eg, Building No." onChange={(v) => onChange('line1', v)} />
        </Fld>
        {visible('addrLines23') && <>
        <Fld label={lbl('Address Line 2', 'Address Line 2')}>
          <Input value={value.line2} placeholder="eg, Street 1 A" onChange={(v) => onChange('line2', v)} />
        </Fld>
        <Fld label={lbl('Address Line 3', 'Address Line 3')}>
          <Input value={value.line3} placeholder="eg, Behind High School" onChange={(v) => onChange('line3', v)} />
        </Fld>
        </>}

        {!compact && visible('addrLandmark') && <Fld label={lbl('Landmark', 'Landmark')}>
          <Input
            value={value.landmark} placeholder="eg, Behind High School"
            onChange={(v) => onChange('landmark', v)}
          />
        </Fld>}
        <Fld label="Country" required
          error={fieldError(k('country'), !value.country)}
          onTouch={() => markTouched(k('country'))}>
          <MenuSelect
            value={value.country} placeholder="Select country" searchable
            options={countries.length ? countries.map((c) => c.value) : ['US', 'CA', 'GB', 'AU', 'IN', 'NL']}
            labels={(v) => countries.find((c) => c.value === v)?.label ?? v}
            onChange={(v) => onChange('country', v)}
          />
        </Fld>
        <Fld label={lbl('Pincode', 'Postal Code')}>
          <Input value={value.postalCode} placeholder="eg, 60601" onChange={(v) => onChange('postalCode', v)} />
        </Fld>
        {!compact && visible('addrSuburb') && <Fld label="Suburb / County">
          <Input value={value.county} placeholder="eg, Cook" onChange={(v) => onChange('county', v)} />
        </Fld>}

        <Fld label={lbl('City', 'City')} required
          error={fieldError(k('city'), !value.city.trim())}
          onTouch={() => markTouched(k('city'))}>
          <Input value={value.city} placeholder="eg, Chicago" onChange={(v) => onChange('city', v)} />
        </Fld>
        <Fld label="State" required
          error={fieldError(k('state'), !value.state.trim())}
          onTouch={() => markTouched(k('state'))}>
          <Input value={value.state} placeholder="eg, IL" onChange={(v) => onChange('state', v)} />
        </Fld>
        {!compact && visible('addrCoordinates') && <>
        <Fld label="Latitude">
          <Input type="number" value={value.latitude} placeholder="eg, 41.8781" onChange={(v) => onChange('latitude', v)} />
        </Fld>
        <Fld label="Longitude">
          <Input type="number" value={value.longitude} placeholder="eg, -87.6298" onChange={(v) => onChange('longitude', v)} />
        </Fld>
        </>}

        {extras && !compact && visible('addrFloorLift') && (
          <>
            <Fld label="Floor Number">
              <Input value={value.floorNumber} placeholder="eg, 2" onChange={(v) => onChange('floorNumber', v)} />
            </Fld>
            <InlineToggle
              label="Lift Available" checked={value.liftAvailable}
              onChange={(v) => onChange('liftAvailable', v)}
            />
          </>
        )}
      </Grid>

      {/* window row — one range control (same calendar as the consignment
          filter), shown/hidden and named per the context matrix */}
      {windowLabel && !compact && visible('addrWindow') && (
        <>
        <SubHead label={windowLabel} />
        <div className="max-w-md">
          <DateTimeRangeInput
            startDate={value.startDate} startTime={value.startTime}
            endDate={value.endDate} endTime={value.endTime}
            placeholder={`Select ${windowLabel.toLowerCase()}`}
            onApply={(w) => {
              onChange('startDate', w.startDate); onChange('startTime', w.startTime)
              onChange('endDate', w.endDate); onChange('endTime', w.endTime)
            }}
          />
        </div>
        </>
      )}
    </>
  )
}
