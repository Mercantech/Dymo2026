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
/** Minimum feed length so labels aren't tiny stubs. */
export const MIN_FEED_COLUMNS = 160
export const H_PAD = 20
export const GAP = 10
