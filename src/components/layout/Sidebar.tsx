import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link, useLocation } from 'react-router-dom'
import { CalendarClock, ChevronDown, ChevronsLeft, ChevronsRight, Smartphone, Store } from 'lucide-react'
import { navItems, type NavItem } from '../../config/navigation'

const NAV_ITEMS: NavItem[] = navItems

/**
 * Surfaces that live OUTSIDE the console — the local app and the standalone demo
 * shells. They have their own shell and no session, so they open in a new tab
 * rather than navigating this one away.
 */
const DEMO_LINKS = [
  { href: '/local/pending-for-planning', label: 'Local app', icon: CalendarClock },
  { href: '/grow', label: 'Grow (merchant)', icon: Store },
  { href: '/driver', label: 'Driver app', icon: Smartphone },
]

interface SidebarProps {
  collapsed: boolean
  onToggle: () => void
}

function NavItemRow({ item, depth = 0, activeId }: {
  item: NavItem
  depth?: number
  activeId: string
}) {
  const childIsActive = item.children?.some(
    c => c.id === activeId || c.children?.some(cc => cc.id === activeId)
  ) ?? false
  const [open, setOpen] = useState(childIsActive)
  const hasChildren = item.children && item.children.length > 0
  const isActive = item.id === activeId
  const Icon = item.icon

  // Parent rows with children: collapsible header
  if (hasChildren) {
    const indicateActive = childIsActive || isActive
    return (
      <div>
        <button
          onClick={() => setOpen(v => !v)}
          className={`mx-2 my-0.5 w-[calc(100%-1rem)] flex items-center gap-3 px-3 py-2 rounded-md text-left text-[14px] font-medium transition-colors
            ${indicateActive ? 'text-[#E84E1B]' : 'text-gray-700 hover:bg-gray-50'}`}
        >
          {Icon && depth === 0 && (
            <Icon size={17} strokeWidth={1.75} className={indicateActive ? 'text-[#E84E1B]' : 'text-gray-500'} />
          )}
          <span className="flex-1">{item.label}</span>
          <ChevronDown
            size={14}
            className={`text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`}
          />
        </button>
        {open && (
          <div className="relative ml-[26px] pl-3 border-l border-gray-200">
            {item.children!.map(child => (
              <NavItemRow
                key={child.id}
                item={child}
                depth={depth + 1}
                activeId={activeId}
              />
            ))}
          </div>
        )}
      </div>
    )
  }

  // Leaf rows
  const className = `mx-2 my-0.5 flex items-center gap-3 px-3 py-2 rounded-md text-[14px] transition-colors
    ${isActive
      ? 'bg-[#FFEDE5] text-[#E84E1B] font-semibold'
      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
    }`

  const content = (
    <>
      {Icon && depth === 0 && (
        <Icon size={17} strokeWidth={1.75} className={isActive ? 'text-[#E84E1B]' : 'text-gray-500'} />
      )}
      <span className="flex-1 truncate">{item.label}</span>
    </>
  )

  if (item.path) {
    return (
      <Link to={item.path} title={item.label} className={className}>
        {content}
      </Link>
    )
  }

  return (
    <button className={className + ' w-[calc(100%-1rem)] text-left'} title={item.label} type="button">
      {content}
    </button>
  )
}

