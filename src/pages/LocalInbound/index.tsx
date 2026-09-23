/**
 * Inbound (LOCAL) — the hub side of the pickup handover.
 *
 * Staging's Inbound is the functionality reference (date range, Incoming ·
 * Pending · Misroute · Overage · Damage · Completed, an "Inbound" button to
 * the scanner); layout is this app's list grammar. Every bucket is derived —
 * see `buckets.ts`. Spec §3.4, §6.5.
 */
import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  AlertTriangle, CheckCircle2, Clock, PackagePlus, ScanLine, Shuffle, Truck,
} from 'lucide-react'
import {
  Button, DataTable, EmptyState, Field, MenuSelect, Modal, PageSize, Pagination, Panel,
  StatusPill, type Column,
} from '../../nueva/components'
import {
  ClearFilters, DateRange, FilterLine, FilterSelect, LocalPage, LocalTabs, SearchBox,
} from '../../local/chrome'
import { growOrderActions, useGrowOrders } from '../../growOrders/store'
import type { GrowOrder } from '../../growOrders/types'
import { toast } from '../../nueva/toast'
import { daysFromNow } from '../../growOrders/tabs'
import { INBOUND_HUBS } from '../../growOrders/hubs'
import { usePlanning } from '../LocalPFP/planningStore'
import { stamp } from '../LocalPFP/overlayFormat'
import { INBOUND_TABS, inboundRows, type InboundRow } from './buckets'

const TAB_ICONS = [Truck, Clock, Shuffle, PackagePlus, AlertTriangle, CheckCircle2]
const DEFAULT_FROM = () => daysFromNow(-7)
const DEFAULT_TO = () => daysFromNow(0)

