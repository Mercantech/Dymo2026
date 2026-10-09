import JsBarcode from 'jsbarcode'
import QRCode from 'qrcode'
import type { RawImageData } from '@mbtech-nl/bitmap'
import {
  ASPECT,
  GAP,
  HEAD_ROWS,
  H_PAD,
  MIN_FEED_COLUMNS,
  PRINTABLE_ROWS,
  type LabelSpec,
} from './types'

const PREVIEW_SCALE = 6

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

/** Landscape (feed × head) → portrait head-aligned (head × feed). */
function landscapeToHeadAligned(land: RawImageData): RawImageData {
  const W = land.width
  const H = land.height
  const outW = H
  const outH = W
  const out = new Uint8Array(outW * outH * 4)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
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

/**
 * Physically square QR: `sideHead` dots across tape, `sideFeed` along tape
 * so mm matches on both axes (feed DPI ≫ head DPI).
 */
function makeQrCanvas(content: string, sideHead: number): HTMLCanvasElement {
  const qr = QRCode.create(content, { errorCorrectionLevel: 'M' })
  const n = qr.modules.size
  const moduleHead = Math.max(1, Math.floor(sideHead / n))
  const headPx = moduleHead * n
  const feedPx = Math.max(headPx, Math.round(headPx * ASPECT))
  // Integer module size on feed axis so modules stay sharp
  const moduleFeed = Math.max(1, Math.round(feedPx / n))
  const width = moduleFeed * n
  const height = headPx

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D ikke tilgængelig')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, width, height)
  ctx.fillStyle = '#000000'
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (qr.modules.get(r, c)) {
        ctx.fillRect(c * moduleFeed, r * moduleHead, moduleFeed, moduleHead)
      }
    }
  }
  return canvas
}

function makeBarcodeCanvas(content: string, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  // Bar width in feed dots — thicker so codes aren't hairlines at 200 dpi
  const barWidth = Math.max(2, Math.round(ASPECT))
  JsBarcode(canvas, content, {
    format: 'CODE128',
    displayValue: false,
    margin: 0,
    height,
    width: barWidth,
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
  // Logical width in head-dots; feed width = logical * ASPECT
  return Math.ceil(ctx.measureText(text).width * ASPECT)
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
 * Native 32-row landscape draft with feed-axis aspect correction,
 * then rotate to head-aligned portrait for printer.print (rotate: 0).
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

  const fontSize = Math.max(16, Math.min(30, Math.round(spec.fontSize)))
  const pad = Math.round(H_PAD * ASPECT)
  const gap = Math.round(GAP * ASPECT)

  let qrCanvas: HTMLCanvasElement | null = null
  let barcodeCanvas: HTMLCanvasElement | null = null

  if (showQr) qrCanvas = makeQrCanvas(qrContent, PRINTABLE_ROWS)
  if (showBarcode) barcodeCanvas = makeBarcodeCanvas(barcodeContent, PRINTABLE_ROWS - 2)

  const textWidth = showText ? measureTextWidth(text, fontSize) : 0
  const qrWidth = qrCanvas?.width ?? 0
  const barcodeWidth = barcodeCanvas?.width ?? 0

  const parts: number[] = []
  if (showText) parts.push(textWidth)
  if (showQr) parts.push(qrWidth)
  if (showBarcode) parts.push(barcodeWidth)
  const contentWidth =
    parts.reduce((a, b) => a + b, 0) + gap * Math.max(0, parts.length - 1)

  const width = Math.max(MIN_FEED_COLUMNS, contentWidth + pad * 2)

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = HEAD_ROWS
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D ikke tilgængelig')

  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, width, HEAD_ROWS)
  ctx.fillStyle = '#000000'
  ctx.imageSmoothingEnabled = false

  let x = pad

  if (showText) {
    // Draw in head-dot font size, stretch horizontally to match feed DPI
    ctx.save()
    ctx.translate(x, HEAD_ROWS / 2)
    ctx.scale(ASPECT, 1)
    ctx.font = `700 ${fontSize}px "IBM Plex Sans", sans-serif`
    ctx.textBaseline = 'middle'
    ctx.fillText(text, 0, 0)
    ctx.restore()
    x += textWidth + gap
  }

  if (qrCanvas) {
    const y = Math.floor((HEAD_ROWS - qrCanvas.height) / 2)
    ctx.drawImage(qrCanvas, Math.round(x), y)
    x += qrCanvas.width + gap
  }

  if (barcodeCanvas) {
    const y = Math.floor((HEAD_ROWS - barcodeCanvas.height) / 2)
    ctx.drawImage(barcodeCanvas, Math.round(x), y)
  }

  const landscape = canvasToRaw(canvas)
  const image = landscapeToHeadAligned(landscape)

  return {
    image,
    previewDataUrl: upscalePreview(canvas, PREVIEW_SCALE),
    widthPx: canvas.width * PREVIEW_SCALE,
    heightPx: canvas.height * PREVIEW_SCALE,
  }
}
