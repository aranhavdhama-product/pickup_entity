// FarEye Custom Settings → Masters — full tree config (reverse-engineered from staging.fareye.co)
// 5 categories · 19 sub-masters. Each sub-master is a data table, a full-page form list, or a wizard.
import {
  Workflow, Route, Box, Store, Truck, Building2, Warehouse, MapPin, Boxes,
  GitBranch, ArrowLeftRight, Container, CalendarClock, Package, FileInput,
  Wrench, SlidersHorizontal, Hash, Grid3x3, Ruler, Bike, Tag, Barcode, type LucideIcon,
} from 'lucide-react'

export type Tone = 'success' | 'info' | 'warning' | 'danger' | 'neutral'

export type FieldDef = {
  label: string
  type: 'text' | 'select' | 'toggle' | 'radio' | 'checkbox' | 'number' | 'date' | 'time'
  required?: boolean
  placeholder?: string
  options?: string[]
  info?: boolean
  full?: boolean
  default?: string | boolean
}
export type FormSection = { heading?: string; fields: FieldDef[] }
export type AddForm = {
  kind: 'modal' | 'page'
  pageTitle?: string          // header noun for full-page forms → "Add <pageTitle>" / "Edit <pageTitle>"
  pageHelp?: string           // subtitle/help under the full-page form header
  modeToggle?: { label: string; sub: string }[]
  sections: FormSection[]
  submitLabel?: string
  cancelLabel?: string        // full-page form back/cancel button label (default 'Cancel')
  uppercaseLabels?: boolean    // render field labels in the compact uppercase style even on full-page forms
  custom?: string             // render a bespoke full-page form component instead of the field-driven body
}
export type ColumnDef = { key: string; label: string; sortable?: boolean; align?: 'right'; status?: boolean; image?: boolean; minWidth?: number }

export type EntityTab = { title: string; kind: 'table' | 'zone'; sub?: SubMaster }
export type FilterDef = { label: string; key: string; options: string[] }
export type SubMaster = {
  id: string
  name: string
  badge?: string
  desc: string
  view: 'table' | 'tabs'
  filters?: string[]
  filterDefs?: FilterDef[]   // functional filters (label + row key + options)
  columns?: ColumnDef[]
  rows?: Record<string, any>[]
  addLabel?: string
  addForm?: AddForm
  entityTabs?: EntityTab[]    // when present, sub-master renders an inner tab row (e.g. My Network)
  activateOnly?: boolean      // Action column + multiselect limited to Edit + Enable/Disable
  editDeleteOnly?: boolean    // Action column limited to Edit + Delete (no kebab menu)
  addAreaAction?: boolean     // extra "Add Area" button in the row Action column (opens Serviceable Area modal)
  linkFirstColumn?: boolean   // render first column as an orange link (default true)
  recordNoun?: string         // singular noun used in the enable/disable confirm (e.g. 'Vehicle')
  addSplit?: boolean          // Add button rendered as a split (Add / bulk-upload) control
  disableNote?: string        // extra line shown in the disable confirm
  enableNote?: string         // extra line shown in the enable confirm
}

export type Category = { id: string; name: string; desc: string; icon: LucideIcon; subs: SubMaster[] }

/* status → tone helper for pills */
export const toneFor = (v: string): Tone => {
  const s = v.toLowerCase()
  if (['active', 'created', 'delivered', 'enabled', 'completed'].some((x) => s.includes(x))) return 'success'
  if (['inactive', 'failed', 'disabled', 'paused'].some((x) => s.includes(x))) return 'danger'
  if (['at facility', 'in transit', 'in-progress', 'assigned'].some((x) => s.includes(x))) return 'info'
  if (['exception', 'pending', 'hold', 'draft'].some((x) => s.includes(x))) return 'warning'
  return 'neutral'
}

/* ---------- reusable field blocks ---------- */
const ADDRESS_SECTION: FormSection = {
  heading: 'Address Details',
  fields: [
    { label: 'Address Line 1', type: 'text', placeholder: 'Building Number/Name' },
    { label: 'Address Line 2', type: 'text', placeholder: 'Street/Area/Locality' },
    { label: 'Address Line 3 (Landmark)', type: 'text', placeholder: 'LandMark' },
    { label: 'Country', type: 'select', placeholder: 'Select country', options: ['India', 'US', 'UK', 'UAE'] },
    { label: 'State', type: 'select', placeholder: 'Select state' },
    { label: 'City', type: 'select', placeholder: 'Select city' },
    { label: 'Zipcode', type: 'select', placeholder: 'Select zipcode' },
    { label: 'Suburb', type: 'select', placeholder: 'Select suburb' },
  ],
}

/* ================= CATEGORY 1: Network & Location ================= */
const branchSub: SubMaster = {
  id: 'branch', name: 'Branch',
  desc: '',
  view: 'table',
  filters: ['Branch', 'Branch Type', 'Status', 'Country'],
  columns: [
    { key: 'name', label: 'Branch Name', sortable: true },
    { key: 'code', label: 'Branch Code', sortable: true },
    { key: 'type', label: 'Branch Type' },
    { key: 'address', label: 'Branch Address' },
    { key: 'status', label: 'Status', status: true },
  ],
  rows: [
    { id: '1', name: 'New York Branch', code: 'ny_branch', type: 'Sorting Center', address: '350 Fifth Avenue, Midtown Manhattan, Empire State Building, New York, US', status: 'Inactive' },
    { id: '2', name: 'Banglore Flipart Hub', code: 'blr_fp_hub_1', type: 'Sorting Center', address: 'Ground Floor, Sy. No. 16/1 & 17, Soukya Road, Samethanahalli Village, Near Hope Farm Circle, Karnataka, India', status: 'Inactive' },
    { id: '3', name: 'Delhi Hub', code: 'delhi hub', type: 'Sorting Center', address: 'A-31 Ground Floor, Delhi, India', status: 'Active' },
  ],
  addLabel: 'Add Branch',
  addForm: {
    kind: 'modal',
    modeToggle: [
      { label: 'Add via form', sub: 'Use a form to add single charge' },
      { label: 'Import from excel', sub: 'Add one or multiple charges in one go' },
    ],
    sections: [
      { fields: [
        { label: 'Branch Name', type: 'text', required: true, placeholder: 'Enter Branch Name' },
        { label: 'Branch Code', type: 'text', required: true, placeholder: 'Enter a Unique Branch Code' },
        { label: 'Active', type: 'toggle', info: true, full: true, default: true },
        { label: 'Branch Type', type: 'select', placeholder: 'Select Branch Type', options: ['Sorting Center', 'Hub', 'Warehouse', 'Last Mile Station'] },
        { label: 'Business Unit', type: 'select', placeholder: 'Select Business Unit' },
        { label: 'Time Zone', type: 'select', required: true, placeholder: 'Select Time Zone' },
        { label: 'Holiday Master', type: 'select', placeholder: 'Select Holiday Master' },
        { label: 'Contact Person', type: 'text', placeholder: "Enter Contact Person's Name" },
        { label: 'Contact Person Number', type: 'text', placeholder: "Enter Contact Person's Number" },
      ] },
      ADDRESS_SECTION,
      { heading: 'Other Details', fields: [
        { label: 'Routing Configuration', type: 'select', placeholder: 'Select' },
        { label: 'Allow Reshuffle Orders', type: 'radio', options: ['Yes', 'No'] },
      ] },
    ],
    submitLabel: 'Add Branch',
  },
}

