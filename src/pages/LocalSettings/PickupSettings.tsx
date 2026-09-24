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
import { Hand, Zap } from 'lucide-react'
import { Button, Input, MenuSelect, PageHeader, Toggle } from '../../nueva/components'
import { autoPickupSummary, autoPickupWindow, windowLabel } from '../../growOrders/pickupSlots'
import { toast } from '../../nueva/toast'
import {
  DEFAULT_PICKUP_MODULE_CONFIG, normalizePickupModuleConfig, usePickupModuleConfig, writePickupModuleConfig,
  type AutoPickupConfig, type PickupMode, type PickupModuleConfig, type PodLevel,
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
const DATE_RULE_OPTIONS: Opt[] = [
  { name: 'Same day (before the cutoff), else next pickup day', code: 'same-day' },
  { name: 'Next pickup day', code: 'next-business-day' },
  { name: 'N days after the consignment is created', code: 'days-after-order' },
]
const DAY_CHIPS: { code: number; name: string }[] = [
  { code: 1, name: 'Mon' }, { code: 2, name: 'Tue' }, { code: 3, name: 'Wed' }, { code: 4, name: 'Thu' },
  { code: 5, name: 'Fri' }, { code: 6, name: 'Sat' }, { code: 0, name: 'Sun' },
]
const INHERIT = '__inherit__'
const SLOT_RE = /^([01]\d|2[0-3]):[0-5]\d-([01]\d|2[0-3]):[0-5]\d$/

const labelOf = (opts: Opt[]) => (v: string) => opts.find((o) => o.code === v)?.name ?? v
const codes = (opts: Opt[]) => opts.map((o) => o.code)

/* ---------- draft: the config with numbers / slots kept as editable text ---------- */

interface MerchantRuleDraft { code: string; sameDayCutoff: string; slots: string; multiPrPolicy: string; maxAttempts: string }
type Draft = Omit<PickupModuleConfig, 'maxAttempts' | 'rescheduleWindowDays' | 'bookingLeadTimeMins' | 'slotDefinitions' | 'merchantOverrides' | 'autoPickup'> & {
  autoPickup: Omit<AutoPickupConfig, 'daysAfterOrder'> & { daysAfterOrder: string }
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
    autoPickup: { ...c.autoPickup, daysAfterOrder: String(c.autoPickup.daysAfterOrder) },
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

/** The two ways requests are raised — one selected card (owner, 2026-09-24). */
function ModeCards({ value, onChange, disabled }: { value: PickupMode; onChange: (m: PickupMode) => void; disabled?: boolean }) {
  const cards: { code: PickupMode; icon: ReactNode; title: string; desc: string }[] = [
    { code: 'auto', icon: <Zap size={18} />, title: 'Auto pickup request',
      desc: 'A request is raised the moment a consignment is created, on the pickup date this page computes.' },
    { code: 'manual', icon: <Hand size={18} />, title: 'Create pickup request manually',
      desc: 'Merchants and ops book pickups themselves — Schedule Pickup, Book Pickup and Create Pickup stay on the pages.' },
  ]
  return (
    <div className={`grid grid-cols-1 gap-3 sm:grid-cols-2 ${disabled ? 'pointer-events-none opacity-50' : ''}`} role="radiogroup" aria-label="Pickup request mode">
      {cards.map((c) => {
        const on = c.code === value
        return (
          <button key={c.code} type="button" role="radio" aria-checked={on} onClick={() => onChange(c.code)}
            className={`flex items-start gap-3 rounded-xl border px-4 py-3.5 text-left transition-colors ${
              on ? 'border-brand-500 bg-brand-50 shadow-ds-1' : 'border-line bg-surface hover:border-warm-300'}`}>
            <span className={`mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${on ? 'bg-brand-500 text-white' : 'bg-warm-100 text-ink-2'}`}>{c.icon}</span>
            <span className="min-w-0">
              <span className="flex items-center gap-2 text-[14px] font-bold text-ink">
                {c.title}
                <span className={`inline-block h-3.5 w-3.5 rounded-full border-[4px] ${on ? 'border-brand-500' : 'border-warm-300'}`} aria-hidden />
              </span>
              <span className="mt-0.5 block text-[12.5px] text-ink-3">{c.desc}</span>
            </span>
          </button>
        )
      })}
    </div>
  )
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
  const setAuto = (p: Partial<Draft['autoPickup']>) =>
    setDraft((d) => ({ ...d, autoPickup: { ...d.autoPickup, ...p } }))
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
          <div className="py-3">
            <div className="mb-2 text-[13.5px] text-ink">Pickup request mode</div>
            <ModeCards value={draft.mode} disabled={!draft.enabled} onChange={(m) => set('mode', m)} />
          </div>
        </SectionCard>

        {draft.mode === 'auto' ? (
          <SectionCard title="Auto pickup — pickup dates" hint="How the raised request picks its date and window. Slots and the same-day cutoff come from the manual card's values.">
            <LabeledField label="Pickup date rule" wide hint="Which day the collection is booked for, counted from the moment the consignment is created.">
              <OptionSelect value={draft.autoPickup.dateRule} options={DATE_RULE_OPTIONS}
                onChange={(v) => setAuto({ dateRule: v as AutoPickupConfig['dateRule'] })} />
            </LabeledField>
            {draft.autoPickup.dateRule === 'days-after-order' && (
              <LabeledField label="Days after creation" hint="0 = the same day, 1 = the next day (0–14); rolls forward onto a pickup day.">
                <Input type="number" value={draft.autoPickup.daysAfterOrder} onChange={(v) => setAuto({ daysAfterOrder: v })} />
              </LabeledField>
            )}
            {draft.autoPickup.dateRule === 'same-day' && (
              <LabeledField label="Same-day cutoff" hint="A consignment created before this is collected the same day; after it, the next pickup day.">
                <Input type="time" value={draft.sameDayCutoff} onChange={(v) => set('sameDayCutoff', v)} />
              </LabeledField>
            )}
            <LabeledField label="Pickup window" hint="One of the configured pickup slots; the first slot when none is chosen.">
              <MenuSelect value={draft.autoPickup.slot || '__first__'} options={['__first__', ...slotsFrom(draft.slotDefinitions)]}
                labels={(v) => (v === '__first__' ? `First slot (${slotsFrom(draft.slotDefinitions)[0] ?? '—'})` : v)}
                onChange={(v) => setAuto({ slot: v === '__first__' ? '' : v })} />
            </LabeledField>
            <LabeledField label="Pickup days" wide hint="Requests are only raised for these days; other days roll forward.">
              <div className="flex flex-wrap justify-end gap-1.5">
                {DAY_CHIPS.map((d) => {
                  const on = draft.autoPickup.pickupDays.includes(d.code)
                  return (
                    <button key={d.code} type="button" aria-pressed={on}
                      onClick={() => setAuto({ pickupDays: on ? draft.autoPickup.pickupDays.filter((x) => x !== d.code) : [...draft.autoPickup.pickupDays, d.code].sort() })}
                      className={`rounded-full border px-3 py-1 text-[12.5px] ${on ? 'border-brand-500 bg-brand-50 font-bold text-brand-500' : 'border-line bg-surface text-ink-2 hover:border-warm-300'}`}>
                      {d.name}
                    </button>
                  )
                })}
              </div>
            </LabeledField>
            <LabeledField label="Booking lead time (minutes)" hint="A same-day window that starts sooner than this moves to the next slot or day.">
              <Input type="number" value={draft.bookingLeadTimeMins} onChange={(v) => set('bookingLeadTimeMins', v)} />
            </LabeledField>
            <div className="py-3 text-[13px] text-ink-2">
              <span className="font-bold text-ink">Preview:</span> a consignment created now would be collected{' '}
              <span className="font-bold text-ink">{windowLabel(autoPickupWindow(new Date(), next, next.autoPickup))}</span>
              <span className="text-ink-3"> · {autoPickupSummary(next)}</span>
            </div>
          </SectionCard>
        ) : (
          <SectionCard title="Manual booking & slots" hint="When merchants and ops can book, and the windows they are offered.">
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
            <LabeledField label="Multiple pickup requests" hint="What happens when a merchant books again at the same location.">
              <OptionSelect value={draft.multiPrPolicy} options={MULTI_PR_OPTIONS}
                onChange={(v) => set('multiPrPolicy', v as PickupModuleConfig['multiPrPolicy'])} />
            </LabeledField>
            <LabeledField label="Pickup slots" wide
              hint={globalBadSlots.length
                ? `Not HH:mm-HH:mm, will be dropped: ${globalBadSlots.join(', ')}`
                : 'Comma-separated windows, HH:mm-HH:mm.'}>
              <Input value={draft.slotDefinitions} placeholder={slotsText(DEFAULT_PICKUP_MODULE_CONFIG.slotDefinitions)}
                onChange={(v) => set('slotDefinitions', v)} />
            </LabeledField>
          </SectionCard>
        )}

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
