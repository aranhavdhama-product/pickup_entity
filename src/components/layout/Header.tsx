import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { ChevronDown, ChevronLeft, ChevronRight, LogOut, UserRound } from 'lucide-react'
import { useAuth } from '../../auth/AuthContext'
import { fullName, initials } from '../../auth/authApi'

const breadcrumbMap: Record<string, string> = {
  '': 'Home',
  'console': 'Home',
  'order-management': 'Order Management',
  'intelligent-dispatch': 'Intelligent Dispatch',
  'route-dispatch': 'Route & Dispatch',
  'same-next-day-routing': 'Same/Next Day Routing',
  'pending-deliveries': 'Pending Deliveries',
  'pd-pickup': 'PD Pickup',
  'pd': 'PD',
  'roster': 'Roster',
  'completed': 'Completed',
  'tp': 'TP',
  'territory-planning': 'Territory Planning',
  'city-branch': 'City & Branch',
  'consignment-order': 'Consignment Order',
  'pickup-request': 'Pickup Request',
  'add': 'Add Consignment',
  'edit': 'Edit Consignment',
  'settings': 'Settings',
  'masters': 'Masters',
  'my-network-new': 'My Network',
}

const pageTitle: Record<string, string> = {
  '/console': 'Dashboard',
  '/console/order-management/intelligent-dispatch': 'Intelligent Dispatch',
  '/console/order-management/intelligent-dispatch/route-dispatch': 'Route & Dispatch',
  '/console/order-management/intelligent-dispatch/same-next-day-routing': 'Same/Next Day Routing',
  '/console/order-management/pickup-request/add': 'Add Pickup Request',
}

/**
 * `add`/`edit`/`:id` mean different things under different parents — a raw
 * segment lookup would label the Pickup Request form "Add Consignment".
 */
function segmentLabel(seg: string, parent: string | undefined): string | null {
  if (parent !== 'pickup-request') return null
  if (seg === 'add') return 'Add Pickup Request'
  if (seg === 'edit') return 'Edit Pickup Request'
  return seg // a PR id (PR-0001) reads better verbatim than prettified
}

/** Turns a URL segment into a label — handles `pd-pickup`, `network_location`, `OPS_DASHBOARD`. */
function prettify(seg: string): string {
  return seg
    .split(/[-_]/)
    .filter(Boolean)
    .map(w => w[0].toUpperCase() + w.slice(1).toLowerCase())
    .join(' ')
}

function AppsGridIcon({ size = 18 }: { size?: number }) {
  // 9-dot grid (Google-apps style)
  const dot = (cx: number, cy: number) => (
    <circle cx={cx} cy={cy} r="1.6" fill="currentColor" />
  )
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
      {dot(3, 3)}{dot(9, 3)}{dot(15, 3)}
      {dot(3, 9)}{dot(9, 9)}{dot(15, 9)}
      {dot(3, 15)}{dot(9, 15)}{dot(15, 15)}
    </svg>
  )
}

