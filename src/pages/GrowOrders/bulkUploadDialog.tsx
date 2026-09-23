/**
 * Grow merchant portal — **Bulk Upload**, the centred popup.
 *
 * Same chrome as Book a Pickup (700px `Dialog`, title/subtitle, `TabStrip`
 * flush under the subtitle, footer Cancel + coral primary) so the merchant only
 * ever learns one modal. Two steps live INSIDE the one dialog:
 *
 *  1. **pick**   — shipment tab, dropzone, `Download template`.
 *  2. **review** — `n rows · n valid · n errors` plus the error table, then
 *                  `Create n orders`.
 *
 * The parsing is `growOrders/bulkCsv.ts` (pure); this file only maps a valid
 * row onto a `GrowOrder`. Created orders are **Unpaid drafts**: bulk upload
 * fills the basket, checkout is still the payment gate, so they land on Drafts
 * and carry an `OrderDraft` so `Resume` reopens the stepper with the row's data.
 */
import { useRef, useState } from 'react'
import { FileSpreadsheet, Package, Truck, Upload, type LucideIcon } from 'lucide-react'
import { blankParty } from '../../growOrders/seed'
import { ORDER_DEFAULTS, growOrderActions, newOrderId, newOrderNumber } from '../../growOrders/store'
import type { GrowOrder, Party, StoreLocation } from '../../growOrders/types'
import type { OrderDraft, Parcel } from '../../growOrders/draft'
import { VEHICLE_TYPES } from '../../growOrders/draft'
import {
  parseBulkCsv, templateCsv, templateFileName, type BulkKind, type BulkParse, type BulkRow,
} from '../../growOrders/bulkCsv'
import { toast } from '../../nueva/toast'
import { Btn, Dialog, TabStrip } from './ui'

/** The same two tabs as Create Order and Book a Pickup — one vocabulary. */
const SHIP_TABS = ['Parcel', 'Vehicle (FTL)'] as const
const SHIP_TAB_ICONS: Record<(typeof SHIP_TABS)[number], LucideIcon> = { Parcel: Package, 'Vehicle (FTL)': Truck }
const KIND_OF: Record<string, BulkKind> = { Parcel: 'Parcel', 'Vehicle (FTL)': 'FTL' }
const TAB_OF: Record<BulkKind, string> = { Parcel: 'Parcel', FTL: 'Vehicle (FTL)' }

/* --------------------------------------------------------------- mapping ---- */

const num = (v: string | undefined, fallback = 0) => {
  const n = Number((v ?? '').trim())
  return Number.isFinite(n) && (v ?? '').trim() !== '' ? n : fallback
}

/** A validated row → the receiver party. */
function receiverOf(v: Record<string, string>): Party {
  return {
    ...blankParty(),
    name: v.receiver_name ?? '',
    contactNumber: v.contact_number ?? '',
    email: v.email ?? '',
    businessName: v.business_name ?? '',
    country: v.country?.trim() || 'Philippines',
    line1: v.address_line1 ?? '',
    line2: v.address_line2 ?? '',
    postalCode: v.postal_code ?? '',
    state: v.state ?? '',
    city: v.city ?? '',
  }
}

/**
 * One valid row → an Unpaid draft order. The `draft` block mirrors what the
 * stepper's own "Save for Later" writes, so `Resume` on a bulk row reopens the
 * wizard fully populated instead of blank.
 */
