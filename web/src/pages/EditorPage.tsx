import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { composeLabel, type ComposeResult } from '../label/compose'
import { loadSavedLabel, saveLabel } from '../label/persist'
import type { LabelSpec } from '../label/types'
import { formatBluetoothError } from '../printer/browser'
import {
  connectPrinter,
  disconnectPrinter,
  getConnectedName,
  printLabel,
  tryAutoConnect,
} from '../printer/session'

const DEFAULT_SPEC: LabelSpec = {
  text: 'Hello DymoTag',
  fontSize: 28,
  qrEnabled: false,
  qrContent: 'https://dymo.mercantec.tech',
  barcodeEnabled: false,
  barcodeContent: 'DYMO2026',
  logoEnabled: false,
  logoDataUrl: null,
  logoInvert: false,
}

const INITIAL = loadSavedLabel()

const MAX_LOGO_BYTES = 2_000_000

function readLogoFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('Vælg et billede (PNG, JPEG, WebP eller SVG)'))
      return
    }
    if (file.size > MAX_LOGO_BYTES) {
      reject(new Error('Billedet er for stort (max 2 MB)'))
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result)
      else reject(new Error('Kunne ikke læse filen'))
    }
    reader.onerror = () => reject(new Error('Kunne ikke læse filen'))
    reader.readAsDataURL(file)
  })
}

export function EditorPage() {
  const { loggedIn, displayName, logout } = useAuth()

  const [spec, setSpec] = useState<LabelSpec>(INITIAL?.spec ?? DEFAULT_SPEC)
  const [composed, setComposed] = useState<ComposeResult | null>(null)
  const [composeError, setComposeError] = useState<string | null>(null)
  const [printerName, setPrinterName] = useState<string | null>(getConnectedName())
  const [copies, setCopies] = useState(INITIAL?.copies ?? 1)
  const [autoCut, setAutoCut] = useState(INITIAL?.autoCut ?? true)
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

  // Autosave draft + last print settings in this browser
  useEffect(() => {
    const timer = window.setTimeout(() => {
      saveLabel(spec, copies, autoCut)
    }, 300)
    return () => window.clearTimeout(timer)
  }, [spec, copies, autoCut])

  useEffect(() => {
    let cancelled = false
    void tryAutoConnect().then((name) => {
      if (cancelled || !name) return
      setPrinterName(name)
      setStatus(`Forbundet: ${name}`)
      setStatusKind('ok')
    })
    return () => {
      cancelled = true
    }
  }, [])

  if (!loggedIn) return <Navigate to="/login" replace />

  async function onConnect(forcePicker = false) {
    setBusy('connect')
    setStatus(null)
    setStatusKind(null)
    try {
      const name = await connectPrinter({ forcePicker })
      setPrinterName(name)
      setStatus(`Forbundet: ${name}`)
      setStatusKind('ok')
    } catch (e) {
      setPrinterName(null)
      setStatus(formatBluetoothError(e))
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
      saveLabel(spec, copies, autoCut)
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
          <p className="lede">12 mm LetraTag — tekst, logo, QR og Code128.</p>
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
              min={16}
              max={30}
              value={spec.fontSize}
              onChange={(e) =>
                setSpec((s) => ({ ...s, fontSize: Number(e.target.value) || 28 }))
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
              id="logoEnabled"
              type="checkbox"
              checked={spec.logoEnabled}
              onChange={(e) => setSpec((s) => ({ ...s, logoEnabled: e.target.checked }))}
            />
            <label htmlFor="logoEnabled">Logo / billede</label>
          </div>
          <input
            id="logoFile"
            type="file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
            disabled={!spec.logoEnabled}
            onChange={(e) => {
              const file = e.target.files?.[0]
              e.target.value = ''
              if (!file) return
              void readLogoFile(file)
                .then((dataUrl) => {
                  setSpec((s) => ({
                    ...s,
                    logoEnabled: true,
                    logoDataUrl: dataUrl,
                  }))
                  setStatus(null)
                  setStatusKind(null)
                })
                .catch((err: unknown) => {
                  setStatus(err instanceof Error ? err.message : 'Upload fejlede')
                  setStatusKind('error')
                })
            }}
          />
          {spec.logoDataUrl && (
            <div className="toggle-row" style={{ marginTop: '0.5rem' }}>
              <input
                id="logoInvert"
                type="checkbox"
                checked={spec.logoInvert}
                disabled={!spec.logoEnabled}
                onChange={(e) =>
                  setSpec((s) => ({ ...s, logoInvert: e.target.checked }))
                }
              />
              <label htmlFor="logoInvert">Invertér (hvidt logo → sort)</label>
              <button
                className="btn btn-ghost"
                type="button"
                style={{ marginLeft: 'auto' }}
                disabled={!spec.logoEnabled}
                onClick={() =>
                  setSpec((s) => ({ ...s, logoDataUrl: null, logoEnabled: false }))
                }
              >
                Fjern
              </button>
            </div>
          )}
          <p className="hint">
            Konverteres til sort/hvid. Bedst med skarpe, ensfarvede logoer.
          </p>
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
              disabled={busy !== null}
              onClick={() => void onConnect(false)}
            >
              {busy === 'connect' ? 'Forbinder…' : 'Forbind printer'}
            </button>
          ) : (
            <>
              <button
                className="btn btn-secondary"
                type="button"
                disabled={busy !== null}
                onClick={() => void onDisconnect()}
              >
                Afbryd ({printerName})
              </button>
              <button
                className="btn btn-ghost"
                type="button"
                disabled={busy !== null}
                onClick={() => void onConnect(true)}
              >
                Vælg anden
              </button>
            </>
          )}
          <button
            className="btn btn-tape"
            type="button"
            disabled={!printerName || !composed || busy !== null}
            onClick={() => void onPrint()}
          >
            {busy === 'print' ? 'Printer…' : 'Print'}
          </button>
        </div>

        {statusKind === 'error' && status && (
          <p className="status error">{status}</p>
        )}
        {statusKind === 'ok' && status && <p className="status ok">{status}</p>}
      </div>
    </div>
  )
}
