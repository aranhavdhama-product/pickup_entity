/**
 * The one pickup-request grid, in the console's column order:
 * Reference · Status · Exception · Pickup Window · Ship From → hub · Shipments ·
 * Weight · Driver / Carrier · Trip.
 *
 * Column-configurable (⚙ chooser, persisted as `grow-pickup-columns-v1`): the
 * nine above are the default; Tags (of the contained shipments) · Source ·
 * Vehicle Type · Instructions · Created At are options. A column no request has
 * data for is hidden.
 *
 * Deliberate shapes:
 *  - **Status** is the outcome-aware chip (`PrStatusChip`) plus the execution
 *    line (who is on the way / handed over / in transit to hub).
 *  - **Exception** lists what needs attention — Overdue, Discrepancy, Duplicate,
 *    Re-attempt available — as the page's Exception filter speaks them.
 *  - **Shipments** is a COUNT; a reserved request shows `n / expected`.
 *  - Every derived value comes from `orderIds`, not from the orders' own
 *    `pickupRequestId`, so a cancelled or failed request still shows what it covered.
 *
 * `PrStatusChip` / `PrExecutionLine` are also used by the request's own page.
 */
import { useMemo, type ReactNode } from 'react'
import { CircleAlert } from 'lucide-react'
import type { GrowOrder, GrowPickupRequest, PickupRequestStatus, StoreLocation } from '../../growOrders/types'
import { atParts, isHandedOver } from '../../growOrders/tabs'
import { hubName } from '../../growOrders/hubs'
import { Checkbox, Chip, ColumnChooser, TABLE_HEAD_ROW, TABLE_ROW, TABLE_ROW_SELECTED, TABLE_TH, type ChipTone } from './ui'
import {
  PARTIALLY_PICKED, PR_STATUS_TONE, fmtDay, prDisplayWeight, prOrders, prOutcomeLabel,
  prOutcomeWords, prSpan, prWindow, pickupPointAddress, pickupPointName, useColumnPrefs,
} from './utils'
import { collectorLine, isInTransitToHub } from './pickupGate'

export interface PickupRequestTableProps {
  requests: GrowPickupRequest[]
  orders: GrowOrder[]
  stores: StoreLocation[]
  /** Every request on the page's list — decides which columns have data at all. */
  allRequests: GrowPickupRequest[]
  /** The Exception column's flags for a request (the page owns duplicate detection). */
  exceptionsOf: (p: GrowPickupRequest) => string[]
  /** The tags of the shipments a request contains (the Tags column option). */
  tagsOf: (p: GrowPickupRequest) => string[]
  selected: Set<string>
  onToggle: (id: string, v: boolean) => void
  onToggleAll: (v: boolean) => void
  onRowClick: (p: GrowPickupRequest) => void
  /** Lets the page measure a row, so the selection popup can line up with it. */
  rowRef?: (id: string, el: HTMLTableRowElement | null) => void
  emptyText?: string
}

/** The one status whose full name cannot fit a chip in a 170px column. */
const SHORT_STATUS: Partial<Record<PickupRequestStatus, string>> = {
  'Ready For Last Mile Dispatch': 'Ready For Dispatch',
}

/**
 * The window and nothing else: one line when it opens and closes on the same day,
 * two when it does not — a 200px column cannot hold '19/09/2026 21:00 -
 * 20/09/2026 02:00'. How LONG it runs is a detail-page fact.
 */
function Window({ p }: { p: GrowPickupRequest }) {
  const [sd, st] = atParts(p.startAt)
  const [ed, et] = atParts(p.endAt)
  const full = prWindow(p)
  if (prSpan(p).sameDay) return <span className="block truncate" title={full}>{full}</span>
  return (
    <>
      <span className="block truncate" title={full}>{`${fmtDay(sd)} ${st}`}</span>
      <span className="block truncate text-[12px] text-grow-ink-2" title={full}>{`→ ${fmtDay(ed)} ${et}`}</span>
    </>
  )
}

/**
 * The ONE status chip a pickup request shows anywhere. It is outcome-aware:
 * a completed pickup that left orders behind reads **Partially picked** rather
 * than a green `Completed`, and any overage scans hang a small `+n` badge off
 * the chip's right edge. The full numbers are on the tooltip.
 */
