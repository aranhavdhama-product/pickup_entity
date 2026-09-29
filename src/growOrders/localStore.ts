/**
 * A tiny reactive localStorage store — the pattern `store.ts` uses, factored for
 * the small Grow account stores (ledger, disputes, address book, merchant
 * settings). `useSyncExternalStore`, snapshot identity changes only on a write,
 * every stored blob goes through `normalize` on load (a bad or old blob falls
 * back to the deterministic `seed`). Storage errors (private mode) are swallowed.
 */
import { useSyncExternalStore } from 'react'

export interface LocalStore<T> {
  get: () => T
  set: (next: T) => void
  update: (fn: (cur: T) => T) => void
  use: () => T
  reset: () => void
}

export function createLocalStore<T>(key: string, seed: () => T, normalize: (raw: unknown) => T | null): LocalStore<T> {
  const subs = new Set<() => void>()
  let state: T | undefined
  const load = (): T => {
    try {
      const raw = localStorage.getItem(key)
      if (raw) {
        const n = normalize(JSON.parse(raw))
        if (n) return n
      }
    } catch { /* fall through to the seed */ }
    return seed()
  }
  const get = () => (state === undefined ? (state = load()) : state)
  const set = (next: T) => {
    state = next
    try { localStorage.setItem(key, JSON.stringify(next)) } catch { /* in-memory only */ }
    subs.forEach((cb) => cb())
  }
  return {
    get,
    set,
    update: (fn) => set(fn(get())),
    use: () => useSyncExternalStore((cb) => { subs.add(cb); return () => { subs.delete(cb) } }, get),
    reset: () => set(seed()),
  }
}

export const str = (v: unknown, d = ''): string => (typeof v === 'string' ? v : d)
export const num = (v: unknown, d = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : d)
export const bool = (v: unknown, d = false): boolean => (typeof v === 'boolean' ? v : d)
export const strs = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])
