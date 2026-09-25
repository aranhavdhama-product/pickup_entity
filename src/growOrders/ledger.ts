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
  /** DR: 'Credit' (live receipt wording) / 'COD'; CR: the recharge method */
  mode: string
  /** when the bank / gateway settled it (live BANK TXN DATE); = `at` locally */
  bankTxnAt: string
  status: LedgerStatus
  remarks: string
  /** true when priced from the rate card (the order carried no frozen charges) */
  estimated: boolean
}

/* v2: wallet credits (recharges) + a seeded opening credit per currency */
const KEY = 'grow-wallet-v2'
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
    currency: orders[0].currency || '₱', type: 'DR', mode: 'Credit', bankTxnAt: orders[0].createdAt, status: 'Success', remarks: '',
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
  /* an opening recharge per currency, a day before the first debit, sized so the balance stays positive */
  for (const cur of [...new Set(out.map((e) => e.currency))]) {
    const mine = out.filter((e) => e.currency === cur)
    const spent = mine.reduce((n, e) => n + e.amount, 0)
    const first = mine.reduce((m, e) => (e.at < m ? e.at : m), mine[0].at)
    const at = new Date(new Date(first).getTime() - 86_400_000).toISOString()
    const step = cur === '$' ? 1000 : 10000
    out.push({
      id: stamp(at, 0).replace(/^DR/, 'CR'), at, bankTxnAt: at, orderIds: [], consignmentNos: [], shipping: 0, tax: 0,
      amount: Math.ceil((spent * 1.2) / step) * step, currency: cur, type: 'CR', mode: 'Bank transfer', status: 'Success',
      remarks: 'Opening wallet recharge', estimated: false,
    })
  }
  return out.sort((a, b) => (a.at < b.at ? 1 : -1)) // newest first
}

function normalize(raw: unknown): LedgerEntry[] | null {
  if (!Array.isArray(raw)) return null
  return raw.filter((r) => r && typeof r === 'object').map((r: Record<string, unknown>) => ({
    id: str(r.id), at: str(r.at), orderIds: strs(r.orderIds), consignmentNos: strs(r.consignmentNos),
    amount: num(r.amount), shipping: num(r.shipping), tax: num(r.tax), currency: str(r.currency, '₱'),
    type: r.type === 'CR' ? 'CR' : 'DR',
    mode: str(r.mode, 'Credit'), bankTxnAt: str(r.bankTxnAt, str(r.at)),
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
  if (cur.some((e) => e.type === 'DR' && e.orderIds.includes(order.id))) return null
  const e = entryFor([order], cur.length, new Set(cur.map((x) => x.id)))
  e.at = new Date().toISOString()
  e.mode = order.paymentMode === 'COD' ? 'COD' : 'Credit'
  store.set([e, ...cur])
  return e
}

/* ------------------------------------------------------------------ wallet -- */

export const RECHARGE_METHODS = ['Bank transfer', 'Credit / Debit card', 'E-wallet (GCash / Maya)'] as const

/** Demo top-up: adds a CREDIT row (no real payment is taken). */
export function recharge(amount: number, currency: string, method: string, note: string): LedgerEntry {
  const cur = store.get()
  const at = new Date().toISOString()
  const used = new Set(cur.map((x) => x.id))
  let id = stamp(at, 0).replace(/^DR/, 'CR')
  for (let n = 1; used.has(id); n++) id = stamp(at, n).replace(/^DR/, 'CR')
  const e: LedgerEntry = {
    id, at, bankTxnAt: at, orderIds: [], consignmentNos: [], shipping: 0, tax: 0, amount: round2(amount), currency,
    type: 'CR', mode: method, status: 'Success', remarks: note.trim() || 'Wallet recharge', estimated: false,
  }
  store.set([e, ...cur])
  return e
}

export interface WalletRow extends LedgerEntry { debit: number; credit: number; balance: number }
export interface WalletSummary { credits: number; debits: number; balance: number; rows: WalletRow[] }

/** One currency's wallet: rows newest first, each with the running balance after it. */
export function walletOf(ledger: LedgerEntry[], currency: string): WalletSummary {
  const asc = ledger.filter((e) => e.currency === currency).sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0))
  let bal = 0, credits = 0, debits = 0
  const rows = asc.map((e) => {
    const ok = e.status === 'Success'
    const credit = ok && e.type === 'CR' ? e.amount : 0
    const debit = ok && e.type === 'DR' ? e.amount : 0
    credits += credit; debits += debit; bal = round2(bal + credit - debit)
    return { ...e, credit, debit, balance: bal }
  })
  return { credits: round2(credits), debits: round2(debits), balance: bal, rows: rows.reverse() }
}
