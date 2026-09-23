/**
 * Grow portal — shared UI + the two request sheets.
 *
 * Small design-system-flavoured primitives (Chip / Card / Fld / ReadOnly) and
 * the status maps live here so all three Grow pages render the same grammar.
 * The Schedule and Blind sheets are the merchant's two ways to raise a PR —
 * both preserve the duplicate-raise conflict handling from the original portal.
 */
import { useState } from 'react'
import {
  AlertTriangle, ChevronDown, PackagePlus, Send, Sparkles,
} from 'lucide-react'
import {
  Button, DateInput, Input, MenuSelect, Modal, Toggle,
} from '../../nueva/components'
import { toast } from '../../nueva/toast'
import { pickupActions, usePickupDb } from '../../pickup/store'
import { LOCATIONS, isoDate, locationsForMerchant } from '../../pickup/seed'
import type { PickupRequest, PRStatus } from '../../pickup/types'

export const NO_SLOT = 'NONE'

export const STATUS_TONE: Record<PRStatus, 'success' | 'info' | 'warning' | 'danger' | 'neutral'> = {
  OPEN: 'info', PLANNED: 'neutral', IN_PROGRESS: 'warning', COMPLETED: 'success',
  COMPLETED_SHORT: 'warning', FAILED: 'danger', CANCELLED: 'neutral',
}
export const STATUS_LABEL: Record<PRStatus, string> = {
  OPEN: 'Open', PLANNED: 'Planned', IN_PROGRESS: 'In Progress', COMPLETED: 'Completed',
  COMPLETED_SHORT: 'Completed Short', FAILED: 'Failed', CANCELLED: 'Cancelled',
}
/** statuses whose PRs have actually run (show a collected/expected pair) */
export const RAN: PRStatus[] = ['IN_PROGRESS', 'COMPLETED', 'COMPLETED_SHORT', 'FAILED']

/* --------------------------------------------------------------- primitives ---- */

