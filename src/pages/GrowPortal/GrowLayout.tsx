/**
 * Grow — the merchant-facing portal shell, rendered OUTSIDE the app Layout.
 *
 * A small vendor-SaaS app: a persistent branded top bar (wordmark + merchant
 * switcher) and a friendly left sidebar over a warm canvas, with the three Grow
 * surfaces nested under it via <Outlet/>. Deliberately lighter than the console —
 * same design tokens (Lato, warm neutrals, brand orange), none of the console chrome.
 *
 * Merchant selection is lifted here into a React context so it persists across
 * page navigations. The single <ToastHost/> also lives here (standalone routes
 * render no host of their own — see App.tsx), so pages must not mount their own.
 */
import { createContext, useContext, useMemo, useState } from 'react'
import { Link, Outlet, useLocation } from 'react-router-dom'
import {
  Boxes, ClipboardList, PackageOpen, ShoppingCart, type LucideIcon,
} from 'lucide-react'
import { MenuSelect } from '../../nueva/components'
import { ToastHost } from '../../nueva/toast'
import { MERCHANT_LIST, locationsForMerchant } from '../../pickup/seed'
import type { LocationInfo, MerchantInfo } from '../../pickup/seed'

/* --------------------------------------------------------------- context ---- */

interface GrowContextValue {
  merchantCode: string
  setMerchantCode: (code: string) => void
  merchant: MerchantInfo | undefined
  merchantName: string
  locations: LocationInfo[]
}

const GrowContext = createContext<GrowContextValue | null>(null)

/** Consume the shared merchant selection + resolved merchant/locations. */
export function useGrow(): GrowContextValue {
  const ctx = useContext(GrowContext)
  if (!ctx) throw new Error('useGrow must be used inside <GrowLayout>')
  return ctx
}

/* ------------------------------------------------------------------- nav ---- */

interface GrowNav {
  to: string
  label: string
  icon: LucideIcon
  hint: string
}

const NAV: GrowNav[] = [
  { to: '/grow/pickups', label: 'Raise Pickup', icon: PackageOpen, hint: 'Book a collection' },
  { to: '/grow/requests', label: 'My Requests', icon: ClipboardList, hint: 'Track every pickup' },
  { to: '/grow/consignments', label: 'My Consignments', icon: Boxes, hint: 'Browse your parcels' },
  { to: '/grow/orders', label: 'Orders (portal replica)', icon: ShoppingCart, hint: 'Book & manage shipments' },
]

function NavRow({ item, active, compact }: { item: GrowNav; active: boolean; compact?: boolean }) {
  const Icon = item.icon
  if (compact) {
    return (
      <Link to={item.to}
        className={`flex items-center gap-2 whitespace-nowrap rounded-full px-3.5 py-1.5 text-[13px] font-bold transition-colors
          ${active ? 'bg-brand-500 text-white' : 'bg-warm-100 text-ink-2 hover:bg-warm-200'}`}>
        <Icon size={15} strokeWidth={2} />
        {item.label}
      </Link>
    )
  }
  return (
    <Link to={item.to}
      className={`group mx-3 flex items-start gap-3 rounded-lg px-3 py-2.5 transition-colors
        ${active ? 'bg-brand-50 text-brand-600' : 'text-ink-2 hover:bg-warm-100'}`}>
      <Icon size={18} strokeWidth={active ? 2.25 : 1.9}
        className={`mt-0.5 shrink-0 ${active ? 'text-brand-500' : 'text-warm-500 group-hover:text-ink-2'}`} />
      <span className="min-w-0">
        <span className="block text-[14px] font-bold leading-tight">{item.label}</span>
        <span className={`mt-0.5 block text-[11.5px] leading-tight ${active ? 'text-brand-500/80' : 'text-ink-3'}`}>
          {item.hint}
        </span>
      </span>
    </Link>
  )
}

/* ---------------------------------------------------------------- layout ---- */

export default function GrowLayout() {
  const location = useLocation()
  const [merchantCode, setMerchantCode] = useState(MERCHANT_LIST[0].code)

  const ctx = useMemo<GrowContextValue>(() => {
    const merchant = MERCHANT_LIST.find((m) => m.code === merchantCode)
    return {
      merchantCode,
      setMerchantCode,
      merchant,
      merchantName: merchant?.name ?? merchantCode,
      locations: locationsForMerchant(merchantCode),
    }
  }, [merchantCode])

  const isActive = (to: string) => location.pathname === to || location.pathname.startsWith(to + '/')

  return (
    <GrowContext.Provider value={ctx}>
      <div className="fe-nueva flex min-h-screen flex-col bg-canvas">
        {/* branded top bar — wordmark + merchant switcher, persists across pages */}
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-line bg-surface px-5 py-3 shadow-ds-1 sm:px-6">
          <div className="flex items-baseline gap-2">
            <span className="text-[20px] font-black tracking-tight text-brand-500">Grow</span>
            <span className="hidden text-[12.5px] text-ink-3 sm:inline">Merchant pickup portal</span>
          </div>
          <div className="ml-auto flex items-center gap-2.5">
            <span className="hidden text-[12.5px] text-ink-3 sm:inline">Signed in as</span>
            <div className="w-52 sm:w-60">
              <MenuSelect
                value={merchantCode} options={MERCHANT_LIST.map((m) => m.code)}
                labels={(v) => MERCHANT_LIST.find((m) => m.code === v)?.name ?? v}
                onChange={setMerchantCode}
              />
            </div>
          </div>
        </header>

        {/* compact horizontal nav — shown below lg where the sidebar is hidden */}
        <div className="flex gap-2 overflow-x-auto border-b border-line bg-surface px-4 py-2.5 lg:hidden">
          {NAV.map((item) => <NavRow key={item.to} item={item} active={isActive(item.to)} compact />)}
        </div>

        <div className="mx-auto flex w-full max-w-[1360px] flex-1">
          {/* left sidebar — friendlier than the console rail, own component */}
          <aside className="sticky top-[57px] hidden h-[calc(100vh-57px)] w-[248px] shrink-0 flex-col border-r border-line bg-surface/60 py-4 lg:flex">
            <p className="px-6 pb-2 text-[10.5px] font-black uppercase tracking-[0.08em] text-ink-3">Menu</p>
            <nav className="flex flex-col gap-0.5">
              {NAV.map((item) => <NavRow key={item.to} item={item} active={isActive(item.to)} />)}
            </nav>
            <div className="mt-auto mx-3 rounded-lg border border-line bg-warm-25 px-3.5 py-3">
              <p className="text-[12px] font-bold text-ink">Need a hand?</p>
              <p className="mt-1 text-[11.5px] leading-snug text-ink-3">
                Raise a pickup and our dispatch team plans it onto a route automatically.
              </p>
            </div>
          </aside>

          <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">
            <Outlet />
          </main>
        </div>

        <ToastHost />
      </div>
    </GrowContext.Provider>
  )
}
