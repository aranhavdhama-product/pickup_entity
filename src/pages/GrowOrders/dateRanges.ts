/**
 * Date-range presets shared by the Grow Dashboard, Tracking and Reports pages —
 * the live portal's Date Filter popover (Today · Yesterday · This Week · Last
 * Week · This Month · Last Month) plus the dashboard's default "last 30 days".
 * Every range is inclusive ISO `YYYY-MM-DD`, in local time.
 */
const p2 = (n: number) => String(n).padStart(2, '0')
export const isoDay = (d: Date) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`
const shift = (d: Date, days: number) => { const x = new Date(d); x.setDate(x.getDate() + days); return x }

export const DATE_PRESETS = ['Today', 'Yesterday', 'This Week', 'Last Week', 'This Month', 'Last Month', 'Last 30 Days'] as const
export type DatePreset = (typeof DATE_PRESETS)[number]

export function presetRange(p: DatePreset, now = new Date()): { from: string; to: string } {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  /* weeks start on Monday */
  const monday = shift(today, -((today.getDay() + 6) % 7))
  switch (p) {
    case 'Today': return { from: isoDay(today), to: isoDay(today) }
    case 'Yesterday': { const y = shift(today, -1); return { from: isoDay(y), to: isoDay(y) } }
    case 'This Week': return { from: isoDay(monday), to: isoDay(today) }
    case 'Last Week': return { from: isoDay(shift(monday, -7)), to: isoDay(shift(monday, -1)) }
    case 'This Month': return { from: isoDay(new Date(today.getFullYear(), today.getMonth(), 1)), to: isoDay(today) }
    case 'Last Month': return {
      from: isoDay(new Date(today.getFullYear(), today.getMonth() - 1, 1)),
      to: isoDay(new Date(today.getFullYear(), today.getMonth(), 0)),
    }
    case 'Last 30 Days': return { from: isoDay(shift(today, -30)), to: isoDay(today) }
  }
}

/** Which preset a range equals (so the preset pill reads back), else ''. */
export function presetOf(from: string, to: string, now = new Date()): DatePreset | '' {
  return DATE_PRESETS.find((p) => { const r = presetRange(p, now); return r.from === from && r.to === to }) ?? ''
}

/** Every day from → to inclusive (for per-day charts). */
export function daysBetween(from: string, to: string): string[] {
  const out: string[] = []
  let d = new Date(`${from}T00:00:00`)
  const end = new Date(`${to}T00:00:00`)
  while (d <= end && out.length < 400) { out.push(isoDay(d)); d = shift(d, 1) }
  return out
}

/** Is a local ISO timestamp's day inside [from, to]? Empty bounds are open. */
export const inRange = (at: string, from: string, to: string) => {
  const day = isoDay(new Date(at))
  return (!from || day >= from) && (!to || day <= to)
}