const serviceableSub: SubMaster = {
  id: 'serviceable', name: 'Serviceable Areas', desc: '', view: 'table',
  filters: ['Branch', 'Country', 'Status'],
  columns: [
    { key: 'branch', label: 'Branch', sortable: true },
    { key: 'country', label: 'Country' },
    { key: 'area', label: 'Area Type' },
    { key: 'value', label: 'Value' },
    { key: 'status', label: 'Status', status: true },
  ],
  rows: [
    { id: 'SA1', branch: 'Delhi Hub', country: 'India', area: 'State', value: 'Delhi', status: 'Active' },
    { id: 'SA2', branch: 'Banglore Flipart Hub', country: 'India', area: 'City', value: 'Bangalore', status: 'Active' },
  ],
  addLabel: 'Add',
  addForm: {
    kind: 'page',
    modeToggle: [
      { label: 'Add via form', sub: 'Use a form to add single charge' },
      { label: 'Add via map', sub: 'Pick your serviceability area from map view' },
    ],
    sections: [{ fields: [
      { label: 'Branch', type: 'select', required: true, placeholder: 'Select branch' },
      { label: 'Country', type: 'select', required: true, placeholder: 'Select country', options: ['India', 'US', 'UK'] },
      { label: 'Add Granular serviceable areas within the selected Countries', type: 'toggle', info: true, full: true },
    ] }],
    submitLabel: 'Add',
  },
}

const networkEntityTabs: EntityTab[] = [
  { title: 'Branch', kind: 'table', sub: branchSub },
  { title: 'Serviceable Areas', kind: 'table', sub: serviceableSub },
  { title: 'Zone Master', kind: 'zone' },
]

/* the only My Network now — the old variant is gone, so no "New" badge either */
const myNetworkNew: SubMaster = {
  id: 'my-network-new', name: 'My Network',
  desc: 'Manage branches and serviceable areas. Add, edit or pause',
  view: 'tabs', entityTabs: networkEntityTabs,
}

const locationMaster: SubMaster = {
  id: 'location-master', name: 'Location Master',
  desc: 'Add various services offered by your carriers, this helps in setting up & managing serviceability',
  view: 'table',
  activateOnly: true,
  linkFirstColumn: false,
  recordNoun: 'Location',
  disableNote: "It won't be available in the system",
  enableNote: 'It will be available in the system',
  addSplit: true,
  filterDefs: [
    { label: 'Location Code', key: 'code', options: ['DHL'] },
    { label: 'Location Name', key: 'name', options: ['Delhi'] },
    { label: 'Merchant Name', key: 'merchant', options: ['ELEX'] },
    { label: 'Merchant Code', key: 'mcode', options: ['ELEX'] },
    { label: 'Location Type', key: 'type', options: ['Merchant Location', 'Customer Location', 'Warehouse', 'Pickup Point'] },
    { label: 'Status', key: 'status', options: ['Active', 'Enabled', 'Disabled'] },
  ],
  columns: [
    { key: 'code', label: 'Location Code', sortable: true },
    { key: 'name', label: 'Location Name', sortable: true },
    { key: 'merchant', label: 'Merchant Name' },
    { key: 'mcode', label: 'Merchant Code' },
    { key: 'type', label: 'Location Type' },
    { key: 'contact', label: 'Contact Person' },
    { key: 'phone', label: 'Contact Number' },
    { key: 'email', label: 'Email Id' },
    { key: 'addr1', label: 'Address Line 1' },
    { key: 'addr2', label: 'Address Line 2' },
    { key: 'addr3', label: 'Address Line 3' },
    { key: 'postal', label: 'Postal Code' },
    { key: 'city', label: 'City' },
    { key: 'suburb', label: 'Suburb' },
    { key: 'state', label: 'State' },
    { key: 'country', label: 'Country' },
    { key: 'lat', label: 'Latitude', align: 'right' },
    { key: 'long', label: 'Longitude', align: 'right' },
    { key: 'status', label: 'Status', status: true },
  ],
  rows: [
    { id: 'LOC1', code: 'DHL', name: 'Delhi', merchant: 'ELEX', mcode: 'ELEX', type: 'Merchant Location', contact: 'Varun', phone: '09540616088', email: 'aranhav.dhama@fareye.com', addr1: 'A-31 Ground Floor', addr2: '', addr3: '', postal: '201301', city: 'Delhi', suburb: '', state: 'Noida', country: 'India', lat: '-', long: '-', status: 'Active' },
  ],
  addLabel: 'Add',
  addForm: {
    kind: 'page',
    sections: [
      { fields: [
        { label: 'Location Type', type: 'select', placeholder: 'Select Location Type', options: ['Customer Location', 'Warehouse', 'Pickup Point'] },
        { label: 'Location Code/Id', type: 'text', placeholder: 'Type here' },
        { label: 'Location Name', type: 'text', placeholder: 'Type here' },
        { label: 'Branch', type: 'select', placeholder: 'Select Branch' },
        { label: 'Contact Person', type: 'text', placeholder: 'Type here' },
        { label: 'Contact Number', type: 'text', placeholder: 'Type here' },
        { label: 'Email ID', type: 'text', placeholder: 'Type here' },
      ] },
      { heading: 'Address Details', fields: [
        { label: 'Address Line 1', type: 'text', placeholder: 'Type here' },
        { label: 'Address Line 2', type: 'text', placeholder: 'Type here' },
        { label: 'Address Line 3', type: 'text', placeholder: 'Type here' },
        { label: 'Country', type: 'select', placeholder: 'Select country', options: ['India', 'US', 'UK'] },
        { label: 'Postal Code', type: 'select', placeholder: 'Select postal code' },
        { label: 'Suburb', type: 'select', placeholder: 'Select suburb' },
        { label: 'City', type: 'select', placeholder: 'Select city' },
        { label: 'State', type: 'select', placeholder: 'Select state' },
        { label: 'Latitude', type: 'text', placeholder: 'Type here (e.g., 28.6139)' },
        { label: 'Longitude', type: 'text', placeholder: 'Type here (e.g., 77.2090)' },
      ] },
      { heading: 'Operating Hours', fields: [] }, // rendered specially
      { fields: [{ label: 'Active Flag', type: 'checkbox', info: true, full: true, default: true }] },
    ],
    submitLabel: 'Submit',
  },
}

