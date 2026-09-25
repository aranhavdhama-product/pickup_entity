/**
 * Grow Reports — the merchant's report jobs, subscriptions and column templates
 * (`/grow/orders/reports`; capture: docs/superpowers/research/
 * 2026-09-25-grow-portal-pages.md §6).
 *
 * A small local store (localStorage `grow-reports-v1`, reactive through
 * useSyncExternalStore like `store.ts`). A job is "ready" the moment it is
 * generated — the CSV is built on Download from the orders store, so nothing
 * is precomputed or stored but the request itself.
 *
 * `ORDER_REPORT_COLUMNS` is the live Order report's column universe, VERBATIM
 * group by group; a column the local order record has no data for exports
 * blank. The Transaction report's columns were NOT captured live — they are the
 * Payments grid's columns (invented; see the doc §4). Tracking report columns
 * live on the page (they read the shipment row).
 *
 * The seed is deterministic: fixed offsets from today, no randomness.
 */
import { useSyncExternalStore } from 'react'
import type { GrowOrder, Party } from './types'
import { displayStatus } from './tabs'
import { VOL_FACTOR } from './draft'
import { quoteForRecord } from './rates'

export type ReportType = 'Order' | 'Transaction' | 'Tracking'
export type Frequency = 'Daily' | 'Weekly' | 'Monthly'
export type EndsMode = 'Never' | 'After' | 'On Specific Date'

export interface ReportJob {
  id: string
  type: ReportType
  requestedBy: string
  createdAt: string
  /** local 'YYYY-MM-DDTHH:mm' */
  start: string
  end: string
  columns: string[]
}

export interface ReportSubscription {
  id: string
  name: string
  type: Exclude<ReportType, 'Tracking'>
  frequency: Frequency
  /** first run, local 'YYYY-MM-DDTHH:mm' */
  start: string
  ends: EndsMode
  /** After n runs */
  endsAfter?: number
  /** On Specific Date, YYYY-MM-DD */
  endsOn?: string
  sendTo: string[]
  columns: string[]
  createdBy: string
  createdOn: string
}

export interface ReportTemplate {
  id: string
  name: string
  type: Exclude<ReportType, 'Tracking'>
  columns: string[]
  favorite: boolean
  usedAt: string
}

export interface ReportsDb { jobs: ReportJob[]; subscriptions: ReportSubscription[]; templates: ReportTemplate[] }

/* ------------------------------------------------------ column universe ---- */

export interface ReportColumn { id: string; label: string; group: string; get: (o: GrowOrder) => string | number }

const s = (v: unknown) => (v == null ? '' : String(v))
const partyCols = (group: string, prefix: string, pick: (o: GrowOrder) => Party | null | undefined, extra: [string, (o: GrowOrder) => string][] = []): ReportColumn[] => {
  const p = (f: (x: Party) => unknown) => (o: GrowOrder) => { const x = pick(o); return x ? s(f(x)) : '' }
  const base: [string, (o: GrowOrder) => string | number][] = [
    ['Address Type', (o) => (pick(o) ? (prefix === 'Sender' ? 'Pickup' : 'Delivery') : '')],
    ['Name', p((x) => x.name)], ['Company Name', p((x) => x.businessName)], ['Contact Number', p((x) => x.contactNumber)],
    ['Email', p((x) => x.email)], ['Address Line 1', p((x) => x.line1)], ['Address Line 2', p((x) => x.line2)],
    ['Landmark', p((x) => x.landmark)], ['Locality', p((x) => x.county)], ['City', p((x) => x.city)], ['State', p((x) => x.state)],
    ['Pincode', p((x) => x.postalCode)], ['Country', p((x) => x.country)], ['Latitude', p((x) => x.latitude)], ['Longitude', p((x) => x.longitude)],
    ['Port', () => ''], ['Port Name', () => ''], ['Port Contact Person', () => ''], ['Port Contact Number', () => ''], ['Port Address', () => ''],
    ...extra,
  ]
  return base.map(([label, get]) => ({ id: `${prefix} ${label}`, label: `${prefix} ${label}`, group, get }))
}

