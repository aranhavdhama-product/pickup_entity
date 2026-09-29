/**
 * Merchant invoices — DERIVED, no store: one invoice per calendar month ×
 * currency from the Payments ledger (Billing page, Disputes' Invoice kind).
 * Status follows Settings → Business "Payment Type": Prepaid = every invoice
 * Paid; Postpaid = the running month is Open, last month is Due, older Paid.
 */
import type { LedgerEntry } from './ledger'

export type InvoiceStatus = 'Open' | 'Due' | 'Paid'
export interface Invoice {
  id: string; month: string; label: string; currency: string; entries: LedgerEntry[]
  consignments: number; shipping: number; tax: number; total: number; status: InvoiceStatus
  /** pay-later / COD debits still unpaid on this invoice */
  pendingIds: string[]; pendingTotal: number; estimated: boolean; dueOn: string
}

const ym = (iso: string) => iso.slice(0, 7)
export const monthOf = ym
const monthLabel = (m: string) => new Date(`${m}-01T00:00:00`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
export const curCode = (c: string) => (c === '$' ? 'USD' : c === '₱' ? 'PHP' : c)
const r2 = (n: number) => Math.round(n * 100) / 100
/** 15th of the month after the period — the postpaid due date. */
const dueOf = (m: string) => { const d = new Date(`${m}-01T00:00:00`); d.setMonth(d.getMonth() + 1); d.setDate(15); return d.toISOString() }

export function invoicesOf(ledger: LedgerEntry[], postpaid: boolean, now = new Date()): Invoice[] {
  const thisM = ym(now.toISOString())
  const prev = new Date(now); prev.setDate(1); prev.setMonth(prev.getMonth() - 1)
  const lastM = ym(prev.toISOString())
  const groups = new Map<string, LedgerEntry[]>()
  for (const e of ledger) {
    if (e.type !== 'DR' || e.status === 'Failed') continue
    const k = `${ym(e.at)}|${e.currency}`
    groups.set(k, [...(groups.get(k) ?? []), e])
  }
  return [...groups.entries()].map(([k, es]) => {
    const [month, currency] = k.split('|')
    /* a pending (pay later / COD) debit keeps the invoice Due until it is paid */
    const pending = es.filter((e) => e.status === 'Pending')
    const status: InvoiceStatus = pending.length ? 'Due' : !postpaid ? 'Paid' : month >= thisM ? 'Open' : month === lastM ? 'Due' : 'Paid'
    return {
      id: `INV-${month.replace('-', '')}-${curCode(currency)}`, month, label: monthLabel(month), currency, entries: es,
      consignments: es.reduce((n, e) => n + e.orderIds.length, 0),
      shipping: r2(es.reduce((n, e) => n + e.shipping, 0)), tax: r2(es.reduce((n, e) => n + e.tax, 0)),
      total: r2(es.reduce((n, e) => n + e.amount, 0)), status, pendingIds: pending.map((e) => e.id), pendingTotal: r2(pending.reduce((n, e) => n + e.amount, 0)), estimated: es.some((e) => e.estimated), dueOn: dueOf(month),
    }
  }).sort((a, b) => (a.month === b.month ? a.currency.localeCompare(b.currency) : a.month < b.month ? 1 : -1))
}
