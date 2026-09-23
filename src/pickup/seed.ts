/**
 * Seed narrative for the Pickup Request demo.
 *
 * It mirrors the CTO's slide-1 scenario end to end, so the demo tells his story:
 *
 *   O1 (Ebenisterie L'Art et le Bois, Laval)  → C1 C2 C3, all first-mile, on the
 *      LIVE trip T-0002 under PR-0001 (IN_PROGRESS, scan based, driver already
 *      arrived) — so the driver app opens straight into an active pickup.
 *   O2 (Tractor Supply Co., Chicago)          → C4 C5, first-mile, NOT linked to
 *      any PR — this is the pending pool you raise a brand-new PR against on stage.
 *      C6 (also O2) is non-scannable (SKU picking) and is carried by PR-0005.
 *   C7 C8                                     → pure last-mile rows already at the
 *      facility, so Pending-for-Planning shows both legs side by side.
 *   PR-0002                                   → OPEN *blind* PR (5 pieces declared,
 *      no consignments) — soft data follows.
 *   PR-0003                                   → FAILED blind PR from yesterday, so
 *      the re-attempt flow is demoable.
 *   PR-0004                                   → COMPLETED yesterday (on trip T-0001,
 *      the pre-seeded history), with two overages: one already reconciled (created
 *      CX-1 off soft data) and one still open (TN-STRAY-91) so the Overages tab has
 *      live work in it.
 *   PR-0005                                   → OPEN count-based + SKU PR carrying C6
 *      (non-scannable), so the driver app's count-counter and SKU-picking screens
 *      are reachable.
 *
 * Everything is date-relative (`new Date()`), so the demo never goes stale.
 * This module must not import from store.ts — the dependency runs seed → store.
 */
import type { Carrier, DemoConsignment, Overage, PickupConfig, PickupRequest, PickupDb, Trip } from './types'

/* ---------------- date helpers (dynamic, never stale) ---------------- */

/** `YYYY-MM-DD`, offset in days from today. */
export function isoDate(offsetDays = 0): string {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  return d.toISOString().slice(0, 10)
}

/** ISO timestamp for `HH:mm` on a day offset from today. */
export function isoAt(offsetDays: number, hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number)
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  d.setHours(h, m, 0, 0)
  return d.toISOString()
}

export const TODAY = isoDate(0)
export const YESTERDAY = isoDate(-1)

/* ---------------- catalogs ---------------- */

export interface MerchantInfo {
  code: string
  name: string
  locationCodes: string[]
}

export interface LocationInfo {
  code: string
  name: string
  merchantCode: string
  address: string
  city: string
  contactName: string
  contactPhone: string
}

/** The sorting facility every first-mile pickup is handed over at. */
export const HUB = 'ORD Sorting Center'

export const MERCHANTS: Record<string, MerchantInfo> = {
  'M-EBW': {
    code: 'M-EBW',
    name: "Ebenisterie L'Art et le Bois",
    locationCodes: ['LOC-LAVAL'],
  },
  'M-TSC': {
    code: 'M-TSC',
    name: 'Tractor Supply Co.',
    locationCodes: ['LOC-CHI'],
  },
}

export const LOCATIONS: Record<string, LocationInfo> = {
  'LOC-LAVAL': {
    code: 'LOC-LAVAL',
    name: 'Laval Workshop',
    merchantCode: 'M-EBW',
    address: '270 Rue Beauchamps, Laval, QC H7L 5A6',
    city: 'Laval',
    contactName: 'LUC CHARBONNEAU',
    contactPhone: '(563)-345-676',
  },
  'LOC-CHI': {
    code: 'LOC-CHI',
    name: 'Chicago Store',
    merchantCode: 'M-TSC',
    address: '65 State St, Chicago, IL 60603',
    city: 'Chicago',
    contactName: 'DANA WHITFIELD',
    contactPhone: '(312)-555-0142',
  },
}

