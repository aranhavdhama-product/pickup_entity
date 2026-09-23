/**
 * Grow → My Consignments (`/grow/consignments`).
 *
 * A read-only browse of the merchant's first-mile consignments across every
 * state — so the merchant can see what's still awaiting pickup, what's picked up,
 * what's at the facility, and which pickup request each one is linked to.
 */
import { useEffect, useMemo, useState } from 'react'
import { Boxes } from 'lucide-react'
import { Checkbox, MenuSelect, SearchInput, StatusPill } from '../../nueva/components'
import { toast } from '../../nueva/toast'
import { usePickupDb } from '../../pickup/store'
import { LOCATIONS } from '../../pickup/seed'
import type { ConsignmentState } from '../../pickup/types'
import { useGrow } from './GrowLayout'
import { Card, Chip, ScheduleSheet, SelectionBar } from './sheets'

const STATE_TONE: Record<ConsignmentState, 'success' | 'info' | 'warning' | 'danger' | 'neutral'> = {
  CREATED: 'info', PICKUP_PLANNED: 'neutral', PICKED_UP: 'warning', AT_FACILITY: 'success',
  OUT_FOR_DELIVERY: 'warning', DELIVERED: 'success', RTO: 'danger',
}
const STATE_LABEL: Record<ConsignmentState, string> = {
  CREATED: 'Awaiting pickup', PICKUP_PLANNED: 'Pickup planned', PICKED_UP: 'Picked up',
  AT_FACILITY: 'At facility', OUT_FOR_DELIVERY: 'Out for delivery', DELIVERED: 'Delivered', RTO: 'Returned',
}

const STATE_FILTER = 'ALL'

