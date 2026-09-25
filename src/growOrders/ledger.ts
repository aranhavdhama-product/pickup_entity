/**
 * The merchant's payments ledger — what the live portal calls Wallet → "Payments"
 * (`/transactions/`, research 2026-09-25 §4). One checkout = one DEBIT entry that
 * may cover several consignments. Live has NO balance, NO top-up and NO credit
 * entries, so neither do we (the `type` field keeps 'CR' only for the receipt's
 * "Transaction Type" line).
 *
 * Seed: every paid, non-draft order in the orders store, grouped deterministically
 * (same currency + same pickup store + same day, group sizes cycling 1·3·1·2) so
 * a few rows carry the "n Consignments" badge. Consignment numbers are SNAPSHOT
 * on the entry, so a receipt still renders after "Reset demo data" reseeds orders.
 *
 * `recordPayment(order)` is called by CheckoutPage at payment; it is idempotent
 * by order id (a resumed draft checks out through `update`).
 */
import { quoteForRecord } from './rates'
import { growOrdersSnapshot } from './store'
import type { GrowOrder } from './types'
import { createLocalStore, num, str, strs } from './localStore'

export type LedgerStatus = 'Success' | 'Failed' | 'Pending'
export interface LedgerEntry {
  /** `DR` + a timestamp id, e.g. DR20251218055829480 */
  id: string
  at: string
  orderIds: string[]
  /** snapshot of each order's consignment number, same order as `orderIds` */
  consignmentNos: string[]
  amount: number
  shipping: number
  tax: number
  currency: string
  type: 'DR' | 'CR'
  mode: 'Credit' | 'Prepaid' | 'COD'
  status: LedgerStatus
  remarks: string
  /** true when priced from the rate card (the order carried no frozen charges) */
  estimated: boolean
}

const KEY = 'grow-wallet-v1'
const pad = (n: number, w = 2) => String(n).padStart(w, '0')
const stamp = (iso: string, seq: number) => {
  const d = new Date(iso)
  const t = isNaN(d.getTime()) ? new Date(0) : d
  return `DR${t.getFullYear()}${pad(t.getMonth() + 1)}${pad(t.getDate())}${pad(t.getHours())}${pad(t.getMinutes())}${pad(t.getSeconds())}${pad((t.getMilliseconds() + seq) % 1000, 3)}`
}
const round2 = (n: number) => Math.round(n * 100) / 100

/** What an order was charged: the frozen checkout charges, else the rate card (estimated). */
export function chargesOf(o: GrowOrder): { shipping: number; tax: number; total: number; estimated: boolean } {
  if (o.charges) return { shipping: o.charges.shipping, tax: o.charges.tax, total: o.charges.total, estimated: false }
  const q = quoteForRecord(o)
  return { shipping: q.shipping, tax: q.tax, total: q.total, estimated: true }
}

function entryFor(orders: GrowOrder[], seq: number, used: Set<string>): LedgerEntry {
  const sums = orders.map(chargesOf)
  let id = stamp(orders[0].createdAt, seq)
  for (let n = 1; used.has(id); n++) id = stamp(orders[0].createdAt, seq + n)
  used.add(id)
  return {
    id, at: orders[0].createdAt,
    orderIds: orders.map((o) => o.id), consignmentNos: orders.map((o) => o.orderNumber),
    shipping: round2(sums.reduce((n, s) => n + s.shipping, 0)),
    tax: round2(sums.reduce((n, s) => n + s.tax, 0)),
    amount: round2(sums.reduce((n, s) => n + s.total, 0)),
    currency: orders[0].currency || '₱', type: 'DR', mode: 'Credit', status: 'Success', remarks: '',
    estimated: sums.some((s) => s.estimated),
  }
}

const SIZES = [1, 3, 1, 2]
function seedLedger(): LedgerEntry[] {
  const paid = growOrdersSnapshot().orders
    .filter((o) => o.paymentStatus === 'Paid' && !o.isDraft)
    .sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : a.id < b.id ? -1 : 1))
  const out: LedgerEntry[] = []
  const used = new Set<string>()
  let i = 0, g = 0
  while (i < paid.length) {
    const head = paid[i]
    const group = [head]
    const want = SIZES[g % SIZES.length]
    let j = i + 1
    while (group.length < want && j < paid.length) {
      const o = paid[j]
      if (o.currency !== head.currency || o.storeCode !== head.storeCode || o.createdAt.slice(0, 10) !== head.createdAt.slice(0, 10)) break
      group.push(o); j++
    }
    out.push(entryFor(group, g, used))
    i += group.length; g++
  }
  return out.reverse() // newest first
}

function normalize(raw: unknown): LedgerEntry[] | null {
  if (!Array.isArray(raw)) return null
  return raw.filter((r) => r && typeof r === 'object').map((r: Record<string, unknown>) => ({
    id: str(r.id), at: str(r.at), orderIds: strs(r.orderIds), consignmentNos: strs(r.consignmentNos),
    amount: num(r.amount), shipping: num(r.shipping), tax: num(r.tax), currency: str(r.currency, '₱'),
    type: r.type === 'CR' ? 'CR' : 'DR',
    mode: r.mode === 'Prepaid' || r.mode === 'COD' ? r.mode : 'Credit',
    status: r.status === 'Failed' || r.status === 'Pending' ? r.status : 'Success',
    remarks: str(r.remarks), estimated: r.estimated === true,
  } as LedgerEntry)).filter((e) => e.id)
}

const store = createLocalStore<LedgerEntry[]>(KEY, seedLedger, normalize)
export const useLedger = store.use
export const ledgerSnapshot = store.get
export const ledgerEntryById = (id: string) => store.get().find((e) => e.id === id)
export const resetLedger = store.reset

/** One checkout = one debit. Idempotent: an order already on an entry is not recorded twice. */
export function recordPayment(order: GrowOrder): LedgerEntry | null {
  const cur = store.get()
  if (cur.some((e) => e.orderIds.includes(order.id))) return null
  const e = entryFor([order], cur.length, new Set(cur.map((x) => x.id)))
  e.at = new Date().toISOString()
  e.mode = order.paymentMode === 'COD' ? 'COD' : 'Credit'
  store.set([e, ...cur])
  return e
}
