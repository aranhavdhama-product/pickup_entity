/**
 * Disputes (`/grow/orders/disputes`, `/disputes/:id`) — the live GROW-STAGING
 * tenant's Disputes group (research 2026-09-25 §9): three kinds, Transaction
 * ("Wallet Dispute") · Tracking ("Manage Queries") · Invoice ("Invoice
 * Dispute"), each with Open / Closed tabs and its live column set. One page, the
 * kind a chip in the console FilterLine (`?kind=`), Open / Closed as LocalTabs
 * (`?tab=`). Tracking adds the live toolbar's Date Filter, Category / Priority
 * filters and the selection actions Close Disputes · Validate Address.
 * Raised from a payment (Wallet ⋮), a consignment (`RaiseDisputeButton`, the
 * overlay's header) or an invoice (Billing): `?raise=<kind>:<subject>` opens the
 * dialog preselected. Row click → the dispute's view page (details, timeline,
 * comment, dev "Simulate support response"). The raise form fields, vocabularies
 * and the thread view are OURS (not capturable — no live data).
 */
import { useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { CheckCircle2, CircleDot, FileWarning, MapPinCheck, MessageSquareWarning, XCircle } from 'lucide-react'
import { Button, EmptyState, MenuSelect, Modal, PageHeader, Panel, StatusPill, type Column } from '../../nueva/components'
import { Chip, ClearFilters, DateRange, FilterLine, FilterSelect, LocalPage, LocalTabs, SearchBox } from '../../local/chrome'
import { toast } from '../../nueva/toast'
import { useGrowOrders } from '../../growOrders/store'
import {
  CATEGORIES, DISPUTE_KINDS, DISPUTE_TONE, KIND_TITLE, PRIORITIES, disputeActions, disputeById, isClosed, openDisputeOn, useDisputes,
  type Dispute, type DisputeKind, type Priority,
} from '../../growOrders/disputes'
import { chargesOf, useLedger } from '../../growOrders/ledger'
import { invoicesOf } from '../../growOrders/invoices'
import { currentMerchant, useMasters, useMerchantCode } from '../../growOrders/masters'
import { useMerchantSettings } from '../../growOrders/merchantSettings'
import { MField, NumInput, Segment, TEXTAREA } from './merchantFormBits'
import { fmtDateTime, money } from './utils'
import { PagedTable, ReadField, plural } from './accountBits'

const SLUG: Record<DisputeKind, string> = { Transaction: 'transaction', Tracking: 'tracking', Invoice: 'invoice' }
const kindOf = (slug: string | null | undefined): DisputeKind => DISPUTE_KINDS.find((k) => SLUG[k] === slug) ?? 'Tracking'

/* ------------------------------------------------------------ entry points -- */

/** "Raise dispute" for the consignment overlay's header actions — a Tracking query on this consignment. */
export function RaiseDisputeButton({ orderId }: { orderId: string }) {
  const nav = useNavigate()
  return (
    <Button variant="outline" icon={<MessageSquareWarning size={15} />}
      onClick={() => nav(`/grow/orders/disputes?kind=tracking&raise=${encodeURIComponent(`tracking:${orderId}`)}`)}>Raise query</Button>
  )
}
/** The link other pages use to open the raise dialog preselected. */
export const raiseDisputeHref = (kind: DisputeKind, subject: string) =>
  `/grow/orders/disputes?kind=${SLUG[kind]}&raise=${encodeURIComponent(`${SLUG[kind]}:${subject}`)}`

/* ---------------------------------------------------------- raise dialog -- */

function usePostpaidInvoices() {
  const ledger = useLedger()
  const masters = useMasters()
  const merchant = currentMerchant(masters.merchants, useMerchantCode())
  const settings = useMerchantSettings(merchant?.code ?? '', merchant?.name ?? '', merchant?.party)
  return useMemo(() => invoicesOf(ledger, settings.business.paymentType === 'Postpaid'), [ledger, settings.business.paymentType])
}

export function RaiseDisputeDialog({ initialKind, initialSubject, onClose, onRaised }: {
  initialKind: DisputeKind; initialSubject?: string; onClose: () => void; onRaised: (d: Dispute) => void
}) {
  const db = useGrowOrders()
  const ledger = useLedger()
  const invoices = usePostpaidInvoices()
  const orders = useMemo(() => db.orders.filter((o) => !o.isDraft && o.paymentStatus === 'Paid')
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)), [db.orders])
  const [kind, setKind] = useState<DisputeKind>(initialKind)
  const [subject, setSubject] = useState(initialSubject ?? '')
  const [category, setCategory] = useState('')
  const [priority, setPriority] = useState<Priority>('Medium')
  const [amount, setAmount] = useState(0)
  const [desc, setDesc] = useState('')
  const [tried, setTried] = useState(false)
  const switchKind = (k: DisputeKind) => { setKind(k); setSubject(''); setCategory(''); setAmount(0) }

  const entry = kind === 'Transaction' ? ledger.find((e) => e.id === subject) : undefined
  const order = kind === 'Tracking' ? orders.find((o) => o.id === subject) : undefined
  const inv = kind === 'Invoice' ? invoices.find((i) => i.id === subject) : undefined
  const parentAmount = entry?.amount ?? inv?.total ?? 0
  const cur = entry?.currency ?? inv?.currency ?? order?.currency ?? '₱'
  const existing = subject ? openDisputeOn(kind, subject) : undefined
  const options = kind === 'Transaction' ? ledger.map((e) => e.id) : kind === 'Invoice' ? invoices.map((i) => i.id) : orders.map((o) => o.id)
  const label = (id: string) => {
    if (kind === 'Transaction') { const e = ledger.find((x) => x.id === id); return e ? `${e.id} · ${e.consignmentNos[0] ?? ''}${e.consignmentNos.length > 1 ? ` +${e.consignmentNos.length - 1}` : ''} · ${money(e.amount, e.currency)}` : id }
    if (kind === 'Invoice') { const i = invoices.find((x) => x.id === id); return i ? `${i.id} · ${i.label} · ${money(i.total, i.currency)}` : id }
    const o = orders.find((x) => x.id === id); return o ? `${o.orderNumber} · ${o.receiver.name || 'Receiver'} · ${o.status}` : id
  }
  const needsAmount = kind !== 'Tracking'
  const errs = {
    subject: !subject ? `Pick ${kind === 'Transaction' ? 'a payment' : kind === 'Invoice' ? 'an invoice' : 'a consignment'}`
      : existing ? `${existing.id} is already open on this ${kind === 'Tracking' ? 'consignment' : kind.toLowerCase()}` : '',
    category: !category ? 'Pick a category' : '',
    amount: needsAmount && !(amount > 0) ? 'Enter the amount you dispute' : needsAmount && amount > parentAmount ? `At most ${money(parentAmount, cur)}` : '',
    desc: desc.trim().length < 10 ? 'Describe the issue (at least 10 characters)' : '',
  }
  const ok = !Object.values(errs).some(Boolean)
  const submit = () => {
    setTried(true)
    if (!ok) return
    const d = disputeActions.raise({
      kind, transactionRef: entry?.id ?? '', orderId: order?.id ?? entry?.orderIds[0] ?? '',
      consignmentNo: order ? order.trackingNumber || order.orderNumber : entry?.consignmentNos[0] ?? '', orderNumber: order?.orderNumber ?? '',
      invoiceNo: inv?.id ?? '', amount: parentAmount, disputeAmount: needsAmount ? amount : 0, currency: cur,
      category, priority, description: desc.trim(),
    })
    toast.success(`${kind === 'Tracking' ? 'Query' : 'Dispute'} ${d.id} raised`)
    onRaised(d)
  }
  return (
    <Modal open title={kind === 'Tracking' ? 'Raise a query' : 'Raise dispute'} subtitle="Customer service replies on the dispute's timeline." onClose={onClose}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={submit}>Raise</Button></>}>
      <div className="grid grid-cols-1 gap-4 pb-4 pt-1 sm:grid-cols-2">
        <MField label="Dispute on" className="sm:col-span-2">
          <Segment options={DISPUTE_KINDS.map((k) => ({ value: k, label: k === 'Transaction' ? 'Wallet transaction' : k === 'Tracking' ? 'Consignment (query)' : 'Invoice' }))}
            value={kind} onChange={(v) => switchKind(v as DisputeKind)} />
        </MField>
        <MField label={kind === 'Transaction' ? 'Transaction reference' : kind === 'Invoice' ? 'Invoice number' : 'Consignment'} required
          error={tried && errs.subject} className="sm:col-span-2"
          hint={order ? `Charged ${money(chargesOf(order).total, order.currency)} · ${order.status}` : parentAmount ? `Amount ${money(parentAmount, cur)}` : undefined}>
          <MenuSelect key={kind} value={subject} placeholder="Search…" options={options} labels={label} searchable onChange={setSubject} />
        </MField>
        <MField label="Category" required error={tried && errs.category}>
          <MenuSelect key={kind} value={category} placeholder="Select a category" options={CATEGORIES[kind]} onChange={setCategory} />
        </MField>
        {kind === 'Tracking' ? (
          <MField label="Priority">
            <MenuSelect value={priority} options={[...PRIORITIES]} onChange={(v) => setPriority(v as Priority)} />
          </MField>
        ) : (
          <MField label={`Dispute amount (${cur})`} required error={tried && errs.amount}>
            <NumInput value={amount} onChange={setAmount} unit={cur} blankZero placeholder="0" />
          </MField>
        )}
        <MField label="Description" required error={tried && errs.desc} className="sm:col-span-2">
          <textarea rows={4} value={desc} onChange={(e) => setDesc(e.target.value)} className={TEXTAREA}
            placeholder="What happened, and what outcome do you expect?" />
        </MField>
      </div>
    </Modal>
  )
}

