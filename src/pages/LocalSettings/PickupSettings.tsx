/**
 * LOCAL app → Settings → Pickup Request (`/local/settings/pickup`).
 *
 * Edits every field of `PickupModuleConfig` and writes the localStorage mirror
 * (`src/config/pickupModule`) that the local Pickup / Pending for Planning pages
 * read. The console's Base Modules → Pickup Request page
 * (`nueva/ModuleDetail.tsx`) edits the SAME mirror, so labels, hints and option
 * wording are copied from it — both surfaces speak one vocabulary.
 *
 * ModuleDetail itself is NOT imported: it pulls settingsApi → the staging proxy, and
 * nothing in the local app may reach the staging proxy or the auth module.
 */
import { useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Input, MenuSelect, PageHeader, Toggle } from '../../nueva/components'
import { toast } from '../../nueva/toast'
import {
  DEFAULT_PICKUP_MODULE_CONFIG, normalizePickupModuleConfig, usePickupModuleConfig, writePickupModuleConfig,
  type PickupModuleConfig, type PodLevel,
} from '../../config/pickupModule'

/* option lists — wording mirrors ModuleDetail's Pickup Request section */
type Opt = { name: string; code: string }
const SCAN_MODE_OPTIONS: Opt[] = [{ name: 'Driver', code: 'driver' }, { name: 'Hub', code: 'hub' }, { name: 'Both', code: 'both' }]
const OVERAGE_OPTIONS: Opt[] = [{ name: 'Hold', code: 'hold' }, { name: 'Auto-create', code: 'auto-create' }, { name: 'Reject', code: 'reject' }]
const POD_OPTIONS: Opt[] = [{ name: 'Required', code: 'required' }, { name: 'Optional', code: 'optional' }, { name: 'Off', code: 'off' }]
const STAGE_OPTIONS: Opt[] = [{ name: 'Requested', code: 'Requested' }, { name: 'Planned', code: 'Planned' }, { name: 'Assigned', code: 'Assigned' }]
const MULTI_PR_OPTIONS: Opt[] = [
  { name: 'One open per location', code: 'ONE_OPEN_PER_LOCATION' },
  { name: 'One per slot', code: 'ONE_PER_SLOT' },
  { name: 'Unlimited', code: 'UNLIMITED' },
]
const INHERIT = '__inherit__'
const SLOT_RE = /^([01]\d|2[0-3]):[0-5]\d-([01]\d|2[0-3]):[0-5]\d$/

const labelOf = (opts: Opt[]) => (v: string) => opts.find((o) => o.code === v)?.name ?? v
const codes = (opts: Opt[]) => opts.map((o) => o.code)

/* ---------- draft: the config with numbers / slots kept as editable text ---------- */

interface MerchantRuleDraft { code: string; sameDayCutoff: string; slots: string; multiPrPolicy: string; maxAttempts: string }
type Draft = Omit<PickupModuleConfig, 'maxAttempts' | 'rescheduleWindowDays' | 'bookingLeadTimeMins' | 'slotDefinitions' | 'merchantOverrides'> & {
  maxAttempts: string
  rescheduleWindowDays: string
  bookingLeadTimeMins: string
  slotDefinitions: string
  merchantRules: MerchantRuleDraft[]
}

const slotsText = (v: string[] | undefined) => (v ?? []).join(', ')
const slotsFrom = (text: string) => text.split(',').map((x) => x.trim()).filter(Boolean)
const badSlots = (text: string) => slotsFrom(text).filter((x) => !SLOT_RE.test(x))

function toDraft(c: PickupModuleConfig): Draft {
  const { merchantOverrides, ...rest } = c
  return {
    ...rest,
    podRequirements: { ...c.podRequirements },
    maxAttempts: String(c.maxAttempts),
    rescheduleWindowDays: String(c.rescheduleWindowDays),
    bookingLeadTimeMins: String(c.bookingLeadTimeMins),
    slotDefinitions: slotsText(c.slotDefinitions),
    merchantRules: Object.entries(merchantOverrides).map(([code, o]) => ({
      code,
      sameDayCutoff: o.sameDayCutoff ?? '',
      slots: slotsText(o.slotDefinitions),
      multiPrPolicy: o.multiPrPolicy ?? '',
      maxAttempts: o.maxAttempts === undefined ? '' : String(o.maxAttempts),
    })),
  }
}

