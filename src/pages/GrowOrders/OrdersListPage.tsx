/**
 * Consignment Order — the merchant portal's shipments list (`/grow/orders`).
 *
 * SAME STRUCTURE as the console's Orders page (the "consignment portal"), in
 * Grow's Materio look with the `ui.tsx` kit:
 *  - NO tab strip. `?tab=` links from other pages (`?tab=ready`, `?tab=drafts`…)
 *    still resolve here — the param is simply ignored;
 *  - ONE filter line: Date range · State / Secondary State (one combined
 *    listbox) · Origin (the merchant's own pickup addresses — the portal is
 *    single-merchant) · Advanced Filters (Facility = inbound hub, Type,
 *    Carrier, Service Type, Exception, Tag — Facility sits here so the line
 *    fits 1440px with the nav expanded) · Clear
 *    Filters; on the right the "Create Consignment | upload" split and a
 *    Search pill;
 *  - the console's columns (`LocalConsignments/columns.tsx`) minus Merchant;
 *  - row click opens a drawer (`?order=<id>`) with the console's four tabs;
 *  - the selection panel carries the merchant-appropriate subset of the
 *    console's bulk actions, in the console's order;
 *  - footer (under the card, on the canvas) = `20 / Page` · pagination · Refresh.
 *
 * Rows come from the SHARED adapter (`shipmentRows.ts` → `toConsignmentRow`),
 * so a shipment reads the same State / Secondary State / Exception here and on
 * the console. Drafts are the one Grow addition: State `Draft`, Secondary State
 * `Save for later`, resumable.
 *
 * The grid itself is `shipmentTable.tsx`, shared with Pickup Requests' Eligible
 * shipments view.
 */
import { useMasters } from '../../growOrders/masters'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Download, Pencil, Printer, RotateCcw, Search, Truck, X } from 'lucide-react'
import { useGrowOrders, growOrderActions } from '../../growOrders/store'
import { usePickupModuleConfig } from '../../config/pickupModule'
import { isOpenPr } from '../../growOrders/tabs'
import { datePart } from '../../growOrders/datetime'
import { planningActions, usePlanning } from '../LocalPFP/planningStore'
import { FAREYE_PICKUP_SECONDARY, FAREYE_STATES, canSchedulePickup, downloadCsv } from '../LocalPFP/adapter'
import { dash, stamp } from '../LocalPFP/overlayFormat'
import { toast } from '../../nueva/toast'
import {
  AddUploadSplit, AdvancedFilters, Btn, Card, Chip, ClearFilters, DateRangeFilter, ListFooter, MultiSelect,
  PageTitle, SearchBox, SelectionPopup, Sheet, TABLE_HEAD_ROW, TABLE_TH, TabStrip, type FilterDef, type SelectionAction,
} from './ui'
import { BulkUploadDialog } from './bulkUploadDialog'
import { BookPickupDialog } from './pickupDialog'
import { CONTACT_SUPPORT, merchantMayChange, usePortalMerchant } from './pickupGate'
import { storeName, useSelectionAnchor } from './utils'
import { DRAFT_SECONDARY, DRAFT_STATE, shipmentCsv, shipmentRowsOf, stateChipTone, type ShipmentRow } from './shipmentRows'
import { ShipmentTable } from './shipmentTable'

const DRAWER_TABS = ['Details', 'SKU / Package', 'Tracking', 'Notes'] as const
type DrawerTab = (typeof DRAWER_TABS)[number]

/** The combined State / Secondary State listbox keeps one value space: `state:X` / `sec:Y`. */
const ST = 'state:', SEC = 'sec:'

const CLOSED_STATES = ['Delivered', 'Cancelled']
const uniq = (xs: string[]) => [...new Set(xs.filter(Boolean))].sort()
const plural = (n: number, w = 'shipment') => `${n} ${w}${n === 1 ? '' : 's'}`

