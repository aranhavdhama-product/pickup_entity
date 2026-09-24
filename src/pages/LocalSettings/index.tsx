/**
 * LOCAL app → Settings landing (`/local/settings`).
 *
 * The settings this session-less app can own: the Pending for Planning column
 * configuration (`/local/columns`) and the Pickup Request module config
 * (`/local/settings/pickup`, persisted to the localStorage mirror in
 * `src/config/pickupModule`). Nothing here touches the auth module or the staging proxy.
 */
import { useNavigate } from 'react-router-dom'
import { Columns3, Truck } from 'lucide-react'
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
        <ListCard icon={<Truck size={18} />} title="Pickup Request"
          desc="Whether pickups run, and how requests are raised — auto or manual."
          onClick={() => navigate('/local/settings/pickup')} />
      </div>
    </div>
  )
}
