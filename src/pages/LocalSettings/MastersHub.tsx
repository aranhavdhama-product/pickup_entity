/**
 * Masters (`/local/settings/masters`) — every master of the local app behind ONE settings entry (owner, 2026-10-09: "put all the
 * masters in one master setting and everything inside it"). A master's Back arrow returns here, not to the page that happened to
 * link to it. Nothing here touches the auth module or the staging proxy.
 */
import { useNavigate } from 'react-router-dom'
import { Barcode, Box, CalendarOff, ListX, Store } from 'lucide-react'
import { ListCard, PageHeader } from '../../nueva/components'

export default function MastersHub() {
  const navigate = useNavigate()
  return (
    <div className="p-6">
      <PageHeader title="Masters" subtitle="Everything the planner and the pickup module read from" onBack={() => navigate('/local/settings')} />
      <div className="grid max-w-3xl gap-3">
        <ListCard icon={<Store size={18} />} title="Merchant master"
          desc="Merchant locations collected on set days — the pickup schedules (runs, days, hub)."
          onClick={() => navigate('/local/settings/merchant-master')} />
        <ListCard icon={<Box size={18} />} title="Service & Order masters"
          desc="Service, package, consignment and slot types, VAS, sort codes, business parameters and pallet space."
          onClick={() => navigate('/local/settings/masters/service_order')} />
        <ListCard icon={<Barcode size={18} />} title="SKU master"
          desc="SKUs with category, dimensions, weight, HSN Code and Country of Origin."
          onClick={() => navigate('/local/settings/masters/service_order/sku')} />
        <ListCard icon={<CalendarOff size={18} />} title="Holiday master"
          desc="Hub working hours, weekly offs and holidays — they decide which days a pickup can fall on."
          onClick={() => navigate('/local/settings/masters/service_order/holiday-master')} />
        <ListCard icon={<ListX size={18} />} title="Reason master"
          desc="Failure and cancellation reasons, and the Reason Policy that decides what a failed pickup does."
          onClick={() => navigate('/local/settings/masters/service_order/reason-master')} />
      </div>
    </div>
  )
}
