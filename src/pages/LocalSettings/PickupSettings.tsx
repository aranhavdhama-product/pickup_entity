/**
 * LOCAL app → Settings → Pickup Request (`/local/settings/pickup`).
 *
 * Owner (2026-09-24): this page asks TWO things and nothing else — whether the
 * pickup module runs, and how requests are raised (auto vs manual). Every
 * other key of `PickupModuleConfig` keeps its stored value (defaults from
 * `src/config/pickupModule`); the console's Base Modules → Pickup Request page
 * (`nueva/ModuleDetail.tsx`) still edits the full set on the same mirror.
 *
 * ModuleDetail itself is NOT imported: it pulls settingsApi → the staging proxy, and
 * nothing in the local app may reach the staging proxy or the auth module.
 */
import { useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Hand, Zap } from 'lucide-react'
import { Button, PageHeader, Toggle } from '../../nueva/components'
import { toast } from '../../nueva/toast'
import {
  DEFAULT_PICKUP_MODULE_CONFIG, usePickupModuleConfig, writePickupModuleConfig, type PickupMode,
} from '../../config/pickupModule'

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

function LabeledField({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-6 py-2.5" title={hint}>
      <div className="min-w-0 text-[13.5px] text-ink">{label}</div>
      <div className="w-56 shrink-0">{children}</div>
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

/** The two ways requests are raised — one selected card (owner, 2026-09-24). */
function ModeCards({ value, onChange }: { value: PickupMode; onChange: (m: PickupMode) => void }) {
  const cards: { code: PickupMode; icon: ReactNode; title: string; desc: string }[] = [
    { code: 'auto', icon: <Zap size={18} />, title: 'Auto pickup request',
      desc: 'A request is raised when a consignment reaches the chosen state, on the pickup date this page computes.' },
    { code: 'manual', icon: <Hand size={18} />, title: 'Create pickup request manually',
      desc: 'Merchants and ops book pickups themselves — Schedule Pickup, Book Pickup and Create Pickup stay on the pages.' },
  ]
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Pickup request mode">
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

interface Draft { enabled: boolean; mode: PickupMode }
const draftOf = (c: { enabled: boolean; mode: PickupMode }): Draft => ({ enabled: c.enabled, mode: c.mode })

export default function PickupSettings() {
  const navigate = useNavigate()
  const stored = usePickupModuleConfig()
  const [draft, setDraft] = useState<Draft>(() => draftOf(stored))

  const dirty = draft.enabled !== stored.enabled || draft.mode !== stored.mode
  const isDefault = draft.enabled === DEFAULT_PICKUP_MODULE_CONFIG.enabled && draft.mode === DEFAULT_PICKUP_MODULE_CONFIG.mode

  const save = () => {
    /* only these two keys move — everything else keeps its stored value */
    writePickupModuleConfig(draft)
    toast.success('Pickup Request settings saved')
  }
  const reset = () => setDraft(draftOf(stored))
  const restoreDefaults = () => {
    setDraft(draftOf(DEFAULT_PICKUP_MODULE_CONFIG))
    toast.info('Defaults restored — Save to apply')
  }

  return (
    <div className="p-6 pb-10">
      <PageHeader
        title="Pickup Request"
        subtitle="Whether pickups run, and how requests are raised"
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

      <SectionCard title="Module" hint="Whether pickups run, and how requests are raised.">
        <LabeledField label="Pickup module enabled" hint="Same switch as the Pickup Request card on Base Modules.">
          <ToggleField checked={draft.enabled} onChange={(v) => setDraft((d) => ({ ...d, enabled: v }))} />
        </LabeledField>
        {/* owner, 2026-09-24: a disabled module shows nothing but its switch */}
        {draft.enabled && (
          <div className="py-3">
            <div className="mb-2 text-[13.5px] text-ink">Pickup request mode</div>
            <ModeCards value={draft.mode} onChange={(m) => setDraft((d) => ({ ...d, mode: m }))} />
          </div>
        )}
      </SectionCard>
    </div>
  )
}
