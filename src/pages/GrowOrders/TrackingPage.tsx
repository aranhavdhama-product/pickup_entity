/**
 * Tracking — `/grow/orders/tracking`, the live portal's `/tracking/` page
 * ("Effortlessly track customer deliveries from order to delivery"), capture:
 * docs/superpowers/research/2026-09-25-grow-portal-pages.md §2.
 *
 * Live arrangement, in our console grammar: store location select · funnel
 * (live: a Columns / Operator / Value panel — here the console's funnel over
 * the same columns) · Date Filter presets + range (default the last 30 days) ·
 * Clear Filters, then search · ⚙ columns · download on the right → the grid
 * with the live's nine columns → Rows per page. Selecting rows surfaces the
 * live toolbar's Print Label · Email · Book Pickup (n) as the console's floating
 * selection panel. Row click opens the shared View Consignment overlay
 * (`?order=<id>`), whose first merchant section is Status.
 *
 * Rows = the booked (non-draft) shipments from the SAME adapter as Consignment
 * Order (`shipmentRows.ts`), so a shipment reads the same State on both pages.
 * No store of its own; the column choice persists under `grow-tracking-columns-v1`.
 */
import { useMemo, useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Mail, Printer, RotateCw, Settings2, Truck } from 'lucide-react'
import { useGrowOrders } from '../../growOrders/store'
import { useMasters } from '../../growOrders/masters'
import { displayStatus, DISPLAY_STATUSES } from '../../growOrders/tabs'
import { usePickupModuleConfig } from '../../config/pickupModule'
import { usePlanning } from '../LocalPFP/planningStore'
import { canSchedulePickup, downloadCsv } from '../LocalPFP/adapter'
import { Download as DownloadGlyph } from '../LocalPFP/icons'
import { toast } from '../../nueva/toast'
import { DataTable, EmptyState, PageSize, Pagination, Panel, StatusPill, type Column, type SelectionAction } from '../../nueva/components'
import {
  ClearFilters, ColumnChooser, DateRange, FilterLine, FilterSelect, FunnelFilters, IconBtn, LocalPage, SearchBox,
} from '../../local/chrome'
import { BookPickupDialog } from './pickupDialog'
import GrowConsignmentView from './GrowConsignmentView'
import { shipmentRowsOf, stateChipTone, type ShipmentRow } from './shipmentRows'
import { DISPLAY_TONE, fmtDate, money, pillTone, storeName, useColumnPrefs } from './utils'
import { DATE_PRESETS, presetOf, presetRange, type DatePreset } from './dateRanges'
import { eddOf, rateOf, trackingCsv } from './trackingModel'

const dash = <span className="text-ink-3">—</span>

interface TrackCol {
  key: string; label: string; width: number; align?: 'right'
  value: (r: ShipmentRow) => string
  cell?: (r: ShipmentRow) => ReactNode
}

/** Shipment number = the first piece's tracking number (live: SHIPMENT NUMBER ≠ consignment). */
const shipmentNo = (r: ShipmentRow) => r.shipments[0]?.trackingNumber ?? r.order.trackingNumber ?? ''

/* the live grid's nine columns, in its order */
const COLUMNS: TrackCol[] = [
  { key: 'shipmentNumber', label: 'Shipment Number', width: 170, value: shipmentNo,
    cell: (r) => <span className="font-mono text-[12px] font-bold text-ink">{shipmentNo(r) || '—'}</span> },
  { key: 'consignmentNumber', label: 'Consignment Number', width: 150, value: (r) => r.consignmentNumber,
    cell: (r) => <span className="font-mono text-[12px] text-ink-2">{r.consignmentNumber}</span> },
  { key: 'orderNumber', label: 'Order Number', width: 150, value: (r) => r.orderNumber,
    cell: (r) => <span className="font-mono text-[12px] text-ink-2">{r.orderNumber}</span> },
  { key: 'status', label: 'Status', width: 150, value: (r) => displayStatus(r.order),
    cell: (r) => { const s = displayStatus(r.order); return <StatusPill label={s} tone={pillTone(DISPLAY_TONE[s])} /> } },
  { key: 'state', label: 'State', width: 150, value: (r) => r.state,
    cell: (r) => <StatusPill label={r.state} tone={stateChipTone(r.state)} /> },
  { key: 'createdOn', label: 'Created On', width: 110, value: (r) => fmtDate(r.order.createdAt) },
  { key: 'edd', label: 'EDD/ETA', width: 110, value: (r) => fmtDate(eddOf(r)) },
  { key: 'destination', label: 'Destination Address', width: 280, value: (r) => r.address },
  { key: 'rates', label: 'Rates', width: 120, align: 'right', value: (r) => money(rateOf(r.order), r.order.currency || '₱') },
]
const ALL_KEYS = COLUMNS.map((c) => c.key)

