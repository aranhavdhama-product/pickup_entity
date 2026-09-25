/**
 * Create Order — the Grow MERCHANT's order form (`/grow/orders/add`, `/add/vehicle`).
 * Spec: docs/superpowers/specs/2026-09-25-grow-merchant-order-form-design.md
 * (research: docs/superpowers/research/2026-09-25-grow-merchant-form-research.md).
 *
 * The console's Add Consignment (`AddOrderPage`, staging-exact) is the CARRIER's form. This
 * one asks the same fields minus Merchant (the signed-in merchant — header ⇄ — is recorded
 * silently), Carrier (the carrier allocates) and Order Category (ops), in a merchant layout:
 * one page, sections top to bottom — Pickup from · Deliver to (+ returns) · Order details ·
 * Packages · Handling & extras · Service Type (LAST: its cards and rates derive from the
 * origin → destination pair and the packages above) — beside a sticky Order summary rail.
 *
 * Same writes as before: an `OrderDraft` (parcel and full-vehicle shapes as AddOrderPage's
 * buildDraft) → sessionStorage → /grow/orders/checkout, or Save for later → Drafts.
 * Settings: hidden / relabelled / required fields from the consignment settings
 * (`fe-consignment-form-behavior`, Form Builder config); services from the Service Type
 * master; vehicles from Vehicle Config at the Ship From hub; pickup window rules from the
 * pickup module. Deep links: `?draft=`, `?fromPickup=`, `?fromOverage=`, `?step=1|2`
 * (+`&type=FTL`), `/add/vehicle` = Full vehicle preselected.
 */
import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { MapPin, Pencil, ScanBarcode, Trash2, Truck } from 'lucide-react'
import { blankParty } from '../../growOrders/seed'
import { growOrderActions, orderById, pickupRequestById, useGrowOrders } from '../../growOrders/store'
import type { Party, StoreLocation } from '../../growOrders/types'
import {
  currentMerchant, packageTypesForMerchant, useMasters, useMerchantCode, vehicleTypesFor as mastersVehiclesFor,
} from '../../growOrders/masters'
import { hubVehicleTypes } from '../../config/vehicleConfig'
import { usePickupModuleConfig } from '../../config/pickupModule'
import { pickupPolicy, policyCheck, userWindowError } from '../../growOrders/pickupSlots'
import { SlotWindowFields } from '../LocalPickup/slotFields'
import {
  ADDITIONAL_SERVICES, DRAFT_KEY, FTL_SERVICE_TYPES, VEHICLE_SPECS, clearDraftKeys, setDraftSidecar, vehiclesFor, vehiclesOf,
  type ConsignmentFields, type FtlVehicle, type OrderDraft, type Parcel, type VasLine,
} from '../../growOrders/draft'
import {
  bookableServices, chargeableKg, currencyForHub, laneReady, quoteLane, quoteService, shipFromHubOf, zoneParties, vasPrice, vehicleRate,
} from '../../growOrders/rates'
import { loadFieldConfig, loadFormBehavior, fieldHidden, fieldLabel, byKeyMandatory } from '../ConsignmentAdd/fieldConfig'
import { toast } from '../../nueva/toast'
import { DateInput, Input, MenuSelect, PageHeader } from '../../nueva/components'
import { hubName, inboundHubFor } from '../../growOrders/hubs'
import { usePickupLocations, useReceiverBook } from './pickupLocations'
import { OTHER_ADDRESS, money, partyLine, partyOk, prWindow, windowOk } from './utils'
import { AddBelow, Autocomplete, ChoiceCard, MField, MGrid, MSection, NumInput, SwitchRow, TEXTAREA } from './merchantFormBits'
import { PackageEditor } from './packageEditor'
import { CUSTOM_PACKAGE_NAME, isBlankItem, itemInfoOf, newPackageId, newParcel, packageReady } from './packageModel'
import { ServiceTypeSection, type BookingMode, type FleetVehicle } from './serviceCards'
import { OrderSummaryRail } from './orderSummaryRail'

/* ---- option lists (the console form's) ---- */
const CONSIGNMENT_TYPES = ['Forward', 'Reverse', 'Exchange', 'Transfer', 'Service']
const PAYMENT_MODES = ['Prepaid', 'COD', 'To Pay']
const LABEL_FORMATS = ['PDF', 'ZPL']
const RTO_SAME = 'Same As Ship From'
const RTO_OTHER = 'Use Different Address'
const VAS_LEVELS: VasLine['level'][] = ['CONSIGNMENT', 'PACKAGE', 'SKU']
const VAS_LEVEL_LABEL: Record<VasLine['level'], string> = { CONSIGNMENT: 'Whole order', PACKAGE: 'Each package', SKU: 'One item' }
const VAS_SERVICES = ['Installation', 'Assembly', 'Unboxing', 'Old Item Pickup', 'Gift Wrapping', 'Wall Mounting', ...ADDITIONAL_SERVICES.map((a) => a.code)]
/** the owner's plain-language hints under the handling switches (2026-09-24) */
const SWITCHES = [
  { key: 'scannable', field: 'scannable' as const, label: 'Barcode labels on boxes', hint: 'The boxes carry barcodes and get scanned along the way.' },
  { key: 'splittable', field: 'splittable' as const, label: 'Can be delivered in parts', hint: 'Packages may travel on different trips and arrive separately.' },
  { key: 'schedulingConfirmation', field: 'schedulingConfirmation' as const, label: 'Scheduling Confirmation Required', hint: 'Check the delivery time with the customer first.' },
  { key: 'clearanceRequired', field: 'clearanceRequired' as const, label: 'Clearance Required', hint: 'Needs customs or gate clearance before it can move.' },
]

const today = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const filled = (v: string | undefined | null) => !!(v ?? '').trim()
const codeFor = (p: Party) => (p.businessName || p.name || p.city || 'store')
  .toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 14) || 'STORE'
const jumpTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
const readSessionDraft = (): OrderDraft | null => {
  try { return JSON.parse(sessionStorage.getItem(DRAFT_KEY) || 'null') as OrderDraft | null } catch { return null }
}

/* ------------------------------------------------------------ address grid ---- */

