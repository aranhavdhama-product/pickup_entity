/**
 * "Add to route" — the shared dialog the Pickup pages open on one or more
 * pickup requests (spec §3.3, §6.3 P1/P2, §9 "routes are trips"). THREE ways:
 *
 *   Add to best route — the system picks the open route at the request's hub
 *                   that fits best (same day first, then nearest date, then the
 *                   fewest stops) and says why before you confirm;
 *   Manual          — you pick an existing route, or create a new one (below);
 *   Plan pickup request for routing — the routing engine plans a NEW route for the selection
 *                   (`planningActions.planForRouting`, as Pending For Planning's
 *                   Plan pickup request for routing does).
 *
 * Manual:
 *   Existing trip — an Un-assigned / Yet to start trip at the request's hub;
 *   New trip      — name (optional), date (default: the window's date), hub
 *                   (default: the request's inbound hub, else its store), and an
 *                   optional driver (a trip created with a driver is Yet to
 *                   start and every collection on it becomes Assigned).
 *
 * Confirm → `planningActions.createTrip` / `addPickupToTrip` per request.
 */
import { useMemo, useState } from 'react'
import { Button, DateInput, EmptyState, Field, Input, MenuSelect, Modal, StatusPill, Tabs } from '../../nueva/components'
import { toast } from '../../nueva/toast'
import { useGrowOrders } from '../../growOrders/store'
import { isOpenPr } from '../../growOrders/tabs'
import { planningActions, tripOf, usePlanning, type LocalTrip } from '../LocalPFP/planningStore'
import { HUB_CODES, TRIP_TONE, fmtDay, hubLabel, knownDrivers, vehicleOf } from './tripUtils'

const WAYS = ['Add to best route', 'Manual', 'Plan pickup request for routing']
const MODES = ['Existing trip', 'New trip']

const dayGap = (a: string, b: string) =>
  Math.abs(new Date(`${a}T00:00:00`).getTime() - new Date(`${b}T00:00:00`).getTime()) / 86_400_000

