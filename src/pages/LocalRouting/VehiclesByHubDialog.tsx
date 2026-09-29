/** "Vehicles by City and Hub" — staging's gate in front of Vehicle Config: City* · Hubs* · Cancel · Ok. */
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, MenuSelect, MultiSelect } from '../../nueva/components'
import { HUB_CITIES, cityOfHub } from '../../config/vehicleConfig'
import { SmallModal, StackField } from './stagingBits'

const HUBS = Object.keys(HUB_CITIES)

export default function VehiclesByHubDialog({ initialHub, onClose }: { initialHub: string; onClose: () => void }) {
  const nav = useNavigate()
  const [city, setCity] = useState(initialHub ? cityOfHub(initialHub) : '')
  const [hubs, setHubs] = useState<string[]>(initialHub ? [initialHub] : [])
  const ok = !!city && hubs.length > 0
  return (
    <SmallModal title="Vehicles by City and Hub" width={420} onClose={onClose} footer={<>
      <span className="mr-auto" />
      <Button variant="outline" onClick={onClose}>Cancel</Button>
      <Button disabled={!ok} onClick={() => nav(`/local/routing/vehicles?city=${encodeURIComponent(city)}&hub=${hubs.map(encodeURIComponent).join(',')}`)}>Ok</Button>
    </>}>
      <StackField label="City" required>
        <MenuSelect value={city} placeholder="Select City" options={[...new Set(Object.values(HUB_CITIES))]}
          onChange={(v) => { setCity(v); setHubs([]) }} />
      </StackField>
      <StackField label="Hubs" required>
        <MultiSelect value={hubs} options={HUBS.filter((h) => !city || cityOfHub(h) === city)} placeholder="Select Hub" onChange={setHubs} />
      </StackField>
    </SmallModal>
  )
}
