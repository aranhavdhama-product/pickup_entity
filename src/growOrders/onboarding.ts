/**
 * The "Send Your First Order" checklist's one bit of state that nothing else
 * already tracks: whether this merchant has ever opened Get a Quote. (Complete
 * Profile and Book Your Shipment are derived live from real account/order
 * data — see DashboardPage.tsx — so they need no storage of their own.)
 */
const KEY = 'grow-onboarding-v1'
type Db = Record<string, { quoteSeen?: boolean }>

function read(): Db {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '{}')
    return v && typeof v === 'object' ? v : {}
  } catch { return {} }
}

export function hasSeenQuote(merchantCode: string | null): boolean {
  return !!(merchantCode && read()[merchantCode]?.quoteSeen)
}

export function markQuoteSeen(merchantCode: string | null): void {
  if (!merchantCode) return
  try {
    const db = read()
    localStorage.setItem(KEY, JSON.stringify({ ...db, [merchantCode]: { ...db[merchantCode], quoteSeen: true } }))
  } catch { /* ignore */ }
}
