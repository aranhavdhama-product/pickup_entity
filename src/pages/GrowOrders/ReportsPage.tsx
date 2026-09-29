/**
 * Reports — `/grow/orders/reports` (+ `/reports/subscriptions`), the live
 * portal's `/reports/` and `/reports/subscribedReports/` ("Get summarised
 * information"), capture: docs/superpowers/research/2026-09-25-grow-portal-pages.md §6.
 *
 * Live arrangement in our grammar: the tab strip Order Report · Transaction
 * Report · Tracking Report (`?tab=order|transaction|tracking`) with, on its
 * right, Manage Subscribe Reports (outline) · Generate Report (primary, hidden
 * on Tracking, as live) · refresh → the jobs grid REQUESTED BY · CREATED AT ·
 * START DATE · END DATE · ACTIONS (Download) → Rows per page (100).
 *
 * Generate Report dialog, both live modes: Report Settings on the left (type ·
 * start / end date & time · "I want to subscribe this report" → Report Name ·
 * Frequency · Ends · Send To) and Columns on the right (template search ·
 * Recently used / Name sort · Favorites · Build manually → a two-list picker,
 * grouped and collapsible with per-group All). Generate becomes Subscribe
 * with the toggle on. Our addition: "Save as template" under the picker (live
 * only says "Build your first template by selecting columns and saving").
 *
 * Download builds the CSV locally from the orders store in the job's chosen
 * columns (`growOrders/reports.ts`, the verbatim Order-report universe).
 */
import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  ChevronDown, ChevronRight, FileBarChart2, ListChecks, Receipt, RotateCw, Search, Star, Wrench, X,
} from 'lucide-react'
import { useGrowOrders } from '../../growOrders/store'
import { currentMerchant, useMasters, useMerchantCode } from '../../growOrders/masters'
import {
  columnsFor, reportActions, reportCsv, reportOrders, useReports,
  type EndsMode, type Frequency, type ReportColumn, type ReportJob, type ReportType,
} from '../../growOrders/reports'
import { usePlanning } from '../LocalPFP/planningStore'
import { downloadCsv } from '../LocalPFP/adapter'
import { toast } from '../../nueva/toast'
import {
  Button, Checkbox, DataTable, DateInput, EmptyState, Field, Input, MenuSelect, Modal, PageHeader, PageSize, Pagination, Panel,
  Toggle, type Column,
} from '../../nueva/components'
import { IconBtn, LocalPage, LocalTabs } from '../../local/chrome'
import { DateTimePicker } from './dateTimePicker'
import { shipmentRowsOf } from './shipmentRows'
import { trackingCsv } from './trackingModel'
import { fmtDateTime } from './utils'

const TABS: { slug: string; type: ReportType; label: string; icon: typeof Receipt; hint: string }[] = [
  { slug: 'order', type: 'Order', label: 'Order Report', icon: FileBarChart2, hint: 'View details of all orders' },
  { slug: 'transaction', type: 'Transaction', label: 'Transaction Report', icon: Receipt, hint: 'View details of all transactions' },
  { slug: 'tracking', type: 'Tracking', label: 'Tracking Report', icon: ListChecks, hint: 'View details of all tracking reports' },
]

const p2 = (n: number) => String(n).padStart(2, '0')
const localAt = (d: Date) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}T${p2(d.getHours())}:${p2(d.getMinutes())}`
const todayAt = (h: number, m = 0) => { const d = new Date(); d.setHours(h, m, 0, 0); return localAt(d) }
const monthAgo = () => { const d = new Date(); d.setDate(d.getDate() - 30); d.setHours(0, 0, 0, 0); return localAt(d) }
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`

function useRequester(): string {
  const masters = useMasters()
  const code = useMerchantCode()
  return currentMerchant(masters.merchants, code)?.name ?? 'Merchant user'
}

/* ------------------------------------------------------ list page ---- */

