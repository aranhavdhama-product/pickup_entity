/**
 * FarEye sign-in — LIVE against staging via POST /app/authentication.
 *
 * Single form (username + password + remember me), submitting exactly what the
 * user types. Branded split layout: a dispatch-route motif on the brand panel,
 * a disciplined form on the right. On success the auth context hydrates the
 * account profile and we redirect to where the user was headed.
 */
import { useState, type FormEvent } from 'react'
import { useNavigate, useLocation, Navigate } from 'react-router-dom'
import { AlertTriangle, Eye, EyeOff, Loader2, Lock, User } from 'lucide-react'
import { useAuth } from '../../auth/AuthContext'

export default function Login() {
  const { status, signIn } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: string } | null)?.from ?? '/console'

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(true)
  const [showPw, setShowPw] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (status === 'authenticated') return <Navigate to={from} replace />

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!username.trim() || !password) { setError('Enter your username and password.'); return }
    setBusy(true); setError(null)
    try {
      await signIn(username.trim(), password, remember)
      navigate(from, { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fe-nueva flex min-h-screen bg-surface">
      {/* ---------------------------------------------------- brand panel */}
      <aside className="relative hidden w-[46%] max-w-[560px] shrink-0 overflow-hidden bg-warm-900 lg:block">
        <RouteMotif />
        <div className="relative z-10 flex h-full flex-col justify-between p-12">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-500 text-[17px] font-black text-white">F</span>
            <span className="text-[19px] font-black tracking-tight text-white">FarEye</span>
          </div>

          <div className="max-w-[420px]">
            <p className="mb-3 text-[12px] font-bold uppercase tracking-[0.14em] text-brand-400">Delivery operations console</p>
            <h2 className="text-[30px] font-black leading-[1.15] text-white">
              Plan, dispatch and track<br />every route in one place.
            </h2>
            <p className="mt-4 text-[14px] leading-relaxed text-warm-400">
              Sign in to manage consignments, build waves, assign drivers and carriers,
              and watch trips move in real time.
            </p>
          </div>

          <div className="flex gap-8">
            {[['Live', 'trip tracking'], ['Waves', 'auto-planned'], ['1-click', 'driver assign']].map(([big, small]) => (
              <div key={small}>
                <p className="text-[20px] font-black text-white">{big}</p>
                <p className="text-[12px] text-warm-500">{small}</p>
              </div>
            ))}
          </div>
        </div>
      </aside>

      {/* ---------------------------------------------------- form panel */}
      <main className="flex flex-1 items-center justify-center px-6 py-10">
        <div className="w-full max-w-[380px]">
          {/* compact logo for mobile (brand panel hidden) */}
          <div className="mb-8 flex items-center gap-2.5 lg:hidden">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-500 text-[17px] font-black text-white">F</span>
            <span className="text-[19px] font-black tracking-tight text-ink">FarEye</span>
          </div>

          <h1 className="text-[24px] font-black leading-tight text-ink">Sign in</h1>
          <p className="mt-1 text-[14px] text-ink-3">Welcome back — enter your credentials to continue.</p>

          {error && (
            <div className="mt-5 flex items-start gap-2.5 rounded-md border border-brand-200 bg-brand-50 px-3.5 py-2.5 text-[13px] text-brand-700">
              <AlertTriangle size={15} className="mt-px shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={submit} className="mt-6 space-y-4">
            <Field label="Username" htmlFor="username">
              <div className="relative">
                <User size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-warm-400" />
                <input
                  id="username" name="username" type="text" autoComplete="username" autoFocus
                  value={username} onChange={(e) => setUsername(e.target.value)}
                  placeholder="e.g. jane_admin"
                  className="h-11 w-full rounded-md border border-warm-300 bg-surface pl-9 pr-3 text-[14px] text-ink placeholder:text-warm-400 transition-shadow focus:border-brand-500 focus:ring-[3px] focus:ring-brand-500/20"
                />
              </div>
            </Field>

            <Field label="Password" htmlFor="password">
              <div className="relative">
                <Lock size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-warm-400" />
                <input
                  id="password" name="password" type={showPw ? 'text' : 'password'} autoComplete="current-password"
                  value={password} onChange={(e) => setPassword(e.target.value)}
                  placeholder="Your password"
                  className="h-11 w-full rounded-md border border-warm-300 bg-surface pl-9 pr-10 text-[14px] text-ink placeholder:text-warm-400 transition-shadow focus:border-brand-500 focus:ring-[3px] focus:ring-brand-500/20"
                />
                <button type="button" onClick={() => setShowPw((v) => !v)}
                  aria-label={showPw ? 'Hide password' : 'Show password'}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-warm-400 hover:text-ink">
                  {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </Field>

            <div className="flex items-center justify-between pt-0.5">
              <label className="flex cursor-pointer items-center gap-2 text-[13px] text-ink-2">
                <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)}
                  className="h-4 w-4 rounded border-warm-300 accent-brand-500" />
                Remember me
              </label>
              <button type="button" className="text-[13px] font-bold text-brand-500 hover:text-brand-600">
                Forgot password?
              </button>
            </div>

            <button type="submit" disabled={busy}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-md bg-brand-500 text-[14px] font-bold text-white transition-colors hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60">
              {busy ? <><Loader2 size={16} className="animate-spin" /> Signing in…</> : 'Sign in'}
            </button>
          </form>

          <p className="mt-8 text-center text-[12px] text-ink-3">
            Live prototype · authenticates against staging.fareye.co
          </p>
        </div>
      </main>
    </div>
  )
}

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1.5 block text-[13px] font-bold text-ink-2">{label}</label>
      {children}
    </div>
  )
}

/** Ambient dispatch-route motif — dotted paths + nodes, the subject's own vernacular. */
function RouteMotif() {
  return (
    <svg className="absolute inset-0 h-full w-full" viewBox="0 0 560 900" fill="none" preserveAspectRatio="xMidYMid slice" aria-hidden>
      <defs>
        <radialGradient id="glow" cx="30%" cy="20%" r="80%">
          <stop offset="0%" stopColor="#EE5239" stopOpacity="0.18" />
          <stop offset="100%" stopColor="#EE5239" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="560" height="900" fill="url(#glow)" />
      <path d="M70 140 C 200 200, 160 380, 320 420 S 480 620, 400 780"
        stroke="#EE5239" strokeOpacity="0.35" strokeWidth="2" strokeDasharray="2 9" strokeLinecap="round" fill="none" />
      <path d="M120 90 C 260 160, 320 300, 240 460 S 120 700, 300 840"
        stroke="#8094AB" strokeOpacity="0.18" strokeWidth="2" strokeDasharray="2 9" strokeLinecap="round" fill="none" />
      {[[70, 140], [320, 420], [400, 780], [240, 460]].map(([cx, cy], i) => (
        <g key={i}>
          <circle cx={cx} cy={cy} r="11" fill="#EE5239" fillOpacity="0.14" />
          <circle cx={cx} cy={cy} r="4" fill="#EE5239" />
        </g>
      ))}
      <rect x="112" y="82" width="16" height="16" rx="4" fill="#F0F2F5" fillOpacity="0.9" transform="rotate(45 120 90)" />
    </svg>
  )
}
