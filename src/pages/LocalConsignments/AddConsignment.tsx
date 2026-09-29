/**
 * `/local/consignments/add` (+ `/vehicle`) — the console's Add Consignment page.
 * Laid out exactly as staging's Add Order form (owner override, 2026-09-24;
 * see AddOrderPage): Order Category below VAS, a Merchant select, no checkout,
 * no drafts. The Grow merchant portal has its own form since 2026-09-25
 * (GrowOrders/MerchantOrderForm). The masters
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
      <AddOrderPage />
    </div>
  )
}
