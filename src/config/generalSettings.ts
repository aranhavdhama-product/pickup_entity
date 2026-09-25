/**
 * General Settings mirror — staging's Base Modules → General Settings
 * (`/v2/custom_settings/master-service/modules/general_settings`), for the
 * LOCAL app (`/local/settings/general`), persisted in localStorage.
 *
 * On staging the page has no row of its own: it writes the same keys into the
 * GLOBAL_SETTINGS, CONSIGNMENT_MANAGEMENT, PENDING_FOR_PLANNING, PUT_AWAY and
 * LASTMILE_LOADING moduleSettings rows (see the 2026-09-24 research note). Here
 * it is ONE local blob. Defaults = the staging account's CURRENT values
 * (bundle defaults for an account with no rows are in the comments).
 *
 * No imports from src/auth, nothing that fetches — safe for every app.
 */
import { asRecord, bool, createLocalConfigStore, oneOf } from './localConfigStore'

export const TASK_TYPE_OPTIONS = [
  { name: 'Pickup Only Delivery Only', code: 'PICKUP_ONLY_DELIVERY_ONLY' },
  { name: 'Pickup & Delivery', code: 'PICKUP_AND_DELIVERY' },
] as const
export type TaskType = (typeof TASK_TYPE_OPTIONS)[number]['code']

export const INBOUND_OPTIONS = [
  { name: 'At Origin', code: 'AT_ORIGIN' },
  { name: 'At Destination', code: 'AT_DESTINATION' },
  { name: 'At Mid Mile', code: 'AT_MID_MILE' },
  { name: 'Not Required', code: 'NOT_REQUIRED' },
] as const
export type InboundStage = (typeof INBOUND_OPTIONS)[number]['code']

export interface GeneralSettings {
  /** "Order View" — show Order Number instead of Consignment Number across the UI (bundle default false) */
  viewOnOrder: boolean
  /** "Splittable" — orders may be split into sub-orders during planning (`add_form.splittable`) */
  splittable: boolean
  /** "Scannable" — orders may be scanned at planning (`add_form.scannable`) */
  scannable: boolean
  /** "Task Type" (bundle default PICKUP_ONLY_DELIVERY_ONLY) */
  taskType: TaskType
  /** "Inbound" — the stage where inbound is required (bundle default AT_ORIGIN) */
  inbound: InboundStage
}

export const GENERAL_SETTINGS_KEY = 'fareye-general-settings-v1'

export const DEFAULT_GENERAL_SETTINGS: GeneralSettings = Object.freeze({
  viewOnOrder: true,
  splittable: false,
  scannable: false,
  taskType: 'PICKUP_ONLY_DELIVERY_ONLY',
  inbound: 'NOT_REQUIRED',
}) as GeneralSettings

export function normalizeGeneralSettings(raw: unknown): GeneralSettings {
  const o = asRecord(raw)
  const d = DEFAULT_GENERAL_SETTINGS
  const form = asRecord(o.add_form)   // tolerate a pasted staging settingJson
  return {
    viewOnOrder: bool(o.viewOnOrder, d.viewOnOrder),
    splittable: bool(o.splittable, bool(form.splittable, d.splittable)),
    scannable: bool(o.scannable, bool(form.scannable, d.scannable)),
    taskType: oneOf(o.taskType, TASK_TYPE_OPTIONS.map((x) => x.code), d.taskType),
    inbound: oneOf(o.inbound, INBOUND_OPTIONS.map((x) => x.code), d.inbound),
  }
}

const store = createLocalConfigStore(GENERAL_SETTINGS_KEY, DEFAULT_GENERAL_SETTINGS, normalizeGeneralSettings)

export const readGeneralSettings = store.read
export const writeGeneralSettings = store.write
export const useGeneralSettings = store.use
