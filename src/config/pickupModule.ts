/**
 * Pickup module config mirror (spec 2026-09-23 §2.7).
 *
 * The console's Base Modules → Pickup Request page saves its feature settings
 * to staging moduleSettings (code `PICKUP_REQUEST`) AND here, in localStorage.
 * The LOCAL app cannot call `/staging`, so it reads this mirror (with defaults).
 *
 * No imports from src/auth, nothing that fetches — safe for every app.
 */
import { useSyncExternalStore } from 'react'

export interface PickupModuleConfig {
  enabled: boolean                       // default true
  /**
   * HOW requests are raised (owner, 2026-09-24): `auto` = one is raised the
   * moment a consignment is created, on the date `autoPickup` computes;
   * `manual` = merchants and ops book them. The legacy
   * `autoCreateOnConsignment` key is DERIVED from this on normalize.
   */
  mode: PickupMode                       // default 'manual'
  autoPickup: AutoPickupConfig
  autoCreateOnConsignment: 'off' | 'always'   // derived: mode === 'auto' ? 'always' : 'off'
  scanMode: 'driver' | 'hub' | 'both'    // default 'both'
  maxAttempts: number                    // default 3
  allowAddToExistingUntil: 'Requested' | 'Planned' | 'Assigned'   // default 'Planned'
  rescheduleWindowDays: number           // default 7
  overagePolicy: 'hold' | 'auto-create' | 'reject'   // default 'hold'
  sendToCarrier: boolean                 // default false
  cutoffTime: string                     // 'HH:mm', default '16:00'
  bookingLeadTimeMins: number            // default 120
  /* --- follow-up 2026-09-23 (all optional in stored blobs; normalize fills) --- */
  multiPrPolicy: 'ONE_OPEN_PER_LOCATION' | 'ONE_PER_SLOT' | 'UNLIMITED'   // default 'ONE_PER_SLOT'
  /** 'HH:mm' — book before this for same-day pickup; after it the earliest window is the next business day */
  sameDayCutoff: string                  // default '12:00'
  /** 'HH:mm-HH:mm' pickup windows offered to merchants */
  slotDefinitions: string[]              // default ['09:00-12:00','12:00-15:00','15:00-18:00']
  podRequirements: {
    signature: PodLevel                  // default 'optional'
    photo: PodLevel                      // default 'optional'
    otp: boolean                         // default false
  }
  merchantCancelUntil: 'Requested' | 'Planned' | 'Assigned'   // default 'Planned'
  autoRescheduleOnFail: boolean          // default true
  /** per-merchant overrides, keyed by merchant code — see configForMerchant() */
  merchantOverrides: Record<string, MerchantOverride>   // default {}
}

export type PodLevel = 'required' | 'optional' | 'off'
export type PickupMode = 'auto' | 'manual'
/** How an auto-raised request picks its date and window. */
export interface AutoPickupConfig {
  /**
   * The consignment state that RAISES the request (owner, 2026-09-24):
   * Created = as soon as the consignment exists (validation issues included);
   * Label Generated = once it is paid and labelled; Ready To Ship = paid,
   * labelled and free of validation issues. Later states never raise one.
   */
  afterState: AutoPickupAfterState       // default 'Ready To Ship'
  /** same-day = today when created before the same-day cutoff, else the next pickup day;
   *  next-business-day = always the next pickup day; days-after-order = created date + N, rolled onto a pickup day */
  dateRule: 'same-day' | 'next-business-day' | 'days-after-order'   // default 'next-business-day'
  daysAfterOrder: number                 // default 1 (1–14), read only by 'days-after-order'
  /** 'HH:mm-HH:mm' — one of `slotDefinitions`; '' = the first configured slot */
  slot: string                           // default ''
  /** 0 = Sunday … 6 = Saturday — the days a pickup may be raised on */
  pickupDays: number[]                   // default Mon–Sat
}
export const PICKUP_MODES: PickupMode[] = ['auto', 'manual']
export const AUTO_AFTER_STATES = ['Created', 'Label Generated', 'Ready To Ship'] as const
export type AutoPickupAfterState = (typeof AUTO_AFTER_STATES)[number]
export const AUTO_DATE_RULES = ['same-day', 'next-business-day', 'days-after-order'] as const
export const DEFAULT_AUTO_PICKUP: AutoPickupConfig = Object.freeze({
  afterState: 'Ready To Ship', dateRule: 'next-business-day', daysAfterOrder: 1, slot: '', pickupDays: Object.freeze([1, 2, 3, 4, 5, 6]) as unknown as number[],
}) as AutoPickupConfig
export type MerchantOverride = Partial<Pick<PickupModuleConfig, 'sameDayCutoff' | 'slotDefinitions' | 'multiPrPolicy' | 'maxAttempts'>>

export const PICKUP_MODULE_KEY = 'fareye-pickup-module-config-v1'