const dockMaster: SubMaster = {
  id: 'dock-master', name: 'Dock Master',
  desc: 'Standardizes dock configuration by mapping dock attributes (name, time windows, tags, and vehicle compatibility) to drive accurate wave planning',
  view: 'table',
  editDeleteOnly: true,
  linkFirstColumn: false,
  addSplit: true,
  filterDefs: [
    { label: 'Dock Name', key: 'name', options: ['Dock 1'] },
    { label: 'Allowed Vehicle Types', key: 'vehicleTypes', options: ['Truck', 'Van', 'Trailer', 'Prime Mover'] },
    { label: 'Tags', key: 'tags', options: ['Cold Storage', 'Hazmat', 'Fragile'] },
  ],
  columns: [
    { key: 'name', label: 'Dock Name', sortable: true },
    { key: 'tags', label: 'Tags' },
    { key: 'vehicleTypes', label: 'Allowed Vehicle Types' },
    { key: 'loadStart', label: 'Loading Start Time' },
    { key: 'loadEnd', label: 'Loading End Time' },
    { key: 'swapOver', label: 'Swap Over Time', align: 'right' },
  ],
  rows: [
    { id: 'D1', name: 'Dock 1', tags: '-', vehicleTypes: '-', loadStart: '01:00', loadEnd: '05:03', swapOver: '10', status: 'Active' },
  ],
  addLabel: 'Add Dock',
  addForm: {
    kind: 'page',
    pageTitle: 'Dock Master',
    pageHelp: 'Press enter after entering the value. You can add upto x masters? What are the other considerations?',
    uppercaseLabels: true,
    submitLabel: 'Submit',
    cancelLabel: 'Go back',
    sections: [{ fields: [
      { label: 'Dock Name', type: 'text', required: true, placeholder: 'Type here' },
      { label: 'Branch', type: 'select', placeholder: 'Select Branch', options: ['Delhi Hub', 'Banglore Flipart Hub', 'Mumbai Hub'] },
      { label: 'Allowed Vehicle Types', type: 'select', placeholder: 'Select Vehicle Type', options: ['Truck', 'Van', 'Trailer', 'Prime Mover'] },
      { label: 'Compatible Tags', type: 'select', placeholder: 'Select Compatible Tags', options: ['Cold Storage', 'Hazmat', 'Fragile'] },
      { label: 'Loading Start Time', type: 'time', placeholder: 'Select time' },
      { label: 'Loading End Time', type: 'time', placeholder: 'Select time' },
      { label: 'Swap Over Time', type: 'text', placeholder: 'Swap Over Time' },
    ] }],
  },
}

/* ================= CATEGORY 2: Lanes & Movement ================= */
const simpleForm = (fields: FieldDef[], submit = 'Submit', kind: 'modal' | 'page' = 'modal'): AddForm => ({ kind, sections: [{ fields }], submitLabel: submit })

const lineHaulLane: SubMaster = {
  id: 'line-haul-lane', name: 'Line Haul Lane', desc: 'Add Line haul Lane, set limits and parameters of the lane',
  view: 'table', addSplit: true,
  activateOnly: true,
  linkFirstColumn: false,
  recordNoun: 'Lane',
  disableNote: "It won't be available in the system",
  enableNote: 'It will be available in the system',
  filterDefs: [
    { label: 'Status', key: 'status', options: ['Enabled', 'Disabled'] },
    { label: 'Origin Facility', key: 'origin', options: ['nyc', 'ord', 'lax', 'dfw', 'atl'] },
    { label: 'Destination', key: 'dest', options: ['ord', 'nyc', 'lax', 'dfw', 'atl'] },
    { label: 'Mode', key: 'mode', options: ['ROAD', 'AIR', 'RAIL', 'SEA'] },
    { label: 'Service Type', key: 'serviceType', options: ['EXPRESS', 'STANDARD', 'ECONOMY'] },
  ],
  columns: [
    { key: 'code', label: 'Code', sortable: true },
    { key: 'origin', label: 'Origin Facility' },
    { key: 'dest', label: 'Destination Facility' },
    { key: 'lane', label: 'Lane' },
    { key: 'mode', label: 'Mode' },
    { key: 'transporter', label: 'Transporter' },
    { key: 'serviceType', label: 'Service Type' },
    { key: 'maxWeight', label: 'Max Weight', align: 'right' },
    { key: 'maxVolume', label: 'Max Volume', align: 'right' },
  ],
  rows: [
    { id: 'LHL1', code: 'NYC_ORD', origin: 'nyc', dest: 'ord', lane: 'nyc-ord', mode: '', transporter: '', serviceType: 'EXPRESS', maxWeight: '1000', maxVolume: '10000', status: 'Enabled' },
  ],
  addLabel: 'Add Lane',
  addForm: {
    kind: 'page',
    custom: 'lineHaulLane',
    pageTitle: 'Lane',
    sections: [],
  },
}

const hubToHub: SubMaster = {
  id: 'hub-to-hub', name: 'Hub To Hub', desc: 'Add your hub to hub Mapping',
  view: 'table', addSplit: true,
  activateOnly: true,
  linkFirstColumn: false,
  recordNoun: 'Hub To Hub Mapping',
  disableNote: "It won't be available in the system",
  enableNote: 'It will be available in the system',
  filterDefs: [
    { label: 'Status', key: 'status', options: ['Enabled', 'Disabled'] },
    { label: 'Origin Facility', key: 'origin', options: ['NYC', 'ORD', 'LAX', 'DFW', 'ATL'] },
    { label: 'Destination Facility', key: 'dest', options: ['ORD', 'NYC', 'LAX', 'DFW', 'ATL'] },
    { label: 'Lane', key: 'lane', options: ['nyc-ord', 'ord-lax'] },
  ],
  columns: [
    { key: 'code', label: 'Code', sortable: true },
    { key: 'origin', label: 'Origin Facility' },
    { key: 'next', label: 'Next Facility' },
    { key: 'dest', label: 'Destination Facility' },
    { key: 'lane', label: 'Lane' },
  ],
  rows: [
    { id: 'H2H1', code: 'nyc:ord', origin: 'NYC', next: 'ORD', dest: 'ORD', lane: 'nyc-ord', status: 'Enabled' },
  ],
  addLabel: 'Add Hub To Hub',
  addForm: {
    kind: 'page',
    custom: 'hubToHub',
    pageTitle: 'Hub To Hub Details',
    sections: [],
  },
}

const loadType: SubMaster = {
  id: 'load-type', name: 'Load Type', desc: 'Define load types, constraints and temperature requirements',
  view: 'table', addSplit: true,
  activateOnly: true,
  linkFirstColumn: false,
  recordNoun: 'Load Type',
  disableNote: "It won't be available in the system",
  enableNote: 'It will be available in the system',
  filterDefs: [
    { label: 'Status', key: 'status', options: ['Enabled', 'Disabled'] },
    { label: 'Load Type Code', key: 'loadType', options: ['FTL', 'LTL', 'PARCEL'] },
    { label: 'Load Type Name', key: 'loadName', options: ['Full Truck Load', 'Less Than Truck Load', 'Parcel'] },
  ],
  columns: [
    { key: 'loadType', label: 'Load Type', sortable: true },
    { key: 'loadName', label: 'Load Name' },
    { key: 'compatibility', label: 'Compatibility' },
    { key: 'maxWeight', label: 'Max Weight', align: 'right' },
    { key: 'maxVolume', label: 'Max Volume', align: 'right' },
    { key: 'stops', label: 'Stops', align: 'right' },
    { key: 'itemValue', label: 'Item Value', align: 'right' },
    { key: 'palletSpace', label: 'Pallet Space', align: 'right' },
    { key: 'length', label: 'Length', align: 'right' },
    { key: 'width', label: 'Width', align: 'right' },
    { key: 'height', label: 'Height', align: 'right' },
    { key: 'temperature', label: 'Temperature' },
    { key: 'availableForAssignment', label: 'Available For Assignment' },
    { key: 'assets', label: 'Assets' },
  ],
  rows: [
    { id: 'LT1', loadType: 'FTL', loadName: 'Full Truck Load', compatibility: 'General', maxWeight: '10000', maxVolume: '50', stops: '5', itemValue: '100000', palletSpace: '20', length: '600', width: '240', height: '260', temperature: 'Ambient', availableForAssignment: 'Yes', assets: 'Truck', status: 'Enabled' },
  ],
  addLabel: 'Add Load Type',
  addForm: simpleForm([
    { label: 'Load Type Name', type: 'text', required: true, placeholder: 'Enter Load Type' },
    { label: 'Min Temperature (°C)', type: 'number', placeholder: 'Enter min temp' },
    { label: 'Max Temperature (°C)', type: 'number', placeholder: 'Enter max temp' },
    { label: 'Constraints', type: 'text', placeholder: 'Enter constraints', full: true },
    { label: 'Active', type: 'toggle', full: true, default: true },
  ], 'Save Load Type'),
}

