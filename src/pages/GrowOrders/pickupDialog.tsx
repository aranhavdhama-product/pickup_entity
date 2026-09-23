/**
 * The two centred pickup dialogs — same chrome, same field grammar, so the two
 * ways a merchant gets a courier never look like two different products:
 *
 *  - **`PickupDialog`** (Pickup Requests → `Create Pickup Request`): no orders
 *    exist yet, so the merchant books a slot up front — declaring roughly what
 *    will be handed over, as a parcel handover or a whole vehicle (FTL) — and
 *    attaches the orders later. Such a request shows a `Reserved` chip; the
 *    record's internal flag is still `blind`.
 *  - **`BookPickupDialog`** (Orders → `Book Pickup (n)`): the selected paid
 *    orders ARE the content. They carry their own pickup location and inbound
 *    hub, so there is nothing to choose: the dialog groups them by
 *    (pickup location → destination) and books ONE request per group.
 *
 * Both open on the EARLIEST window the booking rules allow
 * (`earliestWindow(now, pickupPolicy(merchant))` — same-day cutoff, lead time,
 * business days), show the same-day rule under the window and refuse a window
 * that breaks it (`violatesCutoff`). Both keep the window in two
 * `YYYY-MM-DDTHH:mm` strings, so a collection may legitimately run overnight
 * or across several days.
 */
import { useMemo, useState } from 'react'
import { CalendarDays, ChevronDown, Search, TriangleAlert, Truck, X } from 'lucide-react'
import { blankParty } from '../../growOrders/seed'
import { findOpenPickupConflict, growOrderActions } from '../../growOrders/store'
import type { GrowOrder, GrowPickupRequest, Party, ShipmentType, StoreLocation } from '../../growOrders/types'
import { canAddOrdersTo, isOpenPr, nextHalfHourAt } from '../../growOrders/tabs'
import { inboundHubFor } from '../../growOrders/hubs'
import { DEFAULT_FTL_SERVICE, FTL_SERVICE_CODES, VEHICLE_UNITS, coerceVehicleType, vehicleSpec, vehiclesFor } from '../../growOrders/draft'
import { toast } from '../../nueva/toast'
import { earliestWindow, pickupPolicy, violatesCutoff, type PickupPolicy } from '../../growOrders/pickupSlots'
import { cutoffRuleLine, merchantMayChange, rescheduleError, usePortalMerchant } from './pickupGate'
import { FOCUS_RING, Btn, Chip, Dialog, Disclosure, Menu, MenuItem, MultiSelect, OutlinedField, TABLE_HEAD_ROW, TABLE_TH } from './ui'
import { DateTimePicker } from './dateTimePicker'
import { usePickupLocations } from './pickupLocations'
import {
  OTHER_ADDRESS, bookingCountLine, groupForPickup, groupLoadLabel, partyLine, partyOk, prWindow,
  storeAddress, storeName, storeOptionLabel, useOutside, windowErrors, windowOk, windowSpan,
  type PickupGroup,
} from './utils'

const COUNTRIES = ['Philippines', 'South Africa', 'Namibia', 'Botswana']
const STATES = ['Metro Manila', 'Laguna', 'Rizal', 'Cebu', 'Iloilo', 'Gauteng', 'Western Cape']

/* --------------------------------------------------------------- address ---- */

/**
 * The standard address block used wherever a party has to be typed in — the
 * `Other address…` branch of a pickup select, and FTL's `Ship To`.
 */
export function AddressFields({ party, set, book = [], searchLabel }: {
  party: Party; set: (patch: Partial<Party>) => void; book?: Party[]; searchLabel?: string
}) {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const ref = useOutside(() => setOpen(false))
  const hits = book
    .filter((b) => !q || [b.name, b.contactNumber, b.businessName, partyLine(b)].join(' ').toLowerCase().includes(q.toLowerCase()))
    .slice(0, 6)
  return (
    <div className="space-y-4">
      {book.length > 0 && searchLabel && (
        <div ref={ref} className="relative">
          <OutlinedField size="sm" value={q} onChange={(v) => { setQ(v); setOpen(true) }} placeholder={searchLabel}
            startAdornment={<Search />}
            endAdornment={q ? <button type="button" onClick={() => setQ('')} aria-label="Clear"><X /></button> : undefined} />
          {open && hits.length > 0 && (
            <Menu width="w-full" onClose={() => setOpen(false)}>
              {hits.map((b, i) => (
                <MenuItem key={i} onClick={() => { set({ ...b }); setQ(''); setOpen(false) }}>
                  <span className="block">
                    <span className="font-medium">{b.name}</span>{b.businessName ? ` · ${b.businessName}` : ''}
                    <span className="block text-[13px] text-grow-ink-2">{partyLine(b)}</span>
                  </span>
                </MenuItem>
              ))}
            </Menu>
          )}
        </div>
      )}
      <div className="grid grid-cols-2 gap-x-4 gap-y-4">
        <OutlinedField size="sm" label="Name" required value={party.name} onChange={(v) => set({ name: v })} />
        <OutlinedField size="sm" label="Contact Number" value={party.contactNumber} onChange={(v) => set({ contactNumber: v.replace(/[^\d+ ]/g, '') })} />
        <OutlinedField size="sm" label="Address Line 1" required value={party.line1} onChange={(v) => set({ line1: v })} className="col-span-2" />
        <OutlinedField size="sm" label="Address Line 2" value={party.line2} onChange={(v) => set({ line2: v })} className="col-span-2" />
        <OutlinedField size="sm" label="Postal Code" required value={party.postalCode} onChange={(v) => set({ postalCode: v })} />
        <OutlinedField size="sm" label="State" value={party.state} onChange={(v) => set({ state: v })} options={STATES.map((x) => ({ value: x }))} placeholder=" " />
        <OutlinedField size="sm" label="City" value={party.city} onChange={(v) => set({ city: v })} />
        <OutlinedField size="sm" label="Country" value={party.country || COUNTRIES[0]} disabled />
      </div>
    </div>
  )
}

