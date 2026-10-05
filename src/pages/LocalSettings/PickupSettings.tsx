/**
 * LOCAL app → Settings → Pickup module (`/local/settings/pickup`).
 *
 * Owner (2026-10-05, "simplify the pickups setting, current one feels confusing"): the page reads
 * in the order a person decides —
 * 1) the switch in the header (Pickups on / off; off = a one-line summary and nothing else);
 * 2) a live SUMMARY in plain sentences, built from the settings as they stand on the page
 *    (`pickupSummary.ts`); 3) Who books pickups (Manual | Automatic); 4) ONLY that mode's card —
 *    Automatic: Book the pickup when · Shipper chooses the pickup time · More options (Shipper
 *    confirms the time); Manual: Book a pickup before its consignments exist; 5) Booking rules,
 *    shared (Book up to N days ahead · Same-day cut-off · More options: Pickup days + Holiday
 *    master); 6) When a pickup fails → Reason Policy. Every hint is ONE line under 90 characters
 *    that says what happens; a "More options" group opens by itself when one of its settings is
 *    not at its default. Sticky footer: Cancel (revert to saved) · Save + "Unsaved changes".
 * Every stored key and its mapping is unchanged (defaults from `src/config/pickupModule`); keys
 * not on this page (the auto date rule, slot, pickup days …) keep their stored value and stay
 * editable on the console's Base Modules → Pickup Request page on the same mirror — the summary
 * and the "Shipper chooses the pickup time" hint SAY what that stored rule does.
 *
 * ModuleDetail itself is NOT imported: it pulls settingsApi → the staging proxy, and
 * nothing in the local app may reach the staging proxy or the auth module.
 */
import { useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { CalendarClock, Check, ExternalLink, Hand, Info, RotateCcw, Workflow, Zap } from 'lucide-react'
import { Button, Input, MenuSelect, PageHeader, Toggle } from '../../nueva/components'
import { toast } from '../../nueva/toast'
import {
  DEFAULT_PICKUP_MODULE_CONFIG, PICKUP_DAYS_SOURCES, usePickupModuleConfig, writePickupModuleConfig,
  type PickupDaysSource, type PickupMode, type PickupModuleConfig,
} from '../../config/pickupModule'
import { AUTO_PICKUP_TRIGGER_CODES } from '../../growOrders/fareyeEvents'
import { MoreOptions } from './settingsRows'
import { DAYS_SOURCE_HINT, askWindowHint, pickupSummary, triggerHint, triggerOptionLabel } from './pickupSummary'

/* ---------- layout pieces (ONE row grammar on the whole page) ---------- */

/** A settings section: an icon tile (warm-100 with a brand icon) beside a 15px bold title and its
 *  12px caption (+ an optional action on the right), a divider, then the rows. */
function Card({ title, caption, icon, action, children }: {
  title: string; caption?: string; icon?: ReactNode; action?: ReactNode; children?: ReactNode
}) {
  return (
    <section className="rounded-xl border border-line bg-surface px-5 shadow-ds-1">
      <div className="flex items-center gap-3 py-4">
        {icon && <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-warm-100 text-brand-500">{icon}</span>}
        <div className="min-w-0 flex-1">
          <div className="text-[15px] font-bold leading-tight text-ink">{title}</div>
          {caption && <p className="mt-0.5 text-[12px] text-ink-3">{caption}</p>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {children && <div className="divide-y divide-line border-t border-line">{children}</div>}
    </section>
  )
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

/* which calendar the bookable pickup days follow (growOrders/operatingCalendar.ts) */
const DAYS_SOURCE_LABEL: Record<PickupDaysSource, string> = {
  'merchant-then-hub': 'Pickup address and hub',
  hub: 'Hub only',
}

/** Who books pickups — two equal cards, one selected. */
function ModeCards({ value, onChange }: { value: PickupMode; onChange: (m: PickupMode) => void }) {
  const cards: { code: PickupMode; icon: ReactNode; title: string; desc: string }[] = [
    { code: 'manual', icon: <Hand size={18} />, title: 'Manual',
      desc: 'Merchants and ops book each pickup themselves.' },
    { code: 'auto', icon: <Zap size={18} />, title: 'Automatic',
      desc: 'A pickup is booked for you as soon as a consignment is ready.' },
  ]
  return (
    <div className="grid grid-cols-1 gap-3 py-5 sm:grid-cols-2" role="radiogroup" aria-label="Who books pickups">
      {cards.map((c) => {
        const on = c.code === value
        return (
          <button key={c.code} type="button" role="radio" aria-checked={on} onClick={() => onChange(c.code)}
            className={`flex h-full flex-col gap-2 rounded-md border px-4 py-3.5 text-left transition-colors ${
              on ? 'border-ink bg-warm-50' : 'border-line bg-surface hover:border-warm-300 hover:shadow-ds-1'}`}>
            <span className="flex items-center gap-3">
              <span className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-warm-100 ${on ? 'text-brand-500' : 'text-ink-2'}`}>{c.icon}</span>
              <span className="min-w-0 flex-1 text-[15px] font-bold text-ink">{c.title}</span>
              {on
                ? <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-ink text-white" aria-hidden><Check size={11} strokeWidth={3} /></span>
                : <span className="h-4 w-4 shrink-0 rounded-full border border-warm-300" aria-hidden />}
            </span>
            <span className="text-[12px] text-ink-3">{c.desc}</span>
          </button>
        )
      })}
    </div>
  )
}

/* ---------- page ---------- */

interface Draft {
  enabled: boolean; mode: PickupMode; triggerEvent: string; slotConfirmation: boolean; blindAllowed: boolean
  userSelectsWindow: boolean
  /** kept as typed (a string) so clearing the field does not snap back; clamped 1–30 on save */
  bookingHorizonDays: string
  sameDayCutoff: string
  pickupDaysSource: PickupDaysSource
}
type DraftSource = Pick<PickupModuleConfig, 'enabled' | 'mode' | 'autoPickup' | 'manualPickup' | 'bookingHorizonDays' | 'sameDayCutoff' | 'pickupDaysSource'>
const draftOf = (c: DraftSource): Draft =>
  ({ enabled: c.enabled, mode: c.mode, triggerEvent: c.autoPickup.triggerEvent, slotConfirmation: c.autoPickup.slotConfirmation,
    blindAllowed: c.manualPickup.blindAllowed, userSelectsWindow: c.autoPickup.userSelectsWindow,
    bookingHorizonDays: String(c.bookingHorizonDays), sameDayCutoff: c.sameDayCutoff, pickupDaysSource: c.pickupDaysSource })
const horizonOf = (v: string, fallback: number) => {
  const n = Number(v)
  return v.trim() !== '' && Number.isFinite(n) ? Math.min(30, Math.max(1, Math.round(n))) : fallback
}
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/
/** the values a Draft would save, for dirty / default comparisons */
const savedOf = (d: Draft, base: DraftSource) => ({
  ...d, bookingHorizonDays: horizonOf(d.bookingHorizonDays, base.bookingHorizonDays),
  sameDayCutoff: HHMM.test(d.sameDayCutoff) ? d.sameDayCutoff : base.sameDayCutoff,
})
const sameDraft = (d: Draft, c: DraftSource) => {
  const a = savedOf(d, c), b = savedOf(draftOf(c), c)
  return (Object.keys(a) as (keyof Draft)[]).every((k) => a[k] === b[k])
}
export default function PickupSettings() {
  const navigate = useNavigate()
  const stored = usePickupModuleConfig()
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
      bookingHorizonDays: v.bookingHorizonDays, sameDayCutoff: v.sameDayCutoff, pickupDaysSource: v.pickupDaysSource })
    set({ bookingHorizonDays: String(v.bookingHorizonDays), sameDayCutoff: v.sameDayCutoff })   // show the clamped values
    toast.success('Pickup settings saved')
  }
  /* Cancel reverts the draft to the saved config (no "Restore defaults") */
  const cancel = () => setDraft(draftOf(stored))
  const auto = draft.mode === 'auto'

  /* the summary and the window hint read the values this draft WOULD save, plus the stored auto date rule */
  const would = savedOf(draft, stored)
  const facts = { ...would, dateRule: stored.autoPickup.dateRule, daysAfterOrder: stored.autoPickup.daysAfterOrder,
    slot: stored.autoPickup.slot || stored.slotDefinitions[0] || '' }

  return (
    <div className="flex min-h-full flex-col">
      <div className="flex-1 p-6">
        {/* 1 — the switch lives in the page header; off shows the summary and nothing else */}
        <div className="max-w-[880px]">
          <PageHeader title="Pickup module" subtitle="Choose who books pickups and the rules they follow"
            onBack={() => navigate('/local/settings')}
            right={<ToggleField checked={draft.enabled} onChange={(on) => set({ enabled: on })}
              label="Turn pickups on" on="Pickups on" off="Pickups off" />} />
        </div>
        <div className="flex max-w-[880px] flex-col gap-6">
          {/* 2 — what the settings below add up to, in plain sentences (live: follows the draft) */}
          <section className="flex items-start gap-3 rounded-xl border border-line bg-surface px-5 py-4 shadow-ds-1">
            <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-warm-100 text-brand-500"><Info size={16} /></span>
            <div className="min-w-0">
              <div className="text-[15px] font-bold leading-9 text-ink">Summary</div>
              <p className="text-[13px] leading-relaxed text-ink-2" role="status" aria-live="polite">{pickupSummary(facts).join(' ')}</p>
            </div>
          </section>

          {draft.enabled && (<>
            {/* 3 — who books pickups */}
            <Card icon={<Workflow size={16} />} title="Who books pickups" caption="Choose one for the whole account.">
              <ModeCards value={draft.mode} onChange={(m) => set({ mode: m })} />
            </Card>

            {/* 4 — the chosen mode's own options (nothing from the other mode) */}
            {auto ? (
              <Card icon={<Zap size={16} />} title="Automatic pickups"
                caption="Schedule Pickup and the Pickup page are hidden; requests appear in Pending for Planning.">
                <Row label="Book the pickup when" hint={triggerHint(draft.triggerEvent)}>
                  <div className="w-full">
                    <MenuSelect value={draft.triggerEvent} options={AUTO_PICKUP_TRIGGER_CODES} labels={triggerOptionLabel}
                      onChange={(e) => set({ triggerEvent: e })} />
                  </div>
                </Row>
                <Row label="Shipper chooses the pickup time" hint={askWindowHint(facts)}>
                  <ToggleField checked={draft.userSelectsWindow} onChange={(on) => set({ userSelectsWindow: on })} label="Shipper chooses the pickup time" />
                </Row>
                <MoreOptions defaultOpen={draft.slotConfirmation}>
                  <Row label="Shipper confirms the time" hint="Ops can plan the pickup only after the shipper confirms its time.">
                    <ToggleField checked={draft.slotConfirmation} onChange={(on) => set({ slotConfirmation: on })} label="Shipper confirms the time" />
                  </Row>
                </MoreOptions>
              </Card>
            ) : (
              <Card icon={<Hand size={16} />} title="Manual pickups"
                caption="Merchants book from Grow, ops from Consignments and the Pickup page.">
                <Row label="Book a pickup before its consignments exist" hint="Adds Create Pickup (Add in Grow). These show as LTL blind / FTL blind.">
                  <ToggleField checked={draft.blindAllowed} onChange={(on) => set({ blindAllowed: on })} label="Book a pickup before its consignments exist" />
                </Row>
              </Card>
            )}

            {/* 5 — booking rules, shared by both modes (each row once) */}
            <Card icon={<CalendarClock size={16} />} title="Booking rules"
              caption={auto ? 'Apply when a shipper picks a time or ops change one.' : 'Apply whenever someone books, reschedules or splits a pickup.'}>
              <Row label="Book up to" hint="Counted from today. Choose 1 to 30 days.">
                <div className="flex items-center gap-2">
                  <div className="w-24"><Input type="number" value={draft.bookingHorizonDays} onChange={(n) => set({ bookingHorizonDays: n })} /></div>
                  <span className="text-[13px] text-ink-2">days ahead</span>
                </div>
              </Row>
              <Row label="Same-day cut-off" hint="Pickups for today can be booked until this time.">
                <div className="w-32"><Input type="time" value={draft.sameDayCutoff} onChange={(t) => set({ sameDayCutoff: t })} /></div>
              </Row>
              <MoreOptions defaultOpen={draft.pickupDaysSource !== DEFAULT_PICKUP_MODULE_CONFIG.pickupDaysSource}>
                <Row label="Pickup days" hint={DAYS_SOURCE_HINT[draft.pickupDaysSource]}>
                  <div className="w-full">
                    <MenuSelect value={draft.pickupDaysSource} options={PICKUP_DAYS_SOURCES}
                      labels={(s) => DAYS_SOURCE_LABEL[s as PickupDaysSource] ?? s} onChange={(s) => set({ pickupDaysSource: s as PickupDaysSource })} />
                  </div>
                </Row>
                <Row label="Hub holidays" hint="Holidays always block pickups. Weekly offs and holidays are set per hub.">
                  <Button variant="outline" icon={<ExternalLink size={13} />}
                    onClick={() => navigate('/local/settings/masters/service_order/holiday-master')}>
                    Holiday master
                  </Button>
                </Row>
              </MoreOptions>
            </Card>

            {/* 6 — after a failed pickup: the Reason Policy decides; `maxAttempts` stays the fallback */}
            <Card icon={<RotateCcw size={16} />} title="When a pickup fails"
              caption="Each failure reason decides: re-attempt, hold for review or cancel."
              action={
                <Button variant="outline" icon={<ExternalLink size={13} />}
                  onClick={() => navigate('/local/settings/masters/service_order/reason-master?tab=reason-policy')}>
                  Reason Policy
                </Button>
              } />
          </>)}
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
