/**
 * Share form (2026-10-06): two links that carry the SAVED form setup — one opens the console's Add Consignment, the
 * other the Grow portal's Create Order. Each link carries the whole setup (both forms); only the page it opens differs.
 * The setup itself is packed by ./formShare and applied on the other side by main.tsx.
 */
import { useEffect, useRef, useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { Button, Modal } from '../../nueva/components'
import { toast } from '../../nueva/toast'
import { CONSOLE_FORM_PATH, GROW_FORM_PATH, isLocalOrigin, makeShareToken, shareUrl } from './formShare'

const ROWS = {
  console: { title: 'Console form', hint: 'For ops · Add Consignment', path: CONSOLE_FORM_PATH },
  grow: { title: 'Grow portal form', hint: 'For merchants · Create Order', path: GROW_FORM_PATH },
}
/** past this a link may be cut by a chat or mail app */
const LONG_LINK = 8000

export default function ShareFormDialog({ open, onClose, first = 'console' }: {
  open: boolean; onClose: () => void
  /** the form the person was editing — its link is listed first */
  first?: 'console' | 'grow'
}) {
  /* mounted per opening, so every opening packs the setup saved at that moment */
  return open ? <ShareBody onClose={onClose} first={first} /> : null
}

function ShareBody({ onClose, first }: { onClose: () => void; first: 'console' | 'grow' }) {
  const [token, setToken] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let live = true
    makeShareToken().then((t) => { if (live) setToken(t) }, () => { if (live) setFailed(true) })
    return () => { live = false }
  }, [])
  const order = first === 'grow' ? (['grow', 'console'] as const) : (['console', 'grow'] as const)
  const local = isLocalOrigin()
  return (
    <Modal open onClose={onClose} title="Share this form" subtitle="Anyone who opens a link gets this form setup."
      footer={<Button onClick={onClose}>Done</Button>}>
      <div>
        {order.map((k) => (
          <LinkRow key={k} {...ROWS[k]} url={token ? shareUrl(ROWS[k].path, token) : null} failed={failed} />
        ))}
      </div>
      {(local || (token && token.length > LONG_LINK)) && (
        <div className="space-y-1 pb-3">
          {local && <p className="text-[12px] text-ink-3">This link opens on this computer only — share it from the live site.</p>}
          {token && token.length > LONG_LINK && <p className="text-[12px] text-ink-3">This link is long — some apps may cut it.</p>}
        </div>
      )}
    </Modal>
  )
}

function LinkRow({ title, hint, url, failed }: { title: string; hint: string; url: string | null; failed: boolean }) {
  const box = useRef<HTMLDivElement>(null)
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (!copied) return
    const t = setTimeout(() => setCopied(false), 2000)
    return () => clearTimeout(t)
  }, [copied])
  const copy = async () => {
    if (!url) return
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      toast.success('Link copied')
    } catch {
      /* no clipboard (not a secure page, or blocked): select the link so it can be copied by hand */
      const sel = window.getSelection()
      if (box.current && sel) sel.selectAllChildren(box.current)
      toast.info('Link selected — press Ctrl+C to copy')
    }
  }
  return (
    <div className="border-b border-line py-4 last:border-0">
      <p className="text-[13px] font-bold text-ink">{title}</p>
      <p className="text-[12px] text-ink-3">{hint}</p>
      <div className="mt-2 flex items-center gap-2">
        <div ref={box} title={url ?? undefined} data-share-link
          className="h-8 min-w-0 flex-1 select-all truncate rounded-md border border-warm-200 bg-warm-50 px-3 text-[13px] leading-8 text-ink-2">
          {url ?? (failed ? 'The link could not be made — try again' : 'Making the link…')}
        </div>
        <Button variant="outline" icon={copied ? <Check size={14} /> : <Copy size={14} />} disabled={!url} onClick={() => { void copy() }}>
          {copied ? 'Copied' : 'Copy link'}
        </Button>
      </div>
    </div>
  )
}
