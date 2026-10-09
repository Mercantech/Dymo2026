import JsBarcode from 'jsbarcode'
import QRCode from 'qrcode'
import type { RawImageData } from '@mbtech-nl/bitmap'
import {
  GAP,
  HEAD_ROWS,
  H_PAD,
  MIN_FEED_COLUMNS,
  PRINTABLE_ROWS,
  type LabelSpec,
} from './types'

const PREVIEW_SCALE = 8

export type ComposeResult = {
  /** Head-aligned for LT driver: width = across head, height = feed. */
  image: RawImageData
  previewDataUrl: string
  widthPx: number
  heightPx: number
}

function canvasToRaw(canvas: HTMLCanvasElement): RawImageData {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('Canvas 2D ikke tilgængelig')
  const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height)
  return { width, height, data: new Uint8Array(data.buffer.slice(0)) }
}

/** Landscape (feed × head) → portrait head-aligned (head × feed) for printer.print. */
function landscapeToHeadAligned(land: RawImageData): RawImageData {
  const W = land.width
  const H = land.height
  const outW = H
  const outH = W
  const out = new Uint8Array(outW * outH * 4)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      // 90° CW: (x,y) → (H-1-y, x)
      const nx = H - 1 - y
      const ny = x
      const si = (y * W + x) * 4
      const di = (ny * outW + nx) * 4
      out[di] = land.data[si]!
      out[di + 1] = land.data[si + 1]!
      out[di + 2] = land.data[si + 2]!
      out[di + 3] = 255
    }
  }
  return { width: outW, height: outH, data: out }
}

/** Crisp QR: integer module pixels, no anti-alias downsample mush. */
function makeQrCanvas(content: string, maxSide: number): HTMLCanvasElement {
  const qr = QRCode.create(content, { errorCorrectionLevel: 'M' })
  const size = qr.modules.size
  const modulePx = Math.max(1, Math.floor(maxSide / size))
  const px = modulePx * size
  const canvas = document.createElement('canvas')
  canvas.width = px
  canvas.height = px
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D ikke tilgængelig')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, px, px)
  ctx.fillStyle = '#000000'
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (qr.modules.get(r, c)) {
        ctx.fillRect(c * modulePx, r * modulePx, modulePx, modulePx)
      }
    }
  }
  return canvas
}

function makeBarcodeCanvas(content: string, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  JsBarcode(canvas, content, {
    format: 'CODE128',
    displayValue: false,
    margin: 0,
    height,
    width: 2,
    background: '#ffffff',
    lineColor: '#000000',
  })
  return canvas
}

function measureTextWidth(text: string, fontSize: number): number {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) return text.length * fontSize * 0.55
  ctx.font = `700 ${fontSize}px "IBM Plex Sans", sans-serif`
  return Math.ceil(ctx.measureText(text).width)
}

function upscalePreview(src: HTMLCanvasElement, scale: number): string {
  const out = document.createElement('canvas')
  out.width = src.width * scale
  out.height = src.height * scale
  const ctx = out.getContext('2d')
  if (!ctx) return src.toDataURL('image/png')
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(src, 0, 0, out.width, out.height)
  return out.toDataURL('image/png')
}

/**
 * Build label at native 32-row print resolution (landscape draft),
 * then rotate to head-aligned portrait for the LT-200B driver.
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

  // Fill most of the printable tape height
  const fontSize = Math.max(14, Math.min(30, Math.round(spec.fontSize)))
  const qrSize = PRINTABLE_ROWS
  const barcodeHeight = PRINTABLE_ROWS - 2

  let qrCanvas: HTMLCanvasElement | null = null
  let barcodeCanvas: HTMLCanvasElement | null = null

  if (showQr) qrCanvas = makeQrCanvas(qrContent, qrSize)
  if (showBarcode) barcodeCanvas = makeBarcodeCanvas(barcodeContent, barcodeHeight)

  const textWidth = showText ? measureTextWidth(text, fontSize) : 0
  const qrWidth = qrCanvas?.width ?? 0
  const barcodeWidth = barcodeCanvas?.width ?? 0

  const parts: number[] = []
  if (showText) parts.push(textWidth)
  if (showQr) parts.push(qrWidth)
  if (showBarcode) parts.push(barcodeWidth)
  const contentWidth =
    parts.reduce((a, b) => a + b, 0) + GAP * Math.max(0, parts.length - 1)

  const width = Math.max(MIN_FEED_COLUMNS, contentWidth + H_PAD * 2)

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = HEAD_ROWS
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D ikke tilgængelig')

  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, width, HEAD_ROWS)
  ctx.fillStyle = '#000000'
  ctx.imageSmoothingEnabled = false

  let x = H_PAD

  if (showText) {
    ctx.font = `700 ${fontSize}px "IBM Plex Sans", sans-serif`
    ctx.textBaseline = 'middle'
    // Snap to pixel grid for sharper thermal output
    ctx.fillText(text, Math.round(x), Math.round(HEAD_ROWS / 2))
    x += textWidth + GAP
  }

  if (qrCanvas) {
    const y = Math.floor((HEAD_ROWS - qrCanvas.height) / 2)
    ctx.drawImage(qrCanvas, Math.round(x), y)
    x += qrCanvas.width + GAP
  }

  if (barcodeCanvas) {
    const y = Math.floor((HEAD_ROWS - barcodeCanvas.height) / 2)
    ctx.drawImage(barcodeCanvas, Math.round(x), y)
  }

  const landscape = canvasToRaw(canvas)
  const image = landscapeToHeadAligned(landscape)
  const previewDataUrl = upscalePreview(canvas, PREVIEW_SCALE)

  return {
    image,
    previewDataUrl,
    widthPx: canvas.width * PREVIEW_SCALE,
    heightPx: canvas.height * PREVIEW_SCALE,
  }
}
