/**
 * FarEye Pilot — the driver app as real mobile-optimised pages (route `/driver`;
 * demo it in DevTools device mode — there is no drawn phone frame).
 *
 * Rebuilt on the SAME stores the console and the merchant portal use: trips and
 * stops from `planningStore` (Control Tower's trips), requests and orders from
 * the Grow store. It owns only who is logged in (`session.ts`) and the scans a
 * driver has made at a stop before swiping Complete (held here, keyed by
 * request, so backing out to the trip list keeps them).
 *
 * Screens (one state machine, no router): Login → Home → Upcoming Trips /
 * Checklist / Loading → Ongoing Trip → Pickup or Delivery stop → Debrief;
 * Profile from the avatar. The current screen is kept in sessionStorage so a
 * reload lands where the driver was.
 */
import { useEffect, useState } from 'react'
import { pickupRequestById, useGrowOrders } from '../../growOrders/store'
import { hubName } from '../../growOrders/hubs'
import { planningActions, usePlanning } from '../LocalPFP/planningStore'
import { PhoneFrame, PhoneToastHost } from './ui'
import { phoneToast } from './phoneToast'
import { sessionActions, useDriverSession } from './session'
import { blankWork, currentTrip, driverRoster, isStopDone, stopKey, type PickupWork } from './model'
import LoginScreen from './Login'
import HomeScreen from './Home'
import TripsScreen from './Trips'
import ChecklistScreen from './Checklist'
import LoadingScreen from './Loading'
import OngoingTripScreen from './OngoingTrip'
import PickupStopScreen from './PickupStop'
import DeliveryStopScreen from './DeliveryStop'
import DebriefScreen from './Debrief'
import ProfileScreen from './Profile'

type View =
  | { name: 'home' }
  | { name: 'trips' }
  | { name: 'profile' }
  | { name: 'checklist'; tripId: string }
  | { name: 'loading'; tripId: string }
  | { name: 'trip'; tripId: string }
  | { name: 'stop'; tripId: string; key: string }
  | { name: 'debrief'; tripId: string }

const VIEW_KEY = 'fareye-driver-view-v1'
const readView = (): View => {
  try {
    const v = JSON.parse(sessionStorage.getItem(VIEW_KEY) ?? 'null') as View | null
    return v && typeof v.name === 'string' ? v : { name: 'home' }
  } catch { return { name: 'home' } }
}

