/**
 * Form Builder v2 — the on-canvas field editor (owner, 2026-09-29, originally built inside
 * LocalConsignments/AddConsignmentV2.tsx, extracted 2026-10-04 so Grow's AddOrderPage can
 * consume the SAME engine and the SAME PartyBlock/AddressCard address layout).
 *
 * Two tenant-level settings live here, both layered over the base registry (fieldConfig.ts):
 *  - FormRulesV2 — per-field hidden / required / relabel / "More information" placement, edited
 *    live from AddConsignmentV2's "Edit consignment form" (the only place with an edit entry
 *    point; Grow only ever reads these passively — a merchant never edits).
 *  - AddressLayout — 'default' (Grow's own PartyFields grid) or 'builderV2' (this file's
 *    PartyBlock/AddressCard cards) for Ship From / Ship To / RTO, chosen by the tenant in the
 *    same editing bar.
 *
 * `useFormBuilderV2` is the engine: given a consumer's own field catalogue extensions (V2-only
 * fields, extra locks, extra "not requirable"/"default more" sets), it resolves hide/require/
 * relabel/disclosure for any key. Both AddConsignmentV2.tsx (full editing) and AddOrderPage.tsx
 * (merchantMode — passive, no editing) call it; `Builder` is exposed via BuilderCtx so FieldTools
 * / BuilderLabel / Configurable / PartyBlock / AddressCard (all defined once, here) work
 * identically in either file.
 */
import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'
import { ChevronDown, ChevronUp, Eye, EyeOff, Info, Lock, MapPinned, Pencil } from 'lucide-react'
import { DateInput, Input, MenuSelect } from '../../nueva/components'
import { PhoneInput } from '../../components/consignmentForm'
import type { Party } from '../../growOrders/types'
import {
  byKeyMandatory, CONSIGNMENT_FIELDS, fieldLabel, loadFieldConfig, loadFormBehavior,
  type FieldConfig, type FieldDef, type FormBehavior,
} from './fieldConfig'

/* ---------------------------------------------------------------- small primitives (private
   copies — AddConsignmentV2.tsx and AddOrderPage.tsx each already keep their own identical
   lists; PartyBlock/AddressCard need their own minimal field chrome, not either file's full one) */
export const COUNTRIES = ['Philippines', 'South Africa', 'Namibia', 'Botswana']
export const STATES = ['Eastern Cape', 'Free State', 'Gauteng', 'KwaZulu-Natal', 'Limpopo', 'Mpumalanga', 'North West', 'Northern Cape', 'Western Cape', 'Metro Manila', 'Laguna', 'Cebu', 'Iloilo']
export const POSTCODES = ['1000', '1105', '1300', '1600', '4000', '5000', '6000', '6014', '6015', '8000']
export const DIAL_CODES = ['+63', '+27', '+264', '+267', '+1', '+44', '+91']
export const filled = (v: string | undefined) => !!(v ?? '').trim()
interface Opt { value: string; label?: string }
const opts = (xs: readonly string[]): Opt[] => xs.map((value) => ({ value }))

/* ------------------------------------------------------------------- FormRulesV2 (field rules) */
export interface FieldRuleV2 {
  hidden?: boolean; required?: boolean; label?: string
  /** true = in its section's "More information" fold, false = in the main grid (absent = the default) */
  more?: boolean
}
export type FormRulesV2 = Record<string, FieldRuleV2>
export const FORM_RULES_V2_KEY = 'fe-consignment-form-v2-rules'
function asRules(raw: unknown): FormRulesV2 {
  const out: FormRulesV2 = {}
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!v || typeof v !== 'object') continue
    const r = v as Record<string, unknown>
    out[k] = {
      ...(typeof r.hidden === 'boolean' ? { hidden: r.hidden } : {}),
      ...(typeof r.required === 'boolean' ? { required: r.required } : {}),
      ...(typeof r.label === 'string' && r.label.trim() ? { label: r.label } : {}),
      ...(typeof r.more === 'boolean' ? { more: r.more } : {}),
    }
  }
  return out
}
function loadRulesV2(): FormRulesV2 { try { return asRules(JSON.parse(localStorage.getItem(FORM_RULES_V2_KEY) ?? '{}')) } catch { return {} } }
function saveRulesV2(r: FormRulesV2) { try { localStorage.setItem(FORM_RULES_V2_KEY, JSON.stringify(asRules(r))) } catch { /* private mode */ } }

