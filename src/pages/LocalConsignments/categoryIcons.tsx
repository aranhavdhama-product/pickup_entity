/**
 * The category icons of a consignment (VIP · Stackable · Hazmat · Fragile · Heavy Weight) as small round discs —
 * the Consignment Order grid's leading column on both portals, matching Pending For Planning's icon column
 * (owner, 2026-10-08). At most three discs, the rest as "+n" with every name on its tooltip.
 */
import { Biohazard, Dumbbell, Layers, Star, Wine, type LucideIcon } from 'lucide-react'
import type { CategoryFlag } from '../LocalPFP/adapter'

const ICON: Record<CategoryFlag, LucideIcon> = {
  VIP: Star, Stackable: Layers, Hazmat: Biohazard, Fragile: Wine, 'Heavy Weight': Dumbbell,
}
const MAX = 3

export function CategoryIcons({ flags }: { flags: readonly CategoryFlag[] }) {
  if (!flags.length) return <span className="text-ink-3">—</span>
  const shown = flags.length > MAX ? flags.slice(0, MAX - 1) : flags
  const rest = flags.slice(shown.length)
  return (
    <span className="inline-flex items-center gap-1" title={flags.join(', ')}>
      {shown.map((f) => {
        const Icon = ICON[f]
        return (
          <span key={f} title={f} aria-label={f}
            className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-warm-100 text-ink-2">
            <Icon size={14} />
          </span>
        )
      })}
      {rest.length > 0 && (
        <span title={rest.join(', ')} className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-warm-100 px-1 text-[11px] font-bold text-ink-2">
          +{rest.length}
        </span>
      )}
    </span>
  )
}
