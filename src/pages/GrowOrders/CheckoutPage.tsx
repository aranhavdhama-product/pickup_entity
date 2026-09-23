/** /order/checkout/ replica — Payment Summary rail + remarks; Proceed creates the order. */
import { useEffect, useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { CURRENCY } from '../../growOrders/seed'
import { inboundHubFor } from '../../growOrders/hubs'
import { growOrderActions, newOrderId, newOrderNumber, orderById, pickupRequestById } from '../../growOrders/store'
import type { GrowOrder, PaymentMode } from '../../growOrders/types'
import { toast } from '../../nueva/toast'
import { Button, Field, Input, MenuSelect, PageHeader, Panel } from '../../nueva/components'
import { money } from './utils'
import { usePortalMerchant } from './pickupGate'
import {
  DRAFT_KEY, DRAFT_PICKUP_KEY, clearDraftKeys, readOverageSidecar, vehiclesOf, volKg,
  type OrderDraft, type OverageSidecar,
  quoteOf,
} from '../../growOrders/draft'

export default function CheckoutPage() {
  const nav = useNavigate()
  const [draft] = useState<OrderDraft | null>(() => { try { return JSON.parse(sessionStorage.getItem(DRAFT_KEY) || 'null') } catch { return null } })
  const [pickupId] = useState<string | null>(() => sessionStorage.getItem(DRAFT_PICKUP_KEY))
  /** Written by AddOrderPage's `?fromOverage=` flow — the scan this order answers. */
  const [ov] = useState<OverageSidecar | null>(readOverageSidecar)
  const [remarks, setRemarks] = useState('')
  /* the Create Consignment form's Payment Mode / Order Amount prefill the payment step */
  const [payment, setPayment] = useState<PaymentMode>(() => (draft?.consignment?.paymentMode === 'COD' ? 'COD' : 'Prepaid'))
  const [cod, setCod] = useState(() => (draft?.consignment?.paymentMode === 'COD' && draft.consignment.orderAmount ? String(draft.consignment.orderAmount) : ''))
  const portal = usePortalMerchant()
  /* no draft = nothing to pay for; clear any sidecar the abandoned stepper left,
     so the next order is never silently attached to that pickup or scan.
     In an effect, never in the render body — this is a side effect. */
  useEffect(() => { if (!draft) clearDraftKeys() }, [draft])
  if (!draft) {
    return (
      <div>
        <PageHeader title="Checkout" subtitle="Complete the payment for your order" />
        <Panel>
          <p className="px-5 py-5 text-[13px] text-ink-2">
            Nothing to check out. <Link to="/grow/orders/add" className="font-bold text-brand-500 hover:text-brand-600">Create a consignment</Link>
          </p>
        </Panel>
      </div>
    )
  }
  const p0 = draft.parcels[0]
  /* what makes a shipment a Document is the CARGO classification, not the
     packaging it happens to be in */
  const isDocument = p0.cargoType === 'Document'
  /** Every SKU / custom item across the packages, for the order record and the summary. */
  const items = draft.parcels.flatMap((p) => p.items ?? [])
  const proceed = () => {
    /* resumed draft → update that same order; otherwise create a new one */
    const existing = draft.orderId ? orderById(draft.orderId) : undefined
    /** what the Create Consignment form collected beyond the legacy draft fields */
    const cf = draft.consignment
    /* an order created FOR an overage scan was ALREADY collected — it is born
       Picked Up on that request, and carries the scanned barcode as its tracking
       number. A stale sidecar (scan resolved elsewhere) falls back to a normal order. */
    const ovPr = ov ? pickupRequestById(ov.prId) : undefined
    const scan = ovPr?.overages.find((v) => v.id === ov?.overageId && !v.orderId)
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
        /* carried onto the order so the view page can show what the stepper
           collected — the package preset and the SKU rows behind `description` */
        ...(draft.shipmentType === 'FTL' ? {} : { cargoType: p0.cargoType, packageType: p0.packageTypeName ?? '', ...(items.length ? { items } : {}) }) },
      paymentMode: payment, codAmount: payment === 'COD' ? Number(cod) || 0 : 0, currency: CURRENCY,
      carrier: cf?.carrier || (draft.shipmentType === 'FTL' ? '2GO Logistics' : '2GO Express'), serviceType: draft.service,
      trackingNumber: p0.trackingNumber?.trim() || '', pickupDate: '',
      /* the merchant is never a form field — it is recorded here, and on `consignment` */
      remarks: [draft.authority, draft.instructions, remarks,
        cf?.merchantCode || cf?.merchantName ? `Merchant: ${[cf.merchantCode, cf.merchantName].filter(Boolean).join(' · ')}` : ''].filter(Boolean).join(' · '),
      error: '',
      ...(cf ? { consignment: cf } : {}),
      /* paid at checkout — the order lands on the Ready for Pickup tab */
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
    clearDraftKeys()
    if (ovPr && scan) {
      growOrderActions.resolveOverage(ovPr.id, scan.id, o.id)
      toast.success(`Consignment ${o.orderNumber} created for overage ${scan.barcode} and linked to ${ovPr.number}`)
      nav(`/grow/orders/pickups/${ovPr.id}`)
      return
    }
    /* created FOR a reserved pickup — attach it and land on that request. A
       stale key (request cancelled or gone) falls back to the normal exit. */
    const pr = pickupId ? pickupRequestById(pickupId) : undefined
    if (pr && growOrderActions.attachOrdersToPickup(pr.id, [o.id]).length > 0) {
      toast.success(`Consignment ${o.orderNumber} created and added to ${pr.number}`)
      nav(`/grow/orders/pickups/${pr.id}`)
      return
    }
    /* C6 — autoCreateOnConsignment 'always': the paid order is booked at once
       (joined to the open request at its store per policy, or a new one) */
    const auto = growOrderActions.autoBookOnConsignment(o.id, portal.code)
    if (auto) {
      toast.success(`Consignment ${o.orderNumber} created · Pickup Request ${auto.number} scheduled`)
      nav('/grow/orders')
      return
    }
    toast.success(`Consignment ${o.orderNumber} created`)
    nav('/grow/orders')
  }
  const taxes = Math.round(draft.rate * 0.15)
  const line = (k: string, v: ReactNode, key?: number) => (
    <p key={key} className="mt-1 first:mt-0"><span className="text-ink-3">{k} </span>{v}</p>
  )
  return (
    <div>
      <PageHeader title="Checkout" subtitle="Complete the payment for your order" onBack={() => nav(-1)}
        right={<Button variant="outline" onClick={() => nav(-1)}>Back to consignment</Button>} />
      <div className="grid items-start gap-4 lg:grid-cols-[1fr_380px]">
        <div className="flex min-w-0 flex-col gap-4">
          <Panel title="Consignment">
            <div className="px-5 pb-5 pt-2 text-[13px] text-ink">
              {line('From', `${draft.sender.name}, ${draft.sender.city}`)}
              {[draft.receiver, ...draft.drops].map((d, i) => line(i === 0 ? 'To' : `Drop ${i + 1}`, `${d.name}, ${d.line1}, ${d.postalCode}`, i))}
              {draft.shipmentType === 'FTL' && (
                <>
                  {line('Service', draft.ftlServiceType || draft.service)}
                  {vehiclesOf(draft).map((v, i) => line(`Vehicle ${i + 1}`, <>{v.vehicleType} · {v.actualLoadKg.toLocaleString()} kg
                    <span className="text-ink-3"> · {v.addressIdx.map((a) => `Address ${a + 1}`).join(', ')}</span></>, 100 + i))}
                  {draft.additionalServices.length > 0 && line('Extras', draft.additionalServices.join(', '))}
                </>
              )}
              {/* what is actually being shipped: the Package master preset, then its contents */}
              {draft.shipmentType !== 'FTL' && line('Cargo', <>{p0.cargoType}
                <span className="text-ink-3"> · Package type </span>{p0.packageTypeName || 'Custom'}
                {items.length > 0 && <span className="text-ink-3"> · {items.length} item{items.length === 1 ? '' : 's'}: <span className="text-ink">{items.map((it) => it.name).filter(Boolean).join(', ')}</span></span>}</>)}
              {line('Service', `${draft.service} · Delivery by ${draft.etaDays} DAY`)}
            </div>
          </Panel>
          <Panel title="Payment">
            <div className="grid grid-cols-2 gap-4 px-5 pb-5 pt-2">
              <Field label="Payment Mode" plain>
                <MenuSelect value={payment} options={['Prepaid', 'COD']} onChange={(v) => setPayment(v as PaymentMode)} />
              </Field>
              {payment === 'COD' && (
                <Field label={`COD Amount (${CURRENCY})`} plain>
                  <Input type="number" value={cod} onChange={setCod} />
                </Field>
              )}
              <div className="col-span-2">
                <Field label="Add remarks if any" plain>
                  <textarea rows={3} value={remarks} onChange={(e) => setRemarks(e.target.value)}
                    placeholder="Remarks for the driver or the receiver"
                    className="w-full rounded-md border border-warm-300 bg-surface px-3 py-2 text-[13px] text-ink placeholder:text-warm-400
                               transition-shadow focus:border-brand-500 focus:ring-[3px] focus:ring-brand-500/20" />
                </Field>
              </div>
            </div>
          </Panel>
        </div>
        <Panel title="Payment Summary">
          <div className="px-5 pb-5">
            <p className="mb-4 text-[13px] text-ink-3">Complete the payment for your order</p>
            <div className="space-y-2 text-[13px] text-ink">
              <div className="flex justify-between"><span className="text-ink-3">Total Shipments</span><span>1</span></div>
              <div className="flex justify-between"><span className="text-ink-3">Shipping charges</span><span>{money(draft.rate, CURRENCY)}</span></div>
              <div className="flex justify-between"><span className="text-ink-3">Taxes</span><span>{money(taxes, CURRENCY)}</span></div>
              <div className="mt-3 flex justify-between border-t border-line pt-3 text-[15px] font-bold"><span>Payable Amount</span><span>{money(draft.rate + taxes, CURRENCY)}</span></div>
            </div>
            <div className="mt-5 flex [&>button]:w-full"><Button onClick={proceed}>Proceed</Button></div>
          </div>
        </Panel>
      </div>
    </div>
  )
}
