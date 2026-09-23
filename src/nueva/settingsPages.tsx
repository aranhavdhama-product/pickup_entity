/**
 * Custom Settings pages beyond Base Modules / Users / Roles — each hooked to
 * the live staging APIs verified 2026-08-26 (see FAREYE-SETTINGS-APIS.md):
 *
 *  Incident Management  POST /master/api/v1/incidentConfig|incidentEscalation|
 *                       incidentNotification /fetch (+ DELETE base path, ids body)
 *  Data Validation      GET /ship/app/rest/get_validation_fields?type=<ENUM>,
 *                       GET /ship/app/rest/get_validation_rules
 *  Number Generation    GET/PUT /ship/app/rest/default_shipment_conf
 *  Label Template       GET /ship/app/rest/labelTemplate?pageNumber=&recordPerPage=
 *  Ship Common Settings GET /ship/app/rest/config → POST /app/rest/ship/config
 *  Carrier Allocation   GET /app/rest/carrier_allocation/fulfilment_centers,
 *                       /subscribed/carriers (get_config 500s on this account)
 *  Control Tower        GET/POST /app/rest/diy-settings/get|save
 *                       (mainSettingType PARCEL_VISIBILITY / CONTROL_TOWER)
 *  General Settings     GET /app/rest/is_integration_org_configured
 *  Web hooks            GET /expand-cmr/webhook (backend not provisioned on
 *                       this account → graceful service-unavailable state)
 */
import { useCallback, useEffect, useState } from 'react'
import {
  Trash2, ShieldAlert, GitFork, BellRing,
  Building2, Truck, Webhook, Plug, CircleCheck, CircleX,
} from 'lucide-react'
import {
  Accordion, Button, Checkbox, EmptyState, PageHeader, StatusPill, Tabs, Toggle,
  Panel, LoadingBox, ErrorBox,
} from './components'
import { toast } from './toast'
import { labelFor } from './ModuleDetail'
import { fetchUserTypes, type UserType } from './settingsApi'

const JSON_HEADERS = { 'Content-Type': 'application/json' }

/* ---------------- shared bits ---------------- */

async function getJson(url: string) {
  const res = await fetch(`/staging${url}`)
  if (!res.ok) throw new Error(`${url.split('?')[0]} → HTTP ${res.status}`)
  return res.json()
}

/* =================================================================== */
/* Incident Management                                                  */
/* =================================================================== */

const INCIDENT_ENTITIES = [
  { key: 'incidentConfig', label: 'Configurations', icon: ShieldAlert, desc: 'Incident types and their configuration' },
  { key: 'incidentEscalation', label: 'Escalation Matrix', icon: GitFork, desc: 'Who gets escalated to, and when' },
  { key: 'incidentNotification', label: 'Notifications', icon: BellRing, desc: 'Channels used to notify on incidents' },
]

export function IncidentManagementPage() {
  const [tab, setTab] = useState(0)
  const [rows, setRows] = useState<any[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const entity = INCIDENT_ENTITIES[tab]

  const load = useCallback(() => {
    setRows(null)
    setError(null)
    fetch(`/staging/master/api/v1/${entity.key}/fetch`, {
      method: 'POST', headers: JSON_HEADERS,
      body: JSON.stringify({ pageNumber: 1, pageSize: 500, query: [] }),
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`${entity.key}/fetch ${r.status}`))))
      .then((d) => setRows(d.content ?? []))
      .catch((e) => setError(String(e)))
  }, [entity.key])
  useEffect(load, [load])

  const remove = async (id: number) => {
    try {
      const res = await fetch(`/staging/master/api/v1/${entity.key}`, {
        method: 'DELETE', headers: JSON_HEADERS, body: JSON.stringify([id]),
      })
      if (!res.ok) throw new Error(String(res.status))
      toast.success('Deleted successfully.')
      load()
    } catch (e) {
      toast.error('Failed to delete.')
      console.error(e)
    }
  }

  const Icon = entity.icon
  return (
    <div className="w-full">
      <PageHeader title="Incident Management" subtitle="Configure incidents, escalation rules and notifications" />
      <div className="mb-3"><Tabs tabs={INCIDENT_ENTITIES.map((e) => e.label)} active={tab} onChange={setTab} size="sm" /></div>
      {rows === null && !error ? <LoadingBox /> : error ? <ErrorBox error={error} onRetry={load} /> : rows!.length === 0 ? (
        <Panel>
          <EmptyState icon={<Icon size={34} />} title={`No ${entity.label.toLowerCase()} configured`}
            hint={`${entity.desc}. Records created in the FarEye console will show up here.`} />
        </Panel>
      ) : (
        <div className="space-y-3">
          {rows!.map((r: any) => (
            <Accordion key={r.id} icon={<Icon size={19} />}
              title={r.name ?? r.code ?? `#${r.id}`}
              subtitle={`Last updated ${String(r.lastUpdatedAt ?? '').slice(0, 10) || '—'}`}
              right={
                <Button size="sm" variant="ghost" icon={<Trash2 size={13} />} onClick={() => remove(r.id)}>Delete</Button>
              }>
              <pre className="max-h-72 overflow-auto rounded-md bg-warm-50 border border-line px-3.5 py-3 text-[12px] leading-relaxed text-ink-2 font-mono">
                {JSON.stringify(r, null, 2)}
              </pre>
            </Accordion>
          ))}
        </div>
      )}
    </div>
  )
}

