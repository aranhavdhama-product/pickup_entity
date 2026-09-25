// FarEye Nueva — design-system primitives (see design.md)
import { useEffect, useRef, useState, type ComponentType, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import {
  Plus, SlidersHorizontal, X, ChevronDown, Search,
  Pencil, ChevronRight, ChevronLeft, Info, Check,
  MoreVertical, AlertCircle, Upload, FileSpreadsheet, Download,
  AlertTriangle, CheckCircle2, CalendarDays, ChevronUp, ArrowLeft,
} from 'lucide-react'
import {
  DATASTORES, datastoreById, download, isBinaryXlsx, parseCsv, parseSpreadsheetML,
  toSpreadsheetML, classifyRows, matchSheet,
  type Datastore, type Match, type ParsedSheet, type RowIssue,
} from './masterDataIO'

/* ---------------- Button ---------------- */
type BtnVariant = 'primary' | 'outline' | 'ghost' | 'text'
export function Button({
  children, variant = 'primary', size = 'md', icon, onClick, type = 'button', disabled,
}: {
  children?: ReactNode; variant?: BtnVariant; size?: 'sm' | 'md'; icon?: ReactNode
  onClick?: () => void; type?: 'button' | 'submit'; disabled?: boolean
}) {
  const base = 'inline-flex items-center justify-center gap-1.5 rounded-md font-bold whitespace-nowrap transition-colors disabled:opacity-50 disabled:cursor-not-allowed'
  const sizes = size === 'sm' ? 'h-7 px-2.5 text-[12px]' : 'h-8 px-3.5 text-[13px]'
  const variants: Record<BtnVariant, string> = {
    primary: 'bg-brand-500 text-white hover:bg-brand-600',
    outline: 'bg-surface text-brand-500 border border-brand-500 hover:bg-brand-50',
    ghost: 'bg-transparent text-ink-2 hover:bg-warm-100',
    text: 'bg-transparent text-ink-2 hover:text-ink',
  }
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={`${base} ${sizes} ${variants[variant]}`}>
      {icon}{children}
    </button>
  )
}

export function IconButton({ icon, onClick, title }: { icon: ReactNode; onClick?: () => void; title?: string }) {
  return (
    <button type="button" title={title} onClick={onClick}
      className="h-8 w-8 inline-flex items-center justify-center rounded-md border border-line bg-surface text-ink-2 hover:bg-warm-100 transition-colors">
      {icon}
    </button>
  )
}

/* ---------------- Inputs ---------------- */
export function Input({
  value, onChange, placeholder, type = 'text', size = 'sm', disabled, onKeyDown, variant = 'default',
}: {
  value?: string; onChange?: (v: string) => void; placeholder?: string; type?: string; size?: 'sm' | 'lg'; disabled?: boolean; onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void
  /** 'ghost' = borderless until hover / focus — a table cell that is a field */
  variant?: 'default' | 'ghost'
}) {
  const lg = size === 'lg'
  const shell = variant === 'ghost' ? 'border-transparent bg-transparent hover:border-warm-300' : 'border-warm-300 bg-surface'
  return (
    <input
      type={type} value={value ?? ''} placeholder={placeholder} disabled={disabled} onKeyDown={onKeyDown}
      onChange={(e) => onChange?.(e.target.value)}
      className={`w-full border ${shell} px-3 text-ink placeholder:text-warm-400
                 focus:border-brand-500 focus:ring-[3px] focus:ring-brand-500/20 transition-shadow
                 disabled:bg-warm-50 disabled:text-ink-3 disabled:cursor-not-allowed
                 ${lg ? 'h-11 rounded-lg text-[14px]' : 'h-8 rounded-md text-[13px]'}`}
    />
  )
}

export function SearchInput({ value, onChange, placeholder = 'Search' }: { value?: string; onChange?: (v: string) => void; placeholder?: string }) {
  return (
    <div className="relative">
      <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-warm-400" />
      <input
        value={value ?? ''} placeholder={placeholder} onChange={(e) => onChange?.(e.target.value)}
        className="h-8 w-full rounded-md border border-warm-300 bg-surface pl-8 pr-8 text-[13px] text-ink placeholder:text-warm-400
                   focus:border-brand-500 focus:ring-[3px] focus:ring-brand-500/20 transition-shadow"
      />
      {(value ?? '') !== '' && (
        <button type="button" onClick={() => onChange?.('')} title="Clear search"
          className="absolute right-2 top-1/2 -translate-y-1/2 text-warm-400 hover:text-ink">
          <X size={13} />
        </button>
      )}
    </div>
  )
}

export function Select({
  value, placeholder = 'Select', options = [], onChange, size = 'sm', labels,
}: { value?: string; placeholder?: string; options?: string[]; onChange?: (v: string) => void; size?: 'sm' | 'lg'; labels?: (v: string) => string }) {
  const lg = size === 'lg'
  return (
    <div className="relative">
      <select
        value={value ?? ''} onChange={(e) => onChange?.(e.target.value)}
        className={`w-full appearance-none border border-warm-300 bg-surface text-ink
                   focus:border-brand-500 focus:ring-[3px] focus:ring-brand-500/20 transition-shadow
                   data-[empty=true]:text-warm-400 ${lg ? 'h-11 rounded-lg text-[14px] pl-3 pr-9' : 'h-8 rounded-md text-[13px] pl-3 pr-8'}`}
        data-empty={!value}
      >
        <option value="" disabled hidden>{placeholder}</option>
        {options.map((o) => <option key={o} value={o}>{labels ? labels(o) : o}</option>)}
      </select>
      <ChevronDown size={lg ? 16 : 14} className={`pointer-events-none absolute ${lg ? 'right-3' : 'right-2.5'} top-1/2 -translate-y-1/2 text-warm-400`} />
    </div>
  )
}

/**
 * MenuSelect — same trigger anatomy as Select, but the menu is our own popover
 * instead of the OS-native option list. Used on forms; Masters keeps the plain
 * Select untouched.
 */
