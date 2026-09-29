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
import { AUTO_PICKUP_TRIGGER_CODES, DEFAULT_AUTO_PICKUP_TRIGGER, EVENT_AFTER_STATE, LEGACY_AFTER_STATE_EVENT } from '../growOrders/fareyeEvents'

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
  /** options of the MANUAL mode (owner, 2026-09-25) — see blindPickupsAllowed() */
  manualPickup: ManualPickupConfig
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
  /**
   * Owner, 2026-09-25: "Pickups can be booked up to" — the furthest date a
   * pickup window may be booked for, in days from today (1–30). ONE shared
   * horizon: manual booking dialogs (violatesCutoff) and the auto mode's
   * "Ask the shipper for a pickup window" (userWindowError) both read it.
   */
  bookingHorizonDays: number             // default 7
  /**
   * Owner, 2026-09-25: which calendar decides the bookable pickup DAYS.
   *  'merchant-then-hub' — the pickup address's Location Master operating days
   *    when it has them, else the drop hub's holiday policy (weekly offs + hours);
   *  'hub'    — always the drop hub's holiday policy.
   * (A "module days only" choice existed for a few hours on 2026-09-25; the owner removed
   * it — hub holidays ALWAYS block; a stored 'module' value normalizes to the default.)
   * Hub holidays block in every source (the hub cannot receive); a merchant
   * preference is intersected with the hub's operating days.
   * Resolved by growOrders/operatingCalendar.ts `pickupCalendarFor`.
   */
  pickupDaysSource: PickupDaysSource     // default 'merchant-then-hub'
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
export type PickupDaysSource = 'merchant-then-hub' | 'hub'
export const PICKUP_DAYS_SOURCES: PickupDaysSource[] = ['merchant-then-hub', 'hub']
/** How an auto-raised request picks its date and window. */
export interface AutoPickupConfig {
  /**
   * The consignment state that RAISES the request (owner, 2026-09-24):
   * Created = as soon as the consignment exists (validation issues included);
   * Label Generated = once it is paid and labelled; Ready To Ship = paid,
   * labelled and free of validation issues. Later states never raise one.
   */
  /**
   * The FarEye EVENT that raises the request (owner, 2026-09-24) — one of
   * `AUTO_PICKUP_TRIGGER_EVENTS` in growOrders/fareyeEvents.ts. Later events
   * never raise one; a consignment on which the event fires LATER is booked then.
   */
  triggerEvent: string                   // default 'shipment::label-generated'
  /** DERIVED from `triggerEvent` (legacy key, still read by older code paths) */
  afterState: AutoPickupAfterState
  /**
   * Whether the person creating the consignment may pick its pickup window
   * (owner, 2026-09-24). Off = the rule below decides. On = the form offers a
   * date + slot under the slot rules (`slotDefinitions`, `sameDayCutoff`,
   * `bookingLeadTimeMins`, `maxDaysAhead`); a consignment created without a
   * choice, or with one outside the rules, falls back to the rule.
   */
  userSelectsWindow: boolean             // default false
  /**
   * Whether an auto-raised request waits for the SHIPPER to confirm its pickup
   * slot before ops may plan it (owner, 2026-09-24). Off = planned straight away.
   */
  slotConfirmation: boolean              // default false
  /** DERIVED from the top-level `bookingHorizonDays` (legacy key, kept so older readers compile) */
  maxDaysAhead: number                   // default 7
  /** same-day = today when created before the same-day cutoff, else the next pickup day;
   *  next-business-day = always the next pickup day; days-after-order = created date + N, rolled onto a pickup day */
  dateRule: 'same-day' | 'next-business-day' | 'days-after-order'   // default 'next-business-day'
  daysAfterOrder: number                 // default 1 (1–14), read only by 'days-after-order'
  /** 'HH:mm-HH:mm' — one of `slotDefinitions`; '' = the first configured slot */
  slot: string                           // default ''
  /** 0 = Sunday … 6 = Saturday — the days a pickup may be raised on */
  pickupDays: number[]                   // default Mon–Sat
}
/** Options of the manual mode (owner, 2026-09-25). */
export interface ManualPickupConfig {
  /** Reserved (internally `blind`) pickups: a slot booked BEFORE the consignments
      exist. Off = pickups are booked only for existing consignments. */
  blindAllowed: boolean                  // default true
}
export const DEFAULT_MANUAL_PICKUP: ManualPickupConfig = Object.freeze({ blindAllowed: true }) as ManualPickupConfig
export const PICKUP_MODES: PickupMode[] = ['auto', 'manual']
export const AUTO_AFTER_STATES = ['Created', 'Label Generated', 'Ready To Ship'] as const
export type AutoPickupAfterState = (typeof AUTO_AFTER_STATES)[number]
export const AUTO_DATE_RULES = ['same-day', 'next-business-day', 'days-after-order'] as const
export const DEFAULT_AUTO_PICKUP: AutoPickupConfig = Object.freeze({
  triggerEvent: DEFAULT_AUTO_PICKUP_TRIGGER, afterState: 'Label Generated', userSelectsWindow: false, slotConfirmation: false, maxDaysAhead: 7, dateRule: 'next-business-day', daysAfterOrder: 1, slot: '', pickupDays: Object.freeze([1, 2, 3, 4, 5, 6]) as unknown as number[],
}) as AutoPickupConfig
export type MerchantOverride = Partial<Pick<PickupModuleConfig, 'sameDayCutoff' | 'slotDefinitions' | 'multiPrPolicy' | 'maxAttempts'>>

