/**
 * Configs for every master the master service actually serves (probed live
 * 2026-08-27 — see FAREYE-SETTINGS-APIS.md). Row schemas for serviceType,
 * packageType, consignmentType, hub and businessUnit were read off existing
 * staging rows; the empty entities (vas, sortCode, slot, palletSpace,
 * tagMaster, location, dockMaster, lane, hubToHub, loadType, vehicle,
 * storageLocation) carry the shared BaseModel contract (code, name, enabled) —
 * the create API validates and surfaces its own message if a tenant wants more.
 *
 * Dropdowns are fed real values: cross-master codes via codesOf(entity), hub
 * lists via fetchHubCodes. Business Parameter and Reason master 500 on every
 * /master/api/v1/* guess — different service, static replica stays.
 */
import { useEffect, useState } from 'react'
import { Input, MenuSelect, Toggle } from './components'
import { fetchServiceableAreaInfo, fetchServiceableCountries, fetchServiceablePostcodes, fetchCities, fetchCompanyTimeZones, fetchCountries, fetchGeoSuggestions, fetchHolidayMasters, fetchHubCodes, fetchHubGeofences, fetchHubsPage, fetchMasterRows, fetchRoutingConfigs, fetchServiceableAreas, saveLegacyHub, saveMasterRows, saveServiceableArea, type MasterRecord, type ServiceableRule } from './settingsApi'
import type { LiveMasterConfig } from './LiveMaster'
import { Building2, CalendarClock, Clock3, MapPin, MapPinned, SlidersHorizontal, Warehouse, X } from 'lucide-react'
import { GeofenceCount, GeofenceModal, GeofencePanel } from './BranchGeofence'
import { BranchServiceableAreas, geoTypeLabel, RuleBuilder } from './ServiceableAreas'
import { BranchZones } from './ZoneMaster'
import BranchSetupFlow, { BRANCH_ADD_STEPS } from './BranchSetupFlow'
import { LocationField } from './MapPicker'
import { codesOf, labeledCodesOf } from './masters/shared'
import { SERVICEORDER_MASTERS } from './masters/serviceOrder'
import { LANEMOVEMENT_MASTERS } from './masters/laneMovement'
import { STOREFRONT_MASTERS } from './masters/storeFront'
import { FLEETASSETS_MASTERS } from './masters/fleetAssets'

/** Branch tab of My Network (new design) — the `branch` entity (NOT `hub`,
 * which serves a filtered subset and drops the active New York row). Staging's
 * page is the FUNCTIONALITY reference only (fields, actions, APIs) — layout is
 * ours. The address block round-trips through the row's `address` JSON string
 * (camelCase keys — the server stores it opaquely, "{}" on existing rows).
 * timeZone is REQUIRED by the write validator. Holiday Master / Routing
 * Configuration have no exposed master on this account (probed 2026-08-27) —
 * their selects fall back to inputs until rows exist. */
const ADDRESS_KEYS = ['addressLine1', 'addressLine2', 'addressLine3', 'country', 'state', 'zipcode', 'suburb', 'latitude', 'longitude'] as const

