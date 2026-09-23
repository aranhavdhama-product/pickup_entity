/**
 * The app is two apps in one build — see `routes.tsx` for the whole URL surface.
 *
 * Only the router lives here. `AuthProvider` used to wrap `<Routes>` from this
 * file, which mounted it (and its `/staging` session probe) for every page in
 * the build; it is now a layout route around the console subtree only.
 */
import { BrowserRouter } from 'react-router-dom'
import AppRoutes from './routes'

export default function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  )
}
