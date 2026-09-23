/**
 * Consignment Order — LOCAL MODE.
 *
 * The console's `/order-management/consignment-order` rebuilt with NO staging
 * session: the tab set, column set, toolbar and bulk actions are the ones
 * `src/pages/ConsignmentOrder/index.tsx` carries (itself built from staging),
 * and every row is a Grow merchant order translated by the SHARED
 * `LocalPFP/adapter.ts` — the same `toConsignmentRow` the Pending For Planning
 * page uses, so the two lists can never disagree about what a consignment is.
 *
 * NOT PIXEL-MEASURED. Pending For Planning is a measured replica of its staging
 * screen; this page is not — it is built from the console page's inventory in
 * this app's own Nueva primitives. When staging is reachable again the
 * measurement pass can tighten it, and until then nothing here should be read
 * as "this is what staging looks like".
 *
 * SCOPE vs Pending For Planning: that page shows only what is waiting to be
 * planned. This one shows EVERY consignment the merchant has (drafts excluded —
 * a draft is not yet a consignment), which is why it carries the status tabs.
 */
import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  AlertTriangle, CalendarClock, Download, Handshake, Package, PackageCheck, Pencil,
  Printer, RotateCcw, Route as RouteIcon, ShieldAlert, Truck, Undo2, X,
} from 'lucide-react'
import {
  AddUpload, DataTable, EmptyState,
  PageSize, Pagination, Panel, StatusPill, Tabs,
  type SelectionAction,
} from '../../nueva/components'
import {
  ClearFilters, DateRange, FilterLine, FilterSelect, FunnelFilters, IconBtn, LocalPage, LocalTabs, SearchBox,
} from '../../local/chrome'
import { Download as DownloadGlyph } from '../LocalPFP/icons'
import { toast } from '../../nueva/toast'
import { useGrowOrders, growOrderActions } from '../../growOrders/store'
import { isOpenPr } from '../../growOrders/tabs'
import {
  csvOf, downloadCsv, stateTone, toConsignmentRow, type LocalConsignmentRow,
} from '../LocalPFP/adapter'
import { planningActions, usePlanning } from '../LocalPFP/planningStore'
import { merchantsOf } from '../LocalPFP/merchants'
import { usePickupModuleConfig } from '../../config/pickupModule'
import { SchedulePickupDialog, type ScheduleResult } from './SchedulePickupDialog'
import { consignmentColumns } from './columns'
import { BulkUploadDialog } from '../GrowOrders/bulkUploadDialog'
import { Section } from '../LocalPFP/overlayBits'
import { dash, stamp } from '../LocalPFP/overlayFormat'

/* ------------------------------------------------------------------ tabs --- */

/**
 * The console's six status tabs. `Data Validation Issues` is exclusive: a row
 * carrying an error appears ONLY there, never in Active/Closed/All — staging
 * treats an unvalidated row as not yet a real consignment.
 */
const hasValidationError = (r: LocalConsignmentRow) => !!r.exception

const TABS: { label: string; test: (r: LocalConsignmentRow) => boolean }[] = [
  { label: 'Data Validation Issues', test: hasValidationError },
  { label: 'Active', test: (r) => !hasValidationError(r) && r.state !== 'Delivered' && r.state !== 'Cancelled' },
  { label: 'Closed', test: (r) => !hasValidationError(r) && (r.state === 'Delivered' || r.state === 'Cancelled') },
  { label: 'Exception', test: (r) => !hasValidationError(r) && String(r.state) === 'Undelivered' },
  { label: 'Returns', test: (r) => !hasValidationError(r) && (r.orderTypeLabel === 'Reverse' || r.secondaryState.includes('RTO')) },
  { label: 'All', test: (r) => !hasValidationError(r) },
]
const TAB_ICONS = [ShieldAlert, RouteIcon, Handshake, AlertTriangle, Undo2, Package]

const DRAWER_TABS = ['Details', 'SKU / Package', 'Tracking', 'Notes']