export default function GrowReportsPage() {
  const reports = useReports()
  const db = useGrowOrders()
  const plan = usePlanning()
  const nav = useNavigate()
  const [params, setParams] = useSearchParams()
  const tabIdx = Math.max(0, TABS.findIndex((t) => t.slug === params.get('tab')))
  const tab = TABS[tabIdx]
  const [open, setOpen] = useState(false)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(100)

  const jobs = useMemo(() => reports.jobs.filter((j) => j.type === tab.type).sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [reports.jobs, tab.type])
  const counts = TABS.map((t) => reports.jobs.filter((j) => j.type === t.type).length)
  const totalPages = Math.max(1, Math.ceil(jobs.length / pageSize))
  const safePage = Math.min(page, totalPages)
  const paged = jobs.slice((safePage - 1) * pageSize, safePage * pageSize)

  const download = (j: ReportJob) => {
    const file = `${j.type.toLowerCase()}-report-${j.start.slice(0, 10)}-to-${j.end.slice(0, 10)}.csv`
    if (j.type === 'Tracking') {
      const a = new Date(j.start).getTime(), b = new Date(j.end).getTime()
      const rows = shipmentRowsOf(db, plan).filter((r) => {
        if (r.draft) return false
        const t = new Date(r.order.createdAt).getTime()
        return t >= a && t <= b
      })
      downloadCsv(file, trackingCsv(rows))
      toast.success(`${plural(rows.length, 'row')} downloaded.`)
      return
    }
    const universe = columnsFor(j.type)
    const cols = j.columns.map((id) => universe.find((c) => c.id === id)).filter((c): c is ReportColumn => !!c)
    const orders = reportOrders(j.type, db.orders, j.start, j.end)
    downloadCsv(file, reportCsv(cols.length ? cols : universe, orders))
    toast.success(`${plural(orders.length, 'row')} downloaded.`)
  }

  const columns: Column[] = [
    { key: 'requestedBy', label: 'Requested By', render: (j: ReportJob) => <span className="font-bold text-ink">{j.requestedBy}</span> },
    { key: 'createdAt', label: 'Created At', render: (j: ReportJob) => fmtDateTime(j.createdAt) },
    { key: 'start', label: 'Start Date', render: (j: ReportJob) => fmtDateTime(j.start) },
    { key: 'end', label: 'End Date', render: (j: ReportJob) => fmtDateTime(j.end) },
    { key: 'columns', label: 'Columns', align: 'right', render: (j: ReportJob) => (j.type === 'Tracking' ? 9 : j.columns.length || columnsFor(j.type).length) },
    { key: 'actions', label: 'Actions', render: (j: ReportJob) => (
      <span onClick={(e) => e.stopPropagation()}><Button size="sm" onClick={() => download(j)}>Download</Button></span>
    ) },
  ]

  return (
    <LocalPage>
      <LocalTabs
        tabs={TABS.map((t, i) => ({ id: t.slug, label: t.label, count: counts[i], icon: t.icon }))}
        active={tab.slug}
        onChange={(slug) => { setParams((p) => { const n = new URLSearchParams(p); n.set('tab', slug); return n }, { replace: true }); setPage(1) }}
        right={<>
          <IconBtn title="Refresh" onClick={() => toast.info('Reports refreshed.')}><RotateCw size={15} /></IconBtn>
          <Button variant="outline" onClick={() => nav('/grow/orders/reports/subscriptions')}>Manage Subscribe Reports</Button>
          {tab.type !== 'Tracking' && <Button onClick={() => setOpen(true)}>Generate Report</Button>}
        </>} />
      <p className="mt-3 text-[13px] text-ink-3">Get summarised information. {tab.hint}.</p>
      <div className="mt-2">
        {jobs.length === 0 ? (
          <Panel><EmptyState title="No results found." hint={tab.type === 'Tracking' ? 'Tracking reports appear here once ops share them.' : 'Generate a report to see it here.'} /></Panel>
        ) : (
          <>
            <DataTable columns={columns} rows={paged} />
            <div className="flex items-center justify-between gap-3">
              <div className="flex-1">
                <Pagination page={safePage} total={totalPages} onChange={setPage}
                  range={`${(safePage - 1) * pageSize + 1}-${Math.min(safePage * pageSize, jobs.length)} of ${jobs.length}`} />
              </div>
              <div className="pt-3"><PageSize value={pageSize} onChange={(n) => { setPageSize(n); setPage(1) }} /></div>
            </div>
          </>
        )}
      </div>
      {open && <GenerateReportDialog initialType={tab.type === 'Transaction' ? 'Transaction' : 'Order'} onClose={() => setOpen(false)}
        onDone={(t) => { setOpen(false); setParams((p) => { const n = new URLSearchParams(p); n.set('tab', t === 'Order' ? 'order' : 'transaction'); return n }, { replace: true }) }} />}
    </LocalPage>
  )
}

