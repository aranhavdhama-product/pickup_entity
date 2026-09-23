/**
 * Custom Settings → Base Modules — replica of the staging screen, fully wired.
 *
 * How the real screen works (verified live on staging 2026-08-26; card list
 * re-captured 2026-09-23 — 10 cards):
 *  - The module LISTING is static config in the SPA bundle (labels, descriptions,
 *    icons, codes) — there is no listing API. We mirror it in BASE_MODULES below,
 *    plus our own Pickup Request card (code PICKUP_REQUEST, created on first toggle).
 *  - Toggle STATE comes from POST /master/api/v1/moduleSettings/fetch; a code with
 *    no row (e.g. CARRIER_PORTAL on fresh accounts) renders as toggle-off.
 *  - Flipping a toggle PUTs the row if it exists, POSTs (creates) it if absent —
 *    both with body [{enabled, code, name, settingJson}] — then shows a toast.
 */
import { useEffect, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  BarChart3, Package, CalendarClock, Warehouse, Route as RouteIcon,
  MessagesSquare, Smartphone, Sticker, ListChecks, GitBranch, Truck,
  Boxes, RefreshCw, AlertCircle, ClipboardList, Radar, Timer, Undo2,
  CalendarRange, BellOff, FileBarChart, PackageOpen, Calculator, Container,
  Settings2, PackageCheck, type LucideIcon,
} from 'lucide-react'
import { Toggle, EmptyState, Button, Accordion } from './components'
import { toast } from './toast'
import { fetchModuleSettings, saveModuleSettings, parseSettingJson, type ModuleSetting } from './settingsApi'
import { readPickupModuleConfig, writePickupModuleConfig } from '../config/pickupModule'
import { ChevronDown, ChevronRight } from 'lucide-react'

/* The staging Base Modules list — static, mirrored 1:1 from the console bundle
   (10 cards, staging's order, re-captured live 2026-09-23) + our own Pickup Request
   card right after Pending For Planning.
   `slug` = staging's own URL segment (Jy config map), used in our routes too.
   `kind`: 'module' = toggle + chevron → module page (default);
           'toggle' = toggle only, no chevron, not clickable (Enable Routing);
           'link'   = no toggle, navigates to `to` or toasts "Coming soon" (General Settings) — never saved. */
export interface BaseModuleMeta {
  code: string
  slug: string
  title: string
  desc: string
  icon: LucideIcon
  kind?: 'module' | 'toggle' | 'link'
  /** 'link' cards: target route (absent → "Coming soon" toast) */
  to?: string
  /** module page header, when it differs from the card (staging: Consignment Order → "Orders") */
  pageTitle?: string
  pageSubtitle?: string
}
export const BASE_MODULES: BaseModuleMeta[] = [
  { code: 'GENERAL_SETTINGS', slug: 'general_settings', title: 'General Settings', desc: 'Manage your global settings', icon: Settings2, kind: 'link' },
  /* ^ no `to`: /console/settings/general-settings is the INTEGRATIONS General Settings
     (integration-org status), not staging's global settings — so the card toasts. */
  { code: 'OPS_DASHBOARD', slug: 'ops_dashboard', title: 'OPS Dashboard', desc: 'Manage your ops dashboard settings', icon: BarChart3 },
  { code: 'CONSIGNMENT_MANAGEMENT', slug: 'consignment_order', title: 'Consignment Order', desc: 'Manage your consignment order settings', icon: Package },
  { code: 'PENDING_FOR_PLANNING', slug: 'pending_for_planning', title: 'Pending For Planning', desc: 'Manage your Pending for planning order settings', icon: CalendarClock },
  { code: 'PICKUP_REQUEST', slug: 'pickup_request', title: 'Pickup Request', desc: 'Manage first-mile pickup settings', icon: PackageCheck,
    pageTitle: 'Pickup Requests', pageSubtitle: 'Control how first-mile pickups are created, executed and handed over.' },
  { code: 'LOAD_PLANNING', slug: 'load_planning', title: 'Load Planning', desc: 'Manage your Load planning settings', icon: Boxes },
  { code: 'CARRIER_PORTAL', slug: 'carrier-portal', title: 'Carrier Portal', desc: 'Manage your carrier portal settings', icon: Truck },
  { code: 'GEOCODING', slug: 'geo_code', title: 'Geo Coding', desc: 'Manage geo codes for your service locations', icon: Warehouse },
  { code: 'ROUTING', slug: 'routing', title: 'Enable Routing', desc: 'Enable or disable routing for this account', icon: RouteIcon, kind: 'toggle' },
  { code: 'PUT_AWAY', slug: 'put_away', title: 'Put Away', desc: 'Put away settings', icon: PackageOpen },
  { code: 'LASTMILE_LOADING', slug: 'lastmile_loading', title: 'Last Mile Loading', desc: 'Last Mile Loading settings', icon: Container },
]
const BASE_CODES = new Set(BASE_MODULES.map((m) => m.code))

