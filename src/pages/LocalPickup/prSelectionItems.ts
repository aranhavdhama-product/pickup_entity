/**
 * The ONE selection menu for pickup-request rows (owner, 2026-09-25): the
 * `/local/pickup` grid and Pending for Planning offer the SAME 16 items, each
 * gated by the one matrix (`growOrders/prActions.prBulkState`) — enabled only
 * when allowed for EVERY selected request, else disabled with the reason.
 *
 * Icon-free on purpose: each page supplies its own glyph per action id (the
 * PFP replica draws only its extracted SVGs; the Pickup page uses lucide).
 * `prSelectionActions.tsx` `PrActionDialogs` renders the dialogs the items
 * open, so both pages share those too.
 */
import { toast } from '../../nueva/toast'
import { growOrderActions, pickupRequestById } from '../../growOrders/store'
import type { GrowOrdersDb, GrowPickupRequest } from '../../growOrders/types'
import type { PickupModuleConfig } from '../../config/pickupModule'
import { prBulkState, type PrAction } from '../../growOrders/prActions'
import { downloadCsv } from '../LocalPFP/adapter'
import { prCsv } from './prModel'

/** the dialogs a pickup-request selection opens */
export type PrDialog =
  | { kind: 'route' | 'plan' | 'carrier' | 'reschedule' | 'cancel' | 'fail'; prs: GrowPickupRequest[] }
  | { kind: 'add' | 'split' | 'manual' | 'handover'; pr: GrowPickupRequest }

export interface PrSelectionItem {
  /** the matrix action — pages key their glyphs on it */
  id: PrAction
  label: string
  disabled: boolean
  /** why it is disabled, shown under the item */
  reason?: string
  onClick?: () => void
}

/** The label of the routing action on a pickup request (owner, 2026-09-25). */
export const PLAN_PR_LABEL = 'Plan pickup request for routing'

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`

/**
 * The 16 items, in the Pickup page's order. `openDialog` receives what to open;
 * `clear` empties the page's selection once an item has run.
 */
export function prSelectionItems(sel: GrowPickupRequest[], { cfg, db, openDialog, clear }: {
  cfg: PickupModuleConfig
  db: GrowOrdersDb
  openDialog: (d: PrDialog) => void
  clear: () => void
}): PrSelectionItem[] {
  const ctx = { cfg, role: 'ops' as const, byId: pickupRequestById }
  const item = (id: PrAction, label: string, run: () => void): PrSelectionItem => {
    const st = prBulkState(id, sel, ctx)
    return { id, label, disabled: !st.enabled, reason: st.reason, onClick: st.enabled ? run : undefined }
  }
  const open = (kind: 'route' | 'plan' | 'carrier' | 'reschedule' | 'cancel' | 'fail') => () => { openDialog({ kind, prs: sel }); clear() }
  const one = (kind: 'add' | 'split' | 'manual' | 'handover') => () => { openDialog({ kind, pr: sel[0] }); clear() }
  const each = (fn: (p: GrowPickupRequest) => unknown, done: (n: number) => string) => () => {
    const n = sel.filter((p) => fn(p)).length
    if (n) toast.success(done(n)); else toast.error('Nothing changed.')
    clear()
  }
  return [
    item('planCollection', PLAN_PR_LABEL, open('plan')),
    item('addToRoute', 'Add to route', open('route')),
    item('assignCarrier', 'Assign carrier', open('carrier')),
    item('switchToFleet', 'Switch to fleet', each((p) => { growOrderActions.clearCarrier(p.id); return true },
      (n) => `${plural(n, 'request')} taken back from the carrier — add ${n === 1 ? 'it' : 'them'} to a route.`)),
    item('reschedule', 'Reschedule', open('reschedule')),
    item('addConsignments', 'Add consignments', one('add')),
    /* one request → choose which consignments move; several → each splits into
       one request per consignment (store.splitAllPickupRequests) */
    item('split', 'Split pickup request', sel.length === 1 ? one('split') : () => {
      const r = growOrderActions.splitAllPickupRequests(sel.map((p) => p.id))
      if (r.created.length) toast.success(`Split ${plural(r.split.length, 'request')} into ${r.split.length + r.created.length}.`)
      else toast.error('Nothing could be split.')
      clear()
    }),
    item('confirmSlot', 'Confirm slot', each((p) => growOrderActions.confirmPickupSlot(p.id),
      (n) => `Pickup slot confirmed for ${plural(n, 'request')}.`)),
    item('reattempt', 'Re-attempt now', each((p) => growOrderActions.reattemptPickupRequest(p.id),
      (n) => `${plural(n, 're-attempt')} raised.`)),
    item('markPickedUp', 'Mark picked up', one('manual')),
    item('markFailed', 'Mark Pickup Failed', open('fail')),
    item('closeHandover', 'Close handover', one('handover')),
    item('merge', 'Merge', () => {
      const r = growOrderActions.mergePickupRequests(sel.map((p) => p.id))
      if (r.ok) { toast.success(`Merged ${r.merged.join(', ')} into ${r.pr.number}.`); clear() }
      else toast.error(r.reason)
    }),
    item('printLabel', 'Print consolidated label', () => {
      toast.info(`Print Consolidated Label — ${plural(sel.length, 'request')} (demo)`); clear()
    }),
    item('cancel', 'Cancel', open('cancel')),
    item('downloadCsv', 'Download CSV', () => {
      downloadCsv('pickup-requests-selected.csv', prCsv(sel, db)); toast.success(`${plural(sel.length, 'row')} exported.`); clear()
    }),
  ]
}

