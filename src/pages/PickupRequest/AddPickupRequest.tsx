/**
 * Create a pickup request (CFT desk).
 *
 * Visual language is the Add Consignment page: numbered section cards, a 4-column
 * labelled field grid, required-ness shown as asterisk + per-section "Incomplete"
 * chips + a count line — never eager "Required field." text on a pristine form.
 *
 * The centrepiece is the duplicate-raise conflict: `createPickupRequest` returns
 * `{ conflict }` and creates NOTHING when `config.multiPrPolicy` forbids the raise,
 * so the page offers merge / create-anyway / change-slot instead of failing.
 */
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AlertTriangle, Boxes, CircleDot, ClipboardList, Info, ListChecks, PackageSearch,
} from 'lucide-react'
import {
  Button, Checkbox, DateInput, Input, MenuSelect, Toggle,
} from '../../nueva/components'
import { toast } from '../../nueva/toast'
import { pickupActions, unlinkedFirstMileAt, usePickupDb } from '../../pickup/store'
import { LOCATIONS, MERCHANT_LIST, isoDate, locationsForMerchant } from '../../pickup/seed'
import type { PickupRequest } from '../../pickup/types'

const DETAIL = (id: string) => `/console/order-management/pickup-request/${id}`
const NO_SLOT = 'NONE'

/* -------------------------------------------------------------------- pieces ---- */

/** Same anatomy as the Add Consignment section card, plus a step number badge. */
function SectionCard({ id, step, title, caption, incomplete, action, children }: {
  id?: string; step: number; title: string; caption?: string; incomplete?: boolean
  action?: React.ReactNode; children: React.ReactNode
}) {
  return (
    <section id={id} className="scroll-mt-20 overflow-hidden rounded-xl border border-line bg-surface shadow-ds-1 transition-all hover:border-warm-300">
      <div className="flex items-start justify-between gap-4 border-b border-line px-6 py-3.5">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-[14.5px] font-bold text-ink">
            <span className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-md bg-brand-50 text-[11.5px] font-black text-brand-600">
              {step}
            </span>
            {title}
            {incomplete && (
              <span className="rounded-full bg-warning-bg px-2 py-0.5 text-[11px] font-bold text-warning-fg">Incomplete</span>
            )}
          </h2>
          {caption && <p className="mt-0.5 max-w-[92ch] text-[12.5px] text-ink-3">{caption}</p>}
        </div>
        {action}
      </div>
      <div className="px-6 py-5">{children}</div>
    </section>
  )
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2 xl:grid-cols-4">{children}</div>
}

function Fld({ label, required, helper, children }: {
  label: string; required?: boolean; helper?: React.ReactNode; children: React.ReactNode
}) {
  return (
    <div className="min-w-0">
      <label className="mb-1.5 flex h-5 items-center gap-1 whitespace-nowrap text-[13px] font-bold text-ink" title={label}>
        <span className="truncate">{label}</span>
        {required && <span className="shrink-0 text-brand-500">*</span>}
      </label>
      {children}
      {helper && <div className="mt-1 text-[12px] text-ink-3">{helper}</div>}
    </div>
  )
}

function InlineToggle({ label, checked, onChange }: {
  label: string; checked: boolean; onChange: (v: boolean) => void
}) {
  return (
    <div className="min-w-0">
      <span className="mb-1.5 flex h-5 items-center whitespace-nowrap text-[13px] font-bold text-ink">{label}</span>
      <div className="flex h-8 items-center"><Toggle checked={checked} onChange={onChange} /></div>
    </div>
  )
}

function Segmented({ options, value, onChange }: {
  options: string[]; value: string; onChange: (v: string) => void
}) {
  return (
    <div className="flex flex-wrap gap-3">
      {options.map((o) => {
        const on = o === value
        return (
          <button key={o} type="button" onClick={() => onChange(o)}
            className={`flex items-center gap-2.5 rounded-md border px-4 py-2.5 text-[14px] transition-colors
              ${on ? 'border-brand-500 bg-brand-50/60 text-ink' : 'border-line bg-surface text-ink-2 hover:text-ink'}`}>
            <CircleDot size={15} className={on ? 'text-brand-500' : 'text-warm-400'} />
            {o}
          </button>
        )
      })}
    </div>
  )
}

