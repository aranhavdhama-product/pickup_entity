import type { OrderDraft, Parcel } from './draft'
import { atDate, daysFromNow, PICKUP_SLOTS, PR_ENTRY_STATUS, PR_FLOW, slotFrom, tomorrow, windowFromSlot } from './tabs'
import { inboundHubFor } from './hubs'
import type {
  CarrierMode, GrowOrder, GrowOrdersDb, GrowPickupRequest, HandoverScan, Party, PickupOverage, PickupRequestStatus,
  PickupSource, PickupStatusEvent, ShipmentType, SizeClass, StoreLocation,
} from './types'
import { blankHandover, PR_DEFAULTS } from './types'
import { STAGING_CONSIGNMENTS, STAGING_STORES } from './stagingConsignments'
import { autoPickupWindow } from './pickupSlots'
import { DEFAULT_AUTO_PICKUP, DEFAULT_PICKUP_MODULE_CONFIG } from '../config/pickupModule'

export const MERCHANT = { code: '2GO_PH', name: '2GO_PH' }
export const CURRENCY = '₱'

const blankParty = (): Party => ({
  name: '', contactNumber: '', email: '', businessName: '', country: 'Philippines',
  line1: '', line2: '', landmark: '', postalCode: '', state: '', city: '',
})
export { blankParty }

export const STORES: StoreLocation[] = [
  { code: 'SANPABLO', name: 'San Pablo Hub', party: { ...blankParty(),
    name: 'Anuj Bhartia', contactNumber: '9171234567', email: 'anuj.b@2go.com.ph', businessName: '2GO Express',
    line1: 'SANPABLO', line2: '', landmark: '', postalCode: '4000', state: 'Laguna', city: 'San Pablo' } },
  { code: 'MNL-01', name: 'Manila Pasay Hub', party: { ...blankParty(),
    name: '2GO Pasay Dispatch', contactNumber: '9175550123', email: 'pasay@2go.com.ph', businessName: '2GO Express',
    line1: '2GO Express Bldg, Ninoy Aquino Ave', line2: 'Barangay 183', landmark: 'Near NAIA', postalCode: '1300', state: 'Metro Manila', city: 'Pasay' } },
  { code: 'CEB-01', name: 'Cebu Mandaue Hub', party: { ...blankParty(),
    name: '2GO Cebu Dispatch', contactNumber: '9325550199', email: 'cebu@2go.com.ph', businessName: '2GO Express',
    line1: 'A.C. Cortes Ave', line2: 'Ibabao', landmark: '', postalCode: '6014', state: 'Cebu', city: 'Mandaue' } },
]

const RCV: Party[] = [
  { ...blankParty(), name: 'Pooja Chandra', contactNumber: '8208462191', email: 'pooja.c@example.com', businessName: '',
    line1: 'ILOILO', line2: '', landmark: '', postalCode: '5000', state: 'Iloilo', city: 'Iloilo City' },
  { ...blankParty(), name: 'Pooja Chandra', contactNumber: '8208462191', email: 'pooja.c@example.com', businessName: '',
    line1: 'Diversion Rd', line2: 'Mandurriao', landmark: '', postalCode: '5000', state: 'Iloilo', city: 'Iloilo City' },
  { ...blankParty(), name: 'Prashant', contactNumber: '8879818300', email: 'prashant@example.com', businessName: 'Test1',
    line1: 'GF Ayala U.P. Town Center Katipunan Avenue', line2: 'Quezon City', landmark: '', postalCode: '1105', state: 'Metro Manila', city: 'Quezon City' },
  { ...blankParty(), name: 'avi', contactNumber: '12345690', email: 'avi@example.com', businessName: '',
    line1: 'ILOILO', line2: '', landmark: '', postalCode: '5000', state: 'Iloilo', city: 'Iloilo City' },
  { ...blankParty(), name: 'Vikash Mishra', contactNumber: '9765432100', email: 'mvikash076@gmail.com', businessName: 'Electrnics Mart',
    line1: '86 Bonifacio St', line2: 'Lapu-Lapu', landmark: '', postalCode: '6015', state: 'Cebu', city: 'Lapu-Lapu City' },
]

function iso(daysAgo: number, hh = 10, mm = 12): string {
  const d = new Date(); d.setDate(d.getDate() - daysAgo); d.setHours(hh, mm, 0, 0)
  return d.toISOString()
}

function order(i: number, o: Partial<GrowOrder>): GrowOrder {
  const store = STORES[i % STORES.length]
  return {
    id: `o${i}`,
    orderNumber: o.orderNumber ?? `NL${String(100000 + i * 7919).slice(-6)}${['A', 'K', 'Q', 'Z'][i % 4]}`,
    orderType: 'Forward Order',
    createdAt: iso(i * 3, 9 + (i % 8), (i * 11) % 60),
    status: 'Order Created',
    storeCode: store.code,
    inboundHubCode: inboundHubFor(o.receiver ?? RCV[i % RCV.length]),
    sender: store.party,
    receiver: RCV[i % RCV.length],
    drops: [], shipmentType: 'Parcel', vehicleType: '',
    pkg: { kind: 'Parcel', count: 1, weightKg: 1.5, lengthCm: 30, widthCm: 20, heightCm: 15, description: 'Electronics accessories', declaredValue: 1200 },
    paymentMode: 'Prepaid', codAmount: 0, currency: CURRENCY,
    carrier: '', serviceType: '', trackingNumber: '', pickupDate: '', remarks: '', error: '',
    paymentStatus: 'Paid', isDraft: false, pickupRequestId: null, pickedInRequestId: null, draft: null,
    ...o,
  }
}

/** Stepper state stored on a draft order so `Resume` can reopen it where it was left. */
function draftOf(store: StoreLocation, receiver: Party, parcels: Parcel[]): OrderDraft {
  return {
    storeCode: store.code, sender: store.party, receiver, drops: [], shipmentType: 'Parcel', vehicleType: '',
    vehicleUnit: 1, actualLoad: 0, additionalServices: [], parcels,
    authority: 'Leave at the door', instructions: '', secure: false,
    service: 'Standard', rate: 90, etaDays: 2,
  }
}

const parcel = (p: Partial<Parcel> = {}): Parcel =>
  ({ cargoType: 'Parcel', itemInfo: '', quantity: 1, weight: 1, l: 10, w: 10, h: 10, ...p })

/** The first seeded pickup booking — two paid San Pablo orders, tomorrow morning. */
const PR_ID = 'pr101'
export const SEED_PR_NUMBER = 'PR-000101'

const byCode = (code: string) => STORES.find((s) => s.code === code) ?? STORES[0]

/** A paid order already attached to a pickup request at `code`. */
function prOrder(i: number, code: string, o: Partial<GrowOrder> = {}): GrowOrder {
  const s = byCode(code)
  return order(i, { storeCode: s.code, sender: s.party, status: 'Pickup Scheduled', ...o })
}

/**
 * A plausible audit trail for a seeded request: walk PR_FLOW up to the current
 * state (45 min apart), or Requested → <terminal> for the side exits.
 */
function prHistory(status: PickupRequestStatus, createdAt: string): PickupStatusEvent[] {
  const i = PR_FLOW.indexOf(status)
  const chain = i >= 0 ? PR_FLOW.slice(0, i + 1) : ([PR_ENTRY_STATUS, status] as PickupRequestStatus[])
  const t0 = new Date(createdAt).getTime()
  return chain.map((s, n) => ({ status: s, at: new Date(t0 + n * 45 * 60_000).toISOString() }))
}

/** One seeded pickup request + its history, so every row has a timeline. */
function pr(
  n: number, storeCode: string, date: string, slot: string, status: PickupRequestStatus,
  orderIds: string[], createdAgo: number, instructions?: string,
): GrowPickupRequest {
  const createdAt = iso(createdAgo, 8 + (n % 9), (n * 7) % 60)
  /* the window is the source of truth; date + slot are what it derives */
  const { startAt, endAt } = windowFromSlot(date, slot)
  return {
    id: n === 101 ? PR_ID : `pr${n}`, number: `PR-${String(n).padStart(6, '0')}`,
    storeCode, destinationCode: null, startAt, endAt, date, slot: slotFrom(startAt, endAt),
    orderIds, pickedOrderIds: [], overages: [],
    status, createdAt, instructions,
    statusHistory: prHistory(status, createdAt),
    blind: false, shipmentType: 'Parcel', expectedPieces: null, expectedWeightKg: null, sizeClass: null,
    vehicleType: null, vehicleUnit: null, ftlServiceType: null, shipFrom: null, shipTo: null,
    contactName: '', contactNumber: '', note: '',
    /* literals, like normalizePr — a seed row never reads the live config */
    ...PR_DEFAULTS, handover: blankHandover('both'), notPickedReasons: {},
  }
}