export const DEFAULT_PICKUP_MODULE_CONFIG: PickupModuleConfig = Object.freeze({
  enabled: true,
  mode: 'manual',
  autoPickup: DEFAULT_AUTO_PICKUP,
  autoCreateOnConsignment: 'off',
  scanMode: 'both',
  maxAttempts: 3,
  allowAddToExistingUntil: 'Planned',
  rescheduleWindowDays: 7,
  overagePolicy: 'hold',
  sendToCarrier: false,
  cutoffTime: '16:00',
  bookingLeadTimeMins: 120,
  multiPrPolicy: 'ONE_PER_SLOT',
  sameDayCutoff: '12:00',
  slotDefinitions: Object.freeze(['09:00-12:00', '12:00-15:00', '15:00-18:00']) as unknown as string[],
  podRequirements: Object.freeze({ signature: 'optional', photo: 'optional', otp: false }) as PickupModuleConfig['podRequirements'],
  merchantCancelUntil: 'Planned',
  autoRescheduleOnFail: true,
  merchantOverrides: Object.freeze({}) as Record<string, MerchantOverride>,
}) as PickupModuleConfig

/* ---------- normalization ---------- */

function oneOf<T extends string>(v: unknown, allowed: readonly T[], fallback: T): T {
  return typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : fallback
}
function int(v: unknown, fallback: number, min: number, max: number): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, Math.round(n)))
}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/
const SLOT = /^([01]\d|2[0-3]):[0-5]\d-([01]\d|2[0-3]):[0-5]\d$/
const MULTI_PR = ['ONE_OPEN_PER_LOCATION', 'ONE_PER_SLOT', 'UNLIMITED'] as const
const POD = ['required', 'optional', 'off'] as const
const STAGES = ['Requested', 'Planned', 'Assigned'] as const

function time(v: unknown, fallback: string): string {
  return typeof v === 'string' && HHMM.test(v) ? v : fallback
}
/** valid 'HH:mm-HH:mm' entries only; a missing / empty / all-invalid list → fallback */
function slots(v: unknown, fallback: string[]): string[] {
  if (!Array.isArray(v)) return fallback
  const ok = v.filter((x): x is string => typeof x === 'string' && SLOT.test(x.trim())).map((x) => x.trim())
  return ok.length ? ok : fallback
}
function overrides(v: unknown): Record<string, MerchantOverride> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return {}
  const out: Record<string, MerchantOverride> = {}
  for (const [rawCode, rawO] of Object.entries(v as Record<string, unknown>)) {
    const code = rawCode.trim()
    if (!code || !rawO || typeof rawO !== 'object') continue
    const o = rawO as Record<string, unknown>
    const m: MerchantOverride = {}
    if (typeof o.sameDayCutoff === 'string' && HHMM.test(o.sameDayCutoff)) m.sameDayCutoff = o.sameDayCutoff
    if (Array.isArray(o.slotDefinitions)) {
      const sl = slots(o.slotDefinitions, [])
      if (sl.length) m.slotDefinitions = sl
    }
    if (typeof o.multiPrPolicy === 'string' && (MULTI_PR as readonly string[]).includes(o.multiPrPolicy)) {
      m.multiPrPolicy = o.multiPrPolicy as PickupModuleConfig['multiPrPolicy']
    }
    if (o.maxAttempts !== undefined && o.maxAttempts !== '' && Number.isFinite(Number(o.maxAttempts))) {
      m.maxAttempts = int(o.maxAttempts, DEFAULT_PICKUP_MODULE_CONFIG.maxAttempts, 1, 5)
    }
    out[code] = m
  }
  return out
}

/** Coerce any (partial, stale, hand-edited) blob into a valid config
    (unknown choices → default, numbers clamped, '' → default, bad times/slots dropped). */
