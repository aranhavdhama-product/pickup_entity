/**
 * Add Branch stepper — steps 2 and 3 of the branch setup flow, rendered after
 * the branch itself is created (LiveMaster postAddFlow):
 *
 *   1 Branch Details      → the standard branch add form (LiveMaster)
 *   2 Serviceable Area    → coverage for the new branch (skippable)
 *   3 Zone Configuration  → zone assignments for that coverage (skippable)
 *
 * Both steps write staging's real endpoints; skipping just moves on — the
 * same surfaces stay reachable from the My Network tabs later.
 */
import { useEffect, useState } from 'react'
import { Button, LoadingBox, MenuSelect, PageHeader, Toggle, WizardSteps } from './components'
import { RuleBuilder } from './ServiceableAreas'
import { ZoneSetupForm } from './ZoneMaster'
import {
  fetchCountries, fetchHubsPage, saveServiceableArea,
  type MasterRecord, type ServiceableRule,
} from './settingsApi'
import { toast } from './toast'

export const BRANCH_ADD_STEPS = ['Branch Details', 'Serviceable Area', 'Zone Configuration']

export default function BranchSetupFlow({ created, done }: {
  /** the draft that was just saved (has code + name, but no server id yet) */
  created: MasterRecord
  done: () => void
}) {
  const [step, setStep] = useState(1)
  const [hub, setHub] = useState<{ id: number; name: string } | null>(null)
  // the coverage type saved in step 2 pre-selects step 3's zone level
  const [coverageLevel, setCoverageLevel] = useState<string | undefined>(undefined)

  // resolve the new branch's server id (cache-bypassing — it was just created)
  useEffect(() => {
    fetchHubsPage(200, true).then((hs) => {
      const h = hs.find((x) => String(x.code) === String(created.code))
      if (h) setHub({ id: Number(h.id), name: String(h.name) })
      else { toast.error('Could not find the new branch — finish setup from the My Network tabs.'); done() }
    }).catch(() => { toast.error('Could not load the new branch.'); done() })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div>
      <PageHeader title={`Set up ${String(created.name ?? created.code)}`}
        subtitle="Branch created — finish its coverage and zones, or skip and do it later" onBack={done} />
      <WizardSteps steps={BRANCH_ADD_STEPS} active={step} done={step > 1 ? [0, 1] : [0]} />
      {!hub ? <LoadingBox label="Loading the new branch…" /> : step === 1 ? (
        <StepServiceableArea hub={hub} onDone={(level) => { setCoverageLevel(level); setStep(2) }} />
      ) : (
        <ZoneSetupForm fixedBranch={hub} defaultLevel={coverageLevel} skippable onDone={done} />
      )}
    </div>
  )
}

/* ------------------------------------------------ step 2: coverage ---- */

function StepServiceableArea({ hub, onDone }: {
  hub: { id: number; name: string }
  /** passes the first coverage type on save (pre-selects the zone level) */
  onDone: (coverageLevel?: string) => void
}) {
  const [countries, setCountries] = useState<{ value: string; label: string }[]>([])
  const [draft, setDraft] = useState<MasterRecord>({ country: '', serviceableRule: [], enabled: true })
  const [enabled, setEnabled] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => { fetchCountries().then(setCountries).catch(() => {}) }, [])

  const save = async () => {
    const rules = (Array.isArray(draft.serviceableRule) ? draft.serviceableRule as ServiceableRule[] : [])
      .filter((r) => r.key && r.value.length > 0)
    if (!String(draft.country ?? '').trim() || rules.length === 0) {
      toast.error('Pick a country and add at least one service zone — or skip this step.')
      return
    }
    setSaving(true)
    try {
      await saveServiceableArea({
        branchId: hub.id, branchName: hub.name, enabled,
        country: draft.country, source: 'GLOBAL_GEOFENCES', serviceableRule: rules,
      }, false)
      toast.success(`Serviceable area saved for ${hub.name}.`)
      onDone(rules[0]?.key)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save serviceable area.')
      setSaving(false)
    }
  }

  return (
    <section className="rounded-xl border border-line bg-surface p-6 shadow-ds-1">
      <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
        <div className="min-w-0">
          <label className="mb-1.5 flex h-5 items-center text-[13.5px] text-ink">Branch</label>
          <div className="flex h-8 items-center rounded-md border border-warm-300 bg-warm-50 px-3 text-[13px] text-ink-2">
            {hub.name}
          </div>
        </div>
        <div className="min-w-0">
          <label className="mb-1.5 flex h-5 items-center gap-1 text-[13.5px] text-ink">Country<span className="text-brand-500">*</span></label>
          <MenuSelect value={String(draft.country ?? '')} placeholder="Select country" searchable
            options={countries.map((c) => c.value)}
            labels={(v) => countries.find((c) => c.value === v)?.label ?? v}
            onChange={(v) => setDraft((d) => ({ ...d, country: v }))} />
        </div>
      </div>
      <div className="mt-5">
        <p className="mb-2 text-[12px] font-bold text-ink-3">Service Zones</p>
        <RuleBuilder row={draft} set={(patch) => setDraft((d) => ({ ...d, ...patch }))} readOnly={false} />
      </div>
      <div className="mt-5 flex items-center justify-between gap-3 border-t border-line pt-4">
        <span className="flex items-center gap-2 text-[13px] text-ink">
          Enabled <Toggle checked={enabled} onChange={setEnabled} />
        </span>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => onDone()}>Skip</Button>
          <Button onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save & Continue'}</Button>
        </div>
      </div>
    </section>
  )
}