/**
 * A RESERVED booking (internally `blind`) — raised before the orders existed, so
 * it carries what the merchant *expects* to hand over instead of linked orders.
 */
function blindPr(
  n: number, storeCode: string, date: string, slot: string, status: PickupRequestStatus,
  orderIds: string[], createdAgo: number,
  x: {
    pieces: number | null; weight: number | null; sizeClass?: SizeClass | null
    shipmentType?: ShipmentType; vehicleType?: string; vehicleUnit?: number
    shipFrom?: Party | null; shipTo?: Party | null; note?: string; instructions?: string
  },
): GrowPickupRequest {
  const store = byCode(storeCode)
  const ftl = x.shipmentType === 'FTL'
  return {
    ...pr(n, storeCode, date, slot, status, orderIds, createdAgo, x.instructions),
    blind: true, shipmentType: ftl ? 'FTL' : 'Parcel',
    expectedPieces: x.pieces, expectedWeightKg: x.weight,
    sizeClass: ftl ? null : x.sizeClass ?? null,
    vehicleType: ftl ? x.vehicleType ?? null : null,
    vehicleUnit: ftl ? x.vehicleUnit ?? 1 : null,
    ftlServiceType: ftl ? 'Inland FTL' : null,
    shipFrom: ftl ? x.shipFrom ?? null : null,
    shipTo: ftl ? x.shipTo ?? null : null,
    contactName: store.party.name, contactNumber: store.party.contactNumber, note: x.note ?? '',
  }
}

/* ------------------------------------------------------- bulk demo volume ---- */

/**
 * Everything below builds the ~80 orders / ~30 pickup requests the demo needs,
 * from INDEX MATH only — no Math.random — so a reload, a re-seed and a
 * screenshot all show the same data. The hand-written records above stay
 * exactly as they are; these are appended to them.
 */

/** Receivers the generator cycles, spread over the hubs' catchment areas. */
const GEN_RCV: Party[] = [
  ...RCV,
  { ...blankParty(), name: 'Marites Dizon', contactNumber: '9171112233', email: 'marites.d@example.com', businessName: 'Dizon Sari-Sari',
    line1: '14 Katipunan Ext', line2: 'Barangay Loyola', postalCode: '1108', state: 'Metro Manila', city: 'Quezon City' },
  { ...blankParty(), name: 'Ramon Aquino', contactNumber: '9285554411', email: 'ramon.a@example.com', businessName: 'Aquino Hardware',
    line1: '7 Rizal Ave', line2: '', postalCode: '1900', state: 'Rizal', city: 'Antipolo' },
  { ...blankParty(), name: 'Grace Lim', contactNumber: '9173338899', email: 'grace.lim@example.com', businessName: 'Lim Pharmacy',
    line1: '221 Osmena Blvd', line2: '', postalCode: '6000', state: 'Cebu', city: 'Cebu City' },
  { ...blankParty(), name: 'Danilo Reyes', contactNumber: '9064447722', email: 'danilo.r@example.com', businessName: '',
    line1: '5 Mabini St', line2: 'Poblacion', postalCode: '4030', state: 'Laguna', city: 'Calamba' },
  { ...blankParty(), name: 'Editha Cruz', contactNumber: '9998887711', email: 'editha.c@example.com', businessName: 'Cruz Bakeshop',
    line1: '88 Quezon Ave', line2: '', postalCode: '2000', state: 'Bulacan', city: 'Malolos' },
  { ...blankParty(), name: 'Joel Bautista', contactNumber: '9175559900', email: 'joel.b@example.com', businessName: 'JB Electronics',
    line1: '19 Colon St', line2: '', postalCode: '6000', state: 'Cebu', city: 'Cebu City' },
  { ...blankParty(), name: 'Liza Fernandez', contactNumber: '9221114455', email: 'liza.f@example.com', businessName: '',
    line1: '3 Jaro Plaza', line2: '', postalCode: '5000', state: 'Iloilo', city: 'Iloilo City' },
]

const GEN_ITEMS = [
  'Apparel restock', 'Skincare set', 'Kitchenware', 'Mobile accessories', 'Pet supplies',
  'Stationery', 'Coffee beans', 'Board games', 'Sneakers', 'Home decor', 'Gift hampers', 'Spare parts',
]

/** Deterministic: index → a value that looks varied but never moves. */
const spin = (n: number, mod: number, mult = 37) => ((n + 1) * mult) % mod

/**
 * One generated order. `n` drives every "random-looking" field, `storeCode` and
 * `inboundHubCode` are passed in because the (pickup location → destination)
 * pair is what the Book a Pickup grouping is demonstrating.
 */
function genOrder(n: number, storeCode: string, hub: string, o: Partial<GrowOrder> = {}): GrowOrder {
  const store = byCode(storeCode)
  const rcv = GEN_RCV[spin(n, GEN_RCV.length, 7)]
  const ftl = n % 13 === 0
  const doc = !ftl && n % 11 === 0
  const count = ftl ? 8 + (n % 7) : 1 + (n % 4)
  const weight = ftl ? 3200 + spin(n, 9, 11) * 400 : Number((0.4 + spin(n, 160, 29) / 10).toFixed(1))
  const cod = n % 5 === 2
  return {
    id: `g${n}`,
    orderNumber: `${['NL', 'SO', 'GR', 'PH'][n % 4]}${String(200000 + n * 6091).slice(-6)}${['A', 'K', 'Q', 'Z', 'B', 'M'][n % 6]}`,
    orderType: n % 19 === 0 ? 'Reverse Order' : 'Forward Order',
    createdAt: iso(spin(n, 45, 13), 8 + (n % 10), (n * 17) % 60),
    status: 'Order Created',
    storeCode: store.code,
    inboundHubCode: hub,
    sender: store.party,
    receiver: rcv,
    drops: [],
    shipmentType: ftl ? 'FTL' : 'Parcel',
    vehicleType: ftl ? ['4 Ton Truck', '8 Ton Truck', '14 Ton Truck'][n % 3] : '',
    ...(ftl ? { vehicleUnit: 1, actualLoad: weight, additionalServices: [],
      vehicles: [{ vehicleType: ['4 Ton Truck', '8 Ton Truck', '14 Ton Truck'][n % 3], actualLoadKg: weight, addressIdx: [0] }] } : {}),
    pkg: {
      kind: ftl ? 'FTL' : doc ? 'Document' : 'Parcel',
      count, weightKg: doc ? 0.2 : weight,
      lengthCm: 20 + (n % 5) * 6, widthCm: 16 + (n % 4) * 5, heightCm: 10 + (n % 6) * 4,
      description: doc ? 'Signed documents' : GEN_ITEMS[spin(n, GEN_ITEMS.length, 5)],
      declaredValue: 600 + spin(n, 90, 23) * 100,
    },
    paymentMode: cod ? 'COD' : 'Prepaid',
    codAmount: cod ? 400 + spin(n, 60, 19) * 50 : 0,
    currency: CURRENCY,
    carrier: ftl ? '2GO Logistics' : '2GO Express',
    serviceType: ftl ? 'Inland FTL' : 'Standard',
    trackingNumber: '', pickupDate: '', remarks: '',
    /* a few free shipper tags, from index math like everything else here */
    tags: n % 7 === 3 ? ['Priority'] : n % 9 === 4 ? ['Gift wrap', 'Call before delivery'] : [],
    error: n % 17 === 0 ? ['Pincode not serviceable', 'Contact number is invalid', 'Address line 1 is required'][n % 3] : '',
    paymentStatus: 'Paid', isDraft: false, pickupRequestId: null, pickedInRequestId: null, draft: null,
    ...o,
  }
}

const range = (n: number, from = 0) => Array.from({ length: n }, (_, i) => i + from)

/** `YYYY-MM-DDTHH:mm` n days from today at HH:mm — the only way to build a MULTI-DAY window. */
const at = (days: number, hhmm: string) => `${daysFromNow(days)}T${hhmm}`

/** A generated request with an EXPLICIT window, so it can span several days. */
function prAt(
  n: number, storeCode: string, startAt: string, endAt: string, status: PickupRequestStatus,
  orderIds: string[], createdAgo: number, instructions?: string,
): GrowPickupRequest {
  const base = pr(n, storeCode, startAt.slice(0, 10), '09:00–13:00', status, orderIds, createdAgo, instructions)
  return { ...base, startAt, endAt, date: startAt.slice(0, 10), slot: slotFrom(startAt, endAt) }
}

