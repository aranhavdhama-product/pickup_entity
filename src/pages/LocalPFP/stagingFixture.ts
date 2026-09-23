/**
 * DEV-ONLY fixture: staging's own first page, transcribed.
 *
 * Why it exists: the pixel diff compares OUR chrome against staging's, and a
 * table full of different text can never converge — the text bands would differ on
 * content, not on layout, and would mask a real chrome regression. Appending
 * `?fixture=staging` to `/local/pending-for-planning` swaps the local Grow rows
 * for these, so a diff run measures chrome and geometry only.
 *
 * It is NOT sample data for the product: nothing reads it unless the query
 * parameter is present, and the build tree-shakes nothing away only because the
 * page imports it directly — which is deliberate, so the numbers below stay
 * type-checked against the row shape the table renders.
 *
 * Transcribed 2026-09-18 from staging's page 1 of `Total Orders 101`, on the
 * SEKO skin (the earlier `scratchpad/pfp` inventory was the HelloFresh skin —
 * same chrome, different rows).
 */
import type { CategoryFlag } from './adapter'

export interface FixtureRow {
  flags: CategoryFlag[]
  /** staging renders a literal "-" in the flags cell when a row has none */
  flagsDash: boolean
  orderNumber: string
  referenceNumber: string
  shipByDate: string
  state: string
  carrier: string
  secondaryState: string
  dispatchDate: string
  weight: string
  volume: string
  palletSpaces: string
  sku: string
  serviceTime: string
  tag: string
  specialInstructions: string
  merchant: string
  orderType: string
  ageing: string
  address: string
}

/** the stat strip above the table, verbatim */
export const FIXTURE_STATS = {
  totalOrders: '101',
  weight: '2,617.05 kg',
  volume: '35,741,743.6 mm³',
  palletSpaces: '93',
}

/** the Categories chips, verbatim (counts included) */
export const FIXTURE_CATEGORIES: { label: CategoryFlag; count: number }[] = [
  { label: 'VIP', count: 72 },
  { label: 'Stackable', count: 29 },
  { label: 'Hazmat', count: 19 },
  { label: 'Fragile', count: 49 },
]

export const FIXTURE_CARRIERS = ['DSP 1', 'DSP 2', 'Supercharged Deliveries', 'No Carrier']

export const FIXTURE_DATE_RANGE = { from: '2026-09-12', to: '2026-09-18' }

/* Staging's rows repeat five address/weight profiles across four order batches,
   so the profiles are named once and the page order is spelled out below —
   which is also how a re-transcription stays reviewable. */
type Profile = Omit<FixtureRow, 'orderNumber' | 'referenceNumber'>

const base = {
  shipByDate: '2026-09-17',
  state: 'At Facility',
  carrier: 'Supercharged Deliveries',
  secondaryState: '',
  dispatchDate: '-',
  palletSpaces: '1',
  sku: '1',
  tag: '-',
  merchant: 'Freshly Grocery',
  orderType: 'Forward',
  ageing: '0',
}

const P: Record<'01' | '02' | '03' | '04' | '05', Profile> = {
  '01': {
    ...base, flags: ['Heavy Weight'], flagsDash: false,
    weight: '118.5', volume: '5016000', serviceTime: '95',
    specialInstructions: 'Age/ID Verification',
    address: '233 S Wacker Dr, Floor 40, The Loop, Willis Tower, Chicago, 60605.0, IL, United States',
  },
  '02': {
    ...base, flags: ['VIP', 'Heavy Weight'], flagsDash: false,
    weight: '132', volume: '1539000', serviceTime: '60',
    specialInstructions: 'B2B Signature',
    address: '401 N Michigan Ave, Floor 12, Magnificent Mile, Near Tribune Tower, Chicago, 60614.0, IL, United States',
  },
  '03': {
    ...base, flags: [], flagsDash: true,
    weight: '68', volume: '2542000', serviceTime: '45',
    specialInstructions: 'Box Handling Guidance',
    address: '20 N Michigan Ave, Floor 5, Millennium Park, Near Cloud Gate, Chicago, 60614.0, IL, United States',
  },
  '04': {
    ...base, flags: ['VIP', 'Fragile'], flagsDash: false,
    weight: '28.5', volume: '285000', serviceTime: '60',
    specialInstructions: 'Age/ID Verification',
    address: '150 N Riverside Plaza, Floor 22, West Loop, Near Chicago Union Station, Chicago, 60647.0, IL, United States',
  },
  '05': {
    ...base, flags: ['Heavy Weight'], flagsDash: false,
    weight: '155', volume: '1050000', serviceTime: '75',
    specialInstructions: '-',
    address: '111 E Wacker Dr, Floor 32, Streeterville, Near Navy Pier, Chicago, 60657.0, IL, United States',
  },
}

const row = (batch: string, profile: keyof typeof P, override: Partial<FixtureRow> = {}): FixtureRow => {
  const id = `${batch}-SEKO-${profile}`
  return { ...P[profile], orderNumber: id, referenceNumber: id, ...override }
}

/** page 1, in staging's own order */
export const STAGING_FIXTURE_ROWS: FixtureRow[] = [
  row('KC5', '01'),
  row('KC5', '05'),
  row('KC5', '04'),
  row('KC5', '03'),
  row('KC5', '02'),
  row('KC4', '04'),
  row('KC4', '05'),
  row('KC4', '01'),
  row('KC4', '03'),
  row('KC4', '02'),
  row('KC2', '02'),
  // the one profile-05 row staging shows with a Special Instruction
  row('KC2', '05', { specialInstructions: 'B2B Signature' }),
  row('KC2', '01'),
  row('KC2', '03'),
  row('KC2', '04'),
  row('KC1', '02'),
  row('KC1', '04'),
  row('KC1', '03'),
  {
    ...base,
    flags: [], flagsDash: false,
    orderNumber: 'HELLOFRESH_09', referenceNumber: 'HELLOFRESH_09',
    state: 'Created', secondaryState: 'Label Generated',
    weight: '0.85', volume: '3001', serviceTime: '5',
    specialInstructions: 'Age/ID Verification',
    address: '233 S Wacker Dr, Floor 40, The Loop, Willis Tower, Chicago, 60606.0, IL, United States',
  },
  {
    ...base,
    flags: [], flagsDash: false,
    orderNumber: 'HELLOFRESH_08', referenceNumber: 'HELLOFRESH_08',
    weight: '11', volume: '221.1', serviceTime: '5',
    specialInstructions: 'Age/ID Verification',
    address: '233 S Wacker Dr, Floor 40, The Loop, Willis Tower, Chicago, 60606.0, IL, United States',
  },
]

/** `?fixture=staging` — dev-only, and never on by default */
export function fixtureRequested(search: string): boolean {
  return import.meta.env.DEV && new URLSearchParams(search).get('fixture') === 'staging'
}
