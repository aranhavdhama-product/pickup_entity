/**
 * The LOCAL console chrome — thin React wrappers over `chrome.css`.
 *
 * Pending For Planning's toolbar is the owner-finalised reference for every
 * page under /local (spec §11, 2026-09-23): underline tabs with icon + label +
 * count on the canvas, ONE filter line of 32px rounded controls, an optional
 * chip row. PFP and the other local pages all render it through these, so
 * there is one implementation.
 *
 * Glyphs come from `LocalPFP/icons.tsx` (SVG lifted from the staging DOM), so
 * the PFP tree still pulls no icon package through this file. Nothing here
 * imports `src/auth`.
 *
 * Nueva `Tabs` / `MenuSelect` / `DateInput` stay for `/console`.
 */
import { useEffect, useRef, useState, type ComponentType, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import {
  Calendar, CaretDown, ChevronLeft, ChevronRight, Funnel, SearchGlyph, SwapRight,
} from '../pages/LocalPFP/icons'
/* a portal leaves the LocalLayout root, so it re-applies the tokens itself */
import { cssVars } from '../pages/LocalPFP/stagingTokens'

/* ---------------------------------------------------------------- page ---- */

/** PFP's canvas + padding, so every page's tab strip lands at the same x/y. */
export function LocalPage({ children }: { children: ReactNode }) {
  return <div className="lc-page">{children}</div>
}

/* ------------------------------------------------------------- the tabs --- */

export interface LocalTab {
  id: string
  label: string
  count?: number
  icon?: ComponentType<{ size?: number | string; className?: string }>
}

/**
 * Underline tabs on the canvas: icon + "Label (n)", brand underline under the
 * active tab, one hairline under the WHOLE strip (actions included). `right`
 * holds the page's action buttons, vertically centred on the strip's right.
 */
export function LocalTabs({ tabs, active, onChange, right }: {
  tabs: LocalTab[]
  active: string
  onChange: (id: string) => void
  right?: ReactNode
}) {
  return (
    <div className="lc-tabs">
      <div className="lc-tabs-list" role="tablist">
        {tabs.map((t) => {
          const Icon = t.icon
          const on = t.id === active
          return (
            <button key={t.id} type="button" role="tab" aria-selected={on} className="lc-tab"
              onClick={() => onChange(t.id)}>
              {Icon && <span className="lc-tab-icon"><Icon size={15} /></span>}
              {t.count === undefined ? t.label : `${t.label} (${t.count})`}
            </button>
          )
        })}
      </div>
      {right && <div className="lc-tabs-right">{right}</div>}
    </div>
  )
}

/* -------------------------------------------------------- the filter line - */

/**
 * ONE line: date range · selects · funnel · Clear Filters, then `right`
 * (search + icon buttons). Children stay DIRECT children of `.pfp-filters` —
 * the row's shrink rules and the search pill's auto margin depend on it.
 */
export function FilterLine({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return <div className="pfp-filters">{children}{right}</div>
}

/* ------------------------------------------------------------ popover ----- */

type PopPos = { top?: number; bottom?: number; left: number; minWidth: number; maxHeight: number }

/** Measure a trigger and place a fixed popover under it (flipping up near the bottom). */
function placeUnder(el: HTMLElement | null, height: number): PopPos | null {
  const r = el?.getBoundingClientRect()
  if (!r) return null
  const below = window.innerHeight - r.bottom
  const up = below < Math.min(height, 200) && r.top > below
  return up
    ? { bottom: window.innerHeight - r.top + 4, left: r.left, minWidth: r.width, maxHeight: Math.min(height, r.top - 12) }
    : { top: r.bottom + 4, left: r.left, minWidth: r.width, maxHeight: Math.min(height, below - 12) }
}

/** Close on outside mousedown, Escape, and any outside scroll / resize. */
function useDismiss(open: boolean, close: () => void, refs: React.RefObject<HTMLElement | null>[]) {
  useEffect(() => {
    if (!open) return
    const inside = (t: EventTarget | null) => refs.some((r) => r.current?.contains(t as Node))
    const down = (e: MouseEvent) => { if (!inside(e.target)) close() }
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    const scroll = (e: Event) => { if (!inside(e.target)) close() }
    window.addEventListener('mousedown', down)
    window.addEventListener('keydown', key)
    window.addEventListener('scroll', scroll, true)
    window.addEventListener('resize', close)
    return () => {
      window.removeEventListener('mousedown', down)
      window.removeEventListener('keydown', key)
      window.removeEventListener('scroll', scroll, true)
      window.removeEventListener('resize', close)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])
}

/* ---------------------------------------------------------- date range ---- */

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const parseIso = (v: string) => {
  const d = v ? new Date(`${v}T00:00:00`) : null
  return d && !isNaN(d.getTime()) ? d : null
}
const shortDate = (v: string) => {
  const d = parseIso(v)
  return d ? d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' }) : v
}

function CalendarPop({ value, pos, popRef, onPick }: {
  value: string; pos: PopPos; popRef: React.RefObject<HTMLDivElement | null>; onPick: (v: string) => void
}) {
  const [view, setView] = useState<Date>(() => parseIso(value) ?? new Date())
  const y = view.getFullYear(), m = view.getMonth()
  const offset = (new Date(y, m, 1).getDay() + 6) % 7 // Monday-first
  const days = new Date(y, m + 1, 0).getDate()
  const today = iso(new Date())
  return createPortal(
    <div ref={popRef} className="pfp-pop lc-cal" data-fixed="true" data-lc-pop
      style={{ ...cssVars, top: pos.top, bottom: pos.bottom, left: pos.left }}>
      <div className="lc-cal-head">
        <button type="button" aria-label="Previous month" onClick={() => setView(new Date(y, m - 1, 1))}><ChevronLeft size={16} /></button>
        <span>{MONTHS[m]} {y}</span>
        <button type="button" aria-label="Next month" onClick={() => setView(new Date(y, m + 1, 1))}><ChevronRight size={16} /></button>
      </div>
      <div className="lc-cal-grid">
        {['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map((d) => <span key={d} className="lc-cal-dow">{d}</span>)}
        {Array.from({ length: offset }, (_, i) => <span key={`x${i}`} />)}
        {Array.from({ length: days }, (_, i) => {
          const d = iso(new Date(y, m, i + 1))
          return (
            <button key={d} type="button" className="lc-cal-day" aria-selected={d === value}
              data-today={d === today} onClick={() => onPick(d)}>{i + 1}</button>
          )
        })}
      </div>
      <div className="lc-cal-foot">
        <button type="button" data-kind="today" onClick={() => onPick(today)}>Today</button>
        <button type="button" onClick={() => onPick('')}>Clear</button>
      </div>
    </div>,
    document.body,
  )
}

/**
 * ONE pill: Start → End + a calendar glyph. `calendar` (default) opens a date
 * picker and speaks ISO `YYYY-MM-DD`, like the Nueva DateInput it replaces;
 * `text` keeps Pending For Planning's two free-text fields.
 */
export function DateRange({ start, end, onStart, onEnd, mode = 'calendar' }: {
  start: string; end: string
  onStart: (v: string) => void; onEnd: (v: string) => void
  mode?: 'calendar' | 'text'
}) {
  const [open, setOpen] = useState<'start' | 'end' | null>(null)
  const [pos, setPos] = useState<PopPos | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  const popRef = useRef<HTMLDivElement>(null)
  useDismiss(!!open, () => setOpen(null), [ref, popRef])

  if (mode === 'text') {
    return (
      <div className="pfp-daterange">
        <input value={start} placeholder="Start Date" onChange={(e) => onStart(e.target.value)} />
        <span className="pfp-daterange-sep"><SwapRight size={16} /></span>
        <input value={end} placeholder="End Date" onChange={(e) => onEnd(e.target.value)} />
        <span className="pfp-daterange-icon"><Calendar size={14} /></span>
      </div>
    )
  }

  const toggle = (half: 'start' | 'end') => {
    if (open === half) { setOpen(null); return }
    setPos(placeUnder(ref.current, 332))
    setOpen(half)
  }
  const half = (which: 'start' | 'end', value: string, placeholder: string) => (
    <button type="button" className="lc-date-half" data-empty={!value} title={value || placeholder}
      aria-expanded={open === which} onClick={() => toggle(which)}>
      {value ? shortDate(value) : placeholder}
    </button>
  )
  return (
    <div className="pfp-daterange" ref={ref}>
      {half('start', start, 'Start Date')}
      <span className="pfp-daterange-sep"><SwapRight size={16} /></span>
      {half('end', end, 'End Date')}
      <button type="button" className="pfp-daterange-icon" aria-label="Open calendar"
        onClick={() => toggle(start ? 'end' : 'start')}><Calendar size={14} /></button>
      {open && pos && (
        <CalendarPop key={open} value={open === 'start' ? start : end} pos={pos} popRef={popRef}
          onPick={(v) => { (open === 'start' ? onStart : onEnd)(v); setOpen(null) }} />
      )}
    </div>
  )
}

/* ------------------------------------------------------------- select ----- */

/**
 * A pill select with a chevron and a custom listbox (portaled, so no card or
 * scroller clips it). The first entry is the placeholder and clears the value
 * — the way PFP's own row selects work.
 */
export function FilterSelect({ value, placeholder, options, onChange, width, labels, searchable, disabled }: {
  value: string
  placeholder: string
  options: string[]
  onChange: (v: string) => void
  width?: number
  labels?: (v: string) => string
  searchable?: boolean
  /** inert, and says why through its placeholder */
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [pos, setPos] = useState<PopPos | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  const popRef = useRef<HTMLDivElement>(null)
  useDismiss(open, () => setOpen(false), [ref, popRef])
  const label = (o: string) => (labels ? labels(o) : o)
  const needle = q.trim().toLowerCase()
  const shown = options.filter((o) => !needle || label(o).toLowerCase().includes(needle) || o.toLowerCase().includes(needle))
  const pick = (v: string) => { onChange(v); setOpen(false) }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <div className="pfp-select" style={{ width }} role="button" tabIndex={disabled ? -1 : 0}
        aria-haspopup="listbox" aria-expanded={open} aria-disabled={disabled || undefined}
        data-placeholder={!value}
        onClick={() => {
          if (disabled) return
          if (open) { setOpen(false); return }
          setPos(placeUnder(ref.current, 300)); setQ(''); setOpen(true)
        }}
        onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && !disabled) { e.preventDefault(); (e.currentTarget as HTMLElement).click() } }}>
        <span>{value ? label(value) : placeholder}</span>
        <span className="pfp-select-caret"><CaretDown size={16} /></span>
      </div>
      {open && pos && createPortal(
        <div ref={popRef} role="listbox" className="pfp-pop" data-fixed="true" data-lc-pop
          style={{ ...cssVars, top: pos.top, bottom: pos.bottom, left: pos.left, minWidth: Math.max(pos.minWidth, 200), maxWidth: 360, maxHeight: pos.maxHeight }}>
          {searchable && (
            <div className="lc-pop-search">
              <input autoFocus value={q} placeholder="Search…" onChange={(e) => setQ(e.target.value)} />
            </div>
          )}
          <div className="pfp-pop-scroll" style={{ minHeight: 0 }}>
            <button type="button" role="option" aria-selected={false} className="pfp-pop-option" onClick={() => pick('')}>
              <span>{placeholder}</span>
            </button>
            {shown.map((o) => (
              <button key={o} type="button" role="option" aria-selected={o === value} className="pfp-pop-option" onClick={() => pick(o)}>
                <span>{label(o)}</span>
              </button>
            ))}
            {shown.length === 0 && <p className="lc-pop-empty">{needle ? 'No match' : 'No options'}</p>}
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
}

/**
 * A multi-value pill: same shell as FilterSelect, a checkbox list inside.
 * Toggling applies at once (as the Nueva AdvancedFilters it replaces did).
 */
export function FilterMultiSelect({ values, placeholder, options, onChange, width, labels, groupOf }: {
  values: string[]
  placeholder: string
  options: string[]
  onChange: (vals: string[]) => void
  width?: number
  /** display text for a value (defaults to the value) */
  labels?: (v: string) => string
  /** a group heading for a value — a heading row is drawn whenever it changes */
  groupOf?: (v: string) => string
}) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [pos, setPos] = useState<PopPos | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  const popRef = useRef<HTMLDivElement>(null)
  useDismiss(open, () => setOpen(false), [ref, popRef])
  const needle = q.trim().toLowerCase()
  const text = (o: string) => (labels ? labels(o) : o)
  const shown = options.filter((o) => !needle || text(o).toLowerCase().includes(needle))
  const toggle = (o: string) => onChange(values.includes(o) ? values.filter((x) => x !== o) : [...values, o])
  const label = values.length === 0 ? placeholder
    : values.length === 1 ? `${placeholder}: ${text(values[0])}` : `${placeholder}: ${values.length} selected`

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <div className="pfp-select" style={{ width }} role="button" tabIndex={0}
        aria-haspopup="listbox" aria-expanded={open} data-placeholder={values.length === 0}
        onClick={() => { if (open) { setOpen(false); return } setPos(placeUnder(ref.current, 300)); setQ(''); setOpen(true) }}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); (e.currentTarget as HTMLElement).click() } }}>
        <span>{label}</span>
        <span className="pfp-select-caret"><CaretDown size={16} /></span>
      </div>
      {open && pos && createPortal(
        <div ref={popRef} role="listbox" aria-multiselectable className="pfp-pop" data-fixed="true" data-lc-pop
          style={{ ...cssVars, top: pos.top, bottom: pos.bottom, left: pos.left, minWidth: Math.max(pos.minWidth, 220), maxWidth: 360, maxHeight: pos.maxHeight }}>
          {options.length > 8 && (
            <div className="lc-pop-search">
              <input autoFocus value={q} placeholder="Search…" onChange={(e) => setQ(e.target.value)} />
            </div>
          )}
          <div className="pfp-pop-scroll" style={{ minHeight: 0 }}>
            {shown.map((o, i) => {
              const g = groupOf?.(o)
              return (
                <div key={o}>
                  {g && (i === 0 || g !== groupOf?.(shown[i - 1])) && <p className="lc-pop-group">{g}</p>}
                  <button type="button" role="option" aria-selected={false} className="pfp-pop-option" onClick={() => toggle(o)}>
                    <input type="checkbox" readOnly checked={values.includes(o)} tabIndex={-1} />
                    <span>{text(o)}</span>
                  </button>
                </div>
              )
            })}
            {shown.length === 0 && <p className="lc-pop-empty">{needle ? 'No match' : 'No options'}</p>}
          </div>
          <div className="pfp-pop-foot">
            <button type="button" data-kind="clear" onClick={() => onChange([])}>Clear</button>
            <button type="button" data-kind="apply" onClick={() => setOpen(false)}>Done</button>
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
}

/**
 * The funnel + its panel, PFP-style: one full-width pill per advanced
 * dimension, stacked in the padded `.pfp-funnel-pop`. Same contract as the
 * Nueva AdvancedFilters it replaces on the local pages (multi-value per key).
 */
export function FunnelFilters({ defs, values, onChange }: {
  defs: { key: string; label: string; options: string[] }[]
  values: Record<string, string[]>
  onChange: (key: string, vals: string[]) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    /* a pill's own list is portaled; a click in it is still "inside" */
    const down = (e: MouseEvent) => {
      const t = e.target as Element | null
      if (ref.current?.contains(t) || t?.closest?.('[data-lc-pop]')) return
      setOpen(false)
    }
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('mousedown', down)
    window.addEventListener('keydown', key)
    return () => { window.removeEventListener('mousedown', down); window.removeEventListener('keydown', key) }
  }, [open])
  if (!defs.length) return null
  const count = defs.filter((d) => values[d.key]?.length).length
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <FunnelButton active={open} count={count} onClick={() => setOpen((v) => !v)} />
      {open && (
        <div className="pfp-pop pfp-funnel-pop" style={{ top: 36, left: 0 }}>
          <div className="pfp-pop-scroll">
            {defs.map((d) => (
              <FilterMultiSelect key={d.key} values={values[d.key] ?? []} placeholder={d.label}
                options={d.options} onChange={(vals) => onChange(d.key, vals)} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------ funnel · clear · search - */

/** The brand-outlined funnel. `count` = how many advanced filters are set. */
export function FunnelButton({ active, onClick, count }: { active?: boolean; onClick: () => void; count?: number }) {
  return (
    <button type="button" className="pfp-funnel" aria-label="More filters" aria-expanded={active}
      data-active={active || !!count || undefined} onClick={onClick}>
      <Funnel size={16} />
      {!!count && <span className="lc-funnel-count">{count}</span>}
    </button>
  )
}

export function ClearFilters({ active, onClick }: { active: boolean; onClick: () => void }) {
  return <button type="button" className="pfp-clear" onClick={onClick} disabled={!active}>Clear Filters</button>
}

export function SearchBox({ value, onChange, placeholder = 'Search' }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="pfp-search">
      <SearchGlyph size={16} />
      <input value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </div>
  )
}

/** A 32px icon action. `bordered` = the funnel-shell toggle; `pressed` = open. */
export function IconBtn({ children, title, onClick, pressed, bordered }: {
  children: ReactNode; title: string; onClick?: () => void; pressed?: boolean; bordered?: boolean
}) {
  return (
    <button type="button" className={bordered ? 'pfp-iconbtn pfp-toggle' : 'pfp-iconbtn'}
      title={title} aria-label={title} aria-pressed={pressed} onClick={onClick}>
      {children}
    </button>
  )
}

/* ------------------------------------------------------- column chooser -- */

/**
 * The ⚙ column chooser: a 32px icon action opening a checkbox list of the
 * grid's columns (+ Reset). The glyph is the caller's `children`, so this file
 * still pulls no icon package. At least one column always stays on.
 */
export function ColumnChooser({ columns, visible, onChange, onReset, children, title = 'Columns' }: {
  columns: { key: string; label: string }[]
  visible: string[]
  onChange: (keys: string[]) => void
  onReset: () => void
  children: ReactNode
  title?: string
}) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<PopPos | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  const popRef = useRef<HTMLDivElement>(null)
  useDismiss(open, () => setOpen(false), [ref, popRef])
  const toggle = (k: string) => {
    const on = visible.includes(k)
    if (on && visible.length === 1) return
    /* keep the grid's own order, whatever order the clicks came in */
    onChange(columns.map((c) => c.key).filter((x) => (x === k ? !on : visible.includes(x))))
  }
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button type="button" className="pfp-iconbtn pfp-toggle" title={title} aria-label={title}
        aria-pressed={open} aria-haspopup="listbox"
        onClick={() => {
          if (open) { setOpen(false); return }
          const p = placeUnder(ref.current, 420)
          /* right-align: the chooser sits at the line's right edge */
          setPos(p && { ...p, left: Math.max(8, (ref.current?.getBoundingClientRect().right ?? 0) - 240) })
          setOpen(true)
        }}>
        {children}
      </button>
      {open && pos && createPortal(
        <div ref={popRef} role="listbox" aria-multiselectable className="pfp-pop" data-fixed="true" data-lc-pop
          style={{ ...cssVars, top: pos.top, bottom: pos.bottom, left: pos.left, width: 240, maxHeight: pos.maxHeight }}>
          <p className="lc-pop-group">Columns</p>
          <div className="pfp-pop-scroll" style={{ minHeight: 0 }}>
            {columns.map((c) => (
              <button key={c.key} type="button" role="option" aria-selected={false} className="pfp-pop-option" onClick={() => toggle(c.key)}>
                <input type="checkbox" readOnly checked={visible.includes(c.key)} tabIndex={-1} />
                <span>{c.label}</span>
              </button>
            ))}
          </div>
          <div className="pfp-pop-foot">
            <button type="button" data-kind="clear" onClick={onReset}>Reset</button>
            <button type="button" data-kind="apply" onClick={() => setOpen(false)}>Done</button>
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
}

/* ------------------------------------------------------------ chip row ---- */

/** The optional second line under the filter line — chips only. */
export function ChipRow({ children }: { children: ReactNode }) {
  return <div className="pfp-chipbar">{children}</div>
}

export function ChipLabel({ children }: { children: ReactNode }) {
  return <span className="pfp-chipbar-label">{children}</span>
}

/** pushes the chips after it to the row's right edge */
export function ChipSpacer() {
  return <span className="lc-chipbar-spacer" aria-hidden />
}

export function Chip({ children, count, active, onClick, tone }: {
  children: ReactNode; count?: number; active?: boolean; onClick?: () => void; tone?: 'danger'
}) {
  return (
    <button type="button" className="pfp-chip" data-size="sm" data-tone={tone} aria-pressed={!!active} onClick={onClick}>
      {children}
      {count !== undefined && <span className="pfp-chip-count">{count}</span>}
    </button>
  )
}
