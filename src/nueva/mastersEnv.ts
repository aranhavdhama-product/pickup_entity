/* Where the Masters pages (`pages.tsx`) are mounted. Default = the console
   (`/console/settings/masters`, in-memory rows). The LOCAL app
   (src/pages/LocalSettings/ServiceOrderMasters.tsx) re-mounts them under its own
   base with a fixed category and a localStorage-backed `persist` — behaviour
   only, the markup is unchanged. No React components, no fetch, no src/auth. */
import { createContext } from 'react'
import type { SubMaster } from './mastersTree'

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- rows are the untyped sample records of mastersTree
export type MasterRow = Record<string, any>
export type MastersPersist = {
  load: (subId: string) => MasterRow[] | null
  save: (subId: string, rows: MasterRow[]) => void
  /** row → form values (Edit prefill) */
  toValues: (sub: SubMaster, row: MasterRow) => MasterRow
  /** form values → insert (no rowId) or update the stored row */
  upsert: (sub: SubMaster, values: MasterRow, rowId?: string) => void
}
export type MastersEnv = { base: string; backTo?: string; catId?: string; persist?: MastersPersist }
export const MastersEnvContext = createContext<MastersEnv>({ base: '/console/settings/masters' })
