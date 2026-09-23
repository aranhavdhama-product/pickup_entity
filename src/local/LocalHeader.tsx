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

/* Title only — this bar is measured at 65px (staging's 64 plus its 1px rule),
   which is what puts Pending For Planning's filter row at the measured y=81. */
const TITLES: [string, string][] = [
  ['/local/consignments', 'Consignment Order'],
  ['/local/pending-for-planning-replica', 'Pending For Planning'],
  ['/local/pending-for-planning', 'Pending For Planning'],
  ['/local/pickup', 'Pickup'],
  ['/local/control-tower', 'Control Tower'],
  ['/local/inbound', 'Inbound'],
  ['/local/settings/pickup', 'Pickup Request Settings'],
  ['/local/settings', 'Settings'],
  ['/local/columns', 'Column Configuration'],
  ['/local/changes', "What's Changed"],
]

function localTitle(pathname: string): string {
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
  const title = localTitle(pathname)
  return (
    <header /* 65px: staging's 64px header plus the 1px rule under it, so page content
         starts at y=65 and the filter row lands at the measured y=81 */
      className="flex h-[65px] flex-shrink-0 items-center justify-between bg-canvas px-4">
      {/* measured: Lato 20/30, letter-spacing .3px, rgb(32,44,57), at x=272 */}
      <h1 className="text-[20px] font-bold leading-[30px] tracking-[0.3px] text-[rgb(32,44,57)]">{title}</h1>
      <div className="flex items-center gap-4">
        <Link to="/" title="All apps" aria-label="All apps" className="rounded p-1.5 text-gray-400 hover:bg-gray-50 hover:text-gray-600">
          <AppsGridIcon />
        </Link>
        <span className="text-[13px] font-medium text-gray-500">Delivery Management</span>
      </div>
    </header>
  )
}
