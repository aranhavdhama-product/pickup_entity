/** Lanes & Movement masters — live on /master/api/v1 (schemas probed 2026-08-27).
 *
 * UI reconstructed from staging's own bundle (network-master + loadType chunks):
 *  - Lane list: Code/Origin/Destination/Lane/Mode/Transporter/Service/MaxW/MaxV;
 *    filters Enabled + Origin + Destination + Mode + Service Type. Form: Code*,
 *    Mode*, Preferred Transporter, Service Type, Max Weight/Volume, Item Value
 *    Limit + a connection table (Stops*, STA(+day), Docking hrs, STD(+day,
 *    auto-computed), Travel hrs, Distance km) — staging CHAINS the timings:
 *    STD = STA + docking, next STA = STD + travel, with day rollover.
 *  - Hub To Hub list: Code/Origin/Next/Destination; filters Enabled + Origin +
 *    Destination. Form: Origin*, Destination*, Next Facility* (all required;
 *    origin ≠ next, origin ≠ destination). sortCode exists on the API but has
 *    no staging surface and persists unreliably — intentionally not exposed.
 *  - Load Type: staging's exact sections (Basic, Assets, Capacity, Dimensions,
 *    Temperature) incl. the 26-entry code catalog, compatibility tags and
 *    per-type asset numbers sourced from the vehicle master.
 */
import { useEffect, useState } from 'react'
import { ArrowRightLeft, Boxes, MapPinned, Package, Route, Ruler, Snowflake, Truck } from 'lucide-react'
import { Input, MenuSelect, MultiSelect } from '../components'
import type { LiveMasterConfig } from '../LiveMaster'
import { fetchCarriers, fetchMasterRows, type MasterRecord } from '../settingsApi'
import { labeledCodesOf } from './shared'

const s = (v: unknown) => (v == null ? '' : String(v))
const num = (v: unknown) => Number(v) || 0
const fmt = (v: number) => v.toLocaleString('en-US')

const MODE_LABELS: Record<string, string> = {
  ROAD: 'Road', AIR: 'Air', SEA: 'Sea', RORO: 'RoRo',
  CABIN_LOAD: 'Cabin Load', ROAD_AIR: 'Road + Air', ROAD_SEA: 'Road + Sea',
}
const SERVICE_LABELS: Record<string, string> = { EXPRESS: 'Express', STANDARD: 'Standard', ANY: 'Any' }
const TEMP_LABELS: Record<string, string> = {
  AMBIENT: 'Ambient', CHILLER: 'Chiller', FREEZER: 'Freezer',
  // legacy values that may still exist on old rows
  CHILLED: 'Chilled', FROZEN: 'Frozen',
}

/* hubs resolve once per session — dropdowns show the hub NAME, store the code */
let hubPairsPromise: Promise<{ value: string; label: string }[]> | null = null
const fetchHubPairs = () => (hubPairsPromise ??= fetchMasterRows('hub').then((rs) => rs
  .filter((r) => r.code)
  .map((r) => ({ value: s(r.code), label: s(r.name) || s(r.code) }))))
const hubNameMap = async () => new Map((await fetchHubPairs()).map((p) => [p.value, p.label]))

/** staging's own Load Type catalog (from its bundle) — code select suggestions
 * plus the compatibility vocabulary behind the tags multiselect */
