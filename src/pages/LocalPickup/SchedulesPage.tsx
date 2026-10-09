/**
 * Merchant master (`/local/settings/merchant-master`; was Pickup Schedules at `/local/pickup/schedules`, which redirects) — the roster (milk run) master, Skynet First Mile (2026-10-07).
 *
 * A schedule says WHICH merchant location is collected, on WHICH days, in WHICH runs (time windows). Every operating day the
 * daily job turns each active run into ONE pickup request (source "Schedule") — whether or not an order has arrived —
 * and consignments ready at that location join the run they fall in, so nobody books them. Pickup requests then flow
 * exactly like any other: planned and assigned in Pending For Planning, run by the driver, reconciled, closed.
 *
 * The page reads top to bottom: the last generator run (and Generate now) → the schedules (Add · row click to edit ·
 * select to Pause / Resume / Delete) → the change log. One form, one set of choices: location, days, runs, dates, a
 * note for the driver, Active | Paused. What the form refuses at save is in words (`validateSchedule`).
 */
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CalendarClock, CircleAlert, CircleCheck, Pause, Play, Plus, RefreshCw, Trash2, X } from 'lucide-react'
import { Button, DataTable, EmptyState, Field, Input, MenuSelect, Modal, PageHeader, Panel, StatusPill, type SelectionAction } from '../../nueva/components'
import { IconBtn, LocalPage, SearchBox } from '../../local/chrome'
import { toast } from '../../nueva/toast'
import { useGrowOrders } from '../../growOrders/store'
import { INBOUND_HUBS, hubName, inboundHubFor } from '../../growOrders/hubs'
import { hubVehicleTypes, useVehicleConfig } from '../../config/vehicleConfig'
import { merchantsOf } from '../LocalPFP/merchants'
import { merchantOfStore, storeLabel, storeOf } from './prModel'
import {
  DAY_NAMES, WEEK_ORDER, daysText, newRun, runLabel, useSchedules, validateSchedule, ymd,
  type PickupSchedule, type ScheduleRun,
} from '../../growOrders/scheduleModel'
import { newSchedule, removeSchedule, runGenerator, saveSchedule, setHorizon, setScheduleStatus } from '../../growOrders/pickupSchedules'

/** who is signed in — the local app has no session; the console's actor is the change log's name */
const ACTOR = 'console.user'

const when = (iso: string) => new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

/* ------------------------------------------------------------- the form ---- */