/* ---------------------------------------------------------- time window ---- */

/**
 * The pickup window: two `DateTimePicker`s that start EMPTY, so nothing is
 * booked for a time nobody picked. A window may run overnight or across several
 * days (capped at 7), and the live duration is echoed underneath.
 *
 * The bounds only make an unbookable slot unreachable in the calendar — the
 * rules themselves still live in `windowErrors`, because a typed value can
 * always break one. Those messages are shown only once the field HAS a value,
 * so a caller error never masks the picker's own "that isn't a date".
 */
export function WindowFields({ startAt, endAt, onStart, onEnd, startError, rule }: {
  startAt: string; endAt: string; onStart: (v: string) => void; onEnd: (v: string) => void
  /** A booking-rule refusal (cutoff / lead time / horizon) — shown only when the
   *  window's own checks pass, so the picker never shows two errors at once. */
  startError?: string | null
  /** The rule line under the window, e.g. "Same-day pickup closes at 12:00". */
  rule?: string
}) {
  const e = windowErrors(startAt, endAt)
  const span = windowSpan(startAt, endAt)
  /* the same floor `windowErrors` measures the start against, so the greyed-out
     slots and the error message can never disagree */
  const minStart = nextHalfHourAt()
  return (
    <div>
      <div className="grid grid-cols-2 gap-5">
        <DateTimePicker label="Pickup Start" required value={startAt} onChange={onStart}
          min={minStart} error={startAt ? (e.start ?? startError ?? undefined) : undefined} />
        <DateTimePicker label="Pickup End" required value={endAt} onChange={onEnd}
          min={startAt || minStart} error={endAt ? e.end : undefined} />
      </div>
      {span.duration && (
        <p className="mt-2 text-[13px] text-grow-ink-2">
          Duration: <span className="text-grow-ink">{span.duration}</span>
          {span.tag && <span className="ml-2 text-[11px] uppercase tracking-[0.4px] text-grow-ink-3">{span.tag}</span>}
        </p>
      )}
      {rule && <p className="mt-1 text-[12px] text-grow-ink-2">{rule}</p>}
    </div>
  )
}

/**
 * The booking rules a NEW booking dialog runs on: the policy (the signed-in
 * merchant's, or the global one when `global` — the console has no signed-in
 * merchant), the prefilled earliest window and the cutoff check. The standing
 * "Same-day pickup closes at … · earliest window …" line was removed by the
 * owner; a window that breaks the cutoff still shows its error.
 */
function useBookingRules(global = false) {
  const portal = usePortalMerchant()
  const policy: PickupPolicy = global ? pickupPolicy() : portal.policy
  const [initial] = useState(() => earliestWindow(new Date(), policy))
  const check = (startAt: string) => (startAt ? violatesCutoff(startAt, new Date(), policy) : null)
  return { merchantCode: global ? null : portal.code, policy, initial, check }
}

/**
 * "You already have a van coming to this dock then." Shown under the window
 * whenever an OPEN booking at the same collection point overlaps the one being
 * typed — advisory, because a second collection in one window is legitimate
 * often enough that blocking it would be wrong.
 */
function DuplicateWindowNote({ pr, advice }: { pr: GrowPickupRequest; advice: string }) {
  return (
    <p className="flex items-center gap-2 rounded-[4px] bg-grow-warning/10 px-3 py-1.5 text-[13px] text-[#B57F00]"
      title={`${pr.number} already collects from this address between ${prWindow(pr)}. Booking this window sends a second van to the same dock — ${advice}`}>
      <TriangleAlert size={15} className="shrink-0" />
      <span className="truncate"><b>{pr.number}</b> already collects here {prWindow(pr)} — {advice}</span>
    </p>
  )
}

/* ---------------------------------------------------------- reschedule ---- */

