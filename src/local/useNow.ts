/**
 * The clock the time-derived pickup readings use (First Mile Ops, 2026-10-07): one hook, one tick a minute, so a page left open
 * moves a request to Exception (late, not planned, overdue …) and updates its tab counts WITHOUT a reload. No setting.
 */
import { useEffect, useState } from 'react'

export function useNow(intervalMs = 60_000): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), intervalMs)
    return () => window.clearInterval(t)
  }, [intervalMs])
  return now
}
