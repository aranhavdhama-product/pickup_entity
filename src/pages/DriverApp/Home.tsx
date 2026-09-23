import { CalendarDays, ChevronRight, ClipboardCheck, Clock, PackageOpen, Truck } from 'lucide-react'
import { BottomNav, Btn, Card, Screen } from './ui'
import { phoneToast } from './phoneToast'
import { currentTrip, dateLabel, initials, isStopDone, openTripsOf, startsIn, today, tripCounts, tripWindow } from './model'
import type { LocalTrip, PlanningDb } from '../LocalPFP/planningStore'

export default function HomeScreen({ driver, planning, checklistDone, onProfile, onTrips, onChecklist, onLoading, onOpenTrip, onDebrief }: {
  driver: string
  planning: PlanningDb
  checklistDone: (tripId: string) => boolean
  onProfile: () => void
  onTrips: () => void
  onChecklist: (t: LocalTrip) => void
  onLoading: (t: LocalTrip) => void
  onOpenTrip: (t: LocalTrip) => void
  onDebrief: (t: LocalTrip) => void
}) {
  const open = openTripsOf(planning.trips, driver)
  const todays = open.filter((t) => t.date <= today())
  /* same list the Upcoming Trips screen shows: every open trip of this driver */
  const upcoming = open
  const tasks = todays.reduce((acc, t) => {
    const c = tripCounts(t)
    return { d: acc.d + c.deliveries, p: acc.p + c.pickups }
  }, { d: 0, p: 0 })
  const cur = currentTrip(planning.trips, driver)
  const vehicle = cur?.vehicle ?? open[0]?.vehicle ?? 'No vehicle assigned'
  const hour = new Date().getHours()
  const greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

  return (
    <Screen
      header={
        <div className="flex shrink-0 items-center gap-3 bg-white px-4 pb-4 pt-3">
          <button type="button" onClick={onProfile} aria-label="Profile"
            className="flex h-11 w-11 items-center justify-center rounded-full bg-[#1B2A41] text-[15px] font-bold text-white">
            {initials(driver)}
          </button>
          <div className="min-w-0 flex-1">
            <div className="text-[13px] text-[#5B6B82]">{greet},</div>
            <div className="truncate text-[17px] font-bold text-[#1B2A41]">Hi {driver.split(' ')[0]}</div>
          </div>
          <span className="flex items-center gap-1.5 rounded-full bg-[#F4F6F9] px-3 py-1.5 text-[12px] font-bold text-[#1B2A41]">
            <Truck size={14} className="text-[#D9542B]" />{vehicle}
          </span>
        </div>
      }
      nav={<BottomNav active="home" onHome={() => undefined} onOther={(l) => phoneToast(`${l} is not part of the prototype`)} />}
      bodyClass="px-4 pb-4"
    >
      <div className="mt-4 grid grid-cols-2 gap-3">
        <Card onClick={() => (cur && cur.status !== 'Yet to start' ? onOpenTrip(cur) : onTrips())}>
          <PackageOpen size={22} className="text-[#D9542B]" />
          <div className="mt-3 text-[13px] text-[#5B6B82]">Today's Task</div>
          <div className="text-[28px] font-bold leading-tight text-[#1B2A41]">{tasks.d + tasks.p}</div>
          <div className="mt-1 text-[12px] text-[#8A97AB]">{tasks.d} deliveries · {tasks.p} pickups</div>
        </Card>
        <Card onClick={onTrips}>
          <CalendarDays size={22} className="text-[#2F6FB5]" />
          <div className="mt-3 text-[13px] text-[#5B6B82]">Upcoming Trips</div>
          <div className="text-[28px] font-bold leading-tight text-[#1B2A41]">{upcoming.length}</div>
          <div className="mt-1 flex items-center text-[12px] font-bold text-[#2F6FB5]">View all <ChevronRight size={14} /></div>
        </Card>
      </div>

      {todays.length > 1 && (
        <div className="mt-3 text-[13px] text-[#5B6B82]">{todays.length} trips today — showing {cur?.id}.</div>
      )}

      <div className="mt-4">
        {!cur ? (
          <Card className="text-center">
            <ClipboardCheck size={28} className="mx-auto text-[#8A97AB]" />
            <div className="mt-2 text-[15px] font-bold text-[#1B2A41]">No trip assigned for today</div>
            <div className="mt-1 text-[13px] text-[#5B6B82]">
              Ops assigns trips from Control Tower. Log out and pick a driver with a trip to try the flow.
            </div>
          </Card>
        ) : cur.status === 'Yet to start' ? (
          <TripStartCard trip={cur} checklistDone={checklistDone(cur.id)} onChecklist={() => onChecklist(cur)} onLoading={() => onLoading(cur)} onOpen={() => onOpenTrip(cur)} />
        ) : cur.status === 'In Transit' ? (
          <Card>
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-bold uppercase tracking-wide text-[#1C7C45]">Trip in progress</span>
              <span className="text-[13px] text-[#5B6B82]">{cur.id}</span>
            </div>
            <div className="mt-2 text-[17px] font-bold text-[#1B2A41]">
              {cur.stops.filter((x) => isStopDone(x, planning)).length} of {cur.stops.length} stops done
            </div>
            <Btn className="mt-4 w-full" onClick={() => onOpenTrip(cur)}>Resume Trip</Btn>
          </Card>
        ) : (
          <Card>
            <span className="text-[13px] font-bold uppercase tracking-wide text-[#94620F]">Back at hub</span>
            <div className="mt-2 text-[17px] font-bold text-[#1B2A41]">Debrief pending · {cur.id}</div>
            <div className="mt-1 text-[13px] text-[#5B6B82]">Hand over what you collected and close the trip.</div>
            <Btn className="mt-4 w-full" onClick={() => onDebrief(cur)}>Start Debrief</Btn>
          </Card>
        )}
      </div>
    </Screen>
  )
}

function TripStartCard({ trip, checklistDone, onChecklist, onLoading, onOpen }: {
  trip: LocalTrip; checklistDone: boolean; onChecklist: () => void; onLoading: () => void; onOpen: () => void
}) {
  const later = trip.date > today()
  const inT = later ? null : startsIn(trip)
  const c = tripCounts(trip)
  return (
    <Card>
      <button type="button" onClick={onOpen} className="flex w-full items-center justify-between text-left">
        <span>
          <span className="block text-[13px] text-[#5B6B82]">{later ? 'Next trip' : 'Trip Starts In'}</span>
          <span className={`mt-0.5 flex items-center gap-2 whitespace-nowrap font-bold text-[#1B2A41] ${later ? 'text-[17px]' : 'text-[24px]'}`}>
            <Clock size={later ? 16 : 20} className="text-[#D9542B]" />
            {later ? `${dateLabel(trip.date)} · ${tripWindow(trip).start}` : inT ? `${inT} mins` : 'Now'}
          </span>
        </span>
        <span className="text-right text-[13px] text-[#5B6B82]">
          <span className="block font-bold text-[#1B2A41]">{trip.id}</span>
          {c.total} tasks · {c.pickups} pickups
        </span>
      </button>
      <div className="mt-2 text-[13px] text-[#5B6B82]">
        {later ? 'No trip today — this is your next one. Demo clock: you can start it now.' : 'Finish loading and checklist to start your trip'}
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <Btn tone="secondary" onClick={onChecklist}>{checklistDone ? 'Checklist ✓' : 'Start Checklist'}</Btn>
        <Btn onClick={onLoading}>Start Loading</Btn>
      </div>
    </Card>
  )
}
