/**
 * Custom Settings → Users Management — live against the real console APIs:
 *   GET  /app/rest/user_type_new                 → user-type tabs
 *   GET  /app/rest/users?userTypeId=…&companyId=… (REQUIRED params; Spring page)
 *   POST /app/rest/users/user_activation|user_deactivation?companyId= (body = [logins])
 * See FAREYE-SETTINGS-APIS.md §1 for the full endpoint family.
 */
import { useCallback, useEffect, useState } from 'react'
import { RefreshCw, AlertCircle, UserCheck, UserX, Smartphone, CircleUser } from 'lucide-react'
import { Button, EmptyState, SearchInput, StatusPill, Tabs, PageHeader } from './components'
import { toast } from './toast'
import {
  fetchAccount, fetchUsers, fetchUserTypes, setUsersActivation,
  type FarEyeUser, type UserType,
} from './settingsApi'

const PAGE_SIZE = 10

function fmtName(u: FarEyeUser) {
  return [u.firstName, u.lastName].filter(Boolean).join(' ') || u.login
}

export default function UsersManagementPage() {
  const [types, setTypes] = useState<UserType[]>([])
  const [tab, setTab] = useState(0)
  const [companyId, setCompanyId] = useState<number | null>(null)
  const [rows, setRows] = useState<FarEyeUser[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [query, setQuery] = useState('')
  const [activeOnly, setActiveOnly] = useState(true)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([fetchUserTypes(), fetchAccount()])
      .then(([t, acc]) => { setTypes(t); setCompanyId(acc.company.id) })
      .catch((e) => setError(String(e)))
  }, [])

  const load = useCallback(() => {
    const type = types[tab]
    if (!type || companyId == null) return
    setLoading(true)
    setError(null)
    fetchUsers({ userTypeId: type.id, companyId, pageNo: page, recordsPerPage: PAGE_SIZE, query, activatedUser: activeOnly })
      .then((d) => { setRows(d.content); setTotal(d.totalElements) })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false))
  }, [types, tab, companyId, page, query, activeOnly])
  useEffect(load, [load])

  const toggleActivation = async (u: FarEyeUser) => {
    if (companyId == null) return
    setBusy(u.login)
    try {
      await setUsersActivation([u.login], companyId, !u.activated)
      toast.success(`User ${u.activated ? 'deactivated' : 'activated'} successfully.`)
      load()
    } catch (e) {
      toast.error(`Failed to ${u.activated ? 'deactivate' : 'activate'} user.`)
      console.error(e)
    } finally {
      setBusy(null)
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div className="w-full">
      <PageHeader title="Users Management" subtitle="Manage users, their types, activation and access" />
      <div className="bg-surface border border-line rounded-xl shadow-ds-1">
        <div className="px-5 pt-1">
          <Tabs tabs={types.map((t) => t.name)} active={tab} onChange={(i) => { setTab(i); setPage(0) }} size="sm" />
        </div>
        <div className="px-5 py-3 flex items-center gap-3 border-b border-line">
          <div className="w-72"><SearchInput value={query} onChange={(v) => { setQuery(v); setPage(0) }} placeholder="Search users" /></div>
          <div className="flex items-center rounded-md border border-warm-300 overflow-hidden text-[12.5px]">
            {[true, false].map((v) => (
              <button key={String(v)} onClick={() => { setActiveOnly(v); setPage(0) }}
                className={`px-3 h-8 transition-colors ${activeOnly === v ? 'bg-brand-500 text-white font-bold' : 'bg-surface text-ink-2 hover:bg-warm-50'}`}>
                {v ? 'Active' : 'Inactive'}
              </button>
            ))}
          </div>
          <span className="ml-auto text-[12.5px] text-ink-3">{total} users</span>
        </div>

        {loading ? (
          <div className="px-5 py-10 text-center text-[13px] text-ink-3 animate-pulse">Loading users…</div>
        ) : error ? (
          <div className="px-5 py-10 flex flex-col items-center gap-3">
            <AlertCircle size={20} className="text-danger-fg" />
            <div className="text-[13px] text-ink-3">{error}</div>
            <Button variant="outline" icon={<RefreshCw size={14} />} onClick={load}>Retry</Button>
          </div>
        ) : rows.length === 0 ? (
          <EmptyState title="No users found" hint="Try a different search or user type." />
        ) : (
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-left text-[12px] text-ink-3 border-b border-line">
                <th className="px-5 py-2.5 font-bold">User</th>
                <th className="px-3 py-2.5 font-bold">Employee Code</th>
                <th className="px-3 py-2.5 font-bold">Email</th>
                <th className="px-3 py-2.5 font-bold">Mobile</th>
                <th className="px-3 py-2.5 font-bold">Hub</th>
                <th className="px-3 py-2.5 font-bold">Status</th>
                <th className="px-3 py-2.5 font-bold">Last Login</th>
                <th className="px-3 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {rows.map((u) => (
                <tr key={u.id} className="border-b border-line last:border-0 hover:bg-warm-50 transition-colors">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2.5">
                      <span className="h-8 w-8 shrink-0 rounded-full bg-warm-100 text-ink-3 inline-flex items-center justify-center">
                        {u.userType?.name === 'Field Executive' ? <Smartphone size={15} /> : <CircleUser size={16} />}
                      </span>
                      <div className="min-w-0">
                        <div className="font-bold text-ink truncate">{fmtName(u)}</div>
                        <div className="text-[12px] text-ink-3 truncate">@{u.login}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-ink-2">{u.employeeCode || '—'}</td>
                  <td className="px-3 py-3 text-ink-2 max-w-44 truncate">{u.email || '—'}</td>
                  <td className="px-3 py-3 text-ink-2">{u.mobileNumber || '—'}</td>
                  <td className="px-3 py-3 text-ink-2">{u.currentHub?.name || '—'}</td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-1.5">
                      <StatusPill label={u.activated ? 'Active' : 'Inactive'} tone={u.activated ? 'success' : 'neutral'} />
                      {String(u.isLoggedIn) === 'true' && <StatusPill label="Logged in" tone="info" />}
                      {u.locked && <StatusPill label="Locked" tone="danger" />}
                    </div>
                  </td>
                  <td className="px-3 py-3 text-ink-3 whitespace-nowrap">{u.lastLoginTime?.slice(0, 16) || '—'}</td>
                  <td className="px-3 py-3 text-right pr-5">
                    <Button size="sm" variant="outline" disabled={busy === u.login}
                      icon={u.activated ? <UserX size={13} /> : <UserCheck size={13} />}
                      onClick={() => toggleActivation(u)}>
                      {u.activated ? 'Deactivate' : 'Activate'}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {!loading && !error && total > PAGE_SIZE && (
          <div className="px-5 py-3 flex items-center justify-between border-t border-line text-[12.5px] text-ink-3">
            <span>Page {page + 1} of {totalPages}</span>
            <div className="flex gap-1.5">
              <Button size="sm" variant="ghost" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Previous</Button>
              <Button size="sm" variant="ghost" disabled={page + 1 >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
