/** The dialogs behind the shared pickup-request selection menu (`prSelectionItems.ts`). */
import type { ReactNode } from 'react'
import type { GrowOrdersDb } from '../../growOrders/types'
import { handoverReconciled } from '../../growOrders/tabs'
import { AddToRouteDialog } from '../LocalControlTower/addToRouteDialog'
import {
  AddConsignmentsDialog, AssignCarrierDialog, CloseHandoverDialog, ManualPickupDialog, ReasonDialog, RescheduleDialog,
} from './dialogs'
import { SplitPickupDialog } from './bookingCards'
import { merchantOfPr } from './prModel'
import type { PrDialog } from './prSelectionItems'

/** The dialogs behind the items — render once per page. */
export function PrActionDialogs({ dialog, db, onClose }: {
  dialog: PrDialog | null
  db: GrowOrdersDb
  onClose: () => void
}): ReactNode {
  if (!dialog) return null
  const close = onClose
  switch (dialog.kind) {
    case 'route': case 'plan':
      return <AddToRouteDialog prIds={dialog.prs.map((p) => p.id)} initialWay={dialog.kind === 'plan' ? 'plan' : undefined} onClose={close} onDone={close} />
    case 'add': return <AddConsignmentsDialog pr={dialog.pr} onClose={close} onDone={close} />
    case 'split': return <SplitPickupDialog pr={dialog.pr} merchantCode={merchantOfPr(dialog.pr, db.stores)} onClose={close} onDone={close} />
    case 'manual': return <ManualPickupDialog pr={dialog.pr} onClose={close} onDone={close} />
    case 'handover': return <CloseHandoverDialog pr={dialog.pr} reconciled={handoverReconciled(dialog.pr)} onClose={close} onDone={close} />
    case 'carrier': return <AssignCarrierDialog prs={dialog.prs} onClose={close} onDone={close} />
    case 'reschedule': return <RescheduleDialog prs={dialog.prs} onClose={close} onDone={close} />
    case 'cancel': case 'fail': return <ReasonDialog kind={dialog.kind} prs={dialog.prs} onClose={close} onDone={close} />
  }
}
