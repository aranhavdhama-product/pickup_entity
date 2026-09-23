/**
 * Profile — the signed-in user's account, straight from GET /app/rest/account.
 */
import { useNavigate } from 'react-router-dom'
import { Building2, Hash, LogOut, Mail, MapPin, Phone, Shield, UserRound } from 'lucide-react'
import { useAuth } from '../../auth/AuthContext'
import { fullName, initials } from '../../auth/authApi'

export default function Profile() {
  const { account, session, signOut } = useAuth()
  const navigate = useNavigate()

  if (!account) {
    return <div className="fe-nueva p-6 text-[14px] text-ink-3">No account loaded — please sign in.</div>
  }

  const doSignOut = async () => { await signOut(); navigate('/console/login', { replace: true }) }
  const email = String(account.raw.email ?? '') || '—'

  return (
    <div className="fe-nueva mx-auto max-w-[860px] p-6">
      {/* header card */}
      <div className="flex flex-wrap items-center gap-5 rounded-xl border border-line bg-surface p-6">
        <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-brand-500 text-[22px] font-black text-white">
          {initials(account)}
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="text-[22px] font-black leading-tight text-ink">{fullName(account)}</h1>
          <p className="mt-0.5 text-[13.5px] text-ink-3">
            @{account.login} · {account.userTypeName || 'User'}
            {account.company ? <> · {account.company.name}</> : null}
          </p>
        </div>
        <button onClick={doSignOut}
          className="flex items-center gap-2 rounded-md border border-warm-300 px-3.5 py-2 text-[13px] font-bold text-ink-2 transition-colors hover:border-brand-300 hover:text-brand-600">
          <LogOut size={15} /> Sign out
        </button>
      </div>

      {/* detail grid */}
      <div className="mt-5 grid grid-cols-1 gap-5 md:grid-cols-2">
        <Card title="User">
          <Row icon={<UserRound size={15} />} label="Full name" value={fullName(account)} />
          <Row icon={<Hash size={15} />} label="Username" value={account.login} />
          <Row icon={<Shield size={15} />} label="Role" value={account.userTypeName || '—'} />
          <Row icon={<Hash size={15} />} label="Employee code" value={account.employeeCode || '—'} />
          <Row icon={<Mail size={15} />} label="Email" value={email} />
          <Row icon={<Phone size={15} />} label="Mobile" value={account.mobileNumber || '—'} />
          <Row icon={<Hash size={15} />} label="User ID" value={String(account.userId)} />
        </Card>

        <Card title="Company & location">
          <Row icon={<Building2 size={15} />} label="Company" value={account.company?.name || '—'} />
          <Row icon={<Hash size={15} />} label="Company code" value={account.company?.code || '—'} />
          <Row icon={<MapPin size={15} />} label="Timezone" value={account.company?.timeZone || session?.timezone || '—'} />
          <Row icon={<MapPin size={15} />} label="Home hub" value={session?.hubCode || (account.hubId ? `hub ${account.hubId}` : '—')} />
          <Row icon={<Hash size={15} />} label="City ID" value={account.cityId != null ? String(account.cityId) : '—'} />
          <Row icon={<MapPin size={15} />} label="Hubs assigned" value={String(account.hubs.length)} />
        </Card>
      </div>

      {/* roles + hubs chips */}
      {(account.roles.length > 0 || account.hubs.length > 0) && (
        <div className="mt-5 grid grid-cols-1 gap-5 md:grid-cols-2">
          {account.roles.length > 0 && (
            <Card title={`Roles (${account.roles.length})`}>
              <div className="flex flex-wrap gap-2">
                {account.roles.map((r) => (
                  <span key={r} className="rounded-full bg-info-bg px-2.5 py-1 text-[12px] font-bold text-info-fg">{r}</span>
                ))}
              </div>
            </Card>
          )}
          {account.hubs.length > 0 && (
            <Card title={`Hubs (${account.hubs.length})`}>
              <div className="flex flex-wrap gap-2">
                {account.hubs.slice(0, 30).map((h) => (
                  <span key={h.id} className="rounded-full bg-warm-50 px-2.5 py-1 text-[12px] text-ink-2">
                    {h.name || h.code || `hub ${h.id}`}
                  </span>
                ))}
              </div>
            </Card>
          )}
        </div>
      )}

      {session?.expiresAt && (
        <p className="mt-5 text-[12px] text-ink-3">
          Session token valid until {new Date(session.expiresAt).toLocaleString()} · auto-refreshed while active.
        </p>
      )}
    </div>
  )
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-line bg-surface p-5">
      <h2 className="mb-3 text-[12px] font-bold uppercase tracking-[0.06em] text-ink-3">{title}</h2>
      <div className="space-y-2.5">{children}</div>
    </section>
  )
}

function Row({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-warm-50 text-ink-3">{icon}</span>
      <span className="w-32 shrink-0 text-[13px] text-ink-3">{label}</span>
      <span className="min-w-0 flex-1 truncate text-[13.5px] font-bold text-ink" title={value}>{value}</span>
    </div>
  )
}