export default function DriverApp() {
  useGrowOrders()                     // re-render on every request / order change
  const planning = usePlanning()
  const session = useDriverSession()
  const [view, setViewRaw] = useState<View>(readView)
  const [work, setWorkMap] = useState<Record<string, PickupWork>>({})
  const [loaded, setLoaded] = useState<Record<string, string[]>>({})

  const setView = (v: View) => {
    setViewRaw(v)
    try { sessionStorage.setItem(VIEW_KEY, JSON.stringify(v)) } catch { /* ignore */ }
  }
  useEffect(() => { document.title = 'FarEye Pilot' }, [])

  const driver = session.driver
  const home = () => setView({ name: 'home' })
  const roster = driverRoster(planning.trips)

  let screen: React.ReactNode
  if (!driver) {
    screen = <LoginScreen roster={roster} trips={planning.trips} onLogin={(d, r) => { sessionActions.login(d, r); home() }} />
  } else {
    const trip = 'tripId' in view ? planning.trips.find((t) => t.id === view.tripId) : undefined
    /* a trip that vanished (cancelled by ops, demo reset) — or one reassigned to
       someone else — must not strand the driver on a dead screen */
    const lost = 'tripId' in view && (!trip || trip.driverName !== driver)
    const v: View = lost ? { name: 'home' } : view
    const openTrip = (id: string) => setView({ name: 'trip', tripId: id })

    if (v.name === 'home' || !trip) {
      if (v.name === 'trips') {
        screen = <TripsScreen driver={driver} planning={planning} onBack={home} onOpen={(t) => openTrip(t.id)} />
      } else if (v.name === 'profile') {
        const cur = currentTrip(planning.trips, driver) ?? planning.trips.find((t) => t.driverName === driver)
        screen = <ProfileScreen driver={driver} vehicle={cur?.vehicle ?? null} hub={cur ? hubName(cur.hubCode) : ''}
          onBack={home} onLogout={() => { sessionActions.logout(); home(); phoneToast('Logged out') }} />
      } else {
        screen = (
          <HomeScreen driver={driver} planning={planning}
            checklistDone={(id) => !!session.checklist[id]}
            onProfile={() => setView({ name: 'profile' })}
            onTrips={() => setView({ name: 'trips' })}
            onChecklist={(t) => setView({ name: 'checklist', tripId: t.id })}
            onLoading={(t) => setView({ name: 'loading', tripId: t.id })}
            onOpenTrip={(t) => openTrip(t.id)}
            onDebrief={(t) => setView({ name: 'debrief', tripId: t.id })} />
        )
      }
    } else if (v.name === 'checklist') {
      screen = <ChecklistScreen trip={trip} saved={!!session.checklist[trip.id]} onBack={home}
        onSave={() => { sessionActions.saveChecklist(trip.id); phoneToast('Checklist saved', 'success'); home() }} />
    } else if (v.name === 'loading') {
      const drops = trip.stops.filter((x) => x.kind === 'delivery' && x.orderId).map((x) => x.orderId as string)
      const mine = loaded[trip.id] ?? []
      screen = (
        <LoadingScreen trip={trip} loaded={mine} checklistDone={!!session.checklist[trip.id]}
          onToggle={(id) => setLoaded((m) => ({ ...m, [trip.id]: mine.includes(id) ? mine.filter((x) => x !== id) : [...mine, id] }))}
          onLoadAll={() => setLoaded((m) => ({ ...m, [trip.id]: drops }))}
          onBack={home}
          onChecklist={() => setView({ name: 'checklist', tripId: trip.id })}
          onStart={() => {
            if (planningActions.startTrip(trip.id)) {
              const n = trip.stops.filter((x) => x.kind === 'pickup').length
              phoneToast(`Trip ${trip.id} started${n ? ` — ${n} pickup${n === 1 ? '' : 's'} Out For Pickup` : ''}`, 'success')
              openTrip(trip.id)
            } else phoneToast(`Trip ${trip.id} cannot start (${trip.status})`, 'error')
          }} />
      )
    } else if (v.name === 'trip') {
      screen = (
        <OngoingTripScreen trip={trip} planning={planning} onBack={home}
          onStop={(key) => setView({ name: 'stop', tripId: trip.id, key })}
          onDebrief={() => setView({ name: 'debrief', tripId: trip.id })}
          onChecklist={() => setView({ name: 'checklist', tripId: trip.id })}
          onLoading={() => setView({ name: 'loading', tripId: trip.id })} />
      )
    } else if (v.name === 'stop') {
      const stop = trip.stops.find((x) => stopKey(x) === v.key)
      const back = () => openTrip(trip.id)
      const debrief = () => setView({ name: 'debrief', tripId: trip.id })
      const remainingAfter = trip.stops.filter((x) => stopKey(x) !== v.key && !isStopDone(x, planning)).length
      if (!stop) {
        /* the stop left the trip under us (request cancelled / rescheduled by
           ops) — show the trip, with the ops notice the store left on it */
        screen = (
          <OngoingTripScreen trip={trip} planning={planning} onBack={home}
            onStop={(key) => setView({ name: 'stop', tripId: trip.id, key })}
            onDebrief={debrief}
            onChecklist={() => setView({ name: 'checklist', tripId: trip.id })}
            onLoading={() => setView({ name: 'loading', tripId: trip.id })} />
        )
      } else if (stop.kind === 'pickup') {
        screen = (
          <PickupStopScreen trip={trip} stop={stop} work={work[v.key]} remainingAfter={remainingAfter}
            setWork={(fn) => setWorkMap((m) => ({ ...m, [v.key]: fn(m[v.key] ?? blankWork(pickupRequestById(v.key)?.expectedPieces ?? 0)) }))}
            onBack={back} onDebrief={debrief} />
        )
      } else {
        screen = <DeliveryStopScreen trip={trip} stop={stop} planning={planning} remainingAfter={remainingAfter} onBack={back} onDebrief={debrief} />
      }
    } else {
      screen = (
        <DebriefScreen trip={trip} planning={planning} onBack={() => openTrip(trip.id)}
          onComplete={() => {
            if (trip.status === 'In Transit') planningActions.debriefTrip(trip.id)
            const ok = planningActions.endTrip(trip.id)
            const done = trip.stops.filter((x) => isStopDone(x, planning)).length
            const parcels = trip.stops.reduce((n, x) => n + (x.kind === 'pickup' ? (pickupRequestById(x.prId)?.pickedOrderIds.length ?? 0) : 0), 0)
            phoneToast(ok
              ? `Trip ${trip.id} closed — ${done} of ${trip.stops.length} stops done${parcels ? `, ${parcels} collected parcel${parcels === 1 ? '' : 's'} handed to the hub` : ''}`
              : `Trip ${trip.id} could not be closed (${trip.status})`, ok ? 'success' : 'error')
            home()
          }} />
      )
    }
  }

  return (
    <PhoneFrame>
      {screen}
      <PhoneToastHost />
    </PhoneFrame>
  )
}