function orderFromRow(row: BulkRow, kind: BulkKind, stores: StoreLocation[]): GrowOrder {
  const v = row.values
  const ftl = kind === 'FTL'
  const store = (ftl ? stores.find((s) => s.code === v.shipfrom_store_code?.trim()) : undefined) ?? stores[0]
  const receiver = receiverOf(v)
  const qty = ftl ? Math.max(1, num(v.number_of_vehicles ?? v.vehicle_unit, 1)) : Math.max(1, num(v.quantity, 1))
  const unitWeight = ftl ? num(v.actual_load_kg) / qty : num(v.weight_kg)
  const vehicleType = ftl
    ? (VEHICLE_TYPES.find((t) => t.toLowerCase() === v.vehicle_type?.trim().toLowerCase()) ?? v.vehicle_type?.trim() ?? '')
    : ''
  /* `packaging` is a free-text column, so it is taken as the PACKAGE TYPE's name
     — the stepper resolves it back to a Package master row by name when the
     draft is resumed, and falls back to Custom when nothing matches. The CARGO
     type is a separate thing, and the sheet only ever says 'Document'. */
  const packageType = ftl ? 'FTL' : (v.packaging?.trim() || 'Custom')
  const cargoType = ftl ? 'FTL' : /document|envelope/i.test(packageType) ? 'Document' : 'Parcel'
  const parcel: Parcel = {
    cargoType,
    packageTypeName: packageType,
    itemInfo: ftl ? vehicleType : (v.packaging?.trim() || ''),
    quantity: qty, weight: unitWeight,
    l: ftl ? 120 : num(v.length_cm), w: ftl ? 100 : num(v.width_cm), h: ftl ? 150 : num(v.height_cm),
  }
  const draft: OrderDraft = {
    storeCode: store.code, sender: store.party, receiver, drops: [],
    shipmentType: ftl ? 'FTL' : 'Parcel', vehicleType,
    vehicleUnit: ftl ? qty : 1, actualLoad: ftl ? num(v.actual_load_kg) : 0, additionalServices: [],
    parcels: [parcel], authority: 'Leave at the door', instructions: '',
    secure: false, service: '', rate: 0, etaDays: 0,
  }
  const codMode = (v.payment_mode ?? '').trim().toLowerCase() === 'cod'
  return {
    ...ORDER_DEFAULTS,
    id: newOrderId(),
    orderNumber: v.order_number?.trim() || newOrderNumber(),
    createdAt: new Date().toISOString(),
    status: 'Order Created',
    storeCode: store.code, sender: store.party, receiver, drops: [],
    shipmentType: ftl ? 'FTL' : 'Parcel',
    vehicleType,
    ...(ftl ? { vehicleUnit: qty, actualLoad: num(v.actual_load_kg), additionalServices: [] } : {}),
    pkg: {
      /* the same rule as checkout: the CARGO classification decides the kind */
      kind: ftl ? 'FTL' : cargoType === 'Document' ? 'Document' : 'Parcel',
      count: qty,
      weightKg: ftl ? num(v.actual_load_kg) : unitWeight * qty,
      lengthCm: parcel.l, widthCm: parcel.w, heightCm: parcel.h,
      description: parcel.itemInfo, declaredValue: 0,
      ...(ftl ? {} : { cargoType, packageType }),
    },
    paymentMode: codMode ? 'COD' : 'Prepaid',
    codAmount: codMode ? num(v.cod_amount) : 0,
    carrier: ftl ? '2GO Logistics' : '2GO Express',
    /* payment is still the gate — a bulk row is a draft until it is checked out */
    paymentStatus: 'Unpaid', isDraft: true, pickupRequestId: null, draft,
  }
}

/* ---------------------------------------------------------------- dialog ---- */