const pkgItems = (o: GrowOrder) => o.pkg.items ?? []
const join = (xs: (string | number | undefined | null)[]) => xs.filter((x) => x != null && x !== '').join(' | ')

export const ORDER_REPORT_COLUMNS: ReportColumn[] = [
  ...([
    ['Consignment Number', (o) => o.orderNumber], ['Order Number', (o) => o.orderNumber], ['Tracking Number', (o) => o.trackingNumber],
    ['Store ID', (o) => o.storeCode], ['Created At', (o) => o.createdAt], ['Updated At', (o) => o.createdAt],
    ['Status', (o) => displayStatus(o)], ['Product', (o) => (o.shipmentType === 'FTL' ? 'Full vehicle' : 'Parcel')],
    ['Order Type', (o) => o.orderType], ['Shipment Type', (o) => o.shipmentType], ['Shipping Method', (o) => o.serviceType],
    ['Carrier Code', (o) => o.carrier], ['Shipper Code', (o) => o.storeCode], ['Additional Services', (o) => join(o.additionalServices ?? [])],
    ['Payment Mode', (o) => o.paymentMode], ['COD Amount', (o) => (o.codAmount || '')],
    ['Order Amount', (o) => o.consignment?.orderAmount ?? o.charges?.total ?? quoteForRecord(o).total],
    ['Oversized Consignment', () => ''], ['Oversize Charges', () => ''], ['Insurance', () => ''],
    ['Authority To Leave', (o) => o.draft?.authority ?? ''], ['POD Collection', () => ''],
    ['Special Instructions', (o) => o.remarks], ['Declared Currency', (o) => o.currency],
  ] as [string, (o: GrowOrder) => string | number][]).map(([label, get]) => ({ id: label, label, group: 'Order info', get })),
  ...([
    ['Package ID', (o) => `${o.orderNumber}-P1`], ['Quantity', (o) => o.pkg.count], ['Length', (o) => o.pkg.lengthCm],
    ['Breadth', (o) => o.pkg.widthCm], ['Height', (o) => o.pkg.heightCm], ['Weight', (o) => o.pkg.weightKg],
    ['Volume', (o) => o.pkg.lengthCm * o.pkg.widthCm * o.pkg.heightCm],
    ['Volumetric Factor', () => VOL_FACTOR],
  ] as [string, (o: GrowOrder) => string | number][]).map(([label, get]) => ({ id: label, label, group: 'Parcel Dimensions', get })),
  ...([
    ['SKU Code', (o) => join(pkgItems(o).map((i) => i.skuCode))], ['SKU Name', (o) => join(pkgItems(o).map((i) => i.name))],
    ['SKU Quantity', (o) => join(pkgItems(o).map((i) => i.quantity))], ['SKU HSN Name', (o) => join(pkgItems(o).map((i) => i.hsnCode))],
    ['SKU Unit Price', (o) => join(pkgItems(o).map((i) => i.unitCost))], ['SKU Origin Country', (o) => join(pkgItems(o).map((i) => i.originCountry))],
  ] as [string, (o: GrowOrder) => string | number][]).map(([label, get]) => ({ id: label, label, group: 'SKU', get })),
  ...partyCols('Sender', 'Sender', (o) => o.sender, [
    ['Hub', (o) => o.storeCode], ['ID', (o) => o.storeCode], ['Address ID', (o) => o.sender.locationCode ?? ''], ['Pickup PUDO Store Number', () => ''],
  ]).map((c) => (c.id === 'Sender Hub' || c.id === 'Sender ID' || c.id === 'Sender Address ID' ? c
    : c.id === 'Sender Pickup PUDO Store Number' ? { ...c, id: 'Pickup PUDO Store Number', label: 'Pickup PUDO Store Number' } : c)),
  ...partyCols('Customer', 'Customer', (o) => o.receiver, [
    ['Contact', (o) => o.receiver.contactNumber], ['Hub', (o) => o.inboundHubCode], ['Address ID', (o) => o.receiver.locationCode ?? ''],
  ]),
  ...([
    ['Return Address Type', (o) => (o.consignment?.rto ? 'Different address' : 'Same as pickup')],
    ...(([
      ['Full Name', (x) => x.name], ['Phone', (x) => x.contactNumber], ['Address Line 1', (x) => x.line1], ['Address Line 2', (x) => x.line2],
      ['Landmark', (x) => x.landmark], ['City', (x) => x.city], ['State', (x) => x.state], ['Suburb', (x) => x.county], ['Email', (x) => x.email],
      ['Country', (x) => x.country], ['Postcode', (x) => x.postalCode], ['Company Name', (x) => x.businessName], ['PUDO Store Number', () => ''],
      ['Latitude', (x) => x.latitude], ['Longitude', (x) => x.longitude], ['Port', () => ''],
    ] as [string, (x: Party) => unknown][]).map(([l, f]) => [`Return ${l}`, (o: GrowOrder) => s(f(o.consignment?.rto ?? o.sender))])),
  ] as [string, (o: GrowOrder) => string | number][]).map(([label, get]) => ({ id: label, label, group: 'Return Address', get })),
  ...([
    ['Merchant Name', (o) => o.sender.businessName], ['Merchant Account Number', (o) => o.storeCode],
    ['Created By Email', (o) => o.sender.email], ['Created By Name', (o) => o.sender.name], ['GST Number', () => ''],
  ] as [string, (o: GrowOrder) => string | number][]).map(([label, get]) => ({ id: label, label, group: 'Merchant', get })),
]

