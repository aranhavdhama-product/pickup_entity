/**
 * Turns a finished OrderDraft into a real GrowOrder — shared by AddOrderPage
 * (every payment mode except Payment Gateway submits straight from the form,
 * no separate review step) and CheckoutPage (Payment Gateway's own "next
 * page", where a redirect/capture step actually means something).
 */
import { inboundHubFor } from './hubs'
import { growOrderActions, newOrderId, newOrderNumber, orderById, pickupRequestById } from './store'
import { CURRENCY } from './seed'
import type { GrowOrder } from './types'
import { quoteOf, volKg, type OrderDraft, type OverageSidecar } from './draft'

export interface FinalizeContext {
  pickupId: string | null
  overage: OverageSidecar | null
  merchantCode: string | null
}

export interface FinalizeResult {
  order: GrowOrder
  redirectTo: string
  message: string
}

export function finalizeOrder(draft: OrderDraft, ctx: FinalizeContext): FinalizeResult {
  const p0 = draft.parcels[0]
  /* what makes a shipment a Document is the CARGO classification, not the packaging it happens to be in */
  const isDocument = p0.cargoType === 'Document'
  /** Every SKU / custom item across the packages, for the order record and the summary. */
  const items = draft.parcels.flatMap((p) => p.items ?? [])
  /* resumed draft → update that same order; otherwise create a new one */
  const existing = draft.orderId ? orderById(draft.orderId) : undefined
  /** what the Create Consignment form collected beyond the legacy draft fields */
  const cf = draft.consignment
  /* an order created FOR an overage scan was ALREADY collected — it is born Picked
     Up on that request, and carries the scanned barcode as its tracking number. A
     stale sidecar (scan resolved elsewhere) falls back to a normal order. */
  const ovPr = ctx.overage ? pickupRequestById(ctx.overage.prId) : undefined
  const scan = ovPr?.overages.find((v) => v.id === ctx.overage?.overageId && !v.orderId)
  /* the legacy order record only distinguishes COD vs Prepaid — Card/Wallet/Payment
     Gateway/postpaid all settle before or outside order creation, so they land here
     as Prepaid; only COD still has money to collect on delivery. */
  const isCod = cf?.paymentMode === 'COD'
  const o: GrowOrder = {
    /* newOrderId(), not `o${Date.now()}` — two orders checked out inside one
       millisecond would otherwise share an id */
    id: existing?.id ?? newOrderId(), orderNumber: cf?.orderNumber?.trim() || existing?.orderNumber || newOrderNumber(),
    orderType: cf?.consignmentType === 'Reverse' ? 'Reverse Order' : 'Forward Order',
    createdAt: existing?.createdAt ?? new Date().toISOString(), status: 'Order Created',
    storeCode: draft.storeCode, inboundHubCode: inboundHubFor(draft.receiver), sender: draft.sender, receiver: draft.receiver, drops: draft.drops, shipmentType: draft.shipmentType, vehicleType: draft.shipmentType === 'FTL' ? draft.vehicleType : '',
    ...(draft.shipmentType === 'FTL' ? { vehicleUnit: draft.vehicleUnit, actualLoad: draft.actualLoad, additionalServices: draft.additionalServices,
      ...(draft.vehicles?.length ? { vehicles: draft.vehicles } : {}) } : {}),
    pkg: { kind: draft.shipmentType === 'FTL' ? 'FTL' : isDocument ? 'Document' : 'Parcel', count: draft.parcels.reduce((n, p) => n + p.quantity, 0),
      weightKg: draft.parcels.reduce((n, p) => n + Math.max(p.weight, volKg(p)) * p.quantity, 0), lengthCm: p0.l, widthCm: p0.w, heightCm: p0.h,
      description: draft.parcels.map((p) => p.itemInfo).filter(Boolean).join('; '), declaredValue: 0,
      /* carried onto the order so the view page can show what the stepper collected — the package preset and the SKU rows behind `description` */
      ...(draft.shipmentType === 'FTL' ? {} : { cargoType: p0.cargoType, packageType: p0.packageTypeName ?? '', ...(items.length ? { items } : {}) }) },
    paymentMode: isCod ? 'COD' : 'Prepaid', codAmount: isCod ? (cf?.orderAmount ?? 0) : 0, currency: CURRENCY,
    carrier: cf?.carrier || (draft.shipmentType === 'FTL' ? '2GO Logistics' : '2GO Express'), serviceType: draft.service,
    trackingNumber: p0.trackingNumber?.trim() || '', pickupDate: '',
    /* the merchant is never a form field — it is recorded here, and on `consignment` */
    remarks: [draft.authority, draft.instructions,
      cf?.merchantCode || cf?.merchantName ? `Merchant: ${[cf.merchantCode, cf.merchantName].filter(Boolean).join(' · ')}` : ''].filter(Boolean).join(' · '),
    error: '',
    ...(cf ? { consignment: cf } : {}),
    /* paid (or otherwise settled) at submission — the order lands on the Ready for Pickup tab */
    paymentStatus: 'Paid', isDraft: false, pickupRequestId: null, pickedInRequestId: null, draft: null,
    /* FREEZE what was quoted. A rate card that changes tomorrow must not
       retroactively restate what this merchant already paid. */
    charges: quoteOf(draft.rate, draft.service),
  }
  if (ovPr && scan) {
    o.trackingNumber = scan.barcode
    o.status = 'Picked Up'
    o.pickupRequestId = ovPr.id
    o.pickedInRequestId = ovPr.id
    o.pickupDate = ovPr.date
  }
  if (existing) growOrderActions.update(o.id, o)
  else growOrderActions.create(o)

  if (ovPr && scan) {
    growOrderActions.resolveOverage(ovPr.id, scan.id, o.id)
    return { order: o, redirectTo: `/grow/orders/pickups/${ovPr.id}`, message: `Consignment ${o.orderNumber} created for overage ${scan.barcode} and linked to ${ovPr.number}` }
  }
  /* created FOR a reserved pickup — attach it and land on that request. A stale
     key (request cancelled or gone) falls back to the normal exit. */
  const pr = ctx.pickupId ? pickupRequestById(ctx.pickupId) : undefined
  if (pr && growOrderActions.attachOrdersToPickup(pr.id, [o.id]).length > 0) {
    return { order: o, redirectTo: `/grow/orders/pickups/${pr.id}`, message: `Consignment ${o.orderNumber} created and added to ${pr.number}` }
  }
  /* C6 — autoCreateOnConsignment 'always': the paid order is booked at once
     (joined to the open request at its store per policy, or a new one) */
  const auto = growOrderActions.autoBookOnConsignment(o.id, ctx.merchantCode)
  if (auto) {
    return { order: o, redirectTo: '/grow/orders', message: `Consignment ${o.orderNumber} created · Pickup Request ${auto.number} scheduled` }
  }
  return { order: o, redirectTo: '/grow/orders', message: `Consignment ${o.orderNumber} created` }
}
