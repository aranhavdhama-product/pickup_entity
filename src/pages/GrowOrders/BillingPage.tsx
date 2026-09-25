/**
 * Billing (`/grow/orders/billing`) — 2GO_PH has no Billing; the GROW-STAGING
 * tenant's `/invoice/` was seen empty (research 2026-09-25 §8–§9), so the invoice
 * model and the KPI tiles are OURS. Derived, no store of its own: one
 * invoice per calendar month × currency from the Payments ledger. Status follows
 * the merchant's Settings → Business "Payment Type": Prepaid = every invoice
 * Paid; Postpaid = the running month is Open, last month is Due, older ones Paid.
 * KPI tiles (Billed this month · Outstanding · Paid) → FilterLine (Status ·
 * Currency · search) → invoice grid → row click = invoice detail dialog listing
 * the consignments + Raise a query (→ Invoice dispute) and Download Invoice; the grid
 * carries the live Invoices page's DISPUTE RAISED / STATUS OF DISPUTE columns (the
 * GROW-STAGING tenant has `/invoice/`, research §9). Amounts priced from the rate card (no frozen charges) are
 * labelled Estimated.
 */
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CalendarClock, CircleCheck, Download, FileText, Wallet } from 'lucide-react'
import { Button, EmptyState, KpiTile, Modal, Panel, StatusPill, type Column } from '../../nueva/components'
import { ClearFilters, FilterLine, FilterSelect, IconBtn, LocalPage, SearchBox } from '../../local/chrome'
import { useLedger } from '../../growOrders/ledger'
import { currentMerchant, useMasters, useMerchantCode } from '../../growOrders/masters'
import { useMerchantSettings } from '../../growOrders/merchantSettings'
import { curCode, invoicesOf, monthOf, type Invoice, type InvoiceStatus } from '../../growOrders/invoices'
import { downloadCsv } from '../LocalPFP/adapter'
import { toast } from '../../nueva/toast'
import { fmtDate, fmtDateTime, money } from './utils'
import { PagedTable, plural } from './accountBits'
import { raiseDisputeHref } from './DisputesPage'
import { DISPUTE_TONE, latestInvoiceDispute, useDisputes } from '../../growOrders/disputes'

const TONE: Record<InvoiceStatus, 'info' | 'warning' | 'success'> = { Open: 'info', Due: 'warning', Paid: 'success' }
const ym = monthOf
const r2 = (n: number) => Math.round(n * 100) / 100

/** "₱ 1,200.00 · $ 45.00" — never one sum across currencies. */
function byCurrency(invs: Invoice[]): string {
  if (!invs.length) return '—'
  const m = new Map<string, number>()
  invs.forEach((i) => m.set(i.currency, (m.get(i.currency) ?? 0) + i.total))
  return [...m.entries()].map(([c, n]) => money(r2(n), c)).join(' · ')
}

