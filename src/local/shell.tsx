/**
 * The ONE console shell — rail + title bar — shared by the LOCAL console
 * (`LocalSidebar` / `LocalHeader`) and the Grow merchant portal
 * (`GrowOrdersLayout`), so both portals read as the same product (spec §15).
 *
 * Deliberately data-free: each portal passes its own nav items, its own active
 * id, and its own footer / right-hand slot. This file imports nothing from
 * `src/auth`, `growOrders/masters` or anything that talks to `/staging`.
 *
 * WIDTH IS MEASURED, NOT CHOSEN: 256px is staging's own rail and 65px its
 * header plus rule (`stagingTokens.json`) — what puts the Pending For Planning
 * content origin at x=272, y=65. Do not change either here.
 */
import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ChevronsLeft, ChevronsRight, type LucideIcon } from 'lucide-react'
import { shellRowClass } from './shellClasses'

export interface ShellNavItem {
  id: string
  label: string
  icon: LucideIcon
  /** no path = an inert entry (a module not part of this prototype) */
  path?: string
  /** a muted word after the label (e.g. "replica") */
  suffix?: string
  /** tooltip override (defaults to the label) */
  title?: string
}

/** One rail row's inside: icon + label (+ muted suffix). */
export function ShellRowBody({ icon: Icon, label, suffix, active, collapsed }: {
  icon: LucideIcon; label: string; suffix?: string; active: boolean; collapsed: boolean
}) {
  if (collapsed) return <Icon size={18} strokeWidth={1.75} />
  return (
    <>
      <Icon size={17} strokeWidth={1.75} className={active ? 'text-brand-500' : 'text-ink-3'} />
      <span className="flex-1 truncate">
        {label}
        {suffix && <span className="ml-1 text-[12px] font-normal text-ink-3">{suffix}</span>}
      </span>
    </>
  )
}

/** The white left rail: FarEye mark, collapse toggle, nav, optional footer. */
export function ShellSidebar({ items, activeId, homeTo = '/', footer }: {
  items: ShellNavItem[]
  activeId: string
  homeTo?: string
  /** rendered under a hairline at the rail's foot; told whether the rail is collapsed */
  footer?: (collapsed: boolean) => ReactNode
}) {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <aside
      className={`flex flex-shrink-0 flex-col border-r border-line bg-surface transition-all duration-200
        ${collapsed ? 'w-14' : 'w-[256px]'}`}
      style={{ height: '100vh', position: 'sticky', top: 0 }}
    >
      <div className="flex min-h-[56px] items-center justify-between border-b border-line px-4 py-3">
        {!collapsed ? (
          <>
            <Link to={homeTo} className="flex items-center gap-2">
              <img src="/fareye-logo.png" alt="" className="h-7 w-7 object-contain" draggable={false} />
              <span className="text-[15px] font-bold tracking-tight text-ink">FarEye</span>
            </Link>
            <button onClick={() => setCollapsed(true)} aria-label="Collapse sidebar"
              className="rounded p-1 text-ink-3 hover:bg-warm-100">
              <ChevronsLeft size={16} />
            </button>
          </>
        ) : (
          <button onClick={() => setCollapsed(false)} aria-label="Expand sidebar"
            className="mx-auto rounded p-1.5 text-ink-3 hover:bg-warm-100">
            <ChevronsRight size={16} />
          </button>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto py-2">
        {items.map(({ id, label, suffix, icon, path, title }) => {
          const full = title ?? (suffix ? `${label} (${suffix})` : label)
          const active = id === activeId
          const body = <ShellRowBody icon={icon} label={label} suffix={suffix} active={active} collapsed={collapsed} />
          return path ? (
            <Link key={id} to={path} title={full} aria-label={collapsed ? full : undefined}
              className={shellRowClass(active, collapsed)}>
              {body}
            </Link>
          ) : (
            <button key={id} type="button" title={full} aria-label={collapsed ? full : undefined}
              className={`${shellRowClass(false, collapsed)} cursor-default`}>
              {body}
            </button>
          )
        })}
      </nav>

      {footer && <div className="border-t border-line py-2">{footer(collapsed)}</div>}
    </aside>
  )
}

/**
 * The canvas-coloured title bar: the page title on the left, the portal's own
 * controls on the right. 65px = staging's 64px header plus its 1px rule, so the
 * page's filter line lands at the measured y=81.
 */
export function ShellHeader({ title, right }: { title: string; right?: ReactNode }) {
  return (
    <header className="flex h-[65px] flex-shrink-0 items-center justify-between bg-canvas px-4">
      {/* measured: Lato 20/30, letter-spacing .3px, rgb(32,44,57) = ink, at x=272 */}
      <h1 className="text-[20px] font-bold leading-[30px] tracking-[0.3px] text-ink">{title}</h1>
      {right && <div className="flex items-center gap-4">{right}</div>}
    </header>
  )
}
