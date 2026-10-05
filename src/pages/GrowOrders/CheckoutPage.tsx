/**
 * /order/checkout/ — the merchant's checkout, in TWO steps (owner, 2026-10-05: "allow me to select
 * multiple payment options and show summary in second step"), with a step indicator on top:
 *
 *   1 Payment — Payment Mode (Prepaid / COD, COD amount, remarks), then "How you pay": tick ONE OR MORE
 *               methods (`SplitPaymentSheet`: Wallet balance · Card / online (demo) · Pay later on a
 *               Postpaid account · Cash on delivery for a COD order) and split the payable amount
 *               between them. State = `splitPayment.ts` `useSplitPayment`, kept here so it survives
 *               a trip to step 2 and back. "Continue to summary" is enabled when the amounts add up.
 *   2 Summary — `CheckoutSummary`: a read-only review of the whole order and how it is paid, each
 *               order card with an Edit that returns to the consignment form (the form restores the
 *               session draft). "Pay ₱ X and place order" / "Place order" creates the order and records
 *               the ledger debits (`recordSplitPayment`: one per method used); a success panel says
 *               what was paid how and links the receipt, Billing (when something is due) and the
 *               consignment.
 *
 * The right rail (Total Shipments · Shipping · Taxes · Payable Amount, then the split lines and what
 * is left) shows on both steps. Everything else is as before: overage-scan orders, the pickup-request
 * attach, `autoBookOnConsignment`, the frozen `charges`, `clearDraftKeys()`.
 */
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { CURRENCY } from '../../growOrders/seed'
import { inboundHubFor } from '../../growOrders/hubs'
import { growOrderActions, newOrderId, newOrderNumber, orderById, pickupRequestById } from '../../growOrders/store'
import type { GrowOrder, PaymentMode } from '../../growOrders/types'
import { toast } from '../../nueva/toast'
import { Button, Input, MenuSelect, PageHeader, Panel, WizardSteps } from '../../nueva/components'
import { money } from './utils'
import { SFld } from '../../components/consignmentForm'
import { usePortalMerchant } from './pickupGate'
import { isDue, recordSplitPayment, type LedgerEntry, type PaymentPart } from '../../growOrders/ledger'
import { SplitPaymentSheet } from './paymentSheet'
import { CheckoutSummary } from './CheckoutSummary'
import { paidNowOf, partLabel, payNote, splitSummary, useSplitPayment } from './splitPayment'
import { CheckCircle2 } from 'lucide-react'
import {
  DRAFT_KEY, DRAFT_PICKUP_KEY, clearDraftKeys, readOverageSidecar, volKg,
  type OrderDraft, type OverageSidecar,
  quoteOf,
} from '../../growOrders/draft'

