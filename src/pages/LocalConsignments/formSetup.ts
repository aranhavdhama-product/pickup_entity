/**
 * Consignment form setup (2026-10-05) — the account's rules for the v2 consignment form, per portal.
 * Pure module (no React): read by the form, its builder, the Consignment Order settings page and the two
 * consignment views.
 *
 *   Console form      `fe-consignment-form-v2-rules` (unchanged key) — the console's Add Consignment.
 *   Grow portal form  `fe-consignment-form-v2-rules-grow` — ONLY what differs for Grow. Grow follows the
 *                     console form field by field until a field is changed for Grow (an overlay), so the
 *                     2026-09-29 rule "a console customisation is the same on Grow" still holds by default.
 *   Custom fields     `fe-consignment-form-v2-custom` — fields the account adds beside the system's, ONE list
 *                     for both portals; each portal's rules say whether a field is shown there.
 *
 * A rule may carry a `format` (what may be typed: a preset or a custom regular expression, + length).
 */

export type FormPortal = 'console' | 'grow'

/* ------------------------------------------------------------------ format ---- */

export type FormatPreset = 'any' | 'digits' | 'letters' | 'alnum' | 'code' | 'email' | 'phone' | 'custom'
export interface FieldFormat {
  preset: FormatPreset
  /** the regular expression for `custom` */
  pattern?: string
  minLength?: number
  maxLength?: number
  /** shown under the field when the value does not match (a default per preset) */
  message?: string
}
export const FORMAT_PRESETS: { value: FormatPreset; label: string; pattern: string; message: string; example: string }[] = [
  /* no check — how the Grow form drops a Format the console form has */
  { value: 'any', label: 'Any text (no check)', pattern: '', message: '', example: '' },
  { value: 'digits', label: 'Numbers only', pattern: '^[0-9]+$', message: 'Use numbers only', example: '100245' },
  { value: 'letters', label: 'Letters only', pattern: '^[A-Za-z ]+$', message: 'Use letters only', example: 'Manila' },
  { value: 'alnum', label: 'Letters and numbers', pattern: '^[A-Za-z0-9]+$', message: 'Use letters and numbers only', example: 'ABC123' },
  { value: 'code', label: 'Code — letters, numbers, - and _', pattern: '^[A-Za-z0-9_-]+$', message: 'Use letters, numbers, - or _ only', example: 'ORD-2026_01' },
  { value: 'email', label: 'Email address', pattern: '^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$', message: 'Enter a valid email address', example: 'name@company.com' },
  { value: 'phone', label: 'Phone number', pattern: '^\\+?[0-9]{7,15}$', message: 'Enter a phone number — 7 to 15 digits', example: '9171234567' },
  { value: 'custom', label: 'Custom pattern (regex)', pattern: '', message: 'Does not match the required format', example: '' },
]
const presetOf = (p: FormatPreset) => FORMAT_PRESETS.find((x) => x.value === p) ?? FORMAT_PRESETS[FORMAT_PRESETS.length - 1]

/** the regular expression a format checks with; null when a custom pattern is empty or not valid */
export function formatRegex(f: FieldFormat): RegExp | null {
  const src = f.preset === 'custom' ? (f.pattern ?? '').trim() : presetOf(f.preset).pattern
  if (!src) return null
  try { return new RegExp(src) } catch { return null }
}
/** a custom pattern that cannot be read (the builder says so; the form does not check with it) */
export const patternError = (f: FieldFormat): string | null => {
  if (f.preset !== 'custom') return null
  if (!(f.pattern ?? '').trim()) return 'Enter a pattern'
  try { new RegExp(f.pattern!.trim()); return null } catch { return 'This pattern is not valid' }
}
export const formatMessage = (f: FieldFormat) => f.message?.trim() || presetOf(f.preset).message
/** what a format allows, in words (the builder's chip tooltip, the form's hint) */
export function formatSummary(f: FieldFormat): string {
  const base = f.preset === 'custom' ? `Pattern ${f.pattern ?? ''}` : presetOf(f.preset).label
  const len = f.minLength && f.maxLength ? ` · ${f.minLength}–${f.maxLength} characters`
    : f.minLength ? ` · at least ${f.minLength} characters` : f.maxLength ? ` · up to ${f.maxLength} characters` : ''
  return base + len
}
/** The message when `value` breaks the format — null when it fits, is empty (Required handles empty) or no format is set. */
export function formatError(f: FieldFormat | undefined, value: string | undefined | null): string | null {
  const v = (value ?? '').trim()
  if (!f || !v) return null
  const msg = formatMessage(f)
  if (f.minLength && v.length < f.minLength) return f.message?.trim() || `Use at least ${f.minLength} characters`
  if (f.maxLength && v.length > f.maxLength) return f.message?.trim() || `Use at most ${f.maxLength} characters`
  const re = formatRegex(f)
  return re && !re.test(v) ? msg : null
}
const asFormat = (raw: unknown): FieldFormat | undefined => {
  if (!raw || typeof raw !== 'object') return undefined
  const r = raw as Record<string, unknown>
  if (!FORMAT_PRESETS.some((p) => p.value === r.preset)) return undefined
  const n = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) && x > 0 ? Math.round(x) : undefined)
  const out: FieldFormat = { preset: r.preset as FormatPreset }
  if (typeof r.pattern === 'string' && r.pattern.trim()) out.pattern = r.pattern
  if (n(r.minLength)) out.minLength = n(r.minLength)
  if (n(r.maxLength)) out.maxLength = n(r.maxLength)
  if (typeof r.message === 'string' && r.message.trim()) out.message = r.message
  return out
}

