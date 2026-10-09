/**
 * LOCAL app → Settings landing (`/local/settings`).
 *
 * The settings this session-less app can own: the Pending for Planning column
 * configuration (`/local/columns`), the Pickup Request module config
 * (`/local/settings/pickup`, persisted to the localStorage mirror in
 * `src/config/pickupModule`), General Settings (`/local/settings/general`,
 * `src/config/generalSettings`) and the Consignment Order module
 * (`/local/settings/consignment-order`, `src/config/consignmentModule`). The Service & Order masters
 * (`/local/settings/masters/service_order`, `ServiceOrderMasters.tsx`) reuse the console
 * Masters pages on local sample rows. Nothing here touches the auth module or the staging proxy.
 */
import { useNavigate } from 'react-router-dom'
import { Box, Columns3, Package, SlidersHorizontal, Truck } from 'lucide-react'
import { ListCard, PageHeader } from '../../nueva/components'

export default function LocalSettings() {
  const navigate = useNavigate()
  return (
    <div className="p-6">
      <PageHeader title="Settings" subtitle="Configuration for the local Delivery Management app" />
      <div className="grid max-w-3xl gap-3">
        <ListCard icon={<Columns3 size={18} />} title="Column configuration"
          desc="Columns, filters and their order on the Pending for Planning listing."
          onClick={() => navigate('/local/columns')} />
        <ListCard icon={<Truck size={18} />} title="Pickup module"
          desc="Turn pickups on or off, choose who books them and set the booking rules."
          onClick={() => navigate('/local/settings/pickup')} />
        <ListCard icon={<SlidersHorizontal size={18} />} title="General Settings"
          desc="Account-wide defaults: order view, splitting, scanning, task type and inbound stage."
          onClick={() => navigate('/local/settings/general')} />
        <ListCard icon={<Package size={18} />} title="Consignment Order"
          desc="User types, the default date filter, and the listing's columns and filters with their sequence."
          onClick={() => navigate('/local/settings/consignment-order')} />
        <ListCard icon={<Box size={18} />} title="Masters"
          desc="Merchant master, Service & Order masters, SKU, Holiday and Reason masters — all in one place."
          onClick={() => navigate('/local/settings/masters')} />
      </div>
    </div>
  )
}
