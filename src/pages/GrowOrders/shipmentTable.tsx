/**
 * The ONE shipments grid — column-configurable, from staging's consignment
 * column universe (`CONSIGNMENT_COLUMN_UNIVERSE` in nueva/ModuleDetail.tsx),
 * narrowed to what a SHIPPER cares about. Used by the Consignment Order page and
 * by Pickup Requests' "Eligible" view, so a shipment reads the same wherever it
 * is listed.
 *
 *  - DEFAULT columns: Order Number (→ forward / ↩ reverse) · Reference Number ·
 *    State · Secondary State · Exception · Tags · Ship By Date · Service Type ·
 *    Carrier · Ship To Name · Ship To Address · Weight · Volume · Pallet Space ·
 *    Pickup Request · Delivery Window · Attempts · Created At;
 *  - OPTIONAL (the ⚙ chooser in the header): Consignment Type · Order Type ·
 *    Total Quantity · SKU Codes · Tracking Number · Origin / Destination
 *    Facility · Pickup Window · Payment Mode · COD Amount · Special
 *    Instructions · Scheduling Confirmed · Ageing;
 *  - a column no row has a value for is hidden (e.g. Attempts: the local store
 *    records no delivery attempts), so the grid never shows a wall of dashes;
 *  - the choice persists per grid (`storageKey`) in localStorage.
 *
 * With this many columns the grid scrolls sideways inside its card, as the
 * console's does; the checkbox and Order Number stay pinned on the left.
 */
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, CircleAlert, CornerUpLeft } from 'lucide-react'
import { Checkbox, Chip, ColumnChooser, TABLE_HEAD_ROW, TABLE_ROW, TABLE_ROW_SELECTED, TABLE_TH } from './ui'
import { fmtDate, fmtDateTime, money, useColumnPrefs } from './utils'
import { stateChipTone, type ShipmentRow } from './shipmentRows'

/** Big numbers read compact in the grid (25.3M mm³, 40K kg); the exact value rides on the tooltip. */
const compact = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 })
const short = (n: number) => (n >= 10_000 ? compact.format(n) : n.toLocaleString())
const dash = <span className="text-grow-ink-3">—</span>
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

function Tags({ tags }: { tags: string[] }) {
  if (!tags.length) return dash
  const shown = tags.slice(0, 2)
  return (
    <span className="flex min-w-0 items-center gap-1" title={tags.join(', ')}>
      {shown.map((t) => <Chip key={t} tone="warning" className="max-w-[92px] truncate">{t}</Chip>)}
      {tags.length > shown.length && <span className="shrink-0 text-[11px] font-semibold text-grow-ink-2">+{tags.length - shown.length}</span>}
    </span>
  )
}

