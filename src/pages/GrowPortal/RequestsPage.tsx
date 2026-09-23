/**
 * Grow → My Pickup Requests (`/grow/requests`).
 *
 * The full list of the merchant's pickup requests — live ones first, then
 * history — as a proper page: a table with id, slot, type chips, source, status
 * and progress, plus an inline expandable detail. Filters: status + search.
 */
import { Fragment, useEffect, useMemo, useState } from 'react'
import { CalendarClock, ClipboardList, ChevronDown } from 'lucide-react'
import { MenuSelect, SearchInput, StatusPill } from '../../nueva/components'
import { livePrsAt, pickupProgress, usePickupDb } from '../../pickup/store'
import type { PRStatus } from '../../pickup/types'
import { useGrow } from './GrowLayout'
import { Card, Chip, RAN, STATUS_LABEL, STATUS_TONE } from './sheets'

const STATUS_FILTER = 'ALL'
const STATUS_OPTIONS: (PRStatus | typeof STATUS_FILTER)[] = [
  STATUS_FILTER, 'OPEN', 'PLANNED', 'IN_PROGRESS', 'COMPLETED', 'COMPLETED_SHORT', 'FAILED', 'CANCELLED',
]

export default function RequestsPage() {
  const db = usePickupDb()
  const { merchantCode, merchantName, locations } = useGrow()

  const [status, setStatus] = useState<string>(STATUS_FILTER)
  const [query, setQuery] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)

  // reset page-local filters/expansion when the layout switches merchant
  useEffect(() => { setStatus(STATUS_FILTER); setQuery(''); setExpanded(null) }, [merchantCode])

  // live PRs first (per location), then everything else for the merchant.
  // livePrsAt and the history filter don't overlap, so no dedupe is needed.
  const all = useMemo(
    () => locations
      .flatMap((l) => livePrsAt(db, merchantCode, l.code))
      .concat(db.pickupRequests.filter((p) =>
        p.merchantCode === merchantCode && p.status !== 'OPEN' && p.status !== 'PLANNED'))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [db.pickupRequests, merchantCode], // eslint-disable-line react-hooks/exhaustive-deps
  )

  const q = query.trim().toLowerCase()
  const rows = all.filter((p) => {
    if (status !== STATUS_FILTER && p.status !== status) return false
    if (!q) return true
    return p.id.toLowerCase().includes(q)
      || p.locationName.toLowerCase().includes(q)
      || p.source.toLowerCase().includes(q)
  })

  return (
    <>
      <div className="mb-5">
        <h1 className="text-[22px] font-black tracking-tight text-ink">My pickup requests</h1>
        <p className="mt-1 text-[13px] text-ink-3">
          Every pickup you've raised for {merchantName} — track status and progress in real time.
        </p>
      </div>

      <Card title="Pickup requests" subtitle={`${rows.length} of ${all.length} shown`}
        right={
          <div className="flex items-center gap-2">
            <div className="w-44">
              <MenuSelect
                value={status} options={STATUS_OPTIONS}
                labels={(v) => (v === STATUS_FILTER ? 'All statuses' : STATUS_LABEL[v as PRStatus])}
                onChange={setStatus}
              />
            </div>
            <div className="w-52">
              <SearchInput value={query} onChange={setQuery} placeholder="Search id, location…" />
            </div>
          </div>
        }>
        {rows.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-5 py-14 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-warm-100 text-warm-500">
              <ClipboardList size={24} />
            </span>
            <p className="text-[15px] font-bold text-ink">No pickup requests</p>
            <p className="max-w-sm text-[13px] text-ink-3">
              {all.length === 0
                ? `Nothing booked for ${merchantName} yet. Raise a pickup to see it tracked here.`
                : 'No requests match your filters.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-line bg-thead text-left text-[12px] font-bold text-ink-3">
                  <th className="px-5 py-2.5">Request</th>
                  <th className="px-3 py-2.5">Slot</th>
                  <th className="px-3 py-2.5">Type</th>
                  <th className="px-3 py-2.5">Source</th>
                  <th className="px-3 py-2.5 text-right">Progress</th>
                  <th className="px-3 py-2.5">Status</th>
                  <th className="w-10 px-3 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => {
                  const prog = pickupProgress(db, p.id)
                  const open = expanded === p.id
                  const chips = [p.blind ? 'Blind' : 'Scheduled', p.scannable ? 'Scan' : 'Count']
                  return (
                    <Fragment key={p.id}>
                      <tr onClick={() => setExpanded(open ? null : p.id)}
                        className={`cursor-pointer border-b border-line transition-colors ${open ? 'bg-warm-50' : 'hover:bg-warm-50'}`}>
                        <td className="px-5 py-3">
                          <span className="font-mono text-[12px] font-bold text-brand-500">{p.id}</span>
                          <span className="ml-1.5 text-[12px] text-ink-3">{p.locationName}</span>
                        </td>
                        <td className="px-3 py-3 text-[12.5px] text-ink-2">
                          {p.slot ? `${p.slot.date} · ${p.slot.start}–${p.slot.end}` : 'No slot'}
                        </td>
                        <td className="px-3 py-3">
                          <span className="flex flex-wrap gap-1.5">
                            {chips.map((c) => <Chip key={c}>{c}</Chip>)}
                          </span>
                        </td>
                        <td className="px-3 py-3"><Chip>{p.source}</Chip></td>
                        <td className="px-3 py-3 text-right tabular-nums text-ink-2">
                          {RAN.includes(p.status) ? `${prog.collected}/${prog.expected}` : '—'}
                        </td>
                        <td className="px-3 py-3">
                          <StatusPill label={STATUS_LABEL[p.status]} tone={STATUS_TONE[p.status]} />
                        </td>
                        <td className="px-3 py-3 text-right">
                          <ChevronDown size={14} className={`text-warm-400 transition-transform ${open ? 'rotate-180' : ''}`} />
                        </td>
                      </tr>
                      {open && (
                        <tr className="border-b border-line bg-warm-25">
                          <td colSpan={7} className="px-5 pb-4 pt-3">
                            <dl className="grid grid-cols-2 gap-x-8 gap-y-1.5 text-[12.5px] sm:grid-cols-4">
                              <div className="flex justify-between gap-3 sm:block">
                                <dt className="text-ink-3">Location</dt>
                                <dd className="text-ink sm:mt-0.5">{p.locationName}</dd>
                              </div>
                              <div className="flex justify-between gap-3 sm:block">
                                <dt className="text-ink-3">Expected pieces</dt>
                                <dd className="tabular-nums text-ink sm:mt-0.5">{p.expectedPieces ?? '—'}</dd>
                              </div>
                              <div className="flex justify-between gap-3 sm:block">
                                <dt className="text-ink-3">Expected weight</dt>
                                <dd className="tabular-nums text-ink sm:mt-0.5">
                                  {p.expectedWeightKg != null ? `${p.expectedWeightKg} kg` : '—'}
                                </dd>
                              </div>
                              <div className="flex justify-between gap-3 sm:block">
                                <dt className="text-ink-3">Consignments</dt>
                                <dd className="tabular-nums text-ink sm:mt-0.5">
                                  {p.blind ? '— (blind)' : p.consignmentIds.length}
                                </dd>
                              </div>
                              {p.failureReason && (
                                <div className="flex justify-between gap-3 sm:block">
                                  <dt className="text-ink-3">Reason</dt>
                                  <dd className="text-danger-fg sm:mt-0.5">{p.failureReason}</dd>
                                </div>
                              )}
                            </dl>
                            {p.events.length > 0 && (
                              <p className="mt-3 flex items-center gap-1.5 text-[11.5px] text-ink-3">
                                <CalendarClock size={12} />
                                Last update: {p.events[p.events.length - 1].label}
                                <span className="text-warm-400">
                                  · {new Date(p.events[p.events.length - 1].at).toLocaleString()}
                                </span>
                              </p>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  )
}
