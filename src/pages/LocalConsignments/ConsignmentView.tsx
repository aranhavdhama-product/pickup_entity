/**
 * View Consignment — the console's detail overlay, opened by a row on
 * `/local/consignments` (`/local/consignments/:id`).
 *
 * Built to the staging view captured on 2026-09-24 (/v2/ses/consignment →
 * row): a right-hand overlay (62% wide) with a section rail on its left —
 * Summary · Order · Package · Tracking · SKU · VAS · Load · Attempt · Customer
 * Feedback · Notes — and a "View Events" toggle that widens the overlay and
 * docks an Event Logs timeline on the right (the rail collapses to icons).
 * Field inventory and section order are staging's; every value comes from
 * the local record through `viewModel.ts`, and a value the record cannot
 * answer reads "—" rather than being dropped. Nueva primitives only.
 *
 * The Grow portal reuses this overlay (`GrowOrders/GrowConsignmentView`) with
 * `audience="merchant"` + its own `readSections` shaped like the merchant order
 * form; the ten staging sections then do not render at all.
 */
import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowLeft, ArrowRight, Box, Calendar, ChevronDown, ChevronRight, ClipboardList, CornerUpLeft, Eye, EyeOff,
  FileText, Image as ImageIcon, LayoutGrid, List, Lock, MapPin, MessageSquare, Package, Scale, Send, Truck,
  User, Wrench, Globe, Layers, Boxes,
} from 'lucide-react'
import {
  Button, EmptyState, IconButton, Input, Panel, SimpleTable, StatusPill, Tabs, type SimpleCol,
} from '../../nueva/components'
import { toast } from '../../nueva/toast'
import { useGrowOrders } from '../../growOrders/store'
import type { GrowOrder, Party } from '../../growOrders/types'
import { stateTone, type LocalConsignmentRow } from '../LocalPFP/adapter'
import { planningActions, usePlanning } from '../LocalPFP/planningStore'
import { dash, stamp } from '../LocalPFP/overlayFormat'
import {
  attemptsOf, eventsOf, loadsOf, merchantEventsOf, piecesOf, skuLinesOf, vasLinesOf,
  type AttemptOutcome, type AttemptView, type EventGroup, type PieceView,
} from './viewModel'

/* ------------------------------------------------------------ sections --- */

const SECTIONS = ['Summary', 'Order', 'Package', 'Tracking', 'SKU', 'VAS', 'Load', 'Attempt', 'Customer Feedback', 'Notes'] as const
type SectionId = (typeof SECTIONS)[number]
const SECTION_ICON: Record<SectionId, typeof Package> = {
  Summary: FileText, Order: Package, Package: LayoutGrid, Tracking: MapPin, SKU: List, VAS: Wrench,
  Load: Boxes, Attempt: ClipboardList, 'Customer Feedback': MessageSquare, Notes: FileText,
}

/**
 * Who is looking. `ops` = the console (staging's ten sections, every field);
 * `merchant` = the Grow portal: the host passes its OWN read-only sections
 * (`readSections`, shaped like the merchant order form) and the event log is
 * the milestone reading (`merchantEventsOf`, no Ops / Customer toggle).
 */
export type ViewAudience = 'ops' | 'merchant'
const AudienceCtx = createContext<ViewAudience>('ops')
const useMerchant = () => useContext(AudienceCtx) === 'merchant'

/** One host-supplied section: a rail entry + its card(s), rendered stacked on one scroll. */
export interface ReadSection { id: string; label: string; icon: typeof Package; node: ReactNode }

const TZ = 'Asia/Manila'
type Pair = [string, ReactNode]

/* ------------------------------------------------------- small pieces ---- */

/** Staging's two-column label/value grid — label 12px muted, value 13px bold. */
function Pairs({ pairs }: { pairs: Pair[] }) {
  return (
    <div className="grid grid-cols-1 gap-x-8 gap-y-3.5 px-5 py-4 sm:grid-cols-2">
      {pairs.map(([k, v], i) => (
        <div key={`${k}-${i}`} className="min-w-0">
          <p className="text-[12px] text-ink-3">{k}</p>
          <p className="mt-0.5 break-words text-[13px] font-bold text-ink">{v}</p>
        </div>
      ))}
    </div>
  )
}

/** A titled card that folds — staging's collapsible section header (chevron right). */
function FoldCard({ title, children, open: initial = true, right }: { title: ReactNode; children: ReactNode; open?: boolean; right?: ReactNode }) {
  const [open, setOpen] = useState(initial)
  return (
    <div className="rounded-xl border border-line bg-surface shadow-ds-1">
      <button type="button" onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 px-5 py-3.5 text-left">
        <span className="text-[15px] font-bold text-ink">{title}</span>
        {right && <span className="ml-2" onClick={(e) => e.stopPropagation()}>{right}</span>}
        <ChevronDown size={18} className={`ml-auto text-ink-3 transition-transform ${open ? '' : '-rotate-90'}`} />
      </button>
      {open && <div className="border-t border-line">{children}</div>}
    </div>
  )
}

function Eyebrow({ children }: { children: ReactNode }) {
  return <p className="text-[12px] text-ink-3">{children}</p>
}

