/**
 * Grow merchant-portal UI kit — a faithful re-creation of the Material-UI
 * (Materio template) controls the real portal is built from, so the replica
 * pages read exactly like grow-staging.fareye.co. Scoped to /grow/orders only;
 * the console keeps its Nueva primitives.
 */
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode, type Ref } from 'react'
import { useEscapeKey, useOutside } from './utils'
import { ArrowLeft, ArrowRight, CalendarDays, Columns3Cog, Check, ChevronDown, ListFilter, Package, RefreshCw, Search, SlidersHorizontal, Upload, X, type LucideIcon } from 'lucide-react'
/* Advanced Filters' date panes use the portal's own picker. The cycle back into
   this file (the picker borrows `Btn`) is resolved at render time, never at
   module scope. */
import { DateRangePicker } from './dateTimePicker'

/**
 * The ONE keyboard-focus ring the whole surface uses. Nothing in this kit used
 * to draw one, so a keyboard user could not see where they were; `focus-visible`
 * keeps it off mouse clicks, which is why it can be applied to everything.
 */
export const FOCUS_RING = 'outline-none focus-visible:ring-2 focus-visible:ring-grow-accent-2/60 focus-visible:ring-offset-1'

/**
 * The ONE table grammar both grids and every embedded table share: a 54px header
 * row of 12px/600 uppercase labels, and rows that hover without moving.
 * `TABLE_TH` truncates rather than wrapping, so a header that does not fit its
 * column is clipped instead of pushing the table wider than its card.
 */
export const TABLE_TH = 'truncate px-4 text-[12px] font-semibold uppercase tracking-[0.17px] text-grow-ink'
export const TABLE_HEAD_ROW = 'h-[54px] bg-grow-thead text-left'
/**
 * 50px is the FLOOR, not a cap — `max-height` does nothing on a `<tr>`, so the
 * 64px ceiling the grids hold to is a property of their cells: at most two
 * 14px/12px lines inside `py-2`, or three with `leading-tight` and `py-1.5`
 * (the pickup-request Pickup Address cell). Measure, do not assume.
 */
export const TABLE_ROW = 'h-[50px] cursor-pointer align-middle tracking-[0.15px] transition-colors hover:bg-grow-ink/[0.04]'
export const TABLE_ROW_SELECTED = 'bg-grow-accent-2/[0.08]'

/* ----------------------------------------------------------------- button ---- */

type BtnVariant = 'contained' | 'outlined' | 'text'
type BtnColor = 'accent' | 'accent2' | 'neutral' | 'error'
const CONTAINED: Record<BtnColor, string> = {
  accent: 'bg-grow-accent text-white hover:bg-[#A82640]',
  accent2: 'bg-grow-accent-2 text-white hover:bg-[#E8624F]',
  neutral: 'bg-grow-ink-2 text-white',
  error: 'bg-grow-error text-white',
}
const OUTLINED: Record<BtnColor, string> = {
  accent: 'border border-grow-accent text-grow-accent hover:bg-grow-accent/5',
  accent2: 'border border-grow-accent-2 text-grow-accent-2 hover:bg-grow-accent-2/5',
  neutral: 'border border-grow-outline text-grow-ink hover:bg-grow-ink/5',
  error: 'border border-grow-error text-grow-error hover:bg-grow-error/5',
}
const TEXTC: Record<BtnColor, string> = {
  accent: 'text-grow-accent hover:bg-grow-accent/5', accent2: 'text-grow-accent-2 hover:bg-grow-accent-2/5',
  neutral: 'text-grow-ink-2 hover:bg-grow-ink/5', error: 'text-grow-error hover:bg-grow-error/5',
}

export function Btn({ variant = 'contained', color = 'accent', size = 'md', disabled, onClick, children, className = '', startIcon, endIcon, type = 'button' }: {
  variant?: BtnVariant; color?: BtnColor; size?: 'sm' | 'md' | 'lg'; disabled?: boolean
  onClick?: () => void; children: ReactNode; className?: string; startIcon?: ReactNode; endIcon?: ReactNode
  type?: 'button' | 'submit'
}) {
  const h = size === 'sm' ? 'h-[30px] px-3 text-[13px]' : size === 'lg' ? 'h-[42px] px-[22px] text-[15px]' : 'h-[38px] px-[18px] text-[14px]'
  const look = disabled
    ? (variant === 'contained' ? 'bg-grow-disabled text-grow-ink-3' : 'text-grow-ink-3 border border-grow-ink/10')
    : variant === 'contained' ? `${CONTAINED[color]} shadow-[0_4px_8px_-4px_rgba(58,53,65,0.42)]`
    : variant === 'outlined' ? OUTLINED[color] : TEXTC[color]
  return (
    <button type={type} disabled={disabled} onClick={onClick}
      className={`inline-flex items-center justify-center gap-2 rounded-[5px] font-medium leading-none tracking-[0.3px] transition-colors
        ${FOCUS_RING} ${h} ${look} ${disabled ? 'cursor-not-allowed' : ''} ${className}`}>
      {startIcon}{children}{endIcon}
    </button>
  )
}

/** MUI radio rendered as a filled pill — the portal's Authority-to-leave control. */
export function RadioPill({ label, on, onClick, sub, size = 'lg' }: {
  label: string; on: boolean; onClick: () => void; sub?: string; size?: 'md' | 'lg'
}) {
  const lg = size === 'lg'
  return (
    <button type="button" onClick={onClick}
      className={`flex items-center gap-2.5 rounded-[6px] text-left text-grow-ink ${lg ? 'h-[52px] px-4 text-[16px]' : 'min-h-[44px] px-3.5 py-2 text-[14px]'}
        ${on ? 'bg-grow-accent-2/15' : 'bg-grow-ink/5 hover:bg-grow-ink/[0.08]'}`}>
      <span className={`flex h-[20px] w-[20px] shrink-0 items-center justify-center rounded-full border-2 ${on ? 'border-grow-accent-2' : 'border-grow-ink-3'}`}>
        {on && <span className="h-[10px] w-[10px] rounded-full bg-grow-accent-2" />}
      </span>
      <span className="min-w-0">
        <span className="block leading-tight">{label}</span>
        {sub && <span className="mt-0.5 block text-[12px] leading-tight text-grow-ink-2">{sub}</span>}
      </span>
    </button>
  )
}

export function IconBtn({ icon, title, onClick, className = '' }: { icon: ReactNode; title?: string; onClick?: () => void; className?: string }) {
  return (
    <button type="button" title={title} onClick={onClick}
      className={`flex h-[38px] w-[38px] items-center justify-center rounded-full text-grow-ink-2 transition-colors hover:bg-grow-ink/5 ${FOCUS_RING} [&>svg]:h-[22px] [&>svg]:w-[22px] ${className}`}>
      {icon}
    </button>
  )
}

/* ------------------------------------------------------------------- menu ---- */


