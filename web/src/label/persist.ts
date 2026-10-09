import type { LabelSpec } from './types'

const STORAGE_KEY = 'dymotag:last-label'

export type SavedLabel = {
  spec: LabelSpec
  copies: number
  autoCut: boolean
  savedAt: number
}

function isLabelSpec(value: unknown): value is LabelSpec {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  return (
    typeof v.text === 'string' &&
    typeof v.fontSize === 'number' &&
    typeof v.qrEnabled === 'boolean' &&
    typeof v.qrContent === 'string' &&
    typeof v.barcodeEnabled === 'boolean' &&
    typeof v.barcodeContent === 'string' &&
    typeof v.logoEnabled === 'boolean' &&
    (v.logoDataUrl === null || typeof v.logoDataUrl === 'string') &&
    typeof v.logoInvert === 'boolean'
  )
}

export function loadSavedLabel(): SavedLabel | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return null
    const obj = parsed as Record<string, unknown>
    if (!isLabelSpec(obj.spec)) return null
    return {
      spec: obj.spec,
      copies: Math.max(1, Math.min(20, Number(obj.copies) || 1)),
      autoCut: obj.autoCut !== false,
      savedAt: typeof obj.savedAt === 'number' ? obj.savedAt : Date.now(),
    }
  } catch {
    return null
  }
}

/** Persist latest label in this browser. Returns false if storage is full. */
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
    // Quota — retry without logo data URL
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
