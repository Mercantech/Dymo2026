import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { AUTH_CLIENT_ID } from '../auth/config'

export function LoginPage() {
  const { loggedIn, login } = useAuth()
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (loggedIn) return <Navigate to="/" replace />

  async function onLogin() {
    setError(null)
    setBusy(true)
    try {
      if (!AUTH_CLIENT_ID) {
        throw new Error('VITE_AUTH_CLIENT_ID mangler i miljøet')
      }
      await login()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Login fejlede')
      setBusy(false)
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <h1 className="brand">
          Dymo<span>Tag</span>
        </h1>
        <p className="lede">
          Print til LetraTag 200B direkte fra browseren — uden den officielle app.
        </p>
        <button className="btn btn-tape" type="button" disabled={busy} onClick={onLogin}>
          {busy ? 'Åbner login…' : 'Log ind med Mercantec'}
        </button>
        {error && <p className="status error">{error}</p>}
      </div>
    </div>
  )
}
