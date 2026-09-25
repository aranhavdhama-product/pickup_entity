/** Service & Order masters — live on /master/api/v1 (schemas probed 2026-08-27).
 *
 * Staging (bundle chunk 18702) reference per master:
 * - serviceType   — cols Name/Code/Consignment Types/Status; filters name/code/
 *                   status; consignmentTypeCodes is written as a JSON-stringified
 *                   array (older/bulk rows may be comma-joined — we parse both).
 * - packageType   — "Setup Standard Packages with their dimensions"; form REQUIRES
 *                   Length/Breadth/Height/Unit of measure; Weight Unit mandatory
 *                   once weight is set; Business Unit select (writes businessUnitId
 *                   — server resolves businessUnitCode/Name); staging also shows a
 *                   "Service type" select but the API does not persist it (fetch
 *                   rows never carry it) so it is left off; filters name/code/status.
 * - consignmentType — code/name only; filters name/code/status.
 * - vas           — form: Description REQUIRED, Service Time Default/Additional
 *                   (minutes) REQUIRED, VAS Category select (Unloading/White
 *                   glove/Removals), Execution Time select (Pre/Post activity),
 *                   Skill multi (tagMaster codes) + Hierarchy multi (other VAS) —
 *                   both real arrays on the wire; cols add Description/Skill/
 *                   Hierarchy; serviceTimeMax is API-persisted (kept) though
 *                   staging's form omits it.
 * - sortCode      — code/name; filters name/code/status.
 * - slot          — snake_case + ALL-STRING master; Slot Start/End Time REQUIRED;
 *                   staging validates HH:MM, break start/end required together,
 *                   break end after start.
 * - palletSpace   — staging filters Package Type + Business Unit; validates
 *                   whole-number quantity and palletSpace > 0; NO code input —
 *                   staging derives code = BUSINESSUNIT_PACKAGETYPE on submit
 *                   (ours auto-fills the same when left blank); roundUp defaults
 *                   false, palletSpace defaults 1; no name field.
 * - customBusinessParameter — {code,name,sequence,values[]}; staging's editor
 *                   sorts sequence ASC (sequence = row order), generates code
 *                   from name (lower_snake_case), tags-input values; its own
 *                   Excel endpoint 400s ("excel not supported").
 */
import { useState } from 'react'
import { ArrowRightLeft, Boxes, CalendarClock, Clock3, Package, SlidersHorizontal, Sparkles, X } from 'lucide-react'
import type { LiveMasterConfig } from '../LiveMaster'
import { fetchMasterRows, type MasterRecord } from '../settingsApi'
import { CODE_NAME_COLUMNS, labeledCodesOf, SVC } from './shared'
import { LOAD_TYPE_LABELS, loadTypeOf, parseLoadType, SERVICE_TYPE_META } from '../../growOrders/draft'

const VAS_CATEGORY_LABELS: Record<string, string> = { UNLOADING: 'Unloading', WHITE_GLOVE: 'White glove', REMOVALS: 'Removals' }
const EXECUTION_LABELS: Record<string, string> = { PRE_ACTIVITY: 'Pre activity', POST_ACTIVITY: 'Post activity' }

/** merchant options for packageType — the wire field is businessUnitId (number),
 * so the stored value is the id; the label still reads "Name (code)" */
const businessUnitIdOptions = () =>
  fetchMasterRows('businessUnit').then((rs) => rs
    .filter((r) => r.id != null && r.code)
    .map((r) => ({ value: String(r.id), label: `${String(r.name ?? r.code)} (${String(r.code)})` })))

const strv = (v: unknown) => String(v ?? '').trim()
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/

/** consignmentTypeCodes on the wire is a STRING in either of two formats:
 * staging's own forms write a JSON-stringified array ('["forward"]'), older /
 * bulk rows are comma-joined ('forward,b2b_delivery'). Parse both (staging's
 * hw() helper JSON.parses and shows nothing for the comma form — we render
 * both). */
