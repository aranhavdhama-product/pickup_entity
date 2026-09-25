/**
 * Merchant disputes (`/grow/orders/disputes`) — the live GROW-STAGING tenant's
 * Disputes group (research 2026-09-25 §9): three kinds, each with Open / Closed
 * tabs and its own columns —
 *   · Transaction ("Wallet Dispute"): on a Payments ledger entry — dispute ref,
 *     transaction ref, consignment number, raised date, current status;
 *   · Tracking ("Manage Queries"): an order query on a consignment — query
 *     number, shipment, order number, raised date, CATEGORY, status, PRIORITY,
 *     updated at;
 *   · Invoice: on a Billing invoice — dispute ref, invoice number, amount,
 *     DISPUTE AMOUNT, raised date, status.
 * The raise forms, category / priority vocabularies, statuses beyond Open /
 * Closed and the thread view were NOT capturable (no live data) — ours:
 * statuses Open · Under review (Open tab) · Resolved · Rejected (Closed tab),
 * with a timeline and a dev "Simulate support response".
 *
 * Seed: deterministic, from the orders store and the ledger (never random).
 */
import { growOrdersSnapshot } from './store'
import { ledgerSnapshot } from './ledger'
import { invoicesOf } from './invoices'
import { createLocalStore, num, str } from './localStore'

export const DISPUTE_KINDS = ['Transaction', 'Tracking', 'Invoice'] as const
export type DisputeKind = (typeof DISPUTE_KINDS)[number]
export const KIND_TITLE: Record<DisputeKind, { title: string; subtitle: string; prefix: string }> = {
  Transaction: { title: 'Wallet Dispute', subtitle: 'Raise Wallet Transaction Disputes', prefix: 'WD' },
  Tracking: { title: 'Manage Queries', subtitle: 'Check status of queries raised and responses from customer service team', prefix: 'OQ' },
  Invoice: { title: 'Invoice Dispute', subtitle: 'Raise Invoice Disputes', prefix: 'ID' },
}
/** ours — the live vocabularies were not capturable */
export const CATEGORIES: Record<DisputeKind, string[]> = {
  Transaction: ['Overcharge', 'Duplicate debit', 'Refund not received', 'Other'],
  Tracking: ['Delivery delay', 'Address change', 'Damaged', 'Lost', 'Weight discrepancy', 'Pickup not attempted', 'Other'],
  Invoice: ['Incorrect amount', 'Weight discrepancy', 'Service not rendered', 'Tax error', 'Other'],
}
export const PRIORITIES = ['Low', 'Medium', 'High'] as const
export type Priority = (typeof PRIORITIES)[number]
export const DISPUTE_STATUSES = ['Open', 'Under review', 'Resolved', 'Rejected'] as const
export type DisputeStatus = (typeof DISPUTE_STATUSES)[number]
export const DISPUTE_TONE: Record<DisputeStatus, 'info' | 'warning' | 'success' | 'danger'> = {
  Open: 'info', 'Under review': 'warning', Resolved: 'success', Rejected: 'danger',
}
export const isClosed = (s: DisputeStatus) => s === 'Resolved' || s === 'Rejected'

export interface DisputeEvent { at: string; status: DisputeStatus | null; by: 'Merchant' | 'FarEye Support'; note: string }
export interface Dispute {
  id: string
  kind: DisputeKind
  /** ledger entry id (Transaction) */
  transactionRef: string
  /** order id + snapshots (Transaction / Tracking) */
  orderId: string
  consignmentNo: string
  orderNumber: string
  /** Invoice kind */
  invoiceNo: string
  /** the amount under dispute's parent: payment / invoice total */
  amount: number
  /** what the merchant disputes (Transaction / Invoice) */
  disputeAmount: number
  currency: string
  category: string
  priority: Priority
  description: string
  status: DisputeStatus
  raisedAt: string
  updatedAt: string
  events: DisputeEvent[]
}

const KEY = 'grow-disputes-v3'
const addH = (iso: string, h: number) => new Date(new Date(iso).getTime() + h * 3_600_000).toISOString()
const RESOLUTION: Record<DisputeStatus, string> = {
  Open: '', 'Under review': 'Customer service is checking the scans and the charges.',
  Resolved: 'Adjustment approved — credited on the next invoice.', Rejected: 'Charges and service match the booking; no adjustment.',
}

