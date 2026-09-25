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
import { pickupPagesVisible, usePickupModuleConfig } from '../../config/pickupModule'
import {
  BookUser, Check, CircleHelp, ClipboardList, FileBarChart2, LayoutDashboard, MapPinned, Package, PackageCheck,
  Receipt, Settings, Truck, Wallet,
} from 'lucide-react'
import { currentMerchant, loadMasters, setMerchantCode, useMasters, useMerchantCode } from '../../growOrders/masters'
import { useOutside } from './utils'
import { ToastHost, toast } from '../../nueva/toast'
import { ShellHeader, ShellSidebar, type ShellNavItem } from '../../local/shell'
import '../../local/chrome.css'
import { cssVars } from '../LocalPFP/stagingTokens'

/* the portal's own menu (owner, 2026-09-24: keep every item; ONLY Pickup Requests
   follows the pickup module switch) */
const NAV: ShellNavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, path: '/grow/orders/dashboard' },
  { id: 'shipments', label: 'Consignment Order', icon: Package, path: '/grow/orders' },
  { id: 'pickups', label: 'Pickup Requests', icon: PackageCheck, path: '/grow/orders/pickups' },
  { id: 'tracking', label: 'Tracking', icon: MapPinned, path: '/grow/orders/tracking' },
  { id: 'quote', label: 'Get Quote', icon: Truck, path: '/grow/orders/quote' },
  { id: 'wallet', label: 'Wallet', icon: Wallet, path: '/grow/orders/wallet' },
  { id: 'address-book', label: 'Address Book', icon: BookUser, path: '/grow/orders/address-book' },
  { id: 'reports', label: 'Reports', icon: FileBarChart2, path: '/grow/orders/reports' },
  { id: 'billing', label: 'Billing', icon: Receipt, path: '/grow/orders/billing' },
  { id: 'disputes', label: 'Disputes', icon: ClipboardList, path: '/grow/orders/disputes' },
  { id: 'settings', label: 'Settings', icon: Settings, path: '/grow/orders/settings' },
  { id: 'help', label: 'Help Center', icon: CircleHelp, path: '/grow/orders/help' },
]

/* longest prefix wins — '/grow/orders/pickups' lights Pickup Requests only.
 * Like the local console, the title bar names the SECTION; a detail or add page
 * draws its own PageHeader (with the back button) underneath. */
const TITLES: [string, string, string][] = [
  ['/grow/orders/pickups', 'Pickup Requests', 'pickups'],
  /* Batch A pages */
  ['/grow/orders/dashboard', 'Dashboard', 'dashboard'],
  ['/grow/orders/tracking', 'Tracking', 'tracking'],
  ['/grow/orders/quote', 'Get Quote', 'quote'],
  ['/grow/orders/reports', 'Reports', 'reports'],
  ['/grow/orders/help', 'Help Center', 'help'],
  /* Batch B pages */
  ['/grow/orders/wallet', 'Payments', 'wallet'],
  ['/grow/orders/billing', 'Billing', 'billing'],
  ['/grow/orders/disputes', 'Disputes', 'disputes'],
  ['/grow/orders/address-book', 'Address Book', 'address-book'],
  ['/grow/orders/settings', 'Settings', 'settings'],
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

/** Every literal page slug under `/grow/orders/` — anything else in that single
 *  segment is an order id (`/grow/orders/:id` = the list with the order overlay). */
const PAGE_SLUGS = new Set([
  'add', 'checkout', 'pickups',
  'dashboard', 'tracking', 'quote', 'reports', 'help',
  'wallet', 'billing', 'disputes', 'address-book', 'settings',
])

function isOrderViewPath(path: string): boolean {
  const m = /^\/grow\/orders\/([^/]+)$/.exec(path)
  return !!m && !PAGE_SLUGS.has(m[1])
}

/** The list pages draw the console's own canvas + padding (`LocalPage`); the rest keep a gutter. */
const LIST_PAGES = ['/grow/orders', '/grow/orders/pickups', '/grow/orders/tracking', '/grow/orders/reports', '/grow/orders/reports/subscriptions',
  /* Batch B list pages (LocalPage) */
  '/grow/orders/wallet', '/grow/orders/billing', '/grow/orders/disputes', '/grow/orders/address-book', '/grow/orders/settings']

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
      {/* owner, 2026-09-25: no ⇄ arrow — the merchant name is the switcher */}
      <button type="button" title="Switch merchant" aria-label="Switch merchant"
        onClick={() => setOpen((v) => !v)} aria-haspopup="menu" aria-expanded={open}
        className="max-w-[240px] truncate rounded px-2 py-1.5 text-[13px] font-bold text-ink-2 hover:bg-warm-50 hover:text-ink">
        {merchant?.name ?? 'Merchant'}
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-[40px] z-50 w-[280px] overflow-hidden rounded-xl border border-line bg-surface py-1.5 shadow-ds-overlay">
          <p className="px-4 pb-1 pt-1 text-[11px] font-bold uppercase tracking-wide text-ink-3">Switch merchant</p>
          <div className="max-h-[280px] overflow-y-auto">
            {masters.merchants.map((m) => {
              const on = m.code === merchant?.code
              return (
                <button key={m.code} type="button" role="menuitemradio" aria-checked={on} onClick={() => pick(m)}
                  className={`flex w-full items-center gap-2 px-4 py-2 text-left hover:bg-warm-50 ${on ? 'bg-warm-50' : ''}`}>
                  <Check size={15} className={`shrink-0 text-brand-500 ${on ? '' : 'invisible'}`} />
                  <span className="min-w-0 flex-1">
                    <span className={`block truncate text-[13px] ${on ? 'font-bold text-ink' : 'text-ink'}`}>{m.name}</span>
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
  /* owner, 2026-09-24: with the pickup module OFF the merchant has no Pickup Requests page */
  const pickupOn = pickupPagesVisible(usePickupModuleConfig())
  const nav = pickupOn ? NAV : NAV.filter((i) => i.id !== 'pickups')
  const path = pathname.replace(/\/$/, '')
  /* `/grow/orders/:id` is the Shipments list with the View Consignment overlay open on it — same full-bleed chrome */
  const orderView = isOrderViewPath(path)
  const listPage = LIST_PAGES.includes(path) || orderView

  /* the masters load once per app load, from this one mount — the Create
     Consignment form reads the same store and never fetches for itself */
  useEffect(() => { void loadMasters() }, [])

  return (
    <div className="fe-nueva flex h-screen overflow-hidden bg-canvas" style={cssVars}>
      <ShellSidebar items={nav} activeId={route.nav} homeTo="/grow/orders" />
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
