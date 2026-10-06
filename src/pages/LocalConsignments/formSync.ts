/**
 * The form setup on the SERVER (owner, 2026-10-06: "remove the Share button — find another way so settings persist
 * between devices"). Every page reads the setup from localStorage as before; this module keeps those keys in step
 * with ONE server copy (`/api/form-setup`, a private Vercel Blob — `api/form-setup.ts`), so every device and every
 * user gets the same consignment forms:
 *   - pull: main.tsx reads the server copy into this browser BEFORE the app renders (the form pages wait ≤ 2.5 s);
 *     coming back to the tab reads it again.
 *   - push: a change to any SETUP_KEYS value in this browser (the builder's Save, the Form Fields tab, …) is sent
 *     within ~2 s — whoever writes it. Last save wins.
 * No server (localhost dev, offline) = this browser's own setup, as before.
 *
 * Pure module: no React, no toast. Rule: a NEW form-setup key joins SETUP_KEYS (CLAUDE.md), or it stays per device.
 */
import {
  CUSTOM_FIELDS_KEY, FORM_RULES_GROW_KEY, FORM_RULES_V2_KEY, GOODS_SETTING_GROW_KEY, GOODS_SETTING_KEY,
  GOODS_SETTING_KEY_V1, LAYOUT_GROW_KEY, LAYOUT_KEY, ORDER_GROW_KEY, ORDER_KEY, SUMMARY_GROW_KEY, SUMMARY_KEY,
} from './formSetup'
import { BEHAVIOR_KEY, FIELD_CONFIG_KEY } from '../ConsignmentAdd/fieldConfig'

/** what a stored value must look like — a server copy with anything else is not used */
type Kind = 'object' | 'array' | 'goods'
/** EVERY key of the form setup. Not synced: the Simplified | full tier (each person's own choice), masters, the pickup
    module, merchants and demo data. */
export const SETUP_KEYS: Record<string, Kind> = {
  [FORM_RULES_V2_KEY]: 'object', [FORM_RULES_GROW_KEY]: 'object',
  [GOODS_SETTING_KEY]: 'goods', [GOODS_SETTING_KEY_V1]: 'goods', [GOODS_SETTING_GROW_KEY]: 'goods',
  [LAYOUT_KEY]: 'object', [LAYOUT_GROW_KEY]: 'object',
  [ORDER_KEY]: 'object', [ORDER_GROW_KEY]: 'object',
  [SUMMARY_KEY]: 'object', [SUMMARY_GROW_KEY]: 'object',
  [CUSTOM_FIELDS_KEY]: 'array',
  /* the account's shared config the v2 forms also read (the Form Fields tab's hides / Required, relabels) */
  [BEHAVIOR_KEY]: 'object', [FIELD_CONFIG_KEY]: 'object',
}
const isSetupKey = (k: string) => Object.hasOwn(SETUP_KEYS, k)
const VERSION = 1
const API = '/api/form-setup'
/** the pages that show a form the setup changes — they wait for the server copy before the app renders */
export const FORM_SETUP_PATHS = /^\/(local\/consignments|local\/settings\/consignment-order|grow\/orders)(\/|$)/

/** null = the key is not set (the reader's default) */
type Snapshot = Record<string, string | null>
interface Payload { v: number; s: Record<string, unknown>; updatedAt?: string }

function snapshot(): Snapshot {
  const out: Snapshot = {}
  for (const k of Object.keys(SETUP_KEYS)) out[k] = localStorage.getItem(k)
  return out
}
function write(snap: Snapshot) {
  for (const [k, v] of Object.entries(snap)) {
    if (!isSetupKey(k)) continue
    if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v)
  }
}
const valid = (kind: Kind, v: unknown) =>
  v === null
  || (kind === 'goods' && (v === 'sku' || v === 'separate' || v === 'combined'))
  || (kind === 'object' && typeof v === 'object' && !Array.isArray(v))
  || (kind === 'array' && Array.isArray(v))

