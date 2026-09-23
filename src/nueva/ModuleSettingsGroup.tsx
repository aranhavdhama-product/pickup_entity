/**
 * Reusable page for settings areas that are ENTIRELY moduleSettings-driven
 * (Pilot Driver App, Pilot X-Dock App, Notify, Engage, Return, Service Time):
 * fetch a set of codes in one isAny query, render each as an accordion with an
 * enabled toggle + structured settingJson editor, save each row via PUT (or
 * POST when the row doesn't exist yet — absent row semantics, like staging).
 */
import { useEffect, useMemo, useState } from 'react'
import { RefreshCw, AlertCircle, Package } from 'lucide-react'
import { Accordion, Button, EmptyState, PageHeader, Toggle } from './components'
import { toast } from './toast'
import { GenericSection, FooterBar, PickupExecutionRows, type PickupExecution } from './ModuleDetail'
import { fetchModuleSettings, saveModuleSettings, parseSettingJson, type ModuleSetting } from './settingsApi'
import { usePickupModuleConfig, writePickupModuleConfig } from '../config/pickupModule'

export interface GroupModuleDef {
  code: string; title: string; desc: string; icon?: any
  /** 'pickup' = bespoke card whose rows read/write the pickup config mirror */
  kind?: 'pickup'
}

/* Code groups per staging page (mined from the SPA — FAREYE-SETTINGS-APIS.md §9/11/12) */
export const GROUP_PAGES: Record<string, { title: string; subtitle: string; modules: GroupModuleDef[] }> = {
  'pilot-driver': {
    title: 'Pilot Driver App',
    subtitle: 'Configuration for the Pilot driver application',
    modules: [
      { code: 'DRIVER_APP_CONFIG', title: 'Driver App Config', desc: 'Core driver app configuration' },
      { code: 'DRIVER_APP_BASIC_SETTING', title: 'Basic Settings', desc: 'Basic driver app behavior' },
      { code: 'DRIVER_APP_CHECKLIST_MODULE', title: 'Checklists', desc: 'Driver checklist forms' },
      { code: 'DRIVER_APP_LOADING_MODULE', title: 'Loading', desc: 'Loading workflow settings' },
      /* ours (not a staging code) — follows the group's DRIVER_APP_*_MODULE pattern */
      { code: 'DRIVER_APP_PICKUP_MODULE', title: 'Pickup Module', desc: 'Pickup execution — scan mode, proof of pickup, overage handling', kind: 'pickup' },
      { code: 'DRIVER_APP_FORM_STATE_FLOW_MODULE', title: 'State Flows', desc: 'Trip & consignment state flows' },
      { code: 'DRIVER_APP_FORM_RULES_MODULE', title: 'Form Rules', desc: 'Conditional form rules' },
      { code: 'DRIVER_APP_SERVICE_MODULE', title: 'Service', desc: 'Service workflow settings' },
      { code: 'DRIVER_APP_HANDOVER_MODULE', title: 'Handover', desc: 'Handover workflow settings' },
      { code: 'COMPLIANCE_MODULE', title: 'Compliance', desc: 'Driver compliance settings' },
    ],
  },
  'pilot-xdock': {
    title: 'Pilot X-Dock App',
    subtitle: 'Configuration for the Pilot cross-dock application',
    modules: [
      { code: 'DRIVER_APP_XDOCK_CONFIG', title: 'X-Dock Config', desc: 'Core x-dock configuration' },
      { code: 'DRIVER_APP_PRELOADING_MODULE', title: 'Preloading', desc: 'Preloading workflow settings' },
      { code: 'DRIVER_APP_FORM_RULES_MODULE', title: 'Form Rules', desc: 'Conditional form rules' },
      { code: 'DRIVER_APP_BASIC_SETTING', title: 'Basic Settings', desc: 'Basic app behavior' },
    ],
  },
  'service-time': {
    title: 'Service Time',
    subtitle: 'Service time rules applied during routing',
    modules: [
      { code: 'SERVICE_TIME_RULE_SET', title: 'Service Time Rule Set', desc: 'Rules deriving per-stop service time' },
    ],
  },
  notify: {
    title: 'Notify',
    subtitle: 'Customer notification channels, providers and rules',
    modules: [
      { code: 'NOTIFICATION_RULES', title: 'Notification Rules', desc: 'When and what to notify' },
      { code: 'SMS_ENDPOINT', title: 'SMS Provider', desc: 'SMS gateway endpoint configuration' },
      { code: 'SMS_TEMPLATE', title: 'SMS Templates', desc: 'SMS message templates' },
      { code: 'WHATSAPP_PROVIDER', title: 'WhatsApp Provider', desc: 'WhatsApp business provider' },
      { code: 'WHATSAPP_TEMPLATE', title: 'WhatsApp Templates', desc: 'WhatsApp message templates' },
      { code: 'IVR_PROVIDER', title: 'IVR Provider', desc: 'Voice-call provider' },
      { code: 'IVR_TEMPLATE', title: 'IVR Templates', desc: 'Voice-call scripts' },
    ],
  },
  engage: {
    title: 'Engage',
    subtitle: 'Customer tracking-page and interaction settings',
    modules: [
      { code: 'CUSTOMER_INTERACTION', title: 'Customer Interaction', desc: 'Tracking page interaction settings' },
      { code: 'UNIVERSAL_TRACKING_SETTINGS', title: 'Universal Tracking', desc: 'Universal tracking link settings' },
      { code: 'CI_LINK_EXPIRY', title: 'Link Expiry', desc: 'Tracking-link expiry rules' },
    ],
  },
  return: {
    title: 'Return',
    subtitle: 'Returns portal configuration',
    modules: [
      { code: 'RETURN_SETTINGS', title: 'Return Settings', desc: 'Returns portal behavior' },
    ],
  },
}