export function AddToRouteDialog({ prIds, initialWay, onClose, onDone }: {
  prIds: string[]
  /** open on a given tab — 'plan' = Plan pickup request for routing */
  initialWay?: 'best' | 'manual' | 'plan'
  onClose(): void
  onDone?(tripId: string): void
}) {
  const db = useGrowOrders()
  const plan = usePlanning()

  const prs = useMemo(() => prIds
    .map((id) => db.pickupRequests.find((p) => p.id === id))
    .filter((p): p is NonNullable<typeof p> => !!p), [prIds, db])
  const open = prs.filter((p) => isOpenPr(p.status))
  const skipped = prs.length - open.length
  const first = open[0]
  const prHub = first ? first.destinationCode ?? first.storeCode : ''
  const hubsInSelection = [...new Set(open.map((p) => p.destinationCode ?? p.storeCode))]

  const candidates = useMemo<LocalTrip[]>(() => plan.trips
    .filter((t) => (t.status === 'Un-assigned' || t.status === 'Yet to start') && t.hubCode === prHub)
    /* same day first, then nearest date */
    .sort((a, b) => {
      const da = a.date === first?.date ? 0 : 1; const dbb = b.date === first?.date ? 0 : 1
      return da !== dbb ? da - dbb : a.date.localeCompare(b.date)
    }), [plan.trips, prHub, first?.date])

  /* the best fit: same day, then nearest date, then the lightest route */
  const best = useMemo(() => [...candidates].sort((a, b) => {
    const ga = first ? dayGap(a.date, first.date) : 0, gb = first ? dayGap(b.date, first.date) : 0
    return ga !== gb ? ga - gb : a.stops.length - b.stops.length
  })[0], [candidates, first])
  const [way, setWay] = useState(initialWay === 'plan' ? 2 : initialWay === 'manual' ? 1 : best ? 0 : 2)
  const [mode, setMode] = useState(candidates.length ? 0 : 1)
  const [tripId, setTripId] = useState(candidates[0]?.id ?? '')
  const [name, setName] = useState('')
  const [date, setDate] = useState(first?.date ?? '')
  const [hub, setHub] = useState(prHub)
  const [driver, setDriver] = useState('')
  const [vehicle, setVehicle] = useState('')
  const drivers = knownDrivers(plan.trips)
  const hubOptions = [...new Set([...HUB_CODES, ...(prHub ? [prHub] : [])])]

  const canConfirm = open.length > 0 && (
    way === 0 ? !!best : way === 2 ? true : mode === 0 ? !!tripId : !!hub && !!date)

  const confirm = () => {
    if (!canConfirm) return
    if (way === 2) {
      const trip = planningActions.planForRouting(open.map((p) => ({
        orderId: p.id, orderNumber: p.number, kind: 'pickup' as const,
        address: db.stores.find((x) => x.code === p.storeCode)?.name ?? p.storeCode,
      })))
      toast.success(`${open.length === 1 ? open[0].number : `${open.length} pickup requests`} planned on ${trip.id} by the routing engine (Un-assigned — assign a driver in Control Tower → Trips).`)
      onDone?.(trip.id)
      onClose()
      return
    }
    let target = way === 0 ? best!.id : tripId
    if (way === 1 && mode === 1) {
      const t = planningActions.createTrip({ hubCode: hub, name: name.trim() || undefined, date, driverName: driver.trim() || null, vehicle: vehicle.trim() || null })
      target = t.id
    }
    const added = open.filter((p) => planningActions.addPickupToTrip(target, p.id))
    if (!added.length) { toast.error('Nothing could be added to that trip.'); return }
    const label = added.length === 1 ? added[0].number : `${added.length} pickup requests`
    toast.success(`${label} added to ${target} — see Control Tower → Trips.`)
    onDone?.(target)
    onClose()
  }

  return (
    <Modal open title="Add to route" onClose={onClose}
      footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button disabled={!canConfirm} onClick={confirm}>
        {way === 0 ? 'Add to best route' : way === 2 ? 'Plan pickup request for routing' : mode === 0 ? 'Add to trip' : 'Create trip & add'}
      </Button></>}>
      <p className="pb-3 text-[13px] text-ink-2">
        {open.length === 0
          ? 'None of the selected requests is open — only a Requested / Planned / Assigned / Out For Pickup request can be routed.'
          : <>Routing <b>{open.map((p) => p.number).join(', ')}</b>{first && <> · window {fmtDay(first.date)} {first.slot}</>}.</>}
        {skipped > 0 && open.length > 0 && <span className="text-ink-3"> {skipped} closed request{skipped === 1 ? '' : 's'} skipped.</span>}
      </p>
      {open.some((p) => tripOf(p.id)) && (
        <p className="pb-3 text-[12px] text-warning-fg">
          {open.filter((p) => tripOf(p.id)).map((p) => `${p.number} (on ${tripOf(p.id)?.id})`).join(', ')} will move off its current trip.
        </p>
      )}
      {hubsInSelection.length > 1 && (
        <p className="pb-3 text-[12px] text-warning-fg">The selection drops at {hubsInSelection.length} hubs — the trip runs from {hubLabel(mode === 0 ? prHub : hub, db.stores)}.</p>
      )}

      <Tabs size="sm" tabs={WAYS} active={way} onChange={setWay} />

      {way === 0 && (
        <div className="py-4">
          {!best ? (
            <EmptyState title={`No open route at ${hubLabel(prHub, db.stores)}`}
              hint="Best route picks among Un-assigned or Yet to start routes at the request's hub. Use Plan pickup request for routing to have one planned, or Manual to create it." />
          ) : (
            <div className="rounded-md border border-ink bg-warm-50 px-4 py-3 text-[13px]">
              <span className="flex items-center gap-2">
                <span className="font-bold text-ink">{best.name} <span className="font-mono text-[12px] text-ink-3">{best.id}</span></span>
                <StatusPill label={best.status} tone={TRIP_TONE[best.status]} />
              </span>
              <span className="mt-0.5 block text-[12px] text-ink-3">
                {fmtDay(best.date)} · {best.driverName ?? 'No driver'} · {best.stops.length} stop{best.stops.length === 1 ? '' : 's'}
              </span>
              <span className="mt-1 block text-[12px] text-ink-2">
                Why this route: {first && best.date === first.date ? 'same day as the pickup window' : 'nearest date to the pickup window'}
                {candidates.length > 1 ? `, lightest of ${candidates.length} open routes at this hub` : ', the only open route at this hub'}.
              </span>
            </div>
          )}
        </div>
      )}

      {way === 2 && (
        <p className="py-4 text-[13px] text-ink-2">
          The routing engine plans a <b>new route</b> for {open.length === 1 ? 'this collection' : `these ${open.length} collections`}
          {' '}from {hubLabel(prHub, db.stores)}, on the pickup window's date, with a driver assigned — the same step as
          Pending For Planning → Plan pickup request for routing. The requests become Planned and Assigned.
        </p>
      )}

      {way === 1 && (
        <div className="pt-3">
          <Tabs size="sm" tabs={MODES.map((m, i) => (i === 0 ? `${m} (${candidates.length})` : m))} active={mode} onChange={setMode} />
        </div>
      )}

      {way === 1 && mode === 0 && (
        <div className="py-4">
          {candidates.length === 0 ? (
            <EmptyState title={`No open trip at ${hubLabel(prHub, db.stores)}`} hint="Only Un-assigned or Yet to start trips at the request's hub can take it. Create a new trip instead." />
          ) : (
            <div className="rounded-md border border-line">
              {candidates.map((t) => {
                const on = t.id === tripId
                return (
                  <button key={t.id} type="button" onClick={() => setTripId(t.id)}
                    className={`flex w-full items-center gap-3 border-b border-line px-4 py-2.5 text-left text-[13px] last:border-0 transition-colors ${on ? 'bg-warm-50 hover:bg-warm-100' : 'hover:bg-warm-50'}`}>
                    <span className={`h-3.5 w-3.5 shrink-0 rounded-full border ${on ? 'border-[4px] border-brand-500' : 'border-warm-300'}`} />
                    <span className="min-w-0 flex-1">
                      <span className="block font-bold text-ink">{t.name} <span className="font-mono text-[12px] text-ink-3">{t.id}</span></span>
                      <span className="block text-[12px] text-ink-3">
                        {fmtDay(t.date)}{t.date === first?.date ? ' · same day' : ''} · {t.driverName ?? 'No driver'} · {t.stops.length} stop{t.stops.length === 1 ? '' : 's'}
                      </span>
                    </span>
                    <StatusPill label={t.status} tone={TRIP_TONE[t.status]} />
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}

      {way === 1 && mode === 1 && (
        <div className="grid grid-cols-2 gap-4 py-4">
          <Field label="Trip name"><Input value={name} onChange={setName} placeholder="Defaults to the driver, else “Unassigned route”" /></Field>
          <Field label="Date" required><DateInput value={date} onChange={setDate} /></Field>
          <Field label="Hub" required>
            <MenuSelect value={hub} options={hubOptions} labels={(c) => hubLabel(c, db.stores)} onChange={setHub} />
          </Field>
          <Field label="Driver">
            <MenuSelect value={driver} options={drivers} placeholder="Optional — assign later" searchable creatable
              onChange={(v) => { setDriver(v); if (!vehicle) setVehicle(vehicleOf(plan.trips, v)) }} />
          </Field>
          <Field label="Vehicle"><Input value={vehicle} onChange={setVehicle} placeholder="Optional" /></Field>
          <p className="self-end pb-1 text-[12px] text-ink-3">
            {driver ? 'With a driver the trip is Yet to start and the requests become Assigned.' : 'Without a driver the trip is Un-assigned and the requests are Planned.'}
          </p>
        </div>
      )}
    </Modal>
  )
}
