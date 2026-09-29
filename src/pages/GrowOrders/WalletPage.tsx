/**
 * Wallet (`/grow/orders/wallet?tab=wallet|payments`, `/wallet/:id` = receipt).
 *
 * Wallet tab — the live GROW-STAGING tenant's `/transactions/` (research
 * 2026-09-25 §4, owner: "wallet recharge button is missing"): a primary
 * **Recharge** (live modal "Add Money to Wallet" / "Enter amount to be added",
 * one amount field; ours adds quick picks, a payment method and a note — demo
 * only, no real payment) → Summary tiles Balance · Credits · Debits → the ledger
 * grid with the live columns (Bank Txn Date · Reference · Date · Transaction ·
 * Transaction Status · Debit · Credit · Balance · Remarks). Order payments are
 * debits, recharges credits; the running balance is `ledger.ts walletOf()`.
 * One wallet per currency (₱ network / $ Chicago network) — a Currency select
 * appears when both exist.
 *
 * Payments tab — the 2GO_PH tenant's list (screenshots 08–09): Reference ·
 * Consignment No. (+ count badge) · Date · Amount · Remarks · Transaction Status ·
 * ⋮ View Receipt / Raise Dispute.
 */
import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowDownLeft, ArrowUpRight, CreditCard, ListOrdered, Plus, Wallet } from 'lucide-react'
import { Button, EmptyState, KebabMenu, KpiTile, Panel, StatusPill, type Column } from '../../nueva/components'
import { FilterLine, FilterSelect, LocalPage, LocalTabs, SearchBox } from '../../local/chrome'
import { isDue, useLedger, walletOf, type LedgerEntry, type LedgerStatus, type WalletRow } from '../../growOrders/ledger'
import { fmtDateTime, money } from './utils'
import { CountBadge, PagedTable, plural } from './accountBits'
import { PayNowDialog, RechargeDialog } from './paymentSheet'
import { raiseDisputeHref } from './DisputesPage'

export const LEDGER_TONE: Record<LedgerStatus, 'success' | 'danger' | 'warning'> = { Success: 'success', Failed: 'danger', Pending: 'warning' }

/* ---------------------------------------------------------------- wallet -- */

function WalletTab({ ledger }: { ledger: LedgerEntry[] }) {
  const nav = useNavigate()
  const currencies = useMemo(() => [...new Set(ledger.map((e) => e.currency))].sort((a, b) => (a === '₱' ? -1 : b === '₱' ? 1 : a.localeCompare(b))), [ledger])
  const [currency, setCurrency] = useState('')
  const cur = currency || currencies[0] || '₱'
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const w = useMemo(() => walletOf(ledger, cur), [ledger, cur])
  const n = q.trim().toLowerCase()
  const rows = n ? w.rows.filter((r) => [r.id, r.remarks, r.mode, ...r.consignmentNos].some((v) => v.toLowerCase().includes(n))) : w.rows

  const columns: Column[] = [
    { key: 'bank', label: 'Bank Txn Date', width: 150, render: (r: WalletRow) => <span className="whitespace-nowrap">{fmtDateTime(r.bankTxnAt)}</span> },
    { key: 'id', label: 'Reference', width: 165, render: (r: WalletRow) => <span className="block truncate" title={r.id}>{r.id}</span> },
    { key: 'at', label: 'Date', width: 150, render: (r: WalletRow) => <span className="whitespace-nowrap">{fmtDateTime(r.at)}</span> },
    {
      key: 'txn', label: 'Transaction', width: 200, render: (r: WalletRow) => (
        <span className="flex min-w-0 items-center gap-2">
          {r.type === 'CR' ? <ArrowDownLeft size={14} className="shrink-0 text-success-fg" /> : <ArrowUpRight size={14} className="shrink-0 text-ink-3" />}
          <span className="truncate" title={r.type === 'CR' ? `Recharge · ${r.mode}` : r.consignmentNos.join(', ')}>
            {r.type === 'CR' ? `Recharge · ${r.mode}` : `Payment · ${r.consignmentNos[0] ?? ''}`}
          </span>
          {r.type === 'DR' && r.consignmentNos.length > 1 && <CountBadge n={r.consignmentNos.length} title={plural(r.consignmentNos.length, 'Consignment')} />}
        </span>
      ),
    },
    { key: 'status', label: 'Transaction Status', width: 140, render: (r: WalletRow) => <StatusPill label={r.status} tone={LEDGER_TONE[r.status]} /> },
    { key: 'debit', label: 'Debit', width: 110, align: 'right', render: (r: WalletRow) => (r.debit ? money(r.debit, cur) : '—') },
    { key: 'credit', label: 'Credit', width: 115, align: 'right', render: (r: WalletRow) => (r.credit ? <span className="text-success-fg">{money(r.credit, cur)}</span> : '—') },
    { key: 'balance', label: 'Balance', width: 120, align: 'right', render: (r: WalletRow) => <b className="text-ink">{money(r.balance, cur)}</b> },
    { key: 'remarks', label: 'Remarks', width: 150, render: (r: WalletRow) => <span className="block truncate" title={r.remarks}>{r.remarks || '--'}</span> },
  ]

  return (
    <>
      <FilterLine right={<>
        <SearchBox value={q} onChange={setQ} placeholder="Search transactions" />
        <Button icon={<Plus size={15} />} onClick={() => setOpen(true)}>Recharge</Button>
      </>}>
        {currencies.length > 1 && (
          <FilterSelect value={currency} placeholder={`Currency: ${cur}`} options={currencies} width={150}
            labels={(c) => `Currency: ${c}`} onChange={setCurrency} />
        )}
      </FilterLine>
      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
        <KpiTile icon={<Wallet size={18} />} tone={w.balance > 0 ? 'neutral' : 'danger'} label="Balance" value={money(w.balance, cur)}
          hint={w.balance > 0 ? 'Available for checkout' : 'Recharge to keep booking'} />
        <KpiTile icon={<ArrowDownLeft size={18} />} tone="success" label="Credits" value={money(w.credits, cur)}
          hint={plural(w.rows.filter((r) => r.credit).length, 'recharge')} />
        <KpiTile icon={<ArrowUpRight size={18} />} label="Debits" value={money(w.debits, cur)}
          hint={plural(w.rows.filter((r) => r.debit).length, 'payment')} />
      </div>
      <div className="mt-4">
        {w.rows.length === 0
          ? <Panel><EmptyState title="No transactions yet" hint="Recharge your wallet to start booking." /></Panel>
          : <PagedTable rows={rows} columns={columns} onRowClick={(r) => nav(`/grow/orders/wallet/${r.id}`)} resetKey={`${q}|${cur}`} />}
      </div>
      {open && <RechargeDialog currency={cur} onClose={() => setOpen(false)} />}
    </>
  )
}

