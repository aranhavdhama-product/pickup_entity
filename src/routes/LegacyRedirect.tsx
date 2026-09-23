/**
 * One-hop redirects for every URL this app answered before the console/local
 * split.
 *
 * The split moved the session-backed console under `/console/*` and the
 * sessionless surfaces under `/local/*`. Old links (bookmarks, the notes in
 * FAREYE-APIS.md, the screenshots in scratchpad) must still land — in ONE hop,
 * so a redirect never bounces through a guard that would then send the visitor
 * to the login screen.
 *
 * EXACT MATCHES FIRST. `/order-management/pending-planning` is a string prefix of
 * `/order-management/pending-planning-local`, and the two now live in different
 * apps (the pickup demo vs. the Pending For Planning replica) — a `startsWith`
 * rule would swallow the second into the first. Everything here is matched as a
 * whole path or as an explicit segment prefix with the boundary `/` included.
 */
import { Navigate, useLocation } from 'react-router-dom'

/** whole-path rewrites, checked before any prefix rule */
const EXACT: Record<string, string> = {
  '/login': '/console/login',
  '/profile': '/console/profile',
  '/order-management/pending-planning': '/local/pickup',
  '/order-management/pending-planning-local': '/local/pending-for-planning',
  '/order-management/pending-planning-local/columns': '/local/columns',
}

/** segment-prefix rewrites — the key always ends at a path boundary */
const PREFIX: [string, string][] = [
  ['/order-management/pending-planning-local/', '/local/pending-for-planning/'],
  ['/order-management/', '/console/order-management/'],
  ['/settings', '/console/settings'],
]

function legacyTarget(pathname: string): string | null {
  if (EXACT[pathname]) return EXACT[pathname]
  for (const [from, to] of PREFIX) {
    if (pathname === from.replace(/\/$/, '')) return to.replace(/\/$/, '')
    if (pathname.startsWith(from)) return to + pathname.slice(from.length)
  }
  return null
}

/**
 * Rendered by the legacy route entries in `routes.tsx`. It is deliberately NOT
 * inside the console's `AuthShell`: a redirect must not mount the auth provider,
 * because that would fire a `/staging` session probe on the way to a local page.
 */
export default function LegacyRedirect() {
  const { pathname, search, hash } = useLocation()
  const target = legacyTarget(pathname)
  return <Navigate to={(target ?? '/') + search + hash} replace />
}