function ScheduleForm({ initial, isNew, onClose }: { initial: PickupSchedule; isNew: boolean; onClose: () => void }) {
  const db = useGrowOrders()
  useVehicleConfig()
  const st = useSchedules()
  const [s, setS] = useState<PickupSchedule>(initial)
  const [tried, setTried] = useState(false)
  const merchants = useMemo(() => merchantsOf(db.stores), [db.stores])
  const store = storeOf(s.storeCode, db.stores)
  const merchant = store ? merchantOfStore(store.code, db.stores) : ''
  const stores = merchants.find((m) => m.name === merchant)?.stores ?? []
  const errors = validateSchedule(s, store, st.schedules)
  const vehicleOpts = ['', ...hubVehicleTypes(s.hubCode || null).map((v) => v.name)]
  const set = (p: Partial<PickupSchedule>) => setS((x) => ({ ...x, ...p }))
  const setRun = (id: string, p: Partial<ScheduleRun>) => set({ runs: s.runs.map((r) => (r.id === id ? { ...r, ...p } : r)) })
  const pickStore = (code: string) => {
    /* the servicing hub follows the location (where its parcels are dropped) until it is set by hand */
    const st = storeOf(code, db.stores)
    set({ storeCode: code, hubCode: st ? inboundHubFor(st.party) : s.hubCode })
  }
  const save = () => {
    setTried(true)
    const r = saveSchedule(s, ACTOR)
    if (!r.ok) return
    toast.success(`${s.code} saved${s.status === 'Active' ? ' — requests are made from the next generation' : ' (paused)'}`)
    onClose()
  }
  const history = st.audit.filter((a) => a.scheduleCode === s.code).slice(0, 4)
  return (
    <Modal open wide title={isNew ? 'New pickup schedule' : `Pickup schedule ${s.code}`}
      subtitle="Collect a merchant location on set days, in set runs — a pickup request is made for each run, every day."
      onClose={onClose}
      footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={save}>Save schedule</Button></>}>
      <div className="flex flex-col gap-5 pb-3">
        <div className="grid grid-cols-2 items-end gap-3">
          <Field label="Merchant" required>
            <MenuSelect value={merchant} placeholder="Select merchant" searchable options={merchants.map((m) => m.name)}
              onChange={(v) => { const first = merchants.find((m) => m.name === v)?.stores[0]; if (first) pickStore(first.code) }} />
          </Field>
          <Field label="Pickup address" required>
            <MenuSelect value={s.storeCode} placeholder={merchant ? 'Select pickup address' : 'Pick a merchant first'} options={stores.map((x) => x.code)}
              labels={(c) => { const x = storeOf(c, db.stores); return x ? storeLabel(x) : c }} onChange={pickStore} />
          </Field>
        </div>

        <div>
          <p className="mb-1.5 text-[13px] font-bold text-ink">Days</p>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Days of the week">
            {WEEK_ORDER.map((d) => {
              const on = s.days.includes(d)
              return (
                <button key={d} type="button" aria-pressed={on} onClick={() => set({ days: on ? s.days.filter((x) => x !== d) : [...s.days, d] })}
                  className={`inline-flex h-8 min-w-[52px] items-center justify-center rounded-md border px-3 text-[13px] transition-colors
                    ${on ? 'border-ink bg-warm-50 font-bold text-ink' : 'border-line bg-surface text-ink-2 hover:border-warm-300'}`}>
                  {DAY_NAMES[d]}
                </button>
              )
            })}
          </div>
        </div>

        <div>
          <p className="mb-1.5 text-[13px] font-bold text-ink">Runs <span className="font-normal text-ink-3">— each one makes its own pickup request</span></p>
          <div className="flex flex-col gap-2">
            {s.runs.map((r) => (
              <div key={r.id} className="grid grid-cols-[120px_120px_1fr_32px] items-center gap-3">
                <Input type="time" value={r.start} onChange={(v) => setRun(r.id, { start: v })} />
                <Input type="time" value={r.end} onChange={(v) => setRun(r.id, { end: v })} />
                <MenuSelect value={r.vehicleType} options={vehicleOpts} labels={(v) => v || 'Any vehicle'} onChange={(v) => setRun(r.id, { vehicleType: v })} />
                <button type="button" aria-label={`Remove run ${runLabel(r)}`} disabled={s.runs.length === 1}
                  onClick={() => set({ runs: s.runs.filter((x) => x.id !== r.id) })}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md text-ink-3 hover:bg-warm-100 hover:text-ink disabled:cursor-not-allowed disabled:opacity-40">
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
          <div className="mt-2">
            <Button size="sm" variant="text" icon={<Plus size={13} />} onClick={() => {
              const last = s.runs[s.runs.length - 1]
              set({ runs: [...s.runs, newRun(last?.end ?? '13:00', last ? `${String(Math.min(23, Number(last.end.slice(0, 2)) + 2)).padStart(2, '0')}:${last.end.slice(3)}` : '15:00')] })
            }}>Add run</Button>
          </div>
        </div>

        <div className="grid grid-cols-3 items-end gap-3">
          <Field label="Starts" required><Input type="date" value={s.effectiveFrom} onChange={(v) => set({ effectiveFrom: v })} /></Field>
          <Field label="Ends"><Input type="date" value={s.effectiveTo} onChange={(v) => set({ effectiveTo: v })} placeholder="Optional" /></Field>
          <Field label="Drops at hub" required>
            <MenuSelect value={s.hubCode} options={INBOUND_HUBS.map((h) => h.code)} labels={(c) => hubName(c) || c} onChange={(v) => set({ hubCode: v })} />
          </Field>
        </div>

        <Field label="Note for the driver"><Input value={s.instructions} onChange={(v) => set({ instructions: v })} placeholder="Optional — gate code, dock, whom to meet" /></Field>

        <div className="flex items-center gap-3 rounded-md border border-line px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-bold text-ink">{s.status === 'Active' ? 'Active' : 'Paused'}</p>
            <p className="text-[12px] text-ink-3">{s.status === 'Active' ? 'Pickup requests are made on the days above.' : 'Nothing is made while it is paused — it is not deleted.'}</p>
          </div>
          <Button variant="outline" size="sm" icon={s.status === 'Active' ? <Pause size={13} /> : <Play size={13} />}
            onClick={() => set({ status: s.status === 'Active' ? 'Paused' : 'Active' })}>
            {s.status === 'Active' ? 'Pause' : 'Resume'}
          </Button>
        </div>

        {tried && errors.length > 0 && (
          <div role="alert" className="rounded-md bg-danger-bg px-4 py-3 text-[13px] text-danger-fg">
            <p className="mb-1 font-bold">Fix before saving</p>
            <ul className="list-disc pl-5">{errors.map((e) => <li key={e}>{e}</li>)}</ul>
          </div>
        )}
        {!isNew && history.length > 0 && (
          <div>
            <p className="mb-1 text-[12px] font-bold text-ink-3">Recent changes</p>
            <ul className="text-[12px] text-ink-2">{history.map((a) => <li key={a.at}>{when(a.at)} · {a.by} · {a.change}</li>)}</ul>
          </div>
        )}
      </div>
    </Modal>
  )
}

/* -------------------------------------------------------------- the page ---- */

export default function SchedulesPage() {
  const nav = useNavigate()
  const db = useGrowOrders()
  const st = useSchedules()
  const [q, setQ] = useState('')
  const [form, setForm] = useState<{ s: PickupSchedule; isNew: boolean } | null>(null)
  const today = ymd(new Date())
  const run = st.lastRun

  const rows = useMemo(() => st.schedules.map((s) => ({
    ...s, merchant: merchantOfStore(s.storeCode, db.stores), place: storeOf(s.storeCode, db.stores)?.name ?? s.storeCode,
    todayCount: db.pickupRequests.filter((p) => p.schedule?.id === s.id && p.date === today).length,
  })).filter((r) => !q.trim() || `${r.code} ${r.merchant} ${r.place}`.toLowerCase().includes(q.trim().toLowerCase())), [st.schedules, db.stores, db.pickupRequests, q, today])

  const generate = () => {
    const r = runGenerator('Generate now')
    if (r.status === 'Success') toast.success(r.message); else toast.error(`The run failed — ${r.message}`)
  }
  const add = () => {
    const first = db.stores[0]
    setForm({ s: newSchedule(first), isNew: true })
  }
  const actions = (sel: PickupSchedule[], clear: () => void): SelectionAction[] => {
    const act = (fn: (s: PickupSchedule) => { ok: true } | { ok: false; errors: string[] }, verb: string) => () => {
      const bad = sel.map((s) => ({ s, r: fn(s) })).filter((x) => !x.r.ok)
      if (bad.length) toast.error(`${bad[0].s.code}: ${(bad[0].r as { errors: string[] }).errors[0]}`)
      else toast.success(`${sel.length} schedule${sel.length === 1 ? '' : 's'} ${verb}`)
      clear()
    }
    return [
      { label: 'Pause', icon: <Pause size={14} />, disabled: sel.every((s) => s.status === 'Paused'), onClick: act((s) => setScheduleStatus(s.id, 'Paused', ACTOR), 'paused') },
      { label: 'Resume', icon: <Play size={14} />, disabled: sel.every((s) => s.status === 'Active'), onClick: act((s) => setScheduleStatus(s.id, 'Active', ACTOR), 'resumed') },
      { label: 'Delete', icon: <Trash2 size={14} />, onClick: act((s) => { removeSchedule(s.id, ACTOR); return { ok: true as const } }, 'deleted') },
    ]
  }

  return (
    <LocalPage>
      {/* the MERCHANT MASTER (owner, 2026-10-08: "do not redirect to the pickup page — call it merchant master"): a settings page of its
          own, not a tab of the Pickup page */}
      <PageHeader title="Merchant master" subtitle="Merchant locations collected on set days — one pickup request per run, with or without orders"
        onBack={() => nav('/local/settings/masters')}
        right={<>
          <SearchBox value={q} onChange={setQ} placeholder="Search schedules" />
          <IconBtn title="Generate now" onClick={generate}><RefreshCw size={16} /></IconBtn>
          <Button icon={<Plus size={14} />} onClick={add}>Add schedule</Button>
        </>} />

      {/* the last run — what the hub manager sees (FR-03.6), and the alert when it failed (FR-03.4) */}
      <div className={`mt-4 flex items-start gap-3 rounded-xl border px-5 py-3.5 ${run?.status === 'Failed' ? 'border-danger-bg bg-danger-bg' : 'border-line bg-surface shadow-ds-1'}`}>
        <span className={`mt-0.5 shrink-0 ${run?.status === 'Failed' ? 'text-danger-fg' : run ? 'text-success-fg' : 'text-ink-3'}`}>
          {run?.status === 'Failed' ? <CircleAlert size={18} /> : run ? <CircleCheck size={18} /> : <CalendarClock size={18} />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-bold text-ink">
            {run ? `${run.by === 'Daily job' ? 'Daily job' : 'Generated manually'} · ${when(run.at)} · ${run.status}` : 'No run yet'}
          </p>
          <p className="text-[12px] text-ink-2">
            {run ? (run.status === 'Failed' ? `${run.message}. It is tried again on the next load — or press Generate now.` : run.message)
              : 'The daily job makes a pickup request for every active run, every operating day. Resume a schedule, then press Generate now.'}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="text-[12px] text-ink-3">Days ahead</span>
          <div className="w-[76px]">
            <MenuSelect value={String(st.horizonDays)} options={['1', '2', '3', '5', '7', '14']} onChange={(v) => setHorizon(Number(v))} />
          </div>
          <Button variant="outline" icon={<RefreshCw size={14} />} onClick={generate}>Generate now</Button>
        </div>
      </div>

      <div className="mt-4">
        {rows.length === 0 ? (
          <Panel>
            <EmptyState title={q ? 'No schedule matches' : 'No pickup schedules yet'}
              hint={q ? 'Clear the search to see them all.' : 'Add one to have a pickup request made for a merchant location on set days, with or without orders.'} />
          </Panel>
        ) : (
          <DataTable rowKey="id" selectable rows={rows}
            columns={[
              { key: 'code', label: 'Schedule', render: (r) => <span className="font-mono text-[12px] font-bold text-ink">{r.code}</span> },
              { key: 'merchant', label: 'Merchant' },
              { key: 'place', label: 'Pickup address' },
              { key: 'days', label: 'Days', render: (r) => daysText(r.days) },
              { key: 'runs', label: 'Runs', render: (r: PickupSchedule) => r.runs.map(runLabel).join(' · ') },
              { key: 'hub', label: 'Drops at', render: (r: PickupSchedule) => hubName(r.hubCode) || r.hubCode || '—' },
              { key: 'dates', label: 'Dates', render: (r: PickupSchedule) => `${r.effectiveFrom}${r.effectiveTo ? ` → ${r.effectiveTo}` : ' on'}` },
              { key: 'today', label: 'Today', align: 'right', render: (r) => (r.todayCount ? `${r.todayCount} request${r.todayCount === 1 ? '' : 's'}` : '—') },
              { key: 'status', label: 'Status', render: (r: PickupSchedule) => <StatusPill label={r.status} tone={r.status === 'Active' ? 'success' : 'neutral'} /> },
            ]}
            selectionActions={(sel, clear) => actions(sel as PickupSchedule[], clear)}
            onRowClick={(r) => setForm({ s: st.schedules.find((x) => x.id === (r as PickupSchedule).id) ?? (r as PickupSchedule), isNew: false })} />
        )}
      </div>

      {st.audit.length > 0 && (
        <details className="mt-6 rounded-xl border border-line bg-surface px-5 py-3 shadow-ds-1">
          <summary className="cursor-pointer text-[13px] font-bold text-ink-2">Change log ({st.audit.length})</summary>
          <ul className="mt-3 divide-y divide-line text-[12px] text-ink-2">
            {st.audit.slice(0, 20).map((a) => (
              <li key={a.at + a.scheduleCode} className="flex gap-3 py-2"><span className="w-28 shrink-0 text-ink-3">{when(a.at)}</span><span className="w-20 shrink-0 font-mono">{a.scheduleCode}</span><span className="w-28 shrink-0">{a.by}</span><span className="min-w-0 flex-1">{a.change}</span></li>
            ))}
          </ul>
        </details>
      )}

      {form && <ScheduleForm key={form.s.id} initial={form.s} isNew={form.isNew} onClose={() => setForm(null)} />}
    </LocalPage>
  )
}