export function PrStatusChip({ p, short = false }: { p: GrowPickupRequest; short?: boolean }) {
  const label = prOutcomeLabel(p)
  const partial = label === PARTIALLY_PICKED
  const tone: ChipTone = partial ? 'warning' : PR_STATUS_TONE[p.status]
  const text = partial ? label : (short && SHORT_STATUS[p.status]) || label
  const n = p.overages.length
  return (
    <span className="inline-flex min-w-0 items-center" title={prOutcomeWords(p) || p.status}>
      <Chip tone={tone}>{text}</Chip>
      {n > 0 && (
        <span className="-ml-1 inline-flex h-[16px] min-w-[16px] shrink-0 items-center justify-center rounded-full border border-grow-error bg-grow-error/10 px-1 text-[10px] font-bold leading-none text-grow-error">
          +{n}
        </span>
      )}
    </span>
  )
}

/**
 * The execution fact under a status chip, when there is one: who is on the way
 * (Out For Pickup), or where the collected parcels are (Handed Over / In
 * transit to hub). One short line — the Status column is 186px and never wraps.
 */
export function PrExecutionLine({ p }: { p: GrowPickupRequest }) {
  if (isHandedOver(p)) return <span className="mt-0.5 flex"><Chip tone="success">Handed Over</Chip></span>
  if (isInTransitToHub(p)) return <span className="mt-0.5 block truncate text-[12px] text-grow-ink-2">In transit to hub</span>
  const who = p.status === 'Out For Pickup' ? collectorLine(p) : null
  return who ? <span className="mt-0.5 block truncate text-[12px] text-grow-ink-2" title={who}>{who}</span> : null
}

interface PrCtx {
  byId: Map<string, GrowOrder>; stores: StoreLocation[]
  exceptionsOf: (p: GrowPickupRequest) => string[]; tagsOf: (p: GrowPickupRequest) => string[]
}
interface PrCol {
  key: string; label: string; width: number; align?: 'right'
  /** plain value: drives "has data" and the tooltip */
  value: (p: GrowPickupRequest, c: PrCtx) => string
  cell?: (p: GrowPickupRequest, c: PrCtx) => ReactNode
}
const none = <span className="text-grow-ink-3">—</span>

const PR_COLUMNS: PrCol[] = [
  { key: 'reference', label: 'Reference', width: 112, value: (p) => p.number,
    cell: (p) => (
      <>
        <span className="block truncate font-medium text-grow-accent-2" title={`${p.number} · request id ${p.id}`}>{p.number}</span>
        <span className="block truncate text-[12px] text-grow-ink-2">{p.shipmentType === 'FTL' ? 'FTL' : 'LTL'}{p.blind ? ' · Reserved' : ''}</span>
      </>
    ) },
  { key: 'status', label: 'Status', width: 150, value: (p) => prOutcomeLabel(p),
    cell: (p) => <><PrStatusChip p={p} short /><PrExecutionLine p={p} /></> },
  { key: 'exception', label: 'Exception', width: 130, value: (p, c) => c.exceptionsOf(p).join(', '),
    cell: (p, c) => {
      const flags = c.exceptionsOf(p)
      return flags.length
        ? <span className="flex min-w-0 items-center gap-1 text-grow-error">
            <CircleAlert size={15} className="shrink-0" />
            <span className="truncate">{flags[0]}</span>
            {flags.length > 1 && <span className="shrink-0 text-[12px]">+{flags.length - 1}</span>}
          </span>
        : none
    } },
  { key: 'window', label: 'Pickup Window', width: 176, value: (p) => prWindow(p), cell: (p) => <Window p={p} /> },
  { key: 'shipFrom', label: 'Ship From', width: 200, value: (p, c) => `${pickupPointName(p, c.stores)} · ${pickupPointAddress(p, c.stores)}`,
    cell: (p, c) => {
      const hub = p.shipmentType !== 'FTL' && p.destinationCode ? hubName(p.destinationCode, c.stores) : ''
      const address = pickupPointAddress(p, c.stores)
      return (
        <>
          <span className="block truncate leading-tight">{pickupPointName(p, c.stores)}</span>
          <span className="block truncate text-[12px] leading-tight text-grow-ink-2">{hub ? `→ ${hub}` : address || '—'}</span>
        </>
      )
    } },
  { key: 'shipments', label: 'Shipments', width: 92, value: (p, c) => String(prOrders(p, c.byId).length),
    cell: (p, c) => (
      <span className="block truncate font-semibold">
        {prOrders(p, c.byId).length}{p.blind && p.expectedPieces != null ? <span className="font-normal text-grow-ink-2"> / {p.expectedPieces}</span> : null}
      </span>
    ) },
  { key: 'weight', label: 'Weight', width: 84, align: 'right', value: (p, c) => {
      const w = prDisplayWeight(p, c.byId)
      return w.known ? `${w.value.toFixed(1)} kg` : ''
    } },
  { key: 'collector', label: 'Driver / Carrier', width: 130, value: (p) => collectorLine(p) ?? '' },
  { key: 'trip', label: 'Trip', width: 104, value: (p) => p.tripId ?? '' },
  /* ---- optional ---- */
  { key: 'tags', label: 'Tags', width: 200, value: (p, c) => c.tagsOf(p).join(', '),
    cell: (p, c) => {
      const tags = c.tagsOf(p)
      if (!tags.length) return none
      return (
        <span className="flex min-w-0 items-center gap-1">
          {tags.slice(0, 2).map((t) => <Chip key={t} tone="warning" className="max-w-[92px] truncate">{t}</Chip>)}
          {tags.length > 2 && <span className="shrink-0 text-[11px] font-semibold text-grow-ink-2">+{tags.length - 2}</span>}
        </span>
      )
    } },
  { key: 'source', label: 'Source', width: 96, value: (p) => p.source },
  { key: 'vehicle', label: 'Vehicle Type', width: 130, value: (p) => p.vehicleType ?? '' },
  { key: 'instructions', label: 'Instructions', width: 220, value: (p) => p.instructions ?? '' },
  { key: 'createdAt', label: 'Created At', width: 104, value: (p) => fmtDay(p.createdAt.slice(0, 10)) },
]
const PR_DEFAULT_KEYS = ['reference', 'status', 'exception', 'window', 'shipFrom', 'shipments', 'weight', 'collector', 'trip']
const PR_ALL_KEYS = PR_COLUMNS.map((c) => c.key)

