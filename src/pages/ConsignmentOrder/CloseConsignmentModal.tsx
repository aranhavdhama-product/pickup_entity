import { useEffect, useMemo, useRef, useState } from 'react'
import { Eye, FileText, Plus, Trash2, X } from 'lucide-react'
import { Button, Field, Modal } from '../../nueva/components'
import type { ConsignmentAttachment, ConsignmentShipment } from '../../data/mockData'
import { MAX_FILES, formatSize, validateAttachment } from './validateAttachment'

export type ClosureMode = 'completed' | 'failed' | 'partial'

export interface ClosurePayload {
  mode: ClosureMode
  atc?: string
  atd?: string
  failureReason?: string
  shipmentOutcomes?: Record<string, 'Completed' | 'Failed'>
  attachments: ConsignmentAttachment[]
}

interface Pending {
  id: string
  file: File
  kind: 'image' | 'pdf'
  url: string
}

const MODES: { key: ClosureMode; label: string }[] = [
  { key: 'completed', label: 'Mark Completed' },
  { key: 'failed', label: 'Mark Failed' },
  { key: 'partial', label: 'Completed Partially' },
]

function stamp() {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

export default function CloseConsignmentModal({ shipments, onClose, onConfirm }: {
  shipments: ConsignmentShipment[]
  onClose: () => void
  onConfirm: (payload: ClosurePayload) => void
}) {
  const [mode, setMode] = useState<ClosureMode>('completed')
  const [atc, setAtc] = useState('')
  const [atd, setAtd] = useState('')
  const [failureReason, setFailureReason] = useState('')
  const [outcomes, setOutcomes] = useState<Record<string, 'Completed' | 'Failed'>>({})
  const [pending, setPending] = useState<Pending[]>([])
  const [errors, setErrors] = useState<string[]>([])
  const [lightbox, setLightbox] = useState<Pending | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const pendingRef = useRef<Pending[]>([])
  useEffect(() => { pendingRef.current = pending }, [pending])
  useEffect(() => () => pendingRef.current.forEach((p) => URL.revokeObjectURL(p.url)), [])

  const pick = async (list: File[]) => {
    if (list.length === 0) return
    const working = pending.map((p) => p.file)
    const accepted: Pending[] = []
    const rejected: string[] = []
    for (const file of list) {
      const result = await validateAttachment(file, working)
      if (result.ok) {
        working.push(file)
        accepted.push({ id: `${file.name}-${file.size}-${Date.now()}-${accepted.length}`, file, kind: result.kind, url: URL.createObjectURL(file) })
      } else {
        rejected.push(`${file.name} — ${result.message}`)
      }
    }
    if (accepted.length) setPending((p) => [...p, ...accepted])
    setErrors(rejected)
  }

  const remove = (id: string) => {
    setPending((p) => {
      const hit = p.find((x) => x.id === id)
      if (hit) URL.revokeObjectURL(hit.url)
      return p.filter((x) => x.id !== id)
    })
    setLightbox((l) => (l && l.id === id ? null : l))
    setErrors([])
  }

  const preview = (p: Pending) => {
    if (p.kind === 'image') setLightbox(p)
    else window.open(p.url, '_blank')
  }

  const ready = useMemo(() => {
    if (errors.length) return false
    if (mode === 'completed') return !!atc
    if (mode === 'failed') return failureReason.trim().length > 0
    return !!atd && shipments.every((s) => outcomes[s.id])
  }, [errors.length, mode, atc, failureReason, atd, shipments, outcomes])

  const confirm = () => {
    const attachments: ConsignmentAttachment[] = pending.map((p) => ({
      id: p.id,
      name: p.file.name,
      kind: p.kind,
      sizeKb: Math.round((p.file.size / 1024) * 10) / 10,
      uploadedAt: stamp(),
      uploadedBy: 'aranhav.dhama@fareye.com',
      dataUrl: URL.createObjectURL(p.file),
    }))
    onConfirm({
      mode,
      atc: mode === 'completed' ? atc : undefined,
      atd: mode === 'partial' ? atd : undefined,
      failureReason: mode === 'failed' ? failureReason.trim() : undefined,
      shipmentOutcomes: mode === 'partial' ? outcomes : undefined,
      attachments,
    })
  }

  return (
    <Modal
      title="Close Consignment"
      open
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={confirm} disabled={!ready}>Confirm</Button>
        </>
      }
    >
      <p className="text-[13px] text-ink-3 -mt-1 mb-4">
        Mark the final delivery status and add the required information to close the consignment
      </p>

      <div className="grid grid-cols-3 gap-3">
        {MODES.map((m) => {
          const on = mode === m.key
          return (
            <button key={m.key} type="button" onClick={() => setMode(m.key)}
              className={`flex items-center gap-2.5 rounded-md border px-3.5 py-3 text-left transition-colors
                ${on ? 'border-brand-500 bg-brand-50' : 'border-warm-300 bg-surface hover:bg-warm-50'}`}>
              <span className={`h-4 w-4 shrink-0 rounded-full border flex items-center justify-center
                ${on ? 'border-brand-500' : 'border-warm-400'}`}>
                {on && <span className="h-2 w-2 rounded-full bg-brand-500" />}
              </span>
              <span className={`text-[14px] font-bold ${on ? 'text-brand-500' : 'text-ink'}`}>{m.label}</span>
            </button>
          )
        })}
      </div>

      <div className="mt-5">
        {mode === 'completed' && (
          <div className="max-w-xs">
            <Field label="ATC (Completion)" required plain>
              <input type="datetime-local" value={atc} onChange={(e) => setAtc(e.target.value)}
                className="h-8 w-full rounded-md border border-warm-300 bg-surface px-3 text-[13px] text-ink focus:border-brand-500 focus:ring-[3px] focus:ring-brand-500/20 transition-shadow" />
            </Field>
          </div>
        )}

        {mode === 'failed' && (
          <Field label="Failure Reason" required plain>
            <textarea value={failureReason} onChange={(e) => setFailureReason(e.target.value)}
              placeholder="Add Failure Reason..." rows={4}
              className="w-full rounded-md border border-warm-300 bg-surface px-3 py-2 text-[13px] text-ink placeholder:text-warm-400 focus:border-brand-500 focus:ring-[3px] focus:ring-brand-500/20 transition-shadow" />
          </Field>
        )}

        {mode === 'partial' && (
          <>
            <div className="max-w-xs">
              <Field label="ATD (Delivery)" required plain>
                <input type="datetime-local" value={atd} onChange={(e) => setAtd(e.target.value)}
                  className="h-8 w-full rounded-md border border-warm-300 bg-surface px-3 text-[13px] text-ink focus:border-brand-500 focus:ring-[3px] focus:ring-brand-500/20 transition-shadow" />
              </Field>
            </div>
            <div className="mt-5 border-t border-line pt-4">
              <p className="text-[14px] font-bold text-ink">Shipments: {shipments.length}</p>
              <p className="text-[13px] text-ink-3">Select the outcome for each shipment in the consignment</p>
              <div className="mt-3 divide-y divide-line border border-line rounded-md">
                {shipments.map((s) => (
                  <div key={s.id} className="flex items-center justify-between px-3.5 py-2.5">
                    <span className="font-mono text-[12px] text-ink">{s.trackingNumber}</span>
                    <span className="inline-flex items-center rounded-md border border-warm-300 overflow-hidden">
                      {(['Completed', 'Failed'] as const).map((o) => {
                        const on = outcomes[s.id] === o
                        const tone = o === 'Completed' ? 'bg-success-bg text-success-fg' : 'bg-danger-bg text-danger-fg'
                        return (
                          <button key={o} type="button"
                            onClick={() => setOutcomes((v) => ({ ...v, [s.id]: o }))}
                            className={`h-7 px-3 text-[12px] font-bold transition-colors border-warm-300 first:border-r
                              ${on ? tone : 'bg-surface text-ink-2 hover:bg-warm-50'}`}>
                            {o}
                          </button>
                        )
                      })}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      <div className="mt-5 border-t border-line pt-4 pb-2">
        <p className="flex items-center gap-1 text-[14px] text-ink">Add Attachment</p>
        <p className="text-[12px] text-ink-3 mt-0.5">JPG, PNG or PDF · max 10 MB each · up to {MAX_FILES} files</p>

        <div className="mt-3 flex flex-wrap gap-3">
          {pending.map((p) => (
            <div key={p.id} className="group relative h-[110px] w-[110px] rounded-md border border-dashed border-warm-300 bg-surface overflow-hidden">
              {p.kind === 'image' ? (
                <img src={p.url} alt={p.file.name} className="h-full w-full object-cover" />
              ) : (
                <div className="h-full w-full flex flex-col items-center justify-center px-2 text-center">
                  <span className="h-9 w-9 rounded-md bg-danger-bg text-danger-fg flex items-center justify-center">
                    <FileText size={18} />
                  </span>
                  <span className="mt-1.5 w-full truncate text-[11px] text-ink">{p.file.name}</span>
                  <span className="text-[11px] text-ink-3">{formatSize(p.file.size)}</span>
                </div>
              )}
              <div className="absolute inset-0 hidden group-hover:flex items-center justify-center gap-2 bg-warm-900/50">
                <button type="button" title="Preview" onClick={() => preview(p)}
                  className="h-7 w-7 inline-flex items-center justify-center rounded-md bg-surface text-ink-2 hover:text-ink">
                  <Eye size={14} />
                </button>
                <button type="button" title="Remove" onClick={() => remove(p.id)}
                  className="h-7 w-7 inline-flex items-center justify-center rounded-md bg-surface text-brand-500 hover:bg-brand-50">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}

          {pending.length < MAX_FILES && (
            <button type="button" onClick={() => fileRef.current?.click()}
              className="h-[110px] w-[110px] rounded-md border border-dashed border-warm-300 bg-warm-25 text-ink-3 flex flex-col items-center justify-center gap-1 hover:border-brand-300 hover:text-brand-500 transition-colors">
              <Plus size={20} />
              <span className="text-[12px]">Upload</span>
            </button>
          )}
        </div>

        <input ref={fileRef} type="file" className="hidden" accept="image/jpeg,image/png,application/pdf" multiple
          onChange={(e) => { const files = Array.from(e.target.files ?? []); e.target.value = ''; void pick(files) }} />

        {errors.length > 0 && (
          <div className="mt-3 rounded-md border border-danger-fg/20 bg-danger-bg px-3 py-2">
            <div className="flex items-start justify-between gap-2">
              <ul className="space-y-0.5">
                {errors.map((e) => <li key={e} className="text-[12px] text-danger-fg">{e}</li>)}
              </ul>
              <button type="button" onClick={() => setErrors([])} className="text-danger-fg/70 hover:text-danger-fg">
                <X size={14} />
              </button>
            </div>
          </div>
        )}
      </div>

      {lightbox && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-warm-900/70 p-10" onClick={() => setLightbox(null)}>
          <img src={lightbox.url} alt={lightbox.file.name} className="max-h-full max-w-full rounded-md" onClick={(e) => e.stopPropagation()} />
          <button type="button" onClick={() => setLightbox(null)}
            className="absolute top-5 right-5 h-8 w-8 inline-flex items-center justify-center rounded-md bg-surface text-ink-2 hover:text-ink">
            <X size={16} />
          </button>
        </div>
      )}
    </Modal>
  )
}
