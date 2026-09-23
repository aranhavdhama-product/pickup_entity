/**
 * `/` — the app chooser.
 *
 * One build now serves two apps that used to be tangled in one route tree:
 *
 *   • the CONSOLE (`/console/*`) — the staging-backed replica; needs a live
 *     session through the dev proxy, so it is useless without one.
 *   • the LOCAL app (`/local/*`) — the Pending For Planning replica, the pickup
 *     demo and the column configuration page, all running on local stores.
 *
 * The root used to be the console Dashboard, which meant opening the app with no
 * session bounced straight to a login screen. This page is the neutral landing
 * spot instead: it renders with no provider and issues no request.
 */
import { Link } from 'react-router-dom'

interface AppCard {
  to: string
  external?: boolean
  title: string
  blurb: string
  note: string
}

const APPS: AppCard[] = [
  {
    to: '/local/pending-for-planning',
    title: 'Local app',
    blurb: 'Pending For Planning replica, the pickup demo and column configuration.',
    note: 'No session needed — every row comes from the local stores.',
  },
  {
    to: '/console',
    title: 'FarEye console',
    blurb: 'The staging-backed console: consignments, dispatch planning, Custom Settings.',
    note: 'Needs a live staging session through the dev proxy.',
  },
  {
    to: '/grow/orders',
    external: true,
    title: 'Grow merchant portal',
    blurb: 'The merchant-side order book that feeds the local Pending For Planning queue.',
    note: 'Standalone shell, local order store.',
  },
  {
    to: '/driver',
    external: true,
    title: 'Driver app',
    blurb: 'The phone-sized driver surface.',
    note: 'Standalone shell, local data.',
  },
]

export default function AppChooser() {
  /* the console needs the `/staging` dev proxy, so a deployed build must not
     offer it — a card that leads somewhere unusable is worse than no card */
  const apps = APPS.filter((a) => !(a.to === '/console' && import.meta.env.PROD))
  return (
    <div className="fe-nueva min-h-screen bg-canvas px-6 py-14">
      <div className="mx-auto max-w-[880px]">
        <div className="flex items-center gap-3">
          <img src="/fareye-logo.png" alt="" className="h-9 w-9 object-contain" draggable={false} />
          <div>
            <h1 className="text-[22px] font-black leading-tight text-ink">FarEye UI prototype</h1>
            <p className="text-[13px] text-ink-3">Pick an app to open.</p>
          </div>
        </div>

        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {apps.map((a) => {
            const body = (
              <>
                <h2 className="text-[15px] font-bold text-ink">{a.title}</h2>
                <p className="mt-1.5 text-[13px] leading-snug text-ink-2">{a.blurb}</p>
                <p className="mt-3 text-[12px] text-ink-3">{a.note}</p>
              </>
            )
            const cls = 'block rounded-md border border-line bg-surface px-5 py-4 transition-colors hover:border-warm-300 hover:shadow-ds-1'
            return a.external
              ? <a key={a.to} href={a.to} target="_blank" rel="noreferrer" className={cls}>{body}</a>
              : <Link key={a.to} to={a.to} className={cls}>{body}</Link>
          })}
        </div>
      </div>
    </div>
  )
}
