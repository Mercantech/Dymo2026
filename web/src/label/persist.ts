import {
  DEFAULT_MIN_LENGTH_MM,
  DEFAULT_PAD_MM,
  type LabelSpec,
  type LogoMode,
} from './types'

const STORAGE_KEY = 'dymotag:last-label'

export type SavedLabel = {
  spec: LabelSpec
  copies: number
  autoCut: boolean
  savedAt: number
}

export function normalizeLabelSpec(raw: unknown): LabelSpec | null {
  if (!raw || typeof raw !== 'object') return null
  const v = raw as Record<string, unknown>
  if (typeof v.text !== 'string' || typeof v.fontSize !== 'number') return null

  const logoMode: LogoMode = v.logoMode === 'dither' ? 'dither' : 'hard'
  const threshold =
    typeof v.logoThreshold === 'number' && Number.isFinite(v.logoThreshold)
      ? Math.min(0.95, Math.max(0.05, v.logoThreshold))
      : 0.45
  const padMm =
    typeof v.padMm === 'number' && Number.isFinite(v.padMm)
      ? Math.min(20, Math.max(0, v.padMm))
      : DEFAULT_PAD_MM
  const minLengthMm =
    typeof v.minLengthMm === 'number' && Number.isFinite(v.minLengthMm)
      ? Math.min(120, Math.max(15, v.minLengthMm))
      : DEFAULT_MIN_LENGTH_MM

  return {
    text: v.text,
    fontSize: v.fontSize,
    qrEnabled: Boolean(v.qrEnabled),
    qrContent: typeof v.qrContent === 'string' ? v.qrContent : '',
    barcodeEnabled: Boolean(v.barcodeEnabled),
    barcodeContent: typeof v.barcodeContent === 'string' ? v.barcodeContent : '',
    logoEnabled: Boolean(v.logoEnabled),
    logoDataUrl:
      v.logoDataUrl === null || typeof v.logoDataUrl === 'string'
        ? (v.logoDataUrl as string | null)
        : null,
    logoInvert: Boolean(v.logoInvert),
    logoThreshold: threshold,
    logoMode,
    padMm,
    minLengthMm,
  }
}

export function loadSavedLabel(): SavedLabel | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return null
    const obj = parsed as Record<string, unknown>
    const spec = normalizeLabelSpec(obj.spec)
    if (!spec) return null
    return {
      spec,
      copies: Math.max(1, Math.min(20, Number(obj.copies) || 1)),
      autoCut: obj.autoCut !== false,
      savedAt: typeof obj.savedAt === 'number' ? obj.savedAt : Date.now(),
    }
  } catch {
    return null
  }
}

export function saveLabel(spec: LabelSpec, copies: number, autoCut: boolean): boolean {
  const payload: SavedLabel = {
    spec,
    copies: Math.max(1, Math.min(20, copies)),
    autoCut,
    savedAt: Date.now(),
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
    return true
  } catch {
    if (spec.logoDataUrl) {
      try {
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({
            ...payload,
            spec: { ...spec, logoDataUrl: null, logoEnabled: false },
          } satisfies SavedLabel),
        )
        return true
      } catch {
        return false
      }
    }
    return false
  }
}
