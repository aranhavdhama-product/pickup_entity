/**
 * Pickup Requests (LOCAL console) — every dialog the list and the detail page
 * open. Each one is a nueva `Modal`; forms use MenuSelect / Input / DateInput /
 * Checkbox / Toggle only. Every write goes through `growOrderActions` (or
 * `planningActions` for the console-only secondary state).
 */
import { useMemo, useState, type ReactNode } from 'react'
import {
  Button, Checkbox, Field, Input, MenuSelect, Modal, MultiSelectDropdown, StatusPill,
} from '../../nueva/components'
import { toast } from '../../nueva/toast'
import { growOrderActions, pickupRequestById, useGrowOrders } from '../../growOrders/store'
import { usePickupModuleConfig } from '../../config/pickupModule'
import { Plus, X } from 'lucide-react'
import type { GrowOrder, GrowPickupRequest, Party } from '../../growOrders/types'
import { atDate, isPickupEligible, localIso } from '../../growOrders/tabs'
import { CANCEL_REASONS, PICKABLE_FAILURE_REASONS } from '../../growOrders/pickupReasons'
import { hubName } from '../../growOrders/hubs'
import {
  DEFAULT_FTL_SERVICE, FTL_SERVICE_CODES, VEHICLE_UNITS, coerceVehicleType, vehicleSpec, vehiclesFor,
} from '../../growOrders/draft'
import { merchantsOf } from '../LocalPFP/merchants'
import {
  can, carrierOptions, consignmentsLabel, earliestFor, fmtWindow, groupOrders, joinableFor, merchantOfPr,
  merchantOfStore, pickupPointName, storeLabel, storeOf, windowError,
} from './prModel'

