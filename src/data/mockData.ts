export interface DispatchRoute {
  id: string
  routingId: string
  dispatchStatus: 'Un-Assigned' | 'Assigned' | 'In-Progress' | 'Completed'
  createdOn: string
  cityBranch: string
  fence: string
  unplanned: number
  assigned: string
}

export const dispatchRoutes: DispatchRoute[] = [
  {
    id: '1',
    routingId: '58741064',
    dispatchStatus: 'Un-Assigned',
    createdOn: '2026-05-27 12:02:49',
    cityBranch: 'UK > SGRA',
    fence: 'Auto generated - SGRA',
    unplanned: 41,
    assigned: '0/10',
  },
]

// Depot at Dunfermline
export const depot = { lat: 56.071, lng: -3.452, label: 'SGRA Depot' }

export interface Stop { id: number; lat: number; lng: number; label: string }

// Planned stops — these are visited by the selected route
export const plannedStops: Stop[] = [
  { id: 1,  lat: 57.158, lng: -2.075, label: '1'  },  // Aberdeen centre
  { id: 2,  lat: 57.172, lng: -2.090, label: '2'  },
  { id: 3,  lat: 57.180, lng: -2.115, label: '3'  },
  { id: 4,  lat: 57.195, lng: -2.090, label: '4'  },
  { id: 5,  lat: 57.198, lng: -2.140, label: '5'  },
  { id: 6,  lat: 57.220, lng: -2.082, label: '6'  },  // Bridge of Don
  { id: 7,  lat: 57.165, lng: -2.130, label: '7'  },
  { id: 8,  lat: 57.140, lng: -2.115, label: '8'  },
  { id: 9,  lat: 57.130, lng: -2.090, label: '9'  },
  { id: 17, lat: 57.012, lng: -2.265, label: '17' }, // Stonehaven area visible on map
]

// Unplanned stops — these show as dark markers on the map
export const unplannedStops: Stop[] = [
  { id: 100, lat: 57.260, lng: -2.080, label: '' },
  { id: 101, lat: 57.290, lng: -2.085, label: '' },
  { id: 102, lat: 57.305, lng: -2.060, label: '' },
  { id: 103, lat: 57.320, lng: -2.110, label: '' },
  { id: 104, lat: 57.300, lng: -2.030, label: '' },
  { id: 105, lat: 57.250, lng: -2.150, label: '' },
  { id: 106, lat: 57.240, lng: -2.020, label: '' },
  { id: 107, lat: 57.275, lng: -2.005, label: '' },
  { id: 108, lat: 57.200, lng: -2.060, label: '' },
  { id: 109, lat: 57.215, lng: -2.140, label: '' },
  { id: 110, lat: 57.205, lng: -2.100, label: '' },
  { id: 111, lat: 57.190, lng: -2.045, label: '' },
  { id: 112, lat: 57.175, lng: -2.050, label: '' },
  { id: 113, lat: 57.160, lng: -2.045, label: '' },
  { id: 114, lat: 57.150, lng: -2.040, label: '' },
]

export interface RoutePlan {
  id: string
  name: string
  color: string
  dotColor: string
  vehicleTag: string
  vehicleExtra: number
  selected: boolean
  driverHidden: boolean
  stopIndices: number[]
  stops_count: number
  sporh: number
  utilised: number
  distance: number
  startTime: string
  endTime: string
  breakMin: number
}