type Kind = 'from' | 'to' | 'rto'
/** The address fields of one party, in the merchant grid. Required: name, line 1, city, state,
 *  country (+ contact for a delivery / return address); settings may require or hide the rest. */
function AddressFields({ party, set, kind, hid, need, err }: {
  party: Party; set: (p: Partial<Party>) => void; kind: Kind
  hid: (k: string) => boolean; need: (k: string) => boolean; err: (bad: boolean, msg?: string) => string | false
}) {
  const contactReq = kind !== 'from'
  const f = (key: keyof Party, label: string, required: boolean, placeholder = '', className = '') => (
    <MField label={label} required={required} className={className} error={err(required && !filled(party[key] as string))}>
      <Input value={(party[key] as string) ?? ''} placeholder={placeholder} onChange={(v) => set({ [key]: v } as Partial<Party>)} />
    </MField>
  )
  return (
    <MGrid>
      {f('name', kind === 'to' ? 'Receiver name' : 'Contact name', true, 'Full name')}
      {f('contactNumber', 'Phone', contactReq, 'e.g. 9171234567')}
      {!hid('addrEmail') && f('email', 'Email', need('addrEmail'), 'name@example.com')}
      {!hid('addrCompanyName') && f('businessName', 'Company', need('addrCompanyName'), 'Optional')}
      {f('line1', 'Address line 1', true, 'House / building, street', 'sm:col-span-2')}
      {!hid('addrLines23') && f('line2', 'Address line 2', need('addrLines23'), 'Barangay / area', 'sm:col-span-2')}
      {!hid('addrLandmark') && f('landmark', 'Landmark', need('addrLandmark'), 'Optional')}
      {!hid('addrSuburb') && f('county', 'Suburb / county', need('addrSuburb'), 'Optional')}
      {f('city', 'City', true)}
      {f('state', 'State / province', true)}
      {f('postalCode', 'Postal code', kind === 'rto')}
      {f('country', 'Country', true)}
      {kind === 'to' && !hid('addrFloorLift') && f('floorNumber', 'Floor number', need('addrFloorLift'), 'e.g. 3')}
    </MGrid>
  )
}

/* -------------------------------------------------------------------- page ---- */

