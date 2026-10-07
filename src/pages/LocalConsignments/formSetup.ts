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
 * A rule may carry a `format` (what may be typed: a preset or a custom regular expression, + length). The Package & SKU
 * card's two sections are rules too (`PKG_SECTION`, `SKU_SECTION`). Layout (how addresses and services are shown) is per
 * portal the same way.
 * Every key here is listed in ./formSync SETUP_KEYS — a NEW setup key must join it, or it is not kept on the server.
 */

import { loadFieldConfig, loadFormBehavior } from '../ConsignmentAdd/fieldConfig'

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

/** How much of its row a field takes (owner, 2026-10-07: "S / M / L / Full" in the builder): S = one column (the normal
    size) · M = half the row · L = three quarters · Full = the whole row. In a package's line the same four mean widths. */
export type FieldWidth = 's' | 'm' | 'l' | 'full'
export const FIELD_WIDTHS: { value: FieldWidth; label: string; tip: string }[] = [
  { value: 's', label: 'S', tip: 'Small — one column, the normal size' },
  { value: 'm', label: 'M', tip: 'Medium — half the row' },
  { value: 'l', label: 'L', tip: 'Large — three quarters of the row' },
  { value: 'full', label: 'Full', tip: 'Full — the whole row' },
]
export const asWidth = (v: unknown): FieldWidth | undefined => (v === 's' || v === 'm' || v === 'l' || v === 'full' ? v : undefined)
export interface FieldRuleV2 {
  hidden?: boolean; required?: boolean; label?: string
  /** how wide the field is on its row (absent = S, the normal size) */
  width?: FieldWidth
  /** true = in its section's "More information" fold, false = in the main grid (absent = the default) */
  more?: boolean
  /** what may be typed (text fields) */
  format?: FieldFormat
  /** the value a hidden field gives every consignment — Service Type's default service (owner, 2026-10-05: "in Service
      Type I can't hide that field") */
  defaultValue?: string
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
      ...(asWidth(r.width) ? { width: asWidth(r.width) } : {}),
      ...(format ? { format } : {}),
      ...(typeof r.defaultValue === 'string' && r.defaultValue.trim() ? { defaultValue: r.defaultValue.trim() } : {}),
    }
    if (Object.keys(rule).length) out[k] = rule
  }
  return out
}
const keyOf = (p: FormPortal) => (p === 'grow' ? FORM_RULES_GROW_KEY : FORM_RULES_V2_KEY)
/** the console form's rules, or the Grow form's OWN changes (see `growRules` for what Grow shows) */
export const loadRules = (p: FormPortal): FormRulesV2 => {
  let r: FormRulesV2 = {}
  try { r = asRules(JSON.parse(localStorage.getItem(keyOf(p)) ?? '{}')) } catch { /* a broken value = no rules */ }
  return withLegacyGoods(p, r)
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

/* --------------------------------------------------- Package & SKU sections ---- */

/**
 * What the Package & SKU card asks (owner, 2026-10-06: "do not ask How goods are entered — in the form builder we can
 * hide the SKU section or the package section"): two rule keys, hidden per portal like any field (Grow follows the
 * console). Both shown = each package with its SKUs · SKUs hidden = packages only · Packages hidden = SKU-based (a SKU
 * and how many — the packages are worked out). Never both: the one still shown is locked.
 */
export const PKG_SECTION = 'pkgSection'
export const SKU_SECTION = 'skuSection'
/* The retired "How goods are entered" keys (until 2026-10-06; v2 because the first key also caught the old default).
   They are still read — `sku` = the Packages section hidden — until the builder's Save writes the rules and clears them. */
export const GOODS_SETTING_KEY = 'fe-consignment-form-v2-goods-v2'
export const GOODS_SETTING_KEY_V1 = 'fe-consignment-form-v2-goods'
export const GOODS_SETTING_GROW_KEY = 'fe-consignment-form-v2-goods-grow'
type LegacyGoods = 'sku' | 'separate' | 'combined'
const asGoods = (v: string | null): LegacyGoods | null => (v === 'sku' || v === 'separate' || v === 'combined' ? v : null)
const legacyConsoleSku = () => {
  const v2 = asGoods(localStorage.getItem(GOODS_SETTING_KEY))
  /* the first key's 'sku' was its default, not a choice */
  return v2 ? v2 === 'sku' : false
}
/** a portal's rules with the retired goods setting read in as the section hides (only while neither is set) */
function withLegacyGoods(p: FormPortal, r: FormRulesV2): FormRulesV2 {
  if (r[PKG_SECTION] || r[SKU_SECTION]) return r
  try {
    const consoleSku = legacyConsoleSku()
    if (p === 'console') return consoleSku ? { ...r, [PKG_SECTION]: { hidden: true } } : r
    /* Grow kept a value only while it differed from the console's */
    const grow = asGoods(localStorage.getItem(GOODS_SETTING_GROW_KEY))
    return grow && (grow === 'sku') !== consoleSku ? { ...r, [PKG_SECTION]: { hidden: grow === 'sku' } } : r
  } catch { return r }
}
/** the builder's Save wrote both portals' rules (with the retired setting read in) — the old keys can go */
export function clearLegacyGoods() {
  try { for (const k of [GOODS_SETTING_KEY, GOODS_SETTING_KEY_V1, GOODS_SETTING_GROW_KEY]) localStorage.removeItem(k) } catch { /* private mode */ }
}
/** the console form's Simplified | full choice (per viewer — not shared; a share link opens the full form) */
export const FORM_TIER_KEY = 'console-consignment-form-v2-tier'

/* ------------------------------------------------------------- form layout ---- */

/**
 * How the form LOOKS (owner, 2026-10-05: "give Ship To / Ship From in two options", then "individually configured,
 * RTO also"), per portal — Grow keeps only what differs from the console:
 *   shipFrom · shipTo · rto   each address on its own:
 *             'cards'  = a saved-address picker read back as a card, Add / Edit in a popup (the form until now)
 *             'inline' = the fields on the form itself, under a search of the saved addresses
 *   services  (Grow) 'menu' = ONE compact dropdown with the carrier and the rate on each line (default since 2026-10-07) ·
 *             'grid' = the lane's services as compact cards, two per row · 'list' = one full-width card each
 *   skuList   'under' = each package with its SKUs under it (default) · 'separate' = the SKU list first, then the packages,
 *             each package picking the SKUs packed in it (owner, 2026-10-07: back as a builder choice)
 *   addresses  'side' = Ship From | Ship To side by side (default; they still stack when the card is narrow) ·
 *              'stack' = one under the other (owner, 2026-10-06)
 * A stored layout from before the per-address split (`address`) applies to all three addresses.
 */
export type AddressEntry = 'cards' | 'inline'
export type ServiceLayout = 'menu' | 'grid' | 'list'
export type AddressArrangement = 'side' | 'stack'
export type SkuListLayout = 'under' | 'separate'
export type AddressRole = 'shipFrom' | 'shipTo' | 'rto'
export const ADDRESS_ROLES: AddressRole[] = ['shipFrom', 'shipTo', 'rto']
export interface FormLayout { shipFrom: AddressEntry; shipTo: AddressEntry; rto: AddressEntry; services: ServiceLayout; addresses: AddressArrangement; skuList: SkuListLayout }
export const DEFAULT_LAYOUT: FormLayout = { shipFrom: 'cards', shipTo: 'cards', rto: 'cards', services: 'menu', addresses: 'side', skuList: 'under' }
export const LAYOUT_KEY = 'fe-consignment-form-v2-layout'
export const LAYOUT_GROW_KEY = 'fe-consignment-form-v2-layout-grow'
const isEntry = (v: unknown): v is AddressEntry => v === 'cards' || v === 'inline'
const asLayout = (raw: unknown): Partial<FormLayout> => {
  if (!raw || typeof raw !== 'object') return {}
  const r = raw as Record<string, unknown>
  const out: Partial<FormLayout> = {}
  /* the first version stored one choice for every address */
  if (isEntry(r.address)) for (const k of ADDRESS_ROLES) out[k] = r.address
  for (const k of ADDRESS_ROLES) if (isEntry(r[k])) out[k] = r[k] as AddressEntry
  if (r.services === 'menu' || r.services === 'grid' || r.services === 'list') out.services = r.services
  if (r.addresses === 'side' || r.addresses === 'stack') out.addresses = r.addresses
  if (r.skuList === 'under' || r.skuList === 'separate') out.skuList = r.skuList
  return out
}
const readLayout = (key: string): Partial<FormLayout> => {
  try { return asLayout(JSON.parse(localStorage.getItem(key) ?? '{}')) } catch { return {} }
}
/** the console's layout; Grow = the console's with Grow's own choices on top */
export function loadLayout(p: FormPortal = 'console'): FormLayout {
  const base = { ...DEFAULT_LAYOUT, ...readLayout(LAYOUT_KEY) }
  return p === 'grow' ? { ...base, ...readLayout(LAYOUT_GROW_KEY) } : base
}
export function saveLayout(p: FormPortal, l: FormLayout) {
  try {
    if (p === 'console') { localStorage.setItem(LAYOUT_KEY, JSON.stringify(asLayout(l))); return }
    const base = loadLayout('console')
    const diff: Partial<FormLayout> = {}
    for (const k of [...ADDRESS_ROLES, 'services', 'addresses', 'skuList'] as const) if (l[k] !== base[k]) Object.assign(diff, { [k]: l[k] })
    if (Object.keys(diff).length) localStorage.setItem(LAYOUT_GROW_KEY, JSON.stringify(diff))
    else localStorage.removeItem(LAYOUT_GROW_KEY)
  } catch { /* private mode */ }
}

/* --------------------------------------------------------------- field order ---- */

/**
 * The order of the fields inside each section (owner, 2026-10-05: "drag and drop and resequence columns in the same
 * sections"), per portal: `{ <zone>: [entry ids in order] }`. A zone is one group of fields that is laid out together
 * (Consignment details, an address's contact / address details, a package's fields…); an id is the field's entry id
 * in that zone. Grow follows the console zone by zone — a zone Grow re-ordered itself is kept in the Grow key.
 * A field missing from a stored order (added later) keeps its natural place after its natural predecessor.
 */
export type FormOrder = Record<string, string[]>
export const ORDER_KEY = 'fe-consignment-form-v2-order'
export const ORDER_GROW_KEY = 'fe-consignment-form-v2-order-grow'
const asOrder = (raw: unknown): FormOrder => {
  const out: FormOrder = {}
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!Array.isArray(v)) continue
    const ids = [...new Set(v.filter((x): x is string => typeof x === 'string' && !!x))]
    if (ids.length) out[k] = ids
  }
  return out
}
const readOrder = (key: string): FormOrder => {
  try { return asOrder(JSON.parse(localStorage.getItem(key) ?? '{}')) } catch { return {} }
}
/** the console's order; Grow = the console's with Grow's own zones on top */
export function loadOrder(p: FormPortal = 'console'): FormOrder {
  const base = readOrder(ORDER_KEY)
  return p === 'grow' ? { ...base, ...readOrder(ORDER_GROW_KEY) } : base
}
export function saveOrder(p: FormPortal, o: FormOrder) {
  try {
    if (p === 'console') { localStorage.setItem(ORDER_KEY, JSON.stringify(asOrder(o))); return }
    const base = readOrder(ORDER_KEY)
    const diff: FormOrder = {}
    for (const [k, v] of Object.entries(asOrder(o))) if (JSON.stringify(v) !== JSON.stringify(base[k] ?? null)) diff[k] = v
    if (Object.keys(diff).length) localStorage.setItem(ORDER_GROW_KEY, JSON.stringify(diff))
    else localStorage.removeItem(ORDER_GROW_KEY)
  } catch { /* private mode */ }
}
/** `items` in the stored order; an item the order does not know goes right after its natural predecessor */
export function applyOrder<T>(items: T[], idOf: (t: T) => string, order: string[] | undefined): T[] {
  if (!order?.length || items.length < 2) return items
  const byId = new Map(items.map((t) => [idOf(t), t]))
  const out = order.filter((id) => byId.has(id))
  const natural = items.map(idOf)
  natural.forEach((id, i) => {
    if (out.includes(id)) return
    let at = 0
    for (let j = i - 1; j >= 0; j--) { const k = out.indexOf(natural[j]); if (k >= 0) { at = k + 1; break } }
    out.splice(at, 0, id)
  })
  return out.map((id) => byId.get(id)!)
}
/** `ids` with `moved` placed before / after `target` */
export function moveId(ids: string[], moved: string, target: string, after: boolean): string[] {
  if (moved === target) return ids
  const rest = ids.filter((x) => x !== moved)
  const at = rest.indexOf(target)
  if (at < 0) return ids
  rest.splice(after ? at + 1 : at, 0, moved)
  return rest
}

