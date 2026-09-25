/**
 * LOCAL app → Settings → General Settings (`/local/settings/general`).
 *
 * Staging's Base Modules → General Settings (functionality reference, captured
 * 2026-09-24): Order View · Splittable · Scannable · Task Type · Inbound —
 * labels and hints verbatim, rebuilt in our settings grammar. Persisted to the
 * localStorage mirror in `src/config/generalSettings` (staging writes these
 * keys into five moduleSettings rows; locally they are one blob).
 *
 * Stored only for now — TODO(fareye-general-settings-v1): `viewOnOrder` should
 * drive the Order/Consignment Number titles on the local grids.
 */
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, PageHeader } from '../../nueva/components'
import { toast } from '../../nueva/toast'
import {
  DEFAULT_GENERAL_SETTINGS, INBOUND_OPTIONS, TASK_TYPE_OPTIONS, useGeneralSettings, writeGeneralSettings,
  type GeneralSettings as Settings,
} from '../../config/generalSettings'
import { OptionSelect, SectionCard, SettingRow, ToggleField } from './settingsRows'

const same = (a: Settings, b: Settings) => JSON.stringify(a) === JSON.stringify(b)

export default function GeneralSettings() {
  const navigate = useNavigate()
  const stored = useGeneralSettings()
  const [draft, setDraft] = useState<Settings>(stored)
  const set = (p: Partial<Settings>) => setDraft((d) => ({ ...d, ...p }))
  const dirty = !same(draft, stored)

  return (
    <div className="p-6 pb-10">
      <PageHeader
        title="General Settings"
        subtitle="Manage account wide defaults for order visibility, order splitting and task types."
        onBack={() => navigate('/local/settings')}
        right={(
          <div className="flex items-center gap-2">
            <Button variant="ghost" disabled={same(draft, DEFAULT_GENERAL_SETTINGS)}
              onClick={() => { setDraft(DEFAULT_GENERAL_SETTINGS); toast.info('Defaults restored — Save to apply') }}>
              Restore defaults
            </Button>
            <Button variant="outline" onClick={() => setDraft(stored)} disabled={!dirty}>Reset</Button>
            <Button disabled={!dirty} onClick={() => { writeGeneralSettings(draft); toast.success('Settings saved successfully') }}>
              Save Settings
            </Button>
          </div>
        )}
      />
      <div className="grid max-w-4xl gap-4">
        <SectionCard title="Order visibility and planning">
          <SettingRow label="Order View" hint="Enable to display Order Number instead of Consignment Number across the UI.">
            <ToggleField checked={draft.viewOnOrder} onChange={(v) => set({ viewOnOrder: v })} />
          </SettingRow>
          <SettingRow label="Splittable" hint="Allow orders to be split into multiple sub-orders during planning.">
            <ToggleField checked={draft.splittable} onChange={(v) => set({ splittable: v })} />
          </SettingRow>
          <SettingRow label="Scannable" hint="Allow orders to be scanned at the time of planning.">
            <ToggleField checked={draft.scannable} onChange={(v) => set({ scannable: v })} />
          </SettingRow>
        </SectionCard>
        <SectionCard title="Task type and inbound">
          <SettingRow label="Task Type" hint="Allow orders to be Pickup / Delivery only or Pickup & Delivery.">
            <OptionSelect options={TASK_TYPE_OPTIONS} value={draft.taskType} onChange={(v) => set({ taskType: v })} />
          </SettingRow>
          <SettingRow label="Inbound" hint="Select the stage where inbound is required.">
            <OptionSelect options={INBOUND_OPTIONS} value={draft.inbound} onChange={(v) => set({ inbound: v })} />
          </SettingRow>
        </SectionCard>
      </div>
    </div>
  )
}
