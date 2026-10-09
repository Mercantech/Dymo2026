export type LogoMode = 'hard' | 'dither'

export type LabelSpec = {
  text: string
  fontSize: number
  qrEnabled: boolean
  qrContent: string
  barcodeEnabled: boolean
  barcodeContent: string
  /** PNG/JPEG/WebP/SVG as data URL — rasterized to 1bpp. */
  logoEnabled: boolean
  logoDataUrl: string | null
  /** Flip black/white (useful for white logos on transparent). */
  logoInvert: boolean
  /** 0–1: higher = more black from dark/gray pixels. */
  logoThreshold: number
  logoMode: LogoMode
  /** Horizontal padding in mm (each side). */
  padMm: number
  /** Minimum label length in mm. */
  minLengthMm: number
}

/** Protocol head rows (across 12 mm tape). */
export const HEAD_ROWS = 32
/** Usable rows after cassette edge clip. */
export const PRINTABLE_ROWS = 30

/** LT-200B engine feed DPI (from device registry). */
export const DPI_FEED = 200
/** Nominal across-head DPI: 32 dots / 12 mm ≈ 67.7. */
export const DPI_HEAD_NOMINAL = (HEAD_ROWS / 12) * 25.4
/**
 * Feed/head stretch for physically square shapes.
 * Pure math is ~2.95, but cassette clipping makes that a bit oblong on tape.
 * 2.55 is the practical middle (not pancake, not stretched).
 */
export const ASPECT = 2.55

export const DEFAULT_PAD_MM = 2.5
export const DEFAULT_MIN_LENGTH_MM = 25
export const GAP = 3

export function mmToFeedColumns(mm: number): number {
  return Math.max(0, Math.round((mm / 25.4) * DPI_FEED))
}
