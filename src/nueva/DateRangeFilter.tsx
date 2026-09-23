/**
 * Staging's consignment date filter, replicated: a range control that opens a
 * popover with (left) the five date-field buttons, (right) a dual-month range
 * calendar, and a footer of preset chips + Cancel/Apply.
 */
import { useEffect, useRef, useState } from 'react'
import { Calendar, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Clock, MoveRight } from 'lucide-react'
import { Button } from './components'

export interface DateFilterValue { field: string; from: string; to: string }

const iso = (d: Date) => {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
export const todayIso = () => iso(new Date())
export const shiftIso = (days: number) => { const d = new Date(); d.setDate(d.getDate() + days); return iso(d) }

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function MonthGrid({ year, month, from, to, hover, onPick, onHover }: {
  year: number; month: number
  from: string; to: string; hover: string
  onPick: (day: string) => void
  onHover: (day: string) => void
}) {
  const first = new Date(year, month, 1)
  const start = new Date(first); start.setDate(1 - first.getDay())
  const cells: Date[] = Array.from({ length: 42 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d })
  const rangeEnd = to || hover
  const inRange = (d: string) => from && rangeEnd && d > (from < rangeEnd ? from : rangeEnd) && d < (from < rangeEnd ? rangeEnd : from)
  return (
    <div className="w-[238px]">
      <div className="grid grid-cols-7 mb-1">
        {WEEKDAYS.map((w) => <div key={w} className="h-7 flex items-center justify-center text-[12px] font-bold text-ink-2">{w}</div>)}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((d) => {
          const dIso = iso(d)
          const inMonth = d.getMonth() === month
          // spillover days stay grey and inert — selection styling only inside
          // the month, else range edges appear "twice" across adjacent grids
          const isEdge = inMonth && (dIso === from || dIso === to || (!to && dIso === hover && !!from))
          const mid = inMonth && inRange(dIso)
          return (
            <button key={dIso} disabled={!inMonth}
              onClick={() => onPick(dIso)} onMouseEnter={() => inMonth && onHover(dIso)}
              className={`h-8 text-[12.5px] tabular-nums transition-colors
                ${isEdge ? 'bg-brand-500 text-white rounded-md font-bold'
                  : mid ? 'bg-brand-50 text-ink'
                  : inMonth ? 'text-ink hover:bg-warm-100 rounded-md' : 'text-warm-300 cursor-default'}`}>
              {d.getDate()}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default function DateRangeFilter({ value, fields, onApply, meta }: {
  value: DateFilterValue
  fields: { code: string; label: string }[]
  onApply: (v: DateFilterValue) => void
  /** small muted suffix inside the trigger, e.g. the timezone the dates use */
  meta?: string
}) {
  const [open, setOpen] = useState(false)
  const [field, setField] = useState(value.field)
  const [from, setFrom] = useState(value.from)
  const [to, setTo] = useState(value.to)
  const [hover, setHover] = useState('')
  const [anchor, setAnchor] = useState(() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() - 1 } })
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => { setField(value.field); setFrom(value.from); setTo(value.to) }, [value, open])
  useEffect(() => {
    if (!open) return
    const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    window.addEventListener('mousedown', h)
    return () => window.removeEventListener('mousedown', h)
  }, [open])

  const pick = (d: string) => {
    if (!from || to) { setFrom(d); setTo('') }
    else setTo(d >= from ? d : (setFrom(d), from))
  }
  const preset = (days: number) => { setFrom(days === 0 ? todayIso() : shiftIso(-days)); setTo(todayIso()) }
  const nav = (months: number) => setAnchor((a) => { const d = new Date(a.y, a.m + months, 1); return { y: d.getFullYear(), m: d.getMonth() } })
  const apply = () => {
    if (!from) return
    onApply({ field, from, to: to || from })
    setOpen(false)
  }
  const second = new Date(anchor.y, anchor.m + 1, 1)

  return (
    <div className="relative shrink-0" ref={ref}>
      <button onClick={() => setOpen((v) => !v)}
        className={`h-8 inline-flex items-center gap-2 rounded-md border bg-surface px-3 text-[12.5px] tabular-nums transition-colors
          ${open ? 'border-brand-500 ring-[3px] ring-brand-500/15 text-ink' : 'border-warm-300 text-ink-2 hover:border-warm-400'}`}>
        {value.from}
        <MoveRight size={13} className="text-warm-400" />
        {value.to}
        <Calendar size={14} className="text-warm-400" />
        {meta && <span className="text-[10.5px] text-warm-400 border-l border-line pl-2">{meta}</span>}
      </button>

      {open && (
        <div className="absolute left-0 top-10 z-40 bg-surface border border-line rounded-xl shadow-ds-overlay flex flex-col">
          <div className="flex">
            {/* date-field rail */}
            <div className="w-52 border-r border-line p-3 space-y-2">
              {fields.map((f) => {
                const on = f.code === field
                return (
                  <button key={f.code} onClick={() => setField(f.code)}
                    className={`w-full rounded-md border px-3 py-2.5 text-[13px] text-center transition-colors
                      ${on ? 'border-brand-500 bg-brand-50 text-brand-600 font-bold' : 'border-warm-200 bg-warm-50 text-ink-2 hover:border-warm-300'}`}>
                    {f.label}
                  </button>
                )
              })}
            </div>
            {/* dual-month calendar */}
            <div className="p-4">
              <div className="flex items-center justify-between mb-2 px-1">
                <span className="flex items-center gap-1">
                  <button onClick={() => nav(-12)} className="p-1 rounded text-warm-400 hover:text-ink-2 hover:bg-warm-100"><ChevronsLeft size={15} /></button>
                  <button onClick={() => nav(-1)} className="p-1 rounded text-warm-400 hover:text-ink-2 hover:bg-warm-100"><ChevronLeft size={15} /></button>
                </span>
                <span className="text-[13.5px] font-bold text-ink">{MONTHS[anchor.m]} {anchor.y}</span>
                <span className="w-10" />
                <span className="text-[13.5px] font-bold text-ink">{MONTHS[second.getMonth()]} {second.getFullYear()}</span>
                <span className="flex items-center gap-1">
                  <button onClick={() => nav(1)} className="p-1 rounded text-warm-400 hover:text-ink-2 hover:bg-warm-100"><ChevronRight size={15} /></button>
                  <button onClick={() => nav(12)} className="p-1 rounded text-warm-400 hover:text-ink-2 hover:bg-warm-100"><ChevronsRight size={15} /></button>
                </span>
              </div>
              <div className="flex gap-6">
                <MonthGrid year={anchor.y} month={anchor.m} from={from} to={to} hover={hover} onPick={pick} onHover={setHover} />
                <MonthGrid year={second.getFullYear()} month={second.getMonth()} from={from} to={to} hover={hover} onPick={pick} onHover={setHover} />
              </div>
            </div>
          </div>
          {/* footer: presets + actions */}
          <div className="flex items-center gap-2 border-t border-line px-4 py-3">
            {[{ l: 'Last 30 Days', d: 30 }, { l: 'Last 7 Days', d: 7 }, { l: 'Today', d: 0 }].map((p) => (
              <button key={p.l} onClick={() => preset(p.d)}
                className="h-9 px-4 rounded-md border border-warm-200 bg-warm-50 text-[13px] text-ink-2 hover:border-warm-300 transition-colors">
                {p.l}
              </button>
            ))}
            <span className="ml-auto flex items-center gap-2">
              <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={apply} disabled={!from}>Apply</Button>
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

/* ---------------- Form variant: one control for a date-time window -----------
 * The consignment filter's dual-month range calendar, packaged as a form field:
 * one trigger ("27 Aug 2026, 09:00 → 28 Aug 2026, 17:00") opening a popover
 * with the range calendar plus start/end time pickers and Cancel/Apply. */
import { createPortal } from 'react-dom'

const fmtDay = (d: string) => {
  if (!d) return ''
  const dt = new Date(`${d}T00:00:00`)
  return isNaN(dt.getTime()) ? d : dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}


/* quarter-hour suggestions; anything can still be typed (HH:mm) */
const TIME_OPTIONS = Array.from({ length: 96 }, (_, i) =>
  `${String(Math.floor(i / 4)).padStart(2, '0')}:${String((i % 4) * 15).padStart(2, '0')}`)

function TimeSelect({ value, onChange, placeholder }: {
  value: string; onChange: (v: string) => void; placeholder: string
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    window.addEventListener('mousedown', h)
    return () => window.removeEventListener('mousedown', h)
  }, [open])
  return (
    <div className="relative" ref={ref}>
      <Clock size={13} className="pointer-events-none absolute left-2.5 top-1/2 z-10 -translate-y-1/2 text-warm-400" />
      <input
        value={value} placeholder={placeholder}
        onFocus={() => setOpen(true)}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 w-[104px] rounded-md border border-warm-300 bg-surface pl-8 pr-2 text-[13px] tabular-nums text-ink
                   placeholder:text-warm-400 transition-shadow focus:border-brand-500 focus:ring-[3px] focus:ring-brand-500/20"
      />
      {open && (
        <div className="absolute bottom-full left-0 z-10 mb-1 max-h-52 w-[104px] overflow-auto rounded-lg border border-line bg-surface py-1 shadow-ds-overlay">
          {TIME_OPTIONS.map((t) => (
            <button key={t} type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => { onChange(t); setOpen(false) }}
              className={`w-full px-3 py-1.5 text-left text-[12.5px] tabular-nums transition-colors hover:bg-warm-50
                ${t === value ? 'bg-brand-50 font-bold text-brand-500' : 'text-ink'}`}>
              {t}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function DateTimeRangeInput({ startDate, startTime, endDate, endTime, onApply, placeholder = 'Select window' }: {
  startDate: string; startTime: string; endDate: string; endTime: string
  onApply: (v: { startDate: string; startTime: string; endDate: string; endTime: string }) => void
  placeholder?: string
}) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top?: number; bottom?: number; left: number } | null>(null)
  const [from, setFrom] = useState(startDate)
  const [to, setTo] = useState(endDate)
  const [t1, setT1] = useState(startTime)
  const [t2, setT2] = useState(endTime)
  const [hover, setHover] = useState('')
  const [anchor, setAnchor] = useState(() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() } })
  const ref = useRef<HTMLDivElement>(null)
  const popRef = useRef<HTMLDivElement>(null)

  const openMenu = () => {
    const r = ref.current?.getBoundingClientRect()
    if (!r) return
    const POP_W = 580, POP_H = 556
    const left = Math.max(8, Math.min(r.left, window.innerWidth - POP_W - 8))
    const below = window.innerHeight - r.bottom
    if (below >= POP_H) setPos({ top: r.bottom + 4, left })
    else if (r.top >= POP_H) setPos({ bottom: window.innerHeight - r.top + 4, left })
    // neither side fits — clamp fully inside the viewport instead of clipping
    else setPos({ top: Math.max(8, window.innerHeight - POP_H - 8), left })
    setFrom(startDate); setTo(endDate); setT1(startTime); setT2(endTime)
    if (startDate) { const d = new Date(`${startDate}T00:00:00`); if (!isNaN(d.getTime())) setAnchor({ y: d.getFullYear(), m: d.getMonth() }) }
    setOpen(true)
  }
  useEffect(() => {
    if (!open) return
    const h = (e: MouseEvent) => {
      const t = e.target as Node
      if (!ref.current?.contains(t) && !popRef.current?.contains(t)) setOpen(false)
    }
    window.addEventListener('mousedown', h)
    return () => window.removeEventListener('mousedown', h)
  }, [open])

  const pick = (d: string) => {
    if (!from || to) { setFrom(d); setTo('') }
    else if (d >= from) setTo(d)
    else { setTo(from); setFrom(d) }
  }
  const nav = (months: number) => setAnchor((a) => { const d = new Date(a.y, a.m + months, 1); return { y: d.getFullYear(), m: d.getMonth() } })
  const second = new Date(anchor.y, anchor.m + 1, 1)
  const apply = () => {
    if (!from) return
    onApply({ startDate: from, startTime: t1, endDate: to || from, endTime: t2 })
    setOpen(false)
  }
  const clear = () => { onApply({ startDate: '', startTime: '', endDate: '', endTime: '' }); setOpen(false) }
  const display = startDate
    ? `${fmtDay(startDate)}${startTime ? `, ${startTime}` : ''} → ${fmtDay(endDate || startDate)}${endTime ? `, ${endTime}` : ''}`
    : ''

  return (
    <div className="relative" ref={ref}>
      <div onClick={() => (open ? setOpen(false) : openMenu())}
        className="h-8 w-full flex items-center gap-2 rounded-md border border-warm-300 bg-surface px-3 cursor-pointer
                   hover:border-warm-400 transition-colors">
        {display
          ? <span className="truncate text-[13px] tabular-nums text-ink">{display}</span>
          : <span className="text-[13px] text-warm-400">{placeholder}</span>}
        <Calendar size={14} className="ml-auto shrink-0 text-warm-400" />
      </div>
      {open && pos && createPortal(
        <div ref={popRef}
          style={{ top: pos.top, bottom: pos.bottom, left: pos.left }}
          className="fe-nueva fixed z-[95] flex flex-col rounded-xl border border-line bg-surface shadow-ds-overlay">
          <div className="p-4">
            {/* live readout — which side the next click fills is highlighted, and
                the target auto-advances Start → End as dates land */}
            <div className="mb-3 grid grid-cols-2 gap-2">
              {(() => {
                const fillingStart = !from || !!to
                const tile = (active: boolean) =>
                  `rounded-md border px-3 py-2 transition-colors ${active
                    ? 'border-brand-500 bg-brand-50/60'
                    : 'border-line bg-warm-25'}`
                const lbl = (active: boolean) =>
                  `text-[10.5px] font-black uppercase tracking-[0.08em] ${active ? 'text-brand-600' : 'text-ink-3'}`
                return (
                  <>
                    <div className={tile(fillingStart)}>
                      <p className={lbl(fillingStart)}>Start{fillingStart && ' — picking'}</p>
                      <p className="mt-0.5 text-[13px] tabular-nums text-ink">
                        {from ? `${fmtDay(from)}${t1 ? `, ${t1}` : ''}` : <span className="text-warm-400">Pick a date</span>}
                      </p>
                    </div>
                    <div className={tile(!fillingStart)}>
                      <p className={lbl(!fillingStart)}>End{!fillingStart && ' — picking'}</p>
                      <p className="mt-0.5 text-[13px] tabular-nums text-ink">
                        {to ? `${fmtDay(to)}${t2 ? `, ${t2}` : ''}` : <span className="text-warm-400">{fillingStart ? 'Then the end date' : 'Pick a date'}</span>}
                      </p>
                    </div>
                  </>
                )
              })()}
            </div>
            <div className="mb-2 flex items-center justify-between px-1">
              <span className="flex items-center gap-1">
                <button onClick={() => nav(-12)} className="rounded p-1 text-warm-400 hover:bg-warm-100 hover:text-ink-2"><ChevronsLeft size={15} /></button>
                <button onClick={() => nav(-1)} className="rounded p-1 text-warm-400 hover:bg-warm-100 hover:text-ink-2"><ChevronLeft size={15} /></button>
              </span>
              <span className="text-[13.5px] font-bold text-ink">{MONTHS[anchor.m]} {anchor.y}</span>
              <span className="w-10" />
              <span className="text-[13.5px] font-bold text-ink">{MONTHS[second.getMonth()]} {second.getFullYear()}</span>
              <span className="flex items-center gap-1">
                <button onClick={() => nav(1)} className="rounded p-1 text-warm-400 hover:bg-warm-100 hover:text-ink-2"><ChevronRight size={15} /></button>
                <button onClick={() => nav(12)} className="rounded p-1 text-warm-400 hover:bg-warm-100 hover:text-ink-2"><ChevronsRight size={15} /></button>
              </span>
            </div>
            <div className="flex gap-6">
              <MonthGrid year={anchor.y} month={anchor.m} from={from} to={to} hover={hover} onPick={pick} onHover={setHover} />
              <MonthGrid year={second.getFullYear()} month={second.getMonth()} from={from} to={to} hover={hover} onPick={pick} onHover={setHover} />
            </div>
          </div>
          <div className="flex items-center gap-3 border-t border-line px-4 py-3">
            <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-ink-3">Time</span>
            <TimeSelect value={t1} onChange={setT1} placeholder="09:00" />
            <MoveRight size={13} className="shrink-0 text-warm-400" />
            <TimeSelect value={t2} onChange={setT2} placeholder="17:00" />
            <span className="ml-auto flex items-center gap-2">
              <Button variant="ghost" onClick={clear}>Clear</Button>
              <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={apply} disabled={!from}>Apply</Button>
            </span>
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
}
