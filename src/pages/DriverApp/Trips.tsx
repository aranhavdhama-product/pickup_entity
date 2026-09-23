import { useState } from 'react'
import { Clock, EllipsisVertical, MapPin, Truck } from 'lucide-react'
import { Card, IconBtn, Screen, SectionLabel, TopBar } from './ui'
import { phoneToast } from './phoneToast'
import { dateLabel, openTripsOf, tripCounts, tripWindow } from './model'
import { hubName } from '../../growOrders/hubs'
import type { LocalTrip, PlanningDb } from '../LocalPFP/planningStore'

export default function TripsScreen({ driver, planning, onBack, onOpen }: {
  driver: string; planning: PlanningDb; onBack: () => void; onOpen: (t: LocalTrip) => void
}) {
  const trips = openTripsOf(planning.trips, driver)
  const [menu, setMenu] = useState<string | null>(null)
  const byDate = trips.reduce<Record<string, LocalTrip[]>>((acc, t) => { (acc[t.date] ??= []).push(t); return acc }, {})
  return (
    <Screen header={<TopBar title="Upcoming Trips" sub={`${trips.length} trip${trips.length === 1 ? '' : 's'}`} onBack={onBack} />} bodyClass="px-4 pb-6">
      {!trips.length && <div className="mt-10 text-center text-[15px] text-[#5B6B82]">No trips assigned to {driver}.</div>}
      {Object.entries(byDate).map(([d, list]) => (
        <div key={d}>
          <SectionLabel>{dateLabel(d)}</SectionLabel>
          <div className="flex flex-col gap-3">
            {list.map((t) => {
              const c = tripCounts(t)
              const w = tripWindow(t)
              return (
                <Card key={t.id} onClick={() => onOpen(t)} className="relative">
                  <div className="flex items-start gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#FDEBE3] text-[#D9542B]"><Truck size={20} /></span>
                    <div className="min-w-0 flex-1">
                      <div className="text-[15px] font-bold text-[#1B2A41]">{t.id}</div>
                      <div className="text-[13px] text-[#5B6B82]">{c.total} Total tasks · {c.deliveries} delivery · {c.pickups} pick up</div>
                    </div>
                    <span onClick={(e) => e.stopPropagation()} role="presentation">
                      <IconBtn label="Trip options" onClick={() => setMenu(menu === t.id ? null : t.id)}><EllipsisVertical size={18} /></IconBtn>
                    </span>
                  </div>
                  <div className="mt-3 flex items-center gap-4 border-t border-[#EEF1F5] pt-3 text-[13px] text-[#1B2A41]">
                    <span className="flex items-center gap-1.5"><Clock size={14} className="text-[#8A97AB]" />{w.start} – {w.end}</span>
                    <span className="flex min-w-0 items-center gap-1.5 truncate"><MapPin size={14} className="text-[#8A97AB]" />{hubName(t.hubCode) || t.hubCode}</span>
                  </div>
                  <div className="mt-2 text-[12px] font-bold text-[#8A97AB]">{t.status}</div>
                  {menu === t.id && (
                    <span role="menu" onClick={(e) => e.stopPropagation()}
                      className="absolute right-3 top-12 z-10 w-44 rounded-xl border border-[#E3E8EF] bg-white py-1 shadow-lg">
                      {['View on map', 'Call dispatcher'].map((l) => (
                        <button key={l} type="button" role="menuitem" onClick={() => { setMenu(null); phoneToast(`${l} is not part of the prototype`) }}
                          className="block w-full px-3 py-2 text-left text-[13px] text-[#1B2A41] hover:bg-[#F4F6F9]">{l}</button>
                      ))}
                    </span>
                  )}
                </Card>
              )
            })}
          </div>
        </div>
      ))}
    </Screen>
  )
}