export default function OrdersListPage() {
  const db = useGrowOrders()
  const plan = usePlanning()
  /* store names resolve through the masters too (findStore) — subscribe so a
     pickup point named by a live location renders once the masters arrive */
  useMasters()
  const nav = useNavigate()
  const merchant = usePortalMerchant()
  /* module off = no NEW pickup bookings; existing requests stay readable */
  const pickupOn = usePickupModuleConfig().enabled
  const [params, setParams] = useSearchParams()
  const drawerId = params.get('order')
  /** Open / close the drawer, keeping any other param. */
  const setDrawer = (id: string | null) => setParams((p) => {
    const n = new URLSearchParams(p)
    if (id) n.set('order', id); else n.delete('order')
    return n
  }, { replace: true })

  const [bulkOpen, setBulkOpen] = useState(false)
  const [bookOpen, setBookOpen] = useState(false)
  const [range, setRange] = useState({ from: '', to: '' })
  const [stateSel, setStateSel] = useState<string[]>([])
  const [origin, setOrigin] = useState<string[]>([])
  const [adv, setAdv] = useState<Record<string, string[]>>({})
  const [q, setQ] = useState('')
  const [dq, setDq] = useState('')
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(20)

  /* type-ahead with a 200ms debounce, as on the console's list pages */
  useEffect(() => { const t = setTimeout(() => { setDq(q); setPage(0) }, 200); return () => clearTimeout(t) }, [q])

  const all = useMemo(() => shipmentRowsOf(db, plan), [db, plan])

  /* FarEye's own vocabulary, always the full list (spec §14) — plus Draft / Save
     for later, the portal's one addition */
  const stateOptions = useMemo(() => [
    ...[...FAREYE_STATES, DRAFT_STATE].map((v) => ({
      value: ST + v, label: v, group: 'State', count: all.filter((r) => r.state === v).length })),
    ...[...FAREYE_PICKUP_SECONDARY, 'Out For Delivery', 'RTO Initiated', DRAFT_SECONDARY].map((v) => ({
      value: SEC + v, label: v, group: 'Secondary State', count: all.filter((r) => r.secondaryState === v).length })),
  ], [all])
  const facilities = useMemo(() => uniq(all.map((r) => r.destination)), [all])
  /* the merchant's own pickup addresses: the store list, plus any origin a row carries */
  const origins = useMemo(() => uniq([...db.stores.map((s) => s.code), ...all.map((r) => r.shipFromCode ?? '')]), [db.stores, all])
  const advDefs = useMemo<FilterDef[]>(() => [
    /* Facility rides in the funnel so the line fits 1440px with the nav open */
    { key: 'Facility', label: 'Facility', options: facilities },
    { key: 'Type', label: 'Type', options: uniq(all.map((r) => r.taskType)) },
    { key: 'Carrier', label: 'Carrier', options: uniq(all.map((r) => r.carrier)) },
    { key: 'Service Type', label: 'Service Type', options: uniq(all.map((r) => r.serviceType)) },
    { key: 'Exception', label: 'Exception', options: uniq(all.map((r) => r.exception)) },
    { key: 'Tag', label: 'Tag', options: uniq(all.flatMap((r) => r.tag.split(', '))) },
  ], [all, facilities])

  const filtersOn = !!(q || stateSel.length || origin.length || range.from || range.to
    || Object.values(adv).some((v) => v.length))
  const clearAll = () => {
    setQ(''); setStateSel([]); setOrigin([]); setRange({ from: '', to: '' }); setAdv({}); setPage(0)
  }

  const rows = useMemo(() => {
    const needle = dq.trim().toLowerCase()
    const from = datePart(range.from), to = datePart(range.to)
    const states = stateSel.filter((v) => v.startsWith(ST)).map((v) => v.slice(ST.length))
    const secs = stateSel.filter((v) => v.startsWith(SEC)).map((v) => v.slice(SEC.length))
    const has = (k: string, v: string) => !adv[k]?.length || adv[k].includes(v)
    return all.filter((r) => {
      if (states.length && !states.includes(r.state)) return false
      if (secs.length && !secs.includes(r.secondaryState)) return false
      if (origin.length && !origin.includes(r.shipFromCode ?? '')) return false
      const day = r.order.createdAt.slice(0, 10)
      if (from && day < from) return false
      if (to && day > to) return false
      if (!has('Type', r.taskType) || !has('Carrier', r.carrier) || !has('Service Type', r.serviceType)
        || !has('Exception', r.exception) || !has('Facility', r.destination)) return false
      if (adv.Tag?.length && !adv.Tag.some((t) => r.tag.includes(t))) return false
      if (!needle) return true
      return [r.consignmentNumber, r.referenceNumber, r.shipToName, r.address, r.order.receiver.contactNumber, r.pickupRequestNumber]
        .some((v) => (v ?? '').toLowerCase().includes(needle))
    })
  }, [all, stateSel, origin, range, adv, dq])

  /* deleting the last rows of a page would leave '21-20 of 20' — clamp during render */
  const lastPage = Math.max(0, Math.ceil(rows.length / pageSize) - 1)
  if (page > lastPage) setPage(lastPage)
  const visible = rows.slice(page * pageSize, (page + 1) * pageSize)

  /* the selection panel lines up with the FIRST selected row */
  const cardRef = useRef<HTMLDivElement>(null)
  const rowRefs = useRef<Record<string, HTMLElement | null>>({})
  const anchorTop = useSelectionAnchor(cardRef, rowRefs, visible.find((r) => sel.has(r.orderId))?.orderId, 300)
  const toggleAll = (v: boolean) => setSel((p) => { const n = new Set(p); visible.forEach((r) => (v ? n.add(r.orderId) : n.delete(r.orderId))); return n })
  const toggle = (id: string, v: boolean) => setSel((p) => { const n = new Set(p); if (v) n.add(id); else n.delete(id); return n })
  const clearSel = () => setSel(new Set())

  /* ----------------------------------------------------------- the actions -- */

  const selected = useMemo(() => all.filter((r) => sel.has(r.orderId)), [all, sel])
  const anyDraft = selected.some((r) => r.draft)
  const anyClosed = selected.some((r) => CLOSED_STATES.includes(r.state))
  /* Schedule Pickup: FarEye's rule — Created / Ready To Ship, no open pickup (spec §14) */
  const bookable = selected.length > 0 && selected.every((r) => canSchedulePickup(r.order, db.pickupRequests))
  const rtoable = selected.length > 0 && !anyDraft && !anyClosed && selected.every((r) => !r.secondaryState.includes('RTO'))
  /* a shipment inside a pickup the driver already owns is ops' call, not the merchant's */
  const lockedByPickup = selected.some((r) => {
    const pr = db.pickupRequests.find((p) => p.id === r.order.pickupRequestId)
    return !!pr && isOpenPr(pr.status) && !merchantMayChange(pr, merchant.config)
  })
  const cancellable = selected.length > 0 && !anyClosed && !lockedByPickup

  const done = (msg: string) => { clearSel(); toast.success(msg) }
  const actions: SelectionAction[] = [
    {
      label: 'Modify Shipment Details', icon: <Pencil size={15} />, disabled: selected.length !== 1,
      tooltip: 'Select exactly one shipment',
      /* a draft resumes the stepper; a submitted shipment opens its own page */
      onClick: () => {
        const r = selected[0]
        nav(r.draft ? `/grow/orders/add?draft=${r.orderId}` : `/grow/orders/${r.orderId}`)
      },
    },
    {
      label: `Schedule Pickup (${sel.size})`, icon: <Truck size={15} />, primary: true, disabled: !bookable || !pickupOn,
      tooltip: pickupOn ? 'Only Created / Ready To Ship shipments without an open pickup can be scheduled' : 'Pickup module is off for this account',
      onClick: () => setBookOpen(true),
    },
    {
      label: 'Initiate Return to Origin', icon: <RotateCcw size={15} />, disabled: !rtoable,
      tooltip: 'Only open, submitted shipments that are not already returning',
      onClick: () => {
        planningActions.initiateRto(selected.map((r) => r.orderId))
        done(`Return to origin initiated for ${plural(selected.length)}.`)
      },
    },
    {
      label: 'Print Label', icon: <Printer size={15} />, disabled: anyDraft,
      tooltip: 'A draft has no label until it is paid',
      onClick: () => toast.info('Demo only — label generation is a platform service, not a local one.'),
    },
    {
      label: 'Download CSV', icon: <Download size={15} />,
      onClick: () => { downloadCsv('shipments-selected.csv', shipmentCsv(selected)); done(`${plural(selected.length)} exported.`) },
    },
    {
      label: 'Cancel Shipment', icon: <X size={15} />, danger: true, disabled: !cancellable,
      tooltip: lockedByPickup ? CONTACT_SUPPORT : 'Delivered or cancelled shipments cannot be cancelled',
      onClick: () => {
        /* an unpaid draft cannot be "cancelled" — it would still read Draft — so it is discarded */
        const drafts = selected.filter((r) => r.draft).map((r) => r.orderId)
        const live = selected.filter((r) => !r.draft).map((r) => r.orderId)
        live.forEach((id) => growOrderActions.cancelOrder(id))
        if (live.length) planningActions.cancel(live, 'Cancelled by the merchant')
        if (drafts.length) growOrderActions.remove(drafts)
        done([live.length && `${plural(live.length)} cancelled`, drafts.length && `${plural(drafts.length, 'draft')} discarded`]
          .filter(Boolean).join(' · ') + '.')
      },
    },
  ]

  const drawerRow = drawerId ? all.find((r) => r.orderId === drawerId) ?? null : null

  return (
    <div>
      <PageTitle title="Consignment Order"
        subtitle="Create and manage shipments. Schedule pickup, pay via multiple options & print labels" />

      {/* the console Orders page's ONE filter line, on the canvas; create + search on the right */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <DateRangeFilter width="w-[216px]" from={range.from} to={range.to} onChange={(v) => { setRange(v); setPage(0) }} />
        <MultiSelect value={stateSel} onChange={(v) => { setStateSel(v); setPage(0) }}
          placeholder="State/Secondary State" className="w-[160px]" options={stateOptions} />
        <MultiSelect value={origin} onChange={(v) => { setOrigin(v); setPage(0) }}
          placeholder="Origin" className="w-[150px]"
          options={origins.map((c) => ({ value: c, label: storeName(c, db.stores), count: all.filter((r) => r.shipFromCode === c).length }))} />
        <AdvancedFilters compact defs={advDefs} values={adv}
          onChange={(k, v) => { setAdv((a) => ({ ...a, [k]: v })); setPage(0) }}
          onClearAll={() => { setAdv({}); setPage(0) }} />
        <ClearFilters active={filtersOn} onClick={clearAll} />
        <div className="ml-auto flex items-center gap-2">
          <AddUploadSplit label="Create Consignment" onAdd={() => nav('/grow/orders/add')}
            menu={[{ label: 'Create Consignment', onClick: () => nav('/grow/orders/add') },
              { label: 'Create FTL Consignment', onClick: () => nav('/grow/orders/add/vehicle') }]}
            onUpload={() => setBulkOpen(true)} uploadTitle="Bulk upload shipments" />
          <SearchBox pill value={q} onChange={setQ} icon={<Search />} width="w-[170px]" placeholder="Search" />
        </div>
      </div>

      <Card padded={false} className="relative" cardRef={cardRef}>
        <SelectionPopup count={sel.size} anchorTop={anchorTop} onClear={clearSel} actions={actions} />

        <ShipmentTable rows={visible} dataRows={all} storageKey="grow-shipments-columns-v1" selected={sel} onToggle={toggle} onToggleAll={toggleAll}
          onRowClick={(r) => setDrawer(r.orderId)} rowRef={(id, el) => { rowRefs.current[id] = el }}
          empty={filtersOn
            ? <>No shipments match these filters.<span className="mt-1 block text-[13px] text-grow-ink-3">Clear the filters to see the whole list again.</span></>
            : <>No shipments yet.<span className="mt-1 block text-[13px] text-grow-ink-3">Create a consignment to get started.</span></>} />
      </Card>
      <ListFooter page={page} pageSize={pageSize} total={rows.length} onPage={setPage}
        onPageSize={(n) => { setPageSize(n); setPage(0) }} onRefresh={() => toast.info('Refreshed')} />

      {/* mounted only while open, so its groups start from the current selection */}
      {bookOpen && (
        <BookPickupDialog orders={selected.map((r) => r.order)} stores={db.stores} onClose={() => setBookOpen(false)}
          onBooked={() => { clearSel(); setBookOpen(false) }} />
      )}
      {bulkOpen && (
        <BulkUploadDialog stores={db.stores} onClose={() => setBulkOpen(false)}
          onCreated={() => setBulkOpen(false)} />
      )}
      {drawerId && <ShipmentDrawer row={drawerRow} onClose={() => setDrawer(null)} />}
    </div>
  )
}

/* ----------------------------------------------------------- the drawer ---- */

/** A titled label / value grid — the Grow form of the console drawer's Section. */
function Section({ title, pairs }: { title: string; pairs: [string, ReactNode][] }) {
  return (
    <section className="rounded-[6px] border border-grow-line p-4">
      <h3 className="mb-3 text-[15px] font-semibold text-grow-ink">{title}</h3>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-3">
        {pairs.map(([k, v]) => (
          <div key={k} className="min-w-0">
            <dt className="text-[12px] text-grow-ink-2">{k}</dt>
            <dd className="mt-0.5 break-words text-[14px] text-grow-ink">{v}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

const prLink = (id: string | null, number: string) => (id && number
  ? <Link to={`/grow/orders/pickups/${id}`} className="text-grow-accent-2 hover:underline">{number}</Link>
  : '—')

function ShipmentDrawer({ row, onClose }: { row: ShipmentRow | null; onClose: () => void }) {
  const nav = useNavigate()
  const plan = usePlanning()
  const [tab, setTab] = useState<DrawerTab>('Details')

  if (!row) {
    return (
      <Sheet open title="Shipment" onClose={onClose} width="w-[720px]">
        <p className="text-[14px] text-grow-ink-2">This shipment no longer exists.</p>
      </Sheet>
    )
  }

  const o = row.order
  const notes = plan.notes[row.orderId] ?? []

  return (
    <Sheet open title={row.consignmentNumber} subtitle={[row.state, row.secondaryState].filter(Boolean).join(' · ')}
      onClose={onClose} width="w-[720px]"
      footer={<>
        <Btn variant="outlined" color="neutral" onClick={() => nav(`/grow/orders/${row.orderId}`)}>Open full page</Btn>
        {row.draft && (
          <Btn color="accent2" startIcon={<Pencil size={16} />} onClick={() => nav(`/grow/orders/add?draft=${row.orderId}`)}>Resume</Btn>
        )}
      </>}>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Chip tone={stateChipTone(row.state)}>{row.state}</Chip>
        {row.exception && <Chip tone="error">{row.exception}</Chip>}
      </div>
      <TabStrip tabs={DRAWER_TABS} active={tab} onChange={(t) => setTab(t as DrawerTab)} />

      <div className="flex flex-col gap-3">
        {tab === 'Details' && (
          <>
            <Section title="Shipment" pairs={[
              ['Consignment Number', row.consignmentNumber],
              ['Reference Number', row.referenceNumber],
              ['Order Number', row.orderNumber],
              ['Type', row.taskType],
              ['State', row.state],
              ['Secondary State', dash(row.secondaryState)],
              ['Exception', dash(row.exception)],
              ['Carrier', dash(row.carrier)],
              ['Service Type', dash(row.serviceType)],
              ['Created At', stamp(o.createdAt)],
              ['Ageing', `${row.ageingDays} days`],
            ]} />
            <Section title="Ship From" pairs={[
              ['Location', row.origin],
              ['Code', dash(row.shipFromCode)],
              ['Pickup Window', row.pickupWindow ? `${stamp(row.pickupWindow.start)} → ${stamp(row.pickupWindow.end)}` : '—'],
              ['Pickup Request', prLink(o.pickupRequestId, row.pickupRequestNumber)],
              ['Picked In', prLink(o.pickedInRequestId, row.pickedInNumber)],
            ]} />
            <Section title="Ship To" pairs={[
              ['Name', dash(row.shipToName)],
              ['Address', dash(row.address)],
              ['City', dash(row.shipToCity)],
              ['Pin Code', dash(row.shipToPincode)],
              ['Destination Hub', dash(row.destination)],
              ['Delivery Window', row.deliveryWindow ? `${stamp(row.deliveryWindow.start)} → ${stamp(row.deliveryWindow.end)}` : '—'],
            ]} />
          </>
        )}

        {tab === 'SKU / Package' && (
          <>
            <Section title="Package" pairs={[
              ['Kind', o.shipmentType === 'FTL' ? 'FTL' : `LTL · ${o.pkg.kind}`],
              ['Package Type', dash(o.pkg.packageType)],
              ['Pieces', String(row.pieces)],
              ['Weight', `${row.weightKg} kg`],
              ['Volume', `${row.volumeMm3.toLocaleString()} mm³`],
              ['Pallet Spaces', String(row.palletSpaces ?? 1)],
              ['Dimensions', `${o.pkg.lengthCm} × ${o.pkg.widthCm} × ${o.pkg.heightCm} cm`],
              ['Description', dash(o.pkg.description)],
              ['Declared Value', `${o.currency} ${o.pkg.declaredValue.toLocaleString()}`],
            ]} />
            {(o.pkg.items?.length ?? 0) > 0 && (
              <section className="overflow-hidden rounded-[6px] border border-grow-line">
                <table className="w-full table-fixed border-collapse text-[14px]">
                  <thead><tr className={TABLE_HEAD_ROW}>
                    {['SKU', 'Name', 'Qty', 'Weight'].map((h) => <th key={h} className={TABLE_TH}>{h}</th>)}
                  </tr></thead>
                  <tbody>
                    {o.pkg.items!.map((it, i) => (
                      <tr key={i} className="h-[44px] border-t border-grow-line">
                        <td className="truncate px-4">{dash(it.skuCode)}</td>
                        <td className="truncate px-4">{it.name}</td>
                        <td className="px-4">{it.quantity}</td>
                        <td className="px-4">{it.weightKg} kg</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            )}
          </>
        )}

        {tab === 'Tracking' && (
          <section className="rounded-[6px] border border-grow-line p-4">
            <h3 className="mb-2 text-[15px] font-semibold text-grow-ink">Packages ({row.shipments.length})</h3>
            {row.shipments.map((s) => (
              <div key={s.id} className="flex items-center gap-3 border-b border-grow-line py-2 text-[14px] last:border-0">
                <span className="font-medium text-grow-ink">{s.trackingNumber}</span>
                <span className="ml-auto text-grow-ink-2">{s.outcome ?? (row.draft ? 'Not submitted' : row.state)}</span>
              </div>
            ))}
          </section>
        )}

        {tab === 'Notes' && (
          notes.length === 0 && !o.remarks
            ? <p className="py-6 text-center text-[14px] text-grow-ink-2">No notes on this shipment.</p>
            : (
              <section className="rounded-[6px] border border-grow-line p-4">
                <h3 className="mb-2 text-[15px] font-semibold text-grow-ink">Notes</h3>
                {o.remarks && (
                  <div className="border-b border-grow-line py-2 last:border-0">
                    <p className="text-[14px] text-grow-ink">{o.remarks}</p>
                    <p className="text-[12px] text-grow-ink-3">Special instructions</p>
                  </div>
                )}
                {notes.map((n, i) => (
                  <div key={i} className="border-b border-grow-line py-2 last:border-0">
                    <p className="text-[14px] text-grow-ink">{n.text}</p>
                    <p className="text-[12px] text-grow-ink-3">{stamp(n.at)}</p>
                  </div>
                ))}
              </section>
            )
        )}
      </div>
    </Sheet>
  )
}
