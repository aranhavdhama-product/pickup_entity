/**
 * The LOCAL app's header bar.
 *
 * It owns the PAGE TITLE. On `/local/pending-for-planning` that is the whole
 * point: staging renders `Pending For Planning` once, in the chrome, and the
 * list below it starts straight at the filter row — so the page itself must not
 * draw a second title. The title map keeps staging's casing verbatim.
 *
 * The detail overlay (`/local/pending-for-planning/:id`) is an overlay, not a
 * page, so it keeps the list's title — exactly as staging does.
 *
 * No account chip, no sign-out: this app has no session and must not import
 * `src/auth`.
 */
import { Link, useLocation } from 'react-router-dom'
import { ShellHeader } from './shell'
import { readRoutingPlans, useRoutingPlans } from '../pages/LocalRouting/routingPlans'

/* Title only — this bar is measured at 65px (staging's 64 plus its 1px rule),
   which is what puts Pending For Planning's filter row at the measured y=81. */
const TITLES: [string, string][] = [
  ['/local/consignments', 'Consignment Order'],
  ['/local/pending-for-planning-replica', 'Pending For Planning'],
  ['/local/pending-for-planning', 'Pending For Planning'],
  ['/local/pickup', 'Pickup'],
  ['/local/control-tower', 'Control Tower'],
  ['/local/routing', 'Same/Next Day Routing'],
  ['/local/inbound', 'Inbound'],
  ['/local/settings/masters/service_order', 'Service & Order masters'],
  ['/local/settings/pickup', 'Pickup module'],
  ['/local/settings/general', 'General Settings'],
  ['/local/settings/consignment-order', 'Consignment Order'],
  ['/local/settings', 'Settings'],
  ['/local/columns', 'Column Configuration'],
  ['/local/changes', "What's Changed"],
]

/* staging titles its route page "Route & Dispatch | ORD | 17 Sep 2026" */
function routingPlanTitle(pathname: string): string | null {
  const m = /^\/local\/routing\/(\d+)$/.exec(pathname)
  if (!m) return null
  const p = readRoutingPlans().find((x) => x.id === m[1])
  if (!p) return 'Route & Dispatch'
  const d = new Date(`${p.dispatchDate}T00:00:00`)
  return `Route & Dispatch | ${p.hubCode} | ${d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}`
}

function localTitle(pathname: string): string {
  const plan = routingPlanTitle(pathname)
  if (plan) return plan
  for (const [prefix, title] of TITLES) {
    if (pathname === prefix || pathname.startsWith(prefix + '/')) return title
  }
  return 'Local'
}

function AppsGridIcon({ size = 18 }: { size?: number }) {
  const dot = (cx: number, cy: number) => <circle cx={cx} cy={cy} r="1.6" fill="currentColor" />
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
      {dot(3, 3)}{dot(9, 3)}{dot(15, 3)}
      {dot(3, 9)}{dot(9, 9)}{dot(15, 9)}
      {dot(3, 15)}{dot(9, 15)}{dot(15, 15)}
    </svg>
  )
}

export default function LocalHeader() {
  const { pathname } = useLocation()
  useRoutingPlans()   // re-render when a plan lands (its title is read from the store)
  return (
    <ShellHeader title={localTitle(pathname)} right={<>
      <Link to="/" title="All apps" aria-label="All apps" className="rounded p-1.5 text-ink-3 hover:bg-warm-50 hover:text-ink-2">
        <AppsGridIcon />
      </Link>
      <span className="text-[13px] font-normal text-ink-3">Delivery Management</span>
    </>} />
  )
}
