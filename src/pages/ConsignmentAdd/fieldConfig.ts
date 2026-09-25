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
 * `form` marks which tier a field belongs to: 'simplified' fields appear in
 * both forms; 'full' fields only in the full form. API-mandatory fields are
 * all in the simplified tier by construction. `section` groups fields both on
 * the form and in the Configure Fields modal.
 */

export const FIELD_SECTIONS = [
  'Identifiers & core',
  'Order details',
  'Payment',
  'Handling & scheduling',
  'Instructions',
  'Address details',
  'SKU fields',
  'Package fields',
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
  form: 'simplified' | 'full'
  apiPath: string
  note?: string
}

export const CONSIGNMENT_FIELDS: FieldDef[] = [
  /* ------------------------------------------------------ identifiers & core */
  { key: 'orderNumber', defaultLabel: 'Order Number', section: 'Identifiers & core', mandatory: 'api', form: 'simplified',
    apiPath: 'consignmentDetails.orderNumber', note: 'Customer-visible order number, 4–64 chars; need not be unique.' },
  { key: 'referenceNumber', defaultLabel: 'Reference Number', section: 'Identifiers & core', mandatory: 'api', form: 'simplified',
    apiPath: 'consignmentDetails.referenceNumber', note: 'Primary key in FarEye — unique per order; update/cancel/track key on it.' },
  { key: 'consignmentNumber', defaultLabel: 'Consignment Number', section: 'Identifiers & core', form: 'full',
    apiPath: 'consignmentDetails.consignmentNumber', note: 'Optional — defaults to Reference Number when blank.' },
  { key: 'exchangeOrderNumber', defaultLabel: 'Exchange Order Number', section: 'Identifiers & core', form: 'full',
    apiPath: 'consignmentDetails.exchangeOrderNumber', note: 'Only shown when Consignment Type is Exchange.' },
  { key: 'consignmentType', defaultLabel: 'Consignment Type', section: 'Identifiers & core', mandatory: 'api', form: 'simplified',
    apiPath: 'consignmentDetails.consignmentType' },
  { key: 'task', defaultLabel: 'Task', section: 'Identifiers & core', form: 'simplified',
    apiPath: '(UI only — derives pickup/delivery orderType)' },
  { key: 'shipByDate', defaultLabel: 'Ship By Date', section: 'Identifiers & core', mandatory: 'api', form: 'simplified',
    apiPath: 'consignmentDetails.shipByDate' },
  { key: 'merchant', defaultLabel: 'Merchant', section: 'Identifiers & core', mandatory: 'account', form: 'simplified',
    apiPath: 'businessUnit / account mapping', note: 'Required by account configuration, not by the public API spec.' },

  /* ----------------------------------------------------------- order details */
  { key: 'tags', defaultLabel: 'Tags', section: 'Order details', form: 'full', apiPath: 'consignmentDetails.routingTags[]' },
  { key: 'serviceType', defaultLabel: 'Service Type', section: 'Order details', form: 'simplified',
    apiPath: 'consignmentDetails.serviceType', note: "Staging's simplified form includes Service Type." },
  { key: 'labelFormat', defaultLabel: 'Label Format', section: 'Order details', form: 'full',
    apiPath: 'consignmentDetails.labelFormat' },
  { key: 'routingType', defaultLabel: 'Routing Type', section: 'Order details', form: 'full',
    apiPath: 'consignmentDetails.routingType',
    note: "Staging's options: Same/Next Day, LTL/FTL, Scheduled, Hyperlocal." },

  /* ----------------------------------------------------------------- payment */
  { key: 'paymentMode', defaultLabel: 'Payment Mode', section: 'Payment', form: 'full',
    apiPath: 'consignmentDetails.paymentTobeCollected.paymentMode' },
  { key: 'orderAmount', defaultLabel: 'Order Amount', section: 'Payment', dependsOn: 'paymentMode', form: 'full',
    apiPath: 'consignmentDetails.paymentTobeCollected.amount',
    note: 'Dependency: only meaningful with a Payment Mode — API requires paymentMode+amount+currency together.' },

  /* --------------------------------------------------- handling & scheduling */
  { key: 'schedulingConfirmation', defaultLabel: 'Scheduling Confirmation Required', section: 'Handling & scheduling', form: 'full',
    apiPath: 'consignmentDetails.schedulingConfirmationRequired (v3)' },
  { key: 'dedicateTruck', defaultLabel: 'Dedicate Truck', section: 'Handling & scheduling', form: 'full',
    apiPath: 'consignmentDetails.dedicatedTruck (v3)' },
  { key: 'totalLoadingTime', defaultLabel: 'Total Loading Time (minutes)', section: 'Handling & scheduling', dependsOn: 'dedicateTruck', form: 'full',
    apiPath: 'consignmentDetails.totalLoadingTime (v3)',
    note: 'Dependency: loading time only applies when a dedicated truck is requested.' },
  { key: 'clearanceRequired', defaultLabel: 'Clearance Required', section: 'Handling & scheduling', form: 'full',
    apiPath: 'consignmentDetails.clearanceRequired (v3)' },
  { key: 'scannable', defaultLabel: 'Scannable', section: 'Handling & scheduling', form: 'full',
    apiPath: 'consignmentDetails.scannable (v3)' },
  { key: 'splittable', defaultLabel: 'Splittable', section: 'Handling & scheduling', form: 'full',
    apiPath: 'consignmentDetails.splittable (v3)' },

  /* ------------------------------------------------------------ instructions */
  { key: 'specialInstructions', defaultLabel: 'Special Instructions', section: 'Instructions', form: 'full',
    apiPath: 'consignmentDetails.specialInstructions' },
  { key: 'deliveryInstructions', defaultLabel: 'Delivery Instructions', section: 'Instructions', form: 'full',
    apiPath: 'consignmentDetails.deliveryInstructions' },

  /* -------------------------------------------------- address details (both
     parties; grouped keys hide their whole composite together) */
  { key: 'addrCompanyName', defaultLabel: 'Company Name', section: 'Address details', form: 'simplified',
    apiPath: 'shipFrom/shipTo.contact.companyName' },
  { key: 'addrEmail', defaultLabel: 'Email', section: 'Address details', form: 'simplified',
    apiPath: 'shipFrom/shipTo.contact.email' },
  { key: 'addrLines23', defaultLabel: 'Address Lines 2 & 3', section: 'Address details', form: 'simplified',
    apiPath: 'address.line2 / line3', note: 'Grouped — both extra address lines hide together.' },
  { key: 'addrLandmark', defaultLabel: 'Landmark', section: 'Address details', form: 'simplified',
    apiPath: 'address.landmark' },
  { key: 'addrSuburb', defaultLabel: 'Suburb / County', section: 'Address details', form: 'simplified',
    apiPath: 'address.county' },
  { key: 'addrCoordinates', defaultLabel: 'Latitude & Longitude', section: 'Address details', form: 'simplified',
    apiPath: 'address.latitude / longitude', note: 'Grouped — both coordinates hide together.' },
  { key: 'addrFloorLift', defaultLabel: 'Floor Number & Lift', section: 'Address details', form: 'full',
    apiPath: 'address floor / lift', note: 'Grouped — floor number and lift availability hide together.' },
  { key: 'addrWindow', defaultLabel: 'Pickup / Delivery Window', section: 'Address details', form: 'simplified',
    apiPath: 'pickupWindow / deliveryWindow' },

  /* ------------------------------------------------------------- SKU fields */
  { key: 'skuCategory', defaultLabel: 'SKU Category', section: 'SKU fields', form: 'simplified',
    apiPath: 'skuDetails[].category' },
  { key: 'skuDescription', defaultLabel: 'SKU Description', section: 'SKU fields', form: 'simplified',
    apiPath: 'skuDetails[].description' },
  { key: 'skuHsn', defaultLabel: 'HSN Code', section: 'SKU fields', form: 'simplified',
    apiPath: 'skuDetails[].hsnName' },
  { key: 'skuImage', defaultLabel: 'Image Url', section: 'SKU fields', form: 'simplified',
    apiPath: 'skuDetails[].imageUrl' },
  { key: 'skuDimensions', defaultLabel: 'Dimensions (L × B × H + UOM)', section: 'SKU fields', form: 'simplified',
    apiPath: 'skuDetails[].length/breadth/height/uom',
    note: 'Grouped — the whole dimensions control hides together; values still auto-fill from the SKU master.' },
  { key: 'skuWeight', defaultLabel: 'Weight (+ UOM)', section: 'SKU fields', form: 'simplified',
    apiPath: 'skuDetails[].weight/weightUom', note: 'Grouped — weight and its unit hide together.' },
  { key: 'skuUnitCost', defaultLabel: 'Unit Cost', section: 'SKU fields', form: 'simplified',
    apiPath: 'skuDetails[].unitCost' },

  /* --------------------------------------------------------- package fields */
  { key: 'pkgTracking', defaultLabel: 'Tracking Number', section: 'Package fields', form: 'simplified',
    apiPath: 'packageDetails[].trackingDetails', note: 'Auto-generated when hidden or empty.' },
  { key: 'pkgPalletSpace', defaultLabel: 'Pallet Space', section: 'Package fields', form: 'simplified',
    apiPath: 'packageDetails[].palletSpace' },
  { key: 'pkgDescription', defaultLabel: 'Package Description', section: 'Package fields', form: 'simplified',
    apiPath: 'packageDetails[].description' },
  { key: 'pkgDimensions', defaultLabel: 'Dimensions (L × W × H)', section: 'Package fields', form: 'simplified',
    apiPath: 'packageDetails[].length/width/height',
    note: 'Grouped — hides together; values still auto-fill from the package type master.' },
  { key: 'pkgWeight', defaultLabel: 'Weight', section: 'Package fields', form: 'simplified',
    apiPath: 'packageDetails[].weight' },
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
export function visibleSectionFields(section: FieldSection, cfg: FieldConfig, mode: 'simplified' | 'full', behavior?: FormBehavior): FieldDef[] {
  return orderedSectionFields(section, cfg).filter((f) => !fieldHidden(f.key, cfg, mode, behavior))
}

/* -------- form behavior — configured in Base Modules → Consignment Order ----
 * Persisted in the CONSIGNMENT_MANAGEMENT moduleSettings row (settingJson.form)
 * so it is REAL account configuration; mirrored to localStorage so the Add
 * form can read it synchronously on first paint. */
export interface FormBehavior {
  /** which form tier Add Consignment opens in */
  defaultMode: 'simplified' | 'full'
  /** 'both' shows the pair; otherwise only the chosen one shows and the other
   * silently copies its value */
  identifier: 'both' | 'orderNumber' | 'referenceNumber'
  /** field keys switched off in Base Modules — hidden from add/edit/view,
   * table columns and filters */
  hidden: string[]
  /** optional field keys the account makes REQUIRED (the local app's Consignment Order →
   * Form Fields tab). Honoured by the Grow merchant order form; the console Add form keeps
   * staging's own required set. Absent on a staging row = none. */
  required?: string[]
}

export const DEFAULT_FORM_BEHAVIOR: FormBehavior = { defaultMode: 'full', identifier: 'both', hidden: [] }

const BEHAVIOR_KEY = 'fe-consignment-form-behavior'

export function loadFormBehavior(): FormBehavior {
  try {
    const raw = localStorage.getItem(BEHAVIOR_KEY)
    const parsed = raw ? JSON.parse(raw) as Partial<FormBehavior> : {}
    return {
      ...DEFAULT_FORM_BEHAVIOR, ...parsed,
      hidden: Array.isArray(parsed.hidden) ? parsed.hidden : [],
      required: Array.isArray(parsed.required) ? parsed.required.filter((k): k is string => typeof k === 'string') : [],
    }
  } catch {
    return DEFAULT_FORM_BEHAVIOR
  }
}

export function cacheFormBehavior(b: FormBehavior) {
  /* a writer that does not know `required` (console Base Modules, the staging fetch) keeps the local rules */
  const next = b.required === undefined ? { ...b, required: loadFormBehavior().required } : b
  try { localStorage.setItem(BEHAVIOR_KEY, JSON.stringify(next)) } catch { /* private mode */ }
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

export function fieldLabel(key: string, cfg: FieldConfig): string {
  const def = byKey.get(key)
  return cfg[key]?.label?.trim() || def?.defaultLabel || key
}

/** hidden if switched off (page config OR Base Modules behavior), if its
 * parent is hidden, or if it's a full-form field in simplified mode */
export function fieldHidden(key: string, cfg: FieldConfig, mode: 'simplified' | 'full', behavior?: FormBehavior): boolean {
  const def = byKey.get(key)
  if (!def) return false
  if (mode === 'simplified' && def.form === 'full') return true
  if (def.mandatory) return false
  if (cfg[key]?.hidden) return true
  if (behavior?.hidden.includes(key)) return true
  if (def.dependsOn) return fieldHidden(def.dependsOn, cfg, mode, behavior)
  return false
}

/** a section disappears entirely once every one of its fields is hidden */
export function sectionVisible(section: FieldSection, cfg: FieldConfig, mode: 'simplified' | 'full', behavior?: FormBehavior): boolean {
  return CONSIGNMENT_FIELDS.filter((f) => f.section === section)
    .some((f) => !fieldHidden(f.key, cfg, mode, behavior))
}