/* --------------------------------------------------------------------- address layout choice */
export type AddressLayout = 'default' | 'builderV2'
export const ADDRESS_LAYOUT_KEY = 'fe-consignment-form-v2-address-layout'
function loadAddressLayout(): AddressLayout { try { return localStorage.getItem(ADDRESS_LAYOUT_KEY) === 'builderV2' ? 'builderV2' : 'default' } catch { return 'default' } }
function saveAddressLayout(v: AddressLayout) { try { localStorage.setItem(ADDRESS_LAYOUT_KEY, v) } catch { /* private mode */ } }

export const ADDRESS_LIFT: FieldDef = { key: 'addrLift', defaultLabel: 'Lift Available', section: 'Address details', tier: 'advanced', apiPath: 'address.liftAvailable' }
/** the base address fields that are grouped for visibility/rename purposes everywhere */
export const GROUP_KEYS = new Set(['addrLines23', 'addrCoordinates', 'addrFloorLift', 'addrWindow'])

/* --------------------------------------------------------------------------------- the engine */
export type FieldLock = 'system' | 'form' | null
export interface Builder {
  editing: boolean
  lock: (k: string) => FieldLock
  requirable: (k: string) => boolean
  /** hidden by its own rule (not only through its parent) */
  ownHidden: (k: string) => boolean
  isHidden: (k: string) => boolean
  /** the parent that hides it, if any */
  hiddenWith: (k: string) => string | null
  required: (k: string) => boolean
  /** in its section's "More information" fold (a required field never is) */
  inMore: (k: string) => boolean
  label: (k: string) => string
  set: (k: string, patch: FieldRuleV2) => void
  /** is this key in the field catalogue at all (BuilderLabel: unknown keys render as plain, locked text) */
  known: (k: string) => boolean
  /** can this key move to "More information" (FieldTools' More button) */
  movable: (k: string) => boolean
  /** grouped with neighbours — not individually renamable (BuilderLabel) */
  grouped: (k: string) => boolean
}
export const BuilderCtx = createContext<Builder | null>(null)
/** false until the first submit attempt — then every missing field says so */
export const ShowErrorsCtx = createContext(false)
/** a builder "required" rule applies to this key (and the field is shown) */
export function useRuleRequired(key?: string) {
  const b = useContext(BuilderCtx)
  return !!key && !!b?.required(key)
}
/** a red line that appears only after a submit attempt */
export function ErrLine({ children, className = '' }: { children: ReactNode; className?: string }) {
  return useContext(ShowErrorsCtx) ? <p className={`text-[12px] text-danger-fg ${className}`}>{children}</p> : null
}

