/**
 * Pickup Schedules — save, pause and GENERATE (Skynet First Mile, 2026-10-07). The pure shape, validation and run
 * matching are in `scheduleModel.ts`; this module needs the order store, so it is the one that WRITES:
 *
 *   · `saveSchedule` / `setScheduleStatus` — validate, store, and log every change with who / when / what (FR-02.6);
 *   · `runGenerator` — the daily job and "Generate now" (FR-03.x): close the requests nobody assigned yesterday,
 *     create one request per active run per operating day for the horizon (never a second one — schedule + run + date
 *     is the key), then link waybills that were waiting to the run they fall in. It never throws: a failure is the
 *     returned run (`status: 'Failed'`) so the page can alert, and the next load retries;
 *   · `ensureDailyRun` — once a day, on app load (the prototype's stand-in for the hub-local timer).
 */
import { growOrderActions, growOrdersSnapshot } from './store'
import { readPickupModuleConfig } from '../config/pickupModule'
import { pickupPolicy } from './pickupSlots'
import {
  activeSchedulesAt, addDays, dayOf, daysText, keyOfPr, refOf, runLabel, scheduleKey, scheduleStore, validateSchedule, ymd,
  type GeneratorRun, type PickupSchedule, type ScheduleAudit,
} from './scheduleModel'
import { inboundHubFor } from './hubs'
import type { StoreLocation } from './types'

const pad = (n: number) => String(n).padStart(2, '0')
const nowLocal = (d: Date) => `${ymd(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`

/** a blank schedule for a location: Monday–Friday, one 09:00–12:00 run, starting today */
export function newSchedule(store: StoreLocation | undefined): PickupSchedule {
  const n = scheduleStore.get().schedules.reduce((m, s) => Math.max(m, Number(s.code.replace(/\D/g, '')) || 0), 0) + 1
  return {
    id: `sch-${Date.now().toString(36)}${n}`, code: `SCH-${String(n).padStart(4, '0')}`, storeCode: store?.code ?? '',
    hubCode: store ? inboundHubFor(store.party) : '', days: [1, 2, 3, 4, 5],
    runs: [{ id: `r${Math.random().toString(36).slice(2, 7)}`, start: '09:00', end: '12:00', serviceTimeMin: 0, vehicleType: '' }],
    effectiveFrom: ymd(new Date()), effectiveTo: '', status: 'Active', instructions: '', updatedAt: new Date().toISOString(),
  }
}

/** what changed between two versions of a schedule, in words — one line of the change log */
function changeText(before: PickupSchedule | undefined, after: PickupSchedule): string {
  if (!before) return `Created — ${daysText(after.days)}, ${after.runs.map(runLabel).join(', ')}`
  const out: string[] = []
  if (daysText(before.days) !== daysText(after.days)) out.push(`Days ${daysText(before.days)} → ${daysText(after.days)}`)
  const b = before.runs.map(runLabel).join(', '), a = after.runs.map(runLabel).join(', ')
  if (b !== a) out.push(`Runs ${b} → ${a}`)
  if (before.status !== after.status) out.push(`${before.status} → ${after.status}`)
  if (before.hubCode !== after.hubCode) out.push(`Hub ${before.hubCode || '—'} → ${after.hubCode || '—'}`)
  if (before.effectiveFrom !== after.effectiveFrom || before.effectiveTo !== after.effectiveTo) {
    out.push(`Dates ${before.effectiveFrom}${before.effectiveTo ? `–${before.effectiveTo}` : ' on'} → ${after.effectiveFrom}${after.effectiveTo ? `–${after.effectiveTo}` : ' on'}`)
  }
  if (before.instructions !== after.instructions) out.push('Instructions changed')
  return out.join('; ') || 'Saved — no change'
}
const logOf = (code: string, by: string, change: string): ScheduleAudit => ({ at: new Date().toISOString(), by, scheduleCode: code, change })

/**
 * A roster that was paused, deleted, re-timed or ended no longer makes the requests it made for the days ahead: its open,
 * UNASSIGNED ones are cancelled (their waybills go back to Ready for Pickup and join the next run). One already planned or
 * assigned is left for the dispatcher — a driver may be on the way. `after` = the schedule as saved (null = deleted).
 */
function retireStaleRequests(id: string, after: PickupSchedule | null) {
  const today = ymd(new Date())
  for (const pr of growOrdersSnapshot().pickupRequests) {
    if (pr.schedule?.id !== id || pr.date < today || pr.status !== 'Requested' || pr.tripId) continue
    const run = after?.runs.find((r) => r.id === pr.schedule!.runId)
    const valid = !!after && after.status === 'Active' && !!run && runLabel(run) === pr.schedule.runLabel && after.days.includes(dayOf(pr.date))
      && pr.date >= after.effectiveFrom && (!after.effectiveTo || pr.date <= after.effectiveTo)
    if (!valid) growOrderActions.cancelPickupRequest(pr.id, 'SCHEDULE_CHANGED')
  }
}

/** Validate and store a schedule (new or edited). Errors come back in words; nothing is written when there are any. */
export function saveSchedule(s: PickupSchedule, by: string): { ok: true } | { ok: false; errors: string[] } {
  const stores = growOrdersSnapshot().stores
  const errors = validateSchedule(s, stores.find((x) => x.code === s.storeCode), scheduleStore.get().schedules)
  if (errors.length) return { ok: false, errors }
  const next: PickupSchedule = { ...s, updatedAt: new Date().toISOString() }
  scheduleStore.update((st) => {
    const before = st.schedules.find((x) => x.id === s.id)
    return {
      ...st,
      schedules: before ? st.schedules.map((x) => (x.id === s.id ? next : x)) : [...st.schedules, next],
      audit: [logOf(s.code, by, changeText(before, next)), ...st.audit].slice(0, 200),
    }
  })
  /* what the edit made stale goes, and what it added is made at once — nobody has to remember to press Generate */
  retireStaleRequests(s.id, next)
  runGenerator('Schedule change')
  return { ok: true }
}

