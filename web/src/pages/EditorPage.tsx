import { useEffect, useMemo, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { composeLabel, type ComposeResult } from '../label/compose'
import type { LabelSpec } from '../label/types'
import { checkBrowserSupport } from '../printer/browser'
import {
  connectPrinter,
  disconnectPrinter,
  getConnectedName,
  printLabel,
} from '../printer/session'

const DEFAULT_SPEC: LabelSpec = {
  text: 'Hello DymoTag',
  fontSize: 18,
  qrEnabled: false,
  qrContent: 'https://dymo.mercantec.tech',
  barcodeEnabled: false,
  barcodeContent: 'DYMO2026',
}

export function EditorPage() {
  const { loggedIn, displayName, logout } = useAuth()
  const support = useMemo(() => checkBrowserSupport(), [])

  const [spec, setSpec] = useState<LabelSpec>(DEFAULT_SPEC)
  const [composed, setComposed] = useState<ComposeResult | null>(null)
  const [composeError, setComposeError] = useState<string | null>(null)
  const [printerName, setPrinterName] = useState<string | null>(getConnectedName())
  const [copies, setCopies] = useState(1)
  const [autoCut, setAutoCut] = useState(true)
  const [busy, setBusy] = useState<'connect' | 'print' | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [statusKind, setStatusKind] = useState<'ok' | 'error' | null>(null)

  useEffect(() => {
    let cancelled = false
    const timer = window.setTimeout(() => {
      composeLabel(spec)
        .then((result) => {
          if (cancelled) return
          setComposed(result)
          setComposeError(null)
        })
        .catch((e: unknown) => {
          if (cancelled) return
          setComposed(null)
          setComposeError(e instanceof Error ? e.message : 'Kunne ikke bygge etiket')
        })
    }, 120)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [spec])

  if (!loggedIn) return <Navigate to="/login" replace />

  async function onConnect() {
    setBusy('connect')
    setStatus(null)
    setStatusKind(null)
    try {
      const name = await connectPrinter()
      setPrinterName(name)
      setStatus(`Forbundet: ${name}`)
      setStatusKind('ok')
    } catch (e) {
      setPrinterName(null)
      setStatus(e instanceof Error ? e.message : 'Forbindelse fejlede')
      setStatusKind('error')
    } finally {
      setBusy(null)
    }
  }

  async function onDisconnect() {
    await disconnectPrinter()
    setPrinterName(null)
    setStatus('Afbrudt')
    setStatusKind(null)
  }

  async function onPrint() {
    if (!composed) return
    setBusy('print')
    setStatus(null)
    setStatusKind(null)
    try {
      const result = await printLabel(composed.image, { copies, autoCut })
      const err = result?.errors?.[0]?.message
      setStatus(err ? `Print færdig med advarsel: ${err}` : 'Print OK')
      setStatusKind(err ? 'error' : 'ok')
    } catch (e) {
      setStatus(e instanceof Error ? e.message : 'Print fejlede')
      setStatusKind('error')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <h1 className="brand">
            Dymo<span>Tag</span>
          </h1>
          <p className="lede">12 mm LetraTag — tekst, QR og Code128.</p>
        </div>
        <div className="topbar-actions">
          {displayName && <span className="user-chip">{displayName}</span>}
          <button className="btn btn-ghost" type="button" onClick={logout}>
            Log ud
          </button>
        </div>
      </header>

      <section className="stage" aria-label="Etiket-forhåndsvisning">
        {composed ? (
          <img
            className="tape-preview"
            src={composed.previewDataUrl}
            alt="Forhåndsvisning af etiket"
            width={composed.widthPx}
            height={composed.heightPx}
          />
        ) : (
          <p className="tape-empty">{composeError || 'Bygger forhåndsvisning…'}</p>
        )}
      </section>

      <div className="panel">
        <div className="field">
          <label htmlFor="text">Tekst</label>
          <input
            id="text"
            type="text"
            value={spec.text}
            onChange={(e) => setSpec((s) => ({ ...s, text: e.target.value }))}
            placeholder="Etikettekst"
          />
        </div>

        <div className="row">
          <div className="field">
            <label htmlFor="fontSize">Skriftstørrelse</label>
            <input
              id="fontSize"
              type="number"
              min={10}
              max={28}
              value={spec.fontSize}
              onChange={(e) =>
                setSpec((s) => ({ ...s, fontSize: Number(e.target.value) || 18 }))
              }
            />
          </div>
          <div className="field">
            <label htmlFor="copies">Kopier</label>
            <input
              id="copies"
              type="number"
              min={1}
              max={20}
              value={copies}
              onChange={(e) => setCopies(Math.max(1, Number(e.target.value) || 1))}
            />
          </div>
        </div>

        <div className="field">
          <div className="toggle-row">
            <input
              id="qrEnabled"
              type="checkbox"
              checked={spec.qrEnabled}
              onChange={(e) => setSpec((s) => ({ ...s, qrEnabled: e.target.checked }))}
            />
            <label htmlFor="qrEnabled">QR-kode</label>
          </div>
          <input
            type="text"
            value={spec.qrContent}
            disabled={!spec.qrEnabled}
            onChange={(e) => setSpec((s) => ({ ...s, qrContent: e.target.value }))}
            placeholder="URL eller tekst til QR"
          />
        </div>

        <div className="field">
          <div className="toggle-row">
            <input
              id="barcodeEnabled"
              type="checkbox"
              checked={spec.barcodeEnabled}
              onChange={(e) =>
                setSpec((s) => ({ ...s, barcodeEnabled: e.target.checked }))
              }
            />
            <label htmlFor="barcodeEnabled">Stregkode (Code128)</label>
          </div>
          <input
            type="text"
            value={spec.barcodeContent}
            disabled={!spec.barcodeEnabled}
            onChange={(e) =>
              setSpec((s) => ({ ...s, barcodeContent: e.target.value }))
            }
            placeholder="Indhold til Code128"
          />
        </div>

        <div className="toggle-row">
          <input
            id="autoCut"
            type="checkbox"
            checked={autoCut}
            onChange={(e) => setAutoCut(e.target.checked)}
          />
          <label htmlFor="autoCut">Klip efter print</label>
        </div>

        <div className="actions">
          {!printerName ? (
            <button
              className="btn"
              type="button"
              disabled={!support.ok || busy !== null}
              onClick={onConnect}
            >
              {busy === 'connect' ? 'Forbinder…' : 'Forbind printer'}
            </button>
          ) : (
            <button
              className="btn btn-secondary"
              type="button"
              disabled={busy !== null}
              onClick={onDisconnect}
            >
              Afbryd ({printerName})
            </button>
          )}
          <button
            className="btn btn-tape"
            type="button"
            disabled={!printerName || !composed || busy !== null}
            onClick={onPrint}
          >
            {busy === 'print' ? 'Printer…' : 'Print'}
          </button>
        </div>

        {status && <p className={`status ${statusKind ?? ''}`}>{status}</p>}

        {!support.ok && (
          <div className="notice">
            Browserkrav
            <ul>
              {support.issues.map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}