/* ================= CATEGORY 3: Service & Order ================= */
const serviceType: SubMaster = {
  id: 'service-type', name: 'Service Type', desc: 'Add various services offered by your carriers, this helps in setting up & managing serviceability',
  view: 'table', addSplit: true,
  activateOnly: true,
  linkFirstColumn: false,
  addAreaAction: true,
  recordNoun: 'Service Type',
  disableNote: "It won't be available in the system",
  enableNote: 'It will be available in the system',
  filterDefs: [
    { label: 'Service Name', key: 'name', options: ['Delivery & Installation', 'Installation', 'Delivery', 'Standard', 'White Glove Delivery', 'Express'] },
    { label: 'Code', key: 'code', options: ['Delivery & Installation', 'Installation', 'Delivery', 'Standard', 'White Glove Delivery', 'Express'] },
    { label: 'Status', key: 'status', options: ['Active', 'Enabled', 'Disabled'] },
  ],
  columns: [
    { key: 'name', label: 'Service Name', sortable: true },
    { key: 'code', label: 'Code', sortable: true },
    { key: 'status', label: 'Status', status: true },
  ],
  rows: [
    { id: 'ST1', name: 'Delivery & Installation', code: 'Delivery & Installation', status: 'Active' },
    { id: 'ST2', name: 'Installation', code: 'Installation', status: 'Active' },
    { id: 'ST3', name: 'Delivery', code: 'Delivery', status: 'Active' },
    { id: 'ST4', name: 'Standard', code: 'Standard', status: 'Active' },
    { id: 'ST5', name: 'White Glove Delivery', code: 'White Glove Delivery', status: 'Active' },
    { id: 'ST6', name: 'Express', code: 'Express', status: 'Active' },
  ],
  addLabel: 'Add Service Type',
  addForm: {
    kind: 'page',
    pageTitle: 'Service Type',
    pageHelp: 'Press enter after entering the value. You can add upto x masters? What are the other considerations?',
    uppercaseLabels: true,
    submitLabel: 'Submit',
    cancelLabel: 'Go back',
    sections: [{ fields: [
      { label: 'Service Type Name', type: 'text', required: true, placeholder: 'Type here' },
      { label: 'Service Code', type: 'text', required: true, placeholder: 'Type here' },
      { label: 'Enable this service type', type: 'checkbox', full: true, default: true },
    ] }],
  },
}
const packageType: SubMaster = {
  id: 'package-type', name: 'Package Type', desc: 'Add various services offered by your carriers, this helps in setting up & managing serviceability',
  view: 'table', addSplit: true,
  activateOnly: true,
  linkFirstColumn: false,
  recordNoun: 'Package Type',
  disableNote: "It won't be available in the system",
  enableNote: 'It will be available in the system',
  filterDefs: [
    { label: 'Package Name', key: 'name', options: ['Crate', 'Half Pallet', 'Full Pallet', 'Flat-Pack Carton', 'Ship-Alone Carton'] },
    { label: 'Code', key: 'code', options: ['Crate', 'Half Pallet', 'Full Pallet', 'Flat-Pack Carton', 'Ship-Alone Carton'] },
    { label: 'Status', key: 'status', options: ['Active', 'Enabled', 'Disabled'] },
  ],
  columns: [
    { key: 'name', label: 'Package Name', sortable: true },
    { key: 'code', label: 'Code', sortable: true },
    { key: 'length', label: 'Length', align: 'right' },
    { key: 'breadth', label: 'Breadth', align: 'right' },
    { key: 'height', label: 'Height', align: 'right' },
    { key: 'uom', label: 'UOM' },
    { key: 'weight', label: 'Weight', align: 'right' },
    { key: 'weightUnit', label: 'Weight Unit' },
    { key: 'businessUnit', label: 'Business Unit' },
    { key: 'status', label: 'Status', status: true },
  ],
  rows: [
    { id: 'PT1', name: 'Crate', code: 'Crate', length: '10', breadth: '3', height: '6', uom: 'cm', weight: '10', weightUnit: 'kg', businessUnit: 'Comfy Furniture', status: 'Active' },
    { id: 'PT2', name: 'Half Pallet', code: 'Half Pallet', length: '10', breadth: '10', height: '10', uom: 'cm', weight: '10', weightUnit: 'kg', businessUnit: 'Comfy Furniture', status: 'Active' },
    { id: 'PT3', name: 'Full Pallet', code: 'Full Pallet', length: '10', breadth: '10', height: '10', uom: 'cm', weight: '10', weightUnit: 'kg', businessUnit: 'Comfy Furniture', status: 'Active' },
    { id: 'PT4', name: 'Flat-Pack Carton', code: 'Flat-Pack Carton', length: '20', breadth: '4', height: '5', uom: 'cm', weight: '20', weightUnit: 'kg', businessUnit: 'Comfy Furniture', status: 'Active' },
    { id: 'PT5', name: 'Ship-Alone Carton', code: 'Ship-Alone Carton', length: '10', breadth: '10', height: '10', uom: 'cm', weight: '10', weightUnit: 'KG', businessUnit: 'Comfy Furniture', status: 'Active' },
  ],
  addLabel: 'Add Package Type',
  addForm: {
    kind: 'page',
    pageTitle: 'Package Type',
    pageHelp: 'Press enter after entering the value. You can add upto x masters? What are the other considerations?',
    uppercaseLabels: true,
    submitLabel: 'Submit',
    cancelLabel: 'Go back',
    sections: [{ fields: [
      { label: 'Name', type: 'text', required: true, placeholder: 'Type here' },
      { label: 'Code', type: 'text', required: true, placeholder: 'Type here' },
      { label: 'Length', type: 'text', required: true, placeholder: 'Type here' },
      { label: 'Breadth', type: 'text', required: true, placeholder: 'Type here' },
      { label: 'Height', type: 'text', required: true, placeholder: 'Type here' },
      { label: 'Unit of Measure', type: 'text', required: true, placeholder: 'Type here' },
      { label: 'Weight', type: 'text', placeholder: 'Type here' },
      { label: 'Weight Unit', type: 'text', placeholder: 'Please Type' },
      { label: 'Business Unit', type: 'select', placeholder: 'Please select', options: ['Comfy Furniture', "Bob's Discount Furniture", 'Tractor Supply Co.', 'Best Buy'] },
      { label: 'Service Type', type: 'select', placeholder: 'Please select', options: ['Delivery & Installation', 'Installation', 'Delivery', 'Standard', 'White Glove Delivery', 'Express'] },
      { label: 'Enable this package Type', type: 'checkbox', full: true },
    ] }],
  },
}
const consignmentType: SubMaster = {
  id: 'consignment-type', name: 'Consignment Type', desc: 'Add various services offered by your carriers, this helps in setting up & managing serviceability',
  view: 'table', addSplit: true,
  activateOnly: true,
  linkFirstColumn: false,
  recordNoun: 'Consignment Type',
  disableNote: "It won't be available in the system",
  enableNote: 'It will be available in the system',
  filterDefs: [
    { label: 'Consignment Name', key: 'name', options: ['Service', 'Reverse', 'Forward'] },
    { label: 'Code', key: 'code', options: ['service', 'reverse', 'forward'] },
    { label: 'Status', key: 'status', options: ['Active', 'Enabled', 'Disabled'] },
  ],
  columns: [
    { key: 'name', label: 'Consignment Name', sortable: true },
    { key: 'code', label: 'Code', sortable: true },
    { key: 'status', label: 'Status', status: true },
  ],
  rows: [
    { id: 'CT1', name: 'Service', code: 'service', status: 'Active' },
    { id: 'CT2', name: 'Reverse', code: 'reverse', status: 'Active' },
    { id: 'CT3', name: 'Forward', code: 'forward', status: 'Active' },
  ],
  addLabel: 'Add Consignment Type',
  addForm: {
    kind: 'page',
    pageTitle: 'Consignment Type',
    pageHelp: 'Press enter after entering the value. You can add upto x masters? What are the other considerations?',
    uppercaseLabels: true,
    submitLabel: 'Submit',
    cancelLabel: 'Go back',
    sections: [{ fields: [
      { label: 'Consignment Name', type: 'text', required: true, placeholder: 'Type here' },
      { label: 'Consignment Code', type: 'select', required: true, placeholder: 'Select', options: ['Forward', 'Reverse', 'Exchange', 'Service', 'Transfer'] },
      { label: 'Enable this consignment type', type: 'checkbox', full: true, default: true },
    ] }],
  },
}
const valueAddedService: SubMaster = {
  id: 'value-added-service', name: 'Value Added Service', desc: 'Add various services offered by your carriers, this helps in setting up & managing serviceability',
  view: 'table', addSplit: true,
  activateOnly: true,
  linkFirstColumn: false,
  recordNoun: 'Value Added Service',
  disableNote: "It won't be available in the system",
  enableNote: 'It will be available in the system',
  filterDefs: [
    { label: 'VAS Name', key: 'name', options: ['Front-Door', 'Room of Choice', 'White Glove'] },
    { label: 'Code', key: 'code', options: ['Front-Door', 'Room of Choice', 'WhiteGlove'] },
    { label: 'Status', key: 'status', options: ['Active', 'Enabled', 'Disabled'] },
  ],
  columns: [
    { key: 'name', label: 'VAS Name', sortable: true },
    { key: 'code', label: 'Code', sortable: true },
    { key: 'description', label: 'Description' },
    { key: 'skill', label: 'Skill' },
    { key: 'hierarchy', label: 'Hierarchy' },
    { key: 'serviceTime', label: 'Service Time Default (minutes)', align: 'right' },
    { key: 'additionalTime', label: 'Additional Time Default (minutes)', align: 'right' },
    { key: 'status', label: 'Status', status: true },
  ],
  rows: [
    { id: 'VAS1', name: 'Front-Door', code: 'Front-Door', description: 'Front-Door', skill: '-', hierarchy: '-', serviceTime: '0', additionalTime: '0', status: 'Active' },
    { id: 'VAS2', name: 'Room of Choice', code: 'Room of Choice', description: 'Room of Choice', skill: '-', hierarchy: '-', serviceTime: '0', additionalTime: '0', status: 'Active' },
    { id: 'VAS3', name: 'White Glove', code: 'WhiteGlove', description: 'White Glove', skill: '-', hierarchy: '-', serviceTime: '0', additionalTime: '0', status: 'Active' },
  ],
  addLabel: 'Add VAS',
  addForm: {
    kind: 'page',
    pageTitle: 'Value Added Service',
    pageHelp: 'Press enter after entering the value. You can add upto x masters? What are the other considerations?',
    uppercaseLabels: true,
    submitLabel: 'Submit',
    cancelLabel: 'Go back',
    sections: [{ fields: [
      { label: 'VAS Name', type: 'text', required: true, placeholder: 'Type here' },
      { label: 'Code', type: 'text', required: true, placeholder: 'Type here' },
      { label: 'Description', type: 'text', placeholder: 'Type here' },
      { label: 'Skill', type: 'text', placeholder: 'Type here' },
      { label: 'Hierarchy', type: 'text', placeholder: 'Type here' },
      { label: 'Service Time Default (minutes)', type: 'text', placeholder: 'Type here' },
      { label: 'Additional Time Default (minutes)', type: 'text', placeholder: 'Type here' },
      { label: 'Enable this value added service', type: 'checkbox', full: true, default: true },
    ] }],
  },
}
const sortCode: SubMaster = {
  id: 'sort-code', name: 'Sort Code', desc: 'Add various services offered by your carriers, this helps in setting up & managing serviceability',
  view: 'table', addSplit: true,
  activateOnly: true,
  linkFirstColumn: false,
  recordNoun: 'Sort Code',
  disableNote: "It won't be available in the system",
  enableNote: 'It will be available in the system',
  filterDefs: [
    { label: 'Sort Code Name', key: 'name', options: ['3PL'] },
    { label: 'Code', key: 'code', options: ['3pl_ams_au'] },
    { label: 'Status', key: 'status', options: ['Active', 'Enabled', 'Disabled'] },
  ],
  columns: [
    { key: 'name', label: 'Sort Code Name', sortable: true },
    { key: 'code', label: 'Code', sortable: true },
    { key: 'status', label: 'Status', status: true },
  ],
  rows: [
    { id: 'SC1', name: '3PL', code: '3pl_ams_au', status: 'Active' },
  ],
  addLabel: 'Add Sort Code',
  addForm: {
    kind: 'page',
    pageTitle: 'Sort Code',
    pageHelp: 'Press enter after entering the value. You can add upto x masters? What are the other considerations?',
    uppercaseLabels: true,
    submitLabel: 'Submit',
    cancelLabel: 'Go back',
    sections: [{ fields: [
      { label: 'Sort Code Name', type: 'text', required: true, placeholder: 'Type here' },
      { label: 'Sort Code', type: 'text', required: true, placeholder: 'Type here' },
      { label: 'Enable this sort type', type: 'checkbox', full: true, default: true },
    ] }],
  },
}

