/**
 * Vehicle editor — `/local/routing/vehicles/:vehicleId` (`new` = Add New Vehicle).
 * OWNER OVERRIDE (2026-09-25, see index.tsx): staging's full-page vehicle form — back ·
 * delete | Primary Vehicle · Update Settings; cards Basic Details · Capacity Details ·
 * Shift And Cost Details · Carbon Emission, five labelled fields a row, each with ⓘ.
 * Core fields land on the HubVehicle; every other staging field is kept in `extra`.
 */
import { useState, type ReactNode } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Star, Trash2 } from 'lucide-react'
import { Checkbox, ConfirmDialog, Input, MenuSelect, MultiSelect } from '../../nueva/components'
import { LocalPage } from '../../local/chrome'
import { toast } from '../../nueva/toast'
import {
  HUB_CITIES, VEHICLE_MODES, cityOfHub, useVehicleConfig, vehicleConfigActions, type HubVehicle, type VehicleMode,
} from '../../config/vehicleConfig'
import { InfoLabel, ToolButton } from './stagingBits'

const MODE_TITLE: Record<VehicleMode, string> = { driving: 'Car', bicycling: 'Bike', walking: 'Walk', truck: 'Small Truck' }
const HUBS = Object.keys(HUB_CITIES)

function F({ label, required, children }: { label: string; required?: boolean; children: ReactNode }) {
  return (
    <div>
      <p className="mb-1 text-[12px] text-ink-2"><InfoLabel>{label}{required && <span className="ml-0.5 text-st-danger">*</span>}</InfoLabel></p>
      {children}
    </div>
  )
}
function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-4 rounded-xl border border-line bg-surface px-5 pb-5 pt-4">
      <h3 className="mb-3 text-[15px] font-bold text-ink">{title}</h3>
      <div className="grid grid-cols-5 gap-x-5 gap-y-4">{children}</div>
    </section>
  )
}