/* ------------------------------------------------------------------- rules ---- */

export interface FieldRuleV2 {
  hidden?: boolean; required?: boolean; label?: string
  /** true = in its section's "More information" fold, false = in the main grid (absent = the default) */
  more?: boolean
  /** what may be typed (text fields) */
  format?: FieldFormat
}
export type FormRulesV2 = Record<string, FieldRuleV2>
export const FORM_RULES_V2_KEY = 'fe-consignment-form-v2-rules'
export const FORM_RULES_GROW_KEY = 'fe-consignment-form-v2-rules-grow'

export function asRules(raw: unknown): FormRulesV2 {
  const out: FormRulesV2 = {}
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!v || typeof v !== 'object') continue
    const r = v as Record<string, unknown>
    const format = asFormat(r.format)
    const rule: FieldRuleV2 = {
      ...(typeof r.hidden === 'boolean' ? { hidden: r.hidden } : {}),
      ...(typeof r.required === 'boolean' ? { required: r.required } : {}),
      ...(typeof r.label === 'string' && r.label.trim() ? { label: r.label } : {}),
      ...(typeof r.more === 'boolean' ? { more: r.more } : {}),
      ...(format ? { format } : {}),
    }
    if (Object.keys(rule).length) out[k] = rule
  }
  return out
}
const keyOf = (p: FormPortal) => (p === 'grow' ? FORM_RULES_GROW_KEY : FORM_RULES_V2_KEY)
/** the console form's rules, or the Grow form's OWN changes (see `growRules` for what Grow shows) */
export const loadRules = (p: FormPortal): FormRulesV2 => {
  try { return asRules(JSON.parse(localStorage.getItem(keyOf(p)) ?? '{}')) } catch { return {} }
}
export const saveRules = (p: FormPortal, r: FormRulesV2) => {
  try { localStorage.setItem(keyOf(p), JSON.stringify(asRules(r))) } catch { /* private mode */ }
}
/** Grow's effective rules: the console form's, with Grow's own changes on top (property by property). */
export function growRules(consoleRules: FormRulesV2, growChanges: FormRulesV2): FormRulesV2 {
  const out: FormRulesV2 = { ...consoleRules }
  for (const [k, v] of Object.entries(growChanges)) out[k] = { ...out[k], ...v }
  return out
}
/** drop rules for keys that no longer exist (a removed custom field) */
export const withoutKeys = (r: FormRulesV2, keys: Iterable<string>): FormRulesV2 => {
  const out = { ...r }
  for (const k of keys) delete out[k]
  return out
}

/* ----------------------------------------------------- how goods are entered ---- */

export type GoodsSetting = 'sku' | 'separate' | 'combined'
/** owner, 2026-10-05: "SKUs, then packages" (option 2) is the default */
export const DEFAULT_GOODS_SETTING: GoodsSetting = 'separate'
/* v2 of the key (2026-10-05): the first key also caught the old default ('sku') whenever the builder was saved, so it
   cannot tell a choice from a default — read once as a fallback, keeping only a non-default choice */
