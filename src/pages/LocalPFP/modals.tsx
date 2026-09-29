/**
 * The Pending For Planning bulk-action popups — staging's, field for field.
 *
 * On THIS route the screenshots are the layout reference (see the CLAUDE.md
 * exception), so these are built from `pfpChrome.css` and `icons.tsx` rather
 * than from the Nueva primitives: title, subtitle, every label, every required
 * asterisk, the inline error text and the primary button wording are staging's
 * verbatim, and so is their arrangement.
 *
 * Nothing here is destructive against staging — the local `planningStore` and
 * the local Grow store are the only things these write to.
 */
import { useState } from 'react'
import type { LocalConsignmentRow, LocalPickupRow } from './adapter'
import { etaFor, type LocalTrip } from './planningStore'
import { CANCEL_REASONS, PICKABLE_FAILURE_REASONS } from '../../growOrders/pickupReasons'
import { Close } from './icons'

/* ------------------------------------------------------------------ shell -- */

function Modal({ title, subtitle, onClose, children, footer, width = 520 }: {
  title: string
  subtitle?: string
  onClose: () => void
  children: React.ReactNode
  footer: React.ReactNode
  width?: number
}) {
  return (
    <div className="pfp-modal-scrim" onClick={onClose}>
      <div className="pfp-modal" style={{ width }} role="dialog" aria-label={title}
        onClick={(e) => e.stopPropagation()}>
        <div className="pfp-modal-head">
          <div>
            <h2>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button type="button" className="pfp-iconbtn" aria-label="Close" onClick={onClose}>
            <Close size={16} />
          </button>
        </div>
        <div className="pfp-modal-body">{children}</div>
        <div className="pfp-modal-foot">{footer}</div>
      </div>
    </div>
  )
}

function Field({ label, required, error, children }: {
  label: string; required?: boolean; error?: string; children: React.ReactNode
}) {
  return (
    <div className="pfp-field">
      <label>{label}{required && <span className="pfp-req"> *</span>}</label>
      {children}
      {error && <span className="pfp-error">{error}</span>}
    </div>
  )
}

/* --------------------------------------------------------------- Schedule -- */

/**
 * Staging's reschedule-reason master is EMPTY on this tenant (the select opens
 * with no options at all), so the list below is the console's own reschedule
 * vocabulary. Named approximation, deliberately — everything else is verbatim.
 */
const RESCHEDULE_REASONS = [
  'Customer requested a new slot',
  'Capacity not available',
  'Address correction',
  'Weather / road disruption',
  'Merchant requested a new slot',
]

