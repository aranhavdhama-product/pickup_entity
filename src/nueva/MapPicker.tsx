/**
 * Branch Location picker — a small Leaflet map (OSM tiles via the /osm proxy,
 * same as Dispatch Planning). Click anywhere to drop/move the marker; the
 * picked coordinates flow back through onPick. Marker follows external
 * lat/long edits too, so the inputs and the map stay in sync both ways.
 */
import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { MapPinned, Search } from 'lucide-react'
import { Button, Input, Modal } from './components'
import { toast } from './toast'

// Leaflet's default marker images 404 under bundlers — inline a brand-colored pin
const PIN = L.divIcon({
  className: '',
  html: '<div style="width:18px;height:18px;border-radius:50% 50% 50% 0;background:#F26C2E;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.35);transform:rotate(-45deg);margin:-9px 0 0 -9px"></div>',
  iconSize: [0, 0],
})

export default function MapPicker({ lat, lng, onPick, readOnly, height = 280 }: {
  lat?: string | number | null
  lng?: string | number | null
  onPick?: (lat: number, lng: number) => void
  readOnly?: boolean
  height?: number
}) {
  const elRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const markerRef = useRef<L.Marker | null>(null)
  const onPickRef = useRef(onPick)
  onPickRef.current = onPick

  useEffect(() => {
    const el = elRef.current
    if (!el || mapRef.current) return
    const map = L.map(el, { zoomControl: true, attributionControl: false })
    L.tileLayer('/osm/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map)
    map.setView([40.7128, -74.006], 4)
    map.on('click', (e: L.LeafletMouseEvent) => {
      onPickRef.current?.(Number(e.latlng.lat.toFixed(6)), Number(e.latlng.lng.toFixed(6)))
    })
    mapRef.current = map
    return () => { map.remove(); mapRef.current = null; markerRef.current = null }
  }, [])

  // marker follows the current lat/long (typed or picked)
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const la = Number(lat), ln = Number(lng)
    const has = lat != null && lng != null && String(lat).trim() !== '' && String(lng).trim() !== '' && !isNaN(la) && !isNaN(ln)
    if (!has) {
      markerRef.current?.remove()
      markerRef.current = null
      return
    }
    if (!markerRef.current) {
      markerRef.current = L.marker([la, ln], { icon: PIN }).addTo(map)
      map.setView([la, ln], Math.max(map.getZoom(), 12))
    } else {
      markerRef.current.setLatLng([la, ln])
      if (!map.getBounds().contains([la, ln])) map.setView([la, ln], map.getZoom())
    }
  }, [lat, lng])

  return (
    <div>
      {/* inline height: utility classes can be overridden/missed inside the
          leaflet-container class soup — the map must never collapse */}
      <div ref={elRef} style={{ height }} className="w-full rounded-lg border border-line overflow-hidden" />
      {!readOnly && (
        <p className="mt-1.5 text-[12px] text-ink-3">
          Click the map to set the branch location — latitude and longitude fill in automatically.
        </p>
      )}
    </div>
  )
}


/**
 * Branch Location control — staging's anatomy: a read-only coordinates field
 * plus a "Select Location" button that opens the map in a POPUP.
 */
export function LocationField({ lat, lng, onPick, readOnly, defaultQuery }: {
  lat?: string | number | null
  lng?: string | number | null
  onPick?: (lat: number, lng: number) => void
  readOnly?: boolean
  /** the address already typed into the form — prefills the popup's search */
  defaultQuery?: string
}) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [searching, setSearching] = useState(false)
  const has = String(lat ?? '').trim() !== '' && String(lng ?? '').trim() !== ''

  const openPopup = () => {
    setQ(defaultQuery ?? '')
    setOpen(true)
  }

  /* staging's popup geocodes a typed address; ours uses OSM Nominatim through
     the same-origin /geocode proxy */
  const search = async () => {
    const query = q.trim()
    if (!query) return
    setSearching(true)
    try {
      const res = await fetch(`/geocode/search?format=json&limit=1&q=${encodeURIComponent(query)}`)
      if (!res.ok) throw new Error(String(res.status))
      const hits = await res.json() as { lat?: string; lon?: string }[]
      const hit = hits?.[0]
      if (!hit?.lat || !hit?.lon) {
        toast.error('No location found for that address.')
        return
      }
      onPick?.(Number(Number(hit.lat).toFixed(6)), Number(Number(hit.lon).toFixed(6)))
    } catch {
      toast.error('Address search failed — try again or click the map directly.')
    } finally {
      setSearching(false)
    }
  }

  return (
    // wraps when placed in a narrow form column so the button never overflows
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex h-8 min-w-24 flex-1 max-w-md items-center truncate rounded-md border border-warm-300 bg-warm-50 px-3 text-[13px] text-ink-2">
        {has ? `${lat}, ${lng}` : 'Coordinates'}
      </div>
      <Button variant={readOnly ? 'outline' : 'primary'} icon={<MapPinned size={14} />} onClick={openPopup}>
        {readOnly ? 'View Location' : 'Select Location'}
      </Button>
      {open && (
        <Modal title="Branch Location" open onClose={() => setOpen(false)} wide
          footer={<Button onClick={() => setOpen(false)}>Done</Button>}>
          <div className="pb-3">
            {!readOnly && (
              <div className="mb-3 flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  <Input value={q} placeholder="Search an address" onChange={setQ} />
                </div>
                <Button icon={<Search size={14} />} onClick={search} disabled={searching}>
                  {searching ? 'Searching…' : 'Search'}
                </Button>
              </div>
            )}
            <MapPicker lat={lat} lng={lng} onPick={onPick} readOnly={readOnly} height={400} />
          </div>
        </Modal>
      )}
    </div>
  )
}