export const BRANCH_CFG: LiveMasterConfig = {
  entity: 'branch', title: 'Branch', noun: 'branch',
  subtitle: 'Manage the branches and facilities of your network',
  catPath: '/console/settings/masters/network_location',
  titleKey: 'name',
  // STAGING'S EXACT READ: GET /v1/app/rest/hubs_page (what its Setup Branch
  // list renders) — merged with the master `branch` rows (coordinates in the
  // address JSON), geofence counts and city names.
  fetchRows: async () => {
    const [legacy, masterRows, cities] = await Promise.all([
      fetchHubsPage(),
      fetchMasterRows('branch').catch(() => [] as MasterRecord[]),
      fetchCities().catch(() => [] as { value: string; label: string }[]),
    ])
    // geofence counts from the SAME legacy store staging's page reads.
    // NOT the multiple_hub endpoint — that returns ENABLED fences only and
    // undercounts (Florida showed 3 of its 4); per-hub reads give totals.
    const counts = new Map<unknown, number>()
    await Promise.all(legacy.map(async (h) => {
      try {
        const fences = await fetchHubGeofences(String(h.id), h.cityId as number | undefined)
        counts.set(Number(h.id), fences.length)
      } catch { /* count stays 0 */ }
    }))
    const cityName = new Map(cities.map((c) => [c.value, c.label]))
    const masterById = new Map(masterRows.map((m) => [m.id, m]))
    return legacy.map((h) => {
      const m = masterById.get(h.id) ?? {}
      const addr = (h.address ?? {}) as Record<string, unknown>
      let mAddr: Record<string, unknown> = {}
      try { mAddr = JSON.parse(String((m as MasterRecord).address ?? '{}')) as Record<string, unknown> } catch { /* opaque */ }
      const str = (v: unknown) => (v == null ? '' : String(v))
      return {
        ...m, ...h,
        // legacy address object is authoritative; master JSON fills gaps (coords)
        contactPerson: str(addr.contactPerson ?? (m as MasterRecord).contactPerson),
        contactPersonNumber: str(addr.contactNumber ?? (m as MasterRecord).contactPersonNumber),
        addressLine1: str(addr.addressLine1 ?? mAddr.addressLine1),
        addressLine2: str(addr.addressLine2 ?? mAddr.addressLine2),
        addressLine3: str(addr.addressLine3 ?? mAddr.addressLine3),
        state: str(addr.state ?? mAddr.state),
        country: str(addr.country ?? mAddr.country),
        suburb: str(h.region ?? addr.suburb ?? mAddr.suburb),
        zipcode: str(h.zipCode ?? mAddr.zipcode),
        branchType: str(h.hubType ?? (m as MasterRecord).branchType),
        latitude: str(mAddr.latitude ?? ''),
        longitude: str(mAddr.longitude ?? ''),
        geofenceCount: counts.get(h.id) ?? 0,
        cityName: cityName.get(String(h.cityId ?? '')) ?? '',
      }
    })
  },
  normalize: (r) => {
    const bt = String(r.branchType ?? '')
    return {
      ...r,
      typeLabel: bt === 'sc' ? 'Sorting Center' : bt === 'cx' ? 'Cross Dock' : bt || 'Hub',
      timeZone: r.timeZone ?? 'America/New_York',
    }
  },
  beforeSave: async (row) => {
    const num = (v: unknown) => (v == null || String(v).trim() === '' || isNaN(Number(v)) ? null : Number(v))
    return {
      ...row,
      address: JSON.stringify(Object.fromEntries(ADDRESS_KEYS.map((k) => [k, String(row[k] ?? '')]))),
      cityId: num(row.cityId),
      latitude: num(row.latitude),
      longitude: num(row.longitude),
      parentHubId: row.branchType === 'cx' ? num(row.parentHubId) : null,
      routingConfigurationId: num(row.routingConfigurationId),
    }
  },
  // WRITE = staging's own endpoint (POST /app/rest/hubs) as PRIMARY; the master
  // `branch` entity is synced best-effort on updates so both stores agree.
  saveRows: async (rows, exists) => {
    for (const r of rows) {
      await saveLegacyHub(r)
      if (exists && r.id != null) {
        try {
          const lat = Number(r.latitude), lng = Number(r.longitude)
          await saveMasterRows('branch', [{
            ...r,
            latitude: isFinite(lat) && lat >= 0 ? lat : null,
            longitude: isFinite(lng) && lng >= 0 ? lng : null,
          }], true)
        } catch (e) { console.error('master branch sync failed:', e) }
      }
    }
  },
  columnsWith: ({ openView }) => [
    // identity merged: name bold with the code beneath (consignment table style)
    { key: 'name', label: 'Branch', render: (r: MasterRecord) => (
      <div>
        <p className="font-bold text-brand-500">{String(r.name ?? '')}</p>
        <p className="text-[12px] text-ink-3">{String(r.code ?? '')}</p>
      </div>
    ) },
    { key: 'typeLabel', label: 'Branch Type' },
    { key: 'contact', label: 'Contact', render: (r: MasterRecord) => (r.contactPerson || r.contactPersonNumber) ? (
      <div>
        <p>{String(r.contactPerson ?? '') || '—'}</p>
        {r.contactPersonNumber ? <p className="text-[12px] text-ink-3">{String(r.contactPersonNumber)}</p> : null}
      </div>
    ) : '—' },
    // multiline like the identity cell: street on top, locality muted beneath
    { key: 'addressText', label: 'Address', render: (r: MasterRecord) => {
      const line1 = String(r.addressLine1 ?? '').trim()
      const rest = [r.cityName, r.state, r.zipcode, r.country]
        .map((v) => String(v ?? '').trim()).filter(Boolean)
      if (!line1 && rest.length === 0) return '—'
      const primary = line1 || rest.shift()
      return (
        <div>
          <p>{primary}</p>
          {rest.length > 0 && <p className="text-[12px] text-ink-3">{rest.join(', ')}</p>}
        </div>
      )
    } },
    // count chip navigates straight into the record's Geofences tab
    { key: 'geofenceCount', label: 'Geofences', render: (r: MasterRecord) => <GeofenceCount branch={r} onOpen={() => openView(r, 3)} /> },
  ],
  columns: [],
  fields: [
    { section: 'Branch Details', key: 'name', label: 'Branch Name', type: 'text', required: true, placeholder: 'Enter Branch Name' },
    { section: 'Branch Details', key: 'code', label: 'Branch Code', type: 'text', required: true, placeholder: 'Enter a Unique Branch Code' },
    // staging's real enum (from its own render code): sc = Sorting Center,
    // cx = Cross Dock; null displays as "Hub" in the list
    { section: 'Branch Details', key: 'branchType', label: 'Branch Type', type: 'select',
      options: ['sc', 'cx'], optionLabels: { '': 'Hub', sc: 'Sorting Center', cx: 'Cross Dock' } },
    // Cross Docks hang off a parent sortation center — staging asks Parent Hub
    // only for that type
    { section: 'Branch Details', key: 'parentHubId', label: 'Parent Hub', type: 'select',
      visible: (r) => r.branchType === 'cx',
      optionsFromLabeled: () => fetchMasterRows('branch').then((rs) => rs
        .filter((r) => r.id != null && r.branchType !== 'cx')
        .map((r) => ({ value: String(r.id), label: String(r.name ?? r.code ?? r.id) }))) },
    // Business Unit ≠ the merchant master: staging's own branch form calls
    // businessUnit/fetch yet renders this dropdown EMPTY on this account (the
    // merchant row is not a business unit). Stay blank like staging until the
    // account has real business-unit rows.
    { section: 'Branch Details', key: 'businessUnitCode', label: 'Business Unit', type: 'select', placeholder: 'Select Business Unit' },
    { section: 'Branch Details', key: 'contactPerson', label: 'Contact Person', type: 'text' },
    { section: 'Branch Details', key: 'contactPersonNumber', label: 'Contact Number', type: 'text' },

    { section: 'Address', key: 'addressLine1', label: 'Address Line 1', type: 'text' },
    { section: 'Address', key: 'addressLine2', label: 'Address Line 2', type: 'text' },
    { section: 'Address', key: 'addressLine3', label: 'Address Line 3 (Landmark)', type: 'text' },
    // Address cascade — the exact APIs staging's form calls: countries from
    // the geofence service (ISO code stored), City = the CITY MASTER via
    // cityId, and State/Zipcode/Suburb from geofence/search with the captured
    // payload (lowercase level: state/pinCode/suburb), refetching per country.
    { section: 'Address', key: 'country', label: 'Country', type: 'select', searchable: true, optionsFromLabeled: fetchCountries },
    { section: 'Address', key: 'state', label: 'State', type: 'select', dependsOn: 'country', searchable: true, creatable: true,
      optionsFromDep: (code) => fetchGeoSuggestions('state', code) },
    { section: 'Address', key: 'cityId', label: 'City', type: 'select', required: true, searchable: true, optionsFromLabeled: fetchCities },
    { section: 'Address', key: 'zipcode', label: 'Zipcode', type: 'select', dependsOn: 'country', searchable: true, creatable: true,
      optionsFromDep: (code) => fetchGeoSuggestions('pinCode', code) },
    // staging's own form fires ONLY state+pinCode levels — its Suburb dropdown
    // is fed by the pinCode list (suburb ≈ postal zone in FarEye's model), so
    // suburb intentionally shows the same values as Zipcode.
    { section: 'Address', key: 'suburb', label: 'Suburb', type: 'select', dependsOn: 'country', searchable: true, creatable: true,
      optionsFromDep: (code) => fetchGeoSuggestions('pinCode', code) },
    // lat/long have no standalone inputs — the coordinates live in (and are
    // set by) the Branch Location control below; the row still carries
    // latitude/longitude on the wire.
    // staging's anatomy: read-only coordinates + "Select Location" opening the map POPUP
    { section: 'Address', key: 'branchLocation', label: 'Branch Location', type: 'custom',
      renderCustom: (row, set, readOnly) => (
        <LocationField lat={row.latitude as string} lng={row.longitude as string} readOnly={readOnly}
          defaultQuery={[row.addressLine1, row.addressLine2, row.state, row.zipcode, row.country]
            .map((v) => String(v ?? '').trim()).filter(Boolean).join(', ')}
          onPick={(la, ln) => set({ latitude: String(la), longitude: String(ln) })} />
      ) },

    { section: 'Operational', key: 'timeZone', label: 'Time Zone', type: 'select', required: true, optionsFrom: fetchCompanyTimeZones, init: 'America/New_York' },
    { section: 'Operational', key: 'holidayMasterCode', label: 'Holiday Master', type: 'select', optionsFromLabeled: fetchHolidayMasters },

    { section: 'Other Details', key: 'routingConfigurationId', label: 'Routing Configuration', type: 'select', optionsFromLabeled: fetchRoutingConfigs, placeholder: 'Select' },
    { section: 'Other Details', key: 'isReshufflingOnOrderEnable', label: 'Allow Reshuffle Orders', type: 'toggle' },
  ],
  searchKeys: ['code', 'name', 'typeLabel', 'country'],
  filterKeys: [
    { key: 'typeLabel', label: 'Branch Type' },
    { key: 'enabled', label: 'Status' },
    { key: 'country', label: 'Country' },
  ],
  sectionMeta: {
    'Branch Details': { icon: <Building2 size={15} className="text-brand-500" />, caption: 'Identity, type and ownership of this facility.' },
    'Address': { icon: <MapPin size={15} className="text-brand-500" />, caption: 'Where the branch is located — address lines and coordinates.' },
    'Operational': { icon: <CalendarClock size={15} className="text-brand-500" />, caption: 'Time zone, holiday calendar and dispatch cut-off times.' },
    'Other Details': { icon: <SlidersHorizontal size={15} className="text-brand-500" />, caption: 'Routing configuration and order handling behaviour.' },
  },
  rowModal: {
    label: 'Manage Geofences', icon: <MapPinned size={14} />,
    render: (row, close) => <GeofenceModal branch={row} onClose={close} />,
  },
  // serviceable areas and zones always belong to a branch — the branch view
  // shows its own slices of both; Geofences stays LAST
  detailTabs: [
    { label: 'Serviceable Areas', render: (row) => <BranchServiceableAreas branch={row} /> },
    { label: 'Zones', render: (row) => <BranchZones branch={row} /> },
    { label: 'Geofences', render: (row) => <GeofencePanel branch={row} /> },
  ],
  // Add Branch is a 3-step flow: the form is step 1; steps 2-3 (coverage +
  // zones) render after the create and are skippable
  addSteps: BRANCH_ADD_STEPS,
  postAddFlow: (created, done) => <BranchSetupFlow created={created} done={done} />,
}