/** Transaction report — NOT captured live; the Payments grid's columns (§4). One row per paid order. */
export const TRANSACTION_REPORT_COLUMNS: ReportColumn[] = ([
  ['Reference', (o) => `DR${o.createdAt.replace(/\D/g, '').slice(0, 17)}`], ['Consignment No.', (o) => o.orderNumber],
  ['Date', (o) => o.createdAt], ['Amount', (o) => o.charges?.total ?? quoteForRecord(o).total],
  ['Shipping', (o) => o.charges?.shipping ?? quoteForRecord(o).shipping], ['Tax', (o) => o.charges?.tax ?? quoteForRecord(o).tax],
  ['Currency', (o) => o.currency], ['Payment Mode', (o) => o.paymentMode], ['Remarks', () => ''],
  ['Transaction Status', () => 'Success'],
] as [string, (o: GrowOrder) => string | number][]).map(([label, get]) => ({ id: label, label, group: 'Transaction', get }))

export const columnsFor = (t: Exclude<ReportType, 'Tracking'>) => (t === 'Order' ? ORDER_REPORT_COLUMNS : TRANSACTION_REPORT_COLUMNS)

/** Orders a report of this type covers, created inside [start, end]. */
export function reportOrders(t: ReportType, orders: GrowOrder[], start: string, end: string): GrowOrder[] {
  const a = new Date(start).getTime(), b = new Date(end).getTime()
  return orders.filter((o) => {
    if (o.isDraft) return false
    if (t === 'Transaction' && o.paymentStatus !== 'Paid') return false
    const at = new Date(o.createdAt).getTime()
    return (Number.isNaN(a) || at >= a) && (Number.isNaN(b) || at <= b)
  }).sort((x, y) => x.createdAt.localeCompare(y.createdAt))
}

const cell = (v: string | number) => { const t = String(v ?? ''); return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t }
/** Header + one line per order, in the chosen columns' order. */
export function reportCsv(cols: ReportColumn[], orders: GrowOrder[]): string {
  return [cols.map((c) => cell(c.label)).join(','), ...orders.map((o) => cols.map((c) => cell(c.get(o))).join(','))].join('\n')
}

/* --------------------------------------------------------------- store ---- */

