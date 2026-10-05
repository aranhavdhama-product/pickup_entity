/**
 * LOCAL app → Settings → Consignment Order (`/local/settings/consignment-order`).
 *
 * Staging's Base Modules → Consignment Order (moduleSettings `CONSIGNMENT_MANAGEMENT`),
 * captured 2026-09-24 — docs/superpowers/research/2026-09-24-staging-general-and-consignment-settings.md.
 * Functionality reference only: the module switch, then General (User Types,
 * Feature Settings) · Date Filter · Table Configuration · On Page Filters, rebuilt
 * in our settings grammar (PageHeader → cards, one setting per line). Module off
 * shows only the switch, as on the Pickup module page.
 *
 * Persisted to the localStorage mirror in `src/config/consignmentModule`
 * (`fareye-consignment-module-config-v1`). `/local/consignments` reads the
 * Table Configuration and the Date Filter once this page has been saved; User
 * Types, Modify-till and On Page Filters are stored only. The Form Fields tab (2026-09-25) writes
 * Shown / Required / Hidden per optional form field into `fe-consignment-form-behavior`
 * (ConsignmentAdd/fieldConfig): hides reach both order forms, Required the Grow merchant form.
 * 2026-10-05: the tab opens with "Customise the forms" — the way into the form builder for the Console form and the
 * Grow portal form (`/local/consignments/new?edit=console|grow`: Format checks, own fields, Grow-only changes).
 */
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Checkbox, PageHeader, SequenceList, Tabs, type SeqItem } from '../../nueva/components'
import { toast } from '../../nueva/toast'
import {
  DEFAULT_CONSIGNMENT_MODULE_CONFIG, useConsignmentModuleConfig, writeConsignmentModuleConfig,
  type ConsignmentModuleConfig as Config,
} from '../../config/consignmentModule'
import {
  CONSIGNMENT_COLUMN_LABELS, CONSIGNMENT_COLUMN_UNIVERSE, CONSIGNMENT_DATE_FIELDS, CONSIGNMENT_DATE_RANGES,
  CONSIGNMENT_FILTER_LABELS, CONSIGNMENT_FILTER_UNIVERSE, CONSIGNMENT_USER_TYPES, MODIFY_CONSIGNMENT_TILL_OPTIONS,
  orderViewTitle,
} from '../../config/consignmentModuleUniverse'
import { useGeneralSettings } from '../../config/generalSettings'
import {
  CONSIGNMENT_FIELDS, FIELD_SECTIONS, cacheFormBehavior, loadFormBehavior, type FormBehavior,
} from '../ConsignmentAdd/fieldConfig'
import { OptionSelect, SectionCard, SettingRow, ToggleField } from './settingsRows'
import { loadCustomFields, loadRules } from '../LocalConsignments/formSetup'

const TABS = ['General', 'Date Filter', 'Table Configuration', 'On Page Filters', 'Form Fields']

/* ---- Form Fields (2026-09-25): which optional consignment-form fields are shown, required or
   hidden — stored in the SAME `fe-consignment-form-behavior` mirror the console Base Modules page
   writes (hidden + the new `required`). Hides reach both forms; Required is honoured by the Grow
   merchant order form (the console form keeps staging's own required set). Merchant and Task are
   carrier / UI-only and never listed. */
type FieldRule = 'shown' | 'required' | 'hidden'
const RULES: { name: string; code: FieldRule }[] = [
  { name: 'Shown', code: 'shown' }, { name: 'Required', code: 'required' }, { name: 'Hidden', code: 'hidden' },
]
const NOT_LISTED = new Set(['merchant', 'task', 'routingType'])
interface FormRules { hidden: string[]; required: string[] }
const rulesOf = (b: FormBehavior): FormRules => ({ hidden: [...b.hidden].sort(), required: [...(b.required ?? [])].sort() })
const ruleOf = (r: FormRules, key: string): FieldRule => (r.hidden.includes(key) ? 'hidden' : r.required.includes(key) ? 'required' : 'shown')
const withRule = (r: FormRules, key: string, rule: FieldRule): FormRules => ({
  hidden: [...r.hidden.filter((k) => k !== key), ...(rule === 'hidden' ? [key] : [])].sort(),
  required: [...r.required.filter((k) => k !== key), ...(rule === 'required' ? [key] : [])].sort(),
})

const same = (a: Config, b: Config) => JSON.stringify(a) === JSON.stringify(b)

