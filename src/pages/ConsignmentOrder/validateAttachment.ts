// Close Consignment attachments — SED-8335 adds PDF alongside JPG/PNG.
// These checks are a UX affordance only: the server must re-verify type, size
// and content on upload, since anything here can be bypassed by the client.

export const MAX_BYTES = 10 * 1024 * 1024
export const MAX_FILES = 5

type Kind = 'image' | 'pdf'

export const ACCEPTED: Record<string, { mime: string; kind: Kind; label: string }> = {
  '.jpg': { mime: 'image/jpeg', kind: 'image', label: 'JPG' },
  '.jpeg': { mime: 'image/jpeg', kind: 'image', label: 'JPG' },
  '.png': { mime: 'image/png', kind: 'image', label: 'PNG' },
  '.pdf': { mime: 'application/pdf', kind: 'pdf', label: 'PDF' },
}

export type ValidationResult =
  | { ok: true; kind: Kind }
  | { ok: false; code: string; message: string }

const SIGNATURES: Record<string, number[][]> = {
  'application/pdf': [[0x25, 0x50, 0x44, 0x46]],
  'image/png': [[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]],
  'image/jpeg': [[0xff, 0xd8, 0xff]],
}

function extensionOf(name: string) {
  const dot = name.lastIndexOf('.')
  return dot === -1 ? '' : name.slice(dot).toLowerCase()
}

export function formatSize(bytes: number) {
  return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`
}

async function readHead(file: File): Promise<Uint8Array> {
  const slice = file.slice(0, 12)
  if (typeof slice.arrayBuffer === 'function') return new Uint8Array(await slice.arrayBuffer())
  return await new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer))
    reader.onerror = () => reject(reader.error)
    reader.readAsArrayBuffer(slice)
  })
}

function matches(head: Uint8Array, mime: string) {
  return SIGNATURES[mime].some((sig) => sig.every((byte, i) => head[i] === byte))
}

export async function validateAttachment(file: File, existing: File[]): Promise<ValidationResult> {
  if (existing.length >= MAX_FILES) {
    return { ok: false, code: 'TOO_MANY_FILES', message: `only ${MAX_FILES} files can be attached` }
  }
  if (file.size === 0) {
    return { ok: false, code: 'EMPTY_FILE', message: 'file is empty' }
  }
  if (file.size > MAX_BYTES) {
    return { ok: false, code: 'TOO_LARGE', message: `${formatSize(file.size)} exceeds the 10 MB limit` }
  }

  const ext = extensionOf(file.name)
  const accepted = ACCEPTED[ext]
  if (!accepted) {
    return { ok: false, code: 'UNSUPPORTED_TYPE', message: 'only JPG, PNG or PDF files are supported' }
  }
  // Some pickers report an empty type — only cross-check when the browser gave us one.
  if (file.type && file.type !== accepted.mime) {
    return { ok: false, code: 'UNSUPPORTED_TYPE', message: `reported as ${file.type}, which does not match a ${accepted.label} file` }
  }
  if (existing.some((f) => f.name === file.name && f.size === file.size)) {
    return { ok: false, code: 'DUPLICATE', message: 'already attached' }
  }

  let head: Uint8Array
  try {
    head = await readHead(file)
  } catch {
    return { ok: false, code: 'UNREADABLE', message: 'file could not be read' }
  }
  if (!matches(head, accepted.mime)) {
    return { ok: false, code: 'CONTENT_MISMATCH', message: `contents are not a valid ${accepted.label} file` }
  }

  return { ok: true, kind: accepted.kind }
}