/** The secondary state of a consignment inside an open pickup request. */
const PICKUP_SCHEDULED = 'Pickup Scheduled'

const uniq = (xs: string[]) => [...new Set(xs.filter(Boolean))].sort()

/* ------------------------------------------------------------- the page ---- */

export default function LocalConsignments() {
  const nav = useNavigate()
  const { id: drawerId } = useParams()
  const db = useGrowOrders()
  const plan = usePlanning()
  /* module off = the page as it was: no Schedule action, no Pickup Address filter */
  const pickupOn = usePickupModuleConfig().enabled

  const [tab, setTab] = useState(1)
  const [q, setQ] = useState('')
  const [state, setState] = useState('')
  const [merchant, setMerchant] = useState('')
  /** a store code of the selected merchant ('' = every address) */
  const [pickupAddress, setPickupAddress] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  /** the Schedule dialog: the ticked ids, and the table's own clear() */
  const [scheduling, setScheduling] = useState<{ ids: string[]; clear: () => void } | null>(null)
  /** the last booking, as links — the toast is text-only */
  const [booked, setBooked] = useState<ScheduleResult[] | null>(null)
  const [uploading, setUploading] = useState(false)
  const [more, setMore] = useState<Record<string, string[]>>({})

  const openPrIds = useMemo(() => new Set(db.pickupRequests.filter((p) => isOpenPr(p.status)).map((p) => p.id)), [db.pickupRequests])
  /** EVERY consignment, not just the planning queue — a draft is not one yet. */
  const all = useMemo<LocalConsignmentRow[]>(() => db.orders
    .filter((o) => !o.isDraft)
    .map((o) => toConsignmentRow(o, db, {
      /* a console secondary state wins; otherwise an open first-mile booking
         reads "Pickup Scheduled" — distinct from routing's "Scheduled" */
      secondaryState: plan.secondaryState[o.id] ?? (openPrIds.has(o.pickupRequestId ?? '') ? PICKUP_SCHEDULED : undefined),
      schedule: plan.scheduleOverrides[o.id],
      exception: plan.exceptions[o.id],
    }))
    .sort((a, b) => (a.order.createdAt < b.order.createdAt ? 1 : -1)), [db, plan, openPrIds])

  const inTab = useMemo(() => all.filter(TABS[tab].test), [all, tab])
  const tabCounts = useMemo(() => TABS.map((t) => all.filter(t.test).length), [all])
  const states = useMemo(() => uniq(all.map((r) => String(r.state))), [all])
  const merchants = useMemo(() => uniq(all.map((r) => r.merchant)), [all])
  /* the selected merchant's stores: its locations in the store list, plus any
     origin its rows carry (a store with no business name is named by its code) */
  const merchantStores = useMemo(() => {
    if (!merchant) return [] as string[]
    const own = merchantsOf(db.stores).find((m) => m.name === merchant)?.stores.map((s) => s.code) ?? []
    return uniq([...own, ...all.filter((r) => r.merchant === merchant).map((r) => r.shipFromCode ?? '')])
  }, [merchant, db.stores, all])
  const storeLabel = (code: string) => {
    const s = db.stores.find((x) => x.code === code)
    return s?.name || code
  }
  /* a hidden filter never applies — the module can be switched off live */
  const addressFilter = pickupOn ? pickupAddress : ''
  const moreDefs = useMemo(() => [
    { key: 'Type', label: 'Type', options: uniq(all.map((r) => r.taskType)) },
    { key: 'Carrier', label: 'Carrier', options: uniq(all.map((r) => r.carrier)) },
    { key: 'Service Type', label: 'Service Type', options: uniq(all.map((r) => r.serviceType)) },
    { key: 'Destination', label: 'Destination', options: uniq(all.map((r) => r.destination)) },
    { key: 'Secondary State', label: 'Secondary State', options: uniq(all.map((r) => r.secondaryState)) },
    { key: 'Tag', label: 'Tag', options: uniq(all.flatMap((r) => r.tag.split(', '))) },
  ], [all])

  const filtersOn = !!(q || state || merchant || addressFilter || from || to
    || Object.values(more).some((v) => v.length))

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return inTab.filter((r) => {
      if (state && String(r.state) !== state) return false
      if (merchant && r.merchant !== merchant) return false
      if (addressFilter && r.shipFromCode !== addressFilter) return false
      const day = r.order.createdAt.slice(0, 10)
      if (from && day < from) return false
      if (to && day > to) return false
      if (more.Type?.length && !more.Type.includes(r.taskType)) return false
      if (more.Carrier?.length && !more.Carrier.includes(r.carrier)) return false
      if (more['Service Type']?.length && !more['Service Type'].includes(r.serviceType)) return false
      if (more.Destination?.length && !more.Destination.includes(r.destination)) return false
      if (more['Secondary State']?.length && !more['Secondary State'].includes(r.secondaryState)) return false
      if (more.Tag?.length && !more.Tag.some((t) => r.tag.includes(t))) return false
      if (needle) {
        const hay = `${r.consignmentNumber} ${r.referenceNumber} ${r.shipToName} ${r.merchant} ${r.address}`.toLowerCase()
        if (!hay.includes(needle)) return false
      }
      return true
    })
  }, [inTab, q, state, merchant, addressFilter, from, to, more])

  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize))
  const safePage = Math.min(page, totalPages)
  const paged = rows.slice((safePage - 1) * pageSize, safePage * pageSize)
  const clearAll = () => { setQ(''); setState(''); setMerchant(''); setPickupAddress(''); setFrom(''); setTo(''); setMore({}); setPage(1) }

  /* ---------------------------------------------------------- the columns -- */

  const columns = consignmentColumns

  /* ----------------------------------------------------------- the actions - */

  /**
   * The console's eight. Four are real local mutations; the rest are DEMO
   * TOASTS and say so, because the local store has no carrier master, no label
   * service and no print pipeline — a button that silently did nothing would be
   * worse than one that admits it.
   */
  const selectionActions = (sel: LocalConsignmentRow[], clear: () => void): SelectionAction[] => {
    const ids = sel.map((r) => r.orderId)
    const closable = sel.every((r) => ['Created', 'At Facility', 'Ready To Ship'].includes(String(r.state)))
    const done = (msg: string) => { clear(); toast.success(msg) }
    return [
      {
        label: 'Modify Shipment Details',
        icon: <Pencil size={14} />,
        disabled: sel.length !== 1,
        onClick: sel.length === 1
          /* reopens the order in the merchant's own Add Order flow */
          ? () => nav(`/grow/orders/add?draft=${sel[0].orderId}`)
          : undefined,
      },
      /* TWO different schedules, two different statuses:
         - Schedule Pickup  = book the FIRST-MILE collection (a pickup request);
           the row reads Secondary State "Pickup Scheduled". Hidden with the
           Pickup Request module.
         - Schedule Routing = the console's own delivery schedule, as before;
           the row reads Secondary State "Scheduled". */
      ...(pickupOn ? [{ label: 'Schedule Pickup', icon: <Truck size={14} />, onClick: () => setScheduling({ ids, clear }) }] : []),
      { label: 'Schedule Routing', icon: <CalendarClock size={14} />, onClick: () => {
        const startAt = `${new Date().toISOString().slice(0, 10)}T09:00`
        planningActions.schedule(ids, { startAt, endAt: `${startAt.slice(0, 10)}T18:00`, reason: 'Scheduled from Consignment Order' })
        done(`${ids.length} scheduled for routing.`)
      } },
      { label: 'Initiate Return to Origin', icon: <RotateCcw size={14} />, onClick: () => {
        planningActions.initiateRto(ids)
        done(`Return to origin initiated for ${ids.length}.`)
      } },
      { label: 'Modify Carrier', icon: <Truck size={14} />, onClick: () => {
        toast.info('Demo only — the local store has no carrier master to reassign against.')
      } },
      { label: 'Print Label', icon: <Printer size={14} />, onClick: () => {
        toast.info('Demo only — label generation is a platform service, not a local one.')
      } },
      { label: 'Download CSV', icon: <Download size={14} />, onClick: () => {
        downloadCsv('consignments-selected.csv', csvOf(sel))
        done(`${sel.length} row${sel.length === 1 ? '' : 's'} exported.`)
      } },
      {
        label: 'Close Shipment',
        icon: <PackageCheck size={14} />,
        disabled: !closable,
        onClick: closable ? () => {
          ids.forEach((id) => growOrderActions.update(id, { status: 'Delivered' }))
          planningActions.close(ids, { outcome: 'Completed', atc: '', atd: '', failureReason: '', attachments: 0 })
          done(`${ids.length} closed.`)
        } : undefined,
      },
      { label: 'Cancel Shipment', icon: <X size={14} />, onClick: () => {
        ids.forEach((id) => growOrderActions.update(id, { status: 'Cancelled' }))
        planningActions.cancel(ids, 'Cancelled from Consignment Order')
        done(`${ids.length} cancelled.`)
      } },
    ]
  }

  const drawerRow = drawerId ? all.find((r) => r.orderId === drawerId) ?? null : null

  return (
    <LocalPage>
      {/* the owner-finalised local chrome (spec §11): tabs on the canvas with
          the two primary actions on the strip's right, then ONE filter line */}
      <LocalTabs
        tabs={TABS.map((t, i) => ({ id: String(i), label: t.label, count: tabCounts[i], icon: TAB_ICONS[i] }))}
        active={String(tab)} onChange={(id) => { setTab(Number(id)); setPage(1) }}
        right={<AddUpload onAdd={() => nav('/grow/orders/add')} onUpload={() => setUploading(true)} />} />

      <FilterLine
        right={<>
          <SearchBox value={q} onChange={(v) => { setQ(v); setPage(1) }} placeholder="Search shipments" />
          <IconBtn title="Download all (CSV)"
            onClick={() => { downloadCsv('consignments.csv', csvOf(rows)); toast.success(`${rows.length} rows exported.`) }}>
            <DownloadGlyph size={16} />
          </IconBtn>
        </>}>
        <DateRange start={from} end={to} onStart={(v) => { setFrom(v); setPage(1) }} onEnd={(v) => { setTo(v); setPage(1) }} />
        <FilterSelect value={state} placeholder="State" options={states} width={150} onChange={(v) => { setState(v); setPage(1) }} />
        <FilterSelect value={merchant} placeholder="Merchant" options={merchants} width={170} onChange={(v) => { setMerchant(v); setPickupAddress(''); setPage(1) }} />
        {pickupOn && (
          /* inert until a merchant is picked, and says why */
          <FilterSelect value={pickupAddress} placeholder={merchant ? 'Pickup Address' : 'Select a merchant first'}
            options={merchantStores} labels={storeLabel} searchable={merchantStores.length > 6} width={200}
            disabled={!merchant} onChange={(v) => { setPickupAddress(v); setPage(1) }} />
        )}
        <FunnelFilters defs={moreDefs} values={more}
          onChange={(k, vals) => { setMore((m) => ({ ...m, [k]: vals })); setPage(1) }} />
        <ClearFilters active={filtersOn} onClick={clearAll} />
      </FilterLine>

      {booked && booked.length > 0 && (
        <div className="mt-4 flex items-center gap-2 rounded-md border border-line bg-success-bg px-4 py-2.5 text-[13px] text-ink">
          <span className="font-bold text-success-fg">Pickup scheduled:</span>
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {booked.map((b) => (
              <span key={`${b.prId}-${b.kind}`}>
                <Link to={`/local/pickup/${b.prId}`} className="font-mono font-bold text-brand-500 hover:underline">{b.number}</Link>
                <span className="text-ink-3"> · {b.count} {b.kind === 'new' ? 'booked' : b.kind === 'merged' ? 'merged in' : 'added'}</span>
              </span>
            ))}
          </span>
          <button onClick={() => setBooked(null)} className="ml-auto text-ink-3 hover:text-ink" aria-label="Dismiss"><X size={14} /></button>
        </div>
      )}

      <div className="mt-4">
        {rows.length === 0 ? (
          <Panel>
            <EmptyState
              title={filtersOn ? 'No shipments match these filters' : `Nothing under ${TABS[tab].label}`}
              hint={filtersOn ? 'Clear the filters to see the whole list again.' : 'Shipments appear here once a merchant order is paid.'} />
          </Panel>
        ) : (
          <>
            <DataTable
              columns={columns} rows={paged} rowKey="orderId" selectable
              selectionActions={(s, clear) => selectionActions(s as LocalConsignmentRow[], clear)}
              onRowClick={(r) => nav(`/local/consignments/${(r as LocalConsignmentRow).orderId}`)} />
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

      {scheduling && pickupOn && (
        <SchedulePickupDialog
          orderIds={scheduling.ids}
          onClose={() => setScheduling(null)}
          onDone={(results, failed) => {
            scheduling.clear()
            setScheduling(null)
            setBooked(results)
            if (results.length) {
              const n = results.reduce((k, r) => k + r.count, 0)
              toast.success(`${n} shipment${n === 1 ? '' : 's'} booked for pickup — ${results.map((r) =>
                `${r.number}${r.kind === 'merged' ? ' (merged)' : r.kind === 'added' ? ' (added)' : ''}`).join(', ')}`)
            }
            if (failed.length) toast.error(`${failed.join(', ')} can no longer take shipments — nothing added there.`)
          }} />
      )}

      {uploading && (
        <BulkUploadDialog
          stores={db.stores}
          onClose={() => setUploading(false)}
          onCreated={(n: number) => { setUploading(false); toast.success(`${n} shipments created.`) }} />
      )}

      {drawerId && <ConsignmentDrawer row={drawerRow} onClose={() => nav('/local/consignments')} />}
    </LocalPage>
  )
}

/* ----------------------------------------------------------- the drawer ---- */

function ConsignmentDrawer({ row, onClose }: { row: LocalConsignmentRow | null; onClose: () => void }) {
  const [tab, setTab] = useState(0)
  const plan = usePlanning()

  if (!row) {
    return (
      <>
        <div className="fixed inset-0 z-[60] bg-warm-900/40" onClick={onClose} />
        <aside className="fixed inset-y-0 right-0 z-[61] flex w-[62%] min-w-[720px] flex-col bg-surface shadow-ds-overlay">
          <header className="flex items-center gap-3 border-b border-line px-4 py-4">
            <span className="text-[16px] font-bold text-ink">Shipment</span>
            <button onClick={onClose} className="ml-auto text-ink-3 hover:text-ink"><X size={18} /></button>
          </header>
          <div className="p-6"><EmptyState title="This shipment no longer exists." /></div>
        </aside>
      </>
    )
  }

  const o = row.order
  const notes = plan.notes[row.orderId] ?? []

  return (
    <>
      <div className="fixed inset-0 z-[60] bg-warm-900/40" onClick={onClose} />
      <aside className="fixed inset-y-0 right-0 z-[61] flex w-[62%] min-w-[720px] flex-col bg-surface shadow-ds-overlay"
        role="dialog" aria-label={`Consignment ${row.consignmentNumber}`}>
        <header className="flex items-center gap-3 border-b border-line px-4 py-4">
          <span className="font-mono text-[16px] font-bold text-ink">{row.consignmentNumber}</span>
          <StatusPill label={String(row.state)} tone={stateTone(String(row.state))} />
          {row.exception && <StatusPill label={row.exception} tone="danger" />}
          <button onClick={onClose} className="ml-auto text-ink-3 hover:text-ink"><X size={18} /></button>
        </header>

        <div className="px-4"><Tabs tabs={DRAWER_TABS} active={tab} onChange={setTab} /></div>

        <div className="flex-1 overflow-auto p-4">
          <div className="flex flex-col gap-3">
            {DRAWER_TABS[tab] === 'Details' && (
              <>
                <Section title="Shipment" pairs={[
                  ['Consignment Number', row.consignmentNumber],
                  ['Reference Number', row.referenceNumber],
                  ['Order Number', row.orderNumber],
                  ['Type', row.taskType],
                  ['State', String(row.state)],
                  ['Secondary State', dash(row.secondaryState)],
                  ['Exception', dash(row.exception)],
                  ['Merchant', row.merchant],
                  ['Carrier', dash(row.carrier)],
                  ['Service Type', dash(row.serviceType)],
                  ['Created At', stamp(o.createdAt)],
                  ['Ageing', `${row.ageingDays} days`],
                ]} />
                <Section title="Ship From" pairs={[
                  ['Location', row.origin],
                  ['Code', dash(row.shipFromCode)],
                  ['Pickup Window', row.pickupWindow ? `${stamp(row.pickupWindow.start)} → ${stamp(row.pickupWindow.end)}` : '—'],
                  ['Booked Under', o.pickupRequestId && row.pickupRequestNumber
                    ? <Link to={`/local/pickup/${o.pickupRequestId}`} className="font-mono text-brand-500 hover:underline">{row.pickupRequestNumber}</Link>
                    : '—'],
                  ['Picked In', o.pickedInRequestId && row.pickedInNumber
                    ? <Link to={`/local/pickup/${o.pickedInRequestId}`} className="font-mono text-brand-500 hover:underline">{row.pickedInNumber}</Link>
                    : '—'],
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

            {DRAWER_TABS[tab] === 'SKU / Package' && (
              <Section title="Package" pairs={[
                ['Kind', o.pkg.kind],
                ['Pieces', String(row.pieces)],
                ['Weight', `${row.weightKg} kg`],
                ['Volume', `${row.volumeMm3.toLocaleString()} mm³`],
                ['Pallet Spaces', String(row.palletSpaces ?? 1)],
                ['Dimensions', `${o.pkg.lengthCm} × ${o.pkg.widthCm} × ${o.pkg.heightCm} cm`],
                ['Description', dash(o.pkg.description)],
                ['Declared Value', `${o.currency} ${o.pkg.declaredValue.toLocaleString()}`],
              ]} />
            )}

            {DRAWER_TABS[tab] === 'Tracking' && (
              row.shipments.length === 0
                ? <EmptyState title="No packages tracked yet" />
                : (
                  <Panel title={`Packages (${row.shipments.length})`}>
                    <div className="px-5 pb-4">
                      {row.shipments.map((s) => (
                        <div key={s.id} className="flex items-center gap-3 border-b border-line py-2 last:border-0 text-[13px]">
                          <span className="font-mono font-bold text-ink">{s.trackingNumber}</span>
                          <span className="ml-auto text-ink-3">{s.outcome ?? 'In progress'}</span>
                        </div>
                      ))}
                    </div>
                  </Panel>
                )
            )}

            {DRAWER_TABS[tab] === 'Notes' && (
              notes.length === 0
                ? <EmptyState title="No notes" hint="Notes added from the planning pages appear here." />
                : (
                  <Panel title={`Notes (${notes.length})`}>
                    <div className="px-5 pb-4">
                      {notes.map((n, i) => (
                        <div key={i} className="border-b border-line py-2 last:border-0">
                          <p className="text-[13px] text-ink">{n.text}</p>
                          <p className="text-[11.5px] text-ink-3">{stamp(n.at)}</p>
                        </div>
                      ))}
                    </div>
                  </Panel>
                )
            )}
          </div>
        </div>
      </aside>
    </>
  )
}
