import { useState } from 'react'
import { Download, Eye, FileText, Image as ImageIcon, Paperclip } from 'lucide-react'
import { EmptyState, StatusPill } from '../../nueva/components'
import type { ConsignmentAttachment } from '../../data/mockData'
import { toBlobUrl } from './attachmentUrl'

function sizeLabel(sizeKb: number) {
  return sizeKb >= 1024 ? `${(sizeKb / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(sizeKb))} KB`
}

export default function DocumentsTab({ attachments }: { attachments: ConsignmentAttachment[] }) {
  const [lightbox, setLightbox] = useState<ConsignmentAttachment | null>(null)

  if (attachments.length === 0) {
    return (
      <EmptyState
        icon={<Paperclip size={40} />}
        title="No Documents"
        hint="Proof of delivery images and PDFs added while closing the consignment will appear here"
      />
    )
  }

  const open = (att: ConsignmentAttachment) => {
    if (!att.dataUrl) return
    if (att.kind === 'image') { setLightbox(att); return }
    window.open(att.dataUrl.startsWith('data:') ? toBlobUrl(att.dataUrl) : att.dataUrl, '_blank')
  }

  return (
    <>
      <div className="bg-surface border border-line rounded-md overflow-hidden">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-line bg-thead text-left">
              <th className="w-10 px-4 py-2.5" />
              <th className="px-4 py-2.5 font-bold text-ink">File Name</th>
              <th className="px-4 py-2.5 font-bold text-ink">Type</th>
              <th className="px-4 py-2.5 font-bold text-ink text-right">Size</th>
              <th className="px-4 py-2.5 font-bold text-ink">Uploaded By</th>
              <th className="px-4 py-2.5 font-bold text-ink">Uploaded At</th>
              <th className="px-4 py-2.5 font-bold text-ink">Action</th>
            </tr>
          </thead>
          <tbody>
            {attachments.map((att) => (
              <tr key={att.id} className="border-b border-line last:border-0 hover:bg-warm-50 transition-colors">
                <td className="px-4 py-3">
                  <span className={`h-7 w-7 inline-flex items-center justify-center rounded-md
                    ${att.kind === 'pdf' ? 'bg-danger-bg text-danger-fg' : 'bg-info-bg text-info-fg'}`}>
                    {att.kind === 'pdf' ? <FileText size={14} /> : <ImageIcon size={14} />}
                  </span>
                </td>
                <td className="px-4 py-3 text-ink">{att.name}</td>
                <td className="px-4 py-3">
                  <StatusPill label={att.kind === 'pdf' ? 'PDF' : 'Image'} tone={att.kind === 'pdf' ? 'danger' : 'info'} />
                </td>
                <td className="px-4 py-3 text-ink-2 text-right tabular-nums">{sizeLabel(att.sizeKb)}</td>
                <td className="px-4 py-3 text-ink-2">{att.uploadedBy}</td>
                <td className="px-4 py-3 text-ink-2 tabular-nums">{att.uploadedAt}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1.5">
                    <button type="button" title="Preview" disabled={!att.dataUrl} onClick={() => open(att)}
                      className="h-7 w-7 inline-flex items-center justify-center rounded-md border border-line text-ink-3 hover:bg-warm-100 hover:text-ink disabled:opacity-40 disabled:cursor-not-allowed">
                      <Eye size={13} />
                    </button>
                    {att.dataUrl ? (
                      <a href={att.dataUrl} download={att.name} title="Download"
                        className="h-7 w-7 inline-flex items-center justify-center rounded-md border border-line text-ink-3 hover:bg-warm-100 hover:text-ink">
                        <Download size={13} />
                      </a>
                    ) : (
                      <span className="h-7 w-7 inline-flex items-center justify-center rounded-md border border-line text-warm-400">
                        <Download size={13} />
                      </span>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {lightbox?.dataUrl && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-warm-900/70 p-10" onClick={() => setLightbox(null)}>
          <img src={lightbox.dataUrl} alt={lightbox.name} className="max-h-full max-w-full rounded-md" />
        </div>
      )}
    </>
  )
}
