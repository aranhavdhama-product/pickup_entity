/**
 * Grow merchant portal — 1:1 shell replica of grow-staging.fareye.co
 * (Materio MUI template: 260px #28243D drawer, 64px transparent app bar over a
 * #F4F5FA canvas, Lato). Hosts the Orders replica pages under /grow/orders.
 * Deliberately separate from the pickup demo's own shell (GrowLayout).
 *
 * Drawer behaves like Materio's "Vertical nav": collapsible to a 68px icon rail
 * (persisted), hover-expands as an overlay while collapsed, auto-collapses below
 * 1200px and becomes a temporary drawer below 900px.
 *
 * This is also the ONE place the FarEye masters are loaded (`loadMasters()` on
 * mount) and where the portal's "signed-in merchant" is chosen — the header's ⇄
 * pill. Everything downstream reads `useMasters()` / `useMerchantCode()`.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, Outlet, useLocation } from 'react-router-dom'
import {
  ArrowLeftRight, Bell, BookUser, Check, ChevronRight, Circle, CircleDot, CircleHelp, ClipboardList,
  FileBarChart2, LayoutDashboard, Menu, PackageCheck, Receipt, Search, Settings, ShoppingCart, Truck,
  Wallet, MapPinned, type LucideIcon,
} from 'lucide-react'
import { currentMerchant, loadMasters, setMerchantCode, useMasters, useMerchantCode } from '../../growOrders/masters'
import { useOutside } from './utils'
import { ToastHost, toast } from '../../nueva/toast'

interface Nav { label: string; icon: LucideIcon; to?: string; children?: boolean }
const NAV: Nav[] = [
  { label: 'Dashboard', icon: LayoutDashboard },
  { label: 'Shipments', icon: ShoppingCart, to: '/grow/orders' },
  { label: 'Pickup Requests', icon: PackageCheck, to: '/grow/orders/pickups' },
  { label: 'Tracking', icon: MapPinned },
  { label: 'Get Quote', icon: Truck },
  { label: 'Wallet', icon: Wallet },
  { label: 'Address Book', icon: BookUser },
  { label: 'Reports', icon: FileBarChart2 },
  { label: 'Billing', icon: Receipt },
  { label: 'Disputes', icon: ClipboardList, children: true },
  { label: 'Settings', icon: Settings },
  { label: 'Help Center', icon: CircleHelp },
]

const COLLAPSE_KEY = 'grow-nav-collapsed'
type Mode = 'wide' | 'mid' | 'narrow'
const modeFor = (w: number): Mode => (w < 900 ? 'narrow' : w < 1200 ? 'mid' : 'wide')

function readBool(key: string) {
  try { return window.localStorage.getItem(key) === '1' } catch { return false }
}

/** The FarEye mark — the same asset the console's sidebar uses. */
function FarEyeMark() {
  return <img src="/fareye-logo.png" alt="" className="h-7 w-7 object-contain" draggable={false} />
}