/**
 * The generated half of the demo data. Orders are laid out so the Ready tab
 * groups cleanly: four consecutive rows per store, split two-and-two between
 * the Manila and Cebu inbound hubs.
 */
function bulkVolume(): { orders: GrowOrder[]; pickupRequests: GrowPickupRequest[] } {
  const S = ['SANPABLO', 'MNL-01', 'CEB-01']
  const orders: GrowOrder[] = []

  /* ---- 10 more drafts (Unpaid, resumable) ---- */
  orders.push(...range(10).map((k) => {
    const store = byCode(S[Math.floor(k / 4) % 3])
    const rcv = GEN_RCV[spin(k, GEN_RCV.length, 7)]
    return genOrder(300 + k, store.code, inboundHubFor(rcv), {
      paymentStatus: 'Unpaid', isDraft: true, status: 'Order Created', error: '',
      draft: draftOf(store, rcv, [parcel({ itemInfo: GEN_ITEMS[k % GEN_ITEMS.length], quantity: 1 + (k % 3), weight: 0.8 + k * 0.3 })]),
    })
  }))

  /* ---- 12 more Ready for Pickup — 4 per store, 2 per inbound hub ---- */
  const readyWeights = [4.0, 3.8, 2.6, 5.1, 1.9, 6.4, 3.3, 2.2, 7.5, 1.4, 4.7, 2.9]
  orders.push(...range(12).map((k) => {
    const o = genOrder(400 + k, S[Math.floor(k / 4) % 3], k % 4 < 2 ? 'MNL-01' : 'CEB-01')
    /* fixed weights so the grouped booking preview reads the same on every reload;
       an FTL row keeps its own tonnage */
    return o.shipmentType === 'FTL' ? o : { ...o, pkg: { ...o.pkg, weightKg: readyWeights[k], count: 1 + (k % 3) } }
  }))

  /* ---- 13 more Pickup Scheduled, attached to the generated requests below ---- */
  const sched: { pr: string; store: string; hub: string; status: GrowOrder['status'] }[] = [
    { pr: 'pr122', store: 'SANPABLO', hub: 'MNL-01', status: 'Pickup Scheduled' },
    { pr: 'pr122', store: 'SANPABLO', hub: 'MNL-01', status: 'Pickup Scheduled' },
    { pr: 'pr123', store: 'MNL-01', hub: 'CEB-01', status: 'Pickup Scheduled' },
    { pr: 'pr124', store: 'CEB-01', hub: 'MNL-01', status: 'Pickup Scheduled' },
    { pr: 'pr125', store: 'SANPABLO', hub: 'CEB-01', status: 'Pickup Scheduled' },
    { pr: 'pr125', store: 'SANPABLO', hub: 'CEB-01', status: 'Pickup Scheduled' },
    { pr: 'pr126', store: 'MNL-01', hub: 'MNL-01', status: 'Pickup Scheduled' },
    /* g507 is a vehicle order (n % 13) — its own completed FTL booking PR-000139 */
    { pr: 'pr139', store: 'CEB-01', hub: 'MNL-01', status: 'Picked Up' },
    { pr: 'pr127', store: 'CEB-01', hub: 'MNL-01', status: 'Picked Up' },
    { pr: 'pr128', store: 'SANPABLO', hub: 'CEB-01', status: 'Picked Up' },
    { pr: 'pr131', store: 'MNL-01', hub: 'CEB-01', status: 'Pickup Scheduled' },
    { pr: 'pr132', store: 'SANPABLO', hub: 'MNL-01', status: 'Pickup Scheduled' },
    { pr: 'pr133', store: 'SANPABLO', hub: 'MNL-01', status: 'Pickup Scheduled' },
  ]
  orders.push(...sched.map((x, k) => genOrder(500 + k, x.store, x.hub, {
    status: x.status, pickupRequestId: x.pr, pickupDate: daysFromNow(k % 4), error: '',
    trackingNumber: `2GO${String(200 + k).padStart(5, '0')}`,
  })))

  /* ---- 3 orders a failed / cancelled request let go of: PR-000129's two were
     re-booked on its automatic re-attempt PR-000140; PR-000130's went back to Ready ---- */
  orders.push(...range(3).map((k) => genOrder(600 + k, ['MNL-01', 'MNL-01', 'CEB-01'][k], ['CEB-01', 'CEB-01', 'MNL-01'][k], k < 2
    ? { status: 'Pickup Scheduled', pickupRequestId: 'pr140', pickupDate: daysFromNow(2), error: '' }
    : { status: 'Order Created', pickupRequestId: null, error: '' })))

  /* ---- 13 in flight / closed, so every remaining tab has real volume ---- */
  const flight: GrowOrder['status'][] = [
    'In Transit', 'In Transit', 'In Transit', 'Out for Delivery', 'Out for Delivery',
    'Delivered', 'Delivered', 'Delivered', 'Delivered', 'Delivered',
    'Undelivered', 'Undelivered', 'Cancelled',
  ]
  orders.push(...flight.map((st, k) => genOrder(700 + k, S[k % 3], k % 2 ? 'MNL-01' : 'CEB-01', {
    status: st, trackingNumber: `2GO${String(300 + k).padStart(5, '0')}`,
    pickupDate: daysFromNow(-(3 + (k % 9))),
    error: st === 'Undelivered' ? ['Consignee not available', 'Address not found'][k % 2] : '',
  })))

  /* ---- 6 behind the trip-run requests PR-000134..136 (see SEED_TRIPS) ----
     134: collected, one of two in-scanned at the hub (the Discrepancy);
     135: collected and fully handed over; 136: failed (attempt 1 of 3), so the
     auto re-attempt PR-000137 (attempt 2) now holds both orders. */
  const tripRun: { pr: string | null; store: string; hub: string; status: GrowOrder['status'] }[] = [
    { pr: 'pr134', store: 'SANPABLO', hub: 'MNL-01', status: 'In Transit' },
    { pr: 'pr134', store: 'SANPABLO', hub: 'MNL-01', status: 'Picked Up' },
    { pr: 'pr135', store: 'MNL-01', hub: 'MNL-01', status: 'In Transit' },
    { pr: 'pr135', store: 'MNL-01', hub: 'MNL-01', status: 'In Transit' },
    { pr: 'pr137', store: 'MNL-01', hub: 'MNL-01', status: 'Pickup Scheduled' },
    { pr: 'pr137', store: 'MNL-01', hub: 'MNL-01', status: 'Pickup Scheduled' },
  ]
  orders.push(...tripRun.map((x, k) => genOrder(800 + k, x.store, x.hub, {
    status: x.status, pickupRequestId: x.pr, error: '',
    pickupDate: x.pr ? daysFromNow(x.pr === 'pr134' ? 0 : x.pr === 'pr137' ? 1 : -1) : '',
    trackingNumber: x.pr ? `2GO${String(800 + k).padStart(5, '0')}` : '',
  })))

  const ids = (prId: string) => orders.filter((o) => o.pickupRequestId === prId).map((o) => o.id)
  const rel = ['g600', 'g601', 'g602']

  /* 12 more requests: every status, 3 MULTI-DAY windows, 2 overdue, a duplicate pair */
  const pickupRequests: GrowPickupRequest[] = [
    prAt(122, 'SANPABLO', at(1, '14:00'), at(1, '17:00'), 'Requested', ids('pr122'), 1, 'Dock 2 — ring the bell.'),
    /* a 2-DAY collection window: the driver may come any time across two days */
    prAt(123, 'MNL-01', at(6, '14:00'), at(8, '18:00'), 'Requested', ids('pr123'), 2, 'Stock is released in two batches.'),
    prAt(124, 'CEB-01', at(2, '09:00'), at(2, '12:00'), 'Planned', ids('pr124'), 2),
    /* a 3-DAY window over the weekend */
    prAt(125, 'SANPABLO', at(8, '08:00'), at(11, '17:00'), 'Assigned', ids('pr125'), 3, 'Weekend consolidation run.'),
    prAt(126, 'MNL-01', at(0, '06:00'), at(0, '13:00'), 'Out For Pickup', ids('pr126'), 3),
    prAt(127, 'CEB-01', at(-12, '09:00'), at(-12, '13:00'), 'Completed', ids('pr127'), 14),
    prAt(128, 'SANPABLO', at(-18, '13:00'), at(-18, '17:00'), 'Completed', ids('pr128'), 20),
    prAt(129, 'MNL-01', at(-9, '09:00'), at(-9, '13:00'), 'Pickup Failed', [rel[0], rel[1]], 10, 'Nobody at the loading bay.'),
    prAt(130, 'CEB-01', at(-7, '17:00'), at(-7, '20:00'), 'Cancelled', [rel[2]], 8),
    /* overdue: still open, window closed days ago */
    prAt(131, 'MNL-01', at(-3, '09:00'), at(-3, '13:00'), 'Requested', ids('pr131'), 4),
    /* back-to-back with 133 (half-open windows), so NOT a duplicate — PR-000112/113 is the one intended pair */
    prAt(132, 'SANPABLO', at(4, '09:00'), at(4, '14:00'), 'Requested', ids('pr132'), 1),
    prAt(133, 'SANPABLO', at(4, '14:00'), at(4, '17:00'), 'Requested', ids('pr133'), 1),
    /* the trip-run requests — stops on T10000333 / T10000334 */
    prAt(134, 'SANPABLO', at(0, '08:00'), at(0, '11:00'), 'Completed', ids('pr134'), 1),
    prAt(135, 'MNL-01', at(-1, '09:00'), at(-1, '12:00'), 'Completed', ids('pr135'), 2),
    { ...prAt(136, 'MNL-01', at(-1, '13:00'), at(-1, '16:00'), 'Pickup Failed', ['g804', 'g805'], 2),
      failureReason: 'SHIPMENT_NOT_READY' },
    /* 136's automatic re-attempt (autoRescheduleOnFail): the next business day,
       a morning window clear of PR-000102 / 115 at the same point (no Duplicate) */
    prAt(137, 'MNL-01', at(1, '09:00'), at(1, '12:00'), 'Requested', ids('pr137'), 0),
    /* g507's dedicated vehicle run, handed over with PR-000127's */
    (() => {
      const g = orders.find((o) => o.id === 'g507')
      return { ...prAt(139, 'CEB-01', at(-12, '13:00'), at(-12, '17:00'), 'Completed', ids('pr139'), 14),
        shipmentType: 'FTL' as const, vehicleType: g?.vehicleType || null, vehicleUnit: 1, ftlServiceType: 'Inland FTL', shipTo: g?.receiver ?? null }
    })(),
    /* 129's automatic re-attempt (attempt 2 of 3), two days out — clear of
       PR-000102 / 115 / 137 at the same point (no Duplicate) */
    prAt(140, 'MNL-01', at(2, '09:00'), at(2, '13:00'), 'Requested', ids('pr140'), 0),
  ]
  return { orders, pickupRequests }
}