export default function MerchantOrderForm() {
  const nav = useNavigate()
  const db = useGrowOrders()
  const masters = useMasters()
  const merchantCode = useMerchantCode()
  const merchant = currentMerchant(masters.merchants, merchantCode)
  const pickup = usePickupLocations(db.stores)
  const stores = pickup.stores
  const book = useReceiverBook(db.orders)
  const pickupCfg = usePickupModuleConfig()
  const packageTypes = useMemo(() => packageTypesForMerchant(masters.packageTypes, merchant?.code ?? null), [masters.packageTypes, merchant?.code])
  const { pathname } = useLocation()
  const [params] = useSearchParams()

  /* ---- deep links ---- */
  const jump = Math.min(2, Math.max(0, Number(params.get('step')) || 0))
  const draftId = params.get('draft')
  const pr = pickupRequestById(params.get('fromPickup'))
  const [ovPrId = '', ovId = ''] = (params.get('fromOverage') ?? '').split(':')
  const ovPr = pickupRequestById(ovPrId || null)
  const ovScan = ovPr?.overages.find((v) => v.id === ovId && !v.orderId)
  const fromOverage = ovPr && ovScan ? { pr: ovPr, scan: ovScan } : undefined
  /* a saved draft; else what checkout's "Back" left in the session (checkout clears it once the
     order exists, this form clears it on mount — so it is always the booking just left) */
  const [saved] = useState<OrderDraft | null>(() => (draftId ? orderById(draftId)?.draft ?? null
    : !fromOverage ? readSessionDraft() : null))
  const resumeId = draftId ?? saved?.orderId ?? null
  const ftlFirst = !fromOverage && (params.get('type') === 'FTL' || pathname.endsWith('/vehicle')
    || pr?.shipmentType === 'FTL' || saved?.shipmentType === 'FTL')
  const fromPr = pr && pr.shipmentType === 'FTL' ? pr : undefined
  const overageStore = fromOverage ? stores.find((s) => s.code === fromOverage.pr.storeCode) : undefined

  /* ---- the consignment settings: hides, relabels, required ---- */
  const [fieldCfg] = useState(loadFieldConfig)
  const [behavior] = useState(loadFormBehavior)
  /* 'full' — every field the account has not switched off (Grow has no tiers) */
  const hid = (key: string) => fieldHidden(key, fieldCfg, 'full', behavior)
  const lbl = (key: string) => fieldLabel(key, fieldCfg)
  const need = (key: string) => !hid(key) && (!!byKeyMandatory(key) || (behavior.required ?? []).includes(key))

  /* ---- Pickup from ---- */
  const firstSender = (): Party => saved?.sender ?? overageStore?.party
    ?? (pr ? pr.shipFrom ?? stores.find((s) => s.code === pr.storeCode)?.party ?? blankParty() : stores[0]?.party ?? blankParty())
  const storeOf = (p: Party) => stores.find((s) => s.party.name === p.name && s.party.line1 === p.line1)
    ?? db.stores.find((s) => s.party.name === p.name && s.party.line1 === p.line1)
  /* a pickup request's own window is the sender's pickup window */
  const [sender, setSender] = useState<Party>(() => {
    const p = firstSender()
    return pr && !saved && !p.windowStart ? { ...p, windowStart: pr.startAt, windowEnd: pr.endAt } : p
  })
  const [senderStore, setSenderStore] = useState(() => {
    const p = firstSender()
    const st = storeOf(p)
    if (st) return st.code
    if (partyOk(p)) return OTHER_ADDRESS
    return stores.length ? stores[0].code : OTHER_ADDRESS
  })
  const [editSender, setEditSender] = useState(false)
  const [saveSender, setSaveSender] = useState(false)
  const fromList = senderStore !== OTHER_ADDRESS

  /* ---- Deliver to (+ extra drops) + returns ---- */
  const [receiver, setReceiver] = useState<Party>(() => saved?.receiver
    ?? (pr ? pr.shipTo ?? blankParty() : jump ? { ...blankParty(), ...db.orders[2]?.receiver } : blankParty()))
  const [drops, setDrops] = useState<Party[]>(() => saved?.drops ?? [])
  const [rto, setRto] = useState<Party>(() => saved?.consignment?.rto ?? blankParty())
  const [bookQ, setBookQ] = useState('')

  /* ---- order details, handling, VAS ---- */
  const [c, setCState] = useState<ConsignmentFields>(() => {
    const qa = jump && !saved ? `QA${Date.now().toString(36).toUpperCase().slice(-8)}` : ''
    return {
      orderNumber: qa, referenceNumber: qa, consignmentNumber: '', exchangeOrderNumber: '',
      consignmentType: 'Forward', task: 'Delivery', shipByDate: today(), tags: [], labelFormat: '', paymentMode: '', orderAmount: null,
      schedulingConfirmation: false, dedicateTruck: ftlFirst, totalLoadingTime: null, clearanceRequired: false, scannable: false,
      splittable: false, specialInstructions: '', rtoMode: RTO_SAME, vas: [],
      ...saved?.consignment,
      ...(saved && !saved.consignment?.vas?.length && saved.additionalServices?.length
        ? { vas: saved.additionalServices.map((sv) => ({ level: 'CONSIGNMENT' as const, skuCode: '', service: sv, serviceTimeMin: 0, remark: '' })) } : {}),
    }
  })
  const setC = (patch: Partial<ConsignmentFields>) => setCState((x) => ({ ...x, ...patch }))
  const [instructions] = useState(saved?.instructions ?? '')

  /* ---- packages ---- */
  const [parcels, setParcels] = useState<Parcel[]>(() => {
    const src = saved?.shipmentType === 'FTL' ? saved.sourceParcels : saved?.parcels
    if (src?.length) return src.map((p) => ({ ...p, packageId: p.packageId || newPackageId() }))
    const p = newParcel()
    if (fromOverage) {
      const w = fromOverage.scan.weightKg
      return [{ ...p, weight: w ?? 0, weightMode: w ? 'manual' : 'auto', trackingNumber: fromOverage.scan.barcode }]
    }
    /* an FTL pickup request already says what the vehicle carries */
    if (fromPr?.expectedWeightKg) return [{ ...p, weight: fromPr.expectedWeightKg, weightMode: 'manual', itemInfo: fromPr.number }]
    return [jump ? { ...p, weight: 2.5, l: 30, w: 20, h: 15, weightMode: 'manual' } : p]
  })

  /* ---- service & vehicles ---- */
  /* no load type until the merchant picks one (owner, 2026-09-25) — except where it is explicit:
     /add/vehicle, ?type=FTL, an FTL pickup request or draft (Full); an overage scan, a parcel draft,
     the ?step QA shortcut (Shared) */
  const [mode, setMode] = useState<BookingMode | null>(ftlFirst ? 'ftl' : fromOverage || saved || jump ? 'ltl' : null)
  const lm: BookingMode = mode ?? 'ltl'
  const [service, setService] = useState<string>(() => saved?.shipmentType === 'FTL' ? saved.ftlServiceType || saved.service
    : saved?.service ?? pr?.ftlServiceType ?? '')
  const [counts, setCounts] = useState<Record<string, number>>(() => {
    const vs = saved?.shipmentType === 'FTL' ? vehiclesOf(saved)
      : fromPr ? vehiclesOf({ vehicleType: fromPr.vehicleType, vehicleUnit: fromPr.vehicleUnit, actualLoad: fromPr.expectedWeightKg, drops: [] }) : []
    const out: Record<string, number> = {}
    for (const v of vs) if (v.vehicleType) out[v.vehicleType] = (out[v.vehicleType] ?? 0) + 1
    return out
  })
  const [showErrors, setShowErrors] = useState(false)

  /* ---- derived: the lane ---- */
  const allDrops = [receiver, ...drops]
  const hub = useMemo(() => shipFromHubOf(fromList ? senderStore : null, sender), [fromList, senderStore, sender])
  const currency = currencyForHub(hub, sender)
  const weights = chargeableKg(parcels)
  const boxes = parcels.reduce((n, p) => n + (p.quantity || 0), 0)
  const vasNames = (c.vas ?? []).map((v) => v.service).filter(Boolean)
  const vasKey = vasNames.join('|')
  const services = useMemo(() => bookableServices(), [])
  const serviceHidden = hid('serviceType')
  const offered = useMemo(() => (serviceHidden
    ? services.filter((s) => s.loadType === 'both' || s.loadType === lm).slice(0, 1)
    : services), [serviceHidden, services, lm])
  const laneOk = laneReady(sender) && allDrops.every(laneReady)
  const weightOk = parcels.length > 0 && parcels.every(packageReady)
  const ready = laneOk && weightOk
  const missing = [
    ...(laneReady(sender) ? [] : ['a pickup address']),
    ...(allDrops.every(laneReady) ? [] : ['a delivery address (street + city)']),
    ...(weightOk ? [] : ['a weight or size for every package']),
  ]

  /* the Ship From hub's fleet: Vehicle Config first, the masters' hub list next, then the service's catalogue */
  const fleet: FleetVehicle[] = useMemo(() => {
    if (!hub) return []
    const ftlCat = FTL_SERVICE_TYPES.find((t) => t.code === service)
    const fits = (name: string) => !ftlCat || ftlCat.vehicles.some((v) => name.startsWith(v))
    let list = hubVehicleTypes(hub).filter((v) => fits(v.name))
    if (!list.length) list = mastersVehiclesFor(masters.vehicleTypes, hub, service || null).filter((v) => fits(v.name))
    if (!list.length && ftlCat) list = vehiclesFor(ftlCat.code).map((v) => ({ code: v.type, name: v.type, payloadKg: v.payloadKg, capacity: v.capacity }))
    /* the rate of ONE such vehicle on this lane under this service (zone + service factor), else the plain hire */
    const one = (code: string) => (laneReady(sender) && laneReady(receiver) && service
      ? quoteService({ code: service, name: service }, { from: sender, to: receiver, parcels: [], mode: 'ftl', currency, vehicles: [{ vehicleType: code, actualLoadKg: 0, addressIdx: [0] }] }).net
      : vehicleRate(code, currency))
    /* the booking stores the CATALOGUE type ("8 Ton Truck"), as pickup requests, older drafts and every
       reader (vehicleSpec) expect; the card shows the hub's own name ("8 Ton Truck SANPABLO") */
    const catalogue = (name: string) => VEHICLE_SPECS.map((x) => x.type).filter((t) => name.startsWith(t)).sort((a, b) => b.length - a.length)[0] ?? name
    const seen = new Set<string>()
    return list.map((v) => ({ ...v, code: catalogue(v.name) })).filter((v) => (seen.has(v.code) ? false : (seen.add(v.code), true)))
      .map((v) => ({ code: v.code, name: v.name, payloadKg: v.payloadKg, capacity: v.capacity, rate: one(v.code) }))
  }, [hub, service, masters.vehicleTypes, currency, sender, receiver])
  const fleetNote = hub ? `Vehicles configured at ${hubName(hub, stores) || hub}. Rates per vehicle for this route.` : ''
  /* only vehicles the (new) hub / service still offers count */
  const vehicles: FtlVehicle[] = useMemo(() => {
    const chosen = fleet.flatMap((v) => Array.from({ length: counts[v.code] ?? 0 }, () => v.code))
    const per = chosen.length ? weights.chargeable / chosen.length : 0
    const addressIdx = allDrops.map((_, i) => i)
    return chosen.map((vehicleType) => ({ vehicleType, actualLoadKg: Math.round(per * 100) / 100, addressIdx }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fleet, counts, weights.chargeable, allDrops.length])
  const vehicleLine = [...new Set(vehicles.map((v) => v.vehicleType))]
    .map((t) => `${vehicles.filter((v) => v.vehicleType === t).length} × ${t}`).join(', ')

  const quotes = useMemo(() => (!mode ? [] : !ready
    /* not priced yet: the cards still show, with the service's own transit days and no rate */
    ? quoteLane({ ...zoneParties('local'), parcels: [], mode: lm, currency }, offered)
    : quoteLane({
    from: sender, to: receiver, drops, parcels, mode: lm, currency, vas: vasNames,
    /* a service card prices the vehicles picked so far — one of the fleet's first until then */
    vehicles: mode === 'ftl' ? (vehicles.length ? vehicles : fleet.slice(0, 1).map((v) => ({ vehicleType: v.code, actualLoadKg: weights.chargeable, addressIdx: [0] }))) : undefined,
  }, offered)),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [ready, sender, receiver, drops, parcels, mode, currency, vasKey, vehicles, fleet, offered])
  /* one eligible service = preselected; a service the lane / mode no longer offers is dropped */
  const selected = !ready ? '' : quotes.some((q) => q.code === service) ? service : quotes.length === 1 ? quotes[0].code : ''
  const quote = quotes.find((q) => q.code === selected) ?? null
  const ftlOk = mode !== 'ftl' || vehicles.length > 0

  /* ---- pickup window rules (pickup module: auto + "ask the shipper") ---- */
  const askWindow = pickupCfg.enabled && pickupCfg.mode === 'auto' && pickupCfg.autoPickup.userSelectsWindow
  /* the pickup calendar of (pickup location → drop hub), as every pickup dialog reads it */
  const pickupPol = useMemo(() => pickupPolicy(merchantCode, {
    pickupLocationCode: fromList ? senderStore : null, hubCode: laneReady(receiver) ? inboundHubFor(receiver) : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps -- pickupCfg: re-read when the module settings change
  }), [merchantCode, fromList, senderStore, receiver.city, receiver.state, pickupCfg])
  const slotOk = useMemo(() => {
    const rules = policyCheck(pickupPol)
    const now = new Date()
    return (w: { startAt: string; endAt: string }) => windowOk(w.startAt, w.endAt) && rules(w)
      && (!askWindow || !userWindowError(w.startAt, now, pickupPol, pickupCfg.autoPickup))
  }, [pickupPol, askWindow, pickupCfg.autoPickup])
  const windowErr = askWindow && sender.windowStart
    ? userWindowError(sender.windowStart, new Date(), pickupPol, pickupCfg.autoPickup) : null

  /* ---- masters settle after mount / the merchant switches: re-default the pickup address ---- */
  const listKey = useMemo(() => pickup.options.map((o) => o.value).join('|'), [pickup.options])
  const [autoKey, setAutoKey] = useState<string | null>(null)
  const dictated = !!(saved || pr || fromOverage)
  useEffect(() => {
    if (dictated || autoKey === listKey) return
    const next = stores[0]
    /* eslint-disable react-hooks/set-state-in-effect -- synchronising with the masters store, which settles after mount */
    setAutoKey(listKey)
    setSenderStore(next?.code ?? OTHER_ADDRESS)
    setSender(next ? { ...next.party, locationCode: next.code } : blankParty())
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [dictated, listKey, autoKey, stores])
  useEffect(() => { clearDraftKeys() }, [])
  useEffect(() => {
    if (!jump) return
    const t = setTimeout(() => document.getElementById(jump === 1 ? 'sec-packages' : 'sec-service')?.scrollIntoView({ block: 'start' }), 200)
    return () => clearTimeout(t)
  }, [jump])

  /* ------------------------------------------------------------ validation */
  const idPref = behavior.identifier
  const effectiveOrder = (idPref === 'referenceNumber' ? c.referenceNumber : c.orderNumber) ?? ''
  const effectiveRef = (idPref === 'orderNumber' ? c.orderNumber : c.referenceNumber) ?? ''
  const partyReq = (p: Party, kind: Kind) => [
    p.name, p.line1, p.city, p.state, p.country, ...(kind !== 'from' ? [p.contactNumber] : []), ...(kind === 'rto' ? [p.postalCode] : []),
    ...(need('addrEmail') ? [p.email] : []), ...(need('addrCompanyName') ? [p.businessName] : []), ...(need('addrLines23') ? [p.line2] : []),
    ...(need('addrLandmark') ? [p.landmark] : []), ...(need('addrSuburb') ? [p.county] : []),
    ...(kind === 'to' && need('addrFloorLift') ? [p.floorNumber] : []),
  ].map(filled)
  const windowReq = (p: Party) => (need('addrWindow') ? [filled(p.windowStart), filled(p.windowEnd)] : [])
  const doneOf: Record<string, boolean[]> = {
    'sec-from': [...partyReq(sender, 'from'), ...windowReq(sender), !windowErr],
    'sec-to': [...allDrops.flatMap((d) => [...partyReq(d, 'to'), ...windowReq(d)]),
      ...(c.rtoMode === RTO_OTHER ? partyReq(rto, 'rto') : [])],
    'sec-order': [filled(effectiveOrder), filled(effectiveRef), !!c.consignmentType, filled(c.shipByDate),
      ...(need('paymentMode') ? [filled(c.paymentMode)] : []),
      ...(need('orderAmount') && filled(c.paymentMode) ? [(c.orderAmount ?? 0) > 0] : []),
      ...(need('labelFormat') ? [filled(c.labelFormat)] : [])],
    'sec-packages': [...parcels.map(packageReady),
      ...parcels.flatMap((p) => [
        ...(need('pkgDimensions') ? [p.l > 0 && p.w > 0 && p.h > 0] : []),
        ...(need('pkgTracking') ? [filled(p.trackingNumber)] : []),
        ...(need('pkgDescription') ? [filled(p.description)] : []),
        ...(p.items ?? []).filter((it) => !isBlankItem(it)).flatMap((it) => [filled(it.name), ...(need('skuHsn') ? [filled(it.hsnCode)] : [])]),
      ])],
    'sec-handling': [...(need('specialInstructions') ? [filled(c.specialInstructions)] : []),
      ...(c.vas ?? []).map((v) => !!v.service && (v.level !== 'SKU' || !!v.skuCode))],
    'sec-service': [!!mode, !!quote, ftlOk],
  }
  const order = ['sec-from', 'sec-to', 'sec-order', 'sec-packages', 'sec-handling', 'sec-service']
  const problems = order.reduce((n, id) => n + doneOf[id].filter((x) => !x).length, 0)
  const done = (id: string) => doneOf[id].every(Boolean)
  const err = (bad: boolean, msg = 'Required.') => (showErrors && bad ? msg : false)

  /* ------------------------------------------------------------ mutations */
  const pickSender = (code: string) => {
    setEditSender(false)
    if (code === OTHER_ADDRESS) {
      setSenderStore(OTHER_ADDRESS)
      setSender((s) => (storeOf(s) ? blankParty() : s))
      return
    }
    const st = stores.find((s) => s.code === code) ?? db.stores.find((s) => s.code === code)
    if (!st) return
    setSenderStore(code)
    setSender((s) => ({ ...st.party, locationCode: code, windowStart: s.windowStart, windowEnd: s.windowEnd }))
  }
  const setDrop = (i: number, patch: Partial<Party>) => setDrops((ds) => ds.map((x, j) => (j === i ? { ...x, ...patch } : x)))
  const setVas = (i: number, patch: Partial<VasLine>) => setC({ vas: (c.vas ?? []).map((v, j) => (j === i ? { ...v, ...patch } : v)) })
  const skuOpts = useMemo(() => [...new Set(parcels.flatMap((p) => p.items ?? []).filter((it) => it.skuCode).map((it) => it.skuCode as string))], [parcels])
  const bookHits = useMemo(() => {
    const q = bookQ.trim().toLowerCase()
    return book.filter((e) => !q || [e.party.name, e.party.line1, e.party.city, e.party.businessName, e.party.contactNumber]
      .some((x) => (x ?? '').toLowerCase().includes(q))).slice(0, 8)
  }, [book, bookQ])
  /* a new load type swaps the card list and drops the chosen service */
  const changeMode = (m: BookingMode) => { if (m !== mode) setService(''); setMode(m); setC({ dedicateTruck: m === 'ftl' }) }
  const setCount = (code: string, n: number) => setCounts((cs) => ({ ...cs, [code]: n }))

  /* ---------------------------------------------------------- the draft */
  const draftStoreCode = fromList ? senderStore : pr?.storeCode ?? saved?.storeCode ?? stores[0]?.code ?? codeFor(sender)
  const buildDraft = (): OrderDraft => {
    const ftl = mode === 'ftl'
    const units = vehicles.length
    const actualLoad = vehicles.reduce((n, v) => n + v.actualLoadKg, 0)
    const svcCode = selected || service
    const cleanParcels = parcels.map((p) => ({ ...p, items: (p.items ?? []).filter((it) => !isBlankItem(it)), itemInfo: itemInfoOf(p) }))
    return {
      orderId: resumeId ?? undefined,
      storeCode: draftStoreCode,
      sender: fromList ? { ...sender, locationCode: senderStore } : sender,
      receiver, drops, shipmentType: ftl ? 'FTL' : 'Parcel',
      ...(ftl
        ? { vehicleType: vehicles[0]?.vehicleType ?? '', vehicleUnit: units, actualLoad, ftlServiceType: svcCode, vehicles, sourceParcels: cleanParcels }
        : { vehicleType: '', vehicleUnit: 0, actualLoad: 0 }),
      additionalServices: vasNames,
      /* a full vehicle keeps the one synthetic FTL line every reader expects (as AddOrderPage) */
      parcels: ftl
        ? [{ cargoType: 'FTL', itemInfo: [svcCode, ...vehicles.map((v) => v.vehicleType), ...vasNames].join(' · '), quantity: Math.max(1, units), weight: actualLoad / Math.max(1, units), l: 120, w: 100, h: 150 }]
        : cleanParcels,
      authority: saved?.authority || 'Leave at the door', instructions, secure: saved?.secure ?? false,
      service: svcCode, rate: quote?.net ?? 0, etaDays: quote?.days ?? 0, currency,
      consignment: {
        ...c,
        dedicateTruck: ftl,
        orderNumber: effectiveOrder.trim(), referenceNumber: effectiveRef.trim(),
        consignmentNumber: c.consignmentNumber?.trim() || effectiveRef.trim(),
        /* never a field on Grow: the signed-in merchant, recorded silently */
        merchantCode: merchant?.code ?? null, merchantName: merchant?.name ?? '',
        rto: c.rtoMode === RTO_OTHER ? rto : null,
        packages: ftl ? [] : parcels.map((p) => ({
          packageId: p.packageId, packageType: p.packageTypeName || CUSTOM_PACKAGE_NAME, quantity: p.quantity,
          trackingNumber: p.trackingNumber ?? '', palletSpace: p.palletSpace ?? '', description: p.description ?? '',
        })),
      },
      formMode: 'full',
    }
  }
  const persistTypedSender = () => {
    if (senderStore === OTHER_ADDRESS && saveSender && partyOk(sender)) {
      const saveAs: StoreLocation = { code: codeFor(sender), name: sender.businessName || sender.name, party: { ...sender } }
      const stored = growOrderActions.addStore(saveAs)
      setSenderStore(stored.code)
      setSaveSender(false)
      toast.success(`${stored.name} saved to your pickup addresses`)
    }
  }
  const proceed = () => {
    if (problems > 0) {
      setShowErrors(true)
      const first = order.find((id) => !done(id))
      if (first) setTimeout(() => jumpTo(first), 60)
      return
    }
    persistTypedSender()
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify(buildDraft()))
    setDraftSidecar({
      pickupId: pr?.id ?? null,
      overage: fromOverage ? { prId: fromOverage.pr.id, overageId: fromOverage.scan.id } : null,
    })
    nav('/grow/orders/checkout')
  }
  const saveForLater = () => {
    persistTypedSender()
    const o = growOrderActions.saveDraft(buildDraft(), resumeId ?? undefined)
    clearDraftKeys()
    toast.success(`Order ${o.orderNumber} saved to Drafts`)
    nav('/grow/orders?tab=drafts')
  }
  const backTo = pr ? `/grow/orders/pickups/${pr.id}` : fromOverage ? `/grow/orders/pickups/${fromOverage.pr.id}` : draftId ? '/grow/orders?tab=drafts' : '/grow/orders'

  /* ------------------------------------------------------------ sections */
  const senderSummary = fromList && !editSender
  const windowLabel = askWindow ? 'Preferred pickup' : 'Pickup'
  const fromSection = (
    <MSection id="sec-from" title="Pickup from" done={done('sec-from')}
      caption="Where the carrier collects the order. Your registered address and saved locations are listed first.">
      <MGrid cols={2}>
        <MField label="Pickup address" required>
          <MenuSelect value={senderStore} options={pickup.options.map((o) => o.value)} searchable={pickup.options.length > 6}
            labels={(v) => pickup.options.find((o) => o.value === v)?.label ?? v} onChange={pickSender} />
        </MField>
      </MGrid>
      {senderSummary ? (
        <div className="mt-4 flex items-start gap-3 rounded-md border border-line px-4 py-3">
          <MapPin size={16} className="mt-0.5 shrink-0 text-ink-3" />
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-bold text-ink">{sender.name || sender.businessName}{sender.contactNumber ? <span className="font-normal text-ink-3"> · {sender.contactNumber}</span> : null}</p>
            <p className="text-[13px] text-ink-2">{partyLine(sender) || 'No address on this location'}</p>
            {showErrors && !done('sec-from') && !windowErr && <p className="mt-1 text-[12px] text-danger-fg">This location is missing a required detail — edit it.</p>}
          </div>
          <button type="button" title="Edit this address" onClick={() => setEditSender(true)}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-line text-ink-2 hover:bg-warm-100"><Pencil size={14} /></button>
        </div>
      ) : (
        <div className="mt-4">
          <AddressFields party={sender} set={(p) => setSender((x) => ({ ...x, ...p }))} kind="from" hid={hid} need={need} err={err} />
          {senderStore === OTHER_ADDRESS && (
            <label className="mt-4 inline-flex cursor-pointer items-center gap-2 text-[13px] text-ink-2">
              <input type="checkbox" checked={saveSender} onChange={(e) => setSaveSender(e.target.checked)} className="h-3.5 w-3.5 accent-brand-500" />
              Save to my pickup addresses
            </label>
          )}
        </div>
      )}
      {!hid('addrWindow') && (
        <div className="mt-4 max-w-[640px]">
          <p className="mb-2 text-[13px] font-bold text-ink">{windowLabel} window</p>
          {/* the same Pickup date · Start time · End time the pickup dialogs use (owner, 2026-09-25) */}
          <SlotWindowFields startAt={sender.windowStart ?? ''} endAt={sender.windowEnd ?? ''} policy={pickupPol} ok={slotOk}
            onChange={(w) => setSender((x) => ({ ...x, windowStart: w.startAt, windowEnd: w.endAt }))}
            error={windowErr || err(need('addrWindow') && !(filled(sender.windowStart) && filled(sender.windowEnd))) || null} />
          <p className="mt-1 text-[12px] text-ink-3">{askWindow
            ? `Bookable up to ${pickupCfg.bookingHorizonDays} days ahead · same-day cut-off ${pickupCfg.sameDayCutoff}`
            : need('addrWindow') ? 'When the parcels are ready' : 'Optional — when the parcels are ready'}</p>
        </div>
      )}
    </MSection>
  )

  const toSection = (
    <MSection id="sec-to" title="Deliver to" done={done('sec-to')} caption="Who receives the order. Search your address book or type a new address.">
      <MGrid cols={2}>
        <MField label="Address book">
          <Autocomplete value={bookQ} onChange={setBookQ} hits={bookHits} placeholder="Search by name, phone, address or company"
            onPick={(e) => { setReceiver((r) => ({ ...r, ...e.party, windowStart: r.windowStart, windowEnd: r.windowEnd })); setBookQ('') }}
            render={(e) => (
              <span className="min-w-0">
                <span className="block truncate text-[13px] text-ink">{e.party.name}{e.tag ? <span className="text-ink-3"> · {e.tag}</span> : null}</span>
                <span className="block truncate text-[12px] text-ink-3">{partyLine(e.party)}</span>
              </span>
            )} />
        </MField>
      </MGrid>
      <div className="mt-4">
        <AddressFields party={receiver} set={(p) => setReceiver((x) => ({ ...x, ...p }))} kind="to" hid={hid} need={need} err={err} />
        {!hid('addrWindow') && (
          <div className="mt-4 max-w-[640px]">
            <p className="mb-2 text-[13px] font-bold text-ink">Delivery window</p>
            {/* the pickup window's grammar, without the pickup rules: any day from the pickup day on */}
            <SlotWindowFields startAt={receiver.windowStart ?? ''} endAt={receiver.windowEnd ?? ''} policy={pickupPol} ok={() => true}
              calendarRules={false} minDate={(sender.windowStart ?? '').slice(0, 10) || undefined}
              labels={{ date: 'Delivery date', start: 'Start time', end: 'End time' }}
              onChange={(w) => setReceiver((x) => ({ ...x, windowStart: w.startAt, windowEnd: w.endAt }))}
              error={err(need('addrWindow') && !(filled(receiver.windowStart) && filled(receiver.windowEnd))) || null} />
            <p className="mt-1 text-[12px] text-ink-3">{need('addrWindow') ? 'When the receiver can accept it' : 'Optional'}</p>
          </div>
        )}
      </div>
      {drops.map((d, i) => (
        <div key={i} className="mt-5 border-t border-line pt-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-[13px] font-bold text-ink">Delivery address {i + 2}</p>
            <button type="button" title="Remove address" onClick={() => setDrops((ds) => ds.filter((_, j) => j !== i))}
              className="flex h-7 w-7 items-center justify-center rounded-md text-ink-3 hover:bg-warm-100 hover:text-ink"><Trash2 size={14} /></button>
          </div>
          <AddressFields party={d} set={(p) => setDrop(i, p)} kind="to" hid={hid} need={need} err={err} />
        </div>
      ))}
      <AddBelow label="Add another delivery address" onClick={() => setDrops((ds) => [...ds, blankParty()])} />
      <div className="mt-5 border-t border-line pt-4">
        <p className="text-[13px] font-bold text-ink">If it can't be delivered, return it to</p>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2" role="radiogroup">
          <ChoiceCard label="My pickup address" sub="Returns come back where they were collected" checked={c.rtoMode !== RTO_OTHER} onClick={() => setC({ rtoMode: RTO_SAME })} />
          <ChoiceCard label="A different address" sub="A returns desk or warehouse" checked={c.rtoMode === RTO_OTHER} onClick={() => setC({ rtoMode: RTO_OTHER })} />
        </div>
        {c.rtoMode === RTO_OTHER && (
          <div className="mt-4"><AddressFields party={rto} set={(p) => setRto((x) => ({ ...x, ...p }))} kind="rto" hid={hid} need={need} err={err} /></div>
        )}
      </div>
    </MSection>
  )

  const orderSection = (
    <MSection id="sec-order" title="Order details" done={done('sec-order')} caption="Your own references for this order.">
      <MGrid>
        {idPref !== 'referenceNumber' && (
          <MField label={lbl('orderNumber')} required error={err(!filled(effectiveOrder))}
            hint={idPref === 'orderNumber' ? `Also used as the ${lbl('referenceNumber').toLowerCase()}` : undefined}>
            <Input value={c.orderNumber ?? ''} placeholder="e.g. ORD-10023" onChange={(v) => setC({ orderNumber: v })} />
          </MField>
        )}
        {idPref !== 'orderNumber' && (
          <MField label={lbl('referenceNumber')} required error={err(!filled(effectiveRef))}
            hint={idPref === 'referenceNumber' ? `Also used as the ${lbl('orderNumber').toLowerCase()}` : 'Unique for every order'}>
            <Input value={c.referenceNumber ?? ''} placeholder="e.g. REF-10023" onChange={(v) => setC({ referenceNumber: v })} />
          </MField>
        )}
        <MField label={lbl('consignmentType')} required>
          <MenuSelect value={c.consignmentType ?? 'Forward'} options={CONSIGNMENT_TYPES} onChange={(v) => setC({ consignmentType: v })} />
        </MField>
        {!hid('exchangeOrderNumber') && c.consignmentType === 'Exchange' && (
          <MField label={lbl('exchangeOrderNumber')} hint="The order being exchanged">
            <Input value={c.exchangeOrderNumber ?? ''} placeholder="e.g. ORD-10001" onChange={(v) => setC({ exchangeOrderNumber: v })} />
          </MField>
        )}
        <MField label={lbl('shipByDate')} required error={err(!filled(c.shipByDate))}>
          <DateInput value={c.shipByDate ?? ''} onChange={(v) => setC({ shipByDate: v })} />
        </MField>
        {!hid('paymentMode') && (
          <MField label={lbl('paymentMode')} required={need('paymentMode')} error={err(need('paymentMode') && !filled(c.paymentMode))}>
            <MenuSelect value={c.paymentMode ?? ''} placeholder="Prepaid" options={PAYMENT_MODES} onChange={(v) => setC({ paymentMode: v })} />
          </MField>
        )}
        {!hid('orderAmount') && filled(c.paymentMode) && (
          <MField label={lbl('orderAmount')} required={need('orderAmount')} error={err(need('orderAmount') && !((c.orderAmount ?? 0) > 0))}
            hint={c.paymentMode === 'COD' ? 'Collected from the receiver' : undefined}>
            <NumInput value={c.orderAmount ?? 0} blankZero placeholder="0.00" unit={currency} onChange={(n) => setC({ orderAmount: n || null })} />
          </MField>
        )}
        {!hid('labelFormat') && (
          <MField label="Label file type" required={need('labelFormat')} error={err(need('labelFormat') && !filled(c.labelFormat))}
            hint="PDF for office printers, ZPL for thermal label printers">
            <MenuSelect value={c.labelFormat ?? ''} placeholder="PDF" options={LABEL_FORMATS} onChange={(v) => setC({ labelFormat: v })} />
          </MField>
        )}
      </MGrid>
    </MSection>
  )

  const shownSwitches = SWITCHES.filter((sw) => !hid(sw.key))
  const packagesSection = (
    <MSection id="sec-packages" title="Package & SKU" done={done('sec-packages')}
      caption="Provide the package and SKU details for this order.">
      <PackageEditor parcels={parcels} setParcels={setParcels} packageTypes={packageTypes} skus={masters.skus}
        hid={hid} need={need} lbl={lbl} showErrors={showErrors} lockFirst={!!fromOverage} currency={currency} />
    </MSection>
  )

  const handlingSection = (
    <MSection id="sec-handling" title="Instructions & extras" done={done('sec-handling')} caption="Anything the carrier should know, and any extra services.">
      {shownSwitches.length > 0 && (
        <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-2">
          {shownSwitches.map((sw) => (
            <SwitchRow key={sw.key} label={sw.key === 'scannable' || sw.key === 'splittable' ? sw.label : lbl(sw.key)} hint={sw.hint}
              checked={!!c[sw.field]} onChange={(v) => setC({ [sw.field]: v } as Partial<ConsignmentFields>)} />
          ))}
        </div>
      )}
      {!hid('specialInstructions') && (
        <MField label={lbl('specialInstructions')} required={need('specialInstructions')}
          error={err(need('specialInstructions') && !filled(c.specialInstructions))}>
          <textarea rows={2} value={c.specialInstructions ?? ''} placeholder="e.g. Call before arriving; fragile items on top"
            onChange={(e) => setC({ specialInstructions: e.target.value })} className={TEXTAREA} />
        </MField>
      )}
      <div className="mt-5">
        <p className="text-[13px] font-bold text-ink">Value-added services</p>
        <p className="mt-0.5 text-[12px] text-ink-3">Priced services are added to the rate.</p>
        {(c.vas ?? []).length > 0 && (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[560px] table-fixed">
              <thead><tr>
                <th className="w-[40%] px-2 pb-1.5 text-left text-[12px] font-bold text-ink-3">Service</th>
                <th className="w-[25%] px-2 pb-1.5 text-left text-[12px] font-bold text-ink-3">Applies to</th>
                <th className="w-[27%] px-2 pb-1.5 text-left text-[12px] font-bold text-ink-3">Item</th>
                <th className="w-8" />
              </tr></thead>
              <tbody>
                {(c.vas ?? []).map((v, i) => (
                  <tr key={i}>
                    <td className="px-2 py-1">
                      <MenuSelect value={v.service} placeholder="Choose a service" options={VAS_SERVICES}
                        labels={(s) => (vasPrice(s, currency) ? `${s} · ${money(vasPrice(s, currency), currency)}` : s)} onChange={(s) => setVas(i, { service: s })} />
                      {showErrors && !v.service && <p className="mt-1 text-[12px] text-danger-fg">Choose a service.</p>}
                    </td>
                    <td className="px-2 py-1">
                      <MenuSelect value={v.level} options={VAS_LEVELS} labels={(l) => VAS_LEVEL_LABEL[l as VasLine['level']]}
                        onChange={(l) => setVas(i, { level: l as VasLine['level'], skuCode: l === 'SKU' ? v.skuCode : '' })} />
                    </td>
                    <td className="px-2 py-1">
                      {v.level === 'SKU'
                        ? <MenuSelect value={v.skuCode} placeholder={skuOpts.length ? 'Choose an item' : 'Add SKUs to a package first'} options={skuOpts} onChange={(s) => setVas(i, { skuCode: s })} />
                        : <span className="flex h-8 items-center text-[13px] text-ink-3">—</span>}
                    </td>
                    <td className="px-2 py-1">
                      <button type="button" title="Remove service" onClick={() => setC({ vas: (c.vas ?? []).filter((_, j) => j !== i) })}
                        className="flex h-7 w-7 items-center justify-center rounded-md text-ink-3 hover:bg-warm-100 hover:text-ink"><Trash2 size={14} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <AddBelow label="Add a service" onClick={() => setC({ vas: [...(c.vas ?? []), { level: 'CONSIGNMENT', skuCode: '', service: '', serviceTimeMin: 0, remark: '' }] })} />
      </div>
    </MSection>
  )

  const serviceSection = (
    <ServiceTypeSection ready={ready} mode={mode} onMode={changeMode}
      modeLocked={!!fromOverage || !!fromPr} quotes={quotes} selected={selected} onSelect={setService}
      currency={currency} fleet={fleet} counts={counts} onCount={setCount} fleetNote={fleetNote}
      showErrors={showErrors} serviceLocked={hid('serviceType')} />
  )

  return (
    <div className="pb-6">
      <PageHeader title="Create Order" subtitle="Tell us where it goes and what it is — we show the services and rates for that route."
        onBack={() => { clearDraftKeys(); nav(backTo) }} />
      {pr && (
        <div className="mb-4 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg bg-info-bg px-4 py-2.5 text-[13px] text-ink">
          <Truck size={15} className="shrink-0 text-info-fg" />
          <span>Creating an order for <b>{pr.number}</b>{pr.ftlServiceType ? ` · ${pr.ftlServiceType}` : ''} · window {prWindow(pr)}</span>
          <Link to={`/grow/orders/pickups/${pr.id}`} className="font-bold text-brand-500 hover:text-brand-600">View pickup request</Link>
        </div>
      )}
      {fromOverage && (
        <div className="mb-4 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg bg-info-bg px-4 py-2.5 text-[13px] text-ink">
          <ScanBarcode size={15} className="shrink-0 text-info-fg" />
          <span>Creating the order for overage scan <b className="font-mono">{fromOverage.scan.barcode}</b> from <b>{fromOverage.pr.number}</b></span>
          <Link to={`/grow/orders/pickups/${fromOverage.pr.id}`} className="font-bold text-brand-500 hover:text-brand-600">View pickup request</Link>
        </div>
      )}
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-w-0 flex-col gap-5">
          {fromSection}
          {toSection}
          {orderSection}
          {packagesSection}
          {handlingSection}
          {serviceSection}
        </div>
        <OrderSummaryRail sender={sender} receivers={allDrops} boxes={boxes} chargeableKg={weights.chargeable} mode={mode}
          vehicleLine={vehicleLine} quote={quote} priced={ftlOk} currency={currency}
          canContinue={!!quote && ftlOk}
          missing={[...missing.map((m) => `Add ${m}`), ...(!mode ? ['Choose a load type'] : ready && !quote ? ['Choose a service'] : []), ...(ready && quote && !ftlOk ? ['Add a vehicle'] : [])]}
          onJump={jumpTo} onContinue={proceed} onSaveLater={saveForLater} problems={showErrors ? problems : 0} />
      </div>
    </div>
  )
}
