export type LabelSpec = {
  text: string
  fontSize: number
  qrEnabled: boolean
  qrContent: string
  barcodeEnabled: boolean
  barcodeContent: string
}

export const HEAD_ROWS = 32
/** Minimum feed columns to avoid LT-200B silent-reject quirk. */
export const MIN_FEED_COLUMNS = 40
export const H_PAD = 4
export const GAP = 4
