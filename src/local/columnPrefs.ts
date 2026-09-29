/**
 * Which columns a grid shows, persisted per grid in localStorage. Shared by
 * the console and Grow lists (one component set, spec §15).
 */
import { useState } from 'react'

export function useColumnPrefs(storageKey: string, defaults: string[], known: string[]): [string[], (v: string[] | null) => void] {
  const [cols, setCols] = useState<string[]>(() => {
    try {
      const raw = window.localStorage.getItem(storageKey)
      const v = raw ? (JSON.parse(raw) as unknown) : null
      if (Array.isArray(v)) {
        const ok = v.filter((k): k is string => typeof k === 'string' && known.includes(k))
        if (ok.length) return ok
      }
    } catch { /* ignore */ }
    return defaults
  })
  const set = (v: string[] | null) => {
    const next = v ?? defaults
    setCols(next)
    try {
      if (v) window.localStorage.setItem(storageKey, JSON.stringify(v))
      else window.localStorage.removeItem(storageKey)
    } catch { /* ignore */ }
  }
  return [cols, set]
}
