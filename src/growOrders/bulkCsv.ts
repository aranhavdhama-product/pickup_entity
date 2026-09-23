/**
 * Grow merchant portal — Bulk Upload CSV parsing + validation.
 *
 * Deliberately PURE: no React, no store, no DOM. The dialog feeds it the file
 * text and turns the surviving rows into orders, so the whole "is this
 * spreadsheet usable?" question can be reasoned about (and unit-tested) on its
 * own. The column sets are the merchant-facing contract — they are also what
 * `templateCsv` hands back as a downloadable template, so a merchant who fills
 * in our template can never produce a header mismatch.
 */

export type BulkKind = 'Parcel' | 'FTL'

/** Parcel (LTL) upload — one row = one order with one package line. */
export const PARCEL_COLUMNS = [
  'order_number', 'receiver_name', 'contact_number', 'email', 'business_name',
  'address_line1', 'address_line2', 'postal_code', 'state', 'city', 'country',
  'packaging', 'quantity', 'weight_kg', 'length_cm', 'width_cm', 'height_cm',
  'payment_mode', 'cod_amount',
] as const

/** Vehicle (FTL) upload — one row = one dedicated-vehicle booking. */
export const FTL_COLUMNS = [
  'order_number', 'receiver_name', 'contact_number', 'address_line1', 'postal_code',
  'city', 'state', 'country', 'vehicle_type', 'number_of_vehicles', 'actual_load_kg',
  'shipfrom_store_code',
] as const

export const columnsFor = (kind: BulkKind): readonly string[] =>
  (kind === 'FTL' ? FTL_COLUMNS : PARCEL_COLUMNS)

/** Columns a row cannot be turned into an order without. */
const REQUIRED: Record<BulkKind, string[]> = {
  Parcel: ['order_number', 'receiver_name', 'address_line1', 'postal_code', 'quantity', 'weight_kg'],
  FTL: ['order_number', 'receiver_name', 'address_line1', 'postal_code', 'vehicle_type', 'actual_load_kg'],
}

/** One problem, addressed the way the merchant sees the file: 1-based row, column name. */
export interface BulkError {
  /** 1-based data row (header excluded); 0 = a problem with the file itself. */
  row: number
  column: string
  message: string
}

export interface BulkRow {
  /** 1-based data row number, as shown in the error table. */
  row: number
  /** Raw cell values keyed by (normalised) header. */
  values: Record<string, string>
  errors: BulkError[]
}

export interface BulkParse {
  /** Headers as found in the file, normalised (trimmed + lower-cased). */
  columns: string[]
  /** REQUIRED columns the header row does not have — a file-level failure.
   *  A missing OPTIONAL column is not an error; its values simply default. */
  missingColumns: string[]
  rows: BulkRow[]
  validRows: BulkRow[]
  errors: BulkError[]
  total: number
}

/* --------------------------------------------------------------- lexing ---- */

/**
 * Split one CSV line, honouring double-quoted fields (so an address with a
 * comma survives) and the doubled-quote escape (`""` inside a quoted field).
 */
export function splitCsvLine(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let quoted = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (quoted) {
      if (c === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++ } else quoted = false
      } else cur += c
    } else if (c === '"') quoted = true
    else if (c === ',') { out.push(cur); cur = '' }
    else cur += c
  }
  out.push(cur)
  return out.map((s) => s.trim())
}

/** Quote a value for the generated template. */
const q = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)

/* ------------------------------------------------------------- template ---- */

const SAMPLE: Record<string, string> = {
  order_number: 'SO-1001', receiver_name: 'Pooja Chandra', contact_number: '8208462191',
  email: 'pooja.c@example.com', business_name: 'Iloilo Retail', address_line1: 'Diversion Rd',
  address_line2: 'Mandurriao', postal_code: '5000', state: 'Iloilo', city: 'Iloilo City',
  country: 'Philippines', packaging: 'Parcel', quantity: '1', weight_kg: '1.5',
  length_cm: '30', width_cm: '20', height_cm: '15', payment_mode: 'Prepaid', cod_amount: '0',
  vehicle_type: '4 Ton Truck', number_of_vehicles: '1', actual_load_kg: '3200', shipfrom_store_code: 'MNL-01',
}

/** The downloadable template: the header row plus one filled-in example row. */
export function templateCsv(kind: BulkKind): string {
  const cols = columnsFor(kind)
  return `${cols.join(',')}\n${cols.map((c) => q(SAMPLE[c] ?? '')).join(',')}\n`
}

export const templateFileName = (kind: BulkKind) =>
  kind === 'FTL' ? 'grow-bulk-vehicle-template.csv' : 'grow-bulk-parcel-template.csv'