export function Menu({ children, align = 'left', onClose, width = 'min-w-[180px]', className = '' }: { children: ReactNode; align?: 'left' | 'right'; onClose?: () => void; width?: string; className?: string }) {
  useEscapeKey(true, () => onClose?.())
  return (
    <div className={`absolute top-full z-40 mt-1 ${width} rounded-[6px] bg-white py-2 shadow-grow-menu ${align === 'right' ? 'right-0' : 'left-0'} ${className}`}>
      {children}
    </div>
  )
}
export function MenuItem({ children, onClick, selected }: { children: ReactNode; onClick?: () => void; selected?: boolean }) {
  return (
    <button type="button" onClick={onClick}
      className={`flex min-h-[36px] w-full items-center px-4 py-1.5 text-left text-[16px] text-grow-ink transition-colors hover:bg-grow-ink/5 ${FOCUS_RING} ${selected ? 'bg-grow-accent/10' : ''}`}>
      {children}
    </button>
  )
}

/* ----------------------------------------------------------------- switch ---- */

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-1.5 select-none">
      {label && <span className="text-[12px] font-medium text-grow-ink-2">{label}</span>}
      <span className="relative inline-flex h-[38px] w-[58px] items-center justify-center" onClick={() => onChange(!checked)}>
        <span className={`h-[14px] w-[34px] rounded-[7px] transition-colors ${checked ? 'bg-grow-accent/50' : 'bg-grow-ink/40'}`} />
        <span className={`absolute top-1/2 h-[20px] w-[20px] -translate-y-1/2 rounded-full shadow-[0_2px_4px_rgba(58,53,65,0.4)] transition-all
          ${checked ? 'left-[29px] bg-grow-accent' : 'left-[9px] bg-white'}`} />
      </span>
    </label>
  )
}

/* --------------------------------------------------------------- checkbox ---- */

export function Checkbox({ checked, indeterminate, onChange, ariaLabel }: { checked: boolean; indeterminate?: boolean; onChange: (v: boolean) => void; ariaLabel?: string }) {
  return (
    <button type="button" role="checkbox" aria-checked={checked} aria-label={ariaLabel}
      onClick={(e) => { e.stopPropagation(); onChange(!checked) }}
      className={`flex h-[38px] w-[38px] items-center justify-center rounded-full transition-colors hover:bg-grow-ink/5 ${FOCUS_RING}`}>
      <span className={`flex h-[18px] w-[18px] items-center justify-center rounded-[3px] border-2 transition-colors
        ${checked || indeterminate ? 'border-grow-accent bg-grow-accent' : 'border-grow-ink-2 bg-white'}`}>
        {checked && <Check size={13} strokeWidth={3.5} className="text-white" />}
        {!checked && indeterminate && <span className="h-[2px] w-[10px] bg-white" />}
      </span>
    </button>
  )
}

/* ----------------------------------------------------------- outlined field ---- */

export interface Opt { value: string; label?: string }

/**
 * MUI OutlinedInput with the floating "notched" label. Works as a text input,
 * a native select (`options`) or a read-only trigger (`onClick`).
 */
interface FieldProps {
  label?: string; value: string; onChange?: (v: string) => void; placeholder?: string; required?: boolean
  helper?: string; error?: string; type?: string; options?: Opt[]; size?: 'sm' | 'md'
  endAdornment?: ReactNode; startAdornment?: ReactNode; disabled?: boolean; readOnly?: boolean; onClick?: () => void
  className?: string; multiline?: boolean; rows?: number; name?: string
  /** Seconds between steps for date/time inputs (1800 = half-hourly). */
  step?: number
  /** Autocomplete hosts open their list on focus and drive it from the keys. */
  onFocus?: () => void
  onKeyDown?: (e: KeyboardEvent<HTMLInputElement>) => void
  /**
   * `ghost` = a field that lives inside a band or a table row: plain text at
   * rest (no border, no floating label — the column header or a caption is
   * the label), a box only while hovered or focused. Keeps a card from being
   * a wall of outlines.
   */
  variant?: 'outlined' | 'ghost'
}

/** The one helper / error line under every field. */
function HelperLine({ helper, error }: { helper?: string; error?: string }) {
  if (!error && !helper) return null
  return <p className={`mx-[14px] mt-[3px] text-[12px] leading-tight ${error ? 'text-grow-error' : 'text-grow-ink-2'}`}>{error || helper}</p>
}

/** The floating notched label every outlined control shares. */
function FloatingLabel({ label, required, floated, error, active }: { label: string; required?: boolean; floated: boolean; error?: boolean; active: boolean }) {
  return (
    <label className={`pointer-events-none absolute left-[14px] z-10 bg-white px-1 transition-all
      ${floated ? '-top-[8px] text-[12px]' : 'top-1/2 -translate-y-1/2 text-[15px]'}
      ${error ? 'text-grow-error' : active ? 'text-grow-accent-2' : 'text-grow-ink-2'}`}>
      {label}{required && <span className={error ? 'text-grow-error' : 'text-grow-accent'}> *</span>}
    </label>
  )
}

/**
 * MUI `TextField variant="outlined"`: a 56px (or 40px) box with the floating
 * notched label. With `options` it is a Select — rendered by `SelectField`,
 * a custom popover listbox, never the native <select> (whose OS-drawn menu
 * broke the Materio look on every dropdown of the portal).
 */
export function OutlinedField(props: FieldProps) {
  return props.options ? <SelectField {...props} options={props.options} /> : <TextField {...props} />
}

function TextField({ label, value, onChange, placeholder, required, helper, error, type = 'text', size = 'md', endAdornment, startAdornment, disabled, readOnly, onClick, className = '', multiline, rows = 3, name, step, onFocus, onKeyDown, variant = 'outlined' }: FieldProps) {
  const [focus, setFocus] = useState(false)
  /* a date/time input always paints its own mask, so its label must float from the start */
  const floated = focus || value !== '' || !!placeholder || !!startAdornment
    || type === 'date' || type === 'time' || type === 'datetime-local'
  const h = size === 'sm' ? 'h-[40px]' : 'h-[56px]'
  const ghost = variant === 'ghost'
  const ring = error ? 'border-grow-error'
    : ghost ? (focus ? 'border-grow-outline bg-white' : 'border-transparent bg-transparent hover:bg-grow-ink/[0.04]')
    : focus ? 'border-grow-accent-2 border-2' : 'border-grow-outline hover:border-grow-ink'
  const inputCls = 'w-full bg-transparent px-[14px] text-[15px] text-grow-ink outline-none placeholder:text-grow-ink-3 disabled:text-grow-ink-3'
  return (
    <div className={`relative ${className}`}>
      <div className={`relative flex items-center rounded-[6px] border ${ghost ? '' : 'bg-white'} ${h} ${ring} ${disabled ? 'bg-grow-ink/5' : ''}`}
        onClick={onClick}>
        {label && !ghost && <FloatingLabel label={label} required={required} floated={floated} error={!!error} active={focus} />}
        {startAdornment && <span className="pl-[14px] text-grow-ink-2 [&>svg]:h-[20px] [&>svg]:w-[20px]">{startAdornment}</span>}
        {multiline ? (
          <textarea name={name} value={value} rows={rows} readOnly={readOnly} disabled={disabled} placeholder={placeholder}
            onChange={(e) => onChange?.(e.target.value)} onFocus={() => setFocus(true)} onBlur={() => setFocus(false)}
            className={`${inputCls} resize-none py-3`} />
        ) : (
          <input name={name} type={type} step={step} value={value} readOnly={readOnly || !!onClick} disabled={disabled} placeholder={placeholder}
            aria-label={ghost ? label : undefined}
            onChange={(e) => onChange?.(e.target.value)} onFocus={() => { setFocus(true); onFocus?.() }} onBlur={() => setFocus(false)}
            onKeyDown={onKeyDown}
            className={`${inputCls} h-full ${onClick ? 'cursor-pointer' : ''}
              [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-50
              [&::-webkit-calendar-picker-indicator]:hover:opacity-90`} />
        )}
        {endAdornment && <span className="pr-[10px] text-grow-ink-2 [&>svg]:h-[20px] [&>svg]:w-[20px]">{endAdornment}</span>}
      </div>
      <HelperLine helper={helper} error={error} />
    </div>
  )
}

