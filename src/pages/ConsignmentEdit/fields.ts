/**
 * Field schema for the consignment address edit form.
 *
 * Grouped rather than flat. The staging edit form presents one long ungrouped column per
 * party, which is what makes it hard to scan and easy to ship with fields missing — two
 * of them (Company Name, Landmark) exist in the Add form and in the API payload but never
 * made it into Edit.
 *
 *   `isNew`     present in Add + the API, missing from the staging Edit form
 *   `apiPath`   where the value belongs in the /ship/api/v3/consignments payload.
 *               Note companyName sits on `contact`, NOT on `address` — the read model
 *               returns it nested under the address, which is what makes it easy to miss.
 */

export type FieldType = 'text' | 'number' | 'select' | 'toggle' | 'time'

export interface FieldSpec {
  key: string
  label: string
  type: FieldType
  required?: boolean
  full?: boolean
  placeholder?: string
  options?: string[]
  hint?: string
  /** in Add + API but absent from the staging Edit form */
  isNew?: boolean
  apiPath: string
}

export interface SectionSpec {
  id: string
  title: string
  caption?: string
  fields: FieldSpec[]
}

export type Party = 'shipFrom' | 'shipTo'

const COUNTRIES = ['US', 'CA', 'GB', 'AU', 'IN', 'NL', 'DE', 'FR']
const CODES = ['+1', '+44', '+61', '+91', '+31', '+49', '+33']

/** Contact block — who to talk to, and which company they belong to. */
const contact = (party: Party): SectionSpec => ({
  id: 'contact',
  title: 'Contact & Company',
  caption: party === 'shipFrom'
    ? 'Who releases the goods, and the entity shipping them.'
    : 'Who receives the goods, and the entity taking delivery.',
  fields: [
    {
      key: 'name', label: party === 'shipFrom' ? 'Sender Name' : 'Customer Name',
      type: 'text', required: true, placeholder: 'Full name',
      apiPath: `${party}.contact.name`,
    },
    {
      key: 'companyName', label: 'Company Name', type: 'text', isNew: true,
      placeholder: 'Legal entity name',
      hint: 'Sits on contact, not address — a consignment usually moves between two different entities.',
      apiPath: `${party}.contact.companyName`,
    },
    { key: 'countryCode', label: 'Country Code', type: 'select', options: CODES, apiPath: `${party}.contact.countryCode` },
    {
      key: 'contactNumber', label: 'Contact Number', type: 'text',
      // the API marks contactNumber required on ShipTo only
      required: party === 'shipTo', placeholder: '3125550100',
      apiPath: `${party}.contact.contactNumber`,
    },
    { key: 'email', label: 'Email', type: 'text', placeholder: 'name@company.com', apiPath: `${party}.contact.email` },
  ],
})

/** Address block — kept in postal reading order, not API order. */
const address = (party: Party): SectionSpec => ({
  id: 'address',
  title: 'Address',
  caption: 'Location Code resolves a known facility; leave it blank for an ad-hoc address.',
  fields: [
    {
      key: 'locationCode', label: 'Location Code', type: 'text',
      placeholder: 'eg, Williamstown',
      hint: 'Maps to address.code. When a facility code is set, master data may override these fields.',
      apiPath: `${party}.address.code`,
    },
    { key: 'line1', label: 'Address Line 1', type: 'text', required: true, full: true, placeholder: 'Building number / name', apiPath: `${party}.address.line1` },
    { key: 'line2', label: 'Address Line 2', type: 'text', apiPath: `${party}.address.line2` },
    { key: 'line3', label: 'Address Line 3', type: 'text', apiPath: `${party}.address.line3` },
    {
      key: 'landmark', label: 'Landmark', type: 'text', isNew: true, full: true,
      placeholder: 'Nearby reference point',
      hint: 'Drivers rely on this where addressing is unreliable.',
      apiPath: `${party}.address.landmark`,
    },
    { key: 'pincode', label: 'Postal Code', type: 'text', placeholder: '60603', apiPath: `${party}.address.pincode` },
    { key: 'city', label: 'City', type: 'text', required: true, placeholder: 'Chicago', apiPath: `${party}.address.city` },
    { key: 'county', label: 'Suburb / County', type: 'text', apiPath: `${party}.address.county` },
    { key: 'state', label: 'State', type: 'text', required: true, placeholder: 'IL', apiPath: `${party}.address.state` },
    { key: 'country', label: 'Country', type: 'select', required: true, options: COUNTRIES, apiPath: `${party}.address.country` },
  ],
})

