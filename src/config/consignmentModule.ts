/**
 * Consignment Order module mirror — staging's Base Modules → Consignment Order
 * (moduleSettings code `CONSIGNMENT_MANAGEMENT`), for the LOCAL app
 * (`/local/settings/consignment-order`), persisted in localStorage.
 *
 * Shape follows the staging settingJson: `enabled`, `userTypeList`,
 * `modifyConsignmentTill`, `dateAppliedOn`, `selectedDateRange`, and the
 * pageRenderingConfig's shown columns / filters — kept here as ORDERED key
 * lists (sequence = position) instead of `{key:{show,sequence}}` maps.
 * Vocabulary: `consignmentModuleUniverse.ts` (shared with nueva/ModuleDetail).
 *
 * Defaults = the staging account's current values (2026-09-24). Bundle
 * defaults for an account with no row: dateAppliedOn `created_at`,
 * selectedDateRange -7, modifyConsignmentTill `rfd`.
 *
 * READERS — only once the settings page has been saved in this browser
 * (`consignmentModuleSaved()`): `/local/consignments` (and the Pickup page's
 * Eligible tab, same column hook) take their default visible columns, in
 * sequence, from `tableColumns` (a per-grid ⚙ choice still wins), and the list
 * takes its date preset from `dateAppliedOn` + `selectedDateRange`.
 * `enabled`, `userTypes`, `modifyConsignmentTill` and `filters` are stored only.
 *
 * No imports from src/auth, nothing that fetches — safe for every app.
 */
import {
  CONSIGNMENT_COLUMN_UNIVERSE, CONSIGNMENT_DATE_FIELDS, CONSIGNMENT_DATE_RANGES, CONSIGNMENT_DEFAULT_COLUMNS,
  CONSIGNMENT_DEFAULT_FILTERS, CONSIGNMENT_FILTER_UNIVERSE, CONSIGNMENT_USER_TYPES, MODIFY_CONSIGNMENT_TILL_OPTIONS,
  type ConsignmentDateField, type ConsignmentDateRange, type ModifyConsignmentTill,
} from './consignmentModuleUniverse'
import { asRecord, bool, createLocalConfigStore, oneOf } from './localConfigStore'

export interface ConsignmentModuleConfig {
  /** the Base Modules card switch */
  enabled: boolean
  /** General → User Types (staging stores `userTypeList`) */
  userTypes: string[]
  /** General → Feature Settings → "Modify consignment Action till" */
  modifyConsignmentTill: ModifyConsignmentTill
  /** Date Filter → Default Date Field */
  dateAppliedOn: ConsignmentDateField
  /** Date Filter → Default Date range (day offset from today) */
  selectedDateRange: ConsignmentDateRange
  /** Table Configuration — shown columns, in sequence order */
  tableColumns: string[]
  /** On Page Filters — shown filters, in sequence order */
  filters: string[]
}

export const CONSIGNMENT_MODULE_KEY = 'fareye-consignment-module-config-v1'

export const DEFAULT_CONSIGNMENT_MODULE_CONFIG: ConsignmentModuleConfig = Object.freeze({
  enabled: true,
  userTypes: [],
  modifyConsignmentTill: 'rfd',
  dateAppliedOn: 'ship_to_delivery_date',
  selectedDateRange: 0,
  tableColumns: CONSIGNMENT_DEFAULT_COLUMNS,
  filters: CONSIGNMENT_DEFAULT_FILTERS,
}) as ConsignmentModuleConfig

/** Ordered, de-duplicated keys that belong to `universe`; also reads a staging `{key:{show,sequence}}` map. */
function keyList(v: unknown, universe: string[], d: string[], allowEmpty: boolean): string[] {
  let keys: string[] | null = null
  if (Array.isArray(v)) keys = v.filter((k): k is string => typeof k === 'string')
  else if (v && typeof v === 'object') {
    keys = Object.entries(v as Record<string, { show?: unknown; sequence?: unknown }>)
      .filter(([, x]) => x && x.show === true)
      .sort((a, b) => Number(a[1].sequence ?? 0) - Number(b[1].sequence ?? 0))
      .map(([k]) => k)
  }
  if (!keys) return d
  const out = [...new Set(keys.filter((k) => universe.includes(k)))]
  return out.length || allowEmpty ? out : d
}

export function normalizeConsignmentModuleConfig(raw: unknown): ConsignmentModuleConfig {
  const o = asRecord(raw)
  const d = DEFAULT_CONSIGNMENT_MODULE_CONFIG
  const prc = asRecord(o.pageRenderingConfig)
  const userTypes = Array.isArray(o.userTypes) ? o.userTypes : Array.isArray(o.userTypeList) ? o.userTypeList : d.userTypes
  return {
    enabled: bool(o.enabled, d.enabled),
    userTypes: [...new Set((userTypes as unknown[]).filter((u): u is string => typeof u === 'string' && CONSIGNMENT_USER_TYPES.includes(u)))],
    modifyConsignmentTill: oneOf(o.modifyConsignmentTill, MODIFY_CONSIGNMENT_TILL_OPTIONS.map((x) => x.code), d.modifyConsignmentTill),
    dateAppliedOn: oneOf(o.dateAppliedOn, CONSIGNMENT_DATE_FIELDS.map((x) => x.code), d.dateAppliedOn),
    selectedDateRange: oneOf(o.selectedDateRange, CONSIGNMENT_DATE_RANGES.map((x) => x.code), d.selectedDateRange),
    /* a grid needs at least one column; filters may all be off */
    tableColumns: keyList(o.tableColumns ?? asRecord(prc.table).columns, CONSIGNMENT_COLUMN_UNIVERSE, d.tableColumns, false),
    filters: keyList(o.filters ?? prc.filters, CONSIGNMENT_FILTER_UNIVERSE, d.filters, true),
  }
}

const store = createLocalConfigStore(CONSIGNMENT_MODULE_KEY, DEFAULT_CONSIGNMENT_MODULE_CONFIG, normalizeConsignmentModuleConfig)

export const readConsignmentModuleConfig = store.read
export const writeConsignmentModuleConfig = store.write
export const useConsignmentModuleConfig = store.use
/** true once the settings page has saved in this browser — gates the list's date preset */
export const consignmentModuleSaved = store.isSaved

/** `selectedDateRange` → an inclusive `YYYY-MM-DD` window around today. */
export function dateRangeWindow(offset: number, today = new Date()): { from: string; to: string } {
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const other = new Date(today)
  other.setDate(other.getDate() + offset)
  return offset < 0 ? { from: iso(other), to: iso(today) } : { from: iso(today), to: iso(other) }
}
