/**
 * The one pickup-request column set, cell-for-cell the console's
 * `/local/pickup` grid (spec §15) where the merchant has the data:
 * Reference · Status · Exception · Pickup window · Pickup address → hub ·
 * Shipments · Weight · Driver / Carrier · Trip. (The console's Merchant column
 * is dropped — this portal is one merchant.)
 *
 * Rendered by the page through the Nueva `DataTable`: this module hands back
 * `Column[]` plus the ⚙ chooser (persisted as `grow-pickup-columns-v1`); the
 * nine above are the default, Tags (of the contained shipments) · Source ·
 * Vehicle Type · Instructions · Created At are options. A column no request has
 * data for is hidden. Cell formatting comes from the console's own
 * `LocalPickup/prModel.ts`, so the two grids cannot drift.
 */
import { useMemo, type ReactNode } from 'react'
import { Settings2 } from 'lucide-react'
import { StatusPill, type Column } from '../../nueva/components'
import { ColumnChooser } from '../../local/chrome'
import type { GrowOrder, GrowPickupRequest, StoreLocation } from '../../growOrders/types'
import {
  consignmentsLabel, dropLabel, fmtDay, fmtWindow, reasonText, referenceChips, weightLabel, windowTag, type Tone,
} from '../LocalPickup/prModel'
import { prOutcomeLabel, pickupPointAddress, pickupPointName, useColumnPrefs } from './utils'
import { PrExecutionLine, PrStatusChip } from './pickupRequestTable'

/** The console's tone for each Exception flag (`prModel.statusTags`). */
const FLAG_TONE: Record<string, Tone> = {
  Overdue: 'danger', Discrepancy: 'danger', Duplicate: 'warning', 'Re-attempt available': 'info',
}

interface PrCtx {
  byId: Map<string, GrowOrder>; stores: StoreLocation[]
  exceptionsOf: (p: GrowPickupRequest) => string[]; tagsOf: (p: GrowPickupRequest) => string[]
}
interface PrCol {
  key: string; label: string; width?: number; align?: 'right'
  /** plain value: drives "has data" and the tooltip */
  value: (p: GrowPickupRequest, c: PrCtx) => string
  cell?: (p: GrowPickupRequest, c: PrCtx) => ReactNode
}
const none = <span className="text-ink-3">—</span>