/**
 * The two barcodes PR-000107's driver scanned that matched no order in the
 * system. One is still unresolved (the demo's "Create order" path); the other
 * was reconciled into order o32, which carries the barcode as its tracking number.
 */
const OVERAGES_107: PickupOverage[] = [
  { id: 'ov107a', barcode: '2GO-OV-88213', scannedAt: iso(3, 9, 38), weightKg: 2.4,
    note: 'Handwritten AWB on the box — no label to scan.', orderId: null },
  { id: 'ov107b', barcode: '2GO-OV-88214', scannedAt: iso(3, 9, 41), weightKg: 1.1,
    note: 'Extra carton added at the dock after the manifest was printed.', orderId: 'o32' },
]

/**
 * Give a seeded COMPLETED request its handover scans. `close` = the buckets
 * reconciled and the handover closed (Handed Over); otherwise the scans are left
 * as they are, which is how the seed shows a live discrepancy.
 */
function handedOver(p: GrowPickupRequest, x: { driver: string[]; hub: string[]; close: boolean }): GrowPickupRequest {
  const t0 = atDate(p.endAt).getTime()
  const log = (ids: string[], by: 'driver' | 'hub', mins: number): HandoverScan[] => ids.map((orderId, i) => ({
    orderId, by, at: new Date(t0 + (mins + i) * 60_000).toISOString(),
    hubCode: by === 'hub' ? p.destinationCode ?? null : null, damaged: false,
  }))
  return {
    ...p,
    pickedOrderIds: p.pickedOrderIds.length ? p.pickedOrderIds : [...x.driver],
    handover: {
      ...p.handover, driverScanned: x.driver, hubScanned: x.hub,
      closedAt: x.close ? new Date(t0 + 3 * 3_600_000).toISOString() : null,
      /* every seeded completed run has reached the hub — 134's missing scan is a real Discrepancy */
      arrivedAtHubAt: new Date(t0 + 2 * 3_600_000).toISOString(),
      scanLog: [...log(x.driver, 'driver', -30), ...log(x.hub, 'hub', 150)],
    },
  }
}

/** Carrier (3PL) allocations on the seed — the requests a partner runs, not our fleet. */
const SEED_CARRIERS: Record<string, { code: string; name: string; mode: CarrierMode; manifestRef?: string }> = {
  pr125: { code: 'LBC', name: 'LBC Express', mode: 'CARRIER' },
  pr126: { code: 'ENTREGO', name: 'Entrego', mode: 'CARRIER', manifestRef: 'ENT-MNF-20931' },
  /* the reserved night FTL run is a partner truck, which is why it is Assigned without a trip */
  pr120: { code: '2GO-FREIGHT', name: '2GO Freight', mode: 'CARRIER' },
}

/** Seed provenance where it is not the merchant portal. */
const SEED_SOURCES: Record<string, PickupSource> = {
  pr122: 'API', pr124: 'Console', pr134: 'Console', pr135: 'Console', pr136: 'Console', pr137: 'Console',
  /* the AUTO-raised first-mile requests at the top of the list (owner, 2026-09-24) */
  pr141: 'Auto',
}

/**
 * The five seeded trips — ONE of each Control Tower status — as plain data. It
 * lives HERE, not in planningStore, because both sides read it: `seed()` stamps
 * `tripId` / `driverName` onto the requests below, and planningStore builds its
 * LocalTrips from the same list, so a request and the trip it is a stop on can
 * never disagree.
 */
export type SeedTripStatus = 'Un-assigned' | 'Yet to start' | 'In Transit' | 'Yet to debrief' | 'Completed'
export type SeedStopStatus = 'Pending' | 'Arrived' | 'Done' | 'Failed'
export interface SeedTrip {
  id: string
  name: string
  status: SeedTripStatus
  /** days from today */
  day: number
  /** fallback only — planningStore prefers the first pickup's inbound hub */
  hubCode: string
  driverName: string | null
  vehicle: string | null
  stops: ({ kind: 'pickup'; prId: string; status: SeedStopStatus } | { kind: 'delivery'; orderId: string; status: SeedStopStatus })[]
}
export const SEED_TRIP_BASE = 10000330
export const SEED_TRIPS: SeedTrip[] = [
  { id: 'T10000330', name: 'Unassigned route 1', status: 'Un-assigned', day: 2, hubCode: 'MNL-01', driverName: null, vehicle: null,
    stops: [
      { kind: 'pickup', prId: 'pr124', status: 'Pending' },
      { kind: 'delivery', orderId: 'g700', status: 'Pending' },
      { kind: 'delivery', orderId: 'g702', status: 'Pending' },
    ] },
  { id: 'T10000331', name: 'Jun Santos', status: 'Yet to start', day: 0, hubCode: 'MNL-01', driverName: 'Jun Santos', vehicle: 'NBC 4521',
    stops: [
      { kind: 'pickup', prId: 'pr105', status: 'Pending' },
      { kind: 'delivery', orderId: 'g701', status: 'Pending' },
    ] },
  { id: 'T10000332', name: 'Mark Villanueva', status: 'In Transit', day: 0, hubCode: 'CEB-01', driverName: 'Mark Villanueva', vehicle: 'GAB 7310',
    stops: [
      { kind: 'delivery', orderId: 'g706', status: 'Done' },
      { kind: 'pickup', prId: 'pr106', status: 'Arrived' },
      { kind: 'delivery', orderId: 'g704', status: 'Pending' },
    ] },
  { id: 'T10000333', name: 'Rey Dela Cruz', status: 'Yet to debrief', day: 0, hubCode: 'MNL-01', driverName: 'Rey Dela Cruz', vehicle: 'NDF 2284',
    stops: [
      { kind: 'pickup', prId: 'pr134', status: 'Done' },
      { kind: 'delivery', orderId: 'g707', status: 'Done' },
      { kind: 'delivery', orderId: 'g709', status: 'Done' },
    ] },
  { id: 'T10000334', name: 'Arnel Bautista', status: 'Completed', day: -1, hubCode: 'MNL-01', driverName: 'Arnel Bautista', vehicle: 'NCQ 9051',
    stops: [
      { kind: 'pickup', prId: 'pr135', status: 'Done' },
      { kind: 'delivery', orderId: 'g705', status: 'Done' },
      { kind: 'pickup', prId: 'pr136', status: 'Failed' },
      { kind: 'delivery', orderId: 'g708', status: 'Done' },
    ] },
]