/** Serviceable Areas (My Network tab 2) — staging's EXACT v2 endpoints,
 * captured live from its wizard step 2 (2026-08-27):
 *   list POST /master/api/v2/branch/serviceableArea/list (includeSubDetails)
 *   create POST /master/api/v2/branch/serviceableArea
 *   update/toggle PUT same path with the FULL row — APPEND-ONLY (the server
 *   refuses to drop rule keys or values; no delete exists) → the popup offers
 *   Edit + Enable/Disable only, and the form locks already-saved areas. */
export const SERVICEABLE_AREA_CFG: LiveMasterConfig = {
  entity: 'v2/serviceableArea', title: 'Serviceable Area', noun: 'serviceable area',
  subtitle: 'Define the delivery coverage each branch serves — states, cities, suburbs or postal codes',
  catPath: '/console/settings/masters/network_location',
  codeKey: 'branchName', titleKey: 'branchName',
  fetchRows: async () => {
    const [rows, countries] = await Promise.all([
      fetchServiceableAreas(),
      fetchCountries().catch(() => [] as { value: string; label: string }[]),
    ])
    const countryName = new Map(countries.map((c) => [c.value, c.label]))
    return rows.map((r) => ({ ...r, countryName: countryName.get(String(r.country ?? '')) ?? String(r.country ?? '') }))
  },
  normalize: (r) => {
    const rules = Array.isArray(r.serviceableRule) ? r.serviceableRule as ServiceableRule[] : []
    return {
      ...r,
      typeLabel: rules.map((ru) => geoTypeLabel(ru.key)).join(', ') || '—',
      areaValues: rules.flatMap((ru) => ru.value.map((v) => v.value)),
      sourceLabel: r.source === 'GLOBAL_GEOFENCES' ? 'Global' : String(r.source ?? '') || '—',
    }
  },
  saveRows: async (rows, exists) => {
    for (const r of rows) await saveServiceableArea(r, exists)
  },
  beforeSave: async (row) => {
    const hubs = await fetchHubsPage()
    const hub = hubs.find((h) => String(h.name) === String(row.branchName))
    return {
      ...row,
      branchId: hub ? Number(hub.id) : row.branchId,
      source: row.source ?? 'GLOBAL_GEOFENCES',
      serviceableRule: (Array.isArray(row.serviceableRule) ? row.serviceableRule as ServiceableRule[] : [])
        .filter((ru) => ru.key && ru.value.length > 0),
    }
  },
  columns: [
    { key: 'branchName', label: 'Branch', render: (r: MasterRecord) => (
      <span className="font-bold text-brand-500">{String(r.branchName ?? '')}</span>
    ) },
    { key: 'areaValues', label: 'Serviceable Area', render: (r: MasterRecord) => {
      const vals = (r.areaValues as string[] | undefined) ?? []
      if (!vals.length) return '—'
      return (
        <span className="inline-flex flex-wrap items-center gap-1">
          {vals.slice(0, 3).map((v) => (
            <span key={v} className="rounded-full bg-warm-100 px-2 py-0.5 text-[12px] font-bold text-ink-2">{v}</span>
          ))}
          {vals.length > 3 && <span className="text-[12px] text-ink-3">+{vals.length - 3}</span>}
        </span>
      )
    } },
    { key: 'typeLabel', label: 'Type' },
    { key: 'countryName', label: 'Country' },
    { key: 'sourceLabel', label: 'Source', render: (r: MasterRecord) => (
      <span className="rounded-full bg-warm-100 px-2.5 py-0.5 text-[12px] font-bold text-ink-2">{String(r.sourceLabel ?? '')}</span>
    ) },
    { key: 'exceptionsExists', label: 'Exclusions', render: (r: MasterRecord) => r.exceptionsExists ? 'Yes' : '—' },
  ],
  fields: [
    { key: 'branchName', label: 'Branch', type: 'select', required: true, section: 'Coverage Setup',
      optionsFrom: () => fetchHubsPage().then((hs) => hs.map((h) => String(h.name))) },
    { key: 'country', label: 'Country', type: 'select', required: true, searchable: true, section: 'Coverage Setup',
      optionsFromLabeled: fetchCountries },
    { key: 'serviceableRule', label: '', type: 'custom', section: 'Service Zones',
      renderCustom: (row, set, readOnly) => <RuleBuilder row={row} set={set} readOnly={readOnly} /> },
  ],
  sectionMeta: {
    'Coverage Setup': { icon: <Building2 size={15} className="text-brand-500" />, caption: 'Which branch this coverage belongs to, and the country it operates in.' },
    'Service Zones': { icon: <MapPinned size={15} className="text-brand-500" />, caption: 'Mark states, cities, suburbs or postal codes as serviceable.' },
  },
  searchKeys: ['branchName', 'country', 'countryName'],
  filterKeys: [{ key: 'branchName', label: 'Branch' }, { key: 'countryName', label: 'Country' }],
  // opening a coverage row goes straight to the card editor — the same screen
  // the branch view's Serviceable Areas tab shows
  rowClickEdits: true,
}

