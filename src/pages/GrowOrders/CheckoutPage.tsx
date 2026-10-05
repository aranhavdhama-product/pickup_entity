/**
 * Checkout — the step after Add Order for every consignment, not just a Payment Gateway
 * redirect: the Shipment Summary review and the Payment widget (method picker, saved cards,
 * PO linking, wallet balance) both moved here from Add Order (2026-10-05), so Add Order can run
 * full width like the console's Add Consignment form. Payment Gateway keeps its own "simulate
 * the redirect, then capture" copy; every other mode finalizes the same way from here.
 */
import { useEffect, useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { CircleDot, CreditCard, Plus } from 'lucide-react'
import { CURRENCY } from '../../growOrders/seed'
import { finalizeOrder } from '../../growOrders/checkout'
import { toast } from '../../nueva/toast'
import { Button, Input, MenuSelect, PageHeader, Panel } from '../../nueva/components'
import { Fld } from '../../components/consignmentForm'
import { money } from './utils'
import { usePortalMerchant } from './pickupGate'
import { currentMerchant, useMasters, useMerchantCode } from '../../growOrders/masters'
import {
  DRAFT_KEY, DRAFT_PICKUP_KEY, clearDraftKeys, readOverageSidecar, vehiclesOf,
  type OrderDraft, type OverageSidecar,
} from '../../growOrders/draft'

/** payment options for the Payment widget — a gateway pick determines the next step
 * (simulate the redirect, then capture) rather than collecting an amount inline; Wallet
 * checks the merchant's pre-loaded balance against the order total instead. */
const PAYMENT_OPTIONS = [
  { code: 'COD', label: 'Cash on Delivery', sub: 'Collected by the driver on delivery' },
  { code: 'Card', label: 'Card', sub: "Charged to the customer's card" },
  { code: 'Wallet', label: 'Wallet', sub: 'Pay from your pre-loaded FarEye wallet balance' },
  { code: 'Payment Gateway (ANZ)', label: 'Payment Gateway', sub: 'ANZ — redirects to complete payment' },
]
/** sample pre-loaded balance — the portal has no wallet API yet (see Wallet in the nav) */
const WALLET_BALANCE = 1250
/** sample saved cards — the portal has no card-vault API; a merchant can also add a new one */
const SAVED_CARDS = [
  { id: 'card_1', brand: 'Visa', last4: '4242', expiry: '08/27' },
  { id: 'card_2', brand: 'Mastercard', last4: '5678', expiry: '11/26' },
]
/** sample purchase orders for a postpaid (po) merchant — no PO API exists yet */
const MERCHANT_PURCHASE_ORDERS = [
  { poNumber: 'PO-10234', totalAmount: 5000, remainingAmount: 1820 },
  { poNumber: 'PO-10251', totalAmount: 2000, remainingAmount: 2000 },
  { poNumber: 'PO-10267', totalAmount: 800, remainingAmount: 120 },
]

/** A minimal labelled field — this page only ever needs a searchable select or a plain input. */
function F({ label, required, value, options, onChange, placeholder, error, type }: {
  label: string; required?: boolean; value: string; options?: { value: string; label?: string }[]
  onChange: (v: string) => void; placeholder?: string; error?: string; type?: string
}) {
  const optLabel = (v: string) => options?.find((o) => o.value === v)?.label ?? v
  const control = options
    ? <MenuSelect value={value} placeholder={placeholder ?? 'Select'} options={options.map((o) => o.value)} labels={optLabel}
        searchable={options.length > 8} onChange={onChange} />
    : <Input type={type} value={value} placeholder={placeholder} onChange={onChange} />
  return <Fld label={label} required={required} error={!!error} helper={error}>{control}</Fld>
}

export default function CheckoutPage() {
  const nav = useNavigate()
  const [draft] = useState<OrderDraft | null>(() => { try { return JSON.parse(sessionStorage.getItem(DRAFT_KEY) || 'null') } catch { return null } })
  const [pickupId] = useState<string | null>(() => sessionStorage.getItem(DRAFT_PICKUP_KEY))
  /** Written by AddOrderPage's `?fromOverage=` flow — the scan this order answers. */
  const [ov] = useState<OverageSidecar | null>(readOverageSidecar)
  const portal = usePortalMerchant()
  const masters = useMasters()
  const merchantCode = useMerchantCode()
  const signedIn = currentMerchant(masters.merchants, merchantCode)
  /* the merchant the ORDER is for — a CSR's behalf-of pick, already on the draft; the CSR
     themself otherwise has none, so this falls back to whoever is signed in */
  const merchant = currentMerchant(masters.merchants, draft?.consignment?.merchantCode ?? null) ?? signedIn
  const poLinked = !!signedIn?.isCsr || merchant?.postpaidTerms === 'po'
  const noPaymentNeeded = !poLinked && merchant?.postpaidTerms === 'none'

  /* ---- Payment: Card picks a saved card or a freshly-typed one; postpaid (po) links a PO ---- */
  const [paymentMode, setPaymentMode] = useState('')
  const [selectedCard, setSelectedCard] = useState('')
  const [addingCard, setAddingCard] = useState(false)
  const [newCard, setNewCard] = useState({ number: '', name: '', expiry: '', cvv: '' })
  const cardOk = selectedCard !== '' || (addingCard && !!newCard.number.trim() && !!newCard.name.trim() && !!newCard.expiry.trim() && !!newCard.cvv.trim())
  const [selectedPo, setSelectedPo] = useState('')
  const [showErrors, setShowErrors] = useState(false)
  const paymentOk = noPaymentNeeded || (poLinked ? !!selectedPo : !!paymentMode && (paymentMode !== 'Card' || cardOk))

  /* no draft = nothing to pay for; clear any sidecar the abandoned stepper left,
     so the next order is never silently attached to that pickup or scan.
     In an effect, never in the render body — this is a side effect. */
  useEffect(() => { if (!draft) clearDraftKeys() }, [draft])
  if (!draft) {
    return (
      <div>
        <PageHeader title="Checkout" subtitle="Review and pay for your order" />
        <Panel>
          <p className="px-5 py-5 text-[13px] text-ink-2">
            Nothing to check out. <Link to="/grow/orders/add" className="font-bold text-brand-500 hover:text-brand-600">Create a consignment</Link>
          </p>
        </Panel>
      </div>
    )
  }
  const p0 = draft.parcels[0]
  const items = draft.parcels.flatMap((p) => p.items ?? [])
  const proceed = () => {
    if (!paymentOk) { setShowErrors(true); return }
    const finalDraft: OrderDraft = { ...draft, consignment: { ...draft.consignment, paymentMode } }
    const { redirectTo, message } = finalizeOrder(finalDraft, {
      pickupId, overage: ov, merchantCode: draft.consignment?.merchantCode ?? portal.code,
    })
    clearDraftKeys()
    toast.success(message)
    nav(redirectTo)
  }
  const taxes = Math.round(draft.rate * 0.15)
  const line = (k: string, v: ReactNode, key?: number) => (
    <p key={key} className="mt-1 first:mt-0"><span className="text-ink-3">{k} </span>{v}</p>
  )
  return (
    <div>
      <PageHeader title="Checkout" subtitle="Review your shipment and complete payment" onBack={() => nav(-1)}
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

          {!noPaymentNeeded && (
            <Panel title="Payment">
              <div className="px-5 pb-5 pt-2">
                {poLinked ? (
                  <div className="max-w-sm">
                    <F label="Purchase Order" required value={selectedPo} onChange={setSelectedPo}
                      placeholder={`Search ${MERCHANT_PURCHASE_ORDERS.length} purchase orders…`}
                      options={MERCHANT_PURCHASE_ORDERS.map((po) => ({
                        value: po.poNumber,
                        label: `${po.poNumber} — Remaining ${money(po.remainingAmount, CURRENCY)} of ${money(po.totalAmount, CURRENCY)}`
                          + (po.remainingAmount < draft.rate ? ' (Insufficient)' : ''),
                      }))}
                      error={showErrors && !selectedPo ? 'Select a purchase order to continue.' : undefined} />
                    {selectedPo && (() => {
                      const po = MERCHANT_PURCHASE_ORDERS.find((p) => p.poNumber === selectedPo)!
                      const sufficient = po.remainingAmount >= draft.rate
                      return (
                        <div className="mt-3 rounded-md border border-line bg-warm-25 px-3.5 py-3">
                          <div className="flex items-center justify-between text-[13px]">
                            <span className="text-ink-3">Remaining on {po.poNumber}</span>
                            <span className="font-bold text-ink">{money(po.remainingAmount, CURRENCY)} of {money(po.totalAmount, CURRENCY)}</span>
                          </div>
                          {sufficient ? (
                            <p className="mt-1.5 text-[12px] text-success-fg">Sufficient to cover this order ({money(draft.rate, CURRENCY)}).</p>
                          ) : (
                            <p className="mt-1.5 text-[12px] text-danger-fg">Insufficient — this order exceeds the remaining balance by {money(draft.rate - po.remainingAmount, CURRENCY)}.</p>
                          )}
                        </div>
                      )
                    })()}
                  </div>
                ) : (
                  <>
                    <div className="grid gap-2">
                      {PAYMENT_OPTIONS.map((opt) => {
                        const on = paymentMode === opt.code
                        return (
                          <button key={opt.code} type="button" onClick={() => setPaymentMode(opt.code)} role="radio" aria-checked={on}
                            className={`flex items-center gap-3 rounded-md border bg-surface px-3.5 py-2.5 text-left transition-colors
                              ${on ? 'border-brand-500 bg-brand-50/30' : 'border-line text-ink-2 hover:border-warm-300'}`}>
                            {on
                              ? <CircleDot size={15} className="shrink-0 text-brand-500" />
                              : <span className="h-[15px] w-[15px] shrink-0 rounded-full border border-warm-300" />}
                            <div className="min-w-0 flex-1">
                              <span className="block text-[13.5px] font-bold text-ink">{opt.label}</span>
                              <span className="block text-[12px] text-ink-3">{opt.sub}</span>
                            </div>
                          </button>
                        )
                      })}
                    </div>

                    {paymentMode === 'Card' && (
                      <div className="mt-4">
                        <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.08em] text-ink-3">Saved cards</p>
                        <div className="grid gap-2 sm:grid-cols-2">
                          {SAVED_CARDS.map((cd) => {
                            const on = selectedCard === cd.id
                            return (
                              <button key={cd.id} type="button"
                                onClick={() => { setSelectedCard(cd.id); setAddingCard(false) }} role="radio" aria-checked={on}
                                className={`flex items-center gap-3 rounded-md border bg-surface px-3.5 py-2.5 text-left transition-colors
                                  ${on ? 'border-brand-500 bg-brand-50/30' : 'border-line text-ink-2 hover:border-warm-300'}`}>
                                {on
                                  ? <CircleDot size={15} className="shrink-0 text-brand-500" />
                                  : <span className="h-[15px] w-[15px] shrink-0 rounded-full border border-warm-300" />}
                                <CreditCard size={16} className="shrink-0 text-ink-3" />
                                <div className="min-w-0 flex-1">
                                  <span className="block text-[13px] font-bold text-ink">{cd.brand} •••• {cd.last4}</span>
                                  <span className="block text-[12px] text-ink-3">Expires {cd.expiry}</span>
                                </div>
                              </button>
                            )
                          })}
                          <button type="button" onClick={() => { setAddingCard(true); setSelectedCard('') }}
                            className={`flex items-center justify-center gap-2 rounded-md border border-dashed px-3.5 py-2.5 text-[13px] font-bold transition-colors
                              ${addingCard ? 'border-brand-500 bg-brand-50/30 text-brand-500' : 'border-warm-300 text-brand-500 hover:border-brand-500 hover:bg-brand-50/40'}`}>
                            <Plus size={14} /> Add new card
                          </button>
                        </div>
                        {addingCard && (
                          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <F label="Card Number" value={newCard.number} placeholder="1234 5678 9012 3456"
                              onChange={(v) => setNewCard((x) => ({ ...x, number: v }))} />
                            <F label="Name on Card" value={newCard.name} placeholder="John Doe"
                              onChange={(v) => setNewCard((x) => ({ ...x, name: v }))} />
                            <F label="Expiry" value={newCard.expiry} placeholder="MM/YY"
                              onChange={(v) => setNewCard((x) => ({ ...x, expiry: v }))} />
                            <F label="CVV" type="password" value={newCard.cvv} placeholder="123"
                              onChange={(v) => setNewCard((x) => ({ ...x, cvv: v }))} />
                          </div>
                        )}
                        {showErrors && !cardOk && <p className="mt-2 text-[12.5px] text-brand-500">Pick a saved card or add new card details.</p>}
                      </div>
                    )}

                    {paymentMode === 'Wallet' && (
                      <div className="mt-4 rounded-md border border-line bg-warm-25 px-3.5 py-3">
                        <div className="flex items-center justify-between text-[13px]">
                          <span className="text-ink-3">Wallet balance</span>
                          <span className="font-bold text-ink">{money(WALLET_BALANCE, CURRENCY)}</span>
                        </div>
                        {WALLET_BALANCE >= draft.rate ? (
                          <p className="mt-1.5 text-[12px] text-success-fg">Sufficient balance to cover this order ({money(draft.rate, CURRENCY)}).</p>
                        ) : (
                          <p className="mt-1.5 text-[12px] text-danger-fg">Insufficient balance — top up {money(draft.rate - WALLET_BALANCE, CURRENCY)} more to pay with wallet.</p>
                        )}
                      </div>
                    )}

                    {paymentMode === 'Payment Gateway (ANZ)' && (
                      <div className="mt-4 rounded-md border border-line bg-warm-25 px-3.5 py-3">
                        <p className="text-[12.5px] text-ink-3">This simulates the redirect to ANZ's hosted payment page. Continue below to capture payment and create the consignment.</p>
                      </div>
                    )}

                    {showErrors && !paymentMode && <p className="mt-3 text-[12.5px] text-brand-500">Select a payment method to continue.</p>}
                  </>
                )}
              </div>
            </Panel>
          )}
        </div>
        <Panel title="Payment Summary">
          <div className="px-5 pb-5">
            <p className="mb-4 text-[13px] text-ink-3">{noPaymentNeeded ? 'Invoiced later — nothing to pay now.' : 'Complete the payment for your order'}</p>
            <div className="space-y-2 text-[13px] text-ink">
              <div className="flex justify-between"><span className="text-ink-3">Total Shipments</span><span>1</span></div>
              <div className="flex justify-between"><span className="text-ink-3">Shipping charges</span><span>{money(draft.rate, CURRENCY)}</span></div>
              <div className="flex justify-between"><span className="text-ink-3">Taxes</span><span>{money(taxes, CURRENCY)}</span></div>
              <div className="mt-3 flex justify-between border-t border-line pt-3 text-[15px] font-bold"><span>Payable Amount</span><span>{money(draft.rate + taxes, CURRENCY)}</span></div>
            </div>
            <div className="mt-5 flex [&>button]:w-full">
              <Button onClick={proceed}>{paymentMode === 'Payment Gateway (ANZ)' ? 'Continue & Capture Payment' : 'Create Consignment'}</Button>
            </div>
          </div>
        </Panel>
      </div>
    </div>
  )
}
