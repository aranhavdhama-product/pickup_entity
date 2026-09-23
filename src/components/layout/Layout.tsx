import { useState, type Dispatch, type SetStateAction } from 'react'
import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import Header from './Header'
import { ToastHost } from '../../nueva/toast'

/** exposed to routed pages via useOutletContext — lets a page collapse the app
 * nav for a focused split-view (e.g. the Consignment Form Builder). */
export type LayoutOutletContext = {
  collapsed: boolean
  setCollapsed: Dispatch<SetStateAction<boolean>>
}

export default function Layout() {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed(v => !v)} />
      <div className="flex flex-col flex-1 overflow-hidden">
        <Header />
        <main className="flex-1 overflow-auto">
          <Outlet context={{ collapsed, setCollapsed } satisfies LayoutOutletContext} />
        </main>
      </div>
      <ToastHost />
    </div>
  )
}