/* ----------------------------------------------------------- validation ---- */

const isNum = (v: string) => v !== '' && Number.isFinite(Number(v))
const isInt = (v: string) => isNum(v) && Number.isInteger(Number(v))

/**
 * Parse and validate a bulk CSV. `storeCodes`, when given, is the set of store
 * codes an FTL row's `shipfrom_store_code` may name — an unknown code is a row
 * error rather than a silently wrong sender.
 */
export function parseBulkCsv(text: string, kind: BulkKind, storeCodes: string[] = []): BulkParse {
  /* Excel writes a UTF-8 BOM; \r\n is the norm on Windows exports. */
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter((l) => l.trim() !== '')
  const empty: BulkParse = { columns: [], missingColumns: [], rows: [], validRows: [], errors: [], total: 0 }

  if (lines.length === 0) {
    return { ...empty, errors: [{ row: 0, column: '—', message: 'Uploaded File is empty' }] }
  }

  const columns = splitCsvLine(lines[0]).map((h) => h.toLowerCase().replace(/^"|"$/g, ''))
  const expected = columnsFor(kind)
  const missingColumns = expected.filter((c) => REQUIRED[kind].includes(c) && !columns.includes(c))
  const errors: BulkError[] = missingColumns.map((c) => ({
    row: 0, column: c, message: `Required column "${c}" is missing from the header row`,
  }))
  if (lines.length === 1) {
    errors.push({ row: 0, column: '—', message: 'Uploaded File is empty — the file has a header row but no data' })
  }
  if (errors.length) return { ...empty, columns, missingColumns, errors }

  const known = new Set(storeCodes)
  const seen = new Set<string>()
  const rows: BulkRow[] = lines.slice(1).map((line, i) => {
    const cells = splitCsvLine(line)
    const values: Record<string, string> = {}
    columns.forEach((c, j) => { values[c] = cells[j] ?? '' })
    const row = i + 1
    const e: BulkError[] = []
    const bad = (column: string, message: string) => e.push({ row, column, message })
    const val = (c: string) => (values[c] ?? '').trim()

    REQUIRED[kind].forEach((c) => { if (!val(c)) bad(c, 'Required value is missing') })

    const num = val('order_number')
    if (num && seen.has(num.toLowerCase())) bad('order_number', 'Duplicate order number in this file')
    if (num) seen.add(num.toLowerCase())

    const postal = val('postal_code')
    if (postal && !/^\d{4,6}$/.test(postal)) bad('postal_code', 'Postal code must be 4-6 digits')

    if (kind === 'Parcel') {
      const w = val('weight_kg')
      if (w && (!isNum(w) || Number(w) <= 0)) bad('weight_kg', 'Weight must be a number greater than 0')
      const qty = val('quantity')
      if (qty && (!isInt(qty) || Number(qty) < 1)) bad('quantity', 'Quantity must be a whole number of 1 or more')
      ;(['length_cm', 'width_cm', 'height_cm'] as const).forEach((c) => {
        const v = val(c)
        if (v && (!isNum(v) || Number(v) < 0)) bad(c, 'Must be a number')
      })
      const mode = val('payment_mode')
      if (mode && !['prepaid', 'cod'].includes(mode.toLowerCase())) bad('payment_mode', 'Must be Prepaid or COD')
      const cod = val('cod_amount')
      if (cod && !isNum(cod)) bad('cod_amount', 'COD amount must be a number')
      else if (mode.toLowerCase() === 'cod' && Number(cod || 0) <= 0) bad('cod_amount', 'COD orders need an amount greater than 0')
    } else {
      const load = val('actual_load_kg')
      if (load && (!isNum(load) || Number(load) <= 0)) bad('actual_load_kg', 'Actual load must be a number greater than 0')
      /* `vehicle_unit` is the old header — still read, so sheets already in
         circulation keep working after the rename to `number_of_vehicles` */
      const unit = val('number_of_vehicles') || val('vehicle_unit')
      if (unit && (!isInt(unit) || Number(unit) < 1)) bad('number_of_vehicles', 'Number of vehicles must be a whole number of 1 or more')
      const store = val('shipfrom_store_code')
      if (store && known.size && !known.has(store)) bad('shipfrom_store_code', `Unknown store code "${store}"`)
    }

    return { row, values, errors: e }
  })

  return {
    columns,
    missingColumns,
    rows,
    validRows: rows.filter((r) => r.errors.length === 0),
    errors: rows.flatMap((r) => r.errors),
    total: rows.length,
  }
}
