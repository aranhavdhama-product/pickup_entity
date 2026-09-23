/**
 * The console's auth boundary, as a LAYOUT ROUTE.
 *
 * `AuthProvider` probes the dev middleware for a staging session the moment it
 * mounts. Wrapping the whole `<Routes>` in it — which is what this app used to
 * do — meant every page, including the sessionless local ones, fired that probe
 * and depended on dev-only middleware. Mounting it here instead means the
 * provider exists ONLY while a `/console/*` route is matched: `/local/*`,
 * `/grow/*`, `/driver` and the app chooser render with no provider, no probe and
 * no `/staging` request at all.
 *
 * Invariant this enforces: nothing under `src/local` (or the local pages) may
 * import from `src/auth`.
 */
import { Outlet } from 'react-router-dom'
import { AuthProvider } from '../auth/AuthContext'

export default function AuthShell() {
  return (
    <AuthProvider>
      <Outlet />
    </AuthProvider>
  )
}