const Chip = ({ icon, children, tone = 'neutral' }: { icon?: ReactNode; children: ReactNode; tone?: 'neutral' | 'info' | 'flag' }) => (
  <span className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-[13px] ${
    tone === 'info' ? 'border-info-bg bg-info-bg text-ink' : tone === 'flag' ? 'border-brand-500 bg-surface text-ink' : 'border-line bg-surface text-ink'}`}>
    {icon}{children}
  </span>
)

const addressOf = (p: Party) => [p.line1, p.line2, p.city, p.state, p.postalCode, p.country].filter(Boolean).join(', ')
const kg = (n: number) => `${n} kg`
const mm3 = (n: number) => `${n.toLocaleString()} mm³`

function partyPairs(p: Party, nameLabel: string, whenLabel: string, when: string, tzLabel: string, code: string): Pair[] {
  return [
    ['Location Code', dash(p.locationCode || code)], ['Company Name', dash(p.businessName)],
    [nameLabel, dash(p.name)], ['Address Line 1', dash(p.line1)],
    ['Address Line 2', dash(p.line2)], ['Address Line 3', dash(p.line3)],
    ['Landmark', dash(p.landmark)], ['Postal Code', dash(p.postalCode)],
    ['City', dash(p.city)], ['State', dash(p.state)],
    ['Suburb / County', dash(p.county)], ['Country', dash(p.country)],
    ['Contact Number', dash(p.contactNumber)], ['Secondary Contact Number', '—'],
    ['Email', dash(p.email)], ['Address Type', '—'],
    [whenLabel, stamp(when)], [tzLabel, TZ],
    ['Lat, Long', p.latitude && p.longitude ? `${p.latitude}, ${p.longitude}` : '—'], ['Facility Code', dash(code).toLowerCase()],
    ['Lift Available', p.liftAvailable === undefined ? '—' : p.liftAvailable ? 'Yes' : 'No'], ['Floor Number', dash(p.floorNumber)],
  ]
}

/* ---------------------------------------------------------------- page --- */

export default function ConsignmentView({ row, onClose, audience = 'ops', actions, readSections }: {
  row: LocalConsignmentRow | null
  onClose: () => void
  /** `merchant` = the Grow portal's reading (see `ViewAudience`). */
  audience?: ViewAudience
  /** Host actions, placed in the header left of View Events (the merchant's Book Pickup · Resume · Cancel · Print label). */
  actions?: ReactNode
  /** Replace staging's ten sections with the host's own (Grow). Stacked on one page; the rail scrolls to each. */
  readSections?: ReadSection[]
}) {
  const db = useGrowOrders()
  const plan = usePlanning()
  const merchant = audience === 'merchant'
  const [section, setSection] = useState<SectionId>('Summary')
  const [events, setEvents] = useState(false)

  const o = row?.order
  const pieces = useMemo(() => (row && o ? piecesOf(row, o) : []), [row, o])
  const groups = useMemo(() => {
    const all = o ? eventsOf(o, plan, db) : []
    return merchant ? merchantEventsOf(all) : all
  }, [o, plan, db, merchant])
  const [readOn, setReadOn] = useState<string | null>(null)
  const goTo = (id: string) => {
    setReadOn(id)
    document.getElementById(`cv-read-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
  const railItem = (key: string, label: string, Icon: typeof Package, on: boolean, onClick: () => void) => (
    <button key={key} type="button" onClick={onClick} title={label} aria-current={on ? 'page' : undefined}
      className={`flex w-full items-center gap-2.5 border-l-[3px] px-4 py-2.5 text-left text-[13px] transition-colors ${
        on ? 'border-brand-500 bg-warm-50 font-bold text-ink' : 'border-transparent text-ink-2 hover:bg-warm-50 hover:text-ink'}`}>
      <Icon size={16} className={on ? 'text-brand-500' : 'text-ink-3'} />
      {!events && <span className="truncate">{label}</span>}
    </button>
  )

  const shell = (title: ReactNode, body: ReactNode, wide = false) => (
    <>
      <div className="fixed inset-0 z-[60] bg-warm-900/40" onClick={onClose} />
      <aside role="dialog" aria-label={typeof title === 'string' ? title : 'Consignment'}
        className={`fixed inset-y-0 right-0 z-[61] flex flex-col bg-canvas shadow-ds-overlay transition-[width] duration-200 ${wide ? 'w-[92%]' : 'w-[62%] min-w-[760px]'}`}>
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-line bg-surface px-4">
          <button type="button" onClick={onClose} aria-label="Back" className="rounded p-1 text-ink-2 hover:bg-warm-100 hover:text-ink"><ArrowLeft size={18} /></button>
          <span className="text-[18px] font-bold text-ink">{title}</span>
          {o && (
            <span className="ml-auto flex items-center gap-2">
              {actions}
              <Button variant="outline" icon={events ? <EyeOff size={15} /> : <Eye size={15} />} onClick={() => setEvents((v) => !v)}>
                {events ? 'Hide Events' : 'View Events'}
              </Button>
            </span>
          )}
        </header>
        {body}
      </aside>
    </>
  )

  if (!row || !o) {
    return shell('Consignment', (
      <div className="p-6"><Panel><EmptyState icon={<Package size={40} />} title="This consignment no longer exists"
        hint="It may have been removed, or the link is from another browser's data." /></Panel></div>
    ))
  }

  return shell(row.consignmentNumber, (
    <AudienceCtx.Provider value={audience}>
    <div className="flex min-h-0 flex-1">
      {/* the section rail — icons only while the event log is docked */}
      <nav aria-label="Consignment sections"
        className={`shrink-0 overflow-y-auto border-r border-line bg-surface py-2 ${events ? 'w-[52px]' : 'w-[196px]'}`}>
        {readSections
          ? readSections.map((r) => railItem(r.id, r.label, r.icon, (readOn ?? readSections[0]?.id) === r.id, () => goTo(r.id)))
          : SECTIONS.map((s) => railItem(s, s, SECTION_ICON[s], s === section, () => setSection(s)))}
      </nav>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 overflow-auto p-4" onScroll={readSections ? (e) => {
          /* scroll-spy: the rail follows the section at the top of the page */
          const top = e.currentTarget.getBoundingClientRect().top + 48
          const cur = readSections.filter((r) => (document.getElementById(`cv-read-${r.id}`)?.getBoundingClientRect().top ?? 1e9) <= top).pop()
          if (cur && cur.id !== readOn) setReadOn(cur.id)
        } : undefined}>
          {readSections ? (
            <div className="flex flex-col gap-3">
              {readSections.map((r) => <div key={r.id} id={`cv-read-${r.id}`} className="scroll-mt-4">{r.node}</div>)}
            </div>
          ) : (
          <div className="flex flex-col gap-3">
            {section === 'Summary' && <SummarySection row={row} o={o} pieces={pieces} />}
            {section === 'Order' && <OrderSection row={row} o={o} scheduled={!!plan.scheduleOverrides[o.id]} />}
            {section === 'Package' && <PieceSection row={row} o={o} pieces={pieces} />}
            {section === 'Tracking' && <TrackingSection row={row} o={o} />}
            {section === 'SKU' && <SkuSection row={row} o={o} pieces={pieces} />}
            {section === 'VAS' && <VasSection o={o} pieces={pieces} />}
            {section === 'Load' && <LoadSection o={o} />}
            {section === 'Attempt' && <AttemptSection row={row} o={o} />}
            {section === 'Customer Feedback' && (
              <Panel><EmptyState icon={<MessageSquare size={40} />} title="No customer engagement data available yet!"
                hint="Information will appear here when available" /></Panel>
            )}
            {section === 'Notes' && <NotesSection o={o} />}
          </div>
          )}
        </div>
      </div>

      {events && <EventLog groups={groups} />}
    </div>
    </AudienceCtx.Provider>
  ), events)
}

