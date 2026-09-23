import { useEffect, useState } from 'react'
import { Check, Clock, PackagePlus, RefreshCw, Warehouse } from 'lucide-react'
import { Card, Chip, Screen, SectionLabel, SwipeButton, TopBar } from './ui'
import { orderLabel } from './model'
import { pickupRequestById } from '../../growOrders/store'
import { hubName } from '../../growOrders/hubs'
import { isHandedOver } from '../../growOrders/tabs'
import type { HandoverMode } from '../../growOrders/types'
import type { LocalTrip, PlanningDb } from '../LocalPFP/planningStore'

const MODE_TEXT: Record<HandoverMode, string> = {
  driver: 'Your scans at the door are the custody record — the handover closed when you scanned; nothing to scan here.',
  hub: 'The hub in-scan is the pickup record. Hand every parcel to the hub operator for scanning.',
  both: 'The hub will scan each item; ticks appear as they do.',
}

/** Back at the hub: what was collected, per request, with the hub's in-scans ticking in live. */
export default function DebriefScreen({ trip, planning, onBack, onComplete }: {
  trip: LocalTrip; planning: PlanningDb; onBack: () => void; onComplete: () => void
}) {
  const prs = trip.stops.filter((x) => x.kind === 'pickup' && x.prId).map((x) => pickupRequestById(x.prId)).filter((p) => !!p)
  const deliveries = trip.stops.filter((x) => x.kind === 'delivery')
  const delivered = deliveries.filter((x) => x.status === 'Done' || (x.orderId && planning.closures[x.orderId]?.outcome !== 'Failed' && planning.closures[x.orderId])).length
  const totalPicked = prs.reduce((n, p) => n + p.pickedOrderIds.length, 0)
  const totalHub = prs.reduce((n, p) => n + p.pickedOrderIds.filter((i) => p.handover.hubScanned.includes(i)).length, 0)
  const hub = hubName(trip.hubCode) || trip.hubCode
  /* the Grow store has no cross-tab listener: a hub in-scan made in another
     tab (Inbound → Scanner) lands in localStorage only — offer the reload */
  const [stale, setStale] = useState(false)
  useEffect(() => {
    const on = (e: StorageEvent) => { if (e.key?.startsWith('fareye-grow-orders')) setStale(true) }
    window.addEventListener('storage', on)
    return () => window.removeEventListener('storage', on)
  }, [])
  return (
    <Screen
      header={<TopBar title="Debrief" sub={`${trip.id} · hand over at ${hub}`} onBack={onBack} />}
      footer={<SwipeButton label="Complete debrief" tone="green" onConfirm={onComplete} />}
      bodyClass="px-4 pb-4"
    >
      <Card className="mt-4">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#E6EFF9] text-[#2F6FB5]"><Warehouse size={22} /></span>
          <div className="min-w-0 flex-1">
            <div className="text-[15px] font-bold text-[#1B2A41]">Hand over at hub</div>
            <div className="text-[13px] text-[#5B6B82]">{hub}</div>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          <Stat n={totalPicked} label="Collected" />
          <Stat n={totalHub} label="Hub scanned" />
          <Stat n={delivered} label={`of ${deliveries.length} delivered`} />
        </div>
      </Card>

      {stale && (
        <button type="button" onClick={() => window.location.reload()}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-[#E6EFF9] px-3 py-2.5 text-[13px] font-bold text-[#2F6FB5]">
          <RefreshCw size={14} /> New hub scans recorded — tap to refresh
        </button>
      )}
      {!prs.length && <div className="mt-6 text-center text-[15px] text-[#5B6B82]">No pickups on this trip — nothing to hand over.</div>}

      {prs.map((p) => {
        const mode = p.handover.mode
        const handed = isHandedOver(p)
        return (
          <div key={p.id}>
            <SectionLabel right={<Chip tone={p.status === 'Completed' ? (handed ? 'green' : 'blue') : 'red'}>{p.status === 'Completed' ? (handed ? 'Handed Over' : `${p.pickedOrderIds.length} picked`) : p.status}</Chip>}>
              {p.number}
            </SectionLabel>
            <Card pad="none">
              <div className="px-4 py-3 text-[13px] text-[#5B6B82]">{MODE_TEXT[mode]}</div>
              {p.pickedOrderIds.map((id) => {
                const hubbed = p.handover.hubScanned.includes(id)
                const drv = p.handover.driverScanned.includes(id)
                return (
                  <div key={id} className="flex items-center gap-3 border-t border-[#EEF1F5] px-4 py-3">
                    <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${hubbed || (mode === 'driver' && drv) ? 'bg-[#1F9D55] text-white' : 'bg-[#F4F6F9] text-[#8A97AB]'}`}>
                      {hubbed || (mode === 'driver' && drv) ? <Check size={15} strokeWidth={3} /> : <Clock size={14} />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[15px] font-bold text-[#1B2A41]">{orderLabel(id)}</div>
                      <div className="text-[12px] text-[#8A97AB]">
                        {drv ? 'Driver scanned' : 'Not driver scanned'} · {hubbed ? 'Hub in-scanned' : mode === 'driver' ? 'no hub scan needed' : 'waiting for hub scan'}
                      </div>
                    </div>
                  </div>
                )
              })}
              {p.overages.length > 0 && (
                <div className="flex items-center gap-2 border-t border-[#EEF1F5] px-4 py-3 text-[13px] text-[#94620F]">
                  <PackagePlus size={16} /> {p.overages.length} overage{p.overages.length === 1 ? '' : 's'} — hand to the hub's Overage desk
                </div>
              )}
              {!p.pickedOrderIds.length && !p.overages.length && (
                <div className="border-t border-[#EEF1F5] px-4 py-3 text-[13px] text-[#5B6B82]">Nothing collected.</div>
              )}
            </Card>
          </div>
        )
      })}
      <div className="mt-4 text-center text-[12px] text-[#8A97AB]">Hub in-scans come from Inbound → Scanner.</div>
    </Screen>
  )
}

function Stat({ n, label }: { n: number; label: string }) {
  return (
    <div className="rounded-xl bg-[#F4F6F9] py-2">
      <div className="text-[20px] font-bold text-[#1B2A41]">{n}</div>
      <div className="text-[11px] text-[#5B6B82]">{label}</div>
    </div>
  )
}
