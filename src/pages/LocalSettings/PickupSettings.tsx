/**
 * LOCAL app → Settings → Pickup module (`/local/settings/pickup`).
 *
 * Owner (2026-10-07, "simplify the settings — pickup manifest required, automatic pickup request creation based on
 * status … all the flows in pickup, end to end, in a simplified form"): the page follows the pickup's own life, in
 * four numbered cards that match the four steps of the strip at the top —
 *
 *   1 Create    — who creates a request: Manual | Automatic (+ "when the consignment is" Created · Label Generated ·
 *                 Ready To Ship, + does the shipper choose the time; Manual: may a pickup be booked before its
 *                 consignments exist). The exact FarEye event stays one line away under More options.
 *   2 Book      — Book up to N days ahead · Same-day cut-off (+ Pickup days, Holiday master under More).
 *   3 Pick up   — Pickup manifest required (OFF = a completed pickup closes at once) · who scans · proof of pickup
 *                 (signature; photo, one-time code and parcels not on the request under More).
 *   4 If it goes wrong — try again automatically · the Reason Policy (+ until when merchants may change or cancel,
 *                 until when consignments may be added, under More).
 *
 * The strip above the cards is the live summary: each step's caption is built from the settings AS THEY STAND on the
 * page. Switch in the header (off = the strip and nothing else). Sticky footer: Cancel (revert) · Save. Every stored
 * key keeps its meaning (`src/config/pickupModule`); keys not on this page (the auto date rule, slots, merchant
 * overrides …) keep their value and stay editable on the console's Base Modules → Pickup Request twin.
 *
 * ModuleDetail itself is NOT imported: it pulls settingsApi → the staging proxy, and nothing in the local app may
 * reach the staging proxy or the auth module.
 */
import { useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { CalendarClock, ChevronRight, ExternalLink, Play, Workflow } from 'lucide-react'
import { Button, Input, MenuSelect, PageHeader, Toggle } from '../../nueva/components'
import { toast } from '../../nueva/toast'
import {
  AUTO_AFTER_STATES, DEFAULT_PICKUP_MODULE_CONFIG, PICKUP_DAYS_SOURCES, usePickupModuleConfig, writePickupModuleConfig,
  type AutoPickupAfterState, type PickupDaysSource, type PickupMode, type PickupModuleConfig, type PodLevel,
} from '../../config/pickupModule'
import { AUTO_PICKUP_TRIGGER_CODES, EVENT_AFTER_STATE, LEGACY_AFTER_STATE_EVENT } from '../../growOrders/fareyeEvents'
import { MoreOptions } from './settingsRows'
import { useSchedules } from '../../growOrders/scheduleModel'
import { DAYS_SOURCE_HINT, askWindowHint, triggerHint, triggerOptionLabel } from './pickupSummary'

/* ---------- layout pieces (ONE row grammar on the whole page) ---------- */

/** A numbered step card: a number tile beside a 15px bold title and its 12px caption, a divider, then the rows. */
function Card({ n, title, caption, icon, action, children }: {
  n: number; title: string; caption?: string; icon: ReactNode; action?: ReactNode; children?: ReactNode
}) {
  return (
    <section className="rounded-xl border border-line bg-surface px-5 shadow-ds-1" aria-label={`Step ${n}: ${title}`}>
      <div className="flex items-center gap-3 py-4">
        <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-warm-100 text-brand-500">{icon}</span>
        <div className="min-w-0 flex-1">
          <div className="text-[15px] font-bold leading-tight text-ink"><span className="mr-1.5 text-ink-3">{n}</span>{title}</div>
          {caption && <p className="mt-0.5 text-[12px] text-ink-3">{caption}</p>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {children && <div className="divide-y divide-line border-t border-line">{children}</div>}
    </section>
  )
}

/** A quiet heading between groups of rows in the Advanced fold. */
function GroupLabel({ children }: { children: ReactNode }) {
  return <div className="pb-1 pt-4 text-[11px] font-bold uppercase tracking-wide text-ink-3">{children}</div>
}

/** One setting: label (13px bold) + one hint line (12px ink-3) left; the control right in a fixed 260px column. */
function Row({ label, hint, children }: { label: string; hint: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-6 py-4">
      <div className="min-w-0">
        <div className="text-[13px] font-bold text-ink">{label}</div>
        <p className="mt-0.5 text-[12px] text-ink-3">{hint}</p>
      </div>
      <div className="flex w-[260px] shrink-0 justify-end">{children}</div>
    </div>
  )
}

/** A switch with its state in words beside it. */
function ToggleField({ checked, onChange, label, on = 'On', off = 'Off' }: {
  checked: boolean; onChange: (v: boolean) => void; label: string; on?: string; off?: string
}) {
  return (
    <div className="flex h-8 items-center gap-2.5" role="group" aria-label={label}>
      <span className="text-[13px] text-ink-2">{checked ? on : off}</span>
      <Toggle checked={checked} onChange={onChange} />
    </div>
  )
}

/** A two- or three-way choice at input height — the chosen one border-ink + warm-50 (the form builder's segmented control). */
function Seg<T extends string>({ value, options, onChange, label }: {
  value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex h-8 shrink-0 gap-0.5 rounded-md border border-line bg-surface p-0.5">
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={value === o.value} onClick={() => onChange(o.value)}
          className={`inline-flex h-full items-center whitespace-nowrap rounded border px-3 text-[12px] transition-colors
            ${value === o.value ? 'border-ink bg-warm-50 font-bold text-ink' : 'border-transparent text-ink-2 hover:bg-warm-50 hover:text-ink'}`}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

/** The pickup's life in four steps — each caption is built from the settings as they stand on the page. */
function FlowStrip({ steps }: { steps: { title: string; caption: string }[] }) {
  return (
    <section className="rounded-xl border border-line bg-surface px-5 py-4 shadow-ds-1" aria-label="How a pickup flows">
      <ol className="grid grid-cols-1 gap-3 sm:grid-cols-4 sm:gap-0">
        {steps.map((s, i) => (
          <li key={s.title} className="flex min-w-0 items-start gap-3 sm:pr-3">
            <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ink text-[12px] font-bold text-white">{i + 1}</span>
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-bold text-ink">{s.title}</span>
              <span className="mt-0.5 block text-[12px] leading-snug text-ink-3">{s.caption}</span>
            </span>
            {i < steps.length - 1 && <ChevronRight size={16} className="mt-1 hidden shrink-0 text-warm-300 sm:block" aria-hidden />}
          </li>
        ))}
      </ol>
    </section>
  )
}

/* ---------- choices, in plain words ---------- */

const DAYS_SOURCE_LABEL: Record<PickupDaysSource, string> = {
  'merchant-then-hub': 'Pickup address and hub',
  hub: 'Hub only',
}
const STATE_HINT: Record<AutoPickupAfterState, string> = {
  Created: 'As soon as the consignment exists (not a draft, not cancelled).',
  'Label Generated': 'Once the consignment is paid and its label is generated.',
  'Ready To Ship': 'Once it is paid, has no errors and is marked Ready To Ship.',
}
const SCAN_LABEL: Record<PickupModuleConfig['scanMode'], string> = {
  driver: 'The driver, at pickup', hub: 'The hub, on arrival', both: 'Both — they must match',
}
const POD_LABEL: Record<PodLevel, string> = { required: 'Required', optional: 'Optional', off: 'Off' }
const OVERAGE_LABEL: Record<PickupModuleConfig['overagePolicy'], string> = { hold: 'Hold for review', 'auto-create': 'Create an order', reject: 'Reject' }
const STAGE_LABEL: Record<PickupModuleConfig['merchantCancelUntil'], string> = { Requested: 'It is requested', Planned: 'It is planned', Assigned: 'A driver is assigned' }
const STAGES = ['Requested', 'Planned', 'Assigned'] as const

/* ---------- page ---------- */

interface Draft {
  enabled: boolean; mode: PickupMode; triggerEvent: string; slotConfirmation: boolean; blindAllowed: boolean
  userSelectsWindow: boolean
  /** kept as typed (a string) so clearing the field does not snap back; clamped 1–30 on save */
  bookingHorizonDays: string
  sameDayCutoff: string
  pickupDaysSource: PickupDaysSource
  manifestRequired: boolean
  signature: PodLevel; photo: PodLevel; otp: boolean; overagePolicy: PickupModuleConfig['overagePolicy']
  autoRescheduleOnFail: boolean
  merchantCancelUntil: PickupModuleConfig['merchantCancelUntil']; allowAddToExistingUntil: PickupModuleConfig['allowAddToExistingUntil']
}
const draftOf = (c: PickupModuleConfig): Draft => ({
  enabled: c.enabled, mode: c.mode, triggerEvent: c.autoPickup.triggerEvent, slotConfirmation: c.autoPickup.slotConfirmation,
  blindAllowed: c.manualPickup.blindAllowed, userSelectsWindow: c.autoPickup.userSelectsWindow,
  bookingHorizonDays: String(c.bookingHorizonDays), sameDayCutoff: c.sameDayCutoff, pickupDaysSource: c.pickupDaysSource,
  manifestRequired: c.manifestRequired,
  signature: c.podRequirements.signature, photo: c.podRequirements.photo, otp: c.podRequirements.otp, overagePolicy: c.overagePolicy,
  autoRescheduleOnFail: c.autoRescheduleOnFail,
  merchantCancelUntil: c.merchantCancelUntil, allowAddToExistingUntil: c.allowAddToExistingUntil,
})
const horizonOf = (v: string, fallback: number) => {
  const n = Number(v)
  return v.trim() !== '' && Number.isFinite(n) ? Math.min(30, Math.max(1, Math.round(n))) : fallback
}
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/
/** the values a Draft would save, for dirty / default comparisons */
const savedOf = (d: Draft, base: PickupModuleConfig) => ({
  ...d, bookingHorizonDays: horizonOf(d.bookingHorizonDays, base.bookingHorizonDays),
  sameDayCutoff: HHMM.test(d.sameDayCutoff) ? d.sameDayCutoff : base.sameDayCutoff,
})
const sameDraft = (d: Draft, c: PickupModuleConfig) => {
  const a = savedOf(d, c), b = savedOf(draftOf(c), c)
  return (Object.keys(a) as (keyof Draft)[]).every((k) => a[k] === b[k])
}
/** the consignment state an event stands for (an event that is not one of the three reads as Ready To Ship) */
const stateOfEvent = (e: string): AutoPickupAfterState => EVENT_AFTER_STATE[e] ?? 'Ready To Ship'
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`

export default function PickupSettings() {
  const navigate = useNavigate()
  const stored = usePickupModuleConfig()
  const schedules = useSchedules().schedules
  const [draft, setDraft] = useState<Draft>(() => draftOf(stored))

  const set = (p: Partial<Draft>) => setDraft((d) => ({ ...d, ...p }))
  const dirty = !sameDraft(draft, stored)

  const save = () => {
    /* only the keys on this page move — everything else keeps its stored value */
    const v = savedOf(draft, stored)
    writePickupModuleConfig({ enabled: v.enabled, mode: v.mode,
      autoPickup: { ...stored.autoPickup, triggerEvent: v.triggerEvent, slotConfirmation: v.slotConfirmation, userSelectsWindow: v.userSelectsWindow },
      manualPickup: { ...stored.manualPickup, blindAllowed: v.blindAllowed },
      /* shared by both modes — top-level (autoPickup.maxDaysAhead is derived from it) */
      bookingHorizonDays: v.bookingHorizonDays, sameDayCutoff: v.sameDayCutoff, pickupDaysSource: v.pickupDaysSource,
      manifestRequired: v.manifestRequired,
      podRequirements: { signature: v.signature, photo: v.photo, otp: v.otp }, overagePolicy: v.overagePolicy,
      autoRescheduleOnFail: v.autoRescheduleOnFail, merchantCancelUntil: v.merchantCancelUntil, allowAddToExistingUntil: v.allowAddToExistingUntil })
    set({ bookingHorizonDays: String(v.bookingHorizonDays), sameDayCutoff: v.sameDayCutoff })   // show the clamped values
    toast.success('Pickup settings saved')
  }
  /* Cancel reverts the draft to the saved config (no "Restore defaults") */
  const cancel = () => setDraft(draftOf(stored))
  const auto = draft.mode === 'auto'

  const would = savedOf(draft, stored)
  /* the fold opens by itself when something in it is not at its default — a changed setting is never hidden */
  const D = DEFAULT_PICKUP_MODULE_CONFIG
  const advancedChanged = draft.userSelectsWindow || draft.slotConfirmation || !EVENT_AFTER_STATE[draft.triggerEvent] || !draft.blindAllowed
    || !draft.manifestRequired || draft.pickupDaysSource !== D.pickupDaysSource || draft.signature !== D.podRequirements.signature
    || draft.photo !== D.podRequirements.photo || draft.otp !== D.podRequirements.otp || draft.overagePolicy !== D.overagePolicy
    || draft.autoRescheduleOnFail !== D.autoRescheduleOnFail || draft.merchantCancelUntil !== D.merchantCancelUntil
    || draft.allowAddToExistingUntil !== D.allowAddToExistingUntil
  const state = stateOfEvent(draft.triggerEvent)
  const facts = { ...would, dateRule: stored.autoPickup.dateRule, daysAfterOrder: stored.autoPickup.daysAfterOrder,
    slot: stored.autoPickup.slot || stored.slotDefinitions[0] || '' }
  const proof = [draft.signature !== 'off' && `signature ${POD_LABEL[draft.signature].toLowerCase()}`,
    draft.photo !== 'off' && `photo ${POD_LABEL[draft.photo].toLowerCase()}`, draft.otp && 'code'].filter(Boolean)
  const flow = [
    { title: 'Create', caption: auto ? `Automatic — when a consignment is ${state}` : `Manual — merchants and ops book${draft.blindAllowed ? ', even before consignments exist' : ''}` },
    { title: auto ? 'Date' : 'Book', caption: auto ? `Placed within ${plural(would.bookingHorizonDays, 'day')}; same-day until ${would.sameDayCutoff}` : `Up to ${plural(would.bookingHorizonDays, 'day')} ahead; same-day until ${would.sameDayCutoff}` },
    { title: 'Pick up', caption: draft.manifestRequired
      ? `Handover: ${SCAN_LABEL[stored.scanMode].toLowerCase()}${proof.length ? ` · proof: ${proof.join(', ')}` : ''}`
      : `Closes when picked up${proof.length ? ` · proof: ${proof.join(', ')}` : ''}` },
    { title: 'If it goes wrong', caption: `${draft.autoRescheduleOnFail ? 'Tries again automatically; ' : ''}the Reason Policy decides` },
  ]

  return (
    <div className="flex min-h-full flex-col">
      <div className="flex-1 p-6">
        <div className="max-w-[880px]">
          <PageHeader title="Pickup module" subtitle="From the first request to a closed pickup — each step in order"
            onBack={() => navigate('/local/settings')}
            right={<ToggleField checked={draft.enabled} onChange={(on) => set({ enabled: on })}
              label="Turn pickups on" on="Pickups on" off="Pickups off" />} />
        </div>
        <div className="flex max-w-[880px] flex-col gap-6">
          {draft.enabled ? (<>
            <FlowStrip steps={flow} />

            {/* FIVE decisions, in the order a pickup lives (owner, 2026-10-07: "simplify the config even more"); everything else has a
                safe default and waits in ONE fold. Nothing here needs touching for the module to work. */}
            <Card n={1} icon={<Workflow size={16} />} title="Pickup settings"
              caption="The defaults already work — change only what is different for you.">
              <Row label="How pickup requests are created" hint={auto ? 'Created for you as soon as a consignment is ready — booking buttons are hidden.' : 'Merchants and ops book each pickup. Add Schedules for regular collections.'}>
                <Seg<PickupMode> label="How pickup requests are created" value={draft.mode} onChange={(m) => set({ mode: m })}
                  options={[{ value: 'manual', label: 'Manual' }, { value: 'auto', label: 'Automatic' }]} />
              </Row>
              {auto && (
                <Row label="Create it when the consignment is" hint={STATE_HINT[state]}>
                  <Seg<AutoPickupAfterState> label="Create it when the consignment is" value={state}
                    onChange={(st) => set({ triggerEvent: LEGACY_AFTER_STATE_EVENT[st] })}
                    options={AUTO_AFTER_STATES.map((st) => ({ value: st, label: st }))} />
                </Row>
              )}
              <Row label="Scheduled pickups (rosters)" hint={`A merchant location collected on set days, with or without orders — ${schedules.filter((x) => x.status === 'Active').length} active.`}>
                <Button variant="outline" icon={<CalendarClock size={13} />} onClick={() => navigate('/local/pickup/schedules')}>Schedules ({schedules.length})</Button>
              </Row>
              <Row label={auto ? 'Pickup date limits' : 'Booking window'}
                hint={auto ? 'An automatic pickup is never placed further out than this; after the cut-off, today\'s consignments go to the next pickup day.'
                  : 'How far ahead people can book, and until when today\'s pickups can still be booked.'}>
                <div className="flex items-center gap-2">
                  <span className="text-[13px] text-ink-2">{auto ? 'Within' : 'Up to'}</span>
                  <div className="w-16"><Input type="number" value={draft.bookingHorizonDays} onChange={(n) => set({ bookingHorizonDays: n })} /></div>
                  <span className="text-[13px] text-ink-2">{auto ? 'days · today\'s until' : 'days ahead · today\'s until'}</span>
                  <div className="w-[92px]"><Input type="time" value={draft.sameDayCutoff} onChange={(t) => set({ sameDayCutoff: t })} /></div>
                </div>
              </Row>
              <Row label="If a pickup fails" hint="Each reason decides: try again, hold for review or cancel.">
                <Button variant="outline" icon={<ExternalLink size={13} />}
                  onClick={() => navigate('/local/settings/masters/service_order/reason-master?tab=reason-policy')}>Reason Policy</Button>
              </Row>
              <MoreOptions label="Advanced settings" defaultOpen={advancedChanged}>
                <GroupLabel>Creating</GroupLabel>
                {auto ? (<>
                  <Row label="Shipper chooses the pickup time" hint={askWindowHint(facts)}>
                    <ToggleField checked={draft.userSelectsWindow} onChange={(on) => set({ userSelectsWindow: on })} label="Shipper chooses the pickup time" />
                  </Row>
                  <Row label="Shipper confirms the time" hint="Ops can plan the pickup only after the shipper confirms its time.">
                    <ToggleField checked={draft.slotConfirmation} onChange={(on) => set({ slotConfirmation: on })} label="Shipper confirms the time" />
                  </Row>
                  <Row label="Exact event" hint={triggerHint(draft.triggerEvent)}>
                    <div className="w-full">
                      <MenuSelect value={draft.triggerEvent} options={AUTO_PICKUP_TRIGGER_CODES} labels={triggerOptionLabel}
                        onChange={(e) => set({ triggerEvent: e })} />
                    </div>
                  </Row>
                </>) : (
                  <Row label="Book before its consignments exist" hint="Adds Create Pickup (Add in Grow) — a blind pickup.">
                    <ToggleField checked={draft.blindAllowed} onChange={(on) => set({ blindAllowed: on })} label="Book before its consignments exist" />
                  </Row>
                )}
                <GroupLabel>Booking</GroupLabel>
                <Row label="Pickup days" hint={DAYS_SOURCE_HINT[draft.pickupDaysSource]}>
                  <div className="w-full">
                    <MenuSelect value={draft.pickupDaysSource} options={PICKUP_DAYS_SOURCES}
                      labels={(src) => DAYS_SOURCE_LABEL[src as PickupDaysSource] ?? src} onChange={(src) => set({ pickupDaysSource: src as PickupDaysSource })} />
                  </div>
                </Row>
                <Row label="Hub holidays" hint="Holidays always block pickups. Weekly offs and holidays are set per hub.">
                  <Button variant="outline" icon={<ExternalLink size={13} />}
                    onClick={() => navigate('/local/settings/masters/service_order/holiday-master')}>Holiday master</Button>
                </Row>
                <GroupLabel>Pick up and hand over</GroupLabel>
                {/* what this switch really is (owner, 2026-10-07: "inward scanning is controlled elsewhere"): hub inward scanning lives on the
                    Inbound page, and WHO scans (driver / hub / both) is the Handover scan mode in Base Modules → Pilot Driver App — neither is
                    set here; this only decides whether a completed pickup WAITS for its handover */}
                <Row label="Wait for the hub handover" hint={draft.manifestRequired
                  ? 'A completed pickup stays open until its scans match. Hub inward scanning is on the Inbound page.'
                  : 'A completed pickup closes at once — nothing waits to be matched at the hub.'}>
                  <ToggleField checked={draft.manifestRequired} onChange={(on) => set({ manifestRequired: on })} label="Wait for the hub handover" />
                </Row>
                <Row label="Proof — signature" hint="The shipper signs on the driver's phone.">
                  <div className="w-full">
                    <MenuSelect value={draft.signature} options={['required', 'optional', 'off']} labels={(pl) => POD_LABEL[pl as PodLevel] ?? pl}
                      onChange={(pl) => set({ signature: pl as PodLevel })} />
                  </div>
                </Row>
                <Row label="Proof — photo" hint="A photo of the collected parcels.">
                  <div className="w-full">
                    <MenuSelect value={draft.photo} options={['required', 'optional', 'off']} labels={(pl) => POD_LABEL[pl as PodLevel] ?? pl}
                      onChange={(pl) => set({ photo: pl as PodLevel })} />
                  </div>
                </Row>
                <Row label="Proof — one-time code" hint="The shipper confirms the pickup with a code.">
                  <ToggleField checked={draft.otp} onChange={(on) => set({ otp: on })} label="One-time code" />
                </Row>
                <Row label="Parcels not on the request" hint="What happens to a parcel the driver scans that was never booked.">
                  <div className="w-full">
                    <MenuSelect value={draft.overagePolicy} options={['hold', 'auto-create', 'reject']}
                      labels={(pl) => OVERAGE_LABEL[pl as PickupModuleConfig['overagePolicy']] ?? pl}
                      onChange={(pl) => set({ overagePolicy: pl as PickupModuleConfig['overagePolicy'] })} />
                  </div>
                </Row>
                <GroupLabel>When it goes wrong</GroupLabel>
                <Row label="Try again automatically" hint="After a failed pickup, a new request is made for the next pickup day.">
                  <ToggleField checked={draft.autoRescheduleOnFail} onChange={(on) => set({ autoRescheduleOnFail: on })} label="Try again automatically" />
                </Row>
                <Row label="Merchants can change or cancel until" hint="After this, only ops can reschedule, cancel or split the pickup.">
                  <div className="w-full">
                    <MenuSelect value={draft.merchantCancelUntil} options={[...STAGES]} labels={(x) => STAGE_LABEL[x as typeof STAGES[number]] ?? x}
                      onChange={(x) => set({ merchantCancelUntil: x as typeof STAGES[number] })} />
                  </div>
                </Row>
                <Row label="Consignments can be added until" hint="After this, a new consignment needs a new pickup request.">
                  <div className="w-full">
                    <MenuSelect value={draft.allowAddToExistingUntil} options={[...STAGES]} labels={(x) => STAGE_LABEL[x as typeof STAGES[number]] ?? x}
                      onChange={(x) => set({ allowAddToExistingUntil: x as typeof STAGES[number] })} />
                  </div>
                </Row>
              </MoreOptions>
            </Card>
          </>) : (
            <section className="flex items-start gap-3 rounded-xl border border-line bg-surface px-5 py-4 shadow-ds-1">
              <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-warm-100 text-brand-500"><Play size={16} /></span>
              <div className="min-w-0">
                <div className="text-[15px] font-bold leading-9 text-ink">Pickups are off</div>
                <p className="text-[13px] leading-relaxed text-ink-2">
                  The Pickup page and every Schedule Pickup button are hidden; existing requests can still be opened from their links.
                </p>
              </div>
            </section>
          )}
        </div>
      </div>

      {/* sticky footer: Cancel reverts to the saved config, Save writes it */}
      <div className="sticky bottom-0 z-10 flex items-center justify-end gap-3 border-t border-line bg-surface px-6 py-3">
        {dirty && <span className="mr-auto text-[12px] text-ink-3">Unsaved changes</span>}
        <Button variant="outline" onClick={cancel} disabled={!dirty}>Cancel</Button>
        <Button onClick={save} disabled={!dirty}>Save</Button>
      </div>
    </div>
  )
}
