/**
 * Inbound Shipments — count-based inbound popup (scannable = false), matched 1:1
 * to the FarEye staging "Inbound Shipments" modal (screenshot 2026-09-15):
 * peach-highlighted package, quantity dropdown, reduced → Short/Pending radios in a
 * tinted box, a "Mark Damage" checkbox, optional Note + Image, orange pill actions.
 *
 * Ticket enhancement (Part A): when Mark Damage is checked, classify the damaged
 * units by severity — Fit for Operations (soft · still delivers) vs Not Fit for
 * Operations (permanent · RTO), split by count, mandatory, no default. Soft damage
 * is non-blocking in routing.
 *
 * Built from FarEye Nueva tokens/primitives (Select, Checkbox) + brand pill buttons.
 */
import { useState } from 'react'
import { X, Plus, ScanLine } from 'lucide-react'
import { Select, Checkbox } from '../../nueva/components'
import { toast } from '../../nueva/toast'

const pad2 = (n: number) => String(n).padStart(2, '0')
const range = (n: number) => Array.from({ length: n + 1 }, (_, i) => String(i))

/* radio matching the staging popup (orange ring + dot when selected) */
function Radio({ checked, label, onChange }: { checked: boolean; label: string; onChange: () => void }) {
  return (
    <label onClick={onChange} className="inline-flex cursor-pointer items-center gap-2 select-none">
      <span className={`flex h-4 w-4 items-center justify-center rounded-full border-2 ${checked ? 'border-brand-500' : 'border-warm-400'}`}>
        {checked && <span className="h-2 w-2 rounded-full bg-brand-500" />}
      </span>
      <span className="text-[13px] text-ink">{label}</span>
    </label>
  )
}