export default function LocalInbound() {
  const nav = useNavigate()
  const db = useGrowOrders()
  const plan = usePlanning()

  const [tab, setTab] = useState(0)
  const [from, setFrom] = useState(DEFAULT_FROM)
  const [to, setTo] = useState(DEFAULT_TO)
  const [hub, setHub] = useState('')
  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [attaching, setAttaching] = useState<InboundRow | null>(null)

  const all = useMemo(() => inboundRows(db, plan.trips), [db, plan.trips])
  const inRange = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return all.filter((r) => {
      if (from && r.day < from) return false
      if (to && r.day > to) return false
      if (hub && r.hubCode !== hub) return false
      if (needle && !`${r.code} ${r.prNumber} ${r.merchant} ${r.pickupPoint}`.toLowerCase().includes(needle)) return false
      return true
    })
  }, [all, from, to, hub, q])
  const counts = INBOUND_TABS.map((t) => inRange.filter((r) => r.tab === t).length)
  const rows = inRange.filter((r) => r.tab === INBOUND_TABS[tab])
    .sort((a, b) => ((a.scannedAt ?? a.pickedAt ?? '') < (b.scannedAt ?? b.pickedAt ?? '') ? 1 : -1))

  const filtersOn = from !== DEFAULT_FROM() || to !== DEFAULT_TO() || !!hub || !!q
  const clearAll = () => { setFrom(DEFAULT_FROM()); setTo(DEFAULT_TO()); setHub(''); setQ(''); setPage(1) }
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize))
  const safePage = Math.min(page, totalPages)
  const paged = rows.slice((safePage - 1) * pageSize, safePage * pageSize)

  const columns: Column[] = [
    {
      key: 'code', label: INBOUND_TABS[tab] === 'Overage' ? 'Scanned barcode' : 'Shipment', width: 150,
      render: (r) => {
        const x = r as InboundRow
        return x.orderId
          ? <Link to={`/local/consignments/${x.orderId}`} onClick={(e) => e.stopPropagation()} className="font-mono text-[12px] font-bold text-brand-500 hover:underline">{x.code}</Link>
          : <span className="font-mono text-[12px] font-bold text-ink">{x.code}</span>
      },
    },
    {
      key: 'pr', label: 'PR', width: 110,
      render: (r) => ((r as InboundRow).prId
        ? <Link to={`/local/pickup/${(r as InboundRow).prId}`} onClick={(e) => e.stopPropagation()} className="font-mono text-[12px] font-bold text-ink hover:underline">{(r as InboundRow).prNumber}</Link>
        : '—'),
    },
    { key: 'merchant', label: 'Merchant', width: 110, render: (r) => <span className="block truncate">{(r as InboundRow).merchant}</span> },
    {
      key: 'route', label: 'Pickup point → hub',
      render: (r) => {
        const x = r as InboundRow
        return (
          <span className="block min-w-0" title={x.pickupPoint}>
            <span className="block truncate">{x.pickupPoint}</span>
            <span className="block text-[12px] text-ink-3">→ {x.hubCode || '—'}</span>
          </span>
        )
      },
    },
    { key: 'picked', label: 'Picked at', width: 150, render: (r) => stamp((r as InboundRow).pickedAt) },
    {
      key: 'scanned', label: 'Scanned at / by', width: 170,
      render: (r) => {
        const x = r as InboundRow
        return x.scannedAt
          ? <span className="block"><span className="block">{stamp(x.scannedAt)}</span><span className="block text-[12px] text-ink-3">{x.scannedBy}</span></span>
          : '—'
      },
    },
    { key: 'status', label: 'Status', width: 170, render: (r) => <StatusPill label={(r as InboundRow).status} tone={(r as InboundRow).tone} /> },
  ]

  const rowActions = (r: InboundRow) => {
    if (r.tab === 'Misroute') {
      if (r.forwarded || !r.orderId || !r.forwardTo) return <span className="text-[12px] text-ink-3">Awaiting in-scan at {r.forwardTo}</span>
      return (
        <Button size="sm" variant="outline" onClick={() => {
          if (growOrderActions.forwardMisroute(r.orderId!, r.forwardTo!)) toast.success(`${r.code} forwarded to ${r.forwardTo}.`)
          else toast.error(`${r.code} could not be forwarded — no request to record it on.`)
        }}>Forward to {r.forwardTo}</Button>
      )
    }
    if (!r.hubOverageId) return <span className="text-[12px] text-ink-3">Resolve on the PR</span>
    const id = r.hubOverageId
    return (
      <div className="flex items-center gap-1.5">
        <Button size="sm" variant="outline" onClick={() => setAttaching(r)}>Attach</Button>
        <Button size="sm" variant="ghost" onClick={() => {
          const v = growOrderActions.resolveHubOverage(id, { action: 'create' })
          if (v) toast.success(`Shipment ${r.code} created at ${r.hubCode || 'the hub'}.`)
        }}>Create shipment</Button>
        <Button size="sm" variant="ghost" onClick={() => {
          if (growOrderActions.resolveHubOverage(id, { action: 'reject', note: 'Rejected at Inbound' })) toast.info(`${r.code} rejected.`)
        }}>Reject</Button>
      </div>
    )
  }

  const HINT: Record<string, string> = {
    Incoming: 'Collected parcels on a trip that is still on the road show here until the hub scans them.',
    Pending: 'Parcels a debriefed trip collected that the hub never scanned — a handover discrepancy.',
    Misroute: 'Hub scans at a hub other than the shipment’s inbound hub.',
    Overage: 'Driver or hub scans that matched no shipment, still waiting to be attached, created or rejected.',
    Damage: 'Hub scans flagged “Mark as damaged” in the scanner.',
    Completed: 'Every hub in-scan in the date range.',
  }

  return (
    <LocalPage>
      {/* no page header: the app bar names the page. The owner-finalised local
          chrome (spec §11): tabs on the canvas, the Inbound action on the
          strip's right, then ONE filter line */}
      <LocalTabs
        tabs={INBOUND_TABS.map((t, i) => ({ id: String(i), label: t, count: counts[i], icon: TAB_ICONS[i] }))}
        active={String(tab)} onChange={(id) => { setTab(Number(id)); setPage(1) }}
        right={<Button icon={<ScanLine size={15} />} onClick={() => nav('/local/inbound/scanner')}>Inbound</Button>} />
      <FilterLine
        right={<SearchBox value={q} onChange={(v) => { setQ(v); setPage(1) }} placeholder="Search shipment, PR" />}>
        <DateRange start={from} end={to} onStart={(v) => { setFrom(v); setPage(1) }} onEnd={(v) => { setTo(v); setPage(1) }} />
        <FilterSelect value={hub} placeholder="Inbound hub" options={INBOUND_HUBS.map((h) => h.code)} width={200}
          labels={(c) => INBOUND_HUBS.find((h) => h.code === c)?.name ?? c} onChange={(v) => { setHub(v); setPage(1) }} />
        <ClearFilters active={filtersOn} onClick={clearAll} />
      </FilterLine>

      <div className="mt-4">
        {rows.length === 0 ? (
          <Panel><EmptyState title={`Nothing under ${INBOUND_TABS[tab]}`} hint={HINT[INBOUND_TABS[tab]]} /></Panel>
        ) : (
          <>
            <DataTable columns={columns} rows={paged} rowKey="key"
              extraActions={INBOUND_TABS[tab] === 'Overage' || INBOUND_TABS[tab] === 'Misroute' ? rowActions : undefined}
              onRowClick={(r) => { if ((r as InboundRow).prId) nav(`/local/pickup/${(r as InboundRow).prId}`) }} />
            <div className="flex items-center justify-between gap-3">
              <div className="flex-1">
                <Pagination page={safePage} total={totalPages} onChange={setPage}
                  range={`${(safePage - 1) * pageSize + 1}-${Math.min(safePage * pageSize, rows.length)} of ${rows.length}`} />
              </div>
              <div className="pt-3"><PageSize value={pageSize} onChange={(n) => { setPageSize(n); setPage(1) }} /></div>
            </div>
          </>
        )}
      </div>

      {attaching?.hubOverageId && (
        <AttachOverageModal row={attaching} orders={db.orders} onClose={() => setAttaching(null)} />
      )}
    </LocalPage>
  )
}

