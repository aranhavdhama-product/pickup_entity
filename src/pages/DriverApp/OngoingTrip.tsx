import { useState } from 'react'
import { Bell, EllipsisVertical, Map as MapIcon, TriangleAlert } from 'lucide-react'
import { Btn, IconBtn, ReasonList, Screen, Sheet, SwipeButton, Tabs, TopBar } from './ui'
import StopCard from './StopCard'
import { phoneToast } from './phoneToast'
import { isStopDone, stopKey, tripCounts } from './model'
import { planningActions, type LocalTrip, type PlanningDb } from '../LocalPFP/planningStore'

/** Every trip issue is on the carrier's side — the merchant did nothing wrong —
 *  so each maps to a carrier-side PICKUP_FAILURE_REASONS code. */
const ISSUES = [
  { code: 'breakdown', label: 'Vehicle breakdown', reason: 'VEHICLE_BREAKDOWN' },
  { code: 'accident', label: 'Accident', reason: 'ACCIDENT' },
  { code: 'sick', label: 'Feeling unwell / cannot continue', reason: 'DRIVER_UNAVAILABLE' },
]

export default function OngoingTripScreen({ trip, planning, onBack, onStop, onDebrief, onChecklist, onLoading }: {
  trip: LocalTrip
  planning: PlanningDb
  onBack: () => void
  onStop: (key: string) => void
  onDebrief: () => void
  onChecklist: () => void
  onLoading: () => void
}) {
  const [tab, setTab] = useState<'pending' | 'completed'>('pending')
  const [menu, setMenu] = useState(false)
  const [issue, setIssue] = useState<string | null>(null)
  const [issueOpen, setIssueOpen] = useState(false)
  const pending = trip.stops.filter((x) => !isStopDone(x, planning))
  const completed = trip.stops.filter((x) => isStopDone(x, planning))
  const running = trip.status === 'In Transit'
  const list = tab === 'pending' ? pending : completed
  const c = tripCounts(trip)
  const openPickups = pending.filter((x) => x.kind === 'pickup' && x.prId)

  const reportIssue = () => {
    const picked = ISSUES.find((i) => i.code === issue)
    const label = picked?.label ?? 'Trip issue'
    const reason = picked?.reason ?? 'DRIVER_UNAVAILABLE'
    openPickups.forEach((x) => planningActions.failPickupStop(trip.id, x.prId as string, reason, `Driver reported: ${label}`))
    planningActions.setTripAttention(trip.id, `Driver reported: ${label}`)
    setIssueOpen(false); setIssue(null)
    phoneToast(openPickups.length
      ? `Ops notified — ${openPickups.length} pickup${openPickups.length === 1 ? '' : 's'} released for re-attempt (${label})`
      : `Ops notified — ${label}`, 'success')
  }

  return (
    <Screen
      header={<>
        <TopBar
          title={running ? 'Ongoing Trip' : trip.status === 'Yet to start' ? 'Trip Details' : 'Trip'}
          sub={`${trip.id} · ${c.total} tasks · ${c.pickups} pick up`}
          onBack={onBack}
          right={<>
            <IconBtn label="Map" onClick={() => phoneToast('Map view is not part of the prototype')}><MapIcon size={19} /></IconBtn>
            <IconBtn label="Notifications" onClick={() => phoneToast(trip.attention ? `Ops: ${trip.attention}` : 'No new notifications')}><Bell size={19} /></IconBtn>
            <span className="relative">
              <IconBtn label="Trip options" onClick={() => setMenu((v) => !v)}><EllipsisVertical size={19} /></IconBtn>
              {menu && (
                <span role="menu" className="absolute right-0 top-10 z-30 w-48 rounded-xl border border-[#E3E8EF] bg-white py-1 shadow-lg">
                  <button type="button" role="menuitem" disabled={!running}
                    onClick={() => { setMenu(false); setIssueOpen(true) }}
                    className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-[15px] text-[#B42323] hover:bg-[#FDE8E8] disabled:opacity-40">
                    <TriangleAlert size={16} /> Report issue
                  </button>
                </span>
              )}
            </span>
          </>}
        />
        <Tabs value={tab} onChange={setTab} items={[
          { id: 'pending', label: `Pending (${pending.length})` },
          { id: 'completed', label: `Completed (${completed.length})` },
        ]} />
      </>}
      footer={
        trip.status === 'Yet to start' ? (
          <div className="grid grid-cols-2 gap-3">
            <Btn tone="secondary" onClick={onChecklist}>Start Checklist</Btn>
            <Btn onClick={onLoading}>Start Loading</Btn>
          </div>
        ) : trip.status === 'Yet to debrief' || (running && pending.length === 0) ? (
          <SwipeButton label="Go to Debrief" onConfirm={onDebrief} />
        ) : undefined
      }
      bodyClass="px-4 pb-4"
    >
      {trip.attention && (
        <div className="mt-3 rounded-xl bg-[#FDF3DC] px-3 py-2.5 text-[13px] font-bold text-[#94620F]">Ops notice: {trip.attention}</div>
      )}
      {!running && trip.status === 'Yet to start' && (
        <div className="mt-3 rounded-xl bg-[#E6EFF9] px-3 py-2.5 text-[13px] text-[#2F6FB5]">Finish the checklist and loading to start this trip.</div>
      )}
      {!list.length && (
        <div className="mt-10 text-center text-[15px] text-[#5B6B82]">
          {tab === 'pending' ? 'All stops are done.' : 'No completed stops yet.'}
        </div>
      )}
      <div className="mt-3 flex flex-col gap-3">
        {list.map((x) => <StopCard key={stopKey(x)} stop={x} planning={planning} onOpen={() => onStop(stopKey(x))} />)}
      </div>

      {issueOpen && (
        <Sheet title="Report issue" onClose={() => setIssueOpen(false)}
          footer={<Btn className="w-full" disabled={!issue} onClick={reportIssue}>Notify ops</Btn>}>
          <div className="mb-3 text-[13px] text-[#5B6B82]">
            {openPickups.length
              ? `${openPickups.length} remaining pick up stop${openPickups.length === 1 ? '' : 's'} will fail with a carrier-side reason (Driver no-show) and go back for re-attempt. Deliveries stay on the trip for ops to reassign.`
              : 'No pick up stops remain. Ops will be notified.'}
          </div>
          <ReasonList options={ISSUES} value={issue ?? ''} onChange={setIssue} />
        </Sheet>
      )}
    </Screen>
  )
}