/* ------------------------------------------------------------------- summary ---- */

/**
 * The form's Summary card (owner, 2026-10-05: "allow to show summary or not … for both consignment and Grow portal —
 * their summary section can be different"): on / off and which lines it shows, kept SEPARATELY per portal (the console
 * summary is the ops view, Grow's the merchant view — different lines, so Grow does not follow the console here). The
 * lines' order uses the field order (zone `summary`).
 */
export interface FormSummary { enabled: boolean; hidden: string[] }
export const SUMMARY_KEY = 'fe-consignment-form-v2-summary'
export const SUMMARY_GROW_KEY = 'fe-consignment-form-v2-summary-grow'
/* the console form stays as people know it (off); merchants get the summary before checkout (on) */
export const DEFAULT_SUMMARY: Record<FormPortal, FormSummary> = { console: { enabled: false, hidden: [] }, grow: { enabled: true, hidden: [] } }
export function loadSummary(p: FormPortal): FormSummary {
  const d = DEFAULT_SUMMARY[p]
  try {
    const r = JSON.parse(localStorage.getItem(p === 'grow' ? SUMMARY_GROW_KEY : SUMMARY_KEY) ?? 'null') as Record<string, unknown> | null
    if (!r || typeof r !== 'object') return d
    return {
      enabled: typeof r.enabled === 'boolean' ? r.enabled : d.enabled,
      hidden: Array.isArray(r.hidden) ? [...new Set(r.hidden.filter((x): x is string => typeof x === 'string'))] : d.hidden,
    }
  } catch { return d }
}
export function saveSummary(p: FormPortal, v: FormSummary) {
  try { localStorage.setItem(p === 'grow' ? SUMMARY_GROW_KEY : SUMMARY_KEY, JSON.stringify(v)) } catch { /* private mode */ }
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

/* ------------------------------------------------------- the views read the setup ---- */

/**
 * What the form builder decided, for the READING pages (owner, 2026-10-07: "make sure the form builder effects are on the
 * View Consignment and Modify Consignment pages"): a field the builder hides is not shown on the consignment's view,
 * a renamed one carries its new name. Same rules the form reads — the console's, with Grow's own changes on top for
 * the Grow portal — plus the account's older Form Builder / Base Modules hides. The fields the form can never hide
 * (the Order Number and an address's name, line 1, country, state and city) always show. A view never deletes
 * anything: a hidden field's answer is kept on the consignment, just not displayed.
 */
export interface ViewSetup {
  /** is the field (a builder key) shown on this portal's form — so it shows on the view */
  shown: (key: string) => boolean
  /** the field's name: the builder's rename, else the view's own label */
  label: (key: string, fallback: string) => string
}
const VIEW_ALWAYS = new Set(['orderNumber', 'addrName', 'addrLine1', 'addrCountry', 'addrState', 'addrCity'])
export function loadViewSetup(portal: FormPortal): ViewSetup {
  const c = loadRules('console')
  const rules = portal === 'grow' ? growRules(c, loadRules('grow')) : c
  const cfg = loadFieldConfig()
  const behavior = loadFormBehavior()
  const baseHidden = (k: string) => !!cfg[k]?.hidden || behavior.hidden.includes(k)
  return {
    shown: (k) => VIEW_ALWAYS.has(k) || !(rules[k]?.hidden ?? baseHidden(k)),
    label: (k, fallback) => rules[k]?.label?.trim() || cfg[k]?.label?.trim() || fallback,
  }
}
/** `[builder key | null, label, value]` rows → the `[label, value]` pairs the setup allows (null key = always shown) */
export function viewPairs<V>(vs: ViewSetup, rows: [string | null, string, V][]): [string, V][] {
  return rows.filter(([k]) => !k || vs.shown(k)).map(([k, label, v]) => [k ? vs.label(k, label) : label, v])
}
