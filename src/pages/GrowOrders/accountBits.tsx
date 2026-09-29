/**
 * Small pieces shared by the Grow account pages (Payments, Billing, Disputes,
 * Address Book, Settings): a paged DataTable footer, the round count badge
 * ("3 Consignments"), a label/value line and a card with a ⋮ menu. Built only
 * from Nueva primitives + design.md tokens.
 */
import { useState, type ReactNode } from 'react'
import { DataTable, KebabMenu, PageSize, Pagination, type Column, type MenuItem, type SelectionAction } from '../../nueva/components'

/** DataTable + Pagination + PageSize over an in-memory list. */
export function PagedTable<T>({ rows, columns, rowKey = 'id', onRowClick, selectable, selectionActions, extraActions, initialSize = 10, resetKey }: {
  rows: T[]; columns: Column[]; rowKey?: string; onRowClick?: (r: T) => void; selectable?: boolean
  selectionActions?: (sel: T[], clear: () => void) => SelectionAction[]
  extraActions?: (r: T) => ReactNode
  initialSize?: number
  /** change it (e.g. the search text) to jump back to page 1 */
  resetKey?: string
}) {
  const [page, setPage] = useState(1)
  const [size, setSize] = useState(initialSize)
  const [seenKey, setSeenKey] = useState(resetKey)
  if (seenKey !== resetKey) { setSeenKey(resetKey); setPage(1) }
  const total = Math.max(1, Math.ceil(rows.length / size))
  const p = Math.min(page, total)
  const shown = rows.slice((p - 1) * size, p * size)
  const range = rows.length === 0 ? '0–0 of 0' : `${(p - 1) * size + 1}–${Math.min(p * size, rows.length)} of ${rows.length.toLocaleString()}`
  return (
    <>
      <DataTable columns={columns} rows={shown} rowKey={rowKey} selectable={selectable}
        onRowClick={onRowClick as ((r: unknown) => void) | undefined}
        selectionActions={selectionActions as ((s: unknown[], c: () => void) => SelectionAction[]) | undefined}
        extraActions={extraActions as ((r: unknown) => ReactNode) | undefined} />
      <div className="flex items-center justify-between gap-3">
        <div className="flex-1"><Pagination page={p} total={total} onChange={setPage} range={range} /></div>
        <div className="pt-3"><PageSize value={size} onChange={(n) => { setSize(n); setPage(1) }} /></div>
      </div>
    </>
  )
}

/** A small round count next to a value — "2GO00067 ③" = 3 consignments. */
export function CountBadge({ n, title }: { n: number; title?: string }) {
  return (
    <span title={title} className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-warm-100 px-1 text-[11px] font-bold text-ink-2">
      {n}
    </span>
  )
}

/** "Label: value" on one 13px line (the live portal's info cards). */
export function InfoLine({ label, children }: { label: string; children: ReactNode }) {
  return (
    <p className="flex min-w-0 gap-1.5 py-1 text-[13px]">
      <span className="shrink-0 text-ink-3">{label}:</span>
      <span className="min-w-0 truncate text-ink">{children}</span>
    </p>
  )
}

/** A white card with a 15px bold title, optional icon, and a ⋮ menu top-right. */
export function MenuCard({ title, icon, menu, right, children }: {
  title: string; icon?: ReactNode; menu?: MenuItem[]; right?: ReactNode; children: ReactNode
}) {
  return (
    <section className="rounded-xl border border-line bg-surface shadow-ds-1">
      <div className="flex items-center gap-2 px-5 pt-4">
        {icon && <span className="text-ink-3">{icon}</span>}
        <h3 className="min-w-0 flex-1 truncate text-[15px] font-bold text-ink">{title}</h3>
        {right}
        {menu && <KebabMenu items={menu} />}
      </div>
      <div className="px-5 pb-4 pt-2">{children}</div>
    </section>
  )
}

/** One read-only value in a label-above grid (view pages). */
export function ReadField({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="mb-1 text-[12px] font-bold text-ink-3">{label}</p>
      <p className="truncate text-[13px] text-ink">{value || '—'}</p>
    </div>
  )
}

export const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`