/* Friendly meta for account modules that appear under "Show more" */
const EXTRA_META: Record<string, { title?: string; desc?: string; icon: LucideIcon }> = {
  CUSTOMER_INTERACTION: { title: 'Customer Interaction', desc: 'Manage customer interaction settings', icon: MessagesSquare },
  SHIP_LABEL_TEMPLATE: { title: 'Ship Label Template', desc: 'Manage your shipping label templates', icon: Sticker },
  DRIVER_APP_CONFIG: { title: 'Driver App Config', desc: 'Manage your driver app configuration', icon: Smartphone },
  DRIVER_APP_BASIC_SETTING: { title: 'Driver App Basic Setting', desc: 'Manage driver app basic settings', icon: Smartphone },
  DRIVER_APP_CHECKLIST_MODULE: { title: 'Driver App Checklist', desc: 'Manage driver app checklist forms', icon: ListChecks },
  DRIVER_APP_FORM_STATE_FLOW_MODULE: { title: 'Driver App State Flow', desc: 'Manage driver app form state flows', icon: GitBranch },
  DRIVER_APP_FORM_RULES_MODULE: { title: 'Driver App Form Rules', desc: 'Manage driver app form rules', icon: ClipboardList },
  DRIVER_APP_LOADING_MODULE: { title: 'Driver App Loading', desc: 'Manage driver app loading settings', icon: Truck },
  DRIVER_APP_HANDOVER_MODULE: { title: 'Driver App Handover', desc: 'Manage driver app handover settings', icon: PackageOpen },
  DRIVER_APP_SERVICE_MODULE: { title: 'Driver App Service', desc: 'Manage driver app service settings', icon: Timer },
  DRIVER_APP_XDOCK_CONFIG: { title: 'Driver App X-Dock Config', desc: 'Manage your driver app x-dock settings', icon: Container },
  CONTROL_TOWER_CONFIG: { title: 'Control Tower Config', desc: 'Manage your control tower settings', icon: Radar },
  NEW_CONTROL_TOWER_MODULE: { title: 'New Control Tower', desc: 'Manage your new control tower settings', icon: Radar },
  RETURN_SETTINGS: { title: 'Return Settings', desc: 'Manage your return settings', icon: Undo2 },
  SCHEDULING: { title: 'Scheduling', desc: 'Manage your scheduling settings', icon: CalendarRange },
  QUIET_HOURS: { title: 'Quiet Hours', desc: 'Manage your quiet hours settings', icon: BellOff },
  REPORT_V3: { title: 'Reports V3', desc: 'Manage your reports settings', icon: FileBarChart },
  SERVICE_TIME_RULE_SET: { title: 'Service Time Rule Set', desc: 'Manage your service time rules', icon: Timer },
  CI_SURVEYS: { title: 'CI Surveys', desc: 'Manage your customer interaction surveys', icon: MessagesSquare },
  LASTMILE_LOADING: { title: 'Lastmile Loading', desc: 'Manage your lastmile loading settings', icon: Truck },
  PUT_AWAY: { title: 'Put Away', desc: 'Manage your put away settings', icon: PackageOpen },
  RATE_CALCULATION: { title: 'Rate Calculation', desc: 'Manage your rate calculation settings', icon: Calculator },
  COMPLIANCE_MODULE: { title: 'Compliance', desc: 'Manage your compliance settings', icon: ClipboardList },
}