/** the setup as the server keeps it: parsed values, null = the default (a broken value = the default, as every reader does) */
function payload(snap: Snapshot): Payload {
  const s: Record<string, unknown> = {}
  for (const [k, kind] of Object.entries(SETUP_KEYS)) {
    const raw = snap[k]
    if (raw == null) { s[k] = null; continue }
    if (kind === 'goods') { s[k] = raw; continue }
    try { s[k] = JSON.parse(raw) } catch { s[k] = null }
  }
  return { v: VERSION, s }
}
/** one string per setup, blind to JSON spacing — what "changed" is measured on */
const canon = (snap: Snapshot) => JSON.stringify(payload(snap).s)

/** the setup the server holds, as far as this browser knows; null = not known (no server reached yet) */
let synced: string | null = null
let lastPull = 0

export type PullResult = 'applied' | 'same' | 'empty' | 'off'
/** Read the server copy into this browser. 'applied' = the setup here changed · 'same' · 'empty' = nothing saved on
    the server yet · 'off' = no server (localhost dev, offline, a broken copy) — this browser keeps its own. */
export async function pullFormSetup(): Promise<PullResult> {
  lastPull = Date.now()
  let p: Payload
  try {
    const res = await fetch(API, { cache: 'no-store', headers: { accept: 'application/json' } })
    if (res.status === 204) {
      synced = canon(Object.fromEntries(Object.keys(SETUP_KEYS).map((k) => [k, null])))
      return 'empty'
    }
    /* the dev server answers an unknown path with the app's HTML */
    if (!res.ok || !(res.headers.get('content-type') ?? '').includes('application/json')) return 'off'
    p = await res.json() as Payload
  } catch { return 'off' }
  if (!p || typeof p !== 'object' || typeof p.v !== 'number' || !p.s || typeof p.s !== 'object' || Array.isArray(p.s)) return 'off'
  /* a copy from a newer version of the app: the keys this version knows are used, the rest skipped */
  const known = Object.keys(p.s).filter(isSetupKey)
  if (known.some((k) => !valid(SETUP_KEYS[k], p.s[k]))) return 'off'
  let prev: Snapshot
  try { prev = snapshot() } catch { return 'off' }
  const next: Snapshot = { ...prev }
  for (const k of known) {
    const v = p.s[k]
    next[k] = v === null ? null : typeof v === 'string' ? v : JSON.stringify(v)
  }
  synced = canon(next)
  if (canon(prev) === synced) return 'same'
  try { write(next) } catch { try { write(prev) } catch { /* nothing more to do */ } return 'off' }
  return 'applied'
}

async function push(snap: Snapshot): Promise<boolean> {
  try {
    const res = await fetch(API, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload(snap)) })
    return res.ok
  } catch { return false }
}

let started = false
/** Keep this browser and the server in step — only once a pull reached the server. A setup change here is sent
    within ~2 s (a failed send waits 30 s, then tries again); coming back to the tab after 30 s reads the server copy
    again, unless a change here is still waiting to be sent. */
export function startFormSetupSync(on: { remoteChange: () => void; sendFailed: () => void }) {
  if (started || synced === null) return
  started = true
  let busy = false
  let retryAt = 0
  let failing = false
  setInterval(async () => {
    if (busy || Date.now() < retryAt) return
    let snap: Snapshot
    try { snap = snapshot() } catch { return }
    const c = canon(snap)
    if (c === synced) return
    busy = true
    const ok = await push(snap)
    busy = false
    if (ok) { synced = c; failing = false; return }
    retryAt = Date.now() + 30_000
    if (!failing) { failing = true; on.sendFailed() }
  }, 2000)
  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState !== 'visible' || busy || Date.now() - lastPull < 30_000) return
    try { if (canon(snapshot()) !== synced) return } catch { return }
    if (await pullFormSetup() === 'applied') on.remoteChange()
  })
}
