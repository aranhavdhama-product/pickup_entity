/**
 * "Add To Best Route" for pickup requests, straight from a list — no popup (owner, 2026-10-09). For each hub in the selection the
 * system picks the open route (Un-assigned / Yet to start) that fits best — same day first, then nearest date, then the fewest stops —
 * and adds the requests to it. Every refusal keeps its reason (wrong day, held, a vehicle dedicated to another merchant …).
 * The same rule the Add-to-route dialog's first tab shows before you confirm. No React, no auth.
 */
import { toast } from '../../nueva/toast'
import { isOpenPr } from '../../growOrders/tabs'
import type { GrowPickupRequest } from '../../growOrders/types'
import { pickupTripBlock, planningActions, planningSnapshot } from '../LocalPFP/planningStore'

const dayGap = (a: string, b: string) =>
  Math.abs(new Date(`${a}T00:00:00`).getTime() - new Date(`${b}T00:00:00`).getTime()) / 86_400_000

export function addPickupsToBestRoute(prs: GrowPickupRequest[]): boolean {
  const open = prs.filter((p) => isOpenPr(p.status))
  if (!open.length) { toast.error('None of the selected requests is open — nothing to route.'); return false }
  const byHub = new Map<string, GrowPickupRequest[]>()
  for (const p of open) { const h = p.destinationCode ?? p.storeCode; byHub.set(h, [...(byHub.get(h) ?? []), p]) }
  const added: string[] = [], notes: string[] = []
  for (const [hub, group] of byHub) {
    const first = group[0]
    const riding = group.every((p) => p.tripId === group[0].tripId) ? group[0].tripId : null
    const best = planningSnapshot().trips
      .filter((t) => (t.status === 'Un-assigned' || t.status === 'Yet to start') && t.hubCode === hub && t.id !== riding)
      .filter((t) => group.every((p) => !pickupTripBlock(t.id, p.id)))
      .sort((a, b) => {
        const ga = dayGap(a.date, first.date), gb = dayGap(b.date, first.date)
        return ga !== gb ? ga - gb : a.stops.length - b.stops.length
      })[0]
    if (!best) { notes.push(`No open route fits at ${hub} — use Manual to create one.`); continue }
    for (const p of group) {
      const why = planningActions.addPickupToTripOrReason(best.id, p.id)
      if (why) notes.push(why); else added.push(`${p.number} → ${best.id}`)
    }
  }
  if (!added.length) { toast.error(notes[0] ?? 'Nothing could be added.'); return false }
  toast.success(`${added.join(', ')} — see Control Tower → Trips.${notes.length ? ` Not added: ${notes.join(' ')}` : ''}`)
  return true
}
