/**
 * The saved column/filter configuration for the unified Pending For Planning
 * (local) listing — LOCAL MODE: localStorage only, no session, no moduleSettings.
 *
 * It deliberately mirrors the SHAPE of `ConsignmentOrder/api.ts`'s
 * `ConsignmentPageConfig` (`{columns[], filters[], dateField, dateRange}`) so the
 * listing's consumption code reads the same as the staging-backed page — but NOT
 * its implementation: `fetchConsignmentPageConfig` swallows every failure and
 * returns its own DEFAULT_COLUMNS, which sessionless would silently ignore
 * whatever the user saved here.
 *
 * SPARSE OVERRIDES, not a snapshot (the `ConsignmentAdd/fieldConfig.ts`
 * precedent): only what the user changed is stored, so a field added to the
 * registry later is visible to someone with an old save instead of vanishing.
 * `reset()` is `localStorage.removeItem`.
 */
import {
  FIELDS, FIELD_BY_KEY, FILTERS, FILTER_BY_KEY, isToggleable, narrowingOptions,
  type AppliesTo, type FieldDef, type FilterDef,
} from './fieldRegistry'

export const STORAGE_KEY = 'pfp-local-column-config'

export interface ColumnOverride {
  show?: boolean
  sequence?: number
  /** narrowed within the field's declared capability — never wider */
  appliesTo?: AppliesTo
  width?: number
}

export interface StoredConfig {
  columns?: Record<string, ColumnOverride>
  filters?: Record<string, ColumnOverride>
  /** which date the range filter applies to */
  dateField?: 'window' | 'createdAt'
}

/** A registry field with its overrides folded in — what the listing renders. */
export interface ResolvedColumn extends FieldDef {
  show: boolean
  sequence: number
  /** the EFFECTIVE applies-to: the narrowing when set, else the capability */
  effectiveAppliesTo: AppliesTo
}

export interface ResolvedFilter extends FilterDef {
  show: boolean
}

export interface ResolvedConfig {
  /** visible columns, in sequence — composites only (nothing `carriedBy`) */
  columns: ResolvedColumn[]
  /** every registry field with its overrides folded in, in sequence */
  all: ResolvedColumn[]
  /** every merged filter with its override folded in */
  filters: ResolvedFilter[]
  /** the keys of the filters actually offered */
  activeFilters: Set<string>
  dateField: 'window' | 'createdAt'
}

/* ------------------------------------------------------------- storage ----- */

export function loadStoredConfig(): StoredConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : {}
    return typeof parsed === 'object' && parsed !== null ? (parsed as StoredConfig) : {}
  } catch {
    return {} /* private mode, blocked site data, quota — the page still works */
  }
}

export function saveStoredConfig(cfg: StoredConfig): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg)) } catch { /* ignore */ }
}

/** Wipe every override — the config page's "Reset to default". */
export function resetStoredConfig(): StoredConfig {
  try { localStorage.removeItem(STORAGE_KEY) } catch { /* ignore */ }
  return {}
}

/* ------------------------------------------------------------- resolving --- */

/**
 * Fold overrides into the registry.
 *
 * A stored `appliesTo` that the field's capability does not allow is DISCARDED,
 * not honoured: capability is a fact about the data, and a stale save must never
 * be able to claim a column applies to a row type that has no such value.
 */