const codesArr = (v: unknown): string[] => {
  if (Array.isArray(v)) return v.map(String)
  const s = strv(v)
  if (!s) return []
  if (s.startsWith('[')) {
    try { return (JSON.parse(s) as unknown[]).map(String) } catch { /* fall through */ }
  }
  return s.split(',').map((t) => t.trim()).filter(Boolean)
}

/** the wire format staging's own forms write (JSON-stringified array) — kept
 * so rows we save render correctly in the real staging console too */
const codesWire = (v: unknown): string => JSON.stringify(codesArr(v))

/** list loader that joins consignmentType names onto the consignmentTypeCodes
 * string (staging's table maps codes → names the same way); the codes land as
 * a real ARRAY on the row (so multi fields/views work) and the display value
 * on a synthetic consignmentTypeNames key */
const withConsignmentTypeNames = (entity: string) => () =>
  Promise.all([fetchMasterRows(entity), fetchMasterRows('consignmentType')]).then(([rows, cts]) => {
    const names = new Map(cts.map((c) => [String(c.code), String(c.name ?? c.code)]))
    return rows.map((r) => {
      const codes = codesArr(r.consignmentTypeCodes)
      return {
        ...r,
        consignmentTypeCodes: codes,
        consignmentTypeNames: codes.map((c) => names.get(c) ?? c).join(', '),
      }
    })
  })

const consignmentTypesColumn = {
  key: 'consignmentTypeNames',
  label: 'Consignment Types',
  render: (r: MasterRecord) => String(r.consignmentTypeNames ?? '') || '—',
}

/**
 * "Load type" (LTL only · FTL only · LTL & FTL) — READ-ONLY here. staging's serviceType rows
 * carry no such field, so it is not a form field (a POST would send an unknown key): a row that
 * ever carries `loadType` shows it, every other row shows the prototype default for its code/name
 * (draft.ts `defaultLoadType` — by service name: LTL/LCL → LTL only, FTL/FCL → FTL only, else LTL & FTL).
 */
const loadTypeColumn = {
  key: 'loadType',
  label: 'Load type',
  render: (r: MasterRecord) => LOAD_TYPE_LABELS[parseLoadType(r.loadType)
    ?? (SERVICE_TYPE_META[String(r.code ?? '')] ? loadTypeOf(String(r.code)) : loadTypeOf(String(r.name ?? '')))],
}

/** design-system tag editor for free-form value lists (Business Parameter) —
 * Enter/comma adds, Backspace removes the last, blur commits the rest */
function TagInput({ value, readOnly, placeholder, onChange }: {
  value: string[]
  readOnly?: boolean
  placeholder?: string
  onChange: (next: string[]) => void
}) {
  const [text, setText] = useState('')
  const chips = (
    <>
      {value.map((v) => (
        <span key={v} className="inline-flex items-center gap-1 rounded-full bg-warm-100 px-2.5 py-0.5 text-[12px] text-ink">
          {v}
          {!readOnly && (
            <button type="button" className="text-ink-3 hover:text-ink" onClick={() => onChange(value.filter((x) => x !== v))}>
              <X size={11} />
            </button>
          )}
        </span>
      ))}
    </>
  )
  if (readOnly) return <div className="flex flex-wrap gap-1.5">{value.length ? chips : <span className="text-[13.5px] text-ink">—</span>}</div>
  const commit = (raw: string) => {
    const parts = raw.split(/[,;]/).map((s) => s.trim()).filter(Boolean)
    if (parts.length) onChange([...new Set([...value, ...parts])])
  }
  return (
    <div className="flex min-h-9 flex-wrap items-center gap-1.5 rounded-md border border-line bg-surface px-2 py-1.5 transition-colors focus-within:border-brand-500">
      {chips}
      <input
        value={text}
        placeholder={value.length ? '' : placeholder}
        className="min-w-[180px] flex-1 bg-transparent text-[13px] text-ink outline-none placeholder:text-ink-3"
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); commit(text); setText('') }
          else if (e.key === 'Backspace' && !text && value.length) onChange(value.slice(0, -1))
        }}
        onBlur={() => { if (text.trim()) { commit(text); setText('') } }} />
    </div>
  )
}

