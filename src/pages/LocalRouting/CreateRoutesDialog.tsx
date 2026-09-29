/**
 * Create New Routes — staging's modal, field for field (owner override, see index.tsx):
 * City* · Hubs* · Merchant Code · Sort Code · Tags · Select order from* (start → end) ·
 * the credits line · Cancel · Initiate Routing. The run routes on the hub's Vehicle
 * Config (staging asks no vehicles here) and dispatches on the window's END date.
 *
 * THE ONE ADDITION: "Plan for" (First Mile · Last Mile · Both) while the pickup module is
 * on; off, the question is absent and the run plans deliveries only, as staging does.
 */
import { useMemo, useState } from 'react'
import { Button, DateInput, MenuSelect, MultiSelect } from '../../nueva/components'
import { usePickupModuleConfig } from '../../config/pickupModule'
import { HUB_CITIES, cityOfHub, useVehicleConfig, vehiclesForHub } from '../../config/vehicleConfig'
import { useGrowOrders } from '../../growOrders/store'
import { daysFromNow } from '../../growOrders/tabs'
import { usePlanning } from '../LocalPFP/planningStore'
import { SmallModal, StackField } from './stagingBits'
import { PLAN_FOR, PLAN_FOR_LABEL, candidatesFor, initiateRouting, type PlanFor, type RoutingPlan } from './routingPlans'

const HUBS = Object.keys(HUB_CITIES)

export default function CreateRoutesDialog({ initialHub, onClose, onDone }: {
  initialHub: string
  onClose: () => void
  onDone: (p: RoutingPlan) => void
}) {
  const db = useGrowOrders()
  const plan = usePlanning()
  const fleet = useVehicleConfig().vehicles
  const pickupOn = usePickupModuleConfig().enabled

  const [city, setCity] = useState(initialHub ? cityOfHub(initialHub) : '')
  const [hub, setHub] = useState(initialHub)
  const [merchant, setMerchant] = useState('')
  const [sortCode, setSortCode] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [planFor, setPlanFor] = useState<PlanFor>('BOTH')
  /* staging leaves the window blank; prefilled here so the demo seed (orders over
     the last months, pickups over the next days) is routable in one click */
  const [orderFrom, setOrderFrom] = useState(() => daysFromNow(-90))
  const [orderTo, setOrderTo] = useState(() => daysFromNow(1))

  const effective: PlanFor = pickupOn ? planFor : 'LM'
  const vehicles = useMemo(() => vehiclesForHub(hub, fleet), [hub, fleet])
  const candidates = useMemo(() => (hub
    ? candidatesFor(db, plan, { hubCode: hub, orderFrom, orderTo, planFor: effective, merchant, tags, pickupOn })
    : []), [db, plan, hub, orderFrom, orderTo, effective, merchant, tags, pickupOn])
  const merchants = [...new Set(db.orders.filter((o) => o.inboundHubCode === hub).map((o) => o.storeCode))].sort()
  const allTags = [...new Set(db.orders.flatMap((o) => o.tags ?? []))].sort()
  const canRun = !!city && !!hub && !!orderFrom && !!orderTo && candidates.length > 0 && vehicles.length > 0

  const run = () => {
    if (!canRun) return
    onDone(initiateRouting({ hubCode: hub, dispatchDate: orderTo, orderFrom, orderTo, planFor: effective, vehicles, candidates }))
  }

  /* staging shows no preview; only say why Initiate Routing stays disabled */
  const hint = !hub ? '' : !vehicles.length ? 'No vehicles in Vehicle Config for this hub.'
    : !candidates.length ? 'No orders to route for this hub and window.' : ''

  return (
    <SmallModal title="Create New Routes" onClose={onClose} footer={<>
      <div className="mr-auto leading-tight">
        <p className="text-[13px] font-bold text-st-success">500k credits</p>
        <p className="text-[12px] text-ink-2">Today's Credits</p>
      </div>
      <Button variant="outline" onClick={onClose}>Cancel</Button>
      <Button onClick={run} disabled={!canRun}>Initiate Routing</Button>
    </>}>
      <StackField label="City" required>
        <MenuSelect value={city} placeholder="Select City" options={[...new Set(Object.values(HUB_CITIES))]}
          onChange={(v) => { setCity(v); setHub(''); setMerchant('') }} />
      </StackField>
      <StackField label="Hubs" required>
        {city ? (
          <MenuSelect value={hub} placeholder="Select Hub" options={HUBS.filter((h) => cityOfHub(h) === city)}
            onChange={(v) => { setHub(v); setMerchant('') }} />
        ) : <div className="flex h-8 items-center rounded-md border border-line bg-warm-50 px-3 text-[13px] text-ink-3">Select Hub</div>}
      </StackField>
      <StackField label="Merchant Code">
        <MenuSelect value={merchant} placeholder="Select Merchant Code" options={merchants} searchable
          labels={(c) => db.stores.find((s) => s.code === c)?.name ?? c} onChange={setMerchant} />
      </StackField>
      <StackField label="Sort Code">
        <MenuSelect value={sortCode} placeholder="Select Sort Code" options={[]} onChange={setSortCode} />
      </StackField>
      <StackField label="Tags">
        <MultiSelect value={tags} options={allTags} placeholder="Select Tag" onChange={setTags} />
      </StackField>
      {pickupOn && (
        <StackField label="Plan for" required>
          {/* pill selector (owner): one group, one selected — brand outline + brand-50 fill */}
          <div role="radiogroup" aria-label="Plan for" className="flex flex-wrap gap-2">
            {PLAN_FOR.map((p) => {
              const on = p === planFor
              return (
                <button key={p} type="button" role="radio" aria-checked={on} onClick={() => setPlanFor(p)}
                  className={`h-8 rounded-full border px-4 text-[13px] transition-colors ${on
                    ? 'border-ink bg-warm-50 font-bold text-ink'
                    : 'border-line bg-surface text-ink-2 hover:border-warm-300 hover:text-ink'}`}>
                  {PLAN_FOR_LABEL[p]}
                </button>
              )
            })}
          </div>
        </StackField>
      )}
      <StackField label="Select order from" required>
        <div className="grid grid-cols-2 gap-2">
          <DateInput value={orderFrom} onChange={setOrderFrom} placeholder="Start Date" />
          <DateInput value={orderTo} onChange={setOrderTo} placeholder="End Date" />
        </div>
      </StackField>
      {hint && <p className="-mt-1 mb-1 text-[12px] text-st-danger">{hint}</p>}
    </SmallModal>
  )
}
