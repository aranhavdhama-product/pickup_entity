/**
 * Draft model for Modify Consignment Details — kept out of the modal component
 * file so that file only exports components (react-refresh requirement).
 */

import type { PackageRow, SkuRow, VasRow } from '../../components/consignmentRowsModel'

export const CATEGORY_KEYS = ['fourPerson', 'stackable', 'fragile', 'vip', 'hazmat', 'heavyWeight'] as const
export type CategoryKey = (typeof CATEGORY_KEYS)[number]
export const CATEGORY_LABELS: Record<CategoryKey, string> = {
  fourPerson: '4 Person', stackable: 'Stackable', fragile: 'Fragile',
  vip: 'VIP', hazmat: 'Hazmat', heavyWeight: 'Heavy Weight',
}

export interface AddressDraft {
  name: string
  companyName: string
  email: string
  countryCode: string
  contactNumber: string
  line1: string
  line2: string
  line3: string
  landmark: string
  county: string
  city: string
  state: string
  postalCode: string
  country: string
  floorNumber: string
  liftAvailable: boolean
}

export interface ConsignmentDraft {
  referenceNumber: string
  consignmentNumber: string
  consignmentType: string
  tags: string
  shipByDate: string
  labelFormat: string
  serviceType: string
  schedulingConfirmationRequired: boolean
  dedicateTruck: boolean
  clearanceRequired: boolean
  totalLoadingTime: string
  specialInstructions: string
  category: Record<CategoryKey, boolean>
  shipTo: AddressDraft
  shipFrom: AddressDraft
  skus: SkuRow[]
  packages: PackageRow[]
  vas: VasRow[]
}

const emptyAddress = (): AddressDraft => ({
  name: '', companyName: '', email: '', countryCode: '', contactNumber: '',
  line1: '', line2: '', line3: '', landmark: '',
  county: '', city: '', state: '', postalCode: '', country: '',
  floorNumber: '', liftAvailable: false,
})

export const blankDraft = (): ConsignmentDraft => ({
  referenceNumber: '', consignmentNumber: '', consignmentType: 'Forward',
  tags: '', shipByDate: '', labelFormat: 'PDF', serviceType: 'Standard',
  schedulingConfirmationRequired: false, dedicateTruck: false, clearanceRequired: false,
  totalLoadingTime: '', specialInstructions: '',
  category: { fourPerson: false, stackable: false, fragile: false, vip: false, hazmat: false, heavyWeight: false },
  shipTo: emptyAddress(), shipFrom: emptyAddress(),
  skus: [], packages: [], vas: [],
})