const businessParameter: SubMaster = {
  id: 'business-parameter', name: 'Business Parameter', desc: 'Add business parameters and their possible values',
  view: 'table', filters: ['Parameter', 'Status'], addSplit: true,
  activateOnly: true, linkFirstColumn: false, recordNoun: 'Business Parameter',
  columns: [
    { key: 'name', label: 'Parameter Name', sortable: true },
    { key: 'key', label: 'Parameter Key' },
    { key: 'values', label: 'Possible Values' },
    { key: 'status', label: 'Status', status: true },
  ],
  rows: [
    { id: 'BP1', name: 'Priority', key: 'priority', values: 'High, Medium, Low', status: 'Active' },
    { id: 'BP2', name: 'Fragility', key: 'fragility', values: 'Fragile, Non-Fragile', status: 'Active' },
  ],
  addLabel: 'Add Parameter',
  addForm: {
    kind: 'page',
    custom: 'businessParameter',
    pageTitle: 'Parameter',
    pageHelp: 'Add business parameters and their possible values',
    sections: [],
  },
}

const slotMaster: SubMaster = {
  id: 'slot-master', name: 'Slot Master', desc: 'Configure slots for different package types and their dimensions',
  view: 'table', addSplit: true,
  activateOnly: true,
  linkFirstColumn: false,
  recordNoun: 'Slot',
  disableNote: "It won't be available in the system",
  enableNote: 'It will be available in the system',
  filterDefs: [
    { label: 'Slot Name', key: 'name', options: ['mg_slot'] },
    { label: 'Slot Code', key: 'code', options: ['Morning _Slot'] },
    { label: 'Status', key: 'status', options: ['Active', 'Enabled', 'Disabled'] },
  ],
  columns: [
    { key: 'name', label: 'Slot Name', sortable: true },
    { key: 'code', label: 'Slot Code', sortable: true },
    { key: 'openTime', label: 'Opening Time' },
    { key: 'closeTime', label: 'Closing Time' },
    { key: 'status', label: 'Status', status: true },
  ],
  rows: [
    { id: 'SL1', name: 'mg_slot', code: 'Morning _Slot', openTime: '05:00', closeTime: '19:00', status: 'Active' },
  ],
  addLabel: 'Add Slot',
  addForm: {
    kind: 'page',
    pageTitle: 'Slot Master',
    pageHelp: 'Configure slots for different package types and their dimensions',
    uppercaseLabels: true,
    submitLabel: 'Submit',
    cancelLabel: 'Go back',
    sections: [{ fields: [
      { label: 'Slot Code', type: 'text', required: true, placeholder: 'Type here' },
      { label: 'Slot Name', type: 'text', required: true, placeholder: 'Type here' },
      { label: 'Slot Start Time', type: 'time', required: true, placeholder: 'Select time' },
      { label: 'Slot End Time', type: 'time', required: true, placeholder: 'Select time' },
      { label: 'Slot is Active', type: 'checkbox', full: true, default: true },
    ] }],
  },
}