export default function ConsignmentsPage() {
  const db = usePickupDb()
  const { merchantCode, merchantName, locations } = useGrow()

  const [state, setState] = useState<string>(STATE_FILTER)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const [scheduleOpen, setScheduleOpen] = useState(false)

  // merchantCode is owned by the layout; a switch can strand a state filter that
  // the new merchant has no rows for (its option vanishes from the list) — reset.
  useEffect(() => { setState(STATE_FILTER); setQuery(''); setSelected([]) }, [merchantCode])

  const showLocationCol = locations.length > 1

  const all = useMemo(
    () => db.consignments
      .filter((c) => c.leg === 'FIRST_MILE' && c.merchantCode === merchantCode)
      .sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true })),
    [db.consignments, merchantCode],
  )

  const states = [STATE_FILTER, ...new Set(all.map((c) => c.state))]
  const q = query.trim().toLowerCase()
  const rows = all.filter((c) => {
    if (state !== STATE_FILTER && c.state !== state) return false
    if (!q) return true
    return c.id.toLowerCase().includes(q)
      || c.orderId.toLowerCase().includes(q)
      || c.deliveryName.toLowerCase().includes(q)
      || c.deliveryCity.toLowerCase().includes(q)
  })

  // a consignment can be picked up only if it isn't already on a request / picked up
  const isEligible = (c: (typeof rows)[number]) =>
    c.leg === 'FIRST_MILE' && !c.linkedPrId && c.state === 'CREATED'
  const eligibleRows = rows.filter(isEligible)
  const chosen = eligibleRows.filter((c) => selected.includes(c.id))
  const selectedLocations = [...new Set(chosen.map((c) => c.pickupLocationCode ?? ''))]
  const oneLocation = selectedLocations.length === 1
  const scheduleLocation = oneLocation ? selectedLocations[0] : ''
  const totalPieces = chosen.reduce((n, c) => n + c.pieces.length, 0)
  const totalWeight = chosen.reduce((n, c) => n + c.weightKg, 0)

  const toggleRow = (id: string) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))
  const allEligibleSelected = eligibleRows.length > 0 && eligibleRows.every((c) => selected.includes(c.id))
  const toggleAll = () => setSelected(allEligibleSelected ? [] : eligibleRows.map((c) => c.id))

  const openSchedule = () => {
    if (!selected.length) return
    if (!oneLocation) {
      toast.error('Select consignments from a single location to schedule a pickup.')
      return
    }
    setScheduleOpen(true)
  }

  return (
    <>
      <div className="mb-5">
        <h1 className="text-[22px] font-black tracking-tight text-ink">My consignments</h1>
        <p className="mt-1 text-[13px] text-ink-3">
          Every first-mile parcel for {merchantName} — from awaiting pickup through to the facility.
        </p>
      </div>

      <Card title="First-mile consignments" subtitle={`${rows.length} of ${all.length} shown`}
        right={
          <div className="flex items-center gap-2">
            <div className="w-44">
              <MenuSelect
                value={state} options={states}
                labels={(v) => (v === STATE_FILTER ? 'All states' : STATE_LABEL[v as ConsignmentState] ?? v)}
                onChange={setState}
              />
            </div>
            <div className="w-52">
              <SearchInput value={query} onChange={setQuery} placeholder="Search id, delivery…" />
            </div>
          </div>
        }>
        {rows.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-5 py-14 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-warm-100 text-warm-500">
              <Boxes size={24} />
            </span>
            <p className="text-[15px] font-bold text-ink">No consignments</p>
            <p className="max-w-sm text-[13px] text-ink-3">
              {all.length === 0
                ? `No first-mile consignments for ${merchantName} yet.`
                : 'No consignments match your filters.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-line bg-thead text-left text-[12px] font-bold text-ink-3">
                  <th className="w-10 px-3 py-2.5">
                    <Checkbox
                      checked={allEligibleSelected}
                      indeterminate={selected.length > 0 && !allEligibleSelected}
                      onChange={toggleAll}
                    />
                  </th>
                  <th className="px-5 py-2.5">Consignment</th>
                  <th className="px-3 py-2.5">Delivery</th>
                  {showLocationCol && <th className="px-3 py-2.5">Location</th>}
                  <th className="px-3 py-2.5 text-right">Pieces</th>
                  <th className="px-3 py-2.5 text-right">Weight</th>
                  <th className="px-3 py-2.5">Pickup request</th>
                  <th className="px-3 py-2.5">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.id} className={`border-b border-line transition-colors last:border-0 ${selected.includes(c.id) ? 'bg-brand-50' : 'hover:bg-warm-50'}`}>
                    <td className="px-3 py-3">
                      {isEligible(c)
                        ? <Checkbox checked={selected.includes(c.id)} onChange={() => toggleRow(c.id)} />
                        : <span className="block h-3.5 w-3.5" />}
                    </td>
                    <td className="px-5 py-3">
                      <span className="font-mono text-[12px] font-bold text-brand-500">{c.id}</span>
                      <span className="ml-1.5 font-mono text-[11.5px] text-ink-3">{c.orderId}</span>
                      {!c.scannable && <span className="ml-1.5"><Chip>SKU</Chip></span>}
                      {c.createdVia === 'SOFT_DATA' && <span className="ml-1.5"><Chip tone="brand">Soft data</Chip></span>}
                    </td>
                    <td className="px-3 py-3">
                      <span className="block text-ink">{c.deliveryName}</span>
                      <span className="block text-[12px] text-ink-3">{c.deliveryCity || '—'}</span>
                    </td>
                    {showLocationCol && (
                      <td className="px-3 py-3 text-[12px] text-ink-2">
                        {LOCATIONS[c.pickupLocationCode ?? '']?.name ?? c.pickupLocationCode ?? '—'}
                      </td>
                    )}
                    <td className="px-3 py-3 text-right tabular-nums text-ink-2">
                      {c.pieces.length || (c.skus?.length ? `${c.skus.length} SKU` : 0)}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums text-ink-2">{c.weightKg} kg</td>
                    <td className="px-3 py-3">
                      {c.linkedPrId
                        ? <span className="font-mono text-[12px] text-ink-2">{c.linkedPrId}</span>
                        : <span className="text-[12px] text-ink-3">—</span>}
                    </td>
                    <td className="px-3 py-3">
                      <StatusPill label={STATE_LABEL[c.state]} tone={STATE_TONE[c.state]} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <SelectionBar
        count={selected.length} pieces={totalPieces} weight={totalWeight}
        oneLocation={oneLocation} location={scheduleLocation}
        onClear={() => setSelected([])} onRequest={openSchedule}
      />
      <ScheduleSheet
        open={scheduleOpen} onClose={() => setScheduleOpen(false)}
        merchant={merchantCode} locationCode={scheduleLocation}
        consignmentIds={selected} pieceCount={totalPieces}
        onDone={() => { setScheduleOpen(false); setSelected([]) }}
      />
    </>
  )
}
