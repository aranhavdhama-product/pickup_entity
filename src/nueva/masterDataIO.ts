// Master data import/export — pure logic, no React, no UI.
//
// Responsibilities:
//   1. Catalogue     — turn the MASTERS tree into a flat list of importable/exportable datastores.
//   2. Export        — CSV (RFC 4180) and SpreadsheetML 2003 (single-XML workbook Excel opens natively;
//                      chosen over real .xlsx precisely because it needs no zip library).
//   3. Parse         — CSV and SpreadsheetML back into sheets of raw strings.
//   4. Match         — map an uploaded sheet onto a datastore in three explicit layers.
//   5. Classify      — count create / update / skip and collect per-row errors.
//
// The module is importable from Node (no DOM at import time) so it can be tested headlessly.

import { MASTERS, type ColumnDef } from './mastersTree'

/* ============================================================================
 * Catalogue
 * ========================================================================== */

export type Datastore = {
  id: string
  name: string
  categoryId: string
  categoryName: string
  columns: ColumnDef[]
  recordCount: number
  identifyingCode: string
}

/** Preferred keys, in order, for the column that identifies a record. */
const ID_KEY_PREFERENCE = ['code', 'key', 'assetNumber', 'assetType', 'name'] as const

function pickIdentifyingCode(columns: ColumnDef[]): string {
  const keys = new Set(columns.map((c) => c.key))
  for (const candidate of ID_KEY_PREFERENCE) if (keys.has(candidate)) return candidate
  return columns[0]?.key ?? ''
}

/**
 * Sample rows live on the sub-master, not on Datastore (which stays a light descriptor).
 * Kept here so toCsv / classifyRows can reach the existing records by datastore id.
 */
const ROWS_BY_ID: Record<string, Record<string, unknown>[]> = {}

function buildDatastores(): Datastore[] {
  const out: Datastore[] = []
  for (const category of MASTERS) {
    for (const sub of category.subs) {
      // Only tabular sub-masters are importable/exportable. This naturally skips
      // `my-network` / `my-network-new` (tab hosts) and any wizard-step entries,
      // none of which declare columns. entityTabs are deliberately NOT descended
      // into: the same tab list is shared by both My Network variants, so walking
      // it would emit duplicate ids.
      if (!sub.columns || sub.columns.length === 0) continue
      const rows = sub.rows ?? []
      ROWS_BY_ID[sub.id] = rows
      out.push({
        id: sub.id,
        name: sub.name,
        categoryId: category.id,
        categoryName: category.name,
        columns: sub.columns,
        recordCount: rows.length,
        identifyingCode: pickIdentifyingCode(sub.columns),
      })
    }
  }
  return out
}

export const DATASTORES: Datastore[] = buildDatastores()

const BY_ID = new Map(DATASTORES.map((d) => [d.id, d]))

export function datastoreById(id: string): Datastore | undefined {
  return BY_ID.get(id)
}

/** Existing sample records for a datastore (empty array when unknown). */
function recordsFor(id: string): Record<string, unknown>[] {
  return ROWS_BY_ID[id] ?? []
}

/* ============================================================================
 * Shared helpers
 * ========================================================================== */

/** Lowercase, strip everything non-alphanumeric. Used for all name/header matching. */
function norm(s: string): string {
  return String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')
}

/** Cell rendering: null/undefined → '', booleans → Yes/No, everything else stringified. */
function formatValue(v: unknown): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'boolean') return v ? 'Yes' : 'No'
  return String(v)
}

/* ============================================================================
 * Export — CSV (RFC 4180)
 * ========================================================================== */

const CSV_EOL = '\r\n'

