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
import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
  CalendarClock, ChevronsLeft, ChevronsRight, FileClock, Package, Radar, RotateCcw, Settings, Smartphone, Store, Truck,
  Warehouse, type LucideIcon,
} from 'lucide-react'
import { growOrderActions } from '../growOrders/store'
import { planningActions } from '../pages/LocalPFP/planningStore'

interface LocalNavItem {
  id: string
  label: string
  icon: LucideIcon
  path: string
  /** paths below this one that should still light the row up */
  owns?: string
  /** other exact paths (and their sub-paths) that also light the row up */
  also?: string[]
  /** a muted word after the label (e.g. "replica") */
  suffix?: string
}

const LOCAL_NAV: LocalNavItem[] = [
  {
    id: 'consignments',
    label: 'Shipments',
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
  /* the faithful STAGING replica of the same page — same icon, muted suffix */
  {
    id: 'pending-for-planning-replica',
    label: 'Pending for Planning',
    suffix: 'replica',
    icon: CalendarClock,
    path: '/local/pending-for-planning-replica',
    owns: '/local/pending-for-planning-replica',
  },
  { id: 'pickup', label: 'Pickup', icon: Truck, path: '/local/pickup', owns: '/local/pickup' },
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
  window.location.reload()
}

export default function LocalSidebar() {
  const { pathname } = useLocation()
  const [collapsed, setCollapsed] = useState(false)

  const activeId = LOCAL_NAV.find((i) =>
    pathname === i.path || (i.owns && pathname.startsWith(i.owns + '/'))
    || i.also?.some((a) => pathname === a || pathname.startsWith(a + '/')))?.id ?? ''

  return (
    <aside
      className={`flex flex-shrink-0 flex-col border-r border-gray-200 bg-white transition-all duration-200
        ${collapsed ? 'w-14' : 'w-[256px]'}`}
      style={{ height: '100vh', position: 'sticky', top: 0 }}
    >
      <div className="flex min-h-[56px] items-center justify-between border-b border-gray-100 px-4 py-3">
        {!collapsed ? (
          <>
            <Link to="/" className="flex items-center gap-2">
              <img src="/fareye-logo.png" alt="" className="h-7 w-7 object-contain" draggable={false} />
              <span className="text-[15px] font-bold tracking-tight text-gray-800">FarEye</span>
            </Link>
            <button onClick={() => setCollapsed(true)} aria-label="Collapse sidebar"
              className="rounded p-1 text-gray-400 hover:bg-gray-100">
              <ChevronsLeft size={16} />
            </button>
          </>
        ) : (
          <button onClick={() => setCollapsed(false)} aria-label="Expand sidebar"
            className="mx-auto rounded p-1.5 text-gray-400 hover:bg-gray-100">
            <ChevronsRight size={16} />
          </button>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto py-2">
        {LOCAL_NAV.map(({ id, label, suffix, icon: Icon, path }) => {
          const full = suffix ? `${label} (${suffix})` : label
          const active = id === activeId
          return collapsed ? (
            <Link key={id} to={path} title={full} aria-label={full}
              className={`flex justify-center py-2.5 transition-colors
                ${active ? 'bg-[#FFEDE5] text-[#E84E1B]' : 'text-gray-500 hover:bg-gray-50 hover:text-[#E84E1B]'}`}>
              <Icon size={18} strokeWidth={1.75} />
            </Link>
          ) : (
            <Link key={id} to={path} title={full}
              className={`mx-2 my-0.5 flex items-center gap-3 rounded-md px-3 py-2 text-[14px] transition-colors
                ${active
                  ? 'bg-[#FFEDE5] font-semibold text-[#E84E1B]'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'}`}>
              <Icon size={17} strokeWidth={1.75} className={active ? 'text-[#E84E1B]' : 'text-gray-500'} />
              <span className="flex-1 truncate">
                {label}
                {suffix && <span className="ml-1 text-[12px] font-normal text-gray-400">{suffix}</span>}
              </span>
            </Link>
          )
        })}
      </nav>

      <div className="border-t border-gray-100 py-2">
        {!collapsed && (
          <p className="px-5 pb-1 pt-1 text-[10.5px] font-bold uppercase tracking-wide text-gray-400">Demos</p>
        )}
        {DEMO_LINKS.map(({ href, label, icon: Icon }) => (
          <a key={href} href={href} target="_blank" rel="noreferrer" title={label} aria-label={label}
            className={collapsed
              ? 'flex justify-center py-2.5 text-gray-500 transition-colors hover:bg-gray-50 hover:text-[#E84E1B]'
              : 'mx-2 my-0.5 flex items-center gap-3 rounded-md px-3 py-2 text-[14px] text-gray-600 transition-colors hover:bg-gray-50 hover:text-gray-900'}>
            <Icon size={collapsed ? 18 : 17} strokeWidth={1.75} className={collapsed ? '' : 'text-gray-500'} />
            {!collapsed && <span className="flex-1 truncate">{label}</span>}
          </a>
        ))}
        <button type="button" onClick={resetDemoData} title="Reset demo data" aria-label="Reset demo data"
          className={collapsed
            ? 'flex w-full justify-center py-2.5 text-gray-500 transition-colors hover:bg-gray-50 hover:text-[#E84E1B]'
            : 'mx-2 my-0.5 flex w-[calc(100%-1rem)] items-center gap-3 rounded-md px-3 py-2 text-left text-[14px] text-gray-600 transition-colors hover:bg-gray-50 hover:text-gray-900'}>
          <RotateCcw size={collapsed ? 18 : 17} strokeWidth={1.75} className={collapsed ? '' : 'text-gray-500'} />
          {!collapsed && <span className="flex-1 truncate">Reset demo data</span>}
        </button>
      </div>
    </aside>
  )
}
