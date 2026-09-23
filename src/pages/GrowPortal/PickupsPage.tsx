/**
 * Grow → Raise Pickup (`/grow/pickups`).
 *
 * The consignment-LIST-first hero: the merchant's pending first-mile
 * consignments. Select rows and schedule a pickup, or raise a blind pickup when
 * there is no data yet. Both flows preserve duplicate-raise conflict handling.
 */
import { useEffect, useMemo, useState } from 'react'
import { Boxes, Sparkles, Truck } from 'lucide-react'
import { Button, Checkbox } from '../../nueva/components'
import { toast } from '../../nueva/toast'
import { unlinkedFirstMileAt, usePickupDb } from '../../pickup/store'
import { LOCATIONS } from '../../pickup/seed'
import { useGrow } from './GrowLayout'
import { BlindSheet, Card, Chip, ReadyChip, ScheduleSheet, SelectionBar } from './sheets'

export default function PickupsPage() {
  const db = usePickupDb()
  const { merchantCode, merchantName, locations } = useGrow()

  const [selected, setSelected] = useState<string[]>([])
  const [scheduleOpen, setScheduleOpen] = useState(false)
  const [blindOpen, setBlindOpen] = useState(false)

  const showLocationCol = locations.length > 1

  // every unlinked first-mile consignment across the merchant's locations.
  // selector is (db, locationCode, merchantCode?) — location first.
  const pool = useMemo(
    () => locations.flatMap((l) => unlinkedFirstMileAt(db, l.code, merchantCode)),
    [db.consignments, merchantCode], // eslint-disable-line react-hooks/exhaustive-deps
  )

  // switching merchant (owned by the layout) must reset the local selection and
  // close any sheet holding the old merchant's location, or the sticky bar lingers.
  useEffect(() => {
    setSelected([])
    setScheduleOpen(false)
    setBlindOpen(false)
  }, [merchantCode])

  const chosen = pool.filter((c) => selected.includes(c.id))
  const selectedLocations = [...new Set(chosen.map((c) => c.pickupLocationCode ?? ''))]
  const oneLocation = selectedLocations.length === 1
  const scheduleLocation = oneLocation ? selectedLocations[0] : ''

  const totalPieces = chosen.reduce((n, c) => n + c.pieces.length, 0)
  const totalWeight = chosen.reduce((n, c) => n + c.weightKg, 0)

  const toggleRow = (id: string) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))
  const allSelected = pool.length > 0 && selected.length === pool.length

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
        <h1 className="text-[22px] font-black tracking-tight text-ink">Raise a pickup</h1>
        <p className="mt-1 text-[13px] text-ink-3">
          Select what's ready and schedule a collection, or raise a blind pickup when your data
          isn't in yet.
        </p>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        {/* ------------------------------------------- consignment list (hero) */}
        <div className="min-w-0">
          <Card
            title="Consignments awaiting pickup"
            subtitle={`${merchantName} · ${pool.length} ready`}
            right={
              <Button variant="outline" icon={<Sparkles size={14} />} onClick={() => setBlindOpen(true)}>
                Blind Pickup
              </Button>
            }>
            {pool.length === 0 ? (
              <div className="flex flex-col items-center gap-3 px-5 py-14 text-center">
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-warm-100 text-warm-500">
                  <Boxes size={24} />
                </span>
                <p className="text-[15px] font-bold text-ink">No consignments awaiting pickup</p>
                <p className="max-w-sm text-[13px] text-ink-3">
                  Nothing is queued for {merchantName} right now. If a pickup is coming and the data
                  isn't in yet, raise a blind pickup and we'll reconcile the details afterwards.
                </p>
                <Button icon={<Sparkles size={14} />} onClick={() => setBlindOpen(true)}>Raise a blind pickup</Button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="border-b border-line bg-thead text-left text-[12px] font-bold text-ink-3">
                      <th className="w-10 px-5 py-2.5">
                        <Checkbox
                          checked={allSelected}
                          indeterminate={selected.length > 0 && !allSelected}
                          onChange={() => setSelected(allSelected ? [] : pool.map((c) => c.id))}
                        />
                      </th>
                      <th className="px-3 py-2.5">Consignment</th>
                      <th className="px-3 py-2.5">Delivery</th>
                      {showLocationCol && <th className="px-3 py-2.5">Location</th>}
                      <th className="px-3 py-2.5 text-right">Pieces</th>
                      <th className="px-3 py-2.5 text-right">Weight</th>
                      <th className="px-3 py-2.5">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pool.map((c) => {
                      const on = selected.includes(c.id)
                      return (
                        <tr key={c.id} onClick={() => toggleRow(c.id)}
                          className={`cursor-pointer border-b border-line transition-colors last:border-0 ${on ? 'bg-brand-50' : 'hover:bg-warm-50'}`}>
                          <td className="px-5 py-3" onClick={(e) => e.stopPropagation()}>
                            <Checkbox checked={on} onChange={() => toggleRow(c.id)} />
                          </td>
                          <td className="px-3 py-3">
                            <span className="font-mono text-[12px] font-bold text-brand-500">{c.id}</span>
                            <span className="ml-1.5 font-mono text-[11.5px] text-ink-3">{c.orderId}</span>
                            {!c.scannable && <span className="ml-1.5"><Chip>SKU</Chip></span>}
                          </td>
                          <td className="px-3 py-3">
                            <span className="block text-ink">{c.deliveryName}</span>
                            <span className="block text-[12px] text-ink-3">{c.deliveryCity || '—'}</span>
                          </td>
                          {showLocationCol && (
                            <td className="px-3 py-3 text-[12px] text-ink-2">
                              {LOCATIONS[c.pickupLocationCode ?? '']?.name ?? c.pickupLocationCode}
                            </td>
                          )}
                          <td className="px-3 py-3 text-right tabular-nums text-ink-2">
                            {c.pieces.length || (c.skus?.length ? `${c.skus.length} SKU` : 0)}
                          </td>
                          <td className="px-3 py-3 text-right tabular-nums text-ink-2">{c.weightKg} kg</td>
                          <td className="px-3 py-3"><ReadyChip /></td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>

        {/* --------------------------------------------------- side helper */}
        <div className="grid content-start gap-4">
          <div className="rounded-xl border border-line bg-surface px-5 py-4 shadow-ds-1">
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-50 text-brand-500">
                <Sparkles size={16} />
              </span>
              <h3 className="text-[14px] font-bold text-ink">No data yet?</h3>
            </div>
            <p className="mt-2 text-[12.5px] leading-relaxed text-ink-3">
              Raise a blind pickup with a rough piece count and weight — the driver collects
              whatever is there and we reconcile it against your soft data afterwards.
            </p>
            <div className="mt-3">
              <Button variant="outline" icon={<Sparkles size={14} />} onClick={() => setBlindOpen(true)}>
                Raise a blind pickup
              </Button>
            </div>
          </div>

          <div className="flex items-start gap-2.5 rounded-xl border border-line bg-surface px-5 py-4 shadow-ds-1">
            <Truck size={16} className="mt-0.5 shrink-0 text-brand-500" />
            <p className="text-[12.5px] text-ink-3">
              Once you request a pickup, our dispatch team plans it onto a route and a driver collects
              from your location — track progress under <span className="font-bold text-ink-2">My Requests</span>.
            </p>
          </div>
        </div>
      </div>

      {/* -------------------------------------------- sticky selection bar */}
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
      <BlindSheet
        open={blindOpen} onClose={() => setBlindOpen(false)}
        merchant={merchantCode}
        onDone={() => setBlindOpen(false)}
      />
    </>
  )
}