const palletSpace: SubMaster = {
  id: 'pallet-space', name: 'Pallet Space Conversion Master', desc: 'Define conversion rules to calculate pallet space based on package type and quantity',
  view: 'table', addSplit: true,
  activateOnly: true,
  linkFirstColumn: false,
  recordNoun: 'Pallet Space Conversion',
  disableNote: "It won't be available in the system",
  enableNote: 'It will be available in the system',
  filterDefs: [
    { label: 'Package Type', key: 'pkg', options: ['Half Pallet', 'Crate', 'Full Pallet', 'Flat-Pack Carton', 'Ship-Alone Carton'] },
    { label: 'Business Unit', key: 'businessUnit', options: ["Bob's Discount Furniture", 'Comfy Furniture', 'Tractor Supply Co.', 'Best Buy'] },
    { label: 'Status', key: 'status', options: ['Active', 'Enabled', 'Disabled'] },
  ],
  columns: [
    { key: 'businessUnit', label: 'Business Unit', sortable: true },
    { key: 'pkg', label: 'Package Type' },
    { key: 'qty', label: 'Package Type Quantity', align: 'right' },
    { key: 'pallet', label: 'Pallet Space', align: 'right' },
    { key: 'status', label: 'Status', status: true },
    { key: 'roundUp', label: 'Round Up' },
  ],
  rows: [
    { id: 'PS1', businessUnit: "Bob's Discount Furniture", pkg: 'Half Pallet', qty: '20', pallet: '1', status: 'Active', roundUp: 'false' },
  ],
  addLabel: 'Add Pallet Space Conversion Master',
  addForm: {
    kind: 'page',
    pageTitle: 'Pallet Space Conversion Master',
    pageHelp: 'Define conversion rules to calculate pallet space based on package type and quantity',
    uppercaseLabels: true,
    submitLabel: 'Submit',
    cancelLabel: 'Go back',
    sections: [{ fields: [
      { label: 'Business Unit', type: 'select', required: true, full: true, placeholder: 'Select', options: ["Bob's Discount Furniture", 'Comfy Furniture', 'Tractor Supply Co.', 'Best Buy'] },
      { label: 'Package Type', type: 'select', required: true, full: true, placeholder: 'Select', options: ['Half Pallet', 'Crate', 'Full Pallet', 'Flat-Pack Carton', 'Ship-Alone Carton'] },
      { label: 'Package Type Quantity', type: 'text', required: true, placeholder: 'Type here' },
      { label: 'Pallet Space', type: 'text', required: true, placeholder: 'Type here' },
      { label: 'Round Up', type: 'select', required: true, full: true, placeholder: 'Select', options: ['true', 'false'] },
      { label: 'Enable this pallet space conversion master type', type: 'checkbox', full: true, default: true },
    ] }],
  },
}