const toColumn = (c: TrackCol): Column => ({
  key: c.key, label: c.label, align: c.align, width: c.width,
  render: (r: ShipmentRow) => {
    const v = c.value(r)
    return <span className="block min-w-0 truncate" title={v || undefined}>{c.cell ? c.cell(r) : v || dash}</span>
  },
})

const uniq = (xs: string[]) => [...new Set(xs.filter(Boolean))].sort()
const plural = (n: number, w = 'shipment') => `${n} ${w}${n === 1 ? '' : 's'}`

export default function GrowTrackingPage() {
  const db = useGrowOrders()
  const plan = usePlanning()
  useMasters()
  const pickupCfg = usePickupModuleConfig()
  const manualPickup = pickupCfg.enabled && pickupCfg.mode === 'manual'
  const [params, setParams] = useSearchParams()
  const drawerId = params.get('order')
  const setDrawer = (id: string | null) => setParams((p) => {
    const n = new URLSearchParams(p); if (id) n.set('order', id); else n.delete('order'); return n
  }, { replace: true })

  /* live default: the last 30 days */
  const initial = presetRange('Last 30 Days')
  const [from, setFrom] = useState(initial.from)
  const [to, setTo] = useState(initial.to)
  const [store, setStore] = useState('')
  const [adv, setAdv] = useState<Record<string, string[]>>({})
  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [booking, setBooking] = useState<{ rows: ShipmentRow[]; clear: () => void } | null>(null)
  const [picked, setPicked] = useColumnPrefs('grow-tracking-columns-v1', ALL_KEYS, ALL_KEYS)
  const reset = (fn: () => void) => { fn(); setPage(1) }

  /* booked shipments only — a draft has nothing to track yet */
  const all = useMemo(() => shipmentRowsOf(db, plan).filter((r) => !r.draft), [db, plan])
  const stores = useMemo(() => uniq([...db.stores.map((s) => s.code), ...all.map((r) => r.shipFromCode ?? '')]), [db.stores, all])
  const advDefs = useMemo(() => [
    { key: 'Status', label: 'Status', options: DISPLAY_STATUSES.filter((s) => s !== 'Draft' && all.some((r) => displayStatus(r.order) === s)) },
    { key: 'State', label: 'State', options: uniq(all.map((r) => r.state)) },
    { key: 'Service Type', label: 'Service Type', options: uniq(all.map((r) => r.serviceType)) },
    { key: 'Carrier', label: 'Carrier', options: uniq(all.map((r) => r.carrier)) },
  ], [all])

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const has = (k: string, v: string) => !adv[k]?.length || adv[k].includes(v)
    return all.filter((r) => {
      const day = r.order.createdAt.slice(0, 10)
      if (from && day < from) return false
      if (to && day > to) return false
      if (store && r.shipFromCode !== store) return false
      if (!has('Status', displayStatus(r.order)) || !has('State', r.state) || !has('Service Type', r.serviceType) || !has('Carrier', r.carrier)) return false
      if (!needle) return true
      return [shipmentNo(r), r.consignmentNumber, r.orderNumber, r.shipToName, r.address]
        .some((v) => (v ?? '').toLowerCase().includes(needle))
    })
  }, [all, from, to, store, adv, q])

  const defaults = presetRange('Last 30 Days')
  const filtersOn = !!(q || store || Object.values(adv).some((v) => v.length) || from !== defaults.from || to !== defaults.to)
  const clearAll = () => reset(() => { setQ(''); setStore(''); setAdv({}); setFrom(defaults.from); setTo(defaults.to) })

  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize))
  const safePage = Math.min(page, totalPages)
  const paged = rows.slice((safePage - 1) * pageSize, safePage * pageSize)
  const visible = COLUMNS.filter((c) => picked.includes(c.key))

  /* the live toolbar's three selection buttons: Print Label · Email · Book Pickup (n) */
  const selectionActions = (sel: ShipmentRow[], clear: () => void): SelectionAction[] => {
    const bookable = manualPickup && sel.length > 0 && sel.every((r) => canSchedulePickup(r.order, db.pickupRequests))
    return [
      { label: 'Print Label', icon: <Printer size={14} />,
        onClick: () => toast.info('Demo only — label generation is a platform service, not a local one.') },
      { label: 'Email', icon: <Mail size={14} />,
        onClick: () => { clear(); toast.success(`Tracking details emailed for ${plural(sel.length)} (demo — nothing is sent).`) } },
      /* manual booking only (owner, 2026-09-24): in auto mode the request is raised at creation */
      ...(manualPickup ? [{
        label: `Book Pickup (${sel.length})`, icon: <Truck size={14} />, disabled: !bookable,
        reason: 'Only Created / Ready To Ship shipments with no open pickup can be booked',
        onClick: bookable ? () => setBooking({ rows: sel, clear }) : undefined,
      }] : []),
    ]
  }

  const preset = presetOf(from, to)

  return (
    <LocalPage>
      <p className="mb-3 text-[13px] text-ink-3">
        Track customer deliveries from order to delivery — share order details and status, book pickups and manage orders.
      </p>
      <FilterLine
        right={<>
          <SearchBox value={q} onChange={(v) => reset(() => setQ(v))} placeholder="Search shipments" />
          <IconBtn title="Refresh" onClick={() => { setPage(1); toast.info('Tracking list refreshed.') }}><RotateCw size={15} /></IconBtn>
          <ColumnChooser columns={COLUMNS} visible={visible.map((c) => c.key)} onChange={setPicked} onReset={() => setPicked(null)}>
            <Settings2 size={16} />
          </ColumnChooser>
          <IconBtn title="Download (CSV)"
            onClick={() => { downloadCsv('tracking.csv', trackingCsv(rows)); toast.success(`${plural(rows.length, 'row')} exported.`) }}>
            <DownloadGlyph size={16} />
          </IconBtn>
        </>}>
        <FilterSelect value={store} placeholder="All store locations" options={stores} width={190}
          labels={(c) => storeName(c, db.stores)} searchable={stores.length > 6}
          onChange={(v) => reset(() => setStore(v))} />
        <FunnelFilters defs={advDefs} values={adv} onChange={(k, vals) => reset(() => setAdv((a) => ({ ...a, [k]: vals })))} />
        <FilterSelect value={preset} placeholder="Date Filter" options={[...DATE_PRESETS]} width={150}
          onChange={(v) => reset(() => {
            const r = v ? presetRange(v as DatePreset) : { from: '', to: '' }
            setFrom(r.from); setTo(r.to)
          })} />
        <DateRange start={from} end={to} onStart={(v) => reset(() => setFrom(v))} onEnd={(v) => reset(() => setTo(v))} />
        <ClearFilters active={filtersOn} onClick={clearAll} />
      </FilterLine>

      <div className="mt-4">
        {rows.length === 0 ? (
          <Panel>
            <EmptyState title="No results found."
              hint={filtersOn ? 'Clear the filters or widen the date range to see more shipments.' : 'Booked shipments appear here once created.'} />
          </Panel>
        ) : (
          <>
            <DataTable columns={visible.map(toColumn)} rows={paged} rowKey="orderId" selectable
              selectionActions={(s, clear) => selectionActions(s as ShipmentRow[], clear)}
              onRowClick={(r) => setDrawer((r as ShipmentRow).orderId)} />
            <div className="flex items-center justify-between gap-3">
              <div className="flex-1">
                <Pagination page={safePage} total={totalPages} onChange={setPage}
                  range={`${(safePage - 1) * pageSize + 1}-${Math.min(safePage * pageSize, rows.length)} of ${rows.length.toLocaleString()}`} />
              </div>
              <div className="pt-3"><PageSize value={pageSize} onChange={(n) => { setPageSize(n); setPage(1) }} /></div>
            </div>
          </>
        )}
      </div>

      {booking && (
        <BookPickupDialog orders={booking.rows.map((r) => r.order)} stores={db.stores} onClose={() => setBooking(null)}
          onBooked={() => { booking.clear(); setBooking(null) }} />
      )}
      {drawerId && <GrowConsignmentView orderId={drawerId} onClose={() => setDrawer(null)} />}
    </LocalPage>
  )
}
