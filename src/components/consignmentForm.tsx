/**
 * The console's Add Consignment form grammar — SectionCard, the labelled
 * 4-column field Grid, Fld, SubHead, Segmented, ChipToggle, InlineToggle,
 * UnitBox — lifted verbatim (same class strings) out of
 * pages/ConsignmentAdd/index.tsx so the Grow merchant portal renders its
 * Create Consignment page from the SAME pieces (spec §15). ConsignmentAdd
 * still carries private copies; it should switch to this module.
 *
 * Pure presentation: no data, no auth, no fetches.
 */
import type { ComponentType, ReactNode } from 'react'
import { CheckCircle2, CircleDot, Info } from 'lucide-react'
import { Toggle } from '../nueva/components'

export function SectionCard({ id, eyebrow, title, icon, done, caption, count, action, className = '', clip = true, children }: {
  id?: string; eyebrow?: string; title: ReactNode; done?: boolean
  caption?: string; count?: number; className?: string
  /** small brand-tinted icon shown before the title */
  icon?: ReactNode
  action?: ReactNode; children?: ReactNode
  /** overflow-hidden, as the console card; every popover inside is portaled */
  clip?: boolean
}) {
  return (
    <section id={id} className={`scroll-mt-20 rounded-xl border border-line bg-surface shadow-ds-1 ${clip ? 'overflow-hidden' : ''} transition-all hover:border-warm-300 ${className}`}>
      <div className="flex items-start justify-between gap-4 px-6 py-3.5 border-b border-line">
        <div>
          {eyebrow && (
            <p className="mb-0.5 text-[10.5px] font-black uppercase tracking-[0.08em] text-ink-3">{eyebrow}</p>
          )}
          <h2 className="flex items-center gap-2 text-[14.5px] font-bold text-ink">
            {icon}
            {title}
            {count !== undefined && <span className="text-[13.5px] font-normal text-ink-3">{count}</span>}
            {done && <CheckCircle2 size={15} className="text-success-fg" />}
          </h2>
          {caption && <p className="mt-0.5 max-w-[92ch] text-[12.5px] text-ink-3">{caption}</p>}
        </div>
        {action}
      </div>
      {children && <div className="px-6 py-5">{children}</div>}
    </section>
  )
}

export function Grid({ children, compact }: { children: ReactNode; compact?: boolean }) {
  return (
    <div className={`grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2 ${compact ? '' : 'xl:grid-cols-4'}`}>
      {children}
    </div>
  )
}

/**
 * Uniform field anatomy so every control in a grid row sits on the same line:
 * fixed-height single-line label → control → helper/error underneath.
 */
export function Fld({ label, required, info, error, helper, className = '', children }: {
  label: string; required?: boolean; info?: boolean; error?: boolean
  helper?: ReactNode; className?: string; children: ReactNode
}) {
  return (
    <div className={`min-w-0 ${className}`}>
      <label className="mb-1.5 flex h-5 items-center gap-1 whitespace-nowrap text-[13px] font-bold text-ink" title={label}>
        <span className="truncate">{label}</span>
        {required && <span className="shrink-0 text-brand-500">*</span>}
        {info && <Info size={12} className="shrink-0 text-brand-500" />}
      </label>
      {children}
      {helper && <div className="mt-1 text-[12px] text-ink-3">{helper}</div>}
      {required && error && (
        <p className="mt-1 text-[12.5px] text-brand-500">Required field.</p>
      )}
    </div>
  )
}

/** Icon chip that toggles on click — the selected state is the highlight. */
export function ChipToggle({ icon: Icon, label, checked, onChange, disabled }: {
  icon: ComponentType<{ size?: number | string; className?: string }>
  label: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean
}) {
  return (
    <button
      type="button" aria-pressed={checked} onClick={() => onChange(!checked)} disabled={disabled}
      className={`flex items-center gap-2 rounded-md border px-3.5 py-2 text-[13px] transition-colors disabled:cursor-not-allowed disabled:opacity-50
        ${checked
          ? 'border-brand-500 bg-brand-50/60 font-bold text-brand-500'
          : 'border-line bg-surface text-ink-2 hover:border-warm-300 hover:text-ink'}`}>
      <Icon size={15} className={checked ? 'text-brand-500' : 'text-warm-400'} />
      {label}
    </button>
  )
}

/** Toggle with the same label-over-control anatomy as Fld — keeps rows level. */
export function InlineToggle({ label, checked, onChange, disabled }: {
  label: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean
}) {
  return (
    <div className={`min-w-0 ${disabled ? 'pointer-events-none opacity-50' : ''}`}>
      <span className="mb-1.5 flex h-5 items-center whitespace-nowrap text-[13px] font-bold text-ink" title={label}>
        <span className="truncate">{label}</span>
      </span>
      <div className="flex h-8 items-center">
        <Toggle checked={checked} onChange={onChange} />
      </div>
    </div>
  )
}

/** Thin uppercase group divider inside a section card. */
export function SubHead({ label, first }: { label: string; first?: boolean }) {
  return (
    <div className={`${first ? '' : 'mt-6'} mb-3 flex items-center gap-3`}>
      <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-ink-3">{label}</span>
      <span className="h-px flex-1 bg-line" />
    </div>
  )
}

export function Segmented({ options, value, onChange }: {
  options: string[]; value: string; onChange: (v: string) => void
}) {
  return (
    <div className="flex flex-wrap gap-3">
      {options.map((o) => {
        const on = o === value
        return (
          <button
            key={o} type="button" onClick={() => onChange(o)}
            className={`flex items-center gap-2.5 rounded-md border px-4 py-2.5 text-[14px] transition-colors
              ${on
                ? 'border-brand-500 bg-brand-50/60 text-ink'
                : 'border-line bg-surface text-ink-2 hover:text-ink'}`}>
            <CircleDot size={15} className={on ? 'text-brand-500' : 'text-warm-400'} />
            {o}
          </button>
        )
      })}
    </div>
  )
}

/** The header tier switch (Simplified | Full Form), as the console header draws it. */
export function TierSwitch<T extends string>({ value, options, onChange }: {
  value: T; options: { value: T; label: string }[]; onChange: (v: T) => void
}) {
  return (
    <div className="flex rounded-md border border-line bg-surface p-0.5">
      {options.map((m) => (
        <button key={m.value} type="button" onClick={() => onChange(m.value)}
          className={`rounded px-3 py-1.5 text-[12.5px] font-bold transition-colors
            ${value === m.value ? 'bg-brand-50 text-brand-500' : 'text-ink-3 hover:text-ink'}`}>
          {m.label}
        </button>
      ))}
    </div>
  )
}

/**
 * Input-height composite with a trailing unit tag — the consignmentRows
 * Composite/UnitTag anatomy, for a number that carries its unit.
 */
export function UnitBox({ unit, children, invalid }: { unit?: string; children: ReactNode; invalid?: boolean }) {
  return (
    <div className={`flex h-8 items-center rounded-md border bg-surface transition-shadow
                    focus-within:border-brand-500 focus-within:ring-[3px] focus-within:ring-brand-500/20
                    ${invalid ? 'border-brand-500' : 'border-warm-300'}`}>
      {children}
      {unit && (
        <span className="flex h-full shrink-0 items-center rounded-r-[5px] border-l border-warm-200 bg-warm-50 px-1.5
                         text-[11px] font-bold uppercase text-ink-3">
          {unit}
        </span>
      )}
    </div>
  )
}
