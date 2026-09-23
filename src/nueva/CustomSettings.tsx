import { useMemo, useState } from 'react'
import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { MapPin, Monitor, Truck, Plug, Package, ChevronRight, CornerDownRight } from 'lucide-react'
import { SearchInput } from './components'
import { buildDeepIndex, searchSettings } from './settingsSearch'

/* ---------------- Custom Settings sub-nav (mirrors staging left nav 1:1) ---------------- */
const SUB_NAV: { group: string; gicon: any; items: { label: string; to?: string }[] }[] = [
  { group: 'Platform', gicon: Monitor, items: [
    { label: 'Base Modules', to: '/console/settings/base-modules' },
    { label: 'Masters', to: '/console/settings/masters' },
    { label: 'Users Management', to: '/console/settings/users' },
    { label: 'Roles And Permissions', to: '/console/settings/roles' },
    { label: 'Incident Management', to: '/console/settings/incidents' },
  ] },
  { group: 'Ship', gicon: Package, items: [
    { label: 'Carrier Allocation', to: '/console/settings/carrier-allocation' },
    { label: 'Data Validation', to: '/console/settings/data-validation' },
    { label: 'Number Generation Config', to: '/console/settings/number-generation' },
    { label: 'Label Template', to: '/console/settings/label-template' },
    { label: 'Ship Common Settings', to: '/console/settings/ship-common' },
  ] },
  { group: 'Execute', gicon: Truck, items: [
    { label: 'Pilot Driver App', to: '/console/settings/pilot-driver' },
    { label: 'Pilot X-Dock App', to: '/console/settings/pilot-xdock' },
    { label: 'Control Tower', to: '/console/settings/control-tower' },
    { label: 'Delivery Settings', to: '/console/settings/delivery-settings' },
    { label: 'Service Time', to: '/console/settings/service-time' },
  ] },
  { group: 'Experience', gicon: MapPin, items: [
    { label: 'Notify', to: '/console/settings/notify' },
    { label: 'Engage', to: '/console/settings/engage' },
    { label: 'Return', to: '/console/settings/return' },
  ] },
  { group: 'Integrations', gicon: Plug, items: [
    { label: 'General Settings', to: '/console/settings/general-settings' },
    { label: 'Web hooks', to: '/console/settings/webhooks' },
  ] },
]

function SubNav() {
  const nav = useNavigate()
  const loc = useLocation()
  const [q, setQ] = useState('')
  const query = q.trim().toLowerCase()
  const groups = SUB_NAV
    .map((g) => ({ ...g, items: query ? g.items.filter((it) => it.label.toLowerCase().includes(query)) : g.items }))
    .filter((g) => g.items.length > 0)
  // deepest-level hits (sub-masters, module detail pages) — see settingsSearch.ts
  const deepIndex = useMemo(buildDeepIndex, [])
  const deepHits = useMemo(() => {
    const navLabels = new Set(SUB_NAV.flatMap((g) => g.items.map((i) => i.label.toLowerCase())))
    return searchSettings(deepIndex, query).filter((h) => !navLabels.has(h.label.toLowerCase()))
  }, [deepIndex, query])
  return (
    <div className="w-[208px] shrink-0 pr-2 pt-1">
      <div className="px-0.5 mb-3">
        <SearchInput value={q} onChange={setQ} placeholder="Search settings" />
      </div>
      {groups.length === 0 && deepHits.length === 0 && (
        <div className="px-3 py-4 text-[13px] text-ink-3">No settings match “{q}”.</div>
      )}
      {query && deepHits.length > 0 && (
        <div className="mb-4">
          <div className="flex items-center gap-2 px-3 mb-1.5">
            <CornerDownRight size={14} className="text-brand-500/70" />
            <span className="text-[11.5px] font-black uppercase tracking-[0.08em] text-ink-2">In settings</span>
            <span className="flex-1 h-px bg-line" />
          </div>
          {deepHits.map((h) => (
            <button key={h.to} onClick={() => nav(h.to)}
              className="group w-full rounded-lg px-3 py-1.5 text-left transition-colors hover:bg-warm-100">
              <span className="block text-[13.5px] text-ink-2">{h.label}</span>
              <span className="block text-[11px] text-ink-3">{h.trail}</span>
            </button>
          ))}
        </div>
      )}
      {groups.map((g) => {
        const G = g.gicon
        return (
          <div key={g.group} className="mb-4">
            <div className="flex items-center gap-2 px-3 mb-1.5">
              <G size={14} className="text-brand-500/70" />
              <span className="text-[11.5px] font-black uppercase tracking-[0.08em] text-ink-2">{g.group}</span>
              <span className="flex-1 h-px bg-line" />
            </div>
            {g.items.map((it) => {
              const active = it.to && loc.pathname.startsWith(it.to)
              return (
                <button key={it.label} onClick={() => it.to && nav(it.to)}
                  className={`group w-full flex items-center justify-between rounded-lg px-3 py-2 text-[14px] text-left transition-colors
                    ${active ? 'bg-teal-50 text-ink-2 font-bold' : 'text-ink-2 hover:bg-warm-100'}`}>
                  {it.label}
                  <ChevronRight size={15} strokeWidth={2}
                    className={`shrink-0 transition-all duration-150
                      ${active ? 'text-ink-2' : 'text-warm-300 group-hover:text-warm-500 group-hover:translate-x-0.5'}`} />
                </button>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}

/**
 * Renders inside the shared app Layout, so it contributes only the Custom Settings
 * sub-nav and its content — the left rail and header stay the app's own.
 */
export default function CustomSettingsLayout() {
  return (
    <div className="fe-nueva flex min-h-full gap-4 bg-canvas px-6 py-5 text-ink">
      <SubNav />
      <div className="flex-1 min-w-0">
        <Outlet />
      </div>
    </div>
  )
}