/* Zone Master (My Network tab 3) lives in src/nueva/ZoneMaster.tsx — a bespoke
 * page on staging's zoneMaster endpoints (per-area assignment table doesn't fit
 * the field-grid engine). */

export const LOCATION_TYPES = [
  { value: 'MERCHANT_LOCATION', label: 'Merchant Location' },
  { value: 'CUSTOMER_LOCATION', label: 'Customer Location' },
  { value: 'PUDO', label: 'PUDO' },
  { value: 'HUB', label: 'Hub' },
  { value: 'PARCEL_LOCKER', label: 'Parcel Locker' },
]

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

export function defaultOperatingHours() {
  return WEEKDAYS.map((day) => ({ day, serviceable: true, open_time: '09:00', close_time: '17:00', is_primary: true }))
}


export const LIVE_MASTERS: Record<string, LiveMasterConfig> = {
  // LOCATION MASTER — staging's page runs on the `businessUnitLocation`
  // entity (bundle-mined + verified 2026-08-27), NOT the v1 `location` entity.
  // snake_case payload with an address object, per-day operating hours and a
  // location-type enum; activate/deactivate = PUT /activate | /deactivate.
  'location-master': {
    entity: 'businessUnitLocation', title: 'Location Master', noun: 'location',
    subtitle: 'Merchant, customer and PUDO locations with contacts and operating hours',
    catPath: '/console/settings/masters/network_location',
    titleKey: 'name',
    // stamp branchName onto each row so the Branch select + filter work on names
    fetchRows: async () => {
      const [rows, hubs] = await Promise.all([fetchMasterRows('businessUnitLocation'), fetchHubsPage()])
      const byId = new Map(hubs.map((h) => [String(h.id), String(h.name)]))
      return rows.map((r) => ({ ...r, branchName: byId.get(String(r.branch_id)) ?? '' }))
    },
    normalize: (r) => {
      const a = (r.address ?? {}) as Record<string, unknown>
      const cap = (r.capacity ?? {}) as Record<string, unknown>
      const fb = (r.fallback_address ?? {}) as Record<string, unknown>
      const str = (v: unknown) => (v == null ? '' : String(v))
      // business_unit_code / _name are ARRAYS on this entity (a location can
      // serve several merchants); older rows may hold plain strings
      const arr = (v: unknown) => Array.isArray(v) ? v.map(String).filter(Boolean) : (v ? [String(v)] : [])
      const buNames = arr(r.business_unit_name)
      const buCodes = arr(r.business_unit_code)
      return {
        ...r,
        typeLabel: LOCATION_TYPES.find((t) => t.value === r.type)?.label ?? str(r.type),
        business_unit_code: buCodes,
        merchantDisplay: (buNames.length ? buNames : buCodes).join(', '),
        addr_country: str(a.country), addr_postal: str(a.postal_code), addr_suburb: str(a.suburb),
        addr_city: str(a.city), addr_state: str(a.state),
        addr_line1: str(a.address_line1), addr_line2: str(a.address_line2), addr_line3: str(a.address_line3),
        addr_lat: str(a.latitude ?? ''), addr_lng: str(a.longitude ?? ''),
        cap_max: cap.maximum_capacity ?? null, cap_weight: cap.maximum_weight ?? null,
        cap_weight_uom: str(cap.weight_uom), cap_volume: cap.maximum_volume ?? null,
        cap_volume_uom: str(cap.volume_uom), cap_len: cap.maximum_length ?? null,
        cap_breadth: cap.maximum_breadth ?? null, cap_height: cap.maximum_height ?? null,
        cap_dim_uom: str(cap.dimension_uom),
        fb_line1: str(fb.fallback_address_line1), fb_city: str(fb.fallback_city),
        fb_state: str(fb.fallback_state), fb_postal: str(fb.fallback_postal_code),
        fb_country: str(fb.fallback_country),
      }
    },
    beforeSave: async (row) => {
      const [hubs, merchants, countries] = await Promise.all([
        fetchHubsPage(),
        fetchMasterRows('businessUnit').catch(() => [] as MasterRecord[]),
        fetchServiceableCountries().catch(() => []),
      ])
      const hub = hubs.find((h) => String(h.name) === String(row.branchName) || String(h.id) === String(row.branch_id))
      const num = (v: unknown) => { const n = Number(v); return isFinite(n) ? n : 0 }
      const buCodes = Array.isArray(row.business_unit_code)
        ? (row.business_unit_code as unknown[]).map(String).filter(Boolean)
        : (row.business_unit_code ? [String(row.business_unit_code)] : [])
      return {
        ...row,
        branch_id: hub ? Number(hub.id) : num(row.branch_id),
        type: String(row.type ?? '') || 'MERCHANT_LOCATION',
        business_unit_code: buCodes,
        business_unit_name: buCodes.map((c) => String(merchants.find((m) => String(m.code) === c)?.name ?? c)),
        distance: num(row.distance),
        dock_count: num(row.dock_count),
        avg_service_time: num(row.avg_service_time),
        max_vehicle_count: num(row.max_vehicle_count),
        lift_gate_required: !!row.lift_gate_required,
        fork_lift_available: !!row.fork_lift_available,
        address: {
          address_line1: String(row.addr_line1 ?? ''), address_line2: String(row.addr_line2 ?? ''),
          address_line3: String(row.addr_line3 ?? ''),
          country: String(row.addr_country ?? ''), postal_code: String(row.addr_postal ?? ''),
          suburb: String(row.addr_suburb ?? ''), city: String(row.addr_city ?? ''), state: String(row.addr_state ?? ''),
          latitude: num(row.addr_lat), longitude: num(row.addr_lng),
          country_code: countries.find((c) => c.value === String(row.addr_country))?.code ?? '',
        },
        capacity: {
          maximum_capacity: num(row.cap_max), maximum_weight: num(row.cap_weight),
          weight_uom: String(row.cap_weight_uom ?? ''), maximum_volume: num(row.cap_volume),
          volume_uom: String(row.cap_volume_uom ?? ''), maximum_length: num(row.cap_len),
          maximum_breadth: num(row.cap_breadth), maximum_height: num(row.cap_height),
          dimension_uom: String(row.cap_dim_uom ?? ''),
        },
        fallback_address_available: !!row.fallback_address_available,
        fallback_address: {
          fallback_address_line1: String(row.fb_line1 ?? ''), fallback_address_line2: '', fallback_address_line3: '',
          fallback_city: String(row.fb_city ?? ''), fallback_state: String(row.fb_state ?? ''),
          fallback_postal_code: String(row.fb_postal ?? ''), fallback_country: String(row.fb_country ?? ''),
          fallback_suburb: '', fallback_latitude: null, fallback_longitude: null, fallback_country_code: '',
        },
        // every serviceable day keeps exactly one primary window
        operating_hours: (() => {
          const oh = (Array.isArray(row.operating_hours) && (row.operating_hours as unknown[]).length
            ? row.operating_hours : defaultOperatingHours()) as { day: string; is_primary?: boolean; serviceable?: boolean }[]
          const seen = new Set<string>()
          return oh.map((w) => {
            const first = !seen.has(w.day) && !!w.serviceable
            const anyPrimary = oh.some((x) => x.day === w.day && x.is_primary && x.serviceable)
            if (w.serviceable) seen.add(w.day)
            return { ...w, is_primary: anyPrimary ? !!w.is_primary : first }
          })
        })(),
      }
    },
    columns: [
      { key: 'name', label: 'Location', render: (r: MasterRecord) => (
        <div>
          <p className="font-bold text-brand-500">{String(r.name ?? '')}</p>
          <p className="text-[12px] text-ink-3">{String(r.code ?? '')}</p>
        </div>
      ) },
      { key: 'typeLabel', label: 'Type' },
      { key: 'merchantDisplay', label: 'Merchant', render: (r: MasterRecord) => {
        const names = String(r.merchantDisplay ?? '').split(', ').filter(Boolean)
        if (!names.length) return '—'
        return (
          <span>
            {names[0]}
            {names.length > 1 && (
              <span className="ml-1.5 rounded-md border border-warm-200 bg-warm-50 px-1.5 py-0.5 text-[11px] font-bold text-ink-3">+{names.length - 1}</span>
            )}
          </span>
        )
      } },
      { key: 'branchName', label: 'Branch', render: (r: MasterRecord) => String(r.branchName ?? '') || '—' },
      { key: 'contact', label: 'Contact', render: (r: MasterRecord) => (r.contact_person || r.contact_number) ? (
        <div>
          <p>{String(r.contact_person ?? '') || '—'}</p>
          {r.contact_number ? <p className="text-[12px] text-ink-3">{String(r.contact_number)}</p> : null}
        </div>
      ) : '—' },
      { key: 'place', label: 'Address', render: (r: MasterRecord) =>
        [r.addr_suburb, r.addr_city, r.addr_state, r.addr_postal].map((v) => String(v ?? '').trim()).filter(Boolean).join(', ') || '—' },
    ],
    fields: [
      { key: 'type', label: 'Location Type', type: 'select', required: true,
        options: LOCATION_TYPES.map((t) => t.value),
        optionLabels: Object.fromEntries(LOCATION_TYPES.map((t) => [t.value, t.label])),
        init: 'MERCHANT_LOCATION', section: 'Location Details' },
      { key: 'code', label: 'Location Code/Id', type: 'text', required: true, section: 'Location Details' },
      { key: 'name', label: 'Location Name', type: 'text', required: true, section: 'Location Details' },
      { key: 'branchName', label: 'Branch', type: 'select', optionsFrom: fetchHubCodes, section: 'Location Details' },
      { key: 'business_unit_code', label: 'Merchants', type: 'multi', optionsFromLabeled: labeledCodesOf('businessUnit'), section: 'Location Details' },
      { key: 'contact_person', label: 'Contact Person', type: 'text', section: 'Location Details' },
      { key: 'contact_number', label: 'Contact Number', type: 'text', section: 'Location Details' },
      { key: 'email_id', label: 'Email ID', type: 'text', section: 'Location Details' },
      { key: 'distance', label: 'Distance', type: 'number', section: 'Facility', placeholder: 'eg, 12.5' },
      { key: 'distance_uom', label: 'Distance UOM', type: 'select', options: ['KM', 'MILES'], section: 'Facility' },
      { key: 'dock_count', label: 'Dock Count', type: 'number', section: 'Facility' },
      { key: 'avg_service_time', label: 'Avg Service Time (min)', type: 'number', section: 'Facility' },
      { key: 'max_vehicle_count', label: 'Max Vehicle Count', type: 'number', section: 'Facility' },
      { key: 'lift_gate_required', label: 'Lift Gate Required', type: 'toggle', section: 'Facility' },
      { key: 'fork_lift_available', label: 'Fork Lift Available', type: 'toggle', section: 'Facility' },
      { key: 'service_type', label: 'Service Types', type: 'multi', optionsFromLabeled: labeledCodesOf('serviceType'), section: 'Services' },
      { key: 'consignment_type', label: 'Consignment Types', type: 'multi', optionsFromLabeled: labeledCodesOf('consignmentType'), section: 'Services' },
      { key: 'vehicle_type', label: 'Vehicle Types', type: 'multi',
        options: ['Trailer', 'Prime Mover', 'Rigid', 'Dolly', 'Flat Bed', 'Reefer', 'Tanker', 'Container'], section: 'Services' },
      { key: 'payment_mode', label: 'Payment Modes', type: 'multi', options: ['CASH', 'CARD', 'ONLINE', 'CHEQUE'], section: 'Services' },
      { key: 'communication_preference', label: 'Communication Preference', type: 'multi',
        options: ['EMAIL', 'SMS', 'WHATSAPP', 'CALL'],
        optionLabels: { EMAIL: 'Email', SMS: 'SMS', WHATSAPP: 'WhatsApp', CALL: 'Phone Call' }, section: 'Services' },
      { key: 'language', label: 'Languages', type: 'multi', options: ['English', 'Spanish', 'French'], section: 'Services' },
      { key: 'cap_max', label: 'Maximum Capacity (units)', type: 'number', section: 'Capacity' },
      { key: 'cap_weight', label: 'Maximum Weight', type: 'number', section: 'Capacity' },
      { key: 'cap_weight_uom', label: 'Weight UOM', type: 'select', options: ['KG', 'LBS'], section: 'Capacity' },
      { key: 'cap_volume', label: 'Maximum Volume', type: 'number', section: 'Capacity' },
      { key: 'cap_volume_uom', label: 'Volume UOM', type: 'select', options: ['CBM', 'CFT'], section: 'Capacity' },
      { key: 'cap_len', label: 'Maximum Length', type: 'number', section: 'Capacity' },
      { key: 'cap_breadth', label: 'Maximum Breadth', type: 'number', section: 'Capacity' },
      { key: 'cap_height', label: 'Maximum Height', type: 'number', section: 'Capacity' },
      { key: 'cap_dim_uom', label: 'Dimension UOM', type: 'select', options: ['CM', 'IN', 'M'], section: 'Capacity' },
      { key: 'addr_line1', label: 'Address Line 1', type: 'text', section: 'Address Details' },
      { key: 'addr_line2', label: 'Address Line 2', type: 'text', section: 'Address Details' },
      { key: 'addr_line3', label: 'Address Line 3', type: 'text', section: 'Address Details' },
      { key: 'addr_cascade', label: '', type: 'custom', section: 'Address Details',
        renderCustom: (row, set, readOnly) => <LocationAddressCascade row={row} set={set} readOnly={readOnly} /> },
      { key: 'fallback_address_available', label: 'Fallback Address Available', type: 'toggle', section: 'Fallback Address' },
      { key: 'fb_line1', label: 'Fallback Address Line 1', type: 'text',
        visible: (row) => !!row.fallback_address_available, section: 'Fallback Address' },
      { key: 'fb_city', label: 'Fallback City', type: 'text',
        visible: (row) => !!row.fallback_address_available, section: 'Fallback Address' },
      { key: 'fb_state', label: 'Fallback State', type: 'text',
        visible: (row) => !!row.fallback_address_available, section: 'Fallback Address' },
      { key: 'fb_postal', label: 'Fallback Postal Code', type: 'text',
        visible: (row) => !!row.fallback_address_available, section: 'Fallback Address' },
      { key: 'fb_country', label: 'Fallback Country', type: 'text',
        visible: (row) => !!row.fallback_address_available, section: 'Fallback Address' },
      { key: 'operating_hours', label: '', type: 'custom', section: 'Operating Hours',
        renderCustom: (row, set, readOnly) => <OperatingHoursEditor row={row} set={set} readOnly={readOnly} /> },
    ],
    sectionMeta: {
      'Location Details': { icon: <MapPin size={15} className="text-brand-500" />, caption: 'What this location is, who runs it and how to reach them.' },
      'Address Details': { icon: <MapPinned size={15} className="text-brand-500" />, caption: 'Street address and the serviceable-area cascade — pick country and postal code, the rest auto-fills.' },
      'Facility': { icon: <Warehouse size={15} className="text-brand-500" />, caption: 'On-site handling — docks, equipment and how long a vehicle spends here.' },
      'Services': { icon: <SlidersHorizontal size={15} className="text-brand-500" />, caption: 'Service, consignment and vehicle types, payment modes and how to reach the location.' },
      'Capacity': { icon: <Building2 size={15} className="text-brand-500" />, caption: 'Physical limits — units, weight, volume and maximum consignment dimensions.' },
      'Fallback Address': { icon: <MapPin size={15} className="text-brand-500" />, caption: 'An alternate delivery address used when the primary cannot be serviced.' },
      'Operating Hours': { icon: <CalendarClock size={15} className="text-brand-500" />, caption: 'When the location can be serviced — split a day into several windows and mark one as primary.' },
    },
    searchKeys: ['code', 'name', 'merchantDisplay', 'addr_city', 'addr_state', 'addr_postal'],
    filterKeys: [
      { key: 'typeLabel', label: 'Type' },
      { key: 'merchantDisplay', label: 'Merchant' },
      { key: 'branchName', label: 'Branch' },
      { key: 'addr_country', label: 'Country' },
      { key: 'addr_state', label: 'State' },
      { key: 'addr_city', label: 'City' },
      { key: 'addr_suburb', label: 'Suburb' },
      { key: 'addr_postal', label: 'Postal Code' },
      { key: 'enabled', label: 'Status' },
    ],
  },
  // DOCK MASTER — real page contract (bundle-mined): NO code input (the
  // server derives code from name + branch prefix on create, immutable after);
  // vehicle capability is per-type COUNTS (allowedVehicleTypesNew
  // [{id,count,label}]), and pre-loading windows are supported.
  'dock-master': {
    entity: 'dockMaster', title: 'Dock Master', noun: 'dock',
    subtitle: 'Docks, their loading windows and vehicle capacity',
    // the server blanks branchCode on read — the branch survives only as the
    // code prefix ("florida-DOCK-FL-01"), so recover it by hub-code match
    fetchRows: async () => {
      const [rows, hubCodes] = await Promise.all([fetchMasterRows('dockMaster'), fetchHubCodes().catch(() => [] as string[])])
      const byLen = [...hubCodes].sort((a, b) => b.length - a.length)
      return rows.map((r) => ({
        ...r,
        branchCode: String(r.branchCode ?? '') ||
          (byLen.find((h) => String(r.code ?? '').toLowerCase().startsWith(h.toLowerCase() + '-')) ?? ''),
      }))
    },
    catPath: '/console/settings/masters/network_location',
    titleKey: 'name',
    columns: [
      { key: 'name', label: 'Dock', render: (r: MasterRecord) => (
        <div>
          <p className="font-bold text-brand-500">{String(r.name ?? '')}</p>
          <p className="text-[12px] text-ink-3">{String(r.code ?? '')}</p>
        </div>
      ) },
      { key: 'dockType', label: 'Dock Type', render: (r: MasterRecord) => String(r.dockType ?? '') || '—' },
      { key: 'window', label: 'Loading Window', render: (r: MasterRecord) =>
        (r.loadingStartTime || r.loadingEndTime) ? `${r.loadingStartTime ?? ''} – ${r.loadingEndTime ?? ''}` : '—' },
      { key: 'vehicles', label: 'Allowed Vehicles', render: (r: MasterRecord) => {
        const counts = Array.isArray(r.allowedVehicleTypesNew) ? r.allowedVehicleTypesNew as { label?: string; count?: number }[] : []
        if (counts.length) return counts.map((v) => `${v.label} × ${v.count ?? 0}`).join(', ')
        const legacy = Array.isArray(r.allowedVehicleTypes) ? r.allowedVehicleTypes as string[] : []
        return legacy.length ? legacy.join(', ') : '—'
      } },
      { key: 'compatibleTags', label: 'Tags', render: (r: MasterRecord) =>
        Array.isArray(r.compatibleTags) && r.compatibleTags.length ? (
          <span className="inline-flex flex-wrap gap-1">
            {(r.compatibleTags as string[]).map((t) => (
              <span key={t} className="rounded-full bg-warm-100 px-2 py-0.5 text-[12px] font-bold text-ink-2">{t}</span>
            ))}
          </span>
        ) : '—' },
    ],
    fields: [
      { key: 'name', label: 'Name', type: 'text', required: true, section: 'Dock Details' },
      { key: 'branchCode', label: 'Branch', type: 'select', optionsFrom: fetchHubCodes, section: 'Dock Details' },
      { key: 'dockType', label: 'Dock Type', type: 'select', options: ['Loading', 'Unloading', 'Any'], init: 'Any', section: 'Dock Details' },
      { key: 'loadingStartTime', label: 'Loading Start', type: 'text', placeholder: 'eg, 06:00', section: 'Operations' },
      { key: 'loadingEndTime', label: 'Loading End', type: 'text', placeholder: 'eg, 14:00', section: 'Operations' },
      { key: 'swapOverTime', label: 'Swap-over Time (min)', type: 'number', placeholder: 'eg, 15', section: 'Operations' },
      { key: 'remarks', label: 'Remarks', type: 'text', section: 'Operations' },
      { key: 'compatibleTags', label: 'Compatible Tags', type: 'multi', optionsFrom: codesOf('tagMaster'), section: 'Operations' },
      { key: 'allowedVehicleTypesNew', label: '', type: 'custom', section: 'Operations',
        renderCustom: (row, set, readOnly) => <DockVehicleCounts row={row} set={set} readOnly={readOnly} /> },
      { key: 'preLoadingEnabled', label: 'Pre-loading Enabled', type: 'toggle', section: 'Pre-loading' },
      { key: 'preLoadingType', label: 'Pre-loading Day', type: 'select', options: ['T0', 'T-1'],
        optionLabels: { 'T0': 'Same day (T0)', 'T-1': 'Day before (T-1)' },
        visible: (row) => !!row.preLoadingEnabled, section: 'Pre-loading' },
      { key: 'preLoadingStartTime', label: 'Pre-loading Start', type: 'text', placeholder: 'eg, 04:00',
        visible: (row) => !!row.preLoadingEnabled, section: 'Pre-loading' },
      { key: 'preLoadingEndTime', label: 'Pre-loading End', type: 'text', placeholder: 'eg, 06:00',
        visible: (row) => !!row.preLoadingEnabled, section: 'Pre-loading' },
    ],
    beforeSave: async (row) => {
      const counts = (Array.isArray(row.allowedVehicleTypesNew) ? row.allowedVehicleTypesNew as { id?: number; label?: string; count?: unknown }[] : [])
        .map((v, i) => ({ id: v.id ?? i + 1, label: String(v.label ?? ''), count: Number(v.count) || 0 }))
        .filter((v) => v.label && v.count > 0)
      return {
        ...row,
        // no code input — the server derives it from name (+ branch prefix)
        code: String(row.code ?? '') || String(row.name ?? ''),
        swapOverTime: Number(row.swapOverTime) || 0,
        allowedVehicleTypesNew: counts,
        allowedVehicleTypes: counts.map((v) => v.label),
      }
    },
    sectionMeta: {
      'Dock Details': { icon: <Warehouse size={15} className="text-brand-500" />, caption: 'Name, branch and direction of this dock — the code derives from the name.' },
      'Operations': { icon: <Clock3 size={15} className="text-brand-500" />, caption: 'Loading window, turnaround, tags and how many of each vehicle type the dock takes.' },
      'Pre-loading': { icon: <CalendarClock size={15} className="text-brand-500" />, caption: 'Optional pre-loading window — same day or the day before dispatch.' },
    },
    searchKeys: ['code', 'name', 'dockType'],
    filterKeys: [
      { key: 'dockType', label: 'Dock Type' },
      { key: 'branchCode', label: 'Branch' },
      { key: 'enabled', label: 'Status' },
    ],
  },
  ...SERVICEORDER_MASTERS,
  ...LANEMOVEMENT_MASTERS,
  ...STOREFRONT_MASTERS,
  ...FLEETASSETS_MASTERS,
}