export function resolveConfig(stored: StoredConfig = loadStoredConfig()): ResolvedConfig {
  const overrides = stored.columns ?? {}

  const all: ResolvedColumn[] = FIELDS.map((d) => {
    const o = overrides[d.key] ?? {}
    const allowed = narrowingOptions(d.capability)
    const narrowed = o.appliesTo && allowed.includes(o.appliesTo) ? o.appliesTo : d.capability
    return {
      ...d,
      /* DEFAULT = THE CONSOLE'S 20, not the workbook's 7.
         `/local/pending-for-planning` is a replica of the console listing, so
         what it renders out of the box must be the console's own column set —
         `consoleDefault`. The workbook's 7-column "unified default view" is
         still available, as the `unified-compact` preset below; it is a choice
         the user makes on the config page, not the shipped default.
         NOT `?? d.defaultVisible` as a second fallback: two of the workbook's
         seven (Window, Ship From Name) are not console columns at all, and
         falling back to them left the default set matching NEITHER preset. */
      show: d.mandatory ? true : (isToggleable(d) ? (o.show ?? !!d.consoleDefault) : false),
      sequence: o.sequence ?? d.defaultSequence,
      width: o.width ?? d.width,
      effectiveAppliesTo: narrowed,
    }
  }).sort((a, b) => a.sequence - b.sequence || a.defaultSequence - b.defaultSequence)

  const filterOverrides = stored.filters ?? {}
  const filters: ResolvedFilter[] = FILTERS.map((d) => ({
    ...d,
    show: filterOverrides[d.key]?.show ?? d.defaultVisible,
  }))

  return {
    all,
    columns: all.filter((c) => c.show && !c.carriedBy),
    filters,
    activeFilters: new Set(filters.filter((x) => x.show).map((x) => x.key)),
    dateField: stored.dateField ?? 'window',
  }
}

/** Is anything actually overridden? Drives the "Reset to default" affordance. */
export function hasOverrides(stored: StoredConfig = loadStoredConfig()): boolean {
  return Object.keys(stored.columns ?? {}).length > 0
    || Object.keys(stored.filters ?? {}).length > 0
    || stored.dateField !== undefined
}

/**
 * Turn an edited list back into sparse overrides: only entries that DIFFER from
 * the registry are written, and the sequence is renumbered 1..n over the whole
 * list so a drag has a stable, gap-free result.
 */
export function toStoredConfig(
  all: ResolvedColumn[],
  filters: ResolvedFilter[],
  dateField: 'window' | 'createdAt',
): StoredConfig {
  const columns: Record<string, ColumnOverride> = {}
  all.forEach((c, i) => {
    const def = FIELD_BY_KEY.get(c.key)
    if (!def) return
    const o: ColumnOverride = {}
    if (c.show !== def.defaultVisible && isToggleable(def)) o.show = c.show
    if (i + 1 !== def.defaultSequence) o.sequence = i + 1
    if (c.effectiveAppliesTo !== def.capability) o.appliesTo = c.effectiveAppliesTo
    if (c.width !== def.width) o.width = c.width
    if (Object.keys(o).length) columns[c.key] = o
  })
  const filterOut: Record<string, ColumnOverride> = {}
  for (const x of filters) {
    const def = FILTER_BY_KEY.get(x.key)
    if (def && x.show !== def.defaultVisible) filterOut[x.key] = { show: x.show }
  }

  const out: StoredConfig = {}
  if (Object.keys(columns).length) out.columns = columns
  if (Object.keys(filterOut).length) out.filters = filterOut
  if (dateField !== 'window') out.dateField = dateField
  return out
}

/* ------------------------------------------------------------- presets ----- */

/**
 * Named column sets the config page offers.
 *
 * `console` is the shipped default and mirrors the staging listing (its order
 * and widths live in `stagingTokens.json`). `unified-compact` is the analysis
 * workbook's seven-column view — the one that sums with the checkbox to exactly
 * 1126px and therefore never scrolls sideways. Horizontal scroll is NOT a defect
 * of the console preset: production scrolls too, and the replica scrolls with it.
 */
export interface ColumnPreset {
  id: 'console' | 'unified-compact'
  label: string
  description: string
  /** the field keys this preset shows; everything else is hidden */
  keys: string[]
}

export const PRESETS: ColumnPreset[] = [
  {
    id: 'console',
    label: 'Console (default)',
    description: "The console's own 20 columns, in the console's order — what this listing replicates.",
    keys: FIELDS.filter((d) => d.consoleDefault).map((d) => d.key),
  },
  {
    id: 'unified-compact',
    label: 'Unified (compact)',
    description: 'The seven-column unified view: fits a 1440px viewport with the nav expanded, so the grid never scrolls sideways.',
    keys: FIELDS.filter((d) => d.defaultVisible).map((d) => d.key),
  },
]