/** Logged-in user chip + dropdown (Profile / Sign out) driven by the real account. */
function UserMenu() {
  const { account, signOut } = useAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)

  const name = account ? fullName(account) : 'Account'
  const mono = account ? initials(account) : '··'
  const sub = account ? `@${account.login}${account.userTypeName ? ` · ${account.userTypeName}` : ''}` : ''

  const doSignOut = async () => { setOpen(false); await signOut(); navigate('/console/login', { replace: true }) }

  return (
    <div className="relative">
      <button onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded px-1.5 py-1 hover:bg-gray-50">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#EE5239] text-[12.5px] font-bold text-white">{mono}</span>
        <span className="hidden text-[14px] font-medium text-gray-700 sm:block">{name}</span>
        <ChevronDown size={14} className={`text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-11 z-50 w-60 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg">
            <div className="flex items-center gap-3 border-b border-gray-100 px-4 py-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#EE5239] text-[13px] font-bold text-white">{mono}</span>
              <div className="min-w-0">
                <p className="truncate text-[13.5px] font-bold text-gray-900">{name}</p>
                <p className="truncate text-[12px] text-gray-500">{sub}</p>
              </div>
            </div>
            <button onClick={() => { setOpen(false); navigate('/console/profile') }}
              className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-[13.5px] text-gray-700 hover:bg-gray-50">
              <UserRound size={15} className="text-gray-400" /> My profile
            </button>
            <button onClick={doSignOut}
              className="flex w-full items-center gap-2.5 border-t border-gray-100 px-4 py-2.5 text-left text-[13.5px] font-medium text-[#D43B22] hover:bg-brand-50">
              <LogOut size={15} /> Sign out
            </button>
          </div>
        </>
      )}
    </div>
  )
}

/**
 * Portal into the header's page-actions slot — lets a page park its own controls
 * (e.g. the Add form's Simplified/Full toggle) beside the title row instead of
 * spending a content row on them.
 */
export function HeaderActions({ children }: { children: React.ReactNode }) {
  const [el, setEl] = useState<HTMLElement | null>(null)
  useEffect(() => { setEl(document.getElementById('header-page-actions')) }, [])
  return el ? createPortal(children, el) : null
}

export default function Header() {
  const location = useLocation()
  const navigate = useNavigate()
  const segments = location.pathname.split('/').filter(Boolean)

  // Sub-pages (add / edit) get a back chevron beside the title, pointing at their parent.
  const subIdx = segments.findIndex((s) => s === 'add' || s === 'edit')
  const backPath = subIdx > 0 ? '/' + segments.slice(0, subIdx).join('/') : null

  const lastSegment = segments[segments.length - 1] ?? ''
  const title = pageTitle[location.pathname]
    || (location.pathname.startsWith('/console/settings') ? 'Custom Settings' : '')
    || segmentLabel(lastSegment, segments[segments.length - 2])
    || breadcrumbMap[lastSegment]
    || prettify(lastSegment)
    || 'Dashboard'


  const crumbs = segments.map((seg, i) => ({
    label: segmentLabel(seg, segments[i - 1]) || breadcrumbMap[seg] || prettify(seg),
    path: '/' + segments.slice(0, i + 1).join('/'),
  }))
  // never stack the same text twice: drop the leaf crumb when it repeats the title
  if (crumbs.length && crumbs[crumbs.length - 1].label === title) crumbs.pop()

  // Title with the breadcrumb trail stacked directly under it; fixed header
  // height so pages without crumbs (Dashboard) keep the identical rhythm.
  return (
    <header className="bg-canvas flex items-center justify-between px-6 min-h-[64px] flex-shrink-0">
      <div className="flex min-w-0 items-center gap-3">
        {backPath && (
          <button
            onClick={() => navigate(backPath)} aria-label="Back"
            className="h-8 w-8 shrink-0 inline-flex items-center justify-center rounded-md border border-line bg-surface text-ink-2 hover:bg-warm-100 shadow-ds-1 transition-colors">
            <ChevronLeft size={16} />
          </button>
        )}
        <div className="min-w-0">
        <h1 className="text-[20px] font-bold text-gray-900 leading-tight whitespace-nowrap">{title}</h1>
        {crumbs.length > 1 && (
          <nav className="flex items-center gap-1 mt-0.5 min-w-0 overflow-hidden">
            {crumbs.map((crumb, i) => (
              <span key={crumb.path} className="flex items-center gap-1 min-w-0">
                {i > 0 && <ChevronRight size={11} className="text-gray-400 shrink-0" />}
                {i < crumbs.length - 1 ? (
                  <Link to={crumb.path} className="text-[12px] text-gray-500 hover:text-[#E84E1B] whitespace-nowrap">
                    {crumb.label}
                  </Link>
                ) : (
                  <span className="text-[12px] text-gray-500 truncate">{crumb.label}</span>
                )}
              </span>
            ))}
          </nav>
        )}
        </div>
      </div>
      <div className="flex items-center gap-4 shrink-0">
        <div id="header-page-actions" className="flex items-center gap-3 empty:hidden" />
        <AppsButton />
        <UserMenu />
      </div>
    </header>
  )
}

/**
 * The 9-dot app switcher — staging only renders it when the account's
 * GET /app/rest/react/apps returns appEnable:true (prod0003 has it false,
 * so the real console shows no grid). We mirror that behavior.
 */
function AppsButton() {
  const [enabled, setEnabled] = useState(false)
  useEffect(() => {
    fetch('/staging/app/rest/react/apps')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setEnabled(!!d?.appEnable))
      .catch(() => setEnabled(false))
  }, [])
  if (!enabled) return null
  return (
    <button className="p-1.5 rounded hover:bg-warm-100 text-gray-500" title="Apps">
      <AppsGridIcon size={18} />
    </button>
  )
}