function titleFromCode(code: string): string {
  return code.toLowerCase().split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
}

interface RowVM {
  code: string
  title: string
  desc: string
  icon: LucideIcon
  kind: 'module' | 'toggle' | 'link'
  enabled: boolean
  exists: boolean       // has a backend row — decides PUT vs POST on toggle
  name: string          // backend display name (kept verbatim on updates)
  settingJson: string | null
  primary: boolean
  saving: boolean
}

function buildRows(fetched: ModuleSetting[]): RowVM[] {
  const byCode = new Map(fetched.map((m) => [m.code, m]))
  const primary: RowVM[] = BASE_MODULES.map((b) => {
    const row = byCode.get(b.code)
    /* absent row = off — except PICKUP_REQUEST (our own code), which shows the local
       mirror's flag so the prototype works before staging has a row */
    const absentEnabled = b.code === 'PICKUP_REQUEST' ? readPickupModuleConfig().enabled : false
    return {
      code: b.code, title: b.title, desc: b.desc, icon: b.icon, kind: b.kind ?? 'module',
      enabled: row?.enabled ?? absentEnabled, exists: !!row,
      name: row?.name ?? b.title, settingJson: row?.settingJson ?? null,
      primary: true, saving: false,
    }
  })
  const extra: RowVM[] = fetched
    .filter((m) => !BASE_CODES.has(m.code))
    .sort((a, b) => (a.id ?? 0) - (b.id ?? 0))
    .map((m) => {
      const meta = EXTRA_META[m.code]
      const title = meta?.title ?? titleFromCode(m.code)
      return {
        code: m.code, title,
        desc: meta?.desc ?? `Manage your ${title.replace(/\s+(Settings|Module|Config)$/i, '').toLowerCase()} settings`,
        icon: meta?.icon ?? Package, kind: 'module' as const,
        enabled: m.enabled, exists: true, name: m.name, settingJson: m.settingJson ?? null,
        primary: false, saving: false,
      }
    })
  return [...primary, ...extra]
}

/* PICKUP_REQUEST is our own moduleSettings code: the first toggle creates the row
   with the full feature-settings block (seeded from the local mirror), later
   toggles keep settingJson.featureSettings.enabled in step with the row flag. */
function pickupSettingJson(current: string | null, enabled: boolean): string {
  const parsed = parseSettingJson(current)
  const obj = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {}
  const fs = obj.featureSettings && typeof obj.featureSettings === 'object' ? obj.featureSettings : readPickupModuleConfig()
  return JSON.stringify({ ...obj, featureSettings: { ...fs, enabled } })
}