/** Which preset the stored configuration currently matches, if any. */
export function activePreset(stored: StoredConfig = loadStoredConfig()): ColumnPreset['id'] | null {
  const resolved = resolveConfig(stored)
  const shown = new Set(resolved.all.filter((c) => c.show).map((c) => c.key))
  /* mandatory fields are in every set by definition — comparing them would make
     the console preset never match, because Row Type is mandatory here and is
     not one of the console's twenty */
  const comparable = (k: string) => {
    const d = FIELD_BY_KEY.get(k)
    return !!d && isToggleable(d) && !d.mandatory
  }
  for (const p of PRESETS) {
    const want = new Set(p.keys.filter(comparable))
    const have = new Set([...shown].filter(comparable))
    if (want.size === have.size && [...want].every((k) => have.has(k))) return p.id
  }
  return null
}

/**
 * Apply a preset as SPARSE OVERRIDES — the same contract the rest of this module
 * keeps. A field whose preset visibility already equals its registry default
 * writes nothing, so a field added to the registry later still behaves sensibly
 * for someone who picked a preset months ago.
 */
export function applyPreset(id: ColumnPreset['id'], stored: StoredConfig = loadStoredConfig()): StoredConfig {
  const preset = PRESETS.find((p) => p.id === id)
  if (!preset) return stored
  const want = new Set(preset.keys)
  const columns: Record<string, ColumnOverride> = { ...(stored.columns ?? {}) }
  for (const d of FIELDS) {
    if (!isToggleable(d) || d.mandatory) continue
    const show = want.has(d.key)
    const registryDefault = !!d.consoleDefault
    const o = { ...(columns[d.key] ?? {}) }
    if (show === registryDefault) delete o.show
    else o.show = show
    if (Object.keys(o).length) columns[d.key] = o
    else delete columns[d.key]
  }
  const next: StoredConfig = { ...stored }
  if (Object.keys(columns).length) next.columns = columns
  else delete next.columns
  return next
}

/**
 * The staging replica's column keys are the CONSOLE's names; the registry uses
 * this app's. The listing needs the mapping to honour a column the user hid on
 * the config page — see `stagingTokens.json` for the console-side names.
 */
export const STAGING_TO_FIELD: Record<string, string> = {
  orderNumber: 'orderNumber',
  referenceNumber: 'referenceNumber',
  shipByDate: 'shipByDate',
  state: 'state',
  carrier: 'carrier',
  secondaryState: 'secondaryState',
  dispatchDate: 'dispatchDate',
  weight: 'totalWeight',
  volume: 'totalVolume',
  palletSpaces: 'palletQuantity',
  sku: 'sku',
  serviceTime: 'serviceTime',
  tag: 'tags',
  specialInstructions: 'specialInstructions',
  merchant: 'merchant',
  orderType: 'orderType',
  ageing: 'ageing',
  address: 'shipToAddress',
}

/**
 * The staging columns the user has EXPLICITLY hidden.
 *
 * Derived from the stored overrides rather than from `resolveConfig`, on
 * purpose: several of these columns are `carriedBy` composites in our own
 * grammar (Secondary State rides on State, Ship To Address on Ship To), which
 * `resolveConfig` reports as `show: false` because they are not columns THERE.
 * On the replica they are columns of their own, so only a deliberate hide may
 * remove one.
 */
export function hiddenStagingColumns(stored: StoredConfig = loadStoredConfig()): Set<string> {
  const overrides = stored.columns ?? {}
  const out = new Set<string>()
  for (const [stagingKey, fieldKey] of Object.entries(STAGING_TO_FIELD)) {
    if (overrides[fieldKey]?.show === false) out.add(stagingKey)
  }
  return out
}
