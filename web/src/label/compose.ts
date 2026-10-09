import JsBarcode from 'jsbarcode'
import QRCode from 'qrcode'
import type { RawImageData } from '@mbtech-nl/bitmap'
import { GAP, HEAD_ROWS, H_PAD, MIN_FEED_COLUMNS, type LabelSpec } from './types'

/** Render at high res, then threshold-downsample to 32 head rows for print. */
const SCALE = 8

export type ComposeResult = {
  image: RawImageData
  previewDataUrl: string
  widthPx: number
  heightPx: number
}

async function makeQrCanvas(content: string, size: number): Promise<HTMLCanvasElement> {
  const canvas = document.createElement('canvas')
  await QRCode.toCanvas(canvas, content, {
    errorCorrectionLevel: 'M',
    margin: 1,
    width: size,
    color: { dark: '#000000', light: '#ffffff' },
  })
  return canvas
}

function makeBarcodeCanvas(content: string, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  JsBarcode(canvas, content, {
    format: 'CODE128',
    displayValue: false,
    margin: 0,
    height,
    width: Math.max(1, SCALE * 0.35),
    background: '#ffffff',
    lineColor: '#000000',
  })
  return canvas
}

function measureTextWidth(text: string, fontSize: number): number {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) return text.length * fontSize * 0.6
  ctx.font = `700 ${fontSize}px "IBM Plex Sans", sans-serif`
  return Math.ceil(ctx.measureText(text).width)
}

/** Threshold high-res RGBA → 32-row print bitmap (1:1 with print head). */
function downsampleToPrint(hi: HTMLCanvasElement): RawImageData {
  const srcCtx = hi.getContext('2d', { willReadFrequently: true })
  if (!srcCtx) throw new Error('Canvas 2D ikke tilgængelig')
  const src = srcCtx.getImageData(0, 0, hi.width, hi.height)
  const outW = Math.max(1, Math.round(hi.width / SCALE))
  const outH = HEAD_ROWS
  const data = new Uint8Array(outW * outH * 4)

  for (let y = 0; y < outH; y++) {
    for (let x = 0; x < outW; x++) {
      let sum = 0
      let count = 0
      const x0 = x * SCALE
      const y0 = y * SCALE
      const x1 = Math.min(hi.width, x0 + SCALE)
      const y1 = Math.min(hi.height, y0 + SCALE)
      for (let py = y0; py < y1; py++) {
        for (let px = x0; px < x1; px++) {
          const i = (py * hi.width + px) * 4
          // BT.709 luminance
          sum += 0.2126 * src.data[i]! + 0.7152 * src.data[i + 1]! + 0.0722 * src.data[i + 2]!
          count++
        }
      }
      const lum = count ? sum / count : 255
      const black = lum < 160
      const o = (y * outW + x) * 4
      data[o] = data[o + 1] = data[o + 2] = black ? 0 : 255
      data[o + 3] = 255
    }
  }

  return { width: outW, height: outH, data }
}

/**
 * Build a label: hi-res preview + 32-row print bitmap.
 */
export async function composeLabel(spec: LabelSpec): Promise<ComposeResult> {
  const text = spec.text.trim()
  const qrContent = spec.qrContent.trim()
  const barcodeContent = spec.barcodeContent.trim()

  const showText = text.length > 0
  const showQr = spec.qrEnabled && qrContent.length > 0
  const showBarcode = spec.barcodeEnabled && barcodeContent.length > 0

  if (!showText && !showQr && !showBarcode) {
    throw new Error('Tilføj tekst, QR eller stregkode')
  }

  const fontSizeHi = Math.max(10, Math.min(28, Math.round(spec.fontSize))) * SCALE
  const headHi = HEAD_ROWS * SCALE
  const qrSize = headHi - 2 * SCALE
  const barcodeHeight = headHi - 4 * SCALE
  const gap = GAP * SCALE
  const hPad = H_PAD * SCALE
  const minWidth = MIN_FEED_COLUMNS * SCALE

  let qrCanvas: HTMLCanvasElement | null = null
  let barcodeCanvas: HTMLCanvasElement | null = null

  if (showQr) qrCanvas = await makeQrCanvas(qrContent, qrSize)
  if (showBarcode) barcodeCanvas = makeBarcodeCanvas(barcodeContent, barcodeHeight)

  const textWidth = showText ? measureTextWidth(text, fontSizeHi) : 0
  const qrWidth = qrCanvas?.width ?? 0
  const barcodeWidth = barcodeCanvas?.width ?? 0

  const parts: number[] = []
  if (showText) parts.push(textWidth)
  if (showQr) parts.push(qrWidth)
  if (showBarcode) parts.push(barcodeWidth)
  const contentWidth =
    parts.reduce((a, b) => a + b, 0) + gap * Math.max(0, parts.length - 1)

  const width = Math.max(minWidth, contentWidth + hPad * 2)

  const hi = document.createElement('canvas')
  hi.width = width
  hi.height = headHi
  const ctx = hi.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D ikke tilgængelig')

  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, width, headHi)
  ctx.fillStyle = '#000000'
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'

  let x = hPad

  if (showText) {
    ctx.font = `700 ${fontSizeHi}px "IBM Plex Sans", sans-serif`
    ctx.textBaseline = 'middle'
    ctx.fillText(text, x, headHi / 2)
    x += textWidth + gap
  }

  if (qrCanvas) {
    const y = Math.floor((headHi - qrCanvas.height) / 2)
    ctx.drawImage(qrCanvas, x, y)
    x += qrCanvas.width + gap
  }

  if (barcodeCanvas) {
    const y = Math.floor((headHi - barcodeCanvas.height) / 2)
    ctx.drawImage(barcodeCanvas, x, y)
  }

  const image = downsampleToPrint(hi)
  const previewDataUrl = hi.toDataURL('image/png')

  return {
    image,
    previewDataUrl,
    widthPx: hi.width,
    heightPx: hi.height,
  }
}
