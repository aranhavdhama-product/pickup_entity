/**
 * LOCAL app → Settings → Pickup Request (`/local/settings/pickup`).
 *
 * Owner (2026-09-25, "improve settings UI"): five cards in one row grammar —
 * 1) Pickup module switch (off = nothing else); 2) How requests are raised (the
 * two mode cards); 3) the chosen mode's options (auto: trigger event, slot
 * confirmation, ask the shipper; manual: Reserved pickups); 4) Booking rules,
 * shared (horizon, same-day cut-off, pickup days follow + Holiday master);
 * 5) Pickup attempts → Reason policy. Sticky footer: Cancel (revert to saved) ·
 * Save; no "Restore defaults". Every
 * other key of `PickupModuleConfig` keeps its stored value (defaults from
 * `src/config/pickupModule`); the console's Base Modules → Pickup Request page
 * (`nueva/ModuleDetail.tsx`) still edits the full set on the same mirror.
 *
 * ModuleDetail itself is NOT imported: it pulls settingsApi → the staging proxy, and
 * nothing in the local app may reach the staging proxy or the auth module.
 */
import { useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { CalendarClock, Check, ExternalLink, Hand, RotateCcw, Workflow, Zap } from 'lucide-react'
import { Button, Input, MenuSelect, PageHeader, Toggle } from '../../nueva/components'
import { toast } from '../../nueva/toast'
import {
  PICKUP_DAYS_SOURCES, usePickupModuleConfig, writePickupModuleConfig,
  type PickupDaysSource, type PickupMode, type PickupModuleConfig,
} from '../../config/pickupModule'
import { AUTO_PICKUP_TRIGGER_CODES, triggerEventOf, triggerEventTitle } from '../../growOrders/fareyeEvents'
import { TriggerEventOption } from '../../growOrders/TriggerEventOption'

/* ---------- layout pieces (owner, 2026-09-25: ONE row grammar on the whole page) ---------- */

/** A card: 15px bold title + 12px caption, then its rows separated by `border-line`. */
/** A settings section: an icon tile (the mode cards' tile — warm-100 with a brand icon) beside a
 *  15px bold title and its 12px caption, a divider, then the rows (owner, 2026-09-25: clearer headers). */
function Card({ title, caption, icon, children }: { title: string; caption?: string; icon?: ReactNode; children?: ReactNode }) {
  return (
    <section className="rounded-xl border border-line bg-surface px-5 shadow-ds-1">
      <div className="flex items-center gap-3 py-4">
        {icon && <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-warm-100 text-brand-500">{icon}</span>}
        <div className="min-w-0">
          <div className="text-[15px] font-bold leading-tight text-ink">{title}</div>
          {caption && <p className="mt-0.5 truncate text-[12px] text-ink-3">{caption}</p>}
        </div>
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
        <p className="mt-0.5 truncate text-[12px] text-ink-3" title={typeof hint === 'string' ? hint : undefined}>{hint}</p>
      </div>
      <div className="flex w-[260px] shrink-0 justify-end">{children}</div>
    </div>
  )
}

function ToggleField({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex h-8 items-center gap-2.5">
      <span className="text-[13px] text-ink-2">{checked ? 'Enabled' : 'Disabled'}</span>
      <Toggle checked={checked} onChange={onChange} />
    </div>
  )
}

const YES_NO = ['yes', 'no']
const YES_NO_LABELS = (v: string) => (v === 'yes' ? 'Yes' : 'No')
function YesNo({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="w-full">
      <MenuSelect value={value ? 'yes' : 'no'} options={YES_NO} labels={YES_NO_LABELS} onChange={(v) => onChange(v === 'yes')} />
    </div>
  )
}

/* owner, 2026-09-25: which calendar the bookable pickup days follow (growOrders/operatingCalendar.ts) */
const DAYS_SOURCE_LABEL: Record<string, string> = {
  'merchant-then-hub': 'Merchant location preference, else hub calendar',
  hub: 'Hub operating days and holidays',
  module: 'Pickup module days only',
}
const DAYS_SOURCE_HINT: Record<string, string> = {
  'merchant-then-hub': "The pickup address's Location Master days the hub also works; else the hub's.",
  hub: "The drop hub's weekly offs, working hours and holidays.",
  module: 'Mon–Sat (or the auto pickup days); hub holidays are ignored.',
}

/** The two ways requests are raised — equal-height cards, one selected (owner, 2026-09-24). */
function ModeCards({ value, onChange }: { value: PickupMode; onChange: (m: PickupMode) => void }) {
  const cards: { code: PickupMode; icon: ReactNode; title: string; desc: string }[] = [
    { code: 'auto', icon: <Zap size={18} />, title: 'Auto pickup request',
      desc: 'Raised when a consignment reaches the chosen event.' },
    { code: 'manual', icon: <Hand size={18} />, title: 'Manual pickup requests',
      desc: 'Merchants and ops book pickups themselves.' },
  ]
  return (
    <div className="grid grid-cols-1 gap-3 pb-5 sm:grid-cols-2" role="radiogroup" aria-label="Pickup request mode">
      {cards.map((c) => {
        const on = c.code === value
        return (
          <button key={c.code} type="button" role="radio" aria-checked={on} onClick={() => onChange(c.code)}
            className={`flex h-full items-center gap-3 rounded-md border px-4 py-3.5 text-left transition-colors ${
              on ? 'border-ink bg-warm-50' : 'border-line bg-surface hover:border-warm-300 hover:shadow-ds-1'}`}>
            <span className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-warm-100 ${on ? 'text-brand-500' : 'text-ink-2'}`}>{c.icon}</span>
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-bold text-ink">{c.title}</span>
              <span className="mt-0.5 block truncate text-[12px] text-ink-3">{c.desc}</span>
            </span>
            {on
              ? <span className="inline-flex shrink-0 items-center gap-1 text-[12px] font-bold text-ink"><Check size={14} /> Selected</span>
              : <span className="h-4 w-4 shrink-0 rounded-full border border-warm-300" aria-hidden />}
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
    toast.success('Pickup module settings saved')
  }
  /* owner, 2026-09-25: Cancel reverts the draft to the saved config (no "Restore defaults") */
  const cancel = () => setDraft(draftOf(stored))
  const ev = triggerEventOf(draft.triggerEvent)
  const auto = draft.mode === 'auto'

  return (
    <div className="flex min-h-full flex-col">
      <div className="flex-1 p-6">
        {/* 1 — the module switch lives in the page header (owner, 2026-09-25: no card for it);
            a disabled module shows nothing else (owner, 2026-09-24) */}
        <div className="max-w-[880px]">
          <PageHeader title="Pickup module" subtitle="Choose how requests are raised and set the booking rules"
            onBack={() => navigate('/local/settings')}
            right={<ToggleField checked={draft.enabled} onChange={(v) => set({ enabled: v })} />} />
        </div>
        <div className="flex max-w-[880px] flex-col gap-6">
          {draft.enabled && (<>
            {/* 2 — how requests are raised */}
            <Card icon={<Workflow size={16} />} title="How requests are raised" caption="One mode for the whole account.">
              <div className="border-t border-line pt-5"><ModeCards value={draft.mode} onChange={(m) => set({ mode: m })} /></div>
            </Card>

            {/* 3 — the chosen mode's own options */}
            {auto ? (
              <Card icon={<Zap size={16} />} title="Auto pickup options" caption="How an auto-raised request is created.">
                <Row label="Raise auto pickup on event" hint={`${ev.code} · ${ev.meaning} · locally: ${ev.local}`}>
                  <div className="w-full">
                    <MenuSelect value={draft.triggerEvent} options={AUTO_PICKUP_TRIGGER_CODES} labels={triggerEventTitle}
                      renderOption={(v, active) => <TriggerEventOption code={v} active={active} />}
                      onChange={(v) => set({ triggerEvent: v })} />
                  </div>
                </Row>
                <Row label="Pickup slot confirmation" hint="Yes = the request waits for the shipper to confirm its slot before ops plan it.">
                  <YesNo value={draft.slotConfirmation} onChange={(v) => set({ slotConfirmation: v })} />
                </Row>
                <Row label="Ask the shipper for a pickup window" hint="Yes = the consignment form asks for a date and time under the booking rules.">
                  <YesNo value={draft.userSelectsWindow} onChange={(v) => set({ userSelectsWindow: v })} />
                </Row>
              </Card>
            ) : (
              <Card icon={<Hand size={16} />} title="Manual pickup options" caption="What merchants and ops may book.">
                <Row label="Reserved (blind) pickups" hint="Yes = a pickup can be booked before its consignments exist.">
                  <YesNo value={draft.blindAllowed} onChange={(v) => set({ blindAllowed: v })} />
                </Row>
              </Card>
            )}

            {/* 4 — booking rules, shared by both modes (each row once) */}
            <Card icon={<CalendarClock size={16} />} title="Booking rules" caption={auto ? 'Date the auto pickups and any window the shipper picks.' : 'Every booking, reschedule and split dialog follows these.'}>
              <Row label="Pickups can be booked up to" hint="The furthest date a pickup can be booked for.">
                <div className="flex items-center gap-2">
                  <div className="w-24"><Input type="number" value={draft.bookingHorizonDays} onChange={(v) => set({ bookingHorizonDays: v })} /></div>
                  <span className="text-[13px] text-ink-2">days</span>
                </div>
              </Row>
              <Row label="Same-day pickup cut-off" hint="After this time, no same-day pickup can be booked.">
                <div className="w-32"><Input type="time" value={draft.sameDayCutoff} onChange={(v) => set({ sameDayCutoff: v })} /></div>
              </Row>
              <Row label="Pickup days follow" hint={DAYS_SOURCE_HINT[draft.pickupDaysSource] ?? ''}>
                <div className="w-full">
                  <MenuSelect value={draft.pickupDaysSource} options={PICKUP_DAYS_SOURCES}
                    labels={(v) => DAYS_SOURCE_LABEL[v] ?? v} onChange={(v) => set({ pickupDaysSource: v as PickupDaysSource })} />
                </div>
              </Row>
              <Row label="Hub holidays" hint="Each hub's weekly offs, working hours and holidays live in the Holiday master.">
                <Button variant="outline" icon={<ExternalLink size={13} />}
                  onClick={() => navigate('/local/settings/masters/service_order/holiday-master')}>
                  Holiday master
                </Button>
              </Row>
            </Card>

            {/* 5 — after a failed pickup: the Reason policy (owner, 2026-09-25); `maxAttempts` stays the fallback */}
            <Card icon={<RotateCcw size={16} />} title="Pickup attempts" caption="What happens after a failed pickup follows the Reason policy.">
              <Row label="Re-attempt, hold for review or cancel" hint="Decided per failure reason in Reason Master → Reason Policy.">
                <Button variant="outline" icon={<ExternalLink size={13} />}
                  onClick={() => navigate('/local/settings/masters/service_order/reason-master?tab=reason-policy')}>
                  Reason policy
                </Button>
              </Row>
            </Card>
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