/* ---------------- carriers ---------------- */

/**
 * Who performs the pickup/delivery. `CR-SUP` mirrors the real staging carrier
 * name ("Supercharged Deliveries"). A PR / trip / consignment references a
 * carrier by code; undefined ⇒ "Unassigned" in the UI.
 */
export const CARRIERS: Record<string, Carrier> = {
  'CR-SUP': { code: 'CR-SUP', name: 'Supercharged Deliveries', driver: 'R. Sharma', vehicle: 'MH-01-AB-1234', mode: 'CARRIER' },
  'CR-OWN': { code: 'CR-OWN', name: 'Captive Fleet', driver: 'A. Dubois', vehicle: 'QC-04-CF-8821', mode: 'FLEET' },
  'CR-BLZ': { code: 'CR-BLZ', name: 'BlueDart Express', driver: 'M. Chen', vehicle: 'IL-77-BD-3390', mode: 'CARRIER' },
}

export const CARRIER_LIST = Object.values(CARRIERS)

/** `{ carrierCode, carrierName }` for a code — spread onto any carrier-bearing row. */
function carrier(code: string): { carrierCode: string; carrierName: string } {
  return { carrierCode: code, carrierName: CARRIERS[code].name }
}

export const MERCHANT_LIST = Object.values(MERCHANTS)
export const LOCATION_LIST = Object.values(LOCATIONS)

/** Locations a merchant can raise a pickup from (`ALL` merchants ⇒ everything). */
export function locationsForMerchant(merchantCode: string): LocationInfo[] {
  if (merchantCode === 'ALL') return LOCATION_LIST
  return LOCATION_LIST.filter((l) => l.merchantCode === merchantCode)
}

/* ---------------- config ---------------- */

export const DEFAULT_CONFIG: PickupConfig = {
  multiPrPolicy: 'ONE_PER_SLOT',
  slots: [
    { start: '08:00', end: '10:00' },
    { start: '10:00', end: '12:00' },
    { start: '12:00', end: '14:00' },
    { start: '14:00', end: '16:00' },
    { start: '16:00', end: '18:00' },
  ],
  trackingRegex: '^TN-[A-Z0-9-]{4,}$',
  autoCreateRules: [
    { id: 'AR-1', merchantCode: 'M-EBW', locationCode: 'LOC-LAVAL', enabled: false },
  ],
}

/* ---------------- seed ---------------- */

function piece(tn: string, weightKg?: number) {
  return { trackingNumber: tn, scanned: false, weightKg }
}

