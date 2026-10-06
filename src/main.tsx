import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { applyShareToken, hasShareHash, restoreSetup, SHARE_PREFIX, type ShareResult } from './pages/LocalConsignments/formShare'
import { toast } from './nueva/toast'

const render = () => createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

/* "Share form" links (2026-10-06): `#form-setup=…` copies the sharer's form setup into this browser BEFORE any page
   reads it, so no page needs to remount. The toast is pushed before render; ToastHost starts from the pending list. */
const BROKEN = 'This form link is broken — ask for a new one'
function announce(r: ShareResult) {
  if (!r.ok) {
    toast.error(r.reason === 'unsupported' ? 'This browser cannot open form links — please update it'
      : r.reason === 'blocked' ? 'This browser does not keep settings, so the form link cannot be used here'
      : BROKEN)
    return
  }
  const more = r.newer ? ' Some parts need the newest version of the app.' : ''
  if (!r.changed) { toast.info(`You already have this form setup.${more}`); return }
  if (r.replaced) {
    toast.success(`Form setup from the link is now in use — it replaced your own.${more}`,
      { action: { label: 'Undo', onClick: () => { restoreSetup(r.previous); window.location.reload() } } })
  } else toast.success(`Form setup from the link is now in use.${more}`)
}
const { hash, pathname, search } = window.location
if (hasShareHash(hash)) {
  /* cleared first, so a reload never applies it twice */
  history.replaceState(history.state, '', pathname + search)
  applyShareToken(hash.slice(SHARE_PREFIX.length)).then(announce, () => toast.error(BROKEN)).finally(render)
} else render()
/* the same link pasted into a tab already on that page changes only the hash — load it again so the lines above run */
window.addEventListener('hashchange', () => { if (hasShareHash(window.location.hash)) window.location.reload() })
