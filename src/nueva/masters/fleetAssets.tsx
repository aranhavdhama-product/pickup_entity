/** Fleet & Assets masters — live on /master/api/v1 (schemas re-probed 2026-08-27
 * against the sampleExcelDownload templates + PUT probes; staging page
 * definitions mined from bundle chunk 18702 the same day). */
import { Boxes, MapPin, SlidersHorizontal, Tag, Truck, Warehouse } from 'lucide-react'
import type { LiveMasterConfig } from '../LiveMaster'
import { fetchCarriers, fetchCities, fetchMasterRows, type MasterRecord } from '../settingsApi'
import { codesOf, labeledCodesOf, CODE_NAME_COLUMNS } from './shared'

const s = (v: unknown) => String(v ?? '').trim()

/** hub dropdown — hub MASTER only (vehicle.hubCode is FK-checked against it;
 * the legacy hubs_page list contains hubs the master rejects, e.g. "new york") */
const hubOptions = labeledCodesOf('hub')

/** staging's Asset Type oneof (es5 in the bundle) — all 8 verified against the
 * API 2026-08-27 ("Flat Bed"/"Container" PUT OK, bogus values 400 on `oneof`) */
const ASSET_TYPES = ['Trailer', 'Prime Mover', 'Rigid', 'Dolly', 'Flat Bed', 'Reefer', 'Tanker', 'Container']

/** staging's "Allowed Vehicle Types" list (also es5); the server stores the
 * NAMES as free strings (verified on live rows) */
const VEHICLE_TYPES = ASSET_TYPES

/** city dropdown — staging's asset form stores the city NAME from the legacy
 * city list (verified: PUT persists any string; template calls it "City code") */
const cityOptions = () => fetchCities().then((cs) => cs.map((c) => ({ value: c.label, label: c.label })))

/** linked-asset dropdown — server stores numeric vehicle IDs (max 2, staging
 * enforces the cap client-side); labels show the asset number */
const linkedAssetOptions = () => fetchMasterRows('vehicle').then((rs) => rs
  .filter((r) => r.id != null && r.code)
  .map((r) => ({ value: String(r.id), label: String(r.code) })))

/** legacy UOM spellings (from our early seeds) → staging's exact option values */
const W_UOM: Record<string, string> = { KG: 'kg', LBS: 'lb', LB: 'lb', TON: 'ton' }
const V_UOM: Record<string, string> = { CBM: 'm3', M3: 'm3', CM3: 'cm3', MM3: 'mm3' }
const D_UOM: Record<string, string> = { M: 'm', CM: 'cm', MM: 'mm' }
const VOL_LABELS: Record<string, string> = { mm3: 'mm³', cm3: 'cm³', m3: 'm³' }

const isRigid = (r: MasterRecord) => String(r.assetType ?? '') === 'Rigid'
const fmtNum = (v: unknown) => Number(v).toLocaleString('en-US')

