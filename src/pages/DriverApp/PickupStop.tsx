import { useState } from 'react'
import {
  Camera, Check, CircleAlert, Keyboard, MapPin, Minus, Navigation2, PackagePlus, PackageX, PenLine, Phone, Plus, ScanLine, X,
} from 'lucide-react'
import { Btn, Card, Chip, IconBtn, ProgressBar, ReasonList, Screen, SectionLabel, Sheet, SwipeButton, TopBar } from './ui'
import { phoneToast } from './phoneToast'
import {
  blankWork, CARRIER_SIDE, completePickup, findOrderByCode, isReserved, MERCHANT_SIDE_REASONS, newOverageId, orderLabel,
  pickupParty, type DriverOverage, type PickupWork,
} from './model'
import { orderById, pickupRequestById } from '../../growOrders/store'
import { isOpenPr } from '../../growOrders/tabs'
import { failureReasonLabel, PICKABLE_FAILURE_REASONS, reasonLabel } from '../../growOrders/pickupReasons'
import { usePickupModuleConfig } from '../../config/pickupModule'
import { planningActions, type LocalTrip, type PlannedStop } from '../LocalPFP/planningStore'

type SheetState =
  | { kind: 'scan' }
  | { kind: 'overage'; barcode: string }
  | { kind: 'notPicked'; orderId: string }
  | { kind: 'unable' }
  | { kind: 'confirm' }
  | { kind: 'outcome' }
  | null

const OVERAGE_ACTIONS: Record<'hold' | 'auto-create' | 'reject', DriverOverage['action'][]> = {
  hold: ['hold', 'reject'], 'auto-create': ['create', 'reject'], reject: ['reject'],
}
const ACTION_LABEL: Record<DriverOverage['action'], string> = { hold: 'Held for ops', create: 'Consignment on completion', reject: 'Rejected — left behind' }