export function Chip({ children, tone = 'neutral' }: { children: React.ReactNode; tone?: 'neutral' | 'brand' }) {
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-bold
      ${tone === 'brand' ? 'bg-brand-50 text-brand-600' : 'bg-warm-100 text-ink-2'}`}>
      {children}
    </span>
  )
}

export function ReadyChip() {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-[12px] text-ink-2">
      <span className="h-1.5 w-1.5 rounded-full bg-success-fg" />
      Ready for pickup
    </span>
  )
}

export function Fld({ label, required, helper, children }: {
  label: string; required?: boolean; helper?: React.ReactNode; children: React.ReactNode
}) {
  return (
    <div className="min-w-0">
      <label className="mb-1.5 flex h-5 items-center gap-1 text-[13px] font-bold text-ink">
        <span className="truncate">{label}</span>
        {required && <span className="shrink-0 text-brand-500">*</span>}
      </label>
      {children}
      {helper && <div className="mt-1 text-[12px] text-ink-3">{helper}</div>}
    </div>
  )
}

export function ReadOnly({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-ink-3">{label}</p>
      <p className="mt-0.5 truncate text-[13px] text-ink" title={value}>{value || '—'}</p>
    </div>
  )
}

export function Card({ title, subtitle, right, children }: {
  title: string; subtitle?: string; right?: React.ReactNode; children: React.ReactNode
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-line bg-surface shadow-ds-1">
      <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-3.5">
        <div className="min-w-0">
          <h2 className="text-[15px] font-bold text-ink">{title}</h2>
          {subtitle && <p className="mt-0.5 text-[12.5px] text-ink-3">{subtitle}</p>}
        </div>
        {right}
      </div>
      {children}
    </section>
  )
}

/** Collapsible "View API request" disclosure — the live JSON body, kept secondary. */
export function ApiDisclosure({ method, path, body }: { method: string; path: string; body: unknown }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="mt-5 rounded-md border border-line">
      <button type="button" onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3.5 py-2.5 text-left text-[12.5px] font-bold text-ink-2 hover:bg-warm-50">
        <ChevronDown size={14} className={`text-warm-400 transition-transform ${open ? '' : '-rotate-90'}`} />
        View API request
        <span className="ml-auto font-mono text-[11px] font-normal text-ink-3">{method} {path}</span>
      </button>
      {open && (
        <div className="border-t border-line px-3.5 py-3">
          <pre className="max-h-72 overflow-auto rounded-md bg-warm-25 px-3.5 py-3 font-mono text-[11px] leading-[1.6] text-ink-2">
{JSON.stringify(body, null, 2)}
          </pre>
          <p className="mt-2 text-[11.5px] text-ink-3">
            The portal sends this exact body — a request raised straight through the API
            lands in the same queue with <span className="font-mono">source: "API"</span>.
          </p>
        </div>
      )}
    </div>
  )
}

/** Amber duplicate-raise card — shared by both sheets; nothing was created. */
export function ConflictCard({ conflict, canMerge, onMerge, onForce, onChangeSlot }: {
  conflict: PickupRequest; canMerge: boolean
  onMerge: () => void; onForce: () => void; onChangeSlot: () => void
}) {
  return (
    <div className="mt-4 rounded-md border border-warning-fg/30 bg-warning-bg px-4 py-3.5">
      <div className="flex items-start gap-2.5">
        <AlertTriangle size={16} className="mt-0.5 shrink-0 text-warning-fg" />
        <div className="min-w-0">
          <p className="text-[13px] font-bold text-warning-fg">
            You already have an open pickup ({conflict.id}) for this location and slot
          </p>
          <p className="mt-1 text-[12.5px] text-ink-2">
            {conflict.slot
              ? `${conflict.slot.date} · ${conflict.slot.start}–${conflict.slot.end}`
              : 'No slot'} — nothing has been booked yet. Choose what to do.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {canMerge && <Button onClick={onMerge}>Merge into {conflict.id}</Button>}
            <Button variant="outline" onClick={onForce}>Book a separate pickup</Button>
            <Button variant="ghost" onClick={onChangeSlot}>Change slot</Button>
          </div>
        </div>
      </div>
    </div>
  )
}

/* -------------------------------------------------------------- selection bar ---- */

/**
 * Sticky bottom bar shown while consignments are selected — shared by the
 * Raise Pickup and My Consignments pages. Enforces the single-location rule:
 * "Request Pickup" is disabled (with an inline hint) until every selected row
 * shares one pickup location.
 */
export function SelectionBar({ count, pieces, weight, oneLocation, location, onClear, onRequest }: {
  count: number; pieces: number; weight: number; oneLocation: boolean; location: string
  onClear: () => void; onRequest: () => void
}) {
  if (count === 0) return null
  return (
    <div className="fixed bottom-5 left-1/2 z-40 -translate-x-1/2">
      <div className="flex items-center gap-4 rounded-xl border border-line bg-surface px-4 py-2.5 shadow-ds-overlay">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-500 text-[12px] font-bold text-white">
          {count}
        </span>
        <span className="whitespace-nowrap text-[12.5px] text-ink-2">
          selected · <span className="tabular-nums font-bold text-ink">{pieces}</span> pieces ·{' '}
          <span className="tabular-nums font-bold text-ink">~{weight}</span> kg
          {oneLocation
            ? <> · <span className="font-mono text-ink-3">{location}</span></>
            : <span className="text-warning-fg"> · multiple locations</span>}
        </span>
        <button onClick={onClear}
          className="text-[12.5px] font-bold text-ink-3 hover:text-ink">Clear</button>
        {!oneLocation && (
          <span className="max-w-[220px] text-[11.5px] text-warning-fg">
            Select consignments from one location to schedule.
          </span>
        )}
        <Button icon={<Send size={14} />} onClick={onRequest} disabled={!(count > 0 && oneLocation)}>
          Request Pickup
        </Button>
      </div>
    </div>
  )
}

/* --------------------------------------------------------------------- slots ---- */

function slotList(db: ReturnType<typeof usePickupDb>): string[] {
  return db.config.slots.map((s) => `${s.start}-${s.end}`)
}

/* ------------------------------------------------------------------ schedule ---- */

export function ScheduleSheet({ open, onClose, merchant, locationCode, consignmentIds, pieceCount, onDone }: {
  open: boolean; onClose: () => void; merchant: string; locationCode: string
  consignmentIds: string[]; pieceCount: number; onDone: () => void
}) {
  const db = usePickupDb()
  const [slotDate, setSlotDate] = useState(isoDate(0))
  const [slotWindow, setSlotWindow] = useState('10:00-12:00')
  const [scannable, setScannable] = useState(true)
  const [conflict, setConflict] = useState<PickupRequest | null>(null)

  const loc = LOCATIONS[locationCode]
  const createdBy = loc ? `${loc.contactName.toLowerCase().replace(/\s+/g, '.')}@grow` : 'grow.portal'

  const payload = {
    merchantCode: merchant,
    locationCode,
    slot: slotWindow === NO_SLOT || !slotDate
      ? null
      : { date: slotDate, start: slotWindow.split('-')[0], end: slotWindow.split('-')[1] },
    blind: false,
    scannable,
    expectedPieces: null,
    expectedWeightKg: null,
    consignmentIds,
    source: 'GROW',
    createdBy,
  }

  const submit = (force: boolean) => {
    const res = pickupActions.createPickupRequest({ ...payload, source: 'GROW', force })
    if (res.conflict) { setConflict(res.conflict); return }
    if (!res.pr) { toast.error('Could not raise the pickup request.'); return }
    toast.success(`${res.pr.id} raised — we'll collect ${consignmentIds.length} consignment(s) from ${res.pr.locationName}.`)
    setConflict(null)
    onDone()
  }

  const merge = () => {
    if (!conflict) return
    const pr = pickupActions.mergeIntoPickupRequest(conflict.id, consignmentIds)
    if (!pr) { toast.error(`Could not add to ${conflict.id}.`); return }
    toast.success(`Added ${consignmentIds.length} consignment(s) to ${pr.id}.`)
    setConflict(null)
    onDone()
  }

  return (
    <Modal title="Schedule pickup" open={open} onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button icon={<Send size={14} />} onClick={() => submit(false)}>Confirm pickup</Button>
        </>
      }>
      <div className="space-y-5 pb-2">
        <div className="grid grid-cols-1 gap-x-6 gap-y-3 rounded-md bg-warm-25 px-4 py-3.5 sm:grid-cols-3">
          <ReadOnly label="Pickup location" value={loc ? `${loc.name}` : locationCode} />
          <ReadOnly label="Address" value={loc?.address ?? ''} />
          <ReadOnly label="Consignments" value={`${consignmentIds.length} · ${pieceCount} piece(s)`} />
        </div>

        <div className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-3">
          <Fld label="Pickup date">
            <DateInput value={slotDate} onChange={(v) => { setSlotDate(v); setConflict(null) }} />
          </Fld>
          <Fld label="Time window" helper="No slot = any time that day">
            <MenuSelect
              value={slotWindow} options={[NO_SLOT, ...slotList(db)]}
              labels={(v) => (v === NO_SLOT ? '— No slot —' : v.replace('-', ' – '))}
              onChange={(v) => { setSlotWindow(v); setConflict(null) }}
            />
          </Fld>
          <div className="min-w-0">
            <span className="mb-1.5 flex h-5 items-center text-[13px] font-bold text-ink">Labels on the boxes</span>
            <div className="flex h-8 items-center gap-2.5">
              <Toggle checked={scannable} onChange={setScannable} />
              <span className="text-[12.5px] text-ink-3">{scannable ? 'Driver scans each label' : 'Driver counts pieces'}</span>
            </div>
          </div>
        </div>

        {conflict && (
          <ConflictCard
            conflict={conflict} canMerge={consignmentIds.length > 0}
            onMerge={merge} onForce={() => submit(true)} onChangeSlot={() => setConflict(null)}
          />
        )}

        <ApiDisclosure method="POST" path="/api/v1/pickup-requests" body={payload} />
      </div>
    </Modal>
  )
}

