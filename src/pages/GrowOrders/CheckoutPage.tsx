/**
 * /grow/orders/checkout — Grow Create Order's STEP 2 · Service & payment (owner, 2026-10-06: "Service Type in next
 * step … in second page we have to show summary, ask for carrier selection and ask for payment method"). Step 1 is
 * the order form (`/grow/orders/add[/vehicle]`, no Service Type card); both pages show the same stepper
 * (`ORDER_STEPS`: Order details › Service & payment). ONE screen, in this order:
 *
 *   · Order summary — `CheckoutSummary`, one compact card; Edit goes back to step 1.
 *   · Service Type  — the lane's services (`quoteLane` on the draft — the same inputs the form priced, so the price
 *                     equals the form's estimate), the carrier on every card, Grid | List as the builder set it. The
 *                     form hands over what it offers in the `grow-order-draft-checkout` sidecar; when the builder
 *                     hides Service Type there is nothing to choose: the default service is a line in the summary.
 *   · Payment       — "How you pay" (Payment Mode, the COD amount and the remarks are asked on step 1, in the form's
 *                     Payment card, 2026-10-07 — they come in the draft's `consignment`): tick ONE OR MORE
 *                     methods (`SplitPaymentSheet`: Wallet · Card (demo) · Pay later on a Postpaid account · Cash on
 *                     delivery for a COD order) and split the payable amount; the amount follows the chosen service.
 *
 * The right rail (Total Shipments · Shipping · Taxes · Payable Amount, the split lines and what is left) carries the
 * ONE action, "Pay ₱ X and place order" / "Place order", enabled once a service is chosen and the amounts add up. It
 * creates the order from `withService(draft, quote)` and records the ledger debits (`recordSplitPayment`: one per
 * method used); a success panel says what was paid how and links the receipt, Billing (when something is due) and
 * the consignment. Back (chevron, stepper, "Back to order details", Edit) hands the draft WITH the chosen service
 * back to the form. Everything else is as before: overage-scan orders, the pickup-request attach,
 * `autoBookOnConsignment`, the frozen `charges`, `clearDraftKeys()`.
 */
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { CURRENCY } from '../../growOrders/seed'
import { inboundHubFor } from '../../growOrders/hubs'
import { growOrderActions, newOrderId, newOrderNumber, orderById, pickupRequestById } from '../../growOrders/store'
import type { GrowOrder, PaymentMode } from '../../growOrders/types'
import { toast } from '../../nueva/toast'
import { Button, PageHeader, Panel, WizardSteps } from '../../nueva/components'
import { money, ORDER_STEPS } from './utils'
import { usePortalMerchant } from './pickupGate'
import { isDue, recordSplitPayment, type LedgerEntry, type PaymentPart } from '../../growOrders/ledger'
import { bookableServices, quoteLane, type RateCurrency, type ServiceQuote } from '../../growOrders/rates'
import { SplitPaymentSheet } from './paymentSheet'
import { CheckoutSummary } from './CheckoutSummary'
import { ServiceTypeChooser } from './serviceCards'
import { paidNowOf, payNote, splitSummary, useSplitPayment } from './splitPayment'
import { CheckCircle2 } from 'lucide-react'
import {
  DRAFT_KEY, DRAFT_PICKUP_KEY, clearDraftKeys, readCheckoutSidecar, readOverageSidecar, vehiclesOf, volKg,
  type OrderDraft, type OverageSidecar,
  quoteOf,
} from '../../growOrders/draft'

/** Set once the order is placed — the success panel (the draft keys are already cleared). */
interface Placed { orderId: string; orderNumber: string; currency: string; parts: PaymentPart[]; entries: LedgerEntry[]; note: string }

/** The draft with the chosen service: what the order is made from, and what Back hands the form. A full vehicle
    also carries it as its `ftlServiceType` and in the synthetic FTL line's description. */
function withService(d: OrderDraft, q: Pick<ServiceQuote, 'code' | 'net' | 'days'>): OrderDraft {
  if (d.shipmentType !== 'FTL') return { ...d, service: q.code, rate: q.net, etaDays: q.days }
  const types = vehiclesOf(d).map((v) => v.vehicleType)
  return {
    ...d, service: q.code, ftlServiceType: q.code, rate: q.net, etaDays: q.days,
    parcels: d.parcels.map((p, i) => (i === 0 ? { ...p, itemInfo: [q.code, ...types, ...d.additionalServices].join(' · ') } : p)),
  }
}