export const routes: RoutePlan[] = [
  {
    id: 'r1',
    name: '10TOV2M_S01234 1 (Auto generated - SGRA)',
    color: '#7C3AED',
    dotColor: '#7C3AED',
    vehicleTag: '2MS0',
    vehicleExtra: 2,
    selected: true,
    driverHidden: false,
    stopIndices: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
    stops_count: 10,
    sporh: 0.88,
    utilised: 79.16,
    distance: 204.9,
    startTime: '06:30',
    endTime: '17:54',
    breakMin: 0,
  },
  {
    id: 'r2',
    name: '10TOV2M_S01234 2 (Auto generated - SGRA)',
    color: '#22C55E',
    dotColor: '#22C55E',
    vehicleTag: '2MS0',
    vehicleExtra: 3,
    selected: false,
    driverHidden: true,
    stopIndices: [0, 1, 2, 5, 6, 7, 8],
    stops_count: 10,
    sporh: 0.88,
    utilised: 99.13,
    distance: 206.5,
    startTime: '06:30',
    endTime: '17:54',
    breakMin: 0,
  },
  {
    id: 'r3',
    name: '3.5T2M_S01234 1 (Auto generated - SGRA)',
    color: '#5B21B6',
    dotColor: '#5B21B6',
    vehicleTag: 'S0',
    vehicleExtra: 1,
    selected: false,
    driverHidden: true,
    stopIndices: [0, 3, 6],
    stops_count: 6,
    sporh: 0.55,
    utilised: 0,
    distance: 0,
    startTime: '06:30',
    endTime: '17:54',
    breakMin: 0,
  },
  {
    id: 'r4',
    name: '3.5T2M_S01234 2 (Auto generated - SGRA)',
    color: '#6D28D9',
    dotColor: '#6D28D9',
    vehicleTag: 'S0',
    vehicleExtra: 2,
    selected: false,
    driverHidden: true,
    stopIndices: [],
    stops_count: 8,
    sporh: 0.72,
    utilised: 88.45,
    distance: 178.2,
    startTime: '06:30',
    endTime: '17:54',
    breakMin: 0,
  },
  {
    id: 'r5',
    name: '7TOV2M_S01234 1 (Auto generated - SGRA)',
    color: '#7C3AED',
    dotColor: '#7C3AED',
    vehicleTag: '1MS0',
    vehicleExtra: 2,
    selected: false,
    driverHidden: true,
    stopIndices: [],
    stops_count: 12,
    sporh: 0.91,
    utilised: 92.20,
    distance: 187.4,
    startTime: '06:30',
    endTime: '17:54',
    breakMin: 0,
  },
  {
    id: 'r6',
    name: '7TOV2M_S01234 2 (Auto generated - SGRA)',
    color: '#22C55E',
    dotColor: '#22C55E',
    vehicleTag: '1MS0',
    vehicleExtra: 1,
    selected: false,
    driverHidden: true,
    stopIndices: [],
    stops_count: 9,
    sporh: 0.78,
    utilised: 84.10,
    distance: 152.3,
    startTime: '06:30',
    endTime: '17:54',
    breakMin: 0,
  },
  {
    id: 'r7',
    name: '10TOV2M_S01234 3 (Auto generated - SGRA)',
    color: '#5B21B6',
    dotColor: '#5B21B6',
    vehicleTag: '2MS0',
    vehicleExtra: 2,
    selected: false,
    driverHidden: true,
    stopIndices: [],
    stops_count: 11,
    sporh: 0.85,
    utilised: 90.50,
    distance: 215.6,
    startTime: '06:30',
    endTime: '17:54',
    breakMin: 0,
  },
  {
    id: 'r8',
    name: '7TOV2M_S01234 3 (Auto generated - SGRA)',
    color: '#6D28D9',
    dotColor: '#6D28D9',
    vehicleTag: '1MS0',
    vehicleExtra: 2,
    selected: false,
    driverHidden: true,
    stopIndices: [],
    stops_count: 8,
    sporh: 0.69,
    utilised: 81.20,
    distance: 163.7,
    startTime: '06:30',
    endTime: '17:54',
    breakMin: 0,
  },
  {
    id: 'r9',
    name: '3.5T2M_S01234 3 (Auto generated - SGRA)',
    color: '#7C3AED',
    dotColor: '#7C3AED',
    vehicleTag: 'S0',
    vehicleExtra: 1,
    selected: false,
    driverHidden: true,
    stopIndices: [],
    stops_count: 7,
    sporh: 0.61,
    utilised: 76.30,
    distance: 142.8,
    startTime: '06:30',
    endTime: '17:54',
    breakMin: 0,
  },
  {
    id: 'r10',
    name: '10TOV2M_S01234 4 (Auto generated - SGRA)',
    color: '#22C55E',
    dotColor: '#22C55E',
    vehicleTag: '2MS0',
    vehicleExtra: 3,
    selected: false,
    driverHidden: true,
    stopIndices: [],
    stops_count: 12,
    sporh: 0.94,
    utilised: 95.40,
    distance: 192.0,
    startTime: '06:30',
    endTime: '17:54',
    breakMin: 0,
  },
]

export const routingSummary = {
  consignmentOrders: 233,
  planned: 192,
  unplanned: 41,
  totalRoutes: 10,
  assigned: 0,
  unAssigned: 10,
  vehicles: '10 / 10',
  spr: 15.30,
  stops: 153,
  sporh: 1.48,
  vehicleUtilised: 98.54,
  distance: '1,202.4 mi',
  time: '103h 23m',
  unplannedStops: 41,
}

// ── Same / Next-Day Routing mock data ──────────────────────────────────────
export const sndHub = { lat: 41.9508871, lng: -87.8671661, label: 'Chicago Hub (ORD)' }

export interface SndVehicle {
  id: string
  name: string
  tag: string
  color: string
  stops: number
  distance: number
  distanceUnit: string
  time: string
  utilisation: number
  startTime: string
  endTime: string
  sporh: number
}

export const sndVehicles: SndVehicle[] = [
  { id: 'truck1', name: 'TRUCK 1', tag: 'ORD', color: '#9B6BE3', stops: 5, distance: 41.4, distanceUnit: 'mi', time: '03h 22m', utilisation: 24.05, startTime: '04:00', endTime: '07:22', sporh: 1.49 },
  { id: 'truck2', name: 'TRUCK 2', tag: 'MDW', color: '#0891B2', stops: 3, distance: 28.7, distanceUnit: 'mi', time: '02h 15m', utilisation: 62.30, startTime: '04:00', endTime: '06:15', sporh: 1.33 },
  { id: 'van1',   name: 'VAN 1',   tag: 'ORD', color: '#D97706', stops: 2, distance: 18.2, distanceUnit: 'mi', time: '01h 30m', utilisation: 45.80, startTime: '04:30', endTime: '06:00', sporh: 1.33 },
]

export interface SndOrder {
  id: string
  orderId: string
  orderType: string
  address: string
  window: string
  eta: string
  state: string
  distance: string
  vas: string
  lat: number
  lng: number
  stopNum: number
  assigned: boolean
  vehicleId: string
  weight: number
  volume: number
  pieces: number
  lineItems: number
  customer: string
  specialInstructions: string
  travelTime: string
  confirmed: boolean
}

