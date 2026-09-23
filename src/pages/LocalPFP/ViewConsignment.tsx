/**
 * View Consignment — the read-only page a Pending For Planning row opens.
 *
 * Staging shows this as a right-side overlay; this app's list grammar opens a
 * VIEW PAGE instead, so the field inventory is staging's and the chrome is ours
 * (`PageHeader` → `Tabs` → `Panel`). The nine tabs and every field label come
 * from the capture; anything the local Grow record cannot answer renders "—"
 * rather than being quietly dropped.
 */
import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
/* icons come from the tree's own extracted set — this route drops the lucide icon package */
import {
  ArrowLeft, ChatText, ClipboardList, Close, Eye, FileImage, GridFour, ListTree, MapPin,
  Package, Send, Wrench,
} from './icons'
import {
  Button, EmptyState, Input, Modal, PageHeader, Panel, SimpleTable, StatusPill,
  type SimpleCol,
} from '../../nueva/components'
import { toast } from '../../nueva/toast'
import { useGrowOrders } from '../../growOrders/store'
import type { GrowOrder, Party } from '../../growOrders/types'
import { stateTone, toConsignmentRow, type LocalConsignmentRow } from './adapter'
import { planningActions, usePlanning } from './planningStore'
/* the SHARED drawer bits — the pickup drawer renders the same ones, so the two
   detail views cannot drift apart into two different-looking surfaces */
import { Grid, Section } from './overlayBits'
import { dash, stamp } from './overlayFormat'

const TABS = ['Summary', 'Order', 'Piece', 'Tracking', 'SKU', 'VAS', 'Attempt', 'Customer Feedback', 'Notes']
const TAB_ICONS = [ClipboardList, Package, GridFour, MapPin, ListTree, Wrench, FileImage, ChatText, ClipboardList]

/* ------------------------------------------------------------- small bits -- */

function partyPairs(p: Party, nameLabel: string, whenLabel: string, when: string, code: string): [string, React.ReactNode][] {
  return [
    ['Location Code', dash(code)],
    ['Company Name', dash(p.businessName)],
    [nameLabel, dash(p.name)],
    ['Address Line 1', dash(p.line1)],
    ['Address Line 2', dash(p.line2)],
    ['Address Line 3', '—'],
    ['Landmark', dash(p.landmark)],
    ['Postal Code', dash(p.postalCode)],
    ['City', dash(p.city)],
    ['State', dash(p.state)],
    ['Suburb / County', dash(p.state)],
    ['Country', dash(p.country)],
    ['Contact Number', dash(p.contactNumber)],
    ['Secondary Contact Number', '—'],
    ['Email', dash(p.email)],
    ['Address Type', '—'],
    [whenLabel, stamp(when)],
    [whenLabel.includes('Pickup') ? 'Pickup Timezone' : 'Delivery Timezone', 'Asia/Manila'],
    ['Lat, Long', '—'],
    ['Facility Code', dash(code)],
    ['Lift Available', '—'],
    ['Floor Number', '—'],
  ]
}

/* ------------------------------------------------------------------ page --- */

