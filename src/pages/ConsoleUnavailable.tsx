/**
 * What `/console/*` renders in a PRODUCTION build.
 *
 * The console is staging-backed: every page on it reads through the `/staging`
 * Vite proxy, which exists only in the dev server. Deployed, those requests have
 * nowhere to go — so the login bounce it used to show was a door to a room that
 * is not there. Saying so once is kinder than an auth loop.
 *
 * Dev builds never reach this: the real console routes are mounted instead.
 */
import { Link } from 'react-router-dom'

export default function ConsoleUnavailable() {
  return (
    <main className="fe-nueva flex min-h-screen items-center justify-center bg-canvas p-6">
      <div className="max-w-md text-center">
        <h1 className="text-[18px] font-bold text-ink">
          The staging-backed console runs only in the local dev server.
        </h1>
        <p className="mt-2 text-[13.5px] leading-relaxed text-ink-2">
          Its pages read through the <code>/staging</code> proxy, which this deployment has no
          access to. The local app needs no session and works here.
        </p>
        <Link to="/local/pending-for-planning"
          className="mt-5 inline-flex h-9 items-center rounded-md bg-brand-500 px-4 text-[13.5px] font-bold text-white hover:bg-brand-600">
          Open the local app
        </Link>
      </div>
    </main>
  )
}