function seedConsignments(): DemoConsignment[] {
  const ebw = { merchantCode: 'M-EBW', merchantName: MERCHANTS['M-EBW'].name }
  const tsc = { merchantCode: 'M-TSC', merchantName: MERCHANTS['M-TSC'].name }

  return [
    /* ---- Order O1 — Laval workshop, already gathered under PR-0001 ---- */
    {
      id: 'C1', orderId: 'O1', ...ebw, pickupLocationCode: 'LOC-LAVAL',
      deliveryName: 'D1 · Marie Tremblay', deliveryAddress: '1440 Rue Sherbrooke O, Apt 12', deliveryCity: 'Montreal',
      pieces: [piece('TN-C1-1', 14), piece('TN-C1-2', 9)],
      state: 'CREATED', leg: 'FIRST_MILE', linkedPrId: 'PR-0001', tripId: 'T-0002',
      weightKg: 23, scannable: true, ...carrier('CR-SUP'),
    },
    {
      id: 'C2', orderId: 'O1', ...ebw, pickupLocationCode: 'LOC-LAVAL',
      deliveryName: 'D2 · Pierre Gagnon', deliveryAddress: '88 Boulevard Saint-Laurent', deliveryCity: 'Montreal',
      pieces: [piece('TN-C2-1', 31)],
      state: 'CREATED', leg: 'FIRST_MILE', linkedPrId: 'PR-0001', tripId: 'T-0002',
      weightKg: 31, scannable: true, ...carrier('CR-SUP'),
    },
    {
      id: 'C3', orderId: 'O1', ...ebw, pickupLocationCode: 'LOC-LAVAL',
      deliveryName: 'D3 · Sophie Belanger', deliveryAddress: '7 Avenue du Parc', deliveryCity: 'Quebec City',
      pieces: [piece('TN-C3-1', 12), piece('TN-C3-2', 12)],
      state: 'CREATED', leg: 'FIRST_MILE', linkedPrId: 'PR-0001', tripId: 'T-0002',
      weightKg: 24, scannable: true, ...carrier('CR-SUP'),
    },

    /* ---- Order O2 — Chicago store, the pending pool (no PR yet) ---- */
    {
      id: 'C4', orderId: 'O2', ...tsc, pickupLocationCode: 'LOC-CHI',
      deliveryName: 'D4 · Hank Morrison', deliveryAddress: '2201 W Lake St', deliveryCity: 'Chicago',
      pieces: [piece('TN-C4-1', 18), piece('TN-C4-2', 18)],
      state: 'CREATED', leg: 'FIRST_MILE', linkedPrId: null, tripId: null,
      weightKg: 36, scannable: true, ...carrier('CR-OWN'),
    },
    {
      id: 'C5', orderId: 'O2', ...tsc, pickupLocationCode: 'LOC-CHI',
      deliveryName: 'D5 · Rita Alvarez', deliveryAddress: '910 N Michigan Ave, Ste 400', deliveryCity: 'Chicago',
      pieces: [piece('TN-C5-1', 7)],
      state: 'CREATED', leg: 'FIRST_MILE', linkedPrId: null, tripId: null,
      weightKg: 7, scannable: true, ...carrier('CR-OWN'),
    },
    {
      // non-scannable: the driver picks by SKU, not by scanning piece labels;
      // linked to PR-0005 so the count-based / SKU-picking driver screens are reachable
      id: 'C6', orderId: 'O2', ...tsc, pickupLocationCode: 'LOC-CHI',
      deliveryName: 'D6 · Grover Hardware', deliveryAddress: '55 E Monroe St, Dock 2', deliveryCity: 'Chicago',
      pieces: [],
      state: 'CREATED', leg: 'FIRST_MILE', linkedPrId: 'PR-0005', tripId: null,
      weightKg: 42, scannable: false, ...carrier('CR-OWN'),
      skus: [
        { code: 'SKU-BLND', name: 'Blinds', qty: 4 },
        { code: 'SKU-RAIL', name: 'Curtain rails', qty: 2 },
      ],
    },

    /* ---- Pure last-mile rows, already at the facility ---- */
    {
      id: 'C7', orderId: 'O3', ...tsc, pickupLocationCode: null,
      deliveryName: 'D7 · Elena Ruiz', deliveryAddress: '4120 S Ashland Ave', deliveryCity: 'Chicago',
      pieces: [{ trackingNumber: 'TN-C7-1', scanned: true, weightKg: 5 }],
      state: 'AT_FACILITY', leg: 'LAST_MILE', linkedPrId: null, tripId: null,
      weightKg: 5, scannable: true, ...carrier('CR-SUP'),
    },
    {
      id: 'C8', orderId: 'O3', ...tsc, pickupLocationCode: null,
      deliveryName: 'D8 · Northside Cafe', deliveryAddress: '1712 W Division St', deliveryCity: 'Chicago',
      pieces: [{ trackingNumber: 'TN-C8-1', scanned: true, weightKg: 11 }],
      state: 'AT_FACILITY', leg: 'LAST_MILE', linkedPrId: null, tripId: null,
      weightKg: 11, scannable: true, ...carrier('CR-BLZ'),
    },

    /* ---- Yesterday's completed pickup (PR-0004) ---- */
    {
      id: 'C9', orderId: 'O4', ...ebw, pickupLocationCode: 'LOC-LAVAL',
      deliveryName: 'D9 · Atelier Rivard', deliveryAddress: '300 Rue Notre-Dame E', deliveryCity: 'Montreal',
      pieces: [{ trackingNumber: 'TN-C9-1', scanned: true, weightKg: 16 }],
      state: 'AT_FACILITY', leg: 'FIRST_MILE', linkedPrId: 'PR-0004', tripId: 'T-0001',
      weightKg: 16, scannable: true, ...carrier('CR-SUP'),
    },
    {
      // born from soft data arriving after a stray scan on PR-0004 — the happy
      // ending of the overage lifecycle, pre-seeded so the tab has both outcomes
      id: 'CX-1', orderId: 'O4', ...ebw, pickupLocationCode: 'LOC-LAVAL',
      deliveryName: 'D10 · Boiserie Lemieux', deliveryAddress: '55 Rue Saint-Paul O', deliveryCity: 'Montreal',
      pieces: [{ trackingNumber: 'TN-SOFT-77', scanned: true, weightKg: 6 }],
      state: 'AT_FACILITY', leg: 'FIRST_MILE', linkedPrId: 'PR-0004', tripId: null,
      weightKg: 6, scannable: true, createdVia: 'SOFT_DATA', ...carrier('CR-SUP'),
    },
  ]
}

