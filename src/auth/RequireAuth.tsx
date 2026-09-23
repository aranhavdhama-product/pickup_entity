/**
 * Route guard — sends anonymous users to /login (remembering where they were),
 * shows a light splash while the session bootstraps.
 */
import { Navigate, useLocation } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { useAuth } from './AuthContext'

export default function RequireAuth({ children }: { children: React.ReactNode }) {
  const { status } = useAuth()
  const location = useLocation()

  if (status === 'loading') {
    return (
      <div className="fe-nueva flex min-h-screen items-center justify-center bg-canvas text-ink-3">
        <Loader2 size={20} className="animate-spin" />
      </div>
    )
  }
  if (status === 'anonymous') {
    return <Navigate to="/console/login" replace state={{ from: location.pathname + location.search }} />
  }
  return <>{children}</>
}