export default function BillingPage() {
  const nav = useNavigate()
  const ledger = useLedger()
  const disputes = useDisputes()
  const masters = useMasters()
  const merchant = currentMerchant(masters.merchants, useMerchantCode())
  const settings = useMerchantSettings(merchant?.code ?? '', merchant?.name ?? '', merchant?.party)
  const postpaid = settings.business.paymentType === 'Postpaid'
  const all = useMemo(() => invoicesOf(ledger, postpaid), [ledger, postpaid])
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('')
  const [currency, setCurrency] = useState('')
  const [open, setOpen] = useState<Invoice | null>(null)
  const thisM = ym(new Date().toISOString())
  const rows = all.filter((i) => (!status || i.status === status) && (!currency || i.currency === currency)
    && (!q.trim() || [i.id, i.label].some((v) => v.toLowerCase().includes(q.trim().toLowerCase()))))
  const filtersOn = !!(q || status || currency)
  const due = all.filter((i) => i.status === 'Due')

  const columns: Column[] = [
    { key: 'id', label: 'Invoice', width: 160, render: (i: Invoice) => <b className="text-ink">{i.id}</b> },
    { key: 'label', label: 'Period', width: 150 },
    { key: 'consignments', label: 'Consignments', width: 130, align: 'right' },
    { key: 'shipping', label: 'Shipping', width: 140, align: 'right', render: (i: Invoice) => money(i.shipping, i.currency) },
    { key: 'tax', label: 'Tax', width: 120, align: 'right', render: (i: Invoice) => money(i.tax, i.currency) },
    { key: 'total', label: 'Total', width: 150, align: 'right', render: (i: Invoice) => <b className="text-ink">{money(i.total, i.currency)}</b> },
    { key: 'status', label: 'Status', width: 110, render: (i: Invoice) => <StatusPill label={i.status} tone={TONE[i.status]} /> },
    { key: 'due', label: 'Due on', width: 110, render: (i: Invoice) => (postpaid ? fmtDate(i.dueOn) : 'Prepaid') },
    { key: 'disp', label: 'Dispute Raised', width: 130, render: (i: Invoice) => { const d = latestInvoiceDispute(disputes, i.id); return d ? 'Yes' : 'No' } },
    { key: 'dstat', label: 'Status of Dispute', width: 150, render: (i: Invoice) => { const d = latestInvoiceDispute(disputes, i.id); return d ? <StatusPill label={d.status} tone={DISPUTE_TONE[d.status]} /> : '—' } },
    { key: 'est', label: '',  render: (i: Invoice) => (i.estimated ? <span className="text-[12px] text-ink-3">Estimated</span> : null) },
  ]

  const exportInvoice = (i: Invoice) => {
    const head = 'Reference,Date,Consignments,Shipping,Tax,Amount,Currency'
    const lines = i.entries.map((e) => [e.id, fmtDateTime(e.at), e.consignmentNos.join(' '), e.shipping, e.tax, e.amount, curCode(e.currency)].join(','))
    downloadCsv(`${i.id}.csv`, [head, ...lines].join('\n'))
    toast.success(`${i.id} exported`)
  }

  return (
    <LocalPage>
      <FilterLine right={<>
        <SearchBox value={q} onChange={setQ} placeholder="Search invoices" />
        <IconBtn title="Download invoices (CSV)" onClick={() => {
          downloadCsv('invoices.csv', ['Invoice,Period,Consignments,Shipping,Tax,Total,Currency,Status',
            ...rows.map((i) => [i.id, i.label, i.consignments, i.shipping, i.tax, i.total, curCode(i.currency), i.status].join(','))].join('\n'))
          toast.success(`${plural(rows.length, 'invoice')} exported`)
        }}><Download size={16} /></IconBtn>
      </>}>
        <FilterSelect value={status} placeholder="Status" options={['Open', 'Due', 'Paid']} width={150} onChange={setStatus} />
        <FilterSelect value={currency} placeholder="Currency" options={[...new Set(all.map((i) => i.currency))]} width={150} onChange={setCurrency} />
        <ClearFilters active={filtersOn} onClick={() => { setQ(''); setStatus(''); setCurrency('') }} />
      </FilterLine>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <KpiTile icon={<CalendarClock size={18} />} label="Billed this month" value={byCurrency(all.filter((i) => i.month === thisM))}
          hint={`${plural(all.filter((i) => i.month === thisM).reduce((n, i) => n + i.consignments, 0), 'consignment')} so far`} />
        <KpiTile icon={<Wallet size={18} />} tone={due.length ? 'warning' : 'neutral'} label="Outstanding" value={byCurrency(due)}
          hint={postpaid ? (due.length ? `Due ${fmtDate(due[0].dueOn)}` : 'Nothing due') : 'Prepaid account — paid at checkout'}
          onClick={due.length ? () => setStatus('Due') : undefined} />
        <KpiTile icon={<CircleCheck size={18} />} tone="success" label="Paid" value={byCurrency(all.filter((i) => i.status === 'Paid'))}
          hint={`${plural(all.filter((i) => i.status === 'Paid').length, 'invoice')}`} />
      </div>

      <div className="mt-4">
        {rows.length === 0 ? (
          <Panel><EmptyState icon={<FileText size={32} />} title={filtersOn ? 'No invoices match these filters' : 'No invoices yet'} hint="An invoice builds up from the month's payments." /></Panel>
        ) : (
          <PagedTable rows={rows} columns={columns} onRowClick={setOpen} resetKey={`${q}|${status}|${currency}`} />
        )}
        <p className="mt-2 text-[12px] text-ink-3">Invoices are built from your payments. Amounts marked Estimated were priced from the rate card, not a checkout.</p>
      </div>

      {open && (
        <Modal open wide title={`Invoice ${open.id}`} subtitle={`${open.label} · ${plural(open.consignments, 'consignment')} · ${postpaid ? `Due ${fmtDate(open.dueOn)}` : 'Prepaid'}`}
          onClose={() => setOpen(null)}
          footer={<><Button variant="ghost" onClick={() => nav(raiseDisputeHref('Invoice', open.id))}>Raise a query</Button><Button variant="outline" icon={<Download size={15} />} onClick={() => exportInvoice(open)}>Download Invoice</Button><Button onClick={() => setOpen(null)}>Close</Button></>}>
          <div className="mb-3 flex items-center gap-2"><StatusPill label={open.status} tone={TONE[open.status]} />
            {open.estimated && <span className="text-[12px] text-ink-3">Includes estimated amounts</span>}</div>
          <table className="w-full text-[13px]">
            <thead><tr className="border-b border-line bg-warm-25 text-left">
              {['Payment', 'Date', 'Consignments', 'Shipping', 'Tax', 'Amount'].map((h, i) => (
                <th key={h} className={`px-3 py-2 font-bold text-ink ${i >= 3 ? 'text-right' : ''}`}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {open.entries.map((e) => (
                <tr key={e.id} className="cursor-pointer border-b border-line hover:bg-warm-50" onClick={() => nav(`/grow/orders/wallet/${e.id}`)}>
                  <td className="px-3 py-2 text-ink">{e.id}</td>
                  <td className="px-3 py-2 text-ink-2">{fmtDateTime(e.at)}</td>
                  <td className="px-3 py-2 text-ink-2">{e.consignmentNos.join(', ')}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-ink-2">{money(e.shipping, e.currency)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-ink-2">{money(e.tax, e.currency)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-ink">{money(e.amount, e.currency)}{e.estimated && <span className="ml-1 text-[11px] text-ink-3">est.</span>}</td>
                </tr>
              ))}
            </tbody>
            <tfoot><tr className="text-[13px] font-bold text-ink">
              <td className="px-3 py-2" colSpan={3}>Total</td>
              <td className="px-3 py-2 text-right tabular-nums">{money(open.shipping, open.currency)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{money(open.tax, open.currency)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{money(open.total, open.currency)}</td>
            </tr></tfoot>
          </table>
        </Modal>
      )}
    </LocalPage>
  )
}
