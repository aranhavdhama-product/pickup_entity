/**
 * "Share form" (2026-10-06, owner: "when I save a consignment form and share a link to someone these changes are not
 * reflected for other user"). The form setup lives in each browser's localStorage and the app has no server, so a saved
 * form never reached anyone else. A share link carries the WHOLE saved setup in the URL HASH (never sent to a server):
 * `#form-setup=z.<base64url>` (deflate) or `j.<base64url>` (plain JSON, a browser without CompressionStream). Opening
 * any app URL with it copies the setup into this browser before the app renders (main.tsx).
 *
 * Pure module: no React, no toast, no fetch. Rule: a NEW form-setup key joins SHARE_KEYS (CLAUDE.md), or links miss it.
 */
import {
  CUSTOM_FIELDS_KEY, FORM_RULES_GROW_KEY, FORM_RULES_V2_KEY, FORM_TIER_KEY, GOODS_SETTING_GROW_KEY, GOODS_SETTING_KEY,
  GOODS_SETTING_KEY_V1, LAYOUT_GROW_KEY, LAYOUT_KEY, ORDER_GROW_KEY, ORDER_KEY, SUMMARY_GROW_KEY, SUMMARY_KEY,
} from './formSetup'
import { BEHAVIOR_KEY, FIELD_CONFIG_KEY } from '../ConsignmentAdd/fieldConfig'

/** what a stored value must look like — a link with anything else is refused whole */
type Kind = 'object' | 'array' | 'goods'
/** EVERY key of the form setup. Not shared: the Simplified | full tier (a viewer's own choice), masters, the pickup
    module, merchants and demo data — account data, not the form's setup. */
export const SHARE_KEYS: Record<string, Kind> = {
  [FORM_RULES_V2_KEY]: 'object', [FORM_RULES_GROW_KEY]: 'object',
  [GOODS_SETTING_KEY]: 'goods', [GOODS_SETTING_KEY_V1]: 'goods', [GOODS_SETTING_GROW_KEY]: 'goods',
  [LAYOUT_KEY]: 'object', [LAYOUT_GROW_KEY]: 'object',
  [ORDER_KEY]: 'object', [ORDER_GROW_KEY]: 'object',
  [SUMMARY_KEY]: 'object', [SUMMARY_GROW_KEY]: 'object',
  [CUSTOM_FIELDS_KEY]: 'array',
  /* the account's shared config the v2 forms also read (the Form Fields tab's hides / Required, relabels) */
  [BEHAVIOR_KEY]: 'object', [FIELD_CONFIG_KEY]: 'object',
}
const isShareKey = (k: string) => Object.hasOwn(SHARE_KEYS, k)
export const SHARE_VERSION = 1
export const SHARE_PREFIX = '#form-setup='
export const CONSOLE_FORM_PATH = '/local/consignments/new'
export const GROW_FORM_PATH = '/grow/orders/add'
export const MAX_TOKEN = 100_000
export const MAX_JSON = 1_000_000

/** null = the key is not set (the reader's default) */
export type Snapshot = Record<string, string | null>
interface Payload { v: number; s: Record<string, unknown> }

/* ---------------------------------------------------------------- bytes ---- */
const toB64url = (u8: Uint8Array) => {
  let bin = ''
  for (let i = 0; i < u8.length; i += 0x8000) bin += String.fromCharCode(...u8.subarray(i, i + 0x8000))
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
const fromB64url = (s: string) => {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/')
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4))
  return Uint8Array.from(bin, (c) => c.charCodeAt(0))
}
/** run bytes through a (de)compression stream, stopping past `limit` bytes (a "zip bomb" link) */
async function pipe(u8: Uint8Array, stream: CompressionStream | DecompressionStream, limit: number): Promise<Uint8Array> {
  const reader = new Blob([u8 as BlobPart]).stream().pipeThrough(stream).getReader()
  const parts: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.length
    if (total > limit) { await reader.cancel(); throw new Error('too big') }
    parts.push(value)
  }
  const out = new Uint8Array(total)
  let at = 0
  for (const p of parts) { out.set(p, at); at += p.length }
  return out
}

/* ------------------------------------------------------------- snapshot ---- */
/** the setup as stored now, key by key */
export function snapshot(): Snapshot {
  const out: Snapshot = {}
  for (const k of Object.keys(SHARE_KEYS)) out[k] = localStorage.getItem(k)
  return out
}
/** put a snapshot back (Undo) — null removes the key; only setup keys (+ the tier a link cleared) are written */
export function restoreSetup(snap: Snapshot) {
  for (const [k, v] of Object.entries(snap)) {
    if (!isShareKey(k) && k !== FORM_TIER_KEY) continue
    if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v)
  }
}