function build(kind: DisputeKind, n: number, x: Partial<Dispute> & { raisedAt: string; status: DisputeStatus; description: string }): Dispute {
  /* a seed never sits in the future: pull it back so its last event is an hour ago at most */
  const span = isClosed(x.status) ? 30 : x.status === 'Open' ? 0 : 6
  const latest = addH(new Date().toISOString(), -(span + 1))
  if (x.raisedAt > latest) x = { ...x, raisedAt: latest }
  const events: DisputeEvent[] = [{ at: x.raisedAt, status: 'Open', by: 'Merchant', note: x.description }]
  if (x.status !== 'Open') events.push({ at: addH(x.raisedAt, 6), status: 'Under review', by: 'FarEye Support', note: RESOLUTION['Under review'] })
  if (isClosed(x.status)) events.push({ at: addH(x.raisedAt, 30), status: x.status, by: 'FarEye Support', note: RESOLUTION[x.status] })
  return {
    id: `${KIND_TITLE[kind].prefix}-${1000 + n}`, kind, transactionRef: '', orderId: '', consignmentNo: '', orderNumber: '', invoiceNo: '',
    amount: 0, disputeAmount: 0, currency: '₱', category: CATEGORIES[kind][0], priority: 'Medium', ...x,
    updatedAt: events[events.length - 1].at, events,
  }
}

function seedDisputes(): Dispute[] {
  const out: Dispute[] = []
  const paid = growOrdersSnapshot().orders.filter((o) => o.paymentStatus === 'Paid' && !o.isDraft).sort((a, b) => (a.id < b.id ? -1 : 1))
  const trk: { cat: string; pri: Priority; status: DisputeStatus; text: string }[] = [
    { cat: 'Delivery delay', pri: 'High', status: 'Open', text: 'Promised yesterday, still no out-for-delivery scan.' },
    { cat: 'Damaged', pri: 'High', status: 'Under review', text: 'Receiver reports the box was crushed and the item broken.' },
    { cat: 'Address change', pri: 'Medium', status: 'Resolved', text: 'Receiver moved — please deliver to the new unit number.' },
    { cat: 'Lost', pri: 'High', status: 'Rejected', text: 'No scan since pickup; the receiver has not got it.' },
  ]
  trk.forEach((t, i) => {
    const o = paid[(i * 7) % Math.max(1, paid.length)]
    if (!o) return
    out.push(build('Tracking', i + 1, {
      orderId: o.id, consignmentNo: o.trackingNumber || o.orderNumber, orderNumber: o.orderNumber, currency: o.currency || '₱',
      category: t.cat, priority: t.pri, status: t.status, description: t.text, raisedAt: addH(o.createdAt, 30 + i * 5),
    }))
  })
  const ledger = ledgerSnapshot()
  const wd: { cat: string; status: DisputeStatus; share: number; text: string }[] = [
    { cat: 'Overcharge', status: 'Open', share: 0.2, text: 'Charged the express rate on a standard booking.' },
    { cat: 'Duplicate debit', status: 'Resolved', share: 1, text: 'This checkout was debited twice.' },
  ]
  wd.forEach((w, i) => {
    const e = ledger[(i * 5 + 2) % Math.max(1, ledger.length)]
    if (!e) return
    out.push(build('Transaction', i + 1, {
      transactionRef: e.id, orderId: e.orderIds[0] ?? '', consignmentNo: e.consignmentNos[0] ?? '', amount: e.amount,
      disputeAmount: Math.round(e.amount * w.share * 100) / 100, currency: e.currency, category: w.cat, status: w.status,
      description: w.text, raisedAt: addH(e.at, 20 + i * 9),
    }))
  })
  const invs = invoicesOf(ledger, true)
  const idp: { cat: string; status: DisputeStatus; share: number; text: string }[] = [
    { cat: 'Weight discrepancy', status: 'Under review', share: 0.05, text: 'Several parcels billed on volumetric weight they never had.' },
    { cat: 'Incorrect amount', status: 'Rejected', share: 0.02, text: 'Invoice total does not match our payment records.' },
  ]
  idp.forEach((d, i) => {
    const inv = invs[i + 1]
    if (!inv) return
    out.push(build('Invoice', i + 1, {
      invoiceNo: inv.id, amount: inv.total, disputeAmount: Math.round(inv.total * d.share * 100) / 100, currency: inv.currency,
      category: d.cat, status: d.status, description: d.text, raisedAt: addH(inv.dueOn, -24 * 10 + i * 3),
    }))
  })
  return out.sort((a, b) => (a.raisedAt < b.raisedAt ? 1 : -1))
}

