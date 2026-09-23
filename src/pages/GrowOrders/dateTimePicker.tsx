/**
 * Grow merchant-portal date-time picker — the MUI `DateTimePicker` feel, built
 * from the portal's own tokens.
 *
 * The trigger is an OutlinedField *look-alike* rather than the real
 * `OutlinedField`: that component forces `readOnly` as soon as you give it an
 * `onClick`, and exposes no focus/blur/key hooks, so typed entry, validate-on-
 * blur, Enter-to-confirm and Esc-to-close are all unreachable through it. The
 * classes below are copied from it verbatim so the two never drift apart.
 *
 * All date logic lives in `growOrders/datetime.ts` — this file is chrome,
 * keyboard handling and positioning only. It exports components only, so
 * react-refresh keeps working.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight } from 'lucide-react'
import { Btn } from './ui'
import { useEscapeKey, useOutside } from './utils'
import {
  MONTHS, WEEKDAYS, addDays, clampAt, dayDisabled, datePart, defaultTimeFor, formatDisplay,
  hourOptions, joinAt, localDay, minuteOptions, monthDisabled, monthGrid, nextStepAt,
  parseDisplay, shiftMonth, timeDisabled, timePart, withinBounds,
} from '../../growOrders/datetime'

/* --------------------------------------------------------------- trigger ---- */

const SHELL = 'relative flex w-full items-center rounded-[6px] border bg-white'
const INPUT = 'h-full w-full bg-transparent px-[14px] text-[15px] text-grow-ink outline-none placeholder:text-grow-ink-3'
const LABEL = 'pointer-events-none absolute left-[14px] z-10 bg-white px-1 transition-all'

/**
 * Roughly how big the popover is. It is placed with `position: fixed` and these
 * numbers, because every surface that hosts a picker — the Dialog body, the
 * Sheet, the Advanced Filters panel — clips its own overflow, and an absolutely
 * positioned calendar loses its Today / Now / Clear / OK row to that clip. A
 * fixed element is not clipped by an ancestor's `overflow`, so it stays whole.
 */
const POPOVER_H = 370
const POPOVER_W = 390
/** Breathing room between the popover and the field / the viewport edge. */
const GAP = 4

/** Fixed viewport coordinates: below the field when it fits, above when it does not. */
function placeAt(r: DOMRect): { left: number; top: number } {
  const below = r.bottom + GAP
  const above = r.top - GAP - POPOVER_H
  const top = below + POPOVER_H <= window.innerHeight - GAP ? below
    : above >= GAP ? above
    : Math.max(GAP, window.innerHeight - POPOVER_H - GAP)
  return { left: Math.min(Math.max(GAP, r.left), Math.max(GAP, window.innerWidth - POPOVER_W - GAP)), top }
}

/* -------------------------------------------------------------- calendar ---- */

