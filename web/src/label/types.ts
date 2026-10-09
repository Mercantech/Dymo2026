export type LabelSpec = {
  text: string
  fontSize: number
  qrEnabled: boolean
  qrContent: string
  barcodeEnabled: boolean
  barcodeContent: string
}

/** Protocol head rows (across 12 mm tape). */
export const HEAD_ROWS = 32
/** Usable rows after cassette edge clip. */
export const PRINTABLE_ROWS = 30

/** LT-200B engine feed DPI (from device registry). */
export const DPI_FEED = 200
/** Effective across-head DPI: 32 dots / 12 mm. */
export const DPI_HEAD = (HEAD_ROWS / 12) * 25.4
/**
 * Feed dots per head dot for physically square geometry.
 * (~2.95) — without this, QR looks like a flat pancake on tape.
 */
export const ASPECT = DPI_FEED / DPI_HEAD

/** Minimum physical length ~25 mm. */
export const MIN_FEED_MM = 25
export const MIN_FEED_COLUMNS = Math.round((MIN_FEED_MM / 25.4) * DPI_FEED)

/** Padding / gaps in head-dot units (scaled by ASPECT on the feed axis). */
export const H_PAD = 4
export const GAP = 3