/* --------------------------------------------------------------- the list -- */

export default function DisputesPage() {
  const nav = useNavigate()
  const disputes = useDisputes()
  const db = useGrowOrders()
  const [params, setParams] = useSearchParams()
  const kind = kindOf(params.get('kind'))
  const closedTab = params.get('tab') === 'closed'
  const raise = params.get('raise')
  const [raising, setRaising] = useState(false)
  const [q, setQ] = useState('')
  const [category, setCategory] = useState('')
  const [priority, setPriority] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const patch = (fn: (n: URLSearchParams) => void) => setParams((p) => { const n = new URLSearchParams(p); fn(n); return n }, { replace: true })
  const clearFilters = () => { setQ(''); setCategory(''); setPriority(''); setFrom(''); setTo('') }
  const setKind = (k: DisputeKind) => { clearFilters(); patch((n) => { n.set('kind', SLUG[k]) }) }
  const [raiseKindSlug, raiseSubject] = raise ? [raise.split(':')[0], raise.slice(raise.indexOf(':') + 1)] : [null, undefined]
  const dialogOpen = raising || !!raise
  const closeDialog = () => { setRaising(false); if (raise) patch((n) => n.delete('raise')) }

  const ofKind = useMemo(() => disputes.filter((d) => d.kind === kind), [disputes, kind])
  const counts = { open: ofKind.filter((d) => !isClosed(d.status)).length, closed: ofKind.filter((d) => isClosed(d.status)).length }
  const rows = useMemo(() => {
    const n = q.trim().toLowerCase()
    return ofKind.filter((d) => isClosed(d.status) === closedTab
      && (!category || d.category === category) && (!priority || d.priority === priority)
      && (!from || d.raisedAt.slice(0, 10) >= from.slice(0, 10)) && (!to || d.raisedAt.slice(0, 10) <= to.slice(0, 10))
      && (!n || [d.id, d.consignmentNo, d.orderNumber, d.transactionRef, d.invoiceNo, d.description, d.category].some((v) => v.toLowerCase().includes(n))))
      .sort((a, b) => (a.raisedAt < b.raisedAt ? 1 : -1))
  }, [ofKind, closedTab, q, category, priority, from, to])
  const filtersOn = !!(q || category || priority || from || to)
  const status = (d: Dispute) => <StatusPill label={d.status} tone={DISPUTE_TONE[d.status]} />
  const ref = (d: Dispute) => <b className="text-ink">{d.id}</b>
  const cell = (v: string) => <span className="block truncate" title={v}>{v || '—'}</span>

  /* the live column sets, per kind */
  const columns: Column[] = kind === 'Transaction' ? [
    { key: 'id', label: 'Dispute Reference Number', width: 200, render: ref },
    { key: 'tx', label: 'Transaction Reference Number', render: (d: Dispute) => cell(d.transactionRef) },
    { key: 'cn', label: 'Consignment Number', width: 190, render: (d: Dispute) => cell(d.consignmentNo) },
    { key: 'amt', label: 'Dispute Amount', width: 140, align: 'right', render: (d: Dispute) => money(d.disputeAmount, d.currency) },
    { key: 'raised', label: 'Dispute Raised Date', width: 160, render: (d: Dispute) => fmtDateTime(d.raisedAt) },
    { key: 'status', label: 'Current Status', width: 140, render: status },
  ] : kind === 'Invoice' ? [
    { key: 'id', label: 'Dispute Reference Number', width: 200, render: ref },
    { key: 'inv', label: 'Invoice Number', render: (d: Dispute) => cell(d.invoiceNo) },
    { key: 'amount', label: 'Amount', width: 150, align: 'right', render: (d: Dispute) => money(d.amount, d.currency) },
    { key: 'damt', label: 'Dispute Amount', width: 150, align: 'right', render: (d: Dispute) => money(d.disputeAmount, d.currency) },
    { key: 'raised', label: 'Dispute Raised Date', width: 160, render: (d: Dispute) => fmtDateTime(d.raisedAt) },
    { key: 'status', label: 'Current Status', width: 140, render: status },
  ] : [
    { key: 'id', label: 'Order Query Number', width: 160, render: ref },
    { key: 'ship', label: 'Shipment Number', width: 170, render: (d: Dispute) => cell(d.consignmentNo) },
    { key: 'ord', label: 'Order Number', width: 150, render: (d: Dispute) => cell(d.orderNumber) },
    { key: 'raised', label: 'Query Raised Date', width: 150, render: (d: Dispute) => fmtDateTime(d.raisedAt) },
    { key: 'cat', label: 'Category', render: (d: Dispute) => cell(d.category) },
    { key: 'status', label: 'Current Status', width: 130, render: status },
    { key: 'pri', label: 'Priority', width: 90, render: (d: Dispute) => d.priority },
    { key: 'upd', label: 'Updated At', width: 150, render: (d: Dispute) => fmtDateTime(d.updatedAt) },
  ]

  return (
    <LocalPage>
      <FilterLine right={<>
        <SearchBox value={q} onChange={setQ} placeholder={kind === 'Tracking' ? 'Search queries' : 'Search disputes'} />
        <Button icon={<MessageSquareWarning size={15} />} onClick={() => setRaising(true)}>{kind === 'Tracking' ? 'Raise a query' : 'Raise dispute'}</Button>
      </>}>
        {DISPUTE_KINDS.map((k) => (
          <Chip key={k} active={k === kind} count={disputes.filter((d) => d.kind === k && !isClosed(d.status)).length} onClick={() => setKind(k)}>
            {k === 'Transaction' ? 'Wallet' : k}
          </Chip>
        ))}
        {kind === 'Tracking' && <DateRange start={from} end={to} onStart={setFrom} onEnd={setTo} />}
        <FilterSelect value={category} placeholder="Category" options={CATEGORIES[kind]} width={170} onChange={setCategory} />
        {kind === 'Tracking' && <FilterSelect value={priority} placeholder="Priority" options={[...PRIORITIES]} width={130} onChange={setPriority} />}
        <ClearFilters active={filtersOn} onClick={clearFilters} />
      </FilterLine>
      <LocalTabs tabs={[{ id: 'open', label: 'Open', count: counts.open, icon: CircleDot }, { id: 'closed', label: 'Closed', count: counts.closed, icon: CheckCircle2 }]}
        active={closedTab ? 'closed' : 'open'} onChange={(id) => patch((n) => n.set('tab', id))} />
      <div className="mt-4">
        <p className="mb-2 text-[12px] text-ink-3"><b className="text-ink-2">{KIND_TITLE[kind].title}</b> · {KIND_TITLE[kind].subtitle}</p>
        {rows.length === 0 ? (
          <Panel><EmptyState icon={<FileWarning size={32} />} title={filtersOn ? 'No disputes match these filters' : 'No results found.'}
            hint={filtersOn ? 'Clear the filters to see every dispute.' : kind === 'Transaction' ? 'Raise one from a payment in Wallet.' : kind === 'Invoice' ? 'Raise one from an invoice in Billing.' : 'Raise a query from a consignment.'} /></Panel>
        ) : (
          <PagedTable key={`${kind}|${closedTab}`} rows={rows} columns={columns} onRowClick={(d) => nav(`/grow/orders/disputes/${d.id}`)}
            resetKey={`${q}|${category}|${priority}|${from}|${to}`} initialSize={kind === 'Transaction' ? 10 : 100}
            selectable={kind === 'Tracking' && !closedTab}
            selectionActions={kind === 'Tracking' ? (sel, clear) => [
              { label: 'Close Disputes', icon: <XCircle size={14} />, onClick: () => { disputeActions.close(sel.map((d) => d.id)); clear(); toast.success(`${plural(sel.length, 'query')} closed`) } },
              { label: 'Validate Address', icon: <MapPinCheck size={14} />, onClick: () => {
                const bad = sel.filter((d) => { const o = db.orders.find((x) => x.id === d.orderId); return !o || !o.receiver.line1 || !o.receiver.postalCode })
                toast.info(bad.length ? `${plural(bad.length, 'address')} incomplete: ${bad.map((d) => d.consignmentNo).join(', ')}` : `${plural(sel.length, 'address')} valid`)
              } },
            ] : undefined} />
        )}
      </div>
      {dialogOpen && (
        <RaiseDisputeDialog initialKind={raise ? kindOf(raiseKindSlug) : kind} initialSubject={raise ? raiseSubject : undefined} onClose={closeDialog}
          onRaised={(d) => { closeDialog(); nav(`/grow/orders/disputes/${d.id}`) }} />
      )}
    </LocalPage>
  )
}

