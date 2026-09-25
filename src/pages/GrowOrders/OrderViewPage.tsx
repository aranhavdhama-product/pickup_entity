/**
 * Grow merchant portal — `/grow/orders/:id`.
 *
 * A thin host: the Shipments list with the console's View Consignment overlay
 * open on it, in the merchant reading — exactly what a row click on
 * `/grow/orders` shows (`?order=<id>`), so the two entry points never differ.
 * The overlay, its merchant filtering and the merchant actions (Book Pickup ·
 * Resume · Print Label · Cancel) live in `GrowConsignmentView`; closing it
 * lands on the list.
 */
import { useNavigate, useParams } from 'react-router-dom'
import OrdersListPage from './OrdersListPage'
import GrowConsignmentView from './GrowConsignmentView'

export default function OrderViewPage() {
  const { id = '' } = useParams()
  const nav = useNavigate()
  return (
    <>
      <OrdersListPage />
      <GrowConsignmentView orderId={id} onClose={() => nav('/grow/orders')} />
    </>
  )
}
