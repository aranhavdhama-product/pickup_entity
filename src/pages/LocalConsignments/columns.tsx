/**
 * The Consignment Order grid's columns — ONE definition, shared by
 * `/local/consignments` and the Pickup page's `Eligible for Pickup` tab, so a
 * consignment reads the same wherever it is listed.
 *
 * DEFAULT = staging's own default set, in its order (owner, 2026-09-24):
 * Order Number · Reference Number · State · Secondary State · Weight · Volume ·
 * Pallet Spaces · SKU · Service Time (min) · Ship By Date · Ship to Name ·
 * Ship To Address · Merchant · Assigned To Driver · Order Type · Created At ·
 * Ageing (days) · Delivery Attempt Count. Everything else sits behind the ⚙
 * chooser; the choice persists per grid (`storageKey`). With this many columns
 * the grid scrolls sideways inside its card, as staging's does.
 */
import type { ReactNode } from 'react'
import { Settings2 } from 'lucide-react'
import { StatusPill, type Column } from '../../nueva/components'
import { ColumnChooser } from '../../local/chrome'
import { useColumnPrefs } from '../../local/columnPrefs'
import { stateTone, type LocalConsignmentRow } from '../LocalPFP/adapter'
import { stamp } from '../LocalPFP/overlayFormat'

export interface ConsignmentColumnDef {
  key: string
  label: string
  width: number
  align?: 'right'
  defaultOn?: boolean
  /** the plain value — drives the tooltip and the CSV-style fallback */
  value: (r: LocalConsignmentRow) => string
  /** optional rich cell; defaults to the truncated value */
  cell?: (r: LocalConsignmentRow) => ReactNode
}

const dash = <span className="text-ink-3">—</span>
const mono = (v: string, strong = false) => (
  <span className={`font-mono text-[12px] ${strong ? 'font-bold text-brand-500' : 'text-ink-2'}`}>{v || '—'}</span>
)

export const CONSIGNMENT_COLUMN_DEFS: ConsignmentColumnDef[] = [
  /* ---- staging's default set, in its order ---- */
  { key: 'consignmentNumber', label: 'Order Number', width: 150, defaultOn: true,
    value: (r) => r.consignmentNumber || '', cell: (r) => mono(r.consignmentNumber || '', true) },
  { key: 'referenceNumber', label: 'Reference Number', width: 140, defaultOn: true,
    value: (r) => r.referenceNumber || '', cell: (r) => mono(r.referenceNumber || '') },
  { key: 'state', label: 'State', width: 130, defaultOn: true,
    value: (r) => String(r.state), cell: (r) => <StatusPill label={String(r.state)} tone={stateTone(String(r.state))} /> },
  { key: 'secondaryState', label: 'Secondary State', width: 150, defaultOn: true, value: (r) => r.secondaryState },
  { key: 'weight', label: 'Weight', width: 96, align: 'right', defaultOn: true, value: (r) => `${r.weightKg} kg` },
  { key: 'volume', label: 'Volume', width: 130, align: 'right', defaultOn: true, value: (r) => `${r.volumeMm3.toLocaleString()} mm³` },
  { key: 'palletSpaces', label: 'Pallet Spaces', width: 104, align: 'right', defaultOn: true, value: (r) => String(r.palletSpaces ?? 1) },
  { key: 'sku', label: 'SKU', width: 72, align: 'right', defaultOn: true, value: (r) => String(r.skuCount) },
  { key: 'serviceTime', label: 'Service Time (min)', width: 130, align: 'right', defaultOn: true, value: (r) => String(r.serviceTimeMin) },
  { key: 'shipByDate', label: 'Ship By Date', width: 112, defaultOn: true, value: (r) => r.shipByDate },
  { key: 'shipToName', label: 'Ship to Name', width: 150, defaultOn: true, value: (r) => r.shipToName || '' },
  { key: 'shipToAddress', label: 'Ship To Address', width: 260, defaultOn: true, value: (r) => r.address },
  { key: 'merchant', label: 'Merchant', width: 150, defaultOn: true, value: (r) => r.merchant },
  { key: 'assignedDriver', label: 'Assigned To Driver', width: 150, defaultOn: true, value: (r) => r.assignedDriver },
  { key: 'orderType', label: 'Order Type', width: 100, defaultOn: true, value: (r) => r.orderTypeLabel },
  { key: 'createdAt', label: 'Created At', width: 170, defaultOn: true, value: (r) => stamp(r.order.createdAt) },
  { key: 'ageing', label: 'Ageing (days)', width: 104, align: 'right', defaultOn: true, value: (r) => String(r.ageingDays) },
  { key: 'deliveryAttempts', label: 'Delivery Attempt Count', width: 140, align: 'right', defaultOn: true, value: (r) => String(r.deliveryAttempts) },
  /* ---- optional ---- */
  { key: 'exception', label: 'Exception', width: 160, value: (r) => r.exception },
  { key: 'type', label: 'Type', width: 130, value: (r) => r.taskType },
  { key: 'carrier', label: 'Carrier', width: 130, value: (r) => r.carrier || '' },
  { key: 'serviceType', label: 'Service Type', width: 140, value: (r) => r.serviceType || '' },
  { key: 'pickupRequest', label: 'Pickup Request', width: 120, value: (r) => r.pickupRequestNumber,
    cell: (r) => mono(r.pickupRequestNumber, true) },
  { key: 'tags', label: 'Tags', width: 160, value: (r) => r.tag },
  { key: 'origin', label: 'Origin Facility', width: 170, value: (r) => r.origin || '' },
  { key: 'destination', label: 'Destination Facility', width: 170, value: (r) => r.destination || '' },
  { key: 'trackingNumber', label: 'Tracking Number', width: 150, value: (r) => r.order.trackingNumber || '' },
  { key: 'specialInstructions', label: 'Special Instructions', width: 220, value: (r) => r.specialInstructions },
]

const DEFAULT_KEYS = CONSIGNMENT_COLUMN_DEFS.filter((c) => c.defaultOn).map((c) => c.key)
const ALL_KEYS = CONSIGNMENT_COLUMN_DEFS.map((c) => c.key)

/** Every cell is truncated to its column; the plain value rides on the tooltip. */
function columnOf(c: ConsignmentColumnDef): Column {
  return {
    key: c.key, label: c.label, align: c.align,
    /* DataTable pads 16px a side — the widths above were budgeted for 10px */
    width: c.width + 12,
    render: (r: LocalConsignmentRow) => {
      const v = c.value(r)
      return (
        <span className="block min-w-0 truncate" title={v || undefined}>
          {c.cell ? c.cell(r) : v || dash}
        </span>
      )
    },
  }
}

/** The default grid, for anything that renders the columns without a chooser. */
export const consignmentColumns: Column[] = CONSIGNMENT_COLUMN_DEFS.filter((c) => c.defaultOn).map(columnOf)

/** The grid's columns for a Nueva `DataTable`, plus its ⚙ chooser; the choice persists under `storageKey`. */
export function useConsignmentColumns(storageKey: string): { columns: Column[]; chooser: ReactNode } {
  const [picked, setPicked] = useColumnPrefs(storageKey, DEFAULT_KEYS, ALL_KEYS)
  const cols = CONSIGNMENT_COLUMN_DEFS.filter((c) => picked.includes(c.key))
  return {
    columns: cols.map(columnOf),
    chooser: (
      <ColumnChooser columns={CONSIGNMENT_COLUMN_DEFS} visible={cols.map((c) => c.key)} onChange={setPicked} onReset={() => setPicked(null)}>
        <Settings2 size={16} />
      </ColumnChooser>
    ),
  }
}