/* INVARIANT: a seeded request is Planned only with a tripId, and Assigned only
   with a tripId or a CARRIER allocation — routing is what plans, a driver or partner is what assigns. */
/**
 * Execution facts layered onto the seeded requests: trips, carriers, attempts,
 * reasons and the historical handovers. Kept as ONE pass over the finished list
 * so the hand-written rows above stay readable.
 */
function withExecution(p: GrowPickupRequest): GrowPickupRequest {
  let x: GrowPickupRequest = { ...p, source: SEED_SOURCES[p.id] ?? p.source }
  const trip = SEED_TRIPS.find((t) => t.stops.some((s) => s.kind === 'pickup' && s.prId === p.id))
  if (trip) x = { ...x, tripId: trip.id, driverName: trip.driverName }
  const c = SEED_CARRIERS[p.id]
  if (c) x = { ...x, carrierCode: c.code, carrierName: c.name, carrierMode: c.mode,
    handover: { ...x.handover, manifestRef: c.manifestRef ?? null } }
  switch (p.id) {
    /* the older completed runs were handed over long ago */
    case 'pr109': case 'pr121': case 'pr127': case 'pr128': case 'pr139':
      return handedOver(x, { driver: x.pickedOrderIds, hub: x.pickedOrderIds, close: true })
    /* the trip runs: 134 = driver scanned two, the hub has seen one (Discrepancy);
       135 = both scans agree and the handover closed */
    case 'pr134':
      return handedOver(x, { driver: ['g800', 'g801'], hub: ['g800'], close: false })
    case 'pr135':
      return handedOver(x, { driver: ['g802', 'g803'], hub: ['g802', 'g803'], close: true })
    /* partial pick (o30 left behind) — scans agree, but ops has not closed it */
    case 'pr107':
      return { ...handedOver(x, { driver: x.pickedOrderIds, hub: x.pickedOrderIds, close: false }),
        notPickedReasons: { o30: 'SHIPMENT_NOT_READY' } }
    /* failed on its LAST attempt — Closed, no re-attempt left */
    case 'pr108':
      return { ...x, attempt: 3, failureReason: 'PREMISES_CLOSED',
        statusHistory: [...x.statusHistory.slice(0, -1), { ...x.statusHistory[x.statusHistory.length - 1], note: 'Location closed on arrival — final attempt (3 of 3)' }] }
    /* failed on the first attempt — auto re-attempted as PR-000140 (like 136 → 137) */
    case 'pr129':
      return { ...x, failureReason: 'PREMISES_CLOSED', reattemptPrId: 'pr140', statusHistory: [...x.statusHistory,
        { status: x.status, at: x.statusHistory[x.statusHistory.length - 1].at, note: 'Re-attempted as PR-000140 (attempt 2 of 3)' }] }
    case 'pr140':
      return { ...x, attempt: 2, parentPrId: 'pr129', createdAt: iso(0, 8, 5),
        statusHistory: [{ status: x.status, at: iso(0, 8, 5), note: 'Re-attempt 2 of 3 of PR-000129' }] }
    case 'pr130':
      return { ...x, cancelReason: 'MERCHANT_REQUEST' }
    /* the re-attempt chain: 136 failed, 137 retries it (the "Re-attempt scheduled" row) */
    case 'pr136':
      return { ...x, reattemptPrId: 'pr137', statusHistory: [...x.statusHistory,
        { status: x.status, at: x.statusHistory[x.statusHistory.length - 1].at, note: 'Re-attempted as PR-000137 (attempt 2 of 3)' }] }
    case 'pr137':
      /* raised the moment 136 failed — yesterday, after its 13:00–16:00 window */
      return { ...x, attempt: 2, parentPrId: 'pr136', createdAt: iso(1, 16, 5),
        statusHistory: [{ status: x.status, at: iso(1, 16, 5), note: 'Re-attempt 2 of 3 of PR-000136' }] }
    default:
      return x
  }
}

