/**
 * Field configuration for the Add Consignment page — models what staging's
 * Custom Settings → Modules → consignment_order screen does: per-field
 * show/hide and relabelling, with two hard rules:
 *
 *  1. MANDATORY fields cannot be hidden (API-required or account-required) —
 *     the toggle is locked. They can still be relabelled.
 *  2. DEPENDENCY fields follow their parent: hiding the parent hides the
 *     dependent field too (e.g. Order Amount depends on Payment Mode).
 *
 * `tier` marks which disclosure group a field sits in on the merged form:
 * 'core' fields render inline always; 'advanced' fields sit behind a
 * "Show more" affordance in their section, collapsed by default (or expanded,
 * per FormBehavior.defaultMode) — advanced is a UI grouping, NOT a hide: a
 * mandatory+advanced field just means it ships with a sensible auto-default
 * so it's never a blocking ask. `section` groups fields both on the form and
 * in the Form Builder drawer.
 *
 * SKU and Package fields are no longer modelled here — the merged form's
 * Packages widget (./packageSku.tsx) nests SKU lines inside each package and
 * manages its own field disclosure locally instead of through this registry.
 */

export const FIELD_SECTIONS = [
  'Identifiers & core',
  'Order details',
  'Payment',
  'Handling & scheduling',
  'Instructions',
  'Address details',
] as const
export type FieldSection = (typeof FIELD_SECTIONS)[number]

export interface FieldDef {
  key: string
  defaultLabel: string
  section: FieldSection
  /** cannot be hidden; source says why (api = spec-required, account = config-required) */
  mandatory?: 'api' | 'account'
  /** key of the field this one depends on — hidden automatically with its parent */
  dependsOn?: string
  tier: 'core' | 'advanced'
  apiPath: string
  note?: string
}

