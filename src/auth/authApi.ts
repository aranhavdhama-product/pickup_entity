/**
 * Auth data layer — talks to LIVE staging through the Vite `/staging` proxy.
 *
 * Captured live (prod0003 account, 2026-08-26):
 *  - POST /app/authentication        → form login. Fields: username, password,
 *                                       rememberMe. 200 sets the JSESSIONID JWT
 *                                       (+ XSRF-TOKEN) via Set-Cookie, which the
 *                                       proxy harvests into `.staging-session`.
 *  - GET  /app/rest/account          → the signed-in user's full profile.
 *  - GET  /app/logout                → 200, clears the server session.
 *  - GET  /staging-session-info      → dev-server middleware decoding the JWT.
 *
 * The staging cookies live server-side in `.staging-session`; the browser never
 * holds them. So "am I logged in?" = does the session file decode to a user.
 * Token refresh is automatic: the proxy harvests rotated Set-Cookie from every
 * response and pings a keepalive every 5 min (see vite.config.ts).
 */

export interface Company {
  id: number
  name: string
  code: string
  timeZone: string
  billingCurrencySymbol?: string
}

export interface Account {
  login: string
  firstName: string
  lastName: string
  employeeCode: string
  mobileNumber: string
  userId: number
  userTypeName: string
  cityId: number | null
  hubId: number | null
  hubs: { id: number; name?: string; code?: string }[]
  roles: string[]
  company: Company | null
  keycloakUserId: string | null
  raw: Record<string, unknown>
}

export interface SessionInfo {
  hasCookie: boolean
  user: string | null
  companyId: number | null
  hubCode: string | null
  timezone: string | null
  expiresAt: string | null
}

export class AuthError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

const obj = (v: unknown): Record<string, unknown> =>
  (typeof v === 'object' && v !== null && !Array.isArray(v)) ? (v as Record<string, unknown>) : {}
const str = (v: unknown) => (v == null ? '' : String(v))
const numOrNull = (v: unknown) => (v == null || v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : null)

/**
 * Submit the login form. Sends exactly what the user typed — never a stored
 * credential. Form-urlencoded, matching the Spring-style /app/authentication.
 */
/** SHA-256 → lowercase hex. Staging hashes the password client-side before POST. */
async function sha256hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export async function login(username: string, password: string, rememberMe: boolean): Promise<void> {
  // Classic Spring Security form login — captured live from the working staging
  // login: application/x-www-form-urlencoded with j_username / j_password /
  // remember-me / submit. The password is SHA-256(hex)-hashed client-side (verified
  // live: the browser sends a 64-char hex digest, never plaintext).
  const params = new URLSearchParams()
  params.set('j_username', username)
  params.set('j_password', await sha256hex(password))
  if (rememberMe) params.set('remember-me', 'true') // omitted when unchecked, like the real form
  params.set('submit', 'Login')
  const res = await fetch('/staging/app/authentication', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json, text/plain, */*' },
    body: params.toString(),
  })
  if (res.ok) return // 200 — proxy has persisted the fresh session
  let message = ''
  try { message = String((await res.json())?.message || '') } catch { /* non-JSON */ }
  if (res.status === 401 || res.status === 403) {
    throw new AuthError(res.status, message || 'Incorrect username or password.')
  }
  throw new AuthError(res.status, message || `Sign-in failed (HTTP ${res.status}). Please try again.`)
}

export async function logout(): Promise<void> {
  try { await fetch('/staging/app/logout', { headers: { accept: '*/*' } }) } catch { /* best-effort */ }
}

export async function fetchAccount(): Promise<Account> {
  const res = await fetch('/staging/app/rest/account', { headers: { accept: 'application/json' } })
  if (res.status === 401 || res.status === 403) throw new AuthError(res.status, 'Not signed in.')
  if (!res.ok) throw new AuthError(res.status, `Could not load account (HTTP ${res.status}).`)
  const raw = obj(await res.json())
  const company = obj(raw.company)
  return {
    login: str(raw.login),
    firstName: str(raw.firstName),
    lastName: str(raw.lastName),
    employeeCode: str(raw.employeeCode),
    mobileNumber: str(raw.mobileNumber),
    userId: numOrNull(raw.userId) ?? 0,
    userTypeName: str(raw.userTypeName),
    cityId: numOrNull(raw.cityId),
    hubId: numOrNull(raw.hubId),
    hubs: (Array.isArray(raw.hubs) ? raw.hubs : []).map((h) => {
      const o = obj(h)
      return { id: numOrNull(o.id) ?? 0, name: str(o.name) || undefined, code: str(o.code) || undefined }
    }),
    roles: (Array.isArray(raw.roles) ? raw.roles : []).map((r) => {
      const o = obj(r)
      return str(o.name ?? o.role ?? o.authority ?? r)
    }).filter(Boolean),
    company: company && Object.keys(company).length ? {
      id: numOrNull(company.id) ?? 0,
      name: str(company.name),
      code: str(company.code),
      timeZone: str(company.timeZone),
      billingCurrencySymbol: str(company.billingCurrencySymbol) || undefined,
    } : null,
    keycloakUserId: str(raw.keycloakUserId) || null,
    raw,
  }
}

export async function getSessionInfo(): Promise<SessionInfo> {
  const res = await fetch('/staging-session-info', { headers: { accept: 'application/json' } })
  return res.json() as Promise<SessionInfo>
}

export const fullName = (a: Account) =>
  [a.firstName, a.lastName].filter(Boolean).join(' ') || a.login || 'User'

export const initials = (a: Account) => {
  const parts = [a.firstName, a.lastName].filter(Boolean)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  const s = fullName(a)
  return (s.slice(0, 2) || 'U').toUpperCase()
}
