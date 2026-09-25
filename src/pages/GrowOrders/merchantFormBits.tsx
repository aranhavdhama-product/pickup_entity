/**
 * Presentation pieces of the Grow merchant order form (MerchantOrderForm) — the
 * merchant dialect: white section cards (15px bold title, 12px caption, px-5),
 * label-above fields in aligned grids, neutral selection (border-ink +
 * bg-warm-50 + bold ink; brand orange only for focus, radios and the primary
 * action), errors in danger-fg shown only after a Continue attempt.
 *
 * Built on the Nueva primitives (Input, MenuSelect, DateInput, Toggle). No data,
 * no fetch, no src/auth.
 */
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Check, Minus, Plus } from 'lucide-react'
import { Toggle } from '../../nueva/components'

/* ------------------------------------------------------------------ card ---- */

export function MSection({ id, title, caption, action, done, children }: {
  id: string; title: ReactNode; caption?: ReactNode; action?: ReactNode; done?: boolean; children?: ReactNode
}) {
  return (
    <section id={id} className="scroll-mt-24 rounded-xl border border-line bg-surface shadow-ds-1">
      <div className="flex items-start justify-between gap-4 px-5 pt-4">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-[15px] font-bold text-ink">
            {title}
            {done && <Check size={15} strokeWidth={3} className="text-success-fg" aria-label="complete" />}
          </h2>
          {caption && <p className="mt-0.5 text-[12px] text-ink-3">{caption}</p>}
        </div>
        {action}
      </div>
      {children && <div className="px-5 pb-5 pt-4">{children}</div>}
    </section>
  )
}

/** 1 → 2 → 4 columns; `cols={3}` for a three-up row. */
export function MGrid({ children, cols = 4 }: { children: ReactNode; cols?: 2 | 3 | 4 }) {
  const c = cols === 2 ? 'sm:grid-cols-2' : cols === 3 ? 'sm:grid-cols-2 lg:grid-cols-3' : 'sm:grid-cols-2 xl:grid-cols-4'
  return <div className={`grid grid-cols-1 gap-x-4 gap-y-4 ${c}`}>{children}</div>
}

/** One labelled field: 12px bold label (+ red `*`), the control, then a hint or — after a submit attempt — the error. */
export function MField({ label, required, error, hint, className = '', children }: {
  label: string; required?: boolean; error?: string | false | null; hint?: ReactNode; className?: string; children: ReactNode
}) {
  return (
    <div className={`min-w-0 ${className}`}>
      <label className="mb-1.5 flex h-4 items-center gap-0.5 truncate text-[12px] font-bold text-ink-2" title={label}>
        {label}{required && <span className="text-danger-fg">*</span>}
      </label>
      {children}
      {error ? <p className="mt-1 text-[12px] text-danger-fg">{error}</p>
        : hint ? <p className="mt-1 text-[12px] text-ink-3">{hint}</p> : null}
    </div>
  )
}

/** A number input with a trailing unit; typed text is held locally so "0." stays typeable. */
export function NumInput({ value, onChange, unit, integer, min = 0, blankZero, placeholder, invalid, disabled, ghost }: {
  value: number; onChange: (n: number) => void; unit?: string; integer?: boolean; min?: number
  blankZero?: boolean; placeholder?: string; invalid?: boolean; disabled?: boolean
  /** borderless until hover / focus — a table cell */
  ghost?: boolean
}) {
  const [typed, setTyped] = useState<{ text: string; of: number } | null>(null)
  const text = typed && typed.of === value ? typed.text : (blankZero && value === 0 ? '' : String(value))
  const commit = (v: string) => {
    const n = v.trim() === '' ? 0 : Number(v)
    const next = Number.isFinite(n) ? Math.max(min, integer ? Math.round(n) : n) : value
    setTyped({ text: v, of: next })
    if (next !== value) onChange(next)
  }
  return (
    <div className={`flex h-8 items-center rounded-md border bg-surface transition-shadow focus-within:border-brand-500
                     focus-within:ring-[3px] focus-within:ring-brand-500/20 ${invalid ? 'border-danger-fg' : ghost ? 'border-transparent bg-transparent hover:border-warm-300' : 'border-warm-300'}
                     ${disabled ? 'pointer-events-none bg-warm-50 opacity-70' : ''}`}>
      <input type="number" value={text} placeholder={placeholder} disabled={disabled} onChange={(e) => commit(e.target.value)}
        className="h-full w-full min-w-0 flex-1 rounded-md bg-transparent px-3 text-[13px] tabular-nums text-ink placeholder:text-warm-400
                   focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none" />
      {unit && <span className="shrink-0 pr-3 text-[12px] text-ink-3">{unit}</span>}
    </div>
  )
}