/**
 * MUI `Select`: the same outlined box, opening an anchored listbox. ↑/↓ move
 * the cursor, Enter/Space pick, Esc and outside-click close, and a typed
 * letter jumps to the next option starting with it. `placeholder` is the
 * empty choice (value '') and reads muted, exactly as the native version did,
 * so no call site changes.
 */
function SelectField({ label, value, onChange, placeholder, required, helper, error, options, size = 'md', disabled, className = '', name, variant = 'outlined' }: FieldProps & { options: Opt[] }) {
  const [open, setOpen] = useState(false)
  const [cursor, setCursor] = useState(0)
  const ref = useOutside(() => setOpen(false))
  const listRef = useRef<HTMLDivElement>(null)
  useEscapeKey(open, () => setOpen(false))

  const rows: Opt[] = placeholder ? [{ value: '', label: placeholder }, ...options] : options
  const selected = options.find((o) => o.value === value)
  const floated = open || value !== '' || !!placeholder
  const h = size === 'sm' ? 'h-[40px]' : 'h-[56px]'
  const ghost = variant === 'ghost'
  const ring = error ? 'border-grow-error'
    : ghost ? (open ? 'border-grow-outline bg-white' : 'border-transparent bg-transparent hover:bg-grow-ink/[0.04]')
    : open ? 'border-grow-accent-2 border-2' : 'border-grow-outline hover:border-grow-ink'

  const openAt = () => {
    const i = rows.findIndex((o) => o.value === value)
    setCursor(i < 0 ? 0 : i)
    setOpen(true)
  }
  const pick = (v: string) => { onChange?.(v); setOpen(false) }

  /* keep the cursor row in view while arrowing through a long list */
  useEffect(() => {
    if (!open) return
    listRef.current?.querySelector<HTMLElement>('[data-cursor="1"]')?.scrollIntoView({ block: 'nearest' })
  }, [open, cursor])

  const onKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (!open) { openAt(); return }
      setCursor((c) => (c + (e.key === 'ArrowDown' ? 1 : rows.length - 1)) % Math.max(1, rows.length))
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      if (!open) openAt()
      else if (rows[cursor]) pick(rows[cursor].value)
    } else if (e.key === 'Home' && open) { e.preventDefault(); setCursor(0) }
    else if (e.key === 'End' && open) { e.preventDefault(); setCursor(rows.length - 1) }
    else if (e.key.length === 1 && /\S/.test(e.key)) {
      /* type-ahead: the next option (after the cursor) whose label starts with the key */
      const k = e.key.toLowerCase()
      const from = open ? cursor + 1 : 0
      const idx = [...rows.slice(from), ...rows.slice(0, from)]
        .findIndex((o) => (o.label ?? o.value).toLowerCase().startsWith(k))
      if (idx >= 0) {
        const at = (from + idx) % rows.length
        if (open) setCursor(at); else pick(rows[at].value)
      }
    }
  }

  return (
    <div ref={ref} className={`relative ${className}`}>
      {name && <input type="hidden" name={name} value={value} />}
      <button type="button" role="combobox" aria-haspopup="listbox" aria-expanded={open} disabled={disabled} onKeyDown={onKey}
        aria-label={ghost ? label : undefined}
        onClick={() => (open ? setOpen(false) : openAt())}
        className={`relative flex w-full items-center rounded-[6px] border text-left ${FOCUS_RING} ${h} ${ring} ${ghost ? '' : 'bg-white'}
          ${disabled ? 'cursor-default bg-grow-ink/5' : ''}`}>
        {label && !ghost && <FloatingLabel label={label} required={required} floated={floated} error={!!error} active={open} />}
        <span className={`min-w-0 flex-1 truncate px-[14px] text-[15px] ${selected ? (disabled ? 'text-grow-ink-3' : 'text-grow-ink') : 'text-grow-ink-3'}`}>
          {selected ? (selected.label ?? selected.value) : (placeholder ?? ' ')}
        </span>
        <ChevronDown size={ghost ? 18 : 22} className={`mr-2 shrink-0 text-grow-ink-2 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div ref={listRef} role="listbox"
          className="absolute left-0 top-full z-40 mt-1 max-h-[320px] w-full min-w-[180px] overflow-y-auto rounded-[6px] bg-white py-1 shadow-grow-menu">
          {rows.map((o, i) => {
            const on = o.value === value
            const empty = o.value === ''
            return (
              <button key={o.value || '__empty'} type="button" role="option" aria-selected={on} data-cursor={i === cursor ? '1' : undefined}
                onMouseEnter={() => setCursor(i)} onClick={() => pick(o.value)}
                className={`flex h-[40px] w-full items-center gap-2 px-[14px] text-left text-[15px] transition-colors
                  ${on ? 'bg-grow-accent-2/10 font-medium text-grow-accent-2' : empty ? 'text-grow-ink-3' : 'text-grow-ink'}
                  ${i === cursor && !on ? 'bg-grow-ink/5' : ''}`}>
                <span className="min-w-0 flex-1 truncate">{o.label ?? o.value}</span>
                {on && <Check size={16} className="shrink-0" />}
              </button>
            )
          })}
          {rows.length === 0 && <p className="px-[14px] py-3 text-[13px] text-grow-ink-3">No options.</p>}
        </div>
      )}
      <HelperLine helper={helper} error={error} />
    </div>
  )
}

/* ------------------------------------------------------------ multi select ---- */

export interface MultiOption {
  value: string; label?: string; count?: number
  /** Optional section header: consecutive options with the same group share one. */
  group?: string
}

/** The checkbox rows shared by MultiSelect's popup and Advanced Filters' right pane. */
function OptionRows({ options, picked, onToggle, focusIndex }: {
  options: MultiOption[]; picked: string[]; onToggle: (v: string) => void; focusIndex?: number
}) {
  return (
    <>
      {options.map((o, i) => (
        <div key={o.value}>
        {o.group && o.group !== options[i - 1]?.group && (
          <p className="px-3 pb-0.5 pt-2 text-[11px] font-semibold uppercase tracking-[0.4px] text-grow-ink-3">{o.group}</p>
        )}
        <button type="button" role="option" aria-selected={picked.includes(o.value)}
          onClick={(e) => { e.stopPropagation(); onToggle(o.value) }}
          className={`flex w-full items-center gap-1 px-2 py-0.5 text-left text-[13px] text-grow-ink transition-colors hover:bg-grow-ink/5 ${FOCUS_RING}
            ${focusIndex === i ? 'bg-grow-accent-2/10' : ''}`}>
          <Checkbox checked={picked.includes(o.value)} onChange={() => onToggle(o.value)} ariaLabel={o.label ?? o.value} />
          <span className="min-w-0 flex-1 truncate">{o.label ?? o.value}</span>
          {o.count !== undefined && <span className="shrink-0 pr-1 text-[11px] text-grow-ink-3">{o.count}</span>}
        </button>
        </div>
      ))}
      {options.length === 0 && <p className="px-4 py-3 text-[13px] text-grow-ink-3">No values.</p>}
    </>
  )
}

/**
 * The portal's MUI `Select multiple`: an outlined field with the floating notched
 * label that opens an anchored checkbox list. The field shows the picked values
 * as chips with a "+n" overflow and a clear ✕ — never a native <select>.
 */
export function MultiSelect({ label, value, options, onChange, placeholder = 'All', size = 'sm', className = '', maxChips = 2 }: {
  label?: string; value: string[]; options: MultiOption[]; onChange: (v: string[]) => void
  placeholder?: string; size?: 'sm' | 'md'; className?: string; maxChips?: number
}) {
  const [open, setOpen] = useState(false)
  const [cursor, setCursor] = useState(0)
  const ref = useOutside(() => setOpen(false))

  useEscapeKey(open, () => setOpen(false))

  const toggle = (v: string) => onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v])
  const labelOf = (v: string) => options.find((o) => o.value === v)?.label ?? v
  const shown = value.slice(0, maxChips)
  const h = size === 'sm' ? 'h-[40px]' : 'h-[56px]'

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (!open) { setOpen(true); return }
      setCursor((c) => (c + (e.key === 'ArrowDown' ? 1 : options.length - 1)) % Math.max(1, options.length))
    } else if (open && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault()
      const o = options[cursor]
      if (o) toggle(o.value)
    }
  }

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button type="button" aria-haspopup="listbox" aria-expanded={open} onKeyDown={onKey}
        onClick={() => { setOpen((v) => !v); setCursor(0) }}
        className={`relative flex w-full items-center gap-1 rounded-[6px] border bg-white pl-[10px] pr-1 text-left transition-colors ${FOCUS_RING} ${h}
          ${open ? 'border-2 border-grow-accent-2' : 'border-grow-outline hover:border-grow-ink'}`}>
        {label && (
          <span className={`pointer-events-none absolute -top-[8px] left-[10px] z-10 bg-white px-1 text-[12px]
            ${open ? 'text-grow-accent-2' : 'text-grow-ink-2'}`}>{label}</span>
        )}
        <span className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden">
          {value.length === 0
            ? <span className="truncate text-[13px] text-grow-ink-3">{placeholder}</span>
            : (
              <>
                {shown.map((v) => (
                  <span key={v} className="inline-flex h-[22px] max-w-[120px] shrink-0 items-center truncate rounded-full bg-grow-ink/[0.08] px-2 text-[11px] font-medium text-grow-ink">
                    {labelOf(v)}
                  </span>
                ))}
                {value.length > shown.length && (
                  <span className="shrink-0 text-[11px] font-semibold text-grow-ink-2">+{value.length - shown.length}</span>
                )}
              </>
            )}
        </span>
        {value.length > 0 && (
          <span role="button" tabIndex={-1} aria-label={`Clear ${label ?? 'selection'}`}
            onClick={(e) => { e.stopPropagation(); onChange([]) }}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-grow-ink-2 hover:bg-grow-ink/5">
            <X size={14} />
          </span>
        )}
        <ChevronDown size={20} className="shrink-0 text-grow-ink-2" />
      </button>
      {open && (
        <div role="listbox" aria-multiselectable
          className="absolute left-0 top-full z-40 mt-1 max-h-[300px] w-full min-w-[220px] overflow-y-auto rounded-[6px] bg-white py-1 shadow-grow-menu">
          <OptionRows options={options} picked={value} onToggle={toggle} focusIndex={cursor} />
        </div>
      )}
    </div>
  )
}

/* --------------------------------------------------------------- search box ---- */

export function SearchBox({ value, onChange, placeholder = 'Search...', width = 'w-[360px]', icon, pill = false }: {
  value: string; onChange: (v: string) => void; placeholder?: string; width?: string; icon: ReactNode
  /** Fully rounded, as the console's Orders-page search. */
  pill?: boolean
}) {
  return (
    <div className={`flex h-[38px] items-center gap-1.5 ${pill ? 'rounded-full pl-3' : 'rounded-[6px]'} border border-grow-outline bg-white pl-2 pr-1 ${width}`}>
      <span className="text-grow-ink-2 [&>svg]:h-[20px] [&>svg]:w-[20px]">{icon}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className="min-w-0 flex-1 bg-transparent text-[13px] text-grow-ink outline-none placeholder:text-grow-ink-2" />
      {value && (
        <button type="button" onClick={() => onChange('')} className="flex h-7 w-7 items-center justify-center rounded-full text-grow-ink-2 hover:bg-grow-ink/5">
          <X size={16} />
        </button>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------- chip ---- */

export type ChipTone = 'success' | 'info' | 'warning' | 'error' | 'primary' | 'neutral'
const CHIP: Record<ChipTone, string> = {
  success: 'border-grow-success bg-grow-success/10 text-[#3E9500]',
  info: 'border-grow-info bg-grow-info/10 text-[#0E86C4]',
  warning: 'border-grow-warning bg-grow-warning/10 text-[#B57F00]',
  error: 'border-grow-error bg-grow-error/10 text-grow-error',
  primary: 'border-grow-primary bg-grow-primary/10 text-grow-primary',
  neutral: 'border-grow-ink-3 bg-grow-ink/5 text-grow-ink-2',
}
export function Chip({ children, tone = 'neutral', className = '' }: { children: ReactNode; tone?: ChipTone; className?: string }) {
  return (
    <span className={`inline-flex h-[24px] shrink-0 items-center whitespace-nowrap rounded-full border px-[10px] text-[11px] font-semibold leading-none tracking-[0.15px] ${CHIP[tone]} ${className}`}>
      {children}
    </span>
  )
}

/* ------------------------------------------------------------------- card ---- */

export function Card({ children, className = '', padded = true, cardRef }: {
  children: ReactNode; className?: string; padded?: boolean
  /** Lets a page measure the card — the selection popup anchors against it. */
  cardRef?: Ref<HTMLDivElement>
}) {
  return (
    <div ref={cardRef} className={`rounded-[6px] border border-grow-line bg-white ${padded ? 'p-5' : ''} ${className}`}>{children}</div>
  )
}

/* ------------------------------------------------------------- page title ---- */

export function PageTitle({ title, subtitle, right }: { title: string; subtitle?: string; right?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-[24px] font-medium leading-[1.33] text-grow-ink">{title}</h1>
        {subtitle && <p className="mt-0.5 text-[14px] text-grow-ink-2">{subtitle}</p>}
      </div>
      {right}
    </div>
  )
}

/* ------------------------------------------------------ add | upload split ---- */

/**
 * The console Orders page's "Add | upload" split, outlined in Grow's coral:
 * the main half creates one record, the icon half opens the bulk upload.
 */
export function AddUploadSplit({ label, onAdd, onUpload, uploadTitle = 'Bulk upload', icon, disabled, disabledTitle, menu }: {
  label: string; onAdd: () => void
  /** Optional create variants — adds a ▾ half that opens them (e.g. Create FTL Consignment). */
  menu?: { label: string; onClick: () => void }[]
  /** Omit for a create-only page: the control keeps the same outline, without the upload half. */
  onUpload?: () => void
  uploadTitle?: string; icon?: ReactNode
  disabled?: boolean; disabledTitle?: string
}) {
  const tone = disabled ? 'border-grow-ink/15 text-grow-ink-3' : 'border-grow-accent-2 text-grow-accent-2'
  const hover = disabled ? 'cursor-not-allowed' : 'hover:bg-grow-accent-2/5'
  const [open, setOpen] = useState(false)
  const ref = useOutside(() => setOpen(false))
  useEscapeKey(open, () => setOpen(false))
  return (
    <div className="flex shrink-0 items-center gap-2">
    <div ref={ref} className="relative shrink-0">
    <div title={disabled ? disabledTitle : undefined}
      className={`inline-flex h-[38px] shrink-0 items-stretch overflow-hidden rounded-[6px] border bg-white ${tone}`}>
      <button type="button" onClick={disabled ? undefined : onAdd} disabled={disabled}
        className={`inline-flex items-center gap-1.5 pl-3 pr-3.5 text-[14px] font-medium tracking-[0.3px] transition-colors ${hover} ${FOCUS_RING}`}>
        {icon ?? <Package size={17} />}{label}
      </button>
      {menu && menu.length > 0 && (
        <>
          <span className={`w-px self-stretch ${disabled ? 'bg-grow-ink/15' : 'bg-grow-accent-2'}`} />
          <button type="button" onClick={disabled ? undefined : () => setOpen((v) => !v)} disabled={disabled}
            aria-haspopup="menu" aria-expanded={open} aria-label={`More ${label} options`}
            className={`inline-flex w-[32px] items-center justify-center transition-colors ${hover} ${FOCUS_RING}`}>
            <ChevronDown size={17} />
          </button>
        </>
      )}
    </div>
    {open && menu && (
      <div role="menu" className="absolute right-0 top-[42px] z-40 min-w-[220px] rounded-[6px] bg-white py-1 shadow-grow-menu">
        {menu.map((m) => (
          <button key={m.label} type="button" role="menuitem" onClick={() => { setOpen(false); m.onClick() }}
            className={`flex h-[40px] w-full items-center px-4 text-left text-[15px] text-grow-ink transition-colors hover:bg-grow-ink/5 ${FOCUS_RING}`}>
            {m.label}
          </button>
        ))}
      </div>
    )}
    </div>
    {/* upload is its OWN button (owner, 2026-09-23) — not a half of the split */}
    {onUpload && (
      <button type="button" onClick={disabled ? undefined : onUpload} disabled={disabled} aria-label={uploadTitle} title={uploadTitle}
        className={`inline-flex h-[38px] w-[40px] shrink-0 items-center justify-center rounded-[6px] border bg-white transition-colors ${tone} ${hover} ${FOCUS_RING}`}>
        <Upload size={17} />
      </button>
    )}
    </div>
  )
}

/* ------------------------------------------------------------ column chooser ---- */

/**
 * The table toolbar's columns control (staging's ⚙ columns icon): a popover of
 * checkboxes in the grid's column order, plus "Reset to default". The caller
 * owns persistence (`useColumnPrefs`).
 */
export function ColumnChooser({ columns, visible, onChange, onReset }: {
  columns: { key: string; label: string }[]; visible: string[]
  onChange: (v: string[]) => void; onReset: () => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useOutside(() => setOpen(false))
  useEscapeKey(open, () => setOpen(false))
  const toggle = (k: string) => {
    const on = visible.includes(k)
    if (on && visible.length === 1) return      // never an empty grid
    /* keep the grid's own order, whatever order the ticks happen in */
    onChange(columns.map((c) => c.key).filter((x) => (x === k ? !on : visible.includes(x))))
  }
  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-label="Choose columns" title="Choose columns"
        aria-haspopup="dialog" aria-expanded={open}
        className={`flex h-8 w-8 items-center justify-center rounded-[6px] transition-colors ${FOCUS_RING}
          ${open ? 'bg-grow-accent-2/10 text-grow-accent-2' : 'text-grow-ink-2 hover:bg-grow-ink/5 hover:text-grow-ink'}`}>
        <Columns3Cog size={18} />
      </button>
      {open && (
        <div className="absolute right-0 top-[38px] z-40 w-[260px] overflow-hidden rounded-[6px] bg-white text-left shadow-grow-menu">
          <div className="flex items-center justify-between border-b border-grow-line px-3 py-2">
            <span className="text-[13px] font-semibold normal-case tracking-normal text-grow-ink">Columns · {visible.length}</span>
            <button type="button" onClick={onReset} className="text-[12px] font-semibold normal-case tracking-normal text-grow-accent-2 hover:underline">Reset to default</button>
          </div>
          <div className="max-h-[340px] overflow-y-auto py-1 normal-case tracking-normal">
            <OptionRows options={columns.map((c) => ({ value: c.key, label: c.label }))} picked={visible} onToggle={toggle} />
          </div>
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------- list footer ---- */

/**
 * The console Orders page's page-level footer: `20 / Page` on the left, the
 * page buttons centred, Refresh on the right. (GridFooter is the MUI in-card
 * footer the other Grow tables keep.)
 */
export function ListFooter({ page, pageSize, total, onPage, onPageSize, onRefresh, sizes = [10, 20, 50, 100] }: {
  page: number; pageSize: number; total: number; onPage: (p: number) => void; onPageSize: (n: number) => void
  onRefresh: () => void; sizes?: number[]
}) {
  const [open, setOpen] = useState(false)
  const ref = useOutside(() => setOpen(false))
  useEscapeKey(open, () => setOpen(false))
  const last = Math.max(0, Math.ceil(total / pageSize) - 1)
  /* at most 7 buttons: first, last, and a window round the current page */
  const pages = [...new Set([0, last, page - 1, page, page + 1].filter((p) => p >= 0 && p <= last))].sort((a, b) => a - b)
  const arrow = `flex h-8 w-8 items-center justify-center rounded-[6px] text-grow-ink-2 transition-colors hover:bg-grow-ink/5 disabled:cursor-not-allowed disabled:text-grow-ink-3 disabled:hover:bg-transparent ${FOCUS_RING}`
  return (
    <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-4 text-[13px] text-grow-ink">
      <div ref={ref} className="relative justify-self-start">
        <button type="button" onClick={() => setOpen((v) => !v)} aria-haspopup="listbox" aria-expanded={open}
          className={`inline-flex h-[34px] items-center gap-1.5 rounded-[6px] border border-grow-outline bg-white px-3 hover:border-grow-ink ${FOCUS_RING}`}>
          {pageSize} / Page<ChevronDown size={15} className="text-grow-ink-2" />
        </button>
        {open && (
          <div role="listbox" className="absolute bottom-full left-0 z-40 mb-1 w-full min-w-[110px] rounded-[6px] bg-white py-1 shadow-grow-menu">
            {sizes.map((n) => (
              <button key={n} type="button" role="option" aria-selected={n === pageSize}
                onClick={() => { onPageSize(n); setOpen(false) }}
                className={`block w-full px-3 py-1.5 text-left hover:bg-grow-ink/5 ${n === pageSize ? 'font-semibold text-grow-accent-2' : ''}`}>{n} / Page</button>
            ))}
          </div>
        )}
      </div>
      <nav className="flex items-center gap-1" aria-label="Pagination">
        <button type="button" className={arrow} disabled={page === 0} onClick={() => onPage(page - 1)} aria-label="Previous page">‹</button>
        {pages.map((p, i) => (
          <span key={p} className="flex items-center gap-1">
            {i > 0 && p - pages[i - 1] > 1 && <span className="px-1 text-grow-ink-3">…</span>}
            <button type="button" onClick={() => onPage(p)} aria-current={p === page ? 'page' : undefined}
              className={`h-8 min-w-8 rounded-[6px] border px-2 transition-colors ${FOCUS_RING}
                ${p === page ? 'border-grow-accent-2 bg-grow-accent-2/[0.08] font-semibold text-grow-accent-2' : 'border-transparent text-grow-ink-2 hover:bg-grow-ink/5'}`}>{p + 1}</button>
          </span>
        ))}
        <button type="button" className={arrow} disabled={page >= last} onClick={() => onPage(page + 1)} aria-label="Next page">›</button>
      </nav>
      <button type="button" onClick={onRefresh}
        className={`inline-flex h-[34px] items-center gap-1.5 justify-self-end rounded-[6px] border border-grow-outline bg-white px-3 text-grow-ink-2 hover:border-grow-ink hover:text-grow-ink ${FOCUS_RING}`}>
        <RefreshCw size={15} />Refresh
      </button>
    </div>
  )
}

/* ---------------------------------------------------------- grid footer ---- */

export function GridFooter({ page, pageSize, total, onPage, onPageSize }: {
  page: number; pageSize: number; total: number; onPage: (p: number) => void; onPageSize: (n: number) => void
}) {
  const from = total === 0 ? 0 : page * pageSize + 1
  const to = Math.min(total, (page + 1) * pageSize)
  const last = Math.max(0, Math.ceil(total / pageSize) - 1)
  return (
    <div className="flex h-[50px] items-center justify-end gap-6 border-t border-[#E7E6E8] px-3 text-[14px] text-grow-ink">
      <label className="flex items-center gap-2">
        <span>Rows per page:</span>
        <span className="relative">
          <select value={pageSize} onChange={(e) => onPageSize(Number(e.target.value))}
            className="appearance-none bg-transparent py-1 pl-1 pr-6 text-[14px] outline-none">
            {[10, 25, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
          <ChevronDown size={16} className="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 text-grow-ink-2" />
        </span>
      </label>
      <span>{from}–{to} of {total}</span>
      <span className="flex items-center">
        <button type="button" disabled={page === 0} onClick={() => onPage(page - 1)} aria-label="Previous page"
          className={`flex h-8 w-8 items-center justify-center rounded-full text-grow-ink-2 transition-colors hover:bg-grow-ink/5 disabled:cursor-not-allowed disabled:text-grow-ink-3 disabled:hover:bg-transparent ${FOCUS_RING}`}>‹</button>
        <button type="button" disabled={page >= last} onClick={() => onPage(page + 1)} aria-label="Next page"
          className={`flex h-8 w-8 items-center justify-center rounded-full text-grow-ink-2 transition-colors hover:bg-grow-ink/5 disabled:cursor-not-allowed disabled:text-grow-ink-3 disabled:hover:bg-transparent ${FOCUS_RING}`}>›</button>
      </span>
    </div>
  )
}

/* ---------------------------------------------------------------- stepper ---- */

export function Stepper({ steps, active }: { steps: string[]; active: number }) {
  return (
    <ol className="mb-8 flex items-center">
      {steps.map((s, i) => {
        const done = i < active, on = i === active
        return (
          <li key={s} className={`flex items-center ${i < steps.length - 1 ? 'flex-1' : ''}`}>
            <span className={`flex h-[32px] w-[32px] shrink-0 items-center justify-center rounded-full text-[14px] font-medium
              ${done || on ? 'bg-grow-accent-2 text-white' : 'bg-grow-ink-3 text-white'}`}>
              {done ? <Check size={18} strokeWidth={3} /> : i + 1}
            </span>
            <span className="ml-3 whitespace-nowrap text-[16px] text-grow-ink">{s}</span>
            {i < steps.length - 1 && <span className="mx-3 h-px flex-1 bg-grow-ink/25" />}
          </li>
        )
      })}
    </ol>
  )
}

/* --------------------------------------------------------------- tab strip ---- */

/** MUI Tabs: 48px rail, coral active label + 2px indicator, count pill per tab. */
export function TabStrip({ tabs, active, counts, icons, onChange }: {
  tabs: readonly string[]; active: string; counts?: Record<string, number>
  /** Optional per-tab lucide icon — 16px, `currentColor`, so it goes coral with the label. */
  icons?: Record<string, LucideIcon | undefined>
  onChange: (t: string) => void
}) {
  return (
    <div className="mb-4 flex items-end gap-1 overflow-x-auto border-b border-grow-line [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {tabs.map((t) => {
        const on = t === active
        const n = counts?.[t]
        const Icon = icons?.[t]
        return (
          <button key={t} type="button" onClick={() => onChange(t)} role="tab" aria-selected={on}
            className={`relative flex h-[48px] shrink-0 items-center gap-2 px-4 text-[15px] font-medium tracking-[0.3px] transition-colors
              ${FOCUS_RING} ${on ? 'text-grow-accent-2' : 'text-grow-ink-2 hover:text-grow-ink'}`}>
            {Icon && <Icon size={16} className="shrink-0" />}
            {t}
            {n !== undefined && (
              <span className={`inline-flex h-[20px] min-w-[20px] items-center justify-center rounded-full px-1.5 text-[11px] font-bold
                ${on ? 'bg-grow-accent-2/15 text-grow-accent-2' : 'bg-grow-ink/[0.08] text-grow-ink-2'}`}>{n}</span>
            )}
            {on && <span className="absolute inset-x-0 bottom-0 h-[2px] rounded-t bg-grow-accent-2" />}
          </button>
        )
      })}
    </div>
  )
}

/* ------------------------------------------------------------------- sheet ---- */

/** Right-side drawer (MUI temporary Drawer): scrim + 460px panel + sticky footer. */
/**
 * Right-hand drawer. `onBack` turns the header into a two-step header — a second
 * step REPLACES the content of this sheet instead of stacking another scrim.
 */
export function Sheet({ open, title, subtitle, onClose, onBack, children, footer, width = 'w-[460px]' }: {
  open: boolean; title: string; subtitle?: string; onClose: () => void; onBack?: () => void
  children: ReactNode; footer?: ReactNode; width?: string
}) {
  useEscapeKey(open, onClose)
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-[rgba(58,53,65,0.5)]" onClick={onClose} />
      <aside className={`relative flex h-full max-w-full flex-col bg-white shadow-grow-menu ${width}`}>
        <header className="flex items-start justify-between gap-4 border-b border-grow-line px-6 py-4">
          <div className="flex min-w-0 items-start gap-2">
            {onBack && (
              <button type="button" onClick={onBack} aria-label="Back"
                className="-ml-2 mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-grow-ink-2 hover:bg-grow-ink/5"><ArrowLeft size={20} /></button>
            )}
            <div className="min-w-0">
            <h2 className="text-[20px] font-medium leading-snug text-grow-ink">{title}</h2>
            {subtitle && <p className="mt-0.5 text-[13px] text-grow-ink-2">{subtitle}</p>}
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close"
            className="-mr-2 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-grow-ink-2 hover:bg-grow-ink/5"><X size={20} /></button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">{children}</div>
        {footer && <div className="flex items-center justify-end gap-3 border-t border-grow-line px-6 py-4">{footer}</div>}
      </aside>
    </div>
  )
}

/**
 * Centred modal — the portal's own dialog chrome (12px radius, ⊗ top-right,
 * right-aligned footer). `Sheet` is the side drawer; this is for forms the
 * merchant fills in one go.
 */
export function Dialog({ open, title, subtitle, onClose, children, footer, width = 'w-[700px]' }: {
  open: boolean; title: string; subtitle?: string; onClose: () => void
  children: ReactNode; footer?: ReactNode; width?: string
}) {
  useEscapeKey(open, onClose)
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-[rgba(58,53,65,0.5)]" onClick={onClose} />
      <div className={`relative flex max-h-[90vh] max-w-full flex-col overflow-hidden rounded-[12px] bg-white shadow-grow-menu ${width}`}>
        <header className="flex items-start justify-between gap-4 px-6 pb-3 pt-6">
          <div className="min-w-0">
            <h2 className="text-[20px] font-medium leading-snug text-grow-ink">{title}</h2>
            {subtitle && <p className="mt-1 text-[14px] leading-snug text-grow-ink-2">{subtitle}</p>}
          </div>
          <button type="button" onClick={onClose} aria-label="Close"
            className="-mr-2 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-grow-ink-2 hover:bg-grow-ink/5"><X size={22} /></button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-5 pt-1">{children}</div>
        {footer && <div className="flex items-center justify-end gap-3 px-6 pb-6 pt-3">{footer}</div>}
      </div>
    </div>
  )
}

/** A collapsible "More details" block — extra fields that must not crowd the dialog. */
export function Disclosure({ label, open, onToggle, children }: {
  label: string; open: boolean; onToggle: () => void; children: ReactNode
}) {
  return (
    <div>
      <button type="button" onClick={onToggle}
        className="-ml-1 inline-flex items-center gap-1 rounded px-1 py-1 text-[14px] font-medium text-grow-accent-2 hover:underline">
        {label}
        <ChevronDown size={17} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <div className="mt-3">{children}</div>}
    </div>
  )
}

/* -------------------------------------------------------- advanced filters ---- */

export interface FilterDef {
  key: string; label: string; options?: string[]; kind?: 'options' | 'dateRange'
  /** dateRange only — field labels, defaulting to the Orders page's Created from/to. */
  fromLabel?: string; toLabel?: string
}

/**
 * Two-pane multi-select filter panel — the console's Advanced Filters grammar
 * rebuilt on Materio tokens: dimensions left, values right, Apply / Clear all.
 * `values[key]` is a list of picked values; a `dateRange` dimension stores
 * `[from, to]` as local ISO `YYYY-MM-DDTHH:mm`, so callers that filter by DAY
 * must compare on `datePart()`.
 */
export function AdvancedFilters({ defs, values, onChange, onClearAll, compact = false }: {
  defs: FilterDef[]; values: Record<string, string[]>
  onChange: (key: string, vals: string[]) => void; onClearAll: () => void
  /** Icon-only funnel trigger, as on the console's Orders page. */
  compact?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [activeKey, setActiveKey] = useState(defs[0]?.key ?? '')
  const [q, setQ] = useState('')
  const ref = useOutside(() => setOpen(false))
  if (!defs.length) return null
  const count = defs.filter((d) => (values[d.key] ?? []).some(Boolean)).length
  const active = defs.find((d) => d.key === activeKey) ?? defs[0]
  const picked = values[active.key] ?? []
  const shown = (active.options ?? []).filter((o) => o.toLowerCase().includes(q.trim().toLowerCase()))
  const toggle = (v: string) => onChange(active.key, picked.includes(v) ? picked.filter((x) => x !== v) : [...picked, v])

  return (
    <div ref={ref} className="relative shrink-0">
      {compact ? (
        <button type="button" onClick={() => setOpen((v) => !v)} aria-label="Advanced Filters" title="Advanced Filters"
          className={`relative inline-flex h-[38px] w-[38px] items-center justify-center rounded-[6px] border transition-colors ${FOCUS_RING}
            ${open || count ? 'border-grow-accent-2 bg-grow-accent-2/[0.08] text-grow-accent-2' : 'border-grow-accent-2 text-grow-accent-2 hover:bg-grow-accent-2/5'}`}>
          <ListFilter size={18} />
          {count > 0 && <span className="absolute -right-1.5 -top-1.5 inline-flex h-[16px] min-w-[16px] items-center justify-center rounded-full bg-grow-accent-2 px-1 text-[10px] font-bold text-white">{count}</span>}
        </button>
      ) : (
        <button type="button" onClick={() => setOpen((v) => !v)}
          className={`inline-flex h-[38px] items-center gap-2 rounded-[5px] border px-3 text-[13px] font-medium tracking-[0.3px] transition-colors ${FOCUS_RING}
            ${open || count ? 'border-grow-accent-2 bg-grow-accent-2/[0.08] text-grow-accent-2' : 'border-grow-outline text-grow-ink-2 hover:bg-grow-ink/5'}`}>
          <SlidersHorizontal size={17} />Advanced Filters
          {count > 0 && <span className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-grow-accent-2 px-1 text-[10px] font-bold text-white">{count}</span>}
        </button>
      )}
      {open && (
        <div className="absolute left-0 top-[44px] z-40 w-[440px] overflow-hidden rounded-[6px] bg-white shadow-grow-menu">
          <div className="flex h-[280px]">
            <div className="w-[160px] shrink-0 overflow-y-auto border-r border-grow-line bg-grow-thead py-1">
              {defs.map((d) => {
                const n = (values[d.key] ?? []).filter(Boolean).length
                const on = d.key === active.key
                return (
                  <button key={d.key} type="button" onClick={() => { setActiveKey(d.key); setQ('') }}
                    className={`flex w-full items-center justify-between gap-2 px-3.5 py-2 text-left text-[13px] transition-colors ${FOCUS_RING}
                      ${on ? 'bg-grow-accent-2/10 font-semibold text-grow-accent-2' : 'text-grow-ink-2 hover:bg-grow-ink/5'}`}>
                    <span className="truncate">{d.label}</span>
                    {n > 0 && <span className="inline-flex h-[16px] min-w-[16px] shrink-0 items-center justify-center rounded-full bg-grow-accent-2 px-1 text-[10px] font-bold text-white">{n}</span>}
                  </button>
                )
              })}
            </div>
            <div className="flex min-w-0 flex-1 flex-col">
              {active.kind === 'dateRange' ? (
                /* the same range control the pickup window uses — each end bounds
                   the other, so an inverted range cannot be chosen at all */
                <div className="p-4">
                  <DateRangePicker stacked from={picked[0] ?? ''} to={picked[1] ?? ''}
                    fromLabel={active.fromLabel ?? 'Created from'} toLabel={active.toLabel ?? 'Created to'}
                    onChange={(v) => onChange(active.key, [v.from, v.to])} />
                </div>
              ) : (
                <>
                  <div className="border-b border-grow-line p-2">
                    <div className="flex h-[34px] items-center gap-1.5 rounded-[5px] border border-grow-outline px-2">
                      <Search size={15} className="text-grow-ink-2" />
                      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${active.label.toLowerCase()}`}
                        className="min-w-0 flex-1 bg-transparent text-[13px] text-grow-ink outline-none placeholder:text-grow-ink-3" />
                    </div>
                  </div>
                  {/* same option rows as MultiSelect's popup — one list grammar everywhere */}
                  <div className="flex-1 overflow-y-auto py-1">
                    <OptionRows options={shown.map((o) => ({ value: o }))} picked={picked} onToggle={toggle} />
                  </div>
                </>
              )}
            </div>
          </div>
          <div className="flex items-center justify-between border-t border-grow-line px-3 py-2.5">
            <Btn variant="text" color="neutral" size="sm" onClick={onClearAll}>Clear all</Btn>
            <span className="flex items-center gap-3">
              <span className="text-[12px] text-grow-ink-3">{count} filter{count === 1 ? '' : 's'} active</span>
              <Btn color="accent2" size="sm" onClick={() => setOpen(false)}>Apply</Btn>
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * The filter line's date range, as the console's Orders page draws it:
 * `start → end` with a calendar glyph, 38px like the line's other controls. It
 * opens the SAME stacked range pane Advanced Filters uses. Values are local ISO
 * `YYYY-MM-DDTHH:mm`; callers filtering by DAY compare on `datePart()`.
 */