const KEY = 'grow-reports-v1'
const p2 = (n: number) => String(n).padStart(2, '0')
const localAt = (d: Date) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}T${p2(d.getHours())}:${p2(d.getMinutes())}`
const daysAgo = (n: number, h = 0, m = 0) => { const d = new Date(); d.setDate(d.getDate() - n); d.setHours(h, m, 0, 0); return d }

const ORDER_DEFAULT = ['Consignment Number', 'Order Number', 'Created At', 'Status', 'Shipping Method', 'Customer Name', 'Customer City', 'Weight', 'Order Amount']
const TXN_DEFAULT = TRANSACTION_REPORT_COLUMNS.map((c) => c.id)

function seed(): ReportsDb {
  const who = 'Prashant'
  const job = (id: string, type: ReportType, created: number, span: number, columns: string[]): ReportJob => ({
    id, type, requestedBy: who, createdAt: daysAgo(created, 10, 15).toISOString(),
    start: localAt(daysAgo(created + span, 0, 0)), end: localAt(daysAgo(created, 23, 59)), columns,
  })
  return {
    jobs: [
      job('rj-001', 'Order', 1, 30, ORDER_DEFAULT),
      job('rj-002', 'Order', 8, 7, ORDER_DEFAULT),
      job('rj-003', 'Transaction', 2, 30, TXN_DEFAULT),
      job('rj-004', 'Tracking', 3, 14, []),
    ],
    subscriptions: [{
      id: 'rs-001', name: 'Weekly order summary', type: 'Order', frequency: 'Weekly', start: localAt(daysAgo(14, 8, 0)),
      ends: 'Never', sendTo: ['ops@merchant.example'], columns: ORDER_DEFAULT, createdBy: who, createdOn: daysAgo(14, 9, 30).toISOString(),
    }],
    templates: [],
  }
}

function load(): ReportsDb {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const v = JSON.parse(raw) as Partial<ReportsDb>
      return { jobs: v.jobs ?? [], subscriptions: v.subscriptions ?? [], templates: v.templates ?? [] }
    }
  } catch { /* fall through to the seed */ }
  return seed()
}

let db: ReportsDb = load()
const subs = new Set<() => void>()
function commit(next: ReportsDb) {
  db = next
  try { localStorage.setItem(KEY, JSON.stringify(db)) } catch { /* private mode */ }
  subs.forEach((f) => f())
}

export function useReports(): ReportsDb {
  return useSyncExternalStore((cb) => { subs.add(cb); return () => subs.delete(cb) }, () => db)
}

let seq = 0
const newId = (p: string) => `${p}-${Date.now().toString(36)}${(seq++).toString(36)}`

export const reportActions = {
  generate(x: Omit<ReportJob, 'id' | 'createdAt'>): ReportJob {
    const job = { ...x, id: newId('rj'), createdAt: new Date().toISOString() }
    commit({ ...db, jobs: [job, ...db.jobs] })
    return job
  },
  subscribe(x: Omit<ReportSubscription, 'id' | 'createdOn'>): ReportSubscription {
    const sub = { ...x, id: newId('rs'), createdOn: new Date().toISOString() }
    commit({ ...db, subscriptions: [sub, ...db.subscriptions] })
    return sub
  },
  unsubscribe(id: string) { commit({ ...db, subscriptions: db.subscriptions.filter((x) => x.id !== id) }) },
  saveTemplate(x: Omit<ReportTemplate, 'id' | 'usedAt' | 'favorite'>): ReportTemplate {
    const t = { ...x, id: newId('rt'), favorite: false, usedAt: new Date().toISOString() }
    commit({ ...db, templates: [t, ...db.templates] })
    return t
  },
  useTemplate(id: string) { commit({ ...db, templates: db.templates.map((t) => (t.id === id ? { ...t, usedAt: new Date().toISOString() } : t)) }) },
  toggleFavorite(id: string) { commit({ ...db, templates: db.templates.map((t) => (t.id === id ? { ...t, favorite: !t.favorite } : t)) }) },
  reset() { commit(seed()) },
}