const PR_COLUMNS: PrCol[] = [
  { key: 'reference', label: 'Reference', width: 120, value: (p) => p.number,
    cell: (p) => (
      <span className="block" title={`${p.number} · request id ${p.id}`}>
        <span className="block font-mono text-[12px] font-bold text-brand-500">{p.number}</span>
        <span className="mt-0.5 flex flex-wrap gap-1">
          {referenceChips(p).map((c) => <StatusPill key={c} label={c} tone={c === 'Reserved' ? 'info' : 'neutral'} />)}
        </span>
      </span>
    ) },
  /* Status = where the request is in its flow; Exception = what is wrong with it */
  { key: 'status', label: 'Status', width: 130, value: (p) => prOutcomeLabel(p),
    cell: (p) => <span className="block min-w-0"><PrStatusChip p={p} short /><PrExecutionLine p={p} /></span> },
  { key: 'exception', label: 'Exception', width: 130, value: (p, c) => [...c.exceptionsOf(p), reasonText(p)].filter(Boolean).join(', '),
    cell: (p, c) => {
      const flags = c.exceptionsOf(p)
      const reason = reasonText(p)
      if (!flags.length && !reason) return none
      return (
        <span className="block min-w-0">
          {flags.length > 0 && (
            <span className="flex flex-wrap gap-1">
              {flags.map((f) => <span key={f} className="max-w-full truncate"><StatusPill label={f} tone={FLAG_TONE[f] ?? 'warning'} /></span>)}
            </span>
          )}
          {reason && <span className="mt-0.5 block truncate text-[12px] text-ink-3" title={reason}>{reason}</span>}
        </span>
      )
    } },
  { key: 'window', label: 'Pickup window', width: 150, value: (p) => fmtWindow(p),
    cell: (p) => {
      const tag = windowTag(p)
      return <span className="block text-[12.5px]">{fmtWindow(p)}{tag && <span className="block text-[11.5px] text-ink-3">{tag}</span>}</span>
    } },
  /* no width: the flexible column that absorbs the remainder, as on the console */
  { key: 'shipFrom', label: 'Pickup address → hub', value: (p, c) => `${pickupPointName(p, c.stores)} · ${pickupPointAddress(p, c.stores)}`,
    cell: (p, c) => (
      <span className="block min-w-0">
        <span className="block truncate text-ink">{pickupPointName(p, c.stores)}</span>
        <span className="block truncate text-[12px] text-ink-3">→ {dropLabel(p, c.stores)}</span>
      </span>
    ) },
  { key: 'shipments', label: 'Shipments', width: 96, align: 'right', value: (p) => consignmentsLabel(p) },
  { key: 'weight', label: 'Weight', width: 100, align: 'right', value: (p, c) => { const w = weightLabel(p, c.byId); return w === '—' ? '' : w } },
  { key: 'collector', label: 'Driver / Carrier', width: 120, value: (p) => [p.driverName, p.carrierName].filter(Boolean).join(' · '),
    cell: (p) => (!p.driverName && !p.carrierName ? none : (
      <span className="block min-w-0">
        {p.driverName && <span className="block truncate">{p.driverName}</span>}
        {p.carrierName && <span className="block truncate text-[12px] text-ink-3">{p.carrierName}{p.carrierMode === 'CARRIER' ? ' · 3PL' : ''}</span>}
      </span>
    )) },
  { key: 'trip', label: 'Trip', width: 90, value: (p) => p.tripId ?? '',
    cell: (p) => (p.tripId ? <span className="font-mono text-[12px] font-bold text-ink-2">{p.tripId}</span> : none) },
  /* ---- optional ---- */
  { key: 'tags', label: 'Tags', width: 200, value: (p, c) => c.tagsOf(p).join(', '),
    cell: (p, c) => {
      const tags = c.tagsOf(p)
      if (!tags.length) return none
      return (
        <span className="flex min-w-0 items-center gap-1">
          {tags.slice(0, 2).map((t) => <span key={t} className="min-w-0 max-w-[92px] truncate"><StatusPill label={t} tone="warning" /></span>)}
          {tags.length > 2 && <span className="shrink-0 text-[11px] font-bold text-ink-3">+{tags.length - 2}</span>}
        </span>
      )
    } },
  { key: 'source', label: 'Source', width: 100, value: (p) => p.source },
  { key: 'vehicle', label: 'Vehicle Type', width: 130, value: (p) => p.vehicleType ?? '' },
  { key: 'instructions', label: 'Instructions', width: 220, value: (p) => p.instructions ?? '' },
  { key: 'createdAt', label: 'Created At', width: 120, value: (p) => fmtDay(p.createdAt.slice(0, 10)) },
]
const PR_DEFAULT_KEYS = ['reference', 'status', 'exception', 'window', 'shipFrom', 'shipments', 'weight', 'collector', 'trip']
const PR_ALL_KEYS = PR_COLUMNS.map((c) => c.key)

/**
 * The pickup-request grid's columns for a Nueva `DataTable`, plus its ⚙
 * chooser. `allRequests` decides which columns have any data at all.
 */
export function usePickupRequestColumns({ allRequests, orders, stores, exceptionsOf, tagsOf }: {
  allRequests: GrowPickupRequest[]
  orders: GrowOrder[]
  stores: StoreLocation[]
  /** The Exception column's flags for a request (the page owns duplicate detection). */
  exceptionsOf: (p: GrowPickupRequest) => string[]
  /** The tags of the shipments a request contains (the Tags column option). */
  tagsOf: (p: GrowPickupRequest) => string[]
}): { columns: Column[]; chooser: ReactNode } {
  const byId = useMemo(() => new Map(orders.map((o) => [o.id, o])), [orders])
  const ctx: PrCtx = { byId, stores, exceptionsOf, tagsOf }
  const [picked, setPicked] = useColumnPrefs('grow-pickup-columns-v1', PR_DEFAULT_KEYS, PR_ALL_KEYS)
  const withData = PR_COLUMNS.filter((c) => allRequests.some((p) => c.value(p, ctx)))
  const cols = withData.filter((c) => picked.includes(c.key))
  return {
    columns: cols.map((c) => ({
      key: c.key, label: c.label, width: c.width, align: c.align,
      render: (p: GrowPickupRequest) => {
        const v = c.value(p, ctx)
        /* a rich cell lays itself out (it may wrap, as the console's do); a plain value truncates */
        return c.cell
          ? <span className="block min-w-0" title={v || undefined}>{c.cell(p, ctx)}</span>
          : <span className="block min-w-0 truncate" title={v || undefined}>{v || none}</span>
      },
    })),
    chooser: (
      <ColumnChooser columns={withData} visible={cols.map((c) => c.key)} onChange={setPicked} onReset={() => setPicked(null)}>
        <Settings2 size={16} />
      </ColumnChooser>
    ),
  }
}