function MonthCalendar({ view, onView, selected, focusDay, onFocusDay, onPick, min, max, gridRef }: {
  view: { year: number; month: number }
  onView: (v: { year: number; month: number }) => void
  selected: string
  focusDay: string
  onFocusDay: (d: string) => void
  onPick: (d: string) => void
  min?: string
  max?: string
  gridRef: React.RefObject<HTMLDivElement | null>
}) {
  const grid = useMemo(() => monthGrid(view.year, view.month), [view.year, view.month])

  /* roving tabindex: DOM focus follows `focusDay`, but only once the grid already
     holds focus — otherwise arrowing here would steal it from the text field */
  useEffect(() => {
    const g = gridRef.current
    if (!g || !g.contains(document.activeElement)) return
    g.querySelector<HTMLButtonElement>('[tabindex="0"]')?.focus()
  }, [focusDay, gridRef])

  const today = localDay(new Date())
  const prev = shiftMonth(view.year, view.month, -1)
  const next = shiftMonth(view.year, view.month, 1)
  const prevOff = monthDisabled(prev.year, prev.month, min, max)
  const nextOff = monthDisabled(next.year, next.month, min, max)

  /** Arrow keys walk the calendar; the view follows the focus across month edges. */
  const onKeyDown = (e: React.KeyboardEvent) => {
    const step = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1
      : e.key === 'ArrowUp' ? -7 : e.key === 'ArrowDown' ? 7
      : e.key === 'PageUp' ? -0.5 : e.key === 'PageDown' ? 0.5 : 0
    if (step === 0) {
      if (e.key === 'Home' || e.key === 'End') {
        e.preventDefault()
        const g = monthGrid(view.year, view.month)
        const days = g.cells.filter((c): c is string => !!c)
        onFocusDay(e.key === 'Home' ? days[0] : days[days.length - 1])
      }
      return
    }
    e.preventDefault()
    const target = Number.isInteger(step)
      ? addDays(focusDay, step)
      : (() => {
          const m = shiftMonth(view.year, view.month, step > 0 ? 1 : -1)
          const g = monthGrid(m.year, m.month)
          const days = g.cells.filter((c): c is string => !!c)
          const dom = Math.min(Number(focusDay.slice(8)), days.length)
          return days[dom - 1]
        })()
    onFocusDay(target)
    if (datePart(target).slice(0, 7) !== `${view.year}-${String(view.month + 1).padStart(2, '0')}`) {
      const [y, mo] = target.split('-').map(Number)
      onView({ year: y, month: mo - 1 })
    }
  }

  return (
    <div className="w-[268px] shrink-0 p-3">
      <div className="mb-2 flex items-center justify-between">
        <button type="button" aria-label="Previous month" disabled={prevOff} onClick={() => onView(prev)}
          className={`flex h-[30px] w-[30px] items-center justify-center rounded-full
            ${prevOff ? 'cursor-not-allowed text-grow-ink-3' : 'text-grow-ink-2 hover:bg-grow-ink/5'}`}>
          <ChevronLeft size={18} />
        </button>
        <span className="text-[14px] font-medium text-grow-ink">{MONTHS[view.month]} {view.year}</span>
        <button type="button" aria-label="Next month" disabled={nextOff} onClick={() => onView(next)}
          className={`flex h-[30px] w-[30px] items-center justify-center rounded-full
            ${nextOff ? 'cursor-not-allowed text-grow-ink-3' : 'text-grow-ink-2 hover:bg-grow-ink/5'}`}>
          <ChevronRight size={18} />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-y-0.5" role="row">
        {WEEKDAYS.map((w) => (
          <span key={w} className="flex h-[30px] items-center justify-center text-[12px] font-medium text-grow-ink-3">{w}</span>
        ))}
      </div>

      <div ref={gridRef} role="grid" aria-label="Choose a date" onKeyDown={onKeyDown} className="grid grid-cols-7 gap-y-0.5">
        {grid.cells.map((day, i) => {
          if (!day) return <span key={`pad-${i}`} className="h-[34px]" />
          const off = dayDisabled(day, min, max)
          const isSel = !!selected && day === selected
          const isToday = day === today
          return (
            <button key={day} type="button" role="gridcell" aria-selected={isSel} disabled={off}
              tabIndex={day === focusDay ? 0 : -1}
              onFocus={() => onFocusDay(day)}
              onClick={() => onPick(day)}
              className={`mx-auto flex h-[34px] w-[34px] items-center justify-center rounded-full text-[13px] transition-colors
                ${off ? 'cursor-not-allowed text-grow-ink-3'
                  : isSel ? 'bg-grow-accent-2 font-medium text-white'
                  : isToday ? 'border border-grow-accent-2 text-grow-ink hover:bg-grow-accent-2/10'
                  : 'text-grow-ink hover:bg-grow-ink/5'}
                focus:outline-none focus-visible:ring-2 focus-visible:ring-grow-accent-2`}>
              {Number(day.slice(8))}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------ time column ---- */

function TimeList({ items, value, onPick, isOff, label }: {
  items: string[]; value: string; onPick: (v: string) => void; isOff: (v: string) => boolean; label: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current?.querySelector('[data-sel="1"]')
    el?.scrollIntoView({ block: 'nearest' })
  }, [value])
  return (
    <div className="flex w-[58px] shrink-0 flex-col">
      <span className="py-1.5 text-center text-[11px] font-medium tracking-[0.3px] text-grow-ink-3 uppercase">{label}</span>
      <div ref={ref} role="listbox" aria-label={label} className="grow overflow-y-auto px-1 pb-1">
        {items.map((it) => {
          const off = isOff(it)
          const sel = it === value
          return (
            <button key={it} type="button" role="option" aria-selected={sel} disabled={off} data-sel={sel ? '1' : '0'}
              onClick={() => onPick(it)}
              className={`mb-0.5 flex h-[30px] w-full items-center justify-center rounded-[4px] text-[13px] transition-colors
                ${off ? 'cursor-not-allowed text-grow-ink-3'
                  : sel ? 'bg-grow-accent-2 font-medium text-white'
                  : 'text-grow-ink hover:bg-grow-ink/5'}`}>
              {it}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------- the picker ---- */

export interface DateTimePickerProps {
  label?: string
  /** Local ISO `YYYY-MM-DDTHH:mm`, or `''` for empty. NEVER prefilled by the picker. */
  value: string
  onChange: (v: string) => void
  /** Bounds as local ISO. A bound's own day stays selectable — only its out-of-range times grey out. */
  min?: string
  max?: string
  required?: boolean
  /** Error from the caller. Beats the picker's own "that isn't a date" message. */
  error?: string
  helper?: string
  placeholder?: string
  stepMinutes?: number
  className?: string
  disabled?: boolean
}

export function DateTimePicker({
  label, value, onChange, min, max, required, error, helper,
  placeholder = 'DD/MM/YYYY HH:mm', stepMinutes = 30, className = '', disabled,
}: DateTimePickerProps) {
  const [open, setOpen] = useState(false)
  const [focused, setFocused] = useState(false)
  /** Where the fixed popover sits right now; `null` while it is closed. */
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  /** What the merchant is part-way through typing; `null` = show the committed value. */
  const [draft, setDraft] = useState<string | null>(null)
  const [typedError, setTypedError] = useState('')
  const text = draft ?? formatDisplay(value)
  const shellRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const gridRef = useRef<HTMLDivElement>(null)

  const close = useCallback(() => { setOpen(false); setPos(null) }, [])
  const wrapRef = useOutside(close)

  const [view, setView] = useState(() => {
    const d = value ? new Date(Number(value.slice(0, 4)), Number(value.slice(5, 7)) - 1, 1) : new Date()
    return { year: d.getFullYear(), month: d.getMonth() }
  })
  const [focusDay, setFocusDay] = useState(() => datePart(value) || localDay(new Date()))

  /** Opening jumps the calendar to the selected month (or today) every time. */
  const openPopover = useCallback(() => {
    if (disabled || open) return
    const day = datePart(value) || localDay(new Date())
    setFocusDay(day)
    setView({ year: Number(day.slice(0, 4)), month: Number(day.slice(5, 7)) - 1 })
    const r = shellRef.current?.getBoundingClientRect()
    if (r) setPos(placeAt(r))
    setOpen(true)
  }, [disabled, open, value])

  /** A fixed popover does not travel with a scrolling dialog, so it is re-placed. */
  useEffect(() => {
    if (!open) return
    const place = () => {
      const r = shellRef.current?.getBoundingClientRect()
      if (!r) return
      const next = placeAt(r)
      /* scrolling the hour column fires this too — re-rendering 42 calendar
         cells for an unchanged position is pure waste */
      setPos((p) => (p && p.left === next.left && p.top === next.top ? p : next))
    }
    window.addEventListener('scroll', place, true)
    window.addEventListener('resize', place)
    return () => {
      window.removeEventListener('scroll', place, true)
      window.removeEventListener('resize', place)
    }
  }, [open])


  const commitText = useCallback((raw: string): boolean => {
    const t = raw.trim()
    if (t === '') { setDraft(null); setTypedError(''); if (value) onChange(''); return true }
    const at = parseDisplay(t)
    if (!at) { setTypedError(`Enter a date as ${placeholder}.`); return false }
    if (!withinBounds(at, min, max)) {
      setTypedError(min && at < min
        ? `Cannot be before ${formatDisplay(min)}.`
        : `Cannot be after ${formatDisplay(max ?? '')}.`)
      return false
    }
    setDraft(null)
    setTypedError('')
    if (at !== value) onChange(at)
    return true
  }, [min, max, onChange, placeholder, value])

  /** Every in-popover edit commits straight away; OK only dismisses the popover. */
  const set = (at: string) => { setDraft(null); setTypedError(''); onChange(clampAt(at, min, max)) }

  /** A day with no time yet borrows the next free slot (today) or 09:00. */
  const pickDay = (day: string) => {
    const time = timePart(value) || defaultTimeFor(day, new Date(), stepMinutes)
    setFocusDay(day)
    set(joinAt(day, time))
  }

  const pickHour = (h: string) => {
    const day = datePart(value) || focusDay
    const mm = timePart(value).slice(3, 5) || minuteOptions(stepMinutes)[0]
    set(joinAt(day, `${h}:${mm}`))
  }
  const pickMinute = (mm: string) => {
    const day = datePart(value) || focusDay
    const hh = timePart(value).slice(0, 2) || '09'
    set(joinAt(day, `${hh}:${mm}`))
  }

  const now = () => set(nextStepAt(new Date(), stepMinutes))
  const today = () => {
    const day = localDay(new Date())
    setView({ year: Number(day.slice(0, 4)), month: Number(day.slice(5, 7)) - 1 })
    pickDay(day)
  }
  const clear = () => { setDraft(null); setTypedError(''); onChange(''); close() }

  /*
   * Esc closes the CALENDAR from anywhere inside it — and ONLY the calendar.
   * Registered through the shared layer stack, so a picker inside a dialog is
   * the top layer and the dialog under it never sees the key.
   *
   * It also settles the typed DRAFT. Typed text only commits on Enter or blur,
   * and Esc puts focus back in the field — so without this the input went on
   * showing a date the form did not have, and the footer button stayed disabled
   * under a window that looked filled in. What parses is kept, what does not is
   * dropped back to the committed value.
   */
  useEscapeKey(open, () => {
    if (draft !== null && !commitText(text)) { setDraft(null); setTypedError('') }
    close()
    inputRef.current?.focus()
  })

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (commitText(text)) close()
    } else if (e.key === 'ArrowDown' && open) {
      e.preventDefault()
      gridRef.current?.querySelector<HTMLButtonElement>('[tabindex="0"]')?.focus()
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      openPopover()
    }
  }

  const shown = error || typedError
  const hours = hourOptions()
  const minutes = minuteOptions(stepMinutes)
  const valueDay = datePart(value) || focusDay
  const hh = timePart(value).slice(0, 2)
  const mm = timePart(value).slice(3, 5)
  const floated = focused || open || text !== '' || !!placeholder
  const ring = shown ? 'border-grow-error' : (focused || open) ? 'border-grow-accent border-2' : 'border-grow-outline hover:border-grow-ink'

  return (
    <div ref={wrapRef} className={`relative ${className}`}>
      <div ref={shellRef} className={`${SHELL} h-[56px] ${ring} ${disabled ? 'bg-grow-ink/5' : ''}`}>
        {label && (
          <label className={`${LABEL} ${floated ? '-top-[8px] text-[12px]' : 'top-1/2 -translate-y-1/2 text-[15px]'}
            ${shown ? 'text-grow-error' : (focused || open) ? 'text-grow-accent' : 'text-grow-ink-2'}`}>
            {label}{required && <span className={shown ? 'text-grow-error' : 'text-grow-accent'}> *</span>}
          </label>
        )}
        <input ref={inputRef} value={text} disabled={disabled} placeholder={placeholder} inputMode="numeric"
          aria-haspopup="dialog" aria-expanded={open} aria-invalid={!!shown}
          onChange={(e) => { setDraft(e.target.value); if (typedError) setTypedError('') }}
          onFocus={() => { setFocused(true); openPopover() }}
          onBlur={() => { setFocused(false); commitText(text) }}
          onClick={openPopover}
          onKeyDown={onKeyDown}
          className={INPUT} />
        <button type="button" aria-label={open ? 'Close calendar' : 'Open calendar'} disabled={disabled}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => (open ? close() : (inputRef.current?.focus(), openPopover()))}
          className="mr-[6px] flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full text-grow-ink-2 hover:bg-grow-ink/5 disabled:text-grow-ink-3">
          <CalendarIcon size={20} />
        </button>
      </div>

      {(shown || helper) && (
        <p className={`mx-[14px] mt-[3px] text-[12px] leading-tight ${shown ? 'text-grow-error' : 'text-grow-ink-2'}`}>{shown || helper}</p>
      )}

      {open && pos && (
        <div role="dialog" aria-label={label ? `${label} calendar` : 'Choose a date and time'}
          onMouseDown={(e) => e.preventDefault()} style={{ left: pos.left, top: pos.top }}
          className="fixed z-50 rounded-[6px] bg-white shadow-grow-menu">
          <div className="flex h-[322px]">
            <MonthCalendar view={view} onView={setView} selected={datePart(value)} focusDay={focusDay}
              onFocusDay={setFocusDay} onPick={pickDay} min={min} max={max} gridRef={gridRef} />
            <div className="flex border-l border-grow-line">
              <TimeList label="hh" items={hours} value={hh} onPick={pickHour}
                isOff={(h) => minutes.every((m) => timeDisabled(valueDay, `${h}:${m}`, min, max))} />
              <TimeList label="mm" items={minutes} value={mm} onPick={pickMinute}
                isOff={(m) => timeDisabled(valueDay, `${hh || '00'}:${m}`, min, max)} />
            </div>
          </div>
          <div className="flex items-center justify-end gap-1 border-t border-grow-line px-2 py-1.5">
            <Btn variant="text" color="neutral" size="sm" onClick={today}>Today</Btn>
            <Btn variant="text" color="neutral" size="sm" onClick={now}>Now</Btn>
            <Btn variant="text" color="neutral" size="sm" onClick={clear} disabled={!value}>Clear</Btn>
            <Btn variant="contained" color="accent2" size="sm" onClick={close}>OK</Btn>
          </div>
        </div>
      )}
    </div>
  )
}

/* -------------------------------------------------------------- a range ---- */

export interface DateRangePickerProps {
  label?: string
  from: string
  to: string
  onChange: (v: { from: string; to: string }) => void
  min?: string
  max?: string
  required?: boolean
  error?: string
  helper?: string
  stepMinutes?: number
  className?: string
  /** Field captions under the shared `label`. */
  fromLabel?: string
  toLabel?: string
  /** One field above the other — for a pane too narrow to hold them side by side. */
  stacked?: boolean
}

/**
 * Two pickers side by side, where the first one's value is the second's `min`
 * — so an end before its start cannot be picked at all. Moving the start PAST
 * an end that is already set clears that end (it would otherwise sit there
 * invalid), which is why the To field drops back to its placeholder.
 */
export function DateRangePicker({
  label, from, to, onChange, min, max, required, error, helper, stepMinutes = 30,
  className = '', fromLabel = 'From', toLabel = 'To', stacked = false,
}: DateRangePickerProps) {
  return (
    <div className={className}>
      {label && <p className="mb-2 text-[13px] font-medium text-grow-ink-2">{label}{required && <span className="text-grow-accent"> *</span>}</p>}
      <div className={stacked ? 'flex flex-col gap-4' : 'flex items-start gap-3'}>
        <DateTimePicker label={fromLabel} value={from} min={min} max={to || max} required={required}
          stepMinutes={stepMinutes} className={stacked ? '' : 'flex-1'}
          onChange={(v) => onChange({ from: v, to: to && v && v > to ? '' : to })} />
        <DateTimePicker label={toLabel} value={to} min={from || min} max={max} required={required}
          stepMinutes={stepMinutes} className={stacked ? '' : 'flex-1'}
          onChange={(v) => onChange({ from, to: v })} />
      </div>
      {(error || helper) && (
        <p className={`mx-[14px] mt-[3px] text-[12px] leading-tight ${error ? 'text-grow-error' : 'text-grow-ink-2'}`}>{error || helper}</p>
      )}
    </div>
  )
}