export function useFormBuilderV2(options: {
  /** Grow (merchant): rules are always the saved ones + account-required layered on top; never edited here */
  merchantMode?: boolean
  /** this consumer's own extra configurable fields beyond the base registry (e.g. AddConsignmentV2's VAS/handling categories) */
  extraFields?: FieldDef[]
  /** keys this consumer's own checks need — never hideable, never optional, beyond the registry's system-mandatory ones */
  formLocked?: Set<string>
  /** keys that are switches/choices, not "requirable" values */
  notRequirable?: Set<string>
  /** keys that start in their section's "More information" fold */
  defaultMore?: Set<string>
  /** keys grouped with neighbours for visibility/rename (defaults to the base address GROUP_KEYS) */
  groupKeys?: Set<string>
  /** additional keys to exclude from the "More" toggle beyond mandatory/locked ones (e.g. SKU row fields) */
  movableExtra?: (k: string) => boolean
  /** forced-off keys regardless of rules (e.g. carrier/ops fields on a merchant portal) */
  forceHidden?: (k: string) => boolean
} = {}) {
  const {
    merchantMode = false, extraFields = [], formLocked = new Set<string>(), notRequirable = new Set<string>(),
    defaultMore = new Set<string>(), groupKeys = GROUP_KEYS, movableExtra, forceHidden,
  } = options
  const fieldDef = useMemo(
    () => new Map<string, FieldDef>([...CONSIGNMENT_FIELDS, ADDRESS_LIFT, ...extraFields].map((f) => [f.key, f])),
    [extraFields],
  )
  const [fieldCfg] = useState<FieldConfig>(loadFieldConfig)
  const [behavior] = useState<FormBehavior>(loadFormBehavior)
  const [savedRules, setSavedRules] = useState<FormRulesV2>(loadRulesV2)
  const [draftRules, setDraftRules] = useState<FormRulesV2>({})
  const [savedLayout, setSavedLayout] = useState<AddressLayout>(loadAddressLayout)
  const [draftLayout, setDraftLayout] = useState<AddressLayout>('default')
  const [editing, setEditing] = useState(false)
  const [showHidden, setShowHidden] = useState(true)

  /* a field customised on the console form (hidden · renamed · More · Required) is the same on
     Grow — the saved builder rules, plus the Form Fields tab's Grow-only Required */
  const merchantRules = useMemo<FormRulesV2>(() => {
    const out: FormRulesV2 = { ...savedRules }
    for (const k of behavior.required ?? []) if (!out[k]?.hidden) out[k] = { ...out[k], required: true }
    return out
  }, [savedRules, behavior])
  const rules = merchantMode ? merchantRules : editing ? draftRules : savedRules
  const addressLayout = merchantMode ? savedLayout : editing ? draftLayout : savedLayout

  const lockOf = (k: string): FieldLock => (byKeyMandatory(k) ? 'system' : formLocked.has(k) ? 'form' : null)
  const baseHidden = (k: string) => !!fieldCfg[k]?.hidden || behavior.hidden.includes(k)
  const ownHidden = (k: string) => (forceHidden?.(k) ?? false) || (!lockOf(k) && (rules[k]?.hidden ?? baseHidden(k)))
  const hiddenWith = (k: string): string | null => {
    const parent = fieldDef.get(k)?.dependsOn
    return parent && (ownHidden(parent) || hiddenWith(parent)) ? parent : null
  }
  const isHidden = (k: string) => ownHidden(k) || !!hiddenWith(k)
  const requirable = (k: string) => fieldDef.has(k) && !lockOf(k) && !notRequirable.has(k)
  const need = (k: string) => requirable(k) && !isHidden(k) && !!rules[k]?.required
  const movableFn = (k: string) => fieldDef.has(k) && !byKeyMandatory(k) && !formLocked.has(k) && !(movableExtra?.(k) ?? false)
  const inMore = (k: string) => movableFn(k) && !need(k) && (rules[k]?.more ?? defaultMore.has(k))
  const hid = (key: string) => (editing ? !showHidden && isHidden(key) : isHidden(key))
  const lbl = (key: string) => rules[key]?.label?.trim() || fieldDef.get(key)?.defaultLabel || fieldLabel(key, fieldCfg)
  const setRule = (k: string, patch: FieldRuleV2) => setDraftRules((r) => {
    const cur: FieldRuleV2 = { ...r[k], ...patch }
    if (patch.hidden) cur.required = false
    if (patch.required) cur.hidden = false
    return { ...r, [k]: cur }
  })
  const builder: Builder = {
    editing, lock: lockOf, requirable, ownHidden, isHidden, hiddenWith, required: need, inMore, label: lbl, set: setRule,
    known: (k) => fieldDef.has(k), movable: movableFn, grouped: (k) => groupKeys.has(k),
  }
  const startEditing = () => { setDraftRules(savedRules); setDraftLayout(savedLayout); setEditing(true) }
  const cancelEditing = () => setEditing(false)
  const saveEditing = () => {
    saveRulesV2(draftRules); setSavedRules(asRules(draftRules))
    saveAddressLayout(draftLayout); setSavedLayout(draftLayout)
    setEditing(false)
  }
  const resetRules = () => setDraftRules({})

  return {
    fieldCfg, behavior, editing, showHidden, setShowHidden, hid, lbl, builder, rules,
    addressLayout, setDraftLayout, startEditing, cancelEditing, saveEditing, resetRules,
  }
}

/* ------------------------------------------------------------------------- on-canvas chrome */