/* =================================================================== */
/* Data Validation (Ship)                                               */
/* =================================================================== */

const VALIDATION_SECTIONS = [
  { key: 'SHIP_FROM', label: 'Ship From' }, { key: 'SHIP_TO', label: 'Ship To' },
  { key: 'BILL_TO', label: 'Bill To' }, { key: 'RETURN_TO', label: 'Return To' },
  { key: 'CARRIER', label: 'Carrier' }, { key: 'SHIPMENT_DETAILS', label: 'Shipment Details' },
  { key: 'ADDITIONAL_FREE_INFO', label: 'Additional Info' },
]

export function DataValidationPage() {
  const [tab, setTab] = useState(0)
  const [fields, setFields] = useState<any[] | null>(null)
  const [rules, setRules] = useState<any[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const section = VALIDATION_SECTIONS[tab]

  const load = useCallback(() => {
    setFields(null)
    setError(null)
    getJson(`/ship/app/rest/get_validation_fields?type=${section.key}`)
      .then((d) => {
        const data = d.data ?? {}
        const list = Object.values(data).find((v) => Array.isArray(v) && v.length) as any[] | undefined
        setFields(list ?? [])
      })
      .catch((e) => setError(String(e)))
  }, [section.key])
  useEffect(load, [load])
  useEffect(() => {
    getJson('/ship/app/rest/get_validation_rules')
      .then((d) => setRules(d.data?.validations_rules_dto ?? []))
      .catch(() => setRules([]))
  }, [])

  return (
    <div className="w-full">
      <PageHeader title="Data Validation" subtitle="Field-level validation rules for shipment data" />
      <div className="mb-3"><Tabs tabs={VALIDATION_SECTIONS.map((s) => s.label)} active={tab} onChange={setTab} size="sm" /></div>
      {fields === null && !error ? <LoadingBox /> : error ? <ErrorBox error={error} onRetry={load} /> : (
        <Panel>
          {fields!.length === 0 ? (
            <EmptyState title={`No fields for ${section.label}`} />
          ) : (
            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-left text-[12px] text-ink-3 border-b border-line">
                  <th className="px-5 py-2.5 font-bold">#</th>
                  <th className="px-3 py-2.5 font-bold">Field</th>
                  <th className="px-3 py-2.5 font-bold">Type</th>
                  <th className="px-3 py-2.5 font-bold">JSON Key</th>
                  <th className="px-3 py-2.5 font-bold">Validations</th>
                </tr>
              </thead>
              <tbody>
                {fields!.map((f: any) => (
                  <tr key={f.attribute_id} className="border-b border-line last:border-0 hover:bg-warm-50 transition-colors">
                    <td className="px-5 py-2.5 text-ink-3">{f.serial_number}</td>
                    <td className="px-3 py-2.5 font-bold text-ink">{f.fields}</td>
                    <td className="px-3 py-2.5 text-ink-2">{f.type}</td>
                    <td className="px-3 py-2.5 text-ink-3 font-mono text-[12px]">{f.json_key}</td>
                    <td className="px-3 py-2.5">
                      {f.validations?.length
                        ? <span className="text-ink-2">{f.validations.map((v: any) => v.validation_type ?? v.type ?? 'rule').join(', ')}</span>
                        : <span className="text-warm-400">none</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
      )}
      <div className="mt-4">
        <Accordion title="Validation Rules" subtitle={`${rules?.length ?? 0} custom rule${(rules?.length ?? 0) === 1 ? '' : 's'} defined`}>
          {rules?.length
            ? <pre className="max-h-72 overflow-auto rounded-md bg-warm-50 border border-line px-3.5 py-3 text-[12px] font-mono text-ink-2">{JSON.stringify(rules, null, 2)}</pre>
            : <div className="text-[13px] text-ink-3">No custom validation rules on this account.</div>}
        </Accordion>
      </div>
    </div>
  )
}

/* =================================================================== */
/* Number Generation Config (Ship)                                      */
/* =================================================================== */

export function NumberGenerationPage() {
  const [confs, setConfs] = useState<any[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [drafts, setDrafts] = useState<Record<number, any>>({})
  const [saving, setSaving] = useState(false)

  const load = () => {
    setError(null)
    getJson('/ship/app/rest/default_shipment_conf')
      .then((d) => { setConfs(d.data ?? []); setDrafts({}) })
      .catch((e) => setError(String(e)))
  }
  useEffect(load, [])

  const save = async (i: number) => {
    setSaving(true)
    try {
      const body = { ...confs![i], ...drafts[i] }
      const res = await fetch('/staging/ship/app/rest/default_shipment_conf', {
        method: 'PUT', headers: JSON_HEADERS, body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error(String(res.status))
      toast.success('Number generation config saved.')
      load()
    } catch (e) {
      toast.error('Failed to save config.')
      console.error(e)
    } finally {
      setSaving(false)
    }
  }

  const NUM_FIELDS: { key: string; label: string; type: 'text' | 'number' | 'bool' }[] = [
    { key: 'start_with', label: 'Starts With', type: 'text' },
    { key: 'end_with', label: 'Ends With', type: 'text' },
    { key: 'start_range', label: 'Start Range', type: 'number' },
    { key: 'end_range', label: 'End Range', type: 'number' },
    { key: 'running_number', label: 'Running Number', type: 'number' },
    { key: 'is_leading_zero_appended', label: 'Append Leading Zeros', type: 'bool' },
  ]

  return (
    <div className="w-full">
      <PageHeader title="Number Generation Config" subtitle="Templates used to generate shipment numbers" />
      {confs === null && !error ? <LoadingBox /> : error ? <ErrorBox error={error} onRetry={load} /> : confs!.length === 0 ? (
        <Panel><EmptyState title="No number generation templates" /></Panel>
      ) : (
        <div className="space-y-3">
          {confs!.map((c: any, i: number) => {
            const d = { ...c, ...drafts[i] }
            const dirty = !!drafts[i] && JSON.stringify({ ...c, ...drafts[i] }) !== JSON.stringify(c)
            const set = (k: string, v: any) => setDrafts((ds) => ({ ...ds, [i]: { ...ds[i], [k]: v } }))
            return (
              <Accordion key={c.id ?? i} defaultOpen={i === 0} icon={<Building2 size={19} />}
                title={`${c.config_type ?? 'Default'} template`}
                subtitle={`Preview: ${d.start_with ?? ''}${String(d.running_number ?? 1).padStart(d.is_leading_zero_appended ? String(d.end_range ?? '').length : 1, '0')}${d.end_with ?? ''}`}>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {NUM_FIELDS.map((f) => (
                    <div key={f.key}>
                      <div className="text-[12px] font-bold uppercase tracking-wide text-ink-2 mb-1.5">{f.label}</div>
                      {f.type === 'bool' ? (
                        <Toggle checked={!!d[f.key]} onChange={(v) => set(f.key, v)} />
                      ) : (
                        <input value={d[f.key] ?? ''} type={f.type}
                          onChange={(e) => set(f.key, f.type === 'number' ? Number(e.target.value) : e.target.value)}
                          className="h-8 w-full rounded-md border border-warm-300 bg-surface px-3 text-[13px] text-ink focus:border-brand-500 focus:ring-[3px] focus:ring-brand-500/20" />
                      )}
                    </div>
                  ))}
                </div>
                <div className="flex justify-end gap-2 border-t border-line pt-4 mt-5">
                  <Button variant="ghost" disabled={!dirty || saving} onClick={() => setDrafts((ds) => ({ ...ds, [i]: undefined }))}>Reset</Button>
                  <Button disabled={!dirty || saving} onClick={() => save(i)}>{saving ? 'Saving…' : 'Save Settings'}</Button>
                </div>
              </Accordion>
            )
          })}
        </div>
      )}
    </div>
  )
}

/* =================================================================== */
/* Label Template (Ship)                                                */
/* =================================================================== */

export function LabelTemplatePage() {
  const [data, setData] = useState<any | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = () => {
    setError(null)
    getJson('/ship/app/rest/labelTemplate?pageNumber=1&recordPerPage=50')
      .then((d) => setData(d.data ?? { content: [] }))
      .catch((e) => setError(String(e)))
  }
  useEffect(load, [])

  return (
    <div className="w-full">
      <PageHeader title="Label Template" subtitle="Shipping label & document templates" />
      {data === null && !error ? <LoadingBox /> : error ? <ErrorBox error={error} onRetry={load} /> : (
        <Panel>
          {!data.content?.length ? (
            <EmptyState title="No label templates on this account"
              hint="Templates created in the FarEye console (or via POST /ship/app/rest/labelTemplate) appear here with activate & party-mapping actions." />
          ) : (
            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-left text-[12px] text-ink-3 border-b border-line">
                  <th className="px-5 py-2.5 font-bold">Name</th>
                  <th className="px-3 py-2.5 font-bold">Type</th>
                  <th className="px-3 py-2.5 font-bold">Status</th>
                  <th className="px-3 py-2.5 font-bold">Updated</th>
                </tr>
              </thead>
              <tbody>
                {data.content.map((t: any) => (
                  <tr key={t.id} className="border-b border-line last:border-0 hover:bg-warm-50 transition-colors">
                    <td className="px-5 py-2.5 font-bold text-ink">{t.template_name ?? t.name}</td>
                    <td className="px-3 py-2.5 text-ink-2">{t.label_type ?? '—'}</td>
                    <td className="px-3 py-2.5"><StatusPill label={t.is_active ? 'Active' : 'Inactive'} tone={t.is_active ? 'success' : 'neutral'} /></td>
                    <td className="px-3 py-2.5 text-ink-3">{String(t.updated_at ?? '').slice(0, 10) || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
      )}
    </div>
  )
}

/* =================================================================== */
/* Ship Common Settings                                                 */
/* =================================================================== */

const SHIP_FLAGS: { key: string; label: string; desc: string }[] = [
  { key: 'isShipmentManagementEnable', label: 'Shipment Management', desc: 'Enable the shipment management module' },
  { key: 'isCarrierMasterEnable', label: 'Carrier Master', desc: 'Enable the carrier master module' },
  { key: 'dispatchModule', label: 'Dispatch Module', desc: 'Enable the dispatch module' },
  { key: 'printVaiSystemDialog', label: 'Print via System Dialog', desc: 'Use the browser print dialog for labels' },
  { key: 'printVaiWebhook', label: 'Print via Webhook', desc: 'Send label prints through a webhook' },
]

export function ShipCommonSettingsPage() {
  const [conf, setConf] = useState<any | null>(null)
  const [draft, setDraft] = useState<any | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [userTypes, setUserTypes] = useState<UserType[]>([])

  const load = () => {
    setError(null)
    getJson('/ship/app/rest/config')
      .then((d) => { setConf(d); setDraft(structuredClone(d)) })
      .catch((e) => setError(String(e)))
  }
  useEffect(load, [])
  useEffect(() => { fetchUserTypes().then(setUserTypes).catch(() => {}) }, [])

  const dirty = conf && draft && JSON.stringify(conf) !== JSON.stringify(draft)

  const save = async () => {
    setSaving(true)
    try {
      const res = await fetch('/staging/app/rest/ship/config', {
        method: 'POST', headers: JSON_HEADERS, body: JSON.stringify(draft),
      })
      if (!res.ok) throw new Error(String(res.status))
      toast.success('Ship settings saved successfully.')
      setConf(structuredClone(draft))
    } catch (e) {
      toast.error('Failed to save ship settings.')
      console.error(e)
    } finally {
      setSaving(false)
    }
  }

  const typeName = (id: string) => userTypes.find((t) => String(t.id) === String(id))?.name ?? `Type ${id}`

  return (
    <div className="w-full max-w-3xl">
      <PageHeader title="Ship Common Settings" subtitle="Company-level configuration for the Ship product" />
      {draft === null && !error ? <LoadingBox /> : error ? <ErrorBox error={error} onRetry={load} /> : (
        <Panel>
          <div className="px-5 py-2 divide-y divide-line">
            {SHIP_FLAGS.map((f) => (
              <div key={f.key} className="flex items-center justify-between gap-4 py-3.5">
                <div>
                  <div className="text-[13.5px] font-bold text-ink">{f.label}</div>
                  <div className="text-[12.5px] text-ink-3">{f.desc}</div>
                </div>
                <Toggle checked={!!draft[f.key]} onChange={(v) => setDraft((d: any) => ({ ...d, [f.key]: v }))} />
              </div>
            ))}
            <div className="py-3.5">
              <div className="text-[13.5px] font-bold text-ink mb-2">Allowed user types</div>
              <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-[13px]">
                {(['allowedUserTypesForCM', 'allowedUserTypesForSM'] as const).map((k) => (
                  <div key={k}>
                    <div className="text-[12px] text-ink-3 mb-1.5">{k === 'allowedUserTypesForCM' ? 'Carrier Master' : 'Shipment Management'}</div>
                    <div className="space-y-1.5">
                      {userTypes.map((t) => {
                        const list: string[] = draft[k] ?? []
                        const on = list.includes(String(t.id))
                        return (
                          <Checkbox key={t.id} checked={on} label={typeName(String(t.id))}
                            onChange={(v) => setDraft((d: any) => ({
                              ...d, [k]: v ? [...list, String(t.id)] : list.filter((x) => x !== String(t.id)),
                            }))} />
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="flex items-center justify-between border-t border-line px-5 py-3.5">
            <Button variant="ghost" disabled={!dirty || saving} onClick={() => setDraft(structuredClone(conf))}>Reset</Button>
            <Button disabled={!dirty || saving} onClick={save}>{saving ? 'Saving…' : 'Save Settings'}</Button>
          </div>
        </Panel>
      )}
    </div>
  )
}

/* =================================================================== */
/* Carrier Allocation (Ship)                                            */
/* =================================================================== */

export function CarrierAllocationPage() {
  const [centers, setCenters] = useState<any[] | null>(null)
  const [carriers, setCarriers] = useState<any[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = () => {
    setError(null)
    Promise.all([
      getJson('/app/rest/carrier_allocation/fulfilment_centers').then((d) => d.fulfilmentCenterList ?? []),
      getJson('/app/rest/carrier_allocation/subscribed/carriers').then((d) => d.servingCarriers ?? []).catch(() => []),
    ])
      .then(([fc, sc]) => { setCenters(fc); setCarriers(sc) })
      .catch((e) => setError(String(e)))
  }
  useEffect(load, [])

  return (
    <div className="w-full">
      <PageHeader title="Carrier Allocation" subtitle="Fulfilment centers, carriers and allocation rules" />
      {centers === null && !error ? <LoadingBox /> : error ? <ErrorBox error={error} onRetry={load} /> : (
        <div className="space-y-4">
          <Panel title="Fulfilment Centers">
            {centers!.length === 0 ? <EmptyState title="No fulfilment centers" /> : (
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="text-left text-[12px] text-ink-3 border-b border-line">
                    <th className="px-5 py-2.5 font-bold">Name</th>
                    <th className="px-3 py-2.5 font-bold">Code</th>
                    <th className="px-3 py-2.5 font-bold">Allocation Type</th>
                    <th className="px-3 py-2.5 font-bold">TAT %</th>
                    <th className="px-3 py-2.5 font-bold">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {centers!.map((c: any) => (
                    <tr key={c.id} className="border-b border-line last:border-0 hover:bg-warm-50 transition-colors">
                      <td className="px-5 py-2.5 font-bold text-ink">{c.name}</td>
                      <td className="px-3 py-2.5 text-ink-2">{c.code}</td>
                      <td className="px-3 py-2.5 text-ink-2">{c.allocationType ?? '—'}</td>
                      <td className="px-3 py-2.5 text-ink-2">{c.tatPercentage ?? 0}%</td>
                      <td className="px-3 py-2.5"><StatusPill label={c.isEnable ? 'Enabled' : 'Disabled'} tone={c.isEnable ? 'success' : 'neutral'} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Panel>
          <Panel title="Subscribed Carriers">
            {carriers!.length === 0 ? (
              <EmptyState icon={<Truck size={32} />} title="No carriers subscribed"
                hint="Carriers subscribed for allocation on this account will be listed here." />
            ) : (
              <div className="px-5 pb-4 flex flex-wrap gap-2">
                {carriers!.map((c: any, i: number) => (
                  <span key={i} className="rounded-full bg-warm-100 border border-warm-200 px-3 py-1 text-[12.5px] text-ink">{c.name ?? c.code ?? String(c)}</span>
                ))}
              </div>
            )}
          </Panel>
        </div>
      )}
    </div>
  )
}

/* =================================================================== */
/* Control Tower (Execute) — DIY settings                               */
/* =================================================================== */

export function ControlTowerPage() {
  const [conf, setConf] = useState<{ isEnabled: boolean; allowedUserTypes: string[] } | null>(null)
  const [orig, setOrig] = useState<typeof conf>(null)
  const [saving, setSaving] = useState(false)
  const [userTypes, setUserTypes] = useState<UserType[]>([])

  useEffect(() => {
    fetchUserTypes().then(setUserTypes).catch(() => {})
    fetch('/staging/app/rest/diy-settings/get?mainSettingType=PARCEL_VISIBILITY&subSettingType=CONTROL_TOWER')
      .then(async (r) => {
        // 404 = "No configuration found" → defaults, like the console
        if (r.status === 404) return { isEnabled: false, allowedUserTypes: [] }
        if (!r.ok) throw new Error(`diy-settings/get ${r.status}`)
        const d = await r.json()
        return { isEnabled: !!d.isEnabled, allowedUserTypes: d.allowedUserTypes ?? [] }
      })
      .then((c) => { setConf(c); setOrig(structuredClone(c)) })
      .catch(() => { setConf({ isEnabled: false, allowedUserTypes: [] }); setOrig({ isEnabled: false, allowedUserTypes: [] }) })
  }, [])

  const dirty = conf && orig && JSON.stringify(conf) !== JSON.stringify(orig)

  const save = async () => {
    if (!conf) return
    setSaving(true)
    try {
      const res = await fetch('/staging/app/rest/diy-settings/save', {
        method: 'POST', headers: JSON_HEADERS,
        body: JSON.stringify({
          isEnabled: conf.isEnabled, allowedUserTypes: conf.allowedUserTypes,
          mainSettingType: 'PARCEL_VISIBILITY', subSettingType: 'CONTROL_TOWER', selectedSubSettingType: 'CONTROL_TOWER',
        }),
      })
      if (!res.ok) throw new Error(String(res.status))
      toast.success('Control Tower settings saved.')
      setOrig(structuredClone(conf))
    } catch (e) {
      toast.error('Failed to save Control Tower settings.')
      console.error(e)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="w-full max-w-3xl">
      <PageHeader title="Control Tower" subtitle="Live operations monitoring configuration" />
      {conf === null ? <LoadingBox /> : (
        <Panel>
          <div className="px-5 py-2 divide-y divide-line">
            <div className="flex items-center justify-between gap-4 py-3.5">
              <div>
                <div className="text-[13.5px] font-bold text-ink">Enable Control Tower</div>
                <div className="text-[12.5px] text-ink-3">Turn the Control Tower module on for this account</div>
              </div>
              <Toggle checked={conf.isEnabled} onChange={(v) => setConf((c) => c && { ...c, isEnabled: v })} />
            </div>
            <div className="py-3.5">
              <div className="text-[13.5px] font-bold text-ink mb-2">Allowed user types</div>
              <div className="space-y-1.5">
                {userTypes.map((t) => {
                  const on = conf.allowedUserTypes.includes(t.name)
                  return (
                    <Checkbox key={t.id} checked={on} label={t.name}
                      onChange={(v) => setConf((c) => c && ({
                        ...c, allowedUserTypes: v ? [...c.allowedUserTypes, t.name] : c.allowedUserTypes.filter((x) => x !== t.name),
                      }))} />
                  )
                })}
              </div>
            </div>
          </div>
          <div className="flex items-center justify-between border-t border-line px-5 py-3.5">
            <Button variant="ghost" disabled={!dirty || saving} onClick={() => setConf(structuredClone(orig))}>Reset</Button>
            <Button disabled={!dirty || saving} onClick={save}>{saving ? 'Saving…' : 'Save Settings'}</Button>
          </div>
        </Panel>
      )}
    </div>
  )
}

/* =================================================================== */
/* Integrations — General Settings + Web hooks                          */
/* =================================================================== */

export function IntegrationsGeneralPage() {
  const [configured, setConfigured] = useState<boolean | null>(null)

  useEffect(() => {
    fetch('/staging/app/rest/is_integration_org_configured')
      .then((r) => r.json())
      .then((v) => setConfigured(!!v))
      .catch(() => setConfigured(false))
  }, [])

  return (
    <div className="w-full max-w-3xl">
      <PageHeader title="General Settings" subtitle="Integration platform organisation status" />
      {configured === null ? <LoadingBox /> : (
        <Panel>
          <div className="px-5 py-6 flex items-center gap-4">
            <span className={`h-11 w-11 shrink-0 rounded-lg inline-flex items-center justify-center
              ${configured ? 'bg-success-bg text-success-fg' : 'bg-warm-100 text-warm-400'}`}>
              {configured ? <CircleCheck size={22} /> : <CircleX size={22} />}
            </span>
            <div className="flex-1">
              <div className="text-[15px] font-bold text-ink">
                Integration organisation {configured ? 'configured' : 'not configured'}
              </div>
              <div className="text-[13px] text-ink-3 mt-0.5">
                {configured
                  ? 'This company is connected to the FarEye integration platform.'
                  : 'This company is not yet set up on the FarEye integration platform. Provisioning sends your company details to the integration service.'}
              </div>
            </div>
            {!configured && (
              <Button icon={<Plug size={14} />} onClick={async () => {
                try {
                  const res = await fetch('/staging/app/rest/send_details_to_integration', { method: 'POST', headers: JSON_HEADERS, body: '{}' })
                  if (!res.ok) throw new Error(String(res.status))
                  toast.success('Details sent to the integration platform.')
                } catch {
                  toast.error('Failed to reach the integration platform.')
                }
              }}>Set up integration</Button>
            )}
          </div>
        </Panel>
      )}
    </div>
  )
}

export function WebhooksPage() {
  const [hooks, setHooks] = useState<any[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = () => {
    setError(null)
    fetch('/staging/expand-cmr/webhook?page=0&size=50&sort=name,asc')
      .then(async (r) => {
        if (!r.ok) {
          const body = await r.text()
          throw new Error(body.includes('does not exist')
            ? 'The webhook service is not provisioned for this account (backend table missing).'
            : `webhook list → HTTP ${r.status}`)
        }
        return r.json()
      })
      .then((d) => setHooks(d.content ?? d ?? []))
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
  }
  useEffect(load, [])

  return (
    <div className="w-full">
      <PageHeader title="Web hooks" subtitle="Outbound webhooks for shipment events" />
      {hooks === null && !error ? <LoadingBox /> : error ? (
        <Panel>
          <EmptyState icon={<Webhook size={34} />} title="Webhook service unavailable" hint={error} />
        </Panel>
      ) : hooks!.length === 0 ? (
        <Panel><EmptyState icon={<Webhook size={34} />} title="No webhooks configured" /></Panel>
      ) : (
        <div className="space-y-3">
          {hooks!.map((h: any) => (
            <Accordion key={h.id} icon={<Webhook size={19} />} title={h.name}
              subtitle={h.webhookUrl}
              right={<StatusPill label={h.active ? 'Active' : 'Inactive'} tone={h.active ? 'success' : 'neutral'} />}>
              <pre className="max-h-56 overflow-auto rounded-md bg-warm-50 border border-line px-3.5 py-3 text-[12px] font-mono text-ink-2">{JSON.stringify(h, null, 2)}</pre>
            </Accordion>
          ))}
        </div>
      )}
    </div>
  )
}

export { labelFor }
