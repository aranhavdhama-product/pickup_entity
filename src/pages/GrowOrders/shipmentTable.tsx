/**
 * The ONE shipments grid — column-configurable, from staging's consignment
 * column universe (`CONSIGNMENT_COLUMN_UNIVERSE` in nueva/ModuleDetail.tsx),
 * narrowed to what a SHIPPER cares about. Used by the Consignment Order page and
 * by Pickup Requests' "Eligible" view, so a shipment reads the same wherever it
 * is listed.
 *
 *  - DEFAULT columns = the console's / staging's default 18, in that order
 *    (owner, 2026-09-24): Order Number (→ forward / ↩ reverse) · Reference
 *    Number · State · Secondary State · Weight · Volume · Pallet Spaces · SKU ·
 *    Service Time (min) · Ship By Date · Ship to Name · Ship To Address ·
 *    Merchant · Assigned To Driver · Order Type · Created At · Ageing (days) ·
 *    Delivery Attempt Count;
 *  - OPTIONAL (the ⚙ chooser in the header): Exception · Tags · Service Type ·
 *    Carrier · Pickup Request · Delivery Window · Consignment Type · Total
 *    Quantity · SKU Codes · Tracking Number · Origin / Destination Facility ·
 *    Pickup Window · Payment Mode · COD Amount · Special Instructions ·
 *    Scheduling Confirmed;
 *  - a column no row has a value for is hidden, so the grid never shows a wall
 *    of dashes;
 *  - the choice persists per grid (`storageKey`) in localStorage.
 *
 * Rendered by the console's own Nueva `DataTable` (spec §15): this module only
 * turns the chosen columns into `Column[]` and hands back the ⚙ chooser (the
 * shared local-chrome `ColumnChooser`) for the page's filter line. With this
 * many columns the grid scrolls sideways inside its card, as the console's does.
 */
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, CircleAlert, CornerUpLeft, Settings2 } from 'lucide-react'
import { StatusPill, type Column } from '../../nueva/components'
import { ColumnChooser } from '../../local/chrome'
import { fmtDate, fmtDateTime, money, useColumnPrefs } from './utils'
import { stateChipTone, type ShipmentRow } from './shipmentRows'

/** Big numbers read compact in the grid (25.3M mm³, 40K kg); the exact value rides on the tooltip. */
const compact = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 })
const short = (n: number) => (n >= 10_000 ? compact.format(n) : n.toLocaleString())
const dash = <span className="text-ink-3">—</span>
const windowText = (w: { start: string; end: string } | null) =>
  w ? `${fmtDateTime(w.start)} → ${fmtDateTime(w.end)}` : ''

interface Col {
  key: string
  label: string
  width: number
  align?: 'right'
  /** the plain value — drives "has data" and the tooltip */
  value: (r: ShipmentRow) => string
  /** optional rich cell; defaults to the truncated value */
  cell?: (r: ShipmentRow) => ReactNode
}

function tagsCell(tags: string[]): ReactNode {
  if (!tags.length) return dash
  const shown = tags.slice(0, 2)
  return (
    <span className="flex min-w-0 items-center gap-1" title={tags.join(', ')}>
      {shown.map((t) => <span key={t} className="min-w-0 max-w-[92px] truncate"><StatusPill label={t} tone="warning" /></span>)}
      {tags.length > shown.length && <span className="shrink-0 text-[11px] font-bold text-ink-3">+{tags.length - shown.length}</span>}
    </span>
  )
}