function csvField(raw: string): string {
  if (/[",\r\n]/.test(raw)) return `"${raw.replace(/"/g, '""')}"`
  return raw
}

function csvLine(fields: string[]): string {
  return fields.map(csvField).join(',')
}

export function toCsv(ds: Datastore, includeData: boolean): string {
  const lines: string[] = [csvLine(ds.columns.map((c) => c.label))]
  if (includeData) {
    for (const record of recordsFor(ds.id)) {
      lines.push(csvLine(ds.columns.map((c) => formatValue(record[c.key]))))
    }
  }
  return lines.join(CSV_EOL)
}

/* ============================================================================
 * Export — SpreadsheetML 2003
 * ========================================================================== */

const SS_NS = 'urn:schemas-microsoft-com:office:spreadsheet'
export const META_SHEET_NAME = '_fareye_meta'
export const SCHEMA_VERSION = '1'

const MAX_SHEET_NAME = 31
/** Characters Excel forbids in a worksheet name. */
const FORBIDDEN_SHEET_CHARS = /[:\\/?*[\]]/g

/** Escape for both attribute values and element text. `&` first, always. */
function xmlEscape(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function sanitiseSheetBase(name: string): string {
  const cleaned = name.replace(FORBIDDEN_SHEET_CHARS, ' ').replace(/\s+/g, ' ').trim()
  return cleaned || 'Sheet'
}

/**
 * Excel-safe worksheet name for a datastore: forbidden characters removed, truncated
 * to 31 chars, de-duplicated against `taken` by appending " 2", " 3", … while staying
 * within the 31-char budget. Does NOT mutate `taken` — callers own insertion, which
 * lets the UI preview a name without claiming it.
 */
export function sheetNameFor(ds: Datastore, taken: Set<string>): string {
  const base = sanitiseSheetBase(ds.name)
  const lowerTaken = new Set(Array.from(taken, (t) => t.toLowerCase()))
  const first = base.slice(0, MAX_SHEET_NAME).trim() || 'Sheet'
  if (!lowerTaken.has(first.toLowerCase())) return first
  for (let n = 2; n < 1000; n++) {
    const suffix = ` ${n}`
    const candidate = (base.slice(0, MAX_SHEET_NAME - suffix.length).trim() + suffix).trim()
    if (!lowerTaken.has(candidate.toLowerCase())) return candidate
  }
  return first
}

function xmlCell(text: string): string {
  return `<Cell><Data ss:Type="String">${xmlEscape(text)}</Data></Cell>`
}

function xmlRow(fields: string[]): string {
  return `    <Row>${fields.map(xmlCell).join('')}</Row>`
}

function xmlWorksheet(name: string, rows: string[][]): string {
  const body = rows.map(xmlRow).join('\n')
  return `  <Worksheet ss:Name="${xmlEscape(name)}">\n   <Table>\n${body}\n   </Table>\n  </Worksheet>`
}

export function toSpreadsheetML(
  list: Datastore[],
  includeData: boolean,
  exportedAt: string = new Date().toISOString(),
): string {
  const taken = new Set<string>([META_SHEET_NAME]) // reserve the meta sheet name up front
  const sheets: string[] = []
  const metaPairs: string[][] = [
    ['schemaVersion', SCHEMA_VERSION],
    ['exportedAt', exportedAt],
  ]

  for (const ds of list) {
    const sheetName = sheetNameFor(ds, taken)
    taken.add(sheetName)
    const rows: string[][] = [ds.columns.map((c) => c.label)]
    if (includeData) {
      for (const record of recordsFor(ds.id)) {
        rows.push(ds.columns.map((c) => formatValue(record[c.key])))
      }
    }
    sheets.push(xmlWorksheet(sheetName, rows))
    metaPairs.push([sheetName, ds.id])
  }

  sheets.push(xmlWorksheet(META_SHEET_NAME, metaPairs))

  return [
    '<?xml version="1.0"?>',
    '<?mso-application progid="Excel.Sheet"?>',
    `<Workbook xmlns="${SS_NS}" xmlns:ss="${SS_NS}">`,
    ...sheets,
    '</Workbook>',
  ].join('\n')
}

/* ============================================================================
 * Download
 * ========================================================================== */

/** Browser-only; a no-op under Node so this module stays importable for tests. */
export function download(filename: string, mime: string, text: string): void {
  if (typeof document === 'undefined' || typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') return
  const blob = new Blob([text], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/* ============================================================================
 * Parse — CSV
 * ========================================================================== */

export function parseCsv(text: string): { headers: string[]; rows: string[][] } {
  let src = String(text ?? '')
  if (src.charCodeAt(0) === 0xfeff) src = src.slice(1) // strip UTF-8 BOM

  const records: string[][] = []
  let field = ''
  let record: string[] = []
  let inQuotes = false

  const endField = () => {
    record.push(field)
    field = ''
  }
  const endRecord = () => {
    endField()
    records.push(record)
    record = []
  }

  for (let i = 0; i < src.length; i++) {
    const ch = src[i]
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        field += ch // newlines inside quotes are literal content
      }
      continue
    }
    if (ch === '"') {
      inQuotes = true
    } else if (ch === ',') {
      endField()
    } else if (ch === '\r') {
      if (src[i + 1] === '\n') i++
      endRecord()
    } else if (ch === '\n') {
      endRecord()
    } else {
      field += ch
    }
  }
  if (field !== '' || record.length > 0) endRecord()

  // Drop a trailing blank line (a single empty field is what an ending CRLF leaves behind).
  while (records.length && records[records.length - 1].every((c) => c.trim() === '')) {
    if (records[records.length - 1].length > 1) break
    records.pop()
  }

  const headers = records.shift() ?? []
  return { headers, rows: records }
}

/* ============================================================================
 * Parse — SpreadsheetML
 * ========================================================================== */

export type ParsedSheet = { name: string; headers: string[]; rows: string[][] }

function elementsByName(root: Document | Element, local: string): Element[] {
  const anyRoot = root as { getElementsByTagNameNS?: (ns: string, local: string) => ArrayLike<Element> }
  if (typeof anyRoot.getElementsByTagNameNS === 'function') {
    const ns = Array.from(anyRoot.getElementsByTagNameNS(SS_NS, local))
    if (ns.length) return ns
  }
  const plain = Array.from(root.getElementsByTagName(local) as unknown as Iterable<Element>)
  if (plain.length) return plain
  return Array.from(root.getElementsByTagName(`ss:${local}`) as unknown as Iterable<Element>)
}

function ssAttr(el: Element, name: string): string | null {
  const nsValue = typeof el.getAttributeNS === 'function' ? el.getAttributeNS(SS_NS, name) : null
  return nsValue ?? el.getAttribute(`ss:${name}`) ?? el.getAttribute(name)
}

function padTo(arr: string[], len: number): string[] {
  while (arr.length < len) arr.push('')
  return arr
}

function rowCells(rowEl: Element): string[] {
  const cells: string[] = []
  for (const cell of elementsByName(rowEl, 'Cell')) {
    const idxAttr = ssAttr(cell, 'Index')
    if (idxAttr) {
      const idx = parseInt(idxAttr, 10)
      if (Number.isFinite(idx) && idx >= 1) padTo(cells, idx - 1) // honour sparse cells
    }
    const dataEl = elementsByName(cell, 'Data')[0]
    cells.push(dataEl ? (dataEl.textContent ?? '') : '')
  }
  return cells
}

function xmlUnescape(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_m, d: string) => String.fromCharCode(parseInt(d, 10)))
    .replace(/&amp;/g, '&')
}

/**
 * Regex fallback for environments with no DOMParser. Deliberately simple and NOT
 * namespace-aware: it matches literal `<Worksheet>` / `<Row>` / `<Cell>` tags, which is
 * what our own exporter (and Excel) emits. The DOMParser path is the real implementation.
 */
function parseSpreadsheetMLByRegex(text: string): ParsedSheet[] {
  const sheets: ParsedSheet[] = []
  const wsRe = /<(?:\w+:)?Worksheet\b([^>]*)>([\s\S]*?)<\/(?:\w+:)?Worksheet>/g
  let ws: RegExpExecArray | null
  while ((ws = wsRe.exec(text))) {
    const nameMatch = /(?:ss:)?Name\s*=\s*"([^"]*)"/.exec(ws[1])
    const name = xmlUnescape(nameMatch ? nameMatch[1] : '')
    const rows: string[][] = []
    const rowRe = /<(?:\w+:)?Row\b[^>]*>([\s\S]*?)<\/(?:\w+:)?Row>/g
    let r: RegExpExecArray | null
    while ((r = rowRe.exec(ws[2]))) {
      const cells: string[] = []
      const cellRe = /<(?:\w+:)?Cell\b([^>]*)>([\s\S]*?)<\/(?:\w+:)?Cell>|<(?:\w+:)?Cell\b([^>]*)\/>/g
      let c: RegExpExecArray | null
      while ((c = cellRe.exec(r[1]))) {
        const attrs = c[1] ?? c[3] ?? ''
        const idxMatch = /(?:ss:)?Index\s*=\s*"(\d+)"/.exec(attrs)
        if (idxMatch) padTo(cells, parseInt(idxMatch[1], 10) - 1)
        const dataMatch = /<(?:\w+:)?Data\b[^>]*>([\s\S]*?)<\/(?:\w+:)?Data>/.exec(c[2] ?? '')
        cells.push(dataMatch ? xmlUnescape(dataMatch[1]) : '')
      }
      rows.push(cells)
    }
    const headers = rows.shift() ?? []
    sheets.push({ name, headers, rows })
  }
  return sheets
}

function parseAllSheets(text: string): ParsedSheet[] {
  if (typeof DOMParser !== 'undefined') {
    try {
      const doc = new DOMParser().parseFromString(text, 'text/xml')
      const failed = doc.getElementsByTagName('parsererror').length > 0
      if (!failed) {
        const sheets: ParsedSheet[] = []
        for (const ws of elementsByName(doc, 'Worksheet')) {
          const name = ssAttr(ws, 'Name') ?? ''
          const rows = elementsByName(ws, 'Row').map(rowCells)
          const headers = rows.shift() ?? []
          sheets.push({ name, headers, rows })
        }
        if (sheets.length) return sheets
      }
    } catch {
      /* fall through to the regex reader */
    }
  }
  return parseSpreadsheetMLByRegex(text)
}

export function parseSpreadsheetML(text: string): { sheets: ParsedSheet[]; meta: Record<string, string> } {
  const all = parseAllSheets(text)
  const meta: Record<string, string> = {}
  const sheets: ParsedSheet[] = []

  for (const sheet of all) {
    if (sheet.name === META_SHEET_NAME) {
      // The meta sheet has no header row — every row is a key/value pair, including
      // the one parseAllSheets peeled off as `headers`.
      for (const pair of [sheet.headers, ...sheet.rows]) {
        const key = (pair[0] ?? '').trim()
        if (key) meta[key] = (pair[1] ?? '').trim()
      }
      continue
    }
    sheets.push(sheet)
  }
  return { sheets, meta }
}

/** Binary .xlsx cannot be read without a zip library — detect it so callers can say so honestly. */
export function isBinaryXlsx(headBytes: Uint8Array | null, filename: string): boolean {
  if (headBytes && headBytes.length >= 2 && headBytes[0] === 0x50 && headBytes[1] === 0x4b) return true
  return String(filename ?? '').toLowerCase().endsWith('.xlsx')
}

/* ============================================================================
 * Matching — three layers, in order, then a single unresolved state
 * ========================================================================== */

export type Match = {
  sheetName: string
  datastoreId: string | null
  via: 'metadata' | 'sheet-name' | 'columns' | null
  reason: string
}

const SCORE_FLOOR = 0.5
const MARGIN = 0.15

/** Canonical token set for a datastore: one normalised column key per column. */
function columnTokens(ds: Datastore): Set<string> {
  return new Set(ds.columns.map((c) => norm(c.key)))
}

/**
 * Resolve the sheet's headers against one datastore: a header counts as the column's
 * token when it matches either the column label or the column key (normalised).
 * Unresolvable headers keep their own token so noise still lowers the score.
 */
function headerTokens(ds: Datastore, headers: string[]): Set<string> {
  const byLabel = new Map<string, string>()
  for (const c of ds.columns) {
    byLabel.set(norm(c.label), norm(c.key))
    byLabel.set(norm(c.key), norm(c.key))
  }
  const out = new Set<string>()
  for (const h of headers) {
    const n = norm(h)
    if (!n) continue
    out.add(byLabel.get(n) ?? `?${n}`)
  }
  return out
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0
  let inter = 0
  for (const v of a) if (b.has(v)) inter++
  const union = a.size + b.size - inter
  return union === 0 ? 0 : inter / union
}

function scoreAll(headers: string[]): { datastoreId: string; score: number }[] {
  return DATASTORES.map((ds) => ({
    datastoreId: ds.id,
    score: jaccard(headerTokens(ds, headers), columnTokens(ds)),
  })).sort((a, b) => b.score - a.score || a.datastoreId.localeCompare(b.datastoreId))
}

export function matchSheet(sheet: { name: string; headers: string[] }, meta: Record<string, string>): Match {
  const sheetName = sheet.name ?? ''
  const headers = sheet.headers ?? []

  // Layer 1 — embedded metadata from our own export.
  const declared = meta ? meta[sheetName] : undefined
  if (declared && BY_ID.has(declared)) {
    return {
      sheetName,
      datastoreId: declared,
      via: 'metadata',
      reason: `Resolved from the workbook's embedded ${META_SHEET_NAME} metadata.`,
    }
  }

  // Layer 2 — sheet name matches a datastore id, name, or its 31-char truncation.
  const target = norm(sheetName)
  if (target) {
    for (const ds of DATASTORES) {
      const truncated = norm(sanitiseSheetBase(ds.name).slice(0, MAX_SHEET_NAME))
      if (target === norm(ds.id) || target === norm(ds.name) || target === truncated) {
        return {
          sheetName,
          datastoreId: ds.id,
          via: 'sheet-name',
          reason: `Sheet name "${sheetName}" matches the ${ds.name} master by name.`,
        }
      }
    }
  }

  // Layer 3 — column-signature similarity, accepted only when it clears both the floor
  // and the margin over the runner-up.
  //
  // The margin rule is load-bearing, not defensive padding. Service Type, Consignment
  // Type and Sort Code have identical signatures (name, code, status): measured against
  // headers [Name, Code, Status] all three score exactly 1.0, margin 0. They are
  // mathematically indistinguishable by columns and MUST fall through to unresolved —
  // never "improved" into a winner. Overlapping-but-distinguishable pairs do resolve:
  // Location Master headers score 1.0 against location-master and 0.48 against
  // merchant-listing, so that clears the margin and matches by columns.
  const ranked = scoreAll(headers)
  const best = ranked[0]
  const runnerUp = ranked[1]

  if (best && best.score >= SCORE_FLOOR && best.score - (runnerUp?.score ?? 0) >= MARGIN) {
    return {
      sheetName,
      datastoreId: best.datastoreId,
      via: 'columns',
      reason: `Column signature matches the ${datastoreById(best.datastoreId)?.name ?? best.datastoreId} master.`,
    }
  }

  return {
    sheetName,
    datastoreId: null,
    via: null,
    reason: `Could not identify ${sheetName ? `"${sheetName}"` : 'this sheet'} — rename it to the master name (e.g. "Location Master") and upload again.`,
  }
}

/* ============================================================================
 * Row classification
 * ========================================================================== */

export type RowIssue = { row: number; reason: string }
export type Classification = { create: number; update: number; skip: number; errors: RowIssue[] }

/** Row numbers are 1-based counting the header as row 1, so the first data row is row 2. */
const FIRST_DATA_ROW = 2

export function classifyRows(ds: Datastore, headers: string[], rows: string[][]): Classification {
  const result: Classification = { create: 0, update: 0, skip: 0, errors: [] }

  // Map sheet headers onto columns by label-or-key (normalised).
  const byName = new Map<string, ColumnDef>()
  for (const c of ds.columns) {
    byName.set(norm(c.label), c)
    if (!byName.has(norm(c.key))) byName.set(norm(c.key), c)
  }
  const mapped: { index: number; col: ColumnDef }[] = []
  headers.forEach((h, index) => {
    const col = byName.get(norm(h))
    if (col && !mapped.some((m) => m.col.key === col.key)) mapped.push({ index, col })
  })

  const idColumn = ds.columns.find((c) => c.key === ds.identifyingCode)
  const idMapping = idColumn ? mapped.find((m) => m.col.key === idColumn.key) : undefined
  if (!idColumn || !idMapping) {
    result.errors.push({
      row: 1,
      reason: `The identifying column "${idColumn?.label ?? ds.identifyingCode}" is missing from this sheet, so rows cannot be matched to records.`,
    })
    return result
  }

  // Existing records, indexed by trimmed lowercase identifying value.
  const existingByKey = new Map<string, Record<string, unknown>>()
  for (const record of recordsFor(ds.id)) {
    const key = formatValue(record[idColumn.key]).trim().toLowerCase()
    if (key && !existingByKey.has(key)) existingByKey.set(key, record)
  }

  const seen = new Map<string, number>()

  rows.forEach((row, i) => {
    const rowNo = i + FIRST_DATA_ROW
    // Tolerate short rows; a wholly blank row is neither an error nor a record.
    const isBlank = !headers.some((_h, ci) => String(row[ci] ?? '').trim() !== '') &&
      !row.some((c) => String(c ?? '').trim() !== '')
    if (isBlank) return

    const rawId = String(row[idMapping.index] ?? '').trim()
    if (!rawId) {
      result.errors.push({ row: rowNo, reason: `${idColumn.label}: identifying code is required.` })
      return
    }

    const key = rawId.toLowerCase()
    const firstSeen = seen.get(key)
    if (firstSeen !== undefined) {
      result.errors.push({
        row: rowNo,
        reason: `Duplicate ${idColumn.label} "${rawId}" — already used on row ${firstSeen} of this sheet.`,
      })
      return
    }
    seen.set(key, rowNo)

    const existing = existingByKey.get(key)
    if (!existing) {
      // No matching record → create. Note the converse deliberately does NOT hold:
      // an existing record that is absent from the sheet is left untouched. Import is
      // never a delete — omission must never be interpreted as a removal.
      result.create++
      return
    }

    const changed = mapped.some((m) => {
      const incoming = String(row[m.index] ?? '').trim()
      const current = formatValue(existing[m.col.key]).trim()
      return incoming.toLowerCase() !== current.toLowerCase()
    })
    if (changed) result.update++
    else result.skip++
  })

  return result
}
