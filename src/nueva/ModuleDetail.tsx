/**
 * Base-module detail pages (chevron → per-module settings), replicating
 * staging's /v2/custom_settings/master-service/modules/<url>.
 *
 * All state lives in the module's `settingJson` (moduleSettings API) — the page
 * edits a draft copy and saves via PUT /master/api/v1/moduleSettings with the
 * whole row, then toasts (staging copy: "Settings saved successfully.").
 *
 * OPS Dashboard gets a 1:1 bespoke replica (Selected Dashboards chips + General
 * Settings / Table Configuration / On Page Filters tabs, checkbox+sequence rows).
 * Other modules get a structured editor derived from their settingJson shape:
 * booleans → toggles, strings/numbers → inputs, {key,sequence}[] → sequence
 * lists, nested objects → accordions. Unknown blobs stay visible as JSON.
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { Wrench, Table2, ListFilter, RefreshCw, AlertCircle, Lock } from 'lucide-react'
import {
  Button, Checkbox, EmptyState, Field, Input, MenuSelect, MultiSelect, PageHeader, SimpleTable, Tabs, Toggle,
  type SimpleCol,
} from './components'
import { toast } from './toast'
import { fetchModuleSettings, saveModuleSettings, parseSettingJson, type ModuleSetting } from './settingsApi'
import { BASE_MODULES } from './BaseModules'
import {
  readPickupModuleConfig, writePickupModuleConfig, normalizePickupModuleConfig, DEFAULT_PICKUP_MODULE_CONFIG, type AutoPickupConfig,
  type PickupModuleConfig, type PodLevel,
} from '../config/pickupModule'
import {
  CONSIGNMENT_FIELDS, FIELD_SECTIONS, cacheFormBehavior, DEFAULT_FORM_BEHAVIOR,
  type FormBehavior,
} from '../pages/ConsignmentAdd/fieldConfig'

/* ---------- shared helpers ---------- */

/* Exact key→title map lifted from the staging bundle (OPS Dashboard column
   universe `zJ` + dashboard options) so labels match the real console. */
const LABELS: Record<string, string> = {
  key: 'Aggregate Key', consignmentNumber: 'Consignment Number', orderNumber: 'Order Number',
  state: 'State', consignmentType: 'Consignment Type', serviceType: 'Service Type',
  packageQuantity: 'Package Quantity', totalWeight: 'Weight', totalVolume: 'Volume',
  businessUnit: 'Merchant', lastmileDriverName: 'Assigned To Driver', sortCode: 'Sort Code',
  carrierCode: 'Carrier Code', originFacilityCode: 'Origin Facility Code',
  destinationFacilityCode: 'Destination Facility Code', palletQuantity: 'Pallet Quantity',
  createdAt: 'Created At', dispatchDate: 'Dispatch Date',
  lastmileDeliveryAttemptCount: 'Delivery Attempt Count', specialInstructions: 'Special Instructions',
  routingPriority: 'Routing Priority', totalQuantity: 'Total Quantity',
  lastmileDeliveryStartTime: 'Delivery Start Time', lastmileDeliveryEndTime: 'Delivery End Time',
  originalLastmileDeliveryStartTime: 'Original Delivery Start Time',
  originalLastmileDeliveryEndTime: 'Original Delivery End Time', lastUpdatedAt: 'Last Updated At',
  consignmentDashboard: 'Milestones', consignmentFacilityMis: 'Facility Mis',
  consignmentAgeingDashboard: 'Ageing Dashboard', sla: 'SLA', slot: 'Slot Utilization',
  /* consignment/PFP universe titles that humanizing can't produce */
  totalWeightEdit: 'Weight (Editable)', totalVolumeEdit: 'Volume (Editable)',
  palletQuantityEdit: 'Pallet Quantity (Editable)', serviceTimeEdit: 'Service Time (min) (Editable)',
  serviceTime: 'Service Time (min)', sku: 'SKU', skuLineItemNo: 'SKU Line Item No', skuCode: 'SKU Code',
  vas: 'VAS', ageing: 'Ageing (days)', tags: 'Tag', driverName: 'Assigned To Driver',
  codAmount: 'COD Amount', cancellationRemarksReason: 'Cancellation Remarks',
  pickupStartDateTime: 'Pickup Start Time', pickupEndDateTime: 'Pickup End Time',
  deliveryStartDateTime: 'Delivery Start Time', deliveryEndDateTime: 'Delivery End Time',
  originalPickupStartTime: 'Original Pickup Start Time', originalPickupEndTime: 'Original Pickup End Time',
  /* Pickup Request module (our own code) — pickup-only keys, so no existing label moves */
  pickupReference: 'Reference', pickupStatus: 'Status', pickupWindow: 'Pickup Window',
  pickupAddress: 'Pickup Address', pickupInboundHub: 'Inbound Hub', pickupMerchant: 'Merchant',
  pickupConsignments: 'Consignments', pickupWeight: 'Weight', pickupDriverCarrier: 'Driver / Carrier',
  pickupTrip: 'Trip', pickupAttempt: 'Attempt', pickupSource: 'Source', pickupCarrier: 'Carrier',
  pickupDriver: 'Driver', pickupType: 'Type',
}

/* Full column universes from the staging bundle — the account's settingJson only
   stores the SELECTED subset, so unselected options must come from here. */
const OPS_COLUMN_UNIVERSE = [
  'key', 'consignmentNumber', 'orderNumber', 'state', 'consignmentType', 'serviceType',
  'packageQuantity', 'totalWeight', 'totalVolume', 'businessUnit', 'lastmileDriverName',
  'createdAt', 'carrierCode', 'dispatchDate', 'lastmileDeliveryAttemptCount',
  'specialInstructions', 'routingPriority', 'totalQuantity', 'lastmileDeliveryStartTime',
  'lastmileDeliveryEndTime', 'originalLastmileDeliveryStartTime',
  'originalLastmileDeliveryEndTime', 'palletQuantity', 'lastUpdatedAt',
]

/* Consignment Order — the 65-field universe (bundle @3363393, exact titles in LABELS) */
export const CONSIGNMENT_COLUMN_UNIVERSE = [
  'consignmentNumber', 'referenceNumber', 'state', 'secondaryState', 'exceptionState', 'exceptionReason',
  'totalWeight', 'totalVolume', 'palletQuantity', 'totalQuantity', 'sku', 'skuLineItemNo', 'skuCode',
  'shipByDate', 'shipToName', 'shipToAddress', 'shipToType', 'shipToCode', 'shipToPinCode', 'shipToCity',
  'shipToCounty', 'businessUnit', 'driverName', 'consignmentType', 'createdAt', 'ageing', 'carrier', 'tags',
  'vas', 'serviceTime', 'pickupServiceTime', 'deliveryServiceTime', 'orderNumber', 'dispatchDate',
  'routingPriority', 'specialInstructions', 'shipperCode', 'serviceType', 'pickupStartDateTime',
  'pickupEndDateTime', 'deliveryStartDateTime', 'deliveryEndDateTime', 'deliveryAttemptCount',
  'schedulingConfirmationRequired', 'schedulingConfirmed', 'paymentMode', 'shipFromName', 'shipFromAddress',
  'shipFromType', 'shipFromCode', 'shipFromPinCode', 'shipFromCity', 'shipFromCounty', 'originFacilityCode',
  'destinationFacilityCode', 'trackingNumber', 'codAmount', 'clearanceDone', 'clearanceRequired', 'address',
  'originalPickupStartTime', 'originalPickupEndTime', 'originalLastmileDeliveryStartTime',
  'originalLastmileDeliveryEndTime', 'cancellationRemarksReason',
]

