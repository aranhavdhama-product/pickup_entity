import { Check, PackageCheck, ScanLine } from 'lucide-react'
import { Btn, Card, Chip, ProgressBar, Screen, SwipeButton, TopBar } from './ui'
import { phoneToast } from './phoneToast'
import { orderById } from '../../growOrders/store'
import type { LocalTrip } from '../LocalPFP/planningStore'

/** Load the vehicle: every delivery stop's consignment is scanned onto the van. Pickups load at the door. */
export default function LoadingScreen({ trip, loaded, checklistDone, onToggle, onLoadAll, onBack, onChecklist, onStart }: {
  trip: LocalTrip
  loaded: string[]
  checklistDone: boolean
  onToggle: (orderId: string) => void
  onLoadAll: () => void
  onBack: () => void
  onChecklist: () => void
  onStart: () => void
}) {
  const drops = trip.stops.filter((x) => x.kind === 'delivery' && x.orderId)
  const n = drops.filter((x) => loaded.includes(x.orderId as string)).length
  const pickups = trip.stops.length - drops.length
  const ready = n === drops.length && checklistDone
  return (
    <Screen
      header={<TopBar title="Loading" sub={trip.vehicle ? `${trip.id} · ${trip.vehicle}` : trip.id} onBack={onBack} />}
      footer={<>
        {!checklistDone && (
          <button type="button" onClick={onChecklist} className="mb-2 block w-full text-center text-[13px] font-bold text-[#2F6FB5]">
            Complete the checklist first →
          </button>
        )}
        {checklistDone && n < drops.length && <div className="mb-2 text-center text-[13px] text-[#5B6B82]">{drops.length - n} consignments still to load</div>}
        <SwipeButton label="Start Trip" disabled={!ready} onConfirm={onStart} />
      </>}
      bodyClass="px-4 pb-4"
    >
      <Card className="mt-4">
        <div className="flex items-center justify-between">
          <span className="text-[15px] font-bold text-[#1B2A41]">{n} of {drops.length} loaded</span>
          {drops.length > 0 && n < drops.length && <Btn tone="ghost" size="sm" onClick={onLoadAll}>Load all</Btn>}
        </div>
        <div className="mt-2"><ProgressBar value={n} max={drops.length || 1} /></div>
        {pickups > 0 && <div className="mt-3 text-[13px] text-[#5B6B82]">+ {pickups} pick up stop{pickups === 1 ? '' : 's'} — parcels are scanned at the merchant's door.</div>}
      </Card>
      <button type="button" onClick={() => phoneToast('Camera scan is mocked — tap a consignment to scan it')}
        className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-[#C3CCD8] bg-white text-[15px] font-bold text-[#2F6FB5]">
        <ScanLine size={18} /> Scan consignment
      </button>
      {!drops.length && <div className="mt-6 text-center text-[15px] text-[#5B6B82]">Nothing to load — this trip only collects.</div>}
      <div className="mt-3 flex flex-col gap-2">
        {drops.map((x) => {
          const o = orderById(x.orderId as string)
          const on = loaded.includes(x.orderId as string)
          return (
            <Card key={x.orderId} onClick={() => onToggle(x.orderId as string)} pad="tight">
              <div className="flex items-center gap-3">
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${on ? 'bg-[#1F9D55] text-white' : 'bg-[#F4F6F9] text-[#8A97AB]'}`}>
                  {on ? <Check size={18} strokeWidth={3} /> : <PackageCheck size={18} />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[15px] font-bold text-[#1B2A41]">{x.orderNumber}</div>
                  <div className="truncate text-[13px] text-[#5B6B82]">Stop {x.seq} · {o?.receiver.name || x.address}</div>
                </div>
                <Chip tone={on ? 'green' : 'grey'}>{on ? 'Loaded' : 'To load'}</Chip>
              </div>
            </Card>
          )
        })}
      </div>
    </Screen>
  )
}
