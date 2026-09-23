import { readFileSync, writeFileSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { Agent as HttpsAgent } from 'node:https'
import { defineConfig, type Plugin, type ProxyOptions } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/**
 * Staging auth bridge.
 *
 * Our app runs at localhost:3000; staging.fareye.co sets an HttpOnly,
 * domain-locked session cookie the browser can't hold cross-origin — so the
 * dev proxy holds it server-side in `.staging-session` (git-ignored) and
 * injects it on every /staging/* request.
 *
 * The session is established ONLY by the in-app login form (POST
 * /app/authentication) — no manual cookie pasting. Staying logged in uses
 * staging's own refresh mechanism, not a keepalive hack:
 *   - The JSESSIONID JWT rotates via Set-Cookie; we persist each rotation.
 *   - With "Remember me", staging also sets a long-lived remember-me cookie.
 *     When the short JWT lapses, staging silently re-issues a fresh session
 *     from that cookie on the next request — that IS the refresh token.
 * When the refresh is truly exhausted staging returns 401/403; we then wipe
 * the stored session and the app routes back to /login.
 */
const SESSION_FILE = resolve(__dirname, '.staging-session')

function readSessionCookie(): string {
  try {
    return readFileSync(SESSION_FILE, 'utf8').trim().replace(/^Cookie:\s*/i, '')
  } catch {
    return ''
  }
}

function writeSessionCookie(cookie: string) {
  try { writeFileSync(SESSION_FILE, `${cookie}\n`, { mode: 0o600 }) } catch { /* fs unwritable */ }
}

function clearSession() {
  try { rmSync(SESSION_FILE) } catch { /* already gone */ }
}

function xsrfFrom(cookie: string): string {
  const m = cookie.match(/XSRF-TOKEN=([^;]+)/)
  return m ? m[1] : ''
}

const jwtExp = (token: string): string => {
  try {
    const p = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8')) as { exp?: number }
    return p.exp ? new Date(p.exp * 1000).toISOString() : '?'
  } catch { return '?' }
}

/**
 * Persist rotated/new session cookies from a staging response — this is the
 * refresh: it keeps the JSESSIONID current and captures the remember-me cookie.
 * Bootstraps from a cold state when a response first establishes a JSESSIONID
 * (i.e. the login response).
 */
function persistSetCookies(setCookies: string[]) {
  let cookie = readSessionCookie()
  const cold = !cookie
  if (cold) {
    const establishes = setCookies.some((sc) => /^\s*JSESSIONID=/.test(sc) && !/=(?:deleted|"")/.test(sc.split(';')[0]))
    if (!establishes) return
  }
  let changed = false
  for (const sc of setCookies) {
    const first = sc.split(';')[0]
    const eq = first.indexOf('=')
    if (eq <= 0) continue
    const name = first.slice(0, eq).trim()
    const value = first.slice(eq + 1).trim()
    if (!value || value === '""' || value === 'deleted') continue // deletions handled by clearSession
    const esc = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const re = new RegExp(`(^|;\\s*)${esc}=[^;]*`)
    if (cookie && re.test(cookie)) {
      const next = cookie.replace(re, `$1${name}=${value}`)
      if (next !== cookie) {
        cookie = next; changed = true
        if (name === 'JSESSIONID') console.log(`[staging-session] refreshed JSESSIONID — exp ${jwtExp(value)}`)
      }
    } else {
      cookie = cookie ? `${cookie}; ${name}=${value}` : `${name}=${value}`
      changed = true
      if (name === 'JSESSIONID') console.log(`[staging-session] ${cold ? 'login established' : 'added'} JSESSIONID — exp ${jwtExp(value)}`)
    }
  }
  if (changed) writeSessionCookie(cookie)
}

/** Session status + explicit clear (logout) — decodes the JWT for the UI. */
function sessionInfoPlugin(): Plugin {
  return {
    name: 'staging-session-info',
    configureServer(server) {
      // explicit logout from the app — wipe the stored session
      server.middlewares.use('/staging-session-clear', (_req, res) => {
        clearSession()
        console.log('[staging-session] cleared (logout)')
        res.setHeader('content-type', 'application/json')
        res.end(JSON.stringify({ cleared: true }))
      })
      server.middlewares.use('/staging-session-info', (_req, res) => {
        const cookie = readSessionCookie()
        const m = cookie.match(/(?:^|;\s*)JSESSIONID=([^;]+)/)
        let payload: Record<string, unknown> | null = null
        if (m) {
          try {
            const body = m[1].split('.')[1]
            payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
          } catch { /* unparseable token — report as absent */ }
        }
        res.setHeader('content-type', 'application/json')
        res.end(JSON.stringify({
          hasCookie: cookie.length > 0,
          user: payload?.sub ?? null,
          userId: payload?.uid ?? null,
          companyId: payload?.company_id ?? null,
          hubId: payload?.hub_id ?? null,
          hubCode: payload?.hub_code ?? null,
          timezone: payload?.timezone ?? null,
          expiresAt: payload?.exp ? new Date(Number(payload.exp) * 1000).toISOString() : null,
        }))
      })
    },
  }
}

/**
 * PERFORMANCE — keep-alive agent for all proxied upstreams.
 * Without it node's default agent opens a NEW TLS connection per request; every
 * API call then pays a full handshake to staging.fareye.co (~200-400ms), which
 * is why the prototype felt slower than the real console on the same APIs.
 * Do not remove. (See "Engineering rules" in CLAUDE.md.)
 */
const keepAliveAgent = new HttpsAgent({ keepAlive: true, maxSockets: 32, timeout: 60_000 })

const stagingProxy: ProxyOptions = {
  target: 'https://staging.fareye.co',
  changeOrigin: true,
  secure: true,
  agent: keepAliveAgent,
  rewrite: (path) => path.replace(/^\/staging/, ''),
  configure(proxy) {
    proxy.on('proxyReq', (proxyReq, req) => {
      const cookie = readSessionCookie()
      if (cookie) {
        proxyReq.setHeader('cookie', cookie)
        const xsrf = xsrfFrom(cookie)
        if (xsrf) proxyReq.setHeader('x-xsrf-token', xsrf)
      }
      proxyReq.setHeader('origin', 'https://staging.fareye.co')
      proxyReq.setHeader('referer', 'https://staging.fareye.co/')
      ;(req as { __isLogin?: boolean }).__isLogin = (req.url || '').includes('/app/authentication')
    })
    proxy.on('proxyRes', (proxyRes, req) => {
      const sc = proxyRes.headers['set-cookie']
      if (Array.isArray(sc) && sc.length) persistSetCookies(sc)
      // refresh exhausted (401) on a real call → drop the dead session so the
      // app routes to /login. Not on the login POST itself (bad creds ≠ dead
      // session), NOT on 403 (permission denied — the session is still valid;
      // e.g. /holidayMasters 403s even for staging's own UI on this account),
      // and not on optional endpoints some accounts simply don't expose —
      // one such response must never log the whole app out.
      const status = proxyRes.statusCode ?? 0
      const isLogin = (req as { __isLogin?: boolean }).__isLogin
      const optional = /holidayMasters|routing_configuration|geofence\//.test(req.url || '')
      if (status === 401 && !isLogin && !optional && readSessionCookie()) {
        clearSession()
        console.log('[staging-session] cleared — refresh exhausted (staging returned 401)')
      }
    })
  },
}

export default defineConfig({
  plugins: [tailwindcss(), react(), sessionInfoPlugin()],
  server: {
    port: 3000,
    strictPort: true,
    proxy: {
      '/staging': stagingProxy,
      // OSM tiles + OSRM router via same-origin — direct browser calls to the
      // public hosts get blocked in some networks (grey/blank map tiles)
      '/osm': {
        target: 'https://tile.openstreetmap.org',
        changeOrigin: true,
        secure: true,
        agent: keepAliveAgent,
        rewrite: (path) => path.replace(/^\/osm/, ''),
        headers: { 'user-agent': 'fareye-ui-prototype/0.1 (dev; local prototype)' },
      },
      // address → coordinates for the Select Location popup (staging has its
      // own geocoder; we use OSM Nominatim through the same-origin proxy)
      '/geocode': {
        target: 'https://nominatim.openstreetmap.org',
        changeOrigin: true,
        secure: true,
        agent: keepAliveAgent,
        rewrite: (path) => path.replace(/^\/geocode/, ''),
        headers: { 'user-agent': 'fareye-ui-prototype/0.1 (dev; local prototype)' },
      },
      '/osrm': {
        target: 'https://router.project-osrm.org',
        changeOrigin: true,
        secure: true,
        agent: keepAliveAgent,
        rewrite: (path) => path.replace(/^\/osrm/, ''),
        headers: { 'user-agent': 'fareye-ui-prototype/0.1 (dev; local prototype)' },
      },
    },
  },
  preview: { port: 3000, strictPort: true },
})