export function seed(): GrowOrdersDb {
  const pickupDate = tomorrow()
  const sanPablo = STORES[0]
  const cebu = STORES[2]
  /* ---- AUTO pickup (owner, 2026-09-24): four consignments created minutes ago whose
     first-mile request was raised by the module itself, on the default auto rule
     (after Ready To Ship · next pickup day · first slot). They sort to the TOP.
     All four ship from Cebu to the Manila hub: one point, one slot, one hub = ONE
     request (the module merges per slot) — and Cebu has no other request that
     morning, so it is not a Duplicate. */
  const autoWin = autoPickupWindow(new Date(), DEFAULT_PICKUP_MODULE_CONFIG, DEFAULT_AUTO_PICKUP)
  const autoDate = autoWin.startAt.slice(0, 10)
  const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString()
  const autoOrder = (i: number, store: StoreLocation, prId: string, o: Partial<GrowOrder>): GrowOrder => order(i, {
    storeCode: store.code, sender: store.party, status: 'Pickup Scheduled', pickupRequestId: prId, pickupDate: autoDate,
    carrier: '2GO Express', serviceType: 'Standard', ...o,
  })
  const autoOrders: GrowOrder[] = [
    autoOrder(60, cebu, 'pr141', { orderNumber: 'AUTO1K7AUTO01', createdAt: minutesAgo(4), receiver: RCV[2], inboundHubCode: 'MNL-01', trackingNumber: '2GO00141',
      pkg: { kind: 'Parcel', count: 2, weightKg: 3.2, lengthCm: 34, widthCm: 24, heightCm: 16, description: 'Phone accessories', declaredValue: 2600 } }),
    autoOrder(61, cebu, 'pr141', { orderNumber: 'AUTO2P3AUTO02', createdAt: minutesAgo(9), receiver: RCV[3], inboundHubCode: 'MNL-01', trackingNumber: '2GO00142',
      pkg: { kind: 'Parcel', count: 1, weightKg: 1.1, lengthCm: 28, widthCm: 20, heightCm: 10, description: 'Skincare set', declaredValue: 1450 } }),
    autoOrder(62, cebu, 'pr141', { orderNumber: 'AUTO5R9AUTO03', createdAt: minutesAgo(15), receiver: RCV[0], inboundHubCode: 'MNL-01', trackingNumber: '2GO00143',
      pkg: { kind: 'Parcel', count: 3, weightKg: 6.9, lengthCm: 42, widthCm: 30, heightCm: 24, description: 'Kitchenware', declaredValue: 5200 } }),
    autoOrder(63, cebu, 'pr141', { orderNumber: 'AUTO8T2AUTO04', createdAt: minutesAgo(22), receiver: RCV[1], inboundHubCode: 'MNL-01', trackingNumber: '2GO00144',
      pkg: { kind: 'Parcel', count: 1, weightKg: 2.4, lengthCm: 30, widthCm: 22, heightCm: 14, description: 'Apparel restock', declaredValue: 1900 } }),
  ]
  const orders: GrowOrder[] = [
    ...autoOrders,
    /* Drafts — saved from the stepper, never checked out */
    order(0, { orderNumber: '7PP5ZK7PPG68', paymentStatus: 'Unpaid', isDraft: true,
      draft: draftOf(STORES[0], RCV[0], [parcel({ itemInfo: 'Phone cases', quantity: 3, weight: 0.6 })]) }),
    order(1, { orderNumber: 'ZFH2Q8ZFGRTS', paymentStatus: 'Unpaid', isDraft: true,
      draft: draftOf(STORES[1], RCV[2], [parcel({ itemInfo: 'Sample kit', quantity: 1, weight: 2.4, l: 30, w: 20, h: 15 })]) }),

    /* Ready for Pickup — paid, no pickup request yet */
    order(2, { orderNumber: 'OMXH4GONRY1LS', inboundHubCode: 'MNL-01', error: 'Address line 1 is required' }),
    order(3, { orderNumber: '25X7RK25XI0G', inboundHubCode: 'MNL-01', error: 'Pincode 5000 not serviceable',
      pkg: { kind: 'Parcel', count: 2, weightKg: 4, lengthCm: 40, widthCm: 30, heightCm: 20, description: 'Office supplies', declaredValue: 3400 } }),
    order(7, { orderNumber: '7ZSIX87ZT1LS', inboundHubCode: 'CEB-01', carrier: '2GO Express', serviceType: 'Standard',
      pkg: { kind: 'Document', count: 1, weightKg: 0.2, lengthCm: 32, widthCm: 24, heightCm: 1, description: 'Signed contracts', declaredValue: 0 } }),

    /* Pickup Scheduled — o4 inside PR-000101 (San Pablo, tomorrow 09:00–13:00); o9 on its own FTL PR-000138 */
    /* a parcel request drops at ONE inbound hub — o4 and o41 both go to MNL-01 */
    order(4, { orderNumber: 'SB9DLCSB9OO0', status: 'Pickup Scheduled', storeCode: sanPablo.code, sender: sanPablo.party,
      inboundHubCode: 'MNL-01', pickupRequestId: PR_ID, pickupDate, carrier: '2GO Express', serviceType: 'Standard', trackingNumber: 'TEST_0014' }),
    order(9, { orderNumber: 'FTL7Q2FTL9KD', status: 'Pickup Scheduled', shipmentType: 'FTL', vehicleType: '8 Ton Truck', drops: [RCV[2], RCV[4]],
      vehicleUnit: 2, actualLoad: 6400,
      vehicles: [{ vehicleType: '8 Ton Truck', actualLoadKg: 4000, addressIdx: [0, 1] }, { vehicleType: '4 Ton Truck', actualLoadKg: 2400, addressIdx: [2] }],
      /* a vehicle order is never inside a parcel request — its own FTL booking PR-000138 */
      storeCode: sanPablo.code, sender: sanPablo.party, pickupRequestId: 'pr138', pickupDate,
      pkg: { kind: 'FTL', count: 12, weightKg: 6400, lengthCm: 120, widthCm: 100, heightCm: 150, description: 'Palletised FMCG stock', declaredValue: 250000 },
      carrier: '2GO Logistics', serviceType: 'Inland FTL', trackingNumber: 'FTL00012' }),

    /* ---- REVERSE orders — returns collected FROM the customer ----
       Both ship from San Pablo, whose state (Laguna) routes to MNL-01, so
       setting inboundHubCode to MNL-01 makes origin hub == destination hub and
       the chain carries NO mid-mile leg. o40 has no booking (Reverse · LM);
       o41 is inside PR-000101, which adds the first-mile collection
       (Reverse · FM-LM). Both are Paid and non-draft, so both land in the
       Pending For Planning queue. */
    order(40, { orderNumber: 'RTN9A1RTNLM1', orderType: 'Reverse Order',
      storeCode: sanPablo.code, sender: sanPablo.party, inboundHubCode: 'MNL-01',
      carrier: '2GO Express', serviceType: 'Standard',
      pkg: { kind: 'Parcel', count: 1, weightKg: 1.8, lengthCm: 28, widthCm: 20, heightCm: 12, description: 'Returned handset', declaredValue: 18500 },
      remarks: 'Customer return — wrong model shipped.' }),
    order(41, { orderNumber: 'RTN4B7RTNFM2', orderType: 'Reverse Order', status: 'Pickup Scheduled',
      storeCode: sanPablo.code, sender: sanPablo.party, inboundHubCode: 'MNL-01',
      pickupRequestId: PR_ID, pickupDate, carrier: '2GO Express', serviceType: 'Standard',
      pkg: { kind: 'Parcel', count: 2, weightKg: 3.6, lengthCm: 36, widthCm: 26, heightCm: 18, description: 'Returned apparel', declaredValue: 4200 },
      remarks: 'Customer return — size exchange, collected with the San Pablo run.' }),

    /* In flight / closed */
    order(5, { orderNumber: 'SHPLC0SHPUHC', status: 'In Transit', carrier: '2GO Express', serviceType: 'Standard', trackingNumber: 'TEST_0015', paymentMode: 'COD', codAmount: 1850 }),
    order(6, { orderNumber: '1X2KQ81X2S55', status: 'Delivered', carrier: '2GO Express', serviceType: 'Standard', trackingNumber: '2GO00080' }),
    order(8, { orderNumber: 'QW3ERTQW3E88', status: 'Undelivered', carrier: '2GO Express', serviceType: 'Standard', trackingNumber: '2GO00082', paymentMode: 'COD', codAmount: 640 }),

    /* ---- orders behind the other seeded pickup requests (so every row has weight) ---- */
    prOrder(10, 'MNL-01', { orderNumber: 'MNL5K2MNLA01', pickupRequestId: 'pr102', pickupDate: daysFromNow(1),
      pkg: { kind: 'Parcel', count: 3, weightKg: 5.4, lengthCm: 40, widthCm: 30, heightCm: 25, description: 'Apparel restock', declaredValue: 5200 } }),
    prOrder(11, 'MNL-01', { orderNumber: 'MNL5K2MNLA02', pickupRequestId: 'pr102', pickupDate: daysFromNow(1),
      pkg: { kind: 'Parcel', count: 1, weightKg: 2.1, lengthCm: 25, widthCm: 20, heightCm: 12, description: 'Skincare set', declaredValue: 1900 } }),
    prOrder(12, 'CEB-01', { orderNumber: 'CEB7T4CEBP03', pickupRequestId: 'pr103', pickupDate: daysFromNow(2),
      pkg: { kind: 'Parcel', count: 4, weightKg: 8.8, lengthCm: 50, widthCm: 40, heightCm: 30, description: 'Kitchenware', declaredValue: 7400 } }),
    prOrder(13, 'SANPABLO', { orderNumber: 'SNP1A9SNPD04', pickupRequestId: 'pr104', pickupDate: daysFromNow(0),
      pkg: { kind: 'Parcel', count: 2, weightKg: 3.2, lengthCm: 35, widthCm: 25, heightCm: 20, description: 'Laptop sleeves', declaredValue: 3100 } }),
    prOrder(14, 'SANPABLO', { orderNumber: 'SNP1A9SNPD05', inboundHubCode: 'SANPABLO', pickupRequestId: 'pr104', pickupDate: daysFromNow(0),
      pkg: { kind: 'Document', count: 1, weightKg: 0.3, lengthCm: 32, widthCm: 24, heightCm: 2, description: 'Permit papers', declaredValue: 0 } }),
    prOrder(15, 'MNL-01', { orderNumber: 'MNL8P1MNLA06', pickupRequestId: 'pr105', pickupDate: daysFromNow(0),
      pkg: { kind: 'Parcel', count: 6, weightKg: 12.5, lengthCm: 60, widthCm: 40, heightCm: 40, description: 'Pet supplies', declaredValue: 8800 } }),
    prOrder(16, 'CEB-01', { orderNumber: 'CEB3M6CEBP07', pickupRequestId: 'pr106', pickupDate: daysFromNow(0),
      pkg: { kind: 'Parcel', count: 2, weightKg: 4.6, lengthCm: 38, widthCm: 28, heightCm: 22, description: 'Mobile accessories', declaredValue: 4300 } }),
    prOrder(17, 'CEB-01', { orderNumber: 'CEB3M6CEBP08', inboundHubCode: 'SANPABLO', pickupRequestId: 'pr106', pickupDate: daysFromNow(0), paymentMode: 'COD', codAmount: 2400,
      pkg: { kind: 'Parcel', count: 1, weightKg: 1.9, lengthCm: 22, widthCm: 18, heightCm: 14, description: 'Headphones', declaredValue: 2400 } }),
    prOrder(18, 'SANPABLO', { orderNumber: 'SNP4C2SNPD09', status: 'Picked Up', pickupRequestId: 'pr107', pickupDate: daysFromNow(-3),
      carrier: '2GO Express', serviceType: 'Standard', trackingNumber: '2GO00091',
      pkg: { kind: 'Parcel', count: 5, weightKg: 9.7, lengthCm: 45, widthCm: 35, heightCm: 30, description: 'Gift hampers', declaredValue: 6600 } }),
    /* released by a failed request, but still listed on it */
    prOrder(19, 'MNL-01', { orderNumber: 'MNL2Z7MNLA10', status: 'Order Created', pickupRequestId: null, inboundHubCode: 'CEB-01',
      error: 'Pickup failed — location closed',
      pkg: { kind: 'Parcel', count: 2, weightKg: 3.8, lengthCm: 30, widthCm: 24, heightCm: 18, description: 'Stationery', declaredValue: 1500 } }),
    prOrder(20, 'CEB-01', { orderNumber: 'CEB9X3CEBP11', status: 'Order Created', pickupRequestId: null, inboundHubCode: 'MNL-01',
      pkg: { kind: 'Parcel', count: 1, weightKg: 2.6, lengthCm: 28, widthCm: 20, heightCm: 16, description: 'Board games', declaredValue: 2200 } }),

    /* ---- PR-000107, the RECONCILED handover: 4 booked, 3 of them collected ---- */
    prOrder(29, 'SANPABLO', { orderNumber: 'SNP4C2SNPD16', status: 'Picked Up', inboundHubCode: 'SANPABLO', pickupRequestId: 'pr107', pickupDate: daysFromNow(-3),
      carrier: '2GO Express', serviceType: 'Standard', trackingNumber: '2GO00092',
      pkg: { kind: 'Parcel', count: 2, weightKg: 3.5, lengthCm: 34, widthCm: 26, heightCm: 20, description: 'Apparel restock', declaredValue: 2900 } }),
    /* LEFT BEHIND — never collected, so completion released it back to Ready for
       Pickup (spec E8); PR-000107's orderIds still records that it was expected */
    prOrder(30, 'SANPABLO', { orderNumber: 'SNP4C2SNPD17', status: 'Order Created', pickupRequestId: null, pickupDate: '',
      carrier: '2GO Express', serviceType: 'Standard',
      pkg: { kind: 'Parcel', count: 1, weightKg: 2.8, lengthCm: 30, widthCm: 22, heightCm: 18, description: 'Coffee beans', declaredValue: 1800 } }),
    prOrder(31, 'SANPABLO', { orderNumber: 'SNP4C2SNPD18', status: 'Picked Up', pickupRequestId: 'pr107', pickupDate: daysFromNow(-3),
      carrier: '2GO Express', serviceType: 'Standard', trackingNumber: '2GO00093',
      pkg: { kind: 'Parcel', count: 3, weightKg: 5.2, lengthCm: 40, widthCm: 30, heightCm: 24, description: 'Home decor', declaredValue: 4100 } }),
    /* the order created AFTERWARDS for overage scan 2GO-OV-88214 — the barcode the
       driver scanned becomes the order's tracking number, and it is deliberately NOT
       in PR-000107's `orderIds`: it was never booked, only collected */
    prOrder(32, 'SANPABLO', { orderNumber: 'SNP4C2SNPD19', status: 'Picked Up', pickupRequestId: 'pr107', pickedInRequestId: 'pr107',
      pickupDate: daysFromNow(-3), carrier: '2GO Express', serviceType: 'Standard', trackingNumber: '2GO-OV-88214',
      pkg: { kind: 'Parcel', count: 1, weightKg: 1.1, lengthCm: 24, widthCm: 18, heightCm: 12, description: 'Unlabelled carton — reconciled', declaredValue: 800 } }),
    /* booked into PR-000109 but handed over on the PR-000107 run: it shows as
       "Also picked here" on 107 and "Picked in PR-000107" on 109 */
    prOrder(33, 'SANPABLO', { orderNumber: 'SNP5E1SNPD20', status: 'Picked Up', pickupRequestId: 'pr109', pickedInRequestId: 'pr107',
      pickupDate: daysFromNow(-1), carrier: '2GO Express', serviceType: 'Standard', trackingNumber: '2GO00094',
      pkg: { kind: 'Parcel', count: 2, weightKg: 4.4, lengthCm: 36, widthCm: 28, heightCm: 22, description: 'Gift hampers', declaredValue: 3600 } }),

    /* booked into PR-000107 but not collected on that run — the next van (PR-000109)
       took it, so 107 reports it as "Picked in another request" */
    prOrder(35, 'SANPABLO', { orderNumber: 'SNP4C2SNPD22', status: 'Picked Up', pickupRequestId: 'pr107', pickedInRequestId: 'pr109',
      pickupDate: daysFromNow(-1), carrier: '2GO Express', serviceType: 'Standard', trackingNumber: '2GO00095',
      pkg: { kind: 'Parcel', count: 1, weightKg: 2.0, lengthCm: 26, widthCm: 20, heightCm: 14, description: 'Board games', declaredValue: 1600 } }),

    /* the vehicle order behind the completed reserved FTL booking PR-000121 — a
       Completed request can never have zero orders (see advancePickupRequest) */
    prOrder(36, 'SANPABLO', { orderNumber: 'RFR2X8SNPD21', status: 'Picked Up', pickupRequestId: 'pr121',
      pickupDate: daysFromNow(-4), shipmentType: 'FTL', vehicleType: 'Refrigerated 8 Ton', vehicleUnit: 1, actualLoad: 5200,
      additionalServices: [], receiver: RCV[3], carrier: '2GO Logistics', serviceType: 'Inland FTL', trackingNumber: 'FTL00121',
      pkg: { kind: 'FTL', count: 8, weightKg: 5200, lengthCm: 120, widthCm: 100, heightCm: 150, description: 'Chilled ready meals', declaredValue: 96000 } }),

    /* a paid FTL order still waiting for a pickup — Book a Pickup gives every
       vehicle order a group of its own, and this is what makes that visible */
    order(34, { orderNumber: 'FTL8K3FTLR21', shipmentType: 'FTL', vehicleType: '4 Ton Truck', vehicleUnit: 1, actualLoad: 3400,
      additionalServices: [], storeCode: sanPablo.code, sender: sanPablo.party, inboundHubCode: 'MNL-01',
      carrier: '2GO Logistics', serviceType: 'Inland FTL',
      pkg: { kind: 'FTL', count: 9, weightKg: 3400, lengthCm: 120, widthCm: 100, heightCm: 140, description: 'Palletised beverage stock', declaredValue: 128000 } }),
    /* the two overdue requests */
    prOrder(21, 'SANPABLO', { orderNumber: 'SNP6B8SNPD12', pickupRequestId: 'pr110', pickupDate: daysFromNow(-2),
      pkg: { kind: 'Parcel', count: 3, weightKg: 6.3, lengthCm: 42, widthCm: 32, heightCm: 26, description: 'Coffee beans', declaredValue: 3900 } }),
    prOrder(22, 'MNL-01', { orderNumber: 'MNL7Q5MNLA13', pickupRequestId: 'pr111', pickupDate: daysFromNow(-5),
      pkg: { kind: 'Parcel', count: 8, weightKg: 15.2, lengthCm: 60, widthCm: 45, heightCm: 40, description: 'Seasonal stock', declaredValue: 11200 } }),
    /* the duplicate pair (same store + window) */
    prOrder(23, 'SANPABLO', { orderNumber: 'SNP0D4SNPD14', pickupRequestId: 'pr112', pickupDate: daysFromNow(2),
      pkg: { kind: 'Parcel', count: 2, weightKg: 4.1, lengthCm: 34, widthCm: 26, heightCm: 20, description: 'Home decor', declaredValue: 2800 } }),
    prOrder(24, 'SANPABLO', { orderNumber: 'SNP0D4SNPD15', pickupRequestId: 'pr113', pickupDate: daysFromNow(2),
      pkg: { kind: 'Parcel', count: 1, weightKg: 1.4, lengthCm: 24, widthCm: 18, heightCm: 12, description: 'Candles', declaredValue: 900 } }),
    /* the four orders attached AFTER the reserved booking PR-000115 was raised */
    prOrder(25, 'MNL-01', { orderNumber: 'BLD1K5MNLB01', pickupRequestId: 'pr115', pickupDate: daysFromNow(1),
      pkg: { kind: 'Parcel', count: 2, weightKg: 3.4, lengthCm: 32, widthCm: 24, heightCm: 18, description: 'Sneakers', declaredValue: 4600 } }),
    prOrder(26, 'MNL-01', { orderNumber: 'BLD1K5MNLB02', pickupRequestId: 'pr115', pickupDate: daysFromNow(1),
      pkg: { kind: 'Parcel', count: 1, weightKg: 1.8, lengthCm: 26, widthCm: 20, heightCm: 14, description: 'Watch strap', declaredValue: 1300 } }),
    prOrder(27, 'MNL-01', { orderNumber: 'BLD1K5MNLB03', inboundHubCode: 'SANPABLO', pickupRequestId: 'pr115', pickupDate: daysFromNow(1),
      pkg: { kind: 'Parcel', count: 2, weightKg: 4.2, lengthCm: 36, widthCm: 28, heightCm: 22, description: 'Backpacks', declaredValue: 5100 } }),
    prOrder(28, 'MNL-01', { orderNumber: 'BLD1K5MNLB04', pickupRequestId: 'pr115', pickupDate: daysFromNow(1),
      pkg: { kind: 'Parcel', count: 1, weightKg: 2.3, lengthCm: 28, widthCm: 22, heightCm: 16, description: 'Sunglasses', declaredValue: 2700 } }),
  ]

  /* The hand-written requests, incl. 2 overdue and the ONE duplicate pair
     (Cancelled lives on PR-000130 below). Every parcel request here drops at
     ONE inbound hub, and no vehicle order sits inside a parcel request. */
  const pickupRequests: GrowPickupRequest[] = [
    /* the AUTO-raised request: four consignments, one point, one slot, one hub (the module's default window) */
    { ...pr(141, cebu.code, autoDate, PICKUP_SLOTS[0], 'Requested', ['o60', 'o61', 'o62', 'o63'], 0,
        'Raised automatically — consignments reached Ready To Ship.'),
      startAt: autoWin.startAt, endAt: autoWin.endAt, slot: slotFrom(autoWin.startAt, autoWin.endAt),
      createdAt: minutesAgo(22), statusHistory: [
        { status: 'Requested', at: minutesAgo(22), note: 'Auto pickup · after Ready To Ship · AUTO8T2AUTO04' },
        { status: 'Requested', at: minutesAgo(4), note: 'Merged AUTO1K7AUTO01, AUTO2P3AUTO02, AUTO5R9AUTO03 — same point, same slot' },
      ] },
    pr(101, sanPablo.code, pickupDate, PICKUP_SLOTS[0], 'Requested', ['o4', 'o41'], 1, 'Dock 2 — ask for the dispatch desk.'),
    /* o9's dedicated vehicle booking — FTL never rides inside a parcel request.
       The evening slot keeps it clear of PR-000101 / 122 at the same point (no Duplicate). */
    { ...pr(138, sanPablo.code, pickupDate, PICKUP_SLOTS[2], 'Requested', ['o9'], 1, 'Two trucks — 8 Ton loads first.'),
      shipmentType: 'FTL', vehicleType: '8 Ton Truck', vehicleUnit: 2, ftlServiceType: 'Inland FTL', shipTo: RCV[2] },
    pr(102, 'MNL-01', daysFromNow(1), PICKUP_SLOTS[1], 'Requested', ['o10', 'o11'], 1),
    /* an OVERNIGHT window — the end lands on the following day */
    pr(103, 'CEB-01', daysFromNow(2), '21:00–02:00', 'Requested', ['o12'], 2, 'Call the warehouse 30 min ahead.'),
    /* today's open requests end late in the evening, so a demo run in the
       afternoon still reads them as live rather than Overdue */
    /* Requested, not Ready For Last Mile Dispatch: a request past Requested is on
       a trip (or with a carrier), and this one is on neither */
    pr(104, sanPablo.code, daysFromNow(0), '17:00–23:30', 'Requested', ['o13', 'o14'], 2),
    pr(105, 'MNL-01', daysFromNow(0), '13:00–23:30', 'Assigned', ['o15'], 3),
    pr(106, 'CEB-01', daysFromNow(0), '09:00–23:30', 'Out For Pickup', ['o16', 'o17'], 3),
    /* RECONCILED — the one completed handover that did not go to plan: three of
       four booked orders collected, one order that belonged to PR-000109 handed
       over anyway, and two barcodes that matched nothing at all */
    { ...pr(107, sanPablo.code, daysFromNow(-3), PICKUP_SLOTS[0], 'Completed', ['o18', 'o29', 'o30', 'o31', 'o35'], 5),
      pickedOrderIds: ['o18', 'o29', 'o31', 'o33'], overages: OVERAGES_107 },
    pr(108, 'MNL-01', daysFromNow(-4), PICKUP_SLOTS[1], 'Pickup Failed', ['o19'], 6, 'Location closed on arrival.'),
    /* the OTHER side of the same story: its own order went out on the earlier
       PR-000107 run, and it collected one of PR-000107's leftovers instead */
    { ...pr(109, sanPablo.code, daysFromNow(-1), PICKUP_SLOTS[2], 'Completed', ['o33'], 4, 'Second van of the week.'),
      pickedOrderIds: ['o35'] },
    /* overdue: open, but the window closed days ago */
    pr(110, sanPablo.code, daysFromNow(-2), PICKUP_SLOTS[0], 'Requested', ['o21'], 4),
    pr(111, 'MNL-01', daysFromNow(-5), PICKUP_SLOTS[1], 'Requested', ['o22'], 7),
    /* duplicate: same store + date + slot, both still open */
    pr(112, sanPablo.code, daysFromNow(2), PICKUP_SLOTS[1], 'Requested', ['o23'], 1),
    pr(113, sanPablo.code, daysFromNow(2), PICKUP_SLOTS[1], 'Requested', ['o24'], 1),
    /* reserved: booked ahead of the orders — nothing attached yet */
    blindPr(114, 'CEB-01', daysFromNow(3), PICKUP_SLOTS[1], 'Requested', [], 1, {
      pieces: 12, weight: 40, sizeClass: 'Pallet',
      instructions: 'Pallet jack needed — goods are shrink-wrapped on one pallet.',
      note: 'Warehouse promised the stock transfer by Tuesday.',
    }),
    /* reserved + FTL: a dedicated truck booked before the vehicle order exists */
    blindPr(116, sanPablo.code, daysFromNow(3), PICKUP_SLOTS[0], 'Requested', [], 1, {
      shipmentType: 'FTL', pieces: 14, weight: 6400, vehicleType: '8 Ton Truck', vehicleUnit: 1,
      shipTo: RCV[2],
      instructions: 'Driver to report to the weighbridge before loading.',
      note: 'Stock is being consolidated — the vehicle order follows.',
    }),
    /* more reserved FTL examples — Ship To unknown, multi-vehicle, overnight window, custom pickup point */
    blindPr(119, 'CEB-01', daysFromNow(2), PICKUP_SLOTS[1], 'Requested', [], 1, {
      shipmentType: 'FTL', pieces: 20, weight: 12000, vehicleType: '14 Ton Truck', vehicleUnit: 2,
      shipTo: null,
      instructions: 'Two trucks — load the export cartons first.',
      note: 'Destination depends on which distributor confirms; Ship To to be added.',
    }),
    blindPr(120, 'MNL-01', daysFromNow(1), '21:00–02:00', 'Assigned', [], 3, {
      shipmentType: 'FTL', pieces: 30, weight: 28000, vehicleType: 'Superlink (34 Ton)', vehicleUnit: 1,
      shipTo: RCV[4],
      instructions: 'Night loading — security gate 3, driver needs a gate pass.',
      note: 'Interisland trip to Cebu; overnight window agreed with the hub.',
    }),
    blindPr(121, sanPablo.code, daysFromNow(-4), PICKUP_SLOTS[0], 'Completed', ['o36'], 6, {
      shipmentType: 'FTL', pieces: 8, weight: 5200, vehicleType: 'Refrigerated 8 Ton', vehicleUnit: 1,
      shipFrom: RCV[1], shipTo: RCV[3],
      instructions: 'Reefer must be pre-cooled to 4°C before loading.',
      note: 'Picked up from the co-packer, not from the hub.',
    }),
    /* reserved: four of the six expected orders have since been attached */
    blindPr(115, 'MNL-01', daysFromNow(1), PICKUP_SLOTS[2], 'Requested', ['o25', 'o26', 'o27', 'o28'], 2, {
      pieces: 6, weight: 14, sizeClass: 'Medium box',
      note: 'Two more orders still being packed.',
    }),
  ]
  const bulk = bulkVolume()
  /* FarEye CREATED vs READY_TO_SHIP (owner, 2026-09-25): of the paid consignments
     not yet in a pickup request, the EVEN ids have been marked ready to ship; the
     rest still read Created / Label Generated. Index math, never random. */
  const allOrders = [...orders, ...bulk.orders].map((o) => ({
    ...o,
    readyToShip: o.paymentStatus === 'Paid' && !o.isDraft && o.status === 'Order Created'
      && !o.pickupRequestId && !o.orderNumber.startsWith('AUTO')
      && Number(o.id.replace(/\D/g, '')) % 2 === 0,
  }))
  const byId = new Map(allOrders.map((o) => [o.id, o]))
  /* a parcel request drops at ONE inbound hub — the hub its orders are going to.
     FTL carries its destination in `shipTo`, and a reserved slot has none yet. */
  const allRequests = [...pickupRequests, ...bulk.pickupRequests]
    .map((p) => (p.blind || p.shipmentType === 'FTL' || p.orderIds.length === 0
      ? p
      : { ...p, destinationCode: byId.get(p.orderIds[0])?.inboundHubCode ?? null }))
    /* a COMPLETED request with no reconciliation recorded means the ordinary case —
       the driver collected everything that was booked. Only the requests that
       deliberately tell a different story (107, 109) carry their own list. */
    .map((p) => (p.status === 'Completed' && p.pickedOrderIds.length === 0
      ? { ...p, pickedOrderIds: [...p.orderIds] }
      : p))
    .map(withExecution)
  /* the live staging pull (owner, 2026-09-24) sits under the demo rows, newest first */
  return { stores: [...STORES, ...STAGING_STORES], orders: [...allOrders, ...STAGING_CONSIGNMENTS], pickupRequests: allRequests, hubOverages: [] }
}
