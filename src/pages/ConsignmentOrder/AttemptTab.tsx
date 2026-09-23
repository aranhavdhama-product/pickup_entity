import { useState } from 'react'
import { Download, Eye, FileText, Flag, X } from 'lucide-react'
import { EmptyState, StatusPill } from '../../nueva/components'
import type { ConsignmentAttachment, ConsignmentOrderRow } from '../../data/mockData'
import { toBlobUrl } from './attachmentUrl'

const OUTCOME_TONE = { Completed: 'success', Failed: 'danger', Partial: 'warning' } as const

function sizeLabel(sizeKb: number) {
  return sizeKb >= 1024 ? `${(sizeKb / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(sizeKb))} KB`
}

function openPdf(att: ConsignmentAttachment) {
  if (!att.dataUrl) return
  window.open(att.dataUrl.startsWith('data:') ? toBlobUrl(att.dataUrl) : att.dataUrl, '_blank')
}

export default function AttemptTab({ row }: { row: ConsignmentOrderRow }) {
  const [lightbox, setLightbox] = useState<ConsignmentAttachment | null>(null)

  if (!row.closure) {
    return (
      <EmptyState
        icon={<Flag size={40} />}
        title="No Attempt Details"
        hint="Delivery attempts and proof of delivery appear here once the consignment is executed or closed."
      />
    )
  }

  const { closure } = row
  const images = row.attachments.filter((a) => a.kind === 'image')
  const pdfs = row.attachments.filter((a) => a.kind === 'pdf')
  const fields = [
    { label: 'ATC (Completion)', value: closure.atc?.replace('T', ' ') },
    { label: 'ATD (Delivery)', value: closure.atd?.replace('T', ' ') },
    { label: 'Failure Reason', value: closure.failureReason },
  ].filter((f) => f.value)

  return (
    <div className="space-y-4">
      <div className="border border-line rounded-md overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 bg-warm-25 border-b border-line">
          <div className="flex items-center gap-2.5">
            <span className="text-[14px] font-bold text-ink">Attempt 1</span>
            <StatusPill label={closure.outcome === 'Partial' ? 'Completed Partially' : closure.outcome} tone={OUTCOME_TONE[closure.outcome]} />
          </div>
          <span className="text-[12px] text-ink-3">Manual closure · {row.carrier}</span>
        </div>

        {fields.length > 0 && (
          <div className="divide-y divide-line border-b border-line">
            {fields.map((f) => (
              <div key={f.label} className="flex items-center justify-between px-4 py-2.5">
                <span className="text-[13px] text-ink-3">{f.label}</span>
                <span className="text-[13px] text-ink">{f.value}</span>
              </div>
            ))}
          </div>
        )}

        <div className="px-4 py-3.5">
          <p className="text-[12px] font-bold uppercase tracking-wide text-ink-3">Proof of Delivery</p>

          {row.attachments.length === 0 && (
            <p className="mt-2 text-[13px] text-ink-3">No proof of delivery was added while closing this consignment.</p>
          )}

          {images.length > 0 && (
            <div className="mt-2.5 flex flex-wrap gap-3">
              {images.map((img) => (
                <button
                  key={img.id} type="button" disabled={!img.dataUrl}
                  onClick={() => img.dataUrl && setLightbox(img)}
                  className="group relative h-[96px] w-[96px] rounded-md border border-line overflow-hidden bg-warm-25 disabled:cursor-not-allowed"
                  title={img.name}
                >
                  {img.dataUrl ? (
                    <img src={img.dataUrl} alt={img.name} className="h-full w-full object-cover" />
                  ) : (
                    <span className="h-full w-full flex items-center justify-center text-warm-400 text-[11px]">Unavailable</span>
                  )}
                  <span className="absolute inset-0 hidden group-hover:flex items-center justify-center bg-warm-900/40 text-white">
                    <Eye size={16} />
                  </span>
                </button>
              ))}
            </div>
          )}

          {pdfs.length > 0 && (
            <div className="mt-3 space-y-2">
              {pdfs.map((pdf) => (
                <div key={pdf.id} className="flex items-center gap-3 rounded-md border border-line px-3 py-2">
                  <span className="h-8 w-8 shrink-0 rounded-md bg-danger-bg text-danger-fg flex items-center justify-center">
                    <FileText size={15} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] text-ink">{pdf.name}</p>
                    <p className="text-[12px] text-ink-3">{sizeLabel(pdf.sizeKb)} · {pdf.uploadedAt}</p>
                  </div>
                  <button type="button" title="Preview" disabled={!pdf.dataUrl} onClick={() => openPdf(pdf)}
                    className="h-7 w-7 inline-flex items-center justify-center rounded-md border border-line text-ink-3 hover:bg-warm-100 hover:text-ink disabled:opacity-40 disabled:cursor-not-allowed">
                    <Eye size={13} />
                  </button>
                  {pdf.dataUrl && (
                    <a href={pdf.dataUrl} download={pdf.name} title="Download"
                      className="h-7 w-7 inline-flex items-center justify-center rounded-md border border-line text-ink-3 hover:bg-warm-100 hover:text-ink">
                      <Download size={13} />
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {row.shipments.some((s) => s.outcome) && (
        <div className="border border-line rounded-md overflow-hidden">
          <p className="px-4 py-2.5 text-[12px] font-bold uppercase tracking-wide text-ink-3 bg-warm-25 border-b border-line">
            Shipment Outcomes
          </p>
          <div className="divide-y divide-line">
            {row.shipments.map((s) => (
              <div key={s.id} className="flex items-center justify-between px-4 py-2.5">
                <span className="font-mono text-[12px] text-ink">{s.trackingNumber}</span>
                {s.outcome
                  ? <StatusPill label={s.outcome} tone={s.outcome === 'Completed' ? 'success' : 'danger'} />
                  : <span className="text-[13px] text-ink-3">—</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {lightbox?.dataUrl && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-warm-900/70 p-10" onClick={() => setLightbox(null)}>
          <img src={lightbox.dataUrl} alt={lightbox.name} className="max-h-full max-w-full rounded-md" onClick={(e) => e.stopPropagation()} />
          <button type="button" onClick={() => setLightbox(null)}
            className="absolute top-5 right-5 h-8 w-8 inline-flex items-center justify-center rounded-md bg-surface text-ink-2 hover:text-ink">
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  )
}