/** Pause / resume without deleting (FR-02.5). Resuming re-checks the schedule (a location may have lost its address). */
export function setScheduleStatus(id: string, status: PickupSchedule['status'], by: string): { ok: true } | { ok: false; errors: string[] } {
  const cur = scheduleStore.get().schedules.find((x) => x.id === id)
  if (!cur) return { ok: false, errors: ['That schedule is gone.'] }
  return saveSchedule({ ...cur, status }, by)
}

export function removeSchedule(id: string, by: string) {
  scheduleStore.update((st) => {
    const cur = st.schedules.find((x) => x.id === id)
    return cur ? { ...st, schedules: st.schedules.filter((x) => x.id !== id), audit: [logOf(cur.code, by, 'Deleted'), ...st.audit].slice(0, 200) } : st
  })
  retireStaleRequests(id, null)
  runGenerator('Schedule change')
}

export function setHorizon(days: number) {
  scheduleStore.update((st) => ({ ...st, horizonDays: Math.min(14, Math.max(1, Math.round(days) || 1)) }))
}

/**
 * The daily job / "Generate now". `from` is the first date (default today), the horizon is the stored one. Idempotent: run it
 * twice and the second run creates nothing. Never throws — a failure is the returned run.
 */
export function runGenerator(by: GeneratorRun['by'], opts: { from?: string; hubCode?: string } = {}): GeneratorRun {
  const now = new Date()
  const today = ymd(now)
  const from = opts.from && opts.from >= today ? opts.from : today
  const st = scheduleStore.get()
  const to = addDays(from, st.horizonDays - 1)
  let run: GeneratorRun
  /* pickups switched off (Settings → Pickup module): the roster makes nothing, and says so */
  if (!readPickupModuleConfig().enabled) {
    run = { at: now.toISOString(), by, from, to, created: 0, existing: 0, closed: 0, linked: 0, status: 'Success', message: 'Pickups are switched off — nothing was generated' }
    scheduleStore.update((s) => ({ ...s, lastRun: run }))
    return run
  }
  try {
    /* 1 — yesterday's collections nobody assigned are closed (23:59); their waybills wait for the next run */
    const closed = growOrderActions.closeUnassignedScheduleRequests(today).length
    /* 2 — one request per active run per operating day, once */
    /* a request the roster itself retired (paused / re-timed / deleted → SCHEDULE_CHANGED) does not hold its slot — resuming the
       schedule makes it again; one an OPERATOR cancelled, failed or completed does (that day's run is settled, never resurrected) */
    const have = new Set(growOrdersSnapshot().pickupRequests
      .filter((p) => !(p.status === 'Cancelled' && p.cancelReason === 'SCHEDULE_CHANGED'))
      .map(keyOfPr).filter((k): k is string => !!k))
    let created = 0, existing = 0
    for (let date = from; date <= to; date = addDays(date, 1)) {
      const dow = dayOf(date)
      for (const s of st.schedules) {
        if (opts.hubCode && s.hubCode !== opts.hubCode) continue
        if (!activeSchedulesAt(st, s.storeCode, date).includes(s) || !s.days.includes(dow)) continue
        const policy = pickupPolicy(null, { pickupLocationCode: s.storeCode, hubCode: s.hubCode || null })
        /* a closed day or a hub holiday is no pickup day */
        if (!policy.businessDays.includes(dow) || policy.holidays?.[date]) continue
        for (const r of s.runs) {
          const key = scheduleKey(s.id, r.id, date)
          if (have.has(key)) { existing++; continue }
          const startAt = `${date}T${r.start}`, endAt = `${date}T${r.end}`
          if (endAt <= nowLocal(now)) continue   // a run that has already ended is not made today
          growOrderActions.createSchedulePickup({ storeCode: s.storeCode, destinationCode: s.hubCode || null, startAt, endAt, schedule: refOf(s, r, date), instructions: s.instructions })
          have.add(key); created++
        }
      }
    }
    /* 3 — waybills that were waiting (new location on a roster, a closed run's) join the run they fall in */
    let linked = 0
    for (const o of growOrdersSnapshot().orders) if (growOrderActions.joinScheduledRun(o.id)) linked++
    const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`
    run = {
      at: now.toISOString(), by, from, to, created, existing, closed, linked, status: 'Success',
      message: `${plural(created, 'pickup request')} created for ${from === to ? from : `${from} → ${to}`}`
        + `${existing ? ` · ${existing} already there` : ''}${closed ? ` · ${closed} unassigned closed` : ''}${linked ? ` · ${plural(linked, 'waybill')} linked` : ''}`,
    }
  } catch (e) {
    run = { at: now.toISOString(), by, from, to, created: 0, existing: 0, closed: 0, linked: 0, status: 'Failed', message: e instanceof Error ? e.message : 'The run failed' }
  }
  scheduleStore.update((s) => ({ ...s, lastRun: run, lastDailyDate: by === 'Daily job' && run.status === 'Success' ? today : s.lastDailyDate }))
  return run
}

/** The daily job — once a day, on app load, only when a roster is active. A failed run is retried on the next load. */
export function ensureDailyRun(): GeneratorRun | null {
  const st = scheduleStore.get()
  const today = ymd(new Date())
  if (st.lastDailyDate === today || !st.schedules.some((s) => s.status === 'Active')) return null
  return runGenerator('Daily job')
}