/** `basePath` = the list this overlay sits over (the current PFP or its replica) */
export default function ViewConsignment({ basePath = '/local/pending-for-planning' }: { basePath?: string } = {}) {
  const { id = '' } = useParams()
  const nav = useNavigate()
  const db = useGrowOrders()
  const plan = usePlanning()
  const [tab, setTab] = useState(0)
  const [events, setEvents] = useState(false)
  const [note, setNote] = useState('')

  const order = db.orders.find((o) => o.id === id)
  const row = useMemo(() => (order
    ? toConsignmentRow(order, db, {
      secondaryState: plan.secondaryState[order.id],
      schedule: plan.scheduleOverrides[order.id],
      exception: plan.exceptions[order.id],
    })
    : null), [order, db, plan])

  const back = () => nav(basePath)

  if (!order || !row) {
    return (
      <div className="fe-nueva bg-canvas min-h-full p-6">
        <PageHeader title="Consignment not found" onBack={back} />
        <Panel>
          <EmptyState icon={<Package size={40} />} title="No such consignment"
            hint="It may have been cancelled, or this link was copied from another browser profile." />
        </Panel>
      </div>
    )
  }

  const notes = plan.notes[order.id] ?? []
  const closure = plan.closures[order.id]

  /* Staging renders this as a full-height RIGHT-SIDE OVERLAY (~62% wide) over
     the list, with the nine tabs as a left rail — not as a page. On this route
     that arrangement IS the reference, so the overlay is what we build. */
  return (
    <>
      <div className="pfp-overlay-scrim" onClick={back} />
      <aside className="pfp-overlay" role="dialog" aria-label={`Consignment ${row.orderNumber}`}>
        <header className="pfp-overlay-head">
          <button type="button" className="pfp-iconbtn" aria-label="Back" onClick={back}>
            <ArrowLeft size={16} />
          </button>
          <span className="pfp-overlay-title">{row.orderNumber}</span>
          <button type="button" className="pfp-btn" style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6 }}
            onClick={() => setEvents(true)}>
            <Eye size={14} /> View Events
          </button>
          <button type="button" className="pfp-iconbtn" aria-label="Close" onClick={back}>
            <Close size={16} />
          </button>
        </header>

        <div className="pfp-overlay-body">
          <nav className="pfp-overlay-rail" aria-label="Consignment sections">
            {TABS.map((t, i) => {
              const Icon = TAB_ICONS[i]
              return (
                <button key={t} type="button" className="pfp-overlay-tab"
                  aria-selected={tab === i} onClick={() => setTab(i)}>
                  <Icon size={16} />{t}
                </button>
              )
            })}
          </nav>

          <div className="pfp-overlay-pane">
      <div className="flex flex-col gap-3">
        {TABS[tab] === 'Summary' && <SummaryTab row={row} order={order} />}

        {TABS[tab] === 'Order' && (
          <>
            <Section title="Summary" pairs={[
              ['Order Number', row.orderNumber], ['Reference Number', row.referenceNumber],
              ['Consignment Number', row.consignmentNumber], ['Consignment Type', row.orderTypeLabel],
              ['Consignment State', String(row.state)], ['Exception State', dash(row.exception)],
              ['Carrier Code', row.carrier.toUpperCase()], ['Merchant', row.merchant],
              ['Total Weight', `${row.weightKg} KG`], ['Total Volume', row.volume.toUpperCase()],
              ['SKU Quantity', row.skuCount], ['Piece Quantity', row.pieces],
              ['Service Type', row.serviceType], ['Payment Amount', `${order.currency} ${order.codAmount.toFixed(2)}`],
              ['Cost Code', '—'], ['Current Facility', row.shipFromCode],
              ['Splittable', order.pkg.count > 1 ? 'Yes' : 'No'], ['Tags', dash(row.tag)],
              ['Scheduling Confirmation Required', row.deliveryWindow ? 'Yes' : 'No'],
              ['Scheduling Confirmed', plan.scheduleOverrides[order.id] ? 'Yes' : '—'],
              ['Total Loading Time', '—'],
            ]} />
            <Section title="Ship From" pairs={partyPairs(order.sender, 'Sender Name', 'Planned Pickup Date/Time', row.pickupWindow?.start ?? '', row.shipFromCode)} />
            <Section title="Ship To" pairs={partyPairs(order.receiver, 'Receiver Name', 'Planned Delivery Date/Time', row.deliveryWindow?.start ?? '', row.shipToCode)} />
            <Section title="Pre-Routing Details" pairs={[
              ['Delivery Service Time', `${row.serviceTimeMin} min`], ['Max Height', `${order.pkg.heightCm} CM`],
              ['Max Length', `${order.pkg.lengthCm} CM`], ['Pallets', row.palletSpaces ?? 1],
              ['Max Breadth', `${order.pkg.widthCm} CM`], ['Pickup Service Time', `${row.serviceTimeMin} min`],
            ]} />
          </>
        )}

        {TABS[tab] === 'Piece' && row.shipments.map((s, i) => (
          <Section key={s.id} title={`Id: ${s.id}`} pairs={[
            ['Tracking Number', dash(s.trackingNumber)], ['Storage Location', '—'],
            ['State', String(row.state)], ['Exception State', dash(row.exception)],
            ['Type', order.pkg.kind.toUpperCase()], ['Description', dash(order.pkg.description)],
            ['Value', `${order.currency} ${order.pkg.declaredValue}`], ['Current Facility', row.shipFromCode],
            ['Created Weight', `${order.pkg.weightKg} KG`], ['Created Volume', row.volume.toUpperCase()],
            ['Weight', `${order.pkg.weightKg} KG`], ['Volume', row.volume.toUpperCase()],
            ['Quantity', 1], ['SKU Quantity', 1],
            ['Length', `${order.pkg.lengthCm} CM`], ['Width', `${order.pkg.widthCm} CM`],
            ['Height', `${order.pkg.heightCm} CM`], ['Barcode', dash(s.trackingNumber)],
            ['SKU Code', `${row.orderNumber}-SKU${i + 1}`], ['Proof of Damage', '—'],
            ['Pallet Space', row.palletSpaces ?? 1], ['Label Url', '—'],
          ]} />
        ))}

        {TABS[tab] === 'Tracking' && (
          <>
            <Section title="Schedule" pairs={[
              ['Ship By Date', dash(row.shipByDate)], ['Dispatch Date', stamp(row.dispatchDate)],
              ['Pickup Start Time', stamp(row.pickupWindow?.start)], ['Pickup End Time', stamp(row.pickupWindow?.end)],
              ['Pickup Timezone', 'Asia/Manila'], ['Delivery Start Time', stamp(row.deliveryWindow?.start)],
              ['Delivery End Time', stamp(row.deliveryWindow?.end)], ['Delivery Timezone', 'Asia/Manila'],
              ['Original Pickup Start Time', stamp(row.pickupWindow?.start)], ['Original Pickup End Time', stamp(row.pickupWindow?.end)],
              ['Original Delivery Start Time', stamp(row.deliveryWindow?.start)], ['Original Delivery End Time', stamp(row.deliveryWindow?.end)],
            ]} />
            <Panel title="Charges & Pricing">
              {order.codAmount > 0
                ? <Grid pairs={[['Payment Mode', order.paymentMode], ['COD Amount', `${order.currency} ${order.codAmount.toFixed(2)}`]]} />
                : <p className="px-5 py-8 text-center text-[13px] text-ink-3">No pricing information available</p>}
            </Panel>
            <Section title="Carrier & Tracking Information" pairs={[
              ['Carrier Code', row.carrier.toUpperCase()], ['Master Tracking Number', dash(order.trackingNumber)],
              ['Carrier Name', row.carrier], ['Manifest Number', '—'],
              ['Service Type', row.serviceType], ['Manifest Label', '—'],
              ['Current Status', String(row.state)], ['TAT Value', '—'],
              ['Current Facility', row.shipFromCode], ['Rank', '—'],
              ['Origin Depot', row.shipFromCode], ['Rate Calculation Level', '—'],
              ['Destination Depot', row.shipToCode], ['Tracking Url', '—'],
              ['Type', 'Managed'],
            ]} />
          </>
        )}

        {TABS[tab] === 'SKU' && (
          <Section title={`SKU: ${row.orderNumber}-SKU1`} pairs={[
            ['SKU Code', `${row.orderNumber}-SKU1`], ['HSN Name', '—'],
            ['Product Name', dash(order.pkg.description)], ['Description', dash(order.pkg.description)],
            ['Line Item Number', '1'], ['Piece', row.shipments[0]?.id ?? '—'],
            ['Total Value', `${order.currency} ${order.pkg.declaredValue}`], ['Unit Price', `${order.currency} ${order.pkg.declaredValue}`],
            ['Weight per Unit', `${order.pkg.weightKg} KG`], ['Volume', row.volume.toUpperCase()],
            ['Quantity', order.pkg.count], ['UOM', order.pkg.kind === 'Document' ? 'DOC' : 'BOX'],
            ['Origin Country', dash(order.sender.country)], ['Length', `${order.pkg.lengthCm} CM`],
            ['Width', `${order.pkg.widthCm} CM`], ['Height', `${order.pkg.heightCm} CM`],
            ['Pickup Service Time', row.serviceTimeMin], ['Delivery Service Time', row.serviceTimeMin],
            ['Category', dash(order.pkg.kind)], ['Image Url', '—'],
          ]} />
        )}

        {TABS[tab] === 'VAS' && (
          <Panel>
            {(order.additionalServices ?? []).length
              ? <Grid pairs={(order.additionalServices ?? []).map((s, i) => [`Service ${i + 1}`, s] as [string, React.ReactNode])} />
              : <EmptyState icon={<Wrench size={40} />} title="No Value Added Services"
                hint="VAS information will appear here when available" />}
          </Panel>
        )}

        {TABS[tab] === 'Attempt' && (
          <Panel>
            {closure
              ? <Grid pairs={[
                ['Outcome', closure.outcome], ['ATC (Completion)', stamp(closure.atc)],
                ['Failure Reason', dash(closure.failureReason)], ['Attachments', closure.attachments],
              ]} />
              : <EmptyState icon={<FileImage size={40} />} title="No delivery attempts yet"
                hint="Attempts appear here once a driver works the stop." />}
          </Panel>
        )}

        {TABS[tab] === 'Customer Feedback' && (
          <Panel>
            <EmptyState icon={<ChatText size={40} />} title="No customer engagement data available yet!"
              hint="Information will appear here when available" />
          </Panel>
        )}

        {TABS[tab] === 'Notes' && (
          <Panel>
            <div className="px-5 py-4">
              {notes.length === 0
                ? <p className="py-8 text-center text-[13px] text-ink-3">No notes yet.</p>
                : (
                  <ul className="flex flex-col gap-2">
                    {notes.map((n) => (
                      <li key={n.at} className="rounded-md border border-line bg-warm-25 px-4 py-2.5">
                        <p className="text-[13px] text-ink">{n.text}</p>
                        <p className="mt-0.5 text-[12px] text-ink-3">{stamp(n.at)}</p>
                      </li>
                    ))}
                  </ul>
                )}
              <div className="mt-4 flex items-center gap-2">
                <div className="flex-1"><Input value={note} onChange={setNote} placeholder="Add Notes..." /></div>
                <Button icon={<Send size={14} />} disabled={!note.trim()} onClick={() => {
                  planningActions.addNote(order.id, note.trim())
                  setNote('')
                  toast.success('Note added.')
                }}>Add</Button>
              </div>
            </div>
          </Panel>
        )}
      </div>
          </div>
        </div>

      {events && <EventsModal row={row} order={order} onClose={() => setEvents(false)} />}
    </aside>
    </>
  )
}

