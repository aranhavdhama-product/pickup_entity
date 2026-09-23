import { useState } from 'react'
import { MapPin, Navigation2, Phone } from 'lucide-react'
import { Btn, Card, Chip, IconBtn, ReasonList, Screen, Sheet, SwipeButton, TopBar } from './ui'
import { phoneToast } from './phoneToast'
import { stopOutcome } from './model'
import { orderById } from '../../growOrders/store'
import { planningActions, type LocalTrip, type PlannedStop, type PlanningDb } from '../LocalPFP/planningStore'

const FAIL_REASONS = [
  { code: 'Customer not available', label: 'Customer not available' },
  { code: 'Address not found', label: 'Address not found' },
  { code: 'Refused by customer', label: 'Refused by customer' },
  { code: 'Payment not ready (COD)', label: 'Payment not ready (COD)' },
]

/** A delivery, minimal: Arrive → Delivered / Failed via `completeDeliveryStop`. */
export default function DeliveryStopScreen({ trip, stop, planning, onBack, onDebrief, remainingAfter }: {
  trip: LocalTrip; stop: PlannedStop; planning: PlanningDb; onBack: () => void; onDebrief: () => void; remainingAfter: number
}) {
  const [failOpen, setFailOpen] = useState(false)
  const [reason, setReason] = useState('')
  const o = orderById(stop.orderId as string)
  const outcome = stopOutcome(stop, planning)
  const done = outcome === 'Delivered' || outcome === 'Not delivered'
  const running = trip.status === 'In Transit'
  const close = (failed: boolean, why = '') => {
    planningActions.completeDeliveryStop(trip.id, stop.orderId as string, failed ? 'Failed' : 'Delivered', why || undefined)
    phoneToast(failed ? `${stop.orderNumber} not delivered — ${why}` : `${stop.orderNumber} delivered`, failed ? 'info' : 'success')
    setFailOpen(false)
  }
  const cod = o && o.paymentMode === 'COD' && o.codAmount ? `${o.currency} ${o.codAmount.toLocaleString()}` : null

  return (
    <Screen
      header={<TopBar title={`Delivery · ${stop.orderNumber}`} sub={o?.receiver.name} onBack={onBack}
        right={<IconBtn label="Call" tone="soft" onClick={() => phoneToast(`Calling ${o?.receiver.name ?? 'customer'}… (mock)`)}><Phone size={16} /></IconBtn>} />}
      footer={
        done ? (remainingAfter === 0 ? <SwipeButton label="Go to Debrief" onConfirm={onDebrief} /> : <Btn className="w-full" onClick={onBack}>Next stop ({remainingAfter} left)</Btn>)
          : !running ? undefined
          : stop.status === 'Pending'
            ? <SwipeButton label="Arrive" onConfirm={() => { planningActions.arriveStop(trip.id, stop.orderId as string); phoneToast('Arrived') }} />
            : <div className="flex flex-col gap-2">
                <SwipeButton label={cod ? `Collect ${cod} & Deliver` : 'Delivered'} tone="green" onConfirm={() => close(false)} />
                <button type="button" onClick={() => setFailOpen(true)} className="h-11 text-[15px] font-bold text-[#B42323]">Failed delivery</button>
              </div>
      }
      bodyClass="px-4 pb-4"
    >
      <Card className="mt-4">
        <div className="flex items-start gap-2">
          <MapPin size={16} className="mt-0.5 shrink-0 text-[#8A97AB]" />
          <div className="min-w-0 flex-1">
            <div className="text-[15px] font-bold text-[#1B2A41]">{o?.receiver.name ?? '—'}</div>
            <div className="text-[13px] leading-snug text-[#5B6B82]">{o ? [o.receiver.line1, o.receiver.line2, o.receiver.city].filter(Boolean).join(', ') : stop.address}</div>
          </div>
          <IconBtn label="Navigate" tone="soft" onClick={() => phoneToast('Navigation opens the maps app (mock)')}><Navigation2 size={16} /></IconBtn>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          <Chip tone="delivery">Delivery</Chip>
          <Chip tone={done ? (outcome === 'Delivered' ? 'green' : 'red') : 'grey'}>{outcome}</Chip>
          <Chip tone="grey">ETA {stop.eta}</Chip>
          {cod && <Chip tone="amber">COD {cod}</Chip>}
        </div>
      </Card>
      {o && (
        <Card className="mt-3">
          <div className="text-[13px] text-[#5B6B82]">Package</div>
          <div className="text-[15px] text-[#1B2A41]">{o.pkg.count} × {o.pkg.kind} · {o.pkg.weightKg.toFixed(1)} kg</div>
          {o.trackingNumber && <div className="mt-1 text-[13px] text-[#5B6B82]">Tracking {o.trackingNumber}</div>}
        </Card>
      )}
      {!running && !done && <div className="mt-3 rounded-xl bg-[#E6EFF9] px-3 py-2.5 text-[13px] text-[#2F6FB5]">Start the trip before arriving at this stop.</div>}
      {failOpen && (
        <Sheet title="Failed delivery" onClose={() => setFailOpen(false)}
          footer={<Btn className="w-full" disabled={!reason} onClick={() => close(true, reason)}>Confirm</Btn>}>
          <ReasonList options={FAIL_REASONS} value={reason} onChange={setReason} />
        </Sheet>
      )}
    </Screen>
  )
}