/* ================= CATEGORY 4: Merchant ================= */
const merchantListing: SubMaster = {
  id: 'merchant-listing', name: 'Merchant Listing', desc: 'Add the different Business Units in your organization based on which Services & other masters may vary',
  view: 'table', addSplit: true,
  activateOnly: true,
  linkFirstColumn: false,
  recordNoun: 'Merchant',
  disableNote: "It won't be available in the system",
  enableNote: 'It will be available in the system',
  filterDefs: [
    { label: 'Merchant Name', key: 'name', options: ["Bob's Discount Furniture", 'Bobs Discount Furniture', 'Tractor Supply Co.', 'Best Buy', 'Comfy Furniture', 'Freshly Grocery', 'Smart Gadgets'] },
    { label: 'Code', key: 'code', options: ["Bob's Discount Furniture", 'BDF', 'TSC', 'Best Buy', 'Comfy Furniture', 'Freshly Grocery', 'Smart Gadgets'] },
    { label: 'Status', key: 'status', options: ['Enabled', 'Disabled'] },
  ],
  columns: [
    { key: 'name', label: 'Merchant Name', sortable: true },
    { key: 'code', label: 'Code', sortable: true, minWidth: 150 },
    { key: 'contact', label: 'Contact Person', minWidth: 160 },
    { key: 'phone', label: 'Contact Number', minWidth: 150 },
    { key: 'email', label: 'Email' },
    { key: 'addr1', label: 'Address Line 1' },
    { key: 'addr2', label: 'Address Line 2' },
    { key: 'addr3', label: 'Address Line 3' },
    { key: 'postal', label: 'Postal Code' },
    { key: 'suburb', label: 'Suburb' },
    { key: 'state', label: 'State' },
    { key: 'country', label: 'Country' },
    { key: 'city', label: 'City' },
    { key: 'logo', label: 'Logo', image: true },
    { key: 'reattempts', label: 'Number of Reattempts', align: 'right' },
  ],
  rows: [
    { id: 'M1', name: "Bob's Discount Furniture", code: "Bob's Discount Furniture", contact: 'Bobs Discount Furniture', phone: '0987654321', email: 'bob@gmail.com', addr1: '639 Roosevelt Rd', addr2: 'Chicago', addr3: 'IL 60607', postal: '60607', suburb: 'Bartlett', state: 'Illinois', country: 'US', city: 'Chicago', logo: 'https://img.p.mapq.st/?url=https%3A%2F%2Fa.mktgcdn.com%2Fp%2F04wxbzSIYTrJBrVRBwFZLdzzRI-5s8beZtXDC4eNwTs%2F400x400.jpg&w=1920&q=75', reattempts: '0', status: 'Enabled' },
    { id: 'M2', name: 'Bobs Discount Furniture', code: 'BDF', contact: 'Bobs Discount Furniture', phone: '0987654321', email: 'bob@gmail.com', addr1: '639 Roosevelt Rd', addr2: 'Chicago', addr3: 'IL 60607', postal: '60607', suburb: 'Bartlett', state: 'Illinois', country: 'US', city: 'Chicago', logo: 'https://img.p.mapq.st/?url=https%3A%2F%2Fa.mktgcdn.com%2Fp%2F04wxbzSIYTrJBrVRBwFZLdzzRI-5s8beZtXDC4eNwTs%2F400x400.jpg&w=1920&q=75', reattempts: '0', status: 'Enabled' },
    { id: 'M3', name: 'Tractor Supply Co.', code: 'TSC', contact: 'Chandler', phone: '', email: 'Chandler@email.com', addr1: '7 World Trade Center', addr2: '', addr3: '', postal: '10070', suburb: 'NY', state: 'New York', country: 'US', city: 'New York', logo: '', reattempts: '0', status: 'Enabled' },
    { id: 'M4', name: 'Best Buy', code: 'Best Buy', contact: 'Michael', phone: '', email: 'info@bestbuy.com', addr1: '7601 Penn Avenue South', addr2: '', addr3: '', postal: 'MN 55423', suburb: '', state: 'Richfield', country: 'United States', city: 'Minnesota', logo: '', reattempts: '0', status: 'Enabled' },
    { id: 'M5', name: 'Comfy Furniture', code: 'Comfy Furniture', contact: 'Jhon', phone: '', email: 'info@ComfyFurniture.com', addr1: '7 World Trade Center', addr2: '7 World Trade Center', addr3: '7 World Trade Center', postal: '10070', suburb: 'NY', state: 'NY', country: 'US', city: 'New York', logo: 'https://i.ibb.co/nNgyk56V/Comfy-Furniture-Logo.png', reattempts: '0', status: 'Enabled' },
    { id: 'M6', name: 'Freshly Grocery', code: 'Freshly Grocery', contact: 'Kane', phone: '', email: 'info@freshlygrocery.com', addr1: '8 World Trade Center', addr2: '7 World Trade Center', addr3: '7 World Trade Center', postal: '10070', suburb: 'Ny', state: 'NY', country: 'US', city: 'New York', logo: 'https://i.ibb.co/QFS4wWNN/Freshly-Grocery-Logo.png', reattempts: '0', status: 'Enabled' },
    { id: 'M7', name: 'Smart Gadgets', code: 'Smart Gadgets', contact: 'GS', phone: '', email: 'info@smartgadgets', addr1: '7 World Trade Center', addr2: '7 World Trade Center', addr3: 'NYC', postal: '10007', suburb: 'Ny', state: 'NY', country: 'US', city: 'New York', logo: 'https://i.ibb.co/ksJFJH85/Smart-Gadgets-Logo.png', reattempts: '0', status: 'Enabled' },
  ],
  addLabel: 'Add Merchant',
  addForm: {
    kind: 'page',
    pageTitle: 'Merchant',
    pageHelp: 'Add the different Business Units in your organization based on which Services & other masters may vary',
    uppercaseLabels: true,
    submitLabel: 'Submit',
    cancelLabel: 'Go back',
    sections: [
      { fields: [
        { label: 'Logo URL', type: 'text', placeholder: 'Enter logo URL here' },
        { label: 'Select Upload Type', type: 'radio', options: ['Upload File', 'Enter URL'], default: 'Enter URL' },
        { label: 'Merchant Name', type: 'text', required: true, placeholder: 'Type here' },
        { label: 'Merchant Code', type: 'text', required: true, placeholder: 'Type here' },
        { label: 'Contact Person', type: 'text', required: true, placeholder: 'Type here' },
        { label: 'Contact Number', type: 'text', placeholder: 'Type here' },
        { label: 'Email ID', type: 'text', required: true, full: true, placeholder: 'Type here' },
        { label: 'Address Line 1', type: 'text', required: true, full: true, placeholder: 'Type here' },
        { label: 'Address Line 2', type: 'text', full: true, placeholder: 'Type here' },
        { label: 'Address Line 3', type: 'text', full: true, placeholder: 'Type here' },
        { label: 'State', type: 'text', placeholder: 'Type here' },
        { label: 'Country', type: 'text', required: true, placeholder: 'Type here' },
        { label: 'City', type: 'text', placeholder: 'Type here' },
        { label: 'Suburb', type: 'text', placeholder: 'Type here' },
        { label: 'Postal Code', type: 'text', required: true, placeholder: 'Type here' },
        { label: 'Hide this merchant from the system', type: 'checkbox', full: true },
      ] },
    ],
  },
}

/* ================= CATEGORY 5: Fleet, Assets & Tags ================= */
const assetData: SubMaster = {
  id: 'asset-data', name: 'Asset Data', desc: 'Add your asset info and their parameters',
  view: 'table',
  activateOnly: true,
  linkFirstColumn: false,
  recordNoun: 'Vehicle',
  disableNote: "It won't be available for next trip",
  enableNote: 'It will be available for the next trip',
  filterDefs: [
    { label: 'Status', key: 'status', options: ['Enabled', 'Disabled'] },
    { label: 'Facility', key: 'homeFacility', options: ['delhi hub', 'Saraswati Vihar'] },
    { label: 'Asset Type', key: 'assetType', options: ['Prime Mover', 'Trailer', 'Truck', 'Van'] },
  ],
  columns: [
    { key: 'assetNumber', label: 'Asset Number', sortable: true },
    { key: 'assetName', label: 'Asset Name' },
    { key: 'city', label: 'City' },
    { key: 'homeFacility', label: 'Home Facility' },
    { key: 'assetType', label: 'Asset Type' },
    { key: 'currHub', label: 'Curr. Hub' },
    { key: 'driver', label: 'Driver Name' },
    { key: 'mode', label: 'Mode' },
    { key: 'transporter', label: 'Transporter' },
    { key: 'wtCap', label: 'Wt. Cap.', align: 'right' },
    { key: 'state', label: 'State' },
  ],
  rows: [
    { id: 'AST1', assetNumber: 'Asset_1234', driver: 'Aranhav', assetName: 'New Assest', mode: 'ROAD', city: 'Saraswati Vihar', homeFacility: 'delhi hub', assetType: 'Prime Mover', transporter: '', wtCap: '0', currHub: '-', state: '-', status: 'Enabled' },
    { id: 'AST2', assetNumber: '1234', driver: '', assetName: 'Sample Delivery', mode: 'ROAD', city: 'Saraswati Vihar', homeFacility: 'delhi hub', assetType: 'Trailer', transporter: '', wtCap: '0', currHub: 'delhi hub', state: '-', status: 'Enabled' },
  ],
  addLabel: 'Add Asset',
  addForm: {
    kind: 'page',
    pageTitle: 'Asset Details',
    submitLabel: 'Save',
    sections: [{ fields: [
      { label: 'City', type: 'select', placeholder: 'Select', options: ['Saraswati Vihar', 'Delhi', 'Bangalore'] },
      { label: 'Home Facility', type: 'select', required: true, placeholder: 'Select', options: ['delhi hub', 'Saraswati Vihar'] },
      { label: 'Current Facility Code', type: 'select', placeholder: 'Select', options: ['delhi hub', 'blr_fp_hub_1'] },
      { label: 'Linked Asset IDs', type: 'select', placeholder: 'Select', options: ['Asset_1234', '1234'] },
      { label: 'Asset Type', type: 'select', required: true, placeholder: 'Select', options: ['Prime Mover', 'Trailer', 'Truck', 'Van'] },
      { label: 'Transporter', type: 'text', placeholder: 'Enter' },
      { label: 'Allowed Vehicle Types', type: 'select', required: true, placeholder: 'Select', options: ['Prime Mover', 'Trailer', 'Truck', 'Van'] },
      { label: 'Manufacturing Year', type: 'date', placeholder: 'Select Date' },
      { label: 'Asset number', type: 'text', required: true, placeholder: 'Enter' },
      { label: 'Driver Name', type: 'text', placeholder: 'Enter' },
      { label: 'Asset Name', type: 'text', placeholder: 'Enter' },
    ] }],
  },
}