/* -------------------------------------------------------------- encode ---- */
/** the hash value for the setup saved in THIS browser: `z.…` (deflate) or `j.…` (no CompressionStream) */
export async function makeShareToken(): Promise<string> {
  const s: Record<string, unknown> = {}
  for (const [k, kind] of Object.entries(SHARE_KEYS)) {
    const raw = localStorage.getItem(k)
    if (raw === null) { s[k] = null; continue }
    if (kind === 'goods') { s[k] = raw; continue }
    try { s[k] = JSON.parse(raw) } catch { s[k] = null /* a broken value = the default, as every reader does */ }
  }
  const bytes = new TextEncoder().encode(JSON.stringify({ v: SHARE_VERSION, s } satisfies Payload))
  if (typeof CompressionStream === 'function') return `z.${toB64url(await pipe(bytes, new CompressionStream('deflate'), MAX_JSON))}`
  return `j.${toB64url(bytes)}`
}
export const shareUrl = (path: string, token: string, origin = location.origin) => `${origin}${path}${SHARE_PREFIX}${token}`
/** a link made on this computer (localhost, a LAN address) only opens here */
export const isLocalOrigin = (host = location.hostname) =>
  host === 'localhost' || host === '[::1]' || /^(127\.|0\.0\.0\.0|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host)
/** the address carries a share link */
export const hasShareHash = (hash: string) => hash.startsWith(SHARE_PREFIX)

/* -------------------------------------------------------------- decode ---- */
const valid = (kind: Kind, v: unknown) =>
  v === null
  || (kind === 'goods' && (v === 'sku' || v === 'separate' || v === 'combined'))
  || (kind === 'object' && typeof v === 'object' && !Array.isArray(v))
  || (kind === 'array' && Array.isArray(v))

export type ShareResult =
  | { ok: true; changed: boolean; replaced: boolean; newer: boolean; previous: Snapshot }
  | { ok: false; reason: 'invalid' | 'unsupported' | 'blocked' }

/** Copy a link's setup into this browser. All or nothing: a bad link writes nothing. `raw` = what follows `#form-setup=`. */
export async function applyShareToken(raw: string): Promise<ShareResult> {
  /* a chat app may stick a '.' or ')' to the end of a link */
  const token = raw.trim().replace(/[^A-Za-z0-9_-]+$/, '')
  if (!/^[jz]\.[A-Za-z0-9_-]+$/.test(token) || token.length > MAX_TOKEN) return { ok: false, reason: 'invalid' }
  let p: Payload
  try {
    const bytes = fromB64url(token.slice(2))
    let json: string
    if (token[0] === 'z') {
      if (typeof DecompressionStream !== 'function') return { ok: false, reason: 'unsupported' }
      json = new TextDecoder().decode(await pipe(bytes, new DecompressionStream('deflate'), MAX_JSON))
    } else {
      if (bytes.length > MAX_JSON) return { ok: false, reason: 'invalid' }
      json = new TextDecoder().decode(bytes)
    }
    p = JSON.parse(json) as Payload
  } catch { return { ok: false, reason: 'invalid' } }
  if (!p || typeof p !== 'object' || typeof p.v !== 'number' || p.v < 1 || !p.s || typeof p.s !== 'object' || Array.isArray(p.s)) {
    return { ok: false, reason: 'invalid' }
  }
  /* a link from a newer version of the app: what this version knows is applied, the rest is skipped */
  const all = Object.keys(p.s)
  const known = all.filter(isShareKey)
  const newer = p.v > SHARE_VERSION || known.length < all.length
  if (!known.length) return { ok: false, reason: 'invalid' }
  for (const k of known) if (!valid(SHARE_KEYS[k], p.s[k])) return { ok: false, reason: 'invalid' }
  let previous: Snapshot
  try { previous = snapshot() } catch { return { ok: false, reason: 'blocked' } }
  /* a key the link does not mention (an older link) keeps this browser's value */
  const next: Snapshot = { ...previous }
  for (const k of known) {
    const v = p.s[k]
    next[k] = v === null ? null : typeof v === 'string' ? v : JSON.stringify(v)
  }
  const norm = (k: string, v: string | null) => {
    if (v === null || SHARE_KEYS[k] === 'goods') return v
    try { return JSON.stringify(JSON.parse(v)) } catch { return null }
  }
  const changed = Object.keys(SHARE_KEYS).some((k) => norm(k, previous[k]) !== norm(k, next[k]))
  const replaced = changed && Object.values(previous).some((v) => v !== null)
  if (changed) {
    try {
      restoreSetup(next)
      /* the Simplified tier is not customisable — open the shared form itself (Undo puts the tier back) */
      if (localStorage.getItem(FORM_TIER_KEY) === 'simplified') {
        localStorage.removeItem(FORM_TIER_KEY)
        previous = { ...previous, [FORM_TIER_KEY]: 'simplified' }
      }
    } catch {
      try { restoreSetup(previous) } catch { /* nothing more to do */ }
      return { ok: false, reason: 'blocked' }
    }
  }
  return { ok: true, changed, replaced, newer, previous }
}
