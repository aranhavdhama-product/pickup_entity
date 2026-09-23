/**
 * Value formatting shared by the two detail drawers.
 *
 * Separate from `overlayBits.tsx` because that file exports components: a module
 * that mixes components with plain helpers breaks fast refresh, and the lint
 * rule that says so is right.
 */

/** An em dash for an absent value — never a blank, never a zero. */
export const dash = (v: unknown): string => {
  const s = v === null || v === undefined ? '' : String(v)
  return s.trim() ? s : '—'
}

/** '2026-09-16T08:00' → 'Sep 16, 2026, 08:00 AM' — staging's detail format. */
export function stamp(v: string | undefined | null): string {
  if (!v) return '—'
  const d = new Date(v.length <= 10 ? `${v}T00:00` : v)
  if (Number.isNaN(d.getTime())) return String(v)
  const date = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  const time = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })
  return `${date}, ${time}`
}