export const sndOrders: SndOrder[] = [
  // TRUCK 1 — purple
  { id: '1', orderId: 'SAMEDAY-BB-201', orderType: 'SAMEDAY', address: '1620 Lyman Ave, Downers Grove, IL',   window: '04:00 - 15:00', eta: '04:22', state: 'AT_FACILITY', distance: '5.2 mi',  vas: 'Room of Choice', lat: 41.7985, lng: -88.0117, stopNum: 1, assigned: true,  vehicleId: 'truck1', weight: 11.0,  volume: 125.3, pieces: 1, lineItems: 2, customer: 'John Smith',    specialInstructions: 'Handle with care and take sign and ID', travelTime: '22 mins', confirmed: false },
  { id: '2', orderId: 'SAMEDAY-BB-202', orderType: 'SAMEDAY', address: '4420 Madison St, Hillside, IL',       window: '04:00 - 15:00', eta: '04:52', state: 'AT_FACILITY', distance: '8.1 mi',  vas: 'Room of Choice', lat: 41.8692, lng: -87.9019, stopNum: 2, assigned: true,  vehicleId: 'truck1', weight: 8.5,   volume: 98.2,  pieces: 2, lineItems: 3, customer: 'Maria Garcia',  specialInstructions: '',                                      travelTime: '18 mins', confirmed: true  },
  { id: '3', orderId: 'SAMEDAY-BB-203', orderType: 'SAMEDAY', address: '5020 Lake St, Rosemont, IL',          window: '04:00 - 15:00', eta: '05:18', state: 'AT_FACILITY', distance: '5.8 mi',  vas: '',               lat: 41.9856, lng: -87.8734, stopNum: 3, assigned: true,  vehicleId: 'truck1', weight: 15.2,  volume: 210.5, pieces: 3, lineItems: 4, customer: 'David Chen',    specialInstructions: 'Fragile - careful handling required',   travelTime: '15 mins', confirmed: false },
  { id: '4', orderId: 'SAMEDAY-BB-204', orderType: 'SAMEDAY', address: '7130 N Damen Ave, Chicago, IL',       window: '04:00 - 15:00', eta: '05:47', state: 'AT_FACILITY', distance: '9.3 mi',  vas: 'Room of Choice', lat: 41.9942, lng: -87.6789, stopNum: 4, assigned: true,  vehicleId: 'truck1', weight: 6.8,   volume: 67.4,  pieces: 1, lineItems: 1, customer: 'Sarah Wilson',  specialInstructions: '',                                      travelTime: '25 mins', confirmed: true  },
  { id: '5', orderId: 'SAMEDAY-BB-205', orderType: 'SAMEDAY', address: '3245 N Lincoln Ave, Chicago, IL',     window: '04:00 - 15:00', eta: '06:21', state: 'AT_FACILITY', distance: '7.4 mi',  vas: '',               lat: 41.9345, lng: -87.6892, stopNum: 5, assigned: true,  vehicleId: 'truck1', weight: 22.1,  volume: 315.0, pieces: 4, lineItems: 5, customer: 'Robert Brown',  specialInstructions: 'Leave at door if no answer',            travelTime: '20 mins', confirmed: false },
  { id: '6', orderId: 'SAMEDAY-BB-206', orderType: 'SAMEDAY', address: '1803 W Irving Park Rd, Chicago, IL',  window: '04:00 - 15:00', eta: '—',     state: 'AT_FACILITY', distance: '6.8 mi',  vas: 'Room of Choice', lat: 41.9541, lng: -87.6721, stopNum: 6, assigned: false, vehicleId: '',       weight: 9.3,   volume: 145.8, pieces: 2, lineItems: 2, customer: 'Emily Davis',   specialInstructions: 'ID required for delivery',              travelTime: '—',       confirmed: false },
  // TRUCK 2 — teal/cyan
  { id: '7', orderId: 'SAMEDAY-CC-101', orderType: 'SAMEDAY', address: '1610 Sherman Ave, Evanston, IL',      window: '04:00 - 15:00', eta: '04:45', state: 'AT_FACILITY', distance: '11.2 mi', vas: '',               lat: 42.0471, lng: -87.6869, stopNum: 1, assigned: true,  vehicleId: 'truck2', weight: 14.5,  volume: 180.0, pieces: 2, lineItems: 3, customer: 'Alex Turner',  specialInstructions: '',                                      travelTime: '35 mins', confirmed: true  },
  { id: '8', orderId: 'SAMEDAY-CC-102', orderType: 'SAMEDAY', address: '8900 Gross Point Rd, Skokie, IL',    window: '04:00 - 15:00', eta: '05:20', state: 'AT_FACILITY', distance: '8.5 mi',  vas: 'White Glove',    lat: 42.0326, lng: -87.7430, stopNum: 2, assigned: true,  vehicleId: 'truck2', weight: 7.2,   volume: 92.4,  pieces: 1, lineItems: 2, customer: 'Nina Patel',   specialInstructions: 'White glove service required',          travelTime: '28 mins', confirmed: false },
  { id: '9', orderId: 'SAMEDAY-CC-103', orderType: 'SAMEDAY', address: '1002 Devon Ave, Park Ridge, IL',     window: '04:00 - 15:00', eta: '05:55', state: 'AT_FACILITY', distance: '9.0 mi',  vas: '',               lat: 42.0118, lng: -87.8420, stopNum: 3, assigned: true,  vehicleId: 'truck2', weight: 19.8,  volume: 245.0, pieces: 3, lineItems: 4, customer: 'Tom Harris',   specialInstructions: '',                                      travelTime: '22 mins', confirmed: true  },
  // VAN 1 — amber
  { id: '10', orderId: 'SAMEDAY-DD-101', orderType: 'SAMEDAY', address: '845 Lake St, Oak Park, IL',         window: '04:30 - 15:00', eta: '05:00', state: 'AT_FACILITY', distance: '7.8 mi',  vas: 'Room of Choice', lat: 41.8852, lng: -87.7932, stopNum: 1, assigned: true,  vehicleId: 'van1',   weight: 11.5,  volume: 135.0, pieces: 2, lineItems: 2, customer: 'Lisa Park',    specialInstructions: 'Call ahead 30 min',                     travelTime: '25 mins', confirmed: false },
  { id: '11', orderId: 'SAMEDAY-DD-102', orderType: 'SAMEDAY', address: '6534 W Cermak Rd, Berwyn, IL',     window: '04:30 - 15:00', eta: '05:35', state: 'AT_FACILITY', distance: '5.2 mi',  vas: '',               lat: 41.8512, lng: -87.7935, stopNum: 2, assigned: true,  vehicleId: 'van1',   weight: 6.0,   volume: 78.5,  pieces: 1, lineItems: 1, customer: 'Mike Chen',    specialInstructions: '',                                      travelTime: '18 mins', confirmed: true  },
]

