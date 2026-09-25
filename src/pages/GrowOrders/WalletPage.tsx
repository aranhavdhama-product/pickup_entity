/**
 * Wallet → "Payments" (`/grow/orders/wallet`) — the live portal's `/transactions/`
 * (research 2026-09-25 §4, screenshots 08–09): ONE card = search on the right →
 * grid REFERENCE · CONSIGNMENT NO. (+ count badge when one payment covered
 * several) · DATE · AMOUNT · REMARKS · TRANSACTION STATUS · ACTIONS (⋮ View
 * Receipt · Raise Dispute (ours → the Wallet Dispute kind)) → rows per page 10. Row click opens the receipt (our "row click =
 * view" rule; live only selects the row). No balance, no top-up — live has none.
 * Data: `growOrders/ledger.ts`.
 */
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { EmptyState, KebabMenu, Panel, StatusPill, type Column } from '../../nueva/components'
import { FilterLine, LocalPage, SearchBox } from '../../local/chrome'
import { useLedger, type LedgerEntry, type LedgerStatus } from '../../growOrders/ledger'
import { fmtDateTime, money } from './utils'
import { CountBadge, PagedTable, plural } from './accountBits'
import { raiseDisputeHref } from './DisputesPage'

export const LEDGER_TONE: Record<LedgerStatus, 'success' | 'danger' | 'warning'> = { Success: 'success', Failed: 'danger', Pending: 'warning' }

export default function WalletPage() {
  const nav = useNavigate()
  const ledger = useLedger()
  const [q, setQ] = useState('')
  const rows = useMemo(() => {
    const n = q.trim().toLowerCase()
    if (!n) return ledger
    return ledger.filter((e) => [e.id, e.remarks, e.status, ...e.consignmentNos].some((v) => v.toLowerCase().includes(n)))
  }, [ledger, q])
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
    { key: 'status', label: 'Transaction Status', width: 160, render: (e: LedgerEntry) => <StatusPill label={e.status} tone={LEDGER_TONE[e.status]} /> },
    {
      key: 'actions', label: 'Actions', width: 90, render: (e: LedgerEntry) => (
        <span onClick={(ev) => ev.stopPropagation()}>
          <KebabMenu items={[{ label: 'View Receipt', onClick: () => open(e) }, { label: 'Raise Dispute', onClick: () => nav(raiseDisputeHref('Transaction', e.id)) }]} />
        </span>
      ),
    },
  ]

  return (
    <LocalPage>
      <FilterLine right={<SearchBox value={q} onChange={setQ} placeholder="Search payments" />}>{null}</FilterLine>
      <div className="mt-4">
        {ledger.length === 0 ? (
          <Panel><EmptyState title="No payments yet" hint="A payment appears here once a consignment is checked out." /></Panel>
        ) : (
          <PagedTable rows={rows} columns={columns} onRowClick={open} resetKey={q} />
        )}
      </div>
    </LocalPage>
  )
}