export function PickupRequestTable({
  requests, allRequests, orders, stores, exceptionsOf, tagsOf, selected, onToggle, onToggleAll, onRowClick, rowRef,
  emptyText = 'No pickup requests match these filters.',
}: PickupRequestTableProps) {
  const byId = useMemo(() => new Map(orders.map((o) => [o.id, o])), [orders])
  const ctx: PrCtx = { byId, stores, exceptionsOf, tagsOf }
  const [picked, setPicked] = useColumnPrefs('grow-pickup-columns-v1', PR_DEFAULT_KEYS, PR_ALL_KEYS)
  const withData = PR_COLUMNS.filter((c) => allRequests.some((p) => c.value(p, ctx)))
  const cols = withData.filter((c) => picked.includes(c.key))
  const allChecked = requests.length > 0 && requests.every((p) => selected.has(p.id))
  const someChecked = requests.some((p) => selected.has(p.id))
  const width = 52 + cols.reduce((n, c) => n + c.width, 0) + 44

  return (
    <div className="relative">
      {/* outside the scroller, so its popover is never clipped */}
      <div className="absolute right-1.5 top-[11px] z-[3]">
        <ColumnChooser columns={withData} visible={cols.map((c) => c.key)}
          onChange={setPicked} onReset={() => setPicked(null)} />
      </div>
      <div className="overflow-x-auto">
        <table className="table-fixed border-collapse text-[13px] text-grow-ink" style={{ width, minWidth: '100%' }}>
          <colgroup>
            <col style={{ width: 52 }} />
            {cols.map((c) => <col key={c.key} style={{ width: c.width }} />)}
            <col style={{ width: 44 }} />
          </colgroup>
          <thead>
            <tr className={TABLE_HEAD_ROW}>
              <th className="px-1">
                <Checkbox checked={allChecked} indeterminate={!allChecked && someChecked}
                  onChange={(v) => onToggleAll(v)} ariaLabel="Select all pickup requests" />
              </th>
              {cols.map((c) => (
                <th key={c.key} className={`${TABLE_TH} !whitespace-normal !px-3 leading-tight ${c.align === 'right' ? 'text-right' : ''}`}>{c.label}</th>
              ))}
              <th aria-label="Columns" />
            </tr>
          </thead>
          <tbody>
            {requests.length === 0 && (
              <tr><td colSpan={cols.length + 2} className="h-[240px] text-center text-[14px] text-grow-ink-2">{emptyText}</td></tr>
            )}
            {requests.map((p) => (
              <tr key={p.id} ref={(el) => rowRef?.(p.id, el)} onClick={() => onRowClick(p)}
                className={`${TABLE_ROW} ${selected.has(p.id) ? TABLE_ROW_SELECTED : ''}`}>
                <td className="px-1" onClick={(e) => e.stopPropagation()}>
                  <Checkbox checked={selected.has(p.id)} onChange={(v) => onToggle(p.id, v)} ariaLabel={`Select ${p.number}`} />
                </td>
                {cols.map((c) => {
                  const v = c.value(p, ctx)
                  return (
                    <td key={c.key} title={v || undefined}
                      className={`overflow-hidden truncate whitespace-nowrap px-3 py-1.5 ${c.align === 'right' ? 'text-right' : ''}`}>
                      {c.cell ? c.cell(p, ctx) : v || none}
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
