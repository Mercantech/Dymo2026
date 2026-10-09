import { useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { fetchAdminStats, type AdminStats } from '../api/client'
import { useAuth } from '../auth/AuthContext'

function formatWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString('da-DK', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

export function AdminPage() {
  const { loggedIn, isAdmin, adminReady, logout, displayName } = useAuth()
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!loggedIn || !adminReady || !isAdmin) return
    let cancelled = false
    void fetchAdminStats()
      .then((s) => {
        if (!cancelled) {
          setStats(s)
          setError(null)
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Kunne ikke hente stats')
        }
      })
    return () => {
      cancelled = true
    }
  }, [loggedIn, isAdmin, adminReady])

  if (!loggedIn) return <Navigate to="/login" replace />
  if (!adminReady) return <p className="callback-page">Tjekker adgang…</p>
  if (!isAdmin) return <Navigate to="/" replace />

  const maxDay = Math.max(1, ...(stats?.perDay.map((d) => d.prints) ?? [1]))

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <h1 className="brand">
            Dymo<span>Tag</span>
          </h1>
          <p className="lede">Admin — printstatistik (uden personlige etiketter).</p>
        </div>
        <div className="topbar-actions">
          <Link className="btn btn-ghost" to="/">
            Editor
          </Link>
          {displayName && <span className="user-chip">{displayName}</span>}
          <button className="btn btn-ghost" type="button" onClick={logout}>
            Log ud
          </button>
        </div>
      </header>

      {error && <p className="status error">{error}</p>}

      {stats && (
        <div className="admin-grid">
          <div className="stat">
            <span className="stat-label">Prints i alt</span>
            <strong className="stat-value">{stats.totalPrints}</strong>
          </div>
          <div className="stat">
            <span className="stat-label">Seneste 7 dage</span>
            <strong className="stat-value">{stats.printsLast7Days}</strong>
          </div>
          <div className="stat">
            <span className="stat-label">Unikke brugere</span>
            <strong className="stat-value">{stats.uniqueUsers}</strong>
          </div>
          <div className="stat">
            <span className="stat-label">Kopier i alt</span>
            <strong className="stat-value">{stats.totalCopies}</strong>
          </div>

          <section className="admin-block">
            <h2>Prints pr. dag</h2>
            <div className="bars" aria-hidden={stats.perDay.every((d) => d.prints === 0)}>
              {stats.perDay.map((d) => (
                <div key={d.date} className="bar-col">
                  <div
                    className="bar"
                    style={{ height: `${(d.prints / maxDay) * 100}%` }}
                    title={`${d.date}: ${d.prints}`}
                  />
                  <span>{d.date.slice(5)}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="admin-block">
            <h2>Mest aktive</h2>
            {stats.topUsers.length === 0 ? (
              <p className="hint">Ingen data endnu.</p>
            ) : (
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Navn</th>
                    <th>Prints</th>
                    <th>Kopier</th>
                    <th>Senest</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.topUsers.map((u) => (
                    <tr key={u.userSub}>
                      <td>{u.displayName}</td>
                      <td>{u.prints}</td>
                      <td>{u.copies}</td>
                      <td>{formatWhen(u.lastAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </div>
      )}

      {!stats && !error && <p className="hint">Henter statistik…</p>}
    </div>
  )
}