export default function PickupStopScreen({ trip, stop, work, setWork, onBack, onDebrief, remainingAfter }: {
  trip: LocalTrip
  stop: PlannedStop
  work: PickupWork | undefined
  setWork: (fn: (w: PickupWork) => PickupWork) => void
  onBack: () => void
  onDebrief: () => void
  /** stops still pending on the trip other than this one */
  remainingAfter: number
}) {
  const cfg = usePickupModuleConfig()
  const [sheet, setSheet] = useState<SheetState>(null)
  const [manual, setManual] = useState('')
  const [reason, setReason] = useState('')
  const [ovWeight, setOvWeight] = useState('')
  const [ovNote, setOvNote] = useState('')
  const pr = pickupRequestById(stop.prId)
  if (!pr) {
    return (
      <Screen header={<TopBar title="Pick Up" onBack={onBack} />}>
        <div className="p-6 text-center text-[15px] text-[#5B6B82]">This pickup request no longer exists.</div>
      </Screen>
    )
  }
  const w = work ?? blankWork(pr.expectedPieces ?? 0)
  const party = pickupParty(pr)
  const reserved = isReserved(pr)
  const open = isOpenPr(pr.status)
  const running = trip.status === 'In Transit'
  const arrived = stop.status === 'Arrived'
  const mode = pr.handover.mode
  /* H2 — a hub-scan account: the driver does not scan at the door. The stop
     completes BY COUNT (every booked parcel) and the hub in-scan confirms it. */
  const countOnly = mode === 'hub' && !reserved
  const booked = pr.orderIds
  const picked = booked.filter((i) => w.scanned.includes(i))
  const notPicked = booked.filter((i) => !w.scanned.includes(i) && w.notPicked[i])
  const toPick = booked.filter((i) => !w.scanned.includes(i) && !w.notPicked[i])
  const extras = w.scanned.filter((i) => !booked.includes(i))
  const pod = cfg.podRequirements
  const podMissing = [
    pod.signature === 'required' && !w.signed ? 'signature' : null,
    pod.photo === 'required' && !w.photo ? 'photo' : null,
    pod.otp && w.otp.length < 4 ? 'OTP' : null,
  ].filter(Boolean) as string[]
  const allowed = OVERAGE_ACTIONS[cfg.overagePolicy]

  const closeSheet = () => { setSheet(null); setReason(''); setOvWeight(''); setOvNote('') }

  const handleCode = (raw: string) => {
    const code = raw.trim()
    if (!code) return
    if (!open) { phoneToast(`${pr.number} is closed — scan not recorded`, 'error'); return }
    if (w.overages.some((v) => v.barcode.toLowerCase() === code.toLowerCase())) { phoneToast(`${code} already scanned`, 'error'); return }
    const o = findOrderByCode(code)
    if (!o) { setSheet({ kind: 'overage', barcode: code }); setManual(''); return }
    if (w.scanned.includes(o.id)) { phoneToast(`${o.orderNumber} already scanned`, 'error'); return }
    setWork((x) => {
      const np = { ...x.notPicked }
      delete np[o.id]
      return { ...x, scanned: [...x.scanned, o.id], notPicked: np }
    })
    setManual('')
    if (booked.includes(o.id)) phoneToast(`Picked ${o.orderNumber}`, 'success')
    else {
      const other = pickupRequestById(o.pickupRequestId)
      phoneToast(`${o.orderNumber} is ${other ? `booked on ${other.number}` : 'not on a pickup'} — added as extra`)
    }
  }

  const addOverage = (action: DriverOverage['action'], barcode: string) => {
    const kg = Number(ovWeight)
    setWork((x) => ({ ...x, overages: [...x.overages, {
      id: newOverageId(), barcode, action, weightKg: ovWeight && Number.isFinite(kg) ? kg : null, note: ovNote.trim(),
    }] }))
    phoneToast(action === 'reject' ? `${barcode} rejected — leave it with the merchant` : `${barcode} recorded as overage`)
    closeSheet()
  }

  const doComplete = () => {
    const captured = w.signed || w.photo || w.otp.length >= 4
    completePickup(trip.id, pr.id, w, captured
      ? { signature: w.signed, photo: w.photo, otp: w.otp.length >= 4, at: new Date().toISOString() }
      : null)
    setSheet({ kind: 'outcome' })
  }
  const tryComplete = () => {
    if (!arrived || !open) return
    if (podMissing.length) { phoneToast(`Proof of pickup needed: ${podMissing.join(', ')}`, 'error'); return }
    if (!reserved && !countOnly && toPick.length) { setSheet({ kind: 'confirm' }); return }
    doComplete()
  }
  const doFail = () => {
    planningActions.failPickupStop(trip.id, pr.id, reason)
    setSheet({ kind: 'outcome' })
    setReason('')
    phoneToast(`${pr.number} failed — ${failureReasonLabel(reason)}. Merchant notified.`)
  }

  const counted = reserved ? w.pieces : countOnly ? booked.length : picked.length
  const expected = reserved ? (pr.expectedPieces ?? 0) : booked.length

  /* ------------------------------------------------------------ render ---- */
  const header = (
    <TopBar title={`Pick Up · ${pr.number}`} sub={party.merchant} onBack={onBack}
      right={<IconBtn label="Call" tone="soft" onClick={() => phoneToast(`Calling ${party.contact || party.merchant}… (mock)`)}><Phone size={16} /></IconBtn>} />
  )

  let footer: React.ReactNode
  if (open && running && !arrived) {
    footer = <SwipeButton label="Arrive" onConfirm={() => { planningActions.arriveStop(trip.id, pr.id); phoneToast(`Arrived at ${party.place}`) }} />
  } else if (open && running && arrived) {
    footer = (
      <div className="flex flex-col gap-2">
        {podMissing.length > 0 && <div className="text-center text-[13px] text-[#B42323]">Needs {podMissing.join(' + ')} before completing</div>}
        <SwipeButton label="Complete pickup" tone="green" disabled={podMissing.length > 0} onConfirm={tryComplete} />
        <button type="button" onClick={() => setSheet({ kind: 'unable' })} className="h-11 text-[15px] font-bold text-[#B42323]">Unable to pick up</button>
      </div>
    )
  } else if (!open) {
    footer = remainingAfter === 0 && trip.status === 'In Transit'
      ? <SwipeButton label="Go to Debrief" onConfirm={onDebrief} />
      : <Btn className="w-full" onClick={onBack}>Back to trip</Btn>
  }

  return (
    <Screen header={header} footer={footer} bodyClass="px-4 pb-4">
      <Card className="mt-4">
        <div className="flex items-start gap-2">
          <MapPin size={16} className="mt-0.5 shrink-0 text-[#8A97AB]" />
          <div className="min-w-0 flex-1">
            <div className="text-[15px] font-bold text-[#1B2A41]">{party.place}</div>
            <div className="text-[13px] leading-snug text-[#5B6B82]">{party.address}</div>
            <div className="mt-1 text-[13px] text-[#5B6B82]">{party.contact}{party.phone ? ` · +63 ${party.phone}` : ''}</div>
          </div>
          <IconBtn label="Navigate" tone="soft" onClick={() => phoneToast('Navigation opens the maps app (mock)')}><Navigation2 size={16} /></IconBtn>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          <Chip tone="grey">{pr.slot}</Chip>
          {reserved && <Chip tone="amber">Reserved · count on arrival</Chip>}
          {pr.attempt > 1 && <Chip tone="amber">Attempt {pr.attempt} of {pr.maxAttempts}</Chip>}
          <Chip tone="blue">Scan: {mode === 'both' ? 'driver + hub' : mode}</Chip>
        </div>
        {pr.instructions && <div className="mt-3 rounded-lg bg-[#FDF3DC] px-3 py-2 text-[13px] text-[#94620F]">{pr.instructions}</div>}
      </Card>

      {!running && open && (
        <div className="mt-3 rounded-xl bg-[#E6EFF9] px-3 py-2.5 text-[13px] text-[#2F6FB5]">
          {trip.status === 'Yet to start' ? 'Start the trip before arriving at this stop.' : 'This trip is no longer running.'}
        </div>
      )}

      {!open && <OutcomeCard prId={pr.id} work={w} />}

      {open && arrived && (
        <>
          <Card className="mt-3">
            {countOnly ? (
              <>
                <div className="text-[17px] font-bold text-[#1B2A41]">Count only — the hub confirms</div>
                <div className="mt-1 text-[13px] text-[#5B6B82]">
                  Hand over {booked.length} parcel{booked.length === 1 ? '' : 's'}. No scan here — the hub in-scan records each one.
                </div>
              </>
            ) : reserved ? (
              <>
                <div className="text-[13px] text-[#5B6B82]">Reserved pickup — no consignments booked yet</div>
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-[15px] font-bold text-[#1B2A41]">Pieces collected</span>
                  <span className="flex items-center gap-3">
                    <IconBtn label="Fewer" tone="soft" onClick={() => setWork((x) => ({ ...x, pieces: Math.max(0, x.pieces - 1) }))}><Minus size={16} /></IconBtn>
                    <span className="w-8 text-center text-[24px] font-bold text-[#1B2A41]">{w.pieces}</span>
                    <IconBtn label="More" tone="soft" onClick={() => setWork((x) => ({ ...x, pieces: x.pieces + 1 }))}><Plus size={16} /></IconBtn>
                  </span>
                </div>
                {pr.expectedPieces != null && <div className="mt-1 text-[12px] text-[#8A97AB]">Merchant estimated {pr.expectedPieces}</div>}
              </>
            ) : (
              <>
                <div className="flex items-baseline justify-between">
                  <span className="text-[17px] font-bold text-[#1B2A41]">{counted} of {expected} picked</span>
                  {notPicked.length > 0 && <span className="text-[13px] text-[#B42323]">{notPicked.length} not picked</span>}
                </div>
                <div className="mt-2"><ProgressBar value={counted} max={expected || 1} tone="green" /></div>
              </>
            )}
            {!countOnly && (
              <Btn tone="outline" className="mt-3 w-full" icon={<ScanLine size={18} />} onClick={() => setSheet({ kind: 'scan' })}>Scan</Btn>
            )}
          </Card>

          {!reserved && (
            <>
              <SectionLabel>Expected ({booked.length})</SectionLabel>
              <Card pad="none">
                {booked.map((id, i) => {
                  const o = orderById(id)
                  if (countOnly) {
                    return (
                      <div key={id} className={`flex w-full items-center gap-3 px-4 py-3 ${i ? 'border-t border-[#EEF1F5]' : ''}`}>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[15px] font-bold text-[#1B2A41]">{o?.orderNumber ?? id}</div>
                          <div className="truncate text-[13px] text-[#5B6B82]">{o?.receiver.name || '—'} · {(o?.pkg.weightKg ?? 0).toFixed(1)} kg</div>
                        </div>
                        <Chip tone="grey">Hub confirms</Chip>
                      </div>
                    )
                  }
                  const state = w.scanned.includes(id) ? 'Picked' : w.notPicked[id] ? 'Not picked' : 'To pick'
                  return (
                    <button key={id} type="button" onClick={() => setSheet({ kind: 'notPicked', orderId: id })}
                      className={`flex w-full items-center gap-3 px-4 py-3 text-left ${i ? 'border-t border-[#EEF1F5]' : ''}`}>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[15px] font-bold text-[#1B2A41]">{o?.orderNumber ?? id}</div>
                        <div className="truncate text-[13px] text-[#5B6B82]">
                          {o?.receiver.name || '—'} · {(o?.pkg.weightKg ?? 0).toFixed(1)} kg
                          {state === 'Not picked' && ` · ${reasonLabel(PICKABLE_FAILURE_REASONS, w.notPicked[id])}`}
                        </div>
                      </div>
                      <Chip tone={state === 'Picked' ? 'green' : state === 'Not picked' ? 'red' : 'grey'}
                        icon={state === 'Picked' ? <Check size={12} strokeWidth={3} /> : undefined}>{state}</Chip>
                    </button>
                  )
                })}
              </Card>
            </>
          )}

          {(extras.length > 0 || (reserved && w.scanned.length > 0)) && (
            <>
              <SectionLabel>{reserved ? 'Scanned' : 'Extra (booked elsewhere)'}</SectionLabel>
              <Card pad="none">
                {(reserved ? w.scanned : extras).map((id, i) => {
                  const o = orderById(id)
                  const other = pickupRequestById(o?.pickupRequestId ?? null)
                  return (
                    <div key={id} className={`flex items-center gap-3 px-4 py-3 ${i ? 'border-t border-[#EEF1F5]' : ''}`}>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[15px] font-bold text-[#1B2A41]">{orderLabel(id)}</div>
                        <div className="text-[13px] text-[#5B6B82]">{other && other.id !== pr.id ? `Booked on ${other.number}` : 'Not on a pickup'}</div>
                      </div>
                      <IconBtn label="Remove scan" onClick={() => setWork((x) => ({ ...x, scanned: x.scanned.filter((s) => s !== id) }))}><X size={16} /></IconBtn>
                    </div>
                  )
                })}
              </Card>
            </>
          )}

          {w.overages.length > 0 && (
            <>
              <SectionLabel>Not on this pickup ({w.overages.length})</SectionLabel>
              <Card pad="none">
                {w.overages.map((v, i) => (
                  <div key={v.id} className={`flex items-center gap-3 px-4 py-3 ${i ? 'border-t border-[#EEF1F5]' : ''}`}>
                    <PackagePlus size={18} className="shrink-0 text-[#94620F]" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[15px] font-bold text-[#1B2A41]">{v.barcode}</div>
                      <div className="text-[13px] text-[#5B6B82]">{ACTION_LABEL[v.action]}{v.weightKg != null ? ` · ${v.weightKg} kg` : ''}</div>
                    </div>
                    <IconBtn label="Remove" onClick={() => setWork((x) => ({ ...x, overages: x.overages.filter((o) => o.id !== v.id) }))}><X size={16} /></IconBtn>
                  </div>
                ))}
              </Card>
            </>
          )}

          {(pod.signature !== 'off' || pod.photo !== 'off' || pod.otp) && (
            <>
              <SectionLabel>Proof of pickup</SectionLabel>
              <div className="grid grid-cols-2 gap-3">
                {pod.signature !== 'off' && (
                  <button type="button" onClick={() => setWork((x) => ({ ...x, signed: !x.signed }))}
                    className={`flex h-28 flex-col items-center justify-center rounded-2xl border-2 border-dashed bg-white
                      ${w.signed ? 'border-[#1F9D55]' : 'border-[#C3CCD8]'}`}>
                    {w.signed ? (
                      <svg viewBox="0 0 120 40" className="h-10 w-28" aria-label="Signature captured">
                        <path d="M5 30 C 15 5, 25 5, 28 25 S 40 38, 48 18 S 62 8, 66 26 S 80 34, 88 14 S 104 20, 115 22"
                          fill="none" stroke="#1B2A41" strokeWidth="2.2" strokeLinecap="round" />
                      </svg>
                    ) : <PenLine size={22} className="text-[#8A97AB]" />}
                    <span className="mt-1 text-[13px] font-bold text-[#1B2A41]">{w.signed ? 'Signed' : 'Tap to sign'}</span>
                    <span className="text-[11px] text-[#8A97AB]">Signature · {pod.signature}</span>
                  </button>
                )}
                {pod.photo !== 'off' && (
                  <button type="button" onClick={() => setWork((x) => ({ ...x, photo: !x.photo }))}
                    className={`flex h-28 flex-col items-center justify-center rounded-2xl border-2 border-dashed
                      ${w.photo ? 'border-[#1F9D55] bg-[#E9EDF2]' : 'border-[#C3CCD8] bg-white'}`}>
                    {w.photo ? <Check size={22} className="text-[#1F9D55]" /> : <Camera size={22} className="text-[#8A97AB]" />}
                    <span className="mt-1 text-[13px] font-bold text-[#1B2A41]">{w.photo ? 'Photo added' : 'Add photo'}</span>
                    <span className="text-[11px] text-[#8A97AB]">Photo · {pod.photo}</span>
                  </button>
                )}
              </div>
              {pod.otp && (
                <label className="mt-3 block">
                  <span className="text-[13px] font-bold text-[#5B6B82]">Merchant OTP (any 4 digits in the prototype)</span>
                  <input inputMode="numeric" maxLength={6} value={w.otp}
                    onChange={(e) => { const v = e.target.value.replace(/\D/g, ''); setWork((x) => ({ ...x, otp: v })) }}
                    className="mt-1.5 h-12 w-full rounded-xl border border-[#D5DBE4] bg-white px-3 text-[17px] tracking-[0.4em] text-[#1B2A41] outline-none focus:border-[#D9542B]" />
                </label>
              )}
            </>
          )}
        </>
      )}

      {/* ------------------------------------------------------ sheets ---- */}
      {sheet?.kind === 'scan' && (
        <Sheet title="Scan" onClose={closeSheet}>
          <div className="relative flex h-44 items-center justify-center overflow-hidden rounded-2xl bg-[#11161F]">
            {['left-3 top-3 border-l-4 border-t-4', 'right-3 top-3 border-r-4 border-t-4', 'bottom-3 left-3 border-b-4 border-l-4', 'bottom-3 right-3 border-b-4 border-r-4'].map((c) => (
              <span key={c} className={`absolute h-7 w-7 rounded-sm border-white/80 ${c}`} />
            ))}
            <span className="absolute inset-x-8 top-1/2 h-0.5 animate-pulse bg-[#D9542B]" />
            <span className="text-[13px] text-white/60">Camera preview (mock)</span>
          </div>
          <div className="mt-3 text-[13px] font-bold text-[#5B6B82]">Simulate a label under the camera</div>
          <div className="mt-2 flex flex-wrap gap-2">
            {booked.filter((i) => !w.scanned.includes(i)).map((id) => {
              const o = orderById(id)
              const code = o?.trackingNumber || o?.orderNumber || id
              return (
                <button key={id} type="button" onClick={() => handleCode(code)}
                  className="rounded-lg border border-[#D5DBE4] px-2.5 py-1.5 text-[13px] font-bold text-[#1B2A41] hover:border-[#D9542B]">{code}</button>
              )
            })}
            <button type="button" onClick={() => handleCode(`2GO-OV-${String(Date.now()).slice(-5)}`)}
              className="rounded-lg border border-dashed border-[#E6A100] px-2.5 py-1.5 text-[13px] font-bold text-[#94620F]">Unknown label</button>
          </div>
          <div className="mt-4 flex items-center gap-2 text-[13px] font-bold text-[#5B6B82]"><Keyboard size={15} /> Manual entry</div>
          <form className="mt-1.5 flex gap-2" onSubmit={(e) => { e.preventDefault(); handleCode(manual) }}>
            <input autoFocus value={manual} onChange={(e) => setManual(e.target.value)} placeholder="Order or tracking number"
              className="h-12 min-w-0 flex-1 rounded-xl border border-[#D5DBE4] px-3 text-[15px] text-[#1B2A41] outline-none focus:border-[#D9542B]" />
            <Btn onClick={() => handleCode(manual)} disabled={!manual.trim()}>Add</Btn>
          </form>
          <div className="mt-3 text-[13px] text-[#5B6B82]">{counted} of {expected} {reserved ? 'counted' : 'picked'}{w.overages.length ? ` · ${w.overages.length} not on this pickup` : ''}</div>
        </Sheet>
      )}

      {sheet?.kind === 'overage' && (
        <Sheet title="Not on this pickup" onClose={closeSheet}>
          <div className="flex items-center gap-3 rounded-xl bg-[#FDF3DC] px-3 py-3">
            <CircleAlert size={20} className="shrink-0 text-[#94620F]" />
            <div className="min-w-0">
              <div className="truncate text-[15px] font-bold text-[#1B2A41]">{sheet.barcode}</div>
              <div className="text-[13px] text-[#94620F]">No consignment in the system has this label.</div>
            </div>
          </div>
          <div className="mt-3 text-[13px] text-[#5B6B82]">
            Account policy: <b className="text-[#1B2A41]">{cfg.overagePolicy === 'hold' ? 'Hold for ops' : cfg.overagePolicy === 'auto-create' ? 'Auto-create consignment' : 'Reject extras'}</b>
          </div>
          {allowed.some((a) => a !== 'reject') && (
            <div className="mt-3 grid grid-cols-2 gap-2">
              <input value={ovWeight} onChange={(e) => setOvWeight(e.target.value)} inputMode="decimal" placeholder="Weight (kg)"
                className="h-11 rounded-xl border border-[#D5DBE4] px-3 text-[15px] outline-none focus:border-[#D9542B]" />
              <input value={ovNote} onChange={(e) => setOvNote(e.target.value)} placeholder="Note (optional)"
                className="h-11 rounded-xl border border-[#D5DBE4] px-3 text-[15px] outline-none focus:border-[#D9542B]" />
            </div>
          )}
          <div className="mt-4 flex flex-col gap-2">
            {allowed.includes('hold') && <Btn onClick={() => addOverage('hold', sheet.barcode)}>Hold — take it, ops decides</Btn>}
            {allowed.includes('create') && <Btn onClick={() => addOverage('create', sheet.barcode)}>Add details — create consignment</Btn>}
            <Btn tone="danger" icon={<PackageX size={18} />} onClick={() => addOverage('reject', sheet.barcode)}>Reject — leave it behind</Btn>
          </div>
        </Sheet>
      )}

      {sheet?.kind === 'notPicked' && (() => {
        const id = sheet.orderId
        const isPicked = w.scanned.includes(id)
        return (
          <Sheet title={`${orderLabel(id)} · Not picked`} onClose={closeSheet}
            footer={<div className="flex flex-col gap-2">
              <Btn className="w-full" disabled={!reason} onClick={() => {
                setWork((x) => ({ ...x, scanned: x.scanned.filter((s) => s !== id), notPicked: { ...x.notPicked, [id]: reason } }))
                closeSheet()
              }}>Mark not picked</Btn>
              {(isPicked || w.notPicked[id]) && (
                <Btn tone="ghost" className="w-full" onClick={() => {
                  setWork((x) => { const np = { ...x.notPicked }; delete np[id]; return { ...x, notPicked: np, scanned: x.scanned.filter((s) => s !== id) } })
                  closeSheet()
                }}>Reset to “To pick”</Btn>
              )}
            </div>}>
            <div className="mb-3 text-[13px] text-[#5B6B82]">Why is this parcel not being handed over? It goes back to the merchant's Ready for Pickup list.</div>
            <ReasonList options={MERCHANT_SIDE_REASONS} value={reason || w.notPicked[id] || ''} onChange={setReason} />
          </Sheet>
        )
      })()}

      {sheet?.kind === 'unable' && (
        <Sheet title="Unable to pick up" onClose={closeSheet}
          footer={<Btn className="w-full" disabled={!reason} onClick={doFail}>Fail pickup</Btn>}>
          <div className="mb-3 text-[13px] text-[#5B6B82]">The whole request fails; its consignments return to the merchant. A re-attempt is raised if attempts remain ({pr.attempt} of {pr.maxAttempts}).</div>
          <div className="mb-1.5 text-[12px] font-bold uppercase tracking-wide text-[#8A97AB]">Merchant side</div>
          <ReasonList options={PICKABLE_FAILURE_REASONS.filter((r) => !CARRIER_SIDE.has(r.code))} value={reason} onChange={setReason} />
          <div className="mb-1.5 mt-4 text-[12px] font-bold uppercase tracking-wide text-[#8A97AB]">Carrier side</div>
          <ReasonList options={PICKABLE_FAILURE_REASONS.filter((r) => CARRIER_SIDE.has(r.code))} value={reason} onChange={setReason} />
        </Sheet>
      )}

      {sheet?.kind === 'confirm' && (
        <Sheet title="Complete with parcels left?" onClose={closeSheet}
          footer={<div className="grid grid-cols-2 gap-3">
            <Btn tone="secondary" onClick={closeSheet}>Keep scanning</Btn>
            <Btn onClick={doComplete}>Complete</Btn>
          </div>}>
          <div className="text-[15px] text-[#1B2A41]">
            {mode === 'hub'
              ? `${toPick.length} parcel${toPick.length === 1 ? '' : 's'} not scanned here. The hub's in-scan will record them.`
              : `${toPick.length} parcel${toPick.length === 1 ? '' : 's'} still “To pick” will be marked Not picked and returned to the merchant.`}
          </div>
          <ul className="mt-3 flex flex-col gap-1 text-[13px] text-[#5B6B82]">
            {toPick.map((id) => <li key={id}>• {orderLabel(id)}</li>)}
          </ul>
        </Sheet>
      )}

      {sheet?.kind === 'outcome' && (
        <Sheet title="Pickup outcome" onClose={closeSheet}
          footer={remainingAfter === 0
            ? <SwipeButton label="Go to Debrief" onConfirm={onDebrief} />
            : <Btn className="w-full" onClick={onBack}>Next stop ({remainingAfter} left)</Btn>}>
          <OutcomeCard prId={pr.id} work={w} bare />
        </Sheet>
      )}
    </Screen>
  )
}

/** What the request ended as — read back from the store, not from the local scans. */
function OutcomeCard({ prId, work, bare }: { prId: string; work: PickupWork; bare?: boolean }) {
  const pr = pickupRequestById(prId)
  if (!pr) return null
  const failed = pr.status === 'Pickup Failed' || pr.status === 'Cancelled'
  const notPicked = pr.orderIds.filter((i) => !pr.pickedOrderIds.includes(i))
  const partial = pr.status === 'Completed' && notPicked.length > 0
  const body = (
    <>
      <div className="flex items-center gap-2">
        <Chip tone={failed ? 'red' : partial ? 'amber' : 'green'}>
          {failed ? pr.status : partial ? 'Partially picked' : 'Completed'}
        </Chip>
        <span className="text-[13px] text-[#5B6B82]">{pr.number}</span>
      </div>
      {failed ? (
        <div className="mt-2 text-[15px] text-[#1B2A41]">
          {failureReasonLabel(pr.failureReason) || pr.cancelReason || 'Pickup did not happen'}
          {pr.reattemptPrId && <div className="mt-1 text-[13px] text-[#5B6B82]">Re-attempt raised: {pickupRequestById(pr.reattemptPrId)?.number}</div>}
        </div>
      ) : (
        <>
          <div className="mt-2 text-[17px] font-bold text-[#1B2A41]">
            {pr.pickedOrderIds.length} picked{pr.orderIds.length ? ` of ${pr.orderIds.length} booked` : ''}
            {pr.overages.length ? ` · ${pr.overages.length} overage${pr.overages.length === 1 ? '' : 's'}` : ''}
          </div>
          {notPicked.length > 0 && (
            <div className="mt-2">
              <div className="text-[12px] font-bold uppercase tracking-wide text-[#8A97AB]">Not picked</div>
              <ul className="mt-1 flex flex-col gap-1 text-[13px] text-[#1B2A41]">
                {notPicked.map((id) => (
                  <li key={id}>{orderLabel(id)} <span className="text-[#5B6B82]">— {(pr.notPickedReasons[id] ?? work.notPicked[id]) ? reasonLabel(PICKABLE_FAILURE_REASONS, pr.notPickedReasons[id] ?? work.notPicked[id]) : pr.handover.mode === 'hub' ? 'awaiting hub in-scan' : 'not handed over'}</span></li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </>
  )
  return bare ? body : <Card className="mt-3">{body}</Card>
}
