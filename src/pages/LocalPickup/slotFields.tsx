/**
 * The pickup window as the SETTINGS allow it (owner, 2026-09-25): ONE row —
 * Pickup date · Start time · End time ("instead of slot, start time and end time";
 * then "do not ask end date": the window always ends on the pickup day. Multi-day
 * windows exist only in seeded / API-created data).
 *
 *  - The calendar offers only the days `bookableDays` returns — today only while
 *    a window is still bookable (before `sameDayCutoff`, `bookingLeadTimeMins`
 *    away), then every pickup day of the resolved operating calendar up to
 *    today + `bookingHorizonDays`. Every other day is greyed out.
 *  - Start time · End time are typed. The configured `slotDefinitions` now only
 *    supply the DEFAULT (the chosen day's earliest bookable slot) and the
 *    "earliest" rule. Validation is the dialog's own check (`violatesCutoff` with
 *    the end → end after start, ≤ 12 h on one day, lead time, same-day cut-off, inside
 *    the day's operating hours when the calendar has them) shown on one line.
 *
 * Pickup DAYS come from the operating calendar folded into `policy`
 * (`pickupPolicy(merchant, { pickupLocationCode, hubCode })` —
 * growOrders/operatingCalendar.ts): one 12px caption names where they come
 * from, and a holiday is greyed with a "Holiday · <name>" tooltip. A dialog
 * booking several cards at once passes every card's policy as `calendars`.
 *
 * `ok` is the dialog's OWN gate — the exact check its Confirm runs — so the
 * calendar, the defaults and the button can never disagree. Shared by both
 * portals (console dialogs and the Grow merchant dialogs). The record keeps
 * `startAt` / `endAt`; its `slot` string is derived from them by the store.
 *
 * Optional (2026-09-25, Grow merchant order form): `labels` retitles the three fields (the
 * delivery window reads "Delivery date"); `calendarRules={false}` skips the pickup policy — any
 * day from `minDate` (default today) for 31 days, no greying, end-after-start the only check.
 * When a PRE-FILLED window is not bookable it is still moved to the earliest bookable slot, but
 * the move is explained on one line under the fields.
 */
import { useEffect, useState, type ReactNode } from 'react'
import { DateInput, Field, Input } from '../../nueva/components'
import { bookableDays, bookableSlotsOn, violatesCutoff, type PickupPolicy, type SlotCheck } from '../../growOrders/pickupSlots'

const DAY_LABEL = (at: string) => {
  const d = new Date(`${at.slice(0, 10)}T00:00`)
  return `${d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })} ${at.slice(11, 16)}`
}
const plusDays = (d: Date, n: number) => {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
}