export default function VehicleEditor() {
  const { vehicleId = 'new' } = useParams()
  const [params] = useSearchParams()
  const nav = useNavigate()
  const { vehicles } = useVehicleConfig()
  const existing = vehicles.find((v) => v.id === vehicleId)
  const [v, setV] = useState<HubVehicle>(() => existing ?? {
    id: '', name: '', hubCode: params.get('hub') || HUBS[0], mode: 'truck', shiftStart: '07:00', shiftEnd: '19:00',
    weightCapacityKg: 0, volumeCapacity: 0, palletSpaces: 0, tags: [], carrierCode: 'OWN_FLEET', extra: {},
  })
  const [dirty, setDirty] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const set = (p: Partial<HubVehicle>) => { setV((x) => ({ ...x, ...p })); setDirty(true) }
  const ex = (k: string) => v.extra?.[k] ?? ''
  const setEx = (k: string, val: string) => set({ extra: { ...v.extra, [k]: val } })
  const text = (k: string, placeholder = 'Type here...') => <Input value={ex(k)} placeholder={placeholder} onChange={(x) => setEx(k, x)} />
  const pick = (k: string, options: string[]) => <MenuSelect value={ex(k)} placeholder="Select" options={options} onChange={(x) => setEx(k, x)} />
  const num = (value: number, onChange: (n: number) => void) => <Input type="number" value={value ? String(value) : ''} placeholder="Type here..." onChange={(x) => onChange(Math.max(0, Number(x) || 0))} />
  const withBuffer = (main: ReactNode, key: string) => (
    <span className="grid grid-cols-[1fr_76px_20px] items-center gap-1">{main}<Input value={ex(key)} placeholder="Buffer" onChange={(x) => setEx(key, x)} /><span className="text-[13px] text-ink-2">%</span></span>
  )
  const valid = !!v.name.trim() && !!v.hubCode && v.weightCapacityKg > 0 && !!v.carrierCode.trim()

  const save = () => {
    if (!valid) { toast.error('Name, Hub, Weight Capacity and Carrier Code are required.'); return }
    const saved = vehicleConfigActions.upsert({ ...v, name: v.name.trim(), id: existing ? v.id : undefined })
    toast.success(`${saved.name} saved.`)
    nav(`/local/routing/vehicles?city=${encodeURIComponent(cityOfHub(saved.hubCode))}&hub=${saved.hubCode}`)
  }

  return (
    <LocalPage>
      <div className="mb-3 flex items-center gap-2">
        <ToolButton icon={<ArrowLeft size={16} />} title="Back" onClick={() => nav(-1)} />
        {existing && <ToolButton icon={<Trash2 size={15} />} title="Delete vehicle" onClick={() => setConfirmDelete(true)} />}
        <span className="ml-auto" />
        <ToolButton icon={<Star size={15} className={v.primary ? 'fill-brand-500 text-brand-500' : ''} />} onClick={() => set({ primary: !v.primary })}>Primary Vehicle</ToolButton>
        <ToolButton tone={dirty ? 'primary' : 'plain'} disabled={!dirty} onClick={save}>{existing ? 'Update Settings' : 'Add Vehicle'}</ToolButton>
      </div>

      <Card title="Basic Details">
        <F label="Mode" required><MenuSelect value={v.mode} options={[...VEHICLE_MODES]} labels={(m) => MODE_TITLE[m as VehicleMode]} onChange={(m) => set({ mode: m as VehicleMode })} /></F>
        <F label="Power Source">{pick('Power Source', ['Diesel', 'Petrol', 'Electric', 'CNG', 'Hybrid'])}</F>
        <F label="Name" required><Input value={v.name} placeholder="Type here..." onChange={(name) => set({ name })} /></F>
        <F label="Tags"><MultiSelect value={v.tags} options={[...new Set(vehicles.flatMap((x) => x.tags))]} creatable placeholder="Type here..." onChange={(tags) => set({ tags })} /></F>
        <F label="Max Range (miles)">{text('Max Range (miles)')}</F>
        <F label="User Type">{pick('User Type', ['Field Executive', 'Driver', 'Rider'])}</F>
        <F label="Origin Location">{text('Origin Location', 'lat,lng')}</F>
        <F label="Service Time Multiplier">{text('Service Time Multiplier')}</F>
        <F label="City" required><MenuSelect value={cityOfHub(v.hubCode)} options={[...new Set(Object.values(HUB_CITIES))]} onChange={(c) => set({ hubCode: HUBS.find((h) => cityOfHub(h) === c) ?? v.hubCode })} /></F>
        <F label="Hub" required><MenuSelect value={v.hubCode} options={HUBS.filter((h) => cityOfHub(h) === cityOfHub(v.hubCode))} onChange={(hubCode) => set({ hubCode })} /></F>
        <F label="Return To Hub">{pick('Return To Hub', ['Yes', 'No'])}</F>
        <F label="Carrier Code" required><Input value={v.carrierCode} onChange={(carrierCode) => set({ carrierCode })} /></F>
        <F label="Coload Allowed">{pick('Coload Allowed', ['Yes', 'No'])}</F>
        <div className="col-span-2 pt-5"><Checkbox checked={ex('Exclude vehicle from empty-tag orders') === 'Yes'} label="Exclude vehicle from empty-tag orders"
          onChange={(c) => setEx('Exclude vehicle from empty-tag orders', c ? 'Yes' : '')} /></div>
      </Card>

      <Card title="Capacity Details">
        <F label="Weight Capacity" required>{withBuffer(num(v.weightCapacityKg, (weightCapacityKg) => set({ weightCapacityKg })), 'Weight Buffer')}</F>
        <F label="Order Weight Cut-off">{text('Order Weight Cut-off')}</F>
        <F label="Pallet Spaces">{withBuffer(num(v.palletSpaces, (palletSpaces) => set({ palletSpaces })), 'Pallet Buffer')}</F>
        <F label="Roundup Pallet per stop"><Checkbox checked={ex('Roundup Pallet per stop') === 'Yes'} onChange={(c) => setEx('Roundup Pallet per stop', c ? 'Yes' : '')} /></F>
        <F label="Order Pallet Cut-off">{text('Order Pallet Cut-off')}</F>
        <F label="Volume Capacity">{withBuffer(num(v.volumeCapacity, (volumeCapacity) => set({ volumeCapacity })), 'Volume Buffer')}</F>
        <F label="Min Stops">{text('Min Stops')}</F>
        <F label="Order Height Cut-off">{text('Order Height Cut-off')}</F>
        <F label="Order Width Cut-off">{text('Order Width Cut-off')}</F>
        <F label="Order Length Cut-off">{text('Order Length Cut-off')}</F>
        <F label="Stop Capacity">{withBuffer(text('Stop Capacity'), 'Stop Buffer')}</F>
      </Card>

      <Card title="Shift And Cost Details">
        <F label="Shift Start Time"><Input type="time" value={v.shiftStart} onChange={(shiftStart) => set({ shiftStart })} /></F>
        <F label="Shift End Time"><Input type="time" value={v.shiftEnd} onChange={(shiftEnd) => set({ shiftEnd })} /></F>
        <F label="Break Start"><Input type="time" value={ex('Break Start')} onChange={(x) => setEx('Break Start', x)} /></F>
        <F label="Break End"><Input type="time" value={ex('Break End')} onChange={(x) => setEx('Break End', x)} /></F>
        <F label="Fixed Cost">{text('Fixed Cost')}</F>
        <F label="Variable Distance Cost (per yard)">{text('Variable Distance Cost (per yard)')}</F>
        <F label="Waiting Cost per Time">{text('Waiting Cost per Time')}</F>
        <F label="Max Loading Time">{text('Max Loading Time')}</F>
      </Card>

      <Card title="Carbon Emission">
        <F label="Fuel Type">{pick('Fuel Type', ['Diesel', 'Petrol', 'Electric', 'CNG'])}</F>
        <F label="Engine Size">{pick('Engine Size', ['Small', 'Medium', 'Large'])}</F>
        <F label="CO2 Emission Factor">{text('CO2 Emission Factor')}</F>
        <p className="col-span-5 text-[12px] text-ink-3">Emission will be calculated in KGs, if weight unit is set as gram or lbs it will be converted into KGs for the emission.*</p>
      </Card>

      <ConfirmDialog open={confirmDelete} title="Delete vehicle" message={`Delete ${v.name} from Vehicle Config?`} confirmLabel="Delete"
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => { vehicleConfigActions.remove(v.id); toast.success(`${v.name} deleted.`); nav('/local/routing/vehicles') }} />
    </LocalPage>
  )
}
