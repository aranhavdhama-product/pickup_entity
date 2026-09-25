/** Class strings shared by the console shell (`shell.tsx`) and a portal's own rail footer. */

/**
 * The class of a rail row — exported so a portal's footer rows match exactly.
 * Active = warm-50 row + brand TEXT + a 3px brand accent bar (owner, 2026-09-25:
 * brand orange is an accent, never a background wash).
 */
export function shellRowClass(active: boolean, collapsed: boolean): string {
  const bar = active
    ? "relative before:absolute before:left-0 before:top-1 before:bottom-1 before:w-[3px] before:rounded-full before:bg-brand-500 before:content-['']"
    : ''
  return collapsed
    ? `flex w-full justify-center py-2.5 transition-colors ${bar}
        ${active ? 'bg-warm-50 text-brand-500' : 'text-ink-3 hover:bg-warm-50 hover:text-ink'}`
    : `mx-2 my-0.5 flex w-[calc(100%-1rem)] items-center gap-3 rounded-md px-3 py-2 text-left text-[14px] transition-colors ${bar}
        ${active
          ? 'bg-warm-50 font-bold text-brand-500'
          : 'text-ink-2 hover:bg-warm-50 hover:text-ink'}`
}
