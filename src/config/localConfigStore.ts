/**
 * A localStorage-backed config mirror (the `pickupModule.ts` pattern, made
 * reusable): normalize on read, a stable snapshot for `useSyncExternalStore`,
 * writes merge over the current value and notify same-tab readers; other tabs
 * follow through the `storage` event. Every storage access is guarded — with
 * storage blocked the tab keeps an in-memory copy.
 *
 * No React components, no fetch, no src/auth — safe for every app.
 */
import { useSyncExternalStore } from 'react'

export interface LocalConfigStore<T> {
  key: string
  defaults: T
  read: () => T
  /** merge `patch` over the current value (shallow), normalize, persist */
  write: (patch: Partial<T>) => void
  /** true once something has been saved under the key (in this browser) */
  isSaved: () => boolean
  use: () => T
}

export function createLocalConfigStore<T>(key: string, defaults: T, normalize: (raw: unknown) => T): LocalConfigStore<T> {
  let memoryRaw: string | null = null
  let storageBroken = false
  let cachedRaw: string | null | undefined
  let cached: T = defaults
  const subscribers = new Set<() => void>()

  const readRaw = (): string | null => {
    try {
      if (storageBroken || typeof localStorage === 'undefined') return memoryRaw
      return localStorage.getItem(key)
    } catch {
      return memoryRaw
    }
  }
  const snapshot = (): T => {
    const raw = readRaw()
    if (raw === cachedRaw) return cached
    cachedRaw = raw
    if (raw === null) cached = defaults
    else {
      let parsed: unknown
      try { parsed = JSON.parse(raw) } catch { parsed = null }
      cached = normalize(parsed)
    }
    return cached
  }
  const write = (patch: Partial<T>) => {
    const raw = JSON.stringify(normalize({ ...snapshot(), ...patch }))
    memoryRaw = raw
    try { localStorage.setItem(key, raw) } catch { storageBroken = true }
    for (const fn of subscribers) fn()   // `storage` never fires in the writing tab
  }
  const subscribe = (onChange: () => void) => {
    subscribers.add(onChange)
    const onStorage = (e: StorageEvent) => { if (e.key === key || e.key === null) onChange() }
    if (typeof window !== 'undefined') window.addEventListener('storage', onStorage)
    return () => {
      subscribers.delete(onChange)
      if (typeof window !== 'undefined') window.removeEventListener('storage', onStorage)
    }
  }
  return {
    key, defaults, read: snapshot, write,
    isSaved: () => readRaw() !== null,
    use: () => useSyncExternalStore(subscribe, snapshot, () => defaults),
  }
}

/* ---------- normalize helpers ---------- */
export const asRecord = (v: unknown): Record<string, unknown> =>
  (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {})
export const bool = (v: unknown, d: boolean): boolean => (typeof v === 'boolean' ? v : d)
export function oneOf<T extends string | number>(v: unknown, options: readonly T[], d: T): T {
  return options.includes(v as T) ? (v as T) : d
}