export default function CheckoutPage() {
  const nav = useNavigate()
  const [draft] = useState<OrderDraft | null>(() => { try { return JSON.parse(sessionStorage.getItem(DRAFT_KEY) || 'null') } catch { return null } })
  const [pickupId] = useState<string | null>(() => sessionStorage.getItem(DRAFT_PICKUP_KEY))
  /** Written by the form's `?fromOverage=` flow — the scan this order answers. */
  const [ov] = useState<OverageSidecar | null>(readOverageSidecar)
  /** Written by the form's Continue — which services to offer, hidden or not, Grid | List, the label, where Back goes. */
  const [side] = useState(readCheckoutSidecar)
  /* step 1's Payment card (2026-10-07): Payment Mode, the COD amount and the remarks come with the draft */
  const payment: PaymentMode = draft?.consignment?.paymentMode === 'COD' ? 'COD' : 'Prepaid'
  const cod = payment === 'COD' ? draft?.consignment?.orderAmount ?? 0 : 0
  const remarks = draft?.consignment?.remarks?.trim() ?? ''
  const portal = usePortalMerchant()
  const [placed, setPlaced] = useState<Placed | null>(null)
  /* the currency the form quoted in (₱, or $ on the Chicago network); the form's tax rule: whole pesos, cents for dollars */
  const cur = draft?.currency || CURRENCY
  const rc: RateCurrency = cur === '$' ? '$' : '₱'
  const ftl = draft?.shipmentType === 'FTL'
  /* the lane's services, priced from the draft — the SAME inputs the form's estimate used */
  const quotes = useMemo<ServiceQuote[]>(() => {
    if (!draft) return []
    const all = bookableServices()
    const offered = side?.services.length ? all.filter((s) => side.services.includes(s.code)) : all
    return quoteLane({
      from: draft.sender, to: draft.receiver, drops: draft.drops, parcels: ftl ? draft.sourceParcels ?? [] : draft.parcels,
      mode: ftl ? 'ftl' : 'ltl', currency: rc, vas: draft.additionalServices, vehicles: ftl ? vehiclesOf(draft) : undefined,
    }, offered)
  }, [draft, side, ftl, rc])
  /* a service carried from the form (Back, a resumed draft, a quote, a pickup request) starts chosen */
  const [picked, setPicked] = useState(() => (draft ? (draft.shipmentType === 'FTL' ? draft.ftlServiceType || draft.service : draft.service) ?? '' : ''))
  const chosen = quotes.find((q) => q.code === picked) ?? (quotes.length === 1 ? quotes[0] : null)
  /** Service Type hidden on the Grow form: the default service, nothing to choose */
  const locked = !!side?.locked
  const carrier = ftl ? '2GO Logistics' : '2GO Express'
  const rate = chosen?.net ?? 0
  const taxes = cur === '$' ? Math.round(rate * 15) / 100 : Math.round(rate * 0.15)
  const payable = Math.round((rate + taxes) * 100) / 100
  /* how it is paid — the amount follows the chosen service (typed amounts reset when it changes) */
  const split = useSplitPayment({ amount: payable, currency: cur, allowCod: payment === 'COD' })
  const { parts, ready, reason } = split.choice
  const paidNow = paidNowOf(parts)
  /* no draft = nothing to pay for; clear any sidecar the abandoned form left,
     so the next order is never silently attached to that pickup or scan.
     In an effect, never in the render body — this is a side effect. */
  useEffect(() => { if (!draft) clearDraftKeys() }, [draft])
  /** Back to step 1 — the form restores this draft, with the service chosen here */
  const backToForm = () => {
    if (draft) {
      try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify(chosen ? withService(draft, chosen) : draft)) } catch { /* private mode */ }
    }
    if (((window.history.state as { idx?: number } | null)?.idx ?? 0) > 0) nav(-1)
    else nav(side?.back ?? '/grow/orders/add')
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
  /* an order created FOR an overage scan was ALREADY collected — it is born Picked Up on that request, and carries
     the scanned barcode as its tracking number. A stale sidecar (scan resolved elsewhere) falls back to a normal order. */
  const ovPr = ov ? pickupRequestById(ov.prId) : undefined
  const scan = ovPr?.overages.find((v) => v.id === ov?.overageId && !v.orderId)
  const forPr = pickupId ? pickupRequestById(pickupId) : undefined
  const linked = ovPr && scan ? `Overage scan ${scan.barcode} · ${ovPr.number}` : forPr ? `Pickup request ${forPr.number}` : ''
  /** why the order cannot be placed yet, in plain words */
  const blocked = !quotes.length ? 'No service can be booked on this route — please contact support.'
    : !chosen ? 'Choose a service.' : !ready ? reason ?? 'Choose how you pay.' : ''
  const proceed = () => {
    if (!chosen || blocked) return
    const d = withService(draft, chosen)
    const p0 = d.parcels[0]
    /* what makes a shipment a Document is the CARGO classification, not the packaging it happens to be in */
    const isDocument = p0.cargoType === 'Document'
    /** Every SKU / custom item across the packages, for the order record. */
    const items = d.parcels.flatMap((p) => p.items ?? [])
    /* resumed draft → update that same order; otherwise create a new one */
    const existing = d.orderId ? orderById(d.orderId) : undefined
    /** what the Create Consignment form collected beyond the legacy draft fields */
    const cf = d.consignment
    const booksVehicle = d.shipmentType === 'FTL' || !!cf?.dedicateTruck || !!d.vehicleType
    const o: GrowOrder = {
      /* newOrderId(), not `o${Date.now()}` — two orders checked out inside one
         millisecond would otherwise share an id */
      id: existing?.id ?? newOrderId(), orderNumber: cf?.orderNumber?.trim() || existing?.orderNumber || newOrderNumber(),
      orderType: cf?.consignmentType === 'Reverse' ? 'Reverse Order' : 'Forward Order',
      createdAt: existing?.createdAt ?? new Date().toISOString(), status: 'Order Created',
      storeCode: d.storeCode, inboundHubCode: inboundHubFor(d.receiver), sender: d.sender, receiver: d.receiver, drops: d.drops, shipmentType: d.shipmentType, vehicleType: booksVehicle ? d.vehicleType : '',
      /* FTL, or a dedicated-truck parcel consignment — both keep the booked vehicles */
      ...(booksVehicle ? { vehicleUnit: d.vehicleUnit, actualLoad: d.actualLoad, additionalServices: d.additionalServices,
        ...(d.vehicles?.length ? { vehicles: d.vehicles } : {}) } : {}),
      pkg: { kind: d.shipmentType === 'FTL' ? 'FTL' : isDocument ? 'Document' : 'Parcel', count: d.parcels.reduce((n, p) => n + p.quantity, 0),
        weightKg: d.parcels.reduce((n, p) => n + Math.max(p.weight, volKg(p)) * p.quantity, 0), lengthCm: p0.l, widthCm: p0.w, heightCm: p0.h,
        description: d.parcels.map((p) => p.itemInfo).filter(Boolean).join('; '),
        declaredValue: (d.sourceParcels ?? d.parcels).reduce((n, p) => n + (p.declaredValue ?? 0) * p.quantity, 0),
        /* carried onto the order so the view page can show what the form
           collected — the package preset and the SKU rows behind `description` */
        ...(d.shipmentType === 'FTL' ? {} : { cargoType: p0.cargoType, packageType: p0.packageTypeName ?? '', ...(items.length ? { items } : {}) }) },
      paymentMode: payment, codAmount: payment === 'COD' ? Number(cod) || 0 : 0, currency: cur,
      carrier: cf?.carrier || carrier, serviceType: d.service,
      trackingNumber: p0.trackingNumber?.trim() || '', pickupDate: '',
      /* the merchant is never a form field — it is recorded here, and on `consignment` */
      remarks: [d.authority, d.instructions, remarks,
        cf?.merchantCode || cf?.merchantName ? `Merchant: ${[cf.merchantCode, cf.merchantName].filter(Boolean).join(' · ')}` : ''].filter(Boolean).join(' · '),
      error: '',
      ...(cf ? { consignment: cf } : {}),
      /* paid at checkout — the order lands on the Ready for Pickup tab */
      paymentStatus: 'Paid', isDraft: false, pickupRequestId: null, pickedInRequestId: null, draft: null,
      /* FREEZE what was quoted. A rate card that changes tomorrow must not
         retroactively restate what this merchant already paid. */
      charges: cur === '$' ? { shipping: d.rate, tax: taxes, total: Math.round((d.rate + taxes) * 100) / 100, service: d.service } : quoteOf(d.rate, d.service),
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
    if (forPr && growOrderActions.attachOrdersToPickup(forPr.id, [o.id]).length > 0) {
      toast.success(`Consignment ${o.orderNumber} created and added to ${forPr.number}`)
      nav(`/grow/orders/pickups/${forPr.id}`)
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
  const dash = (n: number) => (chosen ? money(n, cur) : '—')
  return (
    <div>
      <PageHeader title="Checkout" subtitle="Choose the service and how you pay" onBack={backToForm}
        right={<Button variant="outline" onClick={backToForm}>Back to order details</Button>} />
      <WizardSteps steps={ORDER_STEPS} active={1} done={[0]} onSelect={(i) => { if (i === 0) backToForm() }} />
      {/* ONE choice on the left — which service (owner, 2026-10-07: "payment in the summary section, how to pay section"); the summary, the
          price and HOW YOU PAY are one column on the right. A hidden Service Type has nothing to choose: one centred column. */}
      <div className={locked ? 'mx-auto flex max-w-[760px] flex-col gap-4' : 'grid gap-4 lg:grid-cols-[1fr_420px]'}>
        <div className={`flex min-w-0 flex-col gap-4 ${locked ? 'hidden' : ''}`}>
          {!locked && (
            <Panel title={side?.label ?? 'Service Type'}>
              <div className="px-5 pb-5 pt-2">
                {quotes.length ? (
                  <ServiceTypeChooser hideMode vehiclesElsewhere ready mode={ftl ? 'ftl' : 'ltl'} onMode={() => undefined}
                    quotes={quotes} selected={chosen?.code ?? ''} onSelect={setPicked} currency={rc} fleet={[]} counts={{}}
                    onCount={() => undefined} fleetNote="" showErrors={false} layout={side?.layout ?? 'grid'} carrier={carrier} />
                ) : <p className="text-[13px] text-ink-3">No service can be booked on this route — please contact support.</p>}
              </div>
            </Panel>
          )}
        </div>
        <div className="min-w-0">
          {/* the right rail: PAYMENT FIRST (owner, 2026-10-07: "payment summary on top, without scrolling") — the price, how you pay and the
              button in one card whose footer stays in view — then the order it is for. The rail scrolls on its own when the screen is short. */}
          <div className="flex flex-col gap-4 lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto lg:pb-1">
            <section aria-label="Payment summary" className="rounded-xl border border-line bg-surface shadow-ds-1">
              <div className="flex items-baseline justify-between px-5 pb-1 pt-4">
                <h2 className="text-[15px] font-bold text-ink">Payment Summary</h2>
                <span className="text-[12px] text-ink-3">1 shipment</span>
              </div>
              <div className="px-5 pb-4">
                <div className="space-y-1.5 text-[13px] text-ink">
                  <div className="flex justify-between"><span className="text-ink-3">Shipping charges</span><span>{dash(rate)}</span></div>
                  <div className="flex justify-between"><span className="text-ink-3">Taxes</span><span>{dash(taxes)}</span></div>
                  <div className="flex justify-between border-t border-line pt-2 text-[15px] font-bold"><span>Payable Amount</span><span>{dash(payable)}</span></div>
                </div>
                {/* how you pay — in the same card as the price it pays (one or more ways; the split must add up) */}
                <div className="mt-3 border-t border-line pt-3">
                  <p className="text-[13px] font-bold text-ink">How you pay</p>
                  {chosen ? (
                    <div className="mt-2"><SplitPaymentSheet split={split} compact /></div>
                  ) : <p className="mt-0.5 text-[12px] text-ink-3">Choose a service to see what you pay.</p>}
                </div>
              </div>
              <div className="sticky bottom-0 rounded-b-xl border-t border-line bg-surface px-5 py-3">
                <div className="flex [&>button]:w-full">
                  <Button disabled={!!blocked} onClick={proceed}>{paidNow > 0 ? `Pay ${money(paidNow, cur)} and place order` : 'Place order'}</Button>
                </div>
                <p className="mt-1.5 text-center text-[12px] text-ink-3">
                  {blocked || (paidNow > 0 ? `${money(paidNow, cur)} is taken when you place the order.` : 'Nothing is taken now.')}
                </p>
              </div>
            </section>
            <CheckoutSummary rail draft={draft} onEdit={backToForm} linked={linked}
              service={chosen ? `${chosen.name} · ${carrier}` : undefined} />
          </div>
        </div>
      </div>
    </div>
  )
}