/** Required · Hide for one key (no label) — shared by BuilderLabel and Configurable. */
export function FieldTools({ k }: { k: string }) {
  const b = useContext(BuilderCtx)!
  const lock = b.lock(k)
  if (lock) {
    return (
      <span title={lock === 'system' ? 'Required by the system — cannot be hidden or made optional' : 'This form needs it — cannot be hidden'}
        className="inline-flex shrink-0 items-center gap-1 text-[11px] text-ink-3"><Lock size={12} />{lock === 'system' ? 'System' : 'Needed'}</span>
    )
  }
  const parent = b.hiddenWith(k)
  const own = b.ownHidden(k)
  return (
    <span className="ml-auto inline-flex shrink-0 items-center gap-1.5">
      {parent && !own && <span className="text-[11px] text-ink-3">Hidden with {b.label(parent)}</span>}
      {b.requirable(k) && (
        <button type="button" aria-pressed={b.required(k)} onClick={() => b.set(k, { required: !b.required(k) })}
          disabled={own || !!parent}
          title={b.required(k) ? 'Make optional' : 'Make required'}
          className={`h-6 rounded-full border px-2 text-[11px] font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-40
            ${b.required(k) ? 'border-ink bg-warm-50 text-ink' : 'border-warm-300 bg-surface text-ink-3 hover:text-ink'}`}>
          Required
        </button>
      )}
      {b.movable(k) && (
        <button type="button" aria-pressed={b.inMore(k)} onClick={() => b.set(k, { more: !b.inMore(k) })}
          disabled={own || !!parent || b.required(k)}
          title={b.required(k) ? 'A required field stays in the main form' : b.inMore(k) ? 'Move to the main form' : 'Move to More information'}
          className={`h-6 rounded-full border px-2 text-[11px] font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-40
            ${b.inMore(k) ? 'border-ink bg-warm-50 text-ink' : 'border-warm-300 bg-surface text-ink-3 hover:text-ink'}`}>
          More
        </button>
      )}
      <button type="button" aria-pressed={own} onClick={() => b.set(k, { hidden: !own })}
        title={own ? 'Show this field' : 'Hide this field'} aria-label={own ? 'Show field' : 'Hide field'}
        className={`inline-flex h-6 w-6 items-center justify-center rounded-md hover:bg-warm-100 ${own ? 'text-warm-400' : 'text-ink-2'}`}>
        {own ? <EyeOff size={14} /> : <Eye size={14} />}
      </button>
    </span>
  )
}
/** The edit-mode label row: rename in place (single-key fields), then the tools; locked / fixed fields say so. */
export function BuilderLabel({ label, fieldKey, required }: { label?: string; fieldKey?: string; required?: boolean }) {
  const b = useContext(BuilderCtx)!
  const star = required && <span className="text-danger-fg">&nbsp;*</span>
  if (!fieldKey || !b.known(fieldKey)) {
    return (
      <div className="mb-1.5 flex min-h-6 items-center gap-1 text-[13px] leading-5 text-ink" title="Part of the form — not configurable">
        <span className="min-w-0 truncate">{label}{star}</span>
        <Lock size={11} className="ml-auto shrink-0 text-warm-300" />
      </div>
    )
  }
  const renamable = !b.grouped(fieldKey)
  return (
    <div className="mb-1.5 flex min-h-6 items-center gap-1.5 text-[13px] leading-5 text-ink">
      {renamable
        ? <input aria-label={`Rename ${label}`} value={b.label(fieldKey)} onChange={(e) => b.set(fieldKey, { label: e.target.value })}
            className="-mx-1 min-w-0 flex-1 rounded border border-transparent bg-transparent px-1 text-[13px] text-ink hover:border-warm-300 focus:border-brand-500 focus:outline-none" />
        : <span className="min-w-0 flex-1 truncate" title="Grouped with its neighbours — not renamable">{label}</span>}
      {star}
      <FieldTools k={fieldKey} />
    </div>
  )
}
/** Edit-mode frame for a non-field control (a switch): its tools above it. */
export function Configurable({ fieldKey, children }: { fieldKey: string; children: ReactNode }) {
  const b = useContext(BuilderCtx)
  if (!b?.editing) return <>{children}</>
  return (
    <div className="rounded-md outline-dashed outline-1 outline-offset-[5px] outline-warm-300">
      <div className="mb-1.5 flex min-h-6 items-center"><FieldTools k={fieldKey} /></div>
      <div className={b.isHidden(fieldKey) ? 'pointer-events-none opacity-40' : ''}>{children}</div>
    </div>
  )
}

/**
 * "More information" — optional fields a section rarely needs stay HIDDEN IN PLACE; the toggle
 * reveals them where they belong in the section's order. Nothing moves; the builder only decides
 * which fields wait behind the toggle.
 */
