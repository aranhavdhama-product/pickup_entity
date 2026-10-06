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
import { ChevronsLeft, ChevronsRight, Pin, type LucideIcon } from 'lucide-react'
import { shellRowClass } from './shellClasses'

/** "pin the rail open" survives navigation and reload — without it, expanding a rail a
 *  route auto-collapses (Grow's order creation) would just snap shut on the next visit. */
const PINNED_OPEN_KEY = 'fe-shell-sidebar-pinned-open'
function loadPinnedOpen(): boolean { try { return localStorage.getItem(PINNED_OPEN_KEY) === '1' } catch { return false } }
function savePinnedOpen(v: boolean) { try { localStorage.setItem(PINNED_OPEN_KEY, v ? '1' : '0') } catch { /* private mode */ } }

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
export function ShellSidebar({ items, activeId, homeTo = '/', footer, defaultCollapsed, hoverExpand }: {
  items: ShellNavItem[]
  activeId: string
  homeTo?: string
  /** rendered under a hairline at the rail's foot; told whether the rail is collapsed */
  footer?: (collapsed: boolean) => ReactNode
  /** starts narrow (icon-only) instead of the usual always-expanded default — the caller
   *  decides this per route (e.g. Grow collapses on order creation / the main list) */
  defaultCollapsed?: boolean
  /** while collapsed, hovering the rail shows the full nav as a floating overlay (fixed
   *  width, elevated z-index) instead of pushing the page's content out of the way */
  hoverExpand?: boolean
}) {
  const [localCollapsed, setLocalCollapsed] = useState(!!defaultCollapsed)
  const [pinnedOpen, setPinnedOpen] = useState(loadPinnedOpen)
  const [hovering, setHovering] = useState(false)
  /* a pin beats the route's own default — it's how "stay expanded" survives
     navigating back into a route that would otherwise auto-collapse it */
  const collapsed = pinnedOpen ? false : localCollapsed
  const floating = !!hoverExpand && collapsed && hovering
  /* the layout that renders this rail persists across routes (only its <Outlet/> swaps),
     so defaultCollapsed must be re-applied whenever the caller's own route-based value
     changes — a plain useState initializer only fires once, on first mount (adjusted
     during render, not in an effect, so the rail never paints in the old width first) */
  const [appliedDefault, setAppliedDefault] = useState(!!defaultCollapsed)
  if (appliedDefault !== !!defaultCollapsed) {
    setAppliedDefault(!!defaultCollapsed)
    setLocalCollapsed(!!defaultCollapsed)
  }

  /* expanding against a route that wants it collapsed pins it open (persisted); expanding
     where it was already the default needs no pin. Collapsing always clears any pin. */
  const expand = () => { setLocalCollapsed(false); if (defaultCollapsed) { setPinnedOpen(true); savePinnedOpen(true) } }
  const collapse = () => { setLocalCollapsed(true); setPinnedOpen(false); savePinnedOpen(false) }

  /* `preview` = the hover overlay: its header button keeps the rail open instead of
     collapsing it (the rail underneath is already collapsed, and the overlay covers its
     own Expand button, so this is the only way to pin it with a mouse) */
  const railBody = (expanded: boolean, preview = false) => (
    <>
      <div className="flex min-h-[56px] items-center justify-between border-b border-line px-4 py-3">
        {expanded ? (
          <>
            <Link to={homeTo} className="flex items-center gap-2">
              <img src="/fareye-logo.png" alt="" className="h-7 w-7 object-contain" draggable={false} />
              <span className="text-[15px] font-bold tracking-tight text-ink">FarEye</span>
            </Link>
            {preview ? (
              <button onClick={() => { expand(); setHovering(false) }} aria-label="Keep sidebar open" title="Keep sidebar open"
                className="rounded p-1 text-ink-3 hover:bg-warm-100">
                <Pin size={15} />
              </button>
            ) : (
              <button onClick={collapse} aria-label="Collapse sidebar" title={pinnedOpen ? 'Collapse (currently pinned open)' : 'Collapse sidebar'}
                className="rounded p-1 text-ink-3 hover:bg-warm-100">
                <ChevronsLeft size={16} />
              </button>
            )}
          </>
        ) : (
          <button onClick={expand} aria-label="Expand sidebar" title={defaultCollapsed ? 'Pin the sidebar open' : 'Expand sidebar'}
            className="mx-auto rounded p-1.5 text-ink-3 hover:bg-warm-100">
            <ChevronsRight size={16} />
          </button>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto py-2">
        {items.map(({ id, label, suffix, icon, path, title }) => {
          const full = title ?? (suffix ? `${label} (${suffix})` : label)
          const active = id === activeId
          const body = <ShellRowBody icon={icon} label={label} suffix={suffix} active={active} collapsed={!expanded} />
          return path ? (
            <Link key={id} to={path} title={full} aria-label={!expanded ? full : undefined}
              className={shellRowClass(active, !expanded)}>
              {body}
            </Link>
          ) : (
            <button key={id} type="button" title={full} aria-label={!expanded ? full : undefined}
              className={`${shellRowClass(false, !expanded)} cursor-default`}>
              {body}
            </button>
          )
        })}
      </nav>

      {footer && <div className="border-t border-line py-2">{footer(!expanded)}</div>}
    </>
  )

  return (
    <aside
      onMouseEnter={() => { if (hoverExpand && collapsed) setHovering(true) }}
      onMouseLeave={() => setHovering(false)}
      className={`flex flex-shrink-0 flex-col border-r border-line bg-surface transition-all duration-200
        ${collapsed ? 'w-14' : 'w-[256px]'}`}
      style={{ height: '100vh', position: 'sticky', top: 0 }}
    >
      {railBody(!collapsed)}
      {/* the hover preview — a separate overlay, not a resize, so the page underneath
          never reflows when it appears or retracts */}
      {floating && (
        <div className="absolute left-0 top-0 z-[60] flex h-full w-[256px] flex-col border-r border-line bg-surface shadow-ds-overlay">
          {railBody(true, true)}
        </div>
      )}
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