const storageLocation: SubMaster = {
  id: 'storage-location', name: 'Storage Location', desc: 'Add your storage location info and their parameters',
  view: 'table',
  activateOnly: true,
  recordNoun: 'Storage Location',
  filterDefs: [
    { label: 'Status', key: 'status', options: ['Enabled', 'Disabled'] },
    { label: 'Facility Hub', key: 'facilityHub', options: ['Delhi Hub', 'Banglore Flipart Hub', 'Mumbai Hub'] },
    { label: 'Storage Type', key: 'storageType', options: ['EXCESS', 'Shelf', 'Refrigerated', 'Floor'] },
  ],
  columns: [
    { key: 'code', label: 'Code', sortable: true },
    { key: 'name', label: 'Name' },
    { key: 'facilityHub', label: 'Facility Hub' },
    { key: 'storageType', label: 'Storage Type' },
  ],
  rows: [
    { id: 'STG1', code: 'Sample Storage', name: 'Sample Storage', facilityHub: 'Delhi Hub', storageType: 'EXCESS', status: 'Enabled' },
  ],
  addLabel: 'Add Storage',
  addForm: {
    kind: 'page',
    pageTitle: 'Storage Location Details',
    submitLabel: 'Save',
    sections: [{ fields: [
      { label: 'Name', type: 'text', required: true, placeholder: 'Enter' },
      { label: 'Facility Hub', type: 'select', required: true, placeholder: 'Select Hub', options: ['Delhi Hub', 'Banglore Flipart Hub', 'Mumbai Hub'] },
      { label: 'Storage Type', type: 'select', required: true, placeholder: 'Select Storage Type', options: ['EXCESS', 'Shelf', 'Refrigerated', 'Floor'] },
    ] }],
  },
}

const tags: SubMaster = {
  id: 'tags', name: 'Tags', desc: 'Manage tags and configure coloading restrictions. Mapped tags will be prevented from being loaded together.',
  view: 'table',
  activateOnly: true,
  recordNoun: 'Tag',
  filterDefs: [
    { label: 'Status', key: 'status', options: ['Enabled', 'Disabled'] },
  ],
  columns: [
    { key: 'name', label: 'Tags', sortable: true },
    { key: 'coload', label: 'Coload Not Tags' },
    { key: 'status', label: 'Status', status: true },
    { key: 'createdAt', label: 'Created At' },
    { key: 'updatedAt', label: 'Last Updated At' },
  ],
  rows: [
    { id: 'TAG1', name: 'hazmat', coload: 'fragile', status: 'Enabled', createdAt: '11:35 AM, 2026-06-24', updatedAt: '11:35 AM, 2026-06-24' },
  ],
  addLabel: 'Add Tag',
  addForm: {
    kind: 'page',
    pageTitle: 'Tag Details',
    pageHelp: 'Leave coload empty if you want tag not to be loaded with anyone',
    submitLabel: 'Save',
    sections: [{ fields: [
      { label: 'Tag Name', type: 'text', required: true, placeholder: 'Enter tag name' },
      { label: 'Coload Not Tags (Cannot have Tag Name)', type: 'select', placeholder: 'Enter tags separated by comma', options: ['hazmat', 'fragile', 'cold chain'] },
      { label: 'Enabled', type: 'checkbox', default: true },
    ] }],
  },
}

/* SKU — LIVE master (route overrides the generic sub-master page; see SkuMaster.tsx).
   Listed here so the Service & Order category card grid shows it like staging. */
const skuMaster: SubMaster = {
  id: 'sku', name: 'SKU',
  desc: 'Manage SKUs with their categories, dimensions, weight and hub mapping',
  view: 'table',
}

/* ================= TREE ================= */
export const MASTERS: Category[] = [
  { id: 'network_location', name: 'Network & Location', desc: 'Manage your network and locations', icon: Workflow,
    subs: [myNetworkNew, locationMaster, dockMaster] },
  { id: 'lane_movement', name: 'Lanes & Movement', desc: 'Defines how orders move between nodes', icon: Route,
    subs: [lineHaulLane, hubToHub, loadType] },
  { id: 'service_order', name: 'Service & Order', desc: 'Defines how orders are classified and handled operationally', icon: Box,
    subs: [serviceType, packageType, consignmentType, valueAddedService, skuMaster, businessParameter, sortCode, slotMaster, palletSpace] },
  { id: 'store_front', name: 'Merchant', desc: 'Defines business customers and their operational configurations', icon: Store,
    subs: [merchantListing] },
  { id: 'fleet_assets', name: 'Fleet, Assets & Tags', desc: 'Defines physical operational resources', icon: Truck,
    subs: [assetData, storageLocation, tags] },
]

/* per-sub-master icons for the category list */
export const SUB_ICONS: Record<string, LucideIcon> = {
  'my-network-new': Building2, 'location-master': MapPin, 'dock-master': Boxes,
  'line-haul-lane': GitBranch, 'hub-to-hub': ArrowLeftRight, 'load-type': Container,
  'service-type': CalendarClock, 'package-type': Package, 'consignment-type': FileInput,
  'value-added-service': Wrench, 'business-parameter': SlidersHorizontal, 'sort-code': Hash,
  'slot-master': Grid3x3, 'pallet-space': Ruler, 'sku': Barcode,
  'merchant-listing': Store, 'asset-data': Bike, 'storage-location': Warehouse, 'tags': Tag,
}

export const findCategory = (id?: string) => MASTERS.find((c) => c.id === id)
export const findSub = (catId?: string, subId?: string) => findCategory(catId)?.subs.find((s) => s.id === subId)