const COLUMNS: Col[] = [
  { key: 'orderNumber', label: 'Order Number', width: 150, value: (r) => r.orderNumber,
    cell: (r) => (
      <span className="flex min-w-0 items-center gap-1" title={`${r.orderNumber} · ${r.orderTypeLabel}`}>
        {r.orderTypeLabel === 'Reverse'
          ? <CornerUpLeft size={14} className="shrink-0 text-ink-3" aria-label="Reverse" />
          : <ArrowRight size={14} className="shrink-0 text-ink-3" aria-label="Forward" />}
        <span className="truncate font-mono text-[12px] font-bold text-brand-500">{r.orderNumber || '—'}</span>
      </span>
    ) },
  { key: 'referenceNumber', label: 'Reference Number', width: 130, value: (r) => r.referenceNumber,
    cell: (r) => <span className="block truncate font-mono text-[12px] text-ink-2">{r.referenceNumber || '—'}</span> },
  { key: 'state', label: 'State', width: 120, value: (r) => r.state,
    cell: (r) => <StatusPill label={r.state} tone={stateChipTone(r.state)} /> },
  { key: 'secondaryState', label: 'Secondary State', width: 136, value: (r) => r.secondaryState },
  { key: 'activeLeg', label: 'Active Leg', width: 100, value: (r) => r.activeLeg },
  { key: 'exception', label: 'Exception', width: 150, value: (r) => r.exception,
    cell: (r) => (r.exception
      ? <span className="flex min-w-0 items-center gap-1 text-danger-fg" title={r.exception}>
          <CircleAlert size={15} className="shrink-0" /><span className="truncate">{r.exception}</span>
        </span>
      : dash) },
  { key: 'tags', label: 'Tags', width: 190, value: (r) => r.tags.join(', '), cell: (r) => tagsCell(r.tags) },
  { key: 'shipByDate', label: 'Ship By Date', width: 104, value: (r) => (r.shipByDate ? fmtDate(r.shipByDate) : '') },
  { key: 'serviceType', label: 'Service Type', width: 140, value: (r) => r.serviceType },
  { key: 'carrier', label: 'Carrier', width: 120, value: (r) => r.carrier },
  { key: 'shipToName', label: 'Ship to Name', width: 150, value: (r) => r.shipToName },
  { key: 'shipToAddress', label: 'Ship To Address', width: 230, value: (r) => r.address },
  { key: 'weight', label: 'Weight', width: 84, align: 'right', value: (r) => `${r.weightKg.toLocaleString()} kg`,
    cell: (r) => `${short(r.weightKg)} kg` },
  { key: 'volume', label: 'Volume', width: 104, align: 'right', value: (r) => `${r.volumeMm3.toLocaleString()} mm³`,
    cell: (r) => <>{short(r.volumeMm3)}<span className="text-[11px] text-ink-3"> mm³</span></> },
  { key: 'palletSpace', label: 'Pallet Spaces', width: 100, align: 'right', value: (r) => String(r.palletSpaces ?? 1) },
  { key: 'sku', label: 'SKU', width: 70, align: 'right', value: (r) => String(r.skuCount) },
  { key: 'serviceTime', label: 'Service Time (min)', width: 124, align: 'right', value: (r) => String(r.serviceTimeMin) },
  { key: 'merchant', label: 'Merchant', width: 150, value: (r) => r.merchant },
  { key: 'assignedDriver', label: 'Assigned To Driver', width: 150, value: (r) => r.assignedDriver },
  { key: 'pickupRequest', label: 'Pickup Request', width: 120, value: (r) => r.pickupRequestNumber,
    cell: (r) => (r.order.pickupRequestId && r.pickupRequestNumber
      ? <Link to={`/grow/orders/pickups/${r.order.pickupRequestId}`} onClick={(e) => e.stopPropagation()}
          className="truncate font-mono text-[12px] font-bold text-brand-500 hover:text-brand-600">{r.pickupRequestNumber}</Link>
      : dash) },
  { key: 'deliveryWindow', label: 'Delivery Window', width: 250, value: (r) => windowText(r.deliveryWindow) },
  { key: 'attempts', label: 'Delivery Attempt Count', width: 130, align: 'right', value: (r) => String(r.deliveryAttempts) },
  { key: 'createdAt', label: 'Created At', width: 104, value: (r) => fmtDate(r.order.createdAt),
    cell: (r) => (
      <>
        <span className="block truncate">{fmtDate(r.order.createdAt)}</span>
        <span className="block truncate text-[12px] text-ink-3">{r.ageingDays} day{r.ageingDays === 1 ? '' : 's'} ago</span>
      </>
    ) },
  /* ---- optional ---- */
  { key: 'consignmentType', label: 'Consignment Type', width: 140, value: (r) => r.taskType,
    cell: (r) => (
      <>
        <span className="block truncate">{r.taskType}</span>
        <span className="block truncate text-[12px] text-ink-3">{r.legChain} · {r.order.shipmentType === 'FTL' ? 'FTL' : 'LTL'}</span>
      </>
    ) },
  { key: 'orderType', label: 'Order Type', width: 100, value: (r) => r.orderTypeLabel },
  { key: 'totalQuantity', label: 'Total Quantity', width: 96, align: 'right', value: (r) => String(r.pieces) },
  { key: 'skuCodes', label: 'SKU Codes', width: 150,
    value: (r) => [...new Set((r.order.pkg.items ?? []).map((i) => i.skuCode ?? '').filter(Boolean))].join(', ') },
  { key: 'trackingNumber', label: 'Tracking Number', width: 140, value: (r) => r.order.trackingNumber },
  { key: 'originFacility', label: 'Origin Facility', width: 170, value: (r) => r.origin },
  { key: 'destinationFacility', label: 'Destination Facility', width: 170, value: (r) => r.destination },
  { key: 'pickupWindow', label: 'Pickup Window', width: 250, value: (r) => windowText(r.pickupWindow) },
  { key: 'paymentMode', label: 'Payment Mode', width: 110, value: (r) => r.order.paymentMode },
  { key: 'codAmount', label: 'COD Amount', width: 110, align: 'right',
    value: (r) => (r.order.codAmount > 0 ? money(r.order.codAmount) : '') },
  { key: 'specialInstructions', label: 'Special Instructions', width: 220, value: (r) => r.specialInstructions },
  { key: 'schedulingConfirmed', label: 'Scheduling Confirmed', width: 110,
    value: (r) => (r.secondaryState === 'Scheduled' ? 'Yes' : '') },
  { key: 'ageing', label: 'Ageing (days)', width: 100, align: 'right', value: (r) => String(r.ageingDays) },
]