export const PICKUP_MODULE_KEY = 'fareye-pickup-module-config-v1'

export const DEFAULT_PICKUP_MODULE_CONFIG: PickupModuleConfig = Object.freeze({
  enabled: true,
  mode: 'manual',
  autoPickup: DEFAULT_AUTO_PICKUP,
  manualPickup: DEFAULT_MANUAL_PICKUP,
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
  bookingHorizonDays: 7,
  pickupDaysSource: 'merchant-then-hub',
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
  /* the event wins; a blob written with only the older `afterState` maps onto its event */
  const trigger = typeof ap.triggerEvent === 'string' && AUTO_PICKUP_TRIGGER_CODES.includes(ap.triggerEvent)
    ? ap.triggerEvent
    : LEGACY_AFTER_STATE_EVENT[String(ap.afterState)] ?? d.autoPickup.triggerEvent
  const mp = o.manualPickup && typeof o.manualPickup === 'object' ? (o.manualPickup as Record<string, unknown>) : {}
  /* the top-level key wins; a blob written before it existed keeps its auto horizon */
  const horizon = int(o.bookingHorizonDays ?? ap.maxDaysAhead, d.bookingHorizonDays, 1, 30)
  const days = Array.isArray(ap.pickupDays)
    ? [...new Set(ap.pickupDays.filter((x): x is number => Number.isInteger(x) && x >= 0 && x <= 6))].sort()
    : []
  return {
    enabled: typeof o.enabled === 'boolean' ? o.enabled : d.enabled,
    mode,
    autoPickup: {
      triggerEvent: trigger,
      afterState: EVENT_AFTER_STATE[trigger] ?? 'Ready To Ship',
      userSelectsWindow: typeof ap.userSelectsWindow === 'boolean' ? ap.userSelectsWindow : d.autoPickup.userSelectsWindow,
      slotConfirmation: typeof ap.slotConfirmation === 'boolean' ? ap.slotConfirmation : d.autoPickup.slotConfirmation,
      maxDaysAhead: horizon,
      dateRule: oneOf(ap.dateRule, AUTO_DATE_RULES, d.autoPickup.dateRule),
      daysAfterOrder: int(ap.daysAfterOrder, d.autoPickup.daysAfterOrder, 0, 14),
      slot: typeof ap.slot === 'string' && SLOT.test(ap.slot.trim()) ? ap.slot.trim() : '',
      pickupDays: days.length ? days : d.autoPickup.pickupDays,
    },
    manualPickup: {
      blindAllowed: typeof mp.blindAllowed === 'boolean' ? mp.blindAllowed : d.manualPickup.blindAllowed,
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
    bookingHorizonDays: horizon,
    pickupDaysSource: oneOf(o.pickupDaysSource, PICKUP_DAYS_SOURCES, d.pickupDaysSource),
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

/**
 * Owner, 2026-09-24: the pickup PAGES (console Pickup, Grow Pickup Requests, the
 * Pending for Planning tabs and pickup rows) exist only while the module is on
 * AND requests are raised manually. In auto mode the module raises them itself,
 * so those surfaces are hidden exactly as they are with the module off.
 */
export const pickupPagesVisible = (c: Pick<PickupModuleConfig, 'enabled' | 'mode'>): boolean =>
  c.enabled && c.mode === 'manual'

/**
 * Owner, 2026-09-25: Reserved (internally `blind`) pickups — a slot booked
 * before the consignments exist — are offered only while the pickup pages are
 * visible AND the manual mode's `manualPickup.blindAllowed` is on. Gates the
 * console "Create Pickup", Grow "Add" and the store's createBlindPickup.
 * Existing Reserved requests stay readable either way.
 */
export const blindPickupsAllowed = (c: Pick<PickupModuleConfig, 'enabled' | 'mode' | 'manualPickup'>): boolean =>
  pickupPagesVisible(c) && c.manualPickup.blindAllowed

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