/* ---------------------------------------------------------- the view page -- */

export function DisputeViewPage() {
  const { id = '' } = useParams()
  const nav = useNavigate()
  useDisputes()
  const db = useGrowOrders()
  const d = disputeById(id)
  const [note, setNote] = useState('')
  const back = () => nav(`/grow/orders/disputes${d ? `?kind=${SLUG[d.kind]}${isClosed(d.status) ? '&tab=closed' : ''}` : ''}`)
  if (!d) {
    return (
      <div>
        <PageHeader title="Dispute" onBack={back} />
        <Panel><EmptyState title="Dispute not found" hint={`No dispute ${id} in this browser.`} /></Panel>
      </div>
    )
  }
  const order = db.orders.find((o) => o.id === d.orderId)
  const closed = isClosed(d.status)
  const subject = d.kind === 'Transaction' ? d.transactionRef : d.kind === 'Invoice' ? d.invoiceNo : d.consignmentNo
  return (
    <div>
      <PageHeader title={`${d.kind === 'Tracking' ? 'Query' : 'Dispute'} ${d.id}`} subtitle={`${KIND_TITLE[d.kind].title} · ${d.category} · ${subject}`} onBack={back}
        right={<div className="flex items-center gap-2">
          {!closed && <Button variant="ghost" onClick={() => { disputeActions.simulateSupport(d.id); toast.info('Support response simulated') }}>Simulate support response</Button>}
          {!closed && <Button variant="outline" onClick={() => { disputeActions.close([d.id]); toast.info(`${d.id} closed`) }}>Close dispute</Button>}
        </div>} />
      <div className="grid items-start gap-4 lg:grid-cols-[1fr_380px]">
        <div className="flex min-w-0 flex-col gap-4">
          <Panel title="Details">
            <div className="grid grid-cols-2 gap-x-4 gap-y-4 px-5 pb-5 pt-3 xl:grid-cols-4">
              <ReadField label="Current Status" value={<StatusPill label={d.status} tone={DISPUTE_TONE[d.status]} />} />
              <ReadField label="Category" value={d.category} />
              <ReadField label="Raised on" value={fmtDateTime(d.raisedAt)} />
              <ReadField label="Updated at" value={fmtDateTime(d.updatedAt)} />
              {d.kind === 'Transaction' && <ReadField label="Transaction Reference" value={
                <button type="button" className="font-bold text-ink hover:underline" onClick={() => nav(`/grow/orders/wallet/${d.transactionRef}`)}>{d.transactionRef}</button>} />}
              {d.kind === 'Invoice' && <ReadField label="Invoice Number" value={
                <button type="button" className="font-bold text-ink hover:underline" onClick={() => nav('/grow/orders/billing')}>{d.invoiceNo}</button>} />}
              {d.kind !== 'Invoice' && <ReadField label={d.kind === 'Tracking' ? 'Shipment Number' : 'Consignment Number'} value={order
                ? <button type="button" className="font-bold text-ink hover:underline" onClick={() => nav(`/grow/orders?order=${order.id}`)}>{d.consignmentNo}</button>
                : d.consignmentNo} />}
              {d.kind === 'Tracking' && <ReadField label="Order Number" value={d.orderNumber} />}
              {d.kind === 'Tracking' && <ReadField label="Priority" value={d.priority} />}
              {d.kind !== 'Tracking' && <ReadField label="Amount" value={money(d.amount, d.currency)} />}
              {d.kind !== 'Tracking' && <ReadField label="Dispute Amount" value={money(d.disputeAmount, d.currency)} />}
              {order && <ReadField label="Consignment status" value={order.status} />}
              <div className="col-span-2 xl:col-span-4">
                <p className="mb-1 text-[12px] font-bold text-ink-3">Description</p>
                <p className="whitespace-pre-wrap text-[13px] text-ink">{d.description}</p>
              </div>
            </div>
          </Panel>
          {!closed && (
            <Panel title="Add a comment">
              <div className="px-5 pb-5 pt-3">
                <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} className={TEXTAREA} placeholder="Add detail or answer customer service's question" />
                <div className="mt-3 flex justify-end">
                  <Button disabled={!note.trim()} onClick={() => { disputeActions.comment(d.id, note.trim()); setNote(''); toast.success('Comment added') }}>Send</Button>
                </div>
              </div>
            </Panel>
          )}
        </div>
        <Panel title="Timeline">
          <ol className="px-5 pb-5 pt-3">
            {[...d.events].reverse().map((e, i) => (
              <li key={i} className="relative border-l border-line pb-4 pl-4 last:pb-0">
                <span className={`absolute -left-[5px] top-1 h-[9px] w-[9px] rounded-full ${i === 0 ? 'bg-ink' : 'bg-warm-300'}`} />
                <p className="flex flex-wrap items-center gap-2 text-[12px] text-ink-3">
                  {fmtDateTime(e.at)} · {e.by}
                  {e.status && <StatusPill label={e.status} tone={DISPUTE_TONE[e.status]} />}
                </p>
                <p className="mt-1 text-[13px] text-ink">{e.note}</p>
              </li>
            ))}
          </ol>
        </Panel>
      </div>
    </div>
  )
}