/* ------------------------------------------------------------- Summary --- */

function SummarySection({ row, o, pieces }: { row: LocalConsignmentRow; o: GrowOrder; pieces: PieceView[] }) {
  const cols: SimpleCol<PieceView>[] = [
    { label: 'Package Tracking Number', render: (p) => <span className="whitespace-nowrap font-bold text-ink">{p.trackingNumber}</span> },
    { label: 'State', render: (p) => <span className="whitespace-nowrap">{p.state}</span> },
    { label: 'Product Name', render: (p) => <span className="whitespace-nowrap">{p.productName}</span> },
    { label: 'SKU Code', render: (p) => <span className="whitespace-nowrap font-mono text-[12px]">{p.skuCode}</span> },
    { label: 'SKU Description', render: (p) => <span className="block max-w-[260px] truncate" title={p.skuDescription}>{p.skuDescription}</span> },
    { label: 'SKU Quantity', align: 'right', render: (p) => p.skuQuantity },
    { label: 'Volume', align: 'right', render: (p) => <span className="whitespace-nowrap">{mm3(p.volumeMm3)}</span> },
    { label: 'Weight', align: 'right', render: (p) => <span className="whitespace-nowrap">{kg(p.weightKg)}</span> },
    { label: 'Pallet Spaces', align: 'right', render: (p) => p.palletSpaces },
    { label: 'L * B * H', render: (p) => <span className="whitespace-nowrap">{p.dims}</span> },
  ]
  const party = (head: string, code: string, p: Party, w: { start: string; end: string } | null, right = false) => (
    <div className={`min-w-0 flex-1 ${right ? 'text-right' : ''}`}>
      <Eyebrow>{head}</Eyebrow>
      <p className="mt-0.5 text-[15px] font-bold text-ink">{dash(code)}</p>
      <p className="truncate text-[13px] text-ink-2" title={addressOf(p)}>{addressOf(p) || '—'}</p>
      <p className={`mt-2 flex items-center gap-1.5 text-[13px] text-ink-2 ${right ? 'justify-end' : ''}`}>
        <Calendar size={13} className="text-ink-3" />{w ? `${stamp(w.start)} - ${stamp(w.end)}` : '—'}
      </p>
      <p className={`mt-1.5 flex items-center gap-1.5 text-[13px] text-ink-2 ${right ? 'justify-end' : ''}`}>
        <User size={13} className="text-ink-3" />{dash(p.name)} <span className="text-ink-3">{p.contactNumber || '-'}</span>
      </p>
    </div>
  )
  return (
    <>
      <Panel>
        <div className="flex items-start gap-6 px-5 py-4">
          {party('Ship From', row.shipFromCode, o.sender, row.pickupWindow)}
          <span className="mt-8 flex w-16 shrink-0 items-center text-warm-300"><span className="h-px flex-1 bg-warm-300" /><ArrowRight size={16} /></span>
          {party('Ship To', row.shipToCode, o.receiver, row.deliveryWindow, true)}
        </div>
      </Panel>

      <Panel>
        <div className="grid grid-cols-3 gap-6 px-5 py-4">
          {([['Driver', row.assignedDriver], ['Helper(s)', ''], ['Asset', '']] as const).map(([k, v]) => (
            <div key={k}><Eyebrow>{k}</Eyebrow><p className="mt-1 text-[13px] font-bold text-ink">{v || '-'}</p></div>
          ))}
        </div>
      </Panel>

      <Panel>
        <div className="grid grid-cols-5 gap-6 px-5 pt-4">
          {([
            ['Active Leg', row.activeLeg || '—'], ['State', <StatusPill key="s" label={String(row.state)} tone={stateTone(String(row.state))} />],
            ['Carrier', row.carrier.toUpperCase()], ['Service', row.serviceType], ['Delivery Attempt', String(row.deliveryAttempts)],
          ] as [string, ReactNode][]).map(([k, v]) => (
            <div key={k} className="min-w-0"><Eyebrow>{k}</Eyebrow><p className="mt-1 text-[13px] font-bold text-ink">{v}</p></div>
          ))}
        </div>
        <div className="flex flex-wrap gap-2 px-5 py-4">
          <Chip icon={<List size={14} className="text-ink-3" />}>SKUs: {row.skuCount}</Chip>
          <Chip icon={<LayoutGrid size={14} className="text-ink-3" />}>Packages: {row.pieces}</Chip>
          <Chip icon={<Layers size={14} className="text-ink-3" />}>Pallets: {row.palletSpaces ?? 1}</Chip>
          <Chip icon={<Scale size={14} className="text-ink-3" />}>Weight: {kg(row.weightKg)}</Chip>
          <Chip icon={<Box size={14} className="text-ink-3" />}>Volume: {mm3(row.volumeMm3)}</Chip>
          <Chip tone="info" icon={row.orderTypeLabel === 'Reverse' ? <CornerUpLeft size={14} /> : <ArrowRight size={14} />}>{row.orderTypeLabel}</Chip>
          {row.flags.map((f) => <Chip key={f} tone="flag">{f}</Chip>)}
          {row.pickupRequestNumber && o.pickupRequestId && (
            <Link to={`/local/pickup/${o.pickupRequestId}`} className="inline-flex items-center gap-1.5 rounded-md border border-line bg-surface px-3 py-1.5 font-mono text-[12px] font-bold text-brand-500 hover:underline">
              <Truck size={14} />{row.pickupRequestNumber}
            </Link>
          )}
        </div>
      </Panel>

      <Panel>
        <div className="overflow-x-auto"><div className="min-w-[1180px]"><SimpleTable columns={cols} rows={pieces} rowKey={(p) => p.id} /></div></div>
      </Panel>
    </>
  )
}

