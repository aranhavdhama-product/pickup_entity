/**
 * Small staging-grammar pieces for the Same/Next Day Routing replica (owner override,
 * 2026-09-25 — see index.tsx). Colours are design.md tokens; sizes follow the staging
 * capture (docs/superpowers/research/2026-09-25-staging-same-next-day-routing.md):
 * 32px toolbar buttons, 47px table header, 57px rows, 200px columns, a sticky right
 * action column, 14px cells.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Info, MoreVertical, X } from 'lucide-react'

/** Staging's white outline toolbar button (Roster · Route Settings · Vehicle Config). */
export function ToolButton({ icon, children, onClick, title, tone = 'plain', disabled }: {
  icon?: ReactNode; children?: ReactNode; onClick?: () => void; title?: string
  tone?: 'plain' | 'primary' | 'brand-outline'; disabled?: boolean
}) {
  const cls = tone === 'primary'
    ? 'bg-brand-500 text-white border-brand-500 hover:bg-brand-600'
    : tone === 'brand-outline'
      ? 'bg-surface text-brand-500 border-brand-500 hover:bg-warm-50'
      : 'bg-surface text-ink border-line hover:border-warm-300'
  return (
    <button type="button" title={title} aria-label={title} onClick={onClick} disabled={disabled}
      className={`inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md border text-[13px] transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${cls} ${children ? 'px-3' : 'w-8 justify-center'}`}>
      {icon}{children}
    </button>
  )
}

/** Header cell with staging's trailing ⓘ. */
export function InfoLabel({ children, tip }: { children: ReactNode; tip?: string }) {
  return (
    <span className="flex items-center justify-between gap-1">
      <span>{children}</span>
      <span title={tip} className="text-ink-3"><Info size={13} /></span>
    </span>
  )
}

/** A narrow staging modal (Create New Routes, Vehicles by City and Hub, Copy Route). */
export function SmallModal({ title, onClose, children, footer, width = 440 }: {
  title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; width?: number
}) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-warm-900/40 py-16 fe-nueva">
      <div className="relative w-full rounded-xl bg-surface shadow-ds-overlay" style={{ maxWidth: width }}>
        <div className="flex items-center justify-between px-6 pt-5 pb-2">
          <h3 className="text-[18px] font-bold text-ink">{title}</h3>
          <button type="button" aria-label="Close" onClick={onClose} className="text-ink-3 hover:text-ink"><X size={16} /></button>
        </div>
        <div className="px-6 pb-2">{children}</div>
        {footer && <div className="flex items-center gap-2 px-6 py-4">{footer}</div>}
      </div>
    </div>
  )
}

/** Label above a control, staging's 12px label with a red asterisk. */
export function StackField({ label, required, children }: { label: string; required?: boolean; children: ReactNode }) {
  return (
    <div className="mb-3">
      <p className="mb-1 text-[12px] text-ink-2">{label}{required && <span className="ml-0.5 text-st-danger">*</span>}</p>
      {children}
    </div>
  )
}

/** Row kebab whose menu is positioned on the viewport, so a scrolling table never clips it. */
export function RowMenu({ items }: { items: { label: string; icon?: ReactNode; onClick: () => void }[] }) {
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null)
  const btn = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!pos) return
    const close = () => setPos(null)
    window.addEventListener('click', close)
    window.addEventListener('scroll', close, true)
    return () => { window.removeEventListener('click', close); window.removeEventListener('scroll', close, true) }
  }, [pos])
  return (
    <>
      <button ref={btn} type="button" aria-label="Kebab Menu" className="rounded p-1 text-ink hover:bg-warm-100"
        onClick={(e) => {
          e.stopPropagation()
          const r = btn.current!.getBoundingClientRect()
          setPos(pos ? null : { top: r.bottom + 4, right: window.innerWidth - r.right })
        }}>
        <MoreVertical size={16} />
      </button>
      {pos && createPortal(
        <div className="fixed z-50 min-w-[150px] rounded-lg border border-line bg-surface py-1 shadow-ds-overlay fe-nueva" style={pos}>
          {items.map((it) => (
            <button key={it.label} type="button" onClick={(e) => { e.stopPropagation(); setPos(null); it.onClick() }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] text-ink hover:bg-warm-50">
              {it.icon}{it.label}
            </button>
          ))}
        </div>, document.body)}
    </>
  )
}

/** Staging's inline radio row (Route Settings). */
export function RadioRow<T extends string>({ value, options, onChange }: {
  value: T; options: readonly T[]; onChange: (v: T) => void
}) {
  return (
    <span className="flex flex-wrap items-center gap-x-8 gap-y-2">
      {options.map((o) => (
        <label key={o} className="inline-flex cursor-pointer items-center gap-2 text-[13px] text-ink">
          <button type="button" role="radio" aria-checked={value === o} onClick={() => onChange(o)}
            className={`flex h-4 w-4 items-center justify-center rounded-full border ${value === o ? 'border-brand-500' : 'border-warm-300'}`}>
            {value === o && <span className="h-2 w-2 rounded-full bg-brand-500" />}
          </button>
          {o}
        </label>
      ))}
    </span>
  )
}

/** Staging's segmented control (All Vehicles | Per Fence | Per Vehicle Type). */
export function Segmented<T extends string>({ value, options, onChange }: {
  value: T; options: readonly T[]; onChange: (v: T) => void
}) {
  return (
    <span className="inline-flex overflow-hidden rounded-md border border-line">
      {options.map((o, i) => (
        <button key={o} type="button" onClick={() => onChange(o)}
          className={`h-8 px-3 text-[13px] ${i ? 'border-l border-line' : ''} ${value === o ? 'bg-warm-100 font-bold text-ink' : 'bg-surface text-ink-2 hover:text-ink'}`}>
          {o}
        </button>
      ))}
    </span>
  )
}