/** Set once the order is placed — the success panel (the draft keys are already cleared). */
interface Placed { orderId: string; orderNumber: string; currency: string; parts: PaymentPart[]; entries: LedgerEntry[]; note: string }

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
  const [step, setStep] = useState<1 | 2>(1)
  const top = useRef<HTMLDivElement>(null)
  const [placed, setPlaced] = useState<Placed | null>(null)
  /* the currency the form quoted in (₱, or $ on the Chicago network) — never re-quoted here;
     the form's tax rule: whole pesos, cents for dollars */
  const cur = draft?.currency || CURRENCY
  const rate = draft?.rate ?? 0
  const taxes = cur === '$' ? Math.round(rate * 15) / 100 : Math.round(rate * 0.15)
  const payable = Math.round((rate + taxes) * 100) / 100
  /* how it is paid — kept here (not in the sheet) so it survives a trip to the Summary and back */
  const split = useSplitPayment({ amount: payable, currency: cur, allowCod: payment === 'COD' })
  const { parts, left, ready, reason } = split.choice
  const paidNow = paidNowOf(parts)
  /* no draft = nothing to pay for; clear any sidecar the abandoned stepper left,
     so the next order is never silently attached to that pickup or scan.
     In an effect, never in the render body — this is a side effect. */
  useEffect(() => { if (!draft) clearDraftKeys() }, [draft])
  const goStep = (n: 1 | 2) => {
    if (n === 2 && !ready) return
    setStep(n)
    top.current?.scrollIntoView({ block: 'start' })
  }
  if (placed) {
    const first = placed.entries[0]
    const dueLater = placed.entries.some(isDue)
    return (
      <div className="mx-auto max-w-[720px]">
        <PageHeader title="Checkout" subtitle="Order placed" />
        <Panel>
          <div className="flex flex-col items-center px-8 py-10 text-center">
            <CheckCircle2 size={40} className="text-success-fg" />
            <p className="mt-3 text-[15px] font-bold text-ink">Consignment {placed.orderNumber} placed</p>
            <p className="mt-1 text-[13px] text-ink-2">{splitSummary(placed.parts, placed.currency)}</p>
            {dueLater && (
              <p className="mt-1 text-[13px] text-ink-3">
                {placed.parts.some((p) => p.method === 'Pay later') ? 'The amount billed later shows as Due in Billing. ' : ''}
                {placed.parts.some((p) => p.method === 'COD') ? 'The cash on delivery part is collected when the parcel is delivered.' : ''}
              </p>
            )}
            {placed.note && <p className="mt-1 text-[13px] text-ink-3">{placed.note}</p>}
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              {first && <Button variant="outline" onClick={() => nav(`/grow/orders/wallet/${first.id}`)}>{isDue(first) ? 'View payment' : 'View receipt'}</Button>}
              {dueLater && <Button variant="outline" onClick={() => nav('/grow/orders/billing')}>Open Billing</Button>}
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
  const p0 = draft.parcels[0]
  /* what makes a shipment a Document is the CARGO classification, not the
     packaging it happens to be in */
  const isDocument = p0.cargoType === 'Document'
  /** Every SKU / custom item across the packages, for the order record and the summary. */
  const items = draft.parcels.flatMap((p) => p.items ?? [])
  const proceed = () => {
    /* the amounts must add up — if something changed since step 1, go back and fix it there */
    if (!ready) { setStep(1); return }
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
    /* the Payments ledger (Wallet): one debit per method used — wallet / card paid, pay later / COD pending */
    const entries = recordSplitPayment(o, parts)
    split.remember()
    const paidNote = payNote(parts, cur)
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
      setPlaced({ orderId: o.id, orderNumber: o.orderNumber, currency: cur, parts, entries, note: `Pickup Request ${auto.number} scheduled.` })
      return
    }
    toast.success(`Consignment ${o.orderNumber} created · ${paidNote}`)
    setPlaced({ orderId: o.id, orderNumber: o.orderNumber, currency: cur, parts, entries, note: '' })
  }
  return (
    <div ref={top} className="scroll-mt-4">
      <PageHeader title="Checkout" subtitle={step === 1 ? 'Choose how you pay' : 'Check your order, then place it'}
        onBack={() => (step === 2 ? goStep(1) : nav(-1))}
        right={<Button variant="outline" onClick={() => nav(-1)}>Back to consignment</Button>} />
      <WizardSteps steps={['Payment', 'Summary']} active={step - 1} done={step === 2 ? [0] : []}
        onSelect={(i) => goStep(i === 0 ? 1 : 2)} />
      <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
        {step === 1 ? (
          <div className="flex min-w-0 flex-col gap-4">
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
            <Panel title="How you pay">
              <div className="px-5 pb-5 pt-2">
                <p className="mb-3 text-[12px] text-ink-3">
                  Choose one or more ways to pay the {money(payable, cur)}. If you use more than one, type how much each one pays. Your choice is remembered.
                </p>
                <SplitPaymentSheet split={split} />
              </div>
            </Panel>
          </div>
        ) : (
          <CheckoutSummary draft={draft} currency={cur} remarks={remarks} paymentMode={payment} codAmount={cod}
            parts={parts} payable={payable} onEditOrder={() => nav(-1)} onEditPayment={() => goStep(1)} />
        )}
        <div>
          <div className="lg:sticky lg:top-4">
            <Panel title="Payment Summary">
              <div className="px-5 pb-5">
                <p className="mb-4 text-[13px] text-ink-3">Complete the payment for your order</p>
                <div className="space-y-2 text-[13px] text-ink">
                  <div className="flex justify-between"><span className="text-ink-3">Total Shipments</span><span>1</span></div>
                  <div className="flex justify-between"><span className="text-ink-3">Shipping charges</span><span>{money(draft.rate, cur)}</span></div>
                  <div className="flex justify-between"><span className="text-ink-3">Taxes</span><span>{money(taxes, cur)}</span></div>
                  <div className="mt-3 flex justify-between border-t border-line pt-3 text-[15px] font-bold"><span>Payable Amount</span><span>{money(payable, cur)}</span></div>
                </div>
                {parts.length > 0 && (
                  <div className="mt-3 space-y-2 border-t border-line pt-3 text-[13px] text-ink" aria-label="How you pay">
                    {parts.map((p) => (
                      <div key={p.method} className="flex justify-between gap-3">
                        <span className="text-ink-3">{partLabel(p)}</span><span className="tabular-nums">{money(p.amount, cur)}</span>
                      </div>
                    ))}
                    <div className="flex justify-between gap-3 font-bold">
                      <span className="text-ink-3">{left < 0 ? 'Too much' : 'Remaining'}</span>
                      <span className={`tabular-nums ${left === 0 ? 'text-success-fg' : 'text-danger-fg'}`}>{money(Math.abs(left), cur)}</span>
                    </div>
                  </div>
                )}
                <div className="mt-5 flex [&>button]:w-full">
                  {step === 1
                    ? <Button disabled={!ready} onClick={() => goStep(2)}>Continue to summary</Button>
                    : <Button onClick={proceed}>{paidNow > 0 ? `Pay ${money(paidNow, cur)} and place order` : 'Place order'}</Button>}
                </div>
                {step === 1 && !ready && reason && <p className="mt-2 text-center text-[12px] text-ink-3">{reason}</p>}
                {step === 2 && <p className="mt-2 text-center text-[12px] text-ink-3">{paidNow > 0 ? `${money(paidNow, cur)} is taken when you place the order.` : 'Nothing is taken now.'}</p>}
              </div>
            </Panel>
          </div>
        </div>
      </div>
    </div>
  )
}
