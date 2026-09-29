/**
 * Grow order → Shipments-page row.
 *
 * The merchant's Shipments page (`/grow/orders`) has the console Consignment
 * Order page's structure, so it reads the SAME row: `toConsignmentRow` from the
 * shared adapter, folded with the SAME console overlay the console page applies
 * (planning secondary state, else "Pickup Scheduled" for an open booking; raised
 * exceptions). The merchant and ops therefore never disagree about a shipment's
 * State, Secondary State or Exception.
 *
 * The one Grow addition: DRAFTS. The console hides them (a draft is not yet a
 * consignment); the merchant must see them, so a draft reads State `Draft`,
 * Secondary State `Save for later`, and carries only its own validation error
 * (the adapter's derived "Geo Lookup Not Found" is a claim about a SUBMITTED
 * address, not an unfinished form).
 */
import type { GrowOrder, GrowOrdersDb } from '../../growOrders/types'
import { csvOf, executionOverlay, stateTone, toConsignmentRow, type LocalConsignmentRow } from '../LocalPFP/adapter'
import type { PlanningDb } from '../LocalPFP/planningStore'

export const DRAFT_STATE = 'Draft'
export const DRAFT_SECONDARY = 'Save for later'

export interface ShipmentRow extends Omit<LocalConsignmentRow, 'state'> {
  /** the console state vocabulary, plus `Draft` */
  state: string
  draft: boolean
  /** Category flags (VIP · Stackable · Hazmat · Fragile · Heavy Weight) + the order's free tags + VAS. */
  tags: string[]
}

export const isDraftOrder = (o: GrowOrder) => o.isDraft || o.paymentStatus === 'Unpaid'

export function toShipmentRow(
  o: GrowOrder,
  db: Pick<GrowOrdersDb, 'stores' | 'pickupRequests'>,
  plan: Pick<PlanningDb, 'secondaryState' | 'scheduleOverrides' | 'exceptions' | 'trips'>,
): ShipmentRow {
  const base = toConsignmentRow(o, db, {
    /* the adapter derives FarEye's pickup secondary itself; the console overlay
       (RTO Initiated, Cancelled, …) is the fallback it applies */
    secondaryState: plan.secondaryState[o.id],
    schedule: plan.scheduleOverrides[o.id],
    exception: plan.exceptions[o.id],
    ...executionOverlay(o, plan.trips),
  })
  const draft = isDraftOrder(o)
  const tags = [...new Set([...base.flags, ...(o.tags ?? []), ...(o.additionalServices ?? [])].filter(Boolean))]
  return draft
    /* the adapter's derived "Geo Lookup Not Found" is a claim about a submitted
       address; a draft keeps only its own validation error */
    ? { ...base, state: DRAFT_STATE, secondaryState: DRAFT_SECONDARY, exception: o.error || '', draft, tags }
    : { ...base, state: String(base.state), draft, tags }
}

/** Every row, newest first; `id` breaks ties so a bulk upload never reshuffles. */
export function shipmentRowsOf(db: GrowOrdersDb, plan: PlanningDb): ShipmentRow[] {
  return db.orders
    .map((o) => toShipmentRow(o, db, plan))
    .sort((a, b) => b.order.createdAt.localeCompare(a.order.createdAt) || a.orderId.localeCompare(b.orderId))
}

/** The console's state tone (`stateTone`) for a Nueva `StatusPill`; a draft reads neutral. */
export function stateChipTone(state: string): ReturnType<typeof stateTone> {
  return state === DRAFT_STATE ? 'neutral' : stateTone(state)
}

/** The console's CSV (same columns as `/local/consignments`); `state` is only stringified. */
export const shipmentCsv = (rows: ShipmentRow[]): string => csvOf(rows as unknown as LocalConsignmentRow[])