export const sndSummary = {
  assigned: 0,
  unAssigned: 1,
  vehicles: '3/3',
  spr: 3.33,
  stops: 10,
  sporh: 1.38,
  vehicleUtilised: 44.05,
  distance: '88.3 mi',
  time: '03h 22m',
}

// ── Consignment Order mock data ─────────────────────────────────────────────
export type ConsignmentState = 'Created' | 'At Facility' | 'Partial At Facility' | 'Delivered' | 'Cancelled' | 'Exception'

export interface ConsignmentAttachment {
  id: string
  name: string
  kind: 'image' | 'pdf'
  sizeKb: number
  uploadedAt: string
  uploadedBy: string
  dataUrl?: string
}

export interface ConsignmentShipment {
  id: string
  trackingNumber: string
  outcome: 'Completed' | 'Failed' | null
}

/** A pickup or delivery time window; 'YYYY-MM-DD HH:MM' local strings. */
export interface TimeWindow {
  start: string
  end: string
}

export interface ConsignmentOrderRow {
  id: string
  consignmentNumber: string
  referenceNumber: string
  state: ConsignmentState
  secondaryState: string
  weightKg: number
  volume: string
  palletSpaces: number | null
  origin: string
  destination: string
  carrier: string
  orderNumber: string
  serviceType: string
  shipToName: string
  shipToCode: string
  shipToPincode: string
  shipToCity: string
  shipToCounty: string
  shipFromCode: string
  pickupWindow: TimeWindow | null
  deliveryWindow: TimeWindow | null
  shipments: ConsignmentShipment[]
  attachments: ConsignmentAttachment[]
  closure?: { outcome: 'Completed' | 'Failed' | 'Partial'; atc?: string; atd?: string; failureReason?: string }
}