/* ---------------- Location Master helpers ------------------------------- */

/** country → postal code cascade; suburb/city/state auto-fill from the
 * serviceable-area lookup (staging's own behaviour, same endpoints) */
function LocationAddressCascade({ row, set, readOnly }: {
  row: MasterRecord
  set: (patch: Record<string, unknown>) => void
  readOnly: boolean
}) {
  const [countries, setCountries] = useState<{ value: string; label: string; code: string }[]>([])
  const [postcodes, setPostcodes] = useState<{ value: string; label: string }[]>([])
  const country = String(row.addr_country ?? '')

  useEffect(() => { fetchServiceableCountries().then(setCountries).catch(() => {}) }, [])
  useEffect(() => {
    setPostcodes([])
    if (country) fetchServiceablePostcodes(country).then(setPostcodes).catch(() => {})
  }, [country])

  const box = (v: unknown) => (
    <div className="flex h-8 items-center rounded-md border border-warm-300 bg-warm-50 px-3 text-[13px] text-ink-2">
      {String(v ?? '') || '—'}
    </div>
  )

  return (
    <div className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2 xl:grid-cols-4">
      <div className="min-w-0">
        <p className="mb-1.5 text-[12px] font-bold text-ink-3">Country</p>
        {readOnly ? box(row.addr_country) : (
          <MenuSelect value={country} placeholder="Select country" searchable
            options={countries.map((c) => c.value)}
            onChange={(v) => set({ addr_country: v, addr_postal: '', addr_suburb: '', addr_city: '', addr_state: '' })} />
        )}
      </div>
      <div className="min-w-0">
        <p className="mb-1.5 text-[12px] font-bold text-ink-3">Postal Code</p>
        {readOnly ? box(row.addr_postal) : (
          <MenuSelect value={String(row.addr_postal ?? '')} placeholder="Select postal code" searchable
            options={postcodes.map((p) => p.value)}
            onChange={async (v) => {
              set({ addr_postal: v })
              const info = await fetchServiceableAreaInfo(country, v).catch(() => null)
              if (info) set({ addr_postal: v, addr_suburb: info.suburb, addr_city: info.city, addr_state: info.state })
            }} />
        )}
      </div>
      <div className="min-w-0">
        <p className="mb-1.5 text-[12px] font-bold text-ink-3">Suburb</p>
        {readOnly ? box(row.addr_suburb) : (
          <Input value={String(row.addr_suburb ?? '')} placeholder="Auto-fills from postal code"
            onChange={(v) => set({ addr_suburb: v })} />
        )}
      </div>
      <div className="min-w-0">
        <p className="mb-1.5 text-[12px] font-bold text-ink-3">City</p>
        {readOnly ? box(row.addr_city) : (
          <Input value={String(row.addr_city ?? '')} placeholder="Auto-fills from postal code"
            onChange={(v) => set({ addr_city: v })} />
        )}
      </div>
      <div className="min-w-0">
        <p className="mb-1.5 text-[12px] font-bold text-ink-3">State</p>
        {readOnly ? box(row.addr_state) : (
          <Input value={String(row.addr_state ?? '')} placeholder="Auto-fills from postal code"
            onChange={(v) => set({ addr_state: v })} />
        )}
      </div>
      <div className="min-w-0">
        <p className="mb-1.5 text-[12px] font-bold text-ink-3">Latitude</p>
        {readOnly ? box(row.addr_lat) : (
          <Input value={String(row.addr_lat ?? '')} placeholder="eg, 25.7959" onChange={(v) => set({ addr_lat: v })} />
        )}
      </div>
      <div className="min-w-0">
        <p className="mb-1.5 text-[12px] font-bold text-ink-3">Longitude</p>
        {readOnly ? box(row.addr_lng) : (
          <Input value={String(row.addr_lng ?? '')} placeholder="eg, -80.3374" onChange={(v) => set({ addr_lng: v })} />
        )}
      </div>
    </div>
  )
}