export const CONSIGNMENT_FIELDS: FieldDef[] = [
  /* ------------------------------------------------------ identifiers & core */
  { key: 'orderNumber', defaultLabel: 'Order Number', section: 'Identifiers & core', mandatory: 'api', tier: 'core',
    apiPath: 'consignmentDetails.orderNumber', note: 'Customer-visible order number, 4–64 chars; need not be unique.' },
  { key: 'referenceNumber', defaultLabel: 'Reference Number', section: 'Identifiers & core', mandatory: 'api', tier: 'advanced',
    apiPath: 'consignmentDetails.referenceNumber', note: 'Primary key in FarEye — unique per order. Mirrors Order Number by default so it is never a blocking ask; open "More identifiers" to set a distinct one.' },
  { key: 'consignmentNumber', defaultLabel: 'Consignment Number', section: 'Identifiers & core', tier: 'advanced',
    apiPath: 'consignmentDetails.consignmentNumber', note: 'Optional — defaults to Reference Number when blank.' },
  { key: 'exchangeOrderNumber', defaultLabel: 'Exchange Order Number', section: 'Identifiers & core', tier: 'advanced',
    apiPath: 'consignmentDetails.exchangeOrderNumber', note: 'Only shown when Consignment Type is Exchange.' },
  { key: 'consignmentType', defaultLabel: 'Consignment Type', section: 'Identifiers & core', mandatory: 'api', tier: 'core',
    apiPath: 'consignmentDetails.consignmentType' },
  { key: 'task', defaultLabel: 'Task', section: 'Identifiers & core', tier: 'core',
    apiPath: '(UI only — derives pickup/delivery orderType)' },
  { key: 'shipByDate', defaultLabel: 'Ship By Date', section: 'Identifiers & core', mandatory: 'api', tier: 'advanced',
    apiPath: 'consignmentDetails.shipByDate', note: 'Defaults to today so it is never a blocking ask; open "More identifiers" to change it.' },
  { key: 'merchant', defaultLabel: 'Merchant', section: 'Identifiers & core', mandatory: 'account', tier: 'core',
    apiPath: 'businessUnit / account mapping', note: 'Required by account configuration, not by the public API spec.' },

  /* ----------------------------------------------------------- order details */
  { key: 'tags', defaultLabel: 'Tags', section: 'Order details', tier: 'advanced', apiPath: 'consignmentDetails.routingTags[]' },
  { key: 'serviceType', defaultLabel: 'Service Type', section: 'Order details', tier: 'core',
    apiPath: 'consignmentDetails.serviceType' },
  { key: 'labelFormat', defaultLabel: 'Label Format', section: 'Order details', tier: 'advanced',
    apiPath: 'consignmentDetails.labelFormat' },
  { key: 'routingType', defaultLabel: 'Routing Type', section: 'Order details', tier: 'advanced',
    apiPath: 'consignmentDetails.routingType',
    note: "Staging's options: Same/Next Day, LTL/FTL, Scheduled, Hyperlocal." },

  /* ----------------------------------------------------------------- payment */
  { key: 'paymentMode', defaultLabel: 'Payment Mode', section: 'Payment', tier: 'advanced',
    apiPath: 'consignmentDetails.paymentTobeCollected.paymentMode' },
  { key: 'orderAmount', defaultLabel: 'Order Amount', section: 'Payment', dependsOn: 'paymentMode', tier: 'advanced',
    apiPath: 'consignmentDetails.paymentTobeCollected.amount',
    note: 'Dependency: only meaningful with a Payment Mode — API requires paymentMode+amount+currency together.' },

  /* --------------------------------------------------- handling & scheduling */
  { key: 'schedulingConfirmation', defaultLabel: 'Scheduling Confirmation Required', section: 'Handling & scheduling', tier: 'advanced',
    apiPath: 'consignmentDetails.schedulingConfirmationRequired (v3)' },
  { key: 'dedicateTruck', defaultLabel: 'Dedicate Truck', section: 'Handling & scheduling', tier: 'advanced',
    apiPath: 'consignmentDetails.dedicatedTruck (v3)' },
  { key: 'totalLoadingTime', defaultLabel: 'Total Loading Time (minutes)', section: 'Handling & scheduling', dependsOn: 'dedicateTruck', tier: 'advanced',
    apiPath: 'consignmentDetails.totalLoadingTime (v3)',
    note: 'Dependency: loading time only applies when a dedicated truck is requested.' },
  { key: 'clearanceRequired', defaultLabel: 'Clearance Required', section: 'Handling & scheduling', tier: 'advanced',
    apiPath: 'consignmentDetails.clearanceRequired (v3)' },
  { key: 'scannable', defaultLabel: 'Scannable', section: 'Handling & scheduling', tier: 'advanced',
    apiPath: 'consignmentDetails.scannable (v3)' },
  { key: 'splittable', defaultLabel: 'Splittable', section: 'Handling & scheduling', tier: 'advanced',
    apiPath: 'consignmentDetails.splittable (v3)' },

  /* ------------------------------------------------------------ instructions */
  { key: 'specialInstructions', defaultLabel: 'Special Instructions', section: 'Instructions', tier: 'core',
    apiPath: 'consignmentDetails.specialInstructions' },
  { key: 'deliveryInstructions', defaultLabel: 'Delivery Instructions', section: 'Instructions', tier: 'core',
    apiPath: 'consignmentDetails.deliveryInstructions' },

  /* -------------------------------------------------- address details (both
     parties; grouped keys hide their whole composite together) */
  { key: 'addrCompanyName', defaultLabel: 'Company Name', section: 'Address details', tier: 'core',
    apiPath: 'shipFrom/shipTo.contact.companyName' },
  { key: 'addrEmail', defaultLabel: 'Email', section: 'Address details', tier: 'core',
    apiPath: 'shipFrom/shipTo.contact.email' },
  { key: 'addrLines23', defaultLabel: 'Address Lines 2 & 3', section: 'Address details', tier: 'core',
    apiPath: 'address.line2 / line3', note: 'Grouped — both extra address lines hide together.' },
  { key: 'addrLandmark', defaultLabel: 'Landmark', section: 'Address details', tier: 'core',
    apiPath: 'address.landmark' },
  { key: 'addrSuburb', defaultLabel: 'Suburb / County', section: 'Address details', tier: 'core',
    apiPath: 'address.county' },
  { key: 'addrCoordinates', defaultLabel: 'Latitude & Longitude', section: 'Address details', tier: 'advanced',
    apiPath: 'address.latitude / longitude', note: 'Grouped — both coordinates hide together.' },
  { key: 'addrFloorLift', defaultLabel: 'Floor Number & Lift', section: 'Address details', tier: 'advanced',
    apiPath: 'address floor / lift', note: 'Grouped — floor number and lift availability hide together.' },
  { key: 'addrWindow', defaultLabel: 'Pickup / Delivery Window', section: 'Address details', tier: 'advanced',
    apiPath: 'pickupWindow / deliveryWindow', note: 'Most shipments do not need one specified.' },
  { key: 'addrFacilityCode', defaultLabel: 'Facility / Hub Code', section: 'Address details', tier: 'advanced',
    apiPath: 'originFacilityCode / destinationFacilityCode / returnFacilityCode',
    note: 'Manual override — the search-and-pick address flow sets this automatically.' },
]

export interface FieldOverride {
  hidden?: boolean
  label?: string
  /** explicit sequence within the field's section; lower = earlier. Absent =
   * fall back to the registry order. Set by the on-form Form Builder (drag-drop). */
  order?: number
}
export type FieldConfig = Record<string, FieldOverride>

/** registry index — the default order when no override exists */
const REG_INDEX = new Map(CONSIGNMENT_FIELDS.map((f, i) => [f.key, i]))

/** all fields of a section, in the configured order (override.order, else registry order) */
export function orderedSectionFields(section: FieldSection, cfg: FieldConfig): FieldDef[] {
  return CONSIGNMENT_FIELDS
    .filter((f) => f.section === section)
    .slice()
    .sort((a, b) => (cfg[a.key]?.order ?? REG_INDEX.get(a.key)!) - (cfg[b.key]?.order ?? REG_INDEX.get(b.key)!))
}