// Seeded proof-of-delivery files for the pre-closed consignment (48px PNGs + 1-page PDF)
const podImageDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADAAAAAwCAIAAADYYG7QAAAAgklEQVR42u3WwQmAMBAF0d+WbVi11ViDBgISSY6yA07ILXt4p+zk3LfpPRbn6/mgNPdTUJoJqFbzBpVrBhBB84Agmg7iaBoIpVmCCn/LoDQTUPkmCUozgCBbNihNB6EKJPaQPWQP2UP2kD1kD9lD9pA9ZA/ZQ/aQPWQP2UP20K976ALkey2Af2LDoQAAAABJRU5ErkJggg=='
const podLabelDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADAAAAAwCAIAAADYYG7QAAABjElEQVR4nM3OhzpCAQAG0P8No5Ro733rVndoaWjvKQkhRFbygL7wEP95ggN18q2Ot8p4q4y+5NFGHm6k4ac0+JAGH8n+e7L/lui9Jbqv8e463lmLnRex/SK2n2OtVay1ijafos1HofEo1B+E+jJSW0Zq9+HqXbh6F6rchiqLYHkRLN8Ez64DpetA6cpfnPuLc1/h0leY+fIzb/7Cezr15Kae3Lk7O3FnJ67MGFSbXYhq40qPQLVxpoeg2jhTQ1BtHKkBqDaOkz6oNnb1N8Szsas9UG3sShdUG5vSBdXGJndAtbHKbVBtrFIbVBuL1ALVxpJsgmpj/g0RbcyJBqg25ngdVBtTvA6qjUmsgWpzLFZBtTmOVUG1OYpVQLU5ipZBtfkLEW2MwhmoNkahBKrNYaQEqs1huAiqjSFcANXGENqFiDb6UB5UG33wFFSbvxDR5iCQA9XmP8Sz0fmzoNro/BlQbbS+DKg2Wm8aVButNwWqzb4nBarNvucEVJs9twqqzX+IZ6NxKaDaaFzyD4e8HTCAQG8fAAAAAElFTkSuQmCC'
const podSignatureDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADAAAAAwCAIAAADYYG7QAAABjklEQVR4nM3OhVbCAAAF0Pf/56ioqJQwGkbHyMGAkaMbpEWw4xP8jXe/4OLvPP89zX5ept/H6fdx8vU8/jyMPvaj993wbTt43fbPm9553Tutui9PneOy/bzUDgttP2/tZs3dtLGdNDaT+npcW42qT0N1OVAX/cqiX573SrOuMu0ok3ZxrBVGLXnYkofN/KCR69ezvVqmW810qum2mtIqklaWWqVkU0k0lDioNvViDFSbWiEGqk1VjoJqo+YjoNqouTCoNpVcCFSbcjYEqk0pEwTVRkkHQLUppkRQbQqSCKqNLPlBtZGTPlBt8gkvqDa5uAdUm2zMA6pNJuoG1SYdcYFqk4o4QbWRwg5QbaSQA1SbZNAOqk0iIIBqExdtoNrERBuoNlG/FVSbiO8RVJuw1wKqTdhjBtUm5DaDahN0m0C1CbiMoNqITgOoNn6HAVQbn/0BVBuvcA+qjVe4A9XGY9ODauO26kG1cT3egmrjtNyAauMwX4NqYzfrQLURTDpQbQTjFag2NsMlqDbWh4t/XC72QDaNRbEAAAAASUVORK5CYII='
const podHandoffDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADAAAAAwCAIAAADYYG7QAAABh0lEQVR4nM3OBULCAAAF0H9DFQMB6a6x3ujuTkVURBDBUyo7xX8neFj9msuzuTwbi5OxOOnzH31+1GZHbfatTQ/q9KBO9sp4r4y/5NFOHu2k4ac03EqDrTj4EPsfmf57pvcmdN+E7kbobNKd13R7nWqvU62XZOs52XxONFeJxipRX8bri3htEavNY9VZtDqLVqbRyjRSnkRK43BpHC6OQsVhqDAMgmpTGFxCRJv8IAiqTb4fANUm1wuAapPr+UG1yXb9oNqYXR+oNmbHB6qN0bZCPBuj7QXVRm95QbXRmx5QbbSmB1QbreEG1UZtuEG1UetPoNootSdQbeRLiGkjV12g2kgVF6g2UsUJqo1YdoJqI5YdoNpkSg5QbTJFB6g2QvERVBuhYIV4NumCHVSbVN4Oqk0q9wCqTfISYtoks/eg2iTMe1BtrBDTJm7cgWpjhZg2Mf0WVJuYZoV4NlHNBqpNRL2EiDYRxQaqTVi5AdUmLFshnk1IvgbVJiRdg2oTFK9AtfkP/QFF7dJ3kJ3nhgAAAABJRU5ErkJggg=='
const podPdfDataUrl = 'data:application/pdf;base64,JVBERi0xLjQKMSAwIG9iago8PCAvVHlwZSAvQ2F0YWxvZyAvUGFnZXMgMiAwIFIgPj4KZW5kb2JqCjIgMCBvYmoKPDwgL1R5cGUgL1BhZ2VzIC9LaWRzIFszIDAgUl0gL0NvdW50IDEgPj4KZW5kb2JqCjMgMCBvYmoKPDwgL1R5cGUgL1BhZ2UgL1BhcmVudCAyIDAgUiAvTWVkaWFCb3ggWzAgMCAzMDAgMTIwXSAvUmVzb3VyY2VzIDw8IC9Gb250IDw8IC9GMSA0IDAgUiA+PiA+PiAvQ29udGVudHMgNSAwIFIgPj4KZW5kb2JqCjQgMCBvYmoKPDwgL1R5cGUgL0ZvbnQgL1N1YnR5cGUgL1R5cGUxIC9CYXNlRm9udCAvSGVsdmV0aWNhID4+CmVuZG9iago1IDAgb2JqCjw8IC9MZW5ndGggNjIgPj4Kc3RyZWFtCkJUIC9GMSAxNCBUZiAyNCA3MCBUZCAoUHJvb2Ygb2YgRGVsaXZlcnkgLSBDTkRNUy4uLjAwMDQpIFRqIEVUCmVuZHN0cmVhbQplbmRvYmoKeHJlZgowIDYKMDAwMDAwMDAwMCA2NTUzNSBmIAowMDAwMDAwMDA5IDAwMDAwIG4gCjAwMDAwMDAwNTggMDAwMDAgbiAKMDAwMDAwMDExNSAwMDAwMCBuIAowMDAwMDAwMjQxIDAwMDAwIG4gCjAwMDAwMDAzMTEgMDAwMDAgbiAKdHJhaWxlcgo8PCAvU2l6ZSA2IC9Sb290IDEgMCBSID4+CnN0YXJ0eHJlZgo0MjMKJSVFT0YK'

