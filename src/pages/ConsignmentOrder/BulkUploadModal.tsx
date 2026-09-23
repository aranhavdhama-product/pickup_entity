/**
 * Bulk consignment upload — the real pipeline:
 *   template  GET  /ship/app/rest/bulk/sample (214-column xlsx)
 *   upload    POST /ship/app/rest/v3/bulkupload/sync (multipart `file`)
 * Row-level validation errors come back in errors[] and are shown verbatim.
 */
import { useRef, useState } from 'react'
import { Download, FileSpreadsheet, Upload, X, CheckCircle2, AlertTriangle } from 'lucide-react'
import { Button } from '../../nueva/components'
import { toast } from '../../nueva/toast'
import { bulkUploadConsignments, BULK_SAMPLE_URL, type BulkResult } from './api'

export default function BulkUploadModal({ onClose, onUploaded }: {
  onClose: () => void
  onUploaded: () => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<BulkResult | null>(null)

  const upload = async () => {
    if (!file) return
    setBusy(true)
    setResult(null)
    try {
      const r = await bulkUploadConsignments(file)
      setResult(r)
      if (r.successCount > 0) {
        toast.success(`${r.successCount} consignment${r.successCount === 1 ? '' : 's'} created.`)
        onUploaded()
      }
      if (r.failedCount > 0 && r.successCount === 0) toast.error(`${r.failedCount} row(s) failed validation.`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Upload failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div className="fe-nueva w-full max-w-xl rounded-xl bg-surface shadow-ds-overlay" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
          <h3 className="text-[15px] font-bold text-ink">Bulk Upload Consignments</h3>
          <button onClick={onClose} className="h-7 w-7 inline-flex items-center justify-center rounded-md text-warm-400 hover:text-ink-2 hover:bg-warm-100"><X size={15} /></button>
        </div>

        <div className="px-5 py-4 space-y-4">
          <div className="flex items-center justify-between rounded-md border border-line bg-warm-50 px-4 py-3">
            <div className="text-[13px] text-ink-2">
              <div className="font-bold text-ink">Step 1 — download the template</div>
              Fill the sheet (required columns are marked with *; strip nothing — upload as-is).
            </div>
            <a href={BULK_SAMPLE_URL} download="consignment_bulk_template.xlsx"
              className="shrink-0 inline-flex items-center gap-1.5 h-8 px-3.5 rounded-md border border-brand-500 text-[13px] font-bold text-brand-500 hover:bg-brand-50 transition-colors">
              <Download size={14} />Template
            </a>
          </div>

          <div
            className="rounded-md border-2 border-dashed border-warm-300 px-4 py-6 text-center cursor-pointer hover:border-brand-400 hover:bg-brand-50/40 transition-colors"
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) { setFile(f); setResult(null) } }}>
            <input ref={fileRef} type="file" accept=".xlsx" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) { setFile(f); setResult(null) } }} />
            {file ? (
              <div className="inline-flex items-center gap-2 text-[13.5px] text-ink">
                <FileSpreadsheet size={17} className="text-success-fg" />
                <span className="font-bold">{file.name}</span>
                <span className="text-ink-3">({Math.max(1, Math.round(file.size / 1024))} KB)</span>
              </div>
            ) : (
              <div className="text-[13px] text-ink-3">
                <Upload size={18} className="mx-auto mb-1.5 text-warm-400" />
                <span className="font-bold text-ink-2">Step 2 — drop the filled .xlsx here</span> or click to browse
              </div>
            )}
          </div>

          {result && (
            <div className="rounded-md border border-line overflow-hidden">
              <div className="flex items-center gap-4 px-4 py-2.5 bg-warm-50 border-b border-line text-[13px]">
                <span className="inline-flex items-center gap-1.5 text-success-fg font-bold">
                  <CheckCircle2 size={14} />{result.successCount} created
                </span>
                <span className={`inline-flex items-center gap-1.5 font-bold ${result.failedCount ? 'text-danger-fg' : 'text-ink-3'}`}>
                  <AlertTriangle size={14} />{result.failedCount} failed
                </span>
              </div>
              {result.errors.length > 0 && (
                <ul className="max-h-40 overflow-auto px-4 py-2.5 space-y-1 text-[12.5px] text-ink-2">
                  {result.errors.map((e, i) => <li key={i} className="text-danger-fg">{e}</li>)}
                </ul>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-line px-5 py-3.5">
          <Button variant="ghost" onClick={onClose}>Close</Button>
          <Button icon={<Upload size={14} />} disabled={!file || busy} onClick={upload}>
            {busy ? 'Uploading…' : 'Upload'}
          </Button>
        </div>
      </div>
    </div>
  )
}