function seedPickupRequests(): PickupRequest[] {
  const laval = LOCATIONS['LOC-LAVAL']
  const chi = LOCATIONS['LOC-CHI']

  return [
    {
      id: 'PR-0001',
      merchantCode: 'M-EBW', merchantName: MERCHANTS['M-EBW'].name,
      locationCode: laval.code, locationName: laval.name, address: laval.address,
      contactName: laval.contactName, contactPhone: laval.contactPhone,
      slot: { date: TODAY, start: '10:00', end: '12:00' },
      blind: false, expectedPieces: 5, scannable: true,
      consignmentIds: ['C1', 'C2', 'C3'],
      source: 'GROW', createdAt: isoAt(0, '07:40'), createdBy: 'luc.charbonneau@ebw.ca',
      ...carrier('CR-SUP'),
      // live on today's trip T-0002 so /driver opens straight into an active pickup
      status: 'IN_PROGRESS', attempt: 1, maxAttempts: 3, tripId: 'T-0002',
      events: [
        { at: isoAt(0, '07:40'), label: 'Pickup request raised', detail: '3 consignments · 5 pieces', actor: 'Grow portal' },
        { at: isoAt(0, '08:30'), label: 'Planned on trip T-0002', detail: 'Route 2 · R. Sharma · MH-01-AB-1234', actor: 'Dispatch' },
        { at: isoAt(0, '09:05'), label: 'Driver arrived', detail: laval.address, actor: 'R. Sharma' },
      ],
    },
    {
      id: 'PR-0002',
      merchantCode: 'M-TSC', merchantName: MERCHANTS['M-TSC'].name,
      locationCode: chi.code, locationName: chi.name, address: chi.address,
      contactName: chi.contactName, contactPhone: chi.contactPhone,
      slot: { date: TODAY, start: '14:00', end: '16:00' },
      blind: true, expectedPieces: 5, scannable: true,
      consignmentIds: [],
      source: 'API', createdAt: isoAt(0, '08:05'), createdBy: 'tsc-integration',
      ...carrier('CR-OWN'),
      status: 'OPEN', attempt: 1, maxAttempts: 3,
      events: [
        { at: isoAt(0, '08:05'), label: 'Blind pickup request raised', detail: 'Blind pickup — soft data to follow', actor: 'API' },
      ],
    },
    {
      id: 'PR-0003',
      merchantCode: 'M-TSC', merchantName: MERCHANTS['M-TSC'].name,
      locationCode: chi.code, locationName: chi.name, address: chi.address,
      contactName: chi.contactName, contactPhone: chi.contactPhone,
      slot: { date: YESTERDAY, start: '08:00', end: '10:00' },
      blind: true, expectedPieces: 3, scannable: true,
      consignmentIds: [],
      source: 'CFT', createdAt: isoAt(-1, '06:55'), createdBy: 'cft.desk',
      ...carrier('CR-SUP'),
      status: 'FAILED', attempt: 1, maxAttempts: 3,
      failureReason: 'Location closed',
      events: [
        { at: isoAt(-1, '06:55'), label: 'Blind pickup request raised', detail: '3 pieces declared', actor: 'CFT' },
        { at: isoAt(-1, '08:20'), label: 'Driver arrived', actor: 'R. Sharma' },
        { at: isoAt(-1, '08:31'), label: 'Pickup failed', detail: 'Location closed', actor: 'R. Sharma' },
      ],
    },
    {
      id: 'PR-0004',
      merchantCode: 'M-EBW', merchantName: MERCHANTS['M-EBW'].name,
      locationCode: laval.code, locationName: laval.name, address: laval.address,
      contactName: laval.contactName, contactPhone: laval.contactPhone,
      slot: { date: YESTERDAY, start: '10:00', end: '12:00' },
      blind: false, expectedPieces: 1, scannable: true,
      consignmentIds: ['C9'],
      source: 'GROW', createdAt: isoAt(-1, '07:10'), createdBy: 'luc.charbonneau@ebw.ca',
      ...carrier('CR-SUP'),
      status: 'COMPLETED', attempt: 1, maxAttempts: 3, tripId: 'T-0001',
      events: [
        { at: isoAt(-1, '07:10'), label: 'Pickup request raised', detail: '1 consignment · 1 piece', actor: 'Grow portal' },
        { at: isoAt(-1, '09:00'), label: 'Planned on trip T-0001', actor: 'Dispatch' },
        { at: isoAt(-1, '10:15'), label: 'Driver arrived', actor: 'R. Sharma' },
        { at: isoAt(-1, '10:22'), label: 'Piece scanned', detail: 'TN-C9-1', actor: 'R. Sharma' },
        { at: isoAt(-1, '10:24'), label: 'Overage recorded', detail: 'TN-SOFT-77 — not expected on this pickup', actor: 'R. Sharma' },
        { at: isoAt(-1, '10:25'), label: 'Overage recorded', detail: 'TN-STRAY-91 — not expected on this pickup', actor: 'R. Sharma' },
        { at: isoAt(-1, '10:30'), label: 'Pickup completed', detail: '1 of 1 expected pieces + 2 overages', actor: 'R. Sharma' },
        { at: isoAt(-1, '15:40'), label: 'Handover at facility', detail: `${HUB} · 3 pieces confirmed`, actor: 'Debrief desk' },
        { at: isoAt(-1, '16:05'), label: 'Overage reconciled', detail: 'TN-SOFT-77 → CX-1 (soft data received)', actor: 'System' },
      ],
    },
    {
      // OPEN count-based + SKU-picking PR (non-scannable) carrying C6, so the
      // driver app's count-counter (UC6) and SKU-picking (UC7) screens are reachable.
      id: 'PR-0005',
      merchantCode: 'M-TSC', merchantName: MERCHANTS['M-TSC'].name,
      locationCode: chi.code, locationName: chi.name, address: chi.address,
      contactName: chi.contactName, contactPhone: chi.contactPhone,
      slot: { date: TODAY, start: '16:00', end: '18:00' },
      blind: false, expectedPieces: null, scannable: false, skuMode: true,
      consignmentIds: ['C6'],
      source: 'CFT', createdAt: isoAt(0, '08:20'), createdBy: 'dana.whitfield@tsc.com',
      ...carrier('CR-OWN'),
      status: 'OPEN', attempt: 1, maxAttempts: 3,
      events: [
        { at: isoAt(0, '08:20'), label: 'Pickup request raised', detail: '1 consignment · SKU picking (count-based)', actor: 'CFT' },
      ],
    },
  ]
}