export function normalizePickupModuleConfig(raw: unknown): PickupModuleConfig {
  return normalize(raw)
}
function normalize(raw: unknown): PickupModuleConfig {
  const d = DEFAULT_PICKUP_MODULE_CONFIG
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const pod = o.podRequirements && typeof o.podRequirements === 'object' ? (o.podRequirements as Record<string, unknown>) : {}
  /* a blob written before `mode` existed keeps its meaning: 'always' was auto */
  const mode: PickupMode = oneOf(o.mode, PICKUP_MODES, o.autoCreateOnConsignment === 'always' ? 'auto' : d.mode)
  const ap = o.autoPickup && typeof o.autoPickup === 'object' ? (o.autoPickup as Record<string, unknown>) : {}
  const days = Array.isArray(ap.pickupDays)
    ? [...new Set(ap.pickupDays.filter((x): x is number => Number.isInteger(x) && x >= 0 && x <= 6))].sort()
    : []
  return {
    enabled: typeof o.enabled === 'boolean' ? o.enabled : d.enabled,
    mode,
    autoPickup: {
      afterState: oneOf(ap.afterState, AUTO_AFTER_STATES, d.autoPickup.afterState),
      dateRule: oneOf(ap.dateRule, AUTO_DATE_RULES, d.autoPickup.dateRule),
      daysAfterOrder: int(ap.daysAfterOrder, d.autoPickup.daysAfterOrder, 0, 14),
      slot: typeof ap.slot === 'string' && SLOT.test(ap.slot.trim()) ? ap.slot.trim() : '',
      pickupDays: days.length ? days : d.autoPickup.pickupDays,
    },
    autoCreateOnConsignment: mode === 'auto' ? 'always' : 'off',
    scanMode: oneOf(o.scanMode, ['driver', 'hub', 'both'] as const, d.scanMode),
    maxAttempts: int(o.maxAttempts, d.maxAttempts, 1, 5),
    allowAddToExistingUntil: oneOf(o.allowAddToExistingUntil, STAGES, d.allowAddToExistingUntil),
    rescheduleWindowDays: int(o.rescheduleWindowDays, d.rescheduleWindowDays, 0, 365),
    overagePolicy: oneOf(o.overagePolicy, ['hold', 'auto-create', 'reject'] as const, d.overagePolicy),
    sendToCarrier: typeof o.sendToCarrier === 'boolean' ? o.sendToCarrier : d.sendToCarrier,
    cutoffTime: time(o.cutoffTime, d.cutoffTime),
    bookingLeadTimeMins: int(o.bookingLeadTimeMins, d.bookingLeadTimeMins, 0, 10_080),
    multiPrPolicy: oneOf(o.multiPrPolicy, MULTI_PR, d.multiPrPolicy),
    sameDayCutoff: time(o.sameDayCutoff, d.sameDayCutoff),
    slotDefinitions: slots(o.slotDefinitions, d.slotDefinitions),
    podRequirements: {
      signature: oneOf(pod.signature, POD, d.podRequirements.signature),
      photo: oneOf(pod.photo, POD, d.podRequirements.photo),
      otp: typeof pod.otp === 'boolean' ? pod.otp : d.podRequirements.otp,
    },
    merchantCancelUntil: oneOf(o.merchantCancelUntil, STAGES, d.merchantCancelUntil),
    autoRescheduleOnFail: typeof o.autoRescheduleOnFail === 'boolean' ? o.autoRescheduleOnFail : d.autoRescheduleOnFail,
    merchantOverrides: overrides(o.merchantOverrides),
  }
}

/* ---------- storage (every access guarded) ---------- */

/* fallback copy for when localStorage is unavailable or throws (private mode, blocked) */
let memoryRaw: string | null = null
let storageBroken = false

function readRaw(): string | null {
  try {
    if (storageBroken || typeof localStorage === 'undefined') return memoryRaw
    return localStorage.getItem(PICKUP_MODULE_KEY)
  } catch {
    return memoryRaw
  }
}

/* snapshot cache: the SAME object until the raw string changes (useSyncExternalStore
   requires a stable getSnapshot result, or React re-renders forever). */
let cachedRaw: string | null | undefined
let cachedConfig: PickupModuleConfig = DEFAULT_PICKUP_MODULE_CONFIG

function snapshot(): PickupModuleConfig {
  const raw = readRaw()
  if (raw === cachedRaw) return cachedConfig
  cachedRaw = raw
  if (raw === null) {
    cachedConfig = DEFAULT_PICKUP_MODULE_CONFIG
  } else {
    let parsed: unknown
    try { parsed = JSON.parse(raw) } catch { parsed = null }
    cachedConfig = normalize(parsed)
  }
  return cachedConfig
}

/** Current config: localStorage mirror merged over the defaults. */
export function readPickupModuleConfig(): PickupModuleConfig {
  return snapshot()
}

/** Config as seen by one merchant: the global config with its merchantOverrides entry
    (sameDayCutoff / slotDefinitions / multiPrPolicy / maxAttempts) merged on top. */
export function configForMerchant(code: string): PickupModuleConfig {
  const base = snapshot()
  const o = base.merchantOverrides[code?.trim?.() ?? code]
  if (!o || !Object.keys(o).length) return base
  return { ...base, ...o }
}

const subscribers = new Set<() => void>()
function notify() {
  for (const fn of subscribers) fn()
}

/** Merge `c` over the current config, persist, and re-render same-tab readers. */
export function writePickupModuleConfig(c: Partial<PickupModuleConfig>): void {
  const next = normalize({ ...snapshot(), ...c })
  const raw = JSON.stringify(next)
  memoryRaw = raw
  try {
    localStorage.setItem(PICKUP_MODULE_KEY, raw)
  } catch {
    storageBroken = true   // blocked / full — this tab keeps reading memoryRaw
  }
  notify()   // the `storage` event never fires in the tab that wrote
}

function subscribe(onChange: () => void): () => void {
  subscribers.add(onChange)
  const onStorage = (e: StorageEvent) => {
    if (e.key === PICKUP_MODULE_KEY || e.key === null) onChange()   // null = localStorage.clear()
  }
  if (typeof window !== 'undefined') window.addEventListener('storage', onStorage)
  return () => {
    subscribers.delete(onChange)
    if (typeof window !== 'undefined') window.removeEventListener('storage', onStorage)
  }
}

/** Live config — re-renders on same-tab writes and on other tabs' writes. */
export function usePickupModuleConfig(): PickupModuleConfig {
  return useSyncExternalStore(subscribe, snapshot, () => DEFAULT_PICKUP_MODULE_CONFIG)
}