/* -------------------------------------------------------------- payments -- */

function PaymentsTab({ ledger }: { ledger: LedgerEntry[] }) {
  const nav = useNavigate()
  const [q, setQ] = useState('')
  const [paying, setPaying] = useState<string | null>(null)
  const debits = useMemo(() => ledger.filter((e) => e.type === 'DR'), [ledger])
  const rows = useMemo(() => {
    const n = q.trim().toLowerCase()
    return n ? debits.filter((e) => [e.id, e.remarks, e.status, ...e.consignmentNos].some((v) => v.toLowerCase().includes(n))) : debits
  }, [debits, q])
  const open = (e: LedgerEntry) => nav(`/grow/orders/wallet/${e.id}`)
  const columns: Column[] = [
    { key: 'id', label: 'Reference', width: 200, render: (e: LedgerEntry) => <span className="block truncate" title={e.id}>{e.id}</span> },
    {
      key: 'cn', label: 'Consignment No.', width: 190, render: (e: LedgerEntry) => (
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate" title={e.consignmentNos.join(', ')}>{e.consignmentNos[0] ?? '—'}</span>
          {e.consignmentNos.length > 1 && <CountBadge n={e.consignmentNos.length} title={plural(e.consignmentNos.length, 'Consignment')} />}
        </span>
      ),
    },
    { key: 'at', label: 'Date', width: 150, render: (e: LedgerEntry) => fmtDateTime(e.at) },
    { key: 'amount', label: 'Amount', width: 130, align: 'right', render: (e: LedgerEntry) => money(e.amount, e.currency) },
    { key: 'remarks', label: 'Remarks', render: (e: LedgerEntry) => e.remarks || '--' },
    { key: 'mode', label: 'Payment Mode', width: 150, render: (e: LedgerEntry) => <span className="block truncate">{e.mode}</span> },
    { key: 'status', label: 'Transaction Status', width: 160, render: (e: LedgerEntry) => (isDue(e) ? <StatusPill label="Due" tone="warning" /> : <StatusPill label={e.status} tone={LEDGER_TONE[e.status]} />) },
    {
      key: 'actions', label: 'Actions', width: 90, render: (e: LedgerEntry) => (
        <span onClick={(ev) => ev.stopPropagation()}>
          <KebabMenu items={[
            ...(isDue(e) ? [{ label: 'Pay now', onClick: () => setPaying(e.id) }] : []),
            { label: 'View Receipt', onClick: () => open(e) }, { label: 'Raise Dispute', onClick: () => nav(raiseDisputeHref('Transaction', e.id)) }]} />
        </span>
      ),
    },
  ]
  return (
    <>
      <FilterLine right={<SearchBox value={q} onChange={setQ} placeholder="Search payments" />}>{null}</FilterLine>
      <div className="mt-4">
        {debits.length === 0
          ? <Panel><EmptyState title="No payments yet" hint="A payment appears here once a consignment is checked out." /></Panel>
          : <PagedTable rows={rows} columns={columns} onRowClick={open} resetKey={q} />}
      </div>
      {paying && <PayNowDialog entryIds={[paying]} onClose={() => setPaying(null)} />}
    </>
  )
}

export default function WalletPage() {
  const ledger = useLedger()
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') === 'payments' ? 'payments' : 'wallet'
  return (
    <LocalPage>
      <LocalTabs tabs={[{ id: 'wallet', label: 'Wallet', icon: Wallet }, { id: 'payments', label: 'Payments', icon: ListOrdered }]}
        active={tab} onChange={(id) => setParams((p) => { const n = new URLSearchParams(p); n.set('tab', id); return n }, { replace: true })}
        right={<span className="inline-flex items-center gap-1.5 text-[12px] text-ink-3"><CreditCard size={14} />Manage payments for quicker transactions</span>} />
      <div className="mt-4">{tab === 'wallet' ? <WalletTab ledger={ledger} /> : <PaymentsTab ledger={ledger} />}</div>
    </LocalPage>
  )
}