const LOAD_TYPE_CATALOG: { code: string; label: string; compatibility: string[] }[] = [
  { code: 'LT-ZIP-BAG', label: 'Zippy Bag / Flyer Bag', compatibility: ['corrugated box', 'tote', 'pallet carton', 'courier sack', 'gaylord', 'ULD', 'container'] },
  { code: 'LT-BBL-BAG', label: 'Bubble Mailer / Jiffy Bag', compatibility: ['carton', 'tote', 'pallet carton', 'courier sack', 'ULD', 'container'] },
  { code: 'LT-POLY-BAG', label: 'Poly Bag / Courier Bag', compatibility: ['courier sack', 'tote', 'carton', 'pallet', 'ULD', 'container'] },
  { code: 'LT-CARTON-S', label: 'Carton / Corrugated Box - Small', compatibility: ['tote', 'pallet', 'gaylord', 'ULD', 'container'] },
  { code: 'LT-CARTON-M', label: 'Carton / Corrugated Box - Medium', compatibility: ['pallet', 'gaylord', 'roll cage', 'ULD', 'container'] },
  { code: 'LT-CRATE-PL', label: 'Plastic Crate', compatibility: ['pallet', 'roll cage', 'container', 'reefer', 'cross-dock load'] },
  { code: 'LT-COURIER-SACK', label: 'Courier Sack / Parcel Sack', compatibility: ['cage', 'pallet', 'container', 'linehaul sacks'] },
  { code: 'LT-TOTE', label: 'Tote Box / Bin', compatibility: ['pallet', 'roll cage', 'ULD', 'container'] },
  { code: 'LT-SACK', label: 'Sack / Gunny Bag', compatibility: ['pallet', 'crate', 'cage pallet', 'container', 'flatbed unitized loads'] },
  { code: 'LT-CRATE-WD', label: 'Wooden Crate', compatibility: ['flatbed', 'palletized base', 'container', 'lowbed'] },
  { code: 'LT-DRUM-PL', label: 'Plastic Drum', compatibility: ['pallet', 'container', 'tanker as packaged cargo'] },
  { code: 'LT-DRUM-MS', label: 'Steel Drum', compatibility: ['pallet', 'container', 'flatbed', 'warehouse block stacks'] },
  { code: 'LT-CAGE', label: 'Roll Cage / Cage Trolley', compatibility: ['truck', 'trailer', 'container', 'cross-dock route loads'] },
  { code: 'LT-GAYLORD', label: 'Gaylord / Pallet Box', compatibility: ['truck', 'container', 'warehouse pallet positions'] },
  { code: 'LT-IBC', label: 'IBC Tote', compatibility: ['truck', 'container', 'flatbed as packaged liquid load'] },
  { code: 'LT-PALLET-EU', label: 'Pallet - Euro', compatibility: ['truck', 'trailer', 'container', 'ULD', 'warehouse storage'] },
  { code: 'LT-PALLET-STD', label: 'Pallet - Standard/GMA', compatibility: ['truck', 'trailer', 'container', 'reefer', 'ULD'] },
  { code: 'LT-ULD-LD3', label: 'Air ULD LD3', compatibility: ['aircraft only', 'bags', 'cartons', 'totes'] },
  { code: 'LT-BIGBAG', label: 'Big Bag / FIBC / Jumbo Bag', compatibility: ['pallet', 'flatbed', 'container', 'bulker staging loads'] },
  { code: 'LT-BUNDLE', label: 'Bundle / Bale', compatibility: ['pallet', 'flatbed', 'container', 'wagon-style road unit'] },
  { code: 'LT-REEL', label: 'Roll / Reel / Coil', compatibility: ['pallet cradle', 'flatbed', 'container', 'lowbed'] },
  { code: 'LT-ULD-PMC', label: 'Air ULD PMC Pallet', compatibility: ['cartons', 'crates', 'pallets under net', 'aircraft'] },
  { code: 'LT-CON-20', label: '20 ft Container Load', compatibility: ['bags', 'cartons', 'pallets', 'drums', 'crates', 'IBCs', 'machinery within limits'] },
  { code: 'LT-CON-40', label: '40 ft Container Load', compatibility: ['bags', 'cartons', 'pallets', 'drums', 'crates', 'IBCs', 'machinery within limits'] },
  { code: 'LT-FLATRACK', label: 'Flat Rack / Open Platform Container', compatibility: ['crates', 'bundles', 'reels', 'machinery', 'overwidth cargo'] },
  { code: 'LT-LOOSE', label: 'Loose / Floor Loaded', compatibility: ['floor loading inside van/container/truck'] },
]
const COMPAT_OPTIONS = [...new Set(LOAD_TYPE_CATALOG.flatMap((c) => c.compatibility))].sort()
const ASSET_TYPES = ['Trailer', 'Prime Mover', 'Rigid'] // staging's asset-type enum

/* keys we derive at fetch time for display/filtering — never sent as intent
 * (the master service ignores unknown properties; stripping is hygiene) */
const stripDerived = (row: MasterRecord): MasterRecord => {
  const d = { ...row }
  for (const k of ['routeNames', 'routeKm', 'routeHrs', 'modeLabel', 'serviceLabel', 'originName', 'destinationName', 'nextName', 'laneName', 'tempLabel', 'assignLabel']) delete d[k]
  return d
}

const identityCell = (name: unknown, code: unknown) => (
  <div>
    <p className="font-bold text-brand-500">{s(name) || s(code)}</p>
    {s(code) && s(code) !== s(name) && <p className="text-[12px] text-ink-3">{s(code)}</p>}
  </div>
)

