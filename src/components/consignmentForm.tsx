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
import { CheckCircle2, CircleDot, CircleMinus, CirclePlus, Clock, Info } from 'lucide-react'
import { Input, MenuSelect, Toggle } from '../nueva/components'

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
            <p className="mb-0.5 text-[11px] font-black uppercase tracking-[0.08em] text-ink-3">{eyebrow}</p>
          )}
          <h2 className="flex items-center gap-2 text-[15px] font-bold text-ink">
            {icon}
            {title}
            {count !== undefined && <span className="text-[13px] font-normal text-ink-3">{count}</span>}
            {done && <CheckCircle2 size={15} className="text-success-fg" />}
          </h2>
          {caption && <p className="mt-0.5 max-w-[92ch] text-[12px] text-ink-3">{caption}</p>}
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
        <p className="mt-1 text-[12px] text-brand-500">Required field.</p>
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
          ? 'border-ink bg-warm-50 font-bold text-ink'
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
            className={`flex items-center gap-2.5 rounded-md border px-4 py-2.5 text-[13px] transition-colors
              ${on
                ? 'border-ink bg-warm-50 text-ink'
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
          className={`rounded px-3 py-1.5 text-[12px] font-bold transition-colors
            ${value === m.value ? 'bg-warm-100 font-bold text-ink' : 'text-ink-3 hover:text-ink'}`}>
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

/* =====================================================================
 * STAGING-EXACT Add Order grammar (owner override, 2026-09-24).
 *
 * For the Add Order form ONLY (console `/local/consignments/add` and Grow
 * `/grow/orders/add`), the owner ruled that staging's current Add Order form
 * (staging.fareye.co/v2/ses/consignment → Add) IS the layout reference —
 * an explicit exception to "staging screenshots are functionality, never
 * layout". Arrangement, card order, wording, 4-column grids, eager
 * "Required field." text, Add More placement, radio cards and the footer
 * follow the capture in docs/superpowers/research/2026-09-24-staging-add-order-form.md;
 * colours and controls stay design.md tokens / Nueva primitives.
 * ===================================================================== */

/** A staging form card: title (+ count), caption, optional top-right action, then the body. */
export function StagingCard({ id, title, caption, count, action, children }: {
  id?: string; title?: ReactNode; caption?: string; count?: number; action?: ReactNode; children?: ReactNode
}) {
  return (
    <section id={id} className="scroll-mt-20 rounded-xl bg-surface p-6">
      {(title || action) && (
        <div className="mb-6 flex items-start justify-between gap-4">
          <div className="min-w-0">
            {title && (
              <h2 className="flex items-baseline gap-2 text-[15px] font-bold text-ink">
                {title}
                {count !== undefined && <span className="text-[15px] font-normal text-ink">{count}</span>}
              </h2>
            )}
            {caption && <p className="mt-1.5 text-[13px] text-ink-2">{caption}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  )
}

/** Staging's field grid — `cols` equal columns (4 on Regular, 3 on the Simplified Order card). */
export function SGrid({ children, cols = 4, className = '' }: { children: ReactNode; cols?: 3 | 4 | 5 | 7; className?: string }) {
  const c = { 3: 'lg:grid-cols-3', 4: 'lg:grid-cols-4', 5: 'lg:grid-cols-5', 7: 'lg:grid-cols-7' }[cols]
  return <div className={`grid grid-cols-1 gap-x-8 gap-y-10 sm:grid-cols-2 ${c} lg:pr-10 ${className}`}>{children}</div>
}

/**
 * A staging field: label above (red `*` when required, ⓘ when `info`), the
 * control, and — eagerly, as staging does on a pristine form — "Required field."
 * under an empty required control (`error`).
 */
export function SFld({ label, required, info, error, helper, className = '', children }: {
  label?: string; required?: boolean; info?: boolean
  /** true = staging's eager "Required field."; a string = that message in the same red line */
  error?: boolean | string
  helper?: ReactNode; className?: string; children: ReactNode
}) {
  /* Helper / error never change the row height: ONE single-line slot, absolutely positioned under
     the control (the grid's row gap leaves room for it), full text in the tooltip. The error wins
     the slot when both apply. */
  const msg = error ? (typeof error === 'string' ? error : 'Required field.') : null
  const tip = msg ?? (typeof helper === 'string' ? helper : undefined)
  return (
    <div className={`min-w-0 ${className}`}>
      <label className="mb-2 flex min-h-5 items-start gap-1 text-[12px] leading-5 text-ink-3" title={label}>
        <span className="min-w-0">{label || '\u00a0'}{required && <span className="text-danger-fg">&nbsp;*</span>}</span>
        {info && <Info size={13} className="shrink-0 text-brand-500" />}
      </label>
      <div className="relative">
        {children}
        {(msg || helper) && (
          <p title={tip} className={`absolute left-0 right-0 top-full mt-1 truncate text-[12px] leading-4 ${msg ? 'pl-2 text-danger-fg' : 'text-ink-3'}`}>
            {msg ?? helper}
          </p>
        )}
      </div>
    </div>
  )
}

/** Label LEFT of the switch, on one line — staging's Scannable / Lift Available / Order Category grammar. */
export function SwitchField({ label, hint, checked, onChange, disabled }: {
  label: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean
  /** a muted one-line explanation under the label, also the tooltip */
  hint?: string
}) {
  return (
    <label title={hint} className={`flex min-w-0 cursor-pointer items-start gap-4 text-[13px] text-ink ${disabled ? 'pointer-events-none opacity-60' : ''}`}>
      <span className={`min-w-0 ${hint ? 'max-w-[230px]' : 'max-w-[180px]'}`}>
        {label}
        {hint && <span className="mt-0.5 block text-[12px] leading-snug text-ink-3">{hint}</span>}
      </span>
      <span className="shrink-0 pt-0.5"><Toggle checked={checked} onChange={onChange} /></span>
    </label>
  )
}

/** The outline brand "⊕ Add More" button a staging card carries top-right. */
export function AddMoreButton({ label = 'Add More', onClick, icon = true }: { label?: string; onClick: () => void; icon?: boolean }) {
  return (
    <button type="button" onClick={onClick}
      className="inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md border border-brand-500 bg-surface px-3.5 text-[13px] text-brand-500 transition-colors hover:bg-warm-50">
      {icon && <CirclePlus size={13} />}{label}
    </button>
  )
}

/** One Add More row: a bordered sub-card with a grey header strip ("SKU 1") and a ⊖ remove button. */
export function RowCard({ title, onRemove, footer, children }: {
  title: string; onRemove?: () => void; footer?: ReactNode; children: ReactNode
}) {
  return (
    <div className="mt-4 overflow-hidden rounded-lg border border-warm-200 first:mt-0">
      <div className="flex items-center justify-between bg-warm-50 px-4 py-3">
        <span className="text-[13px] font-bold text-ink">{title}</span>
        {onRemove && (
          <button type="button" onClick={onRemove} aria-label={`Remove ${title}`}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-warm-200 bg-surface text-ink-2 hover:text-brand-500">
            <CircleMinus size={14} />
          </button>
        )}
      </div>
      <div className="px-4 py-5">
        {children}
        {footer && <div className="mt-6 flex flex-wrap gap-x-8 gap-y-1 text-[13px] text-ink">{footer}</div>}
      </div>
    </div>
  )
}

/** Staging's radio card (RTO mode, Carriers): a bordered pill with a ring; the chosen one outlined brand. */
export function RadioCard({ label, sub, checked, onClick, filled = true }: {
  label: string; sub?: string; checked: boolean; onClick: () => void; filled?: boolean
}) {
  return (
    <button type="button" role="radio" aria-checked={checked} onClick={onClick}
      className={`flex items-center gap-2.5 rounded-lg border px-4 py-3 text-left text-[13px] transition-colors
        ${checked ? 'border-ink bg-warm-50 text-ink'
          : `border-transparent ${filled ? 'bg-warm-50' : 'bg-surface'} text-ink-2 hover:border-warm-300`}`}>
      {checked
        ? <CircleDot size={15} className="shrink-0 text-brand-500" />
        : <span className="h-[15px] w-[15px] shrink-0 rounded-full border border-warm-400" />}
      <span>
        <span className="block leading-tight">{label}</span>
        {sub && <span className="mt-0.5 block text-[12px] leading-tight text-ink-3">{sub}</span>}
      </span>
    </button>
  )
}

/** Contact Number: country-code select + tel input in one control, as staging draws it. */
export function PhoneInput({ code, number, codes, onCode, onNumber, placeholder = 'eg, 1234567890', invalid, disabled }: {
  code: string; number: string; codes: string[]; onCode: (v: string) => void; onNumber: (v: string) => void
  placeholder?: string; invalid?: boolean; disabled?: boolean
}) {
  return (
    <div className={`grid grid-cols-[84px_minmax(0,1fr)] gap-1.5 rounded-md ${invalid ? 'ring-1 ring-danger-fg ring-offset-1' : ''} ${disabled ? 'pointer-events-none opacity-60' : ''}`}>
      <MenuSelect value={code} placeholder="Code" options={codes} onChange={onCode} />
      <Input type="tel" value={number} placeholder={placeholder} disabled={disabled} onChange={(v) => onNumber(v.replace(/[^\d ]/g, ''))} />
    </div>
  )
}

/** half-hour steps for the time half of a staging date + time pair */
const TIME_STEPS = Array.from({ length: 48 }, (_, i) => `${String(Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`)

/** A time box ("Select Time" + clock) — the time half of staging's date/time pairs. */
export function TimeBox({ value, onChange, placeholder = 'Select Time' }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  const opts = value && !TIME_STEPS.includes(value) ? [value, ...TIME_STEPS] : TIME_STEPS
  return (
    <div className="relative">
      <MenuSelect value={value} placeholder={placeholder} options={opts} searchable onChange={onChange} />
      {!value && <Clock size={13} className="pointer-events-none absolute right-8 top-1/2 -translate-y-1/2 text-warm-400" />}
    </div>
  )
}
