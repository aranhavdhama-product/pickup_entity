/**
 * Grow merchant portal shell — the SAME shell as the local console (spec §15):
 * the shared `src/local/shell.tsx` rail (white, FarEye mark, the console's nav
 * item styling) and canvas-coloured title bar (page title left, the merchant
 * switcher ⇄ right). `fe-nueva` applies Lato; the accent is the design
 * system's brand orange.
 *
 * The root sets the `--pfp-*` tokens and imports the local chrome stylesheet,
 * because `/grow/orders` can be the first page loaded (LocalLayout, which
 * normally imports it, may never mount).
 *
 * This is also the ONE place the FarEye masters are loaded (`loadMasters()` on
 * mount) and where the portal's "signed-in merchant" is chosen — the header's ⇄
 * button. Everything downstream reads `useMasters()` / `useMerchantCode()`.
 * The masters layer goes through the dev proxy, which injects the cookie
 * server-side — nothing here imports `src/auth`.
 */
import { useCallback, useEffect, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import {
  ArrowLeftRight, BookUser, Check, CircleHelp, ClipboardList, FileBarChart2, LayoutDashboard, MapPinned,
  PackageCheck, Receipt, Settings, ShoppingCart, Truck, Wallet,
} from 'lucide-react'
import { currentMerchant, loadMasters, setMerchantCode, useMasters, useMerchantCode } from '../../growOrders/masters'
import { useOutside } from './utils'
import { ToastHost, toast } from '../../nueva/toast'
import { ShellHeader, ShellSidebar, type ShellNavItem } from '../../local/shell'
import '../../local/chrome.css'
import { cssVars } from '../LocalPFP/stagingTokens'

const OFF = 'Not part of this prototype'
const NAV: ShellNavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, title: OFF },
  { id: 'shipments', label: 'Shipments', icon: ShoppingCart, path: '/grow/orders' },
  { id: 'pickups', label: 'Pickup Requests', icon: PackageCheck, path: '/grow/orders/pickups' },
  { id: 'tracking', label: 'Tracking', icon: MapPinned, title: OFF },
  { id: 'quote', label: 'Get Quote', icon: Truck, title: OFF },
  { id: 'wallet', label: 'Wallet', icon: Wallet, title: OFF },
  { id: 'address-book', label: 'Address Book', icon: BookUser, title: OFF },
  { id: 'reports', label: 'Reports', icon: FileBarChart2, title: OFF },
  { id: 'billing', label: 'Billing', icon: Receipt, title: OFF },
  { id: 'disputes', label: 'Disputes', icon: ClipboardList, title: OFF },
  { id: 'settings', label: 'Settings', icon: Settings, title: OFF },
  { id: 'help', label: 'Help Center', icon: CircleHelp, title: OFF },
]

/* longest prefix wins — '/grow/orders/pickups' lights Pickup Requests only.
 * Like the local console, the title bar names the SECTION; a detail or add page
 * draws its own PageHeader (with the back button) underneath. */
const TITLES: [string, string, string][] = [
  ['/grow/orders/pickups', 'Pickup Requests', 'pickups'],
  ['/grow/orders', 'Consignment Order', 'shipments'],
]

function routeOf(pathname: string): { title: string; nav: string } {
  for (const [prefix, title, nav] of TITLES) {
    if (pathname === prefix || pathname.startsWith(prefix + '/')) {
      return { title, nav }
    }
  }
  return { title: 'Consignment Order', nav: 'shipments' }
}

/** The list pages draw the console's own canvas + padding (`LocalPage`); the rest keep a gutter. */
const LIST_PAGES = ['/grow/orders', '/grow/orders/pickups']

function MerchantSwitcher() {
  const masters = useMasters()
  const merchantCode = useMerchantCode()
  const merchant = currentMerchant(masters.merchants, merchantCode)
  const [open, setOpen] = useState(false)
  const close = useCallback(() => setOpen(false), [])
  const ref = useOutside(close)

  const pick = (m: { code: string; name: string }) => {
    setOpen(false)
    if (m.code === merchant?.code) return
    setMerchantCode(m.code)
    toast.info(`Signed in as ${m.name}`)
  }

  /* one muted line under the list saying where the merchant list came from */
  const sourceHint = masters.loading ? 'Loading masters…'
    : masters.source === 'live' ? `Location Master · live${masters.sampleFallbacks.length ? ` · sample ${masters.sampleFallbacks.join(', ')}` : ''}`
    : masters.source === 'live-cached' ? `Last loaded ${masters.loadedAt ? new Date(masters.loadedAt).toLocaleString() : 'earlier'}`
    : null

  return (
    <div ref={ref} className="relative flex items-center gap-2">
      {merchant && <span className="max-w-[220px] truncate text-[13px] font-bold text-ink-2" title={merchant.code}>{merchant.name}</span>}
      <button type="button" title={`Switch merchant${merchant ? ` (${merchant.name})` : ''}`} aria-label="Switch merchant"
        onClick={() => setOpen((v) => !v)} aria-haspopup="menu" aria-expanded={open}
        className="rounded p-1.5 text-gray-400 hover:bg-gray-50 hover:text-gray-600">
        <ArrowLeftRight size={18} />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-[40px] z-50 w-[280px] overflow-hidden rounded-xl border border-line bg-surface py-1.5 shadow-ds-overlay">
          <p className="px-4 pb-1 pt-1 text-[11px] font-bold uppercase tracking-wide text-ink-3">Switch merchant</p>
          <div className="max-h-[280px] overflow-y-auto">
            {masters.merchants.map((m) => {
              const on = m.code === merchant?.code
              return (
                <button key={m.code} type="button" role="menuitemradio" aria-checked={on} onClick={() => pick(m)}
                  className={`flex w-full items-center gap-2 px-4 py-2 text-left hover:bg-warm-50 ${on ? 'bg-brand-50' : ''}`}>
                  <Check size={15} className={`shrink-0 text-brand-500 ${on ? '' : 'invisible'}`} />
                  <span className="min-w-0 flex-1">
                    <span className={`block truncate text-[13px] ${on ? 'font-bold text-brand-500' : 'text-ink'}`}>{m.name}</span>
                    <span className="block truncate text-[12px] text-ink-3">{m.code}</span>
                  </span>
                </button>
              )
            })}
          </div>
          <div className="mt-1 border-t border-line px-4 pb-1 pt-2 text-[12px] leading-[1.45] text-ink-3">
            {sourceHint ?? (
              <>Sample data — <a href="/console/login" className="font-bold text-brand-500 hover:underline">sign in at /console/login</a> to load live masters</>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default function GrowOrdersLayout() {
  const { pathname } = useLocation()
  const route = routeOf(pathname)
  const listPage = LIST_PAGES.includes(pathname.replace(/\/$/, ''))

  /* the masters load once per app load, from this one mount — the Create
     Consignment form reads the same store and never fetches for itself */
  useEffect(() => { void loadMasters() }, [])

  return (
    <div className="fe-nueva flex h-screen overflow-hidden bg-canvas" style={cssVars}>
      <ShellSidebar items={NAV} activeId={route.nav} homeTo="/grow/orders" />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <ShellHeader title={route.title} right={<MerchantSwitcher />} />
        <main className="flex-1 overflow-auto">
          {listPage ? <Outlet /> : <div className="px-6 pb-10 pt-2"><Outlet /></div>}
        </main>
      </div>
      <ToastHost />
    </div>
  )
}