/* --------------------------------------------------------------- Order --- */

function OrderSection({ row, o, scheduled }: { row: LocalConsignmentRow; o: GrowOrder; scheduled: boolean }) {
  const c = o.consignment
  return (
    <>
      <FoldCard title="Summary">
        <Pairs pairs={[
          ['Order Number', row.orderNumber], ['Reference Number', row.referenceNumber],
          ['Consignment Number', row.consignmentNumber], ['Consignment Type', c?.consignmentType || row.orderTypeLabel],
          ['Consignment State', String(row.state)], ['Exception State', dash(row.exception)],
          ['Carrier Code', dash(row.carrier).toUpperCase()], ['Merchant', row.merchant],
          ['Total Weight', kg(row.weightKg)], ['Total Volume', mm3(row.volumeMm3)],
          ['SKU Quantity', row.skuCount], ['Package Quantity', row.pieces],
          ['Service Type', row.serviceType], ['Payment Amount', `${o.currency} ${(c?.orderAmount ?? o.codAmount ?? 0).toLocaleString()}`],
          ['Cost Code', '—'], ['Current Facility', dash(row.shipFromCode)],
          ['Can be delivered in parts', c?.splittable ? 'Yes' : 'No'], ['Tags', dash([...(o.tags ?? []), row.tag].filter(Boolean).join(', '))],
          ['Scheduling Confirmation Required', c?.schedulingConfirmation ? 'Yes' : 'No'], ['Scheduling Confirmed', scheduled ? 'Yes' : '—'],
          ['Total Loading Time', c?.totalLoadingTime ? `${c.totalLoadingTime} min` : '—'],
        ]} />
      </FoldCard>
      <FoldCard title="Ship From">
        <Pairs pairs={partyPairs(o.sender, 'Sender Name', 'Planned Pickup Date/Time', row.pickupWindow?.start ?? '', 'Pickup Timezone', row.shipFromCode ?? '')} />
      </FoldCard>
      <FoldCard title="Ship To">
        <Pairs pairs={partyPairs(o.receiver, 'Receiver Name', 'Planned Delivery Date/Time', row.deliveryWindow?.start ?? '', 'Delivery Timezone', row.shipToCode ?? '')} />
      </FoldCard>
      <FoldCard title="Pre-Routing Details">
        <Pairs pairs={[
          ['Delivery Service Time', row.serviceTimeMin], ['Pickup Service Time', row.serviceTimeMin],
          ['Smart Service Time', '—'], ['Max Height', o.pkg.heightCm],
          ['Max Length', o.pkg.lengthCm], ['Pallets', row.palletSpaces ?? 1],
          ['Max Breadth', o.pkg.widthCm],
        ]} />
      </FoldCard>
    </>
  )
}