/* Pending For Planning — 66-field universe (editable variants + categories; bundle @3381972) */
const PFP_COLUMN_UNIVERSE = [
  'categories', 'consignmentNumber', 'referenceNumber', 'state', 'secondaryState', 'exceptionState',
  'exceptionReason', 'totalWeightEdit', 'totalVolumeEdit', 'palletQuantity', 'palletQuantityEdit',
  'totalQuantity', 'sku', 'skuLineItemNo', 'skuCode', 'shipByDate', 'shipToName', 'shipToAddress',
  'shipToType', 'shipToCode', 'shipToPinCode', 'shipToCity', 'shipToCounty', 'businessUnit', 'driverName',
  'consignmentType', 'createdAt', 'ageing', 'carrier', 'tags', 'vas', 'serviceTimeEdit', 'pickupServiceTime',
  'deliveryServiceTime', 'orderNumber', 'dispatchDate', 'routingPriority', 'specialInstructions',
  'shipperCode', 'serviceType', 'pickupStartDateTime', 'pickupEndDateTime', 'deliveryStartDateTime',
  'deliveryEndDateTime', 'deliveryAttemptCount', 'schedulingConfirmationRequired', 'schedulingConfirmed',
  'paymentMode', 'shipFromName', 'shipFromAddress', 'shipFromType', 'shipFromCode', 'shipFromPinCode',
  'shipFromCity', 'shipFromCounty', 'originFacilityCode', 'destinationFacilityCode', 'trackingNumber',
  'codAmount', 'clearanceDone', 'clearanceRequired', 'address', 'originalPickupStartTime',
  'originalPickupEndTime', 'originalLastmileDeliveryStartTime', 'originalLastmileDeliveryEndTime',
]

/* Pickup Request — pickup-list columns (our module; no staging universe exists) */
const PICKUP_COLUMN_UNIVERSE = [
  'pickupReference', 'pickupStatus', 'pickupWindow', 'pickupAddress', 'pickupInboundHub', 'pickupMerchant',
  'pickupConsignments', 'pickupWeight', 'pickupDriverCarrier', 'pickupTrip', 'pickupAttempt', 'pickupSource',
]
const PICKUP_FILTER_UNIVERSE = [
  'pickupStatus', 'pickupMerchant', 'pickupAddress', 'pickupCarrier', 'pickupDriver', 'pickupType', 'pickupSource',
]

export const MODULE_COLUMN_UNIVERSE: Record<string, string[]> = {
  CONSIGNMENT_MANAGEMENT: CONSIGNMENT_COLUMN_UNIVERSE,
  PENDING_FOR_PLANNING: PFP_COLUMN_UNIVERSE,
  PICKUP_REQUEST: PICKUP_COLUMN_UNIVERSE,
}
/* On Page Filters universes — only modules whose filter list is ours to define */
const MODULE_FILTER_UNIVERSE: Record<string, string[]> = {
  PICKUP_REQUEST: PICKUP_FILTER_UNIVERSE,
}
export function labelFor(key: string): string {
  if (LABELS[key]) return LABELS[key]
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim()
}

interface SeqItem { key: string; selected: boolean; sequence: number }

/** merge a selected [{key,sequence}] list with the full key universe */
function buildSeqItems(selected: { key: string; sequence: number }[], universe: string[]): SeqItem[] {
  const sel = new Map(selected.map((s) => [s.key, s.sequence]))
  const all = [...new Set([...selected.map((s) => s.key), ...universe])]
  return all
    .map((k) => ({ key: k, selected: sel.has(k), sequence: sel.get(k) ?? 0 }))
    .sort((a, b) => (a.selected === b.selected ? a.sequence - b.sequence : a.selected ? -1 : 1))
}

