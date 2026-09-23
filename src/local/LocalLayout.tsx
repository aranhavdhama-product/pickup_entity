/**
 * The LOCAL app shell — sidebar + header + outlet, and the ONE `<ToastHost/>`
 * for this app (the console `Layout` mounts its own; two hosts in one tree would
 * render every toast twice).
 *
 * `fe-nueva` applies the design system's Lato face to the whole app, the way the
 * `/settings` surfaces do.
 *
 * This file, and everything it renders, must import nothing from `src/auth`.
 */
import { Outlet } from 'react-router-dom'
import LocalSidebar from './LocalSidebar'
import LocalHeader from './LocalHeader'
import { ToastHost } from '../nueva/toast'
/* the shared local chrome (tab strip, filter line, pills, chips) — imported
   ONCE, here; its colours read the `--pfp-*` tokens set on the root below */
import './chrome.css'
import { cssVars } from '../pages/LocalPFP/stagingTokens'

export default function LocalLayout() {
  return (
    <div className="fe-nueva flex h-screen overflow-hidden bg-canvas" style={cssVars}>
      <LocalSidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <LocalHeader />
        {/* `flex-1` gives this a definite height, which is what lets the Pending
            For Planning replica be a full-height column that scrolls its own
            grid; `overflow-auto` keeps the Pickup and Column Configuration
            pages, which are ordinary tall documents, scrollable. */}
        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
      <ToastHost />
    </div>
  )
}
