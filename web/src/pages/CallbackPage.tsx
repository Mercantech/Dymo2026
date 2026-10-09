import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { handleCallback } from '../auth/auth'
import { useAuth } from '../auth/AuthContext'

export function CallbackPage() {
  const navigate = useNavigate()
  const { refreshSession } = useAuth()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        await handleCallback(new URL(window.location.href))
        if (cancelled) return
        refreshSession()
        navigate('/', { replace: true })
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Callback fejlede')
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [navigate, refreshSession])

  if (error) {
    return (
      <div className="callback-page">
        <div>
          <p className="status error">{error}</p>
          <button className="btn btn-secondary" type="button" onClick={() => navigate('/login')}>
            Tilbage til login
          </button>
        </div>
      </div>
    )
  }

  return <div className="callback-page">Logger ind…</div>
}
