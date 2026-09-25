/**
 * LOCAL Settings page grammar (owner, 2026-09-23): `PageHeader` → cards, one
 * setting per line — label (+ hint) left, control right. Shared by every page
 * under `/local/settings/*`.
 */
import type { ReactNode } from 'react'
import { MenuSelect, Toggle } from '../../nueva/components'

export function SectionCard({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="bg-surface border border-line rounded-xl shadow-ds-1 px-5 py-4">
      <div className="text-[15px] font-bold text-ink">{title}</div>
      {hint && <p className="mt-0.5 text-[13px] text-ink-3">{hint}</p>}
      <div className="mt-3 divide-y divide-line">{children}</div>
    </section>
  )
}

/** One setting: label + visible hint on the left, a fixed-width control on the right. */
export function SettingRow({ label, hint, width = 'w-56', children }: {
  label: string; hint?: ReactNode; width?: string; children: ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-6 py-2.5">
      <div className="min-w-0">
        <div className="text-[13px] text-ink">{label}</div>
        {hint && <p className="mt-0.5 text-[12px] text-ink-3">{hint}</p>}
      </div>
      <div className={`${width} shrink-0`}>{children}</div>
    </div>
  )
}

export function ToggleField({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex h-8 items-center gap-2.5">
      <Toggle checked={checked} onChange={onChange} />
      <span className="text-[13px] text-ink-2">{checked ? 'Enabled' : 'Disabled'}</span>
    </div>
  )
}

/** MenuSelect over a `{name, code}` option list (numeric codes round-trip as strings). */
export function OptionSelect<T extends string | number>({ options, value, onChange }: {
  options: readonly { name: string; code: T }[]; value: T; onChange: (v: T) => void
}) {
  const byKey = new Map(options.map((o) => [String(o.code), o]))
  return (
    <MenuSelect value={String(value)} options={options.map((o) => String(o.code))}
      labels={(k) => byKey.get(k)?.name ?? k}
      onChange={(k) => { const o = byKey.get(k); if (o) onChange(o.code) }} />
  )
}