const isStatus = (v: unknown): v is DisputeStatus => DISPUTE_STATUSES.includes(v as DisputeStatus)
function normalize(raw: unknown): Dispute[] | null {
  if (!Array.isArray(raw)) return null
  return raw.filter((r) => r && typeof r === 'object').map((r: Record<string, unknown>) => {
    const kind: DisputeKind = DISPUTE_KINDS.includes(r.kind as DisputeKind) ? r.kind as DisputeKind : 'Tracking'
    const events = (Array.isArray(r.events) ? r.events : []).map((e: Record<string, unknown>) => ({
      at: str(e.at), status: isStatus(e.status) ? e.status : null, by: e.by === 'FarEye Support' ? 'FarEye Support' : 'Merchant', note: str(e.note),
    } as DisputeEvent))
    return {
      id: str(r.id), kind, transactionRef: str(r.transactionRef), orderId: str(r.orderId), consignmentNo: str(r.consignmentNo),
      orderNumber: str(r.orderNumber), invoiceNo: str(r.invoiceNo), amount: num(r.amount), disputeAmount: num(r.disputeAmount),
      currency: str(r.currency, '₱'), category: str(r.category, 'Other'),
      priority: PRIORITIES.includes(r.priority as Priority) ? r.priority as Priority : 'Medium',
      description: str(r.description), status: isStatus(r.status) ? r.status : 'Open', raisedAt: str(r.raisedAt),
      updatedAt: str(r.updatedAt, str(r.raisedAt)), events,
    } as Dispute
  }).filter((d) => d.id)
}

const store = createLocalStore<Dispute[]>(KEY, seedDisputes, normalize)
export const useDisputes = store.use
export const disputeById = (id: string) => store.get().find((d) => d.id === id)
/** The one not-closed dispute already raised on this subject, if any. */
export const openDisputeOn = (kind: DisputeKind, subject: string) => store.get().find((d) => d.kind === kind && !isClosed(d.status)
  && (kind === 'Transaction' ? d.transactionRef === subject : kind === 'Invoice' ? d.invoiceNo === subject : d.orderId === subject))
/** Latest dispute on an invoice (Billing's DISPUTE RAISED / STATUS OF DISPUTE columns). */
export const latestInvoiceDispute = (list: Dispute[], invoiceNo: string) =>
  list.filter((d) => d.kind === 'Invoice' && d.invoiceNo === invoiceNo).sort((a, b) => (a.raisedAt < b.raisedAt ? 1 : -1))[0]

const nextId = (kind: DisputeKind) => {
  const pre = KIND_TITLE[kind].prefix
  const max = store.get().filter((d) => d.kind === kind).reduce((n, d) => Math.max(n, Number(d.id.replace(/\D/g, '')) || 0), 1000)
  return `${pre}-${max + 1}`
}
const patch = (id: string, fn: (d: Dispute) => Dispute) => store.set(store.get().map((d) => (d.id === id ? fn(d) : d)))
const push = (d: Dispute, e: DisputeEvent, status?: DisputeStatus): Dispute => ({ ...d, status: status ?? d.status, updatedAt: e.at, events: [...d.events, e] })

export type RaiseInput = Omit<Dispute, 'id' | 'status' | 'raisedAt' | 'updatedAt' | 'events'>
export const disputeActions = {
  raise(x: RaiseInput): Dispute {
    const at = new Date().toISOString()
    const d: Dispute = { ...x, id: nextId(x.kind), status: 'Open', raisedAt: at, updatedAt: at, events: [{ at, status: 'Open', by: 'Merchant', note: x.description }] }
    store.set([d, ...store.get()])
    return d
  },
  comment(id: string, note: string) {
    patch(id, (d) => push(d, { at: new Date().toISOString(), status: null, by: 'Merchant', note }))
  },
  /** Dev: customer service's next move — Open → Under review → Resolved. */
  simulateSupport(id: string, outcome: 'Resolved' | 'Rejected' = 'Resolved') {
    patch(id, (d) => {
      const next: DisputeStatus | null = d.status === 'Open' ? 'Under review' : d.status === 'Under review' ? outcome : null
      return next ? push(d, { at: new Date().toISOString(), status: next, by: 'FarEye Support', note: RESOLUTION[next] }, next) : d
    })
  },
  /** The live Tracking Dispute toolbar's "Close Disputes" (bulk) — the merchant withdraws. */
  close(ids: string[]) {
    const s = new Set(ids)
    const at = new Date().toISOString()
    store.set(store.get().map((d) => (s.has(d.id) && !isClosed(d.status)
      ? push(d, { at, status: 'Resolved', by: 'Merchant', note: 'Closed by the merchant.' }, 'Resolved') : d)))
  },
}