/* --------------------------------------------------------------- summary --- */

function SummaryTab({ row, order }: { row: LocalConsignmentRow; order: GrowOrder }) {
  const cols: SimpleCol<{ id: string; trackingNumber: string }>[] = [
    { label: 'Package Tracking Number', render: (s) => <span className="font-bold text-ink">{s.trackingNumber}</span> },
    { label: 'State', render: () => String(row.state) },
    { label: 'Product Name', render: () => dash(order.pkg.description) },
    { label: 'SKU Code', render: () => `${row.orderNumber}-SKU1` },
    { label: 'SKU Quantity', render: () => 1, align: 'right' },
    { label: 'Volume', render: () => row.volume, align: 'right' },
    { label: 'Weight', render: () => `${order.pkg.weightKg} KG`, align: 'right' },
    { label: 'Pallet Spaces', render: () => row.palletSpaces ?? 1, align: 'right' },
    { label: 'L * B * H', render: () => `${order.pkg.lengthCm} * ${order.pkg.widthCm} * ${order.pkg.heightCm} CM` },
  ]
  return (
    <>
      <Panel>
        <div className="grid gap-6 px-5 py-4 md:grid-cols-2">
          {([['SHIP FROM', row.shipFromCode, order.sender, row.pickupWindow],
            ['SHIP TO', row.shipToCode, order.receiver, row.deliveryWindow]] as const).map(([head, code, p, w]) => (
            <div key={head}>
              <p className="text-[12px] font-bold uppercase tracking-wide text-ink-3">{head}</p>
              <p className="mt-1 text-[15px] font-bold text-ink">{dash(code)}</p>
              <p className="mt-0.5 text-[13px] text-ink-2">{[p.line1, p.line2, p.city, p.state, p.postalCode].filter(Boolean).join(', ')}</p>
              <p className="mt-1 text-[12.5px] text-ink-3">{stamp(w?.start)} – {stamp(w?.end)}</p>
              <p className="mt-0.5 text-[12.5px] text-ink-3">{dash(p.name)} · {dash(p.contactNumber)}</p>
            </div>
          ))}
        </div>
        <div className="mx-5 mb-4 rounded-md border-l-2 border-brand-500 bg-brand-50 px-4 py-3">
          <p className="text-[12px] font-bold uppercase tracking-wide text-ink-3">Planned Slot</p>
          <p className="mt-0.5 text-[13px] font-bold text-ink">{stamp(row.deliveryWindow?.start)} – {stamp(row.deliveryWindow?.end)}</p>
        </div>
      </Panel>

      <Panel>
        <Grid pairs={[
          ['STATE', <StatusPill key="s" label={String(row.state)} tone={stateTone(String(row.state))} />],
          ['CARRIER', row.carrier.toUpperCase()],
          ['SERVICE', row.serviceType],
          ['SECONDARY STATE', dash(row.secondaryState)],
        ]} />
        <div className="flex flex-wrap gap-2 px-5 pb-4">
          {[`SKUs: ${row.skuCount}`, `Packages: ${row.pieces}`, `Pallets: ${row.palletSpaces ?? 1}`,
            `Weight: ${row.weightKg} KG`, `Volume: ${row.volume.toUpperCase()}`].map((c) => (
            <span key={c} className="inline-flex items-center rounded-md border border-warm-300 bg-surface px-2.5 py-1 text-[12.5px] text-ink-2">{c}</span>
          ))}
          <StatusPill label={row.orderTypeLabel} tone="info" />
          {row.flags.map((f) => <StatusPill key={f} label={f} tone="warning" />)}
        </div>
      </Panel>

      <Panel>
        <SimpleTable columns={cols} rows={row.shipments} rowKey={(s) => s.id} />
      </Panel>
    </>
  )
}

/* ---------------------------------------------------------------- events --- */

function EventsModal({ row, order, onClose }: { row: LocalConsignmentRow; order: GrowOrder; onClose: () => void }) {
  const events: [string, string][] = [
    ['Order created', order.createdAt],
    ...(order.pickupRequestId ? [['Pickup booked', order.createdAt] as [string, string]] : []),
    ...(row.pickupWindow ? [['Pickup window opens', row.pickupWindow.start] as [string, string]] : []),
    ...(row.deliveryWindow ? [['Delivery window opens', row.deliveryWindow.start] as [string, string]] : []),
  ]
  return (
    <Modal title={`Events · ${row.orderNumber}`} open onClose={onClose}
      footer={<Button variant="outline" onClick={onClose}>Close</Button>}>
      <ul className="flex flex-col gap-2 py-1">
        {events.map(([label, at]) => (
          <li key={label} className="flex items-center justify-between rounded-md border border-line bg-warm-25 px-4 py-2.5">
            <span className="text-[13px] text-ink">{label}</span>
            <span className="text-[12.5px] text-ink-3">{stamp(at)}</span>
          </li>
        ))}
      </ul>
    </Modal>
  )
}