export function MenuSelect({
  value, placeholder = 'Select', options = [], onChange, size = 'sm', labels, searchable, creatable, renderOption, renderValue,
}: {
  value?: string; placeholder?: string; options?: string[]; onChange?: (v: string) => void; size?: 'sm' | 'lg'; labels?: (v: string) => string; searchable?: boolean; creatable?: boolean
  /** optional rich (multi-line) rendering of a menu option; `labels` still drives search and the fallback text */
  renderOption?: (v: string, active: boolean) => ReactNode
  /** optional rich rendering of the selected value inside the closed trigger */
  renderValue?: (v: string) => ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  // menu geometry, measured from the trigger when opening; flips up when the
  // viewport bottom is close so the list is never cut off
  const [pos, setPos] = useState<{ top?: number; bottom?: number; left: number; width: number; maxHeight: number } | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  const popRef = useRef<HTMLDivElement>(null)
  const lg = size === 'lg'

  const openMenu = () => {
    const r = ref.current?.getBoundingClientRect()
    if (!r) return
    const below = window.innerHeight - r.bottom
    const up = below < 200 && r.top > below
    setPos(up
      ? { bottom: window.innerHeight - r.top + 4, left: r.left, width: r.width, maxHeight: Math.min(240, r.top - 12) }
      : { top: r.bottom + 4, left: r.left, width: r.width, maxHeight: Math.min(240, below - 12) })
    setQ('')
    setOpen(true)
  }

  useEffect(() => {
    if (!open) return
    const click = (e: MouseEvent) => {
      const t = e.target as Node
      if (!ref.current?.contains(t) && !popRef.current?.contains(t)) setOpen(false)
    }
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    // any outside scroll or a resize invalidates the measured position — close
    const scroll = (e: Event) => { if (!popRef.current?.contains(e.target as Node)) setOpen(false) }
    window.addEventListener('mousedown', click)
    window.addEventListener('keydown', key)
    window.addEventListener('scroll', scroll, true)
    window.addEventListener('resize', scroll)
    return () => {
      window.removeEventListener('mousedown', click)
      window.removeEventListener('keydown', key)
      window.removeEventListener('scroll', scroll, true)
      window.removeEventListener('resize', scroll)
    }
  }, [open])

  const shown = value?.trim() ? (labels ? labels(value) : value) : ''
  return (
    <div ref={ref} className="relative">
      <button
        type="button" onClick={() => (open ? setOpen(false) : openMenu())}
        aria-haspopup="listbox" aria-expanded={open}
        className={`flex w-full items-center justify-between gap-2 border border-warm-300 bg-surface text-left
                   focus:border-brand-500 focus:ring-[3px] focus:ring-brand-500/20 focus:outline-none transition-shadow
                   ${lg ? 'h-11 rounded-lg text-[14px] pl-3 pr-3' : 'h-8 rounded-md text-[13px] pl-3 pr-2.5'}`}>
        <span className={`min-w-0 truncate ${shown ? 'text-ink' : 'text-warm-400'}`}>
          {shown ? (renderValue && value ? renderValue(value) : shown) : (placeholder.trim() ? placeholder : 'Select')}
        </span>
        <ChevronDown size={lg ? 16 : 14}
          className={`shrink-0 text-warm-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {/* portaled to <body>: an overflow-hidden card/modal ancestor can never clip it */}
      {open && pos && createPortal(
        <div ref={popRef} role="listbox"
          style={{ top: pos.top, bottom: pos.bottom, left: pos.left, width: pos.width, maxHeight: pos.maxHeight }}
          className="fe-nueva fixed z-[95] flex flex-col rounded-md border border-line bg-surface py-1 shadow-ds-overlay">
          {searchable && (options.length > 0 || creatable) && (
            <div className="border-b border-line px-2 pb-1.5 pt-1">
              <input
                autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…"
                className="h-7 w-full rounded border border-warm-200 bg-surface px-2 text-[12.5px] text-ink placeholder:text-warm-400 focus:border-brand-500 focus:outline-none" />
            </div>
          )}
          <div className="min-h-0 overflow-auto">
          {options.length === 0 && !(creatable && q.trim()) && (
            <p className="px-3 py-2 text-[12.5px] text-ink-3">{creatable ? 'Type to add a value' : 'No options'}</p>
          )}
          {/* staging's "add new" pattern: a typed value not in the list can be added */}
          {creatable && q.trim() &&
            !options.some((o) => o.toLowerCase() === q.trim().toLowerCase() || (labels ? labels(o) : o).toLowerCase() === q.trim().toLowerCase()) && (
            <button
              type="button"
              onClick={() => { onChange?.(q.trim()); setOpen(false) }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] font-bold text-brand-500 hover:bg-warm-50">
              <Plus size={13} /> Add “{q.trim()}”
            </button>
          )}
          {options.filter((o) => !q.trim() || (labels ? labels(o) : o).toLowerCase().includes(q.trim().toLowerCase()) || o.toLowerCase().includes(q.trim().toLowerCase())).map((o) => {
            const active = o === value
            return (
              <button
                key={o} type="button" role="option" aria-selected={active}
                onClick={() => { onChange?.(o); setOpen(false) }}
                className={`flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-[13px] transition-colors
                  ${active ? 'bg-warm-50 font-bold text-ink' : 'text-ink hover:bg-warm-50'}`}>
                {renderOption
                  ? <span className="min-w-0 flex-1">{renderOption(o, active)}</span>
                  : <span className="truncate">{labels ? labels(o) : o}</span>}
                {active && <Check size={13} className="shrink-0" />}
              </button>
            )
          })}
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
}

/* A pill-style dropdown filter (label + caret), used in master filter rows */
export function FilterPill({ label }: { label: string }) {
  return (
    <button type="button"
      className="shrink-0 h-8 inline-flex items-center gap-2 rounded-md border border-warm-300 bg-surface px-3 text-[13px] text-ink-2 hover:bg-warm-100 whitespace-nowrap">
      {label}<ChevronDown size={14} className="text-warm-400" />
    </button>
  )
}

/* Functional filter dropdown — label + selectable options */
export function FilterDropdown({ label, options, value, onChange }: {
  label: string; options: string[]; value?: string; onChange: (v: string) => void
}) {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    if (!open) return
    const h = (e: MouseEvent) => { if (!(e.target as HTMLElement).closest(`[data-fd="${label}"]`)) setOpen(false) }
    window.addEventListener('click', h)
    return () => window.removeEventListener('click', h)
  }, [open, label])
  const active = !!value
  return (
    <div className="relative shrink-0" data-fd={label}>
      <button onClick={() => setOpen((v) => !v)}
        className={`h-8 inline-flex items-center gap-2 rounded-md border px-3 text-[13px] whitespace-nowrap transition-colors
          ${active ? 'border-warm-400 text-ink bg-warm-100 font-medium' : 'border-warm-300 text-ink-2 bg-surface hover:bg-warm-100'}`}>
        {value || label}<ChevronDown size={14} className={active ? 'text-ink-2' : 'text-warm-400'} />
      </button>
      {open && (
        <div className="absolute left-0 top-9 z-30 w-52 bg-surface border border-line rounded-lg shadow-ds-overlay py-1.5">
          <button onClick={() => { onChange(''); setOpen(false) }}
            className={`w-full text-left px-3 py-1.5 text-[13px] hover:bg-warm-50 ${!value ? 'text-brand-600 font-bold' : 'text-ink-2'}`}>All {label}</button>
          {options.map((o) => (
            <button key={o} onClick={() => { onChange(o); setOpen(false) }}
              className={`w-full text-left px-3 py-1.5 text-[13px] hover:bg-warm-50 ${value === o ? 'text-brand-600 font-bold' : 'text-ink'}`}>{o}</button>
          ))}
        </div>
      )}
    </div>
  )
}

export function Toggle({ checked, onChange }: { checked: boolean; onChange?: (v: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={checked} onClick={() => onChange?.(!checked)}
      className={`relative h-5 w-9 rounded-full transition-colors ${checked ? 'bg-brand-500' : 'bg-warm-300'}`}>
      <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${checked ? 'left-[18px]' : 'left-0.5'}`} />
    </button>
  )
}

export function Checkbox({ checked, indeterminate, onChange, label }: { checked?: boolean; indeterminate?: boolean; onChange?: (v: boolean) => void; label?: ReactNode }) {
  const filled = checked || indeterminate
  return (
    <label className="inline-flex items-center gap-2 cursor-pointer select-none">
      <button type="button" onClick={() => onChange?.(!checked)}
        className={`h-3.5 w-3.5 rounded-[3px] border flex items-center justify-center transition-colors
          ${filled ? 'bg-brand-500 border-brand-500' : 'bg-surface border-warm-300'}`}>
        {indeterminate && !checked
          ? <span className="h-0.5 w-2 bg-white rounded" />
          : checked && <Check size={11} className="text-white" strokeWidth={3} />}
      </button>
      {label && <span className="text-[13px] text-ink-2">{label}</span>}
    </label>
  )
}

/* ---------------- Status pill ---------------- */
const STATUS_TINTS: Record<string, string> = {
  success: 'bg-success-bg text-success-fg',
  info: 'bg-info-bg text-info-fg',
  warning: 'bg-warning-bg text-warning-fg',
  danger: 'bg-danger-bg text-danger-fg',
  neutral: 'bg-neutral-bg text-neutral-fg',
}
export function StatusPill({ label, tone = 'neutral' }: { label: string; tone?: keyof typeof STATUS_TINTS }) {
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11.5px] font-bold leading-[1.6] ${STATUS_TINTS[tone] ?? STATUS_TINTS.neutral}`}>
      {label}
    </span>
  )
}

/* ---------------- Card / page header ---------------- */
/* Slim page-context line — the app header already carries the big page title,
   so this is one quiet row: back chip, 15px name, muted subtitle after a dot. */
export function PageHeader({ title, subtitle, onBack, right }: { title: string; subtitle?: string; onBack?: () => void; right?: ReactNode }) {
  return (
    <div className="flex items-center gap-2.5 mb-3.5 min-h-8">
      {onBack && (
        <button onClick={onBack} className="h-8 w-8 shrink-0 inline-flex items-center justify-center rounded-md border border-line bg-surface text-ink-2 hover:bg-warm-100 shadow-ds-1 transition-colors">
          <ChevronLeft size={16} />
        </button>
      )}
      {/* subtitle stacks BELOW the title on every page — never beside it */}
      <div className="min-w-0">
        <h2 className="text-[15px] font-bold text-ink leading-tight whitespace-nowrap">{title}</h2>
        {subtitle && <p className="mt-0.5 text-[12.5px] text-ink-3 truncate">{subtitle}</p>}
      </div>
      {right && <div className="ml-auto shrink-0">{right}</div>}
    </div>
  )
}

/* List row card (Masters landing / category cards) */
export function ListCard({ icon, title, badge, desc, onClick }: { icon: ReactNode; title: string; badge?: string; desc: string; onClick?: () => void }) {
  return (
    <button onClick={onClick}
      className="w-full text-left bg-surface border border-line rounded-md px-5 py-4 flex items-center gap-4 hover:shadow-ds-1 hover:border-warm-300 transition-all group">
      <span className="h-10 w-10 shrink-0 rounded-lg bg-warm-100 text-ink-2 inline-flex items-center justify-center">{icon}</span>
      <span className="min-w-0">
        <span className="block text-[15px] font-bold text-ink">{title}</span>
        <span className="block text-[13px] text-ink-3 mt-0.5">{desc}</span>
        {badge && <span className="mt-1.5 inline-block text-[10px] font-bold text-brand-500 border border-brand-200 bg-brand-50 rounded-full px-1.5 py-0.5">{badge}</span>}
      </span>
      <ChevronRight size={18} className="ml-auto shrink-0 text-warm-400 group-hover:text-ink-2" />
    </button>
  )
}

/* ---------------- Shared page-shell primitives ----------------
 * Every settings/console page builds from these — see "Design consistency"
 * in CLAUDE.md. Do not hand-roll panels, loaders, error boxes or tables. */

export function Panel({ children, title }: { children: ReactNode; title?: string }) {
  return (
    <div className="bg-surface border border-line rounded-xl shadow-ds-1">
      {title && <div className="px-5 pt-4 pb-1 text-[15px] font-bold text-ink">{title}</div>}
      {children}
    </div>
  )
}

export function LoadingBox({ label = 'Loading…' }: { label?: string }) {
  return <div className="bg-surface border border-line rounded-xl px-5 py-10 text-center text-[13px] text-ink-3 animate-pulse">{label}</div>
}

/** turn raw failures ("dockMaster/fetch 503") into copy a person can act on;
 * the technical detail stays visible but demoted */
function humanizeError(error: string): { title: string; message: string } {
  const status = Number(/\b(4\d\d|5\d\d)\b/.exec(error)?.[1] ?? 0)
  if (status === 502 || status === 503 || status === 504) return {
    title: 'Service temporarily unavailable',
    message: 'The FarEye master service is not responding right now. This is a server-side outage — nothing on your end. Please try again in a minute.',
  }
  if (status === 401) return {
    title: 'Session expired',
    message: 'Your staging session is no longer valid. Sign in again to continue.',
  }
  if (status === 403) return {
    title: 'No access',
    message: 'Your account does not have permission to view this data.',
  }
  if (status === 404) return {
    title: 'Not found',
    message: 'This data could not be found on the server — it may have been removed or renamed.',
  }
  if (status >= 500) return {
    title: 'Server error',
    message: 'The server hit an unexpected error while loading this data. Please try again.',
  }
  if (status === 429) return {
    title: 'Too many requests',
    message: 'The server is rate-limiting requests. Wait a moment, then retry.',
  }
  if (/failed to fetch|networkerror|load failed/i.test(error)) return {
    title: 'Connection problem',
    message: 'Could not reach the server. Check your connection (and the dev proxy), then retry.',
  }
  return { title: 'Something went wrong', message: 'The data could not be loaded. Please try again.' }
}

export function ErrorBox({ error, onRetry, hint }: { error: string; onRetry: () => void; hint?: string }) {
  const h = humanizeError(error)
  return (
    <div className="bg-surface border border-line rounded-md px-5 py-8 flex flex-col items-center gap-2 text-center">
      <AlertCircle size={20} className="text-danger-fg" />
      <p className="text-[14px] font-bold text-ink">{h.title}</p>
      <div className="text-[13px] text-ink-3 max-w-md">{h.message}{hint && <div className="mt-1">{hint}</div>}</div>
      <button onClick={onRetry}
        className="mt-1 inline-flex items-center gap-1.5 h-8 px-3.5 rounded-md border border-brand-500 bg-surface text-[13px] font-bold text-brand-500 hover:bg-warm-50 transition-colors">
        Retry
      </button>
      <p className="mt-1 font-mono text-[11px] text-warm-400">{error}</p>
    </div>
  )
}

/** Lightweight data table — one look for every list page. */
export type SimpleCol<T> = { label: string; render: (row: T) => ReactNode; align?: 'left' | 'right' }
export function SimpleTable<T>({ columns, rows, rowKey, onRowClick }: {
  columns: SimpleCol<T>[]
  rows: T[]
  rowKey: (row: T) => string | number
  onRowClick?: (row: T) => void
}) {
  return (
    <table className="w-full text-[13px]">
      <thead>
        <tr className="text-left text-ink border-b border-line">
          {columns.map((c, i) => (
            <th key={c.label} className={`py-2.5 font-bold ${i === 0 ? 'px-5' : 'px-3'} ${c.align === 'right' ? 'text-right' : ''}`}>{c.label}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={rowKey(r)} onClick={() => onRowClick?.(r)}
            className={`border-b border-line last:border-0 hover:bg-warm-50 transition-colors ${onRowClick ? 'cursor-pointer' : ''}`}>
            {columns.map((c, i) => (
              <td key={c.label} className={`py-3 ${i === 0 ? 'px-5' : 'px-3'} ${c.align === 'right' ? 'text-right' : ''}`}>{c.render(r)}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/* ---------------- AdvancedFilters — two-pane multi-select filter panel ----------------
 * Funnel trigger → popover: filter dimensions listed on the LEFT, the selected
 * dimension's values on the RIGHT with a search box and checkboxes. */
export function AdvancedFilters({ defs, values, onChange }: {
  defs: { label: string; key: string; options: string[] }[]
  values: Record<string, string[]>
  onChange: (key: string, vals: string[]) => void
}) {
  const [open, setOpen] = useState(false)
  const [activeKey, setActiveKey] = useState<string>('')
  const [q, setQ] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    setQ('')
    if (!activeKey && defs.length) setActiveKey(defs[0].key)
    const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    window.addEventListener('mousedown', h)
    return () => window.removeEventListener('mousedown', h)
  }, [open, defs, activeKey])
  if (!defs.length) return null

  const activeCount = defs.filter((d) => values[d.key]?.length).length
  const active = defs.find((d) => d.key === activeKey) ?? defs[0]
  const selected = values[active.key] ?? []
  const shown = active.options.filter((o) => o.toLowerCase().includes(q.trim().toLowerCase()))
  const toggle = (v: string) =>
    onChange(active.key, selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v])

  return (
    <div className="relative shrink-0" ref={ref}>
      <button onClick={() => setOpen((v) => !v)} aria-label="More Filters"
        className={`relative h-8 w-9 inline-flex items-center justify-center rounded-md border transition-colors
          ${open || activeCount ? 'border-ink text-ink font-bold bg-warm-50' : 'border-warm-300 text-ink-2 bg-surface hover:bg-warm-50'}`}>
        <SlidersHorizontal size={15} />
        {activeCount > 0 && <span className="absolute -top-1.5 -right-1.5 inline-flex items-center justify-center h-4 min-w-4 px-1 rounded-full bg-brand-500 text-white text-[10px] font-bold">{activeCount}</span>}
      </button>
      {open && (
        <div className="absolute left-0 top-10 z-40 w-[420px] bg-surface border border-line rounded-xl shadow-ds-overlay overflow-hidden">
          <div className="flex h-72">
            {/* dimension list */}
            <div className="w-44 shrink-0 border-r border-line overflow-y-auto py-1.5 bg-warm-25">
              {defs.map((d) => {
                const n = values[d.key]?.length ?? 0
                const on = d.key === active.key
                return (
                  <button key={d.key} onClick={() => { setActiveKey(d.key); setQ('') }}
                    className={`w-full flex items-center justify-between gap-2 px-3.5 py-2 text-left text-[13px] transition-colors
                      ${on ? 'bg-warm-100 text-ink font-bold' : 'text-ink-2 hover:bg-warm-50'}`}>
                    <span className="truncate">{d.label}</span>
                    {n > 0 && <span className="shrink-0 inline-flex items-center justify-center h-4 min-w-4 px-1 rounded-full bg-brand-500 text-white text-[10px] font-bold">{n}</span>}
                  </button>
                )
              })}
            </div>
            {/* values with search + multiselect */}
            <div className="flex-1 min-w-0 flex flex-col">
              <div className="p-2 border-b border-line">
                <div className="relative">
                  <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-warm-400" />
                  <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${active.label.toLowerCase()}`}
                    className="h-8 w-full rounded-md border border-warm-300 bg-surface pl-7.5 pr-2 text-[12.5px] text-ink placeholder:text-warm-400
                               focus:border-brand-500 focus:ring-[3px] focus:ring-brand-500/15 outline-none" />
                </div>
              </div>
              <div className="flex-1 overflow-y-auto py-1">
                {shown.map((o) => (
                  <button key={o} onClick={() => toggle(o)}
                    className="w-full flex items-center gap-2.5 px-3.5 py-1.5 text-left text-[13px] text-ink hover:bg-warm-50">
                    <Checkbox checked={selected.includes(o)} />
                    <span className="truncate">{o}</span>
                  </button>
                ))}
                {shown.length === 0 && <div className="px-3.5 py-3 text-[12.5px] text-ink-3">No values{q ? ' match' : ''}.</div>}
              </div>
            </div>
          </div>
          <div className="flex items-center justify-between border-t border-line px-3.5 py-2.5">
            <button onClick={() => defs.forEach((d) => onChange(d.key, []))}
              className="text-[12.5px] font-bold text-ink-3 hover:text-ink transition-colors">Clear all</button>
            <span className="text-[12px] text-ink-3">{activeCount} filter{activeCount === 1 ? '' : 's'} active</span>
          </div>
        </div>
      )}
    </div>
  )
}

