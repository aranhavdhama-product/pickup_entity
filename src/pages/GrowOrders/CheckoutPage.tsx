/**
 * Payment Gateway's "next page" — every other payment mode submits straight
 * from the Add Order form (its Shipment Summary rail already shows what a
 * generic checkout review would). This page only exists because a gateway
 * redirect/capture step means something: it simulates ANZ, then finalizes
 * the same way the form's direct-submit path does.
 */
import { useEffect, useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { CURRENCY } from '../../growOrders/seed'
import { finalizeOrder } from '../../growOrders/checkout'
import { toast } from '../../nueva/toast'
import { Button, PageHeader, Panel } from '../../nueva/components'
import { money } from './utils'
import { usePortalMerchant } from './pickupGate'
import {
  DRAFT_KEY, DRAFT_PICKUP_KEY, clearDraftKeys, readOverageSidecar, vehiclesOf,
  type OrderDraft, type OverageSidecar,
} from '../../growOrders/draft'

export default function CheckoutPage() {
  const nav = useNavigate()
  const [draft] = useState<OrderDraft | null>(() => { try { return JSON.parse(sessionStorage.getItem(DRAFT_KEY) || 'null') } catch { return null } })
  const [pickupId] = useState<string | null>(() => sessionStorage.getItem(DRAFT_PICKUP_KEY))
  /** Written by AddOrderPage's `?fromOverage=` flow — the scan this order answers. */
  const [ov] = useState<OverageSidecar | null>(readOverageSidecar)
  const portal = usePortalMerchant()
  /* no draft = nothing to pay for; clear any sidecar the abandoned stepper left,
     so the next order is never silently attached to that pickup or scan.
     In an effect, never in the render body — this is a side effect. */
  useEffect(() => { if (!draft) clearDraftKeys() }, [draft])
  if (!draft) {
    return (
      <div>
        <PageHeader title="Payment Gateway" subtitle="Complete the payment for your order" />
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
    const { redirectTo, message } = finalizeOrder(draft, {
      pickupId, overage: ov, merchantCode: portal.code,
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
      <PageHeader title="Payment Gateway" subtitle="Redirecting to ANZ to complete payment" onBack={() => nav(-1)}
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
          <Panel title="ANZ Payment Gateway">
            <div className="px-5 pb-5 pt-2 text-[13px] text-ink-2">
              This simulates the redirect to ANZ's hosted payment page. Proceed to capture payment and create the consignment.
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
            <div className="mt-5 flex [&>button]:w-full"><Button onClick={proceed}>Continue &amp; Capture Payment</Button></div>
          </div>
        </Panel>
      </div>
    </div>
  )
}
