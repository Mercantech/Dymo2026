import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  beginLogin,
  isLoggedIn,
  logout as doLogout,
  parseDisplayName,
} from './auth'

type AuthContextValue = {
  loggedIn: boolean
  displayName: string | null
  login: () => Promise<void>
  logout: () => void
  refreshSession: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [tick, setTick] = useState(0)

  const refreshSession = useCallback(() => {
    setTick((t) => t + 1)
  }, [])

  const value = useMemo<AuthContextValue>(() => {
    void tick
    return {
      loggedIn: isLoggedIn(),
      displayName: parseDisplayName(),
      login: beginLogin,
      logout: doLogout,
      refreshSession,
    }
  }, [tick, refreshSession])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth skal bruges inden for AuthProvider')
  return ctx
}
