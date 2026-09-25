/**
 * The LOCAL app's left rail.
 *
 * Deliberately its own component rather than a mode of the console `Sidebar`:
 * that one is driven by `config/navigation.ts`, which describes the
 * session-backed console, and it renders a user chip fed by `src/auth`. This app
 * has no session, so it has no account, no sign-out and no console nav — and it
 * must not import `src/auth` at all.
 *
 * WIDTH IS MEASURED, NOT CHOSEN: 256px is staging's own rail
 * (`stagingTokens.json` → `layout.sidebarWidth`). It is what puts the Pending
 * For Planning content origin at x=272 and its content width at 1152, which is
 * what the pixel diff for that route is measured against.
 */
import { useLocation } from 'react-router-dom'
import { pickupPagesVisible, usePickupModuleConfig } from '../config/pickupModule'
import {
  CalendarClock, FileClock, Package, Radar, RotateCcw, Route, Settings, Smartphone, Store, Truck,
  Warehouse,
} from 'lucide-react'
import { ShellRowBody, ShellSidebar, type ShellNavItem } from './shell'
import { shellRowClass } from './shellClasses'
import { growOrderActions } from '../growOrders/store'
import { planningActions } from '../pages/LocalPFP/planningStore'
import { routingPlanActions } from '../pages/LocalRouting/routingPlans'

interface LocalNavItem extends ShellNavItem {
  path: string
  /** paths below this one that should still light the row up */
  owns?: string
  /** other exact paths (and their sub-paths) that also light the row up */
  also?: string[]
}

const LOCAL_NAV: LocalNavItem[] = [
  {
    id: 'consignments',
    label: 'Consignment Order',
    icon: Package,
    path: '/local/consignments',
    owns: '/local/consignments',
  },
  {
    id: 'pending-for-planning',
    label: 'Pending for Planning',
    icon: CalendarClock,
    path: '/local/pending-for-planning',
    owns: '/local/pending-for-planning',
  },
  /* the -replica route stays for the pixel-diff tooling but is not in the rail
     (owner, 2026-09-24): ONE Pending for Planning, whose look follows the module */
  /* owner, 2026-09-25: Pickup sits ABOVE Routing */
  { id: 'pickup', label: 'Pickup', icon: Truck, path: '/local/pickup', owns: '/local/pickup' },
  /* Same/Next Day Routing (staging Route → Same/Next Day Routing) + its Vehicle Config */
  { id: 'routing', label: 'Routing', icon: Route, path: '/local/routing', owns: '/local/routing' },
  { id: 'control-tower', label: 'Control Tower', icon: Radar, path: '/local/control-tower', owns: '/local/control-tower' },
  { id: 'inbound', label: 'Inbound', icon: Warehouse, path: '/local/inbound', owns: '/local/inbound' },
  /* Settings landing: Column configuration (/local/columns) + Pickup Request */
  { id: 'settings', label: 'Settings', icon: Settings, path: '/local/settings', owns: '/local/settings', also: ['/local/columns'] },
  { id: 'changes', label: "What's changed", icon: FileClock, path: '/local/changes' },
]

/** Standalone demo surfaces — their own shells, so they open in a new tab. */
const DEMO_LINKS = [
  { href: '/grow/orders', label: 'Grow merchant portal', icon: Store },
  { href: '/driver', label: 'Driver app', icon: Smartphone },
]

/**
 * Demo resilience: put BOTH stores back on their seeds and reload. Order
 * matters — planningStore's seed trips read the Grow requests as they are
 * when it runs, so the Grow store is reset first.
 */
function resetDemoData() {
  growOrderActions.reset()
  planningActions.reset()
  /* plans reference trip ids, which a reseed hands out again — drop them too */
  routingPlanActions.reset()
  window.location.reload()
}

export default function LocalSidebar() {
  const { pathname } = useLocation()
  /* owner, 2026-09-24: with the pickup module OFF there is no Pickup page in the rail */
  const pickupOn = pickupPagesVisible(usePickupModuleConfig())
  const items = pickupOn ? LOCAL_NAV : LOCAL_NAV.filter((i) => i.id !== 'pickup')

  const activeId = LOCAL_NAV.find((i) =>
    pathname === i.path || (i.owns && pathname.startsWith(i.owns + '/'))
    || i.also?.some((a) => pathname === a || pathname.startsWith(a + '/')))?.id ?? ''

  return (
    <ShellSidebar items={items} activeId={activeId} footer={(collapsed) => (
      <>
        {!collapsed && (
          <p className="px-5 pb-1 pt-1 text-[11px] font-bold uppercase tracking-wide text-ink-3">Demos</p>
        )}
        {DEMO_LINKS.map(({ href, label, icon }) => (
          <a key={href} href={href} target="_blank" rel="noreferrer" title={label} aria-label={label}
            className={shellRowClass(false, collapsed)}>
            <ShellRowBody icon={icon} label={label} active={false} collapsed={collapsed} />
          </a>
        ))}
        <button type="button" onClick={resetDemoData} title="Reset demo data" aria-label="Reset demo data"
          className={shellRowClass(false, collapsed)}>
          <ShellRowBody icon={RotateCcw} label="Reset demo data" active={false} collapsed={collapsed} />
        </button>
      </>
    )} />
  )
}