const COLUMNS: Col[] = [
  { key: 'orderNumber', label: 'Order Number', width: 150, value: (r) => r.orderNumber,
    cell: (r) => (
      <span className="flex min-w-0 items-center gap-1" title={`${r.orderNumber} · ${r.orderTypeLabel}`}>
        {r.orderTypeLabel === 'Reverse'
          ? <CornerUpLeft size={14} className="shrink-0 text-grow-ink-2" aria-label="Reverse" />
          : <ArrowRight size={14} className="shrink-0 text-grow-ink-2" aria-label="Forward" />}
        <span className="truncate font-medium text-grow-accent-2">{r.orderNumber || '—'}</span>
      </span>
    ) },
  { key: 'referenceNumber', label: 'Reference Number', width: 130, value: (r) => r.referenceNumber },
  { key: 'state', label: 'State', width: 120, value: (r) => r.state,
    cell: (r) => <span className="flex min-w-0"><Chip tone={stateChipTone(r.state)}>{r.state}</Chip></span> },
  { key: 'secondaryState', label: 'Secondary State', width: 136, value: (r) => r.secondaryState },
  { key: 'exception', label: 'Exception', width: 150, value: (r) => r.exception,
    cell: (r) => (r.exception
      ? <span className="flex min-w-0 items-center gap-1 text-grow-error" title={r.exception}>
          <CircleAlert size={15} className="shrink-0" /><span className="truncate">{r.exception}</span>
        </span>
      : dash) },
  { key: 'tags', label: 'Tags', width: 190, value: (r) => r.tags.join(', '), cell: (r) => <Tags tags={r.tags} /> },
  { key: 'shipByDate', label: 'Ship By Date', width: 104, value: (r) => (r.shipByDate ? fmtDate(r.shipByDate) : '') },
  { key: 'serviceType', label: 'Service Type', width: 140, value: (r) => r.serviceType },
  { key: 'carrier', label: 'Carrier', width: 120, value: (r) => r.carrier },
  { key: 'shipToName', label: 'Ship To Name', width: 150, value: (r) => r.shipToName },
  { key: 'shipToAddress', label: 'Ship To Address', width: 230, value: (r) => r.address },
  { key: 'weight', label: 'Weight', width: 84, align: 'right', value: (r) => `${r.weightKg.toLocaleString()} kg`,
    cell: (r) => `${short(r.weightKg)} kg` },
  { key: 'volume', label: 'Volume', width: 104, align: 'right', value: (r) => `${r.volumeMm3.toLocaleString()} mm³`,
    cell: (r) => <>{short(r.volumeMm3)}<span className="text-[11px] text-grow-ink-2"> mm³</span></> },
  { key: 'palletSpace', label: 'Pallet Space', width: 84, align: 'right', value: (r) => String(r.palletSpaces ?? 1) },
  { key: 'pickupRequest', label: 'Pickup Request', width: 120, value: (r) => r.pickupRequestNumber,
    cell: (r) => (r.order.pickupRequestId && r.pickupRequestNumber
      ? <Link to={`/grow/orders/pickups/${r.order.pickupRequestId}`} onClick={(e) => e.stopPropagation()}
          className="truncate text-grow-accent-2 hover:underline">{r.pickupRequestNumber}</Link>
      : dash) },
  { key: 'deliveryWindow', label: 'Delivery Window', width: 250, value: (r) => windowText(r.deliveryWindow) },
  /* the local store records no delivery attempts — hidden until a row has one */
  { key: 'attempts', label: 'Attempts', width: 84, align: 'right', value: () => '' },
  { key: 'createdAt', label: 'Created At', width: 104, value: (r) => fmtDate(r.order.createdAt),
    cell: (r) => (
      <>
        <span className="block truncate">{fmtDate(r.order.createdAt)}</span>
        <span className="block truncate text-[12px] text-grow-ink-2">{r.ageingDays} day{r.ageingDays === 1 ? '' : 's'} ago</span>
      </>
    ) },
  /* ---- optional ---- */
  { key: 'consignmentType', label: 'Consignment Type', width: 140, value: (r) => r.taskType,
    cell: (r) => (
      <>
        <span className="block truncate">{r.taskType}</span>
        <span className="block truncate text-[12px] text-grow-ink-2">{r.legChain} · {r.order.shipmentType === 'FTL' ? 'FTL' : 'LTL'}</span>
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
  { key: 'ageing', label: 'Ageing', width: 84, align: 'right', value: (r) => `${r.ageingDays} d` },
]

const DEFAULT_KEYS = [
  'orderNumber', 'referenceNumber', 'state', 'secondaryState', 'exception', 'tags', 'shipByDate', 'serviceType',
  'carrier', 'shipToName', 'shipToAddress', 'weight', 'volume', 'palletSpace', 'pickupRequest', 'deliveryWindow',
  'attempts', 'createdAt',
]
const ALL_KEYS = COLUMNS.map((c) => c.key)

export function ShipmentTable({ rows, dataRows, storageKey, selected, onToggle, onToggleAll, onRowClick, rowRef, empty }: {
  /** the page being shown */
  rows: ShipmentRow[]
  /** the whole list — decides which columns have any data at all */
  dataRows: ShipmentRow[]
  /** where this grid's column choice is persisted */
  storageKey: string
  selected: Set<string>
  onToggle: (id: string, v: boolean) => void
  onToggleAll: (v: boolean) => void
  onRowClick: (r: ShipmentRow) => void
  rowRef?: (id: string, el: HTMLTableRowElement | null) => void
  empty: ReactNode
}) {
  const [picked, setPicked] = useColumnPrefs(storageKey, DEFAULT_KEYS, ALL_KEYS)
  /* a column without a single value anywhere is hidden, and not offered either */
  const withData = COLUMNS.filter((c) => dataRows.some((r) => c.value(r)))
  const cols = withData.filter((c) => picked.includes(c.key))
  const allChecked = rows.length > 0 && rows.every((r) => selected.has(r.orderId))
  const someChecked = rows.some((r) => selected.has(r.orderId))
  const width = 52 + cols.reduce((n, c) => n + c.width, 0) + 44
  /* the checkbox + first column stay put while the rest scrolls */
  const pin = (i: number) => (i === 0 ? 'sticky left-[52px] z-[1] bg-inherit' : '')

  return (
    /* the chooser sits OUTSIDE the scroller, so its popover is never clipped */
    <div className="relative">
      <div className="absolute right-1.5 top-[11px] z-[3]">
        <ColumnChooser columns={withData} visible={cols.map((c) => c.key)}
          onChange={setPicked} onReset={() => setPicked(null)} />
      </div>
      <div className="overflow-x-auto">
      <table className="table-fixed border-collapse text-[13px] text-grow-ink" style={{ width: Math.max(width, 0), minWidth: '100%' }}>
        <colgroup>
          <col style={{ width: 52 }} />
          {cols.map((c) => <col key={c.key} style={{ width: c.width }} />)}
          <col style={{ width: 44 }} />
        </colgroup>
        <thead>
          <tr className={TABLE_HEAD_ROW}>
            <th className="sticky left-0 z-[1] bg-grow-thead px-1">
              <Checkbox checked={allChecked} indeterminate={!allChecked && someChecked} onChange={onToggleAll} ariaLabel="Select all" />
            </th>
            {cols.map((c, i) => (
              <th key={c.key} className={`${TABLE_TH} !whitespace-normal !px-2.5 leading-tight ${c.align === 'right' ? 'text-right' : ''} ${i === 0 ? 'sticky left-[52px] z-[1] bg-grow-thead' : ''}`}>{c.label}</th>
            ))}
            {/* room for the chooser, pinned right */}
            <th className="sticky right-0 z-[2] bg-grow-thead" aria-label="Columns" />
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr><td colSpan={cols.length + 2} className="h-[240px] px-6 text-left text-[14px] text-grow-ink-2">
              <span className="sticky left-6 block max-w-[1000px] text-center">{empty}</span>
            </td></tr>
          )}
          {rows.map((r) => (
            <tr key={r.orderId} ref={(el) => rowRef?.(r.orderId, el)} onClick={() => onRowClick(r)}
              className={`${TABLE_ROW} ${selected.has(r.orderId) ? TABLE_ROW_SELECTED : 'bg-white'}`}>
              <td className="sticky left-0 z-[1] bg-inherit px-1" onClick={(e) => e.stopPropagation()}>
                <Checkbox checked={selected.has(r.orderId)} onChange={(v) => onToggle(r.orderId, v)} ariaLabel={`Select ${r.orderNumber}`} />
              </td>
              {cols.map((c, i) => {
                const v = c.value(r)
                return (
                  <td key={c.key} title={v || undefined}
                    className={`truncate px-2.5 py-2 ${c.align === 'right' ? 'text-right' : ''} ${pin(i)}`}>
                    {c.cell ? c.cell(r) : v || dash}
                  </td>
                )
              })}
              <td />
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  )
}