/** draft → validated config (blank / invalid values fall back via normalize) */
function fromDraft(d: Draft): PickupModuleConfig {
  const { merchantRules, ...rest } = d
  const merchantOverrides: Record<string, Record<string, unknown>> = {}
  for (const r of merchantRules) {
    const code = r.code.trim()
    if (!code) continue
    merchantOverrides[code] = {
      sameDayCutoff: r.sameDayCutoff || undefined,
      slotDefinitions: r.slots.trim() ? slotsFrom(r.slots) : undefined,
      multiPrPolicy: r.multiPrPolicy || undefined,
      maxAttempts: r.maxAttempts === '' ? undefined : r.maxAttempts,
    }
  }
  return normalizePickupModuleConfig({ ...rest, slotDefinitions: slotsFrom(d.slotDefinitions), merchantOverrides })
}

/* ---------- layout pieces ---------- */

function SectionCard({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="bg-surface border border-line rounded-xl shadow-ds-1 px-5 py-4">
      <div className="text-[15px] font-bold text-ink">{title}</div>
      {hint && <p className="mt-0.5 text-[13px] text-ink-3">{hint}</p>}
      {/* owner (2026-09-23): one setting per line — label left, control right */}
      <div className="mt-3 divide-y divide-line">{children}</div>
    </section>
  )
}

function LabeledField({ label, hint, wide, children }: { label: string; hint?: string; wide?: boolean; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-6 py-2.5" title={hint}>
      <div className="min-w-0 text-[13.5px] text-ink">{label}</div>
      <div className={`shrink-0 ${wide ? 'w-[420px]' : 'w-56'}`}>{children}</div>
    </div>
  )
}

function ToggleField({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex h-8 items-center gap-2.5">
      <Toggle checked={checked} onChange={onChange} />
      <span className="text-[13px] text-ink-2">{checked ? 'On' : 'Off'}</span>
    </div>
  )
}

function OptionSelect({ value, options, onChange }: { value: string; options: Opt[]; onChange: (v: string) => void }) {
  return <MenuSelect value={value} options={codes(options)} labels={labelOf(options)} onChange={onChange} />
}

/* ---------- page ---------- */