export default function InboundDamage() {
  const EXPECTED = 100
  const [open, setOpen] = useState(true)
  const [qty, setQty] = useState('95')
  const [reducedAs, setReducedAs] = useState<string | null>(null)   // no default (ticket rule)
  const [markDamage, setMarkDamage] = useState(false)
  const [soft, setSoft] = useState(0)
  const [hard, setHard] = useState(0)
  const [note, setNote] = useState('')
  const [image, setImage] = useState<string | null>(null)

  const received = parseInt(qty || '0', 10)
  const reduced = Math.max(0, EXPECTED - received)
  const damaged = soft + hard
  const overAllocated = damaged > received

  const needReduced = reduced > 0 && reducedAs === null
  const needDamage = markDamage && damaged === 0
  const valid = !needReduced && !needDamage && !overAllocated

  const setQuantity = (v: string) => {
    setQty(v); const r = parseInt(v || '0', 10)
    if (EXPECTED - r <= 0) setReducedAs(null)
    if (soft + hard > r) { setSoft(0); setHard(0) }
  }
  const toggleDamage = (v: boolean) => { setMarkDamage(v); if (!v) { setSoft(0); setHard(0) } }
  const confirm = () => {
    const bits = [`Inbound ${received}/${EXPECTED}`]
    if (reduced > 0) bits.push(`${reduced} ${reducedAs === 'SHORT' ? 'short' : 'pending arrival'}`)
    if (markDamage) bits.push(`${soft} soft (delivers) · ${hard} to RTO`)
    toast.success(bits.join(' · '))
    setOpen(false)
  }

  return (
    <div className="px-6 py-5">
      {/* scanner backdrop (context) */}
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-[20px] font-bold text-ink">Scan to Inbound</h1>
        <button className="rounded-md border border-warm-300 px-3 py-1.5 text-[13px] font-semibold text-ink-2 hover:bg-warm-50">View Summary</button>
      </div>
      <div className="flex h-40 items-center justify-center gap-2 rounded-xl border border-dashed border-warm-300 bg-warm-25 text-[15px] text-ink-3">
        <ScanLine size={18} /> Scan to start inbound
      </div>
      {!open && (
        <button onClick={() => setOpen(true)} className="mt-4 rounded-full bg-brand-500 px-5 py-2 text-[14px] font-bold text-white hover:bg-brand-600">
          Open Inbound Shipments
        </button>
      )}

      {/* ---------------- modal ---------------- */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-warm-900/40 px-4">
          <div className="flex max-h-[90vh] w-full max-w-xl flex-col rounded-2xl bg-surface shadow-ds-overlay">
            {/* header */}
            <div className="flex items-center justify-between border-b border-line px-6 pt-5 pb-3">
              <h3 className="text-[18px] font-bold text-ink">Inbound Shipments</h3>
              <button onClick={() => setOpen(false)} className="text-ink-3 hover:text-ink"><X size={18} /></button>
            </div>

            {/* body */}
            <div className="space-y-4 overflow-y-auto px-6 py-5">
              <div>
                <span className="inline-block rounded bg-brand-50 px-2 py-1 text-[16px] font-bold text-ink">PKG740401</span>
              </div>

              {/* quantity dropdown */}
              <div>
                <label className="mb-1.5 block text-[13px] font-semibold text-ink">Select quantity to inbound <span className="text-brand-500">*</span></label>
                <Select size="lg" value={qty} options={range(EXPECTED)} onChange={setQuantity} />
              </div>

              {/* reduced classification — tinted box, radios, no default */}
              {reduced > 0 && (
                <div className="rounded-lg bg-brand-50 px-4 py-3">
                  <div className="mb-2 text-[13px] font-bold text-ink">Mark reduced ({pad2(reduced)}) shipment as <span className="text-brand-500">*</span></div>
                  <div className="flex items-center gap-10">
                    <Radio checked={reducedAs === 'SHORT'} label="Short" onChange={() => setReducedAs('SHORT')} />
                    <Radio checked={reducedAs === 'PENDING'} label="Pending Arrival" onChange={() => setReducedAs('PENDING')} />
                  </div>
                  {needReduced && <div className="mt-2 text-[12px] font-semibold text-danger-fg">Required</div>}
                </div>
              )}

              {/* mark damage checkbox */}
              <Checkbox checked={markDamage} onChange={toggleDamage}
                label={<span className="text-[13px] font-semibold text-ink">Mark Damage</span>} />

              {/* damage severity classification — revealed on Mark Damage (Part A) */}
              {markDamage && (
                <div className="rounded-lg border border-line px-4 py-3.5">
                  <div className="text-[13px] font-semibold text-ink">Classify damaged units <span className="text-brand-500">*</span></div>
                  <p className="mt-0.5 text-[12px] leading-relaxed text-ink-3">Split the damaged quantity by whether it can still go out for delivery.</p>

                  <div className="mt-3 flex items-center justify-between gap-4">
                    <div>
                      <div className="text-[13px] text-ink">Fit for operations</div>
                      <div className="text-[12px] leading-relaxed text-ink-3">Soft damage — the unit can still be delivered.</div>
                    </div>
                    <div className="w-20 shrink-0"><Select value={String(soft)} options={range(received - hard)} onChange={(v) => setSoft(parseInt(v, 10))} /></div>
                  </div>

                  <div className="mt-3 flex items-center justify-between gap-4">
                    <div>
                      <div className="text-[13px] text-ink">Not fit for operations</div>
                      <div className="text-[12px] leading-relaxed text-ink-3">Permanent damage — it goes back to origin (RTO).</div>
                    </div>
                    <div className="w-20 shrink-0"><Select value={String(hard)} options={range(received - soft)} onChange={(v) => setHard(parseInt(v, 10))} /></div>
                  </div>

                  <div className="mt-3 border-t border-line pt-2.5 text-[12px] leading-relaxed text-ink-3">
                    {needDamage
                      ? <span className="font-semibold text-danger-fg">Enter how many units are damaged.</span>
                      : <>{damaged} of {received} units damaged — the fit-for-operations ones still route.</>}
                  </div>
                </div>
              )}

              {/* note (optional) */}
              <div>
                <label className="mb-1.5 block text-[13px] font-semibold text-ink">Add Note (Optional)</label>
                <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add Note"
                  className="h-11 w-full rounded-lg border border-warm-300 bg-surface px-3 text-[14px] text-ink placeholder:text-warm-400 outline-none focus:border-brand-500" />
              </div>

              {/* image (optional) */}
              <div>
                <label className="mb-1.5 block text-[13px] font-semibold text-ink">Add Image (Optional)</label>
                {image ? (
                  <div className="inline-flex items-center gap-2 rounded-lg border border-warm-300 bg-surface px-3 py-2 text-[13px] text-ink">
                    📷 {image}
                    <button onClick={() => setImage(null)} className="text-ink-3 hover:text-ink"><X size={14} /></button>
                  </div>
                ) : (
                  <label className="flex h-24 w-24 cursor-pointer items-center justify-center rounded-lg border border-dashed border-warm-300 bg-warm-25 text-warm-400 hover:bg-warm-50">
                    <Plus size={26} />
                    <input type="file" accept="image/*" className="hidden" onChange={(e) => setImage(e.target.files?.[0]?.name ?? 'damage.jpg')} />
                  </label>
                )}
              </div>
            </div>

            {/* footer — orange pills */}
            <div className="flex items-center justify-end gap-3 border-t border-line px-6 py-4">
              <button onClick={() => setOpen(false)}
                className="rounded-full border border-brand-500 px-6 py-2 text-[14px] font-bold text-brand-500 hover:bg-brand-50">Cancel</button>
              <button onClick={confirm} disabled={!valid}
                className="rounded-full bg-brand-500 px-6 py-2 text-[14px] font-bold text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50">Confirm</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
