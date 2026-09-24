/**
 * `/local/consignments/add` (+ `/vehicle`) — the console's Add Consignment page.
 * The SAME form as the merchant portal (one component set, spec §15) in the
 * console shell, with the console-only additions the form's `portal` prop
 * switches on (Order Category below VAS, no checkout, no drafts). The masters
 * are loaded here because the Grow layout, which normally does it, is not
 * mounted on this side.
 */
import { useEffect } from 'react'
import AddOrderPage from '../GrowOrders/AddOrderPage'
import { loadMasters } from '../../growOrders/masters'

export default function LocalAddConsignment() {
  useEffect(() => { void loadMasters() }, [])
  return (
    <div className="px-6 pb-10 pt-2">
      <AddOrderPage portal="console" />
    </div>
  )
}