function SubHead({ label, first }: { label: string; first?: boolean }) {
  return (
    <div className={`${first ? '' : 'mt-6'} mb-3 flex items-center gap-3`}>
      <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-ink-3">{label}</span>
      <span className="h-px flex-1 bg-line" />
    </div>
  )
}

function ReadOnlyRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-ink-3">{label}</p>
      <p className="mt-0.5 truncate text-[13px] text-ink" title={value}>{value || '—'}</p>
    </div>
  )
}

/* ---------------------------------------------------------------------- page ---- */

const MODE_PENDING = 'From pending consignments'
const MODE_BLIND = 'Blind pickup'

export default function AddPickupRequest() {
  const db = usePickupDb()
  const navigate = useNavigate()

  const [merchant, setMerchant] = useState('')
  const [location, setLocation] = useState('')
  // today + a mid-morning window by default: the same coordinates the seeded
  // PR-0001 holds, so the duplicate-raise conflict is one click away on stage
  const [slotDate, setSlotDate] = useState(isoDate(0))
  const [slotWindow, setSlotWindow] = useState('10:00-12:00')
  const [scannable, setScannable] = useState(true)
  const [expected, setExpected] = useState('')
  const [note, setNote] = useState('')
  const [mode, setMode] = useState(MODE_PENDING)
  const [selected, setSelected] = useState<string[]>([])
  const [conflict, setConflict] = useState<PickupRequest | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const blind = mode === MODE_BLIND
  const loc = location ? LOCATIONS[location] : undefined
  const merchantName = MERCHANT_LIST.find((m) => m.code === merchant)?.name ?? ''

  const slotOptions = useMemo(
    () => db.config.slots.map((s) => `${s.start}-${s.end}`),
    [db.config.slots],
  )
  // NOTE: selector is (db, locationCode, merchantCode?) — location first
  const pool = useMemo(
    () => (location ? unlinkedFirstMileAt(db, location, merchant || undefined) : []),
    [db.consignments, location, merchant],
  )
  const chosen = pool.filter((c) => selected.includes(c.id))

  const expectedNum = Number(expected)
  const expectedOk = expected.trim() !== '' && Number.isFinite(expectedNum) && expectedNum > 0

  const detailsReq = [!!merchant, !!location, scannable || expectedOk]
  const consignmentsReq = [blind ? expectedOk : selected.length > 0]
  const allReq = [...detailsReq, ...consignmentsReq]
  const missing = allReq.filter((ok) => !ok).length

  const pickMerchant = (code: string) => {
    setMerchant(code)
    setSelected([])
    setConflict(null)
    const locs = locationsForMerchant(code)
    // a merchant with exactly one location has nothing to choose — autofill it
    setLocation(locs.length === 1 ? locs[0].code : '')
  }

  const toggleRow = (id: string) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))

  const buildInput = (force: boolean) => {
    const [start, end] = slotWindow === NO_SLOT ? ['', ''] : slotWindow.split('-')
    return {
      merchantCode: merchant,
      locationCode: location,
      slot: slotWindow === NO_SLOT || !slotDate ? null : { date: slotDate, start, end },
      blind,
      expectedPieces: blind || !scannable ? (expectedOk ? expectedNum : null) : null,
      scannable,
      consignmentIds: blind ? [] : selected,
      source: 'CFT' as const,
      createdBy: 'cft.desk',
      force,
    }
  }

  const create = (force: boolean) => {
    if (missing > 0) { toast.error(`${missing} required field${missing === 1 ? '' : 's'} remaining.`); return }
    setSubmitting(true)
    const res = pickupActions.createPickupRequest(buildInput(force))
    setSubmitting(false)
    if (res.conflict) { setConflict(res.conflict); return }
    if (!res.pr) { toast.error('Could not raise the pickup request.'); return }
    toast.success(`${res.pr.id} raised for ${res.pr.merchantName} · ${res.pr.locationName}.`)
    navigate(DETAIL(res.pr.id))
  }

  const merge = () => {
    if (!conflict) return
    const pr = pickupActions.mergeIntoPickupRequest(conflict.id, selected)
    if (!pr) { toast.error(`Could not merge into ${conflict.id}.`); return }
    toast.success(`${selected.length} consignment${selected.length === 1 ? '' : 's'} merged into ${pr.id}.`)
    navigate(DETAIL(pr.id))
  }

  return (
    <div className="fe-nueva bg-canvas min-h-full p-5 pb-24">
      <div className="mx-auto grid min-w-0 max-w-[1100px] gap-5">

        {/* ------------------------------------------------ 1 · pickup details */}
        <SectionCard
          step={1} title="Pickup Details" incomplete={detailsReq.some((ok) => !ok)}
          caption="Where the pickup happens and when the driver is expected. The address and contact come from the location master.">
          <Grid>
            <Fld label="Merchant" required>
              <MenuSelect
                value={merchant} placeholder="Select merchant"
                options={MERCHANT_LIST.map((m) => m.code)}
                labels={(v) => MERCHANT_LIST.find((m) => m.code === v)?.name ?? v}
                onChange={pickMerchant}
              />
            </Fld>
            <Fld label="Pickup Location" required
              helper={merchant ? undefined : 'Pick a merchant first'}>
              <MenuSelect
                value={location} placeholder="Select location"
                options={locationsForMerchant(merchant || 'ALL').map((l) => l.code)}
                labels={(v) => LOCATIONS[v]?.name ?? v}
                onChange={(v) => { setLocation(v); setSelected([]); setConflict(null) }}
              />
            </Fld>
            <div id="fld-slot" className="scroll-mt-24 min-w-0">
              <Fld label="Slot Date">
                <DateInput value={slotDate} onChange={(v) => { setSlotDate(v); setConflict(null) }} />
              </Fld>
            </div>
            <Fld label="Slot Window" helper="No slot = any time on the chosen day">
              <MenuSelect
                value={slotWindow} placeholder="Select slot"
                options={[NO_SLOT, ...slotOptions]}
                labels={(v) => (v === NO_SLOT ? '— No slot —' : v.replace('-', ' – '))}
                onChange={(v) => { setSlotWindow(v); setConflict(null) }}
              />
            </Fld>
          </Grid>

          <SubHead label="Execution" />
          <Grid>
            <InlineToggle label="Scannable pickup" checked={scannable}
              onChange={(v) => { setScannable(v); if (v) setExpected(blind ? expected : '') }} />
            {!scannable && (
              <Fld label="Expected pieces" required
                helper="Count-based pickup — the driver confirms a piece count instead of scanning labels.">
                <Input value={expected} type="number" placeholder="eg, 5" onChange={setExpected} />
              </Fld>
            )}
            {!scannable && (
              <div className="sm:col-span-1 xl:col-span-2 flex items-start gap-2 rounded-md bg-warm-25 px-3.5 py-2.5 text-[12.5px] text-ink-3">
                <Info size={14} className="mt-0.5 shrink-0 text-brand-500" />
                Count-based pickup: no piece labels are scanned at the doorstep, so the
                driver's confirmed count is what closes the request.
              </div>
            )}
          </Grid>

          {loc && (
            <>
              <SubHead label="Location Master" />
              <div className="grid grid-cols-1 gap-x-6 gap-y-3 rounded-md bg-warm-25 px-4 py-3 sm:grid-cols-2 xl:grid-cols-4">
                <ReadOnlyRow label="Location code" value={loc.code} />
                <ReadOnlyRow label="Address" value={loc.address} />
                <ReadOnlyRow label="Contact" value={loc.contactName} />
                <ReadOnlyRow label="Phone" value={loc.contactPhone} />
              </div>
            </>
          )}
        </SectionCard>

        {/* -------------------------------------------------- 2 · consignments */}
        <SectionCard
          step={2} title="Consignments" incomplete={consignmentsReq.some((ok) => !ok)}
          caption="Raise against consignments the merchant has already pushed, or blind when no soft data exists yet.">
          <Segmented options={[MODE_PENDING, MODE_BLIND]} value={mode}
            onChange={(v) => { setMode(v); setConflict(null); setSelected([]) }} />

          {!blind ? (
            <div className="mt-5">
              {!location ? (
                <div className="flex items-center gap-2.5 rounded-md border border-dashed border-warm-300 px-4 py-6 text-[13px] text-ink-3">
                  <PackageSearch size={16} className="text-warm-400" />
                  Choose a merchant and pickup location to list the consignments waiting there.
                </div>
              ) : pool.length === 0 ? (
                <div className="flex items-center gap-2.5 rounded-md border border-dashed border-warm-300 px-4 py-6 text-[13px] text-ink-3">
                  <Boxes size={16} className="text-warm-400" />
                  No unlinked first-mile consignments at {loc?.name ?? location} — switch to a blind
                  pickup to raise one anyway.
                </div>
              ) : (
                <div className="overflow-hidden rounded-md border border-line">
                  <table className="w-full text-[13px]">
                    <thead>
                      <tr className="border-b border-line bg-thead text-[12px] font-bold text-ink-3">
                        <th className="w-10 px-4 py-2.5 text-left">
                          <Checkbox
                            checked={selected.length === pool.length}
                            indeterminate={selected.length > 0 && selected.length < pool.length}
                            onChange={() => setSelected(selected.length === pool.length ? [] : pool.map((c) => c.id))}
                          />
                        </th>
                        <th className="px-4 py-2.5 text-left">Consignment</th>
                        <th className="px-4 py-2.5 text-left">Order</th>
                        <th className="px-4 py-2.5 text-left">Delivery city</th>
                        <th className="px-4 py-2.5 text-right">Pieces</th>
                        <th className="px-4 py-2.5 text-right">Weight</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pool.map((c) => {
                        const on = selected.includes(c.id)
                        return (
                          <tr key={c.id} onClick={() => toggleRow(c.id)}
                            className={`cursor-pointer border-b border-line transition-colors last:border-0 ${on ? 'bg-brand-50' : 'hover:bg-warm-50'}`}>
                            <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                              <Checkbox checked={on} onChange={() => toggleRow(c.id)} />
                            </td>
                            <td className="px-4 py-3">
                              <span className="font-mono text-[12px] font-bold text-brand-500">{c.id}</span>
                              {!c.scannable && (
                                <span className="ml-2 rounded-full bg-warm-100 px-2 py-0.5 text-[11px] font-bold text-ink-2">SKU</span>
                              )}
                            </td>
                            <td className="px-4 py-3 font-mono text-[12px] text-ink-2">{c.orderId}</td>
                            <td className="px-4 py-3 text-ink-2">{c.deliveryCity || '—'}</td>
                            <td className="px-4 py-3 text-right tabular-nums text-ink-2">
                              {c.pieces.length || (c.skus?.length ? `${c.skus.length} SKU` : 0)}
                            </td>
                            <td className="px-4 py-3 text-right tabular-nums text-ink-2">{c.weightKg} kg</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              {pool.length > 0 && (
                <p className="mt-3 text-[12px] text-ink-3">
                  {selected.length} of {pool.length} consignment{pool.length === 1 ? '' : 's'} selected
                  {selected.length > 0 && ` · ${chosen.reduce((n, c) => n + c.pieces.length, 0)} piece(s)`}
                </p>
              )}
            </div>
          ) : (
            <div className="mt-5">
              <Grid>
                <Fld label="Expected pieces" required
                  helper="What the merchant declared over the phone or on the portal.">
                  <Input value={expected} type="number" placeholder="eg, 5" onChange={setExpected} />
                </Fld>
                {/* a PR carries no note field in the domain model — this is desk
                    context only, and says so rather than pretending otherwise */}
                <Fld label="Note" helper="Optional desk note — not carried on the request in this build.">
                  <Input value={note} placeholder="eg, boxes at the loading dock" onChange={setNote} />
                </Fld>
              </Grid>
              <div className="mt-4 flex items-start gap-3 rounded-md border border-line bg-warm-25 px-4 py-3">
                <Info size={15} className="mt-0.5 shrink-0 text-brand-500" />
                <div className="text-[12.5px] text-ink-2">
                  <p className="font-bold text-ink">No consignment data yet</p>
                  <p className="mt-0.5 text-ink-3">
                    The pickup is raised on the declared count alone. Whatever the driver scans is
                    recorded as an overage, and the merchant's soft data reconciles it into real
                    consignments afterwards — nothing is lost, and nothing is invented in the meantime.
                  </p>
                </div>
              </div>
            </div>
          )}
        </SectionCard>

        {/* --------------------------------------------------- 3 · review */}
        <SectionCard step={3} title="Review & create"
          caption="Confirm the request before it goes to dispatch.">
          <div className="grid grid-cols-1 gap-x-6 gap-y-3 rounded-md border border-line bg-warm-25 px-4 py-3.5 sm:grid-cols-2 xl:grid-cols-4">
            <ReadOnlyRow label="Merchant" value={merchantName} />
            <ReadOnlyRow label="Pickup location" value={loc?.name ?? ''} />
            <ReadOnlyRow label="Slot"
              value={slotWindow === NO_SLOT || !slotDate ? 'No slot' : `${slotDate} · ${slotWindow.replace('-', ' – ')}`} />
            <ReadOnlyRow label="Execution"
              value={`${blind ? 'Blind' : 'Against consignments'} · ${scannable ? 'Scan-based' : 'Count-based'}`} />
            <ReadOnlyRow label="Consignments" value={blind ? '— (blind)' : String(selected.length)} />
            <ReadOnlyRow label="Expected pieces"
              value={blind || !scannable
                ? (expectedOk ? String(expectedNum) : '—')
                : String(chosen.reduce((n, c) => n + c.pieces.length, 0))} />
            <ReadOnlyRow label="Source" value="CFT" />
            <ReadOnlyRow label="Policy" value={db.config.multiPrPolicy.replace(/_/g, ' ')} />
          </div>

          {/* ------ the duplicate-raise conflict: nothing was created ------ */}
          {conflict && (
            <div className="mt-4 rounded-md border border-warning-fg/30 bg-warning-bg px-4 py-3.5">
              <div className="flex items-start gap-2.5">
                <AlertTriangle size={16} className="mt-0.5 shrink-0 text-warning-fg" />
                <div className="min-w-0">
                  <p className="text-[13px] font-bold text-warning-fg">
                    An open pickup request ({conflict.id}) already exists for this merchant + location + slot
                  </p>
                  <p className="mt-1 text-[12.5px] text-ink-2">
                    {conflict.merchantName} · {conflict.locationName}
                    {conflict.slot ? ` · ${conflict.slot.date} ${conflict.slot.start}–${conflict.slot.end}` : ' · no slot'}
                    {' · '}raised {new Date(conflict.createdAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })} by {conflict.createdBy}.
                    Nothing has been created — pick what should happen.
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {!blind && selected.length > 0 ? (
                      <Button icon={<ListChecks size={14} />} onClick={merge}>
                        Merge into {conflict.id}
                      </Button>
                    ) : (
                      <Button variant="outline" icon={<ClipboardList size={14} />}
                        onClick={() => navigate(DETAIL(conflict.id))}>
                        Open {conflict.id}
                      </Button>
                    )}
                    <Button variant="outline" onClick={() => create(true)}>Create anyway</Button>
                    {/* only ONE_PER_SLOT compares slots — under ONE_OPEN a different
                        slot cannot clear the conflict, so the option is not offered */}
                    {db.config.multiPrPolicy === 'ONE_PER_SLOT' && (
                      <Button variant="ghost"
                        onClick={() => {
                          document.getElementById('fld-slot')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
                        }}>
                        Change slot
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="mt-5 flex items-center justify-between gap-3 border-t border-line pt-4">
            <div className="flex items-center gap-2.5">
              <span className="h-1.5 w-28 overflow-hidden rounded-full bg-warm-100">
                <span className="block h-full rounded-full bg-success-fg transition-all"
                  style={{ width: `${Math.round(((allReq.length - missing) / allReq.length) * 100)}%` }} />
              </span>
              <span className="whitespace-nowrap text-[12px] tabular-nums text-ink-3">
                {allReq.length - missing}/{allReq.length} required
              </span>
            </div>
            <div className="flex items-center gap-2.5">
              <Button variant="outline" onClick={() => navigate('/console/order-management/pickup-request')}>Cancel</Button>
              <Button onClick={() => create(false)} disabled={submitting || missing > 0}>
                {submitting ? 'Creating…' : 'Create Pickup Request'}
              </Button>
            </div>
          </div>
        </SectionCard>
      </div>
    </div>
  )
}