/* -------------------------------------------- subscribed reports ---- */

export function GrowSubscribedReportsPage() {
  const reports = useReports()
  const nav = useNavigate()
  const columns: Column[] = [
    { key: 'name', label: 'Report Name', render: (r) => <span className="font-bold text-ink">{r.name}</span> },
    { key: 'createdBy', label: 'Created By' },
    { key: 'createdOn', label: 'Created On', render: (r) => fmtDateTime(r.createdOn) },
    { key: 'type', label: 'For', render: (r) => `${r.type} report` },
    { key: 'frequency', label: 'Frequency', render: (r) => `${r.frequency}${r.ends === 'After' ? ` · ${r.endsAfter} runs` : r.ends === 'On Specific Date' ? ` · until ${r.endsOn}` : ''}` },
    { key: 'sendTo', label: 'Send To', render: (r) => <span className="block max-w-[260px] truncate" title={r.sendTo.join(', ')}>{r.sendTo.join(', ')}</span> },
  ]
  return (
    <LocalPage>
      <PageHeader title="Subscribed Reports" subtitle="Here you can manage and update reports" onBack={() => nav('/grow/orders/reports')} />
      <div className="mt-2">
        {reports.subscriptions.length === 0 ? (
          <Panel><EmptyState title="No results found." hint="Turn on “I want to subscribe this report” in Generate Report." /></Panel>
        ) : (
          <DataTable columns={columns} rows={reports.subscriptions}
            extraActions={(r) => (
              <Button size="sm" variant="ghost" icon={<X size={13} />}
                onClick={() => { reportActions.unsubscribe(r.id); toast.success(`Unsubscribed from “${r.name}”.`) }}>Unsubscribe</Button>
            )} />
        )}
      </div>
    </LocalPage>
  )
}

/* -------------------------------------------- generate dialog ---- */

const FREQS: Frequency[] = ['Daily', 'Weekly', 'Monthly']
const ENDS: EndsMode[] = ['Never', 'After', 'On Specific Date']
const emailOk = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)

