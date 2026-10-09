import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { fetchMe } from '../api/client'
import {
  beginLogin,
  isLoggedIn,
  logout as doLogout,
  parseDisplayName,
  parseUserSub,
} from './auth'

type AuthContextValue = {
  loggedIn: boolean
  displayName: string | null
  userSub: string | null
  isAdmin: boolean
  adminReady: boolean
  login: () => Promise<void>
  logout: () => void
  refreshSession: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [tick, setTick] = useState(0)
  const [isAdmin, setIsAdmin] = useState(false)
  const [adminReady, setAdminReady] = useState(false)

  const refreshSession = useCallback(() => {
    setTick((t) => t + 1)
  }, [])

  const loggedIn = isLoggedIn()

  useEffect(() => {
    if (!loggedIn) {
      setIsAdmin(false)
      setAdminReady(true)
      return
    }
    let cancelled = false
    setAdminReady(false)
    void fetchMe()
      .then((me) => {
        if (!cancelled) {
          setIsAdmin(me.isAdmin)
          setAdminReady(true)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setIsAdmin(false)
          setAdminReady(true)
        }
      })
    return () => {
      cancelled = true
    }
  }, [loggedIn, tick])

  const value = useMemo<AuthContextValue>(() => {
    void tick
    return {
      loggedIn: isLoggedIn(),
      displayName: parseDisplayName(),
      userSub: parseUserSub(),
      isAdmin,
      adminReady,
      login: beginLogin,
      logout: doLogout,
      refreshSession,
    }
  }, [tick, refreshSession, isAdmin, adminReady])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth skal bruges inden for AuthProvider')
  return ctx
}