/* --------------------------------------------------------------- Piece --- */

function PieceSection({ row, o, pieces }: { row: LocalConsignmentRow; o: GrowOrder; pieces: PieceView[] }) {
  return (
    <>
      {pieces.map((p) => (
        <FoldCard key={p.id} title={`Id: ${p.id}`}>
          <Pairs pairs={[
            ['Tracking Number', p.trackingNumber], ['Storage Location', '—'],
            ['State', p.state], ['Exception State', dash(row.exception)],
            ['Type', p.type], ['Description', dash(p.skuDescription)],
            ['Value', `${o.currency} ${p.value.toLocaleString()}`], ['Current Facility', dash(row.shipFromCode)],
            ['Created Weight', kg(p.weightKg)], ['Created Volume', mm3(p.volumeMm3)],
            ['Weight', kg(p.weightKg)], ['Volume', mm3(p.volumeMm3)],
            ['Quantity', 1], ['SKU Quantity', p.skuQuantity],
            ['Length', `${o.pkg.lengthCm} cm`], ['Width', `${o.pkg.widthCm} cm`],
            ['Height', `${o.pkg.heightCm} cm`], ['Barcode', dash(o.trackingNumber === p.trackingNumber ? '' : '')],
            ['SKU Code', p.skuCode], ['Proof of Damage', '—'],
            ['Pallet Space', p.palletSpaces],
            ['Label Url', <button key="l" type="button" className="text-brand-500 hover:underline"
              onClick={() => toast.info('Demo only — labels are a platform service, not a local one.')}>Download Label</button>],
          ]} />
        </FoldCard>
      ))}
    </>
  )
}

/* ------------------------------------------------------------ Tracking --- */

function TrackingSection({ row, o }: { row: LocalConsignmentRow; o: GrowOrder }) {
  const pw = row.pickupWindow, dw = row.deliveryWindow
  return (
    <>
      <FoldCard title="Schedule">
        <Pairs pairs={[
          ['Ship By Date', dash(row.shipByDate)], ['Dispatch Date', stamp(row.dispatchDate)],
          ['Pickup Start Time', stamp(pw?.start)], ['Pickup End Time', stamp(pw?.end)],
          ['Pickup Timezone', TZ], ['Delivery Start Time', stamp(dw?.start)],
          ['Delivery End Time', stamp(dw?.end)], ['Delivery Timezone', TZ],
          ['Original Pickup Start Time', stamp(pw?.start)], ['Original Pickup End Time', stamp(pw?.end)],
          ['Original Delivery Start Time', stamp(dw?.start)], ['Original Delivery End Time', stamp(dw?.end)],
        ]} />
      </FoldCard>
      <FoldCard title="Charges & Pricing">
        {o.charges || o.codAmount > 0
          ? <Pairs pairs={[
            ['Payment Mode', o.paymentMode],
            ...(o.codAmount > 0 ? [['COD Amount', `${o.currency} ${o.codAmount.toLocaleString()}`] as Pair] : []),
            ...(o.charges ? [['Shipping', `${o.currency} ${o.charges.shipping.toLocaleString()}`] as Pair, ['Tax', `${o.currency} ${o.charges.tax.toLocaleString()}`] as Pair, ['Total', `${o.currency} ${o.charges.total.toLocaleString()}`] as Pair] : []),
          ]} />
          : <p className="px-5 py-10 text-center text-[13px] text-ink-3">No pricing information available</p>}
      </FoldCard>
      <FoldCard title="Carrier & Tracking Information">
        <Pairs pairs={[
          ['Carrier Code', dash(row.carrier).toUpperCase()], ['Carrier Name', dash(row.carrier)],
          ['Service Type', row.serviceType], ['Current Status', String(row.state)],
          ['Current Facility', dash(row.shipFromCode).toLowerCase()], ['Origin Depot', dash(row.shipFromCode).toLowerCase()],
          ['Destination Depot', dash(row.shipToCode).toLowerCase()], ['Type', 'Managed'],
          ['Master Tracking Number', dash(o.trackingNumber)], ['Manifest Number', '—'],
          ['Manifest Label', '—'], ['TAT Value', '—'],
          ['Rank', '—'], ['Rate Calculation Level', '—'],
          ['Tracking Url', <Link key="t" to={`/grow/orders/${o.id}`} className="text-brand-500 hover:underline">Track Order</Link>],
        ]} />
      </FoldCard>
    </>
  )
}

/* ----------------------------------------------------------------- SKU --- */