/* ---------------- SearchSelect — custom single-select with search ----------------
 * Replaces native <select> in filter bars: styled trigger, popover with a search
 * box, an "All …" clear entry, and check-marked options. */
export function SearchSelect({ value, label, options, onChange, className = '' }: {
  value: string
  label: string
  options: string[]
  onChange: (v: string) => void
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    setQ('')
    const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    window.addEventListener('mousedown', h)
    return () => window.removeEventListener('mousedown', h)
  }, [open])
  const shown = options.filter((o) => o.toLowerCase().includes(q.trim().toLowerCase()))
  return (
    <div className={`relative ${className}`} ref={ref}>
      <button onClick={() => setOpen((v) => !v)}
        className={`h-8 w-full inline-flex items-center justify-between gap-2 rounded-md border px-3 text-[13px] transition-colors
          ${open ? 'border-brand-500 ring-[3px] ring-brand-500/15' : 'border-warm-300 hover:border-warm-400'}
          ${value ? 'text-ink bg-warm-50 font-medium' : 'text-warm-400 bg-surface'}`}>
        <span className="truncate">{value || label}</span>
        <ChevronDown size={14} className={`shrink-0 text-warm-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute left-0 top-9 z-40 w-56 bg-surface border border-line rounded-lg shadow-ds-overlay">
          <div className="p-2 border-b border-line">
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-warm-400" />
              <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${label.toLowerCase()}`}
                className="h-7.5 w-full rounded-md border border-warm-300 bg-surface pl-7.5 pr-2 py-1.5 text-[12.5px] text-ink placeholder:text-warm-400
                           focus:border-brand-500 focus:ring-[3px] focus:ring-brand-500/15 outline-none" />
            </div>
          </div>
          <div className="py-1 max-h-56 overflow-y-auto">
            <button onClick={() => { onChange(''); setOpen(false) }}
              className={`w-full text-left px-3 py-1.5 text-[13px] hover:bg-warm-50 ${!value ? 'text-brand-600 font-bold' : 'text-ink-2'}`}>
              All {label}
            </button>
            {shown.map((o) => (
              <button key={o} onClick={() => { onChange(o); setOpen(false) }}
                className={`w-full flex items-center justify-between gap-2 text-left px-3 py-1.5 text-[13px] hover:bg-warm-50 ${value === o ? 'text-brand-600 font-bold' : 'text-ink'}`}>
                <span className="truncate">{o}</span>
                {value === o && <Check size={13} className="shrink-0" />}
              </button>
            ))}
            {shown.length === 0 && <div className="px-3 py-2 text-[12.5px] text-ink-3">No matches</div>}
          </div>
        </div>
      )}
    </div>
  )
}