export const TEXTAREA = `w-full rounded-md border border-warm-300 bg-surface px-3 py-2 text-[13px] text-ink
  placeholder:text-warm-400 transition-shadow focus:border-brand-500 focus:outline-none focus:ring-[3px] focus:ring-brand-500/20`

/* --------------------------------------------------------------- choices ---- */

/** A neutral segmented control — the selected segment is bold ink on warm-50 with an ink border. */
export function Segment<T extends string>({ options, value, onChange, disabled }: {
  options: { value: T; label: string; sub?: string; icon?: ReactNode }[]; value: T; onChange: (v: T) => void; disabled?: boolean
}) {
  return (
    <div role="radiogroup" className={`grid gap-2 ${options.length === 2 ? 'grid-cols-2' : 'grid-cols-3'} ${disabled ? 'pointer-events-none opacity-60' : ''}`}>
      {options.map((o) => {
        const on = o.value === value
        return (
          <button key={o.value} type="button" role="radio" aria-checked={on} onClick={() => onChange(o.value)}
            className={`flex items-center gap-3 rounded-md border px-3.5 py-2.5 text-left transition-colors
              ${on ? 'border-ink bg-warm-50' : 'border-line bg-surface hover:border-warm-400'}`}>
            {o.icon && <span className={on ? 'text-ink' : 'text-ink-3'}>{o.icon}</span>}
            <span className="min-w-0">
              <span className={`block text-[13px] ${on ? 'font-bold text-ink' : 'text-ink-2'}`}>{o.label}</span>
              {o.sub && <span className="block text-[12px] text-ink-3">{o.sub}</span>}
            </span>
            {on && <Check size={15} strokeWidth={3} className="ml-auto shrink-0 text-ink" />}
          </button>
        )
      })}
    </div>
  )
}

