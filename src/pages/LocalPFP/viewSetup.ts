/**
 * Pending For Planning — how each tab opens (owner, 2026-10-08: "a toggle hidden discreetly … what I save is saved on the
 * server and visible to all, this demo is seen by a lot of people").
 *
 *   all        — what All lists: its consignments (default) or the pickup requests
 *   firstMile  — what First Mile lists: the pickup requests (default) or their consignments
 *   grouped    — consignments under a header row per pickup request
 *
 * One localStorage value, kept in step with the server copy by `LocalConsignments/formSync.ts` (the key is in its
 * SETUP_KEYS), so every visitor opens the page the way it was last saved. A `?view=` / `?group=` in the URL still
 * overrides it for that visit (deep links). Pure module — nothing from src/auth.
 */
import { useState } from 'react'

export const PFP_VIEW_KEY = 'pfp-view-setup-v1'
export const PFP_COLUMNS_PICKUP_KEY = 'pfp-columns-pickup-v1'
export const PFP_COLUMNS_CONSIGNMENT_KEY = 'pfp-columns-consignment-v1'

export interface PfpViewSetup {
  all: 'consignments' | 'pickups'
  firstMile: 'pickups' | 'consignments'
  grouped: boolean
}
export const DEFAULT_VIEW_SETUP: PfpViewSetup = { all: 'consignments', firstMile: 'pickups', grouped: true }

export function readViewSetup(): PfpViewSetup {
  try {
    const raw = window.localStorage.getItem(PFP_VIEW_KEY)
    const v = raw ? (JSON.parse(raw) as Partial<PfpViewSetup>) : null
    if (v && typeof v === 'object') {
      return {
        all: v.all === 'pickups' ? 'pickups' : 'consignments',
        firstMile: v.firstMile === 'consignments' ? 'consignments' : 'pickups',
        grouped: v.grouped !== false,
      }
    }
  } catch { /* the default */ }
  return DEFAULT_VIEW_SETUP
}

export function useViewSetup(): [PfpViewSetup, (patch: Partial<PfpViewSetup>) => void] {
  const [vs, setVs] = useState<PfpViewSetup>(readViewSetup)
  const update = (patch: Partial<PfpViewSetup>) => {
    const next = { ...vs, ...patch }
    setVs(next)
    try { window.localStorage.setItem(PFP_VIEW_KEY, JSON.stringify(next)) } catch { /* ignore */ }
  }
  return [vs, update]
}
