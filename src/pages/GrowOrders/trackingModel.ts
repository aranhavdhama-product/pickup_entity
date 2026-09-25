/**
 * Post-booking facts the Grow Tracking and Dashboard pages read off a shipment:
 * its EDD, when it was delivered, whether that was on time, and its rate.
 *
 * Nothing here is stored. EDD = the consignment's delivery window end (the
 * console adapter's), else created + the lane's service days (`rates.ts`).
 * Delivered-at = the `Delivered` group of the SAME event log the View
 * Consignment drawer shows (`LocalConsignments/viewModel.eventsOf`), so the
 * dashboard's On Time Performance agrees with what the drawer says happened.
 */
import type { GrowOrder, GrowOrdersDb } from '../../growOrders/types'
import { deliveryDate, quoteForRecord, quoteService, type RateCurrency } from '../../growOrders/rates'
import type { PlanningDb } from '../LocalPFP/planningStore'
import { eventsOf } from '../LocalConsignments/viewModel'
import { displayStatus } from '../../growOrders/tabs'
import { isoDay } from './dateRanges'
import { fmtDate, money } from './utils'
import type { ShipmentRow } from './shipmentRows'

/** YYYY-MM-DD the shipment is promised by. */
export function eddOf(r: ShipmentRow): string {
  const o = r.order
  /* a window that ends before the order even existed is a stale pickup-derived one — not a promise */
  const created = isoDay(new Date(o.createdAt))
  if (r.deliveryWindow?.end && r.deliveryWindow.end.slice(0, 10) >= created) return r.deliveryWindow.end.slice(0, 10)
  const currency: RateCurrency = o.currency === '$' ? '$' : '₱'
  const service = o.serviceType || (o.shipmentType === 'FTL' ? 'Inland FTL' : 'Standard')
  const q = quoteService({ code: service, name: service }, {
    from: o.sender, to: o.receiver, mode: o.shipmentType === 'FTL' ? 'ftl' : 'ltl', currency,
    parcels: [{ cargoType: 'Parcel', itemInfo: '', quantity: 1, weight: o.pkg.weightKg, l: o.pkg.lengthCm, w: o.pkg.widthCm, h: o.pkg.heightCm }],
  })
  return deliveryDate(new Date(o.createdAt), q.days)
}

/** When the event log says it was delivered, else null. */
export function deliveredAtOf(o: GrowOrder, plan: PlanningDb, db: Pick<GrowOrdersDb, 'pickupRequests'>): string | null {
  if (o.status !== 'Delivered') return null
  return eventsOf(o, plan, db).find((g) => g.state === 'Delivered')?.at ?? null
}

/** Delivered on or before its EDD (null = not delivered). */
export function onTimeOf(r: ShipmentRow, plan: PlanningDb, db: Pick<GrowOrdersDb, 'pickupRequests'>): boolean | null {
  const at = deliveredAtOf(r.order, plan, db)
  if (!at) return null
  return isoDay(new Date(at)) <= eddOf(r)
}

/** What the merchant pays: the frozen checkout charge, else the rate card's quote. */
export function rateOf(o: GrowOrder): number {
  return o.charges?.total ?? quoteForRecord(o).total
}

/* ------------------------------------------------------------ the CSV ---- */

/** Shipment number = the first piece's tracking number (live: SHIPMENT NUMBER ≠ consignment). */
export const shipmentNoOf = (r: ShipmentRow) => r.shipments[0]?.trackingNumber ?? r.order.trackingNumber ?? ''

/** The live Tracking grid's nine columns as plain values — the grid's CSV and the Tracking report. */
export const TRACKING_VALUE_COLUMNS: { key: string; label: string; value: (r: ShipmentRow) => string }[] = [
  { key: 'shipmentNumber', label: 'Shipment Number', value: shipmentNoOf },
  { key: 'consignmentNumber', label: 'Consignment Number', value: (r) => r.consignmentNumber },
  { key: 'orderNumber', label: 'Order Number', value: (r) => r.orderNumber },
  { key: 'status', label: 'Status', value: (r) => displayStatus(r.order) },
  { key: 'state', label: 'State', value: (r) => r.state },
  { key: 'createdOn', label: 'Created On', value: (r) => fmtDate(r.order.createdAt) },
  { key: 'edd', label: 'EDD/ETA', value: (r) => fmtDate(eddOf(r)) },
  { key: 'destination', label: 'Destination Address', value: (r) => r.address },
  { key: 'rates', label: 'Rates', value: (r) => money(rateOf(r.order), r.order.currency || '₱') },
]

const csvCell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)
export const trackingCsv = (rows: ShipmentRow[]) => [
  TRACKING_VALUE_COLUMNS.map((c) => csvCell(c.label)).join(','),
  ...rows.map((r) => TRACKING_VALUE_COLUMNS.map((c) => csvCell(c.value(r))).join(',')),
].join('\n')
