/**
 * Renders `prModel.PR_COLUMN_DEFS` for a Nueva `DataTable` — the ONE pickup-request
 * grid of the console `/local/pickup` list and Grow's Pickup Requests (owner,
 * 2026-09-25). One value per cell, single-line rows, every cell truncated with
 * the full text on hover; fixed widths make the table `table-fixed`, so it
 * scrolls sideways inside its card like the Consignment Order grid.
 *
 * Pages pass their own single-line cells for the few columns that differ
 * (the Status chip, the Trip link). Imports nothing from GrowOrders/utils —
 * the LOCAL app must not reach the live masters layer.
 */
import { type ReactNode } from 'react'
import { Settings2 } from 'lucide-react'
import type { Column } from '../../nueva/components'
import { ColumnChooser } from '../../local/chrome'
import { useColumnPrefs } from '../../local/columnPrefs'
import type { GrowPickupRequest } from '../../growOrders/types'
import {
  PR_COLUMN_DEFS, PR_COLUMN_KEYS, type PrColumnCtx, type PrColumnDef,
} from './prModel'

const dash = <span className="text-ink-3">—</span>

/** The single-line cells every page shares; a page's `cells` override them. */
const SHARED_CELLS: Record<string, (p: GrowPickupRequest, c: PrColumnCtx) => ReactNode> = {
  reference: (p) => <span className="font-mono text-[12px] font-bold text-ink">{p.number}</span>,
  trip: (p) => (p.tripId ? <span className="font-mono text-[12px] font-bold text-ink-2">{p.tripId}</span> : dash),
}

export type PrCells = Partial<Record<string, (p: GrowPickupRequest, c: PrColumnCtx) => ReactNode>>

function columnOf(d: PrColumnDef, ctx: PrColumnCtx, cells: PrCells): Column {
  const cell = cells[d.key] ?? SHARED_CELLS[d.key]
  return {
    key: d.key, label: d.label, align: d.align,
    width: d.width + 12,   // DataTable pads 16px a side — the widths were budgeted for 10px
    render: (row: GrowPickupRequest) => {
      const v = d.value(row, ctx)
      const title = (d.title?.(row, ctx) || v) || undefined
      return (
        <span className="block min-w-0 truncate whitespace-nowrap" title={title}>
          {cell ? cell(row, ctx) : v || dash}
        </span>
      )
    },
  }
}

/**
 * The grid's columns + its ⚙ chooser, persisted under `storageKey`.
 * `defaults` = this page's default set; `hideEmptyOf` = hide columns no row has data for.
 */
export function usePrGridColumns({ storageKey, defaults, ctx, cells = {}, hideEmptyOf, defs = PR_COLUMN_DEFS }: {
  storageKey: string
  defaults: string[]
  ctx: PrColumnCtx
  cells?: PrCells
  hideEmptyOf?: GrowPickupRequest[]
  /** the column universe — default `PR_COLUMN_DEFS`; Grow passes its merchant subset (never in the ⚙ chooser otherwise) */
  defs?: PrColumnDef[]
}): { columns: Column[]; chooser: ReactNode } {
  const [picked, setPicked] = useColumnPrefs(storageKey, defaults, defs === PR_COLUMN_DEFS ? PR_COLUMN_KEYS : defs.map((d) => d.key))
  const offered = hideEmptyOf
    ? defs.filter((d) => hideEmptyOf.some((p) => d.value(p, ctx)))
    : defs
  const shown = offered.filter((d) => picked.includes(d.key))
  return {
    columns: shown.map((d) => columnOf(d, ctx, cells)),
    chooser: (
      <ColumnChooser columns={offered} visible={shown.map((d) => d.key)} onChange={setPicked} onReset={() => setPicked(null)}>
        <Settings2 size={16} />
      </ColumnChooser>
    ),
  }
}
