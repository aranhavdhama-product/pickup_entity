/**
 * The account's consignment-form setup, kept on the server so every device and every user sees the same form
 * (owner, 2026-10-06: "find another way so settings persist between devices" — replaces the Share form link).
 *
 * ONE private Vercel Blob (`form-setup/current.json`, store `fareye-ui-settings`, token `BLOB_READ_WRITE_TOKEN`):
 *   GET → `{ v, s, updatedAt }`, or 204 when nothing is saved yet
 *   PUT `{ v, s }` → saves it whole (last save wins) → `{ updatedAt }`
 * `s` = localStorage key → its parsed value (null = the default). The browser side is
 * `src/pages/LocalConsignments/formSync.ts`. No auth: the prototype has none — so the body is checked hard and is
 * never anything but a small form setup.
 */
import { get, put } from '@vercel/blob'

const PATH = 'form-setup/current.json'
const MAX_BYTES = 300_000
const MAX_KEYS = 40
const KEY = /^[a-z0-9][a-z0-9-]{0,79}$/

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } })

export async function GET() {
  try {
    const r = await get(PATH, { access: 'private', useCache: false })
    if (!r || r.statusCode !== 200) return new Response(null, { status: 204, headers: { 'cache-control': 'no-store' } })
    return new Response(r.stream, { headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } })
  } catch {
    return json({ error: 'The form setup could not be read' }, 502)
  }
}

export async function PUT(request: Request) {
  const text = await request.text()
  if (text.length > MAX_BYTES) return json({ error: 'Too big' }, 413)
  let p: { v?: unknown; s?: unknown }
  try { p = JSON.parse(text) } catch { return json({ error: 'Not JSON' }, 400) }
  if (!p || typeof p !== 'object' || typeof p.v !== 'number' || !p.s || typeof p.s !== 'object' || Array.isArray(p.s)) {
    return json({ error: 'Not a form setup' }, 400)
  }
  const entries = Object.entries(p.s as Record<string, unknown>)
  if (entries.length > MAX_KEYS || entries.some(([k, v]) => !KEY.test(k) || (v !== null && typeof v !== 'string' && typeof v !== 'object'))) {
    return json({ error: 'Not a form setup' }, 400)
  }
  const updatedAt = new Date().toISOString()
  try {
    await put(PATH, JSON.stringify({ v: p.v, s: p.s, updatedAt }), {
      access: 'private', addRandomSuffix: false, allowOverwrite: true, contentType: 'application/json', cacheControlMaxAge: 60,
    })
  } catch {
    return json({ error: 'The form setup could not be saved' }, 502)
  }
  return json({ updatedAt })
}