/* ---------------- MultiSelect (chips-in-control dropdown, staging style) ---------------- */
export function MultiSelect({ value, options, labels, onChange, placeholder = 'Select', creatable }: {
  value: string[]
  options: string[]
  labels?: (key: string) => string
  onChange: (next: string[]) => void
  placeholder?: string
  /** allow values typed in the popover search that aren't in options */
  creatable?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [pos, setPos] = useState<{ top?: number; bottom?: number; left: number; width: number; maxHeight: number } | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  const popRef = useRef<HTMLDivElement>(null)
  const openMenu = () => {
    const r = ref.current?.getBoundingClientRect()
    if (!r) return
    const below = window.innerHeight - r.bottom
    const up = below < 200 && r.top > below
    setPos(up
      ? { bottom: window.innerHeight - r.top + 4, left: r.left, width: r.width, maxHeight: Math.min(256, r.top - 12) }
      : { top: r.bottom + 4, left: r.left, width: r.width, maxHeight: Math.min(256, below - 12) })
    setOpen(true)
  }
  useEffect(() => {
    if (!open) return
    const h = (e: MouseEvent) => {
      const t = e.target as Node
      if (!ref.current?.contains(t) && !popRef.current?.contains(t)) setOpen(false)
    }
    const scroll = (e: Event) => { if (!popRef.current?.contains(e.target as Node)) setOpen(false) }
    window.addEventListener('mousedown', h)
    window.addEventListener('scroll', scroll, true)
    window.addEventListener('resize', scroll)
    return () => {
      window.removeEventListener('mousedown', h)
      window.removeEventListener('scroll', scroll, true)
      window.removeEventListener('resize', scroll)
    }
  }, [open])
  const label = labels ?? ((k: string) => k)
  const toggle = (k: string) =>
    onChange(value.includes(k) ? value.filter((v) => v !== k) : [...value, k])
  const q = query.trim()
  const shown = q ? options.filter((o) => o.toLowerCase().includes(q.toLowerCase()) || label(o).toLowerCase().includes(q.toLowerCase())) : options
  const canCreate = creatable && q !== '' && !options.some((o) => o.toLowerCase() === q.toLowerCase()) && !value.some((v) => v.toLowerCase() === q.toLowerCase())
  const create = () => { if (canCreate) { onChange([...value, q]); setQuery('') } }
  return (
    <div className="relative" ref={ref}>
      {/* fixed-height trigger — selections never resize it; they render as
          chips BELOW the field instead */}
      <div onClick={() => (open ? setOpen(false) : openMenu())}
        className="h-10 w-full flex items-center gap-2 rounded-md border border-warm-300 bg-surface px-3 cursor-pointer
                   hover:border-warm-400 transition-colors">
        {value.length === 0
          ? <span className="text-[13px] text-warm-400">{placeholder}</span>
          : <span className="truncate text-[13px] text-ink">{value.length === 1 ? label(value[0]) : `${value.length} selected`}</span>}
        <ChevronDown size={15} className={`ml-auto shrink-0 text-warm-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </div>
      {value.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {value.map((k) => (
            <span key={k} className="inline-flex items-center gap-1.5 rounded-full bg-warm-100 border border-warm-200 px-2.5 py-1 text-[12.5px] text-ink">
              {label(k)}
              <button onClick={(e) => { e.stopPropagation(); toggle(k) }} className="text-warm-400 hover:text-ink-2"><X size={12} /></button>
            </span>
          ))}
        </div>
      )}
      {/* portaled to <body> — overflow-hidden ancestors can never clip it */}
      {open && pos && createPortal(
        <div ref={popRef}
          style={{ top: pos.top, bottom: pos.bottom, left: pos.left, width: pos.width, maxHeight: pos.maxHeight }}
          className="fe-nueva fixed z-[95] bg-surface border border-line rounded-lg shadow-ds-overlay py-1.5 overflow-auto">
          {creatable && (
            <div className="sticky top-0 z-10 border-b border-line bg-surface px-2 pb-1.5 pt-0.5">
              <input
                value={query} autoFocus placeholder="Search or type a new value…"
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); create() } }}
                className="h-8 w-full rounded-md border border-warm-300 bg-surface px-2.5 text-[13px] text-ink placeholder:text-warm-400
                           focus:border-brand-500 focus:outline-none"
              />
            </div>
          )}
          {canCreate && (
            <button onClick={create}
              className="w-full flex items-center gap-2.5 text-left px-3 py-2 text-[13px] font-bold text-brand-500 hover:bg-warm-50">
              + Create “{q}”
            </button>
          )}
          {shown.length === 0 && !canCreate && <p className="px-3 py-2 text-[12.5px] text-ink-3">No options</p>}
          {shown.map((k) => {
            const on = value.includes(k)
            return (
              <button key={k} onClick={() => toggle(k)}
                className={`w-full flex items-center gap-2.5 text-left px-3 py-2 text-[13px] hover:bg-warm-50 ${on ? 'text-brand-600 font-bold' : 'text-ink'}`}>
                <Checkbox checked={on} />{label(k)}
              </button>
            )
          })}
        </div>,
        document.body,
      )}
    </div>
  )
}

/* ---------------- Accordion ---------------- */
export function Accordion({ icon, title, subtitle, right, children, defaultOpen = false }: {
  icon?: ReactNode; title: ReactNode; subtitle?: ReactNode; right?: ReactNode
  children: ReactNode; defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="bg-surface border border-line rounded-md transition-all hover:border-warm-300 hover:shadow-ds-1">
      <div className="w-full px-5 py-4 flex items-center gap-4 cursor-pointer select-none" onClick={() => setOpen((v) => !v)}>
        {icon && <span className="h-10 w-10 shrink-0 rounded-lg bg-warm-100 text-ink-2 inline-flex items-center justify-center">{icon}</span>}
        <div className="min-w-0 flex-1">
          <div className="text-[15px] font-bold text-ink">{title}</div>
          {subtitle && <div className="text-[13px] text-ink-3 mt-0.5">{subtitle}</div>}
        </div>
        {right && <span onClick={(e) => e.stopPropagation()}>{right}</span>}
        <span className="h-8 w-8 inline-flex items-center justify-center rounded-md text-warm-400">
          <ChevronDown size={17} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
        </span>
      </div>
      {open && (
        <div className="border-t border-line px-5 py-4 animate-[accordion-in_.15s_ease-out]">
          {children}
        </div>
      )}
    </div>
  )
}

/* ---------------- Data table ---------------- */
/**
 * `width` is OPTIONAL and additive: when no column declares one the table keeps
 * its auto layout, exactly as before. As soon as one does, the table switches to
 * `table-fixed` with a `<colgroup>` — the pattern the Grow tables already use to
 * fit a fixed content width without scrolling sideways. A column that declares
 * no width in such a table is the flexible one and absorbs the remainder.
 */
export type Column = {
  key: string; label: string; sortable?: boolean; align?: 'left' | 'right'
  width?: number
  render?: (row: any) => ReactNode
}
export type SelectionAction = {
  label: string; icon?: ReactNode; onClick?: () => void; disabled?: boolean
  /** why it is disabled — the item's tooltip and a muted line under the label */
  reason?: string
}

export function DataTable({
  columns, rows, selectable, rowKey = 'id', onEdit, onRowClick, extraActions, selectionActions,
}: {
  columns: Column[]; rows: any[]; selectable?: boolean; rowKey?: string
  onEdit?: (row: any) => void; onRowClick?: (row: any) => void; extraActions?: (row: any) => ReactNode
  /** consignment-style multiselect: floating actions panel shown while rows are selected */
  selectionActions?: (selectedRows: any[], clear: () => void) => SelectionAction[]
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  /** any declared width switches the grid to a fixed layout; none = unchanged */
  const sized = columns.some((c) => c.width)
  const allChecked = rows.length > 0 && selected.size === rows.length
  const toggleAll = () => setSelected(allChecked ? new Set() : new Set(rows.map((r) => r[rowKey])))
  const toggle = (k: string) => setSelected((s) => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n })

  const clear = () => setSelected(new Set())
  return (
    <div className="relative bg-surface border border-line rounded-md">
      {/* floating selection panel — same anatomy as the Consignment Order page */}
      {selectable && selected.size > 0 && selectionActions && (
        <div className="absolute right-3 top-11 z-20 w-[248px] bg-surface border border-line rounded-xl shadow-ds-overlay overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-line">
            <span className="text-[13px] font-bold text-ink">{selected.size} Selected</span>
            <button onClick={clear} className="text-ink-3 hover:text-ink"><X size={14} /></button>
          </div>
          <div className="flex max-h-[70vh] flex-col overflow-y-auto py-1.5">
            {selectionActions(rows.filter((r) => selected.has(r[rowKey])), clear).map((a) => (
              <button
                key={a.label} onClick={a.disabled ? undefined : a.onClick} disabled={a.disabled}
                title={a.disabled ? a.reason : undefined}
                className={`flex items-center gap-2.5 px-4 py-2 text-left text-[13px]
                  ${a.disabled ? 'text-warm-400 cursor-not-allowed' : 'text-ink hover:bg-warm-50'}`}>
                <span className="text-ink-3 self-start pt-px">{a.icon}</span>
                <span className="min-w-0">
                  {a.label}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
      {selectable && selected.size > 0 && !selectionActions && (
        <div className="flex items-center gap-3 px-4 py-2 bg-warm-50 border-b border-line text-[13px] text-ink">
          <span className="font-bold">{selected.size} selected</span>
          <Button size="sm" variant="outline">Bulk Edit</Button>
          <Button size="sm" variant="ghost">Export</Button>
          <button onClick={clear} className="ml-auto text-ink-3 hover:text-ink"><X size={14} /></button>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className={`w-full text-[13px] ${sized ? 'table-fixed' : ''}`}>
          {sized && (
            <colgroup>
              {/* the 52px checkbox column the widths are budgeted around */}
              {selectable && <col style={{ width: 52 }} />}
              {columns.map((c) => (
                <col key={c.key} style={c.width ? { width: c.width } : undefined} />
              ))}
              {(onEdit || extraActions) && <col />}
            </colgroup>
          )}
          <thead>
            <tr className="border-b border-line bg-warm-25">
              {selectable && (
                <th className="w-10 px-4 py-2.5 text-left"><Checkbox checked={allChecked} onChange={toggleAll} /></th>
              )}
              {columns.map((c) => (
                <th key={c.key} className={`px-4 py-2.5 font-bold text-ink whitespace-nowrap ${sized ? 'overflow-hidden' : ''} ${c.align === 'right' ? 'text-right' : 'text-left'}`}>
                  <span className="inline-flex items-center gap-1">{c.label}{c.sortable && <ChevronDown size={12} className="text-warm-400" />}</span>
                </th>
              ))}
              {(onEdit || extraActions) && <th className="px-4 py-2.5 text-left font-bold text-ink">Action</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const k = row[rowKey]
              const isSel = selected.has(k)
              return (
                <tr key={k} onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={`border-b border-line last:border-0 transition-colors ${onRowClick ? 'cursor-pointer' : ''} ${isSel ? 'bg-warm-50 hover:bg-warm-100' : 'hover:bg-warm-50'}`}>
                  {selectable && <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}><Checkbox checked={isSel} onChange={() => toggle(k)} /></td>}
                  {columns.map((c) => (
                    <td key={c.key} className={`px-4 py-3 text-ink-2 ${sized ? 'overflow-hidden' : ''} ${c.align === 'right' ? 'text-right tabular-nums' : 'text-left'}`}>
                      {c.render ? c.render(row) : row[c.key]}
                    </td>
                  ))}
                  {(onEdit || extraActions) && (
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-1.5">
                        {onEdit && (
                          <button onClick={() => onEdit(row)} title="Edit" className="h-7 w-7 inline-flex items-center justify-center rounded-md border border-line text-ink-3 hover:bg-warm-100 hover:text-ink">
                            <Pencil size={13} />
                          </button>
                        )}
                        {extraActions?.(row)}
                      </div>
                    </td>
                  )}
                </tr>
              )
            })}
            {rows.length === 0 && (
              <tr><td colSpan={columns.length + (selectable ? 1 : 0) + ((onEdit || extraActions) ? 1 : 0)} className="px-4 py-16 text-center text-ink-3">No records found</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export function Pagination({ page = 1, total = 1, range = '1-20 of 1,446', onChange }: { page?: number; total?: number; range?: string; onChange?: (p: number) => void }) {
  const pages = Array.from({ length: Math.min(3, total) }, (_, i) => i + 1)
  return (
    <div className="flex items-center justify-between mt-3 text-[13px] text-ink-3">
      <span>{range}</span>
      <div className="flex items-center gap-1">
        <button onClick={() => onChange?.(Math.max(1, page - 1))} className="h-7 w-7 inline-flex items-center justify-center rounded-md hover:bg-warm-100"><ChevronLeft size={15} /></button>
        {pages.map((p) => (
          <button key={p} onClick={() => onChange?.(p)}
            className={`h-7 min-w-7 px-2 inline-flex items-center justify-center rounded-full text-[12px] font-bold
              ${p === page ? 'border border-warm-400 bg-warm-50 font-bold text-ink' : 'text-ink-2 hover:bg-warm-100'}`}>{p}</button>
        ))}
        {total > 3 && <><span className="px-1 text-warm-400">…</span><button onClick={() => onChange?.(total)} className="h-7 min-w-7 px-2 rounded-full text-[12px] font-bold text-ink-2 hover:bg-warm-100">{total}</button></>}
        <button onClick={() => onChange?.(Math.min(total, page + 1))} className="h-7 w-7 inline-flex items-center justify-center rounded-md hover:bg-warm-100"><ChevronRight size={15} /></button>
      </div>
    </div>
  )
}

/* ---------------- Filter bar ---------------- */
export function FilterBar({ searchPlaceholder, filters = [], onAdd, addLabel = 'Add', addMenu }: {
  searchPlaceholder?: string; filters?: string[]; onAdd?: () => void; addLabel?: string; addMenu?: { label: string; onClick?: () => void }[]
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className="flex flex-wrap items-center gap-2 mb-4">
      {searchPlaceholder !== undefined && <div className="w-48"><SearchInput placeholder={searchPlaceholder} /></div>}
      {filters.map((f) => <FilterPill key={f} label={f} />)}
      <button className="h-8 px-3 inline-flex items-center rounded-md text-[13px] text-ink-2 border border-warm-300 bg-surface hover:bg-warm-100">Reset</button>
      <div className="ml-auto flex items-center gap-2">
        <IconButton icon={<SlidersHorizontal size={15} />} title="Columns" />
        <div className="relative">
          <button onClick={() => (addMenu ? setOpen((v) => !v) : onAdd?.())}
            className="h-8 inline-flex items-center gap-1.5 rounded-md bg-brand-500 px-3.5 text-[13px] font-bold text-white hover:bg-brand-600">
            <Plus size={15} />{addLabel}{addMenu && <ChevronDown size={14} />}
          </button>
          {addMenu && open && (
            <div className="absolute right-0 top-9 z-20 w-44 bg-surface border border-line rounded-md shadow-ds-overlay py-1">
              {addMenu.map((m) => (
                <button key={m.label} onClick={() => { setOpen(false); m.onClick?.() }}
                  className="w-full text-left px-3 py-2 text-[13px] text-ink-2 hover:bg-warm-100">{m.label}</button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/* ---------------- Modal ---------------- */
export function Modal({ title, open, onClose, children, footer, wide, subtitle }: {
  title: string; open: boolean; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean
  /** Optional line under the title, inside the fixed header (the body scrolls below it). Additive. */
  subtitle?: ReactNode
}) {
  useEffect(() => {
    if (!open) return
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [open, onClose])
  if (!open) return null
  return (
    <div data-modal-open className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto bg-warm-900/40 py-10 fe-nueva">
      <div className={`relative bg-surface rounded-xl shadow-ds-overlay w-full ${wide ? 'max-w-4xl' : 'max-w-3xl'} mx-4`}>
        <div className={`flex justify-between px-6 pt-5 pb-3 ${subtitle ? 'items-start' : 'items-center'}`}>
          <div className="min-w-0">
            <h3 className="text-[18px] font-bold text-ink">{title}</h3>
            {subtitle && <p className="mt-0.5 text-[12px] text-ink-3">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="text-ink-3 hover:text-ink"><X size={18} /></button>
        </div>
        <div className="px-6 pb-2 max-h-[64vh] overflow-y-auto">{children}</div>
        {footer && <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-line">{footer}</div>}
      </div>
    </div>
  )
}

/* ---------------- Wizard steps ---------------- */
export function WizardSteps({ steps, active, done = [], onSelect }: {
  steps: string[]; active: number; done?: number[]; onSelect?: (i: number) => void
}) {
  return (
    <div className="flex items-center gap-2 bg-surface border border-line rounded-md px-4 py-3 mb-4 overflow-x-auto">
      {steps.map((s, i) => {
        const isDone = done.includes(i); const isActive = i === active
        return (
          <div key={s} className="flex items-center gap-2 shrink-0">
            <button onClick={() => onSelect?.(i)} className="flex items-center gap-2">
              <span className={`h-6 w-6 rounded-full inline-flex items-center justify-center text-[12px] font-bold
                ${isDone ? 'bg-success-bg text-success-fg' : isActive ? 'bg-brand-500 text-white' : 'bg-warm-100 text-warm-500'}`}>
                {isDone ? <Check size={13} strokeWidth={3} /> : i + 1}
              </span>
              <span className={`text-[14px] ${isActive ? 'font-bold text-brand-500' : isDone ? 'text-ink' : 'text-ink-3'}`}>{s}</span>
            </button>
            {i < steps.length - 1 && <ChevronRight size={16} className="text-warm-300 mx-1" />}
          </div>
        )
      })}
    </div>
  )
}

/* ---------------- Form field ---------------- */
export function Field({ label, required, info, children, full, plain }: { label: string; required?: boolean; info?: boolean; children: ReactNode; full?: boolean; plain?: boolean }) {
  return (
    <div className={full ? 'col-span-2' : ''}>
      <label className={plain
        ? 'flex items-center gap-1 text-[14px] text-ink mb-1.5'
        : 'flex items-center gap-1 text-[12px] font-bold uppercase tracking-wide text-ink-2 mb-1.5'}>
        {label}{required && <span className="text-brand-500">*</span>}{info && <Info size={12} className="text-warm-400" />}
      </label>
      {children}
    </div>
  )
}

/* ---------------- Status dot + text (data-row status) ---------------- */
const DOT: Record<string, string> = {
  success: 'var(--color-st-success)', danger: 'var(--color-st-danger)',
  warning: 'var(--color-st-warning)', info: 'var(--color-st-info)', neutral: 'var(--color-st-neutral)',
}
export function StatusDot({ label, tone = 'neutral' }: { label: string; tone?: keyof typeof DOT }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[14px] text-ink">
      <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: DOT[tone] }} />
      {label}
    </span>
  )
}

/* ---------------- Tabs ---------------- */
export function Tabs({ tabs, active, onChange, size = 'md', icons }: {
  tabs: string[]; active: number; onChange: (i: number) => void; size?: 'md' | 'sm'
  /** optional per-tab icon components (staging shows symbols on tabs) */
  icons?: React.ComponentType<{ size?: number | string; className?: string }>[]
}) {
  // overflow-y-hidden matters: overflow-x-auto alone computes overflow-y to auto,
  // and the 1px underline then spawns a stray vertical scrollbar inside the strip
  return (
    <div className="flex items-center gap-1 border-b border-line overflow-x-auto overflow-y-hidden">
      {tabs.map((t, i) => {
        const on = i === active
        const Icon = icons?.[i]
        return (
          <button key={t} onClick={() => onChange(i)}
            className={`relative inline-flex items-center gap-1.5 ${size === 'sm' ? 'px-3 py-2 text-[13px]' : 'px-4 py-2.5 text-[14px]'} whitespace-nowrap transition-colors
              ${on ? 'text-ink font-bold' : 'text-ink-2 hover:text-ink'}`}>
            {Icon && <Icon size={15} className={on ? 'text-brand-500' : 'text-warm-400'} />}
            {t}
            {on && <span className="absolute left-0 right-0 bottom-0 h-0.5 bg-brand-500 rounded-full" />}
          </button>
        )
      })}
    </div>
  )
}

/* ---------------- Kebab (⋮) action menu ---------------- */
export type MenuItem = {
  label: string; tone?: 'default' | 'danger'; onClick?: () => void
  /** greyed out; `reason` = its tooltip only (owner, 2026-09-25: no description lines in menus) */
  disabled?: boolean; reason?: string
}
export function KebabMenu({ items }: { items: MenuItem[] }) {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    if (!open) return
    const h = () => setOpen(false)
    window.addEventListener('click', h)
    return () => window.removeEventListener('click', h)
  }, [open])
  return (
    <div className="relative inline-block">
      <button onClick={(e) => { e.stopPropagation(); setOpen((v) => !v) }}
        className="h-7 w-7 inline-flex items-center justify-center rounded-md text-ink-3 hover:bg-warm-50">
        <MoreVertical size={16} />
      </button>
      {open && (
        <div className="absolute right-0 top-8 z-30 min-w-[176px] bg-surface border border-line rounded-lg shadow-ds-overlay py-1.5">
          {items.map((m) => (
            <button key={m.label} disabled={m.disabled} title={m.disabled ? m.reason : undefined}
              onClick={(e) => { e.stopPropagation(); if (m.disabled) return; setOpen(false); m.onClick?.() }}
              className={`w-full text-left px-4 py-2 text-[14px]
                ${m.disabled ? 'text-warm-400 cursor-not-allowed' : `hover:bg-warm-50 ${m.tone === 'danger' ? 'text-brand-500' : 'text-ink'}`}`}>
              {m.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/* ---------------- Confirm dialog (delete / enable / disable) ---------------- */
export function ConfirmDialog({ open, title, message, note, confirmLabel = 'Confirm', cancelLabel = 'Cancel', tone = 'danger', onConfirm, onClose }: {
  open: boolean; title: string; message: string; note?: string; confirmLabel?: string; cancelLabel?: string
  tone?: 'danger' | 'brand'; onConfirm: () => void; onClose: () => void
}) {
  if (!open) return null
  const accent = tone === 'danger' ? 'var(--color-st-danger)' : 'var(--color-brand-500)'
  return (
    <div data-modal-open className="fixed inset-0 z-[70] flex items-center justify-center bg-warm-900/40 fe-nueva">
      <div className="bg-surface rounded-xl shadow-ds-overlay w-full max-w-md mx-4 p-6">
        <div className="flex items-center gap-2.5">
          <AlertCircle size={20} style={{ color: accent }} />
          <h3 className="text-[16px] font-bold text-ink">{title}</h3>
        </div>
        <div className="h-px bg-line my-4" />
        <p className="text-[14px] text-ink-2">{message}</p>
        {note && <p className="text-[14px] text-ink-2 mt-4">{note}</p>}
        <div className="flex items-center justify-end gap-2 mt-7">
          <Button variant="outline" onClick={onClose}>{cancelLabel}</Button>
          <button onClick={onConfirm}
            className="h-8 px-4 rounded-md text-[13px] font-bold text-white"
            style={{ background: accent }}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  )
}

/* Plain neutral toolbar button (white, hairline border) — Export / Upload / Add */
export function ToolButton({ children, icon, onClick, primary }: { children: ReactNode; icon?: ReactNode; onClick?: () => void; primary?: boolean }) {
  return (
    <button onClick={onClick}
      className={`shrink-0 whitespace-nowrap h-8 inline-flex items-center gap-1.5 rounded-[10px] px-3.5 text-[14px] transition-colors
        ${primary ? 'bg-brand-500 text-white hover:bg-brand-600' : 'bg-surface text-ink border border-warm-100 hover:bg-warm-50'}`}>
      {icon}{children}
    </button>
  )
}

/* Page-size + refresh footer */
export function PageSize({ value = 10, onChange }: { value?: number; onChange?: (n: number) => void }) {
  return (
    <div className="relative">
      <select value={value} onChange={(e) => onChange?.(Number(e.target.value))}
        className="h-8 appearance-none rounded-[10px] border border-warm-100 bg-surface pl-3 pr-8 text-[13px] text-ink">
        {[10, 20, 50, 100].map((n) => <option key={n} value={n}>{n} / Page</option>)}
      </select>
      <ChevronDown size={14} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-warm-400" />
    </div>
  )
}

/* ---------------- Multi-select dropdown (searchable, select-all) ---------------- */
export function MultiSelectDropdown({
  options, values, onChange, placeholder = 'Select', noun = 'items',
}: {
  options: string[]; values: string[]; onChange: (v: string[]) => void
  placeholder?: string; noun?: string
}) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [open])

  // Select all / Clear act on what the search is showing, so they stay useful while filtering.
  const shown = options.filter((o) => o.toLowerCase().includes(q.trim().toLowerCase()))
  const toggle = (o: string) => onChange(values.includes(o) ? values.filter((x) => x !== o) : [...values, o])

  const label = values.length === 0
    ? placeholder
    : values.length === options.length ? `All ${options.length} ${noun}`
      : values.length <= 2 ? values.join(', ')
        : `${values.length} ${noun} selected`

  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen((o) => !o)}
        className="w-full h-9 flex items-center justify-between gap-2 rounded-md border border-warm-300 bg-surface pl-3 pr-2 text-left text-[13px]">
        <span className={`truncate ${values.length ? 'text-ink' : 'text-warm-400'}`}>{label}</span>
        <ChevronDown size={14} className="shrink-0 text-warm-400" />
      </button>
      {open && (
        <div className="absolute z-40 mt-1 left-0 w-full bg-surface border border-line rounded-lg shadow-ds-overlay">
          <div className="p-2 border-b border-line">
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-warm-400" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search masters"
                className="h-8 w-full rounded-md border border-warm-300 bg-surface pl-8 pr-2 text-[13px] text-ink placeholder:text-warm-400" />
            </div>
          </div>
          <div className="flex items-center justify-between px-3 py-1.5 border-b border-line text-[12px]">
            <span className="text-ink-3">{values.length} of {options.length} selected</span>
            <span className="shrink-0">
              <button type="button" onClick={() => onChange(Array.from(new Set([...values, ...shown])))}
                className="text-brand-500 hover:underline">Select all</button>
              <button type="button" onClick={() => onChange(values.filter((v) => !shown.includes(v)))}
                className="ml-2 text-brand-500 hover:underline">Clear</button>
            </span>
          </div>
          <div className="max-h-52 overflow-y-auto py-1">
            {shown.length === 0 ? (
              <p className="px-3 py-2 text-[13px] text-ink-3">No masters match “{q.trim()}”</p>
            ) : shown.map((o) => (
              <button type="button" key={o} onClick={() => toggle(o)}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-[13px] text-ink hover:bg-warm-50 text-left">
                <Checkbox checked={values.includes(o)} />{o}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

/* ---------------- Upload data modal (Bulk Upload / Update + per-master Upload via Excel) ---------------- */
type UploadProps = {
  open: boolean; onClose: () => void; masterName?: string; masterOptions?: string[]; mode?: 'add' | 'update'
}

/** Local date, not UTC — an evening export must not be stamped with tomorrow's date. */
function stamp(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const VIA_LABEL: Record<NonNullable<Match['via']>, string> = {
  metadata: 'matched from the workbook metadata',
  'sheet-name': 'matched by sheet name',
  columns: 'matched by columns',
}

/** One row per worksheet (or per unreadable file) in the result screen. */
type SheetOutcome = {
  sheet: string
  master?: string
  via?: NonNullable<Match['via']>
  created: number
  updated: number
  skipped: number
  errors: RowIssue[]
  /** Set when the sheet could not be matched or the file could not be read. */
  blocked?: string
}
type UploadResult = { outcomes: SheetOutcome[]; created: number; updated: number; failed: number }

const MAX_SHOWN_ISSUES = 8

function IssueList({ issues }: { issues: RowIssue[] }) {
  const shown = issues.slice(0, MAX_SHOWN_ISSUES)
  return (
    <div className="pl-9 pr-2 pt-2 pb-1 space-y-1.5">
      {shown.map((e, i) => (
        <p key={i} className="text-[13px] leading-snug">
          <span className="text-ink">Row: {e.row}</span>
          <span className="text-ink-3"> — {e.reason}</span>
        </p>
      ))}
      {issues.length > shown.length && (
        <p className="text-[13px] text-ink-3">+{issues.length - shown.length} more</p>
      )}
    </div>
  )
}

function SheetCard({ o }: { o: SheetOutcome }) {
  const failed = !!o.blocked || o.created + o.updated === 0
  const partial = !failed && o.errors.length > 0
  const pill = failed ? 'Upload Failed' : partial ? 'Partially Uploaded' : 'Uploaded'
  const pillClass = failed
    ? 'border-danger-fg/30 bg-danger-bg text-danger-fg'
    : partial
      ? 'border-warning-fg/30 bg-warning-bg text-warning-fg'
      : 'border-success-fg/30 bg-success-bg text-success-fg'

  return (
    <div>
      <div className="rounded-lg border border-line bg-surface px-4 py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          {failed
            ? <AlertTriangle size={17} className="shrink-0 text-st-danger" />
            : <CheckCircle2 size={17} className="shrink-0 text-st-success" />}
          <span className="text-[14px] text-ink truncate">{o.master ?? o.sheet}</span>
          {o.master && o.master !== o.sheet && (
            <span className="text-[12px] text-ink-3 truncate">from “{o.sheet}”</span>
          )}
        </div>
        <span className={`shrink-0 rounded-full border px-3 py-1 text-[12px] font-bold ${pillClass}`}>{pill}</span>
      </div>
      {o.blocked
        ? <p className="pl-9 pr-2 pt-2 pb-1 text-[13px] text-ink-3">{o.blocked}</p>
        : (
          <>
            {!failed && (
              <p className="pl-9 pr-2 pt-2 text-[13px] text-ink-3">
                {o.created} created · {o.updated} updated{o.skipped ? ` · ${o.skipped} unchanged` : ''}
                {o.via ? ` · ${VIA_LABEL[o.via]}` : ''}
              </p>
            )}
            {o.errors.length > 0 && <IssueList issues={o.errors} />}
          </>
        )}
    </div>
  )
}

function UploadOutcome({ result }: { result: UploadResult }) {
  const uploaded = result.outcomes.filter((o) => !o.blocked && o.created + o.updated > 0)
  const failed = result.outcomes.filter((o) => o.blocked || o.created + o.updated === 0)

  const allFailed = uploaded.length === 0
  const clean = failed.length === 0 && result.failed === 0

  const banner = allFailed
    ? { tone: 'danger', title: 'Upload Failed', body: 'All sheets failed to upload. Please check the data and try again.' }
    : clean
      ? { tone: 'success', title: 'Upload Complete', body: `${result.created} created · ${result.updated} updated.` }
      : {
        tone: 'warning', title: 'Partially Uploaded',
        body: `${uploaded.length} of ${result.outcomes.length} sheets uploaded · ${result.created} created · ${result.updated} updated. Review the failures below.`,
      }
  const bannerClass = banner.tone === 'danger'
    ? 'border-danger-fg/25 bg-danger-bg'
    : banner.tone === 'warning' ? 'border-warning-fg/25 bg-warning-bg' : 'border-success-fg/25 bg-success-bg'
  const bannerText = banner.tone === 'danger'
    ? 'text-danger-fg' : banner.tone === 'warning' ? 'text-warning-fg' : 'text-success-fg'

  return (
    <div className="mb-2">
      <div className={`rounded-lg border p-4 flex items-start gap-3 ${bannerClass}`}>
        {banner.tone === 'success'
          ? <CheckCircle2 size={19} className={`shrink-0 mt-0.5 ${bannerText}`} />
          : <AlertTriangle size={19} className={`shrink-0 mt-0.5 ${bannerText}`} />}
        <div>
          <p className={`text-[15px] font-bold ${bannerText}`}>{banner.title}</p>
          <p className="text-[13px] text-ink-2 mt-0.5">{banner.body}</p>
        </div>
      </div>

      {uploaded.length > 0 && (
        <>
          <p className="text-[12px] font-bold uppercase tracking-wide text-ink-3 mt-4 mb-2">Uploaded Sheets</p>
          <div className="space-y-3">{uploaded.map((o) => <SheetCard key={o.sheet} o={o} />)}</div>
        </>
      )}
      {failed.length > 0 && (
        <>
          <p className="text-[12px] font-bold uppercase tracking-wide text-ink-3 mt-4 mb-2">Failed Sheets</p>
          <div className="space-y-3">{failed.map((o) => <SheetCard key={o.sheet} o={o} />)}</div>
        </>
      )}

      <p className="text-[12px] text-ink-3 mt-4">
        This prototype reports the computed outcome and does not write back to the master data.
      </p>
    </div>
  )
}

export function UploadDataModal(props: UploadProps) {
  // Mounted only while open, so closing resets every field.
  if (!props.open) return null
  return <UploadDataBody {...props} />
}

function UploadDataBody({ onClose, masterName, masterOptions, mode }: UploadProps) {
  const names = masterOptions ?? []
  const [picked, setPicked] = useState<string[]>(names)
  const [files, setFiles] = useState<File[]>([])
  const [dragging, setDragging] = useState(false)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<UploadResult | null>(null)

  const title = mode === 'add' ? 'Add via Excel' : mode === 'update' ? 'Update via Excel' : 'Upload Master Data'

  // Bulk Update picks its masters from a searchable multi-select; Bulk Upload covers every master
  // with no choice to make; a per-master entry is pinned to the master whose page opened it.
  const chooses = !masterName && mode === 'update'
  const scope: Datastore[] = masterName
    ? DATASTORES.filter((d) => d.name === masterName)
    : chooses
      ? DATASTORES.filter((d) => picked.includes(d.name))
      : DATASTORES

  // Updating starts from current records; adding starts from a blank sheet.
  const dataFirst = mode === 'update'

  function doDownload(includeData: boolean) {
    if (scope.length === 0) return
    const name = scope.length === 1 ? `${scope[0].name}-${stamp()}.xls` : `master-data-${stamp()}.xls`
    download(name, 'application/vnd.ms-excel', toSpreadsheetML(scope, includeData))
  }

  function addFiles(list: FileList | null) {
    if (!list || list.length === 0) return
    const incoming = Array.from(list)
    setFiles((prev) => [...prev, ...incoming.filter((f) => !prev.some((p) => p.name === f.name && p.size === f.size))])
  }

  async function upload() {
    setBusy(true)
    const outcomes: SheetOutcome[] = []
    const blank = { created: 0, updated: 0, skipped: 0, errors: [] as RowIssue[] }
    let created = 0, updated = 0, failed = 0

    for (const file of files) {
      const head = new Uint8Array(await file.slice(0, 2).arrayBuffer())
      if (isBinaryXlsx(head, file.name)) {
        outcomes.push({ sheet: file.name, ...blank, blocked: 'Binary .xlsx cannot be read in the browser — export it as .xls or .csv and upload again.' })
        continue
      }
      const text = await file.text()
      let parsed: ParsedSheet[]
      let meta: Record<string, string> = {}
      if (file.name.toLowerCase().endsWith('.csv')) {
        const { headers, rows } = parseCsv(text)
        parsed = [{ name: file.name.replace(/\.[^.]+$/, ''), headers, rows }]
      } else {
        const workbook = parseSpreadsheetML(text)
        parsed = workbook.sheets
        meta = workbook.meta
      }
      const usable = parsed.filter((s) => s.headers.length > 0 || s.rows.length > 0)
      if (usable.length === 0) {
        outcomes.push({ sheet: file.name, ...blank, blocked: 'No worksheet with any content could be read from this file.' })
        continue
      }
      for (const sheet of usable) {
        const match = matchSheet(sheet, meta)
        const ds = match.datastoreId ? datastoreById(match.datastoreId) : undefined
        if (!ds || !match.via) {
          outcomes.push({ sheet: sheet.name, ...blank, blocked: match.reason })
          continue
        }
        const cls = classifyRows(ds, sheet.headers, sheet.rows)
        created += cls.create
        updated += cls.update
        failed += cls.errors.length
        outcomes.push({
          sheet: sheet.name, master: ds.name, via: match.via,
          created: cls.create, updated: cls.update, skipped: cls.skip, errors: cls.errors,
        })
      }
    }

    setFiles([])
    setResult({ outcomes, created, updated, failed })
    setBusy(false)
  }

  return (
    <Modal title={title} open onClose={onClose}
      footer={result ? (
        <>
          <Button variant="outline" onClick={() => setResult(null)}>Upload Again</Button>
          <Button onClick={onClose}>Done</Button>
        </>
      ) : (
        <>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={upload} disabled={busy || files.length === 0}>{busy ? 'Uploading…' : 'Upload'}</Button>
        </>
      )}>
      <p className="text-[13px] text-ink-2 mb-4">
        {dataFirst
          ? 'Use this to update existing records. Each row is matched by its code.'
          : 'Use this to add new records. Each row is matched by its code.'}
      </p>
      {chooses && (
        <div className="mb-4 max-w-md">
          <Field label="Masters" required>
            <MultiSelectDropdown options={names} values={picked} onChange={setPicked}
              placeholder="Select masters" noun="masters" />
          </Field>
          <p className="text-[12px] text-ink-3 mt-1.5">
            Scopes the download. Uploaded files are matched to their master automatically.
          </p>
        </div>
      )}
      <div className="border border-line rounded-lg px-4 py-3 mb-4">
        <div className="flex items-center justify-between gap-4">
          <p className="text-[14px] font-bold text-ink">Download</p>
          <div className="shrink-0 flex items-center gap-2">
            <button onClick={() => doDownload(dataFirst)} disabled={scope.length === 0}
              className="inline-flex items-center gap-2 rounded-md border border-warm-200 bg-surface px-3 h-9 text-[13px] font-bold text-ink hover:bg-warm-50 disabled:opacity-50 disabled:cursor-not-allowed">
              <FileSpreadsheet size={15} className="text-st-success" />
              {dataFirst ? 'With existing data' : 'XLS'}
            </button>
            {(dataFirst || masterName) && (
              <button onClick={() => doDownload(!dataFirst)} disabled={scope.length === 0}
                className="inline-flex items-center gap-2 rounded-md border border-warm-200 bg-surface px-3 h-9 text-[13px] text-ink-2 hover:bg-warm-50 disabled:opacity-50 disabled:cursor-not-allowed">
                <Download size={14} />
                {dataFirst ? 'Blank template' : 'With existing data'}
              </button>
            )}
          </div>
        </div>
        {masterName && (
          <p className="text-[12px] text-ink-3 mt-2">Master: <span className="font-bold text-ink">{masterName}</span></p>
        )}
        {dataFirst && !masterName && scope.length === 0 && (
          <p className="text-[12px] text-st-danger mt-2">Select at least one master to download.</p>
        )}
      </div>
      {result ? (
        <UploadOutcome result={result} />
      ) : (
        <>
          <label
            onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => { e.preventDefault(); setDragging(false); addFiles(e.dataTransfer.files) }}
            className={`block border-2 border-dashed rounded-lg py-10 text-center cursor-pointer transition-colors
              ${dragging ? 'border-brand-500 bg-brand-50' : 'border-warm-200 hover:border-brand-300 hover:bg-warm-25'}`}>
            <input type="file" multiple accept=".xls,.xlsx,.csv" className="hidden"
              onChange={(e) => { addFiles(e.target.files); e.target.value = '' }} />
            <span className="mx-auto mb-3 h-12 w-12 rounded-full bg-brand-50 text-brand-500 flex items-center justify-center"><Upload size={20} /></span>
            <p className="text-[14px] text-ink">Drag and drop .XLS, .XLSX or .CSV files here</p>
            <p className="text-[13px] text-brand-500">or click to add</p>
          </label>
          {files.length > 0 && (
            <div className="mt-3 space-y-1.5 mb-2">
              {files.map((f) => (
                <div key={`${f.name}:${f.size}`} className="flex items-center gap-3 rounded-md border border-line bg-warm-25 px-3 py-2 text-[13px]">
                  <span className="min-w-0 flex-1 truncate text-ink">{f.name}</span>
                  <span className="shrink-0 text-ink-3">{fileSize(f.size)}</span>
                  <button onClick={() => setFiles((prev) => prev.filter((p) => p !== f))} className="shrink-0 text-ink-3 hover:text-ink"><X size={14} /></button>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </Modal>
  )
}

/* ---------------- More Filters — square filter-icon button + popover ---------------- */
type FDef = { label: string; key: string; options: string[] }
export function MoreFilters({ defs, values, onChange }: {
  defs: FDef[]; values: Record<string, string>; onChange: (k: string, v: string) => void
}) {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    if (!open) return
    const h = (e: MouseEvent) => { if (!(e.target as HTMLElement).closest('[data-morefilters]')) setOpen(false) }
    window.addEventListener('click', h)
    return () => window.removeEventListener('click', h)
  }, [open])
  if (!defs.length) return null
  const activeCount = defs.filter((d) => values[d.key]).length
  return (
    <div className="relative shrink-0" data-morefilters>
      <button onClick={() => setOpen((v) => !v)} aria-label="More Filters"
        className={`peer relative h-9 w-9 inline-flex items-center justify-center rounded-lg border transition-colors
          ${open || activeCount ? 'border-brand-500 text-brand-500 bg-brand-50' : 'border-warm-300 text-ink-2 bg-surface hover:bg-warm-50'}`}>
        <SlidersHorizontal size={16} />
        {activeCount > 0 && <span className="absolute -top-1.5 -right-1.5 inline-flex items-center justify-center h-4 min-w-4 px-1 rounded-full bg-brand-500 text-white text-[10px] font-bold">{activeCount}</span>}
      </button>
      {!open && (
        <span className="pointer-events-none absolute left-1/2 -translate-x-1/2 top-11 z-40 hidden peer-hover:block whitespace-nowrap rounded-md bg-warm-900 text-white text-[12px] px-2 py-1 shadow-ds-overlay">More Filters</span>
      )}
      {open && (
        <div className="absolute left-0 top-11 z-30 w-72 bg-surface border border-line rounded-lg shadow-ds-overlay p-3">
          <p className="text-[12px] font-bold text-ink-2 mb-2">More Filters</p>
          <div className="space-y-2.5 max-h-72 overflow-y-auto">
            {defs.map((d) => (
              <div key={d.key}>
                <label className="block text-[12px] text-ink-2 mb-1">{d.label}</label>
                <SearchSelect value={values[d.key] ?? ''} label={d.label} options={d.options}
                  onChange={(v) => onChange(d.key, v)} />
              </div>
            ))}
          </div>
          <div className="flex items-center justify-end pt-3 mt-3 border-t border-line">
            <Button size="sm" onClick={() => setOpen(false)}>Apply</Button>
          </div>
        </div>
      )}
    </div>
  )
}

/* Clear Filters — orange outline text button (Image #4) */
export function ClearFilters({ onClick, active }: { onClick: () => void; active?: boolean }) {
  return (
    <button onClick={onClick}
      className={`shrink-0 h-8 inline-flex items-center rounded-md px-2.5 text-[14px] font-bold transition-colors
        ${active ? 'text-brand-500 hover:bg-brand-50' : 'text-warm-400 cursor-default'}`}>
      Clear Filters
    </button>
  )
}

/* Small hover tooltip wrapper */
export function Tooltip({ text, children, side = 'top' }: { text: string; children: ReactNode; side?: 'top' | 'bottom' }) {
  return (
    <span className="relative inline-flex group/tt">
      {children}
      <span className={`pointer-events-none absolute left-1/2 -translate-x-1/2 z-40 hidden group-hover/tt:block whitespace-nowrap rounded-md bg-warm-900 text-white text-[12px] px-2 py-1 shadow-ds-overlay
        ${side === 'top' ? 'bottom-full mb-1.5' : 'top-full mt-1.5'}`}>{text}</span>
    </span>
  )
}

/* Add | Upload — primary orange-filled segmented button. Upload opens an Add/Update menu. */
export function AddUpload({ label = 'Add', icon, onAdd, onUpload }: {
  label?: string; icon?: ReactNode; onAdd: () => void; onUpload: (mode: 'add' | 'update') => void
}) {
  const [menu, setMenu] = useState(false)
  useEffect(() => {
    if (!menu) return
    const h = (e: MouseEvent) => { if (!(e.target as HTMLElement).closest('[data-addupload]')) setMenu(false) }
    window.addEventListener('click', h)
    return () => window.removeEventListener('click', h)
  }, [menu])
  return (
    <div className="shrink-0 relative inline-flex items-stretch rounded-lg bg-brand-500" data-addupload>
      <button onClick={onAdd} className="inline-flex items-center gap-1.5 px-3.5 h-8 rounded-l-lg text-[14px] font-bold text-white hover:bg-brand-600 transition-colors">
        {icon ?? <Plus size={16} />}{label}
      </button>
      <span className="w-px bg-white/30 self-stretch" />
      <button onClick={(e) => { e.stopPropagation(); setMenu((v) => !v) }} aria-label="Upload via Excel"
        className="peer inline-flex items-center justify-center w-9 h-8 rounded-r-lg text-white hover:bg-brand-600 transition-colors">
        <Upload size={16} />
      </button>
      {!menu && (
        <span className="pointer-events-none absolute right-0 top-full mt-2 z-40 hidden peer-hover:block whitespace-nowrap rounded-md bg-warm-900 text-white text-[12px] px-2.5 py-1.5 shadow-ds-overlay">
          Upload via Excel — for bulk addition and updation
        </span>
      )}
      {menu && (
        <div className="absolute right-0 top-full mt-2 z-40 w-44 bg-surface border border-line rounded-lg shadow-ds-overlay py-1.5">
          <button onClick={() => { setMenu(false); onUpload('add') }} className="w-full text-left px-3 py-2 text-[13px] text-ink hover:bg-warm-50">Add Via Excel</button>
          <button onClick={() => { setMenu(false); onUpload('update') }} className="w-full text-left px-3 py-2 text-[13px] text-ink hover:bg-warm-50">Update Via Excel</button>
        </div>
      )}
    </div>
  )
}

/** A stat tile for dashboards: 12px label, 17px bold value, optional hint line and icon.
 *  Shared by the Grow Dashboard / Billing pages (2026-09-25); tones come from the status pairs. */
export function KpiTile({ label, value, hint, icon, tone = 'neutral', onClick }: {
  label: string; value: ReactNode; hint?: ReactNode; icon?: ReactNode
  tone?: 'neutral' | 'success' | 'info' | 'warning' | 'danger'
  onClick?: () => void
}) {
  const iconTone = { neutral: 'bg-warm-100 text-ink-2', success: 'bg-success-bg text-success-fg', info: 'bg-info-bg text-info-fg', warning: 'bg-warning-bg text-warning-fg', danger: 'bg-danger-bg text-danger-fg' }[tone]
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag type={onClick ? 'button' : undefined} onClick={onClick}
      className={`flex items-center gap-3 rounded-md border border-line bg-surface px-5 py-4 text-left ${onClick ? 'transition-colors hover:border-warm-300 hover:shadow-ds-1' : ''}`}>
      {icon && <span className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md ${iconTone}`}>{icon}</span>}
      <span className="min-w-0">
        <span className="block text-[12px] text-ink-3">{label}</span>
        <span className="block truncate text-[17px] font-bold leading-tight text-ink">{value}</span>
        {hint && <span className="block truncate text-[12px] text-ink-3">{hint}</span>}
      </span>
    </Tag>
  )
}