/**
 * **Reschedule pickup** — one dialog for one request (its detail page) and for a
 * selection (the list's bulk action), because moving one booking and moving five
 * is the same decision. Only OPEN requests can move, so a selection that has
 * since closed says so instead of silently doing nothing.
 *
 * The window starts EMPTY on purpose: rescheduling means choosing a new window,
 * and a prefilled one is the window that already did not work.
 *
 * Merchant rules (spec §6.2 M2): only requests at or before the config's
 * `merchantCancelUntil` can move, and the new start must pass the booking
 * cutoff (`violatesCutoff`) and stay within `rescheduleWindowDays` of today.
 */
export function ReschedulePickupDialog({ requests, onClose, onDone }: {
  requests: GrowPickupRequest[]
  onClose: () => void
  onDone: (moved: number) => void
}) {
  const merchant = usePortalMerchant()
  const targets = useMemo(() => requests.filter((p) => isOpenPr(p.status) && merchantMayChange(p, merchant.config)),
    [requests, merchant.config])
  const [startAt, setStartAt] = useState('')
  const [endAt, setEndAt] = useState('')
  const one = targets.length === 1 ? targets[0] : undefined
  const ruleErr = rescheduleError(startAt, new Date(), merchant.policy, merchant.config)
  const ok = windowOk(startAt, endAt) && !ruleErr

  const apply = () => {
    targets.forEach((p) => growOrderActions.reschedulePickupRequest(p.id, { startAt, endAt }))
    toast.success(targets.length === 1
      ? `${targets[0].number} rescheduled`
      : `${targets.length} pickup requests rescheduled`)
    onDone(targets.length)
  }

  return (
    <Dialog open title="Reschedule pickup" onClose={onClose}
      subtitle={one
        ? `${one.number} · currently ${prWindow(one)}`
        : `${targets.length} open request${targets.length === 1 ? '' : 's'}`}
      footer={<>
        <Btn variant="outlined" color="neutral" onClick={onClose}>Cancel</Btn>
        <Btn color="accent2" disabled={!targets.length || !ok} startIcon={<CalendarDays size={17} />} onClick={apply}>
          Reschedule
        </Btn>
      </>}>
      {targets.length === 0 ? (
        <p className="text-[14px] text-grow-ink-2">
          None of the selected requests can still be rescheduled — they are closed or already assigned
          to a driver. Contact support to move an assigned pickup.
        </p>
      ) : (
        <div className="space-y-5 pt-1">
          {!one && (
            <div className="rounded-[6px] border border-grow-line">
              {targets.map((p) => (
                <div key={p.id} className="flex items-center gap-3 border-b border-grow-line px-3 py-2 text-[13px] last:border-0">
                  <span className="w-[110px] shrink-0 font-medium text-grow-accent-2">{p.number}</span>
                  <span className="min-w-0 flex-1 truncate text-grow-ink-2" title={prWindow(p)}>{prWindow(p)}</span>
                </div>
              ))}
            </div>
          )}
          <WindowFields startAt={startAt} endAt={endAt} onStart={setStartAt} onEnd={setEndAt}
            startError={ruleErr}
            rule={`${cutoffRuleLine(merchant.policy)} · can be moved up to ${merchant.config.rescheduleWindowDays} days ahead`} />
        </div>
      )}
    </Dialog>
  )
}

/* ------------------------------------------------------- reserve a pickup ---- */

/** The same two tabs as Create Order, so the vocabulary never changes shape. */
/* the shipment type is the form's first FIELD, not a tab strip: one form,
   whose load section below changes with it */
const SHIP_TYPE_OPTIONS: { value: ShipmentType; label: string }[] = [
  { value: 'Parcel', label: 'LTL \u00b7 Parcel handover' },
  { value: 'FTL', label: 'FTL \u00b7 Full vehicle' },
]

/** One vehicle line of an FTL reservation; `deliverTo` holds ship-to ids. */
interface VehicleLine { id: number; vehicleType: string; units: string; loadKg: string; deliverTo: number[] }
let lineSeq = 1
const newLine = (service: string): VehicleLine => ({
  id: lineSeq++, vehicleType: vehiclesFor(service)[0]?.type ?? '', units: '1', loadKg: '', deliverTo: [],
})
/** An optional FTL Ship To address, typed in. */
interface ShipToDraft { id: number; party: Party }
let addrSeq = 1
const newShipTo = (): ShipToDraft => ({ id: addrSeq++, party: blankParty() })

