import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { FORM_SETUP_PATHS, pullFormSetup, startFormSetupSync } from './pages/LocalConsignments/formSync'
import { toast } from './nueva/toast'
import { startVersionCheck } from './versionCheck'

let rendered = false
const render = () => {
  if (rendered) return
  rendered = true
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

/* The consignment-form setup lives on the server (formSync, owner 2026-10-06), so every device shows the same form.
   It is read into localStorage BEFORE render, so no page needs to remount: a form page waits for it (≤ 2.5 s), every
   other page renders at once. A copy that lands after the form is on screen offers a reload. */
const reload = { label: 'Reload', onClick: () => window.location.reload() }
/* a deploy that landed while this tab was open — offered once, never forced */
startVersionCheck(() => toast.info('A new version of FarEye is available', { action: reload }))
const onForm = () => FORM_SETUP_PATHS.test(window.location.pathname)
if (onForm()) setTimeout(render, 2500); else render()
pullFormSetup().then((r) => {
  if (r === 'applied' && rendered && onForm()) toast.info('The consignment form was changed on another device', { action: reload })
}).finally(() => {
  render()
  startFormSetupSync({
    remoteChange: () => { if (onForm()) toast.info('The consignment form was changed on another device', { action: reload }) },
    sendFailed: () => toast.error('Form setup saved on this device only — the server could not be reached. It will try again.'),
  })
})
