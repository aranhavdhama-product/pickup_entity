/**
 * App-wide auth state. Bootstraps on mount by asking the dev server whether the
 * proxy session decodes to a live user, and if so pulls the account profile.
 * Provides login()/logout() and the current account to the whole tree.
 */
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import {
  fetchAccount, getSessionInfo, login as apiLogin, logout as apiLogout,
  type Account, type SessionInfo,
} from './authApi'

interface AuthState {
  status: 'loading' | 'authenticated' | 'anonymous'
  account: Account | null
  session: SessionInfo | null
  signIn: (username: string, password: string, rememberMe: boolean) => Promise<void>
  signOut: () => Promise<void>
  refresh: () => Promise<void>
}

const Ctx = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthState['status']>('loading')
  const [account, setAccount] = useState<Account | null>(null)
  const [session, setSession] = useState<SessionInfo | null>(null)

  const load = async () => {
    try {
      const info = await getSessionInfo()
      setSession(info)
      if (!info.hasCookie) { setAccount(null); setStatus('anonymous'); return }
      const acc = await fetchAccount()
      setAccount(acc)
      setStatus('authenticated')
    } catch {
      setAccount(null)
      setStatus('anonymous')
    }
  }

  useEffect(() => {
    let cancelled = false
    const run = async () => { if (!cancelled) await load() }
    void run()
    return () => { cancelled = true }
  }, [])

  const signIn = async (username: string, password: string, rememberMe: boolean) => {
    await apiLogin(username, password, rememberMe)
    // proxy now holds the fresh session — hydrate profile + session badge
    const [info, acc] = await Promise.all([getSessionInfo(), fetchAccount()])
    setSession(info)
    setAccount(acc)
    setStatus('authenticated')
  }

  const signOut = async () => {
    await apiLogout()
    setAccount(null)
    setSession(null)
    setStatus('anonymous')
  }

  return (
    <Ctx.Provider value={{ status, account, session, signIn, signOut, refresh: load }}>
      {children}
    </Ctx.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthState {
  const v = useContext(Ctx)
  if (!v) throw new Error('useAuth must be used within <AuthProvider>')
  return v
}