/** staging's per-weekday operating hours: serviceable toggle + open/close +
 * Primary flag per day */
type OperatingWindow = { day: string; serviceable: boolean; open_time: string; close_time: string; is_primary: boolean }

/** staging's operating-hours model: a day can hold SEVERAL windows (split
 * shifts) and exactly one of them is the primary — that's what the per-entry
 * is_primary flag is for. */
function OperatingHoursEditor({ row, set, readOnly }: {
  row: MasterRecord
  set: (patch: Record<string, unknown>) => void
  readOnly: boolean
}) {
  const entries = (Array.isArray(row.operating_hours) && (row.operating_hours as unknown[]).length
    ? row.operating_hours : defaultOperatingHours()) as OperatingWindow[]

  const forDay = (day: string) => entries.filter((e) => e.day === day)
  const replaceDay = (day: string, wins: OperatingWindow[]) => {
    // keep weekday order stable regardless of how entries were stored
    const next = WEEKDAYS.flatMap((d) => d === day ? wins : forDay(d))
    set({ operating_hours: next })
  }
  const updateWin = (day: string, idx: number, patch: Partial<OperatingWindow>) => {
    const wins = forDay(day).map((w, i) => i === idx ? { ...w, ...patch } : w)
    replaceDay(day, wins)
  }
  const setPrimary = (day: string, idx: number) =>
    replaceDay(day, forDay(day).map((w, i) => ({ ...w, is_primary: i === idx })))
  const addWin = (day: string) => {
    const wins = forDay(day)
    replaceDay(day, [...wins, { day, serviceable: true, open_time: '', close_time: '', is_primary: wins.length === 0 }])
  }
  const removeWin = (day: string, idx: number) => {
    let wins = forDay(day).filter((_, i) => i !== idx)
    if (wins.length && !wins.some((w) => w.is_primary)) wins = wins.map((w, i) => ({ ...w, is_primary: i === 0 }))
    replaceDay(day, wins)
  }
  const toggleDay = (day: string, on: boolean) => {
    const wins = forDay(day)
    if (!wins.length && on) { addWin(day); return }
    replaceDay(day, wins.map((w) => ({ ...w, serviceable: on })))
  }

  if (readOnly) {
    return (
      <div className="rounded-md border border-line">
        <table className="w-full text-[13px]">
          <thead className="bg-warm-25">
            <tr className="border-b border-line text-left">
              {['Day', 'Hours'].map((h) => (
                <th key={h} className="px-3 py-2 text-[12px] font-bold text-ink-3">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {WEEKDAYS.map((day) => {
              const wins = forDay(day).filter((w) => w.serviceable && (w.open_time || w.close_time))
              return (
                <tr key={day} className="border-b border-line/60 last:border-0">
                  <td className="w-36 px-3 py-2 font-bold text-ink">{day}</td>
                  <td className="px-3 py-2">
                    {wins.length === 0 ? <span className="text-ink-3">Closed</span> : wins.map((w, i) => (
                      <span key={i} className="mr-2 inline-flex items-center gap-1.5">
                        {w.open_time} – {w.close_time}
                        {w.is_primary && wins.length > 1 && (
                          <span className="rounded-full bg-brand-50 px-1.5 py-0.5 text-[11px] font-bold text-brand-600">Primary</span>
                        )}
                        {i < wins.length - 1 && <span className="text-ink-3">·</span>}
                      </span>
                    ))}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    )
  }

  return (
    <div className="rounded-md border border-line">
      <table className="w-full text-[13px]">
        <thead className="bg-warm-25">
          <tr className="border-b border-line text-left">
            {['Day', 'Serviceable', 'Windows'].map((h) => (
              <th key={h} className="px-3 py-2 text-[12px] font-bold text-ink-3">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {WEEKDAYS.map((day) => {
            const wins = forDay(day)
            const on = wins.some((w) => w.serviceable)
            return (
              <tr key={day} className="border-b border-line/60 last:border-0 align-top">
                <td className="w-32 px-3 py-2.5 font-bold text-ink">{day}</td>
                <td className="w-28 px-3 py-2.5">
                  <Toggle checked={on} onChange={(v) => toggleDay(day, v)} />
                </td>
                <td className="px-3 py-1.5">
                  {on ? (
                    <div className="flex flex-col gap-1.5 py-1">
                      {wins.map((w, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <div className="w-24"><Input value={w.open_time} placeholder="09:00" onChange={(v) => updateWin(day, i, { open_time: v })} /></div>
                          <span className="text-ink-3">–</span>
                          <div className="w-24"><Input value={w.close_time} placeholder="17:00" onChange={(v) => updateWin(day, i, { close_time: v })} /></div>
                          <label className="ml-1 flex cursor-pointer items-center gap-1.5 text-[12.5px] text-ink-2">
                            <input type="radio" name={`oh-primary-${day}`} checked={!!w.is_primary}
                              onChange={() => setPrimary(day, i)} className="accent-[#F26C2E]" />
                            Primary
                          </label>
                          {wins.length > 1 && (
                            <button type="button" onClick={() => removeWin(day, i)}
                              className="text-warm-400 hover:text-danger-fg">
                              <X size={14} />
                            </button>
                          )}
                        </div>
                      ))}
                      <button type="button" onClick={() => addWin(day)}
                        className="self-start text-[12.5px] font-bold text-brand-500 hover:text-brand-600">
                        + Split hours
                      </button>
                    </div>
                  ) : (
                    <span className="inline-block py-1.5 text-ink-3">Closed</span>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

/** dock vehicle capability — staging's allowedVehicleTypesNew shape: a COUNT
 * per vehicle type, not a tag list */
const DOCK_VEHICLE_TYPES = ['Truck', 'Van', 'Trailer', 'Prime Mover']

function DockVehicleCounts({ row, set, readOnly }: {
  row: MasterRecord
  set: (patch: Record<string, unknown>) => void
  readOnly: boolean
}) {
  const counts = (Array.isArray(row.allowedVehicleTypesNew) ? row.allowedVehicleTypesNew : []) as { id?: number; label?: string; count?: number }[]
  const countOf = (label: string) => counts.find((c) => c.label === label)?.count ?? 0
  const setCount = (label: string, v: string) => {
    const n = Math.max(0, Number(v) || 0)
    const others = counts.filter((c) => c.label !== label)
    set({ allowedVehicleTypesNew: n > 0
      ? [...others, { id: DOCK_VEHICLE_TYPES.indexOf(label) + 1, label, count: n }]
      : others })
  }

  if (readOnly) {
    const active = counts.filter((c) => (c.count ?? 0) > 0)
    return (
      <div>
        <p className="mb-1.5 text-[12px] font-bold text-ink-3">Allowed Vehicle Types</p>
        <p className="text-[13.5px] text-ink">{active.length ? active.map((c) => `${c.label} × ${c.count}`).join(', ') : '—'}</p>
      </div>
    )
  }

  return (
    <div>
      <p className="mb-1.5 text-[12px] font-bold text-ink-3">
        Allowed Vehicle Types <span className="font-normal">— how many of each the dock can take at once</span>
      </p>
      <div className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
        {DOCK_VEHICLE_TYPES.map((label) => (
          <div key={label} className="min-w-0">
            <label className="mb-1.5 flex h-5 items-center text-[13px] text-ink">{label}</label>
            <Input type="number" value={countOf(label) ? String(countOf(label)) : ''} placeholder="0"
              onChange={(v) => setCount(label, v)} />
          </div>
        ))}
      </div>
    </div>
  )
}