export type RevealEntry = [string | null, ReactNode, boolean?] | false | null | undefined
export function revealEntries(entries: RevealEntry[], inMore: (k: string) => boolean, open: boolean) {
  const nodes: ReactNode[] = []
  let waiting = 0
  let waitingFilled = 0
  for (const e of entries) {
    if (!e) continue
    const [k, node, isFilled] = e
    if (k && inMore(k)) {
      waiting += 1
      if (isFilled) waitingFilled += 1
      if (!open) continue
    }
    nodes.push(node)
  }
  return { nodes, waiting, waitingFilled }
}
/** The reveal toggle under a section's fields; hidden while editing (everything is shown then). */
export function RevealToggle({ open, onToggle, waiting, waitingFilled = 0, label = 'information', className = '', iconOnly = false }: {
  open: boolean; onToggle: () => void; waiting: number; waitingFilled?: number; label?: string; className?: string
  /** a chevron only, the words in its tooltip (a package's details) */
  iconOnly?: boolean
}) {
  const b = useContext(BuilderCtx)
  if (b?.editing || waiting === 0) return null
  const words = open ? `Less ${label}` : `More ${label} · ${waiting} field${waiting === 1 ? '' : 's'}${waitingFilled ? `, ${waitingFilled} filled` : ''}`
  if (iconOnly) return (
    <button type="button" onClick={onToggle} aria-expanded={open} title={words} aria-label={words}
      className={`inline-flex h-7 w-7 items-center justify-center rounded-md text-brand-500 hover:bg-warm-100 ${className}`}>
      {open ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
    </button>
  )
  return (
    <div className={className}>
      <button type="button" onClick={onToggle} aria-expanded={open} title={words}
        className="inline-flex items-center gap-1 text-[13px] text-brand-500 hover:text-brand-600">
        {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}{open ? `Less ${label}` : `More ${label}`}
        {!open && <span className="ml-1 text-[12px] text-ink-3">· {waiting} field{waiting === 1 ? '' : 's'}{waitingFilled ? `, ${waitingFilled} filled` : ''}</span>}
      </button>
    </div>
  )
}

/* --------------------------------------------------------------- minimal field chrome, private
   to PartyBlock/AddressCard only — AddConsignmentV2.tsx and AddOrderPage.tsx each keep their own
   fuller local F/SFld (multiline, searchable, date, disabled) for everything else they render. */
function Grid2({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`grid grid-cols-1 gap-x-4 gap-y-5 sm:grid-cols-2 ${className}`}>{children}</div>
}
function SFld({ label, required, info, error, helper, className = '', fieldKey, children }: {
  label?: string; required?: boolean; info?: boolean; error?: boolean | string; helper?: ReactNode; className?: string
  fieldKey?: string; children: ReactNode
}) {
  const showErrors = useContext(ShowErrorsCtx)
  const b = useContext(BuilderCtx)
  const editing = !!b?.editing && !!label
  const msg = showErrors && error ? (typeof error === 'string' ? error : 'Required field.') : null
  const tip = msg ?? (typeof helper === 'string' ? helper : undefined)
  const faded = editing && !!fieldKey && b!.isHidden(fieldKey)
  const configurable = editing && !!fieldKey && !b!.lock(fieldKey)
  return (
    <div className={`min-w-0 ${className} ${configurable ? 'rounded-md outline-dashed outline-1 outline-offset-[5px] outline-warm-300' : ''}`}>
      {editing
        ? <BuilderLabel label={label} fieldKey={fieldKey} required={required} />
        : (
          <label className="mb-1.5 flex min-h-5 items-start gap-1 text-[13px] leading-5 text-ink" title={label}>
            <span className="min-w-0">{label || ' '}{required && <span className="text-danger-fg">&nbsp;*</span>}</span>
            {info && <Info size={13} className="mt-0.5 shrink-0 text-brand-500" />}
          </label>
        )}
      <div className={`relative ${faded ? 'pointer-events-none opacity-40' : ''}`}>
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
function F({ label, required, className = '', type, value, options, onChange, placeholder, error, helper, fieldKey }: {
  label: string; required?: boolean; className?: string; type?: string; value: string; options?: Opt[]
  onChange: (v: string) => void; placeholder?: string; error?: string; helper?: ReactNode; fieldKey?: string
}) {
  const ruleReq = useRuleRequired(fieldKey)
  const err = error || (ruleReq && !filled(value) ? 'Required field.' : undefined)
  const optLabel = (v: string) => options?.find((o) => o.value === v)?.label ?? v
  const ph = placeholder?.trim() ? placeholder : undefined
  const control = options
    ? <MenuSelect value={value} placeholder={ph ?? 'Select'} options={options.map((o) => o.value)} labels={optLabel}
        searchable={options.length > 8} onChange={onChange} />
    : type === 'date' ? <DateInput value={value} onChange={onChange} /> : <Input type={type} value={value} placeholder={ph} onChange={onChange} />
  return <SFld label={label} required={required || ruleReq} error={err} helper={helper} className={className} fieldKey={fieldKey}>{control}</SFld>
}

/**
 * One address's fields (the Add / Edit address popup, and inline while editing the form). Required
 * first — Name* · Contact Number · Address Line 1* · Country* · State* · City* · Postal Code — then
 * the optional ones, each in the main grid or the "More information" fold by its placement (builder).
 * `variant="rto"` = the return address: Contact + Postal Code required, no coordinates / floor.
 */
export function PartyBlock({ party, set, nameLabel, requireContact, hid, variant = 'full', grouped = false }: {
  party: Party; set: (patch: Partial<Party>) => void; nameLabel: string
  requireContact?: boolean; hid: (k: string) => boolean; variant?: 'full' | 'rto'
  /** the popup: the same order under two quiet headings, Contact then Address */
  grouped?: boolean
}) {
  const rto = variant === 'rto'
  const b = useContext(BuilderCtx)
  const showErrors = useContext(ShowErrorsCtx)
  const miss = (v: string | undefined, req: boolean) => req && !filled(v)
  const val = (k: keyof Party) => String(party[k] ?? '')
  const text = (k: keyof Party, label: string, o: { required?: boolean; type?: string; placeholder?: string; className?: string; fieldKey?: string } = {}) => (
    <F key={String(k)} label={label} required={o.required} type={o.type} placeholder={o.placeholder} className={o.className} fieldKey={o.fieldKey}
      value={val(k)} error={miss(val(k), !!o.required) ? 'Required field.' : undefined}
      onChange={(v) => set({ [k]: v } as Partial<Party>)} />
  )
  const sel = (k: 'country' | 'postalCode' | 'state', label: string, list: string[], required: boolean) => (
    <F label={label} required={required} value={party[k] ?? ''} options={opts(list)}
      error={miss(party[k], required) ? 'Required field.' : undefined} onChange={(v) => set({ [k]: v })} />
  )
  const L = (k: string, d: string) => b?.label(k) ?? d
  const [open, setOpen] = useState(false)
  const reveal = open || !!b?.editing
  const inMore = (k: string) => !!b?.inMore(k)
  const contactEntries: RevealEntry[] = [
    [null, text('name', nameLabel, { required: true, placeholder: 'eg, John Doe' })],
    !hid('addrCompanyName') && ['addrCompanyName', text('businessName', L('addrCompanyName', 'Company Name'), { placeholder: 'eg, Random Company', fieldKey: 'addrCompanyName' }), filled(party.businessName)],
    [null, <SFld key="phone" label="Contact Number" required={requireContact} error={miss(party.contactNumber, !!requireContact)}>
      <PhoneInput code={party.countryCode ?? ''} number={party.contactNumber} codes={DIAL_CODES}
        invalid={showErrors && miss(party.contactNumber, !!requireContact)}
        onCode={(v) => set({ countryCode: v })} onNumber={(v) => set({ contactNumber: v })} />
    </SFld>],
    !hid('addrEmail') && ['addrEmail', text('email', L('addrEmail', 'Email'), { type: 'email', placeholder: 'eg, johndoe@xyz.com', fieldKey: 'addrEmail' }), filled(party.email)],
  ]
  const addressEntries: RevealEntry[] = [
    [null, text('line1', 'Address Line 1', { required: true, placeholder: 'eg, Building No., Street' })],
    !hid('addrLines23') && ['addrLines23', text('line2', 'Address Line 2', { placeholder: 'eg, Street 1 A', fieldKey: 'addrLines23' }), filled(party.line2)],
    !hid('addrLines23') && ['addrLines23', <F key="line3" label="Address Line 3" value={party.line3 ?? ''} placeholder="eg, Behind High School" onChange={(v) => set({ line3: v })} />, filled(party.line3)],
    !hid('addrLandmark') && ['addrLandmark', text('landmark', L('addrLandmark', 'Landmark'), { placeholder: 'eg, Behind High School', fieldKey: 'addrLandmark' }), filled(party.landmark)],
    [null, <div key="country" className="contents">{sel('country', 'Country', COUNTRIES, true)}</div>],
    [null, <div key="postal" className="contents">{sel('postalCode', 'Postal Code', POSTCODES, rto)}</div>],
    !hid('addrSuburb') && ['addrSuburb', text('county', L('addrSuburb', 'Suburb / County'), { fieldKey: 'addrSuburb' }), filled(party.county)],
    [null, text('city', 'City', { required: true })],
    [null, <div key="state" className="contents">{sel('state', 'State', STATES, true)}</div>],
    !rto && !hid('addrCoordinates') && ['addrCoordinates', text('latitude', 'Latitude', { type: 'number', fieldKey: 'addrCoordinates' }), filled(party.latitude)],
    !rto && !hid('addrCoordinates') && ['addrCoordinates', text('longitude', 'Longitude', { type: 'number' }), filled(party.longitude)],
    !rto && !hid('addrFloorLift') && ['addrFloorLift', text('floorNumber', 'Floor Number', { type: 'number', fieldKey: 'addrFloorLift' }), filled(party.floorNumber)],
  ]
  const who = revealEntries(contactEntries, inMore, reveal)
  const where = revealEntries(addressEntries, inMore, reveal)
  const waiting = who.waiting + where.waiting
  const waitingFilled = who.waitingFilled + where.waitingFilled
  const toggle = <RevealToggle open={open} onToggle={() => setOpen((v) => !v)} waiting={waiting} waitingFilled={waitingFilled} label="address details" className="mt-5" />
  if (grouped) {
    const head = (t: string) => (
      <div className="mb-4 flex items-center gap-3"><span className="text-[13px] font-bold text-ink-2">{t}</span><span className="h-px flex-1 bg-warm-200" /></div>
    )
    return (
      <div>
        {head('Contact')}
        <Grid2>{who.nodes}</Grid2>
        <div className="mt-8">{head('Address')}</div>
        <Grid2>{where.nodes}</Grid2>
        {toggle}
      </div>
    )
  }
  return (
    <div>
      <Grid2>{who.nodes}{where.nodes}</Grid2>
      {toggle}
    </div>
  )
}

/** The chosen address, read back as a card: who · how to reach them · where. */
export function AddressCard({ party, missing, onEdit, tag }: { party: Party; missing: string[]; onEdit: () => void; tag?: string }) {
  const showErrors = useContext(ShowErrorsCtx)
  const empty = !filled(party.name) && !filled(party.line1)
  const place = [party.city, party.state, party.postalCode, party.country].filter((x) => filled(x)).join(', ')
  const contact = [party.contactNumber ? `${party.countryCode ?? ''} ${party.contactNumber}`.trim() : '', party.email].filter(Boolean).join(' · ')
  const bad = showErrors && missing.length > 0
  return (
    <div className={`rounded-lg border bg-surface p-4 ${bad ? 'border-danger-fg' : 'border-warm-200'}`}>
      {empty
        ? <p className="text-[13px] text-ink-3">No address yet — pick a saved one above or add a new address.</p>
        : (
          <div className="flex items-start gap-3">
            <MapPinned size={16} className="mt-0.5 shrink-0 text-ink-3" />
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-2 text-[14px] font-bold text-ink">
                {party.name || <span className="font-normal text-ink-3">No name</span>}
                {party.businessName && <span className="text-[13px] font-normal text-ink-2">· {party.businessName}</span>}
                {tag && <span className="rounded-full bg-warm-50 px-2 py-0.5 text-[11px] font-normal text-ink-2">{tag}</span>}
              </p>
              {contact && <p className="mt-1 text-[13px] text-ink-2">{contact}</p>}
              <p className="mt-1 text-[13px] text-ink">{[party.line1, party.line2, party.line3, party.landmark].filter((x) => filled(x)).join(', ')}</p>
              {place && <p className="text-[13px] text-ink-2">{place}</p>}
            </div>
            <button type="button" onClick={onEdit} title="Edit this address" aria-label="Edit this address"
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-warm-200 text-ink-2 hover:bg-warm-50 hover:text-ink">
              <Pencil size={14} />
            </button>
          </div>
        )}
      {missing.length > 0 && (bad
        ? <p className="mt-3 text-[12px] text-danger-fg">Missing: {missing.join(', ')}</p>
        : !empty && <p className="mt-3"><span className="rounded-full bg-warm-50 px-2 py-0.5 text-[11px] text-ink-2">Incomplete — {missing.length} to add</span></p>)}
    </div>
  )
}