/** A radio-style choice card (RTO, …): the radio dot is the accent, the card stays neutral. */
export function ChoiceCard({ label, sub, checked, onClick }: { label: string; sub?: string; checked: boolean; onClick: () => void }) {
  return (
    <button type="button" role="radio" aria-checked={checked} onClick={onClick}
      className={`flex items-start gap-3 rounded-md border px-3.5 py-3 text-left transition-colors
        ${checked ? 'border-ink bg-warm-50' : 'border-line bg-surface hover:border-warm-400'}`}>
      <span className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${checked ? 'border-brand-500' : 'border-warm-400'}`}>
        {checked && <span className="h-2 w-2 rounded-full bg-brand-500" />}
      </span>
      <span className="min-w-0">
        <span className={`block text-[13px] ${checked ? 'font-bold text-ink' : 'text-ink-2'}`}>{label}</span>
        {sub && <span className="block text-[12px] text-ink-3">{sub}</span>}
      </span>
    </button>
  )
}

/** A handling switch with its plain-language hint underneath. */
export function SwitchRow({ label, hint, checked, onChange }: { label: string; hint: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-md border border-line px-3.5 py-3">
      <div className="min-w-0">
        <p className="text-[13px] font-bold text-ink">{label}</p>
        <p className="mt-0.5 text-[12px] text-ink-3">{hint}</p>
      </div>
      <span className="shrink-0 pt-0.5"><Toggle checked={checked} onChange={onChange} /></span>
    </div>
  )
}

/** − n + — a small count stepper. */
export function CountStepper({ value, onChange, min = 0, max = 20, label }: {
  value: number; onChange: (n: number) => void; min?: number; max?: number; label: string
}) {
  const btn = 'flex h-8 w-8 items-center justify-center text-ink-2 transition-colors hover:bg-warm-100 disabled:cursor-not-allowed disabled:opacity-40'
  return (
    <div className="inline-flex h-8 items-center overflow-hidden rounded-md border border-warm-300 bg-surface" onClick={(e) => e.stopPropagation()}>
      <button type="button" aria-label={`Fewer ${label}`} className={btn} disabled={value <= min} onClick={() => onChange(Math.max(min, value - 1))}><Minus size={14} /></button>
      <span className="w-8 text-center text-[13px] font-bold tabular-nums text-ink" aria-live="polite">{value}</span>
      <button type="button" aria-label={`More ${label}`} className={btn} disabled={value >= max} onClick={() => onChange(Math.min(max, value + 1))}><Plus size={14} /></button>
    </div>
  )
}

/** "+ Add …" — the add button that sits BELOW its list (merchant dialect). */
export function AddBelow({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      className="mt-3 inline-flex items-center gap-1.5 rounded-md px-1 text-[13px] font-bold text-brand-500 hover:text-brand-600">
      <Plus size={14} strokeWidth={2.5} />{label}
    </button>
  )
}

/* ---------------------------------------------------------- autocomplete ---- */

type Pos = { top?: number; bottom?: number; left: number; width: number; maxHeight: number }

/**
 * A text input with a portaled suggestion list (address book, SKU search). The list is
 * portaled to <body> so card overflow never clips it; the active row is warm-50.
 */
export function Autocomplete<T>({ value, onChange, hits, onPick, render, placeholder, invalid, minWidth = 320, openOnFocus = true }: {
  value: string; onChange: (v: string) => void; hits: T[]; onPick: (x: T) => void
  render: (x: T) => ReactNode; placeholder?: string; invalid?: boolean; minWidth?: number; openOnFocus?: boolean
}) {
  const [open, setOpenState] = useState(false)
  const [hi, setHi] = useState(0)
  const [pos, setPos] = useState<Pos | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  const popRef = useRef<HTMLDivElement>(null)
  /* focusing the input can scroll it into view — that scroll must not close the list it opens */
  const openedAt = useRef(0)
  const setOpen = (v: boolean) => {
    if (v) {
      openedAt.current = Date.now()
      const r = ref.current?.getBoundingClientRect()
      if (!r) return
      const below = window.innerHeight - r.bottom
      const up = below < 220 && r.top > below
      setPos(up
        ? { bottom: window.innerHeight - r.top + 4, left: r.left, width: Math.max(r.width, minWidth), maxHeight: Math.min(320, r.top - 12) }
        : { top: r.bottom + 4, left: r.left, width: Math.max(r.width, minWidth), maxHeight: Math.min(320, below - 12) })
    }
    setOpenState(v)
  }
  useEffect(() => {
    if (!open) return
    const click = (e: MouseEvent) => {
      const t = e.target as Node
      if (!ref.current?.contains(t) && !popRef.current?.contains(t)) setOpenState(false)
    }
    const scroll = (e: Event) => {
      if (Date.now() - openedAt.current < 400 || popRef.current?.contains(e.target as Node)) return
      setOpenState(false)
    }
    window.addEventListener('mousedown', click)
    window.addEventListener('scroll', scroll, true)
    window.addEventListener('resize', scroll)
    return () => {
      window.removeEventListener('mousedown', click)
      window.removeEventListener('scroll', scroll, true)
      window.removeEventListener('resize', scroll)
    }
  }, [open])
  const active = hits.length ? Math.min(hi, hits.length - 1) : 0
  const pick = (x: T) => { onPick(x); setOpenState(false) }
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') { setOpenState(false); return }
    if (!open) { if (e.key === 'ArrowDown') setOpen(true); return }
    if (e.key === 'ArrowDown') { e.preventDefault(); setHi(Math.min(hits.length - 1, active + 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHi(Math.max(0, active - 1)) }
    else if (e.key === 'Enter' && hits[active]) { e.preventDefault(); pick(hits[active]) }
  }
  return (
    <div ref={ref}>
      <input value={value} placeholder={placeholder} onKeyDown={onKeyDown}
        onFocus={() => openOnFocus && setOpen(true)}
        onClick={() => { if (!open) setOpen(true) }}
        onChange={(e) => { onChange(e.target.value); setHi(0); if (!open) setOpen(true) }}
        className={`h-8 w-full rounded-md border bg-surface px-3 text-[13px] text-ink placeholder:text-warm-400 transition-shadow
                    focus:border-brand-500 focus:outline-none focus:ring-[3px] focus:ring-brand-500/20 ${invalid ? 'border-danger-fg' : 'border-warm-300'}`} />
      {open && pos && hits.length > 0 && createPortal(
        <div ref={popRef} role="listbox"
          style={{ top: pos.top, bottom: pos.bottom, left: pos.left, width: pos.width, maxHeight: pos.maxHeight }}
          className="fe-nueva fixed z-[95] overflow-auto rounded-md border border-line bg-surface py-1 shadow-ds-overlay">
          {hits.map((x, i) => (
            <button key={i} type="button" role="option" aria-selected={i === active} onClick={() => pick(x)} onMouseEnter={() => setHi(i)}
              className={`flex w-full items-center gap-3 px-3 py-2 text-left transition-colors ${i === active ? 'bg-warm-50' : 'hover:bg-warm-50'}`}>
              {render(x)}
            </button>
          ))}
        </div>,
        document.body,
      )}
    </div>
  )
}