export const LANEMOVEMENT_MASTERS: Record<string, LiveMasterConfig> = {
  /* ------------------------------------------------------------ Line Haul Lane
   * name/origin/destination are SERVER-derived from the stops; the list must
   * fetch with includeSubDetails to see laneConnections. Needs >= 2 stops. */
  'line-haul-lane': {
    entity: 'lane', title: 'Line Haul Lane', noun: 'lane',
    subtitle: 'Multi-stop movement lanes between facilities, with timings per leg',
    catPath: '/console/settings/masters/lane_movement',
    titleKey: 'name',
    fetchRows: async () => {
      const [res, names] = await Promise.all([
        fetch('/staging/master/api/v1/lane/fetch', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pageNumber: 1, pageSize: 200, includeSubDetails: true }),
        }),
        hubNameMap().catch(() => new Map<string, string>()),
      ])
      if (!res.ok) throw new Error(`lane/fetch ${res.status}`)
      const d = await res.json() as { content?: MasterRecord[] }
      const hub = (c: unknown) => names.get(s(c)) ?? s(c)
      return (d.content ?? []).map((r) => {
        const conns = (Array.isArray(r.laneConnections) ? [...r.laneConnections as MasterRecord[]] : [])
          .sort((a, b) => num(a.sequence) - num(b.sequence))
        const stops = conns.length ? conns.map((c) => c.hubCode)
          : [r.originHubCode, r.destinationHubCode].filter(Boolean)
        return {
          ...r,
          laneConnections: conns,
          routeNames: stops.map(hub),
          routeKm: conns.reduce((a, c) => a + num(c.distance), 0),
          routeHrs: conns.reduce((a, c) => a + num(c.travelDuration) + num(c.dockingTime), 0),
          modeLabel: MODE_LABELS[s(r.mode)] ?? s(r.mode),
          serviceLabel: SERVICE_LABELS[s(r.serviceType)] ?? s(r.serviceType),
          originName: hub(r.originHubCode),
          destinationName: hub(r.destinationHubCode),
        }
      })
    },
    columns: [
      { key: 'name', label: 'Lane', render: (r: MasterRecord) => identityCell(r.name, r.code) },
      { key: 'routeNames', label: 'Route', render: (r: MasterRecord) => {
        const names = Array.isArray(r.routeNames) ? (r.routeNames as string[]).filter(Boolean) : []
        if (!names.length) return '—'
        const km = num(r.routeKm), hrs = num(r.routeHrs)
        return (
          <div>
            <p>{names.join(' → ')}</p>
            {km > 0 && <p className="text-[12px] text-ink-3">{fmt(km)} km · {fmt(hrs)} h door-to-door</p>}
          </div>
        )
      } },
      { key: 'modeLabel', label: 'Mode' },
      { key: 'serviceLabel', label: 'Service' },
      { key: 'transporter', label: 'Carrier', render: (r: MasterRecord) => s(r.transporter) || '—' },
      { key: 'maxWeight', label: 'Capacity', render: (r: MasterRecord) => {
        const w = num(r.maxWeight), v = num(r.maxVolume), val = num(r.valueLimit)
        if (!w && !v) return '—'
        return (
          <div>
            <p>{fmt(w)} kg · {fmt(v)} CBM</p>
            {val > 0 && <p className="text-[12px] text-ink-3">value limit {fmt(val)}</p>}
          </div>
        )
      } },
    ],
    fields: [
      { key: 'code', label: 'Lane Code', type: 'text', required: true, placeholder: 'E.g. LANE-FL-KY', section: 'Lane Details' },
      { key: 'mode', label: 'Mode', type: 'select', required: true, options: Object.keys(MODE_LABELS), optionLabels: MODE_LABELS, init: 'ROAD', section: 'Lane Details' },
      { key: 'serviceType', label: 'Service Type', type: 'select', options: ['EXPRESS', 'STANDARD', 'ANY'], optionLabels: SERVICE_LABELS, init: 'ANY', section: 'Lane Details' },
      // staging's form calls this "Preferred Transporter" (free text there;
      // creatable select here so real carrier codes are one click away)
      { key: 'transporter', label: 'Preferred Transporter', type: 'select', optionsFrom: fetchCarriers, searchable: true, creatable: true, section: 'Lane Details' },
      { key: 'maxWeight', label: 'Max Weight (kg)', type: 'number', placeholder: 'E.g. 16000', section: 'Capacity Limits' },
      { key: 'maxVolume', label: 'Max Volume (CBM)', type: 'number', placeholder: 'E.g. 80', section: 'Capacity Limits' },
      { key: 'valueLimit', label: 'Item Value Limit', type: 'number', placeholder: 'E.g. 40000', section: 'Capacity Limits' },
      { key: 'laneConnections', label: '', type: 'custom', section: 'Stops & Timings',
        renderCustom: (row, set, readOnly) => <LaneConnectionsEditor row={row} set={set} readOnly={readOnly} /> },
    ],
    beforeSave: async (row) => {
      const conns = (Array.isArray(row.laneConnections) ? row.laneConnections as MasterRecord[] : [])
      if (conns.length < 2) throw new Error('A lane needs at least two stops.')
      conns.forEach((c, i) => { if (!s(c.hubCode).trim()) throw new Error(`Stop ${i + 1} needs a facility.`) })
      for (let i = 0; i < conns.length - 1; i++) {
        if (s(conns[i].hubCode) === s(conns[i + 1].hubCode)) throw new Error('Consecutive stops cannot be the same facility.')
      }
      return {
        ...stripDerived(row),
        maxWeight: num(row.maxWeight), maxVolume: num(row.maxVolume), valueLimit: num(row.valueLimit),
        laneConnections: conns.map((c, i) => ({
          ...c, sequence: i + 1, hubCode: s(c.hubCode).trim(),
          dockingTime: num(c.dockingTime), travelDuration: num(c.travelDuration),
          distance: num(c.distance), staDay: num(c.staDay), stdDay: num(c.stdDay),
          mode: s(c.mode) || 'ROAD',
        })),
      }
    },
    sectionMeta: {
      'Lane Details': { icon: <Route size={15} className="text-brand-500" />, caption: 'Identity, transport mode and preferred carrier. The lane name, origin and destination derive from the stops below.' },
      'Capacity Limits': { icon: <Boxes size={15} className="text-brand-500" />, caption: 'Weight, volume and shipment-value ceilings for loads moving on this lane.' },
      'Stops & Timings': { icon: <MapPinned size={15} className="text-brand-500" />, caption: 'The facilities this lane passes through, in order — at least two. Departure and next-arrival times chain automatically from the first STA, docking and travel hours.' },
    },
    searchKeys: ['code', 'name', 'originHubCode', 'destinationHubCode', 'originName', 'destinationName', 'transporter'],
    // staging's exact filter bar: Enabled + Origin + Destination + Mode + Service
    filterKeys: [
      { key: 'modeLabel', label: 'Mode' },
      { key: 'serviceLabel', label: 'Service Type' },
      { key: 'originName', label: 'Origin Facility' },
      { key: 'destinationName', label: 'Destination Facility' },
      { key: 'transporter', label: 'Carrier' },
      { key: 'enabled', label: 'Status' },
    ],
  },

  /* ---------------------------------------------------------------- Hub To Hub
   * code is SERVER-composed as "origin:destination". Staging requires all
   * three facilities and rejects origin==next and origin==destination. */
  'hub-to-hub': {
    entity: 'hubToHub', title: 'Hub To Hub', noun: 'connection',
    subtitle: 'Direct hub-to-hub movement connections and their next-hop routing',
    catPath: '/console/settings/masters/lane_movement',
    codeKey: 'code', titleKey: 'code',
    fetchRows: async () => {
      const [rows, names, lanes] = await Promise.all([
        fetchMasterRows('hubToHub'),
        hubNameMap().catch(() => new Map<string, string>()),
        fetchMasterRows('lane').catch(() => [] as MasterRecord[]),
      ])
      const laneName = new Map(lanes.map((l) => [s(l.code), s(l.name)]))
      const hub = (c: unknown) => names.get(s(c)) ?? s(c)
      return rows.map((r) => ({
        ...r,
        originName: hub(r.originHubCode),
        destinationName: hub(r.destinationHubCode),
        nextName: r.nextHubCode ? hub(r.nextHubCode) : '',
        laneName: laneName.get(s(r.laneCode)) ?? '',
      }))
    },
    columns: [
      { key: 'code', label: 'Connection', render: (r: MasterRecord) =>
        identityCell(`${s(r.originName) || s(r.originHubCode)} → ${s(r.destinationName) || s(r.destinationHubCode)}`, r.code) },
      { key: 'nextName', label: 'Next Facility', render: (r: MasterRecord) => {
        const next = s(r.nextName) || s(r.nextHubCode)
        if (!next) return '—'
        const direct = s(r.nextHubCode) === s(r.destinationHubCode)
        return (
          <div>
            <p>{next}</p>
            <p className="text-[12px] text-ink-3">{direct ? 'direct leg' : 'via transshipment'}</p>
          </div>
        )
      } },
      { key: 'laneCode', label: 'Lane', render: (r: MasterRecord) => s(r.laneCode) ? (
        <div>
          <p>{s(r.laneName) || s(r.laneCode)}</p>
          {s(r.laneName) && <p className="text-[12px] text-ink-3">{s(r.laneCode)}</p>}
        </div>
      ) : '—' },
    ],
    fields: [
      { key: 'originHubCode', label: 'Origin Facility', type: 'select', required: true, searchable: true, optionsFromLabeled: fetchHubPairs, section: 'Connection' },
      { key: 'destinationHubCode', label: 'Destination Facility', type: 'select', required: true, searchable: true, optionsFromLabeled: fetchHubPairs, section: 'Connection' },
      { key: 'nextHubCode', label: 'Next Facility', type: 'select', required: true, searchable: true, optionsFromLabeled: fetchHubPairs, section: 'Connection' },
      { key: 'laneCode', label: 'Lane', type: 'select', searchable: true, optionsFromLabeled: labeledCodesOf('lane'), placeholder: 'Select Lane', section: 'Connection' },
    ],
    // mirror staging's validation + its server-side code composition
    beforeSave: async (row) => {
      const origin = s(row.originHubCode).trim(), dest = s(row.destinationHubCode).trim(), next = s(row.nextHubCode).trim()
      if (origin && origin === dest) throw new Error('Origin and Destination Facility cannot be the same.')
      if (origin && origin === next) throw new Error('Origin and Next Facility cannot be the same.')
      return {
        ...stripDerived(row),
        originHubCode: origin, destinationHubCode: dest, nextHubCode: next,
        code: `${origin}:${dest}`,
      }
    },
    sectionMeta: {
      'Connection': { icon: <ArrowRightLeft size={15} className="text-brand-500" />, caption: 'Origin, destination and the next facility a load moves to — the next hop drives multi-leg routing. The connection code composes itself from origin and destination.' },
    },
    searchKeys: ['code', 'originHubCode', 'destinationHubCode', 'nextHubCode', 'laneCode', 'originName', 'destinationName', 'nextName'],
    // staging filters: Enabled + Origin + Destination (Next/Lane are ours)
    filterKeys: [
      { key: 'originName', label: 'Origin Facility' },
      { key: 'destinationName', label: 'Destination Facility' },
      { key: 'nextName', label: 'Next Facility' },
      { key: 'laneCode', label: 'Lane' },
      { key: 'enabled', label: 'Status' },
    ],
  },

  /* ------------------------------------------------------------------ Load Type
   * staging's form: Basic Details (code from a 26-entry catalog, name,
   * compatibility tags, Available-For-Assignment toggle), Assets (type +
   * numbers from the vehicle master), Capacity, Dimensions, Temperature. */
  'load-type': {
    entity: 'loadType', title: 'Load Type', noun: 'load type',
    subtitle: 'Load profiles with capacity, dimensions, assets and temperature control',
    catPath: '/console/settings/masters/lane_movement',
    titleKey: 'name',
    normalize: (r) => {
      const t = s(Array.isArray(r.temperatureType) ? (r.temperatureType as string[])[0] : '')
      return {
        ...r,
        tempLabel: r.temperatureControl ? (TEMP_LABELS[t] ?? (t || 'Controlled')) : 'None',
        assignLabel: r.assign ? 'Ready' : 'Not available',
      }
    },
    columns: [
      { key: 'name', label: 'Load Type', render: (r: MasterRecord) => identityCell(r.name, r.code) },
      { key: 'compatibility', label: 'Compatibility', render: (r: MasterRecord) => {
        const list = Array.isArray(r.compatibility) ? (r.compatibility as string[]).filter(Boolean) : []
        if (!list.length) return '—'
        return (
          <div className="flex flex-wrap items-center gap-1">
            {list.slice(0, 2).map((c) => (
              <span key={c} className="rounded-full bg-warm-100 px-2 py-0.5 text-[11px] text-ink-2 whitespace-nowrap">{c}</span>
            ))}
            {list.length > 2 && <span className="text-[11px] text-ink-3">+{list.length - 2}</span>}
          </div>
        )
      } },
      { key: 'weightCapacity', label: 'Capacity', render: (r: MasterRecord) => {
        const w = num(r.weightCapacity), v = num(r.volumetricCapacity)
        if (!w && !v) return '—'
        const extras = [
          num(r.palletSpace) > 0 ? `${fmt(num(r.palletSpace))} pallet` : '',
          num(r.stops) > 0 ? `${fmt(num(r.stops))} stops` : '',
          num(r.itemValueCapacity) > 0 ? `value ${fmt(num(r.itemValueCapacity))}` : '',
        ].filter(Boolean).join(' · ')
        return (
          <div>
            <p>{fmt(w)} {s(r.weightUom) || 'KG'} · {fmt(v)} {s(r.volumeUom) || 'CBM'}</p>
            {extras && <p className="text-[12px] text-ink-3">{extras}</p>}
          </div>
        )
      } },
      { key: 'length', label: 'L × W × H', render: (r: MasterRecord) =>
        (num(r.length) || num(r.width) || num(r.height))
          ? `${fmt(num(r.length))} × ${fmt(num(r.width))} × ${fmt(num(r.height))} ${s(r.dimensionalUom)}`.trim() : '—' },
      { key: 'tempLabel', label: 'Temperature', render: (r: MasterRecord) =>
        r.temperatureControl ? (
          <div>
            <p>{s(r.tempLabel)}</p>
            <p className="text-[12px] text-ink-3">{fmt(num(r.minTemperature))}–{fmt(num(r.maxTemperature))} °C</p>
          </div>
        ) : '—' },
      { key: 'assign', label: 'Assignment', render: (r: MasterRecord) => {
        const assets = Array.isArray(r.assets) ? (r.assets as MasterRecord[]) : []
        const count = assets.reduce((a, x) => a + (Array.isArray(x.assetNumberList) ? x.assetNumberList.length : 0), 0)
        return (
          <div>
            <p>{r.assign ? 'Ready' : '—'}</p>
            {count > 0 && <p className="text-[12px] text-ink-3">{count} asset{count === 1 ? '' : 's'}</p>}
          </div>
        )
      } },
    ],
    fields: [
      // staging: a searchable catalog select that also takes free codes
      { key: 'code', label: 'Load Type Code', type: 'select', required: true, searchable: true, creatable: true,
        options: LOAD_TYPE_CATALOG.map((c) => c.code),
        optionLabels: Object.fromEntries(LOAD_TYPE_CATALOG.map((c) => [c.code, `${c.label} (${c.code})`])),
        placeholder: 'E.g. LT-PALLET-STD', section: 'Load Type Details' },
      { key: 'name', label: 'Load Type Name', type: 'text', required: true, placeholder: 'E.g. Standard Pallet', section: 'Load Type Details' },
      { key: 'compatibility', label: 'Load Compatibility', type: 'multi', options: COMPAT_OPTIONS,
        placeholder: 'Select compatible load types', section: 'Load Type Details' },
      { key: 'assign', label: 'Available For Assignment', type: 'toggle', section: 'Load Type Details' },
      { key: 'assets', label: '', type: 'custom', section: 'Assets',
        renderCustom: (row, set, readOnly) => <AssetsEditor row={row} set={set} readOnly={readOnly} /> },
      // dimension pattern everywhere: value first, its UOM right after
      { key: 'weightCapacity', label: 'Max Weight', type: 'number', placeholder: 'E.g. 1000', section: 'Capacity' },
      { key: 'weightUom', label: 'Weight UOM', type: 'select', options: ['KG', 'LB', 'TON'], init: 'KG', section: 'Capacity' },
      { key: 'volumetricCapacity', label: 'Max Volume', type: 'number', placeholder: 'E.g. 1.8', section: 'Capacity' },
      { key: 'volumeUom', label: 'Volume UOM', type: 'select', options: ['CBM', 'CFT', 'L'], init: 'CBM', section: 'Capacity' },
      { key: 'stops', label: 'Max Stops', type: 'number', placeholder: 'E.g. 20', section: 'Capacity' },
      { key: 'itemValueCapacity', label: 'Item Value Capacity', type: 'number', placeholder: 'E.g. 50000', section: 'Capacity' },
      { key: 'palletSpace', label: 'Pallet Spaces', type: 'number', placeholder: 'E.g. 1', section: 'Capacity' },
      { key: 'length', label: 'Length', type: 'number', section: 'Dimensions' },
      { key: 'width', label: 'Width', type: 'number', section: 'Dimensions' },
      { key: 'height', label: 'Height', type: 'number', section: 'Dimensions' },
      { key: 'dimensionalUom', label: 'Dimensions UOM', type: 'select', options: ['MM', 'CM', 'M', 'IN', 'FT'], init: 'CM', section: 'Dimensions' },
      { key: 'temperatureControl', label: 'Temperature Controlled', type: 'toggle', section: 'Temperature Control' },
      // staging's enum: Ambient / Chiller / Freezer (stored as a 1-element array)
      { key: 'temperatureType', label: 'Temperature Type', type: 'select',
        options: ['AMBIENT', 'CHILLER', 'FREEZER'], optionLabels: TEMP_LABELS,
        visible: (r) => !!r.temperatureControl, section: 'Temperature Control' },
      { key: 'minTemperature', label: 'Min Temperature (°C)', type: 'number', visible: (r) => !!r.temperatureControl, section: 'Temperature Control' },
      { key: 'maxTemperature', label: 'Max Temperature (°C)', type: 'number', visible: (r) => !!r.temperatureControl, section: 'Temperature Control' },
    ],
    beforeSave: async (row) => {
      const controlled = !!row.temperatureControl
      const rawType = row.temperatureType
      const typeArr = Array.isArray(rawType) ? rawType.map(String).filter(Boolean)
        : s(rawType).trim() ? [s(rawType).trim()] : []
      const assets = (Array.isArray(row.assets) ? (row.assets as MasterRecord[]) : [])
        .filter((a) => s(a.assetType).trim())
        .map((a) => ({ assetType: s(a.assetType), assetNumberList: Array.isArray(a.assetNumberList) ? (a.assetNumberList as string[]) : [] }))
      return {
        ...stripDerived(row),
        weightCapacity: num(row.weightCapacity), volumetricCapacity: num(row.volumetricCapacity),
        length: num(row.length), width: num(row.width), height: num(row.height),
        itemValueCapacity: num(row.itemValueCapacity), palletSpace: num(row.palletSpace), stops: num(row.stops),
        temperatureControl: controlled,
        temperatureType: controlled && typeArr.length ? typeArr : null,
        minTemperature: controlled ? num(row.minTemperature) : 0,
        maxTemperature: controlled ? num(row.maxTemperature) : 0,
        assets: assets.length ? assets : null,
      }
    },
    sectionMeta: {
      'Load Type Details': { icon: <Boxes size={15} className="text-brand-500" />, caption: 'Identity of this load profile, what it can be consolidated into, and whether it is ready for driver/carrier assignment.' },
      'Assets': { icon: <Truck size={15} className="text-brand-500" />, caption: 'Prime movers, trailers and other equipment linked to this load — numbers come from the vehicle master.' },
      'Capacity': { icon: <Package size={15} className="text-brand-500" />, caption: 'Weight, volume, value and stop ceilings — each value followed by its unit.' },
      'Dimensions': { icon: <Ruler size={15} className="text-brand-500" />, caption: 'Physical envelope of the load — length, width, height and their unit.' },
      'Temperature Control': { icon: <Snowflake size={15} className="text-brand-500" />, caption: 'Cold-chain requirements — the range a controlled load must stay within during transit.' },
    },
    searchKeys: ['code', 'name', 'compatibility'],
    // staging filters: Enabled + Load Type Code + Load Type Name (+ ours)
    filterKeys: [
      { key: 'name', label: 'Load Type' },
      { key: 'enabled', label: 'Status' },
      { key: 'code', label: 'Load Type Code' },
      { key: 'tempLabel', label: 'Temperature' },
      { key: 'assignLabel', label: 'Assignment' },
      { key: 'weightUom', label: 'Weight UOM' },
    ],
  },
}

