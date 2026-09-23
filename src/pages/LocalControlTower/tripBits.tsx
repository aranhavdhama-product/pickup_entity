/**
 * Control Tower pieces used by both the Trips list and the trip page: the stop
 * timeline, the status chip and the Assign driver / Change assignee dialog.
 */
import { useState } from 'react'
import { Truck } from 'lucide-react'
import { Button, Field, Input, MenuSelect, Modal } from '../../nueva/components'
import { toast } from '../../nueva/toast'
import { planningActions, type LocalTrip, type StopStatus } from '../LocalPFP/planningStore'
import { effectiveStopStatus, knownDrivers, vehicleOf } from './tripUtils'

/* ---------------------------------------------------------- stop timeline -- */

const DOT: Record<StopStatus, string> = {
  Pending: 'bg-surface border-warm-300 text-ink-2',
  Arrived: 'bg-info-bg border-info-fg text-info-fg',
  Done: 'bg-success-bg border-success-fg text-success-fg',
  Failed: 'bg-danger-bg border-danger-fg text-danger-fg',
}
/* a pickup still ahead carries the brand tint, so collections read at a glance */
const PICKUP_PENDING = 'bg-brand-50 border-brand-500 text-brand-600'

const hourOf = (eta: string) => {
  const [h, m] = eta.split(':').map(Number)
  return (Number.isFinite(h) ? h : 9) + (Number.isFinite(m) ? m : 0) / 60
}

/**
 * Numbered stops on a horizontal time axis (the trip's planned ETAs). Pickup
 * stops are rounded squares with a truck glyph above; deliveries are circles.
 */
export function StopTimeline({ trip }: { trip: LocalTrip }) {
  if (!trip.stops.length) return <span className="text-[12px] text-ink-3">No stops</span>
  const hours = trip.stops.map((s) => hourOf(s.eta))
  const lo = Math.floor(Math.min(8, ...hours))
  const hi = Math.ceil(Math.max(lo + 4, ...hours.map((h) => h + 1)))
  const pos = (h: number) => `${((h - lo) / (hi - lo)) * 100}%`
  return (
    <div className="relative h-11 min-w-[220px] px-3">
      <div className="relative h-full">
        <div className="absolute left-0 right-0 top-[22px] h-px bg-warm-300" />
        {trip.stops.map((s, i) => {
          const st = effectiveStopStatus(s)
          const tone = s.kind === 'pickup' && (st === 'Pending' || st === 'Arrived') ? PICKUP_PENDING : DOT[st]
          return (
            <div key={`${s.seq}-${i}`} className="absolute top-0 -translate-x-1/2 flex flex-col items-center" style={{ left: pos(hours[i]) }}
              title={`${s.seq}. ${s.kind === 'pickup' ? 'Pick up' : 'Delivery'} · ${s.orderNumber} · ${s.eta} · ${st}`}>
              <span className="h-3 flex items-end">
                {s.kind === 'pickup' && <Truck size={10} className="text-brand-500" />}
              </span>
              <span className={`mt-[3px] h-[18px] w-[18px] inline-flex items-center justify-center border text-[10px] font-bold leading-none
                ${s.kind === 'pickup' ? 'rounded-[4px]' : 'rounded-full'} ${tone}`}>{s.seq}</span>
            </div>
          )
        })}
        <span className="absolute left-0 bottom-[-2px] text-[10px] text-ink-3">{String(lo).padStart(2, '0')}:00</span>
        <span className="absolute right-0 bottom-[-2px] text-[10px] text-ink-3">{String(hi % 24).padStart(2, '0')}:00</span>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------ status chip -- */

export function StatusChip({ label, count, active, tone = 'neutral', onClick }: {
  label: string; count: number; active: boolean; tone?: 'neutral' | 'danger'; onClick: () => void
}) {
  const on = active
    ? tone === 'danger' ? 'border-danger-fg bg-danger-bg text-danger-fg' : 'border-brand-500 bg-brand-50 text-brand-600'
    : tone === 'danger' ? 'border-line bg-surface text-danger-fg hover:bg-warm-50' : 'border-line bg-surface text-ink-2 hover:bg-warm-50'
  return (
    <button type="button" onClick={onClick}
      className={`h-8 shrink-0 inline-flex items-center gap-2 rounded-full border px-3 text-[13px] font-bold transition-colors ${on}`}>
      {label}
      <span className={`min-w-5 rounded-full px-1.5 text-[11.5px] leading-[18px] ${active ? 'bg-surface' : 'bg-warm-100 text-ink-2'}`}>{count}</span>
    </button>
  )
}

/* ------------------------------------------------ assign driver dialog ---- */

export function AssignDriverModal({ trip, trips, title = 'Assign driver', onClose }: {
  trip: LocalTrip; trips: LocalTrip[]; title?: string; onClose: () => void
}) {
  const [driver, setDriver] = useState(trip.driverName ?? '')
  const [vehicle, setVehicle] = useState(trip.vehicle ?? '')
  const drivers = knownDrivers(trips)
  const save = () => {
    if (!driver.trim()) return
    planningActions.assignDriver(trip.id, driver.trim(), vehicle.trim() || null)
    toast.success(`${driver.trim()} assigned to ${trip.id}.`)
    onClose()
  }
  return (
    <Modal open title={`${title} — ${trip.id}`} onClose={onClose}
      footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button disabled={!driver.trim()} onClick={save}>Assign</Button></>}>
      <div className="grid grid-cols-2 gap-4 pb-4">
        <Field label="Driver" required>
          <MenuSelect value={driver} options={drivers} placeholder="Pick or type a driver" searchable creatable
            onChange={(v) => { setDriver(v); if (!vehicle) setVehicle(vehicleOf(trips, v)) }} />
        </Field>
        <Field label="Vehicle">
          <Input value={vehicle} onChange={setVehicle} placeholder="e.g. NBC 4521" />
        </Field>
      </div>
      <p className="pb-4 text-[13px] text-ink-3">
        Every collection still ahead on this trip becomes <b>Assigned</b> to the driver.
        {trip.status === 'Un-assigned' && ' The trip moves to Yet to start.'}
      </p>
    </Modal>
  )
}