/* the console's default 18, in staging's order */
const DEFAULT_KEYS = [
  'orderNumber', 'referenceNumber', 'state', 'secondaryState', 'activeLeg', 'weight', 'volume', 'palletSpace', 'sku',
  'serviceTime', 'shipByDate', 'shipToName', 'shipToAddress', 'merchant', 'assignedDriver', 'orderType',
  'createdAt', 'ageing', 'attempts',
]
const ALL_KEYS = COLUMNS.map((c) => c.key)

/** Every row cell is truncated to its column; the plain value rides on the tooltip. */
function cellOf(c: Col): Column {
  return {
    key: c.key, label: c.label, align: c.align,
    /* DataTable pads 16px a side — the widths above were budgeted for 10px */
    width: c.width + 12,
    render: (r: ShipmentRow) => {
      const v = c.value(r)
      return (
        <span className="block min-w-0 truncate" title={v || undefined}>
          {c.cell ? c.cell(r) : v || dash}
        </span>
      )
    },
  }
}

/**
 * The shipments grid's columns for a Nueva `DataTable`, plus its ⚙ chooser.
 * `dataRows` = the whole list: a column no row has a value for is neither shown
 * nor offered. The choice persists under `storageKey`.
 */
export function useShipmentColumns(storageKey: string, dataRows: ShipmentRow[]): { columns: Column[]; chooser: ReactNode } {
  const [picked, setPicked] = useColumnPrefs(storageKey, DEFAULT_KEYS, ALL_KEYS)
  /* the default set leads in staging's order; the optional columns follow in their own */
  const rank = (k: string) => { const i = DEFAULT_KEYS.indexOf(k); return i === -1 ? DEFAULT_KEYS.length + ALL_KEYS.indexOf(k) : i }
  const withData = COLUMNS.filter((c) => dataRows.some((r) => c.value(r))).sort((a, b) => rank(a.key) - rank(b.key))
  const cols = withData.filter((c) => picked.includes(c.key))
  return {
    columns: cols.map(cellOf),
    chooser: (
      <ColumnChooser columns={withData} visible={cols.map((c) => c.key)} onChange={setPicked} onReset={() => setPicked(null)}>
        <Settings2 size={16} />
      </ColumnChooser>
    ),
  }
}
