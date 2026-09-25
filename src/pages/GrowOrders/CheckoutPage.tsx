/**
 * /order/checkout/ replica — Payment Summary rail + remarks, then the merchant
 * PAYMENT step (owner, 2026-09-25): `PaymentSheet` method cards (Wallet balance ·
 * Card / online (demo) · Pay later on a Postpaid account · Cash on delivery for a
 * COD order). "Pay ₱ X and place order" / "Place order" creates the order and
 * records the ledger debit (`recordPayment(o, method)`); a success panel links the
 * consignment and its receipt.
 */
import { useEffect, useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { CURRENCY } from '../../growOrders/seed'
import { inboundHubFor } from '../../growOrders/hubs'
import { growOrderActions, newOrderId, newOrderNumber, orderById, pickupRequestById } from '../../growOrders/store'
import type { GrowOrder, PaymentMode } from '../../growOrders/types'
import { toast } from '../../nueva/toast'
import { Button, Input, MenuSelect, PageHeader, Panel } from '../../nueva/components'
import { money } from './utils'
import { SFld } from '../../components/consignmentForm'
import { usePortalMerchant } from './pickupGate'
import { recordPayment } from '../../growOrders/ledger'
import { PaymentSheet, payLabel, type PaymentChoice } from './paymentSheet'
import { CheckCircle2 } from 'lucide-react'
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
  const [choice, setChoice] = useState<PaymentChoice | null>(null)
  const [tried, setTried] = useState(false)
  /** set once the order is placed — the success panel (the draft keys are already cleared) */
  const [placed, setPlaced] = useState<{ orderId: string; orderNumber: string; entryId: string | null; method: string; note: string } | null>(null)
  /* no draft = nothing to pay for; clear any sidecar the abandoned stepper left,
     so the next order is never silently attached to that pickup or scan.
     In an effect, never in the render body — this is a side effect. */
  useEffect(() => { if (!draft) clearDraftKeys() }, [draft])
  if (placed) {
    const later = placed.method === 'Pay later' || placed.method === 'COD'
    return (
      <div className="mx-auto max-w-[720px]">
        <PageHeader title="Checkout" subtitle="Order placed" />
        <Panel>
          <div className="flex flex-col items-center px-8 py-10 text-center">
            <CheckCircle2 size={40} className="text-success-fg" />
            <p className="mt-3 text-[15px] font-bold text-ink">Consignment {placed.orderNumber} placed</p>
            <p className="mt-1 text-[13px] text-ink-2">
              {later ? (placed.method === 'COD' ? 'Shipping charges will be collected on delivery.' : 'Billed on this month’s invoice — shown as Due in Billing.')
                : `Paid by ${placed.method === 'Wallet' ? 'wallet balance' : 'card'}.`}{placed.note ? ` ${placed.note}` : ''}
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              {placed.entryId && <Button variant="outline" onClick={() => nav(`/grow/orders/wallet/${placed.entryId}`)}>{later ? 'View payment' : 'View receipt'}</Button>}
              {later && <Button variant="outline" onClick={() => nav('/grow/orders/billing')}>Open Billing</Button>}
              <Button onClick={() => nav(`/grow/orders?order=${placed.orderId}`)}>Open consignment</Button>
            </div>
          </div>
        </Panel>
      </div>
    )
  }
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
  /* the currency the form quoted in (₱, or $ on the Chicago network) — never re-quoted here */
  const cur = draft.currency || CURRENCY
  const p0 = draft.parcels[0]
  /* what makes a shipment a Document is the CARGO classification, not the
     packaging it happens to be in */
  const isDocument = p0.cargoType === 'Document'
  /** Every SKU / custom item across the packages, for the order record and the summary. */
  const items = draft.parcels.flatMap((p) => p.items ?? [])
  const proceed = () => {
    setTried(true)
    if (!choice?.ready) return
    /* resumed draft → update that same order; otherwise create a new one */
    const existing = draft.orderId ? orderById(draft.orderId) : undefined
    /** what the Create Consignment form collected beyond the legacy draft fields */
    const cf = draft.consignment
    /* an order created FOR an overage scan was ALREADY collected — it is born
       Picked Up on that request, and carries the scanned barcode as its tracking
       number. A stale sidecar (scan resolved elsewhere) falls back to a normal order. */
    const ovPr = ov ? pickupRequestById(ov.prId) : undefined
    const scan = ovPr?.overages.find((v) => v.id === ov?.overageId && !v.orderId)
    const booksVehicle = draft.shipmentType === 'FTL' || !!cf?.dedicateTruck || !!draft.vehicleType
    const o: GrowOrder = {
      /* newOrderId(), not `o${Date.now()}` — two orders checked out inside one
         millisecond would otherwise share an id */
      id: existing?.id ?? newOrderId(), orderNumber: cf?.orderNumber?.trim() || existing?.orderNumber || newOrderNumber(),
      orderType: cf?.consignmentType === 'Reverse' ? 'Reverse Order' : 'Forward Order',
      createdAt: existing?.createdAt ?? new Date().toISOString(), status: 'Order Created',
      storeCode: draft.storeCode, inboundHubCode: inboundHubFor(draft.receiver), sender: draft.sender, receiver: draft.receiver, drops: draft.drops, shipmentType: draft.shipmentType, vehicleType: booksVehicle ? draft.vehicleType : '',
      /* FTL, or a dedicated-truck parcel consignment — both keep the booked vehicles */
      ...(booksVehicle ? { vehicleUnit: draft.vehicleUnit, actualLoad: draft.actualLoad, additionalServices: draft.additionalServices,
        ...(draft.vehicles?.length ? { vehicles: draft.vehicles } : {}) } : {}),
      pkg: { kind: draft.shipmentType === 'FTL' ? 'FTL' : isDocument ? 'Document' : 'Parcel', count: draft.parcels.reduce((n, p) => n + p.quantity, 0),
        weightKg: draft.parcels.reduce((n, p) => n + Math.max(p.weight, volKg(p)) * p.quantity, 0), lengthCm: p0.l, widthCm: p0.w, heightCm: p0.h,
        description: draft.parcels.map((p) => p.itemInfo).filter(Boolean).join('; '),
        declaredValue: (draft.sourceParcels ?? draft.parcels).reduce((n, p) => n + (p.declaredValue ?? 0) * p.quantity, 0),
        /* carried onto the order so the view page can show what the stepper
           collected — the package preset and the SKU rows behind `description` */
        ...(draft.shipmentType === 'FTL' ? {} : { cargoType: p0.cargoType, packageType: p0.packageTypeName ?? '', ...(items.length ? { items } : {}) }) },
      paymentMode: payment, codAmount: payment === 'COD' ? Number(cod) || 0 : 0, currency: cur,
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
      charges: cur === '$' ? { shipping: draft.rate, tax: taxes, total: Math.round((draft.rate + taxes) * 100) / 100, service: draft.service } : quoteOf(draft.rate, draft.service),
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
    /* the Payments ledger (Wallet): one checkout = one debit entry — wallet / card paid, pay later / COD pending */
    const entry = recordPayment(o, choice.method, choice.last4)
    const paidNote = choice.method === 'Wallet' || choice.method === 'Card' ? `Paid ${money(payable, cur)}` : choice.method === 'COD' ? 'Charges on delivery' : 'Billed later'
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
      toast.success(`Consignment ${o.orderNumber} created · ${paidNote} · Pickup Request ${auto.number} scheduled`)
      setPlaced({ orderId: o.id, orderNumber: o.orderNumber, entryId: entry?.id ?? null, method: choice.method, note: `Pickup Request ${auto.number} scheduled.` })
      return
    }
    toast.success(`Consignment ${o.orderNumber} created · ${paidNote}`)
    setPlaced({ orderId: o.id, orderNumber: o.orderNumber, entryId: entry?.id ?? null, method: choice.method, note: '' })
  }
  /* the form's tax rule: whole pesos, cents for dollars */
  const taxes = cur === '$' ? Math.round(draft.rate * 15) / 100 : Math.round(draft.rate * 0.15)
  const payable = Math.round((draft.rate + taxes) * 100) / 100
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
              <SFld label="Payment Mode">
                <MenuSelect value={payment} options={['Prepaid', 'COD']} onChange={(v) => setPayment(v as PaymentMode)} />
              </SFld>
              {payment === 'COD' && (
                <SFld label={`COD Amount (${cur})`}>
                  <Input type="number" value={cod} onChange={setCod} />
                </SFld>
              )}
              <div className="col-span-2">
                <SFld label="Add remarks if any">
                  <textarea rows={3} value={remarks} onChange={(e) => setRemarks(e.target.value)}
                    placeholder="Remarks for the driver or the receiver"
                    className="w-full rounded-md border border-warm-300 bg-surface px-3 py-2 text-[13px] text-ink placeholder:text-warm-400
                               transition-shadow focus:border-brand-500 focus:ring-[3px] focus:ring-brand-500/20" />
                </SFld>
              </div>
            </div>
          </Panel>
          <Panel title="Payment method">
            <div className="px-5 pb-5 pt-2">
              <p className="mb-3 text-[12px] text-ink-3">How you pay the {money(payable, cur)} shipping charges. Your choice is remembered.</p>
              <PaymentSheet amount={payable} currency={cur} allowCod={payment === 'COD'} onChange={setChoice} />
              {tried && choice && !choice.ready && choice.reason && <p className="mt-2 text-[12px] text-danger-fg">{choice.reason}</p>}
            </div>
          </Panel>
        </div>
        <Panel title="Payment Summary">
          <div className="px-5 pb-5">
            <p className="mb-4 text-[13px] text-ink-3">Complete the payment for your order</p>
            <div className="space-y-2 text-[13px] text-ink">
              <div className="flex justify-between"><span className="text-ink-3">Total Shipments</span><span>1</span></div>
              <div className="flex justify-between"><span className="text-ink-3">Shipping charges</span><span>{money(draft.rate, cur)}</span></div>
              <div className="flex justify-between"><span className="text-ink-3">Taxes</span><span>{money(taxes, cur)}</span></div>
              <div className="mt-3 flex justify-between border-t border-line pt-3 text-[15px] font-bold"><span>Payable Amount</span><span>{money(draft.rate + taxes, cur)}</span></div>
            </div>
            <div className="mt-5 flex [&>button]:w-full"><Button onClick={proceed}>{payLabel(choice, payable, cur)}</Button></div>
            {choice && <p className="mt-2 text-center text-[12px] text-ink-3">{choice.method === 'Wallet' ? 'Debited from your wallet' : choice.method === 'Card' ? 'Demo card payment' : choice.method === 'COD' ? 'Collected on delivery' : 'Added to this month’s invoice'}</p>}
          </div>
        </Panel>
      </div>
    </div>
  )
}
