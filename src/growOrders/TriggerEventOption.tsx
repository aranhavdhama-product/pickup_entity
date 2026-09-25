/**
 * Readable rendering of an auto-pickup trigger event for `MenuSelect`
 * (owner, 2026-09-24): the human title only, with a small muted tag saying who
 * sees the event. The `entity::event` platform code is never shown in the
 * select — at most in the muted hint line under it. Shared by the local Pickup
 * settings page and the console Base Modules → Pickup Request page.
 */
import { triggerEventOf } from './fareyeEvents'

export function TriggerEventOption({ code, active }: { code: string; active?: boolean }) {
  const e = triggerEventOf(code)
  return (
    <span className="flex min-w-0 items-baseline justify-between gap-3">
      <span className={`truncate text-[13px] ${active ? 'font-bold text-brand-500' : 'text-ink'}`}>{e.title}</span>
      <span className="shrink-0 text-[11.5px] font-normal text-ink-3">{e.level === 'L1' ? 'customer-visible' : 'ops-only'}</span>
    </span>
  )
}