function SkuSection({ row, o, pieces }: { row: LocalConsignmentRow; o: GrowOrder; pieces: PieceView[] }) {
  const lines = skuLinesOf(o)
  return (
    <>
      {lines.map((it, i) => (
        <FoldCard key={`${it.skuCode}-${i}`} title={`SKU: ${it.skuCode || it.name}`}>
          <Pairs pairs={[
            ['SKU Code', dash(it.skuCode)], ['HSN Name', dash(it.category || it.hsnCode)],
            ['Product Name', dash(it.name)], ['Description', dash(it.description)],
            ['Line Item Number', `Line ${i + 1}`], ['Package', pieces[Math.min(i, pieces.length - 1)]?.id ?? '—'],
            ['Total Value', it.unitCost ? `${(it.unitCost * it.quantity).toLocaleString()}` : '—'], ['Unit Price', it.unitCost ? `${o.currency} ${it.unitCost.toLocaleString()}` : '—'],
            ['Weight per Unit', kg(it.weightKg)], ['Volume', it.lengthCm && it.widthCm && it.heightCm ? mm3(it.lengthCm * it.widthCm * it.heightCm * 1000) : '—'],
            ['Quantity', it.quantity], ['UOM', o.pkg.kind === 'Document' ? 'doc' : 'box'],
            ['Origin Country', dash(it.originCountry)], ['Length', it.lengthCm ? `${it.lengthCm} ${it.dimUom ?? 'cm'}` : '—'],
            ['Width', it.widthCm ? `${it.widthCm} ${it.dimUom ?? 'cm'}` : '—'], ['Height', it.heightCm ? `${it.heightCm} ${it.dimUom ?? 'cm'}` : '—'],
            ['Pickup Service Time', row.serviceTimeMin], ['Delivery Service Time', row.serviceTimeMin],
            ['Category', dash(it.category)],
            ['Image Url', it.imageUrl
              ? <a key="i" href={it.imageUrl} target="_blank" rel="noreferrer" className="text-brand-500 hover:underline">View Image</a>
              : '—'],
          ]} />
        </FoldCard>
      ))}
    </>
  )
}

/* ----------------------------------------------------------------- VAS --- */

function VasSection({ o, pieces }: { o: GrowOrder; pieces: PieceView[] }) {
  const lines = vasLinesOf(o, pieces)
  if (!lines.length) {
    return <Panel><EmptyState icon={<Wrench size={40} />} title="No Value Added Services" hint="VAS information will appear here when available" /></Panel>
  }
  return (
    <>
      {lines.map((v, i) => (
        <FoldCard key={`${v.code}-${i}`} title={`Value Added Service ${i + 1}: ${v.code}${v.piece ? ` (${v.piece})` : ''}`}>
          <Pairs pairs={[
            ['Service ID', dash(v.id)], ['Service Code', dash(v.code)],
            ['Service Name', dash(v.name)], ['Service Time', v.serviceTimeMin ? `${v.serviceTimeMin} min` : '—'],
            ['VAS Added Level', v.level], ['Status', 'Active'],
            ['Remarks', dash(v.remark)],
          ]} />
        </FoldCard>
      ))}
    </>
  )
}

/* ---------------------------------------------------------------- Load --- */