function seedOverages(): Overage[] {
  return [
    {
      id: 'OVG-0001',
      scannedTrackingNumber: 'TN-SOFT-77', validTracking: true,
      scannedBy: 'R. Sharma', scannedAt: isoAt(-1, '10:24'),
      prId: 'PR-0004', tripId: 'T-0001', locationCode: 'LOC-LAVAL',
      state: 'AT_FACILITY', reconciled: true, reconciledConsignmentId: 'CX-1',
      kind: 'UNKNOWN_SCAN',
      note: 'Soft data arrived after handover — consignment CX-1 created automatically.',
    },
    {
      id: 'OVG-0002',
      scannedTrackingNumber: 'TN-STRAY-91', validTracking: true,
      scannedBy: 'R. Sharma', scannedAt: isoAt(-1, '10:25'),
      prId: 'PR-0004', tripId: 'T-0001', locationCode: 'LOC-LAVAL',
      state: 'AT_FACILITY', reconciled: false,
      kind: 'UNKNOWN_SCAN',
      note: 'Awaiting soft data from the merchant.',
    },
  ]
}

/**
 * Yesterday's completed trip. Pre-seeding it does two jobs:
 *  - it resolves the dangling `tripId: 'T-0001'` references on PR-0004 and its
 *    two overages against a real Trip, and
 *  - because `nextTripId()` parses the numeric suffix, T-0001 being present makes
 *    the user's FIRST planned trip 'T-0002' — no collision with this history.
 */