export function EmptyState({ title, hint, icon }: { title: string; hint?: string; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="text-warm-300 mb-4">{icon}</div>
      <p className="text-[16px] font-bold text-ink">{title}</p>
      {hint && <p className="text-[13px] text-ink-3 mt-1 max-w-sm">{hint}</p>}
    </div>
  )
}

/* ---------------- Date input — design-system calendar popover ----------------
 * Replaces native <input type="date"> so date fields share the same trigger,
 * popover and typography as every other control. Value is ISO YYYY-MM-DD. */
const DI_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December']
const diPad = (n: number) => String(n).padStart(2, '0')
const diIso = (d: Date) => `${d.getFullYear()}-${diPad(d.getMonth() + 1)}-${diPad(d.getDate())}`

export function DateInput({ value, onChange, placeholder = 'Select date', min, max, isDisabled, dayTitle, clearable = true }: {
  value?: string
  onChange?: (v: string) => void
  placeholder?: string
  /** Earliest pickable day, ISO YYYY-MM-DD (inclusive). Optional — additive. */
  min?: string
  /** Latest pickable day, ISO YYYY-MM-DD (inclusive). Optional — additive. */
  max?: string
  /** Extra per-day rule: true greys the day out. Optional — additive. */
  isDisabled?: (ymd: string) => boolean
  /** Per-day tooltip (e.g. 'Holiday · Christmas Day'); a titled greyed day stays hoverable. Optional — additive. */
  dayTitle?: (ymd: string) => string | undefined
  /** false hides the footer Clear (a field that must always hold a date). */
  clearable?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top?: number; bottom?: number; left: number } | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  const popRef = useRef<HTMLDivElement>(null)

  const parsed = value ? new Date(`${value}T00:00:00`) : null
  const valid = parsed && !isNaN(parsed.getTime()) ? parsed : null
  const [view, setView] = useState<Date>(valid ?? new Date())

  const openMenu = () => {
    const r = ref.current?.getBoundingClientRect()
    if (!r) return
    const POP_H = 332
    const up = window.innerHeight - r.bottom < POP_H && r.top > POP_H
    setPos(up
      ? { bottom: window.innerHeight - r.top + 4, left: r.left }
      : { top: r.bottom + 4, left: r.left })
    setView(valid ?? (min ? new Date(`${min}T00:00:00`) : new Date()))
    setOpen(true)
  }
  useEffect(() => {
    if (!open) return
    const h = (e: MouseEvent) => {
      const t = e.target as Node
      if (!ref.current?.contains(t) && !popRef.current?.contains(t)) setOpen(false)
    }
    const scroll = (e: Event) => { if (!popRef.current?.contains(e.target as Node)) setOpen(false) }
    window.addEventListener('mousedown', h)
    window.addEventListener('scroll', scroll, true)
    window.addEventListener('resize', scroll)
    return () => {
      window.removeEventListener('mousedown', h)
      window.removeEventListener('scroll', scroll, true)
      window.removeEventListener('resize', scroll)
    }
  }, [open])

  const y = view.getFullYear(), m = view.getMonth()
  const startOffset = (new Date(y, m, 1).getDay() + 6) % 7 // Monday-first grid
  const daysInMonth = new Date(y, m + 1, 0).getDate()
  const cells: (Date | null)[] = [
    ...Array.from({ length: startOffset }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => new Date(y, m, i + 1)),
  ]
  const todayIso = diIso(new Date())
  const display = valid
    ? valid.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    : ''
  const off = (iso: string) => (!!min && iso < min) || (!!max && iso > max) || !!isDisabled?.(iso)
  const pick = (d: Date) => { if (off(diIso(d))) return; onChange?.(diIso(d)); setOpen(false) }

  return (
    <div className="relative" ref={ref}>
      <div onClick={() => (open ? setOpen(false) : openMenu())}
        className="h-8 w-full flex items-center gap-2 rounded-md border border-warm-300 bg-surface px-3 cursor-pointer
                   hover:border-warm-400 transition-colors">
        {display
          ? <span className="truncate text-[13px] text-ink">{display}</span>
          : <span className="text-[13px] text-warm-400">{placeholder}</span>}
        <CalendarDays size={14} className="ml-auto shrink-0 text-warm-400" />
      </div>
      {open && pos && createPortal(
        <div ref={popRef}
          style={{ top: pos.top, bottom: pos.bottom, left: pos.left, width: 272 }}
          className="fe-nueva fixed z-[95] rounded-lg border border-line bg-surface p-3 shadow-ds-overlay">
          <div className="mb-2 flex items-center justify-between">
            <button type="button" onClick={() => setView(new Date(y, m - 1, 1))}
              className="rounded-md p-1.5 text-ink-3 hover:bg-warm-50 hover:text-ink">
              <ChevronLeft size={15} />
            </button>
            <span className="text-[13px] font-bold text-ink">{DI_MONTHS[m]} {y}</span>
            <button type="button" onClick={() => setView(new Date(y, m + 1, 1))}
              className="rounded-md p-1.5 text-ink-3 hover:bg-warm-50 hover:text-ink">
              <ChevronRight size={15} />
            </button>
          </div>
          <div className="mb-1 grid grid-cols-7 text-center">
            {['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map((d) => (
              <span key={d} className="py-1 text-[11px] font-bold text-ink-3">{d}</span>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {cells.map((d, i) => {
              if (!d) return <span key={`x${i}`} />
              const dIso = diIso(d)
              const selected = value === dIso
              const isToday = dIso === todayIso
              const dOff = off(dIso)
              const dTitle = dayTitle?.(dIso)
              return (
                <button key={dIso} type="button" onClick={() => { if (!dOff) pick(d) }} disabled={dOff && !dTitle} aria-disabled={dOff} title={dTitle}
                  className={`mx-auto flex h-8 w-8 items-center justify-center rounded-md text-[12.5px] transition-colors
                    ${dOff ? `cursor-not-allowed text-warm-300 ${isToday ? 'font-bold' : ''}`
                      : selected ? 'bg-brand-500 font-bold text-white'
                      : isToday ? 'font-bold text-brand-500 hover:bg-warm-50'
                      : 'text-ink hover:bg-warm-50'}`}>
                  {d.getDate()}
                </button>
              )
            })}
          </div>
          <div className="mt-2 flex items-center justify-between border-t border-line pt-2">
            <button type="button" onClick={() => pick(new Date())} disabled={off(todayIso)}
              className="text-[12.5px] font-bold text-brand-500 hover:text-brand-600 disabled:cursor-not-allowed disabled:text-warm-300">Today</button>
            {clearable && (
              <button type="button" onClick={() => { onChange?.(''); setOpen(false) }}
                className="text-[12.5px] text-ink-3 hover:text-ink">Clear</button>
            )}
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
}

/* ---------------------------------------------------------------------------
 * SequenceList — checkbox + sequence rows (Table Configuration / On Page
 * Filters pattern of the Base Modules pages). Shared by the console replica
 * (nueva/ModuleDetail) and the LOCAL app's Consignment Order settings.
 * Ticking renumbers the selected rows 1..n in list order.
 * ------------------------------------------------------------------------- */
export interface SeqItem { key: string; selected: boolean; sequence: number }

export function SequenceList({ items, onChange, labelOf = (k) => k, reorderable = false }: {
  items: SeqItem[]
  onChange: (items: SeqItem[]) => void
  labelOf?: (key: string) => string
  /** show ▲▼ on selected rows to move them within the selected block (sequence follows) */
  reorderable?: boolean
}) {
  const selCount = items.filter((i) => i.selected).length
  const allSelected = selCount === items.length
  const toggleAll = () => {
    let seq = 0
    onChange(items.map((i) => ({ ...i, selected: !allSelected, sequence: !allSelected ? ++seq : 0 })))
  }
  const toggleOne = (key: string) => {
    const next = items.map((i) => (i.key === key ? { ...i, selected: !i.selected } : i))
    let seq = 0
    onChange(next.map((i) => ({ ...i, sequence: i.selected ? ++seq : 0 })))
  }
  /* selected rows in sequence order; swapping two renumbers the block */
  const ordered = [...items].sort((a, b) => (a.selected === b.selected ? a.sequence - b.sequence : a.selected ? -1 : 1))
  const move = (key: string, dir: -1 | 1) => {
    const sel = ordered.filter((i) => i.selected)
    const at = sel.findIndex((i) => i.key === key)
    const to = at + dir
    if (at < 0 || to < 0 || to >= sel.length) return
    ;[sel[at], sel[to]] = [sel[to], sel[at]]
    const seqOf = new Map(sel.map((i, n) => [i.key, n + 1]))
    onChange(ordered.map((i) => ({ ...i, sequence: seqOf.get(i.key) ?? 0 }))
      .sort((a, b) => (a.selected === b.selected ? a.sequence - b.sequence : a.selected ? -1 : 1)))
  }
  const rows = reorderable ? ordered : items
  return (
    <div>
      <div className="flex items-center justify-between px-1 pb-2.5">
        <div className="flex items-center gap-3 text-[13px]">
          <button onClick={toggleAll} className="font-bold text-brand-500 hover:text-brand-600">
            {allSelected ? 'Clear All' : 'Select All'}
          </button>
          <span className="text-ink-3 border-l border-line pl-3">{selCount}/{items.length} Selected</span>
        </div>
        <span className="text-[13px] font-bold text-ink pr-4">Sequence</span>
      </div>
      <div className="space-y-2">
        {rows.map((it) => (
          <div key={it.key}
            className={`flex items-center gap-3 rounded-md border px-3.5 py-2.5 transition-colors
              ${it.selected ? 'bg-warm-50 border-warm-300' : 'bg-surface border-line'}`}>
            <Checkbox checked={it.selected} onChange={() => toggleOne(it.key)} />
            <span className="text-[13px] text-ink flex-1">{labelOf(it.key)}</span>
            {reorderable && it.selected && (
              <span className="inline-flex items-center gap-0.5">
                <button type="button" title="Move up" aria-label={`Move ${labelOf(it.key)} up`} onClick={() => move(it.key, -1)}
                  disabled={it.sequence <= 1}
                  className="h-7 w-7 inline-flex items-center justify-center rounded-md text-ink-3 hover:bg-warm-100 hover:text-ink disabled:opacity-30 disabled:hover:bg-transparent">
                  <ChevronUp size={14} />
                </button>
                <button type="button" title="Move down" aria-label={`Move ${labelOf(it.key)} down`} onClick={() => move(it.key, 1)}
                  disabled={it.sequence >= selCount}
                  className="h-7 w-7 inline-flex items-center justify-center rounded-md text-ink-3 hover:bg-warm-100 hover:text-ink disabled:opacity-30 disabled:hover:bg-transparent">
                  <ChevronDown size={14} />
                </button>
              </span>
            )}
            <span className={`w-14 h-7 inline-flex items-center justify-center rounded-md border text-[12.5px]
              ${it.selected ? 'bg-warm-100 border-warm-200 text-ink-2' : 'bg-warm-50 border-line text-warm-400'}`}>
              {it.selected ? it.sequence : '—'}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ---------------- Slide-over (the record drawer) ---------------- */
/**
 * The drawer a record opens in over its list (owner, 2026-09-25) — the
 * Consignment view's shell, shared with the Pickup request view on both
 * portals: scrim (click closes), a 62%-wide panel on `side`, a 56px header
 * (Back · title · subtitle · host actions right), then the host's body, which
 * owns its own scroll. Esc closes it unless a Modal is open above it.
 */
export function SlideOver({ title, subtitle, onClose, actions, side = 'right', wide = false, label, children }: {
  title: ReactNode; subtitle?: ReactNode; onClose: () => void; actions?: ReactNode
  /** which edge it slides from — one line to flip */
  side?: 'right' | 'left'
  /** 92% wide (the consignment view with its event log docked) */
  wide?: boolean
  label?: string
  children: ReactNode
}) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || document.querySelector('[data-modal-open]')) return
      onClose()
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])
  return (
    <>
      <div className="fixed inset-0 z-[60] bg-warm-900/40" onClick={onClose} />
      <aside role="dialog" aria-label={label ?? (typeof title === 'string' ? title : 'Details')}
        className={`fixed inset-y-0 ${side === 'left' ? 'left-0' : 'right-0'} z-[61] flex flex-col bg-canvas shadow-ds-overlay transition-[width] duration-200 ${wide ? 'w-[92%]' : 'w-[62%] min-w-[760px]'}`}>
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-line bg-surface px-4">
          <button type="button" onClick={onClose} aria-label="Back" className="rounded p-1 text-ink-2 hover:bg-warm-100 hover:text-ink"><ArrowLeft size={18} /></button>
          <span className="text-[18px] font-bold text-ink">{title}</span>
          {subtitle && <span className="min-w-0 truncate text-[13px] text-ink-3">{subtitle}</span>}
          {actions && <span className="ml-auto flex items-center gap-2">{actions}</span>}
        </header>
        {children}
      </aside>
    </>
  )
}

/** One entry of a slide-over's section rail. `collapsed` = icon only. */
export function SlideOverRailItem({ label, icon: Icon, on, collapsed = false, onClick }: {
  label: string; icon: ComponentType<{ size?: number; className?: string }>; on: boolean; collapsed?: boolean; onClick: () => void
}) {
  return (
    <button type="button" onClick={onClick} title={label} aria-current={on ? 'page' : undefined}
      className={`flex w-full items-center gap-2.5 border-l-[3px] px-4 py-2.5 text-left text-[13px] transition-colors ${
        on ? 'border-brand-500 bg-warm-50 font-bold text-ink' : 'border-transparent text-ink-2 hover:bg-warm-50 hover:text-ink'}`}>
      <Icon size={16} className={on ? 'text-brand-500' : 'text-ink-3'} />
      {!collapsed && <span className="truncate">{label}</span>}
    </button>
  )
}

export type SlideOverSection = { id: string; label: string; icon: ComponentType<{ size?: number; className?: string }>; node: ReactNode }

/**
 * A slide-over body: the section rail on the left, every section stacked on
 * one scroll on the right; the rail scrolls to a section and follows the one
 * at the top (scroll-spy). Fills the SlideOver below its header.
 */
export function SlideOverSections({ sections, label = 'Sections' }: { sections: SlideOverSection[]; label?: string }) {
  const [on, setOn] = useState<string | null>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const refs = useRef<Record<string, HTMLDivElement | null>>({})
  const goTo = (id: string) => { setOn(id); refs.current[id]?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }
  return (
    <div className="flex min-h-0 flex-1">
      <nav aria-label={label} className="w-[196px] shrink-0 overflow-y-auto border-r border-line bg-surface py-2">
        {sections.map((x) => <SlideOverRailItem key={x.id} label={x.label} icon={x.icon} on={(on ?? sections[0]?.id) === x.id} onClick={() => goTo(x.id)} />)}
      </nav>
      <div ref={scroller} className="min-h-0 min-w-0 flex-1 overflow-auto p-4" onScroll={(e) => {
        const top = e.currentTarget.getBoundingClientRect().top + 48
        const cur = sections.filter((x) => (refs.current[x.id]?.getBoundingClientRect().top ?? 1e9) <= top).pop()
        if (cur && cur.id !== on) setOn(cur.id)
      }}>
        <div className="flex flex-col gap-3">
          {sections.map((x) => <div key={x.id} ref={(el) => { refs.current[x.id] = el }} className="scroll-mt-4">{x.node}</div>)}
        </div>
      </div>
    </div>
  )
}