export default function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const location = useLocation()

  // The nav scrolls vertically, which makes overflow-x clip too — so an absolutely
  // positioned label would be cut off by the 56px rail. A fixed-position tooltip
  // placed from the hovered row's measured rect escapes that clipping.
  const [tip, setTip] = useState<{ label: string; top: number } | null>(null)

  const showTip = (label: string) => (e: React.MouseEvent<HTMLElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    setTip({ label, top: r.top + r.height / 2 })
  }

  // navigation (or expanding the rail) must never leave a tooltip pinned over content
  useEffect(() => { setTip(null) }, [location.pathname, collapsed])

  const toggle = () => {
    setTip(null)
    onToggle()
  }

  const getActiveId = () => {
    const p = location.pathname
    // Settings owns a whole sub-tree (/settings/masters/...), so match on the prefix
    // rather than the last segment, which would be a category or sub-master id.
    if (p.startsWith('/console/settings')) return 'settings'
    if (p.includes('/intelligent-dispatch')) return 'intelligent-dispatch'
    // Pickup Request owns /add and /:id below it — match on the prefix, not the leaf
    if (p.includes('/pickup-request')) return 'pickup-request'
    if (p === '/console') return 'dashboard'
    const seg = p.split('/').pop() ?? ''
    return seg
  }

  const activeId = getActiveId()

  return (
    <aside
      className={`flex flex-col bg-white border-r border-gray-200 transition-all duration-200 flex-shrink-0
        ${collapsed ? 'w-14' : 'w-[240px]'}`}
      style={{ height: '100vh', position: 'sticky', top: 0 }}
    >
      {/* Logo */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 min-h-[56px]">
        {!collapsed ? (
          <>
            <div className="flex items-center gap-2">
              <FarEyeLogo />
              <span className="font-bold text-gray-800 text-[15px] tracking-tight">FarEye</span>
            </div>
            <button
              onClick={toggle}
              className="p-1 rounded hover:bg-gray-100 text-gray-400"
              aria-label="Collapse sidebar"
            >
              <ChevronsLeft size={16} />
            </button>
          </>
        ) : (
          <button
            onClick={toggle}
            className="mx-auto p-1.5 rounded hover:bg-gray-100 text-gray-400"
            aria-label="Expand sidebar"
          >
            <ChevronsRight size={16} />
          </button>
        )}
      </div>

      {/* Nav Items */}
      <nav className="flex-1 overflow-y-auto py-2" onScroll={() => tip && setTip(null)}>
        {!collapsed && NAV_ITEMS.map(item => (
          <NavItemRow key={item.id} item={item} activeId={activeId} />
        ))}
        {collapsed && NAV_ITEMS.map(item => {
          const Icon = item.icon
          if (!Icon) return null
          const isActive = item.id === activeId ||
            item.children?.some(c => c.id === activeId)
          // A collapsed parent has no room to expand, so it jumps to its first navigable child.
          const target = item.path ?? item.children?.find(c => c.path)?.path
          const className = `flex justify-center py-2.5 transition-colors
            ${isActive ? 'text-[#E84E1B] bg-[#FFEDE5]' : 'text-gray-500 hover:text-[#E84E1B] hover:bg-gray-50'}`

          const hover = {
            onMouseEnter: showTip(item.label),
            onMouseLeave: () => setTip(null),
            onClick: () => setTip(null),
          }

          if (target) {
            return (
              <Link key={item.id} to={target} aria-label={item.label} className={className} {...hover}>
                <Icon size={18} strokeWidth={1.75} />
              </Link>
            )
          }
          return (
            <div key={item.id} aria-label={item.label} className={className} {...hover}>
              <Icon size={18} strokeWidth={1.75} />
            </div>
          )
        })}
      </nav>

      {/* Demo surfaces — they render outside the app Layout (own shell, no session),
          so they open in a new tab rather than navigating this one away. */}
      <div className="border-t border-gray-100 py-2">
        {!collapsed && (
          <p className="px-5 pt-1 pb-1 text-[10.5px] font-bold uppercase tracking-wide text-gray-400">Demos</p>
        )}
        {DEMO_LINKS.map(({ href, label, icon: Icon }) => {
          const className = collapsed
            ? 'flex justify-center py-2.5 text-gray-500 transition-colors hover:bg-gray-50 hover:text-[#E84E1B]'
            : 'mx-2 my-0.5 flex items-center gap-3 rounded-md px-3 py-2 text-[14px] text-gray-600 transition-colors hover:bg-gray-50 hover:text-gray-900'
          const hover = collapsed
            ? { onMouseEnter: showTip(label), onMouseLeave: () => setTip(null), onClick: () => setTip(null) }
            : {}
          return (
            <a key={href} href={href} target="_blank" rel="noreferrer"
              title={label} aria-label={label} className={className} {...hover}>
              <Icon size={collapsed ? 18 : 17} strokeWidth={1.75} className={collapsed ? '' : 'text-gray-500'} />
              {!collapsed && <span className="flex-1 truncate">{label}</span>}
            </a>
          )
        })}
      </div>

      {/* portal to <body>: the sticky aside forms a stacking context, so a fixed
          tooltip rendered inside it can sink under page content (tables, filters).
          At body level with z-[90] it always sits above the page. */}
      {collapsed && tip && createPortal(
        <div
          role="tooltip"
          style={{ top: tip.top, left: 56 }}
          className="fixed z-[90] ml-2 -translate-y-1/2 pointer-events-none whitespace-nowrap rounded-md
            bg-gray-900 px-2.5 py-1.5 text-[12px] font-medium text-white shadow-lg"
        >
          {tip.label}
        </div>,
        document.body,
      )}
    </aside>
  )
}

function FarEyeLogo() {
  return (
    <img
      src="/fareye-logo.png"
      alt="FarEye"
      className="w-7 h-7 object-contain"
      draggable={false}
    />
  )
}
