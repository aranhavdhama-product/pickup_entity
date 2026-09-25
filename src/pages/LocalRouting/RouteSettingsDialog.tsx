/**
 * Route Settings — staging's modal (owner override, see index.tsx), per City → Hub:
 * Route Goal · Multipart Order · Type · Calculation · Service Time · Return to Start
 * Location · Break Type / Time · Optimize Route Start Location · Fence-Wise Settings ·
 * Advanced Settings (Traffic Condition · Stop Interval · Vehicle leave by time · Loading
 * Time) · Cancel · Save Settings. Saved locally per hub; the deterministic sequencer does
 * not read them (there is no routing engine in the local app).
 */
import { useState } from 'react'
import { Button, Checkbox, Input, MenuSelect, Toggle } from '../../nueva/components'
import { toast } from '../../nueva/toast'
import { asRecord, createLocalConfigStore } from '../../config/localConfigStore'
import { HUB_CITIES, cityOfHub } from '../../config/vehicleConfig'
import { RadioRow, Segmented, SmallModal } from './stagingBits'

interface RouteSettings {
  goal: 'Balance' | 'Utilise'; multipart: boolean; type: 'Fixed' | 'Adaptive'
  calculation: 'Incremental' | 'Aggregate' | 'Fixed'; serviceTime: 'Smart' | 'Order' | 'Custom'
  returnToStart: boolean; returnScope: 'All Vehicles' | 'Per Fence' | 'Per Vehicle Type'
  breakType: 'Time' | 'Duration'; breakStart: string; breakEnd: string; optimizeStart: boolean
  traffic: 'Fast' | 'Slow'; stopInterval: string; leaveByTime: boolean; loadingTime: string
}
const DEFAULTS: RouteSettings = {
  goal: 'Utilise', multipart: true, type: 'Adaptive', calculation: 'Aggregate', serviceTime: 'Order',
  returnToStart: true, returnScope: 'All Vehicles', breakType: 'Time', breakStart: '00:00', breakEnd: '00:00',
  optimizeStart: false, traffic: 'Fast', stopInterval: '', leaveByTime: false, loadingTime: '',
}
const store = createLocalConfigStore<{ byHub: Record<string, RouteSettings> }>('local-route-settings-v1', { byHub: {} },
  (raw) => ({ byHub: asRecord(asRecord(raw).byHub) as Record<string, RouteSettings> }))

const HUBS = Object.keys(HUB_CITIES)

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[220px_1fr] items-center gap-4 py-2.5">
      <span className="text-[13px] text-ink">{label}</span>
      <div>{children}</div>
    </div>
  )
}

export default function RouteSettingsDialog({ initialHub, onClose }: { initialHub: string; onClose: () => void }) {
  const [hub, setHub] = useState(initialHub || HUBS[0])
  const [s, setS] = useState<RouteSettings>(() => ({ ...DEFAULTS, ...store.read().byHub[initialHub || HUBS[0]] }))
  const set = (p: Partial<RouteSettings>) => setS((x) => ({ ...x, ...p }))
  const pickHub = (h: string) => { setHub(h); setS({ ...DEFAULTS, ...store.read().byHub[h] }) }
  const save = () => {
    store.write({ byHub: { ...store.read().byHub, [hub]: s } })
    toast.success(`Route settings saved for ${hub}.`)
    onClose()
  }

  return (
    <SmallModal title="Route Settings" width={800} onClose={onClose} footer={<>
      <span className="mr-auto" />
      <Button variant="outline" onClick={onClose}>Cancel</Button>
      <Button onClick={save}>Save Settings</Button>
    </>}>
      <div className="max-h-[62vh] overflow-y-auto pr-1">
        <Row label="City">
          <div className="w-[252px]"><MenuSelect value={cityOfHub(hub)} options={[...new Set(Object.values(HUB_CITIES))]}
            onChange={(c) => pickHub(HUBS.find((h) => cityOfHub(h) === c) ?? hub)} /></div>
        </Row>
        <Row label="Hub">
          <div className="w-[252px]"><MenuSelect value={hub} options={HUBS.filter((h) => cityOfHub(h) === cityOfHub(hub))} onChange={pickHub} /></div>
        </Row>
        <Row label="Route Goal"><RadioRow value={s.goal} options={['Balance', 'Utilise'] as const} onChange={(goal) => set({ goal })} /></Row>
        <Row label="Multipart Order"><Checkbox checked={s.multipart} onChange={(multipart) => set({ multipart })} label="Allow" /></Row>
        <Row label="Type"><RadioRow value={s.type} options={['Fixed', 'Adaptive'] as const} onChange={(type) => set({ type })} /></Row>
        <Row label="Calculation"><RadioRow value={s.calculation} options={['Incremental', 'Aggregate', 'Fixed'] as const} onChange={(calculation) => set({ calculation })} /></Row>
        <Row label="Service Time"><RadioRow value={s.serviceTime} options={['Smart', 'Order', 'Custom'] as const} onChange={(serviceTime) => set({ serviceTime })} /></Row>
        <Row label="Return to Start Location">
          <div className="flex flex-col items-start gap-3">
            <Toggle checked={s.returnToStart} onChange={(returnToStart) => set({ returnToStart })} />
            {s.returnToStart && <Segmented value={s.returnScope} options={['All Vehicles', 'Per Fence', 'Per Vehicle Type'] as const} onChange={(returnScope) => set({ returnScope })} />}
          </div>
        </Row>
        <Row label="Break Type*"><RadioRow value={s.breakType} options={['Time', 'Duration'] as const} onChange={(breakType) => set({ breakType })} /></Row>
        <Row label="Break Time">
          <span className="flex items-center gap-2">
            <span className="w-[110px]"><Input type="time" value={s.breakStart} onChange={(breakStart) => set({ breakStart })} /></span>
            –
            <span className="w-[110px]"><Input type="time" value={s.breakEnd} onChange={(breakEnd) => set({ breakEnd })} /></span>
          </span>
        </Row>
        <Row label="Optimize Route Start Location"><Checkbox checked={s.optimizeStart} onChange={(optimizeStart) => set({ optimizeStart })} label="Allow" /></Row>
        <p className="mt-3 border-t border-line pt-3 text-[15px] font-bold text-ink">Fence-Wise Settings</p>
        <Row label="Fence"><span className="text-[13px] text-ink-2">{hub}</span></Row>
        <p className="mt-3 border-t border-line pt-3 text-[15px] font-bold text-ink">Advanced Settings</p>
        <Row label="Traffic Condition"><RadioRow value={s.traffic} options={['Fast', 'Slow'] as const} onChange={(traffic) => set({ traffic })} /></Row>
        <Row label="Stop Interval"><div className="w-[160px]"><Input value={s.stopInterval} onChange={(stopInterval) => set({ stopInterval })} placeholder="mins" /></div></Row>
        <Row label="Vehicle leave by time"><Checkbox checked={s.leaveByTime} onChange={(leaveByTime) => set({ leaveByTime })} label="Allow" /></Row>
        <Row label={`Loading Time · ${hub}`}><div className="w-[160px]"><Input value={s.loadingTime} onChange={(loadingTime) => set({ loadingTime })} placeholder="mins" /></div></Row>
      </div>
    </SmallModal>
  )
}