export const SERVICEORDER_MASTERS: Record<string, LiveMasterConfig> = {
  'service-type': {
    entity: 'serviceType', title: 'Service Type', noun: 'service type',
    subtitle: 'Add various services offered by your carriers, this helps in setting up & managing serviceability',
    catPath: SVC,
    fetchRows: withConsignmentTypeNames('serviceType'),
    columns: [...CODE_NAME_COLUMNS, consignmentTypesColumn, loadTypeColumn],
    fields: [
      { key: 'code', label: 'Service Code', type: 'text', required: true, placeholder: 'eg, SAME_DAY', section: 'Service Type Details' },
      { key: 'name', label: 'Service Type Name', type: 'text', required: true, placeholder: 'eg, Same Day', section: 'Service Type Details' },
      { key: 'consignmentTypeCodes', label: 'Consignment Types', type: 'multi', optionsFromLabeled: labeledCodesOf('consignmentType'), section: 'Applicability' },
    ],
    // staging writes consignmentTypeCodes as a JSON-stringified array
    beforeSave: async (row) => ({ ...row, consignmentTypeCodes: codesWire(row.consignmentTypeCodes) }),
    sectionMeta: {
      'Service Type Details': { icon: <Sparkles size={15} className="text-brand-500" />, caption: 'Identity of this service level — referenced by serviceability and allocation.' },
      'Applicability': { icon: <ArrowRightLeft size={15} className="text-brand-500" />, caption: 'Consignment types this service can be booked with.' },
    },
    searchKeys: ['code', 'name'],
    // staging filter dims: Service Name / Code / Status
    filterKeys: [
      { key: 'name', label: 'Service Name' },
      { key: 'enabled', label: 'Status' },
      { key: 'code', label: 'Code' },
    ],
  },
  'package-type': {
    entity: 'packageType', title: 'Package Type', noun: 'package type',
    subtitle: 'Setup standard packages with their dimensions for easy retrieval',
    catPath: SVC,
    columns: [
      ...CODE_NAME_COLUMNS,
      { key: 'dims', label: 'L × B × H', render: (r: MasterRecord) => (r.length || r.breadth || r.height) ? `${r.length ?? 0} × ${r.breadth ?? 0} × ${r.height ?? 0} ${r.unitOfMeasure ?? ''}` : '—' },
      { key: 'weight', label: 'Weight', render: (r: MasterRecord) => r.weight != null && r.weight !== 0 ? `${r.weight} ${r.weightUom ?? ''}` : '—' },
      { key: 'businessUnitName', label: 'Merchant', render: (r: MasterRecord) => String(r.businessUnitName ?? '') || String(r.businessUnitCode ?? '') || '—' },
    ],
    fields: [
      { key: 'code', label: 'Code', type: 'text', required: true, placeholder: 'eg, SMALL_BOX', section: 'Package Details' },
      { key: 'name', label: 'Name', type: 'text', required: true, placeholder: 'eg, Small Box', section: 'Package Details' },
      { key: 'businessUnitId', label: 'Merchant', type: 'select', searchable: true, optionsFromLabeled: businessUnitIdOptions, placeholder: 'Select merchant', section: 'Package Details' },
      // dimensions first, their unit right after; weight, then its unit —
      // staging marks Length/Breadth/Height/Unit of measure REQUIRED
      { key: 'length', label: 'Length', type: 'number', required: true, placeholder: 'eg, 30', section: 'Dimensions & Weight' },
      { key: 'breadth', label: 'Breadth', type: 'number', required: true, placeholder: 'eg, 20', section: 'Dimensions & Weight' },
      { key: 'height', label: 'Height', type: 'number', required: true, placeholder: 'eg, 15', section: 'Dimensions & Weight' },
      { key: 'unitOfMeasure', label: 'Unit of Measure', type: 'select', required: true, options: ['CM', 'IN'], init: 'CM', section: 'Dimensions & Weight' },
      { key: 'weight', label: 'Weight', type: 'number', placeholder: 'eg, 5', section: 'Dimensions & Weight' },
      // staging: Weight Unit is mandatory once a weight is entered — the KG
      // default keeps that invariant satisfied
      { key: 'weightUom', label: 'Weight Unit', type: 'select', options: ['KG'], init: 'KG', section: 'Dimensions & Weight' },
    ],
    normalize: (r) => ({ ...r, businessUnitId: r.businessUnitId ? String(r.businessUnitId) : '' }),
    beforeSave: async (row) => ({ ...row, businessUnitId: Number(row.businessUnitId) || 0 }),
    sectionMeta: {
      'Package Details': { icon: <Package size={15} className="text-brand-500" />, caption: 'Identity of this package type — optionally scoped to one merchant.' },
      'Dimensions & Weight': { icon: <Boxes size={15} className="text-brand-500" />, caption: 'Physical size and weight — dimensions first, then their unit.' },
    },
    searchKeys: ['code', 'name', 'businessUnitName', 'businessUnitCode'],
    // staging filter dims (Package Name / Code / Status) + the merchant & UOM dims
    filterKeys: [
      { key: 'businessUnitName', label: 'Merchant' },
      { key: 'enabled', label: 'Status' },
      { key: 'name', label: 'Package Name' },
      { key: 'code', label: 'Code' },
      { key: 'unitOfMeasure', label: 'Dimensions UOM' },
    ],
  },
  'consignment-type': {
    entity: 'consignmentType', title: 'Consignment Type', noun: 'consignment type',
    subtitle: 'Classify how orders are handled operationally — forward, reverse, B2B, B2C',
    catPath: SVC,
    columns: CODE_NAME_COLUMNS,
    fields: [
      { key: 'code', label: 'Consignment Code', type: 'text', required: true, placeholder: 'eg, b2c_delivery', section: 'Consignment Type Details' },
      { key: 'name', label: 'Consignment Name', type: 'text', required: true, placeholder: 'eg, B2C Delivery', section: 'Consignment Type Details' },
    ],
    sectionMeta: {
      'Consignment Type Details': { icon: <Package size={15} className="text-brand-500" />, caption: 'Identity of this consignment type — referenced by service types and value added services.' },
    },
    searchKeys: ['code', 'name'],
    // staging filter dims: Consignment Name / Code / Status
    filterKeys: [
      { key: 'name', label: 'Consignment Name' },
      { key: 'enabled', label: 'Status' },
      { key: 'code', label: 'Code' },
    ],
  },
  'value-added-service': {
    entity: 'vas', title: 'Value Added Service', noun: 'service',
    subtitle: 'Setup value added services for your carriers — installation, assembly, haul-away',
    catPath: SVC,
    fetchRows: withConsignmentTypeNames('vas'),
    columns: [
      ...CODE_NAME_COLUMNS,
      { key: 'description', label: 'Description', render: (r: MasterRecord) => String(r.description ?? '') || '—' },
      { key: 'vasCategory', label: 'Category', render: (r: MasterRecord) => VAS_CATEGORY_LABELS[String(r.vasCategory ?? '')] ?? (String(r.vasCategory ?? '') || '—') },
      { key: 'executionTime', label: 'Execution', render: (r: MasterRecord) => EXECUTION_LABELS[String(r.executionTime ?? '')] ?? (String(r.executionTime ?? '') || '—') },
      { key: 'serviceTimeDefault', label: 'Service Time', render: (r: MasterRecord) =>
        r.serviceTimeDefault != null
          ? `${r.serviceTimeDefault} min${r.serviceTimeAdditional != null ? ` (+${r.serviceTimeAdditional})` : ''}`
          : '—' },
      { key: 'skill', label: 'Skill', render: (r: MasterRecord) => (Array.isArray(r.skill) ? r.skill.join(', ') : String(r.skill ?? '')) || '—' },
      { key: 'hierarchy', label: 'Hierarchy', render: (r: MasterRecord) => (Array.isArray(r.hierarchy) ? r.hierarchy.join(', ') : String(r.hierarchy ?? '')) || '—' },
      consignmentTypesColumn,
    ],
    fields: [
      { key: 'code', label: 'VAS Code', type: 'text', required: true, placeholder: 'eg, INSTALL', section: 'Service Details' },
      { key: 'name', label: 'VAS Name', type: 'text', required: true, placeholder: 'eg, Install', section: 'Service Details' },
      // staging marks Description required on the VAS form
      { key: 'description', label: 'Description', type: 'text', required: true, placeholder: 'eg, Installation at doorstep', section: 'Service Details' },
      { key: 'vasCategory', label: 'VAS Category', type: 'select', options: Object.keys(VAS_CATEGORY_LABELS), optionLabels: VAS_CATEGORY_LABELS, placeholder: 'Select VAS category', section: 'Service Details' },
      { key: 'executionTime', label: 'Execution Time', type: 'select', options: Object.keys(EXECUTION_LABELS), optionLabels: EXECUTION_LABELS, placeholder: 'Select execution time', section: 'Service Details' },
      // staging requires Default + Additional; every *Unit is fixed to minutes
      { key: 'serviceTimeDefault', label: 'Service Time Default (minutes)', type: 'number', required: true, placeholder: 'eg, 15', section: 'Service Time' },
      { key: 'serviceTimeAdditional', label: 'Service Time Additional (minutes)', type: 'number', required: true, placeholder: 'eg, 10', section: 'Service Time' },
      { key: 'serviceTimeMax', label: 'Service Time Max (minutes)', type: 'number', placeholder: 'eg, 45', section: 'Service Time' },
      // staging: Skill options are the tagMaster codes; Hierarchy options are
      // the OTHER value added services (both arrays on the wire)
      { key: 'skill', label: 'Skill', type: 'multi', optionsFromLabeled: labeledCodesOf('tagMaster'), section: 'Applicability' },
      { key: 'hierarchy', label: 'Hierarchy', type: 'multi', optionsFromLabeled: labeledCodesOf('vas'), section: 'Applicability' },
      { key: 'consignmentTypeCodes', label: 'Consignment Types', type: 'multi', optionsFromLabeled: labeledCodesOf('consignmentType'), section: 'Applicability' },
    ],
    beforeSave: async (row) => ({
      ...row,
      serviceTimeDefault: row.serviceTimeDefault == null ? null : Number(row.serviceTimeDefault),
      serviceTimeAdditional: row.serviceTimeAdditional == null ? null : Number(row.serviceTimeAdditional),
      serviceTimeMax: row.serviceTimeMax == null ? null : Number(row.serviceTimeMax),
      serviceTimeDefaultUnit: strv(row.serviceTimeDefaultUnit) || 'minutes',
      serviceTimeAdditionalUnit: strv(row.serviceTimeAdditionalUnit) || 'minutes',
      serviceTimeMaxUnit: strv(row.serviceTimeMaxUnit) || 'minutes',
      // staging writes consignmentTypeCodes as a JSON-stringified array;
      // skill/hierarchy stay real arrays
      consignmentTypeCodes: codesWire(row.consignmentTypeCodes),
    }),
    sectionMeta: {
      'Service Details': { icon: <Sparkles size={15} className="text-brand-500" />, caption: 'What this service is, its category and when it executes relative to the delivery.' },
      'Service Time': { icon: <Clock3 size={15} className="text-brand-500" />, caption: 'How long the service takes at the doorstep — used by routing. All values are minutes.' },
      'Applicability': { icon: <ArrowRightLeft size={15} className="text-brand-500" />, caption: 'Skills required, related services and the consignment types this service can be offered with.' },
    },
    searchKeys: ['code', 'name', 'description'],
    // staging filter dims (VAS Name / Code / Status) + the category & execution enums
    filterKeys: [
      { key: 'vasCategory', label: 'Category' },
      { key: 'enabled', label: 'Status' },
      { key: 'name', label: 'VAS Name' },
      { key: 'code', label: 'Code' },
      { key: 'executionTime', label: 'Execution Time' },
    ],
  },
  'sort-code': {
    entity: 'sortCode', title: 'Sort Code', noun: 'sort code',
    subtitle: 'Add various sort codes offered by your carriers, this helps in setting up & managing serviceability',
    catPath: SVC,
    columns: CODE_NAME_COLUMNS,
    fields: [
      { key: 'code', label: 'Sort Code', type: 'text', required: true, placeholder: 'eg, SC-EAST', section: 'Sort Code Details' },
      { key: 'name', label: 'Sort Code Name', type: 'text', required: true, placeholder: 'eg, East Dock', section: 'Sort Code Details' },
    ],
    sectionMeta: {
      'Sort Code Details': { icon: <ArrowRightLeft size={15} className="text-brand-500" />, caption: 'Identity of this sortation code — referenced by zones and docks.' },
    },
    searchKeys: ['code', 'name'],
    // staging filter dims: Sort Code Name / Code / Status
    filterKeys: [
      { key: 'name', label: 'Sort Code Name' },
      { key: 'enabled', label: 'Status' },
      { key: 'code', label: 'Code' },
    ],
  },
  // slot is the ONE master whose keys are snake_case and where every value —
  // including capacity — is a STRING (a numeric capacity 400s the whole body)
  'slot-master': {
    entity: 'slot', title: 'Slot Master', noun: 'slot',
    subtitle: 'Add different slots for delivery and pickups',
    catPath: SVC,
    columns: [
      ...CODE_NAME_COLUMNS,
      { key: 'window', label: 'Window', render: (r: MasterRecord) =>
        (r.opening_time || r.closing_time) ? `${r.opening_time ?? ''} – ${r.closing_time ?? ''}` : '—' },
      { key: 'capacity', label: 'Capacity', render: (r: MasterRecord) => strv(r.capacity) ? `${strv(r.capacity)} orders` : '—' },
      { key: 'break', label: 'Break', render: (r: MasterRecord) =>
        (r.break_start_time || r.break_end_time) ? `${r.break_start_time ?? ''} – ${r.break_end_time ?? ''}` : '—' },
    ],
    fields: [
      { key: 'code', label: 'Slot Code', type: 'text', required: true, placeholder: 'eg, MORNING_9_12', section: 'Slot Details' },
      { key: 'name', label: 'Slot Name', type: 'text', required: true, placeholder: 'eg, Morning 9-12', section: 'Slot Details' },
      // staging requires Slot Start Time + Slot End Time
      { key: 'opening_time', label: 'Slot Start Time', type: 'text', required: true, placeholder: 'eg, 09:00', section: 'Timings & Capacity' },
      { key: 'closing_time', label: 'Slot End Time', type: 'text', required: true, placeholder: 'eg, 12:00', section: 'Timings & Capacity' },
      // capacity is a STRING on the wire — keep the field type text
      { key: 'capacity', label: 'Capacity', type: 'text', placeholder: 'eg, 50', section: 'Timings & Capacity' },
      { key: 'break_start_time', label: 'Slot Break Start Time', type: 'text', placeholder: 'eg, 10:30', section: 'Timings & Capacity' },
      { key: 'break_end_time', label: 'Slot Break End Time', type: 'text', placeholder: 'eg, 10:45', section: 'Timings & Capacity' },
    ],
    // staging's slot validators: HH:MM times, closing after opening, break
    // start/end together, break end after break start
    beforeSave: async (row) => {
      const checks: [string, string][] = [
        ['opening_time', 'Slot Start Time'], ['closing_time', 'Slot End Time'],
        ['break_start_time', 'Slot Break Start Time'], ['break_end_time', 'Slot Break End Time'],
      ]
      for (const [k, label] of checks)
        if (strv(row[k]) && !HHMM.test(strv(row[k]))) throw new Error(`${label} must be HH:MM (24-hour).`)
      if (strv(row.opening_time) && strv(row.closing_time) && strv(row.closing_time) <= strv(row.opening_time))
        throw new Error('Slot End Time must be after Slot Start Time.')
      if (!!strv(row.break_start_time) !== !!strv(row.break_end_time))
        throw new Error('Slot Break Start Time and Slot Break End Time are required together.')
      if (strv(row.break_start_time) && strv(row.break_end_time) <= strv(row.break_start_time))
        throw new Error('Slot Break End Time must be after Slot Break Start Time.')
      if (strv(row.capacity) && !/^\d+$/.test(strv(row.capacity)))
        throw new Error('Capacity must be a whole number.')
      return { ...row, capacity: strv(row.capacity) }
    },
    sectionMeta: {
      'Slot Details': { icon: <Clock3 size={15} className="text-brand-500" />, caption: 'Identity of this delivery slot.' },
      'Timings & Capacity': { icon: <CalendarClock size={15} className="text-brand-500" />, caption: 'The slot window (24-hour HH:MM), its order capacity and any mid-slot break.' },
    },
    searchKeys: ['code', 'name'],
    // staging filter dims: Slot Name / Slot Code / Status
    filterKeys: [
      { key: 'name', label: 'Slot Name' },
      { key: 'enabled', label: 'Status' },
      { key: 'code', label: 'Slot Code' },
    ],
  },
  // palletSpace has NO name field; businessUnit/packageType/quantity/palletSpace
  // are required (Go names in errors differ from the JSON tags — see FAREYE-APIS)
  'pallet-space': {
    entity: 'palletSpace', title: 'Pallet Space Conversion Master', noun: 'conversion rule',
    subtitle: 'Define conversion rules to calculate pallet space based on package type and quantity',
    catPath: SVC,
    columns: [
      // no name on this master — the code alone is the identity cell
      { key: 'code', label: 'Code', render: (r: MasterRecord) => <span className="font-bold text-brand-500">{String(r.code ?? '')}</span> },
      { key: 'businessUnit', label: 'Business Unit', render: (r: MasterRecord) => String(r.businessUnit ?? '') || '—' },
      { key: 'packageType', label: 'Package Type', render: (r: MasterRecord) => String(r.packageType ?? '') || '—' },
      { key: 'conversion', label: 'Conversion', render: (r: MasterRecord) =>
        r.quantity != null ? `${r.quantity} pkgs → ${r.palletSpace ?? 0} pallet space${Number(r.palletSpace) === 1 ? '' : 's'}` : '—' },
      { key: 'roundUp', label: 'Round Up', render: (r: MasterRecord) => r.roundUp ? 'Yes' : 'No' },
    ],
    fields: [
      { key: 'businessUnit', label: 'Business Unit', type: 'select', required: true, searchable: true, optionsFromLabeled: labeledCodesOf('businessUnit'), placeholder: 'Select business unit', section: 'Conversion Rule' },
      { key: 'packageType', label: 'Package Type', type: 'select', required: true, searchable: true, optionsFromLabeled: labeledCodesOf('packageType'), placeholder: 'Select package type', section: 'Conversion Rule' },
      { key: 'quantity', label: 'Package Type Quantity', type: 'number', required: true, placeholder: 'eg, 40', section: 'Conversion Rule' },
      { key: 'palletSpace', label: 'Pallet Space', type: 'number', required: true, init: 1, placeholder: 'eg, 1', section: 'Conversion Rule' },
      // staging defaults Round Up to false
      { key: 'roundUp', label: 'Round Up', type: 'toggle', init: false, section: 'Conversion Rule' },
      // staging has NO code input — it derives code as BUSINESSUNIT_PACKAGETYPE
      // on submit; keep the field visible (optional) so CSV round-trips work,
      // and auto-generate when left blank
      { key: 'code', label: 'Code', type: 'text', placeholder: 'auto-generated as BUSINESSUNIT_PACKAGETYPE', section: 'Conversion Rule' },
    ],
    // staging's validators: whole-number quantity, pallet space greater than 0;
    // code is generated from the pair when not supplied (staging always does)
    beforeSave: async (row) => {
      const quantity = Number(row.quantity)
      const palletSpace = Number(row.palletSpace)
      if (!Number.isInteger(quantity) || quantity <= 0) throw new Error('Package Type Quantity must be a whole number greater than 0.')
      if (!(palletSpace > 0)) throw new Error('Pallet Space must be greater than 0.')
      return { ...row, quantity, palletSpace, code: strv(row.code) || `${strv(row.businessUnit)}_${strv(row.packageType)}` }
    },
    sectionMeta: {
      'Conversion Rule': { icon: <Boxes size={15} className="text-brand-500" />, caption: 'How many packages of a type convert into one pallet space for a merchant — used by load planning.' },
    },
    searchKeys: ['code', 'businessUnit', 'packageType'],
    // staging filter dims: Package Type / Business Unit (+ our code & status)
    filterKeys: [
      { key: 'businessUnit', label: 'Business Unit' },
      { key: 'packageType', label: 'Package Type' },
      { key: 'code', label: 'Code' },
      { key: 'enabled', label: 'Status' },
    ],
  },
  // customBusinessParameter — the generic engine, probed live: rows are
  // {code, name, sequence:number, values:string[]}; staging's editor sorts by
  // sequence ASC (sequence = row order, 1-based) and generates code from name
  'business-parameter': {
    entity: 'customBusinessParameter', title: 'Business Parameter', noun: 'parameter',
    subtitle: 'Add business parameters and their possible values — reusable custom filters across rate cards and billing',
    catPath: SVC,
    fetchRows: () => fetchMasterRows('customBusinessParameter')
      .then((rs) => [...rs].sort((a, b) => (Number(a.sequence) || 0) - (Number(b.sequence) || 0))),
    columns: [
      ...CODE_NAME_COLUMNS,
      { key: 'values', label: 'Possible Values', render: (r: MasterRecord) => {
        const vals = Array.isArray(r.values) ? r.values.map(String) : []
        return vals.length ? vals.join(', ') : '—'
      } },
      { key: 'sequence', label: 'Sequence', render: (r: MasterRecord) => String(r.sequence ?? 0) },
    ],
    fields: [
      { key: 'name', label: 'Parameter Name', type: 'text', required: true, placeholder: 'eg, Delivery Region', section: 'Parameter Details' },
      // staging generates the code from the name (lower_snake_case) — optional
      // here; left blank it is derived the same way
      { key: 'code', label: 'Code', type: 'text', placeholder: 'auto-generated from name, eg delivery_region', section: 'Parameter Details' },
      { key: 'sequence', label: 'Sequence', type: 'number', placeholder: 'eg, 5 — lower shows first', section: 'Parameter Details' },
      { key: 'values', label: 'Possible Values', type: 'custom', section: 'Possible Values',
        renderCustom: (row, set, readOnly) => (
          <TagInput
            value={Array.isArray(row.values) ? row.values.map(String) : []}
            readOnly={readOnly}
            placeholder="Type a value and press Enter"
            onChange={(v) => set({ values: v })} />
        ) },
    ],
    beforeSave: async (row) => {
      const vals = (Array.isArray(row.values) ? row.values.map(String) : strv(row.values).split(/[,;]/))
        .map((s) => s.trim()).filter(Boolean)
      if (!vals.length) throw new Error('Add at least one possible value.')
      // staging's code rule: lowercase name, strip punctuation, spaces/-/ → _
      const slug = strv(row.name).toLowerCase().replace(/[^\w\s-]/g, '').replace(/[\s-]+/g, '_')
      return { ...row, values: [...new Set(vals)], sequence: Number(row.sequence) || 0, code: strv(row.code) || slug }
    },
    sectionMeta: {
      'Parameter Details': { icon: <SlidersHorizontal size={15} className="text-brand-500" />, caption: 'Identity of this parameter — codes are lower_snake_case; lower sequence lists first.' },
      'Possible Values': { icon: <Boxes size={15} className="text-brand-500" />, caption: 'The value list this parameter can take — press Enter or comma to add each value.' },
    },
    searchKeys: ['code', 'name'],
    // no staging filter reference (its settings editor is a different surface) —
    // ship the standard name/code/status dims
    filterKeys: [
      { key: 'name', label: 'Parameter Name' },
      { key: 'enabled', label: 'Status' },
      { key: 'code', label: 'Code' },
    ],
  },
}
