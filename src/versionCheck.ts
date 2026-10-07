/**
 * "I cannot see the latest changes" (owner, 2026-10-07): a tab left open keeps the bundle it loaded, so a new deploy never reaches
 * it until a reload. This compares the bundle the page runs with the one the server serves NOW (the built `index.html` names
 * it) — on a return to the tab and every five minutes — and offers a Reload once, the first time they differ. In `vite dev`
 * there is no hashed bundle, so it does nothing.
 */
const BUNDLE = /\/assets\/index-[\w-]+\.js/

export function startVersionCheck(onNewVersion: () => void) {
  const running = [...document.scripts].map((s) => s.src).find((u) => BUNDLE.test(u))
  if (!running) return
  let told = false
  const check = async () => {
    if (told) return
    try {
      const html = await (await fetch('/index.html', { cache: 'no-store' })).text()
      const served = html.match(BUNDLE)?.[0]
      if (served && !running.endsWith(served)) { told = true; onNewVersion() }
    } catch { /* offline — try again later */ }
  }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') void check() })
  window.setInterval(() => void check(), 5 * 60_000)
  window.setTimeout(() => void check(), 30_000)
}
