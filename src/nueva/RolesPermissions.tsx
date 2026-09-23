/**
 * Custom Settings → Roles And Permissions — live against the RBAC service:
 *   GET /master/api/v1/authz/user-groups?page=1&page_size=1000 → {items:[group]}
 *   GET /master/api/v1/authz/user-roles?page=1&page_size=1000  → {items:[role]}
 * Roles carry a permissions tree {module:{page:{actions[]}}} rendered as
 * accordions. See FAREYE-SETTINGS-APIS.md §2.
 */
import { useEffect, useMemo, useState } from 'react'
import { RefreshCw, AlertCircle, Users2, ShieldCheck } from 'lucide-react'
import { Accordion, Button, EmptyState, PageHeader, SearchInput, StatusPill, Tabs } from './components'
import { fetchUserGroups, fetchUserRoles, type AuthzGroup, type AuthzRole } from './settingsApi'
import { labelFor } from './ModuleDetail'

function PermissionTree({ permissions }: { permissions: NonNullable<AuthzRole['permissions']> }) {
  const modules = Object.entries(permissions)
  if (!modules.length) return <div className="text-[13px] text-ink-3">No permissions configured.</div>
  return (
    <div className="space-y-3">
      {modules.map(([mod, pages]) => (
        <div key={mod}>
          <div className="text-[12px] font-bold uppercase tracking-wide text-ink-3 mb-1.5">{labelFor(mod)}</div>
          <div className="space-y-1.5">
            {Object.entries(pages).map(([page, cfg]) => (
              <div key={page} className="flex items-start gap-3 rounded-md border border-line bg-warm-50 px-3 py-2">
                <span className="text-[13px] font-bold text-ink whitespace-nowrap pt-0.5">{labelFor(page)}</span>
                <div className="flex flex-wrap gap-1">
                  {(cfg.actions ?? []).map((a) => (
                    <span key={a} className="rounded-full bg-surface border border-line px-2 py-0.5 text-[11px] text-ink-2">{labelFor(a)}</span>
                  ))}
                  {!cfg.actions?.length && <span className="text-[12px] text-ink-3">no actions</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

export default function RolesPermissionsPage() {
  const [tab, setTab] = useState(0)
  const [groups, setGroups] = useState<AuthzGroup[] | null>(null)
  const [roles, setRoles] = useState<AuthzRole[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [q, setQ] = useState('')

  const load = () => {
    setError(null)
    Promise.all([fetchUserGroups(), fetchUserRoles()])
      .then(([g, r]) => { setGroups(g); setRoles(r) })
      .catch((e) => setError(String(e)))
  }
  useEffect(load, [])

  const shownGroups = useMemo(
    () => (groups ?? []).filter((g) => g.name.toLowerCase().includes(q.toLowerCase())),
    [groups, q])
  const shownRoles = useMemo(
    () => (roles ?? []).filter((r) => r.name.toLowerCase().includes(q.toLowerCase())),
    [roles, q])

  const loading = groups === null && !error

  return (
    <div className="w-full">
      <PageHeader title="Roles And Permissions" subtitle="User groups, roles and their module permissions" />
      <div className="mb-3 flex items-center gap-3">
        <div className="flex-1"><Tabs tabs={['User Groups', 'User Roles']} active={tab} onChange={setTab} size="sm" /></div>
        <div className="w-64"><SearchInput value={q} onChange={setQ} placeholder={tab === 0 ? 'Search groups' : 'Search roles'} /></div>
      </div>

      {loading ? (
        <div className="bg-surface border border-line rounded-xl px-5 py-10 text-center text-[13px] text-ink-3 animate-pulse">Loading…</div>
      ) : error ? (
        <div className="bg-surface border border-line rounded-md px-5 py-8 flex flex-col items-center gap-3">
          <AlertCircle size={20} className="text-danger-fg" />
          <div className="text-[13px] text-ink-3">{error}</div>
          <Button variant="outline" icon={<RefreshCw size={14} />} onClick={load}>Retry</Button>
        </div>
      ) : tab === 0 ? (
        shownGroups.length === 0 ? <EmptyState title="No user groups" /> : (
          <div className="space-y-3">
            {shownGroups.map((g) => (
              <Accordion key={g.id} icon={<Users2 size={19} />}
                title={<span className="inline-flex items-center gap-2">{g.name}
                  {g.is_managed && <StatusPill label="Managed" tone="info" />}
                  <StatusPill label={g.is_active ? 'Active' : 'Inactive'} tone={g.is_active ? 'success' : 'neutral'} />
                </span>}
                subtitle={`Code: ${g.code} · ${g.roles.length} role${g.roles.length === 1 ? '' : 's'}`}>
                <div className="space-y-3">
                  {g.roles.map((r) => (
                    <div key={r.id}>
                      <div className="text-[13.5px] font-bold text-ink mb-2 inline-flex items-center gap-2">
                        <ShieldCheck size={15} className="text-warm-400" />{r.name}
                        {r.description && <span className="text-[12px] font-normal text-ink-3">— {r.description}</span>}
                      </div>
                      {r.permissions && <PermissionTree permissions={r.permissions} />}
                    </div>
                  ))}
                  {!g.roles.length && <div className="text-[13px] text-ink-3">No roles attached.</div>}
                </div>
              </Accordion>
            ))}
          </div>
        )
      ) : (
        shownRoles.length === 0 ? <EmptyState title="No user roles" /> : (
          <div className="space-y-3">
            {shownRoles.map((r) => (
              <Accordion key={r.id} icon={<ShieldCheck size={19} />}
                title={<span className="inline-flex items-center gap-2">{r.name}
                  {r.is_managed && <StatusPill label="Managed" tone="info" />}
                </span>}
                subtitle={r.description || 'Custom role'}>
                {r.permissions ? <PermissionTree permissions={r.permissions} /> : <div className="text-[13px] text-ink-3">No permissions configured.</div>}
              </Accordion>
            ))}
          </div>
        )
      )}
    </div>
  )
}