export default function GrowOrdersLayout() {
  const { pathname } = useLocation()
  /* longest match wins — '/grow/orders/pickups' must light Pickup Requests only,
     not Order as well (both are prefixes of the path). */
  const matched = NAV
    .filter((n) => n.to && (pathname === n.to || pathname.startsWith(n.to + '/')))
    .sort((a, b) => (b.to as string).length - (a.to as string).length)[0]
  const active = (n: Nav) => !!n.to && n === matched

  /* --- nav state: persisted intent + viewport mode + transient hover ------- */
  const [userCollapsed, setUserCollapsed] = useState(() => readBool(COLLAPSE_KEY))
  const [mode, setMode] = useState<Mode>(() => modeFor(window.innerWidth))
  const [hovering, setHovering] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const hoverTimer = useRef<number | null>(null)

  useEffect(() => {
    const onResize = () => {
      const next = modeFor(window.innerWidth)
      setMode(next)
      if (next !== 'narrow') setDrawerOpen(false)
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => () => { if (hoverTimer.current) window.clearTimeout(hoverTimer.current) }, [])

  useEffect(() => {
    if (!drawerOpen) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setDrawerOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [drawerOpen])

  /* derived: the rail width (drives content margin) vs the aside width */
  const renderCollapsed = mode === 'mid' || (mode === 'wide' && userCollapsed)
  const asideExpanded = mode === 'narrow' || !renderCollapsed || hovering
  const overlaying = renderCollapsed && hovering

  const toggleNav = useCallback(() => {
    if (hoverTimer.current) { window.clearTimeout(hoverTimer.current); hoverTimer.current = null }
    const next = !renderCollapsed
    setUserCollapsed(next)
    setHovering(false)
    try { window.localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0') } catch { /* ignore */ }
  }, [renderCollapsed])

  const onRailEnter = () => {
    if (hoverTimer.current) { window.clearTimeout(hoverTimer.current); hoverTimer.current = null }
    if (renderCollapsed) setHovering(true)
  }
  const onRailLeave = () => {
    if (hoverTimer.current) window.clearTimeout(hoverTimer.current)
    hoverTimer.current = window.setTimeout(() => setHovering(false), 150)
  }

  /* --- signed-in merchant --------------------------------------------------
     The portal has no session of its own, so "who am I" is a choice made here
     and persisted. The masters load once per app load from this one mount — the
     Create Order form reads the same store and never fetches for itself. */
  const masters = useMasters()
  const merchantCode = useMerchantCode()
  const merchant = currentMerchant(masters.merchants, merchantCode)
  const [merchantOpen, setMerchantOpen] = useState(false)
  const closeMerchant = useCallback(() => setMerchantOpen(false), [])
  const merchantRef = useOutside(closeMerchant)

  useEffect(() => { void loadMasters() }, [])

  const pickMerchant = (m: { code: string; name: string }) => {
    setMerchantOpen(false)
    if (m.code === merchant?.code) return
    setMerchantCode(m.code)
    toast.info(`Signed in as ${m.name}`)
  }

  /* one muted line under the list saying where the merchant list came from */
  const sourceHint = masters.loading ? 'Loading masters…'
    : masters.source === 'live' ? `Location Master · live${masters.sampleFallbacks.length ? ` · sample ${masters.sampleFallbacks.join(', ')}` : ''}`
    : masters.source === 'live-cached' ? `Last loaded ${masters.loadedAt ? new Date(masters.loadedAt).toLocaleString() : 'earlier'}`
    : null

  const railClass = mode === 'narrow' ? 'ml-0' : renderCollapsed ? 'ml-[68px]' : 'ml-[260px]'

  return (
    <div className="fe-nueva min-h-screen bg-grow-canvas text-grow-ink" style={{
        fontFamily: 'Lato, Montserrat, -apple-system, system-ui, "Segoe UI", Helvetica, Arial, sans-serif',
        /* the console forces `antialiased` (thin on macOS); the real portal renders default
           subpixel smoothing, which is what makes its Lato read heavier — match it here */
        WebkitFontSmoothing: 'auto', MozOsxFontSmoothing: 'auto',
      }}>
      {/* backdrop (temporary drawer, <900px) */}
      {mode === 'narrow' && drawerOpen && (
        <div className="fixed inset-0 z-40 bg-[#3A3541]/70" onClick={() => setDrawerOpen(false)} aria-hidden />
      )}

      {/* drawer */}
      <aside
        onMouseEnter={onRailEnter}
        onMouseLeave={onRailLeave}
        className={`fixed inset-y-0 left-0 flex flex-col bg-grow-side transition-[width,transform] duration-200
          ${asideExpanded ? 'w-[260px]' : 'w-[68px]'}
          ${mode === 'narrow' ? `z-50 ${drawerOpen ? 'translate-x-0' : '-translate-x-full'}` : 'z-30 translate-x-0'}
          ${overlaying ? 'shadow-[0_8px_24px_rgba(58,53,65,0.18)]' : ''}`}
      >
        <div className={`flex h-[64px] items-center ${asideExpanded ? 'justify-between pl-[22px] pr-[18px]' : 'justify-center px-0'}`}>
          <div className="flex items-center gap-2.5">
            <FarEyeMark />
            {asideExpanded && (
              <span className="text-[16px] font-semibold tracking-[0.15px] text-grow-side-fg">FarEye</span>
            )}
          </div>
          {asideExpanded && (
            <button
              type="button"
              onClick={toggleNav}
              aria-expanded={!renderCollapsed}
              aria-label={renderCollapsed ? 'Expand menu' : 'Collapse menu'}
              title={renderCollapsed ? 'Expand menu' : 'Collapse menu'}
              className="text-grow-side-fg/80 hover:text-white"
            >
              {renderCollapsed ? <Circle size={20} /> : <CircleDot size={20} />}
            </button>
          )}
        </div>
        <nav className="mt-1 flex flex-col">
          {NAV.map((n) => {
            const Icon = n.icon
            const on = active(n)
            const shape = asideExpanded
              ? 'mr-[18px] gap-3 rounded-r-full pl-[22px] pr-[14px]'
              : 'mx-[13px] w-[42px] justify-center rounded-full'
            const cls = `group relative mt-[6px] flex h-[42px] items-center text-[16px] tracking-[0.15px] transition-colors ${shape}
              ${on ? 'bg-grow-accent-2 text-white shadow-[0_4px_8px_-4px_rgba(58,53,65,0.42)]' : 'text-grow-side-fg hover:bg-white/5'}`
            const body = (
              <>
                <Icon size={22} strokeWidth={1.7} className="shrink-0" />
                {asideExpanded ? (
                  <>
                    <span className="flex-1 truncate">{n.label}</span>
                    {n.children && <ChevronRight size={18} className="text-grow-side-fg/70" />}
                  </>
                ) : (
                  <span className="pointer-events-none absolute left-[52px] z-50 hidden whitespace-nowrap rounded bg-[#3A3541] px-2 py-1 text-[12px] text-white group-hover:block">
                    {n.label}
                  </span>
                )}
              </>
            )
            return n.to
              ? <Link key={n.label} to={n.to} className={cls} onClick={() => setDrawerOpen(false)}>{body}</Link>
              : <button key={n.label} type="button" title="Not part of this prototype" className={`${cls} text-left`}>{body}</button>
          })}
        </nav>
      </aside>

      {/* app bar + content */}
      <div className={`min-h-screen transition-[width,margin] duration-200 ${railClass}`}>
        <header className="flex h-[64px] items-center gap-2 px-6">
          {mode === 'narrow' && (
            <button type="button" aria-label="Open menu" onClick={() => setDrawerOpen(true)}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-grow-ink-2 hover:bg-grow-ink/5"><Menu size={22} /></button>
          )}
          <div className="flex min-w-0 items-center gap-2 text-grow-ink-2">
            <Search size={22} className="shrink-0" />
            <input placeholder="Track your consignment"
              className="w-[220px] min-w-0 bg-transparent text-[15px] text-grow-ink outline-none placeholder:text-grow-ink-2" />
          </div>
          <div className="ml-auto flex items-center gap-1">
            <div ref={merchantRef} className="relative mr-2">
              <button
                type="button" title={`Switch merchant${merchant ? ` (${merchant.name})` : ''}`}
                aria-label="Switch merchant"
                onClick={() => setMerchantOpen((v) => !v)}
                aria-haspopup="menu" aria-expanded={merchantOpen}
                className="flex h-10 w-10 items-center justify-center rounded-full text-grow-ink-2 hover:bg-grow-ink/5"
              >
                <ArrowLeftRight size={19} className="shrink-0" />
              </button>
              {merchantOpen && (
                <div role="menu" className="absolute right-0 top-[44px] z-50 w-[268px] overflow-hidden rounded-[6px] bg-white py-1 shadow-grow-menu">
                  <div className="px-3 pb-1 pt-1 text-[12px] uppercase tracking-[0.4px] text-grow-ink-3">Switch merchant</div>
                  <div className="max-h-[280px] overflow-y-auto">
                    {masters.merchants.map((m) => (
                      <button key={m.code} type="button" role="menuitemradio" aria-checked={m.code === merchant?.code}
                        onClick={() => pickMerchant(m)}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-grow-canvas">
                        <Check size={16} className={`shrink-0 text-grow-accent-2 ${m.code === merchant?.code ? '' : 'invisible'}`} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[15px] text-grow-ink">{m.name}</span>
                          <span className="block truncate text-[12.5px] text-grow-ink-2">{m.code}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                  <div className="border-t border-grow-outline px-3 pb-1 pt-1.5 text-[12px] leading-[1.45] text-grow-ink-3">
                    {sourceHint ?? (
                      <>Sample data — <a href="/console/login" className="text-grow-accent-2 hover:underline">sign in at /console/login</a> to load live masters</>
                    )}
                  </div>
                </div>
              )}
            </div>
            <button type="button" title="Notifications" className="flex h-10 w-10 items-center justify-center rounded-full text-grow-ink-2 hover:bg-grow-ink/5"><Bell size={21} /></button>
            <span className="relative ml-1 block h-10 w-10 rounded-full bg-[linear-gradient(135deg,#F7C7B3,#C97C68_55%,#5B3A2E)] ring-2 ring-white">
              <span className="absolute bottom-0 right-0 h-[10px] w-[10px] rounded-full border-2 border-white bg-grow-success" />
            </span>
          </div>
        </header>
        <main className="px-6 pb-10 pt-2">
          <Outlet />
        </main>
      </div>
      <ToastHost />
    </div>
  )
}