/* ------------------------------------------------------------------ bits ---- */

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`

const EMPTY_PARTY: Party = {
  name: '', contactNumber: '', email: '', businessName: '', country: '',
  line1: '', line2: '', landmark: '', postalCode: '', state: '', city: '',
}

function Footer({ onClose, onConfirm, label, disabled }: { onClose: () => void; onConfirm: () => void; label: string; disabled?: boolean }) {
  return (
    <>
      <Button variant="outline" onClick={onClose}>Cancel</Button>
      <Button onClick={onConfirm} disabled={disabled}>{label}</Button>
    </>
  )
}

/** A short explanatory line under a form — never an eager error on a pristine form. */
function Hint({ children, tone = 'muted' }: { children: ReactNode; tone?: 'muted' | 'danger' }) {
  return <p className={`text-[12.5px] ${tone === 'danger' ? 'text-danger-fg' : 'text-ink-3'}`}>{children}</p>
}

/** A read-only line of which requests an action will touch, and which it skips. */
function Scope({ ok, skipped, verb }: { ok: GrowPickupRequest[]; skipped: GrowPickupRequest[]; verb: string }) {
  return (
    <div className="rounded-md border border-line bg-warm-25 px-3 py-2 text-[13px] text-ink-2">
      <span className="font-bold text-ink">{plural(ok.length, 'pickup request')}</span> will be {verb}
      {ok.length > 0 && ok.length <= 6 && <>: <span className="font-mono text-[12px]">{ok.map((p) => p.number).join(', ')}</span></>}
      {skipped.length > 0 && (
        <span className="block text-[12px] text-ink-3">
          Skipped ({skipped.length}, not allowed in their current state): {skipped.map((p) => `${p.number} · ${p.status}`).join(', ')}
        </span>
      )}
    </div>
  )
}

/* -------------------------------------------------------------- window ---- */

/**
 * A pickup window as TWO controls — Start and End, each one date-and-time
 * field with minute precision — prefilled with the earliest window the rules
 * allow, and the first rule it breaks shown under it (the standing rule line
 * was removed by the owner; the refusal stays). Moving the start past the end
 * carries the end along, keeping the window's length.
 */
export function WindowFields({ startAt, endAt, onChange, error, touched }: {
  startAt: string; endAt: string; onChange: (w: { startAt: string; endAt: string }) => void
  merchantCode?: string | null; error: string | null; touched: boolean
}) {
  const setStart = (v: string) => {
    if (!v) return
    const span = Math.max(60_000, atDate(endAt).getTime() - atDate(startAt).getTime())
    const end = atDate(endAt) > atDate(v) ? endAt : localIso(new Date(atDate(v).getTime() + span))
    onChange({ startAt: v, endAt: end })
  }
  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-2 items-end gap-3">
        <Field label="Start" required><Input type="datetime-local" value={startAt} onChange={setStart} /></Field>
        <Field label="End" required><Input type="datetime-local" value={endAt} onChange={(v) => v && onChange({ startAt, endAt: v })} /></Field>
      </div>
      {touched && error && <Hint tone="danger">{error}</Hint>}
    </div>
  )
}

/** Window state + its rule, for a dialog. */
function useWindow(merchantCode?: string | null, maxDaysAhead?: number, initial?: { startAt: string; endAt: string }) {
  const [w, setW] = useState(() => initial ?? earliestFor(merchantCode))
  const [touched, setTouched] = useState(false)
  const error = windowError(w.startAt, w.endAt, merchantCode, { maxDaysAhead })
  return { w, setW: (x: { startAt: string; endAt: string }) => { setW(x); setTouched(true) }, error, touched, touch: () => setTouched(true) }
}

/* -------------------------------------------------- + Create Pickup ---- */

/**
 * One vehicle line of an FTL reservation: the SERVICE first, then only the
 * vehicles that service runs (the Grow Create Order FTL order). `deliverTo`
 * holds ship-to address ids — used only once a ship-to address exists.
 */
interface VehicleLine { id: number; service: string; vehicleType: string; units: string; loadKg: string; deliverTo: number[] }

let lineSeq = 1
const newLine = (service = DEFAULT_FTL_SERVICE): VehicleLine => ({
  id: lineSeq++, service, vehicleType: vehiclesFor(service)[0]?.type ?? '',
  units: '1', loadKg: '', deliverTo: [],
})

/** A Ship To party, typed in — FTL goes to a consignee, not an inbound hub. Optional. */
interface ShipToDraft { id: number; name: string; line1: string; city: string; postalCode: string; contactNumber: string }
let addrSeq = 1
const newShipTo = (): ShipToDraft => ({ id: addrSeq++, name: '', line1: '', city: '', postalCode: '', contactNumber: '' })

/**
 * A RESERVED booking by ops (case C4): a collection slot before any
 * consignment exists.
 *  - LTL: how many consignments and roughly what they weigh — nothing else;
 *    the drop hub follows from the consignments once they are attached.
 *  - FTL: a list of vehicles (several types, several of each). Each line picks
 *    the SERVICE first and is then offered only the vehicles it runs. Ship-to
 *    addresses are optional (hidden until "+ Add ship-to address"); once one
 *    exists every vehicle line maps to them via "Deliver to".
 * A pickup request carries ONE vehicle type, so an FTL reservation with n
 * vehicle lines creates n reserved requests sharing the window. The store has
 * ONE shipTo per request, so each request stores its line's first mapped
 * address (else Address 1) and the full vehicle → address map rides in `note`.
 */
export function CreatePickupDialog({ onClose, onDone }: { onClose: () => void; onDone: (prs: GrowPickupRequest[]) => void }) {
  const db = useGrowOrders()
  const merchants = useMemo(() => merchantsOf(db.stores), [db.stores])
  /* the type is the form's first FIELD — one form, whose load section changes with it */
  const [kind, setKind] = useState<'LTL' | 'FTL'>('LTL')
  const [merchant, setMerchant] = useState(merchants.length === 1 ? merchants[0].name : '')
  const stores = merchants.find((m) => m.name === merchant)?.stores ?? []
  const [storeCode, setStoreCode] = useState(stores.length === 1 ? stores[0].code : '')
  const [pieces, setPieces] = useState('')
  const [weight, setWeight] = useState('')
  const [lines, setLines] = useState<VehicleLine[]>(() => [newLine()])
  const [shipTos, setShipTos] = useState<ShipToDraft[]>([])
  const [instructions, setInstructions] = useState('')
  const [tried, setTried] = useState(false)
  const win = useWindow(merchant || null)
  const ftl = kind === 'FTL'

  const setLine = (id: number, patch: Partial<VehicleLine>) =>
    setLines((ls) => ls.map((l) => {
      if (l.id !== id) return l
      const next = { ...l, ...patch }
      /* a new service keeps the vehicle only if it still runs it */
      if (patch.service !== undefined) next.vehicleType = coerceVehicleType(next.service, next.vehicleType)
      return next
    }))

  const totalVehicles = lines.reduce((n, l) => n + (Number(l.units) || 0), 0)
  const missing = [
    !merchant && 'Merchant', !storeCode && 'Ship From',
    !ftl && !(Number(pieces) > 0) && 'Shipments',
    ftl && lines.some((l) => !l.vehicleType || !l.service) && 'Service / vehicle',
  ].filter(Boolean) as string[]

  const submit = () => {
    setTried(true); win.touch()
    if (missing.length || win.error) return
    const common = {
      storeCode, source: 'Console' as const, startAt: win.w.startAt, endAt: win.w.endAt,
      instructions: instructions.trim() || undefined,
    }
    if (!ftl) {
      onDone([growOrderActions.createBlindPickup({
        ...common, destinationCode: null, shipmentType: 'Parcel',
        expectedPieces: Number(pieces) || null,
        expectedWeightKg: Number(weight) > 0 ? Number(weight) : null,
      })])
      return
    }
    /* only addresses actually typed in count; an empty block is no address */
    const filled = shipTos.filter((a) => a.name.trim() || a.line1.trim())
    const labelOf = (id: number) => `Address ${shipTos.findIndex((a) => a.id === id) + 1}`
    const party = (a: ShipToDraft | undefined): Party | null => {
      if (!a) return null
      const { name, line1, city, postalCode, contactNumber } = a
      return { ...EMPTY_PARTY, name, line1, city, postalCode, contactNumber, country: 'Philippines' }
    }
    const mapped = (l: VehicleLine) => l.deliverTo.filter((id) => filled.some((a) => a.id === id))
    const mapping = filled.length
      ? lines.map((l, i) => `Vehicle ${i + 1} → ${mapped(l).map(labelOf).join(', ') || 'unassigned'}`).join('; ')
      : ''
    const reservation = lines.length > 1 ? `Part of one FTL reservation — ${plural(totalVehicles, 'vehicle')} across ${lines.length} vehicle lines` : ''
    onDone(lines.map((l) => growOrderActions.createBlindPickup({
      ...common, destinationCode: null, shipmentType: 'FTL',
      expectedPieces: null, expectedWeightKg: Number(l.loadKg) > 0 ? Number(l.loadKg) : null,
      vehicleType: l.vehicleType, vehicleUnit: Number(l.units) || 1, ftlServiceType: l.service,
      shipTo: party(filled.find((a) => a.id === mapped(l)[0]) ?? filled[0]),
      note: [reservation, mapping && `Deliver to: ${mapping}`].filter(Boolean).join(' · '),
    })))
  }

  const setShip = (id: number, k: Exclude<keyof ShipToDraft, 'id'>) => (v: string) =>
    setShipTos((as) => as.map((a) => (a.id === id ? { ...a, [k]: v } : a)))
  const addressLabels = shipTos.map((_, i) => `Address ${i + 1}`)
  const withAddresses = shipTos.length > 0
  const cols = withAddresses ? 'grid-cols-[1.2fr_1.4fr_100px_120px_1.2fr_32px]' : 'grid-cols-[1.2fr_1.4fr_110px_130px_32px]'

  return (
    <Modal open wide title="Create Pickup Request" onClose={onClose}
      footer={<Footer onClose={onClose} onConfirm={submit}
        label={ftl && lines.length > 1 ? `Create ${lines.length} Pickup Requests` : 'Create Pickup Request'} />}>
      <div className="flex flex-col gap-4 pb-3">
        <Hint>Reserved pickup — book a collection before the shipments exist. Attach them later from the Eligible for Pickup tab.</Hint>
        <div className="grid grid-cols-2 items-end gap-3">
          <Field label="Type" required>
            <MenuSelect value={kind} options={['LTL', 'FTL']}
              labels={(t) => (t === 'FTL' ? 'FTL · Full vehicle' : 'LTL · Parcel handover')}
              onChange={(v) => setKind(v === 'FTL' ? 'FTL' : 'LTL')} />
          </Field>
        </div>
        <div className="grid grid-cols-2 items-end gap-3">
          <Field label="Merchant" required>
            <MenuSelect value={merchant} placeholder="Select merchant" options={merchants.map((m) => m.name)}
              onChange={(v) => { setMerchant(v); const s = merchants.find((m) => m.name === v)?.stores ?? []; setStoreCode(s.length === 1 ? s[0].code : '') }} />
          </Field>
          <Field label="Ship From" required>
            <MenuSelect value={storeCode} placeholder={merchant ? 'Select pickup address' : 'Pick a merchant first'}
              options={stores.map((s) => s.code)} labels={(c) => { const s = storeOf(c, stores); return s ? storeLabel(s) : c }}
              onChange={setStoreCode} />
          </Field>
        </div>
        <WindowFields startAt={win.w.startAt} endAt={win.w.endAt} onChange={win.setW} merchantCode={merchant || null}
          error={win.error} touched={win.touched} />

        {!ftl ? (
          <div className="grid grid-cols-4 items-end gap-3">
            <Field label="Estimated number of shipments" required><Input type="number" value={pieces} onChange={setPieces} placeholder="e.g. 12" /></Field>
            <Field label="Estimated weight (kg)"><Input type="number" value={weight} onChange={setWeight} placeholder="e.g. 40" /></Field>
          </div>
        ) : (
          <>
            {/* where the vehicles deliver — optional, hidden until asked for,
                and ABOVE the vehicles so the Deliver to column has its options */}
            {withAddresses ? (
              <div>
                <p className="mb-1.5 text-[12px] font-bold uppercase tracking-wide text-ink-2">Ship To</p>
                <div className="flex flex-col gap-3">
                  {shipTos.map((a, i) => (
                    <div key={a.id}>
                      <div className="mb-1 flex items-center justify-between">
                        <span className="text-[12px] font-bold text-ink-3">Address {i + 1}</span>
                        <button type="button" aria-label={`Remove address ${i + 1}`}
                          onClick={() => setShipTos((as) => as.filter((x) => x.id !== a.id))}
                          className="inline-flex h-6 w-6 items-center justify-center rounded-md text-ink-3 hover:bg-warm-100 hover:text-ink">
                          <X size={13} />
                        </button>
                      </div>
                      <div className="grid grid-cols-4 items-end gap-3">
                        <Field label="Consignee"><Input value={a.name} onChange={setShip(a.id, 'name')} placeholder="Name or business" /></Field>
                        <Field label="Address"><Input value={a.line1} onChange={setShip(a.id, 'line1')} placeholder="Street, building" /></Field>
                        <Field label="City"><Input value={a.city} onChange={setShip(a.id, 'city')} placeholder="City" /></Field>
                        <Field label="Postal code"><Input value={a.postalCode} onChange={setShip(a.id, 'postalCode')} placeholder="e.g. 1300" /></Field>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-2">
                  <Button size="sm" variant="text" icon={<Plus size={13} />} onClick={() => setShipTos((as) => [...as, newShipTo()])}>Add another address</Button>
                </div>
              </div>
            ) : (
              <div>
                <Button size="sm" variant="text" icon={<Plus size={13} />} onClick={() => setShipTos([newShipTo()])}>Add ship-to address</Button>
              </div>
            )}

            {/* the vehicles: a table, one line per vehicle type — service first */}
            <div>
              <p className="mb-1.5 text-[12px] font-bold uppercase tracking-wide text-ink-2">
                Vehicles<span className="text-brand-500">*</span>
                <span className="ml-2 font-normal normal-case tracking-normal text-ink-3">{plural(totalVehicles, 'vehicle')}</span>
              </p>
              <div className="rounded-md border border-line">
                <div className={`grid ${cols} gap-3 border-b border-line bg-warm-50 px-3 py-2 text-[12px] font-bold text-ink-3`}>
                  <span>Service type</span><span>Vehicle type</span><span>No. of vehicles</span><span>Est. load (kg)</span>
                  {withAddresses && <span>Deliver to</span>}<span />
                </div>
                {lines.map((l) => (
                  <div key={l.id} className={`grid ${cols} items-center gap-3 border-b border-line px-3 py-2 last:border-0`}>
                    <MenuSelect value={l.service} options={FTL_SERVICE_CODES} searchable onChange={(v) => setLine(l.id, { service: v })} />
                    <MenuSelect value={l.vehicleType} options={vehiclesFor(l.service).map((v) => v.type)} searchable
                      labels={(t) => `${t} · ${vehicleSpec(t).capacity.split(' · ')[0].replace('Payload ', '')}`}
                      onChange={(v) => setLine(l.id, { vehicleType: v })} />
                    <MenuSelect value={l.units} options={VEHICLE_UNITS} onChange={(v) => setLine(l.id, { units: v })} />
                    <Input type="number" value={l.loadKg} onChange={(v) => setLine(l.id, { loadKg: v })} placeholder="e.g. 6000" />
                    {withAddresses && (
                      <MultiSelectDropdown options={addressLabels} noun="addresses" placeholder="Select"
                        values={l.deliverTo.map((id) => shipTos.findIndex((a) => a.id === id)).filter((i) => i >= 0).map((i) => addressLabels[i])}
                        onChange={(vals) => setLine(l.id, { deliverTo: vals.map((v) => shipTos[addressLabels.indexOf(v)]?.id).filter((x): x is number => x !== undefined) })} />
                    )}
                    <button type="button" aria-label="Remove vehicle" disabled={lines.length === 1}
                      onClick={() => setLines((ls) => ls.filter((x) => x.id !== l.id))}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-md text-ink-3 hover:bg-warm-100 hover:text-ink disabled:cursor-not-allowed disabled:opacity-40">
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
              <div className="mt-2">
                <Button size="sm" variant="text" icon={<Plus size={13} />} onClick={() => setLines((ls) => [...ls, newLine()])}>Add vehicle</Button>
              </div>
            </div>
          </>
        )}

        <Field label="Instructions for the driver"><Input value={instructions} onChange={setInstructions} placeholder="Optional" /></Field>
        {tried && missing.length > 0 && <Hint tone="danger">{plural(missing.length, 'field')} incomplete: {missing.join(', ')}</Hint>}
      </div>
    </Modal>
  )
}

/* ------------------------------------ Eligible → Add to new / existing ---- */

/**
 * Consignments from the Eligible tab into pickups. The selection is split into
 * the bookings it implies — one per (pickup point → hub), every FTL order its
 * own — and each group chooses New pickup request or Add to existing.
 */
export function BookConsignmentsDialog({ orders, prefer, onClose, onDone }: {
  orders: GrowOrder[]; prefer: 'new' | 'existing'; onClose: () => void; onDone: () => void
}) {
  const db = useGrowOrders()
  const cfg = usePickupModuleConfig()
  /* frozen when the dialog opens — a group must not vanish under the user's cursor */
  const [groups] = useState(() => groupOrders(orders.filter(isPickupEligible)))
  const skipped = orders.length - groups.reduce((n, g) => n + g.orders.length, 0)
  const merchantCode = groups[0] ? merchantOfStore(groups[0].storeCode, db.stores) : null
  const win = useWindow(merchantCode)
  const [instructions, setInstructions] = useState('')
  const [choice, setChoice] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {}
    groups.forEach((g) => {
      const j = joinableFor(g, db, cfg)
      init[g.key] = prefer === 'existing' && j.length ? j[0].id : 'new'
    })
    return init
  })
  const needsWindow = groups.some((g) => (choice[g.key] ?? 'new') === 'new')

  const submit = () => {
    win.touch()
    if (needsWindow && win.error) return
    const made: string[] = []
    groups.forEach((g) => {
      const ids = g.orders.map((o) => o.id)
      const pick = choice[g.key] ?? 'new'
      if (pick !== 'new') {
        const { added } = growOrderActions.addOrdersToPickup(pick, ids)
        const pr = db.pickupRequests.find((p) => p.id === pick)
        if (added.length && pr) made.push(`${pr.number} (+${added.length})`)
        return
      }
      const o0 = g.orders[0]
      const pr = growOrderActions.createPickupRequest({
        storeCode: g.storeCode, destinationCode: g.destinationCode, orderIds: ids, source: 'Console',
        merchantCode: merchantOfStore(g.storeCode, db.stores), instructions: instructions.trim() || undefined,
        startAt: win.w.startAt, endAt: win.w.endAt,
        ...(g.ftl ? { vehicle: { vehicleType: o0.vehicleType, vehicleUnit: o0.vehicleUnit ?? 1, shipTo: o0.receiver, ftlServiceType: o0.serviceType || null } } : {}),
      })
      if (pr) made.push(pr.merged ? `${pr.number} (merged)` : pr.number)
    })
    toast.success(made.length ? `Booked: ${made.join(', ')}` : 'Nothing was booked — the shipments are no longer eligible.')
    onDone()
  }

  return (
    <Modal open wide title={prefer === 'new' ? 'Add to new pickup' : 'Add to existing pickup'} onClose={onClose}
      footer={<Footer onClose={onClose} onConfirm={submit} label="Confirm" disabled={!groups.length} />}>
      <div className="flex flex-col gap-4 pb-3">
        <p className="text-[13px] text-ink-2">
          <span className="font-bold text-ink">{plural(groups.length, 'booking')}</span> — one per pickup address and destination hub; every FTL shipment is its own.
          {skipped > 0 && <span className="text-ink-3"> {plural(skipped, 'shipment')} skipped: no longer eligible.</span>}
        </p>
        <div className="flex flex-col gap-2">
          {groups.map((g) => {
            const joinable = joinableFor(g, db, cfg)
            const store = storeOf(g.storeCode, db.stores)
            return (
              <div key={g.key} className="rounded-md border border-line px-4 py-3">
                <div className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-bold text-ink">
                      {store?.name ?? g.storeCode} → {g.ftl ? (g.orders[0].receiver.city || 'Ship To') : hubName(g.destinationCode)}
                      {g.ftl && <span className="ml-2"><StatusPill label="FTL" tone="info" /></span>}
                    </p>
                    <p className="text-[12px] text-ink-3">
                      {plural(g.orders.length, 'shipment')} · {g.weightKg.toFixed(1)} kg · <span className="font-mono">{g.orders.map((o) => o.orderNumber).join(', ')}</span>
                    </p>
                  </div>
                  <div className="w-72 shrink-0">
                    <MenuSelect value={choice[g.key] ?? 'new'} options={['new', ...joinable.map((p) => p.id)]}
                      labels={(v) => {
                        if (v === 'new') return 'New pickup request'
                        const p = joinable.find((x) => x.id === v)
                        return p ? `Add to ${p.number} · ${fmtWindow(p)} · ${consignmentsLabel(p)}` : v
                      }}
                      onChange={(v) => setChoice((c) => ({ ...c, [g.key]: v }))} />
                  </div>
                </div>
                {!g.ftl && joinable.length === 0 && <p className="mt-1 text-[12px] text-ink-3">No open pickup at this address can take more shipments ({cfg.allowAddToExistingUntil} or earlier).</p>}
              </div>
            )
          })}
        </div>
        {needsWindow && (
          <>
            <WindowFields startAt={win.w.startAt} endAt={win.w.endAt} onChange={win.setW} merchantCode={merchantCode}
              error={win.error} touched={win.touched} />
            <Field label="Instructions for the driver"><Input value={instructions} onChange={setInstructions} placeholder="Optional" /></Field>
          </>
        )}
      </div>
    </Modal>
  )
}

/* ------------------------------------------------ Add consignments (detail) ---- */

export function AddConsignmentsDialog({ pr, onClose, onDone }: { pr: GrowPickupRequest; onClose: () => void; onDone: () => void }) {
  const db = useGrowOrders()
  /* same point and — a request drops at ONE hub — the same inbound hub (or a TBC one) */
  const candidates = db.orders.filter((o) => isPickupEligible(o) && o.storeCode === pr.storeCode
    && o.shipmentType !== 'FTL' && (pr.destinationCode == null || o.inboundHubCode === pr.destinationCode))
  const [sel, setSel] = useState<Set<string>>(new Set())
  const toggle = (id: string) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const submit = () => {
    const { added } = growOrderActions.addOrdersToPickup(pr.id, [...sel])
    if (added.length) toast.success(`${plural(added.length, 'shipment')} added to ${pr.number}.`)
    else toast.error(`${pr.number} can no longer take shipments.`)
    onDone()
  }
  return (
    <Modal open title={`Add shipments to ${pr.number}`} onClose={onClose}
      footer={<Footer onClose={onClose} onConfirm={submit} label={`Add ${sel.size || ''}`.trim()} disabled={!sel.size} />}>
      <div className="flex flex-col gap-3 pb-3">
        <Hint>Eligible shipments at {pickupPointName(pr, db.stores)}. {pr.destinationCode ? `This pickup drops at ${hubName(pr.destinationCode)}.` : ''}</Hint>
        {candidates.length === 0 ? (
          <p className="py-6 text-center text-[13px] text-ink-3">No eligible shipments at this pickup address.</p>
        ) : (
          <div className="rounded-md border border-line">
            {candidates.map((o) => (
              <div key={o.id} className="flex items-center gap-3 border-b border-line px-3 py-2 last:border-0 text-[13px]">
                <Checkbox checked={sel.has(o.id)} onChange={() => toggle(o.id)} />
                <span className="font-mono text-[12px] font-bold text-ink">{o.orderNumber}</span>
                <span className="text-ink-3">→ {hubName(o.inboundHubCode)}</span>
                {pr.destinationCode && o.inboundHubCode !== pr.destinationCode && <StatusPill label="Other hub" tone="warning" />}
                <span className="ml-auto tabular-nums text-ink-2">{(o.pkg.weightKg || 0).toFixed(1)} kg</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  )
}

/* ------------------------------------------------------------ carrier ---- */

export function AssignCarrierDialog({ prs, onClose, onDone }: { prs: GrowPickupRequest[]; onClose: () => void; onDone: () => void }) {
  const db = useGrowOrders()
  const options = useMemo(() => carrierOptions(db.pickupRequests), [db.pickupRequests])
  const ok = prs.filter(can.assignCarrier), skipped = prs.filter((p) => !can.assignCarrier(p))
  const [code, setCode] = useState('')
  const c = options.find((x) => x.code === code)
  const submit = () => {
    if (!c) return
    ok.forEach((p) => growOrderActions.assignCarrier(p.id, c))
    /* with Send to carriers on, the booking went out and the carrier's reference came back */
    const refs = ok.map((p) => pickupRequestById(p.id)?.carrierPickupRef).filter(Boolean)
    toast.success(`${plural(ok.length, 'pickup')} allocated to ${c.name}.${refs.length ? ` Booking sent · ref ${refs.join(', ')}.` : ''}`)
    onDone()
  }
  return (
    <Modal open title="Assign carrier" onClose={onClose}
      footer={<Footer onClose={onClose} onConfirm={submit} label="Assign" disabled={!c || !ok.length} />}>
      <div className="flex flex-col gap-3 pb-3">
        <Scope ok={ok} skipped={skipped} verb="allocated" />
        <Field label="Carrier" required>
          <MenuSelect value={code} placeholder="Select carrier" options={options.map((x) => x.code)}
            labels={(v) => { const x = options.find((y) => y.code === v); return x ? `${x.name} · ${x.mode === 'CARRIER' ? '3PL' : 'Own fleet'}` : v }}
            onChange={setCode} />
        </Field>
        {c?.mode === 'CARRIER' && <Hint>A 3PL runs the collection itself — no fleet trip. Requested / Planned pickups move to Assigned.</Hint>}
      </div>
    </Modal>
  )
}

/* ---------------------------------------------------------- reschedule ---- */

export function RescheduleDialog({ prs, onClose, onDone }: { prs: GrowPickupRequest[]; onClose: () => void; onDone: () => void }) {
  const db = useGrowOrders()
  const cfg = usePickupModuleConfig()
  const ok = prs.filter(can.reschedule), skipped = prs.filter((p) => !can.reschedule(p))
  const merchantCode = ok[0] ? merchantOfPr(ok[0], db.stores) : null
  const win = useWindow(merchantCode, cfg.rescheduleWindowDays)
  const routed = ok.filter((p) => p.tripId)
  const submit = () => {
    win.touch()
    if (win.error || !ok.length) return
    ok.forEach((p) => growOrderActions.reschedulePickupRequest(p.id, win.w))
    toast.success(`${plural(ok.length, 'pickup')} rescheduled to ${fmtWindow(win.w)}.`)
    onDone()
  }
  return (
    <Modal open title="Reschedule pickup" onClose={onClose}
      footer={<Footer onClose={onClose} onConfirm={submit} label="Reschedule" disabled={!ok.length} />}>
      <div className="flex flex-col gap-3 pb-3">
        <Scope ok={ok} skipped={skipped} verb="moved" />
        <WindowFields startAt={win.w.startAt} endAt={win.w.endAt} onChange={win.setW} merchantCode={merchantCode}
          error={win.error} touched={win.touched} />
        {routed.length > 0 && <Hint>{routed.map((p) => p.number).join(', ')} {routed.length === 1 ? 'is' : 'are'} on a trip — rescheduling takes {routed.length === 1 ? 'it' : 'them'} off the trip and back to Requested.</Hint>}
      </div>
    </Modal>
  )
}

/* -------------------------------------------------- cancel / mark failed ---- */

export function ReasonDialog({ kind, prs, onClose, onDone }: {
  kind: 'cancel' | 'fail'; prs: GrowPickupRequest[]; onClose: () => void; onDone: () => void
}) {
  const test = kind === 'cancel' ? can.cancel : can.markFailed
  const ok = prs.filter(test), skipped = prs.filter((p) => !test(p))
  const reasons = kind === 'cancel' ? CANCEL_REASONS : PICKABLE_FAILURE_REASONS
  const [code, setCode] = useState('')
  const [note, setNote] = useState('')
  const needsNote = code === 'OTHER' && !note.trim()
  const submit = () => {
    if (!code || needsNote) return
    ok.forEach((p) => {
      if (kind === 'cancel') growOrderActions.cancelPickupRequest(p.id, code === 'OTHER' ? note.trim() : code, 'Ops')
      else growOrderActions.markManuallyFailed(p.id, code, note.trim() || undefined)
    })
    toast.success(`${plural(ok.length, 'pickup')} ${kind === 'cancel' ? 'cancelled' : 'marked Pickup Failed'}.`)
    onDone()
  }
  return (
    <Modal open title={kind === 'cancel' ? 'Cancel pickup' : 'Mark Pickup Failed'} onClose={onClose}
      footer={<Footer onClose={onClose} onConfirm={submit} label={kind === 'cancel' ? 'Cancel pickup' : 'Mark failed'} disabled={!code || needsNote || !ok.length} />}>
      <div className="flex flex-col gap-3 pb-3">
        <Scope ok={ok} skipped={skipped} verb={kind === 'cancel' ? 'cancelled' : 'marked failed'} />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Reason" required>
            <MenuSelect value={code} placeholder="Select reason" options={reasons.map((r) => r.code)}
              labels={(v) => reasons.find((r) => r.code === v)?.label ?? v} onChange={setCode} />
          </Field>
          <Field label={code === 'OTHER' ? 'Note' : 'Note (optional)'} required={code === 'OTHER'}>
            <Input value={note} onChange={setNote} placeholder="Recorded in the timeline" />
          </Field>
        </div>
        <Hint>{kind === 'cancel'
          ? 'Its shipments go back to Eligible for Pickup; a routed pickup leaves its trip.'
          : 'Its shipments go back to Eligible for Pickup. With attempts left, a re-attempt can be raised (automatically when the account auto-reschedules failures).'}</Hint>
      </div>
    </Modal>
  )
}

/* ------------------------------------------------ manual picked up ---- */

export function ManualPickupDialog({ pr, onClose, onDone }: { pr: GrowPickupRequest; onClose: () => void; onDone: () => void }) {
  const db = useGrowOrders()
  const byId = new Map(db.orders.map((o) => [o.id, o]))
  const [sel, setSel] = useState<Set<string>>(() => new Set(pr.orderIds))
  const [note, setNote] = useState('')
  const toggle = (id: string) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const submit = () => {
    growOrderActions.markManuallyPickedUp(pr.id, [...sel], note.trim() || undefined)
    toast.success(`${pr.number} marked picked up — ${sel.size} of ${pr.orderIds.length}.`)
    onDone()
  }
  return (
    <Modal open title="Mark Manually Picked Up" onClose={onClose}
      footer={<Footer onClose={onClose} onConfirm={submit} label="Mark picked up" disabled={!sel.size} />}>
      <div className="flex flex-col gap-3 pb-3">
        <Hint>Tick what was actually collected. The rest reads Not picked. The ticks stand in for the driver scan; with hub scanning on, the hub still has to scan.</Hint>
        <div className="rounded-md border border-line">
          {pr.orderIds.map((id) => (
            <div key={id} className="flex items-center gap-3 border-b border-line px-3 py-2 last:border-0 text-[13px]">
              <Checkbox checked={sel.has(id)} onChange={() => toggle(id)} />
              <span className="font-mono text-[12px] font-bold text-ink">{byId.get(id)?.orderNumber ?? id}</span>
              <span className="ml-auto tabular-nums text-ink-2">{(byId.get(id)?.pkg.weightKg ?? 0).toFixed(1)} kg</span>
            </div>
          ))}
        </div>
        <Field label="Note (optional)"><Input value={note} onChange={setNote} placeholder="e.g. confirmed by phone with the merchant" /></Field>
      </div>
    </Modal>
  )
}

/* ------------------------------------------------------ close handover ---- */

export function CloseHandoverDialog({ pr, reconciled, onClose, onDone }: {
  pr: GrowPickupRequest; reconciled: boolean; onClose: () => void; onDone: () => void
}) {
  const [force, setForce] = useState(!reconciled)
  const [note, setNote] = useState('')
  const blocked = !reconciled && (!force || !note.trim())
  const submit = () => {
    if (blocked) return
    const ok = growOrderActions.closeHandover(pr.id, force, note.trim() || undefined)
    if (ok) toast.success(`${pr.number} handed over.`)
    else toast.error('The scans do not reconcile yet — force-close with a note.')
    onDone()
  }
  return (
    <Modal open title="Close handover" onClose={onClose}
      footer={<Footer onClose={onClose} onConfirm={submit} label="Close handover" disabled={blocked} />}>
      <div className="flex flex-col gap-3 pb-3">
        {reconciled
          ? <Hint>Every required scan agrees. Closing marks {pr.number} Handed Over.</Hint>
          : <Hint>The scans do not reconcile. Force-closing accepts the handover as it stands; shipments never collected return to Eligible for Pickup.</Hint>}
        {!reconciled && <Checkbox checked={force} onChange={setForce} label="Force close with a note" />}
        <Field label={reconciled ? 'Note (optional)' : 'Note'} required={!reconciled}>
          <Input value={note} onChange={setNote} placeholder="e.g. parcel found at hub, rescan pending" />
        </Field>
      </div>
    </Modal>
  )
}