/* Checkbox + sequence row list (Table Configuration / On Page Filters pattern) */
function SequenceList({ items, onChange }: { items: SeqItem[]; onChange: (items: SeqItem[]) => void }) {
  const selCount = items.filter((i) => i.selected).length
  const allSelected = selCount === items.length
  const toggleAll = () => {
    let seq = 0
    onChange(items.map((i) => ({ ...i, selected: !allSelected, sequence: !allSelected ? ++seq : 0 })))
  }
  const toggleOne = (key: string) => {
    const next = items.map((i) => (i.key === key ? { ...i, selected: !i.selected } : i))
    let seq = 0
    onChange(next.map((i) => ({ ...i, sequence: i.selected ? ++seq : 0 })))
  }
  return (
    <div>
      <div className="flex items-center justify-between px-1 pb-2.5">
        <div className="flex items-center gap-3 text-[13px]">
          <button onClick={toggleAll} className="font-bold text-brand-500 hover:text-brand-600">
            {allSelected ? 'Clear All' : 'Select All'}
          </button>
          <span className="text-ink-3 border-l border-line pl-3">{selCount}/{items.length} Selected</span>
        </div>
        <span className="text-[13px] font-bold text-ink pr-4">Sequence</span>
      </div>
      <div className="space-y-2">
        {items.map((it) => (
          <div key={it.key}
            className={`flex items-center gap-3 rounded-md border px-3.5 py-2.5 transition-colors
              ${it.selected ? 'bg-brand-50 border-brand-100' : 'bg-surface border-line'}`}>
            <Checkbox checked={it.selected} onChange={() => toggleOne(it.key)} />
            <span className="text-[13px] text-ink flex-1">{labelFor(it.key)}</span>
            <span className={`w-14 h-7 inline-flex items-center justify-center rounded-md border text-[12.5px]
              ${it.selected ? 'bg-warm-100 border-warm-200 text-ink-2' : 'bg-warm-50 border-line text-warm-400'}`}>
              {it.selected ? it.sequence : '—'}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

/* User Types checkbox-chip row (General tab of every module page) */
function UserTypeChips({ options, value, onChange }: {
  options: string[]; value: string[]; onChange: (next: string[]) => void
}) {
  return (
    <div className="flex items-center gap-2.5 flex-wrap">
      {options.map((u) => {
        const on = value.includes(u)
        return (
          <button key={u}
            onClick={() => onChange(on ? value.filter((x) => x !== u) : [...value, u])}
            className={`inline-flex items-center gap-2 rounded-md border px-3.5 h-10 text-[13.5px] transition-colors
              ${on ? 'border-brand-500 text-brand-600 bg-brand-50 font-bold' : 'border-warm-300 text-ink-2 bg-surface hover:bg-warm-50'}`}>
            <Checkbox checked={on} />{u}
          </button>
        )
      })}
    </div>
  )
}

export function FooterBar({ onReset, onSave, saving, dirty }: { onReset: () => void; onSave: () => void; saving: boolean; dirty: boolean }) {
  return (
    <div className="flex items-center justify-between border-t border-line pt-4 mt-6">
      <Button variant="ghost" onClick={onReset} disabled={!dirty || saving}>Reset</Button>
      <Button onClick={onSave} disabled={!dirty || saving}>{saving ? 'Saving…' : 'Save Settings'}</Button>
    </div>
  )
}

/* ---------- OPS Dashboard — bespoke 1:1 replica ---------- */

const OPS_TABS = ['General Settings', 'Table Configuration', 'On Page Filters']
const OPS_TAB_ICONS = [Wrench, Table2, ListFilter]
const USER_TYPES = ['Field Executive', 'Admin', 'Manager']
/* exact option list from the staging bundle (options:[{label,value}…]) */
const DASHBOARDS = ['consignmentDashboard', 'consignmentFacilityMis', 'consignmentAgeingDashboard', 'sla', 'slot']

function OpsDashboardDetail({ setting, onSave, saving }: {
  setting: Record<string, any>
  onSave: (next: Record<string, any>) => void
  saving: boolean
}) {
  const [draft, setDraft] = useState(() => structuredClone(setting))
  const [tab, setTab] = useState(0)
  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(setting), [draft, setting])

  const columnUniverse: string[] = [...new Set([...OPS_COLUMN_UNIVERSE, ...(draft.consignmentDashboard?.tableColumns ?? [])])]
  const filterUniverse: string[] = draft.consignmentDashboard?.filterKeys ?? []
  const cols = buildSeqItems(draft.tableColumns ?? [], columnUniverse)
  const filts = buildSeqItems(draft.filters ?? [], filterUniverse)

  const setSeq = (field: 'tableColumns' | 'filters') => (items: SeqItem[]) =>
    setDraft((d: any) => ({
      ...d,
      [field]: items.filter((i) => i.selected).map((i) => ({ key: i.key, sequence: i.sequence })),
    }))

  const visibleTabs: string[] = draft.visibleTabs ?? []
  const userTypes: string[] = draft.userTypeList ?? []

  return (
    <div>
      <div className="mb-5">
        <div className="text-[15px] font-bold text-ink mb-2">Selected Dashboards</div>
        <div className="max-w-2xl">
          <MultiSelect
            value={visibleTabs}
            options={DASHBOARDS}
            labels={labelFor}
            placeholder="Select dashboards"
            onChange={(next) => setDraft((d: any) => ({ ...d, visibleTabs: next }))}
          />
        </div>
      </div>

      <div className="bg-surface border border-line rounded-xl shadow-ds-1">
        <div className="px-5">
          <Tabs
            tabs={OPS_TABS.map((t, i) => {
              void OPS_TAB_ICONS[i]
              return t
            })}
            active={tab} onChange={setTab}
          />
        </div>
        <div className="px-5 py-5">
          {tab === 0 && (
            <div>
              <div className="text-[13px] font-bold text-ink-2 mb-2.5">User Types</div>
              <UserTypeChips options={USER_TYPES} value={userTypes}
                onChange={(next) => setDraft((d: any) => ({ ...d, userTypeList: next }))} />
            </div>
          )}
          {tab === 1 && <SequenceList items={cols} onChange={setSeq('tableColumns')} />}
          {tab === 2 && <SequenceList items={filts} onChange={setSeq('filters')} />}
          <FooterBar dirty={dirty} saving={saving}
            onReset={() => setDraft(structuredClone(setting))}
            onSave={() => onSave(draft)} />
        </div>
      </div>
    </div>
  )
}

/* ---------- Shared columns+filters detail (Consignment Order, Pending For
   Planning, Load Planning, Carrier Portal) — staging's 4-tab pattern ---------- */

/* staging date lists (mined from the bundle): stored top-level in settingJson */
const DATE_FIELDS = [
  { name: 'Created Date', code: 'created_at' },
  { name: 'Delivery/Pickup Date', code: 'ship_to_delivery_date' },
  { name: 'Ship By Date', code: 'ship_by_date' },
  { name: 'Updated At', code: 'last_updated_at' },
  { name: 'Last Mile Dispatch Date', code: 'dispatch_date' },
]
const DATE_RANGES = [
  { name: 'Last 30 days', code: -30 },
  { name: 'Last 15 Days', code: -15 },
  { name: 'Last 7 Days', code: -7 },
  { name: 'Today', code: 0 },
  { name: 'Next 7 Days', code: 7 },
]

function RadioRow<T extends string | number>({ options, value, onChange }: {
  options: { name: string; code: T }[]; value: T; onChange: (v: T) => void
}) {
  return (
    <div className="flex items-center gap-2.5 flex-wrap">
      {options.map((o) => {
        const on = o.code === value
        return (
          <button key={String(o.code)} onClick={() => onChange(o.code)}
            className={`inline-flex items-center gap-2 rounded-md border px-3.5 h-10 text-[13.5px] transition-colors
              ${on ? 'border-brand-500 text-brand-600 bg-brand-50 font-bold' : 'border-warm-300 text-ink-2 bg-surface hover:bg-warm-50'}`}>
            <span className={`h-3.5 w-3.5 rounded-full border flex items-center justify-center
              ${on ? 'border-brand-500' : 'border-warm-300'}`}>
              {on && <span className="h-2 w-2 rounded-full bg-brand-500" />}
            </span>
            {o.name}
          </button>
        )
      })}
    </div>
  )
}

type ShowSeqMap = Record<string, { show: boolean; sequence: number }>

/** stored map merged with the bundle universe: stored keys keep their state,
    universe keys the account never saved render as unselected options */
function seqItemsFromMap(map: ShowSeqMap, universe: string[] = []): SeqItem[] {
  const items = Object.entries(map)
    .map(([k, v]) => ({ key: k, selected: !!v.show, sequence: v.sequence ?? 0 }))
  const known = new Set(items.map((i) => i.key))
  for (const k of universe) if (!known.has(k)) items.push({ key: k, selected: false, sequence: 0 })
  return items.sort((a, b) => (a.selected === b.selected ? a.sequence - b.sequence : a.selected ? -1 : 1))
}
function mapFromSeqItems(items: SeqItem[]): ShowSeqMap {
  const out: ShowSeqMap = {}
  for (const it of items) out[it.key] = { show: it.selected, sequence: it.selected ? it.sequence : 0 }
  return out
}

const CF_TABS = ['General', 'Date Filter', 'Table Configuration', 'On Page Filters']
const CF_TABS_CONSIGNMENT = [...CF_TABS, 'Add Form']

/* ---------- Add Form tab — default tier, identifier pair, field visibility ----
 * Mandatory fields are locked on; grouped keys (dims + UOM, coordinates, …)
 * hide their whole composite together. Saved into settingJson.form, so the
 * Add/Edit forms, the table and the filters all follow this configuration. */
function AddFormConfig({ form, onChange }: {
  form: FormBehavior
  onChange: (next: FormBehavior) => void
}) {
  const toggle = (key: string) => onChange({
    ...form,
    hidden: form.hidden.includes(key) ? form.hidden.filter((k) => k !== key) : [...form.hidden, key],
  })
  return (
    <div className="space-y-6">
      <div>
        <div className="text-[13px] font-bold text-ink-2 mb-1">Default form type</div>
        <p className="text-[12.5px] text-ink-3 mb-2.5">Which tier Add Consignment opens in — users can still switch.</p>
        <RadioRow
          options={[{ name: 'Simplified (one page)', code: 'simplified' }, { name: 'Full form (stepper)', code: 'full' }]}
          value={form.defaultMode} onChange={(v) => onChange({ ...form, defaultMode: v as FormBehavior['defaultMode'] })} />
      </div>
      <div>
        <div className="text-[13px] font-bold text-ink-2 mb-1">Order / Reference number</div>
        <p className="text-[12.5px] text-ink-3 mb-2.5">
          Both are API-mandatory, but you can ask for just one — the hidden one is auto-copied from the other on save.
        </p>
        <RadioRow
          options={[
            { name: 'Ask for both', code: 'both' },
            { name: 'Order Number only', code: 'orderNumber' },
            { name: 'Reference Number only', code: 'referenceNumber' },
          ]}
          value={form.identifier} onChange={(v) => onChange({ ...form, identifier: v as FormBehavior['identifier'] })} />
      </div>
      <div>
        <div className="text-[13px] font-bold text-ink-2 mb-1">Form fields</div>
        <p className="text-[12.5px] text-ink-3 mb-3">
          Unticked fields disappear from the add form, edit form, view, table columns and filters.
          Mandatory fields stay on. When every field of a section is off, the whole section hides.
        </p>
        <div className="space-y-4">
          {FIELD_SECTIONS.map((section) => {
            const fields = CONSIGNMENT_FIELDS.filter((f) => f.section === section)
            if (!fields.length) return null
            return (
              <div key={section}>
                <div className="mb-2 flex items-center gap-3">
                  <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-ink-3">{section}</span>
                  <span className="h-px flex-1 bg-line" />
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
                  {fields.map((f) => {
                    const locked = !!f.mandatory
                    const on = locked || !form.hidden.includes(f.key)
                    return (
                      <button key={f.key} type="button" disabled={locked}
                        onClick={() => toggle(f.key)}
                        title={f.note ?? f.apiPath}
                        className={`flex items-center gap-2.5 rounded-md border px-3 py-2 text-left text-[13px] transition-colors
                          ${locked ? 'cursor-not-allowed border-warm-200 bg-warm-50 text-ink-3'
                            : on ? 'border-brand-500/60 bg-brand-50/40 text-ink hover:border-brand-500'
                              : 'border-warm-300 bg-surface text-ink-3 hover:border-warm-400'}`}>
                        {locked ? <Lock size={13} className="shrink-0 text-warm-400" /> : <Checkbox checked={on} />}
                        <span className="min-w-0 flex-1 truncate">{f.defaultLabel}</span>
                        {locked && <span className="shrink-0 text-[10.5px] font-bold uppercase text-warm-400">Mandatory</span>}
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function ColumnsFiltersDetail({ code, setting, onSave, saving, generalTab }: {
  code: string
  setting: Record<string, any>
  onSave: (next: Record<string, any>) => void
  saving: boolean
  /** replaces the default User Types-only General tab (Pickup Request) */
  generalTab?: (draft: Record<string, unknown>, patch: (p: Record<string, unknown>) => void) => ReactNode
}) {
  const [draft, setDraft] = useState(() => structuredClone(setting))
  const [tab, setTab] = useState(0)
  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(setting), [draft, setting])

  const prc = draft.pageRenderingConfig ?? {}
  const colMap: ShowSeqMap = prc.table?.columns ?? {}
  const filtMap: ShowSeqMap = prc.filters ?? {}
  const userTypes: string[] = draft.userTypeList ?? []

  const setColumns = (items: SeqItem[]) =>
    setDraft((d: any) => ({ ...d, pageRenderingConfig: { ...prc, table: { ...prc.table, columns: mapFromSeqItems(items) } } }))
  const setFilters = (items: SeqItem[]) =>
    setDraft((d: any) => ({ ...d, pageRenderingConfig: { ...prc, filters: mapFromSeqItems(items) } }))

  const empty = !Object.keys(colMap).length && !Object.keys(filtMap).length
  const isConsignment = code === 'CONSIGNMENT_MANAGEMENT'
  const form: FormBehavior = { ...DEFAULT_FORM_BEHAVIOR, ...(draft.form ?? {}), hidden: Array.isArray(draft.form?.hidden) ? draft.form.hidden : [] }

  return (
    <div className="bg-surface border border-line rounded-xl shadow-ds-1">
      <div className="px-5"><Tabs tabs={isConsignment ? CF_TABS_CONSIGNMENT : CF_TABS} active={tab} onChange={setTab} /></div>
      <div className="px-5 py-5">
        {tab === 0 && generalTab?.(draft, (p) => setDraft((d: Record<string, unknown>) => ({ ...d, ...p })))}
        {tab === 0 && !generalTab && (
          <div>
            <div className="text-[13px] font-bold text-ink-2 mb-2.5">User Types</div>
            <UserTypeChips options={USER_TYPES} value={userTypes}
              onChange={(next) => setDraft((d: any) => ({ ...d, userTypeList: next }))} />
          </div>
        )}
        {tab === 1 && (
          <div className="space-y-5">
            <div>
              <div className="text-[13px] font-bold text-ink-2 mb-2.5">Default Date Field</div>
              <RadioRow options={DATE_FIELDS} value={draft.dateAppliedOn ?? 'created_at'}
                onChange={(v) => setDraft((d: any) => ({ ...d, dateAppliedOn: v }))} />
            </div>
            <div>
              <div className="text-[13px] font-bold text-ink-2 mb-2.5">Default Date range</div>
              <RadioRow options={DATE_RANGES} value={draft.selectedDateRange ?? -7}
                onChange={(v) => setDraft((d: any) => ({ ...d, selectedDateRange: v }))} />
            </div>
          </div>
        )}
        {tab === 2 && (empty && !MODULE_COLUMN_UNIVERSE[code]
          ? <EmptyState title="No table configuration yet" hint="This account has no saved column configuration for this module." />
          : <SequenceList items={seqItemsFromMap(colMap, MODULE_COLUMN_UNIVERSE[code])} onChange={setColumns} />)}
        {tab === 3 && (empty && !MODULE_FILTER_UNIVERSE[code]
          ? <EmptyState title="No filters configured yet" hint="This account has no saved filter configuration for this module." />
          : <SequenceList items={seqItemsFromMap(filtMap, MODULE_FILTER_UNIVERSE[code])} onChange={setFilters} />)}
        {tab === 4 && isConsignment && (
          <AddFormConfig form={form} onChange={(next) => setDraft((d: any) => ({ ...d, form: next }))} />
        )}
        <FooterBar dirty={dirty} saving={saving}
          onReset={() => setDraft(structuredClone(setting))}
          onSave={() => { onSave(draft); if (isConsignment) cacheFormBehavior(form) }} />
      </div>
    </div>
  )
}

/* ---------- Pickup Request — our own module (code PICKUP_REQUEST) ----------
 * Same anatomy as staging's Consignment Order page: General (User Types +
 * Feature Settings rows + Merchant rules) · Date Filter · Table Configuration ·
 * On Page Filters.
 * settingJson = { userTypes, featureSettings: PickupModuleConfig, dateAppliedOn?,
 * selectedDateRange?, pageRenderingConfig: { table: { columns }, filters } }.
 * The draft also carries `merchantRules` (an editable array view of
 * featureSettings.merchantOverrides); it is folded back and stripped on save.
 * Saving writes the localStorage mirror (src/config/pickupModule) FIRST — the
 * LOCAL app cannot reach /staging, and the page must work without a session. */

const PICKUP_USER_TYPES = ['Helper', 'Floor supervisor', 'Field Executive', 'Carrier', 'Admin', 'Manager']
const PICKUP_DEFAULT_USER_TYPES = ['Admin', 'Manager']

/* option lists (the scan / POD / overage ones also drive PickupExecutionRows) */
const SCAN_MODE_OPTIONS = [{ name: 'Driver', code: 'driver' }, { name: 'Hub', code: 'hub' }, { name: 'Both', code: 'both' }]
const OVERAGE_OPTIONS = [{ name: 'Hold', code: 'hold' }, { name: 'Auto-create', code: 'auto-create' }, { name: 'Reject', code: 'reject' }]
const POD_OPTIONS = [{ name: 'Required', code: 'required' }, { name: 'Optional', code: 'optional' }, { name: 'Off', code: 'off' }]
const STAGE_OPTIONS = [{ name: 'Requested', code: 'Requested' }, { name: 'Planned', code: 'Planned' }, { name: 'Assigned', code: 'Assigned' }]
const MULTI_PR_OPTIONS = [
  { name: 'One open per location', code: 'ONE_OPEN_PER_LOCATION' },
  { name: 'One per slot', code: 'ONE_PER_SLOT' },
  { name: 'Unlimited', code: 'UNLIMITED' },
]
const MULTI_PR_LABEL: Record<string, string> = Object.fromEntries(MULTI_PR_OPTIONS.map((o) => [o.code, o.name]))
const INHERIT = '__inherit__'
const PICKUP_MODE_OPTIONS = [{ name: 'Auto', code: 'auto' }, { name: 'Manual', code: 'manual' }]
const AUTO_AFTER_STATE_OPTIONS = [{ name: 'Created', code: 'Created' }, { name: 'Label Generated', code: 'Label Generated' }, { name: 'Ready To Ship', code: 'Ready To Ship' }]
const AUTO_DATE_RULE_OPTIONS = [
  { name: 'Same day, else next', code: 'same-day' }, { name: 'Next pickup day', code: 'next-business-day' }, { name: 'N days after', code: 'days-after-order' },
]
const DAY_OPTIONS = [{ code: 1, name: 'Mon' }, { code: 2, name: 'Tue' }, { code: 3, name: 'Wed' }, { code: 4, name: 'Thu' }, { code: 5, name: 'Fri' }, { code: 6, name: 'Sat' }, { code: 0, name: 'Sun' }]

/** editable row of the Merchant rules table — blank cells inherit the global value */
interface MerchantRuleDraft { code: string; sameDayCutoff: string; slots: string[]; multiPrPolicy: string; maxAttempts: string }

const slotsText = (v: unknown) => (Array.isArray(v) ? v.join(', ') : '')
const slotsFrom = (text: string) => text.split(',').map((x) => x.trim())

function allShown(keys: string[]): ShowSeqMap {
  return Object.fromEntries(keys.map((k, i) => [k, { show: true, sequence: i + 1 }]))
}

/** stored settingJson → a complete draft: missing parts come from the local mirror / defaults */
function seedPickupSetting(setting: Record<string, unknown>, rowEnabled: boolean | undefined): Record<string, unknown> {
  const stored = setting.featureSettings && typeof setting.featureSettings === 'object'
    ? (setting.featureSettings as Partial<PickupModuleConfig>) : {}
  const featureSettings: PickupModuleConfig = {
    ...readPickupModuleConfig(), ...stored,
    ...(rowEnabled === undefined ? {} : { enabled: rowEnabled }),   // the row flag is the Base Modules toggle
  }
  const merchantRules: MerchantRuleDraft[] = Object.entries(featureSettings.merchantOverrides ?? {}).map(([code, o]) => ({
    code,
    sameDayCutoff: o.sameDayCutoff ?? '',
    slots: o.slotDefinitions ?? [],
    multiPrPolicy: o.multiPrPolicy ?? '',
    maxAttempts: o.maxAttempts === undefined ? '' : String(o.maxAttempts),
  }))
  const prc = (setting.pageRenderingConfig ?? {}) as { table?: { columns?: ShowSeqMap }; filters?: ShowSeqMap }
  return {
    ...setting,
    userTypes: Array.isArray(setting.userTypes) ? setting.userTypes : PICKUP_DEFAULT_USER_TYPES,
    featureSettings,
    merchantRules,
    pageRenderingConfig: {
      ...prc,
      table: { ...prc.table, columns: prc.table?.columns ?? allShown(PICKUP_COLUMN_UNIVERSE) },
      filters: prc.filters ?? allShown(PICKUP_FILTER_UNIVERSE),
    },
  }
}

/** draft → { settingJson body, validated config } (merchantRules folded into merchantOverrides) */
function pickupSaveFrom(draft: Record<string, unknown>): { body: Record<string, unknown>; config: PickupModuleConfig } {
  const rest = { ...draft }
  const rules = (Array.isArray(rest.merchantRules) ? rest.merchantRules : []) as MerchantRuleDraft[]
  delete rest.merchantRules
  const merchantOverrides: Record<string, Record<string, unknown>> = {}
  for (const r of rules) {
    const code = r.code.trim()
    if (!code) continue
    merchantOverrides[code] = {
      sameDayCutoff: r.sameDayCutoff || undefined,
      slotDefinitions: r.slots.some((x) => x.trim()) ? r.slots : undefined,
      multiPrPolicy: r.multiPrPolicy || undefined,
      maxAttempts: r.maxAttempts === '' ? undefined : r.maxAttempts,
    }
  }
  const config = normalizePickupModuleConfig({ ...(rest.featureSettings as object), merchantOverrides })
  return { body: { ...rest, featureSettings: config }, config }
}

function FeatureRow({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  /* one setting per line (owner, 2026-09-23): the hint lives in the tooltip */
  return (
    <div className="flex items-center justify-between gap-6 px-4 py-2.5" title={hint}>
      <div className="min-w-0 text-[13.5px] text-ink">{label}</div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

/** Proof-of-pickup rows (signature · photo · OTP) */
function ProofOfPickupRows({ value, onChange }: {
  value: PickupModuleConfig['podRequirements']
  onChange: (next: PickupModuleConfig['podRequirements']) => void
}) {
  return (
    <>
      <FeatureRow label="Proof of pickup — signature" hint="Shipper signature captured by the driver.">
        <RadioRow options={POD_OPTIONS} value={value.signature}
          onChange={(v) => onChange({ ...value, signature: v as PodLevel })} />
      </FeatureRow>
      <FeatureRow label="Proof of pickup — photo" hint="Photo of the collected parcels.">
        <RadioRow options={POD_OPTIONS} value={value.photo}
          onChange={(v) => onChange({ ...value, photo: v as PodLevel })} />
      </FeatureRow>
      <FeatureRow label="Proof of pickup — OTP" hint="Shipper confirms the pickup with a one-time code.">
        <Toggle checked={value.otp} onChange={(v) => onChange({ ...value, otp: v })} />
      </FeatureRow>
    </>
  )
}

/** Pilot Driver App → "Pickup Module" card body: the execution subset of the
    pickup config (same mirror keys as the Pickup Request page — one source of truth). */
export type PickupExecution = Pick<PickupModuleConfig, 'scanMode' | 'podRequirements' | 'overagePolicy'>
export function PickupExecutionRows({ value, onChange }: { value: PickupExecution; onChange: (next: PickupExecution) => void }) {
  return (
    <div className="rounded-md border border-line divide-y divide-line">
      <FeatureRow label="Handover scan mode" hint="Who scans a picked-up consignment into the hub.">
        <RadioRow options={SCAN_MODE_OPTIONS} value={value.scanMode}
          onChange={(v) => onChange({ ...value, scanMode: v as PickupModuleConfig['scanMode'] })} />
      </FeatureRow>
      <ProofOfPickupRows value={value.podRequirements} onChange={(podRequirements) => onChange({ ...value, podRequirements })} />
      <FeatureRow label="Overage policy" hint="What happens to scanned parcels that are not on the request.">
        <RadioRow options={OVERAGE_OPTIONS} value={value.overagePolicy}
          onChange={(v) => onChange({ ...value, overagePolicy: v as PickupModuleConfig['overagePolicy'] })} />
      </FeatureRow>
    </div>
  )
}

function MerchantRulesTable({ rules, global, onChange }: {
  rules: MerchantRuleDraft[]
  global: Record<string, unknown>
  onChange: (next: MerchantRuleDraft[]) => void
}) {
  const setAt = (i: number, p: Partial<MerchantRuleDraft>) => onChange(rules.map((r, ri) => (ri === i ? { ...r, ...p } : r)))
  const rows = rules.map((r, i) => ({ r, i }))
  type Row = (typeof rows)[number]
  const cols: SimpleCol<Row>[] = [
    { label: 'Merchant code', render: ({ r, i }) => <div className="w-36"><Input value={r.code} placeholder="e.g. 2GO_PH" onChange={(v) => setAt(i, { code: v })} /></div> },
    { label: 'Same-day cutoff', render: ({ r, i }) => <div className="w-28"><Input type="time" value={r.sameDayCutoff} onChange={(v) => setAt(i, { sameDayCutoff: v })} /></div> },
    { label: 'Slots', render: ({ r, i }) => <Input value={slotsText(r.slots)} placeholder={slotsText(global.slotDefinitions)} onChange={(v) => setAt(i, { slots: v ? slotsFrom(v) : [] })} /> },
    { label: 'Policy', render: ({ r, i }) => (
      <div className="w-48">
        <MenuSelect value={r.multiPrPolicy || INHERIT} options={[INHERIT, ...MULTI_PR_OPTIONS.map((o) => o.code)]}
          labels={(v) => (v === INHERIT ? `Inherit (${MULTI_PR_LABEL[String(global.multiPrPolicy)] ?? 'global'})` : MULTI_PR_LABEL[v] ?? v)}
          onChange={(v) => setAt(i, { multiPrPolicy: v === INHERIT ? '' : v })} />
      </div>
    ) },
    { label: 'Max attempts', render: ({ r, i }) => <div className="w-20"><Input type="number" value={r.maxAttempts} placeholder={String(global.maxAttempts ?? '')} onChange={(v) => setAt(i, { maxAttempts: v })} /></div> },
    { label: ' ', align: 'right', render: ({ i }) => <Button size="sm" variant="ghost" onClick={() => onChange(rules.filter((_, ri) => ri !== i))}>Remove</Button> },
  ]
  return (
    <div>
      <div className="text-[13px] font-bold text-ink-2 mb-1">Merchant rules</div>
      <p className="text-[12.5px] text-ink-3 mb-2.5">Per-merchant overrides. A blank cell inherits the global value; slots are comma-separated <span className="font-mono">HH:mm-HH:mm</span>.</p>
      {rules.length > 0 && (
        <div className="rounded-md border border-line mb-2.5">
          <SimpleTable columns={cols} rows={rows} rowKey={(x) => x.i} />
        </div>
      )}
      <Button size="sm" variant="outline"
        onClick={() => onChange([...rules, { code: '', sameDayCutoff: '', slots: [], multiPrPolicy: '', maxAttempts: '' }])}>
        + Add merchant rule
      </Button>
    </div>
  )
}

function PickupGeneralTab({ draft, patch }: {
  draft: Record<string, unknown>
  patch: (p: Record<string, unknown>) => void
}) {
  const userTypes = (Array.isArray(draft.userTypes) ? draft.userTypes : []) as string[]
  const fs = (draft.featureSettings ?? {}) as Record<string, unknown>
  const rules = (Array.isArray(draft.merchantRules) ? draft.merchantRules : []) as MerchantRuleDraft[]
  const set = (k: keyof PickupModuleConfig, v: unknown) => patch({ featureSettings: { ...fs, [k]: v } })
  /* keep '' while the user edits; normalized on save */
  const numIn = (k: keyof PickupModuleConfig) => (v: string) => set(k, v === '' ? '' : Number(v))
  const str = (k: keyof PickupModuleConfig) => (fs[k] === undefined ? '' : String(fs[k]))
  const pod = { ...DEFAULT_PICKUP_MODULE_CONFIG.podRequirements, ...(fs.podRequirements as object) } as PickupModuleConfig['podRequirements']
  const auto = { ...DEFAULT_PICKUP_MODULE_CONFIG.autoPickup, ...((fs.autoPickup ?? {}) as object) } as AutoPickupConfig
  const setAuto = (p: Partial<AutoPickupConfig>) => set('autoPickup', { ...auto, ...p })

  return (
    <div className="space-y-6">
      <div>
        <div className="text-[13px] font-bold text-ink-2 mb-2.5">User Types</div>
        <UserTypeChips options={PICKUP_USER_TYPES} value={userTypes} onChange={(next) => patch({ userTypes: next })} />
      </div>
      <div>
        <div className="text-[13px] font-bold text-ink-2 mb-2.5">Feature Settings</div>
        <div className="rounded-md border border-line divide-y divide-line">
          <FeatureRow label="Pickup module enabled" hint="Same switch as the Pickup Request card on Base Modules.">
            <Toggle checked={!!fs.enabled} onChange={(v) => set('enabled', v)} />
          </FeatureRow>
          {/* owner, 2026-09-24: a disabled module shows nothing but its switch */}
          {!!fs.enabled && (<>
          {/* auto = raised at creation on a computed date; manual = booked by merchants / ops */}
          <FeatureRow label="Pickup request mode" hint="Auto raises a request the moment a consignment is created; Manual keeps Schedule / Book / Create Pickup on the pages.">
            <RadioRow options={PICKUP_MODE_OPTIONS} value={String(fs.mode ?? 'manual')} onChange={(v) => set('mode', v)} />
          </FeatureRow>
          {fs.mode === 'auto' && (
            <>
              <FeatureRow label="Auto pickup — raise after state" hint="The consignment state that raises the request; later states never do.">
                <RadioRow options={AUTO_AFTER_STATE_OPTIONS} value={String(auto.afterState)} onChange={(v) => setAuto({ afterState: v as AutoPickupConfig['afterState'] })} />
              </FeatureRow>
              <FeatureRow label="Auto pickup — user picks the window" hint="On: the consignment form offers a date + slot under the slot rules; the date rule below is the fallback.">
                <Toggle checked={!!auto.userSelectsWindow} onChange={(v) => setAuto({ userSelectsWindow: v })} />
              </FeatureRow>
              {auto.userSelectsWindow && (
                <FeatureRow label="Auto pickup — book up to (days ahead)" hint="The furthest date the user may pick (1–30).">
                  <div className="w-28"><Input type="number" value={String(auto.maxDaysAhead)} onChange={(v) => setAuto({ maxDaysAhead: v === '' ? 7 : Number(v) })} /></div>
                </FeatureRow>
              )}
              <FeatureRow label="Auto pickup — date rule" hint="Which day the collection is booked for, counted from creation.">
                <RadioRow options={AUTO_DATE_RULE_OPTIONS} value={String(auto.dateRule)} onChange={(v) => setAuto({ dateRule: v as AutoPickupConfig['dateRule'] })} />
              </FeatureRow>
              {auto.dateRule === 'days-after-order' && (
                <FeatureRow label="Auto pickup — days after creation" hint="0 = same day, 1 = next day (0–14); rolls onto a pickup day.">
                  <div className="w-28"><Input type="number" value={String(auto.daysAfterOrder)} onChange={(v) => setAuto({ daysAfterOrder: v === '' ? 0 : Number(v) })} /></div>
                </FeatureRow>
              )}
              <FeatureRow label="Auto pickup — window" hint="One of the pickup slots; blank = the first slot.">
                <div className="w-40"><Input value={auto.slot} placeholder={slotsFrom(slotsText(fs.slotDefinitions))[0] ?? '09:00-12:00'} onChange={(v) => setAuto({ slot: v })} /></div>
              </FeatureRow>
              <FeatureRow label="Auto pickup — pickup days" hint="Days a request may be raised for; others roll forward.">
                <div className="flex flex-wrap gap-1.5">
                  {DAY_OPTIONS.map((d) => {
                    const on = auto.pickupDays.includes(d.code)
                    return (
                      <button key={d.code} type="button" aria-pressed={on}
                        onClick={() => setAuto({ pickupDays: on ? auto.pickupDays.filter((x) => x !== d.code) : [...auto.pickupDays, d.code].sort() })}
                        className={`rounded-full border px-2.5 py-0.5 text-[12px] ${on ? 'border-brand-500 bg-brand-50 font-bold text-brand-500' : 'border-line bg-surface text-ink-2'}`}>{d.name}</button>
                    )
                  })}
                </div>
              </FeatureRow>
            </>
          )}
          <FeatureRow label="Handover scan mode" hint="Who scans a picked-up consignment into the hub.">
            <RadioRow options={SCAN_MODE_OPTIONS} value={String(fs.scanMode ?? '')} onChange={(v) => set('scanMode', v)} />
          </FeatureRow>
          <FeatureRow label="Max attempts" hint="Pickup attempts before a failed request closes (1–5).">
            <div className="w-28"><Input type="number" value={str('maxAttempts')} onChange={numIn('maxAttempts')} /></div>
          </FeatureRow>
          {fs.mode !== 'auto' && (
          <FeatureRow label="Allow add-to-existing until" hint="Last status at which consignments can join an existing request.">
            <RadioRow options={STAGE_OPTIONS} value={String(fs.allowAddToExistingUntil ?? '')} onChange={(v) => set('allowAddToExistingUntil', v)} />
          </FeatureRow>
          )}
          <FeatureRow label="Reschedule window (days)" hint="How far ahead a pickup can be rescheduled.">
            <div className="w-28"><Input type="number" value={str('rescheduleWindowDays')} onChange={numIn('rescheduleWindowDays')} /></div>
          </FeatureRow>
          <FeatureRow label="Overage policy" hint="What happens to scanned parcels that are not on the request.">
            <RadioRow options={OVERAGE_OPTIONS} value={String(fs.overagePolicy ?? '')} onChange={(v) => set('overagePolicy', v)} />
          </FeatureRow>
          {/* `cutoffTime` is not shown: Same-day cutoff below is THE rule. The key
              stays in the config type (and in saved blobs) for compatibility. */}
          <FeatureRow label="Booking lead time (minutes)" hint="Minimum notice before a pickup window may start; a window sooner than this moves to the next slot or day (auto and manual).">
            <div className="w-28"><Input type="number" value={str('bookingLeadTimeMins')} onChange={numIn('bookingLeadTimeMins')} /></div>
          </FeatureRow>
          <FeatureRow label="Same-day cutoff" hint="Book before this for a same-day pickup; later bookings start next business day.">
            <div className="w-32"><Input type="time" value={str('sameDayCutoff')} onChange={(v) => set('sameDayCutoff', v)} /></div>
          </FeatureRow>
          <FeatureRow label="Pickup slots" hint="Comma-separated windows, HH:mm-HH:mm.">
            <div className="w-72"><Input value={slotsText(fs.slotDefinitions)} onChange={(v) => set('slotDefinitions', v ? slotsFrom(v) : [])} /></div>
          </FeatureRow>
          <ProofOfPickupRows value={pod} onChange={(next) => set('podRequirements', next)} />
          {fs.mode !== 'auto' && (
          <FeatureRow label="Merchant can cancel until" hint="Last status at which a merchant may cancel a request.">
            <RadioRow options={STAGE_OPTIONS} value={String(fs.merchantCancelUntil ?? '')} onChange={(v) => set('merchantCancelUntil', v)} />
          </FeatureRow>
          )}
          <FeatureRow label="Auto-reschedule on failure" hint="Re-raise a failed pickup for the next business day while attempts remain.">
            <Toggle checked={!!fs.autoRescheduleOnFail} onChange={(v) => set('autoRescheduleOnFail', v)} />
          </FeatureRow>
          </>)}
        </div>
      </div>
      {!!fs.enabled && fs.mode !== 'auto' && <MerchantRulesTable rules={rules} global={fs} onChange={(next) => patch({ merchantRules: next })} />}
    </div>
  )
}

/* ---------- Geo Coding — bespoke replica ---------- */

const GEO_PROVIDERS: Record<string, string> = { google: 'Google', googleRetry: 'Google Retry', hereMaps: 'Here Maps' }
const GEO_ADDRESS_TYPES: Record<string, string> = {
  shipFromAddress: 'Ship from Address', shipToAddress: 'Ship to Address', returnToAddress: 'Return to Address',
}

function GeoCodingDetail({ setting, onSave, saving }: {
  setting: Record<string, any>
  onSave: (next: Record<string, any>) => void
  saving: boolean
}) {
  const [draft, setDraft] = useState(() => structuredClone(setting))
  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(setting), [draft, setting])

  /* mapProvider is stored as {"1":{provider,isPartialLookupAllowed},"2":…} */
  const providers: { provider: string; isPartialLookupAllowed: boolean }[] =
    Object.keys(draft.mapProvider ?? {}).sort((a, b) => Number(a) - Number(b)).map((k) => draft.mapProvider[k])
  const setProviders = (list: typeof providers) =>
    setDraft((d: any) => ({ ...d, mapProvider: Object.fromEntries(list.map((p, i) => [String(i + 1), p])) }))
  const available = Object.keys(GEO_PROVIDERS).filter((p) => !providers.some((x) => x.provider === p))
  const addressTypes: string[] = draft.addressTypes ?? []

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir
    if (j < 0 || j >= providers.length) return
    const next = [...providers]
    ;[next[i], next[j]] = [next[j], next[i]]
    setProviders(next)
  }

  return (
    <div className="space-y-4">
      <div className="bg-surface border border-line rounded-xl shadow-ds-1 px-5 py-5">
        <div className="text-[15px] font-bold text-ink">Map Provider Configuration</div>
        <div className="text-[12.5px] text-brand-600 mt-0.5 mb-4">Select map providers and set their priority order.</div>
        <div className="text-[11.5px] font-bold tracking-wide text-warm-400 mb-2">PRIORITY ORDER</div>
        <div className="space-y-2 max-w-xl">
          {providers.map((p, i) => (
            <div key={p.provider} className="flex items-center gap-3 rounded-md border border-brand-100 bg-brand-50 px-3.5 py-2.5">
              <div className="flex flex-col -my-1">
                <button onClick={() => move(i, -1)} disabled={i === 0}
                  className="text-warm-400 hover:text-ink-2 disabled:opacity-30 leading-none">▴</button>
                <button onClick={() => move(i, 1)} disabled={i === providers.length - 1}
                  className="text-warm-400 hover:text-ink-2 disabled:opacity-30 leading-none">▾</button>
              </div>
              <span className="h-6 w-6 shrink-0 rounded-full bg-brand-500 text-white text-[12px] font-bold inline-flex items-center justify-center">{i + 1}</span>
              <span className="text-[13.5px] text-ink flex-1">{GEO_PROVIDERS[p.provider] ?? p.provider}</span>
              <Checkbox checked={p.isPartialLookupAllowed} label="Partial lookup"
                onChange={(v) => setProviders(providers.map((x, xi) => (xi === i ? { ...x, isPartialLookupAllowed: v } : x)))} />
              <button onClick={() => setProviders(providers.filter((_, xi) => xi !== i))}
                className="text-warm-400 hover:text-danger-fg ml-1">✕</button>
            </div>
          ))}
        </div>
        {available.length > 0 && (
          <>
            <div className="text-[11.5px] font-bold tracking-wide text-warm-400 mt-4 mb-2">AVAILABLE PROVIDERS</div>
            <div className="flex gap-2 max-w-xl">
              {available.map((p) => (
                <button key={p} onClick={() => setProviders([...providers, { provider: p, isPartialLookupAllowed: false }])}
                  className="flex-1 flex items-center gap-2.5 rounded-md border border-dashed border-warm-300 bg-warm-50 px-3.5 py-2.5 text-[13.5px] text-ink-3 hover:border-warm-400 hover:text-ink-2 transition-colors">
                  <span className="h-5 w-5 rounded border border-warm-300 inline-flex items-center justify-center text-[12px]">+</span>
                  {GEO_PROVIDERS[p]}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      <div className="bg-surface border border-line rounded-xl shadow-ds-1 px-5 py-5">
        <div className="text-[15px] font-bold text-ink">Address Type Configuration</div>
        <div className="text-[12.5px] text-brand-600 mt-0.5 mb-4">Selecting at least one geocoding location type is mandatory.</div>
        <div className="space-y-2 max-w-xl">
          {Object.entries(GEO_ADDRESS_TYPES).map(([k, label]) => {
            const on = addressTypes.includes(k)
            return (
              <button key={k}
                onClick={() => setDraft((d: any) => ({ ...d, addressTypes: on ? addressTypes.filter((x) => x !== k) : [...addressTypes, k] }))}
                className={`w-full flex items-center gap-3 rounded-md border px-3.5 py-3 text-left text-[13.5px] transition-colors
                  ${on ? 'border-brand-500 bg-brand-50 text-ink font-bold' : 'border-line bg-warm-50 text-ink-3 hover:border-warm-300'}`}>
                <span className={`h-5 w-5 rounded inline-flex items-center justify-center text-[12px] text-white
                  ${on ? 'bg-brand-500' : 'border border-warm-300 bg-surface'}`}>{on ? '✓' : ''}</span>
                {label}
              </button>
            )
          })}
        </div>
        <FooterBar dirty={dirty} saving={saving}
          onReset={() => setDraft(structuredClone(setting))}
          onSave={() => onSave(draft)} />
      </div>
    </div>
  )
}

/* ---------- Generic structured editor for the other modules ---------- */

function GenericValue({ value, onChange }: { value: any; onChange: (v: any) => void }) {
  if (typeof value === 'boolean') return <Toggle checked={value} onChange={onChange} />
  if (typeof value === 'number') return <div className="w-40"><Input value={String(value)} onChange={(v) => onChange(Number(v) || 0)} /></div>
  if (typeof value === 'string') return <div className="w-72 max-w-full"><Input value={value} onChange={onChange} /></div>
  return null
}

function isSeqArray(v: any): v is { key: string; sequence: number }[] {
  return Array.isArray(v) && v.length > 0 && v.every((x) => x && typeof x === 'object' && 'key' in x && 'sequence' in x)
}

export function GenericSection({ obj, onChange, depth = 0 }: { obj: Record<string, any>; onChange: (o: Record<string, any>) => void; depth?: number }) {
  const set = (k: string, v: any) => onChange({ ...obj, [k]: v })
  const entries = Object.entries(obj)
  const simple = entries.filter(([, v]) => ['boolean', 'number', 'string'].includes(typeof v))
  const seqs = entries.filter(([, v]) => isSeqArray(v))
  const nested = entries.filter(([, v]) => v && typeof v === 'object' && !Array.isArray(v))
  const other = entries.filter(([k]) => ![...simple, ...seqs, ...nested].some(([k2]) => k2 === k))
  return (
    <div className="space-y-4">
      {simple.length > 0 && (
        <div className="space-y-3">
          {simple.map(([k, v]) => (
            <div key={k} className="flex items-center justify-between gap-4 py-1">
              <span className="text-[13.5px] text-ink">{labelFor(k)}</span>
              <GenericValue value={v} onChange={(nv) => set(k, nv)} />
            </div>
          ))}
        </div>
      )}
      {seqs.map(([k, v]) => (
        <Field key={k} label={labelFor(k)}>
          <SequenceList
            items={buildSeqItems(v, v.map((x: any) => x.key))}
            onChange={(items) => set(k, items.filter((i) => i.selected).map((i) => ({ key: i.key, sequence: i.sequence })))}
          />
        </Field>
      ))}
      {nested.map(([k, v]) => (
        <details key={k} open={depth === 0} className="rounded-md border border-line bg-surface open:pb-3">
          <summary className="cursor-pointer select-none px-4 py-3 text-[13.5px] font-bold text-ink hover:bg-warm-50 rounded-md">
            {labelFor(k)}
          </summary>
          <div className="px-4 pt-1">
            <GenericSection obj={v} onChange={(nv) => set(k, nv)} depth={depth + 1} />
          </div>
        </details>
      ))}
      {other.map(([k, v]) => (
        <Field key={k} label={labelFor(k)}>
          <pre className="max-h-56 overflow-auto rounded-md bg-warm-50 border border-line px-3.5 py-3 text-[12px] leading-relaxed text-ink-2 font-mono">
            {JSON.stringify(v, null, 2)}
          </pre>
        </Field>
      ))}
    </div>
  )
}

function GenericDetail({ setting, onSave, saving }: {
  setting: Record<string, any>
  onSave: (next: Record<string, any>) => void
  saving: boolean
}) {
  const [draft, setDraft] = useState(() => structuredClone(setting))
  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(setting), [draft, setting])
  return (
    <div className="bg-surface border border-line rounded-xl shadow-ds-1 px-5 py-5">
      <GenericSection obj={draft} onChange={setDraft} />
      <FooterBar dirty={dirty} saving={saving}
        onReset={() => setDraft(structuredClone(setting))}
        onSave={() => onSave(draft)} />
    </div>
  )
}

/* ---------- page shell ---------- */

export default function ModuleDetailPage() {
  const nav = useNavigate()
  const { code: param } = useParams()
  /* routes use staging's slugs (consignment_order, geo_code, …); accept the raw code too */
  const meta = BASE_MODULES.find((m) => m.slug === param || m.code === param)
  const code = meta?.code
  const [row, setRow] = useState<ModuleSetting | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  /* PICKUP_REQUEST only: last settingJson saved to the mirror while staging was unreachable */
  const [localJson, setLocalJson] = useState<string | null>(null)

  const load = () => {
    if (!code) return
    setLoading(true)
    setError(null)
    fetchModuleSettings([code])
      .then((rows) => setRow(rows[0] ?? null))
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false))
  }
  useEffect(load, [code])

  if (!meta) return <EmptyState title="Module not found" />
  /* link cards (General Settings) have no module page of their own */
  if (meta.kind === 'link') return <Navigate to={meta.to ?? '/console/settings/base-modules'} replace />

  const setting = (parseSettingJson(row?.settingJson) ?? {}) as Record<string, any>

  /** PUT/POST the whole row; `enabledOverride` lets a page flip the row flag too */
  const save = async (next: Record<string, any>, enabledOverride?: boolean, localFallback = false): Promise<boolean> => {
    if (!code) return false
    setSaving(true)
    try {
      const settingJson = JSON.stringify(next)
      const enabled = enabledOverride ?? row?.enabled ?? true
      await saveModuleSettings(
        [{ enabled, code, name: row?.name ?? meta.title, settingJson }],
        !!row,
      )
      setRow((r) => (r ? { ...r, enabled, settingJson } : { code, name: meta.title, enabled, settingJson }))
      toast.success('Settings saved successfully.')
      return true
    } catch (e) {
      if (localFallback) {
        toast.info('Saved locally — staging is unavailable, so the console row was not updated.')
        console.warn('module save failed; local mirror updated', e)
      } else {
        toast.error('Failed to save settings. Please try again later.')
        console.error('module save failed', e)
      }
      return false
    } finally {
      setSaving(false)
    }
  }

  const savePickup = async (next: Record<string, unknown>) => {
    const { body, config } = pickupSaveFrom(next)
    writePickupModuleConfig(config)   // mirror FIRST: the LOCAL app reads it, and it must work without staging
    const ok = await save(body, config.enabled, true)
    if (!ok) setLocalJson(JSON.stringify(body))   // keep the form clean against what was saved locally
  }

  return (
    <div className="w-full max-w-4xl">
      <PageHeader title={meta.pageTitle ?? meta.title} subtitle={meta.pageSubtitle ?? meta.desc} onBack={() => nav('/console/settings/base-modules')} />
      {loading ? (
        <div className="bg-surface border border-line rounded-xl px-5 py-10 flex items-center justify-center animate-pulse text-[13px] text-ink-3">
          Loading module settings…
        </div>
      ) : code === 'PICKUP_REQUEST' ? (
        <div>
          {error && (
            <div className="mb-3 flex items-center gap-2 rounded-md border border-line bg-warm-50 px-3.5 py-2.5 text-[13px] text-ink-3">
              <AlertCircle size={15} className="shrink-0 text-warning-fg" />
              <span className="flex-1">Staging is unavailable ({error}) — changes are saved to this browser's local pickup config only.</span>
              <Button size="sm" variant="ghost" icon={<RefreshCw size={13} />} onClick={load}>Retry</Button>
            </div>
          )}
          <ColumnsFiltersDetail key={row?.lastUpdatedAt ?? 'pickup'} code={code}
            setting={seedPickupSetting(parseSettingJson(localJson ?? row?.settingJson) as Record<string, unknown> ?? {}, row?.enabled)}
            onSave={savePickup} saving={saving}
            generalTab={(draft, patch) => <PickupGeneralTab draft={draft} patch={patch} />} />
        </div>
      ) : error ? (
        <div className="bg-surface border border-line rounded-md px-5 py-8 flex flex-col items-center gap-3 text-center">
          <AlertCircle size={22} className="text-danger-fg" />
          <div className="text-[13px] text-ink-3">{error}</div>
          <Button variant="outline" icon={<RefreshCw size={14} />} onClick={load}>Retry</Button>
        </div>
      ) : code === 'OPS_DASHBOARD' ? (
        <OpsDashboardDetail key={row?.lastUpdatedAt ?? 'ops'} setting={setting} onSave={save} saving={saving} />
      ) : ['CONSIGNMENT_MANAGEMENT', 'PENDING_FOR_PLANNING', 'LOAD_PLANNING', 'CARRIER_PORTAL'].includes(code!) ? (
        <ColumnsFiltersDetail key={row?.lastUpdatedAt ?? 'cf'} code={code!} setting={setting} onSave={save} saving={saving} />
      ) : code === 'GEOCODING' ? (
        <GeoCodingDetail key={row?.lastUpdatedAt ?? 'geo'} setting={setting} onSave={save} saving={saving} />
      ) : Object.keys(setting).length ? (
        <GenericDetail key={row?.lastUpdatedAt ?? 'gen'} setting={setting} onSave={save} saving={saving} />
      ) : (
        <EmptyState title="No settings configured for this module yet"
          hint="Enable the module first — its configuration will appear here once the account has settings for it." />
      )}
    </div>
  )
}