function ModuleRow({ row, onToggle, onOpen }: { row: RowVM; onToggle: (v: boolean) => void; onOpen?: () => void }) {
  const Icon = row.icon
  const setting = parseSettingJson(row.settingJson)
  const hasDetail = setting !== null && typeof setting === 'object'
  const toggle = <Toggle checked={row.enabled} onChange={row.saving ? undefined : onToggle} />
  // General Settings: a link card — no toggle, never saved
  if (row.primary && row.kind === 'link') {
    return (
      <div className="bg-surface border border-line rounded-md px-5 py-4 flex items-center gap-4 transition-all hover:border-warm-300 hover:shadow-ds-1 cursor-pointer group"
        onClick={onOpen}>
        <span className="h-10 w-10 shrink-0 rounded-lg bg-warm-100 text-ink-2 inline-flex items-center justify-center"><Icon size={20} /></span>
        <div className="min-w-0 flex-1">
          <div className="text-[15px] font-bold text-ink">{row.title}</div>
          <div className="text-[13px] text-ink-3 mt-0.5">{row.desc}</div>
        </div>
        <span className="h-8 w-8 inline-flex items-center justify-center text-warm-400 group-hover:text-ink-2 transition-colors">
          <ChevronRight size={17} />
        </span>
      </div>
    )
  }
  // Enable Routing: toggle only — no chevron, not clickable (staging)
  if (row.primary && row.kind === 'toggle') {
    return (
      <div className="bg-surface border border-line rounded-md px-5 py-4 flex items-center gap-4 transition-all hover:border-warm-300">
        <span className="h-10 w-10 shrink-0 rounded-lg bg-warm-100 text-ink-2 inline-flex items-center justify-center"><Icon size={20} /></span>
        <div className="min-w-0 flex-1">
          <div className="text-[15px] font-bold text-ink">{row.title}</div>
          <div className="text-[13px] text-ink-3 mt-0.5">{row.desc}</div>
        </div>
        {toggle}
      </div>
    )
  }
  // Primary (staging) modules navigate to their settings page, like the real console
  if (onOpen) {
    return (
      <div className="bg-surface border border-line rounded-md px-5 py-4 flex items-center gap-4 transition-all hover:border-warm-300 hover:shadow-ds-1 cursor-pointer group"
        onClick={onOpen}>
        <span className="h-10 w-10 shrink-0 rounded-lg bg-warm-100 text-ink-2 inline-flex items-center justify-center"><Icon size={20} /></span>
        <div className="min-w-0 flex-1">
          <div className="text-[15px] font-bold text-ink">{row.title}</div>
          <div className="text-[13px] text-ink-3 mt-0.5">{row.desc}</div>
        </div>
        <span onClick={(e) => e.stopPropagation()}>{toggle}</span>
        <span className="h-8 w-8 inline-flex items-center justify-center text-warm-400 group-hover:text-ink-2 transition-colors">
          <ChevronRight size={17} />
        </span>
      </div>
    )
  }
  if (!hasDetail) {
    return (
      <div className="bg-surface border border-line rounded-md px-5 py-4 flex items-center gap-4 transition-all hover:border-warm-300">
        <span className="h-10 w-10 shrink-0 rounded-lg bg-warm-100 text-ink-2 inline-flex items-center justify-center"><Icon size={20} /></span>
        <div className="min-w-0 flex-1">
          <div className="text-[15px] font-bold text-ink">{row.title}</div>
          <div className="text-[13px] text-ink-3 mt-0.5">{row.desc}</div>
        </div>
        {toggle}
        <span className="h-8 w-8 inline-flex items-center justify-center text-warm-200"><ChevronDown size={17} /></span>
      </div>
    )
  }
  return (
    <Accordion icon={<Icon size={20} />} title={row.title} subtitle={row.desc} right={toggle}>
      <div className="text-[12px] font-bold text-ink-3 mb-2">
        Setting JSON <span className="font-normal">· {row.code}</span>
      </div>
      <pre className="max-h-72 overflow-auto rounded-md bg-warm-50 border border-line px-3.5 py-3 text-[12px] leading-relaxed text-ink-2 font-mono">
        {JSON.stringify(setting, null, 2)}
      </pre>
    </Accordion>
  )
}