/* ---------------- lane connections builder ------------------------------
 * A lane is an ORDERED list of >= 2 facility stops. Staging chains the leg
 * timings — STD = STA + docking, next STA = STD + travel, rolling the day
 * offset — so only the first STA, docking and travel hours are typed; every
 * later time derives. The last stop is arrival-only (no docking/travel). */
const toMin = (v: string): number | null => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(v.trim())
  if (!m) return null
  const h = Number(m[1]), mi = Number(m[2])
  return h > 23 || mi > 59 ? null : h * 60 + mi
}
const toHHMM = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`

/** re-derive every STD and downstream STA from the first STA + leg hours */
function rechain(conns: MasterRecord[]): MasterRecord[] {
  const out = conns.map((c) => ({ ...c }))
  if (out.length) out[0].staDay = 0
  for (let i = 0; i < out.length - 1; i++) {
    const c = out[i]
    const sta = toMin(s(c.sta))
    if (sta == null) break
    const stdAbs = sta + Math.round(num(c.dockingTime) * 60)
    c.std = toHHMM(stdAbs % 1440)
    c.stdDay = num(c.staDay) + Math.floor(stdAbs / 1440)
    const nextAbs = (stdAbs % 1440) + Math.round(num(c.travelDuration) * 60)
    out[i + 1].sta = toHHMM(nextAbs % 1440)
    out[i + 1].staDay = num(c.stdDay) + Math.floor(nextAbs / 1440)
  }
  return out
}

const DayBadge = ({ d }: { d: unknown }) => num(d) > 0
  ? <span className="ml-1 rounded bg-warm-100 px-1 py-px text-[10.5px] font-bold text-ink-3">+{num(d)}d</span>
  : null

function LaneConnectionsEditor({ row, set, readOnly }: {
  row: MasterRecord
  set: (patch: Record<string, unknown>) => void
  readOnly: boolean
}) {
  const conns = (Array.isArray(row.laneConnections) ? row.laneConnections : []) as MasterRecord[]
  const [hubs, setHubs] = useState<{ value: string; label: string }[]>([])
  useEffect(() => { fetchHubPairs().then(setHubs).catch(() => {}) }, [])
  const hubLabel = (code: unknown) => hubs.find((h) => h.value === s(code))?.label ?? s(code)

  const th = 'px-3 py-2 text-left text-[12px] font-bold text-ink-3 whitespace-nowrap'
  const td = 'px-3 py-1.5 text-ink-2 whitespace-nowrap'
  const stopTag = (i: number) => i === 0 ? 'Origin' : i === conns.length - 1 ? 'Destination' : null

  if (readOnly) {
    return conns.length === 0 ? <p className="text-[13px] text-ink-3">No stops defined.</p> : (
      <div className="overflow-x-auto rounded-md border border-line">
        <table className="w-full text-[13px]">
          <thead className="bg-warm-25">
            <tr className="border-b border-line">
              {['#', 'Facility', 'STA', 'STD', 'Docking (hrs)', 'Travel (hrs)', 'Distance (km)', 'Mode'].map((h) => (
                <th key={h} className={th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {conns.map((c, i) => {
              const last = i === conns.length - 1
              return (
                <tr key={i} className="border-b border-line/60 last:border-0">
                  <td className="px-3 py-1.5 text-ink-3">{i + 1}</td>
                  <td className="px-3 py-1.5">
                    <p className="font-bold text-ink">{hubLabel(c.hubCode)}</p>
                    {stopTag(i) && <p className="text-[11px] text-ink-3">{stopTag(i)}</p>}
                  </td>
                  <td className={td}>{s(c.sta) || '—'}<DayBadge d={c.staDay} /></td>
                  <td className={td}>{last ? '—' : <>{s(c.std) || '—'}<DayBadge d={c.stdDay} /></>}</td>
                  <td className={td}>{last ? '—' : fmt(num(c.dockingTime))}</td>
                  <td className={td}>{last ? '—' : fmt(num(c.travelDuration))}</td>
                  <td className={td}>{last ? '—' : fmt(num(c.distance))}</td>
                  <td className={td}>{last ? '—' : (MODE_LABELS[s(c.mode)] ?? s(c.mode) ?? '—')}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    )
  }

  const upd = (i: number, patch: Record<string, unknown>) =>
    set({ laneConnections: rechain(conns.map((c, j) => (j === i ? { ...c, ...patch } : c))) })
  const remove = (i: number) =>
    set({ laneConnections: rechain(conns.filter((_, j) => j !== i)) })
  const add = () =>
    set({ laneConnections: rechain([...conns, { sequence: conns.length + 1, hubCode: '', dockingTime: 0, travelDuration: 0, distance: 0, mode: 'ROAD' } as unknown as MasterRecord]) })

  return (
    <div>
      {conns.length > 0 && (
        <div className="mb-2 overflow-x-auto rounded-md border border-line">
          <table className="w-full text-[13px]">
            <thead className="bg-warm-25">
              <tr className="border-b border-line">
                {['#', 'Facility', 'STA', 'Docking (hrs)', 'STD', 'Travel (hrs)', 'Distance (km)', 'Mode', ''].map((h, i) => (
                  <th key={i} className="px-2 py-2 text-left text-[12px] font-bold text-ink-3 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {conns.map((c, i) => {
                const last = i === conns.length - 1
                return (
                  <tr key={i} className="border-b border-line/60 last:border-0">
                    <td className="px-2 py-1.5 align-middle">
                      <p className="text-ink-3">{i + 1}</p>
                      {stopTag(i) && <p className="text-[10.5px] text-ink-3">{stopTag(i)}</p>}
                    </td>
                    <td className="min-w-40 px-2 py-1.5">
                      <MenuSelect value={s(c.hubCode)} options={hubs.map((h) => h.value)} searchable
                        labels={(v) => hubs.find((h) => h.value === v)?.label ?? v}
                        placeholder="Select Facility" onChange={(v) => upd(i, { hubCode: v })} />
                    </td>
                    <td className="w-24 px-2 py-1.5">
                      {i === 0
                        ? <Input value={s(c.sta)} placeholder="08:00" onChange={(v) => upd(i, { sta: v })} />
                        : <span className="text-ink-2">{s(c.sta) || '—'}<DayBadge d={c.staDay} /></span>}
                    </td>
                    <td className="w-24 px-2 py-1.5">
                      {last ? <span className="text-ink-3">—</span>
                        : <Input type="number" value={c.dockingTime == null ? '' : s(c.dockingTime)} placeholder="0.5" onChange={(v) => upd(i, { dockingTime: v })} />}
                    </td>
                    <td className="w-20 px-2 py-1.5">
                      {last ? <span className="text-ink-3">—</span>
                        : <span className="text-ink-2">{s(c.std) || '—'}<DayBadge d={c.stdDay} /></span>}
                    </td>
                    <td className="w-24 px-2 py-1.5">
                      {last ? <span className="text-ink-3">—</span>
                        : <Input type="number" value={c.travelDuration == null ? '' : s(c.travelDuration)} placeholder="14" onChange={(v) => upd(i, { travelDuration: v })} />}
                    </td>
                    <td className="w-24 px-2 py-1.5">
                      {last ? <span className="text-ink-3">—</span>
                        : <Input type="number" value={c.distance == null ? '' : s(c.distance)} placeholder="900" onChange={(v) => upd(i, { distance: v })} />}
                    </td>
                    <td className="min-w-28 px-2 py-1.5">
                      {last ? <span className="text-ink-3">—</span>
                        : <MenuSelect value={s(c.mode) || 'ROAD'} options={Object.keys(MODE_LABELS)}
                            labels={(v) => MODE_LABELS[v] ?? v} onChange={(v) => upd(i, { mode: v })} />}
                    </td>
                    <td className="px-2 py-1.5">
                      <button type="button" onClick={() => remove(i)}
                        className="text-ink-3 hover:text-danger-fg" title="Remove stop">✕</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      <button type="button" onClick={add} className="text-[13px] font-bold text-brand-500 hover:opacity-80">
        + Add stop
      </button>
      {conns.length > 0 && conns.length < 2 && (
        <span className="ml-3 text-[12.5px] text-ink-3">A lane needs at least two stops.</span>
      )}
    </div>
  )
}

/* ---------------- load-type assets builder ------------------------------
 * assets = [{assetType, assetNumberList}] — staging sources the numbers from
 * the vehicle master, filtered by the row's asset type. */
function AssetsEditor({ row, set, readOnly }: {
  row: MasterRecord
  set: (patch: Record<string, unknown>) => void
  readOnly: boolean
}) {
  const assets = (Array.isArray(row.assets) ? row.assets : []) as MasterRecord[]
  const [vehicles, setVehicles] = useState<MasterRecord[]>([])
  useEffect(() => { fetchMasterRows('vehicle').then(setVehicles).catch(() => {}) }, [])
  const numbersFor = (type: string) =>
    vehicles.filter((v) => s(v.assetType) === type).map((v) => s(v.code)).filter(Boolean)

  if (readOnly) {
    if (!assets.length) return <p className="text-[13px] text-ink-3">No assets linked.</p>
    return (
      <div className="grid gap-1.5">
        {assets.map((a, i) => (
          <p key={i} className="text-[13.5px] text-ink">
            <span className="font-bold">{s(a.assetType)}</span>
            <span className="text-ink-3"> — {Array.isArray(a.assetNumberList) && a.assetNumberList.length ? (a.assetNumberList as string[]).join(', ') : 'no numbers'}</span>
          </p>
        ))}
      </div>
    )
  }

  const upd = (i: number, patch: Record<string, unknown>) =>
    set({ assets: assets.map((a, j) => (j === i ? { ...a, ...patch } : a)) })

  return (
    <div>
      {assets.length > 0 && (
        <div className="mb-2 grid gap-2">
          <div className="grid grid-cols-[11rem_1fr_2rem] items-center gap-3">
            <p className="text-[12px] font-bold text-ink-3">Asset Type</p>
            <p className="text-[12px] font-bold text-ink-3">Asset Numbers</p>
            <span />
          </div>
          {assets.map((a, i) => (
            <div key={i} className="grid grid-cols-[11rem_1fr_2rem] items-center gap-3">
              <MenuSelect value={s(a.assetType)} options={ASSET_TYPES} placeholder="Select type"
                onChange={(v) => upd(i, { assetType: v, assetNumberList: [] })} />
              <MultiSelect
                value={Array.isArray(a.assetNumberList) ? (a.assetNumberList as string[]) : []}
                options={numbersFor(s(a.assetType))}
                placeholder={s(a.assetType) ? 'Select asset numbers' : 'Pick a type first'}
                onChange={(v) => upd(i, { assetNumberList: v })} />
              <button type="button" onClick={() => set({ assets: assets.filter((_, j) => j !== i) })}
                className="text-ink-3 hover:text-danger-fg" title="Remove asset">✕</button>
            </div>
          ))}
        </div>
      )}
      <button type="button"
        onClick={() => set({ assets: [...assets, { assetType: '', assetNumberList: [] }] })}
        className="text-[13px] font-bold text-brand-500 hover:opacity-80">
        + Add asset
      </button>
    </div>
  )
}