/** visible fields of a section, in configured order — what the form renders */
export function visibleSectionFields(section: FieldSection, cfg: FieldConfig, behavior?: FormBehavior): FieldDef[] {
  return orderedSectionFields(section, cfg).filter((f) => !fieldHidden(f.key, cfg, behavior))
}

/* -------- form behavior — configured in Base Modules → Consignment Order ----
 * Persisted in the CONSIGNMENT_MANAGEMENT moduleSettings row (settingJson.form)
 * so it is REAL account configuration; mirrored to localStorage so the Add
 * form can read it synchronously on first paint. */
export interface FormBehavior {
  /** whether the merged form's "Show more" advanced disclosures start open
   * ('full') or collapsed ('simplified') — same key/values as the old
   * page-tier toggle, reinterpreted now that there is one form, not two. */
  defaultMode: 'simplified' | 'full'
  /** 'both' shows the pair; otherwise only the chosen one shows and the other
   * silently copies its value */
  identifier: 'both' | 'orderNumber' | 'referenceNumber'
  /** field keys switched off in Base Modules — hidden from add/edit/view,
   * table columns and filters */
  hidden: string[]
}

export const DEFAULT_FORM_BEHAVIOR: FormBehavior = { defaultMode: 'simplified', identifier: 'both', hidden: [] }

const BEHAVIOR_KEY = 'fe-consignment-form-behavior'

export function loadFormBehavior(): FormBehavior {
  try {
    const raw = localStorage.getItem(BEHAVIOR_KEY)
    const parsed = raw ? JSON.parse(raw) as Partial<FormBehavior> : {}
    return { ...DEFAULT_FORM_BEHAVIOR, ...parsed, hidden: Array.isArray(parsed.hidden) ? parsed.hidden : [] }
  } catch {
    return DEFAULT_FORM_BEHAVIOR
  }
}

export function cacheFormBehavior(b: FormBehavior) {
  try { localStorage.setItem(BEHAVIOR_KEY, JSON.stringify(b)) } catch { /* private mode */ }
}

/** refresh from the moduleSettings row (the source of truth) */
export async function fetchFormBehavior(): Promise<FormBehavior> {
  const { fetchModuleSettings } = await import('../../nueva/settingsApi')
  try {
    const rows = await fetchModuleSettings(['CONSIGNMENT_MANAGEMENT'])
    const json = rows[0]?.settingJson
    const parsed = json ? JSON.parse(json) as { form?: Partial<FormBehavior> } : {}
    const b: FormBehavior = {
      ...DEFAULT_FORM_BEHAVIOR,
      ...(parsed.form ?? {}),
      hidden: Array.isArray(parsed.form?.hidden) ? parsed.form!.hidden! : [],
    }
    cacheFormBehavior(b)
    return b
  } catch {
    return loadFormBehavior()
  }
}

const STORAGE_KEY = 'fe-consignment-field-config'

export function loadFieldConfig(): FieldConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : {}
    return typeof parsed === 'object' && parsed !== null ? (parsed as FieldConfig) : {}
  } catch {
    return {}
  }
}

export function saveFieldConfig(cfg: FieldConfig) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg)) } catch { /* private mode */ }
}

/** wipe all overrides — the Form Builder "Reset to default" action */
export function resetFieldConfig(): FieldConfig {
  try { localStorage.removeItem(STORAGE_KEY) } catch { /* private mode */ }
  return {}
}

const byKey = new Map(CONSIGNMENT_FIELDS.map((f) => [f.key, f]))

/** the mandatory source for a field ('api' | 'account'), or undefined if optional */
export function byKeyMandatory(key: string): 'api' | 'account' | undefined {
  return byKey.get(key)?.mandatory
}

/** which disclosure group a field belongs to — 'core' if unknown */
export function fieldTier(key: string): 'core' | 'advanced' {
  return byKey.get(key)?.tier ?? 'core'
}

export function fieldLabel(key: string, cfg: FieldConfig): string {
  const def = byKey.get(key)
  return cfg[key]?.label?.trim() || def?.defaultLabel || key
}

/** hidden if switched off (page config OR Base Modules behavior), or if its
 * parent is hidden. Disclosure tier ('core'/'advanced') is a UI grouping,
 * NOT a hide — an advanced field is still reachable, just collapsed. */
export function fieldHidden(key: string, cfg: FieldConfig, behavior?: FormBehavior): boolean {
  const def = byKey.get(key)
  if (!def) return false
  if (def.mandatory) return false
  if (cfg[key]?.hidden) return true
  if (behavior?.hidden.includes(key)) return true
  if (def.dependsOn) return fieldHidden(def.dependsOn, cfg, behavior)
  return false
}

/** a section disappears entirely once every one of its fields is hidden */
export function sectionVisible(section: FieldSection, cfg: FieldConfig, behavior?: FormBehavior): boolean {
  return CONSIGNMENT_FIELDS.filter((f) => f.section === section)
    .some((f) => !fieldHidden(f.key, cfg, behavior))
}
