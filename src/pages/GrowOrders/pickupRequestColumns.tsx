/**
 * The Grow Pickup Requests grid — the SAME column set as the console's
 * `/local/pickup` grid (`LocalPickup/prModel.PR_COLUMN_DEFS`, rendered by
 * `LocalPickup/prColumns.usePrGridColumns`), so the two cannot drift
 * (owner, 2026-09-25: one value per cell, single-line rows, like the
 * Consignment Order grid):
 * Reference · Status · Type · Attempt · Pickup Window · Pickup Address ·
 * Destination Hub · Shipments · Weight · Carrier, with Tags · Vehicle Type ·
 * Instructions · Created At in the ⚙ chooser. MERCHANT READING (owner,
 * 2026-09-25): Merchant, Source, Trip and Driver are the carrier's business and
 * are neither shown nor offered; "Driver / Carrier" becomes **Carrier** = the
 * 3PL's name only when one is booked, else "—". The choice persists as
 * `grow-pickup-columns-v4`; a column no request has data for is hidden. Status
 * keeps the portal's outcome-aware chip plus the merchant's flags.
 */
import { useMemo, type ReactNode } from 'react'
import type { Column } from '../../nueva/components'
import type { GrowOrder, GrowPickupRequest, StoreLocation } from '../../growOrders/types'
import { PR_COLUMN_DEFS, PR_DEFAULT_COLUMN_KEYS, type PrColumnCtx, type PrColumnDef, type Tone } from '../LocalPickup/prModel'
import { usePrGridColumns, type PrCells } from '../LocalPickup/prColumns'
import { PrStatusChip } from './pickupRequestTable'

/** Columns that are the carrier's business, never the merchant's. */
const OPS_ONLY_KEYS = ['merchant', 'source', 'trip']
/** A 3PL is the merchant's to know (who comes to collect); the fleet driver is not. */
const CARRIER_DEF: PrColumnDef = {
  key: 'carrier', label: 'Carrier', width: 150,
  value: (p) => (p.carrierMode === 'CARRIER' && p.carrierName ? p.carrierName : ''),
}
const MERCHANT_DEFS: PrColumnDef[] = PR_COLUMN_DEFS
  .filter((d) => !OPS_ONLY_KEYS.includes(d.key))
  /* the status cell also carries the merchant's flags — give it room */
  .map((d) => (d.key === 'collector' ? CARRIER_DEF : d))
const GROW_DEFAULT_KEYS = PR_DEFAULT_COLUMN_KEYS
  .filter((k) => !OPS_ONLY_KEYS.includes(k))
  .map((k) => (k === 'collector' ? 'carrier' : k))

/**
 * The pickup-request grid's columns for a Nueva `DataTable`, plus its ⚙
 * chooser. `allRequests` decides which columns have any data at all.
 */
export function usePickupRequestColumns({ allRequests, orders, stores, tagsOf, flagsOf }: {
  allRequests: GrowPickupRequest[]
  orders: GrowOrder[]
  stores: StoreLocation[]
  /** The tags of the shipments a request contains (the Tags column option). */
  tagsOf: (p: GrowPickupRequest) => string[]
  /** The merchant's flags beside the status (Overdue · Duplicate · Re-attempt) — never Discrepancy. */
  flagsOf?: (p: GrowPickupRequest) => { label: string; tone: Tone }[]
}): { columns: Column[]; chooser: ReactNode } {
  const byId = useMemo(() => new Map(orders.map((o) => [o.id, o])), [orders])
  const ctx: PrColumnCtx = { byId, stores, tagsOf }
  const cells: PrCells = { status: (p) => <PrStatusChip p={p} short flags={flagsOf?.(p)} /> }
  return usePrGridColumns({
    storageKey: 'grow-pickup-columns-v4', defaults: GROW_DEFAULT_KEYS, ctx, cells, hideEmptyOf: allRequests, defs: MERCHANT_DEFS,
  })
}

/** CSV of the merchant's columns only — the console's `prCsv` also carries driver, trip, merchant and source. */
export function merchantPrCsv(prs: GrowPickupRequest[], orders: GrowOrder[], stores: StoreLocation[]): string {
  const ctx: PrColumnCtx = { byId: new Map(orders.map((o) => [o.id, o])), stores }
  const cell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)
  return [MERCHANT_DEFS.map((d) => d.label), ...prs.map((p) => MERCHANT_DEFS.map((d) => d.value(p, ctx)))]
    .map((r) => r.map((v) => cell(String(v ?? ''))).join(',')).join('\n')
}