/* --------------------------------------------------------------------- blind ---- */

export function BlindSheet({ open, onClose, merchant, onDone }: {
  open: boolean; onClose: () => void; merchant: string; onDone: () => void
}) {
  const db = usePickupDb()
  const locs = locationsForMerchant(merchant)
  const [location, setLocation] = useState(locs[0]?.code ?? '')
  const [slotDate, setSlotDate] = useState(isoDate(0))
  const [slotWindow, setSlotWindow] = useState('14:00-16:00')
  const [expected, setExpected] = useState('')
  const [weight, setWeight] = useState('')
  const [note, setNote] = useState('')
  const [conflict, setConflict] = useState<PickupRequest | null>(null)

  // the switcher can change under an open sheet — keep the location valid
  const effLocation = locs.some((l) => l.code === location) ? location : (locs[0]?.code ?? '')
  const loc = LOCATIONS[effLocation]
  const createdBy = loc ? `${loc.contactName.toLowerCase().replace(/\s+/g, '.')}@grow` : 'grow.portal'
  const expectedNum = Number(expected)
  const expectedOk = expected.trim() !== '' && Number.isFinite(expectedNum) && expectedNum > 0
  const weightNum = Number(weight)
  // weight is optional — only carried when a positive number is entered
  const weightOk = weight.trim() !== '' && Number.isFinite(weightNum) && weightNum > 0

  const payload = {
    merchantCode: merchant,
    locationCode: effLocation,
    slot: slotWindow === NO_SLOT || !slotDate
      ? null
      : { date: slotDate, start: slotWindow.split('-')[0], end: slotWindow.split('-')[1] },
    blind: true,
    scannable: true,
    expectedPieces: expectedOk ? expectedNum : null,
    expectedWeightKg: weightOk ? weightNum : null,
    consignmentIds: [] as string[],
    source: 'GROW',
    createdBy,
  }

  const submit = (force: boolean) => {
    if (!expectedOk) { toast.error('Enter how many pieces will be handed over.'); return }
    const res = pickupActions.createPickupRequest({ ...payload, source: 'GROW', force })
    if (res.conflict) { setConflict(res.conflict); return }
    if (!res.pr) { toast.error('Could not raise the pickup request.'); return }
    toast.success(`${res.pr.id} raised — blind pickup for ${expectedNum} piece(s)${weightOk ? ` · ~${weightNum} kg` : ''} at ${res.pr.locationName}.`)
    setConflict(null); setExpected(''); setWeight(''); setNote('')
    onDone()
  }

  return (
    <Modal title="Raise a blind pickup" open={open} onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button icon={<PackagePlus size={14} />} onClick={() => submit(false)} disabled={!expectedOk}>
            Raise blind pickup
          </Button>
        </>
      }>
      <div className="space-y-5 pb-2">
        <div className="flex items-start gap-3 rounded-md border border-line bg-warm-25 px-4 py-3">
          <Sparkles size={15} className="mt-0.5 shrink-0 text-brand-500" />
          <p className="text-[12.5px] text-ink-2">
            <span className="font-bold text-ink">No consignment data needed.</span> Tell us where, when
            and roughly how much — whatever the driver collects is reconciled against your soft
            data afterwards. Nothing is lost, and nothing is invented in the meantime.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
          <Fld label="Pickup location" required>
            <MenuSelect
              value={effLocation} options={locs.map((l) => l.code)}
              labels={(v) => LOCATIONS[v]?.name ?? v}
              onChange={(v) => { setLocation(v); setConflict(null) }}
            />
          </Fld>
          <Fld label="Expected pieces" required helper="Your best estimate — we'll confirm on site.">
            <Input value={expected} type="number" placeholder="eg, 5" onChange={(v) => { setExpected(v); setConflict(null) }} />
          </Fld>
          <Fld label="Expected weight (kg)" helper="Optional — total weight across all pieces.">
            <Input value={weight} type="number" placeholder="eg, 40" onChange={(v) => { setWeight(v); setConflict(null) }} />
          </Fld>
          <Fld label="Pickup date">
            <DateInput value={slotDate} onChange={(v) => { setSlotDate(v); setConflict(null) }} />
          </Fld>
          <Fld label="Time window" helper="No slot = any time that day">
            <MenuSelect
              value={slotWindow} options={[NO_SLOT, ...slotList(db)]}
              labels={(v) => (v === NO_SLOT ? '— No slot —' : v.replace('-', ' – '))}
              onChange={(v) => { setSlotWindow(v); setConflict(null) }}
            />
          </Fld>
          <Fld label="Note" helper="Optional — not carried on the request in this build.">
            <Input value={note} placeholder="eg, boxes at the loading dock" onChange={setNote} />
          </Fld>
        </div>

        {conflict && (
          <ConflictCard
            conflict={conflict} canMerge={false}
            onMerge={() => {}} onForce={() => submit(true)} onChangeSlot={() => setConflict(null)}
          />
        )}

        <ApiDisclosure method="POST" path="/api/v1/pickup-requests" body={payload} />
      </div>
    </Modal>
  )
}