function seedTrips(): Trip[] {
  const cr = CARRIERS['CR-SUP']
  return [
    {
      id: 'T-0001',
      routeName: 'Route 1',
      driver: cr.driver, vehicle: cr.vehicle,
      carrierCode: cr.code, carrierName: cr.name,
      date: YESTERDAY,
      status: 'COMPLETED',
      stops: [
        { seq: 1, kind: 'PICKUP', prId: 'PR-0004', eta: '10:00', status: 'DONE' },
        { seq: 2, kind: 'DELIVERY', consignmentId: 'C9', eta: '11:00', status: 'DONE' },
      ],
      loads: { firstLeg: ['PR-0004'], lastLeg: ['C9'] },
    },
    {
      // Today's LIVE trip, mirroring what planTrip() produces for PR-0001, so the
      // driver app (/driver) opens straight into an active pickup on a fresh reset
      // instead of "No trip assigned". The driver has already arrived at the pickup
      // (seq 1 ARRIVED); the three delivery legs are still PENDING.
      id: 'T-0002',
      routeName: 'Route 2',
      driver: cr.driver, vehicle: cr.vehicle,
      carrierCode: cr.code, carrierName: cr.name,
      date: TODAY,
      status: 'IN_PROGRESS',
      stops: [
        { seq: 1, kind: 'PICKUP', prId: 'PR-0001', eta: '09:00', status: 'ARRIVED' },
        { seq: 2, kind: 'DELIVERY', consignmentId: 'C1', eta: '10:00', status: 'PENDING' },
        { seq: 3, kind: 'DELIVERY', consignmentId: 'C2', eta: '11:00', status: 'PENDING' },
        { seq: 4, kind: 'DELIVERY', consignmentId: 'C3', eta: '12:00', status: 'PENDING' },
      ],
      loads: { firstLeg: ['PR-0001'], lastLeg: ['C1', 'C2', 'C3'] },
    },
  ]
}

/** A fresh demo database. Called on first load and by `pickupActions.resetDemo()`. */
export function seed(): PickupDb {
  return {
    pickupRequests: seedPickupRequests(),
    consignments: seedConsignments(),
    overages: seedOverages(),
    trips: seedTrips(),
    config: DEFAULT_CONFIG,
    seededAt: new Date().toISOString(),
  }
}