function ModuleCard({ def, row, onSaved }: {
  def: GroupModuleDef
  row: ModuleSetting | undefined
  onSaved: (m: ModuleSetting) => void
}) {
  const setting = useMemo(() => (parseSettingJson(row?.settingJson) ?? {}) as Record<string, any>, [row?.settingJson])
  const [draft, setDraft] = useState<Record<string, any>>(() => structuredClone(setting))
  const [enabled, setEnabled] = useState(row?.enabled ?? false)
  const [saving, setSaving] = useState(false)
  useEffect(() => { setDraft(structuredClone(setting)); setEnabled(row?.enabled ?? false) }, [setting, row?.enabled])

  const dirty = JSON.stringify(draft) !== JSON.stringify(setting)
  const Icon = def.icon ?? Package

  const persist = async (nextEnabled: boolean, nextDraft: Record<string, any>) => {
    setSaving(true)
    try {
      const settingJson = JSON.stringify(Object.keys(nextDraft).length ? nextDraft : { enabled: nextEnabled })
      await saveModuleSettings(
        [{ enabled: nextEnabled, code: def.code, name: row?.name ?? def.title, settingJson }],
        !!row,
      )
      onSaved({ ...(row ?? { code: def.code, name: def.title }), enabled: nextEnabled, settingJson })
      toast.success('Settings saved successfully.')
    } catch (e) {
      toast.error('Failed to save settings. Please try again later.')
      console.error(e)
      setEnabled(row?.enabled ?? false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Accordion icon={<Icon size={19} />} title={def.title}
      subtitle={row ? def.desc : `${def.desc} — not configured yet on this account`}
      right={<Toggle checked={enabled} onChange={saving ? undefined : (v) => { setEnabled(v); persist(v, draft) }} />}>
      {Object.keys(draft).length ? (
        <>
          <GenericSection obj={draft} onChange={setDraft} />
          <FooterBar dirty={dirty} saving={saving}
            onReset={() => setDraft(structuredClone(setting))}
            onSave={() => persist(enabled, draft)} />
        </>
      ) : (
        <div className="text-[13px] text-ink-3">
          No settings stored for this module yet — flipping the toggle creates its record.
        </div>
      )}
    </Accordion>
  )
}

/* Pickup Module — its rows ARE the pickup config mirror (src/config/pickupModule):
   the same scanMode / podRequirements / overagePolicy the Base Modules → Pickup
   Request page edits. Save writes the mirror first (works without staging), then
   the group's usual moduleSettings row (code DRIVER_APP_PICKUP_MODULE). */
function PickupModuleCard({ def, row, onSaved }: {
  def: GroupModuleDef
  row: ModuleSetting | undefined
  onSaved: (m: ModuleSetting) => void
}) {
  const cfg = usePickupModuleConfig()
  const current: PickupExecution = { scanMode: cfg.scanMode, podRequirements: cfg.podRequirements, overagePolicy: cfg.overagePolicy }
  const [enabled, setEnabled] = useState(row?.enabled ?? false)
  const [saving, setSaving] = useState(false)
  const Icon = def.icon ?? Package

  const persist = async (nextEnabled: boolean, next: PickupExecution) => {
    setSaving(true)
    writePickupModuleConfig(next)   // one source of truth — mirror first
    try {
      const settingJson = JSON.stringify(next)
      await saveModuleSettings(
        [{ enabled: nextEnabled, code: def.code, name: row?.name ?? def.title, settingJson }],
        !!row,
      )
      onSaved({ ...(row ?? { code: def.code, name: def.title }), enabled: nextEnabled, settingJson })
      toast.success('Settings saved successfully.')
    } catch (e) {
      toast.info('Saved locally — staging is unavailable, so the console row was not updated.')
      console.warn('DRIVER_APP_PICKUP_MODULE staging save failed; local mirror updated', e)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Accordion icon={<Icon size={19} />} title={def.title} subtitle={def.desc}
      right={<Toggle checked={enabled} onChange={saving ? undefined : (v) => { setEnabled(v); persist(v, current) }} />}>
      {/* keyed on the mirror: a save here or on the Pickup Request page resets the draft */}
      <PickupExecutionDraft key={JSON.stringify(current)} current={current} saving={saving}
        onSave={(next) => persist(enabled, next)} />
    </Accordion>
  )
}

function PickupExecutionDraft({ current, saving, onSave }: {
  current: PickupExecution
  saving: boolean
  onSave: (next: PickupExecution) => void
}) {
  const [draft, setDraft] = useState<PickupExecution>(current)
  const dirty = JSON.stringify(draft) !== JSON.stringify(current)
  return (
    <>
      <PickupExecutionRows value={draft} onChange={setDraft} />
      <FooterBar dirty={dirty} saving={saving} onReset={() => setDraft(current)} onSave={() => onSave(draft)} />
    </>
  )
}

export default function ModuleSettingsGroupPage({ title, subtitle, modules }: {
  title: string
  subtitle: string
  modules: GroupModuleDef[]
}) {
  const [rows, setRows] = useState<Map<string, ModuleSetting> | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = () => {
    setError(null)
    fetchModuleSettings(modules.map((m) => m.code))
      .then((list) => setRows(new Map(list.map((m) => [m.code, m]))))
      .catch((e) => setError(String(e)))
  }
  useEffect(load, [])

  return (
    <div className="w-full">
      <PageHeader title={title} subtitle={subtitle} />
      {rows === null && !error ? (
        <div className="bg-surface border border-line rounded-xl px-5 py-10 text-center text-[13px] text-ink-3 animate-pulse">Loading…</div>
      ) : error ? (
        <div className="bg-surface border border-line rounded-md px-5 py-8 flex flex-col items-center gap-3">
          <AlertCircle size={20} className="text-danger-fg" />
          <div className="text-[13px] text-ink-3">{error}</div>
          <Button variant="outline" icon={<RefreshCw size={14} />} onClick={load}>Retry</Button>
        </div>
      ) : modules.length === 0 ? (
        <EmptyState title="Nothing to configure here yet" />
      ) : (
        <div className="space-y-3">
          {modules.map((def) => {
            const Card = def.kind === 'pickup' ? PickupModuleCard : ModuleCard
            return (
              <Card key={def.code} def={def} row={rows!.get(def.code)}
                onSaved={(m) => setRows((r) => new Map(r!).set(def.code, m))} />
            )
          })}
        </div>
      )}
    </div>
  )
}