export const FLEETASSETS_MASTERS: Record<string, LiveMasterConfig> = {
  // vehicle: code + assetType + hubCode + both capacities REQUIRED; the API
  // persists the FULL staging schema (city, merchant, current facility, linked
  // assets, costs, dates, return-facility flag — all verified by PUT probe);
  // Trailer/Prime Mover force mode=ROAD, Rigid picks its own mode + costs
  'asset-data': {
    entity: 'vehicle', title: 'Asset Data', noun: 'asset',
    subtitle: 'Vehicles and trailers with capacity, location and attributes',
    catPath: '/console/settings/masters/fleet_assets',
    titleKey: 'vehicleName',
    columns: [
      // identity: name prominent, code beneath (global table rule)
      { key: 'vehicleName', label: 'Asset', render: (r: MasterRecord) => (
        <div>
          <p className="font-bold text-brand-500">{s(r.vehicleName) || s(r.code)}</p>
          {!!s(r.vehicleName) && <p className="text-[12px] text-ink-3">{s(r.code)}</p>}
        </div>
      ) },
      // staging's Asset Type + Mode columns, merged
      { key: 'assetType', label: 'Asset Type', render: (r: MasterRecord) => s(r.assetType) ? (
        <div>
          <p>{s(r.assetType)}</p>
          {s(r.mode) && <p className="text-[12px] text-ink-3">{s(r.mode)}</p>}
        </div>
      ) : '—' },
      // staging's Home Facility + Curr. Hub columns, merged
      { key: 'hubCode', label: 'Facility', render: (r: MasterRecord) => (s(r.hubCode) || s(r.currentHub)) ? (
        <div>
          <p>{s(r.hubCode) || '—'}</p>
          {s(r.currentHub) && s(r.currentHub) !== s(r.hubCode) && (
            <p className="text-[12px] text-ink-3">at {s(r.currentHub)}</p>
          )}
        </div>
      ) : '—' },
      // staging's City + State columns, merged
      { key: 'cityCode', label: 'City', render: (r: MasterRecord) => (s(r.cityCode) || s(r.state)) ? (
        <div>
          <p>{s(r.cityCode) || '—'}</p>
          {s(r.state) && <p className="text-[12px] text-ink-3">{s(r.state)}</p>}
        </div>
      ) : '—' },
      { key: 'transporter', label: 'Transporter', render: (r: MasterRecord) => s(r.transporter) || '—' },
      { key: 'capacity', label: 'Capacity', render: (r: MasterRecord) =>
        (r.weightCapacity || r.volumetricCapacity) ? (
          <div>
            <p>{`${fmtNum(r.weightCapacity ?? 0)} ${s(r.weightUom) || 'kg'} · ${fmtNum(r.volumetricCapacity ?? 0)} ${VOL_LABELS[s(r.volumeUom)] ?? (s(r.volumeUom) || 'm³')}`}</p>
            {Number(r.palletCapacity) > 0 && <p className="text-[12px] text-ink-3">{fmtNum(r.palletCapacity)} pallets</p>}
          </div>
        ) : '—' },
      { key: 'vehicleTypes', label: 'Vehicle Types', render: (r: MasterRecord) =>
        Array.isArray(r.vehicleTypes) && r.vehicleTypes.length ? (
          <span className="inline-flex flex-wrap gap-1">
            {(r.vehicleTypes as string[]).map((t) => (
              <span key={t} className="rounded-full bg-warm-100 px-2 py-0.5 text-[12px] font-bold text-ink-2">{t}</span>
            ))}
          </span>
        ) : '—' },
      { key: 'driverName', label: 'Driver', render: (r: MasterRecord) => s(r.driverName) || '—' },
    ],
    fields: [
      // Asset Details — staging stars Asset Number*, Asset Type*, Allowed
      // Vehicle Types*; Rigid additionally requires Mode (and reveals costs)
      { key: 'code', label: 'Asset Number', type: 'text', required: true, placeholder: 'eg, VAN-03', section: 'Asset Details' },
      { key: 'vehicleName', label: 'Asset Name', type: 'text', placeholder: 'eg, Cargo Van', section: 'Asset Details' },
      { key: 'assetType', label: 'Asset Type', type: 'select', required: true, options: ASSET_TYPES, section: 'Asset Details' },
      { key: 'vehicleTypes', label: 'Allowed Vehicle Types', type: 'multi', required: true, options: VEHICLE_TYPES, section: 'Asset Details' },
      { key: 'merchantCode', label: 'Merchant', type: 'select', searchable: true, optionsFromLabeled: labeledCodesOf('businessUnit'), section: 'Asset Details' },
      // staging's Transporter is free text — creatable keeps the carrier list AND typed values
      { key: 'transporter', label: 'Transporter', type: 'select', creatable: true, optionsFrom: fetchCarriers, section: 'Asset Details' },
      { key: 'driverName', label: 'Driver Name', type: 'text', placeholder: 'eg, Marcus Webb', section: 'Asset Details' },
      // Rigid-only block (staging reveals these with assetType = Rigid;
      // Trailer/Prime Mover are forced to ROAD on save)
      { key: 'mode', label: 'Mode', type: 'select', required: true, init: 'ROAD', section: 'Asset Details', visible: isRigid,
        options: ['ROAD', 'RORO', 'SEA', 'AIR', 'CABIN_LOAD'],
        optionLabels: { ROAD: 'Road', RORO: 'RoRo', SEA: 'Sea', AIR: 'Air', CABIN_LOAD: 'Cabin Load' } },
      { key: 'waitingTimeCost', label: 'Waiting Time Cost', type: 'number', placeholder: 'eg, 12.50', section: 'Asset Details', visible: isRigid },
      { key: 'operationCost', label: 'Operation Cost', type: 'number', placeholder: 'eg, 30.00', section: 'Asset Details', visible: isRigid },
      { key: 'returnToDepot', label: 'Return To Depot', type: 'toggle', section: 'Asset Details', visible: isRigid },
      // Location — staging stars Home Facility*; city is the legacy city name,
      // current facility mirrors currentFacilityCode, linked assets cap at 2
      { key: 'cityCode', label: 'City', type: 'select', searchable: true, creatable: true, optionsFromLabeled: cityOptions, section: 'Location' },
      { key: 'hubCode', label: 'Home Facility', type: 'select', required: true, searchable: true, optionsFromLabeled: hubOptions, section: 'Location' },
      { key: 'currentHub', label: 'Current Facility', type: 'select', searchable: true, optionsFromLabeled: hubOptions, section: 'Location' },
      { key: 'linkedAssetIds', label: 'Linked Asset IDs', type: 'multi', optionsFromLabeled: linkedAssetOptions, placeholder: 'Up to 2 assets', section: 'Location' },
      // Capacity & Dimensions — staging stars Weight Capacity*, Volume Capacity*;
      // dimension values first, their UOM right after (hard rule); the two
      // maintenance dates live on this card exactly like staging
      { key: 'weightCapacity', label: 'Weight Capacity', type: 'number', required: true, placeholder: 'eg, 1200', section: 'Capacity & Dimensions' },
      { key: 'weightUom', label: 'Weight UOM', type: 'select', options: ['kg', 'lb', 'ton'], init: 'kg', section: 'Capacity & Dimensions' },
      { key: 'volumetricCapacity', label: 'Volume Capacity', type: 'number', required: true, placeholder: 'eg, 9.5', section: 'Capacity & Dimensions' },
      { key: 'volumeUom', label: 'Volume UOM', type: 'select', options: ['mm3', 'cm3', 'm3', 'L'], optionLabels: VOL_LABELS, init: 'm3', section: 'Capacity & Dimensions' },
      { key: 'palletCapacity', label: 'Pallet Capacity', type: 'number', section: 'Capacity & Dimensions' },
      { key: 'length', label: 'Length', type: 'number', section: 'Capacity & Dimensions' },
      { key: 'breadth', label: 'Width', type: 'number', section: 'Capacity & Dimensions' },
      { key: 'height', label: 'Height', type: 'number', section: 'Capacity & Dimensions' },
      { key: 'dimensionalUom', label: 'Dimensions UOM', type: 'select', options: ['mm', 'cm', 'm'], init: 'm', section: 'Capacity & Dimensions' },
      { key: 'maxUnit', label: 'Maximum Unit', type: 'number', placeholder: 'Units per trip', section: 'Capacity & Dimensions' },
      { key: 'maxStop', label: 'Maximum Stop', type: 'number', placeholder: 'Stops per trip', section: 'Capacity & Dimensions' },
      { key: 'manufacturingYear', label: 'Manufacturing Year', type: 'text', placeholder: 'eg, 2022-01-01', section: 'Capacity & Dimensions' },
      { key: 'nextScheduleMaintenanceDate', label: 'Next Maintenance Date', type: 'text', placeholder: 'eg, 2026-12-01', section: 'Capacity & Dimensions' },
      // Attributes
      { key: 'fuelType', label: 'Fuel Type', type: 'select', options: ['DIESEL', 'PETROL', 'ELECTRIC', 'CNG', 'NONE'],
        optionLabels: { DIESEL: 'Diesel', PETROL: 'Petrol', ELECTRIC: 'Electric', CNG: 'CNG', NONE: 'None' }, section: 'Attributes' },
      { key: 'gpsTracked', label: 'GPS Tracked', type: 'toggle', section: 'Attributes' },
      { key: 'temperatureControlled', label: 'Temperature Controlled', type: 'toggle', section: 'Attributes' },
      { key: 'hazmatCertified', label: 'Hazmat Certified', type: 'toggle', section: 'Attributes' },
      { key: 'isReturnFacility', label: 'Return Facility', type: 'toggle', section: 'Attributes' },
    ],
    // legacy seeds spelled UOMs KG/CBM/M — show (and re-save) staging's exact
    // lowercase option values instead; the API stores UOMs as free strings
    normalize: (r) => ({
      ...r,
      weightUom: W_UOM[s(r.weightUom)] ?? r.weightUom,
      volumeUom: V_UOM[s(r.volumeUom)] ?? r.volumeUom,
      dimensionalUom: D_UOM[s(r.dimensionalUom)] ?? r.dimensionalUom,
    }),
    beforeSave: async (row) => {
      const num = (v: unknown) => Number(v) || 0
      // multi editor holds string IDs; the server stores numbers (max 2 — staging's cap)
      const linked = Array.isArray(row.linkedAssetIds)
        ? (row.linkedAssetIds as unknown[]).map(Number).filter((n) => Number.isFinite(n) && n > 0)
        : []
      if (linked.length > 2) throw new Error('Maximum 2 assets can be linked.')
      const t = s(row.assetType)
      return {
        ...row,
        // staging forces ROAD for Trailer/Prime Mover; Rigid picks its own mode
        mode: t === 'Trailer' || t === 'Prime Mover' ? 'ROAD' : s(row.mode) || 'ROAD',
        linkedAssetIds: linked,
        // staging keeps currentFacilityCode mirroring the current hub
        currentFacilityCode: s(row.currentHub ?? row.currentFacilityCode),
        weightCapacity: num(row.weightCapacity), volumetricCapacity: num(row.volumetricCapacity),
        palletCapacity: num(row.palletCapacity),
        waitingTimeCost: num(row.waitingTimeCost), operationCost: num(row.operationCost),
        maxUnit: num(row.maxUnit), maxStop: num(row.maxStop),
        length: num(row.length), breadth: num(row.breadth), height: num(row.height),
      }
    },
    sectionMeta: {
      'Asset Details': { icon: <Truck size={15} className="text-brand-500" />, caption: 'Identity, type and operator of this asset. Rigid assets also set their mode, costs and depot return.' },
      'Location': { icon: <MapPin size={15} className="text-brand-500" />, caption: 'Where the asset is based and currently located — facilities come from the Hub master; up to 2 assets can be linked.' },
      'Capacity & Dimensions': { icon: <Boxes size={15} className="text-brand-500" />, caption: 'Load limits, physical size and maintenance dates — each dimension first, then its unit.' },
      'Attributes': { icon: <SlidersHorizontal size={15} className="text-brand-500" />, caption: 'Operational flags for planning and compliance.' },
    },
    searchKeys: ['code', 'vehicleName', 'hubCode', 'currentHub', 'cityCode', 'driverName', 'transporter', 'merchantCode'],
    // staging's Asset Data filters: Status · Facility · Asset Type
    filterKeys: [{ key: 'assetType', label: 'Asset Type' }, { key: 'hubCode', label: 'Hub' }, { key: 'enabled', label: 'Status' }],
  },
  // storageLocation: type REQUIRED with the full staging oneof — all four of
  // STAGING/STORAGE/DAMAGE/EXCESS verified by PUT probe 2026-08-27 (an earlier
  // audit wrongly recorded STORAGE/DAMAGE as rejected); PUT matches by CODE
  // (immutable), not id
  'storage-location': {
    entity: 'storageLocation', title: 'Storage Location', noun: 'storage location',
    subtitle: 'Staging, storage, damage and excess areas inside your facilities',
    catPath: '/console/settings/masters/fleet_assets',
    titleKey: 'name',
    columns: [
      ...CODE_NAME_COLUMNS,
      { key: 'hubCode', label: 'Facility Hub', render: (r: MasterRecord) => s(r.hubCode) || '—' },
      { key: 'type', label: 'Storage Type', render: (r: MasterRecord) => s(r.type) || '—' },
    ],
    fields: [
      { key: 'code', label: 'Code', type: 'text', required: true, placeholder: 'eg, STG-TX-01', section: 'Storage Details' },
      { key: 'name', label: 'Name', type: 'text', required: true, placeholder: 'eg, Texas Outbound Staging Lane', section: 'Storage Details' },
      { key: 'hubCode', label: 'Facility Hub', type: 'select', required: true, searchable: true, optionsFromLabeled: hubOptions, section: 'Storage Details' },
      { key: 'type', label: 'Storage Type', type: 'select', required: true, options: ['STAGING', 'STORAGE', 'DAMAGE', 'EXCESS'], section: 'Storage Details' },
    ],
    sectionMeta: {
      'Storage Details': { icon: <Warehouse size={15} className="text-brand-500" />, caption: 'Identity and purpose of this storage area — staging, general storage, damage quarantine or excess.' },
    },
    searchKeys: ['code', 'name', 'hubCode'],
    // staging's filters: Status · Facility Hub · Storage Type
    filterKeys: [{ key: 'hubCode', label: 'Facility Hub' }, { key: 'type', label: 'Storage Type' }, { key: 'enabled', label: 'Status' }],
  },
  // tagMaster: a tag is just a code + a co-load exclusion list — no name or
  // description fields exist on the entity
  'tags': {
    entity: 'tagMaster', title: 'Tags', noun: 'tag',
    subtitle: 'Handling tags used across consignments, docks and routing',
    catPath: '/console/settings/masters/fleet_assets',
    columns: [
      { key: 'code', label: 'Tag', render: (r: MasterRecord) => (
        <span className="rounded-full bg-warm-100 px-2.5 py-0.5 text-[12px] font-bold text-ink-2">{s(r.code)}</span>
      ) },
      { key: 'coload_not_tags', label: 'Cannot Co-load With', render: (r: MasterRecord) =>
        Array.isArray(r.coload_not_tags) && r.coload_not_tags.length ? (
          <span className="inline-flex flex-wrap gap-1">
            {(r.coload_not_tags as string[]).map((t) => (
              <span key={t} className="rounded-full bg-danger-bg px-2 py-0.5 text-[12px] font-bold text-danger-fg">{t}</span>
            ))}
          </span>
        ) : '—' },
      // staging's Created At / Last Updated At columns, merged
      { key: 'lastUpdatedAt', label: 'Updated', render: (r: MasterRecord) => {
        const upd = s(r.lastUpdatedAt).slice(0, 10)
        const crt = s(r.createdAt).slice(0, 10)
        return (upd || crt) ? (
          <div>
            <p>{upd || '—'}</p>
            {!!crt && <p className="text-[12px] text-ink-3">Created {crt}</p>}
          </div>
        ) : '—'
      } },
    ],
    fields: [
      { key: 'code', label: 'Tag Code', type: 'text', required: true, placeholder: 'eg, FRAGILE', section: 'Tag Details' },
      { key: 'coload_not_tags', label: 'Cannot Co-load With', type: 'multi', optionsFrom: codesOf('tagMaster'), section: 'Tag Details' },
    ],
    sectionMeta: {
      'Tag Details': { icon: <Tag size={15} className="text-brand-500" />, caption: 'The tag itself, and any tags whose loads must never share a vehicle with it.' },
    },
    searchKeys: ['code'],
    // staging's tags page filters on Status only
    filterKeys: [{ key: 'enabled', label: 'Status' }],
  },
}