export function DateRangeFilter({ from, to, onChange, label = 'Created', width = 'w-[244px]' }: {
  from: string; to: string; onChange: (v: { from: string; to: string }) => void; label?: string; width?: string
}) {
  const [open, setOpen] = useState(false)
  const ref = useOutside(() => setOpen(false))
  useEscapeKey(open, () => setOpen(false))
  const set = !!(from || to)
  const end = (at: string, ph: string) => (
    <span className={`min-w-0 flex-1 truncate ${at ? 'text-grow-ink' : 'text-grow-ink-3'}`}>{at ? at.slice(0, 10) : ph}</span>
  )
  return (
    <div ref={ref} className={`relative shrink-0 ${width}`}>
      <button type="button" aria-haspopup="dialog" aria-expanded={open} aria-label={`${label} date range`}
        onClick={() => setOpen((v) => !v)}
        className={`group flex h-[38px] w-full items-center gap-2 rounded-[6px] border bg-white px-3 text-left text-[13px] transition-colors ${FOCUS_RING}
          ${open ? 'border-grow-accent-2' : 'border-grow-outline hover:border-grow-ink'}`}>
        {end(from, 'Start date')}
        <ArrowRight size={14} className="shrink-0 text-grow-ink-3" />
        {end(to, 'End date')}
        {set ? (
          <span role="button" tabIndex={-1} aria-label={`Clear ${label}`}
            onClick={(e) => { e.stopPropagation(); onChange({ from: '', to: '' }) }}
            className="-mr-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-grow-ink-2 hover:bg-grow-ink/5">
            <X size={14} />
          </span>
        ) : <CalendarDays size={16} className="shrink-0 text-grow-ink-3" />}
      </button>
      {open && (
        <div className="absolute left-0 top-[44px] z-40 w-[300px] rounded-[6px] bg-white p-4 shadow-grow-menu">
          <DateRangePicker stacked from={from} to={to} fromLabel={`${label} from`} toLabel={`${label} to`} onChange={onChange} />
        </div>
      )}
    </div>
  )
}