export function ScheduleModal({ rows, pickupCount = 0, onClose, onApply }: {
  rows: LocalConsignmentRow[]
  /** how many of `rows` are on their first mile and get a PICKUP window (pickup module on) */
  pickupCount?: number
  onClose: () => void
  onApply: (v: { startAt: string; endAt: string; reason: string }) => void
}) {
  /* every row first-mile = the pickup wording; a mix = staging's wording + one note */
  const pickupOnly = pickupCount > 0 && pickupCount === rows.length
  const mixed = pickupCount > 0 && pickupCount < rows.length
  const lbl = (staging: string, pickup: string) => (pickupOnly ? pickup : staging)
  const w = pickupOnly ? rows[0]?.pickupWindow : rows[0]?.deliveryWindow
  const [startDate, setStartDate] = useState(w?.start.slice(0, 10) ?? '')
  const [startTime, setStartTime] = useState(w?.start.slice(11, 16) || '08:00')
  const [endDate, setEndDate] = useState(w?.end.slice(0, 10) ?? '')
  const [endTime, setEndTime] = useState(w?.end.slice(11, 16) || '18:00')
  const [reason, setReason] = useState('')

  const startAt = startDate ? `${startDate}T${startTime}` : ''
  const endAt = endDate ? `${endDate}T${endTime}` : ''
  /* staging's inline message, verbatim, under the End Date field */
  const invalid = !!startAt && !!endAt && new Date(endAt) <= new Date(startAt)
  const ready = !!startAt && !!endAt && !invalid && !!reason

  return (
    <Modal title={pickupOnly ? 'Schedule Pickup' : 'Schedule'} onClose={onClose} footer={
      <button type="button" className="pfp-btn" data-kind="primary" disabled={!ready}
        onClick={() => onApply({ startAt, endAt, reason })}>{lbl('Update Delivery Slot', 'Update Pickup Slot')}</button>
    }>
      <p style={{ margin: 0, fontSize: 13, color: 'var(--pfp-ink-muted)' }}>
        Do you want to proceed with the planned schedule date or you want to schedule it for a new date?
      </p>
      {mixed && (
        <p style={{ margin: 0, fontSize: 13, color: 'var(--pfp-ink-muted)' }}>
          {pickupCount} on first mile get a pickup window, {rows.length - pickupCount} get a delivery window
        </p>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <Field label={lbl('Start Date', 'Pickup Start Date')} required>
          <input className="pfp-input" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </Field>
        <Field label={lbl('Time', 'Pickup Start Time')} required>
          <input className="pfp-input" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
        </Field>
        <Field label={lbl('End Date', 'Pickup End Date')} required error={invalid ? 'Invalid date.' : undefined}>
          <input className="pfp-input" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </Field>
        <Field label={lbl('Time', 'Pickup End Time')} required>
          <input className="pfp-input" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
        </Field>
      </div>
      <Field label="Reschedule reason" required>
        <select className="pfp-input" value={reason} onChange={(e) => setReason(e.target.value)}>
          <option value="">Select reason</option>
          {RESCHEDULE_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
      </Field>
    </Modal>
  )
}

/* ------------------------------------------- Initiate Return to Origin ----- */

export function RtoConfirmModal({ count, onClose, onConfirm }: {
  count: number; onClose: () => void; onConfirm: () => void
}) {
  return (
    <Modal title="Initiate Return to Origin" onClose={onClose} footer={<>
      <button type="button" className="pfp-btn" onClick={onClose}>Cancel</button>
      <button type="button" className="pfp-btn" data-kind="primary" onClick={onConfirm}>Continue</button>
    </>}>
      <p style={{ margin: 0, fontSize: 14 }}>
        {count} {count === 1 ? 'consignment goes' : 'consignments go'} back to the origin facility.
        They leave Pending For Planning and move to secondary state <strong>RTO Initiated</strong>.
      </p>
    </Modal>
  )
}

/* -------------------------------------------------------- Plan For Routing - */

export function PlanRouteModal({ rows, onClose, onApply }: {
  rows: LocalConsignmentRow[]; onClose: () => void; onApply: () => void
}) {
  return (
    <Modal title="Plan For Routing" width={640}
      subtitle={`${rows.length} consignment${rows.length === 1 ? '' : 's'} · Un-assigned route — assign a driver in Control Tower`}
      onClose={onClose} footer={<>
        <button type="button" className="pfp-btn" onClick={onClose}>Cancel</button>
        <button type="button" className="pfp-btn" data-kind="primary" disabled={rows.length === 0}
          onClick={onApply}>Plan Route</button>
      </>}>
      <table className="pfp-table" style={{ width: '100%' }}>
        <thead>
          <tr><th>Stop</th><th>Order Number</th><th>Address</th><th>ETA</th></tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.id}>
              <td>{i + 1}</td>
              <td>{r.orderNumber}</td>
              <td title={r.address}>{r.address}</td>
              <td>{etaFor(i)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Modal>
  )
}

/* ------------------------------------------------------ Close Consignment -- */

export type ClosureMode = 'completed' | 'failed' | 'partial'

export function CloseConsignmentModal({ count, onClose, onConfirm }: {
  count: number
  onClose: () => void
  onConfirm: (p: { mode: ClosureMode; atc: string; attachments: number }) => void
}) {
  const [mode, setMode] = useState<ClosureMode>('completed')
  const [atc, setAtc] = useState('')
  const [files, setFiles] = useState(0)

  return (
    <Modal title="Close Consignment"
      subtitle="Mark the final delivery status and add the required information to close the consignment"
      onClose={onClose} footer={<>
        <button type="button" className="pfp-btn" onClick={onClose}>Cancel</button>
        <button type="button" className="pfp-btn" data-kind="primary" disabled={!atc}
          onClick={() => onConfirm({ mode, atc, attachments: files })}>Confirm</button>
      </>}>
      <div className="pfp-radio-row">
        {([['completed', 'Mark Completed'], ['failed', 'Mark Failed'], ['partial', 'Completed Partially']] as const)
          .map(([v, label]) => (
            <label key={v} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <input type="radio" name="closure" checked={mode === v} onChange={() => setMode(v)} />
              {label}
            </label>
          ))}
      </div>
      <Field label="ATC (Completion)" required>
        <input className="pfp-input" type="datetime-local" value={atc}
          placeholder="Select Date and Time" onChange={(e) => setAtc(e.target.value)} />
      </Field>
      <Field label="Add Attachment">
        <label className="pfp-dropzone">
          JPG, PNG or PDF | max 5 MB each | upto 5 files
          <input type="file" multiple accept=".jpg,.jpeg,.png,.pdf" style={{ display: 'none' }}
            onChange={(e) => setFiles(e.target.files?.length ?? 0)} />
        </label>
        {files > 0 && <span className="pfp-error" style={{ color: 'var(--pfp-ink-muted)' }}>{files} file(s) attached</span>}
      </Field>
      <p style={{ margin: 0, fontSize: 12.5, color: 'var(--pfp-ink-muted)' }}>
        Closes {count} consignment{count === 1 ? '' : 's'}.
      </p>
    </Modal>
  )
}

/* --------------------------------------------------------- Raise Exception - */

const EXCEPTION_TYPES = [
  { key: 'Damaged', hint: 'Raise an exception for items that were found damaged.' },
  { key: 'Short', hint: 'Raise an exception for items that were found short.' },
  { key: 'Misroute', hint: 'Raise an exception for items that were found misrouted.' },
]

export function RaiseExceptionModal({ rows, onClose, onApply }: {
  rows: LocalConsignmentRow[]; onClose: () => void; onApply: (type: string) => void
}) {
  const [q, setQ] = useState('')
  const [type, setType] = useState('')
  const shown = EXCEPTION_TYPES.filter((t) => t.key.toLowerCase().includes(q.trim().toLowerCase()))

  return (
    <Modal title="Raise Exception" subtitle="Select exception type to continue." onClose={onClose}
      footer={
        <button type="button" className="pfp-btn" data-kind="primary" disabled={!type}
          onClick={() => onApply(type)}>Raise Exception</button>
      }>
      <input className="pfp-input" value={q} placeholder="Search exception..."
        onChange={(e) => setQ(e.target.value)} />
      <div style={{ display: 'grid', gap: 8 }}>
        {shown.map((t) => (
          <button key={t.key} type="button" className="pfp-listrow" aria-pressed={type === t.key}
            onClick={() => setType(t.key)}>
            <span>
              <strong>{t.key}</strong>
              <span>{t.hint}</span>
            </span>
            <span aria-hidden="true">›</span>
          </button>
        ))}
      </div>
      <p style={{ margin: 0, fontSize: 12.5, color: 'var(--pfp-ink-muted)' }}>
        Applies to {rows.length} consignment{rows.length === 1 ? '' : 's'}.
      </p>
    </Modal>
  )
}

/* ------------------------------------------------------------ Cancel Order - */

export function CancelOrderModal({ rows, onClose, onApply }: {
  rows: LocalConsignmentRow[]; onClose: () => void; onApply: (remarks: string) => void
}) {
  const [remarks, setRemarks] = useState('')
  return (
    <Modal title="Cancel Order" onClose={onClose} footer={<>
      <button type="button" className="pfp-btn" onClick={onClose}>Cancel</button>
      <button type="button" className="pfp-btn" data-kind="primary" disabled={!remarks.trim()}
        onClick={() => onApply(remarks.trim())}>Continue</button>
    </>}>
      <p style={{ margin: 0, fontSize: 14 }}>
        Are you sure? This action cannot be undone. It will cancel the order and mark it as closed.
      </p>
      <Field label="Add Remarks" required>
        <textarea className="pfp-textarea" value={remarks} placeholder="Enter cancellation reason…"
          onChange={(e) => setRemarks(e.target.value)} />
      </Field>
      <p style={{ margin: 0, fontSize: 12.5, color: 'var(--pfp-ink-muted)' }}>
        Cancels {rows.length} order{rows.length === 1 ? '' : 's'}.
      </p>
    </Modal>
  )
}

/* -------------------------------------- Plan pickup request for routing ---- */

/** What the planner chose: extend a trip that has not started, or open a new route. */
export type PlanCollectionChoice =
  | { mode: 'existing'; tripId: string }
  | { mode: 'new'; name: string; date: string; driverName: string | null }

/**
 * Routes pickup requests onto a TRIP (routes are trips — see the program spec
 * §9). Built from the Plan For Routing popup's own chrome — same shell, same
 * stop table — with the one choice a collection needs first: which route.
 *
 *  - Existing route / trip — a trip at the selection's hub that has not started
 *    (Un-assigned or Yet to start). Its date is shown, not filtered on: a route
 *    two days out is still one a planner may extend.
 *  - New route — name, date and an optional driver. Without a driver it is an
 *    Un-assigned route and the requests become Planned; with one they become
 *    Assigned.
 *
 * `hubCode` is ONE hub; the caller never opens this for a selection spanning
 * several (a collection is never put on another hub's trip).
 */
export function PlanCollectionModal({ rows, hubCode, hubLabel, trips, drivers, defaultDate, onClose, onApply }: {
  rows: LocalPickupRow[]
  hubCode: string
  hubLabel: string
  trips: LocalTrip[]
  drivers: string[]
  defaultDate: string
  onClose: () => void
  onApply: (c: PlanCollectionChoice) => void
}) {
  const open = trips.filter((t) => t.hubCode === hubCode && (t.status === 'Un-assigned' || t.status === 'Yet to start'))
  const [mode, setMode] = useState<'existing' | 'new'>(open.length ? 'existing' : 'new')
  const [tripId, setTripId] = useState(open[0]?.id ?? '')
  const [name, setName] = useState('')
  const [date, setDate] = useState(defaultDate)
  const [driver, setDriver] = useState('')

  const trip = open.find((t) => t.id === tripId)
  const ready = mode === 'existing' ? !!trip : !!date
  /* the stop numbers continue the chosen trip's sequence */
  const offset = mode === 'existing' && trip ? trip.stops.length : 0

  return (
    <Modal title="Plan pickup request for routing" width={640}
      subtitle={`${rows.length} pickup${rows.length === 1 ? '' : 's'} · ${hubLabel}`}
      onClose={onClose} footer={<>
        <button type="button" className="pfp-btn" onClick={onClose}>Cancel</button>
        <button type="button" className="pfp-btn" data-kind="primary" disabled={!ready || rows.length === 0}
          onClick={() => onApply(mode === 'existing'
            ? { mode, tripId }
            : { mode, name: name.trim(), date, driverName: driver || null })}>
          {mode === 'existing' ? 'Add to Route' : 'Create Route'}
        </button>
      </>}>
      <div className="pfp-radio-row">
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <input type="radio" name="plan-collection" checked={mode === 'existing'} disabled={open.length === 0}
            onChange={() => setMode('existing')} />
          Existing route / trip
        </label>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <input type="radio" name="plan-collection" checked={mode === 'new'} onChange={() => setMode('new')} />
          New route
        </label>
      </div>

      {mode === 'existing' ? (
        <Field label="Route / trip" required>
          <select className="pfp-input" value={tripId} onChange={(e) => setTripId(e.target.value)}>
            {open.map((t) => (
              <option key={t.id} value={t.id}>
                {t.id} · {t.name} · {t.date} · {t.status} · {t.stops.length} stop{t.stops.length === 1 ? '' : 's'}
              </option>
            ))}
          </select>
        </Field>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <Field label="Route name">
            <input className="pfp-input" value={name} placeholder="Unassigned route"
              onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Date" required>
            <input className="pfp-input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Driver">
            <select className="pfp-input" value={driver} onChange={(e) => setDriver(e.target.value)}>
              <option value="">Assign later</option>
              {drivers.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </Field>
        </div>
      )}
      {open.length === 0 && (
        <p style={{ margin: 0, fontSize: 12.5, color: 'var(--pfp-ink-muted)' }}>
          No route at {hubLabel} is still open (Un-assigned or Yet to start) — a new route will be created.
        </p>
      )}

      <table className="pfp-table" style={{ width: '100%' }}>
        <thead>
          <tr><th>Stop</th><th>Request</th><th>Pickup Address</th><th>ETA</th></tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.id}>
              <td>{offset + i + 1}</td>
              <td>{r.reference}</td>
              <td title={r.shipFromAddress}>{r.shipFromAddress}</td>
              <td>{etaFor(offset + i)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Modal>
  )
}

/* ---------------------------------------------------- Mark Pickup Failed --- */

export function FailPickupModal({ count, onClose, onApply }: {
  count: number; onClose: () => void; onApply: (v: { code: string; note: string | undefined }) => void
}) {
  const [code, setCode] = useState('')
  const [note, setNote] = useState('')
  return (
    <Modal title="Mark Pickup Failed" onClose={onClose} footer={<>
      <button type="button" className="pfp-btn" onClick={onClose}>Cancel</button>
      <button type="button" className="pfp-btn" data-kind="primary" disabled={!code}
        onClick={() => onApply({ code, note: note.trim() || undefined })}>Continue</button>
    </>}>
      <p style={{ margin: 0, fontSize: 14 }}>
        The pickup was attempted and did not happen. Its orders return to Ready for Pickup; if attempts
        remain, a re-attempt may be raised automatically.
      </p>
      <Field label="Failure reason" required>
        <select className="pfp-input" value={code} onChange={(e) => setCode(e.target.value)}>
          <option value="">Select reason</option>
          {PICKABLE_FAILURE_REASONS.map((r) => <option key={r.code} value={r.code}>{r.label}</option>)}
        </select>
      </Field>
      <Field label="Add Remarks">
        <textarea className="pfp-textarea" value={note} placeholder="Optional note…"
          onChange={(e) => setNote(e.target.value)} />
      </Field>
      <p style={{ margin: 0, fontSize: 12.5, color: 'var(--pfp-ink-muted)' }}>
        Applies to {count} pickup{count === 1 ? '' : 's'}.
      </p>
    </Modal>
  )
}

/* ---------------------------------------------------------- Cancel Pickup -- */

export function CancelPickupModal({ count, onClose, onApply }: {
  count: number; onClose: () => void; onApply: (code: string) => void
}) {
  const [code, setCode] = useState('')
  return (
    <Modal title="Cancel Pickup" onClose={onClose} footer={<>
      <button type="button" className="pfp-btn" onClick={onClose}>Cancel</button>
      <button type="button" className="pfp-btn" data-kind="primary" disabled={!code}
        onClick={() => onApply(code)}>Continue</button>
    </>}>
      <p style={{ margin: 0, fontSize: 14 }}>
        Are you sure? This calls the booking off. Its orders drop back to Ready for Pickup.
      </p>
      <Field label="Cancellation reason" required>
        <select className="pfp-input" value={code} onChange={(e) => setCode(e.target.value)}>
          <option value="">Select reason</option>
          {CANCEL_REASONS.map((r) => <option key={r.code} value={r.code}>{r.label}</option>)}
        </select>
      </Field>
      <p style={{ margin: 0, fontSize: 12.5, color: 'var(--pfp-ink-muted)' }}>
        Cancels {count} pickup{count === 1 ? '' : 's'}.
      </p>
    </Modal>
  )
}