export default function PickupSettings() {
  const navigate = useNavigate()
  const stored = usePickupModuleConfig()
  const [draft, setDraft] = useState<Draft>(() => toDraft(stored))

  const next = useMemo(() => fromDraft(draft), [draft])
  const dirty = JSON.stringify(next) !== JSON.stringify(stored) || JSON.stringify(draft) !== JSON.stringify(toDraft(stored))
  const isDefault = JSON.stringify(next) === JSON.stringify(normalizePickupModuleConfig(DEFAULT_PICKUP_MODULE_CONFIG))

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }))
  const setPod = (p: Partial<PickupModuleConfig['podRequirements']>) =>
    setDraft((d) => ({ ...d, podRequirements: { ...d.podRequirements, ...p } }))
  const rules = draft.merchantRules
  const setRule = (i: number, p: Partial<MerchantRuleDraft>) =>
    set('merchantRules', rules.map((r, ri) => (ri === i ? { ...r, ...p } : r)))

  const globalBadSlots = badSlots(draft.slotDefinitions)

  const save = () => {
    writePickupModuleConfig(next)
    setDraft(toDraft(next))
    toast.success('Pickup Request settings saved')
  }
  const reset = () => setDraft(toDraft(stored))
  const restoreDefaults = () => {
    setDraft(toDraft(normalizePickupModuleConfig(DEFAULT_PICKUP_MODULE_CONFIG)))
    toast.info('Defaults restored — Save to apply')
  }

  return (
    <div className="p-6 pb-10">
      <PageHeader
        title="Pickup Request"
        subtitle="Module settings for pickup booking, execution and merchant rules"
        onBack={() => navigate('/local/settings')}
        right={(
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={restoreDefaults} disabled={isDefault}>Restore defaults</Button>
            <Button variant="outline" onClick={reset} disabled={!dirty}>Reset</Button>
            <Button onClick={save} disabled={!dirty}>Save Settings</Button>
          </div>
        )}
      />
      <p className="mb-4 text-[13px] text-ink-3">
        The console's Base Modules → Pickup Request page edits these same settings.
      </p>

      <div className="space-y-4">
        <SectionCard title="Module" hint="Whether pickups run, and how requests are raised.">
          <LabeledField label="Pickup module enabled" hint="Same switch as the Pickup Request card on Base Modules.">
            <ToggleField checked={draft.enabled} onChange={(v) => set('enabled', v)} />
          </LabeledField>
        </SectionCard>

        <SectionCard title="Booking & slots" hint="When merchants can book, and the windows they are offered.">
          {/* no `cutoffTime` row — Same-day cutoff is the rule; the key stays for compatibility */}
          <LabeledField label="Same-day cutoff" hint="Book before this for a same-day pickup; later bookings start next business day.">
            <Input type="time" value={draft.sameDayCutoff} onChange={(v) => set('sameDayCutoff', v)} />
          </LabeledField>
          <LabeledField label="Booking lead time (minutes)" hint="Minimum gap between booking and the pickup window start.">
            <Input type="number" value={draft.bookingLeadTimeMins} onChange={(v) => set('bookingLeadTimeMins', v)} />
          </LabeledField>
          <LabeledField label="Reschedule window (days)" hint="How far ahead a pickup can be rescheduled.">
            <Input type="number" value={draft.rescheduleWindowDays} onChange={(v) => set('rescheduleWindowDays', v)} />
          </LabeledField>
          <LabeledField label="Pickup slots" wide
            hint={globalBadSlots.length
              ? `Not HH:mm-HH:mm, will be dropped: ${globalBadSlots.join(', ')}`
              : 'Comma-separated windows, HH:mm-HH:mm.'}>
            <Input value={draft.slotDefinitions} placeholder={slotsText(DEFAULT_PICKUP_MODULE_CONFIG.slotDefinitions)}
              onChange={(v) => set('slotDefinitions', v)} />
          </LabeledField>
        </SectionCard>

        <SectionCard title="Execution & proof of pickup" hint="What the driver and hub capture when parcels are collected.">
          <LabeledField label="Handover scan mode" hint="Who scans a picked-up consignment into the hub.">
            <OptionSelect value={draft.scanMode} options={SCAN_MODE_OPTIONS}
              onChange={(v) => set('scanMode', v as PickupModuleConfig['scanMode'])} />
          </LabeledField>
          <LabeledField label="Overage policy" hint="What happens to scanned parcels that are not on the request.">
            <OptionSelect value={draft.overagePolicy} options={OVERAGE_OPTIONS}
              onChange={(v) => set('overagePolicy', v as PickupModuleConfig['overagePolicy'])} />
          </LabeledField>
          <LabeledField label="Proof of pickup — signature" hint="Shipper signature captured by the driver.">
            <OptionSelect value={draft.podRequirements.signature} options={POD_OPTIONS}
              onChange={(v) => setPod({ signature: v as PodLevel })} />
          </LabeledField>
          <LabeledField label="Proof of pickup — photo" hint="Photo of the collected parcels.">
            <OptionSelect value={draft.podRequirements.photo} options={POD_OPTIONS}
              onChange={(v) => setPod({ photo: v as PodLevel })} />
          </LabeledField>
          <LabeledField label="Proof of pickup — OTP" hint="Shipper confirms the pickup with a one-time code.">
            <ToggleField checked={draft.podRequirements.otp} onChange={(v) => setPod({ otp: v })} />
          </LabeledField>
        </SectionCard>

        <SectionCard title="Attempts & changes" hint="Retries, and how long a request stays open to edits.">
          <LabeledField label="Max attempts" hint="Pickup attempts before a failed request closes (1–5).">
            <Input type="number" value={draft.maxAttempts} onChange={(v) => set('maxAttempts', v)} />
          </LabeledField>
          <LabeledField label="Auto-reschedule on failure" hint="Re-raise a failed pickup for the next business day while attempts remain.">
            <ToggleField checked={draft.autoRescheduleOnFail} onChange={(v) => set('autoRescheduleOnFail', v)} />
          </LabeledField>
          <LabeledField label="Allow add-to-existing until" hint="Last status at which consignments can join an existing request.">
            <OptionSelect value={draft.allowAddToExistingUntil} options={STAGE_OPTIONS}
              onChange={(v) => set('allowAddToExistingUntil', v as PickupModuleConfig['allowAddToExistingUntil'])} />
          </LabeledField>
          <LabeledField label="Merchant can cancel until" hint="Last status at which a merchant may cancel a request.">
            <OptionSelect value={draft.merchantCancelUntil} options={STAGE_OPTIONS}
              onChange={(v) => set('merchantCancelUntil', v as PickupModuleConfig['merchantCancelUntil'])} />
          </LabeledField>
        </SectionCard>

        <section className="bg-surface border border-line rounded-xl shadow-ds-1 px-5 py-4">
          <div className="text-[15px] font-bold text-ink">Merchant rules</div>
          <p className="mt-0.5 text-[13px] text-ink-3">
            Per-merchant overrides. A blank field inherits the global value; slots are comma-separated <span className="font-mono">HH:mm-HH:mm</span>.
          </p>
          {rules.length > 0 && (
            <div className="mt-4 space-y-3">
              {rules.map((r, i) => {
                const bad = badSlots(r.slots)
                return (
                  <div key={i} className="rounded-md border border-line px-4 py-3">
                    <div className="grid grid-cols-1 gap-x-5 gap-y-3 sm:grid-cols-2 xl:grid-cols-4">
                      <LabeledField label="Merchant code">
                        <Input value={r.code} placeholder="e.g. 2GO_PH" onChange={(v) => setRule(i, { code: v })} />
                      </LabeledField>
                      <LabeledField label="Same-day cutoff">
                        <Input type="time" value={r.sameDayCutoff} onChange={(v) => setRule(i, { sameDayCutoff: v })} />
                      </LabeledField>
                      <LabeledField label="Multiple pickup requests">
                        <MenuSelect value={r.multiPrPolicy || INHERIT} options={[INHERIT, ...codes(MULTI_PR_OPTIONS)]}
                          labels={(v) => (v === INHERIT ? `Inherit (${labelOf(MULTI_PR_OPTIONS)(draft.multiPrPolicy)})` : labelOf(MULTI_PR_OPTIONS)(v))}
                          onChange={(v) => setRule(i, { multiPrPolicy: v === INHERIT ? '' : v })} />
                      </LabeledField>
                      <LabeledField label="Max attempts">
                        <Input type="number" value={r.maxAttempts} placeholder={draft.maxAttempts}
                          onChange={(v) => setRule(i, { maxAttempts: v })} />
                      </LabeledField>
                      <LabeledField label="Pickup slots" wide hint={bad.length ? `Not HH:mm-HH:mm, will be dropped: ${bad.join(', ')}` : undefined}>
                        <Input value={r.slots} placeholder={draft.slotDefinitions} onChange={(v) => setRule(i, { slots: v })} />
                      </LabeledField>
                      <div className="flex items-end sm:col-span-2 sm:justify-end">
                        <Button size="sm" variant="ghost"
                          onClick={() => set('merchantRules', rules.filter((_, ri) => ri !== i))}>Remove</Button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
          <div className="mt-3">
            <Button size="sm" variant="outline"
              onClick={() => set('merchantRules', [...rules, { code: '', sameDayCutoff: '', slots: '', multiPrPolicy: '', maxAttempts: '' }])}>
              + Add merchant rule
            </Button>
          </div>
        </section>
      </div>
    </div>
  )
}