export function PickupDialog({ stores, merchants, onClose, onDone }: {
  stores: StoreLocation[]
  /**
   * CONSOLE ONLY. When given, a Merchant field appears as the form's first
   * field and scopes the pickup-address list to that merchant's locations.
   *
   * The merchant portal passes nothing and is unchanged: it is already inside
   * one merchant, so asking would be a question with one answer. The console
   * has no such given, which is the single difference between the two — and it
   * is a field in the same form, not a step in front of it.
   */
  merchants?: { name: string; stores: StoreLocation[] }[]
  onClose: () => void
  /** The request that was created. */
  onDone: (pr: GrowPickupRequest) => void
}) {
  const [shipType, setShipType] = useState<ShipmentType>('Parcel')
  const [merchantName, setMerchantName] = useState('')
  /* the SAME list Create Order offers — Location Master for the signed-in
     merchant, merged with the locally saved addresses — so booking a courier and
     creating an order never disagree about where this merchant ships from.
     Called unconditionally: the console path below picks its own list instead. */
  const portal = usePickupLocations(stores)
  /* the addresses this form may offer: one merchant's when the console scopes
     it, otherwise the portal's own merged list */
  const scoped = useMemo(
    () => (merchants ? (merchants.find((m) => m.name === merchantName)?.stores ?? []) : portal.stores),
    [merchants, merchantName, portal.stores])
  /* nothing is preselected while a merchant is still unchosen */
  const [store, setStore] = useState(() => (merchants ? '' : portal.stores[0]?.code ?? ''))
  const [otherPickup, setOtherPickup] = useState(false)
  const [shipFrom, setShipFrom] = useState<Party>(blankParty)
  /* FTL's Ship To addresses are optional — a vehicle is often booked before
     anyone knows where it delivers — and hidden until asked for */
  const [shipTos, setShipTos] = useState<ShipToDraft[]>([])
  /* A parcel handover still HAS a destination — the merchant just never picks
     it: it is derived from the collection point and only surfaces on the list
     and the detail page. */
  const storeParty0 = scoped.find((s) => s.code === store)?.party
  const [destination, setDestination] = useState(() => inboundHubFor(storeParty0 ?? blankParty()))

  const rules = useBookingRules(!!merchants)
  const [startAt, setStartAt] = useState(rules.initial.startAt)
  const [endAt, setEndAt] = useState(rules.initial.endAt)
  const cutoffErr = rules.check(startAt)

  const [pieces, setPieces] = useState('')
  const [weight, setWeight] = useState('')
  /* the service type decides which vehicles can be reserved */
  const [ftlService, setFtlService] = useState(DEFAULT_FTL_SERVICE)
  /* the vehicles: one line per vehicle type, several of each — ONE reserved
     pickup request per line, since a request carries one vehicle type */
  const [lines, setLines] = useState<VehicleLine[]>(() => [newLine(DEFAULT_FTL_SERVICE)])
  const setLine = (id: number, patch: Partial<VehicleLine>) =>
    setLines((ls) => ls.map((l) => (l.id === id ? { ...l, ...patch } : l)))
  /* a new service keeps each line's vehicle only if it still runs it */
  const pickFtlService = (code: string) => {
    setFtlService(code)
    setLines((ls) => ls.map((l) => ({ ...l, vehicleType: coerceVehicleType(code, l.vehicleType) })))
  }
  const totalVehicles = lines.reduce((n, l) => n + (Number(l.units) || 0), 0)

  const storeParty = scoped.find((s) => s.code === store)?.party
  const [contactName, setContactName] = useState(storeParty?.name ?? '')
  const [contactNumber, setContactNumber] = useState(storeParty?.contactNumber ?? '')
  const [instructions, setInstructions] = useState('')
  const [more, setMore] = useState(false)

  /* the contacts and the default destination follow the store the merchant
     picks, but never overwrite a typed value */
  const pickStore = (code: string) => {
    if (code === OTHER_ADDRESS) { setOtherPickup(true); return }
    setOtherPickup(false)
    setStore(code)
    const p = scoped.find((s) => s.code === code)?.party
    if (p) { setContactName(p.name); setContactNumber(p.contactNumber); setDestination(inboundHubFor(p)) }
  }

  const ftl = shipType === 'FTL'
  const win = windowOk(startAt, endAt) && !cutoffErr

  const piecesNum = Number(pieces)
  const weightNum = Number(weight)
  const piecesOk = Number.isFinite(piecesNum) && piecesNum >= 1
  const weightOk = Number.isFinite(weightNum) && weightNum > 0
  const shipFromOk = otherPickup ? partyOk(shipFrom) : !!store
  /* a vehicle booking needs a vehicle, a collection point and a window —
     load estimates and Ship To are deliberately NOT part of that */
  const valid = shipFromOk && win && (ftl ? lines.every((l) => !!l.vehicleType) : piecesOk && weightOk)

  /* the same van turning up twice: an OPEN booking at this very collection point
     whose window OVERLAPS the one being typed. A warning, never a block —
     a second van at the same dock is unusual, not impossible. */
  const clash = win ? findOpenPickupConflict(store, startAt, endAt, otherPickup ? shipFrom.line1 : '') : undefined

  const book = useMemo(() => scoped.map((s) => s.party), [scoped])

  const common = {
    storeCode: store, startAt, endAt,
    shipFrom: otherPickup ? shipFrom : null,
    contactName, contactNumber, instructions,
  }
  const submit = () => {
    if (!ftl) {
      const pr = growOrderActions.createBlindPickup({
        ...common, destinationCode: destination, shipmentType: 'Parcel',
        expectedPieces: piecesOk ? piecesNum : null,
        expectedWeightKg: weightOk ? weightNum : null,
        vehicleType: null, vehicleUnit: null, ftlServiceType: null, shipTo: null, note: '',
      })
      toast.success(`Pickup Request ${pr.number} created · ${piecesNum} shipment${piecesNum === 1 ? '' : 's'} expected`)
      onDone(pr)
      return
    }
    /* only addresses actually typed in count; an empty block is no address */
    const filled = shipTos.filter((a) => partyOk(a.party))
    const labelOf = (id: number) => `Address ${shipTos.findIndex((a) => a.id === id) + 1}`
    const mapped = (l: VehicleLine) => l.deliverTo.filter((id) => filled.some((a) => a.id === id))
    const mapping = filled.length
      ? lines.map((l, i) => `Vehicle ${i + 1} → ${mapped(l).map(labelOf).join(', ') || 'unassigned'}`).join('; ')
      : ''
    const reservation = lines.length > 1
      ? `Part of one FTL reservation — ${totalVehicles} vehicle${totalVehicles === 1 ? '' : 's'} across ${lines.length} vehicle lines` : ''
    /* the store keeps ONE shipTo per request: the line's first mapped address
       (else Address 1); the full vehicle → address map rides in the note */
    const prs = lines.map((l) => growOrderActions.createBlindPickup({
      ...common, destinationCode: null, shipmentType: 'FTL',
      expectedPieces: null, expectedWeightKg: Number(l.loadKg) > 0 ? Number(l.loadKg) : null,
      vehicleType: l.vehicleType, vehicleUnit: Number(l.units) || 1, ftlServiceType: ftlService,
      shipTo: (filled.find((a) => a.id === mapped(l)[0]) ?? filled[0])?.party ?? null,
      note: [reservation, mapping && `Deliver to: ${mapping}`].filter(Boolean).join(' · '),
    }))
    toast.success(prs.length === 1
      ? `Pickup Request ${prs[0].number} created · ${ftlService} · ${lines[0].units} × ${lines[0].vehicleType}`
      : `Pickup Requests ${prs.map((p) => p.number).join(', ')} created · ${ftlService}`)
    onDone(prs[0])
  }

  const addressLabels = shipTos.map((_, i) => `Address ${i + 1}`)
  const withAddresses = shipTos.length > 0

  const storeOptions = [
    ...scoped.map((s) => ({ value: s.code, label: storeOptionLabel(s) })),
    /* a collection address that is not one of the merchant's own stores is
       valid for BOTH shipment types — the store keeps it either way */
    { value: OTHER_ADDRESS, label: 'Other address…' },
  ]

  return (
    <Dialog open title="Create Pickup Request"
      subtitle="Reserved pickup — book a courier slot now and add the shipments later."
      onClose={onClose}
      footer={<>
        <Btn variant="outlined" color="neutral" onClick={onClose}>Cancel</Btn>
        <Btn color="accent2" disabled={!valid} startIcon={<Truck size={17} />} onClick={submit}>
          {ftl && lines.length > 1 ? `Create ${lines.length} Pickup Requests` : 'Create Pickup Request'}
        </Btn>
      </>}>
      <div className="space-y-5 pt-1">
        <OutlinedField label="Type" required value={shipType}
          onChange={(v) => setShipType(v as ShipmentType)} options={SHIP_TYPE_OPTIONS}
          helper={ftl ? 'Reserve whole vehicles; the shipments are attached later.' : 'A parcel handover into the network.'} />

        {/* console only — who the collection is for, ahead of where it is from */}
        {merchants && (
          <OutlinedField label="Select Merchant" required
            value={merchantName}
            onChange={(v) => { setMerchantName(v); setStore(''); setOtherPickup(false) }}
            placeholder={merchantName ? undefined : 'Select a merchant'}
            options={merchants.map((m) => ({ value: m.name, label: m.name }))}
            helper={merchantName
              ? `${scoped.length} pickup address${scoped.length === 1 ? '' : 'es'}`
              : 'The pickup addresses below are this merchant\u2019s own.'} />
        )}

        {/* both types open on where the driver goes. Nothing is rendered under
            the select: the option label already carries the address. */}
        <OutlinedField label="Ship From" required
          disabled={!!merchants && !merchantName}
          value={otherPickup ? OTHER_ADDRESS : store} onChange={pickStore}
          placeholder={store || otherPickup ? undefined : 'Select a pickup address'} options={storeOptions} />
        {otherPickup && (
          <div className="rounded-[6px] border border-grow-line px-4 py-4">
            <AddressFields party={shipFrom} set={(x) => setShipFrom((p) => ({ ...p, ...x }))} book={book}
              searchLabel="Search saved addresses…" />
          </div>
        )}

        <WindowFields startAt={startAt} endAt={endAt} onStart={setStartAt} onEnd={setEndAt}
          startError={cutoffErr} />

        {/* no orders exist yet on this form, so the only advice that means
            anything here is to move one of the two windows */}
        {clash && <DuplicateWindowNote pr={clash} advice="reschedule that request if this is the same collection." />}

        {/* what is being handed over, then how much of it — the one section
            that follows the Type field */}
        {ftl ? (
          <>
            <OutlinedField label="Service Type" required value={ftlService} onChange={pickFtlService}
              options={FTL_SERVICE_CODES.map((v) => ({ value: v }))}
              helper={`${vehiclesFor(ftlService).length} vehicle types can be reserved for this service`} />

            {/* where the vehicles deliver — optional, hidden until asked for,
                and ABOVE the vehicles so Deliver to has its options */}
            {shipTos.map((a, i) => (
              <div key={a.id} className="rounded-[6px] border border-grow-line px-4 py-4">
                <p className="mb-3 flex items-center justify-between gap-3 text-[14px] font-medium text-grow-ink">
                  Ship To · Address {i + 1}
                  <button type="button" onClick={() => setShipTos((as) => as.filter((x) => x.id !== a.id))}
                    className="text-[13px] font-medium text-grow-accent-2 hover:underline">Remove</button>
                </p>
                <AddressFields party={a.party}
                  set={(x) => setShipTos((as) => as.map((y) => (y.id === a.id ? { ...y, party: { ...y.party, ...x } } : y)))}
                  book={book} searchLabel="Search address book by name, number, address…" />
              </div>
            ))}
            <button type="button" onClick={() => setShipTos((as) => [...as, newShipTo()])}
              className="block text-[14px] font-medium text-grow-accent-2 hover:underline">
              {withAddresses ? '+ Add another ship-to address' : '+ Add ship-to address'}
            </button>

            <div>
              <p className="mb-2 text-[14px] font-medium text-grow-ink">
                Vehicles<span className="text-grow-error"> *</span>
                <span className="ml-2 text-[13px] font-normal text-grow-ink-2">
                  {totalVehicles} vehicle{totalVehicles === 1 ? '' : 's'}
                </span>
              </p>
              <div className="rounded-[6px] border border-grow-line">
                <table className="w-full table-fixed">
                  <colgroup>
                    <col /><col className="w-[150px]" /><col className="w-[130px]" />
                    {withAddresses && <col className="w-[150px]" />}<col className="w-[44px]" />
                  </colgroup>
                  <thead>
                    <tr className={TABLE_HEAD_ROW}>
                      <th className={TABLE_TH}>Vehicle Type<span className="text-grow-error"> *</span></th>
                      <th className={TABLE_TH}>No. of vehicles</th>
                      <th className={TABLE_TH}>Est. load (kg)</th>
                      {withAddresses && <th className={TABLE_TH}>Deliver to</th>}
                      <th aria-label="Remove" />
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((l, i) => (
                      <tr key={l.id} className="h-[52px] border-t border-grow-line">
                        <td className="px-1">
                          <OutlinedField size="sm" variant="ghost" label="Vehicle Type" value={l.vehicleType}
                            options={vehiclesFor(ftlService).map((v) => ({ value: v.type }))}
                            onChange={(v) => setLine(l.id, { vehicleType: v })} />
                        </td>
                        <td className="px-1">
                          <OutlinedField size="sm" variant="ghost" label="No. of vehicles" value={l.units}
                            options={VEHICLE_UNITS.map((v) => ({ value: v }))} onChange={(v) => setLine(l.id, { units: v })} />
                        </td>
                        <td className="px-1">
                          <OutlinedField size="sm" variant="ghost" label="Est. load (kg)" type="number" value={l.loadKg}
                            placeholder={vehicleSpec(l.vehicleType).capacity.split(' · ')[0].replace('Payload ', '')}
                            onChange={(v) => setLine(l.id, { loadKg: v })} />
                        </td>
                        {withAddresses && (
                          <td className="px-1">
                            <MultiSelect placeholder="Select" maxChips={1}
                              options={shipTos.map((a, k) => ({ value: String(a.id), label: addressLabels[k] }))}
                              value={l.deliverTo.filter((id) => shipTos.some((a) => a.id === id)).map(String)}
                              onChange={(vals) => setLine(l.id, { deliverTo: vals.map(Number) })} />
                          </td>
                        )}
                        <td className="px-1 text-center">
                          <button type="button" aria-label={`Remove vehicle ${i + 1}`} disabled={lines.length === 1}
                            onClick={() => setLines((ls) => ls.filter((x) => x.id !== l.id))}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-grow-ink-2 hover:bg-grow-ink/5 disabled:cursor-not-allowed disabled:opacity-40">
                            <X size={16} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button type="button" onClick={() => setLines((ls) => [...ls, newLine(ftlService)])}
                className="mt-3 text-[14px] font-medium text-grow-accent-2 hover:underline">
                + Add vehicle
              </button>
            </div>
          </>
        ) : (
          <div className="grid grid-cols-2 gap-5">
            <OutlinedField label="Estimated Number of Shipments" required type="number" value={pieces} onChange={setPieces} />
            <OutlinedField label="Estimated Weight (kg)" required type="number" value={weight} onChange={setWeight} />
          </div>
        )}

        <Disclosure label="More details" open={more} onToggle={() => setMore((v) => !v)}>
          <OutlinedField label="Instructions for driver" value={instructions} onChange={setInstructions} multiline rows={3}
            helper="Shared with the pickup driver." />
        </Disclosure>
      </div>
    </Dialog>
  )
}

/* --------------------------------------------- book a pickup from orders ---- */

/**
 * One booking-to-be: pickup point → inbound hub (or the vehicle's drop) on the
 * header, the load on the right, the address a driver drives to underneath, and
 * the orders behind a chevron — open by default only when there are few enough
 * to read at a glance.
 */
function BookingCard({ group: g, stores, conflict, onDrop }: {
  group: PickupGroup
  stores: StoreLocation[]
  /** An OPEN request at this pickup point whose window overlaps the typed one. */
  conflict?: GrowPickupRequest
  onDrop: (orderId: string) => void
}) {
  const [open, setOpen] = useState<boolean | null>(null)
  /* owner (2026-09-23): the dialog opens collapsed — a card expands only on request */
  const expanded = open ?? false
  const first = g.orders[0]
  const addr = storeAddress(g.storeCode, stores)
  const address = addr !== '-' ? addr : (first ? partyLine(first.sender) : '')
  const count = `${g.orders.length} order${g.orders.length === 1 ? '' : 's'}`
  return (
    <div className="rounded-[6px] border border-grow-line bg-white">
      <button type="button" onClick={() => setOpen(!expanded)} aria-expanded={expanded}
        aria-label={`${expanded ? 'Hide' : 'Show'} ${count}`}
        className="block w-full rounded-[6px] px-4 py-2.5 text-left hover:bg-grow-ink/[0.02]">
        <span className="flex items-baseline gap-3">
          <span className="min-w-0 flex-1 truncate text-[15px] text-grow-ink">
            <span className="font-bold">{storeName(g.storeCode, stores)}</span>
            <span className="mx-1.5 text-grow-ink-2">→</span>
            <span>{g.destinationLabel}</span>
          </span>
          <span className="shrink-0 text-[13px] text-grow-ink-2">{groupLoadLabel(g)}</span>
          <ChevronDown size={16} className={`shrink-0 self-center text-grow-ink-2 transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </span>
        <span className="mt-0.5 flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-[12px] text-grow-ink-2" title={address}>{address}</span>
          {conflict && (
            <span title={`${conflict.number} already collects here between ${prWindow(conflict)}`}>
              <Chip tone="warning" className="gap-1">
                <TriangleAlert size={13} /> Overlaps {conflict.number}
              </Chip>
            </span>
          )}
        </span>
      </button>
      {expanded && (
        <div className="border-t border-grow-line">
          {g.orders.map((o) => (
            <div key={o.id} className="flex items-center gap-3 border-b border-grow-line px-4 py-1.5 text-[13px] last:border-0">
              <span className="w-[120px] shrink-0 truncate font-medium text-grow-accent-2">{o.orderNumber}</span>
              <span className="min-w-0 flex-1 truncate text-grow-ink">{o.receiver.name}</span>
              <span className="shrink-0 text-grow-ink-2">{o.pkg.weightKg} kg</span>
              <button type="button" aria-label={`Remove ${o.orderNumber} from this booking`}
                title="Remove from this booking" onClick={() => onDrop(o.id)}
                className="-mr-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-grow-ink-2 hover:bg-grow-ink/5 hover:text-grow-error">
                <X size={16} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * **Book a Pickup** — the order-backed booking. The merchant chose the orders,
 * so the dialog first SHOWS what will be created — one card per
 * (pickup point → destination) pair, FTL orders each on their own — and then
 * asks only for what is still unknown (when, and what to tell the driver): the
 * grouping is a consequence, not a decision. Removing an order from a card
 * drops it from THIS booking only — the page's selection is untouched until
 * Book succeeds.
 */
export function BookPickupDialog({ orders, stores, onClose, onBooked }: {
  orders: GrowOrder[]
  stores: StoreLocation[]
  onClose: () => void
  onBooked: () => void
}) {
  const [showBookings, setShowBookings] = useState(false)
  const [dropped, setDropped] = useState<Set<string>>(new Set())
  const rules = useBookingRules()
  const [startAt, setStartAt] = useState(rules.initial.startAt)
  const [endAt, setEndAt] = useState(rules.initial.endAt)
  const cutoffErr = rules.check(startAt)
  const [instructions, setInstructions] = useState('')

  const kept = useMemo(() => orders.filter((o) => !dropped.has(o.id)), [orders, dropped])
  const groups = useMemo(() => groupForPickup(kept, stores), [kept, stores])
  const n = groups.length
  const win = windowOk(startAt, endAt) && !cutoffErr
  /* the same van twice: an OPEN booking at a card's collection point whose
     window overlaps the one being typed — flagged on THAT card, with one note
     under the window saying what to do about it */
  const conflicts = useMemo(() => new Map(win
    ? groups.map((g) => [g.key, findOpenPickupConflict(g.storeCode, startAt, endAt)] as const)
      .filter((e): e is readonly [string, GrowPickupRequest] => !!e[1])
    : []), [win, groups, startAt, endAt])
  const clash = conflicts.values().next().value

  const drop = (id: string) => setDropped((p) => new Set(p).add(id))

  const submit = () => {
    const tried = groups.map((g) => growOrderActions.createPickupRequest({
      storeCode: g.storeCode, destinationCode: g.destinationCode, startAt, endAt,
      orderIds: g.orders.map((o) => o.id), instructions, vehicle: g.vehicle,
      merchantCode: rules.merchantCode,
    }))
    /* orders with a validation error are never booked (the store skips them) */
    const made = tried.filter((p): p is NonNullable<typeof p> => !!p)
    const skipped = tried.reduce((n, p, i) => n + (p ? p.skipped.length : groups[i].orders.length), 0)
    if (skipped) toast.error(`${skipped} order${skipped === 1 ? '' : 's'} not booked — fix the flagged details first`)
    /* multiPrPolicy may fold a group into an OPEN request at the same pickup
       point — say which one, once per request, instead of claiming a new booking */
    const fresh = made.filter((p) => !p.merged)
    const joined = [...new Set(made.filter((p) => p.merged).map((p) => p.number))]
    joined.forEach((num) => toast.success(`Added to ${num} (open request at this pickup point)`))
    if (fresh.length) {
      toast.success(`${fresh.length} pickup request${fresh.length === 1 ? '' : 's'} booked (${fresh.map((p) => p.number).join(', ')})`)
    }
    onBooked()
  }

  return (
    <Dialog open title="Book a Pickup"
      subtitle="Specify the date and time window for scheduling your courier pickup."
      onClose={onClose}
      footer={<>
        <Btn variant="outlined" color="neutral" onClick={onClose}>Cancel</Btn>
        <Btn color="accent2" disabled={!win || n === 0} startIcon={<Truck size={17} />} onClick={submit}>
          Book {n} pickup{n === 1 ? '' : 's'}
        </Btn>
      </>}>
      <div className="space-y-5 pt-1">
        {/* what the merchant is about to create — a courier collects at one
            address and drops at one hub, so a mixed selection is several bookings */}
        <section>
          <button type="button" onClick={() => setShowBookings((v) => !v)} aria-expanded={showBookings}
            className={`mb-2 flex w-full items-center justify-between text-left text-[13px] text-grow-ink ${FOCUS_RING}`}>
            <span>
              {n === 0
                ? 'Every order has been removed \u2014 nothing left to book.'
                : <><span className="font-bold">{bookingCountLine(n)}</span>
                    <span className="text-grow-ink-2"> · {kept.length} order{kept.length === 1 ? '' : 's'}
                      {conflicts.size > 0 && <span className="text-[#B57F00]"> · {conflicts.size} overlap{conflicts.size === 1 ? '' : 's'} an open request</span>}</span></>}
            </span>
            <ChevronDown size={18} className={`shrink-0 text-grow-ink-2 transition-transform ${showBookings ? 'rotate-180' : ''}`} />
          </button>
          <div className={`max-h-[320px] space-y-2 overflow-y-auto ${showBookings ? '' : 'hidden'}`}>
            {groups.map((g) => (
              <BookingCard key={g.key} group={g} stores={stores} conflict={conflicts.get(g.key)} onDrop={drop} />
            ))}
            {n === 0 && (
              <p className="rounded-[6px] border border-dashed border-grow-line px-3 py-4 text-[13px] text-grow-ink-3">
                No orders left in this booking. Close the dialog to keep the selection.
              </p>
            )}
          </div>
        </section>

        <WindowFields startAt={startAt} endAt={endAt} onStart={setStartAt} onEnd={setEndAt}
          startError={cutoffErr} />

        {clash && <DuplicateWindowNote pr={clash} advice={canAddOrdersTo(clash, rules.policy.allowAddToExistingUntil)
          ? 'add these orders to that request instead, or pick another window.'
          /* scenario 25: past the add-until state the booking cannot join — say what happens instead */
          : `${clash.number} is already ${clash.status} and cannot take more orders, so these become a new request its driver will not collect.`} />}

        <OutlinedField label="Instructions for driver" value={instructions} onChange={setInstructions} multiline rows={3}
          helper="Shared with the pickup driver." />
      </div>
    </Dialog>
  )
}