/** Only offered once something is applied — matches the console's Clear Filters control. */
export function ClearFilters({ onClick, active }: { onClick: () => void; active: boolean }) {
  if (!active) return null
  return (
    <button type="button" onClick={onClick}
      className={`inline-flex h-[38px] shrink-0 items-center rounded-[5px] px-2.5 text-[13px] font-semibold text-grow-accent-2 transition-colors hover:bg-grow-accent-2/5 ${FOCUS_RING}`}>
      Clear Filters
    </button>
  )
}

/* -------------------------------------------------------- selection popup ---- */

export interface SelectionAction {
  label: string; icon: ReactNode; onClick?: () => void
  disabled?: boolean; tooltip?: string
  /** The one action the merchant is most likely to want — coral. */
  primary?: boolean
  /** Destructive — rendered last, in the error colour. */
  danger?: boolean
}

/**
 * Floating bulk-action panel, the console's SelectionPanel in the Grow look:
 * pinned to the right edge of its (relatively positioned) card and aligned with
 * the FIRST selected row, visible only while rows are selected. Plain text rows
 * — no buttons, borders or pills inside the card.
 */
export function SelectionPopup({ count, onClear, actions, anchorTop }: {
  count: number; onClear: () => void; actions: SelectionAction[]
  /** Distance from the card's top to the FIRST selected row, in px (the page measures it). */
  anchorTop?: number
}) {
  if (count === 0) return null
  const ordered = [...actions.filter((a) => !a.danger), ...actions.filter((a) => a.danger)]
  return (
    <div style={{ top: anchorTop ?? 56 }}
      className="absolute right-4 z-20 w-[248px] overflow-hidden rounded-xl border border-grow-line bg-white shadow-grow-menu">
      <div className="flex items-center justify-between border-b border-grow-line px-4 py-2.5">
        <span className="text-[13px] font-semibold text-grow-ink">{count} Selected</span>
        <button type="button" onClick={onClear} aria-label="Clear selection"
          className="text-grow-ink-3 hover:text-grow-ink"><X size={14} /></button>
      </div>
      <div className="flex flex-col py-1.5">
        {ordered.map((a) => (
          <button key={a.label} type="button" disabled={a.disabled}
            title={a.disabled ? a.tooltip : undefined}
            onClick={a.disabled ? undefined : a.onClick}
            className={`flex w-full items-center gap-2.5 px-4 py-2 text-left text-[15px] transition-colors ${FOCUS_RING}
              ${a.disabled ? 'cursor-not-allowed text-grow-ink-3'
                : a.danger ? 'text-grow-error hover:bg-grow-error/5'
                : a.primary ? 'font-medium text-grow-accent-2 hover:bg-grow-accent-2/5'
                : 'text-grow-ink hover:bg-grow-ink/[0.04]'}`}>
            <span className={a.disabled ? '' : a.danger || a.primary ? '' : 'text-grow-ink-2'}>{a.icon}</span>
            <span className="min-w-0 truncate">{a.label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
