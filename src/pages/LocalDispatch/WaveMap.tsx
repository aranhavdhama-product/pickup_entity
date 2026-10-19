/**
 * The wave's routes on one map — OpenStreetMap tiles through the dev proxy
 * (`/osm`), street geometry from OSRM (`/osrm`) with a dashed straight-line
 * fallback. The selected route is drawn on top at full strength; the others
 * step back. A click on a line or a stop selects its route.
 */
import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { routeColourToken, type DispatchRoute, type Hub } from './dispatchModel'

/* Leaflet writes SVG presentation attributes, which cannot read var() — resolve the token once per draw */
const resolve = (token: string): string =>
  getComputedStyle(document.documentElement).getPropertyValue(token).trim() || 'currentColor'

const pathCache = new Map<string, [number, number][] | null>()

async function streetPath(key: string, pts: { lat: number; lng: number }[]): Promise<[number, number][] | null> {
  if (pathCache.has(key)) return pathCache.get(key) ?? null
  try {
    const coords = pts.map((p) => `${p.lng.toFixed(5)},${p.lat.toFixed(5)}`).join(';')
    const res = await fetch(`/osrm/route/v1/driving/${coords}?overview=full&geometries=geojson`)
    if (!res.ok) throw new Error(String(res.status))
    const data = await res.json() as { routes?: { geometry?: { coordinates?: [number, number][] } }[] }
    const line = data.routes?.[0]?.geometry?.coordinates
    const path = Array.isArray(line) ? line.map(([lng, lat]) => [lat, lng] as [number, number]) : null
    pathCache.set(key, path)
    return path
  } catch {
    pathCache.set(key, null)
    return null
  }
}

const HUB_ICON = L.divIcon({
  className: '',
  html: `<div style="width:30px;height:30px;border-radius:8px;background:var(--color-surface);border:1.5px solid var(--color-ink);color:var(--color-ink);display:flex;align-items:center;justify-content:center;box-shadow:0 1px 4px rgba(0,0,0,.25)">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 8.35V20a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8.35A2 2 0 0 1 3.26 6.5l8-3.2a2 2 0 0 1 1.48 0l8 3.2A2 2 0 0 1 22 8.35Z"/><path d="M6 18h12"/><path d="M6 14h12"/><rect width="12" height="12" x="6" y="10"/></svg>
  </div>`,
  iconSize: [30, 30], iconAnchor: [15, 15],
})

function stopIcon(seq: number, token: string, strong: boolean, pickup: boolean) {
  const size = strong ? 26 : 22
  return L.divIcon({
    className: '',
    html: `<div style="width:${size}px;height:${size}px;border-radius:${pickup ? '5px' : '50%'};background:var(${token});color:var(--color-surface);border:1.5px solid var(--color-surface);font:700 14px Lato,sans-serif;display:flex;align-items:center;justify-content:center;box-shadow:0 1px 3px rgba(0,0,0,.3);opacity:${strong ? 1 : 0.55}">${seq}</div>`,
    iconSize: [size, size], iconAnchor: [size / 2, size / 2],
  })
}

export default function WaveMap({ hub, routes, colourIndex, selectedId, onSelect }: {
  hub: Hub
  routes: DispatchRoute[]
  colourIndex: (routeId: string) => number
  selectedId: string | null
  onSelect: (routeId: string) => void
}) {
  const el = useRef<HTMLDivElement | null>(null)
  const map = useRef<L.Map | null>(null)
  const layer = useRef<L.LayerGroup | null>(null)
  const bounds = useRef<L.LatLngBounds | null>(null)
  const framing = useRef(false)
  const [paths, setPaths] = useState(0)          // bumps when a street path lands
  const waveKey = routes.map((r) => r.id).join('|')

  /* the map itself — once */
  useEffect(() => {
    if (!el.current) return
    const m = L.map(el.current, { zoomControl: false, attributionControl: true, scrollWheelZoom: false, zoomSnap: 0.25 })
    L.control.zoom({ position: 'bottomright' }).addTo(m)
    L.tileLayer('/osm/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(m)
    layer.current = L.layerGroup().addTo(m)
    map.current = m
    /* a popup sizes its body after mount — re-measure, and re-frame until someone pans or zooms */
    let touched = false
    m.on('dragstart', () => { touched = true })
    m.on('zoomstart', () => { if (!framing.current) touched = true })
    const ro = new ResizeObserver(() => {
      m.invalidateSize()
      if (touched || !bounds.current) return
      framing.current = true
      m.fitBounds(bounds.current, { padding: [36, 36], maxZoom: 14, animate: false })
      framing.current = false
    })
    ro.observe(el.current)
    return () => { ro.disconnect(); m.remove(); map.current = null; layer.current = null }
  }, [])

  /* street geometry for the wave's routes */
  useEffect(() => {
    let alive = true
    for (const r of routes) {
      if (pathCache.has(r.id)) continue
      const loop = [hub, ...r.stops, hub]
      void streetPath(r.id, loop).then(() => { if (alive) setPaths((n) => n + 1) })
    }
    return () => { alive = false }
  }, [routes, hub])

  /* frame the wave when it changes */
  useEffect(() => {
    const m = map.current
    if (!m) return
    const pts: [number, number][] = [[hub.lat, hub.lng], ...routes.flatMap((r) => r.stops.map((s) => [s.lat, s.lng] as [number, number]))]
    bounds.current = L.latLngBounds(pts)
    m.invalidateSize()
    framing.current = true
    m.fitBounds(bounds.current, { padding: [36, 36], maxZoom: 14, animate: false })
    framing.current = false
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reframe per wave, not per selection
  }, [waveKey])

  /* lines + stops */
  useEffect(() => {
    const g = layer.current
    if (!g) return
    g.clearLayers()
    const ordered = [...routes].sort((a, b) => Number(a.id === selectedId) - Number(b.id === selectedId))
    for (const r of ordered) {
      const token = routeColourToken(colourIndex(r.id))
      const colour = resolve(token)
      const strong = !selectedId || r.id === selectedId
      const street = pathCache.get(r.id)
      const line = street ?? [hub, ...r.stops, hub].map((p) => [p.lat, p.lng] as [number, number])
      const poly = L.polyline(line, {
        color: colour, weight: r.id === selectedId ? 5 : 3.5, opacity: strong ? 0.9 : 0.3,
        dashArray: street ? undefined : '6 6',
      })
      poly.on('click', () => onSelect(r.id))
      poly.bindTooltip(`<span style="font-size:14px">${r.name} · ${r.stops.length} stops · ${r.start} – ${r.end}</span>`, { sticky: true })
      g.addLayer(poly)
      for (const s of r.stops) {
        const mk = L.marker([s.lat, s.lng], { icon: stopIcon(s.seq, token, strong, s.kind === 'Pickup'), zIndexOffset: strong ? 500 : 0 })
        mk.bindTooltip(`<span style="font-size:14px;line-height:22px"><b>${r.name} · ${s.seq}</b> ${s.consignment}<br>${s.customer} · ETA ${s.eta}</span>`, { direction: 'top', offset: [0, -8] })
        mk.on('click', () => onSelect(r.id))
        g.addLayer(mk)
      }
    }
    g.addLayer(L.marker([hub.lat, hub.lng], { icon: HUB_ICON, zIndexOffset: 1000 }).bindTooltip(`${hub.name} (${hub.code})`))
  }, [routes, selectedId, colourIndex, hub, onSelect, paths])

  return <div ref={el} className="h-full w-full" />
}