const geo = (party: Party): SectionSpec => ({
  id: 'geo',
  title: 'Geo Coordinates',
  caption: 'Set directly, or place the pin on the map.',
  fields: [
    { key: 'latitude', label: 'Latitude', type: 'number', placeholder: '41.8796', apiPath: `${party}.address.latitude` },
    { key: 'longitude', label: 'Longitude', type: 'number', placeholder: '-87.6303', apiPath: `${party}.address.longitude` },
  ],
})

const schedule = (party: Party): SectionSpec => ({
  id: 'schedule',
  title: party === 'shipFrom' ? 'Pick Up Window' : 'Delivery Window',
  caption: 'Absent from the staging edit form — the window cannot currently be moved after create.',
  fields: party === 'shipFrom'
    ? [
      { key: 'startTime', label: 'Pick Up Start Time', type: 'time', isNew: true, apiPath: 'shipFrom.pickupStartDateTime' },
      { key: 'endTime', label: 'Pick Up End Time', type: 'time', isNew: true, apiPath: 'shipFrom.pickupEndDateTime' },
    ]
    : [
      { key: 'startTime', label: 'Delivery Start Time', type: 'time', isNew: true, apiPath: 'shipTo.deliveryStartDateTime' },
      { key: 'endTime', label: 'Delivery End Time', type: 'time', isNew: true, apiPath: 'shipTo.deliveryEndDateTime' },
    ],
})

const access: SectionSpec = {
  id: 'access',
  title: 'Site Access',
  caption: 'Drives service time and crew allocation.',
  fields: [
    { key: 'floorNumber', label: 'Floor Number', type: 'number', apiPath: 'shipTo.address.floorNumber' },
    { key: 'liftAvailable', label: 'Lift Available', type: 'toggle', apiPath: 'shipTo.address.liftAvailable' },
  ],
}

export const SECTIONS: Record<Party, SectionSpec[]> = {
  shipFrom: [contact('shipFrom'), address('shipFrom'), geo('shipFrom'), schedule('shipFrom')],
  shipTo: [contact('shipTo'), address('shipTo'), geo('shipTo'), schedule('shipTo'), access],
}

export const PARTY_META: Record<Party, { title: string; caption: string }> = {
  shipFrom: {
    title: 'Ship From',
    caption: 'Pickup address and contact details for this consignment.',
  },
  shipTo: {
    title: 'Ship To',
    caption: 'Delivery address and contact details — drives routing and customer comms.',
  },
}

export type PartyValues = Record<string, string | boolean>

/** Seeded from CO0803E on staging so the form opens with something real in it. */
export const SEED: Record<Party, PartyValues> = {
  shipFrom: {
    name: 'ORD', companyName: '', countryCode: '', contactNumber: '999999998', email: '',
    locationCode: 'ord', line1: '', line2: '', line3: '', landmark: '',
    pincode: '', city: 'Chicago', county: '', state: '', country: '',
    latitude: '', longitude: '', startTime: '', endTime: '',
  },
  shipTo: {
    name: 'Consignee', companyName: '', countryCode: '',
    contactNumber: '3125550100', email: 'aranhav.dhama@fareye.com',
    locationCode: 'ord', line1: '230 South Clark Street', line2: '', line3: '', landmark: '',
    pincode: '60603', city: 'Chicago', county: '', state: 'IL', country: 'US',
    latitude: '', longitude: '', startTime: '', endTime: '',
    floorNumber: '', liftAvailable: false,
  },
}

export const countNew = () =>
  (Object.keys(SECTIONS) as Party[]).reduce(
    (n, p) => n + SECTIONS[p].reduce((m, s) => m + s.fields.filter((f) => f.isNew).length, 0), 0)
