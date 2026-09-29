/**
 * The merchant's View Consignment — the console overlay (`LocalConsignments/
 * ConsignmentView`) rendered with `audience="merchant"`, its body replaced by
 * the merchant order form read back (`merchantConsignmentSections.tsx`), plus
 * the merchant's own actions in its header. ONE host for both entry points, so they never
 * disagree: the Shipments row click (`/grow/orders?order=<id>`) and the order
 * page (`/grow/orders/:id`).
 *
 * Actions follow the Shipments list's rules (`OrdersListPage` bulk actions):
 * Book Pickup = manual mode + FarEye's schedule rule (`canSchedulePickup`);
 * Resume = drafts; Print Label = not a draft; Cancel = not closed and not
 * inside a pickup the driver already owns (else the support line) — a draft is
 * discarded, a live shipment cancelled.
 */
import { useNavigate } from 'react-router-dom'
import { useMemo, useState } from 'react'
import { Pencil, Printer, Truck, X } from 'lucide-react'
import { useMasters } from '../../growOrders/masters'
import { growOrderActions, useGrowOrders } from '../../growOrders/store'
import { isOpenPr } from '../../growOrders/tabs'
import { usePickupModuleConfig } from '../../config/pickupModule'
import { planningActions, usePlanning } from '../LocalPFP/planningStore'
import { canSchedulePickup, type LocalConsignmentRow } from '../LocalPFP/adapter'
import { Button } from '../../nueva/components'
import { toast } from '../../nueva/toast'
import ConsignmentView from '../LocalConsignments/ConsignmentView'
import { BookPickupDialog } from './pickupDialog'
import { CONTACT_SUPPORT, merchantMayChange, usePortalMerchant } from './pickupGate'
import { toShipmentRow } from './shipmentRows'
import { merchantReadSections } from './merchantConsignmentSections'
import { RaiseDisputeButton } from './DisputesPage'
import { PayNowButton } from './paymentSheet'

const CLOSED_STATES = ['Delivered', 'Cancelled']

export default function GrowConsignmentView({ orderId, onClose }: { orderId: string; onClose: () => void }) {
  const db = useGrowOrders()
  const plan = usePlanning()
  useMasters()
  const nav = useNavigate()
  const merchant = usePortalMerchant()
  const pickupCfg = usePickupModuleConfig()
  const manualPickup = pickupCfg.enabled && pickupCfg.mode === 'manual'
  const [book, setBook] = useState(false)

  const o = db.orders.find((x) => x.id === orderId) ?? null
  const row = useMemo(() => (o ? toShipmentRow(o, db, plan) : null), [o, db, plan])

  let actions = null
  if (row && o) {
    const closed = CLOSED_STATES.includes(row.state)
    const pr = db.pickupRequests.find((p) => p.id === o.pickupRequestId)
    const locked = !!pr && isOpenPr(pr.status) && !merchantMayChange(pr, merchant.config)
    const bookable = manualPickup && !row.draft && canSchedulePickup(o, db.pickupRequests)
    const cancel = () => {
      if (locked) { toast.info(CONTACT_SUPPORT); return }
      if (row.draft) {
        growOrderActions.remove([o.id])
        toast.success('Draft discarded.')
        onClose()
        return
      }
      growOrderActions.cancelOrder(o.id)
      planningActions.cancel([o.id], 'Cancelled by the merchant')
      toast.success(`${row.consignmentNumber} cancelled.`)
    }
    actions = (
      <>
        {bookable && <Button icon={<Truck size={15} />} onClick={() => setBook(true)}>Book Pickup</Button>}
        {row.draft && <Button icon={<Pencil size={15} />} onClick={() => nav(`/grow/orders/add?draft=${o.id}`)}>Resume</Button>}
        {!row.draft && (
          <Button variant="outline" icon={<Printer size={15} />}
            onClick={() => toast.info('Demo only — label generation is a platform service, not a local one.')}>Print Label</Button>
        )}
        {/* Payments (2026-09-25): shows only while the order still has a pending debit */}
        {!row.draft && <PayNowButton orderId={o.id} />}
        {/* Disputes (2026-09-25): a booked consignment can raise a tracking query */}
        {!row.draft && <RaiseDisputeButton orderId={o.id} />}
        {!closed && (
          <span title={locked ? CONTACT_SUPPORT : undefined}>
            <Button variant="outline" icon={<X size={15} />} onClick={cancel}>{row.draft ? 'Discard Draft' : 'Cancel Shipment'}</Button>
          </span>
        )}
      </>
    )
  }

  return (
    <>
      {/* a ShipmentRow is the console row with a wider `state` (it adds `Draft`) — the overlay only prints it */}
      <ConsignmentView row={row as unknown as LocalConsignmentRow | null} onClose={onClose} audience="merchant" actions={actions}
        readSections={row && o ? merchantReadSections(row, o) : undefined} />
      {/* the overlay sits at z-61; lift the booking dialog above it */}
      {book && o && (
        <div className="relative z-[70]">
          <BookPickupDialog orders={[o]} stores={db.stores} onClose={() => setBook(false)} onBooked={() => setBook(false)} />
        </div>
      )}
    </>
  )
}