export function SlotWindowFields({ startAt, endAt, onChange, policy, ok, error, now, calendars, labels, calendarRules = true, minDate }: {
  startAt: string; endAt: string
  onChange: (w: { startAt: string; endAt: string }) => void
  policy: PickupPolicy
  ok: SlotCheck
  /** The first rule the window breaks (the submit-time safety net), or null. */
  error?: ReactNode
  now?: Date
  /** the policies whose calendars the window must satisfy (captions + holidays); default [policy] */
  calendars?: PickupPolicy[]
  /** field titles — default "Pickup date" · "Start time" · "End time" */
  labels?: { date?: string; start?: string; end?: string }
  /** false = no pickup policy: any day from `minDate` onward, end after start only */
  calendarRules?: boolean
  /** first selectable day ('YYYY-MM-DD') when `calendarRules` is false; default today */
  minDate?: string
}) {
  const L = { date: labels?.date ?? 'Pickup date', start: labels?.start ?? 'Start time', end: labels?.end ?? 'End time' }
  const cals = calendarRules ? (calendars?.length ? calendars : [policy]) : []
  const captions = [...new Set(cals.map((p) => p.calendar?.sourceLabel).filter((x): x is string => !!x))]
  const holidayName = (d: string) => cals.map((p) => p.holidays?.[d]).find(Boolean)
  const today = now ?? new Date()
  const free = !calendarRules
  const firstFree = minDate && minDate > plusDays(today, 0) ? new Date(`${minDate}T00:00`) : today
  const days = free ? Array.from({ length: 32 }, (_, i) => plusDays(firstFree, i)) : bookableDays(today, policy, ok)
  /* a pre-filled window the rules moved — said out loud, never silent */
  const [moved, setMoved] = useState<string | null>(null)
  const date = startAt.slice(0, 10)
  const startTime = startAt.slice(11, 16)
  const endTime = endAt.slice(11, 16)
  const allowed = new Set(days)
  const dayKey = days.join(',')

  /* a policy / merchant change that leaves the chosen DAY unbookable moves the
     window to the earliest bookable day's first slot; typed times on a bookable
     day are left alone (their error shows instead) */
  useEffect(() => {
    if (free || !startAt || !days.length || allowed.has(date)) return
    const first = bookableSlotsOn(days[0], policy, ok)[0]
    if (first) {
      /* the booking rule's own words when it names one, else the calendar's */
      const rule = violatesCutoff(startAt, today, policy, endAt || undefined)
      const why = rule ? rule.replace(/\.$/, '')
        : date > days[days.length - 1] ? `bookings open up to ${policy.bookingHorizonDays} day${policy.bookingHorizonDays === 1 ? '' : 's'} ahead`
        : 'not a pickup day at this location'
      // eslint-disable-next-line react-hooks/set-state-in-effect -- the move itself happens here; its note must too
      setMoved(`${DAY_LABEL(startAt)} is not bookable (${why}) — moved to ${DAY_LABEL(first.startAt)}.`)
      onChange({ startAt: first.startAt, endAt: first.endAt })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dayKey, startAt])

  const pickDay = (d: string) => {
    if (!d) return
    setMoved(null)
    /* the same times on the new day when they still pass, else that day's earliest slot */
    const same = startTime && endTime ? { startAt: `${d}T${startTime}`, endAt: `${d}T${endTime}` } : null
    if (free) { onChange(same ?? { startAt: `${d}T09:00`, endAt: `${d}T18:00` }); return }
    const next = same && ok(same) ? same : bookableSlotsOn(d, policy, ok)[0]
    if (next) onChange({ startAt: next.startAt, endAt: next.endAt })
  }
  /* a cleared time keeps its date ('YYYY-MM-DDT') so the row does not collapse */
  const setStartTime = (t: string) => { if (date) { setMoved(null); onChange({ startAt: `${date}T${t}`, endAt }) } }
  /* owner, 2026-09-25: no End date is asked — the window ends on the pickup day */
  const setEndTime = (t: string) => { if (date) onChange({ startAt, endAt: `${date}T${t}` }) }

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)] items-end gap-3">
        <Field label={L.date} required>
          <DateInput value={date} onChange={pickDay} placeholder="Select date" clearable={false}
            min={days[0]} max={days[days.length - 1]} isDisabled={(d) => !allowed.has(d)}
            dayTitle={(d) => { const h = holidayName(d); return h ? `Holiday · ${h}` : undefined }} />
        </Field>
        <Field label={L.start} required>
          <Input type="time" value={startTime} disabled={!date} onChange={setStartTime} />
        </Field>
        <Field label={L.end} required>
          <Input type="time" value={endTime} disabled={!date} onChange={setEndTime} />
        </Field>
      </div>
      {captions.map((c) => <p key={c} className="-mt-1 text-[12px] text-ink-3">{c}</p>)}
      {moved && <p className="text-[12px] text-warning-fg">{moved}</p>}
      {free && startTime && endTime && endTime <= startTime && <p className="text-[12px] text-danger-fg">End time must be after the start time.</p>}
      {!free && !days.length && <p className="text-[12px] text-danger-fg">No bookable pickup day in the configured horizon — check Settings → Pickup module.</p>}
      {error && <p className="text-[12px] text-danger-fg">{error}</p>}
    </div>
  )
}