export const consignmentOrders: ConsignmentOrderRow[] = [
  {
    id: 'co-1',
    consignmentNumber: 'MILEZERO-0188',
    referenceNumber: 'REF0001456',
    state: 'At Facility',
    secondaryState: 'Label Generated',
    weightKg: 11.0,
    volume: '0.125 m³',
    palletSpaces: 1,
    origin: 'Chicago Hub (ORD)',
    destination: '1620 Lyman Ave, Downers Grove, IL',
    carrier: 'MileZero Express',
    orderNumber: 'ORD0001456',
    serviceType: 'Standard',
    shipToName: 'Daniel Whitaker',
    shipToCode: 'CUS-100482',
    shipToPincode: '60515',
    shipToCity: 'Downers Grove',
    shipToCounty: 'DuPage',
    shipFromCode: 'ord',
    pickupWindow: { start: '2026-07-28 08:00', end: '2026-07-28 11:00' },
    deliveryWindow: { start: '2026-07-29 12:00', end: '2026-07-29 16:00' },
    shipments: [
      { id: 'sh-1-1', trackingNumber: 'MZ1000188001', outcome: null },
      { id: 'sh-1-2', trackingNumber: 'MZ1000188002', outcome: null },
    ],
    attachments: [],
  },
  {
    id: 'co-2',
    consignmentNumber: 'CNDMS202607271623080001',
    referenceNumber: 'REF0001457',
    state: 'At Facility',
    secondaryState: 'Label Generated',
    weightKg: 24.5,
    volume: '0.310 m³',
    palletSpaces: 2,
    origin: 'Hillside DC',
    destination: '4420 Madison St, Hillside, IL',
    carrier: 'FarEye Fleet',
    orderNumber: 'ORD0001457',
    serviceType: 'Express',
    shipToName: 'Maria Gonzalez',
    shipToCode: 'CUS-100513',
    shipToPincode: '60162',
    shipToCity: 'Hillside',
    shipToCounty: 'Cook',
    shipFromCode: 'hsd',
    pickupWindow: { start: '2026-07-28 09:00', end: '2026-07-28 12:00' },
    deliveryWindow: { start: '2026-07-28 14:00', end: '2026-07-28 18:00' },
    shipments: [
      { id: 'sh-2-1', trackingNumber: 'FE2607270001', outcome: null },
      { id: 'sh-2-2', trackingNumber: 'FE2607270002', outcome: null },
      { id: 'sh-2-3', trackingNumber: 'FE2607270003', outcome: null },
    ],
    attachments: [],
  },
  {
    id: 'co-3',
    consignmentNumber: '0001567',
    referenceNumber: 'REF0001458',
    state: 'At Facility',
    secondaryState: 'Label Generated',
    weightKg: 8.5,
    volume: '0.098 m³',
    palletSpaces: null,
    origin: 'Rosemont Cross-dock',
    destination: '5020 Lake St, Rosemont, IL',
    carrier: 'Delhivery',
    orderNumber: 'ORD0001458',
    serviceType: 'Standard',
    shipToName: 'Tom Becker',
    shipToCode: 'CUS-100547',
    shipToPincode: '60018',
    shipToCity: 'Rosemont',
    shipToCounty: 'Cook',
    shipFromCode: 'rsm',
    pickupWindow: { start: '2026-07-28 07:30', end: '2026-07-28 09:30' },
    deliveryWindow: { start: '2026-07-29 10:00', end: '2026-07-29 13:00' },
    shipments: [{ id: 'sh-3-1', trackingNumber: 'DL0001567001', outcome: null }],
    attachments: [],
  },
  {
    id: 'co-4',
    consignmentNumber: 'CNDMS202607271623080002',
    referenceNumber: 'REF0001459',
    state: 'At Facility',
    secondaryState: 'Label Generated',
    weightKg: 15.2,
    volume: '0.210 m³',
    palletSpaces: 1,
    origin: 'Chicago Hub (ORD)',
    destination: '7130 N Damen Ave, Chicago, IL',
    carrier: 'MileZero Express',
    orderNumber: 'ORD0001459',
    serviceType: 'Standard',
    shipToName: 'Aisha Rahman',
    shipToCode: 'CUS-100561',
    shipToPincode: '60645',
    shipToCity: 'Chicago',
    shipToCounty: 'Cook',
    shipFromCode: 'ord',
    pickupWindow: { start: '2026-07-29 08:00', end: '2026-07-29 10:00' },
    deliveryWindow: { start: '2026-07-29 13:00', end: '2026-07-29 17:00' },
    shipments: [
      { id: 'sh-4-1', trackingNumber: 'MZ2607270021', outcome: null },
      { id: 'sh-4-2', trackingNumber: 'MZ2607270022', outcome: null },
    ],
    attachments: [],
  },
  {
    id: 'co-5',
    consignmentNumber: 'MILEZERO-0189',
    referenceNumber: 'REF0001460',
    state: 'Partial At Facility',
    secondaryState: 'Label Generated',
    weightKg: 32.0,
    volume: '0.450 m³',
    palletSpaces: 3,
    origin: 'Skokie Hub',
    destination: '8900 Gross Point Rd, Skokie, IL',
    carrier: 'FarEye Fleet',
    orderNumber: 'ORD0001460',
    serviceType: 'Express',
    shipToName: 'Nina Petrov',
    shipToCode: 'CUS-100584',
    shipToPincode: '60077',
    shipToCity: 'Skokie',
    shipToCounty: 'Cook',
    shipFromCode: 'skk',
    pickupWindow: { start: '2026-07-29 07:00', end: '2026-07-29 09:00' },
    deliveryWindow: { start: '2026-07-30 09:00', end: '2026-07-30 12:00' },
    shipments: [
      { id: 'sh-5-1', trackingNumber: 'MZ1000189001', outcome: null },
      { id: 'sh-5-2', trackingNumber: 'MZ1000189002', outcome: null },
      { id: 'sh-5-3', trackingNumber: 'MZ1000189003', outcome: null },
    ],
    attachments: [],
  },
  {
    id: 'co-6',
    consignmentNumber: '0001568',
    referenceNumber: 'REF0001461',
    state: 'At Facility',
    secondaryState: 'Label Generated',
    weightKg: 6.8,
    volume: '0.067 m³',
    palletSpaces: null,
    origin: 'Oak Park Depot',
    destination: '845 Lake St, Oak Park, IL',
    carrier: 'Delhivery',
    orderNumber: 'ORD0001461',
    serviceType: 'Standard',
    shipToName: 'Grace Lin',
    shipToCode: 'CUS-100602',
    shipToPincode: '60301',
    shipToCity: 'Oak Park',
    shipToCounty: 'Cook',
    shipFromCode: 'oak',
    pickupWindow: { start: '2026-07-29 10:00', end: '2026-07-29 12:00' },
    deliveryWindow: { start: '2026-07-30 13:00', end: '2026-07-30 17:00' },
    shipments: [{ id: 'sh-6-1', trackingNumber: 'DL0001568001', outcome: null }],
    attachments: [],
  },
  {
    id: 'co-7',
    consignmentNumber: 'CNDMS202607271623080003',
    referenceNumber: 'REF0001462',
    state: 'At Facility',
    secondaryState: 'Driver Assigned For Delivery',
    weightKg: 19.8,
    volume: '0.245 m³',
    palletSpaces: 2,
    origin: 'Park Ridge Hub',
    destination: '1002 Devon Ave, Park Ridge, IL',
    carrier: 'FarEye Fleet',
    orderNumber: 'ORD0001462',
    serviceType: 'Express',
    shipToName: 'Robert Hayes',
    shipToCode: 'CUS-100633',
    shipToPincode: '60068',
    shipToCity: 'Park Ridge',
    shipToCounty: 'Cook',
    shipFromCode: 'prh',
    pickupWindow: { start: '2026-07-28 06:30', end: '2026-07-28 08:30' },
    deliveryWindow: { start: '2026-07-28 11:00', end: '2026-07-28 15:00' },
    shipments: [
      { id: 'sh-7-1', trackingNumber: 'FE2607270031', outcome: null },
      { id: 'sh-7-2', trackingNumber: 'FE2607270032', outcome: null },
    ],
    attachments: [],
  },
  {
    id: 'co-8',
    consignmentNumber: 'MILEZERO-0190',
    referenceNumber: 'REF0001463',
    state: 'Created',
    secondaryState: 'Order Received',
    weightKg: 4.2,
    volume: '0.040 m³',
    palletSpaces: null,
    origin: 'Chicago Hub (ORD)',
    destination: '3245 N Lincoln Ave, Chicago, IL',
    carrier: 'MileZero Express',
    orderNumber: 'ORD0001463',
    serviceType: 'Standard',
    shipToName: 'Emily Carter',
    shipToCode: 'CUS-100664',
    shipToPincode: '60657',
    shipToCity: 'Chicago',
    shipToCounty: 'Cook',
    shipFromCode: 'ord',
    pickupWindow: null,
    deliveryWindow: { start: '2026-07-31 09:00', end: '2026-07-31 13:00' },
    shipments: [{ id: 'sh-8-1', trackingNumber: 'MZ1000190001', outcome: null }],
    attachments: [],
  },
  {
    id: 'co-9',
    consignmentNumber: 'MILEZERO-0191',
    referenceNumber: 'REF0001464',
    state: 'Created',
    secondaryState: 'Order Received',
    weightKg: 12.4,
    volume: '0.155 m³',
    palletSpaces: 1,
    origin: 'Berwyn Depot',
    destination: '6534 W Cermak Rd, Berwyn, IL',
    carrier: 'Delhivery',
    orderNumber: 'ORD0001464',
    serviceType: 'Standard',
    shipToName: 'Luis Romero',
    shipToCode: 'CUS-100691',
    shipToPincode: '60402',
    shipToCity: 'Berwyn',
    shipToCounty: 'Cook',
    shipFromCode: 'bwn',
    pickupWindow: null,
    deliveryWindow: { start: '2026-07-31 12:00', end: '2026-07-31 16:00' },
    shipments: [
      { id: 'sh-9-1', trackingNumber: 'DL1000191001', outcome: null },
      { id: 'sh-9-2', trackingNumber: 'DL1000191002', outcome: null },
    ],
    attachments: [],
  },
  {
    id: 'co-10',
    consignmentNumber: 'CNDMS202607271623080004',
    referenceNumber: 'REF0001465',
    state: 'Delivered',
    secondaryState: 'Closed',
    weightKg: 9.3,
    volume: '0.146 m³',
    palletSpaces: 1,
    origin: 'Chicago Hub (ORD)',
    destination: '1803 W Irving Park Rd, Chicago, IL',
    carrier: 'FarEye Fleet',
    orderNumber: 'ORD0001465',
    serviceType: 'Standard',
    shipToName: 'Hannah Fields',
    shipToCode: 'CUS-100712',
    shipToPincode: '60613',
    shipToCity: 'Chicago',
    shipToCounty: 'Cook',
    shipFromCode: 'ord',
    pickupWindow: { start: '2026-07-27 08:00', end: '2026-07-27 10:00' },
    deliveryWindow: { start: '2026-07-27 14:00', end: '2026-07-27 18:00' },
    shipments: [{ id: 'sh-10-1', trackingNumber: 'FE2607270041', outcome: 'Completed' }],
    attachments: [
      {
        id: 'att-10-1',
        name: 'pod-front-door.png',
        kind: 'image',
        sizeKb: 0.2,
        uploadedAt: '2026-07-27 16:42',
        uploadedBy: 'jenna.olsen@fareye.com',
        dataUrl: podImageDataUrl,
      },
      {
        id: 'att-10-2',
        name: 'pod-package-label.png',
        kind: 'image',
        sizeKb: 0.4,
        uploadedAt: '2026-07-27 16:42',
        uploadedBy: 'jenna.olsen@fareye.com',
        dataUrl: podLabelDataUrl,
      },
      {
        id: 'att-10-3',
        name: 'pod-signature.png',
        kind: 'image',
        sizeKb: 0.4,
        uploadedAt: '2026-07-27 16:42',
        uploadedBy: 'jenna.olsen@fareye.com',
        dataUrl: podSignatureDataUrl,
      },
      {
        id: 'att-10-4',
        name: 'pod-recipient-handoff.png',
        kind: 'image',
        sizeKb: 0.4,
        uploadedAt: '2026-07-27 16:43',
        uploadedBy: 'jenna.olsen@fareye.com',
        dataUrl: podHandoffDataUrl,
      },
      {
        id: 'att-10-5',
        name: 'signed-delivery-note.pdf',
        kind: 'pdf',
        sizeKb: 0.6,
        uploadedAt: '2026-07-27 16:43',
        uploadedBy: 'jenna.olsen@fareye.com',
        dataUrl: podPdfDataUrl,
      },
    ],
    closure: { outcome: 'Completed', atc: '2026-07-27T16:40' },
  },
  {
    id: 'co-11',
    consignmentNumber: '0001569',
    referenceNumber: 'REF0001466',
    state: 'Cancelled',
    secondaryState: 'Cancelled By Shipper',
    weightKg: 3.1,
    volume: '0.030 m³',
    palletSpaces: null,
    origin: 'Evanston Hub',
    destination: '1610 Sherman Ave, Evanston, IL',
    carrier: 'Delhivery',
    orderNumber: 'ORD0001466',
    serviceType: 'Standard',
    shipToName: 'Peter Novak',
    shipToCode: 'CUS-100738',
    shipToPincode: '60201',
    shipToCity: 'Evanston',
    shipToCounty: 'Cook',
    shipFromCode: 'evn',
    pickupWindow: null,
    deliveryWindow: null,
    shipments: [{ id: 'sh-11-1', trackingNumber: 'DL0001569001', outcome: null }],
    attachments: [],
  },
  {
    id: 'co-12',
    consignmentNumber: 'CNDMS202607271623080005',
    referenceNumber: 'REF0001467',
    state: 'Exception',
    secondaryState: 'Address Not Found',
    weightKg: 22.1,
    volume: '0.315 m³',
    palletSpaces: 2,
    origin: 'Hillside DC',
    destination: '4420 Madison St, Hillside, IL',
    carrier: 'MileZero Express',
    orderNumber: 'ORD0001467',
    serviceType: 'Express',
    shipToName: 'Sandra Kim',
    shipToCode: 'CUS-100754',
    shipToPincode: '60162',
    shipToCity: 'Hillside',
    shipToCounty: 'Cook',
    shipFromCode: 'hsd',
    pickupWindow: { start: '2026-07-28 08:00', end: '2026-07-28 10:00' },
    deliveryWindow: { start: '2026-07-28 12:00', end: '2026-07-28 16:00' },
    shipments: [
      { id: 'sh-12-1', trackingNumber: 'MZ2607270051', outcome: 'Failed' },
      { id: 'sh-12-2', trackingNumber: 'MZ2607270052', outcome: null },
    ],
    attachments: [],
  },
  {
    id: 'co-13',
    consignmentNumber: 'MILEZERO-0192',
    referenceNumber: 'REF0001468',
    state: 'At Facility',
    secondaryState: 'Return To Origin Initiated',
    weightKg: 14.5,
    volume: '0.180 m³',
    palletSpaces: 1,
    origin: 'Chicago Hub (ORD)',
    destination: '1620 Lyman Ave, Downers Grove, IL',
    carrier: 'FarEye Fleet',
    orderNumber: 'ORD0001468',
    serviceType: 'Standard',
    shipToName: 'Owen Brooks',
    shipToCode: 'CUS-100773',
    shipToPincode: '60515',
    shipToCity: 'Downers Grove',
    shipToCounty: 'DuPage',
    shipFromCode: 'ord',
    pickupWindow: { start: '2026-07-30 08:00', end: '2026-07-30 10:00' },
    deliveryWindow: { start: '2026-07-30 14:00', end: '2026-07-30 18:00' },
    shipments: [{ id: 'sh-13-1', trackingNumber: 'MZ1000192001', outcome: null }],
    attachments: [],
  },
  {
    id: 'co-14',
    consignmentNumber: '0001570',
    referenceNumber: 'REF0001469',
    state: 'At Facility',
    secondaryState: 'Label Generated',
    weightKg: 7.2,
    volume: '0.092 m³',
    palletSpaces: null,
    origin: 'Rosemont Cross-dock',
    destination: '5020 Lake St, Rosemont, IL',
    carrier: 'Delhivery',
    orderNumber: 'ORD0001469',
    serviceType: 'Standard',
    shipToName: 'Priya Nair',
    shipToCode: 'CUS-100791',
    shipToPincode: '60018',
    shipToCity: 'Rosemont',
    shipToCounty: 'Cook',
    shipFromCode: 'rsm',
    pickupWindow: { start: '2026-07-30 09:00', end: '2026-07-30 11:00' },
    deliveryWindow: { start: '2026-07-31 10:00', end: '2026-07-31 14:00' },
    shipments: [
      { id: 'sh-14-1', trackingNumber: 'DL0001570001', outcome: null },
      { id: 'sh-14-2', trackingNumber: 'DL0001570002', outcome: null },
    ],
    attachments: [],
  },
]