/** Attach a held hub label to an existing consignment: orders bound for that
 *  hub with no tracking number first (the likely owners), then every other one. */
function AttachOverageModal({ row, orders, onClose }: { row: InboundRow; orders: GrowOrder[]; onClose: () => void }) {
  const [orderId, setOrderId] = useState('')
  const live = orders.filter((o) => !o.isDraft && o.status !== 'Cancelled' && o.status !== 'Delivered')
  const likely = live.filter((o) => o.inboundHubCode === row.hubCode && !o.trackingNumber)
  const rest = live.filter((o) => !likely.includes(o))
  const byId = new Map(live.map((o) => [o.id, o]))
  const label = (id: string) => {
    const o = byId.get(id)
    return o ? `${o.orderNumber} · ${o.receiver.name || '—'} · ${o.inboundHubCode}${o.trackingNumber ? '' : ' · no tracking no.'}` : id
  }
  const confirm = () => {
    if (!row.hubOverageId || !orderId) return
    const v = growOrderActions.resolveHubOverage(row.hubOverageId, { action: 'attach', orderId })
    if (v) toast.success(`${row.code} attached to ${byId.get(orderId)?.orderNumber ?? orderId}.`)
    else toast.error('Could not attach — the overage is no longer held.')
    onClose()
  }
  return (
    <Modal open title={`Attach ${row.code} to a shipment`} onClose={onClose}
      footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button disabled={!orderId} onClick={confirm}>Attach</Button></>}>
      <div className="pb-4">
        <Field label="Shipment" required>
          <MenuSelect value={orderId} placeholder="Search shipments" searchable
            options={[...likely, ...rest].map((o) => o.id)} labels={label} onChange={setOrderId} />
        </Field>
        <p className="mt-2 text-[12.5px] text-ink-3">
          {likely.length} shipment{likely.length === 1 ? '' : 's'} bound for {row.hubCode || 'this hub'} without a tracking number are listed first.
          The label becomes the order’s tracking number and the parcel is in-scanned here.
        </p>
      </div>
    </Modal>
  )
}