function LoadSection({ o }: { o: GrowOrder }) {
  const db = useGrowOrders()
  const plan = usePlanning()
  const loads = useMemo(() => loadsOf(o, plan, db), [o, plan, db])
  const [tab, setTab] = useState(loads.length - 1)
  const cur = loads[Math.min(tab, loads.length - 1)]
  return (
    <div>
      <Tabs tabs={loads.map((l) => l.leg)} active={Math.min(tab, loads.length - 1)} onChange={setTab} size="sm" />
      <div className="mt-3">
        {cur?.trip ? (
          <FoldCard title={<span className="flex items-center gap-2"><Truck size={16} className="text-ink-3" />Trip {cur.trip.id}</span>}>
            <Pairs pairs={[
              ['Trip', <Link key="t" to={`/local/control-tower/trips/${cur.trip.id}`} className="font-mono text-brand-500 hover:underline">{cur.trip.id}</Link>],
              ['Status', cur.trip.status],
              ['Driver', dash(cur.trip.driverName)], ['Vehicle', dash(cur.trip.vehicle)],
              ['Hub', cur.trip.hubCode], ['Date', cur.trip.date],
              ['Stops', cur.trip.stops.length], ['Carrier', dash(cur.trip.carrierName)],
              ...(cur.pr ? [['Pickup Request', <Link key="p" to={`/local/pickup/${cur.pr.id}`} className="font-mono text-brand-500 hover:underline">{cur.pr.number}</Link>] as Pair] : []),
            ]} />
          </FoldCard>
        ) : (
          <div className="rounded-xl border border-line bg-surface px-5 py-6 text-center text-[13px] text-ink-3 shadow-ds-1">
            {cur?.pr ? <>No load created · booked under <Link to={`/local/pickup/${cur.pr.id}`} className="font-mono font-bold text-brand-500 hover:underline">{cur.pr.number}</Link></> : 'No load created'}
          </div>
        )}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------- Attempt --- */

const OUTCOMES: (AttemptOutcome | 'All')[] = ['All', 'Success', 'Failed', 'Partial', 'Discarded']

function AttemptSection({ row, o }: { row: LocalConsignmentRow; o: GrowOrder }) {
  const db = useGrowOrders()
  const plan = usePlanning()
  const all = useMemo(() => attemptsOf(o, row, plan, db), [o, row, plan, db])
  const [kind, setKind] = useState(0)
  const [outcome, setOutcome] = useState<AttemptOutcome | 'All'>('All')
  const kinds = ['Delivery', 'Pickup', 'Service'] as const
  const ofKind = all.filter((a) => a.kind === kinds[kind])
  const shown = ofKind.filter((a) => outcome === 'All' || a.outcome === outcome)
  const count = (x: AttemptOutcome | 'All') => (x === 'All' ? ofKind.length : ofKind.filter((a) => a.outcome === x).length)
  return (
    <div>
      <Tabs tabs={[...kinds]} active={kind} onChange={(i) => { setKind(i); setOutcome('All') }} size="sm" icons={[Truck, Package, Wrench]} />
      <div className="mt-3 flex flex-wrap gap-2">
        {OUTCOMES.map((x) => (
          <button key={x} type="button" onClick={() => setOutcome(x)}
            className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[13px] ${
              outcome === x ? 'border-ink bg-warm-50 font-bold text-ink' : 'border-line bg-surface text-ink-2 hover:border-warm-300'}`}>
            {x}<span className="font-bold">{count(x)}</span>
          </button>
        ))}
      </div>
      <div className="mt-3 flex flex-col gap-3">
        {shown.length === 0
          ? <Panel><EmptyState icon={<ClipboardList size={40} />} title={`No ${kinds[kind].toLowerCase()} attempts yet`}
              hint={kinds[kind] === 'Service' ? 'Service attempts are not part of this network.' : 'Attempts appear here once a driver works the stop.'} /></Panel>
          : shown.map((a) => <AttemptCard key={`${a.kind}-${a.n}`} a={a} row={row} o={o} />)}
      </div>
    </div>
  )
}

function AttemptCard({ a, row, o }: { a: AttemptView; row: LocalConsignmentRow; o: GrowOrder }) {
  const [open, setOpen] = useState(true)
  const [pkgOpen, setPkgOpen] = useState<string | null>(a.packages[0] ?? null)
  const tone = a.outcome === 'Success' ? 'success' : a.outcome === 'Failed' ? 'danger' : a.outcome === 'In progress' ? 'info' : 'warning'
  return (
    <div className="rounded-xl border border-line bg-surface shadow-ds-1">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-3 px-5 py-3 text-left text-[13px] text-ink">
        <span className="font-bold">Attempt {String(a.n).padStart(2, '0')}</span>
        <span className="text-ink-3">·</span>
        <span className="flex items-center gap-1.5"><Package size={13} className="text-ink-3" />{a.packages.length} Packages</span>
        <span className="text-ink-3">·</span>
        <span className="flex items-center gap-1.5"><Calendar size={13} className="text-ink-3" />{stamp(a.at)}</span>
        <span className="ml-2"><StatusPill label={a.outcome} tone={tone} /></span>
        <ChevronDown size={18} className={`ml-auto text-ink-3 transition-transform ${open ? '' : '-rotate-90'}`} />
      </button>
      {open && (
        <div className="border-t border-line px-5 py-4">
          <div className="rounded-md border border-line">
            {a.packages.map((p) => (
              <div key={p}>
                <button type="button" onClick={() => setPkgOpen((v) => (v === p ? null : p))}
                  className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-[13px] text-ink">
                  <Package size={14} className="text-ink-3" />{p}
                  <span className="ml-2 flex gap-1.5">{row.flags.map((f) => <StatusPill key={f} label={f} tone="neutral" />)}</span>
                  <ChevronDown size={16} className={`ml-auto text-ink-3 transition-transform ${pkgOpen === p ? '' : '-rotate-90'}`} />
                </button>
                {pkgOpen === p && (
                  <div className="border-t border-line">
                    <Pairs pairs={[
                      ['Driver', dash(a.driver)], ['Trailer 1', '—'],
                      ['Trailer 2', '—'], ['ATA', a.outcome === 'In progress' ? '—' : stamp(a.at)],
                      ['ATC', a.outcome === 'Success' ? stamp(a.at) : '—'], ['State', a.state],
                      ['Type', a.kind], ['Total Quantity', o.pkg.count],
                      ['Actual Loading Quantity', a.outcome === 'Success' ? o.pkg.count : a.outcome === 'Failed' ? 0 : '—'], ['Weight', kg(row.weightKg)],
                      ['Volume', mm3(row.volumeMm3)], ['SKU Code', skuLinesOf(o)[0]?.skuCode ?? '—'],
                      ['Description', dash(a.reason)], ['Prime Mover', '—'],
                      ['Helper', dash(a.helper)], ['Shipment Key', row.consignmentNumber],
                      ['Product Name', dash(o.pkg.description)], ['Actual Quantity', a.outcome === 'Success' ? o.pkg.count : '—'],
                      ['Total Value', o.pkg.declaredValue ? `${o.currency} ${o.pkg.declaredValue.toLocaleString()}` : '—'], ['Dispatch Hub', dash(a.hub).toLowerCase()],
                      ...(a.tripId ? [['Trip', <Link key="t" to={`/local/control-tower/trips/${a.tripId}`} className="font-mono text-brand-500 hover:underline">{a.tripId}</Link>] as Pair] : []),
                    ]} />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

/* --------------------------------------------------------------- Notes --- */

function NotesSection({ o }: { o: GrowOrder }) {
  const plan = usePlanning()
  const [note, setNote] = useState('')
  const notes = plan.notes[o.id] ?? []
  const add = () => {
    if (!note.trim()) return
    planningActions.addNote(o.id, note.trim())
    setNote('')
    toast.success('Note added.')
  }
  return (
    <div className="flex min-h-[520px] flex-col">
      <div className="flex-1 rounded-xl border border-line bg-surface shadow-ds-1">
        {notes.length === 0
          ? <div className="flex h-full min-h-[420px] items-center justify-center rounded-xl bg-warm-25 text-[16px] font-bold text-ink-2">No Notes Available</div>
          : (
            <ul className="flex flex-col gap-2 p-4">
              {notes.map((n) => (
                <li key={n.at} className="rounded-md border border-line bg-warm-25 px-4 py-2.5">
                  <p className="text-[13px] text-ink">{n.text}</p>
                  <p className="mt-0.5 text-[12px] text-ink-3">{stamp(n.at)} · Ops</p>
                </li>
              ))}
            </ul>
          )}
      </div>
      <div className="mt-3 flex items-center gap-3 rounded-xl border border-line bg-surface px-5 py-3 shadow-ds-1">
        <div className="flex-1"><Input value={note} onChange={setNote} placeholder="Add Notes..." /></div>
        <IconButton icon={<ImageIcon size={16} />} title="Attach image (demo)" onClick={() => toast.info('Demo only — attachments are not stored locally.')} />
        <Button icon={<Send size={15} />} disabled={!note.trim()} onClick={add}>Send</Button>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------ Event log -- */

function EventLog({ groups }: { groups: EventGroup[] }) {
  const merchant = useMerchant()
  const [open, setOpen] = useState<Set<string>>(new Set())
  const [audience, setAudience] = useState<'Ops' | 'Customer'>('Ops')
  const allOpen = open.size === groups.length && groups.length > 0
  const toggle = (k: string) => setOpen((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n })
  /* the customer view is the milestone subset — one event per state */
  const shown = audience === 'Ops' || merchant ? groups : groups.filter((g) => g.state !== 'Notes').map((g) => ({ ...g, events: g.events.slice(0, 1) }))
  return (
    <aside className="flex w-[380px] shrink-0 flex-col border-l border-line bg-surface" aria-label="Event logs">
      <div className="px-5 pt-4 text-[15px] font-bold text-ink">Event Logs</div>
      <div className="flex items-center px-5 py-3">
        <button type="button" className="text-[13px] text-ink hover:text-brand-500"
          onClick={() => setOpen(allOpen ? new Set() : new Set(shown.map((g) => g.state)))}>{allOpen ? 'Collapse All' : 'Expand All'}</button>
        {/* the merchant's log is already the milestone reading — no Ops view to switch to */}
        {!merchant && <span className="ml-auto inline-flex overflow-hidden rounded-md border border-line">
          {(['Ops', 'Customer'] as const).map((a) => (
            <button key={a} type="button" onClick={() => setAudience(a)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-[13px] ${audience === a ? 'bg-warm-50 font-bold text-ink ring-1 ring-inset ring-ink' : 'text-ink-2'}`}>
              {a}{a === 'Ops' ? <Lock size={12} /> : <Globe size={12} />}
            </button>
          ))}
        </span>}
      </div>
      <ol className="relative flex-1 overflow-y-auto px-5 pb-6">
        <span className="absolute bottom-6 left-[27px] top-2 w-px border-l border-dashed border-warm-300" aria-hidden />
        {shown.map((g) => {
          const on = open.has(g.state)
          return (
            <li key={g.state} className="relative mb-3 pl-6">
              <span className="absolute left-0 top-3.5 h-3 w-3 rounded-full border-2 border-success-fg bg-surface" aria-hidden />
              <div className="rounded-lg bg-warm-50 px-3 py-2.5">
                <button type="button" onClick={() => toggle(g.state)} className="flex w-full items-center gap-1 text-left">
                  {on ? <ChevronDown size={14} className="text-ink-2" /> : <ChevronRight size={14} className="text-ink-2" />}
                  <span className="text-[13px] font-bold text-ink">{g.state}</span>
                  <span className="ml-auto flex items-center gap-1 text-[12px] text-ink-2"><List size={12} />Events: {g.events.length}</span>
                </button>
                <p className="mt-1 flex items-center gap-1 pl-5 text-[12px] text-ink-2">
                  <Calendar size={12} />Last Update:<span className="ml-auto">{stamp(g.at)}</span>
                </p>
                {on && (
                  <ul className="mt-2 flex flex-col gap-2 border-t border-line pt-2">
                    {g.events.map((e, i) => (
                      <li key={`${e.name}-${i}`} className="rounded-md bg-surface px-3 py-2 text-[12px] text-ink-2">
                        <p className="flex items-center gap-1.5 text-[13px] font-bold text-ink"><span className="h-1.5 w-1.5 rounded-full bg-success-fg" />{e.name}</p>
                        <p className="mt-0.5">Logged At: {stamp(e.at)}</p>
                        {e.user && <p>User: {e.user}</p>}
                        {e.detail && <p className="truncate" title={e.detail}>{e.detail}</p>}
                        <button type="button" className="mt-1 text-brand-500 hover:underline"
                          onClick={() => toast.info([e.name, stamp(e.at), e.user, e.detail].filter(Boolean).join(' · '))}>View Event Details</button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </li>
          )
        })}
        {shown.length === 0 && <li className="py-8 text-center text-[13px] text-ink-3">No events yet.</li>}
      </ol>
    </aside>
  )
}
