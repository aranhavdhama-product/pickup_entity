/**
 * Grow merchant-portal date-time picker, drawn in Nueva: the trigger has the
 * same anatomy as nueva `DateInput` (label above, 32px warm-300 box, brand
 * focus ring) and the popover the same card as its calendar — but keeps typed
 * entry, validate-on-blur, Enter-to-confirm, Esc-to-close and the hour/minute
 * columns the pickup windows need. Portaled to <body> so no Modal clips it.
 *
 * All date logic lives in `growOrders/datetime.ts` — this file is chrome,
 * keyboard handling and positioning only. It exports components only, so
 * react-refresh keeps working.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { CalendarDays as CalendarIcon, ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '../../nueva/components'
import { useEscapeKey } from './utils'
import {
  MONTHS, WEEKDAYS, addDays, clampAt, dayDisabled, datePart, defaultTimeFor, formatDisplay,
  hourOptions, joinAt, localDay, minuteOptions, monthDisabled, monthGrid, nextStepAt,
  parseDisplay, shiftMonth, timeDisabled, timePart, withinBounds,
} from '../../growOrders/datetime'

/* --------------------------------------------------------------- trigger ---- */

const SHELL = 'relative flex w-full items-center rounded-md border bg-surface transition-shadow'
const INPUT = 'h-full w-full bg-transparent px-3 text-[13px] text-ink outline-none placeholder:text-warm-400'

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
          className={`rounded-md p-1.5
            ${prevOff ? 'cursor-not-allowed text-warm-300' : 'text-ink-3 hover:bg-warm-50 hover:text-ink'}`}>
          <ChevronLeft size={15} />
        </button>
        <span className="text-[13px] font-bold text-ink">{MONTHS[view.month]} {view.year}</span>
        <button type="button" aria-label="Next month" disabled={nextOff} onClick={() => onView(next)}
          className={`rounded-md p-1.5
            ${nextOff ? 'cursor-not-allowed text-warm-300' : 'text-ink-3 hover:bg-warm-50 hover:text-ink'}`}>
          <ChevronRight size={15} />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-y-0.5" role="row">
        {WEEKDAYS.map((w) => (
          <span key={w} className="flex h-[26px] items-center justify-center text-[11px] font-bold text-ink-3">{w}</span>
        ))}
      </div>

      <div ref={gridRef} role="grid" aria-label="Choose a date" onKeyDown={onKeyDown} className="grid grid-cols-7 gap-y-0.5">
        {grid.cells.map((day, i) => {
          if (!day) return <span key={`pad-${i}`} className="h-8" />
          const off = dayDisabled(day, min, max)
          const isSel = !!selected && day === selected
          const isToday = day === today
          return (
            <button key={day} type="button" role="gridcell" aria-selected={isSel} disabled={off}
              tabIndex={day === focusDay ? 0 : -1}
              onFocus={() => onFocusDay(day)}
              onClick={() => onPick(day)}
              className={`mx-auto flex h-8 w-8 items-center justify-center rounded-md text-[12.5px] transition-colors
                ${off ? 'cursor-not-allowed text-warm-300'
                  : isSel ? 'bg-brand-500 font-bold text-white'
                  : isToday ? 'font-bold text-brand-500 hover:bg-brand-50'
                  : 'text-ink hover:bg-warm-50'}
                focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40`}>
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
      <span className="py-1.5 text-center text-[11px] font-bold uppercase tracking-wide text-ink-3">{label}</span>
      <div ref={ref} role="listbox" aria-label={label} className="grow overflow-y-auto px-1 pb-1">
        {items.map((it) => {
          const off = isOff(it)
          const sel = it === value
          return (
            <button key={it} type="button" role="option" aria-selected={sel} disabled={off} data-sel={sel ? '1' : '0'}
              onClick={() => onPick(it)}
              className={`mb-0.5 flex h-7 w-full items-center justify-center rounded-md text-[12.5px] transition-colors
                ${off ? 'cursor-not-allowed text-warm-300'
                  : sel ? 'bg-brand-500 font-bold text-white'
                  : 'text-ink hover:bg-warm-50'}`}>
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
  const popRef = useRef<HTMLDivElement>(null)
  /* the popover is portaled out of the wrapper, so an outside click is one that
     lands in neither */
  const wrapRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const h = (e: MouseEvent) => {
      const t = e.target as Node
      if (!wrapRef.current?.contains(t) && !popRef.current?.contains(t)) close()
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [open, close])

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
  const ring = shown ? 'border-brand-500' : (focused || open) ? 'border-brand-500 ring-[3px] ring-brand-500/20' : 'border-warm-300 hover:border-warm-400'

  return (
    <div ref={wrapRef} className={`relative min-w-0 ${className}`}>
      {label && (
        <label className="mb-1.5 flex items-center gap-1 whitespace-nowrap text-[12px] font-bold uppercase tracking-wide text-ink-2" title={label}>
          <span className="truncate">{label}</span>{required && <span className="shrink-0 text-brand-500">*</span>}
        </label>
      )}
      <div ref={shellRef} className={`${SHELL} h-8 ${ring} ${disabled ? 'bg-warm-50' : ''}`}>
        <input ref={inputRef} value={text} disabled={disabled} placeholder={placeholder} inputMode="numeric"
          aria-label={label} aria-haspopup="dialog" aria-expanded={open} aria-invalid={!!shown}
          onChange={(e) => { setDraft(e.target.value); if (typedError) setTypedError('') }}
          onFocus={() => { setFocused(true); openPopover() }}
          onBlur={() => { setFocused(false); commitText(text) }}
          onClick={openPopover}
          onKeyDown={onKeyDown}
          className={`${INPUT} disabled:cursor-not-allowed disabled:text-ink-3`} />
        <button type="button" aria-label={open ? 'Close calendar' : 'Open calendar'} disabled={disabled}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => (open ? close() : (inputRef.current?.focus(), openPopover()))}
          className="mr-1.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-warm-400 hover:bg-warm-50 hover:text-ink-2 disabled:text-warm-300">
          <CalendarIcon size={14} />
        </button>
      </div>

      {(shown || helper) && (
        <p className={`mt-1 text-[12px] leading-tight ${shown ? 'text-danger-fg' : 'text-ink-3'}`}>{shown || helper}</p>
      )}

      {open && pos && createPortal(
        <div ref={popRef} role="dialog" aria-label={label ? `${label} calendar` : 'Choose a date and time'}
          onMouseDown={(e) => e.preventDefault()} style={{ left: pos.left, top: pos.top }}
          className="fe-nueva fixed z-[95] rounded-lg border border-line bg-surface shadow-ds-overlay">
          <div className="flex h-[322px]">
            <MonthCalendar view={view} onView={setView} selected={datePart(value)} focusDay={focusDay}
              onFocusDay={setFocusDay} onPick={pickDay} min={min} max={max} gridRef={gridRef} />
            <div className="flex border-l border-line">
              <TimeList label="hh" items={hours} value={hh} onPick={pickHour}
                isOff={(h) => minutes.every((m) => timeDisabled(valueDay, `${h}:${m}`, min, max))} />
              <TimeList label="mm" items={minutes} value={mm} onPick={pickMinute}
                isOff={(m) => timeDisabled(valueDay, `${hh || '00'}:${m}`, min, max)} />
            </div>
          </div>
          <div className="flex items-center justify-end gap-1 border-t border-line px-2 py-1.5">
            <Button variant="ghost" size="sm" onClick={today}>Today</Button>
            <Button variant="ghost" size="sm" onClick={now}>Now</Button>
            <Button variant="ghost" size="sm" onClick={clear} disabled={!value}>Clear</Button>
            <Button size="sm" onClick={close}>OK</Button>
          </div>
        </div>,
        document.body,
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
      {label && <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.08em] text-ink-3">{label}{required && <span className="text-brand-500"> *</span>}</p>}
      <div className={stacked ? 'flex flex-col gap-4' : 'flex items-start gap-3'}>
        <DateTimePicker label={fromLabel} value={from} min={min} max={to || max} required={required}
          stepMinutes={stepMinutes} className={stacked ? '' : 'flex-1'}
          onChange={(v) => onChange({ from: v, to: to && v && v > to ? '' : to })} />
        <DateTimePicker label={toLabel} value={to} min={from || min} max={max} required={required}
          stepMinutes={stepMinutes} className={stacked ? '' : 'flex-1'}
          onChange={(v) => onChange({ from, to: v })} />
      </div>
      {(error || helper) && (
        <p className={`mt-1 text-[12px] leading-tight ${error ? 'text-danger-fg' : 'text-ink-3'}`}>{error || helper}</p>
      )}
    </div>
  )
}