export const GOODS_SETTING_KEY = 'fe-consignment-form-v2-goods-v2'
const GOODS_SETTING_KEY_V1 = 'fe-consignment-form-v2-goods'
export const GOODS_SETTING_GROW_KEY = 'fe-consignment-form-v2-goods-grow'
const asGoods = (v: string | null): GoodsSetting | null => (v === 'sku' || v === 'separate' || v === 'combined' ? v : null)
const consoleGoods = (): GoodsSetting => {
  const v2 = asGoods(localStorage.getItem(GOODS_SETTING_KEY))
  if (v2) return v2
  const v1 = asGoods(localStorage.getItem(GOODS_SETTING_KEY_V1))
  return v1 && v1 !== 'sku' ? v1 : DEFAULT_GOODS_SETTING
}
/** the console's setting; Grow's own when it has one, else the console's */
export function loadGoodsSetting(p: FormPortal = 'console'): GoodsSetting {
  try {
    const own = p === 'grow' ? asGoods(localStorage.getItem(GOODS_SETTING_GROW_KEY)) : null
    return own ?? consoleGoods()
  } catch { return DEFAULT_GOODS_SETTING }
}
export function saveGoodsSetting(p: FormPortal, v: GoodsSetting) {
  try {
    if (p === 'console') localStorage.setItem(GOODS_SETTING_KEY, v)
    /* Grow keeps a value only while it differs from the console's — otherwise it follows */
    else if (v === loadGoodsSetting('console')) localStorage.removeItem(GOODS_SETTING_GROW_KEY)
    else localStorage.setItem(GOODS_SETTING_GROW_KEY, v)
  } catch { /* private mode */ }
}

/* ----------------------------------------------------------- custom fields ---- */

export type CustomFieldKind = 'text' | 'number' | 'date' | 'list' | 'yesno'
export const CUSTOM_FIELD_KINDS: { value: CustomFieldKind; label: string }[] = [
  { value: 'text', label: 'Text' }, { value: 'number', label: 'Number' }, { value: 'date', label: 'Date' },
  { value: 'list', label: 'List' }, { value: 'yesno', label: 'Yes / No' },
]
/** the cards a custom field can sit in */
export type CustomFieldCard = 'sec-consignment' | 'sec-handling' | 'sec-service'
export const CUSTOM_FIELD_CARDS: Record<CustomFieldCard, string> = {
  'sec-consignment': 'Consignment details', 'sec-handling': 'Handling', 'sec-service': 'Service & instructions',
}
export interface CustomFieldDef {
  /** `cf:<id>` — the rules key, and the key a value is stored under */
  key: string
  label: string
  kind: CustomFieldKind
  /** a List's choices */
  options?: string[]
  /** shown inside the empty box */
  placeholder?: string
  card: CustomFieldCard
}
export const CUSTOM_FIELDS_KEY = 'fe-consignment-form-v2-custom'
export const CUSTOM_PREFIX = 'cf:'
export const isCustomKey = (k: string) => k.startsWith(CUSTOM_PREFIX)
export const newCustomKey = () => `${CUSTOM_PREFIX}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`

const asCustom = (raw: unknown): CustomFieldDef[] => {
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  const out: CustomFieldDef[] = []
  for (const x of raw) {
    if (!x || typeof x !== 'object') continue
    const r = x as Record<string, unknown>
    if (typeof r.key !== 'string' || !isCustomKey(r.key) || seen.has(r.key)) continue
    if (typeof r.label !== 'string' || !r.label.trim()) continue
    const kind = CUSTOM_FIELD_KINDS.some((k) => k.value === r.kind) ? r.kind as CustomFieldKind : 'text'
    const card = (Object.keys(CUSTOM_FIELD_CARDS) as CustomFieldCard[]).includes(r.card as CustomFieldCard) ? r.card as CustomFieldCard : 'sec-consignment'
    const options = Array.isArray(r.options) ? r.options.filter((o): o is string => typeof o === 'string' && !!o.trim()) : []
    seen.add(r.key)
    out.push({
      key: r.key, label: r.label.trim(), kind, card,
      ...(kind === 'list' ? { options } : {}),
      ...(typeof r.placeholder === 'string' && r.placeholder.trim() ? { placeholder: r.placeholder.trim() } : {}),
    })
  }
  return out
}
export const loadCustomFields = (): CustomFieldDef[] => {
  try { return asCustom(JSON.parse(localStorage.getItem(CUSTOM_FIELDS_KEY) ?? '[]')) } catch { return [] }
}
export const saveCustomFields = (defs: CustomFieldDef[]) => {
  try { localStorage.setItem(CUSTOM_FIELDS_KEY, JSON.stringify(asCustom(defs))) } catch { /* private mode */ }
}

/** Is a custom field shown on a portal's form, by the saved rules? (the views read this) */
export function customFieldShown(key: string, portal: FormPortal): boolean {
  const c = loadRules('console')
  const r = portal === 'grow' ? growRules(c, loadRules('grow')) : c
  return !r[key]?.hidden
}
/** a stored Yes / No value, in words */
export const customValueText = (kind: CustomFieldKind | undefined, v: string) =>
  (kind === 'yesno' ? (v === 'true' ? 'Yes' : 'No') : v)
