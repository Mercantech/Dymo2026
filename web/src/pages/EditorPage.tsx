import { useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import {
  deletePrintJob,
  fetchPrintHistory,
  savePrintJob,
  type PrintJobDto,
} from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { composeLabel, type ComposeResult } from '../label/compose'
import { loadSavedLabel, normalizeLabelSpec, saveLabel } from '../label/persist'
import {
  DEFAULT_MIN_LENGTH_MM,
  DEFAULT_PAD_MM,
  type LabelSpec,
} from '../label/types'
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
  logoThreshold: 0.45,
  logoMode: 'hard',
  padMm: DEFAULT_PAD_MM,
  minLengthMm: DEFAULT_MIN_LENGTH_MM,
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

export function EditorPage() {
  const { loggedIn, displayName, logout, isAdmin } = useAuth()

  const [spec, setSpec] = useState<LabelSpec>(INITIAL?.spec ?? DEFAULT_SPEC)
  const [composed, setComposed] = useState<ComposeResult | null>(null)
  const [composeError, setComposeError] = useState<string | null>(null)
  const [printerName, setPrinterName] = useState<string | null>(getConnectedName())
  const [copies, setCopies] = useState(INITIAL?.copies ?? 1)
  const [autoCut, setAutoCut] = useState(INITIAL?.autoCut ?? true)
  const [busy, setBusy] = useState<'connect' | 'print' | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [statusKind, setStatusKind] = useState<'ok' | 'error' | null>(null)
  const [history, setHistory] = useState<PrintJobDto[]>([])
  const [historyError, setHistoryError] = useState<string | null>(null)

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

  async function reloadHistory() {
    try {
      const items = await fetchPrintHistory()
      setHistory(items)
      setHistoryError(null)
    } catch (e) {
      setHistoryError(e instanceof Error ? e.message : 'Historik utilgængelig')
    }
  }

  useEffect(() => {
    if (!loggedIn) return
    void reloadHistory()
  }, [loggedIn])

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
      try {
        await savePrintJob({
          specJson: JSON.stringify(spec),
          previewDataUrl: composed.historyPreviewDataUrl,
          copies,
          autoCut,
        })
        await reloadHistory()
      } catch {
        // Print succeeded — history is best-effort
      }
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

  function reuseJob(job: PrintJobDto) {
    try {
      const parsed = JSON.parse(job.specJson) as unknown
      const next = normalizeLabelSpec(parsed)
      if (!next) throw new Error('Ugyldig historik-post')
      setSpec(next)
      setCopies(job.copies)
      setAutoCut(job.autoCut)
      setStatus('Hentet fra historik')
      setStatusKind('ok')
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (e) {
      setStatus(e instanceof Error ? e.message : 'Kunne ikke genbruge')
      setStatusKind('error')
    }
  }

  async function removeJob(id: string) {
    try {
      await deletePrintJob(id)
      setHistory((h) => h.filter((x) => x.id !== id))
    } catch (e) {
      setStatus(e instanceof Error ? e.message : 'Sletning fejlede')
      setStatusKind('error')
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
          {isAdmin && (
            <Link className="btn btn-ghost" to="/admin">
              Admin
            </Link>
          )}
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

        <div className="row">
          <div className="field">
            <label htmlFor="padMm">Margin (mm)</label>
            <input
              id="padMm"
              type="number"
              min={0}
              max={20}
              step={0.5}
              value={spec.padMm}
              onChange={(e) =>
                setSpec((s) => ({
                  ...s,
                  padMm: Math.min(20, Math.max(0, Number(e.target.value) || 0)),
                }))
              }
            />
          </div>
          <div className="field">
            <label htmlFor="minLengthMm">Min. længde (mm)</label>
            <input
              id="minLengthMm"
              type="number"
              min={15}
              max={120}
              step={1}
              value={spec.minLengthMm}
              onChange={(e) =>
                setSpec((s) => ({
                  ...s,
                  minLengthMm: Math.min(
                    120,
                    Math.max(15, Number(e.target.value) || DEFAULT_MIN_LENGTH_MM),
                  ),
                }))
              }
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
            <>
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
                    setSpec((s) => ({
                      ...s,
                      logoDataUrl: null,
                      logoEnabled: false,
                    }))
                  }
                >
                  Fjern
                </button>
              </div>
              <div className="field" style={{ marginTop: '0.5rem' }}>
                <label htmlFor="logoThreshold">
                  Tærskel ({Math.round(spec.logoThreshold * 100)}%)
                </label>
                <input
                  id="logoThreshold"
                  type="range"
                  min={5}
                  max={95}
                  value={Math.round(spec.logoThreshold * 100)}
                  disabled={!spec.logoEnabled}
                  onChange={(e) =>
                    setSpec((s) => ({
                      ...s,
                      logoThreshold: Number(e.target.value) / 100,
                    }))
                  }
                />
              </div>
              <div className="field">
                <label htmlFor="logoMode">Rasterisering</label>
                <select
                  id="logoMode"
                  disabled={!spec.logoEnabled}
                  value={spec.logoMode}
                  onChange={(e) =>
                    setSpec((s) => ({
                      ...s,
                      logoMode: e.target.value === 'dither' ? 'dither' : 'hard',
                    }))
                  }
                >
                  <option value="hard">Hård (skarpe logoer)</option>
                  <option value="dither">Dither (fotos/gråtoner)</option>
                </select>
              </div>
            </>
          )}
          <p className="hint">
            Konverteres til sort/hvid. Juster tærskel eller brug dither til fotos.
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

      <section className="history" aria-label="Printhistorik">
        <div className="history-head">
          <h2>Din historik</h2>
          <p className="hint">Seneste 20 prints på denne konto — klik for at genbruge.</p>
        </div>
        {historyError && <p className="status error">{historyError}</p>}
        {!historyError && history.length === 0 && (
          <p className="hint">Ingen gemte prints endnu.</p>
        )}
        <ul className="history-list">
          {history.map((job) => (
            <li key={job.id} className="history-item">
              <button
                type="button"
                className="history-preview-btn"
                onClick={() => reuseJob(job)}
              >
                <img src={job.previewDataUrl} alt="" />
                <span>
                  <strong>{job.title}</strong>
                  <small>
                    {formatWhen(job.createdAt)}
                    {job.copies > 1 ? ` · ${job.copies}×` : ''}
                  </small>
                </span>
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => void removeJob(job.id)}
              >
                Slet
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
