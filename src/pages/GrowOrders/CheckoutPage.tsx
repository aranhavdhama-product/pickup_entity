/** /order/checkout/ replica — Payment Summary rail + remarks; Proceed creates the order. */
import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { CURRENCY } from '../../growOrders/seed'
import { inboundHubFor } from '../../growOrders/hubs'
import { growOrderActions, newOrderId, newOrderNumber, orderById, pickupRequestById } from '../../growOrders/store'
import type { GrowOrder, PaymentMode } from '../../growOrders/types'
import { toast } from '../../nueva/toast'
import { Btn, Card, OutlinedField, PageTitle } from './ui'
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
        <PageTitle title="Checkout" subtitle="Complete the payment for your order" />
        <Card className="text-[14px] text-grow-ink-2">
          Nothing to check out. <Link to="/grow/orders/add" className="font-medium text-grow-accent-2 hover:underline">Create a consignment</Link>
        </Card>
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
  return (
    <div>
      <PageTitle title="Checkout" subtitle="Complete the payment for your order"
        right={<Btn variant="outlined" color="neutral" startIcon={<ArrowLeft size={17} />} onClick={() => nav(-1)}>Back to consignment</Btn>} />
      <div className="grid items-start gap-5 lg:grid-cols-[1fr_400px]">
        <Card className="space-y-5">
          <div className="text-[14px] text-grow-ink">
            <p><span className="text-grow-ink-2">From </span>{draft.sender.name}, {draft.sender.city}</p>
            {[draft.receiver, ...draft.drops].map((d, i) => (
              <p key={i} className="mt-1"><span className="text-grow-ink-2">{i === 0 ? 'To ' : `Drop ${i + 1} `}</span>{d.name}, {d.line1}, {d.postalCode}</p>
            ))}
            {draft.shipmentType === 'FTL' && (
              <>
                <p className="mt-1"><span className="text-grow-ink-2">Service </span>{draft.ftlServiceType || draft.service}</p>
                {vehiclesOf(draft).map((v, i) => (
                  <p key={i} className="mt-1"><span className="text-grow-ink-2">Vehicle {i + 1} </span>{v.vehicleType} · {v.actualLoadKg.toLocaleString()} kg
                    <span className="text-grow-ink-2"> · {v.addressIdx.map((a) => `Address ${a + 1}`).join(', ')}</span></p>
                ))}
                {draft.additionalServices.length > 0 && <p className="mt-1"><span className="text-grow-ink-2">Extras </span>{draft.additionalServices.join(', ')}</p>}
              </>
            )}
            {/* what is actually being shipped: the Package master preset, then its contents */}
            {draft.shipmentType !== 'FTL' && (
              <p className="mt-1"><span className="text-grow-ink-2">Cargo </span>{p0.cargoType}
                <span className="text-grow-ink-2"> · Package type </span>{p0.packageTypeName || 'Custom'}
                {items.length > 0 && <span className="text-grow-ink-2"> · {items.length} item{items.length === 1 ? '' : 's'}: <span className="text-grow-ink">{items.map((it) => it.name).filter(Boolean).join(', ')}</span></span>}</p>
            )}
            <p className="mt-1"><span className="text-grow-ink-2">Service </span>{draft.service} · Delivery by {draft.etaDays} DAY</p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <OutlinedField label="Payment Mode" value={payment} onChange={(v) => setPayment(v as PaymentMode)} options={[{ value: 'Prepaid' }, { value: 'COD' }]} />
            {payment === 'COD' && <OutlinedField label={`COD Amount (${CURRENCY})`} type="number" value={cod} onChange={setCod} />}
          </div>
          <div>
            <p className="mb-2 text-[15px] font-semibold text-grow-ink">Add remarks if any</p>
            <OutlinedField value={remarks} onChange={setRemarks} multiline placeholder="Remarks for the driver or the receiver" />
          </div>
        </Card>
        <Card>
          <h2 className="text-[20px] font-semibold leading-snug text-grow-ink">Payment Summary</h2>
          <p className="mb-4 mt-0.5 text-[14px] text-grow-ink-2">Complete the payment for your order</p>
          <div className="space-y-2 text-[14px] text-grow-ink">
            <div className="flex justify-between"><span className="text-grow-ink-2">Total Shipments</span><span>1</span></div>
            <div className="flex justify-between"><span className="text-grow-ink-2">Shipping charges</span><span>{money(draft.rate, CURRENCY)}</span></div>
            <div className="flex justify-between"><span className="text-grow-ink-2">Taxes</span><span>{money(Math.round(draft.rate * 0.15), CURRENCY)}</span></div>
            <div className="mt-3 flex justify-between border-t border-grow-line pt-3 text-[16px] font-semibold"><span>Payable Amount</span><span>{money(draft.rate + Math.round(draft.rate * 0.15), CURRENCY)}</span></div>
          </div>
          <Btn color="accent2" size="lg" className="mt-5 w-full" onClick={proceed}>Proceed</Btn>
        </Card>
      </div>
    </div>
  )
}