/** ordered shown keys → SequenceList rows over the whole universe */
const toItems = (universe: string[], shown: string[]): SeqItem[] =>
  universe.map((key) => ({ key, selected: shown.includes(key), sequence: shown.indexOf(key) + 1 }))
/** SequenceList rows → ordered shown keys (a fresh array — never the shared defaults) */
const fromItems = (items: SeqItem[]): string[] =>
  items.filter((i) => i.selected).sort((a, b) => a.sequence - b.sequence).map((i) => i.key)

export default function ConsignmentOrderSettings() {
  const navigate = useNavigate()
  const stored = useConsignmentModuleConfig()
  const { viewOnOrder } = useGeneralSettings()
  const [draft, setDraft] = useState<Config>(stored)
  const [tab, setTab] = useState(0)
  const set = (p: Partial<Config>) => setDraft((d) => ({ ...d, ...p }))
  const [savedRules, setSavedRules] = useState<FormRules>(() => rulesOf(loadFormBehavior()))
  const [rules, setRules] = useState<FormRules>(savedRules)
  const rulesDirty = JSON.stringify(rules) !== JSON.stringify(savedRules)
  const noRules = rules.hidden.length === 0 && rules.required.length === 0
  const dirty = !same(draft, stored) || rulesDirty
  const save = () => {
    writeConsignmentModuleConfig(draft)
    /* read-modify-write: the console Base Modules page owns the other keys of this mirror */
    cacheFormBehavior({ ...loadFormBehavior(), hidden: rules.hidden, required: rules.required })
    setSavedRules(rules)
    toast.success('Settings saved successfully')
  }
  /* the store turns an empty column list back into the defaults — block that save instead */
  const noColumns = draft.enabled && draft.tableColumns.length === 0

  /* what the form builder holds today (read once — the builder is another page) */
  const [formSetup] = useState(() => ({ custom: loadCustomFields().length, growChanges: Object.keys(loadRules('grow')).length }))
  const columnLabel = (k: string) => orderViewTitle(k, CONSIGNMENT_COLUMN_LABELS[k] ?? k, viewOnOrder)
  const filterLabel = (k: string) => orderViewTitle(k, CONSIGNMENT_FILTER_LABELS[k] ?? k, viewOnOrder)
  const toggleUserType = (u: string, on: boolean) =>
    set({ userTypes: on ? [...draft.userTypes, u] : draft.userTypes.filter((x) => x !== u) })

  return (
    <div className="p-6 pb-10">
      <PageHeader
        title="Consignment Order"
        subtitle="Control which columns and filters are displayed, their sequence, and accessibility settings."
        onBack={() => navigate('/local/settings')}
        right={(
          <div className="flex items-center gap-2">
            <Button variant="ghost" disabled={same(draft, DEFAULT_CONSIGNMENT_MODULE_CONFIG) && noRules}
              onClick={() => { setDraft(DEFAULT_CONSIGNMENT_MODULE_CONFIG); setRules({ hidden: [], required: [] }); toast.info('Defaults restored — Save to apply') }}>
              Restore defaults
            </Button>
            <Button variant="outline" onClick={() => { setDraft(stored); setRules(savedRules) }} disabled={!dirty}>Reset</Button>
            <Button disabled={!dirty || noColumns} onClick={save}>
              Save Settings
            </Button>
          </div>
        )}
      />
      <div className="grid max-w-4xl gap-4">
        <SectionCard title="Module">
          <SettingRow label="Consignment Order" hint="Manage your consignment order settings.">
            <ToggleField checked={draft.enabled} onChange={(v) => set({ enabled: v })} />
          </SettingRow>
        </SectionCard>

        {draft.enabled && (
          <>
            <Tabs tabs={TABS} active={tab} onChange={setTab} />

            {tab === 0 && (
              <>
                <SectionCard title="User Types" hint="The user types this module applies to.">
                  <SettingRow label="User Types" hint={`${draft.userTypes.length} of ${CONSIGNMENT_USER_TYPES.length} selected`} width="w-[26rem]">
                    <div className="flex flex-wrap justify-end gap-x-4 gap-y-2">
                      {CONSIGNMENT_USER_TYPES.map((u) => (
                        <Checkbox key={u} label={u} checked={draft.userTypes.includes(u)} onChange={(v) => toggleUserType(u, v)} />
                      ))}
                    </div>
                  </SettingRow>
                </SectionCard>
                <SectionCard title="Feature Settings">
                  <SettingRow label="Modify consignment Action till" hint="The last stage at which a consignment can still be modified.">
                    <OptionSelect options={MODIFY_CONSIGNMENT_TILL_OPTIONS} value={draft.modifyConsignmentTill}
                      onChange={(v) => set({ modifyConsignmentTill: v })} />
                  </SettingRow>
                </SectionCard>
              </>
            )}

            {tab === 1 && (
              <SectionCard title="Date Filter" hint="The date the listing filters on, and the range it opens with.">
                <SettingRow label="Default Date Field">
                  <OptionSelect options={CONSIGNMENT_DATE_FIELDS} value={draft.dateAppliedOn} onChange={(v) => set({ dateAppliedOn: v })} />
                </SettingRow>
                <SettingRow label="Default Date range">
                  <OptionSelect options={CONSIGNMENT_DATE_RANGES} value={draft.selectedDateRange} onChange={(v) => set({ selectedDateRange: v })} />
                </SettingRow>
              </SectionCard>
            )}

            {tab === 2 && (
              <SectionCard title="Table Configuration" hint="Columns shown on the Consignment Order listing, in sequence.">
                {noColumns && <p className="py-2 text-[13px] text-danger-fg">Select at least one column to save.</p>}
                <div className="py-3">
                  <SequenceList reorderable labelOf={columnLabel}
                    items={toItems(CONSIGNMENT_COLUMN_UNIVERSE, draft.tableColumns)}
                    onChange={(items) => set({ tableColumns: fromItems(items) })} />
                </div>
              </SectionCard>
            )}

            {tab === 3 && (
              <SectionCard title="On Page Filters" hint="Filters offered on the Consignment Order listing, in sequence.">
                <div className="py-3">
                  <SequenceList reorderable labelOf={filterLabel}
                    items={toItems(CONSIGNMENT_FILTER_UNIVERSE, draft.filters)}
                    onChange={(items) => set({ filters: fromItems(items) })} />
                </div>
              </SectionCard>
            )}

            {tab === 4 && (
              <SectionCard title="Customise the forms" hint="Open a form to rename, require or hide its fields, check what is typed (Format) and add your own fields.">
                <SettingRow label="Console form" hint={`What ops see on Add Consignment${formSetup.custom ? ` · ${formSetup.custom} own field${formSetup.custom === 1 ? '' : 's'}` : ''}`}>
                  <Button variant="outline" onClick={() => navigate('/local/consignments/new?edit=console')}>Edit console form</Button>
                </SettingRow>
                <SettingRow label="Grow portal form" hint={`What merchants see on Create Order — follows the console form${formSetup.growChanges ? ` · ${formSetup.growChanges} field${formSetup.growChanges === 1 ? '' : 's'} changed for Grow` : ' unless you change it for Grow'}`}>
                  <Button variant="outline" onClick={() => navigate('/local/consignments/new?edit=grow')}>Edit Grow portal form</Button>
                </SettingRow>
              </SectionCard>
            )}
            {tab === 4 && FIELD_SECTIONS.map((section) => {
              const fields = CONSIGNMENT_FIELDS.filter((f) => f.section === section && !NOT_LISTED.has(f.key))
              if (!fields.length) return null
              return (
                <SectionCard key={section} title={section}
                  hint={section === FIELD_SECTIONS[0] ? 'Hidden fields leave both order forms; Required applies to the merchant portal\'s order form.' : undefined}>
                  {fields.map((f) => (
                    <SettingRow key={f.key} label={f.defaultLabel}
                      hint={f.mandatory ? 'Always required'
                        /* 2026-10-05: Service Type always has a value — hidden, every consignment gets the form's default service */
                        : f.key === 'serviceType' ? 'Hidden = every consignment gets the default service (choose it in Customise the forms)'
                        : f.dependsOn ? `Hidden with ${CONSIGNMENT_FIELDS.find((x) => x.key === f.dependsOn)?.defaultLabel ?? f.dependsOn}` : undefined}>
                      {f.mandatory
                        ? <span className="flex h-8 items-center text-[13px] text-ink-3">Required</span>
                        : <OptionSelect options={f.key === 'serviceType' ? RULES.filter((o) => o.code !== 'required') : RULES}
                            value={f.key === 'serviceType' && ruleOf(rules, f.key) === 'required' ? 'shown' : ruleOf(rules, f.key)}
                            onChange={(v) => setRules((r) => withRule(r, f.key, v))} />}
                    </SettingRow>
                  ))}
                </SectionCard>
              )
            })}
          </>
        )}
      </div>
    </div>
  )
}
