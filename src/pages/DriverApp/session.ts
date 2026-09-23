/**
 * The logged-in driver — the only state the Pilot prototype owns. Trips, stops
 * and pickup requests all live in planningStore / the Grow store; this file
 * only remembers WHO is holding the phone and which checklists they saved.
 *
 * "Remember me" off = the session lives in memory for this tab only.
 */
import { useSyncExternalStore } from 'react'

export const DRIVER_SESSION_KEY = 'fareye-driver-session-v1'
export const DEFAULT_DRIVER = 'Alex Grey'

export interface DriverSession {
  driver: string | null
  remember: boolean
  /** tripId → the pre-trip checklist was saved */
  checklist: Record<string, boolean>
}

const EMPTY: DriverSession = { driver: null, remember: true, checklist: {} }

function load(): DriverSession {
  try {
    const raw = localStorage.getItem(DRIVER_SESSION_KEY)
    if (!raw) return EMPTY
    const p = JSON.parse(raw) as Partial<DriverSession>
    return {
      driver: typeof p.driver === 'string' && p.driver ? p.driver : null,
      remember: p.remember !== false,
      checklist: p.checklist && typeof p.checklist === 'object' ? p.checklist : {},
    }
  } catch {
    return EMPTY
  }
}

let state: DriverSession = load()
const subs = new Set<() => void>()

function commit(next: DriverSession) {
  state = next
  try {
    if (next.remember && next.driver) localStorage.setItem(DRIVER_SESSION_KEY, JSON.stringify(next))
    else localStorage.removeItem(DRIVER_SESSION_KEY)
  } catch { /* storage blocked — the tab keeps the in-memory copy */ }
  subs.forEach((f) => f())
}

export function useDriverSession(): DriverSession {
  return useSyncExternalStore((cb) => { subs.add(cb); return () => subs.delete(cb) }, () => state)
}

export const sessionActions = {
  login(driver: string, remember: boolean) { commit({ ...state, driver, remember }) },
  logout() { commit({ ...EMPTY, remember: state.remember }) },
  saveChecklist(tripId: string) { commit({ ...state, checklist: { ...state.checklist, [tripId]: true } }) },
}
