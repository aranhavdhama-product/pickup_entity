import { Banknote, Clock, Flag, MessageSquareText, Navigation2, Phone, StickyNote, Weight } from 'lucide-react'
import { Card, Chip, IconBtn } from './ui'
import { phoneToast } from './phoneToast'
import { isReserved, pickupParty, stopOutcome, type StopOutcome } from './model'
import { orderById, pickupRequestById } from '../../growOrders/store'
import type { PlannedStop, PlanningDb } from '../LocalPFP/planningStore'

const OUTCOME_TONE: Record<StopOutcome, 'grey' | 'blue' | 'green' | 'amber' | 'red'> = {
  Pending: 'grey', Arrived: 'blue', Delivered: 'green', Picked: 'green', 'Partially picked': 'amber',
  'Not delivered': 'red', 'Pickup failed': 'red',
}

/** One numbered stop, Pilot style: type chip, contact row, address row, window chip, flags. */
export default function StopCard({ stop, planning, onOpen }: { stop: PlannedStop; planning: PlanningDb; onOpen: () => void }) {
  const outcome = stopOutcome(stop, planning)
  let who = '', phone = '', address = stop.address, windowLabel = `ETA ${stop.eta}`, title = stop.orderNumber
  const flags: { icon: React.ReactNode; label: string }[] = []
  if (stop.kind === 'pickup') {
    const pr = pickupRequestById(stop.prId)
    if (pr) {
      const p = pickupParty(pr)
      title = `${pr.number} · ${p.merchant}`
      who = p.contact || p.place
      phone = p.phone
      address = p.address || address
      windowLabel = pr.slot
      flags.push({ icon: <Flag size={13} />, label: isReserved(pr) ? `Reserved · count on arrival${pr.expectedPieces ? ` (~${pr.expectedPieces})` : ''}` : `${pr.orderIds.length} consignment${pr.orderIds.length === 1 ? '' : 's'} expected` })
      if (pr.instructions) flags.push({ icon: <StickyNote size={13} />, label: pr.instructions })
      if (pr.attempt > 1) flags.push({ icon: <Flag size={13} />, label: `Attempt ${pr.attempt} of ${pr.maxAttempts}` })
    }
  } else {
    const o = orderById(stop.orderId as string)
    if (o) {
      who = o.receiver.name
      phone = o.receiver.contactNumber
      address = [o.receiver.line1, o.receiver.city].filter(Boolean).join(', ') || address
      if (o.paymentMode === 'COD' && o.codAmount) flags.push({ icon: <Banknote size={13} />, label: `COD ${o.currency} ${o.codAmount.toLocaleString()}` })
      if (o.pkg.weightKg) flags.push({ icon: <Weight size={13} />, label: `${o.pkg.weightKg.toFixed(1)} kg` })
    }
  }
  const stopClick = (e: React.MouseEvent) => e.stopPropagation()
  return (
    <Card onClick={onOpen}>
      <div className="flex items-start gap-3">
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[15px] font-bold
          ${outcome === 'Pending' || outcome === 'Arrived' ? 'bg-[#1B2A41] text-white' : 'bg-[#E3F5EA] text-[#1C7C45]'}`}>
          {stop.seq}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <Chip tone={stop.kind === 'pickup' ? 'pickup' : 'delivery'}>{stop.kind === 'pickup' ? 'Pick Up' : 'Delivery'}</Chip>
            <Chip tone={OUTCOME_TONE[outcome]}>{outcome}</Chip>
          </div>
          <div className="mt-1.5 truncate text-[15px] font-bold text-[#1B2A41]">{title}</div>
        </div>
      </div>
      <div className="mt-3 flex items-center gap-2 border-t border-[#EEF1F5] pt-3">
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-bold text-[#1B2A41]">{who || '—'}</div>
          {phone && <div className="text-[12px] text-[#8A97AB]">+63 {phone}</div>}
        </div>
        <span onClick={stopClick} role="presentation" className="flex gap-1.5">
          <IconBtn label="Call" tone="soft" onClick={() => phoneToast(`Calling ${who || 'contact'}… (mock)`)}><Phone size={16} /></IconBtn>
          <IconBtn label="Chat" tone="soft" onClick={() => phoneToast('Chat is not part of the prototype')}><MessageSquareText size={16} /></IconBtn>
        </span>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <div className="min-w-0 flex-1 text-[13px] leading-snug text-[#5B6B82]">{address}</div>
        <span onClick={stopClick} role="presentation">
          <IconBtn label="Navigate" tone="soft" onClick={() => phoneToast('Navigation opens the maps app (mock)')}><Navigation2 size={16} /></IconBtn>
        </span>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <Chip tone="grey" icon={<Clock size={12} />}>{windowLabel}</Chip>
        {flags.map((f, i) => <Chip key={i} tone="amber" icon={f.icon}>{f.label}</Chip>)}
      </div>
    </Card>
  )
}