function GenerateReportDialog({ initialType, onClose, onDone }: {
  initialType: 'Order' | 'Transaction'; onClose: () => void; onDone: (t: 'Order' | 'Transaction') => void
}) {
  const reports = useReports()
  const who = useRequester()
  const [type, setType] = useState<'Order' | 'Transaction'>(initialType)
  const [start, setStart] = useState(monthAgo())
  const [end, setEnd] = useState(todayAt(23, 30))
  const [subscribe, setSubscribe] = useState(false)
  const [name, setName] = useState('')
  const [freq, setFreq] = useState<Frequency>('Weekly')
  const [ends, setEnds] = useState<EndsMode>('Never')
  const [endsAfter, setEndsAfter] = useState('4')
  const [endsOn, setEndsOn] = useState('')
  const [sendTo, setSendTo] = useState('')

  /* columns: a template, or Build manually */
  const [mode, setMode] = useState<'none' | 'manual' | string>('none')
  const [tq, setTq] = useState('')
  const [sort, setSort] = useState('Recently used')
  const [favOnly, setFavOnly] = useState(false)
  const [selected, setSelected] = useState<string[]>([])
  const [tplName, setTplName] = useState('')
  const universe = columnsFor(type)
  const switchType = (t: string) => { setType(t as 'Order' | 'Transaction'); setSelected([]); setMode('none') }

  const templates = reports.templates
    .filter((t) => t.type === type && (!favOnly || t.favorite) && t.name.toLowerCase().includes(tq.trim().toLowerCase()))
    .sort((a, b) => (sort === 'Name' ? a.name.localeCompare(b.name) : b.usedAt.localeCompare(a.usedAt)))

  const emails = sendTo.split(/[,;\s]+/).map((e) => e.trim()).filter(Boolean)
  const datesOk = subscribe ? !!start : !!start && !!end && start < end
  const subOk = !subscribe || (!!name.trim() && emails.length > 0 && emails.every(emailOk)
    && (ends !== 'After' || Number(endsAfter) >= 1) && (ends !== 'On Specific Date' || !!endsOn))
  const valid = datesOk && subOk && selected.length > 0
  const missing = [
    !selected.length && 'choose at least one column',
    !datesOk && (subscribe ? 'a start date' : 'a start before the end'),
    subscribe && !name.trim() && 'a report name',
    subscribe && (!emails.length || !emails.every(emailOk)) && 'a valid Send To email',
  ].filter(Boolean) as string[]

  const submit = () => {
    if (!valid) return
    if (subscribe) {
      reportActions.subscribe({
        name: name.trim(), type, frequency: freq, start, ends, sendTo: emails, columns: selected, createdBy: who,
        ...(ends === 'After' ? { endsAfter: Number(endsAfter) } : {}), ...(ends === 'On Specific Date' ? { endsOn } : {}),
      })
      toast.success(`Subscribed — “${name.trim()}” goes to ${emails.length === 1 ? emails[0] : plural(emails.length, 'recipient')} ${freq.toLowerCase()}.`)
    } else {
      reportActions.generate({ type, requestedBy: who, start, end, columns: selected })
      toast.success(`${type} report generated — it is ready to download.`)
    }
    onDone(type)
  }

  return (
    <Modal open wide title="Generate Report" subtitle="You can generate and subscribe the reports" onClose={onClose}
      footer={<>
        {!valid && <span className="mr-auto text-[12px] text-ink-3">To continue, {missing.join(', ')}.</span>}
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button disabled={!valid} onClick={submit}>{subscribe ? 'Subscribe' : 'Generate'}</Button>
      </>}>
      <div className="grid grid-cols-1 gap-5 pb-3 md:grid-cols-[250px_minmax(0,1fr)]">
        {/* ---- Report Settings ---- */}
        <div className="flex flex-col gap-3 md:border-r md:border-line md:pr-5">
          <p className="text-[15px] font-bold text-ink">Report Settings</p>
          <Field label="Report Type" required>
            <MenuSelect value={type} onChange={switchType} options={['Order', 'Transaction']} />
          </Field>
          <DateTimePicker label="Start Date & Time" value={start} onChange={setStart} required max={subscribe ? undefined : end || undefined} />
          {!subscribe && <DateTimePicker label="End Date & Time" value={end} onChange={setEnd} required min={start || undefined} />}
          <label className="flex items-center justify-between gap-3 text-[13px] text-ink-2">
            I want to subscribe this report
            <Toggle checked={subscribe} onChange={setSubscribe} />
          </label>
          {subscribe && (
            <>
              <Field label="Report Name" required><Input value={name} onChange={setName} placeholder="e.g. Weekly order summary" /></Field>
              <div>
                <p className="mb-1.5 text-[12px] text-ink-3">Frequency</p>
                <div className="flex gap-2">
                  {FREQS.map((f) => (
                    <button key={f} type="button" onClick={() => setFreq(f)} aria-pressed={f === freq}
                      className={`rounded-full border px-3 py-1 text-[12px] ${f === freq ? 'border-ink bg-warm-50 font-bold text-ink' : 'border-line text-ink-2 hover:border-warm-300'}`}>{f}</button>
                  ))}
                </div>
              </div>
              <div>
                <p className="mb-1.5 text-[12px] text-ink-3">Ends</p>
                <div className="flex flex-col gap-1.5" role="radiogroup">
                  {ENDS.map((e) => (
                    <label key={e} className="flex items-center gap-2 text-[13px] text-ink-2">
                      <input type="radio" name="ends" checked={ends === e} onChange={() => setEnds(e)} className="accent-[var(--color-ink)]" />
                      {e}
                      {e === 'After' && ends === 'After' && (
                        <span className="flex w-24 items-center gap-1"><Input type="number" value={endsAfter} onChange={setEndsAfter} /> runs</span>
                      )}
                    </label>
                  ))}
                  {ends === 'On Specific Date' && <DateInput value={endsOn} onChange={setEndsOn} />}
                </div>
              </div>
              <Field label="Send To" required>
                <Input value={sendTo} onChange={setSendTo} placeholder="name@company.com, …" />
              </Field>
            </>
          )}
        </div>

        {/* ---- Columns ---- */}
        <div className="min-w-0">
          <p className="text-[15px] font-bold text-ink">Columns</p>
          <p className="mb-3 text-[12px] text-ink-3">Choose a template or select columns manually for your {type} report</p>
          <p className="mb-1.5 text-[13px] font-bold text-ink">Choose Template</p>
          <div className="mb-3 flex items-center gap-2">
            <div className="relative min-w-0 flex-1">
              <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-3" />
              <input value={tq} onChange={(e) => setTq(e.target.value)} placeholder="Search templates…"
                className="h-8 w-full rounded-md border border-warm-300 bg-surface pl-8 pr-3 text-[13px] text-ink outline-none focus:border-ink" />
            </div>
            <div className="w-36"><MenuSelect value={sort} onChange={setSort} options={['Recently used', 'Name']} /></div>
            <button type="button" onClick={() => setFavOnly((v) => !v)} aria-pressed={favOnly}
              className={`inline-flex h-8 items-center gap-1 rounded-full border px-3 text-[12px] ${favOnly ? 'border-ink bg-warm-50 font-bold text-ink' : 'border-line text-ink-2'}`}>
              <Star size={13} />Favorites
            </button>
          </div>
          <button type="button" onClick={() => setMode('manual')} aria-pressed={mode === 'manual'}
            className={`mb-2 flex w-full items-center gap-2.5 rounded-md border px-3 py-2 text-left ${mode === 'manual' ? 'border-ink bg-warm-50' : 'border-line hover:border-warm-300'}`}>
            <Wrench size={15} className="shrink-0 text-ink-3" />
            <span><span className="block text-[13px] font-bold text-ink">Build manually</span>
              <span className="block text-[12px] text-ink-3">Select columns without using a template</span></span>
          </button>
          {templates.length === 0 ? (
            <p className="py-3 text-center text-[12px] text-ink-3">
              {favOnly || tq ? 'No templates match.' : 'No templates yet. Build your first template by selecting columns and saving.'}
            </p>
          ) : (
            <div className="mb-2 flex flex-col gap-1.5">
              {templates.map((t) => (
                <div key={t.id} className={`flex items-center gap-2 rounded-md border px-3 py-2 ${mode === t.id ? 'border-ink bg-warm-50' : 'border-line'}`}>
                  <button type="button" className="min-w-0 flex-1 text-left"
                    onClick={() => { setMode(t.id); setSelected(t.columns.filter((id) => universe.some((c) => c.id === id))); reportActions.useTemplate(t.id) }}>
                    <span className="block truncate text-[13px] font-bold text-ink">{t.name}</span>
                    <span className="block text-[12px] text-ink-3">{plural(t.columns.length, 'column')}</span>
                  </button>
                  <button type="button" title={t.favorite ? 'Remove from favorites' : 'Add to favorites'} onClick={() => reportActions.toggleFavorite(t.id)}
                    className={t.favorite ? 'text-ink' : 'text-warm-400 hover:text-ink'}><Star size={15} fill={t.favorite ? 'currentColor' : 'none'} /></button>
                </div>
              ))}
            </div>
          )}
          {mode !== 'none' && (
            <>
              <ColumnPicker universe={universe} selected={selected} onChange={setSelected} />
              {mode === 'manual' && selected.length > 0 && (
                <div className="mt-3 flex items-end gap-2">
                  <div className="flex-1"><Field label="Save as template"><Input value={tplName} onChange={setTplName} placeholder="Template name" /></Field></div>
                  <Button variant="outline" disabled={!tplName.trim()} onClick={() => {
                    const t = reportActions.saveTemplate({ name: tplName.trim(), type, columns: selected })
                    setMode(t.id); setTplName(''); toast.success(`Template “${t.name}” saved.`)
                  }}>Save</Button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </Modal>
  )
}

/** Available Columns (search · Select all · collapsible groups with All) | Selected Columns (n). */
function ColumnPicker({ universe, selected, onChange }: { universe: ReportColumn[]; selected: string[]; onChange: (v: string[]) => void }) {
  const [q, setQ] = useState('')
  const [closed, setClosed] = useState<Set<string>>(new Set())
  const needle = q.trim().toLowerCase()
  const shown = universe.filter((c) => !needle || c.label.toLowerCase().includes(needle))
  const groups = [...new Set(shown.map((c) => c.group))]
  const has = (id: string) => selected.includes(id)
  const toggle = (id: string) => onChange(has(id) ? selected.filter((x) => x !== id) : [...selected, id])
  const setMany = (ids: string[], on: boolean) => onChange(on ? [...selected, ...ids.filter((id) => !has(id))] : selected.filter((x) => !ids.includes(x)))
  const allShown = shown.length > 0 && shown.every((c) => has(c.id))
  const byId = new Map(universe.map((c) => [c.id, c]))
  return (
    <div className="mt-2 grid grid-cols-2 gap-3">
      <div className="flex min-w-0 flex-col rounded-md border border-line">
        <div className="border-b border-line px-3 py-2">
          <p className="mb-1.5 text-[13px] font-bold text-ink">Available Columns</p>
          <Input value={q} onChange={setQ} placeholder="Search columns" />
          <div className="mt-1.5"><Checkbox checked={allShown} indeterminate={!allShown && shown.some((c) => has(c.id))}
            onChange={(v) => setMany(shown.map((c) => c.id), v)} label={<span className="text-[12px]">Select all</span>} /></div>
        </div>
        <div className="max-h-[300px] overflow-y-auto py-1">
          {groups.map((g) => {
            const cols = shown.filter((c) => c.group === g)
            const isClosed = closed.has(g) && !needle
            const all = cols.every((c) => has(c.id))
            return (
              <div key={g}>
                <div className="flex items-center justify-between px-3 py-1.5">
                  <button type="button" onClick={() => setClosed((s) => { const n = new Set(s); n.has(g) ? n.delete(g) : n.add(g); return n })}
                    className="flex items-center gap-1 text-[12px] font-bold uppercase tracking-wide text-ink-3">
                    {isClosed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}{g} <span className="font-normal normal-case">({cols.length})</span>
                  </button>
                  <button type="button" onClick={() => setMany(cols.map((c) => c.id), !all)} className="text-[12px] font-bold text-ink-2 hover:text-ink">{all ? 'None' : 'All'}</button>
                </div>
                {!isClosed && cols.map((c) => (
                  <div key={c.id} className="px-5 py-0.5"><Checkbox checked={has(c.id)} onChange={() => toggle(c.id)} label={<span className="text-[13px]">{c.label}</span>} /></div>
                ))}
              </div>
            )
          })}
        </div>
      </div>
      <div className="flex min-w-0 flex-col rounded-md border border-line">
        <div className="flex items-center justify-between border-b border-line px-3 py-2">
          <p className="text-[13px] font-bold text-ink">Selected Columns ({selected.length})</p>
          {selected.length > 0 && <button type="button" onClick={() => onChange([])} className="text-[12px] font-bold text-ink-2 hover:text-ink">Clear</button>}
        </div>
        <div className="max-h-[352px] overflow-y-auto py-1">
          {selected.length === 0 ? (
            <p className="px-3 py-6 text-center text-[12px] text-ink-3">Select columns from the left panel</p>
          ) : selected.map((id, i) => (
            <div key={id} className="flex items-center gap-2 px-3 py-1 hover:bg-warm-50">
              <span className="w-5 text-right text-[11px] text-ink-3">{i + 1}</span>
              <span className="min-w-0 flex-1 truncate text-[13px] text-ink">{byId.get(id)?.label ?? id}</span>
              <button type="button" aria-label={`Remove ${id}`} onClick={() => toggle(id)} className="text-ink-3 hover:text-ink"><X size={13} /></button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