export default function BaseModulesPage() {
  const nav = useNavigate()
  const [rows, setRows] = useState<RowVM[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [showAll, setShowAll] = useState(false)

  const load = () => {
    setLoading(true)
    setError(null)
    fetchModuleSettings()
      .then((mods) => setRows(buildRows(mods)))
      .catch((e) => {
        setError(e instanceof Error ? e.message : String(e))
        setRows(buildRows([]))   // no rows known — only the locally-mirrored card is shown
      })
      .finally(() => setLoading(false))
  }
  useEffect(load, [])

  const patch = (code: string, p: Partial<RowVM>) =>
    setRows((rs) => rs?.map((r) => (r.code === code ? { ...r, ...p } : r)) ?? null)

  const onToggle = async (row: RowVM, enabled: boolean) => {
    patch(row.code, { enabled, saving: true })   // optimistic flip
    const isPickup = row.code === 'PICKUP_REQUEST'
    // the LOCAL app can't reach /staging — it reads this mirror, so write it first:
    // the switch must work without a staging session
    if (isPickup) writePickupModuleConfig({ enabled })
    try {
      // Absent rows are created with a minimal settingJson, like the real console
      const settingJson = isPickup
        ? pickupSettingJson(row.settingJson, enabled)
        : row.settingJson ?? JSON.stringify({ enabled })
      await saveModuleSettings(
        [{ enabled, code: row.code, name: row.name, settingJson }],
        row.exists,
      )
      patch(row.code, { exists: true, settingJson, saving: false })
      toast.success('Settings saved successfully.')
    } catch (e) {
      if (isPickup) {   // mirror already holds it — keep the flip, say where it lives
        patch(row.code, { saving: false })
        toast.info('Saved locally — staging is unavailable, so the console row was not updated.')
        console.warn('PICKUP_REQUEST staging save failed; local mirror updated', e)
        return
      }
      patch(row.code, { enabled: !enabled, saving: false })  // revert
      toast.error('Failed to save settings. Please try again later.')
      console.error('module toggle failed', e)
    }
  }

  const openModule = (code: string) => {
    const meta = BASE_MODULES.find((b) => b.code === code)
    if (meta?.kind === 'link') {
      if (meta.to) nav(meta.to)
      else toast.info('Coming soon')
      return
    }
    nav(`/console/settings/base-modules/${meta?.slug ?? code}`)
  }

  let body: ReactNode
  if (loading) {
    body = (
      <div className="space-y-4">
        {Array.from({ length: BASE_MODULES.length }, (_, i) => (
          <div key={i} className="bg-surface border border-line rounded-md px-5 py-4 flex items-center gap-4 animate-pulse">
            <span className="h-10 w-10 rounded-lg bg-warm-100" />
            <div className="flex-1 space-y-2">
              <div className="h-3.5 w-44 rounded bg-warm-100" />
              <div className="h-3 w-72 rounded bg-warm-50" />
            </div>
            <span className="h-5 w-9 rounded-full bg-warm-100" />
          </div>
        ))}
      </div>
    )
  } else if (error) {
    body = (
      <div className="bg-surface border border-line rounded-md px-5 py-8 flex flex-col items-center gap-3 text-center">
        <AlertCircle size={22} className="text-danger-fg" />
        <div>
          <div className="text-[15px] font-bold text-ink">Couldn't load base modules</div>
          <div className="text-[13px] text-ink-3 mt-0.5">{error} — check the staging session.</div>
        </div>
        <Button variant="outline" icon={<RefreshCw size={14} />} onClick={load}>Retry</Button>
      </div>
    )
    /* Pickup Request is mirrored locally, so it stays usable without a session */
    const pickup = (rows ?? []).find((r) => r.code === 'PICKUP_REQUEST')
    if (pickup) {
      body = (
        <div className="space-y-4">
          {body}
          <ModuleRow row={pickup} onToggle={(v) => onToggle(pickup, v)} onOpen={() => openModule(pickup.code)} />
        </div>
      )
    }
  } else if (!rows?.length) {
    body = <EmptyState title="No base modules configured" />
  } else {
    const hidden = rows.filter((r) => !r.primary)
    const visible = showAll ? rows : rows.filter((r) => r.primary)
    body = (
      <div className="space-y-4">
        {visible.map((r) => (
          <ModuleRow key={r.code} row={r} onToggle={(v) => onToggle(r, v)}
            onOpen={r.primary ? () => openModule(r.code) : undefined} />
        ))}
        {hidden.length > 0 && (
          <div className="flex justify-center pt-1">
            <button onClick={() => setShowAll((v) => !v)}
              className="inline-flex items-center gap-1.5 h-8 px-3.5 rounded-md text-[13px] font-bold text-brand-500 hover:bg-brand-50 transition-colors">
              {showAll ? 'Show less' : `Show ${hidden.length} more`}
              <ChevronDown size={15} className={`transition-transform ${showAll ? 'rotate-180' : ''}`} />
            </button>
          </div>
        )}
      </div>
    )
  }

  return <div className="w-full">{body}</div>
}