export function BulkUploadDialog({ stores, onClose, onCreated }: {
  stores: StoreLocation[]
  onClose: () => void
  /** Fired after the orders were written, with how many landed on Drafts. */
  onCreated: (n: number) => void
}) {
  const [kind, setKind] = useState<BulkKind>('Parcel')
  const [file, setFile] = useState<File | null>(null)
  const [fileError, setFileError] = useState('')
  const [drag, setDrag] = useState(false)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<BulkParse | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const isCsv = (f: File) => /\.csv$/i.test(f.name)
  const pickFile = (f: File | null) => {
    setResult(null)
    if (!f) { setFile(null); setFileError(''); return }
    setFile(f)
    if (f.size > 10 * 1024 * 1024) { setFileError('Maximum size 10 MB — this file is larger.'); return }
    setFileError(isCsv(f)
      ? ''
      : 'Uploaded File is empty — .xlsx / .xls workbooks are not read in this prototype. Save the sheet as .csv and upload it again.')
  }

  /** A real file, generated in the browser — no server round trip. */
  const downloadTemplate = () => {
    const blob = new Blob([templateCsv(kind)], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = templateFileName(kind)
    /* the anchor must be IN the document and the blob URL must outlive the click —
       revoking synchronously can land before Chrome commits the download */
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  const parse = async () => {
    if (!file || fileError) return
    setBusy(true)
    try {
      const text = await file.text()
      setResult(parseBulkCsv(text, kind, stores.map((s) => s.code)))
    } catch {
      setFileError('That file could not be read.')
    } finally {
      setBusy(false)
    }
  }

  const createAll = () => {
    const rows = result?.validRows ?? []
    /* ONE commit for the whole sheet — `create()` per row would write
       localStorage and wake every subscriber once per order */
    growOrderActions.createMany(rows.map((r) => orderFromRow(r, kind, stores)))
    toast.success(`${rows.length} order${rows.length === 1 ? '' : 's'} created in Drafts`)
    onCreated(rows.length)
  }

  const review = result !== null
  const validCount = result?.validRows.length ?? 0

  return (
    <Dialog open title="Bulk Upload" subtitle="Create many orders from a spreadsheet" onClose={onClose}
      footer={review
        ? <>
          <Btn variant="text" color="neutral" onClick={() => setResult(null)}>Back</Btn>
          <Btn color="accent2" disabled={validCount === 0} startIcon={<Upload size={17} />} onClick={createAll}>
            Create {validCount} order{validCount === 1 ? '' : 's'}
          </Btn>
        </>
        : <>
          <Btn variant="text" color="neutral" onClick={onClose}>Cancel</Btn>
          <Btn color="accent2" disabled={!file || !!fileError || busy} startIcon={<Upload size={17} />} onClick={parse}>
            {busy ? 'Reading…' : 'Upload'}
          </Btn>
        </>}>
      {/* the shipment tabs decide the column set, so they are locked once a file is parsed */}
      {!review && (
        <TabStrip tabs={SHIP_TABS} active={TAB_OF[kind]} icons={SHIP_TAB_ICONS}
          onChange={(t) => { setKind(KIND_OF[t]); setResult(null); setFileError(''); setFile(null) }} />
      )}

      {!review ? (
        <div className="space-y-5 pt-1">
          <label
            onDragOver={(e) => { e.preventDefault(); setDrag(true) }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => { e.preventDefault(); setDrag(false); pickFile(e.dataTransfer.files?.[0] ?? null) }}
            className={`relative flex h-[170px] cursor-pointer flex-col items-center justify-center rounded-[6px] border-2 border-dashed text-center transition-colors
              ${drag ? 'border-grow-accent-2 bg-grow-accent-2/[0.04]' : 'border-grow-outline hover:border-grow-accent-2'}`}>
            {file && !fileError
              ? <FileSpreadsheet size={26} className="mb-2 text-grow-accent-2" />
              : <Upload size={26} className="mb-2 text-grow-ink-2" />}
            <span className="px-6 text-[15px] text-grow-ink">
              {file ? file.name : 'Click to upload or drag and drop (.xlsx, .xls, .csv)'}
            </span>
            <span className="mt-1 text-[13px] text-grow-ink-2">
              {file ? `${(file.size / 1024).toFixed(1)} KB · click to replace` : 'Maximum size 10 MB'}
            </span>
            {/* transparent rather than display:none, so the real <input type=file> stays hittable */}
            <input ref={inputRef} type="file" accept=".xlsx,.xls,.csv" aria-label="Bulk upload file"
              onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
          </label>

          {fileError && (
            <p className="rounded-[4px] bg-grow-error/10 px-3 py-2 text-[13px] text-grow-error">{fileError}</p>
          )}

          <div className="flex items-center justify-between">
            <button type="button" onClick={downloadTemplate} className="text-[14px] font-medium text-grow-accent-2 hover:underline">
              Download template
            </button>
            <span className="text-[13px] text-grow-ink-2">
              {kind === 'FTL' ? 'One row per vehicle booking' : 'One row per parcel order'}
            </span>
          </div>
        </div>
      ) : (
        <div className="space-y-4 pt-1">
          <div className="flex flex-wrap items-center gap-2 text-[14px] text-grow-ink">
            <FileSpreadsheet size={18} className="text-grow-ink-2" />
            <span className="font-medium">{file?.name}</span>
            <span className="text-grow-ink-2">
              · {result.total} row{result.total === 1 ? '' : 's'} · {validCount} valid · {result.errors.length} error{result.errors.length === 1 ? '' : 's'}
            </span>
          </div>

          {result.errors.length === 0 ? (
            <p className="rounded-[4px] bg-grow-success/10 px-3 py-2 text-[13px] text-[#3E9500]">
              Every row passed validation. {validCount} order{validCount === 1 ? '' : 's'} will be created as unpaid drafts —
              pay for them from the Drafts tab to make them ready for pickup.
            </p>
          ) : (
            <div className="max-h-[280px] overflow-auto rounded-[6px] border border-grow-line">
              <table className="w-full border-collapse text-[13px]">
                <thead>
                  <tr className="sticky top-0 bg-grow-thead text-left">
                    {['Row', 'Column', 'Message'].map((h) => (
                      <th key={h} className="whitespace-nowrap px-3 py-2 text-[12px] font-semibold uppercase tracking-[0.17px] text-grow-ink">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.errors.map((e, i) => (
                    <tr key={i} className="border-b border-grow-line last:border-0">
                      <td className="whitespace-nowrap px-3 py-2 text-grow-ink-2">{e.row === 0 ? 'File' : e.row}</td>
                      <td className="whitespace-nowrap px-3 py-2 font-medium text-grow-ink">{e.column}</td>
                      <td className="px-3 py-2 text-grow-error">{e.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {result.errors.length > 0 && validCount > 0 && (
            <p className="text-[13px] text-grow-ink-2">
              Rows with errors are skipped — fix them in the spreadsheet and upload again.
            </p>
          )}
        </div>
      )}
    </Dialog>
  )
}
